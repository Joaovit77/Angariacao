/* ================================================================
   CONSTANTES DE NEGÓCIO
   Port literal da seção 1 do app.js original — valores e ordem
   idênticos (invariante §3.8 do MIGRATION_NEXT.md). A posição no
   array STATUS_FLOW define a ordem de progressão "normal" do funil;
   Perdido/Cancelado são saídas laterais.
   ================================================================ */

/**
 * A etapa em que o proprietário ASSINOU a Autorização de Locação.
 *
 * Tem constante própria pelo motivo do MOTIVO_PERDA_NUMERO_NAO_ENCONTRADO: são
 * vários módulos referenciando o mesmo rótulo (o funil, o balde do mapa, a
 * régua de estagnação, o alvo do lote de disponibilidade e a rota que recebe o
 * evento do Sistema Principal), e string mágica em cinco lugares diverge em
 * silêncio — aqui com o agravante de que o valor chega de FORA, escrito por
 * outro sistema.
 */
export const STATUS_AUTORIZACAO_ASSINADA = "Autorização assinada";

// Ordem oficial do funil.
export const STATUS_FLOW = [
  "Novo contato",
  "Visita agendada",
  "Em negociação",
  "Documentação",
  "Angariado",
  // "Autorização assinada" é a formalização da captação, e entrou junto com a
  // integração com o Sistema Principal (ver calculo/sistemaPrincipal.ts): lá é
  // que o proprietário assina a Autorização de Locação, e é esse evento que
  // move o imóvel para cá. Fica DEPOIS de "Angariado" porque aquele é o "sim"
  // falado e este é o "sim" assinado — a diferença que separa o proprietário
  // que concordou por telefone do contrato que a imobiliária pode cumprir.
  //
  // Medido antes de criar: na conta da supervisora, 101 de 101 imóveis
  // "Locado" e 42 de 42 "Publicado" têm `referencia_crm`, contra 3 de 497
  // "Angariado". A referência do CRM NASCE na assinatura — é ali que o imóvel
  // passa a existir no Sistema Principal —, e era justamente essa etapa que o
  // funil daqui não sabia nomear.
  STATUS_AUTORIZACAO_ASSINADA,
  "Publicado",
  "Locado",
] as const;

export const STATUS_TERMINAL_NEGATIVE = ["Sem resposta", "Perdido", "Cancelado"] as const;

/**
 * As saídas em que ALGUÉM DECIDIU: o proprietário disse não, ou o negócio caiu.
 *
 * Note o que fica de fora: "Sem resposta". Ele é terminal para o FUNIL (o
 * registro está fechado, e é isso que `isStale`, o termômetro, o mapa e o
 * desdobramento precisam saber), mas não é derrota decidida — é silêncio, e o
 * follow-up em lote trabalha exatamente esse público (`FOLLOWUP_STATUS_ALVO`).
 *
 * O app respondia duas perguntas diferentes com a mesma lista, e o preço
 * aparecia na conversão de captação: em 31/07/2026 ela dizia 13,7% porque 29
 * silêncios estavam no denominador como derrota. Sem eles, 19,7%. A mesma
 * incoerência tinha aparecido na seção "Onde perdemos" do relatório completo,
 * onde diluía "chegamos tarde" de 58% para 37%.
 *
 * Quem quer saber "está fechado?" usa {@link STATUS_TERMINAL_NEGATIVE}.
 * Quem quer saber "foi decidido?" usa `ehPerdaDecidida` no motor, que aplica
 * esta lista MAIS a regra da cadência esgotada (ver lá).
 */
export const STATUS_PERDA_DECIDIDA = ["Perdido", "Cancelado"] as const;

/**
 * Tentativas acumuladas que encerram a insistência do follow-up.
 *
 * Mora aqui, e não em `calculo/followup.ts`, porque tem DOIS donos: o lote usa
 * para parar de cutucar, e o motor usa para decidir que um silêncio virou
 * perda (`ehPerdaDecidida`). O motor não pode importar de `followup.ts` —
 * aquele já importa o motor, e o ciclo se fecharia. É o mesmo motivo pelo qual
 * `calculo/notas.ts` existe.
 */
export const MAX_TENTATIVAS_SEM_RETORNO = 4;

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

