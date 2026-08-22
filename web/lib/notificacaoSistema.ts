"use client";

/* ================================================================
   NOTIFICAÇÃO DO SISTEMA (a caixinha do Windows/macOS)

   A outra metade do aviso de resposta. Com a aba VISÍVEL quem avisa é
   o toast — interromper com uma notificação de sistema quem já está
   olhando a tela é ruído. Com a aba oculta o toast não serve para
   nada: ele nasce, some em 2,6s e ninguém viu. É aí que entra isto.

   Alcance, para não prometer o que não entrega: isto exige o painel
   ABERTO em alguma aba. Fechou o navegador, não chega — para isso
   seria preciso Web Push (service worker + chave VAPID + tabela de
   inscrições + o webhook disparando), que é outro tamanho de obra e
   em boa parte redundante: a mensagem já faz o celular da imobiliária
   apitar pelo próprio WhatsApp. O que o painel acrescenta é o
   CONTEXTO — de qual imóvel é e o que fazer —, e isso só tem valor
   com o painel à mão.

   A permissão do navegador é a ÚNICA preferência. Guardar um
   "quero/não quero" nosso em localStorage criaria uma segunda fonte
   de verdade que sai de sincronia com a primeira — o clássico
   "desliguei e continua chegando" (ou pior, "liguei e não chega",
   porque o navegador nega por baixo). Quem quiser parar revoga no
   cadeado da barra de endereço, que é onde a pessoa já procura.
   ================================================================ */

export type PermissaoAviso = "indisponivel" | "default" | "granted" | "denied";

/** Snapshot do SERVIDOR para o useSyncExternalStore: no SSR não existe
    `Notification`, e assumir "indisponivel" faz o botão de ativar nascer
    escondido e aparecer na hidratação — nunca o contrário, que seria um
    botão piscando para quem já concedeu a permissão. */
export const PERMISSAO_NO_SERVIDOR: PermissaoAviso = "indisponivel";

const ouvintes = new Set<() => void>();

function suportado(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

/** Inscreve quem precisa re-renderizar quando a permissão muda (o sino). */
export function assinarPermissao(cb: () => void): () => void {
  ouvintes.add(cb);
  return () => {
    ouvintes.delete(cb);
  };
}

export function lerPermissao(): PermissaoAviso {
  if (!suportado()) return "indisponivel";
  return Notification.permission as PermissaoAviso;
}

/**
 * Pede a permissão ao navegador.
 *
 * Só pode ser chamada a partir de um clique. Navegador moderno ignora (ou
 * nega de vez) pedido automático no carregamento da página — e "negado" é
 * caro: some o botão e a pessoa precisa mexer nas configurações do site para
 * voltar atrás. Por isso quem chama é o botão do sino, nunca um efeito.
 */
export async function pedirPermissaoAviso(): Promise<PermissaoAviso> {
  if (!suportado()) return "indisponivel";
  try {
    const resposta = (await Notification.requestPermission()) as PermissaoAviso;
    ouvintes.forEach((cb) => cb());
    return resposta;
  } catch {
    // Safari antigo expõe a versão por callback e rejeita a forma com Promise.
    return lerPermissao();
  }
}

export interface AvisoSistema {
  titulo: string;
  corpo: string;
  /** Agrupador: notificação nova com a mesma tag SUBSTITUI a anterior em vez
      de empilhar. Usamos o id do imóvel — o proprietário que manda cinco
      mensagens seguidas deve ocupar uma caixinha só, não cinco. */
  tag: string;
  /** Clique na notificação: traz a janela para a frente e leva à caixa. */
  aoClicar?: () => void;
}

/**
 * Mostra a notificação. Devolve false quando não deu (sem suporte, sem
 * permissão) para quem chamou poder cair no toast.
 *
 * Nunca joga: notificação é conveniência, e uma exceção aqui não pode
 * derrubar a sincronização que acabou de receber a mensagem.
 */
export function notificarSistema(aviso: AvisoSistema): boolean {
  if (lerPermissao() !== "granted") return false;
  try {
    const n = new Notification(aviso.titulo, {
      body: aviso.corpo,
      tag: aviso.tag,
      icon: "/logo-angariacao-claro.png",
    });
    n.onclick = () => {
      window.focus();
      aviso.aoClicar?.();
      n.close();
    };
    return true;
  } catch {
    return false;
  }
}
