import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";
import {
  CODIGO_FINALIDADE_VENDA_LOCACAO,
  MENSAGEM_FINALIDADE_VENDA_LOCACAO,
  podeParticiparFluxoLocacao,
} from "@/lib/calculo/finalidadeOperacional";
import type { FinalidadeImovel } from "@/lib/constantes";

/* Imóvel de venda, IV-4A: a guarda do ledger de locação no banco (PGlite).
   Mesmo ambiente do `repasses-banco.test.ts`, com a coluna `finalidade` do
   IV-1, a migration dos repasses e, por cima, a do IV-4A. Tudo pela RPC
   pública no papel `authenticated`, como o navegador chama. */

const ler = (nome: string) => readFileSync(new URL("../../supabase/migrations/" + nome, import.meta.url), "utf8");
const MIGRACAO_REPASSES = ler("20260908132609_repasses_configuraveis.sql");
const MIGRACAO_IV4A = ler("20261008150000_imoveis_finalidade_guarda_locacao.sql");

const USUARIO_A = "10000000-0000-4000-8000-000000000001";
const USUARIO_B = "10000000-0000-4000-8000-000000000002";
const FINALIDADES: Array<FinalidadeImovel | null> = ["locacao", "venda", "locacao_venda", null];

type Json = Record<string, unknown>;
type Linha = { status: string; locado_em: string | null; finalidade: string | null; status_history: unknown[] };

