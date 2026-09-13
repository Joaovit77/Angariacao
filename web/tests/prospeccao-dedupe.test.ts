// @vitest-environment jsdom

import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const cenario = vi.hoisted(() => ({ buscarDuplicatas: vi.fn() }));
vi.mock("@/lib/useProspeccao", () => ({
  useProspeccao: (seletor: (estado: { buscarDuplicatas: typeof cenario.buscarDuplicatas }) => unknown) =>
    seletor({ buscarDuplicatas: cenario.buscarDuplicatas }),
}));

import CandidatosDuplicidade from "@/components/prospeccao/CandidatosDuplicidade";
import {
  avaliarDuplicidadeProspeccao,
  caixaBuscaGeografica,
  chaveImovelIdentificado,
  descreverResultadoDedupe,
  duplicatasDoIdentificadoNaCarteira,
  encontrarDuplicatasProspeccao,
  geografiaOpina,
  raioBuscaCandidatosMetros,
  ROTULO_GRAU_DUPLICIDADE,
  type IdentidadeParaDedupe,
} from "@/lib/calculo/dedupeProspeccao";
import { chaveImovel } from "@/lib/calculo/duplicidade";
import { buscarCandidatosDuplicidade } from "@/lib/prospeccao";
import { useAppStore } from "@/lib/store";
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

/* ================================================================
   C7 — a dedupe ligada à persistência e à tela.

   O núcleo puro acima já decide. Daqui para baixo prova-se que a
   fronteira busca candidatos pelas duas chaves certas (texto e caixa
   geográfica), que a tela explica o motivo com os números do veredito,
   que a carteira é só lida, e que nada — nenhum clique, nenhum estado —
   bloqueia, funde ou promove. Avisa. Só isso.
   ================================================================ */

// Um GPS de ±7 m separa 30 m; a ±80 m não separa mais. O mesmo par.
const PONTO = { latitude: -23.31, longitude: -51.16 };
/** ~metros para o norte, em graus de latitude. */
const norte = (metros: number) => metros / 111_320;

