import { getSupabase } from "./persistencia/supabase";
import type { EventoInvestigacao } from "./calculo/investigadorImoveis";

export async function investigarImovel(
  consulta: string,
  aoEvento: (evento: EventoInvestigacao) => void,
  signal?: AbortSignal,
): Promise<void> {
  const { data: { session } } = await getSupabase().auth.getSession();
  if (!session) throw new Error("Sua sessão expirou. Entre novamente.");

  const resposta = await fetch("/api/investigador-imoveis", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify({ consulta }),
    signal,
  });
  if (!resposta.ok || !resposta.body) {
    const corpo = await resposta.json().catch(() => null) as { mensagem?: string } | null;
    throw new Error(corpo?.mensagem || "Não foi possível iniciar a investigação.");
  }

  const leitor = resposta.body.getReader();
  const decodificador = new TextDecoder();
  let pendente = "";
  while (true) {
    const { done, value } = await leitor.read();
    pendente += decodificador.decode(value, { stream: !done });
    const linhas = pendente.split("\n");
    pendente = linhas.pop() || "";
    for (const linha of linhas) {
      if (!linha.trim()) continue;
      aoEvento(JSON.parse(linha) as EventoInvestigacao);
    }
    if (done) break;
  }
  if (pendente.trim()) aoEvento(JSON.parse(pendente) as EventoInvestigacao);
}
