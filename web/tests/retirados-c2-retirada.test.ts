// @vitest-environment jsdom

/* ================================================================
   RETIRADOS, FASE C / C2: a janela de retirada

   O "Retirar da carteira" deixou de ser um confirm(): a janela pede o
   motivo (obrigatório), a data (padrão hoje em Brasília, nunca no
   futuro) e uma observação (obrigatória em "outro"), e também corrige a
   retirada de um imóvel já retirado sem inventar a data que ninguém sabe.

   Provado aqui, com um banco falso em memória:
   - as regras puras (motivo, "outro", 1000 caracteres, data futura, dia
     de Brasília depois das 21h, rótulos, resumo, legado sem data);
   - a janela nos modos criar e editar (o que grava, o que recusa,
     carregamento, Cancelar, erro e conflito sem sucesso);
   - as gravações: só no estado de origem, com a versão (`updated_at`)
     lida, e 0 linhas é conflito;
   - D4: uma escrita concorrente entre a leitura e a gravação faz a
     retirada não ser aplicada, e a escrita concorrente fica intacta;
   - as fronteiras: quem escreve os campos da retirada e quem abre a janela.

   O comportamento no Postgres de verdade está em
   `integration/retirada-c2-supabase-local.test.ts`.
   ================================================================ */
import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { createElement } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Linha = Record<string, unknown>;

const banco = vi.hoisted(() => ({
  imoveis: [] as Record<string, unknown>[],
  ops: [] as { modo: string; payload: Record<string, unknown> | null; filtros: [string, unknown][] }[],
  versao: 0,
  /** Roda entre a leitura e a escrita de um update: a "outra aba". */
  antesDoUpdate: null as null | (() => void),
  /** Faz o próximo update esperar, para ver o estado "Salvando…". */
  segurar: null as null | Promise<void>,
  erroUpdate: null as null | { message: string },
  toasts: [] as { texto: string; tipo?: string }[],
}));

const novaVersao = () => `2026-10-02T12:00:00.${String(++banco.versao).padStart(6, "0")}+00:00`;

function consultaFalsa() {
  const filtros: [string, unknown][] = [];
  let modo: "select" | "update" | "insert" = "select";
  let payload: Linha | null = null;
  let devolver = false;
  let umaSo = false;
  const casa = (l: Linha) => filtros.every(([c, v]) => l[c] === v);
  const executar = async () => {
    // O lembrete de disponibilidade que a reativação recria (agenda): fora
    // do escopo deste teste, só aceito.
    if (modo === "insert") return { data: null, error: null };
    if (modo === "select") {
      const achadas = banco.imoveis.filter(casa).map((l) => structuredClone(l));
      return { data: umaSo ? achadas[0] ?? null : achadas, error: null };
    }
    if (banco.segurar) await banco.segurar;
    if (banco.antesDoUpdate) {
      const f = banco.antesDoUpdate;
      banco.antesDoUpdate = null;
      f();
    }
    banco.ops.push({ modo, payload: structuredClone(payload), filtros: [...filtros] });
    if (banco.erroUpdate) return { data: null, error: banco.erroUpdate };
    const afetadas = banco.imoveis.filter(casa);
    for (const l of afetadas) {
      const antes = l.retirado === true;
      Object.assign(l, payload);
      l.updated_at = novaVersao();
      if (antes && l.retirado !== true) {
        l.retirado_em = null;
        l.retirado_motivo = null;
        l.retirado_observacao = null;
      }
    }
    return { data: devolver ? afetadas.map((l) => ({ id: l.id })) : null, error: null };
  };
  const q: Record<string, unknown> = {};
  const enc = (fn: (...a: never[]) => void) => (...a: never[]) => { fn(...a); return q; };
  Object.assign(q, {
    select: enc(() => { if (modo === "update") devolver = true; }),
    maybeSingle: enc(() => { umaSo = true; }),
    eq: enc((c: string, v: unknown) => filtros.push([c, v])),
    update: enc((p: Linha) => { modo = "update"; payload = p; }),
    insert: enc(() => { modo = "insert"; }),
    then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => executar().then(res, rej),
  });
  return q;
}

