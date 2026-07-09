/* ================================================================
   PAINEL DE ANGARIAÇÕES — app.js
   Sistema de controle de angariação de imóveis para locação.
   Stack: JS puro + Supabase (Postgres + Auth), hospedado na Vercel.
   Estrutura do arquivo:
     1. Constantes e estado global
     2. Persistência (Supabase — mapeadores camelCase <-> snake_case)
     3. Utilidades (datas, formatação, cálculos)
     4. Motor de cálculo (métricas derivadas dos imóveis)
     5. Views: Dashboard, Pipeline, Metas, Agenda, Insights,
        Relatórios, Roadmap
     6. Modais de formulário (Imóvel, Meta, Agenda)
     7. Autenticação, boot e roteamento de navegação
   ================================================================ */

/* ----------------------------------------------------------------
   1. CONSTANTES E ESTADO GLOBAL
   ---------------------------------------------------------------- */

// Ordem oficial do funil. A posição no array define a ordem de
// progressão "normal"; Perdido/Cancelado são saídas laterais.
const STATUS_FLOW = [
  "Novo contato",
  "Visita agendada",
  "Em negociação",
  "Documentação",
  "Angariado",
  "Publicado",
  "Locado",
];
const STATUS_TERMINAL_NEGATIVE = ["Sem resposta", "Perdido", "Cancelado"];
const STATUS_ALL = [...STATUS_FLOW, ...STATUS_TERMINAL_NEGATIVE];

const TIPOS_IMOVEL = [
  "Apartamento", "Casa", "Casa de Condomínio", "Kitnet/Studio",
  "Sobrado", "Sala Comercial", "Galpão", "Terreno", "Outro",
];

// Como o contato com o proprietário foi feito
const FORMAS_ABORDAGEM = [
  "Ligação telefônica", "WhatsApp", "Visita presencial", "Indicação",
  "Panfletagem", "E-mail", "Rede social", "Outro",
];

// Onde a oportunidade de angariação foi encontrada
const ORIGENS_IMOVEL = [
  "Placa no imóvel", "Indicação de cliente", "Prospecção ativa (porta a porta)",
  "OLX / Canal Pro", "Redes sociais", "Site da imobiliária", "Ex-cliente", "Outro",
];

// Motivo específico quando o imóvel é marcado como Perdido ou Cancelado —
// permite depois enxergar padrões (ex: "a maioria das perdas é porque o
// imóvel já tinha sido vendido/alugado por fora"), em vez de só saber que
// "não deu certo" sem entender o porquê.
const MOTIVOS_PERDA = [
  "Imóvel já vendido", "Imóvel já alugado por conta própria", "Proprietário desistiu de alugar",
  "Valor pedido incompatível com mercado", "Optou por outra imobiliária", "Perda de contato definitiva", "Outro",
];

// Cores de identidade visual por status (usadas no kanban para dar
// contexto imediato de coluna/card sem depender só do texto).
const STATUS_COLORS = {
  "Novo contato": "#6fa8c9",
  "Visita agendada": "#9b8fd9",
  "Em negociação": "#e0b458",
  "Documentação": "#e0a35e",
  "Angariado": "#f0a868",
  "Publicado": "#7bd4b2",
  "Locado": "#5fb896",
  "Sem resposta": "#b0b0b0",
  "Perdido": "#e08f8f",
  "Cancelado": "#a3a3a3",
};

const AGENDA_TYPES = ["Retorno ao proprietário", "Visita", "Pendência", "Documentação", "Follow-up"];

// Quantos dias parado num mesmo status já é considerado "estagnado"
// para fins de alerta visual no kanban e nos insights.
const STALE_DAYS_THRESHOLD = 7;

// Dias após a angariação (sem locação) para gerar o lembrete automático
// de "verificar disponibilidade com o proprietário".
const VERIFICACAO_DISPONIBILIDADE_DIAS = 60;

let STATE = {
  imoveis: [],
  metas: {},   // { "YYYY-MM": { angariacoes, locados, comissao } }
  agenda: [],
  config: { comissaoPercent: 100 }, // % sobre 1 aluguel (100 = 1 mês de aluguel)
};

let currentView = "dashboard";
let pipelineViewMode = "lista"; // "kanban" | "lista"
let chartInstances = {}; // referências Chart.js para destruir ao re-renderizar
let bigMap = null; // referência do mapa Leaflet da view Mapa
let currentUser = null; // usuário autenticado no Supabase (auth.users)

/* ----------------------------------------------------------------
   2. PERSISTÊNCIA (Supabase)
   Cada usuário só enxerga as próprias linhas — isso é garantido
   pelo Row Level Security configurado no schema SQL, não só pelo
   filtro aqui no JS. Os mapeadores abaixo convertem entre o
   formato camelCase usado no resto do app e o snake_case das
   colunas do Postgres.
   ---------------------------------------------------------------- */
function toDbImovel(i) {
  return {
    id: i.id,
    user_id: currentUser.id,
    codigo: i.codigo || null,
    cep: i.cep || null,
    endereco: i.endereco,
    bairro: i.bairro || null,
    cidade: i.cidade || null,
    tipo: i.tipo || null,
    quartos: i.quartos ?? null,
    banheiros: i.banheiros ?? null,
    vagas: i.vagas ?? null,
    valor_aluguel: i.valorAluguel || 0,
    valor_condominio: i.valorCondominio || 0,
    proprietario_nome: i.proprietarioNome || null,
    proprietario_telefone: i.proprietarioTelefone || null,
    forma_abordagem: i.formaAbordagem || null,
    origem_imovel: i.origemImovel || null,
    imobiliaria_concorrente: i.imobiliariaConcorrente || null,
    latitude: i.latitude ?? null,
    longitude: i.longitude ?? null,
    data_angariacao: i.dataAngariacao || null,
    responsavel: i.responsavel || null,
    status: i.status,
    observacoes: i.observacoes || null,
    status_history: i.statusHistory || [],
    pausado_ate: i.pausadoAte || null,
    motivo_perda: i.motivoPerda || null,
    motivo_perda_outro: i.motivoPerdaOutro || null,
    comissao_recebida: !!i.comissaoRecebida,
    comissao_recebida_valor: i.comissaoRecebidaValor ?? null,
    comissao_recebida_data: i.comissaoRecebidaData || null,
  };
}

function fromDbImovel(r) {
  return {
    id: r.id,
    codigo: r.codigo || "",
    cep: r.cep || "",
    endereco: r.endereco,
    bairro: r.bairro || "",
    cidade: r.cidade || "",
    tipo: r.tipo || "",
    quartos: r.quartos,
    banheiros: r.banheiros,
    vagas: r.vagas,
    valorAluguel: Number(r.valor_aluguel) || 0,
    valorCondominio: Number(r.valor_condominio) || 0,
    proprietarioNome: r.proprietario_nome || "",
    proprietarioTelefone: r.proprietario_telefone || "",
    formaAbordagem: r.forma_abordagem || "",
    origemImovel: r.origem_imovel || "",
    imobiliariaConcorrente: r.imobiliaria_concorrente || "",
    latitude: r.latitude,
    longitude: r.longitude,
    dataAngariacao: r.data_angariacao,
    responsavel: r.responsavel || "",
    status: r.status,
    observacoes: r.observacoes || "",
    statusHistory: r.status_history || [],
    pausadoAte: r.pausado_ate,
    motivoPerda: r.motivo_perda || "",
    motivoPerdaOutro: r.motivo_perda_outro || "",
    comissaoRecebida: !!r.comissao_recebida,
    comissaoRecebidaValor: r.comissao_recebida_valor,
    comissaoRecebidaData: r.comissao_recebida_data,
  };
}

function toDbAgenda(a) {
  return {
    id: a.id,
    user_id: currentUser.id,
    title: a.title,
    type: a.type,
    date: a.date,
    imovel_id: a.imovelId || null,
    notes: a.notes || null,
    done: !!a.done,
    is_verificacao_disponibilidade: !!a.isVerificacaoDisponibilidade,
  };
}

function fromDbAgenda(r) {
  return { id: r.id, title: r.title, type: r.type, date: r.date, imovelId: r.imovel_id, notes: r.notes || "", done: !!r.done, isVerificacaoDisponibilidade: !!r.is_verificacao_disponibilidade };
}

async function loadState() {
  try {
    const [imRes, mtRes, agRes, cfRes] = await Promise.all([
      supabaseClient.from("imoveis").select("*"),
      supabaseClient.from("metas").select("*"),
      supabaseClient.from("agenda").select("*"),
      supabaseClient.from("user_config").select("*").maybeSingle(),
    ]);
    if (imRes.error) throw imRes.error;
    if (mtRes.error) throw mtRes.error;
    if (agRes.error) throw agRes.error;

    STATE.imoveis = (imRes.data || []).map(fromDbImovel);
    STATE.agenda = (agRes.data || []).map(fromDbAgenda);
    STATE.metas = {};
    (mtRes.data || []).forEach((m) => {
      STATE.metas[m.month_key] = { angariacoes: m.angariacoes || 0, locados: m.locados || 0, comissao: Number(m.comissao) || 0 };
    });
    STATE.config = { comissaoPercent: cfRes.data ? Number(cfRes.data.comissao_percent) : 100 };
  } catch (e) {
    console.error("Falha ao carregar dados do Supabase:", e);
    toast("Não foi possível carregar seus dados. Verifique sua conexão.", "error");
  }
}

/* ----------------------------------------------------------------
   3. UTILIDADES
   ---------------------------------------------------------------- */
function uid() {
  return crypto.randomUUID();
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function parseDate(iso) {
  if (!iso) return null;
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function daysBetween(isoA, isoB) {
  const a = parseDate(isoA), b = parseDate(isoB);
  if (!a || !b) return null;
  return Math.round((b - a) / 86400000);
}

// Soma dias a uma data ISO — usado para calcular a data do próximo
// lembrete de verificação de disponibilidade (imóvel angariado, ainda
// não locado após X dias).
function addDaysISO(iso, days) {
  const d = parseDate(iso);
  if (!d) return null;
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

function fmtDate(iso) {
  if (!iso) return "—";
  const d = parseDate(iso);
  return d.toLocaleDateString("pt-BR");
}

function fmtDateLong(iso) {
  if (!iso) return "—";
  const d = parseDate(iso);
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}

function fmtMoney(v) {
  if (v == null || isNaN(v)) return "—";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
}

function fmtMoneyFull(v) {
  if (v == null || isNaN(v)) return "—";
  return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function monthKey(iso) {
  if (!iso) return null;
  return iso.slice(0, 7); // "YYYY-MM"
}

function monthLabel(key) {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m - 1, 1);
  return d.toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }).replace(".", "");
}

function monthLabelLong(key) {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m - 1, 1);
  const s = d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function currentMonthKey() {
  return todayISO().slice(0, 7);
}

function shiftMonthKey(key, delta) {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return d.toISOString().slice(0, 7);
}

function last6MonthKeys() {
  const keys = [];
  let k = currentMonthKey();
  for (let i = 0; i < 6; i++) { keys.unshift(k); k = shiftMonthKey(k, -1); }
  return keys;
}

function toast(msg, type = "success") {
  const container = document.getElementById("toast-container");
  const el = document.createElement("div");
  el.className = `toast ${type}`;
  el.textContent = msg;
  container.appendChild(el);
  setTimeout(() => { el.style.opacity = "0"; el.style.transition = "opacity .25s"; setTimeout(() => el.remove(), 250); }, 2600);
}

function escapeHtml(str) {
  if (str == null) return "";
  return String(str).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

/* ----------------------------------------------------------------
   4. MOTOR DE CÁLCULO
   Todas as métricas derivadas dos imóveis vivem aqui, para que
   Dashboard, Metas, Insights e Relatórios usem a mesma fonte de
   verdade e nunca divirjam entre si.
   ---------------------------------------------------------------- */

// Retorna a data (ISO) em que o imóvel entrou em determinado status,
// usando o histórico de transições. Cai para dataAngariacao se não
// houver histórico (compatibilidade com registros antigos).
function dateEnteredStatus(imovel, status) {
  const hist = imovel.statusHistory || [];
  const entry = hist.find((h) => h.status === status);
  return entry ? entry.date : (status === "Novo contato" ? imovel.dataAngariacao : null);
}

function currentStatusSince(imovel) {
  const hist = imovel.statusHistory || [];
  if (hist.length === 0) return imovel.dataAngariacao;
  return hist[hist.length - 1].date;
}

function isPausado(imovel) {
  return !!(imovel.pausadoAte && imovel.pausadoAte >= todayISO());
}

function isStale(imovel) {
  if (STATUS_TERMINAL_NEGATIVE.includes(imovel.status) || imovel.status === "Locado") return false;
  if (isPausado(imovel)) return false;
  const since = currentStatusSince(imovel);
  const d = daysBetween(since, todayISO());
  return d !== null && d >= STALE_DAYS_THRESHOLD;
}

function daysInCurrentStatus(imovel) {
  const since = currentStatusSince(imovel);
  return daysBetween(since, todayISO());
}

function comissaoEstimada(imovel) {
  return (imovel.valorAluguel || 0) * (STATE.config.comissaoPercent / 100);
}

function comissaoRecebidaValor(imovel) {
  return imovel.status === "Locado" && imovel.comissaoRecebida ? (imovel.comissaoRecebidaValor ?? comissaoEstimada(imovel)) : 0;
}

function tempoAteLocacao(imovel) {
  if (imovel.status !== "Locado") return null;
  const dLocado = dateEnteredStatus(imovel, "Locado");
  return daysBetween(imovel.dataAngariacao, dLocado);
}

function metricsForRange(imoveis) {
  const total = imoveis.length;
  const locados = imoveis.filter((i) => i.status === "Locado");
  const perdidosCancelados = imoveis.filter((i) => STATUS_TERMINAL_NEGATIVE.includes(i.status));
  const fechados = locados.length + perdidosCancelados.length;
  const conversaoGeral = total ? (locados.length / total) * 100 : 0;
  const conversaoFechados = fechados ? (locados.length / fechados) * 100 : 0;
  const tempos = locados.map(tempoAteLocacao).filter((t) => t != null && t >= 0);
  const tempoMedio = tempos.length ? tempos.reduce((a, b) => a + b, 0) / tempos.length : null;
  const comissaoEst = imoveis.reduce((s, i) => s + comissaoEstimada(i), 0);
  const comissaoRec = imoveis.reduce((s, i) => s + comissaoRecebidaValor(i), 0);
  const valorMedioAluguel = total ? imoveis.reduce((s, i) => s + (i.valorAluguel || 0), 0) / total : 0;
  return { total, locados: locados.length, perdidosCancelados: perdidosCancelados.length, conversaoGeral, conversaoFechados, tempoMedio, comissaoEst, comissaoRec, valorMedioAluguel };
}

// Um imóvel só conta como "angariado" quando o funil realmente marca
// a passagem pela etapa "Angariado" — simplesmente cadastrar o imóvel
// ou fazer o primeiro contato NÃO conta como angariação concluída.
function foiAngariado(imovel) {
  return dateEnteredStatus(imovel, "Angariado") != null;
}

function dataAngariadoEfetiva(imovel) {
  return dateEnteredStatus(imovel, "Angariado");
}

function imoveisAngariadosNoMes(key) {
  return STATE.imoveis.filter((i) => foiAngariado(i) && monthKey(dataAngariadoEfetiva(i)) === key);
}

function imoveisAngariadosNoPeriodo(start, end) {
  return STATE.imoveis.filter((i) => {
    const d = dataAngariadoEfetiva(i);
    return d && d >= start && d <= end;
  });
}

// "Contato" é o topo do funil: todo imóvel que entrou no pipeline,
// independente de já ter sido efetivamente angariado ou não.
function imoveisContatadosNoMes(key) {
  return STATE.imoveis.filter((i) => monthKey(i.dataAngariacao) === key);
}

function imoveisContatadosNoPeriodo(start, end) {
  return STATE.imoveis.filter((i) => i.dataAngariacao >= start && i.dataAngariacao <= end);
}

function imoveisLocadosNoMes(key) {
  return STATE.imoveis.filter((i) => i.status === "Locado" && monthKey(dateEnteredStatus(i, "Locado")) === key);
}

function groupCount(imoveis, keyFn) {
  const map = {};
  imoveis.forEach((i) => {
    const k = keyFn(i) || "Não informado";
    map[k] = (map[k] || 0) + 1;
  });
  return map;
}

/* ----------------------------------------------------------------
   AUTENTICAÇÃO
   ---------------------------------------------------------------- */
document.addEventListener("DOMContentLoaded", () => {
  wireAuthForms();
  wireNav();
  document.getElementById("modal-overlay").addEventListener("click", (e) => {
    if (e.target.id === "modal-overlay") closeModal();
  });

  supabaseClient.auth.onAuthStateChange((event, session) => {
    if (event === "PASSWORD_RECOVERY") {
      // Usuário chegou aqui pelo link de "esqueci minha senha" do e-mail —
      // mostra a tela de definir nova senha em vez do fluxo normal.
      document.getElementById("app-shell").style.display = "none";
      document.getElementById("auth-screen").style.display = "flex";
      switchAuthTab("reset");
      return;
    }
    if (session && session.user) {
      handleAuthenticated(session.user);
    } else {
      handleUnauthenticated();
    }
  });
});

async function handleAuthenticated(user) {
  currentUser = user;
  document.getElementById("auth-screen").style.display = "none";
  document.getElementById("app-shell").style.display = "";
  document.getElementById("main-content").innerHTML = `<div class="auth-loading">Carregando seus dados...</div>`;
  await loadState();
  const label = user.user_metadata?.name || user.email;
  document.getElementById("sidebar-user").textContent = label;
  renderCurrentView();
  updateNavBadges();
}

function handleUnauthenticated() {
  currentUser = null;
  document.getElementById("app-shell").style.display = "none";
  document.getElementById("auth-screen").style.display = "flex";
}

function switchAuthTab(tab) {
  document.getElementById("tab-login").classList.toggle("active", tab === "login");
  document.getElementById("tab-signup").classList.toggle("active", tab === "signup");
  document.getElementById("auth-form-login").style.display = tab === "login" ? "" : "none";
  document.getElementById("auth-form-signup").style.display = tab === "signup" ? "" : "none";
  document.getElementById("auth-form-forgot").style.display = tab === "forgot" ? "" : "none";
  document.getElementById("auth-form-reset").style.display = tab === "reset" ? "" : "none";
  // Nas telas de "esqueci a senha" e "definir nova senha" não faz sentido
  // mostrar as abas Entrar/Criar conta.
  document.querySelector(".auth-tabs").style.display = (tab === "forgot" || tab === "reset") ? "none" : "";
}

/* ----------------------------------------------------------------
   Senha: mostrar/ocultar e indicador de força
   ---------------------------------------------------------------- */
function togglePasswordVisibility(inputId, btnEl) {
  const input = document.getElementById(inputId);
  const isPassword = input.type === "password";
  input.type = isPassword ? "text" : "password";
  btnEl.classList.toggle("active", isPassword);
}

function passwordStrength(pw) {
  if (!pw) return { pct: 0, label: "", color: "" };
  let score = 0;
  if (pw.length >= 6) score++;
  if (pw.length >= 10) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;

  if (score <= 1) return { pct: 25, label: "Fraca", color: "var(--bad)" };
  if (score <= 2) return { pct: 50, label: "Razoável", color: "var(--warn)" };
  if (score <= 3) return { pct: 75, label: "Boa", color: "var(--info)" };
  return { pct: 100, label: "Forte", color: "var(--good)" };
}

function updatePasswordStrength(value, suffix) {
  const wrapId = suffix ? `pw-strength-${suffix}` : "pw-strength";
  const fillId = suffix ? `pw-strength-fill-${suffix}` : "pw-strength-fill";
  const labelId = suffix ? `pw-strength-label-${suffix}` : "pw-strength-label";
  const wrap = document.getElementById(wrapId);
  const fill = document.getElementById(fillId);
  const label = document.getElementById(labelId);
  if (!wrap) return;
  if (!value) { wrap.style.display = "none"; return; }
  wrap.style.display = "flex";
  const s = passwordStrength(value);
  fill.style.width = s.pct + "%";
  fill.style.background = s.color;
  label.textContent = s.label;
  label.style.color = s.color;
}

function wireAuthForms() {
  document.getElementById("auth-form-login").addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("auth-login-email").value.trim();
    const password = document.getElementById("auth-login-password").value;
    const errEl = document.getElementById("auth-login-error");
    errEl.style.color = "var(--bad)";
    errEl.textContent = "";
    const { error } = await supabaseClient.auth.signInWithPassword({ email, password });
    if (error) errEl.textContent = traduzErroAuth(error);
  });

  document.getElementById("auth-form-signup").addEventListener("submit", async (e) => {
    e.preventDefault();
    const name = document.getElementById("auth-signup-name").value.trim();
    const email = document.getElementById("auth-signup-email").value.trim();
    const password = document.getElementById("auth-signup-password").value;
    const errEl = document.getElementById("auth-signup-error");
    errEl.style.color = "var(--bad)";
    errEl.textContent = "";
    const { error } = await supabaseClient.auth.signUp({ email, password, options: { data: { name } } });
    if (error) { errEl.textContent = traduzErroAuth(error); return; }
    errEl.style.color = "var(--good)";
    errEl.textContent = "Conta criada! Se pedir confirmação por e-mail, confira sua caixa de entrada.";
  });

  document.getElementById("auth-form-forgot").addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("auth-forgot-email").value.trim();
    const errEl = document.getElementById("auth-forgot-error");
    errEl.style.color = "var(--bad)";
    errEl.textContent = "";
    const { error } = await supabaseClient.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
    if (error) { errEl.textContent = traduzErroAuth(error); return; }
    errEl.style.color = "var(--good)";
    errEl.textContent = "Link enviado! Confira seu e-mail (e a caixa de spam, por garantia).";
  });

  document.getElementById("auth-form-reset").addEventListener("submit", async (e) => {
    e.preventDefault();
    const password = document.getElementById("auth-reset-password").value;
    const errEl = document.getElementById("auth-reset-error");
    errEl.style.color = "var(--bad)";
    errEl.textContent = "";
    const { error } = await supabaseClient.auth.updateUser({ password });
    if (error) { errEl.textContent = traduzErroAuth(error); return; }
    toast("Senha atualizada com sucesso.");
    // Depois de trocar a senha, o Supabase já autentica a sessão normalmente —
    // deixa o próprio onAuthStateChange (SIGNED_IN) assumir da próxima vez.
    const { data: { session } } = await supabaseClient.auth.getSession();
    if (session && session.user) handleAuthenticated(session.user);
  });
}

