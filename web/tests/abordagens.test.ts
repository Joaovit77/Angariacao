/* Contrato do ranking de abordagens (lib/calculo/abordagens).
   Feature nova da pós-migração — não há oráculo do app antigo; os testes
   fixam o comportamento: as três medidas independentes (resposta,
   participação na angariação e "destravou"), o corte de amostra mínima,
   o tratamento das tentativas sem roteiro e a ordenação. */
import { describe, expect, it } from "vitest";
import {
  ABORDAGEM_NAO_INFORMADA,
  abordagemQueDestravou,
  canalObservado,
  desempenhoPorAbordagem,
  resultadosPendentes,
  seloTentativas,
  resumoTentativas,
  tentativasOrdenadas,
} from "@/lib/calculo/abordagens";
import type { Abordagem, Imovel, NotaImovel, Tentativa } from "@/lib/tipos";
import type { ResultadoTentativa } from "@/lib/constantes";

/* O ranking passou a DERIVAR o desfecho de cada tentativa a partir do que o
   app observou (ver calculo/resultadoObservado.ts), então precisa saber que
   dia é hoje. Data bem posterior às tentativas dos fixtures de propósito: o
   silêncio delas já é definitivo, e o ranking não muda de valor conforme o
   dia em que a suíte roda. */
const HOJE_RANKING = "2026-12-31";

const CATALOGO: Abordagem[] = [
  { id: "a1", nome: "Avaliação gratuita", arquivada: false },
  { id: "a2", nome: "Imóvel parado há meses?", arquivada: false },
  { id: "a3", nome: "Análise de mercado impressa", arquivada: false },
];

function tentativa(data: string, abordagemId: string | null, resultado: ResultadoTentativa): Tentativa {
  return { id: `t-${data}-${abordagemId}`, data, abordagemId, canal: "WhatsApp", resultado };
}

/** Nota de resposta do proprietário — é o FATO que o app observa para dar a
    tentativa por respondida sem perguntar nada (ver resultadoObservado.ts). */
function respostaEm(data: string): NotaImovel {
  return { id: `wa:${data}`, data, texto: "Resposta pelo WhatsApp: pode ser sim" };
}

/** Imóvel com tentativas; `angariadoEm` empurra a entrada de Angariado no histórico. */
function imovel(over: {
  id: string;
  tentativas: Tentativa[];
  angariadoEm?: string;
  notas?: NotaImovel[];
}): Imovel {
  const hist = [{ status: "Novo contato", date: "2026-01-01" }];
  if (over.angariadoEm) hist.push({ status: "Angariado", date: over.angariadoEm });
  return {
    id: over.id,
    endereco: `Rua ${over.id}`,
    status: over.angariadoEm ? "Angariado" : "Novo contato",
    statusHistory: hist,
    tentativas: over.tentativas,
    notas: over.notas,
  };
}

describe("tentativasOrdenadas", () => {
  it("ordena cronologicamente sem mutar o array do imóvel", () => {
    const original = [
      tentativa("2026-03-10T09:00", "a1", "sem-resposta"),
      tentativa("2026-01-05T14:30", "a2", "respondeu"),
    ];
    const i = imovel({ id: "1", tentativas: original });
    expect(tentativasOrdenadas(i).map((t) => t.data)).toEqual(["2026-01-05T14:30", "2026-03-10T09:00"]);
    expect(original[0].data).toBe("2026-03-10T09:00"); // intacto
  });

  it("aceita imóvel sem a coluna tentativas (registro anterior à feature)", () => {
    const legado: Imovel = { id: "z", endereco: "Rua Z", status: "Novo contato" };
    expect(tentativasOrdenadas(legado)).toEqual([]);
  });
});

