export const LIMITES_ANALISE_APROFUNDADA = {
  comparaveis: 12,
  historico: 12,
  mensagensRecentes: 12,
  mensagensAntigas: 4,
  protocolos: 5,
  caracteresDossie: 48_000,
  tokensEntradaEstimados: 16_000,
  tokensSaida: 2_000,
  timeoutTotalMs: 50_000,
  chamadasNormais: 1,
  chamadasMaximas: 2,
  pesquisasExternas: 0,
  profundidade: 1,
} as const;

export const SECOES_ANALISE_APROFUNDADA = [
  "resumo_executivo",
  "posicao_mercado",
  "historico_operacional",
  "agenda_followups",
  "sinais_atendimento",
  "hipoteses",
  "fatores_desempenho",
  "lacunas_limitacoes",
  "argumentos_proprietario",
  "fontes_confianca",
] as const;

export type SecaoAnaliseAprofundada = (typeof SECOES_ANALISE_APROFUNDADA)[number];
export type NaturezaAfirmacaoAnalise = "fato" | "inferencia" | "lacuna";
export type ConfiancaAnalise = "alta" | "media" | "baixa";
export type TemporalidadeAnalise =
  | "atual"
  | "ultimo_observado"
  | "historico"
  | "agendado"
  | "atemporal"
  | "desconhecida";

export type AutoridadeFonteAnalise =
  | "restricao_deterministica"
  | "protocolo_comercial"
  | "dado_estruturado_atual"
  | "avaliacao_deterministica"
  | "historico_operacional"
  | "fala_atribuida"
  | "anuncio_observado";

export type OrigemFonteAnalise =
  | "sistema"
  | "imovel"
  | "avaliacao"
  | "mercado"
  | "historico"
  | "agenda"
  | "atendimento"
  | "protocolo";

export interface FonteDossieAnaliseAprofundada {
  id: string;
  origem: OrigemFonteAnalise;
  autoridade: AutoridadeFonteAnalise;
  temporalidade: TemporalidadeAnalise;
  observadoEm: string | null;
  rotulo: string;
  conteudo: string;
  /** Usado apenas no servidor para rastrear o protocolo carregado. */
  protocoloIdInterno?: string;
}

export interface FonteApresentacaoAnaliseAprofundada {
  id: string;
  origem: OrigemFonteAnalise;
  temporalidade: TemporalidadeAnalise;
  observadoEm: string | null;
  rotulo: string;
}

export interface AfirmacaoAnaliseAprofundada {
  natureza: NaturezaAfirmacaoAnalise;
  texto: string;
  fontes: string[];
  confianca: ConfiancaAnalise;
  temporalidade: TemporalidadeAnalise;
}

export interface ConteudoSecaoAnaliseAprofundada {
  id: SecaoAnaliseAprofundada;
  afirmacoes: AfirmacaoAnaliseAprofundada[];
}

export interface SaidaModeloAnaliseAprofundada {
  secoes: ConteudoSecaoAnaliseAprofundada[];
  protocolosAplicados: string[];
}

export interface RelatorioAnaliseAprofundada extends SaidaModeloAnaliseAprofundada {
  imovel: { codigo: string; endereco: string };
  fontes: FonteApresentacaoAnaliseAprofundada[];
  protocolosAplicadosTitulos: string[];
  resultado: "completo" | "parcial";
  atendimentoIncluido: boolean;
}

export interface PedidoAnaliseAprofundada {
  tipo: "analise_aprofundada";
  imovelId: string;
  incluirAtendimento: boolean;
  sessaoId: string;
}

export const TITULOS_SECOES_ANALISE: Record<SecaoAnaliseAprofundada, string> = {
  resumo_executivo: "Resumo executivo",
  posicao_mercado: "Posição do imóvel no mercado",
  historico_operacional: "Histórico operacional relevante",
  agenda_followups: "Sinais de Agenda e follow-ups",
  sinais_atendimento: "Sinais do atendimento",
  hipoteses: "Hipóteses fundamentadas",
  fatores_desempenho: "Fatores que podem prejudicar o desempenho",
  lacunas_limitacoes: "Lacunas e limitações",
  argumentos_proprietario: "Argumentos para conversar com o proprietário",
  fontes_confianca: "Fontes, datas e confiança",
};

const NATUREZAS = new Set<NaturezaAfirmacaoAnalise>(["fato", "inferencia", "lacuna"]);
const CONFIANCAS = new Set<ConfiancaAnalise>(["alta", "media", "baixa"]);
const TEMPORALIDADES = new Set<TemporalidadeAnalise>([
  "atual", "ultimo_observado", "historico", "agendado", "atemporal", "desconhecida",
]);

function chavesExatas(valor: Record<string, unknown>, esperadas: readonly string[]): boolean {
  const atuais = Object.keys(valor).sort();
  return atuais.length === esperadas.length
    && [...esperadas].sort().every((chave, indice) => chave === atuais[indice]);
}