function traduzErroAuth(error) {
  const msg = error.message || "";
  if (msg.includes("Invalid login credentials")) return "E-mail ou senha incorretos.";
  if (msg.includes("User already registered")) return "Já existe uma conta com esse e-mail.";
  if (msg.includes("Password should be at least")) return "A senha precisa ter pelo menos 6 caracteres.";
  if (msg.includes("Unable to validate email address")) return "Esse e-mail não parece válido.";
  return msg || "Não foi possível concluir. Tente novamente.";
}

async function handleLogout() {
  await supabaseClient.auth.signOut();
}

/* ----------------------------------------------------------------
   ROUTER
   ---------------------------------------------------------------- */
function wireNav() {
  document.querySelectorAll(".nav-item[data-view]").forEach((btn) => {
    btn.addEventListener("click", () => {
      currentView = btn.dataset.view;
      document.querySelectorAll(".nav-item[data-view]").forEach((b) => b.classList.toggle("active", b === btn));
      renderCurrentView();
      closeMobileSidebar();
    });
  });
}

function toggleMobileSidebar() {
  document.getElementById("sidebar").classList.toggle("open");
  document.getElementById("sidebar-backdrop").classList.toggle("open");
}

function closeMobileSidebar() {
  document.getElementById("sidebar").classList.remove("open");
  document.getElementById("sidebar-backdrop").classList.remove("open");
}

function updateNavBadges() {
  const pipelineActive = STATE.imoveis.filter((i) => STATUS_FLOW.includes(i.status) && i.status !== "Locado").length;
  const agendaPendente = STATE.agenda.filter((a) => !a.done).length;
  document.getElementById("nav-badge-pipeline").textContent = pipelineActive;
  document.getElementById("nav-badge-agenda").textContent = agendaPendente;
}

function renderCurrentView() {
  const main = document.getElementById("main-content");
  Object.values(chartInstances).forEach((c) => c && c.destroy());
  chartInstances = {};
  if (bigMap) { bigMap.remove(); bigMap = null; }
  clearTimeout(pipelineSearchDebounceTimer);
  switch (currentView) {
    case "dashboard": main.innerHTML = viewDashboard(); afterRenderDashboard(); break;
    case "pipeline": main.innerHTML = viewPipelineEnhanced(); afterRenderPipeline(); break;
    case "metas": main.innerHTML = viewMetas(); afterRenderMetas(); break;
    case "agenda": main.innerHTML = viewAgenda(); afterRenderAgenda(); break;
    case "insights": main.innerHTML = viewInsights(); break;
    case "mapa": main.innerHTML = viewMapa(); afterRenderMapa(); break;
    case "relatorios": main.innerHTML = viewRelatorios(); afterRenderRelatorios(); break;
    case "roadmap": main.innerHTML = viewRoadmap(); break;
  }
  updateNavBadges();
}

// Após qualquer mutação já persistida no Supabase, só precisamos
// re-renderizar — os dados em STATE já foram atualizados localmente
// de forma otimista pela função que chamou refresh().
function refresh() { renderCurrentView(); }


/* ================================================================
   5A. VIEW: DASHBOARD
   ================================================================ */
function viewDashboard() {
  const mKey = currentMonthKey();
  const prevKey = shiftMonthKey(mKey, -1);
  const contatosThisMonth = imoveisContatadosNoMes(mKey);
  const contatosPrevMonth = imoveisContatadosNoMes(prevKey);
  const thisMonth = imoveisAngariadosNoMes(mKey);
  const prevMonth = imoveisAngariadosNoMes(prevKey);
  const locadosThisMonth = imoveisLocadosNoMes(mKey);
  const locadosPrevMonth = imoveisLocadosNoMes(prevKey);
  const overall = metricsForRange(STATE.imoveis);

  const deltaContatos = contatosThisMonth.length - contatosPrevMonth.length;
  const deltaAngariacoes = thisMonth.length - prevMonth.length;
  const deltaLocados = locadosThisMonth.length - locadosPrevMonth.length;

  const comissaoEstMes = thisMonth.reduce((s, i) => s + comissaoEstimada(i), 0);
  const comissaoRecMes = STATE.imoveis.reduce((s, i) => {
    if (i.status === "Locado" && i.comissaoRecebida && monthKey(i.comissaoRecebidaData) === mKey) return s + comissaoRecebidaValor(i);
    return s;
  }, 0);

  if (STATE.imoveis.length === 0) {
    return `
      <div class="page-head">
        <div><h1 class="page-title">Dashboard</h1><p class="page-sub">Visão geral da sua produtividade</p></div>
        <div class="page-actions"><button class="btn btn-primary" onclick="openImovelModal()">+ Nova angariação</button></div>
      </div>
      <div class="empty-state card">
        <h3>Nenhum imóvel cadastrado ainda</h3>
        <p>Cadastre sua primeira angariação para começar a acompanhar seus resultados aqui.</p>
        <div style="margin-top:16px;"><button class="btn btn-primary" onclick="openImovelModal()">+ Cadastrar imóvel</button></div>
      </div>`;
  }

  return `
    <div class="page-head">
      <div><h1 class="page-title">Dashboard</h1><p class="page-sub">${monthLabelLong(mKey)} · visão geral da produtividade</p></div>
      <div class="page-actions">
        <button class="btn" onclick="switchView('agenda')">Ver agenda</button>
        <button class="btn btn-primary" onclick="openImovelModal()">+ Nova angariação</button>
      </div>
    </div>

    <div class="grid grid-3" style="margin-bottom:16px;">
      ${kpiCard("Novos contatos no mês", contatosThisMonth.length, deltaContatos, "un.", null, "Imóveis que entraram no funil este mês")}
      ${kpiCard("Angariações no mês", thisMonth.length, deltaAngariacoes, "un.", null, "Só conta ao chegar na etapa Angariado")}
      ${kpiCard("Imóveis locados no mês", locadosThisMonth.length, deltaLocados, "un.")}
      ${kpiCard("Taxa de conversão", overall.conversaoFechados.toFixed(0) + "%", null, "", "Locado ÷ processos fechados")}
      ${kpiCard("Tempo médio até locação", overall.tempoMedio != null ? Math.round(overall.tempoMedio) : "—", null, "dias")}
      ${kpiCard("Em andamento agora", STATE.imoveis.filter(i => STATUS_FLOW.includes(i.status) && i.status !== "Locado").length, null, "imóveis")}
      ${kpiCard("Comissão estimada (mês)", fmtMoney(comissaoEstMes), null, "")}
      ${kpiCard("Comissão recebida (mês)", fmtMoney(comissaoRecMes), null, "")}
      ${kpiCard("Valor médio de aluguel", fmtMoney(overall.valorMedioAluguel), null, "")}
    </div>

    <div class="grid grid-2" style="margin-bottom:16px;">
      <div class="card chart-card">
        <div class="card-title">Angariações por mês <span class="section-note">últimos 6 meses</span></div>
        <div class="chart-wrap"><canvas id="chart-angariacoes-mes"></canvas></div>
      </div>
      <div class="card chart-card">
        <div class="card-title">Locados vs. angariados por mês</div>
        <div class="chart-wrap"><canvas id="chart-locados-mes"></canvas></div>
      </div>
    </div>

    <div class="grid grid-2" style="margin-bottom:16px;">
      <div class="card chart-card">
        <div class="card-title">Imóveis no pipeline por bairro <span class="section-note">top 8 · todos os status</span></div>
        <div class="chart-wrap"><canvas id="chart-bairro"></canvas></div>
      </div>
      <div class="card chart-card">
        <div class="card-title">Tipos de imóveis no pipeline <span class="section-note">todos os status</span></div>
        <div class="chart-wrap"><canvas id="chart-tipos"></canvas></div>
      </div>
    </div>

    <div class="grid grid-2">
      <div class="card chart-card">
        <div class="card-title">Comissão: estimada vs. recebida <span class="section-note">últimos 6 meses</span></div>
        <div class="chart-wrap"><canvas id="chart-comissao"></canvas></div>
      </div>
      <div class="card chart-card">
        <div class="card-title">Funil atual do pipeline</div>
        <div class="chart-wrap"><canvas id="chart-funil"></canvas></div>
      </div>
    </div>
  `;
}

function kpiCard(label, value, delta, unit, hint, description) {
  let deltaHtml = "";
  if (delta !== null && delta !== undefined) {
    const cls = delta > 0 ? "up" : delta < 0 ? "down" : "flat";
    const arrow = delta > 0 ? "▲" : delta < 0 ? "▼" : "•";
    deltaHtml = `<div class="kpi-delta ${cls}">${arrow} ${delta > 0 ? "+" : ""}${delta} vs. mês anterior</div>`;
  } else if (hint) {
    deltaHtml = `<div class="kpi-delta flat">${hint}</div>`;
  }
  const descHtml = description ? `<div class="kpi-desc">${description}</div>` : "";
  return `
    <div class="card kpi-card">
      <div class="kpi-label">${label}</div>
      <div class="kpi-value">${value}${unit ? ` <small>${unit}</small>` : ""}</div>
      ${deltaHtml}
      ${descHtml}
    </div>`;
}

const CHART_COLORS = ["#d98a4f", "#6fa8c9", "#9b8fd9", "#5fb896", "#e0b458", "#d97878", "#7bd4b2", "#e08f8f"];

function chartDefaults() {
  Chart.defaults.color = "#9aa1ad";
  Chart.defaults.font.family = "-apple-system, BlinkMacSystemFont, Segoe UI, Inter, Roboto, sans-serif";
  Chart.defaults.font.size = 11.5;
  Chart.defaults.borderColor = "#2c323d";
}

function afterRenderDashboard() {
  if (STATE.imoveis.length === 0) return;
  if (typeof Chart === "undefined") {
    document.querySelectorAll(".chart-wrap").forEach((el) => {
      el.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-faint);font-size:12.5px;text-align:center;padding:0 16px;">Não foi possível carregar a biblioteca de gráficos.<br>Verifique sua conexão com a internet e recarregue a página.</div>`;
    });
    return;
  }
  chartDefaults();
  const keys = last6MonthKeys();
  const labels = keys.map(monthLabel);

  chartInstances.angariacoesMes = new Chart(document.getElementById("chart-angariacoes-mes"), {
    type: "bar",
    data: { labels, datasets: [{ label: "Angariações", data: keys.map(k => imoveisAngariadosNoMes(k).length), backgroundColor: "#d98a4f", borderRadius: 5, maxBarThickness: 34 }] },
    options: baseBarOptions(),
  });

  chartInstances.locadosMes = new Chart(document.getElementById("chart-locados-mes"), {
    type: "bar",
    data: {
      labels,
      datasets: [
        { label: "Angariados", data: keys.map(k => imoveisAngariadosNoMes(k).length), backgroundColor: "#3a4150", borderRadius: 5, maxBarThickness: 26 },
        { label: "Locados", data: keys.map(k => imoveisLocadosNoMes(k).length), backgroundColor: "#5fb896", borderRadius: 5, maxBarThickness: 26 },
      ],
    },
    options: { ...baseBarOptions(), plugins: { legend: { display: true, position: "top", align: "end", labels: { boxWidth: 10, boxHeight: 10, usePointStyle: true, pointStyle: "circle" } } } },
  });

  const bairroCounts = groupCount(STATE.imoveis, i => i.bairro);
  const bairroSorted = Object.entries(bairroCounts).sort((a, b) => b[1] - a[1]).slice(0, 8);
  chartInstances.bairro = new Chart(document.getElementById("chart-bairro"), {
    type: "bar",
    data: { labels: bairroSorted.map(x => x[0]), datasets: [{ data: bairroSorted.map(x => x[1]), backgroundColor: "#6fa8c9", borderRadius: 5, maxBarThickness: 22 }] },
    options: { ...baseBarOptions(), indexAxis: "y" },
  });

  const tipoCounts = groupCount(STATE.imoveis, i => i.tipo);
  const tipoSorted = Object.entries(tipoCounts).sort((a, b) => b[1] - a[1]);
  chartInstances.tipos = new Chart(document.getElementById("chart-tipos"), {
    type: "doughnut",
    data: { labels: tipoSorted.map(x => x[0]), datasets: [{ data: tipoSorted.map(x => x[1]), backgroundColor: CHART_COLORS, borderColor: "#181c23", borderWidth: 2 }] },
    options: { plugins: { legend: { position: "right", labels: { boxWidth: 10, boxHeight: 10, usePointStyle: true, pointStyle: "circle", padding: 10 } } }, maintainAspectRatio: false, responsive: true },
  });

  const comEst = keys.map(k => imoveisAngariadosNoMes(k).reduce((s, i) => s + comissaoEstimada(i), 0));
  const comRec = keys.map(k => STATE.imoveis.filter(i => i.status === "Locado" && i.comissaoRecebida && monthKey(i.comissaoRecebidaData) === k).reduce((s, i) => s + comissaoRecebidaValor(i), 0));
  chartInstances.comissao = new Chart(document.getElementById("chart-comissao"), {
    type: "line",
    data: {
      labels,
      datasets: [
        { label: "Estimada", data: comEst, borderColor: "#e0b458", backgroundColor: "#e0b45822", tension: .35, fill: true },
        { label: "Recebida", data: comRec, borderColor: "#5fb896", backgroundColor: "#5fb89622", tension: .35, fill: true },
      ],
    },
    options: { ...baseBarOptions(), plugins: { legend: { display: true, position: "top", align: "end", labels: { boxWidth: 10, boxHeight: 10, usePointStyle: true, pointStyle: "circle" } } }, scales: { ...baseBarOptions().scales, y: { ...baseBarOptions().scales.y, ticks: { callback: v => fmtMoney(v) } } } },
  });

  const funilCounts = STATUS_FLOW.map(s => STATE.imoveis.filter(i => i.status === s).length);
  chartInstances.funil = new Chart(document.getElementById("chart-funil"), {
    type: "bar",
    data: { labels: STATUS_FLOW, datasets: [{ data: funilCounts, backgroundColor: STATUS_FLOW.map((_, idx) => CHART_COLORS[idx % CHART_COLORS.length]), borderRadius: 5, maxBarThickness: 22 }] },
    options: { ...baseBarOptions(), indexAxis: "y" },
  });
}

function baseBarOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { grid: { display: false }, border: { display: false } },
      y: { grid: { color: "#232830" }, border: { display: false }, beginAtZero: true, ticks: { precision: 0 } },
    },
  };
}

function switchView(v) {
  currentView = v;
  document.querySelectorAll(".nav-item[data-view]").forEach((b) => b.classList.toggle("active", b.dataset.view === v));
  renderCurrentView();
}

/* ================================================================
   5B. VIEW: PIPELINE (Kanban / Lista)
   ================================================================ */
let pipelineFilters = { search: "", tipo: "", bairro: "", status: "", responsavel: "", cidade: "" };
let pipelineDrawerImovelId = null;

