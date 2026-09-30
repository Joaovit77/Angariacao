import type { SupabaseClient } from "@supabase/supabase-js";
import { notaDaMensagemEnviada, type OrigemMensagemEnviada } from "@/lib/calculo/notas";
import type { ConfirmacaoVisitaPendente } from "@/lib/calculo/confirmacaoVisita";
import type { AtribuicaoNota } from "@/lib/calculo/autoridadeAtribuicao";

function objeto(valor: unknown): Record<string, unknown> {
  return valor && typeof valor === "object" ? (valor as Record<string, unknown>) : {};
}

/** A Evolution 2.x devolve o id em `key.id`. As alternativas mantêm
    compatibilidade com envelopes usados por versões anteriores/proxies. */
export function idMensagemEvolution(corpo: unknown): string | null {
  const raiz = objeto(corpo);
  const candidatos = [
    objeto(raiz.key).id,
    objeto(objeto(raiz.data).key).id,
    raiz.messageId,
    raiz.id,
  ];
  for (const candidato of candidatos) {
    if (typeof candidato === "string" && candidato.trim()) return candidato.trim();
  }
  return null;
}

export interface RegistroMensagemEnviada {
  imovelId: string;
  userId: string;
  mensagemId: string;
  texto: string;
  data: string;
  origem: OrigemMensagemEnviada;
  tipo?: string;
  confirmacaoVisita?: ConfirmacaoVisitaPendente;
  /** Só o webhook preenche: a decisão de autoridade que escolheu este
      imóvel (Fase 1a-C2.1a). Envio pelo painel não passa por atribuição. */
  atribuicao?: AtribuicaoNota;
}

/** Persiste por RPC em vez de regravar o array JSONB inteiro. A função do
    banco filtra imóvel + usuário e recusa um id já existente na mesma
    instrução, protegendo RLS/isolamento e reentregas concorrentes. */
export async function registrarMensagemEnviada(
  supabase: SupabaseClient,
  registro: RegistroMensagemEnviada,
): Promise<{ gravou: boolean; erro: string | null }> {
  const { data, error } = await supabase.rpc("registrar_nota_imovel", {
    p_imovel_id: registro.imovelId,
    p_user_id: registro.userId,
    p_nota: {
      ...notaDaMensagemEnviada(
        registro.mensagemId,
        registro.texto,
        registro.data,
        registro.origem,
        registro.tipo,
        registro.confirmacaoVisita,
      ),
      ...(registro.atribuicao ? { atribuicao: registro.atribuicao } : {}),
    },
  });
  return { gravou: data === true, erro: error?.message || null };
}

/* ----------------------------------------------------------------
   IDENTIDADE POR CONTA (Fase 1a-C2.1b.1)

   As duas funções abaixo usam as RPCs que serializam pela mesma chave
   (user_id + id externo da Evolution) e procuram a mensagem em TODOS os
   imóveis da conta, não só no alvo. Quem grava por linha continua usando
   `registrarMensagemEnviada` / `registrar_nota_imovel`: a consolidação
   M3/M4 grava o mesmo id em N imóveis de propósito.
   ---------------------------------------------------------------- */

/** O que a RPC do webhook responde. Vocabulário fechado: a rota decide
    efeito e observabilidade a partir dele. */
export type PersistenciaConta =
  | "gravada"
  | "duplicada-mesmo-imovel"
  | "duplicada-outro-imovel"
  | "imovel-inexistente";

const PERSISTENCIAS_CONTA: readonly string[] = [
  "gravada",
  "duplicada-mesmo-imovel",
  "duplicada-outro-imovel",
  "imovel-inexistente",
];

/** Qualquer resposta fora do vocabulário é tratada como falha: um retorno
    desconhecido nunca vira "gravada" nem "duplicada" por omissão. */
export function persistenciaContaValida(valor: unknown): PersistenciaConta | null {
  return typeof valor === "string" && PERSISTENCIAS_CONTA.includes(valor)
    ? (valor as PersistenciaConta)
    : null;
}

/** A saída `fromMe` que o webhook recebeu: grava uma vez por conta, no
    imóvel que a atribuição escolheu. Nunca remove nada; se a mensagem já
    existe em algum imóvel da conta (inclusive gravada pela origem), não
    grava de novo. */
export async function registrarMensagemEnviadaDoWebhook(
  supabase: SupabaseClient,
  registro: RegistroMensagemEnviada,
): Promise<{ persistencia: PersistenciaConta | null; erro: string | null }> {
  const { data, error } = await supabase.rpc("registrar_nota_whatsapp_conta", {
    p_user_id: registro.userId,
    p_imovel_id: registro.imovelId,
    p_nota: {
      ...notaDaMensagemEnviada(
        registro.mensagemId,
        registro.texto,
        registro.data,
        registro.origem,
        registro.tipo,
        registro.confirmacaoVisita,
      ),
      ...(registro.atribuicao ? { atribuicao: registro.atribuicao } : {}),
    },
  });
  if (error) return { persistencia: null, erro: error.message };
  const persistencia = persistenciaContaValida(data);
  return persistencia
    ? { persistencia, erro: null }
    : { persistencia: null, erro: "resposta-desconhecida" };
}

