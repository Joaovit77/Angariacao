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

export type FalhaIa =
  | "nao-configurado"
  | "sessao-expirada"
  | "requisicao-invalida"
  | "sem-dados"
  | "limite-excedido"
  | "falha-ia";

export function mensagemFalhaIa(falha: FalhaIa): string {
  switch (falha) {
    case "nao-configurado":
      return "A sugestão por IA não está configurada neste ambiente.";
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
}

/** Limite por campo do contexto. Corta texto colado sem querer (e um prompt
    gigante enviado de propósito para inflar a conta). */
export const MAX_CONTEXTO = 200;

export interface RoteiroSugerido {
  nome: string;
  roteiro: string;
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

export function promptSugerirRoteiros(contexto: ContextoRoteiro): string {
  const partes = [
    contexto.tipoImovel && `Tipo de imóvel: ${limpar(contexto.tipoImovel)}`,
    contexto.bairro && `Bairro/região: ${limpar(contexto.bairro)}`,
    contexto.situacao && `Situação observada: ${limpar(contexto.situacao)}`,
    contexto.canal && `Canal do contato: ${limpar(contexto.canal)}`,
  ].filter(Boolean);

  const cenario = partes.length > 0 ? partes.join("\n") : "Nenhum detalhe informado — gere abordagens de uso geral.";

  return `${PAPEL}

Sugira 3 abordagens DIFERENTES entre si para o primeiro contato com o proprietário. Cenário:

${cenario}

Regras:
- Cada abordagem é uma mensagem pronta para enviar, de 2 a 4 frases.
- Varie o ângulo entre elas (ex.: uma oferece algo concreto, outra faz uma pergunta, outra parte de uma observação sobre o imóvel). Não escreva três variações do mesmo texto.
- Use {nome} onde entra o nome do proprietário. Não invente outros marcadores.
- Nada de promessa de valor, prazo ou resultado ("alugo em 30 dias", "consigo 20% a mais"). Você não tem como saber.
- Não ofereça material que já esteja pronto — comparativo, relatório, lista de interessados, estudo do bairro. Você não sabe se o corretor tem isso, e prometer o que não existe queima o contato. Pode oferecer o que ele produz na hora: uma avaliação do valor, uma visita, uma conversa de 10 minutos.
- Sem emoji. Sem "Olá, tudo bem?" como abertura de todas.
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
