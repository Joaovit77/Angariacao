/* Fronteira de servidor da revalidação (lib/servidor/disponibilidadeMensagem).
   Com um Supabase simulado que registra filtros e escritas, fixa: toda
   consulta leva user_id; `created_at` da agenda vira `criadoEm`; a transição
   vai pela RPC do M4 com a linha reclamada; e a consolidação é em dois
   tempos: preparar só RESERVA (candidatas `agendada` → `processando` com
   `reservada_para_mensagem_id`, sem marca de contato); efetivar, só depois
   do POST aceito, vai pela RPC atômica; desfazer (antes do POST) devolve as
   reservadas a `agendada`; resultado incerto (depois do POST) as tira da
   fila sem afirmar contato. */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  aplicarDecisaoNoBanco,
  carregarContextoDisponibilidade,
  desfazerConsolidacaoContato,
  efetivarConsolidacaoContato,
  marcarConsolidacaoIncerta,
  notasDaConsolidacao,
  prepararConsolidacaoContato,
  revalidarVerificacaoDisponibilidade,
} from "@/lib/servidor/disponibilidadeMensagem";
import { textoBaseDisponibilidade, textoFollowUp } from "@/lib/calculo/followup";
import { fromDbImovel } from "@/lib/persistencia/mapeadores";
import type { DbMensagemAgendada } from "@/lib/mensagensAgendadas";
import type { SupabaseClient } from "@supabase/supabase-js";

type Filtro = { op: string; coluna: string; valor: unknown };
interface Consulta { tabela: string; acao: "select" | "update"; filtros: Filtro[]; valores?: Record<string, unknown>; single: boolean }

function criarSupabase(responder: (consulta: Consulta) => { data: unknown; error: { message: string } | null }) {
  const consultas: Consulta[] = [];
  const rpc = vi.fn<() => Promise<{ data: unknown; error: { message: string } | null }>>(async () => ({ data: { ok: true, acao: "x" }, error: null }));
  const from = (tabela: string) => {
    const consulta: Consulta = { tabela, acao: "select", filtros: [], single: false };
    consultas.push(consulta);
    const cadeia: Record<string, unknown> = {};
    const filtro = (op: string) => (coluna: string, valor: unknown) => { consulta.filtros.push({ op, coluna, valor }); return cadeia; };
    Object.assign(cadeia, {
      select: () => cadeia,
      eq: filtro("eq"), neq: filtro("neq"), in: filtro("in"), gte: filtro("gte"), lt: filtro("lt"),
      update: (valores: Record<string, unknown>) => { consulta.acao = "update"; consulta.valores = valores; return cadeia; },
      maybeSingle: async () => { consulta.single = true; return responder(consulta); },
      then: (resolve: (r: unknown) => void, reject?: (e: unknown) => void) => Promise.resolve(responder(consulta)).then(resolve, reject),
    });
    return cadeia;
  };
  return { cliente: { from, rpc } as unknown as SupabaseClient, consultas, rpc };
}

const USER = "u1";
const IMOVEL_ROW = {
  id: "i1", user_id: USER, codigo: "LD-200", endereco: "Rua A, 10", bairro: "Centro", cidade: "Londrina", estado: "PR",
  unidade: null, bloco: null, edificio: null, tipo: "Casa", quartos: 2, banheiros: 1, vagas: 1,
  valor_aluguel: 1500, valor_condominio: 0, proprietario_nome: "Maria", proprietario_telefone: "43999992525",
  forma_abordagem: null, origem_imovel: null, anuncio_idade_dias: null, imobiliaria_concorrente: null,
  latitude: null, longitude: null, data_angariacao: "2026-07-01", responsavel: null, status: "Publicado",
  observacoes: null, status_history: [{ status: "Angariado", date: "2026-07-02" }], notas: [], tentativas: [],
  pausado_ate: null, motivo_perda: null, motivo_perda_outro: null, comissao_recebida: null, comissao_recebida_valor: null,
  comissao_recebida_data: null, comissao_forma_pagamento: null, comissao_observacao: null, autorizacao_assinada_em: null,
  autorizacao_responsavel: null, locado_em: null, contrato_numero: null, pre_cadastro: null, importado: null,
  retirado: false, valor_aluguel_atraso: null, texto_anuncio: null, imovel_principal_id: null, referencia_crm: null, cep: null,
};
const AGENDA_ROW = {
  id: "a1", user_id: USER, title: "Visita — LD-200", type: "Visita", date: "2026-09-05", hora: "10:00", imovel_id: "i1",
  notes: null, done: false, is_verificacao_disponibilidade: false, origin: "evento_whatsapp",
  reason_code: "visita_confirmada_pelo_proprietario", created_at: "2026-09-01T13:15:00+00:00",
};
function mensagemRow(id: string, imovelId: string, mensagem: string, dataEnvio = "2026-09-22T11:00:00.000Z"): DbMensagemAgendada {
  return {
    id, user_id: USER, imovel_id: imovelId, tipo: "verificacao-disponibilidade", nome_proprietario: "Maria",
    telefone: "43999992525", mensagem, data_envio: dataEnvio, status: "agendada", enviado_em: null, erro: null,
  };
}

