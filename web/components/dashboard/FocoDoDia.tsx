"use client";

/* O sistema monta a ordem; a IA apenas explica. Assim o card continua útil
   offline e cada prioridade permanece conferível pelo corretor. */
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { focoInteligenteDoDia, type AcaoFoco } from "@/lib/calculo/focoDia";
import type { FocoPortal } from "@/lib/calculo/planoDia";
import { todayISO } from "@/lib/datas";
import { explicarFoco } from "@/lib/ia";
import { useAppStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import { useUiModal } from "@/lib/uiModal";

function LinhaPortal({ p }: { p: FocoPortal }) {
  const temAlvo = p.sugerido > 0;
  const concluido = temAlvo && p.feitos >= p.sugerido;
  const pct = temAlvo ? Math.min(100, Math.round((p.feitos / p.sugerido) * 100)) : 0;
  return (
    <div className="foco-row">
      <div className="foco-nome">
        {p.origem}
        {p.angariados > 0 && (
          <span className="foco-conv">
            {p.angariados} angariaç{p.angariados === 1 ? "ão" : "ões"} até aqui
          </span>
        )}
      </div>
      <div className="foco-metric">
        <span className="n">{p.feitos}</span>
        <span className="alvo">{temAlvo ? ` / ${p.sugerido}` : " feito(s)"}</span>
        {concluido ? <span className="ok">✓ ok</span> : p.restantes > 0 ? <span className="faltam">faltam {p.restantes}</span> : null}
      </div>
      {temAlvo && <div className="foco-bar"><div className="progress-track"><div className={`progress-fill${concluido ? " good" : ""}`} style={{ width: `${pct}%` }} /></div></div>}
    </div>
  );
}

const ROTULO_DESTINO = { "/respostas": "Abrir respostas", "/agenda": "Abrir agenda", "/pipeline": "Abrir pipeline" } as const;

function AcaoPrincipal({ acao, onAbrir }: { acao: AcaoFoco; onAbrir: (acao: AcaoFoco) => void }) {
  return (
    <div className="foco-principal">
      <div className="foco-principal-texto">
        <span className="foco-prioridade agora">Próxima ação</span>
        <h3>{acao.titulo}</h3>
        <p>{acao.contexto}</p>
        <small>{acao.motivo}</small>
      </div>
      <button type="button" className="btn foco-principal-btn" onClick={() => onAbrir(acao)}>
        {ROTULO_DESTINO[acao.destino]} <span aria-hidden="true">→</span>
      </button>
    </div>
  );
}

function AcaoSeguinte({ acao, onAbrir }: { acao: AcaoFoco; onAbrir: (acao: AcaoFoco) => void }) {
  return (
    <button type="button" className="foco-seguinte" onClick={() => onAbrir(acao)}>
      <span className="foco-seguinte-marca" aria-hidden="true" />
      <span className="foco-acao-corpo">
        <strong>{acao.titulo}</strong>
        <span>{acao.contexto} · {acao.motivo}</span>
      </span>
      <span className="foco-acao-seta" aria-hidden="true">→</span>
    </button>
  );
}

export default function FocoDoDia() {
  const router = useRouter();
  const imoveis = useAppStore((s) => s.imoveis);
  const agenda = useAppStore((s) => s.agenda);
  const origensExtras = useAppStore((s) => s.config.origensExtras);
  const iaDisponivel = useAppStore((s) => s.iaDisponivel);
  const abrirModal = useUiModal((s) => s.abrirModal);
  const [iaTexto, setIaTexto] = useState("");
  const [iaCarregando, setIaCarregando] = useState(false);

  const foco = useMemo(
    () => focoInteligenteDoDia(imoveis, agenda, origensExtras, todayISO()),
    [imoveis, agenda, origensExtras],
  );
  const plano = foco.planoProspeccao;
  const principal = foco.acoes[0];
  const seguintes = foco.acoes.slice(1, 4);

  async function pedirExplicacao() {
    if (iaCarregando) return;
    setIaCarregando(true);
    const r = await explicarFoco();
    setIaCarregando(false);
    if (!r.ok || !r.texto) {
      toast(r.mensagem || "A IA não respondeu agora.", "error");
      return;
    }
    setIaTexto(r.texto);
  }

  return (
    <div className="card" style={{ marginBottom: "16px" }}>
      <div className="card-title" style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: "12px" }}>
        <span>Foco do dia</span>
        <span className="section-note">{foco.totalAcoes > 0 ? "ordem sugerida pelo sistema" : "dia em ordem"}</span>
      </div>

      <div className="foco-resumo" aria-label="Resumo das prioridades do dia">
        {foco.respostasPendentes > 0 && <span><strong>{foco.respostasPendentes}</strong> respostas</span>}
        {foco.compromissosVencidos > 0 && <span><strong>{foco.compromissosVencidos}</strong> vencidos</span>}
        {foco.compromissosHoje > 0 && <span><strong>{foco.compromissosHoje}</strong> para hoje</span>}
        {foco.imoveisParados > 0 && <span><strong>{foco.imoveisParados}</strong> imóveis para revisar</span>}
      </div>

      {!principal ? (
        <p className="foco-vazio">Nada urgente agora. Use o tempo livre para buscar novos imóveis e manter a entrada do funil.</p>
      ) : (
        <>
          <AcaoPrincipal acao={principal} onAbrir={(a) => router.push(a.destino)} />
          {seguintes.length > 0 && (
            <div className="foco-depois">
              <div className="foco-depois-titulo">Depois disso</div>
              {seguintes.map((acao) => <AcaoSeguinte key={acao.id} acao={acao} onAbrir={(a) => router.push(a.destino)} />)}
            </div>
          )}
          {foco.totalAcoes > 4 && <div className="foco-fila">+ {foco.totalAcoes - 4} ações organizadas na fila</div>}
        </>
      )}

      <div className="foco-foot">
        <button type="button" className="btn btn-sm" onClick={() => abrirModal("imovel")}>+ Registrar contato novo</button>
        {iaDisponivel && <button type="button" className="btn btn-sm" onClick={pedirExplicacao} disabled={iaCarregando}>{iaCarregando ? "Analisando..." : "Explicar meu foco"}</button>}
      </div>

      {iaTexto && <div className="foco-ia"><div className="rotulo">Leitura por IA · interpretação desta fila</div>{iaTexto.split("\n").map((l) => l.trim()).filter(Boolean).map((linha, i) => <p key={i}>{linha}</p>)}</div>}

      {plano.portais.length > 0 && (
        <details className="foco-prospeccao">
          <summary>Plano de prospecção · {plano.temSugestao ? `ritmo típico ${plano.ritmo}` : "aprendendo seu ritmo"}</summary>
          <div className="foco-lista">{plano.portais.map((p) => <LinhaPortal key={p.origem} p={p} />)}</div>
        </details>
      )}
    </div>
  );
}
