import { describe, expect, it } from "vitest";
import {
  compromissoDaConfirmacaoDeVisita,
  confirmacaoVisitaValida,
  respostaConfirmaVisita,
} from "@/lib/calculo/confirmacaoVisita";
import { notaDaMensagemEnviada } from "@/lib/calculo/notas";
import { notaDaResposta } from "@/lib/calculo/webhookWhatsapp";

const HOJE = "2026-08-18";

function confirmacao(data = "2026-08-22", hora = "10:00") {
  return notaDaMensagemEnviada(
    "saida-1",
    "Confirmando a visita para sábado, 22/08, às 10:00.",
    "2026-08-18T10:27:32",
    "api-evolution",
    "conversation",
    { data, hora },
  );
}

describe("confirmação estruturada de visita", () => {
  it("transforma o caso real ‘Bom dia, ok’ no compromisso exato", () => {
    expect(
      compromissoDaConfirmacaoDeVisita([confirmacao()], "Bom dia, ok", "LD-240", HOJE),
    ).toMatchObject({
      titulo: "Visita — LD-240",
      tipo: "Visita",
      data: "2026-08-22",
      hora: "10:00",
    });
  });

  it.each(["ok", "Sim", "tudo certo", "Pode ser", "Confirmado", "Boa tarde, combinado"])(
    "aceita a confirmação inequívoca ‘%s’",
    (texto) => expect(respostaConfirmaVisita(texto)).toBe(true),
  );

  it.each([
    "ok, mas não consigo nesse horário",
    "sim, precisamos remarcar",
    "talvez",
    "outro horário pode ser?",
    "ok, vou verificar e te aviso depois",
  ])("recusa ou ambiguidade não agenda: ‘%s’", (texto) => {
    expect(compromissoDaConfirmacaoDeVisita([confirmacao()], texto, "LD-240", HOJE)).toBeNull();
  });

  it("não usa um ok sem metadado estruturado", () => {
    const enviada = notaDaMensagemEnviada("saida", "Tudo bem?", "2026-08-18T10:27:32", "api-evolution");
    expect(compromissoDaConfirmacaoDeVisita([enviada], "ok", "LD-240", HOJE)).toBeNull();
  });

  it("uma pergunta intermediária encerra o monitoramento daquela confirmação", () => {
    const respostaAnterior = notaDaResposta(
      {
        mensagemId: "entrada-1",
        texto: "Qual endereço?",
        telefone: "5543999999999",
        instancia: "teste",
        tipo: "conversation",
      },
      "2026-08-18T10:28:00",
    );
    expect(compromissoDaConfirmacaoDeVisita([confirmacao(), respostaAnterior], "ok", "LD-240", HOJE)).toBeNull();
  });

  it("aceita ‘Bom dia’ e ‘ok’ enviados em duas mensagens da mesma rajada", () => {
    const saudacao = notaDaResposta(
      {
        mensagemId: "entrada-saudacao",
        texto: "Bom dia",
        telefone: "5543999999999",
        instancia: "teste",
        tipo: "conversation",
      },
      "2026-08-18T10:28:00",
    );
    expect(compromissoDaConfirmacaoDeVisita([confirmacao(), saudacao], "ok", "LD-240", HOJE)).toMatchObject({
      data: "2026-08-22",
      hora: "10:00",
    });
  });

  it("uma mensagem posterior do corretor também encerra o monitoramento anterior", () => {
    const outra = notaDaMensagemEnviada("saida-2", "Leve um documento, por favor.", "2026-08-18T10:28:00", "api-evolution");
    expect(compromissoDaConfirmacaoDeVisita([confirmacao(), outra], "ok", "LD-240", HOJE)).toBeNull();
  });

  it("rejeita data impossível, passada e hora inválida", () => {
    expect(confirmacaoVisitaValida({ data: "2026-02-30", hora: "10:00" }, HOJE)).toBeNull();
    expect(confirmacaoVisitaValida({ data: "2026-08-17", hora: "10:00" }, HOJE)).toBeNull();
    expect(confirmacaoVisitaValida({ data: "2026-08-22", hora: "25:00" }, HOJE)).toBeNull();
  });
});
