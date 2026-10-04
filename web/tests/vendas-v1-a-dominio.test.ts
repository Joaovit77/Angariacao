import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  alterarImovelTratadoVenda, alterarValoresVenda, arquivarOportunidadeVenda,
  criarOportunidadeVenda, temImovelTratado, transicionarOportunidadeVenda,
  validarGanhoVenda, validarImovelTratadoVenda, validarOportunidadeVenda,
  validarOrigemComercialVenda, validarPerdaVenda, validarValoresVenda,
} from "../lib/vendas/dominio";
import { podeTransicionarVenda, TRANSICOES_VENDA } from "../lib/vendas/transicoes";
import {
  type CodigoErroVenda, type ContextoMudancaVenda, type EntradaCriacaoVenda,
  type EntradaGanhoVenda, type EntradaPerdaVenda, type EstadoVenda,
  type ImovelTratadoVenda, type OportunidadeVenda, type ResultadoMudancaVenda,
  type TransicaoVenda,
} from "../lib/vendas/tipos";

const INSTANTE = "2026-10-04T15:00:00.000Z";
const IMOVEL: ImovelTratadoVenda = { modo: "referencia", imovelId: "imovel-1" };
const MANUAL: ImovelTratadoVenda = {
  modo: "manual", endereco: "Rua de teste, 10", unidade: "101", bloco: "B",
};
const GANHO: EntradaGanhoVenda = {
  confirmacaoExplicita: true, dataFato: "2026-10-03",
  registroFormalizacao: "Contrato particular formalizado, conforme declaração do corretor.",
};
const PERDA: EntradaPerdaVenda = {
  motivo: "desistencia_interessado", dataFato: "2026-10-04",
};
function sucesso(resultado: ResultadoMudancaVenda) {
  expect(resultado.ok).toBe(true);
  if (!resultado.ok) throw new Error("Falha inesperada de domínio: " + resultado.codigo);
  return resultado;
}
function nova(entrada: Partial<EntradaCriacaoVenda> = {}) {
  return sucesso(criarOportunidadeVenda({
    id: "oportunidade-1", userId: "usuario-1", contatoId: "contato-1", ...entrada,
  }, INSTANTE)).oportunidade;
}
function contexto(oportunidade: OportunidadeVenda, extra: Partial<ContextoMudancaVenda> = {}): ContextoMudancaVenda {
  return { atorUsuarioId: oportunidade.userId, versaoEsperada: oportunidade.versao, registradoEm: INSTANTE, ...extra };
}
function atendimento(imovelTratado: ImovelTratadoVenda | null = IMOVEL) {
  const oportunidade = nova({ imovelTratado });
  return sucesso(transicionarOportunidadeVenda(oportunidade, { destino: "em_atendimento" }, contexto(oportunidade))).oportunidade;
}
function negociacao(imovelTratado: ImovelTratadoVenda = IMOVEL) {
  const oportunidade = atendimento(imovelTratado);
  return sucesso(transicionarOportunidadeVenda(oportunidade, { destino: "em_negociacao" }, contexto(oportunidade))).oportunidade;
}
function encerrada(estado: "ganha" | "perdida") {
  const oportunidade = negociacao();
  return sucesso(transicionarOportunidadeVenda(oportunidade,
    estado === "ganha" ? { destino: "ganha", ganho: GANHO } : { destino: "perdida", perda: PERDA },
    contexto(oportunidade))).oportunidade;
}
function esperarErro(resultado: { ok: boolean }, codigo: CodigoErroVenda) {
  expect(resultado).toEqual({ ok: false, codigo });
}
function congelar<T>(valor: T): T {
  if (valor && typeof valor === "object") {
    for (const parte of Object.values(valor)) congelar(parte);
    Object.freeze(valor);
  }
  return valor;
}

