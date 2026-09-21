import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";
import {
  resolverCidadePadrao,
  resolverCidadePadraoDaConta,
} from "@/lib/configuracaoUsuario";
import {
  carregarCidadePadraoDaConta,
  salvarCidadePadraoDaConta,
} from "@/lib/persistencia/cidadePadrao";
import type { SupabaseClient } from "@supabase/supabase-js";

const MIGRATION = readFileSync(
  new URL("../../supabase/migrations/20260920162901_c1_cidade_padrao_conta.sql", import.meta.url),
  "utf8",
);
const SCHEMA = readFileSync(new URL("../../supabase-schema.sql", import.meta.url), "utf8");
const MUTACOES = readFileSync(new URL("../lib/mutacoes.ts", import.meta.url), "utf8");
const PERSISTENCIA = readFileSync(new URL("../lib/persistencia/cidadePadrao.ts", import.meta.url), "utf8");

const SEM_DEFAULT = { cidade: null, uf: null, origem: "nenhuma" } as const;

describe("C1 — resolução pura da cidade padrão", () => {
  it("usa a configuração explícita normalizada", () => {
    expect(resolverCidadePadrao(
      { cidadePadrao: "  Londrina  ", ufPadrao: " pr " },
      [],
    )).toEqual({ cidade: "Londrina", uf: "PR", origem: "configurada" });
  });

  it("faz a configuração explícita vencer uma carteira de outra cidade", () => {
    expect(resolverCidadePadrao(
      { cidadePadrao: "Maringá", ufPadrao: "PR" },
      [{ cidade: "Londrina", estado: "PR" }],
    )).toEqual({ cidade: "Maringá", uf: "PR", origem: "configurada" });
  });

  it("infere quando todos os imóveis estruturados pertencem à mesma cidade e UF", () => {
    expect(resolverCidadePadrao(null, [
      { cidade: "Londrina", estado: "PR" },
      { cidade: "Londrina", estado: "PR" },
    ])).toEqual({ cidade: "Londrina", uf: "PR", origem: "inferida" });
  });

  it("agrupa caixa, acento e espaços sem transformar variações em cidades diferentes", () => {
    const variacoes = [
      { cidade: " São José dos Pinhais ", estado: " pr " },
      { cidade: "SÃO   JOSÉ DOS PINHAIS", estado: "PR" },
      { cidade: "sao jose dos pinhais", estado: "Paraná" },
    ];
    const esperado = { cidade: "São José dos Pinhais", uf: "PR", origem: "inferida" };
    expect(resolverCidadePadrao(null, variacoes)).toEqual(esperado);
    expect(resolverCidadePadrao(null, [...variacoes].reverse())).toEqual(esperado);
  });

  it("não escolhe uma predominante quando há duas cidades estruturadas", () => {
    expect(resolverCidadePadrao(null, [
      { cidade: "Londrina", estado: "PR" },
      { cidade: "Londrina", estado: "PR" },
      { cidade: "Maringá", estado: "PR" },
    ])).toEqual(SEM_DEFAULT);
  });

  it("não trata a mesma cidade com UFs diferentes como uma combinação única", () => {
    expect(resolverCidadePadrao(null, [
      { cidade: "Santa Helena", estado: "PR" },
      { cidade: "Santa Helena", estado: "SC" },
    ])).toEqual(SEM_DEFAULT);
  });

  it("devolve ausência para conta sem imóveis", () => {
    expect(resolverCidadePadrao({}, [])).toEqual(SEM_DEFAULT);
  });

  it("ignora imóvel sem cidade ou sem UF e não inventa localização", () => {
    expect(resolverCidadePadrao(null, [
      { cidade: "", estado: "PR" },
      { cidade: "Londrina", estado: "" },
      { cidade: null, estado: null },
    ])).toEqual(SEM_DEFAULT);
  });

  it("ignora linha incompleta quando outra linha fornece o único par estruturado", () => {
    expect(resolverCidadePadrao(null, [
      { cidade: "", estado: "PR" },
      { cidade: "Londrina", estado: "PR" },
    ])).toEqual({ cidade: "Londrina", uf: "PR", origem: "inferida" });
  });

  it("não usa configuração nem imóveis de outro user_id", () => {
    expect(resolverCidadePadraoDaConta(
      "conta-a",
      [{ userId: "conta-b", cidadePadrao: "Curitiba", ufPadrao: "PR" }],
      [
        { userId: "conta-a", cidade: "Londrina", estado: "PR" },
        { userId: "conta-b", cidade: "Maringá", estado: "PR" },
      ],
    )).toEqual({ cidade: "Londrina", uf: "PR", origem: "inferida" });
  });

  it("não persiste a inferência nem altera a configuração recebida", () => {
    const configuracao = {};
    const antes = structuredClone(configuracao);

    expect(resolverCidadePadrao(configuracao, [
      { cidade: "Londrina", estado: "PR" },
    ])).toEqual({ cidade: "Londrina", uf: "PR", origem: "inferida" });
    expect(configuracao).toEqual(antes);
    expect(MUTACOES).not.toContain("resolverCidadePadrao");
  });
});

