/* Fixtures do B3.4a: linhas no formato que o PostgREST entrega para o select de
   vendasLeitura (numeric e bigint como texto) e um cliente falso que registra cada consulta. */
import type { ClienteLeituraVenda, ConsultaLeituraVenda } from "@/lib/persistencia/vendasLeitura";

export const USUARIO = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
export const CONTATO_ANA = "c0000000-0000-4000-8000-00000000000a";
export const CONTATO_SEM_NOME = "c0000000-0000-4000-8000-00000000000b";
export const CONTATO_ILEGIVEL = "c0000000-0000-4000-8000-00000000000c";
export const OP_NOVA = "0a000000-0000-4000-8000-000000000001";
export const OP_REFERENCIA = "0a000000-0000-4000-8000-000000000002";
export const OP_GANHA = "0a000000-0000-4000-8000-000000000003";
export const OP_PERDIDA_ARQUIVADA = "0a000000-0000-4000-8000-000000000004";
export const REFERENCIA = "4e000000-0000-4000-8000-000000000001";
export const IMOVEL_ORIGINAL = "1e000000-0000-4000-8000-000000000001";

type Linha = Record<string, unknown>;

export function linhaOportunidade(sobrescrever: Linha = {}): Linha {
  return {
    id: OP_NOVA, user_id: USUARIO, contato_id: CONTATO_ANA, estado: "nova", versao: "1",
    imovel_modo: null, imovel_referencia_id: null, manual_endereco: null, manual_referencia: null, manual_unidade: null,
    manual_bloco: null, manual_descricao_curta: null, origem_tipo: null, origem_descricao: null,
    valor_negocio_previsto: null, valor_negocio_fechado: null, receita_prevista: null,
    criado_por: USUARIO, responsavel_usuario_id: USUARIO, encerramento_tipo: null, data_fato: null,
    confirmacao_explicita: null, registro_formalizacao: null, motivo_perda: null, justificativa_perda: null,
    encerrado_em: null, created_at: "2026-10-01T12:00:00.000+00:00", updated_at: "2026-10-01T12:00:00.000+00:00", arquivado_em: null,
    ...sobrescrever,
  };
}

/** Quatro oportunidades cobrindo: sem imóvel, referência da carteira, ganha (manual) e perdida arquivada. */
export function oportunidadesPadrao(): Linha[] {
  return [
    linhaOportunidade({ id: OP_NOVA, contato_id: CONTATO_ANA, valor_negocio_previsto: "0", updated_at: "2026-10-02T12:00:00.000+00:00" }),
    linhaOportunidade({
      id: OP_REFERENCIA, contato_id: CONTATO_SEM_NOME, estado: "em_negociacao", versao: "3", imovel_modo: "referencia", imovel_referencia_id: REFERENCIA,
      origem_tipo: "portal", origem_descricao: "Anúncio no portal", valor_negocio_previsto: "350000.5", receita_prevista: "17500",
      updated_at: "2026-10-05T15:30:00.000+00:00",
    }),
    linhaOportunidade({
      id: OP_GANHA, contato_id: CONTATO_ANA, estado: "ganha", versao: "4", imovel_modo: "manual", manual_endereco: "Rua das Palmeiras, 100",
      manual_unidade: "12", manual_bloco: "B", valor_negocio_previsto: "500000", valor_negocio_fechado: "480000",
      encerramento_tipo: "ganho", data_fato: "2026-10-03", confirmacao_explicita: true, registro_formalizacao: "Contrato assinado no cartório",
      encerrado_em: "2026-10-04T10:00:00.000+00:00", updated_at: "2026-10-04T10:00:00.000+00:00",
    }),
    linhaOportunidade({
      id: OP_PERDIDA_ARQUIVADA, contato_id: CONTATO_ILEGIVEL, estado: "perdida", versao: "3", encerramento_tipo: "perda",
      data_fato: "2026-09-30", motivo_perda: "outro", justificativa_perda: "Mudou de cidade",
      encerrado_em: "2026-10-01T13:00:00.000+00:00", updated_at: "2026-10-06T09:00:00.000+00:00", arquivado_em: "2026-10-06T09:00:00.000+00:00",
    }),
  ];
}

