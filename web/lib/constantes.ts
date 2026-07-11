/* ================================================================
   CONSTANTES DE NEGÓCIO
   Port literal da seção 1 do app.js original — valores e ordem
   idênticos (invariante §3.8 do MIGRATION_NEXT.md). A posição no
   array STATUS_FLOW define a ordem de progressão "normal" do funil;
   Perdido/Cancelado são saídas laterais.
   ================================================================ */

// Ordem oficial do funil.
export const STATUS_FLOW = [
  "Novo contato",
  "Visita agendada",
  "Em negociação",
  "Documentação",
  "Angariado",
  "Publicado",
  "Locado",
] as const;

export const STATUS_TERMINAL_NEGATIVE = ["Sem resposta", "Perdido", "Cancelado"] as const;

export const STATUS_ALL = [...STATUS_FLOW, ...STATUS_TERMINAL_NEGATIVE] as const;

export type StatusFunil = (typeof STATUS_FLOW)[number];
export type StatusTerminalNegativo = (typeof STATUS_TERMINAL_NEGATIVE)[number];
export type Status = (typeof STATUS_ALL)[number];

export const TIPOS_IMOVEL = [
  "Apartamento", "Casa", "Casa de Condomínio", "Kitnet/Studio",
  "Sobrado", "Sala Comercial", "Galpão", "Terreno", "Outro",
] as const;

// Como o contato com o proprietário foi feito
export const FORMAS_ABORDAGEM = [
  "Ligação telefônica", "WhatsApp", "Visita presencial", "Indicação",
  "Panfletagem", "E-mail", "Rede social", "Outro",
] as const;

// Valor de origem que representa o garimpo em sites de OUTRAS imobiliárias
// (a corretora acha o anúncio no site de uma concorrente e vai atrás do
// proprietário para angariar). Exportado para os insights referenciarem sem
// string mágica.
export const ORIGEM_GARIMPO_SITE = "Garimpo em site de imobiliária";

// Onde a oportunidade de angariação foi encontrada
export const ORIGENS_IMOVEL = [
  "Placa no imóvel", "Indicação de cliente", "Prospecção ativa (porta a porta)",
  "OLX / Canal Pro", "Redes sociais", ORIGEM_GARIMPO_SITE, "Ex-cliente", "Outro",
] as const;

// Rótulos de origem que já foram gravados no banco e hoje têm nome novo.
// O fromDbImovel normaliza para o valor atual, sem migração destrutiva —
// registros antigos passam a exibir/filtrar pelo texto novo, e são regravados
// já normalizados na próxima edição. "Site da imobiliária" dava a impressão de
// ser o site da PRÓPRIA imobiliária; na prática é o garimpo em sites alheios.
export const ORIGENS_LEGADAS: Record<string, string> = {
  "Site da imobiliária": ORIGEM_GARIMPO_SITE,
};

// Motivo específico quando o imóvel é marcado como Perdido ou Cancelado.
export const MOTIVOS_PERDA = [
  "Imóvel já vendido", "Imóvel já alugado por conta própria", "Proprietário desistiu de alugar",
  "Valor pedido incompatível com mercado", "Optou por outra imobiliária", "Perda de contato definitiva", "Outro",
] as const;

// Cores de identidade visual por status (kanban).
export const STATUS_COLORS: Record<string, string> = {
  "Novo contato": "#6fa8c9",
  "Visita agendada": "#9b8fd9",
  "Em negociação": "#e0b458",
  "Documentação": "#e0a35e",
  "Angariado": "#f0a868",
  "Publicado": "#7bd4b2",
  "Locado": "#5fb896",
  "Sem resposta": "#b0b0b0",
  "Perdido": "#e08f8f",
  "Cancelado": "#a3a3a3",
};

export const AGENDA_TYPES = ["Retorno ao proprietário", "Visita", "Pendência", "Documentação", "Follow-up"] as const;

// Quantos dias parado num mesmo status já é considerado "estagnado".
export const STALE_DAYS_THRESHOLD = 7;

// Dias após a angariação (sem locação) para gerar o lembrete automático
// de "verificar disponibilidade com o proprietário".
export const VERIFICACAO_DISPONIBILIDADE_DIAS = 60;
