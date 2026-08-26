/* ================================================================
   API: A IA DE UM CORRETOR — liberar, revogar, pôr teto, e a série

   POST era a linha que se inseria à mão no Table Editor do Supabase.
   Com um usuário isso funciona; com dez, o corretor novo fica
   esperando alguém abrir o banco — e é a espera que faz a conta
   esfriar.

   Repare no desenho: `ia_permissoes` continua SEM política de escrita
   (ver supabase-schema.sql). Não foi preciso afrouxá-la para esta rota
   existir — quem escreve é a service role, do lado do servidor, depois
   de `exigirAdmin`. Se um dia alguém "simplificar" isto criando uma
   política de update na tabela, o controle inteiro cai: qualquer
   usuário se autolibera com a anon key, que é pública por design.

   GET é a série mensal, e existe porque um número sozinho não responde
   a pergunta que se faz olhando para uma conta: **está subindo?** O
   painel mostrava só o mês corrente, e é o crescimento que se descobre
   tarde, pela fatura.

   O TETO **avisa, não bloqueia**, e isso é decisão de produto, não
   preguiça: cortar a IA no meio do mês transformaria um estouro de
   conta num incidente para o corretor, que não escolheu o teto e não
   pode mudá-lo. O painel acende a linha; quem decide o que fazer é
   quem opera. Ver o comentário da tabela em supabase-schema.sql.
   ================================================================ */
import { gastoMensalPorCorretor, gastoPorMes, ultimosMeses, type UsoIa } from "@/lib/calculo/custoIa";
import { todayISO } from "@/lib/datas";
import { registrarEvento } from "@/lib/servidor/registro";
import { alvoValido, erro, exigirAdmin } from "../_comum";

/** Janela padrão da série. Seis meses cobrem a sazonalidade de uma
    imobiliária sem transformar a consulta numa varredura da tabela
    inteira. */
const MESES_PADRAO = 6;
const MESES_MAX = 24;

export async function GET(request: Request): Promise<Response> {
  const guarda = await exigirAdmin(request);
  if ("resposta" in guarda) return guarda.resposta;
  const { sb } = guarda;

  const pedido = Number(new URL(request.url).searchParams.get("meses"));
  const meses = Number.isFinite(pedido) && pedido >= 1 ? Math.min(Math.trunc(pedido), MESES_MAX) : MESES_PADRAO;

  const hoje = todayISO();
  // O primeiro dia do mês mais antigo da janela — sem isto a consulta
  // traria a tabela inteira só para descartar quase tudo em memória.
  const desde = `${ultimosMeses(hoje, meses)[0]}-01`;

  const { data, error } = await sb
    .from("ia_uso")
    .select("user_id, tipo, modelo, tokens_entrada, tokens_entrada_cache, tokens_entrada_cache_gravacao, tokens_saida, criado_em")
    .gte("criado_em", desde);
  if (error) {
    console.error("Admin: falha ao ler o histórico de IA:", error.message);
    return erro("falha", 500);
  }

  const usos: UsoIa[] = (data || []).map((r) => ({
    userId: (r.user_id as string | null) ?? null,
    tipo: r.tipo as string,
    modelo: r.modelo as string,
    tokensEntrada: Number(r.tokens_entrada) || 0,
    tokensEntradaCache: Number(r.tokens_entrada_cache) || 0,
    tokensEntradaCacheGravacao: Number(r.tokens_entrada_cache_gravacao) || 0,
    tokensSaida: Number(r.tokens_saida) || 0,
    criadoEm: r.criado_em as string,
  }));

  const porCorretor = gastoMensalPorCorretor(usos, hoje, meses);
  return Response.json({
    ok: true,
    meses,
    // O total inclui as contas já removidas: é o número que precisa
    // bater com a fatura da OpenAI, e ela não sabe que alguém saiu.
    total: gastoPorMes(usos, hoje, meses),
    historico: [...porCorretor.entries()].map(([userId, serie]) => ({ userId, serie })),
  });
}

export async function POST(request: Request): Promise<Response> {
  const guarda = await exigirAdmin(request);
  if ("resposta" in guarda) return guarda.resposta;
  const { sb, userId: quemPediu } = guarda;

  let corpo: { userId?: unknown; liberado?: unknown; tetoUsd?: unknown };
  try {
    corpo = await request.json();
  } catch {
    return erro("requisicao-invalida", 400);
  }

  // O ALVO vem do corpo — e só ele. Quem PEDE saiu do token, em
  // `exigirAdmin`; misturar as duas coisas é o erro que a guarda existe
  // para tornar impossível.
  const alvo = alvoValido(corpo.userId);
  if (!alvo) return erro("requisicao-invalida", 400);

  const mexeNoAcesso = typeof corpo.liberado === "boolean";
  /* Ausente e `null` são coisas DIFERENTES aqui: ausente é "não mexa no
     teto", `null` é "apague o teto". O teste por `undefined` separa as
     duas porque `JSON.parse` nunca produz `undefined` — campo que não
     veio simplesmente não existe no objeto. */
  const mexeNoTeto = corpo.tetoUsd !== undefined;
  if (!mexeNoAcesso && !mexeNoTeto) return erro("requisicao-invalida", 400);

  let teto: number | null = null;
  if (mexeNoTeto && corpo.tetoUsd !== null) {
    const n = Number(corpo.tetoUsd);
    // Teto zero seria "toda chamada estoura", que ninguém quer dizer —
    // quem quer bloquear revoga o acesso, que é o botão ao lado.
    if (!Number.isFinite(n) || n <= 0) return erro("requisicao-invalida", 400);
    teto = n;
  }

  const linha: Record<string, unknown> = { user_id: alvo };
  if (mexeNoAcesso) linha.liberado = corpo.liberado;
  if (mexeNoTeto) linha.teto_usd = teto;

  const { error } = await sb.from("ia_permissoes").upsert(linha, { onConflict: "user_id" });
  if (error) {
    console.error("Admin: falha ao gravar a permissão de IA:", error.message);
    return erro("falha", 500);
  }

  /* Fica no log do PRÓPRIO corretor: quem for investigar a conta dele
     amanhã precisa ver que a IA foi ligada (ou desligada) e quando —
     senão "a IA parou de funcionar" vira mistério. Quem fez a mudança
     vai no detalhe. O teto é registrado à parte porque não muda o que
     ele consegue fazer, só o que a nossa tela cobra de nós. */
  if (mexeNoAcesso) {
    registrarEvento({
      userId: alvo,
      categoria: "admin",
      nivel: "info",
      evento: corpo.liberado ? "admin-ia-liberada" : "admin-ia-revogada",
      detalhe: `por ${quemPediu}`,
    });
  }
  if (mexeNoTeto) {
    registrarEvento({
      userId: alvo,
      categoria: "admin",
      nivel: "info",
      evento: "admin-teto-ia",
      detalhe: `${teto === null ? "sem teto" : `US$ ${teto}`} — por ${quemPediu}`,
    });
  }

  return Response.json({ ok: true, liberado: corpo.liberado, tetoUsd: teto });
}
