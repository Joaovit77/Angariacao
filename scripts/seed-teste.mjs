/* ================================================================
   SEED — dataset representativo para o usuário de teste da migração
   (Etapa 0 do MIGRATION_NEXT.md). Idempotente: apaga os dados do
   usuário de teste e recria tudo. Usa apenas a anon key + login do
   usuário de teste — a RLS garante que só as linhas dele são tocadas.
   ================================================================ */

// Credenciais do usuário de TESTE via variáveis de ambiente:
//   SEED_EMAIL=... SEED_PASSWORD=... node scripts/seed-teste.mjs
// Nunca rode com a conta real — o script APAGA todos os dados do usuário.
const SUPABASE_URL = "https://jkkzknmdrvbstouekosi.supabase.co";
const ANON_KEY = "sb_publishable_m7IOOA53WnXlhKDvW1C3xA_Ch3OQoRE";
const EMAIL = process.env.SEED_EMAIL;
const PASSWORD = process.env.SEED_PASSWORD;
if (!EMAIL || !PASSWORD) {
  console.error("Defina SEED_EMAIL e SEED_PASSWORD (conta de teste) antes de rodar.");
  process.exit(1);
}

const { randomUUID } = await import("node:crypto");

// ---- login ------------------------------------------------------
const loginRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
  method: "POST",
  headers: { apikey: ANON_KEY, "Content-Type": "application/json" },
  body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
});
if (!loginRes.ok) {
  console.error("FALHA NO LOGIN:", loginRes.status, await loginRes.text());
  process.exit(1);
}
const session = await loginRes.json();
const USER_ID = session.user.id;
const TOKEN = session.access_token;
console.log("Login OK — user_id:", USER_ID);

const headers = {
  apikey: ANON_KEY,
  Authorization: `Bearer ${TOKEN}`,
  "Content-Type": "application/json",
  Prefer: "return=minimal",
};

async function del(table) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}?user_id=eq.${USER_ID}`, {
    method: "DELETE", headers,
  });
  if (!r.ok) throw new Error(`DELETE ${table}: ${r.status} ${await r.text()}`);
  console.log(`Limpou ${table}`);
}

async function insert(table, rows) {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${table}`, {
    method: "POST", headers, body: JSON.stringify(rows),
  });
  if (!r.ok) throw new Error(`INSERT ${table}: ${r.status} ${await r.text()}`);
  console.log(`Inseriu ${Array.isArray(rows) ? rows.length : 1} em ${table}`);
}

// Upsert (POST com merge-duplicates) — usado onde não dá para apagar antes.
// Ex.: user_config não tem policy de DELETE na RLS, então o del() vira no-op
// e um INSERT depois bateria em chave duplicada; o upsert resolve nos dois casos.
async function upsert(table, rows, onConflict) {
  const url = `${SUPABASE_URL}/rest/v1/${table}` + (onConflict ? `?on_conflict=${onConflict}` : "");
  const r = await fetch(url, {
    method: "POST",
    headers: { ...headers, Prefer: "return=minimal,resolution=merge-duplicates" },
    body: JSON.stringify(rows),
  });
  if (!r.ok) throw new Error(`UPSERT ${table}: ${r.status} ${await r.text()}`);
  console.log(`Upsert de ${Array.isArray(rows) ? rows.length : 1} em ${table}`);
}

// ---- limpeza (ordem: agenda referencia imoveis) -------------------
await del("agenda");
await del("imoveis");
await del("metas");
// user_config não tem policy de DELETE — não apagamos aqui; é feito via upsert no final.

// ---- imóveis ------------------------------------------------------
// Hoje = 2026-07-09. IDs fixos por randomUUID para vincular agenda.
const ids = Object.fromEntries(
  ["i1","i2","i3","i4","i5","i6","i7","i8","i9","i10","i11","i12","i13","i14"].map(k => [k, randomUUID()])
);

