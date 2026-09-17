/* ================================================================
   CONTEXTO DO PROPRIETÁRIO COM VÁRIOS IMÓVEIS (M2)

   Um dono pode ter quatro imóveis na carteira (caso real: LD-200, LD-201,
   LD-202 e LD-334, mesma pessoa) e a Agenda chegou a programar três
   verificações de disponibilidade para o mesmo telefone. Este módulo só
   RECONHECE e AGRUPA; não cancela, não consolida, não reagenda: isso é dos
   checkpoints seguintes, que lerão o contexto daqui.

   Identidade do proprietário: o app não tem entidade de proprietário.
   `proprietarioNome` é texto livre (os quatro imóveis reais grafam o mesmo
   nome de dois jeitos). A única chave que o sistema já trata como identidade
   confiável é o TELEFONE CANÔNICO: `telefoneCanonico()` (gêmea da função SQL
   `telefone_canonico()`, que alimenta a coluna gerada
   `imoveis.proprietario_telefone_canonico`) é o que o webhook usa para
   descobrir de quem é a resposta e o que a Sophia usa para casar eventos.
   Aqui vale a mesma chave, sempre DENTRO da mesma conta: o par
   `(userId, telefone canônico)` é o proprietário. Imóvel sem telefone
   plausível não se agrupa com ninguém.

   Estado por imóvel continua individual: cada um leva a própria avaliação
   temporal (`calculo/evidenciaDisponibilidade.ts`). Disponibilidade de um
   não vaza para o vizinho; o que se agrupa é a COMUNICAÇÃO com a pessoa.

   Regra que fica preparada para o M3/M4 (não implementada aqui): quando o
   mesmo proprietário tiver mais de uma verificação pendente caindo na mesma
   janela de contato, o worker deve evitar mensagens repetidas, avaliando um
   contato só que cubra os imóveis relevantes. A consolidação não pode apagar
   a granularidade: uma resposta "sim" para vários imóveis não vale para todos
   por padrão; a mensagem consolidada precisa carregar estruturalmente quais
   imóveis estavam sendo perguntados, para cada um ser atualizado sozinho.
   O `ContextoProprietario` abaixo já expõe a lista de imóveis e, por imóvel,
   o estado e as pendências, que é o insumo dessa mensagem.
   ================================================================ */
import type { MensagemAgendada } from "../mensagensAgendadas";
import type { AgendaItem, Imovel } from "../tipos";
import {
  avaliarEvidenciaTemporalDisponibilidade,
  type AgendaItemComCriacao,
  type AvaliacaoTemporalDisponibilidade,
} from "./evidenciaDisponibilidade";
import { telefoneCanonico } from "./webhookWhatsapp";

/** Um imóvel com a conta a que pertence. `Imovel` não carrega `user_id`
    (o store é de uma conta só), então quem chama declara a conta de cada
    linha; no servidor, isso é o `user_id` da própria linha reclamada. */
export interface ImovelDaConta {
  userId: string;
  imovel: Imovel;
}

export type IdentidadeProprietario = "telefone-canonico" | "sem-identidade";

export interface GrupoProprietario {
  /** `${userId}|tel:${canônico}` ou `${userId}|imovel:${id}` quando não há
      telefone plausível. Nunca cruza contas. */
  chave: string;
  userId: string;
  identidade: IdentidadeProprietario;
  telefoneCanonico: string | null;
  /** Nomes distintos gravados nos cadastros do grupo, para exibição. */
  nomes: string[];
  imoveis: Imovel[];
}

export function chaveProprietario(userId: string, imovel: Imovel): Pick<GrupoProprietario, "chave" | "identidade" | "telefoneCanonico"> {
  const canonico = telefoneCanonico(imovel.proprietarioTelefone);
  if (!canonico) {
    return { chave: `${userId}|imovel:${imovel.id}`, identidade: "sem-identidade", telefoneCanonico: null };
  }
  return { chave: `${userId}|tel:${canonico}`, identidade: "telefone-canonico", telefoneCanonico: canonico };
}

/**
 * Agrupa imóveis por proprietário. A ordem dos grupos segue a primeira
 * aparição; dentro do grupo, a ordem de entrada. Nome nunca agrupa.
 */
export function agruparImoveisPorProprietario(itens: ImovelDaConta[]): GrupoProprietario[] {
  const grupos = new Map<string, GrupoProprietario>();
  for (const { userId, imovel } of itens) {
    const identidade = chaveProprietario(userId, imovel);
    let grupo = grupos.get(identidade.chave);
    if (!grupo) {
      grupo = { ...identidade, userId, nomes: [], imoveis: [] };
      grupos.set(identidade.chave, grupo);
    }
    grupo.imoveis.push(imovel);
    const nome = imovel.proprietarioNome?.trim();
    if (nome && !grupo.nomes.includes(nome)) grupo.nomes.push(nome);
  }
  return [...grupos.values()];
}

