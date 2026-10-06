import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PORTAS_VENDAS } from "../lib/persistencia/vendasComandos";

const ler = (arquivo: string) => readFileSync(new URL("../../" + arquivo,import.meta.url),"utf8").replace(/\r\n/g,"\n");
const migration = ler("supabase/migrations/20261005160044_vendas_v1_b2_operacoes.sql");
const schema = ler("supabase-schema.sql");
const sql = migration.replace(/--[^\n]*/g,"");
const hash = (texto: string) => createHash("sha256").update(texto).digest("hex");

describe("Vendas B2: fronteira SQL e preservação histórica", () => {
  it("retirar B2 recupera exatamente o blob schema do HEAD B1, inclusive final de arquivo", () => {
    // B3.2 e o IV-1 de imóveis são aditivos: saem junto, e o hash do HEAD B1 continua o mesmo.
    const anterior = schema.replace(/-- =+\n-- IMÓVEL DE VENDA IV-1:[\s\S]*?-- END IMOVEL VENDA IV-1\n\n/,"")
      .replace(/-- BEGIN VENDAS V1-B3\.2[\s\S]*?-- END VENDAS V1-B3\.2\n\n/,"")
      .replace(/-- BEGIN VENDAS V1-B2[\s\S]*?-- END VENDAS V1-B2\n\n/,"");
    expect(hash(anterior)).toBe("5b54399f21bae4e189d24babaecfe2774fdcab060fef1089063913b3562fc64c");
  });
  it("preserva a migration B1 aprovada e espelha o bloco B2 literalmente uma única vez", () => {
    expect(hash(ler("supabase/migrations/20261005003257_vendas_v1_b1_estrutura.sql"))).toBe("b06dd967800894d94a6a71bcdd8f6869f6706ed3bedc9a9df9c4d53293deb4a7");
    const bloco = (texto: string) => texto.split("-- BEGIN VENDAS V1-B2")[1].split("-- END VENDAS V1-B2")[0];
    expect(bloco(schema)).toBe(bloco(migration)); expect(schema.match(/-- BEGIN VENDAS V1-B2/g)).toHaveLength(1);
  });
  it("cria somente sete portas públicas jsonb, sem overload, e helpers privados invoker", () => {
    expect([...sql.matchAll(/create function public\.(\w+)\(p_comando jsonb\)/g)].map(m=>m[1])).toEqual(Object.values(PORTAS_VENDAS));
    const funcoes = [...sql.matchAll(/create function ([\w.]+)\([^]*?\$\$;/g)].map(m=>({nome:m[1],bloco:m[0]}));
    for (const f of funcoes) {
      expect(f.bloco).toContain("set search_path = ''"); expect(f.bloco).toContain(f.nome.startsWith("public.") ? "security definer" : "security invoker");
      expect(sql).toContain("alter function " + f.nome + "(");
    }
    expect(sql.match(/security definer/g)).toHaveLength(7);
  });
  it("não altera tabelas, policies, grants de tabela, defaults, exposição ou extensões", () => {
    expect(sql).not.toMatch(/\b(create table|alter table|drop table|create policy|alter policy|alter default privileges|create extension|alter role|grant .*on schema)\b/i);
    expect(sql).not.toMatch(/grant[\s\S]*?on table/i);
    expect(sql).not.toMatch(/(?:insert into|update|delete from)\s+(?:public\.)?(?:imoveis|contatos|agenda|mensagens_agendadas)\b/i);
    expect(sql).not.toMatch(/\bskip locked\b|\bexecute\s+(?:format|quote_literal|')/i);
  });
  it("ACL explícita, tenant e CAS antes da gravação, replay antes do lock da oportunidade", () => {
    expect(sql).toContain("from public,anon,authenticated,service_role");
    expect(sql).toContain("to authenticated;"); expect(sql.match(/grant execute/g)).toHaveLength(1);
    expect(sql).toContain("auth.uid()"); expect(sql).toContain("and o.user_id = usuario for update");
    expect(sql).toContain("o.user_id=usuario and o.versao=anterior.versao"); expect(sql).toContain("if linhas <> 1");
    expect(sql.indexOf("return recibo.resposta")).toBeLessThan(sql.indexOf("and o.user_id = usuario for update"));
    expect(sql).toContain("pg_catalog.pg_advisory_xact_lock");
  });
  it("não instala hook de falha, expiração, side effects ou dependências externas", () => {
    expect(sql).not.toMatch(/create trigger|fixture_falha|expires_at|expire|pg_net|http_post|sophia|whatsapp_|radar_|pipeline/i);
    expect(sql.trim()).toMatch(/^begin;[\s\S]*commit;$/);
  });
});
