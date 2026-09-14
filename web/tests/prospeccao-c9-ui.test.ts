// @vitest-environment jsdom

/* ================================================================
   C9 — TELA: conflito de revisão, estados temporais, reuso e histórico

   O banco preserva os eventos; a tela decide o que é atual, histórico,
   desatualizado ou substituído — por leitura derivada (`etiquetasDoImovel`),
   nunca por coluna. Aqui se prova que o card não promove histórico a atual,
   que o painel separa atual de histórico ("visto em…"), que a linha do
   tempo mantém as etiquetas de cada passagem com o estado próprio, que
   reuso aparece distinto de modelo e que o aviso de conflito aparece só
   quando há `revisao_conflito_em`. C9.1: tudo isso em linguagem de campo
   (marcas "sugestão / confirmado / incorreta / texto mudou / substituída /
   visto antes"), com a auditoria atrás de "Ver detalhes".
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
import { apoioNoTexto, descreverProveniencia, explicarEtiqueta, faixaDeApoio, marcaProveniencia } from "@/components/prospeccao/EtiquetasImovel";
import LinhaDoTempoAvistamentos, { situacaoTemporalDaExecucao } from "@/components/prospeccao/LinhaDoTempoAvistamentos";
import { MENSAGEM_FALHA_ANALISE_GENERICA, mensagemFalhaAnalise } from "@/components/prospeccao/textosAnalise";
import PainelIdentificado, { explicacaoInformarTipo } from "@/components/prospeccao/PainelIdentificado";
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
  it("não aparece sem conflito; com conflito nomeia o que foi confirmado, diz que a confirmação foi mantida e pede revisão, sem botão de resolver", () => {
    const { container, rerender } = render(createElement(AvisoRevisaoConflito, { revisaoConflitoEm: null, revisaoObservacao: 2 }));
    expect(container.querySelector("[data-revisao-conflito]")).toBeNull();
    rerender(createElement(AvisoRevisaoConflito, {
      revisaoConflitoEm: "2026-11-12T10:00:00.000Z", revisaoObservacao: 2, etiquetasConfirmadas: ["Sem placa visível"],
    }));
    const aviso = screen.getByRole("alert");
    expect(aviso.textContent).toContain("Vale revisar esta informação.");
    expect(aviso.textContent).toContain("Você confirmou “Sem placa visível”, mas depois alterou o texto usado naquela análise");
    expect(aviso.textContent).toContain("12/11/2026");
    expect(aviso.textContent).toContain("revisão 2");
    expect(aviso.textContent).toContain("A confirmação foi mantida. Se o texto novo a contradiz, marque como incorreta.");
    // Não inventa resolução: nem botão, nem promessa de que o sistema decide.
    expect(aviso.querySelector("button")).toBeNull();
    expect(aviso.textContent).not.toMatch(/resolvid|resolver/i);
  });

  it("sem os nomes das etiquetas, fala em 'informações desta passagem'; com duas, lista as duas", () => {
    render(createElement(AvisoRevisaoConflito, { revisaoConflitoEm: "2026-11-12T10:00:00.000Z", revisaoObservacao: 2 }));
    expect(screen.getByRole("alert").textContent).toContain("Você confirmou informações desta passagem");
    cleanup();
    render(createElement(AvisoRevisaoConflito, {
      revisaoConflitoEm: "2026-11-12T10:00:00.000Z", revisaoObservacao: 3, etiquetasConfirmadas: ["Sem placa visível", "Mato alto"],
    }));
    expect(screen.getByRole("alert").textContent).toContain("“Sem placa visível” e “Mato alto”");
    expect(screen.getByRole("alert").textContent).toContain("Se o texto novo as contradiz");
    cleanup();
    // Na linha do tempo: marca curta.
    render(createElement(AvisoRevisaoConflito, { compacto: true, revisaoConflitoEm: "2026-11-12T10:00:00.000Z", revisaoObservacao: 2 }));
    expect(document.querySelector("[data-revisao-conflito]")!.textContent).toContain("Texto corrigido depois de uma confirmação");
  });
});

describe("CardIdentificado", () => {
  it("mostra só o estado atual: a placa de setembro não entra, mesmo estando no histórico", () => {
    const d = detalhe();
    const atuais = vigenciaDasEtiquetas(d).filter((e) => e.vigenteNoAvistamentoCorrente);
    render(createElement(CardIdentificado, { identificado: d.identificado, selecionado: false, aoSelecionar: vi.fn(), etiquetasAtuais: atuais }));
    const chips = [...document.querySelectorAll("[data-origem]")].map((c) => c.textContent);
    expect(chips).toEqual(["Imóvel fechadosugestão"]);
    expect(document.body.textContent).not.toContain("Placa de aluga-se");
    // Atenção só a partir do que o card tem: uma sugestão a confirmar.
    expect(document.querySelector("[data-atencao='sugestoes']")!.textContent).toBe("1 sugestão a confirmar");
    expect(document.body.textContent).toContain("2 passagens · última em 10/11/2026");
    // Situação normal não aparece; o tipo vem com marca curta.
    expect(document.body.textContent).not.toContain("Identificado");
  });

  it("sem etiquetas carregadas (card não selecionado) não promete atenção nenhuma", () => {
    const d = detalhe();
    render(createElement(CardIdentificado, { identificado: d.identificado, selecionado: false, aoSelecionar: vi.fn() }));
    expect(document.querySelector("[data-atencao]")).toBeNull();
  });
});

describe("PainelIdentificado", () => {
  it("separa etiquetas atuais (corrente) do histórico com 'visto por último em', sem apagar setembro", () => {
    render(createElement(PainelIdentificado, { detalhe: detalhe() }));
    const atuais = screen.getByRole("region", { name: "O que sabemos agora" });
    expect([...atuais.querySelectorAll("[data-origem]")].map((c) => c.textContent)).toEqual(["Imóvel fechadosugestão"]);
    const historico = screen.getByRole("list", { name: "Visto anteriormente" });
    const item = historico.querySelector("[data-codigo='placa-aluga-se']")!;
    expect(item.querySelector("[data-historica='true']")!.textContent).toBe("Placa de aluga-sevisto antes");
    expect(item.textContent).toContain("Visto em 09/09/2026");
    expect(item.textContent).toContain("não apareceu na passagem mais recente");
  });

  it("mostra o aviso de conflito do avistamento corrente quando há revisao_conflito_em, e a confirmada segue confirmada", () => {
    const d = detalhe();
    d.avistamentos[0] = { ...d.avistamentos[0], observacaoRevisao: 2, revisaoConflitoEm: "2026-11-12T10:00:00.000Z",
      etiquetas: [etiqueta({ id: 20, estado: "confirmada", confirmadaPor: "u", confirmadaEm: "2026-11-11T09:00:00.000Z", revisaoObservacao: 1 })] };
    render(createElement(PainelIdentificado, { detalhe: d }));
    // O conflito vive em "Precisa de atenção", nomeando a etiqueta confirmada.
    const atencao = screen.getByRole("region", { name: "Precisa de atenção" });
    expect(atencao.querySelector("[data-atencao='conflito']")!.getAttribute("data-nivel")).toBe("atencao");
    expect(screen.getByRole("alert").textContent).toContain("Vale revisar esta informação.");
    expect(screen.getByRole("alert").textContent).toContain("Você confirmou “Imóvel fechado”, mas depois alterou o texto");
    const atuais = screen.getByRole("region", { name: "O que sabemos agora" });
    expect(atuais.querySelector("[data-estado='confirmada']")!.textContent).toBe("Imóvel fechadoconfirmado");
    expect(document.querySelector("[data-detalhes-analise]")!.textContent).toContain("revisão 1 do texto");
    expect(screen.getByRole("button", { name: "Marcar como incorreta" })).toBeTruthy();
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
    expect(screen.getByText("Nada identificado ainda nesta observação.")).toBeTruthy();
    // O histórico derivado mostra cada código com a situação real: a placa de
    // setembro (vigente lá, histórica aqui), a desatualizada e a substituída —
    // cada uma com a própria marca, nenhuma como atual.
    const historico = screen.getByRole("list", { name: "Visto anteriormente" });
    expect([...historico.querySelectorAll("[data-codigo]")].map((li) =>
      `${li.getAttribute("data-codigo")}:${li.querySelector("[data-estado]")!.getAttribute("data-estado")}:${li.querySelector("[data-estado] span")!.textContent}`))
      .toEqual(["imovel-fechado:desatualizada:texto mudou", "mato-alto:substituida:substituída", "placa-aluga-se:inferida:visto antes"]);
    expect(historico.textContent).toContain("Visto em 09/09/2026");
    expect(historico.textContent).toContain("Esta sugestão foi feita sobre um texto que depois foi corrigido");
    expect(historico.textContent).toContain("Uma análise mais recente trouxe outro resultado");
  });
});

describe("LinhaDoTempoAvistamentos", () => {
  it("cada passagem com as próprias etiquetas e estado; reuso explicado sem custo; setembro não vira substituída por novembro", () => {
    const d = detalhe();
    const { container } = render(createElement(LinhaDoTempoAvistamentos, { avistamentos: d.avistamentos, avistamentoCorrenteId: "av-nov" }));
    expect(screen.getByRole("list", { name: "Histórico de passagens" })).toBeTruthy();
    const nov = container.querySelector("[data-avistamento-id='av-nov']")!;
    const set = container.querySelector("[data-avistamento-id='av-set']")!;
    expect([...nov.querySelectorAll("[data-origem]")].map((c) => c.textContent)).toEqual(["Imóvel fechadosugestão"]);
    expect([...set.querySelectorAll("[data-origem]")].map((c) => `${c.getAttribute("data-estado")}:${c.textContent}`)).toEqual(["inferida:Placa de aluga-sesugestão"]);
    // Narrativa: a mais recente e a primeira, com o texto de cada uma.
    expect(nov.textContent).toContain("Passagem mais recente");
    expect(nov.textContent).toContain("Nova passagem registrada");
    expect(set.textContent).toContain("Primeira passagem");
    expect(set.textContent).not.toContain("Passagem mais recente");
    // Reuso × modelo em linguagem humana, sem token, custo ou "chamada".
    expect(nov.querySelector("[data-modo]")!.getAttribute("data-modo")).toBe("reuso");
    expect(nov.textContent).toContain("Já tínhamos analisado uma observação igual");
    expect(nov.textContent).toContain("O resultado anterior deste imóvel foi reaproveitado.");
    expect(nov.textContent).not.toMatch(/token|custo|chamada|reutilizad/i);
    expect(set.querySelector("[data-modo]")!.getAttribute("data-modo")).toBe("modelo");
    expect(set.textContent).toContain("Analisado pela IA");
    expect(set.textContent).toContain("O sistema leu a observação e identificou estas informações.");
    // Atual × anterior.
    expect(nov.textContent).toContain("Estas informações refletem a passagem mais recente.");
    expect(set.textContent).toContain("Registro anterior; as informações atuais vêm da passagem mais recente.");
    // Revisão só nos detalhes; sem marca "Texto corrigido" no texto original.
    expect(nov.querySelector("[data-texto-corrigido]")).toBeNull();
    expect(container.querySelector("[data-revisao-conflito]")).toBeNull();
    expect(nov.textContent).not.toMatch(/classifica|snapshot|corrente|avistamento/i);
  });

  it("'Ver detalhes' nasce fechado e guarda a auditoria: análise nova × reaproveitada (com a data da fonte), data, revisão e apoio no texto", () => {
    const d = detalhe();
    // A execução de novembro reaproveitou a de setembro: a data da fonte aparece nos detalhes.
    d.avistamentos[0] = { ...d.avistamentos[0], classificacoes: [{ ...d.avistamentos[0].classificacoes[0], reusadaDeClassificacaoId: "run-set" }] };
    const { container } = render(createElement(LinhaDoTempoAvistamentos, { avistamentos: d.avistamentos, avistamentoCorrenteId: "av-nov" }));
    const nov = container.querySelector("[data-avistamento-id='av-nov']")!;
    const set = container.querySelector("[data-avistamento-id='av-set']")!;
    const detalhesNov = nov.querySelector("details[data-detalhes]") as HTMLDetailsElement;
    expect(detalhesNov.open).toBe(false);
    expect(detalhesNov.querySelector("summary")!.textContent).toBe("Ver detalhes");
    expect(detalhesNov.textContent).toContain("Resultado reaproveitado de uma análise anterior (de 09/09/2026");
    expect(detalhesNov.textContent).toContain("Analisada em 10/11/2026");
    expect(detalhesNov.textContent).toContain("Texto original, sem correções.");
    expect(detalhesNov.textContent).toContain("Imóvel fechado: a partir do texto · apoio no texto: moderado (88 de 100)");
    expect(detalhesNov.textContent).toContain("não é uma probabilidade de acerto");
    const detalhesSet = set.querySelector("details[data-detalhes]")!;
    expect(detalhesSet.textContent).toContain("Análise nova.");
    expect(detalhesSet.textContent).toContain("Tipo sugerido: Casa · apoio no texto: moderado (72 de 100)");
    // Fora dos detalhes, nada de número de apoio nem "sinal".
    expect(nov.textContent.replace(detalhesNov.textContent, "")).not.toMatch(/88|sinal|apoio/);
  });

  it("texto mudou, substituída e incorreta aparecem com marca própria, e o conflito de revisão fica marcado na passagem", () => {
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
      "desatualizada:texto mudou", "substituida:substituída", "contestada:incorreta", "confirmada:confirmado",
    ]);
    expect(nov.querySelector("[data-texto-corrigido]")!.textContent).toBe("Texto corrigido");
    expect(nov.querySelector("details[data-detalhes]")!.textContent).toContain("Revisão 3 do texto");
    expect(nov.querySelector("[data-revisao-conflito]")!.textContent).toContain("Texto corrigido depois de uma confirmação");
  });

  /* Pós-smoke: `snapshot_aplicado` é fato histórico ("influenciou o snapshot
     quando concluiu") e continua `true` no banco quando outro avistamento
     vira o corrente. A leitura temporal da tela cruza esse fato com
     `avistamentoCorrenteId`; nenhum dado é reescrito para isso. */
  it("leitura temporal: corrente + snapshot aplicado reflete; corrente sem snapshot não alterou; não corrente é histórico mesmo com snapshot_aplicado=true", () => {
    const av1 = detalhe().avistamentos.find((a) => a.id === "av-set")!;
    const av2 = detalhe().avistamentos.find((a) => a.id === "av-nov")!;
    // AV1 acabou de ser classificado e, na época, era o corrente: snapshot aplicado.
    av1.classificacoes[0] = { ...av1.classificacoes[0], snapshotAplicado: true };
    const dados = JSON.stringify([av1, av2]);

    // 1. AV1 corrente com snapshotAplicado=true → reflete o corrente.
    let r = render(createElement(LinhaDoTempoAvistamentos, { avistamentos: [av1], avistamentoCorrenteId: "av-set" }));
    let set = r.container.querySelector("[data-avistamento-id='av-set']")!;
    expect(set.textContent).toContain("Estas informações refletem a passagem mais recente.");
    expect(set.textContent).not.toContain("Registro anterior");
    cleanup();

    // 2. AV2 passa a ser o corrente: AV1 conserva snapshotAplicado=true nos
    //    dados, mas a tela o lê como histórico. 3. AV2 corrente + aplicado reflete.
    r = render(createElement(LinhaDoTempoAvistamentos, { avistamentos: [av1, av2], avistamentoCorrenteId: "av-nov" }));
    set = r.container.querySelector("[data-avistamento-id='av-set']")!;
    const nov = r.container.querySelector("[data-avistamento-id='av-nov']")!;
    expect(av1.classificacoes[0].snapshotAplicado).toBe(true);
    expect(set.textContent).toContain("Registro anterior; as informações atuais vêm da passagem mais recente.");
    expect(set.textContent).not.toContain("refletem a passagem mais recente");
    expect(nov.textContent).toContain("Estas informações refletem a passagem mais recente.");
    cleanup();

    // 4. Corrente com snapshotAplicado=false (ex.: classificação concluída
    //    depois de o texto ser revisado de novo) → não alterou o estado atual.
    const av2SemSnapshot = { ...av2, classificacoes: [{ ...av2.classificacoes[0], snapshotAplicado: false }] };
    r = render(createElement(LinhaDoTempoAvistamentos, { avistamentos: [av1, av2SemSnapshot], avistamentoCorrenteId: "av-nov" }));
    expect(r.container.querySelector("[data-avistamento-id='av-nov']")!.textContent).toContain("Esta análise não mudou as informações atuais.");
    expect(r.container.querySelector("[data-avistamento-id='av-set']")!.textContent).toContain("Registro anterior; as informações atuais vêm da passagem mais recente.");
    cleanup();

    // 5. Apresentação pura: os objetos de entrada saem como entraram.
    expect(JSON.stringify([av1, av2])).toBe(dados);
  });

  it("situacaoTemporalDaExecucao: a tabela de verdade do contrato de apresentação", () => {
    expect(situacaoTemporalDaExecucao(true, { snapshotAplicado: true })).toBe("Estas informações refletem a passagem mais recente.");
    expect(situacaoTemporalDaExecucao(true, { snapshotAplicado: false })).toBe("Esta análise não mudou as informações atuais.");
    expect(situacaoTemporalDaExecucao(false, { snapshotAplicado: true })).toBe("Registro anterior; as informações atuais vêm da passagem mais recente.");
    expect(situacaoTemporalDaExecucao(false, { snapshotAplicado: false })).toBe("Registro anterior; as informações atuais vêm da passagem mais recente.");
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
    expect(document.body.textContent).toContain("Já tínhamos analisado uma observação igual");
    expect(document.body.textContent).toContain("Analisado pela IA");
    // Abrir TODOS os "Ver detalhes" não revela nome técnico, token nem dólar.
    for (const detalhes of document.querySelectorAll("details[data-detalhes]")) (detalhes as HTMLDetailsElement).open = true;
    expect(document.body.textContent).not.toMatch(NOME_TECNICO);
    expect(document.body.textContent).not.toMatch(/snapshot|fingerprint|classificacao_id|sugeridas|aplicadas|run-|gpt/i);
    expect(document.body.textContent).toContain("apoio no texto: moderado (88 de 100)");
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
      "components/prospeccao/textosAnalise.ts", "components/modais/ModalAvistamento.tsx",
    ]) {
      const fonte = readFileSync(resolve(arquivo), "utf8");
      expect(fonte, arquivo).not.toMatch(/\{[^}]*\.modelo[^}]*\}/);
      expect(fonte, arquivo).not.toMatch(/gpt-\d/i);
    }
  });
});

