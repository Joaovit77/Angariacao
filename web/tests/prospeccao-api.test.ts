/* ================================================================
   C8 — POST /api/prospeccao/classificar

   A rota recebe SÓ `{ avistamentoId }`, autentica por `auth.getUser()`,
   relê a observação do banco sob RLS e nunca confia em texto do browser.
   Aqui o Supabase, a configuração de IA, a trava de ambiente e o SDK da
   OpenAI são falsos; o executor canônico é o real, com um cliente falso —
   é assim que se prova que `ia_uso` só recebe linha quando o modelo rodou.
   Nenhum teste chama OpenAI de verdade.
   ================================================================ */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  carregarConfiguracaoIa: vi.fn(),
  chamadaOpenAIRealAutorizada: vi.fn(() => true),
  criarClienteOpenAIReal: vi.fn(),
  registrarEvento: vi.fn(),
  registrarUsoIa: vi.fn(),
}));
vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/servidor/ia/configuracao", () => ({ carregarConfiguracaoIa: mocks.carregarConfiguracaoIa }));
vi.mock("@/lib/servidor/openai-real", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/servidor/openai-real")>();
  return {
    ...original,
    chamadaOpenAIRealAutorizada: mocks.chamadaOpenAIRealAutorizada,
    exigirAutorizacaoOpenAIReal: () => {
      if (!mocks.chamadaOpenAIRealAutorizada()) throw new original.ChamadaOpenAIRealNaoAutorizadaError("test", "preview");
    },
    criarClienteOpenAIReal: mocks.criarClienteOpenAIReal,
  };
});
vi.mock("@/lib/servidor/registro", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/servidor/registro")>();
  return {
    ...original,
    registrarEvento: mocks.registrarEvento,
    registrarUsoIa: mocks.registrarUsoIa,
    registrarUsoDaResposta: (userId: string | null, tipo: string, modelo: string, usage: { prompt_tokens?: number; completion_tokens?: number } | null | undefined) => {
      if (!usage) return;
      mocks.registrarUsoIa({ userId, tipo, modelo, tokensEntrada: usage.prompt_tokens ?? 0, tokensSaida: usage.completion_tokens ?? 0 });
    },
  };
});

import OpenAI from "openai";
import { POST as classificar, runtime } from "@/app/api/prospeccao/classificar/route";
import { POST as ia } from "@/app/api/ia/route";
import { agoraISOComHora, inicioDoDiaOperacionalISO } from "@/lib/datas";
import { CONFIGURACAO_IA_PADRAO } from "@/lib/ia/configuracao";

const USUARIO = "10000000-0000-4000-8000-000000000001";
const AV = "20000000-0000-4000-8000-000000000001";
const PAI = "30000000-0000-4000-8000-000000000001";
const RUN = "40000000-0000-4000-8000-000000000001";
const LEASE = "50000000-0000-4000-8000-000000000001";
const OBSERVACAO_DO_BANCO = "Não havia placa. Casa fechada, jardim alto, parece vazia.";
const CONTRATO_SUCESSO = ["ok", "estado", "modo", "etiquetas", "tipo", "snapshotAplicado"] as const;

interface Mundo {
  avistamento: Record<string, unknown> | null;
  identidade: Record<string, unknown> | null;
  liberado: boolean;
  usoNaJanela: number;
  etiquetasGravadas: unknown[];
  iniciar: unknown;
  rpc: ReturnType<typeof vi.fn>;
  create: ReturnType<typeof vi.fn>;
  saida: string | Error;
  usage: { prompt_tokens: number; completion_tokens: number } | null;
  consultaIaUso: Record<string, unknown> | null;
}

function construtor(resolver: () => { data: unknown; error: null; count?: number }) {
  const c: Record<string, unknown> = {};
  for (const m of ["select", "eq", "in", "gte", "order", "update", "limit"]) c[m] = vi.fn(() => c);
  c.maybeSingle = async () => resolver();
  c.single = async () => resolver();
  c.then = (ok: (v: unknown) => unknown, erro?: (e: unknown) => unknown) => Promise.resolve(resolver()).then(ok, erro);
  return c;
}

