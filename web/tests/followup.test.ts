/* Follow-up em lote (lib/calculo/followup).
   Feature nova da pós-migração — não há oráculo do app antigo; os testes
   fixam o contrato dos freios que existem para o número da imobiliária não
   ser banido: quem entra no lote, quem fica de fora e por quê, o teto do
   lote e o do dia. */
import { describe, expect, it } from "vitest";
import {
  avisoTextoLote,
  enviadosFollowUpHoje,
  falhaEhDoNumero,
  falhaEncerraLote,
  diasDesdeUltimoContato,
  FOLLOWUP_DIAS_POR_TENTATIVA,
  FOLLOWUP_INTERVALO_MAX_MS,
  FOLLOWUP_INTERVALO_MIN_MS,
  FOLLOWUP_LOTE_MAX,
  FOLLOWUP_MAX_TENTATIVAS,
  FOLLOWUP_TETO_DIA,
  intervaloFollowUpMs,
  resumoLote,
  selecionarFollowUp,
  selecionarVerificacaoDisponibilidade,
  textoBaseDisponibilidade,
  textoBaseFollowUp,
  textoFollowUp,
  ultimoContatoISO,
} from "@/lib/calculo/followup";
import { VERIFICACAO_DISPONIBILIDADE_DIAS } from "@/lib/constantes";
import type { Abordagem, Imovel, Tentativa } from "@/lib/tipos";

const HOJE = "2026-07-21";

function tentativa(data: string, canal = "WhatsApp"): Tentativa {
  return { id: `t-${data}-${canal}`, data: `${data}T10:00`, canal, resultado: "sem-resposta" };
}

/* Telefone distinto por imóvel, derivado do id.

   O lote manda uma mensagem por PROPRIETÁRIO, não por imóvel. Se os fixtures
   compartilhassem telefone — como compartilhavam antes desse corte existir —
   qualquer lista colapsaria numa linha só, e os testes de ordenação e de teto
   passariam a medir a deduplicação sem querer. Quem quer testar "mesmo dono"
   passa `proprietarioTelefone` explicitamente. */
const telefonesPorId = new Map<string, string>();

function telefoneDe(id: string): string {
  const existente = telefonesPorId.get(id);
  if (existente) return existente;
  const n = telefonesPorId.size;
  const novo = `(43) 9${String(9000 + n)}-${String(1000 + n)}`;
  telefonesPorId.set(id, novo);
  return novo;
}

/** Imóvel elegível por padrão: "Sem resposta", telefone bom, último
    contato bem antigo. Cada teste estraga só o que quer medir. */
function imovel(over: Partial<Imovel> = {}): Imovel {
  const id = over.id ?? "im-1";
  return {
    id,
    endereco: "Rua Haddock Lobo, 55",
    bairro: "Cerqueira César",
    proprietarioNome: "Marta",
    proprietarioTelefone: telefoneDe(id),
    status: "Sem resposta",
    tentativas: [tentativa("2026-05-01")],
    ...over,
  };
}

describe("selecionarFollowUp — quem entra", () => {
  it("pega quem não respondeu e ignora quem já avançou no funil", () => {
    const lista = [
      imovel({ id: "a" }),
      imovel({ id: "b", status: "Novo contato" }),
      imovel({ id: "c", status: "Angariado" }),
      imovel({ id: "d", status: "Locado" }),
    ];
    const { elegiveis } = selecionarFollowUp(lista, HOJE);
    expect(elegiveis.map((i) => i.id).sort()).toEqual(["a", "b"]);
  });

  /* O beco que motivou incluir "Novo contato" no público do lote: nada move
     esse status sozinho — confirmar o resultado da tentativa não toca no
     imóvel —, então o primeiro contato sem retorno ficava ali para sempre,
     fora do alcance da única ferramenta feita para ele. */
  it("pega 'Novo contato' parado: primeira mensagem enviada e silêncio", () => {
    const lista = [
      imovel({
        id: "primeiro-contato-mudo",
        status: "Novo contato",
        tentativas: [tentativa("2026-05-01")],
      }),
    ];
    const { elegiveis } = selecionarFollowUp(lista, HOJE);
    expect(elegiveis.map((i) => i.id)).toEqual(["primeiro-contato-mudo"]);
  });

  it("mas 'Novo contato' recém-cadastrado não é cutucado — o corte de dias vale igual", () => {
    const lista = [
      imovel({
        id: "cadastrado-hoje",
        status: "Novo contato",
        tentativas: [tentativa(HOJE)],
      }),
    ];
    const { elegiveis, excluidos } = selecionarFollowUp(lista, HOJE);
    expect(elegiveis).toHaveLength(0);
    expect(excluidos[0]?.motivo).toBe("contato-recente");
  });

  it("não pega 'Perdido' nem 'Cancelado' — são saídas deliberadas", () => {
    const lista = [imovel({ id: "a", status: "Perdido" }), imovel({ id: "b", status: "Cancelado" })];
    const { elegiveis, excluidos } = selecionarFollowUp(lista, HOJE);
    expect(elegiveis).toHaveLength(0);
    // Nem entram como excluídos: não são público do lote.
    expect(excluidos).toHaveLength(0);
  });

  it("ordena do contato mais antigo para o mais recente", () => {
    const lista = [
      imovel({ id: "recente", tentativas: [tentativa("2026-06-20")] }),
      imovel({ id: "antigo", tentativas: [tentativa("2026-01-10")] }),
      imovel({ id: "nunca", tentativas: [] }),
    ];
    const { elegiveis } = selecionarFollowUp(lista, HOJE);
    expect(elegiveis.map((i) => i.id)).toEqual(["nunca", "antigo", "recente"]);
  });
});

