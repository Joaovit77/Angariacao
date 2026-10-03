// @vitest-environment jsdom

/* ================================================================
   RETIRADO, FASE A: retirar da carteira sem virar status

   `retirado` é a marca de uma captação GANHA que depois saiu da
   carteira. Não é "Perdido" (captação falhou) nem "Locado" (negócio
   nosso). O que se prova aqui:

   A. Preservação: editar um imóvel retirado pelo modal não o devolve
      à carteira ativa (o modal carrega a marca e o `salvarImovel` tem
      rede para quem não a conhece).
   B. Pipeline: retirado sai de Lista/Kanban e vive em Retirados;
      reativado volta à coluna do status que já tinha.
   C. Histórico: retirar e reativar escrevem SÓ a coluna `retirado`.
   D. Disponibilidade: o cliente não cria verificação para retirado; o
      encerramento das abertas continua sendo do trigger M3/M4.
   E/F. Mensagem livre e atribuição continuam tratando retirado como
      fora da carteira (regressão das regras existentes, sem mudá-las).
   G. Métricas: a marca não muda nenhuma conta.

   O banco é falso, em memória. O trigger M3/M4 é IMITADO no update de
   `imoveis` para provar que o cliente relê o que o banco decidiu; o
   comportamento real do trigger está no teste de integração
   (`integration/disponibilidade-supabase-local.test.ts`) e o contrato
   do SQL é conferido estruturalmente no fim deste arquivo.
   ================================================================ */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Linha = Record<string, unknown>;
interface Operacao {
  tabela: string;
  modo: "insert" | "update" | "upsert" | "delete";
  payload: Linha | null;
  filtros: [string, unknown][];
}

const banco = vi.hoisted(() => ({
  tabelas: {} as Record<string, Record<string, unknown>[]>,
  ops: [] as {
    tabela: string;
    modo: "insert" | "update" | "upsert" | "delete";
    payload: Record<string, unknown> | null;
    filtros: [string, unknown][];
  }[],
  recargas: 0,
  /** `retirado` que o ModalImovel entregou ao salvarImovel, ANTES da rede. */
  retiradoEntregueAoSalvar: [] as unknown[],
}));

/** Versão de linha que muda a cada escrita, como o `trg_imoveis_updated_at`
    (que carimba `now()` em TODO update de `imoveis`). */
let relogioVersao = 0;
const novaVersao = () => `2026-09-30T12:00:00.${String(++relogioVersao).padStart(6, "0")}+00:00`;

function consultaFalsa(tabela: string) {
  const filtros: [string, unknown][] = [];
  let modo: Operacao["modo"] | "select" = "select";
  let payload: Linha | null = null;
  let devolverLinhas = false;
  let umaSo = false;
  const casa = (linha: Linha) =>
    filtros.every(([c, v]) => (Array.isArray(v) ? v.includes(linha[c]) : linha[c] === v));
  const executar = () => {
    const linhas = banco.tabelas[tabela] ?? [];
    if (modo === "select") {
      const achadas = linhas.filter(casa).map((l) => structuredClone(l));
      return { data: umaSo ? achadas[0] ?? null : achadas, error: null };
    }
    banco.ops.push({ tabela, modo, payload: payload ? structuredClone(payload) : null, filtros: [...filtros] });
    let afetadas: Linha[] = [];
    if (modo === "upsert" && payload) {
      // Postgres: no conflito, o upsert atualiza só as colunas do payload.
      const existente = linhas.find((l) => l.id === payload!.id);
      if (existente) {
        Object.assign(existente, payload);
        if (tabela === "imoveis") existente.updated_at = novaVersao();
      } else {
        banco.tabelas[tabela] = [...linhas, { ...payload, ...(tabela === "imoveis" ? { updated_at: novaVersao() } : {}) }];
      }
    } else if (modo === "insert" && payload) {
      banco.tabelas[tabela] = [...linhas, { ...payload }];
    } else if (modo === "delete") {
      banco.tabelas[tabela] = linhas.filter((l) => !casa(l));
    } else if (modo === "update" && payload) {
      afetadas = linhas.filter(casa);
      for (const linha of afetadas) {
        const antes = linha.retirado === true;
        Object.assign(linha, payload);
        if (tabela === "imoveis") {
          linha.updated_at = novaVersao();
          // Imitação do `trg_retirada_dados_imovel` (C1): reativar apaga os
          // dados da retirada.
          if (antes && linha.retirado !== true) {
            linha.retirado_em = null;
            linha.retirado_motivo = null;
            linha.retirado_observacao = null;
          }
        }
        // Imitação do `trg_transicao_disponibilidade_imovel` (M3/M4): retirado
        // que acabou de virar true encerra os lembretes de disponibilidade.
        if (tabela === "imoveis" && linha.retirado === true && !antes) {
          banco.tabelas.agenda = (banco.tabelas.agenda ?? []).filter(
            (a) => !(a.imovel_id === linha.id && a.is_verificacao_disponibilidade && !a.done),
          );
        }
      }
    }
    return { data: devolverLinhas ? afetadas.map((l) => ({ id: l.id })) : null, error: null };
  };
  const construtor: Record<string, unknown> = {};
  const encadear = (fn: (...args: never[]) => void) => (...args: never[]) => {
    fn(...args);
    return construtor;
  };
  Object.assign(construtor, {
    // `.select()` depois de um update pede as linhas afetadas de volta.
    select: encadear(() => { if (modo !== "select") devolverLinhas = true; }),
    maybeSingle: encadear(() => { umaSo = true; }),
    order: encadear(() => {}),
    eq: encadear((c: string, v: unknown) => filtros.push([c, v])),
    in: encadear((c: string, v: unknown[]) => filtros.push([c, v])),
    insert: encadear((p: Linha) => { modo = "insert"; payload = p; }),
    update: encadear((p: Linha) => { modo = "update"; payload = p; }),
    upsert: encadear((p: Linha) => { modo = "upsert"; payload = p; }),
    delete: encadear(() => { modo = "delete"; }),
    then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(executar()).then(res, rej),
  });
  return construtor;
}