describe("canalObservado", () => {
  /** Igual ao helper acima, mas com o canal escolhido caso a caso. */
  function comCanal(data: string, canal: string | null): Tentativa {
    return { id: `t-${data}`, data, abordagemId: "a1", canal, resultado: "sem-resposta" };
  }

  it("devolve o canal da PRIMEIRA tentativa, não o do último follow-up", () => {
    const i = imovel({
      id: "1",
      tentativas: [comCanal("2026-03-02T10:00", "Ligação telefônica"), comCanal("2026-01-04T09:00", "WhatsApp")],
    });
    expect(canalObservado(i)).toBe("WhatsApp");
  });

  it("ignora tentativa sem canal e segue procurando", () => {
    const i = imovel({
      id: "2",
      tentativas: [comCanal("2026-01-04T09:00", null), comCanal("2026-02-01T09:00", "  Visita presencial  ")],
    });
    expect(canalObservado(i)).toBe("Visita presencial");
  });

  it("devolve null sem tentativas — nada a observar, nada a chutar", () => {
    expect(canalObservado(imovel({ id: "3", tentativas: [] }))).toBeNull();
    expect(canalObservado({ id: "z", endereco: "Rua Z", status: "Novo contato" })).toBeNull();
  });
});

describe("abordagemQueDestravou", () => {
  it("credita a última tentativa anterior à angariação", () => {
    const i = imovel({
      id: "1",
      angariadoEm: "2026-02-20",
      tentativas: [
        tentativa("2026-02-01T10:00", "a1", "sem-resposta"),
        tentativa("2026-02-10T10:00", "a2", "respondeu"),
        tentativa("2026-03-01T10:00", "a3", "respondeu"), // depois: não conta
      ],
    });
    expect(abordagemQueDestravou(i)).toBe("a2");
  });

  it("conta a tentativa feita no MESMO dia da angariação", () => {
    const i = imovel({
      id: "1",
      angariadoEm: "2026-02-20",
      tentativas: [
        tentativa("2026-02-01T10:00", "a1", "sem-resposta"),
        tentativa("2026-02-20T16:00", "a3", "agendou"),
      ],
    });
    expect(abordagemQueDestravou(i)).toBe("a3");
  });

  it("retorna null quando o imóvel não foi angariado", () => {
    const i = imovel({ id: "1", tentativas: [tentativa("2026-02-01T10:00", "a1", "respondeu")] });
    expect(abordagemQueDestravou(i)).toBeNull();
  });

  it("retorna null quando a tentativa que destravou não registrou roteiro", () => {
    const i = imovel({
      id: "1",
      angariadoEm: "2026-02-20",
      tentativas: [tentativa("2026-02-10T10:00", null, "agendou")],
    });
    expect(abordagemQueDestravou(i)).toBeNull();
  });
});

