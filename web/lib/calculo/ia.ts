/* ================================================================
   IA — partes puras (prompts, esquema e vocabulário de erro)
   Espelha o papel de calculo/whatsapp.ts: o que cliente e servidor
   precisam concordar mora aqui, sem rede e sem segredo, para poder
   ser testado direto.

   Regra que dá forma a este módulo: **o prompt é montado no servidor,
   nunca recebido do browser**. É o mesmo princípio do "o destinatário
   sai do banco" da rota do WhatsApp — se a rota aceitasse texto livre
   do cliente, viraria um proxy de LLM aberto, pago na nossa conta.
   O browser manda no máximo um contexto curto e tipado; quem escreve
   a instrução é este arquivo.

   O que a IA faz aqui é escrever texto. Ela NÃO calcula métrica:
   o ranking vem de calculo/abordagens.ts (conta determinística) e é
   entregue pronto no prompt. Trocar isso por "pede pra IA analisar os
   dados crus" devolveria número inventado com cara de relatório.
   ================================================================ */
import type { AbordagemDesempenho, ResumoTentativas } from "./abordagens";
import type { KpisDashboard } from "./dashboard";
import type { PlanoDoDia } from "./planoDia";
import { daysInCurrentStatus, isStale } from "./motor";
import { daysBetween, todayISO } from "../datas";
import type { AgendaItem, Imovel } from "../tipos";

export type FalhaIa =
  | "nao-configurado"
  | "sem-permissao"
  | "sessao-expirada"
  | "requisicao-invalida"
  | "sem-dados"
  | "limite-excedido"
  | "falha-ia";

export function mensagemFalhaIa(falha: FalhaIa): string {
  switch (falha) {
    case "nao-configurado":
      return "A sugestão por IA não está configurada neste ambiente.";
    // Distinta de "nao-configurado" de propósito: ali a IA não existe no
    // ambiente, aqui ela existe e esta conta não tem acesso. Confundir as
    // duas manda o usuário procurar problema de configuração que não há.
    case "sem-permissao":
      return "Sua conta não tem acesso aos recursos de IA. Fale com o responsável pelo sistema.";
    case "sessao-expirada":
      return "Sua sessão expirou. Entre novamente para usar a IA.";
    case "requisicao-invalida":
      return "Não foi possível entender o pedido enviado à IA.";
    case "sem-dados":
      return "Ainda não há tentativas registradas suficientes para analisar.";
    case "limite-excedido":
      return "Muitos pedidos à IA em pouco tempo. Tente de novo em instantes.";
    case "falha-ia":
      return "A IA não respondeu agora. Tente novamente em alguns instantes.";
  }
}

/** Contexto curto que o corretor informa ao pedir roteiros. Tudo opcional:
    sem nada, a IA gera abordagens genéricas de captação para locação. */
export interface ContextoRoteiro {
  tipoImovel?: string | null;
  bairro?: string | null;
  /** Situação, em frase completa. Vale o esforço de ser específico: "sem
      resposta" é ambíguo (o proprietário não respondeu? o anúncio dele não
      teve interessados?) e a IA chuta um dos dois. A UI orienta isso pelo
      placeholder do campo. */
  situacao?: string | null;
  canal?: string | null;
  /** Quem assina a mensagem. O captador é o usuário (pré-preenchido pela
      conta); a empresa vem da config — por conta, pensando em outras
      imobiliárias usando o sistema. Com eles a IA escreve a apresentação
      ("meu nome é X e falo da Y"); sem eles, escreve sem se apresentar. */
  captador?: string | null;
  empresa?: string | null;
}

/** Limite por campo do contexto. Corta texto colado sem querer (e um prompt
    gigante enviado de propósito para inflar a conta). */
export const MAX_CONTEXTO = 200;

export interface RoteiroSugerido {
  nome: string;
  roteiro: string;
}

