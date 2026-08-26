import { STATUS_TERMINAL_NEGATIVE } from "../constantes";
import { fmtMoneyFull } from "../formatadores";
import type { Imovel, NotaImovel } from "../tipos";
import { semAcento } from "./filtros";
import {
  corpoDaMensagemEnviada,
  corpoDaResposta,
  ehNotaDeMensagemEnviada,
  ehNotaRecebidaNaConversa,
  ehSoMidia,
  ehTipoDeReacaoWhatsapp,
} from "./notas";
import { caixaDeRespostas } from "./respostas";

export type DirecaoMensagemConversa = "recebida" | "enviada";
export type FiltroPrincipalConversas = "todas" | "em-andamento" | "nao-respondidas";

export interface FiltrosConversas {
  principal: FiltroPrincipalConversas;
  naoLidas: boolean;
  agendadas: boolean;
}

export interface MensagemConversa {
  id: string;
  texto: string;
  data: string;
  dia: string;
  direcao: DirecaoMensagemConversa;
  tipo: string;
  soMidia: boolean;
  importada: boolean;
}

export interface ConversaImovel {
  imovel: Imovel;
  mensagens: MensagemConversa[];
  ultima: MensagemConversa;
  naoLidas: number;
  emAndamento: boolean;
  naoRespondida: boolean;
}

export interface ContagensConversas {
  todas: number;
  emAndamento: number;
  naoRespondidas: number;
  naoLidas: number;
  agendadas: number;
}

export interface ValorMonetarioContexto {
  texto: string;
  informado: boolean;
}

const TERMINAIS: readonly string[] = STATUS_TERMINAL_NEGATIVE;

/** Uma oportunidade continua operacional enquanto não foi retirada nem chegou
 * a uma etapa terminal. A lista canônica dos terminais permanece em
 * constantes.ts; este módulo apenas acrescenta o encerramento positivo. */
export function negociacaoAtiva(imovel: Imovel): boolean {
  return !imovel.retirado && imovel.status !== "Locado" && !TERMINAIS.includes(imovel.status);
}

/** Formatação exclusiva do contexto visual do imóvel. Zero continua intacto
 * no domínio e nos cálculos; apenas deixa de parecer um preço informado. */
export function valorMonetarioContexto(
  valor: number | null | undefined,
  rotuloAusente = "Valor não informado",
): ValorMonetarioContexto {
  if (valor == null || valor === 0) return { texto: rotuloAusente, informado: false };
  return { texto: fmtMoneyFull(valor), informado: true };
}

function mensagemDaNota(nota: NotaImovel): MensagemConversa | null {
  if (ehTipoDeReacaoWhatsapp(nota.tipo)) return null;
  const recebida = ehNotaRecebidaNaConversa(nota);
  const enviada = ehNotaDeMensagemEnviada(nota);
  if (!recebida && !enviada) return null;
  if ((nota.data || "").length < 10) return null;

  const direcao: DirecaoMensagemConversa = enviada ? "enviada" : "recebida";
  const texto = direcao === "enviada" ? corpoDaMensagemEnviada(nota.texto) : corpoDaResposta(nota.texto);
  return {
    id: nota.id,
    texto,
    data: nota.data,
    dia: nota.data.slice(0, 10),
    direcao,
    tipo: nota.tipo || "conversation",
    soMidia: ehSoMidia(texto),
    importada: nota.origem === "importacao-evolution",
  };
}

/** Histórico de WhatsApp que pode ser exibido ao usuário. Notas internas,
 * eventos automáticos e reações ficam fora porque não são novas falas. */
export function mensagensDaConversa(imovel: Imovel): MensagemConversa[] {
  const unicas = new Map<string, MensagemConversa>();
  for (const nota of imovel.notas || []) {
    const mensagem = mensagemDaNota(nota);
    if (mensagem) unicas.set(mensagem.id, mensagem);
  }
  return [...unicas.values()].sort((a, b) =>
    a.data < b.data ? -1 : a.data > b.data ? 1 : a.id.localeCompare(b.id),
  );
}

