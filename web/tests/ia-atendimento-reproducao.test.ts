import OpenAI from "openai";
import { writeFile } from "node:fs/promises";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { createHash } from "node:crypto";

// Ensaio opt-in: nenhuma escrita de telemetria, sugestão ou conversa no banco.
vi.mock("@/lib/servidor/registro", () => ({
  registrarEvento: vi.fn(), registrarUsoDaResposta: vi.fn(),
}));
vi.mock("@/lib/servidor/ia/feedback-config", () => ({
  feedbackSugestoesIaHabilitado: () => false,
}));

import { atenderProprietario } from "@/lib/servidor/ia/handlers/atendimento";
import { criarExecutorOpenAI } from "@/lib/servidor/ia/executor-openai";
import { registrarEvento } from "@/lib/servidor/registro";
import { carregarConfiguracaoIa } from "@/lib/servidor/ia/configuracao";
import { fromDbImovel, type DbImovelRow } from "@/lib/persistencia/mapeadores";
import { selecionarMensagensAtendimento } from "@/lib/ia/atendimento";

describe.skipIf(process.env.IA_REPRODUCAO_REAL !== "true")("reprodução controlada do atendimento", () => {
  it("exercita o handler e o modelo com uma fotografia somente de leitura do contexto autorizado", async () => {
    const userId = process.env.IA_REPRODUCAO_USER_ID;
    const imovelId = process.env.IA_REPRODUCAO_IMOVEL_ID;
    if (!userId || !imovelId || !process.env.OPENAI_API_KEY ||
        !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Reprodução indisponível: faltam identificadores autorizados ou configuração local.");
    }
    if (imovelId === "c2cfe26e-0edf-463e-a320-c5f07a471e2f") {
      throw new Error("Contexto excluído da reprodução.");
    }
    const banco = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const [imovel, protocolos, perfil, configuracao] = await Promise.all([
      banco.from("imoveis").select("*").eq("user_id", userId).eq("id", imovelId).maybeSingle(),
      banco.from("protocolos").select("*").eq("user_id", userId).order("created_at", { ascending: true }),
      banco.from("user_config").select("perfil_comunicacao").eq("user_id", userId).maybeSingle(),
      carregarConfiguracaoIa(),
    ]);
    if (imovel.error || protocolos.error || perfil.error || !imovel.data) {
      throw new Error("Não foi possível ler o contexto autorizado; nenhuma geração realizada.");
    }
    const corteEm = process.env.IA_REPRODUCAO_ATE;
    if (corteEm && !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(corteEm)) {
      throw new Error("Data de reprodução inválida.");
    }
    const linhaImovel = {
      ...imovel.data,
      // Reproduz um instante anterior só em memória, sem UPDATE nem mensagem sintética.
      notas: corteEm
        ? (imovel.data.notas as Array<{ data?: string }>).filter((nota) => !!nota.data && nota.data <= corteEm)
        : imovel.data.notas,
    };
    const selecao = selecionarMensagensAtendimento(fromDbImovel(linhaImovel as DbImovelRow));
    if (!selecao.mensagemAtual) throw new Error("O contexto não possui mensagem textual pendente.");
    // O handler recebe uma fotografia em memória. Qualquer tentativa de escrita falha.
    const resultados: Record<string, unknown> = {
      imoveis: linhaImovel, protocolos: protocolos.data, user_config: perfil.data,
    };
    const fotografia = {
      from(tabela: string) {
        if (!(tabela in resultados)) throw new Error("Acesso fora da fotografia autorizada.");
        const resposta = { data: resultados[tabela], error: null };
        const consulta = {
          select: () => consulta,
          eq: () => consulta,
          order: () => Promise.resolve(resposta),
          maybeSingle: () => Promise.resolve(resposta),
        };
        return consulta;
      },
    } as unknown as SupabaseClient;
    const executorReal = criarExecutorOpenAI(new OpenAI({ maxRetries: 0, timeout: 45_000 }), null, configuracao.atendimento);
    const etapas: Array<{ etapa: string; duracao_ms: number; tokens_entrada: number | null; tokens_saida: number | null }> = [];
    const inicio = performance.now();
    const resposta = await atenderProprietario({
      tipo: "rascunhar-resposta", corpo: { imovelId, origem: "outro" },
      userId, supabase: fotografia, configuracao,
      executor: {
        async executar(pedido) {
          if (etapas.length >= 5) throw new Error("Teto do ensaio excedido.");
          const inicioEtapa = performance.now();
          const resultado = await executorReal.executar(pedido);
          etapas.push({
            etapa: pedido.tipo,
            duracao_ms: Math.round(performance.now() - inicioEtapa),
            tokens_entrada: resultado.conclusao.usage?.prompt_tokens ?? null,
            tokens_saida: resultado.conclusao.usage?.completion_tokens ?? null,
          });
          return resultado;
        },
      },
    });
    const corpo = await resposta.json();
    const evento = vi.mocked(registrarEvento).mock.calls.at(-1)?.[0];
    const diagnostico = evento?.detalhe ? JSON.parse(evento.detalhe) : {};
    const metricas = JSON.stringify({
      operacao: "reproducao_atendimento", modelo: configuracao.atendimento.modelo,
      esforco: configuracao.atendimento.esforco, status: resposta.status,
      etapa_final: diagnostico.etapaFinal ?? null, codigo: diagnostico.motivo ?? null,
      mensagens: selecao.mensagensSelecionadas,
      contexto_fingerprint: createHash("sha256").update(JSON.stringify(resultados)).digest("hex").slice(0, 16),
      duracao_ms: Math.round(performance.now() - inicio), etapas,
      rascunho_editavel: corpo.ok === true && typeof corpo.rascunho === "string",
      caracteres_rascunho: typeof corpo.rascunho === "string" ? corpo.rascunho.length : 0,
      reproducao_historica: !!corteEm, escrita_no_banco: false, envio_whatsapp: false,
    });
    if (process.env.IA_REPRODUCAO_METRICAS) await writeFile(process.env.IA_REPRODUCAO_METRICAS, metricas, "utf8");
    console.info(metricas);
    expect([200, 422, 500, 502]).toContain(resposta.status);
    expect(etapas.filter((etapa) => etapa.etapa.includes("-geracao")).length).toBeLessThanOrEqual(2);
  }, 240_000);
});
