import { afterEach, describe, expect, it, vi } from "vitest";
import { destinoWhatsappPorJidsConhecidos } from "@/lib/calculo/importacaoConversaWhatsapp";
import { destinoAncoradoDaConversa } from "@/lib/servidor/identidadeWhatsapp";

function nota(id: string) {
  return { id, texto: "Mensagem de teste", data: "2026-08-28T14:00:00" };
}

function envelope(id: string, remoteJid: string, remoteJidAlt?: string) {
  return {
    messages: {
      records: [{ key: { id, remoteJid, ...(remoteJidAlt ? { remoteJidAlt } : {}) } }],
    },
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
});

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

  it("recupera um LID somente pela mensagem recebida já ancorada no imóvel", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      Response.json(envelope("mensagem-recebida-1", "123456789012345@lid")),
    );
    vi.stubGlobal("fetch", fetcher);

    const destino = await destinoAncoradoDaConversa(
      "https://evolution.example",
      "instancia-1",
      "token-instancia",
      "+55 (43) 99802-4316",
      [nota("wa:mensagem-recebida-1")],
    );

    expect(destino).toBe("123456789012345@lid");
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(JSON.parse(String(fetcher.mock.calls[0][1]?.body))).toMatchObject({
      where: { key: { id: "mensagem-recebida-1" } },
    });
  });

  it("mantém compatibilidade com JID legado sem o nono dígito", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(
        Response.json(envelope("mensagem-enviada-antiga", "554398024316@c.us")),
      ),
    );

    const destino = await destinoAncoradoDaConversa(
      "https://evolution.example",
      "instancia-1",
      "token-instancia",
      "+55 (43) 99802-4316",
      [nota("wa-enviada:mensagem-enviada-antiga")],
    );

    expect(destino).toBe("554398024316");
  });

  it("não usa identidade de outra conversa devolvida pela busca", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>().mockResolvedValue(
        Response.json(envelope("mensagem-de-outra-conversa", "987654321012345@lid")),
      ),
    );

    const destino = await destinoAncoradoDaConversa(
      "https://evolution.example",
      "instancia-1",
      "token-instancia",
      "+55 (43) 99802-4316",
      [nota("wa:mensagem-conhecida")],
    );

    expect(destino).toBeNull();
  });

  it.each(["120363000000@g.us", "status@broadcast"])(
    "bloqueia destino não individual ancorado: %s",
    async (jid) => {
      vi.stubGlobal(
        "fetch",
        vi.fn<typeof fetch>().mockResolvedValue(Response.json(envelope("mensagem-conhecida", jid))),
      );

      const destino = await destinoAncoradoDaConversa(
        "https://evolution.example",
        "instancia-1",
        "token-instancia",
        "+55 (43) 99802-4316",
        [nota("wa:mensagem-conhecida")],
      );

      expect(destino).toBeNull();
    },
  );

  it("bloqueia sem id externo confiável e nem consulta a Evolution", async () => {
    const fetcher = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetcher);

    const destino = await destinoAncoradoDaConversa(
      "https://evolution.example",
      "instancia-1",
      "token-instancia",
      "+55 (43) 99802-4316",
      [nota("nota-manual-1")],
    );

    expect(destino).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("limita a recuperação às seis âncoras externas mais recentes", async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (_url, init) => {
      const id = JSON.parse(String(init?.body)).where.key.id as string;
      return Response.json(envelope(id, "123456789012345@lid"));
    });
    vi.stubGlobal("fetch", fetcher);

    const notas = Array.from({ length: 8 }, (_, indice) => nota(`wa:mensagem-${indice + 1}`));
    const destino = await destinoAncoradoDaConversa(
      "https://evolution.example",
      "instancia-1",
      "token-instancia",
      "+55 (43) 99802-4316",
      notas,
    );

    const idsConsultados = fetcher.mock.calls.map(([, init]) => JSON.parse(String(init?.body)).where.key.id);
    expect(destino).toBe("123456789012345@lid");
    expect(fetcher).toHaveBeenCalledTimes(6);
    expect(idsConsultados).toEqual(expect.arrayContaining(["mensagem-3", "mensagem-8"]));
    expect(idsConsultados).not.toEqual(expect.arrayContaining(["mensagem-1", "mensagem-2"]));
  });
});
