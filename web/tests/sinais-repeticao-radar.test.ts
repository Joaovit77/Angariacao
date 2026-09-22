import { describe, expect, it } from "vitest";
import type { AnuncioCentralAngariacao } from "@/lib/calculo/centralAngariacao";
import { situacaoRepeticaoCentral } from "@/lib/calculo/repeticaoCentralAngariacao";
import {
  avaliarPossivelImovelCarteira,
  avaliarPossivelMesmoImovel,
  buscaNoEscopoRepeticaoChaves,
  chaveLogradouro,
  idsJaConhecidosNoMercado,
  logradouroDaFoto,
  logradouroDoAnuncio,
  logradouroDoEndereco,
  numeroConfiavel,
  paresPossivelMesmoImovel,
} from "@/lib/calculo/sinaisRepeticaoRadar";
import {
  BELA_SUICA_3_QUARTOS,
  BELA_SUICA_6_QUARTOS,
  BELO_HORIZONTE_GEMINADA,
  BELO_HORIZONTE_TERREA,
  CHAMPAGNAT,
  EDU_CHAVES_DOM_PEDRO,
  EDU_CHAVES_NOVO_AEROPORTO,
  EDU_CHAVES_SANTOS_DUMONT,
  HIGIENOPOLIS_300,
  HIGIENOPOLIS_425,
  JARDIM_TOKIO,
  LD_178,
  LD_65,
  UNIVERSITARIO_DELVINA,
  UNIVERSITARIO_SEM_ENDERECO,
  VILA_FUJITA,
} from "./fixtures/radarChavesR41";

const classe = (a: AnuncioCentralAngariacao, b: AnuncioCentralAngariacao) =>
  avaliarPossivelMesmoImovel(a, b).classe;

describe("logradouro do anúncio (card, depois foto)", () => {
  it("normaliza tipo, acento e pontuação sem guardar o número", () => {
    expect(chaveLogradouro("Rua Edu Chaves")).toBe("edu chaves");
    expect(chaveLogradouro("Edu Chaves")).toBe("edu chaves");
    expect(chaveLogradouro("Av. São João")).toBe("sao joao");
    expect(logradouroDoEndereco("Rua Edu Chaves, 112")).toBe("edu chaves");
    expect(logradouroDoEndereco("Rua Henrique Dias, Casa, 378")).toBe("henrique dias");
  });

  it("recusa o que não é rua: bairro, bairro repetido e endereço indisponível", () => {
    expect(logradouroDoEndereco("Bairro Colinas, 1", "Colinas")).toBe("");
    expect(logradouroDoEndereco("Colinas, 10", "Colinas")).toBe("");
    expect(logradouroDoEndereco("Endereço indisponível")).toBe("");
    expect(logradouroDoEndereco(null)).toBe("");
  });

  it("usa o card quando ele traz a rua", () => {
    expect(logradouroDoAnuncio(EDU_CHAVES_NOVO_AEROPORTO)).toEqual({ chave: "edu chaves", origem: "card" });
    expect(logradouroDoAnuncio(EDU_CHAVES_SANTOS_DUMONT)).toEqual({ chave: "edu chaves", origem: "card" });
  });

  it("recupera pela foto o que o card esconde (31083573 e 33821843)", () => {
    expect(logradouroDoAnuncio(EDU_CHAVES_DOM_PEDRO)).toEqual({ chave: "edu chaves", origem: "foto" });
    expect(logradouroDoAnuncio(JARDIM_TOKIO)).toEqual({ chave: "yoshikawa koji", origem: "foto" });
  });

  it("sem card nem foto utilizável, o logradouro fica desconhecido", () => {
    expect(logradouroDoAnuncio(UNIVERSITARIO_SEM_ENDERECO)).toEqual({ chave: null, origem: "nenhum" });
    expect(logradouroDoAnuncio(BELO_HORIZONTE_GEMINADA)).toEqual({ chave: null, origem: "nenhum" });
    // A foto existe, mas o portal gravou "nao-encontrado" no lugar da rua.
    expect(logradouroDoAnuncio(HIGIENOPOLIS_300)).toEqual({ chave: null, origem: "nenhum" });
  });

  it("só confia na foto do host do Chaves e da mesma cidade", () => {
    const outraCidade = { ...EDU_CHAVES_DOM_PEDRO, cidade: "Cambé" };
    const outroHost = { ...EDU_CHAVES_DOM_PEDRO, imagem: EDU_CHAVES_DOM_PEDRO.imagem!.replace("chavesnamao.com.br", "exemplo.test") };
    const outroPortal = { ...EDU_CHAVES_DOM_PEDRO, portal: "olx" as const };
    expect(logradouroDaFoto(outraCidade)).toBe("");
    expect(logradouroDaFoto(outroHost)).toBe("");
    expect(logradouroDaFoto(outroPortal)).toBe("");
    expect(logradouroDaFoto({ ...EDU_CHAVES_DOM_PEDRO, imagem: "não é url" })).toBe("");
  });

  it("nunca extrai número da foto", () => {
    expect(logradouroDaFoto(EDU_CHAVES_DOM_PEDRO)).not.toMatch(/\d/);
    expect(numeroConfiavel(EDU_CHAVES_DOM_PEDRO.endereco)).toBeNull();
  });

  it("trata --, 0, 00 e 1 como número ausente", () => {
    expect(numeroConfiavel("Edu Chaves, --")).toBeNull();
    expect(numeroConfiavel("Avenida Doutor Adhemar Pereira De Barros, 00")).toBeNull();
    expect(numeroConfiavel("Rua Luiz Viotti, 1")).toBeNull();
    expect(numeroConfiavel("Rua Edu Chaves, 112")).toBe("112");
    expect(numeroConfiavel("Rua Henrique Dias, Casa, 378")).toBe("378");
  });
});

