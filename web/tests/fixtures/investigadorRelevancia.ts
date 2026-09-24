/* ================================================================
   INVESTIGADOR (B2): fixtures de relevância.

   Reproduzem a FORMA dos ruídos vistos em validações reais: página de
   música/vídeo, página que só compartilha um nome próprio, localidade
   homônima, anúncio com snippet incompleto e o anúncio certo com poucos
   campos. As entradas são as mesmas do B1 (Pipeline, Radar, Garimpo). O
   algoritmo não conhece nenhum desses nomes; só os textos daqui.

   `esperado` é o veredito de produto, escrito antes da implementação:
   `irrelevante` só onde há evidência concreta de ruído.
   ================================================================ */
import { extrairCamposInvestigacao, type ResultadoWebInvestigacao } from "@/lib/calculo/investigadorImoveis";

export const PIPELINE_BELA_CINTRA = "Rua Bela Cintra, 986, unidade 52, bloco A, Consolação, São Paulo, SP, "
  + "Edifício Bela Vista, Apartamento, 2 quartos, 1 banheiro, 1 vaga, referência 01860.001";
export const RADAR_OSCAR_FREIRE = "Rua Oscar Freire, 900, Jardim Paulista, São Paulo, SP, Apartamento, 75 m², "
  + "2 quartos, 1 vaga, anúncio Chaves na Mão 123456";
export const GARIMPO_CAYOWAA = "Rua Cayowaá, 1500, Perdizes, São Paulo, SP, Casa";

export type VereditoEsperado = "relevante" | "inconclusivo" | "irrelevante";

export interface FixtureRelevancia {
  id: string;
  /** O que o resultado é, de fato: guia a leitura da simulação. */
  natureza: "imovel-certo" | "anuncio-incompleto" | "outro-imovel" | "ruido" | "homonimo";
  titulo: string;
  descricao: string;
  url: string;
  esperado: VereditoEsperado;
}

/** Resultado como o servidor monta: campos extraídos de título + descrição. */
export function resultadoDaFixture(fixture: FixtureRelevancia, consulta = "q"): ResultadoWebInvestigacao {
  return {
    titulo: fixture.titulo,
    url: fixture.url,
    dominio: new URL(fixture.url).hostname.replace(/^www\./, ""),
    descricao: fixture.descricao,
    consultas: [consulta],
    ...extrairCamposInvestigacao(`${fixture.titulo} ${fixture.descricao}`),
  };
}