function viewPipeline() {
  const bairros = [...new Set(STATE.imoveis.map(i => i.bairro).filter(Boolean))].sort();

  return `
    <div class="page-head">
      <div><h1 class="page-title">Pipeline</h1><p class="page-sub">${STATE.imoveis.length} imóveis cadastrados</p></div>
      <div class="page-actions">
        <button class="btn btn-primary" onclick="openImovelModal()">+ Nova angariação</button>
      </div>
    </div>

    <div class="pipeline-toolbar">
      <div style="display:flex; gap:10px; flex-wrap:wrap; align-items:center;">
        <input type="text" class="search-input" placeholder="Buscar por código, endereço ou proprietário..." value="${escapeHtml(pipelineFilters.search)}" oninput="pipelineFilters.search=this.value; renderCurrentView();">
        <select class="filter-select" onchange="pipelineFilters.tipo=this.value; renderCurrentView();">
          <option value="">Todos os tipos</option>
          ${TIPOS_IMOVEL.map(t => `<option value="${t}" ${pipelineFilters.tipo === t ? "selected" : ""}>${t}</option>`).join("")}
        </select>
        <select class="filter-select" onchange="pipelineFilters.bairro=this.value; renderCurrentView();">
          <option value="">Todos os bairros</option>
          ${bairros.map(b => `<option value="${escapeHtml(b)}" ${pipelineFilters.bairro === b ? "selected" : ""}>${escapeHtml(b)}</option>`).join("")}
        </select>
      </div>
      <div class="view-toggle">
        <button class="${pipelineViewMode === "kanban" ? "active" : ""}" onclick="pipelineViewMode='kanban'; renderCurrentView();">Kanban</button>
        <button class="${pipelineViewMode === "lista" ? "active" : ""}" onclick="pipelineViewMode='lista'; renderCurrentView();">Lista</button>
      </div>
    </div>

    ${pipelineViewMode === "kanban" ? renderKanban() : renderLista()}
  `;
}

function filteredImoveis() {
  const s = pipelineFilters.search.toLowerCase().trim();
  return STATE.imoveis.filter(i => {
    if (pipelineFilters.tipo && i.tipo !== pipelineFilters.tipo) return false;
    if (pipelineFilters.bairro && i.bairro !== pipelineFilters.bairro) return false;
    if (s && !(`${i.codigo} ${i.endereco} ${i.proprietarioNome}`.toLowerCase().includes(s))) return false;
    return true;
  });
}

function renderKanban() {
  const imoveis = filteredImoveis();
  return `<div class="kanban">
    ${STATUS_ALL.map(status => {
      const items = imoveis.filter(i => i.status === status).sort((a, b) => (b.dataAngariacao || "").localeCompare(a.dataAngariacao || ""));
      const color = STATUS_COLORS[status] || "#3a4150";
      return `
      <div class="kanban-col" style="--col-color:${color};">
        <div class="kanban-col-head" style="--col-bg:${color}12;">
          <span class="badge" data-status="${status}"><span class="dot"></span>${status}</span>
          <span class="kanban-col-count">${items.length}</span>
        </div>
        <div class="kanban-col-body">
          ${items.length === 0 ? `<div class="kanban-empty">Nenhum imóvel</div>` : items.map(i => renderKanbanCard(i, color)).join("")}
        </div>
      </div>`;
    }).join("")}
  </div>`;
}

function renderKanbanCard(i, color) {
  const stale = isStale(i);
  const paused = isPausado(i);
  const dias = daysInCurrentStatus(i);
  let metaBadge = "";
  if (paused) {
    metaBadge = `<span class="kanban-card-days kanban-card-paused">⏸ até ${fmtDate(i.pausadoAte)}</span>`;
  } else if (dias != null) {
    metaBadge = `<span class="kanban-card-days ${stale ? "kanban-card-stale" : ""}">${stale ? `⚠ ${dias}d parado` : `${dias}d`}</span>`;
  }
  return `
    <div class="kanban-card" style="--col-color:${color};" onclick="openImovelModal('${i.id}')">
      <div class="kanban-card-code">${escapeHtml(i.codigo || "s/ código")}</div>
      <div class="kanban-card-addr">${escapeHtml(i.endereco)}${i.bairro ? `, ${escapeHtml(i.bairro)}` : ""}</div>
      <div class="kanban-card-meta">
        <span class="kanban-card-rent">${fmtMoney(i.valorAluguel)}</span>
        ${metaBadge}
      </div>
      ${i.imobiliariaConcorrente ? `<div class="kanban-card-concorrente">🏢 ${escapeHtml(i.imobiliariaConcorrente)}</div>` : ""}
      ${i.status === "Perdido" || i.status === "Cancelado" ? (i.motivoPerda ? `<div class="kanban-card-motivo">${escapeHtml(i.motivoPerda === "Outro" ? (i.motivoPerdaOutro || "Outro motivo") : i.motivoPerda)}</div>` : "") : ""}
    </div>`;
}

function renderLista() {
  const imoveis = filteredImoveis().sort((a, b) => (b.dataAngariacao || "").localeCompare(a.dataAngariacao || ""));
  if (imoveis.length === 0) {
    return `<div class="empty-state card"><h3>Nenhum imóvel encontrado</h3><p>Ajuste os filtros ou cadastre uma nova angariação.</p></div>`;
  }
  return `
    <div class="card table-scroll" style="padding:0;">
      <table>
        <thead><tr>
          <th>Código</th><th>Endereço</th><th>Bairro</th><th>Tipo</th><th>Origem</th><th>Aluguel</th><th>Status</th><th>Angariado em</th><th>Responsável</th><th></th>
        </tr></thead>
        <tbody>
          ${imoveis.map(i => `
            <tr onclick="openImovelModal('${i.id}')" style="cursor:pointer;">
              <td class="cell-strong">${escapeHtml(i.codigo || "—")}</td>
              <td>${escapeHtml(i.endereco)}</td>
              <td class="cell-dim">${escapeHtml(i.bairro || "—")}</td>
              <td class="cell-dim">${escapeHtml(i.tipo || "—")}</td>
              <td class="cell-dim">${escapeHtml(i.origemImovel || "—")}</td>
              <td>${fmtMoney(i.valorAluguel)}</td>
              <td><span class="badge" data-status="${i.status}"><span class="dot"></span>${i.status}</span> ${isStale(i) ? `<span class="stale-flag">parado</span>` : ""}</td>
              <td class="cell-dim">${fmtDate(i.dataAngariacao)}</td>
              <td class="cell-dim">${escapeHtml(i.responsavel || "—")}</td>
              <td><button class="icon-btn btn-danger" onclick="event.stopPropagation(); deleteImovel('${i.id}')" title="Excluir">✕</button></td>
            </tr>`).join("")}
        </tbody>
      </table>
    </div>`;
}

function afterRenderPipeline() {}

function viewPipelineEnhanced() {
  const bairros = pipelineUniqueSorted(STATE.imoveis.map(i => i.bairro));
  const cidades = pipelineUniqueSorted(STATE.imoveis.map(i => i.cidade));
  const responsaveis = pipelineUniqueSorted(STATE.imoveis.map(i => i.responsavel));
  const imoveisFiltrados = filteredImoveisEnhanced();

  return `
    <div class="page-head">
      <div><h1 class="page-title">Pipeline</h1><p class="page-sub">${STATE.imoveis.length} im&oacute;veis cadastrados</p></div>
      <div class="page-actions">
        <button class="btn btn-primary" onclick="openImovelModal()">+ Nova angaria&ccedil;&atilde;o</button>
      </div>
    </div>

    <div class="pipeline-toolbar pipeline-toolbar-enhanced">
      <div class="pipeline-filterbar">
        <input type="text" class="search-input pipeline-search" placeholder="Buscar por c&oacute;digo, propriet&aacute;rio, endere&ccedil;o, bairro, cidade, telefone ou tipo..." value="${escapeHtml(pipelineFilters.search)}" oninput="onPipelineSearchInput(this.value)">
        <select class="filter-select" onchange="pipelineFilters.tipo=this.value; renderCurrentView();">
          <option value="">Todos os tipos</option>
          ${TIPOS_IMOVEL.map(t => `<option value="${escapeHtml(t)}" ${pipelineFilters.tipo === t ? "selected" : ""}>${escapeHtml(t)}</option>`).join("")}
        </select>
        <select class="filter-select" onchange="pipelineFilters.bairro=this.value; renderCurrentView();">
          <option value="">Todos os bairros</option>
          ${bairros.map(b => `<option value="${escapeHtml(b)}" ${pipelineFilters.bairro === b ? "selected" : ""}>${escapeHtml(b)}</option>`).join("")}
        </select>
        <select class="filter-select" onchange="pipelineFilters.status=this.value; renderCurrentView();">
          <option value="">Todos os status</option>
          ${STATUS_ALL.map(s => `<option value="${escapeHtml(s)}" ${pipelineFilters.status === s ? "selected" : ""}>${escapeHtml(s)}</option>`).join("")}
        </select>
        <select class="filter-select" onchange="pipelineFilters.responsavel=this.value; renderCurrentView();">
          <option value="">Todos os captadores</option>
          ${responsaveis.map(r => `<option value="${escapeHtml(r)}" ${pipelineFilters.responsavel === r ? "selected" : ""}>${escapeHtml(r)}</option>`).join("")}
        </select>
        <select class="filter-select" onchange="pipelineFilters.cidade=this.value; renderCurrentView();">
          <option value="">Todas as cidades</option>
          ${cidades.map(c => `<option value="${escapeHtml(c)}" ${pipelineFilters.cidade === c ? "selected" : ""}>${escapeHtml(c)}</option>`).join("")}
        </select>
      </div>
      <div class="pipeline-toolbar-side">
        <span class="pipeline-result-count" id="pipeline-result-count">${imoveisFiltrados.length} de ${STATE.imoveis.length}</span>
        <div class="view-toggle">
          <button class="${pipelineViewMode === "lista" ? "active" : ""}" onclick="pipelineViewMode='lista'; renderCurrentView();">Lista</button>
          <button class="${pipelineViewMode === "kanban" ? "active" : ""}" onclick="pipelineViewMode='kanban'; closePipelineDrawer(); renderCurrentView();">Kanban</button>
        </div>
      </div>
    </div>

    <div id="pipeline-results">${pipelineViewMode === "kanban" ? renderKanbanEnhanced() : renderListaEnhanced()}</div>
    ${renderPipelineDrawer()}
  `;
}

