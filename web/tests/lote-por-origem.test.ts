/* ================================================================
   O LOTE SEPARADO PELA ORIGEM DO IMÓVEL

   O que estes testes guardam é uma frase que saiu errada para gente
   real: em 03/08/2026 o lote mandou "vi que o imóvel está disponível
   para locação" a quatro proprietários de imóvel que só se sabia
   estar DESOCUPADO (origem "Copel desocupado"). O caso do Copel
   aparece aqui pelo nome de propósito.
   ================================================================ */
import { describe, expect, it } from "vitest";
import {
  abordagensQueServem,
  agruparLotePorOrigem,
  ROTULO_SEM_ORIGEM,
  origensSemRoteiro,
} from "@/lib/calculo/lotePorOrigem";
import type { Abordagem, Imovel } from "@/lib/tipos";

function imovel(id: string, origem: string): Imovel {
  return {
    id,
    endereco: `Rua ${id}`,
    bairro: "",
    proprietarioNome: `Dono ${id}`,
    origemImovel: origem,
    status: "Sem resposta",
  };
}

function abordagem(id: string, nome: string, origens: string[], arquivada = false): Abordagem {
  return { id, nome, roteiro: `Roteiro ${nome}`, origens, arquivada };
}

const VAZIO = "Imóvel vazio e interesse em locação";
const RETOMADA = "Retomada educada do contato";

describe("abordagensQueServem", () => {
  it("acha a abordagem que declara a origem", () => {
    const catalogo = [abordagem("a1", VAZIO, ["Copel desocupado"])];
    expect(abordagensQueServem(catalogo, "Copel desocupado").map((a) => a.id)).toEqual(["a1"]);
  });

  it("ignora espaços em volta do rótulo, dos dois lados", () => {
    const catalogo = [abordagem("a1", VAZIO, [" Copel desocupado "])];
    expect(abordagensQueServem(catalogo, "Copel desocupado ")).toHaveLength(1);
  });

  it("não casa origem parecida com origem igual", () => {
    const catalogo = [abordagem("a1", VAZIO, ["Copel desocupado"])];
    expect(abordagensQueServem(catalogo, "Copel")).toHaveLength(0);
  });

  it("abordagem arquivada não declara nada", () => {
    // Ela sai dos seletores, então pré-selecioná-la deixaria o corretor com um
    // roteiro que ele não consegue trocar.
    const catalogo = [abordagem("a1", VAZIO, ["Copel desocupado"], true)];
    expect(abordagensQueServem(catalogo, "Copel desocupado")).toHaveLength(0);
  });

  it("imóvel sem origem não casa com declaração nenhuma", () => {
    const catalogo = [abordagem("a1", VAZIO, ["Copel desocupado"])];
    expect(abordagensQueServem(catalogo, "")).toHaveLength(0);
    expect(abordagensQueServem(catalogo, null)).toHaveLength(0);
  });
});