describe("C7 — os doze casos obrigatórios, no núcleo puro", () => {
  it("1. duplicata textual normalizada: 'R. Souza Naves, 100' × 'Rua Souza Naves 100'", () => {
    const resultado = avaliarDuplicidadeProspeccao(
      identificado({ logradouro: "R. Souza Naves,", numero: "100" }),
      identificado({ id: "outro", logradouro: "Rua Souza Naves", numero: "100" }),
    );
    expect(resultado).toMatchObject({ grau: "exata", origem: "texto", motivo: "identidade-textual" });
  });

  it("2. provável por proximidade: ~20 m com ±7 m dos dois lados", () => {
    const resultado = avaliarDuplicidadeProspeccao(
      identificado({ logradouro: "", numero: "", ...PONTO, acuraciaMetros: 7 }),
      identificado({ id: "outro", logradouro: "", numero: "", latitude: PONTO.latitude + norte(20), longitude: PONTO.longitude, acuraciaMetros: 7 }),
    );
    expect(resultado).toMatchObject({ grau: "provavel", origem: "geografia", motivo: "proximidade" });
    expect(resultado?.distanciaMetros).toBeCloseTo(20, 0);
  });

  it("3. falso positivo distante: ~200 m não acusa por geografia", () => {
    expect(avaliarDuplicidadeProspeccao(
      identificado({ logradouro: "", numero: "", ...PONTO, acuraciaMetros: 7 }),
      identificado({ id: "outro", logradouro: "", numero: "", latitude: PONTO.latitude + norte(200), longitude: PONTO.longitude, acuraciaMetros: 7 }),
    )).toBeNull();
  });

  it("4. apartamentos de unidades diferentes: mesma coordenada, mesmo prédio, nunca duplicata", () => {
    expect(avaliarDuplicidadeProspeccao(
      identificado({ tipo: "Apartamento", unidade: "301", ...PONTO, acuraciaMetros: 5 }),
      identificado({ id: "outro", tipo: "Apartamento", unidade: "302", ...PONTO, acuraciaMetros: 5 }),
    )).toBeNull();
  });

  it("5. unidade ausente em vertical: incerteza — nunca passa de possível, nem com endereço igual", () => {
    const textual = avaliarDuplicidadeProspeccao(
      identificado({ tipo: "Apartamento", unidade: "" }),
      identificado({ id: "outro", tipo: "Apartamento", unidade: "" }),
    );
    expect(textual).toMatchObject({ grau: "possivel", motivo: "unidade-desconhecida" });
    const geografico = avaliarDuplicidadeProspeccao(
      identificado({ logradouro: "", numero: "", tipo: "Apartamento", ...PONTO, acuraciaMetros: 5 }),
      identificado({ id: "outro", logradouro: "", numero: "", tipo: "Casa", latitude: PONTO.latitude + norte(20), longitude: PONTO.longitude, acuraciaMetros: 5 }),
    );
    expect(geografico?.grau).toBe("possivel");
  });

  it("6. GPS preserva acurácia: acuracia_metros entra de verdade no cálculo", () => {
    const perto = (acuracia: number) => avaliarDuplicidadeProspeccao(
      identificado({ logradouro: "", numero: "", ...PONTO, acuraciaMetros: acuracia }),
      identificado({ id: "outro", logradouro: "", numero: "", latitude: PONTO.latitude + norte(30), longitude: PONTO.longitude, acuraciaMetros: acuracia }),
    );
    // 30 m com ±7 m: círculos separados (14 < 30) e acima dos 25 m ⇒ possível.
    expect(perto(7)?.grau).toBe("possivel");
    // 30 m com ±20 m: círculos se sobrepõem (40 ≥ 30) ⇒ não dá para saber.
    expect(perto(20)?.motivo).toBe("precisao-nao-separa");
  });

  it("7. GPS impreciso (±80 m) reduz o veredito do mesmo par para 'não dá para saber'", () => {
    const par = (acuracia: number) => avaliarDuplicidadeProspeccao(
      identificado({ logradouro: "", numero: "", ...PONTO, acuraciaMetros: acuracia }),
      identificado({ id: "outro", logradouro: "", numero: "", latitude: PONTO.latitude + norte(20), longitude: PONTO.longitude, acuraciaMetros: acuracia }),
    );
    expect(par(7)?.grau).toBe("provavel");
    expect(par(80)).toMatchObject({ grau: "inconclusiva", motivo: "precisao-nao-separa" });
  });

  it("8. acurácia > 100 m (ou nula) em qualquer ponta: a geografia não opina", () => {
    const outro = identificado({ id: "outro", logradouro: "", numero: "", latitude: PONTO.latitude + norte(5), longitude: PONTO.longitude, acuraciaMetros: 5 });
    expect(avaliarDuplicidadeProspeccao(identificado({ logradouro: "", numero: "", ...PONTO, acuraciaMetros: 101 }), outro)).toBeNull();
    expect(avaliarDuplicidadeProspeccao(identificado({ logradouro: "", numero: "", ...PONTO, acuraciaMetros: null }), outro)).toBeNull();
    expect(geografiaOpina(identificado({ ...PONTO, acuraciaMetros: 101 }))).toBe(false);
    expect(geografiaOpina(identificado({ ...PONTO, acuraciaMetros: 100 }))).toBe(true);
    // Mas a chave textual continua decidindo o que pode.
    expect(avaliarDuplicidadeProspeccao(
      identificado({ ...PONTO, acuraciaMetros: 500 }),
      identificado({ id: "outro", ...PONTO, acuraciaMetros: 500 }),
    )?.grau).toBe("exata");
  });

  it("9. sem endereço e sem coordenada: nenhuma afirmação", () => {
    expect(encontrarDuplicatasProspeccao(
      identificado({ logradouro: "", numero: "" }),
      [identificado({ id: "outro", logradouro: "", numero: "" }), identificado({ id: "outro-2" })],
    )).toEqual([]);
  });

  it("10. contra a carteira: reusa imoveisDuplicados e nada mais", () => {
    const carteira = [{ id: "pipeline-1", endereco: "R. Souza Naves 100", cidade: "Londrina" }] as Imovel[];
    expect(duplicatasDoIdentificadoNaCarteira(identificado(), carteira).map((item) => item.id)).toEqual(["pipeline-1"]);
    expect(duplicatasDoIdentificadoNaCarteira(identificado({ unidade: "301" }), carteira)).toEqual([]);
    const fonte = readFileSync(resolve("lib/calculo/dedupeProspeccao.ts"), "utf8");
    expect(fonte).toContain("imoveisDuplicados(");
    expect(fonte).not.toMatch(/salvarImovel|vincular_promocao|fundir_imoveis/);
  });

  it("11. unidade é veto a distância zero, mesmo com endereço textual idêntico", () => {
    expect(avaliarDuplicidadeProspeccao(
      identificado({ unidade: "Apto 12", ...PONTO, acuraciaMetros: 3 }),
      identificado({ id: "outro", unidade: "Apto 13", ...PONTO, acuraciaMetros: 3 }),
    )).toBeNull();
  });

  it("12. círculos sobrepostos: 'a precisão do GPS não separa os dois', sem virar certeza", () => {
    const alvo = identificado({ logradouro: "", numero: "", ...PONTO, acuraciaMetros: 40 });
    const candidato = identificado({ id: "outro", logradouro: "", numero: "", latitude: PONTO.latitude + norte(30), longitude: PONTO.longitude, acuraciaMetros: 60 });
    const resultado = avaliarDuplicidadeProspeccao(alvo, candidato)!;
    expect(resultado).toMatchObject({ grau: "inconclusiva", motivo: "precisao-nao-separa" });
    expect(ROTULO_GRAU_DUPLICIDADE[resultado.grau]).toBe("Não dá para saber");
    expect(descreverResultadoDedupe(resultado, alvo, candidato))
      .toBe("A cerca de 30 m; mas a precisão do GPS (±40 m e ±60 m) não separa os dois");
  });
});