describe("selecionarFollowUp — quem fica de fora", () => {
  it("exclui sem telefone", () => {
    const { elegiveis, excluidos } = selecionarFollowUp([imovel({ proprietarioTelefone: "" })], HOJE);
    expect(elegiveis).toHaveLength(0);
    expect(excluidos[0].motivo).toBe("sem-telefone");
  });

  it("exclui telefone fora do formato de celular", () => {
    const { excluidos } = selecionarFollowUp([imovel({ proprietarioTelefone: "123" })], HOJE);
    expect(excluidos[0].motivo).toBe("numero-invalido");
  });

  it("exclui quem falou com o corretor há pouco", () => {
    const ontem = "2026-07-20";
    const { elegiveis, excluidos } = selecionarFollowUp([imovel({ tentativas: [tentativa(ontem)] })], HOJE);
    expect(elegiveis).toHaveLength(0);
    expect(excluidos[0].motivo).toBe("contato-recente");
    expect(excluidos[0].detalhe).toBe("ontem");
  });

  it("o corte de contato recente vale para qualquer canal, não só WhatsApp", () => {
    const lista = [imovel({ tentativas: [tentativa("2026-07-19", "Ligação telefônica")] })];
    const { excluidos } = selecionarFollowUp(lista, HOJE);
    expect(excluidos[0].motivo).toBe("contato-recente");
  });

  it("libera exatamente no limite de dias", () => {
    const limite = "2026-07-14"; // 7 dias antes de HOJE — a espera da 2ª tentativa
    const { elegiveis } = selecionarFollowUp([imovel({ tentativas: [tentativa(limite)] })], HOJE);
    expect(elegiveis).toHaveLength(1);
  });

  /* A espera CRESCE a cada tentativa: a segunda mensagem vem rápido (é a que
     converte), a quarta espera bem mais (ali a pressa vira insistência). Com
     intervalo fixo os dois casos eram tratados igual. */
  it("a espera cresce a cada tentativa acumulada", () => {
    const [primeira, segunda, terceira] = FOLLOWUP_DIAS_POR_TENTATIVA;
    expect(diasDesdeUltimoContato(1)).toBe(primeira);
    expect(diasDesdeUltimoContato(2)).toBe(segunda);
    expect(diasDesdeUltimoContato(3)).toBe(terceira);
    expect(primeira).toBeLessThan(segunda);
    expect(segunda).toBeLessThan(terceira);
  });

  it("sem tentativa registrada não há espera — é o caso mais esquecido de todos", () => {
    const { elegiveis } = selecionarFollowUp([imovel({ tentativas: [] })], HOJE);
    expect(elegiveis).toHaveLength(1);
  });

  it("os mesmos dias liberam a 2ª tentativa e seguram a 3ª", () => {
    const dezDias = "2026-07-11"; // 10 dias antes de HOJE: passa de 7, não chega a 14
    const umaTentativa = imovel({ id: "com-uma", tentativas: [tentativa(dezDias)] });
    const duasTentativas = imovel({
      id: "com-duas",
      tentativas: [tentativa("2026-05-01"), tentativa(dezDias)],
    });

    expect(selecionarFollowUp([umaTentativa], HOJE).elegiveis).toHaveLength(1);

    const { elegiveis, excluidos } = selecionarFollowUp([duasTentativas], HOJE);
    expect(elegiveis).toHaveLength(0);
    expect(excluidos[0].motivo).toBe("contato-recente");
  });

  it(`exclui quem já acumulou ${FOLLOWUP_MAX_TENTATIVAS} tentativas`, () => {
    const muitas = ["2026-01-02", "2026-02-02", "2026-03-02", "2026-04-02"].map((d) => tentativa(d));
    const { elegiveis, excluidos } = selecionarFollowUp([imovel({ tentativas: muitas })], HOJE);
    expect(elegiveis).toHaveLength(0);
    expect(excluidos[0].motivo).toBe("tentativas-demais");
    expect(excluidos[0].detalhe).toBe("4 tentativas");
  });
});

