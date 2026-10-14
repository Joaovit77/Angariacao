# Fixtures Venda OLX/Wimoveis — B2

Derivadas exclusivamente das capturas offline 1, 2, 9 e 10 do discovery aprovado
R6.0c-B2.6-A, em 11/10/2026. Nenhuma aquisição nova foi executada.
O manifesto registra URL de origem, ID, preço, SHA-256 do HTML original e da fixture.
Os quatro hashes originais foram conferidos antes da extração.

As fixtures preservam seletores, relações de identidade, finalidade, tipo e preço.
OLX conserva o registro individual `ads` dentro de `self.__next_f.push`.
Wimoveis conserva o posting individual de `listStore`, sua ação e o `SellAction`
JSON-LD correspondente. Os scripts são dados JSON; nunca são executados pelo parser.

Não há sessão, anunciante, telefone ou credencial. O texto comercial foi minimizado
após o convite de contato; os atributos que comprovam o contrato foram preservados.
Casa Wimoveis usa o anúncio 3016632657 (Lagoa Dourada): o primeiro exemplo sugerido
pelo discovery menciona condomínio na descrição e não foi usado como caso positivo.
Não foram alteradas as fixtures de Locação ou do B1.

Negativos adversariais são derivados em memória pela suíte `radar-venda-b2.test.ts`.
Os 12 mutantes modificam somente o parser B2 durante sua execução e restauram o
arquivo original em `finally`; falha de compilação não conta como mutante morto.