export const CONJUNTOS_RELEVANCIA: { nome: string; entrada: string; fixtures: FixtureRelevancia[] }[] = [
  {
    nome: "Pipeline (referência + endereço + edifício)",
    entrada: PIPELINE_BELA_CINTRA,
    fixtures: [
      {
        id: "bc-referencia-identica",
        natureza: "imovel-certo",
        titulo: "Apartamento 2 quartos na Consolação | Ref. 01860.001",
        descricao: "Edifício Bela Vista, 1 vaga, próximo ao metrô.",
        url: "https://imobiliaria-a.test/imovel/01860-001",
        esperado: "relevante",
      },
      {
        id: "bc-endereco-poucos-campos",
        natureza: "imovel-certo",
        titulo: "Rua Bela Cintra, 986 - Consolação, São Paulo",
        descricao: "",
        url: "https://portal-b.test/anuncio/986",
        esperado: "relevante",
      },
      {
        id: "bc-outra-imobiliaria-outro-codigo",
        natureza: "anuncio-incompleto",
        titulo: "Apartamento à venda na Bela Cintra | Cód. AP4471",
        descricao: "Consolação, 2 dormitórios, 1 vaga.",
        url: "https://imobiliaria-c.test/ap4471",
        esperado: "inconclusivo",
      },
      {
        id: "bc-mesma-rua-outro-numero",
        natureza: "outro-imovel",
        titulo: "Apartamento à venda - Rua Bela Cintra, 1200 - Consolação",
        descricao: "3 quartos, 110 m², 2 vagas.",
        url: "https://portal-b.test/anuncio/1200",
        esperado: "irrelevante",
      },
      {
        id: "bc-listagem-generica",
        natureza: "anuncio-incompleto",
        titulo: "Apartamentos à venda na Consolação - São Paulo",
        descricao: "Encontre apartamentos com 2 quartos na Consolação.",
        url: "https://portal-d.test/venda/consolacao",
        esperado: "inconclusivo",
      },
      {
        id: "bc-enciclopedia-da-rua",
        natureza: "ruido",
        titulo: "Rua Bela Cintra – Wikipédia, a enciclopédia livre",
        descricao: "A Rua Bela Cintra é um logradouro da cidade de São Paulo, entre a Consolação e o Jardim Paulista.",
        url: "https://pt.wikipedia.test/wiki/Rua_Bela_Cintra",
        esperado: "irrelevante",
      },
      {
        id: "bc-homonimo-sem-numero",
        natureza: "homonimo",
        titulo: "Casa à venda na Rua Bela Cintra, Porto Alegre - RS",
        descricao: "Casa com 3 dormitórios e pátio.",
        url: "https://portal-e.test/poa/casa-bela-cintra",
        // Sem cidade/UF estruturada na entrada não há como afirmar o
        // homônimo: fica como está (limitação declarada, não regra nova).
        esperado: "inconclusivo",
      },
    ],
  },
  {
    nome: "Radar (endereço + características + anúncio)",
    entrada: RADAR_OSCAR_FREIRE,
    fixtures: [
      {
        id: "of-musica-video",
        natureza: "ruido",
        titulo: "Oscar Freire - Ao Vivo (Clipe Oficial)",
        descricao: "Ouça a nova música. Compartilhe seus vídeos com amigos, familiares e todo o mundo.",
        url: "https://video.test/watch?v=abc123",
        esperado: "irrelevante",
      },
      {
        id: "of-so-o-primeiro-nome",
        natureza: "ruido",
        titulo: "Oscar 2026: veja a lista completa dos vencedores",
        descricao: "A cerimônia do Oscar premiou os destaques do cinema nesta noite.",
        url: "https://noticias.test/oscar-2026",
        esperado: "irrelevante",
      },
      {
        id: "of-pessoa-homonima",
        natureza: "ruido",
        titulo: "Oscar Freire (médico) – Wikipédia, a enciclopédia livre",
        descricao: "Oscar Freire de Carvalho foi um médico brasileiro. Nasceu em Salvador.",
        url: "https://pt.wikipedia.test/wiki/Oscar_Freire",
        esperado: "irrelevante",
      },
      {
        id: "of-imovel-certo-poucos-campos",
        natureza: "imovel-certo",
        titulo: "Apartamento 2 quartos Rua Oscar Freire, 900 - Jardim Paulista",
        descricao: "",
        url: "https://portal-b.test/anuncio/of900",
        esperado: "relevante",
      },
      {
        id: "of-snippet-incompleto",
        natureza: "anuncio-incompleto",
        titulo: "Apartamento à venda na Oscar Freire, Jardim Paulista",
        descricao: "75 m², ótima localização.",
        url: "https://portal-f.test/imovel/9981",
        esperado: "inconclusivo",
      },
      {
        id: "of-guia-de-compras",
        natureza: "ruido",
        titulo: "Rua Oscar Freire: guia de compras e restaurantes",
        descricao: "As marcas e os cafés mais conhecidos do Jardim Paulista.",
        url: "https://turismo.test/oscar-freire",
        // Ruído, mas sem evidência forte o bastante: fala da rua, não tem
        // marcador de outro domínio. Falso positivo aceito (vai para o B3).
        esperado: "inconclusivo",
      },
      {
        id: "of-homonimo-outra-cidade",
        natureza: "homonimo",
        titulo: "Rua Oscar Freire - Pelotas, RS",
        descricao: "CEP 96010-000, Centro, Pelotas.",
        url: "https://cep.test/rs/pelotas/rua-oscar-freire",
        esperado: "inconclusivo",
      },
    ],
  },
  {
    nome: "Garimpo (rua com número, sem detalhes)",
    entrada: GARIMPO_CAYOWAA,
    fixtures: [
      {
        id: "cy-imovel-certo",
        natureza: "imovel-certo",
        titulo: "Casa à venda na Rua Cayowaá, 1500 - Perdizes",
        descricao: "Sobrado com 3 dormitórios.",
        url: "https://portal-b.test/anuncio/cy1500",
        esperado: "relevante",
      },
      {
        id: "cy-mesma-rua-outro-numero",
        natureza: "outro-imovel",
        titulo: "Casa Rua Cayowaá 1520 Perdizes 3 quartos",
        descricao: "",
        url: "https://portal-b.test/anuncio/cy1520",
        esperado: "irrelevante",
      },
      {
        id: "cy-snippet-pobre",
        natureza: "anuncio-incompleto",
        titulo: "Casas à venda em Perdizes, São Paulo",
        descricao: "",
        url: "https://portal-d.test/venda/perdizes",
        esperado: "inconclusivo",
      },
      {
        id: "cy-rua-sem-numero",
        natureza: "anuncio-incompleto",
        titulo: "Sobrado na Cayowaá - Perdizes",
        descricao: "Anúncio sem mais detalhes.",
        url: "https://portal-f.test/imovel/sobrado-cayowaa",
        esperado: "inconclusivo",
      },
      {
        id: "cy-endereco-da-imobiliaria",
        natureza: "anuncio-incompleto",
        titulo: "Casa na Rua Cayowaá - Perdizes",
        descricao: "Imobiliária Exemplo - Rua Cardoso de Almeida, 100.",
        url: "https://imobiliaria-g.test/casa-cayowaa",
        // O único número do snippet é o endereço da imobiliária; a rua
        // procurada aparece fora dele. Não é evidência de outro imóvel.
        esperado: "inconclusivo",
      },
    ],
  },
];
