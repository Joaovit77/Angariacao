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
import { FINALIDADES_IMOVEL, MOTIVOS_RETIRADA, ORIGENS_LEGADAS, type FinalidadeImovel, type MotivoRetirada } from "../constantes";
import type { Abordagem, AgendaItem, AnuncioCentralVisualizado, Imovel, NotaImovel, Protocolo, StatusHistoryEntry, Tentativa } from "../tipos";
import { ehTipoProtocolo, tipoProtocoloOuPadrao, type TipoProtocolo } from "../protocolos";
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
  /** Opcionais: só a retirada os escreve, e o `toDbImovel` nunca os manda
      (o upsert do cadastro apagaria a data e o motivo). Ausentes numa linha
      anterior à migration 20261002210000. */
  retirado_em?: string | null;
  retirado_motivo?: string | null;
  retirado_observacao?: string | null;
  /** Opcionais: ausentes numa linha anterior à migration 20261006200215, num
      select parcial ou num payload parcial do Realtime. O `toDbImovel` manda
      `finalidade` e `valor_venda` só quando o imóvel traz o campo (IV-2), e
      `vendido_em` nunca: quem o grava é a ação própria de Vendido (IV-5). */
  finalidade?: string | null;
  valor_venda?: number | string | null;
  vendido_em?: string | null;
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
  origin?: "usuario" | "assistente" | "automacao" | "evento_whatsapp" | null;
  reason_code?: string | null;
  source_action_id?: string | null;
  completed_at?: string | null;
  completion_reason?: string | null;
  completion_origin?: "usuario" | "assistente" | "automacao" | "evento_whatsapp" | null;
  created_at?: string;
  updated_at?: string;
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

/** Linha da tabela `protocolos` (informações comerciais e regras de conduta). */
export interface DbProtocoloRow {
  id: string;
  user_id: string;
  tipo?: TipoProtocolo | string | null;
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
  perfil_comunicacao?: unknown;
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
    // `finalidade` e `valor_venda` (IV-2) só quando o imóvel traz o campo. O
    // upsert grava apenas as colunas listadas aqui: campo ausente (ou
    // `undefined`) fica fora, e o banco mantém o que tem. Presente, vai como
    // está, inclusive null (o usuário limpou) e 0 (valor de verdade). Nenhum
    // default: um `locacao` inventado classificaria a carteira, e `|| 0`
    // apagaria a diferença entre "não informado" e zero.
    ...(i.finalidade !== undefined ? { finalidade: i.finalidade } : {}),
    ...(i.valorVenda !== undefined ? { valor_venda: i.valorVenda } : {}),
    // `vendido_em` nunca entra aqui: quem o grava é a ação própria de Vendido
    // (IV-5). Os dados da retirada também não: só a retirada os escreve.
  };
}

/** O motivo gravado, se for um dos conhecidos. O banco já recusa outro
    valor; a guarda é para não confiar num texto cru vindo da rede. */
function motivoRetiradaDoBanco(valor: string | null | undefined): MotivoRetirada | null {
  return MOTIVOS_RETIRADA.find((m) => m.id === valor)?.id ?? null;
}

/** A finalidade gravada, se for uma das conhecidas; senão `null` (não
    informado), nunca "locacao". Quem garante o valor é o check do banco; esta
    guarda só não confia num texto cru da rede, e não derruba a carteira inteira
    por uma linha. */
function finalidadeDoBanco(valor: string | null | undefined): FinalidadeImovel | null {
  return FINALIDADES_IMOVEL.find((f) => f === valor) ?? null;
}

/** `null` continua `null` ("não informado" não é zero); número que não seja
    finito também vira `null`, nunca um valor inventado. */
