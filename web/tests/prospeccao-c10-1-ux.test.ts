// @vitest-environment jsdom
/* ================================================================
   C10.1 — UX DE CAMPO / CAPTURA RÁPIDA
   Só apresentação: a captura mostra primeiro o que importa na rua
   (foto, localização e endereço, observação, tipo se souber), o
   pós-salvamento diz "deu certo" antes de qualquer outra coisa, e o
   detalhe abre com um resumo e as próximas ações — histórico e mapa
   recolhidos no celular, mas presentes e a um toque. Nenhuma regra,
   contrato, RPC ou dado muda: os mesmos `criar`, `adicionarAvistamento`,
   `TransformarEmOportunidade` e `urlInvestigadorDoImovelIdentificado`.
   ================================================================ */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const cenario = vi.hoisted(() => ({
  estado: {
    itens: [] as unknown[],
    detalhe: null as unknown,
    selecionadoId: null as string | null,
    ultimoRegistro: null as { imovelIdentificadoId: string; avistamentoId: string; novoLocal: boolean } | null,
    pagina: 1,
    porPagina: 24,
    total: 0,
    temMais: false,
    carregando: false,
    salvando: false,
    erro: null as string | null,
    aviso: null as string | null,
    incluirOcultos: false,
    classificandoAvistamentoId: null as string | null,
    falhaAnalise: null,
    carregarPagina: vi.fn(),
    carregarDetalhe: vi.fn(),
    limparSelecao: vi.fn(),
    dispensarUltimoRegistro: vi.fn(),
    definirIncluirOcultos: vi.fn(),
    criar: vi.fn(),
    adicionarAvistamento: vi.fn(),
    corrigirObservacao: vi.fn(),
    descartar: vi.fn(),
    cancelarExclusao: vi.fn(),
    removerFoto: vi.fn(),
    confirmarEtiqueta: vi.fn(),
    contestarEtiqueta: vi.fn(),
    confirmarTipo: vi.fn(),
    definirTipo: vi.fn(),
    definirEndereco: vi.fn(),
    classificarAvistamento: vi.fn(),
    previaExclusao: vi.fn(),
    excluir: vi.fn(),
    iniciarPromocao: vi.fn(),
    desistirPromocao: vi.fn(),
    vincularPromocao: vi.fn(),
    oportunidadeCriadaNaSessao: vi.fn(() => null),
    imoveisJaVinculados: vi.fn(async () => new Set<string>()),
    buscarDuplicatas: vi.fn(async () => []),
  },
  modal: null as { tipo: string } | null,
  abrirModal: vi.fn(),
  fecharModal: vi.fn(),
  usuario: { id: "usuario-1" },
}));

vi.mock("@/lib/useProspeccao", () => {
  const useProspeccao = (seletor: (estado: typeof cenario.estado) => unknown) => seletor(cenario.estado);
  useProspeccao.getState = () => cenario.estado;
  return { useProspeccao };
});
vi.mock("@/lib/uiModal", () => ({
  useUiModal: (seletor: (estado: {
    modal: typeof cenario.modal; abrirModal: typeof cenario.abrirModal; fecharModal: typeof cenario.fecharModal;
  }) => unknown) => seletor({ modal: cenario.modal, abrirModal: cenario.abrirModal, fecharModal: cenario.fecharModal }),
}));
vi.mock("@/lib/geo", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/geo")>()),
  capturarPosicaoAtual: async () => ({ ok: false, motivo: "indisponivel" }),
  geocodeEndereco: async () => null,
}));
vi.mock("@/components/SessaoProvider", () => ({
  useSessao: () => ({ estado: "auth", usuario: cenario.usuario }),
}));

