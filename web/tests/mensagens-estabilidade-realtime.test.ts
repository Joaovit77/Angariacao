import { describe, expect, it } from "vitest";
import {
  contagensConversas,
  conversasDosImoveis,
  filtrarConversas,
  type FiltrosConversas,
} from "@/lib/calculo/conversas";
import {
  conversaSelecionadaEstavel,
  deveAplicarVersaoRealtime,
  linhaRealtimeSuficiente,
  reconciliarImovelRealtime,
} from "@/lib/calculo/estabilidadeMensagens";
import { toDbImovel } from "@/lib/persistencia/mapeadores";
import type { Imovel, NotaImovel } from "@/lib/tipos";

const HOJE = "2026-09-06";
const USUARIO = "usuario-a";
const TODAS: FiltrosConversas = { principal: "todas", naoLidas: false, agendadas: false };

function mensagem(id: string, minuto: number, lida = false): NotaImovel {
  return {
    id: `wa:${id}`,
    texto: `Resposta pelo WhatsApp: mensagem ${id}`,
    data: `2026-09-06T10:${String(minuto).padStart(2, "0")}:00.000Z`,
    direcao: "recebida",
    tipo: "conversation",
    lida,
  };
}

function imovel(id: string, minuto: number, extra: Partial<Imovel> = {}): Imovel {
  return {
    id,
    codigo: `LD-${id.toUpperCase()}`,
    endereco: `Rua ${id.toUpperCase()}`,
    bairro: "Centro",
    proprietarioNome: `Contato ${id.toUpperCase()}`,
    proprietarioTelefone: "5511999999999",
    responsavel: "Atendimento",
    status: "Em negociação",
    notas: [mensagem(`${id}-inicial`, minuto)],
    tentativas: [],
    statusHistory: [],
    ...extra,
  };
}