function mundo(sobrescritas: Partial<Mundo> = {}): Mundo {
  const m: Mundo = {
    avistamento: { id: AV, imovel_identificado_id: PAI, observacao: OBSERVACAO_DO_BANCO, observacao_revisao: 1, classificacao_estado: "pendente" },
    identidade: { id: PAI, exclusao_solicitada_em: null, tipo: null, tipo_origem: null },
    liberado: true,
    usoNaJanela: 0,
    etiquetasGravadas: [{ categoria: "sinal-de-prospeccao", codigo: "imovel-fechado", confianca: 90 }],
    iniciar: { ok: true, repetida: false, ocupado: false, run_id: RUN, lease_token: LEASE, modo: "modelo", reusada_de: null },
    rpc: vi.fn(),
    create: vi.fn(),
    saida: JSON.stringify({ tipo: "Casa", tipoConfianca: 80, etiquetas: [
      { categoria: "sinal-de-prospeccao", codigo: "imovel-fechado", confianca: 90, evidencia: null },
    ] }),
    usage: { prompt_tokens: 350, completion_tokens: 60 },
    consultaIaUso: null,
    ...sobrescritas,
  };
  m.rpc.mockImplementation(async (nome: string) => {
    if (nome === "iniciar_classificacao") return { data: m.iniciar, error: null };
    if (nome === "concluir_classificacao") return { data: { ok: true, repetida: false, run_id: RUN, modo: "modelo", aplicadas: 1, snapshot_aplicado: true, tipo_aplicado: true }, error: null };
    if (nome === "falhar_classificacao") return { data: { ok: true, repetida: false, run_id: RUN }, error: null };
    throw new Error(`RPC inesperada: ${nome}`);
  });
  m.create.mockImplementation(async () => {
    if (m.saida instanceof Error) throw m.saida;
    return { choices: [{ message: { content: m.saida, refusal: null }, finish_reason: "stop" }], usage: m.usage };
  });

  const chamador = {
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: USUARIO } }, error: null })) },
    from: vi.fn((tabela: string) => construtor(() => {
      if (tabela === "imoveis_identificados_avistamentos") return { data: m.avistamento, error: null };
      if (tabela === "imoveis_identificados") return { data: m.identidade, error: null };
      if (tabela === "ia_permissoes") return { data: { liberado: m.liberado }, error: null };
      if (tabela === "imoveis_identificados_etiquetas") return { data: m.etiquetasGravadas, error: null };
      if (tabela === "imoveis_identificados_classificacoes") return { data: { tipo_sugerido: "Casa", tipo_confianca: 80 }, error: null };
      throw new Error(`Tabela inesperada: ${tabela}`);
    })),
  };
  const servico = {
    rpc: m.rpc,
    from: vi.fn((tabela: string) => {
      const c = construtor(() => {
        if (tabela === "ia_uso") return { data: null, error: null, count: m.usoNaJanela };
        return { data: null, error: null };
      });
      if (tabela === "ia_uso") m.consultaIaUso = c;
      return c;
    }),
  };
  mocks.createClient.mockReset();
  mocks.createClient.mockImplementation((_url: string, chave: string) => (chave === "service-role" ? servico : chamador));
  mocks.criarClienteOpenAIReal.mockReset();
  mocks.criarClienteOpenAIReal.mockReturnValue({ chat: { completions: { create: m.create } } });
  return m;
}

function requisicao(corpo: unknown, token = "token-valido", extras: Record<string, string> = {}): Request {
  return new Request("http://localhost/api/prospeccao/classificar", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}), ...extras },
    body: typeof corpo === "string" ? corpo : JSON.stringify(corpo),
  });
}

async function chamar(corpo: unknown = { avistamentoId: AV }, token?: string) {
  const resposta = await classificar(requisicao(corpo, token));
  return { status: resposta.status, corpo: (await resposta.json()) as Record<string, unknown>, cache: resposta.headers.get("Cache-Control") };
}

const chamadasRpc = (m: Mundo) => m.rpc.mock.calls.map(([nome]) => nome as string);
const falha = (m: Mundo) => (m.rpc.mock.calls.find(([n]) => n === "falhar_classificacao")?.[1] as { p_falha_codigo: string } | undefined)?.p_falha_codigo;

