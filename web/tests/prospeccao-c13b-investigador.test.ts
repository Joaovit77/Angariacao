// @vitest-environment jsdom

/* ================================================================
   GARIMPO EM CAMPO — C13B: o Investigador persiste memória

   Ponto único de escrita: a rota POST do Investigador, DEPOIS de a
   pesquisa concluir com sucesso e SÓ quando a origem é um imóvel
   identificado do Garimpo (posse conferida sob RLS antes de pesquisar).
   O id da execução nasce no servidor; o navegador manda o UUID do imóvel
   e mais nada. A gravação passa pela RPC do C13A, com retry interno pelo
   mesmo id (idempotente). Só campos estruturados do catálogo fechado,
   sem PII, sem texto livre; ausência é ausência; fontes e contradições
   ficam separadas. Falha de memória é explícita na tela. Nada promove,
   nada muda de situação, nada escreve em `imoveis`.

   Corretivo (três limites semânticos):
   - a consulta digitada é texto livre e NÃO é persistida, nem tem coluna;
   - `valor_anunciado` fica reservado: sem finalidade (venda/locação)
     estruturada, R$ 450.000 e R$ 2.500 não podem virar falsa contradição;
   - a faixa de correspondência do anúncio NÃO vira confiança do atributo:
     toda afirmação do Investigador sai com `confianca = null`.
   ================================================================ */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { PGlite } from "@electric-sql/pglite";
import { act, cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  analisarCorrespondenciasInvestigacao,
  extrairCamposInvestigacao,
  type CorrespondenciaInvestigacao,
  type ResultadoWebInvestigacao,
} from "@/lib/calculo/investigadorImoveis";
import {
  ATRIBUTOS_ALIMENTADOS_PELO_INVESTIGADOR,
  ATRIBUTOS_MEMORIA,
  ATRIBUTOS_RESERVADOS,
  derivarMemoriaAtual,
  extrairAfirmacoesDaInvestigacao,
  type AfirmacaoRegistrada,
} from "@/lib/calculo/memoriaIdentidade";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getSupabase: vi.fn(),
  buscarImovelNaWeb: vi.fn(),
  associarReferencias: vi.fn(),
  persistirMemoria: vi.fn(),
  investigarImovel: vi.fn(),
  carregarContextoInvestigador: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/persistencia/supabase", () => ({ getSupabase: mocks.getSupabase }));
vi.mock("@/lib/servidor/investigadorImoveis", () => ({
  buscarImovelNaWeb: mocks.buscarImovelNaWeb,
  BuscaWebIndisponivel: class BuscaWebIndisponivel extends Error { motivo = "provedor"; },
}));
vi.mock("@/lib/servidor/referenciasAvaliacaoInvestigador", () => ({
  associarReferenciasAvaliacaoDoInvestigador: mocks.associarReferencias,
}));
vi.mock("@/lib/servidor/memoriaIdentidade", async (importar) => {
  const real = await importar<typeof import("@/lib/servidor/memoriaIdentidade")>();
  return { ...real, persistirMemoriaDaInvestigacao: mocks.persistirMemoria };
});

import { POST } from "@/app/api/investigador-imoveis/route";
import { atributosParaRpc, RPC_REGISTRAR_INVESTIGACAO } from "@/lib/servidor/memoriaIdentidade";

const RAIZ = join(import.meta.dirname, "..", "..");
const ler = (arquivo: string) => readFileSync(join(RAIZ, arquivo), "utf8").replace(/\r\n/g, "\n");
const USUARIO = "10000000-0000-4000-8000-000000000001";
const OUTRO_USUARIO = "10000000-0000-4000-8000-000000000002";
const IDENTIFICADO = "55555555-5555-4555-8555-555555555555";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type Json = Record<string, unknown>;

/** Um resultado como o servidor de busca o entrega: título e descrição
    da web, e os campos estruturados que o PRÓPRIO Investigador extrai
    deles (contrato do C10; nenhum parsing novo no C13B). */
function resultadoWeb(url: string, titulo: string, descricao: string): ResultadoWebInvestigacao {
  return {
    titulo, url, dominio: new URL(url).hostname.replace(/^www\./, ""), descricao, consultas: ["q"],
    ...extrairCamposInvestigacao(`${titulo} ${descricao}`),
  };
}

const CONSULTA = "Rua das Palmeiras, 120, Centro, Londrina, PR, Casa";
/** O que uma pessoa pode digitar: nome, telefone e e-mail do proprietário.
    Nada disto pode chegar à memória por nenhum caminho. */
const CONSULTA_COM_PII = "casa rua das palmeiras 120 proprietario Joaquina telefone 43 98888-1111 joaquina@example.com";
const PII_DA_CONSULTA = /Joaquina|98888|example\.com|proprietario|telefone/i;
const ANUNCIO_A = resultadoWeb(
  "https://www.portal-a.test/anuncio/1",
  "Casa na Rua das Palmeiras, 120 – Residencial Aurora",
  "Casa com 85,5 m², 3 quartos, 2 vagas. Venda R$ 450.000. Ref: CA-7781. Fale com Maria (43) 99999-0000 ou maria@exemplo.com",
);
const ANUNCIO_B = resultadoWeb(
  "https://portal-b.test/imovel/9",
  "Casa 3 quartos Rua das Palmeiras 120",
  "95 m², 3 quartos, 2 vagas de garagem. Aluguel R$ 2.500 por mês. Ref: CA-7781.",
);

function correspondencias(...itens: ResultadoWebInvestigacao[]): CorrespondenciaInvestigacao[] {
  return analisarCorrespondenciasInvestigacao(CONSULTA, itens).map((c) => ({ ...c, comparavelId: null }));
}

/** A correspondência de um anúncio pela fonte, não pela posição: a ordem é
    o ranking do Investigador, que não é assunto da memória. Desde o B2 os
    dois anúncios empatam (o B, sem vírgula, também tem endereço idêntico). */
function daFonte(resultados: CorrespondenciaInvestigacao[], anuncio: ResultadoWebInvestigacao) {
  const encontrada = resultados.find((item) => item.url === anuncio.url);
  if (!encontrada) throw new Error(`fonte ausente: ${anuncio.url}`);
  return encontrada;
}

/* ================================================================
   1. UNITÁRIO: saída real do Investigador → afirmações do catálogo
   ================================================================ */
