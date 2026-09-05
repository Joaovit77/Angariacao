import OpenAI from "openai";
import { describe, expect, it, vi } from "vitest";
import { promptBaseAtendimento, promptValidarAtendimento, ESQUEMA_VALIDACAO_ATENDIMENTO, motivoReprovacaoValidacaoAtendimento } from "@/lib/ia/atendimento";
import { CONFIGURACAO_IA_PADRAO } from "@/lib/ia/configuracao";
import { criarExecutorOpenAI } from "@/lib/servidor/ia/executor-openai";
import { casosSemanticos, contextoSemantico } from "./fixtures/atendimento-semantico";

vi.mock("@/lib/servidor/registro", () => ({ registrarUsoDaResposta: vi.fn() }));

// Opt-in: somente o auditor real, com dados sintéticos e sem acesso a banco ou WhatsApp.
// As expectativas são de produto, fixadas antes da correção; não vêm do modelo.
describe.skipIf(process.env.IA_AUDITOR_SEMANTICO_REAL !== "true")("aceitação semântica do auditor real", () => {
  for (const repeticao of [1, 2]) {
    describe("repetição " + repeticao, () => {
      it.each(casosSemanticos)("$nome", async (caso) => {
        const rota = CONFIGURACAO_IA_PADRAO.atendimento;
        expect(rota).toEqual({ modelo: "gpt-5.4-mini", esforco: "low" });
        if (!process.env.OPENAI_API_KEY) throw new Error("Chave local do ensaio indisponível.");
        const executor = criarExecutorOpenAI(new OpenAI({ maxRetries: 0, timeout: 45_000 }), null, rota);
        // Sem repetição por falha: uma chamada por caso e repetição.
        let texto: string;
        try {
          ({ texto } = await executor.executar({
            tipo: "rascunhar-resposta-validacao",
            reasoningEffort: rota.esforco,
            formato: { nome: "validacao_atendimento", esquema: ESQUEMA_VALIDACAO_ATENDIMENTO },
            mensagens: [
              { role: "system", content: promptBaseAtendimento() },
              { role: "user", content: promptValidarAtendimento(caso.pergunta, caso.contexto ?? contextoSemantico,
                caso.historico, caso.fontes, caso.resposta, caso.decisao, caso.usados) },
            ],
          }));
        } catch {
          // Não repassar erro bruto do SDK, que pode conter headers ou conteúdo.
          throw new Error("Falha operacional no ensaio do auditor; conteúdo omitido.");
        }
        let saida: unknown;
        try { saida = JSON.parse(texto); } catch { throw new Error("Auditoria fora do contrato JSON."); }
        const motivo = motivoReprovacaoValidacaoAtendimento(saida);
        expect(motivo, "Contrato estrito da auditoria").not.toBeUndefined();
        if (caso.esperado === "aprovar") expect(motivo).toBeNull();
        else {
          // Somente códigos fechados aparecem em falhas do ensaio, nunca o rascunho.
          const problemas = (saida as { problemas: string[] }).problemas;
          expect(problemas).toContain(caso.esperado);
        }
      }, 60_000);
    });
  }
});
