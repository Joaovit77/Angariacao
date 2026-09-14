// @vitest-environment jsdom

/* ================================================================
   C9 — TELA: conflito de revisão, estados temporais, reuso e histórico

   O banco preserva os eventos; a tela decide o que é atual, histórico,
   desatualizado ou substituído — por leitura derivada (`etiquetasDoImovel`),
   nunca por coluna. Aqui se prova que o card não promove histórico a atual,
   que o painel separa atual de histórico ("visto por último em…"), que a
   linha do tempo mantém as etiquetas de cada avistamento com o estado
   próprio, que reuso aparece distinto de modelo e que o aviso de conflito
   aparece só quando há `revisao_conflito_em`.
   ================================================================ */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const cenario = vi.hoisted(() => ({
  estado: {
    salvando: false,
    carregando: false,
    classificandoAvistamentoId: null as string | null,
    buscarDuplicatas: vi.fn(async () => []),
    confirmarEtiqueta: vi.fn(),
    contestarEtiqueta: vi.fn(),
    confirmarTipo: vi.fn(),
    classificarAvistamento: vi.fn(),
    definirTipo: vi.fn(),
    corrigirObservacao: vi.fn(),
    descartar: vi.fn(),
    cancelarExclusao: vi.fn(),
    removerFoto: vi.fn(),
    carregarDetalhe: vi.fn(),
    previaExclusao: vi.fn(),
    excluir: vi.fn(),
  },
  abrirModal: vi.fn(),
}));
vi.mock("@/lib/useProspeccao", () => {
  const useProspeccao = (seletor: (estado: typeof cenario.estado) => unknown) => seletor(cenario.estado);
  useProspeccao.getState = () => cenario.estado;
  return { useProspeccao };
});
vi.mock("@/lib/uiModal", () => ({
  useUiModal: (seletor: (estado: { abrirModal: typeof cenario.abrirModal }) => unknown) =>
    seletor({ abrirModal: cenario.abrirModal }),
}));

import AvisoRevisaoConflito from "@/components/prospeccao/AvisoRevisaoConflito";
import CardIdentificado from "@/components/prospeccao/CardIdentificado";
import { descreverProveniencia } from "@/components/prospeccao/EtiquetasImovel";
import LinhaDoTempoAvistamentos from "@/components/prospeccao/LinhaDoTempoAvistamentos";
import PainelIdentificado from "@/components/prospeccao/PainelIdentificado";
import { vigenciaDasEtiquetas, type AvistamentoLongitudinal, type DetalheImovelIdentificado, type EtiquetaIdentificado } from "@/lib/prospeccao";

const SETEMBRO = "2026-09-09T12:00:00.000Z";
const NOVEMBRO = "2026-11-10T12:00:00.000Z";

function etiqueta(sobrescritas: Partial<EtiquetaIdentificado>): EtiquetaIdentificado {
  return {
    id: 1, imovelIdentificadoId: "identificado-1", avistamentoId: "av-nov", classificacaoId: "run-nov",
    categoria: "sinal-de-prospeccao", codigo: "imovel-fechado", origem: "ia-texto", confianca: 88, estado: "inferida",
    observadoEm: NOVEMBRO, modelo: "gpt-5.6-luna", versaoCatalogo: 1, versaoClassificador: 1, revisaoObservacao: 1,
    confirmadaPor: null, confirmadaEm: null, substituidaEm: null, substituidaPorClassificacaoId: null,
    desatualizadaEm: null, criadoEm: NOVEMBRO, ...sobrescritas,
  };
}

function avistamento(sobrescritas: Partial<AvistamentoLongitudinal>): AvistamentoLongitudinal {
  return {
    id: "av-nov", imovelIdentificadoId: "identificado-1", observadoEm: NOVEMBRO, createdAt: NOVEMBRO,
    latitude: null, longitude: null, acuraciaMetros: null, precisaoLocalizacao: "desconhecida",
    observacao: "Casa fechada, jardim alto.", observacaoRevisao: 1, classificacaoEstado: "concluida",
    revisaoConflitoEm: null, classificacaoId: "run-nov", classificacaoEm: NOVEMBRO, fingerprint: "f",
    fotos: [], classificacoes: [], etiquetas: [], ...sobrescritas,
  };
}

