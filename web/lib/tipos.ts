/* ================================================================
   TIPOS DO DOMÍNIO
   Espelham o shape camelCase produzido pelos mapeadores fromDb*
   do app original (app.js, seção 2). Os campos são deliberadamente
   permissivos (null/undefined/"") porque o motor de cálculo legado
   trata todos esses casos — o tipo documenta o contrato, não o
   restringe além do que o código antigo garantia.
   ================================================================ */
import type { ResultadoTentativa } from "./constantes";

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
  /** Resposta do proprietário já tratada na Caixa de respostas, sem que
      nenhuma ação a tenha encerrado sozinha.

      Só faz sentido na nota do webhook (`wa:<id>`). Existe porque "obrigado"
      e "combinado" não vão gerar tentativa nem mudar status nunca: sem uma
      saída manual, ficariam pendentes para sempre e a caixa encheria de
      ruído até o corretor parar de abri-la. Ausente = não lida — a coluna é
      jsonb, então nota antiga simplesmente não tem o campo.
      Ver calculo/respostas.ts. */
  lida?: boolean;
}

/** Roteiro de captação cadastrado pelo usuário — o QUE se diz ao proprietário.
    Não confundir com `Imovel.formaAbordagem`, que é o CANAL usado. */
export interface Abordagem {
  id: string;
  nome: string;
  roteiro?: string | null;
  /** Canal em que a abordagem costuma ser usada (um de FORMAS_ABORDAGEM). */
  canalSugerido?: string | null;
  /** Origens do imóvel que este roteiro atende (valores de ORIGENS_IMOVEL ou
      das origens que o corretor criou em user_config).

      É o que permite ao follow-up em lote mandar o texto certo para cada
      pedaço da fila: um lote mistura imóvel achado em site de imobiliária com
      imóvel que o Copel diz estar desocupado, e a abertura de conversa não
      pode ser a mesma (ver calculo/lotePorOrigem.ts). Vazio significa "serve a
      qualquer origem, mas não sou o padrão de nenhuma": o roteiro continua
      escolhível em todo seletor, só não se aplica sozinho. */
  origens?: string[];
  /** Arquivada: some dos seletores, mas segue nomeando as tentativas antigas. */
  arquivada: boolean;
}

/** Uma tentativa de contato com o proprietário de um imóvel. */
export interface Tentativa {
  id: string;
  /** Datetime local "YYYY-MM-DDTHH:mm" — lexicograficamente ordenável (igual NotaImovel). */
  data: string;
  /** id da Abordagem usada; null quando o roteiro não foi registrado. */
  abordagemId?: string | null;
  /** Nome do modelo PRÓPRIO do corretor (user_config.whatsapp_modelos) usado
      no envio, quando não foi uma abordagem do catálogo.

      É só RÓTULO — guardado por valor, não por id, e de propósito: modelo se
      apaga (tem botão de remover), enquanto abordagem se arquiva justamente
      para as tentativas antigas não ficarem órfãs. Guardar o id faria o
      histórico perder o nome no dia em que o modelo fosse excluído.

      Não entra no ranking de abordagens: sem id estável não há como comparar
      séries, e "confirmação de visita" não disputa captação com um roteiro de
      primeiro contato. Serve para o corretor lembrar o que mandou. */
  modeloNome?: string | null;
  /** Canal do contato (um de FORMAS_ABORDAGEM). */
  canal?: string | null;
  resultado: ResultadoTentativa;
  observacao?: string | null;
  /** Leitura da IA sobre a resposta que o proprietário mandou.

      Existe para separar o que se MEDE do que se FAZ. O `resultado` acima é
      categoria fixa, porque é ele que alimenta o ranking — categoria aberta
      daria amostra 1 a cada rótulo inventado. Já `retomarEm` e `resumo` são
      livres: descrevem a próxima ação daquela conversa específica, e é aí que
      o sistema se encaixa no que a pessoa realmente disse.

      É SUGESTÃO, não fato: chega junto com `aguardandoResultado`, e some
      quando o corretor confirma. A IA não sabe se entendeu certo. */
  sugestaoIa?: {
    /** Desfecho sugerido, sempre um de RESULTADOS_TENTATIVA. */
    resultado: ResultadoTentativa;
    /** Data sugerida para retomar (ISO YYYY-MM-DD), quando a mensagem
        indicar prazo ("te retorno na semana que vem"). null quando não há.

        Quando existe, o webhook cria um COMPROMISSO na agenda com ela — ver
        `compromissoDaResposta` em calculo/webhookWhatsapp.ts. */
    retomarEm?: string | null;
    /** Hora combinada ("HH:MM"), quando a mensagem marcar uma. É o que separa
        "te ligo quinta" de "quinta às 10h" — só com hora o compromisso entra
        na faixa de horários da agenda em vez da lista solta do dia. */
    horaRetomar?: string | null;
    /** Uma linha sobre o que a pessoa disse, para o corretor decidir sem
        reler a conversa inteira. */
    resumo: string;
    /** Motivo de perda que a mensagem estabelece SOZINHA (um de MOTIVOS_PERDA_IA),
        quando ela encerra o assunto — é o que dispara o encerramento automático.
        O webhook grava o `RespostaClassificada` inteiro aqui, então este campo
        chega junto; a caixa de respostas o lê para sugerir a resposta certa
        ("encerramento cordial" quando o proprietário disse que não há mais o que
        fazer). null na esmagadora maioria das mensagens. */
    motivoPerda?: string | null;
  } | null;