import ModalAvistamento from "@/components/modais/ModalAvistamento";
import ConfirmacaoRegistro, {
  ROTULO_CONCLUIR,
  ROTULO_VER_DETALHES,
  TITULO_IMOVEL_REGISTRADO,
  TITULO_PASSAGEM_REGISTRADA,
  enderecoCurto,
} from "@/components/prospeccao/ConfirmacaoRegistro";
import PainelIdentificado, { LARGURA_TELA_ESTREITA } from "@/components/prospeccao/PainelIdentificado";
import ProspeccaoView from "@/components/prospeccao/ProspeccaoView";
import type { DetalheImovelIdentificado } from "@/lib/prospeccao";

const RAIZ = resolve(".");
const ler = (caminho: string) => readFileSync(resolve(RAIZ, caminho), "utf8").replace(/\r\n/g, "\n");
const CSS = ler("components/prospeccao/Prospeccao.module.css");
const CSS_APP = ler("app/style.css");
const QUANDO = "2026-09-15T12:03:00.000Z";

function identificado(extra: Record<string, unknown> = {}) {
  return {
    id: "identificado-1", situacao: "identificado", logradouro: "Rua Sergipe", numero: "800",
    unidade: null, bloco: null, edificio: null, bairro: "Centro", cidade: "Londrina", estado: "PR", cep: null,
    pontoReferencia: null, enderecoChave: "", cidadeChave: "", bairroChave: "",
    latitude: null, longitude: null, acuraciaMetros: null, precisaoLocalizacao: "desconhecida",
    tipo: null, tipoOrigem: null, tipoConfianca: null, tipoEstado: null, tipoDefinidoEm: null,
    tipoClassificacaoId: null, tipoAvistamentoId: null, tipoConfirmadoPor: null, tipoConfirmadoEm: null,
    avistamentosTotal: 1, primeiroAvistamentoEm: QUANDO, ultimoAvistamentoEm: QUANDO, avistamentoCorrenteId: "av-1",
    origemIdentificacao: "campo", ultimaInvestigacaoEm: null, imovelId: null, promovidoEm: null,
    descartadoMotivo: null, descartadoEm: null, fundidoEm: null, fundidoEmImovelId: null,
    exclusaoSolicitadaEm: null, criadoEm: QUANDO, atualizadoEm: QUANDO, ...extra,
  };
}

function avistamento(extra: Record<string, unknown> = {}) {
  return {
    id: "av-1", imovelIdentificadoId: "identificado-1", observadoEm: QUANDO, createdAt: QUANDO,
    latitude: null, longitude: null, acuraciaMetros: null, precisaoLocalizacao: "desconhecida",
    observacao: "", observacaoRevisao: 1, classificacaoEstado: "nao_aplicavel",
    revisaoConflitoEm: null, classificacaoId: null, classificacaoEm: null, fingerprint: "f",
    fotos: [], classificacoes: [], etiquetas: [], ...extra,
  };
}

function detalhe(extra: Record<string, unknown> = {}, avistamentos = [avistamento()]): DetalheImovelIdentificado {
  return {
    identificado: identificado(extra), avistamentos, etiquetasDoImovel: [], classificacoesCarregadas: true,
  } as unknown as DetalheImovelIdentificado;
}

