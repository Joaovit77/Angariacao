import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Imovel } from "@/lib/tipos";

/* Imóvel de venda, IV-2B: a persistência passa a gravar `finalidade` e
   `valor_venda` sem perda silenciosa, ainda sem tela.
   - chave ausente (ou `undefined`) = não altera a coluna;
   - chave presente com null = limpa; com valor = grava (0 é valor);
   - `vendido_em` nunca pelo save genérico (IV-5);
   - Realtime parcial e store depois do save preservam o que não veio,
     inclusive os dados da retirada (D3, só preservação de estado). */

const mocks = vi.hoisted(() => ({
  chamadas: [] as { tabela: string; metodo: string; payload: unknown }[],
  toast: vi.fn(),
}));

function construtor(tabela: string) {
  const b: Record<string, unknown> = {};
  for (const metodo of ["upsert", "insert", "update", "delete", "select", "eq", "in", "maybeSingle", "single"]) {
    b[metodo] = (payload?: unknown) => {
      mocks.chamadas.push({ tabela, metodo, payload });
      return b;
    };
  }
  b.then = (ok: (v: unknown) => unknown, erro?: (e: unknown) => unknown) =>
    Promise.resolve({ data: null, error: null }).then(ok, erro);
  return b;
}

vi.mock("@/lib/persistencia/supabase", () => ({ getSupabase: () => ({ from: construtor }) }));
vi.mock("@/lib/googleAgenda", () => ({ sincronizarCompromisso: vi.fn(async () => ({ ok: true })) }));
vi.mock("@/lib/toast", () => ({ toast: mocks.toast }));

import { reconciliarImovelRealtime } from "@/lib/calculo/estabilidadeMensagens";
import { lerImportacao } from "@/lib/calculo/importacao";
import { unidadeDesdobrada } from "@/lib/calculo/desdobramento";
import { aplicarMudancaDeStatus, desdobrarImovel, importarImoveis, salvarImovel } from "@/lib/mutacoes";
import { fromDbImovel, toDbImovel, type DbImovelRow } from "@/lib/persistencia/mapeadores";
import { useAppStore } from "@/lib/store";
import dbJson from "./fixtures-db.json";
import fixturesJson from "./fixtures.json";

const USUARIO = "user-iv2b";
const linhas = dbJson.imoveisRows as unknown as DbImovelRow[];
const fixtures = fixturesJson.imoveis as unknown as Imovel[];
const linha = (extra: Partial<DbImovelRow> = {}): DbImovelRow => ({ ...linhas[0], status: "Novo contato", ...extra });
const gravacoes = (tabela: string, metodo: string) =>
  mocks.chamadas.filter((c) => c.tabela === tabela && c.metodo === metodo).map((c) => c.payload);
const ultimoUpsert = () => gravacoes("imoveis", "upsert").at(-1) as Record<string, unknown>;
const doStore = (id: string) => useAppStore.getState().imoveis.find((i) => i.id === id)!;

/** Como o ModalImovel monta hoje: campo a campo, sem as colunas de venda nem da retirada. */
function comoFormulario(i: Imovel, extra: Partial<Imovel> = {}): Imovel {
  return {
    id: i.id, codigo: i.codigo, referenciaCrm: i.referenciaCrm, cep: i.cep, endereco: i.endereco, bairro: i.bairro,
    cidade: i.cidade, estado: i.estado, unidade: i.unidade, bloco: i.bloco, edificio: i.edificio, tipo: i.tipo,
    quartos: i.quartos, banheiros: i.banheiros, vagas: i.vagas, valorAluguel: i.valorAluguel, valorCondominio: i.valorCondominio,
    valorAluguelAtraso: i.valorAluguelAtraso, proprietarioNome: i.proprietarioNome, proprietarioTelefone: i.proprietarioTelefone,
    formaAbordagem: i.formaAbordagem, origemImovel: i.origemImovel, imobiliariaConcorrente: i.imobiliariaConcorrente,
    latitude: i.latitude, longitude: i.longitude, dataAngariacao: i.dataAngariacao, responsavel: i.responsavel, status: i.status,
    observacoes: "editado", statusHistory: i.statusHistory, notas: i.notas, tentativas: i.tentativas, pausadoAte: null,
    motivoPerda: "", motivoPerdaOutro: "", comissaoRecebida: false, comissaoRecebidaValor: null, comissaoRecebidaData: null,
    preCadastro: false, retirado: i.retirado === true, ...extra,
  } as Imovel;
}

