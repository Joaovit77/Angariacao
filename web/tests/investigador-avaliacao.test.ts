import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import type {
  CorrespondenciaInvestigacao,
  ResultadoWebInvestigacao,
} from "@/lib/calculo/investigadorImoveis";
import { urlAvaliacaoDoComparavel } from "@/lib/calculo/contextoAvaliacao";
import { associarReferenciasAvaliacaoDoInvestigador } from "@/lib/servidor/referenciasAvaliacaoInvestigador";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  buscarImovelNaWeb: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/servidor/investigadorImoveis", () => ({
  buscarImovelNaWeb: mocks.buscarImovelNaWeb,
  BuscaWebIndisponivel: class BuscaWebIndisponivel extends Error {},
}));

import { POST } from "@/app/api/investigador-imoveis/route";

const USUARIO_ID = "11111111-1111-4111-8111-111111111111";
const COMPARAVEL_B = "22222222-2222-4222-8222-222222222222";
const supabaseUrlAnterior = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKeyAnterior = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

function resultadoWeb(url: string, titulo: string): ResultadoWebInvestigacao {
  return {
    titulo,
    url,
    dominio: new URL(url).hostname,
    descricao: `${titulo}, 72 m², 2 quartos e 1 vaga.`,
    consultas: ["consulta de teste"],
    preco: titulo === "Resultado B" ? 2_700 : null,
    endereco: null,
    referencia: null,
    condominio: null,
    quartos: 2,
    vagas: 1,
    area: 72,
  };
}

function correspondencia(url: string, titulo: string): CorrespondenciaInvestigacao {
  return {
    ...resultadoWeb(url, titulo),
    confianca: "possivel",
    evidencias: ["Área compatível: 72 m²"],
    contradicoes: [],
  };
}

function clienteComReferencias(
  linhas: Array<{ id: string; url_canonica: string | null }>,
  error: { code?: string; message?: string } | null = null,
) {
  const consultaIn = vi.fn().mockResolvedValue({ data: error ? null : linhas, error });
  const eq = vi.fn(() => ({ in: consultaIn }));
  const select = vi.fn(() => ({ eq }));
  const from = vi.fn(() => ({ select }));
  const auth = { getUser: vi.fn().mockResolvedValue({ data: { user: { id: USUARIO_ID } }, error: null }) };
  return { cliente: { auth, from } as unknown as SupabaseClient, from, eq, consultaIn };
}