describe("C7 — explicação e pré-filtro", () => {
  it("o motivo carrega os números do veredito e nunca inventa percentual", () => {
    const alvo = identificado({ ...PONTO, acuraciaMetros: 7 });
    // ±7 m e ±8 m somam 15 m < 18 m: círculos separados, veredito por distância.
    const candidato = identificado({ id: "outro", latitude: PONTO.latitude + norte(18), longitude: PONTO.longitude, acuraciaMetros: 8 });
    const textual = avaliarDuplicidadeProspeccao(alvo, candidato)!;
    expect(descreverResultadoDedupe(textual, alvo, candidato)).toBe("Mesmo endereço normalizado; a cerca de 18 m");
    const geo = avaliarDuplicidadeProspeccao({ ...alvo, logradouro: "", numero: "" }, { ...candidato, logradouro: "", numero: "" })!;
    expect(descreverResultadoDedupe(geo, alvo, candidato)).toBe("A cerca de 18 m; precisão do GPS ±7 m e ±8 m");
    const vertical = avaliarDuplicidadeProspeccao({ ...alvo, tipo: "Apartamento", unidade: "" }, candidato)!;
    expect(descreverResultadoDedupe(vertical, alvo, candidato)).toContain("unidade desconhecida em imóvel vertical — no máximo possível");
    for (const texto of [descreverResultadoDedupe(textual, alvo, candidato), descreverResultadoDedupe(geo, alvo, candidato)]) {
      expect(texto).not.toMatch(/%|chance|probabilidade/i);
    }
  });

  it("a bounding box alcança o pior caso em que a regra ainda opina, e é só pré-filtro", () => {
    expect(raioBuscaCandidatosMetros(identificado({ ...PONTO, acuraciaMetros: 7 }))).toBe(107);
    expect(raioBuscaCandidatosMetros(identificado({ ...PONTO, acuraciaMetros: 100 }))).toBe(200);
    // Sem acurácia útil a geografia nem é consultada; o raio degenera para o piso.
    expect(raioBuscaCandidatosMetros(identificado({ ...PONTO, acuraciaMetros: 500 }))).toBe(100);
    // Dentro da caixa mas fora dos 60 m: o haversine é quem descarta.
    const dentroDaCaixa = identificado({ id: "outro", logradouro: "", numero: "", latitude: PONTO.latitude + norte(90), longitude: PONTO.longitude, acuraciaMetros: 7 });
    const caixa = caixaBuscaGeografica(PONTO.latitude, PONTO.longitude, 107);
    expect(dentroDaCaixa.latitude!).toBeLessThan(caixa.latitudeMaxima);
    expect(avaliarDuplicidadeProspeccao(identificado({ logradouro: "", numero: "", ...PONTO, acuraciaMetros: 7 }), dentroDaCaixa)).toBeNull();
  });
});

