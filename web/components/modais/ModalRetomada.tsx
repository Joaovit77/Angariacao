"use client";
import { useEffect, useRef, useState } from "react";
import { dataPadraoRetomada, textoInicialRetomada, ERROS_RETOMADA, validarFormularioRetomada, validarImovelRetomada, type ErroRetomada } from "@/lib/calculo/retomada";
import { instanteParaISOOperacional } from "@/lib/datas";
import { requisitarRetomada } from "@/lib/retomadaCliente";
import type { ImovelRetomada, RegistroRetomada } from "@/lib/servidor/retomada";
import { toast } from "@/lib/toast";
import { useUiModal } from "@/lib/uiModal";

export default function ModalRetomada({ retomadaImovelId, id }: { retomadaImovelId: string; id?: string }) {
  const fechar = useUiModal((s) => s.fecharModal);
  const [contexto, setContexto] = useState<{ imovel: ImovelRetomada; programacao: RegistroRetomada | null } | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<ErroRetomada | null>(null);
  const [partes, setPartes] = useState(() => dataPadraoRetomada());
  const [texto, setTexto] = useState("");
  const [salvando, setSalvando] = useState(false);
  const emCurso = useRef(false);
  useEffect(() => {
    let ativa = true;
    void requisitarRetomada<{ imovel: ImovelRetomada; programacao: RegistroRetomada | null }>({ retomadaImovelId, id }).then((r) => {
      if (!ativa) return;
      if (!r.ok) setErro(r.erro);
      else {
        setContexto(r.valor);
        if (r.valor.programacao) {
          const instante = instanteParaISOOperacional(r.valor.programacao.data_envio);
          if (instante) setPartes({ data: instante.slice(0, 10), hora: instante.slice(11, 16) });
          setTexto(r.valor.programacao.mensagem);
        } else {
          setTexto(textoInicialRetomada(r.valor.imovel));
        }
      }
      setCarregando(false);
    });
    return () => { ativa = false; };
  }, [retomadaImovelId, id]);
  const programacao = contexto?.programacao;
  const erroImovel = contexto ? validarImovelRetomada(contexto.imovel) : null;
  const bloqueada = !contexto || !!erroImovel || (!!programacao && programacao.status !== "agendada");
  async function salvar(acao: "salvar" | "cancelar") {
    if (!contexto || emCurso.current) return;
    const falha = acao === "salvar" ? erroImovel || validarFormularioRetomada(partes.data, partes.hora, texto) : null;
    if (falha) { setErro(falha); return; }
    emCurso.current = true; setSalvando(true); setErro(null);
    const r = await requisitarRetomada<RegistroRetomada>({ retomadaImovelId }, {
      retomadaImovelId, ...(programacao ? { id: programacao.id, versao: programacao.updated_at } : {}),
      data: partes.data, hora: partes.hora, texto, acao,
    });
    emCurso.current = false; setSalvando(false);
    if (!r.ok) { setErro(r.erro); return; }
    toast(acao === "cancelar" ? "Programação de retomada cancelada." : "Retomada programada. O envio permanece desabilitado nesta etapa.");
    window.dispatchEvent(new Event("mensagens-agendadas:alteradas"));
    fechar();
  }
  return <>
    <div className="modal-head"><div className="modal-title">{programacao ? "Programação de retomada" : "Programar retomada"}</div><button type="button" className="icon-btn" aria-label="Fechar retomada" onClick={fechar} disabled={salvando}>✕</button></div>
    <div className="modal-body">
      <p className="section-note">{contexto?.imovel.retirado === false ? "O imóvel não está mais retirado." : "O imóvel continua retirado."} Programar retomada não reativa o imóvel: é uma tentativa futura de contato. O envio de WhatsApp permanece desabilitado nesta etapa.</p>
      {carregando ? <p>Carregando programação…</p> : contexto && <>
        <p>Estado: <strong>{programacao?.status ?? "Sem programação ativa"}</strong>{programacao?.cancelamento_motivo && ` · ${programacao.cancelamento_motivo === "imovel-reativado" ? "Imóvel reativado" : "Programação cancelada"}`}</p>
        <div className="field-group mensagem-destinatario-card"><label htmlFor="retomada-destinatario">Destinatário (somente leitura)</label><input id="retomada-destinatario" type="text" readOnly value={`${programacao?.nome_proprietario ?? contexto.imovel.proprietario_nome ?? "Proprietário"} · ${programacao?.telefone ?? contexto.imovel.proprietario_telefone ?? "Sem telefone"}`} /></div>
        <div className="field-group"><label>Preencher data</label><div className="resp-filtros">{([3, 6, 12] as const).map((meses) => <button type="button" className="resp-filtro" key={meses} disabled={bloqueada || salvando} onClick={() => setPartes(dataPadraoRetomada(meses))}>{meses} meses</button>)}</div></div>
        <div className="field-row"><div className="field-group"><label htmlFor="retomada-data">Data da retomada</label><input id="retomada-data" type="date" value={partes.data} disabled={bloqueada || salvando} onChange={(e) => setPartes({ ...partes, data: e.target.value })} /></div><div className="field-group"><label htmlFor="retomada-hora">Horário de Brasília</label><input id="retomada-hora" type="time" value={partes.hora} disabled={bloqueada || salvando} onChange={(e) => setPartes({ ...partes, hora: e.target.value })} /></div></div>
        <div className="field-group"><label htmlFor="retomada-texto">Texto da retomada</label><textarea id="retomada-texto" rows={6} value={texto} disabled={bloqueada || salvando} onChange={(e) => setTexto(e.target.value)} placeholder="Escreva a mensagem para o contato futuro" /></div>
        {programacao && programacao.status !== "agendada" && <p className="field-hint">Esta programação não pode ser editada neste estado.</p>}
      </>}
      {(erro || erroImovel) && <p role="alert" className="field-hint">{ERROS_RETOMADA[(erro || erroImovel)!]}</p>}
    </div>
    <div className="modal-foot"><div>{programacao?.status === "agendada" && <button type="button" className="btn btn-ghost btn-danger" disabled={salvando} onClick={() => { if (window.confirm("Cancelar esta programação de retomada?")) void salvar("cancelar"); }}>Cancelar programação</button>}</div><div className="modal-foot-primary"><button type="button" className="btn" onClick={fechar} disabled={salvando}>Fechar</button><button type="button" className="btn btn-primary" disabled={carregando || salvando || bloqueada} onClick={() => void salvar("salvar")}>{salvando ? "Salvando…" : programacao ? "Salvar programação" : "Programar retomada"}</button></div></div>
  </>;
}
