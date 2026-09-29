/* Cliente da busca sob demanda. O token comprova a sessão; a rota fixa
   os hosts consultados, portanto o browser nunca escolhe uma URL arbitrária. */
import { fetchAutenticado } from "./auth/recuperacaoSessao";
import type { FiltrosCentralAngariacao, ResultadoBuscaCentral } from "./calculo/centralAngariacao";

export type IniciadorBuscaCentral = "pesquisar" | "verificar_agora" | "monitor_navegador";

/** Falha de autenticação da rota, separada de falha de portal: quem chama
    (o Radar) não pode contar uma consulta que nem chegou ao portal. */
export type FalhaAuthBuscaCentral = "sessao-invalida" | "auth-indisponivel" | "erro-auth";

export type ResultadoBuscaComExecucao = ResultadoBuscaCentral & {
  execucaoId?: string;
  falhaAuth?: FalhaAuthBuscaCentral;
};

const FALHAS_AUTH: readonly string[] = ["sessao-invalida", "auth-indisponivel", "erro-auth"];

function falhaAuthDaResposta(erro: unknown): FalhaAuthBuscaCentral | undefined {
  return typeof erro === "string" && FALHAS_AUTH.includes(erro) ? erro as FalhaAuthBuscaCentral : undefined;
}

export async function buscarNaCentral(
  filtros: FiltrosCentralAngariacao,
  iniciador: IniciadorBuscaCentral = "pesquisar",
): Promise<ResultadoBuscaComExecucao> {
  try {
    // POST não é repetível: a busca coleta, grava comparáveis e observabilidade.
    // Um 401 passa pela recuperação de sessão, mas nunca refaz a consulta.
    const resposta = await fetchAutenticado("/api/central-angariacao/buscar", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-angario-iniciador": iniciador,
      },
      body: JSON.stringify(filtros),
    }, { repetivel: false });
    if (!resposta) {
      return {
        ok: false,
        anuncios: [],
        urlPesquisa: "",
        aviso: "Sua sessão expirou. Entre novamente.",
        falhaAuth: "sessao-invalida",
      };
    }
    const dados = (await resposta.json().catch(() => null)) as (ResultadoBuscaComExecucao & { erro?: unknown }) | null;
    if (dados) {
      const { erro, ...resultado } = dados;
      const falhaAuth = falhaAuthDaResposta(erro);
      return falhaAuth ? { ...resultado, falhaAuth } : resultado;
    }
  } catch {
    /* mensagem uniforme abaixo */
  }
  return {
    ok: false,
    anuncios: [],
    urlPesquisa: "",
    aviso: "Não foi possível consultar o portal agora.",
  };
}
