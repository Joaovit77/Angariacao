"use client";

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { notificacoesDaCentral, tempoRelativoNotificacao } from "@/lib/calculo/notificacoes";
import { marcarEventosLidos, marcarTodasRespostasLidas } from "@/lib/mutacoes";
import { useUiModal } from "@/lib/uiModal";
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
  const abrirModal = useUiModal((s) => s.abrirModal);
  const [aberto, setAberto] = useState(false);
  const [filtro, setFiltro] = useState<"todas" | "nao-lidas">("todas");
  const [marcandoTodas, setMarcandoTodas] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  // Store externo em vez de useState: `Notification.permission` não existe no
  // SSR, e lê-lo no render daria mismatch de hidratação (mesmo padrão da
  // preferência de barra recolhida no layout do painel).
  const permissao = useSyncExternalStore(
    assinarPermissao,
    lerPermissao,
    () => PERMISSAO_NO_SERVIDOR,
  );

  const notificacoes = useMemo(() => notificacoesDaCentral(imoveis), [imoveis]);
  const naoLidas = useMemo(() => notificacoes.filter((item) => !item.lida), [notificacoes]);
  const visiveis = filtro === "nao-lidas" ? naoLidas : notificacoes;

  // Fecha ao clicar fora. O listener só existe enquanto está aberto.
  useEffect(() => {
    if (!aberto) return;
    function aoClicarFora(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setAberto(false);
    }
    document.addEventListener("mousedown", aoClicarFora);
    return () => document.removeEventListener("mousedown", aoClicarFora);
  }, [aberto]);

  // Só a partir de um clique: navegador ignora (ou nega de vez) pedido
  // automático, e "negado" é caro de desfazer.
  async function ativarAvisos() {
    const r = await pedirPermissaoAviso();
    if (r === "granted") toast("Pronto — os avisos vão aparecer mesmo com a aba em segundo plano.");
    else if (r === "denied") toast("O navegador bloqueou os avisos. Dá para liberar no cadeado da barra de endereço.", "warning");
  }

  function abrirNotificacao(id: string) {
    const notificacao = notificacoes.find((item) => item.id === id);
    if (!notificacao) return;
    setAberto(false);

    if (notificacao.destino === "conversa") {
      router.push(`/respostas?imovel=${encodeURIComponent(notificacao.imovelId)}`);
      return;
    }

    void marcarEventosLidos(notificacao.imovelId);
    abrirModal("imovel", notificacao.imovelId);
  }

  async function marcarTudoComoLido() {
    if (marcandoTodas || naoLidas.length === 0) return;
    setMarcandoTodas(true);
    const imoveisComMensagem = [
      ...new Set(
        naoLidas
          .filter((item) => item.tipo === "mensagem-recebida")
          .map((item) => item.imovelId),
      ),
    ];

    try {
      await marcarEventosLidos(null);
      await marcarTodasRespostasLidas(imoveisComMensagem);
    } finally {
      setMarcandoTodas(false);
    }
  }

  return (
    <div className="topbar-pop-wrap" ref={wrapRef}>
      <button
        type="button"
        className="topbar-icon-btn"
        aria-label={naoLidas.length > 0 ? `Notificações: ${naoLidas.length} não lida(s)` : "Notificações"}
        onClick={() => setAberto((v) => !v)}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 18, height: 18 }}>
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {naoLidas.length > 0 && (
          <span className="topbar-badge">{naoLidas.length > 9 ? "9+" : naoLidas.length}</span>
        )}
      </button>

      {aberto && (
        <div className="topbar-pop topbar-pop-notificacoes">
          <div className="topbar-pop-head topbar-pop-head-notificacoes">
            <span>Notificações</span>
            {naoLidas.length > 0 && (
              <button type="button" onClick={() => void marcarTudoComoLido()} disabled={marcandoTodas}>
                {marcandoTodas ? "Marcando…" : "Marcar todas como lidas"}
              </button>
            )}
          </div>

          <div className="topbar-pop-filtros" role="tablist" aria-label="Filtrar notificações">
            <button type="button" className={filtro === "todas" ? "ativo" : ""} onClick={() => setFiltro("todas")}>
              Todas
            </button>
            <button
              type="button"
              className={filtro === "nao-lidas" ? "ativo" : ""}
              onClick={() => setFiltro("nao-lidas")}
            >
              Não lidas {naoLidas.length > 0 ? `(${naoLidas.length})` : ""}
            </button>
          </div>

          <div className="topbar-pop-lista">
            {visiveis.length === 0 && (
              <div className="topbar-pop-empty">
                <strong>{filtro === "nao-lidas" ? "Nenhuma notificação não lida." : "Você está em dia."}</strong>
                <span>Novas mensagens e atualizações do sistema aparecerão aqui.</span>
              </div>
            )}

            {visiveis.slice(0, 30).map((item) => (
              <button
                key={item.id}
                type="button"
                className={`topbar-pop-item topbar-pop-notificacao${item.lida ? "" : " nao-lida"}`}
                onClick={() => abrirNotificacao(item.id)}
              >
                <span className="topbar-pop-ic" aria-hidden="true">
                  {item.tipo === "mensagem-recebida" ? "💬" : "🏷️"}
                </span>
                <span className="topbar-pop-txt">
                  <strong>{item.titulo}</strong>
                  <span>{item.descricao}</span>
                  <time dateTime={item.data}>{tempoRelativoNotificacao(item.data)}</time>
                </span>
                {!item.lida && <span className="topbar-pop-ponto" aria-label="Não lida" />}
              </button>
            ))}
          </div>

          {permissao === "default" && (
            <button type="button" className="topbar-pop-item topbar-pop-aviso-sistema" onClick={ativarAvisos}>
              <span className="topbar-pop-ic">🔔</span>
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