export function referenciaPadrao(sobrescrever: Linha = {}): Linha {
  return {
    id: REFERENCIA, user_id: USUARIO, imovel_id: IMOVEL_ORIGINAL, imovel_id_original: IMOVEL_ORIGINAL, codigo: "LD-77",
    referencia: "CRM-77", endereco: "Av. Brasil, 500", unidade: "301", bloco: null, capturado_em: "2026-10-01T12:00:00.000+00:00",
    ...sobrescrever,
  };
}

/** O contato ilegível não vem: a RLS não o devolve, e a tela não pode saber por quê. */
export function contatosPadrao(): Linha[] {
  return [{ id: CONTATO_ANA, nome: " Ana Compradora " }, { id: CONTATO_SEM_NOME, nome: null }];
}

export function eventosPadrao(oportunidadeId = OP_REFERENCIA): Linha[] {
  const base = { user_id: USUARIO, oportunidade_id: oportunidadeId, ator_usuario_id: USUARIO, data_fato: null };
  const vazios = { valorNegocioPrevisto: null, valorNegocioFechado: null, receitaPrevista: null };
  return [
    { ...base, id: "e0000000-0000-4000-8000-000000000001", tipo: "oportunidade_criada", registrado_em: "2026-10-01T12:00:00.000+00:00", versao: "1",
      chave_idempotencia: "chave-1", payload: { versaoContrato: 1, dados: { contatoId: CONTATO_SEM_NOME, imovelTratado: null, origem: null, valores: vazios } } },
    { ...base, id: "e0000000-0000-4000-8000-000000000002", tipo: "etapa_alterada", registrado_em: "2026-10-02T12:00:00.000+00:00", versao: "2",
      chave_idempotencia: "chave-2", payload: { versaoContrato: 1, dados: { anterior: "nova", atual: "em_atendimento" } } },
    { ...base, id: "e0000000-0000-4000-8000-000000000003", tipo: "valor_alterado", registrado_em: "2026-10-03T12:00:00.000+00:00", versao: "3",
      chave_idempotencia: "chave-3", payload: { versaoContrato: 1, dados: { anterior: vazios, atual: { ...vazios, valorNegocioPrevisto: "350000.5" } } } },
  ];
}

export type RespostaTabela = Linha[] | { error: unknown } | "rede";
export interface ConsultaRegistrada {
  tabela: string; colunas: string;
  filtros: Array<[string, string, unknown]>; ordem: Array<[string, boolean]>;
}

/** Cliente que imita o encadeamento do supabase-js e aplica `in("id")`/`eq` sobre as linhas. */
export function clienteFalso(tabelas: Record<string, RespostaTabela>) {
  const consultas: ConsultaRegistrada[] = [];
  const cliente: ClienteLeituraVenda = {
    from(tabela: string) {
      const registro: ConsultaRegistrada = { tabela, colunas: "", filtros: [], ordem: [] };
      consultas.push(registro);
      const consulta: ConsultaLeituraVenda = {
        eq(coluna, valor) { registro.filtros.push(["eq", coluna, valor]); return consulta; },
        in(coluna, valores) { registro.filtros.push(["in", coluna, [...valores]]); return consulta; },
        order(coluna, opcoes) { registro.ordem.push([coluna, opcoes.ascending]); return consulta; },
        then(resolver, rejeitar) {
          const resposta = tabelas[tabela];
          if (resposta === "rede") return Promise.reject(new TypeError("Failed to fetch")).then(resolver, rejeitar);
          if (resposta === undefined) return Promise.resolve({ data: null, error: { code: "42P01", message: "tabela fora do teste" } }).then(resolver, rejeitar);
          if (!Array.isArray(resposta)) return Promise.resolve({ data: null, error: resposta.error }).then(resolver, rejeitar);
          const dados = resposta.filter((linha) => registro.filtros.every(([tipo, coluna, valor]) =>
            tipo === "eq" ? linha[coluna] === valor : (valor as unknown[]).includes(linha[coluna])));
          return Promise.resolve({ data: structuredClone(dados), error: null }).then(resolver, rejeitar);
        },
      };
      return { select(colunas: string) { registro.colunas = colunas; return consulta; } };
    },
  };
  return { cliente, consultas };
}
