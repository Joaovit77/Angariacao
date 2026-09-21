/* ================================================================
   EXPLICAÇÃO OPERACIONAL DE UMA MENSAGEM AGENDADA (M5)

   O banco guarda o que aconteceu com uma mensagem em campos estruturados:
   `status`, `cancelamento_motivo`, `reagendada_em`/`data_envio_original`,
   `imoveis_consultados`, `consolidada_em_mensagem_id` e o código de `erro`
   que o worker grava. Este módulo, sem React nem banco, transforma esses
   campos na frase que o corretor lê. Só campos estruturados decidem o
   sentido: o texto da mensagem nunca entra na conta, e uma mensagem
   `livre` recebe apenas o que os seus próprios campos provam.

   Nada aqui é ação. Uma linha em resultado incerto, por exemplo, só ganha
   a orientação de conferir o histórico do imóvel antes de novo contato.
   ================================================================ */
import { fmtDataIso } from "../datas";
import type { MensagemAgendada } from "../mensagensAgendadas";

/** Tom visual do estado, independente do `status` técnico. */
export type TomExplicacao = "pendente" | "andamento" | "ok" | "neutro" | "atencao" | "falha";

export interface ExplicacaoMensagemAgendada {
  /** Rótulo curto do estado, no lugar do status técnico. */
  rotulo: string;
  tom: TomExplicacao;
  /** Frases operacionais, na ordem em que devem aparecer; vazio quando não há o que explicar. */
  detalhes: string[];
  /** A linha foi absorvida por outra mensagem (não saiu separadamente). */
  incluidaEmOutraMensagem: boolean;
  /** Quantos imóveis a mensagem consultou (só quando o dado estruturado existe). */
  imoveisConsultados: number | null;
  /** Reprogramação automática comprovada pelos campos (datas civis). */
  reprogramada: { de: string; para: string } | null;
  /** Detalhe técnico do erro, para áreas administrativas; nunca para a tela normal. */
  tecnico: string | null;
}

export interface ContextoExplicacao {
  /** Código humano (LD-200) de um imóvel da conta; `null` quando não estiver carregado. */
  codigoDoImovel?: (imovelId: string) => string | null;
}

const ORIENTACAO_HISTORICO = "Confira o histórico do imóvel antes de realizar novo contato.";

/** Como o corretor lê o código de erro que o worker grava. Vocabulário
    fechado: a chave é o prefixo estável do código; o que não estiver aqui
    cai no fallback conservador (não afirma envio nem falha). */
export type FamiliaErro = "nao-enviada" | "falha-envio" | "incerto" | "registro-incompleto";

interface TraducaoErro { familia: FamiliaErro; texto: string }

const ERROS: Array<{ prefixo: string; traducao: TraducaoErro }> = [
  { prefixo: "consolidacao-resultado-incerto", traducao: { familia: "incerto", texto: `Não foi possível confirmar se a mensagem foi enviada. ${ORIENTACAO_HISTORICO}` } },
  { prefixo: "consolidacao-interrompida", traducao: { familia: "incerto", texto: `O envio foi interrompido antes de ser confirmado. ${ORIENTACAO_HISTORICO}` } },
  { prefixo: "processamento-interrompido", traducao: { familia: "incerto", texto: `O envio foi interrompido antes de ser confirmado. ${ORIENTACAO_HISTORICO}` } },
  { prefixo: "efetivacao-falhou", traducao: { familia: "registro-incompleto", texto: "A mensagem foi enviada, mas o registro não pôde ser concluído. Confira o histórico do imóvel." } },
  { prefixo: "janela-expirada", traducao: { familia: "nao-enviada", texto: "Não foi enviada: o horário programado passou sem que o sistema conseguisse enviar." } },
  { prefixo: "revalidacao-falhou", traducao: { familia: "nao-enviada", texto: "Não foi enviada: não foi possível conferir a situação do imóvel antes do envio." } },
  { prefixo: "releitura-falhou", traducao: { familia: "nao-enviada", texto: "Não foi enviada: falha temporária ao conferir a mensagem antes do envio." } },
  { prefixo: "transicao-falhou", traducao: { familia: "nao-enviada", texto: "Não foi enviada: a mensagem precisava ser cancelada ou reprogramada e o sistema não conseguiu concluir isso." } },
  { prefixo: "sem-instancia", traducao: { familia: "nao-enviada", texto: "Não foi enviada: o WhatsApp conectado não estava disponível." } },
  { prefixo: "instancia-", traducao: { familia: "nao-enviada", texto: "Não foi enviada: o WhatsApp conectado não estava disponível." } },
  { prefixo: "numero-invalido", traducao: { familia: "nao-enviada", texto: "Não foi enviada: o telefone do proprietário é inválido." } },
  { prefixo: "evolution-http-", traducao: { familia: "falha-envio", texto: "Falha ao enviar a mensagem." } },
];

const FALLBACK_ERRO: TraducaoErro = {
  familia: "incerto",
  texto: `Não foi possível confirmar se a mensagem foi enviada. ${ORIENTACAO_HISTORICO}`,
};

/** Traduz o código de erro gravado pelo worker. Sem código conhecido, o
    fallback é o conservador: não afirma que saiu nem que não saiu. */
