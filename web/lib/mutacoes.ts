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
import { VERIFICACAO_DISPONIBILIDADE_DIAS } from "./constantes";
import { addDaysISO, agoraISOComHora, currentMonthKey, todayISO } from "./datas";
import { dataAngariadoEfetiva, foiAngariado } from "./calculo/motor";
import { toDbAbordagem, toDbAgenda, toDbImovel } from "./persistencia/mapeadores";
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
 * Único ponto de mudança de status: registra a transição no histórico
 * (para cálculo de tempo médio e "dias parado"). Não duplica quando a
 * última entrada já é o status novo.
 */
export function aplicarMudancaDeStatus(imovel: Imovel, novoStatus: string, statusAnterior: string | null): void {
  if (statusAnterior !== null && statusAnterior === novoStatus) return;
  const hist = imovel.statusHistory || [];
  if (hist.length === 0 || hist[hist.length - 1].status !== novoStatus) {
    hist.push({ status: novoStatus, date: todayISO() });
  }
  imovel.statusHistory = hist;
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
  const { imoveis, agenda } = useAppStore.getState();
  const existing = imoveis.find((i) => i.id === data.id) || null;

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

  // Atenção: o upsert grava a linha inteira, incluindo `notas` do objeto em
  // memória — por isso as mutações de nota usam update parcial da coluna.
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

  if (existing) {
    useAppStore.getState().setImoveis(imoveis.map((i) => (i.id === data.id ? data : i)));
    toast("Imóvel atualizado.");
  } else {
    useAppStore.getState().setImoveis([...imoveis, data]);
    toast("Imóvel cadastrado com sucesso.");
  }
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
export async function registrarTentativa(
  imovelId: string,
  dados: Omit<Tentativa, "id" | "data">,
): Promise<boolean> {
  const { imoveis, setImoveis } = useAppStore.getState();
  const imovel = imoveis.find((i) => i.id === imovelId);
  if (!imovel) return false;

  const tentativa: Tentativa = {
    id: uid(),
    data: agoraISOComHora(),
    abordagemId: dados.abordagemId || null,
    canal: dados.canal || null,
    resultado: dados.resultado,
    observacao: dados.observacao?.trim() || null,
  };
  const novasTentativas = [...(imovel.tentativas || []), tentativa];

  const { error } = await getSupabase().from("imoveis").update({ tentativas: novasTentativas }).eq("id", imovelId);
  if (error) {
    toast("Não foi possível registrar a tentativa: " + error.message, "error");
    return false;
  }
  setImoveis(imoveis.map((i) => (i.id === imovelId ? { ...i, tentativas: novasTentativas } : i)));
  toast("Tentativa registrada.");
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
  return true;
}

export async function excluirAgenda(id: string): Promise<boolean> {
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
