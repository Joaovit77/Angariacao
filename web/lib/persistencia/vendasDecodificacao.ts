/** Fronteira Vendas: nenhuma coerção de JSON remoto sem validação. */
import { validarOportunidadeVenda } from "../vendas/dominio";
import { dataOperacionalDeTimestamp, isoDeTimestamp, timestampDeIso } from "../datas";
import { ESTADOS_VENDA, MOTIVOS_PERDA_VENDA, ORIGENS_COMERCIAIS_VENDA, type EstadoAbertoVenda, type EstadoTerminalVenda,
  type GanhoVenda, type ImovelTratadoVenda, type OrigemComercialVenda, type PerdaVenda, type ValoresVenda } from "../vendas/tipos";
import { CODIGOS_ERRO_VENDA, MOTIVOS_ERRO_VENDA, type ErroOperacaoVenda, type EventoPersistidoVenda,
  type OportunidadePersistidaVenda, type RespostaOperacaoVenda } from "./vendasComandos";
import type { AvisoContatoVenda, ResolucaoInteressadoVenda } from "./vendasInteressado";
export class RespostaVendaInvalida extends Error {
  readonly codigo = "resposta-invalida";
  constructor() { super("Resposta incompatível com o contrato de Vendas."); }
}

const decimal = /^(-?)(0|[1-9][0-9]*)(?:\.([0-9]+))?(?:[eE]([+-]?[0-9]+))?$/;

/** Identidade decimal exata, independente de escala e notação científica. */
export function identidadeDecimalVenda(texto: string): string {
  const partes = decimal.exec(texto);
  if (!partes) throw new RespostaVendaInvalida();
  const fracao = partes[3] ?? "";
  let coeficiente = (partes[2] + fracao).replace(/^0+/, "");
  if (!coeficiente) return "0e0";
  let expoente = Number(partes[4] ?? "0") - fracao.length;
  if (!Number.isSafeInteger(expoente)) throw new RespostaVendaInvalida();
  while (coeficiente.endsWith("0")) { coeficiente = coeficiente.slice(0, -1); expoente++; }
  return partes[1] + coeficiente + "e" + expoente;
}

export function decodificarNumericVenda(valor: unknown): number | null {
  if (valor === null) return null;
  if (typeof valor !== "string" || !decimal.test(valor)) throw new RespostaVendaInvalida();
  const numero = Number(valor);
  if (!Number.isFinite(numero) || numero < 0 ||
      identidadeDecimalVenda(valor) !== identidadeDecimalVenda(String(numero))) throw new RespostaVendaInvalida();
  return numero === 0 ? 0 : numero;
}

export function codificarNumericVenda(valor: number | null): string | null {
  if (valor === null) return null;
  if (typeof valor !== "number" || !Number.isFinite(valor) || valor < 0) throw new RespostaVendaInvalida();
  return identidadeDecimalVenda(String(valor));
}

