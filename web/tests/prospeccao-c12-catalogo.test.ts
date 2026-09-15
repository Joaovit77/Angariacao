// @vitest-environment jsdom
/* ================================================================
   C12 — CATÁLOGO VISUAL: camada de leitura do Garimpo em Campo
   Um card por identificado com foto ativa; a capa é a foto da passagem
   mais recente, escolhida na leitura (a foto continua da passagem dela);
   uma consulta por página com `!inner`, uma assinatura de miniaturas por
   página; o clique abre o MESMO detalhe do Garimpo. Nada grava, nada
   promove, nada chama IA; fundido/descartado/exclusão ficam de fora pela
   mesma visibilidade da lista; promovido continua no catálogo.
   ================================================================ */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const cenario = vi.hoisted(() => ({
  push: vi.fn(),
  estado: {
    itens: [] as unknown[], detalhe: null as unknown, selecionadoId: null as string | null, ultimoRegistro: null,
    pagina: 1, porPagina: 24, total: 0, temMais: false, carregando: false, salvando: false,
    erro: null as string | null, aviso: null, incluirOcultos: false,
    carregarPagina: vi.fn(), carregarDetalhe: vi.fn(), limparSelecao: vi.fn(), dispensarUltimoRegistro: vi.fn(),
    definirIncluirOcultos: vi.fn(), buscarDuplicatas: vi.fn(async () => []),
  },
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: cenario.push }), usePathname: () => "/garimpo-em-campo/catalogo" }));
vi.mock("@/lib/useProspeccao", () => {
  const useProspeccao = (seletor: (estado: typeof cenario.estado) => unknown) => seletor(cenario.estado);
  useProspeccao.getState = () => cenario.estado;
  return { useProspeccao };
});
vi.mock("@/lib/uiModal", () => ({
  useUiModal: (seletor: (estado: { modal: null; abrirModal: () => void }) => unknown) =>
    seletor({ modal: null, abrirModal: vi.fn() }),
}));
vi.mock("@/components/SessaoProvider", () => ({ useSessao: () => ({ estado: "auth", usuario: { id: "usuario-1" } }) }));

import CardCatalogoVisual, { fonteDaImagemDoCard } from "@/components/prospeccao/CardCatalogoVisual";
import CatalogoVisualView, {
  SITUACOES_FILTRO_CATALOGO,
  VAZIO_CATALOGO,
  VAZIO_FILTRO,
  assinarMiniaturasFachada,
  rotuloTotalCatalogo,
  urlDetalheGarimpo,
} from "@/components/prospeccao/CatalogoVisualView";
import ProspeccaoView from "@/components/prospeccao/ProspeccaoView";
import { escolherCapaCatalogo, termoBuscaCatalogo, type FotoParaCapa } from "@/lib/calculo/catalogoVisual";
import { listarCatalogoVisual, SITUACOES_VISIVEIS_PROSPECCAO, type ItemCatalogoVisual } from "@/lib/prospeccao";

const RAIZ = resolve(".");
const ler = (caminho: string) => readFileSync(resolve(RAIZ, caminho), "utf8").replace(/\r\n/g, "\n");
const CSS = ler("components/prospeccao/Prospeccao.module.css");

const D1 = "2026-09-01T10:00:00.000Z";
const D2 = "2026-09-10T10:00:00.000Z";
const D3 = "2026-09-15T10:00:00.000Z";

function foto(id: string, avistamentoId: string, observadoEm: string | null, extra: Partial<FotoParaCapa> = {}): FotoParaCapa {
  return {
    id, avistamentoId, estado: "ativa", caminho: `u/i/${avistamentoId}/${id}.jpg`,
    caminhoMiniatura: `u/i/${avistamentoId}/${id}_thumb.jpg`, observadoEm, criadoEm: observadoEm ?? D1, ...extra,
  };
}