describe("C1 — persistência opcional e isolamento", () => {
  it("mantém as colunas opcionais, pareadas e sem backfill", () => {
    expect(MIGRATION).toContain("add column if not exists cidade_padrao text");
    expect(MIGRATION).toContain("add column if not exists uf_padrao text");
    expect(MIGRATION).toContain("cidade_padrao is null and uf_padrao is null");
    expect(MIGRATION).not.toMatch(/update\s+public\.user_config|insert\s+into\s+public\.user_config/i);
    expect(SCHEMA).toContain("constraint user_config_cidade_uf_padrao_validos");
  });

  it("reutiliza a RLS própria de user_config e a fonte imoveis também é escopada", () => {
    expect(SCHEMA).toMatch(/create policy "select_own_config"[\s\S]*?using \(auth\.uid\(\) = user_id\)/);
    expect(SCHEMA).toMatch(/create policy "insert_own_config"[\s\S]*?with check \(auth\.uid\(\) = user_id\)/);
    expect(SCHEMA).toMatch(/create policy "update_own_config"[\s\S]*?using \(auth\.uid\(\) = user_id\) with check \(auth\.uid\(\) = user_id\)/);
    expect(SCHEMA).toMatch(/create policy "select_own_imoveis"[\s\S]*?using \(auth\.uid\(\) = user_id\)/);
    expect(PERSISTENCIA.match(/\.eq\("user_id", userId\)/g)).toHaveLength(2);
    expect(PERSISTENCIA).not.toContain("service_role");
  });

  it("coleta configuração e imóveis com filtro explícito da conta", async () => {
    const filtros: Array<[string, string, string]> = [];
    const cliente = {
      from(tabela: string) {
        return {
          select() {
            return {
              eq(coluna: string, valor: string) {
                filtros.push([tabela, coluna, valor]);
                if (tabela === "user_config") {
                  return {
                    maybeSingle: () => Promise.resolve({
                      data: { user_id: "conta-a", cidade_padrao: null, uf_padrao: null },
                      error: null,
                    }),
                  };
                }
                return Promise.resolve({
                  data: [{ user_id: "conta-a", cidade: "Londrina", estado: "PR" }],
                  error: null,
                });
              },
            };
          },
        };
      },
    } as unknown as SupabaseClient;

    await expect(carregarCidadePadraoDaConta("conta-a", cliente)).resolves.toEqual({
      cidade: "Londrina",
      uf: "PR",
      origem: "inferida",
    });
    expect(filtros).toEqual([
      ["user_config", "user_id", "conta-a"],
      ["imoveis", "user_id", "conta-a"],
    ]);
  });

  it("grava apenas a preferência explícita normalizada para o user_id informado", async () => {
    let payload: unknown;
    const cliente = {
      from(tabela: string) {
        expect(tabela).toBe("user_config");
        return {
          upsert(dados: unknown) {
            payload = dados;
            return Promise.resolve({ error: null });
          },
        };
      },
    } as unknown as SupabaseClient;

    await expect(salvarCidadePadraoDaConta(
      "conta-a",
      "  Londrina ",
      "pr",
      cliente,
    )).resolves.toEqual({ cidade: "Londrina", uf: "PR", origem: "configurada" });
    expect(payload).toEqual({
      user_id: "conta-a",
      cidade_padrao: "Londrina",
      uf_padrao: "PR",
    });
  });

  it("aceita conta antiga sem os campos e rejeita pares parciais/inválidos no PostgreSQL local", async () => {
    const db = new PGlite();
    await db.exec("create table public.user_config (user_id uuid primary key)");
    await db.exec(MIGRATION);

    await expect(db.exec(
      "insert into public.user_config (user_id) values ('00000000-0000-0000-0000-000000000001')",
    )).resolves.toBeDefined();
    await expect(db.exec(
      "insert into public.user_config (user_id, cidade_padrao) values ('00000000-0000-0000-0000-000000000002', 'Londrina')",
    )).rejects.toThrow();
    await expect(db.exec(
      "insert into public.user_config (user_id, cidade_padrao, uf_padrao) values ('00000000-0000-0000-0000-000000000003', 'Londrina', 'pr')",
    )).rejects.toThrow();
    await expect(db.exec(
      "insert into public.user_config (user_id, cidade_padrao, uf_padrao) values ('00000000-0000-0000-0000-000000000004', 'Londrina', 'PR')",
    )).resolves.toBeDefined();

    await db.close();
  }, 15_000);

  it("mantém a regra do resolver centralizada mesmo após a integração do C2", () => {
    const formularios = [
      "../components/avaliacao/AvaliacaoRapidaView.tsx",
      "../components/modais/ModalImovel.tsx",
      "../components/modais/ModalPreCadastro.tsx",
      "../components/modais/ModalAvistamento.tsx",
      "../components/prospeccao/FormularioEnderecoIdentificado.tsx",
      "../components/central/CentralAngariacaoView.tsx",
      "../components/configuracoes/MercadosMonitorados.tsx",
    ];

    for (const formulario of formularios) {
      const fonte = readFileSync(new URL(formulario, import.meta.url), "utf8");
      expect(fonte).toContain("useCidadePadraoDaConta");
      expect(fonte).not.toContain("resolverCidadePadrao(");
    }
  });
});
