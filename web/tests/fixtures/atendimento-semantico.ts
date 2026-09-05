import type { ContextoAtendimento, ConversaAnterior, DecisaoAtendimento, ProtocoloPrompt } from "@/lib/ia/atendimento";

// Cenários sintéticos; os quatro rascunhos genéricos reproduzem os erros da revisão anterior.
// Nenhum identificador, conversa completa ou cadastro real é necessário ao ensaio.
export const contextoSemantico: ContextoAtendimento = { proprietario: "", estagio: "", fatosImovel: [] };
const comerciais: ProtocoloPrompt[] = [
  { titulo: "Exclusividade", conteudo: "Não exigimos exclusividade. Antes da locação, o proprietário pode anunciar por conta própria e trabalhar com outras imobiliárias." },
  { titulo: "Custo antes da locação", conteudo: "O proprietário não tem custo antes da locação." },
];
const perguntaParcial = "Se por acaso a outra imobiliária conseguir alugar, como fica a situação?";
const decisaoParcial: DecisaoAtendimento = {
  intencao: "consequência de locação por terceiro", objecao: "", estadoConversacional: "negociacao",
  contextoRelevante: "Condições anteriores à locação conhecidas; consequência financeira por terceiro desconhecida.",
  informacoesJaExplicadas: ["ausência de exclusividade", "anúncio próprio e por outras imobiliárias", "sem custo antes da locação"],
  acaoEsperada: "perguntar", proximoPassoPermitido: "confirmar a consequência desconhecida",
  acoesProibidas: ["explicar-condicoes"], protocolosAplicaveis: comerciais.map(p => p.titulo),
  mensagensEvidencia: ["anterior"], informacoesFaltantes: ["consequência financeira se outra imobiliária alugar"],
  nivelConfianca: "media", precisaIntervencaoHumana: false, podeResponderComSeguranca: true,
};
const historicoParcial: ConversaAnterior = { anteriores: [
  { id: "anterior", autor: "corretor", data: "2026-08-01T09:00:00", texto: "Não exigimos exclusividade. Antes da locação, pode anunciar por conta própria e trabalhar com outras imobiliárias, sem custo." },
] };
export interface CasoSemantico {
  nome: string;
  pergunta: string;
  resposta: string;
  fontes: ProtocoloPrompt[];
  usados: string[];
  historico?: ConversaAnterior;
  decisao?: DecisaoAtendimento;
  contexto?: ContextoAtendimento;
  esperado: "aprovar" | "omissao-parte-comprovada" | "informacao-sem-fonte" | "cobranca-sem-fonte";
}
const parcial = (nome: string, resposta: string, esperado: CasoSemantico["esperado"], usados = comerciais.map(p => p.titulo)): CasoSemantico =>
  ({ nome, pergunta: perguntaParcial, resposta, esperado, fontes: comerciais, usados, historico: historicoParcial, decisao: decisaoParcial });
const historicoPassado: ConversaAnterior = { anteriores: [
  { id: "antiga", autor: "proprietario", data: "2026-06-01T09:00:00", texto: "O imóvel está em reforma." },
] };
const temporal = (nome: string, resposta: string, esperado: CasoSemantico["esperado"]): CasoSemantico =>
  ({ nome, pergunta: "Qual foi a última informação sobre a reforma e o que falta confirmar?", resposta, esperado, fontes: [], usados: [], historico: historicoPassado });

