/* ================================================================
   CHEGADA DE RESPOSTA — o que apareceu entre dois retratos do imóvel

   O webhook grava a resposta do proprietário no SERVIDOR, e até aqui
   o painel só descobria isso recarregando: `recarregarEstado` no
   botão Atualizar da caixa, ou um F5. Com o Realtime ligado, o
   Supabase empurra a linha alterada — e alguém precisa dizer, olhando
   duas versões do mesmo imóvel, se ali chegou mensagem NOVA.

   É essa a pergunta que este módulo responde, e ela é puro diff: não
   sabe o que é Supabase, canal, permissão de navegador nem toast.
   Quem assina o Realtime é `components/painel/SincronizacaoRespostas`;
   quem mostra o aviso é o toast e a notificação do sistema.

   A comparação é por ID de nota, nunca por quantidade. Contar seria
   mais curto e erraria nos dois sentidos: `marcarRespostasLidas`
   reescreve a coluna `notas` inteira sem mudar o tamanho (e viraria
   "nada chegou" quando de fato nada chegou — ok) mas, pior, o
   encerramento automático ACRESCENTA uma nota `wa:<id>:encerrado`
   escrita pelo próprio app, e um contador anunciaria ao corretor uma
   "resposta do proprietário" que fomos nós que escrevemos. `ehNotaDeResposta`
   já sabe distinguir as duas — é para isso que ele existe.
   ================================================================ */
import type { Imovel, NotaImovel } from "../tipos";
import { corpoDaResposta, ehNotaDeEvento, ehNotaDeResposta } from "./notas";

/** Quanto da mensagem cabe no aviso antes de cortar. Notificação do sistema
    trunca sozinha e sem reticências, o que corta palavra no meio; cortar aqui
    deixa o texto igual nos dois lugares (toast e notificação). */
export const MAX_PREVIA_AVISO = 120;

/**
 * Um aviso pronto para virar toast ou notificação do sistema.
 *
 * As partes vêm **soltas** (`quem`, `imovel`, `mensagem`) e também já
 * compostas (`titulo`, `corpo`), porque os dois destinos aceitam coisas
 * diferentes: a caixinha do sistema é do SO e só recebe duas linhas de texto
 * puro, enquanto o toast é HTML nosso e monta um cartão com hierarquia — nome
 * em destaque, imóvel fino, mensagem em citação. Compor no módulo, e não em
 * cada um deles, é o que mantém os dois avisos dizendo a mesma coisa.
 */
export interface AvisoResposta {
  imovelId: string;
  /** Quem falou, sem enfeite: o nome do proprietário quando existe. */
  quem: string;
  /** De qual imóvel é (código · endereço). */
  imovel: string;
  /** O que a pessoa disse, já cortado. */
  mensagem: string;
  /** Linha de cima da notificação do sistema (`quem` + o que aconteceu). */
  titulo: string;
  /** Linha de baixo da notificação do sistema (`imovel` — `mensagem`). */
  corpo: string;
  /** Quantas chegaram de uma vez — no WhatsApp a rajada de três mensagens
      curtas é a regra, e três avisos empilhados seriam três interrupções
      pelo mesmo assunto. */
  quantidade: number;
}

/**
 * As respostas do proprietário presentes em `novo` que não existiam em `anterior`.
 *
 * Sem `anterior` devolve VAZIO, e isso é decisão, não desleixo. Um imóvel que
 * o painel nunca viu chega com o histórico inteiro — o LD-156 da carteira real
 * tem 64 respostas —, e "tudo que existe é novo" dispararia 64 avisos de uma
 * vez por um imóvel que só entrou no store agora. Sem retrato anterior não há
 * como separar o que chegou do que já estava lá, e o aviso errado aqui é pior
 * que aviso nenhum: quem é interrompido à toa desliga a permissão do navegador
 * e perde também os avisos certos.
 */
export function respostasQueChegaram(
  anterior: Imovel | null | undefined,
  novo: Imovel,
): NotaImovel[] {
  if (!anterior) return [];
  const conhecidas = new Set(
    (anterior.notas || []).filter(ehNotaDeResposta).map((n) => n.id),
  );
  return (novo.notas || []).filter((n) => ehNotaDeResposta(n) && !conhecidas.has(n.id));
}

