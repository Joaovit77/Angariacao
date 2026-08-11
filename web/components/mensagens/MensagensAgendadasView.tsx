"use client";

import { useCallback, useEffect, useState } from "react";
import { fromDbMensagem, type DbMensagemAgendada, type MensagemAgendada, type StatusMensagemAgendada } from "@/lib/mensagensAgendadas";
import { getSupabase } from "@/lib/persistencia/supabase";
import { toast } from "@/lib/toast";
import { useUiModal } from "@/lib/uiModal";
import { agoraISOString, fmtDataHoraIso } from "@/lib/datas";

const ROTULOS: Record<StatusMensagemAgendada, string> = { agendada: "Agendada", processando: "Processando", enviada: "Enviada", erro: "Erro", cancelada: "Cancelada" };

export default function MensagensAgendadasView({ incorporada = false }: { incorporada?: boolean }) {
  const abrirModal = useUiModal((s) => s.abrirModal);
  const [itens, setItens] = useState<MensagemAgendada[]>([]);
  const [carregando, setCarregando] = useState(true);
  const carregar = useCallback(async () => {
    const { data, error } = await getSupabase().from("mensagens_agendadas").select("*").order("data_envio", { ascending: false });
    if (error) toast("Não foi possível carregar as mensagens: " + error.message, "error");
    else setItens(((data || []) as DbMensagemAgendada[]).map(fromDbMensagem));
    setCarregando(false);
  }, []);
  useEffect(() => {
    const inicial = window.setTimeout(() => void carregar(), 0);
    const atualizar = () => void carregar();
    window.addEventListener("focus", atualizar); window.addEventListener("mensagens-agendadas:alteradas", atualizar);
    return () => { window.clearTimeout(inicial); window.removeEventListener("focus", atualizar); window.removeEventListener("mensagens-agendadas:alteradas", atualizar); };
  }, [carregar]);

  async function cancelar(item: MensagemAgendada) {
    if (!confirm("Cancelar o envio desta mensagem?")) return;
    const { error } = await getSupabase().from("mensagens_agendadas").update({ status: "cancelada", updated_at: agoraISOString() }).eq("id", item.id).eq("status", "agendada");
    if (error) return toast("Não foi possível cancelar: " + error.message, "error");
    toast("Envio cancelado."); void carregar();
  }

  return <>
    <div className="page-head"><div>{!incorporada && <h1 className="page-title">Mensagens agendadas</h1>}<p className="page-sub">Envios automáticos para proprietários pelo WhatsApp conectado</p></div>
      <button className="btn btn-primary" onClick={() => abrirModal("mensagemAgendada")}>Agendar mensagem</button></div>
    {carregando ? <p>Carregando…</p> : itens.length === 0 ? <div className="empty-state"><strong>Nenhuma mensagem agendada</strong><p>Crie um envio para um proprietário e escolha a data e o horário.</p></div> :
      <div className="table-scroll"><table className="mensagens-table"><thead><tr><th>Proprietário</th><th>Telefone</th><th>Mensagem</th><th>Envio</th><th>Status</th><th>Ações</th></tr></thead><tbody>
        {itens.map((item) => <tr key={item.id}><td><strong>{item.nomeProprietario}</strong></td><td>{item.telefone}</td><td className="mensagem-trecho" title={item.mensagem}>{item.mensagem}</td>
          <td>{fmtDataHoraIso(item.dataEnvio)}{item.enviadoEm && <small>Enviada em {fmtDataHoraIso(item.enviadoEm)}</small>}</td>
          <td><span className="mensagem-status" data-status={item.status}>{ROTULOS[item.status]}</span>{item.erro && <small title={item.erro}>{item.erro}</small>}</td>
          <td>{item.status === "agendada" ? <div className="mensagem-acoes"><button className="btn btn-sm" onClick={() => abrirModal("mensagemAgendada", item.id)}>Editar</button><button className="btn btn-sm btn-ghost btn-danger" onClick={() => cancelar(item)}>Cancelar</button></div> : <button className="btn btn-sm" onClick={() => alert(item.mensagem)}>Visualizar</button>}</td></tr>)}
      </tbody></table></div>}
  </>;
}
