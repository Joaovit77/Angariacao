/* Imóvel de venda, IV-4B1: a verificação de disponibilidade de LOCAÇÃO não
   sai para imóvel com finalidade `venda`.

   O guard mora na decisão do worker (`decidirMensagemDisponibilidade`), que
   roda sobre o imóvel relido do banco no instante do envio. Por isso cobre a
   mensagem agendada antes de o imóvel virar venda e a candidata de venda de
   uma consolidação por proprietário. O cancelamento é o de sempre (RPC
   `encerrar_disponibilidade_imovel`, motivo `imovel-indisponivel`); o evento
   do worker leva a causa `finalidade-venda`.

   Três camadas: o predicado e a decisão pura; o servidor da revalidação e da
   consolidação, com Supabase simulado; e a rota do cron inteira, com a
   decisão REAL e o envio do WhatsApp simulado (é ele que prova "zero envio").

   locacao, locacao_venda, null e campo ausente seguem exatamente como antes;
   as causas antigas (retirado, Locado, status fora da fase) vêm antes da
   finalidade e mantêm motivo, evidência e detalhe. */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  registrarEvento: vi.fn(),
  enviar: vi.fn(),
  garantir: vi.fn(),
  historico: vi.fn(),
  /** Banco simulado da rota do cron (ver `bancoDoCron`). */
  banco: null as null | { from: (tabela: string) => unknown; rpc: (nome: string, args?: Record<string, unknown>) => Promise<unknown> },
}));

vi.mock("server-only", () => ({}));
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({
    from: (tabela: string) => mocks.banco!.from(tabela),
    rpc: (nome: string, args?: Record<string, unknown>) => mocks.banco!.rpc(nome, args),
  }),
}));
vi.mock("@/lib/servidor/registro", () => ({ registrarEvento: mocks.registrarEvento }));
vi.mock("@/lib/servidor/envioMensagemAgendada", () => ({ enviarMensagemAgendada: mocks.enviar }));
vi.mock("@/lib/servidor/instanciaWhatsapp", () => ({ garantirRegistroInstanciaWhatsapp: mocks.garantir }));
vi.mock("@/lib/servidor/historicoWhatsapp", async (original) => ({
  ...(await original<typeof import("@/lib/servidor/historicoWhatsapp")>()),
  registrarMensagemEnviadaDeOrigem: mocks.historico,
}));

import type { SupabaseClient } from "@supabase/supabase-js";
import { GET } from "@/app/api/cron/mensagens/route";
import { decidirMensagemDisponibilidade } from "@/lib/calculo/decisaoMensagemDisponibilidade";
import {
  avaliarEvidenciaTemporalDisponibilidade,
  MOTIVO_AGENDA_VISITA_CONFIRMADA,
  type AgendaItemComCriacao,
} from "@/lib/calculo/evidenciaDisponibilidade";
import {
  CAUSA_FINALIDADE_VENDA_DISPONIBILIDADE,
  participaVerificacaoDisponibilidadeLocacao,
  podeParticiparFluxoLocacao,
} from "@/lib/calculo/finalidadeOperacional";
import { textoBaseDisponibilidade, textoFollowUp } from "@/lib/calculo/followup";
import { telefoneCanonico } from "@/lib/calculo/webhookWhatsapp";
import type { FinalidadeImovel } from "@/lib/constantes";
import type { DbMensagemAgendada, MensagemAgendada } from "@/lib/mensagensAgendadas";
import { fromDbImovel } from "@/lib/persistencia/mapeadores";
import { prepararConsolidacaoContato, revalidarVerificacaoDisponibilidade } from "@/lib/servidor/disponibilidadeMensagem";
import type { Imovel } from "@/lib/tipos";

/* ------------------------------------------------------------------
   Fixtures
   ------------------------------------------------------------------ */

const USER = "u1";
const OUTRA_CONTA = "u2";
const TELEFONE = "43999992525";
const FINALIDADES_QUE_PASSAM: Array<FinalidadeImovel | null | undefined> = ["locacao", "locacao_venda", null, undefined];

/** Linha de `imoveis` como o banco devolve. `finalidade` só entra quando
    passada: a chave ausente é o legado "campo não veio". */
