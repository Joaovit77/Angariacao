// @vitest-environment jsdom

/* ================================================================
   C10 — PROMOÇÃO É ATO HUMANO, SEM EXCEÇÃO (V7 §13)

   O que se prova aqui, contra um banco falso em memória que imita as duas
   RPCs de promoção e os CHECKs de coerência:

   1. Promoção positiva, de ponta a ponta na tela real: o clique humano em
      "Transformar em oportunidade" marca `promovendo` ANTES de abrir o
      ModalImovel EXISTENTE, pré-preenchido com o que o Pipeline entende;
      o humano salva pelo `salvarImovel` real; só então a RPC de vínculo
      grava `imovel_id`/`promovido_em`/`promovido`. O `Imovel` nasce em
      "Novo contato", com `statusHistory` vazio, `data_angariacao` = hoje,
      origem mapeada e unidade/bloco/edifício preservados; fotos, etiquetas
      e classificações NÃO são copiadas.
   2. Cada caminho de não-promoção de §13.0 — descobrir informação,
      possível proprietário, investigação, classificação, etiqueta, tipo
      inferido, confiança alta, dedupe, "já na carteira", merge, cron,
      trigger, webhook e RPC de outro propósito — comportamental onde há
      código que roda, estrutural onde a garantia é de SQL ou de ausência.
   3. Falha parcial (§13.2): `salvarImovel` funcionou e o vínculo falhou ⇒
      `promovendo` com `imovel_id` nulo, o botão vira "Concluir vínculo da
      oportunidade", a criação não é reentrável, o retry em sessão usa o
      MESMO id, depois do reload o humano escolhe entre elegíveis, o
      vínculo é idempotente com o mesmo id e recusado com outro, e desistir
      volta a `identificado` sem apagar a oportunidade.
   4. Estrutural: nenhum arquivo do módulo escreve em `imoveis`.
   ================================================================ */
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { createElement, type ReactElement } from "react";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Linha = Record<string, unknown>;

/* ---------- banco falso: tabelas em memória + as duas RPCs de §13.2 ---------- */
const banco = vi.hoisted(() => ({
  tabelas: {} as Record<string, Linha[]>,
  log: [] as string[],
  falharVinculo: 0,
  usuario: "usuario-a",
}));

function verificarChecks(linha: Linha): void {
  // Os CHECKs do C2a: nenhum meio-estado sobrevive a uma escrita.
  if (linha.situacao === "promovendo" && (linha.imovel_id !== null || linha.promovido_em !== null)) {
    throw new Error("CHECK promovendo_coerente violado");
  }
  if (linha.situacao === "promovido" && (linha.imovel_id === null || linha.promovido_em === null)) {
    throw new Error("CHECK promovido_coerente violado");
  }
}

function rpcFalsa(nome: string, params: Linha): { data: unknown; error: unknown } {
  banco.log.push(`rpc:${nome}${nome === "definir_situacao_identificado" ? `:${params.p_situacao}` : ""}`);
  const identificados = banco.tabelas.imoveis_identificados ?? [];
  const alvo = identificados.find((l) => l.id === params.p_imovel_identificado_id && l.user_id === banco.usuario);
  if (nome === "definir_situacao_identificado") {
    if (!alvo) return { data: null, error: { code: "P0002", message: "Imóvel identificado não encontrado." } };
    if (alvo.exclusao_solicitada_em) return { data: { ok: false, codigo: "exclusao_em_andamento" }, error: null };
    if (alvo.situacao === "fundido") return { data: { ok: false, codigo: "registro_fundido" }, error: null };
    if (alvo.situacao === "promovido") return { data: { ok: false, codigo: "ja_promovido" }, error: null };
    if (alvo.situacao === params.p_situacao) return { data: { ok: true, repetida: true }, error: null };
    alvo.situacao = params.p_situacao;
    alvo.descartado_em = params.p_situacao === "descartado" ? "2026-09-14T12:00:00.000Z" : null;
    verificarChecks(alvo);
    return { data: { ok: true, repetida: false, situacao: params.p_situacao }, error: null };
  }
  if (nome === "vincular_promocao_imovel_identificado") {
    if (banco.falharVinculo > 0) {
      banco.falharVinculo -= 1;
      return { data: null, error: { code: "PGRST301", message: "Falha simulada de rede depois de salvar." } };
    }
    if (!alvo) return { data: null, error: { code: "P0002", message: "Imóvel identificado não encontrado." } };
    if (alvo.exclusao_solicitada_em) return { data: { ok: false, codigo: "exclusao_em_andamento" }, error: null };
    if (alvo.situacao === "fundido") return { data: { ok: false, codigo: "registro_fundido" }, error: null };
    const imovel = (banco.tabelas.imoveis ?? []).find((l) => l.id === params.p_imovel_id && l.user_id === banco.usuario);
    if (!imovel) return { data: null, error: { code: "P0002", message: "Oportunidade não encontrada." } };
    if (alvo.situacao === "promovido") {
      if (alvo.imovel_id === params.p_imovel_id) {
        return { data: { ok: true, repetida: true, imovel_id: alvo.imovel_id, promovido_em: alvo.promovido_em }, error: null };
      }
      return { data: { ok: false, codigo: "ja_promovido_em_outra" }, error: null };
    }
    if (alvo.situacao === "descartado") return { data: { ok: false, codigo: "registro_descartado" }, error: null };
    const outro = identificados.find((l) => l.imovel_id === params.p_imovel_id && l.id !== alvo.id);
    if (outro) return { data: { ok: false, codigo: "imovel_ja_vinculado", vinculado_a: outro.id }, error: null };
    alvo.situacao = "promovido";
    alvo.imovel_id = params.p_imovel_id;
    alvo.promovido_em = "2026-09-14T15:00:00.000Z";
    verificarChecks(alvo);
    return { data: { ok: true, repetida: false, imovel_id: params.p_imovel_id }, error: null };
  }
  // Qualquer outra RPC do módulo: roda "com sucesso" e NÃO toca situação,
  // imovel_id nem promovido_em. O SQL real é provado estruturalmente abaixo.
  return { data: { ok: true, repetida: false, sobrevivente_id: params.p_sobrevivente_id, absorvido_id: params.p_absorvido_id }, error: null };
}

