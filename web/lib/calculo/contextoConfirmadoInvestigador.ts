import { extrairCamposInvestigacao, type CorrespondenciaInvestigacao } from "./investigadorImoveis";
import {
  ATRIBUTOS_MEMORIA,
  CATALOGO_ATRIBUTOS_MEMORIA,
  contemDadoPessoal,
  valorCanonico,
  type AtributoMemoria,
} from "./memoriaIdentidade";

export const VERSAO_CONTEXTO_CONFIRMADO = "b3.2a-v1";

/** Recorte deliberadamente pequeno da linha lida sob a sessão do usuário. */
export interface AtributoParaContextoConfirmado {
  atributo: unknown;
  estado: unknown;
  valorTexto: unknown;
  valorNum: unknown;
}

interface ValorConfirmado {
  atributo: AtributoMemoria;
  valorTexto: string | null;
  valorNum: number | null;
}

export interface ContextoConfirmadoInvestigador {
  valores: ValorConfirmado[];
  /** Atributos com duas decisões humanas incompatíveis não são comparados. */
  conflitosConfirmacoes: AtributoMemoria[];
}

export type EstadoComparacaoConfirmada = "coincide" | "conflita" | "sem_dado_no_resultado";

export interface ComparacaoConfirmada {
  atributo: AtributoMemoria;
  estado: EstadoComparacaoConfirmada;
  /** Só existe quando a entrada inequívoca discorda da confirmação. */
  relacaoEntrada?: EstadoComparacaoConfirmada;
}

export interface ConflitoEntradaConfirmada {
  atributo: "area_m2" | "quartos" | "vagas";
  valorInformado: number;
  valorConfirmado: number;
}

export interface ComparacaoResultadoConfirmado {
  url: string;
  comparacoes: ComparacaoConfirmada[];
}

/** Metadado paralelo aos cards; não altera a correspondência nem sua faixa. */
export interface MemoriaConfirmadaNaResposta {
  porResultado: ComparacaoResultadoConfirmado[];
  conflitosConfirmacoes: AtributoMemoria[];
  /** Contexto auxiliar: não altera consulta, resultado ou correspondência. */
  conflitosEntrada?: ConflitoEntradaConfirmada[];
}

export interface ResumoContextoConfirmado {
  versao: typeof VERSAO_CONTEXTO_CONFIRMADO;
  memoriaConfirmadaDisponivel: boolean;
  memoriaConfirmadaUtilizada: boolean;
  atributosConfirmadosDisponiveis: number;
  atributosComparados: number;
  atributosCoincidentes: number;
  atributosConflitantes: number;
  atributosSemDado: number;
  conflitoConfirmacoes: number;
  leituraFalhou: boolean;
}

function valorValido(linha: AtributoParaContextoConfirmado, atributo: AtributoMemoria): ValorConfirmado | null {
  if (CATALOGO_ATRIBUTOS_MEMORIA[atributo].tipo === "numero") {
    const numero = typeof linha.valorNum === "number"
      ? linha.valorNum
      : typeof linha.valorNum === "string" && linha.valorNum.trim()
        ? Number(linha.valorNum)
        : NaN;
    return Number.isFinite(numero) && numero >= 0
      ? { atributo, valorTexto: null, valorNum: numero }
      : null;
  }
  if (typeof linha.valorTexto !== "string") return null;
  const texto = linha.valorTexto.replace(/\s+/g, " ").trim();
  return texto && texto.length <= 200 && !contemDadoPessoal(texto)
    ? { atributo, valorTexto: texto, valorNum: null }
    : null;
}

/** Só confirmação explícita; estado desconhecido, hipótese e rejeição falham fechados. */
export function projetarContextoConfirmado(
  linhas: ReadonlyArray<AtributoParaContextoConfirmado>,
): ContextoConfirmadoInvestigador {
  const valores: ValorConfirmado[] = [];
  const conflitosConfirmacoes: AtributoMemoria[] = [];
  for (const atributo of ATRIBUTOS_MEMORIA) {
    const confirmadas = linhas
      .filter((linha) => linha.estado === "confirmada" && linha.atributo === atributo)
      .map((linha) => valorValido(linha, atributo));
    // Uma linha confirmada malformada impede usar esse atributo como fato.
    if (confirmadas.some((valor) => valor === null)) continue;
    const validas = confirmadas.filter((valor): valor is ValorConfirmado => valor !== null);
    if (!validas.length) continue;
    const canonicos = new Set(validas.map(valorCanonico));
    if (canonicos.size > 1) {
      conflitosConfirmacoes.push(atributo);
      continue;
    }
    valores.push(validas[0]);
  }
  return { valores, conflitosConfirmacoes };
}

const CAMPO_RESULTADO: Partial<Record<AtributoMemoria, keyof CorrespondenciaInvestigacao>> = {
  area_m2: "area",
  quartos: "quartos",
  vagas: "vagas",
  condominio: "condominio",
  referencia_anuncio: "referencia",
};

