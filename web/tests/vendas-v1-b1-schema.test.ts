import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ESTADOS_VENDA, MOTIVOS_PERDA_VENDA, ORIGENS_COMERCIAIS_VENDA } from "../lib/vendas/tipos";

const ler = (nome: string) => readFileSync(new URL("../../" + nome, import.meta.url), "utf8").replace(/\r\n/g, "\n");
export const MIGRATION_VENDAS = ler("supabase/migrations/20261005003257_vendas_v1_b1_estrutura.sql");
const schema = ler("supabase-schema.sql");
const codigo = MIGRATION_VENDAS.replace(/--[^\n]*/g, "");
const tabelas = ["public.vendas_imoveis_referencias", "public.vendas_oportunidades", "public.vendas_oportunidades_eventos", "private.vendas_comandos"];

describe("Vendas V1-B1: contrato estrutural", () => {
  it("espelha exatamente o bloco aditivo no schema canônico", () => {
    const bloco = (sql: string) => sql.split("-- BEGIN VENDAS V1-B1")[1].split("-- END VENDAS V1-B1")[0];
    expect(bloco(schema)).toBe(bloco(MIGRATION_VENDAS));
  });
  it("preserva o schema anterior inteiro", () => {
    // B2, B3.2 e o IV-1 de imóveis são aditivos: remover seus blocos mantém a âncora histórica original, sem trocar o hash.
    const anterior = schema.replace(/-- =+\n-- IMÓVEL DE VENDA IV-1:[\s\S]*?-- END IMOVEL VENDA IV-1\n\n/, "")
      .replace(/-- BEGIN VENDAS V1-B3\.2[\s\S]*?-- END VENDAS V1-B3\.2\n\n/, "")
      .replace(/-- BEGIN VENDAS V1-B2[\s\S]*?-- END VENDAS V1-B2\n\n/, "")
      .replace(/-- BEGIN VENDAS V1-B1[\s\S]*?-- END VENDAS V1-B1\n\n/, "").trimEnd();
    expect(createHash("sha256").update(anterior).digest("hex")).toBe("27eedab2dd5a92811d24f370d47c1ecd32c796cd0815527f5dbcb4aad7568733");
  });
  it("cria somente as quatro tabelas aprovadas, sem dados ou operações comerciais", () => {
    expect([...codigo.matchAll(/create table (\w+\.\w+)/g)].map(m => m[1])).toEqual(tabelas);
    expect(codigo).not.toMatch(/^\s*(insert|update|delete|truncate|drop table|alter default privileges|create event trigger|create trigger)\b/im);
    expect([...codigo.matchAll(/alter table (\w+\.\w+)/g)].every(m => tabelas.includes(m[1]))).toBe(true);
    expect(codigo).not.toMatch(/\bimoveis_contatos\b|\bcontatos_revisoes\b|\bcontatos_telefones\b/);
    expect([...codigo.matchAll(/create function ([\w.]+)/g)].map(m => m[1])).toEqual(["private.vendas_texto_util"]);
    expect(codigo).not.toMatch(/security definer|grant .* on schema|alter role|pgrst\./i);
  });
  it.each(tabelas)("liga RLS explicitamente em %s", tabela => {
    expect(codigo).toContain("alter table " + tabela + " enable row level security");
  });
  it("possui somente as três policies de leitura própria", () => {
    const policies = [...codigo.matchAll(/create policy[\s\S]*?;/g)].map(m => m[0]);
    expect(policies).toHaveLength(3);
    for (const policy of policies) {
      expect(policy).toContain("for select to authenticated using ((select auth.uid()) = user_id)");
    }
    expect(codigo).not.toMatch(/for (insert|update|delete|all)\b/i);
  });
  it("revoga defaults inclusive de PUBLIC e não concede acesso aos recibos", () => {
    expect(codigo).toMatch(/revoke all on table[\s\S]*private.vendas_comandos\s+from public, anon, authenticated, service_role;/);
    const grants = [...codigo.matchAll(/grant [\s\S]*?;/g)].map(m => m[0]);
    expect(grants).toHaveLength(1);
    expect(grants[0]).toMatch(/^grant select on table/);
    expect(grants[0]).toContain("to authenticated");
    expect(grants[0]).not.toContain("private.");
    expect(codigo).toContain("revoke all on function private.vendas_texto_util(text) from public, anon, authenticated, service_role");
  });
  it("usa FKs por tenant e anula somente o ponteiro vivo na exclusão", () => {
    expect(codigo).toMatch(/foreign key \(imovel_id, user_id\) references public.imoveis \(id, user_id\)\s+on delete set null \(imovel_id\)/);
    expect(codigo).toMatch(/foreign key \(contato_id, user_id\) references public.contatos \(id, user_id\)\s+on delete no action/);
    expect(codigo).toContain("foreign key (imovel_referencia_id, user_id)");
    expect(codigo).toContain("foreign key (evento_id, oportunidade_id, user_id)");
    expect(codigo).toContain("unique (oportunidade_id, versao)");
    expect(codigo).toContain("unique (user_id, chave_idempotencia)");
  });
  it("mantém os vocabulários do domínio e versão JS-safe em bigint", () => {
    for (const valor of [...ESTADOS_VENDA, ...MOTIVOS_PERDA_VENDA, ...ORIGENS_COMERCIAIS_VENDA]) expect(codigo).toContain("'" + valor + "'");
    expect(codigo.match(/versao bigint not null/g)).toHaveLength(2);
    expect(codigo.match(/versao between 1 and 9007199254740991/g)).toHaveLength(2);
    expect(codigo).not.toMatch(/\bnumeric\s*\(|\b(real|double precision|money)\b/);
  });
  it("define somente índices de leitura, unicidade e FKs", () => {
    expect([...codigo.matchAll(/create index (\w+)/g)].map(m => m[1])).toEqual([
      "vendas_oportunidades_estado_idx", "vendas_oportunidades_criacao_idx", "vendas_oportunidades_encerramento_idx",
      "vendas_oportunidades_contato_idx", "vendas_oportunidades_referencia_idx", "vendas_referencias_vivo_idx",
      "vendas_referencias_original_idx", "vendas_eventos_historico_idx", "vendas_comandos_oportunidade_idx", "vendas_comandos_evento_idx",
    ]);
    expect(codigo).not.toMatch(/\bgin\b|partition by/i);
  });
  it("não copia proprietário/canal/conversa para a referência histórica", () => {
    const referencia = codigo.split("create table public.vendas_imoveis_referencias")[1].split("create table public.vendas_oportunidades")[0];
    expect(referencia).not.toMatch(/proprietario|telefone|mensage|conversa|contato_id/);
    for (const coluna of ["imovel_id_original", "codigo", "referencia", "endereco", "unidade", "bloco", "capturado_em"]) expect(referencia).toContain(coluna);
  });

  it.each([
    ["public.vendas_oportunidades", ["id","user_id","contato_id","estado","versao","imovel_modo","imovel_referencia_id",
      "manual_endereco","manual_referencia","manual_unidade","manual_bloco","manual_descricao_curta","origem_tipo","origem_descricao",
      "valor_negocio_previsto","valor_negocio_fechado","receita_prevista","criado_por","responsavel_usuario_id",
      "encerramento_tipo","data_fato","confirmacao_explicita","registro_formalizacao","motivo_perda","justificativa_perda",
      "encerrado_em","created_at","updated_at","arquivado_em"]],
    ["public.vendas_imoveis_referencias", ["id","user_id","imovel_id","imovel_id_original","codigo","referencia","endereco","unidade","bloco","capturado_em"]],
    ["public.vendas_oportunidades_eventos", ["id","user_id","oportunidade_id","tipo","ator_usuario_id","registrado_em","data_fato","versao","payload","chave_idempotencia"]],
    ["private.vendas_comandos", ["id","user_id","chave_idempotencia","operacao","fingerprint","oportunidade_id","evento_id","resposta","created_at","concluido_em"]],
  ] as const)("preserva as colunas do contrato em %s", (tabela, colunas) => {
    const bloco = codigo.split("create table " + tabela + " (")[1].split("\n);")[0];
    const encontradas = [...bloco.matchAll(/^  (\w+) (?:uuid|text|bigint|numeric|boolean|date|timestamptz|jsonb)\b/gm)].map(m => m[1]);
    expect(encontradas).toEqual(colunas);
  });
  it("usa date para fato e timestamptz(3) para os instantes, sem relógio implícito", () => {
    expect(codigo.match(/data_fato date/g)).toHaveLength(2);
    expect(codigo.match(/timestamptz\(3\)/g)).toHaveLength(8);
    expect(codigo).not.toMatch(/default (?:now\(\)|current_timestamp|current_date|1\b|'nova')/i);
  });
});
