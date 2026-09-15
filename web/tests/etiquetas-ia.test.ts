/* ================================================================
   C8 — ETIQUETAS POR IA: contrato puro e módulo de servidor

   Metade pura: o esquema é GERADO do catálogo, o parse é tudo-ou-nada, o
   fingerprint é só conteúdo e o prompt só classifica. Metade de servidor:
   `classificarAvistamento` com banco, RPCs e executor falsos — saída válida
   vira etiquetas com proveniência completa; IA indisponível não gera
   etiqueta nem erro ao usuário; estrutura quebrada descarta tudo; código
   fora do catálogo, confiança baixa e evidência ausente caem um a um, com
   contador; e o piso gravado no run é o da execução.

   Nenhum teste chama IA real: o executor é um objeto do teste.
   ================================================================ */
import { describe, expect, it, vi } from "vitest";

const registro = vi.hoisted(() => ({ registrarEvento: vi.fn(), registrarUsoIa: vi.fn() }));
vi.mock("@/lib/servidor/registro", () => registro);

import { CATALOGO_ETIQUETAS, VERSAO_CATALOGO_ETIQUETAS, etiquetasClassificaveisDoCatalogo } from "@/lib/calculo/catalogoEtiquetas";
import { CONFIANCA_MINIMA_ETIQUETA } from "@/lib/calculo/etiquetasProspeccao";
import {
  ESQUEMA_ETIQUETAS,
  MIN_TEXTO_OBSERVACAO_CLASSIFICACAO,
  VERSAO_CLASSIFICADOR_ETIQUETAS,
  interpretarSaidaClassificador,
  materialFingerprintClassificacao,
  observacaoClassificavel,
  promptClassificarObservacao,
} from "@/lib/calculo/ia";
import { TIPOS_IMOVEL } from "@/lib/constantes";
import { CONFIGURACAO_IA_PADRAO, type VersaoConfiguracaoIa } from "@/lib/ia/configuracao";
import { inicioDoDiaOperacionalISO } from "@/lib/datas";
import {
  TETO_DIARIO_CLASSIFICACOES,
  TIPO_PEDIDO_CLASSIFICACAO,
  classificarAvistamento,
  fingerprintClassificacao,
  tetoDiarioClassificacao,
  type DependenciasClassificacao,
  type TetoDiarioClassificacao,
} from "@/lib/servidor/classificacaoProspeccao";
import type { ExecutorOpenAI } from "@/lib/servidor/ia/executor-openai";
import { ChamadaOpenAIRealNaoAutorizadaError } from "@/lib/servidor/openai-real";

/* ---------------- Parte pura ---------------- */

describe("ESQUEMA_ETIQUETAS é gerado do catálogo e fechado para strict:true", () => {
  it("o enum de código é exatamente a lista de etiquetas classificáveis, e o de categoria as duas classificadas", () => {
    const item = ESQUEMA_ETIQUETAS.properties.etiquetas.items;
    expect([...item.properties.codigo.enum]).toEqual(etiquetasClassificaveisDoCatalogo().map((e) => e.codigo));
    expect([...item.properties.categoria.enum]).toEqual(["estado-visual", "sinal-de-prospeccao"]);
    // Nenhuma derivada entra no vocabulário do modelo.
    for (const derivada of [...CATALOGO_ETIQUETAS.localizacao, ...CATALOGO_ETIQUETAS.historico]) {
      expect(item.properties.codigo.enum).not.toContain(derivada.codigo);
    }
  });

  it("tipo é campo de nível superior com enum TIPOS_IMOVEL + null, e não é etiqueta", () => {
    expect([...ESQUEMA_ETIQUETAS.properties.tipo.enum]).toEqual([...TIPOS_IMOVEL, null]);
    expect(ESQUEMA_ETIQUETAS.properties.etiquetas.items.properties).not.toHaveProperty("tipo");
  });

  it("todo objeto lista tudo em required e fecha additionalProperties", () => {
    expect([...ESQUEMA_ETIQUETAS.required]).toEqual(Object.keys(ESQUEMA_ETIQUETAS.properties));
    expect(ESQUEMA_ETIQUETAS.additionalProperties).toBe(false);
    const item = ESQUEMA_ETIQUETAS.properties.etiquetas.items;
    expect([...item.required]).toEqual(Object.keys(item.properties));
    expect(item.additionalProperties).toBe(false);
  });
});

