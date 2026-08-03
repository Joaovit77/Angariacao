/* Testes da meta na virada do mês (lib/calculo/metaMes.ts).
   O caso que motivou o módulo: a carteira real tinha meta só de "2026-07" e,
   em 01/08, o painel ficava mudo sem nada pedir a meta nova. */
import { describe, expect, it } from "vitest";
import {
  ajustarAlvoMeta,
  META_VAZIA,
  MESES_BUSCA_META_ANTERIOR,
  PASSO_META_DINHEIRO,
  PASSO_META_UNIDADE,
  passoDaMeta,
  mesAnteriorComMeta,
  metaDoMes,
  metaSugerida,
  precisaDefinirMeta,
  resumoMetaCurto,
  temMeta,
} from "@/lib/calculo/metaMes";
import type { Meta, Metas } from "@/lib/tipos";

const meta = (angariacoes: number, resto: Partial<Meta> = {}): Meta => ({
  angariacoes,
  locados: 0,
  comissao: 0,
  faturamento: 0,
  ...resto,
});

/** O estado real da conta em 28/07/2026: uma única meta, a de julho. */
const METAS_JULHO: Metas = { "2026-07": meta(10, { locados: 2, comissao: 1200 }) };

describe("metaDoMes", () => {
  it("devolve a meta do mês quando ela existe", () => {
    expect(metaDoMes(METAS_JULHO, "2026-07").angariacoes).toBe(10);
  });

  it("cai no fallback vazio no mês que ainda não tem meta", () => {
    expect(metaDoMes(METAS_JULHO, "2026-08")).toEqual(META_VAZIA);
  });
});

describe("temMeta", () => {
  it("zero em tudo é o mesmo que não ter meta", () => {
    expect(temMeta(META_VAZIA)).toBe(false);
    expect(temMeta(undefined)).toBe(false);
    expect(temMeta(null)).toBe(false);
  });

  it("qualquer um dos quatro campos preenchido já é meta", () => {
    expect(temMeta(meta(1))).toBe(true);
    expect(temMeta(meta(0, { locados: 2 }))).toBe(true);
    expect(temMeta(meta(0, { comissao: 500 }))).toBe(true);
    expect(temMeta(meta(0, { faturamento: 3000 }))).toBe(true);
  });
});

describe("mesAnteriorComMeta", () => {
  it("acha o mês imediatamente anterior", () => {
    expect(mesAnteriorComMeta(METAS_JULHO, "2026-08")).toBe("2026-07");
  });

  it("pula meses sem meta e vira o ano para trás", () => {
    const metas: Metas = { "2025-12": meta(8) };
    expect(mesAnteriorComMeta(metas, "2026-03")).toBe("2025-12");
  });

  it("ignora meta zerada — ela não é meta", () => {
    const metas: Metas = { "2026-07": META_VAZIA, "2026-05": meta(6) };
    expect(mesAnteriorComMeta(metas, "2026-08")).toBe("2026-05");
  });

  it("não olha o próprio mês nem o futuro", () => {
    // A meta de agosto existe, mas a pergunta é pelo que veio ANTES de agosto.
    const metas: Metas = { "2026-08": meta(9), "2026-09": meta(4) };
    expect(mesAnteriorComMeta(metas, "2026-08")).toBeNull();
  });

  it("desiste depois do limite de meses", () => {
    const metas: Metas = { "2025-01": meta(5) };
    expect(mesAnteriorComMeta(metas, "2026-08")).toBeNull();
    // Dentro do limite, acha.
    expect(mesAnteriorComMeta(metas, "2026-01", MESES_BUSCA_META_ANTERIOR)).toBe("2025-01");
  });

  it("sem nenhuma meta, não há anterior", () => {
    expect(mesAnteriorComMeta({}, "2026-08")).toBeNull();
  });
});

describe("metaSugerida — o pré-preenchimento", () => {
  it("sugere a meta do mês passado no mês novo, dizendo de onde veio", () => {
    const s = metaSugerida(METAS_JULHO, "2026-08");
    expect(s).not.toBeNull();
    expect(s!.mesOrigem).toBe("2026-07");
    expect(s!.meta.angariacoes).toBe(10);
    expect(s!.meta.locados).toBe(2);
    expect(s!.meta.comissao).toBe(1200);
  });

  it("não sugere nada quando o mês JÁ tem meta — aí o modal edita a que existe", () => {
    expect(metaSugerida(METAS_JULHO, "2026-07")).toBeNull();
  });

  it("não inventa meta para quem nunca definiu nenhuma", () => {
    expect(metaSugerida({}, "2026-08")).toBeNull();
  });
});

