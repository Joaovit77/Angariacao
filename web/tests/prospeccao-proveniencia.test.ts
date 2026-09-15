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
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const cenario = vi.hoisted(() => ({
  estado: {
    salvando: false,
    carregando: false,
    classificandoAvistamentoId: null as string | null,
    buscarDuplicatas: vi.fn(async () => []),
    carregarMemoria: vi.fn(async () => ({ investigacoes: [], atributos: [] })),
    confirmarAtributo: vi.fn(async () => false),
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
  it("diferencia sugestão da IA, confirmado, manual e visto antes (C9.1: marcas em linguagem de campo)", () => {
    expect(marcaProveniencia({ origem: "ia-texto", estado: "inferida" })).toBe("sugestão");
    expect(marcaProveniencia({ origem: "ia-texto", estado: "confirmada" })).toBe("confirmado");
    expect(marcaProveniencia({ origem: "manual", estado: "confirmada" })).toBe("confirmado");
    expect(marcaProveniencia({ origem: "manual", estado: "inferida" })).toBe("manual");
    // C9: cada estado do banco tem marca própria; "visto antes" é apresentação
    // de uma etiqueta vigente de passagem anterior.
    expect(marcaProveniencia({ origem: "ia-texto", estado: "substituida" })).toBe("substituída");
    expect(marcaProveniencia({ origem: "ia-texto", estado: "desatualizada" })).toBe("texto mudou");
    expect(marcaProveniencia({ origem: "ia-texto", estado: "contestada" })).toBe("incorreta");
    expect(marcaProveniencia({ origem: "ia-texto", estado: "inferida" }, true)).toBe("visto antes");
    expect(marcaProveniencia({ origem: "ia-texto", estado: "substituida" }, true)).toBe("substituída");
  });

  it("descreve origem, apoio no texto e passagem sem vender probabilidade nem nome de modelo", () => {
    const texto = descreverProveniencia(etiqueta());
    expect(texto).toContain("a partir do texto · apoio no texto: moderado (88 de 100)");
    // V7 §16: nome de modelo nunca vai para a tela; fica só na proveniência persistida.
    expect(texto).not.toContain("gpt-5.6-luna");
    expect(texto).toContain("passagem de 10/09/2026");
    expect(texto).not.toMatch(/%|chance|probabilidade|sinal/);
    expect(descreverProveniencia(etiqueta({ estado: "confirmada", confirmadaEm: "2026-09-11T09:00:00.000Z", confirmadaPor: "u" })))
      .toContain("confirmado por você em 11/09/2026");
    expect(descreverProveniencia(etiqueta({ origem: "manual", confianca: null, modelo: null, avistamentoId: null, classificacaoId: null, estado: "confirmada", confirmadaEm: "2026-09-11T09:00:00.000Z" })))
      .toMatch(/^aplicada manualmente · sobre o lugar/);
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
    expect(chips.map((chip) => chip.textContent)).toEqual(["Imóvel fechadosugestão", "Mato altoconfirmado"]);
    expect(screen.getByText(/Casa · sugestão/)).toBeTruthy();
  });
});

describe("PainelIdentificado", () => {
  beforeEach(() => { vi.clearAllMocks(); cenario.estado.classificandoAvistamentoId = null; });
  afterEach(cleanup);

  it("etiqueta sugerida: chip 'sugestão', explicação humana, e Confirmar / Marcar como incorreta chamam o estado", () => {
    render(createElement(PainelIdentificado, { detalhe: detalhe() }));
    const bloco = document.querySelector("[data-etiqueta-id='1']")!;
    expect(bloco.querySelector("[data-origem]")!.textContent).toBe("Imóvel fechadosugestão");
    expect(bloco.textContent).toContain("Sugestão da IA a partir do texto; ainda não confirmada por uma pessoa.");
    // Apoio no texto só nos detalhes da análise, não no bloco da etiqueta.
    expect(bloco.textContent).not.toMatch(/88|sinal|apoio/);
    expect(document.querySelector("[data-detalhes-analise]")!.textContent).toContain("Imóvel fechado: a partir do texto · apoio no texto: moderado (88 de 100)");
    expect(bloco.textContent).not.toContain("gpt-5.6-luna");
    expect(bloco.textContent).not.toMatch(/prompt|Você classifica|json|token/i);
    const confirmar = screen.getByRole("button", { name: "Confirmar" });
    fireEvent.click(confirmar);
    expect(cenario.estado.confirmarEtiqueta).toHaveBeenCalledWith("identificado-1", 1);
    const incorreta = screen.getByRole("button", { name: "Marcar como incorreta" });
    fireEvent.click(incorreta);
    expect(cenario.estado.contestarEtiqueta).toHaveBeenCalledWith("identificado-1", 1);
    // A consequência está escrita antes do clique e ligada ao botão.
    expect(document.getElementById(confirmar.getAttribute("aria-describedby")!)!.textContent)
      .toContain("Se o texto for corrigido depois, a confirmação é mantida, mas pode aparecer para revisão.");
    expect(document.getElementById(incorreta.getAttribute("aria-describedby")!)!.textContent)
      .toContain("Ela deixa de aparecer como informação atual e permanece no histórico.");
    expect(document.body.textContent).not.toMatch(/para sempre/i);
  });

  it("etiqueta confirmada não oferece Confirmar de novo; a manual aparece como humana", () => {
    render(createElement(PainelIdentificado, { detalhe: detalhe({}, { etiquetas: [
      etiqueta({ id: 7, estado: "confirmada", confirmadaPor: "u", confirmadaEm: "2026-09-11T09:00:00.000Z" }),
      etiqueta({ id: 8, codigo: "mato-alto", origem: "manual", confianca: null, modelo: null, estado: "confirmada", confirmadaPor: "u", confirmadaEm: "2026-09-11T09:00:00.000Z", classificacaoId: null }),
    ] }) }));
    expect(screen.queryByRole("button", { name: "Confirmar" })).toBeNull();
    expect(document.querySelector("[data-etiqueta-id='7'] [data-origem]")!.textContent).toBe("Imóvel fechadoconfirmado");
    expect(document.querySelector("[data-etiqueta-id='7']")!.textContent).toContain("Confirmado por você em 11/09/2026");
    const manual = document.querySelector("[data-etiqueta-id='8']")!;
    expect(manual.querySelector("[data-origem]")!.getAttribute("data-origem")).toBe("manual");
    expect(manual.textContent).toContain("Confirmado por você em 11/09/2026");
    expect(manual.textContent).not.toMatch(/IA/);
  });

  it("tipo sugerido pela IA: marca 'sugestão da IA', passagem de origem, e 'Confirmar que é Casa' confirma a sugestão (não vira manual)", () => {
    render(createElement(PainelIdentificado, { detalhe: detalhe({
      tipo: "Casa", tipoOrigem: "ia-texto", tipoConfianca: 76, tipoEstado: "inferido",
      tipoClassificacaoId: "classificacao-1", tipoAvistamentoId: "avistamento-corrente", tipoDefinidoEm: "2026-09-10T12:01:00.000Z",
    }) }));
    const marca = document.querySelector("[data-tipo-estado]")!;
    expect(marca.getAttribute("data-tipo-estado")).toBe("inferido");
    expect(marca.textContent).toBe("sugestão da IA");
    expect(document.body.textContent).toContain("Sugestão da IA a partir do texto da passagem de 10/09/2026");
    expect(document.body.textContent).toContain("ainda não confirmada por uma pessoa");
    // O apoio (76 → moderado) vive nos detalhes; "sinal" não existe mais.
    expect(document.querySelector("[data-detalhes-analise]")!.textContent).toContain("Tipo Casa: a partir do texto · apoio no texto: moderado (76 de 100)");
    expect(document.body.textContent).not.toMatch(/sinal/);
    const botao = screen.getByRole("button", { name: "Confirmar que é Casa" });
    expect(document.getElementById(botao.getAttribute("aria-describedby")!)!.textContent)
      .toBe("Você confirma a sugestão de tipo. Ela ficará marcada como confirmada por você.");
    expect(document.body.textContent).not.toMatch(/tipo informado por você/i);
    fireEvent.click(botao);
    // A ação é a MESMA de antes: confirma a sugestão; não define tipo manual.
    expect(cenario.estado.confirmarTipo).toHaveBeenCalledWith("identificado-1");
    expect(cenario.estado.definirTipo).not.toHaveBeenCalled();
    // Cabeçalho resume com a marca curta.
    expect(document.querySelector("[data-resumo-cabecalho]")!.textContent).toContain("Casa · sugestão");
  });

  it("tipo confirmado mantém a origem IA à vista e não oferece confirmar de novo; tipo informado por você nem marca de IA", () => {
    const { unmount } = render(createElement(PainelIdentificado, { detalhe: detalhe({
      tipo: "Casa", tipoOrigem: "ia-texto", tipoConfianca: 76, tipoEstado: "confirmado",
      tipoClassificacaoId: "classificacao-1", tipoAvistamentoId: "avistamento-corrente",
      tipoConfirmadoPor: "u", tipoConfirmadoEm: "2026-09-11T09:00:00.000Z",
    }) }));
    expect(document.querySelector("[data-tipo-estado]")!.textContent).toBe("confirmado por você");
    expect(document.body.textContent).toContain("Sugestão da IA confirmada por você em 11/09/2026");
    expect(document.querySelector("[data-detalhes-analise]")!.textContent).toContain("apoio no texto: moderado (76 de 100) · confirmado por você em 11/09/2026");
    expect(screen.queryByRole("button", { name: /Confirmar que é/ })).toBeNull();
    unmount();

    render(createElement(PainelIdentificado, { detalhe: detalhe({ tipo: "Galpão", tipoOrigem: "manual", tipoEstado: "declarado" }) }));
    const marcaManual = document.querySelector("[data-tipo-estado]")!;
    expect(marcaManual.textContent).toBe("informado por você");
    expect(marcaManual.closest("div")!.textContent).toContain("Informado por você.");
    expect(marcaManual.closest("div")!.textContent).not.toMatch(/IA/);
    expect(screen.queryByRole("button", { name: /Confirmar que é/ })).toBeNull();
  });

  it("passagem mais recente ainda não analisada: 'Precisa de atenção' explica e oferece 'Analisar agora'; indisponível vira motivo + 'Tentar de novo'", () => {
    cenario.estado.classificarAvistamento.mockClear();
    const { unmount } = render(createElement(PainelIdentificado, { detalhe: detalhe({}, { classificacaoEstado: "pendente", etiquetas: [] }) }));
    const atencao = screen.getByRole("region", { name: "Precisa de atenção" });
    expect(atencao.querySelector("[data-atencao='nao-analisada']")!.getAttribute("data-nivel")).toBe("info");
    expect(atencao.textContent).toContain("A observação desta passagem ainda não foi analisada.");
    expect(screen.queryByRole("alert")).toBeNull();
    fireEvent.click(within(atencao).getByRole("button", { name: "Analisar agora" }));
    expect(cenario.estado.classificarAvistamento).toHaveBeenCalledWith("identificado-1", "avistamento-corrente");
    unmount();

    // `indisponivel` sem tentativa recente: a análise não aconteceu; diz isso e oferece tentar de novo.
    cenario.estado.classificarAvistamento.mockClear();
    render(createElement(PainelIdentificado, { detalhe: detalhe({}, { classificacaoEstado: "indisponivel", etiquetas: [] }) }));
    const falha = document.querySelector("[data-atencao='falha']")!;
    expect(falha.getAttribute("data-nivel")).toBe("erro");
    expect(falha.textContent).toContain("Não foi possível analisar agora. Tente novamente.");
    fireEvent.click(within(falha as HTMLElement).getByRole("button", { name: "Tentar de novo" }));
    expect(cenario.estado.classificarAvistamento).toHaveBeenCalledWith("identificado-1", "avistamento-corrente");
    cleanup();

    // Concluído sem sugestões pendentes: a seção de atenção nem existe.
    render(createElement(PainelIdentificado, { detalhe: detalhe({}, { etiquetas: [] }) }));
    expect(screen.queryByRole("region", { name: "Precisa de atenção" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Analisar agora" })).toBeNull();
  });

  it("enquanto analisa, o botão fica desabilitado e a tela diz 'Analisando'", () => {
    cenario.estado.classificandoAvistamentoId = "avistamento-corrente";
    render(createElement(PainelIdentificado, { detalhe: detalhe({}, { classificacaoEstado: "pendente", etiquetas: [] }) }));
    const atencao = screen.getByRole("region", { name: "Precisa de atenção" });
    expect((within(atencao).getByRole("button", { name: "Analisar agora" }) as HTMLButtonElement).disabled).toBe(true);
    expect(document.body.textContent).toContain("Analisando a observação…");
  });
});

describe("LinhaDoTempoAvistamentos", () => {
  afterEach(cleanup);

  it("por passagem: estado, modo, tipo sugerido e se reflete a mais recente; a auditoria (data, apoio) fica em 'Ver detalhes'", () => {
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
    expect(evento.textContent).toContain("Analisado pela IA");
    expect(evento.textContent).not.toContain("gpt-5.6-luna");
    expect(evento.querySelector("[data-tipo-sugerido]")!.textContent).toBe("Tipo: Casasugestão");
    expect(evento.textContent).toContain("Estas informações refletem a passagem mais recente.");
    const chips = [...evento.querySelectorAll("[data-origem]")];
    expect(chips.map((c) => `${c.getAttribute("data-estado")}:${c.textContent}`))
      .toEqual(["inferida:Imóvel fechadosugestão", "substituida:Mato altosubstituída"]);
    // Auditoria só nos detalhes: data da análise e apoio no texto (76 → moderado, tipo não tem piso).
    const detalhes = evento.querySelector("details[data-detalhes]") as HTMLDetailsElement;
    expect(detalhes.open).toBe(false);
    expect(detalhes.textContent).toContain("Analisada em 12/09/2026");
    expect(detalhes.textContent).toContain("Tipo sugerido: Casa · apoio no texto: moderado (76 de 100)");
    expect(evento.textContent.replace(detalhes.textContent, "")).not.toMatch(/12\/09\/2026|76|sinal/);
    // Concluído não oferece o botão; a falha não vira o rótulo da passagem.
    expect(screen.queryByRole("button", { name: "Analisar agora" })).toBeNull();
  });

  it("passagem antiga não analisada pode ser analisada por si — e o botão pede exatamente aquele id", () => {
    const d = detalhe({}, { classificacaoEstado: "pendente", etiquetas: [], classificacoes: [] }) as { avistamentos: never[] };
    const aoClassificar = vi.fn();
    render(createElement(LinhaDoTempoAvistamentos, {
      avistamentos: d.avistamentos, avistamentoCorrenteId: "outro", aoClassificar,
    }));
    fireEvent.click(screen.getByRole("button", { name: "Analisar agora" }));
    expect(aoClassificar).toHaveBeenCalledWith("avistamento-corrente");
    // Somente leitura (exclusão pendente): sem ação.
    cleanup();
    render(createElement(LinhaDoTempoAvistamentos, { avistamentos: d.avistamentos, avistamentoCorrenteId: "outro" }));
    expect(screen.queryByRole("button", { name: "Analisar agora" })).toBeNull();
    expect(document.body.textContent).toContain("Ainda não analisada");
  });
});