describe("descrição de proveniência por estado", () => {
  it("texto mudou fala do texto; substituída fala de outra análise; nenhuma delas é a mesma coisa", () => {
    expect(descreverProveniencia(etiqueta({ estado: "desatualizada", desatualizadaEm: "2026-11-12T10:00:00.000Z" })))
      .toMatch(/o texto foi corrigido em 12\/11\/2026/);
    expect(descreverProveniencia(etiqueta({ estado: "substituida", substituidaEm: "2026-11-11T10:00:00.000Z", substituidaPorClassificacaoId: "run-y" })))
      .toMatch(/substituída por uma análise mais recente em 11\/11\/2026/);
    expect(descreverProveniencia(etiqueta({}))).toContain("revisão 1 do texto");
  });

  it("explicação de camada 1 por estado: nunca promove sugestão a fato nem 'visto antes' a 'continua assim'", () => {
    expect(explicarEtiqueta(etiqueta({}))).toBe("Sugestão da IA a partir do texto; ainda não confirmada por uma pessoa.");
    expect(explicarEtiqueta(etiqueta({ origem: "manual" }))).toBe("Aplicada manualmente por você.");
    expect(explicarEtiqueta(etiqueta({ estado: "confirmada", confirmadaEm: "2026-11-11T09:00:00.000Z" }))).toMatch(/^Confirmado por você em 11\/11\/2026/);
    expect(explicarEtiqueta(etiqueta({ estado: "contestada" }))).toBe("Você marcou como incorreta; não vale como informação atual.");
    expect(explicarEtiqueta(etiqueta({ estado: "desatualizada", desatualizadaEm: "2026-11-12T10:00:00.000Z" }))).toMatch(/texto que depois foi corrigido em 12\/11\/2026/);
    expect(explicarEtiqueta(etiqueta({ estado: "substituida", substituidaEm: "2026-11-11T10:00:00.000Z" }))).toMatch(/Uma análise mais recente trouxe outro resultado em 11\/11\/2026/);
    expect(explicarEtiqueta(etiqueta({}), { historica: true, vistoEm: SETEMBRO })).toMatch(/^Visto em 09\/09\/2026.*; não apareceu na passagem mais recente\.$/);
    for (const texto of [explicarEtiqueta(etiqueta({})), explicarEtiqueta(etiqueta({}), { historica: true, vistoEm: SETEMBRO })]) {
      expect(texto).not.toMatch(/é verdade|continua assim|^Confirmad|é fato/i);
    }
  });

  it("apoio no texto: faixas de apresentação, sem porcentagem", () => {
    expect(faixaDeApoio(90)).toBe("forte");
    expect(faixaDeApoio(89)).toBe("moderado");
    expect(faixaDeApoio(70)).toBe("moderado");
    expect(faixaDeApoio(69)).toBe("fraco");
    expect(apoioNoTexto(92)).toBe("forte (92 de 100)");
    expect(apoioNoTexto(null)).toBeNull();
    expect(apoioNoTexto(55)).not.toContain("%");
  });

  it("marcas públicas para todos os estados; histórica distinta de atual", () => {
    expect(marcaProveniencia({ origem: "ia-texto", estado: "inferida" })).toBe("sugestão");
    expect(marcaProveniencia({ origem: "manual", estado: "inferida" })).toBe("manual");
    expect(marcaProveniencia({ origem: "ia-texto", estado: "confirmada" })).toBe("confirmado");
    expect(marcaProveniencia({ origem: "ia-texto", estado: "contestada" })).toBe("incorreta");
    expect(marcaProveniencia({ origem: "ia-texto", estado: "desatualizada" })).toBe("texto mudou");
    expect(marcaProveniencia({ origem: "ia-texto", estado: "substituida" })).toBe("substituída");
    expect(marcaProveniencia({ origem: "ia-texto", estado: "inferida" }, true)).toBe("visto antes");
    expect(marcaProveniencia({ origem: "ia-texto", estado: "confirmada" }, true)).toBe("visto antes");
    // Estados terminais não viram "visto antes": a marca própria diz mais.
    expect(marcaProveniencia({ origem: "ia-texto", estado: "contestada" }, true)).toBe("incorreta");
  });
});

