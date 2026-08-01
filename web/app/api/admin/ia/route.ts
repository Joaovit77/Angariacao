/* ================================================================
   API: LIBERAR / REVOGAR A IA DE UM CORRETOR

   Era a linha que se inseria à mão no Table Editor do Supabase. Com um
   usuário isso funciona; com dez, o corretor novo fica esperando
   alguém abrir o banco — e é a espera que faz a conta esfriar.

   Repare no desenho: `ia_permissoes` continua SEM política de escrita
   (ver supabase-schema.sql). Não foi preciso afrouxá-la para esta rota
   existir — quem escreve é a service role, do lado do servidor, depois
   de `exigirAdmin`. Se um dia alguém "simplificar" isto criando uma
   política de update na tabela, o controle inteiro cai: qualquer
   usuário se autolibera com a anon key, que é pública por design.
   ================================================================ */
import { registrarEvento } from "@/lib/servidor/registro";
import { alvoValido, erro, exigirAdmin } from "../_comum";

export async function POST(request: Request): Promise<Response> {
  const guarda = await exigirAdmin(request);
  if ("resposta" in guarda) return guarda.resposta;
  const { sb, userId: quemPediu } = guarda;

  let corpo: { userId?: unknown; liberado?: unknown };
  try {
    corpo = await request.json();
  } catch {
    return erro("requisicao-invalida", 400);
  }

  // O ALVO vem do corpo — e só ele. Quem PEDE saiu do token, em
  // `exigirAdmin`; misturar as duas coisas é o erro que a guarda existe
  // para tornar impossível.
  const alvo = alvoValido(corpo.userId);
  if (!alvo || typeof corpo.liberado !== "boolean") return erro("requisicao-invalida", 400);
  const liberado = corpo.liberado;

  const { error } = await sb
    .from("ia_permissoes")
    .upsert({ user_id: alvo, liberado }, { onConflict: "user_id" });
  if (error) {
    console.error("Admin: falha ao gravar a permissão de IA:", error.message);
    return erro("falha", 500);
  }

  // Fica no log do PRÓPRIO corretor: quem for investigar a conta dele
  // amanhã precisa ver que a IA foi ligada (ou desligada) e quando —
  // senão "a IA parou de funcionar" vira mistério. Quem fez a mudança
  // vai no detalhe.
  registrarEvento({
    userId: alvo,
    categoria: "admin",
    nivel: "info",
    evento: liberado ? "admin-ia-liberada" : "admin-ia-revogada",
    detalhe: `por ${quemPediu}`,
  });

  return Response.json({ ok: true, liberado });
}