describe("já conhecido no mercado", () => {
  const inicio = "2026-09-22T12:00:00.000Z";

  it("marca só o id exato visto há mais de um dia", () => {
    const historico = [
      { id_externo: "38985130", primeiro_visto_em: "2026-08-22T17:20:47.000Z" },
      { id_externo: "43083373", primeiro_visto_em: "2026-09-22T12:00:05.000Z" },
      { id_externo: "45326545", primeiro_visto_em: "2026-09-22T06:49:47.000Z" },
    ];
    const novos = [BELO_HORIZONTE_GEMINADA, UNIVERSITARIO_DELVINA, UNIVERSITARIO_SEM_ENDERECO, JARDIM_TOKIO];
    // 43083373 nasceu nesta coleta; 45326545 foi visto horas antes; 33821843 não tem histórico.
    expect(idsJaConhecidosNoMercado(novos, historico, inicio)).toEqual(["38985130"]);
  });

  it("não associa anúncios diferentes: sem o mesmo id não há antiguidade", () => {
    const historico = [{ id_externo: "32076303", primeiro_visto_em: "2026-08-22T00:00:00.000Z" }];
    expect(idsJaConhecidosNoMercado([EDU_CHAVES_NOVO_AEROPORTO], historico, inicio)).toEqual([]);
  });

  it("ignora data inválida ou ausente", () => {
    const historico = [{ id_externo: "30868208", primeiro_visto_em: null }];
    expect(idsJaConhecidosNoMercado([EDU_CHAVES_NOVO_AEROPORTO], historico, inicio)).toEqual([]);
    expect(idsJaConhecidosNoMercado([EDU_CHAVES_NOVO_AEROPORTO], [], "data ruim")).toEqual([]);
  });
});

