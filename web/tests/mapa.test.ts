/* Categorias do mapa (lib/calculo/mapa).
   Feature nova da pós-migração — sem oráculo do app antigo. Os testes fixam
   o contrato dos quatro baldes e, principalmente, a PRIORIDADE por desfecho
   atual: um imóvel angariado e depois perdido conta como "sem sucesso", não
   como captação viva. */
import { describe, expect, it } from "vitest";
import {
  CATEGORIAS_MAPA,
  categoriaMapa,
  corDaCategoria,
  dentroPeriodoMapa,
  entraNoCalorMapa,
  filtrarImoveisMapa,
  leituraTerritorialMapa,
  resumoMapa,
} from "@/lib/calculo/mapa";
import type { Imovel } from "@/lib/tipos";

/** Imóvel com histórico controlado. `angariado` empurra a passagem por
    "Angariado"; o `status` atual é dado à parte. */
function imovel(status: string, angariado = false): Imovel {
  const hist = [{ status: "Novo contato", date: "2026-01-01" }];
  if (angariado) hist.push({ status: "Angariado", date: "2026-02-01" });
  return { id: `i-${status}`, endereco: "Rua X", status, statusHistory: hist };
}

describe("categoriaMapa", () => {
  it("Locado é 'locado', mesmo tendo passado por Angariado", () => {
    expect(categoriaMapa(imovel("Locado", true))).toBe("locado");
  });

  it("Angariado e Publicado (captados, sem locar) são 'angariado'", () => {
    expect(categoriaMapa(imovel("Angariado", true))).toBe("angariado");
    expect(categoriaMapa(imovel("Publicado", true))).toBe("angariado");
  });

  it("saídas negativas são 'sem-sucesso' — inclusive se já tinham sido angariadas", () => {
    // A prioridade é o desfecho ATUAL: perdido depois de angariado é perda.
    for (const st of ["Perdido", "Cancelado", "Sem resposta"]) {
      expect(categoriaMapa(imovel(st, false))).toBe("sem-sucesso");
      expect(categoriaMapa(imovel(st, true))).toBe("sem-sucesso");
    }
  });

  it("pipeline antes da captação é 'andamento'", () => {
    for (const st of ["Novo contato", "Visita agendada", "Em negociação", "Documentação"]) {
      expect(categoriaMapa(imovel(st, false))).toBe("andamento");
    }
  });
});

describe("metadados da legenda", () => {
  it("são quatro categorias, uma por id, sem repetir cor", () => {
    const ids = CATEGORIAS_MAPA.map((c) => c.id);
    expect(new Set(ids).size).toBe(4);
    expect(new Set(CATEGORIAS_MAPA.map((c) => c.cor)).size).toBe(4);
  });

  it("corDaCategoria devolve a cor da categoria do imóvel", () => {
    const info = Object.fromEntries(CATEGORIAS_MAPA.map((c) => [c.id, c.cor]));
    expect(corDaCategoria(imovel("Locado"))).toBe(info["locado"]);
    expect(corDaCategoria(imovel("Angariado", true))).toBe(info["angariado"]);
    expect(corDaCategoria(imovel("Perdido"))).toBe(info["sem-sucesso"]);
    expect(corDaCategoria(imovel("Novo contato"))).toBe(info["andamento"]);
  });
});

describe("mapa de calor", () => {
  it("inclui autorização assinada mesmo sem histórico Angariado", () => {
    const i = imovel("Autorização assinada");
    expect(entraNoCalorMapa(i)).toBe(true);
  });
});

describe("filtros e resumo", () => {
  it("filtra o período pela data de entrada na captação", () => {
    const i = imovel("Novo contato");
    i.dataAngariacao = "2026-06-10";
    expect(dentroPeriodoMapa(i, "2026-06-01")).toBe(true);
    expect(dentroPeriodoMapa(i, "2026-07-01")).toBe(false);
    expect(dentroPeriodoMapa(i, null)).toBe(true);
  });

  it("calcula conversão sem contar unidade desdobrada como nova captação", () => {
    const tentando = { ...imovel("Novo contato"), latitude: -23.3, longitude: -51.1 };
    const ganha = imovel("Angariado", true);
    const unidade = { ...imovel("Angariado", true), id: "unidade", imovelPrincipalId: ganha.id };
    expect(resumoMapa([tentando, ganha, unidade])).toEqual({
      total: 2,
      localizados: 1,
      ganhas: 1,
      emAndamento: 1,
      conversao: 50,
    });
  });

  it("aplica os mesmos filtros de texto e período usados pela tela", () => {
    const centro = { ...imovel("Novo contato"), bairro: "Centro", dataAngariacao: "2026-08-01" };
    const gleba = { ...imovel("Novo contato"), id: "gleba", bairro: "Gleba Palhano", dataAngariacao: "2026-05-01" };
    expect(filtrarImoveisMapa([centro, gleba], { bairro: "cent", desde: "2026-07-01" })).toEqual([centro]);
  });

  it("encontra oportunidade, atenção e concentração com amostra mínima", () => {
    const criar = (id: string, bairro: string, ganhou: boolean) => ({
      ...imovel(ganhou ? "Angariado" : "Perdido", ganhou), id, bairro,
    });
    const carteira = [
      criar("a1", "A", true), criar("a2", "A", true), criar("a3", "A", false),
      criar("b1", "B", false), criar("b2", "B", false), criar("b3", "B", false), criar("b4", "B", false),
    ];
    const leitura = leituraTerritorialMapa(carteira);
    expect(leitura.oportunidade?.bairro).toBe("A");
    expect(leitura.atencao?.bairro).toBe("B");
    expect(leitura.concentracao?.bairro).toBe("B");
  });
});
