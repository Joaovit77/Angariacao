/* Testes do eixo do TEMPO na meta (lib/calculo/projecao.ts).
   Julho de 2026 é o mês usado nos exemplos: começa numa quarta (01/07/2026),
   termina numa sexta (31/07/2026) e tem 23 dias úteis. */
import { describe, expect, it } from "vitest";
import { diasUteisEntre, primeiroDiaDoMes, ultimoDiaDoMes } from "@/lib/datas";
import { projetarMeta, textoProjecao, tomProjecao } from "@/lib/calculo/projecao";

const fmtTotal = (v: number) => String(Math.round(v));
const fmtTaxa = (v: number) => v.toFixed(1).replace(".", ",");

describe("helpers de calendário", () => {
  it("acha o último dia de meses de tamanhos diferentes", () => {
    expect(ultimoDiaDoMes("2026-07")).toBe("2026-07-31");
    expect(ultimoDiaDoMes("2026-02")).toBe("2026-02-28");
    expect(ultimoDiaDoMes("2024-02")).toBe("2024-02-29"); // bissexto
    expect(ultimoDiaDoMes("2026-04")).toBe("2026-04-30");
    expect(primeiroDiaDoMes("2026-07")).toBe("2026-07-01");
  });

  it("conta dias úteis inclusive nas duas pontas, sem sábado e domingo", () => {
    expect(diasUteisEntre("2026-07-01", "2026-07-31")).toBe(23);
    // 04/07/2026 é sábado e 05/07 domingo — o fim de semana não conta.
    expect(diasUteisEntre("2026-07-04", "2026-07-05")).toBe(0);
    // Sexta a segunda = 2 dias úteis (03 e 06).
    expect(diasUteisEntre("2026-07-03", "2026-07-06")).toBe(2);
    // Um único dia útil conta 1; intervalo invertido conta 0.
    expect(diasUteisEntre("2026-07-08", "2026-07-08")).toBe(1);
    expect(diasUteisEntre("2026-07-10", "2026-07-01")).toBe(0);
  });
});

describe("projetarMeta", () => {
  it("sem meta definida não projeta nada", () => {
    const p = projetarMeta(3, 0, "2026-07", "2026-07-15");
    expect(p.situacao).toBe("sem-meta");
    expect(p.porDiaUtil).toBeNull();
    expect(textoProjecao(p, fmtTotal, fmtTaxa)).toBeNull();
  });

  it("meta batida é batida, mesmo faltando mês", () => {
    const p = projetarMeta(12, 10, "2026-07", "2026-07-15");
    expect(p.situacao).toBe("atingida");
    expect(p.falta).toBe(0);
    expect(p.porDiaUtil).toBeNull();
    expect(textoProjecao(p, fmtTotal, fmtTaxa)).toContain("de sobra");
  });

  it("mês já encerrado não projeta — sobra o realizado", () => {
    const p = projetarMeta(4, 10, "2026-06", "2026-07-15");
    expect(p.situacao).toBe("encerrado");
    expect(p.projecao).toBe(4);
    expect(textoProjecao(p, fmtTotal, fmtTaxa)).toBeNull();
  });

  it("no ritmo: quem fez 8 em 8 dias úteis fecha os 23 acima de uma meta de 20", () => {
    // 01/07 a 10/07 = 8 dias úteis; 10/07 a 31/07 = 16 dias úteis (inclui hoje).
    const p = projetarMeta(8, 20, "2026-07", "2026-07-10");
    expect(p.diasUteisDecorridos).toBe(8);
    expect(p.diasUteisRestantes).toBe(16);
    expect(p.ritmoDiario).toBe(1);
    // 8 + 1/dia × 15 dias úteis depois de hoje = 23.
    expect(p.projecao).toBe(23);
    expect(p.situacao).toBe("no-ritmo");
    expect(tomProjecao(p.situacao)).toBe("pos");
  });

  it("fora do ritmo: 2 em 8 dias úteis não chega perto de 20", () => {
    const p = projetarMeta(2, 20, "2026-07", "2026-07-10");
    expect(p.ritmoDiario).toBe(0.25);
    expect(p.projecao).toBeCloseTo(5.75, 2);
    expect(p.situacao).toBe("fora-do-ritmo");
    expect(tomProjecao(p.situacao)).toBe("bad");
    // Faltam 18 em 16 dias úteis restantes.
    expect(p.porDiaUtil).toBeCloseTo(18 / 16, 4);
  });

  it("aperto: fecha abaixo da meta, mas dentro de 80% dela", () => {
    // 7 em 8 dias úteis → projeção 20,125 contra meta 25 (80% = 20).
    const p = projetarMeta(7, 25, "2026-07", "2026-07-10");
    expect(p.projecao).toBeCloseTo(20.125, 3);
    expect(p.situacao).toBe("aperto");
    expect(tomProjecao(p.situacao)).toBe("warn");
  });

  it("o dia corrente não é extrapolado duas vezes", () => {
    // No ÚLTIMO dia útil do mês não há dia seguinte: a projeção é o realizado.
    const p = projetarMeta(5, 10, "2026-07", "2026-07-31");
    expect(p.diasUteisRestantes).toBe(1);
    expect(p.projecao).toBe(5);
    expect(p.porDiaUtil).toBe(5); // tudo o que falta, hoje
  });

  it("num fim de semana ainda há o resto do mês, mas nenhum dia útil já decorrido conta a mais", () => {
    // 04/07/2026 é sábado: dias úteis decorridos = 01, 02, 03 = 3.
    const p = projetarMeta(3, 10, "2026-07", "2026-07-04");
    expect(p.diasUteisDecorridos).toBe(3);
    expect(p.ritmoDiario).toBe(1);
    // 04/07 a 31/07 = 20 dias úteis; hoje (sábado) não é um deles.
    expect(p.diasUteisRestantes).toBe(20);
  });

  it("primeiro dia útil do mês: ritmo existe sem divisão por zero", () => {
    const p = projetarMeta(0, 10, "2026-07", "2026-07-01");
    expect(p.diasUteisDecorridos).toBe(1);
    expect(p.ritmoDiario).toBe(0);
    expect(p.projecao).toBe(0);
    expect(p.situacao).toBe("fora-do-ritmo");
    expect(p.porDiaUtil).toBeCloseTo(10 / 23, 4);
  });

  it("o texto diz o esforço que falta, não probabilidade", () => {
    const p = projetarMeta(2, 20, "2026-07", "2026-07-10");
    const texto = textoProjecao(p, fmtTotal, fmtTaxa);
    expect(texto).toContain("No seu ritmo (0,3/dia útil)");
    expect(texto).toContain("o mês fecha em 6");
    expect(texto).toContain("Para bater: 1,1/dia útil nos 16 que faltam");
    expect(texto).not.toContain("%");
  });
});
