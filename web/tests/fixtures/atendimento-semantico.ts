import type {
  AfirmacaoAtendimento,
  ContextoAtendimento,
  ConversaAnterior,
  DecisaoAtendimento,
  GeracaoAtendimento,
  ProtocoloPrompt,
} from "@/lib/ia/atendimento";

// Cenários sintéticos; os quatro rascunhos genéricos reproduzem os erros da revisão anterior.
// Nenhum identificador, conversa completa ou cadastro real é necessário ao ensaio.
export const contextoSemantico: ContextoAtendimento = { proprietario: "", estagio: "", fatosImovel: [] };
const eventoLocacao = "locação concluída por outra imobiliária";
const comerciais: ProtocoloPrompt[] = [
  { titulo: "Exclusividade", conteudo: "Não exigimos exclusividade. Antes da locação, o proprietário pode anunciar por conta própria e trabalhar com outras imobiliárias." },
  { titulo: "Custo antes da locação", conteudo: "O proprietário não tem custo antes da locação." },
];
const perguntaParcial = "Se por acaso a outra imobiliária conseguir alugar, como fica a situação?";
const evidenciaExclusividade = {
  id: "evidencia_1", fonteId: "fonte_3",
  fato: "antes da locação não há exclusividade e é permitido anunciar com outras imobiliárias",
  temporalidade: "antes-de-evento" as const, evento: eventoLocacao,
};
const evidenciaCusto = {
  id: "evidencia_2", fonteId: "fonte_4",
  fato: "não há custo antes da locação",
  temporalidade: "antes-de-evento" as const, evento: eventoLocacao,
};
const lacunaDepoisLocacao = {
  id: "lacuna_1", descricao: "consequência exata após locação concluída por outra imobiliária",
  temporalidade: "depois-de-evento" as const, evento: eventoLocacao,
};
const decisaoParcial: DecisaoAtendimento = {
  intencao: "consequência de locação por terceiro", objecao: "", estadoConversacional: "negociacao",
  contextoRelevante: "Condições anteriores à locação conhecidas; consequência por terceiro desconhecida.",
  informacoesJaExplicadas: ["ausência de exclusividade", "anúncio próprio e por outras imobiliárias", "sem custo antes da locação"],
  acaoEsperada: "perguntar", proximoPassoPermitido: "confirmar a consequência desconhecida",
  acoesProibidas: ["explicar-condicoes"], protocolosAplicaveis: comerciais.map((p) => p.titulo),
  evidencias: [evidenciaExclusividade, evidenciaCusto],
  obrigacoesResposta: [
    { id: "obrigacao_1", evidenciaId: "evidencia_1", necessidade: "obrigatoria" },
    { id: "obrigacao_2", evidenciaId: "evidencia_2", necessidade: "obrigatoria" },
  ],
  informacoesFaltantes: [lacunaDepoisLocacao],
  nivelConfianca: "media", precisaIntervencaoHumana: false, podeResponderComSeguranca: true,
};
const historicoParcial: ConversaAnterior = { anteriores: [
  { id: "anterior", autor: "corretor", data: "2026-08-01T09:00:00", texto: "Não exigimos exclusividade. Antes da locação, pode anunciar por conta própria e trabalhar com outras imobiliárias, sem custo." },
] };

const fatoAntes = (evidencia = "evidencia_1"): AfirmacaoAtendimento => ({
  descricao: evidencia === "evidencia_2"
    ? "não há custo antes da locação"
    : "antes da locação é permitido anunciar com outras imobiliárias sem exclusividade",
  tipo: "fato", evidencias: [evidencia], lacunas: [],
  temporalidade: "antes-de-evento", evento: eventoLocacao,
});
const fatoDepoisSemFonte = (evidencia = "evidencia_1"): AfirmacaoAtendimento => ({
  descricao: "a condição permanece depois da locação por outra imobiliária",
  tipo: "fato", evidencias: [evidencia], lacunas: [],
  temporalidade: "depois-de-evento", evento: eventoLocacao,
});
const incertezaDepois: AfirmacaoAtendimento = {
  descricao: "a consequência depois da locação precisa ser confirmada",
  tipo: "incerteza", evidencias: [], lacunas: ["lacuna_1"],
  temporalidade: "depois-de-evento", evento: eventoLocacao,
};
const gerar = (
  mensagem: string,
  protocolosUsados: string[],
  afirmacoes: AfirmacaoAtendimento[],
  obrigacoesCobertas: string[] = [...new Set(
    afirmacoes
      .filter((afirmacao) => afirmacao.tipo === "fato")
      .flatMap((afirmacao) => afirmacao.evidencias)
      .map((id) => id.replace("evidencia_", "obrigacao_")),
  )],
): GeracaoAtendimento => ({ mensagem, protocolosUsados, obrigacoesCobertas, afirmacoes });