function imovelRow(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    id: "i1", user_id: USER, codigo: "LD-200", endereco: "Rua A, 10", bairro: "Centro", cidade: "Londrina", estado: "PR",
    unidade: null, bloco: null, edificio: null, tipo: "Casa", quartos: 2, banheiros: 1, vagas: 1,
    valor_aluguel: 1500, valor_condominio: 0, proprietario_nome: "Maria", proprietario_telefone: TELEFONE,
    proprietario_telefone_canonico: telefoneCanonico(TELEFONE),
    forma_abordagem: null, origem_imovel: null, anuncio_idade_dias: null, imobiliaria_concorrente: null,
    latitude: null, longitude: null, data_angariacao: "2026-07-01", responsavel: null, status: "Publicado",
    observacoes: null, status_history: [{ status: "Angariado", date: "2026-07-02" }, { status: "Publicado", date: "2026-07-05" }],
    notas: [], tentativas: [],
    pausado_ate: null, motivo_perda: null, motivo_perda_outro: null, comissao_recebida: null, comissao_recebida_valor: null,
    comissao_recebida_data: null, comissao_forma_pagamento: null, comissao_observacao: null, autorizacao_assinada_em: null,
    autorizacao_responsavel: null, locado_em: null, contrato_numero: null, pre_cadastro: null, importado: null,
    retirado: false, valor_aluguel_atraso: null, texto_anuncio: null, imovel_principal_id: null, referencia_crm: null, cep: null,
    ...extra,
  };
}

/** Com `finalidade` undefined a chave fica ausente da linha (legado). */
function comFinalidade(finalidade: FinalidadeImovel | null | undefined, extra: Record<string, unknown> = {}) {
  return imovelRow(finalidade === undefined ? extra : { ...extra, finalidade });
}

function imovel(finalidade: FinalidadeImovel | null | undefined, extra: Record<string, unknown> = {}): Imovel {
  return fromDbImovel(comFinalidade(finalidade, extra) as never);
}

function mensagem(extra: Partial<MensagemAgendada> = {}): MensagemAgendada {
  return {
    id: "m-1", userId: USER, imovelId: "i1", tipo: "verificacao-disponibilidade", agendaId: null,
    nomeProprietario: "Maria", telefone: TELEFONE, mensagem: "texto",
    dataEnvio: "2026-09-22T11:00:00.000Z", status: "agendada", enviadoEm: null, erro: null,
    cancelamentoMotivo: null, cancelamentoOrigem: null, canceladaEm: null, imoveisConsultados: null,
    consolidadaEmMensagemId: null, reservadaParaMensagemId: null, reagendadaEm: null, reagendamentoMotivo: null,
    dataEnvioOriginal: null, ...extra,
  };
}

/** Visita confirmada em 01/09: evidência positiva vigente, que hoje faz a
    mensagem de 22/09 ser REAGENDADA para 31/10. */
const VISITA_CONFIRMADA: AgendaItemComCriacao = {
  id: "ag-1", title: "Visita — LD-200", type: "Visita", date: "2026-09-05", hora: "10:00", imovelId: "i1",
  done: false, isVerificacaoDisponibilidade: false, origem: "evento_whatsapp",
  motivoCodigo: MOTIVO_AGENDA_VISITA_CONFIRMADA, criadoEm: "2026-09-01T13:15:00+00:00",
};
const AGENDA_VISITA_ROW = {
  id: "ag-1", user_id: USER, title: "Visita — LD-200", type: "Visita", date: "2026-09-05", hora: "10:00", imovel_id: "i1",
  notes: null, done: false, is_verificacao_disponibilidade: false, origin: "evento_whatsapp",
  reason_code: MOTIVO_AGENDA_VISITA_CONFIRMADA, created_at: "2026-09-01T13:15:00+00:00",
};

function decidir(im: Imovel, agenda: AgendaItemComCriacao[] = [], msg = mensagem()) {
  return decidirMensagemDisponibilidade({ mensagem: msg, imovel: im, avaliacao: avaliarEvidenciaTemporalDisponibilidade(im, agenda) });
}

/* ------------------------------------------------------------------
   1. Predicado
   ------------------------------------------------------------------ */