describe("identidade própria e cardinalidade comercial", () => {
  it("nasce Nova, sem imóvel, origem ou valores inventados, com identidade do chamador", () => {
    const resultado = sucesso(criarOportunidadeVenda({
      id: "id-fornecido", userId: "usuario-1", contatoId: "contato-1",
    }, INSTANTE));
    expect(resultado.oportunidade).toMatchObject({
      id: "id-fornecido", estado: "nova", versao: 1, contatoId: "contato-1",
      userId: "usuario-1", criadoPor: "usuario-1", responsavelUsuarioId: "usuario-1",
      encerramento: null, arquivadaEm: null, imovelTratado: null, origem: null,
      valores: { valorNegocioPrevisto: null, valorNegocioFechado: null, receitaPrevista: null },
    });
    expect(resultado.eventos).toHaveLength(1);
    expect(resultado.eventos[0]).toMatchObject({
      tipo: "oportunidade_criada", oportunidadeId: "id-fornecido",
      userId: "usuario-1", atorUsuarioId: "usuario-1", versao: 1, registradoEm: INSTANTE,
    });
  });
  it.each(["", "   ", undefined])("exige contato obrigatório (%s)", (contatoId) => {
    esperarErro(criarOportunidadeVenda({ id: "o", userId: "u", contatoId } as EntradaCriacaoVenda, INSTANTE), "contato-obrigatorio");
  });
  it.each(["id", "userId"] as const)("exige %s", (campo) => {
    esperarErro(criarOportunidadeVenda({ id: "o", userId: "u", contatoId: "c", [campo]: "" }, INSTANTE), "identidade-obrigatoria");
  });
  it("não impõe unicidade contato/imóvel e permite interessados distintos no mesmo imóvel", () => {
    const oportunidades = [
      nova({ id: "o-1", contatoId: "c-1", imovelTratado: IMOVEL }),
      nova({ id: "o-2", contatoId: "c-1", imovelTratado: IMOVEL }),
      nova({ id: "o-3", contatoId: "c-2", imovelTratado: IMOVEL }),
      nova({ id: "o-4", contatoId: "c-1", imovelTratado: { modo: "referencia", imovelId: "imovel-2" } }),
    ];
    expect(oportunidades.map((o) => o.id)).toEqual(["o-1", "o-2", "o-3", "o-4"]);
    expect(oportunidades.every((o) => validarOportunidadeVenda(o).ok)).toBe(true);
  });
  it("uma tentativa futura após perda é outra oportunidade, sem apagar a anterior", () => {
    const anterior = encerrada("perdida");
    const proxima = nova({ id: "nova-tentativa", imovelTratado: anterior.imovelTratado });
    expect(anterior.estado).toBe("perdida");
    expect(proxima).toMatchObject({ estado: "nova", contatoId: anterior.contatoId, versao: 1 });
    expect(proxima.id).not.toBe(anterior.id);
  });
});

describe("matriz comercial explícita", () => {
  const estados: EstadoVenda[] = ["nova", "em_atendimento", "em_negociacao", "ganha", "perdida"];
  const permitidas = [
    "nova>em_atendimento", "nova>perdida", "em_atendimento>em_negociacao",
    "em_atendimento>perdida", "em_negociacao>ganha", "em_negociacao>perdida",
  ];
  it.each(estados.flatMap((anterior) => estados.map((destino) => [anterior, destino] as const)))(
    "%s → %s respeita o contrato, inclusive retornos, saltos e terminais",
    (anterior, destino) => {
      const permitida = permitidas.includes(anterior + ">" + destino);
      expect(podeTransicionarVenda(anterior, destino)).toBe(permitida);
      const oportunidade = anterior === "nova" ? nova({ imovelTratado: IMOVEL })
        : anterior === "em_atendimento" ? atendimento()
        : anterior === "em_negociacao" ? negociacao() : encerrada(anterior);
      const transicao: TransicaoVenda = destino === "ganha" ? { destino, ganho: GANHO }
        : destino === "perdida" ? { destino, perda: PERDA } : { destino };
      const resultado = transicionarOportunidadeVenda(oportunidade, transicao, contexto(oportunidade));
      if (permitida) {
        const mudanca = sucesso(resultado);
        expect(mudanca.oportunidade.estado).toBe(destino);
        expect(mudanca.oportunidade.versao).toBe(oportunidade.versao + 1);
        expect(mudanca.eventos).toHaveLength(1);
      } else {
        esperarErro(resultado, anterior === "ganha" || anterior === "perdida" ? "oportunidade-encerrada" : "transicao-invalida");
      }
      expect(oportunidade.estado).toBe(anterior);
    },
  );
  it("estados desconhecidos não entram na matriz", () => {
    expect(podeTransicionarVenda("Novo contato", "Locado")).toBe(false);
    expect(podeTransicionarVenda("__proto__", "ganha")).toBe(false);
    expect(podeTransicionarVenda("nova", undefined)).toBe(false);
    expect(TRANSICOES_VENDA.ganha).toEqual([]);
    expect(TRANSICOES_VENDA.perdida).toEqual([]);
  });
  it("atendimento sem imóvel não entra em negociação", () => {
    const oportunidade = atendimento(null);
    esperarErro(transicionarOportunidadeVenda(oportunidade, { destino: "em_negociacao" }, contexto(oportunidade)), "imovel-obrigatorio");
    expect(oportunidade.estado).toBe("em_atendimento");
  });
  it("retorna código fechado para destino desconhecido", () => {
    const oportunidade = nova();
    esperarErro(transicionarOportunidadeVenda(oportunidade, { destino: "Locado" } as unknown as TransicaoVenda, contexto(oportunidade)), "estado-invalido");
  });
});