/* O freio que os outros quatro não pegam: eles leem as tentativas DAQUELE
   imóvel, e quatro imóveis do mesmo dono têm quatro históricos limpos. É o
   caso do galpão desdobrado em salas — e o de quem põe três apartamentos
   para alugar de uma vez. Quatro mensagens quase iguais no mesmo número em
   três minutos é o padrão que derruba o número da imobiliária. */
describe("selecionarFollowUp — uma mensagem por proprietário", () => {
  const MESMO = "(43) 99802-4316";

  it("manda para um imóvel só quando o proprietário tem vários", () => {
    const lista = [
      imovel({ id: "galpao", codigo: "LD-01", proprietarioTelefone: MESMO }),
      imovel({ id: "sala-1", codigo: "LD-02", proprietarioTelefone: MESMO }),
      imovel({ id: "sala-2", codigo: "LD-03", proprietarioTelefone: MESMO }),
      imovel({ id: "sala-3", codigo: "LD-04", proprietarioTelefone: MESMO }),
    ];
    const { elegiveis, excluidos } = selecionarFollowUp(lista, HOJE);
    expect(elegiveis).toHaveLength(1);
    expect(excluidos).toHaveLength(3);
    expect(excluidos.every((e) => e.motivo === "mesmo-proprietario")).toBe(true);
  });

  it("quem fica é quem espera há mais tempo", () => {
    const lista = [
      imovel({ id: "novo", proprietarioTelefone: MESMO, tentativas: [tentativa("2026-06-20")] }),
      imovel({ id: "antigo", proprietarioTelefone: MESMO, tentativas: [tentativa("2026-01-10")] }),
    ];
    const { elegiveis } = selecionarFollowUp(lista, HOJE);
    expect(elegiveis.map((i) => i.id)).toEqual(["antigo"]);
  });

  it("a exclusão diz por qual imóvel o proprietário já entrou", () => {
    const lista = [
      imovel({ id: "a", codigo: "LD-77", proprietarioTelefone: MESMO, tentativas: [tentativa("2026-01-10")] }),
      imovel({ id: "b", codigo: "LD-78", proprietarioTelefone: MESMO }),
    ];
    const { excluidos } = selecionarFollowUp(lista, HOJE);
    expect(excluidos[0].imovel.id).toBe("b");
    expect(excluidos[0].detalhe).toBe("já entrou por LD-77");
  });

  it("agrupa grafias diferentes do mesmo número — inclusive com e sem o nono dígito", () => {
    const lista = [
      imovel({ id: "a", proprietarioTelefone: "(43) 99802-4316" }),
      imovel({ id: "b", proprietarioTelefone: "43998024316" }),
      imovel({ id: "c", proprietarioTelefone: "+55 43 9802-4316" }),
    ];
    const { elegiveis } = selecionarFollowUp(lista, HOJE);
    expect(elegiveis).toHaveLength(1);
  });

  it("não junta proprietários diferentes", () => {
    const lista = [
      imovel({ id: "a", proprietarioTelefone: "(43) 99802-4316" }),
      imovel({ id: "b", proprietarioTelefone: "(43) 99111-2222" }),
    ];
    const { elegiveis } = selecionarFollowUp(lista, HOJE);
    expect(elegiveis).toHaveLength(2);
  });

  it("o excluído volta a ser elegível quando o outro sai do público do lote", () => {
    // Mesma carteira do primeiro teste, mas o galpão já foi angariado: some
    // do público e a sala 1 assume a vez — a fila não fica travada por ele.
    const lista = [
      imovel({ id: "galpao", codigo: "LD-01", proprietarioTelefone: MESMO, status: "Angariado" }),
      imovel({ id: "sala-1", codigo: "LD-02", proprietarioTelefone: MESMO }),
    ];
    const { elegiveis } = selecionarFollowUp(lista, HOJE);
    expect(elegiveis.map((i) => i.id)).toEqual(["sala-1"]);
  });
});