function valorVendaDoBanco(valor: number | string | null | undefined): number | null {
  if (valor === null || valor === undefined || valor === "") return null;
  const numero = Number(valor);
  return Number.isFinite(numero) ? numero : null;
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
    retiradoEm: r.retirado_em || null,
    retiradoMotivo: motivoRetiradaDoBanco(r.retirado_motivo),
    retiradoObservacao: r.retirado_observacao || null,
    // Só cria a chave quando a coluna veio na linha, como `estado`: o
    // `toDbImovel` grava `finalidade` e `valor_venda` sempre que o imóvel traz
    // o campo, então uma linha parcial (ou anterior à migration) que virasse
    // null aqui apagaria o valor real no próximo save.
    ...("finalidade" in r ? { finalidade: finalidadeDoBanco(r.finalidade) } : {}),
    ...("valor_venda" in r ? { valorVenda: valorVendaDoBanco(r.valor_venda) } : {}),
    vendidoEm: r.vendido_em || null,
    // null, nunca "": o resto do app testa este campo por verdade/falsidade
    // para decidir se o imóvel é uma unidade desdobrada.
    imovelPrincipalId: r.imovel_principal_id || null,
  };
}

/** Campos do imóvel que o `toDbImovel` não grava sempre: `finalidade` e
    `valor_venda` só quando o imóvel traz o campo (`gravavel`); `vendido_em` e
    os dados da retirada nunca. Quem conhece só parte do imóvel (um payload
    parcial do Realtime, um chamador do `salvarImovel` que não monta o campo)
    precisa manter o valor anterior deles, porque nem a linha de escrita nem o
    upsert os trazem de volta. Sem isso a memória ficaria com null, e o
    próximo save gravaria esse null no banco. */
export const CAMPOS_IMOVEL_SEM_ESCRITA_GARANTIDA = [
  { coluna: "finalidade", campo: "finalidade", gravavel: true },
  { coluna: "valor_venda", campo: "valorVenda", gravavel: true },
  { coluna: "vendido_em", campo: "vendidoEm", gravavel: false },
  { coluna: "retirado_em", campo: "retiradoEm", gravavel: false },
  { coluna: "retirado_motivo", campo: "retiradoMotivo", gravavel: false },
  { coluna: "retirado_observacao", campo: "retiradoObservacao", gravavel: false },
] as const satisfies readonly { coluna: keyof DbImovelRow; campo: keyof Imovel; gravavel: boolean }[];

export type CampoImovelSemEscritaGarantida = (typeof CAMPOS_IMOVEL_SEM_ESCRITA_GARANTIDA)[number];

/** `destino` com o valor de `anterior` em cada campo de
    `CAMPOS_IMOVEL_SEM_ESCRITA_GARANTIDA` que não `veio`; os que vieram ficam
    como estão, inclusive null. Campo que o anterior também não tinha fica
    ausente, nunca null inventado. Não grava nada. */
export function preservarCamposSemEscritaGarantida(
  destino: Imovel,
  anterior: Imovel,
  veio: (campo: CampoImovelSemEscritaGarantida) => boolean,
): Imovel {
  const saida: Record<string, unknown> = { ...destino };
  for (const c of CAMPOS_IMOVEL_SEM_ESCRITA_GARANTIDA) {
    if (veio(c)) continue;
    if (anterior[c.campo] === undefined) delete saida[c.campo];
    else saida[c.campo] = anterior[c.campo];
  }
  return saida as unknown as Imovel;
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
  if (!ehTipoProtocolo(p.tipo)) throw new Error("Tipo de protocolo inválido.");
  return {
    id: p.id,
    user_id: userId,
    tipo: p.tipo,
    titulo: p.titulo.trim(),
    conteudo: p.conteudo.trim(),
    arquivado: !!p.arquivado,
  };
}

export function fromDbProtocolo(r: DbProtocoloRow): Protocolo {
  return {
    id: r.id,
    tipo: tipoProtocoloOuPadrao(r.tipo),
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
  return {
    id: r.id,
    title: r.title,
    type: r.type,
    date: r.date,
    hora: r.hora ?? null,
    imovelId: r.imovel_id,
    notes: r.notes || "",
    done: !!r.done,
    isVerificacaoDisponibilidade: !!r.is_verificacao_disponibilidade,
    ...(r.origin ? { origem: r.origin } : {}),
    ...(r.reason_code ? { motivoCodigo: r.reason_code } : {}),
    ...(r.source_action_id ? { acaoOrigemId: r.source_action_id } : {}),
    ...(r.completed_at ? { concluidoEm: r.completed_at } : {}),
    ...(r.completion_reason ? { motivoConclusao: r.completion_reason } : {}),
    ...(r.completion_origin ? { origemConclusao: r.completion_origin } : {}),
  };
}
