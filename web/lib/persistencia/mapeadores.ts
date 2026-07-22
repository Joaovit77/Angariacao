/* ================================================================
   MAPEADORES camelCase <-> snake_case
   Port literal da seção 2 do app.js original. Convertem entre o
   formato camelCase usado no app e o snake_case das colunas do
   Postgres (Supabase). As assimetrias são intencionais e
   caracterizadas pelos testes (oracle-mapeadores.json):
   - toDb: strings vazias viram null; valorAluguel/Condominio null
     viram 0; quartos/banheiros/vagas preservam 0 (?? null).
   - fromDb: null vira "" nos campos de texto; valores numéricos
     passam por Number() (o PostgREST pode devolver numeric como
     string).
   Diferença de forma: userId entra por parâmetro em vez do global
   currentUser do app antigo.
   ================================================================ */
import { ORIGENS_LEGADAS } from "../constantes";
import type { Abordagem, AgendaItem, Imovel, NotaImovel, StatusHistoryEntry, Tentativa } from "../tipos";

/** Linha da tabela `imoveis` como o Supabase retorna/aceita. */
export interface DbImovelRow {
  id: string;
  user_id: string;
  codigo: string | null;
  referencia_crm: string | null;
  cep: string | null;
  endereco: string;
  bairro: string | null;
  cidade: string | null;
  unidade: string | null;
  bloco: string | null;
  edificio: string | null;
  tipo: string | null;
  quartos: number | null;
  banheiros: number | null;
  vagas: number | null;
  valor_aluguel: number | string | null;
  valor_condominio: number | string | null;
  proprietario_nome: string | null;
  proprietario_telefone: string | null;
  forma_abordagem: string | null;
  origem_imovel: string | null;
  imobiliaria_concorrente: string | null;
  latitude: number | null;
  longitude: number | null;
  data_angariacao: string | null;
  responsavel: string | null;
  status: string;
  observacoes: string | null;
  status_history: StatusHistoryEntry[] | null;
  notas: NotaImovel[] | null;
  tentativas: Tentativa[] | null;
  pausado_ate: string | null;
  motivo_perda: string | null;
  motivo_perda_outro: string | null;
  comissao_recebida: boolean | null;
  comissao_recebida_valor: number | string | null;
  comissao_recebida_data: string | null;
  pre_cadastro: boolean | null;
  created_at?: string;
  updated_at?: string;
}

/** Linha da tabela `agenda` como o Supabase retorna/aceita. */
export interface DbAgendaRow {
  id: string;
  user_id: string;
  title: string;
  type: string;
  date: string;
  hora: string | null;
  imovel_id: string | null;
  notes: string | null;
  done: boolean | null;
  is_verificacao_disponibilidade: boolean | null;
  created_at?: string;
}

/** Linha da tabela `abordagens` (catálogo de roteiros de captação). */
export interface DbAbordagemRow {
  id: string;
  user_id: string;
  nome: string;
  roteiro: string | null;
  canal_sugerido: string | null;
  arquivada: boolean | null;
  created_at?: string;
}

/** Linha da tabela `metas`. */
export interface DbMetaRow {
  id?: string;
  user_id: string;
  month_key: string;
  angariacoes: number | null;
  locados: number | null;
  comissao: number | string | null;
  faturamento?: number | string | null;
}

/** Linha da tabela `user_config`. */
export interface DbUserConfigRow {
  user_id: string;
  comissao_percent: number | string | null;
  agenda_tipos: string[] | null;
  whatsapp_modelos: unknown[] | null;
  empresa: string | null;
  origens_extras: string[] | null;
}

export function toDbImovel(i: Imovel, userId: string): Omit<DbImovelRow, "created_at" | "updated_at"> {
  return {
    id: i.id,
    user_id: userId,
    codigo: i.codigo || null,
    referencia_crm: i.referenciaCrm || null,
    cep: i.cep || null,
    endereco: i.endereco,
    bairro: i.bairro || null,
    cidade: i.cidade || null,
    unidade: i.unidade || null,
    bloco: i.bloco || null,
    edificio: i.edificio || null,
    tipo: i.tipo || null,
    quartos: i.quartos ?? null,
    banheiros: i.banheiros ?? null,
    vagas: i.vagas ?? null,
    valor_aluguel: i.valorAluguel || 0,
    valor_condominio: i.valorCondominio || 0,
    proprietario_nome: i.proprietarioNome || null,
    proprietario_telefone: i.proprietarioTelefone || null,
    forma_abordagem: i.formaAbordagem || null,
    origem_imovel: i.origemImovel || null,
    imobiliaria_concorrente: i.imobiliariaConcorrente || null,
    latitude: i.latitude ?? null,
    longitude: i.longitude ?? null,
    data_angariacao: i.dataAngariacao || null,
    responsavel: i.responsavel || null,
    status: i.status,
    observacoes: i.observacoes || null,
    status_history: i.statusHistory || [],
    notas: i.notas || [],
    tentativas: i.tentativas || [],
    pausado_ate: i.pausadoAte || null,
    motivo_perda: i.motivoPerda || null,
    motivo_perda_outro: i.motivoPerdaOutro || null,
    comissao_recebida: !!i.comissaoRecebida,
    comissao_recebida_valor: i.comissaoRecebidaValor ?? null,
    comissao_recebida_data: i.comissaoRecebidaData || null,
    pre_cadastro: !!i.preCadastro,
  };
}

