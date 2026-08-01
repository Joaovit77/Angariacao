/* ================================================================
   TRANSCRIÇÃO DE ÁUDIO — o efeito (servidor)
   NÃO é rota: o `_` a mantém fora do roteamento, mesmo padrão de
   `api/google/_comum.ts`.

   Mora no servidor porque toca DOIS segredos que não podem chegar ao
   browser: o token da instância na Evolution (que baixa a mídia) e a
   OPENAI_API_KEY (cobrada por uso). É o mesmo critério que justifica
   todas as outras rotas do projeto.

   As decisões — o que é áudio, quanto esperar, quantas vezes tentar,
   se o texto ficou útil — são puras e testadas em
   `lib/calculo/transcricao.ts`. Aqui fica só a chamada e o retry.

   O contrato com quem chama: **isto nunca lança**. Toda falha volta
   como `{ ok: false, falha }`, porque o chamador é o webhook e a
   degradação correta é gravar `[áudio]` como sempre se gravou. Um
   throw aqui derrubaria a gravação da nota, que é o dado mais valioso
   da rota e o que garante a idempotência.
   ================================================================ */
import { registrarUsoIa } from "@/lib/servidor/registro";
import {
  esperaTranscricaoMs,
  type FalhaTranscricao,
  MAX_BYTES_AUDIO,
  MAX_TENTATIVAS_TRANSCRICAO,
  normalizarTranscricao,
  TIMEOUT_TRANSCRICAO_MS,
  transcricaoUtil,
} from "@/lib/calculo/transcricao";

/**
 * Modelo de transcrição.
 *
 * Constante no topo, como o `MODELO` da rota de IA — trocar de modelo mexe em
 * um lugar. Este foi o medido nos 43 áudios reais da carteira em 31/07/2026.
 */
const MODELO_TRANSCRICAO = "gpt-4o-mini-transcribe-2025-12-15";

export type ResultadoTranscricao =
  | { ok: true; texto: string }
  | { ok: false; falha: FalhaTranscricao };

const dormir = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Baixa o áudio da Evolution.
 *
 * Endpoint `getBase64FromMediaMessage`, que devolve o arquivo em base64 a
 * partir do id da mensagem — o mesmo id que já está no id da nota (`wa:<id>`),
 * então não é preciso guardar nada novo no banco para isto funcionar, nem
 * agora nem no backfill.
 */
async function baixarAudio(
  serverUrl: string,
  instancia: string,
  token: string,
  mensagemId: string,
): Promise<{ bytes: Uint8Array } | { falha: FalhaTranscricao }> {
  try {
    const r = await fetch(`${serverUrl}/chat/getBase64FromMediaMessage/${instancia}`, {
      method: "POST",
      headers: { apikey: token, "Content-Type": "application/json" },
      body: JSON.stringify({ message: { key: { id: mensagemId } }, convertToMp4: false }),
      signal: AbortSignal.timeout(TIMEOUT_TRANSCRICAO_MS),
    });
    if (!r.ok) return { falha: "sem-midia" };
    const corpo = (await r.json()) as { base64?: string };
    if (!corpo?.base64) return { falha: "sem-midia" };

    const bytes = Uint8Array.from(Buffer.from(corpo.base64, "base64"));
    if (bytes.length > MAX_BYTES_AUDIO) return { falha: "audio-grande-demais" };
    return { bytes };
  } catch {
    return { falha: "sem-conexao" };
  }
}

