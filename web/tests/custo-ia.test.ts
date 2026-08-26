/* Custo da IA (lib/calculo/custoIa) — a conversão de tokens em dinheiro.

   O que estes testes guardam é a regra que dá forma ao módulo:
   **modelo sem preço não vira número inventado**. Numa tela de custo o
   número errado é o mais difícil de perceber — ninguém confere uma
   coluna de dólares que parece plausível —, então a ausência tem que
   sobreviver a qualquer refatoração futura. */
import { describe, expect, it } from "vitest";
import {
  custoDaChamada,
  fmtUsd,
  gastoMensalPorCorretor,
  gastoPorCorretor,
  gastoPorMes,
  PRECOS,
  precoConferido,
  somarGasto,
  ultimosMeses,
  type UsoIa,
} from "@/lib/calculo/custoIa";

const MODELO = "gpt-5.4-mini";

function uso(over: Partial<UsoIa> = {}): UsoIa {
  return {
    userId: "u1",
    tipo: "resumo-dia",
    modelo: MODELO,
    tokensEntrada: 1000,
    tokensEntradaCache: 0,
    tokensSaida: 500,
    criadoEm: "2026-08-01T10:00:00Z",
    ...over,
  };
}

describe("custoDaChamada", () => {
  it("multiplica entrada e saída pelos preços do modelo", () => {
    const preco = PRECOS[MODELO];
    const esperado = (1000 / 1e6) * preco.entradaPor1M + (500 / 1e6) * preco.saidaPor1M;
    expect(custoDaChamada(uso())).toBeCloseTo(esperado, 10);
  });

  it("devolve null — e não zero — para modelo sem preço cadastrado", () => {
    // Zero seria pior que null: somaria silenciosamente ao total e a tela
    // exibiria um custo menor que o real com cara de exato.
    expect(custoDaChamada(uso({ modelo: "modelo-que-nao-existe" }))).toBeNull();
  });

  it("chamada sem tokens custa zero, não null", () => {
    expect(custoDaChamada(uso({ tokensEntrada: 0, tokensSaida: 0 }))).toBe(0);
  });
});

describe("custoDaChamada — cache de entrada", () => {
  const preco = PRECOS[MODELO];

  it("desconta o cacheado da entrada em vez de somar por cima", () => {
    /* O erro que este teste existe para pegar: `prompt_tokens` da OpenAI
       JÁ INCLUI os cacheados. Quem somar as duas parcelas fatura o mesmo
       token duas vezes — e o resultado ainda parece plausível, que é o
       pior tipo de erro numa tela de dinheiro. */
    const comCache = custoDaChamada(uso({ tokensEntrada: 1000, tokensEntradaCache: 800 })) as number;

    const esperado =
      (200 / 1e6) * preco.entradaPor1M + // os 200 não cacheados
      (800 / 1e6) * (preco.entradaCachePor1M as number) + // os 800 do cache
      (500 / 1e6) * preco.saidaPor1M;
    expect(comCache).toBeCloseTo(esperado, 10);

    // E tem que ser MAIS BARATO que a mesma chamada sem cache.
    expect(comCache).toBeLessThan(custoDaChamada(uso()) as number);
  });

  it("cache igual à entrada inteira zera a parcela cheia", () => {
    const c = custoDaChamada(uso({ tokensEntrada: 1000, tokensEntradaCache: 1000 })) as number;
    const esperado = (1000 / 1e6) * (preco.entradaCachePor1M as number) + (500 / 1e6) * preco.saidaPor1M;
    expect(c).toBeCloseTo(esperado, 10);
  });

  it("cache maior que a entrada não vira desconto negativo", () => {
    // Contrato quebrado da API ou campo mal lido: a parcela cheia vai a
    // zero, nunca negativa abatendo o resto da conta.
    const c = custoDaChamada(uso({ tokensEntrada: 100, tokensEntradaCache: 999999 })) as number;
    expect(c).toBeGreaterThan(0);
    expect(c).toBeGreaterThanOrEqual((500 / 1e6) * preco.saidaPor1M);
  });

  it("modelo sem preço de cache cobra o cacheado como entrada normal", () => {
    // A transcrição não publica preço de cache. Ignorar o campo aqui erra
    // para MAIS, que é a direção segura.
    const transcricao = "gpt-4o-mini-transcribe-2025-12-15";
    expect(PRECOS[transcricao].entradaCachePor1M).toBeUndefined();
    const comCache = custoDaChamada(uso({ modelo: transcricao, tokensEntradaCache: 800 }));
    const semCache = custoDaChamada(uso({ modelo: transcricao, tokensEntradaCache: 0 }));
    expect(comCache).toBe(semCache);
  });

  it("uso antigo, sem o campo, é cobrado cheio", () => {
    // As linhas gravadas antes da coluna existir chegam com 0 (default do
    // banco). O valor delas não pode mudar retroativamente.
    const semCampo = { modelo: MODELO, tokensEntrada: 1000, tokensSaida: 500 };
    expect(custoDaChamada(semCampo)).toBeCloseTo(custoDaChamada(uso()) as number, 10);
  });

  it("cobra gravação de cache do GPT-5.6 a 1,25x sem duplicar tokens", () => {
    const modelo = "gpt-5.6-terra";
    const preco56 = PRECOS[modelo];
    const custo = custoDaChamada(uso({
      modelo,
      tokensEntrada: 1000,
      tokensEntradaCache: 200,
      tokensEntradaCacheGravacao: 300,
      tokensSaida: 0,
    })) as number;
    const esperado =
      (500 / 1e6) * preco56.entradaPor1M +
      (200 / 1e6) * (preco56.entradaCachePor1M as number) +
      (300 / 1e6) * (preco56.entradaCacheGravacaoPor1M as number);
    expect(custo).toBeCloseTo(esperado, 10);
  });
});