/** Setembro: placa de aluga-se (por modelo). Novembro (corrente): só "imóvel fechado" (reuso). */
function detalhe(extra: Partial<DetalheImovelIdentificado["identificado"]> = {}, avistamentos?: AvistamentoLongitudinal[]): DetalheImovelIdentificado {
  const setembro = avistamento({
    id: "av-set", observadoEm: SETEMBRO, createdAt: SETEMBRO, observacao: "Placa de aluga-se na janela.", classificacaoId: "run-set", classificacaoEm: SETEMBRO,
    classificacoes: [{ id: "run-set", avistamentoId: "av-set", imovelIdentificadoId: "identificado-1", estado: "concluida", modo: "modelo", reusadaDeClassificacaoId: null, observacaoRevisao: 1, fingerprint: "s", modelo: "gpt-5.6-luna", esforco: "low", versaoCatalogo: 1, versaoClassificador: 1, confiancaMinima: 70, tipoSugerido: "Casa", tipoConfianca: 72, snapshotAplicado: false, sugeridas: 1, aplicadas: 1, abaixoDoPiso: 0, foraDoCatalogo: 0, semEvidencia: 0, jaConfirmada: 0, falhaCodigo: null, iniciadaEm: SETEMBRO, concluidaEm: SETEMBRO, leaseToken: null, leaseExpiraEm: null }],
    etiquetas: [etiqueta({ id: 10, avistamentoId: "av-set", classificacaoId: "run-set", codigo: "placa-aluga-se", observadoEm: SETEMBRO, criadoEm: SETEMBRO })],
  });
  const novembro = avistamento({
    classificacoes: [{ id: "run-nov", avistamentoId: "av-nov", imovelIdentificadoId: "identificado-1", estado: "concluida", modo: "reuso", reusadaDeClassificacaoId: "run-x", observacaoRevisao: 1, fingerprint: "f", modelo: "gpt-5.6-luna", esforco: "low", versaoCatalogo: 1, versaoClassificador: 1, confiancaMinima: 70, tipoSugerido: null, tipoConfianca: null, snapshotAplicado: true, sugeridas: 1, aplicadas: 1, abaixoDoPiso: 0, foraDoCatalogo: 0, semEvidencia: 0, jaConfirmada: 0, falhaCodigo: null, iniciadaEm: NOVEMBRO, concluidaEm: NOVEMBRO, leaseToken: null, leaseExpiraEm: null }],
    etiquetas: [etiqueta({ id: 20 })],
  });
  return {
    identificado: {
      id: "identificado-1", situacao: "identificado", logradouro: "Rua das Palmeiras", numero: "120",
      unidade: null, bloco: null, edificio: null, bairro: "Centro", cidade: "Londrina", estado: "PR", cep: null, pontoReferencia: null,
      enderecoChave: "", cidadeChave: "", bairroChave: "",
      latitude: null, longitude: null, acuraciaMetros: null, precisaoLocalizacao: "desconhecida",
      tipo: null, tipoOrigem: null, tipoConfianca: null, tipoEstado: null, tipoDefinidoEm: null,
      tipoClassificacaoId: null, tipoAvistamentoId: null, tipoConfirmadoPor: null, tipoConfirmadoEm: null,
      avistamentosTotal: 2, primeiroAvistamentoEm: SETEMBRO, ultimoAvistamentoEm: NOVEMBRO, avistamentoCorrenteId: "av-nov",
      origemIdentificacao: "campo", ultimaInvestigacaoEm: null, imovelId: null, promovidoEm: null,
      descartadoMotivo: null, descartadoEm: null, fundidoEm: null, fundidoEmImovelId: null,
      exclusaoSolicitadaEm: null, criadoEm: SETEMBRO, atualizadoEm: NOVEMBRO, ...extra,
    },
    avistamentos: avistamentos ?? [novembro, setembro],
    etiquetasDoImovel: [],
    classificacoesCarregadas: true,
  };
}

beforeEach(() => { vi.clearAllMocks(); });
afterEach(cleanup);

