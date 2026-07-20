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
import { captadorPadrao, useSessao } from "@/components/SessaoProvider";
import { FORMAS_ABORDAGEM, TIPOS_IMOVEL } from "@/lib/constantes";
import type { RoteiroSugerido } from "@/lib/calculo/ia";
import { sugerirRoteiros } from "@/lib/ia";
import { alternarArquivamentoAbordagem, salvarAbordagem, uid } from "@/lib/mutacoes";
import { useAppStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import { useUiModal } from "@/lib/uiModal";
import type { Abordagem } from "@/lib/tipos";

export default function ModalAbordagens() {
  const fecharModal = useUiModal((s) => s.fecharModal);
  const { usuario } = useSessao();
  const abordagens = useAppStore((s) => s.abordagens);
  const imoveis = useAppStore((s) => s.imoveis);
  const config = useAppStore((s) => s.config);
  const iaDisponivel = useAppStore((s) => s.iaDisponivel);

  // `edicao` guarda a abordagem em edição (ou a nova, ainda sem id salvo).
  const [edicao, setEdicao] = useState<Abordagem | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [mostrarArquivadas, setMostrarArquivadas] = useState(false);

  // Sugestão por IA: painel de contexto + resultados. As sugestões NÃO são
  // salvas sozinhas — viram um rascunho no formulário e o corretor decide.
  const [painelIa, setPainelIa] = useState(false);
  const [ctxTipo, setCtxTipo] = useState("");
  const [ctxBairro, setCtxBairro] = useState("");
  const [ctxSituacao, setCtxSituacao] = useState("");
  // Quem assina: captador (nome da conta, ou o mais usado nos imóveis) e
  // empresa (da config). Editáveis só para esta geração — o padrão da
  // empresa mora em Configurações. O modal monta do zero a cada abertura
  // (ModalOverlay), então o initializer do useState pega os valores atuais.
  const [ctxCaptador, setCtxCaptador] = useState(() => captadorPadrao(usuario, imoveis));
  const [ctxEmpresa, setCtxEmpresa] = useState(config.empresa || "");
  const [gerando, setGerando] = useState(false);
  const [sugestoes, setSugestoes] = useState<RoteiroSugerido[]>([]);

  async function gerar() {
    if (gerando) return;
    setGerando(true);
    const r = await sugerirRoteiros({
      tipoImovel: ctxTipo || null,
      bairro: ctxBairro || null,
      situacao: ctxSituacao || null,
      captador: ctxCaptador || null,
      empresa: ctxEmpresa || null,
    });
    setGerando(false);
    if (!r.ok || !r.roteiros) {
      toast(r.mensagem || "A IA não respondeu agora.", "error");
      return;
    }
    setSugestoes(r.roteiros);
  }

  /** Leva a sugestão para o formulário de cadastro — ainda não salva nada. */
  function usarSugestao(s: RoteiroSugerido) {
    setEdicao({ id: uid(), nome: s.nome, roteiro: s.roteiro, canalSugerido: "", arquivada: false });
    setPainelIa(false);
    setSugestoes([]);
  }

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
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px", marginBottom: "14px" }}>
            {/* Sem chave no servidor o botão nem aparece — oferecer algo que
                só responderia "não configurado" é ruído. */}
            {iaDisponivel && (
              <button type="button" className="btn btn-sm" onClick={() => setPainelIa((v) => !v)}>
                {painelIa ? "Fechar sugestões" : "Sugerir com IA"}
              </button>
            )}
            <button type="button" className="btn btn-primary btn-sm" onClick={novaAbordagem}>
              Nova abordagem
            </button>
          </div>
        )}

        {painelIa && !edicao && (
          <div className="card" style={{ padding: "14px", marginBottom: "16px" }}>
            <div className="field-hint" style={{ marginBottom: "10px" }}>
              Descreva o cenário e a IA escreve 3 abordagens diferentes. Nada é salvo automaticamente —
              você escolhe uma, edita se quiser e só então cadastra.
            </div>
            <div className="field-row">
              <div className="field-group">
                <label>Seu nome (captador)</label>
                <input
                  type="text"
                  value={ctxCaptador}
                  onChange={(e) => setCtxCaptador(e.target.value)}
                  placeholder="Ex.: João"
                />
              </div>
              <div className="field-group">
                <label>Empresa / imobiliária</label>
                <input
                  type="text"
                  value={ctxEmpresa}
                  onChange={(e) => setCtxEmpresa(e.target.value)}
                  placeholder="Ex.: Imobiliária Atual"
                />
                <div className="field-hint">
                  A IA se apresenta com esses dados. O padrão da empresa fica em Configurações.
                </div>
              </div>
            </div>
            <div className="field-row">
              <div className="field-group">
                <label>Tipo de imóvel</label>
                <select value={ctxTipo} onChange={(e) => setCtxTipo(e.target.value)}>
                  <option value="">Qualquer</option>
                  {TIPOS_IMOVEL.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field-group">
                <label>Bairro / região</label>
                <input
                  type="text"
                  value={ctxBairro}
                  onChange={(e) => setCtxBairro(e.target.value)}
                  placeholder="Ex.: Gleba Palhano"
                />
              </div>
            </div>
            <div className="field-group">
              <label>Situação observada</label>
              <input
                type="text"
                value={ctxSituacao}
                onChange={(e) => setCtxSituacao(e.target.value)}
                placeholder="Ex.: não respondeu meus dois contatos por WhatsApp"
              />
              {/* Frase completa, não rótulo: "sem resposta" é ambíguo (o
                  proprietário não respondeu? o anúncio não teve interessados?)
                  e a IA escolhe um dos dois sem avisar. */}
              <div className="field-hint">
                Escreva em frase, não em rótulo. &quot;Sem resposta&quot; pode significar duas coisas
                opostas — e a IA vai escolher uma delas por você.
              </div>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button type="button" className="btn btn-primary btn-sm" onClick={gerar} disabled={gerando}>
                {gerando ? "Gerando..." : "Gerar sugestões"}
              </button>
            </div>

            {sugestoes.length > 0 && (
              <div className="notas-lista" style={{ marginTop: "14px" }}>
                {sugestoes.map((s, i) => (
                  <div className="nota-item" key={i}>
                    <div className="nota-data">
                      <span>{s.nome}</span>
                      <button type="button" className="btn btn-sm" onClick={() => usarSugestao(s)}>
                        Usar esta
                      </button>
                    </div>
                    <div className="nota-texto">{s.roteiro}</div>
                  </div>
                ))}
              </div>
            )}
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
