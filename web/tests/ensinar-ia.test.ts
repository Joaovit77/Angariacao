import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

import {
  confirmarPreferenciaSupervisionada,
  confirmarRegraSupervisionada,
  deveOferecerEnsinoAposFeedback,
} from "@/lib/ensinarIaAcoes";
import { feedbackDoEnvio } from "@/lib/ia/feedback";
import { PERFIL_COMUNICACAO_PADRAO } from "@/lib/perfilComunicacao";
import type { Protocolo, UserConfig } from "@/lib/tipos";

const COMPONENTE = readFileSync(
  new URL("../components/ia/EnsinarIa.tsx", import.meta.url),
  "utf8",
);
const ACOES = readFileSync(new URL("../lib/ensinarIaAcoes.ts", import.meta.url), "utf8");
const CENTRAL = readFileSync(
  new URL("../components/respostas/CentralMensagensView.tsx", import.meta.url),
  "utf8",
);
const MODAL = readFileSync(
  new URL("../components/modais/ModalWhatsapp.tsx", import.meta.url),
  "utf8",
);
const SCHEMA = readFileSync(new URL("../../supabase-schema.sql", import.meta.url), "utf8");

function config(): UserConfig {
  return {
    comissaoPercent: 100,
    agendaTipos: [],
    whatsappModelos: [],
    empresa: "Imobiliária Exemplo",
    origensExtras: [],
    dadosPagamento: "",
    perfilComunicacao: { ...PERFIL_COMUNICACAO_PADRAO },
  };
}

