/* ================================================================
   LINHA DO TEMPO DA ANGARIAÇÃO — parte pura

   A evolução de um imóvel, do cadastro ao pagamento da comissão, numa
   lista só. O corretor tinha as peças espalhadas: a etapa atual no
   topo do cadastro, o histórico de status invisível (mora no jsonb e
   nenhuma tela o mostrava inteiro), os fatos do Sistema Principal num
   bloco de só leitura e a comissão dentro do bloco de comissão.

   NADA AQUI É DADO NOVO. Tudo se deriva do que já está gravado —
   `dataAngariacao`, `statusHistory` e os campos que a integração
   carimba. É a disciplina de `resultadoObservado.ts` e da
   `solicitacaoAngariacao.ts`: montar na LEITURA significa que a
   timeline de um imóvel de 2023 sai igual à de hoje, que um acerto de
   texto é a edição de uma função, e que não há um segundo lugar onde
   a verdade sobre o progresso possa divergir do `statusHistory`.

   ---------------------------------------------------------------
   O QUE FICA DE FORA, E POR QUÊ

   Tentativas e respostas do proprietário NÃO entram. É a decisão mais
   importante deste arquivo, e ela vem de um erro que este projeto já
   cometeu duas vezes: a faixa de "imóvel parado" no termômetro e os
   581 selos de estagnação da carteira importada. Nos dois casos a
   categoria mais populosa enterrou a informação que importava, e a
   tela morreu — ninguém lê o que nasce cheio.

   Aqui seria idêntico: na carteira real há imóveis com 74 mensagens e
   outros com 3 tentativas. Misturar isso com os quatro marcos que o
   corretor quer ver ("criada", "assinou", "locado", "comissão") faria
   o marco virar agulha em palheiro. Conversa já tem duas telas
   próprias — a caixa de respostas e o histórico de notas —, e é lá
   que ela é útil, porque lá a unidade é a mensagem.

   Esta lista é de MARCOS: coisas que aconteceram uma vez e mudaram o
   estado do negócio.
   ================================================================ */
import { STATUS_AUTORIZACAO_ASSINADA } from "../constantes";
import type { Imovel } from "../tipos";

/** De onde saiu a linha — a UI usa para marcar visualmente o que é fato
    informado pelo Sistema Principal, e não coisa que o corretor digitou. */
export type FonteTimeline = "cadastro" | "funil" | "sistema-principal";

export interface MarcoTimeline {
  /** Dia do acontecido, ISO YYYY-MM-DD. */
  data: string;
  icone: string;
  titulo: string;
  /** Uma linha de contexto, quando existe (contrato, responsável, forma de
      pagamento). */
  detalhe?: string | null;
  /** Valor em reais, quando o marco tem um (hoje só a comissão paga).

      Vai CRU, e a UI formata. Formatá-lo aqui obrigaria o núcleo a importar
      formatador e a decidir moeda — mesma razão de `linhasSolicitacao`
      devolver estrutura em vez de texto pronto. */
  valor?: number | null;
  fonte: FonteTimeline;
}

/** Ícone por etapa do funil. Fica aqui, e não em `STATUS_COLORS`, porque
    aquilo é identidade visual (cor de pílula e de card) e isto é leitura
    corrida — o mesmo status pode ter cor discreta e ícone expressivo. */
const ICONES: Record<string, string> = {
  "Novo contato": "📞",
  "Visita agendada": "📅",
  "Em negociação": "🤝",
  "Documentação": "📄",
  "Angariado": "✅",
  [STATUS_AUTORIZACAO_ASSINADA]: "📝",
  "Publicado": "📣",
  "Locado": "🏡",
  "Sem resposta": "🔇",
  "Perdido": "❌",
  "Cancelado": "⛔",
};

/** Frase no lugar do rótulo cru, onde ela lê melhor. O status é nome de
    coluna de kanban ("Documentação"); a linha do tempo é narrativa, e
    "Documentação em andamento" diz o que aconteceu naquele dia. Status sem
    frase própria cai no próprio nome, que já é legível. */
