"use client";

import { useEffect, useState } from "react";
import { useSessao } from "@/components/SessaoProvider";
import { agoraISOString, agoraTimestamp, dataHoraLocalParaIso, fmtDataHoraIso, partesDataHoraLocal, timestampDeIso } from "@/lib/datas";
import { fromDbMensagem, telefoneValido, type DbMensagemAgendada } from "@/lib/mensagensAgendadas";
import { getSupabase } from "@/lib/persistencia/supabase";
import { useAppStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import { useUiModal } from "@/lib/uiModal";

export default function ModalMensagemAgendada({ id, imovelIdRelacionado }: { id?: string; imovelIdRelacionado?: string }) {
  const { usuario } = useSessao();
  const fecharModal = useUiModal((s) => s.fecharModal);
  const imoveis = useAppStore((s) => s.imoveis);
  const [modoDestinatario, setModoDestinatario] = useState<"cadastro" | "manual">("cadastro");
  const [imovelId, setImovelId] = useState(imovelIdRelacionado || "");
  const [buscaImovel, setBuscaImovel] = useState("");
  const [nomeManual, setNomeManual] = useState("");
  const [telefoneManual, setTelefoneManual] = useState("");
  const [mensagem, setMensagem] = useState("");
  const inicial = partesDataHoraLocal(undefined, 60 * 60 * 1000);
  const [data, setData] = useState(inicial.data);
  const [hora, setHora] = useState(inicial.hora);
  const [carregando, setCarregando] = useState(!!id);
  const [salvando, setSalvando] = useState(false);
  const imovel = imoveis.find((i) => i.id === imovelId) || null;
  const termoBusca = buscaImovel.trim().toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  const imoveisFiltrados = termoBusca
    ? imoveis.filter((i) => [i.proprietarioNome, i.codigo, i.endereco, i.proprietarioTelefone]
        .filter(Boolean).join(" ").toLocaleLowerCase("pt-BR").normalize("NFD").replace(/[\u0300-\u036f]/g, "").includes(termoBusca))
    : imoveis;

  useEffect(() => {
    if (!id) return;
    void getSupabase().from("mensagens_agendadas").select("*").eq("id", id).maybeSingle().then(({ data: row }) => {
      if (row) {
        const item = fromDbMensagem(row as DbMensagemAgendada);
        const partes = partesDataHoraLocal(item.dataEnvio);
        setModoDestinatario(item.imovelId ? "cadastro" : "manual");
        setImovelId(item.imovelId || ""); setNomeManual(item.nomeProprietario); setTelefoneManual(item.telefone);
        setMensagem(item.mensagem); setData(partes.data); setHora(partes.hora);
      }
      setCarregando(false);
    });
  }, [id]);

  async function salvar() {
    if (!usuario) return;
    if (modoDestinatario === "cadastro" && !imovel) return toast("Selecione um proprietário/imóvel.", "error");
    const nomeProprietario = modoDestinatario === "cadastro" ? imovel?.proprietarioNome?.trim() || "Proprietário" : nomeManual.trim();
    const telefone = modoDestinatario === "cadastro" ? imovel?.proprietarioTelefone?.trim() || "" : telefoneManual.trim();
    if (!nomeProprietario) return toast("Informe o nome do proprietário.", "error");
    if (!telefoneValido(telefone)) return toast("O telefone do proprietário é inválido.", "error");
    if (!mensagem.trim()) return toast("Escreva a mensagem.", "error");
    const dataEnvio = dataHoraLocalParaIso(data, hora);
    if (!dataEnvio) return toast("Informe data e horário válidos.", "error");
    if ((timestampDeIso(dataEnvio) || 0) <= agoraTimestamp()) return toast("Escolha uma data e hora futuras.", "error");
    const payload = { user_id: usuario.id, imovel_id: modoDestinatario === "cadastro" ? imovel!.id : null,
      nome_proprietario: nomeProprietario,
      telefone, mensagem: mensagem.trim(), data_envio: dataEnvio,
      status: "agendada", updated_at: agoraISOString() };
    setSalvando(true);
    const query = id ? getSupabase().from("mensagens_agendadas").update(payload).eq("id", id).eq("status", "agendada")
      : getSupabase().from("mensagens_agendadas").insert(payload);
    const { error } = await query;
    setSalvando(false);
    if (error) return toast("Não foi possível agendar: " + error.message, "error");
    toast(`Mensagem agendada com sucesso para ${fmtDataHoraIso(dataEnvio)}.`);
    window.dispatchEvent(new Event("mensagens-agendadas:alteradas"));
    fecharModal();
  }

  return <>
    <div className="modal-head"><div className="modal-title">{id ? "Editar mensagem agendada" : "Agendar mensagem"}</div>
      <button type="button" className="icon-btn" onClick={fecharModal}>✕</button></div>
    <div className="modal-body">
      {carregando ? <p>Carregando…</p> : <>
        <div className="resp-filtros mensagem-destinatario-modos">
          <button type="button" className={`resp-filtro${modoDestinatario === "cadastro" ? " active" : ""}`} onClick={() => setModoDestinatario("cadastro")} disabled={!!id}>Selecionar imóvel</button>
          <button type="button" className={`resp-filtro${modoDestinatario === "manual" ? " active" : ""}`} onClick={() => setModoDestinatario("manual")} disabled={!!id}>Preencher manualmente</button>
        </div>
        {modoDestinatario === "cadastro" ? <div className="field-group mensagem-destinatario-card"><div className="mensagem-destinatario-titulo"><label>Proprietário / imóvel</label><span>{imoveisFiltrados.length} disponíveis</span></div>
          <div className="mensagem-busca-wrap"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m16 16 5 5"/></svg>
            <input type="search" value={buscaImovel} onChange={(e) => { setBuscaImovel(e.target.value); setImovelId(""); }}
              placeholder="Digite o nome, código, endereço ou telefone" disabled={!!id} autoComplete="off" />
          </div>
          <select value={imovelId} onChange={(e) => setImovelId(e.target.value)} disabled={!!id}>
            <option value="">{termoBusca ? `${imoveisFiltrados.length} resultado(s)` : "Selecione"}</option>{imoveisFiltrados.map((i) => <option key={i.id} value={i.id}>{i.proprietarioNome || "Sem nome"} — {i.codigo || i.endereco}</option>)}
          </select>{termoBusca && imoveisFiltrados.length === 0 && <div className="field-hint">Nenhum imóvel ou proprietário encontrado.</div>}
          {imovel && <div className="mensagem-destinatario-selecionado"><span className="mensagem-destinatario-avatar" aria-hidden="true">{(imovel.proprietarioNome || "P").trim().charAt(0).toUpperCase()}</span><div><strong>{imovel.proprietarioNome || "Sem nome"}</strong><small>{imovel.codigo || imovel.endereco} · {imovel.proprietarioTelefone || "Sem telefone"}</small></div><span className="mensagem-destinatario-ok">✓ Selecionado</span></div>}</div> :
          <div className="field-row"><div className="field-group"><label>Nome do proprietário</label><input value={nomeManual} onChange={(e) => setNomeManual(e.target.value)} placeholder="Ex.: João da Silva" disabled={!!id} /></div>
            <div className="field-group"><label>Telefone</label><input type="tel" value={telefoneManual} onChange={(e) => setTelefoneManual(e.target.value)} placeholder="(43) 99999-9999" disabled={!!id} /></div></div>}
        <div className="field-group"><label>Mensagem</label><textarea rows={7} value={mensagem} onChange={(e) => setMensagem(e.target.value)} placeholder="Escreva qualquer mensagem personalizada" /></div>
        <div className="field-row"><div className="field-group"><label>Data do envio</label><input type="date" value={data} onChange={(e) => setData(e.target.value)} /></div>
          <div className="field-group"><label>Horário do envio</label><input type="time" value={hora} onChange={(e) => setHora(e.target.value)} /></div></div>
      </>}
    </div>
    <div className="modal-foot"><div /><div style={{display:"flex",gap:10}}><button className="btn" onClick={fecharModal}>Cancelar</button><button className="btn btn-primary" disabled={salvando || carregando} onClick={salvar}>{salvando ? "Agendando…" : "Agendar envio"}</button></div></div>
  </>;
}
