/* Contrato do webhook de recebimento (lib/calculo/webhookWhatsapp).
   Feature nova — não há oráculo do app antigo. Os payloads usados aqui
   são a FORMA real observada na Evolution 2.3.7 em produção (números e
   nomes trocados), porque o valor destes testes está em travar o formato
   que a instância de verdade manda, não um formato imaginado. */
import { describe, expect, it } from "vitest";
import {
  fecharTentativaPendente,
  interpretarEvento,
  telefoneCanonico,
  textoDaMensagem,
} from "@/lib/calculo/webhookWhatsapp";
import type { Imovel, Tentativa } from "@/lib/tipos";

/* --- telefoneCanonico -------------------------------------------------------
   Esta é a tabela que PRENDE a função à gêmea `telefone_canonico()` do
   Postgres (supabase-schema.sql). Foi rodada lá antes de existir aqui, e a
   saída conferida uma a uma. Se alguém mexer em uma das duas sem mexer na
   outra, o casamento passa a falhar em silêncio — e é este teste que grita. */
describe("telefoneCanonico (gêmea da função do banco)", () => {
  const CASOS: [string, string | null][] = [
    ["(43) 99802-4316", "4398024316"], // como o corretor digita
    ["5543998024316", "4398024316"], // DDI + nono dígito
    ["554398024316", "4398024316"], // DDI sem o nono (a forma do jid)
    ["43998024316", "4398024316"], // sem DDI, com o nono
    ["(43) 3324-5678", "4333245678"], // fixo: intocado
    ["043 99802-4316", "4398024316"], // DDD escrito com zero
    ["+1 415 555 2671", null], // estrangeiro
    ["5514155552671", null], // estrangeiro disfarçado de nacional
    ["123", null],
    ["", null],
  ];

  for (const [entrada, esperado] of CASOS) {
    it(`${entrada || "(vazio)"} -> ${esperado ?? "null"}`, () => {
      expect(telefoneCanonico(entrada)).toBe(esperado);
    });
  }

  it("null e undefined não quebram", () => {
    expect(telefoneCanonico(null)).toBeNull();
    expect(telefoneCanonico(undefined)).toBeNull();
  });

  it("as quatro grafias do mesmo número caem no mesmo valor", () => {
    const formas = ["(43) 99802-4316", "5543998024316", "554398024316", "43998024316"];
    const canonicos = new Set(formas.map(telefoneCanonico));
    expect(canonicos.size).toBe(1);
  });
});

/* --- interpretarEvento ---------------------------------------------------- */

/** Payload no formato real da Evolution 2.3.7 (campos que não usamos omitidos). */
function evento(over: {
  event?: string;
  instance?: string;
  fromMe?: boolean;
  id?: string;
  remoteJid?: string;
  remoteJidAlt?: string;
  message?: unknown;
  messageType?: string;
}): unknown {
  return {
    event: over.event ?? "messages.upsert",
    instance: over.instance ?? "Angarimovel",
    data: {
      key: {
        remoteJid: over.remoteJid ?? "554398024316@s.whatsapp.net",
        remoteJidAlt: over.remoteJidAlt,
        fromMe: over.fromMe ?? false,
        id: over.id ?? "3EB0322C86C02D2331D663",
        addressingMode: "lid",
      },
      pushName: "José Ricardo",
      message: over.message ?? { conversation: "Pode me mandar mais detalhes?" },
      messageType: over.messageType ?? "conversation",
    },
    sender: "554391137509@s.whatsapp.net",
    apikey: "TOKEN-DA-INSTANCIA",
  };
}

describe("interpretarEvento", () => {
  it("lê uma resposta de proprietário", () => {
    expect(interpretarEvento(evento({}))).toEqual({
      instancia: "Angarimovel",
      mensagemId: "3EB0322C86C02D2331D663",
      telefone: "4398024316",
      texto: "Pode me mandar mais detalhes?",
      tipo: "conversation",
    });
  });

  it("ignora a nossa própria mensagem (fromMe)", () => {
    expect(interpretarEvento(evento({ fromMe: true }))).toBeNull();
  });

  it("ignora evento que não é messages.upsert", () => {
    expect(interpretarEvento(evento({ event: "connection.update" }))).toBeNull();
  });

  it("ignora grupo", () => {
    expect(interpretarEvento(evento({ remoteJid: "120363042@g.us" }))).toBeNull();
  });

  it("ignora o status do WhatsApp", () => {
    expect(interpretarEvento(evento({ remoteJid: "status@broadcast" }))).toBeNull();
  });

  it("no modo LID, cai no remoteJidAlt quando o remoteJid não é telefone", () => {
    const lido = interpretarEvento(
      evento({ remoteJid: "182736451827364@lid", remoteJidAlt: "554398024316@s.whatsapp.net" }),
    );
    expect(lido?.telefone).toBe("4398024316");
  });

  it("descarta quando nem remoteJid nem remoteJidAlt são telefone utilizável", () => {
    expect(interpretarEvento(evento({ remoteJid: "182736451827364@lid" }))).toBeNull();
  });

  it("descarta número estrangeiro", () => {
    expect(interpretarEvento(evento({ remoteJid: "14155552671@s.whatsapp.net" }))).toBeNull();
  });

  it("descarta evento sem instância (não daria para saber de qual corretor é)", () => {
    expect(interpretarEvento(evento({ instance: "" }))).toBeNull();
  });

  it("descarta evento sem id da mensagem (sem ele não há como evitar reentrega)", () => {
    expect(interpretarEvento(evento({ id: "" }))).toBeNull();
  });

  it("não quebra com lixo", () => {
    expect(interpretarEvento(null)).toBeNull();
    expect(interpretarEvento("texto solto")).toBeNull();
    expect(interpretarEvento({})).toBeNull();
    expect(interpretarEvento({ event: "messages.upsert", instance: "X", data: null })).toBeNull();
  });

  it("aceita mensagem sem texto (áudio, figurinha): chegou resposta mesmo assim", () => {
    const lido = interpretarEvento(evento({ message: { audioMessage: {} }, messageType: "audioMessage" }));
    expect(lido?.texto).toBe("");
    expect(lido?.tipo).toBe("audioMessage");
  });
});