const TITULOS: Record<string, string> = {
  "Visita agendada": "Visita agendada com o proprietário",
  "Em negociação": "Entrou em negociação",
  "Documentação": "Documentação em andamento",
  "Angariado": "Imóvel angariado",
  [STATUS_AUTORIZACAO_ASSINADA]: "Proprietário assinou a autorização de locação",
  "Publicado": "Anúncio publicado",
  "Locado": "Imóvel locado",
  "Sem resposta": "Sem resposta do proprietário",
  "Perdido": "Angariação encerrada como perdida",
  "Cancelado": "Angariação cancelada",
};

/**
 * Os status cuja data VERDADEIRA mora num campo, e não no `statusHistory`.
 *
 * A diferença entre as duas datas é real e não é detalhe: o `statusHistory`
 * guarda o dia em que o PAINEL soube, e o campo guarda o dia em que a coisa
 * ACONTECEU. Um evento reprocessado, uma integração religada depois do fim de
 * semana ou uma assinatura comunicada na segunda-feira fazem os dois
 * divergirem — e numa linha do tempo quem manda é a data do fato, senão ela
 * conta a história do nosso servidor em vez da história do negócio.
 */
const DATA_REAL: Record<string, keyof Imovel> = {
  [STATUS_AUTORIZACAO_ASSINADA]: "autorizacaoAssinadaEm",
  "Locado": "locadoEm",
};

