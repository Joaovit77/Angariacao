const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
const segredo = process.env.CRON_SECRET;
const endpoint = process.env.MENSAGENS_CRON_URL
  || "https://angariacao.vercel.app/api/cron/mensagens";

const ausentes = [
  ["NEXT_PUBLIC_SUPABASE_URL", url],
  ["SUPABASE_SERVICE_ROLE_KEY", serviceRole],
  ["CRON_SECRET", segredo],
].filter(([, valor]) => !valor).map(([nome]) => nome);

if (ausentes.length) {
  throw new Error(`Variaveis ausentes: ${ausentes.join(", ")}`);
}

const resposta = await fetch(`${url}/rest/v1/rpc/configurar_cron_mensagens`, {
  method: "POST",
  headers: {
    apikey: serviceRole,
    Authorization: `Bearer ${serviceRole}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ p_url: endpoint, p_segredo: segredo }),
});

if (!resposta.ok) {
  const detalhe = await resposta.text();
  throw new Error(`Falha ao configurar o cron (${resposta.status}): ${detalhe}`);
}

const jobId = await resposta.json();
console.log(`Cron de mensagens ativo. Job ${jobId}; segredo armazenado no Vault.`);