/**
 * Corrige o marcador que o prompt não deve mais pedir.
 *
 * `{imovel}` expande para a FRASE "seu imóvel (rua, bairro)", não para um
 * endereço. Enquanto o prompt dizia que ele era "o endereço do imóvel", a IA
 * escrevia construções como "o imóvel na {imovel}", que chegavam ao
 * proprietário como "o imóvel na seu imóvel (Rua X, Bairro)". O prompt foi
 * corrigido, mas modelo é probabilístico: se escapar um `{imovel}`, o estrago
 * acontece na conversa com uma pessoa real, então vale a rede aqui.
 *
 * A troca é por `{endereco}` (rua e número), que é o que aquelas construções
 * pedem — e é o marcador que o prompt agora ensina.
 */
export function corrigirMarcadores(texto: string): string {
  return texto.replace(/\{imovel\}/g, "{endereco}");
}

/** Esquema dos roteiros — structured outputs garante que a resposta volta
    parseável, então a UI monta cards em vez de despejar texto solto. */
export const ESQUEMA_ROTEIROS = {
  type: "object",
  properties: {
    roteiros: {
      type: "array",
      items: {
        type: "object",
        properties: {
          nome: { type: "string", description: "Nome curto da abordagem (até 60 caracteres)" },
          roteiro: { type: "string", description: "A mensagem para o proprietário, em português do Brasil" },
        },
        required: ["nome", "roteiro"],
        additionalProperties: false,
      },
    },
  },
  required: ["roteiros"],
  additionalProperties: false,
} as const;

const PAPEL = `Você ajuda um corretor de imóveis brasileiro na CAPTAÇÃO de imóveis para LOCAÇÃO — convencer o proprietário a colocar o imóvel com ele. Escreva sempre em português do Brasil, no tom de quem trabalha no mercado, sem jargão de marketing e sem exagero.`;

/** Trunca e limpa um campo do contexto vindo do browser. */
function limpar(valor: string | null | undefined): string {
  return (valor || "").trim().slice(0, MAX_CONTEXTO);
}

/** Teto de nomes já cadastrados levados no prompt. Evita que um catálogo
    grande infle o custo — os mais recentes bastam para não repetir. */
export const MAX_NOMES_EXISTENTES = 20;

export function promptSugerirRoteiros(
  contexto: ContextoRoteiro,
  nomesExistentes: string[] = [],
): string {
  const partes = [
    contexto.tipoImovel && `Tipo de imóvel: ${limpar(contexto.tipoImovel)}`,
    contexto.bairro && `Bairro/região: ${limpar(contexto.bairro)}`,
    contexto.situacao && `Situação observada: ${limpar(contexto.situacao)}`,
    contexto.canal && `Canal do contato: ${limpar(contexto.canal)}`,
  ].filter(Boolean);

  const cenario = partes.length > 0 ? partes.join("\n") : "Nenhum detalhe informado — gere abordagens de uso geral.";

  const captador = limpar(contexto.captador);
  const empresa = limpar(contexto.empresa);

  // A apresentação usa os valores reais — não são marcadores, porque não
  // variam por mensagem: quem varia é o proprietário e o imóvel.
  const apresentacao =
    captador || empresa
      ? `- Apresente-se logo no início: o corretor se chama ${captador || "(nome não informado)"}${empresa ? ` e fala da ${empresa}` : ""}. Escreva a apresentação com esses dados reais, no estilo "meu nome é X e falo da Y".`
      : `- O corretor não informou nome nem empresa — escreva sem apresentação nominal.`;

  // Só os nomes: o suficiente para a IA não devolver o mesmo ângulo com
  // outras palavras — a reclamação clássica de quem gera duas vezes.
  const jaExistem =
    nomesExistentes.length > 0
      ? `\n\nO corretor já tem estas abordagens cadastradas — NÃO repita estes ângulos, proponha caminhos que ele ainda não tem:\n${nomesExistentes
          .slice(0, MAX_NOMES_EXISTENTES)
          .map((n) => `- ${limpar(n)}`)
          .join("\n")}`
      : "";

  return `${PAPEL}

Sugira 3 abordagens DIFERENTES entre si para o primeiro contato com o proprietário. Cenário:

${cenario}${jaExistem}

Referência de tom — um exemplo real do estilo do corretor (NÃO copie; use como calibragem de formalidade e estrutura; a apresentação usa os dados reais da regra abaixo, nunca nomes inventados):
"Olá, {nome}, tudo bem?
Meu nome é [nome do corretor] e falo da [empresa].
Estou entrando em contato sobre o imóvel localizado na {endereco}. Gostaria de confirmar se estou falando com o proprietário do imóvel ou com o responsável por ele.
Agradeço desde já pela atenção e fico à disposição."

Regras:
- Cada abordagem é uma mensagem pronta para enviar, com o mesmo tom cordial e direto da referência: cumprimento, apresentação, motivo do contato, fecho educado.
${apresentacao}
- Varie o ÂNGULO entre as três (ex.: uma confirma quem é o dono, outra oferece algo concreto, outra parte de uma observação sobre o imóvel). Não escreva três variações do mesmo texto.
- Existem DOIS marcadores e só eles: {nome}, que vira o nome do proprietário ("Jonathas Fernando"), e {endereco}, que vira a rua e o número ("Rua José Freitas dos Santos, 250"). Escreva a frase em volta contando com esse encaixe: "o imóvel na {endereco}" fica certo. Nunca use {imovel} nem invente outros marcadores.
- Nada de promessa de valor, prazo ou resultado ("alugo em 30 dias", "consigo 20% a mais"). Você não tem como saber.
- Não ofereça material que já esteja pronto — comparativo, relatório, lista de interessados, estudo do bairro. Você não sabe se o corretor tem isso, e prometer o que não existe queima o contato. Pode oferecer o que ele produz na hora: uma avaliação do valor, uma visita, uma conversa de 10 minutos.
- Sem emoji. Não abra as três com o mesmo cumprimento.
- O campo "nome" é um rótulo curto para o corretor identificar a abordagem depois, não faz parte da mensagem.`;
}