function pipelineUniqueSorted(values) {
  return [...new Set(values.map(v => (v || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "pt-BR"));
}

// Digitar na busca do pipeline não pode recriar a barra de filtros/input a
// cada tecla (isso rouba o foco do campo). Por isso, o texto é aplicado a
// pipelineFilters.search na hora, mas o re-render fica com debounce e atinge
// só o container de resultados + contador — o input em si nunca é recriado.
let pipelineSearchDebounceTimer = null;
function onPipelineSearchInput(value) {
  pipelineFilters.search = value;
  clearTimeout(pipelineSearchDebounceTimer);
  pipelineSearchDebounceTimer = setTimeout(updatePipelineResults, 180);
}

function updatePipelineResults() {
  const resultsEl = document.getElementById("pipeline-results");
  if (!resultsEl) return; // usuário já saiu da view Pipeline
  const countEl = document.getElementById("pipeline-result-count");
  if (countEl) countEl.textContent = `${filteredImoveisEnhanced().length} de ${STATE.imoveis.length}`;
  resultsEl.innerHTML = pipelineViewMode === "kanban" ? renderKanbanEnhanced() : renderListaEnhanced();
}

function filteredImoveisEnhanced() {
  const s = (pipelineFilters.search || "").toLowerCase().trim();
  return STATE.imoveis.filter(i => {
    if (pipelineFilters.tipo && i.tipo !== pipelineFilters.tipo) return false;
    if (pipelineFilters.bairro && i.bairro !== pipelineFilters.bairro) return false;
    if (pipelineFilters.status && i.status !== pipelineFilters.status) return false;
    if (pipelineFilters.responsavel && i.responsavel !== pipelineFilters.responsavel) return false;
    if (pipelineFilters.cidade && i.cidade !== pipelineFilters.cidade) return false;
    const haystack = [
      i.codigo, i.proprietarioNome, i.endereco, i.bairro, i.cidade,
      i.proprietarioTelefone, i.tipo,
    ].join(" ").toLowerCase();
    if (s && !haystack.includes(s)) return false;
    return true;
  });
}

function renderKanbanEnhanced() {
  const imoveis = filteredImoveisEnhanced();
  return `<div class="kanban">
    ${STATUS_ALL.map(status => {
      const items = imoveis.filter(i => i.status === status).sort((a, b) => (b.dataAngariacao || "").localeCompare(a.dataAngariacao || ""));
      const color = STATUS_COLORS[status] || "#3a4150";
      return `
      <div class="kanban-col" style="--col-color:${color};">
        <div class="kanban-col-head" style="--col-bg:${color}12;">
          <span class="badge" data-status="${status}"><span class="dot"></span>${status}</span>
          <span class="kanban-col-count">${items.length}</span>
        </div>
        <div class="kanban-col-body">
          ${items.length === 0 ? `<div class="kanban-empty">Nenhum im&oacute;vel</div>` : items.map(i => renderKanbanCard(i, color)).join("")}
        </div>
      </div>`;
    }).join("")}
  </div>`;
}

function renderListaEnhanced() {
  const imoveis = filteredImoveisEnhanced().sort((a, b) => (b.dataAngariacao || "").localeCompare(a.dataAngariacao || ""));
  if (imoveis.length === 0) {
    return `<div class="empty-state card"><h3>Nenhum im&oacute;vel encontrado</h3><p>Ajuste os filtros ou cadastre uma nova angaria&ccedil;&atilde;o.</p></div>`;
  }
  return `
    <div class="card table-scroll pipeline-list-card">
      <table>
        <thead><tr>
          <th>C&oacute;digo</th><th>Endere&ccedil;o</th><th>Bairro</th><th>Tipo</th><th>Origem</th><th>Aluguel</th><th>Status</th><th>Cadastro</th><th>Captador</th><th></th>
        </tr></thead>
        <tbody>
          ${imoveis.map(i => `
            <tr class="pipeline-list-row ${pipelineDrawerImovelId === i.id ? "selected" : ""}" onclick="openPipelineDrawer('${i.id}')">
              <td class="cell-strong">${escapeHtml(i.codigo || "-")}</td>
              <td>${escapeHtml(i.endereco || "-")}</td>
              <td class="cell-dim">${escapeHtml(i.bairro || "-")}</td>
              <td class="cell-dim">${escapeHtml(i.tipo || "-")}</td>
              <td class="cell-dim">${escapeHtml(i.origemImovel || "-")}</td>
              <td>${fmtMoney(i.valorAluguel)}</td>
              <td><span class="badge" data-status="${i.status}"><span class="dot"></span>${escapeHtml(i.status || "-")}</span> ${isStale(i) ? `<span class="stale-flag">parado</span>` : ""}</td>
              <td class="cell-dim">${fmtDate(i.dataAngariacao)}</td>
              <td class="cell-dim">${escapeHtml(i.responsavel || "-")}</td>
              <td><button class="icon-btn btn-danger" onclick="event.stopPropagation(); deleteImovel('${i.id}')" title="Excluir">&times;</button></td>
            </tr>`).join("")}
        </tbody>
      </table>
    </div>`;
}

function renderPipelineDrawer() {
  const imovel = pipelineDrawerImovelId ? STATE.imoveis.find(i => i.id === pipelineDrawerImovelId) : null;
  if (!imovel || pipelineViewMode !== "lista") return "";
  const enderecoCompleto = [imovel.endereco, imovel.bairro, imovel.cidade].filter(Boolean).join(", ");
  const fotos = Array.isArray(imovel.fotos) ? imovel.fotos.filter(Boolean) : [];
  return `
    <div class="pipeline-drawer-backdrop" onclick="closePipelineDrawer(); renderCurrentView();"></div>
    <aside class="pipeline-drawer" aria-label="Detalhes do imovel">
      <div class="pipeline-drawer-head">
        <div>
          <div class="pipeline-drawer-kicker">Im&oacute;vel selecionado</div>
          <h2>${escapeHtml(imovel.codigo || "Sem codigo")}</h2>
        </div>
        <button class="icon-btn" onclick="closePipelineDrawer(); renderCurrentView();" title="Fechar painel">&times;</button>
      </div>
      <div class="pipeline-drawer-body">
        <div class="drawer-status-line">
          <span class="badge" data-status="${imovel.status}"><span class="dot"></span>${escapeHtml(imovel.status || "-")}</span>
          ${isStale(imovel) ? `<span class="stale-flag">parado</span>` : ""}
        </div>
        <div class="drawer-info-grid">
          ${drawerInfo("Codigo", imovel.codigo || "-")}
          ${drawerInfo("Proprietario", imovel.proprietarioNome || "-")}
          ${drawerInfo("Telefones", imovel.proprietarioTelefone || "-")}
          ${drawerInfo("Endereco completo", enderecoCompleto || "-")}
          ${drawerInfo("Bairro", imovel.bairro || "-")}
          ${drawerInfo("Cidade", imovel.cidade || "-")}
          ${drawerInfo("Tipo", imovel.tipo || "-")}
          ${drawerInfo("Valor", fmtMoney(imovel.valorAluguel))}
          ${drawerInfo("Status", imovel.status || "-")}
          ${drawerInfo("Data de cadastro", fmtDate(imovel.dataAngariacao))}
        </div>
        <div class="drawer-section">
          <div class="drawer-section-title">Observacoes</div>
          <div class="drawer-notes">${escapeHtml(imovel.observacoes || "Sem observacoes cadastradas.")}</div>
        </div>
        <div class="drawer-section">
          <div class="drawer-section-title">Fotos</div>
          ${fotos.length ? `<div class="drawer-photos">${fotos.map(src => `<img src="${escapeHtml(src)}" alt="Foto do imovel">`).join("")}</div>` : `<div class="drawer-empty-photos">Sem fotos cadastradas.</div>`}
        </div>
      </div>
      <div class="pipeline-drawer-foot">
        <button class="btn btn-ghost" onclick="closePipelineDrawer(); renderCurrentView();">Fechar painel</button>
        <button class="btn btn-ghost btn-danger" onclick="deleteImovel('${imovel.id}')">Excluir</button>
        <button class="btn btn-primary" onclick="openImovelModal('${imovel.id}')">Editar</button>
      </div>
    </aside>`;
}

function drawerInfo(label, value) {
  return `<div class="drawer-info-item"><span>${label}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function openPipelineDrawer(id) {
  pipelineDrawerImovelId = id;
  renderCurrentView();
}

function closePipelineDrawer() {
  pipelineDrawerImovelId = null;
}

async function deleteImovel(id) {
  const imovel = STATE.imoveis.find(i => i.id === id);
  if (!imovel) return;
  if (!confirm(`Excluir o imóvel "${imovel.codigo || imovel.endereco}"? Essa ação não pode ser desfeita.`)) return;

  const { error } = await supabaseClient.from("imoveis").delete().eq("id", id);
  if (error) { toast("Não foi possível excluir: " + error.message, "error"); return; }
  await supabaseClient.from("agenda").delete().eq("imovel_id", id);

  STATE.imoveis = STATE.imoveis.filter(i => i.id !== id);
  STATE.agenda = STATE.agenda.filter(a => a.imovelId !== id);
  refresh();
  toast("Imóvel excluído.");
}

/* ================================================================
   6A. MODAL: IMÓVEL (criação / edição)
   ================================================================ */
let editingImovelId = null;

function imobiliariasConcorrentesOptions(currentValue = "") {
  const nomes = [
    ...STATE.imoveis.map(i => i.imobiliariaConcorrente),
    currentValue,
  ]
    .map(v => (v || "").trim())
    .filter(Boolean);
  return [...new Set(nomes)]
    .sort((a, b) => a.localeCompare(b, "pt-BR"))
    .map(nome => `<option value="${escapeHtml(nome)}"></option>`)
    .join("");
}

function setupImobiliariaConcorrenteField(currentValue = "") {
  const input = document.getElementById("f-imobiliariaConcorrente");
  if (!input) return;
  input.setAttribute("list", "imobiliarias-concorrentes-list");
  input.setAttribute("placeholder", "Selecione ou digite uma nova imobiliária");

  let list = document.getElementById("imobiliarias-concorrentes-list");
  if (!list) {
    list = document.createElement("datalist");
    list.id = "imobiliarias-concorrentes-list";
    input.insertAdjacentElement("afterend", list);
  }
  list.innerHTML = imobiliariasConcorrentesOptions(currentValue);

  const hint = input.closest(".field-group")?.querySelector(".field-hint");
  if (hint) {
    hint.textContent = "Selecione uma imobiliária já usada ou digite um novo nome. Ao salvar, o novo nome aparecerá como opção nos próximos cadastros.";
  }
}

function openImovelModal(id) {
  editingImovelId = id || null;
  const imovel = id ? STATE.imoveis.find(i => i.id === id) : null;
  const d = imovel || {
    codigo: "", cep: "", endereco: "", bairro: "", cidade: "Londrina", tipo: "Apartamento",
    quartos: "", banheiros: "", vagas: "", valorAluguel: "", valorCondominio: "",
    proprietarioNome: "", proprietarioTelefone: "", dataAngariacao: todayISO(),
    responsavel: "", status: "Novo contato", observacoes: "",
    formaAbordagem: FORMAS_ABORDAGEM[0], origemImovel: ORIGENS_IMOVEL[0],
    imobiliariaConcorrente: "",
    latitude: null, longitude: null,
    pausadoAte: null, motivoPerda: "", motivoPerdaOutro: "",
    comissaoRecebida: false, comissaoRecebidaValor: "", comissaoRecebidaData: "",
  };

  document.getElementById("modal-box").innerHTML = `
    <div class="modal-head">
      <div class="modal-title">${imovel ? "Editar imóvel" : "Nova angariação"}</div>
      <button class="icon-btn" onclick="closeModal()">✕</button>
    </div>
    <div class="modal-body">
      <fieldset>
        <legend>Dados do imóvel</legend>
        <div class="field-row">
          <div class="field-group"><label>Código do imóvel</label><input type="text" id="f-codigo" value="${escapeHtml(d.codigo)}" placeholder="Ex: LD-0234"></div>
          <div class="field-group"><label>Tipo do imóvel</label>
            <select id="f-tipo">${TIPOS_IMOVEL.map(t => `<option value="${t}" ${d.tipo === t ? "selected" : ""}>${t}</option>`).join("")}</select>
          </div>
        </div>
        <div class="field-group">
          <label>CEP</label>
          <div class="geocode-box">
            <input type="text" id="f-cep" value="${escapeHtml(d.cep || "")}" placeholder="00000-000" maxlength="9" style="max-width:160px;" oninput="maskCEP(this)" onblur="if(this.value.replace(/\\D/g,'').length===8) buscarCEP();">
            <button type="button" class="btn btn-sm" onclick="buscarCEP()">🔍 Buscar CEP</button>
            <span class="geocode-status" id="cep-status"></span>
          </div>
          <div class="field-hint">Preenche endereço, bairro e cidade automaticamente e já localiza no mapa.</div>
        </div>
        <div class="field-group"><label>Endereço</label><input type="text" id="f-endereco" value="${escapeHtml(d.endereco)}" placeholder="Rua, número"></div>
        <div class="field-row">
          <div class="field-group"><label>Bairro</label><input type="text" id="f-bairro" value="${escapeHtml(d.bairro)}"></div>
          <div class="field-group"><label>Cidade</label><input type="text" id="f-cidade" value="${escapeHtml(d.cidade)}"></div>
        </div>
        <div class="field-row-3">
          <div class="field-group"><label>Quartos</label><input type="number" min="0" id="f-quartos" value="${d.quartos}"></div>
          <div class="field-group"><label>Banheiros</label><input type="number" min="0" id="f-banheiros" value="${d.banheiros}"></div>
          <div class="field-group"><label>Vagas de garagem</label><input type="number" min="0" id="f-vagas" value="${d.vagas}"></div>
        </div>
        <div class="field-row">
          <div class="field-group"><label>Valor do aluguel (R$)</label><input type="number" min="0" step="0.01" id="f-valorAluguel" value="${d.valorAluguel}"></div>
          <div class="field-group"><label>Valor do condomínio (R$)</label><input type="number" min="0" step="0.01" id="f-valorCondominio" value="${d.valorCondominio}"></div>
        </div>
        <div class="field-group"><label>Onde encontrou o imóvel</label>
          <select id="f-origemImovel">${ORIGENS_IMOVEL.map(o => `<option value="${o}" ${d.origemImovel === o ? "selected" : ""}>${o}</option>`).join("")}</select>
        </div>
        <div class="field-group">
          <label>Já está com outra imobiliária?</label>
          <input type="text" id="f-imobiliariaConcorrente" value="${escapeHtml(d.imobiliariaConcorrente || "")}" placeholder="Nome da imobiliária concorrente, se souber">
          <div class="field-hint">Preencha se o proprietário mencionar que o imóvel já está anunciado ou sendo negociado por outra imobiliária.</div>
        </div>
      </fieldset>

      <fieldset>
        <legend>Localização no mapa</legend>
        <div class="geocode-box">
          <button type="button" class="btn btn-sm" onclick="geocodeEndereco()">📍 Buscar aproximado</button>
          <button type="button" class="btn btn-sm" onclick="abrirNoGoogleMaps()">🔗 Conferir no Google Maps</button>
          <span class="geocode-status" id="geocode-status">${d.latitude ? "Localização definida" : "Ainda não localizado"}</span>
        </div>
        <div id="map-mini" class="${d.latitude ? "visible" : ""}"></div>
        <div class="map-mini-hint"><strong>Para o pino ficar no lugar certo:</strong> clique em "Conferir no Google Maps" pra ver a casa exata, depois clique nesse ponto aqui no mapinha abaixo (não precisa arrastar — um clique já reposiciona o pino).</div>
        <input type="hidden" id="f-latitude" value="${d.latitude ?? ""}">
        <input type="hidden" id="f-longitude" value="${d.longitude ?? ""}">
      </fieldset>

      <fieldset>
        <legend>Proprietário</legend>
        <div class="field-row">
          <div class="field-group"><label>Nome do proprietário</label><input type="text" id="f-proprietarioNome" value="${escapeHtml(d.proprietarioNome)}"></div>
          <div class="field-group"><label>Telefone</label><input type="tel" id="f-proprietarioTelefone" value="${escapeHtml(d.proprietarioTelefone)}" placeholder="(43) 9...."></div>
        </div>
        <div class="field-group"><label>Forma de abordagem</label>
          <select id="f-formaAbordagem">${FORMAS_ABORDAGEM.map(a => `<option value="${a}" ${d.formaAbordagem === a ? "selected" : ""}>${a}</option>`).join("")}</select>
        </div>
      </fieldset>

      <fieldset>
        <legend>Funil &amp; status</legend>
        <div class="field-row">
          <div class="field-group"><label>Data do primeiro contato</label><input type="date" id="f-dataAngariacao" value="${d.dataAngariacao}"></div>
          <div class="field-group"><label>Responsável</label><input type="text" id="f-responsavel" value="${escapeHtml(d.responsavel)}"></div>
        </div>
        <div class="field-group">
          <label>Status atual</label>
          <select id="f-status">${STATUS_ALL.map(s => `<option value="${s}" ${d.status === s ? "selected" : ""}>${s}</option>`).join("")}</select>
          <div class="field-hint">O imóvel só conta como "angariado" nas metas e no dashboard quando o status chega em <strong>Angariado</strong> — mudar o status registra a data automaticamente para esse e outros cálculos.</div>
        </div>
        <div class="field-group"><label>Observações</label><textarea id="f-observacoes" placeholder="Notas gerais, combinados com o proprietário...">${escapeHtml(d.observacoes || "")}</textarea></div>
      </fieldset>

      <fieldset id="fieldset-pausa" style="${(STATUS_TERMINAL_NEGATIVE.includes(d.status) || d.status === 'Locado') ? 'display:none;' : ''}">
        <legend>Pausar follow-up</legend>
        <div class="field-group">
          <label>Retomar contato a partir de</label>
          <input type="date" id="f-pausadoAte" value="${d.pausadoAte || ""}">
          <div class="field-hint">Use quando o proprietário pedir pra falar depois (viagem, férias, etc). Enquanto a data não chegar, o sistema não marca esse imóvel como "parado".</div>
        </div>
        <div class="field-group" id="pausa-lembrete-wrap" style="${d.pausadoAte ? "" : "display:none;"}">
          <label style="display:flex; align-items:center; gap:8px; text-transform:none; font-size:13px; cursor:pointer;">
            <input type="checkbox" id="f-criarLembretePausa" style="width:auto;" checked>
            Criar lembrete na agenda para essa data
          </label>
        </div>
      </fieldset>

      <fieldset id="fieldset-motivo" style="${STATUS_TERMINAL_NEGATIVE.includes(d.status) && d.status !== 'Sem resposta' ? '' : 'display:none;'}">
        <legend>Motivo</legend>
        <div class="field-group">
          <label>Por que não avançou</label>
          <select id="f-motivoPerda" onchange="document.getElementById('motivo-outro-wrap').style.display = this.value === 'Outro' ? '' : 'none';">
            <option value="">Não informado</option>
            ${MOTIVOS_PERDA.map(m => `<option value="${m}" ${d.motivoPerda === m ? "selected" : ""}>${m}</option>`).join("")}
          </select>
        </div>
        <div class="field-group" id="motivo-outro-wrap" style="${d.motivoPerda === "Outro" ? "" : "display:none;"}">
          <label>Detalhe</label>
          <input type="text" id="f-motivoPerdaOutro" value="${escapeHtml(d.motivoPerdaOutro || "")}" placeholder="Descreva o motivo">
        </div>
      </fieldset>

      <fieldset id="fieldset-comissao" style="${d.status === 'Locado' ? '' : 'display:none;'}">
        <legend>Comissão</legend>
        <div class="field-group">
          <label style="display:flex; align-items:center; gap:8px; text-transform:none; font-size:13px; cursor:pointer;">
            <input type="checkbox" id="f-comissaoRecebida" style="width:auto;" ${d.comissaoRecebida ? "checked" : ""} onchange="document.getElementById('comissao-detalhe').style.display=this.checked?'grid':'none'">
            Comissão recebida
          </label>
        </div>
        <div class="field-row" id="comissao-detalhe" style="${d.comissaoRecebida ? "display:grid;" : "display:none;"}">
          <div class="field-group"><label>Valor recebido (R$)</label><input type="number" min="0" step="0.01" id="f-comissaoRecebidaValor" value="${d.comissaoRecebidaValor}" placeholder="Estimativa: ${fmtMoney((d.valorAluguel||0)*(STATE.config.comissaoPercent/100))}"></div>
          <div class="field-group"><label>Data do recebimento</label><input type="date" id="f-comissaoRecebidaData" value="${d.comissaoRecebidaData || todayISO()}"></div>
        </div>
      </fieldset>
    </div>
    <div class="modal-foot">
      <div>${imovel ? `<button class="btn btn-ghost btn-danger" onclick="deleteImovel('${imovel.id}'); closeModal();">Excluir imóvel</button>` : ""}</div>
      <div style="display:flex; gap:10px;">
        <button class="btn" onclick="closeModal()">Cancelar</button>
        <button class="btn btn-primary" onclick="saveImovel()">${imovel ? "Salvar alterações" : "Cadastrar imóvel"}</button>
      </div>
    </div>
  `;

  document.getElementById("f-status").addEventListener("change", (e) => {
    const status = e.target.value;
    document.getElementById("fieldset-comissao").style.display = status === "Locado" ? "" : "none";
    document.getElementById("fieldset-pausa").style.display = (STATUS_TERMINAL_NEGATIVE.includes(status) || status === "Locado") ? "none" : "";
    document.getElementById("fieldset-motivo").style.display = (STATUS_TERMINAL_NEGATIVE.includes(status) && status !== "Sem resposta") ? "" : "none";
  });

  document.getElementById("f-pausadoAte").addEventListener("input", (e) => {
    document.getElementById("pausa-lembrete-wrap").style.display = e.target.value ? "" : "none";
  });

  setupImobiliariaConcorrenteField(d.imobiliariaConcorrente);
  openModal();
  initMiniMap(d.latitude, d.longitude);
}

/* ----------------------------------------------------------------
   MINI-MAPA (dentro do formulário) + GEOCODIFICAÇÃO
   Usa Leaflet + OpenStreetMap (gratuito, sem chave de API) para
   localizar o endereço digitado e permitir ajuste manual do pino.
   ---------------------------------------------------------------- */
let miniMap = null;
let miniMapMarker = null;
const LONDRINA_CENTER = [-23.3103, -51.1628];

function initMiniMap(lat, lng) {
  const el = document.getElementById("map-mini");
  if (!el) return;
  if (typeof L === "undefined") {
    el.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-faint);font-size:11.5px;text-align:center;padding:0 12px;">Mapa indisponível. Verifique sua conexão com a internet.</div>`;
    el.classList.add("visible");
    return;
  }
  const hasCoords = lat != null && lng != null && lat !== "" && lng !== "";
  const center = hasCoords ? [Number(lat), Number(lng)] : LONDRINA_CENTER;

  miniMap = L.map("map-mini", { attributionControl: false }).setView(center, hasCoords ? 16 : 13);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19 }).addTo(miniMap);

  miniMapMarker = L.marker(center, { draggable: true }).addTo(miniMap);
  miniMapMarker.on("dragend", () => {
    const pos = miniMapMarker.getLatLng();
    document.getElementById("f-latitude").value = pos.lat;
    document.getElementById("f-longitude").value = pos.lng;
    setGeocodeStatus("Localização ajustada manualmente.", "ok");
  });

  // Clicar em qualquer ponto do mapa já reposiciona o pino ali — é a
  // forma mais confiável de acertar o número exato da casa, já que a
  // busca automática só chega perto (nível de rua/bairro).
  miniMap.on("click", (e) => {
    miniMapMarker.setLatLng(e.latlng);
    document.getElementById("f-latitude").value = e.latlng.lat;
    document.getElementById("f-longitude").value = e.latlng.lng;
    setGeocodeStatus("Localização definida manualmente pelo clique.", "ok");
  });

  if (hasCoords) {
    el.classList.add("visible");
    setTimeout(() => miniMap.invalidateSize(), 100);
  }
}

function abrirNoGoogleMaps() {
  const endereco = document.getElementById("f-endereco").value.trim();
  const bairro = document.getElementById("f-bairro").value.trim();
  const cidade = document.getElementById("f-cidade").value.trim();
  if (!endereco) { toast("Preencha o endereço antes de conferir no Google Maps.", "error"); return; }
  const query = [endereco, bairro, cidade, "Brasil"].filter(Boolean).join(", ");
  window.open(`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`, "_blank");
  // garante que o mini-mapa já esteja visível e num zoom próximo para
  // facilitar clicar no ponto certo assim que a pessoa voltar da aba do Google Maps
  if (!miniMap) initMiniMap(document.getElementById("f-latitude").value, document.getElementById("f-longitude").value);
  document.getElementById("map-mini").classList.add("visible");
  setTimeout(() => miniMap && miniMap.invalidateSize(), 100);
}

function setGeocodeStatus(msg, tone) {
  const el = document.getElementById("geocode-status");
  if (!el) return;
  el.textContent = msg;
  el.className = "geocode-status" + (tone ? " " + tone : "");
}

function setCepStatus(msg, tone) {
  const el = document.getElementById("cep-status");
  if (!el) return;
  el.textContent = msg;
  el.className = "geocode-status" + (tone ? " " + tone : "");
}

function maskCEP(input) {
  let v = input.value.replace(/\D/g, "").slice(0, 8);
  if (v.length > 5) v = v.slice(0, 5) + "-" + v.slice(5);
  input.value = v;
}

/* ----------------------------------------------------------------
   BUSCA POR CEP (ViaCEP — gratuito, sem chave de API)
   Preenche endereço, bairro e cidade automaticamente e, em seguida,
   já localiza o pino no mapa, evitando ajuste manual repetido.
   ---------------------------------------------------------------- */
async function buscarCEP() {
  const raw = document.getElementById("f-cep").value.replace(/\D/g, "");
  if (raw.length !== 8) { setCepStatus("CEP inválido — precisa ter 8 dígitos.", "err"); return; }

  setCepStatus("Buscando...", "");
  try {
    const res = await fetch(`https://viacep.com.br/ws/${raw}/json/`);
    const data = await res.json();
    if (data.erro) { setCepStatus("CEP não encontrado.", "err"); return; }

    const enderecoEl = document.getElementById("f-endereco");
    if (data.logradouro) {
      // Mantém eventual número já digitado, só troca o nome da rua
      const numeroDigitado = (enderecoEl.value.match(/,\s*(.+)$/) || [])[1];
      enderecoEl.value = numeroDigitado ? `${data.logradouro}, ${numeroDigitado}` : data.logradouro;
    }
    if (data.bairro) document.getElementById("f-bairro").value = data.bairro;
    if (data.localidade) document.getElementById("f-cidade").value = data.localidade;

    setCepStatus("Endereço preenchido a partir do CEP.", "ok");
    toast("Endereço preenchido pelo CEP.");

    // Já aproveita para localizar no mapa automaticamente
    geocodeEndereco();
  } catch (e) {
    setCepStatus("Não foi possível buscar o CEP agora. Verifique sua conexão.", "err");
  }
}

