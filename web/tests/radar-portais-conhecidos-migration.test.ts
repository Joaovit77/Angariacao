// R4.2g — as três CHECKs de portal passam a aceitar `zap`, e só ele, sem
// invalidar nenhuma linha existente. PostgreSQL local (PGlite); nunca Supabase.
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

const MIGRATION = readFileSync(
  new URL("../../supabase/migrations/20260928140000_radar_portais_conhecidos_zap.sql", import.meta.url),
  "utf8",
);
const SCHEMA = readFileSync(new URL("../../supabase-schema.sql", import.meta.url), "utf8");

const TABELAS = ["radar_anuncios", "central_anuncios_visualizados", "comparaveis_mercado"] as const;
const ATUAIS = ["olx", "chaves-na-mao", "wimoveis", "viva-real"];
const CINCO = [...ATUAIS, "zap"];
const CHECK_ANTIGA = "check (portal in ('olx', 'chaves-na-mao', 'wimoveis', 'viva-real'))";

/** Bloco canônico do schema que converge um banco já criado. */
function blocoCanonicoDoSchema(): string {
  const inicio = SCHEMA.indexOf("-- Radar R4.2g: portais CONHECIDOS pelo banco.");
  const marcadorFim = "add constraint comparaveis_mercado_portal_check";
  const fim = SCHEMA.indexOf(";", SCHEMA.indexOf(marcadorFim, inicio));
  if (inicio < 0 || fim < 0) throw new Error("bloco canônico do R4.2g não encontrado no schema");
  return SCHEMA.slice(inicio, fim + 1);
}

/** Banco como está hoje: as três tabelas com a CHECK inline de quatro portais e uma linha de cada. */
async function bancoAtual(): Promise<PGlite> {
  const db = new PGlite();
  for (const tabela of TABELAS) {
    await db.exec(`create table public.${tabela} (id serial primary key, portal text not null ${CHECK_ANTIGA})`);
    for (const portal of ATUAIS) await db.query(`insert into public.${tabela} (portal) values ($1)`, [portal]);
  }
  return db;
}

async function portaisDaCheck(db: PGlite, tabela: string): Promise<string[]> {
  const { rows } = await db.query<{ definicao: string }>(
    `select pg_get_constraintdef(oid) as definicao from pg_constraint
      where conrelid = $1::regclass and conname = $2`,
    [`public.${tabela}`, `${tabela}_portal_check`],
  );
  expect(rows, `${tabela}_portal_check`).toHaveLength(1);
  return [...rows[0].definicao.matchAll(/'([^']+)'::text/g)].map((achado) => achado[1]).sort();
}

async function aceita(db: PGlite, tabela: string, portal: string): Promise<boolean> {
  try {
    await db.query(`insert into public.${tabela} (portal) values ($1)`, [portal]);
    return true;
  } catch {
    return false;
  }
}

describe.each([
  ["migration", () => MIGRATION],
  ["bloco canônico do supabase-schema.sql", blocoCanonicoDoSchema],
])("R4.2g: CHECKs de portal via %s", (_origem, sql) => {
  it("parte das CHECKs atuais, com os mesmos nomes que a mudança recria", async () => {
    const db = await bancoAtual();
    for (const tabela of TABELAS) expect(await portaisDaCheck(db, tabela)).toEqual([...ATUAIS].sort());
    await db.close();
  }, 20_000);

  it.each(TABELAS)("%s: mantém as linhas, aceita os quatro atuais e zap, recusa o arbitrário", async (tabela) => {
    const db = await bancoAtual();
    await db.exec(sql());

    // D. Linhas existentes continuam lá e válidas.
    const { rows } = await db.query<{ portal: string }>(`select portal from public.${tabela} order by id`);
    expect(rows.map((linha) => linha.portal)).toEqual(ATUAIS);
    // A. Os quatro valores atuais continuam aceitos.
    for (const portal of ATUAIS) expect(await aceita(db, tabela, portal), portal).toBe(true);
    // B. zap passa a ser aceito.
    expect(await aceita(db, tabela, "zap")).toBe(true);
    // C. Valor arbitrário (e variações do zap) continua recusado.
    for (const portal of ["portal-inexistente", "ZAP", "zap ", ""]) {
      expect(await aceita(db, tabela, portal), JSON.stringify(portal)).toBe(false);
    }
    expect(await portaisDaCheck(db, tabela)).toEqual([...CINCO].sort());
    await db.close();
  }, 20_000);

  it("é idempotente: aplicar duas vezes não falha nem muda o resultado", async () => {
    const db = await bancoAtual();
    await db.exec(sql());
    await db.exec(sql());
    for (const tabela of TABELAS) expect(await portaisDaCheck(db, tabela)).toEqual([...CINCO].sort());
    await db.close();
  }, 20_000);
});

describe("R4.2g: forma da migration e do schema", () => {
  it("a migration só troca as três CHECKs: nenhum dado é tocado", () => {
    const comandos = MIGRATION.replace(/--.*$/gm, "").split(";").map((c) => c.trim()).filter(Boolean);
    expect(comandos).toHaveLength(6);
    for (const comando of comandos) {
      expect(comando).toMatch(/^alter table public\.(radar_anuncios|central_anuncios_visualizados|comparaveis_mercado)\s+(drop|add) constraint /);
    }
    expect(MIGRATION).not.toMatch(/\b(insert|update|delete|truncate)\b/i);
  });

  it("o schema canônico cria as três tabelas já com os cinco portais", () => {
    expect(SCHEMA).not.toContain(CHECK_ANTIGA);
    const inline = "portal text not null check (portal in ('olx', 'chaves-na-mao', 'wimoveis', 'viva-real', 'zap'))";
    expect(SCHEMA.split(inline).length - 1).toBe(3);
  });
});