describe("selecionarFollowUp — tetos", () => {
  /** N elegíveis, cada um com contato antigo o bastante. */
  function muitos(n: number, tentativasPorImovel: Tentativa[] = [tentativa("2026-01-01")]): Imovel[] {
    return Array.from({ length: n }, (_, k) =>
      imovel({ id: `im-${k}`, tentativas: tentativasPorImovel.map((t) => ({ ...t, id: `${t.id}-${k}` })) }),
    );
  }

  it("o limite trava no tamanho do lote mesmo com fila grande", () => {
    const { elegiveis, limite } = selecionarFollowUp(muitos(40), HOJE);
    // Todos continuam elegíveis (a tela mostra a fila inteira)...
    expect(elegiveis).toHaveLength(40);
    // ...mas só este tanto pode ser marcado.
    expect(limite).toBe(FOLLOWUP_LOTE_MAX);
  });

  it("desconta do teto diário o que já saiu hoje", () => {
    const jaEnviados = muitos(FOLLOWUP_TETO_DIA - 3).map((i) => ({
      ...i,
      // Já receberam follow-up hoje: contam para o teto e saem da fila.
      tentativas: [tentativa(HOJE)],
    }));
    const { limite, enviadosHoje } = selecionarFollowUp([...jaEnviados, ...muitos(10)], HOJE);
    expect(enviadosHoje).toBe(FOLLOWUP_TETO_DIA - 3);
    expect(limite).toBe(3);
  });

  it("teto batido zera o limite", () => {
    const jaEnviados = muitos(FOLLOWUP_TETO_DIA).map((i) => ({ ...i, tentativas: [tentativa(HOJE)] }));
    const { limite } = selecionarFollowUp([...jaEnviados, ...muitos(5)], HOJE);
    expect(limite).toBe(0);
  });

  it("só o canal do lote conta para o teto do dia", () => {
    const lista = [
      imovel({ id: "a", tentativas: [tentativa(HOJE, "WhatsApp")] }),
      imovel({ id: "b", tentativas: [tentativa(HOJE, "Visita presencial")] }),
    ];
    expect(enviadosFollowUpHoje(lista, HOJE)).toBe(1);
  });
});

describe("ultimoContatoISO", () => {
  it("devolve a tentativa mais recente, fora de ordem", () => {
    const i = imovel({
      tentativas: [tentativa("2026-03-01"), tentativa("2026-06-15"), tentativa("2026-01-20")],
    });
    expect(ultimoContatoISO(i)).toBe("2026-06-15");
  });

  it("null quando não há tentativa registrada", () => {
    expect(ultimoContatoISO(imovel({ tentativas: [] }))).toBeNull();
  });
});

describe("texto do lote", () => {
  const comRoteiro: Abordagem = {
    id: "ab-1",
    nome: "Avaliação gratuita",
    roteiro: "Oi {nome}, ainda posso avaliar o imóvel da {endereco}?",
    arquivada: false,
  };

  it("usa o roteiro da abordagem quando ele existe", () => {
    expect(textoBaseFollowUp(comRoteiro)).toBe(comRoteiro.roteiro);
  });

  it("cai no modelo de retomada quando a abordagem não tem roteiro", () => {
    const semRoteiro: Abordagem = { id: "ab-2", nome: "Sem script", roteiro: "", arquivada: false };
    const texto = textoBaseFollowUp(semRoteiro);
    expect(texto).toContain("não consegui retorno");
  });

  it("o texto padrão é um MOLDE: traz os marcadores, não o nome de alguém", () => {
    const base = textoBaseFollowUp(null);
    expect(base).toContain("{nome}");
    expect(base).toContain("{endereco}");
    // E o molde preenche normalmente para cada proprietário.
    const final = textoFollowUp(base, imovel({ proprietarioNome: "Marta" }));
    expect(final).toContain("Marta");
    expect(final).not.toContain("{");
  });

  it("preenche os marcadores por proprietário", () => {
    const texto = textoFollowUp(comRoteiro.roteiro!, imovel({ proprietarioNome: "Marta" }));
    expect(texto).toContain("Oi Marta");
    expect(texto).toContain("Rua Haddock Lobo, 55");
    expect(texto).not.toContain("{nome}");
  });

  it("avisa quando o texto sairia idêntico para todo mundo", () => {
    expect(avisoTextoLote("Bom dia, tudo bem?")).toContain("{nome}");
    expect(avisoTextoLote("Oi {nome}, tudo bem?")).toBeNull();
  });
});

describe("intervaloFollowUpMs", () => {
  it("mantém o sorteio dentro da faixa", () => {
    expect(intervaloFollowUpMs(0)).toBe(FOLLOWUP_INTERVALO_MIN_MS);
    expect(intervaloFollowUpMs(1)).toBe(FOLLOWUP_INTERVALO_MAX_MS);
    expect(intervaloFollowUpMs(0.5)).toBe((FOLLOWUP_INTERVALO_MIN_MS + FOLLOWUP_INTERVALO_MAX_MS) / 2);
  });

  it("não estoura a faixa com sorteio fora de 0–1", () => {
    expect(intervaloFollowUpMs(-5)).toBe(FOLLOWUP_INTERVALO_MIN_MS);
    expect(intervaloFollowUpMs(9)).toBe(FOLLOWUP_INTERVALO_MAX_MS);
  });
});

