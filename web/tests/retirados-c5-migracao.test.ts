/* ================================================================
   RETIRADOS, FASE C / C5: MIGRAÇÃO DE PERDIDOS ANTIGOS DE IMÓVEIS CAPTADOS

   Executa o script SQL real (`supabase/scripts/retirados-c5-migrar-perdidos-captados.sql`)
   dentro de um Postgres real em memória (PGlite), com:
   - a tabela `public.imoveis`,
   - todas as 4 constraints CHECK e o trigger `trg_retirada_dados_imovel` (C1),
   - o trigger real `trg_imoveis_status_history` (`proteger_status_history_imovel`),
   - a tabela `auth.users` com duas contas distintas (isolamento por user_id).

   Valida:
   - todos os cenários do inventário real (Publicado, Angariado direto, histórico
     com recuperação anterior, Cancelado no meio, desistência, indisponível,
     motivo locado fora);
   - preservação de leads não captados, retirados antigos, Locado/Cancelado e
     imóveis de outra conta;
   - idempotência na 2ª execução;
   - reativação automática do trigger `trg_imoveis_status_history`;
   - comportamento fail-closed para e-mail inexistente;
   - leitura limpa dos registros migrados pelo `fromDbImovel`, `filtrarImoveis`,
     `podeReativarNaCarteira` e `relatorioRetirados`.
   ================================================================ */
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { describe, expect, it } from "vitest";

import { filtrarImoveis, filtrosPipelineVazios, pipelineColFiltersVazios } from "@/lib/calculo/filtros";
import { relatorioRetirados } from "@/lib/calculo/relatorioRetirados";
import { podeReativarNaCarteira } from "@/lib/calculo/retiradaCarteira";
import { fromDbImovel, type DbImovelRow } from "@/lib/persistencia/mapeadores";

function ler(relativo: string): string {
  return readFileSync(new URL(relativo, import.meta.url), "utf8").replace(/\r\n/g, "\n");
}

const SCRIPT_C5 = ler("../../supabase/scripts/retirados-c5-migrar-perdidos-captados.sql");
const MIGRATION_C1 = ler("../../supabase/migrations/20261002210000_retirada_data_motivo.sql");
const SCHEMA_COMPLETO = ler("../../supabase-schema.sql");

function extrairBlocoStatusHistoryTrigger(): string {
  const inicio = SCHEMA_COMPLETO.indexOf("create or replace function proteger_status_history_imovel()");
  const fim = SCHEMA_COMPLETO.indexOf("-- Atualiza updated_at automaticamente nos imóveis", inicio);
  expect(inicio).toBeGreaterThan(-1);
  expect(fim).toBeGreaterThan(inicio);
  return SCHEMA_COMPLETO.slice(inicio, fim);
}

const CONTA_ALVO = "11111111-1111-4111-8111-111111111111";
const OUTRA_CONTA = "22222222-2222-4222-8222-222222222222";
const EMAIL_ALVO = "corretor-alvo@teste.invalid";

async function criarBancoPglite(): Promise<PGlite> {
  const db = new PGlite();
  await db.exec(`
    create schema if not exists auth;
    create schema if not exists private;
    create or replace function auth.uid() returns uuid language sql stable as $$ select null::uuid $$;

    create table auth.users (
      id uuid primary key,
      email text not null
    );
    insert into auth.users (id, email) values
      ('${CONTA_ALVO}', '${EMAIL_ALVO}'),
      ('${OUTRA_CONTA}', 'outro@teste.invalid');

    create table public.imoveis (
      id uuid primary key,
      user_id uuid not null,
      codigo text,
      referencia_crm text,
      endereco text not null default '',
      bairro text not null default '',
      cidade text not null default '',
      tipo text not null default 'Apartamento',
      status text not null,
      retirado boolean not null default false,
      motivo_perda text,
      motivo_perda_outro text,
      status_history jsonb not null default '[]'::jsonb,
      notas jsonb not null default '[]'::jsonb,
      tentativas jsonb not null default '[]'::jsonb,
      data_angariacao date,
      updated_at timestamptz not null default now()
    );
  `);

  // Aplica a migration C1 real (colunas, 4 CHECKs e trg_retirada_dados_imovel)
  // sem os `revoke ... from authenticated` (role inexistente no PGlite nu).
  const c1Adaptada = MIGRATION_C1.replace(/revoke all on function [^\n]+;/gi, "");
  await db.exec(c1Adaptada);

  // Aplica o trigger real de proteção de status_history.
  await db.exec(extrairBlocoStatusHistoryTrigger());

  return db;
}

