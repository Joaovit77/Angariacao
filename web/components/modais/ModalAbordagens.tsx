"use client";

/* ================================================================
   MODAL: CATÁLOGO DE ABORDAGENS
   Cadastro dos ROTEIROS de captação — o que se diz ao proprietário.
   Não confundir com a "forma de abordagem" do imóvel, que é o CANAL
   (WhatsApp, ligação, visita): o mesmo roteiro roda em canais
   diferentes, e é por isso que são campos separados.

   Abordagem não se exclui, arquiva-se: as tentativas já registradas
   apontam para o id, e apagar deixaria o histórico órfão — o ranking
   perderia a leitura do que já foi feito.
   ================================================================ */
import { useState } from "react";
import { useSessao } from "@/components/SessaoProvider";
import { FORMAS_ABORDAGEM } from "@/lib/constantes";
import { alternarArquivamentoAbordagem, salvarAbordagem, uid } from "@/lib/mutacoes";
import { useAppStore } from "@/lib/store";
import { useUiModal } from "@/lib/uiModal";
import type { Abordagem } from "@/lib/tipos";

export default function ModalAbordagens() {
  const fecharModal = useUiModal((s) => s.fecharModal);
  const { usuario } = useSessao();
  const abordagens = useAppStore((s) => s.abordagens);

  // `edicao` guarda a abordagem em edição (ou a nova, ainda sem id salvo).
  const [edicao, setEdicao] = useState<Abordagem | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [mostrarArquivadas, setMostrarArquivadas] = useState(false);

  const visiveis = abordagens.filter((a) => mostrarArquivadas || !a.arquivada);
  const totalArquivadas = abordagens.filter((a) => a.arquivada).length;

  function novaAbordagem() {
    setEdicao({ id: uid(), nome: "", roteiro: "", canalSugerido: "", arquivada: false });
  }

  async function salvar() {
    if (!edicao || !usuario || salvando) return;
    setSalvando(true);
    const ok = await salvarAbordagem(edicao, usuario.id);
    setSalvando(false);
    if (ok) setEdicao(null);
  }

  return (
    <>
      <div className="modal-head">
        <div className="modal-title">Abordagens de captação</div>
        <button type="button" className="icon-btn" onClick={fecharModal}>
          ✕
        </button>
      </div>
      <div className="modal-body">
        <p className="section-note" style={{ marginBottom: "14px" }}>
          Cadastre aqui os roteiros que você usa para abordar proprietários — o que você diz, não por
          onde diz. Ao registrar uma tentativa num imóvel você escolhe o roteiro usado, e o ranking em
          Relatórios mostra quais funcionam.
        </p>

        {edicao ? (
          <div className="card" style={{ padding: "14px", marginBottom: "16px" }}>
            <div className="field-group">
              <label>Nome da abordagem</label>
              <input
                type="text"
                value={edicao.nome}
                onChange={(e) => setEdicao({ ...edicao, nome: e.target.value })}
                placeholder="Ex.: Avaliação gratuita do aluguel"
              />
            </div>
            <div className="field-group">
              <label>Roteiro (opcional)</label>
              <textarea
                value={edicao.roteiro ?? ""}
                onChange={(e) => setEdicao({ ...edicao, roteiro: e.target.value })}
                placeholder="Ex.: Olá, {nome}! Vi que seu imóvel está anunciado. Faço uma avaliação gratuita do valor de locação..."
                style={{ width: "100%", minHeight: "90px" }}
              />
              <div className="field-hint">
                O texto fica aqui como lembrete seu — não é enviado automaticamente.
              </div>
            </div>
            <div className="field-group">
              <label>Canal em que costuma usar (opcional)</label>
              <select
                value={edicao.canalSugerido ?? ""}
                onChange={(e) => setEdicao({ ...edicao, canalSugerido: e.target.value })}
              >
                <option value="">Sem canal definido</option>
                {FORMAS_ABORDAGEM.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
              <button type="button" className="btn btn-sm" onClick={() => setEdicao(null)}>
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={salvar}
                disabled={!edicao.nome.trim() || salvando}
              >
                Salvar abordagem
              </button>
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "14px" }}>
            <button type="button" className="btn btn-primary btn-sm" onClick={novaAbordagem}>
              Nova abordagem
            </button>
          </div>
        )}

        {visiveis.length === 0 ? (
          <p className="section-note">
            {abordagens.length === 0
              ? "Nenhuma abordagem cadastrada ainda."
              : "Nenhuma abordagem ativa — todas estão arquivadas."}
          </p>
        ) : (
          <div className="notas-lista">
            {visiveis.map((a) => (
              <div className="nota-item" key={a.id}>
                <div className="nota-data">
                  <span>
                    {a.nome}
                    {a.canalSugerido ? ` · ${a.canalSugerido}` : ""}
                    {a.arquivada ? " · arquivada" : ""}
                  </span>
                  <span style={{ display: "flex", gap: "6px" }}>
                    <button
                      type="button"
                      className="icon-btn"
                      title="Editar abordagem"
                      onClick={() => setEdicao(a)}
                    >
                      ✎
                    </button>
                    <button
                      type="button"
                      className="icon-btn"
                      title={a.arquivada ? "Reativar abordagem" : "Arquivar abordagem"}
                      onClick={() => alternarArquivamentoAbordagem(a.id)}
                    >
                      {a.arquivada ? "↺" : "📦"}
                    </button>
                  </span>
                </div>
                {a.roteiro && <div className="nota-texto">{a.roteiro}</div>}
              </div>
            ))}
          </div>
        )}

        {totalArquivadas > 0 && (
          <div style={{ marginTop: "12px" }}>
            <button
              type="button"
              className="btn btn-sm"
              onClick={() => setMostrarArquivadas((v) => !v)}
            >
              {mostrarArquivadas
                ? "Ocultar arquivadas"
                : `Mostrar arquivadas (${totalArquivadas})`}
            </button>
          </div>
        )}
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
