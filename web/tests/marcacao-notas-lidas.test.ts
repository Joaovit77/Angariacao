import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ehNotaDeEvento, ehNotaDeResposta, notaDaMensagemEnviada } from "@/lib/calculo/notas";
import { conversasDosImoveis } from "@/lib/calculo/conversas";
import type { Imovel, NotaImovel } from "@/lib/tipos";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("@/lib/persistencia/supabase", () => ({
  getSupabase: () => ({ rpc: mocks.rpc }),
}));
vi.mock("@/lib/toast", () => ({ toast: mocks.toast }));

import {
  marcarEventosLidos,
  marcarRespostasLidas,
  marcarTodasRespostasLidas,
} from "@/lib/mutacoes";
import { useAppStore } from "@/lib/store";
import { useUiModal } from "@/lib/uiModal";

const SCHEMA = readFileSync(new URL("../../supabase-schema.sql", import.meta.url), "utf8");
const MUTACOES = readFileSync(new URL("../lib/mutacoes.ts", import.meta.url), "utf8");
const CENTRAL = readFileSync(
  new URL("../components/respostas/CentralMensagensView.tsx", import.meta.url),
  "utf8",
);
const MODAL_WHATSAPP = readFileSync(
  new URL("../components/modais/ModalWhatsapp.tsx", import.meta.url),
  "utf8",
);

function recebida(id: string, texto: string, data: string, lida?: true): NotaImovel {
  return {
    id: `wa:${id}`,
    texto: `Resposta pelo WhatsApp: ${texto}`,
    data,
    direcao: "recebida",
    autor: "proprietario",
    origem: "webhook-evolution",
    ...(lida ? { lida } : {}),
  };
}

function enviada(id: string, texto: string, data: string): NotaImovel {
  return notaDaMensagemEnviada(id, texto, data, "api-evolution");
}

function evento(id: string, texto: string, lida?: true): NotaImovel {
  return {
    id: `sophia:${id}`,
    texto,
    data: "2026-08-26T09:00:00",
    ...(lida ? { lida } : {}),
  };
}

function imovel(id: string, notas: NotaImovel[]): Imovel {
  return { id, endereco: `Rua ${id}`, status: "Em negociação", notas };
}

interface LinhaBanco {
  id: string;
  userId: string;
  notas: NotaImovel[];
}

let usuarioAutenticado: string;
let banco: LinhaBanco[];

function instalarRpcAtomica(): void {
  mocks.rpc.mockImplementation(async (
    nome: string,
    parametros: { p_imovel_id: string; p_classe: "resposta" | "evento" },
  ) => {
    expect(nome).toBe("marcar_notas_imovel_lidas");
    const linha = banco.find(
      (item) => item.id === parametros.p_imovel_id && item.userId === usuarioAutenticado,
    );
    if (!linha) {
      return {
        data: { encontrado: false, alteradas: 0, notas: null },
        error: null,
      };
    }

    // Simula a função do banco: ela transforma o valor atual da linha, não o
    // snapshot que está no Zustand.
    const corresponde = parametros.p_classe === "resposta" ? ehNotaDeResposta : ehNotaDeEvento;
    let alteradas = 0;
    linha.notas = linha.notas.map((nota) => {
      if (!corresponde(nota) || nota.lida === true) return nota;
      alteradas += 1;
      return { ...nota, lida: true };
    });
    return {
      data: {
        encontrado: true,
        alteradas,
        notas: structuredClone(linha.notas),
      },
      error: null,
    };
  });
}

beforeEach(() => {
  usuarioAutenticado = "usuario-a";
  banco = [];
  mocks.rpc.mockReset();
  mocks.toast.mockReset();
  useAppStore.getState().limparEstado();
  useUiModal.getState().fecharModal();
  instalarRpcAtomica();
});

