import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { POST, GET } from "@/app/api/retomadas/route";

const estado = vi.hoisted(() => ({
  imovel: { id: "60000000-0000-4000-8000-000000000001", user_id: "u", retirado: true, status: "Publicado", proprietario_nome: "Ana", endereco: "Rua Tijuca, 112", proprietario_telefone: "43999990000", retirado_em: null, retirado_motivo: null, retirado_observacao: null },
  mensagens: [] as Array<Record<string, unknown>>, operacoes: [] as Array<{ tabela: string; modo: string; payload: Record<string, unknown>; filtros: Array<[string, unknown]> }>,
  corrida: false, falha: null as null | { code: string; message: string }, semUsuario: false, cliente: vi.fn(),
}));
vi.mock("@supabase/supabase-js", () => ({ createClient: (...args: unknown[]) => { estado.cliente(...args); return {
  auth: { getUser: async () => ({ data: { user: estado.semUsuario ? null : { id: "u" } }, error: null }) },
  from: (tabela: string) => {
    let modo = "ler"; let payload: Record<string, unknown> = {}; let unica = false; let camposLidos = "*";
    const filtros: Array<[string, unknown]> = [];
    const q = {
      select: (campos: string) => { camposLidos = campos; return q; }, eq: (c: string, v: unknown) => { filtros.push([c, v]); return q; },
      in: (c: string, v: unknown) => { filtros.push([c, v]); return q; },
      maybeSingle: () => { unica = true; return q; },
      update: (p: Record<string, unknown>) => { modo = "update"; payload = p; return q; },
      insert: (p: Record<string, unknown>) => { modo = "insert"; payload = p; return q; },
      then: (resolve: (valor: unknown) => unknown) => {
        const linhas = tabela === "imoveis" ? [estado.imovel] : estado.mensagens;
        const casa = (l: Record<string, unknown>) => filtros.every(([c, v]) => Array.isArray(v) ? v.includes(l[c]) : l[c] === v);
        if (modo !== "ler") {
          estado.operacoes.push({ tabela, modo, payload, filtros });
          if (estado.falha) return Promise.resolve({ data: null, error: estado.falha }).then(resolve);
          if (modo === "insert") { const linha = { ...payload, id: "70000000-0000-4000-8000-000000000001" }; estado.mensagens.push(linha); return Promise.resolve({ data: [linha], error: null }).then(resolve); }
          if (estado.corrida) { estado.mensagens[0].updated_at = "versao-outra-aba"; estado.corrida = false; }
          const afetadas = linhas.filter(casa); afetadas.forEach((l) => Object.assign(l, payload));
          return Promise.resolve({ data: afetadas, error: null }).then(resolve);
        }
        const achadas = linhas.filter(casa).map((linha) => camposLidos === "*" ? linha : Object.fromEntries(camposLidos.split(",").map((campo) => { const chave = campo.trim(); return [chave, linha[chave as keyof typeof linha]]; })));
        return Promise.resolve({ data: unica ? achadas[0] ?? null : achadas, error: null }).then(resolve);
      },
    }; return q;
  },
}; } }));

