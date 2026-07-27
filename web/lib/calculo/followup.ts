/* ================================================================
   ENVIO EM LOTE — parte pura
   Feature nova da pós-migração (sem oráculo do app antigo).

   Dois públicos, mesma máquina. Ambos respondem "de quem vale mandar
   uma mensagem hoje, sem cutucar duas vezes nem virar spam?":

   1. SEGUIMENTO (selecionarFollowUp) — proprietários em "Sem resposta",
      uma cutucada para reabrir a conversa.
   2. DISPONIBILIDADE (selecionarVerificacaoDisponibilidade) — imóveis
      já angariados/publicados há tempo, confirmando se ainda estão
      disponíveis. É a versão em LOTE do lembrete individual de
      "verificar disponibilidade" (ver ModalVerificacao / a agenda).

   Quem envia é a fila em lib/filaFollowUp.ts, que chama a rota
   /api/whatsapp/enviar uma vez por imóvel; aqui ficam a ELEGIBILIDADE
   e o TEXTO, puros e testáveis — sem React/Next/Supabase/store.

   O desenho inteiro é governado por um risco que não é de software:
   disparar mensagens em rajada pela mesma instância do WhatsApp é o
   padrão que a plataforma classifica como spam. Taxa de resposta baixa
   + textos iguais + rajada = número banido, e o número é da imobiliária.
   Daí os freios abaixo; eles não são preferência de UX, são o que mantém
   a conta viva. Os dois lotes COMPARTILHAM o teto do dia (mesma instância,
   mesma conta) e a regra de uma mensagem por proprietário.

   Nenhum deles precisou de campo novo no banco: as TENTATIVAS já
   registram quando se falou com o proprietário e quantas vezes. É a
   mesma leitura que o ranking de abordagens faz — a verdade está no
   histórico, não num campo único do imóvel.
   ================================================================ */
import { VERIFICACAO_DISPONIBILIDADE_DIAS } from "../constantes";
import { daysBetween } from "../datas";
import type { Abordagem, Imovel, Tentativa } from "../tipos";
import { dataAngariadoEfetiva, isPausado } from "./motor";
import { telefoneCanonico } from "./webhookWhatsapp";
import { aplicarModeloUsuario, type FalhaEnvio, mensagemWhatsapp, numeroEvolution } from "./whatsapp";

/** Quantas mensagens saem numa rodada. Dez leva ~7 minutos no intervalo
    abaixo: pouco tempo de aba aberta e longe do padrão de rajada. */
export const FOLLOWUP_LOTE_MAX = 10;

/** Teto por dia. O corte de {@link diasDesdeUltimoContato} já impede
    reenviar para o MESMO proprietário, mas nada impediria rodar o lote de
    novo pegando "os próximos 10" a cada rodada — em uma tarde de faxina no
    pipeline isso vira 40 mensagens. Duas rodadas por dia é o limite. */
export const FOLLOWUP_TETO_DIA = 20;

/** Dias desde o último contato registrado (de QUALQUER canal) para o
    proprietário voltar a ser elegível — **por posição na cadência**, não um
    número fixo. Vale para qualquer tentativa, não só as do lote: se você
    ligou para ele anteontem, um "não consegui retorno" automático hoje soa
    como robô — porque é.

    Era 14 dias, sempre. O problema não era o 14 — era o "sempre": a espera
    tratava igual a SEGUNDA tentativa e a QUARTA, que são conversas
    diferentes. Duas semanas depois, "te mandei uma mensagem" já perdeu o
    contexto, e os motivos de perda da carteira real dizem que a decisão do
    proprietário acontece antes disso (em 27/07/2026, 30 das 49 perdas eram
    "já alugou", "já vendeu" ou "foi para outra imobiliária" — chegar em 14
    dias é chegar depois). Já a quarta mensagem para quem nunca respondeu é o
    oposto: ali a pressa é que custa caro.

    Encurtar o começo **não** aumenta o volume diário de envio — quem segura
    isso é {@link FOLLOWUP_TETO_DIA}, {@link FOLLOWUP_LOTE_MAX} e o intervalo
    sorteado entre mensagens. O que muda é a fila se reabastecer. O risco de
    encurtar é incomodar o proprietário, não queimar o número; a escala
    acelera onde a resposta acontece e desacelera onde vira insistência. */
