/* Follow-up em lote (lib/calculo/followup).
   Feature nova da pós-migração — não há oráculo do app antigo; os testes
   fixam o contrato dos freios que existem para o número da imobiliária não
   ser banido: quem entra no lote, quem fica de fora e por quê, o teto do
   lote e o do dia. */
import { describe, expect, it } from "vitest";
import {
  avisoTextoLote,
  enviadosFollowUpHoje,
  falhaEncerraLote,
  FOLLOWUP_DIAS_DESDE_ULTIMO,
  FOLLOWUP_INTERVALO_MAX_MS,
  FOLLOWUP_INTERVALO_MIN_MS,
  FOLLOWUP_LOTE_MAX,
  FOLLOWUP_MAX_TENTATIVAS,
  FOLLOWUP_TETO_DIA,
  intervaloFollowUpMs,
  resumoLote,
  selecionarFollowUp,
  textoBaseFollowUp,
  textoFollowUp,
  ultimoContatoISO,
} from "@/lib/calculo/followup";
import type { Abordagem, Imovel, Tentativa } from "@/lib/tipos";

const HOJE = "2026-07-21";

function tentativa(data: string, canal = "WhatsApp"): Tentativa {
  return { id: `t-${data}-${canal}`, data: `${data}T10:00`, canal, resultado: "sem-resposta" };
}

/** Imóvel elegível por padrão: "Sem resposta", telefone bom, último
    contato bem antigo. Cada teste estraga só o que quer medir. */
function imovel(over: Partial<Imovel> = {}): Imovel {
  return {
    id: "im-1",
    endereco: "Rua Haddock Lobo, 55",
    bairro: "Cerqueira César",
    proprietarioNome: "Marta",
    proprietarioTelefone: "(43) 99802-4316",
    status: "Sem resposta",
    tentativas: [tentativa("2026-05-01")],
    ...over,
  };
}

describe("selecionarFollowUp — quem entra", () => {
  it("pega os 'Sem resposta' e ignora o resto do funil", () => {
    const lista = [
      imovel({ id: "a" }),
      imovel({ id: "b", status: "Novo contato" }),
      imovel({ id: "c", status: "Angariado" }),
      imovel({ id: "d", status: "Locado" }),
    ];
    const { elegiveis } = selecionarFollowUp(lista, HOJE);
    expect(elegiveis.map((i) => i.id)).toEqual(["a"]);
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

  it(`exclui quem falou com o corretor há menos de ${FOLLOWUP_DIAS_DESDE_ULTIMO} dias`, () => {
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
    const limite = "2026-07-07"; // 14 dias antes de HOJE
    const { elegiveis } = selecionarFollowUp([imovel({ tentativas: [tentativa(limite)] })], HOJE);
    expect(elegiveis).toHaveLength(1);
  });

  it(`exclui quem já acumulou ${FOLLOWUP_MAX_TENTATIVAS} tentativas`, () => {
    const muitas = ["2026-01-02", "2026-02-02", "2026-03-02", "2026-04-02"].map((d) => tentativa(d));
    const { elegiveis, excluidos } = selecionarFollowUp([imovel({ tentativas: muitas })], HOJE);
    expect(elegiveis).toHaveLength(0);
    expect(excluidos[0].motivo).toBe("tentativas-demais");
    expect(excluidos[0].detalhe).toBe("4 tentativas");
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
