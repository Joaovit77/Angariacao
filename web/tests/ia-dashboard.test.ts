/* Contrato das partes puras das leituras do DASHBOARD (lib/calculo/ia).
   Mesma filosofia do ia.test.ts: o texto exato do prompt não importa, as
   garantias sim — os números chegam prontos (a IA não recalcula), as listas
   são truncadas e ordenadas por urgência, e o que não é ação real fica de
   fora do panorama. */
import { describe, expect, it } from "vitest";
import {
  MAX_ITENS_DIA,
  contagemPorStatus,
  mensagemFalhaIa,
  panoramaDoDia,
  promptAnalisarDashboard,
  promptResumoDia,
} from "@/lib/calculo/ia";
import { kpisDashboard } from "@/lib/calculo/dashboard";
import type { AgendaItem, Imovel } from "@/lib/tipos";
import { congelaRelogio } from "./setup-relogio";

congelaRelogio();

// O relógio está em 2026-07-09 (ver setup-relogio).
const HOJE = "2026-07-09";

function imovel(over: Partial<Imovel> & { id: string; status: string }): Imovel {
  return {
    endereco: `Rua ${over.id}`,
    tipo: "Apartamento",
    formaAbordagem: "Ligação telefônica",
    statusHistory: [{ status: over.status, date: "2026-07-01" }],
    ...over,
  };
}

function compromisso(over: Partial<AgendaItem> & { id: string; date: string }): AgendaItem {
  return {
    title: `Retorno ${over.id}`,
    type: "Retorno",
    done: false,
    isVerificacaoDisponibilidade: false,
    ...over,
  };
}

describe("contagemPorStatus", () => {
  it("agrupa a carteira por etapa do funil", () => {
    const contagem = contagemPorStatus([
      imovel({ id: "a", status: "Novo contato" }),
      imovel({ id: "b", status: "Novo contato" }),
      imovel({ id: "c", status: "Angariado" }),
    ]);
    expect(contagem).toContainEqual({ status: "Novo contato", quantidade: 2 });
    expect(contagem).toContainEqual({ status: "Angariado", quantidade: 1 });
  });

  it("não inventa etapa vazia — só aparece o que existe na carteira", () => {
    const contagem = contagemPorStatus([imovel({ id: "a", status: "Angariado" })]);
    expect(contagem).toHaveLength(1);
  });
});

describe("promptAnalisarDashboard", () => {
  const carteira = [
    imovel({ id: "a", status: "Novo contato" }),
    imovel({ id: "b", status: "Angariado" }),
    imovel({ id: "c", status: "Locado", valorAluguel: 2000 }),
  ];

  it("manda interpretar, não recalcular — é o que impede número inventado", () => {
    const p = promptAnalisarDashboard(kpisDashboard(carteira, 100), contagemPorStatus(carteira));
    expect(p).toContain("não os recalcule e não invente nenhum que não esteja aqui");
  });

  it("explica que angariação só conta na etapa Angariado", () => {
    const p = promptAnalisarDashboard(kpisDashboard(carteira, 100), contagemPorStatus(carteira));
    expect(p).toContain("contato feito não conta");
  });

  // Sem esta instrução a IA narra "queda de 50%" quando um imóvel a menos
  // mudou o número de 2 para 1 — estatisticamente vazio e enganoso.
  it("proíbe tratar oscilação de carteira pequena como tendência", () => {
    const p = promptAnalisarDashboard(kpisDashboard(carteira, 100), contagemPorStatus(carteira));
    expect(p).toContain("não é tendência");
  });

  it("leva a distribuição do funil, que é onde o gargalo aparece", () => {
    const p = promptAnalisarDashboard(kpisDashboard(carteira, 100), contagemPorStatus(carteira));
    expect(p).toContain("Distribuição no funil");
    expect(p).toContain("Novo contato: 1");
  });
});

describe("panoramaDoDia", () => {
  it("separa o que vence hoje do que está atrasado", () => {
    const p = panoramaDoDia(
      [imovel({ id: "a", status: "Em negociação" })],
      [
        compromisso({ id: "hoje", date: HOJE, imovelId: "a" }),
        compromisso({ id: "velho", date: "2026-07-02", imovelId: "a" }),
      ],
    );
    expect(p.compromissosHoje).toHaveLength(1);
    expect(p.atrasados).toHaveLength(1);
    expect(p.atrasados[0].dias).toBe(7);
  });

  it("ignora compromisso concluído e compromisso futuro", () => {
    const p = panoramaDoDia(
      [],
      [
        compromisso({ id: "feito", date: "2026-07-01", done: true }),
        compromisso({ id: "futuro", date: "2026-07-30" }),
      ],
    );
    expect(p.compromissosHoje).toHaveLength(0);
    expect(p.atrasados).toHaveLength(0);
  });

  // A truncagem corta do FIM da lista, então sem ordenar por urgência
  // perderíamos justamente os casos mais críticos.
  it("ordena atrasados e parados do mais urgente para o menos", () => {
    const p = panoramaDoDia(
      [],
      [
        compromisso({ id: "pouco", date: "2026-07-07" }),
        compromisso({ id: "muito", date: "2026-06-01" }),
        compromisso({ id: "medio", date: "2026-07-01" }),
      ],
    );
    const dias = p.atrasados.map((a) => a.dias);
    expect(dias).toEqual([...dias].sort((x, y) => y - x));
    expect(dias[0]).toBe(38);
  });

  it("cita o imóvel pelo endereço, para a IA poder referenciá-lo", () => {
    const p = panoramaDoDia(
      [imovel({ id: "a", status: "Em negociação", endereco: "Rua Augusta, 900" })],
      [compromisso({ id: "x", date: HOJE, imovelId: "a" })],
    );
    expect(p.compromissosHoje[0].descricao).toContain("Rua Augusta, 900");
  });

  it("aguenta compromisso órfão sem quebrar", () => {
    const p = panoramaDoDia([], [compromisso({ id: "x", date: HOJE, imovelId: "sumiu" })]);
    expect(p.compromissosHoje[0].descricao).toContain("não identificado");
  });
});

describe("promptResumoDia", () => {
  it("trunca listas longas e diz quantas ficaram de fora", () => {
    const agenda = Array.from({ length: MAX_ITENS_DIA + 5 }, (_, i) =>
      compromisso({ id: `c${i}`, date: "2026-07-01" }),
    );
    const p = promptResumoDia(panoramaDoDia([], agenda));
    expect(p).toContain("e mais 5 item(ns)");
  });

  // Diferente da análise de ranking, "nada pendente" é resposta legítima —
  // não é caso de erro sem-dados.
  it("trata dia vazio como resultado válido, não como falta de dados", () => {
    const p = promptResumoDia(panoramaDoDia([], []));
    expect(p).toContain("Nada vencido");
    expect(p).toContain("sem inventar dado");
  });

  it("proíbe inventar dado de contato que não foi dado", () => {
    const p = promptResumoDia(panoramaDoDia([], []));
    expect(p).toContain("Não invente endereço, nome ou telefone");
  });
});

describe("mensagemFalhaIa — permissão", () => {
  // Confundir as duas mandaria o usuário caçar problema de configuração
  // que não existe: a IA está configurada, a conta é que não tem acesso.
  it("distingue sem-permissao de nao-configurado", () => {
    const semPermissao = mensagemFalhaIa("sem-permissao");
    expect(semPermissao).not.toEqual(mensagemFalhaIa("nao-configurado"));
    expect(semPermissao.toLowerCase()).toContain("acesso");
  });
});
