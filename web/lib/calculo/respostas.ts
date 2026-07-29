/* ================================================================
   CAIXA DE RESPOSTAS — o que o proprietário ESCREVEU, num lugar só

   O webhook já grava toda resposta do proprietário como nota do imóvel
   (`wa:<id>`, ver calculo/notas.ts), e três lugares já consomem esse
   dado — mas nenhum deles mostra o TEXTO:

   - `isStale` usa só a DATA (resposta é movimento, o imóvel não está parado);
   - o termômetro usa só a data e escreve um `motivo` ("respondeu há 2 dias");
   - a sugestão da IA guarda um resumo de UMA linha na tentativa.

   Para ler o que a pessoa disse era preciso abrir imóvel por imóvel, no
   modal de notas. Com 110 respostas na carteira — 64 delas num imóvel só —
   isso é o mesmo que não ter o dado. Este módulo é a leitura que faltava.

   ## Por que não é o termômetro de novo

   `calculo/temperatura.ts` responde "de QUEM eu corro atrás agora", e para
   isso ele CORTA: quem já foi captado sai inteiro (a cobrança dessa fase é
   a agenda), quem foi contatado hoje sai, e o que sobra é ordenado por
   faixa de sinal. É uma lista curta de prioridade, e tem que continuar
   sendo.

   A caixa responde outra pergunta — "o que chegou e eu ainda não tratei" —
   e por isso NÃO corta o captado. É lá que está o volume real: depois de
   angariar o proprietário fala muito mais (CPF, fotos, "já assinei"), e
   nada disso é captação, mas tudo isso é trabalho que se perde se ninguém
   ler. O termômetro exclui exatamente esse material de propósito; sem uma
   caixa, ele não tem leitor nenhum.

   Manter o captado foi **medido**, não suposto. Em 29/07/2026, na carteira
   real, ele respondia por 59 das 80 pendências — mas também por **11 dos 17
   conteúdos que importavam**: "Bloco 10 / Ap 701 / Garagem n° 299", "o valor
   cheio seria com o condomínio", "Já Assinei", "caso confirme a visita ligue
   pro meu esposo" e, no LD-163, o aviso de que outra imobiliária estava
   falando com o proprietário. Cortar por status jogaria fora as duas coisas
   juntas. O que separa as duas fases é o `fase`, que a tela usa para exibir
   em BLOCOS ("Captação" antes de "Carteira") — assim o operacional nunca
   enterra um lead, e nada se perde.

   ## O ruído não tem status — e é ele que enche a caixa

   Na mesma medição, 63 das 80 pendências eram marcador de mídia ou mensagem
   de até 20 caracteres, e isso acontecia igual na captação (15 de 21). Só o
   marcador de mídia é descartado como pendência (ver `ehSoMidia`): ele não
   tem o que ser lido no painel.

   As mensagens CURTAS continuam cobrando, e essa foi uma decisão contra a
   intuição: "Ok" e "Obrigado" são ruído, mas "Pode sim" tem 8 caracteres e
   "Já Assinei" tem 10 — as duas mais decisivas da carteira. Não há regra de
   tamanho que separe uma da outra, e errar aqui é perder o "sim".

   ## O que é "pendente"

   A regra é DUPLA, e nenhuma das metades funciona sozinha:

   - **Some sozinha quando você AGE.** Registrou tentativa depois da
     mensagem, ou mudou o status depois dela: está tratada. Quem trabalha
     pelo painel nunca precisa marcar nada — é o mesmo princípio do
     `aguardandoResultado`, que morre quando o corretor confirma.
   - **`lida` para o que não pede ação.** "Obrigado", "ok", "combinado" não
     vão gerar tentativa nem mudar status NUNCA. Só com a regra derivada,
     essas mensagens ficariam na caixa para sempre, a caixa encheria de
     ruído e o corretor pararia de abri-la — que é exatamente como a faixa
     de "imóvel parado" matou o termômetro (7 de 8 linhas iguais).

   Só com o flag manual, por outro lado, a caixa viraria burocracia diária:
   marcar como lido tudo aquilo que você acabou de responder pelo painel.

   ## O corte é conservador de propósito

   `statusHistory` guarda DIA (`YYYY-MM-DD`) e a nota guarda datetime
   (`YYYY-MM-DDTHH:mm`): mudar o status no mesmo dia da mensagem não prova
   que foi DEPOIS dela. Nesse empate a mensagem continua pendente, e some
   no dia seguinte. O erro na outra direção — dar por tratada uma resposta
   que ninguém leu — é o único que esta tela não pode cometer, porque é a
   tela inteira.
   ================================================================ */
