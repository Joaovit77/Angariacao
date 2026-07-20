/* Contrato das partes puras da IA (lib/calculo/ia).
   O que importa aqui não é o texto exato do prompt, e sim as garantias:
   o contexto do browser é truncado, os números vão prontos no prompt
   (a IA não recalcula nada) e todo motivo de falha tem mensagem pt-BR. */
import { describe, expect, it } from "vitest";
import {
  MAX_CONTEXTO,
  mensagemFalhaIa,
  promptAnalisarAbordagens,
  promptSugerirRoteiros,
  resumirRankingParaPrompt,
  type FalhaIa,
} from "@/lib/calculo/ia";
import type { AbordagemDesempenho, ResumoTentativas } from "@/lib/calculo/abordagens";

const RANKING: AbordagemDesempenho[] = [
  {
    abordagemId: "a1",
    nome: "Avaliação gratuita",
    tentativas: 8,
    respostas: 2,
    taxaResposta: 25,
    imoveis: 6,
    angariados: 3,
    taxaAngariacao: 50,
    destravou: 0,
    aberturas: 8,
    seguimentos: 0,
    amostraSuficiente: true,
  },
  {
    abordagemId: "a2",
    nome: "Imóvel parado?",
    tentativas: 1,
    respostas: 1,
    taxaResposta: 100,
    imoveis: 1,
    angariados: 1,
    taxaAngariacao: 100,
    destravou: 1,
    aberturas: 0,
    seguimentos: 1,
    amostraSuficiente: false,
  },
];

const RESUMO: ResumoTentativas = {
  total: 9,
  semAbordagem: 2,
  imoveisComTentativa: 6,
  mediaTentativasAteAngariar: 2.5,
};

describe("mensagemFalhaIa", () => {
  it("tem mensagem pt-BR para todos os motivos", () => {
    const motivos: FalhaIa[] = [
      "nao-configurado",
      "sessao-expirada",
      "requisicao-invalida",
      "sem-dados",
      "limite-excedido",
      "falha-ia",
    ];
    for (const m of motivos) {
      const texto = mensagemFalhaIa(m);
      expect(texto.length).toBeGreaterThan(10);
      expect(texto).toMatch(/[.!]$/);
    }
  });
});