async function nominatimSearch(query) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`;
  const res = await fetch(url, { headers: { "Accept-Language": "pt-BR" } });
  const data = await res.json();
  return (data && data.length > 0) ? data[0] : null;
}

async function geocodeEndereco() {
  const enderecoCompleto = document.getElementById("f-endereco").value.trim();
  const bairro = document.getElementById("f-bairro").value.trim();
  const cidade = document.getElementById("f-cidade").value.trim();
  if (!enderecoCompleto) { toast("Preencha o endereço antes de localizar no mapa.", "error"); return; }

  // Separa "Rua X, 123" em rua + número, para poder tentar de novo sem
  // o número caso o endereço exato não esteja mapeado no OpenStreetMap
  // (muito comum no Brasil, principalmente em bairros mais novos).
  const partes = enderecoCompleto.match(/^(.*?),?\s*(\d+[a-zA-Z]?)\s*$/);
  const ruaSemNumero = partes ? partes[1].trim() : enderecoCompleto;

  const tentativas = [
    [enderecoCompleto, bairro, cidade, "Brasil"],
    ruaSemNumero !== enderecoCompleto ? [ruaSemNumero, bairro, cidade, "Brasil"] : null,
    [ruaSemNumero, cidade, "Brasil"],
    [bairro, cidade, "Brasil"],
  ].filter(Boolean).map(parts => parts.filter(Boolean).join(", "));

  setGeocodeStatus("Buscando...", "");

  try {
    let found = null;
    let usedFallback = false;
    for (let i = 0; i < tentativas.length; i++) {
      found = await nominatimSearch(tentativas[i]);
      if (found) { usedFallback = i > 0; break; }
    }

    if (!found) {
      setGeocodeStatus("Endereço não encontrado. Você pode arrastar o pino manualmente.", "err");
      if (!miniMap) initMiniMap(null, null);
      document.getElementById("map-mini").classList.add("visible");
      setTimeout(() => miniMap && miniMap.invalidateSize(), 100);
      return;
    }

    const { lat, lon } = found;
    document.getElementById("f-latitude").value = lat;
    document.getElementById("f-longitude").value = lon;
    setGeocodeStatus(
      usedFallback
        ? "Número exato não encontrado — pino aproximado pela rua/bairro. Arraste para ajustar."
        : "Localização encontrada — arraste o pino se precisar ajustar.",
      usedFallback ? "warn" : "ok"
    );

    if (!miniMap) initMiniMap(lat, lon);
    document.getElementById("map-mini").classList.add("visible");
    setTimeout(() => {
      if (!miniMap || !miniMapMarker) return;
      miniMap.invalidateSize();
      miniMap.setView([lat, lon], usedFallback ? 15 : 16);
      miniMapMarker.setLatLng([lat, lon]);
    }, 100);
  } catch (e) {
    setGeocodeStatus("Não foi possível buscar agora. Verifique sua conexão.", "err");
  }
}

async function saveImovel() {
  const endereco = document.getElementById("f-endereco").value.trim();
  if (!endereco) { toast("Informe o endereço do imóvel.", "error"); return; }
  const dataAngariacao = document.getElementById("f-dataAngariacao").value;
  if (!dataAngariacao) { toast("Informe a data do primeiro contato.", "error"); return; }

  const newStatus = document.getElementById("f-status").value;
  const existing = editingImovelId ? STATE.imoveis.find(i => i.id === editingImovelId) : null;

  const data = {
    id: existing ? existing.id : uid(),
    codigo: document.getElementById("f-codigo").value.trim(),
    cep: document.getElementById("f-cep").value.trim(),
    endereco,
    bairro: document.getElementById("f-bairro").value.trim(),
    cidade: document.getElementById("f-cidade").value.trim(),
    tipo: document.getElementById("f-tipo").value,
    quartos: numOrNull(document.getElementById("f-quartos").value),
    banheiros: numOrNull(document.getElementById("f-banheiros").value),
    vagas: numOrNull(document.getElementById("f-vagas").value),
    valorAluguel: numOrNull(document.getElementById("f-valorAluguel").value) || 0,
    valorCondominio: numOrNull(document.getElementById("f-valorCondominio").value) || 0,
    proprietarioNome: document.getElementById("f-proprietarioNome").value.trim(),
    proprietarioTelefone: document.getElementById("f-proprietarioTelefone").value.trim(),
    formaAbordagem: document.getElementById("f-formaAbordagem").value,
    origemImovel: document.getElementById("f-origemImovel").value,
    imobiliariaConcorrente: document.getElementById("f-imobiliariaConcorrente").value.trim(),
    latitude: numOrNull(document.getElementById("f-latitude").value),
    longitude: numOrNull(document.getElementById("f-longitude").value),
    dataAngariacao,
    responsavel: document.getElementById("f-responsavel").value.trim(),
    status: newStatus,
    observacoes: document.getElementById("f-observacoes").value.trim(),
    statusHistory: existing ? (existing.statusHistory || []) : [{ status: "Novo contato", date: dataAngariacao }],
    pausadoAte: (STATUS_TERMINAL_NEGATIVE.includes(newStatus) || newStatus === "Locado") ? null : (document.getElementById("f-pausadoAte").value || null),
    motivoPerda: (STATUS_TERMINAL_NEGATIVE.includes(newStatus) && newStatus !== "Sem resposta") ? document.getElementById("f-motivoPerda").value : "",
    motivoPerdaOutro: (STATUS_TERMINAL_NEGATIVE.includes(newStatus) && newStatus !== "Sem resposta" && document.getElementById("f-motivoPerda").value === "Outro") ? document.getElementById("f-motivoPerdaOutro").value.trim() : "",
    comissaoRecebida: newStatus === "Locado" ? document.getElementById("f-comissaoRecebida").checked : false,
    comissaoRecebidaValor: newStatus === "Locado" ? numOrNull(document.getElementById("f-comissaoRecebidaValor")?.value) : null,
    comissaoRecebidaData: newStatus === "Locado" ? (document.getElementById("f-comissaoRecebidaData")?.value || null) : null,
  };

  // Registra transição de status no histórico (para cálculo de tempo médio e "dias parado")
  const prevStatus = existing ? existing.status : null;
  if (!existing || prevStatus !== newStatus) {
    const hist = data.statusHistory;
    if (hist.length === 0 || hist[hist.length - 1].status !== newStatus) {
      hist.push({ status: newStatus, date: todayISO() });
    }
  }

  // Se foi definida uma data de retomada e a pessoa pediu lembrete,
  // cria automaticamente um compromisso de follow-up na agenda —
  // evita ter que cadastrar a mesma informação duas vezes.
  let novoLembrete = null;
  const criarLembreteEl = document.getElementById("f-criarLembretePausa");
  if (data.pausadoAte && criarLembreteEl && criarLembreteEl.checked) {
    const jaExiste = STATE.agenda.some(a => a.imovelId === data.id && a.date === data.pausadoAte && a.type === "Follow-up" && !a.done);
    if (!jaExiste) {
      novoLembrete = {
        id: uid(),
        title: `Retomar contato — ${data.codigo || data.endereco}`,
        type: "Follow-up",
        date: data.pausadoAte,
        imovelId: data.id,
        notes: "Criado automaticamente ao pausar o follow-up deste imóvel.",
        done: false,
      };
    }
  }

  // ----------------------------------------------------------------
  // Lembrete automático de "verificar disponibilidade" (novo)
  // Regras: ao chegar em Angariado, agenda um lembrete 60 dias depois
  // da angariação para confirmar com o proprietário se o imóvel segue
  // disponível, enquanto não for Locado. Ao ser marcado como Locado,
  // qualquer lembrete desse tipo ainda em aberto é cancelado.
  // ----------------------------------------------------------------
  let novaVerificacao = null;
  let verificacoesACancelar = [];
  if (data.status === "Locado") {
    verificacoesACancelar = STATE.agenda.filter(a => a.imovelId === data.id && a.isVerificacaoDisponibilidade && !a.done);
  } else if (foiAngariado(data)) {
    const jaTemVerificacaoAberta = STATE.agenda.some(a => a.imovelId === data.id && a.isVerificacaoDisponibilidade && !a.done);
    if (!jaTemVerificacaoAberta) {
      const dataBase = dataAngariadoEfetiva(data) || todayISO();
      novaVerificacao = {
        id: uid(),
        title: `Verificar disponibilidade — ${data.codigo || data.endereco}`,
        type: "Follow-up",
        date: addDaysISO(dataBase, VERIFICACAO_DISPONIBILIDADE_DIAS),
        imovelId: data.id,
        notes: "Lembrete automático: imóvel angariado sem locação após 60 dias. Confirme com o proprietário se ainda está disponível.",
        done: false,
        isVerificacaoDisponibilidade: true,
      };
    }
  }

  const saveBtn = document.querySelector(".modal-foot .btn-primary");
  if (saveBtn) { saveBtn.disabled = true; saveBtn.textContent = "Salvando..."; }

  const { error } = await supabaseClient.from("imoveis").upsert(toDbImovel(data));
  if (error) {
    toast("Não foi possível salvar: " + error.message, "error");
    if (saveBtn) { saveBtn.disabled = false; saveBtn.textContent = existing ? "Salvar alterações" : "Cadastrar imóvel"; }
    return;
  }

  if (novoLembrete) {
    const { error: agErr } = await supabaseClient.from("agenda").insert(toDbAgenda(novoLembrete));
    if (!agErr) STATE.agenda.push(novoLembrete);
  }

  if (novaVerificacao) {
    const { error: verErr } = await supabaseClient.from("agenda").insert(toDbAgenda(novaVerificacao));
    if (!verErr) STATE.agenda.push(novaVerificacao);
  }

  if (verificacoesACancelar.length > 0) {
    const ids = verificacoesACancelar.map(a => a.id);
    const { error: cancelErr } = await supabaseClient.from("agenda").delete().in("id", ids);
    if (!cancelErr) STATE.agenda = STATE.agenda.filter(a => !ids.includes(a.id));
  }

  if (existing) {
    const idx = STATE.imoveis.findIndex(i => i.id === existing.id);
    STATE.imoveis[idx] = data;
    toast("Imóvel atualizado.");
  } else {
    STATE.imoveis.push(data);
    toast("Imóvel cadastrado com sucesso.");
  }

  closeModal();
  refresh();
}

function numOrNull(v) {
  if (v === "" || v === undefined || v === null) return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

/* ================================================================
   6B. MODAL GENÉRICO (open/close)
   ================================================================ */
function openModal() { document.getElementById("modal-overlay").classList.add("open"); }
function closeModal() { document.getElementById("modal-overlay").classList.remove("open"); editingImovelId = null; editingAgendaId = null; editingMetaKey = null; miniMap = null; miniMapMarker = null; concluirVerificacaoId = null; }
document.addEventListener("keydown", (e) => {
  if (e.key !== "Escape") return;
  closeModal();
  if (pipelineDrawerImovelId) {
    closePipelineDrawer();
    renderCurrentView();
  }
});

/* ================================================================
   5C. VIEW: METAS
   ================================================================ */
let editingMetaKey = null;

function getMeta(key) {
  return STATE.metas[key] || { angariacoes: 0, locados: 0, comissao: 0 };
}

function viewMetas() {
  const mKey = currentMonthKey();
  const meta = getMeta(mKey);
  const thisMonth = imoveisAngariadosNoMes(mKey);
  const locadosThisMonth = imoveisLocadosNoMes(mKey);
  const comissaoRecMes = STATE.imoveis.reduce((s, i) => {
    if (i.status === "Locado" && i.comissaoRecebida && monthKey(i.comissaoRecebidaData) === mKey) return s + comissaoRecebidaValor(i);
    return s;
  }, 0);

  const hasGoals = meta.angariacoes > 0 || meta.locados > 0 || meta.comissao > 0;

  return `
    <div class="page-head">
      <div><h1 class="page-title">Metas</h1><p class="page-sub">${monthLabelLong(mKey)}</p></div>
      <div class="page-actions">
        <button class="btn btn-primary" onclick="openMetaModal()">${hasGoals ? "Editar metas do mês" : "+ Definir metas"}</button>
      </div>
    </div>

    ${!hasGoals ? `
      <div class="empty-state card">
        <h3>Nenhuma meta definida para este mês</h3>
        <p>Defina metas de angariação, locação e comissão para acompanhar seu progresso ao longo do mês.</p>
        <div style="margin-top:16px;"><button class="btn btn-primary" onclick="openMetaModal()">+ Definir metas</button></div>
      </div>
    ` : `
      <div class="grid grid-3">
        ${goalCard("Angariações", thisMonth.length, meta.angariacoes, "un.", "Conta ao chegar na etapa Angariado")}
        ${goalCard("Imóveis locados", locadosThisMonth.length, meta.locados, "un.")}
        ${goalCard("Comissão recebida", comissaoRecMes, meta.comissao, "money")}
      </div>
    `}

    <div class="divider"></div>
    <div class="card-title" style="margin-bottom:14px;">Histórico de metas</div>
    ${renderMetaHistory()}
  `;
}

function goalCard(label, current, target, unit, note) {
  const pct = target > 0 ? Math.min(100, (current / target) * 100) : 0;
  const remaining = Math.max(0, target - current);
  const cls = pct >= 100 ? "good" : pct >= 60 ? "" : "warn";
  const fmt = (v) => unit === "money" ? fmtMoney(v) : `${v}${unit ? " " + unit : ""}`;
  return `
    <div class="card goal-card">
      <div class="goal-head">
        <div class="goal-title">${label}</div>
        <div class="goal-foot"><span class="pct">${pct.toFixed(0)}%</span></div>
      </div>
      <div class="goal-numbers">
        <div class="goal-current">${fmt(current)}</div>
        <div class="goal-target">/ ${target > 0 ? fmt(target) : "sem meta"}</div>
      </div>
      <div class="progress-track"><div class="progress-fill ${cls}" style="width:${pct}%"></div></div>
      <div class="goal-foot">
        <span>${target > 0 ? (pct >= 100 ? "Meta atingida 🎉" : `Faltam ${fmt(remaining)}`) : "—"}</span>
      </div>
      ${note ? `<div class="kpi-desc" style="margin-top:8px;">${note}</div>` : ""}
    </div>`;
}

function renderMetaHistory() {
  const keys = Object.keys(STATE.metas).sort().reverse().slice(0, 6);
  if (keys.length === 0) return `<p class="section-note">Nenhum histórico ainda.</p>`;
  return `
    <div class="card table-scroll" style="padding:0;">
      <table>
        <thead><tr><th>Mês</th><th>Meta angariações</th><th>Realizado</th><th>Meta locados</th><th>Realizado</th><th>Meta comissão</th><th>Recebido</th></tr></thead>
        <tbody>
          ${keys.map(k => {
            const m = STATE.metas[k];
            const ang = imoveisAngariadosNoMes(k).length;
            const loc = imoveisLocadosNoMes(k).length;
            const rec = STATE.imoveis.reduce((s, i) => (i.status === "Locado" && i.comissaoRecebida && monthKey(i.comissaoRecebidaData) === k) ? s + comissaoRecebidaValor(i) : s, 0);
            return `<tr>
              <td class="cell-strong">${monthLabelLong(k)}</td>
              <td>${m.angariacoes || "—"}</td><td class="cell-dim">${ang}</td>
              <td>${m.locados || "—"}</td><td class="cell-dim">${loc}</td>
              <td>${m.comissao ? fmtMoney(m.comissao) : "—"}</td><td class="cell-dim">${fmtMoney(rec)}</td>
            </tr>`;
          }).join("")}
        </tbody>
      </table>
    </div>`;
}

function afterRenderMetas() {}

function openMetaModal() {
  const mKey = currentMonthKey();
  editingMetaKey = mKey;
  const meta = getMeta(mKey);
  document.getElementById("modal-box").innerHTML = `
    <div class="modal-head">
      <div class="modal-title">Metas de ${monthLabelLong(mKey)}</div>
      <button class="icon-btn" onclick="closeModal()">✕</button>
    </div>
    <div class="modal-body">
      <div class="field-group"><label>Meta mensal de angariações</label><input type="number" min="0" id="m-angariacoes" value="${meta.angariacoes || ""}">
        <div class="field-hint">Considera imóveis que chegaram na etapa "Angariado" no mês, não apenas contatos iniciados.</div>
      </div>
      <div class="field-group"><label>Meta de imóveis locados</label><input type="number" min="0" id="m-locados" value="${meta.locados || ""}"></div>
      <div class="field-group"><label>Meta financeira de comissão (R$)</label><input type="number" min="0" step="0.01" id="m-comissao" value="${meta.comissao || ""}"></div>
    </div>
    <div class="modal-foot">
      <div></div>
      <div style="display:flex; gap:10px;">
        <button class="btn" onclick="closeModal()">Cancelar</button>
        <button class="btn btn-primary" onclick="saveMeta()">Salvar metas</button>
      </div>
    </div>
  `;
  openModal();
}

async function saveMeta() {
  const meta = {
    angariacoes: numOrNull(document.getElementById("m-angariacoes").value) || 0,
    locados: numOrNull(document.getElementById("m-locados").value) || 0,
    comissao: numOrNull(document.getElementById("m-comissao").value) || 0,
  };
  const { error } = await supabaseClient.from("metas").upsert({
    user_id: currentUser.id,
    month_key: editingMetaKey,
    angariacoes: meta.angariacoes,
    locados: meta.locados,
    comissao: meta.comissao,
  }, { onConflict: "user_id,month_key" });
  if (error) { toast("Não foi possível salvar: " + error.message, "error"); return; }

  STATE.metas[editingMetaKey] = meta;
  closeModal();
  refresh();
  toast("Metas salvas.");
}

/* ================================================================
   5D. VIEW: AGENDA
   Tipos: Retorno ao proprietário, Visita, Pendência, Documentação, Follow-up
   ================================================================ */
let editingAgendaId = null;
let agendaFilter = "pendentes"; // "pendentes" | "todas" | "atrasadas"

function viewAgenda() {
  const items = STATE.agenda.filter(a => {
    if (agendaFilter === "pendentes") return !a.done;
    if (agendaFilter === "atrasadas") return !a.done && a.date < todayISO();
    return true;
  }).sort((a, b) => a.date.localeCompare(b.date));

  const grouped = {};
  items.forEach(a => { (grouped[a.date] = grouped[a.date] || []).push(a); });
  const dateKeys = Object.keys(grouped).sort();

  const atrasadas = STATE.agenda.filter(a => !a.done && a.date < todayISO()).length;

  return `
    <div class="page-head">
      <div><h1 class="page-title">Agenda</h1><p class="page-sub">Retornos, visitas, pendências e follow-ups</p></div>
      <div class="page-actions">
        <button class="btn btn-primary" onclick="openAgendaModal()">+ Novo compromisso</button>
      </div>
    </div>

    <div class="agenda-layout">
      <div>
        <div class="pipeline-toolbar" style="margin-bottom:16px;">
          <div class="view-toggle">
            <button class="${agendaFilter === "pendentes" ? "active" : ""}" onclick="agendaFilter='pendentes'; renderCurrentView();">Pendentes</button>
            <button class="${agendaFilter === "atrasadas" ? "active" : ""}" onclick="agendaFilter='atrasadas'; renderCurrentView();">Atrasadas ${atrasadas > 0 ? `(${atrasadas})` : ""}</button>
            <button class="${agendaFilter === "todas" ? "active" : ""}" onclick="agendaFilter='todas'; renderCurrentView();">Todas</button>
          </div>
        </div>

        ${dateKeys.length === 0 ? `
          <div class="empty-state card">
            <h3>Nada por aqui</h3>
            <p>Sem compromissos ${agendaFilter === "pendentes" ? "pendentes" : agendaFilter === "atrasadas" ? "atrasados" : "cadastrados"} no momento.</p>
          </div>` : dateKeys.map(date => `
          <div class="agenda-day-group">
            <div class="agenda-day-label ${date === todayISO() ? "today" : ""}">${date === todayISO() ? "Hoje · " : ""}${fmtDateLong(date)}</div>
            ${grouped[date].map(a => renderAgendaItemEnhanced(a)).join("")}
          </div>
        `).join("")}
      </div>

      <div class="card">
        <div class="card-title">Resumo</div>
        <div style="display:flex; flex-direction:column; gap:10px;">
          <div class="agenda-item-meta"><strong style="color:var(--text)">${STATE.agenda.filter(a => !a.done).length}</strong>&nbsp;compromissos pendentes</div>
          <div class="agenda-item-meta"><strong style="color:var(--bad)">${atrasadas}</strong>&nbsp;atrasados</div>
          <div class="agenda-item-meta"><strong style="color:var(--text)">${STATE.agenda.filter(a => a.date === todayISO() && !a.done).length}</strong>&nbsp;para hoje</div>
        </div>
        <div class="divider"></div>
        <div class="card-title">Por tipo</div>
        <div style="display:flex; flex-direction:column; gap:8px;">
          ${AGENDA_TYPES.map(t => `<div class="agenda-item-meta" style="justify-content:space-between; display:flex;"><span class="agenda-type-tag" data-type="${t}">${t}</span> <span>${STATE.agenda.filter(a => a.type === t && !a.done).length}</span></div>`).join("")}
        </div>
      </div>
    </div>
  `;
}

function renderAgendaItem(a) {
  const overdue = !a.done && a.date < todayISO();
  const imovel = a.imovelId ? STATE.imoveis.find(i => i.id === a.imovelId) : null;
  const checkAction = (a.isVerificacaoDisponibilidade && !a.done) ? `concluirVerificacao('${a.id}')` : `toggleAgendaDone('${a.id}')`;
  return `
    <div class="agenda-item ${a.done ? "done" : ""} ${overdue ? "overdue" : ""}">
      <div class="agenda-check ${a.done ? "checked" : ""}" onclick="${checkAction}">${a.done ? "✓" : ""}</div>
      <div class="agenda-item-body" onclick="openAgendaModal('${a.id}')" style="cursor:pointer;">
        <div class="agenda-item-title">${a.isVerificacaoDisponibilidade ? "🔔 " : ""}${escapeHtml(a.title)}</div>
        <div class="agenda-item-meta">
          <span class="agenda-type-tag" data-type="${a.type}">${a.type}</span>
          ${imovel ? `<span>${escapeHtml(imovel.codigo || imovel.endereco)}</span>` : ""}
          ${overdue ? `<span style="color:var(--bad); font-weight:700;">atrasado</span>` : ""}
        </div>
      </div>
      <button class="icon-btn" onclick="deleteAgenda('${a.id}')" title="Excluir">✕</button>
    </div>`;
}

function renderAgendaItemEnhanced(a) {
  const overdue = !a.done && a.date < todayISO();
  const today = !a.done && a.date === todayISO();
  const future = !a.done && a.date > todayISO();
  const imovel = a.imovelId ? STATE.imoveis.find(i => i.id === a.imovelId) : null;
  const checkAction = (a.isVerificacaoDisponibilidade && !a.done) ? `concluirVerificacao('${a.id}')` : `toggleAgendaDone('${a.id}')`;
  const dueInfo = agendaVencimentoInfo(a);
  const typeIcon = agendaTypeIcon(a.type, a.isVerificacaoDisponibilidade);
  const canSendWhatsapp = imovel && isAgendaAngariacaoVencida(a);

  return `
    <div class="agenda-item agenda-item-enhanced ${a.done ? "done" : ""} ${overdue ? "overdue" : ""} ${today ? "today" : ""} ${future ? "future" : ""}">
      <div class="agenda-check ${a.done ? "checked" : ""}" onclick="${checkAction}">${a.done ? "✓" : ""}</div>
      <div class="agenda-item-body" onclick="openAgendaModal('${a.id}')" style="cursor:pointer;">
        <div class="agenda-item-title"><span class="agenda-type-icon">${typeIcon}</span>${escapeHtml(a.title)}</div>
        <div class="agenda-item-meta">
          <span class="agenda-type-tag" data-type="${a.type}">${escapeHtml(a.type)}</span>
          ${imovel ? `<span>${escapeHtml(imovel.codigo || imovel.endereco)}</span>` : ""}
          ${dueInfo ? `<span class="agenda-due-chip ${dueInfo.tone}"><span class="agenda-due-dot"></span>${dueInfo.label}</span>` : ""}
          ${overdue ? `<span class="agenda-date-state overdue">atrasado</span>` : ""}
          ${today ? `<span class="agenda-date-state today">hoje</span>` : ""}
          ${future ? `<span class="agenda-date-state future">futuro</span>` : ""}
        </div>
      </div>
      <div class="agenda-actions">
        ${canSendWhatsapp ? `<button class="btn btn-sm btn-ghost agenda-whatsapp-btn" onclick="event.stopPropagation(); enviarWhatsappAngariacao('${imovel.id}')" title="Enviar WhatsApp">Enviar WhatsApp</button>` : ""}
        <button class="icon-btn" onclick="event.stopPropagation(); deleteAgenda('${a.id}')" title="Excluir">&times;</button>
      </div>
    </div>`;
}

function agendaTypeIcon(type, isVerificacao) {
  if (isVerificacao) return "🔔";
  const icons = {
    "Retorno ao proprietÃ¡rio": "☎",
    "Retorno ao proprietário": "☎",
    "Visita": "⌂",
    "PendÃªncia": "!",
    "Pendência": "!",
    "DocumentaÃ§Ã£o": "§",
    "Documentação": "§",
    "Follow-up": "↻",
  };
  return icons[type] || "•";
}

function isAgendaAngariacaoVencida(a) {
  if (!a || a.done || !a.imovelId || a.date > todayISO()) return false;
  if (a.isVerificacaoDisponibilidade) return true;
  const text = `${a.type || ""} ${a.title || ""} ${a.notes || ""}`.toLowerCase();
  return a.type === "Follow-up" || text.includes("verificar disponibilidade") || text.includes("vencimento") || text.includes("angaria");
}

function isAgendaAngariacaoMonitorada(a) {
  if (!a || a.done || !a.imovelId) return false;
  if (a.isVerificacaoDisponibilidade) return true;
  const text = `${a.type || ""} ${a.title || ""} ${a.notes || ""}`.toLowerCase();
  return a.type === "Follow-up" || text.includes("verificar disponibilidade") || text.includes("vencimento") || text.includes("angaria");
}

function agendaVencimentoInfo(a) {
  if (!isAgendaAngariacaoMonitorada(a)) return null;
  const days = daysBetween(todayISO(), a.date);
  if (days == null) return null;
  if (days < 0) return { tone: "expired", label: "Vencido" };
  if (days < 7) return { tone: "soon", label: days === 0 ? "Vence hoje" : "Menos de 7 dias" };
  if (days <= 15) return { tone: "warning", label: "Entre 7 e 15 dias" };
  return { tone: "ok", label: "Mais de 15 dias" };
}

function mensagemRenovacaoAngariacao(imovel) {
  const nome = (imovel && imovel.proprietarioNome) ? imovel.proprietarioNome.trim() : "";
  const saudacao = nome ? `Olá, ${nome}! Tudo bem?` : "Olá! Tudo bem?";
  return `${saudacao}

