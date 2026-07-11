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
            <div>
              <div className="badge-nome">{b.nome}</div>
              <div className="badge-desc">{b.descricao}</div>
              {b.conquistada && b.detalhe && <div className="badge-detalhe">{b.detalhe}</div>}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