export const FOLLOWUP_DIAS_POR_TENTATIVA = [7, 14, 30] as const;

/** A espera antes da PRÓXIMA cutucada, dado quantas tentativas o imóvel já
    acumulou. Sem tentativa registrada não há o que esperar (o caso mais
    esquecido de todos entra na hora); da última faixa em diante o intervalo
    para de crescer, mas {@link FOLLOWUP_MAX_TENTATIVAS} já encerra antes. */
export function diasDesdeUltimoContato(tentativasFeitas: number): number {
  const i = Math.max(0, tentativasFeitas - 1);
  return FOLLOWUP_DIAS_POR_TENTATIVA[Math.min(i, FOLLOWUP_DIAS_POR_TENTATIVA.length - 1)];
}

/** Tentativas acumuladas que encerram a insistência. Da quinta em diante
    não é follow-up, é perseguição — e o proprietário bloqueia, o que
    machuca a reputação do número muito mais do que a mensagem ajudaria. */
export const FOLLOWUP_MAX_TENTATIVAS = 4;

/** Intervalo entre um envio e o próximo, sorteado nesta faixa. O sorteio
    importa tanto quanto a espera: cadência exata de N em N segundos é
    assinatura de bot. */
export const FOLLOWUP_INTERVALO_MIN_MS = 30_000;
export const FOLLOWUP_INTERVALO_MAX_MS = 60_000;

/** Canal registrado nas tentativas criadas pelo lote (um de FORMAS_ABORDAGEM). */
export const FOLLOWUP_CANAL = "WhatsApp";

/** Status que o lote de SEGUIMENTO atende — os dois em que o proprietário
    simplesmente não respondeu.

    "Perdido" e "Cancelado" também são terminais e ficam de fora: são saídas
    DELIBERADAS — o proprietário disse não, ou o negócio caiu. Cutucar quem
    recusou é outro produto.

    **"Novo contato" entrou depois, e a razão é medida.** O lote atendia só
    "Sem resposta", partindo de que o primeiro contato sem retorno viraria
    "Sem resposta" em algum momento. Não vira: nada move esse status sozinho —
    `confirmarResultadoTentativa` marca o desfecho da TENTATIVA e não toca no
    imóvel, então confirmar "não respondeu" no nudge o deixa exatamente onde
    estava. Na carteira real de 27/07/2026 isso prendia 68 imóveis num beco:
    primeira mensagem enviada, silêncio, e invisíveis para a única ferramenta
    que existe para esse caso — 28 deles cruzando os 14 dias na semana
    seguinte. "Novo contato" não é saída de ninguém; é silêncio. */
export const FOLLOWUP_STATUS_ALVO = ["Sem resposta", "Novo contato"] as const;

/** Público do lote de DISPONIBILIDADE: imóveis já captados que seguem sem
    locar. Mesmos valores de STATUS_STALE_LENTO, com nome próprio porque a
    intenção aqui é outra — confirmar disponibilidade, não medir "parado". */
export const DISPONIBILIDADE_STATUS_ALVO = ["Angariado", "Publicado"] as const;

/** Modelo do sistema usado quando a abordagem escolhida não tem roteiro.
    É o texto escrito exatamente para este caso ("tentei falar com você há
    alguns dias, mas não consegui retorno"). */
const MODELO_PADRAO = "retomada-contato";

