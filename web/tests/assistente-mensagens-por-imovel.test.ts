/* M5.1 — roteamento contextual do Assistente para mensagens e Agenda por
   imóvel. A pergunta "o que aconteceu com a mensagem do LD-X" precisa
   alcançar a fonte estruturada (mensagens_agendadas, com a explicação do
   M5) e "próxima verificação do LD-X" precisa alcançar a Agenda; o código
   humano é resolvido dentro da conta e nunca vaza para outra. */
import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { CATALOGO_CAPACIDADES_ASSISTENTE } from "@/lib/assistente/capacidades";
import { selecionarContextoAssistente } from "@/lib/assistente/contextoTipado";
import { instrucoesDoAssistente } from "@/lib/servidor/assistente/conhecimento";
import { carregarContextoTipadoAssistente, serializarContextoTipadoAssistente } from "@/lib/servidor/assistente/contextoTipado";
import { DEFINICOES_FERRAMENTAS, executarFerramenta } from "@/lib/servidor/assistente/ferramentas";

type Linha = Record<string, unknown>;
type Filtro = { metodo: "eq" | "ilike" | "gte" | "lte" | "lt" | "in"; coluna: string; valor: unknown };
type Resultado = { data: Linha[] | null; error: null; count: number | null };

class ConsultaFake implements PromiseLike<Resultado> {
  filtros: Filtro[] = [];
  private comContagem = false;
  constructor(private linhas: Linha[]) {}
  select(_colunas?: string, opcoes?: { count?: string }) { this.comContagem = opcoes?.count === "exact"; return this; }
  eq(coluna: string, valor: unknown) { this.filtros.push({ metodo: "eq", coluna, valor }); return this; }
  ilike(coluna: string, valor: unknown) { this.filtros.push({ metodo: "ilike", coluna, valor }); return this; }
  gte(coluna: string, valor: unknown) { this.filtros.push({ metodo: "gte", coluna, valor }); return this; }
  lte(coluna: string, valor: unknown) { this.filtros.push({ metodo: "lte", coluna, valor }); return this; }
  lt(coluna: string, valor: unknown) { this.filtros.push({ metodo: "lt", coluna, valor }); return this; }
  in(coluna: string, valor: unknown[]) { this.filtros.push({ metodo: "in", coluna, valor }); return this; }
  order() { return this; }
  private resultado(limite?: number): Resultado {
    const data = this.linhas.filter((linha) => this.filtros.every((filtro) => {
      const atual = linha[filtro.coluna];
      if (filtro.metodo === "eq") return atual === filtro.valor;
      if (filtro.metodo === "in") return (filtro.valor as unknown[]).includes(atual);
      if (filtro.metodo === "gte") return String(atual ?? "") >= String(filtro.valor);
      if (filtro.metodo === "lte") return String(atual ?? "") <= String(filtro.valor);
      if (filtro.metodo === "lt") return String(atual ?? "") < String(filtro.valor);
      return String(atual ?? "").toLocaleLowerCase("pt-BR") === String(filtro.valor).toLocaleLowerCase("pt-BR");
    }));
    return { data: limite == null ? data : data.slice(0, limite), error: null, count: this.comContagem ? data.length : null };
  }
  limit(n: number) { return Promise.resolve(this.resultado(n)); }
  maybeSingle() { const r = this.resultado(); return Promise.resolve({ data: r.data?.[0] ?? null, error: null }); }
  then<T1 = Resultado, T2 = never>(
    onfulfilled?: ((value: Resultado) => T1 | PromiseLike<T1>) | null,
    onrejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null,
  ): PromiseLike<T1 | T2> {
    return Promise.resolve(this.resultado()).then(onfulfilled, onrejected);
  }
}

class SupabaseFake {
  consultas: Array<{ tabela: string; query: ConsultaFake }> = [];
  constructor(private tabelas: Record<string, Linha[]>) {}
  from(tabela: string) {
    const query = new ConsultaFake(this.tabelas[tabela] || []);
    this.consultas.push({ tabela, query });
    return query;
  }
}