describe("desempenhoPorAbordagem", () => {
  it("separa taxa de resposta de participação na angariação e de 'destravou'", () => {
    // a1 abre em 3 imóveis e nunca é respondida; a2 entra depois e fecha 2.
    const imoveis = [
      imovel({
        id: "i1",
        angariadoEm: "2026-02-20",
        tentativas: [
          tentativa("2026-02-01T10:00", "a1", "sem-resposta"),
          tentativa("2026-02-15T10:00", "a2", "agendou"),
        ],
      }),
      imovel({
        id: "i2",
        angariadoEm: "2026-03-05",
        tentativas: [
          tentativa("2026-03-01T10:00", "a1", "sem-resposta"),
          tentativa("2026-03-04T10:00", "a2", "respondeu"),
        ],
      }),
      imovel({
        id: "i3",
        tentativas: [
          tentativa("2026-03-10T10:00", "a1", "sem-resposta"),
          tentativa("2026-03-12T10:00", "a2", "recusou"),
        ],
      }),
    ];
    const r = desempenhoPorAbordagem(imoveis, CATALOGO, HOJE_RANKING);
    const a1 = r.find((x) => x.abordagemId === "a1")!;
    const a2 = r.find((x) => x.abordagemId === "a2")!;

    // a1: 3 tentativas, 0 respostas, sempre como abertura, nunca destravou —
    // mas participou de 2 imóveis angariados (participação ≠ causa).
    expect(a1).toMatchObject({
      tentativas: 3, respostas: 0, taxaResposta: 0,
      imoveis: 3, angariados: 2, aberturas: 3, seguimentos: 0, destravou: 0,
      amostraSuficiente: true,
    });
    expect(a1.taxaAngariacao).toBeCloseTo(66.67, 1);

    // a2: mesma participação, mas responde sempre e destrava as duas.
    expect(a2).toMatchObject({
      tentativas: 3, respostas: 3, taxaResposta: 100,
      imoveis: 3, angariados: 2, aberturas: 0, seguimentos: 3, destravou: 2,
      amostraSuficiente: true,
    });

    // Empate em taxaAngariacao: quem destravou mais vem primeiro.
    expect(r.map((x) => x.abordagemId)).toEqual(["a2", "a1"]);
  });

  it("conta recusa como resposta (o proprietário reagiu) e não como angariação", () => {
    const imoveis = [
      imovel({
        id: "i1",
        tentativas: [
          tentativa("2026-01-01T10:00", "a1", "recusou"),
          tentativa("2026-01-02T10:00", "a1", "recusou"),
          tentativa("2026-01-03T10:00", "a1", "recusou"),
        ],
      }),
    ];
    const [a1] = desempenhoPorAbordagem(imoveis, CATALOGO, HOJE_RANKING);
    expect(a1.taxaResposta).toBe(100);
    expect(a1.angariados).toBe(0);
    expect(a1.taxaAngariacao).toBe(0);
  });

  it("não conta o mesmo imóvel duas vezes quando a abordagem se repete nele", () => {
    const imoveis = [
      imovel({
        id: "i1",
        angariadoEm: "2026-02-10",
        tentativas: [
          tentativa("2026-02-01T10:00", "a1", "sem-resposta"),
          tentativa("2026-02-05T10:00", "a1", "respondeu"),
        ],
      }),
    ];
    const [a1] = desempenhoPorAbordagem(imoveis, CATALOGO, HOJE_RANKING);
    expect(a1.tentativas).toBe(2);
    expect(a1.imoveis).toBe(1);
    expect(a1.angariados).toBe(1);
    expect(a1.taxaAngariacao).toBe(100);
  });

  it("marca amostra insuficiente abaixo de 3 tentativas e joga para o fim do ranking", () => {
    const imoveis = [
      // a3: 1 tentativa, 100% de angariação — não pode encabeçar o ranking.
      imovel({ id: "i1", angariadoEm: "2026-02-10", tentativas: [tentativa("2026-02-01T10:00", "a3", "agendou")] }),
      // a1: 3 tentativas, 1 angariação em 3 imóveis (33%).
      imovel({ id: "i2", angariadoEm: "2026-02-10", tentativas: [tentativa("2026-02-02T10:00", "a1", "respondeu")] }),
      imovel({ id: "i3", tentativas: [tentativa("2026-02-03T10:00", "a1", "sem-resposta")] }),
      imovel({ id: "i4", tentativas: [tentativa("2026-02-04T10:00", "a1", "sem-resposta")] }),
    ];
    const r = desempenhoPorAbordagem(imoveis, CATALOGO, HOJE_RANKING);
    expect(r.map((x) => x.abordagemId)).toEqual(["a1", "a3"]);
    expect(r[0].amostraSuficiente).toBe(true);
    expect(r[1]).toMatchObject({ amostraSuficiente: false, taxaAngariacao: 100 });
  });

  it("ignora tentativas sem roteiro e imóveis sem tentativa alguma", () => {
    const imoveis = [
      imovel({ id: "i1", tentativas: [tentativa("2026-01-01T10:00", null, "respondeu")] }),
      imovel({ id: "i2", tentativas: [] }),
    ];
    expect(desempenhoPorAbordagem(imoveis, CATALOGO, HOJE_RANKING)).toEqual([]);
  });

  it("usa rótulo de fallback quando a abordagem não está mais no catálogo", () => {
    const imoveis = [imovel({ id: "i1", tentativas: [tentativa("2026-01-01T10:00", "sumiu", "respondeu")] })];
    const [r] = desempenhoPorAbordagem(imoveis, [], HOJE_RANKING);
    expect(r.nome).toBe(ABORDAGEM_NAO_INFORMADA);
  });

  it("inclui abordagem arquivada que tem histórico (arquivar não apaga o passado)", () => {
    const catalogo: Abordagem[] = [{ id: "a1", nome: "Avaliação gratuita", arquivada: true }];
    const imoveis = [imovel({ id: "i1", tentativas: [tentativa("2026-01-01T10:00", "a1", "respondeu")] })];
    const [r] = desempenhoPorAbordagem(imoveis, catalogo, HOJE_RANKING);
    expect(r.nome).toBe("Avaliação gratuita");
  });
});

