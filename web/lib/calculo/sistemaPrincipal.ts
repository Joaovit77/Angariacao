/* ================================================================
   INTEGRAÇÃO COM O SISTEMA PRINCIPAL (Sophia) — parte pura

   O painel de angariação acompanha a CAPTAÇÃO: do primeiro contato
   até o proprietário dizer sim. O que vem depois — a Autorização de
   Locação assinada, o contrato de locação, o pagamento da comissão —
   acontece no Sistema Principal da imobiliária, e é ele a fonte
   oficial desses três fatos.

   A regra que dá forma a este módulo inteiro: **aqui só se RECEBE**.
   Nenhuma função deste arquivo decide que uma comissão foi paga; elas
   traduzem um evento que já aconteceu em outro lugar. É o que evita a
   duplicidade que a integração existe para acabar — dois sistemas
   afirmando coisas diferentes sobre o mesmo contrato, e ninguém
   sabendo qual está certo.

   O que mora aqui, e nada toca React, Next ou Supabase:

   1. LER o evento (`interpretarEvento`) — de um JSON qualquer para
      uma estrutura fechada, ou null.
   2. ACHAR a angariação (`localizarAngariacao`) — e recusar quando
      não dá para ter certeza.
   3. APLICAR (`aplicarEvento`) — devolver a mudança, sem executá-la.
   4. LER O LOG (`linhaDoHistorico`) — a tela de auditoria.
   5. As NOTIFICAÇÕES pendentes e 6. os INDICADORES do dashboard.

   Quem executa é `app/api/sophia/eventos`, que é onde estão o segredo
   e a service role. A divisão é a mesma de `webhookWhatsapp.ts`.

   ---------------------------------------------------------------
   O QUE FOI MEDIDO ANTES DE ESCREVER (05/08/2026)

   A pergunta que decidia o desenho era "por qual chave o evento acha
   a angariação?", e a resposta óbvia — a referência do CRM — estava
   errada para o primeiro evento. Na carteira real:

     - conta da supervisora: 640 imóveis, e `referencia_crm` presente
       em 101 de 101 "Locado", 42 de 42 "Publicado" e **3 de 497
       "Angariado"**;
     - em toda a base, **zero** referências repetidas — nem dentro de
       uma conta, nem entre contas.

   Ou seja: a referência é uma chave excelente e **nasce tarde**. Ela
   é criada no Sistema Principal no momento em que o imóvel passa a
   existir lá, que é exatamente o Evento 1. Um casamento só por
   referência funcionaria para os eventos 2 e 3 e falharia justo no
   primeiro — o que, na prática, é falhar em todos, já que sem o
   primeiro os outros nunca encontram nada.

   Daí as duas decisões centrais:

     - o Evento 1 casa por TELEFONE do proprietário (canônico, o mesmo
       casamento que o webhook do WhatsApp já faz) ou por código, e
     - o Evento 1 GRAVA a referência recebida no imóvel, que passa a
       ser o id compartilhado entre os dois sistemas dali em diante.
   ================================================================ */
import { STATUS_AUTORIZACAO_ASSINADA } from "../constantes";
import { chaveNormalizada } from "../normalizacao";
import type { Imovel, NotaImovel } from "../tipos";
import { fmtDate, fmtMoneyFull } from "../formatadores";
import { chaveEndereco } from "./duplicidade";
import { comissaoEstimada } from "./motor";
import { eventosNaoLidos, idNotaDoEvento } from "./notas";
import { telefoneCanonico } from "./webhookWhatsapp";

/** Os três fatos que o Sistema Principal comunica. */
export type TipoEventoSistemaPrincipal =
  | "autorizacao-assinada"
  | "imovel-locado"
  | "comissao-paga";

export const TIPOS_EVENTO: readonly TipoEventoSistemaPrincipal[] = [
  "autorizacao-assinada",
  "imovel-locado",
  "comissao-paga",
];

/**
 * Um evento já lido e validado.
 *
 * Todos os campos de identificação são opcionais menos o `id` e o `tipo`,
 * porque o Sistema Principal conhece coisas diferentes em momentos
 * diferentes — e `localizarAngariacao` sabe trabalhar com o que vier.
 */
