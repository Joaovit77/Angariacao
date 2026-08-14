/* ================================================================
   HELPERS DE DATA
   Port literal da seção 3 do app.js original. Datas circulam pelo
   app sempre como string ISO "YYYY-MM-DD"; este é o ÚNICO módulo
   autorizado a usar `new Date` (regra de lint — MIGRATION_NEXT.md
   §3.5), porque o Date cru interpreta "YYYY-MM-DD" como UTC e
   desloca o dia em fusos negativos.
   ================================================================ */

export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Relógio centralizado para regras que trabalham em milissegundos. */
export function agoraTimestamp(): number {
  return Date.now();
}

/** Instante atual completo, pronto para colunas timestamptz. */
export function agoraISOString(): string {
  return new Date().toISOString();
}

/** Converte um datetime ISO em milissegundos, sem espalhar Date pelo app. */
export function timestampDeIso(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const valor = new Date(iso).getTime();
  return Number.isFinite(valor) ? valor : null;
}

export function fmtDataHoraIso(iso: string | null | undefined): string {
  if (!iso) return "";
  const data = new Date(iso);
  return Number.isNaN(data.getTime()) ? "" : data.toLocaleString("pt-BR");
}

/** Converte data/hora digitadas no fuso local para um instante UTC. */
export function dataHoraLocalParaIso(data: string, hora: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data) || !/^\d{2}:\d{2}$/.test(hora)) return null;
  const valor = new Date(`${data}T${hora}:00`);
  return Number.isNaN(valor.getTime()) ? null : valor.toISOString();
}

