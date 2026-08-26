import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { dataHoraLocalParaIso, timestampDeIso } from "@/lib/datas";
import {
  fromDbMensagem,
  imoveisComAgendamentoAtivo,
  telefoneValido,
  type MensagemAgendada,
} from "@/lib/mensagensAgendadas";

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

describe("imoveisComAgendamentoAtivo", () => {
  const base: MensagemAgendada = {
    id: "m1",
    userId: "u1",
    imovelId: "i1",
    nomeProprietario: "Ana",
    telefone: "43999999999",
    mensagem: "Olá",
    dataEnvio: "2026-08-26T10:00:00",
    status: "agendada",
    enviadoEm: null,
    erro: null,
  };

  it("conta conversas únicas com itens agendados ou processando", () => {
    const ids = imoveisComAgendamentoAtivo([
      base,
      { ...base, id: "m2" },
      { ...base, id: "m3", imovelId: "i2", status: "processando" },
      { ...base, id: "m4", imovelId: "i3", status: "erro" },
      { ...base, id: "m5", imovelId: null },
    ]);
    expect([...ids]).toEqual(["i1", "i2"]);
  });
});
const SCHEMA = readFileSync(new URL("../../supabase-schema.sql", import.meta.url), "utf8");
const VERCEL = readFileSync(new URL("../vercel.json", import.meta.url), "utf8");

describe("executor de mensagens agendadas", () => {
  it("vence mensagens antigas antes de obter o lote", () => {
    expect(SCHEMA).toContain("erro = 'janela-expirada'");
    expect(SCHEMA).toContain("data_envio < now() - interval '10 minutes'");
    expect(SCHEMA).toContain("data_envio >= now() - interval '10 minutes'");
  });

  it("usa o relogio do Supabase sem recolocar o Cron incompativel na Vercel Hobby", () => {
    expect(SCHEMA).toContain("'processar-mensagens-agendadas'");
    expect(SCHEMA).toContain("'* * * * *'");
    expect(SCHEMA).toContain("mensagens_cron_secret");
    expect(VERCEL).not.toContain("/api/cron/mensagens");
  });

  it("nao expoe a configuracao do Cron a usuarios do Data API", () => {
    expect(SCHEMA).toContain(
      "revoke all on function configurar_cron_mensagens(text, text) from public, anon, authenticated",
    );
    expect(SCHEMA).toContain(
      "grant execute on function configurar_cron_mensagens(text, text) to service_role",
    );
  });
});
