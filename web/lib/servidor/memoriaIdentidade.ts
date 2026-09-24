/* ================================================================
   GARIMPO EM CAMPO — C13B: o Investigador persiste memória (servidor)

   Ponte entre a conclusão de uma investigação (rota do Investigador) e a
   RPC de servidor do C13A, `registrar_investigacao_identificado`. É o
   ÚNICO caminho de escrita da memória a partir do Investigador: sem
   insert direto, sem segunda RPC, sem endpoint paralelo, sem fila.

   O que entra: o id da execução (gerado AQUI, no servidor, no início
   lógico da execução; nunca vem do cliente), o usuário autenticado pela
   rota, o imóvel identificado já conferido como dele e as correspondências
   estruturadas que o Investigador produziu. A consulta digitada NÃO entra:
   é texto livre (nome, telefone, e-mail, o que a pessoa quiser) e texto
   livre não é memória. O que vai para o banco: só o que
   `extrairAfirmacoesDaInvestigacao` (C13A) aceita do catálogo fechado, sem
   PII, com fonte, e sem confiança (o Investigador mede correspondência do
   anúncio, não veracidade do atributo). Desde o B3-M1 só resultados de
   faixa muito forte ou forte podem afirmar; a lista inteira continua
   chegando aqui, porque `p_resultados_total` é o que a pesquisa achou, não
   o que virou memória. O log é só de contagens: nada de URL, domínio,
   consulta, título, trecho ou valor.

   Nunca lança: a pesquisa que a pessoa acabou de ver não pode sumir
   porque a memória falhou. Devolve um estado explícito, e a UI conta a
   verdade. Retry é interno, com o MESMO id: a RPC é idempotente por
   execução, então repetir nunca duplica. Sem `SUPABASE_SERVICE_ROLE_KEY`
   não há como gravar: estado `indisponivel`, e nada é anotado.
   ================================================================ */
import { randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { CorrespondenciaInvestigacao, MemoriaInvestigacao } from "@/lib/calculo/investigadorImoveis";
import {
  extrairAfirmacoesDaInvestigacao,
  resultadoElegivelParaMemoria,
  type AfirmacaoMemoria,
} from "@/lib/calculo/memoriaIdentidade";

export const RPC_REGISTRAR_INVESTIGACAO = "registrar_investigacao_identificado";
export const TENTATIVAS_PERSISTENCIA_MEMORIA = 3;

/** O id da execução nasce no servidor, antes da pesquisa começar. */
export function novaExecucaoInvestigacao(): string {
  return randomUUID();
}

/** Cliente com service role, criado por chamada e nunca exportado como
    singleton (mesma ressalva de `registro.ts`). Null sem a variável. */
export function clienteDeServicoMemoria(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !chave) return null;
  return createClient(url, chave, { auth: { persistSession: false, autoRefreshToken: false } });
}

export interface PedidoMemoriaInvestigacao {
  userId: string;
  execucaoId: string;
  imovelIdentificadoId: string;
  resultados: ReadonlyArray<CorrespondenciaInvestigacao>;
}

export interface DependenciasMemoria {
  servico: SupabaseClient | null;
  tentativas?: number;
}

/** Forma exata que a RPC recebe em `p_atributos`: colunas do banco, só
    catálogo, só valor real. Sem título, descrição, evidências ou
    contradições: texto livre da web fica no resultado, não na memória. */
export function atributosParaRpc(afirmacoes: ReadonlyArray<AfirmacaoMemoria>): Array<Record<string, unknown>> {
  return afirmacoes.map((a) => ({
    atributo: a.atributo,
    valor_texto: a.valorTexto,
    valor_num: a.valorNum,
    confianca: a.confianca,
    fonte_url: a.fonteUrl,
    fonte_dominio: a.fonteDominio,
  }));
}

interface RespostaRpc {
  ok?: boolean;
  repetida?: boolean;
  codigo?: string;
  atributos_salvos?: number;
  atributos_recusados?: number;
}

function inteiro(valor: unknown): number {
  return typeof valor === "number" && Number.isFinite(valor) ? valor : 0;
}

export async function persistirMemoriaDaInvestigacao(
  pedido: PedidoMemoriaInvestigacao,
  deps: DependenciasMemoria = { servico: clienteDeServicoMemoria() },
): Promise<MemoriaInvestigacao> {
  const { execucaoId } = pedido;
  const base = { execucaoId, atributosSalvos: 0, atributosRecusados: 0 };
  if (!deps.servico) {
    console.warn("[investigador-imoveis] memória indisponível: SUPABASE_SERVICE_ROLE_KEY ausente (ver DEPLOY.md)");
    return { ...base, estado: "indisponivel" };
  }

  const extracao = extrairAfirmacoesDaInvestigacao(pedido.resultados);
  const elegiveis = pedido.resultados.filter(resultadoElegivelParaMemoria).length;
  // Só contagens agregadas: nenhum campo do resultado entra no log.
  const triagem = {
    execucao: execucaoId,
    resultados: pedido.resultados.length,
    elegiveis,
    ignoradosPorFaixa: pedido.resultados.length - elegiveis,
    aceitas: extracao.afirmacoes.length,
    descartadas: extracao.recusadas,
  };
  console.info("[investigador-imoveis] triagem da memória", triagem);
  const parametros = {
    p_user_id: pedido.userId,
    p_investigacao_id: execucaoId,
    p_imovel_identificado_id: pedido.imovelIdentificadoId,
    p_resultados_total: pedido.resultados.length,
    p_recusados_total: extracao.recusadas,
    p_atributos: atributosParaRpc(extracao.afirmacoes),
  };

  const tentativas = Math.max(1, deps.tentativas ?? TENTATIVAS_PERSISTENCIA_MEMORIA);
  let ultimoCodigo = "erro";
  for (let tentativa = 1; tentativa <= tentativas; tentativa += 1) {
    let resposta: { data: unknown; error: { code?: string; message?: string } | null };
    try {
      resposta = await deps.servico.rpc(RPC_REGISTRAR_INVESTIGACAO, parametros);
    } catch (erro) {
      resposta = { data: null, error: { code: erro instanceof Error ? erro.name : "excecao" } };
    }
    if (!resposta.error) {
      const dados = (resposta.data ?? {}) as RespostaRpc;
      if (dados.ok === false) {
        // A RPC recusou por estado do registro (exclusão pendente, lápide
        // de merge): não é falha transitória, repetir não muda nada.
        console.warn("[investigador-imoveis] memória recusada pelo banco", { execucao: execucaoId, codigo: dados.codigo });
        return { ...base, estado: "recusada", codigo: dados.codigo };
      }
      const estado = dados.repetida ? "repetida" : "salva";
      console.info("[investigador-imoveis] memória registrada", {
        ...triagem, estado, salvos: inteiro(dados.atributos_salvos), recusados: inteiro(dados.atributos_recusados),
      });
      return {
        execucaoId,
        estado,
        atributosSalvos: inteiro(dados.atributos_salvos),
        atributosRecusados: inteiro(dados.atributos_recusados),
      };
    }
    ultimoCodigo = resposta.error.code || "erro";
    console.warn("[investigador-imoveis] memória não salva", { execucao: execucaoId, tentativa, codigo: ultimoCodigo });
  }
  return { ...base, estado: "falhou", codigo: ultimoCodigo };
}
