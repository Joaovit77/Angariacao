import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Imovel, NotaImovel, Tentativa } from "@/lib/tipos";
import {
  imovelElegivelParaSemResposta,
  motivoInelegibilidadeSemResposta,
} from "@/lib/calculo/statusSemResposta";
import {
  normalizarAcao,
  prepararAlteracaoStatusSemResposta,
} from "@/lib/servidor/assistente/acoes";
import { textoResultadoConfirmacao } from "@/lib/assistente/confirmacao";
import AcaoAssistenteCard from "@/components/assistente/AcaoAssistenteCard";

const ACAO_ID = "11111111-1111-4111-8111-111111111111";
const SESSAO_ID = "44444444-4444-4444-8444-444444444444";
const IMOVEL_1 = "22222222-2222-4222-8222-222222222222";
const IMOVEL_2 = "33333333-3333-4333-8333-333333333333";

function tentativa(indice: number, resultado: Tentativa["resultado"] = "sem-resposta"): Tentativa {
  return {
    id: `tentativa-${indice}`,
    data: `2026-08-${String(10 + indice).padStart(2, "0")}T10:00`,
    canal: "WhatsApp",
    abordagemId: null,
    resultado,
  };
}

function imovel(
  quantidade: number,
  opcoes: Partial<Imovel> = {},
): Imovel {
  return {
    id: IMOVEL_1,
    codigo: "LD-301",
    endereco: "Rua das Flores, 10",
    bairro: "Centro",
    status: "Novo contato",
    tentativas: Array.from({ length: quantidade }, (_, indice) => tentativa(indice)),
    notas: [],
    statusHistory: [],
    ...opcoes,
  } as Imovel;
}

function respostaRecebida(): NotaImovel {
  return {
    id: "wa:mensagem-1",
    data: "2026-08-20T11:00",
    texto: "Resposta pelo WhatsApp: Podemos conversar.",
    direcao: "recebida",
    autor: "proprietario",
    tipo: "conversation",
  };
}

function acaoStatus(estado: "ready_for_confirmation" | "succeeded" = "ready_for_confirmation") {
  return {
    id: ACAO_ID,
    tipo: "alterar_status_sem_resposta_em_lote",
    estado,
    expiraEm: "2099-08-28T15:00:00.000Z",
    operacao: "Alterar status em lote",
    impacto: "2 imóveis terão o status alterado para Sem resposta.",
    entidade: {
      imoveis: [
        { id: IMOVEL_1, codigo: "LD-301", endereco: "Rua A, 1", statusPreparado: "Novo contato", tentativas: 3 },
        { id: IMOVEL_2, codigo: "LD-302", endereco: "Rua B, 2", statusPreparado: "Novo contato", tentativas: 4 },
      ],
    },
    dados: { statusDestino: "Sem resposta", quantidade: 2 },
    ...(estado === "succeeded" ? {
      resultado: {
        alterados: [{ id: IMOVEL_1, codigo: "LD-301" }],
        ignorados: [{ id: IMOVEL_2, codigo: "LD-302", motivo: "status_alterado" }],
        totalAlterados: 1,
        totalIgnorados: 1,
      },
    } : {}),
  };
}

describe("elegibilidade para Sem resposta", () => {
  it("não inclui imóvel com 2 tentativas", () => {
    expect(imovelElegivelParaSemResposta(imovel(2))).toBe(false);
  });

  it("inclui imóvel com exatamente 3 tentativas e nenhuma resposta", () => {
    expect(imovelElegivelParaSemResposta(imovel(3))).toBe(true);
  });

  it("inclui imóvel com 4 tentativas e nenhuma resposta", () => {
    expect(imovelElegivelParaSemResposta(imovel(4))).toBe(true);
  });

  it("não inclui imóvel quando o proprietário respondeu depois das 3 tentativas", () => {
    expect(motivoInelegibilidadeSemResposta(imovel(3, { notas: [respostaRecebida()] }))).toBe("houve_resposta");
  });

  it("não inclui resposta registrada no resultado de uma tentativa", () => {
    const tentativas = [tentativa(0), tentativa(1), tentativa(2, "respondeu")];
    expect(motivoInelegibilidadeSemResposta(imovel(3, { tentativas }))).toBe("houve_resposta");
  });

  it.each(["Angariado", "Publicado", "Locado", "Perdido", "Cancelado"])(
    "não inclui status incompatível: %s",
    (status) => expect(motivoInelegibilidadeSemResposta(imovel(3, { status }))).toBe("status_incompativel"),
  );
});