export interface CasoSemantico {
  nome: string;
  pergunta: string;
  geracao: GeracaoAtendimento;
  fontes: ProtocoloPrompt[];
  historico?: ConversaAnterior;
  decisao: DecisaoAtendimento;
  contexto?: ContextoAtendimento;
  esperado: "aprovar" | "omissao-parte-comprovada" | "informacao-sem-fonte" | "protocolo-inadequado";
}

const parcial = (
  nome: string,
  resposta: string,
  esperado: CasoSemantico["esperado"],
  afirmacoes: AfirmacaoAtendimento[],
  usados = comerciais.map((p) => p.titulo),
): CasoSemantico => ({
  nome, pergunta: perguntaParcial, geracao: gerar(resposta, usados, afirmacoes),
  esperado, fontes: comerciais, historico: historicoParcial, decisao: decisaoParcial,
});

const historicoPassado: ConversaAnterior = { anteriores: [
  { id: "antiga", autor: "proprietario", data: "2026-06-01T09:00:00", texto: "O imóvel está em reforma." },
] };
const decisaoHistorica: DecisaoAtendimento = {
  ...decisaoParcial,
  intencao: "situação da reforma",
  protocolosAplicaveis: [],
  evidencias: [{
    id: "evidencia_1", fonteId: "fonte_2", fato: "o proprietário informou que o imóvel estava em reforma",
    temporalidade: "historica", evento: "",
  }],
  obrigacoesResposta: [{
    id: "obrigacao_1", evidenciaId: "evidencia_1", necessidade: "obrigatoria",
  }],
  informacoesFaltantes: [{
    id: "lacuna_1", descricao: "situação atual da reforma", temporalidade: "atual", evento: "",
  }],
};
const fatoHistorico: AfirmacaoAtendimento = {
  descricao: "a última informação era de reforma", tipo: "fato",
  evidencias: ["evidencia_1"], lacunas: [], temporalidade: "historica", evento: "",
};
const fatoAtualComHistorico: AfirmacaoAtendimento = {
  descricao: "o imóvel está em reforma agora", tipo: "fato",
  evidencias: ["evidencia_1"], lacunas: [], temporalidade: "atual", evento: "",
};
const incertezaAtual: AfirmacaoAtendimento = {
  descricao: "a situação atual precisa ser confirmada", tipo: "incerteza",
  evidencias: [], lacunas: ["lacuna_1"], temporalidade: "atual", evento: "",
};
const temporal = (
  nome: string,
  resposta: string,
  esperado: CasoSemantico["esperado"],
  afirmacoes: AfirmacaoAtendimento[],
): CasoSemantico => ({
  nome,
  pergunta: "Qual foi a última informação sobre a reforma e o que falta confirmar?",
  geracao: gerar(resposta, [], afirmacoes),
  esperado,
  fontes: [],
  historico: historicoPassado,
  decisao: decisaoHistorica,
});

const decisaoVagas: DecisaoAtendimento = {
  ...decisaoHistorica,
  intencao: "vagas e aceitação de animal",
  evidencias: [{
    id: "evidencia_1", fonteId: "fonte_2", fato: "o imóvel tem duas vagas",
    temporalidade: "atual", evento: "",
  }],
  obrigacoesResposta: [{
    id: "obrigacao_1", evidenciaId: "evidencia_1", necessidade: "obrigatoria",
  }],
  informacoesFaltantes: [{
    id: "lacuna_1", descricao: "aceitação de animal de estimação", temporalidade: "atual", evento: "",
  }],
};
const fatoVagas: AfirmacaoAtendimento = {
  descricao: "o imóvel tem duas vagas", tipo: "fato",
  evidencias: ["evidencia_1"], lacunas: [], temporalidade: "atual", evento: "",
};
const incertezaPet: AfirmacaoAtendimento = {
  descricao: "é preciso confirmar se aceita animal", tipo: "incerteza",
  evidencias: [], lacunas: ["lacuna_1"], temporalidade: "atual", evento: "",
};

