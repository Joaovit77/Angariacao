import { describe, expect, it } from "vitest";
import { codificarNumericVenda, decodificarNumericVenda, decodificarRespostaVenda, decodificarErroVenda,
  decodificarDataVenda, decodificarInstanteVenda, normalizarInstanteBancoVenda, decodificarVersaoVenda,
  decodificarLinhaOportunidadeVenda, decodificarLinhaEventoVenda } from "../lib/persistencia/vendasDecodificacao";
import { executarComandoVenda } from "../lib/persistencia/vendas";

export const VETORES_NUMERIC_VENDAS: readonly (string | null)[] = [
  null, "0", "-0", "0.0", "1", "1.0", "1e0", "0.1", "0.10000000000000001",
  "1.23456789123456789", "1.7976931348623157e308", "1.7976931348623158e308",
  "1.7976931348623159e308", "5e-324", "4e-324", "1e-324", "2.4703282292062327e-324",
  "2.4703282292062328e-324", "1e1000", "1e-1000", "NaN", "Infinity", "-Infinity",
  "-0.001", "9007199254740991", "9007199254740992", "9007199254740993",
  "999999999999999900000", "1000000000000000000000", "1e23",
  "1000000000000000100", "2.2250738585072014e-308", "2.225073858507201e-308",
  "0.9999999999999999", "1.0000000000000002", "1.0000000000000001",
  "0.000001", "0.0000001", " 1", "+1", "01", "1.", ".1", "1,5",
];

describe("Vendas B2: numeric sem perda", () => {
  it.each([null, "0", "-0", "1.0", "1e0", "0.1", "5e-324", "1.7976931348623157e308"])("aceita %s", valor => {
    expect(decodificarNumericVenda(valor)).toBe(valor === null ? null : Number(valor) === 0 ? 0 : Number(valor));
  });
  it.each(["1e1000", "1e-1000", "NaN", "Infinity", "-1", "0.10000000000000001", "9007199254740993", "4e-324", "1.7976931348623158e308"])("recusa %s", valor => {
    expect(() => decodificarNumericVenda(valor)).toThrow();
  });
  it("preserva os extremos Number e não impõe escala monetária", () => {
    for (const numero of [0, 0.1, 1.23456789, Number.MIN_VALUE, Number.MAX_VALUE]) {
      expect(decodificarNumericVenda(codificarNumericVenda(numero))).toBe(numero);
    }
  });
  it.each([undefined, true, {}, [], 1, ""])("não confunde tipos JSON: %j", valor => {
    expect(() => decodificarNumericVenda(valor)).toThrow();
  });
});