describe("C13B — do resultado estruturado do Investigador às afirmações do C13A", () => {
  it("A/G/H/J. os campos estruturados alimentáveis viram afirmações tipadas com URL e domínio da fonte; preço fica de fora", () => {
    const [a] = correspondencias(ANUNCIO_A);
    expect(a).toMatchObject({ area: 85.5, quartos: 3, vagas: 2, preco: 450000, referencia: "CA-7781" });
    expect(a.condominio).toMatch(/Residencial Aurora/);
    const { afirmacoes, recusadas } = extrairAfirmacoesDaInvestigacao([a]);
    expect(recusadas).toBe(0); // preço não é recusa: é reserva; ausência de finalidade é neutra
    expect(afirmacoes.map((x) => [x.atributo, x.valorNum, x.valorTexto])).toEqual([
      ["area_m2", 85.5, null], ["quartos", 3, null], ["vagas", 2, null],
      ["condominio", null, a.condominio], ["referencia_anuncio", null, "CA-7781"],
    ]);
    for (const x of afirmacoes) {
      expect(x.fonteUrl).toBe("https://www.portal-a.test/anuncio/1");
      expect(x.fonteDominio).toBe("portal-a.test");
      expect(typeof (x.valorNum ?? x.valorTexto)).toBe(x.valorNum !== null ? "number" : "string");
    }
  });

  it("catálogo: os 6 atributos do C13A continuam no banco; o Investigador alimenta 5 e `valor_anunciado` fica reservado", () => {
    expect([...ATRIBUTOS_MEMORIA]).toEqual(["area_m2", "quartos", "vagas", "valor_anunciado", "condominio", "referencia_anuncio"]);
    expect([...ATRIBUTOS_RESERVADOS]).toEqual(["valor_anunciado"]);
    expect([...ATRIBUTOS_ALIMENTADOS_PELO_INVESTIGADOR]).toEqual(["area_m2", "quartos", "vagas", "condominio", "referencia_anuncio"]);
    expect(new Set([...ATRIBUTOS_ALIMENTADOS_PELO_INVESTIGADOR, ...ATRIBUTOS_RESERVADOS])).toEqual(new Set(ATRIBUTOS_MEMORIA));
    // O banco segue aceitando o atributo reservado: nada foi tirado do schema.
    expect(ler("supabase/migrations/20260915190000_prospeccao_memoria_identidade.sql")).toContain("'valor_anunciado'");
  });

  it("D/E. preço sem finalidade estruturada NÃO é persistido: 450.000 (venda) e 2.500 (aluguel) não viram contradição", () => {
    const todas = correspondencias(ANUNCIO_A, ANUNCIO_B);
    const [a, b] = [daFonte(todas, ANUNCIO_A), daFonte(todas, ANUNCIO_B)];
    expect([a.preco, b.preco]).toEqual([450000, 2500]);
    expect(a).not.toHaveProperty("finalidade");
    const { afirmacoes, recusadas } = extrairAfirmacoesDaInvestigacao([a, b]);
    expect(afirmacoes.filter((x) => x.atributo === "valor_anunciado")).toEqual([]);
    expect(recusadas).toBe(0);
    expect(JSON.stringify(afirmacoes)).not.toMatch(/450000|2500|valor_anunciado|venda|aluguel|locacao|temporada|finalidade/);
    // Os demais atributos das duas fontes seguem normalmente, inclusive a divergência real de área.
    expect(afirmacoes.map((x) => [x.atributo, x.valorNum ?? x.valorTexto, x.fonteDominio])).toEqual([
      ["area_m2", 85.5, "portal-a.test"], ["quartos", 3, "portal-a.test"], ["vagas", 2, "portal-a.test"],
      ["condominio", a.condominio, "portal-a.test"], ["referencia_anuncio", "CA-7781", "portal-a.test"],
      ["area_m2", 95, "portal-b.test"], ["quartos", 3, "portal-b.test"], ["vagas", 2, "portal-b.test"],
      ["referencia_anuncio", "CA-7781", "portal-b.test"],
    ]);
  });

  it("C/H. PII e texto livre (título, descrição, evidências, endereço) nunca viram afirmação; condomínio/referência contaminados são recusados", () => {
    const [a] = correspondencias(ANUNCIO_A);
    expect(`${a.titulo} ${a.descricao} ${a.evidencias.join(" ")}`).toMatch(/Maria|99999|exemplo\.com/);
    const texto = JSON.stringify(extrairAfirmacoesDaInvestigacao([a]).afirmacoes);
    expect(texto).not.toMatch(/Maria|99999|exemplo\.com|Fale com|Rua das Palmeiras|Londrina|Casa na Rua|titulo|descricao|evidencias/);
    // Campo estruturado curto contaminado por dado pessoal é recusado e contado.
    const contaminada = { ...a, condominio: "Residencial Aurora, falar com Maria 43 99999-0000", referencia: "CPF 123.456.789-00" };
    const resultado = extrairAfirmacoesDaInvestigacao([contaminada]);
    expect(resultado.recusadas).toBe(2);
    expect(resultado.afirmacoes.map((x) => x.atributo)).toEqual(["area_m2", "quartos", "vagas"]);
  });

  it("C. a consulta digitada não é entrada da extração: mesmo que o anúncio a ecoe em texto livre, nada dela vira atributo", () => {
    const [a] = analisarCorrespondenciasInvestigacao(CONSULTA_COM_PII, [
      resultadoWeb("https://portal-d.test/1", CONSULTA_COM_PII, `${CONSULTA_COM_PII}. Casa com 3 quartos.`),
    ]);
    const { afirmacoes } = extrairAfirmacoesDaInvestigacao([a]);
    expect(afirmacoes.map((x) => [x.atributo, x.valorNum])).toEqual([["quartos", 3]]);
    expect(JSON.stringify(afirmacoes)).not.toMatch(PII_DA_CONSULTA);
  });

  it("E/F. ausente, vazio ou inválido não vira afirmação: ausência é ausência", () => {
    const [a] = correspondencias(ANUNCIO_A);
    const semNada = { ...a, preco: null, area: null, quartos: null, vagas: null, condominio: null, referencia: null };
    expect(extrairAfirmacoesDaInvestigacao([semNada])).toEqual({ afirmacoes: [], recusadas: 0 });
    const vazios = { ...a, preco: null, area: null, quartos: null, vagas: null, condominio: "", referencia: "   " };
    const r = extrairAfirmacoesDaInvestigacao([vazios]);
    expect(r.afirmacoes).toEqual([]);
    expect(r.recusadas).toBe(1); // "   " existe, mas não tem valor real
    const invalidos = { ...a, preco: null, area: -5, quartos: -1, vagas: null, condominio: null, referencia: null };
    expect(extrairAfirmacoesDaInvestigacao([invalidos])).toEqual({ afirmacoes: [], recusadas: 2 });
  });

  it("F. a faixa de correspondência (anúncio ↔ imóvel) não vira confiança factual do atributo: sempre null, nunca número", () => {
    const [a] = correspondencias(ANUNCIO_A);
    expect(["muito-forte", "forte", "possivel", "indicio"]).toContain(a.confianca);
    for (const faixa of ["muito-forte", "forte"] as CorrespondenciaInvestigacao["confianca"][]) {
      const { afirmacoes } = extrairAfirmacoesDaInvestigacao([{ ...a, confianca: faixa }]);
      expect(afirmacoes.length).toBeGreaterThan(0);
      expect(afirmacoes.every((x) => x.confianca === null)).toBe(true);
    }
    // B3-M1: possível, indício (e faixa desconhecida) não afirmam; ficar de fora não é recusa.
    for (const faixa of ["possivel", "indicio", "certeza"] as CorrespondenciaInvestigacao["confianca"][]) {
      expect(extrairAfirmacoesDaInvestigacao([{ ...a, confianca: faixa }])).toEqual({ afirmacoes: [], recusadas: 0 });
    }
    const { afirmacoes } = extrairAfirmacoesDaInvestigacao(correspondencias(ANUNCIO_A, ANUNCIO_B));
    expect(atributosParaRpc(afirmacoes).every((x) => x.confianca === null)).toBe(true);
    expect(JSON.stringify(afirmacoes)).not.toMatch(/muito-forte|forte|possivel|indicio|100|90|80|score/);
  });

  it("K/L. duas fontes ficam separadas (mesmo valor ou contraditório); a mesma evidência repetida conta uma vez", () => {
    const todas = correspondencias(ANUNCIO_A, ANUNCIO_B);
    const [a, b] = [daFonte(todas, ANUNCIO_A), daFonte(todas, ANUNCIO_B)];
    const { afirmacoes, recusadas } = extrairAfirmacoesDaInvestigacao([a, b, a]);
    const quartos = afirmacoes.filter((x) => x.atributo === "quartos");
    expect(quartos.map((x) => [x.valorNum, x.fonteDominio])).toEqual([[3, "portal-a.test"], [3, "portal-b.test"]]);
    const areas = afirmacoes.filter((x) => x.atributo === "area_m2");
    expect(areas.map((x) => [x.valorNum, x.fonteDominio])).toEqual([[85.5, "portal-a.test"], [95, "portal-b.test"]]);
    expect(afirmacoes.filter((x) => x.atributo === "valor_anunciado")).toEqual([]); // reservado: ver D/E
    expect(recusadas).toBe(5); // as 5 do `a` repetido
  });

  it("B/M. só o catálogo: campos que o Investigador tem e o catálogo não (endereço, banheiros, tipo) ficam de fora", () => {
    const [a] = correspondencias(ANUNCIO_A);
    const comExtras = { ...a, banheiros: 2, tipo: "Casa", proprietario: "Maria", telefone: "43 99999-0000" } as CorrespondenciaInvestigacao;
    const { afirmacoes } = extrairAfirmacoesDaInvestigacao([comExtras]);
    expect(new Set(afirmacoes.map((x) => x.atributo))).toEqual(new Set(["area_m2", "quartos", "vagas", "condominio", "referencia_anuncio"]));
    expect(JSON.stringify(atributosParaRpc(afirmacoes))).not.toMatch(/endereco|banheiros|tipo|proprietario|telefone|titulo|descricao/);
  });
});