describe("vigência derivada na fronteira", () => {
  it("setembro placa-aluga-se, novembro sem placa: a placa não é atual, mas fica no histórico com a data de setembro", () => {
    const vigencia = vigenciaDasEtiquetas(detalhe());
    expect(vigencia.map((e) => [e.codigo, e.vigenteNoAvistamentoCorrente, e.ultimaVezObservado])).toEqual([
      ["imovel-fechado", true, NOVEMBRO],
      ["placa-aluga-se", false, SETEMBRO],
    ]);
  });
});

describe("AvisoRevisaoConflito", () => {
  it("não aparece sem conflito; com conflito explica que a confirmação continua valendo e pede revisão, sem botão de resolver", () => {
    const { container, rerender } = render(createElement(AvisoRevisaoConflito, { revisaoConflitoEm: null, revisaoObservacao: 2 }));
    expect(container.querySelector("[data-revisao-conflito]")).toBeNull();
    rerender(createElement(AvisoRevisaoConflito, { revisaoConflitoEm: "2026-11-12T10:00:00.000Z", revisaoObservacao: 2 }));
    const aviso = screen.getByRole("alert");
    expect(aviso.textContent).toContain("A observação mudou depois de você confirmar etiquetas.");
    expect(aviso.textContent).toContain("12/11/2026");
    expect(aviso.textContent).toContain("revisão 2");
    expect(aviso.textContent).toContain("A confirmação continua valendo");
    expect(aviso.textContent).toMatch(/Revise/);
    expect(aviso.querySelector("button")).toBeNull();
  });
});

describe("CardIdentificado", () => {
  it("mostra só o estado atual: a placa de setembro não entra, mesmo estando no histórico", () => {
    const d = detalhe();
    const atuais = vigenciaDasEtiquetas(d).filter((e) => e.vigenteNoAvistamentoCorrente);
    render(createElement(CardIdentificado, { identificado: d.identificado, selecionado: false, aoSelecionar: vi.fn(), etiquetasAtuais: atuais }));
    const chips = [...document.querySelectorAll("[data-origem]")].map((c) => c.textContent);
    expect(chips).toEqual(["Imóvel fechadoIA"]);
    expect(document.body.textContent).not.toContain("Placa de aluga-se");
  });
});

describe("PainelIdentificado", () => {
  it("separa etiquetas atuais (corrente) do histórico com 'visto por último em', sem apagar setembro", () => {
    render(createElement(PainelIdentificado, { detalhe: detalhe() }));
    const atuais = screen.getByRole("heading", { name: "Etiquetas atuais" }).closest("section")!;
    expect([...atuais.querySelectorAll("[data-origem]")].map((c) => c.textContent)).toEqual(["Imóvel fechadoIA"]);
    const historico = screen.getByRole("list", { name: "Histórico de etiquetas" });
    const item = historico.querySelector("[data-codigo='placa-aluga-se']")!;
    expect(item.querySelector("[data-historica='true']")!.textContent).toBe("Placa de aluga-seHistórica");
    expect(item.textContent).toContain("visto por último em 09/09/2026");
  });

  it("mostra o aviso de conflito do avistamento corrente quando há revisao_conflito_em, e a confirmada segue confirmada", () => {
    const d = detalhe();
    d.avistamentos[0] = { ...d.avistamentos[0], observacaoRevisao: 2, revisaoConflitoEm: "2026-11-12T10:00:00.000Z",
      etiquetas: [etiqueta({ id: 20, estado: "confirmada", confirmadaPor: "u", confirmadaEm: "2026-11-11T09:00:00.000Z", revisaoObservacao: 1 })] };
    render(createElement(PainelIdentificado, { detalhe: d }));
    expect(screen.getByRole("alert").textContent).toContain("A observação mudou depois de você confirmar etiquetas.");
    const atuais = screen.getByRole("heading", { name: "Etiquetas atuais" }).closest("section")!;
    expect(atuais.querySelector("[data-estado='confirmada']")!.textContent).toBe("Imóvel fechadoConfirmada");
    expect(atuais.textContent).toContain("revisão 1 do texto");
    expect(screen.getByRole("button", { name: "Contestar" })).toBeTruthy();
  });

  it("sem conflito não há aviso; desatualizada e substituída nunca aparecem como atuais", () => {
    const d = detalhe();
    d.avistamentos[0] = { ...d.avistamentos[0], observacaoRevisao: 2, classificacaoEstado: "pendente", classificacaoId: null, classificacaoEm: null, fingerprint: null,
      etiquetas: [
        etiqueta({ id: 20, estado: "desatualizada", desatualizadaEm: "2026-11-12T10:00:00.000Z" }),
        etiqueta({ id: 21, codigo: "mato-alto", estado: "substituida", substituidaEm: "2026-11-11T10:00:00.000Z", substituidaPorClassificacaoId: "run-y" }),
      ] };
    render(createElement(PainelIdentificado, { detalhe: d }));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByText("Nenhuma etiqueta atual registrada.")).toBeTruthy();
    // O histórico derivado mostra cada código com a situação real: a placa de
    // setembro (vigente lá, histórica aqui), a desatualizada e a substituída —
    // cada uma com a própria marca, nenhuma como atual.
    const historico = screen.getByRole("list", { name: "Histórico de etiquetas" });
    expect([...historico.querySelectorAll("[data-codigo]")].map((li) =>
      `${li.getAttribute("data-codigo")}:${li.querySelector("[data-estado]")!.getAttribute("data-estado")}:${li.querySelector("[data-estado] span")!.textContent}`))
      .toEqual(["imovel-fechado:desatualizada:Desatualizada", "mato-alto:substituida:Substituída", "placa-aluga-se:inferida:Histórica"]);
    expect(historico.textContent).toContain("visto por último em 09/09/2026");
  });
});

