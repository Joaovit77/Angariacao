"use client";

/* ================================================================
   MODAL: TENTATIVAS DE ABORDAGEM
   Cada contato feito com o proprietário: qual roteiro foi usado, por
   qual canal e o que deu. Vive na coluna jsonb `tentativas` da tabela
   imoveis (mesmo padrão de notas/status_history).

   Um imóvel tem VÁRIAS tentativas de propósito — é o que permite o
   ranking separar o roteiro que abre a conversa do que fecha o
   contrato. Por isso o modal fica aberto após registrar: só o
   formulário é limpo (mesma escolha do ModalNotas).

   O formulário nasce preenchido com o último canal/roteiro usados no
   imóvel: registrar a tentativa que NÃO deu em nada é o que ninguém
   tem vontade de anotar, e é justamente ela que segura o denominador
   do ranking honesto. Quanto menos cliques, mais provável que entre.
   ================================================================ */
import { useState } from "react";
import { RESULTADOS_TENTATIVA, FORMAS_ABORDAGEM, type ResultadoTentativa } from "@/lib/constantes";
import { fmtDataHora } from "@/lib/formatadores";
import { tentativasOrdenadas } from "@/lib/calculo/abordagens";
import { excluirTentativa, registrarTentativa } from "@/lib/mutacoes";
import { useAppStore } from "@/lib/store";
import { useUiModal } from "@/lib/uiModal";

export default function ModalTentativas({ imovelId }: { imovelId: string }) {
  const fecharModal = useUiModal((s) => s.fecharModal);
  const abrirModal = useUiModal((s) => s.abrirModal);
  const imovel = useAppStore((s) => s.imoveis.find((i) => i.id === imovelId));
  const abordagens = useAppStore((s) => s.abordagens);

  // Só abordagens ativas entram no seletor; as arquivadas seguem nomeando
  // as tentativas antigas na lista abaixo, mas não são oferecidas de novo.
  const ativas = abordagens.filter((a) => !a.arquivada);

  const historico = imovel ? [...tentativasOrdenadas(imovel)].reverse() : [];
  const ultima = historico[0];

  const [abordagemId, setAbordagemId] = useState(() => ultima?.abordagemId ?? "");
  const [canal, setCanal] = useState(() => ultima?.canal ?? imovel?.formaAbordagem ?? "");
  const [resultado, setResultado] = useState<ResultadoTentativa>("sem-resposta");
  const [observacao, setObservacao] = useState("");
  const [salvando, setSalvando] = useState(false);

  if (!imovel) return null;

  const nomeAbordagem = (id: string | null | undefined) =>
    (id && abordagens.find((a) => a.id === id)?.nome) || "Sem roteiro";
  const rotuloResultado = (valor: string) =>
    RESULTADOS_TENTATIVA.find((r) => r.valor === valor)?.rotulo ?? valor;

  async function registrar() {
    if (salvando) return;
    setSalvando(true);
    const ok = await registrarTentativa(imovelId, {
      abordagemId: abordagemId || null,
      canal: canal || null,
      resultado,
      observacao,
    });
    setSalvando(false);
    // Mantém canal e roteiro para a próxima; zera só o que é do contato.
    if (ok) {
      setResultado("sem-resposta");
      setObservacao("");
    }
  }

  return (
    <>
      <div className="modal-head">
        <div className="modal-title">Tentativas de abordagem — {imovel.codigo || imovel.endereco}</div>
        <button type="button" className="icon-btn" onClick={fecharModal}>
          ✕
        </button>
      </div>
      <div className="modal-body">
        {ativas.length === 0 && (
          <p className="section-note" style={{ marginBottom: "12px" }}>
            Você ainda não cadastrou nenhuma abordagem. Dá para registrar a tentativa sem roteiro, mas
            ela não entra no ranking —{" "}
            <button
              type="button"
              className="insight-action"
              style={{ padding: 0 }}
              onClick={() => abrirModal("abordagens")}
            >
              cadastrar abordagens
            </button>
            .
          </p>
        )}

        <div className="field-row">
          <div className="field-group">
            <label>Abordagem usada</label>
            <select value={abordagemId} onChange={(e) => setAbordagemId(e.target.value)}>
              <option value="">Sem roteiro registrado</option>
              {ativas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.nome}
                </option>
              ))}
            </select>
          </div>
          <div className="field-group">
            <label>Canal</label>
            <select value={canal} onChange={(e) => setCanal(e.target.value)}>
              <option value="">Não informado</option>
              {FORMAS_ABORDAGEM.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="field-group">
          <label>Resultado</label>
          <select value={resultado} onChange={(e) => setResultado(e.target.value as ResultadoTentativa)}>
            {RESULTADOS_TENTATIVA.map((r) => (
              <option key={r.valor} value={r.valor}>
                {r.rotulo}
              </option>
            ))}
          </select>
          <div className="field-hint">
            Registre também as tentativas sem resposta — sem elas o ranking fica otimista, porque só
            as que deram certo apareceriam.
          </div>
        </div>

        <div className="field-group">
          <label>Observação (opcional)</label>
          <textarea
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            placeholder="Ex.: atendeu, disse que já tem imobiliária mas está insatisfeito"
            style={{ width: "100%", minHeight: "60px" }}
          />
        </div>

        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "14px" }}>
          <button type="button" className="btn btn-primary btn-sm" onClick={registrar} disabled={salvando}>
            Registrar tentativa
          </button>
        </div>

        {historico.length === 0 ? (
          <p className="section-note">Nenhuma tentativa registrada ainda.</p>
        ) : (
          <div className="notas-lista">
            {historico.map((t) => (
              <div className="nota-item" key={t.id}>
                <div className="nota-data">
                  <span>
                    {fmtDataHora(t.data)} · {nomeAbordagem(t.abordagemId)}
                    {t.canal ? ` · ${t.canal}` : ""} · {rotuloResultado(t.resultado)}
                  </span>
                  <button
                    type="button"
                    className="icon-btn btn-danger"
                    title="Excluir tentativa"
                    onClick={() => excluirTentativa(imovelId, t.id)}
                  >
                    ×
                  </button>
                </div>
                {t.observacao && <div className="nota-texto">{t.observacao}</div>}
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="modal-foot">
        <button type="button" className="btn btn-sm" onClick={() => abrirModal("abordagens")}>
          Gerenciar abordagens
        </button>
        <button type="button" className="btn" onClick={fecharModal}>
          Fechar
        </button>
      </div>
    </>
  );
}
