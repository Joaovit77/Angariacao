// @vitest-environment jsdom

/* ================================================================
   C8 — PROVENIÊNCIA: da etiqueta no banco ao chip na tela

   Cada etiqueta inferida carrega `classificacao_id`, `avistamento_id`,
   `origem`, `confianca`, `modelo`, `versao_catalogo`, `versao_classificador`,
   `observado_em` e `revisao_observacao` — provado no PostgreSQL local, não
   no texto da UI. A tela só apresenta: chip com marca (IA × confirmada ×
   manual × histórica), confiança como SINAL, data do avistamento, modelo;
   tipo inferido com "Confirmar tipo"; "Aguardando classificação" com
   "Classificar agora". Nunca prompt, resposta bruta ou PII.
   ================================================================ */
import { createElement } from "react";
import { PGlite } from "@electric-sql/pglite";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

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

import CardIdentificado from "@/components/prospeccao/CardIdentificado";
import { descreverProveniencia, marcaProveniencia } from "@/components/prospeccao/EtiquetasImovel";
import LinhaDoTempoAvistamentos from "@/components/prospeccao/LinhaDoTempoAvistamentos";
import PainelIdentificado from "@/components/prospeccao/PainelIdentificado";
import type { EtiquetaIdentificado } from "@/lib/prospeccao";
import { USUARIO, criarApoio, limparBanco, subirBancoProspeccao } from "./fixtures/bancoProspeccao";

/* ---------------- Banco: a proveniência é da afirmação ---------------- */

let db: PGlite;
const apoio = criarApoio(() => db);

describe.sequential("proveniência gravada por etiqueta", () => {
  beforeAll(async () => { db = await subirBancoProspeccao(); }, 30_000);
  beforeEach(async () => { await limparBanco(db); await db.exec("begin"); });
  afterEach(async () => { await db.exec("rollback; reset role"); });
  afterAll(async () => { await db?.close(); });

  it("cada etiqueta inferida guarda a cadeia inteira: execução, avistamento, origem, sinal, modelo, versões, instante e revisão", async () => {
    const pai = await apoio.identidade();
    const av = await apoio.avistamento(pai, "2026-09-10T12:00:00Z", "Casa fechada, sem placa na frente.");
    const { claim } = await apoio.classificar(av, "p".repeat(64), [
      { categoria: "sinal-de-prospeccao", codigo: "imovel-fechado", confianca: 90 },
      { categoria: "sinal-de-prospeccao", codigo: "sem-placa-visivel", confianca: 84 },
    ]);
    const etiquetas = await apoio.etiquetas(av);
    expect(etiquetas).toHaveLength(2);
    for (const etiqueta of etiquetas) {
      expect(etiqueta).toMatchObject({
        classificacao_id: claim.run_id,
        avistamento_id: av,
        imovel_identificado_id: pai,
        user_id: USUARIO,
        origem: "ia-texto",
        estado: "inferida",
        modelo: "gpt-5.6-luna",
        versao_catalogo: 1,
        versao_classificador: 1,
        revisao_observacao: 1,
        confirmada_por: null,
        confirmada_em: null,
      });
      expect(typeof etiqueta.confianca).toBe("number");
      expect(Date.parse(etiqueta.observado_em as string)).toBe(Date.parse("2026-09-10T12:00:00Z"));
    }
    expect(etiquetas.map((e) => e.confianca).sort()).toEqual([84, 90]);
    // A execução guarda modelo, esforço, versões e o piso daquela execução.
    expect(await apoio.linha("public.imoveis_identificados_classificacoes", claim.run_id as string)).toMatchObject({
      modelo: "gpt-5.6-luna", esforco: "low", versao_catalogo: 1, versao_classificador: 1, confianca_minima: 70,
    });
  });

  it("o CHECK exige a cadeia completa para ia-texto: não existe etiqueta de IA sem modelo, confiança ou execução", async () => {
    const pai = await apoio.identidade();
    const av = await apoio.avistamento(pai, "2026-09-10T12:00:00Z");
    for (const faltando of ["modelo", "confianca", "classificacao_id", "revisao_observacao"]) {
      await db.exec("savepoint check_prov");
      const colunas = { modelo: "'m'", confianca: "90", classificacao_id: "null", revisao_observacao: "1" };
      const valores = { ...colunas, [faltando]: "null" };
      await expect(db.query(`insert into public.imoveis_identificados_etiquetas
        (imovel_identificado_id, avistamento_id, classificacao_id, user_id, categoria, codigo, origem,
         confianca, estado, modelo, versao_catalogo, versao_classificador, revisao_observacao, observado_em)
        values ($1, $2, ${valores.classificacao_id}, $3, 'sinal-de-prospeccao', 'mato-alto', 'ia-texto',
                ${valores.confianca}, 'inferida', ${valores.modelo}, 1, 1, ${valores.revisao_observacao}, now())`,
      [pai, av, USUARIO])).rejects.toThrow(/check|violates/i);
      await db.exec("rollback to savepoint check_prov");
    }
  });

  it("confirmar e contestar preservam a proveniência da IA e registram quem e quando", async () => {
    const pai = await apoio.identidade();
    const av = await apoio.avistamento(pai, "2026-09-10T12:00:00Z");
    const { claim } = await apoio.classificar(av, "p".repeat(64), [
      { categoria: "sinal-de-prospeccao", codigo: "imovel-fechado", confianca: 90 },
      { categoria: "sinal-de-prospeccao", codigo: "mato-alto", confianca: 80 },
    ]);
    const [fechado, mato] = await apoio.etiquetas(av);
    await apoio.comoUsuario("select public.definir_estado_etiqueta($1, 'confirmada')", [fechado.id]);
    await apoio.comoUsuario("select public.definir_estado_etiqueta($1, 'contestada')", [mato.id]);
    const depois = await apoio.etiquetas(av);
    expect(depois.find((e) => e.id === fechado.id)).toMatchObject({
      estado: "confirmada", origem: "ia-texto", confianca: 90, modelo: "gpt-5.6-luna",
      classificacao_id: claim.run_id, confirmada_por: USUARIO,
    });
    expect(depois.find((e) => e.id === fechado.id)!.confirmada_em).not.toBeNull();
    // Contestar não é delete: a linha fica, com a proveniência intacta.
    expect(depois.find((e) => e.id === mato.id)).toMatchObject({
      estado: "contestada", origem: "ia-texto", confianca: 80, classificacao_id: claim.run_id,
    });
    expect(depois).toHaveLength(2);
  });
});

