import { useState } from "react";
import { createRoot } from "react-dom/client";
import InvestigadorImoveisView from "@/components/investigador/InvestigadorImoveisView";
import { definirCenario, type CenarioInvestigador } from "./investigadorFalso";
import "@/app/style.css";
import "./harness.css";

const CENARIOS: { id: CenarioInvestigador; rotulo: string }[] = [
  { id: "0-10", rotulo: "0 confirmados / 10 não confirmados" },
  { id: "1-9", rotulo: "1 confirmado / 9 não confirmados" },
  { id: "3-0", rotulo: "3 confirmados / 0 não confirmados" },
  { id: "vazio", rotulo: "0 resultados" },
];

function Harness() {
  const [cenario, setCenario] = useState<CenarioInvestigador>("0-10");
  const [claro, setClaro] = useState(false);
  definirCenario(cenario);
  return (
    <main className="harness-inv">
      <header><small>Harness local · dados sintéticos · sem rede</small><h1>Investigador de Imóveis · INV-Q1</h1></header>
      <div className="harness-inv-controles">
        <button type="button" className="btn" onClick={() => { const valor = !claro; setClaro(valor); document.documentElement.dataset.tema = valor ? "claro" : "escuro"; }}>
          Tema {claro ? "escuro" : "claro"}
        </button>
        {CENARIOS.map((item) => (
          <button key={item.id} type="button" className="btn" aria-pressed={cenario === item.id} onClick={() => setCenario(item.id)}>
            {item.rotulo}
          </button>
        ))}
      </div>
      <InvestigadorImoveisView referenciaInicial={{ origem: "imovel", id: "00000000-0000-4000-8000-000000000001" }} />
    </main>
  );
}

createRoot(document.getElementById("root")!).render(<Harness />);