function idsTexto(valor: unknown, maximo: number): string[] | null {
  if (!Array.isArray(valor) || valor.length > maximo) return null;
  if (!valor.every((item) => typeof item === "string" && item.trim() !== "")) return null;
  return [...new Set(valor as string[])];
}

function normalizarAfirmacao(valor: unknown): AfirmacaoAnaliseAprofundada | null {
  if (!valor || typeof valor !== "object") return null;
  const item = valor as Record<string, unknown>;
  if (!chavesExatas(item, ["natureza", "texto", "fontes", "confianca", "temporalidade"])) return null;
  if (!NATUREZAS.has(item.natureza as NaturezaAfirmacaoAnalise)) return null;
  if (!CONFIANCAS.has(item.confianca as ConfiancaAnalise)) return null;
  if (!TEMPORALIDADES.has(item.temporalidade as TemporalidadeAnalise)) return null;
  const texto = typeof item.texto === "string" ? item.texto.trim() : "";
  const fontes = idsTexto(item.fontes, 8);
  if (!texto || texto.length > 700 || !fontes) return null;
  return {
    natureza: item.natureza as NaturezaAfirmacaoAnalise,
    texto,
    fontes,
    confianca: item.confianca as ConfiancaAnalise,
    temporalidade: item.temporalidade as TemporalidadeAnalise,
  };
}

export function normalizarSaidaModeloAnalise(valor: unknown): SaidaModeloAnaliseAprofundada | null {
  if (!valor || typeof valor !== "object") return null;
  const raiz = valor as Record<string, unknown>;
  if (!chavesExatas(raiz, ["secoes", "protocolosAplicados"])) return null;
  if (!Array.isArray(raiz.secoes) || raiz.secoes.length !== SECOES_ANALISE_APROFUNDADA.length) return null;
  const secoes: ConteudoSecaoAnaliseAprofundada[] = [];
  for (const valorSecao of raiz.secoes) {
    if (!valorSecao || typeof valorSecao !== "object") return null;
    const secao = valorSecao as Record<string, unknown>;
    if (!chavesExatas(secao, ["id", "afirmacoes"])) return null;
    if (!SECOES_ANALISE_APROFUNDADA.includes(secao.id as SecaoAnaliseAprofundada)) return null;
    if (!Array.isArray(secao.afirmacoes) || secao.afirmacoes.length < 1 || secao.afirmacoes.length > 5) return null;
    const afirmacoes = secao.afirmacoes.map(normalizarAfirmacao);
    if (afirmacoes.some((item) => item === null)) return null;
    secoes.push({ id: secao.id as SecaoAnaliseAprofundada, afirmacoes: afirmacoes as AfirmacaoAnaliseAprofundada[] });
  }
  if (new Set(secoes.map((secao) => secao.id)).size !== SECOES_ANALISE_APROFUNDADA.length) return null;
  const protocolosAplicados = idsTexto(raiz.protocolosAplicados, LIMITES_ANALISE_APROFUNDADA.protocolos);
  return protocolosAplicados ? { secoes, protocolosAplicados } : null;
}

function valoresMonetarios(texto: string): number[] {
  return [...texto.matchAll(/R\$\s*([0-9]{1,3}(?:\.[0-9]{3})*(?:,[0-9]{1,2})?|[0-9]+(?:,[0-9]{1,2})?)/gi)]
    .map((item) => Number(item[1].replaceAll(".", "").replace(",", ".")))
    .filter(Number.isFinite);
}

function temporalidadeCompativel(
  afirmacao: AfirmacaoAnaliseAprofundada,
  fontes: FonteDossieAnaliseAprofundada[],
): boolean {
  if (afirmacao.natureza !== "fato" || afirmacao.temporalidade === "atemporal" || afirmacao.temporalidade === "desconhecida") return true;
  const permitidas: Record<"atual" | "ultimo_observado" | "historico" | "agendado", TemporalidadeAnalise[]> = {
    atual: ["atual"],
    ultimo_observado: ["ultimo_observado"],
    historico: ["historico", "ultimo_observado"],
    agendado: ["agendado"],
  };
  return fontes.some((fonte) => permitidas[afirmacao.temporalidade as keyof typeof permitidas]?.includes(fonte.temporalidade));
}

const ACOES_OPERACIONAIS_ALEGADAS = /\b(?:enviei|alterei|agendei|reagendei|criei|exclui|excluí|salvei|executei|registrei)\b/i;

