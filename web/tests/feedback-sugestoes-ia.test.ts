import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getSession: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/persistencia/supabase", () => ({
  getSupabase: () => ({ auth: { getSession: mocks.getSession } }),
}));

import { POST } from "@/app/api/ia/feedback/route";
import { registrarFeedbackSugestaoIa } from "@/lib/feedbackSugestaoIa";
import { feedbackDoEnvio } from "@/lib/ia/feedback";
import {
  definirSchemaFeedbackSugestoesIaProntoParaTeste,
  feedbackSugestoesIaHabilitado,
  IA_FEEDBACK_SCHEMA_READY,
} from "@/lib/servidor/ia/feedback-config";
import { registrarSugestaoIa } from "@/lib/servidor/ia/sugestoes";

const SCHEMA = readFileSync(new URL("../../supabase-schema.sql", import.meta.url), "utf8");
const ROTA = readFileSync(new URL("../app/api/ia/feedback/route.ts", import.meta.url), "utf8");
const MODAL = readFileSync(new URL("../components/modais/ModalWhatsapp.tsx", import.meta.url), "utf8");
const CENTRAL = readFileSync(new URL("../components/respostas/CentralMensagensView.tsx", import.meta.url), "utf8");
const RESPOSTAS = readFileSync(new URL("../components/respostas/RespostasView.tsx", import.meta.url), "utf8");
const NOTAS = readFileSync(new URL("../components/modais/ModalNotas.tsx", import.meta.url), "utf8");
const ASSISTENTE = readFileSync(new URL("../components/assistente/AssistenteProvider.tsx", import.meta.url), "utf8");
const ABORDAGEM = readFileSync(new URL("../components/pipeline/BotaoAbordagemAnuncio.tsx", import.meta.url), "utf8");
const ROTA_IA = readFileSync(new URL("../app/api/ia/route.ts", import.meta.url), "utf8");
const COMPONENTE = readFileSync(new URL("../components/ia/FeedbackSugestaoIa.tsx", import.meta.url), "utf8");
const VALIDACAO_SQL = readFileSync(new URL("../../scripts/validar-supabase-local.sql", import.meta.url), "utf8");

interface BancoFalso {
  sugestoes: Map<string, { id: string; userId: string; texto: string }>;
  feedbacks: Map<string, Record<string, unknown>>;
  falharFeedback: boolean;
}

let banco: BancoFalso;
let usuarioAutenticado: string;
let upsert: ReturnType<typeof vi.fn>;
let from: ReturnType<typeof vi.fn>;

function clienteFalso() {
  upsert = vi.fn((linha: Record<string, unknown>, opcoes: { onConflict: string }) => ({
    select: () => ({
      single: async () => {
        if (banco.falharFeedback) return { data: null, error: { message: "falha injetada" } };
        expect(opcoes).toEqual({ onConflict: "sugestao_id" });
        banco.feedbacks.set(String(linha.sugestao_id), structuredClone(linha));
        return { data: { resultado: linha.resultado }, error: null };
      },
    }),
  }));
  from = vi.fn((tabela: string) => {
    if (tabela === "ia_sugestoes") {
      return {
        select: () => ({
          eq: (_campo: string, id: string) => ({
            maybeSingle: async () => {
              const sugestao = banco.sugestoes.get(id);
              if (!sugestao || sugestao.userId !== usuarioAutenticado) return { data: null, error: null };
              return { data: { id: sugestao.id, texto_sugerido: sugestao.texto }, error: null };
            },
          }),
        }),
      };
    }
    if (tabela === "ia_feedbacks") return { upsert };
    throw new Error(`Tabela inesperada: ${tabela}`);
  });
  return {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: usuarioAutenticado } }, error: null }),
    },
    from,
  };
}