/** Uma conversa por imóvel, ordenada pela atividade mais recente. */
export function conversasDosImoveis(imoveis: Imovel[], hoje: string): ConversaImovel[] {
  const naoLidasPorImovel = new Map(
    caixaDeRespostas(imoveis, hoje).map((linha) => [linha.imovelId, linha.naoTratadas]),
  );

  return imoveis
    .map((imovel) => {
      const mensagens = mensagensDaConversa(imovel);
      if (mensagens.length === 0) return null;
      const ativa = negociacaoAtiva(imovel);
      const temRecebida = mensagens.some((mensagem) => mensagem.direcao === "recebida");
      const temEnviada = mensagens.some((mensagem) => mensagem.direcao === "enviada");
      return {
        imovel,
        mensagens,
        ultima: mensagens[mensagens.length - 1],
        naoLidas: naoLidasPorImovel.get(imovel.id) || 0,
        emAndamento: ativa && temRecebida,
        naoRespondida: ativa && temEnviada && !temRecebida,
      } satisfies ConversaImovel;
    })
    .filter((conversa): conversa is ConversaImovel => conversa !== null)
    .sort((a, b) =>
      a.ultima.data < b.ultima.data
        ? 1
        : a.ultima.data > b.ultima.data
          ? -1
          : a.imovel.id.localeCompare(b.imovel.id),
    );
}

function normalizarBusca(texto: string): string {
  return semAcento(texto).toLocaleLowerCase("pt-BR");
}

function atendeBusca(conversa: ConversaImovel, busca: string): boolean {
  const termo = normalizarBusca(busca.trim());
  if (!termo) return true;
  const { imovel } = conversa;
  const conteudo = [
    imovel.proprietarioNome,
    imovel.proprietarioTelefone,
    imovel.codigo,
    imovel.referenciaCrm,
    imovel.endereco,
    imovel.edificio,
    imovel.bairro,
    imovel.cidade,
    imovel.responsavel,
    ...conversa.mensagens.map((mensagem) => mensagem.texto),
  ]
    .filter(Boolean)
    .join(" ");
  return normalizarBusca(conteudo).includes(termo);
}

function atendePrincipal(conversa: ConversaImovel, filtro: FiltroPrincipalConversas): boolean {
  if (filtro === "em-andamento") return conversa.emAndamento;
  if (filtro === "nao-respondidas") return conversa.naoRespondida;
  return true;
}

function atendeSecundarios(
  conversa: ConversaImovel,
  filtros: Pick<FiltrosConversas, "naoLidas" | "agendadas">,
  imoveisComAgendamento: ReadonlySet<string>,
): boolean {
  if (filtros.naoLidas && conversa.naoLidas === 0) return false;
  if (filtros.agendadas && !imoveisComAgendamento.has(conversa.imovel.id)) return false;
  return true;
}

export function filtrarConversas(
  conversas: ConversaImovel[],
  busca: string,
  filtros: FiltrosConversas,
  imoveisComAgendamento: ReadonlySet<string> = new Set(),
): ConversaImovel[] {
  return conversas.filter(
    (conversa) =>
      atendeBusca(conversa, busca) &&
      atendePrincipal(conversa, filtros.principal) &&
      atendeSecundarios(conversa, filtros, imoveisComAgendamento),
  );
}

/** Contagens facetadas: cada número respeita busca e os outros filtros ativos,
 * mas ignora o próprio filtro para continuar útil como alternativa. */
export function contagensConversas(
  conversas: ConversaImovel[],
  busca: string,
  filtros: FiltrosConversas,
  imoveisComAgendamento: ReadonlySet<string> = new Set(),
): ContagensConversas {
  const buscadas = conversas.filter((conversa) => atendeBusca(conversa, busca));
  const paraPrincipal = buscadas.filter((conversa) =>
    atendeSecundarios(conversa, filtros, imoveisComAgendamento),
  );
  const paraNaoLidas = buscadas.filter(
    (conversa) =>
      atendePrincipal(conversa, filtros.principal) &&
      (!filtros.agendadas || imoveisComAgendamento.has(conversa.imovel.id)),
  );
  const paraAgendadas = buscadas.filter(
    (conversa) =>
      atendePrincipal(conversa, filtros.principal) &&
      (!filtros.naoLidas || conversa.naoLidas > 0),
  );

  return {
    todas: paraPrincipal.length,
    emAndamento: paraPrincipal.filter((conversa) => conversa.emAndamento).length,
    naoRespondidas: paraPrincipal.filter((conversa) => conversa.naoRespondida).length,
    naoLidas: paraNaoLidas.filter((conversa) => conversa.naoLidas > 0).length,
    agendadas: paraAgendadas.filter((conversa) => imoveisComAgendamento.has(conversa.imovel.id)).length,
  };
}