describe("imóvel tratado: uma autoridade explícita", () => {
  it.each([
    IMOVEL, MANUAL, { modo: "manual", referencia: "Referência comercial 42" },
    { modo: "manual", endereco: "Rua de teste, 10" },
  ])("aceita identificação suficiente (%j)", (imovel) => {
    expect(validarImovelTratadoVenda(imovel).ok).toBe(true);
    expect(temImovelTratado(imovel)).toBe(true);
  });
  it.each([
    undefined, {}, [], "imovel-1", { modo: "referencia", imovelId: "" },
    { modo: "manual", descricaoCurta: "Apartamento amplo" },
    { modo: "manual", unidade: "101", bloco: "B" },
    { modo: "manual", endereco: "   " },
    { modo: "manual", endereco: 10 },
    { modo: "manual", endereco: "Rua", imovelId: "imovel-1" },
    { modo: "referencia", imovelId: "imovel-1", endereco: "Rua" },
    { imovelId: "imovel-1", identificacaoManual: { endereco: "Rua" } },
  ])("recusa ambiguidade ou identificação insuficiente (%j)", (imovel) => {
    esperarErro(validarImovelTratadoVenda(imovel), "imovel-invalido");
    expect(temImovelTratado(imovel)).toBe(false);
  });
  it("nenhum imóvel é válido no início, mas não identifica o assunto", () => {
    expect(validarImovelTratadoVenda(null).ok).toBe(true);
    expect(temImovelTratado(null)).toBe(false);
  });
  it("permite substituir referência por identificação manual e registra anterior/atual", () => {
    const oportunidade = congelar(negociacao());
    const resultado = sucesso(alterarImovelTratadoVenda(oportunidade, MANUAL, contexto(oportunidade)));
    expect(resultado.oportunidade.imovelTratado).toMatchObject(MANUAL);
    expect(resultado.eventos[0]).toMatchObject({
      tipo: "imovel_alterado", dados: { anterior: IMOVEL, atual: MANUAL },
    });
    expect(oportunidade.imovelTratado).toEqual(IMOVEL);
  });
  it("não remove imóvel de uma negociação ativa", () => {
    const oportunidade = negociacao();
    esperarErro(alterarImovelTratadoVenda(oportunidade, null, contexto(oportunidade)), "imovel-obrigatorio");
  });
  it("identificação repetida não inventa evento ou versão", () => {
    const oportunidade = nova({ imovelTratado: MANUAL });
    const resultado = sucesso(alterarImovelTratadoVenda(oportunidade, { ...MANUAL, endereco: " Rua de teste, 10 " }, contexto(oportunidade)));
    expect(resultado.oportunidade).toEqual(oportunidade);
    expect(resultado.eventos).toEqual([]);
  });
});

