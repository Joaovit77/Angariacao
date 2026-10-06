/* Textos pt-BR de Vendas num lugar só. Os componentes não mostram código técnico (estado,
   motivo, tipo de evento, código de erro): passam por aqui. */
import { FUSO_OPERACIONAL } from "@/lib/datas";
import { fmtDate, fmtMoneyFull } from "@/lib/formatadores";
import type { EventoPersistidoVenda } from "@/lib/persistencia/vendasComandos";
import type { CodigoErroLeituraVenda, ImovelExibicaoVenda } from "@/lib/persistencia/vendasLeitura";
import type { EstadoVenda, ImovelTratadoVenda, MotivoPerdaVenda, OrigemComercialVenda, ValoresVenda } from "@/lib/vendas/tipos";

export const ROTULOS_ESTADO_VENDA: Readonly<Record<EstadoVenda, string>> = {
  nova: "Nova",
  em_atendimento: "Em atendimento",
  em_negociacao: "Em negociação",
  ganha: "Ganha",
  perdida: "Perdida",
};

export const ROTULOS_ORIGEM_VENDA: Readonly<Record<OrigemComercialVenda["tipo"], string>> = {
  indicacao: "Indicação",
  portal: "Portal",
  whatsapp: "WhatsApp",
  telefone: "Telefone",
  formulario: "Formulário",
  atendimento_presencial: "Atendimento presencial",
  outro: "Outro",
};

export const ROTULOS_MOTIVO_PERDA_VENDA: Readonly<Record<MotivoPerdaVenda, string>> = {
  desistencia_interessado: "Desistência do interessado",
  condicoes_incompativeis: "Condições incompatíveis",
  imovel_indisponivel: "Imóvel indisponível",
  compra_outro_canal: "Comprou por outro canal",
  outro: "Outro",
};

export const ROTULOS_EVENTO_VENDA: Readonly<Record<EventoPersistidoVenda["tipo"], string>> = {
  oportunidade_criada: "Oportunidade criada",
  etapa_alterada: "Etapa alterada",
  imovel_alterado: "Imóvel alterado",
  valor_alterado: "Valores alterados",
  oportunidade_ganha: "Venda ganha",
  oportunidade_perdida: "Venda perdida",
  oportunidade_arquivada: "Oportunidade arquivada",
};

export const ROTULOS_VALOR_VENDA: Readonly<Record<keyof ValoresVenda, string>> = {
  valorNegocioPrevisto: "Valor do negócio previsto",
  receitaPrevista: "Receita prevista",
  valorNegocioFechado: "Valor do negócio fechado",
};

export const TEXTO_SEM_NOME_VENDA = "Contato sem nome";
export const TEXTO_SEM_IMOVEL_VENDA = "Sem imóvel";
export const TEXTO_NAO_INFORMADO_VENDA = "Não informado";

export const MENSAGENS_ERRO_LEITURA_VENDA: Readonly<Record<CodigoErroLeituraVenda, string>> = {
  "transporte-indisponivel": "Não foi possível conectar. Verifique a internet e tente novamente.",
  "nao-autenticado": "Sua sessão expirou. Entre de novo para ver as oportunidades.",
  "resposta-invalida": "Os dados recebidos não puderam ser exibidos com segurança.",
  "falha-interna": "Ocorreu um erro ao carregar. Tente novamente.",
};

export function rotuloInteressadoVenda(nome: string | null): string {
  return nome ?? TEXTO_SEM_NOME_VENDA;
}

/** Vazio é "Não informado"; zero continua sendo um valor e aparece como R$ 0,00. */
export function fmtValorVenda(valor: number | null): string {
  return valor === null ? TEXTO_NAO_INFORMADO_VENDA : fmtMoneyFull(valor);
}

/** Na lista: o valor fechado só existe na venda ganha; nas demais vale o previsto. */
export function valorPrincipalVenda(estado: EstadoVenda, valores: ValoresVenda): number | null {
  return estado === "ganha" && valores.valorNegocioFechado !== null ? valores.valorNegocioFechado : valores.valorNegocioPrevisto;
}

