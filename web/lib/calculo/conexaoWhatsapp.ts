/* ================================================================
   A CONEXÃO DO WHATSAPP — as partes puras

   Mesmo papel de `calculo/whatsapp.ts` para o envio: o vocabulário de
   estado e as frases, num lugar só, para cliente e servidor
   concordarem. Sem SDK, sem fetch, testável puro.

   POR QUE ISTO EXISTE. O número de WhatsApp do corretor cai — a sessão
   do WhatsApp Web expira, o celular fica dias sem internet, alguém
   desconecta o aparelho pareado. Até aqui, quando isso acontecia:

     1. o corretor não sabia;
     2. descobria no meio de um lote, pelo toast de falha;
     3. e a única saída era alguém com acesso ao painel da Evolution
        ler o QR Code por ele.

   O passo 3 é o que trava a operação com mais de um corretor: ler o QR
   exige entrar num painel de infraestrutura que ele não pode (nem
   deve) acessar, porque lá estão as instâncias de todo mundo.

   A DECISÃO QUE DÁ FORMA A ESTE MÓDULO: **ver e reconectar o próprio
   número não precisa da global api key.** Criar e apagar instância
   precisa — e isso continua fora do app, com quem opera. O corretor
   só consegue perguntar o estado da instância DELE e pedir o QR dela,
   com o token daquela instância, que já vive em `whatsapp_instancias`
   e já é lido pela rota de envio. Nenhum poder novo entra no sistema.
   ================================================================ */

/** Estados que interessam à tela. O vocabulário é NOSSO, não o da
    Evolution: ela responde `open`/`close`/`connecting`, e traduzir na
    fronteira é o que impede a UI de depender do jeito que um
    fornecedor nomeia as coisas. */
export type EstadoConexao =
  | "conectado"
  // Instância existe, mas o WhatsApp não está pareado. É o caso que
  // pede QR — e o único em que a tela tem algo a oferecer.
  | "desconectado"
  // A Evolution está pareando (o QR foi lido e ela está subindo a
  // sessão). Distinto de "desconectado" porque aqui a ação certa é
  // ESPERAR, não ler outro QR.
  | "conectando"
  // Nenhuma linha em `whatsapp_instancias`: conta nova que ninguém
  // terminou de configurar. Quem resolve é o admin, não o corretor —
  // por isso a mensagem manda falar com o responsável em vez de
  // oferecer um QR que não existe.
  | "sem-instancia"
  // O ambiente não tem Evolution configurada (EVOLUTION_SERVER_URL).
  | "nao-configurado"
  // A Evolution não respondeu, ou recusou o token.
  | "falha";

export interface Conexao {
  estado: EstadoConexao;
  /** QR em data URI, só quando `estado === "desconectado"`. */
  qr?: string | null;
  /** Número pareado, quando conectado. Sem máscara: é o número DELE. */
  numero?: string | null;
}

/** Traduz o estado cru da Evolution para o nosso vocabulário.

    `open` é o único que significa "funcionando". Tudo que não for
    reconhecido cai em `desconectado`, e não em `falha`: um estado novo
    que a Evolution invente é, na prática, "não está pronto para
    enviar" — e a ação certa para o corretor continua sendo tentar
    reconectar, não abrir um chamado. */
export function traduzirEstado(bruto: string | null | undefined): EstadoConexao {
  const s = (bruto || "").toLowerCase();
  if (s === "open") return "conectado";
  if (s === "connecting") return "conectando";
  return "desconectado";
}

const MENSAGENS: Record<EstadoConexao, string> = {
  conectado: "Seu WhatsApp está conectado e pronto para enviar.",
  desconectado:
    "Seu WhatsApp está desconectado. Leia o código abaixo com o celular para reconectar — nenhuma mensagem sai enquanto isso.",
  conectando: "Conectando… aguarde alguns segundos sem fechar esta janela.",
  "sem-instancia":
    "Sua conta ainda não tem um número de WhatsApp configurado. Fale com o responsável pelo sistema.",
  "nao-configurado": "O envio direto de WhatsApp não está configurado neste ambiente.",
  falha: "Não foi possível falar com o servidor de WhatsApp agora. Tente de novo em instantes.",
};

export function mensagemConexao(estado: EstadoConexao): string {
  return MENSAGENS[estado];
}

/** Vale mostrar QR? Só faz sentido desconectado — e só se ele veio.

    Em `conectando` o QR já foi lido: exibir outro faria o corretor
    escanear de novo justamente quando a sessão está subindo, e o
    segundo pareamento derruba o primeiro. */
export function deveMostrarQr(estado: EstadoConexao, qr: string | null | undefined): boolean {
  return estado === "desconectado" && !!qr;
}

/**
 * De quanto em quanto tempo perguntar o estado enquanto a tela está
 * aberta.
 *
 * Desconectado é o único momento em que a resposta muda a qualquer
 * segundo (o corretor está com o celular na mão, escaneando), então é
 * ali que a consulta é rápida. Conectado, a tela só está confirmando
 * algo que já vale — e cada consulta é uma chamada à Evolution, que é
 * a mesma instância que precisa estar livre para mandar mensagem.
 *
 * Zero = não repetir: sem instância ou sem ambiente, nada vai mudar
 * por insistir.
 */
export function intervaloConsultaMs(estado: EstadoConexao): number {
  switch (estado) {
    case "desconectado":
    case "conectando":
      return 3000;
    case "conectado":
      return 15000;
    default:
      return 0;
  }
}

/**
 * O QR da Evolution vira `src` de <img>.
 *
 * Ela às vezes devolve o base64 já com o prefixo `data:image/png;base64,`
 * e às vezes só os bytes — depende da versão e do endpoint. Normalizar
 * aqui é o que evita a imagem quebrada que só aparece em produção.
 *
 * Devolve null para vazio: `<img src="">` dispara uma requisição à
 * própria página e polui o console com erro.
 */
export function qrParaImagem(bruto: string | null | undefined): string | null {
  const s = (bruto || "").trim();
  if (!s) return null;
  return s.startsWith("data:") ? s : `data:image/png;base64,${s}`;
}
