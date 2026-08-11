"use client";

/* ================================================================
   MODAL: REGISTRAR NOVO CONTATO (verificação de disponibilidade)
   Port de concluirVerificacao() + confirmarConclusaoVerificacao()
   (app.js, 5D). Ao concluir, pede a data do novo contato e — se o
   imóvel ainda não estiver Locado — já agenda o próximo lembrete,
   encadeando enquanto não houver locação.
   ================================================================ */
import { useState } from "react";
import { useSessao } from "@/components/SessaoProvider";
import { VERIFICACAO_DISPONIBILIDADE_DIAS } from "@/lib/constantes";
import { todayISO } from "@/lib/datas";
import { confirmarConclusaoVerificacao } from "@/lib/mutacoes";
import { textoBaseDisponibilidade, textoFollowUp } from "@/lib/calculo/followup";
import { useAppStore } from "@/lib/store";
import { useUiModal } from "@/lib/uiModal";

export default function ModalVerificacao({ id }: { id: string }) {
  const fecharModal = useUiModal((s) => s.fecharModal);
  const abrirMensagemAgendadaDisponibilidade = useUiModal((s) => s.abrirMensagemAgendadaDisponibilidade);
  const { usuario } = useSessao();
  const agenda = useAppStore((s) => s.agenda);
  const imoveis = useAppStore((s) => s.imoveis);

  const item = agenda.find((a) => a.id === id) || null;
  const imovel = item?.imovelId ? imoveis.find((i) => i.id === item.imovelId) || null : null;

  const [dataContato, setDataContato] = useState(todayISO());
  const [salvando, setSalvando] = useState(false);

  async function confirmar() {
    if (!usuario) return;
    setSalvando(true);
    const ok = await confirmarConclusaoVerificacao(id, dataContato || todayISO(), usuario.id);
    setSalvando(false);
    if (ok) fecharModal();
  }

  function agendarMensagem() {
    if (!item?.imovelId || !imovel) return;
    abrirMensagemAgendadaDisponibilidade(
      item.imovelId,
      item.date,
      textoFollowUp(textoBaseDisponibilidade(), imovel),
    );
  }

  return (
    <>
      <div className="modal-head">
        <div className="modal-title">Registrar novo contato</div>
        <button type="button" className="icon-btn" onClick={fecharModal}>
          ✕
        </button>
      </div>
      <div className="modal-body">
        <p className="section-note" style={{ marginBottom: "14px" }}>
          {imovel && (
            <>
              Imóvel: <strong>{imovel.codigo || imovel.endereco}</strong>
            </>
          )}
        </p>
        <div className="field-group">
          <label>Data do contato com o proprietário</label>
          <input type="date" value={dataContato} onChange={(e) => setDataContato(e.target.value)} />
          <div className="field-hint">
            {`Se o imóvel continuar sem locação, o próximo lembrete é agendado automaticamente para ${VERIFICACAO_DISPONIBILIDADE_DIAS} dias após essa data.`}
          </div>
        </div>
      </div>
      <div className="modal-foot">
        <button
          type="button"
          className="btn btn-primary"
          onClick={agendarMensagem}
          disabled={!item?.imovelId || !imovel}
        >
          Agendar mensagem automática
        </button>
        <div style={{ display: "flex", gap: "10px" }}>
          <button type="button" className="btn" onClick={fecharModal}>
            Cancelar
          </button>
          <button type="button" className="btn btn-primary" onClick={confirmar} disabled={salvando}>
            Confirmar contato
          </button>
        </div>
      </div>
    </>
  );
}