/* ---------------- Tela: chips, tipo e ações ---------------- */

function etiqueta(sobrescritas: Partial<EtiquetaIdentificado> = {}): EtiquetaIdentificado {
  return {
    id: 1,
    imovelIdentificadoId: "identificado-1",
    avistamentoId: "avistamento-corrente",
    classificacaoId: "classificacao-1",
    categoria: "sinal-de-prospeccao",
    codigo: "imovel-fechado",
    origem: "ia-texto",
    confianca: 88,
    estado: "inferida",
    observadoEm: "2026-09-10T12:00:00.000Z",
    modelo: "gpt-5.6-luna",
    versaoCatalogo: 1,
    versaoClassificador: 1,
    revisaoObservacao: 1,
    confirmadaPor: null,
    confirmadaEm: null,
    substituidaEm: null,
    substituidaPorClassificacaoId: null,
    desatualizadaEm: null,
    criadoEm: "2026-09-10T12:00:01.000Z",
    ...sobrescritas,
  };
}

function detalhe(sobrescritas: Record<string, unknown> = {}, opcoes: {
  etiquetas?: EtiquetaIdentificado[];
  classificacaoEstado?: string;
  classificacoes?: unknown[];
} = {}) {
  return {
    identificado: {
      id: "identificado-1",
      situacao: "identificado",
      logradouro: "Rua das Palmeiras",
      numero: "120",
      unidade: null, bloco: null, edificio: null,
      bairro: "Centro", cidade: "Londrina", estado: "PR", cep: null, pontoReferencia: null,
      latitude: null, longitude: null, acuraciaMetros: null, precisaoLocalizacao: "desconhecida",
      tipo: null, tipoOrigem: null, tipoConfianca: null, tipoEstado: null, tipoDefinidoEm: null,
      tipoClassificacaoId: null, tipoAvistamentoId: null, tipoConfirmadoPor: null, tipoConfirmadoEm: null,
      avistamentosTotal: 1,
      primeiroAvistamentoEm: "2026-09-10T12:00:00.000Z",
      ultimoAvistamentoEm: "2026-09-10T12:00:00.000Z",
      avistamentoCorrenteId: "avistamento-corrente",
      origemIdentificacao: "campo", ultimaInvestigacaoEm: null, imovelId: null, promovidoEm: null,
      descartadoMotivo: null, descartadoEm: null, fundidoEm: null, fundidoEmImovelId: null,
      exclusaoSolicitadaEm: null, criadoEm: "2026-09-10T12:00:00.000Z", atualizadoEm: "2026-09-10T12:00:00.000Z",
      ...sobrescritas,
    },
    avistamentos: [{
      id: "avistamento-corrente",
      imovelIdentificadoId: "identificado-1",
      observadoEm: "2026-09-10T12:00:00.000Z",
      createdAt: "2026-09-10T12:00:00.000Z",
      latitude: null, longitude: null, acuraciaMetros: null, precisaoLocalizacao: "desconhecida",
      observacao: "Casa fechada, sem placa na frente.",
      observacaoRevisao: 1,
      classificacaoEstado: opcoes.classificacaoEstado ?? "concluida",
      revisaoConflitoEm: null,
      classificacaoId: "classificacao-1",
      classificacaoEm: "2026-09-10T12:01:00.000Z",
      fingerprint: "f",
      fotos: [],
      classificacoes: opcoes.classificacoes ?? [],
      etiquetas: opcoes.etiquetas ?? [etiqueta()],
    }],
    etiquetasDoImovel: [],
    classificacoesCarregadas: true,
  } as never;
}

