/* ================================================================
   MUTAÇÕES
   Todas as escritas no Supabase do app vivem aqui. Port literal das
   funções saveImovel/deleteImovel/saveMeta/saveAgenda/deleteAgenda/
   toggleAgendaDone/confirmarConclusaoVerificacao/saveConfig do
   app.js (seções 6A, 5C, 5D e 8).

   Ordem preservada do app antigo: escreve no Supabase primeiro e só
   então atualiza o estado local; em falha, mostra o toast e o estado
   local não muda — a UI nunca fica dessincronizada do banco.

   Invariante do statusHistory (§3.1 do MIGRATION_NEXT.md): toda
   mudança de status passa por `aplicarMudancaDeStatus`, o único
   ponto que empurra {status, date} no histórico.
   ================================================================ */
import {
  ABORDAGEM_ANALISE_ANUNCIO,
  MOTIVO_PERDA_NUMERO_NAO_ENCONTRADO,
  type ResultadoTentativa,
  ROTEIRO_ANALISE_ANUNCIO,
  VERIFICACAO_DISPONIBILIDADE_DIAS,
} from "./constantes";
import { addDaysISO, agoraISOComHora, agoraISOComSegundos, currentMonthKey, todayISO } from "./datas";
import { ehTentativaDuplicada } from "./calculo/abordagens";
import { celebracaoAoSalvar } from "./calculo/celebracao";
import {
  type EspecificacaoUnidade,
  motivoNaoPodeDesdobrar,
  textoNotaDesdobramento,
  unidadeDesdobrada,
} from "./calculo/desdobramento";
import { deveTerVerificacaoAberta } from "./calculo/followup";
import { dataAngariadoEfetiva, historicoComStatus } from "./calculo/motor";
import { eventosNaoLidos, notaDaMensagemEnviada } from "./calculo/notas";
import { useCelebracao } from "./celebracao";
import { MAX_PROTOCOLO_CHARS } from "./calculo/ia";
import { ehTipoProtocolo } from "./protocolos";
import { toDbAbordagem, toDbAgenda, toDbAnuncioCentralVisualizado, toDbImovel, toDbProtocolo } from "./persistencia/mapeadores";
import { sincronizarCompromisso } from "./googleAgenda";
import { getSupabase } from "./persistencia/supabase";
import { useAppStore } from "./store";
import { toast } from "./toast";
import type { Abordagem, AgendaItem, AnuncioCentralVisualizado, Imovel, Meta, NotaImovel, Protocolo, Tentativa, UserConfig, WhatsappModelo } from "./tipos";

export function uid(): string {
  return crypto.randomUUID();
}

