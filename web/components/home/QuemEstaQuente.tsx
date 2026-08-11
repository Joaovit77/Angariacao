"use client";

/* ================================================================
   CARD: QUEM ESTÁ QUENTE AGORA (Início)
   A outra metade da manhã. O "Foco do dia" diz onde prospectar
   (entrada nova); este card diz de quem correr atrás do que já está
   dentro, antes que esfrie.

   Toda a ordem vem do cálculo puro (calculo/temperatura.ts) — aqui
   não há regra de negócio nenhuma, só a montagem. O `motivo` já vem
   escrito de lá, de propósito: é ele que faz o corretor concordar
   com a ordem em vez de conferir a lista no olho.

   Sem sinal nenhum o card não renderiza. Um card vazio dizendo
   "ninguém está quente" ocuparia a melhor posição da tela para não
   informar nada.
   ================================================================ */
import { termometro } from "@/lib/calculo/temperatura";
import { modeloPadraoWhatsapp } from "@/lib/calculo/whatsapp";
import { todayISO } from "@/lib/datas";
import { useAppStore } from "@/lib/store";
import { useUiModal } from "@/lib/uiModal";
import { useRouter } from "next/navigation";

const LIMITE_PRIORITARIOS = 3;

export default function QuemEstaQuente() {
  const router = useRouter();
  const imoveis = useAppStore((s) => s.imoveis);
  const abrirModal = useUiModal((s) => s.abrirModal);

  const linhas = termometro(imoveis, todayISO());
  if (linhas.length === 0) return null;

  return (
    <div className="card">
      <div className="home-card-head">
        <div>
          <div className="card-title">Quem está quente agora</div>
          <span className="section-note">Prioridade de contato</span>
        </div>
        <button type="button" className="home-link" onClick={() => router.push("/pipeline")}>
          Ver todos →
        </button>
      </div>
      <div className="home-list home-list-parados">
        {linhas.slice(0, LIMITE_PRIORITARIOS).map((linha) => {
          const imovel = imoveis.find((i) => i.id === linha.imovelId);
          if (!imovel) return null;
          return (
            <div
              key={linha.imovelId}
              className="home-parado"
              onClick={() => abrirModal("imovel", imovel.id)}
            >
              <div className="home-parado-top">
                <span className="home-parado-codigo" title={imovel.codigo || imovel.referenciaCrm || ""}>
                  {imovel.codigo || imovel.referenciaCrm || "Sem código"}
                </span>
                <span className="home-parado-motivo">
                  <span className="home-list-chip bad">{linha.dias} dia(s)</span>
                  <span className="home-parado-status">{imovel.status}</span>
                </span>
              </div>
              {/* A linha que justifica a posição. Vem pronta do cálculo puro. */}
              <div className="home-parado-row" title={linha.motivo}>
                <span className="home-parado-ic">⚡</span>
                <span className="home-parado-val">{linha.motivo}</span>
              </div>
              <div className="home-parado-row" title={imovel.endereco}>
                <span className="home-parado-ic">📍</span>
                <span className="home-parado-val">{imovel.endereco || "Sem endereço"}</span>
              </div>
              <div className="home-parado-row">
                <span className="home-parado-ic">👤</span>
                <span className={`home-parado-val${imovel.proprietarioNome ? "" : " vazio"}`}>
                  {imovel.proprietarioNome || "Sem proprietário"}
                </span>
                {imovel.proprietarioTelefone && (
                  <button
                    type="button"
                    className="home-parado-wpp"
                    title="Escrever mensagem no WhatsApp"
                    onClick={(e) => {
                      // Sem o stopPropagation o clique abriria o modal do imóvel
                      // por trás — o mesmo cuidado do card "Imóveis parados".
                      e.stopPropagation();
                      abrirModal("whatsapp", imovel.id, modeloPadraoWhatsapp(imovel.status));
                    }}
                  >
                    💬
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
