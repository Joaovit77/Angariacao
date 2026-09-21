/* Fronteira de servidor da revalidação (lib/servidor/disponibilidadeMensagem).
   Com um Supabase simulado que registra filtros e escritas, fixa: toda
   consulta leva user_id; `created_at` da agenda vira `criadoEm`; a transição
   vai pela RPC do M4 com a linha reclamada; e a consolidação só absorve o
   que cancelou de fato, com o cancelamento condicionado a `agendada`. */
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  aplicarDecisaoNoBanco,
  carregarContextoDisponibilidade,
  consolidarContatoDoProprietario,
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

describe("consolidarContatoDoProprietario", () => {
  const base = textoBaseDisponibilidade();
  const ancoraImovel = fromDbImovel(IMOVEL_ROW);
  const rowB = { ...IMOVEL_ROW, id: "i2", codigo: "LD-201", endereco: "Rua B, 20" };
  const rowC = { ...IMOVEL_ROW, id: "i3", codigo: "LD-202", endereco: "Rua C, 30" };
  const ancora = mensagemRow("m1", "i1", textoFollowUp(base, ancoraImovel));
  const mB = mensagemRow("m2", "i2", textoFollowUp(base, fromDbImovel(rowB)), "2026-09-22T11:02:00.000Z");
  const mC = mensagemRow("m3", "i3", textoFollowUp(base, fromDbImovel(rowC)), "2026-09-22T11:04:00.000Z");

  let cancelamentosAceitos: Set<string>;
  beforeEach(() => { cancelamentosAceitos = new Set(["m2", "m3"]); });

  function supabaseDoProprietario(imoveisRows = [IMOVEL_ROW, rowB, rowC], mensagens = [mB, mC]) {
    return criarSupabase((c) => {
      if (c.tabela === "imoveis" && c.single) {
        const id = c.filtros.find((f) => f.coluna === "id")?.valor;
        return { data: imoveisRows.find((r) => r.id === id) ?? null, error: null };
      }
      if (c.tabela === "imoveis") return { data: imoveisRows, error: null };
      if (c.tabela === "agenda") return { data: [], error: null };
      if (c.tabela === "mensagens_agendadas" && c.acao === "update") {
        const id = c.filtros.find((f) => f.coluna === "id")?.valor as string;
        return { data: cancelamentosAceitos.has(id) ? [{ id }] : [], error: null };
      }
      if (c.tabela === "mensagens_agendadas") return { data: mensagens, error: null };
      return { data: null, error: null };
    });
  }

  it("absorve as verificações do mesmo proprietário no dia, cancelando-as com status=agendada como condição", async () => {
    const { cliente, consultas } = supabaseDoProprietario();
    const resultado = await consolidarContatoDoProprietario(cliente, ancora, ancoraImovel, "2026-09-22T11:00:30.000Z");
    expect(resultado.absorvidasIds).toEqual(["m2", "m3"]);
    expect(resultado.imoveisConsultados.map((i) => i.id)).toEqual(["i1", "i2", "i3"]);
    expect(resultado.plano.texto).toContain("• Rua B, 20, Centro");

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
    const cancelamentos = consultas.filter((c) => c.tabela === "mensagens_agendadas" && c.acao === "update");
    expect(cancelamentos).toHaveLength(2);
    for (const cancelamento of cancelamentos) {
      expect(cancelamento.valores).toMatchObject({
        status: "cancelada", cancelamento_motivo: "contato-consolidado", cancelamento_origem: "worker",
        consolidada_em_mensagem_id: "m1", cancelada_em: "2026-09-22T11:00:30.000Z",
      });
      expect(cancelamento.filtros).toEqual(expect.arrayContaining([
        { op: "eq", coluna: "user_id", valor: USER },
        { op: "eq", coluna: "status", valor: "agendada" },
      ]));
    }
  });

  it("candidata reclamada por outro worker no meio fica de fora e o texto final não a cita", async () => {
    cancelamentosAceitos = new Set(["m2"]);
    const { cliente } = supabaseDoProprietario();
    const resultado = await consolidarContatoDoProprietario(cliente, ancora, ancoraImovel, "2026-09-22T11:00:30.000Z");
    expect(resultado.absorvidasIds).toEqual(["m2"]);
    expect(resultado.imoveisConsultados.map((i) => i.id)).toEqual(["i1", "i2"]);
    expect(resultado.plano.texto).not.toContain("Rua C, 30");
  });

  it("candidata cujo imóvel ficou indisponível é cancelada pela RPC e não entra na mensagem", async () => {
    const rowCPerdido = { ...rowC, status: "Perdido" };
    const { cliente, rpc } = supabaseDoProprietario([IMOVEL_ROW, rowB, rowCPerdido]);
    const resultado = await consolidarContatoDoProprietario(cliente, ancora, ancoraImovel, "2026-09-22T11:00:30.000Z");
    expect(resultado.transicoes).toEqual([{ mensagemId: "m3", acao: "cancelar", ok: true }]);
    expect(rpc).toHaveBeenCalledWith("encerrar_disponibilidade_imovel", expect.objectContaining({ p_imovel_id: "i3" }));
    expect(resultado.absorvidasIds).toEqual(["m2"]);
    expect(resultado.imoveisConsultados.map((i) => i.id)).toEqual(["i1", "i2"]);
  });

  it("sem outras verificações do proprietário no dia nada muda e nada é escrito", async () => {
    const { cliente, consultas } = supabaseDoProprietario([IMOVEL_ROW, rowB, rowC], []);
    const resultado = await consolidarContatoDoProprietario(cliente, ancora, ancoraImovel, "2026-09-22T11:00:30.000Z");
    expect(resultado.absorvidasIds).toEqual([]);
    expect(resultado.plano.texto).toBeNull();
    expect(consultas.filter((c) => c.acao === "update")).toEqual([]);
  });

  it("imóvel sem telefone canônico não procura ninguém", async () => {
    const { cliente, consultas } = supabaseDoProprietario();
    const semTelefone = { ...ancoraImovel, proprietarioTelefone: null };
    const resultado = await consolidarContatoDoProprietario(cliente, ancora, semTelefone, "2026-09-22T11:00:30.000Z");
    expect(resultado.absorvidasIds).toEqual([]);
    expect(consultas).toEqual([]);
  });
});
