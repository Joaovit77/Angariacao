import { describe, expect, it } from "vitest";
import { dataHoraLocalParaIso, timestampDeIso } from "@/lib/datas";
import { fromDbMensagem, telefoneValido } from "@/lib/mensagensAgendadas";

describe("mensagens agendadas", () => {
  it("aceita celulares e fixos brasileiros formatados", () => {
    expect(telefoneValido("(43) 99802-4316")).toBe(true);
    expect(telefoneValido("+55 43 3322-1100")).toBe(true);
    expect(telefoneValido("123")).toBe(false);
  });

  it("converte data e horário local para timestamptz válido", () => {
    const iso = dataHoraLocalParaIso("2026-08-15", "09:00");
    expect(iso).toBeTruthy();
    expect(timestampDeIso(iso)).toBeTypeOf("number");
    expect(dataHoraLocalParaIso("", "09:00")).toBeNull();
  });

  it("mapeia o registro do Supabase sem perder status e envio real", () => {
    const item = fromDbMensagem({ id: "m1", user_id: "u1", imovel_id: "i1",
      nome_proprietario: "João", telefone: "43998024316", mensagem: "Olá",
      data_envio: "2026-08-15T12:00:00.000Z", status: "enviada",
      enviado_em: "2026-08-15T12:00:02.000Z", erro: null });
    expect(item).toMatchObject({ id: "m1", userId: "u1", imovelId: "i1", status: "enviada" });
    expect(item.enviadoEm).toBe("2026-08-15T12:00:02.000Z");
  });
});