const id = "11111111-1111-4111-8111-111111111111", contatoId = "22222222-2222-4222-8222-222222222222";
const instante = "2026-10-04T20:00:00.123Z";
function oportunidadeWire() {
  return {id,userId:id,contatoId,criadoPor:id,responsavelUsuarioId:id,estado:"nova",versao:"1",imovelTratado:null,origem:null,
    valores:{valorNegocioPrevisto:null,valorNegocioFechado:null,receitaPrevista:null},encerramento:null,encerradoEm:null,
    criadoEm:instante,atualizadoEm:instante,arquivadaEm:null};
}
function respostaWire() {
  return {contrato:"vendas-b2-v1",ok:true,oportunidade:oportunidadeWire(),evento:{id:contatoId,userId:id,oportunidadeId:id,tipo:"oportunidade_criada",atorUsuarioId:id,
    registradoEm:instante,dataFato:null,versao:"1",chaveIdempotencia:" chave ",versaoContrato:1,dados:{contatoId,imovelTratado:null,origem:null,valores:{valorNegocioPrevisto:null,valorNegocioFechado:null,receitaPrevista:null}}},noOp:false};
}
describe("Vendas B2: resposta fechada e cliente", () => {
  it("decodifica resposta e recusa campos desconhecidos/incoerências", () => {
    expect(decodificarRespostaVenda(respostaWire()).oportunidade.versao).toBe(1);
    for (const r of [
      {...respostaWire(),campoNovo:null}, {...respostaWire(),evento:null}, {...respostaWire(),noOp:true},
      {...respostaWire(),oportunidade:{...oportunidadeWire(),versao:"9007199254740992"}},
      {...respostaWire(),oportunidade:{...oportunidadeWire(),userId:contatoId}},
      {...respostaWire(),evento:{...respostaWire().evento,dados:{...respostaWire().evento.dados,contatoId:id}}},
      {...respostaWire(),evento:{...respostaWire().evento,payload:{}}},
    ]) expect(() => decodificarRespostaVenda(r)).toThrow();
  });
  it.each(["0","01","1.0","1e0","9007199254740992",1,null])("versão remota inválida %s", valor => expect(()=>decodificarVersaoVenda(valor)).toThrow());
  it("versão máxima é decodificável, sem permitir avanço silencioso", () => expect(decodificarVersaoVenda("9007199254740991")).toBe(Number.MAX_SAFE_INTEGER));
  it("linha histórica também recusa fato futuro e evento de alteração em versão 1", () => {
    const e = respostaWire().evento;
    const linha = {id:e.id,user_id:e.userId,oportunidade_id:e.oportunidadeId,tipo:"oportunidade_perdida",ator_usuario_id:e.atorUsuarioId,
      registrado_em:instante,data_fato:"2026-10-05",versao:"2",chave_idempotencia:e.chaveIdempotencia,
      payload:{versaoContrato:1,dados:{anterior:"nova",encerramento:{tipo:"perda",dataFato:"2026-10-05",motivo:"desistencia_interessado",justificativa:null}}}};
    expect(()=>decodificarLinhaEventoVenda(linha)).toThrow();
    expect(()=>decodificarLinhaEventoVenda({...linha,data_fato:null,versao:"1",tipo:"etapa_alterada",payload:{versaoContrato:1,dados:{anterior:"nova",atual:"em_atendimento"}}})).toThrow();
  });
  it("erros por SQLSTATE/código; mensagens livres e detalhes internos não viram contrato", () => {
    expect(decodificarErroVenda({code:"PT409",message:"qualquer texto",details:JSON.stringify({contrato:"vendas-b2-v1",codigo:"versao-conflitante",motivo:null})})).toEqual({codigo:"versao-conflitante",motivo:null});
    for (const erro of [{code:"23514",details:"constraint interna"},{code:"PT409",details:JSON.stringify({contrato:"vendas-b2-v1",codigo:"versao-conflitante",motivo:null,sql:"interno"})},{code:"PT422",details:JSON.stringify({contrato:"vendas-b2-v1",codigo:"versao-conflitante",motivo:null})}]) expect(decodificarErroVenda(erro).codigo).toBe("falha-interna");
    expect(decodificarErroVenda({code:""}).codigo).toBe("transporte-indisponivel");
  });
  it("cliente usa a porta específica e decimal textual, preservando chave e versão", async () => {
    const chamadas: unknown[] = [];
    const cliente = {rpc:async (nome: string,args: unknown) => { chamadas.push({nome,args}); return {data:{...respostaWire(),evento:null,noOp:true},error:null}; }};
    const comando = {chaveIdempotencia:" chave ",oportunidadeId:id,versaoEsperada:1,valorNegocioPrevisto:0.1,receitaPrevista:null};
    expect((await executarComandoVenda("alterar_valores",comando,cliente)).ok).toBe(true);
    expect(chamadas).toEqual([{nome:"vendas_alterar_valores",args:{p_comando:{...comando,valorNegocioPrevisto:"1e-1"}}}]);
    expect(comando.valorNegocioPrevisto).toBe(0.1);
  });
  it("falha de rede não inventa rollback nem troca a chave; resposta inválida é explícita", async () => {
    const comando = {chaveIdempotencia:"mesma-chave",contatoId}; let chamadas = 0;
    const cliente = {rpc:async () => { chamadas++; throw new Error("Conexão interrompida."); }};
    expect(await executarComandoVenda("criar",comando,cliente)).toEqual({ok:false,erro:{codigo:"transporte-indisponivel",motivo:null}});
    expect(chamadas).toBe(1);
    expect(await executarComandoVenda("criar",comando,{rpc:async()=>({data:{ok:true},error:null})})).toEqual({ok:false,erro:{codigo:"resposta-invalida",motivo:null}});
  });
  it("não envia número inválido ao servidor", async () => {
    let chamadas = 0;
    const r = await executarComandoVenda("criar",{chaveIdempotencia:"chave",contatoId,valorNegocioPrevisto:Infinity},{rpc:async()=>{chamadas++;return {data:null,error:null};}});
    expect(r).toEqual({ok:false,erro:{codigo:"valor-invalido",motivo:null}}); expect(chamadas).toBe(0);
  });
});

