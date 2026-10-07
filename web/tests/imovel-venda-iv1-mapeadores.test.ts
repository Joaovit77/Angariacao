import { describe, expect, it } from "vitest";
import { FINALIDADES_IMOVEL } from "../lib/constantes";
import { fromDbImovel, toDbImovel, type DbImovelRow } from "../lib/persistencia/mapeadores";
import type { Imovel } from "../lib/tipos";
import dbJson from "./fixtures-db.json";
import fixturesJson from "./fixtures.json";

/* Imóvel de venda, IV-1: a leitura das três colunas novas e a regra permanente
   de `vendido_em`. O IV-2B mudou o resto do contrato (ausente não vira null no
   `fromDbImovel`; o `toDbImovel` grava `finalidade` e `valor_venda` quando o
   imóvel traz o campo; Realtime e desdobramento): as provas dele estão em
   `imovel-venda-iv2b-persistencia.test.ts`. */

const USUARIO = "user-iv1";
const linhas = dbJson.imoveisRows as unknown as DbImovelRow[];
const imoveis = fixturesJson.imoveis as unknown as Imovel[];
const linha = (extra: Partial<DbImovelRow> = {}): DbImovelRow => ({ ...linhas[0], ...extra });

describe("FINALIDADES_IMOVEL", () => {
  it("é a lista fechada aprovada, sem 'não informado' (que é null)", () => {
    expect(FINALIDADES_IMOVEL).toEqual(["locacao", "venda", "locacao_venda"]);
  });
});

describe("fromDbImovel lê as colunas novas", () => {
  it("finalidade válida vira a união correspondente", () => {
    for (const f of FINALIDADES_IMOVEL) expect(fromDbImovel(linha({ finalidade: f })).finalidade).toBe(f);
  });

  it("finalidade null, vazia ou desconhecida vira null, nunca 'locacao'", () => {
    expect(fromDbImovel(linha({ finalidade: null })).finalidade).toBeNull();
    for (const v of ["", "aluguel", "Venda", "LOCACAO", "ambos", " venda"]) expect(fromDbImovel(linha({ finalidade: v })).finalidade, v).toBeNull();
  });

  it("valor_venda: decimal (número ou texto) preservado; null fica null; zero é zero", () => {
    expect(fromDbImovel(linha({ valor_venda: 350000.5 })).valorVenda).toBe(350000.5);
    expect(fromDbImovel(linha({ valor_venda: "350000.50" })).valorVenda).toBe(350000.5);
    expect(fromDbImovel(linha({ valor_venda: 0 })).valorVenda).toBe(0);
    expect(fromDbImovel(linha({ valor_venda: "0" })).valorVenda).toBe(0);
    expect(fromDbImovel(linha({ valor_venda: null })).valorVenda).toBeNull();
    for (const v of ["NaN", "Infinity", "abc", ""]) expect(fromDbImovel(linha({ valor_venda: v })).valorVenda, v).toBeNull();
  });

  it("vendido_em: data preservada; null, ausente e vazio ficam null", () => {
    expect(fromDbImovel(linha({ vendido_em: "2026-10-01" })).vendidoEm).toBe("2026-10-01");
    expect(fromDbImovel(linha({ vendido_em: null })).vendidoEm).toBeNull();
    expect(fromDbImovel(linha({ vendido_em: "" })).vendidoEm).toBeNull();
    expect(fromDbImovel(linhas[0]).vendidoEm).toBeNull();
  });

  it("não mexe em nenhum outro campo (valorAluguel, status, retirada seguem iguais)", () => {
    const base = fromDbImovel(linhas[0]);
    const comNovas = fromDbImovel(linha({ finalidade: "venda", valor_venda: 1, vendido_em: "2026-10-01" }));
    const { finalidade, valorVenda, vendidoEm, ...resto } = comNovas;
    expect([finalidade, valorVenda, vendidoEm]).toEqual(["venda", 1, "2026-10-01"]);
    const { vendidoEm: _d, ...restoBase } = base;
    expect(resto).toEqual(restoBase);
    expect(_d).toBeNull();
  });
});

describe("vendido_em nunca pelo save genérico", () => {
  it("regra permanente, também no IV-2: o toDbImovel não manda a coluna", () => {
    for (const im of imoveis) {
      const saida = toDbImovel({ ...im, finalidade: "venda", valorVenda: 1, vendidoEm: "2026-10-01" }, USUARIO) as Record<string, unknown>;
      expect(Object.hasOwn(saida, "vendido_em"), im.id).toBe(false);
      expect(saida.vendidoEm, im.id).toBeUndefined();
    }
  });
});