export const casosSemanticos: CasoSemantico[] = [
  { nome: "informação integral", pergunta: "Qual a taxa de administração e em qual modalidade?", resposta: "A taxa é de 10% na administração completa.",
    fontes: [{ titulo: "Administração", conteudo: "Na administração completa, a taxa de administração é de 10%." }], usados: ["Administração"], esperado: "aprovar" },
  parcial("resposta parcial útil", "Antes da locação, você pode anunciar por conta própria ou com outras imobiliárias, sem exclusividade e sem custo. Vou confirmar a consequência financeira caso outra imobiliária conclua a locação.", "aprovar"),
  parcial("evasiva genérica", "Vou verificar e te retorno.", "omissao-parte-comprovada", []),
  parcial("referência anterior: confirmação total", "Entendi. O ponto que não ficou detalhado é justamente o que acontece se a outra imobiliária fechar antes. Vou confirmar esse ponto pra te passar certinho. Se quiser, me diz se a sua dúvida é sobre comissão ou sobre a divulgação.", "omissao-parte-comprovada"),
  parcial("referência anterior: esclarecimento evasivo", "Claro — me fala qual parte você quer saber certinho, que eu te respondo sem passar informação errada.", "omissao-parte-comprovada", []),
  parcial("referência anterior: divulgação após locação", "Se a outra imobiliária alugar, tudo bem. Como a gente trabalha sem exclusividade, o imóvel pode seguir com a divulgação por lá também. E antes da locação você não tem nenhum custo com a gente.", "informacao-sem-fonte"),
  parcial("referência anterior: liberdade após locação", "Se outra imobiliária alugar primeiro, tudo certo — como a gente trabalha sem exclusividade, você segue livre. E até a locação, você não tem custo com a divulgação. Se quiser, eu confirmo esse ponto com você e te explico o próximo passo mais certinho.", "informacao-sem-fonte"),
  parcial("isenção não sustentada", "Não há exclusividade e você não terá nenhuma taxa nem multa se outra imobiliária alugar.", "cobranca-sem-fonte"),
  ...["continua em reforma", "ainda está em reforma", "segue em reforma", "permanece em reforma", "continua sendo reformado", "está em reforma"].map(expressao =>
    temporal("histórico não prova: " + expressao, "O imóvel " + expressao + ". Vou confirmar a previsão de término.", "informacao-sem-fonte")),
  temporal("histórico qualificado", "Na mensagem anterior, você informou que o imóvel estava em reforma. Vou confirmar a situação atual e a previsão de término.", "aprovar"),
  temporal("incerteza sem bloqueio total", "A última informação era de uma reforma. Não tenho confirmação de que ela continue; vou verificar a situação atual.", "aprovar"),
  { ...temporal("continuidade comprovada na mensagem atual", "Você informou agora que o imóvel continua em reforma. Vou confirmar a previsão de término.", "aprovar"),
    pergunta: "O imóvel continua em reforma hoje. Você consegue confirmar quando acaba?" },
  { nome: "regra comercial atual", pergunta: "Ainda posso anunciar com outra imobiliária antes da locação?",
    resposta: "Sim, antes da locação você pode anunciar com outras imobiliárias, sem exclusividade.", fontes: comerciais, usados: ["Exclusividade"], esperado: "aprovar" },
  { nome: "sem parte conhecida relevante", pergunta: "Existe taxa para cancelar antes da locação?",
    resposta: "Vou confirmar se existe essa taxa antes de te passar a informação.", fontes: [], usados: [], esperado: "aprovar" },
  { nome: "social não exige fatos", pergunta: "Obrigado!", resposta: "Por nada!", fontes: comerciais, usados: [], esperado: "aprovar" },
  { nome: "omissão em domínio diferente", pergunta: "Quantas vagas tem e aceita animal de estimação?",
    resposta: "Vou confirmar essas informações e te retorno.", fontes: [], usados: [],
    contexto: { ...contextoSemantico, fatosImovel: ["Vagas: 2"] }, esperado: "omissao-parte-comprovada" },
  { nome: "parcial em domínio diferente", pergunta: "Quantas vagas tem e aceita animal de estimação?",
    resposta: "O imóvel tem duas vagas. Vou confirmar se aceita animal de estimação.", fontes: [], usados: [],
    contexto: { ...contextoSemantico, fatosImovel: ["Vagas: 2"] }, esperado: "aprovar" },
  { ...temporal("histórico sem data não prova continuidade", "O imóvel permanece em reforma. Vou confirmar o prazo.", "informacao-sem-fonte"),
    historico: { anteriores: [{ autor: "proprietario", texto: "O imóvel está em reforma." }] } },
  { nome: "fato irrelevante não exige inclusão", pergunta: "Aceita animal de estimação?", resposta: "Vou confirmar se aceita animal de estimação.",
    fontes: [], usados: [], contexto: { ...contextoSemantico, fatosImovel: ["Vagas: 2"] }, esperado: "aprovar" },
];
