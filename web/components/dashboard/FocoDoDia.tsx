"use client";

/* ================================================================
   CARD: FOCO DO DIA (Dashboard)
   O plano de prospecção do dia — quantos contatos NOVOS fazer em
   cada portal. Todos os números saem do cálculo puro (planoDia.ts):
   o total vem do ritmo do corretor, a repartição do desempenho por
   canal, e o "feitos" da entrada dos leads no funil hoje. Nada é
   digitado, nada persiste. Ver lib/calculo/planoDia.ts.
   ================================================================ */
import { useMemo, useState } from "react";
import type { FocoPortal } from "@/lib/calculo/planoDia";
import { planoDoDia } from "@/lib/calculo/planoDia";
import { todayISO } from "@/lib/datas";
import { explicarFoco } from "@/lib/ia";
import { useAppStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import { useUiModal } from "@/lib/uiModal";

function Linha({ p }: { p: FocoPortal }) {
  const temAlvo = p.sugerido > 0;
  const concluido = temAlvo && p.feitos >= p.sugerido;
  const pct = temAlvo ? Math.min(100, Math.round((p.feitos / p.sugerido) * 100)) : 0;
  return (
    <div className="foco-row">
      <div className="foco-nome">
        {p.origem}
        {p.conversao != null && (
          <span className="foco-conv">
            {Math.round(p.conversao)}% fecham{p.indicativo ? " · poucos dados" : ""}
          </span>
        )}
      </div>
      <div className="foco-metric">
        {temAlvo ? (
          <>
            <span className="n">{p.feitos}</span>
            <span className="alvo"> / {p.sugerido}</span>
            {concluido ? (
              <span className="ok">✓ ok</span>
            ) : p.restantes > 0 ? (
              <span className="faltam">faltam {p.restantes}</span>
            ) : null}
          </>
        ) : (
          <>
            <span className="n">{p.feitos}</span>
            <span className="alvo"> feito(s)</span>
          </>
        )}
      </div>
      {temAlvo && (
        <div className="foco-bar">
          <div className="progress-track">
            <div className={`progress-fill${concluido ? " good" : ""}`} style={{ width: `${pct}%` }} />
          </div>
        </div>
      )}
    </div>
  );
}

export default function FocoDoDia() {
  const imoveis = useAppStore((s) => s.imoveis);
  const origensExtras = useAppStore((s) => s.config.origensExtras);
  const iaDisponivel = useAppStore((s) => s.iaDisponivel);
  const abrirModal = useUiModal((s) => s.abrirModal);
  const [iaTexto, setIaTexto] = useState("");
  const [iaCarregando, setIaCarregando] = useState(false);

  const plano = useMemo(() => planoDoDia(imoveis, origensExtras, todayISO()), [imoveis, origensExtras]);

  async function pedirExplicacao() {
    if (iaCarregando) return;
    setIaCarregando(true);
    // A ordem NÃO vai daqui: o servidor relê o banco e roda o mesmo planoDoDia.
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
        <span className="section-note">
          {plano.temSugestao
            ? `ritmo típico ${plano.ritmo} · hoje ${plano.feitosHoje} feito(s)`
            : `hoje ${plano.feitosHoje} contato(s) novo(s)`}
        </span>
      </div>

      {plano.portais.length === 0 ? (
        <p className="foco-vazio">
          Assim que você registrar contatos e cadastrar de onde vieram, o sistema aprende seu ritmo e
          sugere quantas prospecções fazer em cada portal por dia. Cadastre seus portais em
          Configurações — eles aparecem aqui na hora.
        </p>
      ) : (
        <>
          {!plano.temSugestao && (
            <div className="foco-aviso">
              Ainda aprendendo seu ritmo — mostrando só a ordem de prioridade dos portais.
            </div>
          )}
          <div className="foco-lista">
            {plano.portais.map((p) => (
              <Linha key={p.origem} p={p} />
            ))}
          </div>
          <div className="foco-foot">
            <button type="button" className="btn btn-sm" onClick={() => abrirModal("imovel")}>
              + Registrar contato novo
            </button>
            {iaDisponivel && (
              <button type="button" className="btn btn-sm" onClick={pedirExplicacao} disabled={iaCarregando}>
                {iaCarregando ? "Analisando..." : "Explicar prioridade"}
              </button>
            )}
          </div>
          {iaTexto && (
            <div className="foco-ia">
              <div className="rotulo">Leitura por IA · interpretação deste plano</div>
              {/* Sem dangerouslySetInnerHTML: o texto vem de fora, o escape do JSX é a defesa. */}
              {iaTexto
                .split("\n")
                .map((l) => l.trim())
                .filter(Boolean)
                .map((linha, i) => (
                  <p key={i}>{linha}</p>
                ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