/**
 * Os eventos do Sistema Principal que chegaram entre dois retratos do imóvel.
 *
 * Gêmea da função acima, e a duplicação é o ponto: as duas comparam por id e
 * exigem retrato anterior pela mesma razão, mas filtram por prefixos
 * DIFERENTES, e é isso que mantém "o proprietário respondeu" separado de "o
 * financeiro pagou sua comissão". Fundidas num filtro só, o cartão do toast
 * anunciaria uma assinatura de contrato como mensagem de WhatsApp.
 *
 * Vale o mesmo motivo do `anterior` vazio: um imóvel que o painel nunca viu
 * chega com todo o histórico, e "tudo que existe é novo" transformaria uma
 * carteira recém-carregada numa fila de caixinhas do sistema.
 */
export function eventosQueChegaram(
  anterior: Imovel | null | undefined,
  novo: Imovel,
): NotaImovel[] {
  if (!anterior) return [];
  const conhecidos = new Set((anterior.notas || []).filter(ehNotaDeEvento).map((n) => n.id));
  return (novo.notas || []).filter((n) => ehNotaDeEvento(n) && !conhecidos.has(n.id));
}

/**
 * UM aviso para os eventos que acabaram de chegar de um imóvel.
 *
 * Um só, pela razão do `avisoDeResposta`: assinatura e locação podem chegar
 * quase juntas quando o Sistema Principal reprocessa uma fila, e duas
 * caixinhas seguidas sobre o mesmo imóvel são duas interrupções pelo mesmo
 * assunto. A prévia é a do evento MAIS RECENTE, que é o estado atual do
 * negócio — dos dois, é o que o corretor precisa saber.
 */
export function avisoDeEvento(imovel: Imovel, novos: NotaImovel[]): AvisoResposta | null {
  if (novos.length === 0) return null;
  const ordenados = [...novos].sort((a, b) => (a.data || "").localeCompare(b.data || ""));
  const ultimo = ordenados[ordenados.length - 1];
  const rotulo = rotuloDoImovel(imovel);
  const mensagem = previaDaMensagem(ultimo);
  const sufixo = novos.length > 1 ? ` (${novos.length} atualizações)` : "";
  return {
    imovelId: imovel.id,
    quem: `Sistema Principal${sufixo}`,
    imovel: rotulo,
    mensagem,
    titulo: `Atualização da locação${sufixo}`,
    corpo: `${rotulo} — ${mensagem}`,
    quantidade: novos.length,
  };
}

/** Como o imóvel se apresenta no aviso: o código é o que o corretor usa para
    falar dele; o endereço entra porque nem todo imóvel tem código. */
export function rotuloDoImovel(imovel: Imovel): string {
  const codigo = (imovel.codigo || "").trim();
  const endereco = (imovel.endereco || "").trim();
  if (codigo && endereco) return `${codigo} · ${endereco}`;
  return codigo || endereco || "Imóvel sem endereço";
}

/** A mensagem como ela aparece no aviso, sem o prefixo do webhook e cortada.
    O marcador de mídia (`[áudio]`, `[imagem]`) passa como está: é o que a
    caixa de respostas mostra, e inventar "enviou uma imagem" faria o aviso
    e a tela falarem de formas diferentes da mesma mensagem. */
export function previaDaMensagem(nota: NotaImovel): string {
  const corpo = corpoDaResposta(nota.texto).replace(/\s+/g, " ").trim();
  if (corpo.length <= MAX_PREVIA_AVISO) return corpo;
  return corpo.slice(0, MAX_PREVIA_AVISO - 1).trimEnd() + "…";
}

/**
 * Monta UM aviso para o lote que acabou de chegar de um imóvel.
 *
 * Um, e não um por mensagem: ver `quantidade`. A prévia é a mensagem MAIS
 * RECENTE porque é ela que o corretor vai responder — as anteriores ele lê na
 * caixa, que é para onde o aviso leva.
 */
export function avisoDeResposta(imovel: Imovel, novas: NotaImovel[]): AvisoResposta | null {
  if (novas.length === 0) return null;
  const ordenadas = [...novas].sort((a, b) => (a.data || "").localeCompare(b.data || ""));
  const ultima = ordenadas[ordenadas.length - 1];
  const nome = (imovel.proprietarioNome || "").trim();
  const sufixo = novas.length > 1 ? ` (${novas.length} mensagens)` : "";
  const quem = nome || "Resposta no WhatsApp";
  const rotulo = rotuloDoImovel(imovel);
  const mensagem = previaDaMensagem(ultima);
  return {
    imovelId: imovel.id,
    quem,
    imovel: rotulo,
    mensagem,
    titulo: nome ? `${nome} respondeu${sufixo}` : `Resposta no WhatsApp${sufixo}`,
    corpo: `${rotulo} — ${mensagem}`,
    quantidade: novas.length,
  };
}