describe("possível mesmo imóvel: casos reais da auditoria", () => {
  it("sinaliza o grupo da Rua Edu Chaves, inclusive pela foto", () => {
    expect(avaliarPossivelMesmoImovel(EDU_CHAVES_SANTOS_DUMONT, EDU_CHAVES_NOVO_AEROPORTO)).toEqual({
      classe: "possivel_mesmo_imovel",
      motivo: null,
      evidencias: { origens: ["card", "card"], quartos: "nao-comparavel", numero: "nao-comparavel", precoDiferencaPct: 0 },
    });
    expect(avaliarPossivelMesmoImovel(EDU_CHAVES_DOM_PEDRO, EDU_CHAVES_SANTOS_DUMONT).evidencias).toMatchObject({
      origens: ["foto", "card"],
      quartos: "iguais",
    });
    expect(classe(EDU_CHAVES_DOM_PEDRO, EDU_CHAVES_NOVO_AEROPORTO)).toBe("possivel_mesmo_imovel");
  });

  it("forma os três pares do grupo sem repetir par", () => {
    const pares = paresPossivelMesmoImovel(
      [EDU_CHAVES_NOVO_AEROPORTO, EDU_CHAVES_DOM_PEDRO],
      [EDU_CHAVES_SANTOS_DUMONT, VILA_FUJITA, UNIVERSITARIO_DELVINA],
    );
    expect(pares).toEqual([
      ["30868208", "40494125"],
      ["30868208", "31083573"],
      ["31083573", "40494125"],
    ]);
  });

  it("mantém incerto o grupo da Rua Luiz Viotti / Jardim Belo Horizonte", () => {
    expect(avaliarPossivelMesmoImovel(BELO_HORIZONTE_TERREA, BELO_HORIZONTE_GEMINADA)).toEqual({
      classe: "dados_insuficientes",
      motivo: "logradouro-desconhecido",
      evidencias: null,
    });
  });

  it.each([
    ["Universitário", UNIVERSITARIO_DELVINA, UNIVERSITARIO_SEM_ENDERECO],
    ["Bela Suíça", BELA_SUICA_6_QUARTOS, BELA_SUICA_3_QUARTOS],
    ["Higienópolis", HIGIENOPOLIS_425, HIGIENOPOLIS_300],
    ["Vila Fujita × Champagnat", VILA_FUJITA, CHAMPAGNAT],
  ])("não sinaliza os imóveis distintos de %s", (_nome, a, b) => {
    expect(classe(a, b)).not.toBe("possivel_mesmo_imovel");
    expect(classe(b, a)).not.toBe("possivel_mesmo_imovel");
  });

  it("negativos continuam negativos mesmo se a rua fosse conhecida", () => {
    // Bela Suíça com a mesma rua forçada: 6 × 3 quartos separa.
    const mesmaRua = { ...BELA_SUICA_3_QUARTOS, endereco: BELA_SUICA_6_QUARTOS.endereco };
    expect(avaliarPossivelMesmoImovel(BELA_SUICA_6_QUARTOS, mesmaRua).motivo).toBe("quartos-divergentes");
    // Universitário na mesma rua: 5.700 × 5.500 ainda cabe em 5%, mas os números 190 × 170 separam.
    const vizinha = { ...UNIVERSITARIO_SEM_ENDERECO, endereco: "Rua Professora Delvina Borges, 170" };
    expect(avaliarPossivelMesmoImovel(UNIVERSITARIO_DELVINA, vizinha).motivo).toBe("numero-divergente");
    // Higienópolis na mesma rua: 10.000 × 12.000 separa pelo preço.
    const rua = "Rua Pio XII, --";
    const precoDiferente = avaliarPossivelMesmoImovel(
      { ...HIGIENOPOLIS_425, endereco: rua },
      { ...HIGIENOPOLIS_300, endereco: rua },
    );
    expect(precoDiferente.motivo).toBe("preco-divergente");
  });

  it("número vizinho confiável separa; placeholder não une nem separa", () => {
    const n116 = { ...EDU_CHAVES_NOVO_AEROPORTO, idExterno: "42846529", endereco: "Rua Edu Chaves, 116" };
    expect(avaliarPossivelMesmoImovel(EDU_CHAVES_NOVO_AEROPORTO, n116).motivo).toBe("numero-divergente");
    const n1 = { ...EDU_CHAVES_NOVO_AEROPORTO, idExterno: "1", endereco: "Rua Edu Chaves, 1" };
    expect(classe(EDU_CHAVES_NOVO_AEROPORTO, n1)).toBe("possivel_mesmo_imovel");
  });

  it("sem preço dos dois lados não há sinal", () => {
    const semPreco = { ...EDU_CHAVES_DOM_PEDRO, preco: null };
    expect(avaliarPossivelMesmoImovel(EDU_CHAVES_SANTOS_DUMONT, semPreco).motivo).toBe("preco-desconhecido");
  });

  it("fica desligado fora de Chaves na Mão + Casa", () => {
    const apto = { ...EDU_CHAVES_NOVO_AEROPORTO, tipo: "Apartamento" };
    const olx = { ...EDU_CHAVES_SANTOS_DUMONT, portal: "olx" as const };
    expect(classe(EDU_CHAVES_SANTOS_DUMONT, apto)).toBe("fora_do_escopo");
    expect(classe(olx, { ...EDU_CHAVES_NOVO_AEROPORTO, portal: "olx" })).toBe("fora_do_escopo");
    expect(classe(EDU_CHAVES_SANTOS_DUMONT, EDU_CHAVES_SANTOS_DUMONT)).toBe("fora_do_escopo");
    expect(buscaNoEscopoRepeticaoChaves({ portal: "chaves-na-mao", tipo: "Casa" })).toBe(true);
    expect(buscaNoEscopoRepeticaoChaves({ portal: "chaves-na-mao", tipo: "Apartamento" })).toBe(false);
    expect(buscaNoEscopoRepeticaoChaves({ portal: "chaves-na-mao" })).toBe(false);
    expect(buscaNoEscopoRepeticaoChaves({ portal: "olx", tipo: "Casa" })).toBe(false);
  });
});