export function traduzirErroMensagem(erro: string | null | undefined): TraducaoErro {
  const codigo = (erro || "").trim();
  if (!codigo) return { familia: "falha-envio", texto: "Falha ao enviar a mensagem." };
  const conhecido = ERROS.find(({ prefixo }) => codigo.startsWith(prefixo));
  return conhecido ? conhecido.traducao : FALLBACK_ERRO;
}

const ROTULO_POR_FAMILIA: Record<FamiliaErro, { rotulo: string; tom: TomExplicacao }> = {
  "nao-enviada": { rotulo: "Não enviada", tom: "falha" },
  "falha-envio": { rotulo: "Falha no envio", tom: "falha" },
  incerto: { rotulo: "Envio não confirmado", tom: "atencao" },
  "registro-incompleto": { rotulo: "Enviada (registro incompleto)", tom: "atencao" },
};

function fraseImoveisConsultados(mensagem: MensagemAgendada, contexto: ContextoExplicacao): string | null {
  const ids = mensagem.imoveisConsultados;
  if (!ids || ids.length <= 1) return null;
  const codigos = contexto.codigoDoImovel
    ? ids.map((id) => contexto.codigoDoImovel!(id)).filter((codigo): codigo is string => !!codigo && codigo.trim() !== "")
    : [];
  const lista = codigos.length === ids.length ? ` (${codigos.join(", ")})` : "";
  return `Perguntou pela disponibilidade de ${ids.length} imóveis${lista}.`;
}

function reprogramacao(mensagem: MensagemAgendada): { de: string; para: string } | null {
  if (!mensagem.reagendadaEm || mensagem.reagendamentoMotivo !== "disponibilidade-confirmada" || !mensagem.dataEnvioOriginal) return null;
  const de = fmtDataIso(mensagem.dataEnvioOriginal);
  const para = fmtDataIso(mensagem.dataEnvio);
  return de && para ? { de, para } : null;
}

function fraseReprogramacao(rep: { de: string; para: string } | null): string | null {
  return rep ? `Reprogramada de ${rep.de} para ${rep.para} após confirmação de disponibilidade.` : null;
}

function fraseCancelamento(mensagem: MensagemAgendada): string {
  const quando = fmtDataIso(mensagem.canceladaEm);
  const em = quando ? ` em ${quando}` : "";
  switch (mensagem.cancelamentoMotivo) {
    case "usuario":
      return `Cancelada pelo usuário${em}.`;
    case "imovel-indisponivel":
      return `Cancelada${em} porque o imóvel não está mais disponível.`;
    case "imovel-excluido":
      return `Cancelada${em} porque o imóvel foi excluído.`;
    case "disponibilidade-confirmada":
      return `Cancelada${em} porque a disponibilidade já havia sido confirmada.`;
    case "contato-consolidado":
      return mensagem.consolidadaEmMensagemId
        ? `Incluída em outra mensagem enviada ao proprietário${em}.`
        : "Incluída em outra mensagem.";
    default:
      return quando ? `Cancelada em ${quando}.` : "Cancelada.";
  }
}

export function explicarMensagemAgendada(
  mensagem: MensagemAgendada,
  contexto: ContextoExplicacao = {},
): ExplicacaoMensagemAgendada {
  const rep = reprogramacao(mensagem);
  const consultados = mensagem.imoveisConsultados?.length ?? null;
  const base = {
    incluidaEmOutraMensagem: false,
    imoveisConsultados: consultados,
    reprogramada: rep,
    tecnico: null as string | null,
  };
  const extras = [fraseReprogramacao(rep), fraseImoveisConsultados(mensagem, contexto)].filter((f): f is string => !!f);

  switch (mensagem.status) {
    case "agendada":
      return { ...base, rotulo: "Agendada", tom: "pendente", detalhes: extras };
    case "processando":
      // Reservada para sair dentro da mensagem única do proprietário: não é
      // um envio próprio em andamento.
      if (mensagem.reservadaParaMensagemId) {
        return { ...base, rotulo: "Em envio conjunto", tom: "andamento", detalhes: ["Está sendo enviada junto com outra mensagem ao proprietário.", ...extras] };
      }
      return { ...base, rotulo: "Enviando", tom: "andamento", detalhes: extras };
    case "enviada":
      return { ...base, rotulo: "Enviada", tom: "ok", detalhes: extras };
    case "cancelada": {
      const incluida = mensagem.cancelamentoMotivo === "contato-consolidado";
      return {
        ...base,
        incluidaEmOutraMensagem: incluida,
        rotulo: incluida ? "Incluída em outra mensagem" : "Cancelada",
        tom: "neutro",
        detalhes: [fraseCancelamento(mensagem), ...extras],
      };
    }
    case "erro": {
      const traducao = traduzirErroMensagem(mensagem.erro);
      const { rotulo, tom } = ROTULO_POR_FAMILIA[traducao.familia];
      return { ...base, rotulo, tom, detalhes: [traducao.texto, ...extras], tecnico: (mensagem.erro || "").trim() || null };
    }
    default:
      return { ...base, rotulo: "Mensagem", tom: "neutro", detalhes: extras };
  }
}

/** Uma frase só, para quem não tem espaço para lista (assistente, resumos). */
export function resumirExplicacao(explicacao: ExplicacaoMensagemAgendada): string {
  return explicacao.detalhes.length ? explicacao.detalhes.join(" ") : explicacao.rotulo;
}
