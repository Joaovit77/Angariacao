// @vitest-environment jsdom

/* ================================================================
   INVESTIGADOR — B3-M3: a tela de "Marcar como incorreta"

   Hipótese (vigente ou em "Também encontrado") oferece Confirmar e
   Marcar como incorreta; confirmada não oferece nada novo. Marcar pede
   confirmação explícita, chama a ação do store e relê. A incorreta sai
   de "Também encontrado", fica numa área recolhida com "Incorreta" em
   texto e atributo; atributo só com incorretas vai para a seção própria
   e não para "O que sabemos".
   ================================================================ */
import { createElement } from "react";
import { cleanup, fireEvent, render, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AfirmacaoRegistrada, InvestigacaoRegistrada } from "@/lib/calculo/memoriaIdentidade";
import type { DetalheImovelIdentificado, MemoriaIdentificadoCarregada } from "@/lib/prospeccao";

const cenario = vi.hoisted(() => ({
  estado: {
    salvando: false,
    carregarMemoria: vi.fn(async (): Promise<MemoriaIdentificadoCarregada | null> => ({ investigacoes: [], atributos: [] })),
    confirmarAtributo: vi.fn(async () => false),
    rejeitarAtributo: vi.fn(async () => false),
  },
}));
vi.mock("@/lib/useProspeccao", () => ({
  useProspeccao: (seletor: (estado: typeof cenario.estado) => unknown) => seletor(cenario.estado),
}));

import MemoriaIdentidade, {
  ERRO_MARCAR_INCORRETA,
  PERGUNTA_CONFIRMAR_INFORMACAO,
  PERGUNTA_MARCAR_INCORRETA,
  ROTULO_CONFIRMAR_INFORMACAO,
  ROTULO_MARCAR_INCORRETA,
  TEXTO_SO_INCORRETAS,
  TITULO_INFORMACOES_INCORRETAS,
  TITULO_MARCADAS_INCORRETAS,
} from "@/components/prospeccao/MemoriaIdentidade";

const ID = "55555555-5555-4555-8555-555555555555";
const USUARIO = "10000000-0000-4000-8000-000000000001";
const T1 = "2026-09-24T15:38:49.267Z";
const T2 = "2026-09-24T18:00:00.000Z";

function afirmacao(extra: Partial<AfirmacaoRegistrada>): AfirmacaoRegistrada {
  return {
    id: 1, imovelIdentificadoId: ID, investigacaoId: "x1", atributo: "area_m2", valorTexto: null, valorNum: 304,
    origem: "investigador-web", estado: "hipotese", confianca: null, fonteUrl: "https://vivareal.test/1", fonteDominio: "vivareal.test",
    observadoEm: T1, confirmadoPor: null, confirmadoEm: null, rejeitadoPor: null, rejeitadoEm: null, criadoEm: T1, ...extra,
  };
}
const rejeitada = (extra: Partial<AfirmacaoRegistrada>) => afirmacao({ estado: "rejeitada", rejeitadoPor: USUARIO, rejeitadoEm: T2, ...extra });
const investigacao: InvestigacaoRegistrada = {
  id: "x1", imovelIdentificadoId: ID, origem: "investigador-web", resultadosTotal: 2, atributosTotal: 2, recusadosTotal: 0, concluidaEm: T1, criadoEm: T1,
};
const detalhe = {
  identificado: {
    id: ID, situacao: "identificado", exclusaoSolicitadaEm: null, ultimaInvestigacaoEm: T1,
    primeiroAvistamentoEm: null, ultimoAvistamentoEm: null, avistamentosTotal: 0,
    tipo: null, tipoDefinidoEm: null, tipoEstado: null, promovidoEm: null,
  },
  avistamentos: [],
} as unknown as DetalheImovelIdentificado;

const secao = () => document.querySelector("[data-secao-memoria]") as HTMLElement;
const comMemoria = (atributos: AfirmacaoRegistrada[]) =>
  cenario.estado.carregarMemoria.mockResolvedValue({ investigacoes: [investigacao], atributos });
async function renderizar() {
  render(createElement(MemoriaIdentidade, { detalhe, recolhida: false }));
  await waitFor(() => expect(within(secao()).queryByText("Carregando a memória…")).toBeNull());
}
const botoes = (raiz: Element) => [...raiz.querySelectorAll("button")].map((b) => b.textContent);