function objeto(valor: unknown): valor is Record<string, unknown> {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}
function campos(valor: unknown, nomes: readonly string[]): Record<string, unknown> {
  if (!objeto(valor) || Object.keys(valor).length !== nomes.length || nomes.some(n => !Object.hasOwn(valor,n))) throw new RespostaVendaInvalida();
  return valor;
}
function membro<T extends string>(valor: unknown, opcoes: readonly T[]): valor is T {
  return typeof valor === "string" && opcoes.some(opcao => opcao === valor);
}
function texto(valor: unknown): string { if (typeof valor !== "string") throw new RespostaVendaInvalida(); return valor; }
function textoAnulavel(valor: unknown): string | null { return valor === null ? null : texto(valor); }
function uuid(valor: unknown): string {
  const id = texto(valor); if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(id)) throw new RespostaVendaInvalida(); return id;
}
export function decodificarVersaoVenda(valor: unknown): number {
  if (typeof valor !== "string" || !/^[1-9][0-9]*$/.test(valor)) throw new RespostaVendaInvalida();
  const versao = Number(valor); if (!Number.isSafeInteger(versao) || versao < 1) throw new RespostaVendaInvalida(); return versao;
}
export function decodificarDataVenda(valor: unknown): string {
  const data = texto(valor); if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(data)) throw new RespostaVendaInvalida();
  const ano = Number(data.slice(0,4)), mes = Number(data.slice(5,7)), dia = Number(data.slice(8));
  const fevereiro = ano % 4 === 0 && (ano % 100 !== 0 || ano % 400 === 0) ? 29 : 28;
  const dias = [31,fevereiro,31,30,31,30,31,31,30,31,30,31];
  if (ano < 100 || mes < 1 || mes > 12 || dia < 1 || dia > dias[mes-1]) throw new RespostaVendaInvalida(); return data;
}
export function decodificarInstanteVenda(valor: unknown): string {
  const instante = texto(valor);
  if (!/^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{3}Z$/.test(instante) || instante.startsWith("0000")) throw new RespostaVendaInvalida();
  const timestamp = timestampDeIso(instante);
  if (timestamp === null || isoDeTimestamp(timestamp) !== instante) throw new RespostaVendaInvalida(); return instante;
}
function instanteAnulavel(valor: unknown): string | null { return valor === null ? null : decodificarInstanteVenda(valor); }
function imovel(valor: unknown): ImovelTratadoVenda | null {
  if (valor === null) return null;
  if (!objeto(valor)) throw new RespostaVendaInvalida();
  if (valor.modo === "referencia") { const r = campos(valor,["modo","imovelId"]); return {modo:"referencia",imovelId:uuid(r.imovelId)}; }
  const m = campos(valor,["modo","endereco","referencia","unidade","bloco","descricaoCurta"]);
  if (m.modo !== "manual") throw new RespostaVendaInvalida();
  const endereco = textoAnulavel(m.endereco), referencia = textoAnulavel(m.referencia);
  if (!endereco?.trim() && !referencia?.trim()) throw new RespostaVendaInvalida();
  return {modo:"manual",endereco,referencia,unidade:textoAnulavel(m.unidade),bloco:textoAnulavel(m.bloco),descricaoCurta:textoAnulavel(m.descricaoCurta)};
}
function origem(valor: unknown): OrigemComercialVenda | null {
  if (valor === null) return null;
  const o = campos(valor,["tipo","descricao"]); if (!membro(o.tipo,ORIGENS_COMERCIAIS_VENDA)) throw new RespostaVendaInvalida();
  return {tipo:o.tipo,descricao:textoAnulavel(o.descricao)};
}
function valores(valor: unknown): ValoresVenda {
  const v = campos(valor,["valorNegocioPrevisto","valorNegocioFechado","receitaPrevista"]);
  return {valorNegocioPrevisto:decodificarNumericVenda(v.valorNegocioPrevisto),valorNegocioFechado:decodificarNumericVenda(v.valorNegocioFechado),receitaPrevista:decodificarNumericVenda(v.receitaPrevista)};
}
function ganho(valor: unknown): GanhoVenda {
  const g = campos(valor,["tipo","confirmacaoExplicita","dataFato","registroFormalizacao"]);
  if (g.tipo !== "ganho" || g.confirmacaoExplicita !== true || !texto(g.registroFormalizacao).trim()) throw new RespostaVendaInvalida();
  return {tipo:"ganho",confirmacaoExplicita:true,dataFato:decodificarDataVenda(g.dataFato),registroFormalizacao:texto(g.registroFormalizacao)};
}
function perda(valor: unknown): PerdaVenda {
  const p = campos(valor,["tipo","dataFato","motivo","justificativa"]);
  if (p.tipo !== "perda" || !membro(p.motivo,MOTIVOS_PERDA_VENDA)) throw new RespostaVendaInvalida();
  const justificativa = textoAnulavel(p.justificativa); if (p.motivo === "outro" && !justificativa?.trim()) throw new RespostaVendaInvalida();
  return {tipo:"perda",dataFato:decodificarDataVenda(p.dataFato),motivo:p.motivo,justificativa};
}
function aberto(valor: unknown): EstadoAbertoVenda {
  if (valor !== "nova" && valor !== "em_atendimento" && valor !== "em_negociacao") throw new RespostaVendaInvalida(); return valor;
}
function terminal(valor: unknown): EstadoTerminalVenda { if (valor !== "ganha" && valor !== "perdida") throw new RespostaVendaInvalida(); return valor; }