Percebemos que o período de angariação do seu imóvel chegou ao vencimento.

Gostaríamos de saber se você deseja renovar a parceria conosco para continuarmos trabalhando na divulgação e comercialização do imóvel.

Caso tenha interesse, estamos à disposição para dar continuidade ao atendimento.

Atenciosamente,
Equipe da imobiliária.`;
}

function telefoneWhatsapp(telefone) {
  const digits = String(telefone || "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("55")) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

function enviarWhatsappAngariacao(imovelId) {
  const imovel = STATE.imoveis.find(i => i.id === imovelId);
  if (!imovel) return;
  const message = mensagemRenovacaoAngariacao(imovel);
  const phone = telefoneWhatsapp(imovel.proprietarioTelefone);
  if (phone) {
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, "_blank", "noopener");
    return;
  }
  abrirMensagemWhatsappModal(imovel, message);
}

function abrirMensagemWhatsappModal(imovel, message) {
  document.getElementById("modal-box").innerHTML = `
    <div class="modal-head">
      <div class="modal-title">Mensagem para WhatsApp</div>
      <button class="icon-btn" onclick="closeModal()">&times;</button>
    </div>
    <div class="modal-body">
      <p class="section-note" style="margin-bottom:14px;">${escapeHtml(imovel.codigo || imovel.endereco || "Imóvel sem código")} não tem telefone cadastrado. Copie a mensagem abaixo para enviar manualmente.</p>
      <textarea id="whatsapp-message-copy" readonly style="min-height:220px;">${escapeHtml(message)}</textarea>
    </div>
    <div class="modal-foot">
      <div></div>
      <div style="display:flex; gap:10px;">
        <button class="btn" onclick="closeModal()">Fechar</button>
        <button class="btn btn-primary" onclick="copiarMensagemWhatsapp()">Copiar mensagem</button>
      </div>
    </div>
  `;
  openModal();
}

async function copiarMensagemWhatsapp() {
  const el = document.getElementById("whatsapp-message-copy");
  if (!el) return;
  try {
    await navigator.clipboard.writeText(el.value);
    toast("Mensagem copiada.");
  } catch (e) {
    el.focus();
    el.select();
    document.execCommand("copy");
    toast("Mensagem copiada.");
  }
}

function afterRenderAgenda() {}

async function toggleAgendaDone(id) {
  const a = STATE.agenda.find(x => x.id === id);
  if (!a) return;
  const novoValor = !a.done;
  const { error } = await supabaseClient.from("agenda").update({ done: novoValor }).eq("id", id);
  if (error) { toast("Não foi possível atualizar: " + error.message, "error"); return; }
  a.done = novoValor;
  refresh();
}

/* ----------------------------------------------------------------
   VERIFICAÇÃO DE DISPONIBILIDADE (lembrete automático de 60 dias)
   Ao concluir, pede a data do novo contato e — se o imóvel ainda não
   estiver Locado — já agenda o próximo lembrete 60 dias depois dessa
   data, encadeando automaticamente enquanto não houver locação.
   ---------------------------------------------------------------- */
let concluirVerificacaoId = null;

function concluirVerificacao(id) {
  const a = STATE.agenda.find(x => x.id === id);
  if (!a) return;
  concluirVerificacaoId = id;
  const imovel = a.imovelId ? STATE.imoveis.find(i => i.id === a.imovelId) : null;

  document.getElementById("modal-box").innerHTML = `
    <div class="modal-head">
      <div class="modal-title">Registrar novo contato</div>
      <button class="icon-btn" onclick="closeModal()">✕</button>
    </div>
    <div class="modal-body">
      <p class="section-note" style="margin-bottom:14px;">
        ${imovel ? `Imóvel: <strong>${escapeHtml(imovel.codigo || imovel.endereco)}</strong>` : ""}
      </p>
      <div class="field-group">
        <label>Data do contato com o proprietário</label>
        <input type="date" id="verificacao-data-contato" value="${todayISO()}">
        <div class="field-hint">Se o imóvel continuar sem locação, o próximo lembrete é agendado automaticamente para ${VERIFICACAO_DISPONIBILIDADE_DIAS} dias após essa data.</div>
      </div>
    </div>
    <div class="modal-foot">
      <div></div>
      <div style="display:flex; gap:10px;">
        <button class="btn" onclick="closeModal()">Cancelar</button>
        <button class="btn btn-primary" onclick="confirmarConclusaoVerificacao()">Confirmar contato</button>
      </div>
    </div>
  `;
  openModal();
}

async function confirmarConclusaoVerificacao() {
  const id = concluirVerificacaoId;
  const a = STATE.agenda.find(x => x.id === id);
  if (!a) { closeModal(); return; }
  const dataContato = document.getElementById("verificacao-data-contato").value || todayISO();

  const { error } = await supabaseClient.from("agenda").update({ done: true }).eq("id", id);
  if (error) { toast("Não foi possível concluir: " + error.message, "error"); return; }
  a.done = true;

  const imovel = a.imovelId ? STATE.imoveis.find(i => i.id === a.imovelId) : null;
  if (imovel && imovel.status !== "Locado") {
    const proximo = {
      id: uid(),
      title: `Verificar disponibilidade — ${imovel.codigo || imovel.endereco}`,
      type: "Follow-up",
      date: addDaysISO(dataContato, VERIFICACAO_DISPONIBILIDADE_DIAS),
      imovelId: imovel.id,
      notes: "Lembrete automático: confirme novamente com o proprietário se o imóvel segue disponível.",
      done: false,
      isVerificacaoDisponibilidade: true,
    };
    const { error: proxErr } = await supabaseClient.from("agenda").insert(toDbAgenda(proximo));
    if (!proxErr) STATE.agenda.push(proximo);
  }

  closeModal();
  refresh();
  toast(imovel && imovel.status !== "Locado" ? "Contato registrado. Próximo lembrete agendado." : "Contato registrado.");
}

async function deleteAgenda(id) {
  const { error } = await supabaseClient.from("agenda").delete().eq("id", id);
  if (error) { toast("Não foi possível excluir: " + error.message, "error"); return; }
  STATE.agenda = STATE.agenda.filter(a => a.id !== id);
  refresh();
  toast("Compromisso removido.");
}

function openAgendaModal(id) {
  editingAgendaId = id || null;
  const item = id ? STATE.agenda.find(a => a.id === id) : null;
  const d = item || { title: "", type: "Retorno ao proprietário", date: todayISO(), imovelId: "", notes: "", done: false };
  const imoveisOptions = STATE.imoveis.slice().sort((a, b) => (a.codigo || a.endereco).localeCompare(b.codigo || b.endereco));

  document.getElementById("modal-box").innerHTML = `
    <div class="modal-head">
      <div class="modal-title">${item ? "Editar compromisso" : "Novo compromisso"}</div>
      <button class="icon-btn" onclick="closeModal()">✕</button>
    </div>
    <div class="modal-body">
      <div class="field-group"><label>Título</label><input type="text" id="a-title" value="${escapeHtml(d.title)}" placeholder="Ex: Ligar para proprietário sobre documentação"></div>
      <div class="field-row">
        <div class="field-group"><label>Tipo</label>
          <select id="a-type">${AGENDA_TYPES.map(t => `<option value="${t}" ${d.type === t ? "selected" : ""}>${t}</option>`).join("")}</select>
        </div>
        <div class="field-group"><label>Data</label><input type="date" id="a-date" value="${d.date}"></div>
      </div>
      <div class="field-group"><label>Imóvel relacionado (opcional)</label>
        <select id="a-imovel">
          <option value="">Nenhum</option>
          ${imoveisOptions.map(i => `<option value="${i.id}" ${d.imovelId === i.id ? "selected" : ""}>${escapeHtml(i.codigo || i.endereco)}</option>`).join("")}
        </select>
      </div>
      <div class="field-group"><label>Notas</label><textarea id="a-notes">${escapeHtml(d.notes || "")}</textarea></div>
    </div>
    <div class="modal-foot">
      <div>${item ? `<button class="btn btn-ghost btn-danger" onclick="deleteAgenda('${item.id}'); closeModal();">Excluir</button>` : ""}</div>
      <div style="display:flex; gap:10px;">
        <button class="btn" onclick="closeModal()">Cancelar</button>
        <button class="btn btn-primary" onclick="saveAgenda()">${item ? "Salvar" : "Adicionar"}</button>
      </div>
    </div>
  `;
  openModal();
}

async function saveAgenda() {
  const title = document.getElementById("a-title").value.trim();
  if (!title) { toast("Informe um título para o compromisso.", "error"); return; }
  const existing = editingAgendaId ? STATE.agenda.find(a => a.id === editingAgendaId) : null;
  const data = {
    id: existing ? existing.id : uid(),
    title,
    type: document.getElementById("a-type").value,
    date: document.getElementById("a-date").value,
    imovelId: document.getElementById("a-imovel").value || null,
    notes: document.getElementById("a-notes").value.trim(),
    done: existing ? existing.done : false,
  };

  const { error } = await supabaseClient.from("agenda").upsert(toDbAgenda(data));
  if (error) { toast("Não foi possível salvar: " + error.message, "error"); return; }

  if (existing) {
    const idx = STATE.agenda.findIndex(a => a.id === existing.id);
    STATE.agenda[idx] = data;
  } else {
    STATE.agenda.push(data);
  }
  closeModal();
  refresh();
  toast(existing ? "Compromisso atualizado." : "Compromisso adicionado.");
}

/* ================================================================
   5E. VIEW: INSIGHTS
   Motor de regras simples (sem IA externa) que lê os dados atuais
   e gera observações. Cada insight só aparece se houver dados
   suficientes para sustentá-lo (evita afirmações vazias).
   ================================================================ */
const MIN_SAMPLE = 3; // mínimo de imóveis para uma métrica ser considerada confiável

function viewInsights() {
  const insights = buildInsights();
  return `
    <div class="page-head">
      <div><h1 class="page-title">Insights</h1><p class="page-sub">Leitura automática dos seus dados de angariação</p></div>
    </div>
    ${insights.length === 0 ? `
      <div class="insight-empty card">
        <h3 style="font-family:var(--font-display); color:var(--text-dim); margin-bottom:8px;">Ainda sem dados suficientes</h3>
        <p>Cadastre mais imóveis e atualize os status ao longo do funil para que insights confiáveis comecem a aparecer aqui.</p>
      </div>
    ` : insights.map(i => `
      <div class="insight-card">
        <div class="insight-icon ${i.tone}">${i.icon}</div>
        <div>
          <div class="insight-title">${i.title}</div>
          <div class="insight-text">${i.text}</div>
        </div>
      </div>
    `).join("")}
  `;
}

function buildInsights() {
  const list = [];
  const imoveis = STATE.imoveis;
  if (imoveis.length < MIN_SAMPLE) return list;

  // 1. Bairro mais procurado (maior volume de angariações)
  const bairroCounts = groupCount(imoveis, i => i.bairro);
  const bairroEntries = Object.entries(bairroCounts).filter(([b]) => b !== "Não informado").sort((a, b) => b[1] - a[1]);
  if (bairroEntries.length > 0 && bairroEntries[0][1] >= 2) {
    const [bairro, count] = bairroEntries[0];
    const pct = ((count / imoveis.length) * 100).toFixed(0);
    list.push({ tone: "info", icon: "📍", title: `${bairro} concentra suas tentativas de contato`, text: `${count} de ${imoveis.length} imóveis (${pct}%) do seu pipeline vieram desse bairro. Pode valer investir mais tempo prospectando ali, já que você já tem presença e conhecimento da região.` });
  }

  // 2. Tipo de imóvel com maior conversão (entre tipos com amostra mínima)
  const tipos = [...new Set(imoveis.map(i => i.tipo))];
  const tipoConv = tipos.map(t => {
    const doTipo = imoveis.filter(i => i.tipo === t);
    const fechados = doTipo.filter(i => i.status === "Locado" || STATUS_TERMINAL_NEGATIVE.includes(i.status));
    const locados = doTipo.filter(i => i.status === "Locado");
    return { tipo: t, total: doTipo.length, taxa: fechados.length ? (locados.length / fechados.length) * 100 : null };
  }).filter(t => t.total >= MIN_SAMPLE && t.taxa != null).sort((a, b) => b.taxa - a.taxa);
  if (tipoConv.length > 0) {
    const best = tipoConv[0];
    list.push({ tone: "pos", icon: "✅", title: `${best.tipo} tem a melhor taxa de conversão`, text: `${best.taxa.toFixed(0)}% dos imóveis do tipo "${best.tipo}" que chegaram a um desfecho foram locados (${best.total} cadastrados). Priorizar esse perfil de imóvel tende a gerar resultado mais rápido.` });
    if (tipoConv.length > 1) {
      const worst = tipoConv[tipoConv.length - 1];
      if (worst.taxa < 40 && worst.tipo !== best.tipo) {
        list.push({ tone: "warn", icon: "⚠️", title: `${worst.tipo} converte pouco`, text: `Apenas ${worst.taxa.toFixed(0)}% dos imóveis do tipo "${worst.tipo}" viraram locação. Vale entender se o problema é preço, demanda da região ou qualidade do anúncio antes de continuar investindo tempo nesse perfil.` });
      }
    }
  }

  // 2b. Forma de abordagem com melhor conversão (entre formas com amostra mínima)
  const abordagens = [...new Set(imoveis.map(i => i.formaAbordagem).filter(Boolean))];
  const abordagemConv = abordagens.map(a => {
    const doAbordagem = imoveis.filter(i => i.formaAbordagem === a);
    const fechados = doAbordagem.filter(i => i.status === "Locado" || STATUS_TERMINAL_NEGATIVE.includes(i.status));
    const locadosA = doAbordagem.filter(i => i.status === "Locado");
    return { abordagem: a, total: doAbordagem.length, taxa: fechados.length ? (locadosA.length / fechados.length) * 100 : null };
  }).filter(a => a.total >= MIN_SAMPLE && a.taxa != null).sort((a, b) => b.taxa - a.taxa);
  if (abordagemConv.length > 1) {
    const best = abordagemConv[0];
    list.push({ tone: "pos", icon: "📞", title: `"${best.abordagem}" converte melhor`, text: `Entre as abordagens usadas com pelo menos ${MIN_SAMPLE} tentativas, "${best.abordagem}" teve ${best.taxa.toFixed(0)}% de conversão em locação (${best.total} contatos). Vale priorizar esse canal ao iniciar um novo contato.` });
  }

  // 2c. Origem de imóvel mais comum
  const origemCounts = groupCount(imoveis, i => i.origemImovel);
  const origemEntries = Object.entries(origemCounts).filter(([o]) => o !== "Não informado").sort((a, b) => b[1] - a[1]);
  if (origemEntries.length > 0 && origemEntries[0][1] >= MIN_SAMPLE) {
    const [origem, count] = origemEntries[0];
    list.push({ tone: "info", icon: "🔎", title: `${origem} é sua principal fonte de oportunidades`, text: `${count} dos seus imóveis angariados vieram dessa origem. Reforçar esse canal tende a manter o volume de entrada de novas oportunidades.` });
  }

  // 2d. Concorrente mais frequente
  const comConcorrente = imoveis.filter(i => i.imobiliariaConcorrente && i.imobiliariaConcorrente.trim());
  if (comConcorrente.length >= MIN_SAMPLE) {
    const concorrenteCounts = groupCount(comConcorrente, i => i.imobiliariaConcorrente.trim());
    const [concorrente, count] = Object.entries(concorrenteCounts).sort((a, b) => b[1] - a[1])[0];
    if (count >= 2) {
      const pct = ((count / comConcorrente.length) * 100).toFixed(0);
      list.push({ tone: "warn", icon: "🏢", title: `${concorrente} é seu concorrente mais frequente`, text: `Apareceu em ${count} dos ${comConcorrente.length} imóveis (${pct}%) onde havia outra imobiliária envolvida. Vale entender o que essa imobiliária costuma oferecer de diferente para o proprietário.` });
    }
  }

  // 3. Tempo médio até locação
  const locados = imoveis.filter(i => i.status === "Locado");
  const tempos = locados.map(tempoAteLocacao).filter(t => t != null && t >= 0);
  if (tempos.length >= MIN_SAMPLE) {
    const media = tempos.reduce((a, b) => a + b, 0) / tempos.length;
    list.push({ tone: "info", icon: "⏱️", title: `Tempo médio até locação: ${Math.round(media)} dias`, text: `Com base em ${tempos.length} imóveis já locados, esse é o tempo médio entre o primeiro contato e a locação efetiva. Use essa referência para prever quando um imóvel recém-contatado deve gerar retorno.` });
  }

  // 4. Melhor mês de desempenho
  const monthGroups = {};
  locados.forEach(i => {
    const k = monthKey(dateEnteredStatus(i, "Locado"));
    if (k) monthGroups[k] = (monthGroups[k] || 0) + 1;
  });
  const monthEntries = Object.entries(monthGroups).sort((a, b) => b[1] - a[1]);
  if (monthEntries.length >= 2) {
    const [bestMonth, bestCount] = monthEntries[0];
    list.push({ tone: "pos", icon: "📈", title: `${monthLabelLong(bestMonth)} foi seu melhor mês`, text: `Foram ${bestCount} imóveis locados nesse período, o maior volume registrado até agora. Vale revisar o que foi diferente — canais usados, tipos de imóvel, ritmo de follow-up — para tentar repetir o padrão.` });
  }

  // 5. Gargalo: status com maior concentração de imóveis parados
  const staleByStatus = {};
  imoveis.forEach(i => { if (isStale(i)) staleByStatus[i.status] = (staleByStatus[i.status] || 0) + 1; });
  const staleEntries = Object.entries(staleByStatus).sort((a, b) => b[1] - a[1]);
  if (staleEntries.length > 0) {
    const [status, count] = staleEntries[0];
    list.push({ tone: "bad", icon: "🚧", title: `Gargalo em "${status}"`, text: `${count} imóvel(is) estão parados há mais de ${STALE_DAYS_THRESHOLD} dias nessa etapa. Esse é um bom ponto de partida para retomar contato ou revisar o que está travando o andamento.` });
  }

  // 6. Slots vs demanda: comparação simples entre volume por tipo e conversão
  const totalStale = imoveis.filter(isStale).length;
  if (totalStale >= 3) {
    list.push({ tone: "warn", icon: "🔄", title: `${totalStale} imóveis estagnados no pipeline`, text: `Isso representa uma fatia relevante da sua carteira ativa sem movimentação recente. Reservar um horário fixo na semana só para retomar esses casos costuma destravar parte deles.` });
  }

  // 6b. Principal motivo de perda (entre Perdido/Cancelado com motivo informado)
  const comMotivo = imoveis.filter(i => (i.status === "Perdido" || i.status === "Cancelado") && i.motivoPerda);
  if (comMotivo.length >= MIN_SAMPLE) {
    const motivoCounts = groupCount(comMotivo, i => i.motivoPerda === "Outro" ? (i.motivoPerdaOutro || "Outro") : i.motivoPerda);
    const [motivo, count] = Object.entries(motivoCounts).sort((a, b) => b[1] - a[1])[0];
    const pct = ((count / comMotivo.length) * 100).toFixed(0);
    list.push({ tone: "info", icon: "🔍", title: `Principal motivo de perda: ${motivo}`, text: `${count} de ${comMotivo.length} perdas registradas (${pct}%) foram por esse motivo. Se for algo recorrente como imóvel já vendido/alugado por fora, pode valer reduzir o tempo entre o primeiro contato e a visita, pra chegar antes da concorrência.` });
  }

  // 7. Taxa de conversão geral, com leitura
  const m = metricsForRange(imoveis);
  if (m.locados + m.perdidosCancelados >= MIN_SAMPLE) {
    const tone = m.conversaoFechados >= 60 ? "pos" : m.conversaoFechados >= 35 ? "info" : "warn";
    const read = m.conversaoFechados >= 60 ? "um resultado sólido" : m.conversaoFechados >= 35 ? "um resultado dentro da média" : "um ponto de atenção";
    list.push({ tone, icon: "🎯", title: `Taxa de conversão geral: ${m.conversaoFechados.toFixed(0)}%`, text: `Considerando os ${m.locados + m.perdidosCancelados} processos já encerrados (locados + perdidos/cancelados), essa taxa representa ${read}. Comparar mês a mês ajuda a identificar se mudanças no processo estão funcionando.` });
  }

  return list;
}

/* ================================================================
   5F. VIEW: RELATÓRIOS
   ================================================================ */
let reportMode = "mensal"; // "mensal" | "semanal"
let reportMonthKey = null;
let reportWeekOffset = 0; // 0 = semana atual, -1 = anterior, etc.

function viewRelatorios() {
  if (!reportMonthKey) reportMonthKey = currentMonthKey();

  return `
    <div class="page-head">
      <div><h1 class="page-title">Relatórios</h1><p class="page-sub">Resumo de produtividade para acompanhamento e prestação de contas</p></div>
      <div class="page-actions">
        <button class="btn" onclick="printReport()">Imprimir / salvar PDF</button>
      </div>
    </div>

    <div class="pipeline-toolbar">
      <div class="view-toggle">
        <button class="${reportMode === "mensal" ? "active" : ""}" onclick="reportMode='mensal'; renderCurrentView();">Mensal</button>
        <button class="${reportMode === "semanal" ? "active" : ""}" onclick="reportMode='semanal'; renderCurrentView();">Semanal</button>
      </div>
      <div style="display:flex; gap:8px; align-items:center;">
        ${reportMode === "mensal" ? `
          <button class="icon-btn" onclick="reportMonthKey=shiftMonthKey(reportMonthKey,-1); renderCurrentView();">‹</button>
          <span class="cell-strong" style="min-width:150px; text-align:center;">${monthLabelLong(reportMonthKey)}</span>
          <button class="icon-btn" onclick="reportMonthKey=shiftMonthKey(reportMonthKey,1); renderCurrentView();">›</button>
        ` : `
          <button class="icon-btn" onclick="reportWeekOffset--; renderCurrentView();">‹</button>
          <span class="cell-strong" style="min-width:220px; text-align:center;">${weekRangeLabel(reportWeekOffset)}</span>
          <button class="icon-btn" onclick="reportWeekOffset++; renderCurrentView();" ${reportWeekOffset >= 0 ? "disabled" : ""}>›</button>
        `}
      </div>
    </div>

    <div id="report-doc">${reportMode === "mensal" ? renderMonthlyReport(reportMonthKey) : renderWeeklyReport(reportWeekOffset)}</div>
  `;
}

function weekRange(offset) {
  const now = new Date();
  const dayOfWeek = now.getDay(); // 0 = domingo
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((dayOfWeek + 6) % 7) + offset * 7);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const toISO = (d) => d.toISOString().slice(0, 10);
  return { start: toISO(monday), end: toISO(sunday) };
}

function weekRangeLabel(offset) {
  const { start, end } = weekRange(offset);
  return `${fmtDate(start)} – ${fmtDate(end)}`;
}

function renderMonthlyReport(key) {
  const prevKey = shiftMonthKey(key, -1);
  const contatos = imoveisContatadosNoMes(key);
  const contatosPrev = imoveisContatadosNoMes(prevKey);
  const cur = imoveisAngariadosNoMes(key);
  const prev = imoveisAngariadosNoMes(prevKey);
  const curLocados = imoveisLocadosNoMes(key);
  const prevLocados = imoveisLocadosNoMes(prevKey);
  const comissaoEst = cur.reduce((s, i) => s + comissaoEstimada(i), 0);
  const comissaoRec = STATE.imoveis.reduce((s, i) => (i.status === "Locado" && i.comissaoRecebida && monthKey(i.comissaoRecebidaData) === key) ? s + comissaoRecebidaValor(i) : s, 0);
  const comissaoRecPrev = STATE.imoveis.reduce((s, i) => (i.status === "Locado" && i.comissaoRecebida && monthKey(i.comissaoRecebidaData) === prevKey) ? s + comissaoRecebidaValor(i) : s, 0);

  return reportDoc({
    title: "Relatório Mensal",
    period: monthLabelLong(key),
    contatosAtual: contatos.length, contatosAnterior: contatosPrev.length,
    totalAtual: cur.length, totalAnterior: prev.length,
    locadosAtual: curLocados.length, locadosAnterior: prevLocados.length,
    conversao: cur.length ? (curLocados.length / cur.length) * 100 : 0,
    comissaoEst, comissaoRec, comissaoRecAnterior: comissaoRecPrev,
    imoveisAtual: cur,
  });
}

function renderWeeklyReport(offset) {
  const { start, end } = weekRange(offset);
  const { start: prevStart, end: prevEnd } = weekRange(offset - 1);
  const contatos = imoveisContatadosNoPeriodo(start, end);
  const contatosPrev = imoveisContatadosNoPeriodo(prevStart, prevEnd);
  const cur = imoveisAngariadosNoPeriodo(start, end);
  const prev = imoveisAngariadosNoPeriodo(prevStart, prevEnd);
  const curLocados = STATE.imoveis.filter(i => i.status === "Locado" && dateEnteredStatus(i, "Locado") >= start && dateEnteredStatus(i, "Locado") <= end);
  const prevLocados = STATE.imoveis.filter(i => i.status === "Locado" && dateEnteredStatus(i, "Locado") >= prevStart && dateEnteredStatus(i, "Locado") <= prevEnd);
  const comissaoEst = cur.reduce((s, i) => s + comissaoEstimada(i), 0);
  const comissaoRec = STATE.imoveis.reduce((s, i) => (i.status === "Locado" && i.comissaoRecebida && i.comissaoRecebidaData >= start && i.comissaoRecebidaData <= end) ? s + comissaoRecebidaValor(i) : s, 0);
  const comissaoRecAnterior = STATE.imoveis.reduce((s, i) => (i.status === "Locado" && i.comissaoRecebida && i.comissaoRecebidaData >= prevStart && i.comissaoRecebidaData <= prevEnd) ? s + comissaoRecebidaValor(i) : s, 0);

  return reportDoc({
    title: "Relatório Semanal",
    period: `${fmtDate(start)} a ${fmtDate(end)}`,
    contatosAtual: contatos.length, contatosAnterior: contatosPrev.length,
    totalAtual: cur.length, totalAnterior: prev.length,
    locadosAtual: curLocados.length, locadosAnterior: prevLocados.length,
    conversao: cur.length ? (curLocados.length / cur.length) * 100 : 0,
    comissaoEst, comissaoRec, comissaoRecAnterior,
    imoveisAtual: cur,
  });
}

function reportDoc(d) {
  const deltaContatos = d.contatosAtual - d.contatosAnterior;
  const deltaTotal = d.totalAtual - d.totalAnterior;
  const deltaLocados = d.locadosAtual - d.locadosAnterior;
  const deltaComissao = d.comissaoRec - d.comissaoRecAnterior;

  return `
    <div class="report-doc">
      <h2>${d.title}</h2>
      <div class="report-period">${d.period}</div>

      <div class="report-stat-row">
        ${reportStat("Novos contatos", d.contatosAtual, deltaContatos)}
        ${reportStat("Angariações", d.totalAtual, deltaTotal)}
        ${reportStat("Locados", d.locadosAtual, deltaLocados)}
        ${reportStat("Conversão", d.conversao.toFixed(0) + "%", null)}
        ${reportStat("Comissão recebida", fmtMoney(d.comissaoRec), deltaComissao, true)}
      </div>
      <p class="section-note" style="margin-bottom:18px;">"Angariações" conta apenas imóveis que chegaram na etapa Angariado no período — não os contatos ainda em andamento.</p>

      <div class="report-section-title">Comissão</div>
      <div class="grid grid-2" style="margin-bottom:10px;">
        <div class="report-stat"><div class="report-stat-label">Estimada no período</div><div class="report-stat-value">${fmtMoney(d.comissaoEst)}</div></div>
        <div class="report-stat"><div class="report-stat-label">Recebida no período</div><div class="report-stat-value">${fmtMoney(d.comissaoRec)}</div></div>
      </div>

      <div class="report-section-title">Imóveis angariados no período</div>
      ${d.imoveisAtual.length === 0 ? `<p class="section-note">Nenhum imóvel chegou na etapa Angariado neste período.</p>` : `
        <div class="table-scroll">
          <table>
            <thead><tr><th>Código</th><th>Endereço</th><th>Tipo</th><th>Status atual</th><th>Aluguel</th></tr></thead>
            <tbody>
              ${d.imoveisAtual.map(i => `<tr><td class="cell-strong">${escapeHtml(i.codigo || "—")}</td><td>${escapeHtml(i.endereco)}</td><td class="cell-dim">${escapeHtml(i.tipo)}</td><td><span class="badge" data-status="${i.status}">${i.status}</span></td><td>${fmtMoney(i.valorAluguel)}</td></tr>`).join("")}
            </tbody>
          </table>
        </div>
      `}
    </div>
  `;
}

function reportStat(label, value, delta, isMoney) {
  let cmp = "";
  if (delta !== null && delta !== undefined) {
    const cls = delta > 0 ? "up" : delta < 0 ? "down" : "flat";
    const color = delta > 0 ? "var(--good)" : delta < 0 ? "var(--bad)" : "var(--text-faint)";
    const txt = isMoney ? fmtMoney(Math.abs(delta)) : Math.abs(delta);
    cmp = `<div class="report-stat-cmp" style="color:${color}">${delta > 0 ? "▲" : delta < 0 ? "▼" : "•"} ${txt} vs. período anterior</div>`;
  }
  return `<div class="report-stat"><div class="report-stat-label">${label}</div><div class="report-stat-value">${value}</div>${cmp}</div>`;
}

function afterRenderRelatorios() {}

function printReport() {
  window.print();
}

/* ================================================================
   5G. VIEW: ROADMAP (Integrações & IA)
   Não são integrações funcionais — é o painel de planejamento
   que documenta a visão de produto para essas frentes.
   ================================================================ */
function viewRoadmap() {
  return `
    <div class="page-head">
      <div><h1 class="page-title">Integrações &amp; IA</h1><p class="page-sub">Visão de produto para as próximas etapas do sistema</p></div>
    </div>

    <div class="grid grid-2" style="align-items:start;">
      <div>
        <div class="roadmap-col-head"><span class="roadmap-tag planned">Integrações planejadas</span></div>

        ${roadmapItem("CRM da imobiliária", "Sincronização bidirecional de imóveis e proprietários, evitando cadastro duplicado entre este painel e o sistema oficial da imobiliária. Prioridade alta por ser a fonte de verdade da empresa.")}
        ${roadmapItem("OLX Pro / Canal Pro", "Importação automática de leads e status de anúncio (ativo, pausado, expirado) direto da plataforma, alimentando o pipeline sem digitação manual e cruzando com os dados de slot/demanda que você já acompanha no trabalho.")}
        ${roadmapItem("WhatsApp", "Envio de lembretes de follow-up e retorno ao proprietário diretamente pelo WhatsApp, com modelos de mensagem por etapa do funil (ex: confirmação de visita, cobrança de documentação).")}
        ${roadmapItem("Google Agenda", "Sincronização de visitas e retornos cadastrados na Agenda deste painel com o Google Agenda, incluindo lembretes automáticos no celular.")}
      </div>

      <div>
        <div class="roadmap-col-head"><span class="roadmap-tag future">Assistente de IA (futuro)</span></div>

        ${roadmapItem("Lembrar follow-ups", "A assistente identificaria compromissos próximos do vencimento e enviaria um resumo diário priorizado, em vez de depender de revisão manual da agenda.")}
        ${roadmapItem("Identificar imóveis parados", "Análise automática do tempo em cada status (já calculada hoje pelas regras deste painel) evoluindo para sugestões específicas: qual ação tomar, e não apenas o alerta de que o imóvel está parado.")}
        ${roadmapItem("Sugerir prioridades do dia", "Cruzando agenda, imóveis estagnados e metas do mês, a assistente sugeriria por onde começar o dia para ter o maior impacto nos resultados.")}
        ${roadmapItem("Gerar relatórios automaticamente", "Os relatórios semanais e mensais já estruturados hoje passariam a ser redigidos em linguagem natural, com destaques automáticos do que mais mudou.")}
        ${roadmapItem("Resumir produtividade", "Um resumo em texto corrido do desempenho do período, complementando os números do dashboard com uma leitura qualitativa.")}
        ${roadmapItem("Sugestões de melhoria", "Recomendações baseadas em padrões históricos — por exemplo, indicar o melhor dia da semana para agendar visitas com base na taxa de conversão observada.")}
      </div>
    </div>

    <div class="divider"></div>
    <div class="card">
      <div class="card-title">Como pedir novas funcionalidades</div>
      <p style="font-size:13px; color:var(--text-dim); line-height:1.6;">
        Sempre que quiser evoluir o sistema, descreva o que precisa e será avaliado como uma melhoria de produto:
        o que resolve, para quem, e como se encaixa no fluxo diário de angariação — antes de qualquer decisão de implementação.
      </p>
    </div>
  `;
}

function roadmapItem(title, desc) {
  return `<div class="roadmap-item"><div class="roadmap-item-title">${title}</div><div class="roadmap-item-desc">${desc}</div></div>`;
}

/* ================================================================
   7. DADOS DE DEMONSTRAÇÃO
   Disponíveis sob demanda em Configurações → "Carregar dados de
   exemplo". Uma conta nova sempre começa vazia (dados reais na
   nuvem, diferente do modo local antigo, que pré-populava tudo).
   ================================================================ */
function seedDemoData() {
  const bairros = ["Gleba Palhano", "Centro", "Jardim Higienópolis", "Vila Nova", "Aeroporto", "Cinco Conjuntos"];
  // Coordenadas aproximadas de cada bairro em Londrina/PR, usadas para
  // espalhar os pinos de demonstração de forma realista no mapa.
  const bairroCoords = {
    "Gleba Palhano": [-23.3287, -51.1552],
    "Centro": [-23.3103, -51.1628],
    "Jardim Higienópolis": [-23.2960, -51.1780],
    "Vila Nova": [-23.2980, -51.1400],
    "Aeroporto": [-23.3340, -51.1300],
    "Cinco Conjuntos": [-23.2820, -51.1550],
  };
  const tipos = TIPOS_IMOVEL;
  const nomes = ["Marcos Silva", "Ana Beatriz", "Carlos Eduardo", "Fernanda Lima", "Roberto Alves", "Juliana Costa", "Paulo Henrique", "Camila Souza"];
  const responsaveis = ["João Vitor"];

  const demo = [];
  const today = new Date();

  for (let i = 0; i < 22; i++) {
    const daysAgo = Math.floor(Math.random() * 150);
    const dataAngariacao = new Date(today); dataAngariacao.setDate(today.getDate() - daysAgo);
    const dataISO = dataAngariacao.toISOString().slice(0, 10);

    const roll = Math.random();
    let status;
    if (daysAgo > 100) status = roll < 0.5 ? "Locado" : roll < 0.65 ? "Perdido" : roll < 0.78 ? "Sem resposta" : roll < 0.88 ? "Cancelado" : "Publicado";
    else if (daysAgo > 45) status = roll < 0.35 ? "Locado" : roll < 0.5 ? "Publicado" : roll < 0.65 ? "Angariado" : roll < 0.78 ? "Documentação" : roll < 0.9 ? "Perdido" : "Sem resposta";
    else status = STATUS_FLOW[Math.floor(Math.random() * (STATUS_FLOW.length - 1))];

    const statusHistory = [{ status: "Novo contato", date: dataISO }];
    if (status !== "Novo contato") {
      const flowIdx = STATUS_FLOW.indexOf(status);
      const stepsToSimulate = flowIdx >= 0 ? flowIdx : 2;
      let cursor = dataAngariacao;
      for (let s = 1; s <= stepsToSimulate; s++) {
        cursor = new Date(cursor); cursor.setDate(cursor.getDate() + Math.floor(Math.random() * 8) + 2);
        statusHistory.push({ status: STATUS_FLOW[s], date: cursor.toISOString().slice(0, 10) });
      }
      if (STATUS_TERMINAL_NEGATIVE.includes(status)) {
        cursor = new Date(cursor); cursor.setDate(cursor.getDate() + Math.floor(Math.random() * 6) + 2);
        statusHistory.push({ status, date: cursor.toISOString().slice(0, 10) });
      }
    }

    const valorAluguel = Math.round((900 + Math.random() * 3200) / 50) * 50;
    const comissaoRecebida = status === "Locado" ? Math.random() < 0.7 : false;
    let comissaoRecebidaData = null;
    if (comissaoRecebida) {
      const locEntry = statusHistory.find(h => h.status === "Locado");
      const base = locEntry ? new Date(locEntry.date) : today;
      base.setDate(base.getDate() + Math.floor(Math.random() * 5));
      comissaoRecebidaData = base.toISOString().slice(0, 10);
    }

    const bairro = bairros[i % bairros.length];
    const [baseLat, baseLng] = bairroCoords[bairro];
    // pequeno espalhamento aleatório para os pinos não ficarem empilhados
    const latitude = baseLat + (Math.random() - 0.5) * 0.012;
    const longitude = baseLng + (Math.random() - 0.5) * 0.012;

    demo.push({
      id: uid(),
      codigo: `LD-${String(1000 + i)}`,
      endereco: `Rua Demonstração, ${100 + i * 7}`,
      bairro,
      cidade: "Londrina",
      tipo: tipos[i % (tipos.length - 1)],
      quartos: 1 + (i % 4),
      banheiros: 1 + (i % 3),
      vagas: i % 3,
      valorAluguel,
      valorCondominio: Math.round(Math.random() * 500),
      proprietarioNome: nomes[i % nomes.length],
      proprietarioTelefone: `(43) 9${String(8000 + i * 37).padStart(4, "0")}-${String(1000 + i * 13).padStart(4, "0")}`,
      formaAbordagem: FORMAS_ABORDAGEM[i % FORMAS_ABORDAGEM.length],
      origemImovel: ORIGENS_IMOVEL[i % ORIGENS_IMOVEL.length],
      latitude, longitude,
      dataAngariacao: dataISO,
      responsavel: responsaveis[0],
      status,
      observacoes: "",
      statusHistory,
      comissaoRecebida,
      comissaoRecebidaValor: comissaoRecebida ? valorAluguel * (STATE.config.comissaoPercent / 100) : null,
      comissaoRecebidaData,
    });
  }

  // Alguns compromissos de agenda de exemplo
  const sample = demo.filter(d => STATUS_FLOW.includes(d.status) && d.status !== "Locado").slice(0, 6);
  const agendaDemo = sample.map((d, idx) => {
    const dt = new Date(today); dt.setDate(today.getDate() + (idx % 3 === 0 ? -Math.floor(Math.random()*3)-1 : Math.floor(Math.random() * 6)));
    return {
      id: uid(),
      title: `${AGENDA_TYPES[idx % AGENDA_TYPES.length]} — ${d.codigo}`,
      type: AGENDA_TYPES[idx % AGENDA_TYPES.length],
      date: dt.toISOString().slice(0, 10),
      imovelId: d.id,
      notes: "",
      done: false,
    };
  });

  return { demo, agendaDemo };
}

// Carrega dados de exemplo na conta do usuário atual — ação manual,
// disponível em Configurações, já que uma conta nova deve começar
// vazia (diferente do modo local, aqui os dados são de verdade).
async function carregarDadosDemo() {
  if (!confirm("Isso vai adicionar imóveis, metas e compromissos de exemplo à sua conta. Continuar?")) return;
  const { demo, agendaDemo } = seedDemoData();

  const { error: e1 } = await supabaseClient.from("imoveis").insert(demo.map(toDbImovel));
  if (e1) { toast("Não foi possível carregar os exemplos: " + e1.message, "error"); return; }

  await supabaseClient.from("metas").upsert({ user_id: currentUser.id, month_key: currentMonthKey(), angariacoes: 15, locados: 8, comissao: 12000 }, { onConflict: "user_id,month_key" });
  await supabaseClient.from("agenda").insert(agendaDemo.map(toDbAgenda));

  closeModal();
  await loadState();
  renderCurrentView();
  toast("Dados de exemplo carregados.");
}

async function resetAllData() {
  if (!confirm("Isso vai apagar PERMANENTEMENTE todos os seus imóveis, metas e compromissos salvos na nuvem. Essa ação não pode ser desfeita. Continuar?")) return;
  const { error: e1 } = await supabaseClient.from("imoveis").delete().eq("user_id", currentUser.id);
  const { error: e2 } = await supabaseClient.from("agenda").delete().eq("user_id", currentUser.id);
  const { error: e3 } = await supabaseClient.from("metas").delete().eq("user_id", currentUser.id);
  if (e1 || e2 || e3) { toast("Não foi possível apagar todos os dados. Tente novamente.", "error"); return; }
  STATE = { imoveis: [], metas: {}, agenda: [], config: STATE.config };
  closeModal();
  renderCurrentView();
  toast("Todos os dados foram apagados.");
}

/* ================================================================
   8. CONFIGURAÇÕES
   ================================================================ */
function openConfigModal() {
  document.getElementById("modal-box").innerHTML = `
    <div class="modal-head">
      <div class="modal-title">Configurações</div>
      <button class="icon-btn" onclick="closeModal()">✕</button>
    </div>
    <div class="modal-body">
      <div class="field-group">
        <label>Percentual de comissão sobre o aluguel</label>
        <input type="number" min="0" step="1" id="cfg-comissao" value="${STATE.config.comissaoPercent}">
        <div class="field-hint">100% equivale a 1 mês de aluguel. Usado para calcular a comissão estimada de cada imóvel automaticamente.</div>
      </div>
      <div class="divider"></div>
      <div class="field-group">
        <label>Conta</label>
        <div class="field-hint" style="margin-bottom:10px;">Logado como <strong>${escapeHtml(currentUser.email)}</strong></div>
      </div>
      <div class="field-group">
        <label>Dados</label>
        <button class="btn" style="width:100%; margin-bottom:8px;" onclick="carregarDadosDemo()">Carregar dados de exemplo</button>
        <div class="field-hint" style="margin-bottom:14px;">Adiciona imóveis, metas e compromissos fictícios para você explorar o sistema.</div>
        <button class="btn btn-danger" style="width:100%;" onclick="resetAllData()">Apagar todos os meus dados</button>
        <div class="field-hint">Remove permanentemente todos os imóveis, metas e compromissos desta conta.</div>
      </div>
    </div>
    <div class="modal-foot">
      <div></div>
      <div style="display:flex; gap:10px;">
        <button class="btn" onclick="closeModal()">Fechar</button>
        <button class="btn btn-primary" onclick="saveConfig()">Salvar</button>
      </div>
    </div>
  `;
  openModal();
}

async function saveConfig() {
  const comissaoPercent = numOrNull(document.getElementById("cfg-comissao").value) || 100;
  const { error } = await supabaseClient.from("user_config").upsert({ user_id: currentUser.id, comissao_percent: comissaoPercent });
  if (error) { toast("Não foi possível salvar: " + error.message, "error"); return; }
  STATE.config.comissaoPercent = comissaoPercent;
  closeModal();
  refresh();
  toast("Configurações salvas.");
}

/* ================================================================
   5H. VIEW: MAPA
   Mostra todos os imóveis com localização definida, coloridos por
   desfecho: verde = locado (conseguiu), vermelho = tentativa sem
   sucesso (perdido/cancelado/sem resposta), âmbar = em andamento.
   ================================================================ */
function viewMapa() {
  const comLocalizacao = STATE.imoveis.filter(i => i.latitude != null && i.longitude != null);
  const semLocalizacao = STATE.imoveis.length - comLocalizacao.length;

  if (STATE.imoveis.length === 0) {
    return `
      <div class="page-head">
        <div><h1 class="page-title">Mapa</h1><p class="page-sub">Onde você tentou e onde conseguiu angariar</p></div>
      </div>
      <div class="empty-state card"><h3>Nenhum imóvel cadastrado ainda</h3><p>Cadastre imóveis e localize os endereços no mapa para vê-los aqui.</p></div>`;
  }

  return `
    <div class="page-head">
      <div><h1 class="page-title">Mapa</h1><p class="page-sub">${comLocalizacao.length} imóveis localizados no mapa</p></div>
      <div class="page-actions"><button class="btn btn-primary" onclick="openImovelModal()">+ Nova angariação</button></div>
    </div>
    <div class="map-page-wrap">
      <div id="map-big"></div>
      ${semLocalizacao > 0 ? `<div class="map-unlocated-note">${semLocalizacao} imóvel(is) sem localização definida. Abra o imóvel e clique em "Localizar endereço no mapa".</div>` : ""}
      <div class="map-legend">
        <div class="map-legend-title">Legenda</div>
        <div class="map-legend-row"><span class="map-legend-dot" style="background:#5fb896;"></span>Locado (conseguiu)</div>
        <div class="map-legend-row"><span class="map-legend-dot" style="background:#e0b458;"></span>Em andamento</div>
        <div class="map-legend-row"><span class="map-legend-dot" style="background:#d97878;"></span>Tentado, sem sucesso</div>
      </div>
    </div>
  `;
}

function markerColorForStatus(status) {
  if (status === "Locado") return "#5fb896";
  if (STATUS_TERMINAL_NEGATIVE.includes(status)) return "#d97878";
  return "#e0b458";
}

function afterRenderMapa() {
  if (STATE.imoveis.length === 0) return;
  if (typeof L === "undefined") {
    const el = document.getElementById("map-big");
    if (el) el.innerHTML = `<div style="display:flex;align-items:center;justify-content:center;height:100%;color:var(--text-faint);font-size:13px;text-align:center;padding:0 20px;">Não foi possível carregar o mapa.<br>Verifique sua conexão com a internet e recarregue a página.</div>`;
    return;
  }
  const comLocalizacao = STATE.imoveis.filter(i => i.latitude != null && i.longitude != null);
  const center = comLocalizacao.length > 0
    ? [comLocalizacao.reduce((s, i) => s + Number(i.latitude), 0) / comLocalizacao.length, comLocalizacao.reduce((s, i) => s + Number(i.longitude), 0) / comLocalizacao.length]
    : LONDRINA_CENTER;

  bigMap = L.map("map-big", { attributionControl: true }).setView(center, comLocalizacao.length ? 12 : 13);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(bigMap);

  const markers = [];
  comLocalizacao.forEach(i => {
    const color = markerColorForStatus(i.status);
    const icon = L.divIcon({
      className: "",
      html: `<div style="width:16px;height:16px;border-radius:50%;background:${color};border:2px solid #12151a;box-shadow:0 1px 4px rgba(0,0,0,.5);"></div>`,
      iconSize: [16, 16], iconAnchor: [8, 8],
    });
    const marker = L.marker([Number(i.latitude), Number(i.longitude)], { icon }).addTo(bigMap);
    marker.bindPopup(`
      <div class="map-popup-title">${escapeHtml(i.codigo || i.endereco)}</div>
      <div class="map-popup-row">${escapeHtml(i.endereco)}${i.bairro ? ", " + escapeHtml(i.bairro) : ""}</div>
      <div class="map-popup-row">${i.status} · ${fmtMoney(i.valorAluguel)}</div>
      <div class="map-popup-link" onclick="openImovelModal('${i.id}')">Ver / editar imóvel</div>
    `);
    markers.push(marker);
  });

  if (markers.length > 1) {
    const group = L.featureGroup(markers);
    bigMap.fitBounds(group.getBounds().pad(0.2));
  }
}
