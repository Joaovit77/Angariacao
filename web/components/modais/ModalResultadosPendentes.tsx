"use client";

/* ================================================================
   MODAL: CONFIRMAR RESULTADO DAS TENTATIVAS (o "nudge")
   A contrapartida de registrar tentativa sozinho no envio: a
   mensagem saiu, mas o desfecho ninguém sabia na hora, então a
   tentativa nasceu "sem-resposta" marcada como palpite.

   Se ninguém confirmar depois, toda taxa de resposta tende a zero e
   o ranking de abordagens vira ruído — a métrica pareceria dizer
   "nenhum roteiro funciona" quando na verdade ninguém anotou que
   funcionou. Este modal é onde o palpite vira fato, em um clique por
   conversa.

   Só cobra o que ele mesmo criou: tentativa anotada à mão não tem a
   marca, porque ali o "sem resposta" é afirmação do corretor.
   E só cobra por DIAS_COBRANCA_RESULTADO dias — depois disso "não
   respondeu" é quase certamente verdade, e insistir seria implicância.

   O TOM É PARTE DA FUNÇÃO, e foi corrigido em 27/07/2026. A lista já
   está CERTA quando ninguém a toca: `resultado` nasce "sem-resposta" e
   é isso que os cálculos leem — a marca `aguardandoResultado` só serve
   para este nudge e para o webhook. Ou seja, o corretor não deve
   confirmação nenhuma; ele só ganha algo confirmando o que SABE, e
   sempre que a resposta chega por WhatsApp o webhook já fecha sozinho.
   Com 43 linhas na tela e a abertura falando em "fazer o ranking medir
   o que aconteceu", isso lia como 43 tarefas atrasadas — e a saída que
   o corretor imaginou foi uma varredura que marcasse tudo de uma vez.
   Ela teria custado caro: limpar a marca antes do prazo tira do
   webhook a única tentativa em que ele pode registrar a resposta
   (`alvoPendente` exige a marca), justamente o dado mais valioso da
   feature. O conserto certo era de TEXTO — dispensar primeiro, cobrar
   depois. Se for mexer aqui, não desfaça essa ordem.
   ================================================================ */
