"use client";

/* ================================================================
   MODAL: FOLLOW-UP EM LOTE
   Cutuca de uma vez os proprietários que não responderam — "Sem
   resposta" e "Novo contato" (ver FOLLOWUP_STATUS_ALVO). O modal só
   MONTA o lote — quem envia é a fila em lib/filaFollowUp.ts, que
   sobrevive ao fechamento daqui para o corretor seguir prospectando
   enquanto as mensagens saem.

   A tela mostra também quem ficou de fora e por quê: um lote que
   "achou 3" sem explicar os outros 40 parece quebrado, e os motivos
   (sem telefone, número torto) são justamente o que dá para corrigir.

   Um seletor só, o de abordagem: ela é ao mesmo tempo o texto que sai
   (o roteiro) e o que fica registrado na tentativa. Dois seletores
   permitiriam divergir "o que eu disse" de "o que eu anotei que
   disse", e o ranking passaria a medir ficção.
   ================================================================ */
import { useMemo, useState } from "react";
import { abordagensParaEnvio } from "@/lib/calculo/abordagens";
import {
  avisoTextoLote,
  FOLLOWUP_DIAS_POR_TENTATIVA,
  FOLLOWUP_LOTE_MAX,
  FOLLOWUP_MAX_TENTATIVAS,
  FOLLOWUP_TETO_DIA,
  selecionarFollowUp,
  textoBaseFollowUp,
  textoFollowUp,
  textoMotivoExclusao,
  ultimoContatoISO,
} from "@/lib/calculo/followup";
import { daysBetween, todayISO } from "@/lib/datas";
import { dispararLote, type ItemFila, useFilaFollowUp } from "@/lib/filaFollowUp";
import { useAppStore } from "@/lib/store";
import type { Imovel } from "@/lib/tipos";
import { useUiModal } from "@/lib/uiModal";

/** "Marta — Rua Haddock Lobo, 55". Curto o bastante para o indicador. */
function rotuloImovel(imovel: Imovel): string {
  const nome = (imovel.proprietarioNome || "").trim();
  const onde = (imovel.endereco || imovel.codigo || "imóvel sem endereço").trim();
  return nome ? `${nome} — ${onde}` : onde;
}