const base = (over) => ({
  user_id: USER_ID,
  codigo: null, referencia_crm: null, cep: null, endereco: "", bairro: null,
  cidade: "São Paulo", tipo: null, quartos: null, banheiros: null, vagas: null,
  valor_aluguel: 0, valor_condominio: 0, proprietario_nome: null,
  proprietario_telefone: null, forma_abordagem: null, origem_imovel: null,
  imobiliaria_concorrente: null, latitude: null, longitude: null,
  data_angariacao: null, responsavel: "João Vitor", status: "Novo contato",
  observacoes: null, status_history: [], pausado_ate: null, motivo_perda: null,
  motivo_perda_outro: null, comissao_recebida: false,
  comissao_recebida_valor: null, comissao_recebida_data: null,
  ...over,
});

const imoveis = [
  // 1. Novo contato — recém-criado hoje, sem lat/lng
  base({ id: ids.i1, codigo: "AP-001", endereco: "Rua das Acácias, 120 apto 32", bairro: "Pinheiros",
    tipo: "Apartamento", quartos: 2, banheiros: 1, vagas: 1, valor_aluguel: 2800, valor_condominio: 650,
    proprietario_nome: "Marcos Ferreira", proprietario_telefone: "(11) 98888-0001",
    forma_abordagem: "Ligação telefônica", origem_imovel: "Placa no imóvel",
    status: "Novo contato", status_history: [{ status: "Novo contato", date: "2026-07-09" }] }),

  // 2. Novo contato — STALE (12 dias parado), com lat/lng
  base({ id: ids.i2, codigo: "CA-002", cep: "05407-002", endereco: "Rua Fradique Coutinho, 800", bairro: "Vila Madalena",
    tipo: "Casa", quartos: 3, banheiros: 2, vagas: 2, valor_aluguel: 5200, valor_condominio: 0,
    proprietario_nome: "Regina Alves", proprietario_telefone: "(11) 98888-0002",
    forma_abordagem: "WhatsApp", origem_imovel: "Prospecção ativa (porta a porta)",
    latitude: -23.5582, longitude: -46.6889,
    status: "Novo contato", status_history: [{ status: "Novo contato", date: "2026-06-27" }] }),

  // 3. Visita agendada — progresso normal
  base({ id: ids.i3, codigo: "AP-003", endereco: "Av. Rebouças, 1500 apto 74", bairro: "Jardim Paulista",
    tipo: "Apartamento", quartos: 1, banheiros: 1, vagas: 1, valor_aluguel: 2300, valor_condominio: 480,
    proprietario_nome: "Paulo Sousa", proprietario_telefone: "(11) 98888-0003",
    forma_abordagem: "Indicação", origem_imovel: "Indicação de cliente",
    latitude: -23.5629, longitude: -46.6698,
    status: "Visita agendada", status_history: [
      { status: "Novo contato", date: "2026-07-04" },
      { status: "Visita agendada", date: "2026-07-07" },
    ] }),

  // 4. Em negociação — STALE (11 dias), histórico multi-status
  base({ id: ids.i4, codigo: "SO-004", endereco: "Rua Harmonia, 45", bairro: "Sumarezinho",
    tipo: "Sobrado", quartos: 4, banheiros: 3, vagas: 2, valor_aluguel: 6800, valor_condominio: 0,
    proprietario_nome: "Cláudia Menezes", proprietario_telefone: "(11) 98888-0004",
    forma_abordagem: "Visita presencial", origem_imovel: "OLX / Canal Pro",
    imobiliaria_concorrente: "Imob Rival Ltda",
    status: "Em negociação", status_history: [
      { status: "Novo contato", date: "2026-06-20" },
      { status: "Visita agendada", date: "2026-06-24" },
      { status: "Em negociação", date: "2026-06-28" },
    ] }),

  // 5. Documentação — 4 etapas de histórico
  base({ id: ids.i5, codigo: "AP-005", cep: "04038-001", endereco: "Rua Sena Madureira, 300 apto 11", bairro: "Vila Mariana",
    tipo: "Apartamento", quartos: 2, banheiros: 2, vagas: 1, valor_aluguel: 3400, valor_condominio: 720,
    proprietario_nome: "Fernanda Lima", proprietario_telefone: "(11) 98888-0005",
    forma_abordagem: "WhatsApp", origem_imovel: "Redes sociais",
    latitude: -23.5893, longitude: -46.6416,
    status: "Documentação", status_history: [
      { status: "Novo contato", date: "2026-06-25" },
      { status: "Visita agendada", date: "2026-06-30" },
      { status: "Em negociação", date: "2026-07-03" },
      { status: "Documentação", date: "2026-07-08" },
    ] }),

  // 6. Angariado em JULHO (mês corrente) — com lat/lng
  base({ id: ids.i6, codigo: "KT-006", endereco: "Rua Augusta, 2200 studio 5", bairro: "Consolação",
    tipo: "Kitnet/Studio", quartos: 1, banheiros: 1, vagas: 0, valor_aluguel: 1900, valor_condominio: 380,
    proprietario_nome: "Ricardo Tanaka", proprietario_telefone: "(11) 98888-0006",
    forma_abordagem: "Rede social", origem_imovel: "Redes sociais",
    latitude: -23.5560, longitude: -46.6602, data_angariacao: "2026-07-05",
    status: "Angariado", status_history: [
      { status: "Novo contato", date: "2026-06-28" },
      { status: "Visita agendada", date: "2026-07-01" },
      { status: "Em negociação", date: "2026-07-02" },
      { status: "Documentação", date: "2026-07-04" },
      { status: "Angariado", date: "2026-07-05" },
    ] }),

  // 7. Angariado em JUNHO (mês anterior)
  base({ id: ids.i7, codigo: "CA-007", endereco: "Rua Girassol, 88", bairro: "Vila Madalena",
    tipo: "Casa", quartos: 2, banheiros: 1, vagas: 1, valor_aluguel: 4100, valor_condominio: 0,
    proprietario_nome: "Beatriz Rocha", proprietario_telefone: "(11) 98888-0007",
    forma_abordagem: "Panfletagem", origem_imovel: "Prospecção ativa (porta a porta)",
    latitude: -23.5541, longitude: -46.6921, data_angariacao: "2026-06-10",
    status: "Angariado", status_history: [
      { status: "Novo contato", date: "2026-05-30" },
      { status: "Visita agendada", date: "2026-06-03" },
      { status: "Em negociação", date: "2026-06-06" },
      { status: "Angariado", date: "2026-06-10" },
    ] }),

  // 8. Publicado — angariado em junho, publicado depois
  base({ id: ids.i8, codigo: "AP-008", endereco: "Al. Santos, 1000 apto 92", bairro: "Cerqueira César",
    tipo: "Apartamento", quartos: 3, banheiros: 2, vagas: 2, valor_aluguel: 5500, valor_condominio: 1100,
    proprietario_nome: "Otávio Guimarães", proprietario_telefone: "(11) 98888-0008",
    forma_abordagem: "E-mail", origem_imovel: "Site da imobiliária",
    latitude: -23.5658, longitude: -46.6535, data_angariacao: "2026-06-05",
    status: "Publicado", status_history: [
      { status: "Novo contato", date: "2026-05-22" },
      { status: "Visita agendada", date: "2026-05-27" },
      { status: "Em negociação", date: "2026-05-30" },
      { status: "Documentação", date: "2026-06-02" },
      { status: "Angariado", date: "2026-06-05" },
      { status: "Publicado", date: "2026-06-15" },
    ] }),

  // 9. LOCADO em julho — funil completo, comissão recebida
  base({ id: ids.i9, codigo: "AP-009", cep: "01415-001", endereco: "Rua Haddock Lobo, 600 apto 41", bairro: "Cerqueira César",
    tipo: "Apartamento", quartos: 2, banheiros: 2, vagas: 1, valor_aluguel: 3600, valor_condominio: 800,
    proprietario_nome: "Sílvia Prado", proprietario_telefone: "(11) 98888-0009",
    forma_abordagem: "Indicação", origem_imovel: "Ex-cliente",
    latitude: -23.5590, longitude: -46.6640, data_angariacao: "2026-06-08",
    comissao_recebida: true, comissao_recebida_valor: 1800, comissao_recebida_data: "2026-07-06",
    status: "Locado", status_history: [
      { status: "Novo contato", date: "2026-05-20" },
      { status: "Visita agendada", date: "2026-05-25" },
      { status: "Em negociação", date: "2026-05-28" },
      { status: "Documentação", date: "2026-06-02" },
      { status: "Angariado", date: "2026-06-08" },
      { status: "Publicado", date: "2026-06-12" },
      { status: "Locado", date: "2026-07-02" },
    ] }),

  // 10. LOCADO em maio (coorte antiga) — comissão recebida em junho
  base({ id: ids.i10, codigo: "CA-010", endereco: "Rua dos Pinheiros, 415", bairro: "Pinheiros",
    tipo: "Casa de Condomínio", quartos: 3, banheiros: 3, vagas: 2, valor_aluguel: 3000, valor_condominio: 550,
    proprietario_nome: "Henrique Barros", proprietario_telefone: "(11) 98888-0010",
    forma_abordagem: "Ligação telefônica", origem_imovel: "Placa no imóvel",
    latitude: -23.5665, longitude: -46.6820, data_angariacao: "2026-05-06",
    comissao_recebida: true, comissao_recebida_valor: 1500, comissao_recebida_data: "2026-06-01",
    status: "Locado", status_history: [
      { status: "Novo contato", date: "2026-04-24" },
      { status: "Visita agendada", date: "2026-04-28" },
      { status: "Em negociação", date: "2026-05-02" },
      { status: "Angariado", date: "2026-05-06" },
      { status: "Publicado", date: "2026-05-12" },
      { status: "Locado", date: "2026-05-28" },
    ] }),

  // 11. Sem resposta — saída lateral cedo
  base({ id: ids.i11, codigo: "AP-011", endereco: "Rua Teodoro Sampaio, 1200 apto 15", bairro: "Pinheiros",
    tipo: "Apartamento", quartos: 1, banheiros: 1, vagas: 0, valor_aluguel: 1700, valor_condominio: 420,
    proprietario_nome: "Vera Castro", proprietario_telefone: "(11) 98888-0011",
    forma_abordagem: "WhatsApp", origem_imovel: "OLX / Canal Pro",
    status: "Sem resposta", status_history: [
      { status: "Novo contato", date: "2026-06-15" },
      { status: "Sem resposta", date: "2026-06-22" },
    ] }),

  // 12. Perdido — concorrência
  base({ id: ids.i12, codigo: "SO-012", endereco: "Rua Cardeal Arcoverde, 900", bairro: "Pinheiros",
    tipo: "Sobrado", quartos: 3, banheiros: 2, vagas: 1, valor_aluguel: 4800, valor_condominio: 0,
    proprietario_nome: "Antônio Neves", proprietario_telefone: "(11) 98888-0012",
    forma_abordagem: "Visita presencial", origem_imovel: "Prospecção ativa (porta a porta)",
    imobiliaria_concorrente: "Concorrente Imóveis",
    motivo_perda: "Optou por outra imobiliária",
    status: "Perdido", status_history: [
      { status: "Novo contato", date: "2026-06-05" },
      { status: "Em negociação", date: "2026-06-10" },
      { status: "Perdido", date: "2026-06-25" },
    ] }),

  // 13. Cancelado — proprietário desistiu
  base({ id: ids.i13, codigo: "AP-013", endereco: "Av. Brigadeiro Luís Antônio, 3000 apto 88", bairro: "Jardim Paulista",
    tipo: "Apartamento", quartos: 2, banheiros: 1, vagas: 1, valor_aluguel: 2900, valor_condominio: 690,
    proprietario_nome: "Márcia Duarte", proprietario_telefone: "(11) 98888-0013",
    forma_abordagem: "Ligação telefônica", origem_imovel: "Indicação de cliente",
    motivo_perda: "Proprietário desistiu de alugar",
    status: "Cancelado", status_history: [
      { status: "Novo contato", date: "2026-06-01" },
      { status: "Visita agendada", date: "2026-06-05" },
      { status: "Cancelado", date: "2026-06-18" },
    ] }),

  // 14. Perdido — motivo "Outro" com texto livre; tipo sem quartos
  base({ id: ids.i14, codigo: "GA-014", endereco: "Rua do Gasômetro, 500", bairro: "Brás",
    tipo: "Galpão", valor_aluguel: 9500, valor_condominio: 0,
    proprietario_nome: "Grupo Andrade", proprietario_telefone: "(11) 98888-0014",
    forma_abordagem: "E-mail", origem_imovel: "Outro",
    motivo_perda: "Outro", motivo_perda_outro: "Proprietário vai reformar o galpão antes de alugar",
    status: "Perdido", status_history: [
      { status: "Novo contato", date: "2026-07-01" },
      { status: "Perdido", date: "2026-07-08" },
    ] }),
];

