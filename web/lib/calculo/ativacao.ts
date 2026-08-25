/* ================================================================
   ATIVAÇÃO INICIAL — progresso derivado da conta

   Não existe flag de onboarding: a carteira, as tentativas, a agenda e
   a meta do mês já dizem em que ponto a conta está. Assim o checklist
   se corrige sozinho, inclusive para contas antigas, sem coluna nova nem
   preferência que possa ficar desatualizada.

   Recebe dados já escopados pela sessão/RLS. O núcleo não conhece
   usuário, Supabase, React ou Next.
   ================================================================ */
import type { AgendaItem, Imovel, Metas } from "../tipos";
import { metaDoMes, temMeta } from "./metaMes";

export type EstadoAtivacaoNome = "vazia" | "andamento" | "concluida";

export type EtapaAtivacaoId =
  | "primeiro-imovel"
  | "primeiro-contato"
  | "proxima-acao"
  | "meta-mensal";

export interface EtapaAtivacao {
  id: EtapaAtivacaoId;
  concluida: boolean;
}

export interface EstadoAtivacao {
  estado: EstadoAtivacaoNome;
  etapas: EtapaAtivacao[];
  concluidas: number;
  total: number;
}

export interface DadosAtivacao {
  imoveis: readonly Pick<Imovel, "id" | "tentativas">[];
  agenda: readonly Pick<AgendaItem, "imovelId" | "done">[];
  metas: Metas;
  /** Chave determinística "YYYY-MM"; quem chama decide qual é o mês atual. */
  mesAtual: string;
}

export function estadoAtivacao({ imoveis, agenda, metas, mesAtual }: DadosAtivacao): EstadoAtivacao {
  const idsDaCarteira = new Set(imoveis.map((imovel) => imovel.id));
  const temImovel = imoveis.length > 0;
  const temContato = imoveis.some((imovel) => (imovel.tentativas?.length ?? 0) > 0);
  const temProximaAcao = agenda.some(
    (item) => !item.done && Boolean(item.imovelId) && idsDaCarteira.has(item.imovelId as string),
  );
  const temMetaMensal = temMeta(metaDoMes(metas, mesAtual));

  const etapas: EtapaAtivacao[] = [
    { id: "primeiro-imovel", concluida: temImovel },
    { id: "primeiro-contato", concluida: temContato },
    { id: "proxima-acao", concluida: temProximaAcao },
    { id: "meta-mensal", concluida: temMetaMensal },
  ];
  const concluidas = etapas.filter((etapa) => etapa.concluida).length;

  return {
    estado: !temImovel ? "vazia" : concluidas === etapas.length ? "concluida" : "andamento",
    etapas,
    concluidas,
    total: etapas.length,
  };
}
