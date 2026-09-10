import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { TIPOS_IMOVEL } from "@/lib/constantes";

const MIGRATION = readFileSync(
  new URL("../../supabase/migrations/20260910184310_prospeccao_campo.sql", import.meta.url),
  "utf8",
);
const SCHEMA = readFileSync(new URL("../../supabase-schema.sql", import.meta.url), "utf8");

const TABELAS = [
  "imoveis_identificados",
  "imoveis_identificados_avistamentos",
  "imoveis_identificados_fotos",
  "imoveis_identificados_classificacoes",
  "imoveis_identificados_etiquetas",
] as const;

function trechoTabela(sql: string, tabela: (typeof TABELAS)[number]): string {
  const trecho = sql.match(new RegExp(
    `create table if not exists public\\.${tabela} \\([\\s\\S]*?\\n\\);`,
    "i",
  ))?.[0];
  if (!trecho) throw new Error(`Definição de ${tabela} ausente.`);
  return trecho;
}

function valoresDoCheck(trecho: string, coluna: string): string[] {
  const lista = trecho.match(new RegExp(`${coluna} is null or ${coluna} in \\(\n([\\s\\S]*?)\n\\s*\\)`, "i"))?.[1];
  if (!lista) throw new Error(`CHECK fechado de ${coluna} ausente.`);
  return [...lista.matchAll(/'([^']+)'/g)].map((item) => item[1]);
}

