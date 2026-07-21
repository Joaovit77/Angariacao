/* ================================================================
   FOLLOW-UP EM LOTE — parte pura
   Feature nova da pós-migração (sem oráculo do app antigo).

   Responde uma pergunta só: "de quem eu não obtive resposta, para
   quem vale mandar uma cutucada hoje?". Quem envia é a fila em
   lib/uiFollowUp.ts, que chama a rota /api/whatsapp/enviar uma vez
   por imóvel; aqui ficam a ELEGIBILIDADE e o TEXTO, puros e
   testáveis — sem React/Next/Supabase/store.

   O desenho inteiro é governado por um risco que não é de software:
   disparar mensagens em rajada pela mesma instância do WhatsApp é o
   padrão que a plataforma classifica como spam, e o público aqui é o
   pior possível para esse detector — gente que JÁ não respondeu.
   Taxa de resposta baixa + textos iguais + rajada = número banido, e
   o número é da imobiliária. Daí os quatro freios abaixo; eles não
   são preferência de UX, são o que mantém a conta viva.

   Nenhum deles precisou de campo novo no banco: as TENTATIVAS já
   registram quando se falou com o proprietário e quantas vezes. É a
   mesma leitura que o ranking de abordagens faz — a verdade está no
   histórico, não num campo único do imóvel.
   ================================================================ */
import { daysBetween } from "../datas";
import type { Abordagem, Imovel, Tentativa } from "../tipos";
import { aplicarModeloUsuario, type FalhaEnvio, mensagemWhatsapp, numeroEvolution } from "./whatsapp";

/** Quantas mensagens saem numa rodada. Dez leva ~7 minutos no intervalo
    abaixo: pouco tempo de aba aberta e longe do padrão de rajada. */
export const FOLLOWUP_LOTE_MAX = 10;

/** Teto por dia. O corte de {@link FOLLOWUP_DIAS_DESDE_ULTIMO} já impede
    reenviar para o MESMO proprietário, mas nada impediria rodar o lote de
    novo pegando "os próximos 10" a cada rodada — em uma tarde de faxina no
    pipeline isso vira 40 mensagens. Duas rodadas por dia é o limite. */
export const FOLLOWUP_TETO_DIA = 20;

/** Dias desde o último contato registrado (de QUALQUER canal) para o
    proprietário voltar a ser elegível. Vale para qualquer tentativa, não
    só as do lote: se você ligou para ele anteontem, um "não consegui
    retorno" automático hoje soa como robô — porque é. */
export const FOLLOWUP_DIAS_DESDE_ULTIMO = 14;

/** Tentativas acumuladas que encerram a insistência. Da quinta em diante
    não é follow-up, é perseguição — e o proprietário bloqueia, o que
    machuca a reputação do número muito mais do que a mensagem ajudaria. */
export const FOLLOWUP_MAX_TENTATIVAS = 4;

/** Intervalo entre um envio e o próximo, sorteado nesta faixa. O sorteio
    importa tanto quanto a espera: cadência exata de N em N segundos é
    assinatura de bot. */
export const FOLLOWUP_INTERVALO_MIN_MS = 30_000;
export const FOLLOWUP_INTERVALO_MAX_MS = 60_000;

/** Canal registrado nas tentativas criadas pelo lote (um de FORMAS_ABORDAGEM). */
export const FOLLOWUP_CANAL = "WhatsApp";

/** Status que o lote atende. Só "Sem resposta": "Perdido" e "Cancelado"
    também são terminais, mas são saídas DELIBERADAS — o proprietário disse
    não, ou o negócio caiu. Cutucar quem recusou é outro produto. */
export const FOLLOWUP_STATUS_ALVO = "Sem resposta";

/** Modelo do sistema usado quando a abordagem escolhida não tem roteiro.
    É o texto escrito exatamente para este caso ("tentei falar com você há
    alguns dias, mas não consegui retorno"). */
const MODELO_PADRAO = "retomada-contato";

export type MotivoExclusao =
  | "sem-telefone"
  | "numero-invalido"
  | "contato-recente"
  | "tentativas-demais";

export interface ExcluidoFollowUp {
  imovel: Imovel;
  motivo: MotivoExclusao;
  /** Complemento em pt-BR para a UI ("há 3 dias", "6 tentativas"). */
  detalhe: string;
}

export interface SelecaoFollowUp {
  /** Elegíveis, do contato mais antigo para o mais recente — quem está
      esperando há mais tempo aparece primeiro. Pode passar do limite; a UI
      pré-marca só até `limite`. */
  elegiveis: Imovel[];
  /** Quem ficou de fora e por quê. Aparece na tela: um lote que "achou 3"
      sem explicar os outros 40 parece quebrado. */
  excluidos: ExcluidoFollowUp[];
  /** Quantos ainda cabem hoje: o menor entre o lote e o que sobrou do teto. */
  limite: number;
  /** Envios do lote já feitos hoje (0 quando o teto está intacto). */
  enviadosHoje: number;
}

