import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  catalogoFontesAtendimento,
  motivoBloqueioCoberturaDeterministico,
  motivoBloqueioRascunhoDeterministico,
  normalizarDecisaoAtendimento,
  normalizarGeracaoAtendimento,
  type AfirmacaoAtendimento,
  type DecisaoAtendimento,
  type EvidenciaAtendimento,
  type FonteEvidenciaAtendimento,
} from "@/lib/ia/atendimento";
import { normalizarPerfilComunicacao } from "@/lib/perfilComunicacao";
import type { ExecutorOpenAI } from "@/lib/servidor/ia/executor-openai";

vi.mock("@/lib/servidor/registro", () => ({ registrarEvento: vi.fn() }));
vi.mock("@/lib/servidor/ia/feedback-config", () => ({ feedbackSugestoesIaHabilitado: () => false }));

import { atenderProprietario } from "@/lib/servidor/ia/handlers/atendimento";

const evento = "locação concluída por outra imobiliária";
const perfil = normalizarPerfilComunicacao(null);
const fontes: FonteEvidenciaAtendimento[] = [
  {
    id: "fonte_1", origem: "dado-estruturado-imovel", autoridade: "dado-estruturado-atual",
    referencia: "fonte-pre", conteudo: "condição anterior", temporalidadeBase: "desconhecida",
  },
  {
    id: "fonte_2", origem: "dado-estruturado-imovel", autoridade: "dado-estruturado-atual",
    referencia: "fonte-pos", conteudo: "condição posterior", temporalidadeBase: "desconhecida",
  },
  {
    id: "fonte_3", origem: "historico", autoridade: "fala-historica-atribuida",
    referencia: "fonte-historica", conteudo: "condição histórica", temporalidadeBase: "historica",
  },
  {
    id: "fonte_4", origem: "protocolo", autoridade: "protocolo-ativo",
    referencia: "Regra atemporal", conteudo: "condição atemporal", temporalidadeBase: "desconhecida",
  },
  {
    id: "fonte_5", origem: "historico", autoridade: "fallback-legado",
    referencia: "fonte-desconhecida", conteudo: "condição sem momento comprovado", temporalidadeBase: "desconhecida",
  },
];
const evidencias: EvidenciaAtendimento[] = [
  {
    id: "evidencia_1", fonteId: "fonte_1", fato: "condição antes da locação",
    temporalidade: "antes-de-evento", evento,
  },
  {
    id: "evidencia_2", fonteId: "fonte_2", fato: "condição depois da locação",
    temporalidade: "depois-de-evento", evento,
  },
  {
    id: "evidencia_3", fonteId: "fonte_3", fato: "condição registrada no passado",
    temporalidade: "historica", evento: "",
  },
  {
    id: "evidencia_4", fonteId: "fonte_4", fato: "regra sem limite temporal",
    temporalidade: "atemporal", evento: "",
  },
  {
    id: "evidencia_5", fonteId: "fonte_5", fato: "condição com temporalidade não comprovada",
    temporalidade: "desconhecida", evento: "",
  },
];
const decisaoBase: DecisaoAtendimento = {
  intencao: "dúvida temporal", objecao: "", estadoConversacional: "negociacao",
  contextoRelevante: "há uma parte conhecida e outra desconhecida",
  informacoesJaExplicadas: [], acaoEsperada: "responder",
  proximoPassoPermitido: "responder a parte comprovada", acoesProibidas: [],
  protocolosAplicaveis: [], evidencias,
  obrigacoesResposta: [],
  informacoesFaltantes: [{
    id: "lacuna_1", descricao: "consequência depois da locação",
    temporalidade: "depois-de-evento", evento,
  }],
  nivelConfianca: "media", precisaIntervencaoHumana: false, podeResponderComSeguranca: true,
};
const fato = (
  evidenciaId: string,
  temporalidade: AfirmacaoAtendimento["temporalidade"],
  eventoAfirmado = "",
): AfirmacaoAtendimento => ({
  descricao: "afirmação factual", tipo: "fato", evidencias: [evidenciaId], lacunas: [],
  temporalidade, evento: eventoAfirmado,
});
const validar = (
  afirmacoes: AfirmacaoAtendimento[],
  decisao = decisaoBase,
  catalogo = fontes,
  protocolosUsados: string[] = [],
) => motivoBloqueioRascunhoDeterministico(
  "Resposta controlada.", protocolosUsados, afirmacoes, decisao, perfil, catalogo,
);