// Desfecho de uma tentativa de abordagem, em ordem crescente de engajamento
// do proprietário. A ordem importa: o ranking de abordagens usa a posição para
// separar "fez o proprietário responder" de "fez o proprietário avançar".
// "recusou" fica por último de propósito — é resposta (ele reagiu), mas
// negativa; por isso não é o mesmo que "sem resposta".
export const RESULTADOS_TENTATIVA = [
  { valor: "sem-resposta", rotulo: "Sem resposta", respondeu: false },
  { valor: "respondeu", rotulo: "Respondeu", respondeu: true },
  // "vai-retornar" é o meio-termo mais comum da captação — "vou pensar e te
  // dou um retorno". Sem ele, isso caía em "respondeu" junto com qualquer
  // outra reação, e o desfecho que PEDE follow-up ficava indistinguível do
  // que não pede. É categoria fixa de propósito: deixar a IA inventar um
  // rótulo por mensagem daria a cada um amostra 1, e o ranking inteiro viraria
  // uma lista de ocorrências únicas (ver MIN_TENTATIVAS).
  { valor: "vai-retornar", rotulo: "Vai retornar / vai pensar", respondeu: true },
  { valor: "agendou", rotulo: "Agendou visita/reunião", respondeu: true },
  { valor: "recusou", rotulo: "Recusou", respondeu: true },
  /* "Quem atendeu não é o dono, MAS sabe quem é" — parente, cônjuge, inquilino.
     Nasceu de um erro caro: esse caso estava dentro de "numero-errado", cuja
     descrição no prompt dizia "quem respondeu não é o proprietário". A IA
     seguia a especificação corretamente e o app respondia "desculpe o engano" a
     quem tinha acabado de entregar o caminho para o dono.

     Medido em 31/07/2026 — das 4 classificações que a IA fez como
     "numero-errado", METADE estava errada: o LD-55 ("Alexandre Marcos é meu PAI"
     e passou o telefone dele) e o LD-90 ("sou a esposa do Hércules, a casa é da
     Hernane Neves, que está na Inglaterra"). O LD-174 e o LD-172 eram engano de
     verdade — e o LD-172 é um aviso para quem for medir isto de novo: o resumo
     da IA dizia só "não entendeu a mensagem recebida", que lido de fora parece
     dúvida, mas o corretor, que viu a conversa, confirmou que era engano. O
     resumo não substitui a conversa.

     A própria IA já se contradizia: no LD-180, "o imóvel é da minha mãe" saiu
     como "respondeu", que é o rótulo certo pelo prompt antigo.

     Isto é RESPOSTA (respondeu: true) e fica DENTRO do ranking: o roteiro fez
     alguém do outro lado reagir e revelar o caminho, que é exatamente o que ele
     deveria fazer. Só não é o dono quem falou. */
  { valor: "outro-contato", rotulo: "Outra pessoa atendeu", respondeu: true },
  // "numero-errado" não é desfecho da conversa: a mensagem foi parar em quem não
  // tem nada a ver com o imóvel. Fica fora do ranking (ver
  // RESULTADOS_FORA_DO_RANKING) porque não diz nada sobre o roteiro — só sobre o
  // cadastro do telefone. NÃO use para quem conhece o imóvel ou o dono: isso é
  // "outro-contato", acima.
  { valor: "numero-errado", rotulo: "Número errado", respondeu: false },
] as const;

export type ResultadoTentativa = (typeof RESULTADOS_TENTATIVA)[number]["valor"];

/** Resultados que contam como "o proprietário reagiu" (taxa de resposta). */
export const RESULTADOS_COM_RESPOSTA: readonly ResultadoTentativa[] =
  RESULTADOS_TENTATIVA.filter((r) => r.respondeu).map((r) => r.valor);

/**
 * Resultados que a tentativa registra mas o ranking ignora por completo —
 * nem no numerador, nem no denominador.
 *
 * O roteiro não foi testado: ninguém do outro lado o leu. Contá-lo como
 * "tentativa sem resposta" faria uma abordagem boa parecer ruim toda vez que o
 * telefone estivesse errado no cadastro, que é um problema de dado, não de
 * texto. É a mesma lógica de `!t.abordagemId` — sem o que medir, fora.
 */
export const RESULTADOS_FORA_DO_RANKING: readonly ResultadoTentativa[] = ["numero-errado"];

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