describe("Vendas B2: datas e linhas brutas", () => {
  it.each(["0100-01-01","9999-12-31","2000-02-29","2011-12-30","1994-12-31"])("civil %s", valor => expect(decodificarDataVenda(valor)).toBe(valor));
  it.each(["0000-01-01","0099-12-31","2100-02-29","2026-02-30","2026-1-01","2026-01-01 BC"])("civil inválido %s", valor => expect(()=>decodificarDataVenda(valor)).toThrow());
  it.each(["0000-01-01T00:00:00.000Z","2026-02-30T00:00:00.000Z","2026-01-01T00:00:00Z","2026-01-01T00:00:00.000+00:00","2026-01-01T00:00:00.0001Z"])("instante de domínio estrito %s", valor=>expect(()=>decodificarInstanteVenda(valor)).toThrow());
  it("normaliza offset explícito do banco e independe do timezone do processo", () => {
    const anterior = process.env.TZ;
    try { for (const fuso of ["UTC","America/Sao_Paulo","Pacific/Apia"]) { process.env.TZ=fuso;
      expect(normalizarInstanteBancoVenda("2026-10-04T17:00:00.123-03:00")).toBe(instante);
      expect(decodificarDataVenda("2011-12-30")).toBe("2011-12-30");
    } } finally { if (anterior === undefined) delete process.env.TZ; else process.env.TZ=anterior; }
    for (const valor of ["2026-02-30T17:00:00-03:00","2026-10-04T17:00:00.1234-03:00","2026-10-04T17:00:00","2026-10-04T17:00:00+24:00"]) expect(()=>normalizarInstanteBancoVenda(valor)).toThrow();
  });
  it("mapeia linha B1, referência histórica com ponteiro nulo e recusa coerção numeric", () => {
    const referenciaId = "33333333-3333-4333-8333-333333333333";
    const linha = {id,user_id:id,contato_id:contatoId,estado:"nova",versao:"1",imovel_modo:"referencia",imovel_referencia_id:referenciaId,
      manual_endereco:null,manual_referencia:null,manual_unidade:null,manual_bloco:null,manual_descricao_curta:null,origem_tipo:null,origem_descricao:null,
      valor_negocio_previsto:"0.1",valor_negocio_fechado:null,receita_prevista:null,criado_por:id,responsavel_usuario_id:id,
      encerramento_tipo:null,data_fato:null,confirmacao_explicita:null,registro_formalizacao:null,motivo_perda:null,justificativa_perda:null,
      encerrado_em:null,created_at:instante,updated_at:instante,arquivado_em:null};
    const referencia = {id:referenciaId,user_id:id,imovel_id:null,imovel_id_original:contatoId,codigo:null,referencia:null,endereco:"Fixture",unidade:null,bloco:null,capturado_em:instante};
    expect(decodificarLinhaOportunidadeVenda(linha,referencia).imovelTratado).toEqual({modo:"referencia",imovelId:contatoId});
    for (const valor of [0.1,"1e1000","0.10000000000000001"]) expect(()=>decodificarLinhaOportunidadeVenda({...linha,valor_negocio_previsto:valor},referencia)).toThrow();
    expect(()=>decodificarLinhaOportunidadeVenda(linha,{...referencia,user_id:contatoId})).toThrow();
    const e = respostaWire().evento;
    expect(decodificarLinhaEventoVenda({id:e.id,user_id:e.userId,oportunidade_id:e.oportunidadeId,tipo:e.tipo,ator_usuario_id:e.atorUsuarioId,registrado_em:instante,data_fato:null,versao:"1",payload:{versaoContrato:1,dados:e.dados},chave_idempotencia:e.chaveIdempotencia}).tipo).toBe("oportunidade_criada");
  });
});
