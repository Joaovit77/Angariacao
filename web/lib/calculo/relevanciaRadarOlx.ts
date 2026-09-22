/* ================================================================
   RELEVÂNCIA DE ANÚNCIOS OLX NO RADAR — quarto individual (R3.2a)

   Função pura e determinística, só sobre o título. Identifica anúncios
   cujo produto é um quarto/vaga, não um imóvel inteiro. NÃO confunde
   "quarto individual" com "imóvel de 1 quarto".

   Precedência: qualquer sinal de imóvel inteiro preserva o anúncio,
   mesmo que exista sinal de quarto. Na dúvida, preserva.

   Não usa `quartos`, `tipo`, área, preço nem os números do card: na
   auditoria de 22/09/2026 nenhum desses campos separou quarto de imóvel
   inteiro com segurança (`quartos === 1` pegou 0 quartos e 5 apartamentos).

   Nesta etapa a classificação é só observada (shadow): nada é escondido.
   ================================================================ */

export type ClasseRelevanciaRadarOlx = "normal" | "parece_quarto";

export type MotivoRelevanciaRadarOlx =
  | "sem-sinal-de-quarto"
  | "imovel-inteiro-preservado"
  | "vaga-para-pessoa"
  | "pensionato-ou-pensao"
  | "quarto-individual-ou-compartilhado"
  | "divisao-de-moradia"
  | "quarto-como-produto";

export interface RelevanciaRadarOlx {
  classe: ClasseRelevanciaRadarOlx;
  motivo: MotivoRelevanciaRadarOlx;
}

/** Minúsculas, sem acento e com espaços colapsados. Números são mantidos. */
export function normalizarTituloRadar(titulo: string | null | undefined): string {
  return (titulo || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

// Contagem explícita de dormitórios: "2 quartos", "01 quarto", "dois quarto",
// "3 dorm", "3 qts". O número pode vir colado ("apartamento1 quarto").
const CONTAGEM_DE_QUARTOS =
  /(?:\d{1,2}|\b(?:um|uma|dois|duas|tres|quatro|cinco))\s*(?:quartos?|dormitorios?|dorm\w*|qts?)\b/;

const SINAIS_DE_IMOVEL_INTEIRO: readonly RegExp[] = [
  /\bapartament\w*/, // apartamento, apartamentos, "apartamento1"
  /\b(?:apto|apt|ap)s?\b/,
  /\bcas(?:a|as|inha)\b/,
  /\bsobrados?\b/,
  /\b(?:kitnet|kitnete|kitinet|kitinete|quitinete|quitinet|kit)s?\b/,
  /\b(?:studio|estudio|flat|loft)s?\b/,
  /\b(?:chacara|sitio|edificio|residencial)s?\b/,
  /\bterre[ao]s?\b/,
  // Unidade descrita pelos cômodos: "sala e quarto", "quarto e cozinha".
  /\bsala\s+e\s+quarto\b|\bquarto\s+e\s+(?:sala|cozinha)\b/,
  CONTAGEM_DE_QUARTOS,
];

// Ordem = prioridade do motivo registrado; todos têm o mesmo efeito.
const SINAIS_DE_QUARTO: ReadonlyArray<readonly [MotivoRelevanciaRadarOlx, RegExp]> = [
  ["vaga-para-pessoa",
    /\bvagas?\s+(?:(?:para|pra|p\/)\s+)?(?:feminin\w*|masculin\w*|estudantes?|trabalhador\w*)/],
  ["pensionato-ou-pensao", /\b(?:pensionatos?|pensao|pensoes)\b/],
  ["quarto-individual-ou-compartilhado",
    /\bquartos?\s+(?:individua\w*|indiviual\w*|compartilhad\w*)/],
  ["divisao-de-moradia", /\b(?:dividir|divido)\b/],
  ["quarto-como-produto", /\bquartos?\b/],
];

export function classificarRelevanciaRadarOlx(titulo: string | null | undefined): RelevanciaRadarOlx {
  const texto = normalizarTituloRadar(titulo);
  const sinal = SINAIS_DE_QUARTO.find(([, padrao]) => padrao.test(texto));
  if (!sinal) return { classe: "normal", motivo: "sem-sinal-de-quarto" };
  if (SINAIS_DE_IMOVEL_INTEIRO.some((padrao) => padrao.test(texto))) {
    return { classe: "normal", motivo: "imovel-inteiro-preservado" };
  }
  return { classe: "parece_quarto", motivo: sinal[0] };
}
