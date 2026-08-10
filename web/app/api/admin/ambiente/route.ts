/* ================================================================
   API: O QUE ESTÁ CONFIGURADO NESTE DEPLOY

   Metade das funções deste app depende de um segredo que mora numa
   variável de ambiente da Vercel, e até aqui a única forma de saber se
   uma delas estava lá era um corretor esbarrar na função e receber
   "não configurado". Quer dizer: o sintoma chegava pela pessoa errada,
   depois de o trabalho ter sido interrompido — e chegava igual para
   "faltou a variável" e para "o serviço caiu", que pedem coisas
   opostas de quem opera.

   Isto é especialmente traiçoeiro num deploy novo ou depois de uma
   troca de chave: nada falha no build, nada aparece no log até alguém
   USAR aquilo, e a variável esquecida pode ficar meses invisível.

   **Só booleanos saem daqui. Nunca o valor, nunca um pedaço dele, nem
   mascarado.** Um prefixo "sk-proj-abc…" já é mais do que o browser
   precisa saber, e o browser do admin não é mais seguro que o de
   ninguém — é a mesma regra do token da instância, que a rota de
   `instancia` não devolve nem pela metade. A pergunta que esta tela
   responde é "está lá?", não "qual é".
   ================================================================ */
import { exigirAdmin } from "../_comum";

/** Uma capacidade do sistema e o que ela deixa de funcionar sem a
    variável. O texto vem daqui e não da tela porque quem lê "OPENAI_API_KEY
    ausente" já sabe o que fazer; quem lê "os botões de IA não aparecem
    para ninguém" descobre o que está perdendo. */
interface Capacidade {
  chave: string;
  nome: string;
  /** Nome da variável, para quem for até a Vercel resolver. */
  variavel: string;
  configurado: boolean;
  /** O que para de funcionar sem ela. */
  semEla: string;
  /** Falta dela derruba o produto, ou só uma parte? */
  essencial: boolean;
}

export async function GET(request: Request): Promise<Response> {
  const guarda = await exigirAdmin(request);
  if ("resposta" in guarda) return guarda.resposta;

  const tem = (nome: string) => !!process.env[nome]?.trim();

  const capacidades: Capacidade[] = [
    {
      chave: "supabase",
      nome: "Banco de dados",
      variavel: "NEXT_PUBLIC_SUPABASE_URL / ANON_KEY",
      configurado: tem("NEXT_PUBLIC_SUPABASE_URL") && tem("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
      semEla: "Nada funciona — não há login nem dados.",
      essencial: true,
    },
    {
      chave: "servico",
      nome: "Chave de serviço",
      variavel: "SUPABASE_SERVICE_ROLE_KEY",
      // Se estivesse faltando, `exigirAdmin` teria recusado antes de
      // chegar aqui — mas a linha fica na lista de propósito: um
      // painel de configuração que esconde o que está OK não deixa
      // conferir nada, só reclamar.
      configurado: tem("SUPABASE_SERVICE_ROLE_KEY"),
      semEla: "Este painel, o webhook e a integração param.",
      essencial: true,
    },
    {
      chave: "evolution",
      nome: "Servidor de WhatsApp",
      variavel: "EVOLUTION_SERVER_URL",
      configurado: tem("EVOLUTION_SERVER_URL"),
      semEla: "Ninguém envia nem recebe mensagem pelo painel.",
      essencial: true,
    },
    {
      chave: "webhook",
      nome: "Segredo do webhook",
      variavel: "EVOLUTION_WEBHOOK_SECRET",
      configurado: tem("EVOLUTION_WEBHOOK_SECRET"),
      semEla: "As respostas dos proprietários não entram — e a rota fica aberta a quem quiser forjar uma.",
      essencial: true,
    },
    {
      chave: "openai",
      nome: "IA (OpenAI)",
      variavel: "OPENAI_API_KEY",
      configurado: tem("OPENAI_API_KEY"),
      semEla: "Sem transcrição de áudio, sem classificação de resposta e sem rascunho.",
      essencial: false,
    },
    {
      chave: "firecrawl",
      nome: "Busca de anúncios (Firecrawl)",
      variavel: "FIRECRAWL_API_KEY",
      configurado: tem("FIRECRAWL_API_KEY"),
      semEla: "Os portais que bloqueiam consultas do servidor deixam de retornar anúncios.",
      essencial: false,
    },
    {
      chave: "google",
      nome: "Google Agenda",
      variavel: "GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET",
      configurado: tem("GOOGLE_CLIENT_ID") && tem("GOOGLE_CLIENT_SECRET"),
      semEla: "Os compromissos não espelham na agenda pessoal de ninguém.",
      essencial: false,
    },
    {
      chave: "sophia",
      nome: "Sistema Principal (Sophia)",
      variavel: "SOPHIA_WEBHOOK_SECRET",
      configurado: tem("SOPHIA_WEBHOOK_SECRET"),
      semEla: "Assinatura, locação e comissão não chegam ao painel.",
      essencial: false,
    },
  ];

  return Response.json({ ok: true, capacidades });
}