describe("participaVerificacaoDisponibilidadeLocacao: matriz do IV-4B1", () => {
  it("só venda fica de fora; locacao, locacao_venda, null e ausente passam", () => {
    expect(participaVerificacaoDisponibilidadeLocacao("venda")).toBe(false);
    expect(participaVerificacaoDisponibilidadeLocacao("locacao")).toBe(true);
    expect(participaVerificacaoDisponibilidadeLocacao("locacao_venda")).toBe(true);
    expect(participaVerificacaoDisponibilidadeLocacao(null)).toBe(true);
    expect(participaVerificacaoDisponibilidadeLocacao(undefined)).toBe(true);
  });

  it("é um contrato próprio: o predicado do IV-4A segue com a sua matriz, sem alias", () => {
    expect(participaVerificacaoDisponibilidadeLocacao).not.toBe(podeParticiparFluxoLocacao);
    expect(podeParticiparFluxoLocacao("venda")).toBe(false);
    for (const f of FINALIDADES_QUE_PASSAM) expect(podeParticiparFluxoLocacao(f)).toBe(true);
  });

  it("a causa do evento é o código fixo `finalidade-venda`", () => {
    expect(CAUSA_FINALIDADE_VENDA_DISPONIBILIDADE).toBe("finalidade-venda");
  });
});

/* ------------------------------------------------------------------
   2. Decisão pura
   ------------------------------------------------------------------ */

describe("decidirMensagemDisponibilidade com finalidade", () => {
  it("venda elegível pelo status: cancela com o motivo existente e a causa finalidade-venda, sem evidência", () => {
    expect(decidir(imovel("venda"))).toEqual({
      acao: "cancelar",
      motivo: "imovel-indisponivel",
      evidencia: null,
      fato: "Imóvel com finalidade Venda: a verificação de disponibilidade é de locação.",
      causa: "finalidade-venda",
    });
  });

  it("venda com disponibilidade confirmada recente: cancela, nunca reagenda", () => {
    expect(decidir(imovel("venda"), [VISITA_CONFIRMADA])).toMatchObject({ acao: "cancelar", causa: "finalidade-venda" });
  });

  it.each(FINALIDADES_QUE_PASSAM)("%s: sem evidência envia, igual ao imóvel sem o campo", (finalidade) => {
    const decisao = decidir(imovel(finalidade));
    expect(decisao).toEqual(decidir(imovel(undefined)));
    expect(decisao).toEqual({ acao: "enviar", estado: "sem-evidencia", motivo: "sem-evidencia" });
  });

  it.each(FINALIDADES_QUE_PASSAM)("%s: com visita confirmada reagenda para E + 60, como antes", (finalidade) => {
    expect(decidir(imovel(finalidade), [VISITA_CONFIRMADA])).toMatchObject({
      acao: "reagendar", motivo: "disponibilidade-confirmada", novoDiaEnvio: "2026-10-31",
    });
  });

  it("precedência: retirado vence a finalidade (fato e evidência de retirado, sem causa)", () => {
    const decisao = decidir(imovel("venda", { retirado: true }));
    expect(decisao).toMatchObject({ acao: "cancelar", motivo: "imovel-indisponivel", evidencia: { codigo: "retirado" } });
    expect(decisao).not.toHaveProperty("causa");
    expect(decisao).toEqual(decidir(imovel(null, { retirado: true })));
  });

  it("precedência: Locado vence a finalidade (evidência status-locado, sem causa)", () => {
    const decisao = decidir(imovel("venda", { status: "Locado", locado_em: "2026-09-01" }));
    expect(decisao).toMatchObject({ acao: "cancelar", evidencia: { codigo: "status-locado" } });
    expect(decisao).not.toHaveProperty("causa");
  });

  it("precedência: status já fora da fase vence a finalidade (mesmo fato de antes, sem causa)", () => {
    const decisao = decidir(imovel("venda", { status: "Novo contato", status_history: [] }));
    expect(decisao).toEqual(decidir(imovel(undefined, { status: "Novo contato", status_history: [] })));
    expect(decisao).not.toHaveProperty("causa");
  });

  it("locacao_venda Locado não envia, pela regra de status de sempre", () => {
    const decisao = decidir(imovel("locacao_venda", { status: "Locado", locado_em: "2026-09-01" }));
    expect(decisao).toEqual(decidir(imovel(undefined, { status: "Locado", locado_em: "2026-09-01" })));
    expect(decisao).toMatchObject({ acao: "cancelar", motivo: "imovel-indisponivel", evidencia: { codigo: "status-locado" } });
  });

  it("sem avaliação do M2 (quem chama sem ela): venda não sai; o legado segue enviando", () => {
    const sem = (im: Imovel) => decidirMensagemDisponibilidade({ mensagem: mensagem(), imovel: im, avaliacao: null });
    expect(sem(imovel("venda"))).toMatchObject({ acao: "cancelar", motivo: "imovel-indisponivel", causa: "finalidade-venda" });
    for (const f of FINALIDADES_QUE_PASSAM) expect(sem(imovel(f))).toMatchObject({ acao: "enviar" });
  });

  it("mensagem livre não passa por esta decisão, qualquer que seja a finalidade", () => {
    expect(decidir(imovel("venda"), [], mensagem({ tipo: "livre" }))).toMatchObject({ acao: "enviar" });
  });
});