describe("ganho manual, sem efeitos no imóvel ou financeiro", () => {
  it.each([
    ["confirmacaoExplicita", false, "confirmacao-obrigatoria"],
    ["confirmacaoExplicita", "true", "confirmacao-obrigatoria"],
    ["registroFormalizacao", "", "formalizacao-obrigatoria"],
    ["registroFormalizacao", "   ", "formalizacao-obrigatoria"],
    ["dataFato", "", "data-invalida"],
    ["dataFato", undefined, "data-invalida"],
    ["dataFato", "2026-02-30", "data-invalida"],
    ["dataFato", "2026-10-05", "data-invalida"],
  ] as const)("recusa %s = %s", (campo, valor, codigo) => {
    const oportunidade = negociacao();
    esperarErro(transicionarOportunidadeVenda(oportunidade, {
      destino: "ganha", ganho: { ...GANHO, [campo]: valor } as EntradaGanhoVenda,
    }, contexto(oportunidade)), codigo);
  });
  it("ganho exige identificação e formalização também ao validar retrato recuperado", () => {
    const oportunidade = encerrada("ganha");
    esperarErro(validarGanhoVenda(null, GANHO, INSTANTE), "imovel-obrigatorio");
    esperarErro(validarOportunidadeVenda({ ...oportunidade, imovelTratado: null }), "imovel-obrigatorio");
    esperarErro(validarOportunidadeVenda({ ...oportunidade, encerramento: null }), "encerramento-invalido");
  });
  it.each([undefined, null, 0, 500000])("valor fechado é opcional e preserva %s", (valorNegocioFechado) => {
    const oportunidade = congelar(negociacao(MANUAL));
    const resultado = sucesso(transicionarOportunidadeVenda(oportunidade, {
      destino: "ganha", ganho: { ...GANHO, valorNegocioFechado },
    }, contexto(oportunidade)));
    expect(resultado.oportunidade).toMatchObject({
      estado: "ganha", encerramento: { tipo: "ganho", dataFato: "2026-10-03", confirmacaoExplicita: true },
      valores: { valorNegocioFechado: valorNegocioFechado ?? null },
    });
    expect(resultado.eventos[0]).toMatchObject({ tipo: "oportunidade_ganha" });
    expect(resultado.oportunidade).not.toHaveProperty("comissaoRecebida");
    expect(resultado.oportunidade).not.toHaveProperty("status");
    expect(resultado.oportunidade).not.toHaveProperty("contratoNumero");
    expect(oportunidade.estado).toBe("em_negociacao");
  });
  it("não modifica um imóvel da carteira recebido como referência externa", () => {
    const imovelExterno = congelar({ id: "imovel-1", status: "Publicado", retirado: false, statusHistory: [] });
    const oportunidade = negociacao({ modo: "referencia", imovelId: imovelExterno.id });
    sucesso(transicionarOportunidadeVenda(oportunidade, { destino: "ganha", ganho: GANHO }, contexto(oportunidade)));
    expect(imovelExterno).toEqual({ id: "imovel-1", status: "Publicado", retirado: false, statusHistory: [] });
  });
});

describe("perda decidida, sem inferência por silêncio", () => {
  it.each([
    "desistencia_interessado", "condicoes_incompativeis", "imovel_indisponivel", "compra_outro_canal", "outro",
  ] as const)("registra motivo %s e sua data", (motivo) => {
    const oportunidade = congelar(nova());
    const resultado = sucesso(transicionarOportunidadeVenda(oportunidade, {
      destino: "perdida", perda: { dataFato: "2026-10-04", motivo, justificativa: motivo === "outro" ? "Motivo comercial informado." : undefined },
    }, contexto(oportunidade)));
    expect(resultado.oportunidade).toMatchObject({ estado: "perdida", encerramento: { tipo: "perda", motivo } });
    expect(resultado.eventos[0]).toMatchObject({ tipo: "oportunidade_perdida" });
  });
  it.each([undefined, "", "   "])("perda sem motivo falha (%s)", (motivo) => {
    esperarErro(validarPerdaVenda({ dataFato: "2026-10-04", motivo }, INSTANTE), "motivo-perda-obrigatorio");
  });
  it.each([undefined, null, "", "   "])("outro exige justificativa (%s)", (justificativa) => {
    esperarErro(validarPerdaVenda({ ...PERDA, motivo: "outro", justificativa }, INSTANTE), "justificativa-obrigatoria");
  });
  it("sem resposta não é motivo e tempo decorrido não encerra oportunidade", () => {
    esperarErro(validarPerdaVenda({ ...PERDA, motivo: "sem_resposta" }, INSTANTE), "motivo-perda-invalido");
    const oportunidade = nova();
    expect(validarOportunidadeVenda({ ...oportunidade, atualizadoEm: "2027-10-04T15:00:00.000Z" }).ok).toBe(true);
    expect(oportunidade.estado).toBe("nova");
  });
});

