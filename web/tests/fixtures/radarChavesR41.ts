import type { AnuncioCentralAngariacao } from "@/lib/calculo/centralAngariacao";
import type { Imovel } from "@/lib/tipos";

/* Anúncios reais da busca "Londrina · Chaves na Mão" (Casa), copiados de
   `radar_anuncios.dados` em Production na auditoria R4.1 (22/09/2026).
   São cards públicos do portal; só os campos que o shadow lê. */

const IMAGEM = "https://www.chavesnamao.com.br/imn/0400X0262/N/60/imoveis";

function chaves(
  idExterno: string,
  campos: Omit<Partial<AnuncioCentralAngariacao>, "idExterno" | "portal">,
): AnuncioCentralAngariacao {
  return {
    idExterno,
    portal: "chaves-na-mao",
    titulo: "",
    cidade: "Londrina",
    estado: "PR",
    tipo: "Casa",
    endereco: null,
    imagem: null,
    anunciante: "incerto",
    url: `https://www.chavesnamao.com.br/imovel/casa-para-alugar/id-${idExterno}/`,
    ...campos,
  };
}

/* Grupo Rua Edu Chaves: provável mesma casa com vários anunciantes. Bairro,
   área e número divergem; rua, preço, quartos e vagas coincidem. */
export const EDU_CHAVES_SANTOS_DUMONT = chaves("40494125", {
  titulo: "Casa com 3 quartos para alugar na Edu Chaves, --, Santos Dumont, Londrina por R$ 6.000",
  endereco: "Edu Chaves, --",
  bairro: "Santos Dumont",
  preco: 6000,
  areaM2: 210,
  quartos: 3,
  imagem: `${IMAGEM}/69458/40494125/pr-londrina-santos-dumont-rua-edu-chaves-casa-sobrado-para-alugar-3-quartos-69b553eb-1.jpg`,
  descricao: "Edu Chaves, -- · Santos Dumont, Londrina/PR · 210m² · 3 · 2 · 4 · R$ 6.000",
});

export const EDU_CHAVES_NOVO_AEROPORTO = chaves("30868208", {
  titulo: "Casa com fino acabamento para Venda ou Locação próximo ao Aeroporto, Londrina-PR",
  endereco: "Rua Edu Chaves, 112",
  bairro: "Novo Aeroporto",
  preco: 6000,
  areaM2: 140,
  quartos: null,
  descricao: "Rua Edu Chaves, 112 · Novo Aeroporto, Londrina/PR · 140m² · 3 · 3 · 4 · R$ 6.000",
});

/** Card diz "Endereço indisponível"; a rua só aparece no nome da foto. */
export const EDU_CHAVES_DOM_PEDRO = chaves("31083573", {
  titulo: "Casa com 3 quartos para alugar no Dom Pedro, Londrina",
  bairro: "Dom Pedro",
  preco: 6000,
  areaM2: 127,
  quartos: 3,
  imagem: `${IMAGEM}/353919/31083573/pr-londrina-dom-pedro-rua-edu-chaves-casa-sobrado-para-alugar-3-quartos-6836e7da-1.jpg`,
  descricao: "Endereço indisponível · Dom Pedro, Londrina/PR · 127m² · 3 · 2 · 4 · R$ 6.000",
});

/* Grupo Rua Luiz Viotti / Jardim Belo Horizonte: sem endereço nem foto; um
   deles se diz "geminada". Precisa continuar incerto. */
export const BELO_HORIZONTE_TERREA = chaves("43633398", {
  titulo: "Casa Terrea no Jardim Belo Horizonte |3 Dormitorios (1 Suite) | Espaco Gourmet",
  bairro: "Jardim Belo Horizonte",
  preco: 3500,
  areaM2: 87,
  quartos: 3,
  suites: 1,
  descricao: "Endereço indisponível · Jardim Belo Horizonte, Londrina/PR · 87m² · 3 · 3 · 1 · R$ 3.500",
});

export const BELO_HORIZONTE_GEMINADA = chaves("38985130", {
  titulo: "Casa Geminada Locação e Venda, Jardim Belo Horizonte, Londrina, PR",
  bairro: "Jardim Belo Horizonte",
  preco: 3500,
  areaM2: 87,
  quartos: null,
  descricao: "Endereço indisponível · Jardim Belo Horizonte, Londrina/PR · 87m² · 3 · 1 · 1 · R$ 3.500",
});

/* Negativos: parecem iguais e são imóveis distintos. */
/** LD-65 da carteira (Rua Professora Delvina Borges, 190). */
export const UNIVERSITARIO_DELVINA = chaves("43083373", {
  titulo: "Casa com 3 dormitórios para alugar, 200 m² por R$ 5.700,00/mês - Universitário - Londrina/PR",
  endereco: "Rua Professora Delvina Borges, 190",
  bairro: "Universitário",
  preco: 5700,
  areaM2: 200,
  quartos: 3,
  descricao: "Rua Professora Delvina Borges, 190 · Universitário, Londrina/PR · 200m² · 3 · 4 · 4 · R$ 5.700",
});

