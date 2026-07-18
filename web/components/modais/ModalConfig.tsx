"use client";

/* ================================================================
   MODAL: CONFIGURAÇÕES
   Port de openConfigModal() + saveConfig() + carregarDadosDemo() +
   resetAllData() (app.js, seções 7 e 8).
   ================================================================ */
import { useState } from "react";
import { useSessao } from "@/components/SessaoProvider";
import { AGENDA_TYPES } from "@/lib/constantes";
import { apagarTodosOsDados, carregarDadosDemo, numOrNull, salvarConfig } from "@/lib/mutacoes";
import { useAppStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import { useUiModal } from "@/lib/uiModal";

export default function ModalConfig() {
  const fecharModal = useUiModal((s) => s.fecharModal);
  const abrirModal = useUiModal((s) => s.abrirModal);
  const { usuario } = useSessao();
  const config = useAppStore((s) => s.config);
  const totalAbordagens = useAppStore((s) => s.abordagens.length);

  const [comissao, setComissao] = useState(String(config.comissaoPercent));
  const [tipos, setTipos] = useState<string[]>(config.agendaTipos ?? []);
  const [novoTipo, setNovoTipo] = useState("");
  const [ocupado, setOcupado] = useState(false);

  function adicionarTipo() {
    const t = novoTipo.trim();
    if (!t) return;
    // Não duplica um fixo nem um já existente (ignorando maiúsc./minúsc.).
    const jaExiste =
      AGENDA_TYPES.some((f) => f.toLowerCase() === t.toLowerCase()) ||
      tipos.some((x) => x.toLowerCase() === t.toLowerCase());
    if (jaExiste) {
      toast("Esse tipo já existe.", "error");
      return;
    }
    setTipos([...tipos, t]);
    setNovoTipo("");
  }

  function removerTipo(t: string) {
    setTipos(tipos.filter((x) => x !== t));
  }

  async function salvar() {
    if (!usuario) return;
    setOcupado(true);
    const ok = await salvarConfig(
      { ...config, comissaoPercent: numOrNull(comissao) || 100, agendaTipos: tipos },
      usuario.id,
    );
    setOcupado(false);
    if (ok) fecharModal();
  }

  async function demo() {
    if (!usuario) return;
    setOcupado(true);
    const ok = await carregarDadosDemo(usuario.id);
    setOcupado(false);
    if (ok) fecharModal();
  }

  async function apagar() {
    if (!usuario) return;
    setOcupado(true);
    const ok = await apagarTodosOsDados(usuario.id);
    setOcupado(false);
    if (ok) fecharModal();
  }

  return (
    <>
      <div className="modal-head">
        <div className="modal-title">Configurações</div>
        <button type="button" className="icon-btn" onClick={fecharModal}>
          ✕
        </button>
      </div>
      <div className="modal-body">
        <div className="field-group">
          <label>Percentual de comissão sobre o aluguel</label>
          <input type="number" min="0" step="1" value={comissao} onChange={(e) => setComissao(e.target.value)} />
          <div className="field-hint">
            100% equivale a 1 mês de aluguel. Usado para calcular a comissão estimada de cada imóvel
            automaticamente.
          </div>
        </div>
        <div className="divider"></div>
        <div className="field-group">
          <label>Tipos de compromisso da agenda</label>
          <div className="field-hint" style={{ marginBottom: "10px" }}>
            Além dos tipos fixos ({AGENDA_TYPES.join(", ")}), crie os seus próprios (ex.: Avaliação,
            Sessão de fotos, Vistoria) para escolher ao marcar um compromisso.
          </div>
          {tipos.length > 0 && (
            <div className="config-tipos-lista">
              {tipos.map((t) => (
                <span key={t} className="config-tipo-chip">
                  {t}
                  <button type="button" aria-label={`Remover ${t}`} onClick={() => removerTipo(t)}>
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
          <div style={{ display: "flex", gap: "8px" }}>
            <input
              type="text"
              value={novoTipo}
              onChange={(e) => setNovoTipo(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  adicionarTipo();
                }
              }}
              placeholder="Novo tipo (ex.: Avaliação)"
              style={{ flex: 1 }}
            />
            <button type="button" className="btn" onClick={adicionarTipo}>
              Adicionar
            </button>
          </div>
        </div>
        <div className="divider"></div>
        <div className="field-group">
          <label>Abordagens de captação</label>
          <div className="field-hint" style={{ marginBottom: "10px" }}>
            Os roteiros que você usa ao abordar proprietários — o que você diz, não por onde diz.
            Ao registrar uma tentativa num imóvel você escolhe o roteiro usado, e o ranking em
            Relatórios mostra quais funcionam.
            {totalAbordagens > 0 && ` ${totalAbordagens} cadastrada(s).`}
          </div>
          <button type="button" className="btn" onClick={() => abrirModal("abordagens")}>
            Gerenciar abordagens
          </button>
        </div>
        <div className="divider"></div>
        <div className="field-group">
          <label>Conta</label>
          <div className="field-hint" style={{ marginBottom: "10px" }}>
            Logado como <strong>{usuario?.email}</strong>
          </div>
        </div>
        <div className="field-group">
          <label>Dados</label>
          <button
            type="button"
            className="btn"
            style={{ width: "100%", marginBottom: "8px" }}
            onClick={demo}
            disabled={ocupado}
          >
            Carregar dados de exemplo
          </button>
          <div className="field-hint" style={{ marginBottom: "14px" }}>
            Adiciona imóveis, metas e compromissos fictícios para você explorar o sistema.
          </div>
          <button type="button" className="btn btn-danger" style={{ width: "100%" }} onClick={apagar} disabled={ocupado}>
            Apagar todos os meus dados
          </button>
          <div className="field-hint">Remove permanentemente todos os imóveis, metas e compromissos desta conta.</div>
        </div>
      </div>
      <div className="modal-foot">
        <div></div>
        <div style={{ display: "flex", gap: "10px" }}>
          <button type="button" className="btn" onClick={fecharModal}>
            Fechar
          </button>
          <button type="button" className="btn btn-primary" onClick={salvar} disabled={ocupado}>
            Salvar
          </button>
        </div>
      </div>
    </>
  );
}
