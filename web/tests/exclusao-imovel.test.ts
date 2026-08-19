import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AgendaItem, Imovel } from "@/lib/tipos";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  from: vi.fn(),
  sincronizar: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("@/lib/persistencia/supabase", () => ({
  getSupabase: () => ({ rpc: mocks.rpc, from: mocks.from }),
}));
vi.mock("@/lib/googleAgenda", () => ({ sincronizarCompromisso: mocks.sincronizar }));
vi.mock("@/lib/toast", () => ({ toast: mocks.toast }));

import { excluirImovel } from "@/lib/mutacoes";
import { useAppStore } from "@/lib/store";

const SCHEMA = readFileSync(new URL("../../supabase-schema.sql", import.meta.url), "utf8");
const WORKER = readFileSync(new URL("../app/api/cron/mensagens/route.ts", import.meta.url), "utf8");

function imovel(id: string): Imovel {
  return { id, codigo: id.toUpperCase(), endereco: `Rua ${id}`, status: "Novo contato" };
}

function compromisso(id: string, imovelId: string, lembrete = false): AgendaItem {
  return {
    id,
    imovelId,
    title: lembrete ? "Verificar disponibilidade" : "Visita",
    type: lembrete ? "Verificar disponibilidade" : "Visita",
    date: "2026-08-20",
    done: false,
    isVerificacaoDisponibilidade: lembrete,
  };
}

beforeEach(() => {
  mocks.rpc.mockReset();
  mocks.from.mockReset().mockImplementation(() => ({
    select: () => ({
      eq: async () => ({ data: [{ id: "a1" }, { id: "a2" }], error: null }),
    }),
  }));
  mocks.sincronizar.mockReset().mockResolvedValue({ ok: true });
  mocks.toast.mockReset();
  vi.stubGlobal("confirm", vi.fn(() => true));
  useAppStore.setState({
    imoveis: [imovel("i1"), imovel("i2")],
    agenda: [compromisso("a1", "i1"), compromisso("a2", "i1", true), compromisso("a3", "i2")],
  });
});

describe("exclusão transacional de imóvel", () => {
  it("exclui agenda e lembrete vinculados, remove envios pendentes e não os traz no reload", async () => {
    const banco = {
      imoveis: [{ id: "i1" }, { id: "i2" }],
      agenda: [{ id: "a1", imovel_id: "i1" }, { id: "a2", imovel_id: "i1" }, { id: "a3", imovel_id: "i2" }],
      mensagens: [
        { id: "m1", imovel_id: "i1", status: "agendada" },
        { id: "m2", imovel_id: "i1", status: "cancelada" },
        { id: "m3", imovel_id: "i1", status: "enviada" },
        { id: "m4", imovel_id: "i2", status: "agendada" },
      ] as Array<{ id: string; imovel_id: string | null; status: string }>,
    };
    mocks.rpc.mockImplementation(async (nome: string, params: { p_imovel_id: string }) => {
      expect(nome).toBe("excluir_imovel_com_dependencias");
      banco.mensagens = banco.mensagens.filter((m) =>
        m.imovel_id !== params.p_imovel_id || !["agendada", "processando"].includes(m.status),
      );
      banco.agenda = banco.agenda.filter((a) => a.imovel_id !== params.p_imovel_id);
      banco.imoveis = banco.imoveis.filter((i) => i.id !== params.p_imovel_id);
      // Efeito da FK somente nos registros terminais preservados como histórico.
      banco.mensagens.forEach((m) => { if (m.imovel_id === params.p_imovel_id) m.imovel_id = null; });
      return { data: { mensagens_excluidas: 1, compromissos_excluidos: 2 }, error: null };
    });

    await expect(excluirImovel("i1")).resolves.toBe(true);

    expect(mocks.from).toHaveBeenCalledWith("agenda");
    expect(mocks.sincronizar).toHaveBeenCalledWith("a1", "remover");
    expect(mocks.sincronizar).toHaveBeenCalledWith("a2", "remover");
    expect(useAppStore.getState().imoveis.map((i) => i.id)).toEqual(["i2"]);
    expect(useAppStore.getState().agenda.map((a) => a.id)).toEqual(["a3"]);

    // Simula as mesmas requisições feitas num reload: nada ativo ligado ao
    // imóvel excluído pode reaparecer nem ser reclamado pelo worker.
    expect(banco.imoveis.some((i) => i.id === "i1")).toBe(false);
    expect(banco.agenda.some((a) => a.imovel_id === "i1")).toBe(false);
    expect(banco.mensagens.some((m) => m.imovel_id === "i1")).toBe(false);
    expect(banco.mensagens.filter((m) => ["agendada", "processando"].includes(m.status)).map((m) => m.id)).toEqual(["m4"]);
    expect(banco.mensagens.find((m) => m.id === "m3")).toMatchObject({ status: "enviada", imovel_id: null });
  });

  it("compensa o Google e preserva banco e store quando a transação falha", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "falha simulada" } });

    await expect(excluirImovel("i1")).resolves.toBe(false);

    expect(mocks.rpc).toHaveBeenCalledOnce();
    expect(mocks.sincronizar).toHaveBeenCalledWith("a1", "remover");
    expect(mocks.sincronizar).toHaveBeenCalledWith("a2", "remover");
    expect(mocks.sincronizar).toHaveBeenCalledWith("a1");
    expect(mocks.sincronizar).toHaveBeenCalledWith("a2");
    expect(useAppStore.getState().imoveis.map((i) => i.id)).toEqual(["i1", "i2"]);
    expect(useAppStore.getState().agenda.map((a) => a.id)).toEqual(["a1", "a2", "a3"]);
    expect(mocks.toast).toHaveBeenCalledWith("Não foi possível excluir: falha simulada", "error");
  });

  it("não inicia efeitos parciais quando a reconsulta da agenda falha", async () => {
    mocks.from.mockReturnValue({
      select: () => ({ eq: async () => ({ data: null, error: { message: "agenda indisponível" } }) }),
    });

    await expect(excluirImovel("i1")).resolves.toBe(false);

    expect(mocks.sincronizar).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
    expect(useAppStore.getState().imoveis.map((i) => i.id)).toEqual(["i1", "i2"]);
    expect(mocks.toast).toHaveBeenCalledWith(
      "Não foi possível consultar os compromissos: agenda indisponível",
      "error",
    );
  });

  it("trata a ausência normal de conexão com o Google sem falso alerta", async () => {
    mocks.sincronizar.mockResolvedValue({ ok: false, falha: "sem-conexao-google" });
    mocks.rpc.mockResolvedValue({ data: { mensagens_excluidas: 0, compromissos_excluidos: 2 }, error: null });

    await expect(excluirImovel("i1")).resolves.toBe(true);

    expect(mocks.toast).toHaveBeenLastCalledWith("Imóvel excluído.");
  });
});