describe("POST /api/prospeccao/classificar", () => {
  let silencio: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://projeto.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role");
    vi.stubEnv("OPENAI_API_KEY", "sk-teste-falso");
    mocks.chamadaOpenAIRealAutorizada.mockReturnValue(true);
    mocks.carregarConfiguracaoIa.mockResolvedValue({
      ...CONFIGURACAO_IA_PADRAO, classificacao: { modelo: "gpt-5.6-luna", esforco: "low" },
      versao: 1, criadoEm: null, alteradoPor: null, origem: "banco",
    });
    mocks.registrarEvento.mockClear();
    mocks.registrarUsoIa.mockClear();
    silencio = vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => { silencio.mockRestore(); vi.unstubAllEnvs(); });

  it("é nodejs, no-store, e recusa sem Bearer antes de criar qualquer cliente", async () => {
    expect(runtime).toBe("nodejs");
    const fonte = readFileSync(resolve("app/api/prospeccao/classificar/route.ts"), "utf8");
    expect(fonte).toContain('export const runtime = "nodejs"');
    expect(fonte).toContain('"Cache-Control": "no-store"');
    mundo();
    const { status, corpo, cache } = await chamar({ avistamentoId: AV }, "");
    expect(status).toBe(401);
    expect(corpo).toEqual({ ok: false, falha: "sessao-expirada" });
    expect(cache).toBe("no-store");
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("o corpo é EXATAMENTE { avistamentoId }: campo extra, observação do cliente, id inválido e corpo grande são recusados", async () => {
    const m = mundo();
    for (const corpo of [{}, { avistamentoId: "abc" }, { avistamentoId: AV, observacao: "texto do browser" }, { imovelIdentificadoId: PAI }, [], "nao-json"]) {
      const { status, corpo: resposta } = await chamar(corpo);
      expect(status).toBe(400);
      expect(resposta).toEqual({ ok: false, falha: "requisicao-invalida" });
    }
    const grande = await classificar(requisicao({ avistamentoId: AV }, "t", { "Content-Length": "4096" }));
    expect(grande.status).toBe(413);
    expect(mocks.createClient).not.toHaveBeenCalled();
    expect(m.rpc).not.toHaveBeenCalled();
  });

  it("sessão inválida é 401 e nada mais acontece", async () => {
    const m = mundo();
    mocks.createClient.mockImplementation(() => ({
      auth: { getUser: async () => ({ data: { user: null }, error: { message: "expirado" } }) },
    }));
    expect((await chamar()).status).toBe(401);
    expect(m.rpc).not.toHaveBeenCalled();
  });

  it("relê a observação do banco sob RLS: o prompt leva o texto do banco, nunca o do cliente, sem endereço", async () => {
    const m = mundo();
    const { status, corpo } = await chamar();
    expect(status).toBe(200);
    expect(Object.keys(corpo)).toEqual([...CONTRATO_SUCESSO]);
    expect(corpo).toEqual({
      ok: true, estado: "concluida", modo: "modelo",
      etiquetas: [{ categoria: "sinal-de-prospeccao", codigo: "imovel-fechado", confianca: 90 }],
      tipo: { sugerido: "Casa", confianca: 80 }, snapshotAplicado: true,
    });
    // O cliente do chamador nasce com a anon key + Bearer; a service role só depois.
    expect(mocks.createClient.mock.calls[0][1]).toBe("anon");
    expect(mocks.createClient.mock.calls.some(([, chave]) => chave === "service-role")).toBe(true);
    const pedido = m.create.mock.calls[0][0] as { model: string; messages: { role: string; content: string }[]; response_format: { json_schema: { strict: boolean; name: string } } };
    const conteudo = pedido.messages.map((msg) => msg.content).join("\n");
    expect(conteudo).toContain(OBSERVACAO_DO_BANCO);
    expect(conteudo).not.toMatch(/Rua|logradouro|telefone|user_id|10000000-0000/);
    expect(pedido.model).toBe("gpt-5.6-luna");
    expect(pedido.response_format.json_schema.strict).toBe(true);
    expect(chamadasRpc(m)).toEqual(["iniciar_classificacao", "concluir_classificacao"]);
    expect((m.rpc.mock.calls[0][1] as { p_user_id: string }).p_user_id).toBe(USUARIO);
  });

  it("avistamento alheio ou inexistente: 404 sem service role, sem claim, sem modelo", async () => {
    const m = mundo({ avistamento: null });
    const { status, corpo } = await chamar();
    expect(status).toBe(404);
    expect(corpo).toEqual({ ok: false, falha: "requisicao-invalida" });
    expect(m.rpc).not.toHaveBeenCalled();
    expect(m.create).not.toHaveBeenCalled();
  });

  it("IA indisponível no ambiente (Preview/dev/CI): 503 nao-configurado, run falha 'indisponivel', zero ia_uso, zero SDK", async () => {
    const m = mundo();
    mocks.chamadaOpenAIRealAutorizada.mockReturnValue(false);
    const { status, corpo } = await chamar();
    expect(status).toBe(503);
    expect(corpo).toEqual({ ok: false, falha: "nao-configurado" });
    expect(chamadasRpc(m)).toEqual(["iniciar_classificacao", "falhar_classificacao"]);
    expect(falha(m)).toBe("indisponivel");
    expect(mocks.criarClienteOpenAIReal).not.toHaveBeenCalled();
    expect(m.create).not.toHaveBeenCalled();
    expect(mocks.registrarUsoIa).not.toHaveBeenCalled();
    // Sem chave também é indisponível, sem bypass.
    vi.stubEnv("OPENAI_API_KEY", "");
    mocks.chamadaOpenAIRealAutorizada.mockReturnValue(true);
    expect((await chamar()).corpo).toEqual({ ok: false, falha: "nao-configurado" });
    expect(mocks.criarClienteOpenAIReal).not.toHaveBeenCalled();
  });

  it("teto diário: 200 usos no dia operacional ⇒ 429 limite-diario sem SDK; 199 ⇒ permitido; a conta começa à meia-noite do fuso canônico", async () => {
    const cheio = mundo({ usoNaJanela: 200 });
    const { status, corpo } = await chamar();
    expect(status).toBe(429);
    expect(corpo).toEqual({ ok: false, falha: "limite-diario" });
    expect(falha(cheio)).toBe("limite-diario");
    expect(cheio.create).not.toHaveBeenCalled();
    expect(mocks.registrarUsoIa).not.toHaveBeenCalled();
    const gte = (cheio.consultaIaUso!.gte as ReturnType<typeof vi.fn>).mock.calls;
    expect(gte).toEqual([["criado_em", inicioDoDiaOperacionalISO(agoraISOComHora().slice(0, 10))]]);
    expect((cheio.consultaIaUso!.eq as ReturnType<typeof vi.fn>).mock.calls).toEqual([["user_id", USUARIO], ["tipo", "classificar-imovel-identificado"]]);

    const livre = mundo({ usoNaJanela: 199 });
    expect((await chamar()).status).toBe(200);
    expect(livre.create).toHaveBeenCalledTimes(1);

    // Nenhuma janela móvel: a rota usa o dia operacional, não "agora menos 24 h".
    const fonte = readFileSync(resolve("app/api/prospeccao/classificar/route.ts"), "utf8")
      + readFileSync(resolve("lib/servidor/classificacaoProspeccao.ts"), "utf8");
    expect(fonte).toContain("tetoDiarioClassificacao()");
    expect(fonte).not.toMatch(/24 \* 60 \* 60|JANELA|America\/Sao_Paulo/);
  });

  it("ocupado é 409, repetida é 200 { ok, repetida }, exclusão é 409 — todos sem modelo e sem ia_uso", async () => {
    const ocupado = mundo({ iniciar: { ok: false, ocupado: true, run_id: RUN } });
    expect(await chamar()).toMatchObject({ status: 409, corpo: { ok: false, falha: "ocupado" } });
    expect(ocupado.create).not.toHaveBeenCalled();

    const repetida = mundo({ iniciar: { ok: true, repetida: true, run_id: RUN } });
    expect(await chamar()).toMatchObject({ status: 200, corpo: { ok: true, repetida: true } });
    expect(repetida.create).not.toHaveBeenCalled();

    const exclusao = mundo({ identidade: { id: PAI, exclusao_solicitada_em: "2026-09-10T00:00:00Z", tipo: null, tipo_origem: null } });
    expect(await chamar()).toMatchObject({ status: 409, corpo: { ok: false, falha: "exclusao-em-andamento" } });
    expect(exclusao.rpc).not.toHaveBeenCalled();
    expect(mocks.registrarUsoIa).not.toHaveBeenCalled();
  });

  it("sucesso: ia_uso recebe UMA linha, do tipo classificar-imovel-identificado, com o modelo da rota classificacao", async () => {
    mundo();
    await chamar();
    expect(mocks.registrarUsoIa).toHaveBeenCalledTimes(1);
    expect(mocks.registrarUsoIa).toHaveBeenCalledWith(expect.objectContaining({
      userId: USUARIO, tipo: "classificar-imovel-identificado", modelo: "gpt-5.6-luna", tokensEntrada: 350, tokensSaida: 60,
    }));
    // Log sem PII: só código e contadores.
    const eventos = mocks.registrarEvento.mock.calls.map(([e]) => e as { evento: string; detalhe: string | null; categoria: string });
    expect(eventos.map((e) => e.evento)).toContain("ia-classificacao-concluida");
    for (const e of eventos) {
      expect(e.categoria).toBe("ia");
      expect(String(e.detalhe)).not.toMatch(/placa|Rua|Casa fechada/);
    }
  });

  it("falha do executor (429 da OpenAI): 429 limite-excedido, run falha com o mesmo código, sem meia classificação", async () => {
    const m = mundo({ saida: new OpenAI.RateLimitError(429, { message: "rate" }, "rate", new Headers()) });
    const { status, corpo } = await chamar();
    expect(status).toBe(429);
    expect(corpo).toEqual({ ok: false, falha: "limite-excedido" });
    expect(chamadasRpc(m)).toEqual(["iniciar_classificacao", "falhar_classificacao"]);
    expect(falha(m)).toBe("limite-excedido");
    expect(mocks.registrarUsoIa).not.toHaveBeenCalled();
  });

  it("parse inválido: 502 falha-modelo, run falha 'saida-invalida', concluir nunca é chamado — mas o uso foi registrado, porque o modelo rodou", async () => {
    const m = mundo({ saida: "{ isto não é json" });
    const { status, corpo } = await chamar();
    expect(status).toBe(502);
    expect(corpo).toEqual({ ok: false, falha: "falha-modelo" });
    expect(chamadasRpc(m)).toEqual(["iniciar_classificacao", "falhar_classificacao"]);
    expect(falha(m)).toBe("saida-invalida");
    expect(mocks.registrarUsoIa).toHaveBeenCalledTimes(1);
  });

  it("sem permissão de IA na conta: 403, run falha 'sem-permissao', evento ia-sem-permissao", async () => {
    const m = mundo({ liberado: false });
    expect(await chamar()).toMatchObject({ status: 403, corpo: { ok: false, falha: "sem-permissao" } });
    expect(falha(m)).toBe("sem-permissao");
    expect(m.create).not.toHaveBeenCalled();
    expect(mocks.registrarEvento).toHaveBeenCalledWith(expect.objectContaining({ evento: "ia-sem-permissao" }));
  });

  it("/api/ia recusa o tipo classificar-imovel-identificado: ele só existe pela rota própria", async () => {
    mundo();
    const resposta = await ia(new Request("http://localhost/api/ia", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer token-valido" },
      body: JSON.stringify({ tipo: "classificar-imovel-identificado", texto: OBSERVACAO_DO_BANCO }),
    }));
    expect(resposta.status).toBe(400);
    expect(await resposta.json()).toMatchObject({ ok: false, falha: "requisicao-invalida" });
    expect(mocks.criarClienteOpenAIReal).not.toHaveBeenCalled();
  });
});