export function decodificarOportunidadeVenda(valor: unknown): OportunidadePersistidaVenda {
  const o = campos(valor,["id","userId","contatoId","criadoPor","responsavelUsuarioId","estado","versao","imovelTratado","origem","valores","encerramento","encerradoEm","criadoEm","atualizadoEm","arquivadaEm"]);
  if (!membro(o.estado,ESTADOS_VENDA)) throw new RespostaVendaInvalida();
  const base = {id:uuid(o.id),userId:uuid(o.userId),contatoId:uuid(o.contatoId),criadoPor:uuid(o.criadoPor),responsavelUsuarioId:uuid(o.responsavelUsuarioId),
    versao:decodificarVersaoVenda(o.versao),imovelTratado:imovel(o.imovelTratado),origem:origem(o.origem),valores:valores(o.valores),
    criadoEm:decodificarInstanteVenda(o.criadoEm),atualizadoEm:decodificarInstanteVenda(o.atualizadoEm),arquivadaEm:instanteAnulavel(o.arquivadaEm),encerradoEm:instanteAnulavel(o.encerradoEm)};
  let oportunidade: OportunidadePersistidaVenda;
  if (o.estado === "ganha") oportunidade = {...base,estado:"ganha",encerramento:ganho(o.encerramento)};
  else if (o.estado === "perdida") oportunidade = {...base,estado:"perdida",encerramento:perda(o.encerramento)};
  else { if (o.encerramento !== null) throw new RespostaVendaInvalida(); oportunidade = {...base,estado:o.estado,encerramento:null}; }
  if (!validarOportunidadeVenda(oportunidade).ok ||
    ((oportunidade.estado === "ganha" || oportunidade.estado === "perdida") !== (base.encerradoEm !== null)) ||
    (base.encerradoEm !== null && (base.encerradoEm < base.criadoEm || base.encerradoEm > base.atualizadoEm))) throw new RespostaVendaInvalida();
  return oportunidade;
}