describe("marcas e descrição de proveniência", () => {
  it("diferencia IA inferida, confirmada, manual e histórica", () => {
    expect(marcaProveniencia({ origem: "ia-texto", estado: "inferida" })).toBe("IA");
    expect(marcaProveniencia({ origem: "ia-texto", estado: "confirmada" })).toBe("Confirmada");
    expect(marcaProveniencia({ origem: "manual", estado: "confirmada" })).toBe("Confirmada");
    expect(marcaProveniencia({ origem: "manual", estado: "inferida" })).toBe("Manual");
    expect(marcaProveniencia({ origem: "ia-texto", estado: "substituida" })).toBe("Histórica");
    expect(marcaProveniencia({ origem: "ia-texto", estado: "desatualizada" })).toBe("Histórica");
    expect(marcaProveniencia({ origem: "ia-texto", estado: "contestada" })).toBe("Contestada");
  });

  it("descreve origem, sinal, modelo e avistamento sem vender probabilidade", () => {
    const texto = descreverProveniencia(etiqueta());
    expect(texto).toContain("IA sobre o texto · sinal 88");
    expect(texto).toContain("gpt-5.6-luna");
    expect(texto).toContain("avistamento de 10/09/2026");
    expect(texto).not.toMatch(/%|chance|probabilidade/);
    expect(descreverProveniencia(etiqueta({ estado: "confirmada", confirmadaEm: "2026-09-11T09:00:00.000Z", confirmadaPor: "u" })))
      .toContain("confirmada em 11/09/2026");
    expect(descreverProveniencia(etiqueta({ origem: "manual", confianca: null, modelo: null, avistamentoId: null, classificacaoId: null, estado: "confirmada", confirmadaEm: "2026-09-11T09:00:00.000Z" })))
      .toMatch(/^Aplicada manualmente · sobre o lugar/);
  });
});

describe("CardIdentificado", () => {
  afterEach(cleanup);

  it("mostra só as etiquetas atuais recebidas, com marca de proveniência, e o tipo com marca de IA", () => {
    render(createElement(CardIdentificado, {
      identificado: (detalhe({ tipo: "Casa", tipoEstado: "inferido", tipoOrigem: "ia-texto" }) as { identificado: never }).identificado,
      selecionado: false,
      aoSelecionar: vi.fn(),
      etiquetasAtuais: [
        { categoria: "sinal-de-prospeccao", codigo: "imovel-fechado", ultimaVezObservado: "2026-09-10T12:00:00.000Z", vigenteNoAvistamentoCorrente: true, estado: "inferida", origem: "ia-texto", confianca: 88 },
        { categoria: "sinal-de-prospeccao", codigo: "mato-alto", ultimaVezObservado: "2026-09-10T12:00:00.000Z", vigenteNoAvistamentoCorrente: true, estado: "confirmada", origem: "ia-texto", confianca: 80 },
      ],
    }));
    const chips = [...document.querySelectorAll("[data-origem]")];
    expect(chips.map((chip) => chip.textContent)).toEqual(["Imóvel fechadoIA", "Mato altoConfirmada"]);
    expect(screen.getByText(/Casa · IA/)).toBeTruthy();
  });
});

