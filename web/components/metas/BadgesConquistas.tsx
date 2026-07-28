"use client";

/* ================================================================
   MEDALHAS (BADGES) — gamificação da view de Metas
   Renderiza as conquistas calculadas por lib/calculo/gamificacao.ts
   (100% derivadas do statusHistory e das metas — nada persistido).
   Medalha não conquistada aparece acinzentada (.bloqueada).
   ================================================================ */
import { calcularBadges } from "@/lib/calculo/gamificacao";
import { useAppStore } from "@/lib/store";

export default function BadgesConquistas() {
  const imoveis = useAppStore((s) => s.imoveis);
  const metas = useAppStore((s) => s.metas);
  const badges = calcularBadges(imoveis, metas);
  const conquistadas = badges.filter((b) => b.conquistada).length;

  return (
    <>
      <div className="card-title" style={{ marginBottom: "14px" }}>
        Conquistas{" "}
        <span className="badges-contador">
          {conquistadas} de {badges.length}
        </span>
      </div>
      <div className="badges-grid">
        {badges.map((b) => (
          <div className={`badge-card${b.conquistada ? "" : " bloqueada"}`} key={b.id} title={b.descricao}>
            <div className="badge-icone">{b.icone}</div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div className="badge-nome">{b.nome}</div>
              <div className="badge-desc">{b.descricao}</div>
              {b.conquistada && b.detalhe && <div className="badge-detalhe">{b.detalhe}</div>}
              {/* O degrau a perseguir: quanto falta. É o que diferencia "ainda
                  não" de "faltam 4" — a trilha só motiva se o próximo passo
                  tiver tamanho visível. */}
              {!b.conquistada && b.progressoTexto && (
                <div className="badge-progresso">
                  {b.progresso != null && (
                    <div className="badge-progresso-track">
                      <div className="badge-progresso-fill" style={{ width: `${b.progresso * 100}%` }}></div>
                    </div>
                  )}
                  <span className="badge-progresso-texto">{b.progressoTexto}</span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