beforeEach(() => {
  mocks.chamadas.length = 0;
  mocks.toast.mockReset();
  useAppStore.setState({ imoveis: [], agenda: [], metas: {} });
});

describe("fromDbImovel: ausente não vira null (D1)", () => {
  it("A. linha sem a coluna finalidade: o imóvel não tem a chave", () => {
    const im = fromDbImovel(linhas[0]);
    expect(Object.hasOwn(im, "finalidade")).toBe(false);
    expect(Object.hasOwn(im, "valorVenda")).toBe(false);
  });

  it("B. finalidade null: chave presente com null", () => {
    const im = fromDbImovel(linha({ finalidade: null, valor_venda: null }));
    expect(Object.hasOwn(im, "finalidade") && im.finalidade === null).toBe(true);
    expect(Object.hasOwn(im, "valorVenda") && im.valorVenda === null).toBe(true);
  });

  it("C. finalidade 'venda': chave presente com 'venda'", () => {
    const im = fromDbImovel(linha({ finalidade: "venda", valor_venda: "500000.00" }));
    expect([im.finalidade, im.valorVenda]).toEqual(["venda", 500000]);
  });

  it("vendidoEm continua como no IV-1 (lido; ausente vira null)", () => {
    expect(fromDbImovel(linhas[0]).vendidoEm).toBeNull();
  });
});

describe("toDbImovel: grava só o que veio", () => {
  const base = fixtures[0];
  const sem = { ...base };
  delete (sem as Partial<Imovel>).finalidade;
  delete (sem as Partial<Imovel>).valorVenda;

  it("D/G. sem finalidade e sem valorVenda: nenhuma das duas colunas sai", () => {
    const saida = toDbImovel(sem, USUARIO);
    expect(Object.hasOwn(saida, "finalidade")).toBe(false);
    expect(Object.hasOwn(saida, "valor_venda")).toBe(false);
  });

  it("chave presente com undefined conta como ausente", () => {
    const saida = toDbImovel({ ...sem, finalidade: undefined, valorVenda: undefined }, USUARIO);
    expect(Object.hasOwn(saida, "finalidade")).toBe(false);
    expect(Object.hasOwn(saida, "valor_venda")).toBe(false);
  });

  it("E/H. null explícito vai como null (limpar)", () => {
    const saida = toDbImovel({ ...sem, finalidade: null, valorVenda: null }, USUARIO);
    expect(Object.hasOwn(saida, "finalidade") && saida.finalidade === null).toBe(true);
    expect(Object.hasOwn(saida, "valor_venda") && saida.valor_venda === null).toBe(true);
  });

  it("F. as três finalidades vão como estão, sem default", () => {
    for (const f of ["locacao", "venda", "locacao_venda"] as const) expect(toDbImovel({ ...sem, finalidade: f }, USUARIO).finalidade).toBe(f);
  });

  it("I. valorVenda 0 vai 0 (não é 'não informado')", () => {
    expect(toDbImovel({ ...sem, valorVenda: 0 }, USUARIO).valor_venda).toBe(0);
  });

  it("J. valorVenda decimal é preservado", () => {
    expect(toDbImovel({ ...sem, valorVenda: 350000.55 }, USUARIO).valor_venda).toBe(350000.55);
  });

  it("finalidade e valorVenda são independentes", () => {
    expect(Object.hasOwn(toDbImovel({ ...sem, finalidade: "venda" }, USUARIO), "valor_venda")).toBe(false);
    expect(Object.hasOwn(toDbImovel({ ...sem, valorVenda: 1 }, USUARIO), "finalidade")).toBe(false);
  });

  it("K. vendido_em nunca, nem com o campo preenchido", () => {
    for (const im of fixtures) {
      const saida = toDbImovel({ ...im, finalidade: "venda", valorVenda: 1, vendidoEm: "2026-10-01" }, USUARIO);
      expect(Object.hasOwn(saida, "vendido_em"), im.id).toBe(false);
    }
  });

  it("os dados da retirada continuam fora do upsert", () => {
    const saida = toDbImovel({ ...base, retirado: true, retiradoEm: "2026-10-01", retiradoMotivo: "outro", retiradoObservacao: "x" }, USUARIO);
    for (const coluna of ["retirado_em", "retirado_motivo", "retirado_observacao"]) expect(Object.hasOwn(saida, coluna), coluna).toBe(false);
    expect(saida.retirado).toBe(true);
  });

  it("ida e volta banco → TS → banco devolve os mesmos valores", () => {
    const lido = fromDbImovel(linha({ finalidade: "locacao_venda", valor_venda: "350000.50", vendido_em: "2026-10-01" }));
    const saida = toDbImovel(lido, USUARIO);
    expect([saida.finalidade, saida.valor_venda, Object.hasOwn(saida, "vendido_em")]).toEqual(["locacao_venda", 350000.5, false]);
  });
});