describe("carregarContextoDisponibilidade", () => {
  it("filtra imóvel e agenda por user_id e leva created_at como criadoEm até o M2", async () => {
    const { cliente, consultas } = criarSupabase((c) => {
      if (c.tabela === "imoveis") return { data: IMOVEL_ROW, error: null };
      if (c.tabela === "agenda") return { data: [AGENDA_ROW], error: null };
      return { data: null, error: null };
    });
    const contexto = await carregarContextoDisponibilidade(cliente, USER, "i1");
    expect(contexto.imovel?.id).toBe("i1");
    expect(contexto.agenda[0].criadoEm).toBe("2026-09-01T13:15:00+00:00");
    expect(contexto.avaliacao?.estado).toBe("disponivel");
    expect(contexto.avaliacao?.dataEvidenciaPositiva).toBe("2026-09-01T10:15:00");
    for (const consulta of consultas) {
      expect(consulta.filtros).toContainEqual({ op: "eq", coluna: "user_id", valor: USER });
    }
  });

  it("sem created_at na agenda a visita confirmada não vira evidência", async () => {
    const { cliente } = criarSupabase((c) => {
      if (c.tabela === "imoveis") return { data: IMOVEL_ROW, error: null };
      if (c.tabela === "agenda") return { data: [{ ...AGENDA_ROW, created_at: undefined }], error: null };
      return { data: null, error: null };
    });
    const contexto = await carregarContextoDisponibilidade(cliente, USER, "i1");
    expect(contexto.avaliacao?.estado).toBe("sem-evidencia");
  });

  it("imóvel inexistente para a conta devolve contexto vazio e a decisão cancela como imovel-excluido", async () => {
    const { cliente } = criarSupabase(() => ({ data: null, error: null }));
    const { decisao, contexto } = await revalidarVerificacaoDisponibilidade(cliente, mensagemRow("m1", "i1", "x"));
    expect(contexto.imovel).toBeNull();
    expect(decisao).toMatchObject({ acao: "cancelar", motivo: "imovel-excluido" });
  });

  it("erro de leitura propaga em vez de virar decisão", async () => {
    const { cliente } = criarSupabase(() => ({ data: null, error: { message: "timeout" } }));
    await expect(carregarContextoDisponibilidade(cliente, USER, "i1")).rejects.toThrow("imovel: timeout");
  });
});