vi.mock("@/lib/persistencia/supabase", () => ({ getSupabase: () => ({ from: consultaFalsa }) }));
vi.mock("@/lib/googleAgenda", () => ({ sincronizarCompromisso: async () => ({ ok: true }) }));
vi.mock("@/lib/persistencia/cidadePadrao", () => ({
  carregarCidadePadraoDaConta: async () => ({ origem: "nenhuma", cidade: null, uf: null }),
}));
// O estado recarregado é o que está no banco falso, pelos mapeadores reais.
vi.mock("@/lib/persistencia/carregarEstado", async () => {
  const { fromDbAgenda, fromDbImovel } = await import("@/lib/persistencia/mapeadores");
  const { useAppStore } = await import("@/lib/store");
  return {
    carregarEstado: async () => {
      banco.recargas++;
      const atual = useAppStore.getState();
      return {
        imoveis: (banco.tabelas.imoveis ?? []).map((l) => fromDbImovel(l as never)),
        agenda: (banco.tabelas.agenda ?? []).map((l) => fromDbAgenda(l as never)),
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
vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
// O salvarImovel é o REAL; só se anota o que o modal entregou a ele, antes de
// a rede de segurança agir. É o que separa as duas defesas nos testes.
vi.mock("@/lib/mutacoes", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/mutacoes")>();
  return {
    ...real,
    salvarImovel: (data: import("@/lib/tipos").Imovel, ...resto: [string, boolean]) => {
      banco.retiradoEntregueAoSalvar.push(data.retirado);
      return real.salvarImovel(data, ...resto);
    },
  };
});

import ModalImovel from "@/components/modais/ModalImovel";
import { imovelBloqueiaMensagemLivre } from "@/lib/calculo/mensagemLivreImovel";
import { ehImovelTerminalParaAtribuicao } from "@/lib/calculo/atribuicaoMensagem";
import { filtrarImoveis, filtrosPipelineVazios, pipelineColFiltersVazios, type PipelineViewMode } from "@/lib/calculo/filtros";
import {
  captacaoGanha,
  conversaoCaptacao,
  ehPerdaDecidida,
  foiAngariado,
  foiLocado,
  imoveisAngariadosNoMes,
  metricsForRange,
} from "@/lib/calculo/motor";
import { relatorioMensal } from "@/lib/calculo/relatorios";
import { podeReativarNaCarteira, podeRetirarDaCarteira } from "@/lib/calculo/retiradaCarteira";
import { definirRetiradoDaCarteira, salvarImovel } from "@/lib/mutacoes";
import { selecionarVerificacaoDisponibilidade } from "@/lib/calculo/followup";
import { fromDbImovel, toDbAgenda, toDbImovel } from "@/lib/persistencia/mapeadores";
import { useAppStore } from "@/lib/store";
import { useUiModal } from "@/lib/uiModal";
import type { AgendaItem, Imovel, Tentativa } from "@/lib/tipos";

const USER = "usuario-a";
const ID = "40000000-0000-4000-8000-000000000001";
const RAIZ = resolve(".");
const lerRepo = (caminho: string) => readFileSync(resolve(RAIZ, "..", caminho), "utf8").replace(/\r\n/g, "\n");

/** Desde o C2, retirar exige os dados da retirada. */
const DADOS = { motivo: "locado-proprietario" as const, observacao: null, data: "2026-09-20" };

const HISTORICO_CAPTADO = [
  { status: "Novo contato", date: "2026-05-01" },
  { status: "Angariado", date: "2026-05-20" },
  { status: "Publicado", date: "2026-06-01" },
];

function imovelCaptado(sobre: Partial<Imovel> = {}): Imovel {
  return {
    id: ID,
    codigo: "LD-900",
    endereco: "Rua das Flores, 10",
    bairro: "Centro",
    cidade: "Londrina",
    estado: "PR",
    tipo: "Casa",
    status: "Publicado",
    dataAngariacao: "2026-05-01",
    statusHistory: HISTORICO_CAPTADO.map((h) => ({ ...h })),
    notas: [{ id: "n1", texto: "Proprietário atende à tarde.", data: "2026-05-02T10:00" }],
    tentativas: [{ id: "t1", data: "2026-05-03T09:00", resultado: "respondeu" } as Tentativa],
    textoAnuncio: "Casa com quintal, 3 quartos.",
    autorizacaoAssinadaEm: "2026-05-25",
    contratoNumero: null,
    proprietarioNome: "Maria",
    proprietarioTelefone: "43999990000",
    observacoes: "Chave com o vizinho.",
    motivoPerda: "",
    retirado: false,
    ...sobre,
  };
}

function verificacaoAberta(imovelId = ID): AgendaItem {
  return {
    id: "50000000-0000-4000-8000-000000000001",
    title: "Verificar disponibilidade — LD-900",
    type: "Follow-up",
    date: "2026-07-30",
    imovelId,
    notes: null,
    done: false,
    isVerificacaoDisponibilidade: true,
  };
}

/** Semeia banco e store com o mesmo retrato, como depois de um carregamento. */
function semear(imoveis: Imovel[], agenda: AgendaItem[] = []): void {
  banco.tabelas = {
    imoveis: imoveis.map((i) => ({ ...(toDbImovel(i, USER) as unknown as Linha), updated_at: novaVersao() })),
    agenda: agenda.map((a) => toDbAgenda(a, USER) as unknown as Linha),
  };
  banco.ops = [];
  banco.recargas = 0;
  banco.retiradoEntregueAoSalvar = [];
  useAppStore.setState({ imoveis: structuredClone(imoveis), agenda: structuredClone(agenda) });
}

/** O imóvel como sai do banco pelos mapeadores reais (a recarga normaliza campos). */
const semMarca = (i: Imovel): Imovel => {
  const copia = { ...i };
  delete copia.retirado;
  return copia;
};
const fromDbImovelDoBanco = (i: Imovel) => semMarca(fromDbImovel(toDbImovel(i, USER) as never));
const linhaNoBanco = () => banco.tabelas.imoveis.find((l) => l.id === ID)!;
const imovelNoStore = () => useAppStore.getState().imoveis.find((i) => i.id === ID)!;
const verificacoesNoStore = () =>
  useAppStore.getState().agenda.filter((a) => a.imovelId === ID && a.isVerificacaoDisponibilidade && !a.done);
const escritas = (tabela: string, modo?: Operacao["modo"]) =>
  banco.ops.filter((o) => o.tabela === tabela && (!modo || o.modo === modo));
const filtra = (lista: Imovel[], modo: PipelineViewMode) =>
  filtrarImoveis(lista, filtrosPipelineVazios(), modo, pipelineColFiltersVazios()).map((i) => i.id);

function abrirModal(): void {
  render(createElement(ModalImovel, { id: ID }));
}
const botao = (nome: string) => screen.queryByRole("button", { name: nome });
function campo(rotulo: string): HTMLInputElement | HTMLTextAreaElement {
  const label = [...document.querySelectorAll("label")].find((l) => l.textContent === rotulo)!;
  return label.parentElement!.querySelector("input, textarea")!;
}
async function clicar(nome: string): Promise<void> {
  await act(async () => {
    fireEvent.click(botao(nome)!);
  });
}

beforeEach(() => {
  vi.restoreAllMocks();
  vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("rede desligada no teste"); }));
  useUiModal.getState().fecharModal();
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

/* ================================================================
   A. PRESERVAÇÃO
   ================================================================ */
describe("A. editar um imóvel retirado não o devolve à carteira ativa", () => {
  it.each([
    ["telefone", "Telefone", "43988887777"],
    ["observação", "Observações", "Proprietário mudou de cidade."],
    ["bairro do endereço", "Bairro", "Gleba Palhano"],
  ])("pelo ModalImovel, editando o %s", async (_, rotulo, valor) => {
    semear([imovelCaptado({ retirado: true })]);
    abrirModal();
    fireEvent.change(campo(rotulo), { target: { value: valor } });
    await clicar("Salvar alterações");

    // A primeira defesa: o próprio modal carrega a marca.
    expect(banco.retiradoEntregueAoSalvar).toEqual([true]);
    expect(escritas("imoveis", "upsert")).toHaveLength(1);
    expect(linhaNoBanco().retirado).toBe(true);
    expect(imovelNoStore().retirado).toBe(true);
  });

  it("o endereço editado também preserva a marca", async () => {
    semear([imovelCaptado({ retirado: true })]);
    abrirModal();
    const endereco = [...document.querySelectorAll("label")]
      .find((l) => l.textContent === "Endereço")!
      .parentElement!.querySelector("input")!;
    fireEvent.change(endereco, { target: { value: "Rua das Flores, 12" } });
    await clicar("Salvar alterações");
    expect(linhaNoBanco()).toMatchObject({ endereco: "Rua das Flores, 12", retirado: true });
  });

  it("imóvel ativo continua ativo depois de editado", async () => {
    semear([imovelCaptado({ retirado: false })]);
    abrirModal();
    fireEvent.change(campo("Telefone"), { target: { value: "43988887777" } });
    await clicar("Salvar alterações");
    expect(banco.retiradoEntregueAoSalvar).toEqual([false]);
    expect(linhaNoBanco().retirado).toBe(false);
  });

  it("rede do salvarImovel: quem não conhece o campo não apaga a marca", async () => {
    semear([imovelCaptado({ retirado: true })]);
    const semOCampo: Imovel = { ...imovelCaptado(), proprietarioTelefone: "43911112222" };
    delete semOCampo.retirado;
    await salvarImovel(semOCampo, USER, false);
    expect(linhaNoBanco()).toMatchObject({ proprietario_telefone: "43911112222", retirado: true });
    expect(imovelNoStore().retirado).toBe(true);
  });

  it("a rede só repõe `undefined`: `false` explícito continua valendo", async () => {
    semear([imovelCaptado({ retirado: true })]);
    await salvarImovel({ ...imovelCaptado(), retirado: false }, USER, false);
    expect(linhaNoBanco().retirado).toBe(false);
  });
});

/* ================================================================
   AÇÃO: elegibilidade, retirar, reativar
   ================================================================ */
describe("elegibilidade de 'Retirar da carteira'", () => {
  it.each(["Angariado", "Autorização assinada", "Publicado"])("captado em %s: pode retirar", (status) => {
    expect(podeRetirarDaCarteira(imovelCaptado({ status }))).toBe(true);
  });

  it("Autorização assinada sem Angariado no histórico também é captação ganha", () => {
    expect(podeRetirarDaCarteira(imovelCaptado({ status: "Autorização assinada", statusHistory: [] }))).toBe(true);
  });

  it("lead que nunca foi captado não recebe a ação (a saída dele é Perdido)", () => {
    for (const status of ["Novo contato", "Visita agendada", "Em negociação", "Documentação"]) {
      expect(podeRetirarDaCarteira(imovelCaptado({ status, statusHistory: [{ status: "Novo contato", date: "2026-05-01" }] }))).toBe(false);
    }
  });

  it("Locado não é retirável: retirar não desfaz locação", () => {
    expect(podeRetirarDaCarteira(imovelCaptado({ status: "Locado" }))).toBe(false);
  });

  it("casos ambíguos ficam bloqueados: encerrado por outro caminho ou regredido de etapa", () => {
    for (const status of ["Perdido", "Cancelado", "Sem resposta", "Documentação"]) {
      expect(podeRetirarDaCarteira(imovelCaptado({ status }))).toBe(false);
    }
  });

  it("já retirado não oferece retirar de novo, só reativar", () => {
    const i = imovelCaptado({ retirado: true });
    expect(podeRetirarDaCarteira(i)).toBe(false);
    expect(podeReativarNaCarteira(i)).toBe(true);
    expect(podeReativarNaCarteira(imovelCaptado())).toBe(false);
  });

  it("o modal mostra cada botão só onde ele vale", () => {
    semear([imovelCaptado()]);
    abrirModal();
    expect(botao("Retirar da carteira")).not.toBeNull();
    expect(botao("Reativar imóvel")).toBeNull();
    cleanup();

    semear([imovelCaptado({ retirado: true })]);
    abrirModal();
    expect(botao("Retirar da carteira")).toBeNull();
    expect(botao("Reativar imóvel")).not.toBeNull();
    expect(document.querySelector("[data-imovel-retirado]")).not.toBeNull();
    cleanup();

    semear([imovelCaptado({ status: "Locado" })]);
    abrirModal();
    expect(botao("Retirar da carteira")).toBeNull();
    cleanup();

    semear([imovelCaptado({ status: "Novo contato", statusHistory: [{ status: "Novo contato", date: "2026-05-01" }] })]);
    abrirModal();
    expect(botao("Retirar da carteira")).toBeNull();
  });
});

describe("C. retirar da carteira escreve a marca e os dados da retirada", () => {
  // Retirados C2 (mudança declarada): o confirm() deu lugar à janela de
  // retirada, que pede motivo, data e observação. O botão só ABRE a janela;
  // a gravação é dela (ver tests/retirados-c2-retirada.test.ts).
  it("o botão abre a janela de retirada, sem confirm() e sem escrever nada", async () => {
    semear([imovelCaptado()]);
    const confirmar = vi.spyOn(window, "confirm");
    abrirModal();
    await clicar("Retirar da carteira");
    expect(confirmar).not.toHaveBeenCalled();
    expect(useUiModal.getState().modal).toEqual({ tipo: "retiradaCarteira", id: ID, modoRetirada: "criar" });
    expect(banco.ops).toEqual([]);
    expect(imovelNoStore().retirado).toBe(false);
  });

  it("retirar: UM update condicional com marca, dados e nota; status, histórico e dados ficam", async () => {
    const original = imovelCaptado();
    semear([original]);
    const versao = linhaNoBanco().updated_at;
    expect(await definirRetiradoDaCarteira(ID, true, USER, DADOS)).toBe(true);

    const [escrita, ...resto] = escritas("imoveis");
    expect(resto).toEqual([]);
    expect(escrita.modo).toBe("update");
    expect(escrita.filtros).toEqual([["id", ID], ["retirado", false], ["updated_at", versao]]);
    expect(Object.keys(escrita.payload!).sort()).toEqual(
      ["notas", "retirado", "retirado_em", "retirado_motivo", "retirado_observacao"],
    );
    expect(escrita.payload).toMatchObject({
      retirado: true,
      retirado_em: "2026-09-20",
      retirado_motivo: "locado-proprietario",
      retirado_observacao: null,
    });
    const notas = escrita.payload!.notas as Imovel["notas"];
    expect(notas!.slice(0, -1)).toEqual(original.notas);
    expect(notas!.at(-1)!.texto).toBe("Retirado da carteira em 20/09/2026. Motivo: Locado pelo proprietário.");

    const depois = imovelNoStore();
    expect(depois.retirado).toBe(true);
    expect(depois).toMatchObject({ retiradoEm: "2026-09-20", retiradoMotivo: "locado-proprietario", retiradoObservacao: null });
    expect(depois.status).toBe("Publicado");
    expect(depois.statusHistory).toEqual(HISTORICO_CAPTADO);
    expect(depois.statusHistory!.some((h) => h.status === "Perdido" || h.status === "Retirado")).toBe(false);
    expect(depois.tentativas).toEqual(original.tentativas);
    expect(depois.textoAnuncio).toBe(original.textoAnuncio);
    expect(depois.autorizacaoAssinadaEm).toBe(original.autorizacaoAssinadaEm);
    expect(depois.motivoPerda || "").toBe("");
    expect(depois.comissaoRecebida).toBeFalsy();
    expect(foiAngariado(depois)).toBe(true);
  });

  it("sem a ação ser elegível, a mutação recusa e não escreve", async () => {
    semear([imovelCaptado({ status: "Locado" })]);
    expect(await definirRetiradoDaCarteira(ID, true, USER, DADOS)).toBe(false);
    semear([imovelCaptado({ status: "Novo contato", statusHistory: [] })]);
    expect(await definirRetiradoDaCarteira(ID, true, USER, DADOS)).toBe(false);
    expect(banco.ops).toEqual([]);
  });
});

describe("C. reativar desfaz só a marca", () => {
  it("volta ao status que já tinha, sem status novo, histórico novo ou mensagem", async () => {
    const retirado = imovelCaptado({ retirado: true, status: "Angariado", statusHistory: HISTORICO_CAPTADO.slice(0, 2) });
    semear([retirado]);
    const versao = linhaNoBanco().updated_at;
    const confirmar = vi.spyOn(window, "confirm").mockReturnValue(true);
    abrirModal();
    await clicar("Reativar imóvel");

    expect(confirmar.mock.calls[0][0]).toContain("status que já tem (Angariado)");
    expect(confirmar.mock.calls[0][0]).toContain("A data e o motivo da retirada serão apagados.");
    const [escrita, ...resto] = escritas("imoveis");
    expect(resto).toEqual([]);
    expect(escrita.filtros).toEqual([["id", ID], ["retirado", true], ["updated_at", versao]]);
    // Só a marca e a nota da reativação; os dados da retirada o banco apaga (C1).
    expect(Object.keys(escrita.payload!).sort()).toEqual(["notas", "retirado"]);
    expect(escrita.payload!.retirado).toBe(false);
    expect((escrita.payload!.notas as Imovel["notas"])!.at(-1)!.texto).toMatch(/^Reativado na carteira\./);
    // Além da marca, só o lembrete de disponibilidade que a reconciliação
    // cria (ver H). Nenhuma mensagem.
    expect(banco.ops.map((o) => o.tabela)).toEqual(["imoveis", "agenda"]);
    expect(escritas("mensagens_agendadas")).toEqual([]);
    const depois = imovelNoStore();
    expect(depois).toMatchObject({ retirado: false, status: "Angariado" });
    expect(depois.statusHistory).toEqual(HISTORICO_CAPTADO.slice(0, 2));
  });

  it("reativa mesmo registro antigo que só existe em Retirados (Locado vindo do CRM)", async () => {
    semear([imovelCaptado({ retirado: true, status: "Locado" })]);
    expect(await definirRetiradoDaCarteira(ID, false, USER)).toBe(true);
    expect(imovelNoStore()).toMatchObject({ retirado: false, status: "Locado" });
  });
});

/* ================================================================
   B. PIPELINE
   ================================================================ */
describe("B. Pipeline: Lista, Kanban e Retirados", () => {
  it("retirado sai de Lista e Kanban e aparece em Retirados; reativado volta à coluna do status", async () => {
    semear([imovelCaptado()]);
    expect(filtra(useAppStore.getState().imoveis, "lista")).toEqual([ID]);

    await definirRetiradoDaCarteira(ID, true, USER, DADOS);
    const retirados = useAppStore.getState().imoveis;
    expect(filtra(retirados, "lista")).toEqual([]);
    expect(filtra(retirados, "kanban")).toEqual([]);
    expect(filtra(retirados, "retirados")).toEqual([ID]);

    await definirRetiradoDaCarteira(ID, false, USER);
    const reativados = useAppStore.getState().imoveis;
    expect(filtra(reativados, "lista")).toEqual([ID]);
    expect(filtra(reativados, "kanban")).toEqual([ID]);
    expect(filtra(reativados, "retirados")).toEqual([]);
    // O Kanban agrupa por `status`, e ele não mudou.
    expect(reativados.find((i) => i.id === ID)!.status).toBe("Publicado");
  });
});

/* ================================================================
   D. DISPONIBILIDADE
   ================================================================ */
describe("D. disponibilidade: retirado nunca ganha verificação nova", () => {
  it.each(["Angariado", "Publicado"])("%s + retirado salvo pelo modal não cria verificação", async (status) => {
    semear([imovelCaptado({ status, retirado: true })]);
    abrirModal();
    fireEvent.change(campo("Observações"), { target: { value: "Editado depois de retirado." } });
    await clicar("Salvar alterações");
    expect(escritas("agenda", "insert")).toEqual([]);
    expect(verificacoesNoStore()).toEqual([]);
  });

  it.each(["Angariado", "Publicado"])("%s + retirado salvo direto pelo salvarImovel não cria verificação", async (status) => {
    semear([imovelCaptado({ status, retirado: true })]);
    await salvarImovel(imovelCaptado({ status, retirado: true }), USER, false);
    expect(escritas("agenda", "insert")).toEqual([]);
  });

  it("o mesmo imóvel ativo continua ganhando a verificação (regra existente)", async () => {
    semear([imovelCaptado({ status: "Publicado" })]);
    await salvarImovel(imovelCaptado({ status: "Publicado" }), USER, false);
    expect(escritas("agenda", "insert")).toHaveLength(1);
    expect(escritas("agenda", "insert")[0].payload).toMatchObject({ is_verificacao_disponibilidade: true });
  });

  it("verificação aberta: a retirada a encerra pelo banco, e o cliente relê em vez de repetir a regra", async () => {
    semear([imovelCaptado()], [verificacaoAberta()]);
    expect(verificacoesNoStore()).toHaveLength(1);

    await definirRetiradoDaCarteira(ID, true, USER, DADOS);

    // O cliente não apaga agenda nenhuma: só escreveu a marca.
    expect(escritas("agenda")).toEqual([]);
    // Quem encerrou foi o (imitado) trigger; o estado foi relido do banco.
    expect(banco.recargas).toBe(1);
    expect(verificacoesNoStore()).toEqual([]);
    expect(imovelNoStore().retirado).toBe(true);
  });

  it("editar depois o imóvel retirado não recria a verificação", async () => {
    semear([imovelCaptado()], [verificacaoAberta()]);
    await definirRetiradoDaCarteira(ID, true, USER, DADOS);
    banco.ops = [];

    abrirModal();
    fireEvent.change(campo("Telefone"), { target: { value: "43977776666" } });
    await clicar("Salvar alterações");
    expect(escritas("agenda", "insert")).toEqual([]);
    expect(verificacoesNoStore()).toEqual([]);
    expect(linhaNoBanco().retirado).toBe(true);
  });

  it("se o retrato local ainda tiver a verificação, salvar um retirado a cancela", async () => {
    // Recarga falhou ou chegou atrasada: o lembrete velho não pode sobreviver.
    semear([imovelCaptado({ retirado: true })], [verificacaoAberta()]);
    await salvarImovel(imovelCaptado({ retirado: true }), USER, false);
    expect(escritas("agenda", "delete")).toHaveLength(1);
    expect(verificacoesNoStore()).toEqual([]);
  });
});

/* ================================================================
   RECONCILIAÇÃO DA DISPONIBILIDADE NA REATIVAÇÃO (H a K)
   ================================================================ */
describe("H–K. reativar reconcilia a disponibilidade na hora, pela régua do cliente", () => {
  const lembretesAbertos = () =>
    (banco.tabelas.agenda ?? []).filter((a) => a.imovel_id === ID && a.is_verificacao_disponibilidade && !a.done);

  it.each(["Angariado", "Autorização assinada", "Publicado"])(
    "H. reativar %s elegível cria o lembrete sem precisar salvar o modal",
    async (status) => {
      semear([imovelCaptado({ status, retirado: true })]);
      expect(await definirRetiradoDaCarteira(ID, false, USER)).toBe(true);

      const inseridos = escritas("agenda", "insert");
      expect(inseridos).toHaveLength(1);
      // Mesma data que o `salvarImovel` daria: angariação + 60 dias.
      expect(inseridos[0].payload).toMatchObject({
        imovel_id: ID, user_id: USER, is_verificacao_disponibilidade: true, done: false, date: "2026-07-19",
      });
      expect(lembretesAbertos()).toHaveLength(1);
      expect(verificacoesNoStore()).toHaveLength(1);
      expect(escritas("mensagens_agendadas")).toEqual([]);
    },
  );

  it("H. reativar quem já tem lembrete aberto não empilha outro", async () => {
    semear([imovelCaptado({ retirado: true })], [verificacaoAberta()]);
    await definirRetiradoDaCarteira(ID, false, USER);
    expect(escritas("agenda", "insert")).toEqual([]);
    expect(verificacoesNoStore()).toHaveLength(1);
  });

  it.each(["Locado", "Perdido", "Cancelado", "Sem resposta", "Novo contato", "Documentação"])(
    "I. reativar em %s (fora do alvo) não cria disponibilidade",
    async (status) => {
      semear([imovelCaptado({ status, retirado: true })]);
      expect(await definirRetiradoDaCarteira(ID, false, USER)).toBe(true);
      expect(escritas("agenda", "insert")).toEqual([]);
      expect(verificacoesNoStore()).toEqual([]);
    },
  );

  it("J. retirar de novo encerra outra vez a disponibilidade reconciliada", async () => {
    semear([imovelCaptado({ retirado: true })]);
    await definirRetiradoDaCarteira(ID, false, USER);
    expect(lembretesAbertos()).toHaveLength(1);

    banco.ops = [];
    await definirRetiradoDaCarteira(ID, true, USER, DADOS);
    // O cliente escreveu a marca, os dados da retirada e a nota (C2); quem
    // encerrou foi o (imitado) trigger.
    expect(escritas("imoveis")).toHaveLength(1);
    expect(escritas("imoveis")[0].payload).toMatchObject({ retirado: true, retirado_motivo: "locado-proprietario" });
    expect(escritas("agenda")).toEqual([]);
    expect(lembretesAbertos()).toEqual([]);
    expect(verificacoesNoStore()).toEqual([]);
  });

  it("K. o ciclo retirar, reativar, retirar não mexe na identidade nem no histórico", async () => {
    const original = imovelCaptado();
    semear([original]);
    await definirRetiradoDaCarteira(ID, true, USER, DADOS);
    await definirRetiradoDaCarteira(ID, false, USER);
    await definirRetiradoDaCarteira(ID, true, USER, DADOS);

    expect(imovelNoStore().retirado).toBe(true);
    // Fora a marca, os dados da retirada e as notas que registram o ciclo (C2),
    // o imóvel é o mesmo.
    const semCiclo = (i: Imovel) => {
      const copia: Partial<Imovel> = { ...semMarca(i) };
      delete copia.notas;
      delete copia.retiradoEm;
      delete copia.retiradoMotivo;
      delete copia.retiradoObservacao;
      return copia;
    };
    expect(semCiclo(imovelNoStore())).toEqual(semCiclo(fromDbImovelDoBanco(original)));
    expect(imovelNoStore().notas!.slice(0, original.notas!.length)).toEqual(original.notas);
    expect(imovelNoStore().notas).toHaveLength(original.notas!.length + 3);
    // Nenhuma escrita em imoveis além da marca, dos dados da retirada e das notas.
    expect(escritas("imoveis").map((o) => Object.keys(o.payload!).sort())).toEqual([
      ["notas", "retirado", "retirado_em", "retirado_motivo", "retirado_observacao"],
      ["notas", "retirado"],
      ["notas", "retirado", "retirado_em", "retirado_motivo", "retirado_observacao"],
    ]);
  });
});

describe("A/E. a automação de disponibilidade não alcança retirado", () => {
  const hoje = "2026-09-30";
  const elegivel = (sobre: Partial<Imovel>) => imovelCaptado({ id: "x", ...sobre });

  it("o lote de disponibilidade deixa retirado de fora, em qualquer status do alvo", () => {
    for (const status of ["Angariado", "Autorização assinada", "Publicado"]) {
      const ativo = elegivel({ status });
      // Outro proprietário: o lote junta imóveis do mesmo dono, e isso esconderia o corte.
      const saiu = elegivel({ status, id: "y", retirado: true, proprietarioTelefone: "43988880000" });
      const ids = selecionarVerificacaoDisponibilidade([ativo, saiu], hoje).elegiveis.map((i) => i.id);
      expect(ids).toEqual(["x"]);
    }
  });

  it("e não o lista como excluído (não é algo que o corretor resolva nesta tela)", () => {
    const saiu = elegivel({ retirado: true });
    const selecao = selecionarVerificacaoDisponibilidade([saiu], hoje);
    expect(selecao.elegiveis).toEqual([]);
    expect(selecao.excluidos).toEqual([]);
  });
});

/* ================================================================
   E/F. MENSAGEM LIVRE E ATRIBUIÇÃO: regras existentes intactas
   ================================================================ */
describe("E/F. retirado continua fora para mensagem livre e atribuição", () => {
  it("mensagem livre vinculada a retirado segue bloqueada, em qualquer status", () => {
    for (const status of ["Angariado", "Publicado", "Autorização assinada"]) {
      expect(imovelBloqueiaMensagemLivre({ status, retirado: true })).toBe(true);
      expect(imovelBloqueiaMensagemLivre({ status, retirado: false })).toBe(false);
    }
  });

  it("retirado segue terminal para a atribuição", () => {
    expect(ehImovelTerminalParaAtribuicao({ status: "Publicado", retirado: true })).toBe(true);
    expect(ehImovelTerminalParaAtribuicao({ status: "Publicado", retirado: false })).toBe(false);
  });
});

/* ================================================================
   G. MÉTRICAS: a marca não muda conta nenhuma
   ================================================================ */
describe("G. métricas leem status e histórico, não a marca", () => {
  const ativo = imovelCaptado({ retirado: false });
  const retirado = imovelCaptado({ retirado: true });

  it("retirado não é perda decidida nem locação; a angariação continua contando", () => {
    expect(ehPerdaDecidida(retirado)).toBe(false);
    expect(foiLocado(retirado)).toBe(false);
    expect(foiAngariado(retirado)).toBe(true);
    expect(captacaoGanha(retirado)).toBe(true);
    expect(imoveisAngariadosNoMes([retirado], "2026-05").map((i) => i.id)).toEqual([ID]);
  });

  it("conversão, métricas do período e relatório mensal são idênticos com e sem a marca", () => {
    expect(conversaoCaptacao([retirado])).toEqual(conversaoCaptacao([ativo]));
    expect(metricsForRange([retirado], 100)).toEqual(metricsForRange([ativo], 100));
    // O relatório carrega os próprios imóveis; a comparação ignora só a marca.
    const semAMarca = (valor: unknown) => JSON.parse(JSON.stringify(valor, (k, v) => (k === "retirado" ? undefined : v)));
    expect(semAMarca(relatorioMensal([retirado], 100, "2026-05"))).toEqual(semAMarca(relatorioMensal([ativo], 100, "2026-05")));
  });
});

/* ================================================================
   CONTRATO DO BANCO (M3/M4), conferido sem alterar
   ================================================================ */
describe("o encerramento continua sendo do trigger M3/M4", () => {
  const MIGRATION = lerRepo("supabase/migrations/20260921120000_transicao_disponibilidade.sql");
  const SCHEMA = lerRepo("supabase-schema.sql");

  it.each([["migration M3/M4", MIGRATION], ["schema canônico", SCHEMA]])(
    "no %s, o trigger reage à coluna `retirado` que a ação escreve",
    (_, sql) => {
      expect(sql).toMatch(/create trigger trg_transicao_disponibilidade_imovel\s+after update of status, retirado on public\.imoveis/);
      expect(sql).toContain("(coalesce(new.retirado, false) and not coalesce(old.retirado, false))");
    },
  );
});