describe("marcação atômica das respostas", () => {
  it("preserva a mensagem das 09:04 registrada depois do snapshot local", async () => {
    const historicoDoStore = [
      enviada("0815", "Bom dia, podemos conversar?", "2026-08-26T08:15:00"),
      recebida("0816", "Sim, podemos", "2026-08-26T08:16:00"),
    ];
    const mensagemNova = enviada("0904", "Ótimo, explico por aqui.", "2026-08-26T09:04:00");
    useAppStore.setState({ imoveis: [imovel("imovel-1", historicoDoStore)] });
    banco = [{
      id: "imovel-1",
      userId: usuarioAutenticado,
      notas: [...historicoDoStore, mensagemNova],
    }];

    await expect(marcarRespostasLidas("imovel-1", true)).resolves.toBe(true);

    const notasBanco = banco[0].notas;
    const notasStore = useAppStore.getState().imoveis[0].notas || [];
    expect(notasBanco.map((nota) => nota.id)).toEqual([
      "wa-enviada:0815",
      "wa:0816",
      "wa-enviada:0904",
    ]);
    expect(notasBanco.find((nota) => nota.id === "wa:0816")?.lida).toBe(true);
    expect(notasStore).toEqual(notasBanco);
    expect(conversasDosImoveis(useAppStore.getState().imoveis, "2026-08-26")[0].naoLidas).toBe(0);
  });

  it("preserva uma mensagem do webhook concorrente e marca duas respostas pendentes", async () => {
    const antiga = recebida("1", "Primeira", "2026-08-26T09:00:00");
    const concorrente = recebida("2", "Segunda", "2026-08-26T09:00:01");
    useAppStore.setState({ imoveis: [imovel("imovel-1", [antiga])] });
    banco = [{ id: "imovel-1", userId: usuarioAutenticado, notas: [antiga, concorrente] }];

    await marcarRespostasLidas("imovel-1", true);

    expect(banco[0].notas).toHaveLength(2);
    expect(banco[0].notas.every((nota) => nota.lida === true)).toBe(true);
    expect(useAppStore.getState().imoveis[0].notas).toEqual(banco[0].notas);
  });

  it("é idempotente quando chamada repetidamente e quando não há pendência", async () => {
    const notas = [
      enviada("1", "Mensagem", "2026-08-26T09:00:00"),
      recebida("2", "Já lida", "2026-08-26T09:01:00", true),
    ];
    useAppStore.setState({ imoveis: [imovel("imovel-1", notas)] });
    banco = [{ id: "imovel-1", userId: usuarioAutenticado, notas }];

    await expect(marcarRespostasLidas("imovel-1", true)).resolves.toBe(true);
    const depoisDaPrimeira = structuredClone(banco[0].notas);
    await expect(marcarRespostasLidas("imovel-1", true)).resolves.toBe(true);

    expect(banco[0].notas).toEqual(depoisDaPrimeira);
    await expect(marcarTodasRespostasLidas(["imovel-1"])).resolves.toBe(0);
  });

  it("não alcança imóvel de outro user_id", async () => {
    const nota = recebida("1", "Privada", "2026-08-26T09:00:00");
    useAppStore.setState({ imoveis: [imovel("imovel-b", [nota])] });
    banco = [{ id: "imovel-b", userId: "usuario-b", notas: [nota] }];

    await expect(marcarRespostasLidas("imovel-b", true)).resolves.toBe(false);

    expect(banco[0].notas[0].lida).toBeUndefined();
    expect(useAppStore.getState().imoveis[0].notas?.[0].lida).toBeUndefined();
  });

  it("não perde nota que o Realtime entrega antes de a RPC responder", async () => {
    const pendente = recebida("1", "Pendente", "2026-08-26T09:00:00");
    const posterior = recebida("2", "Cheguei depois do lock", "2026-08-26T09:00:02");
    useAppStore.setState({ imoveis: [imovel("imovel-1", [pendente])] });
    banco = [{ id: "imovel-1", userId: usuarioAutenticado, notas: [pendente] }];
    instalarRpcAtomica();
    const rpcBanco = mocks.rpc.getMockImplementation()!;
    mocks.rpc.mockImplementationOnce(async (...args: unknown[]) => {
      const resposta = await rpcBanco(...args);
      useAppStore.setState({ imoveis: [imovel("imovel-1", [pendente, posterior])] });
      return resposta;
    });

    await marcarRespostasLidas("imovel-1", true);

    expect(useAppStore.getState().imoveis[0].notas).toEqual([
      { ...pendente, lida: true },
      posterior,
    ]);
  });
});

