import { describe, expect, it } from "vitest";
import { destinoWhatsappPorJidsConhecidos } from "@/lib/calculo/importacaoConversaWhatsapp";

describe("destino de WhatsApp ancorado na conversa", () => {
  it("prefere o JID numérico canônico observado na mesma conversa", () => {
    expect(
      destinoWhatsappPorJidsConhecidos(
        ["123456789@lid", "554398024316@s.whatsapp.net"],
        "+55 (43) 99802-4316",
      ),
    ).toBe("554398024316");
  });

  it("usa o LID observado quando a busca por telefone não representa a identidade atual", () => {
    expect(
      destinoWhatsappPorJidsConhecidos(["123456789@lid"], "+55 (43) 99802-4316"),
    ).toBe("123456789@lid");
  });

  it("nunca aceita JID numérico de outro telefone nem grupo", () => {
    expect(
      destinoWhatsappPorJidsConhecidos(
        ["5511999999999@s.whatsapp.net", "120363000000@g.us", "status@broadcast"],
        "+55 (43) 99802-4316",
      ),
    ).toBeNull();
  });

  it("recusa domínios e LIDs malformados mesmo quando o número coincide", () => {
    expect(
      destinoWhatsappPorJidsConhecidos(
        ["5543998024316@exemplo.invalid", "lid-sem-numero@lid"],
        "+55 (43) 99802-4316",
      ),
    ).toBeNull();
  });
});
