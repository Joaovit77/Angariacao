"use client";

/* A ordem vem do motor determinístico. A Home mostra somente a primeira
   ação; despejar a fila inteira aqui transforma prioridade em backlog. */
import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { focoInteligenteDoDia, type AcaoFoco, type TipoAcaoFoco } from "@/lib/calculo/focoDia";
import { todayISO } from "@/lib/datas";
import { useAppStore } from "@/lib/store";
import { useUiModal } from "@/lib/uiModal";

const ROTULO_TIPO: Record<TipoAcaoFoco, string> = {
  resposta: "Resposta pendente",
  atrasado: "Compromisso atrasado",
  hoje: "Compromisso de hoje",
  parado: "Imóvel sem movimento",
  prospeccao: "Prospecção",
};

function rotuloBotao(acao: AcaoFoco): string {
  if (acao.tipo === "parado" && acao.imovelId) return "Abrir imóvel";
  if (acao.destino === "/respostas") return "Abrir respostas";
  if (acao.destino === "/agenda") return "Abrir agenda";
  return "Abrir pipeline";
}

export default function PlanoExecucao() {
  const router = useRouter();
  const imoveis = useAppStore((s) => s.imoveis);
  const agenda = useAppStore((s) => s.agenda);
  const origensExtras = useAppStore((s) => s.config.origensExtras);
  const abrirModal = useUiModal((s) => s.abrirModal);

  const foco = useMemo(
    () => focoInteligenteDoDia(imoveis, agenda, origensExtras, todayISO()),
    [imoveis, agenda, origensExtras],
  );
  const principal = foco.acoes[0];

  if (!principal) return null;

  function abrirAcao(acao: AcaoFoco) {
    if (acao.tipo === "parado" && acao.imovelId) {
      abrirModal("imovel", acao.imovelId);
      return;
    }
    router.push(acao.destino);
  }

  return (
    <div className="card foco-card foco-card-enxuto">
      <div className="home-card-head">
        <div>
          <div className="card-title">Faça agora</div>
          <span className="section-note">{ROTULO_TIPO[principal.tipo]}</span>
        </div>
      </div>

      <div className="foco-principal">
        <div className="foco-principal-texto">
          <h3>{principal.titulo}</h3>
          <p>{principal.contexto}</p>
          <small>{principal.motivo}</small>
        </div>
        <button type="button" className="btn foco-principal-btn" onClick={() => abrirAcao(principal)}>
          {rotuloBotao(principal)} <span aria-hidden>→</span>
        </button>
      </div>
    </div>
  );
}
