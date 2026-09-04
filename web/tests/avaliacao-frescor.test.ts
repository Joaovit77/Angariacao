import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import ComparavelHistorico from "@/components/avaliacao/ComparavelHistorico";
import {
  avaliarImovel,
  type ComparavelAvaliacao,
  type EntradaAvaliacao,
} from "@/lib/calculo/avaliacao";
import {
  derivarFatosHistoricosComparavel,
  type ObservacaoPositivaComparavel,
} from "@/lib/calculo/historicoComparaveisMercado";

const HOJE = "2026-09-04";
const REFERENCIA = {
  primeiroVistoEm: "2026-08-20T10:00:00Z",
  ultimoVistoEm: "2026-09-01T10:00:00Z",
  portal: "olx",
  idExterno: "anuncio-1",
  urlCanonica: "https://www.olx.com.br/anuncio-1",
  fingerprintForte: true,
  estado: "PR",
  cidadeChave: "londrina",
};

function observacao(
  observadoEm: string,
  valorAnunciado: number,
  extras: Partial<ObservacaoPositivaComparavel> = {},
): ObservacaoPositivaComparavel {
  return {
    observadoEm,
    tipoEvento: "reobservado",
    valorAnunciado,
    statusAnuncio: "ativo",
    ...extras,
  };
}

function renderizar(observacoes: ObservacaoPositivaComparavel[], referencia = REFERENCIA) {
  const historico = derivarFatosHistoricosComparavel(referencia, observacoes);
  return renderToStaticMarkup(createElement(ComparavelHistorico, { historico, hoje: HOJE }));
}

describe("frescor factual na Avaliação", () => {
  it("transforma a última observação positiva em texto relativo factual", () => {
    expect(renderizar([
      observacao("2026-08-20T10:00:00Z", 2500, { tipoEvento: "novo" }),
      observacao("2026-09-01T10:00:00Z", 2500),
    ])).toContain("Última observação há 3 dias");
  });

  it("não quebra nem inventa data quando o histórico é desconhecido", () => {
    const html = renderToStaticMarkup(createElement(ComparavelHistorico, {
      historico: null,
      hoje: HOJE,
    }));
    expect(html).toContain("Histórico limitado");
    expect(html).not.toContain("Primeira observação:");
    expect(html).not.toContain("Última observação:");
  });

  it("exibe reobservação apenas quando há ao menos duas observações comprovadas", () => {
    const reobservado = renderizar([
      observacao("2026-08-20T10:00:00Z", 2500, { tipoEvento: "novo" }),
      observacao("2026-09-01T10:00:00Z", 2500),
    ]);
    const unico = renderizar(
      [observacao("2026-09-01T10:00:00Z", 2500, { tipoEvento: "novo" })],
      { ...REFERENCIA, primeiroVistoEm: "2026-09-01T10:00:00Z" },
    );
    expect(reobservado).toContain("Ao menos 2 observações conhecidas");
    expect(unico).not.toContain("Ao menos 2 observações conhecidas");
  });

  it("exibe somente mudança de preço comprovada entre observações", () => {
    const comMudanca = renderizar([
      observacao("2026-08-20T10:00:00Z", 2500, { tipoEvento: "novo" }),
      observacao("2026-09-01T10:00:00Z", 2400, { tipoEvento: "preco_alterado" }),
    ]);
    const semMudanca = renderizar([
      observacao("2026-08-20T10:00:00Z", 2500, { tipoEvento: "novo" }),
      observacao("2026-09-01T10:00:00Z", 2500),
    ]);
    expect(comMudanca).toContain("Mudança de preço observada");
    expect(comMudanca).toContain("R$ 2.500");
    expect(comMudanca).toContain("R$ 2.400");
    expect(comMudanca).toContain("Redução observada de R$ 100");
    expect(semMudanca).not.toContain("Mudança de preço observada");
  });

  it("mantém comparável antigo visível com texto neutro e sem narrativa de indisponibilidade", () => {
    const html = renderizar(
      [observacao("2026-05-07T10:00:00Z", 2500, { tipoEvento: "novo" })],
      {
        ...REFERENCIA,
        primeiroVistoEm: "2026-05-07T10:00:00Z",
        ultimoVistoEm: "2026-05-07T10:00:00Z",
      },
    );
    expect(html).toContain("Última observação há 120 dias");
    expect(html.toLowerCase()).not.toContain("indisponível");
    expect(html.toLowerCase()).not.toContain("alugado");
    expect(html.toLowerCase()).not.toContain("removido");
  });
});

describe("frescor não altera a metodologia da Avaliação", () => {
  const entrada: EntradaAvaliacao = {
    imovelId: "alvo",
    finalidade: "locacao",
    endereco: "Rua Paranaguá, 300",
    bairro: "Centro",
    cidade: "Londrina",
    estado: "PR",
    edificio: null,
    tipo: "Apartamento",
    areaM2: 70,
    quartos: 2,
    banheiros: 2,
    vagas: 1,
    conservacao: "Bom",
    latitude: -23.3105,
    longitude: -51.1696,
  };
  const candidatos: ComparavelAvaliacao[] = [2200, 2300, 2400, 2500, 2600].map((valor, indice) => ({
    origem: "externo",
    id: `comparavel-${indice}`,
    codigo: "olx",
    endereco: `Rua Paranaguá, ${310 + indice}`,
    bairro: "Centro",
    cidade: "Londrina",
    estado: "PR",
    tipo: "Apartamento",
    areaM2: 70,
    quartos: 2,
    banheiros: 2,
    vagas: 1,
    conservacao: null,
    latitude: -23.311,
    longitude: -51.17,
    valorAnunciado: valor,
    dataInformacao: "2026-09-01",
    status: "Anunciado",
  }));

  it("não muda preço, peso, ranking nem seleção ao anexar fatos históricos", () => {
    const historico = derivarFatosHistoricosComparavel(REFERENCIA, [
      observacao("2026-09-01T10:00:00Z", 2500, { tipoEvento: "novo" }),
    ]);
    const semHistorico = avaliarImovel(entrada, candidatos, HOJE);
    const comHistorico = avaliarImovel(
      entrada,
      candidatos.map((item) => ({ ...item, historico })),
      HOJE,
    );

    expect(comHistorico.valorRecomendado).toBe(semHistorico.valorRecomendado);
    expect(comHistorico.comparaveis.map(({ id, pesoCalculo }) => ({ id, pesoCalculo })))
      .toEqual(semHistorico.comparaveis.map(({ id, pesoCalculo }) => ({ id, pesoCalculo })));
  });
});
