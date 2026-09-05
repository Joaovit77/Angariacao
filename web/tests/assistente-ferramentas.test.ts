import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fromDbAgenda, fromDbImovel, type DbAgendaRow, type DbImovelRow } from "@/lib/persistencia/mapeadores";
import { focoInteligenteDoDia } from "@/lib/calculo/focoDia";
import { addDaysISO, todayISO } from "@/lib/datas";
import { executarFerramenta, limiteConformeIntencao, normalizarCodigoImovel, resolverEscopoFollowUp, type CacheLeiturasAssistente } from "@/lib/servidor/assistente/ferramentas";
import { compactarBlocosParaHistorico } from "@/lib/assistente/historico";
import { prepararResultadoFerramentaParaModelo } from "@/lib/servidor/assistente/orquestrador";
import type { ItemHistoricoAssistente, PedidoAssistente } from "@/lib/assistente/tipos";

type Linha = Record<string, unknown>;
type Filtro = { metodo: "eq" | "ilike" | "gte" | "lte" | "lt"; coluna: string; valor: unknown };
type ResultadoConsulta = { data: Linha[] | null; error: null; count: number | null };

class ConsultaFake implements PromiseLike<ResultadoConsulta> {
  filtros: Filtro[] = [];
  ordens: Array<{ coluna: string; ascending: boolean }> = [];
  private somenteCabecalho = false;
  private comContagem = false;
  constructor(private linhas: Linha[]) {}
  select(_colunas?: string, opcoes?: { count?: string; head?: boolean }) {
    this.comContagem = opcoes?.count === "exact";
    this.somenteCabecalho = opcoes?.head === true;
    return this;
  }
  eq(coluna: string, valor: unknown) { this.filtros.push({ metodo: "eq", coluna, valor }); return this; }
  ilike(coluna: string, valor: string) { this.filtros.push({ metodo: "ilike", coluna, valor }); return this; }
  order(coluna: string, opcoes?: { ascending?: boolean }) { this.ordens.push({ coluna, ascending: opcoes?.ascending !== false }); return this; }
  gte(coluna: string, valor: unknown) { this.filtros.push({ metodo: "gte", coluna, valor }); return this; }
  lte(coluna: string, valor: unknown) { this.filtros.push({ metodo: "lte", coluna, valor }); return this; }
  lt(coluna: string, valor: unknown) { this.filtros.push({ metodo: "lt", coluna, valor }); return this; }
  private resultado(limite?: number): ResultadoConsulta {
    let data = this.linhas.filter((linha) => this.filtros.every((filtro) => {
      const atual = linha[filtro.coluna];
      if (filtro.metodo === "eq") return atual === filtro.valor;
      if (filtro.metodo === "gte") return String(atual ?? "") >= String(filtro.valor);
      if (filtro.metodo === "lte") return String(atual ?? "") <= String(filtro.valor);
      if (filtro.metodo === "lt") return String(atual ?? "") < String(filtro.valor);
      const esperado = String(filtro.valor).replaceAll("%", "").toLocaleLowerCase("pt-BR");
      return String(atual ?? "").toLocaleLowerCase("pt-BR").includes(esperado);
    }));
    const count = data.length;
    for (const ordem of [...this.ordens].reverse()) {
      data = data.sort((a, b) => {
        const comparacao = String(a[ordem.coluna] ?? "").localeCompare(String(b[ordem.coluna] ?? ""));
        return ordem.ascending ? comparacao : -comparacao;
      });
    }
    if (limite != null) data = data.slice(0, limite);
    return { data: this.somenteCabecalho ? null : data, error: null, count: this.comContagem ? count : null };
  }
  limit(n: number) { return Promise.resolve(this.resultado(n)); }
  maybeSingle() { const r = this.resultado(); return Promise.resolve({ data: r.data?.[0] ?? null, error: null }); }
  then<TResult1 = ResultadoConsulta, TResult2 = never>(
    onfulfilled?: ((value: ResultadoConsulta) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
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

function imovel(id: string, userId: string, codigo: string, sobrescrever: Partial<DbImovelRow> = {}): DbImovelRow {
  return {
    id, user_id: userId, codigo, endereco: `Rua ${codigo}`, status: "Novo contato",
    referencia_crm: null, cep: null, bairro: "Centro", cidade: "Londrina", unidade: null, bloco: null,
    edificio: null, tipo: "Casa", quartos: null, banheiros: null, vagas: null, valor_aluguel: 0,
    valor_condominio: 0, proprietario_nome: "Proprietario", proprietario_telefone: null,
    forma_abordagem: null, origem_imovel: null, anuncio_idade_dias: null, imobiliaria_concorrente: null,
    latitude: null, longitude: null, data_angariacao: "2026-08-13", responsavel: "Joao", observacoes: null,
    status_history: [], notas: [], tentativas: [], pausado_ate: null, motivo_perda: null,
    motivo_perda_outro: null, comissao_recebida: false, comissao_recebida_valor: null,
    comissao_recebida_data: null, comissao_forma_pagamento: null, comissao_observacao: null,
    autorizacao_assinada_em: null, autorizacao_responsavel: null, locado_em: null, contrato_numero: null,
    pre_cadastro: false, importado: false, retirado: false, valor_aluguel_atraso: null, texto_anuncio: null,
    imovel_principal_id: null, created_at: `${sobrescrever.data_angariacao || "2026-08-13"}T12:00:00Z`,
    ...sobrescrever,
  };
}

function compromisso(id: string, userId: string, data: string, imovelId: string | null): DbAgendaRow {
  return { id, user_id: userId, title: `Compromisso ${id}`, type: "Ligacao", date: data, hora: "09:00", imovel_id: imovelId, notes: null, done: false, is_verificacao_disponibilidade: false };
}

const contexto = { rota: "/pipeline", pagina: "Pipeline", superficie: "pagina" as const };

function historicoComImoveis(...itens: DbImovelRow[]): ItemHistoricoAssistente[] {
  return [{
    papel: "assistente",
    texto: itens.map((item) => item.codigo).join(", "),
    resultados: [{ tipo: "imoveis", itens: itens.map((item) => ({ id: item.id, codigo: item.codigo || "", bairro: item.bairro || "", status: item.status })) }],
  }];
}

function mensagemAgendada(id: string, userId: string, dataEnvio: string, status = "agendada"): Linha {
  return { id, user_id: userId, imovel_id: `imovel-${id}`, nome_proprietario: `Pessoa ${id}`, telefone: "43999999999", mensagem: `Mensagem ${id}`, data_envio: dataEnvio, status, enviado_em: null, erro: null };
}

describe("referencias de imovel do assistente", () => {
  it("normaliza somente codigos humanos curtos", () => {
    expect(normalizarCodigoImovel(" ld-225 ")).toBe("LD-225");
    expect(normalizarCodigoImovel("LD-225,outra-consulta")).toBeNull();
  });

  it("busca LD-225 pelo campo codigo, mantendo o filtro do usuario", async () => {
    const fake = new SupabaseFake({ imoveis: [imovel("uuid-interno-225", "user-1", "LD-225") as unknown as Linha] });
    const resultado = await executarFerramenta("buscar_imoveis", { codigo: "LD-225", status: null, bairro: null, responsavel: null, termo_endereco: null, limite: 10 }, fake as unknown as SupabaseClient, "user-1", contexto);
    expect(resultado.dados).toMatchObject({ totalEncontrado: 1, itensRetornados: 1, itens: [{ id: "uuid-interno-225", codigo: "LD-225" }] });
    expect(fake.consultas[0].query.filtros).toEqual([
      { metodo: "eq", coluna: "user_id", valor: "user-1" },
      { metodo: "ilike", coluna: "codigo", valor: "LD-225" },
    ]);
  });

  it("devolve vazio para codigo inexistente", async () => {
    const fake = new SupabaseFake({ imoveis: [imovel("uuid-225", "user-1", "LD-225") as unknown as Linha] });
    const resultado = await executarFerramenta("buscar_imoveis", { codigo: "LD-999", status: null, bairro: null, responsavel: null, termo_endereco: null, limite: 10 }, fake as unknown as SupabaseClient, "user-1", contexto);
    expect(resultado.dados).toEqual({ totalEncontrado: 0, itensRetornados: 0, itens: [] });
  });

  it("nao encontra codigo que pertence a outro usuario", async () => {
    const fake = new SupabaseFake({ imoveis: [imovel("uuid-outro", "user-2", "LD-225") as unknown as Linha] });
    const resultado = await executarFerramenta("consultar_imovel", { codigo: "LD-225", id: null }, fake as unknown as SupabaseClient, "user-1", contexto);
    expect(resultado.dados).toEqual({ encontrado: false });
    expect(fake.consultas[0].query.filtros[0]).toEqual({ metodo: "eq", coluna: "user_id", valor: "user-1" });
  });

  it("reconsulta o id interno recebido do drawer sob o usuario autenticado", async () => {
    const row = imovel("uuid-interno-225", "user-1", "LD-225");
    const fake = new SupabaseFake({ imoveis: [row as unknown as Linha] });
    const resultado = await executarFerramenta("consultar_entidade_atual", {}, fake as unknown as SupabaseClient, "user-1", { ...contexto, superficie: "drawer", entidade: { tipo: "imovel", id: row.id } });
    expect(resultado.dados).toMatchObject({ id: row.id, codigo: "LD-225", proprietario: "Proprietario" });
    expect(fake.consultas[0].query.filtros.slice(0, 2)).toEqual([
      { metodo: "eq", coluna: "user_id", valor: "user-1" },
      { metodo: "eq", coluna: "id", valor: row.id },
    ]);
  });
});

describe("conversas respondidas do assistente", () => {
  const resposta = (id: string, texto: string, data: string) => ({
    id: `wa:${id}`,
    texto: `Resposta pelo WhatsApp: ${texto}`,
    data,
    direcao: "recebida" as const,
    tipo: "conversation",
    origem: "webhook-evolution" as const,
  });
  const envio = (id: string, texto: string, data: string) => ({
    id: `wa-enviada:${id}`,
    texto: `Mensagem enviada pelo WhatsApp: ${texto}`,
    data,
    direcao: "enviada" as const,
    tipo: "conversation",
    origem: "api-evolution" as const,
  });

  it("usa a classificação da Central de Mensagens, ordena pela atividade e isola o usuário", async () => {
    const aguardando = imovel("id-1", "user-1", "LD-301", {
      status: "Em negociação",
      proprietario_nome: "Marina",
      proprietario_telefone: "43999999999",
      notas: [resposta("1", "Podemos conversar amanhã?", "2026-08-27T11:00:00")],
    });
    const respondidaPeloCorretor = imovel("id-2", "user-1", "LD-302", {
      status: "Em negociação",
      proprietario_nome: "Carlos",
      notas: [
        resposta("2", "Qual é a proposta?", "2026-08-27T09:00:00"),
        envio("2", "Vou detalhar.", "2026-08-27T10:00:00"),
      ],
    });
    const semResposta = imovel("id-3", "user-1", "LD-303", {
      notas: [envio("3", "Olá!", "2026-08-27T08:00:00")],
    });
    const outroUsuario = imovel("id-4", "user-2", "LD-304", {
      status: "Em negociação",
      notas: [resposta("4", "Dado privado", "2026-08-27T12:00:00")],
    });
    const fake = new SupabaseFake({
      imoveis: [aguardando, respondidaPeloCorretor, semResposta, outroUsuario] as unknown as Linha[],
    });

    const resultado = await executarFerramenta(
      "buscar_conversas_respondidas",
      { somente_aguardando_corretor: false, limite: 10 },
      fake as unknown as SupabaseClient,
      "user-1",
      contexto,
    );

    expect(resultado.dados).toMatchObject({
      totalEncontrado: 2,
      itensRetornados: 2,
      itens: [
        { imovelId: "id-1", codigo: "LD-301", proprietario: "Marina", aguardandoCorretor: true, ultimaResposta: "Podemos conversar amanhã?" },
        { imovelId: "id-2", codigo: "LD-302", proprietario: "Carlos", aguardandoCorretor: false, ultimaResposta: "Qual é a proposta?" },
      ],
    });
    expect(JSON.stringify(resultado.dados)).not.toContain("43999999999");
    expect(JSON.stringify(resultado.dados)).not.toContain("Dado privado");
    expect(fake.consultas[0].query.filtros).toContainEqual({ metodo: "eq", coluna: "user_id", valor: "user-1" });
  });

  it("filtra quem está aguardando a resposta do corretor", async () => {
    const rows = [
      imovel("id-1", "user-1", "LD-301", { status: "Em negociação", notas: [resposta("1", "Tenho interesse", "2026-08-27T11:00:00")] }),
      imovel("id-2", "user-1", "LD-302", { status: "Em negociação", notas: [resposta("2", "Olá", "2026-08-27T09:00:00"), envio("2", "Oi!", "2026-08-27T10:00:00")] }),
    ];
    const resultado = await executarFerramenta(
      "buscar_conversas_respondidas",
      { somente_aguardando_corretor: true, limite: 10 },
      new SupabaseFake({ imoveis: rows as unknown as Linha[] }) as unknown as SupabaseClient,
      "user-1",
      contexto,
    );
    expect(resultado.dados).toMatchObject({ totalEncontrado: 1, itens: [{ codigo: "LD-301" }] });
  });
});

describe("contagem e ordenacao de imoveis", () => {
  it("reutiliza a leitura integral da carteira entre ferramentas da mesma resposta", async () => {
    const fake = new SupabaseFake({
      imoveis: [imovel("id-1", "user-1", "LD-601") as unknown as Linha],
    });
    const cache: CacheLeiturasAssistente = { acertos: 0 };

    await executarFerramenta(
      "contar_angariacoes",
      { periodo: "mes_atual", data_inicio: null, data_fim: null },
      fake as unknown as SupabaseClient,
      "user-1",
      contexto,
      "Quantas angariações neste mês?",
      [],
      cache,
    );
    await executarFerramenta(
      "buscar_marcos_imoveis",
      { marco: "angariado", data_inicio: null, data_fim: null, somente_contagem: false, limite: 1 },
      fake as unknown as SupabaseClient,
      "user-1",
      contexto,
      "Qual foi a última angariação?",
      [],
      cache,
    );

    expect(fake.consultas.filter(({ tabela }) => tabela === "imoveis")).toHaveLength(1);
    expect(cache.acertos).toBe(1);
  });

  const argsBase = { codigo: null, status: null, bairro: null, responsavel: null, termo_endereco: null, data_inicio: null, data_fim: null };

  it("conta mais de 20 sem retornar a carteira", async () => {
    const rows = Array.from({ length: 25 }, (_, i) => imovel(`id-${i + 1}`, "user-1", `LD-${i + 1}`) as unknown as Linha);
    const resultado = await executarFerramenta("contar_imoveis", argsBase, new SupabaseFake({ imoveis: rows }) as unknown as SupabaseClient, "user-1", contexto);
    expect(resultado.dados).toEqual({ totalEncontrado: 25, itensRetornados: 0 });
  });

  it("devolve total zero", async () => {
    const resultado = await executarFerramenta("contar_imoveis", { ...argsBase, bairro: "Inexistente" }, new SupabaseFake({ imoveis: [] }) as unknown as SupabaseClient, "user-1", contexto);
    expect(resultado.dados).toEqual({ totalEncontrado: 0, itensRetornados: 0 });
  });

  it("conta com filtro e mantem o usuario autenticado", async () => {
    const fake = new SupabaseFake({ imoveis: [
      imovel("id-1", "user-1", "LD-1", { bairro: "California" }) as unknown as Linha,
      imovel("id-2", "user-1", "LD-2", { bairro: "Centro" }) as unknown as Linha,
      imovel("id-3", "user-2", "LD-3", { bairro: "California" }) as unknown as Linha,
    ] });
    const resultado = await executarFerramenta("contar_imoveis", { ...argsBase, bairro: "California" }, fake as unknown as SupabaseClient, "user-1", contexto);
    expect(resultado.dados).toEqual({ totalEncontrado: 1, itensRetornados: 0 });
    expect(fake.consultas[0].query.filtros[0]).toEqual({ metodo: "eq", coluna: "user_id", valor: "user-1" });
  });

  it("retorna os 5 mais recentes e informa total separado", async () => {
    const rows = Array.from({ length: 25 }, (_, i) => imovel(`id-${i + 1}`, "user-1", `LD-${i + 1}`, { data_angariacao: `2026-01-${String(i + 1).padStart(2, "0")}` }) as unknown as Linha);
    const resultado = await executarFerramenta("buscar_imoveis", { ...argsBase, ordenar_por: "data_cadastro", direcao: "desc", limite: 5 }, new SupabaseFake({ imoveis: rows }) as unknown as SupabaseClient, "user-1", contexto);
    expect(resultado.dados).toMatchObject({ totalEncontrado: 25, itensRetornados: 5 });
    expect((resultado.dados as { itens: Array<{ codigo: string }> }).itens.map((item) => item.codigo)).toEqual(["LD-25", "LD-24", "LD-23", "LD-22", "LD-21"]);
  });

  it("retorna os 10 mais antigos", async () => {
    const rows = Array.from({ length: 25 }, (_, i) => imovel(`id-${i + 1}`, "user-1", `LD-${i + 1}`, { data_angariacao: `2026-01-${String(i + 1).padStart(2, "0")}` }) as unknown as Linha);
    const resultado = await executarFerramenta("buscar_imoveis", { ...argsBase, ordenar_por: "data_cadastro", direcao: "asc", limite: 10 }, new SupabaseFake({ imoveis: rows }) as unknown as SupabaseClient, "user-1", contexto);
    expect((resultado.dados as { itens: Array<{ codigo: string }> }).itens.map((item) => item.codigo)).toEqual(Array.from({ length: 10 }, (_, i) => `LD-${i + 1}`));
  });

  it("conta angariacoes de hoje pelo motor sem devolver os registros", async () => {
    const hoje = todayISO();
    const rows = [
      imovel("angariado-hoje", "user-1", "LD-A", { status: "Angariado", status_history: [{ status: "Angariado", date: hoje }] }),
      imovel("nao-angariado", "user-1", "LD-B", { status: "Novo contato", status_history: [] }),
    ];
    const resultado = await executarFerramenta("contar_angariacoes", { periodo: "hoje", data_inicio: null, data_fim: null }, new SupabaseFake({ imoveis: rows as unknown as Linha[] }) as unknown as SupabaseClient, "user-1", contexto);
    expect(resultado.dados).toEqual({ totalEncontrado: 1, itensRetornados: 0, dataInicio: hoje, dataFim: hoje });
  });
});

describe("foco oficial do dia", () => {
  it("preserva exatamente a ordem e os motivos de focoInteligenteDoDia", async () => {
    const hoje = todayISO();
    const rows = [imovel("imovel-1", "user-1", "LD-1")];
    const agenda = [
      compromisso("agenda-atrasada", "user-1", addDaysISO(hoje, -3)!, "imovel-1"),
      compromisso("agenda-hoje", "user-1", hoje, null),
    ];
    const esperado = focoInteligenteDoDia(rows.map(fromDbImovel), agenda.map(fromDbAgenda), [], hoje);
    const resultado = await executarFerramenta("consultar_foco_do_dia", { limite: 20 }, new SupabaseFake({
      imoveis: rows as unknown as Linha[], agenda: agenda as unknown as Linha[], user_config: [{ user_id: "user-1", origens_extras: [] }],
    }) as unknown as SupabaseClient, "user-1", contexto);
    const dados = resultado.dados as { acoes: typeof esperado.acoes };
    expect(dados.acoes).toEqual(esperado.acoes);
    expect(dados.acoes.map((acao) => acao.id)).toEqual(esperado.acoes.map((acao) => acao.id));
    expect(dados.acoes.map((acao) => acao.motivo)).toEqual(esperado.acoes.map((acao) => acao.motivo));
  });
});

describe("mensagens agendadas somente leitura", () => {
  const argsHoje = { data_inicio: todayISO(), data_fim: todayISO(), status: null, somente_futuras: false, ordem: "asc", limite: 20 };

  it("consulta as mensagens de hoje no fuso operacional e separa total de itens", async () => {
    const hoje = todayISO();
    const amanha = addDaysISO(hoje, 1)!;
    const fake = new SupabaseFake({ mensagens_agendadas: [
      mensagemAgendada("hoje", "user-1", `${hoje}T15:00:00.000Z`),
      mensagemAgendada("amanha", "user-1", `${amanha}T15:00:00.000Z`),
      mensagemAgendada("outro", "user-2", `${hoje}T16:00:00.000Z`),
    ] });
    const resultado = await executarFerramenta("consultar_mensagens_agendadas", argsHoje, fake as unknown as SupabaseClient, "user-1", contexto);
    expect(resultado.dados).toMatchObject({ totalEncontrado: 1, itensRetornados: 1, itens: [{ id: "hoje", nomeProprietario: "Pessoa hoje" }] });
    expect(fake.consultas[0].query.filtros[0]).toEqual({ metodo: "eq", coluna: "user_id", valor: "user-1" });
    expect(fake.consultas[0].query.filtros).toContainEqual({ metodo: "gte", coluna: "data_envio", valor: `${hoje}T03:00:00.000Z` });
    expect(fake.consultas[0].query.filtros).toContainEqual({ metodo: "lt", coluna: "data_envio", valor: `${amanha}T03:00:00.000Z` });
    expect(JSON.stringify(resultado.dados)).not.toContain("43999999999");
  });

  it("devolve zero sem criar bloco estruturado vazio", async () => {
    const resultado = await executarFerramenta("consultar_mensagens_agendadas", argsHoje, new SupabaseFake({ mensagens_agendadas: [] }) as unknown as SupabaseClient, "user-1", contexto);
    expect(resultado.dados).toEqual({ totalEncontrado: 0, itensRetornados: 0, itens: [] });
    expect(resultado.bloco).toBeUndefined();
  });

  it("nao retorna mensagem pertencente a outro usuario", async () => {
    const resultado = await executarFerramenta("consultar_mensagens_agendadas", argsHoje, new SupabaseFake({ mensagens_agendadas: [mensagemAgendada("outro", "user-2", `${todayISO()}T15:00:00.000Z`)] }) as unknown as SupabaseClient, "user-1", contexto);
    expect(resultado.dados).toMatchObject({ totalEncontrado: 0, itensRetornados: 0, itens: [] });
  });
});

describe("follow-up contextual", () => {
  const elegivel = imovel("imovel-com-followup", "user-1", "LD-10", { status: "Sem resposta", proprietario_telefone: "43999999999" });
  const semFollowup = imovel("imovel-sem-followup", "user-1", "LD-225", { status: "Novo contato", proprietario_telefone: "43988888888", tentativas: [] });
  const tabelas = { imoveis: [elegivel, semFollowup] as unknown as Linha[] };

  it("forca o imovel ativo para uma pergunta singular mesmo se o modelo pedir global", () => {
    expect(resolverEscopoFollowUp("global", { ...contexto, superficie: "drawer", entidade: { tipo: "imovel", id: semFollowup.id } }, "Tem follow-up pendente?")).toBe("entidade_atual");
  });

  it("preserva a intencao global explicita com um imovel aberto", () => {
    expect(resolverEscopoFollowUp("entidade_atual", { ...contexto, superficie: "drawer", entidade: { tipo: "imovel", id: semFollowup.id } }, "Quais follow-ups tenho hoje?")).toBe("global");
  });

  it("consulta o imovel ativo com follow-up", async () => {
    const resultado = await executarFerramenta("buscar_followups", { escopo: "entidade_atual", limite: 10 }, new SupabaseFake(tabelas) as unknown as SupabaseClient, "user-1", { ...contexto, superficie: "drawer", entidade: { tipo: "imovel", id: elegivel.id } });
    expect(resultado.dados).toMatchObject({ escopo: "entidade_atual", encontrado: true, followUpPendente: true, item: { id: elegivel.id } });
  });

  it("consulta o imovel ativo sem follow-up", async () => {
    const resultado = await executarFerramenta("buscar_followups", { escopo: "entidade_atual", limite: 10 }, new SupabaseFake(tabelas) as unknown as SupabaseClient, "user-1", { ...contexto, superficie: "drawer", entidade: { tipo: "imovel", id: semFollowup.id } });
    expect(resultado.dados).toMatchObject({ escopo: "entidade_atual", encontrado: true, followUpPendente: false, item: { id: semFollowup.id } });
  });

  it("mantem a consulta global separada", async () => {
    const resultado = await executarFerramenta("buscar_followups", { escopo: "global", limite: 10 }, new SupabaseFake(tabelas) as unknown as SupabaseClient, "user-1", contexto);
    expect(resultado.dados).toMatchObject({ escopo: "global", totalEncontrado: 1, itensRetornados: 1, itens: [{ id: elegivel.id }] });
  });

  it("troca o resultado quando muda o imovel ativo", async () => {
    const fake = () => new SupabaseFake(tabelas) as unknown as SupabaseClient;
    const primeiro = await executarFerramenta("buscar_followups", { escopo: "entidade_atual", limite: 10 }, fake(), "user-1", { ...contexto, superficie: "drawer", entidade: { tipo: "imovel", id: elegivel.id } });
    const segundo = await executarFerramenta("buscar_followups", { escopo: "entidade_atual", limite: 10 }, fake(), "user-1", { ...contexto, superficie: "drawer", entidade: { tipo: "imovel", id: semFollowup.id } });
    expect((primeiro.dados as { followUpPendente: boolean }).followUpPendente).toBe(true);
    expect((segundo.dados as { followUpPendente: boolean }).followUpPendente).toBe(false);
  });

  it("nao encontra id pertencente a outro usuario", async () => {
    const outro = imovel("imovel-outro", "user-2", "LD-999", { status: "Sem resposta", proprietario_telefone: "43977777777" });
    const resultado = await executarFerramenta("buscar_followups", { escopo: "entidade_atual", limite: 10 }, new SupabaseFake({ imoveis: [outro as unknown as Linha] }) as unknown as SupabaseClient, "user-1", { ...contexto, superficie: "drawer", entidade: { tipo: "imovel", id: outro.id } });
    expect(resultado.dados).toEqual({ escopo: "entidade_atual", encontrado: false });
  });

  it("reconsulta o mesmo imovel resolvido pela conversa em vez da fila global", async () => {
    const ld228 = imovel("imovel-228", "user-1", "LD-228", { status: "Sem resposta", proprietario_telefone: "43977777777" });
    const historico: ItemHistoricoAssistente[] = [
      ...historicoComImoveis(ld228, semFollowup),
      { papel: "usuario", texto: "Qual desses fica na Vila Larsen 1?" },
      { papel: "assistente", texto: "O imóvel é o **LD-228**." },
      { papel: "usuario", texto: "Qual a situação dele?" },
      { papel: "assistente", texto: "A situação do **LD-228** é Sem resposta." },
    ];
    const fake = new SupabaseFake({ imoveis: [ld228, semFollowup] as unknown as Linha[] });
    const resultado = await executarFerramenta("buscar_followups", { escopo: "global", limite: 20 }, fake as unknown as SupabaseClient, "user-1", contexto, "Ele precisa de follow-up?", historico);
    expect(resultado.dados).toMatchObject({ escopo: "referencia", encontrado: true, followUpPendente: true, item: { id: ld228.id, codigo: "LD-228" } });
    expect(fake.consultas[0].query.filtros.slice(0, 2)).toEqual([
      { metodo: "eq", coluna: "user_id", valor: "user-1" },
      { metodo: "eq", coluna: "id", valor: ld228.id },
    ]);
  });

  it("prioriza codigo explicito, depois drawer e permite trocar a referencia", async () => {
    const ld224 = imovel("imovel-224", "user-1", "LD-224", { status: "Sem resposta", proprietario_telefone: "43911111111" });
    const ld228 = imovel("imovel-228", "user-1", "LD-228", { status: "Sem resposta", proprietario_telefone: "43922222222" });
    const rows = [ld224, ld228] as unknown as Linha[];
    const historico = [
      ...historicoComImoveis(ld228),
      { papel: "assistente" as const, texto: "O imóvel referido é o LD-228." },
    ];
    const explicito = await executarFerramenta("buscar_followups", { escopo: "referencia", limite: 10 }, new SupabaseFake({ imoveis: rows }) as unknown as SupabaseClient, "user-1", { ...contexto, superficie: "drawer", entidade: { tipo: "imovel", id: ld228.id } }, "LD-224 precisa de follow-up?", historico);
    expect(explicito.dados).toMatchObject({ escopo: "referencia", item: { id: ld224.id } });

    const drawer = await executarFerramenta("buscar_followups", { escopo: "referencia", limite: 10 }, new SupabaseFake({ imoveis: rows }) as unknown as SupabaseClient, "user-1", { ...contexto, superficie: "drawer", entidade: { tipo: "imovel", id: ld224.id } }, "Esse imóvel precisa de follow-up?", historico);
    expect(drawer.dados).toMatchObject({ escopo: "entidade_atual", item: { id: ld224.id } });
  });

  it("pede esclarecimento para historico ambiguo ou limpo sem consultar o banco", async () => {
    const ld228 = imovel("imovel-228", "user-1", "LD-228");
    const fakeAmbiguo = new SupabaseFake({ imoveis: [ld228, semFollowup] as unknown as Linha[] });
    const ambiguo = await executarFerramenta("buscar_followups", { escopo: "global", limite: 20 }, fakeAmbiguo as unknown as SupabaseClient, "user-1", contexto, "Ele precisa de follow-up?", historicoComImoveis(ld228, semFollowup));
    expect(ambiguo.dados).toMatchObject({ encontrado: false, referenciaAmbigua: true, candidatos: ["LD-228", "LD-225"] });
    expect(fakeAmbiguo.consultas).toHaveLength(0);

    const fakeLimpo = new SupabaseFake({ imoveis: [ld228] as unknown as Linha[] });
    const limpo = await executarFerramenta("buscar_followups", { escopo: "referencia", limite: 20 }, fakeLimpo as unknown as SupabaseClient, "user-1", contexto, "Ele precisa de follow-up?", []);
    expect(limpo.dados).toMatchObject({ encontrado: false, referenciaAmbigua: true, candidatos: [] });
    expect(fakeLimpo.consultas).toHaveLength(0);
  });

  it("nao acessa referencia conversacional pertencente a outro usuario", async () => {
    const outro = imovel("imovel-outro", "user-2", "LD-999", { status: "Sem resposta", proprietario_telefone: "43977777777" });
    const historico = [
      ...historicoComImoveis(outro),
      { papel: "assistente" as const, texto: "O imóvel é o LD-999." },
    ];
    const fake = new SupabaseFake({ imoveis: [outro as unknown as Linha] });
    const resultado = await executarFerramenta("buscar_followups", { escopo: "referencia", limite: 10 }, fake as unknown as SupabaseClient, "user-1", contexto, "Ele precisa de follow-up?", historico);
    expect(resultado.dados).toEqual({ escopo: "referencia", encontrado: false });
    expect(fake.consultas[0].query.filtros[0]).toEqual({ metodo: "eq", coluna: "user_id", valor: "user-1" });
  });
});

describe("follow-up global e limites de cards", () => {
  const elegiveis = Array.from({ length: 12 }, (_, indice) => imovel(`id-${indice}`, "user-1", `LD-${300 + indice}`, {
    status: "Sem resposta",
    proprietario_nome: `Pessoa ${indice}`,
    proprietario_telefone: `4399999${String(indice).padStart(4, "0")}`,
  })) as unknown as Linha[];

  it("separa total elegivel, limite diario e quantidade exibida", async () => {
    const resultado = await executarFerramenta("buscar_followups", { escopo: "global", limite: 20 }, new SupabaseFake({ imoveis: elegiveis }) as unknown as SupabaseClient, "user-1", contexto, "Quais follow-ups tenho hoje?");
    expect(resultado.dados).toMatchObject({ totalElegiveis: 12, limiteHoje: 10, totalFilaHoje: 10, itensRetornados: 10 });
    expect(resultado.bloco?.itens).toHaveLength(10);
    expect(resultado.bloco?.titulo).toBe("Fila de follow-up de hoje");
  });

  it("pergunta quantitativa nao anexa cards", async () => {
    const resultado = await executarFerramenta("buscar_followups", { escopo: "global", limite: 20 }, new SupabaseFake({ imoveis: elegiveis }) as unknown as SupabaseClient, "user-1", contexto, "Quantos follow-ups tenho hoje?");
    expect(resultado.dados).toMatchObject({ totalElegiveis: 12, totalFilaHoje: 10, itensRetornados: 0 });
    expect(resultado.bloco).toBeUndefined();
  });

  it("pergunta quantitativa composta sobre elegiveis preserva os totais sem cards", async () => {
    const resultado = await executarFerramenta("buscar_followups", { escopo: "global", limite: 20 }, new SupabaseFake({ imoveis: elegiveis }) as unknown as SupabaseClient, "user-1", contexto, "Quantos imóveis estão elegíveis para follow-up, qual é o limite de hoje e quantos itens foram retornados?");
    expect(resultado.dados).toMatchObject({ totalElegiveis: 12, limiteHoje: 10, itensRetornados: 0, intencao: "quantidade_hoje" });
    expect(resultado.bloco).toBeUndefined();
  });

  it("lista elegiveis com total e limite de exibicao distintos", async () => {
    const resultado = await executarFerramenta("buscar_followups", { escopo: "global", limite: 5 }, new SupabaseFake({ imoveis: elegiveis }) as unknown as SupabaseClient, "user-1", contexto, "Quais imóveis estão elegíveis para follow-up?");
    expect(resultado.dados).toMatchObject({ totalElegiveis: 12, limiteHoje: 10, itensRetornados: 5 });
    expect(resultado.bloco?.titulo).toBe("Imoveis elegiveis para follow-up");
  });

  it("devolve zero sem card vazio", async () => {
    const resultado = await executarFerramenta("buscar_followups", { escopo: "global", limite: 20 }, new SupabaseFake({ imoveis: [] }) as unknown as SupabaseClient, "user-1", contexto, "Quais follow-ups tenho hoje?");
    expect(resultado.dados).toMatchObject({ totalElegiveis: 0, totalFilaHoje: 0, itensRetornados: 0 });
    expect(resultado.bloco).toBeUndefined();
  });

  it("reduz perguntas singulares e preserva listas solicitadas", () => {
    expect(limiteConformeIntencao("Qual meu próximo compromisso?", 20, "agenda")).toBe(1);
    expect(limiteConformeIntencao("Qual imóvel está há mais tempo sem contato?", 20, "estagnados")).toBe(1);
    expect(limiteConformeIntencao("Qual é a próxima mensagem programada?", 20, "mensagens")).toBe(1);
    expect(limiteConformeIntencao("Mostre os 5 imóveis mais recentes.", 20, "imoveis")).toBe(5);
  });

  it("aplica o limite singular ao bloco real de agenda", async () => {
    const agenda = [
      compromisso("primeiro", "user-1", addDaysISO(todayISO(), 1)!, null),
      compromisso("segundo", "user-1", addDaysISO(todayISO(), 2)!, null),
    ] as unknown as Linha[];
    const resultado = await executarFerramenta("buscar_agenda", { data_inicio: null, data_fim: null, concluido: false, limite: 20 }, new SupabaseFake({ agenda }) as unknown as SupabaseClient, "user-1", contexto, "Qual meu próximo compromisso?");
    expect(resultado.bloco?.itens).toHaveLength(1);
    expect(resultado.bloco?.itens[0]).toMatchObject({ id: "primeiro" });
  });

  it("aplica o limite singular ao bloco real de mensagens", async () => {
    const mensagens = [
      mensagemAgendada("primeira", "user-1", `${addDaysISO(todayISO(), 1)}T15:00:00.000Z`),
      mensagemAgendada("segunda", "user-1", `${addDaysISO(todayISO(), 2)}T15:00:00.000Z`),
    ];
    const resultado = await executarFerramenta("consultar_mensagens_agendadas", { data_inicio: null, data_fim: null, status: "agendada", somente_futuras: true, ordem: "asc", limite: 20 }, new SupabaseFake({ mensagens_agendadas: mensagens }) as unknown as SupabaseClient, "user-1", contexto, "Qual é a próxima mensagem programada?");
    expect(resultado.bloco?.itens).toHaveLength(1);
    expect(resultado.bloco?.itens[0]).toMatchObject({ id: "primeira" });
  });

  it("retorna apenas o principal imovel sem contato numa pergunta singular", async () => {
    const antigos = [20, 18, 15].map((dias, indice) => imovel(`antigo-${indice}`, "user-1", `LD-${400 + indice}`, {
      data_angariacao: addDaysISO(todayISO(), -dias)!,
      created_at: `${addDaysISO(todayISO(), -dias)}T12:00:00Z`,
    })) as unknown as Linha[];
    const resultado = await executarFerramenta("buscar_estagnados", { limite: 20 }, new SupabaseFake({ imoveis: antigos }) as unknown as SupabaseClient, "user-1", contexto, "Qual imóvel está há mais tempo sem contato?");
    expect(resultado.bloco?.itens).toHaveLength(1);
    expect(resultado.bloco?.itens[0]).toMatchObject({ id: "antigo-0" });
  });
});

describe("estado atual versus marcos historicos", () => {
  const ldA = imovel("ld-a", "user-1", "LD-A", {
    status: "Angariado",
    status_history: [{ status: "Angariado", date: "2026-08-10", userId: "user-1", source: "usuario" }],
    updated_at: "2026-08-17T23:59:00Z",
  });
  const ldB = imovel("ld-b", "user-1", "LD-B", {
    status: "Publicado",
    status_history: [
      { status: "Angariado", date: "2026-08-17", userId: "user-1", source: "usuario" },
      { status: "Publicado", date: "2026-08-17", userId: "user-1", source: "usuario" },
    ],
    updated_at: "2026-08-01T00:00:00Z",
  });
  const ldC = imovel("ld-c", "user-1", "LD-C", {
    status: "Locado",
    status_history: [
      { status: "Angariado", date: "2026-08-12" },
      { status: "Publicado", date: "2026-08-13" },
      { status: "Locado", date: "2026-08-16", authorName: "Marina", source: "sophia" },
    ],
    locado_em: "2026-08-15",
  });
  const ldD = imovel("ld-d", "user-1", "LD-D", {
    status: "Pago",
    status_history: [{ status: "Locado", date: "2026-08-02" }],
    locado_em: "2026-08-01",
  });
  const legadoIncompleto = imovel("legado", "user-1", "LD-LEGADO", { status: "Publicado", status_history: [] });
  const outroUsuario = imovel("outro", "user-2", "LD-OUTRO", {
    status: "Publicado",
    status_history: [{ status: "Angariado", date: "2026-08-20" }],
  });
  const rows = [ldA, ldB, ldC, ldD, legadoIncompleto, outroUsuario] as unknown as Linha[];
  const args = { data_inicio: null, data_fim: null, somente_contagem: false, limite: 20 };

  it("caso LD-A/LD-B: ultima angariacao retorna LD-B, embora esteja Publicado", async () => {
    const resultado = await executarFerramenta(
      "buscar_marcos_imoveis",
      { ...args, marco: "angariado" },
      new SupabaseFake({ imoveis: rows }) as unknown as SupabaseClient,
      "user-1",
      contexto,
      "Qual foi minha ultima angariacao?",
    );
    expect(resultado.dados).toMatchObject({
      totalEncontrado: 3,
      itensRetornados: 1,
      itens: [{ id: "ld-b", codigo: "LD-B", status: "Publicado", marco: "angariado", marcoEm: "2026-08-17", marcoPorUserId: "user-1" }],
    });
    expect(resultado.bloco?.itens).toHaveLength(1);
    expect(resultado.bloco?.itens[0]).toMatchObject({ id: "ld-b", codigo: "LD-B" });
    expect(resultado.bloco?.itens).toEqual((resultado.dados as { itens: unknown[] }).itens);
  });

  it("consulta de estado atual retorna somente quem esta Angariado", async () => {
    const resultado = await executarFerramenta(
      "buscar_imoveis",
      { codigo: null, status: "Angariado", bairro: null, responsavel: null, termo_endereco: null, data_inicio: null, data_fim: null, ordenar_por: null, direcao: null, limite: 20 },
      new SupabaseFake({ imoveis: rows }) as unknown as SupabaseClient,
      "user-1",
      contexto,
      "Quais imoveis estao Angariados?",
    );
    expect(resultado.dados).toMatchObject({ totalEncontrado: 1, itens: [{ codigo: "LD-A" }] });
  });

  it("troca a dimensao no follow-up entre publicado e locado", async () => {
    const fake = () => new SupabaseFake({ imoveis: rows }) as unknown as SupabaseClient;
    const publicado = await executarFerramenta("buscar_marcos_imoveis", { ...args, marco: "publicado" }, fake(), "user-1", contexto, "e o ultimo publicado?");
    const historicoMultiTurno: ItemHistoricoAssistente[] = [
      { papel: "usuario", texto: "Qual foi minha ultima angariacao?" },
      { papel: "assistente", texto: "LD-B." },
      { papel: "usuario", texto: "e o ultimo publicado?" },
      { papel: "assistente", texto: "LD-B." },
    ];
    const locado = await executarFerramenta("buscar_marcos_imoveis", { ...args, marco: "locado" }, fake(), "user-1", contexto, "e locado?", historicoMultiTurno);
    expect(publicado.dados).toMatchObject({ itensRetornados: 1, itens: [{ codigo: "LD-B", marcoEm: "2026-08-17" }] });
    expect(locado.dados).toMatchObject({ itensRetornados: 1, itens: [{ codigo: "LD-C", marcoEm: "2026-08-15", marcoPorNome: "Marina" }] });
  });

  it("reconsulta a fonte real no follow-up antes de comparar a entidade", async () => {
    const supabase = new SupabaseFake({ imoveis: rows });
    const primeira = await executarFerramenta(
      "buscar_marcos_imoveis",
      { ...args, marco: "angariado" },
      supabase as unknown as SupabaseClient,
      "user-1",
      contexto,
      "Qual foi minha ultima angariacao?",
    );
    const historico: ItemHistoricoAssistente[] = [
      { papel: "usuario", texto: "Qual foi minha ultima angariacao?" },
      {
        papel: "assistente",
        texto: "O ultimo foi o LD-B.",
        resultados: compactarBlocosParaHistorico(primeira.bloco ? [primeira.bloco] : []),
      },
    ];
    const segunda = await executarFerramenta(
      "buscar_marcos_imoveis",
      { ...args, marco: "publicado" },
      supabase as unknown as SupabaseClient,
      "user-1",
      contexto,
      "E o ultimo publicado?",
      historico,
    );
    expect(supabase.consultas).toHaveLength(2);

    const pedido: PedidoAssistente = {
      mensagem: "E o ultimo publicado?",
      contexto,
      historico,
    };
    const preparado = prepararResultadoFerramentaParaModelo(segunda.dados, segunda.bloco, pedido);
    expect(preparado.continuidade).toMatchObject({
      relacao: "mesma_entidade",
      anterior: { id: "ld-b", marco: "angariado" },
      atual: { id: "ld-b", marco: "publicado" },
    });
  });

  it("conta pelo periodo do evento, sem cards", async () => {
    const resultado = await executarFerramenta(
      "buscar_marcos_imoveis",
      { marco: "angariado", data_inicio: "2026-08-17", data_fim: "2026-08-17", somente_contagem: true, limite: 20 },
      new SupabaseFake({ imoveis: rows }) as unknown as SupabaseClient,
      "user-1",
      contexto,
      "Quantos imoveis angariei em 17 de agosto?",
    );
    expect(resultado.dados).toMatchObject({ totalEncontrado: 1, itensRetornados: 0, itens: [] });
    expect(resultado.bloco).toBeUndefined();
  });

  it("conta locacoes do mes pelo marco, inclusive quem hoje esta Pago", async () => {
    const resultado = await executarFerramenta(
      "buscar_marcos_imoveis",
      { marco: "locado", data_inicio: "2026-08-01", data_fim: "2026-08-31", somente_contagem: true, limite: 20 },
      new SupabaseFake({ imoveis: rows }) as unknown as SupabaseClient,
      "user-1",
      contexto,
      "Quantos imoveis loquei em agosto?",
    );
    expect(resultado.dados).toMatchObject({ totalEncontrado: 2, itensRetornados: 0 });
    expect(resultado.bloco).toBeUndefined();
  });

  it("isola usuarios, ignora updated_at e nao inventa marco para legado", async () => {
    const fake = new SupabaseFake({ imoveis: rows });
    const resultado = await executarFerramenta(
      "buscar_marcos_imoveis",
      { ...args, marco: "angariado" },
      fake as unknown as SupabaseClient,
      "user-1",
      contexto,
      "Liste minhas angariacoes.",
    );
    expect(resultado.dados).toMatchObject({ totalEncontrado: 3 });
    expect(JSON.stringify(resultado.dados)).not.toContain("LD-OUTRO");
    expect(JSON.stringify(resultado.dados)).not.toContain("LD-LEGADO");
    expect(fake.consultas[0].query.filtros[0]).toEqual({ metodo: "eq", coluna: "user_id", valor: "user-1" });
  });
});
