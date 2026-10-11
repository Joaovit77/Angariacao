# Viva Real — Locação em Londrina/PR

Trechos minimizados de duas capturas Firecrawl reais em 2026-10-11 (UTC), proxy `basic`,
formato `rawHtml`, sem retry, detalhes ou página 2. Consumo: **2 de 4 chamadas autorizadas**.

| Evidência | Casa | Apartamento |
|---|---|---|
| URL solicitada e canonical | https://www.vivareal.com.br/aluguel/parana/londrina/casa_residencial/ | https://www.vivareal.com.br/aluguel/parana/londrina/apartamento_residencial/ |
| Início UTC | 2026-10-11T12:46:59.990Z | 2026-10-11T12:47:01.727Z |
| HTTP API / portal | 200 / 200 | 200 / 200 |
| SHA-256 do HTML capturado | `c65597baebc62cd4604a157ff7e1b5b995a70a2c85661803b9f3cb7f21e55980` | `a6c125637042ed23023d021c0e9b71630f13d46434d01ac1c79a7fa3576893b5` |
| Cards / links individuais | 30 / 29 | 30 / 22 |
| Fixture | [casa.html](casa.html) | [apartamento.html](apartamento.html) |
| IDs individuais preservados | 2885106983, 2914340884 | 2915392891, 2906969852 |
| Aluguéis preservados | 4.000; 9.000 | 5.300; 2.200 |
| SHA-256 da fixture | `45f36b2d4166adc93a20db27b203931e4218c52d9ca8c02768c82011df3fc585` | `2b40ff8dc1c12157641fb4afaa5c037f3577a35f82c999e81d682615e1284334` |

[agrupados.html](agrupados.html) preserva dois links reais para a própria listagem com `#`,
sem URL individual. SHA-256: `fa47584726f4e1cdacc0d9dbb6242031567061952d824d18eb8fb6085edaa7b1`.
Esses cards não podem receber a identidade de um Product por posição.

## Contrato

Cada link individual `a[data-ds-component="DS-Card"]` contém tipo textual em `h2`,
imagem em `rp-cardProperty-image-img`, localização e características próprias.
O JSON-LD `Product` publica `@id` numérico coerente com `url`, `Offer.url` e
`RentAction.target`, todos com o mesmo caminho individual `-id-N/`. Identidade **FORTE**.
Tipo exige concordância entre o texto do card e `Product.name`; `additionalType`
House/Apartment, a listagem e o filtro solicitado não constituem tipo observado.

O aluguel é `Product.offers.potentialAction.priceSpecification.price` em BRL, ligado a
`RentAction` e concordante com `Offer.price`. Nos cards, o bloco
`rp-cardProperty-price-txt` mostra o valor principal com `/mês` e as despesas separadamente.
No apartamento 2915392891, aluguel 5.300 e condomínio 500 coexistem: o condomínio está em
`Offer.additionalProperty` com nome `Condominium Fee` e unidade `BRL/month`. IPTU isento
não é preço de aluguel. Não se extrai preço do slug, primeiro R$, posição ou faixa solicitada.
Ausência/divergência de preço mantém `null` e impede ingresso em comparáveis.

As duas URLs solicitadas não têm parâmetros. Os links de paginação observados acrescentam
`onde`, `tipos` e `pagina=2` (e seguintes). O mecanismo inicial foi identificado apenas no HTML;
não houve consulta à página 2 nem implementação multipágina. **RECÊNCIA NÃO COMPROVADA**.
Há `Super Destaque`, `Destaque` e carrosséis de fotos; destaque não comprova recência.

Na captura Casa, os títulos publicados usam Casa; nenhum subtipo foi promovido.
Na captura Apartamento também aparece **Kitnet/Conjugado**, ID 2916532660, em card agrupado;
foi excluído. Sobrado, Casa de Condomínio, Studio e Loft não foram comprovados e não são
admitidos automaticamente. O parser processou offline 29 casas e 22 apartamentos individuais
dos HTMLs capturados; isso não representa cobertura completa nem comprova veracidade cadastral.

## Minimização e limitações

Foram preservados somente dois anúncios individuais por recorte, os elementos necessários
do card e os campos JSON-LD de identidade, finalidade, preço, tipo, endereço e características.
Os wrappers de conteúdo foram reduzidos; valores, IDs, relações e seletores foram conservados.
As imagens conservam o caminho original, sem query de redimensionamento. Links individuais
usam a URL publicada no Product, sem `source` ou fragmento de rastreamento.

Foram removidos hidratação, scripts executáveis, SVG, controles, fotos adicionais, contatos,
nomes de anunciantes, descrições comerciais e atributos de sessão/rastreamento.
Não se versionam HTML completo, cookies, tokens, sessão ou PII desnecessária.
Variações adversariais dos testes são alterações deliberadas destas fixtures, não novas capturas.
O contrato explícito permanece restrito à primeira página de Londrina/PR, sem bairro;
o legado conserva o comportamento anterior de preço nulo.