/** Serializa o ranking em texto compacto — é isto que a IA lê. Os números
    já vêm calculados; ela só interpreta. */
export function resumirRankingParaPrompt(
  ranking: AbordagemDesempenho[],
  resumo: ResumoTentativas,
): string {
  const linhas = ranking.map((a) => {
    const amostra = a.amostraSuficiente ? "" : " [amostra baixa]";
    return `- "${a.nome}"${amostra}: ${a.tentativas} tentativa(s), ${a.taxaResposta.toFixed(0)}% de resposta, usada em ${a.imoveis} imóvel(is), ${a.angariados} angariado(s) (${a.taxaAngariacao.toFixed(0)}%), destravou ${a.destravou}, ${a.aberturas} uso(s) como abertura e ${a.seguimentos} como seguimento.`;
  });

  const media =
    resumo.mediaTentativasAteAngariar != null
      ? `${resumo.mediaTentativasAteAngariar.toFixed(1)} tentativa(s)`
      : "ainda sem caso para calcular";

  return `${linhas.join("\n")}

Totais: ${resumo.total} tentativa(s) em ${resumo.imoveisComTentativa} imóvel(is); ${resumo.semAbordagem} sem roteiro registrado. Média de tentativas até angariar: ${media}.`;
}

/* ----------------------------------------------------------------
   DASHBOARD — duas leituras diferentes da mesma carteira.
   "Ler os números" olha para trás (o que os KPIs dizem); "o que fazer
   hoje" olha para frente (o que está vencendo). Ambas seguem a regra da
   casa: os números chegam prontos, a IA só interpreta.
   ---------------------------------------------------------------- */

/** Quantos imóveis em cada etapa do funil. */
export interface ContagemStatus {
  status: string;
  quantidade: number;
}

/** Distribuição da carteira pelos status, na ordem do funil. Serve para a
    IA enxergar onde os imóveis empacam — um acúmulo numa etapa é o
    gargalo, e isso não aparece em nenhum KPI isolado. */
export function contagemPorStatus(imoveis: Imovel[]): ContagemStatus[] {
  const contagem = new Map<string, number>();
  for (const i of imoveis) contagem.set(i.status, (contagem.get(i.status) || 0) + 1);
  return [...contagem.entries()].map(([status, quantidade]) => ({ status, quantidade }));
}

