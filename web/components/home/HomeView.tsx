"use client";

/* ================================================================
   VIEW: INÍCIO

   A Home responde uma pergunta só: o que fazer agora? Métricas, listas
   completas e análises ficam nas telas próprias. Aqui entram somente a
   próxima ação individual, as ferramentas assistidas que pedem uma rodada
   hoje e os três atalhos de criação mais usados.
   ================================================================ */
import PlanoExecucao from "@/components/home/PlanoExecucao";
import PanoramaDoDia from "@/components/home/PanoramaDoDia";
import RodadaDoDia from "@/components/home/RodadaDoDia";
import AtivacaoInicial from "@/components/home/AtivacaoInicial";
import { estadoAtivacao } from "@/lib/calculo/ativacao";
import { currentMonthKey } from "@/lib/datas";
import { useAppStore } from "@/lib/store";
import { useUiModal } from "@/lib/uiModal";

export default function HomeView() {
  const abrirModal = useUiModal((s) => s.abrirModal);
  const imoveis = useAppStore((s) => s.imoveis);
  const agenda = useAppStore((s) => s.agenda);
  const metas = useAppStore((s) => s.metas);
  const ativacao = estadoAtivacao({ imoveis, agenda, metas, mesAtual: currentMonthKey() });
  const contaVazia = ativacao.estado === "vazia";
  const imovelAlvo = imoveis.find((imovel) => !imovel.tentativas?.length) ?? imoveis[0];

  return (
    <div className="home-enxuta">
      <div className="page-head">
        <div>
          <h1 className="home-question">O que preciso fazer agora?</h1>
          <p className="page-sub">Uma ação de cada vez. O restante está organizado no menu.</p>
        </div>
      </div>

      <div className="home-grid home-grid-enxuta anim-stagger">
        <AtivacaoInicial ativacao={ativacao} imovelAlvoId={imovelAlvo?.id} />

        {!contaVazia && (
          <>
            <div className="home-execution">
              <PlanoExecucao />
            </div>

            <div className="home-priority">
              <RodadaDoDia />
            </div>

            <PanoramaDoDia />

            <div className="home-actions" aria-label="Atalhos rápidos">
              <button type="button" className="home-action" onClick={() => abrirModal("preCadastro")}>
                <span className="home-action-ic" aria-hidden>⚡</span>
                <span className="home-action-text">
                  <span className="home-action-title">Pré-cadastro rápido</span>
                  <span className="home-action-sub">Cadastrar e confirmar pelo WhatsApp</span>
                </span>
              </button>
              <button type="button" className="home-action" onClick={() => abrirModal("imovel")}>
                <span className="home-action-ic" aria-hidden>⌂</span>
                <span className="home-action-text">
                  <span className="home-action-title">Nova angariação</span>
                  <span className="home-action-sub">Cadastrar um imóvel no funil</span>
                </span>
              </button>
              <button type="button" className="home-action" onClick={() => abrirModal("agenda")}>
                <span className="home-action-ic" aria-hidden>＋</span>
                <span className="home-action-text">
                  <span className="home-action-title">Novo compromisso</span>
                  <span className="home-action-sub">Agendar retorno, visita ou follow-up</span>
                </span>
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