describe("LinhaDoTempoAvistamentos", () => {
  it("cada avistamento com as próprias etiquetas e estado; reuso distinto de modelo; setembro não vira substituída por novembro", () => {
    const d = detalhe();
    const { container } = render(createElement(LinhaDoTempoAvistamentos, { avistamentos: d.avistamentos, avistamentoCorrenteId: "av-nov" }));
    const nov = container.querySelector("[data-avistamento-id='av-nov']")!;
    const set = container.querySelector("[data-avistamento-id='av-set']")!;
    expect([...nov.querySelectorAll("[data-origem]")].map((c) => c.textContent)).toEqual(["Imóvel fechadoIA"]);
    expect([...set.querySelectorAll("[data-origem]")].map((c) => `${c.getAttribute("data-estado")}:${c.textContent}`)).toEqual(["inferida:Placa de aluga-seIA"]);
    expect(nov.querySelector("[data-modo]")!.getAttribute("data-modo")).toBe("reuso");
    expect(nov.textContent).toContain("resultado reutilizado");
    expect(nov.textContent).toContain("Reflete o avistamento corrente");
    expect(set.querySelector("[data-modo]")!.getAttribute("data-modo")).toBe("modelo");
    expect(set.textContent).toContain("processado pela IA");
    expect(set.textContent).toContain("Histórico: não altera o estado atual");
    expect(nov.textContent).toContain("Texto original");
    expect(container.querySelector("[data-revisao-conflito]")).toBeNull();
  });

  it("desatualizada, substituída e contestada aparecem com marca própria, e o conflito de revisão fica marcado no evento", () => {
    const d = detalhe();
    d.avistamentos[0] = { ...d.avistamentos[0], observacaoRevisao: 3, revisaoConflitoEm: "2026-11-12T10:00:00.000Z",
      etiquetas: [
        etiqueta({ id: 20, estado: "desatualizada", desatualizadaEm: "2026-11-12T10:00:00.000Z", revisaoObservacao: 2 }),
        etiqueta({ id: 21, codigo: "mato-alto", estado: "substituida", substituidaEm: "2026-11-11T10:00:00.000Z", substituidaPorClassificacaoId: "run-y" }),
        etiqueta({ id: 22, codigo: "aparenta-vago", categoria: "estado-visual", estado: "contestada" }),
        etiqueta({ id: 23, codigo: "sem-placa-visivel", estado: "confirmada", confirmadaPor: "u", confirmadaEm: "2026-11-11T09:00:00.000Z", revisaoObservacao: 1 }),
      ] };
    const { container } = render(createElement(LinhaDoTempoAvistamentos, { avistamentos: d.avistamentos, avistamentoCorrenteId: "av-nov" }));
    const nov = container.querySelector("[data-avistamento-id='av-nov']")!;
    expect([...nov.querySelectorAll("[data-origem]")].map((c) => `${c.getAttribute("data-estado")}:${c.querySelector("span")!.textContent}`)).toEqual([
      "desatualizada:Desatualizada", "substituida:Substituída", "contestada:Contestada", "confirmada:Confirmada",
    ]);
    expect(nov.textContent).toContain("Revisão 3 do texto");
    expect(nov.querySelector("[data-revisao-conflito]")!.textContent).toContain("Observação alterada após confirmação de etiquetas");
  });
});