export function promptAnalisarDashboard(kpis: KpisDashboard, funil: ContagemStatus[]): string {
  const etapas = funil
    .filter((f) => f.quantidade > 0)
    .map((f) => `${f.status}: ${f.quantidade}`)
    .join(", ");

  const delta = (n: number) => (n > 0 ? `+${n}` : `${n}`);
  const o = kpis.overall;

  return `${PAPEL}

Abaixo está o desempenho da carteira deste corretor, já calculado pelo sistema. Interprete os números — não os recalcule e não invente nenhum que não esteja aqui.

Mês atual:
- Novos contatos: ${kpis.contatosThisMonth} (${delta(kpis.deltaContatos)} vs. mês anterior)
- Angariações: ${kpis.angariacoesThisMonth} (${delta(kpis.deltaAngariacoes)} vs. mês anterior)
- Locados: ${kpis.locadosThisMonth} (${delta(kpis.deltaLocados)} vs. mês anterior)
- Em andamento no funil: ${kpis.emAndamento}

Carteira inteira:
- ${o.total} imóvel(is), ${o.locados} locado(s), ${o.perdidosCancelados} perdido(s)/cancelado(s)
- Conversão geral: ${o.conversaoGeral.toFixed(0)}% — considerando só os casos já encerrados: ${o.conversaoFechados.toFixed(0)}%
- Tempo médio até locar: ${o.tempoMedio != null ? `${Math.round(o.tempoMedio)} dias` : "ainda sem caso para calcular"}

Distribuição no funil: ${etapas || "nenhum imóvel em etapa ativa"}

Como ler as medidas:
- "Angariações" conta só imóveis que chegaram na etapa Angariado — contato feito não conta.
- "Conversão geral" divide pelo total, incluindo quem ainda está em andamento; por isso ela é sempre menor que a dos encerrados. Comparar as duas diz se o problema é volume ou aproveitamento.
- Um acúmulo numa etapa do funil indica onde os imóveis empacam.

Escreva no máximo 3 parágrafos curtos, em português do Brasil, dirigindo-se ao corretor por "você":
1. Como o mês está indo em relação ao anterior.
2. Onde está o gargalo do funil — em qual etapa os imóveis estão parando.
3. Uma sugestão concreta do que priorizar.

Com carteira pequena, uma variação de um ou dois imóveis não é tendência — diga isso em vez de narrar oscilação como se fosse padrão. Não use bullet points, títulos nem markdown.`;
}

/* ----------------------------------------------------------------
   FOCO DO DIA — a IA interpreta o plano de prospecção do dia.
   Segue a regra da casa: a repartição já vem calculada (planoDia.ts,
   o MESMO cálculo da tela); a IA só lê o que falta e nudge. Nunca
   recalcula nem inventa número.

   O plano divide o ritmo do dia IGUALMENTE entre os portais — o
   sistema não ranqueia por conversão porque o registro de leads
   difere entre eles. A IA não deve dizer "esse portal é melhor".
   ---------------------------------------------------------------- */

/** Serializa o plano do dia em texto compacto — é isto que a IA lê. */
export function resumirFocoParaPrompt(plano: PlanoDoDia): string {
  const ritmo = plano.temSugestao
    ? `Ritmo típico do dia: ${plano.ritmo} contato(s) novo(s), dividido igualmente entre os portais. Já feitos hoje: ${plano.feitosHoje}.`
    : `Ritmo do dia: ainda sem histórico para estimar. Já feitos hoje: ${plano.feitosHoje}.`;

  const linhas = plano.portais.map((p) => {
    const alvo = plano.temSugestao ? `sugerido ${p.sugerido}, feitos ${p.feitos}, faltam ${p.restantes}` : `feitos ${p.feitos}`;
    return `- "${p.origem}": ${alvo}. (${p.angariados} angariação(ões) no total.)`;
  });

  return `${ritmo}

Portais que o corretor usa (o que mais falta fazer hoje primeiro):
${linhas.join("\n")}`;
}

