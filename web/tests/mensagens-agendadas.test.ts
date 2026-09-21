import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { dataHoraLocalParaIso, timestampDeIso } from "@/lib/datas";
import {
  fromDbMensagem,
  imoveisComAgendamentoAtivo,
  telefoneValido,
  type MensagemAgendada,
} from "@/lib/mensagensAgendadas";

describe("mensagens agendadas", () => {
  it("aceita celulares e fixos brasileiros formatados", () => {
    expect(telefoneValido("(43) 99802-4316")).toBe(true);
    expect(telefoneValido("+55 43 3322-1100")).toBe(true);
    expect(telefoneValido("123")).toBe(false);
  });

  it("converte data e horário local para timestamptz válido", () => {
    const iso = dataHoraLocalParaIso("2026-08-15", "09:00");
    expect(iso).toBeTruthy();
    expect(timestampDeIso(iso)).toBeTypeOf("number");
    expect(dataHoraLocalParaIso("", "09:00")).toBeNull();
  });

  it("mapeia o registro do Supabase sem perder status e envio real", () => {
    const item = fromDbMensagem({ id: "m1", user_id: "u1", imovel_id: "i1",
      nome_proprietario: "João", telefone: "43998024316", mensagem: "Olá",
      data_envio: "2026-08-15T12:00:00.000Z", status: "enviada",
      enviado_em: "2026-08-15T12:00:02.000Z", erro: null });
    expect(item).toMatchObject({
      id: "m1",
      userId: "u1",
      imovelId: "i1",
      tipo: "livre",
      agendaId: null,
      status: "enviada",
      cancelamentoMotivo: null,
      cancelamentoOrigem: null,
      canceladaEm: null,
    });
    expect(item.enviadoEm).toBe("2026-08-15T12:00:02.000Z");
  });

  it("mapeia tipo, agenda e auditoria do cancelamento estruturados", () => {
    const item = fromDbMensagem({
      id: "m2", user_id: "u1", imovel_id: "i1",
      tipo: "verificacao-disponibilidade", agenda_id: "a1",
      nome_proprietario: "João", telefone: "43998024316", mensagem: "Olá",
      data_envio: "2026-08-15T12:00:00.000Z", status: "cancelada",
      enviado_em: null, erro: null,
      cancelamento_motivo: "disponibilidade-confirmada",
      cancelamento_origem: "worker",
      cancelada_em: "2026-08-14T12:00:00.000Z",
    });
    expect(item).toMatchObject({
      tipo: "verificacao-disponibilidade",
      agendaId: "a1",
      cancelamentoMotivo: "disponibilidade-confirmada",
      cancelamentoOrigem: "worker",
      canceladaEm: "2026-08-14T12:00:00.000Z",
    });
  });
});

describe("imoveisComAgendamentoAtivo", () => {
  const base: MensagemAgendada = {
    id: "m1",
    userId: "u1",
    imovelId: "i1",
    tipo: "livre",
    agendaId: null,
    nomeProprietario: "Ana",
    telefone: "43999999999",
    mensagem: "Olá",
    dataEnvio: "2026-08-26T10:00:00",
    status: "agendada",
    enviadoEm: null,
    erro: null,
    cancelamentoMotivo: null,
    cancelamentoOrigem: null,
    canceladaEm: null,
    imoveisConsultados: null,
    consolidadaEmMensagemId: null,
    reagendadaEm: null,
    reagendamentoMotivo: null,
    dataEnvioOriginal: null,
  };

  it("conta conversas únicas com itens agendados ou processando", () => {
    const ids = imoveisComAgendamentoAtivo([
      base,
      { ...base, id: "m2" },
      { ...base, id: "m3", imovelId: "i2", status: "processando" },
      { ...base, id: "m4", imovelId: "i3", status: "erro" },
      { ...base, id: "m5", imovelId: null },
    ]);
    expect([...ids]).toEqual(["i1", "i2"]);
  });
});
const SCHEMA = readFileSync(new URL("../../supabase-schema.sql", import.meta.url), "utf8");
const VERCEL = readFileSync(new URL("../vercel.json", import.meta.url), "utf8");
const WORKER = readFileSync(new URL("../app/api/cron/mensagens/route.ts", import.meta.url), "utf8");
const MIGRATION_M1 = readFileSync(
  new URL("../../supabase/migrations/20260917140326_modelo_mensagens_disponibilidade.sql", import.meta.url),
  "utf8",
);
const MODAL_INDIVIDUAL = readFileSync(new URL("../components/modais/ModalMensagemAgendada.tsx", import.meta.url), "utf8");
const MODAL_LOTE = readFileSync(new URL("../components/modais/ModalMensagemDisponibilidadeLote.tsx", import.meta.url), "utf8");
const MODAL_OVERLAY = readFileSync(new URL("../components/modais/ModalOverlay.tsx", import.meta.url), "utf8");
const UI_MODAL = readFileSync(new URL("../lib/uiModal.ts", import.meta.url), "utf8");
const VIEW = readFileSync(new URL("../components/mensagens/MensagensAgendadasView.tsx", import.meta.url), "utf8");
const WEBHOOK = readFileSync(new URL("../app/api/whatsapp/webhook/[[...segredo]]/route.ts", import.meta.url), "utf8");
const BACKFILL = readFileSync(new URL("../../scripts/listar-backfill-mensagens-disponibilidade.ts", import.meta.url), "utf8");