function consultaFalsa(tabela: string) {
  const filtros: ((linha: Linha) => boolean)[] = [];
  let modo: "select" | "insert" | "update" | "upsert" | "delete" = "select";
  let payload: Linha | null = null;
  const executar = () => {
    const linhas = banco.tabelas[tabela] ?? [];
    if (modo === "select") {
      return { data: linhas.filter((l) => filtros.every((f) => f(l))), error: null };
    }
    banco.log.push(`${tabela}:${modo}`);
    if (tabela === "imoveis" && modo === "upsert" && payload) {
      banco.tabelas.imoveis = [...linhas.filter((l) => l.id !== payload!.id), { ...payload }];
      return { data: null, error: null };
    }
    if (modo === "update" && payload) {
      const alvo = linhas.filter((l) => filtros.every((f) => f(l)));
      for (const linha of alvo) Object.assign(linha, payload);
      return { data: alvo, error: null };
    }
    if (modo === "insert" && payload) {
      const nova = { id: `${tabela}-${linhas.length + 1}`, created_at: "2026-09-14T12:00:00.000Z", ...payload };
      banco.tabelas[tabela] = [...linhas, nova];
      return { data: [nova], error: null };
    }
    return { data: null, error: { message: `operação ${modo} não suportada em ${tabela}` } };
  };
  const construtor: Record<string, unknown> = {};
  const encadear = (fn: (...args: never[]) => void) => (...args: never[]) => { fn(...args); return construtor; };
  Object.assign(construtor, {
    select: encadear(() => {}),
    order: encadear(() => {}),
    range: encadear(() => {}),
    limit: encadear(() => {}),
    eq: encadear((c: string, v: unknown) => filtros.push((l) => l[c] === v)),
    is: encadear((c: string, v: unknown) => filtros.push((l) => l[c] === v)),
    neq: encadear((c: string, v: unknown) => filtros.push((l) => l[c] !== v)),
    gte: encadear((c: string, v: number) => filtros.push((l) => Number(l[c]) >= v)),
    lte: encadear((c: string, v: number) => filtros.push((l) => Number(l[c]) <= v)),
    in: encadear((c: string, vs: unknown[]) => filtros.push((l) => vs.includes(l[c]))),
    not: encadear((c: string, op: string, v: unknown) => { if (op === "is" && v === null) filtros.push((l) => l[c] !== null && l[c] !== undefined); }),
    insert: encadear((p: Linha) => { modo = "insert"; payload = p; }),
    update: encadear((p: Linha) => { modo = "update"; payload = p; }),
    upsert: encadear((p: Linha) => { modo = "upsert"; payload = p; }),
    delete: encadear(() => { modo = "delete"; }),
    single: async () => { const r = executar(); const d = Array.isArray(r.data) ? r.data[0] ?? null : null; return { data: d, error: d ? null : { message: "não encontrado" } }; },
    maybeSingle: async () => { const r = executar(); return { data: Array.isArray(r.data) ? r.data[0] ?? null : null, error: r.error }; },
    then: (res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) => Promise.resolve(executar()).then(res, rej),
  });
  return construtor;
}

const clienteFalso = {
  from: (tabela: string) => consultaFalsa(tabela),
  rpc: async (nome: string, params: Linha) => rpcFalsa(nome, params),
  auth: { getSession: async () => ({ data: { session: { access_token: "token" } } }) },
};

vi.mock("@/lib/persistencia/supabase", () => ({ getSupabase: () => clienteFalso }));
vi.mock("@/components/SessaoProvider", () => ({
  useSessao: () => ({ usuario: { id: "usuario-a" } }),
  captadorPadrao: () => "Corretora",
}));
vi.mock("next/dynamic", () => ({ default: () => () => null }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));

import ModalImovel from "@/components/modais/ModalImovel";
import PainelIdentificado from "@/components/prospeccao/PainelIdentificado";
import { MENSAGEM_VINCULO_PENDENTE, ROTULO_CONCLUIR_VINCULO } from "@/components/prospeccao/ConcluirVinculoOportunidade";
import { EXPLICACAO_TRANSFORMAR, ROTULO_TRANSFORMAR } from "@/components/prospeccao/TransformarEmOportunidade";
import { ORIGENS_IMOVEL } from "@/lib/constantes";
import { todayISO } from "@/lib/datas";
import {
  ORIGEM_IMOVEL_POR_IDENTIFICACAO,
  oportunidadesElegiveisParaVinculo,
  podePromoverIdentificado,
  precisaConcluirVinculo,
  preenchimentoDaPromocao,
} from "@/lib/calculo/promocaoProspeccao";
import { encontrarDuplicatasProspeccao } from "@/lib/calculo/dedupeProspeccao";
import { derivarEtiquetasProspeccao } from "@/lib/calculo/etiquetasProspeccao";
import { duplicatasDoIdentificadoNaCarteira } from "@/lib/calculo/dedupeProspeccao";
import {
  ErroProspeccao,
  aplicarEtiquetaHumana,
  atualizarEnderecoIdentificado,
  acrescentarAvistamento,
  confirmarEtiqueta,
  definirTipoManual,
  esquecerOportunidadeCriada,
  fundirIdentificados,
  lembrarOportunidadeCriada,
  obterIdentificado,
  oportunidadeCriadaNaSessao,
  vincularPromocaoIdentificado,
} from "@/lib/prospeccao";
import { useAppStore } from "@/lib/store";
import { useProspeccao } from "@/lib/useProspeccao";
import { useUiModal } from "@/lib/uiModal";
import type { Imovel } from "@/lib/tipos";

const ID = "10000000-0000-4000-8000-000000000001";
const OUTRO_ID = "10000000-0000-4000-8000-000000000002";
const IMOVEL_A = "20000000-0000-4000-8000-00000000000a";
const IMOVEL_B = "20000000-0000-4000-8000-00000000000b";
const OPORTUNIDADES = {
  antiga: "30000000-0000-4000-8000-000000000001",
  vinculada: "30000000-0000-4000-8000-000000000002",
  "outra-rua": "30000000-0000-4000-8000-000000000003",
  "outra-unidade": "30000000-0000-4000-8000-000000000004",
  recente: "30000000-0000-4000-8000-000000000005",
} as const;
const CHAVE = "rua das palmeiras 120|londrina|101|b";
const RAIZ = resolve(".");
const REPO = resolve("..");
const ler = (caminho: string) => readFileSync(resolve(RAIZ, caminho), "utf8").replace(/\r\n/g, "\n");
const lerRepo = (caminho: string) => readFileSync(resolve(REPO, caminho), "utf8").replace(/\r\n/g, "\n");

function linhaIdentificado(sobrescritas: Linha = {}): Linha {
  return {
    id: ID, user_id: "usuario-a", situacao: "identificado",
    logradouro: "Rua das Palmeiras", numero: "120", unidade: "101", bloco: "B", edificio: "Ed. Solar",
    bairro: "Centro", cidade: "Londrina", estado: "PR", cep: "86010-000", ponto_referencia: null,
    endereco_chave: CHAVE, cidade_chave: "londrina", bairro_chave: "centro",
    latitude: -23.31, longitude: -51.16, acuracia_metros: 8, precisao_localizacao: "gps",
    tipo: "Casa", tipo_origem: "ia-texto", tipo_confianca: 91, tipo_estado: "inferido",
    tipo_definido_em: "2026-09-10T10:00:00.000Z", tipo_classificacao_id: "run-1", tipo_avistamento_id: "av-1",
    tipo_confirmado_por: null, tipo_confirmado_em: null,
    primeiro_avistamento_em: "2026-09-01T10:00:00.000Z", ultimo_avistamento_em: "2026-09-10T10:00:00.000Z",
    avistamentos_total: 2, avistamento_corrente_id: "av-1", origem_identificacao: "placa",
    ultima_investigacao_em: null, imovel_id: null, promovido_em: null,
    descartado_em: null, descartado_motivo: null, fundido_em: null, fundido_em_imovel_id: null,
    exclusao_solicitada_em: null, created_at: "2026-09-01T10:00:00.000Z", updated_at: "2026-09-10T10:00:00.000Z",
    ...sobrescritas,
  };
}

function linhaAvistamento(id: string, observadoEm: string, observacao: string): Linha {
  return {
    id, imovel_identificado_id: ID, user_id: "usuario-a", observado_em: observadoEm, latitude: -23.31, longitude: -51.16,
    acuracia_metros: 8, precisao_localizacao: "gps", observacao, observacao_revisao: 1, revisao_conflito_em: null,
    classificacao_estado: "concluida", classificacao_id: `run-${id}`, classificacao_em: observadoEm, fingerprint: "f",
    created_at: observadoEm,
  };
}