export type MotivoExclusao =
  | "sem-telefone"
  | "numero-invalido"
  | "contato-recente"
  | "tentativas-demais"
  // Só do lote de disponibilidade: já perguntamos há pouco (dentro da mesma
  // cadência do lembrete). Distinto de "contato-recente" só na redação.
  | "confirmado-recente"
  | "mesmo-proprietario";

export interface ExcluidoFollowUp {
  imovel: Imovel;
  motivo: MotivoExclusao;
  /** Complemento em pt-BR para a UI ("há 3 dias", "6 tentativas"). */
  detalhe: string;
}

export interface SelecaoFollowUp {
  /** Elegíveis, do contato mais antigo para o mais recente — quem está
      esperando há mais tempo aparece primeiro. Pode passar do limite; a UI
      pré-marca só até `limite`. */
  elegiveis: Imovel[];
  /** Quem ficou de fora e por quê. Aparece na tela: um lote que "achou 3"
      sem explicar os outros 40 parece quebrado. */
  excluidos: ExcluidoFollowUp[];
  /** Quantos ainda cabem hoje: o menor entre o lote e o que sobrou do teto. */
  limite: number;
  /** Envios do lote já feitos hoje (0 quando o teto está intacto). */
  enviadosHoje: number;
}

const TEXTO_MOTIVO: Record<MotivoExclusao, string> = {
  "sem-telefone": "Sem telefone cadastrado",
  "numero-invalido": "Telefone fora do formato de celular",
  "contato-recente": "Falou com você há pouco tempo",
  "tentativas-demais": "Já recebeu tentativas demais",
  "confirmado-recente": "Você já falou com este proprietário há pouco",
  "mesmo-proprietario": "Mesmo proprietário de outro imóvel do lote",
};

export function textoMotivoExclusao(motivo: MotivoExclusao): string {
  return TEXTO_MOTIVO[motivo];
}

/** Dia de uma tentativa ("2026-07-21T14:30" -> "2026-07-21").
    O `data` da tentativa é datetime; `parseDate` só entende a data pura. */
function diaDaTentativa(t: Tentativa): string {
  return (t.data || "").slice(0, 10);
}

/** Data (YYYY-MM-DD) do contato mais recente com o proprietário, de
    qualquer canal. null quando não há tentativa registrada. */
export function ultimoContatoISO(imovel: Imovel): string | null {
  const tentativas = imovel.tentativas || [];
  let maior: string | null = null;
  for (const t of tentativas) {
    const dia = diaDaTentativa(t);
    if (!dia) continue;
    if (!maior || dia > maior) maior = dia;
  }
  return maior;
}

/** Quantos follow-ups do lote já saíram hoje.
    Contamos as tentativas de HOJE no canal do lote — é o rastro que ele
    deixa. Uma tentativa por WhatsApp registrada à mão entra na conta junto,
    e tudo bem: o erro cai para o lado de enviar de menos, que é o lado
    seguro. Precisão maior exigiria marcar a tentativa com um campo novo,
    e o teto não merece uma migração de schema. */
export function enviadosFollowUpHoje(imoveis: Imovel[], hoje: string): number {
  let total = 0;
  for (const imovel of imoveis) {
    for (const t of imovel.tentativas || []) {
      if (diaDaTentativa(t) === hoje && t.canal === FOLLOWUP_CANAL) total++;
    }
  }
  return total;
}

/* --- Um proprietário, uma mensagem ------------------------------------------
   O lote é montado imóvel a imóvel, mas quem recebe é PESSOA. Um proprietário
   com quatro imóveis parados em "Sem resposta" — o galpão que ele aceita
   dividir em salas, os três apartamentos que ele pôs para alugar de uma vez —
   levaria quatro mensagens quase iguais no mesmo número, dentro de três
   minutos. Do lado de lá isso não parece follow-up: parece robô, e é
   exatamente o comportamento que derruba o número da imobiliária.

   Nenhum dos outros freios pega esse caso, e por um detalhe fácil de não ver:
   todos leem as tentativas DAQUELE imóvel. Quatro imóveis têm quatro
   históricos separados, então "falou há menos de 14 dias" e "já acumulou 4
   tentativas" olham cada um deles e não veem nada de errado.

   O corte roda DEPOIS da ordenação, então quem fica é quem está esperando há
   mais tempo. Os outros não somem: viram exclusão explicada, e voltam a ser
   elegíveis na próxima rodada — quando aí sim o corte de 14 dias vai valer
   para eles, porque a tentativa registrada agora é do mesmo proprietário. */