describe("somarGasto", () => {
  it("soma tokens, custo e chamadas", () => {
    const g = somarGasto([uso({ tokensEntradaCache: 100 }), uso({ tokensEntradaCache: 100 })]);
    expect(g.chamadas).toBe(2);
    expect(g.tokensEntradaCache).toBe(200);
    expect(g.tokensEntrada).toBe(2000);
    expect(g.tokensSaida).toBe(1000);
    // Contra a chamada COM cache — somar duas chamadas cacheadas e
    // comparar com o preço cheio ignoraria o desconto.
    expect(g.custoUsd).toBeCloseTo((custoDaChamada(uso({ tokensEntradaCache: 100 })) as number) * 2, 10);
  });

  it("separa o que não tem preço em vez de descartar ou zerar", () => {
    const g = somarGasto([uso(), uso({ modelo: "modelo-novo" })]);
    // A chamada sem preço continua contada (o trabalho aconteceu)...
    expect(g.chamadas).toBe(2);
    // ...mas não entra no dinheiro, e a tela sabe dizer o que falta.
    expect(g.chamadasSemPreco).toBe(1);
    expect(g.modelosSemPreco).toEqual(["modelo-novo"]);
    expect(g.custoUsd).toBeCloseTo(custoDaChamada(uso()) as number, 10);
  });

  it("marca preço não conferido, nos dois sentidos", () => {
    // O aviso é o que impede a tabela de envelhecer em silêncio: sem ele,
    // o painel seguiria somando com valores de meses atrás e a diferença
    // só apareceria na fatura. Testado nas duas direções para não virar
    // um assert que passa por acidente.
    expect(precoConferido(MODELO)).toBe(true);
    expect(somarGasto([uso()]).temPrecoNaoConferido).toBe(false);
    expect(somarGasto([uso({ modelo: "modelo-sem-preco" })]).temPrecoNaoConferido).toBe(true);
  });

  it("todo modelo da tabela tem preço conferido por uma pessoa", () => {
    // Guarda contra acrescentar um modelo novo e esquecer de conferir o
    // preço dele — o painel avisaria, mas só depois de alguém usar.
    for (const [modelo, preco] of Object.entries(PRECOS)) {
      expect(preco.conferidoEm, `${modelo} sem conferidoEm`).toBeTruthy();
      expect(preco.entradaPor1M).toBeGreaterThan(0);
      expect(preco.saidaPor1M).toBeGreaterThanOrEqual(0);
    }
  });

  it("quebra o gasto por tipo, do mais caro para o mais barato", () => {
    const g = somarGasto([
      uso({ tipo: "resumo-dia", tokensSaida: 10 }),
      uso({ tipo: "transcricao", tokensSaida: 5000 }),
      uso({ tipo: "transcricao", tokensSaida: 5000 }),
    ]);
    expect(g.porTipo[0].tipo).toBe("transcricao");
    expect(g.porTipo[0].chamadas).toBe(2);
    expect(g.porTipo[1].tipo).toBe("resumo-dia");
  });

  it("lista vazia não quebra", () => {
    const g = somarGasto([]);
    expect(g.chamadas).toBe(0);
    expect(g.custoUsd).toBe(0);
    expect(g.porTipo).toEqual([]);
  });
});