function semearBanco(identificado: Linha = {}): void {
  banco.tabelas = {
    imoveis_identificados: [linhaIdentificado(identificado)],
    imoveis_identificados_avistamentos: [
      linhaAvistamento("av-1", "2026-09-10T10:00:00.000Z", "Placa de aluga-se na janela. Casa fechada."),
      linhaAvistamento("av-0", "2026-09-01T10:00:00.000Z", "Jardim alto, sem placa."),
    ],
    imoveis_identificados_fotos: [{
      id: "foto-1", avistamento_id: "av-1", imovel_identificado_id: ID, user_id: "usuario-a", estado: "ativa",
      caminho: "usuario-a/x/av-1/foto.jpg", caminho_miniatura: "usuario-a/x/av-1/foto_thumb.jpg",
      largura: 1600, altura: 1200, bytes: 400000, capturada_em: null, reservada_em: "2026-09-10T10:00:00.000Z",
      ativada_em: "2026-09-10T10:01:00.000Z", created_at: "2026-09-10T10:00:00.000Z",
    }],
    imoveis_identificados_etiquetas: [{
      id: 1, imovel_identificado_id: ID, avistamento_id: "av-1", classificacao_id: "run-av-1",
      categoria: "sinal-de-prospeccao", codigo: "placa-aluga-se", origem: "ia-texto", confianca: 90, estado: "inferida",
      observado_em: "2026-09-10T10:00:00.000Z", modelo: "modelo-x", versao_catalogo: 1, versao_classificador: 1,
      revisao_observacao: 1, confirmada_por: null, confirmada_em: null, substituida_em: null,
      substituida_por_classificacao_id: null, desatualizada_em: null, created_at: "2026-09-10T10:00:00.000Z",
    }],
    imoveis_identificados_classificacoes: [],
    imoveis: [],
    agenda: [],
  };
  banco.log = [];
  banco.falharVinculo = 0;
}

/** O mesmo par que o ModalOverlay real monta: painel + modal ativo. */
function Harness(): ReactElement | null {
  const detalhe = useProspeccao((estado) => estado.detalhe);
  const modal = useUiModal((estado) => estado.modal);
  if (!detalhe) return null;
  return createElement(
    "div",
    null,
    createElement(PainelIdentificado, { detalhe }),
    modal?.tipo === "imovel"
      ? createElement(ModalImovel, { id: modal.id, promocao: modal.promocaoDoGarimpo })
      : null,
  );
}

async function carregarTela(): Promise<void> {
  await act(async () => {
    await useProspeccao.getState().carregarDetalhe(ID);
  });
  render(createElement(Harness));
}

const identificadoNoBanco = () => banco.tabelas.imoveis_identificados.find((l) => l.id === ID)!;
/** O `<select>` de "Tipo do imóvel" do ModalImovel aberto. */
function seletorTipo(): HTMLSelectElement {
  const rotulo = [...document.querySelectorAll("label")].find((l) => l.textContent === "Tipo do imóvel")!;
  return rotulo.parentElement!.querySelector("select")!;
}

beforeEach(() => {
  vi.restoreAllMocks();
  semearBanco();
  esquecerOportunidadeCriada(ID);
  useProspeccao.getState().resetar();
  useUiModal.getState().fecharModal();
  useAppStore.setState({ imoveis: [], agenda: [] });
});
afterEach(cleanup);

/* ================================================================
   1. PROMOÇÃO POSITIVA
   ================================================================ */