describe("evidência e temporalidade determinísticas", () => {
  it("mantém IDs estáveis e origem explícita no catálogo da execução", () => {
    const catalogo = catalogoFontesAtendimento({
      mensagemAtual: "Pergunta atual",
      mensagemAtualId: "wa:atual",
      contexto: { proprietario: "", estagio: "Em negociação", fatosImovel: ["vagas: 2"] },
      conversa: { anteriores: [{ id: "wa:antiga", autor: "corretor", texto: "Informação anterior" }] },
      informacoesComerciais: [{ titulo: "Protocolo", conteudo: "Regra oficial" }],
    });
    expect(catalogo.map(({ id, origem }) => ({ id, origem }))).toEqual([
      { id: "fonte_1", origem: "mensagem-recebida" },
      { id: "fonte_2", origem: "estado-operacional-atual" },
      { id: "fonte_3", origem: "dado-estruturado-imovel" },
      { id: "fonte_4", origem: "mensagem-enviada" },
      { id: "fonte_5", origem: "protocolo" },
    ]);
  });

  it.each([
    ["mesma temporalidade", fato("evidencia_2", "depois-de-evento", evento), null],
    ["pré-evento para pré-evento", fato("evidencia_1", "antes-de-evento", evento), null],
    ["pré-evento para pós-evento", fato("evidencia_1", "depois-de-evento", evento), "informacao-sem-fonte"],
    ["pós-evento com fonte", fato("evidencia_2", "depois-de-evento", evento), null],
    ["pós-evento sem fonte", fato("evidencia_99", "depois-de-evento", evento), "informacao-sem-fonte"],
    ["histórico qualificado", fato("evidencia_3", "historica"), null],
    ["temporalidade desconhecida preservada", fato("evidencia_5", "desconhecida"), null],
    ["temporalidade desconhecida não vira atual", fato("evidencia_5", "atual"), "informacao-sem-fonte"],
  ] as const)("%s", (_nome, afirmacao, esperado) => {
    expect(validar([afirmacao])).toBe(esperado);
  });

  it("permite fato atemporal em estado posterior quando o protocolo é declarado", () => {
    expect(validar(
      [fato("evidencia_4", "depois-de-evento", evento)],
      decisaoBase,
      fontes,
      ["Regra atemporal"],
    )).toBeNull();
  });

  it("permite negação de continuidade apoiada na lacuna pós-evento", () => {
    expect(validar([{
      descricao: "não há confirmação de continuidade depois da locação",
      tipo: "negacao-de-extrapolacao", evidencias: [], lacunas: ["lacuna_1"],
      temporalidade: "depois-de-evento", evento,
    }])).toBeNull();
  });

  it("permite resposta parcial com fato pré-evento e incerteza pós-evento", () => {
    expect(validar([
      fato("evidencia_1", "antes-de-evento", evento),
      {
        descricao: "a consequência posterior precisa ser confirmada",
        tipo: "incerteza", evidencias: [], lacunas: ["lacuna_1"],
        temporalidade: "depois-de-evento", evento,
      },
    ])).toBeNull();
  });

  it("aceita múltiplas evidências quando ao menos uma cobre o escopo declarado", () => {
    expect(validar(
      [{
        ...fato("evidencia_1", "antes-de-evento", evento),
        evidencias: ["evidencia_1", "evidencia_4"],
      }],
      decisaoBase,
      fontes,
      ["Regra atemporal"],
    )).toBeNull();
  });

  it("rejeita evidência inexistente e ID de evidência inválido em níveis distintos", () => {
    expect(validar([fato("evidencia_99", "atual")])).toBe("informacao-sem-fonte");
    expect(normalizarGeracaoAtendimento({
      mensagem: "Resposta.", protocolosUsados: [], obrigacoesCobertas: [], afirmacoes: [{
        ...fato("evidência-livre", "atual"),
      }],
    })).toBeNull();
    expect(normalizarDecisaoAtendimento({
      ...decisaoBase,
      evidencias: [{ ...evidencias[0], id: "evidencia_2" }],
    }, [], fontes)).toBeNull();
  });

  it("aprova histórico qualificado com evidência temporal compatível", () => {
    expect(validar([fato("evidencia_3", "historica")])).toBeNull();
  });

  it("rejeita histórico sem evidência e pós-evento apoiado apenas por pré-evento", () => {
    expect(validar([fato("evidencia_99", "historica")])).toBe("informacao-sem-fonte");
    expect(validar([fato("evidencia_1", "depois-de-evento", evento)])).toBe("informacao-sem-fonte");
  });

  it("rejeita omissão real de obrigação comprovada", () => {
    const decisaoComObrigacao = {
      ...decisaoBase,
      obrigacoesResposta: [{
        id: "obrigacao_1", evidenciaId: "evidencia_1", necessidade: "obrigatoria" as const,
      }],
    };
    expect(motivoBloqueioCoberturaDeterministico([], [], decisaoComObrigacao))
      .toBe("omissao-parte-comprovada");
  });

  it("não cria falsa omissão quando nenhuma evidência é obrigação relevante", () => {
    expect(motivoBloqueioCoberturaDeterministico([], [], decisaoBase)).toBeNull();
  });
});

