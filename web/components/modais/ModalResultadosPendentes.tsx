"use client";

/* ================================================================
   MODAL: CONFIRMAR RESULTADO DAS TENTATIVAS (o "nudge")
   A contrapartida de registrar tentativa sozinho no envio: a
   mensagem saiu, mas o desfecho ninguém sabia na hora, então a
   tentativa nasceu "sem-resposta" marcada como palpite.

   Se ninguém confirmar depois, toda taxa de resposta tende a zero e
   o ranking de abordagens vira ruído — a métrica pareceria dizer
   "nenhum roteiro funciona" quando na verdade ninguém anotou que
   funcionou. Este modal é onde o palpite vira fato, em um clique por
   conversa.

   Só cobra o que ele mesmo criou: tentativa anotada à mão não tem a
   marca, porque ali o "sem resposta" é afirmação do corretor.
   E só cobra por DIAS_COBRANCA_RESULTADO dias — depois disso "não
   respondeu" é quase certamente verdade, e insistir seria implicância.
   ================================================================ */
import { useState } from "react";
import { DIAS_COBRANCA_RESULTADO, resultadosPendentes } from "@/lib/calculo/abordagens";
import { RESULTADOS_TENTATIVA, type ResultadoTentativa } from "@/lib/constantes";
import { todayISO } from "@/lib/datas";
import { confirmarResultadoTentativa } from "@/lib/mutacoes";
import { useAppStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import { useUiModal } from "@/lib/uiModal";

export default function ModalResultadosPendentes() {
  const fecharModal = useUiModal((s) => s.fecharModal);
  const imoveis = useAppStore((s) => s.imoveis);
  const abordagens = useAppStore((s) => s.abordagens);
  const [salvando, setSalvando] = useState<string | null>(null);

  const pendentes = resultadosPendentes(imoveis, abordagens, todayISO());

  async function confirmar(imovelId: string, tentativaId: string, resultado: ResultadoTentativa) {
    if (salvando) return;
    setSalvando(tentativaId);
    const ok = await confirmarResultadoTentativa(imovelId, tentativaId, resultado);
    setSalvando(null);
    // A linha some da lista sozinha (o store mudou). Um toast por clique seria
    // barulho: a própria lista encolhendo já é a confirmação.
    if (ok && pendentes.length === 1) {
      toast("Tudo confirmado. O ranking de abordagens já reflete estes contatos.");
      fecharModal();
    }
  }

  return (
    <>
      <div className="modal-head">
        <div className="modal-title">Como terminaram estas conversas?</div>
        <button type="button" className="icon-btn" onClick={fecharModal}>
          ✕
        </button>
      </div>

      <div className="modal-body">
        <p className="section-note" style={{ marginBottom: "14px" }}>
          Estas mensagens foram enviadas por você e a tentativa já ficou registrada — mas o desfecho
          entrou como “sem resposta” porque, na hora do envio, ainda não dava para saber. Confirmar
          agora é o que faz o ranking de abordagens medir o que realmente aconteceu.
        </p>

        {pendentes.length === 0 ? (
          <p className="section-note">Nenhuma conversa esperando confirmação. 👌</p>
        ) : (
          <div className="pendentes-lista">
            {pendentes.map((p) => (
              <div className="pendente-item" key={p.tentativa.id}>
                <div className="pendente-cabeca">
                  <span className="pendente-nome">{p.imovelRotulo}</span>
                  <span className="pendente-meta">
                    {p.abordagemNome} · {p.dias === 0 ? "hoje" : p.dias === 1 ? "ontem" : `há ${p.dias} dias`}
                  </span>
                </div>
                <div className="pendente-acoes">
                  {RESULTADOS_TENTATIVA.map((r) => (
                    <button
                      key={r.valor}
                      type="button"
                      className="btn btn-sm"
                      disabled={salvando === p.tentativa.id}
                      onClick={() => confirmar(p.imovelId, p.tentativa.id, r.valor)}
                    >
                      {r.rotulo}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        <p className="field-hint" style={{ marginTop: "12px" }}>
          Depois de {DIAS_COBRANCA_RESULTADO} dias sem confirmação, a tentativa fica como “sem
          resposta” e para de aparecer aqui — a essa altura é quase certo que seja isso mesmo.
        </p>
      </div>

      <div className="modal-foot">
        <div></div>
        <button type="button" className="btn" onClick={fecharModal}>
          Fechar
        </button>
      </div>
    </>
  );
}