describe("resumoLote", () => {
  it("conta enviadas e falhas", () => {
    expect(resumoLote(9, 1, "concluido")).toBe("9 mensagens enviadas, 1 falhou.");
    expect(resumoLote(10, 0, "concluido")).toBe("10 mensagens enviadas.");
    expect(resumoLote(1, 0, "concluido")).toBe("1 mensagem enviada.");
  });

  it("distingue o cancelamento do corretor da parada por erro de ambiente", () => {
    expect(resumoLote(4, 0, "cancelado")).toBe("Envio cancelado: 4 mensagens enviadas.");
    expect(resumoLote(0, 1, "interrompido")).toContain("afetaria todos os envios seguintes");
  });
});

describe("falhaEncerraLote", () => {
  it("para a fila quando o problema é do ambiente, não do número", () => {
    expect(falhaEncerraLote("nao-configurado")).toBe(true);
    // Conta sem número próprio: os nove seguintes falhariam igual.
    expect(falhaEncerraLote("sem-instancia")).toBe(true);
    expect(falhaEncerraLote("instancia-desconectada")).toBe(true);
    expect(falhaEncerraLote("sem-permissao")).toBe(true);
    expect(falhaEncerraLote("sessao-expirada")).toBe(true);
  });

  it("segue a fila quando o problema é do contato da vez", () => {
    expect(falhaEncerraLote("sem-whatsapp")).toBe(false);
    expect(falhaEncerraLote("numero-invalido")).toBe(false);
    expect(falhaEncerraLote("sem-telefone")).toBe(false);
    expect(falhaEncerraLote(undefined)).toBe(false);
  });
});

describe("falhaEhDoNumero", () => {
  it("reconhece as falhas que falam do telefone do proprietário", () => {
    // São as únicas em que o relatório pode oferecer "corrigir telefone" e
    // "dar como Perdido": o problema está no cadastro, não no nosso servidor.
    expect(falhaEhDoNumero("sem-telefone")).toBe(true);
    expect(falhaEhDoNumero("numero-invalido")).toBe(true);
    expect(falhaEhDoNumero("sem-whatsapp")).toBe(true);
  });

  it("não oferece perda quando o problema foi do ambiente", () => {
    // Dar um imóvel como Perdido porque a Evolution caiu tiraria da carteira
    // um proprietário que nunca chegou a receber mensagem nenhuma.
    for (const f of ["instancia-desconectada", "falha-evolution", "sem-conexao",
                     "sessao-expirada", "sem-permissao", "nao-configurado",
                     "sem-instancia", "imovel-nao-encontrado"] as const) {
      expect(falhaEhDoNumero(f)).toBe(false);
    }
    expect(falhaEhDoNumero(undefined)).toBe(false);
  });

  it("é disjunto de falhaEncerraLote — nenhuma falha é das duas coisas", () => {
    // Uma falha que encerrasse o lote E oferecesse perda daria como Perdido
    // um imóvel por causa de um problema que nem chegou a testar o número.
    const todas = ["sem-telefone", "numero-invalido", "sem-whatsapp", "instancia-desconectada",
                   "nao-configurado", "sem-instancia", "sessao-expirada", "sem-permissao",
                   "imovel-nao-encontrado", "falha-evolution", "sem-conexao"] as const;
    for (const f of todas) {
      expect(falhaEhDoNumero(f) && falhaEncerraLote(f)).toBe(false);
    }
  });
});

/* --- Lote de disponibilidade ------------------------------------------------
   O segundo público: imóveis já captados que seguem sem locar há tempo. */

/** Imóvel elegível por padrão para o lote de disponibilidade: Angariado bem
    antigo (fora do prazo mínimo), telefone bom, último contato fora da janela
    de recência. Cada teste estraga só o que quer medir. */
function imovelAngariado(over: Partial<Imovel> = {}): Imovel {
  const id = over.id ?? "d-1";
  return {
    id,
    endereco: "Rua das Flores, 10",
    proprietarioNome: "Bruno",
    proprietarioTelefone: telefoneDe(id),
    status: "Angariado",
    statusHistory: [
      { status: "Novo contato", date: "2026-03-01" },
      { status: "Angariado", date: "2026-04-01" }, // ~111 dias antes de HOJE
    ],
    tentativas: [tentativa("2026-04-05")], // ~107 dias: fora da janela de recência
    ...over,
  };
}