describe("PainelIdentificado", () => {
  beforeEach(() => { vi.clearAllMocks(); cenario.estado.classificandoAvistamentoId = null; });
  afterEach(cleanup);

  it("etiqueta inferida: chip com marca IA, proveniência legível, e Confirmar/Contestar chamam o estado", () => {
    render(createElement(PainelIdentificado, { detalhe: detalhe() }));
    const bloco = document.querySelector("[data-etiqueta-id='1']")!;
    expect(bloco.querySelector("[data-origem]")!.textContent).toBe("Imóvel fechadoIA");
    expect(bloco.textContent).toContain("IA sobre o texto · sinal 88");
    expect(bloco.textContent).toContain("gpt-5.6-luna");
    expect(bloco.textContent).not.toMatch(/prompt|Você classifica|json|token/i);
    fireEvent.click(screen.getByRole("button", { name: "Confirmar" }));
    expect(cenario.estado.confirmarEtiqueta).toHaveBeenCalledWith("identificado-1", 1);
    fireEvent.click(screen.getByRole("button", { name: "Contestar" }));
    expect(cenario.estado.contestarEtiqueta).toHaveBeenCalledWith("identificado-1", 1);
  });

  it("etiqueta confirmada não oferece Confirmar de novo; a manual aparece como humana", () => {
    render(createElement(PainelIdentificado, { detalhe: detalhe({}, { etiquetas: [
      etiqueta({ id: 7, estado: "confirmada", confirmadaPor: "u", confirmadaEm: "2026-09-11T09:00:00.000Z" }),
      etiqueta({ id: 8, codigo: "mato-alto", origem: "manual", confianca: null, modelo: null, estado: "confirmada", confirmadaPor: "u", confirmadaEm: "2026-09-11T09:00:00.000Z", classificacaoId: null }),
    ] }) }));
    expect(screen.queryByRole("button", { name: "Confirmar" })).toBeNull();
    expect(document.querySelector("[data-etiqueta-id='7'] [data-origem]")!.textContent).toBe("Imóvel fechadoConfirmada");
    expect(document.querySelector("[data-etiqueta-id='8']")!.textContent).toContain("Aplicada manualmente");
  });

  it("tipo inferido pela IA fica marcado como inferido, com sinal e avistamento, e Confirmar tipo chama a ação", () => {
    render(createElement(PainelIdentificado, { detalhe: detalhe({
      tipo: "Casa", tipoOrigem: "ia-texto", tipoConfianca: 76, tipoEstado: "inferido",
      tipoClassificacaoId: "classificacao-1", tipoAvistamentoId: "avistamento-corrente", tipoDefinidoEm: "2026-09-10T12:01:00.000Z",
    }) }));
    const marca = document.querySelector("[data-tipo-estado]")!;
    expect(marca.getAttribute("data-tipo-estado")).toBe("inferido");
    expect(marca.textContent).toBe("Inferido pela IA");
    expect(document.body.textContent).toContain("IA sobre o texto · sinal 76 · avistamento de 10/09/2026");
    fireEvent.click(screen.getByRole("button", { name: "Confirmar tipo" }));
    expect(cenario.estado.confirmarTipo).toHaveBeenCalledWith("identificado-1");
  });

  it("tipo confirmado mantém a origem IA à vista e não oferece Confirmar tipo; tipo manual nem marca de IA", () => {
    const { unmount } = render(createElement(PainelIdentificado, { detalhe: detalhe({
      tipo: "Casa", tipoOrigem: "ia-texto", tipoConfianca: 76, tipoEstado: "confirmado",
      tipoClassificacaoId: "classificacao-1", tipoAvistamentoId: "avistamento-corrente",
      tipoConfirmadoPor: "u", tipoConfirmadoEm: "2026-09-11T09:00:00.000Z",
    }) }));
    expect(document.querySelector("[data-tipo-estado]")!.textContent).toBe("Confirmado");
    expect(document.body.textContent).toContain("IA sobre o texto · sinal 76");
    expect(document.body.textContent).toContain("confirmado em 11/09/2026");
    expect(screen.queryByRole("button", { name: "Confirmar tipo" })).toBeNull();
    unmount();

    render(createElement(PainelIdentificado, { detalhe: detalhe({ tipo: "Galpão", tipoOrigem: "manual", tipoEstado: "declarado" }) }));
    const marcaManual = document.querySelector("[data-tipo-estado]")!;
    expect(marcaManual.textContent).toBe("Declarado");
    expect(marcaManual.closest("div")!.textContent).toContain("definido manualmente");
    expect(marcaManual.closest("div")!.textContent).not.toContain("IA sobre o texto");
    expect(screen.queryByRole("button", { name: "Confirmar tipo" })).toBeNull();
  });

  it("avistamento corrente pendente ou indisponível: 'Aguardando classificação' e 'Classificar agora', sem erro na tela", () => {
    for (const estado of ["pendente", "indisponivel"]) {
      cenario.estado.classificarAvistamento.mockClear();
      const { unmount } = render(createElement(PainelIdentificado, { detalhe: detalhe({}, { classificacaoEstado: estado, etiquetas: [] }) }));
      expect(screen.getByRole("status").textContent).toContain("Aguardando classificação");
      expect(screen.queryByRole("alert")).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Classificar agora" }));
      expect(cenario.estado.classificarAvistamento).toHaveBeenCalledWith("identificado-1", "avistamento-corrente");
      unmount();
    }
    // Concluído: nada de aguardar.
    render(createElement(PainelIdentificado, { detalhe: detalhe() }));
    expect(screen.queryByRole("button", { name: "Classificar agora" })).toBeNull();
  });

  it("enquanto classifica, o botão fica desabilitado e a linha do tempo diz 'Classificando…'", () => {
    cenario.estado.classificandoAvistamentoId = "avistamento-corrente";
    render(createElement(PainelIdentificado, { detalhe: detalhe({}, { classificacaoEstado: "pendente", etiquetas: [] }) }));
    expect((screen.getByRole("button", { name: "Classificar agora" }) as HTMLButtonElement).disabled).toBe(true);
    expect(document.body.textContent).toContain("Classificando…");
  });
});

