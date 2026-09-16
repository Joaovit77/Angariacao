/* ================================================================
   FERRAMENTAS DE ANGARIAÇÃO — fonte única
   As telas de captação (Garimpo em Campo, Avaliação Rápida, Central de
   Angariação, Investigador de Imóveis) ocupam UMA entrada no menu
   lateral, "Angariação", e são alternadas por uma faixa no topo da
   página (NavAngariacao). Sidebar, faixa e layout leem desta lista:
   ferramenta nova entra aqui (rota, texto, ícone) e aparece nos três.
   Não há condição/permissão por ferramenta — a única regra é a do
   shell inteiro (admin sem carteira), que vale para o grupo.
   ================================================================ */

export type Badge = "pipeline" | "agenda" | "respostas" | "radar";

export interface FerramentaAngariacao {
  rota: string;
  texto: string;
  icone: React.ReactNode;
  badge?: Badge;
}

/** Rota aberta ao clicar em "Angariação" no menu. */
export const ROTA_ANGARIACAO = "/garimpo-em-campo";

export const FERRAMENTAS_ANGARIACAO: FerramentaAngariacao[] = [
  {
    rota: "/garimpo-em-campo",
    texto: "Garimpo em Campo",
    icone: (
      <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M4 20V9l8-5 8 5v11" />
        <path d="M8 20v-6h8v6M3 20h18" />
        <path d="m16.5 5.5 1-2 1 2 2 .9-2 .9-1 2-1-2-2-.9z" />
      </svg>
    ),
  },
  {
    rota: "/avaliacao",
    texto: "Avaliação Rápida",
    icone: (
      <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M4 19V9M10 19V5M16 19v-7M22 19H2" />
        <path d="m3 6 5-3 5 4 7-5" />
      </svg>
    ),
  },
  {
    rota: "/central-angariacao",
    texto: "Central de Angariação",
    badge: "radar",
    icone: (
      <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="11" cy="11" r="7" />
        <path d="m16 16 5 5M11 7v8M7 11h8" />
      </svg>
    ),
  },
  {
    rota: "/investigador-imoveis",
    texto: "Investigador de Imóveis",
    icone: (
      <svg className="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="10.5" cy="10.5" r="6.5" />
        <path d="m15.5 15.5 5 5M10.5 7.5v6M7.5 10.5h6" />
      </svg>
    ),
  },
];

/** Mesma regra de "ativo" da barra lateral: rota igual ou subrota
    (cobre `/garimpo-em-campo/catalogo`). */
export function rotaCorresponde(pathname: string, rota: string) {
  return pathname === rota || pathname.startsWith(`${rota}/`);
}

/** A ferramenta dona do pathname atual, ou null fora da área. */
export function ferramentaAtiva(pathname: string): FerramentaAngariacao | null {
  return FERRAMENTAS_ANGARIACAO.find((f) => rotaCorresponde(pathname, f.rota)) ?? null;
}