describe("selecionarVerificacaoDisponibilidade — quem entra", () => {
  it("pega Angariado e Publicado, ignora o resto do funil", () => {
    const lista = [
      imovelAngariado({ id: "a", status: "Angariado" }),
      imovelAngariado({ id: "b", status: "Publicado" }),
      imovelAngariado({ id: "c", status: "Novo contato" }),
      imovelAngariado({ id: "d", status: "Sem resposta" }),
      imovelAngariado({ id: "e", status: "Locado" }),
    ];
    const { elegiveis } = selecionarVerificacaoDisponibilidade(lista, HOJE);
    expect(elegiveis.map((i) => i.id).sort()).toEqual(["a", "b"]);
  });

  it("só cutuca depois do prazo mínimo desde a angariação", () => {
    // Angariado há menos de VERIFICACAO_DISPONIBILIDADE_DIAS: nem entra, nem vira
    // exclusão explicada — é cedo demais para perguntar.
    const recemAngariado = imovelAngariado({
      id: "novo",
      statusHistory: [
        { status: "Novo contato", date: "2026-06-20" },
        { status: "Angariado", date: "2026-07-01" }, // 20 dias antes de HOJE
      ],
      tentativas: [tentativa("2026-07-01")],
    });
    const { elegiveis, excluidos } = selecionarVerificacaoDisponibilidade([recemAngariado], HOJE);
    expect(elegiveis).toHaveLength(0);
    expect(excluidos).toHaveLength(0);
  });

  it("sem 'Angariado' no histórico não entra (dado antigo), sem alarde", () => {
    const semHistorico = imovelAngariado({ id: "semh", statusHistory: [] });
    const { elegiveis, excluidos } = selecionarVerificacaoDisponibilidade([semHistorico], HOJE);
    expect(elegiveis).toHaveLength(0);
    expect(excluidos).toHaveLength(0);
  });
});

describe("selecionarVerificacaoDisponibilidade — freios", () => {
  it("exclui quem foi contatado dentro da janela de recência (60 dias)", () => {
    // Falou faz 20 dias: dentro da cadência, não pergunta de novo.
    const recente = imovelAngariado({ id: "r", tentativas: [tentativa("2026-07-01")] });
    const { elegiveis, excluidos } = selecionarVerificacaoDisponibilidade([recente], HOJE);
    expect(elegiveis).toHaveLength(0);
    expect(excluidos[0].motivo).toBe("confirmado-recente");
  });

  it("NÃO tem corte de tentativas demais — imóvel anunciado há muito segue elegível", () => {
    // Cinco tentativas antigas (todas fora da janela de recência). No lote de
    // seguimento isso barraria em FOLLOWUP_MAX_TENTATIVAS; aqui não.
    const muitas = imovelAngariado({
      id: "m",
      tentativas: [
        tentativa("2026-04-02"),
        tentativa("2026-04-05"),
        tentativa("2026-04-10"),
        tentativa("2026-04-15"),
        tentativa("2026-04-20"),
      ],
    });
    const { elegiveis } = selecionarVerificacaoDisponibilidade([muitas], HOJE);
    expect(elegiveis.map((i) => i.id)).toEqual(["m"]);
  });

  it("manda uma mensagem por proprietário, não uma por imóvel", () => {
    const tel = "(43) 3333-3333";
    const lista = [
      imovelAngariado({ id: "p1", proprietarioTelefone: tel, endereco: "Sala 1" }),
      imovelAngariado({ id: "p2", proprietarioTelefone: tel, endereco: "Sala 2" }),
    ];
    const { elegiveis, excluidos } = selecionarVerificacaoDisponibilidade(lista, HOJE);
    expect(elegiveis).toHaveLength(1);
    expect(excluidos.some((e) => e.motivo === "mesmo-proprietario")).toBe(true);
  });

  it("compartilha o teto do dia com o outro lote (conta envios WhatsApp de hoje)", () => {
    // Um imóvel qualquer com FOLLOWUP_TETO_DIA tentativas WhatsApp HOJE zera o
    // que ainda cabe — o número é o mesmo, não importa o tipo de lote.
    const jaEnviou = imovelAngariado({
      id: "hoje",
      status: "Publicado",
      tentativas: Array.from({ length: FOLLOWUP_TETO_DIA }, () => tentativa(HOJE)),
    });
    // esse mesmo imóvel foi contatado hoje, então ele próprio sai por recência;
    // outro elegível prova que o limite caiu a zero.
    const outro = imovelAngariado({ id: "outro" });
    const { limite } = selecionarVerificacaoDisponibilidade([jaEnviou, outro], HOJE);
    expect(limite).toBe(0);
  });
});