describe("resumoTentativas", () => {
  it("soma o total, o ponto cego sem roteiro e a média de tentativas até angariar", () => {
    const imoveis = [
      imovel({
        id: "i1",
        angariadoEm: "2026-02-20",
        tentativas: [
          tentativa("2026-02-01T10:00", "a1", "sem-resposta"),
          tentativa("2026-02-10T10:00", "a2", "agendou"),
          tentativa("2026-03-01T10:00", null, "respondeu"), // pós-angariação
        ],
      }),
      imovel({
        id: "i2",
        angariadoEm: "2026-03-05",
        tentativas: [tentativa("2026-03-01T10:00", "a2", "agendou")],
      }),
      imovel({ id: "i3", tentativas: [] }),
    ];
    expect(resumoTentativas(imoveis)).toEqual({
      total: 4,
      semAbordagem: 1,
      imoveisComTentativa: 2,
      mediaTentativasAteAngariar: 1.5, // i1 gastou 2, i2 gastou 1
    });
  });

  it("devolve média nula quando ainda não há imóvel angariado com tentativas", () => {
    const imoveis = [imovel({ id: "i1", tentativas: [tentativa("2026-01-01T10:00", "a1", "sem-resposta")] })];
    expect(resumoTentativas(imoveis).mediaTentativasAteAngariar).toBeNull();
  });
});

describe("número errado fica fora do ranking", () => {
  it("não entra no denominador — telefone errado não reprova o roteiro", () => {
    const imoveis = [
      imovel({
        id: "i1",
        tentativas: [
          tentativa("2026-02-01T10:00", "a1", "respondeu"),
          tentativa("2026-02-05T10:00", "a1", "numero-errado"),
        ],
      }),
    ];
    const [linha] = desempenhoPorAbordagem(imoveis, CATALOGO, HOJE_RANKING);
    // Duas tentativas registradas, mas só uma testou o roteiro.
    expect(linha.tentativas).toBe(1);
    expect(linha.respostas).toBe(1);
    expect(linha.taxaResposta).toBe(100);
  });

  it("some do ranking a abordagem que só teve número errado", () => {
    const imoveis = [
      imovel({ id: "i1", tentativas: [tentativa("2026-02-01T10:00", "a2", "numero-errado")] }),
    ];
    expect(desempenhoPorAbordagem(imoveis, CATALOGO, HOJE_RANKING)).toHaveLength(0);
  });

  it("não rouba o crédito de quem destravou a angariação", () => {
    const i = imovel({
      id: "i1",
      angariadoEm: "2026-02-20",
      tentativas: [
        tentativa("2026-02-10T10:00", "a1", "agendou"),
        // Última antes da angariação, mas não falou com ninguém.
        tentativa("2026-02-18T10:00", "a2", "numero-errado"),
      ],
    });
    expect(abordagemQueDestravou(i)).toBe("a1");
  });

  it("continua contando no resumo geral — a tentativa aconteceu", () => {
    const imoveis = [
      imovel({
        id: "i1",
        tentativas: [
          tentativa("2026-02-01T10:00", "a1", "respondeu"),
          tentativa("2026-02-05T10:00", "a1", "numero-errado"),
        ],
      }),
    ];
    expect(resumoTentativas(imoveis).total).toBe(2);
  });
});