const contexto = { rota: "/assistente", pagina: "Assistente", superficie: "pagina" as const };
const UUID_LD340 = "39437e8c-1111-4aaa-8bbb-000000000340";
const UUID_LD343 = "9f58ed47-2222-4aaa-8bbb-000000000343";
const UUID_LD344 = "a0da2e3a-3333-4aaa-8bbb-000000000344";
const UUID_OUTRA_CONTA = "deadbeef-4444-4aaa-8bbb-000000000999";

const imoveis: Linha[] = [
  { id: UUID_LD340, user_id: "user-1", codigo: "LD-340", endereco: "Rua A, 1", status: "Publicado" },
  { id: UUID_LD343, user_id: "user-1", codigo: "LD-343", endereco: "Rua B, 2", status: "Publicado" },
  { id: UUID_LD344, user_id: "user-1", codigo: "LD-344", endereco: "Rua C, 3", status: "Publicado" },
  // Mesmo código humano em outra conta: nunca pode ser alcançado por user-1.
  { id: UUID_OUTRA_CONTA, user_id: "user-2", codigo: "LD-340", endereco: "Rua Z, 9", status: "Publicado" },
];

function mensagem(id: string, imovelId: string, extra: Linha = {}): Linha {
  return {
    id, user_id: "user-1", imovel_id: imovelId, nome_proprietario: "Teste M6", telefone: "43999994316", mensagem: `Olá! ${id}`,
    data_envio: "2026-09-21T18:12:00.000Z", status: "agendada", tipo: "verificacao-disponibilidade", enviado_em: null, erro: null,
    cancelamento_motivo: null, cancelamento_origem: null, cancelada_em: null, reagendada_em: null, reagendamento_motivo: null,
    data_envio_original: null, imoveis_consultados: null, consolidada_em_mensagem_id: null, reservada_para_mensagem_id: null,
    ...extra,
  };
}

/* Réplica estrutural dos dados reais do M6 (sem telefone real, sem texto real). */
const mensagens: Linha[] = [
  mensagem("m340-enviada", UUID_LD340, { data_envio: "2026-09-21T16:04:00.000Z", status: "enviada", enviado_em: "2026-09-21T16:04:05.000Z" }),
  mensagem("m340-cancelada", UUID_LD340, { data_envio: "2026-09-21T16:12:00.000Z", status: "cancelada", cancelamento_motivo: "imovel-indisponivel", cancelamento_origem: "worker", cancelada_em: "2026-09-21T16:12:03.000Z" }),
  mensagem("m340-reprogramada", UUID_LD340, { data_envio: "2026-11-20T18:12:00.000Z", data_envio_original: "2026-09-21T18:12:00.000Z", reagendada_em: "2026-09-21T18:12:04.000Z", reagendamento_motivo: "disponibilidade-confirmada" }),
  mensagem("m343-ancora", UUID_LD343, { data_envio: "2026-09-21T18:32:00.000Z", status: "enviada", enviado_em: "2026-09-21T18:32:04.000Z", imoveis_consultados: [UUID_LD343, UUID_LD344] }),
  mensagem("m344-absorvida", UUID_LD344, { data_envio: "2026-09-21T18:34:00.000Z", status: "cancelada", cancelamento_motivo: "contato-consolidado", cancelamento_origem: "worker", cancelada_em: "2026-09-21T18:32:04.000Z", consolidada_em_mensagem_id: "m343-ancora" }),
  { ...mensagem("m-outra-conta", UUID_OUTRA_CONTA), user_id: "user-2" },
];