export function numOrNull(v: string | number | null | undefined): number | null {
  if (v === "" || v === undefined || v === null) return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

export async function marcarAnuncioCentralComoVisualizado(
  anuncio: Pick<AnuncioCentralVisualizado, "portal" | "idExterno" | "url">,
  userId: string,
): Promise<void> {
  const { error } = await getSupabase()
    .from("central_anuncios_visualizados")
    .upsert(toDbAnuncioCentralVisualizado(anuncio, userId), { onConflict: "user_id,portal,id_externo" });
  if (error) throw error;
}

/**
 * Único ponto de mudança de status DO LADO DO CLIENTE: registra a transição no
 * histórico (para cálculo de tempo médio e "dias parado").
 *
 * A regra em si mora em `calculo/motor.ts` (`historicoComStatus`), porque o
 * webhook do WhatsApp também encerra imóvel e não pode importar este arquivo
 * (store + cliente do Supabase). Aqui fica só o açúcar que os modais usam.
 */
export function aplicarMudancaDeStatus(
  imovel: Imovel,
  novoStatus: string,
  statusAnterior: string | null,
  userId?: string,
): void {
  imovel.statusHistory = historicoComStatus(
    imovel.statusHistory,
    novoStatus,
    statusAnterior,
    todayISO(),
    userId ? { userId, source: "usuario" } : {},
  );
}

interface ResultadoSalvarImovel {
  ok: boolean;
  criado: boolean;
}

/**
 * Cria ou atualiza um imóvel, com os efeitos colaterais de agenda do
 * app antigo: lembrete de retomada ao pausar, lembrete automático de
 * "verificar disponibilidade" ao angariar, e cancelamento desses
 * lembretes ao locar.
 */
export async function salvarImovel(
  data: Imovel,
  userId: string,
  criarLembretePausa: boolean,
): Promise<ResultadoSalvarImovel> {
  const supabase = getSupabase();
  const { imoveis, agenda, metas } = useAppStore.getState();
  const existing = imoveis.find((i) => i.id === data.id) || null;

  // Rede de segurança dos históricos jsonb. O upsert abaixo grava a linha
  // INTEIRA, então um chamador que monte o Imovel campo a campo e esqueça de
  // carregar `notas`/`tentativas` apaga o histórico no banco — sem erro, sem
  // toast, sem nada na tela. Foi o que aconteceu com as tentativas: o modal de
  // imóvel preservava as notas (com direito a comentário explicando o risco) e
  // as tentativas, criadas depois, nunca entraram na lista.
  //
  // Aqui só o `undefined` é reposto: quem passa `[]` está dizendo "vazio", e
  // esvaziar de fato é trabalho das mutações próprias de cada histórico, que
  // usam update parcial da coluna.
  if (existing) {
    if (data.notas === undefined) data.notas = existing.notas || [];
    if (data.tentativas === undefined) data.tentativas = existing.tentativas || [];

    /* A MESMA rede, agora para os fatos que vêm do Sistema Principal.
       O risco é idêntico e o estrago é pior. Estes campos não são digitados
       em formulário nenhum — chegam pela rota `/api/sophia/eventos` —, então
       nenhum modal os monta, e o upsert acima os gravaria como null a cada
       vez que o corretor abrisse o imóvel para corrigir um telefone. O painel
       perderia a data da assinatura e o número do contrato em silêncio, e a
       única forma de recuperá-los seria pedir o reenvio do evento ao outro
       sistema.

       `undefined` só, como acima: quem passa null está dizendo "apaga", e
       isso é legítimo (o corretor desmarcando a comissão recebida à mão).
       Quem simplesmente não conhece o campo é reposto. */
    if (data.autorizacaoAssinadaEm === undefined) data.autorizacaoAssinadaEm = existing.autorizacaoAssinadaEm;
    if (data.autorizacaoResponsavel === undefined) data.autorizacaoResponsavel = existing.autorizacaoResponsavel;
    if (data.locadoEm === undefined) data.locadoEm = existing.locadoEm;
    if (data.contratoNumero === undefined) data.contratoNumero = existing.contratoNumero;
    if (data.comissaoFormaPagamento === undefined) data.comissaoFormaPagamento = existing.comissaoFormaPagamento;
    if (data.comissaoObservacao === undefined) data.comissaoObservacao = existing.comissaoObservacao;

    /* E a mesma rede para o texto do anúncio garimpado. Ele é gravado UMA vez,
       no pré-cadastro, e nunca mais aparece em formulário nenhum — o
       ModalImovel não o monta. Sem esta linha, confirmar o pré-cadastro no
       modal completo (que é o passo seguinte do fluxo, não um caso raro)
       apagaria o texto no mesmo minuto em que ele foi capturado, e com ele os
       m², o andar e a mobília que o gerador de anúncio usa. */
    if (data.textoAnuncio === undefined) data.textoAnuncio = existing.textoAnuncio;
  }

  // Se foi definida uma data de retomada e a pessoa pediu lembrete,
  // cria automaticamente um compromisso de follow-up na agenda —
  // evita ter que cadastrar a mesma informação duas vezes.
  let novoLembrete: AgendaItem | null = null;
  if (data.pausadoAte && criarLembretePausa) {
    const jaExiste = agenda.some(
      (a) => a.imovelId === data.id && a.date === data.pausadoAte && a.type === "Follow-up" && !a.done,
    );
    if (!jaExiste) {
      novoLembrete = {
        id: uid(),
        title: `Retomar contato — ${data.codigo || data.endereco}`,
        type: "Follow-up",
        date: data.pausadoAte,
        imovelId: data.id,
        notes: "Criado automaticamente ao pausar o follow-up deste imóvel.",
        done: false,
        isVerificacaoDisponibilidade: false,
      };
    }
  }

  // Lembrete automático de "verificar disponibilidade": enquanto o imóvel está
  // captado e sem locar, agenda um lembrete VERIFICACAO_DISPONIBILIDADE_DIAS
  // dias depois da angariação. Saiu desse estado — locou, foi perdido,
  // cancelado —, qualquer lembrete em aberto é cancelado.
  //
  // Quem decide é `deveTerVerificacaoAberta`, sobre o status ATUAL. Ver o
  // comentário dela: a versão anterior cancelava só em "Locado" e criava por
  // `foiAngariado()`, que lê o histórico e nunca deixa de ser verdade — a
  // combinação que deixou o LD-123 cobrando disponibilidade depois de ter sido
  // dado como perdido, e que podia agendar lembrete NOVO ao encerrar um imóvel.
  let novaVerificacao: AgendaItem | null = null;
  let verificacoesACancelar: AgendaItem[] = [];
  const verificacoesAbertas = agenda.filter(
    (a) => a.imovelId === data.id && a.isVerificacaoDisponibilidade && !a.done,
  );
  if (!deveTerVerificacaoAberta(data.status)) {
    verificacoesACancelar = verificacoesAbertas;
  } else if (verificacoesAbertas.length === 0) {
    const dataBase = dataAngariadoEfetiva(data) || todayISO();
    novaVerificacao = {
      id: uid(),
      title: `Verificar disponibilidade — ${data.codigo || data.endereco}`,
      type: "Follow-up",
      date: addDaysISO(dataBase, VERIFICACAO_DISPONIBILIDADE_DIAS) as string,
      imovelId: data.id,
      notes: "Lembrete automático: imóvel angariado sem locação após 60 dias. Confirme com o proprietário se ainda está disponível.",
      done: false,
      isVerificacaoDisponibilidade: true,
    };
  }

  // Atenção: o upsert grava a linha inteira, incluindo as colunas jsonb
  // (`notas`, `tentativas`, `status_history`) do objeto em memória — por isso
  // as mutações desses históricos usam update parcial da coluna, e por isso
  // quem monta um Imovel para salvar precisa CARREGAR os históricos que não
  // edita. Omitir um deles não dá erro: salva "com sucesso" e apaga o dado.
  const { error } = await supabase.from("imoveis").upsert(toDbImovel(data, userId));
  if (error) {
    toast("Não foi possível salvar: " + error.message, "error");
    return { ok: false, criado: false };
  }

  let novaAgenda = agenda;
  if (novoLembrete && (await inserirCompromisso(supabase, novoLembrete, userId))) {
    novaAgenda = [...novaAgenda, novoLembrete];
  }
  if (novaVerificacao && (await inserirCompromisso(supabase, novaVerificacao, userId))) {
    novaAgenda = [...novaAgenda, novaVerificacao];
  }
  if (verificacoesACancelar.length > 0) {
    const ids = verificacoesACancelar.map((a) => a.id);
    const { error: cancelErr } = await supabase.from("agenda").delete().in("id", ids);
    if (!cancelErr) novaAgenda = novaAgenda.filter((a) => !ids.includes(a.id));
  }
  if (novaAgenda !== agenda) useAppStore.getState().setAgenda(novaAgenda);

  const imoveisDepois = existing
    ? imoveis.map((i) => (i.id === data.id ? data : i))
    : [...imoveis, data];
  useAppStore.getState().setImoveis(imoveisDepois);
  toast(existing ? "Imóvel atualizado." : "Imóvel cadastrado com sucesso.");

  // Parabéns pelo que acabou de acontecer — angariação nova ou meta do mês
  // fechada. Vai DEPOIS da escrita e da atualização do estado: comemorar algo
  // que o Supabase recusou seria mentir para o corretor. As listas antes/depois
  // vão inteiras para o cálculo puro decidir se houve cruzamento.
  const festa = celebracaoAoSalvar(existing, data, imoveis, imoveisDepois, metas, currentMonthKey());
  if (festa) useCelebracao.getState().comemorar(festa);

  return { ok: true, criado: !existing };
}

/**
 * Acrescenta uma nota ao histórico de interações do imóvel. Usa update
 * PARCIAL (só a coluna `notas`, como o alternarAgendaDone faz com `done`)
 * para não reescrever a linha inteira e não competir com uma edição do
 * imóvel aberta em paralelo.
 */
export async function adicionarNotaImovel(imovelId: string, texto: string): Promise<boolean> {
  const { imoveis, setImoveis } = useAppStore.getState();
  const imovel = imoveis.find((i) => i.id === imovelId);
  const textoLimpo = texto.trim();
  if (!imovel || !textoLimpo) return false;

  const nota: NotaImovel = { id: uid(), texto: textoLimpo, data: agoraISOComHora() };
  const novasNotas = [...(imovel.notas || []), nota];

  const { error } = await getSupabase().from("imoveis").update({ notas: novasNotas }).eq("id", imovelId);
  if (error) {
    toast("Não foi possível salvar a nota: " + error.message, "error");
    return false;
  }
  setImoveis(imoveis.map((i) => (i.id === imovelId ? { ...i, notas: novasNotas } : i)));
  toast("Nota adicionada.");
  return true;
}

/** Registra a saída aberta por wa.me somente depois de o corretor afirmar que
    apertou Enviar. Copiar ou apenas abrir a conversa nunca chama esta função. */
export async function registrarMensagemEnviadaManual(
  imovelId: string,
  userId: string,
  texto: string,
  confirmacaoVisita?: NotaImovel["confirmacaoVisita"],
): Promise<boolean> {
  const { imoveis, setImoveis } = useAppStore.getState();
  const imovel = imoveis.find((i) => i.id === imovelId);
  const textoLimpo = texto.trim();
  if (!imovel || !textoLimpo) return false;

  const nota = notaDaMensagemEnviada(
    `manual:${uid()}`,
    textoLimpo,
    agoraISOComSegundos(),
    "confirmacao-manual",
    "conversation",
    confirmacaoVisita,
  );
  const { data: gravou, error } = await getSupabase().rpc("registrar_nota_imovel", {
    p_imovel_id: imovelId,
    p_user_id: userId,
    p_nota: nota,
  });
  if (error || gravou !== true) {
    toast("Não foi possível registrar a mensagem enviada." + (error ? ` ${error.message}` : ""), "error");
    return false;
  }
  const novasNotas = [...(imovel.notas || []), nota];
  setImoveis(imoveis.map((i) => (i.id === imovelId ? { ...i, notas: novasNotas } : i)));
  return true;
}

/**
 * Cria as unidades de um imóvel desdobrado (galpão que vira salas comerciais).
 *
 * Escrita ÚNICA: as unidades vão num insert só. Não é economia de rede — é
 * atomicidade. Uma a uma, uma falha no meio deixaria duas salas cadastradas e
 * uma faltando, e o corretor teria que descobrir qual olhando a lista.
 *
 * A nota no principal é o registro do que foi feito e vai por update PARCIAL
 * da coluna (mesma estratégia de `adicionarNotaImovel`): o principal pode
 * estar aberto em edição noutra aba, e um upsert da linha inteira aqui
 * apagaria o que estivesse sendo escrito lá.
 *
 * Falhar a nota não desfaz as unidades: elas são o dado, a nota é o recado.
 */
export async function desdobrarImovel(
  principalId: string,
  specs: EspecificacaoUnidade[],
  userId: string,
): Promise<boolean> {
  const { imoveis, setImoveis } = useAppStore.getState();
  const principal = imoveis.find((i) => i.id === principalId);
  if (!principal || specs.length === 0) return false;

  const motivo = motivoNaoPodeDesdobrar(principal);
  if (motivo) {
    toast(motivo, "error");
    return false;
  }

  const novas = specs.map((spec) => unidadeDesdobrada(principal, spec, uid()));

  const { error } = await getSupabase()
    .from("imoveis")
    .insert(novas.map((u) => toDbImovel(u, userId)));
  if (error) {
    toast("Não foi possível criar as unidades: " + error.message, "error");
    return false;
  }

  const nota: NotaImovel = {
    id: uid(),
    texto: textoNotaDesdobramento(specs),
    data: agoraISOComHora(),
  };
  const novasNotas = [...(principal.notas || []), nota];
  const { error: notaErr } = await getSupabase()
    .from("imoveis")
    .update({ notas: novasNotas })
    .eq("id", principalId);

  setImoveis([
    ...imoveis.map((i) => (i.id === principalId && !notaErr ? { ...i, notas: novasNotas } : i)),
    ...novas,
  ]);
  toast(novas.length === 1 ? "1 unidade criada." : `${novas.length} unidades criadas.`);
  return true;
}

/**
 * Rebusca as 5 tabelas e repopula o store — o mesmo carregamento do login.
 *
 * Existe pela Caixa de respostas: as respostas entram pelo WEBHOOK, no
 * servidor, e o app carrega o estado uma vez por sessão. Sem isto, uma caixa
 * vazia significaria "nada chegou desde que você abriu o painel" enquanto
 * parece dizer "nada chegou" — e o corretor que deixa a aba aberta o dia
 * inteiro nunca veria mensagem nenhuma.
 *
 * Continua existindo depois do Realtime (ver calculo/chegadaResposta.ts), e
 * não por inércia: o socket cai, a aba dorme, a assinatura perde um evento —
 * e recarregar tudo é a única saída que não depende de nada ter dado certo
 * antes. O Realtime tirou dele o papel de ÚNICO caminho, não o de rede.
 */
export async function recarregarEstado(): Promise<boolean> {
  const { carregarEstado } = await import("./persistencia/carregarEstado");
  try {
    useAppStore.getState().setEstado(await carregarEstado());
    return true;
  } catch (e) {
    toast("Não foi possível atualizar: " + (e instanceof Error ? e.message : String(e)), "error");
    return false;
  }
}

type ClasseNotaLida = "resposta" | "evento";

interface ResultadoMarcacaoNotas {
  encontrado: boolean;
  alteradas: number;
  notas: NotaImovel[] | null;
}

function resultadoMarcacaoNotas(valor: unknown): ResultadoMarcacaoNotas | null {
  if (!valor || typeof valor !== "object") return null;
  const resultado = valor as Record<string, unknown>;
  if (
    typeof resultado.encontrado !== "boolean" ||
    typeof resultado.alteradas !== "number" ||
    (resultado.notas !== null && !Array.isArray(resultado.notas))
  ) return null;
  return resultado as unknown as ResultadoMarcacaoNotas;
}

/** Une o retrato confirmado pela RPC com uma eventual nota mais nova que o
    Realtime já entregou enquanto a resposta HTTP ainda estava em trânsito.
    Para ids comuns, o banco vence — é ele que contém o novo `lida: true`. */
function aplicarNotasConfirmadas(imovelId: string, notasBanco: NotaImovel[]): void {
  const { imoveis, setImoveis } = useAppStore.getState();
  const atual = imoveis.find((imovel) => imovel.id === imovelId);
  if (!atual) return;

  const idsBanco = new Set(notasBanco.map((nota) => nota.id));
  const notasConcorrentes = (atual.notas || []).filter((nota) => !idsBanco.has(nota.id));
  const notas = notasConcorrentes.length > 0 ? [...notasBanco, ...notasConcorrentes] : notasBanco;
  setImoveis(imoveis.map((imovel) => (imovel.id === imovelId ? { ...imovel, notas } : imovel)));
}

async function marcarNotasLidasNoBanco(
  imovelId: string,
  classe: ClasseNotaLida,
): Promise<ResultadoMarcacaoNotas | null> {
  const { data, error } = await getSupabase().rpc("marcar_notas_imovel_lidas", {
    p_imovel_id: imovelId,
    p_classe: classe,
  });
  const resultado = resultadoMarcacaoNotas(data);
  if (error || !resultado || !resultado.encontrado || !resultado.notas) {
    toast("Não foi possível marcar como lida: " + (error?.message || "imóvel não encontrado."), "error");
    return null;
  }

  aplicarNotasConfirmadas(imovelId, resultado.notas);
  return resultado;
}

/**
 * Marca como lidas as respostas do proprietário que ainda estão pendentes na
 * Caixa de respostas (calculo/respostas.ts).
 *
 * É a saída MANUAL da caixa, para a mensagem que não vai gerar ação nenhuma
 * ("obrigado", "combinado"). Quem age pelo painel não passa por aqui: a
 * tentativa ou a mudança de status já tiram a resposta da caixa sozinhas.
 *
 * A RPC bloqueia a linha e transforma o JSONB corrente dentro do banco. Ela
 * nunca recebe as notas do store: assim, uma saída registrada pela rota ou uma
 * nova entrada do webhook não pode ser sobrescrita por um retrato antigo.
 *
 * Silencioso por opção: marcar linha a linha na caixa dispararia um toast por
 * clique. Quem confirma é a linha sumindo da lista.
 */
export async function marcarRespostasLidas(imovelId: string, silencioso = false): Promise<boolean> {
  const resultado = await marcarNotasLidasNoBanco(imovelId, "resposta");
  if (!resultado) return false;
  if (!silencioso) toast("Resposta marcada como lida.");
  return true;
}

/**
 * Marca como lidas as respostas pendentes de VÁRIOS imóveis de uma vez —
 * o "limpar a caixa" da view de Respostas.
 *
 * Existe por causa do primeiro uso, e isso não é conveniência: a caixa nasce
 * sobre um backlog que nunca teve tela (na carteira real, 13 imóveis e ~90
 * mensagens no dia em que a feature entrou). Sem uma saída em massa, a
 * primeira abertura mostra tudo, o corretor não consegue distinguir o que
 * chegou HOJE do que está parado há um mês, e a tela morre na estreia — o
 * mesmo fim da faixa de "imóvel parado" no termômetro.
 *
 * Uma RPC por imóvel, sequencial: cada chamada bloqueia somente sua linha e
 * transforma o JSONB corrente. São dezenas de imóveis no pior caso, não
 * milhares.
 *
 * Aplica no estado local só o que o banco aceitou: um erro no meio deixa os
 * anteriores marcados, e é assim que tem que ser — reverter os que deram
 * certo faria a tela discordar do banco.
 */
export async function marcarTodasRespostasLidas(imovelIds: string[]): Promise<number> {
  let marcados = 0;

  for (const id of imovelIds) {
    const resultado = await marcarNotasLidasNoBanco(id, "resposta");
    if (!resultado) break;
    if (resultado.alteradas > 0) marcados += 1;
  }
  return marcados;
}

/**
 * Marca como lidas as notificações do Sistema Principal — de um imóvel, ou de
 * todos quando `imovelId` é null (o "limpar" do sino).
 *
 * Separada de `marcarRespostasLidas` de propósito, apesar da forma parecida:
 * aquela filtra por `ehNotaDeResposta` e esta por `ehNotaDeEvento`, e uma
 * função só com um parâmetro de prefixo faria o "limpar" de uma tela apagar o
 * pendente da outra — o corretor limparia o sino e perderia a marca das
 * respostas que ainda não leu.
 *
 * Sem `confirm` e sem toast por item: diferente da caixa de respostas, aqui
 * marcar como lido não descarta trabalho a fazer. O fato continua no
 * histórico do imóvel, nas colunas e no dashboard — o que se apaga é só o
 * aviso.
 */
export async function marcarEventosLidos(imovelId: string | null): Promise<number> {
  const { imoveis } = useAppStore.getState();
  const alvos = imovelId
    ? imoveis.filter((imovel) => imovel.id === imovelId)
    : imoveis.filter((imovel) => eventosNaoLidos(imovel.notas).length > 0);
  let marcados = 0;

  for (const imovel of alvos) {
    const resultado = await marcarNotasLidasNoBanco(imovel.id, "evento");
    if (!resultado) break;
    if (resultado.alteradas > 0) marcados += 1;
  }
  return marcados;
}

export async function excluirNotaImovel(imovelId: string, notaId: string): Promise<boolean> {
  const { imoveis, setImoveis } = useAppStore.getState();
  const imovel = imoveis.find((i) => i.id === imovelId);
  if (!imovel) return false;
  if (!confirm("Excluir esta nota do histórico?")) return false;

  const novasNotas = (imovel.notas || []).filter((n) => n.id !== notaId);
  const { error } = await getSupabase().from("imoveis").update({ notas: novasNotas }).eq("id", imovelId);
  if (error) {
    toast("Não foi possível excluir a nota: " + error.message, "error");
    return false;
  }
  setImoveis(imoveis.map((i) => (i.id === imovelId ? { ...i, notas: novasNotas } : i)));
  toast("Nota removida.");
  return true;
}

/**
 * Registra uma tentativa de abordagem no imóvel. Mesma estratégia das notas:
 * update PARCIAL da coluna `tentativas`, para não reescrever a linha inteira
 * nem competir com uma edição do imóvel aberta em paralelo.
 *
 * O `resultado` é obrigatório de propósito: uma tentativa sem desfecho não
 * entra no denominador de nada e tornaria o ranking de abordagens otimista
 * (só as que deram certo seriam registradas).
 */
/**
 * Registra uma tentativa de contato.
 *
 * `silencioso` suprime os toasts: o follow-up em lote chama esta função uma
 * vez por imóvel e o corretor segue usando o painel enquanto a fila roda —
 * dez "Tentativa registrada" pipocando por cima do formulário que ele está
 * preenchendo tornariam a feature inutilizável. A fila mostra o progresso no
 * indicador e dá um toast só, de resumo, no fim.
 */
export async function registrarTentativa(
  imovelId: string,
  dados: Omit<Tentativa, "id" | "data">,
  silencioso = false,
): Promise<boolean> {
  const { imoveis, setImoveis } = useAppStore.getState();
  const imovel = imoveis.find((i) => i.id === imovelId);
  if (!imovel) return false;

  const agora = agoraISOComHora();

  /* Mesmo contato registrado duas vezes. O app tem DOIS caminhos de envio — o
     direto pela Evolution e a saída pelo wa.me com "Sim, mandei" — e nada
     impedia que o mesmo contato passasse pelos dois. Foi o caso do LD-176
     (31/07/2026): uma única mensagem enviada, duas tentativas gravadas.

     Devolve `true` de propósito: para quem chamou, registrar já estava feito.
     Devolver `false` faria o ModalWhatsapp tratar como erro e a fila do lote
     contar uma falha que não houve. Ver `ehTentativaDuplicada`. */
  if (ehTentativaDuplicada(imovel, dados, agora)) {
    if (!silencioso) toast("Esta tentativa já estava registrada.");
    return true;
  }

  const tentativa: Tentativa = {
    id: uid(),
    data: agora,
    abordagemId: dados.abordagemId || null,
    // Só grava quando existe: tentativa por abordagem não carrega o campo.
    ...(dados.modeloNome ? { modeloNome: dados.modeloNome } : {}),
    canal: dados.canal || null,
    resultado: dados.resultado,
    observacao: dados.observacao?.trim() || null,
    // Só grava a marca quando ela é verdadeira: a tentativa anotada à mão não
    // carrega a chave, e o nudge não cobra resultado de quem já o afirmou.
    ...(dados.aguardandoResultado ? { aguardandoResultado: true } : {}),
    // Idem: só a fila do lote carrega esta, e é ela que o teto diário conta.
    ...(dados.viaLote ? { viaLote: true } : {}),
  };
  const novasTentativas = [...(imovel.tentativas || []), tentativa];

  // O canal da PRIMEIRA tentativa É a forma de abordagem do imóvel — e o app
  // acabou de descobri-la, então não faz sentido continuar perguntando. Sem
  // isto, mandar um WhatsApp pelo próprio painel e abrir a edição em seguida
  // mostrava "Ligação telefônica" no seletor: o sistema ignorando o que ele
  // mesmo registrou um segundo antes. Pior que o incômodo, o campo alimenta os
  // insights por forma de abordagem — o palpite virava número na tela.
  //
  // Só preenche quando está VAZIO: o valor escolhido pelo corretor manda
  // sempre, e o canal do follow-up nunca reescreve o da abertura.
  const preencherForma = !(imovel.formaAbordagem || "").trim() && !!tentativa.canal;

  const { error } = await getSupabase()
    .from("imoveis")
    // Update parcial, como o resto das mutações de histórico: nunca reescreve a
    // linha inteira (ver o aviso sobre os jsonb no salvarImovel).
    .update({ tentativas: novasTentativas, ...(preencherForma ? { forma_abordagem: tentativa.canal } : {}) })
    .eq("id", imovelId);
  if (error) {
    if (!silencioso) toast("Não foi possível registrar a tentativa: " + error.message, "error");
    return false;
  }
  setImoveis(
    imoveis.map((i) =>
      i.id === imovelId
        ? {
            ...i,
            tentativas: novasTentativas,
            ...(preencherForma ? { formaAbordagem: tentativa.canal } : {}),
          }
        : i,
    ),
  );
  if (!silencioso) toast("Tentativa registrada.");
  return true;
}

export async function excluirTentativa(imovelId: string, tentativaId: string): Promise<boolean> {
  const { imoveis, setImoveis } = useAppStore.getState();
  const imovel = imoveis.find((i) => i.id === imovelId);
  if (!imovel) return false;
  if (!confirm("Excluir esta tentativa do histórico?")) return false;

  const novasTentativas = (imovel.tentativas || []).filter((t) => t.id !== tentativaId);
  const { error } = await getSupabase().from("imoveis").update({ tentativas: novasTentativas }).eq("id", imovelId);
  if (error) {
    toast("Não foi possível excluir a tentativa: " + error.message, "error");
    return false;
  }
  setImoveis(imoveis.map((i) => (i.id === imovelId ? { ...i, tentativas: novasTentativas } : i)));
  toast("Tentativa removida.");
  return true;
}

/**
 * Confirma o desfecho de uma tentativa criada no envio.
 *
 * É o outro lado do `aguardandoResultado`: a tentativa nasceu com um palpite
 * ("sem-resposta") porque no instante do envio ninguém sabia, e aqui o palpite
 * vira fato — a marca sai, e o nudge para de perguntar. Confirmar "sem
 * resposta" também é resposta: o resultado não muda, mas deixa de ser chute.
 */
export async function confirmarResultadoTentativa(
  imovelId: string,
  tentativaId: string,
  resultado: ResultadoTentativa,
): Promise<boolean> {
  const { imoveis, setImoveis } = useAppStore.getState();
  const imovel = imoveis.find((i) => i.id === imovelId);
  if (!imovel) return false;

  const novasTentativas = (imovel.tentativas || []).map((t) =>
    t.id === tentativaId ? { ...t, resultado, aguardandoResultado: false } : t,
  );
  const { error } = await getSupabase().from("imoveis").update({ tentativas: novasTentativas }).eq("id", imovelId);
  if (error) {
    toast("Não foi possível atualizar a tentativa: " + error.message, "error");
    return false;
  }
  setImoveis(imoveis.map((i) => (i.id === imovelId ? { ...i, tentativas: novasTentativas } : i)));
  return true;
}

/**
 * Dá o imóvel por perdido porque o telefone não leva ao proprietário.
 *
 * Atalho do nudge: marcar "número errado" e depois ter de abrir o imóvel,
 * trocar o status e escolher o motivo é trabalho repetido para uma conclusão
 * que já está clara. Quem decide continua sendo o corretor — a confirmação
 * fica na UI, porque número errado NÃO é sinônimo de negócio perdido (o
 * proprietário pode estar acessível por outro caminho).
 *
 * Escreve só as colunas do desfecho, em update parcial. Não passa pelo
 * salvarImovel de propósito: aquele faz upsert da linha inteira, e aqui não há
 * formulário nenhum por trás — seria carregar o objeto inteiro só para mexer
 * em três campos, com todo o risco de apagar histórico que isso traz.
 */
export async function marcarPerdidoNumeroNaoEncontrado(imovelId: string): Promise<boolean> {
  const { imoveis, setImoveis } = useAppStore.getState();
  const imovel = imoveis.find((i) => i.id === imovelId);
  if (!imovel) return false;

  // Cópia do histórico ANTES de aplicar: aplicarMudancaDeStatus empurra no
  // array recebido, e sem copiar mutaríamos o objeto que está no store — o
  // estado local mudaria mesmo se a escrita no Supabase falhasse.
  const alvo: Imovel = { ...imovel, statusHistory: [...(imovel.statusHistory || [])] };
  aplicarMudancaDeStatus(alvo, "Perdido", imovel.status);

  const { error } = await getSupabase()
    .from("imoveis")
    .update({
      status: "Perdido",
      status_history: alvo.statusHistory,
      motivo_perda: MOTIVO_PERDA_NUMERO_NAO_ENCONTRADO,
      motivo_perda_outro: null,
    })
    .eq("id", imovelId);
  if (error) {
    toast("Não foi possível marcar como perdido: " + error.message, "error");
    return false;
  }

  setImoveis(
    imoveis.map((i) =>
      i.id === imovelId
        ? {
            ...i,
            status: "Perdido",
            statusHistory: alvo.statusHistory,
            motivoPerda: MOTIVO_PERDA_NUMERO_NAO_ENCONTRADO,
            motivoPerdaOutro: "",
          }
        : i,
    ),
  );
  return true;
}

/** Cria ou atualiza uma abordagem do catálogo. */
export async function salvarAbordagem(data: Abordagem, userId: string): Promise<boolean> {
  const { abordagens, setAbordagens } = useAppStore.getState();
  const nome = data.nome.trim();
  if (!nome) {
    toast("Dê um nome à abordagem.", "error");
    return false;
  }
  const existente = abordagens.find((a) => a.id === data.id) || null;
  const abordagem: Abordagem = { ...data, nome };

  const { error } = await getSupabase().from("abordagens").upsert(toDbAbordagem(abordagem, userId));
  if (error) {
    toast("Não foi possível salvar a abordagem: " + error.message, "error");
    return false;
  }
  setAbordagens(
    existente ? abordagens.map((a) => (a.id === abordagem.id ? abordagem : a)) : [...abordagens, abordagem],
  );
  toast(existente ? "Abordagem atualizada." : "Abordagem cadastrada.");
  return true;
}

/**
 * Devolve a abordagem que registra as mensagens geradas a partir do anúncio do
 * proprietário, criando-a no catálogo se ainda não existir.
 *
 * Ela precisa existir de verdade porque o ranking só mede `Abordagem` com id
 * estável — sem isso a feature nasceria fora da medição, que era o motivo dela.
 * Criar na primeira geração (e não pedir ao corretor que cadastre antes) é o
 * que faz o ranking ter série desde o primeiro envio.
 *
 * Uma ARQUIVADA serve e é reusada: arquivar tira dos seletores, não invalida o
 * histórico, e criar uma segunda partiria a série em duas justamente para quem
 * arquivou a primeira de propósito.
 */
export async function garantirAbordagemDoAnuncio(userId: string): Promise<Abordagem | null> {
  const { abordagens } = useAppStore.getState();
  const existente = abordagens.find((a) => a.nome.trim() === ABORDAGEM_ANALISE_ANUNCIO);
  if (existente) return existente;

  const nova: Abordagem = {
    id: uid(),
    nome: ABORDAGEM_ANALISE_ANUNCIO,
    roteiro: ROTEIRO_ANALISE_ANUNCIO,
    canalSugerido: "WhatsApp",
    // Vazio: serve a qualquer origem, mas não é o padrão de nenhuma — não pode
    // se autoaplicar no follow-up em lote (ver Abordagem.origens).
    origens: [],
    arquivada: false,
  };
  const ok = await salvarAbordagem(nova, userId);
  return ok ? nova : null;
}

/**
 * Arquiva/desarquiva uma abordagem. Não existe exclusão de propósito: as
 * tentativas antigas referenciam a abordagem pelo id, e apagá-la deixaria o
 * histórico órfão — o ranking perderia a leitura do que já foi feito.
 */
export async function alternarArquivamentoAbordagem(id: string): Promise<boolean> {
  const { abordagens, setAbordagens } = useAppStore.getState();
  const abordagem = abordagens.find((a) => a.id === id);
  if (!abordagem) return false;

  const arquivada = !abordagem.arquivada;
  const { error } = await getSupabase().from("abordagens").update({ arquivada }).eq("id", id);
  if (error) {
    toast("Não foi possível arquivar: " + error.message, "error");
    return false;
  }
  setAbordagens(abordagens.map((a) => (a.id === id ? { ...a, arquivada } : a)));
  toast(arquivada ? "Abordagem arquivada." : "Abordagem reativada.");
  return true;
}

/**
 * Cria ou atualiza um protocolo da imobiliária.
 *
 * O corte de tamanho não é capricho de UI: o conteúdo daqui entra no prompt de
 * TODO rascunho de resposta, e um protocolo com o contrato inteiro colado
 * dentro passaria a ser cobrado em cada chamada, para sempre. Mesmo freio do
 * MAX_TEXTO_ANUNCIO — e por isso ele mora junto dos outros limites de prompt,
 * em calculo/ia.ts, não aqui.
 */
export async function salvarProtocolo(data: Protocolo, userId: string): Promise<boolean> {
  const { protocolos, setProtocolos } = useAppStore.getState();
  const titulo = data.titulo.trim();
  const conteudo = data.conteudo.trim();
  if (!ehTipoProtocolo(data.tipo)) {
    toast("Selecione uma categoria válida para o protocolo.", "error");
    return false;
  }
  if (!titulo) {
    toast("Dê um título ao protocolo.", "error");
    return false;
  }
  if (!conteudo) {
    toast("Escreva o conteúdo do protocolo.", "error");
    return false;
  }
  if (conteudo.length > MAX_PROTOCOLO_CHARS) {
    toast(`O protocolo passa de ${MAX_PROTOCOLO_CHARS} caracteres. Resuma ou divida em dois.`, "error");
    return false;
  }
  const existente = protocolos.find((p) => p.id === data.id) || null;
  const protocolo: Protocolo = { ...data, titulo, conteudo };

  const { error } = await getSupabase().from("protocolos").upsert(toDbProtocolo(protocolo, userId));
  if (error) {
    toast("Não foi possível salvar o protocolo: " + error.message, "error");
    return false;
  }
  setProtocolos(
    existente ? protocolos.map((p) => (p.id === protocolo.id ? protocolo : p)) : [...protocolos, protocolo],
  );
  toast(existente ? "Protocolo atualizado." : "Protocolo cadastrado.");
  return true;
}

/**
 * Arquiva\desarquiva um protocolo. Arquivado sai do prompt e da tela sem perder
 * o texto: a taxa que mudou este ano ainda descreve o contrato assinado no ano
 * passado, e o corretor pode precisar consultá-la.
 */
export async function alternarArquivamentoProtocolo(id: string): Promise<boolean> {
  const { protocolos, setProtocolos } = useAppStore.getState();
  const protocolo = protocolos.find((p) => p.id === id);
  if (!protocolo) return false;

  const arquivado = !protocolo.arquivado;
  const { error } = await getSupabase().from("protocolos").update({ arquivado }).eq("id", id);
  if (error) {
    toast("Não foi possível arquivar: " + error.message, "error");
    return false;
  }
  setProtocolos(protocolos.map((p) => (p.id === id ? { ...p, arquivado } : p)));
  toast(arquivado ? "Protocolo arquivado." : "Protocolo reativado.");
  return true;
}

/**
 * Exclui de vez. Existe (ao contrário das abordagens, que só se arquivam)
 * porque nada aponta para o id de um protocolo: nenhuma tentativa, nenhum
 * histórico. Apagar um protocolo escrito errado não deixa registro órfão.
 */
export async function excluirProtocolo(id: string): Promise<boolean> {
  const { protocolos, setProtocolos } = useAppStore.getState();
  const protocolo = protocolos.find((p) => p.id === id);
  if (!protocolo) return false;
  if (!confirm(`Excluir o protocolo "${protocolo.titulo}"? Essa ação não pode ser desfeita.`)) return false;

  const { error } = await getSupabase().from("protocolos").delete().eq("id", id);
  if (error) {
    toast("Não foi possível excluir: " + error.message, "error");
    return false;
  }
  setProtocolos(protocolos.filter((p) => p.id !== id));
  toast("Protocolo excluído.");
  return true;
}

export async function excluirImovel(id: string): Promise<boolean> {
  const supabase = getSupabase();
  const { imoveis } = useAppStore.getState();
  const imovel = imoveis.find((i) => i.id === id);
  if (!imovel) return false;
  if (!confirm(`Excluir o imóvel "${imovel.codigo || imovel.endereco}"? Essa ação não pode ser desfeita.`)) return false;

  // A rota do Google precisa ler o google_event_id enquanto o compromisso
  // ainda existe. Guardamos quais remoções deram certo para recriá-las se a
  // transação local falhar; assim os dois lados não ficam pela metade. A
  // lista vem do banco, não do store, que pode estar anterior a um lembrete
  // criado no servidor.
  const { data: compromissos, error: erroAgenda } = await supabase
    .from("agenda")
    .select("id")
    .eq("imovel_id", id);
  if (erroAgenda) {
    toast("Não foi possível consultar os compromissos: " + erroAgenda.message, "error");
    return false;
  }
  const resultadosGoogle = await Promise.all(
    (compromissos || []).map(async (item) => ({ id: item.id, resultado: await sincronizarCompromisso(item.id, "remover") })),
  );
  const removidosDoGoogle = resultadosGoogle.filter(({ resultado }) => resultado.ok).map(({ id: agendaId }) => agendaId);

  const { error } = await supabase.rpc("excluir_imovel_com_dependencias", { p_imovel_id: id });
  if (error) {
    // A linha da agenda continua no banco porque a função é transacional.
    // A sincronização normal recria o evento removido no Google.
    await Promise.all(removidosDoGoogle.map((agendaId) => sincronizarCompromisso(agendaId)));
    toast("Não foi possível excluir: " + error.message, "error");
    return false;
  }

  // Leia novamente para não descartar alterações que tenham chegado ao
  // store enquanto as integrações externas estavam sendo resolvidas.
  const estadoAtual = useAppStore.getState();
  estadoAtual.setImoveis(estadoAtual.imoveis.filter((i) => i.id !== id));
  estadoAtual.setAgenda(estadoAtual.agenda.filter((a) => a.imovelId !== id));
  const falhasGoogle = resultadosGoogle.filter(({ resultado }) =>
    !resultado.ok && resultado.falha !== "sem-conexao-google" && resultado.falha !== "nao-configurado",
  ).length;
  toast(falhasGoogle > 0
    ? `Imóvel excluído. ${falhasGoogle} evento(s) não puderam ser removidos do Google.`
    : "Imóvel excluído.");
  return true;
}

/**
 * `silencioso` existe para o ajuste rápido no card da meta: ali cada clique é
 * um salvamento, e um toast "Metas salvas." por clique afogaria a tela em cima
 * de uma ação que já se explica sozinha (o número muda na frente do corretor).
 * Mesma razão do `silencioso` da tentativa no follow-up em lote. O toast de
 * ERRO continua saindo nos dois modos: falha silenciosa deixaria o corretor
 * achando que mudou a meta quando não mudou.
 */
export async function salvarMeta(
  monthKey: string,
  meta: Meta,
  userId: string,
  silencioso = false,
): Promise<boolean> {
  const { error } = await getSupabase()
    .from("metas")
    .upsert(
      { user_id: userId, month_key: monthKey, angariacoes: meta.angariacoes, locados: meta.locados, comissao: meta.comissao, faturamento: meta.faturamento },
      { onConflict: "user_id,month_key" },
    );
  if (error) {
    toast("Não foi possível salvar: " + error.message, "error");
    return false;
  }
  const { metas, setMetas } = useAppStore.getState();
  setMetas({ ...metas, [monthKey]: meta });
  if (!silencioso) toast("Metas salvas.");
  return true;
}

/**
 * Espelha o compromisso na Agenda do Google, quando há conta conectada.
 *
 * Dispara e não espera, e isso é deliberado: a cópia no Google é
 * CONVENIÊNCIA, o compromisso já está salvo. Fazer o salvamento esperar uma
 * ida ao Google (refresh do token + API) deixaria o botão "Salvar" lento por
 * causa de um serviço de terceiro — inclusive para quem nunca conectou conta
 * nenhuma.
 *
 * Silenciosa pelo mesmo motivo: "não consegui falar com o Google" a cada
 * salvamento seria ruído sobre algo que o corretor não pediu naquele
 * instante. Quem não conectou nem chega a ver — `sem-conexao-google` e
 * `nao-configurado` são o caso NORMAL, não erro. O que sobra vai para o
 * console, e o estado da conexão se resolve em Configurações.
 *
 * **Chamar isto é obrigação de TODO caminho que cria compromisso**, e não
 * lembrar disso foi um bug real: por muito tempo só `salvarAgenda` e
 * `alternarAgendaDone` chamavam, e os compromissos que o app cria SOZINHO
 * (os dois lembretes do salvamento de imóvel, o encadeado da verificação, o
 * do lote de disponibilidade e o da agenda inteligente no webhook) ficavam
 * fora do Google. Ninguém percebia porque a falha é silenciosa por design e o
 * compromisso aparece normalmente no painel; o que faltava era só o lembrete
 * tocar no celular, que é a razão inteira da integração existir. Medido em
 * 03/08/2026: dos compromissos criados desde a conexão da conta, NENHUM tinha
 * `google_event_id`.
 *
 * A exceção deliberada são os DADOS DEMO: eles são exemplo descartável, e
 * despejar visitas fictícias na agenda pessoal de quem só quis ver o app
 * funcionando seria invasivo — ainda mais porque `limparDados` apaga a linha
 * daqui sem ter como apagar o evento de lá.
 */
function espelharNoGoogle(agendaId: string): void {
  void sincronizarCompromisso(agendaId).then((r) => {
    if (!r.ok && r.falha !== "sem-conexao-google" && r.falha !== "nao-configurado") {
      console.warn("Google Agenda: não foi possível espelhar o compromisso —", r.falha);
    }
  });
}

/**
 * Cria um compromisso E o espelha. Devolve se a gravação deu certo.
 *
 * As duas coisas moram juntas de propósito. A versão anterior deixava cada
 * chamador lembrar de espelhar depois de inserir, e quatro dos cinco não
 * lembraram — o resultado é o bug descrito acima. Com um caminho só, esquecer
 * deixa de ser possível: não há insert de compromisso sem espelhamento porque
 * não há outro lugar que insira.
 *
 * A ordem importa: espelha só DEPOIS de a linha existir no banco, porque a
 * rota do Google relê o compromisso de lá (o conteúdo do evento sai do banco,
 * nunca do cliente). Espelhar antes acharia uma linha que ainda não existe.
 */
async function inserirCompromisso(
  supabase: ReturnType<typeof getSupabase>,
  item: AgendaItem,
  userId: string,
): Promise<boolean> {
  const { error } = await supabase.from("agenda").insert(toDbAgenda(item, userId));
  if (error) return false;
  espelharNoGoogle(item.id);
  return true;
}

export async function salvarAgenda(data: AgendaItem, userId: string): Promise<boolean> {
  const { agenda, setAgenda } = useAppStore.getState();
  const existing = agenda.find((a) => a.id === data.id) || null;

  const { error } = await getSupabase().from("agenda").upsert(toDbAgenda(data, userId));
  if (error) {
    toast("Não foi possível salvar: " + error.message, "error");
    return false;
  }
  setAgenda(existing ? agenda.map((a) => (a.id === data.id ? data : a)) : [...agenda, data]);
  toast(existing ? "Compromisso atualizado." : "Compromisso adicionado.");
  espelharNoGoogle(data.id);
  return true;
}

export async function excluirAgenda(id: string): Promise<boolean> {
  // A remoção no Google vem ANTES, e esta é a única sincronização que se
  // espera: a rota lê o `google_event_id` da própria linha, então depois do
  // delete não haveria mais como saber qual evento apagar. Invertida a ordem,
  // o id do evento teria que vir do browser — e aí o cliente poderia pedir a
  // exclusão de qualquer evento da agenda pessoal do corretor.
  //
  // Falhar aqui NÃO cancela a exclusão: o que ele pediu foi remover o
  // compromisso. Sobra um evento órfão no Google, que ele apaga pelo celular.
  const google = await sincronizarCompromisso(id, "remover");
  if (!google.ok && google.falha !== "sem-conexao-google" && google.falha !== "nao-configurado") {
    console.warn("Google Agenda: o evento pode ter ficado na agenda —", google.falha);
  }

  const { error } = await getSupabase().from("agenda").delete().eq("id", id);
  if (error) {
    toast("Não foi possível excluir: " + error.message, "error");
    return false;
  }
  const { agenda, setAgenda } = useAppStore.getState();
  setAgenda(agenda.filter((a) => a.id !== id));
  toast("Compromisso removido.");
  return true;
}

export async function alternarAgendaDone(id: string): Promise<void> {
  const { agenda, setAgenda } = useAppStore.getState();
  const a = agenda.find((x) => x.id === id);
  if (!a) return;
  const novoValor = !a.done;
  const { error } = await getSupabase().from("agenda").update({ done: novoValor }).eq("id", id);
  if (error) {
    toast("Não foi possível atualizar: " + error.message, "error");
    return;
  }
  setAgenda(agenda.map((x) => (x.id === id ? { ...x, done: novoValor } : x)));
  // Concluir muda o título no Google (ganha "✓"), então vale re-espelhar.
  espelharNoGoogle(id);
}

/**
 * Conclui um lembrete de verificação de disponibilidade e, se o imóvel
 * ainda não estiver Locado, encadeia o próximo lembrete N dias depois
 * da data do contato informada.
 */
export async function confirmarConclusaoVerificacao(
  id: string,
  dataContato: string,
  userId: string,
): Promise<boolean> {
  const supabase = getSupabase();
  const { agenda, imoveis } = useAppStore.getState();
  const a = agenda.find((x) => x.id === id);
  if (!a) return true;

  const { error } = await supabase.from("agenda").update({ done: true }).eq("id", id);
  if (error) {
    toast("Não foi possível concluir: " + error.message, "error");
    return false;
  }
  let novaAgenda = agenda.map((x) => (x.id === id ? { ...x, done: true } : x));

  const imovel = a.imovelId ? imoveis.find((i) => i.id === a.imovelId) : null;
  if (imovel && imovel.status !== "Locado") {
    const proximo: AgendaItem = {
      id: uid(),
      title: `Verificar disponibilidade — ${imovel.codigo || imovel.endereco}`,
      type: "Follow-up",
      date: addDaysISO(dataContato, VERIFICACAO_DISPONIBILIDADE_DIAS) as string,
      imovelId: imovel.id,
      notes: "Lembrete automático: confirme novamente com o proprietário se o imóvel segue disponível.",
      done: false,
      isVerificacaoDisponibilidade: true,
    };
    if (await inserirCompromisso(supabase, proximo, userId)) novaAgenda = [...novaAgenda, proximo];
  }

  useAppStore.getState().setAgenda(novaAgenda);
  toast(imovel && imovel.status !== "Locado" ? "Contato registrado. Próximo lembrete agendado." : "Contato registrado.");
  return true;
}

/**
 * Versão em LOTE e SILENCIOSA da conclusão de verificação, chamada uma vez por
 * imóvel pela fila do lote de disponibilidade (filaFollowUp) após cada envio
 * confirmado.
 *
 * Faz o que o ModalVerificacao faz num clique, mas achando o lembrete pelo
 * IMÓVEL (não pelo id do compromisso): dá baixa em qualquer lembrete de
 * disponibilidade pendente daquele imóvel e, se ainda não estiver Locado e não
 * sobrar outro em aberto, agenda o próximo para daqui VERIFICACAO_
 * DISPONIBILIDADE_DIAS dias. Sem isto, o lote e o lembrete da agenda cutucariam
 * o mesmo proprietário pelos dois caminhos.
 *
 * Silenciosa de propósito: roda dentro da fila, e um toast por baixa afogaria o
 * corretor que segue trabalhando (mesma razão do `silencioso` da tentativa).
 * Não dá para reaproveitar confirmarConclusaoVerificacao: aquela é por id de
 * agenda, dá toast e o imóvel pode nem ter um lembrete aberto (dado antigo) —
 * aqui, nesse caso, criamos o primeiro.
 */
export async function registrarConfirmacaoDisponibilidade(
  imovelId: string,
  dataContato: string,
  userId: string,
): Promise<boolean> {
  const supabase = getSupabase();
  const { agenda, imoveis } = useAppStore.getState();
  const imovel = imoveis.find((i) => i.id === imovelId);
  if (!imovel) return false;

  let novaAgenda = agenda;
  const pendentes = agenda.filter(
    (a) => a.imovelId === imovelId && a.isVerificacaoDisponibilidade && !a.done,
  );
  if (pendentes.length > 0) {
    const ids = pendentes.map((a) => a.id);
    const { error } = await supabase.from("agenda").update({ done: true }).in("id", ids);
    if (error) return false;
    novaAgenda = novaAgenda.map((a) => (ids.includes(a.id) ? { ...a, done: true } : a));
  }

  // Reagenda só enquanto ainda faz sentido perguntar de novo, e nunca empilha:
  // se algum lembrete futuro já sobrou aberto, não cria outro.
  if (imovel.status !== "Locado") {
    const jaTemAberto = novaAgenda.some(
      (a) => a.imovelId === imovelId && a.isVerificacaoDisponibilidade && !a.done,
    );
    if (!jaTemAberto) {
      const proximo: AgendaItem = {
        id: uid(),
        title: `Verificar disponibilidade — ${imovel.codigo || imovel.endereco}`,
        type: "Follow-up",
        date: addDaysISO(dataContato, VERIFICACAO_DISPONIBILIDADE_DIAS) as string,
        imovelId,
        notes: "Lembrete automático: confirme novamente com o proprietário se o imóvel segue disponível.",
        done: false,
        isVerificacaoDisponibilidade: true,
      };
      if (await inserirCompromisso(supabase, proximo, userId)) novaAgenda = [...novaAgenda, proximo];
    }
  }

  if (novaAgenda !== agenda) useAppStore.getState().setAgenda(novaAgenda);
  return true;
}

export async function salvarConfig(
  config: UserConfig,
  userId: string,
  mensagemOk = "Configurações salvas.",
): Promise<boolean> {
  const { error } = await getSupabase().from("user_config").upsert({
    user_id: userId,
    comissao_percent: config.comissaoPercent,
    agenda_tipos: config.agendaTipos,
    whatsapp_modelos: config.whatsappModelos,
    empresa: config.empresa || null,
    origens_extras: config.origensExtras,
    dados_pagamento: config.dadosPagamento || null,
    perfil_comunicacao: config.perfilComunicacao,
  });
  if (error) {
    toast("Não foi possível salvar: " + error.message, "error");
    return false;
  }
  useAppStore.getState().setConfig(config);
  // Mensagem vazia = o chamador cuida do próprio toast (ex.: salvar modelo de
  // WhatsApp, que avisa quais marcadores pegaram).
  if (mensagemOk) toast(mensagemOk);
  return true;
}

/** Cria um modelo de WhatsApp na config do usuário; devolve o modelo ou null. */
export async function adicionarModeloWhatsapp(
  nome: string,
  texto: string,
  config: UserConfig,
  userId: string,
  mensagemOk = "Modelo salvo.",
): Promise<WhatsappModelo | null> {
  const novo: WhatsappModelo = { id: uid(), nome: nome.trim(), texto };
  const whatsappModelos = [...(config.whatsappModelos || []), novo];
  const ok = await salvarConfig({ ...config, whatsappModelos }, userId, mensagemOk);
  return ok ? novo : null;
}

/** Remove um modelo de WhatsApp da config do usuário. */
export async function removerModeloWhatsapp(
  id: string,
  config: UserConfig,
  userId: string,
): Promise<boolean> {
  const whatsappModelos = (config.whatsappModelos || []).filter((m) => m.id !== id);
  return salvarConfig({ ...config, whatsappModelos }, userId, "Modelo excluído.");
}

/**
 * Carrega dados de exemplo na conta do usuário atual — ação manual,
 * disponível em Configurações, já que uma conta nova deve começar vazia.
 * Ao final recarrega o estado do banco, como o app antigo fazia.
 */
export async function carregarDadosDemo(userId: string): Promise<boolean> {
  if (!confirm("Isso vai adicionar imóveis, metas e compromissos de exemplo à sua conta. Continuar?")) return false;
  const supabase = getSupabase();
  const { config } = useAppStore.getState();
  const { seedDemoData } = await import("./dadosDemo");
  const { demo, agendaDemo } = seedDemoData(config.comissaoPercent);

  const { error: e1 } = await supabase.from("imoveis").insert(demo.map((i) => toDbImovel(i, userId)));
  if (e1) {
    toast("Não foi possível carregar os exemplos: " + e1.message, "error");
    return false;
  }

  await supabase
    .from("metas")
    .upsert({ user_id: userId, month_key: currentMonthKey(), angariacoes: 15, locados: 8, comissao: 12000, faturamento: 20000 }, { onConflict: "user_id,month_key" });
  await supabase.from("agenda").insert(agendaDemo.map((a) => toDbAgenda(a, userId)));

  const { carregarEstado } = await import("./persistencia/carregarEstado");
  useAppStore.getState().setEstado(await carregarEstado());
  toast("Dados de exemplo carregados.");
  return true;
}

export async function apagarTodosOsDados(userId: string): Promise<boolean> {
  if (
    !confirm(
      "Isso vai apagar PERMANENTEMENTE todos os seus imóveis, metas, compromissos e abordagens salvos na nuvem. Essa ação não pode ser desfeita. Continuar?",
    )
  )
    return false;
  const supabase = getSupabase();
  const { error: e1 } = await supabase.from("imoveis").delete().eq("user_id", userId);
  const { error: e2 } = await supabase.from("agenda").delete().eq("user_id", userId);
  const { error: e3 } = await supabase.from("metas").delete().eq("user_id", userId);
  const { error: e4 } = await supabase.from("abordagens").delete().eq("user_id", userId);
  if (e1 || e2 || e3 || e4) {
    toast("Não foi possível apagar todos os dados. Tente novamente.", "error");
    return false;
  }
  const { setImoveis, setAgenda, setMetas, setAbordagens } = useAppStore.getState();
  setImoveis([]);
  setAgenda([]);
  setMetas({});
  setAbordagens([]);
  toast("Todos os dados foram apagados.");
  return true;
}

/* ----------------------------------------------------------------
   IMPORTAÇÃO EM LOTE

   Escreve de uma vez os candidatos que `calculo/importacao.ts` já
   validou. Não valida de novo, e não deve: a validação é pura e roda
   antes, para o corretor VER o que entra na prévia. Importar 200
   imóveis é irreversível na prática — desfazer é apagar 200 registros
   à mão —, então a decisão acontece na tela, não aqui.

   Um único insert, e não 200 chamadas: além de ser mais rápido, é o
   que evita a importação pela metade quando a conexão cai no meio.
   ---------------------------------------------------------------- */
export interface ResultadoImportacao {
  ok: boolean;
  gravados: number;
  mensagem?: string;
}

export async function importarImoveis(
  candidatos: Omit<Imovel, "id">[],
  userId: string,
): Promise<ResultadoImportacao> {
  if (candidatos.length === 0) return { ok: true, gravados: 0 };

  const novos: Imovel[] = candidatos.map((c) => ({ ...c, id: uid() }) as Imovel);

  const { error } = await getSupabase()
    .from("imoveis")
    .insert(novos.map((i) => toDbImovel(i, userId)));

  if (error) {
    console.error("Importação: falha ao gravar:", error.message);
    return { ok: false, gravados: 0, mensagem: "Não foi possível gravar. Nada foi importado." };
  }

  // Escrita primeiro no Supabase, estado local depois — a regra do
  // projeto. Em falha, o store não muda e a tela diz o que houve.
  const { imoveis } = useAppStore.getState();
  useAppStore.getState().setImoveis([...imoveis, ...novos]);
  return { ok: true, gravados: novos.length };
}