describe("textoBaseDisponibilidade", () => {
  it("é um molde com os marcadores {nome} e {endereco}", () => {
    const base = textoBaseDisponibilidade();
    expect(base).toContain("{nome}");
    expect(base).toContain("{endereco}");
    // E vira mensagem real ao preencher para um proprietário.
    const pronto = textoFollowUp(base, imovelAngariado({ proprietarioNome: "Ana", endereco: "Av. Brasil, 9" }));
    expect(pronto).toContain("Ana");
    expect(pronto).toContain("Av. Brasil, 9");
    expect(pronto).not.toContain("{");
  });

  it("o prazo mínimo é a mesma cadência do lembrete de verificação", () => {
    // Guarda a invariante que o comentário promete: age gate == recência ==
    // VERIFICACAO_DISPONIBILIDADE_DIAS. Se alguém mudar um sem o outro, este
    // teste força a conversa.
    const exatamenteNoPrazo = imovelAngariado({
      id: "prazo",
      statusHistory: [
        { status: "Novo contato", date: "2026-01-01" },
        // Angariado exatamente VERIFICACAO_DISPONIBILIDADE_DIAS antes de HOJE.
        { status: "Angariado", date: "2026-05-22" },
      ],
      tentativas: [tentativa("2026-05-22")],
    });
    // 2026-05-22 é 60 dias antes de 2026-07-21.
    expect(VERIFICACAO_DISPONIBILIDADE_DIAS).toBe(60);
    const { elegiveis } = selecionarVerificacaoDisponibilidade([exatamenteNoPrazo], HOJE);
    expect(elegiveis.map((i) => i.id)).toEqual(["prazo"]);
  });
});

/* --- A ORDEM DA FILA: sinal na frente, antiguidade dentro da faixa ---------
   Com o teto diário e uma fila que só cresce, as vagas do dia viraram recurso
   escasso — e antiguidade pura mandava a mensagem para quem nunca deu sinal,
   enterrando quem acabou de demonstrar interesse (que é, por ter interagido,
   justamente o mais RECENTE da fila). */
describe("selecionarFollowUp — ordem por sinal", () => {
  it("quem reagiu passa na frente de quem só espera há mais tempo", () => {
    const antigo = imovel({ id: "antigo", tentativas: [tentativa("2026-01-01")] });
    const quente = imovel({
      id: "quente",
      // Mais recente que o antigo: na ordem velha, iria para o fim da fila.
      tentativas: [{ ...tentativa("2026-07-01"), resultado: "vai-retornar" }],
    });

    const sel = selecionarFollowUp([antigo, quente], HOJE);
    expect(sel.elegiveis.map((i) => i.id)).toEqual(["quente", "antigo"]);
    expect(sel.sinais["quente"]).toContain("ia retornar");
    // Quem entrou por espera não recebe motivo — ele não sinalizou nada.
    expect(sel.sinais["antigo"]).toBeUndefined();
  });

  it("respeita a escada do compromisso: data marcada > agendou > vai retornar", () => {
    const marcou = imovel({
      id: "marcou",
      tentativas: [
        {
          ...tentativa("2026-07-05"),
          resultado: "respondeu",
          sugestaoIa: { resultado: "vai-retornar", retomarEm: "2026-07-18", resumo: "me chama dia 18" },
        },
      ],
    });
    const agendou = imovel({ id: "agendou", tentativas: [{ ...tentativa("2026-07-02"), resultado: "agendou" }] });
    const vaiRetornar = imovel({ id: "vai", tentativas: [{ ...tentativa("2026-07-01"), resultado: "vai-retornar" }] });

    const sel = selecionarFollowUp([vaiRetornar, agendou, marcou], HOJE);
    expect(sel.elegiveis.map((i) => i.id)).toEqual(["marcou", "agendou", "vai"]);
  });

  it("dentro da MESMA faixa a antiguidade continua mandando", () => {
    const a = imovel({ id: "a", tentativas: [{ ...tentativa("2026-06-10"), resultado: "respondeu" }] });
    const b = imovel({ id: "b", tentativas: [{ ...tentativa("2026-05-10"), resultado: "respondeu" }] });
    const sel = selecionarFollowUp([a, b], HOJE);
    expect(sel.elegiveis.map((i) => i.id)).toEqual(["b", "a"]);
  });

  it("o silêncio NÃO passa fome: a faixa sem sinal segue drenando por antiguidade", () => {
    const quente = imovel({ id: "quente", tentativas: [{ ...tentativa("2026-07-01"), resultado: "respondeu" }] });
    const velho = imovel({ id: "velho", tentativas: [tentativa("2026-01-01")] });
    const meio = imovel({ id: "meio", tentativas: [tentativa("2026-03-01")] });
    const novo = imovel({ id: "novo", tentativas: [tentativa("2026-05-01")] });

    const sel = selecionarFollowUp([novo, velho, meio, quente], HOJE);
    // O quente toma a 1ª vaga; os mudos mantêm exatamente a ordem de antes.
    expect(sel.elegiveis.map((i) => i.id)).toEqual(["quente", "velho", "meio", "novo"]);
  });

  it("quem recusou não é promovido — reagir negando não é sinal de compra", () => {
    const recusou = imovel({ id: "recusou", tentativas: [{ ...tentativa("2026-07-01"), resultado: "recusou" }] });
    const antigo = imovel({ id: "antigo", tentativas: [tentativa("2026-01-01")] });
    const sel = selecionarFollowUp([recusou, antigo], HOJE);
    expect(sel.elegiveis.map((i) => i.id)).toEqual(["antigo", "recusou"]);
    expect(sel.sinais["recusou"]).toBeUndefined();
  });

  it("resposta que chegou pelo webhook conta, mesmo com a tentativa ainda chutada", () => {
    // O caso que mais aparece na carteira real: o proprietário respondeu, o
    // webhook gravou a nota, e ninguém confirmou o desfecho no nudge — então a
    // tentativa segue em "sem-resposta" e a fila o tratava como silêncio.
    const respondeuDeVerdade = imovel({
      id: "escreveu",
      tentativas: [{ ...tentativa("2026-07-05"), aguardandoResultado: true }],
      notas: [{ id: "wa:ABC123", texto: "Resposta pelo WhatsApp: pode me mandar mais detalhes?", data: "2026-07-06T09:00" }],
    });
    const antigo = imovel({ id: "antigo", tentativas: [tentativa("2026-01-01")] });

    const sel = selecionarFollowUp([antigo, respondeuDeVerdade], HOJE);
    expect(sel.elegiveis.map((i) => i.id)).toEqual(["escreveu", "antigo"]);
    expect(sel.sinais["escreveu"]).toContain("não confirmado");
  });

  it("a nota de ENCERRAMENTO do próprio sistema não vira sinal de proprietário", () => {
    // `notaDoEncerramento` também nasce com o prefixo "wa:" — contá-la
    // promoveria o imóvel por causa de um texto que nós mesmos escrevemos.
    const soEncerramento = imovel({
      id: "sistema",
      tentativas: [tentativa("2026-07-05")],
      notas: [{ id: "wa:ABC123:encerrado", texto: "Imóvel marcado como Perdido automaticamente...", data: "2026-07-06T09:00" }],
    });
    const antigo = imovel({ id: "antigo", tentativas: [tentativa("2026-01-01")] });

    const sel = selecionarFollowUp([antigo, soEncerramento], HOJE);
    expect(sel.elegiveis.map((i) => i.id)).toEqual(["antigo", "sistema"]);
    expect(sel.sinais["sistema"]).toBeUndefined();
  });

  it("o lote de disponibilidade não ordena por sinal — a pergunta dele é outra", () => {
    const base = {
      status: "Angariado",
      statusHistory: [{ status: "Angariado", date: "2026-01-01" }],
      tentativas: [],
    };
    const a = imovel({ id: "d-a", ...base });
    const b = imovel({ id: "d-b", ...base });
    const sel = selecionarVerificacaoDisponibilidade([a, b], HOJE);
    expect(sel.sinais).toEqual({});
    expect(sel.elegiveis).toHaveLength(2);
  });
});