export function partesDataHoraLocal(iso?: string, deslocamentoMs = 0): { data: string; hora: string } {
  const d = iso ? new Date(iso) : new Date(Date.now() + deslocamentoMs);
  const pad = (n: number) => String(n).padStart(2, "0");
  return { data: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`, hora: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
}

export interface IntervaloSemana {
  start: string;
  end: string;
}

/** Semana de segunda a domingo, deslocada por `offset` semanas.
    Port literal de weekRange() (app.js, 5F) — inclusive o uso de
    toISOString(), que converte para UTC. */
export function weekRange(offset: number): IntervaloSemana {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0 = domingo
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((dayOfWeek + 6) % 7) + offset * 7);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const toISO = (d: Date) => d.toISOString().slice(0, 10);
  return { start: toISO(monday), end: toISO(sunday) };
}

/** Segunda-feira (ISO) da semana que contém a data — chave de agrupamento
    semanal para qualquer semana histórica (o weekRange acima é ancorado em
    "agora" e só serve para a semana corrente). Usa componentes locais em vez
    de toISOString() para não deslocar o dia em fusos negativos. */
export function inicioDaSemana(iso: string | null | undefined): string | null {
  const d = parseDate(iso);
  if (!d) return null;
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Fuso operacional explícito: funções da Vercel rodam em UTC. */
export const FUSO_OPERACIONAL = "America/Sao_Paulo";

/** Inicio de um dia civil no fuso operacional, convertido para timestamptz. */
export function inicioDoDiaOperacionalISO(iso: string): string | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [ano, mes, dia] = iso.split("-").map(Number);
  const validacao = parseDate(iso);
  if (!validacao || validacao.getFullYear() !== ano || validacao.getMonth() !== mes - 1 || validacao.getDate() !== dia) return null;
  const meiaNoiteComoUtc = Date.UTC(ano, mes - 1, dia);
  const deslocamento = (instante: number) => {
    const partes = new Intl.DateTimeFormat("en-CA", {
      timeZone: FUSO_OPERACIONAL,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23",
    }).formatToParts(new Date(instante));
    const valor = (tipo: Intl.DateTimeFormatPartTypes) => Number(partes.find((parte) => parte.type === tipo)?.value || 0);
    return Date.UTC(valor("year"), valor("month") - 1, valor("day"), valor("hour"), valor("minute"), valor("second")) - instante;
  };
  const primeiraTentativa = meiaNoiteComoUtc - deslocamento(meiaNoiteComoUtc);
  return new Date(meiaNoiteComoUtc - deslocamento(primeiraTentativa)).toISOString();
}

/** Agora em São Paulo, como "YYYY-MM-DDTHH:mm". Não depende do fuso da máquina. */
export function agoraISOComHora(): string {
  const partes = new Intl.DateTimeFormat("en-CA", {
    timeZone: FUSO_OPERACIONAL,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const valor = (tipo: Intl.DateTimeFormatPartTypes) =>
    partes.find((parte) => parte.type === tipo)?.value || "";
  return `${valor("year")}-${valor("month")}-${valor("day")}T${valor("hour")}:${valor("minute")}`;
}

export function parseDate(iso: string | null | undefined): Date | null {
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Minutos entre dois datetimes "YYYY-MM-DDTHH:mm" (sempre positivo).
    `null` quando algum deles não tem hora. Comparar as strings resolveria
    dentro do mesmo dia e falharia justo na virada da meia-noite, que é quando
    o erro passa despercebido. */
export function minutosEntre(isoA: string | null | undefined, isoB: string | null | undefined): number | null {
  const paraData = (iso: string | null | undefined): Date | null => {
    if (!iso || iso.length < 16) return null;
    const [dia, hora] = iso.split("T");
    const [y, m, d] = dia.split("-").map(Number);
    const [hh, mm] = hora.split(":").map(Number);
    if ([y, m, d, hh, mm].some((n) => Number.isNaN(n))) return null;
    return new Date(y, m - 1, d, hh, mm);
  };
  const a = paraData(isoA);
  const b = paraData(isoB);
  if (!a || !b) return null;
  return Math.abs(Math.round((b.getTime() - a.getTime()) / 60000));
}

export function daysBetween(isoA: string | null | undefined, isoB: string | null | undefined): number | null {
  const a = parseDate(isoA), b = parseDate(isoB);
  if (!a || !b) return null;
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

const MESES_PT: Record<string, number> = {
  jan: 0, fev: 1, mar: 2, abr: 3, mai: 4, jun: 5,
  jul: 6, ago: 7, set: 8, out: 9, nov: 10, dez: 11,
};

/** Converte os rótulos publicados pela OLX sem atribuir uma data quando
    o portal usar um formato desconhecido. */
export function dataPublicacaoOlx(texto: string, agora = new Date()): Date | null {
  const hora = texto.match(/(\d{1,2}):(\d{2})/);
  if (!hora) return null;
  const horas = Number(hora[1]);
  const minutos = Number(hora[2]);

  if (/^hoje\b/i.test(texto)) {
    return new Date(agora.getFullYear(), agora.getMonth(), agora.getDate(), horas, minutos);
  }
  if (/^ontem\b/i.test(texto)) {
    return new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() - 1, horas, minutos);
  }

  const data = texto.toLowerCase().match(/^(\d{1,2})\s+de\s+([a-zç]{3})/i);
  const mes = data ? MESES_PT[data[2]] : undefined;
  if (!data || mes == null) return null;
  let ano = agora.getFullYear();
  let resultado = new Date(ano, mes, Number(data[1]), horas, minutos);
  if (resultado.getTime() > agora.getTime() + 24 * 60 * 60 * 1000) {
    resultado = new Date(--ano, mes, Number(data[1]), horas, minutos);
  }
  return Number.isNaN(resultado.getTime()) ? null : resultado;
}

export function dentroDoPeriodo(publicadoEm: string | null | undefined, dias: number, agora = new Date()): boolean {
  if (!publicadoEm) return false;
  const data = new Date(publicadoEm);
  if (Number.isNaN(data.getTime())) return false;
  const idade = agora.getTime() - data.getTime();
  return idade >= 0 && idade <= dias * 24 * 60 * 60 * 1000;
}

// Soma dias a uma data ISO — usado para calcular a data do próximo
// lembrete de verificação de disponibilidade.
export function addDaysISO(iso: string | null | undefined, days: number): string | null {
  const d = parseDate(iso);
  if (!d) return null;
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

export function monthKey(iso: string | null | undefined): string | null {
  if (!iso) return null;
  return iso.slice(0, 7); // "YYYY-MM"
}

export function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m - 1, 1);
  return d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }).replace(".", "");
}

export function monthLabelLong(key: string): string {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m - 1, 1);
  const s = d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function currentMonthKey(): string {
  return todayISO().slice(0, 7);
}

export function shiftMonthKey(key: string, delta: number): string {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return d.toISOString().slice(0, 7);
}

/** Primeiro e último dia (ISO) do mês "YYYY-MM". */
export function primeiroDiaDoMes(key: string): string {
  return `${key}-01`;
}

export function ultimoDiaDoMes(key: string): string {
  const [y, m] = key.split("-").map(Number);
  // Dia 0 do mês seguinte = último dia deste mês (resolve 28/29/30/31 sozinho).
  const d = new Date(y, m, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/**
 * Dias ÚTEIS (segunda a sexta) entre duas datas ISO, **inclusive** nas duas
 * pontas. Devolve 0 quando o intervalo é vazio (`isoA` depois de `isoB`).
 *
 * Não conhece feriado: não há calendário de feriados no app, e inventar um
 * seria pior que ignorá-los — feriado municipal varia por cidade, e o corretor
 * é quem sabe quais valem para ele. A consequência é conhecida e aceita: numa
 * semana com feriado a projeção fica levemente otimista.
 */
export function diasUteisEntre(isoA: string | null | undefined, isoB: string | null | undefined): number {
  const a = parseDate(isoA);
  const b = parseDate(isoB);
  if (!a || !b || a.getTime() > b.getTime()) return 0;
  let uteis = 0;
  const cursor = new Date(a);
  while (cursor.getTime() <= b.getTime()) {
    const dia = cursor.getDay(); // 0 = domingo, 6 = sábado
    if (dia !== 0 && dia !== 6) uteis++;
    cursor.setDate(cursor.getDate() + 1);
  }
  return uteis;
}

/** Segunda a sexta? Mesma régua (e a mesma cegueira a feriado) de
    {@link diasUteisEntre}, para um dia só — quem anda o calendário de trás
    para frente precisa perguntar por dia, não por intervalo. */
export function ehDiaUtil(iso: string | null | undefined): boolean {
  const d = parseDate(iso);
  if (!d) return false;
  const dia = d.getDay(); // 0 = domingo, 6 = sábado
  return dia !== 0 && dia !== 6;
}

export function last6MonthKeys(): string[] {
  const keys: string[] = [];
  let k = currentMonthKey();
  for (let i = 0; i < 6; i++) { keys.unshift(k); k = shiftMonthKey(k, -1); }
  return keys;
}
