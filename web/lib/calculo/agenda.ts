/* ================================================================
   AGENDA — helpers puros
   Port literal de agendaTypeIcon / isAgendaAngariacaoVencida /
   isAgendaAngariacaoMonitorada / agendaVencimentoInfo /
   mensagemRenovacaoAngariacao / telefoneWhatsapp (app.js, seção 5D).
   ================================================================ */
import { AGENDA_TYPES } from "../constantes";
import { daysBetween, todayISO } from "../datas";
import type { AgendaItem, Imovel } from "../tipos";

// Lista de tipos oferecida ao usuário: os fixos do app + os personalizados
// salvos no config, sem duplicar e preservando a ordem (fixos primeiro).
export function tiposAgendaDisponiveis(agendaTipos: string[] | null | undefined): string[] {
  const base = AGENDA_TYPES as readonly string[];
  const extras = (agendaTipos || [])
    .map((t) => t.trim())
    .filter((t) => t !== "" && !base.includes(t));
  return [...base, ...Array.from(new Set(extras))];
}

// Ordena por data e, no mesmo dia, por hora — compromissos sem hora
// ("dia inteiro") vêm antes dos com hora (string vazia < "HH:MM").
export function compararAgenda(a: AgendaItem, b: AgendaItem): number {
  return a.date.localeCompare(b.date) || (a.hora || "").localeCompare(b.hora || "");
}

// Janela de "perto o suficiente" para aparecer na aba Pendentes — atrasados,
// hoje, e o que vence nos próximos 15 dias. O resto (não concluído, mas
// distante) fica escondido dessa aba para não afogar o que precisa de ação
// agora, mas continua contando no Resumo e visível na aba Todas.
export const AGENDA_PENDENTES_JANELA_DIAS = 15;

export function agendaTypeIcon(type: string, isVerificacao: boolean): string {
  if (isVerificacao) return "🔔";
  const icons: Record<string, string> = {
    "Retorno ao proprietÃ¡rio": "☎",
    "Retorno ao proprietário": "☎",
    Visita: "⌂",
    "PendÃªncia": "!",
    "Pendência": "!",
    "DocumentaÃ§Ã£o": "§",
    "Documentação": "§",
    "Follow-up": "↻",
  };
  return icons[type] || "•";
}

export function isAgendaAngariacaoVencida(a: AgendaItem | null | undefined): boolean {
  if (!a || a.done || !a.imovelId || a.date > todayISO()) return false;
  if (a.isVerificacaoDisponibilidade) return true;
  const text = `${a.type || ""} ${a.title || ""} ${a.notes || ""}`.toLowerCase();
  return (
    a.type === "Follow-up" ||
    text.includes("verificar disponibilidade") ||
    text.includes("vencimento") ||
    text.includes("angaria")
  );
}

export function isAgendaAngariacaoMonitorada(a: AgendaItem | null | undefined): boolean {
  if (!a || a.done || !a.imovelId) return false;
  if (a.isVerificacaoDisponibilidade) return true;
  const text = `${a.type || ""} ${a.title || ""} ${a.notes || ""}`.toLowerCase();
  return (
    a.type === "Follow-up" ||
    text.includes("verificar disponibilidade") ||
    text.includes("vencimento") ||
    text.includes("angaria")
  );
}

export interface VencimentoInfo {
  tone: "expired" | "soon" | "warning" | "ok";
  label: string;
}

export function agendaVencimentoInfo(a: AgendaItem): VencimentoInfo | null {
  if (!isAgendaAngariacaoMonitorada(a)) return null;
  const days = daysBetween(todayISO(), a.date);
  if (days == null) return null;
  if (days < 0) return { tone: "expired", label: "Vencido" };
  if (days < 7) return { tone: "soon", label: days === 0 ? "Vence hoje" : "Menos de 7 dias" };
  if (days <= 15) return { tone: "warning", label: "Entre 7 e 15 dias" };
  return { tone: "ok", label: "Mais de 15 dias" };
}

export function mensagemRenovacaoAngariacao(imovel: Imovel | null | undefined): string {
  const nome = imovel && imovel.proprietarioNome ? imovel.proprietarioNome.trim() : "";
  const saudacao = nome ? `Olá, ${nome}! Tudo bem?` : "Olá! Tudo bem?";
  return `${saudacao}

Percebemos que o período de angariação do seu imóvel chegou ao vencimento.

Gostaríamos de saber se você deseja renovar a parceria conosco para continuarmos trabalhando na divulgação e comercialização do imóvel.

Caso tenha interesse, estamos à disposição para dar continuidade ao atendimento.

Atenciosamente,
Equipe da imobiliária.`;
}

export function telefoneWhatsapp(telefone: string | null | undefined): string {
  const digits = String(telefone || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("55")) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}