/* --- Achado 2: o lote não pode afirmar um contato que não houve ------------ */
describe("selecionarFollowUp — quem nunca foi contatado", () => {
  it("'Novo contato' sem nenhuma tentativa fica de fora do lote de retomada", () => {
    // O texto padrão do lote diz "tentei falar com você há alguns dias, mas não
    // consegui retorno". Para um lead de garimpo que ninguém tocou isso é falso
    // — e falso logo na primeira frase que ele lê da imobiliária.
    const { elegiveis, excluidos } = selecionarFollowUp(
      [imovel({ id: "garimpo", status: "Novo contato", tentativas: [] })],
      HOJE,
    );
    expect(elegiveis).toHaveLength(0);
    expect(excluidos[0].motivo).toBe("sem-contato-anterior");
  });

  it("mas 'Sem resposta' sem tentativa CONTINUA no lote — o status já afirma o contato", () => {
    // Era o caso da era cega: o envio saiu pelo wa.me e não foi registrado.
    // Aqui "tentei falar com você" é verdade, só não está no histórico.
    const { elegiveis, excluidos } = selecionarFollowUp(
      [imovel({ id: "era-cega", status: "Sem resposta", tentativas: [] })],
      HOJE,
    );
    expect(elegiveis.map((i) => i.id)).toEqual(["era-cega"]);
    expect(excluidos).toHaveLength(0);
  });

  it("'Novo contato' JÁ contatado segue no lote — é exatamente quem o lote foi buscar", () => {
    const { elegiveis } = selecionarFollowUp(
      [imovel({ id: "preso", status: "Novo contato", tentativas: [tentativa("2026-05-01")] })],
      HOJE,
    );
    expect(elegiveis.map((i) => i.id)).toEqual(["preso"]);
  });
});