/** Identidade do destinatário. Usa a MESMA forma canônica do webhook (DDD +
    assinante sem o nono dígito), senão "(43) 99802-4316" e "43 9802-4316"
    passariam por pessoas diferentes. Sem forma canônica, cai nos dígitos
    crus: agrupa só o que for idêntico, que é o lado seguro do erro —
    juntar dois proprietários distintos calaria um follow-up devido. */
function chaveProprietario(telefone: string): string {
  return telefoneCanonico(telefone) || telefone.replace(/\D/g, "");
}

/** Como o imóvel que ficou aparece na explicação de quem saiu. */
function rotuloCurto(imovel: Imovel): string {
  return (imovel.codigo || "").trim() || (imovel.endereco || "").trim() || "outro imóvel";
}

/** Monta o público do lote: quem entra, quem fica de fora e por quê. */
export function selecionarFollowUp(imoveis: Imovel[], hoje: string): SelecaoFollowUp {
  const elegiveis: Imovel[] = [];
  const excluidos: ExcluidoFollowUp[] = [];

  for (const imovel of imoveis) {
    if (!(FOLLOWUP_STATUS_ALVO as readonly string[]).includes(imovel.status)) continue;

    // Telefone: os dois testes são de FORMA e rodam aqui de propósito, para
    // a tela já mostrar o problema. Se o número existe mesmo no WhatsApp,
    // só a Evolution sabe — ela responde no envio.
    const telefone = (imovel.proprietarioTelefone || "").trim();
    if (!telefone) {
      excluidos.push({ imovel, motivo: "sem-telefone", detalhe: "" });
      continue;
    }
    if (!numeroEvolution(telefone)) {
      excluidos.push({ imovel, motivo: "numero-invalido", detalhe: telefone });
      continue;
    }

    const tentativas = imovel.tentativas || [];
    if (tentativas.length >= FOLLOWUP_MAX_TENTATIVAS) {
      excluidos.push({
        imovel,
        motivo: "tentativas-demais",
        detalhe: `${tentativas.length} tentativas`,
      });
      continue;
    }

    const ultimo = ultimoContatoISO(imovel);
    const dias = ultimo ? daysBetween(ultimo, hoje) : null;
    if (dias !== null && dias < diasDesdeUltimoContato(tentativas.length)) {
      excluidos.push({
        imovel,
        motivo: "contato-recente",
        detalhe: dias <= 0 ? "hoje" : dias === 1 ? "ontem" : `há ${dias} dias`,
      });
      continue;
    }

    elegiveis.push(imovel);
  }

  // Quem espera há mais tempo primeiro. Sem contato registrado vai na
  // frente (o caso mais esquecido de todos).
  elegiveis.sort((a, b) => {
    const ua = ultimoContatoISO(a) || "";
    const ub = ultimoContatoISO(b) || "";
    if (ua === ub) return 0;
    return ua < ub ? -1 : 1;
  });

  // Um proprietário, uma mensagem (ver o bloco acima). Depois da ordenação:
  // fica quem espera há mais tempo, os demais viram exclusão explicada.
  const porProprietario = new Map<string, Imovel>();
  const unicos: Imovel[] = [];
  for (const imovel of elegiveis) {
    const chave = chaveProprietario(imovel.proprietarioTelefone || "");
    const jaTem = porProprietario.get(chave);
    if (jaTem) {
      excluidos.push({
        imovel,
        motivo: "mesmo-proprietario",
        detalhe: `já entrou por ${rotuloCurto(jaTem)}`,
      });
      continue;
    }
    porProprietario.set(chave, imovel);
    unicos.push(imovel);
  }

  const enviadosHoje = enviadosFollowUpHoje(imoveis, hoje);
  const restante = Math.max(0, FOLLOWUP_TETO_DIA - enviadosHoje);
  return {
    elegiveis: unicos,
    excluidos,
    limite: Math.min(FOLLOWUP_LOTE_MAX, restante),
    enviadosHoje,
  };
}

