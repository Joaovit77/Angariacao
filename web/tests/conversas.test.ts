import { describe, expect, it } from "vitest";
import {
  contagensConversas,
  conversasDosImoveis,
  filtrarConversas,
  mensagensDaConversa,
  negociacaoAtiva,
  valorMonetarioContexto,
  type FiltrosConversas,
} from "@/lib/calculo/conversas";
import type { Imovel, NotaImovel } from "@/lib/tipos";

const HOJE = "2026-08-25";
const TODAS: FiltrosConversas = { principal: "todas", naoLidas: false, agendadas: false };

function imovel(over: Partial<Imovel> = {}): Imovel {
  return {
    id: "i1",
    codigo: "LD-168",
    endereco: "Rua das Palmeiras, 100",
    bairro: "Gleba Palhano",
    proprietarioNome: "Suzana Ribeiro",
    status: "Em negociação",
    ...over,
  };
}

function recebida(
  id: string,
  texto = "Tenho interesse",
  tipo = "conversation",
  lida?: boolean,
): NotaImovel {
  return {
    id: `wa:${id}`,
    texto: `Resposta pelo WhatsApp: ${texto}`,
    data: `2026-08-25T10:${id.padStart(2, "0")}`,
    direcao: "recebida",
    tipo,
    ...(lida === undefined ? {} : { lida }),
  };
}

function enviada(id: string, texto = "Posso ajudar?"): NotaImovel {
  return {
    id: `wa-enviada:${id}`,
    texto: `Mensagem enviada pelo WhatsApp: ${texto}`,
    data: `2026-08-25T09:${id.padStart(2, "0")}`,
    direcao: "enviada",
    tipo: "conversation",
    origem: "api-evolution",
  };
}

describe("mensagensDaConversa", () => {
  it("monta o histórico bidirecional e ignora notas internas do CRM", () => {
    const mensagens = mensagensDaConversa(imovel({
      notas: [
        { id: "manual", texto: "Ligar na sexta", data: "2026-08-24T09:00" },
        recebida("10"),
        enviada("11"),
      ],
    }));

    expect(mensagens.map((mensagem) => [mensagem.direcao, mensagem.texto])).toEqual([
      ["enviada", "Posso ajudar?"],
      ["recebida", "Tenho interesse"],
    ]);
  });

  it("mantém mídia sem conteúdo como resposta real", () => {
    const [mensagem] = mensagensDaConversa(imovel({
      notas: [recebida("10", "[imagem]", "imageMessage")],
    }));
    expect(mensagem.soMidia).toBe(true);
    expect(mensagem.tipo).toBe("imageMessage");
  });

  it("oculta reações antigas persistidas e não as conta como não lidas", () => {
    const item = imovel({
      notas: [
        recebida("09", "[mensagem sem texto]", "reactionMessage"),
        recebida("10", "Bom dia", "conversation", true),
      ],
    });

    expect(mensagensDaConversa(item).map((mensagem) => mensagem.id)).toEqual(["wa:10"]);
    expect(conversasDosImoveis([item], HOJE)[0].naoLidas).toBe(0);
  });

  it("não duplica mensagens quando o mesmo retrato chega novamente pelo tempo real", () => {
    const nota = recebida("10");
    expect(mensagensDaConversa(imovel({ notas: [nota, nota] }))).toHaveLength(1);
  });
});

