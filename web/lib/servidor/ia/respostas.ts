import { mensagemFalhaIa, type FalhaIa } from "@/lib/calculo/ia";

export function respostaErroIa(falha: FalhaIa, status: number): Response {
  return Response.json(
    { ok: false, falha, mensagem: mensagemFalhaIa(falha) },
    { status },
  );
}
