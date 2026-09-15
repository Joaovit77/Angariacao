// @vitest-environment jsdom

/* ================================================================
   GARIMPO EM CAMPO — C13C: a Memória de Identidade no detalhe

   Camada de leitura + confirmação humana sobre o núcleo do C13A/C13B.

   1. Read model puro (`leituraMemoria`): rótulos, valores, estados,
      fonte segura, datas, resumo, histórico enxuto, promoção e passagens
      derivadas. A UI não decide vigência nem conflito: vem do núcleo.
   2. Tela (`MemoriaIdentidade` dentro do `PainelIdentificado`): seção no
      detalhe, recolhida no celular, estados vazio / nunca investigado /
      hipótese / confirmado / conflito / fonte / erro, e a confirmação
      pela RPC via store — sem IA, sem escrita por visualizar, sem
      promoção.
   3. Banco local (PGlite): hipótese → carregar → confirmar → recarregar
      pela fronteira real (`obterMemoriaIdentificado` e
      `confirmarAtributoIdentificado`) com um cliente mínimo sobre o
      PostgreSQL local, sob RLS como `authenticated`.
   ================================================================ */
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { PGlite } from "@electric-sql/pglite";
import { cleanup, fireEvent, render, waitFor, within } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  ROTULO_FONTE_SEM_DOMINIO,
  TEXTO_NUNCA_INVESTIGADO,
  TEXTO_SEM_DESCOBERTAS,
  TITULO_DIVERGENCIA,
  fonteParaLeitura,
  lerMemoria,
  resumirMemoria,
} from "@/lib/calculo/leituraMemoria";
import {
  montarMemoriaIdentidade,
  type AfirmacaoRegistrada,
  type InvestigacaoRegistrada,
} from "@/lib/calculo/memoriaIdentidade";
import type { DetalheImovelIdentificado, MemoriaIdentificadoCarregada } from "@/lib/prospeccao";

