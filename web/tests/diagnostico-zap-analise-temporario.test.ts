// R4.2f (temporário): o diagnóstico estrutural mede o que o HTML mostra e não
// transforma posição, URL ou contexto da busca em dado publicado. Sai junto com o harness.
import { describe, expect, it } from "vitest";
import { diagnosticarHtmlZap, padraoDoCaminho } from "@/lib/servidor/diagnosticoTemporarioZap";
import { HTML_ZAP_SINTETICO, SEGREDOS_DO_HTML } from "./fixtures/zap-diagnostico-sintetico";

describe("diagnóstico estrutural temporário do ZAP (HTML sintético)", () => {
  const diagnostico = diagnosticarHtmlZap(HTML_ZAP_SINTETICO);

  it("encontra os cards pela família de link dominante, sem contar o link do anunciante como card", () => {
    expect(diagnostico.estrutura).toMatchObject({
      cardsCandidatos: 2,
      linksInternosComIdNumerico: 3,
      familiaDeLinkDosCards: "/imovel/{slug}-id-{n}/",
      linksComIdForaDaFamiliaDosCards: 1,
      assinaturasDeCard: [{ padrao: "li[data-testid=card-listing]", quantidade: 2 }],
    });
    expect(diagnostico.estrutura.jsonLd).toMatchObject({ blocos: 1, invalidos: 0, tipos: [{ padrao: "ItemList", quantidade: 1 }] });
    expect(diagnostico.estrutura.dadosEmbutidos.marcadores).toEqual([{ padrao: "__NEXT_DATA__", quantidade: 1 }]);
    expect(diagnostico.estrutura.dadosEmbutidos.listasDeObjetos[0]).toEqual({
      caminho: "__NEXT_DATA__.props.pageProps.listings", itens: 5, chaves: ["id", "address", "advertiser", "price"],
    });
  });

  it("mede identidade pelo ID da URL sem fallback posicional", () => {
    expect(diagnostico.identidade).toMatchObject({
      situacao: "id_numerico_na_url",
      cardsComIdNumericoNaUrl: 2,
      idsUnicos: 2,
      idsRepetidosEntreCards: 0,
      formasDoId: [{ padrao: "sufixo -id-{n} no caminho", quantidade: 2 }],
      digitosDoId: { minimo: 10, maximo: 10 },
      cardsComQueryNoLink: 1,
    });
    expect(diagnosticarHtmlZap("<html><body><a href='/aluguel/'>x</a></body></html>").identidade)
      .toMatchObject({ situacao: "desconhecido", cardsComIdNumericoNaUrl: 0, digitosDoId: null });
  });

  it("não trata o primeiro R$ nem o sufixo /mês como aluguel", () => {
    expect(diagnostico.preco).toMatchObject({
      cardsComValores: { zero: 0, um: 1, dois: 0, tresOuMais: 1 },
      aluguelRotulado: 1,
      condominioRotulado: 1,
      iptuRotulado: 1,
      precoAmbiguo: 1,
      primeiroValorRotuladoAluguel: 1,
      cardsComSufixoMes: 1,
      sequenciasDeRotulos: expect.arrayContaining([
        { padrao: "aluguel>condominio>iptu", quantidade: 1 },
        { padrao: "sem_rotulo", quantidade: 1 },
      ]),
    });
  });

  it("separa localização publicada no card da que está só na URL ou no contexto da busca", () => {
    expect(diagnostico.localizacao.publicadoNoCard).toMatchObject({
      logradouro: 1, logradouroComNumero: 1, bairroCidadeEstruturado: 1, cidadeLondrina: 1,
    });
    // O segundo card só tem "londrina" no slug: isso não conta como publicado.
    expect(diagnostico.localizacao.somenteNaUrl).toEqual({ linksDeCardComLondrinaNoSlug: 2, linksDeCardComUfNoSlug: 2 });
    expect(diagnostico.localizacao.contextoDaBusca).toEqual({ cidadeNaUrlDaBusca: true, ufNaUrlDaBusca: true });
  });

  it("mede imóvel, autoria, data, paginação e imagens só por contagem", () => {
    expect(diagnostico.imovel).toEqual({ titulo: 2, tipo: 2, quartos: 1, banheiros: 0, vagas: 0, area: 1 });
    expect(diagnostico.autoria).toMatchObject({ imobiliariaOuCorretor: 1, creci: 1, particularOuProprietario: 0, semSinal: 1 });
    expect(diagnostico.data).toMatchObject({ textoPublicacao: 1, dataRelativa: 1, dataAbsoluta: 0 });
    expect(diagnostico.paginacao).toMatchObject({
      linkRelNext: 1, containersPaginacao: 1, linksNumericos: 2, maiorPaginaVisivel: 3,
      parametros: [{ padrao: "pagina", quantidade: 3 }], totalResultadosDeclarado: 1234,
    });
    expect(diagnostico.imagens).toMatchObject({
      cardsComImagem: 2,
      hostsNosCards: [{ padrao: "resizedimgs.zapimoveis.com.br", quantidade: 2 }],
    });
  });

  it("reconhece página de bloqueio sem expor o texto dela", () => {
    const bloqueado = diagnosticarHtmlZap("<html><head><title>Just a moment...</title></head><body>captcha</body></html>");
    expect(bloqueado.pagina.marcadoresDeBloqueio).toContain("aguarde_verificacao");
    expect(bloqueado.estrutura.cardsCandidatos).toBe(0);
  });

  it("não devolve nenhum trecho de anúncio, nome, telefone, ID ou valor", () => {
    const serializado = JSON.stringify(diagnostico);
    for (const segredo of SEGREDOS_DO_HTML) expect(serializado, segredo).not.toContain(segredo);
  });

  it("abstrai slugs e mantém só o primeiro segmento literal", () => {
    expect(padraoDoCaminho(new URL("https://www.zapimoveis.com.br/imovel/rua-segredo-15-centro-id-2612345678/?a=1&b=2")))
      .toBe("/imovel/{slug}-id-{n}/?a&b");
    expect(padraoDoCaminho(new URL("https://www.zapimoveis.com.br/aluguel/apartamentos/pr+londrina/")))
      .toBe("/aluguel/{slug}/{slug}/");
  });
});