describe("LinhaDoTempoAvistamentos", () => {
  afterEach(cleanup);

  it("por avistamento: estado, quando concluiu, modo, modelo, tipo sugerido e se refletiu o corrente; histórica não vira atual", () => {
    const d = detalhe({}, {
      etiquetas: [
        etiqueta({ id: 1 }),
        etiqueta({ id: 2, codigo: "mato-alto", estado: "substituida", substituidaEm: "2026-09-12T00:00:00.000Z", substituidaPorClassificacaoId: "classificacao-2" }),
      ],
      classificacoes: [
        { id: "classificacao-2", estado: "concluida", modo: "modelo", modelo: "gpt-5.6-luna", concluidaEm: "2026-09-12T10:00:00.000Z", tipoSugerido: "Casa", tipoConfianca: 76, snapshotAplicado: true },
        { id: "classificacao-x", estado: "falhou", modo: "modelo", modelo: "gpt-5.6-luna", concluidaEm: "2026-09-13T10:00:00.000Z", tipoSugerido: null, tipoConfianca: null, snapshotAplicado: false },
      ],
    }) as { avistamentos: never[] };
    const aoClassificar = vi.fn();
    const { container } = render(createElement(LinhaDoTempoAvistamentos, {
      avistamentos: d.avistamentos, avistamentoCorrenteId: "avistamento-corrente", aoClassificar,
    }));
    const evento = container.querySelector("[data-avistamento-id='avistamento-corrente']")!;
    expect(evento.getAttribute("data-classificacao-estado")).toBe("concluida");
    expect(evento.textContent).toContain("Classificado em 12/09/2026");
    expect(evento.textContent).toContain("pelo modelo");
    expect(evento.textContent).toContain("gpt-5.6-luna");
    expect(evento.textContent).toContain("Tipo sugerido: Casa (sinal 76)");
    expect(evento.textContent).toContain("Reflete o avistamento corrente");
    const chips = [...evento.querySelectorAll("[data-origem]")];
    expect(chips.map((c) => `${c.getAttribute("data-estado")}:${c.textContent}`))
      .toEqual(["inferida:Imóvel fechadoIA", "substituida:Mato altoHistórica"]);
    // Concluído não oferece o botão; a falha não vira o rótulo do evento.
    expect(screen.queryByRole("button", { name: "Classificar observação" })).toBeNull();
  });

  it("avistamento antigo pendente pode ser classificado por si — e o botão pede exatamente aquele id", () => {
    const d = detalhe({}, { classificacaoEstado: "pendente", etiquetas: [], classificacoes: [] }) as { avistamentos: never[] };
    const aoClassificar = vi.fn();
    render(createElement(LinhaDoTempoAvistamentos, {
      avistamentos: d.avistamentos, avistamentoCorrenteId: "outro", aoClassificar,
    }));
    fireEvent.click(screen.getByRole("button", { name: "Classificar observação" }));
    expect(aoClassificar).toHaveBeenCalledWith("avistamento-corrente");
    // Somente leitura (exclusão pendente): sem ação.
    cleanup();
    render(createElement(LinhaDoTempoAvistamentos, { avistamentos: d.avistamentos, avistamentoCorrenteId: "outro" }));
    expect(screen.queryByRole("button", { name: "Classificar observação" })).toBeNull();
    expect(document.body.textContent).toContain("Aguardando classificação");
  });
});