describe("valores separados, sem estimativas inventadas", () => {
  it.each([null, 0, 100])("preserva previsto e receita = %s", (valor) => {
    const oportunidade = nova({ valorNegocioPrevisto: valor, receitaPrevista: valor });
    expect(oportunidade.valores).toEqual({ valorNegocioPrevisto: valor, valorNegocioFechado: null, receitaPrevista: valor });
  });
  it.each([-1, NaN, Infinity, -Infinity, "100", false])("recusa valor inválido %s em todos os campos", (valor) => {
    for (const campo of ["valorNegocioPrevisto", "valorNegocioFechado", "receitaPrevista"]) {
      esperarErro(validarValoresVenda({
        valorNegocioPrevisto: null, valorNegocioFechado: null, receitaPrevista: null, [campo]: valor,
      }), "valor-invalido");
    }
  });
  it("retratos completos e edição não aceitam valor ausente como undefined", () => {
    esperarErro(validarValoresVenda({ valorNegocioPrevisto: undefined, valorNegocioFechado: null, receitaPrevista: null }), "valor-invalido");
    const oportunidade = nova();
    esperarErro(alterarValoresVenda(oportunidade, {} as never, contexto(oportunidade)), "valor-invalido");
  });
  it("altera valores sem converter desconhecido em zero e emite um fato", () => {
    const oportunidade = congelar(nova({ valorNegocioPrevisto: 500000, receitaPrevista: 20000 }));
    const resultado = sucesso(alterarValoresVenda(oportunidade, { valorNegocioPrevisto: null, receitaPrevista: 0 }, contexto(oportunidade)));
    expect(resultado.oportunidade.valores).toEqual({ valorNegocioPrevisto: null, valorNegocioFechado: null, receitaPrevista: 0 });
    expect(resultado.eventos[0]).toMatchObject({
      tipo: "valor_alterado",
      dados: { anterior: { valorNegocioPrevisto: 500000, receitaPrevista: 20000 }, atual: { valorNegocioPrevisto: null, receitaPrevista: 0 } },
    });
  });
  it("valor fechado só entra no ganho, nunca no cadastro ou edição aberta", () => {
    const oportunidade = nova();
    esperarErro(validarOportunidadeVenda({ ...oportunidade, valores: { ...oportunidade.valores, valorNegocioFechado: 0 } }), "valor-fechado-incompativel");
    esperarErro(alterarValoresVenda(oportunidade, { valorNegocioPrevisto: null, receitaPrevista: null, valorNegocioFechado: 0 } as never, contexto(oportunidade)), "valor-fechado-incompativel");
    esperarErro(criarOportunidadeVenda({ id: "o", contatoId: "c", userId: "u", valorNegocioFechado: 0 } as EntradaCriacaoVenda, INSTANTE), "valor-fechado-incompativel");
  });
  it("ganho preserva receita prevista sem gerar recebimento", () => {
    const inicio = nova({ imovelTratado: IMOVEL, receitaPrevista: 20000 });
    const contato = sucesso(transicionarOportunidadeVenda(inicio, { destino: "em_atendimento" }, contexto(inicio))).oportunidade;
    const negocio = sucesso(transicionarOportunidadeVenda(contato, { destino: "em_negociacao" }, contexto(contato))).oportunidade;
    const ganho = sucesso(transicionarOportunidadeVenda(negocio, { destino: "ganha", ganho: { ...GANHO, valorNegocioFechado: 450000 } }, contexto(negocio))).oportunidade;
    expect(ganho.valores).toEqual({ valorNegocioPrevisto: null, valorNegocioFechado: 450000, receitaPrevista: 20000 });
    expect(ganho).not.toHaveProperty("receitaRecebida");
  });
});

