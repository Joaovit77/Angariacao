import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FINALIDADES_IMOVEL } from "../lib/constantes";

/* Imóvel de venda, IV-1: o contrato do SQL, lido do arquivo. A migration só
   acrescenta três colunas nulas e dois checks em `imoveis`, numa transação e
   num único ALTER TABLE; o schema canônico a espelha literalmente. O
   comportamento no banco está em `imovel-venda-iv1-banco.test.ts` (PGlite) e
   em `integration/imovel-venda-iv1-supabase-local.test.ts`. */

const ler = (arquivo: string) => readFileSync(new URL("../../" + arquivo, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const NOME = "20261006200215_imoveis_finalidade_venda.sql";
const MIGRATION = ler("supabase/migrations/" + NOME);
const SCHEMA = ler("supabase-schema.sql");
const CODIGO = MIGRATION.split("\n").filter((linha) => !/^\s*--/.test(linha)).join("\n");

describe("IV-1: migration", () => {
  it("vem logo depois do B3.2 em Production, sem a R6.1 antiga; depois dele só o IV-4A", () => {
    const pasta = readdirSync(new URL("../../supabase/migrations/", import.meta.url)).filter((f) => f.endsWith(".sql")).sort();
    // Era a última até o IV-4A (guarda do ledger de locação), a única aprovada depois dela.
    expect(pasta.slice(pasta.indexOf(NOME) + 1)).toEqual(["20261008150000_imoveis_finalidade_guarda_locacao.sql"]);
    expect(pasta[pasta.indexOf(NOME) - 1]).toBe("20261006123603_vendas_v1_b3_2_interessado.sql");
    expect(NOME.slice(0, 14) > "20261006123603").toBe(true);
    expect(pasta.some((f) => f.startsWith("20261003233240"))).toBe(false);
    expect(NOME).not.toMatch(/dedupe|duplic|prospeccao|radar|r6_1|vendas_v1/);
  });

  it("uma transação com timeouts locais e um único ALTER TABLE em public.imoveis", () => {
    const comandos = CODIGO.split(";").map((c) => c.trim()).filter(Boolean);
    expect(comandos).toEqual([
      "begin",
      "set local lock_timeout = '5s'",
      "set local statement_timeout = '60s'",
      expect.stringMatching(/^alter table public\.imoveis\n/),
      "commit",
    ]);
  });

  it("três colunas nulas, sem default, e os dois checks exatos", () => {
    const alter = CODIGO.slice(CODIGO.indexOf("alter table public.imoveis"), CODIGO.indexOf(";", CODIGO.indexOf("alter table public.imoveis")));
    const partes = alter.split(/,\n\s+(?=add |drop )/).map((p) => p.replace(/\s+/g, " ").trim());
    expect(partes).toEqual([
      "alter table public.imoveis add column if not exists finalidade text",
      "add column if not exists valor_venda numeric",
      "add column if not exists vendido_em date",
      "drop constraint if exists imoveis_finalidade_check",
      "add constraint imoveis_finalidade_check check (finalidade is null or finalidade in ('locacao', 'venda', 'locacao_venda'))",
      "drop constraint if exists imoveis_valor_venda_check",
      "add constraint imoveis_valor_venda_check check (valor_venda is null or (valor_venda >= 0 and valor_venda < 'Infinity'::numeric))",
    ]);
    expect(CODIGO).not.toMatch(/\bdefault\b|\bnot null\b/i);
  });

  it("a lista do check é a mesma do app (FINALIDADES_IMOVEL)", () => {
    const lista = /finalidade in \(([^)]*)\)/.exec(CODIGO)![1].split(",").map((v) => v.trim().replace(/'/g, ""));
    expect(lista).toEqual([...FINALIDADES_IMOVEL]);
  });

  it("nada além disso: sem índice, policy, trigger, função, grant, enum nem DML", () => {
    expect(CODIGO).not.toMatch(/\bcreate\b|\bgrant\b|\brevoke\b|\bpolicy\b|\btrigger\b|\bfunction\b|\benum\b|\bindex\b/i);
    expect(CODIGO).not.toMatch(/^\s*(insert|update|delete|truncate|copy)\b/im);
    expect(CODIGO).not.toMatch(/\b(status|status_history|locado_em|retirado|valor_aluguel|vendas_\w+|contatos\w*)\b/);
  });
});

describe("IV-1: espelho no schema canônico", () => {
  const bloco = (texto: string) => texto.split("-- BEGIN IMOVEL VENDA IV-1\n")[1]?.split("-- END IMOVEL VENDA IV-1\n")[0];

  it("o bloco entre os marcadores é a migration inteira, idêntica, uma vez só", () => {
    expect(bloco(SCHEMA)).toBe(MIGRATION);
    expect(SCHEMA.match(/-- BEGIN IMOVEL VENDA IV-1/g)).toHaveLength(1);
    expect(SCHEMA.match(/-- END IMOVEL VENDA IV-1/g)).toHaveLength(1);
  });

  it("fica logo depois do Retirados C1 e antes do Vendas V1-B1, com cabeçalho apontando a migration", () => {
    const inicio = SCHEMA.indexOf("-- BEGIN IMOVEL VENDA IV-1");
    const antes = SCHEMA.slice(0, inicio);
    expect(antes).toMatch(/for each row execute function private\.preencher_dados_retirada_imovel\(\);\n\n-- =+\n-- IMÓVEL DE VENDA IV-1: [^\n]*\n-- supabase\/migrations\/20261006200215_imoveis_finalidade_venda\.sql; o teste\n/);
    const depois = SCHEMA.slice(SCHEMA.indexOf("-- END IMOVEL VENDA IV-1\n"));
    expect(depois.startsWith("-- END IMOVEL VENDA IV-1\n\n-- BEGIN VENDAS V1-B1\n")).toBe(true);
  });

  it("é repetível: colunas com if not exists e checks recriados (drop if exists + add)", () => {
    expect(MIGRATION.match(/add column if not exists/g)).toHaveLength(3);
    expect(MIGRATION.match(/drop constraint if exists/g)).toHaveLength(2);
  });
});