describe("C8 — fronteiras estruturais", () => {
  const ler = (caminho: string) => readFileSync(resolve(caminho), "utf8");

  it("a captura de fachada e o núcleo da foto não conhecem a classificação nem IA", () => {
    const captura = ler("components/prospeccao/CapturaFachada.tsx") + ler("lib/calculo/fotoFachada.ts");
    expect(captura).not.toMatch(/classificar|classificacaoProspeccao|servidor\/ia|\/api\/ia|openai/i);
  });

  it("a classificação é IA sobre TEXTO: nada de foto, visão, OCR, Storage ou Mapillary no módulo e na rota", () => {
    const modulo = ler("lib/servidor/classificacaoProspeccao.ts") + ler("app/api/prospeccao/classificar/route.ts");
    expect(modulo).not.toMatch(/imoveis_identificados_fotos|storage|image_url|vision|ocr|mapillary|openclip|caminho_miniatura/i);
    // E nunca promove: não toca situação, imovel_id, promoção nem a tabela de imóveis.
    expect(modulo).not.toMatch(/salvarImovel|\.from\("imoveis"\)|promovido_em|imovel_id|situacao/);
    // Só o executor canônico chega ao SDK: nenhum `new OpenAI` fora de openai-real.
    expect(modulo).not.toMatch(/new OpenAI|from "openai"/);
    expect(modulo).not.toContain("ALLOW_REAL_OPENAI");
  });

  it("o texto entregue ao modelo é a observação relida, com o prompt montado no servidor", () => {
    const modulo = ler("lib/servidor/classificacaoProspeccao.ts");
    expect(modulo).toContain("promptClassificarObservacao(avistamento.observacao)");
    expect(modulo).toMatch(/relerAvistamento\(deps\.chamador/);
    // A ordem: o executor só entra depois do claim, com o claim em mãos.
    expect(modulo.indexOf('"iniciar_classificacao"')).toBeLessThan(modulo.indexOf("return executarModelo(deps, claim"));
    expect(modulo).toMatch(/async function executarModelo\(\s*deps: DependenciasClassificacao,\s*claim: Claim/);
  });
});