export function promptExplicarFoco(plano: PlanoDoDia): string {
  return `${PAPEL}

Este é o plano de prospecção de HOJE deste corretor, já calculado pelo sistema. Interprete — não recalcule e não invente nenhum número que não esteja aqui.

${resumirFocoParaPrompt(plano)}

Como ler as medidas:
- O ritmo do dia é dividido IGUALMENTE entre os portais. O sistema NÃO ranqueia portais por conversão de propósito: o corretor registra leads de forma diferente em cada portal, então "qual converte mais" não é comparável. NÃO diga que um portal é melhor que outro.
- "sugerido" = a meta de contatos novos de hoje naquele portal; "feitos" = quantos já foram; "faltam" = o que resta.
- "angariação(ões) no total" é só contexto histórico do que o portal já rendeu — não é para ranquear o dia.

Escreva 2 a 3 frases curtas em português do Brasil, dirigindo-se ao corretor por "você": onde ele está em dia e onde está atrasado, e o que falta bater no total. Regras:
- Aponte os portais em que ele está PARADO ou atrás hoje (maior "faltam"), e os que já cumpriu.
- NÃO eleja um portal como melhor nem sugira concentrar num só — a divisão é igual de propósito.
- Se ainda não há ritmo estimado, diga que falta histórico para montar a meta e sugira só manter a prospecção nos canais de sempre.
- Sem introdução nem fechamento motivacional, sem bullet points, títulos ou markdown.`;
}

/** Um compromisso ou imóvel que pede ação. O texto já vem pronto do
    servidor; a IA não recebe o objeto do imóvel inteiro — só o que
    precisa para priorizar, o que também segura o tamanho do prompt. */
export interface ItemDoDia {
  descricao: string;
  /** Dias de atraso (positivo) ou parados. 0 = vence hoje. */
  dias: number;
}

export interface PanoramaDia {
  hoje: string;
  compromissosHoje: ItemDoDia[];
  atrasados: ItemDoDia[];
  parados: ItemDoDia[];
}

/** Teto por lista. Uma carteira grande com 200 imóveis parados geraria um
    prompt enorme e caro, e a IA não consegue priorizar 200 coisas de
    qualquer jeito — as primeiras (mais atrasadas) é que importam. */
export const MAX_ITENS_DIA = 12;

/** Rótulo curto de um imóvel para a IA citar. Endereço, não id: o texto é
    lido por uma pessoa. Sem endereço, cai no código. */
function rotuloImovel(imovel: Imovel | undefined): string {
  if (!imovel) return "imóvel não identificado";
  return imovel.endereco || imovel.codigo || "imóvel sem endereço";
}

/** Monta o que está pendente hoje: compromissos do dia, compromissos
    atrasados e imóveis parados. Ordena por urgência (mais atrasado
    primeiro) porque a truncagem em MAX_ITENS_DIA corta do fim — sem
    ordenar, cortaríamos justamente os mais críticos.

    Concluídos ficam de fora, e `isStale` já exclui pausados, terminais e
    locados: o que sobra é ação real. */
export function panoramaDoDia(imoveis: Imovel[], agenda: AgendaItem[]): PanoramaDia {
  const hoje = todayISO();
  const porId = new Map(imoveis.map((i) => [i.id, i]));

  const compromissosHoje: ItemDoDia[] = [];
  const atrasados: ItemDoDia[] = [];

  for (const a of agenda) {
    if (a.done) continue;
    const atraso = daysBetween(a.date, hoje);
    if (atraso == null || atraso < 0) continue; // futuro: não é pendência de hoje
    const imovel = a.imovelId ? porId.get(a.imovelId) : undefined;
    const descricao = `${a.title} — ${rotuloImovel(imovel)}`;
    if (atraso === 0) compromissosHoje.push({ descricao, dias: 0 });
    else atrasados.push({ descricao, dias: atraso });
  }

  const parados: ItemDoDia[] = imoveis
    .filter(isStale)
    .map((i) => ({
      descricao: `${rotuloImovel(i)} — parado em "${i.status}"`,
      dias: daysInCurrentStatus(i) ?? 0,
    }));

  atrasados.sort((a, b) => b.dias - a.dias);
  parados.sort((a, b) => b.dias - a.dias);

  return { hoje, compromissosHoje, atrasados, parados };
}