const TEXTO_MOTIVO: Record<MotivoExclusao, string> = {
  "sem-telefone": "Sem telefone cadastrado",
  "numero-invalido": "Telefone fora do formato de celular",
  "contato-recente": "Falou com você há pouco tempo",
  "tentativas-demais": "Já recebeu tentativas demais",
};

export function textoMotivoExclusao(motivo: MotivoExclusao): string {
  return TEXTO_MOTIVO[motivo];
}

/** Dia de uma tentativa ("2026-07-21T14:30" -> "2026-07-21").
    O `data` da tentativa é datetime; `parseDate` só entende a data pura. */
function diaDaTentativa(t: Tentativa): string {
  return (t.data || "").slice(0, 10);
}

/** Data (YYYY-MM-DD) do contato mais recente com o proprietário, de
    qualquer canal. null quando não há tentativa registrada. */
export function ultimoContatoISO(imovel: Imovel): string | null {
  const tentativas = imovel.tentativas || [];
  let maior: string | null = null;
  for (const t of tentativas) {
    const dia = diaDaTentativa(t);
    if (!dia) continue;
    if (!maior || dia > maior) maior = dia;
  }
  return maior;
}

/** Quantos follow-ups do lote já saíram hoje.
    Contamos as tentativas de HOJE no canal do lote — é o rastro que ele
    deixa. Uma tentativa por WhatsApp registrada à mão entra na conta junto,
    e tudo bem: o erro cai para o lado de enviar de menos, que é o lado
    seguro. Precisão maior exigiria marcar a tentativa com um campo novo,
    e o teto não merece uma migração de schema. */
export function enviadosFollowUpHoje(imoveis: Imovel[], hoje: string): number {
  let total = 0;
  for (const imovel of imoveis) {
    for (const t of imovel.tentativas || []) {
      if (diaDaTentativa(t) === hoje && t.canal === FOLLOWUP_CANAL) total++;
    }
  }
  return total;
}

/** Monta o público do lote: quem entra, quem fica de fora e por quê. */
export function selecionarFollowUp(imoveis: Imovel[], hoje: string): SelecaoFollowUp {
  const elegiveis: Imovel[] = [];
  const excluidos: ExcluidoFollowUp[] = [];

  for (const imovel of imoveis) {
    if (imovel.status !== FOLLOWUP_STATUS_ALVO) continue;

    // Telefone: os dois testes são de FORMA e rodam aqui de propósito, para
    // a tela já mostrar o problema. Se o número existe mesmo no WhatsApp,
    // só a Evolution sabe — ela responde no envio.
    const telefone = (imovel.proprietarioTelefone || "").trim();
    if (!telefone) {
      excluidos.push({ imovel, motivo: "sem-telefone", detalhe: "" });
      continue;
    }
    if (!numeroEvolution(telefone)) {
      excluidos.push({ imovel, motivo: "numero-invalido", detalhe: telefone });
      continue;
    }

    const tentativas = imovel.tentativas || [];
    if (tentativas.length >= FOLLOWUP_MAX_TENTATIVAS) {
      excluidos.push({
        imovel,
        motivo: "tentativas-demais",
        detalhe: `${tentativas.length} tentativas`,
      });
      continue;
    }

    const ultimo = ultimoContatoISO(imovel);
    const dias = ultimo ? daysBetween(ultimo, hoje) : null;
    if (dias !== null && dias < FOLLOWUP_DIAS_DESDE_ULTIMO) {
      excluidos.push({
        imovel,
        motivo: "contato-recente",
        detalhe: dias <= 0 ? "hoje" : dias === 1 ? "ontem" : `há ${dias} dias`,
      });
      continue;
    }

    elegiveis.push(imovel);
  }

  // Quem espera há mais tempo primeiro. Sem contato registrado vai na
  // frente (o caso mais esquecido de todos).
  elegiveis.sort((a, b) => {
    const ua = ultimoContatoISO(a) || "";
    const ub = ultimoContatoISO(b) || "";
    if (ua === ub) return 0;
    return ua < ub ? -1 : 1;
  });

  const enviadosHoje = enviadosFollowUpHoje(imoveis, hoje);
  const restante = Math.max(0, FOLLOWUP_TETO_DIA - enviadosHoje);
  return {
    elegiveis,
    excluidos,
    limite: Math.min(FOLLOWUP_LOTE_MAX, restante),
    enviadosHoje,
  };
}