describe.sequential("IV-4A: guarda do ledger de locação no banco", () => {
  let db: PGlite;

  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`
      create role anon nologin;
      create role authenticated nologin;
      create role service_role nologin;
      create schema auth;
      create schema private;
      create table auth.users (id uuid primary key);
      insert into auth.users (id) values ('${USUARIO_A}'), ('${USUARIO_B}');

      create or replace function auth.uid()
      returns uuid language sql stable
      as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

      create or replace function public.set_updated_at()
      returns trigger language plpgsql as $$
      begin new.updated_at := now(); return new; end;
      $$;

      create table public.imoveis (
        id uuid primary key default gen_random_uuid(),
        user_id uuid not null references auth.users(id),
        codigo text not null,
        referencia_crm text,
        endereco text not null,
        status text not null default 'Publicado',
        locado_em date,
        comissao_recebida boolean not null default false,
        comissao_recebida_data date,
        retirado boolean not null default false,
        status_history jsonb not null default '[]'::jsonb,
        finalidade text,
        constraint imoveis_finalidade_check
          check (finalidade is null or finalidade in ('locacao', 'venda', 'locacao_venda'))
      );

      create or replace function public.registrar_status_history_teste()
      returns trigger language plpgsql as $$
      begin
        if new.status is distinct from old.status then
          new.status_history := coalesce(old.status_history, '[]'::jsonb) || jsonb_build_array(
            jsonb_build_object('status', new.status, 'date', current_date, 'userId', auth.uid())
          );
        end if;
        return new;
      end;
      $$;
      create trigger trg_status_history_teste before update on public.imoveis
        for each row execute function public.registrar_status_history_teste();

      create table public.agenda (
        id uuid primary key default gen_random_uuid(),
        user_id uuid not null references auth.users(id),
        imovel_id uuid references public.imoveis(id),
        is_verificacao_disponibilidade boolean not null default false,
        done boolean not null default false
      );
    `);
    await db.exec(MIGRACAO_REPASSES);
    await db.exec(MIGRACAO_IV4A);
  }, 30_000);

  async function inserirPolitica(usuario = USUARIO_A) {
    const id = randomUUID();
    await db.query(
      `insert into public.politicas_repasse (
        id, user_id, nome, evento_origem, regra_primeiro_vencimento,
        dias_vencimento, tipo_prazo, quantidade_dias, tipo_contagem,
        ajuste_fim_semana, ajuste_feriado, ativo, padrao
      ) values ($1, $2, 'Repasse IV-4A', 'locacao', 'mes_seguinte', $3, 'apos_primeiro_vencimento', 5,
        'corridos', 'manter', 'manter', true, false)`,
      [id, usuario, [10, 20]],
    );
    return id;
  }

  async function inserirImovel(
    finalidade: FinalidadeImovel | null,
    { usuario = USUARIO_A, status = "Publicado", retirado = false } = {},
  ) {
    const id = randomUUID();
    await db.query(
      `insert into public.imoveis (id, user_id, codigo, endereco, status, retirado, finalidade)
       values ($1, $2, $3, 'Rua de teste, 10', $4, $5, $6)`,
      [id, usuario, `LD-${id.slice(0, 4)}`, status, retirado, finalidade],
    );
    return id;
  }

  async function comoUsuario<T extends Json>(usuario: string, sql: string, parametros: unknown[] = []) {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [usuario]);
    await db.exec("set role authenticated");
    try {
      return await db.query<T>(sql, parametros);
    } finally {
      await db.exec("reset role");
    }
  }

  const item = (imovelId: string, dataLocacao = "2026-10-08") => ({ imovel_id: imovelId, data_locacao: dataLocacao, dia_vencimento: 10 });

  async function previa(itens: Json[], usuario = USUARIO_A, politica?: string) {
    const id = politica ?? (await inserirPolitica(usuario));
    const r = await comoUsuario<{ resultado: Json }>(usuario,
      "select public.prever_repasses_locacao($1, $2::jsonb) as resultado", [id, JSON.stringify(itens)]);
    return r.rows[0].resultado;
  }

  async function locar(itens: Json[], { usuario = USUARIO_A, operacao = randomUUID(), politica }: { usuario?: string; operacao?: string; politica?: string } = {}) {
    const id = politica ?? (await inserirPolitica(usuario));
    const r = await comoUsuario<{ resultado: Json }>(usuario,
      "select public.locar_imoveis_em_lote($1, $2, $3::jsonb) as resultado", [operacao, id, JSON.stringify(itens)]);
    return r.rows[0].resultado;
  }

  const linha = async (id: string) =>
    (await db.query<Linha>("select status, locado_em::text, finalidade, status_history from public.imoveis where id = $1", [id])).rows[0];
  const total = async (tabela: "locacoes" | "repasses", ids: string[]) =>
    (await db.query<{ n: number }>(`select count(*)::int as n from public.${tabela} where imovel_id = any($1::uuid[])`, [ids])).rows[0].n;
  const lembretesAbertos = async (id: string) =>
    (await db.query<{ n: number }>(
      "select count(*)::int as n from public.agenda where imovel_id = $1 and is_verificacao_disponibilidade and not done", [id],
    )).rows[0].n;
  async function lembrete(id: string, usuario = USUARIO_A) {
    await db.query("insert into public.agenda (user_id, imovel_id, is_verificacao_disponibilidade) values ($1, $2, true)", [usuario, id]);
  }
  const codigos = (resultado: Json) => (resultado.erros as Json[]).map((e) => e.codigo);

  it("mantém assinatura, owner, SECURITY DEFINER, search_path e ACL da função e das RPCs", async () => {
    const funcoes = await db.query<{ sig: string; secdef: boolean; config: string[] }>(
      `select p.oid::regprocedure::text as sig, p.prosecdef as secdef, p.proconfig as config
         from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        where (n.nspname, p.proname) in (('private', 'prever_locacoes'), ('public', 'prever_repasses_locacao'), ('public', 'locar_imoveis_em_lote'))
        order by 1`,
    );
    expect(funcoes.rows).toEqual([
      { sig: "locar_imoveis_em_lote(uuid,uuid,jsonb)", secdef: true, config: ['search_path=""'] },
      { sig: "prever_repasses_locacao(uuid,jsonb)", secdef: true, config: ['search_path=""'] },
      { sig: "private.prever_locacoes(uuid,uuid,jsonb,boolean)", secdef: true, config: ['search_path=""'] },
    ]);
    const acesso = await db.query<Record<string, boolean>>(`select
      has_function_privilege('authenticated', 'private.prever_locacoes(uuid,uuid,jsonb,boolean)', 'execute') as interna_auth,
      has_function_privilege('anon', 'private.prever_locacoes(uuid,uuid,jsonb,boolean)', 'execute') as interna_anon,
      has_function_privilege('authenticated', 'public.prever_repasses_locacao(uuid,jsonb)', 'execute') as previa_auth,
      has_function_privilege('anon', 'public.prever_repasses_locacao(uuid,jsonb)', 'execute') as previa_anon,
      has_function_privilege('authenticated', 'public.locar_imoveis_em_lote(uuid,uuid,jsonb)', 'execute') as locar_auth,
      has_function_privilege('anon', 'public.locar_imoveis_em_lote(uuid,uuid,jsonb)', 'execute') as locar_anon`);
    expect(acesso.rows[0]).toEqual({
      interna_auth: false, interna_anon: false, previa_auth: true, previa_anon: false, locar_auth: true, locar_anon: false,
    });
  });

  it.each(["locacao", "locacao_venda", null] as const)(
    "finalidade %s: loca como antes, com locação, repasse, Locado, locado_em e sem tocar na finalidade",
    async (finalidade) => {
      const imovel = await inserirImovel(finalidade);
      await lembrete(imovel);
      const resultado = await locar([item(imovel)]);
      expect(resultado).toMatchObject({ ok: true, repetida: false, total_imoveis: 1, total_repasses: 1 });
      expect(await total("locacoes", [imovel])).toBe(1);
      expect(await total("repasses", [imovel])).toBe(1);
      const depois = await linha(imovel);
      expect(depois).toMatchObject({ status: "Locado", locado_em: "2026-10-08", finalidade });
      expect(depois.status_history).toHaveLength(1);
      // A confirmação de locação continua encerrando o lembrete de disponibilidade.
      expect(await lembretesAbertos(imovel)).toBe(0);
    },
  );

  it("venda: a prévia recusa o item com o código e o texto do app, sem calcular datas", async () => {
    const imovel = await inserirImovel("venda");
    const resultado = await previa([item(imovel)]);
    expect(resultado.ok).toBe(false);
    expect(resultado.itens).toEqual([]);
    expect(resultado.erros).toEqual([{
      imovel_id: imovel,
      rotulo: `LD-${imovel.slice(0, 4)}`,
      codigo: CODIGO_FINALIDADE_VENDA_LOCACAO,
      mensagem: MENSAGEM_FINALIDADE_VENDA_LOCACAO,
    }]);
  });

  it("venda por chamada direta à confirmação: zero locação, zero repasse, sem Locado, sem locado_em, lembrete intacto", async () => {
    const imovel = await inserirImovel("venda");
    await lembrete(imovel);
    const antes = await linha(imovel);
    const resultado = await locar([item(imovel)]);
    expect(resultado.ok).toBe(false);
    expect(codigos(resultado)).toEqual([CODIGO_FINALIDADE_VENDA_LOCACAO]);
    expect(await total("locacoes", [imovel])).toBe(0);
    expect(await total("repasses", [imovel])).toBe(0);
    expect(await linha(imovel)).toEqual(antes);
    expect(antes).toMatchObject({ status: "Publicado", locado_em: null, finalidade: "venda" });
    expect(await lembretesAbertos(imovel)).toBe(1);
  });

  it("lote misto A/B/C/D: segue tudo-ou-nada; só B é apontado e nada é gravado", async () => {
    const [a, b, c, d] = [
      await inserirImovel("locacao"), await inserirImovel("venda"), await inserirImovel("locacao_venda"), await inserirImovel(null),
    ];
    const ids = [a, b, c, d];
    for (const id of ids) await lembrete(id);
    const politica = await inserirPolitica();

    const vistaPrevia = await previa(ids.map((id) => item(id)), USUARIO_A, politica);
    expect(vistaPrevia.ok).toBe(false);
    expect((vistaPrevia.erros as Json[]).map((e) => [e.imovel_id, e.codigo])).toEqual([[b, CODIGO_FINALIDADE_VENDA_LOCACAO]]);
    expect((vistaPrevia.itens as Json[]).map((i) => i.imovel_id)).toEqual([a, c, d]);

    const antes = await Promise.all(ids.map(linha));
    const recusado = await locar(ids.map((id) => item(id)), { politica });
    expect(recusado.ok).toBe(false);
    expect((recusado.erros as Json[]).map((e) => [e.imovel_id, e.codigo])).toEqual([[b, CODIGO_FINALIDADE_VENDA_LOCACAO]]);
    expect(await total("locacoes", ids)).toBe(0);
    expect(await total("repasses", ids)).toBe(0);
    expect(await Promise.all(ids.map(linha))).toEqual(antes);
    for (const id of ids) expect(await lembretesAbertos(id)).toBe(1);

    // Sem B, o mesmo lote passa como sempre passou.
    const semVenda = await locar([a, c, d].map((id) => item(id)), { politica });
    expect(semVenda).toMatchObject({ ok: true, total_imoveis: 3, total_repasses: 3 });
    expect((await Promise.all([a, c, d].map(linha))).map((l) => [l.status, l.finalidade])).toEqual([
      ["Locado", "locacao"], ["Locado", "locacao_venda"], ["Locado", null],
    ]);
    expect(await linha(b)).toEqual(antes[1]);
    expect(await total("repasses", [b])).toBe(0);
  });

  it("outro tenant: a posse vem antes da finalidade e nada vaza nem é gravado", async () => {
    const proprio = await inserirImovel("locacao");
    const alheioVenda = await inserirImovel("venda", { usuario: USUARIO_B });
    const alheioLocacao = await inserirImovel("locacao", { usuario: USUARIO_B });
    const resultado = await locar([item(proprio), item(alheioVenda), item(alheioLocacao)]);
    expect(resultado.ok).toBe(false);
    expect(codigos(resultado)).toEqual(["imovel_indisponivel", "imovel_indisponivel"]);
    expect(JSON.stringify(resultado.erros)).not.toContain("finalidade");
    expect(await total("repasses", [proprio, alheioVenda, alheioLocacao])).toBe(0);
    expect((await linha(proprio)).status).toBe("Publicado");
  });

  it("retirado e já locado mantêm o erro e a precedência de antes, inclusive quando também são venda", async () => {
    const retiradoLocacao = await inserirImovel("locacao", { retirado: true });
    const retiradoVenda = await inserirImovel("venda", { retirado: true });
    const locadoLocacao = await inserirImovel("locacao", { status: "Locado" });
    const locadoVenda = await inserirImovel("venda", { status: "Locado" });
    const resultado = await locar([item(retiradoLocacao), item(retiradoVenda), item(locadoLocacao), item(locadoVenda)]);
    expect(codigos(resultado)).toEqual(["imovel_retirado", "imovel_retirado", "locacao_ativa", "locacao_ativa"]);
    expect(await total("repasses", [retiradoLocacao, retiradoVenda, locadoLocacao, locadoVenda])).toBe(0);
  });

  it("idempotência: o retry da mesma operação válida devolve a repetida; a de venda segue recusada", async () => {
    const politica = await inserirPolitica();
    const imovel = await inserirImovel("locacao");
    const operacao = randomUUID();
    expect((await locar([item(imovel)], { operacao, politica })).ok).toBe(true);
    expect(await locar([item(imovel)], { operacao, politica })).toMatchObject({ ok: true, repetida: true });
    expect(await total("repasses", [imovel])).toBe(1);

    const venda = await inserirImovel("venda");
    const operacaoVenda = randomUUID();
    for (let i = 0; i < 2; i += 1) {
      const r = await locar([item(venda)], { operacao: operacaoVenda, politica });
      expect(r.ok).toBe(false);
      expect(r.repetida).toBeUndefined();
      expect(codigos(r)).toEqual([CODIGO_FINALIDADE_VENDA_LOCACAO]);
    }
    expect(await total("locacoes", [venda])).toBe(0);
  });

  it("rollback do lote inválido continua como antes (imóvel de outro tenant)", async () => {
    const proprio = await inserirImovel(null);
    const alheio = await inserirImovel(null, { usuario: USUARIO_B });
    const resultado = await locar([item(proprio), item(alheio)]);
    expect(resultado.ok).toBe(false);
    expect(codigos(resultado)).toEqual(["imovel_indisponivel"]);
    expect((await linha(proprio)).status).toBe("Publicado");
    expect(await total("repasses", [proprio])).toBe(0);
  });

  it("TS × SQL: a prévia do banco e podeParticiparFluxoLocacao dão a mesma resposta para as quatro finalidades", async () => {
    const politica = await inserirPolitica();
    const matriz: Array<[FinalidadeImovel | null, boolean, boolean]> = [];
    for (const finalidade of FINALIDADES) {
      const resultado = await previa([item(await inserirImovel(finalidade))], USUARIO_A, politica);
      const banco = !codigos(resultado).includes(CODIGO_FINALIDADE_VENDA_LOCACAO);
      expect(resultado.ok).toBe(banco);
      matriz.push([finalidade, banco, podeParticiparFluxoLocacao(finalidade)]);
    }
    expect(matriz).toEqual([
      ["locacao", true, true],
      ["venda", false, false],
      ["locacao_venda", true, true],
      [null, true, true],
    ]);
    expect(podeParticiparFluxoLocacao(undefined)).toBe(true);
  });
});
