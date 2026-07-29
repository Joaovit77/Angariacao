/* ================================================================
   GOOGLE AGENDA — partes puras

   Mesmo papel de `calculo/whatsapp.ts` no envio: o vocabulário que
   cliente e servidor precisam compartilhar (motivos de falha) e a
   tradução de um compromisso do painel para o formato do Google.
   Sem rede, sem banco, sem SDK — a rota fica só com o efeito.

   ## A sincronização é de UMA VIA: painel → Google

   O painel manda, o Google obedece. Não há reconciliação porque não há
   conflito possível: nada do que o corretor fizer no Google volta para
   cá. É uma escolha, não uma limitação de tempo — o bidirecional exige
   detectar mudança do lado do Google (canais push que expiram toda
   semana, ou varredura periódica), decidir quem vence quando os dois
   mudam, e distinguir "apagado no Google" de "nunca sincronizado". É
   onde esse tipo de integração costuma quebrar, e o problema real que
   o corretor tem é outro: receber o lembrete no celular.

   Consequência assumida: um evento editado no Google é sobrescrito no
   próximo salvamento do painel. A agenda do painel é a fonte de verdade.

   ## O compromisso sem hora vira evento de DIA INTEIRO

   `AgendaItem.hora` é opcional, e a diferença importa no Google tanto
   quanto importa na Agenda daqui (ver `separarPorHorario`): um
   follow-up sem hora marcada não é um evento das 00:00, é uma tarefa do
   dia. Como evento cronometrado, ele apareceria de madrugada no celular
   e dispararia lembrete na hora errada.
   ================================================================ */
import type { AgendaItem, Imovel } from "../tipos";

/** Escopo pedido na tela de consentimento.

    `calendar.events` mexe em COMPROMISSOS; o `calendar` (sem sufixo) daria
    poder sobre agendas inteiras — criar, apagar, renomear. Não precisamos, e
    escopo a mais é atrito na tela de consentimento e risco na verificação do
    Google. Menor privilégio que resolve. */
export const ESCOPO_GOOGLE = "https://www.googleapis.com/auth/calendar.events";

export const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
export const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
export const GOOGLE_API_BASE = "https://www.googleapis.com/calendar/v3";

/** Caminho do callback. Constante porque ele precisa bater EXATAMENTE com o
    que está registrado no Google Cloud — incluindo esquema, host e barra
    final. Divergência aqui dá `redirect_uri_mismatch`, que é o erro mais
    comum desta integração e não diz onde está a diferença. */
export const CAMINHO_CALLBACK = "/api/google/callback";

/** Fuso dos compromissos. O Google exige um IANA timeZone junto do dateTime;
    sem ele, o evento entra em UTC e a visita das 10h aparece às 7h no celular.
    Fixo em São Paulo porque a operação é em Londrina — vira config no dia em
    que houver corretor em outro fuso. */
export const FUSO = "America/Sao_Paulo";

/** Duração padrão de um compromisso com hora, em minutos. O painel guarda só
    o começo (`hora`), e o Google exige fim. Uma hora é o que uma visita
    costuma ocupar, e o valor só afeta como o bloco é DESENHADO na agenda —
    o lembrete dispara pelo começo. */
export const DURACAO_PADRAO_MIN = 60;

/** Motivos de falha, no mesmo espírito de `FalhaEnvio`: a UI traduz, o
    servidor classifica. */
export type FalhaGoogle =
  | "nao-configurado"
  | "sessao-expirada"
  | "sem-conexao-google"
  | "autorizacao-negada"
  | "autorizacao-expirada"
  | "compromisso-nao-encontrado"
  | "falha-google";

export function mensagemFalhaGoogle(falha: FalhaGoogle): string {
  switch (falha) {
    case "nao-configurado":
      return "A integração com o Google Agenda não está configurada neste servidor.";
    case "sessao-expirada":
      return "Sua sessão expirou. Entre novamente e tente de novo.";
    case "sem-conexao-google":
      return "Sua conta do Google não está conectada. Conecte em Configurações.";
    case "autorizacao-negada":
      return "A autorização no Google foi cancelada.";
    case "autorizacao-expirada":
      return "O Google revogou o acesso. Conecte a conta novamente em Configurações.";
    case "compromisso-nao-encontrado":
      return "Compromisso não encontrado.";
    case "falha-google":
      return "O Google Agenda não respondeu agora. O compromisso foi salvo aqui mesmo assim.";
  }
}

/** Soma minutos a uma hora "HH:MM", devolvendo "HH:MM".

    Aritmética em minutos, sem `Date`: a regra do projeto vale aqui também, e
    `new Date("2026-07-30T10:00")` traria fuso para dentro de uma conta que é
    só soma. Passa de meia-noite? Satura em 23:59 — um compromisso que
    começa às 23:30 não deve empurrar o evento para o dia seguinte. */