/**
 * Todas as origens que o corretor tem para escolher: as fixas mais as que ele
 * criou em `user_config.origens_extras`.
 *
 * Existe para a declaração de origens da abordagem oferecer exatamente os
 * mesmos rótulos que o cadastro do imóvel grava. Declaração que não casa com o
 * valor gravado não agrupa nada no lote, e falha calada: nenhum erro, só um
 * texto genérico saindo para quem devia receber o específico.
 *
 * Os seletores do cadastro (ModalImovel, ModalPreCadastro) montam a lista por
 * conta própria porque precisam incluir também a origem JÁ gravada naquele
 * registro, mesmo que ela tenha saído da configuração desde então.
 */
export function universoOrigens(extras: string[]): string[] {
  return [...new Set([...ORIGENS_IMOVEL, ...extras].map((o) => o.trim()).filter(Boolean))];
}

// Rótulos de origem que já foram gravados no banco e hoje têm nome novo.
// O fromDbImovel normaliza para o valor atual, sem migração destrutiva —
// registros antigos passam a exibir/filtrar pelo texto novo, e são regravados
// já normalizados na próxima edição. "Site da imobiliária" dava a impressão de
// ser o site da PRÓPRIA imobiliária; na prática é o garimpo em sites alheios.
export const ORIGENS_LEGADAS: Record<string, string> = {
  "Site da imobiliária": ORIGEM_GARIMPO_SITE,
};

// Motivo específico quando o imóvel é marcado como Perdido ou Cancelado.
// Motivo usado quando o telefone cadastrado não leva ao proprietário. Tem
// constante própria porque o nudge de resultados o aplica sozinho — string
// mágica ali e no filtro do relatório sairiam do ar em silêncio.
export const MOTIVO_PERDA_NUMERO_NAO_ENCONTRADO = "Número não encontrado";

/**
 * A perda que acontece DEPOIS da captação: o imóvel foi angariado, e a locação
 * fechou fora — com outra imobiliária que já anunciava o mesmo imóvel (o caso
 * comum do não exclusivo), ou direto entre proprietário e inquilino.
 *
 * Existe separado de "Imóvel já alugado por conta própria" e de "Optou por
 * outra imobiliária", que parecem o mesmo fato e não são: aqueles dois dizem
 * que o proprietário já tinha resolvido a vida ANTES de a gente aparecer — é o
 * balde "chegamos tarde" do relatório completo, o diagnóstico do garimpo. Aqui
 * não chegamos tarde: a captação foi GANHA (o proprietário disse sim, e o
 * `statusHistory` registra a passagem por "Angariado"), e o que se perdeu foi a
 * locação. Com os três no mesmo balde, o mesmo número responderia "o garimpo
 * está lento?" e "a carteira não gira?", que são perguntas diferentes e pedem
 * ações diferentes — e cada imóvel captado e perdido pioraria, sozinho, a
 * leitura de um trabalho que deu certo.
 *
 * Tem constante própria pelo motivo do MOTIVO_PERDA_NUMERO_NAO_ENCONTRADO: são
 * três módulos referenciando o mesmo rótulo (o seletor do cadastro, o balde do
 * relatório e a correção de fase do webhook), e string mágica em três lugares
 * diverge em silêncio.
 */
export const MOTIVO_PERDA_LOCADO_FORA =
  "Angariado, mas locado por outra imobiliária ou pelo proprietário";

/**
 * Encerramento explícito em que o proprietário não informa a causa.
 *
 * “O imóvel não está mais disponível” basta para tirar o lead da carteira,
 * mas não autoriza concluir que ele foi alugado, vendido ou entregue a outra
 * imobiliária. Guardar a frase como motivo próprio preserva o fato sem
 * transformar uma inferência em dado do funil.
 */
export const MOTIVO_PERDA_IMOVEL_INDISPONIVEL = "Imóvel não está mais disponível";

export const MOTIVOS_PERDA = [
  "Imóvel já vendido", "Imóvel já alugado por conta própria", MOTIVO_PERDA_IMOVEL_INDISPONIVEL,
  "Proprietário desistiu de alugar",
  "Não é mais o proprietário", "Valor pedido incompatível com mercado", "Optou por outra imobiliária",
  MOTIVO_PERDA_LOCADO_FORA,
  "Perda de contato definitiva", MOTIVO_PERDA_NUMERO_NAO_ENCONTRADO, "Outro",
] as const;