describe("aplicarDecisaoNoBanco", () => {
  const item = mensagemRow("m1", "i1", "x");

  it("cancelar chama encerrar_disponibilidade_imovel com a linha reclamada", async () => {
    const { cliente, rpc } = criarSupabase(() => ({ data: null, error: null }));
    const resultado = await aplicarDecisaoNoBanco(cliente, item, { acao: "cancelar", motivo: "imovel-indisponivel", evidencia: null, fato: "x" });
    expect(resultado.ok).toBe(true);
    expect(rpc).toHaveBeenCalledWith("encerrar_disponibilidade_imovel", { p_imovel_id: "i1", p_motivo: "imovel-indisponivel", p_mensagem_processando: "m1" });
  });

  it("reagendar chama registrar_confirmacao_disponibilidade com a data civil de E", async () => {
    const { cliente, rpc } = criarSupabase(() => ({ data: null, error: null }));
    await aplicarDecisaoNoBanco(cliente, item, {
      acao: "reagendar", motivo: "disponibilidade-confirmada", dataEvidencia: "2026-09-01T10:15:00",
      novoDiaEnvio: "2026-10-31", novaDataEnvio: "2026-10-31T11:00:00.000Z",
      evidencia: { imovelId: "i1", sinal: "disponivel", codigo: "tentativa-agendou", fato: "", ocorridoEm: "2026-09-01T10:15:00", precisao: "minuto", fonte: "tentativa", origem: "usuario", referenciaId: "t" },
    });
    expect(rpc).toHaveBeenCalledWith("registrar_confirmacao_disponibilidade", {
      p_imovel_id: "i1", p_data_confirmacao: "2026-09-01", p_motivo: "disponibilidade-confirmada", p_mensagem_processando: "m1",
    });
  });

  it("RPC que recusa (ok=false) ou falha vira resultado não ok, nunca exceção silenciosa", async () => {
    const { cliente, rpc } = criarSupabase(() => ({ data: null, error: null }));
    rpc.mockResolvedValueOnce({ data: { ok: false, motivo: "imovel-nao-encontrado" }, error: null });
    expect(await aplicarDecisaoNoBanco(cliente, item, { acao: "cancelar", motivo: "imovel-indisponivel", evidencia: null, fato: "" }))
      .toMatchObject({ ok: false, erro: "imovel-nao-encontrado" });
    rpc.mockResolvedValueOnce({ data: null, error: { message: "boom" } });
    expect(await aplicarDecisaoNoBanco(cliente, item, { acao: "cancelar", motivo: "imovel-indisponivel", evidencia: null, fato: "" }))
      .toMatchObject({ ok: false, erro: "boom" });
  });

  it("enviar não toca no banco", async () => {
    const { cliente, rpc, consultas } = criarSupabase(() => ({ data: null, error: null }));
    await aplicarDecisaoNoBanco(cliente, item, { acao: "enviar", estado: "sem-evidencia", motivo: "sem-evidencia" });
    expect(rpc).not.toHaveBeenCalled();
    expect(consultas).toEqual([]);
  });
});