/* ------------------------------------------------------------------
   3. Servidor: revalidação e consolidação (Supabase simulado)
   ------------------------------------------------------------------ */

type Filtro = { op: string; coluna: string; valor: unknown };

function casa(linha: Record<string, unknown>, filtros: Filtro[]): boolean {
  return filtros.every(({ op, coluna, valor }) => {
    const atual = linha[coluna];
    if (op === "eq") return atual === valor;
    if (op === "neq") return atual !== valor;
    if (op === "in") return (valor as unknown[]).includes(atual);
    const a = Date.parse(String(atual));
    const b = Date.parse(String(valor));
    if (op === "gte") return a >= b;
    if (op === "lt") return a < b;
    return false;
  });
}

interface Rpc { nome: string; args: Record<string, unknown> }

/**
 * Banco em memória com o mínimo de PostgREST que a revalidação, a
 * consolidação e o worker usam: filtros `eq/neq/in/gte/lt`, `maybeSingle`,
 * update condicional (só "pega" nas linhas que casam, como no Postgres) e
 * RPCs registradas. `encerrar_disponibilidade_imovel` cancela as
 * verificações `agendada` do imóvel e a linha `processando` informada, como
 * a função do M4.
 */
function criarBanco(tabelas: Record<string, Record<string, unknown>[]>, lote: Record<string, unknown>[] = []) {
  const rpcs: Rpc[] = [];
  const from = (tabela: string) => {
    const filtros: Filtro[] = [];
    let valores: Record<string, unknown> | null = null;
    let devolverLinhas = false;
    const executar = () => {
      const linhas = (tabelas[tabela] ??= []);
      const alvo = linhas.filter((l) => casa(l, filtros));
      if (valores) {
        for (const l of alvo) Object.assign(l, valores);
        return { data: devolverLinhas ? alvo.map((l) => ({ id: l.id })) : null, error: null };
      }
      return { data: alvo.map((l) => ({ ...l })), error: null };
    };
    const cadeia: Record<string, unknown> = {};
    const filtro = (op: string) => (coluna: string, valor: unknown) => { filtros.push({ op, coluna, valor }); return cadeia; };
    Object.assign(cadeia, {
      select: () => { if (valores) devolverLinhas = true; return cadeia; },
      eq: filtro("eq"), neq: filtro("neq"), in: filtro("in"), gte: filtro("gte"), lt: filtro("lt"),
      update: (v: Record<string, unknown>) => { valores = v; return cadeia; },
      maybeSingle: async () => {
        const { data } = executar();
        return { data: Array.isArray(data) ? (data[0] ?? null) : data, error: null };
      },
      then: (resolve: (r: unknown) => void, reject?: (e: unknown) => void) => Promise.resolve(executar()).then(resolve, reject),
    });
    return cadeia;
  };
  const rpc = async (nome: string, args: Record<string, unknown> = {}) => {
    rpcs.push({ nome, args });
    if (nome === "claim_mensagens_agendadas") return { data: lote, error: null, status: 200 };
    if (nome === "encerrar_disponibilidade_imovel") {
      for (const m of tabelas.mensagens_agendadas ?? []) {
        const daLinha = m.imovel_id === args.p_imovel_id && m.tipo === "verificacao-disponibilidade";
        if (daLinha && (m.status === "agendada" || (m.id === args.p_mensagem_processando && m.status === "processando"))) {
          Object.assign(m, { status: "cancelada", cancelamento_motivo: args.p_motivo, cancelamento_origem: "worker" });
        }
      }
      return { data: { ok: true, acao: "encerrar" }, error: null };
    }
    if (nome === "registrar_confirmacao_disponibilidade") return { data: { ok: true, acao: "confirmar" }, error: null };
    if (nome === "efetivar_consolidacao_contato") {
      const absorvidas = (tabelas.mensagens_agendadas ?? [])
        .filter((m) => m.reservada_para_mensagem_id === args.p_mensagem_id && m.status === "processando")
        .map((m) => m.id);
      return {
        data: { ok: true, absorvidas, notas_gravadas: (args.p_imoveis_consultados as unknown[]).length, notas_falhas: [],
          historico: { resultado: "gravada", imoveis_eco: [] } },
        error: null,
      };
    }
    return { data: null, error: { message: `rpc inesperada ${nome}` } };
  };
  return { cliente: { from, rpc } as unknown as SupabaseClient, rpcs, tabelas };
}