vi.mock("@/lib/persistencia/supabase", () => ({ getSupabase: () => ({ from: () => consultaFalsa() }) }));
vi.mock("@/lib/toast", () => ({ toast: (texto: string, tipo?: string) => banco.toasts.push({ texto, tipo }) }));
vi.mock("@/lib/googleAgenda", () => ({ sincronizarCompromisso: async () => ({ ok: true }) }));
vi.mock("@/lib/persistencia/cidadePadrao", () => ({
  carregarCidadePadraoDaConta: async () => ({ origem: "nenhuma", cidade: null, uf: null }),
}));
vi.mock("@/lib/persistencia/carregarEstado", async () => {
  const { fromDbImovel } = await import("@/lib/persistencia/mapeadores");
  const { useAppStore } = await import("@/lib/store");
  return {
    carregarEstado: async () => {
      const atual = useAppStore.getState();
      return {
        imoveis: banco.imoveis.map((l) => fromDbImovel(l as never)),
        agenda: atual.agenda,
        metas: atual.metas,
        abordagens: atual.abordagens,
        protocolos: atual.protocolos,
        config: atual.config,
      };
    },
  };
});
vi.mock("@/components/SessaoProvider", () => ({
  useSessao: () => ({ usuario: { id: "usuario-a" } }),
  captadorPadrao: () => "Corretora",
  rotuloUsuario: () => "Corretora",
}));
vi.mock("@/lib/repasses", () => ({ carregarRepasses: async () => [] }));

import ModalRetirada from "@/components/modais/ModalRetirada";
import { MOTIVOS_RETIRADA } from "@/lib/constantes";
import {
  formatarDataRetirada,
  LIMITE_OBSERVACAO_RETIRADA,
  resumoRetirada,
  rotuloMotivoRetirada,
  tamanhoObservacaoRetirada,
  textoNotaReativacao,
  textoNotaRetirada,
  validarRetirada,
} from "@/lib/calculo/retiradaCarteira";
import { dataOperacionalDeTimestamp } from "@/lib/datas";
import { AVISO_CONFLITO_RETIRADA, definirRetiradoDaCarteira, editarRetiradaDaCarteira } from "@/lib/mutacoes";
import { fromDbImovel, toDbImovel } from "@/lib/persistencia/mapeadores";
import { useAppStore } from "@/lib/store";
import { useUiModal } from "@/lib/uiModal";
import type { Imovel } from "@/lib/tipos";

const USER = "usuario-a";
const ID = "60000000-0000-4000-8000-000000000001";
/** 02/10/2026 às 22:00 em Brasília: em UTC já é 03/10. */
const AS_22H_BRASILIA = Date.UTC(2026, 9, 3, 1, 0, 0);
const HOJE = "2026-10-02";
const IDS = MOTIVOS_RETIRADA.map((m) => m.id);

function imovel(sobre: Partial<Imovel> = {}): Imovel {
  return {
    id: ID,
    codigo: "LD-901",
    endereco: "Rua das Palmeiras, 20",
    bairro: "Centro",
    cidade: "Londrina",
    estado: "PR",
    tipo: "Casa",
    status: "Publicado",
    dataAngariacao: "2026-05-01",
    statusHistory: [
      { status: "Novo contato", date: "2026-05-01" },
      { status: "Angariado", date: "2026-05-20" },
      { status: "Publicado", date: "2026-06-01" },
    ],
    notas: [{ id: "n1", texto: "Proprietária atende de manhã.", data: "2026-05-02T10:00" }],
    tentativas: [],
    proprietarioNome: "Ana",
    proprietarioTelefone: "43999990000",
    motivoPerda: "",
    retirado: false,
    ...sobre,
  };
}