function listaDoDia(itens: ItemDoDia[], sufixo: (d: number) => string): string {
  const visiveis = itens.slice(0, MAX_ITENS_DIA);
  const linhas = visiveis.map((i) => `- ${i.descricao} (${sufixo(i.dias)})`);
  const resto = itens.length - visiveis.length;
  if (resto > 0) linhas.push(`- ...e mais ${resto} item(ns) semelhante(s).`);
  return linhas.join("\n");
}

export function promptResumoDia(panorama: PanoramaDia): string {
  const partes: string[] = [];

  if (panorama.compromissosHoje.length > 0) {
    partes.push(`Compromissos de hoje:\n${listaDoDia(panorama.compromissosHoje, () => "hoje")}`);
  }
  if (panorama.atrasados.length > 0) {
    partes.push(
      `Compromissos atrasados:\n${listaDoDia(panorama.atrasados, (d) => `${d} dia(s) de atraso`)}`,
    );
  }
  if (panorama.parados.length > 0) {
    partes.push(
      `Imóveis parados no mesmo status:\n${listaDoDia(panorama.parados, (d) => `${d} dia(s) parado`)}`,
    );
  }

  const corpo =
    partes.length > 0 ? partes.join("\n\n") : "Nada vencido, nada atrasado e nenhum imóvel parado.";

  return `${PAPEL}

Hoje é ${panorama.hoje}. Abaixo está o que o sistema encontrou pendente na carteira deste corretor.

${corpo}

Escreva um resumo curto em português do Brasil, dirigindo-se ao corretor por "você", dizendo por onde começar o dia. Regras:
- No máximo 5 itens, do mais urgente para o menos. Um por linha, começando com "- ".
- Priorize por consequência, não só por data: um compromisso atrasado com proprietário que já demonstrou interesse vale mais que um imóvel parado numa etapa inicial.
- Cite o imóvel pelo que foi dado acima. Não invente endereço, nome ou telefone que não esteja na lista.
- Se a lista estiver vazia, diga que não há pendência e sugira uma ação de prospecção — sem inventar dado.
- Nada de introdução nem fechamento motivacional. Vá direto aos itens.
- Texto puro: sem negrito, sem markdown. A tela mostra os asteriscos como caracteres crus.`;
}

/* ----------------------------------------------------------------
   CLASSIFICAR A RESPOSTA DO PROPRIETÁRIO

   A terceira coisa que a IA faz aqui, e a única que não é texto para
   ler: é leitura de texto para virar dado. Vem do webhook — o
   proprietário respondeu, e alguém precisa dizer o que aquilo
   significa.

   A divisão que dá forma a isto: o `resultado` sai de uma lista
   FECHADA, porque é ele que alimenta o ranking de abordagens; deixar
   o modelo inventar um rótulo por mensagem daria amostra 1 a cada um
   e o ranking viraria uma lista de ocorrências únicas. Já `retomarEm`
   e `resumo` são livres — descrevem a próxima ação daquela conversa,
   não uma categoria a comparar com outras.

   E é SUGESTÃO: o corretor confirma no nudge. A IA lê uma frase solta,
   sem o contexto da conversa inteira, e "vou ver com minha esposa"
   pode ser entusiasmo ou desculpa educada. Gravar direto trocaria um
   palpite do sistema por outro mais bem escrito.
   ---------------------------------------------------------------- */

/** Teto do texto da mensagem levado ao prompt. Mensagem encaminhada pode ter
    milhares de caracteres e o que decide o desfecho está sempre no começo. */
export const MAX_TEXTO_CLASSIFICACAO = 600;

export interface RespostaClassificada {
  resultado: string;
  retomarEm?: string | null;
  resumo: string;
}

