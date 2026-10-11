# OLX — locação em Londrina/PR

Capturas reais da primeira página, via Firecrawl básico/rawHtml, em 2026-10-11 UTC.
Foram usadas somente duas chamadas, ambas HTTP 200, sem detalhe, retries ou segunda página.

| Recorte | Origem e canonical | Intervalo UTC | SHA-256 do rawHtml original |
| --- | --- | --- | --- |
| Casa | https://www.olx.com.br/imoveis/aluguel/casas/estado-pr/regiao-de-londrina/londrina | 14:05:51.868–14:05:57.281 | cf4fe339b7fcb2401b5b03b2a0ec2b166d20e2f1c419d2e59a4dccf34a80649f |
| Apartamento | https://www.olx.com.br/imoveis/aluguel/apartamentos/estado-pr/regiao-de-londrina/londrina | 14:05:57.282–14:06:03.202 | 0c741efd1a557285e8c62516fb816544c684f0fee2569d616cfe42f4f9c3a424 |

Os originais ficam fora do Git. Os trechos retêm somente identidade/link/título, preço,
imagem pública, localização, data textual e características dos cards, além dos campos
individuais necessários do estado RSC. Os wrappers foram reconstruídos; os valores
observados foram conservados. O registro RSC foi reduzido a um objeto com a coleção
`ads`, preservando o formato `self.__next_f.push([1, "<referência>:<JSON>\\n"])`.
Não há execução de JavaScript, associação por posição, contatos, cookies, tokens,
sessão, scripts de rastreamento, dados de anunciante nem HTML completo.

| Fixture | Conteúdo | SHA-256 (bytes UTF-8/LF) |
| --- | --- | --- |
| casa.html | Duas Casas individuais, IDs 1543235091 e 1543232111 | 273c42e2831ffccd8ebc52e865a40a32cb0d49771068227d1237b28d7456e91b |
| apartamento.html | Dois Apartamentos, IDs 1543291298 e 1543247963; o primeiro tem título genérico e tipo próprio no estado | 11f843855b5742cc437a71103947f075d0c5eab1750ce3502d56b73e0ba86a3d |
| divergentes.html | Composição de cards reais: Sobrado, Casa de condomínio, título de Venda conflitante e Apartamento | 585ef2afe4d74399dab0ca4f2300aeef0d7a36d13fbb35dbb798cf2fa7250597 |
| preco-ambiguo.html | Apartamento 1543200542, preço atual 1000 e antigo 1400: não admitido como aluguel confiável | 3f85780a2c54454993804f17c09f5ca9d705510cf884ec9251a0656a48655c8c |
| sem-identidade.html | Adversarial derivado da Casa real: href trocado por listagem sem ID; não é captura de card inseguro real | 2053c7814047c1ae0abff0cb22c208e10d756ea69e136d86bb06f82087421485 |

Limites: cinquenta cards por captura; URL/listId concordantes. A coleção de recomendações
parciais não comprova tipo/finalidade. O JSON-LD da página é agregado e não precifica
anúncios individuais. Casas inclui subtipos e títulos de Venda mesmo na URL de aluguel;
o parser revalida cada anúncio. Valores de condomínio/IPTU são propriedades separadas.
Galerias/carrosséis de fotos e destaques não substituem o link individual. Cards sem
identidade e agrupados são recusados; nenhum ID inseguro foi observado nos cinquenta cards
de cada captura. O link seguinte usa `?o=2` (“Mais anúncios”), sem aquisição dessa página.
Ordenação “Mais Relevantes”: **RECÊNCIA NÃO COMPROVADA**. Não há cobertura completa nem
inferência de “Novo”. Mudanças futuras do formato RSC/propriedades falham fechadas.
Busca por bairro ou somente proprietário não foi comprovada e permanece bloqueada
antes dos efeitos no contrato explícito. O adaptador legado conserva seu comportamento.