export function decodificarEventoVenda(valor: unknown): EventoPersistidoVenda {
  const e = campos(valor,["id","userId","oportunidadeId","tipo","atorUsuarioId","registradoEm","dataFato","versao","chaveIdempotencia","versaoContrato","dados"]);
  if (e.versaoContrato !== 1 || !texto(e.chaveIdempotencia).trim()) throw new RespostaVendaInvalida();
  const base = {id:uuid(e.id),userId:uuid(e.userId),oportunidadeId:uuid(e.oportunidadeId),atorUsuarioId:uuid(e.atorUsuarioId),
    registradoEm:decodificarInstanteVenda(e.registradoEm),versao:decodificarVersaoVenda(e.versao),chaveIdempotencia:texto(e.chaveIdempotencia),
    versaoContrato:1 as const,dataFato:e.dataFato === null ? null : decodificarDataVenda(e.dataFato)};
  if (base.atorUsuarioId !== base.userId || ((e.tipo === "oportunidade_ganha" || e.tipo === "oportunidade_perdida") !== (base.dataFato !== null))) throw new RespostaVendaInvalida();
  const diaRegistro = dataOperacionalDeTimestamp(timestampDeIso(base.registradoEm)!)?.padStart(10,"0");
  if ((e.tipo !== "oportunidade_criada" && base.versao < 2) ||
      (base.dataFato !== null && base.dataFato > (diaRegistro ?? ""))) throw new RespostaVendaInvalida();
  switch (e.tipo) {
    case "oportunidade_criada": { const d = campos(e.dados,["contatoId","imovelTratado","origem","valores"]);
      if (base.versao !== 1) throw new RespostaVendaInvalida();
      const v = valores(d.valores); if (v.valorNegocioFechado !== null) throw new RespostaVendaInvalida();
      return {...base,tipo:e.tipo,dados:{contatoId:uuid(d.contatoId),imovelTratado:imovel(d.imovelTratado),origem:origem(d.origem),valores:v}}; }
    case "etapa_alterada": { const d = campos(e.dados,["anterior","atual"]); const a = aberto(d.anterior), b = aberto(d.atual);
      if (!((a === "nova" && b === "em_atendimento") || (a === "em_atendimento" && b === "em_negociacao"))) throw new RespostaVendaInvalida();
      return {...base,tipo:e.tipo,dados:{anterior:a,atual:b}}; }
    case "imovel_alterado": { const d = campos(e.dados,["anterior","atual"]); return {...base,tipo:e.tipo,dados:{anterior:imovel(d.anterior),atual:imovel(d.atual)}}; }
    case "valor_alterado": { const d = campos(e.dados,["anterior","atual"]); const a = valores(d.anterior), b = valores(d.atual);
      if (a.valorNegocioFechado !== null || b.valorNegocioFechado !== null) throw new RespostaVendaInvalida();
      return {...base,tipo:e.tipo,dados:{anterior:a,atual:b}}; }
    case "oportunidade_ganha": { const d = campos(e.dados,["anterior","encerramento","valorNegocioFechado"]); const g = ganho(d.encerramento);
      if (d.anterior !== "em_negociacao" || g.dataFato !== base.dataFato) throw new RespostaVendaInvalida();
      return {...base,tipo:e.tipo,dados:{anterior:"em_negociacao",encerramento:g,valorNegocioFechado:decodificarNumericVenda(d.valorNegocioFechado)}}; }
    case "oportunidade_perdida": { const d = campos(e.dados,["anterior","encerramento"]); const p = perda(d.encerramento);
      if (p.dataFato !== base.dataFato) throw new RespostaVendaInvalida(); return {...base,tipo:e.tipo,dados:{anterior:aberto(d.anterior),encerramento:p}}; }
    case "oportunidade_arquivada": { const d = campos(e.dados,["estado"]); return {...base,tipo:e.tipo,dados:{estado:terminal(d.estado)}}; }
    default: throw new RespostaVendaInvalida();
  }
}

export function decodificarRespostaVenda(valor: unknown): RespostaOperacaoVenda {
  const r = campos(valor,["contrato","ok","oportunidade","evento","noOp"]);
  if (r.contrato !== "vendas-b2-v1" || r.ok !== true || typeof r.noOp !== "boolean") throw new RespostaVendaInvalida();
  const oportunidade = decodificarOportunidadeVenda(r.oportunidade), evento = r.evento === null ? null : decodificarEventoVenda(r.evento);
  if (r.noOp !== (evento === null)) throw new RespostaVendaInvalida();
  if (evento && (evento.oportunidadeId !== oportunidade.id || evento.userId !== oportunidade.userId || evento.versao !== oportunidade.versao || evento.registradoEm !== oportunidade.atualizadoEm)) throw new RespostaVendaInvalida();
  if (evento) {
    const igual = (a: unknown,b: unknown) => JSON.stringify(a) === JSON.stringify(b); // Comparação de objetos já decodificados; não é fingerprint.
    switch (evento.tipo) {
      case "oportunidade_criada": if (oportunidade.estado !== "nova" || evento.dados.contatoId !== oportunidade.contatoId || !igual(evento.dados.imovelTratado,oportunidade.imovelTratado) || !igual(evento.dados.origem,oportunidade.origem) || !igual(evento.dados.valores,oportunidade.valores)) throw new RespostaVendaInvalida(); break;
      case "etapa_alterada": if (evento.dados.atual !== oportunidade.estado) throw new RespostaVendaInvalida(); break;
      case "imovel_alterado": if (!igual(evento.dados.atual,oportunidade.imovelTratado) || oportunidade.encerramento !== null) throw new RespostaVendaInvalida(); break;
      case "valor_alterado": if (!igual(evento.dados.atual,oportunidade.valores) || oportunidade.encerramento !== null) throw new RespostaVendaInvalida(); break;
      case "oportunidade_ganha": if (oportunidade.estado !== "ganha" || !igual(evento.dados.encerramento,oportunidade.encerramento) || evento.dados.valorNegocioFechado !== oportunidade.valores.valorNegocioFechado) throw new RespostaVendaInvalida(); break;
      case "oportunidade_perdida": if (oportunidade.estado !== "perdida" || !igual(evento.dados.encerramento,oportunidade.encerramento)) throw new RespostaVendaInvalida(); break;
      case "oportunidade_arquivada": if (evento.dados.estado !== oportunidade.estado || oportunidade.arquivadaEm !== evento.registradoEm) throw new RespostaVendaInvalida(); break;
    }
  }
  return {contrato:"vendas-b2-v1",ok:true,oportunidade,evento,noOp:r.noOp};
}