describe("possível imóvel da carteira", () => {
  const carteira = [LD_65, LD_178];

  it("43083373 continua reconhecido pela regra atual (LD-65) e não entra no shadow", () => {
    expect(situacaoRepeticaoCentral(UNIVERSITARIO_DELVINA, carteira)).toEqual({
      motivo: "casa-no-pipeline",
      ocultar: true,
    });
    expect(avaliarPossivelImovelCarteira(UNIVERSITARIO_DELVINA, carteira).classe).toBe("ja_reconhecido_regra_atual");
  });

  it("45326545 (LD-178) fica sem correspondência: o card não traz rua nem foto", () => {
    expect(situacaoRepeticaoCentral(UNIVERSITARIO_SEM_ENDERECO, carteira).ocultar).toBe(false);
    expect(avaliarPossivelImovelCarteira(UNIVERSITARIO_SEM_ENDERECO, carteira)).toEqual({
      classe: "sem_correspondencia",
      origem: "nenhum",
      candidatos: [],
    });
  });

  it("sinaliza pela foto quando a rua e os dados batem, sem afirmar identidade", () => {
    const naRua = { ...LD_178, id: "imovel-x", codigo: "LD-900", endereco: "Rua Yoshikawa Koji, 250", quartos: 3, valorAluguel: 2900 };
    expect(avaliarPossivelImovelCarteira(JARDIM_TOKIO, [naRua, LD_65])).toEqual({
      classe: "possivel_imovel_carteira",
      origem: "foto",
      candidatos: [{ codigo: "LD-900", evidencias: ["logradouro", "quartos", "preco"], precoDiferencaPct: 3.4 }],
    });
  });

  it("sinaliza pelo card quando só a rua bate e o número do anúncio é placeholder", () => {
    const naRua = { ...LD_178, codigo: "LD-901", endereco: "Rua Edu Chaves, 112", valorAluguel: 6000 };
    const avaliacao = avaliarPossivelImovelCarteira(EDU_CHAVES_SANTOS_DUMONT, [naRua]);
    expect(avaliacao.classe).toBe("possivel_imovel_carteira");
    expect(avaliacao.origem).toBe("card");
    expect(avaliacao.candidatos[0].evidencias).toEqual(["logradouro", "preco"]);
  });

  it("não sinaliza com quartos, número ou preço divergentes", () => {
    const base = { ...LD_178, codigo: "LD-902", endereco: "Rua Yoshikawa Koji, 250", valorAluguel: 2800 };
    expect(avaliarPossivelImovelCarteira(JARDIM_TOKIO, [{ ...base, quartos: 2 }]).classe).toBe("sem_correspondencia");
    expect(avaliarPossivelImovelCarteira(JARDIM_TOKIO, [{ ...base, valorAluguel: 4000 }]).classe).toBe("sem_correspondencia");
    const vizinha = { ...LD_178, codigo: "LD-903", endereco: "Rua Edu Chaves, 116", valorAluguel: 6000 };
    expect(avaliarPossivelImovelCarteira(EDU_CHAVES_NOVO_AEROPORTO, [vizinha]).classe).toBe("sem_correspondencia");
  });

  it("não sinaliza apartamento, unidade ou outra cidade da carteira", () => {
    const rua = "Rua Yoshikawa Koji, 250";
    const variantes = [
      { ...LD_178, codigo: "A", endereco: rua, tipo: "Apartamento" },
      { ...LD_178, codigo: "B", endereco: rua, unidade: "2" },
      { ...LD_178, codigo: "C", endereco: rua, cidade: "Cambé" },
    ];
    expect(avaliarPossivelImovelCarteira(JARDIM_TOKIO, variantes).classe).toBe("sem_correspondencia");
  });

  it("fica desligado fora do escopo", () => {
    const apto = { ...JARDIM_TOKIO, tipo: "Apartamento" };
    expect(avaliarPossivelImovelCarteira(apto, carteira).classe).toBe("fora_do_escopo");
  });
});