  /** Tentativa criada AUTOMATICAMENTE ao enviar a mensagem, cujo `resultado`
      ainda é um palpite. No instante do envio ninguém sabe se o proprietário
      vai responder, então ela nasce "sem-resposta" — mas isso é um placeholder,
      não um fato observado, e a diferença importa: uma "sem-resposta" digitada
      à mão é uma afirmação sua, e o nudge não deve cobrar você por ela.
      Some quando o resultado é atualizado. */
  aguardandoResultado?: boolean;

  /** A tentativa saiu da FILA do envio em lote (e não de um envio avulso).
      Só existe para o teto diário do lote contar o que ele mesmo mandou.

      O teto é o freio anti-banimento do lote, mas ele lia toda tentativa de
      WhatsApp do dia — inclusive os primeiros contatos disparados um a um pelo
      botão 💬. Numa manhã de prospecção o corretor gastava a cota do lote sem
      nunca tê-lo aberto, e a ferramenta amanhecia fechada. Pior, o freio
      estrangulava justamente o caminho que TEM pacing sorteado entre mensagens,
      enquanto o envio avulso — que não tem freio nenhum — passava livre.

      Não precisou de migração: `tentativas` é jsonb. */
  viaLote?: boolean;
}

export interface Imovel {
  id: string;
  codigo?: string | null;
  referenciaCrm?: string | null;
  cep?: string | null;
  endereco: string;
  bairro?: string | null;
  cidade?: string | null;
  /** Número do apartamento/unidade (ex.: "101"). Junto com `bloco`, é o que
      distingue dois imóveis no MESMO endereço — ver calculo/duplicidade.ts. */
  unidade?: string | null;
  /** Bloco/torre dentro do condomínio (ex.: "B", "Torre 2"). */
  bloco?: string | null;
  /** Nome do edifício/condomínio (ex.: "Ed. Solar das Palmeiras"). */
  edificio?: string | null;
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
  /** Há quantos dias o ANÚNCIO estava publicado quando você o encontrou.
      Não é a idade de hoje: é a idade no momento do garimpo, congelada — é
      isso que se cruza com o desfecho para saber se anúncio velho vale a pena.

      Existe porque o maior balde de perdas da carteira é "chegamos tarde"
      (30 dos 50 encerramentos: já alugado, já vendido, foi para outra
      imobiliária) e, medido, o corretor NÃO é lento depois de achar o anúncio
      — a mediana entre cadastrar e mandar a primeira mensagem é 0 dia. O
      atraso está em ACHAR, e essa variável não existia em lugar nenhum:
      `dataAngariacao` é a data do cadastro, não a da publicação.

      null quando o anúncio não disse (a maioria dos casos antigos). */
  anuncioIdadeDias?: number | null;
  imobiliariaConcorrente?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  dataAngariacao?: string | null; // ISO YYYY-MM-DD
  responsavel?: string | null;
  status: string;
  observacoes?: string | null;
  statusHistory?: StatusHistoryEntry[] | null;
  notas?: NotaImovel[] | null;
  tentativas?: Tentativa[] | null;
  pausadoAte?: string | null; // ISO YYYY-MM-DD
  motivoPerda?: string | null;
  motivoPerdaOutro?: string | null;
  comissaoRecebida?: boolean | null;
  comissaoRecebidaValor?: number | null;
  comissaoRecebidaData?: string | null; // ISO YYYY-MM-DD
  /** Pré-cadastro pendente de confirmação: criado no disparo rápido, some
      quando o imóvel é editado/salvo pelo modal completo (§ pré-cadastro). */
  preCadastro?: boolean | null;
  /** Este imóvel é uma UNIDADE de um espaço já captado — aponta para o imóvel
      que registrou a captação. null (o caso normal) = captação própria.

      Existe porque um galpão que o proprietário aceita dividir em salas vira
      várias linhas na carteira, mas continua sendo UMA conversa ganha. As
      linhas extras precisam existir para ter aluguel, contrato e comissão
      próprios; o que elas não podem é contar como angariações novas.
      Ver `imoveisDeCaptacao` em calculo/motor.ts. */
  imovelPrincipalId?: string | null;
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
  /** Hora "HH:MM" (24h). null/"" = compromisso sem hora ("dia inteiro"). */
  hora?: string | null;
  imovelId?: string | null;
  notes?: string | null;
  done: boolean;
  isVerificacaoDisponibilidade: boolean;
}

/** Modelo de mensagem de WhatsApp criado pelo usuário (ex.: "Falar mais tarde").
    O texto pode conter marcadores preenchidos com os dados do imóvel na hora de
    usar: {nome} (proprietário) e {endereco} (rua e número) são os oferecidos na
    UI. {imovel} ainda funciona, para não quebrar modelo antigo, mas expande
    para a FRASE "seu imóvel (rua, bairro)" e só encaixa em construções como
    "sobre o {imovel}" — ver aplicarModeloUsuario. */
export interface WhatsappModelo {
  id: string;
  nome: string;
  texto: string;
}

export interface UserConfig {
  /** % sobre 1 aluguel (100 = 1 mês de aluguel) */
  comissaoPercent: number;
  /** Tipos de compromisso extras definidos pelo usuário (além dos fixos). */
  agendaTipos: string[];
  /** Modelos de mensagem de WhatsApp criados pelo usuário. */
  whatsappModelos: WhatsappModelo[];
  /** Nome da empresa/imobiliária — entra na apresentação das abordagens
      sugeridas por IA. Por conta, pensando em várias imobiliárias. */
  empresa: string;
  /** Portais de prospecção criados pelo usuário, além dos fixos (ORIGENS_IMOVEL).
      Aparecem no seletor "Onde encontrou o imóvel" e no "Foco do dia". */
  origensExtras: string[];
}
