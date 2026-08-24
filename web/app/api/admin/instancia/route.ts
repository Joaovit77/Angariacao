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
import { provisionarInstanciaCorretora } from "@/lib/servidor/instanciaWhatsapp";
import { alvoValido, erro, exigirAdmin } from "../_comum";

/** Violação de unique no Postgres. `instancia` é unique porque é a
    chave que traduz o evento do webhook em dono: duas linhas com o
    mesmo nome tornariam a carteira ambígua. */
const UNIQUE_VIOLATION = "23505";

export async function POST(request: Request): Promise<Response> {
  const guarda = await exigirAdmin(request);
  if ("resposta" in guarda) return guarda.resposta;
  const { sb, userId: quemPediu } = guarda;

  let corpo: { userId?: unknown; instancia?: unknown; token?: unknown; modo?: unknown };
  try {
    corpo = await request.json();
  } catch {
    return erro("requisicao-invalida", 400);
  }

  const alvo = alvoValido(corpo.userId);
  if (!alvo) return erro("requisicao-invalida", 400);

  if (corpo.modo === "corretora") {
    const resultado = await provisionarInstanciaCorretora(sb, alvo);
    if (!resultado.ok) {
      const mensagens = {
        "nao-configurado": "Configure AUTHENTICATION_API_KEY no servidor antes de gerar o QR Code.",
        indisponivel: "A Evolution não respondeu. Nenhuma instância foi criada; tente novamente.",
        "sem-token": "A Evolution não devolveu o token da instância fixa.",
        persistencia: "Não foi possível salvar o cadastro da corretora.",
        "instancia-em-uso": "A instância \"corretora\" já pertence a outra conta.",
        "usuario-ja-configurado":
          "Esta conta já possui outra instância. Nada foi substituído automaticamente.",
        "sem-instancia": "Não foi possível preparar a instância fixa.",
      } satisfies Record<typeof resultado.falha, string>;
      const conflito =
        resultado.falha === "instancia-em-uso" || resultado.falha === "usuario-ja-configurado";
      return Response.json(
        { ok: false, falha: resultado.falha, mensagem: mensagens[resultado.falha] },
        { status: conflito ? 409 : resultado.falha === "nao-configurado" ? 503 : 502 },
      );
    }

    registrarEvento({
      userId: alvo,
      categoria: "admin",
      nivel: "info",
      evento: resultado.criada ? "admin-instancia-criada" : "admin-instancia-recuperada",
      detalhe: `corretora — por ${quemPediu}`,
    });
    return Response.json({
      ok: true,
      instancia: resultado.instancia,
      criada: resultado.criada,
      qr: resultado.qr,
    });
  }

  const instancia = typeof corpo.instancia === "string" ? corpo.instancia.trim() : "";
  const token = typeof corpo.token === "string" ? corpo.token.trim() : "";
  if (!instancia) return erro("requisicao-invalida", 400);

  const { data: existente, error: erroLeitura } = await sb
    .from("whatsapp_instancias")
    .select("instancia")
    .eq("user_id", alvo)
    .maybeSingle();
  if (erroLeitura) return erro("falha", 500);
  if (existente?.instancia === "corretora" && instancia !== "corretora") {
    return Response.json(
      {
        ok: false,
        falha: "requisicao-invalida",
        mensagem: "A instância fixa da corretora não pode ser renomeada.",
      },
      { status: 409 },
    );
  }

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
