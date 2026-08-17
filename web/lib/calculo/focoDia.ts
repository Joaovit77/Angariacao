/* ================================================================
   FOCO INTELIGENTE DO DIA — fila deterministica de proximas acoes.

   A inteligencia aqui comeca antes do modelo de linguagem: respostas,
   compromissos, estagnacao e prospeccao viram uma unica fila explicavel.
   A IA pode interpretar a fila, mas nunca escolhe nem inventa a ordem.
   ================================================================ */
import { daysBetween } from "../datas";
import type { AgendaItem, Imovel } from "../tipos";
import { caixaDeRespostas } from "./respostas";
import { diasSemMovimento, isStale } from "./motor";
import { planoDoDia, type PlanoDoDia } from "./planoDia";

export type TipoAcaoFoco = "resposta" | "atrasado" | "hoje" | "parado" | "prospeccao";
export type NivelFoco = "agora" | "em-seguida" | "depois";

export interface AcaoFoco {
  id: string;
  tipo: TipoAcaoFoco;
  nivel: NivelFoco;
  titulo: string;
  contexto: string;
  motivo: string;
  destino: "/respostas" | "/agenda" | "/pipeline";
  imovelId?: string;
  /** Uso interno e em testes. A tela traduz o numero em uma faixa humana. */
  pontuacao: number;
}

export interface FocoInteligente {
  acoes: AcaoFoco[];
  totalAcoes: number;
  respostasPendentes: number;
  compromissosVencidos: number;
  compromissosHoje: number;
  imoveisParados: number;
  planoProspeccao: PlanoDoDia;
}

function rotuloImovel(imovel: Imovel | undefined): string {
  if (!imovel) return "Imovel nao identificado";
  return imovel.codigo || imovel.endereco || "Imovel sem identificacao";
}

function nivelDaPontuacao(pontuacao: number): NivelFoco {
  if (pontuacao >= 800) return "agora";
  if (pontuacao >= 500) return "em-seguida";
  return "depois";
}

/**
 * Monta uma fila curta, estavel e auditavel. Quando duas pendencias apontam
 * para o mesmo imovel, fica a de maior consequencia: a tela nao manda o
 * corretor abrir o mesmo caso duas vezes sem explicar por que.
 */
export function focoInteligenteDoDia(
  imoveis: Imovel[],
  agenda: AgendaItem[],
  origensExtras: string[],
  hoje: string,
): FocoInteligente {
  const porId = new Map(imoveis.map((i) => [i.id, i]));
  const candidatas: AcaoFoco[] = [];

  const respostas = caixaDeRespostas(imoveis, hoje).filter((linha) => linha.pendente);
  for (const linha of respostas) {
    const imovel = porId.get(linha.imovelId);
    const captacao = linha.fase === "captacao";
    const pontuacao = (captacao ? 1000 : 850) + Math.min(linha.naoTratadas, 9);
    candidatas.push({
      id: `resposta:${linha.imovelId}`,
      tipo: "resposta",
      nivel: nivelDaPontuacao(pontuacao),
      titulo: `Responder ${rotuloImovel(imovel)}`,
      contexto: linha.previa.texto || "Nova resposta do proprietario",
      motivo: captacao
        ? "Uma resposta em captacao pode esfriar se esperar."
        : "A conversa da carteira esta aguardando tratamento.",
      destino: "/respostas",
      imovelId: linha.imovelId,
      pontuacao,
    });
  }

  let compromissosVencidos = 0;
  let compromissosHoje = 0;
  for (const item of agenda) {
    if (item.done) continue;
    const atraso = daysBetween(item.date, hoje);
    if (atraso == null || atraso < 0) continue;
    const vencido = atraso > 0;
    if (vencido) compromissosVencidos++;
    else compromissosHoje++;
    const pontuacao = vencido ? 900 + Math.min(atraso, 30) : 800;
    candidatas.push({
      id: `agenda:${item.id}`,
      tipo: vencido ? "atrasado" : "hoje",
      nivel: nivelDaPontuacao(pontuacao),
      titulo: item.title,
      contexto: item.imovelId ? rotuloImovel(porId.get(item.imovelId)) : item.type,
      motivo: vencido
        ? `Compromisso vencido ha ${atraso} dia${atraso === 1 ? "" : "s"}.`
        : item.hora
          ? `Compromisso de hoje as ${item.hora}.`
          : "Compromisso previsto para hoje.",
      destino: "/agenda",
      imovelId: item.imovelId || undefined,
      pontuacao,
    });
  }

  const parados = imoveis.filter((imovel) => isStale(imovel, hoje));
  for (const imovel of parados) {
    const dias = diasSemMovimento(imovel, hoje) ?? 0;
    const pontuacao = 500 + Math.min(dias, 60);
    candidatas.push({
      id: `parado:${imovel.id}`,
      tipo: "parado",
      nivel: nivelDaPontuacao(pontuacao),
      titulo: `Retomar ${rotuloImovel(imovel)}`,
      contexto: `Parado em ${imovel.status}`,
      motivo: `Sem movimento ha ${dias} dia${dias === 1 ? "" : "s"}.`,
      destino: "/pipeline",
      imovelId: imovel.id,
      pontuacao,
    });
  }

  const planoProspeccao = planoDoDia(imoveis, origensExtras, hoje);
  for (const portal of planoProspeccao.portais.filter((p) => p.restantes > 0)) {
    const pontuacao = 300 + Math.min(portal.restantes, 50);
    candidatas.push({
      id: `prospeccao:${portal.origem}`,
      tipo: "prospeccao",
      nivel: nivelDaPontuacao(pontuacao),
      titulo: `Prospectar no ${portal.origem}`,
      contexto: `Faltam ${portal.restantes} de ${portal.sugerido} contatos sugeridos`,
      motivo: "Mantem o ritmo de entrada sem abandonar este canal.",
      destino: "/pipeline",
      pontuacao,
    });
  }

  candidatas.sort((a, b) => b.pontuacao - a.pontuacao || a.titulo.localeCompare(b.titulo));

  const vistas = new Set<string>();
  const acoes = candidatas.filter((acao) => {
    if (!acao.imovelId) return true;
    if (vistas.has(acao.imovelId)) return false;
    vistas.add(acao.imovelId);
    return true;
  });

  return {
    acoes,
    totalAcoes: acoes.length,
    respostasPendentes: respostas.length,
    compromissosVencidos,
    compromissosHoje,
    imoveisParados: parados.length,
    planoProspeccao,
  };
}