describe("classificação operacional", () => {
  it("coloca resposta textual em Em andamento", () => {
    expect(conversasDosImoveis([imovel({ notas: [recebida("10")] })], HOJE)[0].emAndamento).toBe(true);
  });

  it.each([
    ["áudio", "audioMessage"],
    ["imagem", "imageMessage"],
    ["documento", "documentMessage"],
  ])("considera %s recebido como conversa em andamento", (rotulo, tipo) => {
    const [conversa] = conversasDosImoveis([
      imovel({ notas: [recebida("10", `[${rotulo}]`, tipo)] }),
    ], HOJE);
    expect(conversa.emAndamento).toBe(true);
    expect(conversa.naoRespondida).toBe(false);
  });

  it("considera conteúdo técnico recebido sem texto uma resposta válida", () => {
    const [conversa] = conversasDosImoveis([
      imovel({ notas: [recebida("10", "[mensagem sem texto]", "unknownMessage")] }),
    ], HOJE);
    expect(conversa.emAndamento).toBe(true);
  });

  it("não transforma nota interna ou evento do sistema em conversa", () => {
    const notas: NotaImovel[] = [
      { id: "manual", texto: "Revisar contrato", data: "2026-08-25T10:00" },
      { id: "sophia:1", texto: "Autorização assinada", data: "2026-08-25T10:01" },
    ];
    expect(conversasDosImoveis([imovel({ notas })], HOJE)).toEqual([]);
  });

  it("coloca conversa apenas enviada em Não respondidas", () => {
    const [conversa] = conversasDosImoveis([imovel({ notas: [enviada("10")] })], HOJE);
    expect(conversa.naoRespondida).toBe(true);
    expect(conversa.emAndamento).toBe(false);
  });

  it("agendamento pendente e tentativa com falha não criam conversa não respondida", () => {
    const semSaidaConfirmada = imovel({
      tentativas: [{
        id: "falha",
        data: "2026-08-25T09:00",
        canal: "WhatsApp",
        resultado: "sem-resposta",
        observacao: "Falha de envio",
      }],
    });
    const conversas = conversasDosImoveis([semSaidaConfirmada], HOJE);
    expect(filtrarConversas(conversas, "", { ...TODAS, principal: "nao-respondidas" }, new Set(["i1"]))).toEqual([]);
  });

  it("move a conversa de Não respondidas para Em andamento após qualquer resposta", () => {
    const antes = conversasDosImoveis([imovel({ notas: [enviada("10")] })], HOJE)[0];
    const depois = conversasDosImoveis([imovel({ notas: [enviada("10"), recebida("11")] })], HOJE)[0];
    expect([antes.naoRespondida, antes.emAndamento]).toEqual([true, false]);
    expect([depois.naoRespondida, depois.emAndamento]).toEqual([false, true]);
  });

  it.each(["Sem resposta", "Perdido", "Cancelado", "Locado"])(
    "exclui a etapa terminal %s dos filtros operacionais",
    (status) => {
      const [conversa] = conversasDosImoveis([imovel({ status, notas: [recebida("10")] })], HOJE);
      expect(negociacaoAtiva(conversa.imovel)).toBe(false);
      expect(filtrarConversas([conversa], "", { ...TODAS, principal: "em-andamento" })).toEqual([]);
    },
  );

  it("exclui imóvel retirado dos filtros operacionais sem removê-lo de Todas", () => {
    const [conversa] = conversasDosImoveis([imovel({ retirado: true, notas: [recebida("10")] })], HOJE);
    expect(filtrarConversas([conversa], "", TODAS)).toHaveLength(1);
    expect(filtrarConversas([conversa], "", { ...TODAS, principal: "em-andamento" })).toEqual([]);
  });
});

describe("combinação e contagens dos filtros", () => {
  const emAndamentoNaoLida = imovel({ id: "a", notas: [recebida("10")] });
  const emAndamentoLida = imovel({
    id: "b",
    codigo: "LD-200",
    proprietarioNome: "José",
    bairro: "Centro",
    notas: [recebida("11", "Obrigado", "conversation", true)],
  });
  const naoRespondida = imovel({
    id: "c",
    codigo: "LD-300",
    proprietarioNome: "Carlos",
    notas: [enviada("12")],
  });
  const conversas = conversasDosImoveis([emAndamentoNaoLida, emAndamentoLida, naoRespondida], HOJE);
  const agendadas = new Set(["a", "c"]);

  it("combina busca sem acento com o filtro principal", () => {
    expect(
      filtrarConversas(conversas, "jose", { ...TODAS, principal: "em-andamento" }).map((item) => item.imovel.id),
    ).toEqual(["b"]);
    expect(
      filtrarConversas(conversas, "carlos", { ...TODAS, principal: "em-andamento" }),
    ).toEqual([]);
  });

  it("combina Não lidas com o filtro principal", () => {
    expect(
      filtrarConversas(conversas, "", {
        principal: "em-andamento",
        naoLidas: true,
        agendadas: false,
      }).map((item) => item.imovel.id),
    ).toEqual(["a"]);
  });

  it("combina Agendadas com o filtro principal", () => {
    expect(
      filtrarConversas(conversas, "", {
        principal: "nao-respondidas",
        naoLidas: false,
        agendadas: true,
      }, agendadas).map((item) => item.imovel.id),
    ).toEqual(["c"]);
  });

  it("produz contagens facetadas sem misturar dados fora da entrada escopada", () => {
    expect(contagensConversas(conversas, "", TODAS, agendadas)).toEqual({
      todas: 3,
      emAndamento: 2,
      naoRespondidas: 1,
      naoLidas: 1,
      agendadas: 2,
    });
    const apenasContaAutenticada = conversas.filter((conversa) => conversa.imovel.id !== "c");
    expect(contagensConversas(apenasContaAutenticada, "", TODAS, agendadas).todas).toBe(2);
  });
});

describe("valorMonetarioContexto", () => {
  it("mostra zero e ausência como não informados apenas na interface", () => {
    expect(valorMonetarioContexto(0)).toEqual({ texto: "Valor não informado", informado: false });
    expect(valorMonetarioContexto(null, "Condomínio não informado")).toEqual({
      texto: "Condomínio não informado",
      informado: false,
    });
    expect(valorMonetarioContexto(2700).informado).toBe(true);
  });
});