/** Resultado da RPC de origem. `origem-reconciliou-eco`: um eco `fromMe`
    que tinha caído em outro imóvel (ou no próprio alvo) foi substituído
    pela nota da origem. `conflito`: a mensagem já existe fora do conjunto
    declarado de um jeito que não é eco; nada foi gravado nem removido. */
export type PersistenciaOrigem =
  | "gravada"
  | "duplicada"
  | "origem-reconciliou-eco"
  | "conflito"
  | "imovel-inexistente";

const PERSISTENCIAS_ORIGEM: readonly string[] = [
  "gravada",
  "duplicada",
  "origem-reconciliou-eco",
  "conflito",
  "imovel-inexistente",
];

/** Mesma regra de `persistenciaContaValida`, para a RPC de origem (e para o
    `historico` da efetivação da consolidação, que é a mesma RPC por dentro). */
export function persistenciaOrigemValida(valor: unknown): PersistenciaOrigem | null {
  return typeof valor === "string" && PERSISTENCIAS_ORIGEM.includes(valor)
    ? (valor as PersistenciaOrigem)
    : null;
}

export interface RegistroMensagemDeOrigem extends Omit<RegistroMensagemEnviada, "imovelId" | "atribuicao"> {
  /** Os imóveis que o próprio Angario declarou como destino do envio. */
  imovelIds: readonly string[];
}

/** O envio que o próprio Angario fez (painel, cron sem consolidação): a
    ORIGEM VENCE O ECO. Ver `registrar_nota_whatsapp_origem`. */
export async function registrarMensagemEnviadaDeOrigem(
  supabase: SupabaseClient,
  registro: RegistroMensagemDeOrigem,
): Promise<{ persistencia: PersistenciaOrigem | null; imoveisEco: string[]; erro: string | null }> {
  const { data, error } = await supabase.rpc("registrar_nota_whatsapp_origem", {
    p_user_id: registro.userId,
    p_imovel_ids: [...registro.imovelIds],
    p_nota: notaDaMensagemEnviada(
      registro.mensagemId,
      registro.texto,
      registro.data,
      registro.origem,
      registro.tipo,
      registro.confirmacaoVisita,
    ),
  });
  if (error) return { persistencia: null, imoveisEco: [], erro: error.message };
  const corpo = objeto(data);
  const persistencia = persistenciaOrigemValida(corpo.resultado);
  if (!persistencia) {
    return { persistencia: null, imoveisEco: [], erro: "resposta-desconhecida" };
  }
  return { persistencia, imoveisEco: imoveisDoEco(corpo.imoveis_eco), erro: null };
}

/** Os imóveis FORA do conjunto de onde a origem tirou um eco. */
export function imoveisDoEco(valor: unknown): string[] {
  return Array.isArray(valor) ? valor.filter((id): id is string => typeof id === "string") : [];
}

/** O detalhe do evento `historico-envio-atribuicao`, emitido só fora do
    caso normal (reconciliação, conflito, id interno). Ids técnicos e
    vocabulário fechado: nunca o id da mensagem, telefone ou texto. */
export function detalheDaAtribuicaoDoEnvio(entrada: {
  persistencia: PersistenciaOrigem | "falha";
  identidade: "externa" | "fallback-interno";
  origem: "painel" | "cron" | "consolidacao";
  imoveisDeclarados: readonly string[];
  imoveisEco: readonly string[];
}): string {
  return JSON.stringify({
    persistencia: entrada.persistencia,
    identidade: entrada.identidade,
    origem: entrada.origem,
    imoveis_declarados: [...entrada.imoveisDeclarados],
    ...(entrada.imoveisEco.length ? { imovel_eco_id: entrada.imoveisEco.length === 1 ? entrada.imoveisEco[0] : [...entrada.imoveisEco] } : {}),
  });
}

/** O envio do Angario precisa de evento próprio? Só fora do normal: eco
    reconciliado, conflito, ou id interno (sem a garantia de eco). Falha de
    gravação já tem o seu (`historico-envio-falhou`) e não repete aqui. */
export function envioPrecisaDeEvento(
  persistencia: PersistenciaOrigem | "falha",
  identidade: "externa" | "fallback-interno",
): boolean {
  return (
    identidade === "fallback-interno" ||
    persistencia === "origem-reconciliou-eco" ||
    persistencia === "conflito"
  );
}
