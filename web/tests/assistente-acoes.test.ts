import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  cancelarAcaoAssistente,
  confirmarAcaoAssistente,
  executarPreparacaoCriacaoCompromisso,
  normalizarAcao,
  prepararAgendamentoVisita,
  prepararCriacaoCompromisso,
  prepararRascunhoResposta,
  validarParametrosAgendarVisita,
  validarParametrosCriarCompromisso,
} from "@/lib/servidor/assistente/acoes";
import { acaoPendenteMaisRecente, classificarDecisaoTextual } from "@/lib/assistente/confirmacao";

const ACAO_ID = "11111111-1111-4111-8111-111111111111";
const IMOVEL_ID = "22222222-2222-4222-8222-222222222222";
const AGENDA_ID = "33333333-3333-4333-8333-333333333333";
const SESSAO_ID = "44444444-4444-4444-8444-444444444444";

function acao(estado = "ready_for_confirmation") {
  return {
    id: ACAO_ID,
    tipo: "agendar_visita",
    estado,
    expiraEm: "2099-08-27T15:15:00.000Z",
    operacao: "Agendar visita",
    impacto: "Será criado um compromisso real na agenda.",
    entidade: {
      imovelId: IMOVEL_ID,
      codigo: "LD-152",
      endereco: "Rua São Caetano do Sul, 67",
      responsavel: "João",
    },
    dados: { data: "2099-08-28", hora: "15:00" },
    resultado: estado === "succeeded" ? { agendaId: AGENDA_ID } : null,
  };
}

function compromisso(estado = "ready_for_confirmation") {
  return {
    id: ACAO_ID,
    tipo: "criar_compromisso",
    estado,
    expiraEm: "2099-08-27T15:15:00.000Z",
    operacao: "Criar compromisso",
    impacto: "Será criado um compromisso real na agenda.",
    entidade: { imovelId: null, codigo: null, endereco: null, responsavel: null },
    dados: {
      titulo: "Reunião de alinhamento",
      tipo: "Reunião",
      data: "2099-08-31",
      hora: "11:00",
      observacao: null,
    },
    resultado: estado === "succeeded" ? { agendaId: AGENDA_ID } : null,
  };
}

function clienteRpc(resposta: unknown) {
  const rpc = vi.fn().mockResolvedValue({ data: resposta, error: null });
  return { cliente: { rpc } as never, rpc };
}