await insert("imoveis", imoveis);

// ---- metas --------------------------------------------------------
await insert("metas", [
  { user_id: USER_ID, month_key: "2026-05", angariacoes: 3, locados: 1, comissao: 3000 },
  { user_id: USER_ID, month_key: "2026-06", angariacoes: 4, locados: 2, comissao: 4000 },
  { user_id: USER_ID, month_key: "2026-07", angariacoes: 5, locados: 2, comissao: 5000 },
]);

// ---- agenda -------------------------------------------------------
// Verificações automáticas: só para angariados NÃO locados (6, 7, 8) —
// título, tipo, notes e data (+60 dias) idênticos ao que saveImovel() gera.
const NOTES_VERIF = "Lembrete automático: imóvel angariado sem locação após 60 dias. Confirme com o proprietário se ainda está disponível.";
await insert("agenda", [
  { user_id: USER_ID, id: randomUUID(), title: "Retornar ligação — proprietário do AP-003", type: "Retorno ao proprietário",
    date: "2026-07-10", imovel_id: ids.i3, notes: "Confirmar horário da visita de sábado.", done: false, is_verificacao_disponibilidade: false },
  { user_id: USER_ID, id: randomUUID(), title: "Visita ao sobrado da Rua Harmonia", type: "Visita",
    date: "2026-07-09", imovel_id: ids.i4, notes: null, done: false, is_verificacao_disponibilidade: false },
  { user_id: USER_ID, id: randomUUID(), title: "Enviar minuta do contrato ao proprietário", type: "Documentação",
    date: "2026-07-05", imovel_id: ids.i5, notes: "Minuta enviada por e-mail.", done: true, is_verificacao_disponibilidade: false },
  { user_id: USER_ID, id: randomUUID(), title: "Cobrar certidão negativa pendente", type: "Pendência",
    date: "2026-07-12", imovel_id: ids.i5, notes: null, done: false, is_verificacao_disponibilidade: false },
  { user_id: USER_ID, id: randomUUID(), title: "Follow-up com proprietária da CA-002", type: "Follow-up",
    date: "2026-07-03", imovel_id: ids.i2, notes: "Sem retorno até agora.", done: false, is_verificacao_disponibilidade: false },
  // verificações de disponibilidade (auto) — 60 dias após a angariação
  { user_id: USER_ID, id: randomUUID(), title: "Verificar disponibilidade — KT-006", type: "Follow-up",
    date: "2026-09-03", imovel_id: ids.i6, notes: NOTES_VERIF, done: false, is_verificacao_disponibilidade: true },
  { user_id: USER_ID, id: randomUUID(), title: "Verificar disponibilidade — CA-007", type: "Follow-up",
    date: "2026-08-09", imovel_id: ids.i7, notes: NOTES_VERIF, done: false, is_verificacao_disponibilidade: true },
  { user_id: USER_ID, id: randomUUID(), title: "Verificar disponibilidade — AP-008", type: "Follow-up",
    date: "2026-08-04", imovel_id: ids.i8, notes: NOTES_VERIF, done: false, is_verificacao_disponibilidade: true },
]);

// ---- user_config ---------------------------------------------------
await upsert("user_config", [{ user_id: USER_ID, comissao_percent: 50 }], "user_id");

console.log("\nSeed concluído com sucesso.");
console.log("Resumo: 14 imóveis (10 status cobertos), 3 metas (mai/jun/jul 2026), 8 itens de agenda (3 verificações automáticas), comissão 50%.");