/* ================================================================
   2. SERVIDOR: a ponte para a RPC do C13A
   ================================================================ */
describe("C13B — persistirMemoriaDaInvestigacao: payload, retry pelo mesmo id, estados explícitos", () => {
  // A rota usa o mock; aqui é a implementação real que está em julgamento.
  let persistirMemoriaDaInvestigacao: typeof import("@/lib/servidor/memoriaIdentidade")["persistirMemoriaDaInvestigacao"];
  beforeAll(async () => {
    ({ persistirMemoriaDaInvestigacao } = await vi.importActual<typeof import("@/lib/servidor/memoriaIdentidade")>("@/lib/servidor/memoriaIdentidade"));
  });
  function servico(respostas: Array<{ data?: unknown; error?: { code: string } | null; lanca?: boolean }>) {
    let chamada = 0;
    const rpc = vi.fn().mockImplementation(async () => {
      const r = respostas[Math.min(chamada, respostas.length - 1)];
      chamada += 1;
      if (r.lanca) throw new Error("rede");
      return { data: r.data ?? null, error: r.error ?? null };
    });
    return { cliente: { rpc } as never, rpc };
  }
  const pedido = () => ({
    userId: USUARIO, execucaoId: randomUUID(), imovelIdentificadoId: IDENTIFICADO,
    resultados: correspondencias(ANUNCIO_A, ANUNCIO_B),
  });

  beforeEach(() => { vi.spyOn(console, "warn").mockImplementation(() => undefined); vi.spyOn(console, "info").mockImplementation(() => undefined); });
  afterEach(() => { vi.restoreAllMocks(); });

  it("chama a RPC do C13A uma vez, com identidade do servidor, colunas do banco e só afirmações do catálogo", async () => {
    const p = pedido();
    const { cliente, rpc } = servico([{ data: { ok: true, repetida: false, investigacao_id: p.execucaoId, atributos_salvos: 9, atributos_recusados: 0 } }]);
    const memoria = await persistirMemoriaDaInvestigacao(p, { servico: cliente });
    expect(memoria).toEqual({ estado: "salva", execucaoId: p.execucaoId, atributosSalvos: 9, atributosRecusados: 0 });
    expect(rpc).toHaveBeenCalledOnce();
    const [nome, parametros] = rpc.mock.calls[0] as [string, Json];
    expect(nome).toBe(RPC_REGISTRAR_INVESTIGACAO);
    expect(Object.keys(parametros).sort()).toEqual(["p_atributos", "p_imovel_identificado_id", "p_investigacao_id", "p_recusados_total", "p_resultados_total", "p_user_id"]);
    expect(parametros).toMatchObject({ p_user_id: USUARIO, p_investigacao_id: p.execucaoId, p_imovel_identificado_id: IDENTIFICADO, p_resultados_total: 2, p_recusados_total: 0 });
    const atributos = parametros.p_atributos as Json[];
    expect(atributos).toHaveLength(9);
    for (const a of atributos) {
      expect(Object.keys(a).sort()).toEqual(["atributo", "confianca", "fonte_dominio", "fonte_url", "valor_num", "valor_texto"]);
      expect(a.confianca).toBeNull();
      expect(a.atributo).not.toBe("valor_anunciado");
    }
    expect(JSON.stringify(parametros)).not.toMatch(/Maria|99999|exemplo\.com|titulo|descricao|evidencias|contradicoes|user_id":"[^"]*"[^}]*\bbody/);
  });

  it("falha transitória: repete com o MESMO id e devolve salva; três falhas: falhou explícito, nunca lança", async () => {
    const p = pedido();
    const umaFalha = servico([{ error: { code: "57P01" } }, { data: { ok: true, repetida: false, atributos_salvos: 9, atributos_recusados: 0 } }]);
    expect(await persistirMemoriaDaInvestigacao(p, { servico: umaFalha.cliente })).toMatchObject({ estado: "salva", execucaoId: p.execucaoId });
    expect(umaFalha.rpc).toHaveBeenCalledTimes(2);
    expect(umaFalha.rpc.mock.calls.map(([, x]) => (x as Json).p_investigacao_id)).toEqual([p.execucaoId, p.execucaoId]);

    const sempre = servico([{ lanca: true }, { error: { code: "08006" } }, { error: { code: "08006" } }]);
    expect(await persistirMemoriaDaInvestigacao(p, { servico: sempre.cliente })).toEqual({ estado: "falhou", execucaoId: p.execucaoId, atributosSalvos: 0, atributosRecusados: 0, codigo: "08006" });
    expect(sempre.rpc).toHaveBeenCalledTimes(3);
    expect(JSON.stringify(vi.mocked(console.warn).mock.calls)).not.toMatch(/Maria|99999|Palmeiras/);
  });

  it("repetida e recusada vêm do banco e não geram nova tentativa; sem service role é indisponível sem tocar nada", async () => {
    const p = pedido();
    const repetida = servico([{ data: { ok: true, repetida: true, atributos_salvos: 9, atributos_recusados: 0 } }]);
    expect(await persistirMemoriaDaInvestigacao(p, { servico: repetida.cliente })).toMatchObject({ estado: "repetida", atributosSalvos: 9 });
    const recusada = servico([{ data: { ok: false, codigo: "exclusao_em_andamento" } }]);
    expect(await persistirMemoriaDaInvestigacao(p, { servico: recusada.cliente })).toEqual({ estado: "recusada", execucaoId: p.execucaoId, atributosSalvos: 0, atributosRecusados: 0, codigo: "exclusao_em_andamento" });
    expect(recusada.rpc).toHaveBeenCalledOnce();
    expect(await persistirMemoriaDaInvestigacao(p, { servico: null })).toEqual({ estado: "indisponivel", execucaoId: p.execucaoId, atributosSalvos: 0, atributosRecusados: 0 });
  });
});

