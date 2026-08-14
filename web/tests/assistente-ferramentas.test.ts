import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fromDbAgenda, fromDbImovel, type DbAgendaRow, type DbImovelRow } from "@/lib/persistencia/mapeadores";
import { focoInteligenteDoDia } from "@/lib/calculo/focoDia";
import { addDaysISO, todayISO } from "@/lib/datas";
import { executarFerramenta, limiteConformeIntencao, normalizarCodigoImovel, resolverEscopoFollowUp } from "@/lib/servidor/assistente/ferramentas";
import type { ItemHistoricoAssistente } from "@/lib/assistente/tipos";

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

describe("contagem e ordenacao de imoveis", () => {
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