function requisicao(corpo: Record<string, unknown>) {
  return new Request("http://localhost/api/ia/feedback", {
    method: "POST",
    headers: { Authorization: "Bearer token", "Content-Type": "application/json" },
    body: JSON.stringify(corpo),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://projeto.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "anon");
  vi.stubEnv("IA_FEEDBACK_SUGESTOES_ENABLED", "true");
  definirSchemaFeedbackSugestoesIaProntoParaTeste(true);
  usuarioAutenticado = "usuario-a";
  banco = {
    sugestoes: new Map([
      ["sugestao-a", { id: "sugestao-a", userId: "usuario-a", texto: "Posso ajudar por aqui." }],
      ["sugestao-b", { id: "sugestao-b", userId: "usuario-b", texto: "Mensagem privada." }],
    ]),
    feedbacks: new Map(),
    falharFeedback: false,
  };
  mocks.createClient.mockImplementation(() => clienteFalso());
  mocks.getSession.mockResolvedValue({ data: { session: { access_token: "token" } } });
});

afterEach(() => {
  definirSchemaFeedbackSugestoesIaProntoParaTeste(null);
});

describe("feature flag do feedback de sugestões", () => {
  it("fica desligada por ausência ou valor inválido e só aceita o literal true", () => {
    vi.unstubAllEnvs();
    expect(feedbackSugestoesIaHabilitado()).toBe(false);

    for (const valor of ["false", "1", "TRUE", " true ", "sim"]) {
      vi.stubEnv("IA_FEEDBACK_SUGESTOES_ENABLED", valor);
      expect(feedbackSugestoesIaHabilitado()).toBe(false);
    }

    vi.stubEnv("IA_FEEDBACK_SUGESTOES_ENABLED", "true");
    expect(feedbackSugestoesIaHabilitado()).toBe(true);
  });

  it("permanece desativada com variável true enquanto o schema não está pronto", () => {
    definirSchemaFeedbackSugestoesIaProntoParaTeste(false);
    vi.stubEnv("IA_FEEDBACK_SUGESTOES_ENABLED", "true");

    expect(IA_FEEDBACK_SCHEMA_READY).toBe(false);
    expect(feedbackSugestoesIaHabilitado()).toBe(false);
  });

  it("encerra o endpoint antes de criar cliente ou consultar tabelas com a trava interna desligada", async () => {
    definirSchemaFeedbackSugestoesIaProntoParaTeste(false);
    vi.stubEnv("IA_FEEDBACK_SUGESTOES_ENABLED", "true");

    const resposta = await POST(requisicao({ sugestaoId: "sugestao-a", resultado: "aprovado" }));

    expect(resposta.status).toBe(404);
    expect(await resposta.json()).toEqual({
      ok: false,
      mensagem: "Feedback de sugestões indisponível.",
    });
    expect(mocks.createClient).not.toHaveBeenCalled();
  });

  it("encerra a persistência de sugestão antes de acessar o Supabase com a trava interna desligada", async () => {
    definirSchemaFeedbackSugestoesIaProntoParaTeste(false);
    vi.stubEnv("IA_FEEDBACK_SUGESTOES_ENABLED", "true");
    const fromDesativado = vi.fn(() => {
      throw new Error("não deveria consultar ia_sugestoes");
    });

    const id = await registrarSugestaoIa({
      supabase: { from: fromDesativado } as never,
      userId: "usuario-a",
      imovelId: "imovel-1",
      tipo: "resposta",
      textoSugerido: "Posso ajudar.",
      origem: "outro",
    });

    expect(id).toBeNull();
    expect(fromDesativado).not.toHaveBeenCalled();
  });

  it("mantém todos os consumidores funcionais sem sugestaoId e não renderiza feedback", () => {
    expect(RESPOSTAS).toContain("if (r.ok && r.rascunho)");
    expect(RESPOSTAS).not.toContain("r.rascunho && r.sugestaoId");
    expect(NOTAS).toContain("if (resultado.ok && resultado.rascunho)");
    expect(ASSISTENTE).toContain("if (resultado.ok && resultado.rascunho)");
    expect(ABORDAGEM).toContain("if (!r.ok || !r.abordagem)");
    expect(CENTRAL).toContain("if (!resultado.ok || !resultado.rascunho)");
    expect(CENTRAL).toContain(": null,");
    expect(MODAL).toContain("{sugestaoAtual ? (");
    expect(CENTRAL).toContain("{sugestao ? (");
    expect(ROTA_IA).toContain("if (feedbackSugestoesIaHabilitado())");
  });
});

describe("feedback de sugestões da IA", () => {
  it("registra aprovação e mantém retry idempotente em uma linha", async () => {
    const corpo = { sugestaoId: "sugestao-a", resultado: "aprovado" };
    const primeira = await POST(requisicao(corpo));
    const repetida = await POST(requisicao(corpo));

    expect(primeira.status).toBe(200);
    expect(repetida.status).toBe(200);
    expect(await repetida.json()).toEqual({ ok: true, resultado: "aprovado" });
    expect(banco.feedbacks).toHaveLength(1);
    expect(banco.feedbacks.get("sugestao-a")).toMatchObject({
      sugestao_id: "sugestao-a",
      user_id: "usuario-a",
      resultado: "aprovado",
      motivo: null,
      comentario: null,
      texto_final: null,
    });
  });

  it("permite mudar a avaliação e mantém somente o estado mais recente", async () => {
    vi.useFakeTimers();
    vi.setSystemTime("2026-08-28T12:00:00.000Z");
    const aprovada = await POST(requisicao({
      sugestaoId: "sugestao-a",
      resultado: "aprovado",
    }));
    const primeiroUpdatedAt = banco.feedbacks.get("sugestao-a")?.updated_at;

    vi.setSystemTime("2026-08-28T12:05:00.000Z");
    const rejeitada = await POST(requisicao({
      sugestaoId: "sugestao-a",
      resultado: "rejeitado",
      motivo: "muito-formal",
    }));

    expect(aprovada.status).toBe(200);
    expect(rejeitada.status).toBe(200);
    expect(banco.feedbacks).toHaveLength(1);
    expect(banco.feedbacks.get("sugestao-a")).toMatchObject({
      resultado: "rejeitado",
      motivo: "muito-formal",
      comentario: null,
      texto_final: null,
      updated_at: "2026-08-28T12:05:00.000Z",
    });
    expect(banco.feedbacks.get("sugestao-a")?.updated_at).not.toBe(primeiroUpdatedAt);
  });

  it("registra rejeição com motivo e comentário opcionais", async () => {
    const resposta = await POST(requisicao({
      sugestaoId: "sugestao-a",
      resultado: "rejeitado",
      motivo: "muito-formal",
      comentario: "Prefiro começar de forma mais direta.",
    }));

    expect(resposta.status).toBe(200);
    expect(banco.feedbacks.get("sugestao-a")).toMatchObject({
      resultado: "rejeitado",
      motivo: "muito-formal",
      comentario: "Prefiro começar de forma mais direta.",
    });

    const semComentario = await POST(requisicao({
      sugestaoId: "sugestao-a",
      resultado: "rejeitado",
      motivo: "muito-formal",
    }));
    expect(semComentario.status).toBe(200);
    expect(banco.feedbacks).toHaveLength(1);
    expect(banco.feedbacks.get("sugestao-a")).toMatchObject({
      resultado: "rejeitado",
      motivo: "muito-formal",
      comentario: null,
    });
  });

  it("liga a sugestão original ao texto final efetivamente editado", async () => {
    expect(feedbackDoEnvio(
      { id: "sugestao-a", textoSugerido: "Posso ajudar por aqui." },
      "Consigo ajudar por aqui.",
    )).toEqual({
      sugestaoId: "sugestao-a",
      resultado: "editado",
      textoFinal: "Consigo ajudar por aqui.",
    });

    const resposta = await POST(requisicao({
      sugestaoId: "sugestao-a",
      resultado: "editado",
      textoFinal: "Consigo ajudar por aqui.",
    }));
    expect(resposta.status).toBe(200);
    expect(banco.feedbacks.get("sugestao-a")).toMatchObject({
      sugestao_id: "sugestao-a",
      resultado: "editado",
      texto_final: "Consigo ajudar por aqui.",
    });
  });

  it("recusa edição sem diferença e sugestão pertencente a outro usuário", async () => {
    const igual = await POST(requisicao({
      sugestaoId: "sugestao-a",
      resultado: "editado",
      textoFinal: "  Posso ajudar por aqui.  ",
    }));
    expect(igual.status).toBe(422);

    const cruzado = await POST(requisicao({ sugestaoId: "sugestao-b", resultado: "aprovado" }));
    expect(cruzado.status).toBe(404);
    expect(upsert).not.toHaveBeenCalled();
  });

  it("deriva user_id da sessão e trata informação incorreta apenas como feedback", async () => {
    const resposta = await POST(requisicao({
      sugestaoId: "sugestao-a",
      userId: "usuario-b",
      resultado: "rejeitado",
      motivo: "informacao-incorreta",
      comentario: "A taxa citada não vale neste caso.",
    }));

    expect(resposta.status).toBe(200);
    expect(banco.feedbacks.get("sugestao-a")?.user_id).toBe("usuario-a");
    expect(from.mock.calls.map(([tabela]) => tabela)).toEqual(["ia_sugestoes", "ia_feedbacks"]);
    expect(ROTA).not.toContain('.from("protocolos")');
    expect(ROTA).not.toContain("system-prompt");
    expect(ROTA).not.toContain("user_config");
  });

  it("expõe falha de salvamento ao cliente para permitir tentativa repetida", async () => {
    banco.falharFeedback = true;
    const resposta = await POST(requisicao({ sugestaoId: "sugestao-a", resultado: "aprovado" }));
    expect(resposta.status).toBe(500);

    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(
      { ok: false, mensagem: "Não foi possível salvar o feedback. Tente novamente." },
      { status: 500 },
    )));
    await expect(registrarFeedbackSugestaoIa({ sugestaoId: "sugestao-a", resultado: "aprovado" }))
      .resolves.toEqual({ ok: false, mensagem: "Não foi possível salvar o feedback. Tente novamente." });
    expect(MODAL).toContain("Tentar salvar feedback");
    expect(CENTRAL).toContain("feedbackPendenteAposEnvio");
  });
});

