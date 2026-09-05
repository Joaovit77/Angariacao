import OpenAI from "openai";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import { writeFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import type { ModeloIaPermitido } from "@/lib/ia/configuracao";

vi.mock("@/lib/servidor/registro", () => ({ registrarEvento: vi.fn(), registrarUsoDaResposta: vi.fn() }));
vi.mock("@/lib/servidor/ia/feedback-config", () => ({ feedbackSugestoesIaHabilitado: () => false }));
import { atenderProprietario } from "@/lib/servidor/ia/handlers/atendimento";
import { criarExecutorOpenAI } from "@/lib/servidor/ia/executor-openai";
import { carregarConfiguracaoIa } from "@/lib/servidor/ia/configuracao";
import { registrarEvento } from "@/lib/servidor/registro";

/** Comparação opt-in, com fotografia única, leitura por tenant e sem persistência de sugestões.
 * O relatório de revisão pode conter rascunhos; logs e métricas nunca contêm conteúdo privado. */
describe.skipIf(process.env.IA_COMPARACAO_REAL !== "true")("comparação controlada de atendimento", () => {
  it("compara modelo atual e Terra com contextos idênticos e duas repetições", async () => {
    const userId = process.env.IA_REPRODUCAO_USER_ID;
    const imovelId = process.env.IA_REPRODUCAO_IMOVEL_ID;
    const destino = process.env.IA_COMPARACAO_RELATORIO;
    if (!userId || !imovelId || !destino || !process.env.OPENAI_API_KEY ||
      !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      throw new Error("Comparação indisponível: contexto, configuração ou destino não informado.");
    }
    if (imovelId === "c2cfe26e-0edf-463e-a320-c5f07a471e2f") throw new Error("Contexto excluído.");
    const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false, autoRefreshToken: false } });
    const [imovel, protocolos, perfil, configuracao] = await Promise.all([
      sb.from("imoveis").select("*").eq("user_id", userId).eq("id", imovelId).maybeSingle(),
      sb.from("protocolos").select("*").eq("user_id", userId).order("created_at", { ascending: true }),
      sb.from("user_config").select("perfil_comunicacao").eq("user_id", userId).maybeSingle(),
      carregarConfiguracaoIa(),
    ]);
    if (imovel.error || protocolos.error || perfil.error || !imovel.data) throw new Error("Falha ao ler fotografia autorizada.");
    const corte = process.env.IA_REPRODUCAO_ATE;
    if (!corte || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}$/.test(corte)) throw new Error("Instante da reprodução não informado.");
    const historico = (imovel.data.notas as Array<{ data?: string }>).filter((nota) => !!nota.data && nota.data <= corte);
    const nota = (texto: string, indice: number, enviada = false) => ({
      id: `${enviada ? "wa-enviada" : "wa"}:ensaio-${indice}`,
      direcao: enviada ? "enviada" : "recebida",
      data: `2026-09-04T09:00:${String(indice).padStart(2, "0")}`,
      texto: `${enviada ? "Mensagem enviada" : "Resposta"} pelo WhatsApp: ${texto}`,
    });
    const casos = [
      { nome: "LD-288 histórico", notas: historico, fontes: protocolos.data },
      { nome: "Simples: Ok", notas: [nota("Tudo bem, obrigado pelo retorno.", 0, true), nota("Ok", 1)], fontes: protocolos.data },
      { nome: "Taxa de administração", notas: [nota("Qual é a taxa de administração?", 0)], fontes: protocolos.data },
      { nome: "Parcial: outra imobiliária", notas: [nota("Se por acaso a outra imobiliária conseguir alugar, como fica a situação?", 0)], fontes: protocolos.data },
      { nome: "Sem protocolo", notas: [nota("Qual é a taxa para cancelar antes da locação?", 0)], fontes: [] },
    ];
    const modelos: ModeloIaPermitido[] = [...new Set([configuracao.atendimento.modelo, "gpt-5.6-terra" as const])];
    const resultados: Array<Record<string, unknown> & { caso: string; modelo: string; rascunho: string }> = [];
    const escape = (texto: string) => texto.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
    async function salvar() {
      // Artefato privado para revisão humana; nunca versionado nem registrado em log_eventos.
      await writeFile(destino!, JSON.stringify(resultados, null, 2), "utf8");
      await writeFile(destino!.replace(/\.json$/, ".html"), `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Revisão dos rascunhos</title><style>body{font:16px system-ui;max-width:1100px;margin:40px auto;color:#172033;background:#f5f7fa}article{background:white;border:1px solid #d9e0e8;border-radius:12px;padding:20px;margin:16px 0}textarea{width:100%;box-sizing:border-box;min-height:100px;font:16px system-ui;padding:12px}small{color:#526077}</style><h1>Comparação do atendimento</h1><p>Rascunhos para revisão local. Nenhum envio disponível.</p>${resultados.map((item) => `<article><h2>${escape(item.caso)} · ${escape(item.modelo)} · repetição ${item.repeticao}</h2><small>HTTP ${item.status} · ${item.duracao_ms} ms · ${item.chamadas} chamadas · ${item.codigo}</small><textarea aria-label="Rascunho para revisão">${escape(item.rascunho)}</textarea></article>`).join("")}</html>`, "utf8");
    }
    const indisponiveis = new Set<string>();
    for (let repeticao = 1; repeticao <= 2; repeticao++) {
      for (const caso of casos) {
        // Alterna a ordem para reduzir viés de aquecimento/cache entre modelos.
        for (const modelo of repeticao === 1 ? modelos : [...modelos].reverse()) {
          if (indisponiveis.has(modelo)) continue;
          vi.mocked(registrarEvento).mockClear();
          const fotografia: Record<string, unknown> = {
            imoveis: { ...imovel.data, notas: caso.notas, tentativas: [] }, protocolos: caso.fontes, user_config: perfil.data,
          };
          const cliente = { from(tabela: string) {
            if (!(tabela in fotografia)) throw new Error("Acesso fora da fotografia do ensaio.");
            const resposta = { data: fotografia[tabela], error: null };
            const consulta = { select: () => consulta, eq: () => consulta,
              order: async () => resposta, maybeSingle: async () => resposta };
            return consulta;
          } } as unknown as SupabaseClient;
          const rota = { modelo, esforco: modelo === configuracao.atendimento.modelo ? configuracao.atendimento.esforco : "low" as const };
          const executor = criarExecutorOpenAI(new OpenAI({ maxRetries: 0, timeout: 45_000 }), null, rota);
          const inicio = performance.now();
          const revisao: Array<Record<string, unknown>> = [];
          let chamadas = 0, entrada = 0, saida = 0, cache = 0, geracoes = 0;
          const resposta = await atenderProprietario({ tipo: "rascunhar-resposta", corpo: { imovelId }, userId,
            supabase: cliente, configuracao: { ...configuracao, atendimento: rota }, executor: { async executar(pedido) {
              if (++chamadas > 5) throw new Error("Teto de chamadas excedido.");
              if (pedido.tipo.includes("-geracao") && ++geracoes > 2) throw new Error("Teto de gerações excedido.");
              const resultado = await executor.executar(pedido);
              try {
                const dados = JSON.parse(resultado.texto);
                revisao.push(pedido.tipo.endsWith("-decisao") ? {
                  etapa: pedido.tipo, acaoEsperada: dados.acaoEsperada, acoesProibidas: dados.acoesProibidas,
                  protocolosAplicaveis: dados.protocolosAplicaveis,
                } : pedido.tipo.includes("-geracao") ? {
                  etapa: pedido.tipo, rascunho: dados.mensagem, protocolosUsados: dados.protocolosUsados,
                } : { etapa: pedido.tipo, problemas: dados.problemas });
              } catch { revisao.push({ etapa: pedido.tipo, estruturaInvalida: true }); }
              entrada += resultado.conclusao.usage?.prompt_tokens ?? 0;
              saida += resultado.conclusao.usage?.completion_tokens ?? 0;
              cache += resultado.conclusao.usage?.prompt_tokens_details?.cached_tokens ?? 0;
              return resultado;
            } } });
          const corpo = await resposta.json();
          if (corpo.falha === "nao-configurado") indisponiveis.add(modelo);
          const eventos = vi.mocked(registrarEvento).mock.calls.map(([evento]) => evento.detalhe ? JSON.parse(evento.detalhe) : {});
          resultados.push({ revisao, caso: caso.nome, modelo, esforco: rota.esforco, repeticao, status: resposta.status,
            duracao_ms: Math.round(performance.now() - inicio), chamadas, geracoes, tokens_entrada: entrada,
            tokens_saida: saida, tokens_cache: cache, rejeicoes: new Set(eventos.filter((evento) => evento.validacao === "rejeitada" && evento.tentativa).map((evento) => evento.tentativa)).size,
            codigo: eventos.at(-1)?.motivo ?? null, fallback: corpo.fallbackAplicado ?? false,
            contexto_fingerprint: createHash("sha256").update(JSON.stringify(fotografia)).digest("hex").slice(0, 16),
            rascunho: corpo.ok ? corpo.rascunho : "", protocolos: corpo.protocolosUsados ?? [],
          });
          await salvar();
          expect(chamadas).toBeLessThanOrEqual(5);
          expect(geracoes).toBeLessThanOrEqual(2);
        }
      }
    }
    expect(resultados.filter((item) => !indisponiveis.has(item.modelo))).toHaveLength(casos.length * (modelos.length - indisponiveis.size) * 2);
  }, 900_000);
});
