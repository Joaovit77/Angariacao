/* Evidência temporal de disponibilidade (lib/calculo/evidenciaDisponibilidade).
   Fixa o que CONTA como fato estruturado de disponibilidade/indisponibilidade,
   o instante de cada fato e a regra temporal. Os casos reais auditados no
   plano (LD-163, LD-157, LD-181, LD-50) entram aqui para provar que a função
   não inventa certeza onde o app não gravou fato nenhum. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  type AgendaItemComCriacao,
  avaliarEvidenciaTemporalDisponibilidade,
  compararInstantes,
  evidenciasDisponibilidadeDoImovel,
  MOTIVO_AGENDA_PRAZO_IA,
  MOTIVO_AGENDA_VISITA_CONFIRMADA,
  precisaoDoDatetimeCivil,
} from "@/lib/calculo/evidenciaDisponibilidade";
import type { AgendaItem, Imovel, Tentativa } from "@/lib/tipos";

function imovel(extra: Partial<Imovel> = {}): Imovel {
  return {
    id: "im-1",
    codigo: "LD-1",
    endereco: "Rua A, 1",
    status: "Publicado",
    statusHistory: [
      { status: "Novo contato", date: "2026-07-01" },
      { status: "Angariado", date: "2026-07-02" },
      { status: "Publicado", date: "2026-07-05" },
    ],
    tentativas: [],
    notas: [],
    ...extra,
  };
}

function tentativa(extra: Partial<Tentativa> & Pick<Tentativa, "id" | "data" | "resultado">): Tentativa {
  return { canal: "WhatsApp", ...extra };
}

function visita(extra: Partial<AgendaItemComCriacao> & Pick<AgendaItem, "id">): AgendaItemComCriacao {
  return {
    title: "Visita — LD-1",
    type: "Visita",
    date: "2026-07-22",
    hora: "10:00",
    imovelId: "im-1",
    done: false,
    isVerificacaoDisponibilidade: false,
    origem: "evento_whatsapp",
    motivoCodigo: MOTIVO_AGENDA_VISITA_CONFIRMADA,
    criadoEm: "2026-07-20T13:15:00+00:00", // 10:15 em São Paulo
    ...extra,
  };
}

describe("evidências positivas aceitas", () => {
  it("1. tentativa com resultado 'agendou' é evidência positiva no instante do contato", () => {
    const im = imovel({ tentativas: [tentativa({ id: "t1", data: "2026-07-20T09:30", resultado: "agendou" })] });
    const [ev] = evidenciasDisponibilidadeDoImovel(im);
    expect(ev).toMatchObject({
      sinal: "disponivel",
      codigo: "tentativa-agendou",
      ocorridoEm: "2026-07-20T09:30",
      precisao: "minuto",
      fonte: "tentativa",
      origem: "usuario",
      referenciaId: "t1",
      imovelId: "im-1",
    });
    expect(avaliarEvidenciaTemporalDisponibilidade(im).estado).toBe("disponivel");
    expect(avaliarEvidenciaTemporalDisponibilidade(im).dataEvidenciaPositiva).toBe("2026-07-20T09:30");
  });

  it("2. visita confirmada pelo proprietário (código determinístico) é evidência positiva no instante do registro, não no dia da visita", () => {
    const ev = evidenciasDisponibilidadeDoImovel(imovel(), [visita({ id: "ag-1" })]);
    expect(ev).toHaveLength(1);
    expect(ev[0]).toMatchObject({
      sinal: "disponivel",
      codigo: MOTIVO_AGENDA_VISITA_CONFIRMADA,
      ocorridoEm: "2026-07-20T10:15:00",
      precisao: "instante",
      fonte: "agenda",
      origem: "evento_whatsapp",
      referenciaId: "ag-1",
    });
    expect(ev[0].ocorridoEm?.startsWith("2026-07-22")).toBe(false);
  });

  it("3. lembrete 'Verificar disponibilidade' concluído NÃO é evidência: o modelo atual não guarda resultado positivo estruturado (done vem também do envio do lote)", () => {
    const lembrete: AgendaItemComCriacao = {
      id: "lem-1", title: "Verificar disponibilidade — LD-1", type: "Follow-up", date: "2026-08-01",
      imovelId: "im-1", done: true, isVerificacaoDisponibilidade: true, concluidoEm: "2026-08-01T12:00:00+00:00",
      origem: "usuario", criadoEm: "2026-06-01T12:00:00+00:00",
    };
    expect(evidenciasDisponibilidadeDoImovel(imovel(), [lembrete])).toEqual([]);
    expect(avaliarEvidenciaTemporalDisponibilidade(imovel(), [lembrete]).estado).toBe("sem-evidencia");
  });
});

describe("o que não é evidência positiva", () => {
  it("4. no-show: visita confirmada e não realizada continua valendo pela COMBINAÇÃO; concluir ou não o compromisso não muda nada", () => {
    const combinada = visita({ id: "ag-1", done: false });
    const semComparecimento = visita({ id: "ag-1", done: true, concluidoEm: "2026-07-22T15:00:00+00:00" });
    const a = avaliarEvidenciaTemporalDisponibilidade(imovel(), [combinada]);
    const b = avaliarEvidenciaTemporalDisponibilidade(imovel(), [semComparecimento]);
    expect(a.estado).toBe("disponivel");
    expect(b.estado).toBe("disponivel");
    // A data de referência é a do registro da combinação nos dois casos, e
    // nunca a data da visita nem a da conclusão.
    expect(a.dataEvidenciaPositiva).toBe("2026-07-20T10:15:00");
    expect(b.dataEvidenciaPositiva).toBe("2026-07-20T10:15:00");
  });

  it("5. visita criada à mão (origem usuário) não é evidência", () => {
    const manual = visita({ id: "ag-2", origem: "usuario", motivoCodigo: undefined, title: "Visita no imóvel para gravar vídeo" });
    expect(evidenciasDisponibilidadeDoImovel(imovel(), [manual])).toEqual([]);
  });

  it("6. visita classificada somente pela IA (prazo_combinado_na_resposta) não é evidência", () => {
    const porIa = visita({ id: "ag-3", motivoCodigo: MOTIVO_AGENDA_PRAZO_IA });
    expect(evidenciasDisponibilidadeDoImovel(imovel(), [porIa])).toEqual([]);
    expect(avaliarEvidenciaTemporalDisponibilidade(imovel(), [porIa]).estado).toBe("sem-evidencia");
  });

  it("6b. o código determinístico só vale com origem evento_whatsapp e tipo Visita", () => {
    const origemErrada = visita({ id: "ag-4", origem: "assistente" });
    const tipoErrado = visita({ id: "ag-5", type: "Retorno ao proprietário" });
    expect(evidenciasDisponibilidadeDoImovel(imovel(), [origemErrada, tipoErrado])).toEqual([]);
  });

  it("6c. visita confirmada sem `criadoEm` não vira evidência: sem instante do registro, não se inventa data", () => {
    const semCriacao = visita({ id: "ag-6", criadoEm: undefined });
    const criacaoInvalida = visita({ id: "ag-7", criadoEm: "ontem" });
    expect(evidenciasDisponibilidadeDoImovel(imovel(), [semCriacao, criacaoInvalida])).toEqual([]);
  });

  it("7. tentativa que apenas registrou envio/resposta não é evidência (nem a sugestão da IA de 'agendou')", () => {
    const im = imovel({
      tentativas: [
        tentativa({ id: "t1", data: "2026-07-20T09:30", resultado: "sem-resposta", aguardandoResultado: true,
          sugestaoIa: { resultado: "agendou", resumo: "quer visitar" } }),
        tentativa({ id: "t2", data: "2026-07-21T09:30", resultado: "respondeu" }),
        tentativa({ id: "t3", data: "2026-07-22T09:30", resultado: "vai-retornar" }),
        tentativa({ id: "t4", data: "2026-07-23T09:30", resultado: "agendou", aguardandoResultado: true }),
      ],
    });
    expect(evidenciasDisponibilidadeDoImovel(im)).toEqual([]);
  });

  it("8. ausência de negativa não é positiva: imóvel publicado sem fato nenhum fica sem evidência", () => {
    const avaliacao = avaliarEvidenciaTemporalDisponibilidade(imovel());
    expect(avaliacao.estado).toBe("sem-evidencia");
    expect(avaliacao.positivaMaisRecente).toBeNull();
    expect(avaliacao.negativaMaisRecente).toBeNull();
    expect(avaliacao.dataEvidenciaPositiva).toBeNull();
  });

  it("8b. resposta do proprietário em texto livre ('Pode ser às 13:00? Combinado') sem registro estruturado não vira evidência (caso LD-157)", () => {
    const ld157 = imovel({
      codigo: "LD-157",
      notas: [
        { id: "wa:1", texto: "Resposta pelo WhatsApp: Pode ser às 13:00 ?", data: "2026-08-19T09:29", autor: "proprietario" },
        { id: "wa:2", texto: "Resposta pelo WhatsApp: Combinado", data: "2026-08-19T09:39", autor: "proprietario" },
      ],
    });
    expect(avaliarEvidenciaTemporalDisponibilidade(ld157).estado).toBe("sem-evidencia");
  });

  it("8c. retorno ao proprietário criado à mão (caso LD-181) não é evidência", () => {
    const retorno: AgendaItemComCriacao = {
      id: "ret", title: "Retorno — LD-181", type: "Retorno ao proprietário", date: "2026-08-21",
      imovelId: "im-1", done: true, isVerificacaoDisponibilidade: false, origem: "usuario",
      notes: "A chave não está com ele, mas vai tentar pegar amanhã.", criadoEm: "2026-08-20T20:32:00+00:00",
    };
    expect(avaliarEvidenciaTemporalDisponibilidade(imovel({ codigo: "LD-181" }), [retorno]).estado).toBe("sem-evidencia");
  });
});

describe("evidências negativas", () => {
  it("9. Perdido por 'locado por outra imobiliária' é evidência negativa datada pela transição (caso LD-163)", () => {
    const ld163 = imovel({
      codigo: "LD-163",
      status: "Perdido",
      motivoPerda: "Angariado, mas locado por outra imobiliária ou pelo proprietário",
      statusHistory: [
        { status: "Novo contato", date: "2026-07-27" },
        { status: "Perdido", date: "2026-07-27" },
        { status: "Em negociação", date: "2026-07-28" },
        { status: "Angariado", date: "2026-07-28" },
        { status: "Publicado", date: "2026-08-10" },
        { status: "Perdido", date: "2026-08-12", source: "usuario", userId: "u1" },
      ],
    });
    const avaliacao = avaliarEvidenciaTemporalDisponibilidade(ld163);
    expect(avaliacao.estado).toBe("indisponivel");
    expect(avaliacao.negativaMaisRecente).toMatchObject({
      codigo: "status-perdido",
      ocorridoEm: "2026-08-12", // a ÚLTIMA entrada em Perdido, não a de 27/07
      precisao: "dia",
      origem: "usuario",
      referenciaId: "im-1",
    });
    expect(avaliacao.negativaMaisRecente?.fato).toContain("locado por outra imobiliária");
  });

  it("10. Locado é evidência negativa; a data vem de locadoEm (fato) antes do histórico (quando o painel soube)", () => {
    const im = imovel({
      status: "Locado",
      locadoEm: "2026-08-01",
      statusHistory: [{ status: "Angariado", date: "2026-07-02" }, { status: "Locado", date: "2026-08-04", source: "sophia" }],
    });
    expect(avaliarEvidenciaTemporalDisponibilidade(im).negativaMaisRecente).toMatchObject({
      codigo: "status-locado", ocorridoEm: "2026-08-01", precisao: "dia", origem: "sophia",
    });
  });

  it("11. retirado e Cancelado são negativas; retirado não tem data e é fato presente", () => {
    const retirado = avaliarEvidenciaTemporalDisponibilidade(imovel({ retirado: true }));
    expect(retirado.estado).toBe("indisponivel");
    expect(retirado.negativaMaisRecente).toMatchObject({ codigo: "retirado", ocorridoEm: null, precisao: "desconhecida" });

    const cancelado = avaliarEvidenciaTemporalDisponibilidade(imovel({
      status: "Cancelado",
      statusHistory: [{ status: "Angariado", date: "2026-07-02" }, { status: "Cancelado", date: "2026-08-03" }],
    }));
    expect(cancelado.negativaMaisRecente).toMatchObject({ codigo: "status-cancelado", ocorridoEm: "2026-08-03" });
  });

  it("11b. passagem antiga por Perdido depois reaberta não é fato vigente (caso LD-50); 'Sem resposta' não afirma nada sobre o imóvel", () => {
    const ld50 = imovel({
      codigo: "LD-50",
      statusHistory: [
        { status: "Novo contato", date: "2026-07-13" },
        { status: "Perdido", date: "2026-07-20" },
        { status: "Em negociação", date: "2026-07-31" },
        { status: "Angariado", date: "2026-07-31" },
        { status: "Publicado", date: "2026-08-10" },
      ],
    });
    expect(avaliarEvidenciaTemporalDisponibilidade(ld50).estado).toBe("sem-evidencia");
    expect(avaliarEvidenciaTemporalDisponibilidade(imovel({ status: "Sem resposta" })).estado).toBe("sem-evidencia");
  });
});

describe("temporalidade", () => {
  const positivaAntiga = tentativa({ id: "t-jul", data: "2026-07-01T10:00", resultado: "agendou" });

  it("12. positiva antiga + negativa nova: estado factual é indisponível", () => {
    const im = imovel({
      status: "Perdido",
      tentativas: [positivaAntiga],
      statusHistory: [{ status: "Angariado", date: "2026-06-01" }, { status: "Perdido", date: "2026-07-15" }],
    });
    const avaliacao = avaliarEvidenciaTemporalDisponibilidade(im);
    expect(avaliacao.estado).toBe("indisponivel");
    expect(avaliacao.positivaMaisRecente?.referenciaId).toBe("t-jul");
    expect(avaliacao.dataEvidenciaPositiva).toBeNull();
  });

  it("13. negativa antiga + positiva nova válida: estado factual é disponível", () => {
    const im = imovel({
      status: "Perdido",
      statusHistory: [{ status: "Angariado", date: "2026-06-01" }, { status: "Perdido", date: "2026-07-01" }],
      tentativas: [tentativa({ id: "t-nova", data: "2026-07-20T10:00", resultado: "agendou" })],
    });
    const avaliacao = avaliarEvidenciaTemporalDisponibilidade(im);
    expect(avaliacao.estado).toBe("disponivel");
    expect(avaliacao.dataEvidenciaPositiva).toBe("2026-07-20T10:00");
    expect(avaliacao.negativaMaisRecente?.ocorridoEm).toBe("2026-07-01");
  });

  it("14. múltiplas positivas: devolve a mais recente, comparando fontes diferentes no mesmo eixo", () => {
    const im = imovel({ tentativas: [positivaAntiga, tentativa({ id: "t-ago", data: "2026-08-02T08:00", resultado: "agendou" })] });
    const avaliacao = avaliarEvidenciaTemporalDisponibilidade(im, [visita({ id: "ag-1", criadoEm: "2026-07-25T12:00:00+00:00" })]);
    expect(avaliacao.positivaMaisRecente?.referenciaId).toBe("t-ago");
    expect(avaliacao.evidencias.map((e) => e.referenciaId)).toEqual(["t-jul", "ag-1", "t-ago"]);
  });

  it("15. múltiplas negativas: devolve a mais recente (retirado, sem data, é o presente)", () => {
    const im = imovel({
      status: "Perdido",
      retirado: true,
      statusHistory: [{ status: "Angariado", date: "2026-06-01" }, { status: "Perdido", date: "2026-07-15" }],
    });
    const avaliacao = avaliarEvidenciaTemporalDisponibilidade(im);
    expect(avaliacao.negativaMaisRecente?.codigo).toBe("retirado");
    expect(avaliacao.evidencias.map((e) => e.codigo)).toEqual(["status-perdido", "retirado"]);
  });

  it("15b. negativa presente sem data vence positiva datada, porque é observada agora", () => {
    const im = imovel({ status: "Locado", statusHistory: [], tentativas: [tentativa({ id: "t", data: "2026-07-20T10:00", resultado: "agendou" })] });
    const avaliacao = avaliarEvidenciaTemporalDisponibilidade(im);
    expect(avaliacao.negativaMaisRecente).toMatchObject({ codigo: "status-locado", ocorridoEm: null, precisao: "desconhecida" });
    expect(avaliacao.estado).toBe("indisponivel");
  });

  it("16. nenhum fato confiável: sem evidência, sem data E", () => {
    const avaliacao = avaliarEvidenciaTemporalDisponibilidade(imovel({ tentativas: [tentativa({ id: "t", data: "sem-data", resultado: "agendou" })] }));
    expect(avaliacao.estado).toBe("sem-evidencia");
    expect(avaliacao.evidencias).toEqual([]);
  });

  it("17. empate na precisão comum entre sinais opostos é 'conflitante', nunca desempate silencioso", () => {
    // Perdido em 20/07 (só dia) e visita confirmada em 20/07 10:15: na
    // precisão comum (dia) os dois são iguais.
    const im = imovel({
      status: "Perdido",
      statusHistory: [{ status: "Angariado", date: "2026-06-01" }, { status: "Perdido", date: "2026-07-20" }],
    });
    const avaliacao = avaliarEvidenciaTemporalDisponibilidade(im, [visita({ id: "ag-1" })]);
    expect(avaliacao.estado).toBe("conflitante");
    expect(avaliacao.dataEvidenciaPositiva).toBeNull();
    expect(avaliacao.positivaMaisRecente?.referenciaId).toBe("ag-1");
    expect(avaliacao.negativaMaisRecente?.codigo).toBe("status-perdido");
  });

  it("17b. empate entre positivas no mesmo instante: ordem determinística por precisão e depois por id", () => {
    const im = imovel({ tentativas: [
      tentativa({ id: "t-b", data: "2026-07-20T10:15", resultado: "agendou" }),
      tentativa({ id: "t-a", data: "2026-07-20T10:15", resultado: "agendou" }),
    ] });
    const avaliacao = avaliarEvidenciaTemporalDisponibilidade(im, [visita({ id: "ag-1" })]); // 10:15:00, precisão instante
    expect(avaliacao.evidencias.map((e) => e.referenciaId)).toEqual(["t-a", "t-b", "ag-1"]);
    expect(avaliacao.positivaMaisRecente?.referenciaId).toBe("ag-1");
  });

  it("compararInstantes e precisaoDoDatetimeCivil", () => {
    expect(precisaoDoDatetimeCivil("2026-07-20")).toBe("dia");
    expect(precisaoDoDatetimeCivil("2026-07-20T10:15")).toBe("minuto");
    expect(precisaoDoDatetimeCivil("2026-07-20T10:15:30")).toBe("instante");
    expect(precisaoDoDatetimeCivil("20/07/2026")).toBe("desconhecida");
    expect(compararInstantes({ ocorridoEm: "2026-07-20", precisao: "dia" }, { ocorridoEm: "2026-07-20T23:59", precisao: "minuto" })).toBe(0);
    expect(compararInstantes({ ocorridoEm: "2026-07-21", precisao: "dia" }, { ocorridoEm: "2026-07-20T23:59", precisao: "minuto" })).toBe(1);
    expect(compararInstantes({ ocorridoEm: null, precisao: "desconhecida" }, { ocorridoEm: "2026-07-20", precisao: "dia" })).toBeNull();
  });
});

describe("isolamento", () => {
  it("18. evidência de outro imóvel (mesmo proprietário ou outra conta) nunca entra no cálculo", () => {
    const outra = visita({ id: "ag-outro", imovelId: "im-2" });
    const avaliacao = avaliarEvidenciaTemporalDisponibilidade(imovel(), [outra]);
    expect(avaliacao.estado).toBe("sem-evidencia");
    expect(avaliacao.evidencias).toEqual([]);
  });

  it("o código determinístico da função é o mesmo que o webhook grava", () => {
    const rota = readFileSync(
      join(process.cwd(), "app", "api", "whatsapp", "webhook", "[[...segredo]]", "route.ts"),
      "utf8",
    );
    expect(rota).toContain(`"${MOTIVO_AGENDA_VISITA_CONFIRMADA}"`);
    expect(rota).toContain(`"${MOTIVO_AGENDA_PRAZO_IA}"`);
  });
});