/** LD-178 da carteira (Rua Presidente Wilson, 170), mas o card não diz nada. */
export const UNIVERSITARIO_SEM_ENDERECO = chaves("45326545", {
  titulo: "Casa para alugar no Universitário, Londrina",
  bairro: "Universitário",
  preco: 5500,
  areaM2: 202,
  quartos: null,
  descricao: "Endereço indisponível · Universitário, Londrina/PR · 202m² · R$ 5.500",
});

export const BELA_SUICA_6_QUARTOS = chaves("46067136", {
  titulo: "Casa com 6 quartos para alugar na Avenida Doutor Adhemar Pereira De Barros, 00, Bela Suiça, Londrina",
  endereco: "Avenida Doutor Adhemar Pereira De Barros, 00",
  bairro: "Bela Suiça",
  preco: 25000,
  areaM2: null,
  quartos: 6,
  descricao: "Avenida Doutor Adhemar Pereira De Barros, 00 · Bela Suiça, Londrina/PR · 1m² · 6 · 9 · 4 · R$ 25.000",
});

export const BELA_SUICA_3_QUARTOS = chaves("38320621", {
  titulo: "Casa com 3 quartos para alugar na Bela Suiça, Londrina",
  bairro: "Bela Suiça",
  preco: 25000,
  areaM2: 490,
  quartos: 3,
  descricao: "Endereço indisponível · Bela Suiça, Londrina/PR · 490m² · 3 · 5 · 6 · R$ 25.000",
});

export const HIGIENOPOLIS_425 = chaves("40244202", {
  titulo: "Casa para alugar no Jardim Higienópolis, Londrina",
  bairro: "Jardim Higienópolis",
  preco: 10000,
  areaM2: 425,
  quartos: null,
  descricao: "Endereço indisponível · Jardim Higienópolis, Londrina/PR · 425m² · 4 · 8 · R$ 10.000",
});

/** A foto existe, mas o portal gravou "nao-encontrado" no lugar da rua. */
export const HIGIENOPOLIS_300 = chaves("25051139", {
  titulo: "Casa com 3 quartos para alugar no Jardim Higienópolis, Londrina",
  bairro: "Jardim Higienópolis",
  preco: 12000,
  areaM2: 300,
  quartos: 3,
  imagem: `${IMAGEM}/435527/25051139/pr-londrina-nao-encontrado-casa-sobrado-para-alugar-3-quartos-6a9eadba-1.jpg`,
  descricao: "Endereço indisponível · Jardim Higienópolis, Londrina/PR · 300m² · 3 · 5 · 4 · R$ 12.000",
});

export const VILA_FUJITA = chaves("45365235", {
  titulo: "Casa Com 3 quartos, Churrasqueira E 5 Vagas Próxima Ao Lago Igapó",
  endereco: "Rua Henrique Dias, Casa, 378",
  bairro: "Vila Fujita",
  preco: 4900,
  areaM2: 275,
  quartos: 3,
  vagas: 5,
  imagem: `${IMAGEM}/1029559/45365235/pr-londrina-vila-fujita-rua-henrique-dias-casa-sobrado-para-alugar-3-quartos-6a72721f-1.jpg`,
  descricao: "Rua Henrique Dias, Casa, 378 · Vila Fujita, Londrina/PR · 275m² · 3 · 1 · 3 · R$ 4.900",
});

export const CHAMPAGNAT = chaves("45365246", {
  titulo: "Sobrado Com Piscina Aquecida, Sauna E 4 Quartos Champagnat 450 Metros",
  endereco: "Rua São Caetano Do Sul, 67",
  bairro: "Champagnat",
  preco: 6400,
  areaM2: 450,
  quartos: 4,
  imagem: `${IMAGEM}/1029560/45365246/pr-londrina-champagnat-rua-sao-caetano-do-sul-casa-sobrado-para-alugar-4-quartos-6a727227-1.jpg`,
  descricao: "Rua São Caetano Do Sul, 67 · Champagnat, Londrina/PR · 450m² · 4 · 3 · 4 · R$ 6.400",
});

/** Rua só no nome da foto. */
export const JARDIM_TOKIO = chaves("33821843", {
  titulo: "Casa com 3 dormitórios para alugar, 100 m² por R$ 2.800,00/mês - Jardim Tókio - Londrina/PR",
  bairro: "Jardim Tókio",
  preco: 2800,
  areaM2: 100,
  quartos: 3,
  imagem: `${IMAGEM}/271247/33821843/pr-londrina-jardim-tokio-rua-yoshikawa-koji-casa-sobrado-para-alugar-3-quartos-68d75151-1.jpg`,
  descricao: "Endereço indisponível · Jardim Tókio, Londrina/PR · 100m² · 3 · 2 · R$ 2.800",
});

/* Controles reais da carteira (somente código, endereço e dados objetivos). */
function daCarteira(parcial: Partial<Imovel>): Imovel {
  return {
    id: `imovel-${parcial.codigo}`,
    endereco: "",
    cidade: "Londrina",
    tipo: "Casa",
    status: "Publicado",
    ...parcial,
  } as Imovel;
}

export const LD_65 = daCarteira({
  codigo: "LD-65",
  endereco: "Rua Professora Delvina Borges, 190",
  bairro: "Universitário",
  valorAluguel: 6000,
});

export const LD_178 = daCarteira({
  codigo: "LD-178",
  endereco: "Rua Presidente Wilson, 170",
  bairro: "Universitário",
  valorAluguel: 5500,
});
