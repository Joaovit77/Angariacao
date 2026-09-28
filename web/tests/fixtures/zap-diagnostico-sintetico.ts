// R4.2f (temporário): HTML SINTÉTICO. Não é captura do ZAP e não prova a
// estrutura real do portal; só exercita o diagnóstico e as proteções da rota.
// Os marcadores "Segredo", telefone, nome e IDs existem para provar que nada
// do conteúdo dos anúncios sai na resposta.
const nextData = JSON.stringify({
  props: {
    pageProps: {
      listings: Array.from({ length: 5 }, (_, i) => ({
        id: `26123456${70 + i}`,
        address: { street: "Rua Segredo", number: "15" },
        advertiser: { name: "Fulano Segredo" },
        price: "2500",
      })),
    },
  },
});

export const SEGREDOS_DO_HTML = [
  "<", "Rua Segredo", "Fulano", "Segredo", "99999-0000", "2612345678", "2612345699", "87654321", "R$",
];

export const HTML_ZAP_SINTETICO = `<!doctype html>
<html><head><title>Apartamentos para alugar em Londrina</title>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"ItemList","itemListElement":[]}</script>
</head><body>
<h1>1.234 Apartamentos para alugar em Londrina</h1>
<ul>
  <li data-testid="card-listing">
    <a href="https://www.zapimoveis.com.br/imovel/aluguel-apartamento-2-quartos-centro-londrina-pr-60m2-id-2612345678/?source=ranking">
      <img src="https://resizedimgs.zapimoveis.com.br/foto-segredo.jpg" alt="">
      <h2>Apartamento para alugar no Centro</h2>
    </a>
    <p>Rua Segredo, 15</p>
    <p>Centro, Londrina</p>
    <p>60 m²</p>
    <p><span>Aluguel</span> <strong>R$ 2.500</strong></p>
    <p><span>Cond. R$ 500</span><span>IPTU R$ 80</span></p>
    <p>Publicado há 3 dias</p>
    <p>Fulano Segredo · Imobiliária Segredo · CRECI 12345 · (43) 99999-0000</p>
    <a href="/imobiliarias/imobiliaria-segredo-87654321/">Ver anunciante</a>
  </li>
  <li data-testid="card-listing">
    <a href="https://www.zapimoveis.com.br/imovel/aluguel-apartamento-2-quartos-londrina-pr-id-2612345699/">
      <img data-src="https://resizedimgs.zapimoveis.com.br/foto-2.jpg" alt="">
      <h2>Apartamento com 2 quartos</h2>
    </a>
    <p>R$ 3.100 /mês</p>
  </li>
</ul>
<nav aria-label="paginação"><a href="?pagina=2">2</a><a href="?pagina=3">3</a><a rel="next" href="?pagina=2">Próxima página</a></nav>
<script id="__NEXT_DATA__" type="application/json">${nextData}</script>
</body></html>`;

export function respostaFirecrawl(html = HTML_ZAP_SINTETICO, statusCode = 200, status = 200): Response {
  return new Response(JSON.stringify({ success: true, data: { rawHtml: html, metadata: { statusCode } } }), {
    status, headers: { "Content-Type": "application/json" },
  });
}
