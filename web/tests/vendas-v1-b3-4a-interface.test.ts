// @vitest-environment jsdom
import { createElement } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import VendasView, { EVENTO_VENDAS_ATUALIZADAS } from "@/components/vendas/VendasView";
import {
  OP_REFERENCIA, clienteFalso, contatosPadrao, eventosPadrao, oportunidadesPadrao, referenciaPadrao,
  type ConsultaRegistrada, type RespostaTabela,
} from "./fixtures/vendasB34a";

/* O mesmo caminho da produção: VendasView → vendasLeitura → getSupabase(). Aqui o cliente é falso
   e não tem `rpc`: qualquer tentativa de gravar quebraria o teste. */
const banco = vi.hoisted(() => ({ tabelas: {} as Record<string, RespostaTabela>, consultas: [] as ConsultaRegistrada[] }));
vi.mock("@/lib/persistencia/supabase", () => ({
  getSupabase: () => {
    const falso = clienteFalso(banco.tabelas);
    return new Proxy(falso.cliente, {
      get(alvo, chave) {
        if (chave !== "from") throw new Error(`B3.4a não pode usar ${String(chave)} do cliente.`);
        return (tabela: string) => { const consulta = alvo.from(tabela); banco.consultas.push(falso.consultas.at(-1)!); return consulta; };
      },
    });
  },
}));

function padrao() {
  banco.tabelas = {
    vendas_oportunidades: oportunidadesPadrao(), vendas_imoveis_referencias: [referenciaPadrao()], contatos: contatosPadrao(),
    vendas_oportunidades_eventos: [...eventosPadrao(OP_REFERENCIA)],
  };
}
async function renderizar() {
  render(createElement(VendasView));
  await screen.findByRole("table", { name: "Oportunidades de venda" });
}
const linhas = () => within(screen.getByRole("table", { name: "Oportunidades de venda" })).getAllByRole("row").slice(1);
const colunas = (linha: HTMLElement) => within(linha).getAllByRole("cell").map((c) => c.textContent);
/** Cada nó de texto separado por espaço: textContent cola "Ganha" e "R$" em "GanhaR$". */
function textosVisiveis(): string {
  const caminhante = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const partes: string[] = [];
  while (caminhante.nextNode()) partes.push(caminhante.currentNode.textContent ?? "");
  return partes.join(" ");
}
const PROIBIDOS = /avançar|ganhar|perder|arquivar|alterar|nova oportunidade|criar|salvar|editar|excluir|transicionar/i;

beforeEach(() => { banco.consultas = []; padrao(); });
afterEach(() => cleanup());

