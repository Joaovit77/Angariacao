"use client";

/* ================================================================
   INDICADOR DO FOLLOW-UP EM LOTE
   A peça que torna o envio em segundo plano utilizável: enquanto a
   fila roda, ela aparece fixa no canto e acompanha o corretor por
   todas as views. Sem isso o lote seria invisível — dez minutos de
   mensagens saindo sem nada na tela dizendo que estão saindo.

   Fica montado no layout do painel (irmão do <main>), não dentro de
   uma view, senão trocar de tela o desmontaria.

   O aviso de saída é o contraponto honesto do "pode fechar o modal":
   a fila vive no processo da aba, então recarregar ou fechar a página
   interrompe o que falta. Navegar entre views é seguro — o store
   sobrevive à navegação do App Router.

   Quando o lote acaba com falhas, o mesmo canto vira RELATÓRIO em vez
   de sumir. É o único instante em que se sabe quem falhou e por quê:
   antes disso o indicador dizia só "1 falhou" e a fila era zerada na
   rodada seguinte, então o corretor via que algo deu errado sem
   descobrir que o telefone de um proprietário estava errado — e o
   imóvel voltava para a fila do dia seguinte com o mesmo número.
   ================================================================ */
import { useEffect } from "react";
import { falhaEhDoNumero } from "@/lib/calculo/followup";
import { MOTIVO_PERDA_NUMERO_NAO_ENCONTRADO } from "@/lib/constantes";
import { useFilaFollowUp } from "@/lib/filaFollowUp";
import { marcarPerdidoNumeroNaoEncontrado } from "@/lib/mutacoes";
import { toast } from "@/lib/toast";
import { useAppStore } from "@/lib/store";
import { useUiModal } from "@/lib/uiModal";

export default function IndicadorFollowUp() {
  const { itens, indice, enviados, falhas, rodando, resumoAberto, cancelar, fecharResumo } =
    useFilaFollowUp();
  const abrirModal = useUiModal((s) => s.abrirModal);
  const imoveis = useAppStore((s) => s.imoveis);

  useEffect(() => {
    if (!rodando) return;
    const aoSair = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", aoSair);
    return () => window.removeEventListener("beforeunload", aoSair);
  }, [rodando]);

  /** Abre o cadastro para corrigir o telefone — a correção de verdade.
      Fecha o relatório: com o modal aberto por cima, ele só atrapalharia. */
  function corrigir(imovelId: string) {
    fecharResumo();
    abrirModal("imovel", imovelId);
  }

  /**
   * Oferece encerrar o imóvel. Mesma disciplina do nudge (ver
   * ModalResultadosPendentes): PERGUNTA em vez de fazer, porque número errado
   * não é sinônimo de negócio perdido — o proprietário pode estar acessível
   * por outro telefone, por indicação ou pela placa. Encerrar sozinho tiraria
   * o imóvel do pipeline sem ninguém perceber.
   */
  async function darComoPerdido(imovelId: string, rotulo: string) {
    const imovel = imoveis.find((i) => i.id === imovelId);
    const alvo = imovel ? imovel.proprietarioNome || imovel.codigo || imovel.endereco : rotulo;
    const querEncerrar = confirm(
      `A mensagem não chegou a ${alvo}.\n\n` +
        `Quer dar este imóvel como Perdido, com o motivo "${MOTIVO_PERDA_NUMERO_NAO_ENCONTRADO}"?\n\n` +
        `Cancele se pretende procurar outro telefone: o imóvel continua ativo no pipeline.`,
    );
    if (!querEncerrar) return;
    if (await marcarPerdidoNumeroNaoEncontrado(imovelId)) {
      toast(`Imóvel marcado como Perdido — ${MOTIVO_PERDA_NUMERO_NAO_ENCONTRADO}.`);
    }
  }

  // Lote encerrado com falhas: o canto vira relatório até alguém fechá-lo.
  if (!rodando && resumoAberto) {
    return (
      <div className="followup-indicador" role="status" aria-live="polite">
        <div className="followup-indicador-topo">
          <strong>
            {enviados === 1 ? "1 mensagem enviada" : `${enviados} mensagens enviadas`}
            {falhas.length === 1 ? " · 1 não saiu" : ` · ${falhas.length} não saíram`}
          </strong>
          <button type="button" className="icon-btn" onClick={fecharResumo} title="Fechar">
            ✕
          </button>
        </div>

        <div className="followup-falhas">
          {falhas.map((f) => (
            <div className="followup-falha" key={f.imovelId}>
              <div className="followup-falha-nome">{f.rotulo}</div>
              <div className="followup-falha-motivo">{f.mensagem}</div>
              {/* Só quando a falha é DO NÚMERO. Instância caída ou Evolution
                  fora do ar não dizem nada sobre o proprietário — oferecer
                  perda ali daria o imóvel como perdido por um mau minuto
                  do nosso servidor. */}
              {falhaEhDoNumero(f.falha) && (
                <div className="followup-falha-acoes">
                  <button type="button" className="btn btn-sm" onClick={() => corrigir(f.imovelId)}>
                    Corrigir telefone
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={() => darComoPerdido(f.imovelId, f.rotulo)}
                  >
                    Dar como Perdido
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="followup-indicador-rodape">
          Sem corrigir o telefone, estes imóveis voltam para a próxima rodada com o mesmo número.
        </div>
      </div>
    );
  }

  if (!rodando || itens.length === 0) return null;

  const total = itens.length;
  // `indice` é quantos já saíram; o que está em voo é o próximo.
  const atual = Math.min(indice + 1, total);
  const pct = Math.round((indice / total) * 100);
  const emVoo = itens[indice];

  return (
    <div className="followup-indicador" role="status" aria-live="polite">
      <div className="followup-indicador-topo">
        <strong>
          Enviando {atual} de {total}
        </strong>
        <button type="button" className="btn btn-sm" onClick={cancelar}>
          Cancelar
        </button>
      </div>

      <div className="followup-barra" aria-hidden>
        <div className="followup-barra-preenchida" style={{ width: `${pct}%` }} />
      </div>

      {emVoo && <div className="followup-indicador-alvo">{emVoo.rotulo}</div>}

      <div className="followup-indicador-rodape">
        {enviados === 1 ? "1 enviada" : `${enviados} enviadas`}
        {falhas.length > 0 && (falhas.length === 1 ? " · 1 falhou" : ` · ${falhas.length} falharam`)}
        {" · intervalo de alguns minutos entre as mensagens"}
      </div>
    </div>
  );
}
