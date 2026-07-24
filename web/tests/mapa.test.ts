/* Categorias do mapa (lib/calculo/mapa).
   Feature nova da pós-migração — sem oráculo do app antigo. Os testes fixam
   o contrato dos quatro baldes e, principalmente, a PRIORIDADE por desfecho
   atual: um imóvel angariado e depois perdido conta como "sem sucesso", não
   como captação viva. */
import { describe, expect, it } from "vitest";
import { CATEGORIAS_MAPA, categoriaMapa, corDaCategoria } from "@/lib/calculo/mapa";
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