/* --- Lote de disponibilidade ------------------------------------------------
   O outro público: imóveis já captados (Angariado/Publicado) que seguem sem
   locar há um tempo, para confirmar se ainda estão disponíveis. Reaproveita
   TODOS os freios anti-spam do lote de seguimento — a diferença é o público e
   a cadência.

   Duas escolhas de desenho que separam este lote do de "Sem resposta":

   - NÃO tem o corte de "tentativas demais". Um imóvel anunciado por um ano é
     legitimamente perguntado várias vezes; parar na 4ª deixaria de confirmar
     justo os que ficaram mais tempo no mercado. Quem segura a insistência aqui
     é a JANELA de recência, não uma contagem.
   - A janela de recência é a mesma cadência do lembrete (VERIFICACAO_
     DISPONIBILIDADE_DIAS, 60 dias), não os 14 do seguimento: confirmar
     disponibilidade é uma cutucada de ciclo longo, não de perseguição. Assim
     cada proprietário entra no máximo uma vez por ciclo, mesmo que fique meses
     anunciado — e o registro da tentativa (canal WhatsApp) é o que o exclui da
     rodada seguinte, igual ao outro lote. */
export function selecionarVerificacaoDisponibilidade(imoveis: Imovel[], hoje: string): SelecaoFollowUp {
  const elegiveis: Imovel[] = [];
  const excluidos: ExcluidoFollowUp[] = [];
  const alvo: readonly string[] = DISPONIBILIDADE_STATUS_ALVO;

  for (const imovel of imoveis) {
    if (!alvo.includes(imovel.status)) continue;
    // Follow-up pausado pelo corretor (viagem do proprietário, etc.): respeita.
    if (isPausado(imovel)) continue;

    // Só cutuca depois de um tempo anunciado. Sem data de angariação no
    // histórico (dado antigo/corrompido) fica de fora sem alarde — não é algo
    // que o corretor resolve nesta tela.
    const desdeAngariado = dataAngariadoEfetiva(imovel);
    if (!desdeAngariado) continue;
    const diasAngariado = daysBetween(desdeAngariado, hoje);
    if (diasAngariado === null || diasAngariado < VERIFICACAO_DISPONIBILIDADE_DIAS) continue;

    const telefone = (imovel.proprietarioTelefone || "").trim();
    if (!telefone) {
      excluidos.push({ imovel, motivo: "sem-telefone", detalhe: "" });
      continue;
    }
    if (!numeroEvolution(telefone)) {
      excluidos.push({ imovel, motivo: "numero-invalido", detalhe: telefone });
      continue;
    }

    // Já falamos há pouco (qualquer canal): não pergunta de novo dentro do
    // ciclo. É o freio que substitui o "tentativas demais" aqui.
    const ultimo = ultimoContatoISO(imovel);
    const dias = ultimo ? daysBetween(ultimo, hoje) : null;
    if (dias !== null && dias < VERIFICACAO_DISPONIBILIDADE_DIAS) {
      excluidos.push({
        imovel,
        motivo: "confirmado-recente",
        detalhe: dias <= 0 ? "hoje" : dias === 1 ? "ontem" : `há ${dias} dias`,
      });
      continue;
    }

    elegiveis.push(imovel);
  }

  // Quem está esperando confirmação há mais tempo primeiro. Base: o último
  // contato ou, sem nenhum, a data da angariação.
  elegiveis.sort((a, b) => {
    const ua = ultimoContatoISO(a) || dataAngariadoEfetiva(a) || "";
    const ub = ultimoContatoISO(b) || dataAngariadoEfetiva(b) || "";
    if (ua === ub) return 0;
    return ua < ub ? -1 : 1;
  });

  // Uma mensagem por proprietário — mesma regra e mesma chave canônica do outro
  // lote (o dono do galpão desdobrado em salas não leva quatro mensagens).
  const porProprietario = new Map<string, Imovel>();
  const unicos: Imovel[] = [];
  for (const imovel of elegiveis) {
    const chave = chaveProprietario(imovel.proprietarioTelefone || "");
    const jaTem = porProprietario.get(chave);
    if (jaTem) {
      excluidos.push({ imovel, motivo: "mesmo-proprietario", detalhe: `já entrou por ${rotuloCurto(jaTem)}` });
      continue;
    }
    porProprietario.set(chave, imovel);
    unicos.push(imovel);
  }

  // Teto do dia COMPARTILHADO com o outro lote: é a mesma instância e a mesma
  // conta, então o que protege o número é o total de envios do dia, não o tipo.
  const enviadosHoje = enviadosFollowUpHoje(imoveis, hoje);
  const restante = Math.max(0, FOLLOWUP_TETO_DIA - enviadosHoje);
  return {
    elegiveis: unicos,
    excluidos,
    limite: Math.min(FOLLOWUP_LOTE_MAX, restante),
    enviadosHoje,
  };
}

