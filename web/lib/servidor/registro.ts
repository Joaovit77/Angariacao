/* ================================================================
   REGISTRO — o log e o gasto, escritos por quem os produz

   ATENÇÃO: módulo SÓ DE SERVIDOR, como o vizinho `servidor/ia.ts`. Ele
   lê a `SUPABASE_SERVICE_ROLE_KEY` e importa `next/server`. Nunca
   importe daqui em componente, store ou qualquer coisa que chegue ao
   browser — a service role iria junto, e ela ignora a RLS inteira.
   (É por isso que ele mora em `lib/servidor/` e não em `lib/calculo/`,
   que é puro por contrato.)

   Duas escritas, e as duas existem pelo mesmo motivo: até aqui, o que
   acontecia no servidor ia para o `console.error` — que na Vercel é um
   fluxo único, sem dono, que ninguém lê. A instância de um corretor
   caía e quem descobria era ele, no meio de um lote. Uma chamada de IA
   custava dinheiro e ninguém sabia de quem era.

   TRÊS REGRAS, e nenhuma é detalhe:

   1. **Isto nunca lança e nunca atrasa.** Mesmo contrato da
      transcrição: o chamador é um caminho que já está fazendo algo mais
      importante — mandar a mensagem, gravar a nota. Uma falha ao
      registrar não pode derrubar nem retardar isso. Por isso a escrita
      sai por `after()`, depois da resposta já ter ido embora, e toda
      falha morre num console.error.

   2. **`user_id` nunca vem da requisição.** Quem chama já descobriu o
      dono por `auth.getUser()` ou pela instância em
      `whatsapp_instancias` — é a mesma disciplina de toda escrita com
      service role neste projeto.

   3. **Nunca gravar conteúdo de conversa nem telefone de
      proprietário.** O log é lido por quem opera o sistema, que não é
      o dono daquela carteira. Motivo classificado ("sem-whatsapp",
      "instancia-desconectada") basta para agir e não expõe dado
      pessoal de terceiro que nunca aceitou nada — ver o comentário da
      tabela em supabase-schema.sql.
   ================================================================ */
import { after } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { CategoriaEvento, NivelEvento } from "@/lib/calculo/admin";

/** Cliente com service role, criado por chamada — nunca um singleton de
    módulo, de onde vazaria para outra rota por descuido (a mesma
    ressalva de `api/google/_comum.ts`). Null quando o ambiente não tem
    as variáveis: sem elas não há onde gravar, e isto é opcional. */
function cliente(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const servico = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !servico) return null;
  return createClient(url, servico, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

/**
 * Roda o trabalho DEPOIS da resposta sair.
 *
 * `after()` é o que separa este módulo de um `await` no meio da rota: o
 * corretor não pode esperar uma escrita de log para receber o "mensagem
 * enviada". Fora de um ciclo de requisição (num teste, por exemplo)
 * `after` lança — daí o fallback para uma promessa solta com catch,
 * que mantém o contrato de nunca lançar.
 */
function depois(trabalho: () => Promise<void>): void {
  const seguro = () =>
    trabalho().catch((e) => {
      console.error("Registro: falha ao gravar (ignorada):", e);
    });
  try {
    after(seguro);
  } catch {
    void seguro();
  }
}

export interface EntradaEvento {
  /** Descoberto pelo chamador, nunca recebido do browser. Null para o
      que não é de ninguém em particular. */
  userId: string | null;
  categoria: CategoriaEvento;
  nivel: NivelEvento;
  /** Código do vocabulário fechado de `lib/calculo/admin.ts` (EVENTOS). */
  evento: string;
  /** Complemento curto para uma pessoa LER. Sem dado pessoal — ver a
      regra 3 no topo. */
  detalhe?: string | null;
}

/** Grava uma linha no log. Dispara e não espera. */
export function registrarEvento(entrada: EntradaEvento): void {
  const sb = cliente();
  if (!sb) return;
  depois(async () => {
    const { error } = await sb.from("log_eventos").insert({
      user_id: entrada.userId,
      categoria: entrada.categoria,
      nivel: entrada.nivel,
      evento: entrada.evento,
      detalhe: entrada.detalhe ?? null,
    });
    if (error) console.error("Registro: log recusado:", error.message);
  });
}

export interface EntradaUso {
  userId: string | null;
  /** O que estava sendo feito ("resumo-dia", "transcricao"…). É o que
      responde "o gasto foi em quê", e não só "quanto". */
  tipo: string;
  modelo: string;
  /** Total, como a API reporta — **já inclui** os cacheados. */
  tokensEntrada: number;
  /** Quantos dos `tokensEntrada` a OpenAI serviu do cache. Cobrados dez
      vezes menos; a subtração é feita na leitura, em `custoIa.ts`. */
  tokensEntradaCache?: number;
  tokensSaida: number;
}

/**
 * Grava o consumo de uma chamada de IA. Dispara e não espera.
 *
 * Guarda o FATO (modelo e tokens, como a API os devolveu) e nunca o
 * preço: preço muda por decisão da OpenAI, e gravá-lo congelaria as
 * linhas antigas. A conta é feita na leitura, por
 * `lib/calculo/custoIa.ts`.
 *
 * Chamada sem `usage` na resposta não é gravada como zero: zero é um
 * fato ("não consumiu"), e afirmar isso quando na verdade não sabemos
 * faria o painel mostrar um custo menor que o real com cara de exato —
 * o mesmo erro que `custoDaChamada` evita devolvendo null.
 */
export function registrarUsoIa(entrada: EntradaUso): void {
  const sb = cliente();
  if (!sb) return;
  depois(async () => {
    const { error } = await sb.from("ia_uso").insert({
      user_id: entrada.userId,
      tipo: entrada.tipo,
      modelo: entrada.modelo,
      tokens_entrada: entrada.tokensEntrada,
      tokens_entrada_cache: entrada.tokensEntradaCache ?? 0,
      tokens_saida: entrada.tokensSaida,
    });
    if (error) console.error("Registro: uso de IA recusado:", error.message);
  });
}

/** Atalho para o caso mais comum: a resposta da OpenAI traz `usage`,
    ou não traz — e sem ela não há o que gravar (ver acima). */
export function registrarUsoDaResposta(
  userId: string | null,
  tipo: string,
  modelo: string,
  usage:
    | {
        prompt_tokens?: number;
        completion_tokens?: number;
        /** Onde a OpenAI reporta a parte cacheada da entrada. Note que
            `prompt_tokens` JÁ a inclui — quem desconta é `custoIa.ts`. */
        prompt_tokens_details?: { cached_tokens?: number } | null;
      }
    | null
    | undefined,
): void {
  if (!usage) return;
  registrarUsoIa({
    userId,
    tipo,
    modelo,
    tokensEntrada: usage.prompt_tokens ?? 0,
    tokensEntradaCache: usage.prompt_tokens_details?.cached_tokens ?? 0,
    tokensSaida: usage.completion_tokens ?? 0,
  });
}
