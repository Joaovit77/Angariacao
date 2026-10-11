# Locação em Londrina/PR — R6.0c-B2.3

Fixtures minimizadas de duas capturas Firecrawl reais, proxy `basic`, `rawHtml`, sem retry.
Não incluem HTML completo, hidratação, sessões, tokens, contatos ou identificação de anunciantes.
As URLs individuais do Wimoveis tiveram os parâmetros de rastreamento removidos.
Valores, IDs, rótulos e relações JSON-LD foram preservados; não são exemplos inventados.

| Evidência | Chaves Apartamento | Wimoveis Casa |
|---|---|---|
| URL oficial/canonical | https://www.chavesnamao.com.br/apartamentos-para-alugar/pr-londrina/ | https://www.wimoveis.com.br/aluguel/casas/pr/londrina |
| Início da captura (UTC) | 2026-10-11T00:22:00.363Z | 2026-10-11T00:22:15.968Z |
| HTTP API / portal | 200 / 200 | 200 / 200 |
| Cards observados | 15 | 30 |
| SHA-256 do HTML capturado | `0ac15ffa355bde1e40a649dc003571d2ff51bd9f6c830ca9e9c0025049a6b0b1` | `913d61157d7fbc426068ecb0a848f939810ecc5b0cf4690395b767a1668f2ebc` |
| Fixture | [chaves-apartamento.html](chaves-apartamento.html) | [wimoveis-casa.html](wimoveis-casa.html) |
| IDs preservados | 39216787, 46290962, 33198275 | 2944851742, 3013053071, 2994586131 |

Chaves: links `a[href*="/imovel/"][href*="/id-"]`, título em `h2`, ID em `/id-N/`,
preço principal em `p[aria-label="Preço"] b`, características numéricas com unidades em
`aria-label`, cidade/UF no endereço e foto lazy em `RealEstateListing.offers.itemListElement[].itemOffered`.
O anúncio 33198275 não tem imagem no card e usa somente sua própria foto JSON-LD.
O valor 20.000 é o aluguel do card; condomínio 2.500 permanece separado.

Wimoveis: `data-qa="posting PROPERTY"`, `data-posting-type="PROPERTY"`, `data-id` e
`data-to-posting`; preço em `POSTING_CARD_PRICE`, imagem em `POSTING_CARD_GALLERY`,
características em spans de `POSTING_CARD_FEATURES`. `RentAction.object.url` vincula finalidade
e UF ao ID nativo. `SingleFamilyResidence` não sobrescreve o tipo textual: o Sobrado 3013053071
continua Sobrado e é recusado no novo recorte Casa. O título do 2944851742 menciona venda e
aluguel antigo de 8.800; o preço atual publicado no card da listagem de aluguel é 8.000.
O parser usa o preço do card ligado a `RentAction`, sem extrair valores do título.

Paginação observada na primeira página: Chaves publica `rel="next"` com `?pg=2`;
Wimoveis publica `PAGING_1` até `PAGING_5` e `PAGING_NEXT`, todos com o mesmo href base.
O destino efetivo da navegação JavaScript do Wimoveis não foi comprovado. Nenhuma página 2 foi
consultada e nenhuma varredura multipágina foi implementada.

Ordenação por mais recentes: **não comprovada em ambos**. `ItemListOrderAscending` do Chaves
não identifica qual critério está sendo ordenado. Destaques do Wimoveis também não provam recência.
O discovery da primeira página foi suficiente para os contratos; consumo total: 2 de 4 chamadas.

Controles anteriores: `../chavesFotosJsonLd.ts`, testes `wimoveis-r42c.test.ts` e
`../zap-r6-casa/`. Variações adversariais nos testes partem destas fixtures e são identificadas
como alterações deliberadas de tipo, finalidade, preço ou identidade.