describe("V7 §16: nenhuma tela do usuário mostra nome de modelo, token ou dólar", () => {
  const NOME_TECNICO = /gpt-|luna|terra|\bsol\b|mini|nano|token|US\$|\$\s?\d/i;

  it("com modelo = gpt-5.6-luna nos dados, painel, linha do tempo e card não renderizam o nome; os dados internos o conservam", () => {
    const d = detalhe();
    // Nos dados internos o modelo continua presente (auditoria e reuso).
    expect(d.avistamentos[0].classificacoes[0].modelo).toBe("gpt-5.6-luna");
    expect(d.avistamentos[0].etiquetas[0].modelo).toBe("gpt-5.6-luna");
    expect(descreverProveniencia(d.avistamentos[0].etiquetas[0])).not.toMatch(NOME_TECNICO);

    render(createElement(PainelIdentificado, { detalhe: d }));
    expect(document.body.textContent).not.toMatch(NOME_TECNICO);
    expect(document.body.textContent).toContain("IA sobre o texto · sinal 88");
    expect(document.body.textContent).toContain("resultado reutilizado de classificação anterior");
    expect(document.body.textContent).toContain("processado pela IA");
    cleanup();

    const atuais = vigenciaDasEtiquetas(d).filter((e) => e.vigenteNoAvistamentoCorrente);
    render(createElement(CardIdentificado, { identificado: d.identificado, selecionado: false, aoSelecionar: vi.fn(), etiquetasAtuais: atuais }));
    expect(document.body.textContent).not.toMatch(NOME_TECNICO);
  });

  it("estrutural: as telas do Garimpo não renderizam `.modelo` nem literais de modelo; /admin fica como está", () => {
    for (const arquivo of [
      "components/prospeccao/EtiquetasImovel.tsx", "components/prospeccao/LinhaDoTempoAvistamentos.tsx",
      "components/prospeccao/PainelIdentificado.tsx", "components/prospeccao/CardIdentificado.tsx",
      "components/prospeccao/ProspeccaoView.tsx", "components/prospeccao/AvisoRevisaoConflito.tsx",
      "components/modais/ModalAvistamento.tsx",
    ]) {
      const fonte = readFileSync(resolve(arquivo), "utf8");
      expect(fonte, arquivo).not.toMatch(/\{[^}]*\.modelo[^}]*\}/);
      expect(fonte, arquivo).not.toMatch(/gpt-\d/i);
    }
  });
});

describe("descrição de proveniência por estado", () => {
  it("desatualizada fala do texto; substituída fala de outra classificação; nenhuma delas é a mesma coisa", () => {
    expect(descreverProveniencia(etiqueta({ estado: "desatualizada", desatualizadaEm: "2026-11-12T10:00:00.000Z" })))
      .toMatch(/o texto da observação mudou em 12\/11\/2026/);
    expect(descreverProveniencia(etiqueta({ estado: "substituida", substituidaEm: "2026-11-11T10:00:00.000Z", substituidaPorClassificacaoId: "run-y" })))
      .toMatch(/substituída por outra classificação em 11\/11\/2026/);
    expect(descreverProveniencia(etiqueta({}))).toContain("revisão 1 do texto");
  });
});