describe("ações tipadas do Assistente", () => {
  it("prepara sem inserir na agenda e congela parâmetros pelo RPC dedicado", async () => {
    const { cliente, rpc } = clienteRpc({ ok: true, acao: acao() });
    const resultado = await prepararAgendamentoVisita(cliente, {
      imovelId: IMOVEL_ID,
      data: "2099-08-28",
      hora: "15:00",
      sessaoId: SESSAO_ID,
    });

    expect(resultado).toMatchObject({ ok: true, acao: { estado: "ready_for_confirmation" } });
    expect(rpc).toHaveBeenCalledWith("preparar_acao_assistente_agendar_visita", {
      p_imovel_id: IMOVEL_ID,
      p_data: "2099-08-28",
      p_hora: "15:00",
      p_sessao_id: SESSAO_ID,
    });
  });

  it("confirma e cancela enviando somente o id da ação congelada e da sessão atual", async () => {
    const confirmacao = clienteRpc({ ok: true, acao: acao("succeeded") });
    await expect(confirmarAcaoAssistente(confirmacao.cliente, ACAO_ID, SESSAO_ID)).resolves.toMatchObject({
      ok: true,
      acao: { estado: "succeeded", resultado: { agendaId: AGENDA_ID } },
    });
    expect(confirmacao.rpc).toHaveBeenCalledWith("confirmar_acao_assistente", { p_acao_id: ACAO_ID, p_sessao_id: SESSAO_ID });

    const cancelamento = clienteRpc({ ok: true, acao: acao("cancelled") });
    await expect(cancelarAcaoAssistente(cancelamento.cliente, ACAO_ID, SESSAO_ID)).resolves.toMatchObject({
      ok: true,
      acao: { estado: "cancelled" },
    });
    expect(cancelamento.rpc).toHaveBeenCalledWith("cancelar_acao_assistente", { p_acao_id: ACAO_ID, p_sessao_id: SESSAO_ID });
  });

  it("prepara compromisso genérico sem inventar vínculo ou observação", async () => {
    const { cliente, rpc } = clienteRpc({ ok: true, acao: compromisso() });
    const resultado = await prepararCriacaoCompromisso(cliente, {
      titulo: " Reunião de alinhamento ",
      tipo: "Reunião",
      data: "2099-08-31",
      hora: "11:00",
      imovelId: null,
      observacao: null,
      sessaoId: SESSAO_ID,
    });

    expect(resultado).toMatchObject({
      ok: true,
      acao: { tipo: "criar_compromisso", dados: { titulo: "Reunião de alinhamento", hora: "11:00" } },
    });
    expect(rpc).toHaveBeenCalledWith("preparar_acao_assistente_criar_compromisso", {
      p_titulo: "Reunião de alinhamento",
      p_tipo: "Reunião",
      p_data: "2099-08-31",
      p_hora: "11:00",
      p_imovel_id: null,
      p_observacao: null,
      p_sessao_id: SESSAO_ID,
    });
  });

  it("aceita horário opcional e rejeita obrigatórios ausentes ou data passada", () => {
    const base = { titulo: "Ligação", tipo: "Contato", data: "2099-08-31", hora: null, imovelId: null, observacao: null, sessaoId: SESSAO_ID };
    expect(validarParametrosCriarCompromisso(base)).toEqual({ ok: true });
    expect(validarParametrosCriarCompromisso({ ...base, titulo: "" })).toMatchObject({ ok: false, codigo: "titulo_invalido" });
    expect(validarParametrosCriarCompromisso({ ...base, tipo: "" })).toMatchObject({ ok: false, codigo: "tipo_invalido" });
    expect(validarParametrosCriarCompromisso({ ...base, data: "2020-01-01" })).toMatchObject({ ok: false, codigo: "data_invalida" });
    expect(validarParametrosCriarCompromisso({ ...base, data: "2099-02-31" })).toMatchObject({ ok: false, codigo: "data_invalida" });
  });

  it("não vincula automaticamente o imóvel visual a um compromisso genérico", async () => {
    const { cliente, rpc } = clienteRpc({ ok: true, acao: compromisso() });
    const resultado = await executarPreparacaoCriacaoCompromisso(
      {
        titulo: "Reunião de alinhamento",
        tipo_compromisso: "Reunião",
        data: "2099-08-31",
        hora: "11:00",
        imovel_codigo: null,
        imovel_id: null,
        observacao: null,
      },
      cliente,
      "user-1",
      { rota: "/pipeline", pagina: "Pipeline", superficie: "drawer", entidade: { tipo: "imovel", id: IMOVEL_ID } },
      SESSAO_ID,
    );

    expect(resultado).toMatchObject({ acao: { tipo: "criar_compromisso", entidade: { imovelId: null } } });
    expect(rpc).toHaveBeenCalledWith("preparar_acao_assistente_criar_compromisso", expect.objectContaining({ p_imovel_id: null }));
  });

  it("normaliza o compromisso tipado com imóvel opcional", () => {
    expect(normalizarAcao(compromisso())).toMatchObject({
      tipo: "criar_compromisso",
      entidade: { imovelId: null },
      dados: { titulo: "Reunião de alinhamento", tipo: "Reunião", hora: "11:00" },
    });
  });

  it("rejeita data passada, horário e ids inválidos antes de chamar o banco", () => {
    expect(validarParametrosAgendarVisita({ imovelId: IMOVEL_ID, data: "2020-01-01", hora: "15:00", sessaoId: SESSAO_ID })).toMatchObject({ ok: false, codigo: "data_invalida" });
    expect(validarParametrosAgendarVisita({ imovelId: IMOVEL_ID, data: "2099-08-28", hora: "25:00", sessaoId: SESSAO_ID })).toMatchObject({ ok: false, codigo: "hora_invalida" });
    expect(validarParametrosAgendarVisita({ imovelId: "outro", data: "2099-08-28", hora: "15:00", sessaoId: SESSAO_ID })).toMatchObject({ ok: false, codigo: "imovel_invalido" });
  });

  it("prepara um rascunho somente após reler uma conversa do usuário", async () => {
    const filtros: Array<[string, unknown]> = [];
    const query = {
      select: vi.fn(() => query),
      eq: vi.fn((campo: string, valor: unknown) => { filtros.push([campo, valor]); return query; }),
      ilike: vi.fn(() => query),
      maybeSingle: vi.fn().mockResolvedValue({
        data: {
          id: IMOVEL_ID,
          user_id: "user-1",
          codigo: "LD-152",
          endereco: "Rua São Caetano do Sul, 67",
          status: "Em negociação",
          proprietario_nome: "Marina",
          notas: [{
            id: "wa:1",
            texto: "Resposta pelo WhatsApp: Quero entender melhor a proposta.",
            data: "2026-08-27T10:00:00",
            direcao: "recebida",
            tipo: "conversation",
          }],
          tentativas: [],
          status_history: [],
        },
        error: null,
      }),
    };
    const cliente = { from: vi.fn(() => query) } as never;

    const resultado = await prepararRascunhoResposta(
      { imovel_codigo: null, imovel_id: IMOVEL_ID },
      cliente,
      "user-1",
      { rota: "/assistente", pagina: "Assistente", superficie: "pagina" },
    );

    expect(resultado).toMatchObject({
      dados: { preparada: true, envioExecutado: false, exigeRevisaoHumana: true },
      comandoUi: { tipo: "rascunhar_resposta", imovelId: IMOVEL_ID, codigo: "LD-152", proprietario: "Marina" },
    });
    expect(filtros).toEqual([["user_id", "user-1"], ["id", IMOVEL_ID]]);
  });

  it("não prepara resposta sem mensagem textual recebida", async () => {
    const query = {
      select: vi.fn(() => query),
      eq: vi.fn(() => query),
      ilike: vi.fn(() => query),
      maybeSingle: vi.fn().mockResolvedValue({
        data: { id: IMOVEL_ID, user_id: "user-1", codigo: "LD-152", status: "Em negociação", notas: [], tentativas: [], status_history: [] },
        error: null,
      }),
    };
    const resultado = await prepararRascunhoResposta(
      { imovel_codigo: null, imovel_id: IMOVEL_ID },
      { from: vi.fn(() => query) } as never,
      "user-1",
      { rota: "/assistente", pagina: "Assistente", superficie: "pagina" },
    );
    expect(resultado).toMatchObject({ dados: { preparada: false } });
    expect(resultado.comandoUi).toBeUndefined();
  });
});