const agenda: Linha[] = [
  // Caso real do LD-340 (M6/C3): lembrete aberto em 20/11, criado pelo
  // usuário ao voltar o imóvel para Publicado, sem reason_code; a RPC não o
  // tocou. Não é prova de automação, mesmo sendo verificação em E+60.
  { id: "lembrete-340", user_id: "user-1", title: "Verificar disponibilidade", type: "Retorno ao proprietário", date: "2026-11-20", hora: null, done: false, imovel_id: UUID_LD340, is_verificacao_disponibilidade: true, origin: "usuario", reason_code: null, updated_at: "2026-09-21T15:00:00Z" },
  { id: "lembrete-340-antigo", user_id: "user-1", title: "Verificar disponibilidade", type: "Retorno ao proprietário", date: "2026-09-21", hora: null, done: true, imovel_id: UUID_LD340, is_verificacao_disponibilidade: true, origin: "usuario", completed_at: "2026-09-21T18:12:04Z", completion_reason: "disponibilidade-confirmada", completion_origin: "worker" },
  // Lembrete reposicionado/criado pela transição de disponibilidade: só o
  // reason_code estruturado justifica o rótulo.
  { id: "lembrete-343", user_id: "user-1", title: "Verificar disponibilidade", type: "Retorno ao proprietário", date: "2026-11-20", hora: null, done: false, imovel_id: UUID_LD343, is_verificacao_disponibilidade: true, origin: "automacao", reason_code: "disponibilidade-confirmada" },
  { id: "visita-manual", user_id: "user-1", title: "Visita", type: "Visita", date: "2026-10-01", hora: "10:00", done: false, imovel_id: UUID_LD340, is_verificacao_disponibilidade: false, origin: "usuario" },
  { id: "lembrete-outra-conta", user_id: "user-2", title: "Segredo", type: "Ligação", date: "2026-11-20", hora: null, done: false, imovel_id: UUID_OUTRA_CONTA, is_verificacao_disponibilidade: true },
];

const argsMensagens = (codigo: string | null, extra: Record<string, unknown> = {}) => ({
  codigo_imovel: codigo, data_inicio: null, data_fim: null, status: null, somente_futuras: false, ordem: "asc", limite: 20, ...extra,
});
const argsAgenda = (codigo: string | null, extra: Record<string, unknown> = {}) => ({
  codigo_imovel: codigo, data_inicio: null, data_fim: null, concluido: null, limite: 20, ...extra,
});

type Itens = { itens: Array<Record<string, unknown>> };
const TERMOS_TECNICOS = ["contato-consolidado", "imovel-indisponivel", "disponibilidade-confirmada", "consolidada_em", "reservada_para", "cancelamento_motivo", "reagendamento", "rpc", "trigger", "claim", "sql"];
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