/** Linha como o PostgREST devolve com o embed `fotos(...avistamento(...))`. */
function linha(id: string, fotos: Array<{ id: string; av: string; em: string; estado?: string }>, extra: Record<string, unknown> = {}) {
  return {
    id, user_id: "usuario-1", situacao: "identificado", logradouro: "Rua Sergipe", numero: "800", unidade: null, bloco: null,
    edificio: null, bairro: "Centro", cidade: "Londrina", estado: "PR", cep: null, ponto_referencia: null,
    endereco_chave: "rua sergipe 800", cidade_chave: "londrina", bairro_chave: "centro",
    latitude: null, longitude: null, acuracia_metros: null, precisao_localizacao: "desconhecida",
    tipo: null, tipo_origem: null, tipo_confianca: null, tipo_estado: null, tipo_definido_em: null,
    tipo_classificacao_id: null, tipo_avistamento_id: null, tipo_confirmado_por: null, tipo_confirmado_em: null,
    primeiro_avistamento_em: D1, ultimo_avistamento_em: D3, avistamentos_total: fotos.length, avistamento_corrente_id: fotos[0]?.av ?? null,
    origem_identificacao: "campo", ultima_investigacao_em: null, imovel_id: null, promovido_em: null,
    descartado_em: null, descartado_motivo: null, fundido_em: null, fundido_em_imovel_id: null,
    exclusao_solicitada_em: null, created_at: D1, updated_at: D3,
    fotos: fotos.map((f) => ({
      id: f.id, avistamento_id: f.av, estado: f.estado ?? "ativa", caminho: `u/${id}/${f.av}/${f.id}.jpg`,
      caminho_miniatura: `u/${id}/${f.av}/${f.id}_thumb.jpg`, created_at: f.em, avistamento: { observado_em: f.em },
    })),
    ...extra,
  };
}

/** Cliente falso: grava cada passo da consulta e devolve as linhas. */
function clienteFalso(linhas: unknown[], count = linhas.length) {
  const chamadas: Array<[string, unknown[]]> = [];
  const construtor: Record<string, unknown> = {};
  for (const metodo of ["select", "eq", "in", "is", "or", "order"]) {
    construtor[metodo] = (...args: unknown[]) => { chamadas.push([metodo, args]); return construtor; };
  }
  construtor.range = (...args: unknown[]) => { chamadas.push(["range", args]); return Promise.resolve({ data: linhas, error: null, count }); };
  const proibidos = ["insert", "update", "delete", "upsert"].map((m) => [m, vi.fn(() => { throw new Error(`${m} não pode ser chamado`); })]);
  const from = vi.fn((tabela: string) => { chamadas.push(["from", [tabela]]); return { ...construtor, ...Object.fromEntries(proibidos) }; });
  const rpc = vi.fn(() => { throw new Error("rpc não pode ser chamada"); });
  return { client: { from, rpc } as never, chamadas, from, rpc };
}

function item(id: string, extra: Partial<ItemCatalogoVisual["identificado"]> = {}, capa: Partial<ItemCatalogoVisual["capa"]> = {}): ItemCatalogoVisual {
  return {
    identificado: {
      id, situacao: "identificado", logradouro: "Rua Sergipe", numero: "800", unidade: null, bloco: null, edificio: null,
      bairro: "Centro", cidade: "Londrina", estado: "PR", cep: null, pontoReferencia: null, enderecoChave: "", cidadeChave: "", bairroChave: "",
      latitude: null, longitude: null, acuraciaMetros: null, precisaoLocalizacao: "desconhecida",
      tipo: null, tipoOrigem: null, tipoConfianca: null, tipoEstado: null, tipoDefinidoEm: null, tipoClassificacaoId: null,
      tipoAvistamentoId: null, tipoConfirmadoPor: null, tipoConfirmadoEm: null, avistamentosTotal: 1, primeiroAvistamentoEm: D1,
      ultimoAvistamentoEm: D3, avistamentoCorrenteId: "av-1", origemIdentificacao: "campo", ultimaInvestigacaoEm: null,
      imovelId: null, promovidoEm: null, descartadoMotivo: null, descartadoEm: null, fundidoEm: null, fundidoEmImovelId: null,
      exclusaoSolicitadaEm: null, criadoEm: D1, atualizadoEm: D3, ...extra,
    } as ItemCatalogoVisual["identificado"],
    capa: { fotoId: `foto-${id}`, avistamentoId: "av-1", caminho: `u/${id}/av-1/f.jpg`, caminhoMiniatura: `u/${id}/av-1/f_thumb.jpg`, observadoEm: D3, ...capa },
    fotosAtivas: 1,
  };
}