describe("gastoPorCorretor", () => {
  it("agrupa por usuário", () => {
    const mapa = gastoPorCorretor([uso({ userId: "a" }), uso({ userId: "a" }), uso({ userId: "b" })]);
    expect(mapa.get("a")?.chamadas).toBe(2);
    expect(mapa.get("b")?.chamadas).toBe(1);
  });

  it("mantém o gasto de conta removida em vez de descartá-lo", () => {
    // `on delete set null` na tabela: a conta sumiu, o dinheiro foi gasto.
    // Descartar aqui faria o total do painel não bater com a fatura.
    const mapa = gastoPorCorretor([uso({ userId: null })]);
    expect(mapa.get("")?.chamadas).toBe(1);
    expect(mapa.get("")?.userId).toBeNull();
  });
});

describe("ultimosMeses", () => {
  it("atravessa a virada do ano para trás", () => {
    // O caso que a aritmética ingênua erra: mês 1 menos 1 não é mês 0.
    expect(ultimosMeses("2026-02-15", 4)).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
  });

  it("devolve em ordem cronológica, terminando no mês de hoje", () => {
    const meses = ultimosMeses("2026-08-06", 6);
    expect(meses).toHaveLength(6);
    expect(meses[5]).toBe("2026-08");
    expect(meses[0]).toBe("2026-03");
  });
});

describe("gastoPorMes", () => {
  it("mês sem chamada nenhuma entra como ZERO, e não some da série", () => {
    /* A regra que dá forma à função. Um buraco na sequência se lê como
       "não tenho esse dado"; um zero se lê como "não gastou nada" — e a
       diferença entre as duas leituras é exatamente o que se está
       tentando ver ao olhar para a série. */
    const serie = gastoPorMes([uso({ criadoEm: "2026-08-02T10:00:00Z" })], "2026-08-06", 3);
    expect(serie.map((m) => m.mes)).toEqual(["2026-06", "2026-07", "2026-08"]);
    expect(serie[0].chamadas).toBe(0);
    expect(serie[0].custoUsd).toBe(0);
    expect(serie[2].chamadas).toBe(1);
  });

  it("ignora chamada fora da janela em vez de criar um mês solto", () => {
    // Uma ponta a mais na série é um ponto que a tela não sabe desenhar.
    const serie = gastoPorMes([uso({ criadoEm: "2025-01-02T10:00:00Z" })], "2026-08-06", 3);
    expect(serie).toHaveLength(3);
    expect(serie.every((m) => m.chamadas === 0)).toBe(true);
  });

  it("conta a chamada sem preço à parte, sem somá-la ao custo", () => {
    // Mesma regra do `somarGasto`: modelo sem preço não vira número
    // inventado numa tela de dinheiro.
    const serie = gastoPorMes(
      [uso({ modelo: "modelo-que-nao-existe", criadoEm: "2026-08-02T10:00:00Z" })],
      "2026-08-06",
      1,
    );
    expect(serie[0].chamadas).toBe(1);
    expect(serie[0].chamadasSemPreco).toBe(1);
    expect(serie[0].custoUsd).toBe(0);
  });
});

describe("gastoMensalPorCorretor", () => {
  it("separa por conta e guarda as removidas na chave vazia", () => {
    const mapa = gastoMensalPorCorretor(
      [
        uso({ userId: "a", criadoEm: "2026-08-02T10:00:00Z" }),
        uso({ userId: null, criadoEm: "2026-08-03T10:00:00Z" }),
      ],
      "2026-08-06",
      2,
    );
    expect(mapa.get("a")?.at(-1)?.chamadas).toBe(1);
    // `on delete set null`: a conta sumiu, o dinheiro foi gasto.
    expect(mapa.get("")?.at(-1)?.chamadas).toBe(1);
  });
});

describe("fmtUsd", () => {
  it("abre casas decimais quando o valor é menor que um centavo", () => {
    // O caso normal de uma chamada avulsa. Com 2 casas viraria "US$ 0,00"
    // e a coluna inteira seria zeros.
    expect(fmtUsd(0.0004)).toBe("US$ 0,0004");
  });

  it("usa 2 casas em valores normais", () => {
    expect(fmtUsd(12.3456)).toBe("US$ 12,35");
    expect(fmtUsd(0)).toBe("US$ 0,00");
  });
});