const cenario = vi.hoisted(() => ({
  estado: {
    itens: [] as unknown[],
    detalhe: null as unknown,
    selecionadoId: null as string | null,
    ultimoRegistro: null,
    pagina: 1, porPagina: 24, total: 0, temMais: false,
    carregando: false, salvando: false, erro: null as string | null, aviso: null as string | null,
    incluirOcultos: false, classificandoAvistamentoId: null as string | null, falhaAnalise: null,
    carregarPagina: vi.fn(), carregarDetalhe: vi.fn(), limparSelecao: vi.fn(), dispensarUltimoRegistro: vi.fn(),
    definirIncluirOcultos: vi.fn(), criar: vi.fn(), adicionarAvistamento: vi.fn(), corrigirObservacao: vi.fn(),
    descartar: vi.fn(), cancelarExclusao: vi.fn(), removerFoto: vi.fn(), confirmarEtiqueta: vi.fn(),
    contestarEtiqueta: vi.fn(), confirmarTipo: vi.fn(), definirTipo: vi.fn(), definirEndereco: vi.fn(),
    classificarAvistamento: vi.fn(), previaExclusao: vi.fn(), excluir: vi.fn(), iniciarPromocao: vi.fn(),
    desistirPromocao: vi.fn(), vincularPromocao: vi.fn(), registrarOportunidadeCriada: vi.fn(),
    oportunidadeCriadaNaSessao: vi.fn(() => null), imoveisJaVinculados: vi.fn(async () => new Set<string>()),
    buscarDuplicatas: vi.fn(async () => []),
    carregarMemoria: vi.fn(async (): Promise<MemoriaIdentificadoCarregada | null> => ({ investigacoes: [], atributos: [] })),
    confirmarAtributo: vi.fn(async () => false),
  },
  abrirModal: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock("@/lib/useProspeccao", () => {
  const useProspeccao = (seletor: (estado: typeof cenario.estado) => unknown) => seletor(cenario.estado);
  useProspeccao.getState = () => cenario.estado;
  return { useProspeccao };
});
vi.mock("@/lib/uiModal", () => ({
  useUiModal: (seletor: (estado: { modal: null; abrirModal: typeof cenario.abrirModal; fecharModal: () => void }) => unknown) =>
    seletor({ modal: null, abrirModal: cenario.abrirModal, fecharModal: () => undefined }),
}));
vi.mock("@/components/SessaoProvider", () => ({ useSessao: () => ({ estado: "auth", usuario: { id: "usuario-1" } }) }));
vi.mock("next/dynamic", () => ({ default: () => () => null }));

import MemoriaIdentidade, {
  ERRO_CARREGAR_MEMORIA,
  ERRO_CONFIRMAR_INFORMACAO,
  PERGUNTA_CONFIRMAR_INFORMACAO,
  ROTULO_CONFIRMAR_INFORMACAO,
  TITULO_MEMORIA,
} from "@/components/prospeccao/MemoriaIdentidade";
import PainelIdentificado, { LARGURA_TELA_ESTREITA } from "@/components/prospeccao/PainelIdentificado";
import { confirmarAtributoIdentificado, obterMemoriaIdentificado } from "@/lib/prospeccao";

const RAIZ = resolve(".");
const ler = (caminho: string) => readFileSync(resolve(RAIZ, caminho), "utf8").replace(/\r\n/g, "\n");
const CSS = ler("components/prospeccao/Prospeccao.module.css");
const USUARIO = "10000000-0000-4000-8000-000000000001";
const OUTRO_USUARIO = "10000000-0000-4000-8000-000000000002";
const ID = "55555555-5555-4555-8555-555555555555";
const T1 = "2026-09-01T10:00:00.000Z";
const T2 = "2026-09-08T10:00:00.000Z";
const T3 = "2026-09-12T10:00:00.000Z";
const T4 = "2026-09-14T10:00:00.000Z";
type Json = Record<string, unknown>;

/* ------------------------------------------------------------------
   Fixtures
   ------------------------------------------------------------------ */
function identificado(extra: Record<string, unknown> = {}) {
  return {
    id: ID, situacao: "identificado", logradouro: "Rua das Palmeiras", numero: "120",
    unidade: null, bloco: null, edificio: null, bairro: "Centro", cidade: "Londrina", estado: "PR", cep: null,
    pontoReferencia: null, enderecoChave: "", cidadeChave: "", bairroChave: "",
    latitude: null, longitude: null, acuraciaMetros: null, precisaoLocalizacao: "desconhecida",
    tipo: null, tipoOrigem: null, tipoConfianca: null, tipoEstado: null, tipoDefinidoEm: null,
    tipoClassificacaoId: null, tipoAvistamentoId: null, tipoConfirmadoPor: null, tipoConfirmadoEm: null,
    avistamentosTotal: 1, primeiroAvistamentoEm: T1, ultimoAvistamentoEm: T1, avistamentoCorrenteId: "av-1",
    origemIdentificacao: "campo", ultimaInvestigacaoEm: T2, imovelId: null, promovidoEm: null,
    descartadoMotivo: null, descartadoEm: null, fundidoEm: null, fundidoEmImovelId: null,
    exclusaoSolicitadaEm: null, criadoEm: T1, atualizadoEm: T1, ...extra,
  };
}
function avistamento(extra: Record<string, unknown> = {}) {
  return {
    id: "av-1", imovelIdentificadoId: ID, observadoEm: T1, createdAt: T1,
    latitude: null, longitude: null, acuraciaMetros: null, precisaoLocalizacao: "desconhecida",
    observacao: "", observacaoRevisao: 1, classificacaoEstado: "nao_aplicavel",
    revisaoConflitoEm: null, classificacaoId: null, classificacaoEm: null, fingerprint: "f",
    fotos: [], classificacoes: [], etiquetas: [], ...extra,
  };
}
function detalhe(extra: Record<string, unknown> = {}, avistamentos = [avistamento()]): DetalheImovelIdentificado {
  return { identificado: identificado(extra), avistamentos, etiquetasDoImovel: [], classificacoesCarregadas: true } as unknown as DetalheImovelIdentificado;
}
function investigacao(extra: Partial<InvestigacaoRegistrada> = {}): InvestigacaoRegistrada {
  return { id: "x1", imovelIdentificadoId: ID, origem: "investigador-web", resultadosTotal: 2, atributosTotal: 2, recusadosTotal: 0, concluidaEm: T2, criadoEm: T2, ...extra };
}
function afirmacao(extra: Partial<AfirmacaoRegistrada> = {}): AfirmacaoRegistrada {
  return {
    id: 1, imovelIdentificadoId: ID, investigacaoId: "x1", atributo: "area_m2", valorTexto: null, valorNum: 82,
    origem: "investigador-web", estado: "hipotese", confianca: null, fonteUrl: "https://portal-a.test/anuncio/1", fonteDominio: "portal-a.test",
    observadoEm: T2, confirmadoPor: null, confirmadoEm: null, criadoEm: T2, ...extra,
  };
}
const confirmada = (extra: Partial<AfirmacaoRegistrada> = {}) => afirmacao({ estado: "confirmada", confirmadoPor: USUARIO, confirmadoEm: T3, ...extra });

function leituraDe(atributos: AfirmacaoRegistrada[], investigacoes = [investigacao()], extra: Record<string, unknown> = {}) {
  const d = detalhe(extra);
  return lerMemoria(montarMemoriaIdentidade(d, investigacoes, atributos), d.identificado);
}

/** jsdom não tem matchMedia; aqui a tela "é" larga ou estreita. */
function telaDeLargura(estreita: boolean) {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (consulta: string) => ({ matches: estreita && consulta === LARGURA_TELA_ESTREITA, media: consulta, addEventListener: vi.fn(), removeEventListener: vi.fn() }),
  });
}

/* ================================================================
   1. READ MODEL
   ================================================================ */
describe("C13C — read model: a tela só apresenta o que o núcleo decidiu", () => {
  it("A. hipótese única aparece como Hipótese, com rótulo amigável, valor formatado, fonte e data", () => {
    const leitura = leituraDe([afirmacao()]);
    expect(leitura.fatos).toHaveLength(1);
    const [fato] = leitura.fatos;
    expect(fato.atributo).toBe("area_m2");
    expect(fato.rotulo).toBe("Área");
    expect(fato.vigente).toMatchObject({ id: 1, valor: "82 m²", estado: "hipotese", rotuloEstado: "Hipótese", podeConfirmar: true, confirmadoEm: null, confirmadoEmTexto: null });
    expect(fato.vigente.fonte).toEqual({ rotulo: "portal-a.test", url: "https://portal-a.test/anuncio/1" });
    expect(fato.vigente.observadoEmTexto).toMatch(/^\d{2}\/\d{2}\/2026$/);
    expect(fato.outros).toEqual([]);
    expect(fato.divergente).toBe(false);
    expect(JSON.stringify(leitura)).not.toMatch(/area_m2"?:"?\d|referencia_anuncio|valor_anunciado|confianca/);
  });

  it("B/C. confirmada aparece como Confirmado, com a data da confirmação, e preserva fonte, valor e origem", () => {
    const [fato] = leituraDe([confirmada()]).fatos;
    expect(fato.vigente).toMatchObject({ estado: "confirmada", rotuloEstado: "Confirmado", valor: "82 m²", podeConfirmar: false, confirmadoEm: T3 });
    expect(fato.vigente.confirmadoEmTexto).toMatch(/^\d{2}\/\d{2}\/2026$/);
    expect(fato.vigente.fonte).toEqual({ rotulo: "portal-a.test", url: "https://portal-a.test/anuncio/1" });
    expect(fato.vigente.observadoEm).toBe(T2);
  });

  it("D/E. confirmada vence a hipótese mais nova; a hipótese divergente fica no histórico do fato, não some", () => {
    const [fato] = leituraDe([
      confirmada({ id: 1, valorNum: 82, observadoEm: T2 }),
      afirmacao({ id: 2, valorNum: 95, observadoEm: T4, investigacaoId: "x2", fonteUrl: "https://portal-b.test/9", fonteDominio: "portal-b.test" }),
    ], [investigacao(), investigacao({ id: "x2", concluidaEm: T4, criadoEm: T4 })]).fatos;
    expect(fato.vigente.id).toBe(1);
    expect(fato.vigente.estado).toBe("confirmada");
    expect(fato.outros.map((a) => [a.id, a.valor, a.estado])).toEqual([[2, "95 m²", "hipotese"]]);
    expect(fato.divergentes.map((a) => a.id)).toEqual([2]);
    expect(fato.divergente).toBe(true);
  });

  it("F. duas hipóteses divergentes: a mais recente é vigente e a outra é conflito; sem média, sem escolha", () => {
    const [fato] = leituraDe([
      afirmacao({ id: 1, valorNum: 82, observadoEm: T2 }),
      afirmacao({ id: 2, valorNum: 95, observadoEm: T4, fonteUrl: "https://portal-b.test/9", fonteDominio: "portal-b.test" }),
    ]).fatos;
    expect(fato.vigente).toMatchObject({ id: 2, valor: "95 m²", estado: "hipotese" });
    expect(fato.divergentes.map((a) => a.valor)).toEqual(["82 m²"]);
    expect(fato.divergente).toBe(true);
    expect(JSON.stringify(fato)).not.toMatch(/88,5|média|media/);
    // A mesma informação de outra fonte não é divergência: fica em `outros`, não em `divergentes`.
    const [igual] = leituraDe([
      afirmacao({ id: 1, valorNum: 82 }),
      afirmacao({ id: 2, valorNum: 82, observadoEm: T4, fonteUrl: "https://portal-b.test/9", fonteDominio: "portal-b.test" }),
    ]).fatos;
    expect(igual.divergente).toBe(false);
    expect(igual.outros).toHaveLength(1);
    expect(igual.divergentes).toEqual([]);
  });

  it("G/H. ausência não aparece: atributo sem linha (inclusive valor_anunciado, reservado) não vira fato, nem placeholder", () => {
    const leitura = leituraDe([afirmacao({ atributo: "quartos", valorNum: 3 })]);
    expect(leitura.fatos.map((f) => f.atributo)).toEqual(["quartos"]);
    expect(JSON.stringify(leitura.fatos)).not.toMatch(/valor_anunciado|Valor anunciado|Área|Vagas|Condomínio|Referência/);
    expect(leituraDe([]).fatos).toEqual([]);
    expect(leituraDe([]).resumo).toEqual({ informacoes: 0, confirmadas: 0, divergentes: 0, texto: null });
  });

  it("I. fonte: domínio como rótulo; só http(s) vira link; sem domínio, 'Fonte registrada'; sem URL segura, sem link", () => {
    expect(fonteParaLeitura({ fonteUrl: "https://www.portal-a.test/anuncio/1?x=1", fonteDominio: "portal-a.test" })).toEqual({ rotulo: "portal-a.test", url: "https://www.portal-a.test/anuncio/1?x=1" });
    expect(fonteParaLeitura({ fonteUrl: "javascript:alert(1)", fonteDominio: "portal-a.test" })).toEqual({ rotulo: "portal-a.test", url: null });
    expect(fonteParaLeitura({ fonteUrl: "", fonteDominio: "" })).toEqual({ rotulo: ROTULO_FONTE_SEM_DOMINIO, url: null });
    expect(fonteParaLeitura({ fonteUrl: "  ", fonteDominio: "portal-a.test" })).toEqual({ rotulo: "portal-a.test", url: null });
  });

  it("J. datas: DD/MM/AAAA a partir do ISO; inválida vira vazio, nunca inventada; valores por formato do catálogo", () => {
    const [fato] = leituraDe([afirmacao({ observadoEm: "2026-09-08T10:00:00.000Z" })]).fatos;
    expect(fato.vigente.observadoEmTexto).toMatch(/^0[789]\/09\/2026$/);
    const [invalida] = leituraDe([afirmacao({ observadoEm: "nao-e-data" })]).fatos;
    expect(invalida.vigente.observadoEmTexto).toBe("");
    const leitura = leituraDe([
      afirmacao({ id: 1, atributo: "area_m2", valorNum: 85.5 }),
      afirmacao({ id: 2, atributo: "quartos", valorNum: 3 }),
      afirmacao({ id: 3, atributo: "vagas", valorNum: 2 }),
      afirmacao({ id: 4, atributo: "condominio", valorNum: null, valorTexto: "Residencial Aurora" }),
      afirmacao({ id: 5, atributo: "referencia_anuncio", valorNum: null, valorTexto: "CA-7781" }),
    ]);
    expect(leitura.fatos.map((f) => [f.rotulo, f.vigente.valor])).toEqual([
      ["Área", "85,5 m²"], ["Quartos", "3"], ["Vagas", "2"], ["Condomínio", "Residencial Aurora"], ["Referência do anúncio", "CA-7781"],
    ]);
    expect(leitura.resumo.texto).toBe("5 informações");
    expect(resumirMemoria(leituraDe([confirmada({ id: 1 }), afirmacao({ id: 2, atributo: "quartos", valorNum: 3 })]).fatos).texto).toBe("2 informações · 1 confirmada");
    expect(resumirMemoria(leituraDe([afirmacao({ id: 1, valorNum: 82 }), afirmacao({ id: 2, valorNum: 95, observadoEm: T4 })]).fatos).texto).toBe("1 informação · 1 divergente");
  });

  it("K/L. histórico: primeira/última passagem e promoção derivadas do registro (nada persistido), investigações com contagem e fontes, confirmações e divergências; sem fotos nem passagens repetidas", () => {
    const d = detalhe({ avistamentosTotal: 3, primeiroAvistamentoEm: T1, ultimoAvistamentoEm: T3, promovidoEm: T4, imovelId: "imovel-1", situacao: "promovido" }, [
      avistamento({ id: "av-3", observadoEm: T3, fotos: [{ id: "f1", estado: "ativa", ativadaEm: T3, criadoEm: T3 }] }),
      avistamento({ id: "av-2", observadoEm: T2 }),
      avistamento({ id: "av-1", observadoEm: T1 }),
    ]);
    const memoria = montarMemoriaIdentidade(d, [investigacao({ atributosTotal: 2 })], [
      confirmada({ id: 1, valorNum: 82 }),
      afirmacao({ id: 2, valorNum: 95, observadoEm: T4, fonteUrl: "https://portal-b.test/9", fonteDominio: "portal-b.test" }),
    ]);
    // O núcleo do C13A ainda lista cada passagem e cada foto; a leitura não os repete.
    expect(memoria.linhaDoTempo.filter((e) => e.tipo === "passagem")).toHaveLength(3);
    expect(memoria.linhaDoTempo.filter((e) => e.tipo === "foto")).toHaveLength(1);
    const { historico } = lerMemoria(memoria, d.identificado);
    expect(historico.map((e) => e.tipo)).toEqual(["divergencia", "promocao", "confirmacao", "ultimo-avistamento", "investigacao", "primeiro-avistamento"]);
    expect(historico.map((e) => e.titulo)).toEqual([
      `${TITULO_DIVERGENCIA}: Área`, "Transformado em oportunidade", "Área confirmado por você", "Último avistamento", "Investigação realizada", "Primeiro avistamento",
    ]);
    const inv = historico.find((e) => e.tipo === "investigacao")!;
    expect(inv.detalhe).toBe("2 descobertas estruturadas · Área · Fontes: portal-a.test, portal-b.test");
    expect(historico.find((e) => e.tipo === "divergencia")!.detalhe).toBe("82 m² · 95 m²"); // vigente primeiro
    expect(historico.find((e) => e.tipo === "ultimo-avistamento")!.detalhe).toContain("3 passagens no total");
    expect(historico.every((e) => /^\d{2}\/\d{2}\/2026$/.test(e.emTexto))).toBe(true);
    expect(JSON.stringify(historico)).not.toMatch(/foto|Foto|Passagem registrada|GPS|observacao|query|prompt|provider|rapidapi|token|gpt/i);
    // Sem promoção nem segunda passagem, esses eventos simplesmente não existem.
    const simples = leituraDe([], []);
    expect(simples.historico.map((e) => e.tipo)).toEqual(["primeiro-avistamento"]);
    expect(simples.investigado).toBe(true);
    expect(leituraDe([], [], { ultimaInvestigacaoEm: null }).investigado).toBe(false);
  });

  it("confirmar só é oferecido para hipótese de registro sem exclusão pendente; a regra de vigência é a do núcleo, não da tela", () => {
    expect(leituraDe([afirmacao()], undefined, { exclusaoSolicitadaEm: T3 }).fatos[0].vigente.podeConfirmar).toBe(false);
    expect(leituraDe([afirmacao()], undefined, { situacao: "fundido" }).fatos[0].vigente.podeConfirmar).toBe(false);
    expect(leituraDe([afirmacao()], undefined, { situacao: "promovido" }).fatos[0].vigente.podeConfirmar).toBe(true);
    const fonte = ler("lib/calculo/leituraMemoria.ts");
    expect(fonte).toMatch(/montarMemoriaIdentidade|VisaoAtributoMemoria/);
    expect(fonte).not.toMatch(/\.sort\(\(a, b\) => b\.observadoEm|estado === "confirmada" \? .* : historico\[0\]/);
    expect(fonte).not.toMatch(/openai|fetch\(|supabase|\.rpc\(|new Date\(/i);
  });
});

/* ================================================================
   2. TELA
   ================================================================ */
describe("C13C — a seção Memória do imóvel no detalhe do Garimpo", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.assign(cenario.estado, { salvando: false, carregando: false, erro: null });
    cenario.estado.carregarMemoria.mockResolvedValue({ investigacoes: [], atributos: [] });
    cenario.estado.confirmarAtributo.mockResolvedValue(false);
    telaDeLargura(false);
    vi.stubGlobal("fetch", cenario.fetch);
  });
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    // @ts-expect-error — jsdom não define matchMedia; o teste que definiu limpa.
    delete window.matchMedia;
  });

  const secao = () => document.querySelector("[data-secao-memoria]") as HTMLElement;
  const alternar = () => within(secao()).getByRole("button", { name: TITULO_MEMORIA });
  async function memoriaPronta() {
    await waitFor(() => expect(within(secao()).queryByText("Carregando a memória…")).toBeNull());
  }
  function comMemoria(atributos: AfirmacaoRegistrada[], investigacoes = [investigacao()]) {
    cenario.estado.carregarMemoria.mockResolvedValue({ investigacoes, atributos });
  }

  it("A/C/R. a seção existe no detalhe, distinta de passagens, etiquetas e Investigador; carrega só este registro; o resto do painel segue igual", async () => {
    render(createElement(PainelIdentificado, { detalhe: detalhe() }));
    await memoriaPronta();
    expect(secao().getAttribute("aria-label")).toBe(TITULO_MEMORIA);
    const titulos = [...document.querySelectorAll("h4")].map((h) => h.textContent);
    expect(titulos).toContain(TITULO_MEMORIA);
    expect(titulos).toContain("O que sabemos agora");
    expect(titulos).toContain("Histórico de passagens");
    expect(document.querySelector("[data-secao-historico]")).not.toBeNull();
    expect(document.querySelector("[data-acao='investigar']")).not.toBeNull();
    expect(cenario.estado.carregarMemoria).toHaveBeenCalledExactlyOnceWith(ID);
    expect(alternar().getAttribute("aria-expanded")).toBe("true");
    expect(secao().querySelector("[data-memoria-corpo]")!.hasAttribute("hidden")).toBe(false);
  });

  it("B. no celular a seção nasce recolhida, com o resumo no título; o botão tem aria-expanded e abre a um toque", async () => {
    telaDeLargura(true);
    comMemoria([confirmada({ id: 1 }), afirmacao({ id: 2, atributo: "quartos", valorNum: 3 })]);
    render(createElement(PainelIdentificado, { detalhe: detalhe() }));
    await memoriaPronta();
    const botao = alternar();
    expect(botao.getAttribute("aria-expanded")).toBe("false");
    expect(botao.getAttribute("aria-controls")).toBe(secao().querySelector("[data-memoria-corpo]")!.id);
    expect(secao().querySelector("[data-memoria-corpo]")!.hasAttribute("hidden")).toBe(true);
    expect(secao().querySelector("[data-memoria-resumo]")!.textContent).toBe("2 informações · 1 confirmada");
    fireEvent.click(botao);
    expect(botao.getAttribute("aria-expanded")).toBe("true");
    expect(secao().querySelector("[data-memoria-corpo]")!.hasAttribute("hidden")).toBe(false);
    // Histórico de passagens e localização continuam recolhidos, como no C10.1.
    expect((document.querySelector("[data-secao-historico] details") as HTMLDetailsElement).open).toBe(false);
  });

  it("D/E. estado vazio depois de investigar e 'nunca investigado' são frases diferentes; o segundo oferece a ação existente de investigar", async () => {
    render(createElement(MemoriaIdentidade, { detalhe: detalhe({ ultimaInvestigacaoEm: T2 }), recolhida: false }));
    await memoriaPronta();
    expect(secao().querySelector("[data-memoria-vazia]")!.getAttribute("data-memoria-vazia")).toBe("sem-descobertas");
    expect(secao().textContent).toContain(TEXTO_SEM_DESCOBERTAS);
    expect(within(secao()).queryByRole("link", { name: "Investigar na web" })).toBeNull();
    // Mesmo sem descobertas, a memória composta existe: a primeira passagem está no histórico.
    expect(secao().querySelector("[data-memoria-evento='primeiro-avistamento']")).not.toBeNull();
    cleanup();
    render(createElement(MemoriaIdentidade, { detalhe: detalhe({ ultimaInvestigacaoEm: null }), recolhida: false }));
    await memoriaPronta();
    expect(secao().querySelector("[data-memoria-vazia]")!.getAttribute("data-memoria-vazia")).toBe("nunca-investigado");
    expect(secao().textContent).toContain(TEXTO_NUNCA_INVESTIGADO);
    expect(secao().textContent).not.toContain(TEXTO_SEM_DESCOBERTAS);
    expect(within(secao()).getByRole("link", { name: "Investigar na web" }).getAttribute("href")).toContain(ID);
    expect(secao().querySelector("[data-memoria-resumo]")).toBeNull();
  });

  it("F/G/I/J/K. hipótese e confirmado distinguíveis em texto e atributo; fonte com domínio vira link em nova aba; sem URL não há link; Confirmar só na hipótese", async () => {
    comMemoria([
      afirmacao({ id: 1, atributo: "area_m2", valorNum: 82 }),
      confirmada({ id: 2, atributo: "quartos", valorNum: 3, fonteUrl: "javascript:alert(1)", fonteDominio: "" }),
    ]);
    render(createElement(MemoriaIdentidade, { detalhe: detalhe(), recolhida: false }));
    await memoriaPronta();
    const area = secao().querySelector("[data-memoria-fato='area_m2']")!;
    expect(area.querySelector(".memoriaRotulo, [class*='memoriaRotulo']")!.textContent).toBe("Área");
    expect(area.textContent).toContain("82 m²");
    expect(area.querySelector("[data-memoria-estado]")!.getAttribute("data-memoria-estado")).toBe("hipotese");
    expect(area.querySelector("[data-memoria-estado]")!.textContent).toBe("Hipótese");
    const link = area.querySelector("[data-memoria-fonte='link']") as HTMLAnchorElement;
    expect(link.getAttribute("href")).toBe("https://portal-a.test/anuncio/1");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toContain("noopener");
    expect(link.textContent).toContain("portal-a.test");
    expect(area.textContent).not.toContain("https://");
    expect(within(area as HTMLElement).getByRole("button", { name: ROTULO_CONFIRMAR_INFORMACAO })).toBeTruthy();

    const quartos = secao().querySelector("[data-memoria-fato='quartos']")!;
    expect(quartos.querySelector("[data-memoria-estado]")!.getAttribute("data-memoria-estado")).toBe("confirmada");
    expect(quartos.querySelector("[data-memoria-estado]")!.textContent).toBe("Confirmado");
    expect(quartos.textContent).toMatch(/Confirmado em \d{2}\/\d{2}\/2026/);
    expect(quartos.querySelector("a")).toBeNull();
    expect(quartos.querySelector("[data-memoria-fonte='texto']")!.textContent).toBe(ROTULO_FONTE_SEM_DOMINIO);
    expect(within(quartos as HTMLElement).queryByRole("button", { name: ROTULO_CONFIRMAR_INFORMACAO })).toBeNull();
    expect(secao().textContent).not.toMatch(/area_m2|referencia_anuncio|confianca|score|%/);
    expect(secao().querySelector("[data-memoria-resumo]")!.textContent).toBe("2 informações · 1 confirmada");
  });

  it("H. conflito: o valor divergente fica visível como 'Informações divergentes', com fonte, sem escolha automática; a mesma informação de outra fonte não é conflito", async () => {
    comMemoria([
      confirmada({ id: 1, valorNum: 82 }),
      afirmacao({ id: 2, valorNum: 95, observadoEm: T4, fonteUrl: "https://portal-b.test/9", fonteDominio: "portal-b.test" }),
      afirmacao({ id: 3, atributo: "quartos", valorNum: 3 }),
      afirmacao({ id: 4, atributo: "quartos", valorNum: 3, observadoEm: T4, fonteUrl: "https://portal-b.test/9", fonteDominio: "portal-b.test" }),
    ]);
    render(createElement(MemoriaIdentidade, { detalhe: detalhe(), recolhida: false }));
    await memoriaPronta();
    const area = secao().querySelector("[data-memoria-fato='area_m2']")!;
    expect(area.hasAttribute("data-memoria-divergente")).toBe(true);
    const conflito = area.querySelector("[data-memoria-conflito]")!;
    expect(conflito.textContent).toContain(TITULO_DIVERGENCIA);
    expect(conflito.textContent).toContain("95 m²");
    expect(conflito.textContent).toContain("portal-b.test");
    expect(conflito.querySelector("[data-memoria-estado]")!.textContent).toBe("Hipótese");
    // O vigente continua o confirmado; o divergente pode ser confirmado pela pessoa, nunca pela tela.
    expect(area.querySelector("[data-memoria-afirmacao='1'] [data-memoria-estado]")!.textContent).toBe("Confirmado");
    expect(within(conflito as HTMLElement).getByRole("button", { name: ROTULO_CONFIRMAR_INFORMACAO })).toBeTruthy();
    const quartos = secao().querySelector("[data-memoria-fato='quartos']")!;
    expect(quartos.hasAttribute("data-memoria-divergente")).toBe(false);
    expect(quartos.querySelector("[data-memoria-conflito]")).toBeNull();
    expect(secao().querySelector("[data-memoria-resumo]")!.textContent).toBe("2 informações · 1 confirmada · 1 divergente");
    expect(secao().querySelector("[data-memoria-evento='divergencia']")!.textContent).toContain("Área");
  });

  it("L/M. Confirmar pergunta, chama a ação do store com o id da afirmação e relê a memória; o item passa a Confirmado com a mesma fonte", async () => {
    const hipotese = afirmacao({ id: 7 });
    comMemoria([hipotese]);
    cenario.estado.confirmarAtributo.mockImplementation(async () => {
      comMemoria([confirmada({ id: 7 })]);
      return true;
    });
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(createElement(MemoriaIdentidade, { detalhe: detalhe(), recolhida: false }));
    await memoriaPronta();
    fireEvent.click(within(secao()).getByRole("button", { name: ROTULO_CONFIRMAR_INFORMACAO }));
    expect(confirm).toHaveBeenCalledWith(PERGUNTA_CONFIRMAR_INFORMACAO);
    await waitFor(() => expect(cenario.estado.confirmarAtributo).toHaveBeenCalledExactlyOnceWith(7));
    await waitFor(() => expect(secao().querySelector("[data-memoria-estado]")!.textContent).toBe("Confirmado"));
    expect(cenario.estado.carregarMemoria).toHaveBeenCalledTimes(2);
    const fato = secao().querySelector("[data-memoria-fato='area_m2']")!;
    expect(fato.querySelector("[data-memoria-afirmacao='7']")).not.toBeNull();
    expect((fato.querySelector("[data-memoria-fonte='link']") as HTMLAnchorElement).getAttribute("href")).toBe("https://portal-a.test/anuncio/1");
    expect(within(secao()).queryByRole("button", { name: ROTULO_CONFIRMAR_INFORMACAO })).toBeNull();
    expect(secao().querySelector("[role='alert']")).toBeNull();
    // Nada além da RPC de confirmação: nenhuma promoção, situação ou escrita no detalhe.
    expect(cenario.estado.iniciarPromocao).not.toHaveBeenCalled();
    expect(cenario.estado.vincularPromocao).not.toHaveBeenCalled();
    expect(cenario.estado.carregarDetalhe).not.toHaveBeenCalled();
  });

  it("N. cancelar a pergunta não chama nada; falha na confirmação mantém a hipótese e mostra erro local, sem otimismo", async () => {
    comMemoria([afirmacao({ id: 7 })]);
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(createElement(MemoriaIdentidade, { detalhe: detalhe(), recolhida: false }));
    await memoriaPronta();
    fireEvent.click(within(secao()).getByRole("button", { name: ROTULO_CONFIRMAR_INFORMACAO }));
    expect(cenario.estado.confirmarAtributo).not.toHaveBeenCalled();
    confirm.mockReturnValue(true);
    cenario.estado.confirmarAtributo.mockResolvedValue(false);
    fireEvent.click(within(secao()).getByRole("button", { name: ROTULO_CONFIRMAR_INFORMACAO }));
    await waitFor(() => expect(cenario.estado.confirmarAtributo).toHaveBeenCalledExactlyOnceWith(7));
    await waitFor(() => expect(secao().querySelector("[role='alert']")!.textContent).toBe(ERRO_CONFIRMAR_INFORMACAO));
    expect(secao().querySelector("[data-memoria-estado]")!.textContent).toBe("Hipótese");
    expect(within(secao()).getByRole("button", { name: ROTULO_CONFIRMAR_INFORMACAO })).toBeTruthy();
    expect(cenario.estado.carregarMemoria).toHaveBeenCalledTimes(1);
  });

  it("erro de carregamento: mensagem local e 'Tentar de novo' relê; o resto do detalhe continua de pé", async () => {
    cenario.estado.carregarMemoria.mockResolvedValueOnce(null);
    render(createElement(PainelIdentificado, { detalhe: detalhe() }));
    await memoriaPronta();
    expect(secao().querySelector("[data-memoria-erro]")!.textContent).toContain(ERRO_CARREGAR_MEMORIA);
    expect(document.querySelector("[data-secao-historico]")).not.toBeNull();
    expect(document.querySelector("[data-proximas-acoes]")).not.toBeNull();
    fireEvent.click(within(secao()).getByRole("button", { name: "Tentar de novo" }));
    await waitFor(() => expect(cenario.estado.carregarMemoria).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(secao().querySelector("[data-memoria-erro]")).toBeNull());
    expect(secao().textContent).toContain(TEXTO_SEM_DESCOBERTAS);
  });

  it("O/P/Q. visualizar não chama IA, não escreve, não promove: só a leitura do store; os arquivos não têm IA, RPC direta nem promoção", async () => {
    comMemoria([afirmacao({ id: 1 }), confirmada({ id: 2, atributo: "quartos", valorNum: 3 })]);
    render(createElement(PainelIdentificado, { detalhe: detalhe() }));
    await memoriaPronta();
    fireEvent.click(within(secao()).getByText("Histórico"));
    expect(cenario.fetch).not.toHaveBeenCalled();
    expect(cenario.estado.confirmarAtributo).not.toHaveBeenCalled();
    expect(cenario.estado.classificarAvistamento).not.toHaveBeenCalled();
    expect(cenario.estado.iniciarPromocao).not.toHaveBeenCalled();
    expect(cenario.estado.vincularPromocao).not.toHaveBeenCalled();
    expect(cenario.estado.definirTipo).not.toHaveBeenCalled();
    expect(cenario.estado.carregarMemoria).toHaveBeenCalledTimes(1);
    for (const caminho of ["components/prospeccao/MemoriaIdentidade.tsx", "lib/calculo/leituraMemoria.ts"]) {
      const fonte = ler(caminho);
      expect(fonte, caminho).not.toMatch(/openai|gpt|rapidapi|fetch\(|classificarAvistamento|getSupabase|@supabase|\.from\(|\.rpc\(|\.insert\(|\.update\(|iniciarPromocao|vincularPromocao|promovid|definir_situacao|salvarImovel|@\/lib\/store/);
    }
    const ponte = ler("lib/prospeccao.ts");
    const leitura = ponte.slice(ponte.indexOf("export async function obterMemoriaIdentificado"), ponte.indexOf("export async function confirmarAtributoIdentificado"));
    expect(leitura).not.toMatch(/\.insert\(|\.update\(|\.upsert\(|\.delete\(|\.rpc\(|SERVICE_ROLE/);
    expect(ponte).toMatch(/chamarRpc\(client, "confirmar_atributo_identificado", \{\s+p_atributo_id: atributoId,\s+\}\)/);
    expect(ler("lib/useProspeccao.ts")).not.toMatch(/confirmarAtributo\([\s\S]*?detalheAtualizado/);
  });

  it("acessibilidade e celular (CSS): alvo de toque no título, botão de linha inteira, histórico empilhado, texto que quebra sem estourar; sem dependência nova", () => {
    const mobile = CSS.slice(CSS.lastIndexOf("@media (max-width: 720px)"));
    expect(mobile).toMatch(/\.memoriaAlternar \{[^}]*min-height: 44px/);
    expect(mobile).toMatch(/\.memoriaConfirmar \{[^}]*width: 100%/);
    expect(mobile).toMatch(/\.memoriaHistorico li \{ grid-template-columns: 1fr; \}/);
    expect(CSS).toMatch(/\.memoriaFato \{[^}]*overflow-wrap: anywhere/);
    expect(CSS).toMatch(/\.memoriaMeta a \{[^}]*overflow-wrap: anywhere/);
    expect(CSS).toMatch(/\.memoriaAlternar:focus-visible \{ outline: 2px solid var\(--accent\)/);
    expect(CSS).toMatch(/\.memoriaAlternar\[aria-expanded="true"\]::after/);
    // Tema por token: nenhuma cor crua na seção.
    const bloco = CSS.slice(CSS.indexOf("C13C: memória de identidade"), CSS.lastIndexOf("@media (max-width: 720px)"));
    expect(bloco).not.toMatch(/#[0-9a-f]{3,8}\b|rgb\(/i);
    expect(bloco).toMatch(/var\(--warn\)|var\(--good\)|var\(--text-dim\)|var\(--bg-elev-2\)/);
    const pacote = JSON.parse(ler("package.json")) as { dependencies: Record<string, string> };
    expect(Object.keys(pacote.dependencies).filter((d) => /timeline|accordion|icon|date-fns|dayjs|moment|luxon/i.test(d))).toEqual([]);
  });
});

/* ================================================================
   3. BANCO LOCAL: confirmação real pela fronteira
   ================================================================ */
describe.sequential("C13C — hipótese → carregar → confirmar → recarregar no PostgreSQL local", () => {
  const PASTA = "../supabase/migrations/";
  let db: PGlite;

  beforeAll(async () => {
    db = new PGlite();
    await db.exec(`
      create role anon nologin; create role authenticated nologin; create role service_role nologin;
      create schema auth; create schema private; create schema storage;
      create table auth.users (id uuid primary key);
      insert into auth.users values ('${USUARIO}'), ('${OUTRO_USUARIO}');
      create function auth.uid() returns uuid language sql stable
        as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema auth to authenticated, service_role;
      grant usage on schema public to authenticated, service_role, anon;
      create function public.set_updated_at() returns trigger language plpgsql
        as $$ begin new.updated_at := now(); return new; end; $$;
      create table public.imoveis (id uuid primary key, user_id uuid references auth.users(id));
      create table storage.objects (id uuid primary key, bucket_id text, name text);
    `);
    for (const nome of [
      "20260910184310_prospeccao_campo.sql", "20260910190155_prospeccao_campo_rls_grants.sql",
      "20260910193412_prospeccao_campo_triggers.sql", "20260910211045_prospeccao_campo_rpcs_navegador.sql",
      "20260913162604_prospeccao_merge_contrato_transacional.sql", "20260915190000_prospeccao_memoria_identidade.sql",
    ]) await db.exec(ler(PASTA + nome));
  }, 30_000);
  beforeEach(async () => { await db.exec("reset role; truncate public.imoveis_identificados cascade; begin"); });
  afterEach(async () => { await db.exec("rollback; reset role"); });
  afterAll(async () => { await db?.close(); });

  async function como<T extends Json>(papel: string, sub: string | null, sql: string, parametros: unknown[] = []) {
    await db.exec("savepoint chamada");
    try {
      await db.query("select set_config('request.jwt.claim.sub', $1, false)", [sub ?? ""]);
      await db.exec(`set role ${papel}`);
      const r = await db.query<T>(sql, parametros);
      await db.exec("reset role; release savepoint chamada");
      return r;
    } catch (erro) {
      await db.exec("rollback to savepoint chamada; reset role");
      throw erro;
    }
  }

  /** O que o navegador faria: um cliente mínimo com a mesma forma de
      `from().select().eq().order()` e `rpc()`, executado como
      `authenticated` com o `sub` da sessão. Linhas viram JSON (como o
      PostgREST entrega), para que o mapeamento real seja o testado. */
  function clienteDoNavegador(sub: string) {
    function consulta(tabela: string) {
      const filtros: Array<[string, unknown]> = [];
      const ordens: string[] = [];
      let colunas = "*";
      const executar = async () => {
        const where = filtros.map(([c], i) => `${c} = $${i + 1}`).join(" and ");
        const sql = `select to_jsonb(t) as linha from (select ${colunas} from public.${tabela}${where ? ` where ${where}` : ""}${ordens.length ? ` order by ${ordens.join(", ")}` : ""}) t`;
        try {
          const r = await como<{ linha: Json }>("authenticated", sub, sql, filtros.map(([, v]) => v));
          return { data: r.rows.map((linha) => linha.linha), error: null };
        } catch (erro) {
          return { data: null, error: erro };
        }
      };
      const construtor = {
        select(c: string) { colunas = c; return construtor; },
        eq(coluna: string, valor: unknown) { filtros.push([coluna, valor]); return construtor; },
        order(coluna: string, opcoes: { ascending: boolean }) { ordens.push(`${coluna} ${opcoes.ascending ? "asc" : "desc"}`); return construtor; },
        then<R>(resolver: (r: { data: Json[] | null; error: unknown }) => R, rejeitar?: (e: unknown) => R) { return executar().then(resolver, rejeitar); },
      };
      return construtor;
    }
    return {
      from: consulta,
      rpc: async (nome: string, parametros: Record<string, unknown>) => {
        const chaves = Object.keys(parametros);
        const sql = `select public.${nome}(${chaves.map((c, i) => `${c} => $${i + 1}`).join(", ")}) as resultado`;
        try {
          const r = await como<{ resultado: Json }>("authenticated", sub, sql, Object.values(parametros));
          return { data: r.rows[0].resultado, error: null };
        } catch (erro) {
          return { data: null, error: erro };
        }
      },
    } as never;
  }

  async function identidade(usuario = USUARIO) {
    const id = randomUUID();
    await db.query("insert into public.imoveis_identificados (id, user_id, logradouro) values ($1, $2, 'Rua das Palmeiras')", [id, usuario]);
    return id;
  }
  /** Uma hipótese vinda do Investigador (C13B): pela RPC de servidor, como service_role. */
  async function hipotese(imovel: string, atributos: Json[], usuario = USUARIO) {
    const execucao = randomUUID();
    await como("service_role", null,
      "select public.registrar_investigacao_identificado($1, $2, $3, $4, 0, $5::jsonb) as resultado",
      [usuario, execucao, imovel, atributos.length, JSON.stringify(atributos)]);
    return execucao;
  }
  const dump = async (imovel: string) =>
    (await db.query<{ l: Json }>("select to_jsonb(t) as l from public.imoveis_identificados_atributos t where imovel_identificado_id = $1 order by id", [imovel])).rows.map((r) => r.l);

  it("carrega sob RLS o que é do usuário, mapeia para os tipos do núcleo e não escreve nada por ler", async () => {
    const imovel = await identidade();
    const execucao = await hipotese(imovel, [
      { atributo: "area_m2", valor_num: 82, fonte_url: "https://portal-a.test/anuncio/1", fonte_dominio: "portal-a.test" },
      { atributo: "condominio", valor_texto: "Residencial Aurora", fonte_url: "https://portal-a.test/anuncio/1", fonte_dominio: "portal-a.test" },
    ]);
    const alheio = await identidade(OUTRO_USUARIO);
    await hipotese(alheio, [{ atributo: "quartos", valor_num: 9, fonte_url: "https://x.test/1", fonte_dominio: "x.test" }], OUTRO_USUARIO);
    const antes = JSON.stringify([...(await dump(imovel)), ...(await dump(alheio))]);

    const memoria = await obterMemoriaIdentificado(imovel, clienteDoNavegador(USUARIO));
    expect(memoria.investigacoes).toEqual([expect.objectContaining({ id: execucao, imovelIdentificadoId: imovel, origem: "investigador-web", resultadosTotal: 2, atributosTotal: 2, recusadosTotal: 0 })]);
    expect(memoria.investigacoes[0]).not.toHaveProperty("consulta");
    expect(memoria.atributos.map((a) => [a.atributo, a.valorNum, a.valorTexto, a.estado, a.confianca, a.fonteDominio, a.investigacaoId])).toEqual([
      ["condominio", null, "Residencial Aurora", "hipotese", null, "portal-a.test", execucao],
      ["area_m2", 82, null, "hipotese", null, "portal-a.test", execucao],
    ]);
    expect(memoria.atributos.every((a) => typeof a.id === "number" && /^\d{4}-\d{2}-\d{2}T/.test(a.observadoEm) && a.confirmadoPor === null)).toBe(true);
    // O registro alheio não aparece nem para o dono do outro (RLS), e a leitura não mudou nada.
    expect(await obterMemoriaIdentificado(alheio, clienteDoNavegador(USUARIO))).toEqual({ investigacoes: [], atributos: [] });
    expect(JSON.stringify([...(await dump(imovel)), ...(await dump(alheio))])).toBe(antes);
    // Lida pelo núcleo + read model, a hipótese aparece como Hipótese com a fonte.
    const d = detalhe({ id: imovel, ultimaInvestigacaoEm: T2 });
    const leitura = lerMemoria(montarMemoriaIdentidade(d, memoria.investigacoes, memoria.atributos), d.identificado);
    expect(leitura.fatos.map((f) => [f.rotulo, f.vigente.valor, f.vigente.rotuloEstado, f.vigente.fonte.url])).toEqual([
      ["Área", "82 m²", "Hipótese", "https://portal-a.test/anuncio/1"], ["Condomínio", "Residencial Aurora", "Hipótese", "https://portal-a.test/anuncio/1"],
    ]);
  });

  it("confirmar pela fronteira: mesma linha, mesma origem, mesma fonte, mesmo valor, mesma observação; só estado, confirmado_por e confirmado_em mudam; repetir é idempotente", async () => {
    const imovel = await identidade();
    await hipotese(imovel, [{ atributo: "area_m2", valor_num: 82, fonte_url: "https://portal-a.test/anuncio/1", fonte_dominio: "portal-a.test" }]);
    const cliente = clienteDoNavegador(USUARIO);
    const antesMemoria = await obterMemoriaIdentificado(imovel, cliente);
    const [hip] = antesMemoria.atributos;
    expect(hip.estado).toBe("hipotese");
    const [linhaAntes] = await dump(imovel);

    expect(await confirmarAtributoIdentificado(hip.id, cliente)).toEqual({ repetida: false });

    const depoisMemoria = await obterMemoriaIdentificado(imovel, cliente);
    expect(depoisMemoria.atributos).toHaveLength(1);
    const [conf] = depoisMemoria.atributos;
    expect(conf.id).toBe(hip.id);
    expect(conf.estado).toBe("confirmada");
    expect(conf.confirmadoPor).toBe(USUARIO);
    expect(conf.confirmadoEm).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect([conf.origem, conf.fonteUrl, conf.fonteDominio, conf.valorNum, conf.valorTexto, conf.observadoEm, conf.investigacaoId, conf.confianca])
      .toEqual([hip.origem, hip.fonteUrl, hip.fonteDominio, hip.valorNum, hip.valorTexto, hip.observadoEm, hip.investigacaoId, null]);
    const [linhaDepois] = await dump(imovel);
    const { estado: e1, confirmado_por: p1, confirmado_em: c1, ...restoAntes } = linhaAntes;
    const { estado: e2, confirmado_por: p2, confirmado_em: c2, ...restoDepois } = linhaDepois;
    expect([e1, p1, c1]).toEqual(["hipotese", null, null]);
    expect([e2, p2]).toEqual(["confirmada", USUARIO]);
    expect(c2).not.toBeNull();
    expect(restoDepois).toEqual(restoAntes);
    // A leitura da tela agora diz Confirmado, e o histórico ganha a confirmação.
    const d = detalhe({ id: imovel });
    const leitura = lerMemoria(montarMemoriaIdentidade(d, depoisMemoria.investigacoes, depoisMemoria.atributos), d.identificado);
    expect(leitura.fatos[0].vigente).toMatchObject({ rotuloEstado: "Confirmado", podeConfirmar: false, valor: "82 m²" });
    expect(leitura.historico.map((e) => e.tipo)).toContain("confirmacao");
    // Idempotente: confirmar de novo devolve repetida e não muda a data.
    expect(await confirmarAtributoIdentificado(hip.id, cliente)).toEqual({ repetida: true });
    expect((await dump(imovel))[0].confirmado_em).toEqual(c2);
    // O registro do imóvel não mudou: situação, promoção, nada.
    const registro = (await db.query<Json>("select to_jsonb(i) as l from public.imoveis_identificados i where id = $1", [imovel])).rows[0].l as Json;
    expect(registro.situacao).toBe("identificado");
    expect(registro.promovido_em).toBeNull();
    expect((await db.query("select count(*)::int as n from public.imoveis")).rows[0]).toEqual({ n: 0 });
  });

  it("confirmar o que é de outra conta falha pela RPC (P0002) e nada muda; com exclusão pendente a RPC recusa e a hipótese continua hipótese", async () => {
    const alheio = await identidade(OUTRO_USUARIO);
    await hipotese(alheio, [{ atributo: "quartos", valor_num: 3, fonte_url: "https://x.test/1", fonte_dominio: "x.test" }], OUTRO_USUARIO);
    const [linha] = await dump(alheio);
    await expect(confirmarAtributoIdentificado(linha.id as number, clienteDoNavegador(USUARIO))).rejects.toThrow();
    expect((await dump(alheio))[0].estado).toBe("hipotese");

    const meu = await identidade();
    await hipotese(meu, [{ atributo: "quartos", valor_num: 3, fonte_url: "https://x.test/1", fonte_dominio: "x.test" }]);
    await db.query("update public.imoveis_identificados set exclusao_solicitada_em = now() where id = $1", [meu]);
    const [minha] = await dump(meu);
    await expect(confirmarAtributoIdentificado(minha.id as number, clienteDoNavegador(USUARIO))).rejects.toMatchObject({ codigo: "exclusao_em_andamento" });
    expect((await dump(meu))[0].estado).toBe("hipotese");
  });
});
