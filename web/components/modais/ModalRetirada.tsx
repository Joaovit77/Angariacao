"use client";

/* ================================================================
   JANELA DE RETIRADA (Retirados, Fase C / C2)

   Substitui o confirm() do "Retirar da carteira": quem retira diz o
   motivo (obrigatório), a data (padrão hoje em Brasília, nunca no
   futuro) e, se quiser, uma observação. No modo "editar", corrige a
   retirada de um imóvel já retirado, inclusive as antigas sem dados:
   ali motivo e data podem continuar "não informados", e uma data que
   ninguém sabe nunca vira hoje (D5A).

   Só o ModalImovel abre esta janela, com o modo explícito. Se o imóvel
   já não estiver no estado esperado pelo modo, nada é gravado.
   ================================================================ */
import { useMemo, useState } from "react";
import { useSessao } from "@/components/SessaoProvider";
import { MOTIVOS_RETIRADA } from "@/lib/constantes";
import {
  LIMITE_OBSERVACAO_RETIRADA,
  tamanhoObservacaoRetirada,
  validarRetirada,
  type ModoRetirada,
} from "@/lib/calculo/retiradaCarteira";
import { agoraTimestamp, dataOperacionalDeTimestamp } from "@/lib/datas";
import { definirRetiradoDaCarteira, editarRetiradaDaCarteira } from "@/lib/mutacoes";
import { useAppStore } from "@/lib/store";
import { useUiModal } from "@/lib/uiModal";

export default function ModalRetirada({ imovelId, modo }: { imovelId: string; modo: ModoRetirada }) {
  const { usuario } = useSessao();
  const fecharModal = useUiModal((s) => s.fecharModal);
  const abrirModal = useUiModal((s) => s.abrirModal);
  const imovel = useAppStore((s) => s.imoveis.find((i) => i.id === imovelId) ?? null);
  const hoje = useMemo(() => dataOperacionalDeTimestamp(agoraTimestamp()) || "", []);
  const editar = modo === "editar";

  const [motivo, setMotivo] = useState<string>(editar ? imovel?.retiradoMotivo ?? "" : "");
  const [observacao, setObservacao] = useState<string>(editar ? imovel?.retiradoObservacao ?? "" : "");
  // Criar: hoje em Brasília. Editar: a data gravada, ou vazio quando ninguém sabe.
  const [data, setData] = useState<string>(editar ? imovel?.retiradoEm ?? "" : hoje);
  const [erro, setErro] = useState("");
  const [salvando, setSalvando] = useState(false);

  // O modo tem que bater com o imóvel; senão a janela não grava nada.
  const estadoValido = !!imovel && (editar ? imovel.retirado === true : imovel.retirado !== true);
  const tamanho = tamanhoObservacaoRetirada(observacao.trim());

  const voltar = () => abrirModal("imovel", imovelId);

  async function salvar() {
    if (!usuario || !imovel || !estadoValido || salvando) return;
    const conferido = validarRetirada({ motivo, observacao, data }, modo, hoje);
    if (!conferido.ok) {
      setErro(conferido.erro);
      return;
    }
    setErro("");
    setSalvando(true);
    const { motivo: m, observacao: o, data: d } = conferido.dados;
    const ok = editar
      ? await editarRetiradaDaCarteira(imovelId, { motivo: m, observacao: o, data: d })
      : m && d
        ? await definirRetiradoDaCarteira(imovelId, true, usuario.id, { motivo: m, observacao: o, data: d })
        : false;
    setSalvando(false);
    // Falhou (erro do banco ou o imóvel mudou no meio): a janela continua
    // aberta, com o que foi digitado. A mutação já avisou o motivo.
    if (!ok) return;
    if (editar) voltar();
    else fecharModal();
  }

  return (
    <>
      <div className="modal-head">
        <div className="modal-title">{editar ? "Editar retirada" : "Retirar da carteira"}</div>
        <button type="button" className="icon-btn" onClick={voltar} aria-label="Fechar">
          ✕
        </button>
      </div>
      <div className="modal-body">
        {imovel ? (
          <p className="section-note" style={{ marginBottom: "14px" }}>
            <strong>{imovel.codigo || imovel.endereco}</strong>
            {imovel.codigo && imovel.endereco ? ` · ${imovel.endereco}` : ""}
            <br />
            {editar
              ? "Corrija a data, o motivo e a observação da retirada. O imóvel continua em Retirados."
              : "O imóvel sai do Pipeline ativo e fica em Retirados. Status, histórico, notas e tentativas continuam como estão. Alterações não salvas no cadastro serão descartadas."}
          </p>
        ) : null}
        {!estadoValido ? (
          <p className="field-hint" role="alert" data-retirada-estado-invalido>
            O imóvel mudou enquanto a janela estava aberta. Recarregue.
          </p>
        ) : null}
        <div className="field-group">
          <label htmlFor="retirada-motivo">Motivo da retirada</label>
          <select id="retirada-motivo" value={motivo} onChange={(e) => setMotivo(e.target.value)} disabled={salvando}>
            <option value="">{editar ? "Não informado" : "Selecione o motivo"}</option>
            {MOTIVOS_RETIRADA.map((m) => (
              <option key={m.id} value={m.id}>
                {m.rotulo}
              </option>
            ))}
          </select>
        </div>
        <div className="field-group">
          <label htmlFor="retirada-observacao">Observação</label>
          <textarea
            id="retirada-observacao"
            rows={4}
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            disabled={salvando}
            placeholder={motivo === "outro" ? "Obrigatória: descreva o que aconteceu" : "Opcional"}
          />
          <div className="field-hint" data-retirada-contador>
            {tamanho}/{LIMITE_OBSERVACAO_RETIRADA}
            {motivo === "outro" ? " · obrigatória quando o motivo é Outro" : ""}
          </div>
        </div>
        <div className="field-group">
          <label htmlFor="retirada-data">Data da retirada</label>
          <input
            id="retirada-data"
            type="date"
            value={data}
            max={hoje}
            onChange={(e) => setData(e.target.value)}
            disabled={salvando}
          />
          {editar ? <div className="field-hint">Deixe em branco se a data não é conhecida.</div> : null}
        </div>
        {erro ? (
          <p className="field-hint" role="alert" data-retirada-erro>
            {erro}
          </p>
        ) : null}
      </div>
      <div className="modal-foot">
        <div />
        <div style={{ display: "flex", gap: 10 }}>
          <button type="button" className="btn" onClick={voltar} disabled={salvando}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={salvar}
            disabled={salvando || !estadoValido}
          >
            {salvando ? "Salvando…" : editar ? "Salvar retirada" : "Retirar da carteira"}
          </button>
        </div>
      </div>
    </>
  );
}