function compararCampo(
  confirmado: ValorConfirmado,
  resultado: CorrespondenciaInvestigacao,
): EstadoComparacaoConfirmada | null {
  const campo = CAMPO_RESULTADO[confirmado.atributo];
  if (!campo) return null; // valor_anunciado permanece reservado.
  const encontrado = resultado[campo];
  if (encontrado === null || encontrado === undefined || encontrado === ""
    || (typeof encontrado === "number" && !Number.isFinite(encontrado))) return "sem_dado_no_resultado";
  const valorResultado = typeof encontrado === "number"
    ? { valorNum: encontrado, valorTexto: null }
    : typeof encontrado === "string"
      ? { valorNum: null, valorTexto: encontrado.replace(/\s+/g, " ").trim() }
      : null;
  if (!valorResultado || (valorResultado.valorTexto === "")) return "sem_dado_no_resultado";
  // Igualdade factual exata; a tolerância de área do B3.1 não se aplica.
  return valorCanonico(confirmado) === valorCanonico(valorResultado) ? "coincide" : "conflita";
}

/** B3.2b: apenas quantidades rotuladas e área com unidade. Reaproveita
    os casos explícitos do extrator, mas descarta alternativas e faixas que
    ele pode interpretar como um valor único. */
export function atributosInequivocosDaConsulta(consulta: string): Partial<Record<ConflitoEntradaConfirmada["atributo"], number>> {
  const campos = extrairCamposInvestigacao(consulta);
  // O extrator do pipeline pode reconhecer apenas o último valor de
  // "2 ou 3 quartos". Aqui uma alternativa ou faixa não é fato informado.
  const ambiguos = new Set(
    [...consulta.matchAll(/\b\d{1,4}(?:[.,]\d{1,2})?\s*(?:ou|e|a|até|[-–/])\s*\d{1,4}(?:[.,]\d{1,2})?\s*(quartos?|dormit[oó]rios?|vagas?(?:\s+de\s+garagem)?|garagens?|m(?:²|2|\^2))(?=\s|[,.;:]|$)/giu)]
      .map((item) => item[1].toLowerCase()),
  );
  const ambiguo = (inicio: string) => [...ambiguos].some((rotulo) => rotulo.startsWith(inicio));
  return {
    ...(campos.area !== null && !ambiguo("m") ? { area_m2: campos.area } : {}),
    ...(campos.quartos !== null && !ambiguo("quarto") && !ambiguo("dormit") ? { quartos: campos.quartos } : {}),
    ...(campos.vagas !== null && !ambiguo("vaga") && !ambiguo("garag") ? { vagas: campos.vagas } : {}),
  };
}

export function compararResultadosComConfirmacoes(
  contexto: ContextoConfirmadoInvestigador,
  resultados: ReadonlyArray<CorrespondenciaInvestigacao>,
  consultaAtual?: string,
): MemoriaConfirmadaNaResposta {
  const informados = consultaAtual === undefined ? {} : atributosInequivocosDaConsulta(consultaAtual);
  const conflitosEntrada: ConflitoEntradaConfirmada[] = contexto.valores.flatMap((confirmado) => {
    if (confirmado.atributo !== "area_m2" && confirmado.atributo !== "quartos" && confirmado.atributo !== "vagas") return [];
    const valorInformado = informados[confirmado.atributo];
    return valorInformado !== undefined && valorInformado !== confirmado.valorNum
      ? [{ atributo: confirmado.atributo, valorInformado, valorConfirmado: confirmado.valorNum! }]
      : [];
  });
  const conflitoPorAtributo = new Map(conflitosEntrada.map((conflito) => [conflito.atributo, conflito]));
  return {
    porResultado: resultados.map((resultado) => ({
      url: resultado.url,
      comparacoes: contexto.valores.flatMap((confirmado) => {
        const estado = compararCampo(confirmado, resultado);
        if (!estado) return [];
        const conflito = conflitoPorAtributo.get(confirmado.atributo as ConflitoEntradaConfirmada["atributo"]);
        const relacaoEntrada = conflito
          ? compararCampo({ ...confirmado, valorNum: conflito.valorInformado }, resultado)
          : null;
        return [{ atributo: confirmado.atributo, estado, ...(relacaoEntrada ? { relacaoEntrada } : {}) }];
      }),
    })),
    conflitosConfirmacoes: [...contexto.conflitosConfirmacoes],
    ...(conflitosEntrada.length ? { conflitosEntrada } : {}),
  };
}

export function resumirContextoConfirmado(
  contexto: ContextoConfirmadoInvestigador,
  comparacao: MemoriaConfirmadaNaResposta,
  leituraFalhou = false,
): ResumoContextoConfirmado {
  const estados = comparacao.porResultado.flatMap((item) => item.comparacoes.map((campo) => campo.estado));
  const contar = (estado: EstadoComparacaoConfirmada) => estados.filter((item) => item === estado).length;
  const atributosCoincidentes = contar("coincide");
  const atributosConflitantes = contar("conflita");
  return {
    versao: VERSAO_CONTEXTO_CONFIRMADO,
    memoriaConfirmadaDisponivel: contexto.valores.length + contexto.conflitosConfirmacoes.length > 0,
    memoriaConfirmadaUtilizada: atributosCoincidentes + atributosConflitantes > 0,
    atributosConfirmadosDisponiveis: contexto.valores.length,
    atributosComparados: atributosCoincidentes + atributosConflitantes,
    atributosCoincidentes,
    atributosConflitantes,
    atributosSemDado: contar("sem_dado_no_resultado"),
    conflitoConfirmacoes: contexto.conflitosConfirmacoes.length,
    leituraFalhou,
  };
}
