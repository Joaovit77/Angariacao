import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { selecionarContextoAssistente } from "@/lib/assistente/contextoTipado";
import { politicaDaAcaoAssistente } from "@/lib/assistente/politicas";
import { todayISO } from "@/lib/datas";
import {
  carregarContextoTipadoAssistente,
  serializarContextoTipadoAssistente,
} from "@/lib/servidor/assistente/contextoTipado";

type Linha = Record<string, unknown>;
type MetodoFiltro = "eq" | "ilike" | "gte" | "lte";
type Filtro = { metodo: MetodoFiltro; coluna: string; valor: unknown };

class ConsultaFake {
  filtros: Filtro[] = [];
  ordens: Array<{ coluna: string; ascending: boolean }> = [];

  constructor(private readonly linhas: Linha[]) {}

  select() { return this; }
  eq(coluna: string, valor: unknown) { this.filtros.push({ metodo: "eq", coluna, valor }); return this; }
  ilike(coluna: string, valor: unknown) { this.filtros.push({ metodo: "ilike", coluna, valor }); return this; }
  gte(coluna: string, valor: unknown) { this.filtros.push({ metodo: "gte", coluna, valor }); return this; }
  lte(coluna: string, valor: unknown) { this.filtros.push({ metodo: "lte", coluna, valor }); return this; }
  or() { return this; }
  order(coluna: string, opcoes?: { ascending?: boolean }) {
    this.ordens.push({ coluna, ascending: opcoes?.ascending !== false });
    return this;
  }

  private resultado(limite?: number) {
    let data = this.linhas.filter((linha) => this.filtros.every((filtro) => {
      const atual = linha[filtro.coluna];
      if (filtro.metodo === "eq") return atual === filtro.valor;
      if (filtro.metodo === "gte") return String(atual ?? "") >= String(filtro.valor);
      if (filtro.metodo === "lte") return String(atual ?? "") <= String(filtro.valor);
      return String(atual ?? "").toLocaleLowerCase("pt-BR")
        .includes(String(filtro.valor).replaceAll("%", "").toLocaleLowerCase("pt-BR"));
    }));
    for (const ordem of [...this.ordens].reverse()) {
      data = data.sort((a, b) => {
        const comparacao = String(a[ordem.coluna] ?? "").localeCompare(String(b[ordem.coluna] ?? ""));
        return ordem.ascending ? comparacao : -comparacao;
      });
    }
    return { data: limite == null ? data : data.slice(0, limite), error: null };
  }

  limit(limite: number) { return Promise.resolve(this.resultado(limite)); }
  maybeSingle() {
    const resultado = this.resultado();
    return Promise.resolve({ data: resultado.data[0] || null, error: null });
  }
}

class SupabaseFake {
  consultas: Array<{ tabela: string; query: ConsultaFake }> = [];

  constructor(private readonly tabelas: Record<string, Linha[]>) {}

  from(tabela: string) {
    const query = new ConsultaFake(this.tabelas[tabela] || []);
    this.consultas.push({ tabela, query });
    return query;
  }
}

const contextoVisual = {
  rota: "/pipeline",
  pagina: "Pipeline",
  superficie: "drawer" as const,
  entidade: { tipo: "imovel" as const, id: "imovel-1" },
};

const imovelAtual: Linha = {
  id: "imovel-1",
  user_id: "user-1",
  codigo: "LD-601",
  referencia_crm: "CRM-601",
  endereco: "Rua da Fase 6, 100",
  bairro: "Centro",
  cidade: "Londrina",
  estado: "PR",
  unidade: null,
  bloco: null,
  edificio: null,
  tipo: "Apartamento",
  proprietario_nome: "Marina",
  proprietario_telefone: "43999999999",
  forma_abordagem: null,
  origem_imovel: "Indicação",
  data_angariacao: "2026-08-01",
  responsavel: "João",
  status: "Publicado",
  status_history: [{ status: "Angariado", date: "2026-08-10", source: "usuario" }],
  notas: [{ id: "nota-privada", texto: "Conteúdo privado da conversa", data: "2026-08-20T10:00", origem: "webhook-evolution" }],
  tentativas: [],
  pausado_ate: null,
  importado: false,
  retirado: false,
  updated_at: "2026-09-04T15:00:00Z",
};

