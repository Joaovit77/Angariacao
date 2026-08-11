"use client";

/* ================================================================
   CARD: A RODADA DE HOJE (Início)
   O gatilho que faltava. Toda a maquinaria de lote já existia, mas
   morava no Pipeline — atrás de um clique, numa tela que se abre para
   procurar um imóvel, não para começar o dia. A fila crescia sem que
   nada dissesse o tamanho dela (ver o cabeçalho de calculo/rodadaDia.ts:
   82 proprietários esperando a segunda mensagem em 31/07/2026, contra
   18 que já a receberam na história inteira).

   Aqui não há regra de negócio: a ordem, os números e o texto de cada
   linha vêm prontos do cálculo puro. O componente só escolhe o ícone e
   liga cada frente à ferramenta que já a resolve — nenhum fluxo novo,
   nenhum modal novo.

   Com o dia limpo o card não renderiza. Um "nada pendente" ocupando o
   topo da tela é o mesmo desperdício que o QuemEstaQuente evita.
   ================================================================ */
import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { type FrenteRodada, rodadaDoDia } from "@/lib/calculo/rodadaDia";
import { todayISO } from "@/lib/datas";
import { useAppStore } from "@/lib/store";
import { useUiModal } from "@/lib/uiModal";

/** Ícone por frente. Os mesmos do Pipeline de propósito: é para lá que
    boa parte das linhas leva, e trocar o símbolo no meio do caminho faria
    parecer outra ferramenta. */
const ICONE: Record<FrenteRodada, string> = {
  respostas: "💬",
  compromissos: "📅",
  followup: "📣",
  disponibilidade: "🏠",
  resultados: "❓",
};

/** O verbo do botão. Frente que abre lote diz "Enviar"; frente que só
    leva para uma tela diz "Abrir" — a diferença importa, porque uma
    dispara mensagem para gente de verdade. */
const ACAO: Record<FrenteRodada, string> = {
  respostas: "Abrir caixa",
  compromissos: "Ver agenda",
  followup: "Enviar follow-up",
  disponibilidade: "Confirmar",
  resultados: "Confirmar",
};

export default function RodadaDoDia() {
  const router = useRouter();
  const imoveis = useAppStore((s) => s.imoveis);
  const agenda = useAppStore((s) => s.agenda);
  const abordagens = useAppStore((s) => s.abordagens);
  const abrirModal = useUiModal((s) => s.abrirModal);

  const hoje = todayISO();
  // Quatro varreduras da carteira inteira (follow-up, disponibilidade, caixa
  // de respostas, resultados pendentes). Memoiza para não repetir a cada
  // render da Home — que remonta a cada abertura de modal.
  const rodada = useMemo(
    () => rodadaDoDia(imoveis, agenda, abordagens, hoje),
    [imoveis, agenda, abordagens, hoje],
  );

  if (rodada.vazia) return null;

  const executar = (frente: FrenteRodada) => {
    if (frente === "respostas") return router.push("/respostas");
    if (frente === "compromissos") return router.push("/agenda");
    if (frente === "followup") return abrirModal("followUpLote");
    if (frente === "disponibilidade") return abrirModal("confirmarDisponibilidade");
    return abrirModal("resultadosPendentes");
  };

  return (
    <div className="card rodada">
      <div className="home-card-head">
        <div className="card-title">A rodada de hoje</div>
        {/* O que já saiu hoje. Este número só existia dentro do modal do
            lote, ou seja: só depois de abrir a ferramenta para descobrir
            que a cota já tinha acabado. */}
        {rodada.enviadosHoje > 0 && (
          <span className="section-note">
            {rodada.enviadosHoje} já {rodada.enviadosHoje === 1 ? "enviada" : "enviadas"} hoje ·{" "}
            {rodada.vagasRestantes} {rodada.vagasRestantes === 1 ? "vaga" : "vagas"}
          </span>
        )}
      </div>

      <div className="rodada-lista">
        {rodada.itens.map((item) => {
          const [detalhePrincipal, detalheRitmo] = item.detalhe.split(" · ", 2);
          return (
          <div className={`rodada-item ${item.urgencia}`} key={item.frente}>
            <span className="rodada-ic" aria-hidden>
              {ICONE[item.frente]}
            </span>
            <span className="rodada-texto">
              <span className="rodada-rotulo">
                {item.rotulo}
                <span className="rodada-contagem">{item.quantos}</span>
              </span>
              <span className="rodada-detalhe">
                <span className="rodada-detalhe-principal">{detalhePrincipal}</span>
                {detalheRitmo && <span className="rodada-ritmo"> ({detalheRitmo})</span>}
              </span>
            </span>
            <button
              type="button"
              className="btn btn-sm rodada-btn"
              // Cota esgotada: o botão do lote sairia daqui para um modal que
              // não tem o que enviar. Some em vez de frustrar o clique.
              disabled={item.cabemHoje === 0}
              title={
                item.cabemHoje === 0
                  ? "O teto de mensagens de hoje já foi usado — volte amanhã"
                  : undefined
              }
              onClick={() => executar(item.frente)}
            >
              {item.cabemHoje === 0 ? "Sem vaga hoje" : ACAO[item.frente]}
            </button>
          </div>
          );
        })}
      </div>
    </div>
  );
}
