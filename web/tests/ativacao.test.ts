import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { estadoAtivacao } from "@/lib/calculo/ativacao";
import type { AgendaItem, Imovel, Meta, Metas } from "@/lib/tipos";

const MES = "2026-08";
const META: Meta = { angariacoes: 4, locados: 0, comissao: 0, faturamento: 0 };

function imovel(over: Partial<Imovel> = {}): Imovel {
  return { id: "i1", endereco: "Rua A, 10", status: "Novo contato", ...over };
}

function compromisso(over: Partial<AgendaItem> = {}): AgendaItem {
  return {
    id: "a1",
    title: "Retornar proprietário",
    type: "Retorno ao proprietário",
    date: "2026-08-26",
    imovelId: "i1",
    done: false,
    isVerificacaoDisponibilidade: false,
    ...over,
  };
}

function calcular(imoveis: Imovel[] = [], agenda: AgendaItem[] = [], metas: Metas = {}) {
  return estadoAtivacao({ imoveis, agenda, metas, mesAtual: MES });
}

describe("estadoAtivacao", () => {
  it("identifica a conta completamente vazia", () => {
    const ativacao = calcular();
    expect(ativacao.estado).toBe("vazia");
    expect(ativacao.concluidas).toBe(0);
  });

  it("entra em andamento com o primeiro imóvel cadastrado", () => {
    const ativacao = calcular([imovel()]);
    expect(ativacao.estado).toBe("andamento");
    expect(ativacao.etapas[0]).toEqual({ id: "primeiro-imovel", concluida: true });
  });

  it("reconhece o primeiro contato por uma tentativa registrada", () => {
    const ativacao = calcular([imovel({ tentativas: [{ id: "t1", data: "2026-08-25T10:00", resultado: "sem-resposta" }] })]);
    expect(ativacao.etapas.find((etapa) => etapa.id === "primeiro-contato")?.concluida).toBe(true);
  });

  it("reconhece somente uma próxima ação pendente vinculada à carteira", () => {
    expect(calcular([imovel()], [compromisso()]).etapas.find((e) => e.id === "proxima-acao")?.concluida).toBe(true);
    expect(calcular([imovel()], [compromisso({ done: true })]).etapas.find((e) => e.id === "proxima-acao")?.concluida).toBe(false);
    expect(calcular([imovel()], [compromisso({ imovelId: "de-outra-carteira" })]).etapas.find((e) => e.id === "proxima-acao")?.concluida).toBe(false);
  });

  it("reconhece uma meta definida no mês atual", () => {
    expect(calcular([imovel()], [], { [MES]: META }).etapas.find((e) => e.id === "meta-mensal")?.concluida).toBe(true);
    expect(calcular([imovel()], [], { "2026-07": META }).etapas.find((e) => e.id === "meta-mensal")?.concluida).toBe(false);
  });

  it("conclui e faz o checklist desaparecer quando as quatro etapas estão prontas", () => {
    const completo = imovel({ tentativas: [{ id: "t1", data: "2026-08-25T10:00", resultado: "respondeu" }] });
    expect(calcular([completo], [compromisso()], { [MES]: META })).toMatchObject({
      estado: "concluida",
      concluidas: 4,
      total: 4,
    });
  });

  it("usa somente o recorte da conta recebido do carregamento sob RLS", () => {
    const dadosPorConta = {
      atual: { imoveis: [] as Imovel[], agenda: [] as AgendaItem[], metas: {} as Metas },
      outra: {
        imoveis: [imovel({ tentativas: [{ id: "t1", data: "2026-08-25T10:00", resultado: "respondeu" }] })],
        agenda: [compromisso()],
        metas: { [MES]: META },
      },
    };
    expect(estadoAtivacao({ ...dadosPorConta.atual, mesAtual: MES }).estado).toBe("vazia");
  });

  it("mantém orientação em andamento mesmo sem ação calculada no Foco do Dia", () => {
    const ativacao = calcular([imovel({ statusHistory: [] })]);
    expect(ativacao.estado).toBe("andamento");
    expect(ativacao.etapas.some((etapa) => !etapa.concluida)).toBe(true);
  });
});

describe("integração visual da ativação", () => {
  const COMPONENTE = readFileSync(new URL("../components/home/AtivacaoInicial.tsx", import.meta.url), "utf8");
  const HOME = readFileSync(new URL("../components/home/HomeView.tsx", import.meta.url), "utf8");
  const CALCULO = readFileSync(new URL("../lib/calculo/ativacao.ts", import.meta.url), "utf8");

  it("liga as três ações da conta vazia aos fluxos existentes", () => {
    expect(COMPONENTE).toContain('abrirModal("importar")');
    expect(COMPONENTE).toContain('abrirModal("preCadastro")');
    expect(COMPONENTE).toContain('router.push("/central-angariacao")');
  });

  it("preserva a Home normal depois do primeiro imóvel", () => {
    expect(HOME).toContain("!contaVazia");
    expect(HOME).toContain("<PlanoExecucao />");
    expect(HOME).toContain("<PanoramaDoDia />");
  });

  it("não carrega nem promove dados de demonstração", () => {
    expect(COMPONENTE + HOME + CALCULO).not.toMatch(/dadosDemo|seedDemoData|Carregar dados de exemplo/);
  });
});