describe("origem comercial explícita", () => {
  it.each(["indicacao", "portal", "whatsapp", "telefone", "formulario", "atendimento_presencial", "outro"] as const)(
    "aceita origem %s declarada, sem derivação externa", (tipo) => {
      expect(nova({ origem: { tipo } }).origem).toEqual({ tipo, descricao: null });
    },
  );
  it("outro permite descrição, mas não a exige", () => {
    expect(nova({ origem: { tipo: "outro", descricao: "  Evento local  " } }).origem).toEqual({ tipo: "outro", descricao: "Evento local" });
  });
  it.each(["radar", { tipo: "sophia" }, { tipo: "portal", descricao: 42 }])("recusa origem fora do contrato (%j)", (origem) => {
    esperarErro(validarOrigemComercialVenda(origem), "origem-invalida");
  });
});

describe("responsabilidade, autoria, versões e fatos imutáveis", () => {
  it("não permite responsável/criador de outra conta no V1", () => {
    const oportunidade = nova();
    esperarErro(validarOportunidadeVenda({ ...oportunidade, criadoPor: "outro" }), "responsabilidade-invalida");
    esperarErro(validarOportunidadeVenda({ ...oportunidade, responsavelUsuarioId: "outro" }), "responsabilidade-invalida");
    esperarErro(transicionarOportunidadeVenda(oportunidade, { destino: "em_atendimento" }, contexto(oportunidade, { atorUsuarioId: "outro" })), "autoria-invalida");
  });
  it("mesma versão de origem não pode sobrescrever retrato avançado", () => {
    const oportunidade = nova();
    const avancada = sucesso(transicionarOportunidadeVenda(oportunidade, { destino: "em_atendimento" }, contexto(oportunidade))).oportunidade;
    esperarErro(alterarImovelTratadoVenda(avancada, IMOVEL, contexto(oportunidade)), "versao-conflitante");
    expect(avancada).toMatchObject({ versao: 2, criadoPor: oportunidade.criadoPor, userId: oportunidade.userId });
  });
  it.each([0, -1, 1.5, NaN, Number.MAX_SAFE_INTEGER + 1])("recusa versão inválida %s", (versao) => {
    esperarErro(validarOportunidadeVenda({ ...nova(), versao }), "versao-invalida");
  });
  it("não incrementa versão além do inteiro seguro", () => {
    const oportunidade = { ...nova(), versao: Number.MAX_SAFE_INTEGER };
    esperarErro(alterarImovelTratadoVenda(oportunidade, IMOVEL, contexto(oportunidade)), "versao-invalida");
  });
  it("emite estado e fato com a mesma versão, sem alterar input ou autoria", () => {
    const oportunidade = congelar(nova());
    const resultado = sucesso(transicionarOportunidadeVenda(oportunidade, { destino: "em_atendimento" }, contexto(oportunidade)));
    expect(resultado.eventos[0]).toMatchObject({
      tipo: "etapa_alterada", versao: resultado.oportunidade.versao,
      dados: { anterior: "nova", atual: "em_atendimento" }, atorUsuarioId: "usuario-1",
    });
    expect(oportunidade.versao).toBe(1);
    expect(resultado.oportunidade.criadoPor).toBe(oportunidade.criadoPor);
  });
  it("snapshot e evento não compartilham objetos mutáveis com entrada ou entre si", () => {
    const manual = { modo: "manual" as const, endereco: "Rua de teste, 10" };
    const resultado = sucesso(criarOportunidadeVenda({ id: "o", contatoId: "c", userId: "u", imovelTratado: manual }, INSTANTE));
    manual.endereco = "Endereço alterado fora do domínio";
    expect(resultado.oportunidade.imovelTratado).toMatchObject({ endereco: "Rua de teste, 10" });
    expect(resultado.eventos[0]).toMatchObject({ dados: { imovelTratado: { endereco: "Rua de teste, 10" } } });
    if (resultado.eventos[0].tipo === "oportunidade_criada") {
      expect(resultado.eventos[0].dados.imovelTratado).not.toBe(resultado.oportunidade.imovelTratado);
      expect(resultado.eventos[0].dados.valores).not.toBe(resultado.oportunidade.valores);
    }
  });
});