describe("interpretarSaidaClassificador é tudo ou nada", () => {
  const valida = { tipo: "Casa", tipoConfianca: 80, etiquetas: [
    { categoria: "sinal-de-prospeccao", codigo: "imovel-fechado", confianca: 90, evidencia: null },
  ] };

  it("aceita a saída completa", () => {
    expect(interpretarSaidaClassificador(JSON.stringify(valida))).toEqual(valida);
    expect(interpretarSaidaClassificador(JSON.stringify({ tipo: null, tipoConfianca: null, etiquetas: [] })))
      .toEqual({ tipo: null, tipoConfianca: null, etiquetas: [] });
  });

  it("JSON inválido descarta tudo", () => {
    expect(interpretarSaidaClassificador("{ tipo: Casa")).toBeNull();
    expect(interpretarSaidaClassificador("")).toBeNull();
    expect(interpretarSaidaClassificador("[]")).toBeNull();
  });

  it("campo obrigatório faltando ou com tipo errado descarta tudo, mesmo com etiquetas boas dentro", () => {
    const { tipoConfianca: _ignorado, ...semTipoConfianca } = valida;
    void _ignorado;
    expect(interpretarSaidaClassificador(JSON.stringify(semTipoConfianca))).toBeNull();
    expect(interpretarSaidaClassificador(JSON.stringify({ ...valida, etiquetas: "nada" }))).toBeNull();
    expect(interpretarSaidaClassificador(JSON.stringify({ ...valida, tipo: "Castelo" }))).toBeNull();
    expect(interpretarSaidaClassificador(JSON.stringify({ ...valida, tipoConfianca: 101 }))).toBeNull();
    expect(interpretarSaidaClassificador(JSON.stringify({ ...valida, etiquetas: [
      { categoria: "sinal-de-prospeccao", codigo: "imovel-fechado", confianca: 90, evidencia: null },
      { categoria: "sinal-de-prospeccao", codigo: "mato-alto", confianca: "alta", evidencia: null },
    ] }))).toBeNull();
    expect(interpretarSaidaClassificador(JSON.stringify({ ...valida, etiquetas: [
      { categoria: "sinal-de-prospeccao", confianca: 90, evidencia: null },
    ] }))).toBeNull();
  });
});

describe("fingerprint e gatilho de texto", () => {
  const base = {
    observacao: "Casa fechada, jardim alto.",
    tipoDeclarado: null,
    versaoCatalogo: 1,
    versaoClassificador: 1,
    modelo: "gpt-5.6-luna",
    confiancaMinima: 70,
  };

  it("é só conteúdo e configuração: caixa, acento e espaço não mudam a chave", () => {
    const a = materialFingerprintClassificacao(base);
    expect(materialFingerprintClassificacao({ ...base, observacao: "  CASA fechada,   jardím alto. " })).toBe(a);
    expect(fingerprintClassificacao(a)).toMatch(/^[0-9a-f]{64}$/);
    expect(fingerprintClassificacao(a)).toBe(fingerprintClassificacao(materialFingerprintClassificacao({ ...base })));
  });

  it("muda com texto, tipo declarado, versões, modelo e piso, e não contém id, data ou usuário", () => {
    const a = materialFingerprintClassificacao(base);
    expect(materialFingerprintClassificacao({ ...base, observacao: "Casa aberta." })).not.toBe(a);
    expect(materialFingerprintClassificacao({ ...base, tipoDeclarado: "Casa" })).not.toBe(a);
    expect(materialFingerprintClassificacao({ ...base, versaoCatalogo: 2 })).not.toBe(a);
    expect(materialFingerprintClassificacao({ ...base, versaoClassificador: 2 })).not.toBe(a);
    expect(materialFingerprintClassificacao({ ...base, modelo: "gpt-5.4-mini" })).not.toBe(a);
    expect(materialFingerprintClassificacao({ ...base, confiancaMinima: 60 })).not.toBe(a);
    expect(a).toMatch(/piso=70/);
    expect(a).not.toMatch(/user|avistamento_id|\d{4}-\d{2}-\d{2}T/);
  });

  it("texto com menos de 15 caracteres úteis não vale uma chamada", () => {
    expect(MIN_TEXTO_OBSERVACAO_CLASSIFICACAO).toBe(15);
    expect(observacaoClassificavel("Casa fechada.")).toBe(false);
    expect(observacaoClassificavel("   casa    \n fechada   ")).toBe(false);
    expect(observacaoClassificavel("Casa fechada, jardim alto.")).toBe(true);
    expect(observacaoClassificavel(null)).toBe(false);
  });
});