/* --- Texto ------------------------------------------------------------------
   A abordagem escolhida é ao mesmo tempo o que SAI (o roteiro) e o que fica
   REGISTRADO (o abordagemId da tentativa). Um seletor só, porque dois
   permitiriam divergir "o que eu disse" de "o que eu anotei que disse" — e o
   ranking de abordagens passaria a medir ficção. */

/** Imóvel de mentira cujos dados são os próprios marcadores. Serve para
    arrancar de `mensagemWhatsapp` um texto BASE (com {nome}/{endereco}) em
    vez de um texto já preenchido para um proprietário específico — o modelo
    do sistema é escrito para um imóvel, e o lote precisa de um molde.
    `bairro` vazio de propósito: senão a referência sairia "({endereco}, )". */
const IMOVEL_MOLDE: Imovel = {
  id: "",
  endereco: "{endereco}",
  bairro: "",
  proprietarioNome: "{nome}",
  status: FOLLOWUP_STATUS_ALVO,
};

/** Texto base do lote a partir da abordagem — um MOLDE, com marcadores, não
    a mensagem final de ninguém. Sem roteiro, cai no modelo do sistema
    escrito para o caso. */
export function textoBaseFollowUp(abordagem: Abordagem | null): string {
  const roteiro = (abordagem?.roteiro || "").trim();
  return roteiro || mensagemWhatsapp(MODELO_PADRAO, IMOVEL_MOLDE);
}

/** O texto base preenchido para um proprietário ({nome}, {endereco}). */
export function textoFollowUp(base: string, imovel: Imovel): string {
  return aplicarModeloUsuario(base, imovel);
}

/** Aviso quando o texto base não personaliza nada.
    Sem `{nome}`, as dez mensagens saem byte a byte idênticas — a assinatura
    de spam mais forte que existe, e justamente a que o resto do módulo tenta
    evitar. Avisa, não bloqueia: o corretor pode ter escrito um texto que
    cita o nome de outro jeito. */
export function avisoTextoLote(base: string): string | null {
  if (base.includes("{nome}")) return null;
  return "Este texto não usa {nome}: todas as mensagens sairão idênticas, o que aumenta o risco de o WhatsApp marcar o envio como spam. Use o marcador {nome} para personalizar.";
}

/** Falhas que não são do número, e sim do ambiente: vão se repetir
    igualzinho nos nove imóveis seguintes. Diante de uma delas a fila para na
    hora — insistir gastaria sete minutos para produzir dez vezes o mesmo
    erro. As demais (`sem-whatsapp`, `numero-invalido`...) são do contato da
    vez e não dizem nada sobre o próximo, então a fila segue. */
const FALHAS_FATAIS: readonly FalhaEnvio[] = [
  "nao-configurado",
  "sem-permissao",
  "instancia-desconectada",
  "sessao-expirada",
];

export function falhaEncerraLote(falha: FalhaEnvio | undefined): boolean {
  return !!falha && FALHAS_FATAIS.includes(falha);
}

/** Sorteia o intervalo até o próximo envio. Recebe o sorteio de fora
    (0–1) para o módulo continuar puro e o teste ser determinístico. */
export function intervaloFollowUpMs(sorteio: number): number {
  const faixa = FOLLOWUP_INTERVALO_MAX_MS - FOLLOWUP_INTERVALO_MIN_MS;
  const limitado = Math.min(1, Math.max(0, sorteio));
  return Math.round(FOLLOWUP_INTERVALO_MIN_MS + limitado * faixa);
}

/** Resumo de uma rodada, para o toast único do fim.
    Um toast por envio seria insuportável: o corretor segue prospectando
    enquanto a fila roda, e dez "Tentativa registrada" pipocando por cima do
    formulário que ele está preenchendo tornariam a feature inutilizável. */
export type FimDeLote = "concluido" | "cancelado" | "interrompido";

export function resumoLote(enviados: number, falhas: number, fim: FimDeLote): string {
  const partes: string[] = [];
  partes.push(enviados === 1 ? "1 mensagem enviada" : `${enviados} mensagens enviadas`);
  if (falhas > 0) partes.push(falhas === 1 ? "1 falhou" : `${falhas} falharam`);
  const texto = partes.join(", ") + ".";
  if (fim === "cancelado") return `Envio cancelado: ${texto.charAt(0).toLowerCase()}${texto.slice(1)}`;
  if (fim === "interrompido")
    return `Envio interrompido — o problema afetaria todos os envios seguintes: ${texto.charAt(0).toLowerCase()}${texto.slice(1)}`;
  return texto;
}
