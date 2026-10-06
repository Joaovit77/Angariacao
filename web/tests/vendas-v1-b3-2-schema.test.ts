import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const ler = (arquivo: string) => readFileSync(new URL("../../" + arquivo, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const NOME = "20261006123603_vendas_v1_b3_2_interessado.sql";
const migration = ler("supabase/migrations/" + NOME);
const schema = ler("supabase-schema.sql");
const sql = migration.replace(/--[^\n]*/g, "");
const funcao = (nome: string) => {
  const inicio = sql.indexOf("function " + nome + "(");
  return sql.slice(inicio, sql.indexOf("\n$$;", inicio));
};

describe("Vendas B3.2: migration e espelho", () => {
  it("é a próxima migration depois do B2, com nome que não cai em filtros de outras frentes", () => {
    const pasta = readdirSync(new URL("../../supabase/migrations/", import.meta.url)).filter((f) => f.endsWith(".sql")).sort();
    expect(pasta.at(-1)).toBe(NOME);
    expect(pasta.at(-2)).toBe("20261005160044_vendas_v1_b2_operacoes.sql");
    expect(NOME).not.toMatch(/dedupe|duplic|prospeccao|radar|r6_1/);
    expect(pasta.some((f) => f.startsWith("20261003233240"))).toBe(false);
  });

  it("o schema espelha o bloco literalmente, uma vez, logo depois do B2", () => {
    const bloco = (texto: string) => texto.split("-- BEGIN VENDAS V1-B3.2")[1].split("-- END VENDAS V1-B3.2")[0];
    expect(bloco(schema)).toBe(bloco(migration));
    expect(schema.match(/-- BEGIN VENDAS V1-B3\.2/g)).toHaveLength(1);
    expect(schema).toContain("-- END VENDAS V1-B2\n\n-- BEGIN VENDAS V1-B3.2\n");
  });

  it("transação única; o CHECK de origem é o último comando e só acrescenta 'vendas'", () => {
    expect(sql.trim().startsWith("begin;")).toBe(true);
    const comandos = sql.split(";").map((c) => c.trim()).filter(Boolean);
    expect(comandos.at(-1)).toBe("commit");
    expect(comandos.at(-2)).toMatch(/^alter table public\.contatos\s+drop constraint contatos_origem_check,\s+add constraint contatos_origem_check check/);
    const lista = (texto: string) => [...texto.matchAll(/'([a-z-]+)'/g)].map((m) => m[1]);
    const fase1a = ler("supabase/migrations/20260921183930_contatos_fase1a.sql");
    const anterior = lista(fase1a.slice(fase1a.indexOf("origem in ("), fase1a.indexOf(")", fase1a.indexOf("origem in ("))));
    const nova = lista(sql.slice(sql.lastIndexOf("origem in ("), sql.indexOf(")", sql.lastIndexOf("origem in ("))));
    expect(nova).toEqual([...anterior, "vendas"]);
  });

  it("não toca imóveis, vínculos, revisões, triggers, policies nem ACL global", () => {
    expect(sql).not.toMatch(/\b(?:insert into|update|delete from|alter table|truncate)\s+(?:public\.)?(?:imoveis|imoveis_contatos|contatos_revisoes)\b/i);
    expect(sql).not.toMatch(/create (?:or replace )?(?:trigger|policy|view)|drop (?:table|function|trigger|policy|index)|alter default privileges|grant usage|create table/i);
    expect([...sql.matchAll(/insert into ([\w.]+)/g)].map((m) => m[1]).sort()).toEqual([
      "private.vendas_comandos", "public.contatos", "public.contatos_telefones", "public.vendas_imoveis_referencias",
      "public.vendas_oportunidades", "public.vendas_oportunidades_eventos",
    ]);
    expect(sql.match(/grant execute on function/g)).toHaveLength(1);
    expect(sql).toContain("grant execute on function public.vendas_resolver_interessado(jsonb) to authenticated;");
  });

  it("resolução: INVOKER, STABLE, sem private nem auth.users, sempre filtrada pela conta", () => {
    const corpo = funcao("public.vendas_resolver_interessado");
    expect(corpo).toMatch(/language plpgsql stable security invoker set search_path = ''/);
    expect(corpo).not.toMatch(/private\.|auth\.users|resolver_contato_por_canal|security definer/);
    const fontes = [...corpo.matchAll(/from public\.(\w+) (\w+)/g)];
    expect(fontes.length).toBeGreaterThanOrEqual(4);
    for (const [, , alias] of fontes) expect(corpo).toContain(alias + ".user_id = usuario");
    // Toda resposta é montada por um destes objetos; nenhum leva nome, telefone ou outro dado da pessoa.
    const respostas = [...corpo.matchAll(/jsonb_build_object\('contrato','vendas-b3-resolucao-v1'[\s\S]*?\);/g)].map((m) => m[0]);
    expect(respostas.length).toBe(8);
    for (const resposta of respostas) expect(resposta).not.toMatch(/'nome'|'telefone'|digitado|canonico|observacoes|metadados/);
  });

  it("executor: trava do telefone depois da chave; só a unicidade do número ativo vira conflito-transitorio", () => {
    const corpo = funcao("private.vendas_b2_executar");
    expect(corpo.indexOf("'vendas-b2-lock-1'")).toBeLessThan(corpo.indexOf("'vendas-b3-telefone-1'"));
    expect(corpo.indexOf("'vendas-b3-telefone-1'")).toBeLessThan(corpo.indexOf("public.vendas_resolver_interessado("));
    expect(corpo).toContain("for share;");
    expect(corpo).toMatch(/when unique_violation then[\s\S]*restricao = 'contatos_telefones_ativo_unico_idx'[\s\S]*raise;/);
    expect(corpo).not.toMatch(/imoveis_contatos|contatos_revisoes/);
  });
});
