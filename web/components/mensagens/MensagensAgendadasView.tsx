"use client";

import { agoraISOString, fmtDataHoraIso } from "@/lib/datas";
import type { MensagemAgendada, StatusMensagemAgendada } from "@/lib/mensagensAgendadas";
import { getSupabase } from "@/lib/persistencia/supabase";
import { toast } from "@/lib/toast";
import { useMensagensAgendadas } from "@/lib/useMensagensAgendadas";
import { useUiModal } from "@/lib/uiModal";

const ROTULOS: Record<StatusMensagemAgendada, string> = {
  agendada: "Agendada",
  processando: "Processando",
  enviada: "Enviada",
  erro: "Erro",
  cancelada: "Cancelada",
};

export default function MensagensAgendadasView({ incorporada = false }: { incorporada?: boolean }) {
  const abrirModal = useUiModal((estado) => estado.abrirModal);
  const { itens, carregando, erro, recarregar } = useMensagensAgendadas();

  async function cancelar(item: MensagemAgendada) {
    if (!confirm("Cancelar o envio desta mensagem?")) return;
    const { error } = await getSupabase()
      .from("mensagens_agendadas")
      .update({ status: "cancelada", updated_at: agoraISOString() })
      .eq("id", item.id)
      .eq("status", "agendada");
    if (error) {
      toast("Não foi possível cancelar: " + error.message, "error");
      return;
    }
    toast("Envio cancelado.");
    window.dispatchEvent(new Event("mensagens-agendadas:alteradas"));
    await recarregar(true);
  }

  return (
    <>
      <div className="page-head">
        <div>
          {!incorporada ? <strong>Mensagens agendadas</strong> : null}
          <p className="page-sub">Envios automáticos para proprietários pelo WhatsApp conectado</p>
        </div>
        <button className="btn btn-primary" onClick={() => abrirModal("mensagemAgendada")}>
          Agendar mensagem
        </button>
      </div>

      {erro ? (
        <div className="empty-state" role="alert">
          <strong>Não foi possível carregar os agendamentos.</strong>
          <button className="btn btn-sm" type="button" onClick={() => void recarregar()}>
            Tentar novamente
          </button>
        </div>
      ) : carregando ? (
        <p role="status">Carregando…</p>
      ) : itens.length === 0 ? (
        <div className="empty-state">
          <strong>Nenhuma mensagem agendada.</strong>
          <p>Crie um envio para um proprietário e escolha a data e o horário.</p>
        </div>
      ) : (
        <div className="table-scroll">
          <table className="mensagens-table">
            <thead>
              <tr>
                <th>Proprietário</th>
                <th>Telefone</th>
                <th>Mensagem</th>
                <th>Envio</th>
                <th>Status</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {itens.map((item) => (
                <tr key={item.id}>
                  <td><strong>{item.nomeProprietario}</strong></td>
                  <td>{item.telefone}</td>
                  <td className="mensagem-trecho" title={item.mensagem}>{item.mensagem}</td>
                  <td>
                    {fmtDataHoraIso(item.dataEnvio)}
                    {item.enviadoEm ? <small>Enviada em {fmtDataHoraIso(item.enviadoEm)}</small> : null}
                  </td>
                  <td>
                    <span className="mensagem-status" data-status={item.status}>{ROTULOS[item.status]}</span>
                    {item.erro ? <small title={item.erro}>{item.erro}</small> : null}
                  </td>
                  <td>
                    {item.status === "agendada" ? (
                      <div className="mensagem-acoes">
                        <button className="btn btn-sm" onClick={() => abrirModal("mensagemAgendada", item.id)}>
                          Editar
                        </button>
                        <button className="btn btn-sm btn-ghost btn-danger" onClick={() => cancelar(item)}>
                          Cancelar
                        </button>
                      </div>
                    ) : (
                      <button className="btn btn-sm" onClick={() => alert(item.mensagem)}>Visualizar</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
