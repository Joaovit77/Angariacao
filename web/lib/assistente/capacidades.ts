import {
  politicaDaAcaoAssistente,
  POLITICAS_CRITICAS_ASSISTENTE,
  type OperacaoCriticaAssistente,
  type TipoAcaoOperacionalAssistente,
} from "./politicas";
import type { TipoBlocoContextoAssistente } from "./contextoTipado";

export type CategoriaCapacidadeAssistente =
  | "consultar"
  | "organizar"
  | "registrar"
  | "alterar"
  | "automatico"
  | "indisponivel";

export type TipoCapacidadeAssistente = "consulta" | "acao" | "revisao" | "evento" | "limite";
export type ControleCapacidadeAssistente =
  | "Somente consulta"
  | "Executa diretamente"
  | "Pede confirmação"
  | "Abre para revisão"
  | "Automático"
  | "Ainda não disponível";

export type RequisitoCapacidadeAssistente = "protocolos_ativos" | "whatsapp_conectado";

interface BaseCapacidadeAssistente {
  id: string;
  nome: string;
  descricao: string;
  categoria: CategoriaCapacidadeAssistente;
  tipo: TipoCapacidadeAssistente;
  exemplos: readonly string[];
  limitacoes: readonly string[];
  ferramentas: readonly string[];
  termosDescoberta: readonly string[];
  requisito?: RequisitoCapacidadeAssistente;
  contextoNecessario?: readonly TipoBlocoContextoAssistente[];
  destaque?: boolean;
}

export type DefinicaoCapacidadeAssistente = BaseCapacidadeAssistente & (
  | { acao: TipoAcaoOperacionalAssistente; operacaoCritica?: never; controle?: never }
  | { operacaoCritica: OperacaoCriticaAssistente; acao?: never; controle?: never }
  | { controle: Exclude<ControleCapacidadeAssistente, "Executa diretamente" | "Pede confirmação" | "Automático">; acao?: never; operacaoCritica?: never }
);

export interface ContextoCapacidadesAssistente {
  podeUsarIa: boolean;
  protocolosAtivos?: boolean;
  whatsappConectado?: boolean;
}

export interface CapacidadeAssistente extends BaseCapacidadeAssistente {
  controle: ControleCapacidadeAssistente;
  disponivel: boolean;
  disponibilidade: "disponivel" | "condicional" | "indisponivel";
  observacaoDisponibilidade?: string;
  acao?: TipoAcaoOperacionalAssistente;
  operacaoCritica?: OperacaoCriticaAssistente;
}

export const ORDEM_CATEGORIAS_CAPACIDADES: readonly CategoriaCapacidadeAssistente[] = [
  "consultar",
  "organizar",
  "registrar",
  "alterar",
  "automatico",
  "indisponivel",
];

export const ROTULOS_CATEGORIAS_CAPACIDADES: Record<CategoriaCapacidadeAssistente, string> = {
  consultar: "Consultar",
  organizar: "Organizar",
  registrar: "Registrar",
  alterar: "Alterar",
  automatico: "Automático",
  indisponivel: "Ainda não disponível",
};

export const DESCRICOES_CATEGORIAS_CAPACIDADES: Record<CategoriaCapacidadeAssistente, string> = {
  consultar: "Veja informações atuais da sua operação sem alterar dados.",
  organizar: "Crie e reorganize tarefas com o controle adequado a cada ação.",
  registrar: "Mantenha o histórico de contatos e acompanhamentos atualizado.",
  alterar: "Faça somente as mudanças de estado liberadas e validadas pelo Angario.",
  automatico: "Entenda os comportamentos acionados por eventos reais da operação.",
  indisponivel: "Limites importantes para você saber o que não será executado.",
};

/**
 * Metadados de produto das operações reais do Assistente. A autonomia não é
 * repetida aqui: capacidades operacionais apontam para uma ação ou operação
 * crítica cuja política determinística continua sendo a fonte de segurança.
 */