export function decodificarErroVenda(valor: unknown): ErroOperacaoVenda {
  if (!objeto(valor)) return {codigo:"transporte-indisponivel",motivo:null};
  if (valor.code === "") return {codigo:"transporte-indisponivel",motivo:null};
  if (valor.code === "42501") return {codigo:"nao-autenticado",motivo:null};
  if (typeof valor.details !== "string") return {codigo:"falha-interna",motivo:null};
  let detalhe: unknown;
  try { detalhe = JSON.parse(valor.details); } catch { return {codigo:"falha-interna",motivo:null}; }
  if (!objeto(detalhe) || Object.keys(detalhe).length !== 3 || detalhe.contrato !== "vendas-b2-v1" || !membro(detalhe.codigo,CODIGOS_ERRO_VENDA) ||
    (detalhe.motivo !== null && !membro(detalhe.motivo,MOTIVOS_ERRO_VENDA))) return {codigo:"falha-interna",motivo:null};
  const esperado = detalhe.codigo === "nao-autenticado" ? "PT401" : detalhe.codigo === "nao-encontrado" ? "PT404" :
    detalhe.codigo === "versao-conflitante" || detalhe.codigo === "chave-idempotencia-conflitante" ||
    detalhe.codigo === "telefone-ja-cadastrado" || detalhe.codigo === "telefone-em-revisao" ||
    detalhe.codigo === "interessado-ambiguo" || detalhe.codigo === "interessado-indisponivel" ? "PT409" :
    detalhe.codigo === "conflito-transitorio" ? "PT503" : detalhe.codigo === "falha-interna" || detalhe.codigo === "dado-persistido-invalido" ? "PT500" : "PT422";
  if (valor.code !== esperado || detalhe.codigo === "resposta-invalida" || detalhe.codigo === "transporte-indisponivel") return {codigo:"falha-interna",motivo:null};
  return {codigo:detalhe.codigo,motivo:detalhe.motivo};
}

/** Formato PostgREST explícito: valida calendário/precisão antes de converter o offset. */
export function normalizarInstanteBancoVenda(valor: unknown): string {
  const textoBanco = texto(valor);
  const partes = /^([0-9]{4}-[0-9]{2}-[0-9]{2})[T ]([0-9]{2}:[0-9]{2}:[0-9]{2})(?:\.([0-9]{1,3}))?(Z|[+-][0-9]{2}:[0-9]{2})$/.exec(textoBanco);
  if (!partes || partes[1].startsWith("0000")) throw new RespostaVendaInvalida();
  const local = partes[1] + "T" + partes[2] + "." + (partes[3] ?? "").padEnd(3,"0") + "Z";
  decodificarInstanteVenda(local);
  let offset = 0;
  if (partes[4] !== "Z") {
    const horas = Number(partes[4].slice(1,3)), minutos = Number(partes[4].slice(4));
    if (horas > 23 || minutos > 59) throw new RespostaVendaInvalida();
    offset = (horas*60+minutos)*60_000*(partes[4][0] === "+" ? 1 : -1);
  }
  const timestamp = timestampDeIso(local);
  if (timestamp === null) throw new RespostaVendaInvalida();
  return decodificarInstanteVenda(isoDeTimestamp(timestamp-offset));
}
function instanteBancoAnulavel(valor: unknown): string | null { return valor === null ? null : normalizarInstanteBancoVenda(valor); }