function mensagemRow(id: string, imovelId: string, texto: string, extra: Partial<DbMensagemAgendada> = {}): DbMensagemAgendada & Record<string, unknown> {
  return {
    id, user_id: USER, imovel_id: imovelId, tipo: "verificacao-disponibilidade", nome_proprietario: "Maria",
    telefone: TELEFONE, mensagem: texto, data_envio: "2026-09-22T11:00:00.000Z", status: "agendada",
    enviado_em: null, erro: null, reservada_para_mensagem_id: null, ...extra,
  };
}

const BASE = textoBaseDisponibilidade();
/** O texto padrão como foi gerado quando a mensagem nasceu (o imóvel ainda
    era de locação ou não tinha finalidade). Muda só o que o modelo usa. */
const textoPadrao = (row: Record<string, unknown>) => textoFollowUp(BASE, fromDbImovel(row as never));

describe("servidor: revalidação relê a finalidade do banco", () => {
  it("mensagem agendada quando o imóvel era locação; o imóvel virou venda antes do envio: cancela", async () => {
    const quandoNasceu = comFinalidade("locacao");
    const agora = comFinalidade("venda");
    const item = mensagemRow("m1", "i1", textoPadrao(quandoNasceu), { status: "processando" });
    const { cliente } = criarBanco({ imoveis: [agora], agenda: [], mensagens_agendadas: [item] });
    const { decisao } = await revalidarVerificacaoDisponibilidade(cliente, item);
    expect(decisao).toMatchObject({ acao: "cancelar", motivo: "imovel-indisponivel", causa: "finalidade-venda" });
  });

  it("outra conta: a linha de venda de outro tenant com o mesmo id não é lida (user_id filtra)", async () => {
    const deOutraConta = comFinalidade("venda", { user_id: OUTRA_CONTA });
    const item = mensagemRow("m1", "i1", "texto", { status: "processando" });
    const { cliente } = criarBanco({ imoveis: [deOutraConta], agenda: [], mensagens_agendadas: [item] });
    const { decisao, contexto } = await revalidarVerificacaoDisponibilidade(cliente, item);
    expect(contexto.imovel).toBeNull();
    expect(decisao).toMatchObject({ acao: "cancelar", motivo: "imovel-excluido" });
    expect(decisao).not.toHaveProperty("causa");
  });

  it("consolidação: candidata de venda é cancelada pela RPC com a causa e fica fora do texto; locacao e locacao_venda seguem", async () => {
    const rowA = comFinalidade("locacao");
    const rowB = comFinalidade("venda", { id: "i2", codigo: "LD-201", endereco: "Rua Bela Venda, 20" });
    const rowC = comFinalidade("locacao_venda", { id: "i3", codigo: "LD-202", endereco: "Rua C, 30" });
    const ancora = mensagemRow("m1", "i1", textoPadrao(rowA), { status: "processando" });
    const mB = mensagemRow("m2", "i2", textoPadrao(rowB), { data_envio: "2026-09-22T11:02:00.000Z" });
    const mC = mensagemRow("m3", "i3", textoPadrao(rowC), { data_envio: "2026-09-22T11:04:00.000Z" });
    const { cliente, rpcs, tabelas } = criarBanco({ imoveis: [rowA, rowB, rowC], agenda: [], mensagens_agendadas: [ancora, mB, mC] });

    const preparacao = await prepararConsolidacaoContato(cliente, ancora, fromDbImovel(rowA as never), "2026-09-22T11:00:30.000Z");

    expect(preparacao.transicoes).toEqual([{ mensagemId: "m2", acao: "cancelar", ok: true, causa: "finalidade-venda" }]);
    expect(rpcs).toEqual([{ nome: "encerrar_disponibilidade_imovel", args: { p_imovel_id: "i2", p_motivo: "imovel-indisponivel", p_mensagem_processando: "m2" } }]);
    expect(tabelas.mensagens_agendadas.find((m) => m.id === "m2")).toMatchObject({ status: "cancelada", cancelamento_motivo: "imovel-indisponivel" });
    expect(preparacao.reservadasIds).toEqual(["m3"]);
    expect(preparacao.imoveisConsultados.map((i) => i.id)).toEqual(["i1", "i3"]);
    expect(preparacao.plano.texto).toContain("Rua A, 10");
    expect(preparacao.plano.texto).toContain("Rua C, 30");
    expect(preparacao.plano.texto).not.toContain("Bela Venda");
  });

  it("consolidação: candidata cancelada por status (Perdido) continua sem causa", async () => {
    const rowA = comFinalidade("locacao");
    const rowB = comFinalidade("venda", { id: "i2", codigo: "LD-201", endereco: "Rua B, 20", status: "Perdido" });
    const ancora = mensagemRow("m1", "i1", textoPadrao(rowA), { status: "processando" });
    const mB = mensagemRow("m2", "i2", textoPadrao(rowB), { data_envio: "2026-09-22T11:02:00.000Z" });
    const { cliente } = criarBanco({ imoveis: [rowA, rowB], agenda: [], mensagens_agendadas: [ancora, mB] });
    const preparacao = await prepararConsolidacaoContato(cliente, ancora, fromDbImovel(rowA as never), "2026-09-22T11:00:30.000Z");
    expect(preparacao.transicoes).toEqual([{ mensagemId: "m2", acao: "cancelar", ok: true }]);
  });
});

