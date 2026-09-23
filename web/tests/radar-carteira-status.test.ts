import { describe, expect, it } from "vitest";
import type { AnuncioCentralAngariacao } from "@/lib/calculo/centralAngariacao";
import { resumirPendenciasRadar, type CandidatoPendenteRadar } from "@/lib/calculo/radarAngariacao";
import {
  imovelBloqueiaRadar,
  situacaoRepeticaoCentral,
  STATUS_CARTEIRA_SEM_BLOQUEIO_RADAR,
} from "@/lib/calculo/repeticaoCentralAngariacao";
import { avaliarPossivelImovelCarteira } from "@/lib/calculo/sinaisRepeticaoRadar";
import { STATUS_ALL } from "@/lib/constantes";
import type { Imovel } from "@/lib/tipos";

/* R4.1c.1: "Perdido" continua reconhecido como imóvel da carteira, mas não
   esconde o anúncio. Casos reais da auditoria R4.1c.0 (Production, 23/09/2026):
   endereços e textos dos cards do Chaves e dos imóveis da carteira. */

const anuncio = (idExterno: string, titulo: string, endereco: string | null): AnuncioCentralAngariacao => ({
  idExterno,
  portal: "chaves-na-mao",
  titulo,
  endereco,
  cidade: "Londrina",
  estado: "PR",
  tipo: "Casa",
  url: `https://www.chavesnamao.com.br/imovel/casa-para-alugar/id-${idExterno}/`,
  anunciante: "incerto",
});

const imovel = (codigo: string, endereco: string, status: string, extra: Partial<Imovel> = {}): Imovel => ({
  id: `imovel-${codigo}`,
  codigo,
  endereco,
  cidade: "Londrina",
  tipo: "Casa",
  status,
  ...extra,
});

// Perdido: deixam de esconder.
const LD_75 = imovel("LD-75", "Avenida Alziro Zarur, 200", "Perdido", { motivoPerda: "Imóvel já alugado por conta própria" });
const LD_261 = imovel("LD-261", "Rua João Romanholi, 80", "Perdido", { motivoPerda: "Optou por outra imobiliária" });
const LD_254 = imovel("LD-254", "Rua Adalice Ribeiro de Franca Lima, 67", "Perdido", { motivoPerda: "Número não encontrado" });
const LD_176 = imovel("LD-176", "Rua Edu Chaves, 112", "Perdido", { tipo: "Apartamento", motivoPerda: "Imóvel já alugado por conta própria" });
// Continuam escondendo.
const LD_65 = imovel("LD-65", "Rua Professora Delvina Borges, 190", "Publicado");
const LD_152 = imovel("LD-152", "Rua São Caetano do Sul, 67", "Publicado");
const LD_298 = imovel("LD-298", "Rua Joel Braz de Oliveira, 677", "Novo contato");
const LD_306 = imovel("LD-306", "Rua Francisco Bernardino Leite, 341", "Novo contato");
const LD_333 = imovel("LD-333", "Rua João Wanderley, 72", "Novo contato", { tipo: "" });

const CARTEIRA = [LD_75, LD_261, LD_254, LD_176, LD_65, LD_152, LD_298, LD_306, LD_333];

const A_32495077 = anuncio("32495077", "Casa com 1 quarto para alugar na Avenida Alziro Zarur, 200, San Conrado, Londrina", "Avenida Alziro Zarur, 200");
const A_44426487 = anuncio("44426487", "Casa com 3 quartos para alugar na Rua João Romanholi, 80, Jardim Guararapes, Londrina", "Rua João Romanholi, 80");
const A_45732856 = anuncio("45732856", "ALUGUEL - Sobrado com 4 Dormitorios sendo 1 suíte - Portal dos Pioneiros em região leste de Londrina -PR", "Rua Adalice Ribeiro De Franca Lima, 67");
const A_30868208 = anuncio("30868208", "Casa com fino acabamento para Venda ou Locação próximo ao Aeroporto, Londrina-PR", "Rua Edu Chaves, 112");
const A_43083373 = anuncio("43083373", "Casa com 3 dormitórios para alugar, 200 m² por R$ 5.700,00/mês - Universitário - Londrina/PR", "Rua Professora Delvina Borges, 190");
const A_45365246 = anuncio("45365246", "Sobrado Com Piscina Aquecida, Sauna E 4 Quartos Champagnat 450 Metros", "Rua São Caetano Do Sul, 67");
const A_32580375 = anuncio("32580375", "Casa com 3 dormitórios para alugar, 80 m² por R$ 2.700,00/mês - Jardim Guararapes - Londrina/PR", "Rua Joel Braz De Oliveira, 677");
const A_44843198 = anuncio("44843198", "LOCAÇÃO CASA 3 Dormitórios, Vale Verde, Rua Francisco Bernardino Leite, Londrina, PR", "Rua Francisco Bernardino Leite, 341");
const A_46811835 = anuncio("46811835", "Casa com 04 Quartos e Divisão Frente/Fundos Uso Residencial ou Comercial, Jardim Londrilar", "Rua João Wanderley, 72");

