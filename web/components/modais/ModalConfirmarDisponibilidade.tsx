"use client";

/* ================================================================
   MODAL: CONFIRMAR DISPONIBILIDADE EM LOTE
   O segundo lote. Pergunta de uma vez, aos proprietários de imóveis
   já angariados/publicados há tempo, se o imóvel ainda está
   disponível. Reaproveita toda a máquina do follow-up: a mesma fila
   (filaFollowUp), os mesmos freios anti-spam e o mesmo relatório de
   falhas — a diferença é o público e o texto.

   Sem seletor de abordagem, ao contrário do follow-up: confirmar
   disponibilidade não é roteiro de captação e não entra no ranking.
   Cada envio, além de registrar a tentativa, dá baixa no lembrete
   "Verificar disponibilidade" da agenda e reagenda o próximo — é o
   que impede o lote e o lembrete de cutucarem o mesmo proprietário
   pelos dois caminhos (efeito aposEnvioOk da fila).
   ================================================================ */
import { useMemo, useState } from "react";
import { useSessao } from "@/components/SessaoProvider";
import {
  avisoTextoLote,
  FOLLOWUP_LOTE_MAX,
  FOLLOWUP_TETO_DIA,
  selecionarVerificacaoDisponibilidade,
  textoBaseDisponibilidade,
  textoFollowUp,
  textoMotivoExclusao,
  ultimoContatoISO,
} from "@/lib/calculo/followup";
import { dataAngariadoEfetiva } from "@/lib/calculo/motor";
import { daysBetween, todayISO } from "@/lib/datas";
import { dispararLote, type ItemFila, useFilaFollowUp } from "@/lib/filaFollowUp";
import { registrarConfirmacaoDisponibilidade } from "@/lib/mutacoes";
import { useAppStore } from "@/lib/store";
import type { Imovel } from "@/lib/tipos";
import { useUiModal } from "@/lib/uiModal";

/** "Marta — Rua Haddock Lobo, 55". Curto o bastante para o indicador. */
function rotuloImovel(imovel: Imovel): string {
  const nome = (imovel.proprietarioNome || "").trim();
  const onde = (imovel.endereco || imovel.codigo || "imóvel sem endereço").trim();
  return nome ? `${nome} — ${onde}` : onde;
}

