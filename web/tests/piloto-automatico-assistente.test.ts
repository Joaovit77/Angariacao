import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import AcaoAssistenteCard from "@/components/assistente/AcaoAssistenteCard";
import {
  executarAcaoAcompanhamento,
  FERRAMENTA_CRIAR_FOLLOWUP,
  FERRAMENTA_REGISTRAR_TENTATIVA,
  normalizarAcao,
} from "@/lib/servidor/assistente/acoes";
import {
  POLITICAS_ACOES_ASSISTENTE,
  POLITICAS_CRITICAS_ASSISTENTE,
} from "@/lib/assistente/politicas";

const ACAO_ID = "11111111-1111-4111-8111-111111111111";
const IMOVEL_ID = "22222222-2222-4222-8222-222222222222";
const AGENDA_ID = "33333333-3333-4333-8333-333333333333";
const SESSAO_ID = "44444444-4444-4444-8444-444444444444";

function base(tipo: string, estado: string, requerConfirmacao: boolean) {
  return {
    id: ACAO_ID,
    tipo,
    estado,
    expiraEm: requerConfirmacao ? "2099-08-27T15:15:00.000Z" : null,
    origem: "assistente",
    nivelAutonomia: requerConfirmacao ? "high" : "low",
    requerConfirmacao,
    motivo: {
      codigo: requerConfirmacao ? "tentativa_informada_usuario" : "followup_solicitado_usuario",
      descricao: requerConfirmacao
        ? "O usuário pediu explicitamente o registro desta tentativa."
        : "O usuário pediu explicitamente este acompanhamento.",
      dados: {},
    },
    entidade: {
      imovelId: IMOVEL_ID,
      codigo: "LD-152",
      endereco: "Rua Exemplo, 10",
      responsavel: "Marina",
      ...(tipo.includes("followup") ? { agendaId: AGENDA_ID } : {}),
    },
  };
}

function tentativa(estado = "ready_for_confirmation") {
  return {
    ...base("registrar_tentativa", estado, true),
    operacao: "Registrar tentativa de contato",
    impacto: "Uma tentativa real será adicionada ao histórico do imóvel após confirmação.",
    dados: {
      tentativaId: "55555555-5555-4555-8555-555555555555",
      canal: "WhatsApp",
      resultado: "sem-resposta",
      observacao: "Contato feito pelo corretor.",
    },
    resultado: estado === "succeeded"
      ? { tentativaId: "55555555-5555-4555-8555-555555555555", imovelId: IMOVEL_ID }
      : null,
  };
}

function followup() {
  return {
    ...base("criar_followup", "succeeded", false),
    operacao: "Criar follow-up",
    impacto: "Um follow-up interno será criado automaticamente na agenda.",
    dados: { titulo: "Follow-up — LD-152", data: "2099-08-31", hora: "10:00", tipo: "Follow-up", observacao: null },
    resultado: { agendaId: AGENDA_ID },
  };
}

describe("políticas determinísticas de autonomia", () => {
  it("mantém tentativas e mudanças de status atrás de confirmação", () => {
    expect(POLITICAS_ACOES_ASSISTENTE.registrar_tentativa).toMatchObject({ nivel: "high", modo: "confirmacao" });
    expect(POLITICAS_ACOES_ASSISTENTE.alterar_status_sem_resposta_em_lote).toMatchObject({ nivel: "high", modo: "confirmacao" });
  });

  it("limita a automação aos follow-ups internos reversíveis", () => {
    expect(POLITICAS_ACOES_ASSISTENTE.criar_followup).toMatchObject({ nivel: "low", modo: "automatico", reversivel: true });
    expect(POLITICAS_ACOES_ASSISTENTE.reagendar_followup).toMatchObject({ nivel: "low", modo: "automatico", reversivel: true });
    expect(POLITICAS_ACOES_ASSISTENTE.concluir_followup).toMatchObject({ nivel: "low", modo: "automatico", reversivel: true });
  });

  it("bloqueia operações críticas em vez de expô-las como ferramenta", () => {
    for (const politica of Object.values(POLITICAS_CRITICAS_ASSISTENTE)) {
      expect(politica).toMatchObject({ nivel: "critical", modo: "bloqueado" });
    }
  });
});