describe("C7 — fronteira: candidatos da própria conta pelas duas chaves", () => {
  /** Um PostgREST de mentira que PAGINA de verdade: `range(inicio, fim)` devolve
      a fatia do conjunto, na ordem em que ele foi montado. Os espiões são
      compartilhados entre as páginas da mesma consulta. */
  function consultaFalsa(dados: unknown[]) {
    const chamada = {
      select: vi.fn(), neq: vi.fn(), is: vi.fn(), eq: vi.fn(), gte: vi.fn(), lte: vi.fn(), order: vi.fn(), limit: vi.fn(),
      range: vi.fn((inicio: number, fim: number) => Promise.resolve({ data: dados.slice(inicio, fim + 1), error: null })),
    };
    for (const chave of ["select", "neq", "is", "eq", "gte", "lte", "order", "limit"] as const) chamada[chave].mockReturnValue(chamada);
    return chamada;
  }
  const linha = (id: string, extras: Record<string, unknown> = {}) => ({
    id, situacao: "identificado", logradouro: "Rua Souza Naves", numero: "100", unidade: null, bloco: null, edificio: null,
    bairro: null, cidade: "Londrina", estado: "PR", cep: null, ponto_referencia: null,
    endereco_chave: "rua souza naves 100|londrina||", cidade_chave: "londrina", bairro_chave: "",
    latitude: null, longitude: null, acuracia_metros: null, precisao_localizacao: "desconhecida",
    tipo: null, tipo_origem: null, tipo_confianca: null, tipo_estado: null, tipo_definido_em: null, tipo_classificacao_id: null,
    tipo_avistamento_id: null, tipo_confirmado_por: null, tipo_confirmado_em: null, primeiro_avistamento_em: null,
    ultimo_avistamento_em: "2026-08-12T10:00:00.000Z", avistamentos_total: 1, avistamento_corrente_id: null,
    origem_identificacao: "campo", ultima_investigacao_em: null, imovel_id: null, promovido_em: null, descartado_em: null,
    descartado_motivo: null, fundido_em: null, fundido_em_imovel_id: null, exclusao_solicitada_em: null,
    created_at: "2026-08-12T10:00:00.000Z", updated_at: "2026-08-12T10:00:00.000Z", ...extras,
  });

  it("consulta a chave textual persistida E a caixa geográfica, exclui lápides e exclusões, e desduplica por id", async () => {
    const textual = consultaFalsa([linha("dup-texto")]);
    const geografica = consultaFalsa([linha("dup-texto"), linha("dup-geo", { latitude: PONTO.latitude + norte(10), longitude: PONTO.longitude, acuracia_metros: 5 })]);
    // Cada página remonta a consulta a partir de `from`; a mesma consulta falsa
    // atende todas as páginas da sua busca.
    const client = { from: vi.fn() } as unknown as SupabaseClient;
    (client.from as ReturnType<typeof vi.fn>).mockReturnValueOnce(textual).mockReturnValue(geografica);

    const candidatos = await buscarCandidatosDuplicidade(
      { ...identificado({ id: "11111111-1111-4111-8111-111111111111", ...PONTO, acuraciaMetros: 7 }) },
      client,
    );

    expect(candidatos.map((item) => item.id).sort()).toEqual(["dup-geo", "dup-texto"]);
    expect(textual.eq).toHaveBeenCalledWith("endereco_chave", chaveImovelIdentificado(identificado()));
    for (const consulta of [textual, geografica]) {
      expect(consulta.neq).toHaveBeenCalledWith("situacao", "fundido");
      expect(consulta.is).toHaveBeenCalledWith("exclusao_solicitada_em", null);
      expect(consulta.neq).toHaveBeenCalledWith("id", "11111111-1111-4111-8111-111111111111");
      // Sem limite arbitrário: ordem estável e leitura até o fim.
      expect(consulta.limit).not.toHaveBeenCalled();
      expect(consulta.order).toHaveBeenCalledWith("id", { ascending: true });
      expect(consulta.range).toHaveBeenCalledWith(0, 99);
    }
    const caixa = caixaBuscaGeografica(PONTO.latitude, PONTO.longitude, 107);
    expect(geografica.gte).toHaveBeenCalledWith("latitude", caixa.latitudeMinima);
    expect(geografica.lte).toHaveBeenCalledWith("longitude", caixa.longitudeMaxima);
  });

  it("sem endereço a consulta textual não existe; com acurácia ruim a geográfica não existe; sem nada, nenhuma", async () => {
    const soGeo = consultaFalsa([]);
    let client = { from: vi.fn(() => soGeo) } as unknown as SupabaseClient;
    await buscarCandidatosDuplicidade(identificado({ id: "novo", logradouro: "", numero: "", ...PONTO, acuraciaMetros: 7 }), client);
    expect(client.from).toHaveBeenCalledTimes(1);
    expect(soGeo.eq).not.toHaveBeenCalled();
    expect(soGeo.neq).not.toHaveBeenCalledWith("id", "novo");

    const soTexto = consultaFalsa([]);
    client = { from: vi.fn(() => soTexto) } as unknown as SupabaseClient;
    await buscarCandidatosDuplicidade(identificado({ id: "novo", ...PONTO, acuraciaMetros: 500 }), client);
    expect(client.from).toHaveBeenCalledTimes(1);
    expect(soTexto.gte).not.toHaveBeenCalled();

    client = { from: vi.fn() } as unknown as SupabaseClient;
    expect(await buscarCandidatosDuplicidade(identificado({ id: "novo", logradouro: "", numero: "" }), client)).toEqual([]);
    expect(client.from).not.toHaveBeenCalled();
  });

  it("o pré-filtro nunca decide quem o algoritmo vê: 30 registros na caixa, a duplicata é o 30º, e ela chega ao haversine", async () => {
    // Um prédio: 29 unidades diferentes na mesma coordenada (o veto de unidade
    // vai descartar todas) e, depois delas, a casa ao lado — a duplicata real,
    // a 18 m com ±5 m. Com `limit 20` sem `order`, ela nunca seria lida.
    const predio = Array.from({ length: 29 }, (_, indice) => linha(`apto-${String(indice + 1).padStart(2, "0")}`, {
      logradouro: "Rua do Prédio", numero: "500", unidade: String(101 + indice), tipo: "Apartamento",
      endereco_chave: `rua do predio 500|londrina|${101 + indice}|`,
      ...PONTO, acuracia_metros: 5,
    }));
    const casaAoLado = linha("casa-ao-lado", {
      logradouro: "", numero: "", endereco_chave: "",
      latitude: PONTO.latitude + norte(18), longitude: PONTO.longitude, acuracia_metros: 5,
    });
    const geografica = consultaFalsa([...predio, casaAoLado]);
    const client = { from: vi.fn(() => geografica) } as unknown as SupabaseClient;
    // O alvo é a unidade 130 do mesmo prédio: contra as 29 outras, o veto de
    // unidade decide; contra a casa ao lado (sem unidade), decide a distância.
    const alvo = identificado({ id: "novo", logradouro: "", numero: "", tipo: "Apartamento", unidade: "130", ...PONTO, acuraciaMetros: 7 });

    const candidatos = await buscarCandidatosDuplicidade(alvo, client);

    expect(candidatos).toHaveLength(30);
    expect(candidatos.map((item) => item.id)).toContain("casa-ao-lado");
    // A primeira página (100) já bastou; e a leitura foi paginada em ordem estável.
    expect(geografica.range).toHaveBeenCalledTimes(1);
    expect(geografica.order).toHaveBeenCalledWith("id", { ascending: true });

    // Do outro lado da fronteira, o núcleo decide: 29 vetados, 1 provável.
    const vereditos = encontrarDuplicatasProspeccao(alvo, candidatos.map((item) => ({
      id: item.id, logradouro: item.logradouro, numero: item.numero, cidade: item.cidade, unidade: item.unidade,
      bloco: item.bloco, tipo: item.tipo, latitude: item.latitude, longitude: item.longitude, acuraciaMetros: item.acuraciaMetros,
    })));
    expect(vereditos.map((item) => [item.candidatoId, item.grau])).toEqual([["casa-ao-lado", "provavel"]]);
  });

  it("acima de uma página, continua lendo até a página vir incompleta", async () => {
    const muitos = Array.from({ length: 230 }, (_, indice) => linha(`r-${String(indice).padStart(3, "0")}`, { ...PONTO, acuracia_metros: 5, endereco_chave: "" }));
    const geografica = consultaFalsa(muitos);
    const client = { from: vi.fn(() => geografica) } as unknown as SupabaseClient;

    const candidatos = await buscarCandidatosDuplicidade(identificado({ id: "novo", logradouro: "", numero: "", ...PONTO, acuraciaMetros: 7 }), client);

    expect(candidatos).toHaveLength(230);
    expect(geografica.range.mock.calls).toEqual([[0, 99], [100, 199], [200, 299]]);
  });

  it("estrutural: nenhum arquivo do módulo escreve em imoveis, funde ou promove; a carteira só é lida", () => {
    const arquivos = [
      "lib/prospeccao.ts", "lib/useProspeccao.ts", "lib/calculo/dedupeProspeccao.ts",
      ...readdirSync(resolve("components/prospeccao")).map((nome) => `components/prospeccao/${nome}`),
      "components/modais/ModalAvistamento.tsx",
    ];
    for (const caminho of arquivos) {
      const fonte = readFileSync(resolve(caminho), "utf8");
      expect(fonte, caminho).not.toMatch(/from\("imoveis"\)|salvarImovel|fundir_imoveis_identificados|vincular_promocao|definir_situacao_identificado\([^)]*promov/);
      expect(fonte, caminho).not.toMatch(/openai|embedding|ia_uso|\/api\/ia/i);
    }
    const componente = readFileSync(resolve("components/prospeccao/CandidatosDuplicidade.tsx"), "utf8");
    expect(componente).toMatch(/useAppStore\(\(estado\) => estado\.imoveis\)/);
    expect(componente).not.toMatch(/setImoveis|\.getState\(\)\.set|<button/);
    // Os cinco arquivos do C4 continuam sem store; só o componente de dedupe o lê.
    for (const caminho of ["ProspeccaoView", "CardIdentificado", "PainelIdentificado", "LinhaDoTempoAvistamentos"]) {
      expect(readFileSync(resolve(`components/prospeccao/${caminho}.tsx`), "utf8")).not.toContain("@/lib/store");
    }
    // Sem migration nova para o C7: as chaves e os índices vieram do C2a.
    const migrations = readdirSync(resolve("..", "supabase/migrations"));
    expect(migrations.filter((nome) => /dedupe|duplic/i.test(nome))).toEqual([]);
    const c2a = readFileSync(resolve("..", "supabase/migrations/20260910184310_prospeccao_campo.sql"), "utf8");
    expect(c2a).toMatch(/idx_imoveis_identificados_user_coordenadas[\s\S]*\(user_id, latitude, longitude\)/);
    expect(c2a).toMatch(/idx_imoveis_identificados_user_endereco[\s\S]*\(user_id, endereco_chave\)/);
  });
});

