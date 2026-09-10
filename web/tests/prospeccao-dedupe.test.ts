import { describe, expect, it } from "vitest";
import {
  avaliarDuplicidadeProspeccao,
  caixaBuscaGeografica,
  duplicatasDoIdentificadoNaCarteira,
  type IdentidadeParaDedupe,
} from "@/lib/calculo/dedupeProspeccao";
import { chaveImovel } from "@/lib/calculo/duplicidade";
import type { Imovel } from "@/lib/tipos";

const identificado = (parcial: Partial<IdentidadeParaDedupe> = {}): IdentidadeParaDedupe => ({
  id: "alvo",
  logradouro: "Rua Souza Naves",
  numero: "100",
  cidade: "Londrina",
  unidade: "",
  bloco: "",
  tipo: "Casa",
  latitude: null,
  longitude: null,
  acuraciaMetros: null,
  ...parcial,
});

describe("deduplicação conservadora do Garimpo em Campo", () => {
  it("reusa a chave canônica e reconhece grafias do mesmo endereço", () => {
    expect(chaveImovel({
      endereco: "R. Souza Naves 100",
      cidade: "londrina",
      unidade: "",
      bloco: "",
    })).toBe(chaveImovel({
      endereco: "Rua Souza Naves, 100",
      cidade: "Londrina",
      unidade: "",
      bloco: "",
    }));
    expect(avaliarDuplicidadeProspeccao(
      identificado(),
      identificado({ id: "outro", logradouro: "R. Souza Naves" }),
    )).toMatchObject({ grau: "exata", origem: "texto" });
  });

  it("classifica 20 m com GPS preciso como provável e 200 m como não duplicata", () => {
    const alvo = identificado({ logradouro: "", numero: "", latitude: -23.31, longitude: -51.17, acuraciaMetros: 7 });
    const perto = identificado({ id: "perto", logradouro: "", numero: "", latitude: -23.30982, longitude: -51.17, acuraciaMetros: 7 });
    const longe = identificado({ id: "longe", logradouro: "", numero: "", latitude: -23.3082, longitude: -51.17, acuraciaMetros: 7 });
    expect(avaliarDuplicidadeProspeccao(alvo, perto)).toMatchObject({ grau: "provavel" });
    expect(avaliarDuplicidadeProspeccao(alvo, longe)).toBeNull();
  });

  it("usa unidade como veto mesmo na mesma coordenada", () => {
    const alvo = identificado({ tipo: "Apartamento", unidade: "101", latitude: -23.31, longitude: -51.17, acuraciaMetros: 7 });
    const outro = identificado({ id: "outro", tipo: "Apartamento", unidade: "202", latitude: -23.31, longitude: -51.17, acuraciaMetros: 7 });
    expect(avaliarDuplicidadeProspeccao(alvo, outro)).toBeNull();
  });

  it("limita tipo vertical sem unidade a possível", () => {
    const resultado = avaliarDuplicidadeProspeccao(
      identificado({ tipo: "Apartamento" }),
      identificado({ id: "outro", tipo: "Apartamento" }),
    );
    expect(resultado).toMatchObject({ grau: "possivel", motivo: "unidade-desconhecida" });
  });

  it("expõe a incerteza quando os círculos do GPS se sobrepõem", () => {
    const alvo = identificado({ logradouro: "", numero: "", latitude: -23.31, longitude: -51.17, acuraciaMetros: 80 });
    const outro = identificado({ id: "outro", logradouro: "", numero: "", latitude: -23.30973, longitude: -51.17, acuraciaMetros: 80 });
    expect(avaliarDuplicidadeProspeccao(alvo, outro)).toMatchObject({
      grau: "inconclusiva",
      motivo: "precisao-nao-separa",
    });
    expect(avaliarDuplicidadeProspeccao(
      { ...alvo, acuraciaMetros: 101 },
      { ...outro, acuraciaMetros: 7 },
    )).toBeNull();
  });

  it("não afirma sem identidade textual nem geográfica", () => {
    expect(avaliarDuplicidadeProspeccao(
      identificado({ logradouro: "", numero: "" }),
      identificado({ id: "outro", logradouro: "", numero: "" }),
    )).toBeNull();
  });

  it("reusa imoveisDuplicados contra a carteira e fornece bounding box", () => {
    const carteira = [{
      id: "pipeline-1",
      endereco: "R. Souza Naves 100",
      cidade: "Londrina",
      status: "Novo contato",
    }] as Imovel[];
    expect(duplicatasDoIdentificadoNaCarteira(identificado(), carteira).map((item) => item.id))
      .toEqual(["pipeline-1"]);
    const caixa = caixaBuscaGeografica(-23.31, -51.17, 60);
    expect(caixa.latitudeMinima).toBeLessThan(-23.31);
    expect(caixa.latitudeMaxima).toBeGreaterThan(-23.31);
    expect(caixa.longitudeMinima).toBeLessThan(-51.17);
    expect(caixa.longitudeMaxima).toBeGreaterThan(-51.17);
  });
});
