import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { PGlite } from "@electric-sql/pglite";
export const A = "10000000-0000-4000-8000-000000000001";
export const B = "10000000-0000-4000-8000-000000000002";
export const migrationB0 = "supabase/migrations/20261011203141_radar_ofertas_por_finalidade.sql";
export const ler = (p: string) => readFileSync(resolve(import.meta.dirname, "../../..", p), "utf8").replace(/\r\n/g, "\n");
/** O tipo vetorial fica textual no PGlite; Docker exercita pgvector real.
 * A RPC anterior vem do ledger histórico, sem reimplementação no teste. */
export async function bancoAnterior() {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema auth; create schema private; create table auth.users(id uuid primary key);
    insert into auth.users values ('${A}'), ('${B}');
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to authenticated, service_role;`);
  const schema = ler("supabase-schema.sql");
  const tabela = schema.slice(schema.indexOf("create table if not exists comparaveis_mercado ("), schema.indexOf("-- Backfill sem inferir"))
    .replace("constraint comparaveis_mercado_oferta_key unique (user_id, portal, id_externo, finalidade)", "unique (user_id, portal, id_externo)")
    .replace(/alter table comparaveis_mercado drop constraint if exists[\s\S]+?end \$\$;/, "")
    .replace("extensions.vector(512)", "text");
  await db.exec(tabela);
  await db.exec(`alter table comparaveis_mercado enable row level security;
    create policy leitura on comparaveis_mercado for select to authenticated using (true);
    create policy insercao on comparaveis_mercado for insert to authenticated with check(auth.uid()=user_id);
    create policy alteracao on comparaveis_mercado for update to authenticated using(auth.uid()=user_id) with check(auth.uid()=user_id);
    grant select,insert,update on comparaveis_mercado to authenticated;
    create index idx_comparaveis_mercado_identidade_url on comparaveis_mercado(user_id,url_canonica);
    create index idx_comparaveis_mercado_identidade_fingerprint on comparaveis_mercado(user_id,anuncio_fingerprint);`);
  await db.exec(ler("supabase/migrations/20260824203357_avaliacao_v3_corrige_chave_lock_upsert.sql"));
  await db.exec(schema.slice(schema.indexOf("create table if not exists observacoes_comparaveis_mercado ("), schema.indexOf("-- Os filtros objetivos estão dentro da função")));
  await db.exec(ler("supabase/migrations/20260824203203_avaliacao_v3_historico_append_only.sql"));
  return db;
}
export function oferta(finalidade = "locacao", valor = finalidade === "venda" ? 650000 : 3200, extra = {}) {
  return { portal: "zap", id_externo: "SYNTHETIC-123", url: "https://oferta.example.test/123",
    url_canonica: "https://oferta.example.test/123", anuncio_fingerprint: "fisico-sintetico-123",
    fingerprint_forte: true, finalidade, finalidade_observada: finalidade,
    titulo: "Oferta sintética", cidade: "Londrina", cidade_chave: "londrina", estado: "PR",
    endereco: "Rua Sintética, 123", tipo: "Apartamento", area_m2: 80, quartos: 2,
    valor_anunciado: valor, observado_em: "2026-10-11T12:00:00Z", ...extra };
}
export async function registrar(db: PGlite, dados = oferta(), usuario = A) {
  await db.query("select set_config('request.jwt.claim.sub', $1, false)", [usuario]);
  await db.exec("set role authenticated");
  try { return (await db.query<{id: string; criado: boolean}>("select * from registrar_comparavel_mercado($1::jsonb)", [JSON.stringify(dados)])).rows[0]; }
  finally { await db.exec("reset role"); }
}