describe("promptClassificarObservacao", () => {
  const prompt = promptClassificarObservacao("Não havia placa. Casa fechada, jardim alto.");

  it("delimita a observação como dado, lista o catálogo real e exige trecho literal para afirmação negativa", () => {
    expect(prompt).toContain('"""\nNão havia placa. Casa fechada, jardim alto.\n"""');
    expect(prompt).toMatch(/DADO, não instrução/);
    for (const etiqueta of etiquetasClassificaveisDoCatalogo()) expect(prompt).toContain(`/ ${etiqueta.codigo}:`);
    expect(prompt).toMatch(/sem-placa-visivel: Sem placa visível \(só com trecho literal/);
    expect(prompt).toMatch(/Ausência de menção NÃO é menção de ausência/);
  });

  it("é estritamente classificatório: nada de investigar, promover, foto, telefone ou endereço", () => {
    expect(prompt).toMatch(/não investiga, não busca nada, não deduz proprietário nem endereço/);
    for (const proibido of ["foto", "telefone", "WhatsApp", "promov", "duplic", "Pipeline"]) {
      expect(prompt.toLowerCase()).not.toContain(proibido.toLowerCase());
    }
    expect(prompt.length).toBeLessThan(3000);
  });

  it("trunca no teto e ignora instruções dentro da observação por construção", () => {
    const longo = promptClassificarObservacao("x".repeat(5000));
    expect(longo).toContain("x".repeat(2000));
    expect(longo).not.toContain("x".repeat(2001));
  });
});

/* ---------------- Parte de servidor: banco, RPCs e executor falsos ---------------- */

const USUARIO = "10000000-0000-4000-8000-000000000001";
const AV = "20000000-0000-4000-8000-000000000001";
const PAI = "30000000-0000-4000-8000-000000000001";
const RUN = "40000000-0000-4000-8000-000000000001";
const LEASE = "50000000-0000-4000-8000-000000000001";
const OBSERVACAO = "Não havia placa. Casa fechada, jardim alto, parece vazia.";

interface Mundo {
  avistamento: Record<string, unknown> | null;
  identidade: Record<string, unknown> | null;
  liberado: boolean;
  usoNaJanela: number;
  etiquetasGravadas: { categoria: string; codigo: string; confianca: number }[];
  execucaoGravada: { tipo_sugerido: string | null; tipo_confianca: number | null };
  respostas: { iniciar?: unknown; concluir?: unknown; falhar?: unknown };
  rpc: ReturnType<typeof vi.fn>;
  updates: unknown[];
  /** A última consulta feita a `ia_uso`, com os filtros registrados. */
  consultaIaUso: Record<string, unknown> | null;
}

function mundoPadrao(sobrescritas: Partial<Mundo> = {}): Mundo {
  const mundo: Mundo = {
    avistamento: { id: AV, imovel_identificado_id: PAI, observacao: OBSERVACAO, observacao_revisao: 1, classificacao_estado: "pendente" },
    identidade: { id: PAI, exclusao_solicitada_em: null, tipo: null, tipo_origem: null },
    liberado: true,
    usoNaJanela: 0,
    etiquetasGravadas: [],
    execucaoGravada: { tipo_sugerido: null, tipo_confianca: null },
    respostas: {},
    rpc: vi.fn(),
    updates: [],
    consultaIaUso: null,
    ...sobrescritas,
  };
  mundo.rpc.mockImplementation(async (nome: string) => {
    if (nome === "iniciar_classificacao") {
      return { data: mundo.respostas.iniciar ?? { ok: true, repetida: false, ocupado: false, run_id: RUN, lease_token: LEASE, modo: "modelo", reusada_de: null }, error: null };
    }
    if (nome === "concluir_classificacao") {
      return { data: mundo.respostas.concluir ?? { ok: true, repetida: false, run_id: RUN, modo: "modelo", aplicadas: mundo.etiquetasGravadas.length, snapshot_aplicado: true, tipo_aplicado: true }, error: null };
    }
    if (nome === "falhar_classificacao") return { data: mundo.respostas.falhar ?? { ok: true, repetida: false, run_id: RUN }, error: null };
    throw new Error(`RPC inesperada: ${nome}`);
  });
  return mundo;
}

/** Um query builder mínimo: encadeia tudo e resolve pelo nome da tabela. */
function construtor(resolver: () => { data: unknown; error: null; count?: number }) {
  const chamada: Record<string, unknown> = {};
  const encadear = () => chamada;
  for (const metodo of ["select", "eq", "in", "gte", "order", "update", "limit"]) chamada[metodo] = vi.fn(encadear);
  chamada.maybeSingle = async () => resolver();
  chamada.single = async () => resolver();
  chamada.then = (ok: (v: unknown) => unknown, erro?: (e: unknown) => unknown) => Promise.resolve(resolver()).then(ok, erro);
  return chamada;
}

function clientes(mundo: Mundo) {
  const chamador = {
    from: vi.fn((tabela: string) => construtor(() => {
      if (tabela === "imoveis_identificados_avistamentos") return { data: mundo.avistamento, error: null };
      if (tabela === "imoveis_identificados") return { data: mundo.identidade, error: null };
      if (tabela === "ia_permissoes") return { data: { liberado: mundo.liberado }, error: null };
      if (tabela === "imoveis_identificados_etiquetas") return { data: mundo.etiquetasGravadas, error: null };
      if (tabela === "imoveis_identificados_classificacoes") return { data: mundo.execucaoGravada, error: null };
      throw new Error(`Tabela inesperada no chamador: ${tabela}`);
    })),
  };
  const servico = {
    rpc: mundo.rpc,
    from: vi.fn((tabela: string) => {
      const c = construtor(() => {
        if (tabela === "ia_uso") return { data: null, error: null, count: mundo.usoNaJanela };
        if (tabela === "imoveis_identificados_avistamentos") return { data: null, error: null };
        throw new Error(`Tabela inesperada no serviço: ${tabela}`);
      });
      (c.update as ReturnType<typeof vi.fn>).mockImplementation((valores: unknown) => { mundo.updates.push({ tabela, valores }); return c; });
      if (tabela === "ia_uso") mundo.consultaIaUso = c;
      return c;
    }),
  };
  return { chamador, servico };
}

function executorFalso(texto: string | (() => Promise<string>)): ExecutorOpenAI & { executar: ReturnType<typeof vi.fn> } {
  return {
    executar: vi.fn(async () => ({
      conclusao: {} as never,
      texto: typeof texto === "string" ? texto : await texto(),
    })),
  };
}

const configuracao: VersaoConfiguracaoIa = {
  ...CONFIGURACAO_IA_PADRAO,
  classificacao: { modelo: "gpt-5.6-luna", esforco: "low" },
  versao: 1, criadoEm: null, alteradoPor: null, origem: "banco",
};

function deps(
  mundo: Mundo,
  executor: ExecutorOpenAI | null,
  tetoDiario: TetoDiarioClassificacao | null = null,
): DependenciasClassificacao {
  const { chamador, servico } = clientes(mundo);
  return { chamador: chamador as never, servico: servico as never, userId: USUARIO, executor, configuracao, tetoDiario };
}

function saida(etiquetas: unknown[], tipo: string | null = "Casa", tipoConfianca: number | null = 80) {
  return JSON.stringify({ tipo, tipoConfianca, etiquetas });
}

const chamadasRpc = (mundo: Mundo) => mundo.rpc.mock.calls.map(([nome]) => nome as string);
const parametrosRpc = (mundo: Mundo, nome: string) =>
  mundo.rpc.mock.calls.find(([n]) => n === nome)?.[1] as Record<string, unknown>;

describe("classificarAvistamento — saída válida vira etiquetas com proveniência completa", () => {
  it("passa pelo claim com modelo, esforço, versões e piso; conclui com as etiquetas válidas e o tipo", async () => {
    const mundo = mundoPadrao({ etiquetasGravadas: [
      { categoria: "sinal-de-prospeccao", codigo: "imovel-fechado", confianca: 90 },
      { categoria: "sinal-de-prospeccao", codigo: "sem-placa-visivel", confianca: 85 },
    ], execucaoGravada: { tipo_sugerido: "Casa", tipo_confianca: 80 } });
    const executor = executorFalso(saida([
      { categoria: "sinal-de-prospeccao", codigo: "imovel-fechado", confianca: 90, evidencia: null },
      { categoria: "sinal-de-prospeccao", codigo: "sem-placa-visivel", confianca: 85, evidencia: "Não havia placa" },
    ]));

    const resposta = await classificarAvistamento(deps(mundo, executor), AV);

    expect(chamadasRpc(mundo)).toEqual(["iniciar_classificacao", "concluir_classificacao"]);
    expect(parametrosRpc(mundo, "iniciar_classificacao")).toMatchObject({
      p_user_id: USUARIO, p_avistamento_id: AV, p_modelo: "gpt-5.6-luna", p_esforco: "low",
      p_versao_catalogo: VERSAO_CATALOGO_ETIQUETAS, p_versao_classificador: VERSAO_CLASSIFICADOR_ETIQUETAS,
      p_confianca_minima: CONFIANCA_MINIMA_ETIQUETA,
    });
    expect(parametrosRpc(mundo, "iniciar_classificacao").p_fingerprint).toMatch(/^[0-9a-f]{64}$/);
    // O executor só recebe o prompt com a observação relida do banco, sem endereço nem PII.
    const pedido = executor.executar.mock.calls[0][0] as { tipo: string; mensagens: { content: string }[]; formato: { esquema: unknown } };
    expect(pedido.tipo).toBe(TIPO_PEDIDO_CLASSIFICACAO);
    expect(pedido.mensagens).toHaveLength(1);
    expect(pedido.mensagens[0].content).toContain(OBSERVACAO);
    expect(pedido.mensagens[0].content).not.toMatch(/Rua de teste|10000000-0000/);
    expect(pedido.formato.esquema).toBe(ESQUEMA_ETIQUETAS);
    expect(parametrosRpc(mundo, "concluir_classificacao")).toEqual({
      p_user_id: USUARIO, p_run_id: RUN, p_lease_token: LEASE, p_tipo_sugerido: "Casa", p_tipo_confianca: 80,
      p_etiquetas: [
        { categoria: "sinal-de-prospeccao", codigo: "imovel-fechado", confianca: 90 },
        { categoria: "sinal-de-prospeccao", codigo: "sem-placa-visivel", confianca: 85 },
      ],
      p_contadores: { sugeridas: 2, abaixo_do_piso: 0, fora_do_catalogo: 0, sem_evidencia: 0 },
    });
    expect(resposta).toEqual({
      ok: true, estado: "concluida", modo: "modelo",
      etiquetas: mundo.etiquetasGravadas, tipo: { sugerido: "Casa", confianca: 80 }, snapshotAplicado: true,
    });
    expect(registro.registrarEvento).toHaveBeenCalledWith(expect.objectContaining({
      categoria: "ia", nivel: "info", evento: "ia-classificacao-concluida", userId: USUARIO,
    }));
    const detalhe = String(registro.registrarEvento.mock.calls.at(-1)?.[0].detalhe);
    expect(detalhe).not.toContain("placa");
  });

  it("IA indisponível (sem executor): claim, falhar('indisponivel'), nenhuma etiqueta, resposta nao-configurado, sem uso", async () => {
    const mundo = mundoPadrao();
    const resposta = await classificarAvistamento(deps(mundo, null), AV);
    expect(chamadasRpc(mundo)).toEqual(["iniciar_classificacao", "falhar_classificacao"]);
    expect(parametrosRpc(mundo, "falhar_classificacao")).toEqual({
      p_user_id: USUARIO, p_run_id: RUN, p_lease_token: LEASE, p_falha_codigo: "indisponivel",
    });
    expect(resposta).toEqual({ ok: false, falha: "nao-configurado" });
    expect(registro.registrarUsoIa).not.toHaveBeenCalled();
  });

  it("executor que recusa por ambiente também termina 'indisponivel' — nunca há bypass", async () => {
    const mundo = mundoPadrao();
    const executor = executorFalso(async () => { throw new ChamadaOpenAIRealNaoAutorizadaError("test", "preview"); });
    expect(await classificarAvistamento(deps(mundo, executor), AV)).toEqual({ ok: false, falha: "nao-configurado" });
    expect(parametrosRpc(mundo, "falhar_classificacao").p_falha_codigo).toBe("indisponivel");
  });

  it("JSON inválido descarta a execução inteira: falhar('saida-invalida'), concluir nunca é chamado", async () => {
    const mundo = mundoPadrao();
    const resposta = await classificarAvistamento(deps(mundo, executorFalso("{ tipo: Casa, etiquetas: [")), AV);
    expect(chamadasRpc(mundo)).toEqual(["iniciar_classificacao", "falhar_classificacao"]);
    expect(parametrosRpc(mundo, "falhar_classificacao").p_falha_codigo).toBe("saida-invalida");
    expect(resposta).toEqual({ ok: false, falha: "falha-modelo" });
  });

  it("campo obrigatório faltando descarta tudo, mesmo com duas etiquetas válidas dentro", async () => {
    const mundo = mundoPadrao();
    const semTipo = JSON.stringify({ etiquetas: [
      { categoria: "sinal-de-prospeccao", codigo: "imovel-fechado", confianca: 90, evidencia: null },
      { categoria: "sinal-de-prospeccao", codigo: "mato-alto", confianca: 88, evidencia: null },
    ] });
    expect(await classificarAvistamento(deps(mundo, executorFalso(semTipo)), AV)).toEqual({ ok: false, falha: "falha-modelo" });
    expect(chamadasRpc(mundo)).not.toContain("concluir_classificacao");
  });

  it("código fora do catálogo é descartado e contado; os demais seguem", async () => {
    const mundo = mundoPadrao();
    await classificarAvistamento(deps(mundo, executorFalso(saida([
      { categoria: "sinal-de-prospeccao", codigo: "imovel-fechado", confianca: 90, evidencia: null },
      { categoria: "sinal-de-prospeccao", codigo: "urgente", confianca: 99, evidencia: null },
      { categoria: "localizacao", codigo: "regiao:sul", confianca: 99, evidencia: null },
    ]))), AV);
    const concluir = parametrosRpc(mundo, "concluir_classificacao");
    expect(concluir.p_etiquetas).toEqual([{ categoria: "sinal-de-prospeccao", codigo: "imovel-fechado", confianca: 90 }]);
    expect(concluir.p_contadores).toEqual({ sugeridas: 3, abaixo_do_piso: 0, fora_do_catalogo: 2, sem_evidencia: 0 });
  });

  it("confiança abaixo de 70 não grava a ETIQUETA e conta; o piso gravado no run é o desta execução", async () => {
    const mundo = mundoPadrao();
    await classificarAvistamento(deps(mundo, executorFalso(saida([
      { categoria: "sinal-de-prospeccao", codigo: "imovel-fechado", confianca: 69, evidencia: null },
      { categoria: "estado-visual", codigo: "aparenta-vago", confianca: 70, evidencia: null },
    ]))), AV);
    const concluir = parametrosRpc(mundo, "concluir_classificacao");
    expect(concluir.p_etiquetas).toEqual([{ categoria: "estado-visual", codigo: "aparenta-vago", confianca: 70 }]);
    expect(concluir.p_contadores).toEqual({ sugeridas: 2, abaixo_do_piso: 1, fora_do_catalogo: 0, sem_evidencia: 0 });
    expect(parametrosRpc(mundo, "iniciar_classificacao").p_confianca_minima).toBe(70);
    expect(CONFIANCA_MINIMA_ETIQUETA).toBe(70);
  });

  it("o piso é de ETIQUETA: tipo válido com confiança abaixo de 70 segue inteiro para a RPC, sem contar como abaixo do piso", async () => {
    const mundo = mundoPadrao();
    await classificarAvistamento(deps(mundo, executorFalso(saida([
      { categoria: "sinal-de-prospeccao", codigo: "imovel-fechado", confianca: 90, evidencia: null },
    ], "Sobrado", 55))), AV);
    const concluir = parametrosRpc(mundo, "concluir_classificacao");
    // `tipo_sugerido` + `tipo_confianca` preservados como o modelo devolveu:
    // quem decide se viram snapshot é `concluir_classificacao`, pelas regras
    // canônicas (corrente, manual, confirmado, nulo não apaga).
    expect(concluir.p_tipo_sugerido).toBe("Sobrado");
    expect(concluir.p_tipo_confianca).toBe(55);
    expect(concluir.p_contadores).toEqual({ sugeridas: 1, abaixo_do_piso: 0, fora_do_catalogo: 0, sem_evidencia: 0 });
    // Tipo nulo continua nulo; confiança sem tipo é ignorada.
    const semTipo = mundoPadrao();
    await classificarAvistamento(deps(semTipo, executorFalso(saida([], null, null))), AV);
    expect(parametrosRpc(semTipo, "concluir_classificacao")).toMatchObject({ p_tipo_sugerido: null, p_tipo_confianca: null });
  });

  it("caixa e acento são normalizados: 'Ímovel-Fechado' vira o código canônico", async () => {
    const mundo = mundoPadrao();
    await classificarAvistamento(deps(mundo, executorFalso(saida([
      { categoria: "Sinal-De-Prospecção", codigo: "ÍMOVEL-FECHADO", confianca: 90, evidencia: null },
    ]))), AV);
    expect(parametrosRpc(mundo, "concluir_classificacao").p_etiquetas)
      .toEqual([{ categoria: "sinal-de-prospeccao", codigo: "imovel-fechado", confianca: 90 }]);
  });

  it("evidência explícita: trecho literal presente passa; ausente ou inventado cai em sem_evidencia", async () => {
    const mundo = mundoPadrao();
    await classificarAvistamento(deps(mundo, executorFalso(saida([
      { categoria: "sinal-de-prospeccao", codigo: "sem-placa-visivel", confianca: 95, evidencia: "NÃO HAVIA PLACA" },
    ]))), AV);
    expect(parametrosRpc(mundo, "concluir_classificacao").p_etiquetas)
      .toEqual([{ categoria: "sinal-de-prospeccao", codigo: "sem-placa-visivel", confianca: 95 }]);

    // "Casa fechada, jardim alto." não menciona placa: sem-placa-visivel é recusado
    // pelo servidor, com ou sem evidência inventada.
    const semMencao = mundoPadrao({ avistamento: { id: AV, imovel_identificado_id: PAI, observacao: "Casa fechada, jardim alto.", observacao_revisao: 1, classificacao_estado: "pendente" } });
    await classificarAvistamento(deps(semMencao, executorFalso(saida([
      { categoria: "sinal-de-prospeccao", codigo: "sem-placa-visivel", confianca: 95, evidencia: null },
      { categoria: "sinal-de-prospeccao", codigo: "sem-placa-visivel", confianca: 95, evidencia: "não tinha placa" },
      { categoria: "sinal-de-prospeccao", codigo: "imovel-fechado", confianca: 90, evidencia: null },
    ]))), AV);
    const concluir = parametrosRpc(semMencao, "concluir_classificacao");
    expect(concluir.p_etiquetas).toEqual([{ categoria: "sinal-de-prospeccao", codigo: "imovel-fechado", confianca: 90 }]);
    expect(concluir.p_contadores).toEqual({ sugeridas: 3, abaixo_do_piso: 0, fora_do_catalogo: 0, sem_evidencia: 2 });
  });

  it("texto curto: marca nao_aplicavel com service role filtrado pelo usuário, sem claim nem modelo", async () => {
    const mundo = mundoPadrao({ avistamento: { id: AV, imovel_identificado_id: PAI, observacao: "Casa fechada.", observacao_revisao: 1, classificacao_estado: "pendente" } });
    const executor = executorFalso(saida([]));
    const resposta = await classificarAvistamento(deps(mundo, executor), AV);
    expect(resposta).toEqual({ ok: true, estado: "nao_aplicavel", modo: null, etiquetas: [], tipo: null, snapshotAplicado: false });
    expect(mundo.rpc).not.toHaveBeenCalled();
    expect(executor.executar).not.toHaveBeenCalled();
    expect(mundo.updates).toEqual([{ tabela: "imoveis_identificados_avistamentos", valores: { classificacao_estado: "nao_aplicavel" } }]);
  });

  it("sem permissão: claim, falhar('sem-permissao') e evento ia-sem-permissao, sem tocar o modelo", async () => {
    const mundo = mundoPadrao({ liberado: false });
    const executor = executorFalso(saida([]));
    expect(await classificarAvistamento(deps(mundo, executor), AV)).toEqual({ ok: false, falha: "sem-permissao" });
    expect(executor.executar).not.toHaveBeenCalled();
    expect(parametrosRpc(mundo, "falhar_classificacao").p_falha_codigo).toBe("sem-permissao");
    expect(registro.registrarEvento).toHaveBeenCalledWith(expect.objectContaining({ evento: "ia-sem-permissao" }));
  });

  describe("teto diário: 200 execuções com modelo por usuário por dia operacional", () => {
    const HOJE = "2026-09-14";
    const teto = tetoDiarioClassificacao(HOJE);
    const filtros = (mundo: Mundo, metodo: string) =>
      (mundo.consultaIaUso![metodo] as ReturnType<typeof vi.fn>).mock.calls;

    it("o teto do dia é 200 desde a meia-noite do fuso canônico, sem janela móvel", () => {
      expect(TETO_DIARIO_CLASSIFICACOES).toBe(200);
      expect(teto).toEqual({ maximo: 200, desde: inicioDoDiaOperacionalISO(HOJE) });
      // Meia-noite de São Paulo, não UTC nem "agora menos 24 h".
      expect(teto.desde).toBe("2026-09-14T03:00:00.000Z");
      expect(() => tetoDiarioClassificacao("14/09/2026")).toThrow();
    });

    it("199 usos no dia: a próxima classificação é permitida e roda o modelo", async () => {
      const mundo = mundoPadrao({ usoNaJanela: 199 });
      const executor = executorFalso(saida([]));
      expect(await classificarAvistamento(deps(mundo, executor, teto), AV)).toMatchObject({ ok: true, estado: "concluida" });
      expect(executor.executar).toHaveBeenCalledTimes(1);
    });

    it("200 usos no dia: bloqueada com limite-diario, sem modelo, run falha com o mesmo código", async () => {
      const mundo = mundoPadrao({ usoNaJanela: 200 });
      const executor = executorFalso(saida([]));
      expect(await classificarAvistamento(deps(mundo, executor, teto), AV)).toEqual({ ok: false, falha: "limite-diario" });
      expect(executor.executar).not.toHaveBeenCalled();
      expect(parametrosRpc(mundo, "falhar_classificacao").p_falha_codigo).toBe("limite-diario");
      expect(registro.registrarEvento).toHaveBeenCalledWith(expect.objectContaining({ evento: "ia-classificacao-limite-diario" }));
    });

    it("a conta é em ia_uso, do tipo desta rota, do usuário autenticado e só a partir do início do dia operacional", async () => {
      const mundo = mundoPadrao({ usoNaJanela: 0 });
      await classificarAvistamento(deps(mundo, executorFalso(saida([])), teto), AV);
      expect(filtros(mundo, "eq")).toEqual([["user_id", USUARIO], ["tipo", TIPO_PEDIDO_CLASSIFICACAO]]);
      // Uso de ontem (antes de `desde`) fica fora; outro usuário fica fora.
      expect(filtros(mundo, "gte")).toEqual([["criado_em", "2026-09-14T03:00:00.000Z"]]);
      expect(filtros(mundo, "select")).toEqual([["id", { count: "exact", head: true }]]);
    });

    it("reuso, repetida, ocupado, exclusão, nao_aplicavel e indisponível não consomem cota nem consultam ia_uso", async () => {
      const cenarios: [Mundo, ExecutorOpenAI | null][] = [
        [mundoPadrao({ respostas: { iniciar: { ok: true, repetida: false, ocupado: false, run_id: RUN, lease_token: LEASE, modo: "reuso", reusada_de: "x" } } }), executorFalso(saida([]))],
        [mundoPadrao({ respostas: { iniciar: { ok: true, repetida: true, run_id: RUN } } }), executorFalso(saida([]))],
        [mundoPadrao({ respostas: { iniciar: { ok: false, ocupado: true, run_id: RUN } } }), executorFalso(saida([]))],
        [mundoPadrao({ identidade: { id: PAI, exclusao_solicitada_em: "2026-09-10T00:00:00Z", tipo: null, tipo_origem: null } }), executorFalso(saida([]))],
        [mundoPadrao({ avistamento: { id: AV, imovel_identificado_id: PAI, observacao: "Casa fechada.", observacao_revisao: 1, classificacao_estado: "pendente" } }), executorFalso(saida([]))],
        [mundoPadrao(), null],
      ];
      for (const [mundo, executor] of cenarios) {
        await classificarAvistamento(deps(mundo, executor, { ...teto, maximo: 0 }), AV);
        expect(mundo.consultaIaUso).toBeNull();
        expect(registro.registrarUsoIa).not.toHaveBeenCalled();
      }
    });
  });

  it("repetida e ocupado respondem sem modelo; exclusão pendente responde antes do claim", async () => {
    const repetida = mundoPadrao({ respostas: { iniciar: { ok: true, repetida: true, run_id: RUN } } });
    const executor = executorFalso(saida([]));
    expect(await classificarAvistamento(deps(repetida, executor), AV)).toEqual({ ok: true, repetida: true });

    const ocupado = mundoPadrao({ respostas: { iniciar: { ok: false, ocupado: true, run_id: RUN } } });
    expect(await classificarAvistamento(deps(ocupado, executor), AV)).toEqual({ ok: false, falha: "ocupado" });

    const exclusao = mundoPadrao({ identidade: { id: PAI, exclusao_solicitada_em: "2026-09-10T00:00:00Z", tipo: null, tipo_origem: null } });
    expect(await classificarAvistamento(deps(exclusao, executor), AV)).toEqual({ ok: false, falha: "exclusao-em-andamento" });
    expect(exclusao.rpc).not.toHaveBeenCalled();
    expect(executor.executar).not.toHaveBeenCalled();
  });

  it("reuso decidido pelo banco: concluir direto com payload vazio, sem executor", async () => {
    const mundo = mundoPadrao({
      respostas: { iniciar: { ok: true, repetida: false, ocupado: false, run_id: RUN, lease_token: LEASE, modo: "reuso", reusada_de: "x" } },
      etiquetasGravadas: [{ categoria: "sinal-de-prospeccao", codigo: "imovel-fechado", confianca: 90 }],
    });
    const executor = executorFalso(saida([]));
    const resposta = await classificarAvistamento(deps(mundo, executor), AV);
    expect(executor.executar).not.toHaveBeenCalled();
    expect(parametrosRpc(mundo, "concluir_classificacao")).toMatchObject({ p_etiquetas: [], p_tipo_sugerido: null });
    expect(resposta).toMatchObject({ ok: true, modo: "reuso", etiquetas: mundo.etiquetasGravadas });
  });

  it("o tipo declarado manualmente entra no fingerprint; o inferido pela IA, não", async () => {
    const manual = mundoPadrao({ identidade: { id: PAI, exclusao_solicitada_em: null, tipo: "Casa", tipo_origem: "manual" } });
    const inferido = mundoPadrao({ identidade: { id: PAI, exclusao_solicitada_em: null, tipo: "Casa", tipo_origem: "ia-texto" } });
    const semTipo = mundoPadrao();
    for (const mundo of [manual, inferido, semTipo]) await classificarAvistamento(deps(mundo, null), AV);
    const fp = (mundo: Mundo) => parametrosRpc(mundo, "iniciar_classificacao").p_fingerprint;
    expect(fp(inferido)).toBe(fp(semTipo));
    expect(fp(manual)).not.toBe(fp(semTipo));
  });
});