import { useState } from "react";
import { DIAS_COBRANCA_RESULTADO, resultadosPendentes } from "@/lib/calculo/abordagens";
import {
  MOTIVO_PERDA_NUMERO_NAO_ENCONTRADO,
  RESULTADOS_TENTATIVA,
  type ResultadoTentativa,
} from "@/lib/constantes";
import { todayISO } from "@/lib/datas";
import { fmtDate } from "@/lib/formatadores";
import { confirmarResultadoTentativa, marcarPerdidoNumeroNaoEncontrado } from "@/lib/mutacoes";
import { useAppStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import { useUiModal } from "@/lib/uiModal";

export default function ModalResultadosPendentes() {
  const fecharModal = useUiModal((s) => s.fecharModal);
  const imoveis = useAppStore((s) => s.imoveis);
  const abordagens = useAppStore((s) => s.abordagens);
  const [salvando, setSalvando] = useState<string | null>(null);

  const pendentes = resultadosPendentes(imoveis, abordagens, todayISO());

  /**
   * Oferece encerrar o imóvel depois de um "número errado".
   *
   * Pergunta em vez de fazer: número errado NÃO é sinônimo de negócio perdido
   * — o proprietário pode estar acessível por outro telefone, por indicação ou
   * pela placa. Encerrar sozinho tiraria o imóvel do pipeline sem o corretor
   * perceber, e é bem mais caro descobrir isso depois do que dar um clique.
   *
   * Recusar não desfaz nada: a tentativa já saiu do ranking, e o imóvel segue
   * ativo esperando o telefone certo.
   */
  async function ofertarPerda(imovelId: string) {
    const imovel = imoveis.find((i) => i.id === imovelId);
    const alvo = imovel ? imovel.proprietarioNome || imovel.codigo || imovel.endereco : "este imóvel";
    const querEncerrar = confirm(
      `Marcado como número errado — a tentativa não conta no ranking.\n\n` +
        `Quer também dar ${alvo} como Perdido, com o motivo "${MOTIVO_PERDA_NUMERO_NAO_ENCONTRADO}"?\n\n` +
        `Cancele se pretende procurar outro telefone: o imóvel continua ativo no pipeline.`,
    );
    if (!querEncerrar) {
      toast("Fora do ranking. Corrija o telefone no cadastro para não enviar de novo.", "warning");
      return;
    }
    if (await marcarPerdidoNumeroNaoEncontrado(imovelId)) {
      toast(`Imóvel marcado como Perdido — ${MOTIVO_PERDA_NUMERO_NAO_ENCONTRADO}.`);
    }
  }

  async function confirmar(imovelId: string, tentativaId: string, resultado: ResultadoTentativa) {
    if (salvando) return;
    setSalvando(tentativaId);
    const ok = await confirmarResultadoTentativa(imovelId, tentativaId, resultado);
    setSalvando(null);
    if (!ok) return;

    // Exceção consciente ao silêncio abaixo: marcar "número errado" tira a
    // tentativa do ranking, mas NÃO conserta o cadastro — e o imóvel volta
    // para a próxima fila de follow-up com o mesmo telefone. O aviso é a
    // única coisa que transforma a marcação numa correção de verdade.
    const ultima = pendentes.length === 1;
    if (resultado === "numero-errado") {
      await ofertarPerda(imovelId);
    } else if (ultima) {
      // A linha some da lista sozinha (o store mudou). Fora do caso acima, um
      // toast por clique seria barulho: a lista encolhendo já é a confirmação.
      toast("Tudo confirmado. O ranking de abordagens já reflete estes contatos.");
    }
    if (ultima) fecharModal();
  }

  return (
    <>
      <div className="modal-head">
        <div className="modal-title">Como terminaram estas conversas?</div>
        <button type="button" className="icon-btn" onClick={fecharModal}>
          ✕
        </button>
      </div>

      <div className="modal-body">
        {/* O enquadramento importa mais que a informação. A versão anterior
            abria com "confirmar agora é o que faz o ranking medir o que
            aconteceu" e só explicava lá embaixo, em letra pequena, que a
            pendência se resolve sozinha. Lido de cima para baixo, virava uma
            lista de dever: 43 itens cobrando ação, quando a ação devida era
            zero. Agora a dispensa vem primeiro e a exceção depois. */}
        <p className="section-note" style={{ marginBottom: "14px" }}>
          <strong>Você não precisa confirmar todas.</strong> Estas mensagens saíram por você e já
          estão registradas como “sem resposta” — entraram assim porque, na hora do envio, não dava
          para saber o desfecho. E na maioria das vezes é isso mesmo.
        </p>
        <p className="section-note" style={{ marginBottom: "14px" }}>
          Confirme só as que <strong>você sabe</strong> como terminaram: o proprietário te ligou,
          falou com você pessoalmente ou respondeu por outro canal. Quem responder pelo WhatsApp o
          sistema registra sozinho. As demais já estão corretas do jeito que estão e somem daqui em{" "}
          {DIAS_COBRANCA_RESULTADO} dias, sem você fazer nada.
        </p>

        {pendentes.length === 0 ? (
          <p className="section-note">Nenhuma conversa esperando confirmação. 👌</p>
        ) : (
          <div className="pendentes-lista">
            {pendentes.map((p) => (
              <div className="pendente-item" key={p.tentativa.id}>
                <div className="pendente-cabeca">
                  <span className="pendente-nome">{p.imovelRotulo}</span>
                  <span className="pendente-meta">
                    {p.abordagemNome} · {p.dias === 0 ? "hoje" : p.dias === 1 ? "ontem" : `há ${p.dias} dias`}
                  </span>
                </div>
                {/* Leitura da IA sobre a resposta que chegou. Mostrada como
                    sugestão e não como fato: ela leu uma frase solta, sem o
                    resto da conversa. O que ela economiza é a ida ao WhatsApp
                    para lembrar do que se tratava. */}
                {p.tentativa.sugestaoIa && (
                  <div className="pendente-sugestao">
                    <span className="pendente-resumo">{p.tentativa.sugestaoIa.resumo}</span>
                    {p.tentativa.sugestaoIa.retomarEm && (
                      <span className="pendente-meta">
                        {" "}
                        · já agendado para {fmtDate(p.tentativa.sugestaoIa.retomarEm)}
                        {p.tentativa.sugestaoIa.horaRetomar
                          ? ` às ${p.tentativa.sugestaoIa.horaRetomar}`
                          : ""}
                      </span>
                    )}
                  </div>
                )}
                <div className="pendente-acoes">
                  {RESULTADOS_TENTATIVA.map((r) => {
                    const sugerido = p.tentativa.sugestaoIa?.resultado === r.valor;
                    return (
                      <button
                        key={r.valor}
                        type="button"
                        className={sugerido ? "btn btn-sm btn-primary" : "btn btn-sm"}
                        disabled={salvando === p.tentativa.id}
                        onClick={() => confirmar(p.imovelId, p.tentativa.id, r.valor)}
                        title={sugerido ? "Sugerido pela leitura da resposta" : undefined}
                      >
                        {r.rotulo}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Antes havia aqui um lembrete de que a pendência expira em
            DIAS_COBRANCA_RESULTADO dias. Subiu para a abertura: dito só no pé,
            depois de 43 linhas de lista, chegava tarde demais para desfazer a
            sensação de dívida que a lista já tinha criado. */}
      </div>

      <div className="modal-foot">
        <div></div>
        <button type="button" className="btn" onClick={fecharModal}>
          Fechar
        </button>
      </div>
    </>
  );
}
