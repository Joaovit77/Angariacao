import { useState } from "react";
import { createRoot } from "react-dom/client";
import VendasView from "@/components/vendas/VendasView";
import { banco } from "./supabaseSintetico";
import "@/app/style.css";
import "./harness.css";
function Harness() {
  const [claro, setClaro] = useState(false);
  return <main className="harness-b1"><header className="harness-b1-controles"><strong>Smoke local · somente dados sintéticos</strong>
    <button className="btn btn-secondary" onClick={() => { setClaro(!claro); document.documentElement.dataset.tema = claro ? "escuro" : "claro"; }}>Tema {claro ? "escuro" : "claro"}</button>
    <button className="btn btn-secondary" onClick={() => { banco.estado.aposCommit = "timeout"; }}>Próximo: timeout após commit</button>
    <button className="btn btn-secondary" onClick={() => { banco.estado.proximoErro = "telefone-ja-cadastrado"; }}>Próximo: colisão</button>
    <button className="btn btn-secondary" onClick={() => { banco.estado.proximoErro = "falha-interna"; }}>Próximo: erro</button>
    <button className="btn btn-secondary" onClick={() => { banco.estado.aposCommit = "invalida"; }}>Próximo: resposta inválida</button>
  </header><VendasView /></main>;
}
createRoot(document.getElementById("root")!).render(<Harness />);