describe("consultar_mensagens_agendadas — filtro por imóvel (M5.1)", () => {
  it("1. LD-340 devolve somente as mensagens do LD-340, filtrando imovel_id pelo id resolvido na conta", async () => {
    const fake = new SupabaseFake({ imoveis, mensagens_agendadas: mensagens });
    const resultado = await executarFerramenta("consultar_mensagens_agendadas", argsMensagens("LD-340"), fake as unknown as SupabaseClient, "user-1", contexto);
    const dados = resultado.dados as Itens & { totalEncontrado: number; imovel: unknown };
    expect(dados.imovel).toEqual({ codigo: "LD-340", encontrado: true });
    expect(dados.totalEncontrado).toBe(3);
    expect(dados.itens.map((i) => i.id)).toEqual(["m340-enviada", "m340-cancelada", "m340-reprogramada"]);
    // A resolução do código acontece sob o user_id e o filtro usa o id da conta certa.
    const [resolucao, consulta] = fake.consultas;
    expect(resolucao.tabela).toBe("imoveis");
    expect(resolucao.query.filtros).toEqual([{ metodo: "eq", coluna: "user_id", valor: "user-1" }, { metodo: "ilike", coluna: "codigo", valor: "LD-340" }]);
    expect(consulta.tabela).toBe("mensagens_agendadas");
    expect(consulta.query.filtros).toContainEqual({ metodo: "eq", coluna: "imovel_id", valor: UUID_LD340 });
    expect(consulta.query.filtros).not.toContainEqual({ metodo: "eq", coluna: "imovel_id", valor: UUID_OUTRA_CONTA });
    expect(resultado.bloco).toMatchObject({ tipo: "mensagens_agendadas", titulo: "Mensagens de LD-340" });
  });

  it("2. outro imóvel não vaza: LD-344 não traz a âncora do LD-343 nem as linhas do LD-340", async () => {
    const fake = new SupabaseFake({ imoveis, mensagens_agendadas: mensagens });
    const resultado = await executarFerramenta("consultar_mensagens_agendadas", argsMensagens("LD-344"), fake as unknown as SupabaseClient, "user-1", contexto);
    const dados = resultado.dados as Itens;
    expect(dados.itens.map((i) => i.id)).toEqual(["m344-absorvida"]);
  });

  it("3. código inexistente devolve vazio com explicação e não consulta mensagens", async () => {
    const fake = new SupabaseFake({ imoveis, mensagens_agendadas: mensagens });
    const resultado = await executarFerramenta("consultar_mensagens_agendadas", argsMensagens("LD-999"), fake as unknown as SupabaseClient, "user-1", contexto);
    expect(resultado.dados).toEqual({ imovel: { codigo: "LD-999", encontrado: false }, totalEncontrado: 0, itensRetornados: 0, itens: [], motivo: "Nenhum imovel com esse codigo na sua carteira." });
    expect(resultado.bloco).toBeUndefined();
    expect(fake.consultas.map((c) => c.tabela)).toEqual(["imoveis"]);
  });

  it("4. código que só existe em outra conta não devolve dado (cross-tenant bloqueado)", async () => {
    const fake = new SupabaseFake({
      imoveis: imoveis.filter((i) => i.user_id === "user-2"),
      mensagens_agendadas: mensagens,
    });
    const resultado = await executarFerramenta("consultar_mensagens_agendadas", argsMensagens("LD-340"), fake as unknown as SupabaseClient, "user-1", contexto);
    expect(resultado.dados).toMatchObject({ imovel: { codigo: "LD-340", encontrado: false }, totalEncontrado: 0, itens: [] });
    expect(fake.consultas.map((c) => c.tabela)).toEqual(["imoveis"]);
    expect(JSON.stringify(resultado.dados)).not.toContain(UUID_OUTRA_CONTA);
  });

  it("código malformado é rejeitado antes de qualquer consulta", async () => {
    const fake = new SupabaseFake({ imoveis, mensagens_agendadas: mensagens });
    const resultado = await executarFerramenta("consultar_mensagens_agendadas", argsMensagens("LD-340 or user_id.eq.x"), fake as unknown as SupabaseClient, "user-1", contexto);
    expect(resultado.dados).toEqual({ totalEncontrado: 0, itensRetornados: 0, itens: [], erro: "Codigo de imovel invalido." });
    expect(fake.consultas).toHaveLength(0);
  });

  it("5. LD-340 representa enviada + cancelada por indisponibilidade + reprogramada para 20/11/2026", async () => {
    const fake = new SupabaseFake({ imoveis, mensagens_agendadas: mensagens });
    const resultado = await executarFerramenta("consultar_mensagens_agendadas", argsMensagens("LD-340"), fake as unknown as SupabaseClient, "user-1", contexto);
    const porId = Object.fromEntries((resultado.dados as Itens).itens.map((i) => [i.id as string, i]));
    expect(porId["m340-enviada"]).toMatchObject({ codigoImovel: "LD-340", situacao: "Enviada", incluidaEmOutraMensagem: false, reprogramada: null });
    expect(porId["m340-cancelada"]).toMatchObject({ codigoImovel: "LD-340", situacao: "Cancelada", explicacao: "Cancelada em 21/09/2026 porque o imóvel não está mais disponível." });
    expect(porId["m340-reprogramada"]).toMatchObject({
      codigoImovel: "LD-340",
      situacao: "Agendada",
      status: "agendada",
      reprogramada: { de: "21/09/2026", para: "20/11/2026" },
      explicacao: "Reprogramada de 21/09/2026 para 20/11/2026 após confirmação de disponibilidade.",
    });
  });

  it("6. LD-344 devolve incluidaEmOutraMensagem=true: não foi enviada separadamente", async () => {
    const fake = new SupabaseFake({ imoveis, mensagens_agendadas: mensagens });
    const resultado = await executarFerramenta("consultar_mensagens_agendadas", argsMensagens("LD-344"), fake as unknown as SupabaseClient, "user-1", contexto);
    const [item] = (resultado.dados as Itens).itens;
    expect(item).toMatchObject({
      codigoImovel: "LD-344",
      situacao: "Incluída em outra mensagem",
      incluidaEmOutraMensagem: true,
      explicacao: "Incluída em outra mensagem enviada ao proprietário em 21/09/2026.",
    });
    expect(item).not.toHaveProperty("consolidadaEmMensagemId");
  });

  it("7. a âncora do LD-343 devolve imoveisConsultados=2 com os códigos humanos, sem UUID", async () => {
    const fake = new SupabaseFake({ imoveis, mensagens_agendadas: mensagens });
    const resultado = await executarFerramenta("consultar_mensagens_agendadas", argsMensagens("LD-343"), fake as unknown as SupabaseClient, "user-1", contexto);
    const [item] = (resultado.dados as Itens).itens;
    expect(item).toMatchObject({
      codigoImovel: "LD-343",
      situacao: "Enviada",
      imoveisConsultados: 2,
      incluidaEmOutraMensagem: false,
      explicacao: "Perguntou pela disponibilidade de 2 imóveis (LD-343, LD-344).",
    });
    // Os códigos dos imóveis consultados também são resolvidos sob o user_id.
    const codigos = fake.consultas.find((c, indice) => indice > 0 && c.tabela === "imoveis");
    expect(codigos?.query.filtros[0]).toEqual({ metodo: "eq", coluna: "user_id", valor: "user-1" });
  });

  it("13. situação, explicação e código humano não carregam UUID nem vocabulário técnico", async () => {
    const fake = new SupabaseFake({ imoveis, mensagens_agendadas: mensagens });
    for (const codigo of ["LD-340", "LD-343", "LD-344"]) {
      const resultado = await executarFerramenta("consultar_mensagens_agendadas", argsMensagens(codigo), fake as unknown as SupabaseClient, "user-1", contexto);
      for (const item of (resultado.dados as Itens).itens) {
        const humano = [item.codigoImovel, item.situacao, item.explicacao, item.nomeProprietario, JSON.stringify(item.reprogramada)].join(" ");
        expect(humano).not.toMatch(UUID);
        for (const termo of TERMOS_TECNICOS) expect(humano.toLowerCase()).not.toContain(termo);
        expect(JSON.stringify(item)).not.toContain("43999994316");
      }
    }
  });

  it("sem codigo_imovel a consulta continua global e cada linha ganha o código humano do seu imóvel", async () => {
    const fake = new SupabaseFake({ imoveis, mensagens_agendadas: mensagens });
    const resultado = await executarFerramenta("consultar_mensagens_agendadas", argsMensagens(null), fake as unknown as SupabaseClient, "user-1", contexto);
    const dados = resultado.dados as Itens & { totalEncontrado: number };
    expect(dados.totalEncontrado).toBe(5);
    expect(dados).not.toHaveProperty("imovel");
    expect(new Set(dados.itens.map((i) => i.codigoImovel))).toEqual(new Set(["LD-340", "LD-343", "LD-344"]));
    expect(fake.consultas[0].tabela).toBe("mensagens_agendadas");
  });
});