const situacao = (a: AnuncioCentralAngariacao, imoveis: Imovel[] = CARTEIRA) => situacaoRepeticaoCentral(a, imoveis);

describe("imovelBloqueiaRadar (R4.1c.1)", () => {
  it("só Perdido deixa de bloquear", () => {
    expect(STATUS_CARTEIRA_SEM_BLOQUEIO_RADAR).toEqual(["Perdido"]);
    expect(imovelBloqueiaRadar({ status: "Perdido" })).toBe(false);
    for (const status of [...STATUS_ALL, "Locado"].filter((s) => s !== "Perdido")) {
      expect(imovelBloqueiaRadar({ status })).toBe(true);
    }
  });
});

describe("Perdido: correspondência continua, bloqueio não (casos reais)", () => {
  it.each([
    ["32495077 ↔ LD-75", A_32495077, "LD-75", "Imóvel já alugado por conta própria"],
    ["44426487 ↔ LD-261", A_44426487, "LD-261", "Optou por outra imobiliária"],
    ["45732856 ↔ LD-254", A_45732856, "LD-254", "Número não encontrado"],
  ])("%s fica visível e guarda o contexto", (_caso, a, codigo, motivoPerda) => {
    expect(situacao(a)).toEqual({
      motivo: null,
      ocultar: false,
      naCarteiraSemBloqueio: [{ codigo, status: "Perdido", motivoPerda, via: "endereco" }],
    });
  });

  it("antes do R4.1c.1 os mesmos três eram escondidos (mesmo imóvel com outro status)", () => {
    for (const [a, base] of [[A_32495077, LD_75], [A_44426487, LD_261], [A_45732856, LD_254]] as const) {
      expect(situacao(a, [{ ...base, status: "Novo contato" }])).toEqual({ motivo: "casa-no-pipeline", ocultar: true });
    }
  });

  it("Perdido + url-na-carteira: não esconde e preserva a correspondência pela URL", () => {
    const comLink = { ...LD_75, textoAnuncio: `Anúncio: ${A_32495077.url}` };
    expect(situacao(A_32495077, [comLink])).toEqual({
      motivo: null,
      ocultar: false,
      naCarteiraSemBloqueio: [{ codigo: "LD-75", status: "Perdido", motivoPerda: "Imóvel já alugado por conta própria", via: "url" }],
    });
  });

  it("URL de imóvel Perdido não esconde, mas outro imóvel ativo no endereço ainda esconde", () => {
    const perdidoComLink = { ...LD_75, id: "imovel-antigo", codigo: "LD-10", textoAnuncio: A_32495077.url };
    const ativo = { ...LD_75, status: "Sem resposta" };
    expect(situacao(A_32495077, [perdidoComLink, ativo])).toEqual({ motivo: "casa-no-pipeline", ocultar: true });
  });

  it("url-na-carteira continua escondendo quando o dono não é Perdido", () => {
    const comLink = { ...LD_65, textoAnuncio: A_32495077.url };
    expect(situacao(A_32495077, [comLink])).toEqual({ motivo: "url-na-carteira", ocultar: true });
  });
});