describe("contratos de schema e interface", () => {
  it("mantém RLS, grants mínimos e uma única linha de feedback por sugestão/usuário", () => {
    expect(SCHEMA).toContain("create table if not exists ia_sugestoes");
    expect(SCHEMA).toContain("create table if not exists ia_feedbacks");
    expect(SCHEMA).toContain("constraint ia_feedbacks_sugestao_unica unique (sugestao_id)");
    expect(SCHEMA).toContain("foreign key (sugestao_id, user_id)");
    expect(SCHEMA).toContain("references ia_sugestoes(id, user_id) on delete cascade");
    expect(SCHEMA).toContain('create policy "update_own_ia_feedbacks"');
    expect(SCHEMA).toContain("using ((select auth.uid()) = user_id)");
    expect(SCHEMA).toContain("grant select, insert on table ia_sugestoes to authenticated");
    expect(SCHEMA).toContain("grant select, insert, update on table ia_feedbacks to authenticated");
    expect(SCHEMA).not.toContain("grant select, insert, update, delete on table ia_feedbacks");
    expect(VALIDACAO_SQL).toContain("FK composta aceitou feedback com usuário diferente da sugestão");
    expect(VALIDACAO_SQL).toContain("RLS aceitou feedback apontando para sugestão de outro usuário");
  });

  it("oferece as três ações discretas e só registra edição depois do envio confirmado", () => {
    for (const rotulo of ["👍 Usaria assim", "✏️ Editar", "👎 Não gostei"]) {
      expect(COMPONENTE).toContain(rotulo);
    }
    expect(COMPONENTE).toContain("Salvando feedback…");
    expect(COMPONENTE).toContain("Feedback salvo");
    expect(COMPONENTE).toContain("Motivo opcional");
    expect(COMPONENTE).toContain("Comentário opcional");
    expect(COMPONENTE).toContain("Você pode mudar a avaliação.");
    expect(COMPONENTE).not.toContain("if (salvando || resultadoSalvo) return;");
    expect(COMPONENTE).not.toContain("desabilitado || salvando || !!resultadoSalvo");

    const envioModal = MODAL.slice(MODAL.indexOf("async function enviarAgora"), MODAL.indexOf("/** Saída antiga"));
    expect(envioModal.indexOf("if (r.ok)")).toBeLessThan(envioModal.indexOf("registrarFeedbackDoEnvio(texto)"));
    expect(envioModal.indexOf("registrarFeedbackDoEnvio(texto)")).toBeLessThan(
      envioModal.indexOf("setEnviando(false)", envioModal.indexOf("if (r.ok)")),
    );
    const envioCentral = CENTRAL.slice(CENTRAL.indexOf("async function enviar()"), CENTRAL.indexOf("async function sugerirComIa"));
    expect(envioCentral.indexOf("if (!resultado.ok)")).toBeLessThan(envioCentral.indexOf("registrarFeedbackSugestaoIa"));

    const retryModal = MODAL.slice(
      MODAL.indexOf("async function tentarSalvarFeedbackPendente"),
      MODAL.indexOf("/** Envia pela Evolution"),
    );
    const retryCentral = CENTRAL.slice(
      CENTRAL.indexOf("async function tentarSalvarFeedbackPendente"),
      CENTRAL.indexOf("async function sugerirComIa"),
    );
    expect(retryModal).not.toContain("enviarWhatsapp(");
    expect(retryModal).not.toContain("enviarAgora(");
    expect(retryCentral).not.toContain("enviarWhatsapp(");
    expect(MODAL).toContain("if (!imovel || !usuario || enviando) return;");
    expect(MODAL).toContain('{enviando ? "Registrando..." : "Sim, mandei"}');
  });
});