const protocolosLd288 = [
  {
    id: "p-exclusividade", titulo: "Exclusividade", tipo: "informacao_comercial",
    arquivado: false,
    conteudo: "Não há exclusividade antes da locação. O proprietário pode anunciar por conta própria e trabalhar com outra imobiliária.",
  },
  {
    id: "p-custo", titulo: "Custo antes da locação", tipo: "informacao_comercial",
    arquivado: false, conteudo: "Não há custo antes da locação.",
  },
];
function bancoLd288(): SupabaseClient {
  const dados: Record<string, unknown> = {
    imoveis: {
      id: "LD-288", status: "Em negociação", endereco: "Rua controlada",
      notas: [{
        id: "wa:atual", direcao: "recebida", data: "2026-09-04T09:37:06",
        texto: "Resposta pelo WhatsApp: E se por acaso a outra Imobiliária conseguir alugar, como fica a situação? Tenho essa dúvida",
      }],
    },
    protocolos: protocolosLd288,
    user_config: null,
  };
  return {
    from(tabela: string) {
      if (!(tabela in dados)) throw new Error("Acesso fora da fotografia controlada");
      const resposta = { data: dados[tabela], error: null };
      const consulta = {
        select: () => consulta,
        eq: () => consulta,
        maybeSingle: async () => resposta,
        order: async () => resposta,
      };
      return consulta;
    },
  } as unknown as SupabaseClient;
}
const decisaoLd288: DecisaoAtendimento = {
  ...decisaoBase,
  protocolosAplicaveis: ["Exclusividade", "Custo antes da locação"],
  evidencias: [
    {
      id: "evidencia_1", fonteId: "fonte_4",
      fato: "antes da locação não há exclusividade e é possível trabalhar com outra imobiliária",
      temporalidade: "antes-de-evento", evento,
    },
    {
      id: "evidencia_2", fonteId: "fonte_5", fato: "não há custo antes da locação",
      temporalidade: "antes-de-evento", evento,
    },
  ],
  obrigacoesResposta: [
    { id: "obrigacao_1", evidenciaId: "evidencia_1", necessidade: "obrigatoria" },
    { id: "obrigacao_2", evidenciaId: "evidencia_2", necessidade: "obrigatoria" },
  ],
};
const afirmacaoPre = {
  descricao: "antes da locação é possível trabalhar com outra imobiliária sem exclusividade",
  tipo: "fato" as const, evidencias: ["evidencia_1"], lacunas: [],
  temporalidade: "antes-de-evento" as const, evento,
};
const afirmacaoLacuna = {
  descricao: "a consequência depois da locação precisa ser confirmada",
  tipo: "incerteza" as const, evidencias: [], lacunas: ["lacuna_1"],
  temporalidade: "depois-de-evento" as const, evento,
};
const afirmacaoCusto = {
  descricao: "não há custo antes da locação",
  tipo: "fato" as const, evidencias: ["evidencia_2"], lacunas: [],
  temporalidade: "antes-de-evento" as const, evento,
};
const parcialSegura = {
  mensagem: "Como não há exclusividade antes da locação, você pode trabalhar com outra imobiliária e não tem custo antes dela. Sobre como fica caso ela conclua a locação primeiro, preciso confirmar essa condição.",
  protocolosUsados: ["Exclusividade", "Custo antes da locação"],
  obrigacoesCobertas: ["obrigacao_1", "obrigacao_2"],
  afirmacoes: [afirmacaoPre, afirmacaoCusto, afirmacaoLacuna],
};
async function executarFluxo(saidas: unknown[]) {
  const executar = vi.fn<ExecutorOpenAI["executar"]>();
  for (const saida of saidas) {
    executar.mockResolvedValueOnce({ texto: JSON.stringify(saida), conclusao: {} as never });
  }
  const resposta = await atenderProprietario({
    tipo: "rascunhar-resposta",
    corpo: { imovelId: "LD-288" },
    supabase: bancoLd288(),
    userId: "tenant-controlado",
    executor: { executar },
  });
  return { resposta, corpo: await resposta.json(), executar };
}