describe("operações irmãs e contratos", () => {
  it("marca eventos pelo mesmo caminho atômico sem marcar respostas", async () => {
    const notas = [evento("1", "Comissão recebida"), recebida("2", "Obrigado", "2026-08-26T09:01:00")];
    useAppStore.setState({ imoveis: [imovel("imovel-1", notas)] });
    banco = [{ id: "imovel-1", userId: usuarioAutenticado, notas }];

    await expect(marcarEventosLidos("imovel-1")).resolves.toBe(1);

    expect(banco[0].notas[0].lida).toBe(true);
    expect(banco[0].notas[1].lida).toBeUndefined();
  });

  it("mantém IA e digitação manual no mesmo compositor e persistência de envio", () => {
    const compositor = CENTRAL.slice(CENTRAL.indexOf("function Compositor"));
    expect(compositor).toContain("const mensagem = texto.trim()");
    expect(compositor).toContain("await enviarWhatsapp(imovel.id, mensagem)");
    expect(compositor).toContain("setTexto(resultado.rascunho)");
    expect(compositor.match(/enviarWhatsapp\(imovel\.id, mensagem\)/g)).toHaveLength(1);
  });

  it("leva a origem de resposta ao modal e só limpa a pendência após envio confirmado", () => {
    useUiModal.getState().abrirWhatsappRascunho("imovel-1", "Vou verificar", ["Atendimento"]);
    expect(useUiModal.getState().modal).toMatchObject({
      tipo: "whatsapp",
      id: "imovel-1",
      textoWhatsapp: "Vou verificar",
      marcarRespostasLidasAposEnvio: true,
    });

    useUiModal.getState().abrirWhatsappModeloResposta("imovel-1", "resposta-aguardo");
    expect(useUiModal.getState().modal).toMatchObject({
      modeloWhatsapp: "resposta-aguardo",
      marcarRespostasLidasAposEnvio: true,
    });

    useUiModal.getState().abrirModal("whatsapp", "imovel-1", "primeiro-contato");
    expect(useUiModal.getState().modal?.marcarRespostasLidasAposEnvio).toBeUndefined();

    const envioConfirmado = MODAL_WHATSAPP.slice(
      MODAL_WHATSAPP.indexOf("async function enviarAgora"),
      MODAL_WHATSAPP.indexOf("/** Saída antiga", MODAL_WHATSAPP.indexOf("async function enviarAgora")),
    );
    expect(envioConfirmado.indexOf("if (r.ok)")).toBeLessThan(
      envioConfirmado.indexOf("await marcarRespostasLidas(imovel.id, true)"),
    );

    const envioManual = MODAL_WHATSAPP.slice(
      MODAL_WHATSAPP.indexOf("async function confirmarEnvioManual"),
      MODAL_WHATSAPP.indexOf("/** Insere um marcador", MODAL_WHATSAPP.indexOf("async function confirmarEnvioManual")),
    );
    expect(envioManual.indexOf("if (!historicoOk) return")).toBeLessThan(
      envioManual.indexOf("await marcarRespostasLidas(imovel.id, true)"),
    );
  });

  it("protege a transformação SQL por usuário e lock da linha", () => {
    const inicio = SCHEMA.indexOf("create or replace function marcar_notas_imovel_lidas");
    const fim = SCHEMA.indexOf("revoke all on function marcar_notas_imovel_lidas", inicio);
    const funcao = SCHEMA.slice(inicio, fim);
    expect(funcao).toContain("security invoker");
    expect(funcao).toContain("set search_path = ''");
    expect(funcao).toContain("i.user_id = (select auth.uid())");
    expect(funcao).toContain("for update");
    expect(funcao).toContain("jsonb_array_elements(v_notas_atuais)");
    expect(funcao).toContain("jsonb_set(item.nota, '{lida}', 'true'::jsonb, true)");
    expect(funcao).not.toContain("p_user_id");
    expect(SCHEMA).toContain(
      "revoke all on function marcar_notas_imovel_lidas(uuid, text) from public, anon, authenticated, service_role",
    );
    expect(SCHEMA).toContain(
      "grant execute on function marcar_notas_imovel_lidas(uuid, text) to authenticated",
    );
  });

  it("o cliente não regrava mais o array nas três marcações", () => {
    const inicio = MUTACOES.indexOf("type ClasseNotaLida");
    const fim = MUTACOES.indexOf("export async function excluirNotaImovel", inicio);
    const marcacoes = MUTACOES.slice(inicio, fim);
    expect(marcacoes).toContain('.rpc("marcar_notas_imovel_lidas"');
    expect(marcacoes).not.toContain('.update({ notas:');
  });
});
