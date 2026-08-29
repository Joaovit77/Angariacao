"use client";

/* ================================================================
   MODAL: HISTÓRICO DE INTERAÇÕES (NOTAS)
   Registro cronológico de conversas com o proprietário do imóvel.
   As notas moram na coluna jsonb `notas` da tabela imoveis (mesmo
   padrão do status_history). O modal fica aberto após adicionar —
   só o campo é limpo — para permitir registrar várias em sequência.
   ================================================================ */
import { useState } from "react";
import { fmtDataHora } from "@/lib/formatadores";
import { selecionarMensagensAtendimento } from "@/lib/ia/atendimento";
import { rascunharResposta } from "@/lib/ia";
import {
  importarConversaSelecionada,
  preverImportacaoConversa,
} from "@/lib/importacaoConversaWhatsapp";
import { adicionarNotaImovel, excluirNotaImovel } from "@/lib/mutacoes";
import { useAppStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import { useUiModal } from "@/lib/uiModal";
import type { MensagemRecenteWhatsapp } from "@/lib/calculo/importacaoConversaWhatsapp";

export default function ModalNotas({ imovelId }: { imovelId: string }) {
  const fecharModal = useUiModal((s) => s.fecharModal);
  const abrirWhatsappRascunho = useUiModal((s) => s.abrirWhatsappRascunho);
  const imovel = useAppStore((s) => s.imoveis.find((i) => i.id === imovelId));
  const iaDisponivel = useAppStore((s) => s.iaDisponivel);
  const [texto, setTexto] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [buscandoConversa, setBuscandoConversa] = useState(false);
  const [importandoConversa, setImportandoConversa] = useState(false);
  const [rascunhando, setRascunhando] = useState(false);
  const [mensagensRecentes, setMensagensRecentes] = useState<MensagemRecenteWhatsapp[] | null>(null);
  const [selecionadas, setSelecionadas] = useState<Set<string>>(new Set());

  if (!imovel) return null;

  const notas = [...(imovel.notas || [])].sort((a, b) => b.data.localeCompare(a.data));
  const contexto = selecionarMensagensAtendimento(imovel);
  const telefoneProprietario = imovel.proprietarioTelefone || "";
  const podeRascunhar = iaDisponivel && !!telefoneProprietario && !!contexto.mensagemAtual;

  async function adicionar() {
    if (!texto.trim() || salvando) return;
    setSalvando(true);
    const ok = await adicionarNotaImovel(imovelId, texto);
    setSalvando(false);
    if (ok) setTexto("");
  }

  async function buscarConversaRecente() {
    if (buscandoConversa || !telefoneProprietario) return;
    setBuscandoConversa(true);
    const resultado = await preverImportacaoConversa(imovelId);
    setBuscandoConversa(false);
    if (!resultado.ok) {
      toast(resultado.mensagem || "Não foi possível consultar a conversa agora.", "error");
      return;
    }
    const mensagens = resultado.mensagens || [];
    setMensagensRecentes(mensagens);
    setSelecionadas(new Set(mensagens.filter((m) => !m.jaImportada).map((m) => m.id)));
  }

  function alternarMensagem(id: string) {
    setSelecionadas((atuais) => {
      const proximas = new Set(atuais);
      if (proximas.has(id)) proximas.delete(id);
      else proximas.add(id);
      return proximas;
    });
  }

  async function importarConversa() {
    if (importandoConversa || selecionadas.size === 0) return;
    setImportandoConversa(true);
    const resultado = await importarConversaSelecionada(imovelId, [...selecionadas]);
    setImportandoConversa(false);
    if (!resultado.ok) {
      toast(resultado.mensagem || "Não foi possível importar a conversa.", "error");
      return;
    }

    const importadas = resultado.importadas || [];
    if (importadas.length > 0) {
      // A rota já gravou primeiro. Só agora o store acompanha o banco, mesma
      // ordem de todas as mutações do projeto.
      const estado = useAppStore.getState();
      estado.setImoveis(
        estado.imoveis.map((item) => {
          if (item.id !== imovelId) return item;
          const ids = new Set((item.notas || []).map((nota) => nota.id));
          return { ...item, notas: [...(item.notas || []), ...importadas.filter((nota) => !ids.has(nota.id))] };
        }),
      );
    }
    const idsImportados = new Set(importadas.map((nota) => nota.id.split(":").slice(1).join(":")));
    setMensagensRecentes((atuais) =>
      (atuais || []).map((mensagem) =>
        idsImportados.has(mensagem.id) ? { ...mensagem, jaImportada: true } : mensagem,
      ),
    );
    setSelecionadas(new Set());
    toast(
      importadas.length === 1
        ? "1 mensagem adicionada ao contexto da IA."
        : `${importadas.length} mensagens adicionadas ao contexto da IA.`,
    );
  }

  async function rascunharComContexto() {
    if (rascunhando) return;
    setRascunhando(true);
    const resultado = await rascunharResposta(imovelId, "notas");
    setRascunhando(false);
    if (resultado.ok && resultado.rascunho) {
      abrirWhatsappRascunho(
        imovelId,
        resultado.rascunho,
        resultado.protocolosUsados,
        resultado.sugestaoId
          ? { id: resultado.sugestaoId, textoSugerido: resultado.rascunho }
          : undefined,
      );
    } else {
      toast(resultado.mensagem || "A IA não conseguiu rascunhar a resposta agora.", "error");
    }
  }

  return (
    <>
      <div className="modal-head">
        <div className="modal-title">Histórico de interações — {imovel.codigo || imovel.endereco}</div>
        <button type="button" className="icon-btn" onClick={fecharModal}>
          ✕
        </button>
      </div>
      <div className="modal-body">
        <section className="importacao-conversa">
          <div className="importacao-conversa-topo">
            <div>
              <strong>Contexto anterior do WhatsApp</strong>
              <p>
                Importe mensagens anteriores ao cadastro para a IA entender a conversa. Elas não alteram
                status, agenda ou ranking.
              </p>
            </div>
            <button
              type="button"
              className="btn btn-sm"
              onClick={buscarConversaRecente}
              disabled={buscandoConversa || !telefoneProprietario}
              title={!telefoneProprietario ? "Cadastre o telefone do proprietário primeiro" : undefined}
            >
              {buscandoConversa ? "Buscando..." : mensagensRecentes ? "Buscar novamente" : "Importar conversa recente"}
            </button>
          </div>

          {mensagensRecentes && mensagensRecentes.length === 0 && (
            <p className="section-note">
              Nenhuma mensagem recente foi encontrada. A Evolution pode não ter guardado esse período.
            </p>
          )}

          {mensagensRecentes && mensagensRecentes.length > 0 && (
            <>
              <div className="importacao-conversa-lista">
                {mensagensRecentes.map((mensagem) => (
                  <label
                    className={`importacao-conversa-item ${mensagem.direcao}`}
                    key={mensagem.id}
                  >
                    <input
                      type="checkbox"
                      checked={mensagem.jaImportada || selecionadas.has(mensagem.id)}
                      disabled={mensagem.jaImportada || importandoConversa}
                      onChange={() => alternarMensagem(mensagem.id)}
                    />
                    <span className="importacao-conversa-conteudo">
                      <span className="importacao-conversa-meta">
                        <strong>{mensagem.direcao === "enviada" ? "Você" : "Proprietário"}</strong>
                        <span>{fmtDataHora(mensagem.data)}</span>
                        {mensagem.jaImportada && <span className="badge">já importada</span>}
                      </span>
                      <span>{mensagem.texto}</span>
                    </span>
                  </label>
                ))}
              </div>
              <div className="importacao-conversa-acoes">
                <span className="section-note">
                  {selecionadas.size} {selecionadas.size === 1 ? "mensagem selecionada" : "mensagens selecionadas"}
                </span>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={importarConversa}
                  disabled={selecionadas.size === 0 || importandoConversa}
                >
                  {importandoConversa ? "Importando..." : "Adicionar ao contexto da IA"}
                </button>
              </div>
            </>
          )}
        </section>

        <div className="field-group">
          <label>Nova nota</label>
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Ex.: Liguei para o proprietário, ficou de responder até sexta..."
            style={{ width: "100%", minHeight: "80px" }}
          />
          <div className="field-hint">
            Registre aqui cada contato com o proprietário para manter o histórico da negociação.
          </div>
        </div>
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: "14px" }}>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={adicionar}
            disabled={!texto.trim() || salvando}
          >
            Adicionar nota
          </button>
        </div>
        {notas.length === 0 ? (
          <p className="section-note">Nenhuma nota registrada ainda.</p>
        ) : (
          <div className="notas-lista">
            {notas.map((n) => (
              <div className="nota-item" key={n.id}>
                <div className="nota-data">
                  <span>
                    {fmtDataHora(n.data)}
                    {n.origem === "importacao-evolution" && <span className="badge">contexto importado</span>}
                  </span>
                  <button
                    type="button"
                    className="icon-btn btn-danger"
                    title="Excluir nota"
                    onClick={() => excluirNotaImovel(imovelId, n.id)}
                  >
                    ×
                  </button>
                </div>
                <div className="nota-texto">{n.texto}</div>
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="modal-foot">
        <div>
          {podeRascunhar && (
            <button type="button" className="btn" onClick={rascunharComContexto} disabled={rascunhando}>
              {rascunhando ? "Rascunhando..." : "✨ Rascunhar resposta com a IA"}
            </button>
          )}
        </div>
        <button type="button" className="btn" onClick={fecharModal}>
          Fechar
        </button>
      </div>
    </>
  );
}