describe("C7 — na tela: avisa com motivo, nunca bloqueia", () => {
  const candidato = (id: string, extras: Record<string, unknown> = {}) => ({
    id, situacao: "identificado", logradouro: "Rua Souza Naves", numero: "100", unidade: null, bloco: null,
    pontoReferencia: null, cidade: "Londrina", tipo: null, latitude: null, longitude: null, acuraciaMetros: null,
    ultimoAvistamentoEm: "2026-08-12T10:00:00.000Z", avistamentosTotal: 1, ...extras,
  });

  beforeEach(() => {
    cenario.buscarDuplicatas.mockReset();
    useAppStore.setState({ imoveis: [] });
  });
  afterEach(cleanup);

  it("lista os candidatos com grau, data do último avistamento, distância e acurácia, e deriva possivel-duplicata", async () => {
    const alvo = identificado({ id: "alvo-1", ...PONTO, acuraciaMetros: 7 });
    const perto = candidato("perto", { logradouro: "Rua Outra", latitude: PONTO.latitude + norte(18), longitude: PONTO.longitude, acuraciaMetros: 12 });
    cenario.buscarDuplicatas.mockResolvedValue([
      { resultado: { candidatoId: "perto", grau: "provavel", origem: "geografia", distanciaMetros: 18, motivo: "proximidade" }, candidato: perto },
      { resultado: { candidatoId: "texto", grau: "exata", origem: "texto", distanciaMetros: null, motivo: "identidade-textual" }, candidato: candidato("texto") },
    ]);
    render(createElement(CandidatosDuplicidade, { alvo, avistamentosTotal: 1 }));

    const secao = await screen.findByRole("region", { name: "Possíveis duplicatas" });
    expect(cenario.buscarDuplicatas).toHaveBeenCalledWith(alvo);
    expect(secao.textContent).toContain("Pode ser o mesmo que…");
    expect(secao.textContent).toContain("Só um aviso: você continua livre para registrar e trabalhar.");
    expect(secao.querySelector('[data-derivada="possivel-duplicata"]')?.textContent).toBe("Possível duplicata");
    const linhas = [...secao.querySelectorAll("[data-candidato-id]")];
    expect(linhas.map((linha) => linha.getAttribute("data-grau"))).toEqual(["provavel", "exata"]);
    expect(linhas[0].textContent).toContain("Rua Outra, 100");
    expect(linhas[0].textContent).toContain("Provável");
    expect(linhas[0].textContent).toContain("Avistado em 12/08/2026");
    expect(linhas[0].textContent).toContain("A cerca de 18 m; precisão do GPS ±7 m e ±12 m");
    expect(linhas[1].textContent).toContain("Mesmo endereço normalizado");
    // Nenhuma ação executável: nem merge, nem promoção, nem "são diferentes".
    expect(secao.querySelectorAll("button")).toHaveLength(0);
    expect(secao.textContent).not.toMatch(/%|É o mesmo|São diferentes|Transformar em oportunidade/);
  });

  it("declara que a geografia não opina quando a acurácia é ruim, e some quando não há nada a dizer", async () => {
    cenario.buscarDuplicatas.mockResolvedValue([
      { resultado: { candidatoId: "texto", grau: "exata", origem: "texto", distanciaMetros: null, motivo: "identidade-textual" }, candidato: candidato("texto") },
    ]);
    render(createElement(CandidatosDuplicidade, { alvo: identificado({ id: "alvo-1", ...PONTO, acuraciaMetros: 350 }) }));
    const secao = await screen.findByRole("region", { name: "Possíveis duplicatas" });
    expect(secao.textContent).toContain("Coordenada imprecisa: a geografia não opina aqui; só o endereço decide.");
    expect(secao.querySelector('[data-derivada="coordenada-imprecisa"]')).toBeTruthy();
    cleanup();

    cenario.buscarDuplicatas.mockResolvedValue([]);
    const { container } = render(createElement(CandidatosDuplicidade, { alvo: identificado({ id: "alvo-2" }) }));
    await waitFor(() => expect(cenario.buscarDuplicatas).toHaveBeenCalledTimes(2));
    expect(container.querySelector("section")).toBeNull();
  });

  it("contra a carteira: 'já está no Pipeline' derivado de imoveisDuplicados, sem escrever nada", async () => {
    cenario.buscarDuplicatas.mockResolvedValue([]);
    useAppStore.setState({ imoveis: [{ id: "pipeline-1", codigo: "IM-77", endereco: "R. Souza Naves 100", cidade: "Londrina", status: "Novo contato" } as Imovel] });
    const setImoveis = vi.spyOn(useAppStore.getState(), "setImoveis");
    render(createElement(CandidatosDuplicidade, { alvo: identificado({ id: "alvo-1" }) }));

    const secao = await screen.findByRole("region", { name: "Possíveis duplicatas" });
    expect(secao.textContent).toContain("Esse imóvel já está no Pipeline.");
    expect(secao.textContent).toContain("IM-77");
    expect(secao.querySelector('[data-derivada="ja-na-carteira"]')?.textContent).toBe("Já está na carteira");
    expect(setImoveis).not.toHaveBeenCalled();
    expect(useAppStore.getState().imoveis).toHaveLength(1);
  });

  it("falha na consulta não impede nada: avisa que não conferiu e segue", async () => {
    cenario.buscarDuplicatas.mockResolvedValue(null);
    render(createElement(CandidatosDuplicidade, { alvo: identificado({ id: "alvo-1" }) }));
    expect((await screen.findByRole("status")).textContent).toContain("Não foi possível conferir duplicatas agora. Nada impede o registro.");
  });
});
