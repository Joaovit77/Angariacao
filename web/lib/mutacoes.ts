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
  MOTIVO_PERDA_NUMERO_NAO_ENCONTRADO,
  type ResultadoTentativa,
  VERIFICACAO_DISPONIBILIDADE_DIAS,
} from "./constantes";
import { addDaysISO, agoraISOComHora, currentMonthKey, todayISO } from "./datas";
import { ehTentativaDuplicada } from "./calculo/abordagens";
import { celebracaoAoSalvar } from "./calculo/celebracao";
import {
  type EspecificacaoUnidade,
  motivoNaoPodeDesdobrar,
  textoNotaDesdobramento,
  unidadeDesdobrada,
} from "./calculo/desdobramento";
import { dataAngariadoEfetiva, foiAngariado, historicoComStatus } from "./calculo/motor";
import { ehNotaDeResposta } from "./calculo/notas";
import { useCelebracao } from "./celebracao";
import { toDbAbordagem, toDbAgenda, toDbImovel } from "./persistencia/mapeadores";
import { sincronizarCompromisso } from "./googleAgenda";
import { getSupabase } from "./persistencia/supabase";
import { useAppStore } from "./store";
import { toast } from "./toast";
import type { Abordagem, AgendaItem, Imovel, Meta, NotaImovel, Tentativa, UserConfig, WhatsappModelo } from "./tipos";

export function uid(): string {
  return crypto.randomUUID();
}

