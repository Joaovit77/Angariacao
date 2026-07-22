/* ================================================================
   CELEBRAÇÃO — o que comemorar ao salvar um imóvel
   Módulo puro (tipos, datas e motor): decide SE há algo a comemorar
   e com que texto, sem saber nada de React, store ou Supabase. Quem
   dispara é o salvarImovel (lib/mutacoes.ts); quem desenha é o
   <Celebracao /> do painel.

   Irmão da gamificacao.ts, com um recorte diferente: lá são as
   medalhas — o acumulado, consultável a qualquer momento na view de
   Metas. Aqui é o INSTANTE: só existe na transição e some depois.

   A regra que sustenta tudo: comemora-se o CRUZAMENTO, nunca o
   estado. Um imóvel que já era angariado e foi só reeditado não gera
   festa nenhuma — senão corrigir um telefone jogaria confete na cara
   do corretor, e o parabéns viraria ruído a ser dispensado. É a
   mesma leitura do statusHistory que o resto do app faz: a verdade
   está na entrada em "Angariado", não no campo `status`.
   ================================================================ */
import { monthLabelLong } from "../datas";
import type { Imovel, Metas } from "../tipos";
import { foiAngariado, imoveisAngariadosNoMes } from "./motor";

export type TipoCelebracao = "angariacao" | "meta";

export interface Celebracao {
  tipo: TipoCelebracao;
  /** Emoji grande do card. */
  icone: string;
  titulo: string;
  /** Linha principal: o que acabou de acontecer. */
  mensagem: string;
  /** Linha de contexto: onde isso põe o mês. Ausente quando não há o que dizer. */
  detalhe?: string;
}

/** Como o imóvel é chamado na mensagem — mesmo critério dos lembretes de agenda. */
function rotuloImovel(imovel: Imovel): string {
  return imovel.codigo || imovel.endereco || "O imóvel";
}

/**
 * Decide a comemoração de um salvamento já concluído.
 *
 * Recebe as listas ANTES e DEPOIS em vez de calcular a diferença por
 * conta própria: é o que torna a detecção do cruzamento da meta exata
 * sem precisar supor em que mês a angariação caiu.
 *
 * Devolve NO MÁXIMO uma celebração. Quando a angariação é justamente a
 * que fecha a meta, vence a da meta — ela é a notícia maior, e dois
 * cards empilhados transformariam a comemoração em fila de avisos.
 */
export function celebracaoAoSalvar(
  antes: Imovel | null,
  depois: Imovel,
  imoveisAntes: Imovel[],
  imoveisDepois: Imovel[],
  metas: Metas,
  mKey: string,
): Celebracao | null {
  // Já era angariado antes deste salvamento: nada cruzou.
  if (antes && foiAngariado(antes)) return null;
  if (!foiAngariado(depois)) return null;

  const alvo = metas[mKey]?.angariacoes ?? 0;
  const noMesAntes = imoveisAngariadosNoMes(imoveisAntes, mKey).length;
  const noMesDepois = imoveisAngariadosNoMes(imoveisDepois, mKey).length;

  // Meta batida = cruzou de baixo para cima AGORA. Continuar angariando
  // depois de bater não recomemora: só a virada é novidade.
  if (alvo > 0 && noMesAntes < alvo && noMesDepois >= alvo) {
    return {
      tipo: "meta",
      icone: "🏆",
      titulo: "Meta batida!",
      mensagem: `Você fechou a meta de ${monthLabelLong(mKey)}: ${noMesDepois} de ${alvo} angariações.`,
      detalhe: `${rotuloImovel(depois)} foi o imóvel que fechou a conta.`,
    };
  }

  const faltam = alvo - noMesDepois;
  return {
    tipo: "angariacao",
    icone: "🎉",
    titulo: "Imóvel angariado!",
    mensagem: `${rotuloImovel(depois)} chegou na etapa Angariado.`,
    detalhe: detalheDaAngariacao(noMesDepois, alvo, faltam),
  };
}

function detalheDaAngariacao(noMes: number, alvo: number, faltam: number): string | undefined {
  // noMes < 1 só acontece se a angariação não caiu no mês consultado —
  // impossível pelo fluxo normal (a transição é datada de hoje), mas sem
  // o ordinal a frase continua verdadeira.
  const ordinal = noMes >= 1 ? `${noMes}ª angariação do mês` : undefined;
  if (alvo <= 0 || faltam <= 0) return ordinal;
  const restante = faltam === 1 ? "falta 1 para a meta" : `faltam ${faltam} para a meta`;
  return ordinal ? `${ordinal} · ${restante}` : restante;
}
