/* ================================================================
   APOIO DOS TESTES DO C8 — PostgreSQL real em memória (PGlite)

   Sobe o ledger do Garimpo em Campo na ordem (C2a → C2b → C2c → C2d → C2e)
   num PGlite, no molde de prospeccao-merge.test.ts. Nenhuma API,
   credencial ou .env. PGlite tem UMA sessão: concorrência de verdade não é
   simulada — o que se prova é o contrato do banco (claim, lease, unique
   parcial, advisory lock, transação única), chamado em série.

   As RPCs do modelo Servidor são chamadas como dono do banco, que é o
   papel efetivo da service role; a superfície de grants é provada à parte,
   por `has_function_privilege`.
   ================================================================ */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";

/* Raiz do repositório por caminho, não por URL: no ambiente jsdom o `URL`
   global é o do navegador e `readFileSync` não o aceita. */
const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const PASTA = "supabase/migrations/";

export const USUARIO = "10000000-0000-4000-8000-000000000001";
export const OUTRO_USUARIO = "10000000-0000-4000-8000-000000000002";
export const MODELO = "gpt-5.6-luna";
export const PISO = 70;

export type Json = Record<string, unknown>;

export function lerSql(relativo: string): string {
  return readFileSync(resolve(RAIZ, relativo), "utf8").replace(/\r\n/g, "\n");
}

export const MIGRATIONS_PROSPECCAO = [
  "20260910184310_prospeccao_campo.sql",
  "20260910190155_prospeccao_campo_rls_grants.sql",
  "20260910193412_prospeccao_campo_triggers.sql",
  "20260910201530_prospeccao_campo_rpcs_classificacao.sql",
  "20260910211045_prospeccao_campo_rpcs_navegador.sql",
  // Correção do reuso (pós-C8): a definição EFETIVA de concluir_classificacao.
  "20260914130000_prospeccao_reuso_reconstroi_execucao.sql",
  // C2f (Storage) e C7b (merge) ficam fora: exigem `storage.buckets` e não
  // participam da classificação. Os testes de exclusão e merge os cobrem.
] as const;

export async function subirBancoProspeccao(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(`
    create role anon nologin;
    create role authenticated nologin;
    create role service_role nologin;
    create schema auth;
    create schema private;
    create schema storage;
    create table auth.users (id uuid primary key);
    insert into auth.users values ('${USUARIO}'), ('${OUTRO_USUARIO}');
    create function auth.uid() returns uuid language sql stable
      as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant usage on schema auth to authenticated;
    grant usage on schema auth to service_role;
    create function public.set_updated_at() returns trigger language plpgsql
      as $$ begin new.updated_at := now(); return new; end; $$;
    create table public.imoveis (id uuid primary key, user_id uuid references auth.users(id));
    create table storage.objects (id uuid primary key, bucket_id text, name text);
  `);
  for (const nome of MIGRATIONS_PROSPECCAO) await db.exec(lerSql(PASTA + nome));
  return db;
}