function pedido(mensagem: string, historico: Array<{ papel: "usuario" | "assistente"; texto: string }> = []) {
  return { mensagem, contexto: contextoVisual, historico };
}

describe("seleção do contexto tipado do Assistente", () => {
  it("seleciona somente imóvel e Agenda para compromisso da entidade visual", () => {
    const selecao = selecionarContextoAssistente("Qual é o próximo compromisso desse imóvel?", contextoVisual);

    expect(selecao.capacidades).toContain("consultar_agenda");
    expect(selecao.blocos).toEqual(expect.arrayContaining(["agenda", "imovel"]));
    expect(selecao.blocos).not.toEqual(expect.arrayContaining(["protocolos", "mercado", "avaliacao"]));
  });

  it("não inventa suporte a avaliação ou mercado", () => {
    const selecao = selecionarContextoAssistente("Faça uma avaliação de mercado deste imóvel.", contextoVisual);

    expect(selecao.blocos).not.toEqual(expect.arrayContaining(["avaliacao", "mercado", "imovel"]));
  });

  it("mantém a política de confirmação independente do contexto carregado", () => {
    const selecao = selecionarContextoAssistente("Agende uma visita para este imóvel amanhã às 15h.", contextoVisual);

    expect(selecao.capacidades).toContain("agendar_visita");
    expect(selecao.blocos).toContain("imovel");
    expect(politicaDaAcaoAssistente("agendar_visita")).toMatchObject({ nivel: "high", modo: "confirmacao" });
  });
});