export function somarMinutos(hora: string, minutos: number): string {
  const [h, m] = hora.split(":").map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return hora;
  const total = h * 60 + m + minutos;
  if (total >= 24 * 60 - 1) return "23:59";
  const hh = String(Math.floor(total / 60)).padStart(2, "0");
  const mm = String(total % 60).padStart(2, "0");
  return `${hh}:${mm}`;
}

/** Hora utilizável ("HH:MM") ou null. Mesma tolerância do `separarPorHorario`:
    null, "" e "  " são todos "sem hora" — o modal grava null, mas dado antigo
    tem string vazia. */
export function horaUtil(hora: string | null | undefined): string | null {
  const h = (hora || "").trim();
  return /^\d{1,2}:\d{2}$/.test(h) ? h.padStart(5, "0") : null;
}

/** O dia seguinte, em ISO. Evento de dia inteiro no Google usa fim EXCLUSIVO:
    um compromisso de 30/07 vai como start 30/07, end 31/07. Com o mesmo dia
    nos dois, a API recusa. */
function diaSeguinte(iso: string): string {
  const [a, m, d] = iso.split("-").map(Number);
  const dias = [31, (a % 4 === 0 && a % 100 !== 0) || a % 400 === 0 ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let dd = d + 1;
  let mm = m;
  let aa = a;
  if (dd > dias[m - 1]) {
    dd = 1;
    mm += 1;
    if (mm > 12) {
      mm = 1;
      aa += 1;
    }
  }
  return `${aa}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
}

export interface EventoGoogle {
  summary: string;
  description?: string;
  location?: string;
  start: { date?: string; dateTime?: string; timeZone?: string };
  end: { date?: string; dateTime?: string; timeZone?: string };
}

/**
 * O compromisso do painel no formato do Google.
 *
 * O imóvel entra por parâmetro (e não é buscado aqui) para a função seguir
 * pura: é a rota que lê do banco. Pode vir null — compromisso avulso não tem
 * imóvel, e o evento continua fazendo sentido sem endereço.
 *
 * O ✓ no título do concluído é deliberado, em vez de apagar o evento: a
 * agenda também é registro do que foi feito, e uma visita que some depois de
 * realizada apaga a prova de que ela aconteceu. Some do "pendente" sem sumir
 * do histórico.
 */
export function eventoDoCompromisso(item: AgendaItem, imovel: Imovel | null): EventoGoogle {
  const titulo = (item.title || "Compromisso").trim();
  const summary = item.done ? `✓ ${titulo}` : titulo;

  const linhas: string[] = [];
  if (item.type) linhas.push(`Tipo: ${item.type}`);
  if (imovel) {
    const codigo = imovel.codigo || imovel.referenciaCrm;
    if (codigo) linhas.push(`Imóvel: ${codigo}`);
    if (imovel.proprietarioNome) linhas.push(`Proprietário: ${imovel.proprietarioNome}`);
    if (imovel.proprietarioTelefone) linhas.push(`Telefone: ${imovel.proprietarioTelefone}`);
  }
  if (item.notes && item.notes.trim()) linhas.push("", item.notes.trim());
  linhas.push("", "Criado pelo Painel de Angariações.");

  const hora = horaUtil(item.hora);
  const evento: EventoGoogle = {
    summary,
    description: linhas.join("\n"),
    start: hora
      ? { dateTime: `${item.date}T${hora}:00`, timeZone: FUSO }
      : { date: item.date },
    end: hora
      ? { dateTime: `${item.date}T${somarMinutos(hora, DURACAO_PADRAO_MIN)}:00`, timeZone: FUSO }
      : { date: diaSeguinte(item.date) },
  };

  if (imovel?.endereco) {
    const partes = [imovel.endereco, imovel.bairro, imovel.cidade].filter(Boolean);
    evento.location = partes.join(", ");
  }
  return evento;
}

/**
 * A URL da tela de consentimento.
 *
 * Dois parâmetros que parecem detalhe e são a integração inteira:
 *
 * - `access_type=offline` é o que faz o Google devolver um REFRESH token.
 *   Sem ele vem só um access token de uma hora, e a sincronização morre no
 *   almoço do primeiro dia.
 * - `prompt=consent` força a tela mesmo para quem já autorizou antes. O
 *   Google só manda o refresh token na PRIMEIRA autorização de cada conta;
 *   reconectar sem isto devolve um code que não gera refresh token, e o
 *   corretor fica preso num "conectado" que não funciona.
 */
export function urlDeAutorizacao(clientId: string, redirectUri: string, state: string): string {
  const p = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: ESCOPO_GOOGLE,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
    state,
  });
  return `${GOOGLE_AUTH_URL}?${p.toString()}`;
}