/** Uma chamada à OpenAI. O retry é de quem chama. */
async function transcreverUmaVez(
  bytes: Uint8Array,
  chave: string,
  userId: string | null,
): Promise<ResultadoTranscricao | { retentar: FalhaTranscricao }> {
  const form = new FormData();
  // A EXTENSÃO IMPORTA: a OpenAI escolhe o decoder por ela, e o WhatsApp manda
  // ogg/opus. Sem o nome de arquivo, a API recusa o corpo.
  form.append("file", new Blob([bytes as BlobPart], { type: "audio/ogg" }), "audio.ogg");
  form.append("model", MODELO_TRANSCRICAO);
  // Fixar o idioma melhora a transcrição e evita o modelo "traduzir" um áudio
  // com ruído para outra língua — o app inteiro é pt-BR.
  form.append("language", "pt");

  let resposta: Response;
  try {
    resposta = await fetch("https://api.openai.com/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${chave}` },
      body: form,
      signal: AbortSignal.timeout(TIMEOUT_TRANSCRICAO_MS),
    });
  } catch {
    return { retentar: "sem-conexao" };
  }

  if (!resposta.ok) {
    /* O 403 aqui é RETENTÁVEL, e isso é contraintuitivo o bastante para valer
       o comentário. A OpenAI devolve 403 `model_not_found` quando o projeto
       está sendo limitado, com a mesma mensagem de quando o modelo de fato não
       está liberado. Medido em 31/07/2026: das 11 falhas nos 43 áudios, 9
       passaram na segunda tentativa com a mesma chave e o mesmo modelo.
       Tratar 403 como definitivo perderia ~1 em cada 4 áudios. */
    if (resposta.status === 429 || resposta.status === 403 || resposta.status >= 500) {
      return { retentar: "limite-de-taxa" };
    }
    return { ok: false, falha: "falha-openai" };
  }

  const corpo = (await resposta.json().catch(() => null)) as
    | { text?: string; usage?: { input_tokens?: number; output_tokens?: number } }
    | null;

  /* O gasto. Repare que os nomes dos campos são OUTROS aqui: a API de
     transcrição devolve `input_tokens`/`output_tokens`, enquanto a de
     chat devolve `prompt_tokens`/`completion_tokens` — daí este registro
     ser feito à mão em vez de pelo `registrarUsoDaResposta`.

     Registrado ANTES de julgar se o texto ficou útil, e de propósito: a
     transcrição vazia foi cobrada igual. Ela é justamente o caso que o
     painel precisa mostrar, porque é dinheiro saindo sem nada em troca. */
  if (corpo?.usage) {
    registrarUsoIa({
      userId,
      tipo: "transcricao",
      modelo: MODELO_TRANSCRICAO,
      tokensEntrada: corpo.usage.input_tokens ?? 0,
      tokensSaida: corpo.usage.output_tokens ?? 0,
    });
  }

  const texto = normalizarTranscricao(corpo?.text || "");
  if (!transcricaoUtil(texto)) return { ok: false, falha: "vazio" };
  return { ok: true, texto };
}

export interface PedidoTranscricao {
  serverUrl: string;
  instancia: string;
  /** Token da instância — vem de `whatsapp_instancias`, nunca de env global. */
  token: string;
  mensagemId: string;
  chaveOpenai: string;
  /** Dono da carteira, descoberto pela instância no webhook — nunca vindo
      da requisição. Serve só para o gasto ter dono no painel de admin. */
  userId?: string | null;
}

/**
 * Baixa o áudio e devolve o que foi dito. Nunca lança.
 *
 * A soma das esperas do retry entra no tempo de resposta do webhook — ver
 * `esperaTranscricaoMs`, que por isso é curta.
 */
export async function transcreverAudio(p: PedidoTranscricao): Promise<ResultadoTranscricao> {
  if (!p.chaveOpenai || !p.serverUrl || !p.token) return { ok: false, falha: "nao-configurado" };

  const audio = await baixarAudio(p.serverUrl, p.instancia, p.token, p.mensagemId);
  if ("falha" in audio) return { ok: false, falha: audio.falha };

  let ultima: FalhaTranscricao = "falha-openai";
  for (let tentativa = 1; tentativa <= MAX_TENTATIVAS_TRANSCRICAO; tentativa++) {
    const espera = esperaTranscricaoMs(tentativa);
    if (espera > 0) await dormir(espera);

    const r = await transcreverUmaVez(audio.bytes, p.chaveOpenai, p.userId ?? null);
    if ("retentar" in r) {
      ultima = r.retentar;
      continue;
    }
    return r;
  }
  return { ok: false, falha: ultima };
}
