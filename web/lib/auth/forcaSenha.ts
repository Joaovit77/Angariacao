/* ================================================================
   FORÇA DA SENHA
   Port literal de passwordStrength() (app.js, seção 7). Mesma
   pontuação, mesmos rótulos e as mesmas variáveis CSS de cor.
   ================================================================ */

export interface ForcaSenha {
  pct: number;
  label: string;
  color: string;
}

export function forcaSenha(pw: string): ForcaSenha {
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
