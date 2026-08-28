"use client";

import { useState } from "react";
import MensagensAgendadasView from "@/components/mensagens/MensagensAgendadasView";
import CentralMensagensView from "@/components/respostas/CentralMensagensView";

export default function ConversasView({ imovelInicial = null }: { imovelInicial?: string | null }) {
  const [aba, setAba] = useState<"conversas" | "agendadas">("conversas");
  if (aba === "conversas") {
    return (
      <CentralMensagensView
        imovelInicial={imovelInicial}
        aoAbrirAgendadas={() => setAba("agendadas")}
      />
    );
  }

  return (
    <div className="mensagens-agendadas-pagina">
      <button type="button" className="btn btn-sm" onClick={() => setAba("conversas")}>
        ← Voltar para mensagens
      </button>
      <MensagensAgendadasView incorporada />
    </div>
  );
}