export const CATALOGO_CAPACIDADES_ASSISTENTE: readonly DefinicaoCapacidadeAssistente[] = [
  {
    id: "consultar_carteira",
    nome: "Carteira e imóveis",
    descricao: "Consulta imóveis, quantidades, detalhes e marcos históricos da carteira.",
    categoria: "consultar",
    tipo: "consulta",
    controle: "Somente consulta",
    exemplos: ["Quantos imóveis estão em Novo contato?", "Mostre o histórico do LD-201."],
    limitacoes: ["Os dados atuais são sempre reconsultados na sua própria carteira."],
    ferramentas: ["buscar_imoveis", "contar_imoveis", "consultar_imovel", "consultar_entidade_atual", "buscar_marcos_imoveis"],
    termosDescoberta: ["consultar imóvel", "ver imóvel", "carteira", "histórico do imóvel", "última movimentação", "movimentação do imóvel", "imóvel está parado", "dias sem movimento", "há quantos dias não tem movimento", "sem movimento", "último publicado", "última publicação", "última angariação", "último locado"],
    contextoNecessario: ["imovel", "pipeline"],
    destaque: true,
  },
  {
    id: "consultar_agenda",
    nome: "Agenda",
    descricao: "Consulta compromissos por período e situação.",
    categoria: "consultar",
    tipo: "consulta",
    controle: "Somente consulta",
    exemplos: ["Quais são os compromissos de hoje?"],
    limitacoes: ["Compromissos e mensagens programadas são consultados separadamente."],
    ferramentas: ["buscar_agenda"],
    termosDescoberta: ["consultar agenda", "ver agenda", "compromissos", "próximo compromisso", "agenda de hoje"],
    contextoNecessario: ["agenda"],
    destaque: true,
  },
  {
    id: "consultar_followups",
    nome: "Follow-ups",
    descricao: "Mostra acompanhamentos da carteira ou de um imóvel específico.",
    categoria: "consultar",
    tipo: "consulta",
    controle: "Somente consulta",
    exemplos: ["Quem precisa de follow-up hoje?"],
    limitacoes: ["Uma referência ambígua exige que você indique o imóvel."],
    ferramentas: ["buscar_followups"],
    termosDescoberta: ["consultar follow-up", "ver follow-up", "quem precisa de follow-up"],
    contextoNecessario: ["imovel", "agenda", "pipeline"],
    destaque: true,
  },
  {
    id: "consultar_operacao",
    nome: "Operação e prioridades",
    descricao: "Consulta foco do dia, imóveis estagnados e indicadores atuais.",
    categoria: "consultar",
    tipo: "consulta",
    controle: "Somente consulta",
    exemplos: ["O que precisa de atenção hoje?", "Qual imóvel está há mais tempo sem contato?"],
    limitacoes: ["Prioridades e métricas usam os mesmos cálculos das telas do Angario."],
    ferramentas: ["consultar_foco_do_dia", "buscar_estagnados", "obter_metricas", "contar_angariacoes"],
    termosDescoberta: ["foco do dia", "prioridades", "métricas", "operação"],
    contextoNecessario: ["pipeline", "agenda"],
    destaque: true,
  },
  {
    id: "consultar_mensagens",
    nome: "Mensagens e conversas",
    descricao: "Consulta mensagens programadas e identifica conversas respondidas.",
    categoria: "consultar",
    tipo: "consulta",
    controle: "Somente consulta",
    exemplos: ["Quais proprietários responderam e aguardam meu retorno?", "Qual é a próxima mensagem programada?"],
    limitacoes: ["Consultar uma conversa não envia nem responde mensagens."],
    ferramentas: ["consultar_mensagens_agendadas", "buscar_conversas_respondidas"],
    termosDescoberta: ["consultar mensagens", "ver mensagens", "quem respondeu", "conversas"],
    contextoNecessario: ["conversa", "mensagens"],
  },
  {
    id: "consultar_protocolos",
    nome: "Orientações da imobiliária",
    descricao: "Responde usando protocolos comerciais ativos e autorizados da sua conta.",
    categoria: "consultar",
    tipo: "consulta",
    controle: "Somente consulta",
    exemplos: ["Qual é a taxa de administração?"],
    limitacoes: ["Só responde quando houver um protocolo ativo pertinente; não inventa uma regra comercial."],
    ferramentas: ["consultar_protocolos_comerciais"],
    termosDescoberta: ["protocolo", "taxa de administração", "regra da imobiliária", "multa", "rescisão", "repasse", "exclusividade", "garantia locatícia"],
    contextoNecessario: ["protocolos"],
    requisito: "protocolos_ativos",
  },
  {
    id: "agendar_visita",
    nome: "Criar visita",
    descricao: "Prepara uma visita vinculada a um imóvel e a registra na Agenda após aprovação.",
    categoria: "organizar",
    tipo: "acao",
    acao: "agendar_visita",
    exemplos: ["Crie uma visita amanhã às 15h para o LD-201."],
    limitacoes: ["Imóvel, data e horário precisam estar definidos."],
    ferramentas: ["preparar_agendamento_visita"],
    termosDescoberta: ["agendar visita", "agende uma visita", "agende visita", "criar visita", "marcar visita"],
    contextoNecessario: ["imovel"],
    destaque: true,
  },
  {
    id: "criar_compromisso",
    nome: "Criar compromisso",
    descricao: "Prepara um compromisso geral para a Agenda.",
    categoria: "organizar",
    tipo: "acao",
    acao: "criar_compromisso",
    exemplos: ["Crie uma reunião de alinhamento sexta às 11h."],
    limitacoes: ["Título, tipo e data devem ser informados; o Assistente não inventa campos."],
    ferramentas: ["preparar_criacao_compromisso"],
    termosDescoberta: ["criar compromisso", "agendar compromisso", "marcar reunião"],
    contextoNecessario: [],
  },
  {
    id: "criar_followup",
    nome: "Criar follow-up",
    descricao: "Cria um acompanhamento interno para um imóvel na Agenda.",
    categoria: "organizar",
    tipo: "acao",
    acao: "criar_followup",
    exemplos: ["Crie um follow-up para o LD-201 na sexta."],
    limitacoes: ["É uma tarefa interna; nenhuma mensagem é enviada."],
    ferramentas: ["criar_followup"],
    termosDescoberta: ["criar follow-up", "novo follow-up", "criar acompanhamento"],
    contextoNecessario: ["imovel"],
    destaque: true,
  },
  {
    id: "reagendar_followup",
    nome: "Reagendar follow-up",
    descricao: "Move um acompanhamento pendente para outra data ou horário.",
    categoria: "organizar",
    tipo: "acao",
    acao: "reagendar_followup",
    exemplos: ["Reagende esse follow-up para sexta."],
    limitacoes: ["O acompanhamento precisa estar identificado sem ambiguidade."],
    ferramentas: ["reagendar_followup"],
    termosDescoberta: ["reagendar follow-up", "mover follow-up", "adiar follow-up"],
    contextoNecessario: ["imovel", "agenda"],
  },
  {
    id: "preparar_followups_lote",
    nome: "Preparar follow-ups em lote",
    descricao: "Abre o fluxo existente para revisar destinatários e textos do lote.",
    categoria: "organizar",
    tipo: "revisao",
    controle: "Abre para revisão",
    exemplos: ["Prepare os follow-ups de hoje em lote."],
    limitacoes: ["Abrir a revisão não envia nada; o envio depende da confirmação no fluxo próprio."],
    ferramentas: ["abrir_revisao_followup_lote"],
    termosDescoberta: ["follow-ups em lote", "lote de follow-up", "enviar follow-ups"],
    contextoNecessario: ["pipeline"],
  },
  {
    id: "preparar_rascunho_resposta",
    nome: "Preparar resposta",
    descricao: "Cria um rascunho editável com base em uma conversa real.",
    categoria: "organizar",
    tipo: "revisao",
    controle: "Abre para revisão",
    exemplos: ["Prepare uma resposta para a conversa do LD-201."],
    limitacoes: ["O rascunho nunca é enviado pelo Assistente e precisa de conversa textual suficiente."],
    ferramentas: ["preparar_rascunho_resposta"],
    termosDescoberta: ["preparar resposta", "criar rascunho", "responder proprietário"],
    contextoNecessario: ["imovel", "conversa", "protocolos"],
  },
  {
    id: "registrar_tentativa",
    nome: "Registrar tentativa de contato",
    descricao: "Registra no histórico um contato que você realmente realizou.",
    categoria: "registrar",
    tipo: "acao",
    acao: "registrar_tentativa",
    exemplos: ["Registre que tentei contato por WhatsApp e não respondeu."],
    limitacoes: ["Canal e resultado precisam vir do seu relato; intenção futura não conta como tentativa."],
    ferramentas: ["registrar_tentativa_contato"],
    termosDescoberta: ["registrar tentativa", "tentei contato", "anotar contato"],
    contextoNecessario: ["imovel"],
    destaque: true,
  },
  {
    id: "concluir_followup",
    nome: "Concluir follow-up",
    descricao: "Conclui um acompanhamento interno pendente e preserva seu histórico.",
    categoria: "registrar",
    tipo: "acao",
    acao: "concluir_followup",
    exemplos: ["Conclua esse follow-up."],
    limitacoes: ["O acompanhamento precisa estar identificado sem ambiguidade e não é excluído."],
    ferramentas: ["concluir_followup"],
    termosDescoberta: ["concluir follow-up", "finalizar follow-up", "concluir acompanhamento"],
    contextoNecessario: ["imovel", "agenda"],
  },
  {
    id: "alterar_status_sem_resposta_em_lote",
    nome: "Mudar para Sem resposta",
    descricao: "Prepara a mudança dos imóveis elegíveis de Novo contato para Sem resposta.",
    categoria: "alterar",
    tipo: "acao",
    acao: "alterar_status_sem_resposta_em_lote",
    exemplos: ["Coloque como Sem resposta quem chegou a três tentativas sem retorno."],
    limitacoes: ["Só inclui imóveis em Novo contato, com ao menos três tentativas e nenhuma resposta observada."],
    ferramentas: ["preparar_alteracao_status_sem_resposta"],
    termosDescoberta: ["mudar para sem resposta", "colocar como sem resposta", "alterar status para sem resposta"],
    contextoNecessario: ["pipeline"],
    destaque: true,
  },
  {
    id: "concluir_followups_por_resposta",
    nome: "Concluir acompanhamento após resposta",
    descricao: "Conclui o follow-up interno que aguardava resposta quando o proprietário responde de verdade.",
    categoria: "automatico",
    tipo: "evento",
    acao: "concluir_followups_por_resposta",
    exemplos: [],
    limitacoes: ["Só alcança follow-ups pendentes criados pelo Assistente ou automação com motivo aguardando resposta."],
    ferramentas: [],
    termosDescoberta: ["concluir automaticamente", "quando o proprietário responder", "follow-up automático"],
    contextoNecessario: ["conversa", "agenda"],
    requisito: "whatsapp_conectado",
  },
  {
    id: "consultar_mercado",
    nome: "Leitura de mercado",
    descricao: "O Assistente ainda não possui uma leitura integrada do mercado imobiliário.",
    categoria: "indisponivel",
    tipo: "limite",
    controle: "Ainda não disponível",
    exemplos: [],
    limitacoes: ["Dados operacionais do imóvel não substituem oferta regional, comparáveis, preços concorrentes ou liquidez de mercado."],
    ferramentas: [],
    termosDescoberta: ["mercado", "oferta parecida", "oferta semelhante", "preços dos concorrentes", "preço dos concorrentes", "imóveis comparáveis", "anúncios semelhantes", "liquidez de mercado"],
    contextoNecessario: [],
  },
  {
    id: "enviar_mensagem_externa",
    nome: "Enviar mensagem sozinho",
    descricao: "O Assistente não envia mensagens externas por conta própria.",
    categoria: "indisponivel",
    tipo: "limite",
    operacaoCritica: "enviar_mensagem_externa",
    exemplos: [],
    limitacoes: ["Ele pode consultar conversas e preparar um rascunho para sua revisão."],
    ferramentas: [],
    termosDescoberta: ["mandar mensagem sozinho", "enviar mensagem sozinho", "responder automaticamente", "enviar whatsapp"],
    contextoNecessario: [],
  },
  {
    id: "excluir_imovel",
    nome: "Excluir imóvel",
    descricao: "O Assistente não exclui imóveis da carteira.",
    categoria: "indisponivel",
    tipo: "limite",
    operacaoCritica: "excluir_imovel",
    exemplos: [],
    limitacoes: [],
    ferramentas: [],
    termosDescoberta: ["excluir imóvel", "apagar imóvel", "remover imóvel"],
    contextoNecessario: [],
  },
  {
    id: "editar_dado_sensivel",
    nome: "Editar dados sensíveis",
    descricao: "O Assistente não altera dados sensíveis de imóveis ou proprietários.",
    categoria: "indisponivel",
    tipo: "limite",
    operacaoCritica: "editar_dado_sensivel",
    exemplos: [],
    limitacoes: [],
    ferramentas: [],
    termosDescoberta: ["editar dado sensível", "alterar telefone", "alterar dados do proprietário"],
    contextoNecessario: [],
  },
  {
    id: "alterar_status_arbitrario",
    nome: "Mudar qualquer status",
    descricao: "O Assistente não faz mudanças livres de status.",
    categoria: "indisponivel",
    tipo: "limite",
    operacaoCritica: "alterar_status_arbitrario",
    exemplos: [],
    limitacoes: ["A única mudança disponível é a passagem elegível e confirmada para Sem resposta."],
    ferramentas: [],
    termosDescoberta: ["mudar qualquer status", "alterar status", "colocar como angariado", "colocar como publicado"],
    contextoNecessario: [],
  },
] as const;

