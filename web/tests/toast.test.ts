import { describe, it, expect } from "vitest";
import {
  inscreverToast,
  toast,
  toastCartao,
  TOAST_DURACAO_CARTAO_MS,
  type ToastItem,
} from "@/lib/toast";

/** Coleta o que o barramento publicou enquanto a função rodava. */
function capturar(fn: () => void): ToastItem[] {
  const vistos: ToastItem[] = [];
  const sair = inscreverToast((item) => vistos.push(item));
  try {
    fn();
  } finally {
    sair();
  }
  return vistos;
}

describe("toast", () => {
  it("o toast comum continua uma frase só, sem cartão", () => {
    const [item] = capturar(() => toast("Imóvel salvo"));
    expect(item.msg).toBe("Imóvel salvo");
    expect(item.cartao).toBeUndefined();
    expect(item.duracaoMs).toBeUndefined();
  });
});

describe("toastCartao", () => {
  it("leva as partes separadas e fica mais tempo na tela", () => {
    const [item] = capturar(() =>
      toastCartao({
        titulo: "João Silva",
        detalhe: "LD-176 · Rua A, 100",
        mensagem: "Pode sim",
        selo: "3 mensagens",
      }),
    );
    expect(item.cartao?.titulo).toBe("João Silva");
    expect(item.cartao?.selo).toBe("3 mensagens");
    expect(item.duracaoMs).toBe(TOAST_DURACAO_CARTAO_MS);
  });

  it("o texto puro junta as partes — é o que o leitor de tela anuncia", () => {
    const [item] = capturar(() =>
      toastCartao({ titulo: "João Silva", detalhe: "LD-176", mensagem: "Pode sim" }),
    );
    expect(item.msg).toBe("João Silva — LD-176 — Pode sim");
  });

  it("sem detalhe nem mensagem não sobram travessões soltos", () => {
    const [item] = capturar(() => toastCartao({ titulo: "Resposta no WhatsApp" }));
    expect(item.msg).toBe("Resposta no WhatsApp");
  });
});