function semear(i: Imovel, banco_: Partial<Linha> = {}): void {
  banco.imoveis = [{ ...(toDbImovel(i, USER) as unknown as Linha), updated_at: novaVersao(), ...banco_ }];
  banco.ops = [];
  banco.toasts = [];
  banco.antesDoUpdate = null;
  banco.segurar = null;
  banco.erroUpdate = null;
  useAppStore.setState({ imoveis: [fromDbImovel(banco.imoveis[0] as never)] });
}
const linha = () => banco.imoveis[0];
const sucessos = () => banco.toasts.filter((t) => t.tipo !== "error");
const erros = () => banco.toasts.filter((t) => t.tipo === "error").map((t) => t.texto);

function abrir(modo: "criar" | "editar"): void {
  useUiModal.getState().abrirRetirada(ID, modo);
  render(createElement(ModalRetirada, { imovelId: ID, modo }));
}
const motivoSelect = () => screen.getByLabelText("Motivo da retirada") as HTMLSelectElement;
const observacaoCampo = () => screen.getByLabelText("Observação") as HTMLTextAreaElement;
const dataCampo = () => screen.getByLabelText("Data da retirada") as HTMLInputElement;
const botao = (nome: string) => screen.getByRole("button", { name: nome }) as HTMLButtonElement;
async function clicar(nome: string): Promise<void> {
  await act(async () => {
    fireEvent.click(botao(nome));
  });
}
function preencher(campo: HTMLElement, valor: string): void {
  fireEvent.change(campo, { target: { value: valor } });
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(AS_22H_BRASILIA);
  useUiModal.getState().fecharModal();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

/* ================================================================
   REGRAS PURAS
   ================================================================ */
describe("validação", () => {
  const ok = { motivo: "vendido", observacao: "", data: HOJE };

  it("criar: motivo é obrigatório", () => {
    expect(validarRetirada({ ...ok, motivo: "" }, "criar", HOJE)).toEqual({ ok: false, erro: "Escolha o motivo da retirada." });
  });

  it.each(IDS)("aceita o motivo %s", (motivo) => {
    const r = validarRetirada({ ...ok, motivo, observacao: motivo === "outro" ? "Explicação" : "" }, "criar", HOJE);
    expect(r).toEqual({ ok: true, dados: { motivo, observacao: motivo === "outro" ? "Explicação" : null, data: HOJE } });
  });

  it("recusa motivo fora da lista, inclusive 'nao-informado'", () => {
    for (const motivo of ["nao-informado", "Vendido", "perdido"]) {
      expect(validarRetirada({ ...ok, motivo }, "criar", HOJE).ok).toBe(false);
      expect(validarRetirada({ ...ok, motivo }, "editar", HOJE).ok).toBe(false);
    }
  });

  it.each([
    ["vazia", ""],
    ["só espaços", "   "],
  ])("'outro' com observação %s é recusado", (_n, observacao) => {
    const r = validarRetirada({ ...ok, motivo: "outro", observacao }, "criar", HOJE);
    expect(r).toEqual({ ok: false, erro: 'Com o motivo "Outro", descreva o que aconteceu na observação.' });
  });

  it("'outro' com texto passa, aparado", () => {
    expect(validarRetirada({ ...ok, motivo: "outro", observacao: "  Saiu do país  " }, "criar", HOJE)).toEqual({
      ok: true,
      dados: { motivo: "outro", observacao: "Saiu do país", data: HOJE },
    });
  });

  it("observação: 1000 caracteres passa, 1001 não (conta caractere, como o banco)", () => {
    expect(validarRetirada({ ...ok, observacao: "x".repeat(1000) }, "criar", HOJE).ok).toBe(true);
    expect(validarRetirada({ ...ok, observacao: "é".repeat(1000) }, "criar", HOJE).ok).toBe(true);
    expect(validarRetirada({ ...ok, observacao: "🏠".repeat(1000) }, "criar", HOJE).ok).toBe(true);
    expect(validarRetirada({ ...ok, observacao: "x".repeat(1001) }, "criar", HOJE)).toEqual({
      ok: false,
      erro: `A observação passa de ${LIMITE_OBSERVACAO_RETIRADA} caracteres.`,
    });
    expect(tamanhoObservacaoRetirada("🏠🏠")).toBe(2);
  });

  it("data futura é recusada; hoje e o passado passam", () => {
    expect(validarRetirada({ ...ok, data: "2026-10-03" }, "criar", HOJE)).toEqual({
      ok: false,
      erro: "A data da retirada não pode ser no futuro.",
    });
    expect(validarRetirada({ ...ok, data: HOJE }, "criar", HOJE).ok).toBe(true);
    expect(validarRetirada({ ...ok, data: "2026-09-21" }, "criar", HOJE).ok).toBe(true);
  });

  it("data inválida é recusada", () => {
    for (const data of ["2026-02-30", "02/10/2026", "2026-13-01"]) {
      expect(validarRetirada({ ...ok, data }, "criar", HOJE).ok).toBe(false);
    }
  });

  it("criar: data é obrigatória; editar: data vazia continua null (legado sem data)", () => {
    expect(validarRetirada({ ...ok, data: "" }, "criar", HOJE)).toEqual({ ok: false, erro: "Informe a data da retirada." });
    expect(validarRetirada({ motivo: "", observacao: "", data: "" }, "editar", HOJE)).toEqual({
      ok: true,
      dados: { motivo: null, observacao: null, data: null },
    });
  });
});

describe("dia de Brasília", () => {
  it("às 22h em Brasília o dia operacional ainda é o de hoje, e o UTC já é amanhã", () => {
    expect(new Date(AS_22H_BRASILIA).toISOString().slice(0, 10)).toBe("2026-10-03");
    expect(dataOperacionalDeTimestamp(AS_22H_BRASILIA)).toBe(HOJE);
  });
});

describe("rótulos e resumo", () => {
  it("rótulo de cada motivo; null e desconhecido viram 'Não informado'", () => {
    expect(rotuloMotivoRetirada("reservado-outra-imobiliaria")).toBe("Reservado por outra imobiliária");
    expect(rotuloMotivoRetirada(null)).toBe("Não informado");
    expect(rotuloMotivoRetirada("nao-informado")).toBe("Não informado");
  });

  it("formata a data civil sem passar por Date (nada de voltar um dia em Brasília)", () => {
    expect(formatarDataRetirada("2026-10-01")).toBe("01/10/2026");
    expect(formatarDataRetirada(null)).toBeNull();
    expect(formatarDataRetirada("lixo")).toBeNull();
  });

  it("resumo nas quatro combinações, sem inventar valor", () => {
    expect(resumoRetirada({ retiradoEm: "2026-10-01", retiradoMotivo: "vendido" })).toBe("Retirado em 01/10/2026 · Motivo: Vendido");
    expect(resumoRetirada({ retiradoEm: null, retiradoMotivo: "vendido" })).toBe("Data não informada · Motivo: Vendido");
    expect(resumoRetirada({ retiradoEm: "2026-10-01", retiradoMotivo: null })).toBe("Retirado em 01/10/2026 · Motivo não informado");
    expect(resumoRetirada({ retiradoEm: null, retiradoMotivo: null })).toBe("Data e motivo não informados.");
  });

  it("texto das notas", () => {
    expect(textoNotaRetirada({ motivo: "outro", observacao: "Saiu do país", data: "2026-10-01" })).toBe(
      "Retirado da carteira em 01/10/2026. Motivo: Outro. Observação: Saiu do país",
    );
    expect(textoNotaReativacao({ retiradoEm: null, retiradoMotivo: null, retiradoObservacao: null })).toBe(
      "Reativado na carteira. Retirada encerrada (sem data informada; motivo: Não informado).",
    );
  });
});

/* ================================================================
   JANELA: CRIAR
   ================================================================ */
describe("janela, nova retirada", () => {
  it("abre com hoje em Brasília (às 22h, não amanhã), sem motivo e sem observação", () => {
    semear(imovel());
    abrir("criar");
    expect(dataCampo().value).toBe(HOJE);
    expect(dataCampo().max).toBe(HOJE);
    expect(motivoSelect().value).toBe("");
    expect(observacaoCampo().value).toBe("");
  });

  it("sem motivo não grava", async () => {
    semear(imovel());
    abrir("criar");
    await clicar("Retirar da carteira");
    expect(banco.ops).toEqual([]);
    expect(screen.getByText("Escolha o motivo da retirada.")).toBeTruthy();
    expect(useUiModal.getState().modal?.tipo).toBe("retiradaCarteira");
  });

  it("'outro' exige observação", async () => {
    semear(imovel());
    abrir("criar");
    preencher(motivoSelect(), "outro");
    await clicar("Retirar da carteira");
    expect(banco.ops).toEqual([]);
    preencher(observacaoCampo(), "Mudou de cidade");
    await clicar("Retirar da carteira");
    expect(banco.ops).toHaveLength(1);
  });

  it("data futura não grava", async () => {
    semear(imovel());
    abrir("criar");
    preencher(motivoSelect(), "vendido");
    preencher(dataCampo(), "2026-10-03");
    await clicar("Retirar da carteira");
    expect(banco.ops).toEqual([]);
    expect(screen.getByText("A data da retirada não pode ser no futuro.")).toBeTruthy();
  });

  it("grava o payload exato, condicionado à versão lida, e fecha", async () => {
    semear(imovel());
    const versao = linha().updated_at;
    abrir("criar");
    preencher(motivoSelect(), "reservado-outra-imobiliaria");
    preencher(observacaoCampo(), "  Reserva da outra imobiliária  ");
    preencher(dataCampo(), "2026-10-01");
    await clicar("Retirar da carteira");

    expect(banco.ops).toHaveLength(1);
    const [op] = banco.ops;
    expect(op.filtros).toEqual([["id", ID], ["retirado", false], ["updated_at", versao]]);
    expect(Object.keys(op.payload!).sort()).toEqual(["notas", "retirado", "retirado_em", "retirado_motivo", "retirado_observacao"]);
    expect(op.payload).toMatchObject({
      retirado: true,
      retirado_em: "2026-10-01",
      retirado_motivo: "reservado-outra-imobiliaria",
      retirado_observacao: "Reserva da outra imobiliária",
    });
    const notas = op.payload!.notas as { texto: string }[];
    expect(notas).toHaveLength(2);
    expect(notas[1].texto).toBe(
      "Retirado da carteira em 01/10/2026. Motivo: Reservado por outra imobiliária. Observação: Reserva da outra imobiliária",
    );
    expect(linha().status).toBe("Publicado");
    expect(useUiModal.getState().modal).toBeNull();
    expect(sucessos().map((t) => t.texto)).toEqual(["Imóvel retirado da carteira. Ele está na aba Retirados."]);
  });

  it("enquanto grava, os botões ficam desabilitados e mostram 'Salvando…'", async () => {
    semear(imovel());
    let soltar: () => void = () => {};
    banco.segurar = new Promise<void>((r) => { soltar = r; });
    abrir("criar");
    preencher(motivoSelect(), "vendido");
    await clicar("Retirar da carteira");
    expect(botao("Salvando…").disabled).toBe(true);
    expect(botao("Cancelar").disabled).toBe(true);
    await act(async () => { soltar(); });
    expect(useUiModal.getState().modal).toBeNull();
  });

  it("Cancelar não grava e volta ao cadastro do imóvel", async () => {
    semear(imovel());
    abrir("criar");
    preencher(motivoSelect(), "vendido");
    await clicar("Cancelar");
    expect(banco.ops).toEqual([]);
    expect(useUiModal.getState().modal).toEqual({ tipo: "imovel", id: ID });
  });

  it("imóvel que já está retirado não deixa criar: aviso e botão desabilitado", () => {
    semear(imovel({ retirado: true }));
    abrir("criar");
    expect(botao("Retirar da carteira").disabled).toBe(true);
    expect(document.querySelector("[data-retirada-estado-invalido]")).not.toBeNull();
  });

  it("erro do banco mantém a janela aberta e não mostra sucesso", async () => {
    semear(imovel());
    banco.erroUpdate = { message: "falha de rede" };
    abrir("criar");
    preencher(motivoSelect(), "vendido");
    await clicar("Retirar da carteira");
    expect(useUiModal.getState().modal?.tipo).toBe("retiradaCarteira");
    expect(sucessos()).toEqual([]);
    expect(erros()[0]).toContain("falha de rede");
  });
});

/* ================================================================
   JANELA: EDITAR
   ================================================================ */
describe("janela, editar retirada", () => {
  it("preenche com os valores gravados", () => {
    semear(imovel({ retirado: true, retiradoEm: "2026-09-21", retiradoMotivo: "outro", retiradoObservacao: "Mudou" }), {
      retirado_em: "2026-09-21",
      retirado_motivo: "outro",
      retirado_observacao: "Mudou",
    });
    abrir("editar");
    expect(motivoSelect().value).toBe("outro");
    expect(observacaoCampo().value).toBe("Mudou");
    expect(dataCampo().value).toBe("2026-09-21");
  });

  it("legado sem data continua sem data na tela: nada de hoje", () => {
    semear(imovel({ retirado: true }));
    abrir("editar");
    expect(dataCampo().value).toBe("");
    expect(motivoSelect().value).toBe("");
    expect(motivoSelect().options[0].text).toBe("Não informado");
  });

  it("salvar o legado com só o motivo grava as três colunas, a data continua null", async () => {
    semear(imovel({ retirado: true }));
    abrir("editar");
    preencher(motivoSelect(), "reservado-outra-imobiliaria");
    await clicar("Salvar retirada");
    expect(banco.ops).toHaveLength(1);
    const [op] = banco.ops;
    expect(op.payload).toEqual({
      retirado_em: null,
      retirado_motivo: "reservado-outra-imobiliaria",
      retirado_observacao: null,
    });
    expect(op.filtros).toEqual([["id", ID], ["retirado", true]]);
    expect(linha()).toMatchObject({ retirado: true, status: "Publicado", retirado_em: null });
    expect(useUiModal.getState().modal).toEqual({ tipo: "imovel", id: ID });
  });

  it("0 linhas (o imóvel foi reativado no meio): sem sucesso e a janela continua", async () => {
    semear(imovel({ retirado: true }));
    abrir("editar");
    banco.imoveis[0].retirado = false; // outra aba reativou
    preencher(motivoSelect(), "vendido");
    await clicar("Salvar retirada");
    expect(erros()).toEqual([AVISO_CONFLITO_RETIRADA]);
    expect(sucessos()).toEqual([]);
    expect(useUiModal.getState().modal?.tipo).toBe("retiradaCarteira");
  });

  it("erro do banco mantém a janela aberta", async () => {
    semear(imovel({ retirado: true }));
    banco.erroUpdate = { message: "check violado" };
    abrir("editar");
    preencher(motivoSelect(), "vendido");
    await clicar("Salvar retirada");
    expect(useUiModal.getState().modal?.tipo).toBe("retiradaCarteira");
    expect(sucessos()).toEqual([]);
  });
});

/* ================================================================
   GRAVAÇÕES
   ================================================================ */
describe("gravação: retirar", () => {
  const DADOS = { motivo: "vendido" as const, observacao: null, data: HOJE };

  it("0 linhas é conflito: nada no store e nenhum sucesso", async () => {
    semear(imovel());
    banco.antesDoUpdate = () => { banco.imoveis[0].updated_at = novaVersao(); };
    expect(await definirRetiradoDaCarteira(ID, true, USER, DADOS)).toBe(false);
    expect(erros()).toEqual([AVISO_CONFLITO_RETIRADA]);
    expect(sucessos()).toEqual([]);
    expect(useAppStore.getState().imoveis[0].retirado).toBe(false);
  });

  it("imóvel que o banco já tem como retirado: nem tenta gravar", async () => {
    semear(imovel());
    banco.imoveis[0].retirado = true;
    expect(await definirRetiradoDaCarteira(ID, true, USER, DADOS)).toBe(false);
    expect(banco.ops).toEqual([]);
    expect(erros()).toEqual([AVISO_CONFLITO_RETIRADA]);
  });

  it("fail-closed: sem dados, ou com dados inválidos, nada é escrito", async () => {
    semear(imovel());
    const semDados = definirRetiradoDaCarteira as unknown as (id: string, r: boolean, u: string) => Promise<boolean>;
    expect(await semDados(ID, true, USER)).toBe(false);
    expect(await definirRetiradoDaCarteira(ID, true, USER, { motivo: "outro", observacao: "  ", data: HOJE })).toBe(false);
    expect(await definirRetiradoDaCarteira(ID, true, USER, { motivo: "vendido", observacao: null, data: "2026-10-03" })).toBe(false);
    expect(
      await definirRetiradoDaCarteira(ID, true, USER, { motivo: "nao-informado" as never, observacao: null, data: HOJE }),
    ).toBe(false);
    expect(banco.ops).toEqual([]);
  });
});

describe("gravação: editar e reativar", () => {
  it("editar só mexe nas três colunas e só se continuar retirado", async () => {
    semear(imovel({ retirado: true }));
    expect(await editarRetiradaDaCarteira(ID, { motivo: "vendido", observacao: null, data: "2026-09-21" })).toBe(true);
    expect(Object.keys(banco.ops[0].payload!).sort()).toEqual(["retirado_em", "retirado_motivo", "retirado_observacao"]);
    expect(banco.ops[0].filtros).toEqual([["id", ID], ["retirado", true]]);
  });

  it("editar em imóvel que não está retirado não grava", async () => {
    semear(imovel());
    expect(await editarRetiradaDaCarteira(ID, { motivo: "vendido", observacao: null, data: null })).toBe(false);
    expect(banco.ops).toEqual([]);
  });

  it("reativar: só se retirado, com a versão lida, e o banco apaga os dados", async () => {
    semear(imovel({ retirado: true }), { retirado_em: "2026-09-21", retirado_motivo: "vendido" });
    const versao = linha().updated_at;
    expect(await definirRetiradoDaCarteira(ID, false, USER)).toBe(true);
    expect(banco.ops[0].filtros).toEqual([["id", ID], ["retirado", true], ["updated_at", versao]]);
    expect(linha()).toMatchObject({ retirado: false, retirado_em: null, retirado_motivo: null });
    const nota = (linha().notas as { texto: string }[]).at(-1)!;
    expect(nota.texto).toBe("Reativado na carteira. Retirada encerrada (de 21/09/2026; motivo: Vendido).");
  });
});

describe("D4: concorrência sem perda", () => {
  const notaDoWebhook = { id: "wa:MSG-CONCORRENTE", texto: "Resposta pelo WhatsApp: ainda está disponível?", data: "2026-10-02T21:59" };

  it("retirar: uma nota concorrente entre a leitura e a gravação faz a retirada não ser aplicada, e a nota fica", async () => {
    semear(imovel());
    const lida = linha().updated_at;
    // 1. a retirada lê a versão X; 2. o webhook grava uma nota (versão Y).
    banco.antesDoUpdate = () => {
      banco.imoveis[0].notas = [...(banco.imoveis[0].notas as unknown[]), notaDoWebhook];
      banco.imoveis[0].updated_at = novaVersao();
    };
    // 3. a retirada tenta com WHERE updated_at = X.
    expect(await definirRetiradoDaCarteira(ID, true, USER, { motivo: "vendido", observacao: null, data: HOJE })).toBe(false);
    expect(banco.ops[0].filtros).toContainEqual(["updated_at", lida]);
    // 4. 0 linhas; 5. a nota concorrente continua lá; 6. nada da retirada foi aplicado.
    expect(linha().notas).toContainEqual(notaDoWebhook);
    expect(linha()).toMatchObject({ retirado: false });
    expect(linha().retirado_motivo ?? null).toBeNull();
    expect((linha().notas as { texto: string }[]).some((n) => n.texto.startsWith("Retirado da carteira"))).toBe(false);
    expect(erros()).toEqual([AVISO_CONFLITO_RETIRADA]);
  });

  it("reativar: a mesma garantia", async () => {
    semear(imovel({ retirado: true }), { retirado_motivo: "vendido" });
    banco.antesDoUpdate = () => {
      banco.imoveis[0].notas = [...(banco.imoveis[0].notas as unknown[]), notaDoWebhook];
      banco.imoveis[0].updated_at = novaVersao();
    };
    expect(await definirRetiradoDaCarteira(ID, false, USER)).toBe(false);
    expect(linha().notas).toContainEqual(notaDoWebhook);
    expect(linha()).toMatchObject({ retirado: true, retirado_motivo: "vendido" });
  });
});

/* ================================================================
   FRONTEIRAS
   ================================================================ */
describe("fronteiras", () => {
  const raiz = resolve(".");
  const arquivos = ["app", "components", "lib"].flatMap((pasta) =>
    (readdirSync(join(raiz, pasta), { recursive: true }) as string[])
      .filter((f) => /\.(ts|tsx)$/.test(f))
      .map((f) => join(pasta, f).replace(/\\/g, "/")),
  );
  const ler = (f: string) => readFileSync(join(raiz, f), "utf8").replace(/\r\n/g, "\n");
  const semComentarios = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");

  it("só mutacoes.ts escreve as colunas da retirada; o mapeador só lê", () => {
    const usam = arquivos.filter((f) => /retirado_(em|motivo|observacao)\b/.test(semComentarios(ler(f))));
    expect(usam.sort()).toEqual(["lib/mutacoes.ts", "lib/persistencia/mapeadores.ts"]);
    const mapeador = semComentarios(ler("lib/persistencia/mapeadores.ts"));
    const toDb = mapeador.slice(mapeador.indexOf("export function toDbImovel"), mapeador.indexOf("export function fromDbImovel"));
    expect(toDb).not.toMatch(/retirado_(em|motivo|observacao)/);
  });

  it("webhook, IA, assistente e Sophia não gravam a retirada", () => {
    const proibidos = arquivos.filter((f) =>
      /^(app\/api\/(whatsapp|sophia|ia|assistente)|lib\/servidor|lib\/ia)\//.test(f),
    );
    for (const f of proibidos) {
      const t = semComentarios(ler(f));
      expect(t, f).not.toMatch(/retirado_(em|motivo|observacao)|definirRetiradoDaCarteira|editarRetiradaDaCarteira/);
    }
  });

  it("a janela só nasce pelo ModalOverlay e só o ModalImovel a abre", () => {
    expect(arquivos.filter((f) => ler(f).includes("<ModalRetirada"))).toEqual(["components/modais/ModalOverlay.tsx"]);
    const abre = arquivos.filter((f) => /\babrirRetirada\(/.test(semComentarios(ler(f))));
    expect(abre).toEqual(["components/modais/ModalImovel.tsx"]);
  });

  it("a janela e as regras usam o dia de Brasília, nunca o todayISO em UTC", () => {
    for (const f of ["components/modais/ModalRetirada.tsx", "lib/calculo/retiradaCarteira.ts"]) {
      expect(semComentarios(ler(f)), f).not.toContain("todayISO");
    }
    const mut = semComentarios(ler("lib/mutacoes.ts"));
    const trecho = mut.slice(mut.indexOf("export function definirRetiradoDaCarteira"), mut.indexOf("/** Cria ou atualiza uma abordagem"));
    expect(trecho).not.toContain("todayISO");
    expect(trecho).toContain("dataOperacionalDeTimestamp(agoraTimestamp())");
  });
});
