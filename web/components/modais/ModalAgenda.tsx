"use client";

/* ================================================================
   MODAL: COMPROMISSO DA AGENDA
   Port de openAgendaModal() + saveAgenda() (app.js, 5D).
   ================================================================ */
import { useState } from "react";
import { useSessao } from "@/components/SessaoProvider";
import { AGENDA_TYPES } from "@/lib/constantes";
import { todayISO } from "@/lib/datas";
import { excluirAgenda, salvarAgenda, uid } from "@/lib/mutacoes";
import { useAppStore } from "@/lib/store";
import { useUiModal } from "@/lib/uiModal";
import { toast } from "@/lib/toast";

export default function ModalAgenda({ id }: { id?: string }) {
  const fecharModal = useUiModal((s) => s.fecharModal);
  const { usuario } = useSessao();
  const agenda = useAppStore((s) => s.agenda);
  const imoveis = useAppStore((s) => s.imoveis);

  const item = id ? agenda.find((a) => a.id === id) || null : null;

  const [title, setTitle] = useState(item?.title ?? "");
  const [type, setType] = useState(item?.type ?? "Retorno ao proprietário");
  const [date, setDate] = useState(item?.date ?? todayISO());
  const [imovelId, setImovelId] = useState(item?.imovelId ?? "");
  const [notes, setNotes] = useState(item?.notes ?? "");
  const [salvando, setSalvando] = useState(false);

  const imoveisOptions = imoveis
    .slice()
    .sort((a, b) => (a.codigo || a.endereco).localeCompare(b.codigo || b.endereco));

  async function salvar() {
    if (!usuario) return;
    const titulo = title.trim();
    if (!titulo) {
      toast("Informe um título para o compromisso.", "error");
      return;
    }
    setSalvando(true);
    const ok = await salvarAgenda(
      {
        id: item ? item.id : uid(),
        title: titulo,
        type,
        date,
        imovelId: imovelId || null,
        notes: notes.trim(),
        done: item ? item.done : false,
        isVerificacaoDisponibilidade: item ? item.isVerificacaoDisponibilidade : false,
      },
      usuario.id,
    );
    setSalvando(false);
    if (ok) fecharModal();
  }

  async function excluir() {
    if (!item) return;
    await excluirAgenda(item.id);
    fecharModal();
  }

  return (
    <>
      <div className="modal-head">
        <div className="modal-title">{item ? "Editar compromisso" : "Novo compromisso"}</div>
        <button type="button" className="icon-btn" onClick={fecharModal}>
          ✕
        </button>
      </div>
      <div className="modal-body">
        <div className="field-group">
          <label>Título</label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Ex: Ligar para proprietário sobre documentação"
          />
        </div>
        <div className="field-row">
          <div className="field-group">
            <label>Tipo</label>
            <select value={type} onChange={(e) => setType(e.target.value)}>
              {AGENDA_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
          <div className="field-group">
            <label>Data</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
        </div>
        <div className="field-group">
          <label>Imóvel relacionado (opcional)</label>
          <select value={imovelId ?? ""} onChange={(e) => setImovelId(e.target.value)}>
            <option value="">Nenhum</option>
            {imoveisOptions.map((i) => (
              <option key={i.id} value={i.id}>
                {i.codigo || i.endereco}
              </option>
            ))}
          </select>
        </div>
        <div className="field-group">
          <label>Notas</label>
          <textarea value={notes ?? ""} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </div>
      <div className="modal-foot">
        <div>
          {item && (
            <button type="button" className="btn btn-ghost btn-danger" onClick={excluir}>
              Excluir
            </button>
          )}
        </div>
        <div style={{ display: "flex", gap: "10px" }}>
          <button type="button" className="btn" onClick={fecharModal}>
            Cancelar
          </button>
          <button type="button" className="btn btn-primary" onClick={salvar} disabled={salvando}>
            {item ? "Salvar" : "Adicionar"}
          </button>
        </div>
      </div>
    </>
  );
}