/* ================================================================
   3. ROTA: ponto exato, posse, id do servidor, falhas
   ================================================================ */
describe("C13B — POST /api/investigador-imoveis: persiste só na conclusão, só com posse, só com id do servidor", () => {
  function clienteUsuario(linhaIdentificado: Json | null, userId = USUARIO, erro: { code: string } | null = null) {
    const maybeSingle = vi.fn().mockResolvedValue({ data: erro ? null : linhaIdentificado, error: erro });
    const eqUser = vi.fn().mockReturnValue({ maybeSingle });
    const eqId = vi.fn().mockReturnValue({ eq: eqUser });
    const select = vi.fn().mockReturnValue({ eq: eqId });
    const from = vi.fn().mockReturnValue({ select });
    const getUser = vi.fn().mockResolvedValue({ data: { user: { id: userId } }, error: null });
    return { cliente: { auth: { getUser }, from }, from, select, eqId, eqUser };
  }
  function requisicao(corpo: Json): Request {
    return new Request("http://localhost/api/investigador-imoveis", {
      method: "POST",
      headers: { Authorization: "Bearer token-valido", "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
    });
  }
  async function eventos(resposta: Response) {
    return (await resposta.text()).trim().split("\n").filter(Boolean).map((l) => JSON.parse(l) as Json);
  }
  const busca = () => ({ resultados: [ANUNCIO_A, ANUNCIO_B], falhas: 0, limiteAtingido: false, consultasExecutadas: ["q"], pesquisasEvitadas: 0, encerramentoAntecipado: false });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://projeto.supabase.co");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
    mocks.associarReferencias.mockImplementation(async (_c: unknown, _u: unknown, itens: CorrespondenciaInvestigacao[]) => itens.map((i) => ({ ...i, comparavelId: null })));
    mocks.persistirMemoria.mockImplementation(async ({ execucaoId }: { execucaoId: string }) => ({ estado: "salva", execucaoId, atributosSalvos: 9, atributosRecusados: 0 }));
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });
  afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks(); });

  it("1/2. sem referência do Garimpo: pesquisa normal, nenhuma consulta de posse, nenhuma persistência, nenhum campo memoria", async () => {
    const fake = clienteUsuario({ id: IDENTIFICADO });
    mocks.createClient.mockReturnValue(fake.cliente);
    mocks.buscarImovelNaWeb.mockResolvedValue(busca());
    const lista = await eventos(await POST(requisicao({ consulta: CONSULTA })));
    const final = lista.find((e) => e.tipo === "resultado") as Json;
    expect((final.dados as Json).memoria).toBeUndefined();
    expect(fake.from).not.toHaveBeenCalled();
    expect(mocks.persistirMemoria).not.toHaveBeenCalled();
  });

  it("3/4. com referência: posse conferida sob o usuário autenticado ANTES da pesquisa; persiste UMA vez, DEPOIS da pesquisa, com id gerado no servidor", async () => {
    const fake = clienteUsuario({ id: IDENTIFICADO });
    mocks.createClient.mockReturnValue(fake.cliente);
    const ordem: string[] = [];
    mocks.buscarImovelNaWeb.mockImplementation(async () => { ordem.push("busca"); return busca(); });
    mocks.persistirMemoria.mockImplementation(async ({ execucaoId }: { execucaoId: string }) => { ordem.push("memoria"); return { estado: "salva", execucaoId, atributosSalvos: 9, atributosRecusados: 0 }; });
    fake.eqUser.mockImplementation(() => { ordem.push("posse"); return { maybeSingle: vi.fn().mockResolvedValue({ data: { id: IDENTIFICADO }, error: null }) }; });

    const lista = await eventos(await POST(requisicao({
      consulta: CONSULTA, imovelIdentificado: IDENTIFICADO,
      // Tudo isto é ignorado: nada do cliente vira identidade, id ou fato.
      user_id: OUTRO_USUARIO, execucaoId: "99999999-9999-4999-8999-999999999999", atributos: [{ atributo: "quartos", valor_num: 9 }],
    })));
    expect(ordem).toEqual(["posse", "busca", "memoria"]);
    expect(fake.from).toHaveBeenCalledExactlyOnceWith("imoveis_identificados");
    expect(fake.select).toHaveBeenCalledWith("id");
    expect(fake.eqId).toHaveBeenCalledWith("id", IDENTIFICADO);
    expect(fake.eqUser).toHaveBeenCalledWith("user_id", USUARIO);
    expect(mocks.persistirMemoria).toHaveBeenCalledOnce();
    const pedido = mocks.persistirMemoria.mock.calls[0][0] as Json;
    expect(pedido.userId).toBe(USUARIO);
    expect(pedido.imovelIdentificadoId).toBe(IDENTIFICADO);
    expect(pedido.execucaoId).toMatch(UUID);
    expect(pedido.execucaoId).not.toBe("99999999-9999-4999-8999-999999999999");
    expect(pedido).not.toHaveProperty("consulta");
    expect(Object.keys(pedido).sort()).toEqual(["execucaoId", "imovelIdentificadoId", "resultados", "userId"]);
    expect((pedido.resultados as unknown[]).length).toBe(2);
    expect(JSON.stringify(pedido)).not.toContain('"valor_num":9');
    const final = lista.find((e) => e.tipo === "resultado") as Json;
    expect((final.dados as Json).memoria).toEqual({ estado: "salva", execucaoId: pedido.execucaoId, atributosSalvos: 9, atributosRecusados: 0 });
    expect(JSON.stringify(lista)).not.toContain(OUTRO_USUARIO);
  });

  it("A/B/C. consulta com nome, telefone e e-mail: a pesquisa acontece, a investigação é registrada, e NADA da consulta chega à RPC", async () => {
    mocks.createClient.mockReturnValue(clienteUsuario({ id: IDENTIFICADO }).cliente);
    mocks.buscarImovelNaWeb.mockResolvedValue(busca());
    // Implementação real da ponte, com um cliente de serviço falso que captura o que iria ao banco.
    const rpc = vi.fn().mockResolvedValue({ data: { ok: true, repetida: false, atributos_salvos: 9, atributos_recusados: 0 }, error: null });
    const { persistirMemoriaDaInvestigacao: real } = await vi.importActual<typeof import("@/lib/servidor/memoriaIdentidade")>("@/lib/servidor/memoriaIdentidade");
    mocks.persistirMemoria.mockImplementation((pedido: Parameters<typeof real>[0]) => real(pedido, { servico: { rpc } as never }));

    const lista = await eventos(await POST(requisicao({ consulta: CONSULTA_COM_PII, imovelIdentificado: IDENTIFICADO })));
    const final = lista.find((e) => e.tipo === "resultado") as Json;
    expect((final.dados as Json).consultaOriginal).toBe(CONSULTA_COM_PII); // a pessoa vê o que digitou: isso é resposta, não memória
    expect((final.dados as Json).memoria).toMatchObject({ estado: "salva", atributosSalvos: 9 });
    expect(rpc).toHaveBeenCalledOnce();
    const [, parametros] = rpc.mock.calls[0] as [string, Json];
    expect(parametros).not.toHaveProperty("p_consulta");
    expect(JSON.stringify(parametros)).not.toMatch(PII_DA_CONSULTA);
    expect(JSON.stringify(parametros)).not.toContain("palmeiras");
    const atributos = parametros.p_atributos as Json[];
    expect(atributos.length).toBe(9);
    expect(atributos.every((a) => ATRIBUTOS_ALIMENTADOS_PELO_INVESTIGADOR.includes(a.atributo as never))).toBe(true);
    expect(atributos.every((a) => !PII_DA_CONSULTA.test(String(a.valor_texto ?? "")))).toBe(true);
    expect(mocks.buscarImovelNaWeb).toHaveBeenCalledOnce(); // a pesquisa em si não muda
  });

  it("posse negada (registro de outra conta ou inexistente) responde 404 sem pesquisar; UUID inválido responde 400", async () => {
    const fake = clienteUsuario(null);
    mocks.createClient.mockReturnValue(fake.cliente);
    const negada = await POST(requisicao({ consulta: CONSULTA, imovelIdentificado: IDENTIFICADO }));
    expect(negada.status).toBe(404);
    expect(await negada.json()).toEqual({ mensagem: "Não foi possível carregar o imóvel indicado. Você ainda pode preencher a pesquisa manualmente." });
    expect(mocks.buscarImovelNaWeb).not.toHaveBeenCalled();
    expect(mocks.persistirMemoria).not.toHaveBeenCalled();
    const invalida = await POST(requisicao({ consulta: CONSULTA, imovelIdentificado: "nao-e-uuid" }));
    expect(invalida.status).toBe(400);
    expect(fake.from).toHaveBeenCalledOnce(); // só a tentativa válida chegou ao banco
    const falhaBanco = clienteUsuario(null, USUARIO, { code: "57P01" });
    mocks.createClient.mockReturnValue(falhaBanco.cliente);
    expect((await POST(requisicao({ consulta: CONSULTA, imovelIdentificado: IDENTIFICADO }))).status).toBe(503);
    expect(mocks.buscarImovelNaWeb).not.toHaveBeenCalled();
  });

  it("11. pesquisa falha: evento de erro e ZERO persistência, mesmo com posse conferida", async () => {
    mocks.createClient.mockReturnValue(clienteUsuario({ id: IDENTIFICADO }).cliente);
    mocks.buscarImovelNaWeb.mockRejectedValue(new Error("provedor fora"));
    const lista = await eventos(await POST(requisicao({ consulta: CONSULTA, imovelIdentificado: IDENTIFICADO })));
    expect(lista.at(-1)).toMatchObject({ tipo: "erro" });
    expect(lista.some((e) => e.tipo === "resultado")).toBe(false);
    expect(mocks.persistirMemoria).not.toHaveBeenCalled();
  });

  it("12/10. memória falha ou pesquisa sem atributo: a pesquisa continua entregue e o estado vai explícito no resultado", async () => {
    mocks.createClient.mockReturnValue(clienteUsuario({ id: IDENTIFICADO }).cliente);
    mocks.buscarImovelNaWeb.mockResolvedValue(busca());
    mocks.persistirMemoria.mockImplementation(async ({ execucaoId }: { execucaoId: string }) => ({ estado: "falhou", execucaoId, atributosSalvos: 0, atributosRecusados: 0, codigo: "08006" }));
    let final = (await eventos(await POST(requisicao({ consulta: CONSULTA, imovelIdentificado: IDENTIFICADO })))).find((e) => e.tipo === "resultado") as Json;
    expect((final.dados as Json).ok).toBe(true);
    expect((final.dados as Json).memoria).toMatchObject({ estado: "falhou", codigo: "08006" });
    expect(((final.dados as Json).resultados as unknown[]).length).toBe(2);

    mocks.buscarImovelNaWeb.mockResolvedValue({ ...busca(), resultados: [] });
    mocks.persistirMemoria.mockImplementation(async ({ execucaoId, resultados }: { execucaoId: string; resultados: unknown[] }) => ({ estado: "salva", execucaoId, atributosSalvos: resultados.length, atributosRecusados: 0 }));
    final = (await eventos(await POST(requisicao({ consulta: CONSULTA, imovelIdentificado: IDENTIFICADO })))).find((e) => e.tipo === "resultado") as Json;
    expect((final.dados as Json).memoria).toMatchObject({ estado: "salva", atributosSalvos: 0 });
    expect(mocks.persistirMemoria).toHaveBeenCalledTimes(2);
  });

  it("segurança estrutural: rota sem rpc/insert/update, sem service role no cliente, payload limitado, no-store", () => {
    const rota = ler("web/app/api/investigador-imoveis/route.ts");
    expect(rota).not.toMatch(/\.rpc\(|\.insert\(|\.update\(|\.upsert\(|SERVICE_ROLE/);
    expect(rota).not.toMatch(/\.from\([^)]*\)[^;]*\.delete\s*\(/);
    expect(rota).toContain("tamanhoDeclarado > 4_096");
    expect(rota).toContain('"Cache-Control": "no-store"');
    expect(rota).toMatch(/\.eq\("user_id", userId\)\s+\.maybeSingle\(\)/);
    expect(rota).toContain("const execucaoId = novaExecucaoInvestigacao();");
    expect(rota.indexOf("const execucaoId = novaExecucaoInvestigacao();")).toBeLessThan(rota.indexOf("new ReadableStream"));
    expect(rota.indexOf("persistirMemoriaDaInvestigacao({")).toBeGreaterThan(rota.indexOf("await buscarImovelNaWeb("));
    // A consulta digitada não passa pela ponte nem pela RPC: nem campo, nem parâmetro.
    expect(rota).toMatch(/persistirMemoriaDaInvestigacao\(\{ userId, execucaoId, imovelIdentificadoId, resultados \}\)/);
    const ponte = ler("web/lib/servidor/memoriaIdentidade.ts");
    expect(ponte).not.toMatch(/p_consulta|consultaOriginal|LIMITE_CONSULTA/);
    expect(ponte).not.toMatch(/^\s+consulta:/m);
    expect(ler("web/lib/calculo/memoriaIdentidade.ts")).not.toMatch(/LIMITE_CONSULTA_MEMORIA|consulta: string|\["preco", "valor_anunciado"\]|FAIXAS_CONFIANCA/);
    for (const arquivo of ["web/lib/investigadorImoveis.ts", "web/components/investigador/InvestigadorImoveisView.tsx"]) {
      expect(ler(arquivo)).not.toMatch(/SERVICE_ROLE|registrar_investigacao_identificado|execucaoId:|randomUUID/);
    }
    // Nenhum contexto novo sai para o provedor: o corpo só ganha o UUID.
    expect(ler("web/lib/investigadorImoveis.ts")).toContain("JSON.stringify(imovelIdentificado ? { consulta, imovelIdentificado } : { consulta })");
    expect(ler("web/lib/servidor/memoriaIdentidade.ts")).not.toMatch(/fetch\(|openai|rapidapi/i);
  });
});

/* ================================================================
   4. BANCO LOCAL: payload real na RPC real
   ================================================================ */
describe.sequential("C13B — payload real do Investigador na RPC do C13A (PGlite)", () => {
  const PASTA = "supabase/migrations/";
  let db: PGlite;

  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`
      create role anon nologin; create role authenticated nologin; create role service_role nologin;
      create schema auth; create schema private; create schema storage;
      create table auth.users (id uuid primary key);
      insert into auth.users values ('${USUARIO}'), ('${OUTRO_USUARIO}');
      create function auth.uid() returns uuid language sql stable
        as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema auth to authenticated, service_role;
      grant usage on schema public to authenticated, service_role, anon;
      create function public.set_updated_at() returns trigger language plpgsql
        as $$ begin new.updated_at := now(); return new; end; $$;
      create table public.imoveis (id uuid primary key, user_id uuid references auth.users(id));
      create table storage.objects (id uuid primary key, bucket_id text, name text);
    `);
    for (const nome of [
      "20260910184310_prospeccao_campo.sql", "20260910190155_prospeccao_campo_rls_grants.sql",
      "20260910193412_prospeccao_campo_triggers.sql", "20260910211045_prospeccao_campo_rpcs_navegador.sql",
      "20260913162604_prospeccao_merge_contrato_transacional.sql", "20260915190000_prospeccao_memoria_identidade.sql",
    ]) await db.exec(ler(PASTA + nome));
    // Qualquer escrita no Pipeline aborta o ensaio.
    await db.exec(`
      create function private.bloquear_pipeline_teste() returns trigger language plpgsql as $$
      begin raise exception 'C13B tentou escrever em imoveis'; end; $$;
      create trigger bloquear_pipeline_teste before insert or update or delete on public.imoveis
        for each statement execute function private.bloquear_pipeline_teste();
    `);
  }, 30_000);
  beforeEach(async () => { await db.exec("reset role; truncate public.imoveis_identificados cascade; begin"); });
  afterEach(async () => { await db.exec("rollback; reset role"); });
  afterAll(async () => { await db?.close(); });

  async function identidade() {
    const id = randomUUID();
    await db.query("insert into public.imoveis_identificados (id, user_id, logradouro) values ($1, $2, 'Rua das Palmeiras')", [id, USUARIO]);
    return id;
  }
  /** O que `persistirMemoriaDaInvestigacao` manda, executado como service_role. */
  async function registrarComoServidor(imovel: string, execucao: string, resultados: CorrespondenciaInvestigacao[]) {
    const extracao = extrairAfirmacoesDaInvestigacao(resultados);
    await db.exec("savepoint tentativa");
    try {
      await db.query("select set_config('request.jwt.claim.sub', '', false)");
      await db.exec("set role service_role");
      const r = await db.query<{ resultado: Json }>(
        "select public.registrar_investigacao_identificado($1, $2, $3, $4, $5, $6::jsonb) as resultado",
        [USUARIO, execucao, imovel, resultados.length, extracao.recusadas, JSON.stringify(atributosParaRpc(extracao.afirmacoes))],
      );
      await db.exec("reset role; release savepoint tentativa");
      return r.rows[0].resultado;
    } catch (erro) {
      await db.exec("rollback to savepoint tentativa; reset role");
      throw erro;
    }
  }
  const linhas = async (tabela: string, imovel: string) =>
    (await db.query<{ l: Json }>(`select to_jsonb(t) as l from public.${tabela} t where imovel_identificado_id = $1 order by id`, [imovel])).rows.map((r) => r.l);

  it("3/4/5/9/14/15/16. o payload real grava evento + afirmações tipadas com fonte, sem PII, com contradições separadas, e marca a data; nada mais muda", async () => {
    const imovel = await identidade();
    const antes = (await db.query<Json>("select to_jsonb(i) as l from public.imoveis_identificados i where id = $1", [imovel])).rows[0].l as Json;
    const execucao = randomUUID();
    const resultado = await registrarComoServidor(imovel, execucao, correspondencias(ANUNCIO_A, ANUNCIO_B));
    expect(resultado).toEqual({ ok: true, repetida: false, investigacao_id: execucao, atributos_salvos: 9, atributos_recusados: 0 });
    const [evento] = await linhas("imoveis_identificados_investigacoes", imovel);
    expect(evento).toMatchObject({ id: execucao, user_id: USUARIO, resultados_total: 2, atributos_total: 9, recusados_total: 0, origem: "investigador-web" });
    expect(evento).not.toHaveProperty("consulta");
    const atributos = await linhas("imoveis_identificados_atributos", imovel);
    // Uma linha por fonte; a ordem de inserção segue o ranking, então compara por domínio.
    expect(atributos.filter((a) => a.atributo === "area_m2").map((a) => [a.valor_num, a.fonte_dominio, a.estado])
      .sort((x, y) => String(x[1]).localeCompare(String(y[1])))).toEqual([[85.5, "portal-a.test", "hipotese"], [95, "portal-b.test", "hipotese"]]);
    expect(atributos.filter((a) => a.atributo === "valor_anunciado")).toEqual([]); // reservado: 450.000 × 2.500 não é contradição
    expect(atributos.every((a) => typeof a.valor_num === "number" || typeof a.valor_texto === "string")).toBe(true);
    expect(atributos.every((a) => a.confianca === null && a.observado_em && a.investigacao_id === execucao)).toBe(true);
    expect(JSON.stringify(atributos)).not.toMatch(/Maria|99999|exemplo\.com|Fale com/);
    const depois = (await db.query<Json>("select to_jsonb(i) as l from public.imoveis_identificados i where id = $1", [imovel])).rows[0].l as Json;
    expect(depois.ultima_investigacao_em).not.toBeNull();
    const { ultima_investigacao_em: a1, updated_at: u1, ...restoAntes } = antes;
    const { ultima_investigacao_em: a2, updated_at: u2, ...restoDepois } = depois;
    void a1; void a2; void u1; void u2;
    expect(restoDepois).toEqual(restoAntes); // situação, tipo, imovel_id, promovido_em: intactos
    expect((await db.query("select count(*)::int as n from public.imoveis")).rows[0]).toEqual({ n: 0 });
  });

  it("6/13. retry: primeira tentativa desfeita antes do commit, segunda com o mesmo id → uma investigação, um conjunto de atributos", async () => {
    const imovel = await identidade();
    const execucao = randomUUID();
    const resultados = correspondencias(ANUNCIO_A);
    // 1ª tentativa: a transação cai antes de confirmar (simulado por savepoint desfeito).
    await db.exec("savepoint primeira");
    await registrarComoServidor(imovel, execucao, resultados);
    await db.exec("rollback to savepoint primeira");
    expect(await linhas("imoveis_identificados_investigacoes", imovel)).toEqual([]);
    // 2ª tentativa, mesmo id.
    expect(await registrarComoServidor(imovel, execucao, resultados)).toMatchObject({ ok: true, repetida: false, atributos_salvos: 5 });
    // 3ª (retry após sucesso): repetida, nada muda.
    const antes = await linhas("imoveis_identificados_atributos", imovel);
    expect(await registrarComoServidor(imovel, execucao, resultados)).toMatchObject({ ok: true, repetida: true, atributos_salvos: 5 });
    expect(await linhas("imoveis_identificados_atributos", imovel)).toEqual(antes);
    expect(await linhas("imoveis_identificados_investigacoes", imovel)).toHaveLength(1);
  });

  it("7/8/10. nova execução amanhã com a mesma informação é evidência nova; sem atributo, o evento fica com zero e nada afirma ausência", async () => {
    const imovel = await identidade();
    await registrarComoServidor(imovel, randomUUID(), correspondencias(ANUNCIO_A));
    await registrarComoServidor(imovel, randomUUID(), correspondencias(ANUNCIO_A));
    expect(await linhas("imoveis_identificados_investigacoes", imovel)).toHaveLength(2);
    expect((await linhas("imoveis_identificados_atributos", imovel)).filter((a) => a.atributo === "quartos").map((a) => a.valor_num)).toEqual([3, 3]);

    const vazio = await identidade();
    const semNada = correspondencias(resultadoWeb("https://portal-c.test/x", "Casa na Rua das Palmeiras", "Ligue e saiba mais."));
    expect(extrairAfirmacoesDaInvestigacao(semNada).afirmacoes).toEqual([]);
    expect(await registrarComoServidor(vazio, randomUUID(), semNada)).toMatchObject({ ok: true, atributos_salvos: 0, atributos_recusados: 0 });
    expect(await linhas("imoveis_identificados_investigacoes", vazio)).toHaveLength(1);
    expect(await linhas("imoveis_identificados_atributos", vazio)).toEqual([]);
    expect(await registrarComoServidor(vazio, randomUUID(), [])).toMatchObject({ ok: true, atributos_salvos: 0 });
  });

  it("B/D/E/F/L/M/N/O. investigação feita a partir de uma consulta com PII: o banco não tem onde guardá-la, o preço ambíguo não vira divergência, a confiança fica null e só a data muda", async () => {
    const imovel = await identidade();
    const antes = (await db.query<Json>("select to_jsonb(i) as l from public.imoveis_identificados i where id = $1", [imovel])).rows[0].l as Json;
    // A consulta é a entrada da análise (como na rota), mas não da persistência.
    const resultados = analisarCorrespondenciasInvestigacao(CONSULTA_COM_PII, [ANUNCIO_A, ANUNCIO_B]).map((c) => ({ ...c, comparavelId: null }));
    const execucao = randomUUID();
    expect(await registrarComoServidor(imovel, execucao, resultados)).toMatchObject({ ok: true, atributos_salvos: 9 });
    // B. Nem coluna, nem parâmetro, nem conteúdo.
    const colunas = (await db.query<{ c: string }>("select column_name as c from information_schema.columns where table_schema = 'public' and table_name = any($1)", [["imoveis_identificados_investigacoes", "imoveis_identificados_atributos"]])).rows.map((r) => r.c);
    expect(colunas).not.toContain("consulta");
    const tudo = JSON.stringify([...(await linhas("imoveis_identificados_investigacoes", imovel)), ...(await linhas("imoveis_identificados_atributos", imovel))]);
    expect(tudo).not.toMatch(PII_DA_CONSULTA);
    expect(tudo).not.toMatch(/Maria|99999|exemplo\.com/);
    // D/E. Sem valor_anunciado, a memória derivada não acusa divergência de preço; a de área (85,5 × 95) continua real.
    const registradas: AfirmacaoRegistrada[] = (await linhas("imoveis_identificados_atributos", imovel)).map((a) => ({
      id: a.id as number, imovelIdentificadoId: imovel, investigacaoId: execucao, atributo: a.atributo as AfirmacaoRegistrada["atributo"],
      valorTexto: a.valor_texto as string | null, valorNum: a.valor_num as number | null, origem: "investigador-web", estado: "hipotese",
      confianca: a.confianca as AfirmacaoRegistrada["confianca"], fonteUrl: a.fonte_url as string, fonteDominio: a.fonte_dominio as string,
      observadoEm: a.observado_em as string, confirmadoPor: null, confirmadoEm: null, rejeitadoPor: null, rejeitadoEm: null, criadoEm: a.created_at as string,
    }));
    const visoes = derivarMemoriaAtual(registradas);
    expect(visoes.map((v) => v.atributo)).toEqual(["area_m2", "quartos", "vagas", "condominio", "referencia_anuncio"]);
    expect(visoes.filter((v) => v.divergente).map((v) => v.atributo)).toEqual(["area_m2"]);
    // F. Confiança factual: ninguém a atribuiu, então é null (o CHECK segue aceitando as faixas para uma origem futura).
    expect(registradas.every((a) => a.confianca === null)).toBe(true);
    // L/M/N/O. Só ultima_investigacao_em (e updated_at) mudou; nada em imoveis; situação e promoção intactas.
    const depois = (await db.query<Json>("select to_jsonb(i) as l from public.imoveis_identificados i where id = $1", [imovel])).rows[0].l as Json;
    expect(depois.ultima_investigacao_em).not.toBeNull();
    const { ultima_investigacao_em: a1, updated_at: u1, ...restoAntes } = antes;
    const { ultima_investigacao_em: a2, updated_at: u2, ...restoDepois } = depois;
    void a1; void a2; void u1; void u2;
    expect(restoDepois).toEqual(restoAntes);
    expect(depois.situacao).toBe("identificado");
    expect(depois.promovido_em).toBeNull();
    expect((await db.query("select count(*)::int as n from public.imoveis")).rows[0]).toEqual({ n: 0 });
  });

  it("ownership e catálogo: imóvel de outra conta é P0002; atributo inválido no payload é recusado e contado, não gravado", async () => {
    const alheio = randomUUID();
    await db.query("insert into public.imoveis_identificados (id, user_id, logradouro) values ($1, $2, 'Rua X')", [alheio, OUTRO_USUARIO]);
    await expect(registrarComoServidor(alheio, randomUUID(), correspondencias(ANUNCIO_A))).rejects.toMatchObject({ code: "P0002" });
    const imovel = await identidade();
    await db.exec("set role service_role");
    const r = await db.query<{ resultado: Json }>(
      "select public.registrar_investigacao_identificado($1, $2, $3, 1, 0, $4::jsonb) as resultado",
      [USUARIO, randomUUID(), imovel, JSON.stringify([
        { atributo: "quartos", valor_num: 3, fonte_url: "https://a.test/1", fonte_dominio: "a.test" },
        { atributo: "telefone", valor_texto: "43 99999-0000", fonte_url: "https://a.test/1", fonte_dominio: "a.test" },
        { atributo: "outros", valor_texto: "{}", fonte_url: "https://a.test/1", fonte_dominio: "a.test" },
      ])],
    );
    await db.exec("reset role");
    expect(r.rows[0].resultado).toMatchObject({ ok: true, atributos_salvos: 1, atributos_recusados: 2 });
    expect((await linhas("imoveis_identificados_atributos", imovel)).map((a) => a.atributo)).toEqual(["quartos"]);
  });
});