describe("falha da análise em linguagem de campo (C9.1)", () => {
  it("mapa fechado de códigos da rota para frases humanas; código desconhecido cai na genérica; nada de mensagem bruta", () => {
    expect(mensagemFalhaAnalise("limite-diario")).toContain("O limite de análises de hoje foi atingido");
    expect(mensagemFalhaAnalise("ocupado")).toBe("Uma análise já está em andamento. Aguarde um instante.");
    expect(mensagemFalhaAnalise("nao-configurado")).toBe("A análise automática não está disponível no momento.");
    expect(mensagemFalhaAnalise("indisponivel")).toBe("Não foi possível analisar agora. Tente novamente.");
    expect(mensagemFalhaAnalise("limite-excedido")).toContain("sobrecarregado");
    expect(mensagemFalhaAnalise("falha-modelo")).toContain("não pôde ser concluída");
    expect(mensagemFalhaAnalise("Error: ECONNRESET at openai.chat")).toBe(MENSAGEM_FALHA_ANALISE_GENERICA);
    expect(mensagemFalhaAnalise(null)).toBe(MENSAGEM_FALHA_ANALISE_GENERICA);
  });

  it("na linha do tempo o motivo aparece só na passagem com o mesmo id e ainda não analisada; o botão vira 'Tentar de novo'", () => {
    const d = detalhe();
    // Setembro voltou a pendente (texto corrigido) e a tentativa falhou por limite diário.
    d.avistamentos[1] = { ...d.avistamentos[1], classificacaoEstado: "pendente", classificacaoId: null, classificacaoEm: null, classificacoes: [], etiquetas: [] };
    const aoClassificar = vi.fn();
    const { container } = render(createElement(LinhaDoTempoAvistamentos, {
      avistamentos: d.avistamentos, avistamentoCorrenteId: "av-nov", aoClassificar,
      falhaAnalise: { avistamentoId: "av-set", codigo: "limite-diario" },
    }));
    const set = container.querySelector("[data-avistamento-id='av-set']")!;
    const nov = container.querySelector("[data-avistamento-id='av-nov']")!;
    expect(set.querySelector("[role='status']")!.textContent).toContain("O limite de análises de hoje foi atingido");
    expect(set.querySelector("button")!.textContent).toBe("Tentar de novo");
    // Não vaza para a outra passagem.
    expect(nov.textContent).not.toContain("limite de análises");
    expect(nov.querySelector("[role='status']")).toBeNull();
    cleanup();

    // Motivo de OUTRO avistamento não aparece em lugar nenhum; sem falha, o botão é "Analisar agora".
    render(createElement(LinhaDoTempoAvistamentos, {
      avistamentos: d.avistamentos, avistamentoCorrenteId: "av-nov", aoClassificar,
      falhaAnalise: { avistamentoId: "av-inexistente", codigo: "limite-diario" },
    }));
    expect(document.body.textContent).not.toContain("limite de análises");
    expect(screen.getByRole("button", { name: "Analisar agora" })).toBeTruthy();
  });
});