describe("textoDaMensagem", () => {
  it("lê conversation", () => {
    expect(textoDaMensagem({ conversation: "oi" })).toBe("oi");
  });

  it("lê extendedTextMessage (texto longo, link ou resposta a outra mensagem)", () => {
    expect(textoDaMensagem({ extendedTextMessage: { text: "segue o link" } })).toBe("segue o link");
  });

  it("lê a legenda de foto e de vídeo", () => {
    expect(textoDaMensagem({ imageMessage: { caption: "essa é a sala" } })).toBe("essa é a sala");
    expect(textoDaMensagem({ videoMessage: { caption: "vídeo do imóvel" } })).toBe("vídeo do imóvel");
  });

  it("devolve vazio para o que não tem texto", () => {
    expect(textoDaMensagem({ audioMessage: {} })).toBe("");
    expect(textoDaMensagem(null)).toBe("");
  });
});

/* --- fecharTentativaPendente ---------------------------------------------- */

const HOJE = "2026-07-22";

function tentativa(over: Partial<Tentativa> & { id: string; data: string }): Tentativa {
  return {
    abordagemId: "a1",
    canal: "WhatsApp",
    resultado: "sem-resposta",
    ...over,
  };
}

function imovel(tentativas: Tentativa[]): Imovel {
  return {
    id: "i1",
    endereco: "Rua Souza Naves, 100",
    status: "Sem resposta",
    statusHistory: [{ status: "Novo contato", date: "2026-07-01" }],
    tentativas,
  };
}

describe("fecharTentativaPendente", () => {
  it("fecha a tentativa que esperava desfecho", () => {
    const t = tentativa({ id: "t1", data: "2026-07-20T10:00", aguardandoResultado: true });
    const r = fecharTentativaPendente(imovel([t]), HOJE);
    expect(r?.fechada.resultado).toBe("respondeu");
    expect(r?.fechada.aguardandoResultado).toBeUndefined();
    expect(r?.tentativas).toHaveLength(1);
  });

  it("não toca em tentativa anotada à mão — ali o 'sem resposta' é afirmação do corretor", () => {
    const t = tentativa({ id: "t1", data: "2026-07-20T10:00" }); // sem a marca
    expect(fecharTentativaPendente(imovel([t]), HOJE)).toBeNull();
  });

  it("fecha a mais recente: a resposta responde à última mensagem", () => {
    const antiga = tentativa({ id: "t1", data: "2026-07-15T10:00", aguardandoResultado: true });
    const nova = tentativa({ id: "t2", data: "2026-07-21T09:00", aguardandoResultado: true });
    const r = fecharTentativaPendente(imovel([antiga, nova]), HOJE);
    expect(r?.fechada.id).toBe("t2");
    // a antiga fica como estava — ela de fato não teve resposta
    expect(r?.tentativas.find((t) => t.id === "t1")?.aguardandoResultado).toBe(true);
  });

  it("ignora tentativa fora da janela do nudge: conversa nova não ressuscita cobrança velha", () => {
    const velha = tentativa({ id: "t1", data: "2026-06-01T10:00", aguardandoResultado: true });
    expect(fecharTentativaPendente(imovel([velha]), HOJE)).toBeNull();
  });

  it("devolve null quando não há tentativa nenhuma (caso comum, não é erro)", () => {
    expect(fecharTentativaPendente(imovel([]), HOJE)).toBeNull();
  });

  it("preserva as demais tentativas do histórico", () => {
    const outra = tentativa({ id: "t0", data: "2026-07-10T10:00", resultado: "recusou" });
    const alvo = tentativa({ id: "t1", data: "2026-07-20T10:00", aguardandoResultado: true });
    const r = fecharTentativaPendente(imovel([outra, alvo]), HOJE);
    expect(r?.tentativas).toHaveLength(2);
    expect(r?.tentativas.find((t) => t.id === "t0")?.resultado).toBe("recusou");
  });

  it("não muta o array original", () => {
    const t = tentativa({ id: "t1", data: "2026-07-20T10:00", aguardandoResultado: true });
    const original = imovel([t]);
    fecharTentativaPendente(original, HOJE);
    expect(original.tentativas?.[0].aguardandoResultado).toBe(true);
    expect(original.tentativas?.[0].resultado).toBe("sem-resposta");
  });
});