describe("resultadosPendentes (o nudge)", () => {
  const HOJE = "2026-07-21";

  /** Tentativa criada no envio: o "sem-resposta" ainda é palpite. */
  function palpite(data: string, abordagemId: string | null): Tentativa {
    return { ...tentativa(data, abordagemId, "sem-resposta"), aguardandoResultado: true };
  }

  /* A mudança de contrato de 31/07/2026. O nudge cobrava TODA tentativa
     marcada, e na carteira real isso deu 77 linhas — 73 delas silêncio puro.
     Confirmar "não respondeu" 73 vezes é transcrever à mão o que o app já
     observou. Agora ele só pergunta o que o app não tem como ver: a categoria
     de quem de fato respondeu. */
  it("NÃO cobra silêncio: sem resposta do proprietário, o app resolve sozinho", () => {
    const silencio = imovel({ id: "i1", tentativas: [palpite("2026-07-20T10:00", "a1")] });
    expect(resultadosPendentes([silencio], CATALOGO, HOJE)).toEqual([]);
  });

  it("cobra quando o proprietário respondeu — é a categoria que só ele sabe", () => {
    const respondeu = imovel({
      id: "i1",
      tentativas: [palpite("2026-07-20T10:00", "a1")],
      notas: [respostaEm("2026-07-20T15:00")],
    });
    const pend = resultadosPendentes([respondeu], CATALOGO, HOJE);
    expect(pend.map((p) => p.imovelId)).toEqual(["i1"]);
    expect(pend[0].respondeuEm).toBe("2026-07-20T15:00");
  });

  it("nunca cobra o que foi anotado à mão, mesmo com resposta depois", () => {
    const manual = imovel({
      id: "i2",
      tentativas: [tentativa("2026-07-20T10:00", "a1", "sem-resposta")],
      notas: [respostaEm("2026-07-20T15:00")],
    });
    expect(resultadosPendentes([manual], CATALOGO, HOJE)).toEqual([]);
  });

  it("resposta ANTERIOR à tentativa não conta — ela não é desfecho desta", () => {
    const antes = imovel({
      id: "i1",
      tentativas: [palpite("2026-07-20T10:00", "a1")],
      notas: [respostaEm("2026-07-19T15:00")],
    });
    expect(resultadosPendentes([antes], CATALOGO, HOJE)).toEqual([]);
  });

  it("para de cobrar depois do prazo — conversa velha sem classificar é arquivo", () => {
    const dentro = imovel({
      id: "dentro",
      tentativas: [palpite("2026-07-07T10:00", "a1")],
      notas: [respostaEm("2026-07-07T15:00")],
    });
    const fora = imovel({
      id: "fora",
      tentativas: [palpite("2026-07-06T10:00", "a1")],
      notas: [respostaEm("2026-07-06T15:00")],
    });
    const pend = resultadosPendentes([dentro, fora], CATALOGO, HOJE);
    expect(pend.map((p) => p.imovelId)).toEqual(["dentro"]);
  });

  it("pergunta primeiro por quem espera há mais tempo", () => {
    const imoveis = [
      imovel({
        id: "novo",
        tentativas: [palpite("2026-07-20T10:00", "a1")],
        notas: [respostaEm("2026-07-20T15:00")],
      }),
      imovel({
        id: "velho",
        tentativas: [palpite("2026-07-12T10:00", "a2")],
        notas: [respostaEm("2026-07-12T15:00")],
      }),
    ];
    const pend = resultadosPendentes(imoveis, CATALOGO, HOJE);
    expect(pend.map((p) => p.imovelId)).toEqual(["velho", "novo"]);
    expect(pend[0].dias).toBe(9);
    expect(pend[0].abordagemNome).toBe("Imóvel parado há meses?");
  });

  it("nomeia a tentativa sem roteiro em vez de deixar o rótulo vazio", () => {
    const pend = resultadosPendentes(
      [
        imovel({
          id: "i1",
          tentativas: [palpite("2026-07-20T10:00", null)],
          notas: [respostaEm("2026-07-20T15:00")],
        }),
      ],
      CATALOGO,
      HOJE,
    );
    expect(pend[0].abordagemNome).toBe(ABORDAGEM_NAO_INFORMADA);
  });
});