/* --- Texto ------------------------------------------------------------------
   A abordagem escolhida é ao mesmo tempo o que SAI (o roteiro) e o que fica
   REGISTRADO (o abordagemId da tentativa). Um seletor só, porque dois
   permitiriam divergir "o que eu disse" de "o que eu anotei que disse" — e o
   ranking de abordagens passaria a medir ficção. */

/** Imóvel de mentira cujos dados são os próprios marcadores. Serve para
    arrancar de `mensagemWhatsapp` um texto BASE (com {nome}/{endereco}) em
    vez de um texto já preenchido para um proprietário específico — o modelo
    do sistema é escrito para um imóvel, e o lote precisa de um molde.
    `bairro` vazio de propósito: senão a referência sairia "({endereco}, )". */
const IMOVEL_MOLDE: Imovel = {
  id: "",
  endereco: "{endereco}",
  bairro: "",
  proprietarioNome: "{nome}",
  status: FOLLOWUP_STATUS_ALVO[0],
};

/** Texto base do lote a partir da abordagem — um MOLDE, com marcadores, não
    a mensagem final de ninguém. Sem roteiro, cai no modelo do sistema
    escrito para o caso. */
export function textoBaseFollowUp(abordagem: Abordagem | null): string {
  const roteiro = (abordagem?.roteiro || "").trim();
  return roteiro || mensagemWhatsapp(MODELO_PADRAO, IMOVEL_MOLDE);
}

/** Modelo do sistema usado no lote de disponibilidade — a mensagem escrita
    para "seu imóvel ainda está disponível?". */
const MODELO_DISPONIBILIDADE = "confirmacao-disponibilidade";

/** Texto base do lote de disponibilidade — o mesmo MOLDE com {nome}/{endereco}.
    Diferente do seguimento, aqui não há seletor de abordagem: confirmar
    disponibilidade não é roteiro de captação e não entra no ranking. */
export function textoBaseDisponibilidade(): string {
  return mensagemWhatsapp(MODELO_DISPONIBILIDADE, IMOVEL_MOLDE);
}

/** O texto base preenchido para um proprietário ({nome}, {endereco}). */
export function textoFollowUp(base: string, imovel: Imovel): string {
  return aplicarModeloUsuario(base, imovel);
}