describe("painel por estado atual e atenção (C9.1)", () => {
  it("hierarquia: cabeçalho humano, atenção só quando há, o que sabemos agora, ações recolhidas, visto anteriormente, passagens, localização, detalhes fechados", () => {
    render(createElement(PainelIdentificado, { detalhe: detalhe() }));
    expect(document.body.textContent).toContain("IMÓVEL VISTO EM CAMPO");
    expect(document.body.textContent).not.toMatch(/Pipeline|IDENTIDADE DE CAMPO|corrente|vigente|proveniência|classifica|snapshot/i);
    expect(document.querySelector("[data-resumo-cabecalho]")!.textContent).toBe("Tipo não definido · Última passagem 10/11/2026, 09:00:00");
    const titulos = [...document.querySelectorAll("h4")].map((h) => h.textContent);
    expect(titulos).toEqual(["Precisa de atenção", "O que sabemos agora", "Ações", "Visto anteriormente", "Histórico de passagens", "Localização"]);
    // Atenção: uma sugestão da IA ainda não confirmada (nível informação, não erro).
    const sugestoes = document.querySelector("[data-atencao='sugestoes']")!;
    expect(sugestoes.getAttribute("data-nivel")).toBe("info");
    expect(sugestoes.textContent).toContain("1 sugestão da IA ainda não confirmada.");
    // Ações recolhidas atrás de <details>, com o botão e a consequência dentro.
    const corrigir = document.querySelector("details[data-acao='corrigir-texto']") as HTMLDetailsElement;
    expect(corrigir.open).toBe(false);
    expect(corrigir.querySelector("summary")!.textContent).toBe("Corrigir o texto da última passagem");
    expect(corrigir.textContent).toContain("Salvar texto corrigido");
    expect(corrigir.textContent).toContain("A análise será refeita sobre o texto novo. Informações que você confirmou são mantidas e podem aparecer para revisão.");
    const tipo = document.querySelector("details[data-acao='informar-tipo']") as HTMLDetailsElement;
    expect(tipo.open).toBe(false);
    expect(tipo.textContent).toContain("Defina o tipo do imóvel com uma informação fornecida por você.");
    // Detalhes da análise: fechado, com a auditoria e a nota sobre o apoio.
    const detalhes = document.querySelector("details[data-detalhes-analise]") as HTMLDetailsElement;
    expect(detalhes.open).toBe(false);
    expect(detalhes.textContent).toContain("Imóvel fechado: a partir do texto · apoio no texto: moderado (88 de 100) · passagem de 10/11/2026");
    expect(detalhes.textContent).toContain("não é uma probabilidade de acerto");
    // Descartar e excluir ficam no fim, depois de tudo.
    const botoes = [...document.querySelectorAll("button")].map((b) => b.textContent);
    expect(botoes.slice(-2)).toEqual(["Descartar", "Excluir permanentemente"]);
  });

  it("explica a ação de tipo conforme a origem já registrada, sem alterar a proveniência", () => {
    expect(explicacaoInformarTipo({ tipo: "Casa", tipoOrigem: "ia-texto", tipoEstado: "inferido" }))
      .toBe("Substitui a sugestão automática por uma informação definida por você.");
    expect(explicacaoInformarTipo({ tipo: "Casa", tipoOrigem: "ia-texto", tipoEstado: "confirmado" }))
      .toBe("Substitui a sugestão automática por uma informação definida por você.");
    expect(explicacaoInformarTipo({ tipo: "Sala Comercial", tipoOrigem: "manual", tipoEstado: "declarado" }))
      .toBe("Altere o tipo informado por você.");
    expect(explicacaoInformarTipo({ tipo: "Apartamento", tipoOrigem: "carteira", tipoEstado: "declarado" }))
      .toBe("Altere o tipo trazido da carteira por uma informação definida por você.");
    expect(explicacaoInformarTipo({ tipo: null, tipoOrigem: null, tipoEstado: null }))
      .toBe("Defina o tipo do imóvel com uma informação fornecida por você.");

    render(createElement(PainelIdentificado, { detalhe: detalhe({
      tipo: "Sala Comercial", tipoOrigem: "manual", tipoEstado: "declarado",
    }) }));
    expect(document.querySelector("details[data-acao='informar-tipo']")!.textContent)
      .toContain("Altere o tipo informado por você.");
    cleanup();

    render(createElement(PainelIdentificado, { detalhe: detalhe({
      tipo: "Casa", tipoOrigem: "ia-texto", tipoEstado: "inferido",
    }) }));
    expect(document.querySelector("details[data-acao='informar-tipo']")!.textContent)
      .toContain("Substitui a sugestão automática por uma informação definida por você.");
  });

  it("limita a prévia da foto de forma responsiva e mantém acesso ao original", () => {
    const css = readFileSync(resolve("components/prospeccao/Prospeccao.module.css"), "utf8");
    const captura = readFileSync(resolve("components/prospeccao/CapturaFachada.tsx"), "utf8");
    const linhaDoTempo = readFileSync(resolve("components/prospeccao/LinhaDoTempoAvistamentos.tsx"), "utf8");
    expect(css).toMatch(/\.fotoFachada img[\s\S]*?max-height: min\(44vh, 360px\)/);
    expect(css).toMatch(/@media \(max-width: 720px\)[\s\S]*?\.fotoFachada img[\s\S]*?max-height: min\(54vh, 420px\)/);
    expect(captura).toContain('aria-label="Abrir foto em tamanho original"');
    expect(captura).toContain('target="_blank"');
    expect(linhaDoTempo).toContain("onClick={() => aoRemoverFoto(foto.id)}");
  });

  it("sem sugestões pendentes nem conflito nem falha, 'Precisa de atenção' não existe", () => {
    const d = detalhe();
    d.avistamentos[0] = { ...d.avistamentos[0], etiquetas: [etiqueta({ id: 20, estado: "confirmada", confirmadaPor: "u", confirmadaEm: NOVEMBRO })] };
    render(createElement(PainelIdentificado, { detalhe: d }));
    expect(screen.queryByRole("region", { name: "Precisa de atenção" })).toBeNull();
    expect(document.body.textContent).toContain("1 informação da passagem mais recente");
  });

  it("falha transitória do estado aparece com motivo humano, nível erro e 'Tentar de novo'; motivo de outra passagem não aparece", () => {
    const d = detalhe();
    d.avistamentos[0] = { ...d.avistamentos[0], classificacaoEstado: "pendente", classificacaoId: null, classificacaoEm: null, classificacoes: [], etiquetas: [] };
    (cenario.estado as { falhaAnalise?: unknown }).falhaAnalise = { avistamentoId: "av-nov", codigo: "limite-diario" };
    const { unmount } = render(createElement(PainelIdentificado, { detalhe: d }));
    const falha = document.querySelector("[data-atencao='falha']")!;
    expect(falha.getAttribute("data-nivel")).toBe("erro");
    expect(falha.textContent).toContain("Não foi possível analisar a observação.");
    expect(falha.textContent).toContain("O limite de análises de hoje foi atingido.");
    expect(falha.querySelector("button")!.textContent).toBe("Tentar de novo");
    expect(document.body.textContent).not.toMatch(/limite-diario|429|Error/);
    unmount();

    // O mesmo motivo, preso a OUTRA passagem, não aparece para a mais recente.
    (cenario.estado as { falhaAnalise?: unknown }).falhaAnalise = { avistamentoId: "av-set", codigo: "limite-diario" };
    render(createElement(PainelIdentificado, { detalhe: d }));
    expect(document.querySelector("[data-atencao='falha']")).toBeNull();
    expect(document.querySelector("[data-atencao='nao-analisada']")!.textContent).toContain("ainda não foi analisada");
    delete (cenario.estado as { falhaAnalise?: unknown }).falhaAnalise;
  });

  it("texto corrigido e ainda não analisado: a atenção diz que a análise será refeita", () => {
    const d = detalhe();
    d.avistamentos[0] = { ...d.avistamentos[0], observacaoRevisao: 2, classificacaoEstado: "pendente", classificacaoId: null, classificacaoEm: null, classificacoes: [], etiquetas: [] };
    render(createElement(PainelIdentificado, { detalhe: d }));
    expect(document.querySelector("[data-atencao='nao-analisada']")!.textContent).toContain("O texto foi corrigido; a análise será refeita.");
  });

  it("os níveis de atenção não dependem só de cor: cada item declara o nível em atributo e em texto", () => {
    const d = detalhe();
    d.avistamentos[0] = { ...d.avistamentos[0], observacaoRevisao: 2, revisaoConflitoEm: "2026-11-12T10:00:00.000Z",
      etiquetas: [etiqueta({ id: 20, revisaoObservacao: 2 }), etiqueta({ id: 23, codigo: "sem-placa-visivel", estado: "confirmada", confirmadaPor: "u", confirmadaEm: "2026-11-11T09:00:00.000Z", revisaoObservacao: 1 })] };
    render(createElement(PainelIdentificado, { detalhe: d }));
    const itens = [...document.querySelectorAll("[data-atencao]")].map((li) => `${li.getAttribute("data-atencao")}:${li.getAttribute("data-nivel")}`);
    expect(itens).toEqual(["conflito:atencao", "sugestoes:info"]);
    expect(screen.getByRole("alert").textContent).toContain("Vale revisar esta informação.");
    expect(screen.getByRole("alert").textContent).toContain("“Sem placa visível”");
  });
});