export function fromDbImovel(r: DbImovelRow): Imovel {
  return {
    id: r.id,
    codigo: r.codigo || "",
    referenciaCrm: r.referencia_crm || "",
    cep: r.cep || "",
    endereco: r.endereco,
    bairro: r.bairro || "",
    cidade: r.cidade || "",
    unidade: r.unidade || "",
    bloco: r.bloco || "",
    edificio: r.edificio || "",
    tipo: r.tipo || "",
    quartos: r.quartos,
    banheiros: r.banheiros,
    vagas: r.vagas,
    valorAluguel: Number(r.valor_aluguel) || 0,
    valorCondominio: Number(r.valor_condominio) || 0,
    proprietarioNome: r.proprietario_nome || "",
    proprietarioTelefone: r.proprietario_telefone || "",
    formaAbordagem: r.forma_abordagem || "",
    // Normaliza rótulos de origem renomeados (ex.: "Site da imobiliária").
    origemImovel: (r.origem_imovel && ORIGENS_LEGADAS[r.origem_imovel]) || r.origem_imovel || "",
    // Nome da imobiliária em cuja vitrine/site a oportunidade foi garimpada —
    // é a FONTE da angariação, não um rival disputando o proprietário. O nome
    // da coluna (imobiliaria_concorrente) foi mantido para evitar migração de
    // schema; a semântica atual é "fonte de garimpo".
    imobiliariaConcorrente: r.imobiliaria_concorrente || "",
    latitude: r.latitude,
    longitude: r.longitude,
    dataAngariacao: r.data_angariacao,
    responsavel: r.responsavel || "",
    status: r.status,
    observacoes: r.observacoes || "",
    statusHistory: r.status_history || [],
    notas: r.notas || [],
    tentativas: r.tentativas || [],
    pausadoAte: r.pausado_ate,
    motivoPerda: r.motivo_perda || "",
    motivoPerdaOutro: r.motivo_perda_outro || "",
    comissaoRecebida: !!r.comissao_recebida,
    comissaoRecebidaValor: r.comissao_recebida_valor as number | null,
    comissaoRecebidaData: r.comissao_recebida_data,
    preCadastro: !!r.pre_cadastro,
  };
}

export function toDbAbordagem(a: Abordagem, userId: string): Omit<DbAbordagemRow, "created_at"> {
  return {
    id: a.id,
    user_id: userId,
    nome: a.nome,
    roteiro: a.roteiro || null,
    canal_sugerido: a.canalSugerido || null,
    arquivada: !!a.arquivada,
  };
}

export function fromDbAbordagem(r: DbAbordagemRow): Abordagem {
  return {
    id: r.id,
    nome: r.nome,
    roteiro: r.roteiro || "",
    canalSugerido: r.canal_sugerido || "",
    arquivada: !!r.arquivada,
  };
}

export function toDbAgenda(a: AgendaItem, userId: string): Omit<DbAgendaRow, "created_at"> {
  return {
    id: a.id,
    user_id: userId,
    title: a.title,
    type: a.type,
    date: a.date,
    hora: a.hora || null,
    imovel_id: a.imovelId || null,
    notes: a.notes || null,
    done: !!a.done,
    is_verificacao_disponibilidade: !!a.isVerificacaoDisponibilidade,
  };
}

export function fromDbAgenda(r: DbAgendaRow): AgendaItem {
  return { id: r.id, title: r.title, type: r.type, date: r.date, hora: r.hora ?? null, imovelId: r.imovel_id, notes: r.notes || "", done: !!r.done, isVerificacaoDisponibilidade: !!r.is_verificacao_disponibilidade };
}