describe("ação confirmável de status", () => {
  it("prepara pelo RPC dedicado sem executar confirmação", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: { ok: true, acao: acaoStatus() }, error: null });
    const resultado = await prepararAlteracaoStatusSemResposta({ rpc } as never, { sessaoId: SESSAO_ID });

    expect(resultado).toMatchObject({ ok: true, acao: { estado: "ready_for_confirmation", dados: { quantidade: 2 } } });
    expect(rpc).toHaveBeenCalledWith("preparar_acao_assistente_status_sem_resposta", { p_sessao_id: SESSAO_ID });
    expect(rpc).not.toHaveBeenCalledWith("confirmar_acao_assistente", expect.anything());
  });

  it("diferencia visualmente o preview e expõe lista, confirmação e cancelamento", () => {
    const acao = normalizarAcao(acaoStatus())!;
    const html = renderToStaticMarkup(createElement(AcaoAssistenteCard, {
      acao,
      processando: false,
      aoConfirmar: () => undefined,
      aoCancelar: () => undefined,
    }));

    expect(html).toContain("Confirmação necessária");
    expect(html).toContain("Ver 2 imóveis");
    expect(html).toContain("LD-301");
    expect(html).toContain("Confirmar");
    expect(html).toContain("Cancelar");
    expect(html).not.toContain("Nenhuma alteração");
  });

  it("mostra no card quais imóveis foram ignorados na execução parcial", () => {
    const acao = normalizarAcao(acaoStatus("succeeded"))!;
    const html = renderToStaticMarkup(createElement(AcaoAssistenteCard, {
      acao,
      processando: false,
      aoConfirmar: () => undefined,
      aoCancelar: () => undefined,
    }));

    expect(html).toContain("Alteração concluída");
    expect(html).toContain("1 alterado");
    expect(html).toContain("1 não alterado");
    expect(html).toContain("status alterado após a preparação");
  });

  it("normaliza execução parcial e informa o resultado real", () => {
    const acao = normalizarAcao(acaoStatus("succeeded"));
    expect(acao).toMatchObject({
      tipo: "alterar_status_sem_resposta_em_lote",
      resultado: { totalAlterados: 1, totalIgnorados: 1 },
    });
    expect(textoResultadoConfirmacao(acao!)).toContain("1 imóvel foi alterado");
    expect(textoResultadoConfirmacao(acao!)).toContain("1 imóvel não foi alterado");
  });

  it("mantém preparação, cancelamento e confirmação em fronteiras separadas", () => {
    const schema = readFileSync(join(process.cwd(), "..", "supabase-schema.sql"), "utf8");
    const preparacao = schema.slice(
      schema.indexOf("create or replace function preparar_acao_assistente_status_sem_resposta"),
      schema.indexOf("drop function if exists confirmar_acao_assistente"),
    );
    const confirmacao = schema.slice(
      schema.indexOf("create or replace function confirmar_acao_assistente"),
      schema.indexOf("create or replace function cancelar_acao_assistente"),
    );
    const cancelamento = schema.slice(
      schema.indexOf("create or replace function cancelar_acao_assistente"),
      schema.indexOf("revoke all on function preparar_acao_assistente_agendar_visita"),
    );

    expect(preparacao).toContain("insert into public.assistente_acoes");
    expect(preparacao).not.toContain("set status = 'Sem resposta'");
    expect(cancelamento).not.toContain("update public.imoveis");
    expect(confirmacao).toContain("private.imovel_elegivel_status_sem_resposta(v_imovel)");
    expect(confirmacao).toContain("set status = 'Sem resposta'");
    expect(confirmacao).toContain("'status_alterado'");
    expect(confirmacao).toContain("'nao_elegivel'");
    expect(confirmacao).toContain("'totalAlterados'");
  });

  it("confirma somente a ação congelada, do mesmo usuário e da mesma sessão", () => {
    const schema = readFileSync(join(process.cwd(), "..", "supabase-schema.sql"), "utf8");
    const confirmacao = schema.slice(
      schema.indexOf("create or replace function confirmar_acao_assistente"),
      schema.indexOf("create or replace function cancelar_acao_assistente"),
    );
    expect(confirmacao).toContain("a.id = p_acao_id and a.user_id = v_user and a.sessao_id = p_sessao_id");
    expect(confirmacao).toContain("jsonb_array_elements(v_acao.payload->'imoveis')");
    expect(confirmacao).not.toContain("p_imoveis");
  });
});
