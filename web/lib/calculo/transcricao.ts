/* ================================================================
   TRANSCRIÇÃO DE ÁUDIO — parte pura
   Feature nova da pós-migração (sem oráculo do app antigo).

   O proprietário responde por ÁUDIO com frequência, e o painel era
   cego para isso: o webhook grava `[áudio]` (ver `SEM_TEXTO` em
   webhookWhatsapp.ts) porque um "(vazio)" faria o corretor achar que o
   sistema falhou. Honesto, mas ilegível — e `ehSoMidia`, em notas.ts,
   ainda os tira das pendências da caixa de respostas, justamente
   porque não há o que ler.

   Na carteira real de 31/07/2026 isso era **43 de 149 respostas** —
   quase uma em cada três, e 20 delas num imóvel só.

   ## Isto foi MEDIDO antes de ser construído

   É a exigência que o próprio projeto se impôs depois de a leitura de
   placa por FOTO ser construída, usada e removida por reprovar em campo
   (ver "Garimpo automatizado" no CLAUDE.md): "precisa de MEDIÇÃO antes
   — N casos reais, gabarito, taxa de acerto anotada; trocar de modelo e
   torcer não conta".

   Os 43 áudios reais foram transcritos antes de existir uma linha
   desta feature. Resultado: **41 transcritos**, 43 de 43 ainda
   disponíveis na Evolution, ~1,1 s por áudio, mediana de 332
   caracteres. E o conteúdo decidia negócio — um imóvel em "Novo
   contato" cujo áudio dizia "vai desocupar esse mês, está disponível",
   e uma negociação inteira de contrato (prazo, condomínio, multa) que
   a tela mostrava como colchete vazio.

   ## As duas decisões que a medição tomou

   **1. Transcreve ANTES de gravar a nota, não depois.** A intenção
   original era `after()` — responder rápido à Evolution e transcrever
   fora do caminho. A medição desfez isso: 1,1 s de mediana cabe folgado
   no webhook, e transcrever antes faz TODO o resto da rota enxergar o
   conteúdo real — a classificação da IA, o encerramento automático e o
   compromisso da agenda. Com `after()`, um "já aluguei" gravado em
   áudio não encerraria o registro e um "pode quinta às 10h" não viraria
   compromisso, porque essas decisões já teriam rodado sobre `[áudio]`.
   O custo de errar para este lado é uma requisição mais lenta; para o
   outro, é perder o desfecho. E a demora é segura: se a Evolution
   reentregar por timeout, `registrar_nota_whatsapp` recusa a duplicata
   — a trava já existe e é a mesma de sempre.

   **2. Retry não é polimento, é requisito.** Das 43, 11 falharam com
   HTTP 403 `model_not_found` — e 9 delas passaram na segunda tentativa,
   mesma chave e mesmo modelo. É limite de taxa se disfarçando de erro
   de permissão. Sem retry, perde-se ~1 em cada 4 áudios.

   ## O que ela NÃO faz

   Não transcreve vídeo nem documento: o áudio é o caso que responde por
   quase toda a mídia recebida e o único em que o conteúdo é fala do
   proprietário. Foto é quase sempre do imóvel, e descrevê-la seria o
   caminho de VISÃO que já foi medido e reprovado.

   Puro: só tipos e constantes. Sem React/Next/Supabase/store/SDK.
   ================================================================ */

/** `messageType` da Evolution que carrega fala do proprietário.
    `pttMessage` é o "push to talk" — o áudio gravado na hora, que é a
    forma esmagadoramente mais comum; `audioMessage` é o arquivo anexado. */
export const TIPOS_AUDIO: readonly string[] = ["audioMessage", "pttMessage"];

export function ehAudio(tipo: string | null | undefined): boolean {
  return TIPOS_AUDIO.includes((tipo || "").trim());
}

/**
 * Teto do áudio que vale a pena transcrever.
 *
 * Medido: o maior dos 43 tinha 219 KB (~2 min de fala). 5 MB dá folga de mais
 * de uma ordem de grandeza e ainda protege contra o caso patológico — um
 * arquivo de música encaminhado, que custaria caro e não diria nada sobre
 * captação. Acima disso a nota cai no `[áudio]` de sempre.
 */
export const MAX_BYTES_AUDIO = 5 * 1024 * 1024;

/**
 * Quanto se espera pela transcrição antes de desistir e gravar `[áudio]`.
 *
 * Medido: 1,1 s de mediana, 2,7 s no maior. 20 s é teto de desastre, não de
 * operação normal — e a degradação é exatamente o comportamento de hoje.
 */
export const TIMEOUT_TRANSCRICAO_MS = 20_000;

/** Tentativas no total (1 original + 2 retentativas). Com 9 de 11 falhas
    virando sucesso na SEGUNDA, três dá margem sem esticar a requisição. */
export const MAX_TENTATIVAS_TRANSCRICAO = 3;

/**
 * Espera antes da tentativa `n` (1-based: a 1ª não espera).
 *
 * Progressão curta de propósito — isto roda DENTRO do webhook, então a soma
 * das esperas entra no tempo de resposta: 0 + 1,5 s + 3 s. Backoff generoso
 * aqui não protegeria nada e faria a Evolution reentregar.
 */
export function esperaTranscricaoMs(tentativa: number): number {
  if (tentativa <= 1) return 0;
  return 1500 * Math.pow(2, tentativa - 2);
}

/** Vocabulário de falhas — mesma ideia do `FalhaEnvio` do WhatsApp e do
    `FalhaIa`: cliente e servidor concordando no que deu errado. */
export type FalhaTranscricao =
  | "nao-configurado"
  | "sem-midia"
  | "audio-grande-demais"
  | "limite-de-taxa"
  | "falha-openai"
  | "sem-conexao"
  | "vazio";

/**
 * O texto ficou útil?
 *
 * A transcrição de um áudio de 1 segundo (o "tá" solto, o toque acidental no
 * botão) volta vazia ou com pontuação só. Gravar isso como resposta seria pior
 * que `[áudio]`: a caixa passaria a cobrar leitura de uma nota sem conteúdo, e
 * o corretor perderia a informação de que existe um áudio ali para ouvir.
 */
export function transcricaoUtil(texto: string | null | undefined): boolean {
  return /\p{L}/u.test((texto || "").trim());
}

/** Limpa a transcrição para virar corpo de nota. O corte por tamanho continua
    sendo de `notaDaResposta` (MAX_TEXTO_NOTA), que vale para toda resposta. */
export function normalizarTranscricao(texto: string): string {
  return texto.replace(/\s+/g, " ").trim();
}