describe("M1 — modelo das mensagens de disponibilidade", () => {
  it.each([["schema canônico", SCHEMA], ["migration", MIGRATION_M1]])(
    "%s declara tipo, agenda opcional e cancelamento auditável",
    (_, sql) => {
      expect(sql).toContain("tipo text not null default 'livre'");
      expect(sql).toContain("'verificacao-disponibilidade'");
      expect(sql).toContain("agenda_id uuid");
      expect(sql).toContain("cancelamento_motivo text");
      expect(sql).toContain("cancelamento_origem text");
      expect(sql).toContain("cancelada_em timestamptz");
      expect(sql).toContain("mensagens_agendadas_disponibilidade_pendente_idx");
    },
  );

  it("preserva linhas antigas como livres e não faz backfill por texto", () => {
    expect(MIGRATION_M1).not.toMatch(/update\s+public\.mensagens_agendadas\s+set/i);
    expect(MIGRATION_M1).not.toContain("Olá, o imóvel ainda está disponível?");
    expect(MIGRATION_M1).not.toMatch(/mensagem\s+(?:like|ilike)/i);
    expect(MIGRATION_M1).toContain("default 'livre'");
  });

  it("liga agenda e mensagem pela chave composta do mesmo usuário", () => {
    for (const sql of [SCHEMA, MIGRATION_M1]) {
      expect(sql).toContain("unique (id, user_id)");
      expect(sql).toMatch(/foreign key \(agenda_id, user_id\)[\s\S]+references public\.agenda \(id, user_id\)/);
      expect(sql).toContain("on delete set null (agenda_id)");
      expect(sql).toMatch(/agenda_id is null[\s\S]+a\.user_id = \(select auth\.uid\(\)\)/);
    }
  });

  it("os dois fluxos de disponibilidade persistem tipo e agenda; o fluxo genérico nasce livre", () => {
    expect(MODAL_INDIVIDUAL).toContain('tipoInicial = "livre"');
    expect(MODAL_INDIVIDUAL).toContain("tipo: tipoInicial");
    expect(MODAL_INDIVIDUAL).toContain("agenda_id: agendaIdRelacionado ?? null");
    expect(MODAL_OVERLAY).toContain('"verificacao-disponibilidade"');
    expect(UI_MODAL).toContain("agendaIdMensagemAgendada: agendaId");
    expect(MODAL_LOTE).toContain('tipo: "verificacao-disponibilidade"');
    expect(MODAL_LOTE).toContain("agenda_id: compromisso.id");
  });

  it("o cancelamento manual atual continua disponível e passa a ser auditado", () => {
    expect(VIEW).toContain('cancelamento_motivo: "usuario"');
    expect(VIEW).toContain('cancelamento_origem: "usuario"');
    expect(VIEW).toContain("cancelada_em: canceladaEm");
    expect(MIGRATION_M1).toContain("cancelamento_motivo = 'usuario'");
    expect(MIGRATION_M1).toContain("cancelamento_origem = 'usuario'");
  });

  it("a confirmação determinística de visita ganha motivo próprio sem promover a classificação da IA", () => {
    const insercao = WEBHOOK.slice(WEBHOOK.indexOf("const agendaId = crypto.randomUUID()"), WEBHOOK.indexOf("if (erroAgenda)"));
    expect(insercao).toContain("reason_code: visitaConfirmada");
    expect(insercao).toContain('"visita_confirmada_pelo_proprietario"');
    expect(insercao).toContain(': "prazo_combinado_na_resposta"');
  });

  it("a listagem de backfill é somente leitura, tenant-scoped e exige os três sinais fortes", () => {
    expect(BACKFILL).toContain('startsWith("--user-id=")');
    expect(BACKFILL).toContain('user_id: `eq.${USUARIO_ID}`');
    expect(BACKFILL).toContain("is_verificacao_disponibilidade");
    expect(BACKFILL).toContain("mensagem.mensagem !== textoFollowUp(base, imovel)");
    expect(BACKFILL).toContain(">= 2");
    expect(BACKFILL).not.toMatch(/method:\s*["'](?:POST|PATCH|PUT|DELETE)["']/);
    expect(BACKFILL).not.toMatch(/console\.log\([^)]*(?:mensagem|telefone|proprietario)/i);
  });

  /* Até o M2 o worker não conhecia o tipo da mensagem (a guarda antiga
     exigia isso). O M3 é o checkpoint em que a decisão de envio passa a
     depender dele; o que continua proibido é o worker escrever a auditoria
     de cancelamento por conta própria: a mutação é sempre a RPC do M4. */
  it("o worker reavalia só as verificações de disponibilidade e nunca grava cancelamento à mão", () => {
    expect(WORKER).toContain('item.tipo === "verificacao-disponibilidade"');
    expect(WORKER).toContain("revalidarVerificacaoDisponibilidade");
    expect(WORKER).toContain("aplicarDecisaoNoBanco");
    expect(WORKER).not.toContain("cancelamento_motivo");
    expect(WORKER).not.toMatch(/status:\s*"cancelada"/);
  });
});

describe("executor de mensagens agendadas", () => {
  it("vence mensagens antigas antes de obter o lote", () => {
    expect(SCHEMA).toContain("erro = 'janela-expirada'");
    expect(SCHEMA).toContain("data_envio < now() - interval '10 minutes'");
    expect(SCHEMA).toContain("data_envio >= now() - interval '10 minutes'");
  });

  it("usa o relogio do Supabase sem recolocar o Cron incompativel na Vercel Hobby", () => {
    expect(SCHEMA).toContain("'processar-mensagens-agendadas'");
    expect(SCHEMA).toContain("'* * * * *'");
    expect(SCHEMA).toContain("mensagens_cron_secret");
    expect(VERCEL).not.toContain("/api/cron/mensagens");
  });

  it("nao expoe a configuracao do Cron a usuarios do Data API", () => {
    expect(SCHEMA).toContain(
      "revoke all on function configurar_cron_mensagens(text, text) from public, anon, authenticated",
    );
    expect(SCHEMA).toContain(
      "grant execute on function configurar_cron_mensagens(text, text) to service_role",
    );
  });
});

describe("claim_mensagens_agendadas vence linhas presas em processando", () => {
  const MIGRATION = readFileSync(
    new URL("../../supabase/migrations/20260913143812_claim_mensagens_vence_processando_orfas.sql", import.meta.url),
    "utf8",
  );

  it.each([["schema canônico", SCHEMA], ["migration", MIGRATION]])("no %s, órfã vira erro e nunca volta à fila", (_, bruto) => {
    const sql = bruto.replace(/public./g, "");
    const funcao = sql.slice(sql.indexOf("function claim_mensagens_agendadas"), sql.indexOf("grant execute on function claim_mensagens_agendadas"));
    expect(funcao).toContain("erro = 'processamento-interrompido'");
    expect(funcao).toMatch(/where status = 'processando'\s+and updated_at < now\(\) - interval '10 minutes'/);
    // O worker vive no máximo 300 s (maxDuration); dez minutos após o claim ele já morreu.
    expect(WORKER).toContain("export const maxDuration = 300;");
    expect(funcao).not.toMatch(/set status = 'agendada'/);
  });

  it("a migration e o schema canônico definem o mesmo claim", () => {
    const corpo = (sql: string) => sql
      .slice(sql.indexOf("as $$"), sql.indexOf("$$;", sql.indexOf("as $$")))
      .replace(/\s+/g, " ");
    expect(corpo(MIGRATION)).toBe(corpo(SCHEMA.slice(SCHEMA.indexOf("function claim_mensagens_agendadas"))));
  });
});
