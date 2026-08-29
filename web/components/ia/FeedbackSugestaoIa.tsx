"use client";

import { useState } from "react";
import { registrarFeedbackSugestaoIa } from "@/lib/feedbackSugestaoIa";
import {
  MOTIVOS_REJEICAO_SUGESTAO_IA,
  ROTULOS_MOTIVOS_REJEICAO_SUGESTAO_IA,
  type MotivoRejeicaoSugestaoIa,
  type ReferenciaSugestaoIa,
  type ResultadoFeedbackSugestaoIa,
} from "@/lib/ia/feedback";

export default function FeedbackSugestaoIa({
  sugestao,
  desabilitado = false,
  aoEditar,
  aoSalvar,
}: {
  sugestao: ReferenciaSugestaoIa;
  desabilitado?: boolean;
  aoEditar: () => void;
  aoSalvar: (resultado: ResultadoFeedbackSugestaoIa) => void;
}) {
  const [salvando, setSalvando] = useState(false);
  const [rejeicaoAberta, setRejeicaoAberta] = useState(false);
  const [motivo, setMotivo] = useState<MotivoRejeicaoSugestaoIa | "">("");
  const [comentario, setComentario] = useState("");
  const [erro, setErro] = useState("");
  const [editando, setEditando] = useState(false);
  const resultadoSalvo = sugestao.feedbackResultado;

  async function salvarAprovacao() {
    if (salvando) return;
    setSalvando(true);
    setErro("");
    const resposta = await registrarFeedbackSugestaoIa({
      sugestaoId: sugestao.id,
      resultado: "aprovado",
    });
    setSalvando(false);
    if (!resposta.ok) {
      setErro(resposta.mensagem);
      return;
    }
    setEditando(false);
    setRejeicaoAberta(false);
    aoSalvar(resposta.resultado);
  }

  async function salvarRejeicao() {
    if (salvando) return;
    setSalvando(true);
    setErro("");
    const resposta = await registrarFeedbackSugestaoIa({
      sugestaoId: sugestao.id,
      resultado: "rejeitado",
      motivo: motivo || null,
      comentario: comentario.trim() || null,
    });
    setSalvando(false);
    if (!resposta.ok) {
      setErro(resposta.mensagem);
      return;
    }
    setEditando(false);
    setRejeicaoAberta(false);
    aoSalvar(resposta.resultado);
  }

  function editar() {
    setEditando(true);
    aoEditar();
  }

  return (
    <div className="ia-feedback" aria-label="Avaliar sugestão da IA">
      <div className="ia-feedback-acoes">
        <span className="ia-feedback-rotulo">Esta sugestão ajudou?</span>
        <button
          type="button"
          className={resultadoSalvo === "aprovado" ? "ativo" : ""}
          onClick={() => void salvarAprovacao()}
          disabled={desabilitado || salvando}
        >
          👍 Usaria assim
        </button>
        <button type="button" onClick={editar} disabled={desabilitado || salvando}>
          ✏️ Editar
        </button>
        <button
          type="button"
          className={resultadoSalvo === "rejeitado" ? "ativo rejeitado" : ""}
          onClick={() => {
            setErro("");
            setRejeicaoAberta((aberta) => !aberta);
          }}
          disabled={desabilitado || salvando}
          aria-expanded={rejeicaoAberta}
        >
          👎 Não gostei
        </button>
      </div>

      {salvando ? <span className="ia-feedback-estado">Salvando feedback…</span> : null}
      {resultadoSalvo ? (
        <span className="ia-feedback-estado salvo">
          Feedback salvo{resultadoSalvo === "editado" ? ": versão editada enviada" : ""}.
          {" "}Você pode mudar a avaliação.
        </span>
      ) : null}
      {editando ? (
        <span className="ia-feedback-estado">Ajuste o texto e envie para registrar a versão final.</span>
      ) : null}
      {erro ? <span className="ia-feedback-estado erro" role="alert">{erro}</span> : null}

      {rejeicaoAberta ? (
        <div className="ia-feedback-rejeicao">
          <label>
            Motivo opcional
            <select
              value={motivo}
              onChange={(evento) => setMotivo(evento.target.value as MotivoRejeicaoSugestaoIa | "")}
              disabled={salvando}
            >
              <option value="">Não informar</option>
              {MOTIVOS_REJEICAO_SUGESTAO_IA.map((item) => (
                <option value={item} key={item}>{ROTULOS_MOTIVOS_REJEICAO_SUGESTAO_IA[item]}</option>
              ))}
            </select>
          </label>
          <label>
            Comentário opcional
            <textarea
              value={comentario}
              onChange={(evento) => setComentario(evento.target.value.slice(0, 500))}
              placeholder={'Ex.: Não gosto de começar com "Gostaria de".'}
              maxLength={500}
              disabled={salvando}
            />
          </label>
          <div className="ia-feedback-rejeicao-acoes">
            <button type="button" onClick={() => setRejeicaoAberta(false)} disabled={salvando}>Cancelar</button>
            <button type="button" className="principal" onClick={() => void salvarRejeicao()} disabled={salvando}>
              Salvar feedback
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