export default function ModalFollowUpLote() {
  const fecharModal = useUiModal((s) => s.fecharModal);
  const abrirModal = useUiModal((s) => s.abrirModal);
  const imoveis = useAppStore((s) => s.imoveis);
  const abordagens = useAppStore((s) => s.abordagens);
  const rodando = useFilaFollowUp((s) => s.rodando);

  const hoje = todayISO();
  const selecao = useMemo(() => selecionarFollowUp(imoveis, hoje), [imoveis, hoje]);
  const ativas = abordagens.filter((a) => !a.arquivada);
  // O público do lote é quem já foi contatado e não respondeu — logo, sempre
  // "seguimento". Passar "abertura" aqui subiria roteiros de primeiro contato
  // para gente que já ouviu um.
  const sugestoes = useMemo(() => abordagensParaEnvio(ativas, imoveis, "seguimento"), [ativas, imoveis]);

  const [abordagemId, setAbordagemId] = useState("");
  const [base, setBase] = useState(() => textoBaseFollowUp(null));
  // Pré-marca só até o limite do dia; o resto da fila fica visível, mas
  // desmarcado — o corretor escolhe quem troca por quem.
  const [marcados, setMarcados] = useState<Set<string>>(
    () => new Set(selecao.elegiveis.slice(0, selecao.limite).map((i) => i.id)),
  );

  const escolhidos = selecao.elegiveis.filter((i) => marcados.has(i.id));
  const aviso = avisoTextoLote(base);
  const previa = escolhidos[0] ? textoFollowUp(base, escolhidos[0]) : "";
  const noLimite = escolhidos.length >= selecao.limite;

  /** Trocar a abordagem reescreve o texto — mesmo gesto do ModalWhatsapp:
      o estado derivado é atualizado no handler, não num efeito. */
  function trocarAbordagem(id: string) {
    setAbordagemId(id);
    setBase(textoBaseFollowUp(ativas.find((a) => a.id === id) || null));
  }

  function alternar(id: string) {
    setMarcados((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else if (novo.size < selecao.limite) novo.add(id);
      return novo;
    });
  }

  function enviar() {
    const itens: ItemFila[] = escolhidos.map((imovel) => ({
      imovelId: imovel.id,
      rotulo: rotuloImovel(imovel),
      texto: textoFollowUp(base, imovel),
    }));
    // Sem await de propósito: a fila roda em background e o corretor volta
    // ao painel. O progresso aparece no indicador do shell.
    void dispararLote(itens, abordagemId || null);
    fecharModal();
  }

  /** "há 23 dias" — o que o corretor precisa ver para decidir. */
  function esperaTexto(imovel: Imovel): string {
    const ultimo = ultimoContatoISO(imovel);
    if (!ultimo) return "sem contato registrado";
    const dias = daysBetween(ultimo, hoje);
    if (dias === null) return "sem contato registrado";
    return dias === 1 ? "há 1 dia" : `há ${dias} dias`;
  }

  return (
    <>
      <div className="modal-head">
        <div className="modal-title">Follow-up em lote</div>
        <button type="button" className="icon-btn" onClick={fecharModal}>
          ✕
        </button>
      </div>

      <div className="modal-body">
        <p className="section-note" style={{ marginBottom: "14px" }}>
          Uma mensagem para cada proprietário que <strong>ainda não respondeu</strong>. As mensagens saem uma a
          uma, com intervalo de alguns minutos entre elas — é o que evita que o WhatsApp trate o envio
          como spam e bloqueie o número da imobiliária. Você pode fechar esta janela e continuar
          trabalhando; o envio segue em segundo plano.
        </p>

        {rodando && (
          <p className="section-note" style={{ marginBottom: "14px" }}>
            Já existe um envio em andamento. Espere ele terminar (ou cancele no indicador de progresso)
            para montar outro lote.
          </p>
        )}

        {/* O teto do lote conta só o que o LOTE mandou. Quem olha o volume total
            do dia é este aviso — para o WhatsApp não existe "veio da tela X",
            existe quantas mensagens saíram daquele número. Avisa e não bloqueia:
            travar aqui impediria você de responder a quem acabou de escrever. */}
        {selecao.enviosTotaisHoje >= FOLLOWUP_TETO_DIA && (
          <p className="section-note followup-aviso" role="alert">
            ⚠️ Você já mandou {selecao.enviosTotaisHoje} mensagens hoje por este número, somando o lote
            e os envios avulsos. O que pesa para o WhatsApp é esse total, não de qual tela cada uma
            saiu — vale espaçar o resto para amanhã.
          </p>
        )}

        <div className="field-group">
          <label>Abordagem usada</label>
          {/* Ordenadas por desempenho, com o selo no próprio rótulo — o <select>
              não aceita marcação, e o número precisa estar onde a escolha é
              feita. O lote NÃO pré-seleciona a recomendada de propósito: quem
              escolhe o roteiro é o corretor, e um padrão que se autoaplica faria
              o ranking se autoconfirmar (o sugerido é usado, o usado sobe). */}
          <select value={abordagemId} onChange={(e) => trocarAbordagem(e.target.value)}>
            <option value="">Sem roteiro (usa a mensagem padrão de retomada)</option>
            {sugestoes.map(({ abordagem: a, selo, recomendada }) => (
              <option key={a.id} value={a.id}>
                {recomendada ? "★ " : ""}
                {a.nome}
                {selo ? ` — ${selo}` : ""}
              </option>
            ))}
          </select>
          <div className="field-hint">
            O roteiro escolhido vira o texto abaixo e fica registrado na tentativa de cada imóvel — é
            assim que este lote aparece no ranking de abordagens.{" "}
            <button
              type="button"
              className="insight-action"
              style={{ padding: 0 }}
              onClick={() => abrirModal("abordagens")}
            >
              Gerenciar abordagens
            </button>
          </div>
        </div>

        <div className="field-group">
          <label>Mensagem</label>
          <textarea
            value={base}
            onChange={(e) => setBase(e.target.value)}
            style={{ width: "100%", minHeight: "130px" }}
          />
          <div className="field-hint">
            Vale só para este lote — o roteiro da abordagem não é alterado. Use <strong>{"{nome}"}</strong>{" "}
            e <strong>{"{endereco}"}</strong> para o texto se adaptar a cada proprietário.
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
              Nenhum proprietário está pronto para follow-up agora.
            </p>
          ) : selecao.limite === 0 ? (
            <p className="section-note">
              Você já enviou {selecao.enviadosHoje} follow-ups hoje, o limite diário de{" "}
              {FOLLOWUP_TETO_DIA}. Continue amanhã — mandar mais num dia só é o que faz o WhatsApp
              marcar o número como spam.
            </p>
          ) : (
            <div className="followup-lista">
              {selecao.elegiveis.map((imovel) => {
                const marcado = marcados.has(imovel.id);
                const sinal = selecao.sinais[imovel.id];
                return (
                  <label
                    key={imovel.id}
                    className={`followup-item${marcado ? " ativa" : ""}`}
                  >
                    <input
                      type="checkbox"
                      checked={marcado}
                      disabled={!marcado && noLimite}
                      onChange={() => alternar(imovel.id)}
                    />
                    <span className="followup-item-nome">
                      <span className="followup-item-rotulo">{rotuloImovel(imovel)}</span>
                      {/* Por que este subiu na fila. Sem o motivo escrito, uma
                          ordem que não é a de espera parece bug — e o corretor
                          volta a escolher no olho. */}
                      {sinal && <span className="followup-item-sinal">🔥 {sinal}</span>}
                    </span>
                    <span className="followup-item-espera">{esperaTexto(imovel)}</span>
                  </label>
                );
              })}
            </div>
          )}
          {selecao.elegiveis.length > selecao.limite && selecao.limite > 0 && (
            <div className="field-hint">
              {selecao.elegiveis.length} proprietários estão prontos, mas o lote vai até{" "}
              {FOLLOWUP_LOTE_MAX} por vez ({FOLLOWUP_TETO_DIA} por dia). Desmarque um para escolher
              outro; o resto continua na fila para as próximas rodadas.
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
              Ficam de fora quem não tem celular válido, quem falou com você há pouco (
              {FOLLOWUP_DIAS_POR_TENTATIVA.join(", ")} dias — a espera cresce a cada tentativa) e
              quem já acumulou {FOLLOWUP_MAX_TENTATIVAS} tentativas
              — insistir além disso costuma render bloqueio, não resposta. Também sai o imóvel cujo
              proprietário já está no lote por outro: o lote manda{" "}
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
