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
import type { Abordagem, AgendaItem, AnuncioCentralVisualizado, Imovel, NotaImovel, Protocolo, StatusHistoryEntry, Tentativa } from "../tipos";
import type { PortalAngariacao } from "../calculo/centralAngariacao";

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
  /** Opcional no tipo para os fixtures/linhas anteriores à migração. */
  estado?: string | null;
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
  anuncio_idade_dias: number | null;
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
  comissao_forma_pagamento: string | null;
  comissao_observacao: string | null;
  autorizacao_assinada_em: string | null;
  autorizacao_responsavel: string | null;
  locado_em: string | null;
  contrato_numero: string | null;
  pre_cadastro: boolean | null;
  importado: boolean | null;
  retirado: boolean | null;
  valor_aluguel_atraso: number | null;
  texto_anuncio: string | null;
  imovel_principal_id: string | null;
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
  origens: string[] | null;
  arquivada: boolean | null;
  created_at?: string;
}

/** Linha da tabela `protocolos` (as regras da imobiliária). */
export interface DbProtocoloRow {
  id: string;
  user_id: string;
  titulo: string;
  conteudo: string;
  arquivado: boolean | null;
  created_at?: string;
  updated_at?: string;
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
  dados_pagamento: string | null;
}

/** Linha do histórico de anúncios abertos na Central. */
export interface DbAnuncioCentralVisualizadoRow {
  user_id: string;
  portal: PortalAngariacao;
  id_externo: string;
  url: string;
  visualizado_em: string;
}

export function toDbAnuncioCentralVisualizado(
  anuncio: Pick<AnuncioCentralVisualizado, "portal" | "idExterno" | "url">,
  userId: string,
): Omit<DbAnuncioCentralVisualizadoRow, "visualizado_em"> {
  return {
    user_id: userId,
    portal: anuncio.portal,
    id_externo: anuncio.idExterno,
    url: anuncio.url,
  };
}

