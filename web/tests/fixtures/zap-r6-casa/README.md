Os três HTMLs são recortes minimizados das respostas reais obtidas no discovery
autorizado R6.0c-B2.1, em 10/10/2026. Preservam somente um card individual, seu
Product e seu House/Apartment pelo ID nativo, campos publicados e uma imagem.
Não contêm hidratação, sessão, contatos, tokens ou HTML completo da página.

| Fixture | Página de origem | ID nativo | Tipo publicado | RentAction BRL |
| --- | --- | --- | --- | --- |
| casa.html | Casa, página 1 | 2890706278 | Casa | 12000 |
| sobrado.html | Casa, página 1 | 2916079017 | Sobrado | 2600 |
| apartamento.html | Apartamento, página 1 | 2891958776 | Apartamento | 2300 |

Hashes SHA-256 dos recortes de página usados como fonte, antes desta minimização:

- Casa página 1: `cd78caee3421d3d5cd6fc8fd1a7a9cd79d435bbb6a42796f19a38a73cc67099a`.
- Apartamento página 1: `4923dad07e3378b91402c19c6ce2d35cb468bcd3b9e20e33c9c24316f460f193`.

`../zap-r6-casa.ts` declara também variações sintéticas derivadas desses recortes:
ID incompatível, preço ausente, preço divergente, tipo ausente e agrupado sem
link individual. Product + House e Product + Apartment estão nos recortes reais;
duplicidade, troca de ordem e conflitos de Offer/RentAction são injetados nos testes.
As variações não são apresentadas como captura real.

House não comprova sozinho o subtipo Casa: no discovery, também representa
Sobrado. Os nomes publicados preservados distinguem esses tipos; HOME e
TWO_STORY_HOUSE foram observados no discovery, mas não exigem interpretação
de hidratação no parser operacional.

Estas amostras não comprovam paginação completa, estabilidade longitudinal,
ordenação por recência nem baseline.
