"use client";

import { useState } from "react";
import MensagensAgendadasView from "@/components/mensagens/MensagensAgendadasView";
import RespostasView from "@/components/respostas/RespostasView";

export default function ConversasView() {
  const [aba, setAba] = useState<"respostas" | "agendadas">("respostas");
  return <>
    <div className="conversas-cabecalho">
      <h1 className="page-title">Conversas</h1>
      <p className="page-sub">Respostas recebidas e mensagens programadas para proprietários</p>
      <div className="resp-filtros conversas-abas">
        <button type="button" className={`resp-filtro${aba === "respostas" ? " active" : ""}`} onClick={() => setAba("respostas")}>Respostas recebidas</button>
        <button type="button" className={`resp-filtro${aba === "agendadas" ? " active" : ""}`} onClick={() => setAba("agendadas")}>Mensagens agendadas</button>
      </div>
    </div>
    {aba === "respostas" ? <RespostasView /> : <MensagensAgendadasView incorporada />}
  </>;
}