// Cores de identidade visual por status (kanban).
export const STATUS_COLORS: Record<string, string> = {
  "Novo contato": "#6fa8c9",
  "Visita agendada": "#9b8fd9",
  "Em negociação": "#e0b458",
  "Documentação": "#e0a35e",
  "Angariado": "#f0a868",
  // Entre o âmbar do "Angariado" e o verde do "Publicado": a assinatura é o
  // ponto em que a captação deixa de ser promessa e vira contrato.
  [STATUS_AUTORIZACAO_ASSINADA]: "#a8cf8e",
  "Publicado": "#7bd4b2",
  "Locado": "#5fb896",
  "Sem resposta": "#b0b0b0",
  "Perdido": "#e08f8f",
  "Cancelado": "#a3a3a3",
};

export const AGENDA_TYPES = ["Retorno ao proprietário", "Visita", "Pendência", "Documentação", "Follow-up"] as const;

// Quantos dias parado num mesmo status já é considerado "estagnado".
export const STALE_DAYS_THRESHOLD = 7;

// Etapas onde o imóvel já foi captado e está aguardando locação
// (Angariado, Autorização assinada, Publicado): ficam naturalmente
// semanas/meses no mesmo status, então só contam como "parado" depois de um
// prazo bem mais longo — a cobrança dessa fase é o lembrete de
// disponibilidade (60 dias), não o funil.
//
// "Autorização assinada" precisou entrar aqui no mesmo commit que a criou, e
// não é detalhe: o imóvel fica nessa etapa até alguém alugá-lo, o que leva
// meses. Sem esta linha, todo imóvel autorizado nasceria com selo de
// estagnação em 7 dias — a repetição exata do que matou a faixa de "imóvel
// parado" no termômetro, agora pela porta de um evento que vem de fora.
export const STATUS_STALE_LENTO = ["Angariado", STATUS_AUTORIZACAO_ASSINADA, "Publicado"] as const;

/** Onde faz sentido escrever o anúncio: o imóvel já é nosso e ainda procura
    inquilino. Mesmos valores de STATUS_STALE_LENTO e de
    DISPONIBILIDADE_STATUS_ALVO, com nome próprio pela razão daquela: a
    pergunta aqui é outra, e amarrá-las faria mexer numa mudar as três.

    "Locado" fica de fora — imóvel alugado não precisa de anúncio, e oferecer
    o gerador ali convidaria a republicar o que acabou de sair do mercado.
    Quando ele desocupar, volta para uma das etapas acima e o botão reaparece.

    NÃO use "Publicado" como gatilho sozinho: na carteira real o corretor não
    marca essa etapa (medido em 08/08/2026 — zero imóveis nela, com os 17
    captados anunciados de verdade), e um botão presente só ali nunca
    apareceria para ninguém. */
/** A abordagem do catálogo que registra as mensagens geradas a partir do
    anúncio do proprietário.

    Existe uma só, fixa, porque o ranking (`calculo/abordagens.ts`) mede
    `Abordagem` por id estável — e a pergunta que esta feature faz é sobre a
    ESTRATÉGIA ("abrir a conversa falando do anúncio dele funciona?"), não
    sobre um texto específico. Cada mensagem é personalizada pelo anúncio
    daquele imóvel, do mesmo jeito que os roteiros já se personalizam por
    `{nome}`/`{endereco}` — aqui em grau maior.

    A abordagem é achada por NOME e criada na primeira geração. Se o corretor
    renomear a dele, a próxima geração cria outra: o ranking passa a mostrar
    duas linhas, o que é chato mas VISÍVEL — e o modal diz em qual está
    registrando, justamente para isso não acontecer calado. */
export const ABORDAGEM_ANALISE_ANUNCIO = "Análise do anúncio (IA)";

/** O roteiro guardado no catálogo. Descreve a estratégia, e não o texto que
    sai — este é escrito na hora, a partir do anúncio de cada proprietário. */
export const ROTEIRO_ANALISE_ANUNCIO =
  "Primeiro contato escrito a partir do anúncio que o próprio proprietário " +
  "publicou: cita até dois pontos do texto dele (e o tempo no ar, quando " +
  "conhecido) e oferece ajuda para alugar mais rápido. A mensagem é gerada " +
  "por IA a cada imóvel — este texto descreve a estratégia, não o que é enviado.";

export const STATUS_COM_ANUNCIO = [
  "Angariado",
  STATUS_AUTORIZACAO_ASSINADA,
  "Publicado",
] as const;
export const STALE_DAYS_THRESHOLD_POS_ANGARIACAO = 60;

// Dias após a angariação (sem locação) para gerar o lembrete automático
// de "verificar disponibilidade com o proprietário".
export const VERIFICACAO_DISPONIBILIDADE_DIAS = 60;
