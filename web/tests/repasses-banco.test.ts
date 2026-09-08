import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { beforeAll, describe, expect, it } from "vitest";

const MIGRACAO = readFileSync(
  new URL("../../supabase/migrations/20260908132609_repasses_configuraveis.sql", import.meta.url),
  "utf8",
);

const USUARIO_A = "10000000-0000-4000-8000-000000000001";
const USUARIO_B = "10000000-0000-4000-8000-000000000002";

type Json = Record<string, unknown>;

describe.sequential("repasses configuráveis no banco", () => {
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
        status_history jsonb not null default '[]'::jsonb
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
    await db.exec(MIGRACAO);
  }, 30_000);

  async function inserirPolitica(
    usuario: string,
    parcial: Partial<{
      nome: string;
      regra: string;
      dias: number[];
      prazo: string;
      quantidade: number | null;
      contagem: string;
      ajuste: string;
      padrao: boolean;
    }> = {},
  ) {
    const id = randomUUID();
    await db.query(
      `insert into public.politicas_repasse (
        id, user_id, nome, evento_origem, regra_primeiro_vencimento,
        dias_vencimento, tipo_prazo, quantidade_dias, tipo_contagem,
        ajuste_fim_semana, ajuste_feriado, ativo, padrao
      ) values ($1, $2, $3, 'locacao', $4, $5, $6, $7, $8, $9, 'manter', true, $10)`,
      [
        id,
        usuario,
        parcial.nome ?? "Repasse padrão",
        parcial.regra ?? "mes_seguinte",
        parcial.dias ?? [10, 20],
        parcial.prazo ?? "apos_primeiro_vencimento",
        parcial.quantidade === undefined ? 5 : parcial.quantidade,
        parcial.contagem ?? "corridos",
        parcial.ajuste ?? "manter",
        parcial.padrao ?? false,
      ],
    );
    return id;
  }

  async function inserirImovel(usuario = USUARIO_A, status = "Publicado") {
    const id = randomUUID();
    await db.query(
      "insert into public.imoveis (id, user_id, codigo, endereco, status) values ($1, $2, $3, $4, $5)",
      [id, usuario, `LD-${id.slice(0, 4)}`, "Rua de teste, 10", status],
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

  async function previa(
    usuario: string,
    politicaId: string,
    imovelId: string,
    dataLocacao: string,
    diaVencimento: number,
  ) {
    const resultado = await comoUsuario<{ resultado: Json }>(
      usuario,
      "select public.prever_repasses_locacao($1, $2::jsonb) as resultado",
      [politicaId, JSON.stringify([{ imovel_id: imovelId, data_locacao: dataLocacao, dia_vencimento: diaVencimento }])],
    );
    return resultado.rows[0].resultado;
  }

  function datas(resultado: Json) {
    const item = (resultado.itens as Json[])[0];
    return [item.primeiro_vencimento, item.data_prevista];
  }

  it("permite cadastrar uma política válida no papel autenticado", async () => {
    const politica = randomUUID();
    await comoUsuario(
      USUARIO_A,
      `insert into public.politicas_repasse (
        id, user_id, nome, evento_origem, regra_primeiro_vencimento,
        dias_vencimento, tipo_prazo, quantidade_dias, tipo_contagem,
        ajuste_fim_semana, ajuste_feriado, ativo, padrao
      ) values ($1, $2, 'Política autenticada', 'locacao', 'mes_seguinte',
        array[10, 20]::smallint[], 'apos_primeiro_vencimento', 5, 'corridos',
        'manter', 'manter', true, false)`,
      [politica, USUARIO_A],
    );

    const visiveis = await comoUsuario<{ id: string }>(
      USUARIO_A,
      "select id from public.politicas_repasse where id = $1",
      [politica],
    );
    expect(visiveis.rows).toEqual([{ id: politica }]);
  });

  it("calcula mês seguinte, viradas de mês/ano, ano bissexto e dias inexistentes", async () => {
    const politica = await inserirPolitica(USUARIO_A);
    const imovel = await inserirImovel();

    expect(datas(await previa(USUARIO_A, politica, imovel, "2026-07-06", 10))).toEqual([
      "2026-08-10", "2026-08-15",
    ]);
    expect(datas(await previa(USUARIO_A, politica, imovel, "2026-07-06", 20))).toEqual([
      "2026-08-20", "2026-08-25",
    ]);
    expect(datas(await previa(USUARIO_A, politica, imovel, "2026-12-31", 10))).toEqual([
      "2027-01-10", "2027-01-15",
    ]);

    const dia31 = await inserirPolitica(USUARIO_A, { nome: "Dia 31", dias: [31] });
    expect(datas(await previa(USUARIO_A, dia31, imovel, "2027-01-31", 31))).toEqual([
      "2027-02-28", "2027-03-05",
    ]);
    const dia29 = await inserirPolitica(USUARIO_A, { nome: "Bissexto", dias: [29] });
    expect(datas(await previa(USUARIO_A, dia29, imovel, "2028-01-10", 29))).toEqual([
      "2028-02-29", "2028-03-05",
    ]);
    const dia30 = await inserirPolitica(USUARIO_A, { nome: "Dia 30", dias: [30] });
    expect(datas(await previa(USUARIO_A, dia30, imovel, "2027-01-10", 30))).toEqual([
      "2027-02-28", "2027-03-05",
    ]);
  });

  it("rejeita vencimentos inválidos ou repetidos também no banco", async () => {
    await expect(inserirPolitica(USUARIO_A, { nome: "Duplicada", dias: [10, 10] }))
      .rejects.toThrow();
    await expect(inserirPolitica(USUARIO_A, { nome: "Inválida", dias: [32] }))
      .rejects.toThrow();
  });

  it("conta dias úteis e ajusta fins de semana sem inventar feriados", async () => {
    const imovel = await inserirImovel();
    const uteis = await inserirPolitica(USUARIO_A, {
      nome: "Um dia útil",
      prazo: "apos_locacao",
      quantidade: 1,
      contagem: "uteis",
    });
    expect(datas(await previa(USUARIO_A, uteis, imovel, "2026-07-03", 10))[1]).toBe("2026-07-06");

    const ajustar = await inserirPolitica(USUARIO_A, {
      nome: "Ajuste de sábado",
      ajuste: "proximo_dia_util",
    });
    expect(datas(await previa(USUARIO_A, ajustar, imovel, "2026-07-06", 10))[1]).toBe("2026-08-17");
  });

  it("é idempotente no retry e permite novo repasse em outro ciclo legítimo", async () => {
    const politica = await inserirPolitica(USUARIO_A);
    const imovel = await inserirImovel();
    const operacao = randomUUID();
    const itens = JSON.stringify([{ imovel_id: imovel, data_locacao: "2026-07-06", dia_vencimento: 10 }]);

    const primeira = await comoUsuario<{ resultado: Json }>(USUARIO_A,
      "select public.locar_imoveis_em_lote($1, $2, $3::jsonb) as resultado", [operacao, politica, itens]);
    const retry = await comoUsuario<{ resultado: Json }>(USUARIO_A,
      "select public.locar_imoveis_em_lote($1, $2, $3::jsonb) as resultado", [operacao, politica, itens]);
    expect(primeira.rows[0].resultado.ok).toBe(true);
    expect(retry.rows[0].resultado.repetida).toBe(true);
    expect((await db.query<{ total: number }>("select count(*)::int as total from public.repasses where imovel_id = $1", [imovel])).rows[0].total).toBe(1);

    await db.query("update public.imoveis set status = 'Publicado' where id = $1", [imovel]);
    const segunda = await comoUsuario<{ resultado: Json }>(USUARIO_A,
      "select public.locar_imoveis_em_lote($1, $2, $3::jsonb) as resultado",
      [randomUUID(), politica, JSON.stringify([{ imovel_id: imovel, data_locacao: "2027-02-01", dia_vencimento: 20 }])]);
    expect(segunda.rows[0].resultado.ok).toBe(true);
    const ciclos = await db.query<{ numero_ciclo: number }>(
      "select numero_ciclo from public.locacoes where imovel_id = $1 order by numero_ciclo", [imovel]);
    expect(ciclos.rows.map((linha) => linha.numero_ciclo)).toEqual([1, 2]);
  });

  it("faz rollback do lote inválido e nega imóvel de outro tenant", async () => {
    const politica = await inserirPolitica(USUARIO_A);
    const proprio = await inserirImovel(USUARIO_A);
    const alheio = await inserirImovel(USUARIO_B);
    const antes = await db.query<{ status: string }>("select status from public.imoveis where id = $1", [proprio]);
    const resultado = await comoUsuario<{ resultado: Json }>(
      USUARIO_A,
      "select public.locar_imoveis_em_lote($1, $2, $3::jsonb) as resultado",
      [randomUUID(), politica, JSON.stringify([
        { imovel_id: proprio, data_locacao: "2026-09-08", dia_vencimento: 10 },
        { imovel_id: alheio, data_locacao: "2026-09-08", dia_vencimento: 10 },
      ])],
    );
    expect(resultado.rows[0].resultado.ok).toBe(false);
    expect((resultado.rows[0].resultado.erros as Json[])[0].codigo).toBe("imovel_indisponivel");
    expect((await db.query<{ status: string }>("select status from public.imoveis where id = $1", [proprio])).rows[0].status)
      .toBe(antes.rows[0].status);
    expect((await db.query<{ total: number }>("select count(*)::int as total from public.repasses where imovel_id = $1", [proprio])).rows[0].total)
      .toBe(0);
  });

  it("não transforma imóvel retirado em locação da imobiliária", async () => {
    const politica = await inserirPolitica(USUARIO_A);
    const imovel = await inserirImovel();
    await db.query("update public.imoveis set retirado = true where id = $1", [imovel]);
    const resultado = await comoUsuario<{ resultado: Json }>(USUARIO_A,
      "select public.locar_imoveis_em_lote($1, $2, $3::jsonb) as resultado",
      [randomUUID(), politica, JSON.stringify([{ imovel_id: imovel, data_locacao: "2026-09-08", dia_vencimento: 10 }])]);
    expect(resultado.rows[0].resultado.ok).toBe(false);
    expect((resultado.rows[0].resultado.erros as Json[])[0].codigo).toBe("imovel_retirado");
    expect((await db.query<{ total: number }>("select count(*)::int as total from public.repasses where imovel_id = $1", [imovel])).rows[0].total)
      .toBe(0);
  });

  it("mantém snapshot e datas históricas quando a política muda", async () => {
    const politica = await inserirPolitica(USUARIO_A, { nome: "Histórica" });
    const imovel = await inserirImovel();
    await comoUsuario(USUARIO_A,
      "select public.locar_imoveis_em_lote($1, $2, $3::jsonb)",
      [randomUUID(), politica, JSON.stringify([{ imovel_id: imovel, data_locacao: "2026-07-06", dia_vencimento: 10 }])]);
    await db.query("update public.politicas_repasse set quantidade_dias = 7, nome = 'Nova regra' where id = $1", [politica]);
    const repasse = await db.query<{ data_prevista: string; politica_snapshot: Json }>(
      "select data_prevista::text, politica_snapshot from public.repasses where imovel_id = $1", [imovel]);
    expect(repasse.rows[0].data_prevista).toBe("2026-08-15");
    expect(repasse.rows[0].politica_snapshot).toMatchObject({ politica_nome: "Histórica", quantidade_dias: 5 });
    await expect(db.query("update public.repasses set data_prevista = '2026-08-17' where imovel_id = $1", [imovel]))
      .rejects.toThrow(/imutáveis/);
  });

  it("recebe vários repasses atomicamente, preserva a data real e aceita retry", async () => {
    const politica = await inserirPolitica(USUARIO_A);
    const imoveis = [await inserirImovel(), await inserirImovel()];
    await comoUsuario(USUARIO_A,
      "select public.locar_imoveis_em_lote($1, $2, $3::jsonb)",
      [randomUUID(), politica, JSON.stringify(imoveis.map((id, indice) => ({
        imovel_id: id, data_locacao: `2026-09-0${indice + 2}`, dia_vencimento: 10,
      })))]);
    const ids = (await db.query<{ id: string }>("select id from public.repasses where imovel_id = any($1::uuid[]) order by id", [imoveis]))
      .rows.map((linha) => linha.id);
    const operacao = randomUUID();
    const recebido = await comoUsuario<{ resultado: Json }>(USUARIO_A,
      "select public.receber_repasses_em_lote($1, $2::uuid[], $3::date) as resultado",
      [operacao, ids, "2026-10-15"]);
    const retry = await comoUsuario<{ resultado: Json }>(USUARIO_A,
      "select public.receber_repasses_em_lote($1, $2::uuid[], $3::date) as resultado",
      [operacao, ids, "2026-10-15"]);
    expect(recebido.rows[0].resultado).toMatchObject({ ok: true, total_recebidos: 2 });
    expect(retry.rows[0].resultado).toMatchObject({ ok: true, repetida: true });
    const linhas = await db.query<{ status: string; data_recebimento: string }>(
      "select status, data_recebimento::text from public.repasses where id = any($1::uuid[])", [ids]);
    expect(linhas.rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ status: "recebido", data_recebimento: "2026-10-15" }),
      expect.objectContaining({ status: "recebido", data_recebimento: "2026-10-15" }),
    ]));

    const outroImovel = await inserirImovel();
    await db.query("update public.imoveis set status = 'Publicado' where id = $1", [outroImovel]);
    await comoUsuario(USUARIO_A,
      "select public.locar_imoveis_em_lote($1, $2, $3::jsonb)",
      [randomUUID(), politica, JSON.stringify([{ imovel_id: outroImovel, data_locacao: "2026-09-04", dia_vencimento: 10 }])]);
    const outroId = (await db.query<{ id: string }>("select id from public.repasses where imovel_id = $1", [outroImovel])).rows[0].id;
    const reutilizada = await comoUsuario<{ resultado: Json }>(USUARIO_A,
      "select public.receber_repasses_em_lote($1, $2::uuid[], $3::date) as resultado",
      [operacao, [outroId], "2026-10-16"]);
    expect(reutilizada.rows[0].resultado).toMatchObject({ ok: false });
    expect((reutilizada.rows[0].resultado.erros as Json[])[0].codigo).toBe("operacao_reutilizada");
    expect((await db.query<{ status: string }>("select status from public.repasses where id = $1", [outroId])).rows[0].status)
      .toBe("pendente");
  });

  it("aplica RLS nas leituras e bloqueia escrita direta do ledger", async () => {
    const politicaB = await inserirPolitica(USUARIO_B);
    const imovelB = await inserirImovel(USUARIO_B);
    await comoUsuario(USUARIO_B,
      "select public.locar_imoveis_em_lote($1, $2, $3::jsonb)",
      [randomUUID(), politicaB, JSON.stringify([{ imovel_id: imovelB, data_locacao: "2026-09-08", dia_vencimento: 10 }])]);

    const visiveis = await comoUsuario<{ user_id: string }>(USUARIO_A, "select user_id from public.repasses");
    expect(visiveis.rows.every((linha) => linha.user_id === USUARIO_A)).toBe(true);
    await expect(comoUsuario(USUARIO_A,
      "insert into public.locacoes (user_id, imovel_id, operacao_id, numero_ciclo, data_locacao, primeiro_vencimento, criado_por) values ($1, $2, $3, 1, current_date, current_date, $1)",
      [USUARIO_A, await inserirImovel(), randomUUID()],
    )).rejects.toThrow(/permission denied/i);
  });
});