export function decodificarLinhaOportunidadeVenda(valor: unknown, referencia: unknown = null): OportunidadePersistidaVenda {
  const o = campos(valor,["id","user_id","contato_id","estado","versao","imovel_modo","imovel_referencia_id","manual_endereco","manual_referencia","manual_unidade","manual_bloco","manual_descricao_curta","origem_tipo","origem_descricao","valor_negocio_previsto","valor_negocio_fechado","receita_prevista","criado_por","responsavel_usuario_id","encerramento_tipo","data_fato","confirmacao_explicita","registro_formalizacao","motivo_perda","justificativa_perda","encerrado_em","created_at","updated_at","arquivado_em"]);
  let tratado: unknown = null;
  const manuais = [o.manual_endereco,o.manual_referencia,o.manual_unidade,o.manual_bloco,o.manual_descricao_curta];
  if (o.imovel_modo === "referencia") {
    const r = campos(referencia,["id","user_id","imovel_id","imovel_id_original","codigo","referencia","endereco","unidade","bloco","capturado_em"]);
    if (uuid(r.id) !== uuid(o.imovel_referencia_id) || uuid(r.user_id) !== uuid(o.user_id) || manuais.some(v=>v!==null) || (r.imovel_id !== null && uuid(r.imovel_id) !== uuid(r.imovel_id_original))) throw new RespostaVendaInvalida();
    for (const campo of ["codigo","referencia","endereco","unidade","bloco"]) textoAnulavel(r[campo]);
    normalizarInstanteBancoVenda(r.capturado_em);
    tratado = {modo:"referencia",imovelId:uuid(r.imovel_id_original)};
  } else if (o.imovel_modo === "manual") {
    if (o.imovel_referencia_id !== null || referencia !== null) throw new RespostaVendaInvalida();
    tratado = {modo:"manual",endereco:o.manual_endereco,referencia:o.manual_referencia,unidade:o.manual_unidade,bloco:o.manual_bloco,descricaoCurta:o.manual_descricao_curta};
  } else if (o.imovel_modo !== null || o.imovel_referencia_id !== null || manuais.some(v=>v!==null) || referencia !== null) throw new RespostaVendaInvalida();
  let encerramento: unknown = null;
  if (o.estado === "ganha") {
    if (o.encerramento_tipo !== "ganho" || o.motivo_perda !== null || o.justificativa_perda !== null) throw new RespostaVendaInvalida();
    encerramento = {tipo:"ganho",confirmacaoExplicita:o.confirmacao_explicita,dataFato:o.data_fato,registroFormalizacao:o.registro_formalizacao};
  } else if (o.estado === "perdida") {
    if (o.encerramento_tipo !== "perda" || o.confirmacao_explicita !== null || o.registro_formalizacao !== null) throw new RespostaVendaInvalida();
    encerramento = {tipo:"perda",dataFato:o.data_fato,motivo:o.motivo_perda,justificativa:o.justificativa_perda};
  } else if ([o.encerramento_tipo,o.data_fato,o.confirmacao_explicita,o.registro_formalizacao,o.motivo_perda,o.justificativa_perda].some(v=>v!==null)) throw new RespostaVendaInvalida();
  if (o.origem_tipo === null && o.origem_descricao !== null) throw new RespostaVendaInvalida();
  return decodificarOportunidadeVenda({id:o.id,userId:o.user_id,contatoId:o.contato_id,criadoPor:o.criado_por,responsavelUsuarioId:o.responsavel_usuario_id,estado:o.estado,
    versao:typeof o.versao === "number" && Number.isSafeInteger(o.versao) ? String(o.versao) : o.versao,
    imovelTratado:tratado,origem:o.origem_tipo === null ? null : {tipo:o.origem_tipo,descricao:o.origem_descricao},
    valores:{valorNegocioPrevisto:o.valor_negocio_previsto,valorNegocioFechado:o.valor_negocio_fechado,receitaPrevista:o.receita_prevista},encerramento,
    encerradoEm:instanteBancoAnulavel(o.encerrado_em),criadoEm:normalizarInstanteBancoVenda(o.created_at),atualizadoEm:normalizarInstanteBancoVenda(o.updated_at),arquivadaEm:instanteBancoAnulavel(o.arquivado_em)});
}