beforeEach(() => vi.clearAllMocks());

describe("integração controlada LD-288", () => {
  it("aprova resposta cuja cadeia tipada já foi validada antes do auditor", async () => {
    const resultado = await executarFluxo([
      decisaoLd288,
      parcialSegura,
      { problemas: [] },
    ]);
    expect(resultado.resposta.status).toBe(200);
    expect(resultado.corpo).toMatchObject({ rascunho: parcialSegura.mensagem, fallbackAplicado: false });
    expect(resultado.executar).toHaveBeenCalledTimes(3);
  });

  it("preserva fatos e lacuna, rejeita evasiva no auditor e aceita a resposta parcial regenerada", async () => {
    const evasiva = {
      mensagem: "Vou confirmar esse ponto para você.",
      protocolosUsados: [],
      obrigacoesCobertas: [],
      afirmacoes: [afirmacaoLacuna],
    };
    const resultado = await executarFluxo([
      decisaoLd288,
      evasiva,
      parcialSegura,
      { problemas: [] },
    ]);
    expect(resultado.resposta.status).toBe(200);
    expect(resultado.corpo).toMatchObject({ rascunho: parcialSegura.mensagem, fallbackAplicado: true });
    expect(resultado.corpo.rascunho).not.toBe(evasiva.mensagem);
    expect(resultado.executar).toHaveBeenCalledTimes(4);
  });

  it("rejeita deterministicamente a extrapolação pós-locação antes do auditor", async () => {
    const extrapolacao = {
      mensagem: "Se ela alugar primeiro, não muda nada para você.",
      protocolosUsados: ["Exclusividade"],
      obrigacoesCobertas: ["obrigacao_1", "obrigacao_2"],
      afirmacoes: [{
        ...afirmacaoPre,
        descricao: "não muda nada depois da locação por terceiro",
        temporalidade: "depois-de-evento" as const,
      }],
    };
    const resultado = await executarFluxo([
      decisaoLd288,
      extrapolacao,
      parcialSegura,
      { problemas: [] },
    ]);
    expect(resultado.resposta.status).toBe(200);
    expect(resultado.corpo.rascunho).toBe(parcialSegura.mensagem);
    expect(resultado.executar.mock.calls.map(([pedido]) => pedido.tipo)).toEqual([
      "rascunhar-resposta-decisao",
      "rascunhar-resposta-geracao",
      "rascunhar-resposta-geracao-fallback",
      "rascunhar-resposta-validacao-fallback",
    ]);
  });

  it("não deixa a geração esconder a extrapolação com uma declaração temporal falsa", async () => {
    const texto = "Mesmo se a outra imobiliária alugar primeiro, você continua livre. Antes da locação não há custo.";
    const declaracaoFalsaDaGeracao = {
      mensagem: texto,
      protocolosUsados: ["Exclusividade", "Custo antes da locação"],
      obrigacoesCobertas: ["obrigacao_1", "obrigacao_2"],
      // A geração tenta rotular como pré-evento o que o texto diz sobre o pós-evento.
      afirmacoes: [afirmacaoPre, afirmacaoCusto],
    };
    const resultado = await executarFluxo([
      decisaoLd288,
      declaracaoFalsaDaGeracao,
      { problemas: ["afirmacao-nao-declarada"] },
      parcialSegura,
      { problemas: [] },
    ]);
    expect(resultado.resposta.status).toBe(200);
    expect(resultado.corpo.rascunho).toBe(parcialSegura.mensagem);
    expect(resultado.corpo.rascunho).not.toBe(texto);
    expect(resultado.executar).toHaveBeenCalledTimes(5);
  });

  it("aceita diretamente a resposta parcial segura e não cria chamada extra", async () => {
    const resultado = await executarFluxo([
      decisaoLd288,
      parcialSegura,
      { problemas: [] },
    ]);
    expect(resultado.resposta.status).toBe(200);
    expect(resultado.corpo).toMatchObject({ rascunho: parcialSegura.mensagem, fallbackAplicado: false });
    expect(resultado.executar).toHaveBeenCalledTimes(3);
  });
});
