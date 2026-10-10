import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import Assistente from "@/components/assistente/Assistente";
import { AssistenteProvider } from "@/components/assistente/AssistenteProvider";
import ModalOverlay from "@/components/modais/ModalOverlay";
import VendasView from "@/components/vendas/VendasView";
import { useAssistenteFlutuanteAtivo } from "@/lib/assistente/preferenciaFlutuante";
import { useAppStore } from "@/lib/store";
import { useUiModal } from "@/lib/uiModal";
import { concluirConsultaSintetica } from "./clienteFalso";
import "@/app/style.css";

// O harness não carrega env nem permite transporte HTTP de serviços reais.
window.fetch = () => { throw new Error("Rede real proibida neste harness."); };
useAppStore.getState().setIaDisponivel(true);

function Harness() {
  const [ativo, definirAtivo] = useAssistenteFlutuanteAtivo();
  return <AssistenteProvider>
    <div className="app-shell"><main className="main">
      <p>Smoke local · somente dados sintéticos · Strict Mode</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 20 }}>
        <button type="button" className="btn" onClick={() => definirAtivo(!ativo)}>Flutuante {ativo ? "ativado" : "desativado"}</button>
        <button type="button" className="btn" onClick={() => useUiModal.getState().abrirModal("meta")}>Abrir metas compartilhadas</button>
        <button type="button" className="btn" onClick={concluirConsultaSintetica}>Concluir consulta sintética</button>
      </div>
      <div className="view-anim"><VendasView /></div>
    </main></div>
    <ModalOverlay />
    <Assistente />
  </AssistenteProvider>;
}
createRoot(document.getElementById("root")!).render(<StrictMode><Harness /></StrictMode>);