describe("buscar_agenda — filtro por imóvel (M5.1)", () => {
  it("10/11. a próxima verificação do LD-340 vem do lembrete aberto, sem rótulo de automação (caso real) e sem outra conta", async () => {
    const fake = new SupabaseFake({ imoveis, agenda });
    const resultado = await executarFerramenta("buscar_agenda", argsAgenda("LD-340", { concluido: false }), fake as unknown as SupabaseClient, "user-1", contexto, "Quando será a próxima verificação do LD-340 e por quê?");
    const dados = resultado.dados as { imovel: unknown; itens: Array<Record<string, unknown>> };
    expect(dados.imovel).toEqual({ codigo: "LD-340", encontrado: true });
    // A ordenação por data é do banco; o fake devolve na ordem da fixture.
    expect(new Set(dados.itens.map((i) => i.id))).toEqual(new Set(["visita-manual", "lembrete-340"]));
    const porId = Object.fromEntries(dados.itens.map((i) => [i.id as string, i]));
    expect(porId["lembrete-340"]).toMatchObject({
      codigoImovel: "LD-340",
      data: "2026-11-20",
      concluido: false,
      verificacaoDisponibilidade: true,
      automacao: null,
    });
    expect(porId["visita-manual"]).toMatchObject({ verificacaoDisponibilidade: false, automacao: null });
    const consulta = fake.consultas.find((c) => c.tabela === "agenda")!;
    expect(consulta.query.filtros).toContainEqual({ metodo: "eq", coluna: "user_id", valor: "user-1" });
    expect(consulta.query.filtros).toContainEqual({ metodo: "eq", coluna: "imovel_id", valor: UUID_LD340 });
    expect(resultado.bloco).toMatchObject({ tipo: "agenda", titulo: "Agenda de LD-340" });
    expect(JSON.stringify(resultado.dados)).not.toContain("Segredo");
  });

  it("verificação aberta em E+60 criada pelo usuário (origin=usuario, reason_code=null) nunca ganha rótulo, mesmo com título e flag de verificação", async () => {
    const fake = new SupabaseFake({ imoveis, agenda });
    const resultado = await executarFerramenta("buscar_agenda", argsAgenda("LD-340", { concluido: false }), fake as unknown as SupabaseClient, "user-1", contexto);
    const lembrete = (resultado.dados as { itens: Array<Record<string, unknown>> }).itens.find((i) => i.id === "lembrete-340")!;
    expect(lembrete).toMatchObject({ titulo: "Verificar disponibilidade", data: "2026-11-20", concluido: false, verificacaoDisponibilidade: true, automacao: null });
    expect(JSON.stringify(lembrete)).not.toContain("automaticamente");
  });

  it("lembrete reposicionado pela automação (reason_code=disponibilidade-confirmada) recebe o rótulo de programação automática", async () => {
    const fake = new SupabaseFake({ imoveis, agenda });
    const resultado = await executarFerramenta("buscar_agenda", argsAgenda("LD-343", { concluido: false }), fake as unknown as SupabaseClient, "user-1", contexto);
    const dados = resultado.dados as { itens: Array<Record<string, unknown>> };
    expect(dados.itens.map((i) => i.id)).toEqual(["lembrete-343"]);
    expect(dados.itens[0]).toMatchObject({ codigoImovel: "LD-343", verificacaoDisponibilidade: true, automacao: "Próxima verificação programada automaticamente" });
  });

  it("lembrete concluído pela automação explica o porquê pelo campo estruturado", async () => {
    const fake = new SupabaseFake({ imoveis, agenda });
    const resultado = await executarFerramenta("buscar_agenda", argsAgenda("LD-340", { concluido: true }), fake as unknown as SupabaseClient, "user-1", contexto);
    const dados = resultado.dados as { itens: Array<Record<string, unknown>> };
    expect(dados.itens).toHaveLength(1);
    expect(dados.itens[0]).toMatchObject({ id: "lembrete-340-antigo", automacao: "Concluído por confirmação de disponibilidade" });
  });

  it("11. código de outra conta ou inexistente devolve vazio sem consultar a Agenda", async () => {
    const fake = new SupabaseFake({ imoveis: imoveis.filter((i) => i.user_id === "user-2"), agenda });
    const resultado = await executarFerramenta("buscar_agenda", argsAgenda("LD-340"), fake as unknown as SupabaseClient, "user-1", contexto);
    expect(resultado.dados).toEqual({ imovel: { codigo: "LD-340", encontrado: false }, itens: [], motivo: "Nenhum imovel com esse codigo na sua carteira." });
    expect(fake.consultas.map((c) => c.tabela)).toEqual(["imoveis"]);
    expect(resultado.bloco).toBeUndefined();
  });

  it("sem codigo_imovel mantém a forma anterior (lista) e o filtro do usuário", async () => {
    const fake = new SupabaseFake({ imoveis, agenda });
    const resultado = await executarFerramenta("buscar_agenda", argsAgenda(null, { concluido: false }), fake as unknown as SupabaseClient, "user-1", contexto);
    expect(Array.isArray(resultado.dados)).toBe(true);
    expect((resultado.dados as unknown[]).length).toBe(3);
    expect(fake.consultas.map((c) => c.tabela)).toEqual(["agenda"]);
    expect(fake.consultas[0].query.filtros[0]).toEqual({ metodo: "eq", coluna: "user_id", valor: "user-1" });
  });
});