/** jsdom não tem matchMedia; aqui a tela "é" larga ou estreita. */
function telaDeLargura(estreita: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (consulta: string) => ({
      matches: estreita && consulta === LARGURA_TELA_ESTREITA,
      media: consulta,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(cenario.estado, {
    itens: [], detalhe: null, selecionadoId: null, ultimoRegistro: null, total: 0, temMais: false,
    carregando: false, salvando: false, erro: null, aviso: null,
  });
  cenario.modal = null;
  cenario.estado.carregarPagina.mockResolvedValue(true);
  cenario.estado.carregarDetalhe.mockResolvedValue(true);
  cenario.estado.criar.mockResolvedValue(true);
  cenario.estado.adicionarAvistamento.mockResolvedValue(true);
  telaDeLargura(false);
});
afterEach(() => {
  cleanup();
  // @ts-expect-error — jsdom não define matchMedia; o teste que definiu limpa.
  delete window.matchMedia;
});

describe("captura: curta, na ordem da rua, sem exigir o que é opcional", () => {
  it("foto, depois localização e endereço, depois observação, tipo (se souber) e data; o resto recolhido", () => {
    render(createElement(ModalAvistamento));
    const corpo = document.querySelector(".modal-body")!;
    const posicao = (elemento: Element | null) => {
      expect(elemento).not.toBeNull();
      return [...corpo.querySelectorAll("*")].indexOf(elemento!);
    };
    const foto = posicao(screen.getByRole("region", { name: "Foto da fachada" }));
    const localizacao = posicao(screen.getByRole("region", { name: "Localização da passagem" }));
    const logradouro = posicao(screen.getByLabelText("Logradouro"));
    const observacao = posicao(screen.getByLabelText("Observação (opcional)"));
    const tipo = posicao(screen.getByLabelText("Tipo do imóvel (se souber)"));
    const data = posicao(screen.getByLabelText("Data"));
    const detalhes = posicao(screen.getByText("Mais detalhes do imóvel (opcional)"));
    expect([foto, localizacao, logradouro, observacao, tipo, data, detalhes]).toEqual(
      [...[foto, localizacao, logradouro, observacao, tipo, data, detalhes]].sort((a, b) => a - b),
    );
    // O tipo saiu de "Mais detalhes": está à vista, opcional, sem valor inventado.
    const seletor = screen.getByLabelText("Tipo do imóvel (se souber)") as HTMLSelectElement;
    expect(seletor.value).toBe("");
    expect(seletor.selectedOptions[0].textContent).toBe("Não definido");
    expect(seletor.closest("details")).toBeNull();
    const maisDetalhes = screen.getByText("Mais detalhes do imóvel (opcional)").closest("details") as HTMLDetailsElement;
    expect(maisDetalhes.open).toBe(false);
    expect(maisDetalhes.querySelector("select")).toBeNull();
    // Texto de abertura curto: uma frase, sem repetir o que os campos já dizem.
    expect(document.body.textContent).toContain("Foto e endereço bastam. O resto pode vir depois.");
    expect(document.body.textContent).not.toContain("Data e horário já estão preenchidos");
  });

  it("o formulário não é o endereço pessoal de quem digita: autocomplete desligado no form e nos campos de endereço", () => {
    render(createElement(ModalAvistamento));
    expect(document.querySelector("form")!.getAttribute("autocomplete")).toBe("off");
    for (const rotulo of ["Logradouro", "Número", "Cidade", "Estado", "Bairro", "CEP", "Unidade", "Bloco", "Edifício", "Ponto de referência"]) {
      expect((screen.getByLabelText(rotulo) as HTMLInputElement).getAttribute("autocomplete"), rotulo).toBe("off");
    }
  });

  it("salvar só com o que a rua deu: observação vazia, tipo nulo, mesmo `criar` de sempre; com tipo escolhido, vai o escolhido", async () => {
    render(createElement(ModalAvistamento));
    expect((screen.getByLabelText("Observação (opcional)") as HTMLTextAreaElement).required).toBe(false);
    expect((screen.getByLabelText("Tipo do imóvel (se souber)") as HTMLSelectElement).required).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Salvar passagem" }));
    await waitFor(() => expect(cenario.estado.criar).toHaveBeenCalled());
    expect(cenario.estado.criar).toHaveBeenCalledWith(
      "usuario-1",
      expect.objectContaining({ tipo: null, logradouro: "" }),
      expect.objectContaining({ observacao: "" }),
    );
    expect(cenario.fecharModal).toHaveBeenCalledOnce();
    cleanup();
    vi.clearAllMocks();
    cenario.estado.criar.mockResolvedValue(true);

    render(createElement(ModalAvistamento));
    fireEvent.change(screen.getByLabelText("Tipo do imóvel (se souber)"), { target: { value: "Casa" } });
    fireEvent.click(screen.getByRole("button", { name: "Salvar passagem" }));
    await waitFor(() => expect(cenario.estado.criar).toHaveBeenCalled());
    expect(cenario.estado.criar.mock.calls[0][1]).toMatchObject({ tipo: "Casa" });
  });
});

describe("pós-salvamento: primeiro 'deu certo', depois o essencial, depois as ações que já existem", () => {
  it("com `ultimoRegistro` do detalhe selecionado, a tela mostra a confirmação antes da lista", () => {
    cenario.estado.itens = [identificado()];
    cenario.estado.detalhe = detalhe({}, [avistamento({
      latitude: -23.31, longitude: -51.16, acuraciaMetros: 8, precisaoLocalizacao: "gps",
      fotos: [{ id: "foto-1", estado: "ativa" }],
    })]);
    cenario.estado.selecionadoId = "identificado-1";
    cenario.estado.ultimoRegistro = { imovelIdentificadoId: "identificado-1", avistamentoId: "av-1", novoLocal: true };
    render(createElement(ProspeccaoView));

    const confirmacao = screen.getByRole("status", { name: "Registro concluído" });
    expect(within(confirmacao).getByText(TITULO_IMOVEL_REGISTRADO)).toBeTruthy();
    expect(confirmacao.textContent).toContain("Rua Sergipe, 800 — Centro · Londrina");
    expect(confirmacao.querySelector("[data-confirmacao='foto']")!.textContent).toBe("Foto registrada");
    expect(confirmacao.querySelector("[data-confirmacao='localizacao']")!.textContent).toContain("Localização registrada");
    expect(confirmacao.querySelector("[data-confirmacao='quando']")!.textContent).toMatch(/15\/09\/2026/);
    // Antes da lista: quem está na rua lê isto primeiro.
    const tudo = [...document.querySelectorAll("*")];
    expect(tudo.indexOf(confirmacao)).toBeLessThan(tudo.indexOf(screen.getByRole("region", { name: "Imóveis vistos em campo" })));
    // Ações existentes, sem nada novo: concluir, ver detalhes, investigar.
    expect(within(confirmacao).getByRole("button", { name: ROTULO_CONCLUIR })).toBeTruthy();
    expect(within(confirmacao).getByRole("button", { name: ROTULO_VER_DETALHES })).toBeTruthy();
    expect(within(confirmacao).getByRole("link", { name: "Investigar na web" }).getAttribute("href"))
      .toBe("/investigador-imoveis?imovelIdentificado=identificado-1");
    expect(within(confirmacao).queryByText(/Transformar/)).toBeNull();
    // O painel completo continua abaixo, com tudo o que já existia.
    expect(screen.getByRole("button", { name: "Transformar em oportunidade" })).toBeTruthy();
    expect(screen.getByRole("list", { name: "Histórico de passagens" })).toBeTruthy();
  });

  it("'Concluir' encerra a tarefa (some a confirmação e a seleção); 'Ver detalhes' só dispensa e leva ao painel", () => {
    cenario.estado.itens = [identificado()];
    cenario.estado.detalhe = detalhe();
    cenario.estado.selecionadoId = "identificado-1";
    cenario.estado.ultimoRegistro = { imovelIdentificadoId: "identificado-1", avistamentoId: "av-1", novoLocal: false };
    render(createElement(ProspeccaoView));
    const confirmacao = screen.getByRole("status", { name: "Registro concluído" });
    expect(within(confirmacao).getByText(TITULO_PASSAGEM_REGISTRADA)).toBeTruthy();
    expect(confirmacao.querySelector("[data-confirmacao='foto']")!.textContent).toBe("Sem foto nesta passagem");

    fireEvent.click(within(confirmacao).getByRole("button", { name: ROTULO_VER_DETALHES }));
    expect(cenario.estado.dispensarUltimoRegistro).toHaveBeenCalledOnce();
    expect(cenario.estado.limparSelecao).not.toHaveBeenCalled();

    fireEvent.click(within(confirmacao).getByRole("button", { name: ROTULO_CONCLUIR }));
    expect(cenario.estado.dispensarUltimoRegistro).toHaveBeenCalledTimes(2);
    expect(cenario.estado.limparSelecao).toHaveBeenCalledOnce();
  });

  it("sem `ultimoRegistro`, de outro registro, ou com o modal aberto, não há confirmação", () => {
    cenario.estado.itens = [identificado()];
    cenario.estado.detalhe = detalhe();
    cenario.estado.selecionadoId = "identificado-1";
    const { rerender } = render(createElement(ProspeccaoView));
    expect(screen.queryByRole("status", { name: "Registro concluído" })).toBeNull();

    cenario.estado.ultimoRegistro = { imovelIdentificadoId: "outro", avistamentoId: "av-9", novoLocal: true };
    rerender(createElement(ProspeccaoView));
    expect(screen.queryByRole("status", { name: "Registro concluído" })).toBeNull();

    cenario.estado.ultimoRegistro = { imovelIdentificadoId: "identificado-1", avistamentoId: "av-1", novoLocal: true };
    cenario.modal = { tipo: "avistamento" };
    rerender(createElement(ProspeccaoView));
    expect(screen.queryByRole("status", { name: "Registro concluído" })).toBeNull();
  });

  it("o componente só lê: endereço curto, tipo quando há, e nunca inventa foto ou localização", () => {
    const semNada = detalhe({ tipo: "Casa", tipoEstado: "declarado" });
    render(createElement(ConfirmacaoRegistro, {
      detalhe: semNada, avistamentoId: "av-1", novoLocal: true, aoConcluir: vi.fn(), aoVerDetalhes: vi.fn(),
    }));
    expect(enderecoCurto(semNada)).toBe("Rua Sergipe, 800 — Centro · Londrina");
    expect(document.querySelector("[data-confirmacao='tipo']")!.textContent).toContain("Casa");
    expect(document.querySelector("[data-confirmacao='foto']")!.getAttribute("data-registrada")).toBe("false");
    expect(document.querySelector("[data-confirmacao='localizacao']")!.getAttribute("data-registrada")).toBe("false");
    // Sem comentários: só o código conta.
    const codigo = ler("components/prospeccao/ConfirmacaoRegistro.tsx").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
    expect(codigo).not.toMatch(/\.rpc\(|\.from\(|salvar\w*\(|criar\w*\(|fetch\(|useProspeccao/);
  });
});

describe("detalhe: resumo curto, próximas ações, e o resto recolhido no celular", () => {
  it("cabeçalho com passagens; 'Próximas ações' logo depois da atenção, só com ações existentes; tipo faltando ganha atalho para o mesmo formulário", () => {
    render(createElement(PainelIdentificado, { detalhe: detalhe() }));
    expect(document.querySelector("[data-resumo-passagens]")!.textContent).toBe("1 passagem registrada");
    const proximas = screen.getByRole("region", { name: "Próximas ações" });
    expect(within(proximas).getByRole("button", { name: "Transformar em oportunidade" })).toBeTruthy();
    expect(within(proximas).getByRole("link", { name: "Investigar na web" }).getAttribute("href"))
      .toBe("/investigador-imoveis?imovelIdentificado=identificado-1");
    const atalho = within(proximas).getByRole("button", { name: "Informar o tipo do imóvel" });
    const formularioTipo = document.querySelector("details[data-acao='informar-tipo']") as HTMLDetailsElement;
    expect(formularioTipo.open).toBe(false);
    fireEvent.click(atalho);
    expect(formularioTipo.open).toBe(true);
    // As correções continuam em "Ações", recolhidas, iguais.
    expect([...document.querySelectorAll("section[aria-label='Ações'] > details")].map((d) => d.getAttribute("data-acao")))
      .toEqual(["corrigir-texto", "corrigir-endereco", "informar-tipo"]);
    // Ordem de leitura: atenção (quando há) → próximas ações → o que sabemos → ações → … → histórico → localização.
    const titulos = [...document.querySelectorAll("h4")].map((h) => h.textContent);
    expect(titulos.indexOf("Próximas ações")).toBeLessThan(titulos.indexOf("O que sabemos agora"));
    expect(titulos.indexOf("Histórico de passagens")).toBeGreaterThan(titulos.indexOf("Ações"));
  });

  it("com tipo conhecido o atalho não existe; a oportunidade já promovida continua dizendo que já é", () => {
    render(createElement(PainelIdentificado, { detalhe: detalhe({ tipo: "Casa", tipoEstado: "declarado", tipoOrigem: "manual", situacao: "promovido", imovelId: "imovel-1", promovidoEm: QUANDO }) }));
    const proximas = screen.getByRole("region", { name: "Próximas ações" });
    expect(within(proximas).queryByRole("button", { name: "Informar o tipo do imóvel" })).toBeNull();
    expect(proximas.querySelector("[data-oportunidade='promovida']")).not.toBeNull();
  });

  it("celular: histórico e localização nascem recolhidos, mas continuam no DOM, com fotos, datas e o mapa a um toque", () => {
    telaDeLargura(true);
    render(createElement(PainelIdentificado, { detalhe: detalhe({ latitude: -23.31, longitude: -51.16, acuraciaMetros: 8, precisaoLocalizacao: "gps" }) }));
    const historico = document.querySelector("[data-secao-historico] details") as HTMLDetailsElement;
    const localizacao = document.querySelector("[data-secao-localizacao] details") as HTMLDetailsElement;
    expect(historico.open).toBe(false);
    expect(localizacao.open).toBe(false);
    // Nada foi perdido: a lista de passagens (com data) está lá, dentro do recolhido.
    const lista = screen.getByRole("list", { name: "Histórico de passagens" });
    expect(historico.contains(lista)).toBe(true);
    expect(lista.textContent).toMatch(/15\/09\/2026/);
    expect(historico.querySelector("summary")!.textContent).toContain("Histórico de passagens");
    expect(historico.querySelector("summary")!.textContent).toContain("1 passagem");
    // Um toque abre.
    fireEvent.click(historico.querySelector("summary")!);
    expect(historico.open).toBe(true);
    // O essencial não se recolhe: próximas ações e o que sabemos ficam à vista.
    expect(screen.getByRole("region", { name: "Próximas ações" }).closest("details")).toBeNull();
    expect(screen.getByRole("region", { name: "O que sabemos agora" }).closest("details")).toBeNull();
  });

  it("tela larga: histórico e localização abertos, como antes", () => {
    render(createElement(PainelIdentificado, { detalhe: detalhe() }));
    expect((document.querySelector("[data-secao-historico] details") as HTMLDetailsElement).open).toBe(true);
    expect((document.querySelector("[data-secao-localizacao] details") as HTMLDetailsElement).open).toBe(true);
  });
});

describe("topo, rodapé e texto auxiliar no celular: só CSS", () => {
  it("o topo encolhe e perde a descrição; notas e legendas repetitivas somem; o rodapé fica mais baixo", () => {
    const celular = CSS.slice(CSS.lastIndexOf("@media (max-width: 720px)"));
    expect(celular).toMatch(/\.heroDescricao \{ display: none; \}/);
    expect(celular).toMatch(/\.hero \{ gap: 12px; padding: 14px 16px; \}/);
    expect(celular).toMatch(/\.secaoNota,\s*\.legendaAcoes \{ display: none; \}/);
    // O nome do módulo fica: nenhuma regra esconde o h2 nem o sobretítulo.
    expect(celular).not.toMatch(/\.hero h2 \{[^}]*display: none/);
    expect(celular).not.toMatch(/\.sobretitulo \{[^}]*display: none/);
    const rodape = CSS_APP.slice(CSS_APP.indexOf("(C10.1)"));
    expect(rodape).toMatch(/@media \(max-width: 720px\)\{\s*\.rodape-app\{ margin-top: 24px; padding-top: 16px; \}/);
    // Nada do rodapé é removido: só o tamanho muda.
    expect(rodape).not.toMatch(/rodape-(legal|assinatura|rotulo)[^{]*\{[^}]*display: none/);
  });
});