beforeEach(() => { vi.clearAllMocks(); });
afterEach(cleanup);

describe("capa: a foto da passagem mais recente, escolhida na leitura", () => {
  it("D/E. várias passagens com foto: a capa é a de maior observado_em, e continua apontando para a passagem dela", () => {
    const capa = escolherCapaCatalogo([
      foto("f-antiga", "av-antiga", D1),
      foto("f-recente", "av-recente", D3),
      foto("f-meio", "av-meio", D2),
    ]);
    expect(capa).toMatchObject({ fotoId: "f-recente", avistamentoId: "av-recente", observadoEm: D3 });
    // Uma passagem retroativa cadastrada depois não vira capa: manda a data do evento.
    const retro = escolherCapaCatalogo([
      foto("f-recente", "av-recente", D2, { criadoEm: D2 }),
      foto("f-retro", "av-retro", D1, { criadoEm: D3 }),
    ]);
    expect(retro?.fotoId).toBe("f-recente");
    // Só foto ativa concorre; reservada (upload não concluído) não é capa.
    expect(escolherCapaCatalogo([foto("f-reservada", "av-1", D3, { estado: "reservada" })])).toBeNull();
    expect(escolherCapaCatalogo([])).toBeNull();
    // Empate de data: desempate determinístico por created_at e id.
    expect(escolherCapaCatalogo([foto("a", "av-a", D3, { criadoEm: D1 }), foto("b", "av-b", D3, { criadoEm: D2 })])?.fotoId).toBe("b");
  });

  it("a busca normaliza como as chaves persistidas: 'R. Sergipe' e 'Rua Sergipe' são o mesmo termo", () => {
    expect(termoBuscaCatalogo("R. Sergipe")).toBe(termoBuscaCatalogo("Rua Sergipe"));
    expect(termoBuscaCatalogo("  ")).toBe("");
    expect(termoBuscaCatalogo(null)).toBe("");
  });
});