import { daysBetween } from "../datas";
import type { Imovel, NotaImovel } from "../tipos";
import { SUFIXO_ID_ENCERRAMENTO, ehNotaDeResposta, ehSoMidia, PREFIXO_ID_NOTA } from "./notas";

/** Status em que a captação já foi GANHA — o imóvel está na carteira, e a
    conversa com o proprietário passou a ser operacional (documento, visita
    do inquilino, contrato). Não é fase de disputa. */
const STATUS_JA_CAPTADO: readonly string[] = ["Angariado", "Publicado", "Locado"];

/** Em qual bloco da caixa a conversa entra. */
export type FaseResposta = "captacao" | "carteira";

/** Uma mensagem que o proprietário mandou. */
export interface MensagemResposta {
  id: string;
  texto: string;
  /** Datetime local "YYYY-MM-DDTHH:mm" — como gravado pelo webhook. */
  data: string;
  /** Dia da mensagem (YYYY-MM-DD). */
  dia: string;
  /** Marcada como lida, ou seguida de uma ação do corretor. */
  tratada: boolean;
  /** Só um marcador de mídia (`[áudio]`, `[imagem]`…) — aparece na conversa,
      mas nunca cobra ação. Ver `ehSoMidia` em calculo/notas.ts. */
  soMidia: boolean;
}

/** A conversa de UM imóvel na caixa. A unidade é o imóvel, não a mensagem:
    no WhatsApp as pessoas mandam três mensagens curtas seguidas, e uma caixa
    por mensagem faria um proprietário empurrar todos os outros para fora da
    tela — o mesmo motivo pelo qual o follow-up manda uma mensagem por
    PROPRIETÁRIO e não por imóvel. */
export interface LinhaResposta {
  imovelId: string;
  /** Bloco da tela: captação em disputa ou imóvel já na carteira. */
  fase: FaseResposta;
  /** Ordem cronológica CRESCENTE — a conversa se lê de cima para baixo. */
  mensagens: MensagemResposta[];
  /** A mais recente (é ela que dita a ordem da caixa e o "há N dias"). */
  ultima: MensagemResposta;
  /** A que a linha FECHADA mostra: a última com texto de verdade.
      Não é a mesma coisa que `ultima` — quando o proprietário encerra a
      conversa com um áudio, a prévia viraria "[áudio]" e a linha não diria
      nada sobre o assunto. Só cai na `ultima` quando não há texto nenhum. */
  previa: MensagemResposta;
  total: number;
  /** Mensagens COM TEXTO ainda por tratar. É este número que define
      `pendente` — marcador de mídia não entra (ver `midiaPendentes`). */
  naoTratadas: number;
  /** Marcadores de mídia por tratar. Contados à parte para a linha poder
      dizer "9 áudios — abrir no WhatsApp", que é a única ação possível. */
  midiaPendentes: number;
  pendente: boolean;
  /** Dias entre a última mensagem e hoje. */
  dias: number;
  /** O app encerrou este imóvel sozinho a partir de uma destas respostas.
      Escrita automática tem que ser visível: sem isto, a caixa mostraria
      um "Perdido" sem dizer que foi o próprio sistema que o marcou. */
  encerradoAutomaticamente: boolean;
}

/** As mensagens do proprietário, em ordem cronológica crescente.
    A nota escrita à mão pelo corretor e a do encerramento automático ficam
    de fora — `ehNotaDeResposta` é quem sabe distinguir as três. */
export function respostasDoImovel(imovel: Imovel): NotaImovel[] {
  return (imovel.notas || [])
    .filter(ehNotaDeResposta)
    .filter((n) => (n.data || "").length >= 10)
    .sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0));
}