describe("Realtime: o que não veio no payload fica como estava", () => {
  const anterior = fromDbImovel(linha({
    finalidade: "venda", valor_venda: 500000, vendido_em: "2026-10-02",
    retirado: true, retirado_em: "2026-09-30", retirado_motivo: "outro", retirado_observacao: "vendeu por fora",
  }));

  it("L/N/O. payload parcial preserva finalidade, valorVenda e vendidoEm", () => {
    const novo = reconciliarImovelRealtime(anterior, { id: anterior.id, observacoes: "nova" }, USUARIO);
    expect(novo.observacoes).toBe("nova");
    expect([novo.finalidade, novo.valorVenda, novo.vendidoEm]).toEqual(["venda", 500000, "2026-10-02"]);
  });

  it("M. null explícito no payload limpa", () => {
    const novo = reconciliarImovelRealtime(anterior, { id: anterior.id, finalidade: null, valor_venda: null, vendido_em: null }, USUARIO);
    expect([novo.finalidade, novo.valorVenda, novo.vendidoEm]).toEqual([null, null, null]);
  });

  it("valor no payload substitui", () => {
    const novo = reconciliarImovelRealtime(anterior, { id: anterior.id, finalidade: "locacao_venda", valor_venda: "1.5" }, USUARIO);
    expect([novo.finalidade, novo.valorVenda, novo.vendidoEm]).toEqual(["locacao_venda", 1.5, "2026-10-02"]);
  });

  it("P. dados da retirada: preservados quando não vêm, aplicados quando vêm (inclusive null); a marca segue o payload", () => {
    const parcial = reconciliarImovelRealtime(anterior, { id: anterior.id, status: "Angariado" }, USUARIO);
    expect([parcial.retirado, parcial.retiradoEm, parcial.retiradoMotivo, parcial.retiradoObservacao]).toEqual([true, "2026-09-30", "outro", "vendeu por fora"]);

    const reativado = reconciliarImovelRealtime(anterior, { id: anterior.id, retirado: false, retirado_em: null, retirado_motivo: null, retirado_observacao: null }, USUARIO);
    expect([reativado.retirado, reativado.retiradoEm, reativado.retiradoMotivo, reativado.retiradoObservacao]).toEqual([false, null, null, null]);
  });

  it("imóvel anterior sem a chave: o payload parcial não a inventa", () => {
    const semChave = fromDbImovel(linhas[0]);
    const novo = reconciliarImovelRealtime(semChave, { id: semChave.id, status: "Publicado" }, USUARIO);
    expect(Object.hasOwn(novo, "finalidade")).toBe(false);
    expect(Object.hasOwn(novo, "valorVenda")).toBe(false);
  });

  it("payload completo leva os valores para a memória", () => {
    const semChave = fromDbImovel(linhas[0]);
    const novo = reconciliarImovelRealtime(semChave, linha({ id: semChave.id, finalidade: "venda", valor_venda: 10, vendido_em: "2026-10-03" }), USUARIO);
    expect([novo.finalidade, novo.valorVenda, novo.vendidoEm]).toEqual(["venda", 10, "2026-10-03"]);
  });
});

