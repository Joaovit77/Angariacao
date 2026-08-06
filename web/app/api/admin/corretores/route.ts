/* ================================================================
   API: OS CORRETORES (a tela principal do admin)

   Junta, num pedido só, o que estava espalhado por quatro lugares que
   ninguém cruzava: quem tem conta (auth), quem tem número cadastrado
   (`whatsapp_instancias`), quem tem IA liberada (`ia_permissoes`) e
   quanto cada um gastou (`ia_uso`). A conta de "quem está travado"
   depende justamente do cruzamento — existir conta e não existir
   instância é o caso que trava o produto, e nenhuma das duas tabelas
   sabe disso sozinha.

   As MÉTRICAS DE USO (imóveis, tentativas, respostas) são calculadas
   aqui em TypeScript, sobre as colunas jsonb, e não por uma função SQL
   que somaria no banco. A conta em SQL seria mais barata, mas exigiria
   reescrever em PL/pgSQL a regra de "o que é resposta do proprietário"
   — que hoje mora em `ehNotaDeResposta` e tem uma sutileza fácil de
   perder (a nota do encerramento automático também começa com `wa:`).
   Este projeto já tem um par de funções gêmeas TS/SQL, o
   `telefoneCanonico`, e o comentário dele avisa: divergir faz o
   casamento falhar EM SILÊNCIO. Não vale criar o segundo par para
   economizar bytes num painel que uma pessoa abre por dia.

   Quando revisitar: o `select` traz `tentativas` e `notas` de todos os
   imóveis de todas as contas. Na ordem de grandeza de hoje (centenas
   de imóveis por corretor, poucos corretores) é irrelevante; se um dia
   forem dezenas de milhares, a saída é paginar por corretor, não
   duplicar a regra em SQL.
   ================================================================ */
import { errosPorCorretor, type CorretorAdmin } from "@/lib/calculo/admin";
import { gastoPorCorretor, somarGasto, type UsoIa } from "@/lib/calculo/custoIa";
import { ehNotaDeResposta } from "@/lib/calculo/notas";
import { addDaysISO, todayISO } from "@/lib/datas";
import type { NotaImovel, Tentativa } from "@/lib/tipos";
import { erro, exigirAdmin } from "../_comum";

/** Janela do "está usando?" — a mesma dos cards de 30 dias do app. */
const DIAS_ATIVIDADE = 30;
/** Janela do "quebrou?" — curta, porque erro de duas semanas atrás já
    foi resolvido ou já virou reclamação. */
const DIAS_ERRO = 7;

interface LinhaImovel {
  user_id: string | null;
  tentativas: unknown;
  notas: unknown;
}

/** Quantos itens do array jsonb são posteriores ao corte. As duas
    colunas guardam datetime local "YYYY-MM-DDTHH:mm", que é
    lexicograficamente ordenável — a comparação por string é a mesma
    que o resto do app faz. */
function contarDesde<T>(itens: unknown, corte: string, aceita: (item: T) => boolean): number {
  if (!Array.isArray(itens)) return 0;
  let n = 0;
  for (const item of itens) {
    if (!item || typeof item !== "object") continue;
    const data = (item as { data?: unknown }).data;
    if (typeof data !== "string" || data < corte) continue;
    if (aceita(item as T)) n++;
  }
  return n;
}

