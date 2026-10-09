/** Smoke manual autenticado, exclusivamente leitura. Não contém massa, SQL, login ou escrita.
 * Credenciais são fornecidas deliberadamente pela pessoa no processo, sem carregar .env.local. */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";
import { listarImoveisCandidatosVenda, type ClienteImoveisVenda } from "@/lib/persistencia/vendasImoveisLeitura";

function configurar(): { a: SupabaseClient; b: SupabaseClient } {
  if (process.env.VENDAS_IMOVEIS_SMOKE_READONLY !== "1") throw new Error("Ative deliberadamente VENDAS_IMOVEIS_SMOKE_READONLY=1 para o smoke humano de leitura.");
  const url = process.env.VENDAS_IMOVEIS_SMOKE_URL;
  const anon = process.env.VENDAS_IMOVEIS_SMOKE_ANON;
  const tokenA = process.env.VENDAS_IMOVEIS_SMOKE_TOKEN_A;
  const tokenB = process.env.VENDAS_IMOVEIS_SMOKE_TOKEN_B;
  if (!url || !anon || !tokenA || !tokenB) throw new Error("Configure a URL pública, a chave pública e duas sessões seguras autenticadas no processo. Não cole tokens no relatório.");
  if (anon.startsWith("sb_secret_") || (anon.split(".").length === 3 && JSON.parse(Buffer.from(anon.split(".")[1], "base64url").toString()).role !== "anon")) {
    throw new Error("O smoke aceita somente a chave pública do projeto.");
  }
  const criar = (token: string) => createClient(url, anon, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      headers: { Authorization: `Bearer ${token}` },
      fetch: (entrada, opcoes) => {
        const metodo = opcoes?.method ?? (entrada instanceof Request ? entrada.method : "GET");
        if (metodo !== "GET") throw new Error("Método fora do smoke somente leitura.");
        const destino = new URL(typeof entrada === "string" ? entrada : entrada instanceof URL ? entrada.href : entrada.url);
        if (destino.origin !== new URL(url).origin || !["/auth/v1/user", "/rest/v1/imoveis"].includes(destino.pathname)) throw new Error("Destino fora do smoke de imóveis.");
        return fetch(entrada, opcoes);
      },
    },
  });
  return { a: criar(tokenA), b: criar(tokenB) };
}

describe("B3.4b-A: smoke humano de Auth/PostgREST/RLS, sem escrita", () => {
  let a: SupabaseClient, b: SupabaseClient, usuarioA: string, usuarioB: string;
  beforeAll(async () => {
    ({ a, b } = configurar());
    const [sessaoA, sessaoB] = await Promise.all([a.auth.getUser(), b.auth.getUser()]);
    if (sessaoA.error || sessaoB.error || !sessaoA.data.user || !sessaoB.data.user) throw new Error("As duas sessões precisam ser válidas antes do smoke.");
    usuarioA = sessaoA.data.user.id; usuarioB = sessaoB.data.user.id;
    if (usuarioA === usuarioB) throw new Error("Use contas seguras diferentes para comprovar a fronteira RLS.");
  });
  it("o adaptador lê a carteira real da conta A e todos os ids retornados pertencem a ela", async () => {
    const resultado = await listarImoveisCandidatosVenda(a as unknown as ClienteImoveisVenda);
    if (!resultado.ok) throw new Error(`Leitura recusada: ${resultado.erro}`);
    if (resultado.dados.length === 0) throw new Error("A conta A precisa ter ao menos um imóvel já existente. Não crie massa em Production.");
    for (let inicio = 0; inicio < resultado.dados.length; inicio += 500) {
      const ids = resultado.dados.slice(inicio, inicio + 500).map((i) => i.id);
      const { data, error } = await a.from("imoveis").select("id,user_id").in("id", ids);
      expect(error === null).toBe(true);
      expect(data?.length === ids.length && data.every((r) => r.user_id === usuarioA)).toBe(true);
    }
  });
  it("consultas diretas pelo cliente não atravessam a RLS entre contas", async () => {
    const [leituraA, leituraB] = await Promise.all([
      a.from("imoveis").select("id").eq("user_id", usuarioB),
      b.from("imoveis").select("id").eq("user_id", usuarioA),
    ]);
    expect(leituraA.error === null && leituraB.error === null).toBe(true);
    expect(leituraA.data?.length).toBe(0);
    expect(leituraB.data?.length).toBe(0);
  });
});