describe("listarCatalogoVisual: uma consulta, só leitura, mesma visibilidade e ordem do Garimpo", () => {
  it("A/B/C. um identificado com foto vira UM item; sem foto ativa não entra; várias passagens continuam um item com a capa mais recente", async () => {
    const { client, chamadas, from, rpc } = clienteFalso([
      linha("com-uma", [{ id: "f1", av: "av-1", em: D3 }]),
      linha("com-varias", [{ id: "f-antiga", av: "av-a", em: D1 }, { id: "f-nova", av: "av-b", em: D3 }, { id: "f-meio", av: "av-c", em: D2 }]),
      // O `!inner` já filtra no banco; se algo vier sem foto ativa, a escolha descarta.
      linha("so-reservada", [{ id: "f-r", av: "av-r", em: D3, estado: "reservada" }]),
    ], 3);
    const pagina = await listarCatalogoVisual({ pagina: 1, porPagina: 24 }, client);

    expect(pagina.itens.map((i) => i.identificado.id)).toEqual(["com-uma", "com-varias"]);
    const varias = pagina.itens[1];
    expect(varias.capa).toMatchObject({ fotoId: "f-nova", avistamentoId: "av-b", observadoEm: D3 });
    expect(varias.fotosAtivas).toBe(3);
    expect(varias.identificado.avistamentosTotal).toBe(3);
    // Contagem é de IMÓVEIS (linhas do pai), não de fotos.
    expect(pagina.total).toBe(3);

    // A consulta: uma tabela, embed !inner das fotos com o observado_em da passagem, filtro de foto ativa,
    // visibilidade da lista do Garimpo, ordem temporal do Garimpo, paginação.
    expect(from).toHaveBeenCalledTimes(1);
    expect(from).toHaveBeenCalledWith("imoveis_identificados");
    const select = chamadas.find(([m]) => m === "select")![1][0] as string;
    // As colunas da identidade inteiras (não caractere a caractere), depois o embed.
    expect(select.startsWith("id,situacao,logradouro,")).toBe(true);
    expect(select).toContain(",updated_at,fotos:imoveis_identificados_fotos!inner(");
    expect(select).toContain("avistamento:imoveis_identificados_avistamentos!avistamento_id(observado_em)");
    expect(chamadas).toContainEqual(["eq", ["fotos.estado", "ativa"]]);
    expect(chamadas).toContainEqual(["in", ["situacao", [...SITUACOES_VISIVEIS_PROSPECCAO]]]);
    expect(chamadas).toContainEqual(["is", ["exclusao_solicitada_em", null]]);
    expect(chamadas.filter(([m]) => m === "order").map(([, a]) => a[0])).toEqual(["ultimo_avistamento_em", "created_at", "id"]);
    expect(chamadas).toContainEqual(["range", [0, 23]]);
    // K/L. Nenhuma escrita, nenhuma RPC: visualizar não muda nada no Garimpo nem no Pipeline.
    expect(rpc).not.toHaveBeenCalled();
    expect(chamadas.map(([m]) => m)).not.toContain("insert");
  });

  it("G. filtros reutilizam o modelo: tipo e situação por igualdade; texto normalizado nas três chaves", async () => {
    const { client, chamadas } = clienteFalso([]);
    await listarCatalogoVisual({ filtros: { busca: "R. Sergipe", tipo: "Casa", situacao: "promovido" } }, client);
    expect(chamadas).toContainEqual(["eq", ["tipo", "Casa"]]);
    expect(chamadas).toContainEqual(["eq", ["situacao", "promovido"]]);
    const or = chamadas.find(([m]) => m === "or")![1][0] as string;
    expect(or).toBe("endereco_chave.ilike.%rua sergipe%,bairro_chave.ilike.%rua sergipe%,cidade_chave.ilike.%rua sergipe%");
  });

  it("I. situação fora da visibilidade do Garimpo (fundido, descartado) não vira filtro nem entra; busca vazia não filtra", async () => {
    const { client, chamadas } = clienteFalso([]);
    await listarCatalogoVisual({ filtros: { busca: "   ", situacao: "fundido" as never } }, client);
    expect(chamadas.find(([m, a]) => m === "eq" && a[0] === "situacao")).toBeUndefined();
    expect(chamadas.find(([m]) => m === "or")).toBeUndefined();
    // A lápide e o descartado ficam fora pela MESMA lista da tela operacional.
    expect(SITUACOES_VISIVEIS_PROSPECCAO).not.toContain("fundido");
    expect(SITUACOES_VISIVEIS_PROSPECCAO).not.toContain("descartado");
    expect(SITUACOES_FILTRO_CATALOGO).toEqual(["identificado", "promovendo", "promovido"]);
  });

  it("Q. as miniaturas são assinadas em lote, no bucket privado, e caminho sem URL fica de fora", async () => {
    const createSignedUrls = vi.fn(async () => ({
      data: [
        { path: "u/a/thumb.jpg", signedUrl: "https://assinada/a", error: null },
        { path: "u/b/thumb.jpg", signedUrl: null, error: "Object not found" },
      ],
      error: null,
    }));
    const client = { storage: { from: vi.fn(() => ({ createSignedUrls })) } } as never;
    const urls = await assinarMiniaturasFachada(["u/a/thumb.jpg", "u/b/thumb.jpg", "u/a/thumb.jpg"], { bucket: "fachadas", ttlSegundos: 300 }, client);
    expect(createSignedUrls).toHaveBeenCalledExactlyOnceWith(["u/a/thumb.jpg", "u/b/thumb.jpg"], 300);
    expect([...urls.entries()]).toEqual([["u/a/thumb.jpg", "https://assinada/a"]]);
    expect(await assinarMiniaturasFachada([], { bucket: "fachadas", ttlSegundos: 300 }, client)).toEqual(new Map());
  });

  it("M/J. estrutural: leitura pelo cliente do usuário (RLS), sem service role, sem Storage no lib, sem IA, sem escrita", () => {
    const lib = ler("lib/prospeccao.ts");
    const trecho = lib.slice(lib.indexOf("CATÁLOGO VISUAL (C12)"), lib.indexOf("export async function obterIdentificado("));
    expect(trecho).not.toMatch(/service_role|SERVICE_ROLE|\.storage\b|\.insert\(|\.update\(|\.delete\(|\.rpc\(|\/api\//);
    const view = ler("components/prospeccao/CatalogoVisualView.tsx") + ler("components/prospeccao/CardCatalogoVisual.tsx");
    expect(view).not.toMatch(/servidor\/ia|\/api\/ia|\/api\/prospeccao\/classificar|classificarAvistamento|iniciarPromocao|vincularPromocao|salvarImovel|fetch\(/);
    expect(view).not.toMatch(/createSignedUrl\(|getPublicUrl|public\//);
    expect(view).toContain("createSignedUrls(");
    expect(view).toContain("BUCKET_FACHADAS");
    // Sem migration, sem tabela nova: nada do catálogo aparece no schema.
    const schema = ler("../supabase-schema.sql");
    expect(schema).not.toMatch(/create table if not exists public\.\w*catalogo/i);
    expect(schema).not.toMatch(/catalogo_visual|identificados_catalogo/i);
  });
});

describe("CatalogoVisualView: cards, filtros, abrir o detalhe do Garimpo, estados", () => {
  function montar(itens: ItemCatalogoVisual[], opcoes: { total?: number; temMais?: boolean; urls?: Map<string, string> } = {}) {
    const listar = vi.fn(async (o: { pagina?: number; porPagina?: number; filtros?: { busca?: string; tipo?: string; situacao?: string } }) => ({
      itens, pagina: o.pagina ?? 1, porPagina: o.porPagina ?? 24, total: opcoes.total ?? itens.length, temMais: opcoes.temMais ?? false,
    }));
    const assinar = vi.fn(async (caminhos: readonly string[]) =>
      opcoes.urls ?? new Map(caminhos.map((c) => [c, `https://assinada/${c}`])));
    render(createElement(CatalogoVisualView, { dependencias: { listar: listar as never, assinar } }));
    return { listar, assinar };
  }

  it("A/C/H. um card por imóvel, foto assinada como protagonista, endereço, tipo, situação quando não é a normal, data da foto e passagens", async () => {
    const { assinar } = montar([
      item("um", { tipo: "Casa", tipoEstado: "declarado", tipoOrigem: "manual" }),
      item("promovido", { situacao: "promovido", imovelId: "imovel-1", promovidoEm: D3, avistamentosTotal: 3, logradouro: "Rua Pará", numero: "1200" }, { fotoId: "foto-hist", avistamentoId: "av-antiga", observadoEm: D2 }),
    ], { total: 2 });
    const cards = await screen.findAllByRole("button", { name: /^Abrir / });
    expect(cards).toHaveLength(2);
    expect(screen.getByText(rotuloTotalCatalogo(2))).toBeTruthy();

    const um = cards[0];
    expect(um.getAttribute("data-catalogo-card")).toBe("um");
    // A imagem do card é o ORIGINAL assinado (a miniatura de 320 px é só fallback).
    expect(um.querySelector("img")!.getAttribute("src")).toBe("https://assinada/u/um/av-1/f.jpg");
    expect(um.querySelector("img")!.getAttribute("data-fonte-imagem")).toBe("original");
    expect(um.querySelector("img")!.getAttribute("loading")).toBe("lazy");
    expect(um.textContent).toContain("Rua Sergipe, 800 — Centro · Londrina · PR");
    expect(um.textContent).toContain("Casa");
    expect(um.textContent).not.toMatch(/Promovido|passagens/);

    // H. promovido continua no catálogo (memória de campo), com o selo que o Garimpo já usa.
    const promovido = cards[1];
    expect(promovido.textContent).toContain("Promovido");
    expect(promovido.textContent).toContain("3 passagens");
    // E. capa histórica: o card diz a data DAQUELA foto e aponta para a passagem dela; nada foi movido.
    expect(promovido.getAttribute("data-capa-foto")).toBe("foto-hist");
    expect(promovido.getAttribute("data-capa-avistamento")).toBe("av-antiga");
    expect(within(promovido).getByText(/Foto de 10\/09\/2026/)).toBeTruthy();

    // Q/H. UMA assinatura por página, com original e miniatura de cada capa (sem N+1).
    expect(assinar).toHaveBeenCalledTimes(1);
    expect(assinar).toHaveBeenCalledWith([
      "u/um/av-1/f.jpg", "u/um/av-1/f_thumb.jpg",
      "u/promovido/av-1/f.jpg", "u/promovido/av-1/f_thumb.jpg",
    ]);
  });

  it("F. clicar no card abre o detalhe existente do Garimpo, pelo id certo", async () => {
    montar([item("alvo")]);
    fireEvent.click(await screen.findByRole("button", { name: /^Abrir / }));
    expect(cenario.push).toHaveBeenCalledExactlyOnceWith("/garimpo-em-campo?abrir=alvo");
    expect(urlDetalheGarimpo("x y")).toBe("/garimpo-em-campo?abrir=x%20y");
  });

  it("G. filtros vão para a fronteira: tipo e situação na hora, texto depois da pausa; página volta a 1", async () => {
    const { listar } = montar([item("um")]);
    await screen.findByRole("button", { name: /^Abrir / });
    expect(listar).toHaveBeenLastCalledWith(expect.objectContaining({ pagina: 1, filtros: { busca: "", tipo: "", situacao: "" } }));

    fireEvent.change(screen.getByLabelText("Tipo do imóvel"), { target: { value: "Casa" } });
    await waitFor(() => expect(listar).toHaveBeenLastCalledWith(expect.objectContaining({ filtros: expect.objectContaining({ tipo: "Casa" }) })));
    fireEvent.change(screen.getByLabelText("Situação"), { target: { value: "promovido" } });
    await waitFor(() => expect(listar).toHaveBeenLastCalledWith(expect.objectContaining({ filtros: expect.objectContaining({ situacao: "promovido" }) })));
    fireEvent.change(screen.getByLabelText("Buscar por endereço, bairro ou cidade"), { target: { value: "Sergipe" } });
    await waitFor(() => expect(listar).toHaveBeenLastCalledWith(expect.objectContaining({ pagina: 1, filtros: expect.objectContaining({ busca: "Sergipe" }) })), { timeout: 2000 });
    // As opções de situação são as visíveis do Garimpo, sem a que nunca é escrita.
    const opcoes = [...(screen.getByLabelText("Situação") as HTMLSelectElement).options].map((o) => o.value);
    expect(opcoes).toEqual(["", ...SITUACOES_FILTRO_CATALOGO]);
  });

  it("P. estado vazio: sem imóvel fotografado convida a ir ao Garimpo; com filtro diz que nada corresponde", async () => {
    montar([]);
    expect((await screen.findByText(VAZIO_CATALOGO))).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Ir para o Garimpo" }));
    expect(cenario.push).toHaveBeenCalledWith("/garimpo-em-campo");
    cleanup();
    vi.clearAllMocks();

    montar([]);
    await screen.findByText(VAZIO_CATALOGO);
    fireEvent.change(screen.getByLabelText("Tipo do imóvel"), { target: { value: "Casa" } });
    expect(await screen.findByText(VAZIO_FILTRO)).toBeTruthy();
  });

  it("Q. sem URL assinada de original nem de miniatura, 'Imagem indisponível' em vez de uma URL pública", async () => {
    montar([item("sem-url")], { urls: new Map() });
    const card = await screen.findByRole("button", { name: /^Abrir / });
    expect(card.querySelector("img")).toBeNull();
    expect(card.textContent).toContain("Imagem indisponível");
  });

  it("qualidade: sem original assinado o card cai na miniatura; com os dois, o original vence", async () => {
    montar([item("so-mini")], { urls: new Map([["u/so-mini/av-1/f_thumb.jpg", "https://assinada/mini"]]) });
    const card = await screen.findByRole("button", { name: /^Abrir / });
    expect(card.querySelector("img")!.getAttribute("src")).toBe("https://assinada/mini");
    expect(card.querySelector("img")!.getAttribute("data-fonte-imagem")).toBe("miniatura");
  });

  it("paginação: usa temMais/pagina do resultado; sem segunda página não há controles", async () => {
    const { listar } = montar([item("um")], { total: 30, temMais: true });
    await screen.findByRole("button", { name: /^Abrir / });
    fireEvent.click(screen.getByRole("button", { name: "Próxima" }));
    await waitFor(() => expect(listar).toHaveBeenLastCalledWith(expect.objectContaining({ pagina: 2 })));
    cleanup();
    montar([item("um")]);
    await screen.findByRole("button", { name: /^Abrir / });
    expect(screen.queryByRole("button", { name: "Próxima" })).toBeNull();
  });

  it("navegação interna do módulo: o alternador Garimpo / Catálogo aparece nas duas telas, sem entrada nova no menu", async () => {
    montar([]);
    const nav = await screen.findByRole("navigation", { name: "Visão do Garimpo em Campo" });
    expect(within(nav).getByRole("link", { name: "Garimpo" }).getAttribute("href")).toBe("/garimpo-em-campo");
    expect(within(nav).getByRole("link", { name: "Catálogo" }).getAttribute("aria-current")).toBe("page");
    expect(ler("components/painel/BarraLateral.tsx")).not.toMatch(/catalogo/i);
    expect(ler("components/painel/Topbar.tsx")).toContain('"/garimpo-em-campo/catalogo": "Garimpo em Campo"');
    expect(ler("app/(painel)/garimpo-em-campo/catalogo/page.tsx")).toContain("CatalogoVisualView");
  });

  it("N/O. grade: auto-fill de 230 px no desktop e duas colunas no celular; foto em 4:3 cobrindo o card", () => {
    expect(CSS).toMatch(/\.catalogoGrade \{[^}]*grid-template-columns: repeat\(auto-fill, minmax\(230px, 1fr\)\)/);
    const celular = CSS.slice(CSS.lastIndexOf("@media (max-width: 720px)"));
    expect(celular).toMatch(/\.catalogoGrade \{ grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/);
    expect(CSS).toMatch(/\.cardCatalogoFoto \{[^}]*aspect-ratio: 4 \/ 3/);
    expect(CSS).toMatch(/\.cardCatalogoFoto img \{[^}]*object-fit: cover/);
  });
});

describe("CardCatalogoVisual: original nítido, miniatura como fallback, nunca outra capa", () => {
  const capa = { fotoId: "foto-x", avistamentoId: "av-x", caminho: "u/x/av-x/f.jpg", caminhoMiniatura: "u/x/av-x/f_thumb.jpg", observadoEm: D3 };
  const montarCard = (urlOriginal: string | null, urlMiniatura: string | null) => {
    const aoAbrir = vi.fn();
    render(createElement(CardCatalogoVisual, { item: item("x", {}, capa), urlOriginal, urlMiniatura, aoAbrir }));
    return { aoAbrir, card: screen.getByRole("button", { name: /^Abrir / }) };
  };

  it("A/B/C/D. a ordem das fontes é original → miniatura → indisponível, sem inventar URL", () => {
    expect(fonteDaImagemDoCard("https://o", "https://m", false)).toEqual({ src: "https://o", fonte: "original" });
    expect(fonteDaImagemDoCard("https://o", "https://m", true)).toEqual({ src: "https://m", fonte: "miniatura" });
    expect(fonteDaImagemDoCard(null, "https://m", false)).toEqual({ src: "https://m", fonte: "miniatura" });
    expect(fonteDaImagemDoCard(null, null, false)).toBeNull();
    expect(fonteDaImagemDoCard("https://o", null, true)).toBeNull();
  });

  it("A/I/J/K/L. mostra o original com lazy loading; a capa continua a mesma foto/passagem; o clique abre o mesmo detalhe", () => {
    const { card, aoAbrir } = montarCard("https://assinada/original", "https://assinada/mini");
    const img = card.querySelector("img")!;
    expect(img.getAttribute("src")).toBe("https://assinada/original");
    expect(img.getAttribute("loading")).toBe("lazy");
    expect(card.getAttribute("data-capa-foto")).toBe("foto-x");
    expect(card.getAttribute("data-capa-avistamento")).toBe("av-x");
    fireEvent.click(card);
    expect(aoAbrir).toHaveBeenCalledExactlyOnceWith("x");
  });

  it("B/D. se o original falhar ao carregar, o card cai na miniatura; se ela também falhar, 'Imagem indisponível' — o imóvel nunca some", () => {
    const { card } = montarCard("https://assinada/original", "https://assinada/mini");
    fireEvent.error(card.querySelector("img")!);
    const mini = card.querySelector("img")!;
    expect(mini.getAttribute("src")).toBe("https://assinada/mini");
    expect(mini.getAttribute("data-fonte-imagem")).toBe("miniatura");
    // Capa inalterada: a mesma foto e a mesma passagem, só a fonte mudou.
    expect(card.getAttribute("data-capa-foto")).toBe("foto-x");
    expect(card.getAttribute("data-capa-avistamento")).toBe("av-x");
    fireEvent.error(mini);
    expect(card.querySelector("img")).toBeNull();
    expect(card.textContent).toContain("Imagem indisponível");
    expect(card.textContent).toContain("Rua Sergipe, 800");
  });

  it("E/F/G/M. estrutural: fontes só por URL assinada em lote, bucket privado, nada persistido, nenhuma escrita", () => {
    const view = ler("components/prospeccao/CatalogoVisualView.tsx");
    const card = ler("components/prospeccao/CardCatalogoVisual.tsx");
    expect(view).toContain("createSignedUrls(");
    expect(view).toMatch(/flatMap\(\(item\) => \[item\.capa\.caminho, item\.capa\.caminhoMiniatura\]\)/);
    expect(view + card).not.toMatch(/getPublicUrl|\/storage\/v1\/object\/public|\.insert\(|\.update\(|\.upsert\(|\.rpc\(|localStorage|sessionStorage/);
    expect(card).not.toMatch(/filter:|image-rendering/);
    expect(CSS.slice(CSS.indexOf(".cardCatalogoFoto img"))).toMatch(/^\.cardCatalogoFoto img \{[^}]*object-fit: cover/);
    expect(CSS).not.toMatch(/\.cardCatalogoFoto[^{]*\{[^}]*(filter|image-rendering|transform)/);
  });
});

describe("ProspeccaoView: `?abrir=<id>` abre o detalhe existente do Garimpo", () => {
  it("F. lê o id da URL ao montar e carrega o mesmo detalhe (com classificações), sem criar outra tela", async () => {
    window.history.replaceState({}, "", "/garimpo-em-campo?abrir=identificado-9");
    cenario.estado.carregarPagina.mockResolvedValue(true);
    cenario.estado.carregarDetalhe.mockResolvedValue(true);
    render(createElement(ProspeccaoView));
    await waitFor(() => expect(cenario.estado.carregarDetalhe).toHaveBeenCalledWith("identificado-9", true));
    // O alternador também está aqui, com o Garimpo ativo.
    const nav = screen.getByRole("navigation", { name: "Visão do Garimpo em Campo" });
    expect(within(nav).getByRole("link", { name: "Garimpo" }).getAttribute("aria-current")).toBe("page");
    window.history.replaceState({}, "", "/");
  });

  it("sem `abrir`, nada é carregado além da página", () => {
    window.history.replaceState({}, "", "/garimpo-em-campo");
    cenario.estado.carregarPagina.mockResolvedValue(true);
    render(createElement(ProspeccaoView));
    expect(cenario.estado.carregarDetalhe).not.toHaveBeenCalled();
  });
});
