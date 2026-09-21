/* ================================================================
   UM CONTATO POR PROPRIETÁRIO, NÃO UMA MENSAGEM POR IMÓVEL (M3)

   Caso real: LD-200, LD-201, LD-202 e LD-334 são da mesma pessoa e o lote
   de disponibilidade agendou três mensagens para ela no mesmo dia, com dois
   minutos de intervalo. Este módulo decide, sem banco, quais mensagens
   pendentes do MESMO proprietário podem ser absorvidas pela que está prestes
   a sair, e monta a mensagem única.

   Janela de contato: o mesmo dia civil operacional do envio. O plano não
   fixou uma janela; esta é a mais conservadora que resolve o caso real (as
   mensagens do lote nascem no mesmo dia, espaçadas por minutos) sem juntar
   contatos de dias diferentes.

   Só se consolida o que o app sabe ler: mensagens cujo texto é exatamente o
   modelo do sistema para aquele imóvel (`ehTextoPadraoDisponibilidade`). Um
   texto editado pelo corretor é dele, e a máquina não o reescreve; nesse
   caso a mensagem segue sozinha, como hoje. A âncora (a que está saindo)
   também precisa ser o modelo intocado, senão nada é absorvido.

   O que fica gravado: a âncora leva `imoveis_consultados` (a lista, e não só
   o texto, diz por quais imóveis se perguntou); cada absorvida vira
   `cancelada` com motivo `contato-consolidado` apontando para a âncora. O
   estado de cada imóvel continua individual; a resposta do proprietário não
   se aplica a todos sem contexto inequívoco (isso é do M5/M6).
   ================================================================ */
import type { MensagemAgendada } from "../mensagensAgendadas";
import type { Imovel } from "../tipos";
import { chaveProprietario } from "./contextoProprietario";
import { diaOperacionalDoEnvio } from "./decisaoMensagemDisponibilidade";
import { ehTextoPadraoDisponibilidade } from "./followup";
import { mensagemConfirmacaoDisponibilidadeConsolidada } from "./whatsapp";

export interface MensagemComImovel {
  mensagem: MensagemAgendada;
  imovel: Imovel;
}

export type MotivoNaoAbsorvida =
  | "outra-conta"
  | "outro-proprietario"
  | "outro-dia"
  | "tipo-livre"
  | "nao-pendente"
  | "texto-editado";

export interface PlanoConsolidacao {
  /** Ids dos imóveis pelos quais a mensagem única pergunta, âncora primeiro,
      sem repetição. Uma segunda mensagem do MESMO imóvel no mesmo dia é
      absorvida (não se pergunta duas vezes), mas não muda o texto. */
  imoveisConsultados: string[];
  /** Mensagens que a âncora absorve (serão canceladas como `contato-consolidado`). */
  absorvidas: MensagemComImovel[];
  /** Candidatas que ficaram de fora, com o motivo, para o log. */
  recusadas: Array<{ mensagemId: string; motivo: MotivoNaoAbsorvida }>;
  /** Texto a enviar: o consolidado quando há absorção; senão `null` (envia o original). */
  texto: string | null;
}

/**
 * Decide o que a âncora absorve. Candidatas são as mensagens pendentes do
 * tipo verificação que o chamador encontrou para a mesma conta; a função
 * refaz cada condição mesmo assim, porque o isolamento não pode depender de
 * quem monta a lista.
 */
export function planejarConsolidacaoContato(
  ancora: MensagemComImovel,
  candidatas: MensagemComImovel[],
): PlanoConsolidacao {
  const ancoraPadrao = ancora.mensagem.tipo === "verificacao-disponibilidade"
    && ehTextoPadraoDisponibilidade(ancora.mensagem.mensagem, ancora.imovel);
  const contaAncora = ancora.mensagem.userId;
  const proprietarioAncora = chaveProprietario(contaAncora, ancora.imovel);
  const diaAncora = diaOperacionalDoEnvio(ancora.mensagem.dataEnvio);

  const absorvidas: MensagemComImovel[] = [];
  const recusadas: PlanoConsolidacao["recusadas"] = [];

  for (const candidata of candidatas) {
    if (candidata.mensagem.id === ancora.mensagem.id) continue;
    const { mensagem, imovel } = candidata;
    const recusar = (motivo: MotivoNaoAbsorvida) => recusadas.push({ mensagemId: mensagem.id, motivo });

    if (mensagem.userId !== contaAncora) { recusar("outra-conta"); continue; }
    if (mensagem.tipo !== "verificacao-disponibilidade") { recusar("tipo-livre"); continue; }
    if (mensagem.status !== "agendada") { recusar("nao-pendente"); continue; }
    const proprietario = chaveProprietario(contaAncora, imovel);
    if (
      proprietario.identidade !== "telefone-canonico"
      || proprietarioAncora.identidade !== "telefone-canonico"
      || proprietario.chave !== proprietarioAncora.chave
    ) { recusar("outro-proprietario"); continue; }
    if (!diaAncora || diaOperacionalDoEnvio(mensagem.dataEnvio) !== diaAncora) { recusar("outro-dia"); continue; }
    if (!ancoraPadrao || !ehTextoPadraoDisponibilidade(mensagem.mensagem, imovel)) { recusar("texto-editado"); continue; }
    absorvidas.push(candidata);
  }

  const imoveisConsultados = [ancora.imovel.id];
  const imoveisOrdenados = [ancora.imovel];
  for (const { imovel } of absorvidas) {
    if (!imoveisConsultados.includes(imovel.id)) {
      imoveisConsultados.push(imovel.id);
      imoveisOrdenados.push(imovel);
    }
  }

  const consolida = absorvidas.length > 0 && imoveisConsultados.length > 1;
  return {
    imoveisConsultados,
    absorvidas,
    recusadas,
    texto: consolida ? mensagemConfirmacaoDisponibilidadeConsolidada(imoveisOrdenados) : null,
  };
}
