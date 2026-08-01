/* ================================================================
   TEMA — escuro (padrão) e claro
   O app nasceu só escuro, com a paleta verde-floresta + dourado escrita
   direto no `:root` do style.css. Aqui essa paleta continua sendo o
   padrão: o tema claro é um SEGUNDO conjunto dos mesmos tokens, ligado
   por `data-tema="claro"` no <html>. Nenhuma regra de componente sabe
   qual tema está ativo — quem troca são as custom properties, num lugar
   só. Componente que precisa de cor fora do CSS (Chart.js, que pinta em
   canvas) lê o token computado; ver `inscreverTema`.

   A escolha é do DISPOSITIVO, não da conta: mora no localStorage, não em
   `user_config`. Tema é preferência de tela — o mesmo corretor quer
   escuro no monitor da imobiliária e claro no celular sob o sol —, e
   sincronizar pelo banco significaria esperar o login para saber com
   qual cor pintar a própria tela de login.

   Sem escolha salva, segue a preferência do SISTEMA. Quem aplica isso
   antes do primeiro quadro é o SCRIPT_TEMA (roda no <head>, antes do
   React); o `sincronizarTema` daqui é a rede — cobre o script bloqueado
   e mantém a janela acompanhando o sistema enquanto ninguém escolheu.
   ================================================================ */

export type Tema = "claro" | "escuro";

/** Chave no localStorage. Só existe depois de uma escolha EXPLÍCITA. */
export const CHAVE_TEMA = "angariacoes:tema";
/** Atributo no <html> que o CSS observa. */
export const ATRIBUTO_TEMA = "data-tema";

export function ehTema(valor: unknown): valor is Tema {
  return valor === "claro" || valor === "escuro";
}

/**
 * A decisão, isolada do DOM: escolha salva vence; sem ela, o sistema.
 * Valor salvo estranho (chave de outra versão, storage corrompido) cai no
 * padrão em vez de virar um `data-tema` que o CSS não conhece — o que
 * deixaria a tela sem paleta nenhuma.
 */
export function resolverTema(salvo: string | null, prefereClaro: boolean): Tema {
  if (ehTema(salvo)) return salvo;
  return prefereClaro ? "claro" : "escuro";
}

export function outroTema(tema: Tema): Tema {
  return tema === "claro" ? "escuro" : "claro";
}

/**
 * Script inline da página (ver app/layout.tsx). Aplica a ESCOLHA do
 * corretor o quanto antes — só ela, porque a preferência do sistema já é
 * resolvida pelo próprio CSS (`@media (prefers-color-scheme: light)` no
 * style.css), que pinta certo no primeiro quadro sem depender de JS.
 * Dividir assim tem uma consequência boa: o caso comum (ninguém trocou
 * nada) não pisca em navegador nenhum, mesmo com JS lento ou desligado.
 *
 * Falha em silêncio de propósito — localStorage bloqueado (navegação
 * privativa, cookies de terceiros) não pode derrubar o carregamento do
 * app por causa de uma cor.
 */
export const SCRIPT_TEMA = `(function(){try{var s=localStorage.getItem(${JSON.stringify(CHAVE_TEMA)});if(s==="claro"||s==="escuro"){document.documentElement.setAttribute(${JSON.stringify(ATRIBUTO_TEMA)},s);}}catch(e){}})();`;

function raiz(): HTMLElement | null {
  return typeof document === "undefined" ? null : document.documentElement;
}

function lerSalvo(): string | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage.getItem(CHAVE_TEMA);
  } catch {
    return null;
  }
}

function prefereClaro(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-color-scheme: light)").matches
  );
}

/** O tema em vigor. A fonte de verdade é o <html>, que o script já marcou. */
export function temaAtual(): Tema {
  const marcado = raiz()?.getAttribute(ATRIBUTO_TEMA);
  if (ehTema(marcado)) return marcado;
  return resolverTema(lerSalvo(), prefereClaro());
}

type Ouvinte = (tema: Tema) => void;
const ouvintes = new Set<Ouvinte>();

/**
 * Avisa quem pinta fora do CSS. Hoje é o Chart.js: o canvas guarda a cor
 * que recebeu, então mudar o token não repinta um gráfico já desenhado.
 */
export function inscreverTema(ouvinte: Ouvinte): () => void {
  ouvintes.add(ouvinte);
  return () => {
    ouvintes.delete(ouvinte);
  };
}

/**
 * `persistir: false` para a aplicação automática (script/sistema) — só o
 * clique do corretor grava. Sem essa distinção, a primeira visita
 * congelaria o palpite inicial como se fosse escolha, e a janela pararia
 * de acompanhar o sistema.
 */
export function aplicarTema(tema: Tema, persistir = true): void {
  const el = raiz();
  if (!el) return;
  el.setAttribute(ATRIBUTO_TEMA, tema);
  if (persistir) {
    try {
      localStorage.setItem(CHAVE_TEMA, tema);
    } catch {
      // Sem storage o tema vale só nesta aba — melhor que não trocar.
    }
  }
  ouvintes.forEach((ouvinte) => ouvinte(tema));
}

/** O clique do botão: inverte o que está em vigor e grava a escolha. */
export function alternarTema(): Tema {
  const proximo = outroTema(temaAtual());
  aplicarTema(proximo, true);
  return proximo;
}

/**
 * Rede de segurança montada no layout raiz. Reaplica o tema (caso o
 * script do <head> não tenha rodado) e segue o sistema enquanto não
 * houver escolha explícita — o corretor que usa o modo automático do
 * Windows vê o painel virar junto, sem recarregar. Devolve o cleanup.
 */
export function sincronizarTema(): () => void {
  aplicarTema(temaAtual(), false);
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return () => {};
  const consulta = window.matchMedia("(prefers-color-scheme: light)");
  const aoMudar = (evento: MediaQueryListEvent) => {
    if (ehTema(lerSalvo())) return; // escolha do corretor vence o sistema
    aplicarTema(evento.matches ? "claro" : "escuro", false);
  };
  consulta.addEventListener("change", aoMudar);
  return () => consulta.removeEventListener("change", aoMudar);
}
