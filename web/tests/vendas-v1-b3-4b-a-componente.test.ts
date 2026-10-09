// @vitest-environment jsdom
import { createElement, useState } from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import SeletorImovelVenda, { type EstadoSeletorImovelVenda } from "@/components/vendas/SeletorImovelVenda";
import { listarImoveisCandidatosVenda, type ImovelCandidatoVenda } from "@/lib/persistencia/vendasImoveisLeitura";
import { candidatosSinteticos, clienteCandidatosFalso, idCandidato, linhaCandidato } from "./fixtures/vendasB34bA";

afterEach(cleanup);
async function dados(linhas = candidatosSinteticos()) {
  const falso = clienteCandidatosFalso(linhas);
  const resultado = await listarImoveisCandidatosVenda(falso.cliente);
  if (!resultado.ok) throw new Error(resultado.erro);
  return { imoveis: resultado.dados, falso };
}
const opcoes = () => within(screen.getByRole("list", { name: "Imóveis candidatos" })).getAllByRole("listitem");

describe("B3.4b-A: apresentação factual e seleção em memória", () => {
  it("identifica cada candidato com Finalidade, Status, Retirado e valor de venda", async () => {
    const { imoveis } = await dados();
    render(createElement(SeletorImovelVenda, { estado: { tipo: "pronto", imoveis } }));
    expect(opcoes()).toHaveLength(7);
    expect(opcoes().every((opcao) => within(opcao).getByText("Finalidade") && within(opcao).getByText("Status"))).toBe(true);
    expect(opcoes()[0].textContent).toMatch(/VD-01.*Rua das Palmeiras.*Centro.*Curitiba.*PR.*CRM-01.*Unidade 301.*Bloco A.*FinalidadeVenda.*StatusPublicado.*Valor de vendaR\$\s450\.000,55/);
    expect(opcoes()[1].textContent).toMatch(/FinalidadeLocação e venda.*StatusLocado.*Valor de vendaR\$\s600\.000/);
    expect(opcoes()[2].textContent).toContain("FinalidadeLocação");
    expect(opcoes()[2].textContent).not.toContain("Valor de venda");
    expect(opcoes()[3].textContent).toContain("FinalidadeNão informado");
    expect(opcoes()[3].textContent).not.toContain("Valor de venda");
    expect(opcoes()[4].textContent).toMatch(/Retirado.*StatusPublicado.*Valor de vendaR\$\s0/);
    expect(opcoes()[5].textContent).toContain("StatusPerdido");
    expect(opcoes()[5].textContent).toContain("Valor de vendaNão informado");
    expect(opcoes()[6].textContent).toContain("FinalidadeVendaStatusLocado");
    expect(screen.queryByRole("button", { name: /criar|salvar|editar|reativar/i })).toBeNull();
  });
  it("busca por código, endereço, bairro e referência, tolerando acentos e maiúsculas", async () => {
    const { imoveis } = await dados(); render(createElement(SeletorImovelVenda, { estado: { tipo: "pronto", imoveis } }));
    const busca = screen.getByRole("searchbox", { name: "Buscar imóvel" });
    for (const [termo, codigo] of [["vd-02", "VD-02"], ["SAO JOAO", "LG-04"], ["COMERCIO", "LC-03"]]) {
      fireEvent.change(busca, { target: { value: termo } });
      expect(opcoes()).toHaveLength(1); expect(opcoes()[0].textContent).toContain(codigo);
    }
    for (const termo of ["centro", "CRM-01", ""]) {
      fireEvent.change(busca, { target: { value: termo } }); expect(opcoes()).toHaveLength(7);
    }
    fireEvent.change(busca, { target: { value: "inexistente" } });
    expect(screen.getByText("Nenhum imóvel encontrado nesta busca.")).toBeTruthy();
    expect(screen.queryByRole("list")).toBeNull();
  });
  it("conta vazia é distinta de busca vazia, loading e erro", () => {
    const { rerender } = render(createElement(SeletorImovelVenda, { estado: { tipo: "carregando" } }));
    expect(screen.getByRole("status").textContent).toBe("Carregando imóveis…");
    expect(screen.getByRole("region").getAttribute("aria-busy")).toBe("true");
    rerender(createElement(SeletorImovelVenda, { estado: { tipo: "pronto", imoveis: [] } }));
    expect(screen.getByText("Nenhum imóvel na carteira.")).toBeTruthy();
    expect(screen.queryByText("Nenhum imóvel encontrado nesta busca.")).toBeNull();
  });
  it.each(["nao-autenticado", "transporte-indisponivel", "resposta-invalida", "falha-interna"] as const)("erro %s perceptível com retry sem gravar", async (erro) => {
    const { imoveis, falso } = await dados();
    const retry = vi.fn();
    const { rerender } = render(createElement(SeletorImovelVenda, { estado: { tipo: "erro", erro }, onTentarNovamente: retry }));
    const alerta = screen.getByRole("alert");
    expect(alerta.textContent).toContain("Não foi possível carregar os imóveis.");
    fireEvent.click(within(alerta).getByRole("button", { name: "Tentar novamente" })); expect(retry).toHaveBeenCalledOnce();
    rerender(createElement(SeletorImovelVenda, { estado: { tipo: "pronto", imoveis } }));
    expect(opcoes()).toHaveLength(7); expect(screen.queryByRole("alert")).toBeNull();
    expect(falso.mutar).not.toHaveBeenCalled();
  });
  it("seleção é apenas local, inclusive NULL, Locação, Locado, Retirado e Perdido", async () => {
    const { imoveis, falso } = await dados(); const selecionar = vi.fn();
    function FormularioLocal() {
      const [selecionadoId, setSelecionadoId] = useState<string | null>(null);
      return createElement(SeletorImovelVenda, {
        estado: { tipo: "pronto", imoveis }, selecionadoId,
        onSelecionar: (i: ImovelCandidatoVenda) => { setSelecionadoId(i.id); selecionar(i.id); },
      });
    }
    render(createElement(FormularioLocal));
    for (const [n, codigo] of [[1, "VD-01"], [2, "VD-02"], [3, "LC-03"], [4, "LG-04"], [5, "RT-05"], [6, "PD-06"]] as const) {
      fireEvent.click(screen.getByRole("radio", { name: `Selecionar ${codigo}` }));
      expect((screen.getByRole("radio", { name: `Selecionar ${codigo}` }) as HTMLInputElement).checked).toBe(true);
      expect(selecionar).toHaveBeenLastCalledWith(idCandidato(n));
      expect(screen.getByText(`Selecionado: ${codigo}`)).toBeTruthy();
    }
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "VD-01" } });
    expect(screen.getByText("Selecionado: PD-06")).toBeTruthy();
    expect(falso.consultas).toHaveLength(1); expect(falso.mutar).not.toHaveBeenCalled();
  });
  it("sem callback é consulta; rádios de seletores distintos têm grupos independentes", async () => {
    const { imoveis } = await dados([linhaCandidato()]);
    const pronto: EstadoSeletorImovelVenda = { tipo: "pronto", imoveis };
    const { rerender } = render(createElement(SeletorImovelVenda, { estado: pronto }));
    expect(screen.queryByRole("radio")).toBeNull();
    rerender(createElement("div", null,
      createElement(SeletorImovelVenda, { estado: pronto, onSelecionar: vi.fn() }),
      createElement(SeletorImovelVenda, { estado: pronto, onSelecionar: vi.fn() })));
    const radios = screen.getAllByRole("radio") as HTMLInputElement[];
    expect(radios[0].name).not.toBe(radios[1].name);
  });
});