describe("B3-M3 — Marcar como incorreta na seção Memória do imóvel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    cenario.estado.salvando = false;
  });
  afterEach(() => { cleanup(); vi.restoreAllMocks(); });

  it("hipótese vigente e hipótese em 'Também encontrado' oferecem Confirmar e Marcar como incorreta; confirmada não", async () => {
    comMemoria([afirmacao({ id: 1 }), afirmacao({ id: 2, valorNum: 36, fonteDominio: "crv.test" }), afirmacao({ id: 3, atributo: "quartos", valorNum: 3, estado: "confirmada", confirmadoPor: USUARIO, confirmadoEm: T2 })]);
    await renderizar();
    const area = secao().querySelector("[data-memoria-fato='area_m2']")!;
    expect(botoes(area.querySelector("[data-memoria-afirmacao='1']")!)).toEqual([ROTULO_CONFIRMAR_INFORMACAO, ROTULO_MARCAR_INCORRETA]);
    expect(botoes(area.querySelector("[data-memoria-conflito] [data-memoria-afirmacao='2']")!)).toEqual([ROTULO_CONFIRMAR_INFORMACAO, ROTULO_MARCAR_INCORRETA]);
    expect(botoes(secao().querySelector("[data-memoria-fato='quartos']")!)).toEqual([]);
  });

  it("Marcar pede confirmação explícita, chama o store com o id e relê; a incorreta sai de 'Também encontrado' e vai para a área recolhida", async () => {
    comMemoria([afirmacao({ id: 1 }), afirmacao({ id: 2, valorNum: 36, fonteDominio: "crv.test" })]);
    cenario.estado.rejeitarAtributo.mockImplementation(async () => {
      comMemoria([afirmacao({ id: 1 }), rejeitada({ id: 2, valorNum: 36, fonteDominio: "crv.test" })]);
      return true;
    });
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    await renderizar();
    const conflito = secao().querySelector("[data-memoria-conflito]")!;
    fireEvent.click(within(conflito as HTMLElement).getByRole("button", { name: ROTULO_MARCAR_INCORRETA }));
    expect(confirm).toHaveBeenCalledWith(PERGUNTA_MARCAR_INCORRETA);
    expect(confirm).not.toHaveBeenCalledWith(PERGUNTA_CONFIRMAR_INFORMACAO);
    await waitFor(() => expect(cenario.estado.rejeitarAtributo).toHaveBeenCalledExactlyOnceWith(2));
    await waitFor(() => expect(secao().querySelector("details[data-memoria-incorretas]")).not.toBeNull());
    expect(secao().querySelector("[data-memoria-conflito]")).toBeNull();
    expect(cenario.estado.carregarMemoria).toHaveBeenCalledTimes(2);
    expect(cenario.estado.confirmarAtributo).not.toHaveBeenCalled();
    const area = secao().querySelector("[data-memoria-fato='area_m2']")!;
    expect(area.hasAttribute("data-memoria-divergente")).toBe(false);
    const incorretas = area.querySelector("details[data-memoria-incorretas]") as HTMLDetailsElement;
    expect(incorretas.open).toBe(false);
    expect(incorretas.querySelector("summary")!.textContent).toBe(`${TITULO_MARCADAS_INCORRETAS} (1)`);
    const item = incorretas.querySelector("[data-memoria-afirmacao='2']")!;
    expect(item.querySelector("[data-memoria-estado]")!.getAttribute("data-memoria-estado")).toBe("rejeitada");
    expect(item.querySelector("[data-memoria-estado]")!.textContent).toBe("Incorreta");
    expect(item.textContent).toContain("36 m²");
    expect(item.textContent).toContain("crv.test");
    expect(item.textContent).toMatch(/Marcada como incorreta em \d{2}\/\d{2}\/\d{4}/);
    expect(botoes(item)).toEqual([]);
    expect(area.querySelector("[data-memoria-afirmacao='1'] [data-memoria-estado]")!.textContent).toBe("Hipótese");
  });

  it("cancelar não chama nada; falha mantém a hipótese e mostra erro local, sem reler", async () => {
    comMemoria([afirmacao({ id: 1 })]);
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    await renderizar();
    fireEvent.click(within(secao()).getByRole("button", { name: ROTULO_MARCAR_INCORRETA }));
    expect(cenario.estado.rejeitarAtributo).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    cenario.estado.rejeitarAtributo.mockResolvedValue(false);
    fireEvent.click(within(secao()).getByRole("button", { name: ROTULO_MARCAR_INCORRETA }));
    await waitFor(() => expect(secao().querySelector("[role='alert']")!.textContent).toBe(ERRO_MARCAR_INCORRETA));
    expect(secao().querySelector("[data-memoria-estado]")!.textContent).toBe("Hipótese");
    expect(cenario.estado.carregarMemoria).toHaveBeenCalledTimes(1);
  });

  it("atributo só com incorretas: fora de 'O que sabemos', na seção 'Informações marcadas como incorretas'", async () => {
    comMemoria([rejeitada({ id: 1, valorNum: 36 }), rejeitada({ id: 2, valorNum: 25, fonteDominio: "zap.test" })]);
    await renderizar();
    expect(secao().querySelector("[data-memoria-fatos]")).toBeNull();
    expect(secao().querySelector("[data-memoria-vazia='so-incorretas']")!.textContent).toBe(TEXTO_SO_INCORRETAS);
    const bloco = secao().querySelector("details[data-memoria-secao-incorretas]") as HTMLDetailsElement;
    expect(bloco.querySelector("summary")!.textContent).toBe(TITULO_INFORMACOES_INCORRETAS);
    const fato = bloco.querySelector("[data-memoria-sem-vigente='area_m2']")!;
    expect([...fato.querySelectorAll("[data-memoria-estado]")].map((m) => m.textContent)).toEqual(["Incorreta", "Incorreta"]);
    expect(botoes(bloco)).toEqual([]);
    const historico = [...secao().querySelectorAll("[data-memoria-evento='rejeicao'] strong")].map((s) => s.textContent);
    expect(historico).toEqual(["Área marcada como incorreta por você", "Área marcada como incorreta por você"]);
  });
});