/* ================================================================
   5. TELA: só o feedback do write
   ================================================================ */
describe("C13B — a tela do Investigador diz a verdade sobre a memória, sem dashboard", () => {
  afterEach(() => { cleanup(); vi.doUnmock("@/lib/investigadorImoveis"); });

  async function telaCom(memoria: Json | undefined) {
    vi.doMock("@/lib/investigadorImoveis", () => ({
      carregarContextoInvestigador: mocks.carregarContextoInvestigador,
      investigarImovel: mocks.investigarImovel,
    }));
    mocks.getSupabase.mockReturnValue({ auth: { getSession: vi.fn().mockResolvedValue({ data: { session: { access_token: "t" } } }) } });
    mocks.carregarContextoInvestigador.mockResolvedValue({ consulta: CONSULTA, origem: "garimpo" });
    mocks.investigarImovel.mockImplementation(async (_c: string, aoEvento: (e: unknown) => void) => {
      aoEvento({ tipo: "resultado", dados: {
        ok: true, consultaOriginal: CONSULTA, consultas: ["q"], pesquisasEvitadas: 0, encerramentoAntecipado: false, limiteAtingido: false,
        resultados: correspondencias(ANUNCIO_A), ...(memoria ? { memoria } : {}),
      } });
    });
    const { default: InvestigadorImoveisView } = await import("@/components/investigador/InvestigadorImoveisView");
    render(createElement(InvestigadorImoveisView, { imovelIdInicial: null, referenciaInicial: { origem: "imovel-identificado", id: IDENTIFICADO } }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Investigar imóvel" })).not.toHaveProperty("disabled", true));
    await act(async () => { screen.getByRole("button", { name: "Investigar imóvel" }).click(); });
    await waitFor(() => expect(document.body.textContent).toContain("POSSÍVEIS CORRESPONDÊNCIAS"));
    return document.querySelector("[data-memoria]");
  }

  it("salva com contagem, repetida, e falha explícita como alerta; sem memória no resultado, nenhum feedback", async () => {
    const salva = await telaCom({ estado: "salva", execucaoId: randomUUID(), atributosSalvos: 6, atributosRecusados: 1 });
    expect(salva?.getAttribute("role")).toBe("status");
    expect(salva?.textContent).toBe("Memória do imóvel atualizada: 6 informações estruturadas salvas com a fonte.");
    expect(document.body.textContent).not.toMatch(/gpt|token|US\$|\$0/);
    cleanup();
    const falhou = await telaCom({ estado: "falhou", execucaoId: randomUUID(), atributosSalvos: 0, atributosRecusados: 0, codigo: "08006" });
    expect(falhou?.getAttribute("role")).toBe("alert");
    expect(falhou?.textContent).toContain("a memória do imóvel não foi salva");
    expect(document.body.textContent).not.toContain("08006");
    cleanup();
    const repetida = await telaCom({ estado: "repetida", execucaoId: randomUUID(), atributosSalvos: 6, atributosRecusados: 0 });
    expect(repetida?.textContent).toContain("já estava registrada");
    cleanup();
    expect(await telaCom(undefined)).toBeNull();
  });

  it("17/33. nada de promoção, situação ou seção de memória na tela do Investigador (a memória é lida no detalhe do Garimpo, C13C)", () => {
    const tela = ler("web/components/investigador/InvestigadorImoveisView.tsx");
    expect(tela).not.toMatch(/Transformar em oportunidade|Memória do imóvel<|Confirmar informação|carregarMemoria|montarMemoriaIdentidade/);
    expect(tela).not.toMatch(/vincular_promocao|salvarImovel|definir_situacao|promovid/);
  });
});
