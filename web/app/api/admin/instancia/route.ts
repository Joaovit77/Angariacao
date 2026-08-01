/* ================================================================
   API: CADASTRAR O NÚMERO DE WHATSAPP DE UM CORRETOR

   Esta é a rota que destrava a conta nova. Sem linha em
   `whatsapp_instancias` o corretor entra, cadastra imóvel, e o botão
   "Enviar agora" responde "fale com o responsável pelo sistema" — que
   é uma frase que só faz sentido se o responsável tiver por onde
   responder. Até aqui o "por onde" era o Table Editor do Supabase.

   DUAS COISAS QUE NÃO PODEM MUDAR:

   1. **O token não volta.** Nem aqui, nem na rota de corretores, nem
      mascarado pela metade. Ele é o segredo que manda mensagem pela
      instância, e a tabela não tem política de select justamente para
      ele não chegar ao browser (ver supabase-schema.sql). Uma tela de
      admin que o exibisse desfaria isso — e o browser do admin não é
      mais seguro que o de qualquer outro. A tela mostra se ESTÁ
      configurado, não qual é.

   2. **Escrever o token vazio não apaga o que já existe.** Salvar de
      novo só para corrigir o nome da instância é o caso comum, e
      limpar o token nesse gesto deixaria a conta silenciosamente sem
      poder enviar — o mesmo tipo de perda em silêncio dos históricos
      jsonb que o `salvarImovel` teve que aprender a repor.
   ================================================================ */
import { registrarEvento } from "@/lib/servidor/registro";
import { alvoValido, erro, exigirAdmin } from "../_comum";

/** Violação de unique no Postgres. `instancia` é unique porque é a
    chave que traduz o evento do webhook em dono: duas linhas com o
    mesmo nome tornariam a carteira ambígua. */
const UNIQUE_VIOLATION = "23505";

export async function POST(request: Request): Promise<Response> {
  const guarda = await exigirAdmin(request);
  if ("resposta" in guarda) return guarda.resposta;
  const { sb, userId: quemPediu } = guarda;

  let corpo: { userId?: unknown; instancia?: unknown; token?: unknown };
  try {
    corpo = await request.json();
  } catch {
    return erro("requisicao-invalida", 400);
  }

  const alvo = alvoValido(corpo.userId);
  const instancia = typeof corpo.instancia === "string" ? corpo.instancia.trim() : "";
  const token = typeof corpo.token === "string" ? corpo.token.trim() : "";
  if (!alvo || !instancia) return erro("requisicao-invalida", 400);

  // Token em branco = "não mexa no que já está lá" (ver a regra 2 no
  // topo). Só entra no update quando veio preenchido.
  const linha: Record<string, unknown> = { user_id: alvo, instancia };
  if (token) linha.token = token;

  const { error } = await sb.from("whatsapp_instancias").upsert(linha, { onConflict: "user_id" });
  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      return Response.json(
        {
          ok: false,
          falha: "requisicao-invalida",
          mensagem: `A instância "${instancia}" já está cadastrada para outro corretor.`,
        },
        { status: 409 },
      );
    }
    console.error("Admin: falha ao gravar a instância:", error.message);
    return erro("falha", 500);
  }

  registrarEvento({
    userId: alvo,
    categoria: "admin",
    nivel: "info",
    evento: "admin-instancia-salva",
    // Nome da instância, nunca o token.
    detalhe: `${instancia} — por ${quemPediu}`,
  });

  return Response.json({ ok: true, instancia });
}