export function numOrNull(v: string | number | null | undefined): number | null {
  if (v === "" || v === undefined || v === null) return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

/**
 * Único ponto de mudança de status DO LADO DO CLIENTE: registra a transição no
 * histórico (para cálculo de tempo médio e "dias parado").
 *
 * A regra em si mora em `calculo/motor.ts` (`historicoComStatus`), porque o
 * webhook do WhatsApp também encerra imóvel e não pode importar este arquivo
 * (store + cliente do Supabase). Aqui fica só o açúcar que os modais usam.
 */
export function aplicarMudancaDeStatus(imovel: Imovel, novoStatus: string, statusAnterior: string | null): void {
  imovel.statusHistory = historicoComStatus(imovel.statusHistory, novoStatus, statusAnterior, todayISO());
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

  // Lembrete automático de "verificar disponibilidade": ao chegar em
  // Angariado, agenda um lembrete VERIFICACAO_DISPONIBILIDADE_DIAS dias depois
  // da angariação, enquanto não for Locado. Ao ser marcado como Locado,
  // qualquer lembrete desse tipo ainda em aberto é cancelado.
  let novaVerificacao: AgendaItem | null = null;
  let verificacoesACancelar: AgendaItem[] = [];
  if (data.status === "Locado") {
    verificacoesACancelar = agenda.filter((a) => a.imovelId === data.id && a.isVerificacaoDisponibilidade && !a.done);
  } else if (foiAngariado(data)) {
    const jaTemVerificacaoAberta = agenda.some(
      (a) => a.imovelId === data.id && a.isVerificacaoDisponibilidade && !a.done,
    );
    if (!jaTemVerificacaoAberta) {
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
  if (novoLembrete) {
    const { error: agErr } = await supabase.from("agenda").insert(toDbAgenda(novoLembrete, userId));
    if (!agErr) novaAgenda = [...novaAgenda, novoLembrete];
  }
  if (novaVerificacao) {
    const { error: verErr } = await supabase.from("agenda").insert(toDbAgenda(novaVerificacao, userId));
    if (!verErr) novaAgenda = [...novaAgenda, novaVerificacao];
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
 * Não é realtime: é o botão de atualizar, explícito, no lugar em que a
 * defasagem importa.
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

/**
 * Marca como lidas as respostas do proprietário que ainda estão pendentes na
 * Caixa de respostas (calculo/respostas.ts).
 *
 * É a saída MANUAL da caixa, para a mensagem que não vai gerar ação nenhuma
 * ("obrigado", "combinado"). Quem age pelo painel não passa por aqui: a
 * tentativa ou a mudança de status já tiram a resposta da caixa sozinhas.
 *
 * Update PARCIAL da coluna `notas`, como as outras mutações de nota — um
 * upsert da linha inteira apagaria o que estivesse sendo editado em paralelo,
 * e aqui o risco é concreto: o webhook escreve nessa mesma coluna quando a
 * próxima mensagem chega.
 *
 * Silencioso por opção: marcar linha a linha na caixa dispararia um toast por
 * clique. Quem confirma é a linha sumindo da lista.
 */
export async function marcarRespostasLidas(imovelId: string, silencioso = false): Promise<boolean> {
  const { imoveis, setImoveis } = useAppStore.getState();
  const imovel = imoveis.find((i) => i.id === imovelId);
  if (!imovel) return false;

  // Só as notas do webhook, e só as que ainda não estavam marcadas: a nota
  // escrita à mão pelo corretor e a do encerramento automático não são
  // respostas de ninguém e não têm o que "ler".
  const pendentes = (imovel.notas || []).filter((n) => ehNotaDeResposta(n) && n.lida !== true);
  if (pendentes.length === 0) return true;

  const alvos = new Set(pendentes.map((n) => n.id));
  const novasNotas = (imovel.notas || []).map((n) => (alvos.has(n.id) ? { ...n, lida: true } : n));

  const { error } = await getSupabase().from("imoveis").update({ notas: novasNotas }).eq("id", imovelId);
  if (error) {
    toast("Não foi possível marcar como lida: " + error.message, "error");
    return false;
  }
  setImoveis(imoveis.map((i) => (i.id === imovelId ? { ...i, notas: novasNotas } : i)));
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
 * Uma requisição por imóvel, sequencial: cada linha tem um `notas` diferente,
 * e o update é PARCIAL da coluna (não dá para empacotar num upsert sem
 * reescrever a linha inteira, que é justamente o que apagaria o histórico).
 * São dezenas de imóveis no pior caso, não milhares.
 *
 * Aplica no estado local só o que o banco aceitou: um erro no meio deixa os
 * anteriores marcados, e é assim que tem que ser — reverter os que deram
 * certo faria a tela discordar do banco.
 */
export async function marcarTodasRespostasLidas(imovelIds: string[]): Promise<number> {
  const { imoveis, setImoveis } = useAppStore.getState();
  const supabase = getSupabase();
  const porImovel = new Map<string, NotaImovel[]>();

  for (const id of imovelIds) {
    const imovel = imoveis.find((i) => i.id === id);
    if (!imovel) continue;
    const alvos = new Set(
      (imovel.notas || []).filter((n) => ehNotaDeResposta(n) && n.lida !== true).map((n) => n.id),
    );
    if (alvos.size === 0) continue;

    const novasNotas = (imovel.notas || []).map((n) => (alvos.has(n.id) ? { ...n, lida: true } : n));
    const { error } = await supabase.from("imoveis").update({ notas: novasNotas }).eq("id", id);
    if (error) {
      toast("Não foi possível marcar tudo: " + error.message, "error");
      break;
    }
    porImovel.set(id, novasNotas);
  }

  if (porImovel.size > 0) {
    setImoveis(imoveis.map((i) => (porImovel.has(i.id) ? { ...i, notas: porImovel.get(i.id)! } : i)));
  }
  return porImovel.size;
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

export async function excluirImovel(id: string): Promise<boolean> {
  const supabase = getSupabase();
  const { imoveis, agenda } = useAppStore.getState();
  const imovel = imoveis.find((i) => i.id === id);
  if (!imovel) return false;
  if (!confirm(`Excluir o imóvel "${imovel.codigo || imovel.endereco}"? Essa ação não pode ser desfeita.`)) return false;

  const { error } = await supabase.from("imoveis").delete().eq("id", id);
  if (error) {
    toast("Não foi possível excluir: " + error.message, "error");
    return false;
  }
  await supabase.from("agenda").delete().eq("imovel_id", id);

  useAppStore.getState().setImoveis(imoveis.filter((i) => i.id !== id));
  useAppStore.getState().setAgenda(agenda.filter((a) => a.imovelId !== id));
  toast("Imóvel excluído.");
  return true;
}

export async function salvarMeta(monthKey: string, meta: Meta, userId: string): Promise<boolean> {
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
  toast("Metas salvas.");
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
 */
function espelharNoGoogle(agendaId: string): void {
  void sincronizarCompromisso(agendaId).then((r) => {
    if (!r.ok && r.falha !== "sem-conexao-google" && r.falha !== "nao-configurado") {
      console.warn("Google Agenda: não foi possível espelhar o compromisso —", r.falha);
    }
  });
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
    const { error: proxErr } = await supabase.from("agenda").insert(toDbAgenda(proximo, userId));
    if (!proxErr) novaAgenda = [...novaAgenda, proximo];
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
      const { error } = await supabase.from("agenda").insert(toDbAgenda(proximo, userId));
      if (!error) novaAgenda = [...novaAgenda, proximo];
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