export interface VerificacaoPendente {
  /** `mensagem`: linha de `mensagens_agendadas` ativa do tipo verificação;
      `lembrete`: item da agenda com `isVerificacaoDisponibilidade` aberto. */
  tipo: "mensagem" | "lembrete";
  id: string;
  imovelId: string;
  /** `data_envio` (ISO com fuso) ou `date` (dia civil), conforme o tipo. */
  quando: string;
}

export interface ImovelNoContexto {
  imovel: Imovel;
  avaliacao: AvaliacaoTemporalDisponibilidade;
  lembretesAbertos: AgendaItem[];
  mensagensPendentes: MensagemAgendada[];
}

export interface ContextoProprietario extends GrupoProprietario {
  porImovel: ImovelNoContexto[];
  verificacoesPendentes: VerificacaoPendente[];
  /** Há mais de uma MENSAGEM de verificação ativa para a mesma pessoa. É o
      sinal que o M3/M4 usará para não repetir contato; aqui é só leitura. */
  contatoDuplicado: boolean;
  resumo: {
    imoveis: number;
    disponiveis: number;
    indisponiveis: number;
    semEvidencia: number;
    conflitantes: number;
    mensagensPendentes: number;
    lembretesAbertos: number;
  };
}

function mensagemAtivaDeVerificacao(mensagem: MensagemAgendada): boolean {
  return mensagem.tipo === "verificacao-disponibilidade"
    && (mensagem.status === "agendada" || mensagem.status === "processando");
}

/**
 * Monta, por proprietário, o que o worker precisará saber antes de falar com
 * a pessoa. Agenda e mensagens podem vir inteiras: cada uma é ligada ao seu
 * imóvel, e uma mensagem só entra se pertencer à MESMA conta do grupo, mesmo
 * que aponte para um imóvel do grupo. Nada aqui altera dado nenhum.
 */
export function contextoDosProprietarios(
  itens: ImovelDaConta[],
  agenda: AgendaItemComCriacao[] = [],
  mensagens: MensagemAgendada[] = [],
): ContextoProprietario[] {
  return agruparImoveisPorProprietario(itens).map((grupo) => {
    const porImovel = grupo.imoveis.map((imovel) => ({
      imovel,
      avaliacao: avaliarEvidenciaTemporalDisponibilidade(imovel, agenda),
      lembretesAbertos: agenda.filter((a) => a.imovelId === imovel.id && a.isVerificacaoDisponibilidade && !a.done),
      mensagensPendentes: mensagens.filter((m) =>
        m.userId === grupo.userId && m.imovelId === imovel.id && mensagemAtivaDeVerificacao(m)),
    }));

    const verificacoesPendentes: VerificacaoPendente[] = porImovel.flatMap((item) => [
      ...item.mensagensPendentes.map((m) => ({
        tipo: "mensagem" as const, id: m.id, imovelId: item.imovel.id, quando: m.dataEnvio,
      })),
      ...item.lembretesAbertos.map((a) => ({
        tipo: "lembrete" as const, id: a.id, imovelId: item.imovel.id, quando: a.date,
      })),
    ]);

    const contar = (estado: AvaliacaoTemporalDisponibilidade["estado"]) =>
      porImovel.filter((item) => item.avaliacao.estado === estado).length;
    const mensagensPendentes = porImovel.reduce((total, item) => total + item.mensagensPendentes.length, 0);
    const lembretesAbertos = porImovel.reduce((total, item) => total + item.lembretesAbertos.length, 0);

    return {
      ...grupo,
      porImovel,
      verificacoesPendentes,
      contatoDuplicado: mensagensPendentes > 1,
      resumo: {
        imoveis: porImovel.length,
        disponiveis: contar("disponivel"),
        indisponiveis: contar("indisponivel"),
        semEvidencia: contar("sem-evidencia"),
        conflitantes: contar("conflitante"),
        mensagensPendentes,
        lembretesAbertos,
      },
    };
  });
}

/**
 * Só os proprietários com alguma verificação pendente (mensagem ativa ou
 * lembrete aberto). É a lista que o M3/M4 percorrerá para decidir contato
 * único; aqui ela apenas existe.
 */
export function agruparVerificacoesPorProprietario(
  itens: ImovelDaConta[],
  agenda: AgendaItemComCriacao[] = [],
  mensagens: MensagemAgendada[] = [],
): ContextoProprietario[] {
  return contextoDosProprietarios(itens, agenda, mensagens)
    .filter((contexto) => contexto.verificacoesPendentes.length > 0);
}
