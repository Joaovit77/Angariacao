import { dataOperacionalDeTimestamp, isoDeTimestamp, timestampDeIso } from "../datas";
import {
  MOTIVOS_PERDA_VENDA, ORIGENS_COMERCIAIS_VENDA,
  type CodigoErroVenda, type ContextoMudancaVenda, type EntradaCriacaoVenda,
  type EventoVenda, type FalhaVenda,
  type GanhoVenda, type ImovelTratadoVenda, type OportunidadeVenda, type OrigemComercialVenda,
  type PerdaVenda, type ResultadoMudancaVenda, type TransicaoVenda, type ValidacaoVenda,
  type ValoresVenda,
} from "./tipos";
import { ehEstadoTerminalVenda, ehEstadoVenda, podeTransicionarVenda } from "./transicoes";

const valido: ValidacaoVenda = { ok: true };
const falha = (codigo: CodigoErroVenda): FalhaVenda => ({ ok: false, codigo });
function objeto(valor: unknown): Record<string, unknown> | null {
  return valor !== null && typeof valor === "object" && !Array.isArray(valor)
    ? valor as Record<string, unknown> : null;
}
function texto(valor: unknown): valor is string {
  return typeof valor === "string" && valor.trim().length > 0;
}
function opcionalTexto(valor: unknown): boolean {
  return valor == null || typeof valor === "string";
}
function numeroOuDesconhecido(valor: unknown): boolean {
  return valor == null || (typeof valor === "number" && Number.isFinite(valor) && valor >= 0);
}
function versaoValida(valor: unknown): valor is number {
  return typeof valor === "number" && Number.isSafeInteger(valor) && valor >= 1;
}
function instanteValido(valor: unknown): valor is string {
  return typeof valor === "string" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(valor)
    && isoDeTimestamp(timestampDeIso(valor)) === valor;
}
/** Valida o calendário civil por componentes, sem converter o dia em instante. */
function dataCivilValida(valor: unknown): valor is string {
  if (typeof valor !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return false;
  const [ano, mes, dia] = valor.split("-").map(Number);
  // Preserva o intervalo de anos já aceito pelo V1-A.
  if (ano < 100 || mes < 1 || mes > 12 || dia < 1) return false;
  const bissexto = ano % 4 === 0 && (ano % 100 !== 0 || ano % 400 === 0);
  const diasNoMes = [31, bissexto ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return dia <= diasNoMes[mes - 1];
}
function dataFatoValida(valor: unknown, registradoEm: string): boolean {
  if (!dataCivilValida(valor)) return false;
  const diaRegistro = dataOperacionalDeTimestamp(timestampDeIso(registradoEm)!);
  return diaRegistro !== null && valor <= diaRegistro;
}

export function validarImovelTratadoVenda(valor: unknown): ValidacaoVenda {
  if (valor === null) return valido;
  const imovel = objeto(valor);
  if (!imovel) return falha("imovel-invalido");
  const campos = imovel.modo === "referencia"
    ? ["modo", "imovelId"]
    : ["modo", "endereco", "referencia", "unidade", "bloco", "descricaoCurta"];
  if (Object.keys(imovel).some((campo) => !campos.includes(campo))) return falha("imovel-invalido");
  if (imovel.modo === "referencia") return texto(imovel.imovelId) ? valido : falha("imovel-invalido");
  if (imovel.modo !== "manual" || campos.slice(1).some((campo) => !opcionalTexto(imovel[campo]))) {
    return falha("imovel-invalido");
  }
  return texto(imovel.endereco) || texto(imovel.referencia) ? valido : falha("imovel-invalido");
}

export function temImovelTratado(valor: unknown): valor is ImovelTratadoVenda {
  return valor !== null && validarImovelTratadoVenda(valor).ok;
}

export function validarEntradaNegociacao(imovelTratado: unknown): ValidacaoVenda {
  return temImovelTratado(imovelTratado) ? valido : falha("imovel-obrigatorio");
}

export function validarOrigemComercialVenda(valor: unknown): ValidacaoVenda {
  if (valor === null) return valido;
  const origem = objeto(valor);
  return origem && typeof origem.tipo === "string"
    && (ORIGENS_COMERCIAIS_VENDA as readonly string[]).includes(origem.tipo)
    && opcionalTexto(origem.descricao) ? valido : falha("origem-invalida");
}

export function validarValoresVenda(valor: unknown): ValidacaoVenda {
  const valores = objeto(valor);
  if (!valores) return falha("valor-invalido");
  const campos = ["valorNegocioPrevisto", "valorNegocioFechado", "receitaPrevista"];
  return campos.every((campo) => Object.hasOwn(valores, campo) && valores[campo] !== undefined && numeroOuDesconhecido(valores[campo]))
    && Object.keys(valores).every((campo) => campos.includes(campo)) ? valido : falha("valor-invalido");
}

export function validarGanhoVenda(
  imovelTratado: unknown, entrada: unknown, registradoEm: string,
): ValidacaoVenda {
  const identificacao = validarEntradaNegociacao(imovelTratado);
  if (!identificacao.ok) return identificacao;
  const ganho = objeto(entrada);
  if (!ganho || ganho.confirmacaoExplicita !== true) return falha("confirmacao-obrigatoria");
  if (!texto(ganho.registroFormalizacao)) return falha("formalizacao-obrigatoria");
  if (!instanteValido(registradoEm) || !dataFatoValida(ganho.dataFato, registradoEm)) return falha("data-invalida");
  return numeroOuDesconhecido(ganho.valorNegocioFechado) ? valido : falha("valor-invalido");
}

export function validarPerdaVenda(entrada: unknown, registradoEm: string): ValidacaoVenda {
  const perda = objeto(entrada);
  if (!perda || !texto(perda.motivo)) return falha("motivo-perda-obrigatorio");
  if (!(MOTIVOS_PERDA_VENDA as readonly string[]).includes(perda.motivo)) return falha("motivo-perda-invalido");
  if (!opcionalTexto(perda.justificativa)
    || (perda.motivo === "outro" && !texto(perda.justificativa))) return falha("justificativa-obrigatoria");
  return instanteValido(registradoEm) && dataFatoValida(perda.dataFato, registradoEm)
    ? valido : falha("data-invalida");
}

/** Valida inclusive retratos vindos de uma futura leitura. Não consulta entidades referenciadas. */
export function validarOportunidadeVenda(valor: unknown): ValidacaoVenda {
  const oportunidade = objeto(valor);
  if (!oportunidade) return falha("estrutura-invalida");
  if (!texto(oportunidade.id) || !texto(oportunidade.userId)) return falha("identidade-obrigatoria");
  if (!texto(oportunidade.contatoId)) return falha("contato-obrigatorio");
  if (oportunidade.criadoPor !== oportunidade.userId
    || oportunidade.responsavelUsuarioId !== oportunidade.userId) return falha("responsabilidade-invalida");
  if (!versaoValida(oportunidade.versao)) return falha("versao-invalida");
  if (!ehEstadoVenda(oportunidade.estado)) return falha("estado-invalido");
  if (!instanteValido(oportunidade.criadoEm) || !instanteValido(oportunidade.atualizadoEm)
    || oportunidade.atualizadoEm < oportunidade.criadoEm) return falha("data-invalida");
  for (const validacao of [
    validarImovelTratadoVenda(oportunidade.imovelTratado),
    validarOrigemComercialVenda(oportunidade.origem),
    validarValoresVenda(oportunidade.valores),
  ]) if (!validacao.ok) return validacao;

  const valores = oportunidade.valores as ValoresVenda;
  if (oportunidade.estado !== "ganha" && valores.valorNegocioFechado != null) {
    return falha("valor-fechado-incompativel");
  }
  if (oportunidade.estado === "em_negociacao" && !temImovelTratado(oportunidade.imovelTratado)) {
    return falha("imovel-obrigatorio");
  }
  const encerramento = objeto(oportunidade.encerramento);
  if (oportunidade.estado === "ganha") {
    if (encerramento?.tipo !== "ganho") return falha("encerramento-invalido");
    const validacao = validarGanhoVenda(oportunidade.imovelTratado, {
      ...encerramento, valorNegocioFechado: valores.valorNegocioFechado,
    }, oportunidade.atualizadoEm);
    if (!validacao.ok) return validacao;
  } else if (oportunidade.estado === "perdida") {
    if (encerramento?.tipo !== "perda" || !Object.hasOwn(encerramento, "justificativa")) {
      return falha("encerramento-invalido");
    }
    const validacao = validarPerdaVenda(encerramento, oportunidade.atualizadoEm);
    if (!validacao.ok) return validacao;
  } else if (oportunidade.encerramento !== null) {
    return falha("encerramento-invalido");
  }
  if (oportunidade.arquivadaEm !== null) {
    if (!ehEstadoTerminalVenda(oportunidade.estado)) return falha("arquivamento-invalido");
    if (!instanteValido(oportunidade.arquivadaEm)
      || oportunidade.arquivadaEm < oportunidade.criadoEm
      || oportunidade.arquivadaEm > oportunidade.atualizadoEm) return falha("data-invalida");
  }
  return valido;
}

function copiarImovel(imovel: ImovelTratadoVenda | null): ImovelTratadoVenda | null {
  if (!imovel) return null;
  if (imovel.modo === "referencia") return { modo: "referencia", imovelId: imovel.imovelId };
  const limpar = (valor: string | null | undefined) => valor?.trim() || null;
  return {
    modo: "manual", endereco: limpar(imovel.endereco), referencia: limpar(imovel.referencia),
    unidade: limpar(imovel.unidade), bloco: limpar(imovel.bloco), descricaoCurta: limpar(imovel.descricaoCurta),
  };
}
function copiarOrigem(origem: OrigemComercialVenda | null): OrigemComercialVenda | null {
  return origem ? { tipo: origem.tipo, descricao: origem.descricao?.trim() || null } : null;
}
function copiarOportunidade(oportunidade: OportunidadeVenda): OportunidadeVenda {
  return {
    ...oportunidade, imovelTratado: copiarImovel(oportunidade.imovelTratado),
    origem: copiarOrigem(oportunidade.origem), valores: { ...oportunidade.valores },
    encerramento: oportunidade.encerramento ? { ...oportunidade.encerramento } : null,
  } as OportunidadeVenda;
}
function contextoValido(
  oportunidade: OportunidadeVenda, contexto: ContextoMudancaVenda,
): ValidacaoVenda {
  const validacao = validarOportunidadeVenda(oportunidade);
  if (!validacao.ok) return validacao;
  if (!objeto(contexto) || contexto.atorUsuarioId !== oportunidade.userId) return falha("autoria-invalida");
  if (!versaoValida(contexto.versaoEsperada) || oportunidade.versao === Number.MAX_SAFE_INTEGER) {
    return falha("versao-invalida");
  }
  if (contexto.versaoEsperada !== oportunidade.versao) return falha("versao-conflitante");
  return instanteValido(contexto.registradoEm) && contexto.registradoEm >= oportunidade.atualizadoEm
    ? valido : falha("data-invalida");
}
function baseEvento(oportunidade: OportunidadeVenda, contexto: ContextoMudancaVenda) {
  return {
    oportunidadeId: oportunidade.id, userId: oportunidade.userId,
    atorUsuarioId: contexto.atorUsuarioId, registradoEm: contexto.registradoEm,
    versao: oportunidade.versao,
  };
}
function prepararMudanca(oportunidade: OportunidadeVenda, contexto: ContextoMudancaVenda): OportunidadeVenda {
  return { ...copiarOportunidade(oportunidade), versao: oportunidade.versao + 1, atualizadoEm: contexto.registradoEm };
}
function resultado(oportunidade: OportunidadeVenda, evento: EventoVenda): ResultadoMudancaVenda {
  const validacao = validarOportunidadeVenda(oportunidade);
  return validacao.ok ? { ok: true, oportunidade, eventos: [evento] } : validacao;
}
function validarEdicaoAberta(oportunidade: OportunidadeVenda): ValidacaoVenda {
  if (oportunidade.arquivadaEm !== null) return falha("oportunidade-arquivada");
  return ehEstadoTerminalVenda(oportunidade.estado) ? falha("oportunidade-encerrada") : valido;
}
function semMudanca(oportunidade: OportunidadeVenda): ResultadoMudancaVenda {
  return { ok: true, oportunidade: copiarOportunidade(oportunidade), eventos: [] };
}

export function criarOportunidadeVenda(
  entrada: EntradaCriacaoVenda, registradoEm: string,
): ResultadoMudancaVenda {
  if (!objeto(entrada)) return falha("estrutura-invalida");
  if (Object.hasOwn(entrada, "valorNegocioFechado")) return falha("valor-fechado-incompativel");
  const oportunidade: OportunidadeVenda = {
    id: entrada.id, contatoId: entrada.contatoId, userId: entrada.userId,
    criadoPor: entrada.userId, responsavelUsuarioId: entrada.userId,
    estado: "nova", encerramento: null, versao: 1,
    imovelTratado: entrada.imovelTratado ?? null, origem: entrada.origem ?? null,
    valores: {
      valorNegocioPrevisto: entrada.valorNegocioPrevisto ?? null,
      valorNegocioFechado: null, receitaPrevista: entrada.receitaPrevista ?? null,
    },
    criadoEm: registradoEm, atualizadoEm: registradoEm, arquivadaEm: null,
  };
  const validacao = validarOportunidadeVenda(oportunidade);
  if (!validacao.ok) return validacao;
  const copia = copiarOportunidade(oportunidade);
  return resultado(copia, {
    ...baseEvento(copia, { atorUsuarioId: entrada.userId, versaoEsperada: 1, registradoEm }),
    tipo: "oportunidade_criada",
    dados: {
      contatoId: copia.contatoId, imovelTratado: copiarImovel(copia.imovelTratado),
      origem: copiarOrigem(copia.origem), valores: { ...copia.valores },
    },
  });
}

export function transicionarOportunidadeVenda(
  oportunidade: OportunidadeVenda, transicao: TransicaoVenda, contexto: ContextoMudancaVenda,
): ResultadoMudancaVenda {
  const validacao = contextoValido(oportunidade, contexto);
  if (!validacao.ok) return validacao;
  if (!objeto(transicao) || !ehEstadoVenda(transicao.destino)) return falha("estado-invalido");
  const aberta = validarEdicaoAberta(oportunidade);
  if (!aberta.ok) return aberta;
  if (!podeTransicionarVenda(oportunidade.estado, transicao.destino)) return falha("transicao-invalida");
  const proxima = prepararMudanca(oportunidade, contexto);
  if (transicao.destino === "ganha") {
    const ganhoValido = validarGanhoVenda(oportunidade.imovelTratado, transicao.ganho, contexto.registradoEm);
    if (!ganhoValido.ok) return ganhoValido;
    const encerramento: GanhoVenda = {
      tipo: "ganho", confirmacaoExplicita: true, dataFato: transicao.ganho.dataFato,
      registroFormalizacao: transicao.ganho.registroFormalizacao.trim(),
    };
    const valorNegocioFechado = transicao.ganho.valorNegocioFechado ?? null;
    const ganha: OportunidadeVenda = {
      ...proxima, estado: "ganha", encerramento,
      valores: { ...proxima.valores, valorNegocioFechado },
    };
    return resultado(ganha, {
      ...baseEvento(ganha, contexto), tipo: "oportunidade_ganha",
      dados: { anterior: oportunidade.estado as "em_negociacao", encerramento: { ...encerramento }, valorNegocioFechado },
    });
  }
  if (transicao.destino === "perdida") {
    const perdaValida = validarPerdaVenda(transicao.perda, contexto.registradoEm);
    if (!perdaValida.ok) return perdaValida;
    const encerramento: PerdaVenda = {
      tipo: "perda", dataFato: transicao.perda.dataFato, motivo: transicao.perda.motivo,
      justificativa: transicao.perda.justificativa?.trim() || null,
    };
    const perdida: OportunidadeVenda = { ...proxima, estado: "perdida", encerramento };
    return resultado(perdida, {
      ...baseEvento(perdida, contexto), tipo: "oportunidade_perdida",
      dados: { anterior: oportunidade.estado as "nova" | "em_atendimento" | "em_negociacao", encerramento: { ...encerramento } },
    });
  }
  if (transicao.destino === "em_negociacao") {
    const imovelValido = validarEntradaNegociacao(oportunidade.imovelTratado);
    if (!imovelValido.ok) return imovelValido;
  }
  const atual: OportunidadeVenda = { ...proxima, estado: transicao.destino, encerramento: null };
  return resultado(atual, {
    ...baseEvento(atual, contexto), tipo: "etapa_alterada",
    dados: { anterior: oportunidade.estado as "nova" | "em_atendimento", atual: transicao.destino },
  });
}

export function alterarImovelTratadoVenda(
  oportunidade: OportunidadeVenda, imovelTratado: ImovelTratadoVenda | null, contexto: ContextoMudancaVenda,
): ResultadoMudancaVenda {
  const validacao = contextoValido(oportunidade, contexto);
  if (!validacao.ok) return validacao;
  const aberta = validarEdicaoAberta(oportunidade);
  if (!aberta.ok) return aberta;
  const identificacao = validarImovelTratadoVenda(imovelTratado);
  if (!identificacao.ok) return identificacao;
  if (oportunidade.estado === "em_negociacao" && !temImovelTratado(imovelTratado)) return falha("imovel-obrigatorio");
  const copia = copiarImovel(imovelTratado);
  if (JSON.stringify(copiarImovel(oportunidade.imovelTratado)) === JSON.stringify(copia)) return semMudanca(oportunidade);
  const atual: OportunidadeVenda = { ...prepararMudanca(oportunidade, contexto), imovelTratado: copia };
  return resultado(atual, {
    ...baseEvento(atual, contexto), tipo: "imovel_alterado",
    dados: { anterior: copiarImovel(oportunidade.imovelTratado), atual: copiarImovel(copia) },
  });
}

export function alterarValoresVenda(
  oportunidade: OportunidadeVenda,
  valores: Pick<ValoresVenda, "valorNegocioPrevisto" | "receitaPrevista">,
  contexto: ContextoMudancaVenda,
): ResultadoMudancaVenda {
  const validacao = contextoValido(oportunidade, contexto);
  if (!validacao.ok) return validacao;
  const aberta = validarEdicaoAberta(oportunidade);
  if (!aberta.ok) return aberta;
  const entrada = objeto(valores);
  if (!entrada) return falha("valor-invalido");
  if (Object.hasOwn(entrada, "valorNegocioFechado")) return falha("valor-fechado-incompativel");
  if (Object.keys(entrada).some((campo) => !["valorNegocioPrevisto", "receitaPrevista"].includes(campo))) {
    return falha("valor-invalido");
  }
  const novos: ValoresVenda = {
    valorNegocioPrevisto: valores.valorNegocioPrevisto, receitaPrevista: valores.receitaPrevista,
    valorNegocioFechado: null,
  };
  const validos = validarValoresVenda(novos);
  if (!validos.ok) return validos;
  if (novos.valorNegocioPrevisto === oportunidade.valores.valorNegocioPrevisto
    && novos.receitaPrevista === oportunidade.valores.receitaPrevista) return semMudanca(oportunidade);
  const atual: OportunidadeVenda = { ...prepararMudanca(oportunidade, contexto), valores: novos };
  return resultado(atual, {
    ...baseEvento(atual, contexto), tipo: "valor_alterado",
    dados: { anterior: { ...oportunidade.valores }, atual: { ...novos } },
  });
}

export function arquivarOportunidadeVenda(
  oportunidade: OportunidadeVenda, contexto: ContextoMudancaVenda,
): ResultadoMudancaVenda {
  const validacao = contextoValido(oportunidade, contexto);
  if (!validacao.ok) return validacao;
  if (!ehEstadoTerminalVenda(oportunidade.estado)) return falha("arquivamento-invalido");
  if (oportunidade.arquivadaEm !== null) return semMudanca(oportunidade);
  const atual: OportunidadeVenda = { ...prepararMudanca(oportunidade, contexto), arquivadaEm: contexto.registradoEm };
  return resultado(atual, {
    ...baseEvento(atual, contexto), tipo: "oportunidade_arquivada", dados: { estado: oportunidade.estado },
  });
}