describe("datas injetadas e arquivamento sem apagar o negócio", () => {
  it.each(["2026-02-29", "2026-13-01", "2026-00-01", "2026-10-00", "04/10/2026", "2026-10-04T10:00:00Z"])(
    "recusa data civil inválida %s", (dataFato) => {
      esperarErro(validarGanhoVenda(IMOVEL, { ...GANHO, dataFato }, INSTANTE), "data-invalida");
    },
  );
  it("aceita dia bissexto real e fato anterior ao registro", () => {
    expect(validarGanhoVenda(IMOVEL, { ...GANHO, dataFato: "2024-02-29" }, INSTANTE).ok).toBe(true);
  });
  it("limite de data usa Brasília na virada do dia UTC", () => {
    esperarErro(validarGanhoVenda(IMOVEL, { ...GANHO, dataFato: "2026-10-04" }, "2026-10-04T02:00:00.000Z"), "data-invalida");
    expect(validarGanhoVenda(IMOVEL, GANHO, "2026-10-04T02:00:00.000Z").ok).toBe(true);
  });
  it.each(["2026-02-30T15:00:00.000Z", "2026-10-04", "2026-10-04T15:00:00Z", "inválido"])(
    "não aceita instante não canônico %s", (registradoEm) => {
      esperarErro(criarOportunidadeVenda({ id: "o", contatoId: "c", userId: "u" }, registradoEm), "data-invalida");
    },
  );
  it("mudança não pode ter registro anterior à última versão", () => {
    const oportunidade = nova();
    esperarErro(transicionarOportunidadeVenda(oportunidade, { destino: "em_atendimento" }, contexto(oportunidade, { registradoEm: "2026-10-03T15:00:00.000Z" })), "data-invalida");
  });
  it.each(["nova", "em_atendimento", "em_negociacao"] as const)("não arquiva %s para esconder uma oportunidade aberta", (estado) => {
    const oportunidade = estado === "nova" ? nova() : estado === "em_atendimento" ? atendimento() : negociacao();
    esperarErro(arquivarOportunidadeVenda(oportunidade, contexto(oportunidade)), "arquivamento-invalido");
  });
  it.each(["ganha", "perdida"] as const)("arquiva %s preservando encerramento e sem criar outra perda", (estado) => {
    const oportunidade = congelar(encerrada(estado));
    const resultado = sucesso(arquivarOportunidadeVenda(oportunidade, contexto(oportunidade)));
    expect(resultado.oportunidade.estado).toBe(estado);
    expect(resultado.oportunidade.encerramento).toEqual(oportunidade.encerramento);
    expect(resultado.oportunidade.arquivadaEm).toBe(INSTANTE);
    expect(resultado.eventos[0]).toMatchObject({ tipo: "oportunidade_arquivada", dados: { estado } });
    const repetida = sucesso(arquivarOportunidadeVenda(resultado.oportunidade, contexto(resultado.oportunidade)));
    expect(repetida.oportunidade).toEqual(resultado.oportunidade);
    expect(repetida.eventos).toEqual([]);
    esperarErro(alterarValoresVenda(resultado.oportunidade, { valorNegocioPrevisto: 1, receitaPrevista: 1 }, contexto(resultado.oportunidade)), "oportunidade-arquivada");
  });
  it.each(["ganha", "perdida"] as const)("não edita imóvel/valores após %s", (estado) => {
    const oportunidade = encerrada(estado);
    esperarErro(alterarImovelTratadoVenda(oportunidade, MANUAL, contexto(oportunidade)), "oportunidade-encerrada");
    esperarErro(alterarValoresVenda(oportunidade, { valorNegocioPrevisto: 0, receitaPrevista: 0 }, contexto(oportunidade)), "oportunidade-encerrada");
  });
});

