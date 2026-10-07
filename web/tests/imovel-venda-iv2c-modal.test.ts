// @vitest-environment jsdom

/* Imóvel de venda, IV-2C: o ModalImovel escolhe a finalidade e mostra o valor
   de aluguel e o de venda conforme ela. Renderiza o modal de verdade; só o que
   está fora do escopo (sessão, router, mapa, autocomplete, linha do tempo,
   gravação) é trocado. O `salvarImovel` é capturado para ver o objeto que o
   formulário monta; a persistência dele está provada no IV-2B. */
import { createElement } from "react";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Imovel } from "@/lib/tipos";

const mocks = vi.hoisted(() => ({
  salvar: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("@/lib/retomadaCliente", () => ({ useRetomadaB4: () => false }));
vi.mock("@/components/SessaoProvider", () => ({
  useSessao: () => ({ estado: "auth", usuario: { id: "usuario-iv2c" } }),
  captadorPadrao: () => "",
}));
vi.mock("@/lib/useCidadePadraoDaConta", () => ({
  useCidadePadraoDaConta: () => ({ origem: "nenhuma", cidade: null, uf: null }),
}));
vi.mock("@/components/formularios/EnderecoAutocompleteViaCep", () => ({
  default: ({ value, onChange }: { value: string; onChange: (v: string) => void }) =>
    createElement("input", { "data-campo": "endereco", value, onChange: (e: { target: { value: string } }) => onChange(e.target.value) }),
}));
vi.mock("@/components/modais/TimelineImovel", () => ({ default: () => null }));
vi.mock("@/lib/persistencia/supabase", () => ({ getSupabase: () => ({}) }));
vi.mock("@/lib/toast", () => ({ toast: mocks.toast }));
vi.mock("@/lib/mutacoes", async (original) => ({
  ...(await original<typeof import("@/lib/mutacoes")>()),
  salvarImovel: mocks.salvar,
}));

import ModalImovel from "@/components/modais/ModalImovel";
import { fromDbImovel, type DbImovelRow } from "@/lib/persistencia/mapeadores";
import { useAppStore } from "@/lib/store";
import type { PromocaoDoGarimpo } from "@/lib/uiModal";
import dbJson from "./fixtures-db.json";

const linhaBase = (dbJson.imoveisRows as unknown as DbImovelRow[])[0];
/** Imóvel como vem do banco (select *), com as colunas de venda. */
function doBanco(extra: Partial<DbImovelRow>): Imovel {
  return fromDbImovel({ ...linhaBase, id: "im-1", codigo: "LD-1", status: "Angariado", retirado: false, finalidade: null, valor_venda: null, vendido_em: null, ...extra });
}

let tela: ReturnType<typeof render>;
const campo = <T extends Element = HTMLInputElement>(nome: string) => tela.container.querySelector<T & Element>(`[data-campo="${nome}"]`);
const finalidade = () => campo<HTMLSelectElement>("finalidade")!;
const opcoes = () => Array.from(finalidade().options).map((o) => o.textContent);
const escolher = (valor: string) => fireEvent.change(finalidade(), { target: { value: valor } });
const digitar = (nome: string, valor: string) => fireEvent.change(campo(nome)!, { target: { value: valor } });
const salvar = () => fireEvent.click(Array.from(tela.container.querySelectorAll("button")).find((b) => /Cadastrar imóvel|Salvar alterações/.test(b.textContent || ""))!);
const salvo = (): Imovel => mocks.salvar.mock.calls.at(-1)![0];

function abrir(props: { id?: string; promocao?: PromocaoDoGarimpo }, imoveis: Imovel[] = []) {
  useAppStore.setState({ imoveis, agenda: [], config: { ...useAppStore.getState().config, comissaoPercent: 100, origensExtras: [] } });
  tela = render(createElement(ModalImovel, props));
}
function novo() {
  abrir({});
  digitar("endereco", "Rua Nova, 10");
}

beforeEach(() => {
  mocks.salvar.mockReset().mockResolvedValue({ ok: true, criado: true });
  mocks.toast.mockReset();
  vi.stubGlobal("confirm", vi.fn(() => true));
});
afterEach(() => cleanup());

describe("cadastro novo", () => {
  it("nasce sem finalidade, sem 'Não informado' e sem nenhum dos dois valores", () => {
    novo();
    expect(finalidade().value).toBe("");
    expect(opcoes()).toEqual(["Selecione a finalidade", "Locação", "Venda", "Locação e venda"]);
    expect(campo("valor-aluguel")).toBeNull();
    expect(campo("valor-venda")).toBeNull();
  });

  it("A. sem finalidade, o save é bloqueado com o aviso", async () => {
    novo();
    salvar();
    await vi.waitFor(() => expect(mocks.toast).toHaveBeenCalledWith("Informe a finalidade do imóvel.", "error"));
    expect(mocks.salvar).not.toHaveBeenCalled();
  });

  it("B. Locação: mostra aluguel, esconde venda, salva locacao", async () => {
    novo();
    escolher("locacao");
    expect(campo("valor-aluguel")).not.toBeNull();
    expect(campo("valor-venda")).toBeNull();
    digitar("valor-aluguel", "2500");
    salvar();
    await vi.waitFor(() => expect(mocks.salvar).toHaveBeenCalled());
    expect([salvo().finalidade, salvo().valorAluguel, salvo().valorVenda]).toEqual(["locacao", 2500, null]);
  });

  it("C. Venda: mostra venda, esconde aluguel, salva venda", async () => {
    novo();
    escolher("venda");
    expect(campo("valor-aluguel")).toBeNull();
    expect(campo("valor-venda")).not.toBeNull();
    digitar("valor-venda", "500000");
    salvar();
    await vi.waitFor(() => expect(mocks.salvar).toHaveBeenCalled());
    expect([salvo().finalidade, salvo().valorVenda, salvo().valorAluguel]).toEqual(["venda", 500000, 0]);
  });

  it("D. Locação e venda: mostra os dois e salva locacao_venda", async () => {
    novo();
    escolher("locacao_venda");
    expect(campo("valor-aluguel")).not.toBeNull();
    expect(campo("valor-venda")).not.toBeNull();
    digitar("valor-aluguel", "3000");
    digitar("valor-venda", "650000");
    salvar();
    await vi.waitFor(() => expect(mocks.salvar).toHaveBeenCalled());
    expect([salvo().finalidade, salvo().valorAluguel, salvo().valorVenda]).toEqual(["locacao_venda", 3000, 650000]);
  });

  it("nunca manda vendidoEm", async () => {
    novo();
    escolher("venda");
    salvar();
    await vi.waitFor(() => expect(mocks.salvar).toHaveBeenCalled());
    expect(Object.hasOwn(salvo(), "vendidoEm")).toBe(false);
  });
});

describe("valor de venda: null, 0 e decimal", () => {
  async function salvarVenda(texto: string) {
    novo();
    escolher("venda");
    digitar("valor-venda", texto);
    salvar();
    await vi.waitFor(() => expect(mocks.salvar).toHaveBeenCalled());
    return salvo().valorVenda;
  }
  it("L. vazio é null", async () => expect(await salvarVenda("")).toBeNull());
  it("M. 0 é 0", async () => expect(await salvarVenda("0")).toBe(0));
  it("N. decimal é preservado", async () => expect(await salvarVenda("350000.55")).toBe(350000.55));
});

describe("imóvel antigo, ainda sem finalidade", () => {
  const legado = () => doBanco({ valor_aluguel: 2500 });

  it("E. mostra 'Não informado' e mantém o aluguel visível, sem campo de venda", () => {
    abrir({ id: "im-1" }, [legado()]);
    expect(finalidade().value).toBe("");
    expect(finalidade().selectedOptions[0].textContent).toBe("Não informado");
    expect(opcoes()).toEqual(["Não informado", "Locação", "Venda", "Locação e venda"]);
    expect(campo("valor-aluguel")!.value).toBe("2500");
    expect(campo("valor-venda")).toBeNull();
  });

  it("o mesmo quando a linha veio sem a coluna (chave ausente)", () => {
    const semColuna = fromDbImovel({ ...linhaBase, id: "im-1", codigo: "LD-1", status: "Angariado", retirado: false });
    expect(Object.hasOwn(semColuna, "finalidade")).toBe(false);
    abrir({ id: "im-1" }, [semColuna]);
    expect(finalidade().selectedOptions[0].textContent).toBe("Não informado");
    expect(campo("valor-aluguel")).not.toBeNull();
  });

  it("F. salvar sem escolher continua null, sem bloquear, e o aluguel fica", async () => {
    abrir({ id: "im-1" }, [legado()]);
    salvar();
    await vi.waitFor(() => expect(mocks.salvar).toHaveBeenCalled());
    expect(mocks.toast).not.toHaveBeenCalledWith("Informe a finalidade do imóvel.", "error");
    expect([salvo().finalidade, salvo().valorAluguel, salvo().valorVenda]).toEqual([null, 2500, null]);
  });

  it("G. pode ser classificado como Venda; o aluguel fica guardado e é salvo junto", async () => {
    abrir({ id: "im-1" }, [legado()]);
    escolher("venda");
    expect(campo("valor-aluguel")).toBeNull();
    expect(tela.container.querySelector("[data-valor-guardado]")?.textContent).toContain("aluguel");
    digitar("valor-venda", "500000");
    salvar();
    await vi.waitFor(() => expect(mocks.salvar).toHaveBeenCalled());
    expect([salvo().finalidade, salvo().valorAluguel, salvo().valorVenda]).toEqual(["venda", 2500, 500000]);
  });
});

describe("imóvel já classificado", () => {
  it("H. não oferece 'Não informado' para voltar a null", () => {
    abrir({ id: "im-1" }, [doBanco({ finalidade: "venda", valor_venda: 500000 })]);
    expect(finalidade().value).toBe("venda");
    expect(opcoes()).toEqual(["Locação", "Venda", "Locação e venda"]);
    expect(campo("valor-venda")!.value).toBe("500000");
    expect(campo("valor-aluguel")).toBeNull();
  });

  it("I. locacao_venda → venda não apaga o aluguel", async () => {
    abrir({ id: "im-1" }, [doBanco({ finalidade: "locacao_venda", valor_aluguel: 2500, valor_venda: 500000 })]);
    escolher("venda");
    expect(campo("valor-aluguel")).toBeNull();
    salvar();
    await vi.waitFor(() => expect(mocks.salvar).toHaveBeenCalled());
    expect([salvo().finalidade, salvo().valorAluguel, salvo().valorVenda]).toEqual(["venda", 2500, 500000]);
  });

  it("J. locacao_venda → locacao não apaga o valor de venda", async () => {
    abrir({ id: "im-1" }, [doBanco({ finalidade: "locacao_venda", valor_aluguel: 2500, valor_venda: 500000 })]);
    escolher("locacao");
    expect(campo("valor-venda")).toBeNull();
    expect(tela.container.querySelector("[data-valor-guardado]")?.textContent).toContain("venda");
    salvar();
    await vi.waitFor(() => expect(mocks.salvar).toHaveBeenCalled());
    expect([salvo().finalidade, salvo().valorAluguel, salvo().valorVenda]).toEqual(["locacao", 2500, 500000]);
  });

  it("K. voltar na mesma sessão mostra o valor escondido de novo", () => {
    abrir({ id: "im-1" }, [doBanco({ finalidade: "locacao_venda", valor_aluguel: 2500, valor_venda: 500000 })]);
    escolher("venda");
    digitar("valor-venda", "480000");
    escolher("locacao");
    expect(campo("valor-aluguel")!.value).toBe("2500");
    escolher("locacao_venda");
    expect(campo("valor-aluguel")!.value).toBe("2500");
    expect(campo("valor-venda")!.value).toBe("480000");
  });

  it("editar outro campo manda a finalidade e o valor como estavam, e nada de vendidoEm", async () => {
    abrir({ id: "im-1" }, [doBanco({ finalidade: "venda", valor_venda: 500000, vendido_em: "2026-10-01" })]);
    salvar();
    await vi.waitFor(() => expect(mocks.salvar).toHaveBeenCalled());
    expect([salvo().finalidade, salvo().valorVenda, Object.hasOwn(salvo(), "vendidoEm")]).toEqual(["venda", 500000, false]);
  });
});

describe("IV-2C.1: valor em caso de atraso é da locação; condomínio fica sempre", () => {
  const visiveis = () => ["valor-aluguel", "valor-atraso", "valor-venda", "valor-condominio"].filter((c) => campo(c) !== null);

  it("A. Locação mostra aluguel, atraso e condomínio", () => {
    novo();
    escolher("locacao");
    expect(visiveis()).toEqual(["valor-aluguel", "valor-atraso", "valor-condominio"]);
  });

  it("B/G. Venda esconde aluguel e atraso, e mantém venda e condomínio", () => {
    novo();
    escolher("venda");
    expect(visiveis()).toEqual(["valor-venda", "valor-condominio"]);
  });

  it("C. Locação e venda mostra os quatro", () => {
    novo();
    escolher("locacao_venda");
    expect(visiveis()).toEqual(["valor-aluguel", "valor-atraso", "valor-venda", "valor-condominio"]);
  });

  it("D. imóvel antigo sem finalidade mostra aluguel, atraso e condomínio, como antes", () => {
    abrir({ id: "im-1" }, [doBanco({ valor_aluguel: 2500, valor_aluguel_atraso: 2700 })]);
    expect(visiveis()).toEqual(["valor-aluguel", "valor-atraso", "valor-condominio"]);
    expect(campo("valor-atraso")!.value).toBe("2700");
  });

  it("cadastro novo sem finalidade não mostra atraso (nada é presumido)", () => {
    novo();
    expect(visiveis()).toEqual(["valor-condominio"]);
  });

  it("E. locacao_venda → venda: aluguel e atraso somem da tela, mas são salvos como estavam", async () => {
    abrir({ id: "im-1" }, [doBanco({ finalidade: "locacao_venda", valor_aluguel: 2500, valor_aluguel_atraso: 2700, valor_venda: 500000, valor_condominio: 400 })]);
    escolher("venda");
    expect(visiveis()).toEqual(["valor-venda", "valor-condominio"]);
    expect(tela.container.querySelector("[data-valor-guardado]")?.textContent).toContain("atraso");
    salvar();
    await vi.waitFor(() => expect(mocks.salvar).toHaveBeenCalled());
    expect([salvo().finalidade, salvo().valorAluguel, salvo().valorAluguelAtraso, salvo().valorVenda, salvo().valorCondominio])
      .toEqual(["venda", 2500, 2700, 500000, 400]);
  });

  it("F. venda → locacao_venda na mesma sessão: atraso reaparece com o valor", () => {
    abrir({ id: "im-1" }, [doBanco({ finalidade: "locacao_venda", valor_aluguel: 2500, valor_aluguel_atraso: 2700, valor_venda: 500000 })]);
    escolher("venda");
    expect(campo("valor-atraso")).toBeNull();
    escolher("locacao_venda");
    expect(campo("valor-atraso")!.value).toBe("2700");
    expect(campo("valor-aluguel")!.value).toBe("2500");
  });
});

describe("pré-cadastro e Garimpo", () => {
  it("O. confirmar um pré-cadastro sem finalidade não é bloqueado e continua null", async () => {
    abrir({ id: "im-1" }, [doBanco({ pre_cadastro: true, status: "Novo contato", valor_aluguel: 1800 })]);
    expect(finalidade().selectedOptions[0].textContent).toBe("Não informado");
    salvar();
    await vi.waitFor(() => expect(mocks.salvar).toHaveBeenCalled());
    expect([salvo().preCadastro, salvo().finalidade, salvo().valorAluguel]).toEqual([false, null, 1800]);
  });

  it("P. a promoção do Garimpo cria imóvel novo e exige a finalidade, sem inferir nada", async () => {
    const aoSalvar = vi.fn();
    const promocao: PromocaoDoGarimpo = {
      imovelIdentificadoId: "ident-1",
      inicial: { endereco: "Rua do Garimpo, 5", unidade: "", bloco: "", edificio: "", bairro: "Centro", cidade: "Londrina", estado: "PR",
        tipo: "Casa", origemImovel: "Placa de venda", observacoes: "placa de VENDE-SE" },
      aoSalvar,
    };
    abrir({ promocao });
    expect(finalidade().value).toBe("");
    expect(opcoes()).not.toContain("Não informado");
    salvar();
    await vi.waitFor(() => expect(mocks.toast).toHaveBeenCalledWith("Informe a finalidade do imóvel.", "error"));
    expect(mocks.salvar).not.toHaveBeenCalled();

    escolher("locacao_venda");
    salvar();
    await vi.waitFor(() => expect(mocks.salvar).toHaveBeenCalled());
    expect(salvo().finalidade).toBe("locacao_venda");
    await vi.waitFor(() => expect(aoSalvar).toHaveBeenCalledWith(salvo().id));
  });
});
