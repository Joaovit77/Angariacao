import { getSupabase } from "./persistencia/supabase";
import type { EventoInvestigacao } from "./calculo/investigadorImoveis";
import {
  parametrosDaReferenciaInvestigador,
  type ReferenciaContextoInvestigador,
} from "./calculo/contextoInvestigador";

export interface ContextoInvestigador {
  consulta: string;
  origem: "pipeline" | "radar" | "central" | "garimpo";
}

/** C13B: só a origem do Garimpo em Campo tem memória. O navegador manda
    apenas o UUID do imóvel identificado; o servidor confere a posse,
    gera o id da execução e, concluída a pesquisa, grava o evento e as
    descobertas estruturadas pela RPC do C13A (que também anota
    `ultima_investigacao_em`, na mesma transação). Pipeline, Radar e
    Central continuam sem persistência, como sempre. */
export function imovelIdentificadoDaReferencia(
  referencia: ReferenciaContextoInvestigador | null | undefined,
): string | null {
  return referencia?.origem === "imovel-identificado" ? referencia.id : null;
}

export async function carregarContextoInvestigador(
  referencia: string | ReferenciaContextoInvestigador,
  signal?: AbortSignal,
): Promise<ContextoInvestigador> {
  const { data: { session } } = await getSupabase().auth.getSession();
  if (!session) throw new Error("Sua sessão expirou. Entre novamente.");

  const parametros = parametrosDaReferenciaInvestigador(
    typeof referencia === "string" ? { origem: "imovel", id: referencia } : referencia,
  );
  const resposta = await fetch(`/api/investigador-imoveis?${parametros}`, {
    headers: { Authorization: `Bearer ${session.access_token}` },
    cache: "no-store",
    signal,
  });
  const corpo = await resposta.json().catch(() => null) as (ContextoInvestigador & { mensagem?: string }) | null;
  if (!resposta.ok || typeof corpo?.consulta !== "string") {
    throw new Error(
      corpo?.mensagem
      || "Não foi possível carregar o imóvel indicado. Você ainda pode preencher a pesquisa manualmente.",
    );
  }
  return { consulta: corpo.consulta, origem: corpo.origem };
}

export async function investigarImovel(
  consulta: string,
  aoEvento: (evento: EventoInvestigacao) => void,
  signal?: AbortSignal,
  referencia?: ReferenciaContextoInvestigador | null,
): Promise<void> {
  const { data: { session } } = await getSupabase().auth.getSession();
  if (!session) throw new Error("Sua sessão expirou. Entre novamente.");

  const imovelIdentificado = imovelIdentificadoDaReferencia(referencia);
  const resposta = await fetch("/api/investigador-imoveis", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.access_token}`,
    },
    body: JSON.stringify(imovelIdentificado ? { consulta, imovelIdentificado } : { consulta }),
    signal,
  });
  if (!resposta.ok || !resposta.body) {
    const corpo = await resposta.json().catch(() => null) as { mensagem?: string } | null;
    throw new Error(corpo?.mensagem || "Não foi possível iniciar a investigação.");
  }

  const leitor = resposta.body.getReader();
  const decodificador = new TextDecoder();
  let pendente = "";
  let terminalRecebido = false;
  const erroDeInterrupcao = () => new Error("A investigação foi interrompida antes de concluir. Tente novamente.");
  const entregar = (linha: string) => {
    let evento: EventoInvestigacao;
    try {
      evento = JSON.parse(linha) as EventoInvestigacao;
    } catch {
      throw erroDeInterrupcao();
    }
    if (evento.tipo === "resultado" || evento.tipo === "erro") terminalRecebido = true;
    aoEvento(evento);
  };
  while (true) {
    const { done, value } = await leitor.read().catch(() => { throw erroDeInterrupcao(); });
    pendente += decodificador.decode(value, { stream: !done });
    const linhas = pendente.split("\n");
    pendente = linhas.pop() || "";
    for (const linha of linhas) {
      if (!linha.trim()) continue;
      entregar(linha);
    }
    if (done) break;
  }
  if (pendente.trim()) entregar(pendente);
  if (!terminalRecebido) {
    throw erroDeInterrupcao();
  }
}
