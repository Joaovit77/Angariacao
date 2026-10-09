// @vitest-environment jsdom
import { createElement } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import VendasView from "@/components/vendas/VendasView";
import Modal from "@/components/vendas/ModalCriarOportunidadeVenda";
import { ERROS_CRIACAO_VENDA } from "@/components/vendas/criacaoVenda";
import type { CodigoErroVenda } from "@/lib/persistencia/vendasComandos";
import { bancoSinteticoB1, CONTATO_ANA, OUTRO_USUARIO, USUARIO } from "./fixtures/vendasB34bB1";
const ref = vi.hoisted(() => ({ banco: null as unknown as ReturnType<typeof bancoSinteticoB1> }));
vi.mock("@/lib/persistencia/supabase", () => ({ getSupabase: () => ref.banco.cliente }));
beforeEach(() => { ref.banco = bancoSinteticoB1(); sessionStorage.clear(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
const enviar = () => fireEvent.click(screen.getByRole("button", { name: "Criar oportunidade" }));
async function abrir() { const fechar = vi.fn(), criar = vi.fn(); render(createElement(Modal, { aoFechar: fechar, aoCriar: criar })); await waitFor(() => expect(screen.queryByText("Carregando contatos…")).toBeNull()); return { fechar, criar }; }
function novo(nome = "Pessoa Nova") { fireEvent.click(screen.getByRole("radio", { name: "Novo interessado" })); fireEvent.change(screen.getByLabelText(/Nome do interessado/), { target: { value: nome } }); }
describe("B3.4b-B1: interface pelo adaptador real e cliente sintético", () => {
  it("abre/fecha, foco inicial e retorno, Tab e Escape", async () => {
    render(createElement(VendasView)); const b = screen.getByRole("button", { name: "Nova oportunidade" }); b.focus(); fireEvent.click(b);
    const fechar = screen.getByRole("button", { name: "Fechar criação de oportunidade" }); expect(document.activeElement).toBe(fechar);
    await screen.findByText("Ana Sintética"); const ultimo = screen.getByRole("button", { name: "Criar oportunidade" }); ultimo.focus(); fireEvent.keyDown(ultimo, { key: "Tab" }); expect(document.activeElement).toBe(fechar);
    fireEvent.keyDown(fechar, { key: "Tab", shiftKey: true }); expect(document.activeElement).toBe(ultimo);
    fireEvent.keyDown(document, { key: "Escape" }); expect(screen.queryByRole("dialog")).toBeNull(); expect(document.activeElement).toBe(b);
  });
  it("seleção explícita, busca, troca de candidatos e modo, sem telefone/arquivado", async () => {
    await abrir(); expect(screen.getByRole("radio", { name: /Ana Sintética/ }).getAttribute("checked")).toBeNull(); enviar(); expect(await screen.findByText("Escolha um contato existente.")).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: /Ana Sintética/ })); fireEvent.click(screen.getByRole("radio", { name: /Bruno Arquivado/ }));
    fireEvent.change(screen.getByRole("searchbox"), { target: { value: "Bruno" } }); expect(screen.queryByRole("radio", { name: /Ana Sintética/ })).toBeNull();
    novo(); fireEvent.click(screen.getByRole("radio", { name: "Contato existente" })); enviar();
    await waitFor(() => expect(ref.banco.estado.chamadas).toHaveLength(1)); expect(ref.banco.estado.chamadas[0].comando.interessado).toEqual({ modo: "existente", contatoId: "c0000000-0000-4000-8000-00000000000d" });
  });
  it("novo: foco de erro, nome, telefone vazio null, zero e sucesso", async () => {
    const { criar } = await abrir(); novo(""); enviar(); expect(document.activeElement).toBe(screen.getByLabelText(/Nome do interessado/));
    novo("  Pessoa Nova  "); fireEvent.change(screen.getByLabelText(/Valor previsto/), { target: { value: "0" } }); enviar();
    await waitFor(() => expect(criar).toHaveBeenCalledTimes(1));
    const c = ref.banco.estado.chamadas[0].comando;
    expect(c.interessado).toEqual({ modo: "novo", nome: "Pessoa Nova", telefone: null }); expect(c.valorNegocioPrevisto).toBe("0e0");
    expect(Object.keys(c).sort()).toEqual(["chaveIdempotencia", "interessado", "origem", "receitaPrevista", "valorNegocioPrevisto"]);
    expect(sessionStorage.length).toBe(0);
  });
  it("duplo submit e Enter repetido não concorrem", async () => {
    const { criar } = await abrir(); novo(); ref.banco.estado.atraso = 50;
    const form = screen.getByRole("button", { name: "Criar oportunidade" }).closest("form")!;
    fireEvent.submit(form); fireEvent.submit(form); fireEvent.submit(form);
    expect(screen.getByRole("button", { name: "Criando…" })).toHaveProperty("disabled", true);
    fireEvent.keyDown(document, { key: "Escape" }); expect(screen.getByRole("dialog")).toBeTruthy();
    await waitFor(() => expect(criar).toHaveBeenCalledTimes(1)); expect(ref.banco.estado.chamadas).toHaveLength(1);
  });
  it.each(["timeout", "invalida"] as const)("%s após commit: retry imutável, um contato/oportunidade/evento/recibo", async (modo) => {
    const { criar, fechar } = await abrir(); novo(); ref.banco.estado.aposCommit = modo; enviar();
    const repetir = await screen.findByRole("button", { name: "Verificar mesmo pedido" });
    expect(screen.getByLabelText(/Nome do interessado/).matches(":disabled")).toBe(true);
    fireEvent.keyDown(document, { key: "Escape" }); expect(fechar).not.toHaveBeenCalled();
    fireEvent.click(repetir); await waitFor(() => expect(criar).toHaveBeenCalledTimes(1));
    expect(ref.banco.estado.chamadas).toHaveLength(2); expect(ref.banco.estado.chamadas[0]).toEqual(ref.banco.estado.chamadas[1]);
    expect(ref.banco.estado.tabelas.contatos).toHaveLength(4); expect(ref.banco.estado.tabelas.vendas_oportunidades).toHaveLength(1); expect(ref.banco.estado.tabelas.vendas_oportunidades_eventos).toHaveLength(1); expect(ref.banco.estado.recibos.size).toBe(1);
  });
  it("remontar preserva a intenção incerta sem gerar outra chave", async () => {
    await abrir(); novo(); ref.banco.estado.aposCommit = "timeout"; enviar(); await screen.findByRole("button", { name: "Verificar mesmo pedido" }); cleanup();
    const { criar } = await abrir(); fireEvent.click(await screen.findByRole("button", { name: "Verificar mesmo pedido" })); await waitFor(() => expect(criar).toHaveBeenCalledTimes(1));
    expect(ref.banco.estado.chamadas[1]).toEqual(ref.banco.estado.chamadas[0]);
  });
  it("falha de armazenamento durante retry não perde chave nem payload", async () => {
    const { criar } = await abrir(); novo(); ref.banco.estado.aposCommit = "timeout"; enviar(); await screen.findByRole("button", { name: "Verificar mesmo pedido" });
    const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("bloqueado"); });
    fireEvent.click(screen.getByRole("button", { name: "Verificar mesmo pedido" })); await screen.findByText(/Não foi possível proteger/); spy.mockRestore();
    fireEvent.click(screen.getByRole("button", { name: "Verificar mesmo pedido" })); await waitFor(() => expect(criar).toHaveBeenCalledTimes(1)); expect(ref.banco.estado.chamadas[1]).toEqual(ref.banco.estado.chamadas[0]);
  });
  it("troca de conta antes de submit ou retry não envia o pedido", async () => {
    await abrir(); novo(); ref.banco.estado.usuario = OUTRO_USUARIO; enviar(); await screen.findByText(/Não foi possível confirmar a mesma conta/); expect(ref.banco.estado.chamadas).toHaveLength(0);
    ref.banco.estado.usuario = USUARIO; ref.banco.estado.aposCommit = "timeout"; enviar(); await screen.findByRole("button", { name: "Verificar mesmo pedido" }); ref.banco.estado.usuario = OUTRO_USUARIO;
    fireEvent.click(screen.getByRole("button", { name: "Verificar mesmo pedido" })); await screen.findByText(/Não foi possível confirmar a mesma conta/); expect(ref.banco.estado.chamadas).toHaveLength(1);
  });
  it.each(["telefone-ja-cadastrado", "telefone-em-revisao", "interessado-ambiguo", "contato-fundido", "contato-anonimizado", "contato-invalido", "falha-interna"])("%s mantém decisão humana sem cadastro separado nem retry automático", async (codigo) => {
    const { criar } = await abrir(); novo(); ref.banco.estado.proximoErro = codigo; enviar(); expect((await screen.findByRole("alert")).textContent).toBe(ERROS_CRIACAO_VENDA[codigo as CodigoErroVenda]);
    await act(async () => { await Promise.resolve(); }); expect(criar).not.toHaveBeenCalled(); expect(ref.banco.estado.chamadas).toHaveLength(1); expect(ref.banco.estado.tabelas.contatos).toHaveLength(3); expect(sessionStorage.length).toBe(0);
  });
  it("conflito transitório permite repetir mesma intenção; conflito de chave bloqueia edição", async () => {
    const { criar } = await abrir(); novo(); ref.banco.estado.proximoErro = "conflito-transitorio"; enviar();
    fireEvent.click(await screen.findByRole("button", { name: "Repetir mesmo pedido" })); await waitFor(() => expect(criar).toHaveBeenCalledTimes(1)); expect(ref.banco.estado.chamadas[1]).toEqual(ref.banco.estado.chamadas[0]);
    cleanup(); sessionStorage.clear(); await abrir(); novo(); ref.banco.estado.proximoErro = "chave-idempotencia-conflitante"; enviar(); await screen.findByRole("button", { name: "Verificar mesmo pedido" }); expect(screen.getByLabelText(/Nome do interessado/).matches(":disabled")).toBe(true);
  });
  it("armazenamento indisponível antes de envio e pedido corrompido falham fechados", async () => {
    await abrir(); novo(); const spy = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => { throw new Error("bloqueado"); }); enviar(); await screen.findByText(/Não foi possível proteger/); expect(ref.banco.estado.chamadas).toHaveLength(0); spy.mockRestore(); cleanup();
    sessionStorage.setItem("angario:vendas:criacao-pendente:" + USUARIO, '{"interessado":"corrompido"}'); await abrir(); await screen.findByText(/Não foi possível recuperar com segurança/); expect(screen.getByRole("button", { name: "Criar oportunidade" })).toHaveProperty("disabled", true);
  });
  it("loading, erro recuperável e vazio dos candidatos", async () => {
    ref.banco.estado.atraso = 30; ref.banco.estado.erroLeitura = true;
    render(createElement(Modal, { aoCriar: vi.fn(), aoFechar: vi.fn() })); expect(screen.getByText("Carregando contatos…")).toBeTruthy();
    await screen.findByRole("button", { name: "Atualizar contatos" }); ref.banco.estado.erroLeitura = false; ref.banco.estado.tabelas.contatos = [];
    fireEvent.click(screen.getByRole("button", { name: "Atualizar contatos" })); expect(await screen.findByText(/Nenhum contato disponível/)).toBeTruthy();
  });
  it("sucesso relê a lista, preserva filtro ocultando nova e abre drawer com evento do backend", async () => {
    render(createElement(VendasView)); await screen.findByText("Nenhuma oportunidade de venda");
    fireEvent.change(screen.getByRole("combobox", { name: "Filtrar por etapa" }), { target: { value: "perdida" } });
    fireEvent.click(screen.getByRole("button", { name: "Nova oportunidade" })); await screen.findByText("Ana Sintética"); fireEvent.click(screen.getByRole("radio", { name: /Ana Sintética/ })); enviar();
    const drawer = await screen.findByRole("dialog", { name: "Ana Sintética" }); expect(await within(drawer).findByText("Oportunidade criada")).toBeTruthy();
    expect(screen.getByRole("combobox", { name: "Filtrar por etapa" })).toHaveProperty("value", "perdida");
    expect(ref.banco.estado.consultas.filter((q) => q.tabela === "vendas_oportunidades")).toHaveLength(2);
    expect(ref.banco.estado.chamadas[0].comando.interessado).toEqual({ modo: "existente", contatoId: CONTATO_ANA });
  });
});
