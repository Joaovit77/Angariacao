"use client";

/* ================================================================
   SINO DE NOTIFICAÇÕES (topbar)
   O sino representa somente acontecimentos novos e persistidos:
   - eventos do Sistema Principal ainda não lidos;
   - respostas do proprietário ainda não tratadas;
   - oportunidades do Radar ainda não vistas.

   Compromissos vencidos e imóveis parados continuam nas telas de trabalho,
   mas não entram aqui: são estados correntes, não eventos recentes. Itens do
   mesmo tipo são agrupados para uma carteira grande não gerar dezenas de
   linhas iguais.
   ================================================================ */
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { caixaDeRespostas } from "@/lib/calculo/respostas";
import { notificacoesPendentes, rotuloDoImovel } from "@/lib/calculo/sistemaPrincipal";
import { marcarEventosLidos } from "@/lib/mutacoes";
import { useUiModal } from "@/lib/uiModal";
import { tempoRelativoIso, todayISO } from "@/lib/datas";
import {
  assinarPermissao,
  lerPermissao,
  pedirPermissaoAviso,
  PERMISSAO_NO_SERVIDOR,
} from "@/lib/notificacaoSistema";
import { useAppStore } from "@/lib/store";
import { toast } from "@/lib/toast";

export default function SinoNotificacoes() {
  const router = useRouter();
  const imoveis = useAppStore((s) => s.imoveis);
  const radarNovos = useAppStore((s) => s.radarNovos);
  const abrirModal = useUiModal((s) => s.abrirModal);
  const [aberto, setAberto] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  // Store externo em vez de useState: `Notification.permission` não existe no
  // SSR, e lê-lo no render daria mismatch de hidratação (mesmo padrão da
  // preferência de barra recolhida no layout do painel).
  const permissao = useSyncExternalStore(
    assinarPermissao,
    lerPermissao,
    () => PERMISSAO_NO_SERVIDOR,
  );

  const hoje = todayISO();
  const eventos = notificacoesPendentes(imoveis);
  const respostas = caixaDeRespostas(imoveis, hoje).filter(
    (linha) => linha.pendente && linha.fase === "captacao",
  );
  const ultimaResposta = respostas[0];
  const imovelUltimaResposta = ultimaResposta
    ? imoveis.find((imovel) => imovel.id === ultimaResposta.imovelId)
    : null;
  const total = eventos.length + respostas.length + radarNovos;

  // Fecha ao clicar fora. O listener só existe enquanto está aberto.
  useEffect(() => {
    if (!aberto) return;
    function aoClicarFora(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setAberto(false);
    }
    document.addEventListener("mousedown", aoClicarFora);
    return () => document.removeEventListener("mousedown", aoClicarFora);
  }, [aberto]);

  function irPara(rota: string) {
    setAberto(false);
    router.push(rota);
  }

  // Só a partir de um clique: navegador ignora (ou nega de vez) pedido
  // automático, e "negado" é caro de desfazer.
  async function ativarAvisos() {
    const r = await pedirPermissaoAviso();
    if (r === "granted") toast("Pronto — os avisos vão aparecer mesmo com a aba em segundo plano.");
    else if (r === "denied") toast("O navegador bloqueou os avisos. Dá para liberar no cadeado da barra de endereço.", "warning");
  }

  return (
    <div className="topbar-pop-wrap" ref={wrapRef}>
      <button
        type="button"
        className="topbar-icon-btn"
        aria-label={total > 0 ? `Notificações: ${total} não lida(s)` : "Notificações"}
        onClick={() => setAberto((v) => !v)}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 18, height: 18 }}>
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {total > 0 && <span className="topbar-badge">{total > 9 ? "9+" : total}</span>}
      </button>

      {aberto && (
        <div className="topbar-pop topbar-pop-notificacoes">
          <div className="topbar-pop-head notificacoes-head">
            <strong>Notificações</strong>
            {total > 0 && <span>{total} nova{total === 1 ? "" : "s"}</span>}
          </div>

          {total === 0 && (
            <div className="topbar-pop-empty notificacoes-vazio">
              <span aria-hidden="true">✓</span>
              <strong>Tudo em dia</strong>
              <small>Nenhuma novidade exige sua atenção.</small>
            </div>
          )}

          {total > 0 && <div className="notificacoes-grupo">Novas</div>}

          {/* Cada evento é uma linha própria, e não um contador como as
              respostas: são poucos e cada um diz uma coisa diferente
              ("autorização assinada" e "comissão paga" não se resumem em
              "3 atualizações"). O clique leva ao imóvel e dá a notificação
              por lida — ler é a única ação que ela pede. */}
          {eventos.slice(0, 5).map((e) => (
            <button
              key={e.id}
              type="button"
              className="topbar-pop-item notificacao-item nao-lida"
              onClick={() => {
                void marcarEventosLidos(e.imovelId);
                setAberto(false);
                // O modal do imóvel, e não uma rota: ele abre de qualquer
                // view (o ModalOverlay vive no layout do painel) e mostra os
                // campos que o evento acabou de gravar. Uma rota teria que
                // acertar também o modo do Pipeline — em Kanban não há
                // drawer, e o imóvel retirado nem aparece na lista.
                abrirModal("imovel", e.imovelId);
              }}
            >
              <span className="notificacao-indicador" aria-label="Não lida" />
              <span className="topbar-pop-ic evento" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 5h16v14H4zM8 9h8M8 13h5" /></svg>
              </span>
              <span className="topbar-pop-txt">
                <strong>{e.texto}</strong>
                <span>{e.rotulo} · {tempoRelativoIso(e.data)}</span>
              </span>
            </button>
          ))}

          {eventos.length > 5 && (
            <button
              type="button"
              className="topbar-pop-item notificacao-item"
              onClick={() => {
                void marcarEventosLidos(null);
                setAberto(false);
              }}
            >
              <span className="topbar-pop-ic" aria-hidden="true">✓</span>
              <span className="topbar-pop-txt">
                <strong>Marcar as {eventos.length} atualizações como lidas</strong>
                <span>Os fatos seguem no histórico de cada imóvel</span>
              </span>
            </button>
          )}

          {respostas.length > 0 && (
            <button type="button" className="topbar-pop-item notificacao-item nao-lida" onClick={() => irPara("/respostas")}>
              <span className="notificacao-indicador" aria-label="Não lida" />
              <span className="topbar-pop-ic resposta" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M21 11.5a8.5 8.5 0 0 1-9 8.4 8.5 8.5 0 0 1-3.8-.9L3 20l1.9-4.1A8.5 8.5 0 1 1 21 11.5Z" /></svg>
              </span>
              <span className="topbar-pop-txt">
                <strong>
                  {respostas.length === 1
                    ? "Proprietário respondeu"
                    : `${respostas.length} proprietários responderam`}
                </strong>
                <span>
                  {imovelUltimaResposta ? rotuloDoImovel(imovelUltimaResposta) : "Mensagem não tratada"}
                  {ultimaResposta ? ` · ${tempoRelativoIso(ultimaResposta.ultima.data)}` : ""}
                </span>
              </span>
            </button>
          )}

          {radarNovos > 0 && (
            <button type="button" className="topbar-pop-item notificacao-item nao-lida" onClick={() => irPara("/central-angariacao?aba=radar")}>
              <span className="notificacao-indicador" aria-label="Não lida" />
              <span className="topbar-pop-ic radar" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="2" /><path d="M7.8 16.2a6 6 0 0 1 0-8.4M16.2 7.8a6 6 0 0 1 0 8.4M4.9 19.1a10 10 0 0 1 0-14.2M19.1 4.9a10 10 0 0 1 0 14.2" /></svg>
              </span>
              <span className="topbar-pop-txt">
                <strong>{radarNovos} nova{radarNovos === 1 ? " oportunidade encontrada" : "s oportunidades encontradas"}</strong>
                <span>Radar · revisar resultados</span>
              </span>
            </button>
          )}

          {/* Só quando ainda dá para pedir: concedida não tem o que oferecer,
              negada não adianta reperguntar (o navegador nem mostra o diálogo)
              e insistir viraria um botão que não faz nada. */}
          {permissao === "default" && (
            <button type="button" className="topbar-pop-item notificacoes-permissao" onClick={ativarAvisos}>
              <span className="topbar-pop-ic" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M14 21h-4" /></svg>
              </span>
              <span className="topbar-pop-txt">
                <strong>Ativar avisos no computador</strong>
                <span>Receber mesmo com a aba em segundo plano</span>
              </span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
