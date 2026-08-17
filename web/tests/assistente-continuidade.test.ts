import { describe, expect, it } from "vitest";
import {
  compararEntidadeComResultadoAtual,
  entidadeDaRespostaAnterior,
  respostaNaturalDaContinuidade,
} from "@/lib/assistente/continuidade";
import { compactarBlocosParaHistorico } from "@/lib/assistente/historico";
import { resolverReferenciaImovelHistorico } from "@/lib/assistente/referencias";
import type {
  BlocoAssistente,
  ContextoAssistente,
  ItemHistoricoAssistente,
  PedidoAssistente,
} from "@/lib/assistente/tipos";
import { prepararResultadoFerramentaParaModelo } from "@/lib/servidor/assistente/orquestrador";

const PAGINA: ContextoAssistente = {
  rota: "/pipeline",
  pagina: "Pipeline",
  superficie: "pagina",
};

function blocoMarco(
  id: string,
  codigo: string,
  marco: "angariado" | "publicado" | "locado",
  marcoEm: string,
  endereco = "Rua Tijuca, 112",
): Extract<BlocoAssistente, { tipo: "imoveis" }> {
  return {
    tipo: "imoveis",
    titulo: marco === "angariado" ? "Angariacoes" : marco === "publicado" ? "Publicacoes" : "Locacoes",
    itens: [{
      id,
      codigo,
      endereco,
      bairro: "Parque do Lago Juliana",
      status: marco === "angariado" ? "Angariado" : marco === "publicado" ? "Publicado" : "Locado",
      responsavel: "Marina",
      marco,
      marcoEm,
    }],
  };
}

function respostaAnterior(bloco: BlocoAssistente, texto = "O último foi o imóvel consultado."): ItemHistoricoAssistente {
  return {
    papel: "assistente",
    texto,
    resultados: compactarBlocosParaHistorico([bloco]),
  };
}

function pedido(historico: ItemHistoricoAssistente[], contexto = PAGINA): PedidoAssistente {
  return {
    mensagem: "E o último publicado?",
    contexto,
    historico,
  };
}