export default function ModalConfirmarDisponibilidade() {
  const fecharModal = useUiModal((s) => s.fecharModal);
  const { usuario } = useSessao();
  const imoveis = useAppStore((s) => s.imoveis);
  const rodando = useFilaFollowUp((s) => s.rodando);

  const hoje = todayISO();
  const selecao = useMemo(() => selecionarVerificacaoDisponibilidade(imoveis, hoje), [imoveis, hoje]);

  // O texto é fixo (não há abordagem), mas editável para este lote.
  const [base, setBase] = useState(() => textoBaseDisponibilidade());
  const [marcados, setMarcados] = useState<Set<string>>(
    () => new Set(selecao.elegiveis.slice(0, selecao.limite).map((i) => i.id)),
  );

  const escolhidos = selecao.elegiveis.filter((i) => marcados.has(i.id));
  const aviso = avisoTextoLote(base);
  const previa = escolhidos[0] ? textoFollowUp(base, escolhidos[0]) : "";
  const noLimite = escolhidos.length >= selecao.limite;

  function alternar(id: string) {
    setMarcados((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else if (novo.size < selecao.limite) novo.add(id);
      return novo;
    });
  }

  function enviar() {
    if (!usuario) return;
    const itens: ItemFila[] = escolhidos.map((imovel) => ({
      imovelId: imovel.id,
      rotulo: rotuloImovel(imovel),
      texto: textoFollowUp(base, imovel),
    }));
    // Sem abordagem (abordagemId null). O aposEnvioOk dá baixa no lembrete de
    // disponibilidade e reagenda o próximo, imóvel a imóvel, conforme a fila
    // confirma cada envio.
    void dispararLote(itens, null, {
      observacao: "Confirmação de disponibilidade em lote",
      modeloNome: "Confirmar disponibilidade",
      aposEnvioOk: (imovelId) => registrarConfirmacaoDisponibilidade(imovelId, hoje, usuario.id),
    });
    fecharModal();
  }

  /** "há 74 dias" — quanto tempo o proprietário está sem falar com você. */
  function esperaTexto(imovel: Imovel): string {
    const base = ultimoContatoISO(imovel) || dataAngariadoEfetiva(imovel);
    if (!base) return "sem contato registrado";
    const dias = daysBetween(base, hoje);
    if (dias === null) return "sem contato registrado";
    return dias === 1 ? "há 1 dia" : `há ${dias} dias`;
  }

  return (
    <>
      <div className="modal-head">
        <div className="modal-title">Confirmar disponibilidade em lote</div>
        <button type="button" className="icon-btn" onClick={fecharModal}>
          ✕
        </button>
      </div>

      <div className="modal-body">
        <p className="section-note" style={{ marginBottom: "14px" }}>
          Uma mensagem para cada proprietário de imóvel <strong>angariado ou publicado</strong> há
          bastante tempo, perguntando se ainda está disponível. As mensagens saem uma a uma, com
          intervalo de alguns minutos entre elas — é o que evita que o WhatsApp trate o envio como
          spam. Cada envio já dá baixa no lembrete de verificação da agenda e reagenda o próximo.
        </p>

        {rodando && (
          <p className="section-note" style={{ marginBottom: "14px" }}>
            Já existe um envio em andamento. Espere ele terminar (ou cancele no indicador de progresso)
            para montar outro lote.
          </p>
        )}

        <div className="field-group">
          <label>Mensagem</label>
          <textarea
            value={base}
            onChange={(e) => setBase(e.target.value)}
            style={{ width: "100%", minHeight: "130px" }}
          />
          <div className="field-hint">
            Vale só para este lote. Use <strong>{"{nome}"}</strong> e <strong>{"{endereco}"}</strong>{" "}
            para o texto se adaptar a cada proprietário.
          </div>
        </div>

        {aviso && (
          <p className="section-note followup-aviso" role="alert">
            ⚠️ {aviso}
          </p>
        )}

        {previa && (
          <div className="field-group">
            <label>Prévia — como chega para {escolhidos[0].proprietarioNome || "o primeiro da lista"}</label>
            <div className="followup-previa">{previa}</div>
          </div>
        )}

        <div className="field-group">
          <label>
            Enviar para ({escolhidos.length} de {selecao.limite})
          </label>
          {selecao.elegiveis.length === 0 ? (
            <p className="section-note">
              Nenhum imóvel angariado está pronto para confirmação de disponibilidade agora.
            </p>
          ) : selecao.limite === 0 ? (
            <p className="section-note">
              Você já enviou {selecao.enviadosHoje} mensagens hoje, o limite diário de{" "}
              {FOLLOWUP_TETO_DIA}. Continue amanhã — mandar mais num dia só é o que faz o WhatsApp
              marcar o número como spam.
            </p>
          ) : (
            <div className="followup-lista">
              {selecao.elegiveis.map((imovel) => {
                const marcado = marcados.has(imovel.id);
                return (
                  <label key={imovel.id} className={`followup-item${marcado ? " ativa" : ""}`}>
                    <input
                      type="checkbox"
                      checked={marcado}
                      disabled={!marcado && noLimite}
                      onChange={() => alternar(imovel.id)}
                    />
                    <span className="followup-item-nome">{rotuloImovel(imovel)}</span>
                    <span className="followup-item-espera">{esperaTexto(imovel)}</span>
                  </label>
                );
              })}
            </div>
          )}
          {selecao.elegiveis.length > selecao.limite && selecao.limite > 0 && (
            <div className="field-hint">
              {selecao.elegiveis.length} imóveis estão prontos, mas o lote vai até {FOLLOWUP_LOTE_MAX}{" "}
              por vez ({FOLLOWUP_TETO_DIA} por dia). Desmarque um para escolher outro; o resto continua
              na fila para as próximas rodadas.
            </div>
          )}
        </div>

        {selecao.excluidos.length > 0 && (
          <div className="field-group">
            <label>Fora do lote ({selecao.excluidos.length})</label>
            <div className="followup-lista followup-lista-fora">
              {selecao.excluidos.map(({ imovel, motivo, detalhe }) => (
                <div className="followup-item" key={imovel.id}>
                  <span className="followup-item-nome">{rotuloImovel(imovel)}</span>
                  <span className="followup-item-espera">
                    {textoMotivoExclusao(motivo)}
                    {detalhe ? ` · ${detalhe}` : ""}
                  </span>
                </div>
              ))}
            </div>
            <div className="field-hint">
              Ficam de fora quem não tem celular válido e quem você já contatou há pouco — o lote manda{" "}
              <strong>uma mensagem por pessoa</strong>, não uma por imóvel. Os que sobraram voltam na
              próxima rodada.
            </div>
          </div>
        )}
      </div>

      <div className="modal-foot">
        <div></div>
        <div style={{ display: "flex", gap: "10px" }}>
          <button type="button" className="btn" onClick={fecharModal}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={enviar}
            disabled={rodando || escolhidos.length === 0 || !base.trim()}
          >
            {escolhidos.length === 1
              ? "Enviar para 1 proprietário"
              : `Enviar para ${escolhidos.length} proprietários`}
          </button>
        </div>
      </div>
    </>
  );
}