describe("estabilidade da Central de Mensagens no Realtime", () => {
  it("mantém e atualiza a conversa selecionada quando chega mensagem nela", () => {
    const a = imovel("a", 10);
    const b = imovel("b", 9);
    const c = imovel("c", 8);
    const conversaAnterior = conversasDosImoveis([a, b, c], HOJE)[0];
    const novaMensagem = mensagem("a-nova", 20);
    const aAtualizado = reconciliarImovelRealtime(
      a,
      { id: a.id, notas: [...(a.notas || []), novaMensagem], updated_at: "2026-09-06T10:20:00Z" },
      USUARIO,
    );

    const imoveis = [aAtualizado, b, c];
    const conversas = conversasDosImoveis(imoveis, HOJE);
    const selecionada = conversaSelecionadaEstavel(
      conversas,
      conversas,
      a.id,
      conversaAnterior,
      imoveis,
    );

    expect(conversas.map((item) => item.imovel.id)).toEqual(["a", "b", "c"]);
    expect(selecionada?.imovel.id).toBe("a");
    expect(selecionada?.ultima.id).toBe(novaMensagem.id);
    expect(selecionada?.ultima.data).toBe(novaMensagem.data);
  });

  it("faz merge de payload parcial sem apagar campos nem a conversa", () => {
    const a = imovel("a", 10);
    const parcial = {
      id: a.id,
      responsavel: "Novo responsável",
      updated_at: "2026-09-06T10:15:00Z",
    };

    expect(linhaRealtimeSuficiente(parcial)).toBe(false);
    expect(linhaRealtimeSuficiente(toDbImovel(a, USUARIO))).toBe(true);
    const atualizado = reconciliarImovelRealtime(a, parcial, USUARIO);

    expect(atualizado.notas).toEqual(a.notas);
    expect(atualizado.proprietarioNome).toBe(a.proprietarioNome);
    expect(atualizado.endereco).toBe(a.endereco);
    expect(atualizado.responsavel).toBe("Novo responsável");
    expect(conversasDosImoveis([atualizado], HOJE)).toHaveLength(1);
  });

  it("impede que uma resposta antiga de atualização vença a mais nova", () => {
    expect(
      deveAplicarVersaoRealtime(
        "2026-09-06T10:20:00.000Z",
        "2026-09-06T10:19:59.000Z",
      ),
    ).toBe(false);
    expect(
      deveAplicarVersaoRealtime(
        "2026-09-06T10:20:00.000Z",
        "2026-09-06T10:20:00.000Z",
      ),
    ).toBe(true);
    expect(
      deveAplicarVersaoRealtime(
        "2026-09-06T10:20:00+00:00",
        "2026-09-06T10:20:00.000Z",
      ),
    ).toBe(true);

    let estado = "inicial";
    if (deveAplicarVersaoRealtime(undefined, "2026-09-06T10:20:00.000Z")) {
      estado = "novo";
    }
    if (
      deveAplicarVersaoRealtime(
        "2026-09-06T10:20:00.000Z",
        "2026-09-06T10:19:59.000Z",
      )
    ) {
      estado = "antigo";
    }
    expect(estado).toBe("novo");
  });

  it("reordena outra conversa sem trocar a seleção atual", () => {
    const a = imovel("a", 10);
    const b = imovel("b", 9);
    const conversaA = conversasDosImoveis([a, b], HOJE).find((item) => item.imovel.id === "a")!;
    const bAtualizado = reconciliarImovelRealtime(
      b,
      { id: b.id, notas: [...(b.notas || []), mensagem("b-nova", 30)] },
      USUARIO,
    );
    const imoveis = [a, bAtualizado];
    const conversas = conversasDosImoveis(imoveis, HOJE);

    expect(conversas.map((item) => item.imovel.id)).toEqual(["b", "a"]);
    expect(
      conversaSelecionadaEstavel(conversas, conversas, a.id, conversaA, imoveis)?.imovel.id,
    ).toBe("a");
  });

  it("mantém a saída legítima do filtro operacional", () => {
    const a = imovel("a", 10);
    const encerrado = reconciliarImovelRealtime(a, { id: a.id, status: "Locado" }, USUARIO);
    const conversas = conversasDosImoveis([encerrado], HOJE);
    const emAndamento = filtrarConversas(
      conversas,
      "",
      { ...TODAS, principal: "em-andamento" },
    );

    expect(conversas).toHaveLength(1);
    expect(emAndamento).toEqual([]);
  });

  it("só escolhe fallback quando a conversa selecionada foi realmente removida", () => {
    const a = imovel("a", 10);
    const b = imovel("b", 9);
    const conversasAntes = conversasDosImoveis([a, b], HOJE);
    const conversaA = conversasAntes.find((item) => item.imovel.id === "a")!;
    const conversasDepois = conversasDosImoveis([b], HOJE);

    expect(
      conversaSelecionadaEstavel(conversasDepois, conversasDepois, a.id, conversaA, [b])
        ?.imovel.id,
    ).toBe("b");
  });

  it("não oscila os contadores em uma atualização simples", () => {
    const a = imovel("a", 10);
    const b = imovel("b", 9);
    const antes = conversasDosImoveis([a, b], HOJE);
    const atualizado = reconciliarImovelRealtime(
      a,
      { id: a.id, responsavel: "Outro atendimento" },
      USUARIO,
    );
    const depois = conversasDosImoveis([atualizado, b], HOJE);

    expect(contagensConversas(depois, "", TODAS)).toEqual(
      contagensConversas(antes, "", TODAS),
    );
    expect(contagensConversas(depois, "", TODAS)).toMatchObject({
      todas: 2,
      emAndamento: 2,
    });
  });

  it("preserva null explícito, distinguindo ausência de remoção intencional", () => {
    const a = imovel("a", 10, { responsavel: "Atendimento" });
    const atualizado = reconciliarImovelRealtime(a, { id: a.id, responsavel: null }, USUARIO);
    expect(atualizado.responsavel).toBe("");
    expect(atualizado.notas).toEqual(a.notas);
  });
});