export function validarSaidaAnaliseAprofundada(
  valor: unknown,
  fontesAutorizadas: readonly FonteDossieAnaliseAprofundada[],
  codigoImovel: string,
  valoresMonetariosAutorizados: readonly number[],
): { ok: true; saida: SaidaModeloAnaliseAprofundada } | { ok: false; erros: string[] } {
  const saida = normalizarSaidaModeloAnalise(valor);
  if (!saida) return { ok: false, erros: ["estrutura-invalida"] };
  const porId = new Map(fontesAutorizadas.map((fonte) => [fonte.id, fonte]));
  const erros = new Set<string>();
  const codigoPermitido = codigoImovel.trim().toUpperCase();

  for (const secao of saida.secoes) {
    for (const afirmacao of secao.afirmacoes) {
      const fontes = afirmacao.fontes.flatMap((id) => {
        const fonte = porId.get(id);
        if (!fonte) erros.add("fonte-desconhecida");
        return fonte ? [fonte] : [];
      });
      if ((afirmacao.natureza === "fato" || afirmacao.natureza === "inferencia") && fontes.length === 0) {
        erros.add(afirmacao.natureza === "fato" ? "fato-sem-fonte" : "inferencia-sem-fonte");
      }
      if (!temporalidadeCompativel(afirmacao, fontes)) erros.add("temporalidade-incompativel");
      if (ACOES_OPERACIONAIS_ALEGADAS.test(afirmacao.texto)) erros.add("acao-operacional-alegada");
      const codigos = afirmacao.texto.match(/\b[A-Z]{1,6}-\d{1,10}\b/gi) || [];
      if (codigos.some((codigo) => codigo.toUpperCase() !== codigoPermitido)) erros.add("outro-imovel-referenciado");
      const valoresDaAfirmacao = valoresMonetarios(afirmacao.texto);
      for (const valor of valoresDaAfirmacao) {
        if (!valoresMonetariosAutorizados.some((permitido) => Math.abs(permitido - valor) < 0.01)) {
          erros.add("valor-monetario-sem-autoridade");
        }
      }
      if (valoresDaAfirmacao.length && /\b(?:avalia[cç][aã]o|faixa|recomendad[oa])\b/i.test(afirmacao.texto)) {
        const fontesAvaliacao = fontes.filter((fonte) => fonte.autoridade === "avaliacao_deterministica");
        const valoresDaAvaliacao = fontesAvaliacao.flatMap((fonte) => {
          const diretos = valoresMonetarios(fonte.conteudo);
          const numericos = [...fonte.conteudo.matchAll(/"(?:faixaMinima|valorRecomendado|faixaMaxima)"\s*:\s*([0-9]+(?:\.[0-9]+)?)/g)]
            .map((item) => Number(item[1]))
            .filter(Number.isFinite);
          return [...diretos, ...numericos];
        });
        if (!fontesAvaliacao.length
          || valoresDaAfirmacao.some((valor) => !valoresDaAvaliacao.some((permitido) => Math.abs(permitido - valor) < 0.01))) {
          erros.add("avaliacao-numerica-sem-fonte-deterministica");
        }
      }
    }
  }

  for (const fonteId of saida.protocolosAplicados) {
    const fonte = porId.get(fonteId);
    if (!fonte || fonte.origem !== "protocolo" || !fonte.protocoloIdInterno) erros.add("protocolo-nao-carregado");
  }
  return erros.size ? { ok: false, erros: [...erros] } : { ok: true, saida };
}

export function esquemaSaidaAnaliseAprofundada(
  fontesAutorizadas: readonly string[],
  protocolosAutorizados: readonly string[],
) {
  const esquemaAfirmacao = {
    type: "object",
    properties: {
      natureza: { type: "string", enum: ["fato", "inferencia", "lacuna"] },
      texto: { type: "string", minLength: 1, maxLength: 700 },
      fontes: { type: "array", items: { type: "string", enum: fontesAutorizadas }, maxItems: 8 },
      confianca: { type: "string", enum: ["alta", "media", "baixa"] },
      temporalidade: { type: "string", enum: [...TEMPORALIDADES] },
    },
    required: ["natureza", "texto", "fontes", "confianca", "temporalidade"],
    additionalProperties: false,
  } as const;
  return {
    type: "object",
    properties: {
      secoes: {
        type: "array",
        minItems: SECOES_ANALISE_APROFUNDADA.length,
        maxItems: SECOES_ANALISE_APROFUNDADA.length,
        items: {
          type: "object",
          properties: {
            id: { type: "string", enum: SECOES_ANALISE_APROFUNDADA },
            afirmacoes: { type: "array", minItems: 1, maxItems: 5, items: esquemaAfirmacao },
          },
          required: ["id", "afirmacoes"],
          additionalProperties: false,
        },
      },
      protocolosAplicados: {
        type: "array",
        items: protocolosAutorizados.length ? { type: "string", enum: protocolosAutorizados } : { type: "string" },
        maxItems: protocolosAutorizados.length ? LIMITES_ANALISE_APROFUNDADA.protocolos : 0,
      },
    },
    required: ["secoes", "protocolosAplicados"],
    additionalProperties: false,
  } as const;
}
