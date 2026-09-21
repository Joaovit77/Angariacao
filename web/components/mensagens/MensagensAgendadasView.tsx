"use client";

import { useMemo } from "react";
import { explicarMensagemAgendada } from "@/lib/calculo/explicacaoMensagemAgendada";
import { agoraISOString, fmtDataHoraIso } from "@/lib/datas";
import type { MensagemAgendada } from "@/lib/mensagensAgendadas";
import { getSupabase } from "@/lib/persistencia/supabase";
import { useAppStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import { useMensagensAgendadas } from "@/lib/useMensagensAgendadas";
import { useUiModal } from "@/lib/uiModal";

export default function MensagensAgendadasView({ incorporada = false }: { incorporada?: boolean }) {
  const abrirModal = useUiModal((estado) => estado.abrirModal);
  const { itens, carregando, erro, recarregar } = useMensagensAgendadas();
  // Códigos dos imóveis já carregados na conta, para a mensagem consolidada
  // dizer por quais imóveis perguntou sem consulta extra e sem UUID.
  const imoveis = useAppStore((s) => s.imoveis);
  const codigoDoImovel = useMemo(() => {
    const porId = new Map(imoveis.map((imovel) => [imovel.id, imovel.codigo?.trim() || null]));
    return (id: string) => porId.get(id) ?? null;
  }, [imoveis]);

  async function cancelar(item: MensagemAgendada) {
    if (!confirm("Cancelar o envio desta mensagem?")) return;
    const canceladaEm = agoraISOString();
    const { error } = await getSupabase()
      .from("mensagens_agendadas")
      .update({
        status: "cancelada",
        cancelamento_motivo: "usuario",
        cancelamento_origem: "usuario",
        cancelada_em: canceladaEm,
        updated_at: canceladaEm,
      })
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
              {itens.map((item) => {
                // O que aconteceu com a mensagem, em linguagem operacional:
                // motivo de cancelamento, reprogramação, inclusão em outra
                // mensagem, imóveis consultados ou o que o erro significa.
                // O código técnico nunca chega à tela.
                const explicacao = explicarMensagemAgendada(item, { codigoDoImovel });
                return (
                <tr key={item.id}>
                  <td><strong>{item.nomeProprietario}</strong></td>
                  <td>{item.telefone}</td>
                  <td className="mensagem-trecho" title={item.mensagem}>{item.mensagem}</td>
                  <td>
                    {fmtDataHoraIso(item.dataEnvio)}
                    {item.enviadoEm ? <small>Enviada em {fmtDataHoraIso(item.enviadoEm)}</small> : null}
                  </td>
                  <td>
                    <span className="mensagem-status" data-status={item.status} data-tom={explicacao.tom}>{explicacao.rotulo}</span>
                    {explicacao.detalhes.map((detalhe) => (
                      <small key={detalhe} className="mensagem-explicacao">{detalhe}</small>
                    ))}
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
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