describe("promptSugerirRoteiros", () => {
  it("inclui o cenário informado", () => {
    const p = promptSugerirRoteiros({
      tipoImovel: "Apartamento",
      bairro: "Gleba Palhano",
      situacao: "anunciado há meses",
    });
    expect(p).toContain("Apartamento");
    expect(p).toContain("Gleba Palhano");
    expect(p).toContain("anunciado há meses");
  });

  it("sem contexto, pede abordagens de uso geral em vez de inventar cenário", () => {
    const p = promptSugerirRoteiros({});
    expect(p).toContain("Nenhum detalhe informado");
  });

  // Defesa contra texto colado sem querer — e contra um prompt gigante
  // mandado de propósito para inflar o consumo de tokens.
  it("trunca cada campo do contexto em MAX_CONTEXTO", () => {
    const gigante = "x".repeat(5000);
    const p = promptSugerirRoteiros({ bairro: gigante });
    // O maior trecho, não o primeiro: o texto fixo do prompt tem "x" solto
    // em palavras como "exagero", e /x+/ pararia nele.
    const maiorSequencia = Math.max(...[...p.matchAll(/x+/g)].map((m) => m[0].length));
    expect(maiorSequencia).toBe(MAX_CONTEXTO);
    expect(p.length).toBeLessThan(3000);
  });

  it("proíbe promessa de resultado, que a IA não teria como sustentar", () => {
    const p = promptSugerirRoteiros({});
    expect(p).toContain("Nada de promessa de valor, prazo ou resultado");
  });

  // Achado do primeiro teste real: a IA ofereceu um "comparativo do bairro"
  // que o corretor pode não ter. Prometer material inexistente queima o
  // contato — pior que não abordar.
  it("proíbe oferecer material pronto, mas libera o que o corretor produz na hora", () => {
    const p = promptSugerirRoteiros({});
    expect(p).toContain("Não ofereça material que já esteja pronto");
    expect(p).toContain("uma avaliação do valor, uma visita");
  });

  // Feedback do dono: a abordagem dele sempre se apresenta com nome e
  // empresa ("meu nome é João e falo da Imobiliária Atual"). Com os dados,
  // a IA escreve a apresentação; sem eles, não inventa nome nenhum.
  it("com captador e empresa, manda se apresentar com os dados reais", () => {
    const p = promptSugerirRoteiros({ captador: "João", empresa: "Imobiliária Atual" });
    expect(p).toContain("o corretor se chama João e fala da Imobiliária Atual");
  });

  it("sem captador nem empresa, proíbe apresentação nominal em vez de inventar", () => {
    const p = promptSugerirRoteiros({});
    expect(p).toContain("sem apresentação nominal");
    // O exemplo de referência não pode conter nome real fixo — outra
    // imobiliária usando o sistema não pode herdar "Imobiliária Atual".
    expect(p).not.toContain("falo da Imobiliária Atual");
  });

  it("usa os marcadores da casa: {nome} e {imovel}, nada de {endereço}", () => {
    const p = promptSugerirRoteiros({});
    expect(p).toContain("{nome}");
    expect(p).toContain("{imovel}");
    expect(p).toContain("Não invente outros marcadores");
  });

  it("traz o exemplo de tom do corretor como referência, com aviso de não copiar", () => {
    const p = promptSugerirRoteiros({});
    expect(p).toContain("Referência de tom");
    expect(p).toContain("NÃO copie");
    expect(p).toContain("confirmar se estou falando com o proprietário");
  });

  // A reclamação "ela sempre se repete": os nomes já cadastrados vão no
  // prompt para a IA propor ângulos que o corretor ainda não tem.
  it("lista as abordagens existentes e manda não repetir esses ângulos", () => {
    const p = promptSugerirRoteiros({}, ["Avaliação gratuita", "Imóvel parado?"]);
    expect(p).toContain("NÃO repita estes ângulos");
    expect(p).toContain("- Avaliação gratuita");
    expect(p).toContain("- Imóvel parado?");
  });

  it("sem abordagens cadastradas, não inventa seção de repetição", () => {
    const p = promptSugerirRoteiros({});
    expect(p).not.toContain("NÃO repita estes ângulos");
  });

  it("trunca a lista de existentes em MAX_NOMES_EXISTENTES", () => {
    const muitos = Array.from({ length: 50 }, (_, i) => `Abordagem ${i + 1}`);
    const p = promptSugerirRoteiros({}, muitos);
    expect(p).toContain("- Abordagem 20");
    expect(p).not.toContain("- Abordagem 21");
  });
});

describe("resumirRankingParaPrompt", () => {
  it("entrega os números já calculados, um por abordagem", () => {
    const texto = resumirRankingParaPrompt(RANKING, RESUMO);
    expect(texto).toContain('"Avaliação gratuita"');
    expect(texto).toContain("8 tentativa(s)");
    expect(texto).toContain("25% de resposta");
    expect(texto).toContain("3 angariado(s) (50%)");
    expect(texto).toContain("destravou 0");
  });

  it("marca amostra baixa para a IA saber que não pode concluir dali", () => {
    const texto = resumirRankingParaPrompt(RANKING, RESUMO);
    expect(texto).toContain('"Imóvel parado?" [amostra baixa]');
    expect(texto).not.toContain('"Avaliação gratuita" [amostra baixa]');
  });

  it("informa quando ainda não há média de tentativas até angariar", () => {
    const texto = resumirRankingParaPrompt(RANKING, { ...RESUMO, mediaTentativasAteAngariar: null });
    expect(texto).toContain("ainda sem caso para calcular");
  });
});

describe("promptAnalisarAbordagens", () => {
  it("manda interpretar, não recalcular — é o que impede número inventado", () => {
    const p = promptAnalisarAbordagens(RANKING, RESUMO);
    expect(p).toContain("não os recalcule e não invente nenhum que não esteja aqui");
    expect(p).toContain('"Avaliação gratuita"');
  });

  it("explica o vocabulário das medidas (resposta / angariação / destravou)", () => {
    const p = promptAnalisarAbordagens(RANKING, RESUMO);
    expect(p).toContain("recusar conta como reagir");
    expect(p).toContain("É participação, não causa");
    expect(p).toContain("última tentativa antes da angariação");
  });

  it("autoriza dizer que os dados são escassos em vez de forçar conclusão", () => {
    const p = promptAnalisarAbordagens(RANKING, RESUMO);
    expect(p).toContain("diga isso com franqueza");
  });
});
