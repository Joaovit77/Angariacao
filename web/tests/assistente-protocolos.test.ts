import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { DbProtocoloRow } from "@/lib/persistencia/mapeadores";

const mocks = vi.hoisted(() => ({
  criarResposta: vi.fn(),
  executarFerramenta: vi.fn(),
  registrarUso: vi.fn(),
  registrarEvento: vi.fn(),
}));

vi.mock("openai", () => ({
  default: class OpenAIFalso {
    responses = { create: mocks.criarResposta };
  },
}));

vi.mock("@/lib/servidor/assistente/ferramentas", () => ({
  DEFINICOES_FERRAMENTAS: [],
  executarFerramenta: mocks.executarFerramenta,
}));

vi.mock("@/lib/servidor/registro", () => ({
  registrarUsoDaResponsesApi: mocks.registrarUso,
  registrarEvento: mocks.registrarEvento,
}));

import { responderComAssistente } from "@/lib/servidor/assistente/orquestrador";
import { FERRAMENTA_PROTOCOLOS_COMERCIAIS } from "@/lib/servidor/assistente/protocolos";

const PROTOCOLO_TAXA: DbProtocoloRow = {
  id: "protocolo-taxa",
  user_id: "user-1",
  tipo: "informacao_comercial",
  titulo: "Taxa de administração",
  conteudo: "A taxa de administração é de 10% sobre o valor mensal do aluguel.",
  arquivado: false,
  created_at: "2026-08-04T14:22:23.000Z",
};

function supabaseComProtocolos(rows: DbProtocoloRow[]): SupabaseClient {
  const consulta = {
    select: vi.fn(),
    eq: vi.fn(),
    or: vi.fn(),
    order: vi.fn(),
    limit: vi.fn(),
  };
  consulta.select.mockReturnValue(consulta);
  consulta.eq.mockReturnValue(consulta);
  consulta.or.mockReturnValue(consulta);
  consulta.order.mockReturnValue(consulta);
  consulta.limit.mockResolvedValue({ data: rows, error: null });
  return { from: vi.fn(() => consulta) } as unknown as SupabaseClient;
}

function respostaFinal(texto: string) {
  return { output: [], output_text: texto, usage: null };
}

function respostaComSelecao(ids: string[]) {
  return {
    output: [{
      type: "function_call",
      id: "fc-protocolos",
      call_id: "call-protocolos",
      name: FERRAMENTA_PROTOCOLOS_COMERCIAIS,
      arguments: JSON.stringify({ protocolos_ids: ids }),
      status: "completed",
    }],
    output_text: "",
    usage: null,
  };
}

describe("protocolos comerciais no Assistente", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OPENAI_API_KEY = "teste";
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });

  it("seleciona o protocolo aplicável, entrega o conteúdo real e registra a cadeia", async () => {
    mocks.criarResposta
      .mockResolvedValueOnce(respostaComSelecao([PROTOCOLO_TAXA.id]))
      .mockResolvedValueOnce(respostaFinal("A taxa de administração é de 10% sobre o valor mensal do aluguel."));

    const resposta = await responderComAssistente(
      {
        mensagem: "Qual é a taxa de administração?",
        contexto: { rota: "/assistente", pagina: "Assistente", superficie: "pagina" },
        historico: [],
      },
      supabaseComProtocolos([PROTOCOLO_TAXA]),
      "user-1",
    );

    const primeiraChamada = mocks.criarResposta.mock.calls[0][0];
    const segundaChamada = mocks.criarResposta.mock.calls[1][0];
    const ferramenta = primeiraChamada.tools.find((item: { name?: string }) =>
      item.name === FERRAMENTA_PROTOCOLOS_COMERCIAIS
    );
    const retornoFerramenta = segundaChamada.input.find((item: { type?: string }) =>
      item.type === "function_call_output"
    );

    expect(primeiraChamada.instructions).toContain("Taxa de administração");
    expect(primeiraChamada.instructions).not.toContain("10% sobre o valor mensal");
    expect(ferramenta).toMatchObject({
      strict: true,
      parameters: {
        properties: { protocolos_ids: { items: { enum: [PROTOCOLO_TAXA.id] } } },
      },
    });
    expect(retornoFerramenta.output).toContain(PROTOCOLO_TAXA.conteudo);
    expect(resposta.mensagem.texto).toBe(PROTOCOLO_TAXA.conteudo);
    expect(mocks.executarFerramenta).not.toHaveBeenCalled();

    const detalhe = mocks.registrarEvento.mock.calls.at(-1)?.[0].detalhe as string;
    expect(detalhe).toContain(`"protocolosConsiderados":["${PROTOCOLO_TAXA.id}"]`);
    expect(detalhe).toContain(`"protocolosAplicados":["${PROTOCOLO_TAXA.id}"]`);
    expect(detalhe).toContain('"fontesDeDados":["protocolos"]');
    expect(detalhe).not.toContain(PROTOCOLO_TAXA.conteudo);
    expect(detalhe).not.toContain("Qual é a taxa");
  });

  it("permite zero relevantes e não aplica um protocolo apenas por existir no catálogo", async () => {
    const protocoloIrrelevante = {
      ...PROTOCOLO_TAXA,
      id: "protocolo-horario",
      titulo: "Horário de atendimento",
      conteudo: "Atendimento de segunda a sexta.",
    };
    mocks.criarResposta.mockResolvedValueOnce(
      respostaFinal("Não tenho uma fonte autorizada para informar essa condição."),
    );

    const resposta = await responderComAssistente(
      {
        mensagem: "Qual é a multa por rescisão?",
        contexto: { rota: "/assistente", pagina: "Assistente", superficie: "pagina" },
        historico: [],
      },
      supabaseComProtocolos([protocoloIrrelevante]),
      "user-1",
    );

    expect(mocks.criarResposta).toHaveBeenCalledTimes(1);
    expect(resposta.mensagem.texto).not.toMatch(/\d+%/);
    const detalhe = mocks.registrarEvento.mock.calls.at(-1)?.[0].detalhe as string;
    expect(detalhe).toContain('"protocolosAplicados":[]');
    expect(detalhe).toContain(`"protocolosConsiderados":["${protocoloIrrelevante.id}"]`);
  });

  it("não oferece protocolo arquivado ao modelo nem promete navegar nas Configurações", async () => {
    mocks.criarResposta.mockResolvedValueOnce(
      respostaFinal("Não tenho uma fonte autorizada para informar essa condição."),
    );

    await responderComAssistente(
      {
        mensagem: "Qual é a taxa de administração?",
        contexto: { rota: "/assistente", pagina: "Assistente", superficie: "pagina" },
        historico: [],
      },
      supabaseComProtocolos([{ ...PROTOCOLO_TAXA, arquivado: true }]),
      "user-1",
    );

    const chamada = mocks.criarResposta.mock.calls[0][0];
    expect(chamada.instructions).not.toContain(PROTOCOLO_TAXA.titulo);
    expect(chamada.instructions).toContain("não possui ferramenta para navegar nessas áreas");
    expect(chamada.tools.map((ferramenta: { name: string }) => ferramenta.name)).toEqual([
      "preparar_agendamento_visita",
      "preparar_criacao_compromisso",
      "abrir_revisao_followup_lote",
      "preparar_rascunho_resposta",
    ]);
    const detalhe = mocks.registrarEvento.mock.calls.at(-1)?.[0].detalhe as string;
    expect(detalhe).toContain('"protocolosConsiderados":[]');
    expect(detalhe).toContain('"protocolosAplicados":[]');
  });
});
