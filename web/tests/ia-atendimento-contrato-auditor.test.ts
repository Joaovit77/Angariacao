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
  afirmacoesAuditadas: [afirmacaoAtual],
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

  it("aceita aprovação legítima sem afirmações e sem preencher estrutura fictícia", () => {
    const aprovadoSemFatos = { problemas: [], afirmacoesAuditadas: [] } satisfies ValidacaoAtendimento;
    expect(normalizarValidacaoAtendimento(aprovadoSemFatos)).toEqual(aprovadoSemFatos);
  });

  it.each([
    ["campo obrigatório ausente", semCampo(validacaoAprovada, "afirmacoesAuditadas")],
    ["campo extra", { ...validacaoAprovada, explicacao: "não permitida" }],
    ["enum inesperado", {
      ...validacaoAprovada,
      afirmacoesAuditadas: [{ ...afirmacaoAtual, temporalidade: "presente" }],
    }],
    ["null onde não é permitido", { ...validacaoAprovada, afirmacoesAuditadas: null }],
    ["string vazia", {
      ...validacaoAprovada,
      afirmacoesAuditadas: [{ ...afirmacaoAtual, descricao: "   " }],
    }],
    ["array ausente", {
      ...validacaoAprovada,
      afirmacoesAuditadas: [semCampo(afirmacaoAtual as unknown as Record<string, unknown>, "evidencias")],
    }],
    ["tipo incorreto", { ...validacaoAprovada, problemas: "informacao-sem-fonte" }],
    ["evidence ID inválido", {
      ...validacaoAprovada,
      afirmacoesAuditadas: [{ ...afirmacaoAtual, evidencias: ["evidência-livre"] }],
    }],
    ["claim ID inesperado", {
      ...validacaoAprovada,
      afirmacoesAuditadas: [{ ...afirmacaoAtual, id: "claim_1" }],
    }],
    ["estrutura aninhada diferente", {
      ...validacaoAprovada,
      afirmacoesAuditadas: [{ ...afirmacaoAtual, evidencias: [{ id: "evidencia_1" }] }],
    }],
    ["evento preenchido em temporalidade não relativa", {
      ...validacaoAprovada,
      afirmacoesAuditadas: [{ ...afirmacaoAtual, evento: "reforma" }],
    }],
    ["evento ausente em temporalidade relativa", {
      ...validacaoAprovada,
      afirmacoesAuditadas: [{
        ...afirmacaoAtual,
        temporalidade: "depois-de-evento",
        evento: "",
      }],
    }],
  ])("rejeita %s", (_nome, valor) => {
    expect(atendeSchemaAtendimento(valor, ESQUEMA_VALIDACAO_ATENDIMENTO)).toBe(false);
    expect(normalizarValidacaoAtendimento(valor)).toBeNull();
    expect(motivoReprovacaoValidacaoAtendimento(valor)).toBeUndefined();
  });

  it("não cria divergência local para referências repetidas permitidas pelo schema", () => {
    const repetida = {
      ...validacaoAprovada,
      afirmacoesAuditadas: [{
        ...afirmacaoAtual,
        evidencias: ["evidencia_1", "evidencia_1"],
      }],
    } satisfies ValidacaoAtendimento;
    expect(atendeSchemaAtendimento(repetida, ESQUEMA_VALIDACAO_ATENDIMENTO)).toBe(true);
    expect(normalizarValidacaoAtendimento(repetida)).toEqual(repetida);
  });

  it("prompt e response_format usam os mesmos campos e regras temporais", () => {
    const geracao: GeracaoAtendimento = {
      mensagem: "O imóvel tem duas vagas.",
      protocolosUsados: [],
      afirmacoes: [afirmacaoAtual],
    };
    const prompt = promptValidarAtendimento(
      "Quantas vagas?",
      { proprietario: "", estagio: "Em negociação", fatosImovel: ["vagas: 2"] },
      undefined,
      [],
      geracao,
    );
    expect(prompt).toContain("afirmacoesAuditadas");
    expect(prompt).toContain("evidencia_N");
    expect(prompt).toContain("tempo e evento expressos no texto");
    expect(ESQUEMA_VALIDACAO_ATENDIMENTO.required).toEqual(["problemas", "afirmacoesAuditadas"]);
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
    expect(normalizarValidacaoAtendimento({
      problemas: [],
      afirmacoesAuditadas: [inexistente],
    })).not.toBeNull();
    expect(bloquear(inexistente)).toBe("informacao-sem-fonte");
  });

  it("bloqueia claim factual sem evidência mesmo quando a estrutura JSON é válida", () => {
    const semEvidencia = { ...afirmacaoAtual, evidencias: [] };
    expect(normalizarValidacaoAtendimento({
      problemas: [],
      afirmacoesAuditadas: [semEvidencia],
    })).not.toBeNull();
    expect(bloquear(semEvidencia)).toBe("informacao-sem-fonte");
  });
});