describe("salvarImovel: banco recebe só o que o chamador trouxe; o store fica como o banco", () => {
  const noBanco = () => fromDbImovel(linha({
    finalidade: "venda", valor_venda: 500000, vendido_em: "2026-10-02",
    retirado: false, retirado_em: null, retirado_motivo: null, retirado_observacao: null,
  }));

  it("Q. arrastar no Pipeline ({...imovel, status}) preserva finalidade e valorVenda", async () => {
    const imovel = noBanco();
    useAppStore.setState({ imoveis: [imovel] });
    const atualizado: Imovel = { ...imovel, status: "Sem resposta", statusHistory: [...(imovel.statusHistory || [])] };
    aplicarMudancaDeStatus(atualizado, "Sem resposta", imovel.status, USUARIO);
    expect((await salvarImovel(atualizado, USUARIO, false)).ok).toBe(true);
    const enviado = ultimoUpsert();
    expect([enviado.status, enviado.finalidade, enviado.valor_venda, Object.hasOwn(enviado, "vendido_em")]).toEqual(["Sem resposta", "venda", 500000, false]);
    const depois = doStore(imovel.id);
    expect([depois.status, depois.finalidade, depois.valorVenda, depois.vendidoEm]).toEqual(["Sem resposta", "venda", 500000, "2026-10-02"]);
  });

  it("Q. o cenário do defeito: Realtime parcial e depois o arrasto não gravam null", async () => {
    const imovel = noBanco();
    const aposRealtime = reconciliarImovelRealtime(imovel, { id: imovel.id, observacoes: "chegou resposta" }, USUARIO);
    useAppStore.setState({ imoveis: [aposRealtime] });
    const atualizado: Imovel = { ...aposRealtime, status: "Sem resposta" };
    await salvarImovel(atualizado, USUARIO, false);
    expect([ultimoUpsert().finalidade, ultimoUpsert().valor_venda]).toEqual(["venda", 500000]);
  });

  it("G. editar pelo formulário (sem as chaves) não manda as colunas e o store mantém os valores", async () => {
    const imovel = noBanco();
    useAppStore.setState({ imoveis: [imovel] });
    await salvarImovel(comoFormulario(imovel), USUARIO, false);
    const enviado = ultimoUpsert();
    for (const coluna of ["finalidade", "valor_venda", "vendido_em"]) expect(Object.hasOwn(enviado, coluna), coluna).toBe(false);
    expect(enviado.observacoes).toBe("editado");
    const depois = doStore(imovel.id);
    expect([depois.observacoes, depois.finalidade, depois.valorVenda, depois.vendidoEm]).toEqual(["editado", "venda", 500000, "2026-10-02"]);
  });

  it("V. vendidoEm: o store mantém o do banco, mesmo se o chamador mandar outro, e nada vai ao upsert", async () => {
    const imovel = noBanco();
    useAppStore.setState({ imoveis: [imovel] });
    await salvarImovel({ ...imovel, vendidoEm: "2030-01-01" }, USUARIO, false);
    expect(Object.hasOwn(ultimoUpsert(), "vendido_em")).toBe(false);
    expect(doStore(imovel.id).vendidoEm).toBe("2026-10-02");
  });

  it("null explícito limpa no banco e no store", async () => {
    const imovel = noBanco();
    useAppStore.setState({ imoveis: [imovel] });
    await salvarImovel(comoFormulario(imovel, { finalidade: null, valorVenda: null }), USUARIO, false);
    expect([ultimoUpsert().finalidade, ultimoUpsert().valor_venda]).toEqual([null, null]);
    expect([doStore(imovel.id).finalidade, doStore(imovel.id).valorVenda]).toEqual([null, null]);
  });

  it("valor novo vai ao banco e ao store", async () => {
    const imovel = noBanco();
    useAppStore.setState({ imoveis: [imovel] });
    await salvarImovel(comoFormulario(imovel, { finalidade: "locacao_venda", valorVenda: 0 }), USUARIO, false);
    expect([ultimoUpsert().finalidade, ultimoUpsert().valor_venda]).toEqual(["locacao_venda", 0]);
    expect([doStore(imovel.id).finalidade, doStore(imovel.id).valorVenda]).toEqual(["locacao_venda", 0]);
  });

  it("D3. editar um imóvel retirado pelo formulário mantém os dados da retirada no store, sem mandá-los", async () => {
    const retirado = fromDbImovel(linha({ status: "Angariado", retirado: true, retirado_em: "2026-09-30", retirado_motivo: "outro", retirado_observacao: "vendeu por fora" }));
    useAppStore.setState({ imoveis: [retirado] });
    await salvarImovel(comoFormulario(retirado), USUARIO, false);
    const enviado = ultimoUpsert();
    expect(enviado.retirado).toBe(true);
    for (const coluna of ["retirado_em", "retirado_motivo", "retirado_observacao"]) expect(Object.hasOwn(enviado, coluna), coluna).toBe(false);
    const depois = doStore(retirado.id);
    expect([depois.retirado, depois.retiradoEm, depois.retiradoMotivo, depois.retiradoObservacao]).toEqual([true, "2026-09-30", "outro", "vendeu por fora"]);
  });
});