describe("regressão: calendário civil independente do fuso local", () => {
  const casos = [
    ["2011-12-30", true], ["1994-12-31", true],
    ["2026-01-01", true], ["2026-02-28", true], ["2024-02-29", true],
    ["2026-12-31", true], ["2000-02-29", true], ["0100-01-01", true],
    ["0099-12-31", false], ["2026-02-29", false], ["2025-02-29", false],
    ["2100-02-29", false], ["2026-04-31", false], ["2026-13-01", false],
    ["2026-00-10", false], ["2026-01-00", false], ["2026-1-01", false],
    ["2026-01-1", false], ["2026-01-01T00:00:00.000Z", false],
    [" 2026-01-01", false], ["2026-01-01\n", false], ["texto", false], ["", false],
    ["2026-01-01", false, "2026-01-01T02:59:59.999Z"],
    ["2025-12-31", true, "2026-01-01T02:59:59.999Z"],
    ["2026-01-01", true, "2026-01-01T03:00:00.000Z"],
    ["2027-01-01", false, "2027-01-01T02:59:59.999Z"],
    ["2026-12-31", true, "2027-01-01T02:59:59.999Z"],
    ["2027-01-01", true, "2027-01-01T03:00:00.000Z"],
  ] as const;
  it.each([
    "UTC", "America/Sao_Paulo", "America/Los_Angeles", "Pacific/Kiritimati", "Pacific/Apia",
  ])("preserva validade e datas de ganho/perda em %s", (fuso) => {
    // TZ é definido ao iniciar cada processo, sem mudar o fuso do worker.
    // Carrega os arquivos reais; as expectativas acima não repetem a regra de calendário.
    const programa = `
      const fs = require("node:fs"), ts = require("typescript");
      require.extensions[".ts"] = (modulo, arquivo) => modulo._compile(
        ts.transpileModule(fs.readFileSync(arquivo, "utf8"), {
          compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS }
        }).outputText, arquivo);
      const d = require("./lib/vendas/dominio.ts");
      const imovel = { modo: "referencia", imovelId: "imovel-sintetico" };
      function retrato(r) {
        if (!r.ok) throw new Error("Falha inesperada: " + r.codigo);
        return r.oportunidade;
      }
      const resultados = ${JSON.stringify(casos)}.map(([dataFato, aceita, registradoEm = "2101-01-02T15:00:00.000Z"]) => {
        const ganho = { confirmacaoExplicita: true, dataFato, registroFormalizacao: "Declaracao sintetica" };
        const perda = { dataFato, motivo: "desistencia_interessado" };
        const validacoes = [d.validarGanhoVenda(imovel, ganho, registradoEm), d.validarPerdaVenda(perda, registradoEm)];
        const encerramentos = [];
        if (aceita) {
          const contexto = o => ({ atorUsuarioId: o.userId, versaoEsperada: o.versao, registradoEm });
          let o = retrato(d.criarOportunidadeVenda({
            id: "o-sintetica", contatoId: "c-sintetico", userId: "u-sintetico", imovelTratado: imovel
          }, registradoEm));
          o = retrato(d.transicionarOportunidadeVenda(o, { destino: "em_atendimento" }, contexto(o)));
          o = retrato(d.transicionarOportunidadeVenda(o, { destino: "em_negociacao" }, contexto(o)));
          for (const transicao of [{ destino: "ganha", ganho }, { destino: "perdida", perda }]) {
            const r = d.transicionarOportunidadeVenda(o, transicao, contexto(o));
            const terminal = retrato(r);
            const arquivada = retrato(d.arquivarOportunidadeVenda(terminal, contexto(terminal)));
            encerramentos.push({
              dataRetrato: terminal.encerramento.dataFato, dataEvento: r.eventos[0].dados.encerramento.dataFato,
              dataArquivada: arquivada.encerramento.dataFato, validacao: d.validarOportunidadeVenda(arquivada)
            });
          }
        }
        return { dataFato, validacoes, encerramentos };
      });
      console.log(JSON.stringify({ fuso: Intl.DateTimeFormat().resolvedOptions().timeZone, resultados }));
    `;
    const processo = spawnSync(process.execPath, ["-e", programa], {
      cwd: fileURLToPath(new URL("../", import.meta.url)),
      env: { ...process.env, TZ: fuso, ALLOW_REAL_OPENAI: "0" },
      encoding: "utf8",
    });
    expect(processo.error).toBeUndefined();
    expect(processo.stderr).toBe("");
    expect(processo.status).toBe(0);
    const resposta = JSON.parse(processo.stdout);
    expect(resposta.fuso).toBe(fuso);
    expect(resposta.resultados).toEqual(casos.map(([dataFato, aceita]) => {
      const validacao = aceita ? { ok: true } : { ok: false, codigo: "data-invalida" };
      const encerramento = {
        dataRetrato: dataFato, dataEvento: dataFato, dataArquivada: dataFato, validacao: { ok: true },
      };
      return { dataFato, validacoes: [validacao, validacao], encerramentos: aceita ? [encerramento, encerramento] : [] };
    }));
  });
});