describe("contrato SQL e worker", () => {
  it("mantém cancelamento, agenda e imóvel na mesma função protegida pelo dono", () => {
    const inicio = SCHEMA.indexOf("create or replace function excluir_imovel_com_dependencias");
    const fim = SCHEMA.indexOf("$$;", inicio);
    const funcao = SCHEMA.slice(inicio, fim);
    expect(funcao).toContain("security definer");
    expect(funcao).toContain("set search_path = ''");
    expect(funcao).toContain("auth.uid()");
    expect(funcao).toContain("delete from public.mensagens_agendadas");
    expect(funcao).toContain("status in ('agendada', 'processando')");
    expect(funcao).toContain("for update");
    expect(funcao).toContain("status = 'processando'");
    expect(funcao).toContain("Há uma mensagem em processamento");
    expect(funcao).toContain("status = 'agendada'");
    expect(funcao.indexOf("delete from public.mensagens_agendadas")).toBeLessThan(funcao.indexOf("delete from public.agenda"));
    expect(funcao.indexOf("delete from public.agenda")).toBeLessThan(funcao.indexOf("delete from public.imoveis"));
    expect(SCHEMA).toContain("grant execute on function excluir_imovel_com_dependencias(uuid) to authenticated");
  });

  it("relê a mensagem antes do efeito externo para descartar item removido da fila", () => {
    expect(WORKER).toContain('.select("status, imovel_id")');
    expect(WORKER).toContain('mensagemAtual?.status !== "processando"');
    expect(WORKER.indexOf('.select("status, imovel_id")')).toBeLessThan(WORKER.indexOf("enviarMensagemAgendada("));
  });

  it("declara grants mínimos sem abrir tabelas internas ao cliente", () => {
    expect(SCHEMA).toContain("from public, anon, authenticated, service_role");
    expect(SCHEMA).toContain("grant select, insert, update on table mensagens_agendadas to authenticated");
    expect(SCHEMA).not.toContain("grant select, insert, update, delete on table mensagens_agendadas to authenticated");
    expect(SCHEMA).toContain("grant select, insert, update, delete on table\n  imoveis, mensagens_agendadas");
    expect(SCHEMA).not.toMatch(/grant\s+(?:all|truncate|references|trigger)\b[^;]*\bto service_role/);
    for (const tabela of ["whatsapp_instancias", "google_contas", "admins", "ia_uso", "log_eventos"]) {
      expect(SCHEMA).not.toContain(`on table ${tabela} to authenticated`);
    }
  });
});
