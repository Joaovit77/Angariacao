/* Transcrição de áudio (lib/calculo/transcricao).
   Feature nova da pós-migração — sem oráculo do app antigo. Os testes fixam
   os números que saíram da MEDIÇÃO dos 43 áudios reais (31/07/2026) e o corte
   que impede a transcrição de piorar a caixa de respostas: áudio sem fala
   continua sendo `[áudio]`, porque uma nota vazia cobraria leitura de nada e
   ainda esconderia que existe um áudio para ouvir. */
import { describe, expect, it } from "vitest";
import {
  ehAudio,
  esperaTranscricaoMs,
  MAX_BYTES_AUDIO,
  MAX_TENTATIVAS_TRANSCRICAO,
  normalizarTranscricao,
  TIPOS_AUDIO,
  transcricaoUtil,
} from "@/lib/calculo/transcricao";

describe("ehAudio", () => {
  it("aceita o áudio gravado na hora e o arquivo anexado", () => {
    // pttMessage é o "push to talk", a forma esmagadoramente mais comum no
    // WhatsApp — deixá-lo de fora esvaziaria a feature inteira.
    expect(ehAudio("pttMessage")).toBe(true);
    expect(ehAudio("audioMessage")).toBe(true);
  });

  /* Foto e vídeo ficam de fora de propósito: descrevê-los é o caminho de
     VISÃO, que já foi construído, medido e removido (ver CLAUDE.md). */
  it("recusa os outros tipos de mídia e o texto comum", () => {
    for (const tipo of ["imageMessage", "videoMessage", "documentMessage", "conversation"]) {
      expect(ehAudio(tipo)).toBe(false);
    }
  });

  it("tolera nulo, vazio e espaço em volta", () => {
    expect(ehAudio(null)).toBe(false);
    expect(ehAudio(undefined)).toBe(false);
    expect(ehAudio("")).toBe(false);
    expect(ehAudio("  pttMessage  ")).toBe(true);
  });

  it("TIPOS_AUDIO e ehAudio não podem divergir", () => {
    for (const t of TIPOS_AUDIO) expect(ehAudio(t)).toBe(true);
  });
});

describe("esperaTranscricaoMs", () => {
  /* A soma das esperas entra no tempo de resposta do WEBHOOK — é por isso que
     a progressão é curta. Backoff generoso aqui faria a Evolution reentregar
     o evento em vez de proteger alguma coisa. */
  it("não espera na primeira tentativa", () => {
    expect(esperaTranscricaoMs(1)).toBe(0);
    expect(esperaTranscricaoMs(0)).toBe(0);
  });

  it("cresce, e a soma total cabe no webhook", () => {
    expect(esperaTranscricaoMs(2)).toBe(1500);
    expect(esperaTranscricaoMs(3)).toBe(3000);
    const total = [1, 2, 3].reduce((s, n) => s + esperaTranscricaoMs(n), 0);
    expect(total).toBe(4500);
    expect(total).toBeLessThan(10_000);
  });

  /* 9 das 11 falhas medidas passaram na SEGUNDA tentativa. Três dá margem sem
     esticar a requisição; uma só perderia ~1 em cada 4 áudios. */
  it("três tentativas: o que a medição pediu", () => {
    expect(MAX_TENTATIVAS_TRANSCRICAO).toBe(3);
  });
});

describe("transcricaoUtil", () => {
  it("aceita fala de verdade", () => {
    expect(transcricaoUtil("Pode ser quinta às 10h")).toBe(true);
    // Curtíssimo mas decisivo — a mesma razão pela qual a caixa de respostas
    // não descarta mensagem curta: "Já Assinei" tem 10 caracteres.
    expect(transcricaoUtil("Pode sim")).toBe(true);
    expect(transcricaoUtil("ok")).toBe(true);
  });

  it("recusa o que não tem letra nenhuma", () => {
    expect(transcricaoUtil("")).toBe(false);
    expect(transcricaoUtil("   ")).toBe(false);
    expect(transcricaoUtil("...")).toBe(false);
    expect(transcricaoUtil("- ... -")).toBe(false);
    expect(transcricaoUtil(null)).toBe(false);
    expect(transcricaoUtil(undefined)).toBe(false);
  });

  it("aceita acento e letra não-ASCII", () => {
    expect(transcricaoUtil("Ó")).toBe(true);
  });
});

describe("normalizarTranscricao", () => {
  it("colapsa quebras e espaços em uma linha", () => {
    expect(normalizarTranscricao("  Bom dia,\n\n  João.  Tudo bem? ")).toBe("Bom dia, João. Tudo bem?");
  });
});

describe("limites", () => {
  /* O maior dos 43 áudios reais tinha 219 KB. O teto dá mais de uma ordem de
     grandeza de folga e ainda barra o caso patológico (música encaminhada). */
  it("o teto de tamanho tem folga sobre o maior áudio real medido", () => {
    const maiorMedido = 219 * 1024;
    expect(MAX_BYTES_AUDIO).toBeGreaterThan(maiorMedido * 10);
  });
});