/** Esquema fechado: o `enum` é o que impede o modelo de inventar desfecho.
    Os valores espelham RESULTADOS_TENTATIVA — se um for acrescentado lá sem
    entrar aqui, a IA nunca o sugerirá (falha silenciosa, mas inofensiva). */
export const ESQUEMA_CLASSIFICACAO = {
  type: "object",
  properties: {
    resultado: {
      type: "string",
      enum: ["respondeu", "vai-retornar", "agendou", "recusou", "numero-errado"],
      description: "Desfecho da conversa, um dos valores permitidos",
    },
    retomarEm: {
      type: ["string", "null"],
      description:
        "Data sugerida para retomar o contato, no formato YYYY-MM-DD. null quando a mensagem não indica prazo.",
    },
    resumo: {
      type: "string",
      description: "Uma linha em português do Brasil sobre o que o proprietário disse",
    },
  },
  required: ["resultado", "retomarEm", "resumo"],
  additionalProperties: false,
} as const;

export function promptClassificarResposta(texto: string, hoje: string): string {
  return `${PAPEL}

Você mandou uma mensagem para um proprietário sobre a locação do imóvel dele, e ele respondeu isto:

"""
${texto.trim().slice(0, MAX_TEXTO_CLASSIFICACAO)}
"""

Hoje é ${hoje}. Classifique o desfecho desta conversa.

O que cada desfecho significa:
- "agendou" — ficou marcada uma visita, reunião ou ligação. Só use quando houver compromisso, não quando houver intenção.
- "vai-retornar" — ele não decidiu agora e vai pensar, consultar alguém ou responder depois. É o caso de "vou ver e te falo", "preciso conversar com minha esposa", "me liga semana que vem".
- "recusou" — não tem interesse, já resolveu por outro caminho, ou não quer alugar. Recusa educada continua sendo recusa.
- "numero-errado" — quem respondeu não é o proprietário, ou não sabe do que se trata.
- "respondeu" — reagiu, mas não se encaixa em nenhum acima (uma dúvida, um "oi", um pedido de informação).

Regras:
- Na dúvida entre dois, escolha o MENOS otimista. Marcar "agendou" o que foi só interesse infla a medição de fechamento do corretor e ele passa a confiar num número errado.
- "retomarEm": só preencha se a mensagem indicar prazo, mesmo que vago ("semana que vem", "depois do dia 10", "mês que vem"). Converta para uma data real a partir de hoje. Se ele não deu prazo, devolva null — não invente um.
- "resumo": uma linha curta, factual, sobre o que ELE disse. Nada de conselho ao corretor e nada de repetir a mensagem inteira. Exemplo: "Vai avaliar com a esposa e retorna na semana que vem."
- Não deduza nada que não esteja na mensagem.`;
}

export function promptAnalisarAbordagens(
  ranking: AbordagemDesempenho[],
  resumo: ResumoTentativas,
): string {
  return `${PAPEL}

Abaixo está o desempenho real das abordagens deste corretor, já calculado pelo sistema. Interprete os números — não os recalcule e não invente nenhum que não esteja aqui.

${resumirRankingParaPrompt(ranking, resumo)}

Como ler as medidas:
- "resposta" = o proprietário reagiu (recusar conta como reagir).
- "angariação" = dos imóveis que receberam o roteiro, quantos chegaram a Angariado. É participação, não causa.
- "destravou" = foi a última tentativa antes da angariação. Esta é a medida de fechamento.
- "[amostra baixa]" = poucas tentativas. Trate como indício, nunca como conclusão, e diga isso.

Escreva no máximo 3 parágrafos curtos, em português do Brasil, dirigindo-se ao corretor por "você":
1. O que os números mostram (o padrão, não a lista).
2. Onde está o gargalo — abertura (fazer responder) ou fechamento (fazer avançar).
3. Uma sugestão concreta do que testar em seguida.

Se os dados forem escassos demais para sustentar uma leitura, diga isso com franqueza em vez de forçar uma conclusão. Não use bullet points, títulos nem markdown.`;
}
