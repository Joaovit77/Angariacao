"use client";

/* ================================================================
   INDICADOR DO FOLLOW-UP EM LOTE
   A peça que torna o envio em segundo plano utilizável: enquanto a
   fila roda, ela aparece fixa no canto e acompanha o corretor por
   todas as views. Sem isso o lote seria invisível — dez minutos de
   mensagens saindo sem nada na tela dizendo que estão saindo.

   Fica montado no layout do painel (irmão do <main>), não dentro de
   uma view, senão trocar de tela o desmontaria.

   O aviso de saída é o contraponto honesto do "pode fechar o modal":
   a fila vive no processo da aba, então recarregar ou fechar a página
   interrompe o que falta. Navegar entre views é seguro — o store
   sobrevive à navegação do App Router.
   ================================================================ */
import { useEffect } from "react";
import { useFilaFollowUp } from "@/lib/filaFollowUp";

export default function IndicadorFollowUp() {
  const { itens, indice, enviados, falhas, rodando, cancelar } = useFilaFollowUp();

  useEffect(() => {
    if (!rodando) return;
    const aoSair = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", aoSair);
    return () => window.removeEventListener("beforeunload", aoSair);
  }, [rodando]);

  if (!rodando || itens.length === 0) return null;

  const total = itens.length;
  // `indice` é quantos já saíram; o que está em voo é o próximo.
  const atual = Math.min(indice + 1, total);
  const pct = Math.round((indice / total) * 100);
  const emVoo = itens[indice];

  return (
    <div className="followup-indicador" role="status" aria-live="polite">
      <div className="followup-indicador-topo">
        <strong>
          Enviando {atual} de {total}
        </strong>
        <button type="button" className="btn btn-sm" onClick={cancelar}>
          Cancelar
        </button>
      </div>

      <div className="followup-barra" aria-hidden>
        <div className="followup-barra-preenchida" style={{ width: `${pct}%` }} />
      </div>

      {emVoo && <div className="followup-indicador-alvo">{emVoo.rotulo}</div>}

      <div className="followup-indicador-rodape">
        {enviados === 1 ? "1 enviada" : `${enviados} enviadas`}
        {falhas.length > 0 && (falhas.length === 1 ? " · 1 falhou" : ` · ${falhas.length} falharam`)}
        {" · intervalo de alguns minutos entre as mensagens"}
      </div>
    </div>
  );
}
