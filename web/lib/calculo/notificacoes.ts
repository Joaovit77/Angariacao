import { rotuloDoImovel } from "./chegadaResposta";
import { corpoDaResposta, ehNotaDeEvento, ehNotaDeResposta } from "./notas";
import type { Imovel, NotaImovel } from "../tipos";
import { tempoRelativoIso } from "../datas";

export type TipoNotificacaoCentral = "mensagem-recebida" | "evento-sistema";

export interface NotificacaoCentral {
  id: string;
  notaId: string;
  tipo: TipoNotificacaoCentral;
  titulo: string;
  descricao: string;
  data: string;
  lida: boolean;
  imovelId: string;
  destino: "conversa" | "imovel";
}

const LIMITE_DESCRICAO = 140;

function limitar(texto: string): string {
  const normalizado = texto.replace(/\s+/g, " ").trim();
  if (normalizado.length <= LIMITE_DESCRICAO) return normalizado;
  return `${normalizado.slice(0, LIMITE_DESCRICAO - 1).trimEnd()}…`;
}

function notificacaoDaNota(imovel: Imovel, nota: NotaImovel): NotificacaoCentral | null {
  const id = `${imovel.id}:${nota.id}`;
  const rotulo = rotuloDoImovel(imovel);

  if (ehNotaDeResposta(nota)) {
    const nome = (imovel.proprietarioNome || "").trim();
    return {
      id,
      notaId: nota.id,
      tipo: "mensagem-recebida",
      titulo: nome ? `${nome} respondeu` : "Nova mensagem no WhatsApp",
      descricao: limitar(corpoDaResposta(nota.texto) || "Mensagem sem texto"),
      data: nota.data || "",
      lida: nota.lida === true,
      imovelId: imovel.id,
      destino: "conversa",
    };
  }

  if (ehNotaDeEvento(nota)) {
    return {
      id,
      notaId: nota.id,
      tipo: "evento-sistema",
      titulo: limitar(nota.texto || "Atualização do Sistema Principal"),
      descricao: rotulo,
      data: nota.data || "",
      lida: nota.lida === true,
      imovelId: imovel.id,
      destino: "imovel",
    };
  }

  return null;
}

/**
 * Eventos reais e persistidos que alimentam o sino.
 *
 * Cada entrada nasce de uma nota com id externo estável, fica isolada pela
 * própria linha do imóvel (RLS) e usa `lida` como estado persistido. Condições
 * derivadas, como agenda atrasada ou imóvel parado, não entram aqui: elas não
 * têm evento próprio nem leitura persistível e voltariam após cada recarga.
 */
export function notificacoesDaCentral(imoveis: Imovel[]): NotificacaoCentral[] {
  const vistas = new Set<string>();
  const notificacoes: NotificacaoCentral[] = [];

  for (const imovel of imoveis) {
    for (const nota of imovel.notas || []) {
      const notificacao = notificacaoDaNota(imovel, nota);
      if (!notificacao || vistas.has(notificacao.id)) continue;
      vistas.add(notificacao.id);
      notificacoes.push(notificacao);
    }
  }

  return notificacoes.sort((a, b) => {
    const porData = (b.data || "").localeCompare(a.data || "");
    return porData || b.id.localeCompare(a.id);
  });
}

export function tempoRelativoNotificacao(data: string, instanteAtual?: number): string {
  return tempoRelativoIso(data, instanteAtual);
}