describe("B3.4a: VendasView", () => {
  it("mostra carregando e depois a lista com cabeçalhos semânticos, sem arquivadas", async () => {
    render(createElement(VendasView));
    expect(screen.getByRole("status").textContent).toContain("Carregando oportunidades…");
    await screen.findByRole("table", { name: "Oportunidades de venda" });
    expect(screen.getAllByRole("columnheader").map((c) => c.textContent)).toEqual(["Interessado", "Imóvel", "Etapa", "Valor", "Atualizado em", "Abrir"]);
    const [referencia, ganha, nova] = linhas();
    expect(linhas()).toHaveLength(3);
    expect(colunas(referencia)).toEqual(["Contato sem nome", "LD-77Av. Brasil, 500 · CRM-77 · unidade 301", "Em negociação", expect.stringMatching(/R\$\s350\.000,50/), "05/10/2026 12:30", "Abrir"]);
    expect(colunas(ganha).slice(0, 4)).toEqual(["Ana Compradora", "Rua das Palmeiras, 100unidade 12 · bloco B", "Ganha", expect.stringMatching(/R\$\s480\.000,00/)]);
    expect(colunas(nova).slice(1, 4)).toEqual(["Sem imóvel", "Nova", expect.stringMatching(/R\$\s0,00/)]);
    expect(screen.getByText("3 de 4")).toBeTruthy();
  });

  it("lista vazia: mensagem simples, sem ação de criar", async () => {
    banco.tabelas = { vendas_oportunidades: [] };
    render(createElement(VendasView));
    expect(await screen.findByText("Nenhuma oportunidade de venda")).toBeTruthy();
    expect(screen.queryAllByRole("button").filter((b) => PROIBIDOS.test(b.textContent ?? ""))).toEqual([]);
  });

  it("erro perceptível com Tentar novamente, que recarrega", async () => {
    banco.tabelas = { vendas_oportunidades: "rede" };
    render(createElement(VendasView));
    const alerta = await screen.findByRole("alert");
    expect(alerta.textContent).toContain("Não foi possível carregar as oportunidades");
    expect(alerta.textContent).toContain("Verifique a internet");
    padrao();
    fireEvent.click(within(alerta).getByRole("button", { name: "Tentar novamente" }));
    await screen.findByRole("table", { name: "Oportunidades de venda" });
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("filtros: busca, etapa e mostrar arquivadas", async () => {
    await renderizar();
    fireEvent.change(screen.getByRole("searchbox", { name: "Buscar por interessado ou imóvel" }), { target: { value: "palmeiras" } });
    expect(linhas().map((l) => colunas(l)[0])).toEqual(["Ana Compradora"]);
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Filtrar por etapa" }), { target: { value: "abertas" } });
    expect(linhas().map((l) => colunas(l)[2])).toEqual(["Em negociação", "Nova"]);
    fireEvent.change(screen.getByRole("combobox", { name: "Filtrar por etapa" }), { target: { value: "perdida" } });
    expect(screen.getByText("Nenhuma oportunidade neste filtro")).toBeTruthy();
    expect(screen.getByText(/1 arquivada\(s\) oculta\(s\)/)).toBeTruthy();
    fireEvent.click(screen.getByRole("checkbox", { name: "Mostrar arquivadas" }));
    expect(linhas().map((l) => colunas(l).slice(0, 3))).toEqual([["Contato sem nome", "Sem imóvel", "PerdidaArquivada"]]);
    // Filtrar não toca o banco: a única leitura de lista continua sendo a inicial.
    expect(banco.consultas.filter((c) => c.tabela === "vendas_oportunidades")).toHaveLength(1);
  });

  it("abre e fecha o detalhe, com conteúdo, histórico e foco de volta", async () => {
    await renderizar();
    const abrir = within(linhas()[0]).getByRole("button", { name: "Abrir oportunidade de Contato sem nome" });
    abrir.focus();
    fireEvent.click(abrir);
    const drawer = screen.getByRole("dialog", { name: "Contato sem nome" });
    const fechar = within(drawer).getByRole("button", { name: "Fechar detalhes da oportunidade" });
    expect(document.activeElement).toBe(fechar);
    expect(within(drawer).getByRole("region", { name: "Imóvel" }).textContent).toContain("LD-77");
    expect(within(drawer).getByRole("region", { name: "Imóvel" }).textContent).toContain("Imóvel da carteira");
    expect(within(drawer).getByRole("region", { name: "Valores" }).textContent).toMatch(/Receita prevista.*R\$\s17\.500,00/);
    expect(within(drawer).getByRole("region", { name: "Valores" }).textContent).not.toContain("fechado");
    expect(within(drawer).getByRole("region", { name: "Origem" }).textContent).toContain("Portal · Anúncio no portal");
    expect(within(drawer).queryByRole("region", { name: "Encerramento" })).toBeNull();

    const eventos = await within(drawer).findByRole("list", { name: "Eventos da oportunidade" });
    expect(within(eventos).getAllByRole("listitem").map((i) => i.textContent)).toEqual([
      "01/10/2026 09:00Oportunidade criadaEtapa inicial: Nova",
      "02/10/2026 09:00Etapa alteradaNova → Em atendimento",
      expect.stringMatching(/^03\/10\/2026 09:00Valores alteradosValor do negócio previsto: Não informado → R\$\s350\.000,50$/),
    ]);
    expect(drawer.textContent).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}|chave-|versaoContrato|\{/);
    expect(banco.consultas.filter((c) => c.tabela === "vendas_oportunidades_eventos").map((c) => c.filtros)).toEqual([[["eq", "oportunidade_id", OP_REFERENCIA]]]);

    fireEvent.click(fechar);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(abrir);
  });

  it("detalhe da venda ganha mostra encerramento e valor fechado; Esc fecha", async () => {
    await renderizar();
    fireEvent.click(within(linhas()[1]).getByRole("button", { name: "Abrir oportunidade de Ana Compradora" }));
    const drawer = screen.getByRole("dialog", { name: "Ana Compradora" });
    const encerramento = within(drawer).getByRole("region", { name: "Encerramento" });
    expect(encerramento.textContent).toContain("Venda ganha");
    expect(encerramento.textContent).toContain("03/10/2026");
    expect(encerramento.textContent).toContain("Contrato assinado no cartório");
    expect(within(drawer).getByRole("region", { name: "Valores" }).textContent).toMatch(/Valor do negócio fechado.*R\$\s480\.000,00/);
    expect(await within(drawer).findByText("Nenhum evento registrado.")).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("histórico com erro avisa e permite tentar de novo sem fechar o detalhe", async () => {
    banco.tabelas.vendas_oportunidades_eventos = "rede";
    await renderizar();
    fireEvent.click(within(linhas()[0]).getByRole("button", { name: /^Abrir oportunidade/ }));
    const drawer = screen.getByRole("dialog");
    const alerta = await within(drawer).findByRole("alert");
    expect(alerta.textContent).toContain("Não foi possível carregar o histórico.");
    banco.tabelas.vendas_oportunidades_eventos = eventosPadrao(OP_REFERENCIA);
    fireEvent.click(within(alerta).getByRole("button", { name: "Tentar novamente" }));
    expect(await within(drawer).findByRole("list", { name: "Eventos da oportunidade" })).toBeTruthy();
  });

  it("nenhuma ação mutante aparece, nem desabilitada, na lista ou no detalhe", async () => {
    await renderizar();
    for (const linha of linhas()) {
      fireEvent.click(within(linha).getByRole("button", { name: /^Abrir oportunidade/ }));
      const drawer = screen.getByRole("dialog");
      await within(drawer).findByRole("region", { name: "Histórico" });
      expect(within(drawer).getAllByRole("button").map((b) => b.getAttribute("aria-label") ?? b.textContent)).toEqual(["Fechar detalhes da oportunidade"]);
      fireEvent.click(within(drawer).getByRole("button", { name: "Fechar detalhes da oportunidade" }));
    }
    const botoes = screen.getAllByRole("button").map((b) => b.textContent ?? "");
    expect(botoes.every((texto) => texto === "Abrir")).toBe(true);
    expect(textosVisiveis()).not.toMatch(PROIBIDOS);
    expect(new Set(banco.consultas.map((c) => c.tabela))).toEqual(new Set(["vendas_oportunidades", "vendas_imoveis_referencias", "contatos", "vendas_oportunidades_eventos"]));
  });

  it("o evento vendas:atualizadas recarrega a lista e o detalhe aberto acompanha", async () => {
    await renderizar();
    fireEvent.click(within(linhas()[1]).getByRole("button", { name: "Abrir oportunidade de Ana Compradora" }));
    expect(screen.getByRole("dialog", { name: "Ana Compradora" })).toBeTruthy();
    banco.tabelas.contatos = [{ id: contatosPadrao()[0].id, nome: "Ana Renomeada" }, contatosPadrao()[1]];
    await act(async () => { window.dispatchEvent(new Event(EVENTO_VENDAS_ATUALIZADAS)); });
    await waitFor(() => expect(screen.getByRole("dialog", { name: "Ana Renomeada" })).toBeTruthy());
    expect(banco.consultas.filter((c) => c.tabela === "vendas_oportunidades")).toHaveLength(2);
    expect(linhas().some((l) => colunas(l)[0] === "Ana Renomeada")).toBe(true);
  });

  it("drawer modal mantém o foco, fecha pelo teclado e devolve ao botão de abertura", async () => {
    await renderizar();
    const abrir = within(linhas()[0]).getByRole("button", { name: /^Abrir oportunidade/ });
    abrir.focus();
    fireEvent.click(abrir);
    const drawer = screen.getByRole("dialog");
    expect(drawer.getAttribute("aria-modal")).toBe("true");
    const fechar = within(drawer).getByRole("button", { name: "Fechar detalhes da oportunidade" });
    expect(document.activeElement).toBe(fechar);
    fireEvent.keyDown(fechar, { key: "Tab" });
    expect(document.activeElement).toBe(fechar);
    fireEvent.keyDown(fechar, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(fechar);
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(document.activeElement).toBe(abrir);
  });

});