export function fromDbAnuncioCentralVisualizado(r: DbAnuncioCentralVisualizadoRow): AnuncioCentralVisualizado {
  return {
    portal: r.portal,
    idExterno: r.id_externo,
    url: r.url,
    visualizadoEm: r.visualizado_em,
  };
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
    // `in` distingue um chamador antigo, que desconhece a coluna, de um
    // formulário atual que apagou a UF e precisa gravar null de propósito.
    ...("estado" in i ? { estado: i.estado || null } : {}),
    unidade: i.unidade || null,
    bloco: i.bloco || null,
    edificio: i.edificio || null,
    tipo: i.tipo || null,
    quartos: i.quartos ?? null,
    banheiros: i.banheiros ?? null,
    vagas: i.vagas ?? null,
    valor_aluguel: i.valorAluguel || 0,
    valor_condominio: i.valorCondominio || 0,
    // `?? null` e não `|| null`: sem valor de atraso é ausência de dado, e o
    // 0 do `valor_aluguel` acima existe por herança do app antigo. Aqui um
    // zero significaria "cobra zero no atraso", que é diferente de "não sei".
    valor_aluguel_atraso: i.valorAluguelAtraso ?? null,
    // `|| null`: string vazia é ausência de texto colado, não um anúncio em
    // branco. Quem nunca passou pelo pré-cadastro simplesmente não tem este
    // dado, e é assim que o gerador sabe que precisa da caixa de colar.
    texto_anuncio: i.textoAnuncio || null,
    proprietario_nome: i.proprietarioNome || null,
    proprietario_telefone: i.proprietarioTelefone || null,
    forma_abordagem: i.formaAbordagem || null,
    origem_imovel: i.origemImovel || null,
    anuncio_idade_dias: i.anuncioIdadeDias ?? null,
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
    comissao_forma_pagamento: i.comissaoFormaPagamento || null,
    comissao_observacao: i.comissaoObservacao || null,
    autorizacao_assinada_em: i.autorizacaoAssinadaEm || null,
    autorizacao_responsavel: i.autorizacaoResponsavel || null,
    locado_em: i.locadoEm || null,
    contrato_numero: i.contratoNumero || null,
    pre_cadastro: !!i.preCadastro,
    importado: !!i.importado,
    retirado: !!i.retirado,
    // Vínculo de unidade desdobrada. `|| null` e não `?? null`: string vazia
    // aqui viraria uma FK inválida, e o Postgres recusaria a linha inteira.
    imovel_principal_id: i.imovelPrincipalId || null,
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
    ...("estado" in r ? { estado: r.estado || "" } : {}),
    unidade: r.unidade || "",
    bloco: r.bloco || "",
    edificio: r.edificio || "",
    tipo: r.tipo || "",
    quartos: r.quartos,
    banheiros: r.banheiros,
    vagas: r.vagas,
    valorAluguel: Number(r.valor_aluguel) || 0,
    valorCondominio: Number(r.valor_condominio) || 0,
    // Preserva o null: "não informado" e "zero" são coisas diferentes aqui.
    valorAluguelAtraso: r.valor_aluguel_atraso == null ? null : Number(r.valor_aluguel_atraso),
    textoAnuncio: r.texto_anuncio || null,
    proprietarioNome: r.proprietario_nome || "",
    proprietarioTelefone: r.proprietario_telefone || "",
    formaAbordagem: r.forma_abordagem || "",
    // Normaliza rótulos de origem renomeados (ex.: "Site da imobiliária").
    origemImovel: (r.origem_imovel && ORIGENS_LEGADAS[r.origem_imovel]) || r.origem_imovel || "",
    anuncioIdadeDias: r.anuncio_idade_dias ?? null,
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
    comissaoFormaPagamento: r.comissao_forma_pagamento || null,
    comissaoObservacao: r.comissao_observacao || null,
    autorizacaoAssinadaEm: r.autorizacao_assinada_em || null,
    autorizacaoResponsavel: r.autorizacao_responsavel || null,
    locadoEm: r.locado_em || null,
    contratoNumero: r.contrato_numero || null,
    preCadastro: !!r.pre_cadastro,
    importado: !!r.importado,
    retirado: !!r.retirado,
    // null, nunca "": o resto do app testa este campo por verdade/falsidade
    // para decidir se o imóvel é uma unidade desdobrada.
    imovelPrincipalId: r.imovel_principal_id || null,
  };
}

export function toDbAbordagem(a: Abordagem, userId: string): Omit<DbAbordagemRow, "created_at"> {
  return {
    id: a.id,
    user_id: userId,
    nome: a.nome,
    roteiro: a.roteiro || null,
    canal_sugerido: a.canalSugerido || null,
    // Só origem com texto: rótulo vazio na lista nunca casaria com imóvel
    // nenhum e ainda contaria como declaração, tornando o roteiro o padrão
    // de uma origem que não existe.
    origens: (a.origens || []).map((o) => o.trim()).filter(Boolean),
    arquivada: !!a.arquivada,
  };
}

export function fromDbAbordagem(r: DbAbordagemRow): Abordagem {
  return {
    id: r.id,
    nome: r.nome,
    roteiro: r.roteiro || "",
    canalSugerido: r.canal_sugerido || "",
    // Array sempre, nunca undefined: quem lê isto varre a lista para achar o
    // roteiro de uma origem, e um `undefined` no meio da varredura derrubaria
    // o agrupamento do lote inteiro.
    origens: Array.isArray(r.origens) ? r.origens : [],
    arquivada: !!r.arquivada,
  };
}

export function toDbProtocolo(p: Protocolo, userId: string): Omit<DbProtocoloRow, "created_at" | "updated_at"> {
  return {
    id: p.id,
    user_id: userId,
    titulo: p.titulo.trim(),
    conteudo: p.conteudo.trim(),
    arquivado: !!p.arquivado,
  };
}

export function fromDbProtocolo(r: DbProtocoloRow): Protocolo {
  return {
    id: r.id,
    titulo: r.titulo || "",
    conteudo: r.conteudo || "",
    arquivado: !!r.arquivado,
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