export function decodificarLinhaEventoVenda(valor: unknown): EventoPersistidoVenda {
  const e = campos(valor,["id","user_id","oportunidade_id","tipo","ator_usuario_id","registrado_em","data_fato","versao","payload","chave_idempotencia"]);
  const payload = campos(e.payload,["versaoContrato","dados"]);
  return decodificarEventoVenda({id:e.id,userId:e.user_id,oportunidadeId:e.oportunidade_id,tipo:e.tipo,atorUsuarioId:e.ator_usuario_id,registradoEm:normalizarInstanteBancoVenda(e.registrado_em),
    dataFato:e.data_fato,versao:typeof e.versao === "number" && Number.isSafeInteger(e.versao) ? String(e.versao) : e.versao,
    chaveIdempotencia:e.chave_idempotencia,versaoContrato:payload.versaoContrato,dados:payload.dados});
}

/* Resolução do interessado (B3.2/B3.3): objeto fechado por status, só ids e marcas.
   Qualquer desvio é resposta inválida (erro local), nunca um resultado aceito. */
const AVISOS_INTERESSADO: readonly AvisoContatoVenda[] = ["contato-arquivado","revisao-pendente"];
function candidatosInteressado(valor: unknown, minimo: number): string[] {
  if (!Array.isArray(valor) || valor.length < minimo) throw new RespostaVendaInvalida();
  const ids = valor.map(uuid);
  // O banco ordena por collate "C": ordem de bytes, estritamente crescente (sem repetição).
  for (let i = 1; i < ids.length; i++) if (!(ids[i-1] < ids[i])) throw new RespostaVendaInvalida();
  return ids;
}
export function decodificarResolucaoInteressadoVenda(valor: unknown): ResolucaoInteressadoVenda {
  if (!objeto(valor) || valor.contrato !== "vendas-b3-resolucao-v1") throw new RespostaVendaInvalida();
  switch (valor.status) {
    case "telefone-invalido": case "nao-encontrado":
      campos(valor,["contrato","status"]); return {status:valor.status};
    case "em-revisao": {
      const [primeiro, ...demais] = candidatosInteressado(campos(valor,["contrato","status","candidatos"]).candidatos,1);
      return {status:"em-revisao",candidatos:[primeiro,...demais]};
    }
    case "ambiguo": {
      const [primeiro, segundo, ...demais] = candidatosInteressado(campos(valor,["contrato","status","candidatos"]).candidatos,2);
      return {status:"ambiguo",candidatos:[primeiro,segundo,...demais]};
    }
    case "encontrado": {
      const r = campos(valor,["contrato","status","contatoId","seguiuFusao","avisos"]);
      if (typeof r.seguiuFusao !== "boolean" || !Array.isArray(r.avisos)) throw new RespostaVendaInvalida();
      const posicoes = r.avisos.map(aviso => AVISOS_INTERESSADO.indexOf(aviso as AvisoContatoVenda));
      if (posicoes.some((p, i) => p < 0 || (i > 0 && p <= posicoes[i-1]))) throw new RespostaVendaInvalida();
      return {status:"encontrado",contatoId:uuid(r.contatoId),seguiuFusao:r.seguiuFusao,avisos:posicoes.map(p => AVISOS_INTERESSADO[p])};
    }
    case "indisponivel": {
      const r = campos(valor,["contrato","status","motivo"]);
      if (r.motivo !== "fusao-invalida" && r.motivo !== "contato-anonimizado") throw new RespostaVendaInvalida();
      return {status:"indisponivel",motivo:r.motivo};
    }
    default: throw new RespostaVendaInvalida();
  }
}
