/* ================================================================
   TRADUÇÃO DOS ERROS DO SUPABASE AUTH
   Port literal de traduzErroAuth() (app.js, seção 7).
   ================================================================ */

export function traduzErroAuth(error: { message?: string }): string {
  const msg = error.message || "";
  if (msg.includes("Invalid login credentials")) return "E-mail ou senha incorretos.";
  if (msg.includes("User already registered")) return "Já existe uma conta com esse e-mail.";
  if (msg.includes("Password should be at least")) return "A senha precisa ter pelo menos 6 caracteres.";
  if (msg.includes("Unable to validate email address")) return "Esse e-mail não parece válido.";
  return msg || "Não foi possível concluir. Tente novamente.";
}