function texto(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

/**
 * A linha do tempo do imóvel, do mais antigo para o mais recente.
 *
 * Três fontes, costuradas sem repetir nada:
 *
 * 1. **O cadastro** — "angariação criada", em `dataAngariacao`.
 * 2. **O funil** — cada entrada do `statusHistory`.
 * 3. **Os fatos do Sistema Principal** — que ou CORRIGEM a data de uma etapa
 *    do funil (assinatura, locação) ou acrescentam um marco que o funil não
 *    tem (a comissão paga, que acontece depois de tudo e não é etapa).
 *
 * O anti-duplicata é a parte que exige cuidado: a assinatura chega a existir
 * em três lugares ao mesmo tempo — a entrada no `statusHistory`, o campo
 * `autorizacaoAssinadaEm` e a nota `sophia:`. Três linhas dizendo a mesma
 * coisa é o que faria a tela deixar de ser lida. Por isso a nota nem é
 * consultada aqui (ela é a NOTIFICAÇÃO, e vive no sino e no histórico de
 * notas) e o campo só entra como correção de data da etapa que já existe.
 */
export function timelineDaAngariacao(imovel: Imovel): MarcoTimeline[] {
  const marcos: MarcoTimeline[] = [];
  const historico = imovel.statusHistory || [];

  /* O nascimento. `dataAngariacao` é a data do cadastro; sem ela (dado antigo
     ou importado sem data) cai na primeira transição registrada, que é o mais
     próximo que existe de "quando isto começou". Sem nenhuma das duas, não há
     linha do tempo a montar — devolver lista vazia é mais honesto que inventar
     "hoje" para um imóvel que existe há um ano. */
  const criacao = texto(imovel.dataAngariacao) || (historico[0]?.date ?? "");
  if (!criacao) return [];
  marcos.push({
    data: criacao,
    icone: "🏠",
    titulo: "Angariação criada",
    detalhe: texto(imovel.origemImovel) ? `via ${texto(imovel.origemImovel)}` : null,
    fonte: "cadastro",
  });

  historico.forEach((entrada, indice) => {
    /* A primeira etapa, no mesmo dia do cadastro, É o cadastro. Cadastrar um
       imóvel já o põe em "Novo contato", então as duas linhas descreveriam o
       mesmo clique — e a linha do tempo abriria se repetindo. */
    if (indice === 0 && entrada.date === criacao) return;

    const campo = DATA_REAL[entrada.status];
    const dataReal = campo ? texto(imovel[campo]) : "";
    const doSistema = !!dataReal;

    marcos.push({
      data: dataReal || entrada.date,
      icone: ICONES[entrada.status] || "•",
      titulo: TITULOS[entrada.status] || entrada.status,
      detalhe: detalheDaEtapa(imovel, entrada.status),
      fonte: doSistema ? "sistema-principal" : "funil",
    });
  });

  /* Os fatos que o funil NÃO registra como etapa.

     A assinatura e a locação entram acima, coladas na etapa correspondente.
     Mas o Sistema Principal pode informar um fato sem que a etapa tenha
     entrado no histórico — é o caso real de quem já estava em "Locado" quando
     a assinatura chegou (o status não anda para trás, e o fato é gravado assim
     mesmo). Sem esta varredura, a data da assinatura ficaria guardada no banco
     e invisível na única tela feita para mostrá-la. */
  for (const [status, campo] of Object.entries(DATA_REAL)) {
    const data = texto(imovel[campo]);
    if (!data) continue;
    if (marcos.some((m) => m.titulo === (TITULOS[status] || status))) continue;
    marcos.push({
      data,
      icone: ICONES[status] || "•",
      titulo: TITULOS[status] || status,
      detalhe: detalheDaEtapa(imovel, status),
      fonte: "sistema-principal",
    });
  }

  /* A comissão fecha a linha, e não é etapa de funil de propósito: ela é paga
     DEPOIS da locação, pelo financeiro, e criar uma etapa para ela poria uma
     transição falsa no `statusHistory` — de onde descendem conversão, coortes
     e tempo médio. Ver `aplicarEvento` em sistemaPrincipal.ts. */
  const dataComissao = texto(imovel.comissaoRecebidaData);
  if (imovel.comissaoRecebida && dataComissao) {
    marcos.push({
      data: dataComissao,
      icone: "💰",
      titulo: "Comissão recebida",
      detalhe: detalheDaComissao(imovel),
      /* Só o valor AFIRMADO. Sem ele a linha não inventa a estimativa: numa
         linha do tempo, "R$ 1.600,00" ao lado de uma data parece o que foi
         pago, e a estimativa não é. É a mesma regra do `aplicarEvento`, que
         deixa `comissaoRecebidaValor` null quando o evento não trouxe valor. */
      valor: imovel.comissaoRecebidaValor ?? null,
      /* "sistema-principal" só quando ele de fato informou algo que só ele
         sabe. A comissão também se marca à mão no cadastro, e carimbar a linha
         como vinda da integração faria a tela afirmar uma procedência que não
         existe — num campo de dinheiro, que é onde menos se confere. */
      fonte: texto(imovel.comissaoFormaPagamento) || texto(imovel.comissaoObservacao)
        ? "sistema-principal"
        : "funil",
    });
  }

  /* Ordenação estável por data. O `sort` do JS já é estável desde o ES2019,
     então empate de dia preserva a ordem de inserção — que é justamente a
     ordem narrativa certa: criada antes da primeira etapa, locado antes da
     comissão paga no mesmo dia. Comparar só a data, sem desempate explícito,
     é o que mantém isso simples e correto. */
  return marcos.sort((a, b) => a.data.localeCompare(b.data));
}

/** O contexto de uma etapa, quando existe algo a dizer além do nome. */
function detalheDaEtapa(imovel: Imovel, status: string): string | null {
  if (status === STATUS_AUTORIZACAO_ASSINADA) {
    const quem = texto(imovel.autorizacaoResponsavel);
    return quem ? `Registrado por ${quem}` : null;
  }
  if (status === "Locado") {
    const contrato = texto(imovel.contratoNumero);
    return contrato ? `Contrato ${contrato}` : null;
  }
  if (status === "Perdido" || status === "Cancelado") {
    const motivo = texto(imovel.motivoPerda);
    const outro = texto(imovel.motivoPerdaOutro);
    if (!motivo) return null;
    return outro ? `${motivo} — ${outro}` : motivo;
  }
  return null;
}

/** Forma de pagamento e observação do financeiro, quando vieram no evento.
    O VALOR fica de fora de propósito: quem o formata é a UI (`fmtMoneyFull`),
    e um número já formatado aqui obrigaria este módulo a importar formatador
    e a decidir moeda — mesma razão de `linhasSolicitacao` devolver estrutura
    e não texto pronto. */
function detalheDaComissao(imovel: Imovel): string | null {
  const partes = [texto(imovel.comissaoFormaPagamento), texto(imovel.comissaoObservacao)];
  const juntas = partes.filter(Boolean).join(" · ");
  return juntas || null;
}