describe("continuidade estrutural entre marcos históricos", () => {
  const angariado211 = blocoMarco("id-211", "LD-211", "angariado", "2026-08-17");
  const publicado211 = blocoMarco("id-211", "LD-211", "publicado", "2026-08-17");
  const publicado218 = blocoMarco("id-218", "LD-218", "publicado", "2026-08-18");
  const locado218 = blocoMarco("id-218", "LD-218", "locado", "2026-08-19");

  it("1. a primeira última angariação vira referência estruturada LD-211", () => {
    const resultados = compactarBlocosParaHistorico([angariado211]);
    expect(resultados).toEqual([{
      tipo: "imoveis",
      itens: [{
        id: "id-211",
        codigo: "LD-211",
        bairro: "Parque do Lago Juliana",
        status: "Angariado",
        marco: "angariado",
        marcoEm: "2026-08-17",
      }],
    }]);
  });

  it("2. reconhece o último publicado como o mesmo LD-211 pelo id", () => {
    const continuidade = compararEntidadeComResultadoAtual(
      PAGINA,
      [respostaAnterior(angariado211)],
      publicado211,
    );
    expect(continuidade).toMatchObject({
      relacao: "mesma_entidade",
      origemReferencia: "resultado_anterior",
      anterior: { id: "id-211", codigo: "LD-211", marco: "angariado" },
      atual: { id: "id-211", codigo: "LD-211", marco: "publicado" },
    });
  });

  it("3. a resposta textual explicita que é o mesmo imóvel", () => {
    const continuidade = compararEntidadeComResultadoAtual(PAGINA, [respostaAnterior(angariado211)], publicado211)!;
    expect(respostaNaturalDaContinuidade(continuidade)).toBe(
      "Foi o mesmo imóvel que mencionei acima: o LD-211. Ele foi publicado em 17/08/2026.",
    );
  });

  it("4. identifica quando o último publicado é outro imóvel", () => {
    expect(compararEntidadeComResultadoAtual(
      PAGINA,
      [respostaAnterior(angariado211)],
      publicado218,
    )).toMatchObject({
      relacao: "entidade_diferente",
      anterior: { id: "id-211" },
      atual: { id: "id-218" },
    });
  });

  it("5. a resposta deixa clara a troca para LD-218", () => {
    const continuidade = compararEntidadeComResultadoAtual(PAGINA, [respostaAnterior(angariado211)], publicado218)!;
    expect(respostaNaturalDaContinuidade(continuidade)).toBe(
      "Já o último publicado foi outro imóvel: o LD-218. Ele foi publicado em 18/08/2026.",
    );
  });

  it("6 e 7. a terceira pergunta com 'ele' resolve para a entidade da resposta mais recente", () => {
    const historico: ItemHistoricoAssistente[] = [
      respostaAnterior(angariado211),
      { papel: "usuario", texto: "E o último publicado?" },
      respostaAnterior(publicado218, "Já o último publicado foi outro imóvel: o LD-218."),
    ];
    expect(resolverReferenciaImovelHistorico("Ele está há quantos dias publicado?", historico)).toEqual({
      estado: "resolvida",
      id: "id-218",
      codigo: "LD-218",
      origem: "conversa",
    });
  });

  it("8. código explícito muda a entidade sem depender da referência anterior", () => {
    expect(resolverReferenciaImovelHistorico("E o valor do LD-224?", [respostaAnterior(publicado211)])).toEqual({
      estado: "resolvida",
      codigo: "LD-224",
      origem: "explicita",
    });
  });

  it("9. a entidade visual tem precedência sobre o resultado conversacional", () => {
    const contextoVisual: ContextoAssistente = {
      rota: "/pipeline",
      pagina: "Pipeline",
      superficie: "drawer",
      entidade: { tipo: "imovel", id: "id-218" },
    };
    expect(compararEntidadeComResultadoAtual(
      contextoVisual,
      [respostaAnterior(publicado211)],
      publicado218,
    )).toMatchObject({
      relacao: "mesma_entidade",
      origemReferencia: "entidade_visual",
      anterior: { id: "id-218" },
    });
  });

  it("10 e 11. card, metadado para o modelo e texto usam o mesmo imóvel e novo marco", () => {
    const preparado = prepararResultadoFerramentaParaModelo(
      { marco: "publicado", itensRetornados: 1, itens: publicado211.itens },
      publicado211,
      pedido([respostaAnterior(angariado211)]),
    );
    expect(publicado211.itens).toHaveLength(1);
    expect(publicado211.itens[0]).toMatchObject({ id: "id-211", codigo: "LD-211", marco: "publicado" });
    expect(JSON.parse(preparado.output)).toMatchObject({
      continuidadeConversacional: {
        relacao: "mesma_entidade",
        atual: { id: "id-211", codigo: "LD-211", marco: "publicado" },
      },
    });
    expect(respostaNaturalDaContinuidade(preparado.continuidade!)).toContain("LD-211");
  });

  it("12. não repete endereço, bairro ou responsável para a mesma entidade", () => {
    const continuidade = compararEntidadeComResultadoAtual(PAGINA, [respostaAnterior(angariado211)], publicado211)!;
    const texto = respostaNaturalDaContinuidade(continuidade);
    expect(texto).not.toContain("Rua Tijuca");
    expect(texto).not.toContain("Parque do Lago");
    expect(texto).not.toContain("Marina");
  });

  it("13. sem resultado novo de ferramenta não há comparação baseada só na memória", () => {
    expect(compararEntidadeComResultadoAtual(PAGINA, [respostaAnterior(angariado211)], undefined)).toBeNull();
    expect(prepararResultadoFerramentaParaModelo(
      { totalEncontrado: 1, itensRetornados: 0 },
      undefined,
      pedido([respostaAnterior(angariado211)]),
    ).continuidade).toBeNull();
  });

  it.each([
    ["angariado", "O marco de angariação foi em 17/08/2026."],
    ["publicado", "Ele foi publicado em 17/08/2026."],
    ["locado", "Ele foi locado em 17/08/2026."],
  ] as const)("14. mesma entidade com marco %s", (marco, trecho) => {
    const atual = blocoMarco("id-211", "LD-211", marco, "2026-08-17");
    const continuidade = compararEntidadeComResultadoAtual(PAGINA, [respostaAnterior(angariado211)], atual)!;
    expect(continuidade.relacao).toBe("mesma_entidade");
    expect(respostaNaturalDaContinuidade(continuidade)).toContain(trecho);
  });

  it("15. sequência igual na publicação e diferente na locação", () => {
    const segunda = compararEntidadeComResultadoAtual(PAGINA, [respostaAnterior(angariado211)], publicado211)!;
    expect(respostaNaturalDaContinuidade(segunda)).toContain("mesmo imóvel");

    const historicoAtePublicacao: ItemHistoricoAssistente[] = [
      respostaAnterior(angariado211),
      { papel: "usuario", texto: "E o último publicado?" },
      respostaAnterior(publicado211),
    ];
    const terceira = compararEntidadeComResultadoAtual(PAGINA, historicoAtePublicacao, locado218)!;
    expect(respostaNaturalDaContinuidade(terceira)).toBe(
      "Já o último locado foi outro imóvel: o LD-218. Ele foi locado em 19/08/2026.",
    );
  });

  it("não exagera depois de uma resposta quantitativa sem entidade", () => {
    const historico: ItemHistoricoAssistente[] = [
      respostaAnterior(angariado211),
      { papel: "usuario", texto: "Quantos angariei hoje?" },
      { papel: "assistente", texto: "1.", resultados: [{ tipo: "metricas", itens: [{ rotulo: "Angariações", valor: "1" }] }] },
    ];
    expect(entidadeDaRespostaAnterior(historico)).toBeNull();
    expect(compararEntidadeComResultadoAtual(PAGINA, historico, publicado211)).toBeNull();
  });
});