describe("garantias estruturais no banco", () => {
  const schema = readFileSync(join(process.cwd(), "..", "supabase-schema.sql"), "utf8");
  const confirmacao = schema.slice(
    schema.indexOf("create or replace function confirmar_acao_assistente"),
    schema.indexOf("create or replace function cancelar_acao_assistente"),
  );

  it("bloqueia a ação por usuário e serializa confirmações concorrentes", () => {
    expect(confirmacao).toContain("a.id = p_acao_id and a.user_id = v_user and a.sessao_id = p_sessao_id");
    expect(confirmacao).toContain("for update");
    expect(confirmacao).toContain("v_acao.status = 'succeeded'");
    expect(confirmacao).toContain("'repetida', true");
  });

  it("executa o id e os parâmetros armazenados, nunca um payload do cliente", () => {
    expect(confirmacao).toContain("v_acao.payload->>'agendaId'");
    expect(confirmacao).toContain("v_acao.payload->>'date'");
    expect(confirmacao).toContain("v_acao.payload->>'hora'");
    expect(confirmacao).toContain("insert into public.agenda");
    expect(confirmacao).not.toContain("p_payload");
  });

  it("barra ação expirada, usuário sem IA e imóvel de outra carteira", () => {
    expect(confirmacao).toContain("p.liberado = true");
    expect(confirmacao).toContain("v_acao.expires_at <= now()");
    expect(confirmacao).toContain("i.id = v_imovel_id and i.user_id = v_user");
  });

  it("não concede escrita direta na tabela de payload ao authenticated", () => {
    const grantsAuthenticated = schema.slice(
      schema.indexOf("grant select, insert, update, delete on table imoveis to authenticated"),
      schema.indexOf("-- Somente código server-side possui a service role"),
    );
    expect(grantsAuthenticated).not.toContain("assistente_acoes to authenticated");
    expect(schema).toContain("grant execute on function confirmar_acao_assistente(uuid, uuid) to authenticated");
  });

  it("substitui o preview anterior da mesma conversa", () => {
    const preparacao = schema.slice(
      schema.indexOf("create or replace function preparar_acao_assistente_agendar_visita"),
      schema.indexOf("create or replace function confirmar_acao_assistente"),
    );
    expect(preparacao).toContain("sessao_id = p_sessao_id");
    expect(preparacao).toContain("status = 'cancelled'");
    expect(preparacao).toContain("status = 'ready_for_confirmation'");
    expect(preparacao).toContain("pg_advisory_xact_lock");
    expect(schema).toContain("create unique index if not exists assistente_acoes_pendente_sessao_idx");
  });

  it("permite compromisso sem imóvel, mantendo a validação user-scoped quando houver vínculo", () => {
    const preparacao = schema.slice(
      schema.indexOf("create or replace function preparar_acao_assistente_criar_compromisso"),
      schema.indexOf("create or replace function preparar_acao_assistente_agendar_visita"),
    );
    expect(preparacao).toContain("p_imovel_id is not null");
    expect(preparacao).toContain("i.id = p_imovel_id and i.user_id = v_user");
    expect(preparacao).toContain("'criar_compromisso'");
    expect(preparacao).toContain("status = 'cancelled'");
    expect(confirmacao).toContain("v_imovel_id is not null and not exists");
  });
});