describe("promoção positiva — clique humano, ModalImovel existente, vínculo depois", () => {
  it("mapeia a origem para rótulos que JÁ existem em ORIGENS_IMOVEL, sem inventar", () => {
    expect(ORIGEM_IMOVEL_POR_IDENTIFICACAO).toEqual({
      campo: "Prospecção ativa (porta a porta)",
      placa: "Placa no imóvel",
    });
    for (const rotulo of Object.values(ORIGEM_IMOVEL_POR_IDENTIFICACAO)) {
      expect(ORIGENS_IMOVEL).toContain(rotulo);
    }
    // O CHECK do banco só admite estas duas: não há terceira origem a mapear.
    expect(lerRepo("supabase/migrations/20260910184310_prospeccao_campo.sql")).toMatch(
      /origem_identificacao in \('campo', 'placa'\)/,
    );
  });

  it("pré-preenche só o que o Pipeline entende, com a observação da PASSAGEM CORRENTE", () => {
    const preenchimento = preenchimentoDaPromocao(
      {
        logradouro: " Rua das Palmeiras ", numero: "120", unidade: "101", bloco: "B", edificio: "Ed. Solar",
        bairro: "Centro", cidade: "Londrina", estado: "pr", tipo: "Casa", origemIdentificacao: "campo",
      },
      { observacao: "Placa de aluga-se na janela." },
    );
    expect(preenchimento).toEqual({
      endereco: "Rua das Palmeiras, 120", unidade: "101", bloco: "B", edificio: "Ed. Solar",
      bairro: "Centro", cidade: "Londrina", estado: "PR", tipo: "Casa",
      origemImovel: "Prospecção ativa (porta a porta)", observacoes: "Placa de aluga-se na janela.",
    });
    // Sem passagem corrente, nada é inventado; sem tipo, o modal exige a escolha (não cai em "Apartamento").
    expect(preenchimentoDaPromocao({
      logradouro: null, numero: null, unidade: null, bloco: null, edificio: null, bairro: null, cidade: null,
      estado: null, tipo: null, origemIdentificacao: "placa",
    }, null)).toMatchObject({ endereco: "", tipo: null, observacoes: "", origemImovel: "Placa no imóvel" });
    // Nenhuma chave de foto, etiqueta, classificação, data de observação ou dado pessoal.
    expect(Object.keys(preenchimento).sort()).toEqual(
      ["bairro", "bloco", "cidade", "edificio", "endereco", "estado", "observacoes", "origemImovel", "tipo", "unidade"],
    );
  });

  it("de ponta a ponta: promovendo ANTES do modal; salvarImovel real; vínculo DEPOIS; Imovel no contrato do Pipeline", async () => {
    await carregarTela();
    const aberturas: string[] = [];
    const cancelar = useUiModal.subscribe((estado, anterior) => {
      if (estado.modal && !anterior.modal) aberturas.push(`modal:${estado.modal.tipo}`);
    });

    // Antes do clique: nenhuma escrita, nenhuma RPC — nada promove sozinho.
    expect(banco.log).toEqual([]);
    expect(screen.getByText(EXPLICACAO_TRANSFORMAR)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: ROTULO_TRANSFORMAR }));

    await waitFor(() => expect(screen.getByRole("button", { name: "Cadastrar imóvel" })).toBeTruthy());
    cancelar();
    // Ordem: RPC `promovendo` primeiro, modal depois.
    expect(banco.log[0]).toBe("rpc:definir_situacao_identificado:promovendo");
    expect(aberturas).toEqual(["modal:imovel"]);
    expect(identificadoNoBanco()).toMatchObject({ situacao: "promovendo", imovel_id: null, promovido_em: null });

    // É o ModalImovel existente, em modo de criação, com o prefill do Garimpo.
    const modal = useUiModal.getState().modal!;
    expect(modal.id).toBeUndefined();
    expect(modal.promocaoDoGarimpo?.inicial).toEqual({
      endereco: "Rua das Palmeiras, 120", unidade: "101", bloco: "B", edificio: "Ed. Solar",
      bairro: "Centro", cidade: "Londrina", estado: "PR", tipo: "Casa",
      origemImovel: "Placa no imóvel", observacoes: "Placa de aluga-se na janela. Casa fechada.",
    });
    expect(document.querySelector("[data-origem-garimpo]")).not.toBeNull();
    expect(screen.getByText("Nova angariação")).toBeTruthy();
    // Enquanto o modal está aberto, o painel já não oferece criar de novo.
    expect(screen.queryByRole("button", { name: ROTULO_TRANSFORMAR })).toBeNull();

    // O humano completa o proprietário — o dado pessoal entra AQUI, e só aqui.
    const rotuloNome = [...document.querySelectorAll("label")].find((l) => l.textContent === "Nome do proprietário")!;
    const nome = rotuloNome.parentElement!.querySelector("input")!;
    fireEvent.change(nome, { target: { value: "Maria Silva" } });

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Cadastrar imóvel" }));
    });
    await waitFor(() => expect(identificadoNoBanco().situacao).toBe("promovido"));

    // Exatamente UM Imovel, criado pelo salvarImovel (upsert), no contrato do Pipeline.
    const imoveis = banco.tabelas.imoveis;
    expect(imoveis).toHaveLength(1);
    const criado = imoveis[0];
    expect(criado).toMatchObject({
      user_id: "usuario-a",
      endereco: "Rua das Palmeiras, 120", unidade: "101", bloco: "B", edificio: "Ed. Solar",
      bairro: "Centro", cidade: "Londrina", estado: "PR", tipo: "Casa",
      origem_imovel: "Placa no imóvel",
      status: "Novo contato",
      status_history: [],
      data_angariacao: todayISO(),
      observacoes: "Placa de aluga-se na janela. Casa fechada.",
      proprietario_nome: "Maria Silva",
      pre_cadastro: false,
    });
    // A data em que foi visto pertence ao Garimpo: nunca vira data de angariação.
    expect(criado.data_angariacao).not.toBe("2026-09-01");
    // Nada de foto, etiqueta ou classificação copiada para a linha do Pipeline.
    expect(Object.keys(criado).join(",")).not.toMatch(/foto|etiqueta|classificac|avistamento|caminho/);

    // O vínculo é o único caminho de imovel_id/promovido_em, e aponta para o id criado.
    expect(identificadoNoBanco()).toMatchObject({ situacao: "promovido", imovel_id: criado.id });
    expect(identificadoNoBanco().promovido_em).not.toBeNull();
    expect(banco.log.filter((l) => l.startsWith("rpc:vincular"))).toHaveLength(1);
    // A escrita em imoveis veio do salvarImovel, uma vez, DEPOIS do promovendo e ANTES do vínculo.
    expect(banco.log.indexOf("imoveis:upsert")).toBeGreaterThan(banco.log.indexOf("rpc:definir_situacao_identificado:promovendo"));
    expect(banco.log.indexOf("imoveis:upsert")).toBeLessThan(banco.log.indexOf("rpc:vincular_promocao_imovel_identificado"));
    expect(banco.log.filter((l) => l.startsWith("imoveis:"))).toEqual(["imoveis:upsert"]);

    // Memória do Garimpo intacta: passagens, fotos e etiquetas continuam lá.
    expect(banco.tabelas.imoveis_identificados_avistamentos).toHaveLength(2);
    expect(banco.tabelas.imoveis_identificados_fotos).toHaveLength(1);
    expect(banco.tabelas.imoveis_identificados_etiquetas).toHaveLength(1);
    // A tela diz que já é oportunidade e não oferece criar outra.
    await waitFor(() => expect(document.querySelector("[data-oportunidade='promovida']")).not.toBeNull());
    expect(screen.queryByRole("button", { name: ROTULO_TRANSFORMAR })).toBeNull();
    expect(useUiModal.getState().modal).toBeNull();
    // Id da sessão foi esquecido: não há mais vínculo pendente.
    expect(oportunidadeCriadaNaSessao(ID)).toBeNull();
  });

  it("tipo NULO no Garimpo: o modal não escolhe 'Apartamento' por ninguém; sem tipo não salva; com tipo escolhido, salva o escolhido", async () => {
    semearBanco({
      tipo: null, tipo_origem: null, tipo_confianca: null, tipo_estado: null, tipo_definido_em: null,
      tipo_classificacao_id: null, tipo_avistamento_id: null,
    });
    await carregarTela();
    fireEvent.click(screen.getByRole("button", { name: ROTULO_TRANSFORMAR }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Cadastrar imóvel" })).toBeTruthy());
    expect(useUiModal.getState().modal!.promocaoDoGarimpo?.inicial.tipo).toBeNull();

    // O seletor nasce vazio, com o convite explícito — nunca "Apartamento".
    const seletor = seletorTipo();
    expect(seletor.value).toBe("");
    expect(seletor.selectedOptions[0]?.textContent).toBe("Selecione o tipo");
    expect(seletor.selectedOptions[0]?.textContent).not.toBe("Apartamento");

    // Sem escolha humana, o cadastro não conclui: nada no Pipeline, nada vinculado.
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Cadastrar imóvel" })); });
    expect(banco.tabelas.imoveis).toHaveLength(0);
    expect(banco.log.filter((l) => l.startsWith("imoveis:"))).toEqual([]);
    expect(banco.log.filter((l) => l.startsWith("rpc:vincular"))).toEqual([]);
    expect(identificadoNoBanco()).toMatchObject({ situacao: "promovendo", imovel_id: null });
    expect(useUiModal.getState().modal).not.toBeNull();

    // Escolhido um tipo válido, o caminho normal segue e grava O ESCOLHIDO.
    fireEvent.change(seletor, { target: { value: "Terreno" } });
    await act(async () => { fireEvent.click(screen.getByRole("button", { name: "Cadastrar imóvel" })); });
    await waitFor(() => expect(identificadoNoBanco().situacao).toBe("promovido"));
    expect(banco.tabelas.imoveis).toHaveLength(1);
    expect(banco.tabelas.imoveis[0].tipo).toBe("Terreno");
    expect(banco.tabelas.imoveis[0].tipo).not.toBe("Apartamento");
  });

  it("tipo CONHECIDO no Garimpo ('Casa'): o modal abre com 'Casa', sem convite para escolher", async () => {
    await carregarTela();
    fireEvent.click(screen.getByRole("button", { name: ROTULO_TRANSFORMAR }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Cadastrar imóvel" })).toBeTruthy());
    const seletor = seletorTipo();
    expect(seletor.value).toBe("Casa");
    expect([...seletor.options].map((opcao) => opcao.textContent)).not.toContain("Selecione o tipo");
  });

  it("fechar o modal sem salvar não cria Imovel e devolve o registro a `identificado`", async () => {
    await carregarTela();
    fireEvent.click(screen.getByRole("button", { name: ROTULO_TRANSFORMAR }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Cadastrar imóvel" })).toBeTruthy());
    expect(identificadoNoBanco().situacao).toBe("promovendo");

    await act(async () => { useUiModal.getState().fecharModal(); });
    await waitFor(() => expect(identificadoNoBanco().situacao).toBe("identificado"));
    expect(banco.tabelas.imoveis).toHaveLength(0);
    expect(banco.log.filter((l) => l.startsWith("imoveis:"))).toEqual([]);
    expect(banco.log.filter((l) => l.startsWith("rpc:vincular"))).toEqual([]);
    await waitFor(() => expect(screen.getByRole("button", { name: ROTULO_TRANSFORMAR })).toBeTruthy());
  });

  it("um imóvel segue utilizável e enriquecível indefinidamente com proprietário desconhecido", async () => {
    // Nenhuma coluna de dado pessoal existe para ser exigida — e acrescentar
    // passagem, etiqueta e tipo não muda a situação.
    const detalhe = await obterIdentificado(ID);
    expect(Object.keys(detalhe!.identificado).join(",")).not.toMatch(/propriet|telefone|email|cpf|whatsapp|nome/i);
    await acrescentarAvistamento("usuario-a", ID, { observadoEm: "2026-12-01T10:00:00.000Z", observacao: "Ainda fechada." });
    await aplicarEtiquetaHumana(ID, null, "sinal-de-prospeccao", "imovel-fechado");
    await definirTipoManual(ID, "Sobrado");
    expect(identificadoNoBanco()).toMatchObject({ situacao: "identificado", imovel_id: null, promovido_em: null });
    expect(banco.tabelas.imoveis).toHaveLength(0);
  });

  it("a volta do Pipeline: `imovel_id` é `on delete set null` — excluir o Imovel preserva a memória", () => {
    const migration = lerRepo("supabase/migrations/20260910184310_prospeccao_campo.sql");
    const schema = lerRepo("supabase-schema.sql");
    for (const sql of [migration, schema]) {
      expect(sql).toMatch(/imovel_id uuid references public\.imoveis\(id\) on delete set null/);
    }
    // Nenhuma cascata parte de `imoveis` para o módulo.
    expect(migration).not.toMatch(/references public\.imoveis\(id\) on delete cascade/);
  });
});

/* ================================================================
   2. CADA CAMINHO DE NÃO-PROMOÇÃO (§13.0)
   ================================================================ */
describe("nenhum destes promove ou vincula", () => {
  const semPromocao = () => {
    expect(identificadoNoBanco()).toMatchObject({ situacao: "identificado", imovel_id: null, promovido_em: null });
    expect(banco.tabelas.imoveis).toHaveLength(0);
    expect(banco.log.filter((l) => l.startsWith("rpc:vincular") || l.startsWith("imoveis:"))).toEqual([]);
  };

  it("1. descobrir informação (endereço corrigido, tipo informado, observação nova)", async () => {
    await atualizarEnderecoIdentificado(ID, { logradouro: "Rua das Palmeiras", numero: "122", cidade: "Londrina" });
    await definirTipoManual(ID, "Sobrado");
    await acrescentarAvistamento("usuario-a", ID, { observadoEm: "2026-12-01T10:00:00.000Z", observacao: "Agora com placa e telefone na placa." });
    semPromocao();
  });

  it("2. descobrir possível proprietário: não há onde guardá-lo nem quem promova por isso", () => {
    // A entidade não tem coluna de dado pessoal (prospeccao-rls prova no SQL);
    // a fronteira não tem função que aceite proprietário ou telefone; e o
    // Investigador — quem poderia achar um dono — não alcança promoção.
    const fronteira = ler("lib/prospeccao.ts");
    expect(fronteira.match(/^export (async )?function \w+\([^)]*\b(proprietario|telefone|nome)\w*/gm)).toBeNull();
    for (const arquivo of [
      "components/investigador/InvestigadorImoveisView.tsx",
      "app/api/investigador-imoveis/route.ts",
      "lib/investigadorImoveis.ts",
      "lib/servidor/investigadorImoveis.ts",
      "lib/calculo/investigadorImoveis.ts",
    ]) {
      expect(ler(arquivo)).not.toMatch(/vincular_promocao|vincularPromocao|salvarImovel|definir_situacao|iniciarPromocao|abrirImovelDoGarimpo|promovid/);
    }
  });

  it("3–4. investigação na web, iniciada ou concluída, não escreve Pipeline nem situação", () => {
    const rota = ler("app/api/investigador-imoveis/route.ts");
    // O GET só lê; o POST só pesquisa e devolve. Nada de imoveis/identificados escrito.
    expect(rota).not.toMatch(/\.(insert|update|upsert)\s*\(/);
    expect(rota).not.toMatch(/\.from\([^)]*\)[^;]*\.delete\s*\(/);
    expect(rota).not.toMatch(/\.rpc\s*\(/);
    expect(ler("lib/investigadorImoveis.ts")).not.toMatch(/situacao|\.from\(|\.rpc\(/);
  });

  it("5. classificação por IA: rota, serviço e RPC de conclusão não tocam situação nem Pipeline", () => {
    for (const arquivo of ["app/api/prospeccao/classificar/route.ts", "lib/servidor/classificacaoProspeccao.ts"]) {
      const fonte = ler(arquivo);
      expect(fonte).not.toMatch(/vincular_promocao|definir_situacao|from\(["']imoveis["']\)|salvarImovel|promovid/);
    }
    const sql = lerRepo("supabase/migrations/20260910201530_prospeccao_campo_rpcs_classificacao.sql");
    const concluir = sql.slice(sql.indexOf("function public.concluir_classificacao"), sql.indexOf("function public.falhar_classificacao"));
    expect(concluir).toContain("update public.imoveis_identificados");
    expect(concluir).not.toMatch(/set[^;]*\b(situacao|imovel_id|promovido_em)\s*=/);
    expect(concluir).not.toMatch(/public\.imoveis\b(?!_identificados)/);
  });

  it("6. etiqueta (humana, confirmada ou contestada) não promove", async () => {
    await aplicarEtiquetaHumana(ID, "av-1", "sinal-de-prospeccao", "placa-aluga-se");
    await confirmarEtiqueta(1);
    semPromocao();
    const sql = lerRepo("supabase/migrations/20260910211045_prospeccao_campo_rpcs_navegador.sql");
    for (const nome of ["aplicar_etiqueta_humana", "definir_estado_etiqueta"]) {
      const corpo = sql.slice(sql.indexOf(`function public.${nome}(`));
      const funcao = corpo.slice(0, corpo.indexOf("\n$$;"));
      expect(funcao).not.toMatch(/update public\.imoveis_identificados\b/);
      expect(funcao).not.toMatch(/promovid|imovel_id\s*=/);
    }
  });

  it("7–8. tipo inferido e confiança alta: o snapshot muda `tipo_*`, nunca `situacao`", () => {
    // Com tipo inferido a 91% (fixture) o registro continua `identificado` e
    // promovível só por clique; a decisão de promover ignora a confiança.
    const item = { situacao: "identificado" as const, exclusaoSolicitadaEm: null };
    expect(podePromoverIdentificado(item)).toBe(true);
    expect(precisaConcluirVinculo(item)).toBe(false);
    const etiquetas = derivarEtiquetasProspeccao({
      logradouro: "Rua X", numero: "1", cidade: "Londrina", bairro: "Centro",
      tipo: "Casa", avistamentosTotal: 5, situacao: "identificado", possivelDuplicata: true,
      jaNaCarteira: true, ultimaInvestigacaoEm: null, hoje: "2026-09-14",
    });
    expect(etiquetas.map((e) => e.codigo).join(",")).not.toMatch(/promov|oportunidade/);
    // O trigger de insert de tipo manual e o snapshot só escrevem tipo_*.
    const triggers = lerRepo("supabase/migrations/20260910193412_prospeccao_campo_triggers.sql");
    expect(triggers).not.toMatch(/promovid|\bsituacao\s*:?=/);
  });

  it("9. dedupe avisa e não escreve", async () => {
    const detalhe = (await obterIdentificado(ID))!;
    const alvo = { id: ID, logradouro: "Rua das Palmeiras", numero: "120", cidade: "Londrina", unidade: "101", bloco: "B", latitude: -23.31, longitude: -51.16, acuraciaMetros: 8 };
    const outro = { ...alvo, id: OUTRO_ID };
    const vereditos = encontrarDuplicatasProspeccao(alvo, [outro]);
    expect(vereditos.length).toBeGreaterThan(0);
    expect(JSON.stringify(vereditos)).not.toMatch(/promov|vincul/);
    const duplicatas = await useProspeccao.getState().buscarDuplicatas(alvo);
    expect(duplicatas).not.toBeNull();
    expect(detalhe.identificado.situacao).toBe("identificado");
    semPromocao();
  });

  it("10. 'já está na carteira' é etiqueta derivada, não vínculo", () => {
    const carteira = [{ id: IMOVEL_A, endereco: "Rua das Palmeiras, 120", cidade: "Londrina", unidade: "101", bloco: "B" }] as Imovel[];
    const naCarteira = duplicatasDoIdentificadoNaCarteira(
      { id: ID, logradouro: "Rua das Palmeiras", numero: "120", cidade: "Londrina", unidade: "101", bloco: "B" },
      carteira,
    );
    expect(naCarteira).toHaveLength(1);
    expect(identificadoNoBanco().imovel_id).toBeNull();
    expect(ler("components/prospeccao/CandidatosDuplicidade.tsx")).not.toMatch(/vincularPromocao|iniciarPromocao|abrirImovelDoGarimpo|registrarOportunidadeCriada/);
    expect(ler("lib/calculo/dedupeProspeccao.ts")).not.toMatch(/promov|imovel_id|vincul/);
  });

  it("11. merge não escreve em imoveis, não promove e recusa lados promovidos", async () => {
    banco.tabelas.imoveis_identificados.push(linhaIdentificado({ id: OUTRO_ID }));
    await fundirIdentificados(ID, OUTRO_ID);
    semPromocao();
    const sql = lerRepo("supabase/migrations/20260913162604_prospeccao_merge_contrato_transacional.sql");
    expect(sql).toMatch(/'promovido', 'promovendo'|'promovendo', 'promovido'/);
    expect(sql).not.toMatch(/set situacao = 'promovido'|promovido_em = |public\.imoveis\b(?!_identificados)/);
  });

  it("12. cron: nenhuma rota agendada conhece o módulo", () => {
    const pasta = resolve(RAIZ, "app/api/cron");
    const rotas = readdirSync(pasta, { recursive: true }).map(String).filter((f) => f.endsWith(".ts"));
    expect(rotas.length).toBeGreaterThan(0);
    for (const rota of rotas) {
      expect(ler(`app/api/cron/${rota}`)).not.toMatch(/imoveis_identificados|vincular_promocao|prospeccao/);
    }
    expect(ler("vercel.json")).not.toMatch(/prospeccao|garimpo/);
  });

  it("13. trigger: os quatro do módulo derivam agregados e bloqueiam, nunca escrevem promoção", () => {
    const triggers = lerRepo("supabase/migrations/20260910193412_prospeccao_campo_triggers.sql");
    expect(triggers).toMatch(/create trigger/i);
    expect(triggers).not.toMatch(/imovel_id\s*:?=|promovido_em\s*:?=|situacao\s*:?=\s*'promov/);
    // Nem o legado do Pipeline sabe do Garimpo.
    const schema = lerRepo("supabase-schema.sql");
    const protegerHistory = schema.slice(schema.indexOf("function proteger_status_history_imovel"), schema.indexOf("function proteger_status_history_imovel") + 6000);
    expect(protegerHistory).not.toContain("imoveis_identificados");
  });

  it("14. webhook: WhatsApp e Sophia não alcançam o Garimpo", () => {
    for (const pasta of ["app/api/whatsapp", "app/api/sophia"]) {
      const arquivos = readdirSync(resolve(RAIZ, pasta), { recursive: true }).map(String).filter((f) => f.endsWith(".ts"));
      expect(arquivos.length).toBeGreaterThan(0);
      for (const arquivo of arquivos) {
        expect(ler(`${pasta}/${arquivo}`)).not.toMatch(/imoveis_identificados|vincular_promocao|prospeccao/);
      }
    }
  });

  it("15. RPC de outro propósito: só `vincular_promocao_imovel_identificado` escreve imovel_id/promovido_em/promovido", () => {
    const migrations = readdirSync(resolve(REPO, "supabase/migrations")).filter((f) => /prospeccao/.test(f));
    expect(migrations.length).toBeGreaterThanOrEqual(9);
    const funcoes: [string, string][] = [];
    for (const migration of migrations) {
      const sql = lerRepo(`supabase/migrations/${migration}`);
      for (const trecho of sql.matchAll(/create or replace function (public|private)\.(\w+)\([\s\S]*?\n\$\$;/g)) {
        funcoes.push([trecho[2], trecho[0]]);
      }
    }
    expect(funcoes.length).toBeGreaterThanOrEqual(18);
    const escrevem = funcoes
      .filter(([, corpo]) => /set situacao = 'promovido'|\bpromovido_em = now\(\)|\bimovel_id = p_imovel_id\b/.test(corpo))
      .map(([nome]) => nome);
    expect([...new Set(escrevem)]).toEqual(["vincular_promocao_imovel_identificado"]);
    // E `definir_situacao_identificado` não alcança `promovido`.
    const definir = funcoes.find(([nome]) => nome === "definir_situacao_identificado")![1];
    expect(definir).toMatch(/not in \('identificado', 'investigando', 'promovendo', 'descartado'\)/);
  });
});

/* ================================================================
   3. FALHA PARCIAL E RECUPERAÇÃO (§13.2)
   ================================================================ */
describe("falha parcial — nunca uma segunda oportunidade", () => {
  async function promoverComVinculoFalhando(): Promise<Linha> {
    banco.falharVinculo = 1;
    await carregarTela();
    fireEvent.click(screen.getByRole("button", { name: ROTULO_TRANSFORMAR }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Cadastrar imóvel" })).toBeTruthy());
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Cadastrar imóvel" }));
    });
    await waitFor(() => expect(banco.tabelas.imoveis).toHaveLength(1));
    await waitFor(() => expect(useUiModal.getState().modal).toBeNull());
    return banco.tabelas.imoveis[0];
  }

  it("A–D. salvarImovel ok + vínculo falho ⇒ promovendo/imovel_id nulo; botão vira Concluir; sem reentrada; retry usa o MESMO id", async () => {
    const criado = await promoverComVinculoFalhando();

    // A. estado esperado
    expect(identificadoNoBanco()).toMatchObject({ situacao: "promovendo", imovel_id: null, promovido_em: null });
    expect(banco.tabelas.imoveis).toHaveLength(1);
    // B. o botão vira "Concluir vínculo da oportunidade"; C. criar não é reentrável
    await waitFor(() => expect(screen.getByRole("button", { name: ROTULO_CONCLUIR_VINCULO })).toBeTruthy());
    expect(screen.queryByRole("button", { name: ROTULO_TRANSFORMAR })).toBeNull();
    expect(screen.queryByRole("button", { name: "Cadastrar imóvel" })).toBeNull();
    expect(screen.getByText(MENSAGEM_VINCULO_PENDENTE)).toBeTruthy();
    // lib/prospeccao.ts conserva EXATAMENTE o id devolvido pelo salvarImovel
    expect(oportunidadeCriadaNaSessao(ID)).toBe(criado.id);
    expect(screen.getByRole("button", { name: ROTULO_CONCLUIR_VINCULO }).getAttribute("data-vinculo-sessao")).toBe(criado.id);
    // Em sessão a lista de escolha não aparece: não há o que escolher.
    expect(screen.queryByRole("list", { name: "Oportunidades elegíveis" })).toBeNull();

    // D. retry
    fireEvent.click(screen.getByRole("button", { name: ROTULO_CONCLUIR_VINCULO }));
    await waitFor(() => expect(identificadoNoBanco().situacao).toBe("promovido"));
    expect(identificadoNoBanco().imovel_id).toBe(criado.id);
    expect(banco.tabelas.imoveis).toHaveLength(1);
    expect(banco.log.filter((l) => l.startsWith("imoveis:"))).toEqual(["imoveis:upsert"]);
    expect(banco.log.filter((l) => l.startsWith("rpc:vincular"))).toHaveLength(2);
    expect(oportunidadeCriadaNaSessao(ID)).toBeNull();
    await waitFor(() => expect(document.querySelector("[data-oportunidade='promovida']")).not.toBeNull());
  });

  it("E–F. depois do reload: só oportunidades NÃO vinculadas com a mesma chave, da mais recente; o humano escolhe", async () => {
    // O reload leva embora a memória de sessão; o registro segue `promovendo`.
    semearBanco({ situacao: "promovendo" });
    banco.tabelas.imoveis_identificados.push(linhaIdentificado({ id: OUTRO_ID, situacao: "promovido", imovel_id: OPORTUNIDADES["vinculada"], promovido_em: "2026-09-01T00:00:00.000Z" }));
    esquecerOportunidadeCriada(ID);
    const base = { cidade: "Londrina", unidade: "101", bloco: "B", status: "Novo contato" };
    useAppStore.setState({
      imoveis: [
        { id: OPORTUNIDADES["antiga"], endereco: "Rua das Palmeiras, 120", dataAngariacao: "2026-09-01", ...base },
        { id: OPORTUNIDADES["vinculada"], endereco: "Rua das Palmeiras, 120", dataAngariacao: "2026-09-14", ...base },
        { id: OPORTUNIDADES["outra-rua"], endereco: "Rua Sergipe, 10", dataAngariacao: "2026-09-14", ...base },
        { id: OPORTUNIDADES["outra-unidade"], endereco: "Rua das Palmeiras, 120", dataAngariacao: "2026-09-14", ...base, unidade: "202" },
        { id: OPORTUNIDADES["recente"], codigo: "LD-0009", endereco: "R. das Palmeiras, 120", dataAngariacao: "2026-09-14", ...base },
      ] as Imovel[],
    });
    banco.tabelas.imoveis = [
      { id: OPORTUNIDADES["antiga"], user_id: "usuario-a" }, { id: OPORTUNIDADES["vinculada"], user_id: "usuario-a" },
      { id: OPORTUNIDADES["outra-rua"], user_id: "usuario-a" }, { id: OPORTUNIDADES["outra-unidade"], user_id: "usuario-a" }, { id: OPORTUNIDADES["recente"], user_id: "usuario-a" },
    ];
    await carregarTela();

    const lista = await screen.findByRole("list", { name: "Oportunidades elegíveis" });
    const itens = within(lista).getAllByRole("listitem").map((li) => li.getAttribute("data-candidata"));
    expect(itens).toEqual([OPORTUNIDADES["recente"], OPORTUNIDADES["antiga"]]);
    // Nada escolhido nem vinculado sozinho; sem botão de criar; sem modal.
    expect(banco.log.filter((l) => l.startsWith("rpc:"))).toEqual([]);
    expect(screen.queryByRole("button", { name: ROTULO_TRANSFORMAR })).toBeNull();
    expect(screen.queryByRole("button", { name: "Cadastrar imóvel" })).toBeNull();
    expect(useUiModal.getState().modal).toBeNull();
    expect(screen.getByText(MENSAGEM_VINCULO_PENDENTE)).toBeTruthy();

    // F. o humano escolhe a antiga — e é ela que vincula, não "a mais provável".
    const antiga = within(lista).getAllByRole("listitem")[1];
    fireEvent.click(within(antiga).getByRole("button", { name: ROTULO_CONCLUIR_VINCULO }));
    await waitFor(() => expect(identificadoNoBanco().situacao).toBe("promovido"));
    expect(identificadoNoBanco().imovel_id).toBe(OPORTUNIDADES["antiga"]);
    expect(banco.log.filter((l) => l.startsWith("imoveis:"))).toEqual([]);
  });

  it("E. a filtragem pura: chave de endereço, exclusão de vinculados, ordem por recência e vazio sem chave", () => {
    const base = { cidade: "Londrina", unidade: "101", bloco: "B", status: "Novo contato" };
    const carteira = [
      { id: "a", endereco: "Rua das Palmeiras, 120", dataAngariacao: "2026-09-01", ...base },
      { id: "b", endereco: "Rua das Palmeiras, 120", dataAngariacao: "2026-09-14", ...base },
      { id: "c", endereco: "Rua das Palmeiras, 120", dataAngariacao: "2026-09-14", ...base },
      { id: "d", endereco: "Rua das Palmeiras, 120", dataAngariacao: "2026-09-14", ...base },
    ] as Imovel[];
    expect(oportunidadesElegiveisParaVinculo(carteira, new Set(["c"]), { enderecoChave: CHAVE }).map((i) => i.id)).toEqual(["b", "d", "a"]);
    expect(oportunidadesElegiveisParaVinculo(carteira, new Set(), { enderecoChave: "" })).toEqual([]);
    expect(oportunidadesElegiveisParaVinculo(carteira, new Set(), { enderecoChave: "rua outra|londrina||" })).toEqual([]);
  });

  it("G–H. vínculo idempotente com o mesmo id (`repetida: true`) e RECUSADO com outro", async () => {
    semearBanco({ situacao: "promovido", imovel_id: IMOVEL_A, promovido_em: "2026-09-01T00:00:00.000Z" });
    banco.tabelas.imoveis = [{ id: IMOVEL_A, user_id: "usuario-a" }, { id: IMOVEL_B, user_id: "usuario-a" }];

    await expect(vincularPromocaoIdentificado(ID, IMOVEL_A)).resolves.toEqual({ repetida: true, imovelId: IMOVEL_A });
    await expect(vincularPromocaoIdentificado(ID, IMOVEL_B)).rejects.toMatchObject({ codigo: "ja_promovido_em_outra" });
    expect(identificadoNoBanco()).toMatchObject({ situacao: "promovido", imovel_id: IMOVEL_A });

    // O contrato está no SQL real, não só no banco falso.
    const sql = lerRepo("supabase/migrations/20260910211045_prospeccao_campo_rpcs_navegador.sql");
    const vincular = sql.slice(sql.indexOf("function public.vincular_promocao_imovel_identificado("));
    const corpo = vincular.slice(0, vincular.indexOf("\n$$;"));
    expect(corpo).toMatch(/if v_identidade\.imovel_id = p_imovel_id then[\s\S]*'repetida', true/);
    expect(corpo).toContain("'ja_promovido_em_outra'");
    expect(corpo).toContain("'exclusao_em_andamento'");
    expect(corpo).toContain("'imovel_ja_vinculado'");
    // A fronteira nunca "corrige" a recusa nem tenta outro id.
    expect(ler("lib/prospeccao.ts")).not.toMatch(/ja_promovido_em_outra[\s\S]{0,200}rpc\(/);
  });

  it("H. registro em exclusão e par inválido são recusados antes ou pelo banco, sem escrita", async () => {
    semearBanco({ situacao: "promovendo", exclusao_solicitada_em: "2026-09-13T00:00:00.000Z" });
    banco.tabelas.imoveis = [{ id: IMOVEL_A, user_id: "usuario-a" }];
    await expect(vincularPromocaoIdentificado(ID, IMOVEL_A)).rejects.toMatchObject({ codigo: "exclusao_em_andamento" });
    await expect(vincularPromocaoIdentificado(ID, "nao-e-uuid")).rejects.toBeInstanceOf(ErroProspeccao);
    expect(identificadoNoBanco()).toMatchObject({ situacao: "promovendo", imovel_id: null });
    // Na tela, exclusão pendente bloqueia tudo: nem promover, nem concluir.
    expect(podePromoverIdentificado({ situacao: "identificado", exclusaoSolicitadaEm: "x" })).toBe(false);
    expect(precisaConcluirVinculo({ situacao: "promovendo", exclusaoSolicitadaEm: "x" })).toBe(false);
    for (const situacao of ["fundido", "promovido", "promovendo", "descartado"] as const) {
      expect(podePromoverIdentificado({ situacao, exclusaoSolicitadaEm: null })).toBe(false);
    }
  });

  it("I. desistir volta a `identificado` e a oportunidade criada PERMANECE no Pipeline", async () => {
    const criado = await promoverComVinculoFalhando();
    const confirmar = vi.spyOn(window, "confirm").mockReturnValue(true);
    await waitFor(() => expect(screen.getByRole("button", { name: "Desistir do vínculo" })).toBeTruthy());
    // A consequência está escrita ANTES da ação.
    expect(document.body.textContent).toContain("A oportunidade já criada continua no Pipeline.");

    fireEvent.click(screen.getByRole("button", { name: "Desistir do vínculo" }));
    await waitFor(() => expect(identificadoNoBanco().situacao).toBe("identificado"));
    expect(confirmar).toHaveBeenCalledOnce();
    expect(confirmar.mock.calls[0][0]).toContain("continua no Pipeline");
    expect(identificadoNoBanco()).toMatchObject({ imovel_id: null, promovido_em: null });
    expect(banco.tabelas.imoveis).toEqual([criado]);
    expect(banco.log.filter((l) => l.startsWith("imoveis:"))).toEqual(["imoveis:upsert"]);
    expect(banco.log).toContain("rpc:definir_situacao_identificado:identificado");
    expect(oportunidadeCriadaNaSessao(ID)).toBeNull();
    await waitFor(() => expect(screen.getByRole("button", { name: ROTULO_TRANSFORMAR })).toBeTruthy());
  });

  it("o CHECK impede `promovendo` com imovel_id preenchido e `promovido` sem ele", () => {
    const migration = lerRepo("supabase/migrations/20260910184310_prospeccao_campo.sql");
    expect(migration).toContain("situacao <> 'promovendo' or (imovel_id is null and promovido_em is null)");
    expect(migration).toMatch(/situacao <> 'promovido'\s*or \(imovel_id is not null and promovido_em is not null and fundido_em is null\)/);
    expect(() => verificarChecks({ situacao: "promovendo", imovel_id: IMOVEL_A, promovido_em: null })).toThrow();
    expect(() => verificarChecks({ situacao: "promovido", imovel_id: null, promovido_em: null })).toThrow();
  });

  it("memória de sessão: guarda exatamente o id, some ao vincular e ao desistir", async () => {
    lembrarOportunidadeCriada(ID, IMOVEL_A);
    expect(oportunidadeCriadaNaSessao(ID)).toBe(IMOVEL_A);
    lembrarOportunidadeCriada(ID, IMOVEL_A);
    expect(oportunidadeCriadaNaSessao(OUTRO_ID)).toBeNull();
    esquecerOportunidadeCriada(ID);
    expect(oportunidadeCriadaNaSessao(ID)).toBeNull();
  });
});

/* ================================================================
   4. ESTRUTURAL — o módulo nunca escreve em `imoveis`
   ================================================================ */
describe("estrutural: só ModalImovel + salvarImovel criam o Imovel", () => {
  function arquivosDoModulo(): string[] {
    const lista: string[] = [];
    for (const pasta of ["components/prospeccao", "app/api/prospeccao"]) {
      for (const arquivo of readdirSync(resolve(RAIZ, pasta), { recursive: true }).map(String)) {
        if (/\.tsx?$/.test(arquivo)) lista.push(`${pasta}/${arquivo}`);
      }
    }
    for (const arquivo of readdirSync(resolve(RAIZ, "lib"))) {
      if (/^prospeccao.*\.ts$/.test(arquivo)) lista.push(`lib/${arquivo}`);
    }
    lista.push("lib/useProspeccao.ts", "lib/calculo/promocaoProspeccao.ts");
    return lista;
  }

  it("nenhum arquivo em lib/prospeccao*, components/prospeccao/ ou app/api/prospeccao/ faz from(\"imoveis\").insert/update", () => {
    const arquivos = arquivosDoModulo();
    expect(arquivos.length).toBeGreaterThan(15);
    for (const arquivo of arquivos) {
      const fonte = ler(arquivo);
      expect(fonte, arquivo).not.toMatch(/from\(\s*["'`]imoveis["'`]\s*\)\s*\.\s*(insert|update|upsert|delete)/);
      expect(fonte, arquivo).not.toMatch(/from\(\s*["'`]imoveis["'`]\s*\)/);
      // Os comentários podem NOMEAR o salvarImovel (é o contrato); o código, não.
      const codigo = fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
      expect(codigo, arquivo).not.toMatch(/salvarImovel|toDbImovel/);
    }
  });

  it("o ModalImovel existente é reutilizado: ModalOverlay passa a promoção e o modal devolve o id só depois de salvar", () => {
    const overlay = ler("components/modais/ModalOverlay.tsx");
    const modal = ler("components/modais/ModalImovel.tsx");
    expect(overlay).toContain('<ModalImovel id={modal.id} promocao={modal.promocaoDoGarimpo} />');
    expect(modal).toContain("const { ok } = await salvarImovel(data, usuario.id, !!data.pausadoAte && criarLembretePausa);");
    expect(modal).toMatch(/if \(!ok\) return;[\s\S]{0,400}if \(promocao && !imovel\) promocao\.aoSalvar\(data\.id\);/);
    // O histórico nasce vazio na promoção e "Novo contato" é o ponto de partida implícito.
    expect(modal).toMatch(/promocao\s*\?\s*\[\]/);
    expect(modal).toContain('imovel ? imovel.status : promocao ? "Novo contato" : null');
    // O modal não conhece o store do Garimpo: o vínculo é de quem o abriu.
    expect(modal).not.toMatch(/useProspeccao|vincularPromocao|imoveis_identificados/);
  });

  it("a única ação que promove é o clique; e o texto é humano, sem nome de RPC", () => {
    const transformar = ler("components/prospeccao/TransformarEmOportunidade.tsx");
    const concluir = ler("components/prospeccao/ConcluirVinculoOportunidade.tsx");
    expect(transformar).toContain("onClick={() => void transformar()}");
    expect(transformar).toMatch(/await iniciarPromocao\(item\.id\)[\s\S]*abrirImovelDoGarimpo\(/);
    expect(concluir).not.toMatch(/abrirImovelDoGarimpo|abrirModal|salvarImovel|criarIdentificado/);
    for (const fonte of [transformar, concluir]) {
      expect(fonte).not.toMatch(/"[^"]*(vincular_promocao|definir_situacao|_identificado)[^"]*"/);
    }
    // Sem "promovendo" nem "promovido" na tela: linguagem de campo.
    expect(concluir).toContain("Oportunidade criada, vínculo pendente");
    expect(transformar).toContain("Já é uma oportunidade no Pipeline");
  });
});
