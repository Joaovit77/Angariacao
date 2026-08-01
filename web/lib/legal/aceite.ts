/* ================================================================
   O ACEITE — leitura e gravação

   Fica fora de `mutacoes.ts` pelo mesmo motivo de `ia.ts` e
   `admin.ts`: não é dado da carteira do corretor, é um registro sobre
   a relação dele com o serviço.

   A REGRA QUE DÁ FORMA A ISTO: **falha ao consultar não bloqueia o
   app.** Se a consulta ao aceite der erro (rede caiu, tabela fora do
   ar), o painel abre normalmente em vez de prender o corretor numa
   tela de aceite que ele não consegue passar. É o oposto da decisão
   tomada em `podeUsarIa` — lá, na dúvida, nega; aqui, na dúvida,
   deixa entrar.

   A diferença é o que está em jogo dos dois lados. Lá, o risco de
   errar para o lado permissivo é gastar tokens de quem não devia.
   Aqui, seria trancar do lado de fora um corretor que já aceitou os
   termos, no meio do dia de trabalho, por causa de uma falha de rede
   nossa — e o ganho seria bloquear alguém por algumas horas a mais.
   ================================================================ */
import { getSupabase } from "../persistencia/supabase";
import { VERSAO_TERMOS } from "./identidade";

/**
 * O usuário já aceitou a versão vigente?
 *
 * `true` em qualquer dúvida (ver o comentário do topo). O que
 * realmente distingue é a ausência CONFIRMADA de linha — aí sim a
 * tela de aceite aparece.
 */
export async function aceitouVersaoAtual(userId: string): Promise<boolean> {
  const { data, error } = await getSupabase()
    .from("aceites_termos")
    .select("versao")
    .eq("user_id", userId)
    .eq("versao", VERSAO_TERMOS)
    .maybeSingle();

  if (error) {
    console.error("Aceite: falha ao consultar (seguindo como aceito):", error.message);
    return true;
  }
  return !!data;
}

/**
 * Registra o aceite da versão vigente.
 *
 * Idempotente por construção: a tabela tem `unique (user_id, versao)`,
 * então clicar duas vezes (ou aceitar no cadastro e de novo no login)
 * não cria duplicata. O conflito é ignorado em vez de virar erro na
 * tela — do ponto de vista do usuário, aceitar duas vezes é aceitar.
 */
export async function registrarAceite(userId: string): Promise<{ ok: boolean }> {
  const { error } = await getSupabase()
    .from("aceites_termos")
    .upsert({ user_id: userId, versao: VERSAO_TERMOS }, { onConflict: "user_id,versao", ignoreDuplicates: true });

  if (error) {
    console.error("Aceite: falha ao registrar:", error.message);
    return { ok: false };
  }
  return { ok: true };
}