export interface EventoSistemaPrincipal {
  /** Id do evento NO SISTEMA PRINCIPAL. É a chave de idempotência: vira o id
      da nota (`sophia:<id>`), e a função `registrar_nota_imovel` recusa o
      repetido numa instrução só. Obrigatório — sem ele, uma reentrega
      duplicaria a notificação e, pior, reaplicaria o evento. */
  id: string;
  tipo: TipoEventoSistemaPrincipal;

  /* --- Identificação do imóvel (o que veio; nada é obrigatório) --- */
  /** Referência do imóvel no Sistema Principal — o id compartilhado. */
  referencia?: string | null;
  /** Código da angariação no painel (LD-xxx), quando o outro lado o guarda. */
  codigo?: string | null;
  /** Telefone do proprietário, em qualquer formatação. */
  telefone?: string | null;
  /** Endereço, usado só para DESEMPATAR quando o telefone acha mais de um. */
  endereco?: string | null;
  unidade?: string | null;

  /* --- Dados do fato --- */
  /** Data do fato (ISO). Ausente = o dia em que o evento chegou. */
  data?: string | null;
  /** Quem registrou, no Sistema Principal. */
  responsavel?: string | null;
  /** Número do contrato de locação (evento 2). */
  contrato?: string | null;
  /** Valor pago (evento 3). */
  valor?: number | null;
  /** Forma de pagamento (evento 3). */
  formaPagamento?: string | null;
  /** Observação livre do financeiro (evento 3). */
  observacao?: string | null;
}

/* ----------------------------------------------------------------
   1. LER O EVENTO

   O corpo chega de outro sistema, o que significa: nomes de campo em
   camelCase ou snake_case conforme quem escreveu o cliente, datas em
   dois formatos, e valores como número ou como "1.234,56". Aceitar as
   variações aqui é mais barato que exigir do outro lado — e é o que
   impede uma integração de quebrar por causa de um underline.

   O que NÃO se aceita: evento sem id e tipo desconhecido. Os dois são
   recusa explícita, não tolerância: sem id não há idempotência, e um
   tipo que não entendemos aplicado "mais ou menos" é pior que ignorado.
   ---------------------------------------------------------------- */

function obj(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
}

/** Primeiro valor de texto não vazio entre os nomes de campo dados. */
function texto(fonte: Record<string, unknown>, ...nomes: string[]): string | null {
  for (const nome of nomes) {
    const v = fonte[nome];
    if (typeof v === "string" && v.trim()) return v.trim();
    if (typeof v === "number" && Number.isFinite(v)) return String(v);
  }
  return null;
}

/**
 * Número em qualquer das formas que um sistema brasileiro manda: 1234.56,
 * "1234.56", "1.234,56", "R$ 1.234,56".
 *
 * Mesma leitura de `lerValor` na importação de planilha, e pelo mesmo motivo:
 * `Number("1.234,56")` é `NaN`, e um `NaN` gravado como valor de comissão
 * apagaria o número certo em vez de recusar o errado.
 */
export function lerValor(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) && v >= 0 ? v : null;
  if (typeof v !== "string") return null;
  const s = v.trim();
  if (!s) return null;
  // Vírgula presente = separador decimal brasileiro; o ponto é de milhar.
  const limpo = s.includes(",")
    ? s.replace(/[^\d,-]/g, "").replace(/\./g, "").replace(",", ".")
    : s.replace(/[^\d.-]/g, "");
  // Sem dígito nenhum não há número, e este `if` não é zelo: `Number("")` é
  // ZERO, não NaN. Sem ele, um evento com `valor: "a combinar"` gravaria
  // R$ 0,00 como o valor que o financeiro pagou — um número errado, com cara
  // de exato, numa tela de dinheiro. É a lição do `custoDaChamada` devolvendo
  // null em vez de zero, e foi um teste que a pegou.
  if (!/\d/.test(limpo)) return null;
  const n = Number(limpo);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * Data do evento → ISO "YYYY-MM-DD". null quando não dá para ler.
 *
 * Sem `new Date`, pela regra do projeto e pela razão dela: `new Date`
 * interpreta "05/08/2026" como mês/dia e joga um contrato de agosto para maio.
 * Aceita ISO ("2026-08-05", inclusive com hora colada, que é o formato que um
 * sistema costuma mandar) e o brasileiro ("05/08/2026").
 */