describe("Investigador para Avaliação Rápida", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://supabase.test";
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "anon-de-teste";
  });

  afterAll(() => {
    if (supabaseUrlAnterior == null) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = supabaseUrlAnterior;
    if (supabaseKeyAnterior == null) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = supabaseKeyAnterior;
  });

  it("usa somente o UUID persistido e mantém a URL curta", () => {
    const destino = new URL(urlAvaliacaoDoComparavel(COMPARAVEL_B), "https://angario.test");
    expect(destino.pathname).toBe("/avaliacao");
    expect([...destino.searchParams.entries()]).toEqual([["comparavel", COMPARAVEL_B]]);
  });

  it("associa apenas a URL canônica única da própria conta sem alterar os dados observados", async () => {
    const a = correspondencia("https://portal.test/imovel/a", "Resultado A");
    const b = correspondencia("https://www.portal.test/imovel/b?utm_source=google#fotos", "Resultado B");
    const { cliente, from, eq, consultaIn } = clienteComReferencias([
      { id: COMPARAVEL_B, url_canonica: "https://portal.test/imovel/b" },
    ]);

    const associados = await associarReferenciasAvaliacaoDoInvestigador(
      cliente,
      USUARIO_ID,
      [a, b],
    );

    expect(associados).toEqual([
      { ...a, comparavelId: null },
      { ...b, comparavelId: COMPARAVEL_B },
    ]);
    expect(associados[1].preco).toBe(2_700);
    expect(from).toHaveBeenCalledWith("comparaveis_mercado");
    expect(eq).toHaveBeenCalledWith("user_id", USUARIO_ID);
    expect(consultaIn).toHaveBeenCalledWith("url_canonica", [
      "https://portal.test/imovel/a",
      "https://portal.test/imovel/b",
    ]);
  });

  it("não oferece atalho quando a referência é ausente ou ambígua", async () => {
    const item = correspondencia("https://portal.test/imovel/repetido", "Resultado transitório");
    const { cliente } = clienteComReferencias([
      { id: "33333333-3333-4333-8333-333333333333", url_canonica: item.url },
      { id: "44444444-4444-4444-8444-444444444444", url_canonica: item.url },
    ]);

    await expect(associarReferenciasAvaliacaoDoInvestigador(cliente, USUARIO_ID, [item]))
      .resolves.toEqual([{ ...item, comparavelId: null }]);

    const vazio = clienteComReferencias([]).cliente;
    await expect(associarReferenciasAvaliacaoDoInvestigador(vazio, USUARIO_ID, [item]))
      .resolves.toEqual([{ ...item, comparavelId: null }]);
  });

  it("degrada para resultado transitório sem revelar detalhes quando o catálogo falha", async () => {
    const aviso = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const item = correspondencia("https://portal.test/imovel/indisponivel", "Resultado sem referência");
    const { cliente } = clienteComReferencias([], {
      code: "42501",
      message: "detalhe-interno-que-nao-pode-vazar",
    });

    await expect(associarReferenciasAvaliacaoDoInvestigador(cliente, USUARIO_ID, [item]))
      .resolves.toEqual([{ ...item, comparavelId: null }]);
    expect(JSON.stringify(aviso.mock.calls)).toContain("42501");
    expect(JSON.stringify(aviso.mock.calls)).not.toContain("detalhe-interno-que-nao-pode-vazar");
  });

  it("entrega no NDJSON o UUID somente ao resultado correspondente escolhido no card", async () => {
    const a = resultadoWeb("https://portal-a.test/imovel/a", "Resultado A");
    const b = resultadoWeb("https://portal-b.test/imovel/b?utm_campaign=teste", "Resultado B");
    const { cliente } = clienteComReferencias([
      { id: COMPARAVEL_B, url_canonica: "https://portal-b.test/imovel/b" },
    ]);
    mocks.createClient.mockReturnValue(cliente);
    mocks.buscarImovelNaWeb.mockResolvedValue({
      resultados: [a, b],
      falhas: 0,
      limiteAtingido: false,
      consultasExecutadas: ["consulta de teste"],
      pesquisasEvitadas: 2,
      encerramentoAntecipado: true,
    });

    const resposta = await POST(new Request("http://localhost/api/investigador-imoveis", {
      method: "POST",
      headers: {
        Authorization: "Bearer token-de-teste",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ consulta: "Apartamento 72 m² com 2 quartos" }),
    }));
    const eventos = (await resposta.text()).trim().split("\n").map((linha) => JSON.parse(linha));
    const final = eventos.find((evento) => evento.tipo === "resultado");

    expect(final, JSON.stringify(eventos)).toBeDefined();
    expect(final.dados.resultados).toEqual(expect.arrayContaining([
      expect.objectContaining({ titulo: "Resultado A", comparavelId: null }),
      expect.objectContaining({ titulo: "Resultado B", comparavelId: COMPARAVEL_B }),
    ]));
  });

  it("mantém a ação contextual, sem selecionar o primeiro resultado nem iniciar avaliação", () => {
    const raiz = join(import.meta.dirname, "..");
    const tela = readFileSync(
      join(raiz, "components/investigador/InvestigadorImoveisView.tsx"),
      "utf8",
    );
    const rota = readFileSync(join(raiz, "app/api/investigador-imoveis/route.ts"), "utf8");

    expect(tela).toContain("resultado.comparavelId ? (");
    expect(tela).toContain("urlAvaliacaoDoComparavel(resultado.comparavelId)");
    expect(tela).toContain("Usar na Avaliação");
    expect(tela).not.toContain("resultado.resultados[0]");
    expect(tela).not.toContain("Calcular avaliação");
    expect(rota).toContain("associarReferenciasAvaliacaoDoInvestigador");
    expect(rota).not.toContain('.insert(');
    expect(rota).not.toContain('.upsert(');
  });
});