describe("confirmação textual determinística", () => {
  it.each(["confirmar", "Confirmo!", "pode criar", "pode fazer", "pode agendar", "claro, pode criar", "sim, crie"])(
    "aceita a frase inequívoca %s",
    (texto) => expect(classificarDecisaoTextual(texto)).toBe("confirmar"),
  );

  it.each(["cancelar", "não crie", "deixa pra lá"])(
    "aceita o cancelamento inequívoco %s",
    (texto) => expect(classificarDecisaoTextual(texto)).toBe("cancelar"),
  );

  it.each(["sim", "pode", "pode criar e mude para meio-dia", "acho que sim"])(
    "não executa texto ambíguo: %s",
    (texto) => expect(classificarDecisaoTextual(texto)).toBeNull(),
  );

  it("usa somente a ação pendente mais recente do histórico", () => {
    const antiga = { ...compromisso("cancelled"), tipo: "criar_compromisso" as const, estado: "cancelled" as const };
    const atualId = "55555555-5555-4555-8555-555555555555";
    const atual = { ...compromisso(), id: atualId, tipo: "criar_compromisso" as const, estado: "ready_for_confirmation" as const };
    expect(acaoPendenteMaisRecente([
      { papel: "assistente", texto: "anterior", acao: antiga },
      { papel: "assistente", texto: "atual", acao: atual },
    ])?.id).toBe(atualId);
    expect(acaoPendenteMaisRecente([
      { papel: "assistente", texto: "pendente", acao: atual },
      { papel: "assistente", texto: "cancelada", acao: antiga },
    ])).toBeNull();
  });
});

describe("uma arquitetura para chat e menu", () => {
  const fonte = (caminho: string) => readFileSync(join(process.cwd(), caminho), "utf8");

  it("faz chat e formulário guiado chamarem a mesma preparação", () => {
    expect(fonte("lib/servidor/assistente/orquestrador.ts")).toContain("executarPreparacaoAgendamentoVisita");
    expect(fonte("app/api/assistente/route.ts")).toContain("prepararAgendamentoVisita(supabase");
    expect(fonte("lib/servidor/assistente/acoes.ts")).toContain('supabase.rpc("preparar_acao_assistente_agendar_visita"');
  });

  it("oferece visita, revisão do follow-up existente e mantém leitura direta", () => {
    const acoes = fonte("components/assistente/AcoesRapidasAssistente.tsx");
    expect(acoes).toContain("Agendar visita");
    expect(acoes).toContain("Criar follow-up");
    expect(acoes).toContain('abrirModal("followUpLote")');
    expect(acoes).toContain("Ver agenda de hoje");
    expect(acoes).toContain("Ver respostas");
    expect(acoes).toContain("Quais proprietários responderam e estão aguardando minha resposta?");
    expect(acoes).not.toContain("Agendar mensagem");
    expect(acoes).not.toContain("Atualizar status");
  });

  it("encaminha o pedido em linguagem natural para a revisão sem executar o envio", () => {
    const operacoes = fonte("lib/servidor/assistente/acoes.ts");
    const orquestrador = fonte("lib/servidor/assistente/orquestrador.ts");
    const cliente = fonte("components/assistente/AssistenteProvider.tsx");
    const conhecimento = fonte("lib/servidor/assistente/conhecimento.ts");

    expect(operacoes).toContain('"buscar_followups"');
    expect(operacoes).toContain("limite: 10");
    expect(operacoes).toContain("envioExecutado: false");
    expect(operacoes).toContain('comandoUi: { tipo: "abrir_followup_lote" }');
    expect(orquestrador).toContain("FERRAMENTA_ABRIR_REVISAO_FOLLOWUP_LOTE");
    expect(cliente).toContain('abrirModal("followUpLote")');
    expect(conhecimento).toContain("Nunca afirme que o follow-up foi enviado");
  });

  it("reaproveita o atendimento contextual e abre somente um rascunho editável", () => {
    const operacoes = fonte("lib/servidor/assistente/acoes.ts");
    const orquestrador = fonte("lib/servidor/assistente/orquestrador.ts");
    const cliente = fonte("components/assistente/AssistenteProvider.tsx");

    expect(operacoes).toContain("selecionarMensagensAtendimento");
    expect(operacoes).toContain("envioExecutado: false");
    expect(orquestrador).toContain("FERRAMENTA_PREPARAR_RASCUNHO_RESPOSTA");
    expect(cliente).toContain("rascunharResposta(comando.imovelId)");
    expect(cliente).toContain("abrirWhatsappRascunho");
    expect(cliente).not.toContain("enviarWhatsapp");
  });
});