/* ------------------------------------------------------------------
   4. Rota do cron, com a decisão REAL
   ------------------------------------------------------------------ */

function chamar() {
  return GET(new Request("http://localhost/api/cron/mensagens", { headers: { Authorization: "Bearer segredo-do-cron" } }));
}

/** Banco do cron: instância configurada, os imóveis e a mensagem reclamada
    (`processando`) no lote, mais as outras mensagens do proprietário. */
function bancoDoCron(imoveis: Record<string, unknown>[], mensagens: Array<DbMensagemAgendada & Record<string, unknown>>, agenda: Record<string, unknown>[] = []) {
  const reclamadas = mensagens.filter((m) => m.status === "processando");
  const banco = criarBanco({
    whatsapp_instancias: [{ user_id: USER, instancia: "corretora", token: "tok", observacao: null }],
    imoveis, agenda, mensagens_agendadas: mensagens,
  }, reclamadas.map((m) => ({ ...m })));
  mocks.banco = banco.cliente as never;
  return banco;
}

const eventos = () => mocks.registrarEvento.mock.calls.map(([e]) => e as { evento: string; detalhe: string; nivel: string });

describe("cron: verificação de disponibilidade para imóvel de venda não sai", () => {
  beforeEach(() => {
    vi.stubEnv("CRON_SECRET", "segredo-do-cron");
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://fixture.supabase.co");
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-ficticia");
    vi.stubEnv("EVOLUTION_SERVER_URL", "https://evolution.fixture");
    mocks.registrarEvento.mockReset();
    mocks.enviar.mockReset().mockResolvedValue({ mensagemId: "wa-1", idExterno: true });
    mocks.garantir.mockReset().mockResolvedValue({ ok: true, instancia: "corretora", token: "tok", criada: false, qr: null });
    mocks.historico.mockReset().mockResolvedValue({ persistencia: "gravada", imoveisEco: [], erro: null });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    mocks.banco = null;
  });

  it("venda: zero envio, cancela pela RPC do M4 com imovel-indisponivel e registra finalidade-venda sem PII", async () => {
    const row = comFinalidade("venda");
    const item = mensagemRow("v1", "i1", textoPadrao(row), { status: "processando" });
    const { rpcs, tabelas } = bancoDoCron([row], [item]);

    const resposta = await chamar();

    expect(await resposta.json()).toMatchObject({ ok: true, processadas: 1, enviadas: 0, suprimidas: 1, reagendadas: 0, falhas: 0, consolidadas: 0 });
    expect(mocks.enviar).not.toHaveBeenCalled();
    expect(mocks.historico).not.toHaveBeenCalled();
    expect(rpcs.map((r) => r.nome)).toEqual(["claim_mensagens_agendadas", "encerrar_disponibilidade_imovel"]);
    expect(rpcs[1].args).toEqual({ p_imovel_id: "i1", p_motivo: "imovel-indisponivel", p_mensagem_processando: "v1" });
    expect(tabelas.mensagens_agendadas[0]).toMatchObject({ status: "cancelada", cancelamento_motivo: "imovel-indisponivel" });
    expect(eventos()).toEqual([expect.objectContaining({
      evento: "agendamento-cancelado-worker", nivel: "info", detalhe: "v1 imovel-indisponivel finalidade-venda",
    })]);
    const tudo = JSON.stringify(mocks.registrarEvento.mock.calls);
    for (const pii of ["Maria", TELEFONE, "Rua A", "LD-200", "disponível para locação"]) expect(tudo).not.toContain(pii);
  });

  it("venda com disponibilidade confirmada recente: zero reagendamento, cancela", async () => {
    const row = comFinalidade("venda");
    const item = mensagemRow("v1", "i1", textoPadrao(row), { status: "processando" });
    const { rpcs } = bancoDoCron([row], [item], [AGENDA_VISITA_ROW]);

    expect(await (await chamar()).json()).toMatchObject({ enviadas: 0, reagendadas: 0, suprimidas: 1 });
    expect(rpcs.some((r) => r.nome === "registrar_confirmacao_disponibilidade")).toBe(false);
    expect(mocks.enviar).not.toHaveBeenCalled();
  });

  it("mensagem nascida quando o imóvel era NULL; agora é venda: o worker relê e não envia", async () => {
    const quandoNasceu = comFinalidade(null);
    const item = mensagemRow("v1", "i1", textoPadrao(quandoNasceu), { status: "processando" });
    bancoDoCron([comFinalidade("venda")], [item]);

    expect(await (await chamar()).json()).toMatchObject({ enviadas: 0, suprimidas: 1 });
    expect(mocks.enviar).not.toHaveBeenCalled();
  });

  it.each(FINALIDADES_QUE_PASSAM)("%s elegível: envia o texto agendado, uma vez, como antes", async (finalidade) => {
    const row = comFinalidade(finalidade);
    const item = mensagemRow("v1", "i1", textoPadrao(row), { status: "processando" });
    const { rpcs, tabelas } = bancoDoCron([row], [item]);

    expect(await (await chamar()).json()).toMatchObject({ enviadas: 1, suprimidas: 0, reagendadas: 0, falhas: 0 });
    expect(mocks.enviar).toHaveBeenCalledExactlyOnceWith(TELEFONE, textoPadrao(row), expect.anything());
    expect(rpcs.map((r) => r.nome)).toEqual(["claim_mensagens_agendadas"]);
    expect(tabelas.mensagens_agendadas[0]).toMatchObject({ status: "enviada" });
    // A finalidade não é escrita por ninguém aqui.
    expect(tabelas.imoveis[0]).toEqual(row);
  });

  it.each(FINALIDADES_QUE_PASSAM)("%s com visita confirmada: reagenda pela RPC e não envia, como antes", async (finalidade) => {
    const row = comFinalidade(finalidade);
    const item = mensagemRow("v1", "i1", textoPadrao(row), { status: "processando" });
    const { rpcs } = bancoDoCron([row], [item], [AGENDA_VISITA_ROW]);

    expect(await (await chamar()).json()).toMatchObject({ enviadas: 0, reagendadas: 1 });
    expect(rpcs[1]).toMatchObject({ nome: "registrar_confirmacao_disponibilidade", args: { p_data_confirmacao: "2026-09-01" } });
    expect(mocks.enviar).not.toHaveBeenCalled();
  });

  it("locacao_venda Locado: não envia, com a causa de status de sempre (sem finalidade-venda)", async () => {
    const row = comFinalidade("locacao_venda", { status: "Locado", locado_em: "2026-09-01" });
    const item = mensagemRow("v1", "i1", textoPadrao(row), { status: "processando" });
    bancoDoCron([row], [item]);

    expect(await (await chamar()).json()).toMatchObject({ enviadas: 0, suprimidas: 1 });
    expect(mocks.enviar).not.toHaveBeenCalled();
    expect(eventos()).toEqual([expect.objectContaining({ detalhe: "v1 imovel-indisponivel status-locado" })]);
  });

  it("precedência no evento: venda retirada fica com a causa de retirado", async () => {
    const row = comFinalidade("venda", { retirado: true });
    bancoDoCron([row], [mensagemRow("v1", "i1", textoPadrao(row), { status: "processando" })]);
    await chamar();
    expect(eventos()).toEqual([expect.objectContaining({ detalhe: "v1 imovel-indisponivel retirado" })]);
    expect(mocks.enviar).not.toHaveBeenCalled();
  });

  it("precedência no evento: venda em status fora da fase fica com `status`", async () => {
    const row = comFinalidade("venda", { status: "Novo contato", status_history: [] });
    bancoDoCron([row], [mensagemRow("v1", "i1", textoPadrao(row), { status: "processando" })]);
    await chamar();
    expect(eventos()).toEqual([expect.objectContaining({ detalhe: "v1 imovel-indisponivel status" })]);
    expect(mocks.enviar).not.toHaveBeenCalled();
  });

  it("âncora de venda com outras verificações do proprietário: cancela antes de procurar candidatas; nada sai", async () => {
    const rowA = comFinalidade("venda");
    const rowB = comFinalidade("locacao", { id: "i2", codigo: "LD-201", endereco: "Rua B, 20" });
    const ancora = mensagemRow("v1", "i1", textoPadrao(rowA), { status: "processando" });
    const mB = mensagemRow("v2", "i2", textoPadrao(rowB), { data_envio: "2026-09-22T11:02:00.000Z" });
    const { tabelas } = bancoDoCron([rowA, rowB], [ancora, mB]);

    expect(await (await chamar()).json()).toMatchObject({ enviadas: 0, suprimidas: 1, consolidadas: 0 });
    expect(mocks.enviar).not.toHaveBeenCalled();
    // A de locação não foi tocada: segue agendada para a sua própria vez.
    expect(tabelas.mensagens_agendadas.find((m) => m.id === "v2")).toMatchObject({ status: "agendada", reservada_para_mensagem_id: null });
  });

  it("proprietário com locacao, venda e locacao_venda no dia: sai UMA mensagem, sem o imóvel de venda, e a venda é cancelada com evento", async () => {
    const rowA = comFinalidade("locacao");
    const rowB = comFinalidade("venda", { id: "i2", codigo: "LD-201", endereco: "Rua Bela Venda, 20" });
    const rowC = comFinalidade("locacao_venda", { id: "i3", codigo: "LD-202", endereco: "Rua C, 30" });
    const ancora = mensagemRow("v1", "i1", textoPadrao(rowA), { status: "processando" });
    const mB = mensagemRow("v2", "i2", textoPadrao(rowB), { data_envio: "2026-09-22T11:02:00.000Z" });
    const mC = mensagemRow("v3", "i3", textoPadrao(rowC), { data_envio: "2026-09-22T11:04:00.000Z" });
    const { rpcs, tabelas } = bancoDoCron([rowA, rowB, rowC], [ancora, mB, mC]);

    expect(await (await chamar()).json()).toMatchObject({ enviadas: 1, consolidadas: 1, suprimidas: 0, falhas: 0 });
    expect(mocks.enviar).toHaveBeenCalledOnce();
    const textoQueSaiu = mocks.enviar.mock.calls[0][1] as string;
    expect(textoQueSaiu).toContain("Rua A, 10");
    expect(textoQueSaiu).toContain("Rua C, 30");
    expect(textoQueSaiu).not.toContain("Bela Venda");
    const efetivacao = rpcs.find((r) => r.nome === "efetivar_consolidacao_contato");
    expect(efetivacao?.args.p_imoveis_consultados).toEqual(["i1", "i3"]);
    expect(rpcs.find((r) => r.nome === "encerrar_disponibilidade_imovel")?.args).toEqual({
      p_imovel_id: "i2", p_motivo: "imovel-indisponivel", p_mensagem_processando: "v2",
    });
    expect(tabelas.mensagens_agendadas.find((m) => m.id === "v2")).toMatchObject({ status: "cancelada", cancelamento_motivo: "imovel-indisponivel" });
    expect(eventos()).toContainEqual(expect.objectContaining({
      evento: "agendamento-cancelado-worker", detalhe: "v2 imovel-indisponivel finalidade-venda",
    }));
  });

  it("lote com duas mensagens: a de venda é cancelada e a de locação de outro proprietário sai", async () => {
    const venda = comFinalidade("venda");
    const locacao = comFinalidade("locacao", {
      id: "i9", codigo: "LD-900", endereco: "Rua Z, 9", proprietario_telefone: "43988887777",
      proprietario_telefone_canonico: telefoneCanonico("43988887777"),
    });
    const m1 = mensagemRow("v1", "i1", textoPadrao(venda), { status: "processando" });
    const m9 = mensagemRow("v9", "i9", textoPadrao(locacao), { status: "processando", telefone: "43988887777" });
    bancoDoCron([venda, locacao], [m1, m9]);

    expect(await (await chamar()).json()).toMatchObject({ processadas: 2, enviadas: 1, suprimidas: 1 });
    expect(mocks.enviar).toHaveBeenCalledExactlyOnceWith("43988887777", textoPadrao(locacao), expect.anything());
  });
});