function controleDaDefinicao(definicao: DefinicaoCapacidadeAssistente): ControleCapacidadeAssistente {
  if ("acao" in definicao && definicao.acao) {
    const modo = politicaDaAcaoAssistente(definicao.acao).modo;
    if (definicao.tipo === "evento") return modo === "automatico" ? "Automático" : modo === "confirmacao" ? "Pede confirmação" : "Ainda não disponível";
    return modo === "automatico" ? "Executa diretamente" : modo === "confirmacao" ? "Pede confirmação" : "Ainda não disponível";
  }
  if ("operacaoCritica" in definicao && definicao.operacaoCritica) {
    if (POLITICAS_CRITICAS_ASSISTENTE[definicao.operacaoCritica].modo !== "bloqueado") {
      throw new Error(`A operação ${definicao.operacaoCritica} continua sem ferramenta e não pode ser apresentada como disponível.`);
    }
    return "Ainda não disponível";
  }
  return definicao.controle;
}

function avaliarRequisito(
  requisito: RequisitoCapacidadeAssistente | undefined,
  contexto: ContextoCapacidadesAssistente,
): Pick<CapacidadeAssistente, "disponivel" | "disponibilidade" | "observacaoDisponibilidade"> {
  if (!contexto.podeUsarIa) {
    return { disponivel: false, disponibilidade: "indisponivel", observacaoDisponibilidade: "Sua conta não tem acesso ao Assistente." };
  }
  if (requisito === "protocolos_ativos" && contexto.protocolosAtivos === false) {
    return { disponivel: false, disponibilidade: "indisponivel", observacaoDisponibilidade: "Nenhum protocolo comercial ativo está configurado." };
  }
  if (requisito === "protocolos_ativos" && contexto.protocolosAtivos == null) {
    return { disponivel: true, disponibilidade: "condicional", observacaoDisponibilidade: "Disponível quando houver um protocolo ativo para o assunto." };
  }
  if (requisito === "whatsapp_conectado" && contexto.whatsappConectado === false) {
    return { disponivel: false, disponibilidade: "indisponivel", observacaoDisponibilidade: "Requer o canal de WhatsApp conectado." };
  }
  if (requisito === "whatsapp_conectado" && contexto.whatsappConectado == null) {
    return { disponivel: true, disponibilidade: "condicional", observacaoDisponibilidade: "Ocorre quando o WhatsApp integrado está conectado." };
  }
  return { disponivel: true, disponibilidade: "disponivel" };
}