describe("agruparLotePorOrigem", () => {
  it("o Copel não compartilha texto com o garimpo em site", () => {
    // O caso de 03/08/2026, que é a razão de o módulo existir.
    const catalogo = [
      abordagem("a1", VAZIO, ["Copel desocupado"]),
      abordagem("a2", RETOMADA, ["Garimpo em site de imobiliária"]),
    ];
    const grupos = agruparLotePorOrigem(
      [
        imovel("i1", "Copel desocupado"),
        imovel("i2", "Garimpo em site de imobiliária"),
        imovel("i3", "Copel desocupado"),
      ],
      catalogo,
    );

    expect(grupos).toHaveLength(2);
    expect(grupos[0].abordagemId).toBe("a1");
    expect(grupos[0].rotulo).toBe(VAZIO);
    expect(grupos[0].imoveis.map((i) => i.id)).toEqual(["i1", "i3"]);
    expect(grupos[1].abordagemId).toBe("a2");
  });

  it("origens que compartilham um roteiro declarado viram UM grupo", () => {
    // É esta regra que transforma oito origens em três conversas: o corretor
    // declara e o app junta, em vez de uma tabela de premissas no código
    // adivinhar rótulos que ele mesmo inventou.
    const catalogo = [
      abordagem("a2", RETOMADA, ["Garimpo em site de imobiliária", "Chaves na mão", "Wimoveis"]),
    ];
    const grupos = agruparLotePorOrigem(
      [
        imovel("i1", "Garimpo em site de imobiliária"),
        imovel("i2", "Chaves na mão"),
        imovel("i3", "Wimoveis"),
      ],
      catalogo,
    );

    expect(grupos).toHaveLength(1);
    expect(grupos[0].imoveis).toHaveLength(3);
    expect(grupos[0].origens).toEqual([
      "Garimpo em site de imobiliária",
      "Chaves na mão",
      "Wimoveis",
    ]);
  });

  it("sem declaração nenhuma, cada origem fica no seu grupo", () => {
    // O pior caso aceitável: mais escolhas para o corretor, e nenhuma mistura
    // silenciosa. Nunca um texto só para todos, que era o comportamento antigo.
    const grupos = agruparLotePorOrigem(
      [
        imovel("i1", "Copel desocupado"),
        imovel("i2", "Garimpo em site de imobiliária"),
        imovel("i3", "Copel desocupado"),
      ],
      [],
    );

    expect(grupos).toHaveLength(2);
    expect(grupos.every((g) => g.abordagemId === null)).toBe(true);
    expect(grupos[0].rotulo).toBe("Copel desocupado");
  });

  it("duas abordagens declarando a mesma origem não pré-selecionam ninguém", () => {
    const catalogo = [
      abordagem("a1", VAZIO, ["Copel desocupado"]),
      abordagem("a2", "Outro roteiro de vazio", ["Copel desocupado"]),
    ];
    const grupos = agruparLotePorOrigem([imovel("i1", "Copel desocupado")], catalogo);

    expect(grupos).toHaveLength(1);
    expect(grupos[0].abordagemId).toBeNull();
    expect(grupos[0].ambiguo).toBe(true);
  });

  it("imóvel sem origem cadastrada entra no lote, com rótulo próprio", () => {
    // Ele é o cadastro rápido da época em que origem não era gravada. Sumir do
    // lote seria perder gente que está esperando resposta.
    const grupos = agruparLotePorOrigem([imovel("i1", "")], []);
    expect(grupos).toHaveLength(1);
    expect(grupos[0].rotulo).toBe(ROTULO_SEM_ORIGEM);
    expect(grupos[0].imoveis).toHaveLength(1);
  });

  it("a ordem dos grupos segue a fila, não o tamanho deles", () => {
    // Ordenar por volume poria o silêncio na frente todo dia: em captação ele é
    // sempre a categoria mais populosa. É a armadilha que matou a faixa de
    // "imóvel parado" no termômetro.
    const grupos = agruparLotePorOrigem(
      [
        imovel("i1", "Redes sociais"),
        imovel("i2", "Garimpo em site de imobiliária"),
        imovel("i3", "Garimpo em site de imobiliária"),
        imovel("i4", "Garimpo em site de imobiliária"),
      ],
      [],
    );

    expect(grupos.map((g) => g.rotulo)).toEqual(["Redes sociais", "Garimpo em site de imobiliária"]);
  });

  it("nenhum imóvel se perde nem se repete no agrupamento", () => {
    const catalogo = [abordagem("a1", VAZIO, ["Copel desocupado", "Placa no imóvel"])];
    const entrada = [
      imovel("i1", "Copel desocupado"),
      imovel("i2", "Redes sociais"),
      imovel("i3", "Placa no imóvel"),
      imovel("i4", ""),
      imovel("i5", "Redes sociais"),
    ];
    const ids = agruparLotePorOrigem(entrada, catalogo).flatMap((g) => g.imoveis.map((i) => i.id));

    expect(ids.sort()).toEqual(["i1", "i2", "i3", "i4", "i5"]);
  });
});

describe("origensSemRoteiro", () => {
  it("lista só as origens sem roteiro declarado, sem repetir", () => {
    const catalogo = [abordagem("a1", VAZIO, ["Copel desocupado"])];
    const grupos = agruparLotePorOrigem(
      [
        imovel("i1", "Copel desocupado"),
        imovel("i2", "Redes sociais"),
        imovel("i3", "Redes sociais"),
        imovel("i4", "OLX / Canal Pro"),
      ],
      catalogo,
    );

    expect(origensSemRoteiro(grupos)).toEqual(["Redes sociais", "OLX / Canal Pro"]);
  });

  it("tudo declarado devolve lista vazia", () => {
    const catalogo = [abordagem("a1", VAZIO, ["Copel desocupado"])];
    const grupos = agruparLotePorOrigem([imovel("i1", "Copel desocupado")], catalogo);
    expect(origensSemRoteiro(grupos)).toEqual([]);
  });
});