describe("resumoMetaCurto", () => {
  it("usa angariações quando há — é a métrica central do painel", () => {
    expect(resumoMetaCurto(meta(10, { locados: 2, comissao: 1200 }))).toBe("10 angariações");
  });

  it("NÃO diz '0 angariações' quando a meta é de outro campo", () => {
    // O caso que motivou a função: uma meta só de comissão exibiria o alvo
    // errado ("0 angariações") como se fosse o que o corretor persegue.
    const so = resumoMetaCurto(meta(0, { comissao: 1200 }));
    expect(so).not.toContain("angariações");
    expect(so).toContain("comissão");
  });

  it("cai para locados e faturamento na ordem de importância", () => {
    expect(resumoMetaCurto(meta(0, { locados: 3 }))).toBe("3 imóveis locados");
    expect(resumoMetaCurto(meta(0, { faturamento: 9000 }))).toContain("faturamento");
  });

  it("meta vazia não descreve nada", () => {
    expect(resumoMetaCurto(META_VAZIA)).toBe("");
  });
});

describe("precisaDefinirMeta — a cobrança na tela", () => {
  it("cobra quem tinha meta no mês passado e não tem neste", () => {
    expect(precisaDefinirMeta(METAS_JULHO, "2026-08")).toBe(true);
  });

  it("não cobra quando a meta do mês já está definida", () => {
    expect(precisaDefinirMeta(METAS_JULHO, "2026-07")).toBe(false);
  });

  it("NÃO cobra quem nunca usou metas — não há hábito a lembrar", () => {
    expect(precisaDefinirMeta({}, "2026-08")).toBe(false);
  });

  it("meta zerada no mês corrente conta como ausente e volta a cobrar", () => {
    const metas: Metas = { "2026-07": meta(10), "2026-08": META_VAZIA };
    expect(precisaDefinirMeta(metas, "2026-08")).toBe(true);
  });

  it("para de cobrar assim que a meta do mês é salva", () => {
    const metas: Metas = { "2026-07": meta(10), "2026-08": meta(12) };
    expect(precisaDefinirMeta(metas, "2026-08")).toBe(false);
  });
});

/* --- Ajuste rápido do alvo no card -----------------------------------------
   O botão existe porque mexer num número da meta exigia abrir o modal e
   preencher quatro campos. Ele vale para a META (número declarado pelo
   corretor) e NÃO para os degraus das conquistas do mês (número alcançado):
   poder escolher o degrau esvaziaria o "completo". */
describe("ajustarAlvoMeta", () => {
  it("sobe e desce pelo passo", () => {
    expect(ajustarAlvoMeta(15, 1)).toBe(16);
    expect(ajustarAlvoMeta(15, -1)).toBe(14);
    expect(ajustarAlvoMeta(1200, 100)).toBe(1300);
  });

  /* Meta negativa não significa nada e estragaria as duas contas que dependem
     do alvo: a barra de progresso e a projeção. */
  it("nunca desce abaixo de zero", () => {
    expect(ajustarAlvoMeta(1, -1)).toBe(0);
    expect(ajustarAlvoMeta(0, -1)).toBe(0);
    expect(ajustarAlvoMeta(50, -100)).toBe(0);
  });

  it("zero é destino válido: é como se apaga uma meta sem abrir o modal", () => {
    expect(ajustarAlvoMeta(1, -1)).toBe(0);
  });

  it("mês ainda sem meta parte do zero em vez de quebrar", () => {
    // O primeiro clique de um mês novo lê a META_VAZIA, não `undefined`.
    expect(ajustarAlvoMeta(META_VAZIA.angariacoes, 1)).toBe(1);
    expect(ajustarAlvoMeta(undefined as unknown as number, 1)).toBe(1);
  });
});

describe("passoDaMeta", () => {
  /* Subir uma comissão de R$ 1 em R$ 1 seriam 1.200 cliques até um alvo comum;
     um passo de 100 em unidades pularia de 10 imóveis para 110. */
  it("dinheiro anda de 100 em 100, unidade de 1 em 1", () => {
    expect(passoDaMeta("money")).toBe(PASSO_META_DINHEIRO);
    expect(passoDaMeta("un.")).toBe(PASSO_META_UNIDADE);
    expect(PASSO_META_DINHEIRO).toBeGreaterThan(PASSO_META_UNIDADE);
  });

  it("meia angariação não existe: o passo de unidade é inteiro", () => {
    expect(Number.isInteger(PASSO_META_UNIDADE)).toBe(true);
  });
});
