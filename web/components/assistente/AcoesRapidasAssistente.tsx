"use client";

import { type FormEvent, useMemo, useState } from "react";
import { addDaysISO, todayISO } from "@/lib/datas";
import { useAppStore } from "@/lib/store";
import { useEstadoAssistente } from "./AssistenteProvider";
import { useContextoAssistenteAtual } from "./useContextoAssistenteAtual";
import styles from "./Assistente.module.css";

export default function AcoesRapidasAssistente({ modo = "atalhos" }: { modo?: "atalhos" | "lateral" }) {
  const imoveis = useAppStore((estado) => estado.imoveis);
  const { contexto } = useContextoAssistenteAtual();
  const { carregando, processandoAcaoId, enviar, prepararVisita } = useEstadoAssistente();
  const [formularioAberto, setFormularioAberto] = useState(false);
  const [imovelId, setImovelId] = useState("");
  const [data, setData] = useState(() => addDaysISO(todayISO(), 1) || todayISO());
  const [hora, setHora] = useState("15:00");
  const indisponivel = carregando || !!processandoAcaoId;
  const ordenados = useMemo(
    () => imoveis.slice().sort((a, b) => (a.codigo || a.endereco).localeCompare(b.codigo || b.endereco)),
    [imoveis],
  );

  async function preparar(event: FormEvent) {
    event.preventDefault();
    const imovel = ordenados.find((item) => item.id === imovelId);
    if (!imovel || !data || !hora) return;
    await prepararVisita({
      imovelId: imovel.id,
      imovelCodigo: imovel.codigo || "imóvel sem código",
      data,
      hora,
    });
    setFormularioAberto(false);
  }

  return (
    <section className={modo === "lateral" ? styles.acoesLaterais : styles.atalhosChat} aria-label="Ações rápidas do Assistente">
      {modo === "lateral" && <h2><span aria-hidden="true">⚡</span> Ações rápidas</h2>}
      <div className={styles.acoesGrade}>
        <button type="button" onClick={() => setFormularioAberto((aberto) => !aberto)} disabled={indisponivel}>
          <span aria-hidden="true">▣</span>
          <strong>Agendar visita</strong>
          {modo === "lateral" && <small>Prepare um compromisso na agenda</small>}
        </button>
        <button
          type="button"
          onClick={() => void enviar(contexto, "Quais são os compromissos de hoje?")}
          disabled={indisponivel}
        >
          <span aria-hidden="true">◷</span>
          <strong>Ver agenda de hoje</strong>
          {modo === "lateral" && <small>Consulta direta, sem alteração</small>}
        </button>
      </div>

      {formularioAberto && (
        <form className={styles.acaoGuiada} onSubmit={preparar}>
          <strong>Agendar visita</strong>
          <label>
            Imóvel
            <select value={imovelId} onChange={(evento) => setImovelId(evento.target.value)} required>
              <option value="">Selecione</option>
              {ordenados.map((imovel) => (
                <option value={imovel.id} key={imovel.id}>{imovel.codigo || imovel.endereco}</option>
              ))}
            </select>
          </label>
          <div>
            <label>
              Data
              <input type="date" min={todayISO()} value={data} onChange={(evento) => setData(evento.target.value)} required />
            </label>
            <label>
              Horário
              <input type="time" value={hora} onChange={(evento) => setHora(evento.target.value)} required />
            </label>
          </div>
          <small>Nada será criado antes de você revisar e confirmar o card.</small>
          <button type="submit" disabled={indisponivel || !imovelId}>Preparar confirmação</button>
        </form>
      )}
    </section>
  );
}
