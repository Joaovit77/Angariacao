import { describe, expect, it } from "vitest";
import {
  catalogoFontesAtendimento,
  motivoBloqueioAfirmacoesDeterministico,
  motivoBloqueioCoberturaDeterministico,
  motivoBloqueioRascunhoDeterministico,
} from "@/lib/ia/atendimento";
import { normalizarPerfilComunicacao } from "@/lib/perfilComunicacao";
import { casosSemanticos, contextoSemantico } from "./fixtures/atendimento-semantico";

const caso = (nome: string) => {
  const encontrado = casosSemanticos.find((item) => item.nome === nome);
  if (!encontrado) throw new Error(`Fixture ausente: ${nome}`);
  return encontrado;
};

describe("oito casos conhecidos da primeira matriz", () => {
  it.each([
    [1, "resposta parcial útil"],
    [2, "resposta parcial útil"],
  ])("afirmações concretas da resposta parcial estão declaradas — repetição %i", (_repeticao, nome) => {
    const geracao = caso(nome).geracao;
    expect(geracao.afirmacoes.map((afirmacao) => afirmacao.descricao)).toEqual([
      "antes da locação é permitido anunciar com outras imobiliárias sem exclusividade",
      "não há custo antes da locação",
      "a consequência depois da locação precisa ser confirmada",
    ]);
  });

  it.each([
    [1, "histórico qualificado"],
    [2, "histórico qualificado"],
  ])("histórico não introduz incerteza ausente do contrato — repetição %i", (_repeticao, nome) => {
    const geracao = caso(nome).geracao;
    expect(geracao.mensagem).toBe(
      "Na mensagem anterior, você informou que o imóvel estava em reforma. Vou confirmar a situação atual.",
    );
    expect(geracao.afirmacoes.map((afirmacao) => afirmacao.descricao)).toEqual([
      "a última informação era de reforma",
      "a situação atual precisa ser confirmada",
    ]);
  });

  it.each([1, 2])(
    "grounding por protocolo prevalece explicitamente sobre cobertura — repetição %i",
    () => {
      const atual = caso("referência anterior: confirmação total");
      const contexto = atual.contexto ?? contextoSemantico;
      const catalogo = catalogoFontesAtendimento({
        mensagemAtual: atual.pergunta,
        mensagemAtualId: null,
        contexto,
        conversa: atual.historico,
        informacoesComerciais: atual.fontes,
      });
      expect(motivoBloqueioAfirmacoesDeterministico(
        atual.geracao.protocolosUsados, atual.geracao.afirmacoes, atual.decisao, catalogo,
      )).toBe("protocolo-inadequado");
      expect(motivoBloqueioCoberturaDeterministico(
        atual.geracao.obrigacoesCobertas, atual.geracao.afirmacoes, atual.decisao,
      )).toBe("omissao-parte-comprovada");
      expect(motivoBloqueioRascunhoDeterministico(
        atual.geracao.mensagem,
        atual.geracao.protocolosUsados,
        atual.geracao.afirmacoes,
        atual.decisao,
        normalizarPerfilComunicacao(null),
        catalogo,
        atual.geracao.obrigacoesCobertas,
      )).toBe("protocolo-inadequado");
    },
  );

  it.each([1, 2])("obrigações da regra comercial ficam isoladas — repetição %i", () => {
    const regraAtual = caso("regra comercial atual").decisao;
    const parcial = caso("resposta parcial útil").decisao;
    expect(regraAtual.obrigacoesResposta).toEqual([
      { id: "obrigacao_1", evidenciaId: "evidencia_1", necessidade: "obrigatoria" },
    ]);
    expect(regraAtual.obrigacoesResposta).not.toBe(parcial.obrigacoesResposta);
    const idsEvidencias = new Set(regraAtual.evidencias.map((evidencia) => evidencia.id));
    expect(regraAtual.obrigacoesResposta.every((obrigacao) => idsEvidencias.has(obrigacao.evidenciaId)))
      .toBe(true);
  });
});