describe("contrato comum e execução das ações", () => {
  it("normaliza tentativa confirmável com autoria, política e motivo", () => {
    expect(normalizarAcao(tentativa())).toMatchObject({
      tipo: "registrar_tentativa",
      estado: "ready_for_confirmation",
      origem: "assistente",
      nivelAutonomia: "high",
      requerConfirmacao: true,
      motivo: { codigo: "tentativa_informada_usuario" },
      dados: { canal: "WhatsApp", resultado: "sem-resposta" },
    });
  });

  it("executa follow-up de baixo risco pela RPC fechada", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { ok: true, acao: followup() }, error: null });
    const resultado = await executarAcaoAcompanhamento(
      FERRAMENTA_CRIAR_FOLLOWUP,
      { imovel_id: IMOVEL_ID, imovel_codigo: null, data: "2099-08-31", hora: "10:00" },
      { rpc } as never,
      "usuario-1",
      { rota: "/assistente", pagina: "Assistente", superficie: "pagina" },
      SESSAO_ID,
    );

    expect(resultado).toMatchObject({
      dados: { executada: true, preparada: false, nivelAutonomia: "low", exigeConfirmacao: false },
      acao: { tipo: "criar_followup", estado: "succeeded" },
    });
    expect(rpc).toHaveBeenCalledWith("operar_acao_assistente_acompanhamento", expect.objectContaining({
      p_operacao: "criar_followup",
      p_imovel_id: IMOVEL_ID,
      p_data: "2099-08-31",
      p_sessao_id: SESSAO_ID,
    }));
  });

  it("prepara tentativa sem executar antes da confirmação", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { ok: true, acao: tentativa() }, error: null });
    const resultado = await executarAcaoAcompanhamento(
      FERRAMENTA_REGISTRAR_TENTATIVA,
      { imovel_id: IMOVEL_ID, imovel_codigo: null, canal: "WhatsApp", resultado: "sem-resposta", observacao: null },
      { rpc } as never,
      "usuario-1",
      { rota: "/assistente", pagina: "Assistente", superficie: "pagina" },
      SESSAO_ID,
    );
    expect(resultado).toMatchObject({ dados: { executada: false, preparada: true, exigeConfirmacao: true } });
  });

  it("reutiliza o mesmo card para ação automática e explica o motivo", () => {
    const acao = normalizarAcao(followup());
    expect(acao).not.toBeNull();
    const html = renderToStaticMarkup(createElement(AcaoAssistenteCard, {
      acao: acao!,
      processando: false,
      aoConfirmar: () => undefined,
      aoCancelar: () => undefined,
    }));
    expect(html).toContain("Follow-up criado");
    expect(html).toContain("O usuário pediu explicitamente este acompanhamento.");
    expect(html).not.toContain("Confirmar");
  });
});

describe("garantias estruturais no Supabase", () => {
  const schema = readFileSync(join(process.cwd(), "..", "supabase-schema.sql"), "utf8");
  const acompanhamento = schema.slice(
    schema.indexOf("create or replace function operar_acao_assistente_acompanhamento"),
    schema.indexOf("drop function if exists confirmar_acao_assistente"),
  );
  const confirmacao = schema.slice(
    schema.indexOf("create or replace function confirmar_acao_assistente"),
    schema.indexOf("create or replace function cancelar_acao_assistente"),
  );
  const evento = schema.slice(
    schema.indexOf("create or replace function processar_evento_resposta_acompanhamento"),
    schema.indexOf("revoke all on function preparar_acao_assistente_agendar_visita"),
  );

  it("grava a tentativa no histórico real somente dentro da confirmação", () => {
    expect(acompanhamento).toContain("v_acao_id, v_user, p_sessao_id, p_operacao, 'ready_for_confirmation'");
    expect(acompanhamento).not.toContain("set tentativas =");
    expect(confirmacao).toContain("set tentativas = v_tentativas || jsonb_build_array(v_tentativa)");
    expect(confirmacao).toContain("confirmed_by = v_user");
    expect(confirmacao).toContain("for update");
  });

  it("revalida usuário, imóvel, tipo e estado do follow-up na transação", () => {
    expect(acompanhamento).toContain("a.user_id = v_user");
    expect(acompanhamento).toContain("a.type = 'Follow-up'");
    expect(acompanhamento).toContain("a.done = false");
    expect(acompanhamento).toContain("i.id = p_imovel_id and i.user_id = v_user");
    expect(acompanhamento).toContain("coalesce(v_imovel.retirado, false)");
  });

  it("processa cada resposta uma vez e não afeta tarefa manual ou outro usuário", () => {
    expect(schema).toContain("create unique index if not exists assistente_acoes_evento_idempotente_idx");
    expect(evento).toContain("a.user_id = p_user_id");
    expect(evento).toContain("a.origin in ('assistente', 'automacao')");
    expect(evento).toContain("a.reason_code = 'aguardando_resposta'");
    expect(evento).toContain("a.done = false");
    expect(evento).not.toContain("mensagens_agendadas");
  });

  it("mantém a service role fora da confiança implícita e concede o mínimo", () => {
    expect(evento).toContain("auth.role() is distinct from 'service_role'");
    expect(schema).toContain("revoke all on function processar_evento_resposta_acompanhamento(uuid, uuid, text) from public, anon, authenticated");
    expect(schema).toContain("grant execute on function processar_evento_resposta_acompanhamento(uuid, uuid, text) to service_role");
  });

  it("protege a autoria da Agenda contra falsificação pelo browser", () => {
    expect(schema).toContain("create or replace function proteger_auditoria_agenda()");
    expect(schema).toContain("new.origin := 'usuario'");
    expect(schema).toContain("new.source_action_id := null");
    expect(schema).toContain("foreign key (source_action_id) references public.assistente_acoes(id)");
  });
});
