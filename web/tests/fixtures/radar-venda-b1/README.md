# Venda B1 — evidências B2.6-A

Seis recortes minimizados das capturas originais de 11/10/2026, localizadas no
worktree `radar-r6-0c-b2-6-a-venda-discovery`, cache ignorado
`web/node_modules/.cache/radar-r6-0c-b2-6-a/`. Os hashes originais foram recalculados
e conferidos antes da extração. [manifesto.json](manifesto.json) registra URL,
SHA-256 original, SHA-256 minimizado, ID e preço por recorte.

Seletores, títulos, preços, moeda, ações, URLs, IDs e relações estruturadas foram
preservados. Removidos contatos, anunciantes, imagens, geo, CEP, hidratação,
sessão e elementos sem relação com o contrato. Os HTMLs completos não são versionados.

ZAP/Viva: card individual → Product → Offer → BuyAction → PriceSpecification BRL.
Chaves: card individual → RealEstateListing → Offer → SellAction → itemOffered.
Preço principal e preço estruturado devem concordar. Condomínio/IPTU são acessórios.

As variações negativas nos testes são alterações adversariais dessas fixtures,
sem novas capturas. Recência e completude não foram comprovadas.