/** "06/10/2026 14:32" no fuso operacional, independente do fuso da máquina. */
export function fmtInstanteVenda(iso: string): string {
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return "";
  const partes = new Intl.DateTimeFormat("pt-BR", {
    timeZone: FUSO_OPERACIONAL, day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).formatToParts(data);
  const parte = (tipo: Intl.DateTimeFormatPartTypes) => partes.find((item) => item.type === tipo)?.value ?? "";
  return `${parte("day")}/${parte("month")}/${parte("year")} ${parte("hour")}:${parte("minute")}`;
}

export function fmtDataFatoVenda(data: string): string {
  return fmtDate(data);
}

function complemento(unidade: string | null, bloco: string | null): string {
  return [unidade && `unidade ${unidade}`, bloco && `bloco ${bloco}`].filter(Boolean).join(" · ");
}

/** Título curto do imóvel (lista e cabeçalho do bloco no detalhe). */
export function tituloImovelVenda(imovel: ImovelExibicaoVenda): string {
  if (imovel.tipo === "nenhum") return TEXTO_SEM_IMOVEL_VENDA;
  if (imovel.tipo === "referencia") return imovel.codigo ?? imovel.referencia ?? imovel.endereco ?? "Imóvel da carteira";
  return imovel.endereco ?? imovel.referencia ?? "Imóvel informado à mão";
}

/** Linha de apoio: o que o título não mostrou. */
export function detalheImovelVenda(imovel: ImovelExibicaoVenda): string {
  if (imovel.tipo === "nenhum") return "";
  const titulo = tituloImovelVenda(imovel);
  const partes = [imovel.endereco, imovel.referencia].filter((parte): parte is string => !!parte && parte !== titulo);
  const extra = complemento(imovel.unidade, imovel.bloco);
  if (extra) partes.push(extra);
  if (imovel.tipo === "manual" && imovel.descricaoCurta) partes.push(imovel.descricaoCurta);
  return partes.join(" · ");
}

export function origemImovelVenda(imovel: ImovelExibicaoVenda): string {
  if (imovel.tipo === "referencia") return imovel.naCarteira ? "Imóvel da carteira" : "Imóvel da carteira (não está mais na carteira)";
  if (imovel.tipo === "manual") return "Informado à mão";
  return "";
}

export function rotuloOrigemVenda(origem: OrigemComercialVenda | null): string {
  if (origem === null) return TEXTO_NAO_INFORMADO_VENDA;
  const descricao = origem.descricao?.trim();
  return descricao ? `${ROTULOS_ORIGEM_VENDA[origem.tipo]} · ${descricao}` : ROTULOS_ORIGEM_VENDA[origem.tipo];
}

/* Histórico: só rótulos e valores comerciais. Nada de id, chave, JSON ou dado do contato. */
function resumoImovelEvento(imovel: ImovelTratadoVenda | null): string {
  if (imovel === null) return TEXTO_SEM_IMOVEL_VENDA;
  if (imovel.modo === "referencia") return "imóvel da carteira";
  return imovel.endereco?.trim() || imovel.referencia?.trim() || "imóvel informado à mão";
}

function mudancasValores(anterior: ValoresVenda, atual: ValoresVenda): string {
  const campos: (keyof ValoresVenda)[] = ["valorNegocioPrevisto", "receitaPrevista"];
  return campos.filter((campo) => anterior[campo] !== atual[campo])
    .map((campo) => `${ROTULOS_VALOR_VENDA[campo]}: ${fmtValorVenda(anterior[campo])} → ${fmtValorVenda(atual[campo])}`)
    .join("; ");
}

export function detalheEventoVenda(evento: EventoPersistidoVenda): string {
  switch (evento.tipo) {
    case "oportunidade_criada": return `Etapa inicial: ${ROTULOS_ESTADO_VENDA.nova}`;
    case "etapa_alterada": return `${ROTULOS_ESTADO_VENDA[evento.dados.anterior]} → ${ROTULOS_ESTADO_VENDA[evento.dados.atual]}`;
    case "imovel_alterado": return `${resumoImovelEvento(evento.dados.anterior)} → ${resumoImovelEvento(evento.dados.atual)}`;
    case "valor_alterado": return mudancasValores(evento.dados.anterior, evento.dados.atual);
    case "oportunidade_ganha": return `Data do fato: ${fmtDataFatoVenda(evento.dados.encerramento.dataFato)}`;
    case "oportunidade_perdida": return `${ROTULOS_MOTIVO_PERDA_VENDA[evento.dados.encerramento.motivo]} · data do fato: ${fmtDataFatoVenda(evento.dados.encerramento.dataFato)}`;
    case "oportunidade_arquivada": return `Estava ${ROTULOS_ESTADO_VENDA[evento.dados.estado].toLowerCase()}`;
  }
}
