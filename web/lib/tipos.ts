/* ================================================================
   TIPOS DO DOMÍNIO
   Espelham o shape camelCase produzido pelos mapeadores fromDb*
   do app original (app.js, seção 2). Os campos são deliberadamente
   permissivos (null/undefined/"") porque o motor de cálculo legado
   trata todos esses casos — o tipo documenta o contrato, não o
   restringe além do que o código antigo garantia.
   ================================================================ */

export interface StatusHistoryEntry {
  status: string;
  date: string; // ISO YYYY-MM-DD
}

/** Nota do histórico de interações com o proprietário (CRM). */
export interface NotaImovel {
  id: string;
  texto: string;
  /** Datetime local "YYYY-MM-DDTHH:mm" — lexicograficamente ordenável. */
  data: string;
}

export interface Imovel {
  id: string;
  codigo?: string | null;
  referenciaCrm?: string | null;
  cep?: string | null;
  endereco: string;
  bairro?: string | null;
  cidade?: string | null;
  tipo?: string | null;
  quartos?: number | null;
  banheiros?: number | null;
  vagas?: number | null;
  valorAluguel?: number | null;
  valorCondominio?: number | null;
  proprietarioNome?: string | null;
  proprietarioTelefone?: string | null;
  formaAbordagem?: string | null;
  origemImovel?: string | null;
  imobiliariaConcorrente?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  dataAngariacao?: string | null; // ISO YYYY-MM-DD
  responsavel?: string | null;
  status: string;
  observacoes?: string | null;
  statusHistory?: StatusHistoryEntry[] | null;
  notas?: NotaImovel[] | null;
  pausadoAte?: string | null; // ISO YYYY-MM-DD
  motivoPerda?: string | null;
  motivoPerdaOutro?: string | null;
  comissaoRecebida?: boolean | null;
  comissaoRecebidaValor?: number | null;
  comissaoRecebidaData?: string | null; // ISO YYYY-MM-DD
}

export interface Meta {
  angariacoes: number;
  locados: number;
  comissao: number;
  /** Meta de faturamento estimado em contratos (R$ de aluguéis locados no mês). */
  faturamento: number;
}

/** Metas por mês: { "YYYY-MM": Meta } — mesmo shape do STATE.metas legado. */
export type Metas = Record<string, Meta>;

export interface AgendaItem {
  id: string;
  title: string;
  type: string;
  date: string; // ISO YYYY-MM-DD
  imovelId?: string | null;
  notes?: string | null;
  done: boolean;
  isVerificacaoDisponibilidade: boolean;
}

export interface UserConfig {
  /** % sobre 1 aluguel (100 = 1 mês de aluguel) */
  comissaoPercent: number;
}
