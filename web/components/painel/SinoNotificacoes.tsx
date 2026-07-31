"use client";

/* ================================================================
   SINO DE NOTIFICAÇÕES (topbar)
   Reúne o que precisa de ação AGORA, reusando o núcleo (sem recalcular):
   - respostas do proprietário ainda não tratadas;
   - compromissos da agenda não concluídos e vencidos/hoje;
   - imóveis parados (isStale) há mais de STALE_DAYS_THRESHOLD dias.
   O contador soma os três; o dropdown lista e leva à tela certa.

   A ordem não é arbitrária, é a mesma da `rodadaDia`: primeiro o que o
   OUTRO LADO fez (alguém está esperando resposta), depois a hora
   marcada, por último o que só depende de nós. Ordenar por volume
   inverteria isso todo dia — em captação o silêncio é sempre a
   categoria mais populosa, que foi o que matou a faixa de "imóvel
   parado" no termômetro.

   A contagem de respostas sai de `contarRespostasPendentes`, a MESMA
   do badge da barra lateral. Dois contadores da mesma coisa na mesma
   tela discordando é bug, não detalhe.
   ================================================================ */
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { isStale } from "@/lib/calculo/motor";
import { contarRespostasPendentes } from "@/lib/calculo/respostas";
import { todayISO } from "@/lib/datas";
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
  const agenda = useAppStore((s) => s.agenda);
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
  const respostas = contarRespostasPendentes(imoveis, hoje);
  const pendentes = agenda.filter((a) => !a.done && a.date <= hoje);
  const parados = imoveis.filter(isStale);
  const total = respostas + pendentes.length + parados.length;

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
        aria-label={total > 0 ? `Notificações: ${total} pendência(s)` : "Notificações"}
        onClick={() => setAberto((v) => !v)}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ width: 18, height: 18 }}>
          <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {total > 0 && <span className="topbar-badge">{total > 9 ? "9+" : total}</span>}
      </button>

      {aberto && (
        <div className="topbar-pop">
          <div className="topbar-pop-head">Notificações</div>

          {total === 0 && <div className="topbar-pop-empty">Tudo em dia — nada pendente. ✓</div>}

          {respostas > 0 && (
            <button type="button" className="topbar-pop-item" onClick={() => irPara("/respostas")}>
              <span className="topbar-pop-ic">💬</span>
              <span className="topbar-pop-txt">
                <strong>
                  {respostas} proprietário(s) responderam
                </strong>
                <span>Mensagem ainda não tratada</span>
              </span>
            </button>
          )}

          {pendentes.slice(0, 6).map((a) => (
            <button key={a.id} type="button" className="topbar-pop-item" onClick={() => irPara("/agenda")}>
              <span className="topbar-pop-ic">☎</span>
              <span className="topbar-pop-txt">
                <strong>{a.title}</strong>
                <span>{a.date < hoje ? "Atrasado" : "Vence hoje"}</span>
              </span>
            </button>
          ))}

          {parados.length > 0 && (
            <button type="button" className="topbar-pop-item" onClick={() => irPara("/insights")}>
              <span className="topbar-pop-ic">⏳</span>
              <span className="topbar-pop-txt">
                <strong>
                  {parados.length} imóvel(is) parado(s)
                </strong>
                <span>Sem avançar há mais de 7 dias</span>
              </span>
            </button>
          )}

          {/* Só quando ainda dá para pedir: concedida não tem o que oferecer,
              negada não adianta reperguntar (o navegador nem mostra o diálogo)
              e insistir viraria um botão que não faz nada. */}
          {permissao === "default" && (
            <button type="button" className="topbar-pop-item" onClick={ativarAvisos}>
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