describe("caminhos de criação", () => {
  it("T. pré-cadastro (campos do ModalPreCadastro) não manda finalidade nem valor_venda", async () => {
    const pre = { id: "pre-1", codigo: "PRE-1", endereco: "Rua Pré, 1", unidade: "", bloco: "", edificio: "", bairro: "Centro",
      cidade: "Londrina", estado: "PR", proprietarioNome: "", proprietarioTelefone: "", cep: "", origemImovel: "OLX",
      anuncioIdadeDias: null, tipo: "Casa", quartos: 2, vagas: 1, valorAluguel: 1500, latitude: null, longitude: null,
      status: "Novo contato", dataAngariacao: "2026-10-06", responsavel: "", statusHistory: [], preCadastro: true,
      textoAnuncio: "Casa à venda, 3 quartos" } as Imovel;
    expect((await salvarImovel(pre, USUARIO, false)).ok).toBe(true);
    for (const coluna of ["finalidade", "valor_venda", "vendido_em"]) expect(Object.hasOwn(ultimoUpsert(), coluna), coluna).toBe(false);
  });

  it("U. importação não manda finalidade nem valor_venda (e 'valor' segue indo para o aluguel)", async () => {
    const csv = "endereco;cidade;tipo;valor\nRua Importada, 10;Londrina;Casa;450000\n";
    const candidatos = lerImportacao(csv, [], "2026-10-06").linhas.map((l) => l.imovel).filter((i) => i !== null);
    expect((await importarImoveis(candidatos, USUARIO)).ok).toBe(true);
    const [enviado] = gravacoes("imoveis", "insert").at(-1) as Record<string, unknown>[];
    for (const coluna of ["finalidade", "valor_venda", "vendido_em"]) expect(Object.hasOwn(enviado, coluna), coluna).toBe(false);
    expect(enviado.valor_aluguel).toBe(450000); // dívida registrada: planilha de venda alimenta o aluguel
  });

  it("R/S. desdobramento: unidade herda a finalidade e nasce sem valor de venda", async () => {
    const principal = fromDbImovel(linha({ status: "Angariado", finalidade: "venda", valor_venda: 900000 }));
    useAppStore.setState({ imoveis: [principal] });
    const specs = [
      { unidade: "Sala 1", tipo: "Sala", codigo: "S-1", valorAluguel: 800, valorCondominio: 0 },
      { unidade: "Sala 2", tipo: "Sala", codigo: "S-2", valorAluguel: 900, valorCondominio: 0 },
    ];
    expect(await desdobrarImovel(principal.id, specs, USUARIO)).toBe(true);
    const inseridas = gravacoes("imoveis", "insert").at(-1) as Record<string, unknown>[];
    expect(inseridas.map((u) => [u.finalidade, u.valor_venda, Object.hasOwn(u, "vendido_em")])).toEqual([["venda", null, false], ["venda", null, false]]);
    const doPrincipal = useAppStore.getState().imoveis.find((i) => i.id === principal.id)!;
    expect([doPrincipal.finalidade, doPrincipal.valorVenda]).toEqual(["venda", 900000]);
  });

  it("desdobramento com principal null ou sem o campo: nunca inventa locacao", () => {
    const spec = { unidade: "A", tipo: "Sala", codigo: "A", valorAluguel: 0, valorCondominio: 0 };
    const comNull = unidadeDesdobrada(fromDbImovel(linha({ status: "Angariado", finalidade: null })), spec, "u-1");
    expect([comNull.finalidade, toDbImovel(comNull, USUARIO).finalidade]).toEqual([null, null]);
    const semCampo = unidadeDesdobrada(fromDbImovel({ ...linhas[0], status: "Angariado" }), spec, "u-2");
    expect(Object.hasOwn(semCampo, "finalidade")).toBe(false);
    expect(Object.hasOwn(toDbImovel(semCampo, USUARIO), "finalidade")).toBe(false);
    expect(semCampo.valorVenda).toBeNull();
  });
});