describe("C2a — schema das tabelas do Garimpo em Campo", () => {
  it("cria exatamente as cinco tabelas planejadas e mantém o espelho canônico", () => {
    const criadas = [...MIGRATION.matchAll(/^create table if not exists public\.(\w+)/gm)]
      .map((item) => item[1]);
    expect(criadas).toEqual(TABELAS);
    const blocoEspelhado = `\n${MIGRATION.trim()}\n`;
    expect(SCHEMA).toContain(blocoEspelhado);
    expect(SCHEMA.split(blocoEspelhado)).toHaveLength(2);
    for (const tabela of TABELAS) {
      expect(trechoTabela(SCHEMA, tabela)).toBe(trechoTabela(MIGRATION, tabela));
    }
  });

  it("preserva a identidade separada, a lápide e a promoção recuperável", () => {
    const identidade = trechoTabela(MIGRATION, "imoveis_identificados");
    expect(identidade).toContain("situacao in ('identificado', 'investigando', 'promovendo', 'promovido', 'descartado', 'fundido')");
    expect(identidade).toContain("(situacao = 'fundido') = (fundido_em is not null and fundido_em_imovel_id is not null)");
    expect(identidade).toContain("fundido_em_imovel_id is null or fundido_em_imovel_id <> id");
    expect(identidade).toContain("situacao <> 'promovendo' or (imovel_id is null and promovido_em is null)");
    expect(identidade).toContain("imovel_id is not null and promovido_em is not null");
    expect(MIGRATION).toMatch(/foreign key \(fundido_em_imovel_id\)[\s\S]*?on delete cascade/);
    expect(MIGRATION).toMatch(/imovel_id uuid references public\.imoveis\(id\) on delete set null/);
    expect(identidade).not.toMatch(/nome|telefone|e-mail|email|cpf|whatsapp/i);
  });

  it("fecha o tipo canônico e toda a sua proveniência", () => {
    const identidade = trechoTabela(MIGRATION, "imoveis_identificados");
    const classificacoes = trechoTabela(MIGRATION, "imoveis_identificados_classificacoes");
    expect(valoresDoCheck(identidade, "tipo")).toEqual(TIPOS_IMOVEL);
    expect(valoresDoCheck(classificacoes, "tipo_sugerido")).toEqual(TIPOS_IMOVEL);
    expect(identidade).toContain("tipo_origem is null or tipo_origem in ('manual', 'ia-texto', 'carteira')");
    expect(identidade).toContain("tipo_estado is null or tipo_estado in ('declarado', 'inferido', 'confirmado')");
    expect(identidade).toContain("tipo_confianca is not null");
    expect(identidade).toContain("tipo_classificacao_id is not null");
    expect(identidade).toContain("tipo_avistamento_id is not null");
    expect(identidade).toContain("(tipo_estado = 'confirmado')");
    expect(identidade).toContain("(tipo_confirmado_por is not null and tipo_confirmado_em is not null)");
    expect(MIGRATION).toMatch(/foreign key \(tipo_classificacao_id\)[\s\S]*?on delete set null/);
    expect(MIGRATION).toMatch(/foreign key \(tipo_avistamento_id\)[\s\S]*?on delete set null/);
  });

  it("mantém classificação por avistamento e a bicondicional num único CHECK", () => {
    const avistamentos = trechoTabela(MIGRATION, "imoveis_identificados_avistamentos");
    const classificacoes = trechoTabela(MIGRATION, "imoveis_identificados_classificacoes");
    expect(classificacoes).toMatch(/avistamento_id uuid not null[\s\S]*?on delete cascade/);
    expect(avistamentos).toContain("classificacao_estado in ('pendente', 'concluida', 'indisponivel', 'nao_aplicavel')");
    expect(avistamentos).toContain("(classificacao_estado = 'concluida')");
    expect(avistamentos).toContain("= (classificacao_id is not null and classificacao_em is not null and fingerprint is not null)");
    expect(avistamentos).not.toContain("'processando'");
    expect(MIGRATION).toContain("where estado = 'processando'");
    expect(MIGRATION).toContain("avistamento_id, observacao_revisao, fingerprint");
    expect(MIGRATION).toContain("where estado = 'concluida'");
  });

  it("garante o ciclo da foto e uma única fachada por avistamento", () => {
    const fotos = trechoTabela(MIGRATION, "imoveis_identificados_fotos");
    expect(fotos).toContain("estado in ('reservada', 'ativa')");
    expect(fotos).toContain("(estado = 'ativa') = (ativada_em is not null)");
    expect(fotos).toContain("bytes > 0 and bytes <= 5242880");
    expect(fotos).toContain("caminho text not null unique");
    expect(fotos).toContain("caminho_miniatura text not null unique");
    expect(fotos).not.toContain("principal");
    expect(MIGRATION).toMatch(
      /create unique index if not exists idx_identificados_fotos_avistamento_unico\s+on public\.imoveis_identificados_fotos \(avistamento_id\);/,
    );
  });

  it("mantém afirmações temporais append-only e uma vigente por escopo", () => {
    const etiquetas = trechoTabela(MIGRATION, "imoveis_identificados_etiquetas");
    expect(etiquetas).toContain("origem in ('manual', 'ia-texto', 'ia-visao')");
    expect(etiquetas).toContain("estado in ('inferida', 'confirmada', 'contestada', 'substituida', 'desatualizada')");
    expect(etiquetas).toContain("origem <> 'ia-texto'");
    expect(etiquetas).toContain("estado <> 'substituida'");
    expect(etiquetas).toContain("estado <> 'desatualizada'");
    expect(MIGRATION).toContain("where avistamento_id is not null and estado in ('inferida', 'confirmada')");
    expect(MIGRATION).toContain("where avistamento_id is null and estado in ('inferida', 'confirmada')");
    expect(MIGRATION).not.toMatch(/unique\s*\(imovel_identificado_id, categoria, codigo\)/i);
  });

  it("limita o C2a à estrutura declarativa e deixa a proteção ligada sem policies", () => {
    for (const tabela of TABELAS) {
      expect(MIGRATION).toContain(`alter table public.${tabela} enable row level security`);
    }
    expect(MIGRATION).not.toMatch(/\bcreate policy\b/i);
    expect(MIGRATION).not.toMatch(/\bgrant\b/i);
    expect(MIGRATION).not.toMatch(/\bcreate trigger\b/i);
    expect(MIGRATION).not.toMatch(/\bcreate (?:or replace )?function\b/i);
    expect(MIGRATION).not.toMatch(/storage\.(?:buckets|objects)/i);
  });
});