export function lerDataEvento(v: unknown): string | null {
  const s = typeof v === "string" ? v.trim() : "";
  if (!s) return null;
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  const br = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  let ano: string, mes: string, dia: string;
  if (iso) [, ano, mes, dia] = iso;
  else if (br) [, dia, mes, ano] = br;
  else return null;
  const m = Number(mes);
  const d = Number(dia);
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return `${ano}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** Traduz os rótulos que o outro lado pode usar para o nosso tipo fechado. */
const ALIAS_TIPO: Record<string, TipoEventoSistemaPrincipal> = {
  "autorizacao-assinada": "autorizacao-assinada",
  "autorizacao_assinada": "autorizacao-assinada",
  "autorizacao.assinada": "autorizacao-assinada",
  "autorizacao-locacao-assinada": "autorizacao-assinada",
  "imovel-locado": "imovel-locado",
  "imovel_locado": "imovel-locado",
  "imovel.locado": "imovel-locado",
  "locado": "imovel-locado",
  "comissao-paga": "comissao-paga",
  "comissao_paga": "comissao-paga",
  "comissao.paga": "comissao-paga",
  "comissao-recebida": "comissao-paga",
};

function lerTipo(v: string | null): TipoEventoSistemaPrincipal | null {
  if (!v) return null;
  return ALIAS_TIPO[chaveNormalizada(v).replace(/\s+/g, "-")] ?? null;
}

/**
 * O corpo da requisição → evento, ou null quando não é um evento que sabemos
 * tratar.
 *
 * Aceita os dados no nível raiz ou dentro de `dados`/`data`/`payload`, porque
 * as duas formas são igualmente comuns e descobrir qual o outro lado usa custa
 * uma ida e volta com quem mantém o Sistema Principal.
 */
export function interpretarEvento(corpo: unknown): EventoSistemaPrincipal | null {
  const raiz = obj(corpo);
  const dados = { ...obj(raiz.dados), ...obj(raiz.data), ...obj(raiz.payload) };
  // A raiz tem prioridade: `evento`/`tipo` moram lá mesmo quando o resto vem
  // aninhado, e um `data` que fosse a DATA (string) não vira objeto nenhum.
  const campo = (...nomes: string[]) => texto(raiz, ...nomes) ?? texto(dados, ...nomes);

  const tipo = lerTipo(texto(raiz, "evento", "tipo", "event", "type"));
  if (!tipo) return null;

  const id = campo("id", "eventoId", "evento_id", "eventId", "idEvento");
  if (!id) return null;

  return {
    id,
    tipo,
    referencia: campo(
      "referencia", "referenciaCrm", "referencia_crm", "referenciaImovel",
      "codigoImovel", "codigo_imovel", "imovelId", "imovel_id",
    ),
    codigo: campo("codigo", "codigoAngariacao", "codigo_angariacao"),
    telefone: campo(
      "telefone", "telefoneProprietario", "telefone_proprietario",
      "proprietarioTelefone", "proprietario_telefone", "celular",
    ),
    endereco: campo("endereco", "logradouro"),
    unidade: campo("unidade", "apartamento", "apto"),
    data: lerDataEvento(
      campo(
        "data", "dataAssinatura", "data_assinatura", "dataLocacao", "data_locacao",
        "dataPagamento", "data_pagamento", "assinadoEm", "ocorridoEm", "ocorrido_em",
      ),
    ),
    responsavel: campo(
      "responsavel", "usuario", "usuarioResponsavel", "usuario_responsavel", "user",
    ),
    contrato: campo("contrato", "numeroContrato", "numero_contrato", "contratoNumero"),
    valor: lerValor(
      raiz.valor ?? raiz.valorPago ?? raiz.valor_pago ??
      dados.valor ?? dados.valorPago ?? dados.valor_pago,
    ),
    formaPagamento: campo("formaPagamento", "forma_pagamento", "forma"),
    observacao: campo("observacao", "observacoes", "obs"),
  };
}

/* ----------------------------------------------------------------
   2. ACHAR A ANGARIAÇÃO

   Esta é a parte perigosa. Aplicar o evento no imóvel errado não dá
   erro em lugar nenhum: o painel simplesmente passa a afirmar que uma
   captação que não fechou está locada, ou credita a comissão de um
   contrato à angariação de outro corretor.

   Por isso a função devolve um MOTIVO quando não consegue decidir, e
   a rota registra esse motivo em vez de escolher no chute. Não agir é
   sempre recuperável — o evento pode ser reenviado, e o corretor pode
   preencher a referência à mão. Agir errado, não.
   ---------------------------------------------------------------- */

export type FalhaLocalizacao = "sem-identificacao" | "nao-encontrada" | "ambigua";

export type ResultadoLocalizacao =
  | { ok: true; imovel: Imovel }
  | { ok: false; falha: FalhaLocalizacao; candidatos: number };

/** Posição no funil, para desempatar. Fora do funil = -1. */
const ORDEM_FUNIL = [
  "Novo contato", "Visita agendada", "Em negociação", "Documentação",
  "Angariado", STATUS_AUTORIZACAO_ASSINADA, "Publicado", "Locado",
];

function avanco(imovel: Imovel): number {
  return ORDEM_FUNIL.indexOf(imovel.status);
}

/**
 * Entre os candidatos que a rota trouxe do banco, qual é a angariação deste
 * evento.
 *
 * Os candidatos já vêm filtrados pela chave forte (referência, código ou
 * telefone canônico) — a rota faz isso no banco, com índice. O que sobra para
 * decidir aqui é o empate, e ele tem uma causa concreta: proprietário com
 * vários imóveis. Casar por telefone traz todos, e o evento é sobre um.
 *
 * A escada de desempate, e o porquê de cada degrau:
 *
 *   1. **Endereço**, quando o evento manda um. É o único critério que fala do
 *      imóvel; os outros dois falam de probabilidade.
 *   2. **Ainda vivo.** Um evento de assinatura não é sobre o imóvel que o
 *      proprietário mandou embora no ano passado.
 *   3. **Mais avançado no funil.** Entre dois imóveis vivos do mesmo dono, o
 *      que está em "Documentação" é o assunto da conversa; o que está em
 *      "Novo contato" não chegou perto de uma autorização.
 *
 * Sobrando empate, devolve `ambigua` — e é isso que a função existe para
 * fazer. Escolher um dos dois "porque provavelmente é esse" seria acertar na
 * maioria das vezes e errar em silêncio no resto, que é o pior desfecho
 * possível quando o evento é o pagamento de uma comissão.
 */
export function localizarAngariacao(
  candidatos: Imovel[],
  evento: EventoSistemaPrincipal,
): ResultadoLocalizacao {
  if (!evento.referencia && !evento.codigo && !evento.telefone) {
    return { ok: false, falha: "sem-identificacao", candidatos: 0 };
  }
  if (candidatos.length === 0) {
    return { ok: false, falha: "nao-encontrada", candidatos: 0 };
  }
  if (candidatos.length === 1) return { ok: true, imovel: candidatos[0] };

  let restantes = candidatos;

  const chave = chaveEndereco(evento.endereco);
  if (chave) {
    const unidade = chaveEndereco(evento.unidade);
    const porEndereco = restantes.filter(
      (i) =>
        chaveEndereco(i.endereco) === chave &&
        (!unidade || chaveEndereco(i.unidade) === unidade),
    );
    if (porEndereco.length === 1) return { ok: true, imovel: porEndereco[0] };
    if (porEndereco.length > 1) restantes = porEndereco;
  }

  const vivos = restantes.filter((i) => !i.retirado && avanco(i) >= 0);
  if (vivos.length === 1) return { ok: true, imovel: vivos[0] };
  if (vivos.length > 1) restantes = vivos;

  const topo = Math.max(...restantes.map(avanco));
  const maisAvancados = restantes.filter((i) => avanco(i) === topo);
  if (maisAvancados.length === 1) return { ok: true, imovel: maisAvancados[0] };

  return { ok: false, falha: "ambigua", candidatos: candidatos.length };
}

/** O telefone do evento na forma canônica usada pela coluna indexada —
    a MESMA de `webhookWhatsapp.ts`, de propósito: duas normalizações
    diferentes fariam o casamento falhar sem erro nenhum. */
export function telefoneDoEvento(evento: EventoSistemaPrincipal): string | null {
  return evento.telefone ? telefoneCanonico(evento.telefone) : null;
}

/* ----------------------------------------------------------------
   3. APLICAR

   Devolve o que MUDA, sem executar nada — a rota é que escreve. Isso
   é a disciplina de `webhookWhatsapp.ts`, e o que torna as três
   regras abaixo testáveis sem banco.
   ---------------------------------------------------------------- */

/** Os campos do imóvel que o evento altera, prontos para o update. */
export interface MudancaDoEvento {
  /** Novo status, quando o evento muda a etapa. null = etapa intocada. */
  status: string | null;
  /** Campos de coluna a gravar (já em camelCase do domínio). */
  campos: Partial<Imovel>;
  /** O texto da notificação, que vira a nota `sophia:<id>`. */
  texto: string;
}

/**
 * O que este evento faz com este imóvel.
 *
 * Devolve `null` quando não há o que fazer — hoje, um evento de comissão sobre
 * um imóvel que já estava com a comissão marcada como recebida no mesmo valor.
 * Não é o mesmo que a idempotência do id (essa é do banco): é o caso de o
 * financeiro reemitir o mesmo pagamento com id novo.
 *
 * Duas regras atravessam os três eventos:
 *
 * - **O status só ANDA.** Um evento de assinatura que chega depois de o imóvel
 *   já estar "Locado" não o traz de volta para trás — os eventos podem chegar
 *   fora de ordem (fila reprocessada, integração religada), e a única coisa
 *   pior que perder um evento é desfazer um desfecho melhor com um antigo.
 *   O dado do evento (a data da assinatura) é gravado de qualquer jeito: ele
 *   não conflita com nada, e é do que a solicitação de comissão precisa.
 * - **Nada é apagado.** Campo ausente no evento deixa o que já estava; só o
 *   que vem preenchido sobrescreve. Um evento magro não pode zerar o número
 *   do contrato que um evento anterior trouxe.
 */
export function aplicarEvento(
  imovel: Imovel,
  evento: EventoSistemaPrincipal,
  hoje: string,
  comissaoPercent: number,
): MudancaDoEvento | null {
  const data = evento.data || hoje;
  const rotulo = rotuloDoImovel(imovel);

  if (evento.tipo === "autorizacao-assinada") {
    const campos: Partial<Imovel> = { autorizacaoAssinadaEm: data };
    if (evento.responsavel) campos.autorizacaoResponsavel = evento.responsavel;
    // A referência recebida vira o id compartilhado. Só grava quando o imóvel
    // ainda não tem uma: sobrescrever a que o corretor digitou seria o
    // Sistema Principal corrigindo um dado que ele não sabe se está errado.
    if (evento.referencia && !(imovel.referenciaCrm || "").trim()) {
      campos.referenciaCrm = evento.referencia;
    }
    return {
      status: avancaPara(imovel, STATUS_AUTORIZACAO_ASSINADA),
      campos,
      texto:
        `Autorização de locação assinada em ${fmtDate(data)}` +
        (evento.responsavel ? ` (registrado por ${evento.responsavel})` : "") +
        `. Imóvel ${rotulo}.`,
    };
  }

  if (evento.tipo === "imovel-locado") {
    const campos: Partial<Imovel> = { locadoEm: data };
    if (evento.contrato) campos.contratoNumero = evento.contrato;
    if (evento.referencia && !(imovel.referenciaCrm || "").trim()) {
      campos.referenciaCrm = evento.referencia;
    }
    return {
      status: avancaPara(imovel, "Locado"),
      campos,
      texto:
        `O imóvel ${rotulo} foi locado em ${fmtDate(data)}` +
        (evento.contrato ? `, contrato ${evento.contrato}` : "") +
        ".",
    };
  }

  // comissao-paga
  const valor = evento.valor ?? comissaoEstimada(imovel, comissaoPercent);
  const jaConstava =
    !!imovel.comissaoRecebida &&
    imovel.comissaoRecebidaData === data &&
    (imovel.comissaoRecebidaValor ?? null) === (evento.valor ?? null);
  if (jaConstava) return null;

  const campos: Partial<Imovel> = {
    comissaoRecebida: true,
    comissaoRecebidaData: data,
    // Só grava o valor que o evento AFIRMA. Sem ele, deixa null e o app segue
    // usando a estimativa (`comissaoRecebidaValor` no motor já faz esse
    // fallback) — gravar a estimativa como se fosse valor pago transformaria
    // um palpite nosso num fato do financeiro, que é o oposto do que esta
    // integração existe para fazer.
    comissaoRecebidaValor: evento.valor ?? null,
  };
  if (evento.formaPagamento) campos.comissaoFormaPagamento = evento.formaPagamento;
  if (evento.observacao) campos.comissaoObservacao = evento.observacao;

  return {
    // A comissão não mexe no funil: ela é paga DEPOIS da locação, e o imóvel
    // já está em "Locado". Forçar o status aqui só criaria transição falsa no
    // histórico — e é o histórico que responde "quando isto foi locado".
    status: null,
    campos,
    texto:
      /* `fmtMoneyFull`, e não `fmtMoney`: aquele corta os centavos, e o card
         de KPI pode se dar a esse luxo porque ali o número é ordem de
         grandeza. Aqui é o aviso de um PAGAMENTO — "R$ 1.920" no lugar de
         "R$ 1.920,47" é o painel divergindo do extrato em uma conferência que
         o corretor vai fazer centavo a centavo. */
      `Comissão da angariação do imóvel ${rotulo} foi paga em ${fmtDate(data)}` +
      ` — ${fmtMoneyFull(valor)}` +
      (evento.formaPagamento ? ` via ${evento.formaPagamento}` : "") +
      (evento.observacao ? `. ${evento.observacao}` : ".") ,
  };
}

/**
 * O status novo, ou null quando o imóvel já está nele ou mais à frente.
 *
 * Imóvel FORA do funil (Perdido, Cancelado, Sem resposta) tem `avanco` -1 e
 * portanto sempre avança — e isso é a coisa certa, não um efeito colateral. O
 * Sistema Principal é a fonte oficial da locação: se de lá vem que o contrato
 * foi assinado, o "Perdido" registrado aqui era o corretor tendo desistido de
 * um negócio que a imobiliária fechou. Recusar a correção manteria na carteira
 * uma derrota que não aconteceu, e é justamente o tipo de divergência entre os
 * dois sistemas que a integração existe para acabar.
 */
function avancaPara(imovel: Imovel, destino: string): string | null {
  const atual = avanco(imovel);
  const alvo = ORDEM_FUNIL.indexOf(destino);
  if (atual >= alvo) return null;
  return destino;
}

/** Como o imóvel se nomeia dentro do texto da notificação. */
export function rotuloDoImovel(imovel: Imovel): string {
  const codigo = (imovel.codigo || imovel.referenciaCrm || "").trim();
  const endereco = (imovel.endereco || "").trim();
  if (codigo && endereco) return `${codigo} · ${endereco}`;
  return codigo || endereco || "sem endereço";
}

/** A nota que carrega a notificação. Nasce sem `lida`, que é o que a deixa
    pendente no sino — ver `eventosNaoLidos` em `notas.ts`. */
export function notaDoEvento(
  evento: EventoSistemaPrincipal,
  texto: string,
  agora: string,
): NotaImovel {
  return { id: idNotaDoEvento(evento.id), texto, data: agora };
}

/* ----------------------------------------------------------------
   4. O HISTÓRICO DA INTEGRAÇÃO (leitura do log)

   A tela de auditoria: os últimos eventos recebidos e o que
   aconteceu com cada um. Ela lê `log_eventos` — a mesma tabela do
   painel de admin —, e não uma tabela nova, pelo motivo de sempre
   neste projeto: o dado já está lá, e uma segunda tabela seria mais
   RLS, mais mapeador e mais uma regra de expiração para guardar o
   que já se guarda.

   O que mora aqui é a CONVENÇÃO do `detalhe`: ele começa sempre com
   o tipo do evento, e é dessa primeira parte que a coluna "Evento"
   sai. Escrever e ler a convenção no mesmo arquivo é o que impede a
   rota e a tela de discordarem — o aviso das gêmeas
   `telefoneCanonico`/`telefone_canonico` vale igual aqui, com o
   agravante de que uma divergência aqui não daria erro: a coluna
   simplesmente ficaria vazia.
   ---------------------------------------------------------------- */

export const ROTULO_TIPO_EVENTO: Record<TipoEventoSistemaPrincipal, string> = {
  "autorizacao-assinada": "Autorização assinada",
  "imovel-locado": "Imóvel locado",
  "comissao-paga": "Comissão paga",
};

/** Monta o `detalhe` de um registro de log: o tipo primeiro, o resto depois.
    Único lugar que decide o separador — a leitura abaixo depende dele. */
export function detalheDoLog(
  tipo: TipoEventoSistemaPrincipal,
  ...extras: (string | null | undefined)[]
): string {
  return [tipo, ...extras.filter((e) => !!e)].join(" · ");
}

/** Como cada desfecho se apresenta na tela. Vocabulário FECHADO, como
    `EVENTOS` em admin.ts: log em texto livre vira um lugar onde cada rota
    escreve do seu jeito e ninguém consegue filtrar depois. */
const DESFECHOS: Record<string, { texto: string; tom: "ok" | "aviso" | "erro" }> = {
  "sophia-aplicado": { texto: "Aplicado", tom: "ok" },
  "sophia-duplicado": { texto: "Ignorado (evento duplicado)", tom: "aviso" },
  "sophia-ja-constava": { texto: "Ignorado (já constava)", tom: "aviso" },
  "sophia-sem-angariacao": { texto: "Angariação não encontrada", tom: "erro" },
  "sophia-ambiguo": { texto: "Mais de uma angariação", tom: "erro" },
  "sophia-invalido": { texto: "Formato não reconhecido", tom: "erro" },
  "sophia-falhou": { texto: "Falha ao aplicar", tom: "erro" },
};

export interface LinhaIntegracao {
  id: number;
  /** Datetime como veio do banco. Quem formata é a tela. */
  quando: string;
  /** O tipo do evento, em português. null quando o payload era ilegível — e
      aí não há tipo mesmo, porque foi exatamente isso que falhou. */
  evento: string | null;
  resultado: string;
  tom: "ok" | "aviso" | "erro";
  /** O que sobrou do detalhe depois de tirar o tipo (chave usada, motivo,
      status novo). Vazio vira null para a tela não desenhar célula à toa. */
  contexto: string | null;
  userId: string | null;
}

/** Uma linha do log → uma linha da tabela. Evento desconhecido não some da
    lista: cai no próprio código, para quem estiver depurando ver o que
    ninguém previu — a mesma regra do `rotuloEvento`. */
export function linhaDoHistorico(e: {
  id: number;
  evento: string;
  detalhe: string | null;
  criadoEm: string;
  userId: string | null;
}): LinhaIntegracao {
  const partes = (e.detalhe || "").split(" · ").map((p) => p.trim()).filter(Boolean);
  const primeiro = partes[0] || "";
  const ehTipo = primeiro in ROTULO_TIPO_EVENTO;
  const desfecho = DESFECHOS[e.evento] ?? { texto: e.evento, tom: "erro" as const };
  return {
    id: e.id,
    quando: e.criadoEm,
    evento: ehTipo ? ROTULO_TIPO_EVENTO[primeiro as TipoEventoSistemaPrincipal] : null,
    resultado: desfecho.texto,
    tom: desfecho.tom,
    contexto: (ehTipo ? partes.slice(1) : partes).join(" · ") || null,
    userId: e.userId,
  };
}

/* ----------------------------------------------------------------
   5. AS NOTIFICAÇÕES

   Um evento aplicado vira uma nota `sophia:<id>` no imóvel, e é ela
   que serve de notificação: nasce sem `lida`, o sino a conta, o
   Realtime a empurra para a tela na hora e o clique leva ao imóvel.

   Não há tabela de notificações, e a ausência dela é decisão. Uma
   tabela nova exigiria RLS própria, mapeadores, uma publicação de
   Realtime a mais e uma regra de expiração — para guardar um texto
   que pertence ao histórico daquele imóvel de qualquer forma. A nota
   já dá tudo isso de graça: idempotência (pelo id do evento, na
   função do banco), estado de leitura (o `lida` que a caixa de
   respostas inaugurou) e o vínculo com a angariação, que é o que a
   notificação precisa oferecer ao ser clicada.
   ---------------------------------------------------------------- */

export interface NotificacaoEvento {
  /** Id da nota — é ele que a marcação de lida usa. */
  id: string;
  imovelId: string;
  /** Como o imóvel se chama na lista. */
  rotulo: string;
  texto: string;
  /** Datetime "YYYY-MM-DDTHH:mm" da chegada. */
  data: string;
}

/**
 * Tudo que o Sistema Principal mandou e o corretor ainda não leu, do mais
 * recente para o mais antigo.
 *
 * Mais recente primeiro, ao contrário da `rodadaDia` e do termômetro, que
 * ordenam por urgência. Aqui não há urgência a ordenar: nenhum destes eventos
 * pede ação — eles CONTAM um fato já consumado. O que o corretor quer saber é
 * o que mudou desde a última vez que olhou, e isso é ordem cronológica.
 */
export function notificacoesPendentes(imoveis: Imovel[]): NotificacaoEvento[] {
  const lista: NotificacaoEvento[] = [];
  for (const imovel of imoveis) {
    for (const nota of eventosNaoLidos(imovel.notas)) {
      lista.push({
        id: nota.id,
        imovelId: imovel.id,
        rotulo: rotuloDoImovel(imovel),
        texto: nota.texto,
        data: nota.data || "",
      });
    }
  }
  return lista.sort((a, b) => b.data.localeCompare(a.data));
}

/* ----------------------------------------------------------------
   6. OS INDICADORES DO DASHBOARD

   Sete números que respondem a uma pergunta que o painel não sabia
   responder: onde estão as captações que já foram ganhas, e quanto
   delas já virou dinheiro na conta do corretor.

   Contam TODOS os imóveis, e não só `imoveisDeCaptacao`: o eixo aqui
   é a CARTEIRA, não a captação. Uma sala desdobrada de um galpão não
   conta como angariação nova (isso continua valendo nas métricas de
   esforço), mas tem contrato e comissão próprios — e é justamente o
   dinheiro que esta seção mede. Ver "Desdobramento" no CLAUDE.md.

   Os valores saem de `comissaoEstimada`, a MESMA função do resto do
   app, para o dashboard não passar a discordar de Metas e Relatórios
   sobre quanto vale uma comissão.
   ---------------------------------------------------------------- */

export interface IndicadoresIntegracao {
  aguardandoAssinatura: number;
  autorizadas: number;
  locadas: number;
  comissoesPendentes: number;
  comissoesRecebidas: number;
  /** Soma do que já entrou (o valor informado pelo financeiro quando existe,
      senão a estimativa — o mesmo critério de `comissaoRecebidaValor`). */
  valorRecebido: number;
  /** Soma estimada do que ainda não entrou. É ESTIMATIVA por natureza: o
      financeiro só informa o valor ao pagar. */
  valorPendente: number;
}

export function indicadoresIntegracao(
  imoveis: Imovel[],
  comissaoPercent: number,
): IndicadoresIntegracao {
  const ind: IndicadoresIntegracao = {
    aguardandoAssinatura: 0,
    autorizadas: 0,
    locadas: 0,
    comissoesPendentes: 0,
    comissoesRecebidas: 0,
    valorRecebido: 0,
    valorPendente: 0,
  };

  for (const i of imoveis) {
    // Retirado saiu da carteira: contá-lo aqui anunciaria como pendente uma
    // comissão que nunca vai ser paga. Mesma razão de ele sair do Pipeline
    // ativo (ver calculo/filtros.ts).
    if (i.retirado) continue;

    /* Os três baldes são DISJUNTOS e testados do mais forte para o mais
       fraco, porque um imóvel pode satisfazer dois ao mesmo tempo e contá-lo
       duas vezes faria a soma dos cards passar do tamanho da carteira.

       E "autorizada" pergunta pelo FATO (`autorizacaoAssinadaEm`) antes de
       perguntar pelo status. A diferença aparece no caminho mais comum que
       existe: o corretor publica o anúncio e move o card para "Publicado", à
       frente de "Autorização assinada" no funil. Perguntando só ao status,
       esse imóvel — que TEM autorização assinada e registrada — voltaria a
       ser contado como "aguardando assinatura", e o card cobraria para sempre
       um documento que já está assinado. */
    if (i.status === "Locado") {
      ind.locadas++;
      if (i.comissaoRecebida) {
        ind.comissoesRecebidas++;
        ind.valorRecebido += i.comissaoRecebidaValor ?? comissaoEstimada(i, comissaoPercent);
      } else {
        ind.comissoesPendentes++;
        ind.valorPendente += comissaoEstimada(i, comissaoPercent);
      }
    } else if (i.status === STATUS_AUTORIZACAO_ASSINADA || i.autorizacaoAssinadaEm) {
      ind.autorizadas++;
    } else if (i.status === "Angariado" || i.status === "Publicado") {
      ind.aguardandoAssinatura++;
    }
  }
  return ind;
}