describe("descoberta e roteamento (M5.1)", () => {
  const definicao = (nome: string) => DEFINICOES_FERRAMENTAS.find((f) => f.name === nome)!;

  it("schemas: as duas ferramentas aceitam codigo_imovel opcional em modo estrito", () => {
    for (const nome of ["consultar_mensagens_agendadas", "buscar_agenda"]) {
      const ferramenta = definicao(nome);
      const propriedades = ferramenta.parameters.properties as Record<string, { type: unknown; description?: string }>;
      expect(propriedades.codigo_imovel.type).toEqual(["string", "null"]);
      expect(propriedades.codigo_imovel.description).toContain("Nao e o id interno");
      expect(ferramenta.parameters.required).toContain("codigo_imovel");
      expect(ferramenta.strict).toBe(true);
    }
  });

  it("8/9. a descrição de mensagens cobre 'o que aconteceu com a mensagem do LD-X', enviada/cancelada/reprogramada, verificação e consolidação", () => {
    const descricao = definicao("consultar_mensagens_agendadas").description.toLowerCase();
    for (const termo of ["o que aconteceu com a mensagem do ld-340", "enviada", "cancelada", "reprogramada", "incluida em outra mensagem", "consolidacao", "verificacao de disponibilidade", "codigo_imovel", "nao deduza"]) {
      expect(descricao).toContain(termo);
    }
  });

  it("14. consultar_imovel continua para dados/histórico, mas declara que não cobre mensagens nem próxima verificação", () => {
    const descricao = definicao("consultar_imovel").description.toLowerCase();
    expect(descricao).toContain("historico");
    expect(descricao).toContain("nao informa o estado das mensagens programadas");
    expect(descricao).toContain("consultar_mensagens_agendadas");
    expect(descricao).toContain("buscar_agenda");
  });

  it("10. a descrição da Agenda cobre 'próxima verificação do LD-X' e a automação", () => {
    const descricao = definicao("buscar_agenda").description.toLowerCase();
    expect(descricao).toContain("proxima verificacao do ld-x");
    expect(descricao).toContain("codigo_imovel");
    expect(descricao).toContain("programado ou concluido automaticamente");
  });

  it("instruções orientam a combinação de ferramentas e proíbem deduzir pelo texto de nota", () => {
    const texto = instrucoesDoAssistente(contexto);
    expect(texto).toContain("consultar_mensagens_agendadas com codigo_imovel");
    expect(texto).toContain("buscar_agenda com codigo_imovel e concluido=false");
    expect(texto).toContain("nunca deduza enviada/cancelada/reprogramada/incluída pelo texto de uma nota");
    expect(texto).toContain("combine as duas ferramentas");
    expect(texto).toContain("não há próxima verificação registrada");
    expect(texto).toContain("com automacao nulo, é um lembrete criado à mão");
  });

  it.each([
    "O que aconteceu com as mensagens agendadas do LD-340?",
    "O que aconteceu com as mensagens dos imóveis LD-343 e LD-344?",
    "A mensagem do LD-344 foi enviada separadamente?",
    "A mensagem de verificação de disponibilidade do LD-340 foi cancelada?",
    "Qual mensagem foi reprogramada?",
  ])("8/9. seleciona a capacidade de mensagens para: %s", (pergunta) => {
    const selecao = selecionarContextoAssistente(pergunta, contexto);
    expect(selecao.capacidades).toContain("consultar_mensagens");
    expect(selecao.capacidades).not.toContain("consultar_carteira");
  });

  it("10. 'próxima verificação do LD-340' descobre a Agenda e carrega o lembrete no escopo do imóvel", async () => {
    const pergunta = "Quando será a próxima verificação do LD-340 e por quê?";
    const selecao = selecionarContextoAssistente(pergunta, contexto);
    expect(selecao.capacidades).toContain("consultar_agenda");
    expect(selecao.blocos).toContain("agenda");

    const fake = new SupabaseFake({ imoveis: imoveis.map((i) => ({ ...i, status_history: [], notas: [], tentativas: [] })), agenda });
    const { contexto: tipado } = await carregarContextoTipadoAssistente({ mensagem: pergunta, contexto, historico: [] }, fake as unknown as SupabaseClient, "user-1");
    expect(tipado.imovel).toMatchObject({ estado: "disponivel", dados: { codigo: "LD-340" } });
    expect(tipado.agenda).toMatchObject({ estado: "disponivel", dados: { escopo: "imovel" } });
    const datas = tipado.agenda?.dados?.itens.map((item) => [item.titulo, item.data, item.concluido]);
    expect(datas).toContainEqual(["Verificar disponibilidade", "2026-11-20", false]);
    for (const { query } of fake.consultas) {
      expect(query.filtros).toContainEqual({ metodo: "eq", coluna: "user_id", valor: "user-1" });
    }
    const serializado = serializarContextoTipadoAssistente(tipado);
    expect(serializado).not.toMatch(UUID);
    expect(serializado).not.toContain("Segredo");
  });

  it("14. pergunta genérica de histórico continua na capacidade de carteira", () => {
    const selecao = selecionarContextoAssistente("Mostre o histórico do imóvel LD-340.", contexto);
    expect(selecao.capacidades).toContain("consultar_carteira");
    expect(selecao.capacidades).not.toContain("consultar_mensagens");
    expect(selecionarContextoAssistente("Qual é o status do LD-340?", contexto).capacidades).not.toContain("consultar_mensagens");
  });

  it("catálogo: os exemplos e limitações apontam a fonte certa para mensagens e verificação", () => {
    const porId = Object.fromEntries(CATALOGO_CAPACIDADES_ASSISTENTE.map((c) => [c.id, c]));
    expect(porId.consultar_mensagens.exemplos).toContain("O que aconteceu com as mensagens agendadas do LD-201?");
    expect(porId.consultar_agenda.exemplos).toContain("Quando será a próxima verificação do LD-201?");
    expect(porId.consultar_carteira.limitacoes.join(" ")).toContain("não mostra o estado das mensagens programadas");
    expect(porId.consultar_mensagens.ferramentas).toContain("consultar_mensagens_agendadas");
    expect(porId.consultar_agenda.ferramentas).toEqual(["buscar_agenda"]);
  });

  it("12. as ferramentas de leitura continuam sem escrita e o filtro por imóvel não muda isso", () => {
    const nomes = DEFINICOES_FERRAMENTAS.map((f) => f.name);
    expect(nomes).toContain("consultar_mensagens_agendadas");
    expect(nomes).toContain("buscar_agenda");
    expect(nomes.some((nome) => /(cancelar|reenviar|reagendar|enviar|atualizar|excluir)/.test(nome))).toBe(false);
  });
});
