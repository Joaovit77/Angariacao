import type { ContextoAssistente } from "./tipos";
import type { ModalAtivo } from "@/lib/uiModal";

const PAGINAS: Record<string, string> = {
  "/inicio": "Inicio",
  "/pipeline": "Pipeline",
  "/agenda": "Agenda",
  "/insights": "Insights",
  "/configuracoes": "Configuracoes",
  "/central-angariacao": "Central de Angariacao",
  "/admin": "Administracao",
};

export function montarContextoAssistente(
  rota: string,
  drawerImovelId: string | null,
  modal: ModalAtivo | null,
): ContextoAssistente {
  const base: ContextoAssistente = { rota, pagina: PAGINAS[rota] || "Angariacao", superficie: "pagina" };
  if ((modal?.tipo === "agenda" || modal?.tipo === "verificacao") && modal.id) {
    return {
      ...base,
      superficie: "modal",
      entidade: { tipo: "agenda", id: modal.id },
    };
  }
  if (modal?.imovelIdRelacionado) {
    return { ...base, superficie: "modal", entidade: { tipo: "imovel", id: modal.imovelIdRelacionado } };
  }
  const modaisDeImovel = new Set(["imovel", "whatsapp", "notas", "tentativas", "desdobrar", "solicitacaoAngariacao", "gerarAnuncio"]);
  if (modal?.id && modaisDeImovel.has(modal.tipo)) {
    return { ...base, superficie: "modal", entidade: { tipo: "imovel", id: modal.id } };
  }
  if (rota === "/pipeline" && drawerImovelId) {
    return { ...base, superficie: "drawer", entidade: { tipo: "imovel", id: drawerImovelId } };
  }
  return base;
}