/* Envio por MODELO PRÓPRIO do corretor: registra tentativa (para o webhook ter
   o que fechar quando a resposta chegar) mas fica fora do ranking, porque
   modelo se apaga e não tem id estável para comparar séries. */
describe("tentativa vinda de modelo próprio", () => {
  const doModelo: Tentativa = {
    id: "tm1",
    data: "2026-07-20T10:00",
    abordagemId: null,
    modeloNome: "Falar mais tarde",
    canal: "WhatsApp",
    resultado: "sem-resposta",
    aguardandoResultado: true,
  };

  it("o nudge mostra o nome do modelo, não 'não informada'", () => {
    const pendentes = resultadosPendentes(
      [
        imovel({
          id: "i1",
          tentativas: [doModelo],
          notas: [respostaEm("2026-07-20T15:00")],
        }),
      ],
      CATALOGO,
      "2026-07-22",
    );
    expect(pendentes[0].abordagemNome).toBe("Falar mais tarde");
  });

  it("não entra no ranking de abordagens", () => {
    const ranking = desempenhoPorAbordagem(
      [imovel({ id: "i1", tentativas: [doModelo] })],
      CATALOGO,
      HOJE_RANKING,
    );
    expect(ranking.every((a) => a.tentativas === 0)).toBe(true);
  });

  it("mas conta no resumo geral — o contato aconteceu", () => {
    const resumo = resumoTentativas([imovel({ id: "i1", tentativas: [doModelo] })]);
    expect(resumo.total).toBe(1);
    expect(resumo.semAbordagem).toBe(1);
  });
});

/* O selo de tentativas no card do Pipeline. Nasceu de o funil descrever errado
   um quarto de uma coluna: 24 dos 84 "Novo contato" da carteira real já tinham
   levado 2+ mensagens. A correção é de LEITURA — migrar o status
   automaticamente foi medido e descartado (derrubaria a conversão de captação
   de 12,9% para 10,6% sem nada ter mudado na realidade). */
describe("seloTentativas", () => {
  const comTentativas = (n: number): Imovel =>
    imovel({
      id: `s${n}`,
      tentativas: Array.from({ length: n }, (_, k) =>
        tentativa(`2026-07-${String(k + 1).padStart(2, "0")}T10:00`, "a1", "sem-resposta"),
      ),
    });

  /* "1ª tentativa" apareceria em 153 dos 171 imóveis com contato — o selo só
     informa quando contradiz o que a coluna diz. */
  it("não aparece antes da segunda tentativa", () => {
    expect(seloTentativas(comTentativas(0))).toBeNull();
    expect(seloTentativas(comTentativas(1))).toBeNull();
  });

  it("aparece da segunda em diante, dizendo em qual vai", () => {
    expect(seloTentativas(comTentativas(2))).toBe("2ª tentativa");
    expect(seloTentativas(comTentativas(4))).toBe("4ª tentativa");
  });

  it("tolera imóvel sem o campo de tentativas", () => {
    expect(seloTentativas({ id: "x", endereco: "Rua X", status: "Novo contato" })).toBeNull();
  });
});
