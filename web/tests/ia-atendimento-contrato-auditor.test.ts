import { describe, expect, it } from "vitest";
import {
  ESQUEMA_VALIDACAO_ATENDIMENTO,
  motivoBloqueioRascunhoDeterministico,
  motivoReprovacaoValidacaoAtendimento,
  normalizarValidacaoAtendimento,
  promptValidarAtendimento,
  type AfirmacaoAtendimento,
  type DecisaoAtendimento,
  type FonteEvidenciaAtendimento,
  type GeracaoAtendimento,
  type ValidacaoAtendimento,
} from "@/lib/ia/atendimento";
import { atendeSchemaAtendimento } from "@/lib/ia/atendimento/schema";
import { normalizarPerfilComunicacao } from "@/lib/perfilComunicacao";

const afirmacaoAtual: AfirmacaoAtendimento = {
  descricao: "o imóvel tem duas vagas",
  tipo: "fato",
  evidencias: ["evidencia_1"],
  lacunas: [],
  temporalidade: "atual",
  evento: "",
};
const validacaoAprovada: ValidacaoAtendimento = {
  problemas: [],
};

const semCampo = (objeto: object, campo: string) => {
  const copia: Record<string, unknown> = { ...objeto };
  delete copia[campo];
  return copia;
};

function validarFechamentoRecursivo(esquema: unknown): void {
  if (!esquema || typeof esquema !== "object") return;
  const valor = esquema as {
    type?: string;
    properties?: Record<string, unknown>;
    required?: string[];
    additionalProperties?: boolean;
    items?: unknown;
    anyOf?: unknown[];
  };
  if (valor.anyOf) valor.anyOf.forEach(validarFechamentoRecursivo);
  if (valor.type === "object") {
    expect(valor.additionalProperties).toBe(false);
    expect(new Set(valor.required)).toEqual(new Set(Object.keys(valor.properties ?? {})));
    Object.values(valor.properties ?? {}).forEach(validarFechamentoRecursivo);
  }
  if (valor.items) validarFechamentoRecursivo(valor.items);
}

describe("contrato estrutural do auditor", () => {
  it("mantém JSON Schema, TypeScript, parser e normalização no mesmo objeto válido", () => {
    const tipado: ValidacaoAtendimento = validacaoAprovada;
    expect(atendeSchemaAtendimento(tipado, ESQUEMA_VALIDACAO_ATENDIMENTO)).toBe(true);
    expect(normalizarValidacaoAtendimento(tipado)).toEqual(tipado);
    expect(motivoReprovacaoValidacaoAtendimento(tipado)).toBeNull();
    validarFechamentoRecursivo(ESQUEMA_VALIDACAO_ATENDIMENTO);
  });

  it("aceita aprovação residual sem reconstruir afirmações já validadas", () => {
    const aprovadoSemProblemas = { problemas: [] } satisfies ValidacaoAtendimento;
    expect(normalizarValidacaoAtendimento(aprovadoSemProblemas)).toEqual(aprovadoSemProblemas);
  });

  it.each([
    ["campo obrigatório ausente", semCampo(validacaoAprovada, "problemas")],
    ["campo extra", { ...validacaoAprovada, explicacao: "não permitida" }],
    ["código determinístico fora do auditor", { problemas: ["informacao-sem-fonte"] }],
    ["null onde não é permitido", { problemas: null }],
    ["tipo incorreto", { problemas: "desvio-de-assunto" }],
  ])("rejeita %s", (_nome, valor) => {
    expect(atendeSchemaAtendimento(valor, ESQUEMA_VALIDACAO_ATENDIMENTO)).toBe(false);
    expect(normalizarValidacaoAtendimento(valor)).toBeNull();
    expect(motivoReprovacaoValidacaoAtendimento(valor)).toBeUndefined();
  });

  it("não cria divergência local para códigos repetidos permitidos pelo schema", () => {
    const repetida = {
      problemas: ["desvio-de-assunto", "desvio-de-assunto"],
    } satisfies ValidacaoAtendimento;
    expect(atendeSchemaAtendimento(repetida, ESQUEMA_VALIDACAO_ATENDIMENTO)).toBe(true);
    expect(normalizarValidacaoAtendimento(repetida)).toEqual(repetida);
  });

  it("prompt e response_format usam os mesmos campos e regras temporais", () => {
    const geracao: GeracaoAtendimento = {
      mensagem: "O imóvel tem duas vagas.",
      protocolosUsados: [],
      obrigacoesCobertas: [],
      afirmacoes: [afirmacaoAtual],
    };
    const prompt = promptValidarAtendimento(
      "Quantas vagas?",
      { proprietario: "", estagio: "Em negociação", fatosImovel: ["vagas: 2"] },
      undefined,
      [],
      geracao,
    );
    expect(prompt).toContain("camada determinística já validou");
    expect(prompt).toContain("afirmacao-nao-declarada");
    expect(prompt).not.toContain("afirmacoesAuditadas");
    expect(ESQUEMA_VALIDACAO_ATENDIMENTO.required).toEqual(["problemas"]);
  });
});

const fontes: FonteEvidenciaAtendimento[] = [{
  id: "fonte_1",
  origem: "dado-estruturado-imovel",
  autoridade: "dado-estruturado-atual",
  referencia: "vagas",
  conteudo: "vagas: 2",
  temporalidadeBase: "atual",
}];
const decisao: DecisaoAtendimento = {
  intencao: "vagas",
  objecao: "",
  estadoConversacional: "entendimento",
  contextoRelevante: "duas vagas",
  informacoesJaExplicadas: [],
  acaoEsperada: "responder",
  proximoPassoPermitido: "responder",
  acoesProibidas: [],
  protocolosAplicaveis: [],
  evidencias: [{
    id: "evidencia_1",
    fonteId: "fonte_1",
    fato: "o imóvel tem duas vagas",
    temporalidade: "atual",
    evento: "",
  }],
  obrigacoesResposta: [],
  informacoesFaltantes: [],
  nivelConfianca: "alta",
  precisaIntervencaoHumana: false,
  podeResponderComSeguranca: true,
};

describe("separação entre estrutura e segurança referencial", () => {
  const bloquear = (afirmacao: AfirmacaoAtendimento) =>
    motivoBloqueioRascunhoDeterministico(
      "Resposta sintética.",
      [],
      [afirmacao],
      decisao,
      normalizarPerfilComunicacao(null),
      fontes,
    );

  it("bloqueia evidence ID sintaticamente válido, mas inexistente", () => {
    const inexistente = { ...afirmacaoAtual, evidencias: ["evidencia_99"] };
    expect(bloquear(inexistente)).toBe("informacao-sem-fonte");
  });

  it("bloqueia claim factual sem evidência mesmo quando a estrutura JSON é válida", () => {
    const semEvidencia = { ...afirmacaoAtual, evidencias: [] };
    expect(bloquear(semEvidencia)).toBe("informacao-sem-fonte");
  });
});