const ID = estado.imovel.id;
const corpo = () => ({ retomadaImovelId: ID, data: "2099-04-04", hora: "09:00", texto: "Olá, podemos conversar sobre o imóvel?", acao: "salvar" });
const pedido = (b = corpo()) => new Request("http://localhost/api/retomadas", { method: "POST", headers: { authorization: "Bearer teste" }, body: JSON.stringify(b) });
const editar = () => ({ ...corpo(), id: estado.mensagens[0].id, versao: estado.mensagens[0].updated_at });
beforeEach(() => {
  vi.stubEnv("NODE_ENV", "development"); vi.stubEnv("RETOMADA_B4_LOCAL", "1");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "http://127.0.0.1:54321"); vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "chave-local-falsa");
  for (const nome of ["VERCEL", "VERCEL_ENV", "CI"]) vi.stubEnv(nome, undefined);
  estado.imovel.retirado = true; estado.imovel.status = "Publicado"; estado.imovel.proprietario_telefone = "43999990000";
  estado.mensagens = []; estado.operacoes = []; estado.corrida = false; estado.falha = null; estado.semUsuario = false; estado.cliente.mockClear();
  vi.stubGlobal("fetch", vi.fn(() => { throw new Error("Efeito externo proibido no B4"); }));
});
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("B4: API, persistência e zero envio", () => {
  it("contexto autenticado retorna nome e endereço persistidos para o default", async () => {
    const resposta = await GET(new Request(`http://localhost/api/retomadas?retomadaImovelId=${ID}`, { headers: { authorization: "Bearer teste" } }));
    expect((await resposta.json()).valor.imovel).toMatchObject({ proprietario_nome: "Ana", endereco: "Rua Tijuca, 112" });
    expect(estado.operacoes).toEqual([]); expect(fetch).not.toHaveBeenCalled();
  });
  it.each(["CI", "VERCEL", "VERCEL_ENV"])("presença de %s bloqueia capacidade e operação antes do cliente", async (chave) => {
    for (const valor of ["", "0", "false", " ", "preview", "development"]) {
      vi.stubEnv(chave, valor);
      expect(await (await GET(new Request("http://localhost/api/retomadas?capacidade=1"))).json()).toEqual({ habilitada: false });
      expect((await POST(pedido())).status).toBe(403);
      expect(estado.cliente).not.toHaveBeenCalled(); expect(estado.operacoes).toEqual([]);
    }
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each(["http://localhost:54321", "http://127.0.0.1:54321"])("ausência das três chaves e loopback explícito habilitam: %s", async (url) => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", url);
    expect(await (await GET(new Request("http://localhost/api/retomadas?capacidade=1"))).json()).toEqual({ habilitada: true });
    expect((await POST(pedido())).status).toBe(200);
    expect(fetch).not.toHaveBeenCalled();
  });
  it.each(["http://localhost", "http://127.0.0.1", "https://localhost:54321", "http://localhost.evil.test:54321", "http://192.0.2.1:54321"])("URL sem loopback HTTP e porta explícita bloqueia: %s", async (url) => {
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", url);
    expect((await POST(pedido())).status).toBe(403);
    expect(estado.cliente).not.toHaveBeenCalled();
  });
  it("cria uma única retomada sem alterar retirada, status ou destinatário", async () => {
    const antes = structuredClone(estado.imovel);
    expect((await (await POST(pedido())).json()).ok).toBe(true);
    expect(estado.imovel).toEqual(antes);
    expect(estado.mensagens[0]).toMatchObject({ tipo: "retomada-retirado", imovel_id: ID, user_id: "u", status: "agendada", agenda_id: null, imoveis_consultados: null, telefone: "43999990000", data_envio: "2099-04-04T12:00:00.000Z" });
    expect(fetch).not.toHaveBeenCalled();
    expect(estado.operacoes.map((o) => o.tabela)).toEqual(["mensagens_agendadas"]);
  });
  it("edita a linha existente e cancela segundo B2, sem novo insert ou envio", async () => {
    await POST(pedido()); const id = estado.mensagens[0].id;
    expect((await (await POST(pedido({ ...editar(), texto: "Texto ajustado" } as ReturnType<typeof corpo>))).json()).ok).toBe(true);
    expect(estado.mensagens).toHaveLength(1); expect(estado.mensagens[0].id).toBe(id);
    expect(estado.operacoes[1].payload).not.toHaveProperty("telefone");
    expect(estado.operacoes[1].filtros).toEqual(expect.arrayContaining([["id", id], ["user_id", "u"], ["imovel_id", ID], ["tipo", "retomada-retirado"], ["status", "agendada"], ["updated_at", expect.any(String)]]));
    expect((await (await POST(pedido({ ...editar(), acao: "cancelar" } as ReturnType<typeof corpo>))).json()).ok).toBe(true);
    expect(estado.mensagens[0]).toMatchObject({ status: "cancelada", cancelamento_motivo: "usuario", cancelamento_origem: "usuario" });
    expect(fetch).not.toHaveBeenCalled();
  });
  it("0 rows não vira sucesso e não recria registro", async () => {
    await POST(pedido()); const b = editar(); estado.corrida = true;
    expect(await (await POST(pedido(b as ReturnType<typeof corpo>))).json()).toEqual({ ok: false, erro: "conflito-edicao" });
    expect(estado.mensagens).toHaveLength(1);
  });
  it("impede duplicata e edição em processando/cancelada ou versão antiga", async () => {
    await POST(pedido());
    expect((await (await POST(pedido())).json()).erro).toBe("retomada-conflitante");
    const b = editar(); estado.mensagens[0].status = "processando";
    expect((await (await POST(pedido(b as ReturnType<typeof corpo>))).json()).erro).toBe("conflito-edicao");
    expect(estado.operacoes).toHaveLength(1);
  });
  it.each([[false, "Publicado", "43999990000", "imovel-nao-retirado"], [true, "Locado", "43999990000", "estado-incompativel"], [true, "Publicado", "123", "destinatario-ausente"]])("recusa imóvel incompatível %s / %s / %s", async (retirado, status, telefone, erro) => {
    Object.assign(estado.imovel, { retirado, status, proprietario_telefone: telefone });
    expect((await (await POST(pedido())).json()).erro).toBe(erro); expect(estado.operacoes).toHaveLength(0);
  });
  it("reativação concorrente recusa edição; recarregar mostra cancelamento B2", async () => {
    await POST(pedido()); const b = editar(); estado.imovel.retirado = false;
    Object.assign(estado.mensagens[0], { status: "cancelada", cancelamento_motivo: "imovel-reativado" });
    expect((await (await POST(pedido(b as ReturnType<typeof corpo>))).json()).erro).toBe("conflito-edicao");
    const r = await GET(new Request(`http://localhost/api/retomadas?retomadaImovelId=${ID}&id=${b.id}`, { headers: { authorization: "Bearer teste" } }));
    expect((await r.json()).valor.programacao.cancelamento_motivo).toBe("imovel-reativado");
  });
  it("erros fechados não expõem banco; erro desconhecido nunca vira sucesso", async () => {
    estado.falha = { code: "XX000", message: "secret do banco" };
    expect(await (await POST(pedido())).json()).toEqual({ ok: false, erro: "falha-operacao" });
    estado.falha.code = "23505";
    expect((await (await POST(pedido())).json()).erro).toBe("retomada-conflitante");
  });
  it("flag OFF, Preview/Production e banco remoto bloqueiam antes de autenticar/escrever", async () => {
    for (const [nome, valor] of [["RETOMADA_B4_LOCAL", "0"], ["VERCEL_ENV", "preview"], ["VERCEL_ENV", "production"], ["NEXT_PUBLIC_SUPABASE_URL", "https://production.supabase.co"]]) {
      vi.stubEnv(nome, valor);
      expect((await POST(pedido())).status).toBe(403); expect(estado.cliente).not.toHaveBeenCalled();
      vi.stubEnv(nome, nome === "RETOMADA_B4_LOCAL" ? "1" : nome === "NEXT_PUBLIC_SUPABASE_URL" ? "http://127.0.0.1:54321" : undefined);
    }
    expect(fetch).not.toHaveBeenCalled();
  });
  it("identidades extras, destinatário injetado e sessão inválida falham fechados", async () => {
    for (const extra of [{ imovelIdRelacionado: ID }, { telefone: "43988880000" }, { agendaId: ID }, { tipo: "livre" }]) expect((await POST(pedido({ ...corpo(), ...extra }))).status).toBe(400);
    estado.semUsuario = true;
    expect((await POST(pedido())).status).toBe(401); expect(estado.operacoes).toHaveLength(0);
  });
});