/** Aviso quando o texto base não personaliza nada.
    Sem `{nome}`, as dez mensagens saem byte a byte idênticas — a assinatura
    de spam mais forte que existe, e justamente a que o resto do módulo tenta
    evitar. Avisa, não bloqueia: o corretor pode ter escrito um texto que
    cita o nome de outro jeito. */
export function avisoTextoLote(base: string): string | null {
  if (base.includes("{nome}")) return null;
  return "Este texto não usa {nome}: todas as mensagens sairão idênticas, o que aumenta o risco de o WhatsApp marcar o envio como spam. Use o marcador {nome} para personalizar.";
}

/** Falhas que não são do número, e sim do ambiente: vão se repetir
    igualzinho nos nove imóveis seguintes. Diante de uma delas a fila para na
    hora — insistir gastaria sete minutos para produzir dez vezes o mesmo
    erro. As demais (`sem-whatsapp`, `numero-invalido`...) são do contato da
    vez e não dizem nada sobre o próximo, então a fila segue. */
const FALHAS_FATAIS: readonly FalhaEnvio[] = [
  "nao-configurado",
  // Conta sem número próprio: os nove seguintes falhariam igual, porque a
  // falta é da conta e não do contato.
  "sem-instancia",
  "sem-permissao",
  "instancia-desconectada",
  "sessao-expirada",
];

export function falhaEncerraLote(falha: FalhaEnvio | undefined): boolean {
  return !!falha && FALHAS_FATAIS.includes(falha);
}

/** Falhas que dizem algo sobre o TELEFONE do proprietário — o cadastro está
    errado, ou aquele número não tem WhatsApp. São as únicas em que faz sentido
    oferecer "corrigir o telefone" ou encerrar o imóvel por
    {@link MOTIVO_PERDA_NUMERO_NAO_ENCONTRADO}.

    As demais (instância caída, Evolution fora do ar, sessão expirada) não
    falam do proprietário: oferecer perda ali daria como Perdido um imóvel
    porque o NOSSO servidor teve um mau minuto. */
const FALHAS_DO_NUMERO: readonly FalhaEnvio[] = ["sem-telefone", "numero-invalido", "sem-whatsapp"];

export function falhaEhDoNumero(falha: FalhaEnvio | undefined): boolean {
  return !!falha && FALHAS_DO_NUMERO.includes(falha);
}

/** Sorteia o intervalo até o próximo envio. Recebe o sorteio de fora
    (0–1) para o módulo continuar puro e o teste ser determinístico. */
export function intervaloFollowUpMs(sorteio: number): number {
  const faixa = FOLLOWUP_INTERVALO_MAX_MS - FOLLOWUP_INTERVALO_MIN_MS;
  const limitado = Math.min(1, Math.max(0, sorteio));
  return Math.round(FOLLOWUP_INTERVALO_MIN_MS + limitado * faixa);
}

/** Resumo de uma rodada, para o toast único do fim.
    Um toast por envio seria insuportável: o corretor segue prospectando
    enquanto a fila roda, e dez "Tentativa registrada" pipocando por cima do
    formulário que ele está preenchendo tornariam a feature inutilizável. */
export type FimDeLote = "concluido" | "cancelado" | "interrompido";

export function resumoLote(enviados: number, falhas: number, fim: FimDeLote): string {
  const partes: string[] = [];
  partes.push(enviados === 1 ? "1 mensagem enviada" : `${enviados} mensagens enviadas`);
  if (falhas > 0) partes.push(falhas === 1 ? "1 falhou" : `${falhas} falharam`);
  const texto = partes.join(", ") + ".";
  if (fim === "cancelado") return `Envio cancelado: ${texto.charAt(0).toLowerCase()}${texto.slice(1)}`;
  if (fim === "interrompido")
    return `Envio interrompido — o problema afetaria todos os envios seguintes: ${texto.charAt(0).toLowerCase()}${texto.slice(1)}`;
  return texto;
}
