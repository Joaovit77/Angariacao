import { useState } from "react";
import { createRoot } from "react-dom/client";
import SeletorImovelVenda, { type EstadoSeletorImovelVenda } from "@/components/vendas/SeletorImovelVenda";
import { imoveisSinteticosVenda } from "@/tests/fixtures/vendasB34bACatalogo";
import "@/app/style.css";
import "./harness.css";

const imoveis = imoveisSinteticosVenda();
const pronto: EstadoSeletorImovelVenda = { tipo: "pronto", imoveis };
function Harness() {
  const [estado, setEstado] = useState<EstadoSeletorImovelVenda>(pronto);
  const [selecionadoId, setSelecionadoId] = useState<string | null>(null);
  const [claro, setClaro] = useState(false);
  return (
    <main className="harness-vendas">
      <header><small>Harness local · dados sintéticos</small><h1>Consulta de imóveis</h1><p>B3.4b-A · seleção somente em memória</p></header>
      <div className="harness-vendas-controles">
        <button type="button" className="btn btn-secondary" onClick={() => { const valor = !claro; setClaro(valor); document.documentElement.dataset.tema = valor ? "claro" : "escuro"; }}>Tema {claro ? "escuro" : "claro"}</button>
        <button type="button" className="btn btn-secondary" onClick={() => setEstado(pronto)}>Catálogo</button>
        <button type="button" className="btn btn-secondary" onClick={() => setEstado({ tipo: "carregando" })}>Carregando</button>
        <button type="button" className="btn btn-secondary" onClick={() => setEstado({ tipo: "erro", erro: "transporte-indisponivel" })}>Erro</button>
        <button type="button" className="btn btn-secondary" onClick={() => setEstado({ tipo: "pronto", imoveis: [] })}>Vazio</button>
      </div>
      <SeletorImovelVenda estado={estado} selecionadoId={selecionadoId} onSelecionar={(i) => setSelecionadoId(i.id)} onTentarNovamente={() => setEstado(pronto)} />
    </main>
  );
}
createRoot(document.getElementById("root")!).render(<Harness />);