describe("consolidação em dois tempos: preparar (reserva) → efetivar (após o POST) / desfazer", () => {
  const base = textoBaseDisponibilidade();
  const ancoraImovel = fromDbImovel(IMOVEL_ROW);
  const rowB = { ...IMOVEL_ROW, id: "i2", codigo: "LD-201", endereco: "Rua B, 20" };
  const rowC = { ...IMOVEL_ROW, id: "i3", codigo: "LD-202", endereco: "Rua C, 30" };
  const ancora = mensagemRow("m1", "i1", textoFollowUp(base, ancoraImovel));
  const mB = mensagemRow("m2", "i2", textoFollowUp(base, fromDbImovel(rowB)), "2026-09-22T11:02:00.000Z");
  const mC = mensagemRow("m3", "i3", textoFollowUp(base, fromDbImovel(rowC)), "2026-09-22T11:04:00.000Z");
  const AGORA = "2026-09-22T11:00:30.000Z";

  /** Estado das linhas de mensagens: um update só "pega" quando a condição
      de status bate com o estado atual, como no Postgres. */
  let estado: Map<string, Record<string, unknown>>;
  beforeEach(() => {
    estado = new Map([
      ["m1", { status: "processando" }],
      ["m2", { status: "agendada" }],
      ["m3", { status: "agendada" }],
    ]);
  });

  /** `buscaDesatualizada`: a busca devolve as candidatas como estavam antes de
      outro worker reclamar uma delas (a corrida entre buscar e reservar). */
  function supabaseDoProprietario(imoveisRows = [IMOVEL_ROW, rowB, rowC], mensagens = [mB, mC], buscaDesatualizada = false) {
    return criarSupabase((c) => {
      if (c.tabela === "imoveis" && c.single) {
        const id = c.filtros.find((f) => f.coluna === "id")?.valor;
        return { data: imoveisRows.find((r) => r.id === id) ?? null, error: null };
      }
      if (c.tabela === "imoveis") return { data: imoveisRows, error: null };
      if (c.tabela === "agenda") return { data: [], error: null };
      if (c.tabela === "mensagens_agendadas" && c.acao === "update") {
        const id = c.filtros.find((f) => f.coluna === "id")?.valor as string;
        const exigido = c.filtros.find((f) => f.coluna === "status")?.valor;
        const atual = estado.get(id);
        if (!atual || atual.status !== exigido) return { data: [], error: null };
        estado.set(id, { ...atual, ...c.valores });
        return { data: [{ id }], error: null };
      }
      if (c.tabela === "mensagens_agendadas") {
        return { data: buscaDesatualizada ? mensagens : mensagens.filter((m) => estado.get(m.id)?.status === "agendada"), error: null };
      }
      return { data: null, error: null };
    });
  }

  const updates = (consultas: Consulta[]) => consultas.filter((c) => c.tabela === "mensagens_agendadas" && c.acao === "update");

  const ENTRADA = {
    texto: "TEXTO CONSOLIDADO",
    imoveisConsultados: ["i1", "i2", "i3"],
    mensagemExternaId: "wa-abc",
    enviadoEm: "2026-09-22T11:00:45.000Z",
    dataNota: "2026-09-22T08:00:45",
  };

  it("preparar só reserva: B e C vão para `processando` com a reserva apontando para A, condicionado a `agendada`, e nada é cancelado", async () => {
    const { cliente, consultas } = supabaseDoProprietario();
    const preparacao = await prepararConsolidacaoContato(cliente, ancora, ancoraImovel, AGORA);
    expect(preparacao.reservadasIds).toEqual(["m2", "m3"]);
    expect(preparacao.imoveisConsultados.map((i) => i.id)).toEqual(["i1", "i2", "i3"]);
    expect(preparacao.plano.texto).toContain("• Rua B, 20, Centro");

    const busca = consultas.find((c) => c.tabela === "mensagens_agendadas" && c.acao === "select")!;
    expect(busca.filtros).toEqual(expect.arrayContaining([
      { op: "eq", coluna: "user_id", valor: USER },
      { op: "eq", coluna: "tipo", valor: "verificacao-disponibilidade" },
      { op: "eq", coluna: "status", valor: "agendada" },
      { op: "in", coluna: "imovel_id", valor: ["i1", "i2", "i3"] },
      { op: "gte", coluna: "data_envio", valor: "2026-09-22T03:00:00.000Z" },
      { op: "lt", coluna: "data_envio", valor: "2026-09-23T03:00:00.000Z" },
      { op: "neq", coluna: "id", valor: "m1" },
    ]));
    const imoveisDoDono = consultas.find((c) => c.tabela === "imoveis" && !c.single)!;
    expect(imoveisDoDono.filtros).toEqual(expect.arrayContaining([
      { op: "eq", coluna: "user_id", valor: USER },
      { op: "eq", coluna: "proprietario_telefone_canonico", valor: "4399992525" },
    ]));

    const reservas = updates(consultas);
    expect(reservas).toHaveLength(2);
    for (const reserva of reservas) {
      expect(reserva.valores).toEqual({ status: "processando", reservada_para_mensagem_id: "m1", updated_at: AGORA });
      expect(reserva.filtros).toEqual(expect.arrayContaining([
        { op: "eq", coluna: "user_id", valor: USER },
        { op: "eq", coluna: "status", valor: "agendada" },
      ]));
    }
    expect(estado.get("m2")).toEqual({ status: "processando", reservada_para_mensagem_id: "m1", updated_at: AGORA });
    expect(estado.get("m3")).toEqual({ status: "processando", reservada_para_mensagem_id: "m1", updated_at: AGORA });
    // Nenhuma marca de contato antes do POST.
    for (const linha of estado.values()) {
      expect(linha.cancelamento_motivo).toBeUndefined();
      expect(linha.consolidada_em_mensagem_id).toBeUndefined();
    }
  });

  it("POST bem-sucedido: efetivar é UMA chamada à RPC atômica, com âncora, conta, texto que saiu, imóveis e notas prontas", async () => {
    const { cliente, rpc, consultas } = supabaseDoProprietario();
    rpc.mockResolvedValueOnce({ data: { ok: true, absorvidas: ["m2", "m3"], absorvidas_total: 2, notas_gravadas: 3, notas_falhas: [] }, error: null });
    const efetivacao = await efetivarConsolidacaoContato(cliente, ancora, ENTRADA);
    expect(efetivacao).toEqual({ ok: true, absorvidasIds: ["m2", "m3"], notasGravadas: 3, notasFalhas: [], erro: null });
    expect(rpc).toHaveBeenCalledOnce();
    const [nome, params] = rpc.mock.calls[0] as unknown as [string, Record<string, unknown>];
    expect(nome).toBe("efetivar_consolidacao_contato");
    expect(params).toMatchObject({
      p_mensagem_id: "m1", p_user_id: USER, p_texto: "TEXTO CONSOLIDADO",
      p_imoveis_consultados: ["i1", "i2", "i3"], p_enviado_em: "2026-09-22T11:00:45.000Z",
    });
    // As notas vêm no formato do TypeScript, uma por imóvel, com o id externo.
    const notas = params.p_notas as Array<{ imovel_id: string; nota: { id: string; texto: string; direcao: string; origem: string; data: string } }>;
    expect(notas.map((n) => n.imovel_id)).toEqual(["i1", "i2", "i3"]);
    for (const { nota } of notas) {
      expect(nota).toMatchObject({ direcao: "enviada", origem: "agendamento", data: "2026-09-22T08:00:45" });
      expect(nota.id).toContain("wa-abc");
      expect(nota.texto).toContain("TEXTO CONSOLIDADO");
    }
    expect(notas).toEqual(notasDaConsolidacao(ENTRADA));
    // Nenhuma escrita direta do TypeScript: a transação é toda da RPC.
    expect(updates(consultas)).toEqual([]);
  });

  it("efetivar recusada ou com erro devolve ok=false sem exceção silenciosa (o worker decide: resultado incerto)", async () => {
    const { cliente, rpc } = supabaseDoProprietario();
    rpc.mockResolvedValueOnce({ data: { ok: false, motivo: "ancora-nao-processando", status: "erro" }, error: null });
    expect(await efetivarConsolidacaoContato(cliente, ancora, ENTRADA)).toMatchObject({ ok: false, absorvidasIds: [], erro: "ancora-nao-processando" });
    rpc.mockResolvedValueOnce({ data: null, error: { message: "connection reset" } });
    expect(await efetivarConsolidacaoContato(cliente, ancora, ENTRADA)).toMatchObject({ ok: false, erro: "connection reset" });
  });

  it("efetivar com nota que falhou no banco continua ok (o envio e a consolidação estão gravados) e expõe a falha", async () => {
    const { cliente, rpc } = supabaseDoProprietario();
    rpc.mockResolvedValueOnce({ data: { ok: true, absorvidas: ["m2"], absorvidas_total: 1, notas_gravadas: 2, notas_falhas: [{ imovel_id: "i3", erro: "22023" }] }, error: null });
    expect(await efetivarConsolidacaoContato(cliente, ancora, ENTRADA)).toEqual({
      ok: true, absorvidasIds: ["m2"], notasGravadas: 2, notasFalhas: [{ imovel_id: "i3", erro: "22023" }], erro: null,
    });
  });

  it("antes do POST: desfazer devolve B e C a `agendada`, limpa a reserva e não deixa evidência de contato", async () => {
    const { cliente, consultas } = supabaseDoProprietario();
    const preparacao = await prepararConsolidacaoContato(cliente, ancora, ancoraImovel, AGORA);
    const liberacao = await desfazerConsolidacaoContato(cliente, ancora, preparacao, "2026-09-22T11:00:45.000Z");
    expect(liberacao).toEqual({ liberadasIds: ["m2", "m3"], erro: null });
    for (const id of ["m2", "m3"]) {
      expect(estado.get(id)).toEqual({ status: "agendada", reservada_para_mensagem_id: null, updated_at: "2026-09-22T11:00:45.000Z" });
    }
    for (const liberacao of updates(consultas).slice(2)) {
      expect(liberacao.filtros).toEqual(expect.arrayContaining([
        { op: "eq", coluna: "status", valor: "processando" },
        { op: "eq", coluna: "reservada_para_mensagem_id", valor: "m1" },
      ]));
    }
  });

  it("depois do POST iniciado (timeout/resultado incerto): B e C NÃO voltam à fila, viram erro com semântica própria e mantêm o vínculo", async () => {
    const { cliente } = supabaseDoProprietario();
    const preparacao = await prepararConsolidacaoContato(cliente, ancora, ancoraImovel, AGORA);
    const marca = await marcarConsolidacaoIncerta(cliente, ancora, preparacao, "2026-09-22T11:01:05.000Z");
    expect(marca).toEqual({ marcadasIds: ["m2", "m3"], erro: null });
    for (const id of ["m2", "m3"]) {
      expect(estado.get(id)).toEqual({
        status: "erro", erro: "consolidacao-resultado-incerto", reservada_para_mensagem_id: "m1", updated_at: "2026-09-22T11:01:05.000Z",
      });
      expect(estado.get(id)).not.toHaveProperty("cancelamento_motivo");
      expect(estado.get(id)).not.toHaveProperty("consolidada_em_mensagem_id");
    }
  });

  it("reexecução depois de uma desistência: B vira âncora e reserva só C; A (em erro) não é candidata; nada é absorvido duas vezes", async () => {
    const { cliente } = supabaseDoProprietario();
    const primeira = await prepararConsolidacaoContato(cliente, ancora, ancoraImovel, AGORA);
    await desfazerConsolidacaoContato(cliente, ancora, primeira, AGORA);
    estado.set("m1", { status: "erro" });
    // Segunda execução: B reclamada pelo claim (processando) é a âncora.
    estado.set("m2", { status: "processando" });
    const ancoraB = { ...mB, status: "processando" as const };
    const segunda = await prepararConsolidacaoContato(cliente, ancoraB, fromDbImovel(rowB), "2026-09-22T11:02:10.000Z");
    expect(segunda.reservadasIds).toEqual(["m3"]);
    expect(segunda.imoveisConsultados.map((i) => i.id)).toEqual(["i2", "i3"]);
    expect(estado.get("m3")).toMatchObject({ status: "processando", reservada_para_mensagem_id: "m2" });
    expect(estado.get("m1")).toEqual({ status: "erro" });
  });

  it("reserva órfã já varrida para `erro` não vira contato realizado: desfazer e marcar só tocam reservas vivas desta âncora", async () => {
    const { cliente } = supabaseDoProprietario();
    const preparacao = await prepararConsolidacaoContato(cliente, ancora, ancoraImovel, AGORA);
    // O processo morreu; dez minutos depois a varredura marcou a reserva de
    // C como consolidação interrompida (mantendo o vínculo).
    estado.set("m3", { status: "erro", erro: "consolidacao-interrompida", reservada_para_mensagem_id: "m1" });
    const liberacao = await desfazerConsolidacaoContato(cliente, ancora, preparacao, "2026-09-22T11:12:00.000Z");
    expect(liberacao.liberadasIds).toEqual(["m2"]);
    expect(estado.get("m3")).toEqual({ status: "erro", erro: "consolidacao-interrompida", reservada_para_mensagem_id: "m1" });
    expect(estado.get("m3")).not.toHaveProperty("cancelamento_motivo");
    expect(estado.get("m3")).not.toHaveProperty("consolidada_em_mensagem_id");
  });

  it("concorrência: candidata reclamada por outro worker entre a busca e a reserva não é reservada e o texto final não a cita", async () => {
    // Outro worker reclamou m3 depois de a busca a ter visto `agendada`.
    estado.set("m3", { status: "processando" });
    const { cliente } = supabaseDoProprietario([IMOVEL_ROW, rowB, rowC], [mB, mC], true);
    const preparacao = await prepararConsolidacaoContato(cliente, ancora, ancoraImovel, AGORA);
    expect(preparacao.reservadasIds).toEqual(["m2"]);
    expect(preparacao.imoveisConsultados.map((i) => i.id)).toEqual(["i1", "i2"]);
    expect(preparacao.plano.texto).not.toContain("Rua C, 30");
    expect(estado.get("m3")).toEqual({ status: "processando" });
  });

  it("candidata cujo imóvel ficou indisponível é cancelada pela RPC e não entra na mensagem", async () => {
    const rowCPerdido = { ...rowC, status: "Perdido" };
    const { cliente, rpc } = supabaseDoProprietario([IMOVEL_ROW, rowB, rowCPerdido]);
    const preparacao = await prepararConsolidacaoContato(cliente, ancora, ancoraImovel, AGORA);
    expect(preparacao.transicoes).toEqual([{ mensagemId: "m3", acao: "cancelar", ok: true }]);
    expect(rpc).toHaveBeenCalledWith("encerrar_disponibilidade_imovel", expect.objectContaining({ p_imovel_id: "i3" }));
    expect(preparacao.reservadasIds).toEqual(["m2"]);
    expect(preparacao.imoveisConsultados.map((i) => i.id)).toEqual(["i1", "i2"]);
  });

  it("sem outras verificações do proprietário no dia nada muda e nada é escrito", async () => {
    const { cliente, consultas } = supabaseDoProprietario([IMOVEL_ROW, rowB, rowC], []);
    const preparacao = await prepararConsolidacaoContato(cliente, ancora, ancoraImovel, AGORA);
    expect(preparacao.reservadasIds).toEqual([]);
    expect(preparacao.plano.texto).toBeNull();
    expect(updates(consultas)).toEqual([]);
  });

  it("imóvel sem telefone canônico não procura ninguém", async () => {
    const { cliente, consultas } = supabaseDoProprietario();
    const semTelefone = { ...ancoraImovel, proprietarioTelefone: null };
    const preparacao = await prepararConsolidacaoContato(cliente, ancora, semTelefone, AGORA);
    expect(preparacao.reservadasIds).toEqual([]);
    expect(consultas).toEqual([]);
  });
});