export const casosSemanticos: CasoSemantico[] = [
  {
    nome: "informação integral",
    pergunta: "Qual a taxa de administração e em qual modalidade?",
    geracao: gerar("A taxa é de 10% na administração completa.", ["Administração"], [{
      descricao: "na administração completa a taxa é de 10%", tipo: "fato",
      evidencias: ["evidencia_1"], lacunas: [], temporalidade: "atual", evento: "",
    }]),
    fontes: [{ titulo: "Administração", conteudo: "Na administração completa, a taxa de administração é de 10%." }],
    decisao: {
      ...decisaoParcial,
      protocolosAplicaveis: ["Administração"],
      evidencias: [{
        id: "evidencia_1", fonteId: "fonte_2", fato: "na administração completa a taxa é de 10%",
        temporalidade: "atemporal", evento: "",
      }],
      obrigacoesResposta: [{
        id: "obrigacao_1", evidenciaId: "evidencia_1", necessidade: "obrigatoria",
      }],
      informacoesFaltantes: [],
    },
    esperado: "aprovar",
  },
  parcial(
    "resposta parcial útil",
    "Antes da locação, você pode anunciar por conta própria ou com outras imobiliárias, sem exclusividade e sem custo. Vou confirmar a consequência financeira caso outra imobiliária conclua a locação.",
    "aprovar",
    [fatoAntes(), fatoAntes("evidencia_2"), incertezaDepois],
  ),
  parcial("evasiva genérica", "Vou verificar e te retorno.", "omissao-parte-comprovada", [incertezaDepois], []),
  parcial(
    "evasiva observada no LD-288",
    "Entendi, Joao. Esse ponto específico eu vou confirmar pra te passar certinho: se a outra imobiliária locar antes, como fica a situação daqui.",
    "omissao-parte-comprovada",
    [incertezaDepois],
    [],
  ),
  parcial(
    "referência anterior: confirmação total",
    "Entendi. O ponto que não ficou detalhado é justamente o que acontece se a outra imobiliária fechar antes. Vou confirmar esse ponto pra te passar certinho. Se quiser, me diz se a sua dúvida é sobre comissão ou sobre a divulgação.",
    "protocolo-inadequado",
    [incertezaDepois],
  ),
  parcial(
    "referência anterior: esclarecimento evasivo",
    "Claro — me fala qual parte você quer saber certinho, que eu te respondo sem passar informação errada.",
    "omissao-parte-comprovada",
    [],
    [],
  ),
  parcial(
    "referência anterior: divulgação após locação",
    "Se a outra imobiliária alugar, tudo bem. Como a gente trabalha sem exclusividade, o imóvel pode seguir com a divulgação por lá também. E antes da locação você não tem nenhum custo com a gente.",
    "informacao-sem-fonte",
    [fatoDepoisSemFonte(), fatoAntes("evidencia_2")],
  ),
  parcial(
    "referência anterior: liberdade após locação",
    "Se outra imobiliária alugar primeiro, tudo certo — como a gente trabalha sem exclusividade, você segue livre. E até a locação, você não tem custo com a divulgação. Se quiser, eu confirmo esse ponto com você e te explico o próximo passo mais certinho.",
    "informacao-sem-fonte",
    [fatoDepoisSemFonte(), fatoAntes("evidencia_2"), incertezaDepois],
  ),
  parcial(
    "isenção não sustentada",
    "Não há exclusividade e você não terá nenhuma taxa nem multa se outra imobiliária alugar.",
    "informacao-sem-fonte",
    [fatoAntes(), fatoDepoisSemFonte("evidencia_2")],
  ),
  ...["continua em reforma", "ainda está em reforma", "segue em reforma", "permanece em reforma", "continua sendo reformado", "está em reforma"].map((expressao) =>
    temporal(
      "histórico não prova: " + expressao,
      "O imóvel " + expressao + ". Vou confirmar a previsão de término.",
      "informacao-sem-fonte",
      [fatoAtualComHistorico, incertezaAtual],
    )),
  temporal(
    "histórico qualificado",
    "Na mensagem anterior, você informou que o imóvel estava em reforma. Vou confirmar a situação atual.",
    "aprovar",
    [fatoHistorico, incertezaAtual],
  ),
  temporal(
    "incerteza sem bloqueio total",
    "A última informação era de uma reforma. Não tenho confirmação de que ela continue; vou verificar a situação atual.",
    "aprovar",
    [fatoHistorico, incertezaAtual],
  ),
  {
    ...temporal(
      "continuidade comprovada na mensagem atual",
      "Você informou agora que o imóvel continua em reforma. Vou confirmar a previsão de término.",
      "aprovar",
      [{
        descricao: "o proprietário informou agora que o imóvel está em reforma",
        tipo: "fato", evidencias: ["evidencia_1"], lacunas: [], temporalidade: "atual", evento: "",
      }, incertezaAtual],
    ),
    pergunta: "O imóvel continua em reforma hoje. Você consegue confirmar quando acaba?",
    decisao: {
      ...decisaoHistorica,
      evidencias: [{
        id: "evidencia_1", fonteId: "fonte_1", fato: "o proprietário informou agora que o imóvel está em reforma",
        temporalidade: "atual", evento: "",
      }],
    },
  },
  {
    nome: "regra comercial atual",
    pergunta: "Ainda posso anunciar com outra imobiliária antes da locação?",
    geracao: gerar("Sim, antes da locação você pode anunciar com outras imobiliárias, sem exclusividade.", ["Exclusividade"], [fatoAntes()]),
    fontes: comerciais,
    decisao: {
      ...decisaoParcial,
      evidencias: [{ ...evidenciaExclusividade, fonteId: "fonte_2" }],
      obrigacoesResposta: [{
        id: "obrigacao_1", evidenciaId: "evidencia_1", necessidade: "obrigatoria",
      }],
      informacoesFaltantes: [],
    },
    esperado: "aprovar",
  },
  {
    nome: "sem parte conhecida relevante",
    pergunta: "Existe taxa para cancelar antes da locação?",
    geracao: gerar("Vou confirmar se existe essa taxa antes de te passar a informação.", [], [{
      descricao: "a existência da taxa antes da locação precisa ser confirmada",
      tipo: "incerteza", evidencias: [], lacunas: ["lacuna_1"],
      temporalidade: "antes-de-evento", evento: "locação",
    }]),
    fontes: [],
    decisao: {
      ...decisaoParcial,
      protocolosAplicaveis: [],
      evidencias: [],
      obrigacoesResposta: [],
      informacoesFaltantes: [{
        id: "lacuna_1", descricao: "existência de taxa antes da locação",
        temporalidade: "antes-de-evento", evento: "locação",
      }],
    },
    esperado: "aprovar",
  },
  {
    nome: "social não exige fatos",
    pergunta: "Obrigado!",
    geracao: gerar("Por nada!", [], []),
    fontes: comerciais,
    decisao: { ...decisaoParcial, protocolosAplicaveis: [], evidencias: [], obrigacoesResposta: [], informacoesFaltantes: [] },
    esperado: "aprovar",
  },
  {
    nome: "omissão em domínio diferente",
    pergunta: "Quantas vagas tem e aceita animal de estimação?",
    geracao: gerar("Vou confirmar essas informações e te retorno.", [], [incertezaPet]),
    fontes: [],
    contexto: { ...contextoSemantico, fatosImovel: ["Vagas: 2"] },
    decisao: decisaoVagas,
    esperado: "omissao-parte-comprovada",
  },
  {
    nome: "parcial em domínio diferente",
    pergunta: "Quantas vagas tem e aceita animal de estimação?",
    geracao: gerar("O imóvel tem duas vagas. Vou confirmar se aceita animal de estimação.", [], [fatoVagas, incertezaPet]),
    fontes: [],
    contexto: { ...contextoSemantico, fatosImovel: ["Vagas: 2"] },
    decisao: decisaoVagas,
    esperado: "aprovar",
  },
  {
    ...temporal(
      "histórico sem data não prova continuidade",
      "O imóvel permanece em reforma. Vou confirmar o prazo.",
      "informacao-sem-fonte",
      [fatoAtualComHistorico, incertezaAtual],
    ),
    historico: { anteriores: [{ autor: "proprietario", texto: "O imóvel está em reforma." }] },
  },
  {
    nome: "fato irrelevante não exige inclusão",
    pergunta: "Aceita animal de estimação?",
    geracao: gerar("Vou confirmar se aceita animal de estimação.", [], [incertezaPet]),
    fontes: [],
    contexto: { ...contextoSemantico, fatosImovel: ["Vagas: 2"] },
    decisao: { ...decisaoVagas, obrigacoesResposta: [] },
    esperado: "aprovar",
  },
];