function sqlMigracaoPara(email: string): string {
  return SCRIPT_C5.replaceAll("SEU_EMAIL_AQUI", email);
}

describe("Retirados C5 — script SQL contra Postgres real (PGlite)", () => {
  it("migra exatamente os imóveis captados e perdidos da conta alvo, preservando histórico, datas, motivos e isolamento", async () => {
    const db = await criarBancoPglite();

    await db.exec(`
      insert into public.imoveis (id, user_id, codigo, referencia_crm, endereco, status, retirado, motivo_perda, motivo_perda_outro, status_history, notas)
      values
        -- 1. Publicado -> Perdido (locado fora) — caso mais comum (25 dos 29)
        ('00000000-0000-4000-8000-000000000001', '${CONTA_ALVO}', 'LD-426', '05112.001', 'Rua A, 1', 'Perdido', false,
         'Angariado, mas locado por outra imobiliária ou pelo proprietário', null,
         '[{"status":"Novo contato","date":"2026-10-22"},{"status":"Angariado","date":"2026-10-26"},{"status":"Publicado","date":"2026-10-27"},{"status":"Perdido","date":"2026-11-23"}]'::jsonb,
         '[]'::jsonb),

        -- 2. Angariado -> Perdido direto (4 dos 29)
        ('00000000-0000-4000-8000-000000000002', '${CONTA_ALVO}', 'LD-55', null, 'Rua B, 2', 'Perdido', false,
         'Angariado, mas locado por outra imobiliária ou pelo proprietário', null,
         '[{"status":"Novo contato","date":"2026-07-14"},{"status":"Angariado","date":"2026-11-03"},{"status":"Perdido","date":"2026-11-13"}]'::jsonb,
         '[]'::jsonb),

        -- 3. Histórico com recuperação prévia (Perdido antigo -> Angariado -> Publicado -> Perdido final)
        ('00000000-0000-4000-8000-000000000003', '${CONTA_ALVO}', 'LD-152', '04047.001', 'Rua C, 3', 'Perdido', false,
         'Angariado, mas locado por outra imobiliária ou pelo proprietário', null,
         '[{"status":"Novo contato","date":"2026-07-24"},{"status":"Perdido","date":"2026-08-25"},{"status":"Angariado","date":"2026-08-25"},{"status":"Publicado","date":"2026-08-25"},{"status":"Perdido","date":"2026-10-02"}]'::jsonb,
         '[]'::jsonb),

        -- 4. Desistiu de alugar
        ('00000000-0000-4000-8000-000000000004', '${CONTA_ALVO}', 'LD-250', '04041.001', 'Rua D, 4', 'Perdido', false,
         'Proprietário desistiu de alugar', null,
         '[{"status":"Novo contato","date":"2026-08-21"},{"status":"Angariado","date":"2026-08-21"},{"status":"Publicado","date":"2026-08-24"},{"status":"Perdido","date":"2026-11-06"}]'::jsonb,
         '[]'::jsonb),

        -- 5. Cancelado no meio -> Publicado -> Perdido (Imóvel não está mais disponível)
        ('00000000-0000-4000-8000-000000000005', '${CONTA_ALVO}', 'LD-156', '03620.001', 'Rua E, 5', 'Perdido', false,
         'Imóvel não está mais disponível', null,
         '[{"status":"Novo contato","date":"2026-07-27"},{"status":"Angariado","date":"2026-07-28"},{"status":"Publicado","date":"2026-08-10"},{"status":"Cancelado","date":"2026-08-11"},{"status":"Publicado","date":"2026-08-15"},{"status":"Perdido","date":"2026-09-18"}]'::jsonb,
         '[]'::jsonb),

        -- 6. Lead NUNCA angariado e Perdido -> NÃO PODE MIGRAR
        ('00000000-0000-4000-8000-000000000006', '${CONTA_ALVO}', 'LD-LEAD', null, 'Rua F, 6', 'Perdido', false,
         'Imóvel já alugado por conta própria', null,
         '[{"status":"Novo contato","date":"2026-09-01"},{"status":"Perdido","date":"2026-09-05"}]'::jsonb,
         '[]'::jsonb),

        -- 7. Já retirado antigo (sem data nem motivo) -> NÃO PODE SER ALTERADO
        ('00000000-0000-4000-8000-000000000007', '${CONTA_ALVO}', 'LD-RET-ANTIGO', '09999.001', 'Rua G, 7', 'Publicado', true,
         null, null,
         '[{"status":"Novo contato","date":"2026-06-01"},{"status":"Angariado","date":"2026-06-02"},{"status":"Publicado","date":"2026-06-03"}]'::jsonb,
         '[]'::jsonb),

        -- 8. Imóvel angariado e Perdido de OUTRA CONTA -> NÃO PODE SER TOCADO
        ('00000000-0000-4000-8000-000000000008', '${OUTRA_CONTA}', 'LD-OUTRA', '08888.001', 'Rua H, 8', 'Perdido', false,
         'Angariado, mas locado por outra imobiliária ou pelo proprietário', null,
         '[{"status":"Novo contato","date":"2026-08-01"},{"status":"Angariado","date":"2026-08-05"},{"status":"Publicado","date":"2026-08-06"},{"status":"Perdido","date":"2026-09-01"}]'::jsonb,
         '[]'::jsonb);
    `);

    // Executa o PASSO 2 real do script
    await db.exec(sqlMigracaoPara(EMAIL_ALVO));

    const { rows } = await db.query<Record<string, unknown>>(`
      select codigo, user_id, status, retirado, retirado_em::text as retirado_em,
             retirado_motivo, retirado_observacao, motivo_perda, motivo_perda_outro,
             status_history, notas
      from public.imoveis
      order by id
    `);
    const porCodigo = Object.fromEntries(rows.map((r) => [String(r.codigo), r]));

    // 1. LD-426: Publicado restaurado, data preservada, observação fiel, histórico sem Perdido final
    expect(porCodigo["LD-426"]).toMatchObject({
      status: "Publicado",
      retirado: true,
      retirado_em: "2026-11-23",
      retirado_motivo: "outro",
      retirado_observacao: "Locado por outra imobiliária ou pelo proprietário (migrado de Perdido)",
      motivo_perda: null,
      motivo_perda_outro: null,
    });
    expect(porCodigo["LD-426"].status_history).toEqual([
      { status: "Novo contato", date: "2026-10-22" },
      { status: "Angariado", date: "2026-10-26" },
      { status: "Publicado", date: "2026-10-27" },
    ]);
    expect((porCodigo["LD-426"].notas as Array<{ id: string; texto: string }>)).toHaveLength(1);
    expect((porCodigo["LD-426"].notas as Array<{ id: string; texto: string }>)[0].id).toBe("c5:migracao-retirado");
    expect((porCodigo["LD-426"].notas as Array<{ id: string; texto: string }>)[0].texto).toContain("23/11/2026");

    // 2. LD-55: Angariado restaurado
    expect(porCodigo["LD-55"]).toMatchObject({
      status: "Angariado",
      retirado: true,
      retirado_em: "2026-11-13",
      retirado_motivo: "outro",
      motivo_perda: null,
    });
    expect(porCodigo["LD-55"].status_history).toEqual([
      { status: "Novo contato", date: "2026-07-14" },
      { status: "Angariado", date: "2026-11-03" },
    ]);

    // 3. LD-152: remove somente o ÚLTIMO Perdido, preservando a recuperação anterior
    expect(porCodigo["LD-152"]).toMatchObject({
      status: "Publicado",
      retirado: true,
      retirado_em: "2026-10-02",
    });
    expect(porCodigo["LD-152"].status_history).toEqual([
      { status: "Novo contato", date: "2026-07-24" },
      { status: "Perdido", date: "2026-08-25" },
      { status: "Angariado", date: "2026-08-25" },
      { status: "Publicado", date: "2026-08-25" },
    ]);

    // 4. LD-250: desistiu
    expect(porCodigo["LD-250"]).toMatchObject({
      status: "Publicado",
      retirado: true,
      retirado_em: "2026-11-06",
      retirado_motivo: "desistiu",
      retirado_observacao: null,
      motivo_perda: null,
    });

    // 5. LD-156: indisponível
    expect(porCodigo["LD-156"]).toMatchObject({
      status: "Publicado",
      retirado: true,
      retirado_em: "2026-09-18",
      retirado_motivo: "outro",
      retirado_observacao: "Imóvel não está mais disponível",
      motivo_perda: null,
    });

    // 6. Lead não captado -> intocado
    expect(porCodigo["LD-LEAD"]).toMatchObject({
      status: "Perdido",
      retirado: false,
      retirado_em: null,
      retirado_motivo: null,
      motivo_perda: "Imóvel já alugado por conta própria",
    });

    // 7. Já retirado antigo -> intocado (sem data fabricada!)
    expect(porCodigo["LD-RET-ANTIGO"]).toMatchObject({
      status: "Publicado",
      retirado: true,
      retirado_em: null,
      retirado_motivo: null,
      retirado_observacao: null,
    });
    expect(porCodigo["LD-RET-ANTIGO"].notas).toEqual([]);

    // 8. Outra conta -> 100% intocada!
    expect(porCodigo["LD-OUTRA"]).toMatchObject({
      status: "Perdido",
      retirado: false,
      retirado_em: null,
      retirado_motivo: null,
      motivo_perda: "Angariado, mas locado por outra imobiliária ou pelo proprietário",
    });

    // Idempotência: rodar de novo não altera nada nem duplica nota
    await db.exec(sqlMigracaoPara(EMAIL_ALVO));
    const { rows: posSegunda } = await db.query<{ notas: unknown[] }>(
      `select notas from public.imoveis where codigo = 'LD-426'`,
    );
    expect(posSegunda[0].notas).toHaveLength(1);

    // Trigger trg_imoveis_status_history foi reabilitado e voltou a proteger transições
    const { rows: trig } = await db.query<{ tgenabled: string }>(
      `select tgenabled from pg_trigger where tgname = 'trg_imoveis_status_history' and not tgisinternal`,
    );
    expect(trig[0].tgenabled).toBe("O");

    await db.exec(`update public.imoveis set status = 'Angariado' where codigo = 'LD-LEAD'`);
    const { rows: leadAtualizado } = await db.query<{ status_history: Array<{ status: string }> }>(
      `select status_history from public.imoveis where codigo = 'LD-LEAD'`,
    );
    expect(leadAtualizado[0].status_history.at(-1)?.status).toBe("Angariado");

    // Compatibilidade total com o app (fromDbImovel, Pipeline Retirados, Reativação e Relatório C3)
    const daContaAlvo = rows
      .filter((r) => r.user_id === CONTA_ALVO)
      .map((r) =>
        fromDbImovel({
          ...(r as unknown as DbImovelRow),
          id: String(r.codigo),
          proprietario_nome: "",
          proprietario_telefone: "",
          valor_aluguel: 0,
        }),
      );
    const retiradosPipeline = filtrarImoveis(daContaAlvo, filtrosPipelineVazios(), "retirados", pipelineColFiltersVazios());
    expect(retiradosPipeline.map((i) => i.codigo).sort()).toEqual([
      "LD-152",
      "LD-156",
      "LD-250",
      "LD-426",
      "LD-55",
      "LD-RET-ANTIGO",
    ]);
    for (const imovel of retiradosPipeline) {
      expect(podeReativarNaCarteira(imovel)).toBe(true);
    }

    const rel = relatorioRetirados(daContaAlvo);
    expect(rel.total).toBe(6);
    expect(rel.semData).toBe(1); // apenas LD-RET-ANTIGO
    expect(rel.linhas[0]).toMatchObject({
      codigo: "LD-426",
      status: "Publicado",
      dataRetirada: "23/11/2026",
      motivo: "Outro",
      observacao: "Locado por outra imobiliária ou pelo proprietário (migrado de Perdido)",
    });

    await db.close();
  });

  it("aborta (fail-closed) quando o e-mail não corresponde a nenhuma conta, mantendo o trigger ativo", async () => {
    const db = await criarBancoPglite();
    await expect(db.exec(sqlMigracaoPara("nao-existe@teste.invalid"))).rejects.toThrow(/C5 abortada/);
    const { rows: trig } = await db.query<{ tgenabled: string }>(
      `select tgenabled from pg_trigger where tgname = 'trg_imoveis_status_history' and not tgisinternal`,
    );
    expect(trig[0].tgenabled).toBe("O");
    await db.close();
  });
});
