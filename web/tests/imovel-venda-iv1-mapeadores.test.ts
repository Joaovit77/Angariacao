import { describe, expect, it } from "vitest";
import { FINALIDADES_IMOVEL } from "../lib/constantes";
import { reconciliarImovelRealtime } from "../lib/calculo/estabilidadeMensagens";
import { unidadeDesdobrada } from "../lib/calculo/desdobramento";
import { fromDbImovel, toDbImovel, type DbImovelRow } from "../lib/persistencia/mapeadores";
import type { Imovel } from "../lib/tipos";
import dbJson from "./fixtures-db.json";
import fixturesJson from "./fixtures.json";

/* Imóvel de venda, IV-1: o app LÊ as três colunas novas e NUNCA as manda pelo
   save genérico. O `toDbImovel` lista as colunas que o upsert grava; quem não
   está na lista é preservado no banco. Mandá-las agora faria o ModalImovel
   (que monta o imóvel campo a campo) gravar null por cima. `vendido_em` não
   entra no `toDbImovel` nem no IV-2: é da ação própria de Vendido (IV-5). */

const USUARIO = "user-iv1";
const NOVAS_DB = ["finalidade", "valor_venda", "vendido_em"] as const;
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

  it("finalidade null, ausente, vazia ou desconhecida vira null, nunca 'locacao'", () => {
    expect(fromDbImovel(linha({ finalidade: null })).finalidade).toBeNull();
    expect(fromDbImovel(linhas[0]).finalidade).toBeNull(); // linha anterior à migration: chave ausente
    for (const v of ["", "aluguel", "Venda", "LOCACAO", "ambos", " venda"]) expect(fromDbImovel(linha({ finalidade: v })).finalidade, v).toBeNull();
  });

  it("valor_venda: decimal (número ou texto) preservado; null e ausente ficam null; zero é zero", () => {
    expect(fromDbImovel(linha({ valor_venda: 350000.5 })).valorVenda).toBe(350000.5);
    expect(fromDbImovel(linha({ valor_venda: "350000.50" })).valorVenda).toBe(350000.5);
    expect(fromDbImovel(linha({ valor_venda: 0 })).valorVenda).toBe(0);
    expect(fromDbImovel(linha({ valor_venda: "0" })).valorVenda).toBe(0);
    expect(fromDbImovel(linha({ valor_venda: null })).valorVenda).toBeNull();
    expect(fromDbImovel(linhas[0]).valorVenda).toBeNull();
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
    const { finalidade: _f, valorVenda: _v, vendidoEm: _d, ...restoBase } = base;
    expect(resto).toEqual(restoBase);
    expect([_f, _v, _d]).toEqual([null, null, null]);
  });
});

describe("toDbImovel NÃO manda as colunas novas (trava de regressão)", () => {
  it("nem quando o imóvel as tem preenchidas", () => {
    for (const im of imoveis) {
      const saida = toDbImovel({ ...im, finalidade: "venda", valorVenda: 350000.5, vendidoEm: "2026-10-01" }, USUARIO);
      for (const coluna of NOVAS_DB) expect(Object.hasOwn(saida, coluna), `${im.id}:${coluna}`).toBe(false);
      expect(Object.keys(saida).some((k) => /finalidade|venda|vendido/.test(k)), im.id).toBe(false);
    }
  });

  it("ida e volta banco → TS → banco: o que sai para o upsert não contém as três colunas", () => {
    const lido = fromDbImovel(linha({ finalidade: "locacao_venda", valor_venda: "350000.50", vendido_em: "2026-10-01" }));
    expect([lido.finalidade, lido.valorVenda, lido.vendidoEm]).toEqual(["locacao_venda", 350000.5, "2026-10-01"]);
    const saida = toDbImovel(lido, USUARIO);
    for (const coluna of NOVAS_DB) expect(saida).not.toHaveProperty(coluna);
  });

  it("vendido_em nunca é gravado pelo save genérico (regra permanente, também no IV-2)", () => {
    const saida = toDbImovel({ ...imoveis[0], vendidoEm: "2026-10-01" }, USUARIO) as Record<string, unknown>;
    expect(saida.vendido_em).toBeUndefined();
    expect(saida.vendidoEm).toBeUndefined();
  });
});

describe("caminhos que montam o imóvel sem as colunas novas", () => {
  it("desdobramento no IV-1: a unidade não herda nada e o insert não manda as colunas", () => {
    const principal: Imovel = { ...fromDbImovel(linha({ finalidade: "venda", valor_venda: 500000, vendido_em: null })), status: "Angariado" };
    const unidade = unidadeDesdobrada(principal, { unidade: "Sala 1", tipo: "Sala", codigo: "U-1", valorAluguel: 1000, valorCondominio: 0 }, "u-1");
    expect([unidade.finalidade, unidade.valorVenda, unidade.vendidoEm]).toEqual([undefined, undefined, undefined]);
    const saida = toDbImovel(unidade, USUARIO);
    for (const coluna of NOVAS_DB) expect(saida).not.toHaveProperty(coluna);
  });
});

describe("Realtime: reconciliar não grava nada e só lê o que veio", () => {
  it("payload normal (a coluna é publicada) leva os valores para a memória", () => {
    const anterior = fromDbImovel(linhas[0]);
    const novo = reconciliarImovelRealtime(anterior, { ...linhas[0], finalidade: "venda", valor_venda: 10, vendido_em: "2026-10-02" }, USUARIO);
    expect([novo.finalidade, novo.valorVenda, novo.vendidoEm]).toEqual(["venda", 10, "2026-10-02"]);
    for (const coluna of NOVAS_DB) expect(toDbImovel(novo, USUARIO)).not.toHaveProperty(coluna);
  });

  it("payload parcial sem as colunas: a memória fica null até recarregar (dívida do IV-2), o banco não é tocado", () => {
    const anterior = fromDbImovel(linha({ finalidade: "venda", valor_venda: 10, vendido_em: "2026-10-02" }));
    const novo = reconciliarImovelRealtime(anterior, { id: anterior.id, status: "Publicado" }, USUARIO);
    expect(novo.status).toBe("Publicado");
    // Base do merge é o `toDbImovel(anterior)`, que não leva as colunas novas.
    expect([novo.finalidade, novo.valorVenda, novo.vendidoEm]).toEqual([null, null, null]);
    for (const coluna of NOVAS_DB) expect(toDbImovel(novo, USUARIO)).not.toHaveProperty(coluna);
  });
});