export function montarManualCapacidades(
  contexto: ContextoCapacidadesAssistente,
  definicoes: readonly DefinicaoCapacidadeAssistente[] = CATALOGO_CAPACIDADES_ASSISTENTE,
): CapacidadeAssistente[] {
  return definicoes.map((definicao) => {
    const controle = controleDaDefinicao(definicao);
    const disponibilidade = controle === "Ainda não disponível"
      ? { disponivel: false, disponibilidade: "indisponivel" as const }
      : avaliarRequisito(definicao.requisito, contexto);
    return { ...definicao, controle, ...disponibilidade };
  });
}

export function agruparCapacidades(
  capacidades: readonly CapacidadeAssistente[],
): Array<{ categoria: CategoriaCapacidadeAssistente; rotulo: string; capacidades: CapacidadeAssistente[] }> {
  return ORDEM_CATEGORIAS_CAPACIDADES
    .map((categoria) => ({
      categoria,
      rotulo: ROTULOS_CATEGORIAS_CAPACIDADES[categoria],
      capacidades: capacidades.filter((capacidade) => capacidade.categoria === categoria),
    }))
    .filter((grupo) => grupo.capacidades.length > 0);
}

function normalizarDescoberta(texto: string): string {
  return texto.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

function capacidadeMencionada(pergunta: string, capacidades: readonly CapacidadeAssistente[]): CapacidadeAssistente | null {
  const normalizada = normalizarDescoberta(pergunta);
  return capacidades.find((capacidade) => capacidade.termosDescoberta.some((termo) => {
    const termoNormalizado = normalizarDescoberta(termo);
    if (normalizada.includes(termoNormalizado)) return true;
    const palavras = termoNormalizado.split(" ").filter((palavra) => palavra.length > 2);
    return palavras.length > 0 && palavras.every((palavra) => normalizada.includes(palavra));
  })) || null;
}

export function respostaSobreCapacidades(
  pergunta: string,
  contexto: ContextoCapacidadesAssistente,
  definicoes: readonly DefinicaoCapacidadeAssistente[] = CATALOGO_CAPACIDADES_ASSISTENTE,
): string | null {
  const normalizada = normalizarDescoberta(pergunta);
  const perguntaDeCapacidade = /\b(voce consegue|voce pode|e possivel|da para)\b/.test(normalizada);
  const pedidoGeral = /\b(o que voce consegue fazer|o que voce pode fazer|o que posso pedir|nao sei o que pedir|como voce pode me ajudar|quais (sao )?suas capacidades)\b/.test(normalizada);
  if (!perguntaDeCapacidade && !pedidoGeral) return null;

  const capacidades = montarManualCapacidades(contexto, definicoes);
  if (pedidoGeral) {
    const disponiveis = capacidades.filter((capacidade) => capacidade.disponivel && capacidade.categoria !== "indisponivel");
    if (!disponiveis.length) return "As capacidades do Assistente não estão disponíveis para esta conta no momento.";
    const destaques = disponiveis.filter((capacidade) => capacidade.destaque);
    const nomes = (destaques.length ? destaques : disponiveis).slice(0, 6).map((capacidade) => capacidade.nome.toLocaleLowerCase("pt-BR"));
    const exemplo = (destaques.length ? destaques : disponiveis).flatMap((capacidade) => capacidade.exemplos)[0];
    return `Posso ajudar com ${nomes.join(", ")}. Cada ação segue o controle mostrado no manual: algumas executam diretamente e outras pedem confirmação.${exemplo ? ` Experimente pedir: “${exemplo}”` : ""} Abra “O que posso fazer?” para ver todas as opções e limitações.`;
  }

  const capacidade = capacidadeMencionada(pergunta, capacidades);
  if (!capacidade) return null;
  if (!capacidade.disponivel) {
    return `${capacidade.descricao} ${capacidade.limitacoes[0] || capacidade.observacaoDisponibilidade || "Essa operação não está disponível."}`.trim();
  }
  const exemplo = capacidade.exemplos[0];
  return `Sim. ${capacidade.descricao} Controle: ${capacidade.controle}.${capacidade.observacaoDisponibilidade ? ` ${capacidade.observacaoDisponibilidade}` : ""}${exemplo ? ` Exemplo: “${exemplo}”` : ""}`;
}

export function catalogoCapacidadesParaModelo(contexto: ContextoCapacidadesAssistente): string {
  return JSON.stringify(montarManualCapacidades(contexto).map((capacidade) => ({
    id: capacidade.id,
    nome: capacidade.nome,
    disponivel: capacidade.disponivel,
    controle: capacidade.controle,
    ferramentas: capacidade.ferramentas,
    contextoNecessario: capacidade.contextoNecessario || [],
  })));
}

/** Responde pedidos diretos que pertencem a um limite conhecido sem entregar
 * ferramentas de outro domínio ao modelo. O texto vem do catálogo, não de uma
 * frase especial por intenção. */
export function respostaParaLimiteAssistente(
  pergunta: string,
  contexto: ContextoCapacidadesAssistente,
  definicoes: readonly DefinicaoCapacidadeAssistente[] = CATALOGO_CAPACIDADES_ASSISTENTE,
): { capacidadeId: string; texto: string } | null {
  const limites = montarManualCapacidades(contexto, definicoes)
    .filter((capacidade) => capacidade.tipo === "limite" && !capacidade.disponivel);
  const capacidade = capacidadeMencionada(pergunta, limites);
  if (!capacidade) return null;
  return {
    capacidadeId: capacidade.id,
    texto: `${capacidade.descricao} ${capacidade.limitacoes[0] || capacidade.observacaoDisponibilidade || "Essa operação não está disponível."}`.trim(),
  };
}