describe("Ensinar a IA — supervisão e custo zero", () => {
  it("mantém 'Só nesta mensagem' como saída sem qualquer persistência", () => {
    const botao = COMPONENTE.slice(
      COMPONENTE.indexOf('<div className="ensinar-ia-destinos">'),
      COMPONENTE.indexOf("Preferência de escrita"),
    );
    expect(botao).toContain("onClick={aoConcluir}");
    expect(botao).not.toMatch(/salvarConfig|salvarProtocolo|confirmarPreferencia|confirmarRegra/);
  });

  it("salva a preferência explícita no perfil existente e encaminha o user_id da sessão", async () => {
    const persistir = vi.fn().mockResolvedValue(true);
    const atual = config();

    await expect(
      confirmarPreferenciaSupervisionada(
        {
          config: atual,
          userId: "usuario-a",
          preferencia: { campo: "tamanho", valor: "medio" },
        },
        persistir,
      ),
    ).resolves.toBe(true);

    expect(persistir).toHaveBeenCalledOnce();
    expect(persistir).toHaveBeenCalledWith(
      { ...atual, perfilComunicacao: { ...atual.perfilComunicacao, tamanho: "medio" } },
      "usuario-a",
      "Preferência de escrita salva.",
    );
  });

  it("cancelar a preferência não chama persistência", () => {
    const cancelar = COMPONENTE.slice(
      COMPONENTE.indexOf("function voltar()"),
      COMPONENTE.indexOf("async function confirmarPreferencia()"),
    );
    expect(cancelar).toContain("setDestino(null)");
    expect(cancelar).not.toMatch(/salvarConfig|salvarProtocolo|confirmarPreferencia|confirmarRegra/);
  });

  it("cria protocolo com o texto revisado e o user_id correto", async () => {
    const persistir = vi.fn().mockResolvedValue(true);

    await expect(
      confirmarRegraSupervisionada(
        {
          id: "protocolo-estavel",
          userId: "usuario-a",
          tipo: "regra_conduta",
          titulo: " Exclusividade ",
          conteudo: " Confirmar a exclusividade antes da divulgação. ",
          escopoConfirmado: true,
        },
        persistir,
      ),
    ).resolves.toBe(true);

    expect(persistir).toHaveBeenCalledWith(
      {
        id: "protocolo-estavel",
        tipo: "regra_conduta",
        titulo: "Exclusividade",
        conteudo: "Confirmar a exclusividade antes da divulgação.",
        arquivado: false,
      },
      "usuario-a",
    );
  });

  it("cancelar protocolo não cria registro", () => {
    const cancelar = COMPONENTE.slice(
      COMPONENTE.indexOf("function voltar()"),
      COMPONENTE.indexOf("async function confirmarPreferencia()"),
    );
    expect(cancelar).not.toContain("salvarProtocolo(");
    expect(COMPONENTE).toContain('onClick={voltar} disabled={salvando}');
  });

  it("submissão duplicada mantém uma única regra equivalente", async () => {
    const banco = new Map<string, Protocolo>();
    const persistir = vi.fn(async (protocolo: Protocolo) => {
      banco.set(protocolo.id, protocolo);
      return true;
    });
    const entrada = {
      id: "mesmo-formulario",
      userId: "usuario-a",
      tipo: "informacao_comercial" as const,
      titulo: "Taxa",
      conteudo: "A taxa administrativa é a aprovada pela imobiliária.",
      escopoConfirmado: true,
    };

    await Promise.all([
      confirmarRegraSupervisionada(entrada, persistir),
      confirmarRegraSupervisionada(entrada, persistir),
    ]);

    expect(banco.size).toBe(1);
    expect(COMPONENTE).toContain("envioEmCurso.current");
    expect(COMPONENTE).toContain("useState(() => uid())");
  });

  it("deriva identidade da sessão e preserva RLS de perfil e protocolos", () => {
    expect(COMPONENTE).toContain("const { usuario } = useSessao()");
    expect(COMPONENTE).toContain("userId: usuario.id");
    expect(COMPONENTE).not.toMatch(/function EnsinarIa\([^)]*userId/);
    expect(SCHEMA).toMatch(
      /create policy "insert_own_config"[\s\S]*?with check \(auth\.uid\(\) = user_id\)/,
    );
    expect(SCHEMA).toMatch(
      /create policy "update_own_config"[\s\S]*?using \(auth\.uid\(\) = user_id\)[\s\S]*?with check \(auth\.uid\(\) = user_id\)/,
    );
    expect(SCHEMA).toMatch(
      /create policy "insert_own_protocolos"[\s\S]*?with check \(auth\.uid\(\) = user_id\)/,
    );
  });

  it("feedback editado continua normal e só oferece ensino depois do envio confirmado", () => {
    const pedido = feedbackDoEnvio(
      { id: "sugestao-1", textoSugerido: "Mensagem original." },
      "Mensagem revisada pelo usuário.",
    );
    expect(pedido).toEqual({
      sugestaoId: "sugestao-1",
      resultado: "editado",
      textoFinal: "Mensagem revisada pelo usuário.",
    });
    expect(deveOferecerEnsinoAposFeedback(pedido.resultado, false)).toBe(false);
    expect(deveOferecerEnsinoAposFeedback(pedido.resultado, true)).toBe(true);
    expect(CENTRAL).toContain("await registrarFeedbackSugestaoIa(pedidoFeedback)");
    expect(MODAL).toContain("await registrarFeedbackSugestaoIa(pedido)");
  });

  it("aprovar ou rejeitar sugestão nunca cria aprendizado automático", () => {
    expect(deveOferecerEnsinoAposFeedback("aprovado", true)).toBe(false);
    expect(deveOferecerEnsinoAposFeedback("rejeitado", true)).toBe(false);
    expect(deveOferecerEnsinoAposFeedback(null, true)).toBe(false);
  });

  it("executa as ações de ensino com zero chamadas de modelo", async () => {
    const persistirConfig = vi.fn().mockResolvedValue(true);
    const persistirProtocolo = vi.fn().mockResolvedValue(true);

    await confirmarPreferenciaSupervisionada(
      {
        config: config(),
        userId: "usuario-a",
        preferencia: { campo: "emojis", valor: "nenhum" },
      },
      persistirConfig,
    );
    await confirmarRegraSupervisionada(
      {
        id: "regra-1",
        userId: "usuario-a",
        tipo: "regra_conduta",
        titulo: "Atendimento",
        conteudo: "Sempre confirmar o canal preferido pelo cliente.",
        escopoConfirmado: true,
      },
      persistirProtocolo,
    );

    expect(persistirConfig).toHaveBeenCalledOnce();
    expect(persistirProtocolo).toHaveBeenCalledOnce();
    for (const fonte of [ACOES, COMPONENTE]) {
      expect(fonte).not.toMatch(
        /fetch\s*\(|from\s+["']openai["']|createOpenAI|embedding|rascunharResposta|auditar|\/api\/ia/i,
      );
    }
  });
});