export function criarApoio(db: () => PGlite) {
  async function comoUsuario<T = { resultado: Json }>(sql: string, parametros: unknown[] = [], usuario = USUARIO) {
    await db().query("select set_config('request.jwt.claim.sub', $1, false)", [usuario]);
    await db().exec("set role authenticated");
    try {
      return await db().query<T>(sql, parametros);
    } finally {
      await db().exec("reset role").catch(() => {});
    }
  }

  async function identidade(tipo: string | null = null, usuario = USUARIO): Promise<string> {
    const id = randomUUID();
    await db().query(
      "insert into public.imoveis_identificados (id, user_id, logradouro, tipo) values ($1, $2, 'Rua de teste', $3)",
      [id, usuario, tipo],
    );
    return id;
  }

  async function avistamento(
    pai: string,
    observadoEm: string,
    observacao = "Casa fechada, sem placa na frente.",
    usuario = USUARIO,
  ): Promise<string> {
    const id = randomUUID();
    await db().query(
      `insert into public.imoveis_identificados_avistamentos
         (id, user_id, imovel_identificado_id, observado_em, observacao, precisao_localizacao)
       values ($1, $2, $3, $4, $5, 'desconhecida')`,
      [id, usuario, pai, observadoEm, observacao],
    );
    return id;
  }

  async function iniciar(avistamentoId: string, fingerprint: string, opcoes: {
    usuario?: string; modelo?: string; esforco?: string | null; piso?: number;
    versaoCatalogo?: number; versaoClassificador?: number;
  } = {}): Promise<Json> {
    const { rows } = await db().query<{ r: Json }>(
      "select public.iniciar_classificacao($1, $2, $3, $4, $5, $6, $7, $8) as r",
      [
        opcoes.usuario ?? USUARIO, avistamentoId, fingerprint, opcoes.modelo ?? MODELO,
        opcoes.esforco === undefined ? "low" : opcoes.esforco,
        opcoes.versaoCatalogo ?? 1, opcoes.versaoClassificador ?? 1, opcoes.piso ?? PISO,
      ],
    );
    return rows[0].r;
  }

  async function concluir(
    claim: Json,
    etiquetas: { categoria: string; codigo: string; confianca: number }[],
    tipo: { sugerido: string; confianca: number } | null = null,
    contadores: Json = {},
    usuario = USUARIO,
  ): Promise<Json> {
    const { rows } = await db().query<{ r: Json }>(
      "select public.concluir_classificacao($1, $2, $3, $4, $5, $6::jsonb, $7::jsonb) as r",
      [
        usuario, claim.run_id, claim.lease_token, tipo?.sugerido ?? null, tipo?.confianca ?? null,
        JSON.stringify(etiquetas), JSON.stringify(contadores),
      ],
    );
    return rows[0].r;
  }

  async function falhar(claim: Json, codigo: string, usuario = USUARIO): Promise<Json> {
    const { rows } = await db().query<{ r: Json }>(
      "select public.falhar_classificacao($1, $2, $3, $4) as r",
      [usuario, claim.run_id, claim.lease_token, codigo],
    );
    return rows[0].r;
  }

  /** Claim + conclusão num passo, para os testes que só precisam do evento. */
  async function classificar(
    avistamentoId: string,
    fingerprint: string,
    etiquetas: { categoria: string; codigo: string; confianca: number }[],
    tipo: { sugerido: string; confianca: number } | null = null,
  ): Promise<{ claim: Json; conclusao: Json }> {
    const claim = await iniciar(avistamentoId, fingerprint);
    if (claim.ok !== true || claim.repetida === true) throw new Error(`Claim não obtido: ${JSON.stringify(claim)}`);
    const conclusao = await concluir(claim, etiquetas, tipo);
    return { claim, conclusao };
  }

  async function linha<T extends Json = Json>(tabela: string, id: string | number): Promise<T> {
    const { rows } = await db().query<{ l: T }>(`select to_jsonb(t) as l from ${tabela} t where t.id = $1`, [id]);
    if (!rows[0]) throw new Error(`Linha ${id} ausente em ${tabela}`);
    return rows[0].l;
  }

  async function etiquetas(avistamentoId: string): Promise<Json[]> {
    const { rows } = await db().query<{ l: Json }>(
      `select to_jsonb(e) as l from public.imoveis_identificados_etiquetas e
        where e.avistamento_id = $1 order by e.id`,
      [avistamentoId],
    );
    return rows.map((r) => r.l);
  }

  async function execucoes(avistamentoId: string): Promise<Json[]> {
    const { rows } = await db().query<{ l: Json }>(
      `select to_jsonb(c) as l from public.imoveis_identificados_classificacoes c
        where c.avistamento_id = $1 order by c.iniciada_em, c.id`,
      [avistamentoId],
    );
    return rows.map((r) => r.l);
  }

  async function marcarExclusao(id: string): Promise<void> {
    await db().query("update public.imoveis_identificados set exclusao_solicitada_em = now() where id = $1", [id]);
  }

  return {
    comoUsuario, identidade, avistamento, iniciar, concluir, falhar, classificar,
    linha, etiquetas, execucoes, marcarExclusao,
  };
}

export const TABELAS_PROSPECCAO = [
  "public.imoveis_identificados",
  "public.imoveis_identificados_avistamentos",
  "public.imoveis_identificados_fotos",
  "public.imoveis_identificados_classificacoes",
  "public.imoveis_identificados_etiquetas",
] as const;

export async function limparBanco(db: PGlite): Promise<void> {
  await db.exec("reset role; truncate public.imoveis_identificados, public.imoveis, storage.objects cascade");
}