export async function GET(request: Request): Promise<Response> {
  const guarda = await exigirAdmin(request);
  if ("resposta" in guarda) return guarda.resposta;
  const { sb } = guarda;

  const hoje = todayISO();
  // Período do gasto: o mês corrente por padrão (é o que a fatura da
  // OpenAI mostra), ou o que a tela pedir.
  const url = new URL(request.url);
  const pedido = url.searchParams.get("desde");
  const desde = /^\d{4}-\d{2}-\d{2}$/.test(pedido || "") ? (pedido as string) : `${hoje.slice(0, 7)}-01`;
  const corteAtividade = addDaysISO(hoje, -DIAS_ATIVIDADE) || hoje;
  const corteErro = addDaysISO(hoje, -DIAS_ERRO) || hoje;

  // As contas. `listUsers` pagina — sem o laço, o painel silenciosamente
  // pararia de mostrar gente a partir da página 2.
  const contas: { id: string; email: string; nome: string | null; criadoEm: string; ultimoAcesso: string | null }[] = [];
  for (let pagina = 1; ; pagina++) {
    const { data, error } = await sb.auth.admin.listUsers({ page: pagina, perPage: 200 });
    if (error) {
      console.error("Admin: falha ao listar contas:", error.message);
      return erro("falha", 500);
    }
    for (const u of data.users) {
      const nome = u.user_metadata?.name;
      contas.push({
        id: u.id,
        email: u.email || "",
        nome: typeof nome === "string" && nome.trim() ? nome.trim() : null,
        criadoEm: u.created_at,
        ultimoAcesso: u.last_sign_in_at || null,
      });
    }
    if (data.users.length < 200) break;
  }

  const [instRes, iaRes, googleRes, imoveisRes, usoRes, logRes, adminRes] = await Promise.all([
    sb.from("whatsapp_instancias").select("user_id, instancia"),
    sb.from("ia_permissoes").select("user_id, liberado, teto_usd"),
    sb.from("google_contas").select("user_id"),
    sb.from("imoveis").select("user_id, tentativas, notas"),
    sb.from("ia_uso").select("user_id, tipo, modelo, tokens_entrada, tokens_entrada_cache, tokens_saida, criado_em").gte("criado_em", desde),
    sb.from("log_eventos").select("id, user_id, categoria, nivel, evento, detalhe, criado_em").eq("nivel", "erro").gte("criado_em", corteErro),
    sb.from("admins").select("user_id, opera_carteira"),
  ]);

  const falhou =
    instRes.error ||
    iaRes.error ||
    googleRes.error ||
    imoveisRes.error ||
    usoRes.error ||
    logRes.error ||
    adminRes.error;
  if (falhou) {
    console.error("Admin: falha ao montar o painel:", falhou.message);
    return erro("falha", 500);
  }

  const instancias = new Map<string, string>();
  for (const r of instRes.data || []) if (r.user_id) instancias.set(r.user_id as string, r.instancia as string);

  const iaLiberada = new Set<string>();
  const tetos = new Map<string, number>();
  for (const r of iaRes.data || []) {
    if (!r.user_id) continue;
    if (r.liberado) iaLiberada.add(r.user_id as string);
    // `Number(null)` é 0, e um teto de zero significaria "toda chamada
    // estoura". Só entra o que é número de verdade — a mesma cautela do
    // `lerValor` da integração, pelo mesmo motivo: aqui é tela de
    // dinheiro, e o valor ilegível não pode virar um número exato.
    const teto = r.teto_usd === null || r.teto_usd === undefined ? null : Number(r.teto_usd);
    if (teto !== null && Number.isFinite(teto) && teto > 0) tetos.set(r.user_id as string, teto);
  }

  // Quem tem o cargo, e quem entre eles trabalha carteira. Ausência da
  // linha = não é admin = opera carteira, que é o padrão de todo mundo.
  const adminCarteira = new Map<string, boolean>();
  for (const r of adminRes.data || []) {
    if (r.user_id) adminCarteira.set(r.user_id as string, r.opera_carteira !== false);
  }

  const google = new Set<string>();
  for (const r of googleRes.data || []) if (r.user_id) google.add(r.user_id as string);

  const contagens = new Map<string, { imoveis: number; tentativas: number; respostas: number }>();
  for (const linha of (imoveisRes.data || []) as LinhaImovel[]) {
    const dono = linha.user_id;
    if (!dono) continue;
    const atual = contagens.get(dono) || { imoveis: 0, tentativas: 0, respostas: 0 };
    atual.imoveis++;
    atual.tentativas += contarDesde<Tentativa>(linha.tentativas, corteAtividade, () => true);
    // Só o que o PROPRIETÁRIO escreveu: a nota do encerramento
    // automático nasce com o mesmo prefixo `wa:` e é o app falando.
    atual.respostas += contarDesde<NotaImovel>(linha.notas, corteAtividade, ehNotaDeResposta);
    contagens.set(dono, atual);
  }

  const usos: UsoIa[] = (usoRes.data || []).map((r) => ({
    userId: (r.user_id as string | null) ?? null,
    tipo: r.tipo as string,
    modelo: r.modelo as string,
    tokensEntrada: Number(r.tokens_entrada) || 0,
    tokensEntradaCache: Number(r.tokens_entrada_cache) || 0,
    tokensSaida: Number(r.tokens_saida) || 0,
    criadoEm: r.criado_em as string,
  }));
  const gastos = gastoPorCorretor(usos);

  const erros = errosPorCorretor(
    (logRes.data || []).map((r) => ({
      id: Number(r.id),
      userId: (r.user_id as string | null) ?? null,
      categoria: r.categoria as string,
      nivel: r.nivel as string,
      evento: r.evento as string,
      detalhe: (r.detalhe as string | null) ?? null,
      criadoEm: r.criado_em as string,
    })),
  );

  const corretores: CorretorAdmin[] = contas.map((c) => {
    const uso = contagens.get(c.id) || { imoveis: 0, tentativas: 0, respostas: 0 };
    return {
      id: c.id,
      email: c.email,
      nome: c.nome,
      criadoEm: c.criadoEm,
      ultimoAcesso: c.ultimoAcesso,
      instancia: instancias.get(c.id) || null,
      iaLiberada: iaLiberada.has(c.id),
      tetoUsd: tetos.get(c.id) ?? null,
      googleConectado: google.has(c.id),
      ehAdmin: adminCarteira.has(c.id),
      operaCarteira: adminCarteira.get(c.id) ?? true,
      imoveis: uso.imoveis,
      tentativas30d: uso.tentativas,
      respostas30d: uso.respostas,
      errosRecentes: erros.get(c.id) || 0,
      gasto: gastos.get(c.id) || somarGasto([], c.id),
    };
  });

  // O gasto de contas já removidas (`user_id` nulo) não pertence a
  // ninguém da lista, mas foi dinheiro que saiu — vai à parte para o
  // total do painel bater com a fatura.
  const orfao = gastos.get("") || null;

  return Response.json({ ok: true, corretores, desde, hoje, orfao });
}
