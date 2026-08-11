"use client";

import { useMemo, useState } from "react";
import { useSessao } from "@/components/SessaoProvider";
import { textoBaseDisponibilidade, textoFollowUp } from "@/lib/calculo/followup";
import { agoraISOString, dataHoraLocalParaIso, partesDataHoraLocal, todayISO } from "@/lib/datas";
import { fmtDateLong } from "@/lib/formatadores";
import { telefoneValido, type DbMensagemAgendada } from "@/lib/mensagensAgendadas";
import { getSupabase } from "@/lib/persistencia/supabase";
import { useAppStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import type { AgendaItem, Imovel } from "@/lib/tipos";
import { useUiModal } from "@/lib/uiModal";

const INTERVALO_MINUTOS = 2;
const LIMITE_LOTE = 20;

interface Candidato {
  agenda: AgendaItem;
  imovel: Imovel;
}

function adicionarMinutos(hora: string, minutos: number): string {
  const [h, m] = hora.split(":").map(Number);
  const total = h * 60 + m + minutos;
  return `${String(Math.floor(total / 60) % 24).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

function chaveImovelDia(imovelId: string, data: string): string {
  return `${imovelId}:${data}`;
}

export default function ModalMensagemDisponibilidadeLote() {
  const fecharModal = useUiModal((s) => s.fecharModal);
  const { usuario } = useSessao();
  const agenda = useAppStore((s) => s.agenda);
  const imoveis = useAppStore((s) => s.imoveis);
  const hoje = todayISO();
  const horaPadrao = partesDataHoraLocal(undefined, 60 * 60 * 1000).hora;
  const [base, setBase] = useState(() => textoBaseDisponibilidade());
  const [horaInicial, setHoraInicial] = useState(horaPadrao);
  const [salvando, setSalvando] = useState(false);

  const candidatos = useMemo<Candidato[]>(() => {
    const porId = new Map(imoveis.map((i) => [i.id, i]));
    return agenda
      .filter((a) => a.isVerificacaoDisponibilidade && !a.done && a.imovelId && a.date >= hoje)
      .sort((a, b) => a.date.localeCompare(b.date))
      .flatMap((a) => {
        const imovel = a.imovelId ? porId.get(a.imovelId) : null;
        return imovel ? [{ agenda: a, imovel }] : [];
      });
  }, [agenda, imoveis, hoje]);

  const [marcados, setMarcados] = useState<Set<string>>(
    () => new Set(candidatos.filter((c) => telefoneValido(c.imovel.proprietarioTelefone || "")).slice(0, LIMITE_LOTE).map((c) => c.agenda.id)),
  );
  const escolhidos = candidatos.filter((c) => marcados.has(c.agenda.id));
  const previa = escolhidos[0] ? textoFollowUp(base, escolhidos[0].imovel) : "";

  function alternar(id: string) {
    setMarcados((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else if (novo.size < LIMITE_LOTE) novo.add(id);
      return novo;
    });
  }

  async function agendar() {
    if (!usuario || !base.trim() || escolhidos.length === 0) return;
    if (!horaInicial) return toast("Escolha o horário inicial.", "error");
    setSalvando(true);

    const ids = Array.from(new Set(escolhidos.map((c) => c.imovel.id)));
    const { data: existentes, error: erroConsulta } = await getSupabase()
      .from("mensagens_agendadas")
      .select("*")
      .in("imovel_id", ids)
      .in("status", ["agendada", "processando"]);
    if (erroConsulta) {
      setSalvando(false);
      return toast("Não foi possível conferir os agendamentos existentes: " + erroConsulta.message, "error");
    }

    const duplicadas = new Set(
      ((existentes || []) as DbMensagemAgendada[]).map((m) =>
        chaveImovelDia(m.imovel_id || "", partesDataHoraLocal(m.data_envio).data),
      ),
    );
    const porDia = new Map<string, number>();
    const agora = agoraISOString();
    const novas = escolhidos.flatMap(({ agenda: compromisso, imovel }) => {
      if (duplicadas.has(chaveImovelDia(imovel.id, compromisso.date))) return [];
      const posicao = porDia.get(compromisso.date) || 0;
      porDia.set(compromisso.date, posicao + 1);
      const hora = adicionarMinutos(horaInicial, posicao * INTERVALO_MINUTOS);
      const dataEnvio = dataHoraLocalParaIso(compromisso.date, hora);
      if (!dataEnvio) return [];
      return [{
        user_id: usuario.id,
        imovel_id: imovel.id,
        nome_proprietario: imovel.proprietarioNome?.trim() || "Proprietário",
        telefone: imovel.proprietarioTelefone?.trim() || "",
        mensagem: textoFollowUp(base, imovel),
        data_envio: dataEnvio,
        status: "agendada" as const,
        updated_at: agora,
      }];
    });

    if (novas.length === 0) {
      setSalvando(false);
      return toast("Todos os imóveis selecionados já possuem mensagem agendada para esse dia.");
    }
    const { error } = await getSupabase().from("mensagens_agendadas").insert(novas);
    setSalvando(false);
    if (error) return toast("Não foi possível agendar o lote: " + error.message, "error");
    const ignoradas = escolhidos.length - novas.length;
    toast(`${novas.length} ${novas.length === 1 ? "mensagem agendada" : "mensagens agendadas"}.${ignoradas ? ` ${ignoradas} duplicada${ignoradas > 1 ? "s" : ""} ignorada${ignoradas > 1 ? "s" : ""}.` : ""}`);
    window.dispatchEvent(new Event("mensagens-agendadas:alteradas"));
    fecharModal();
  }

  return <>
    <div className="modal-head">
      <div className="modal-title">Agendar verificações em lote</div>
      <button type="button" className="icon-btn" onClick={fecharModal} aria-label="Fechar">✕</button>
    </div>
    <div className="modal-body">
      <p className="section-note" style={{ marginBottom: 14 }}>
        Cada mensagem será enviada no dia do compromisso. Quando houver várias no mesmo dia, os envios serão espaçados em {INTERVALO_MINUTOS} minutos.
      </p>
      <div className="field-group">
        <label htmlFor="mensagem-lote-disponibilidade">Mensagem-base</label>
        <textarea id="mensagem-lote-disponibilidade" rows={6} value={base} onChange={(e) => setBase(e.target.value)} />
        <div className="field-hint">Use <strong>{"{nome}"}</strong> e <strong>{"{endereco}"}</strong>; o sistema personaliza cada mensagem.</div>
      </div>
      {previa && <div className="field-group"><label>Prévia</label><div className="followup-previa">{previa}</div></div>}
      <div className="field-group">
        <label htmlFor="hora-inicial-lote">Horário inicial de cada dia</label>
        <input id="hora-inicial-lote" type="time" value={horaInicial} onChange={(e) => setHoraInicial(e.target.value)} />
      </div>
      <div className="field-group">
        <label>Imóveis ({escolhidos.length} selecionados, limite de {LIMITE_LOTE})</label>
        <div className="followup-lista">
          {candidatos.map(({ agenda: compromisso, imovel }) => {
            const valido = telefoneValido(imovel.proprietarioTelefone || "");
            const marcado = marcados.has(compromisso.id);
            return <label className={`followup-item${marcado ? " ativa" : ""}`} key={compromisso.id}>
              <input type="checkbox" checked={marcado} disabled={!valido || (!marcado && escolhidos.length >= LIMITE_LOTE)} onChange={() => alternar(compromisso.id)} />
              <span className="followup-item-nome">{imovel.proprietarioNome || "Sem nome"} — {imovel.codigo || imovel.endereco}</span>
              <span className="followup-item-espera">{fmtDateLong(compromisso.date)}{!valido ? " · telefone inválido" : ""}</span>
            </label>;
          })}
        </div>
      </div>
    </div>
    <div className="modal-foot"><div /><div style={{ display: "flex", gap: 10 }}>
      <button type="button" className="btn" onClick={fecharModal}>Cancelar</button>
      <button type="button" className="btn btn-primary" disabled={salvando || !base.trim() || escolhidos.length === 0} onClick={agendar}>
        {salvando ? "Agendando…" : `Agendar ${escolhidos.length} ${escolhidos.length === 1 ? "mensagem" : "mensagens"}`}
      </button>
    </div></div>
  </>;
}