/** O imóvel foi encerrado automaticamente pelo webhook? (nota `wa:<id>:encerrado`) */
function temNotaDeEncerramento(imovel: Imovel): boolean {
  return (imovel.notas || []).some(
    (n) => (n.id || "").startsWith(PREFIXO_ID_NOTA) && (n.id || "").endsWith(SUFIXO_ID_ENCERRAMENTO),
  );
}

/**
 * Houve ação do corretor DEPOIS desta mensagem?
 *
 * Compara string com string, e isso não é preguiça: os dois formatos são
 * lexicograficamente ordenáveis e o empate cai para o lado certo sozinho.
 * `"2026-07-28"` contra `"2026-07-28T14:30"` — o mais curto termina antes e
 * perde a comparação, então a mudança de status do MESMO dia não conta como
 * posterior. É o conservadorismo descrito no cabeçalho, de graça.
 */
function houveAcaoDepois(imovel: Imovel, mensagem: NotaImovel): boolean {
  const quando = mensagem.data || "";
  if (!quando) return false;

  for (const t of imovel.tentativas || []) {
    if ((t.data || "") > quando) return true;
  }
  for (const h of imovel.statusHistory || []) {
    if ((h.date || "") > quando) return true;
  }
  return false;
}

/**
 * A caixa inteira: uma linha por imóvel que tem ao menos uma resposta,
 * da conversa mais recente para a mais antiga.
 *
 * Devolve TUDO (tratadas inclusive) — quem filtra é a tela, porque reler a
 * conversa de um imóvel já resolvido é metade do uso. O `pendente` de cada
 * linha é o que alimenta o filtro padrão e o badge do menu.
 */
export function caixaDeRespostas(imoveis: Imovel[], hoje: string): LinhaResposta[] {
  const linhas: LinhaResposta[] = [];

  for (const imovel of imoveis) {
    const notas = respostasDoImovel(imovel);
    if (notas.length === 0) continue;

    const mensagens: MensagemResposta[] = notas.map((n) => ({
      id: n.id,
      texto: n.texto || "",
      data: n.data,
      dia: n.data.slice(0, 10),
      tratada: n.lida === true || houveAcaoDepois(imovel, n),
      soMidia: ehSoMidia(n.texto),
    }));

    const ultima = mensagens[mensagens.length - 1];
    const porTratar = mensagens.filter((m) => !m.tratada);
    // Só o que tem TEXTO cobra ação: um `[áudio]` não se lê no painel, e a
    // única saída dele é abrir o WhatsApp — que é o mesmo que a linha já
    // oferece. Contá-lo faria a caixa cobrar o impossível.
    const naoTratadas = porTratar.filter((m) => !m.soMidia).length;

    const comTexto = mensagens.filter((m) => !m.soMidia);

    linhas.push({
      imovelId: imovel.id,
      fase: STATUS_JA_CAPTADO.includes(imovel.status) ? "carteira" : "captacao",
      mensagens,
      ultima,
      previa: comTexto.length > 0 ? comTexto[comTexto.length - 1] : ultima,
      total: mensagens.length,
      naoTratadas,
      midiaPendentes: porTratar.length - naoTratadas,
      pendente: naoTratadas > 0,
      dias: daysBetween(ultima.dia, hoje) ?? 0,
      encerradoAutomaticamente: temNotaDeEncerramento(imovel),
    });
  }

  return linhas.sort((a, b) => (a.ultima.data < b.ultima.data ? 1 : a.ultima.data > b.ultima.data ? -1 : 0));
}

/**
 * O badge do menu: imóveis de CAPTAÇÃO com resposta por tratar.
 *
 * Conta só a fase de captação de propósito. O badge é a promessa de urgência
 * do menu, e a carteira produz muito mais conversa que a disputa (na medição
 * de 29/07/2026, 59 das 80 pendências) — somar as duas faria o número viver
 * alto por causa de documentação e visita de inquilino, e um badge que nunca
 * baixa é um badge que ninguém olha. O bloco "Carteira" tem contagem própria
 * dentro da tela, onde ela informa em vez de alarmar.
 */
export function contarRespostasPendentes(imoveis: Imovel[], hoje: string): number {
  return caixaDeRespostas(imoveis, hoje).filter((l) => l.pendente && l.fase === "captacao").length;
}