describe("loaders do contexto tipado do Assistente", () => {
  it("carrega imóvel e compromisso atuais com filtro explícito do usuário", async () => {
    const hoje = todayISO();
    const fake = new SupabaseFake({
      imoveis: [imovelAtual, { ...imovelAtual, id: "imovel-outro", user_id: "user-2", codigo: "PRIVADO" }],
      agenda: [
        { id: "agenda-1", user_id: "user-1", title: "Visita", type: "Visita", date: hoje, hora: "14:00", done: false, imovel_id: "imovel-1", origin: "usuario", updated_at: "2026-09-05T08:00:00Z" },
        { id: "agenda-outro", user_id: "user-2", title: "Segredo", type: "Ligação", date: hoje, hora: "13:00", done: false, imovel_id: "imovel-1", origin: "usuario" },
      ],
    });

    const carregado = await carregarContextoTipadoAssistente(
      pedido("Qual é o próximo compromisso desse imóvel?"),
      fake as unknown as SupabaseClient,
      "user-1",
    );

    expect(carregado.contexto.imovel).toMatchObject({
      estado: "disponivel",
      fonte: "imoveis",
      autoridade: "dado_estruturado_atual",
      dados: { codigo: "LD-601", statusAtual: "Publicado", proprietarioNome: "Marina" },
    });
    expect(carregado.contexto.agenda).toMatchObject({
      estado: "disponivel",
      temporalidade: "agendado",
      dados: { escopo: "imovel", itens: [{ titulo: "Visita", data: hoje, hora: "14:00" }] },
    });
    expect(fake.consultas.map(({ tabela }) => tabela)).toEqual(["imoveis", "agenda"]);
    for (const { query } of fake.consultas) {
      expect(query.filtros).toContainEqual({ metodo: "eq", coluna: "user_id", valor: "user-1" });
    }
  });

  it("serializa o mínimo operacional sem IDs internos, telefone ou conteúdo de notas", async () => {
    const fake = new SupabaseFake({ imoveis: [imovelAtual] });
    const { contexto } = await carregarContextoTipadoAssistente(
      pedido("Mostre o histórico do imóvel."),
      fake as unknown as SupabaseClient,
      "user-1",
    );
    const serializado = serializarContextoTipadoAssistente(contexto);

    expect(serializado).toContain('"statusAtual":"Publicado"');
    expect(serializado).toContain('"autoridade":"dado_estruturado_atual"');
    expect(serializado).toContain('"temporalidade":"atual"');
    expect(serializado).not.toContain("user-1");
    expect(serializado).not.toContain("imovel-1");
    expect(serializado).not.toContain("43999999999");
    expect(serializado).not.toContain("Conteúdo privado da conversa");
  });

  it("representa ausência e não busca a Agenda global quando a entidade não pertence ao usuário", async () => {
    const fake = new SupabaseFake({
      imoveis: [{ ...imovelAtual, user_id: "user-2" }],
      agenda: [{ id: "agenda-outro", user_id: "user-2", title: "Segredo", type: "Ligação", date: todayISO(), done: false, imovel_id: "imovel-1" }],
    });
    const { contexto } = await carregarContextoTipadoAssistente(
      pedido("Qual é o próximo compromisso desse imóvel?"),
      fake as unknown as SupabaseClient,
      "user-1",
    );

    expect(contexto.imovel).toMatchObject({ estado: "ausente", dados: null, motivoAusencia: "imovel_ausente_no_escopo_do_usuario" });
    expect(contexto.agenda).toMatchObject({ estado: "ausente", dados: null, motivoAusencia: "imovel_de_referencia_ausente" });
    expect(fake.consultas.map(({ tabela }) => tabela)).toEqual(["imoveis"]);
  });

  it("mantém estado atual acima da memória conversacional histórica", async () => {
    const fake = new SupabaseFake({ imoveis: [imovelAtual] });
    const { contexto } = await carregarContextoTipadoAssistente(
      pedido("Qual é o status deste imóvel?", [
        { papel: "assistente", texto: "O imóvel estava em Angariado." },
      ]),
      fake as unknown as SupabaseClient,
      "user-1",
    );
    const serializado = serializarContextoTipadoAssistente(contexto);

    expect(contexto.imovel?.dados?.statusAtual).toBe("Publicado");
    expect(serializado).toContain("Dados estruturados atuais prevalecem");
    expect(serializado).not.toContain("O imóvel estava em Angariado");
  });

  it("carrega catálogo de protocolos apenas para intenção comercial e separa sua autoridade", async () => {
    const fake = new SupabaseFake({
      protocolos: [{
        id: "protocolo-1",
        user_id: "user-1",
        tipo: "informacao_comercial",
        titulo: "Taxa de administração",
        conteudo: "10% sobre o aluguel",
        arquivado: false,
        created_at: "2026-08-01T10:00:00Z",
      }],
    });
    const { contexto, catalogoProtocolos } = await carregarContextoTipadoAssistente(
      pedido("Qual é a taxa de administração?"),
      fake as unknown as SupabaseClient,
      "user-1",
    );
    const serializado = serializarContextoTipadoAssistente(contexto);

    expect(fake.consultas.map(({ tabela }) => tabela)).toEqual(["protocolos"]);
    expect(contexto.protocolos).toMatchObject({ autoridade: "protocolo", temporalidade: "atual" });
    expect(catalogoProtocolos.protocolos).toHaveLength(1);
    expect(serializado).toContain("Taxa de administração");
    expect(serializado).not.toContain("10% sobre o aluguel");
  });

  it("mantém protocolo e fato operacional em blocos de autoridade distintos", async () => {
    const fake = new SupabaseFake({
      imoveis: [imovelAtual],
      protocolos: [{
        id: "protocolo-1",
        user_id: "user-1",
        tipo: "informacao_comercial",
        titulo: "Taxa de administração",
        conteudo: "10% sobre o aluguel",
        arquivado: false,
        created_at: "2026-08-01T10:00:00Z",
      }],
    });
    const { contexto } = await carregarContextoTipadoAssistente(
      pedido("Qual é a taxa de administração deste imóvel?"),
      fake as unknown as SupabaseClient,
      "user-1",
    );

    expect(contexto.imovel).toMatchObject({
      fonte: "imoveis",
      autoridade: "dado_estruturado_atual",
      dados: { statusAtual: "Publicado" },
    });
    expect(contexto.protocolos).toMatchObject({
      fonte: "protocolos",
      autoridade: "protocolo",
      dados: { catalogo: [{ id: "protocolo-1", titulo: "Taxa de administração" }] },
    });
  });

  it("não consulta tabelas para uma saudação sem intenção reconhecida", async () => {
    const fake = new SupabaseFake({ imoveis: [imovelAtual] });
    const { contexto } = await carregarContextoTipadoAssistente(
      pedido("Olá, bom dia!"),
      fake as unknown as SupabaseClient,
      "user-1",
    );

    expect(contexto.base.blocosSelecionados).toEqual([]);
    expect(fake.consultas).toHaveLength(0);
  });
});