describe("demais status mantêm o bloqueio (casos reais)", () => {
  it.each([
    ["43083373 ↔ LD-65 (Publicado)", A_43083373],
    ["45365246 ↔ LD-152 (Publicado)", A_45365246],
    ["32580375 ↔ LD-298 (Novo contato)", A_32580375],
    ["44843198 ↔ LD-306 (Novo contato)", A_44843198],
    ["46811835 ↔ LD-333 (Novo contato)", A_46811835],
  ])("%s continua escondido", (_caso, a) => {
    expect(situacao(a)).toEqual({ motivo: "casa-no-pipeline", ocultar: true });
  });

  it("Sem resposta no mesmo endereço continua escondendo", () => {
    expect(situacao(A_32495077, [{ ...LD_75, status: "Sem resposta" }])).toEqual({ motivo: "casa-no-pipeline", ocultar: true });
  });

  it("nenhum status diferente de Perdido muda de comportamento, inclusive retirado", () => {
    for (const status of [...STATUS_ALL, "Locado"].filter((s) => s !== "Perdido")) {
      expect(situacao(A_32495077, [{ ...LD_75, status }])).toEqual({ motivo: "casa-no-pipeline", ocultar: true });
      expect(situacao(A_32495077, [{ ...LD_75, status, textoAnuncio: A_32495077.url }]))
        .toEqual({ motivo: "url-na-carteira", ocultar: true });
    }
    expect(situacao(A_32495077, [{ ...LD_75, status: "Cancelado", retirado: true }]))
      .toEqual({ motivo: "casa-no-pipeline", ocultar: true });
  });

  it("Perdido e ativo no mesmo endereço: o ativo esconde", () => {
    const ativo = { ...LD_75, id: "imovel-novo", codigo: "LD-900", status: "Novo contato" };
    expect(situacao(A_32495077, [LD_75, ativo])).toEqual({ motivo: "casa-no-pipeline", ocultar: true });
  });
});

describe("apartamento e LD-176 mantêm a semântica atual", () => {
  it("LD-176 (Perdido, cadastrada como Apartamento) não vira casa-no-pipeline nem ganha contexto", () => {
    expect(situacao(A_30868208)).toEqual({ motivo: null, ocultar: false });
  });

  it("anúncio de apartamento continua só com selo, com imóvel ativo ou Perdido", () => {
    const apto = { ...A_43083373, titulo: "Apartamento com 3 quartos", tipo: "Apartamento" };
    expect(situacao(apto, [LD_65])).toEqual({ motivo: "apartamento-no-endereco", ocultar: false });
    expect(situacao(apto, [{ ...LD_65, status: "Perdido" }])).toEqual({ motivo: "apartamento-no-endereco", ocultar: false });
  });
});

describe("contador do Radar usa a mesma regra da lista", () => {
  const buscas = [{ id: "busca-chaves", filtros: { portal: "chaves-na-mao" as const, cidade: "Londrina", estado: "PR", tipo: "Casa" } }];
  const candidatos: CandidatoPendenteRadar[] = [
    A_32495077, A_44426487, A_45732856, A_30868208, A_43083373, A_45365246, A_32580375, A_44843198, A_46811835,
  ].map((a) => ({ id: `radar-${a.idExterno}`, buscaId: "busca-chaves", anuncio: a }));

  it("os três de imóvel Perdido voltam a contar; os ativos continuam fora", () => {
    const resumo = resumirPendenciasRadar(candidatos, buscas, CARTEIRA);
    expect([...resumo.ids].sort()).toEqual(["radar-30868208", "radar-32495077", "radar-44426487", "radar-45732856"]);
    for (const candidato of candidatos) {
      expect(resumo.ids.has(candidato.id)).toBe(!situacao(candidato.anuncio as AnuncioCentralAngariacao).ocultar);
    }
  });

  it("com os mesmos imóveis ativos, o contador era o de antes", () => {
    const semPerdido = CARTEIRA.map((i) => (i.status === "Perdido" ? { ...i, status: "Novo contato" } : i));
    expect([...resumirPendenciasRadar(candidatos, buscas, semPerdido).ids]).toEqual(["radar-30868208"]);
  });
});

describe("shadow do R4.1a continua detectando imóvel Perdido", () => {
  it("LD-75 deixa de ser 'já reconhecido' e aparece como possível imóvel da carteira", () => {
    expect(avaliarPossivelImovelCarteira(A_32495077, [LD_75])).toMatchObject({
      classe: "possivel_imovel_carteira",
      origem: "card",
      candidatos: [{ codigo: "LD-75", evidencias: expect.arrayContaining(["logradouro", "numero"]) }],
    });
  });

  it("imóvel ativo continua 'já reconhecido pela regra atual'", () => {
    expect(avaliarPossivelImovelCarteira(A_43083373, [LD_65]).classe).toBe("ja_reconhecido_regra_atual");
  });
});
