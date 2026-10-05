"use client";
import { useEffect, useState } from "react";
import { ehErroRetomada, type ErroRetomada } from "./calculo/retomada";
import { getSupabase } from "./persistencia/supabase";
import type { ResultadoRetomada } from "./servidor/retomada";

export function useRetomadaB4(): boolean {
  const [habilitada, setHabilitada] = useState(false);
  useEffect(() => {
    let ativa = true;
    void fetch("/api/retomadas?capacidade=1", { cache: "no-store" })
      .then(async (r) => r.ok && (await r.json()).habilitada === true)
      .then((valor) => { if (ativa) setHabilitada(valor); }).catch(() => {});
    return () => { ativa = false; };
  }, []);
  return habilitada;
}

export async function requisitarRetomada<T>(consulta: { retomadaImovelId: string; id?: string }, corpo?: unknown): Promise<ResultadoRetomada<T>> {
  try {
    const { data } = await getSupabase().auth.getSession();
    if (!data.session) return { ok: false, erro: "sessao-invalida" };
    const parametros = new URLSearchParams({ retomadaImovelId: consulta.retomadaImovelId });
    if (consulta.id) parametros.set("id", consulta.id);
    const r = await fetch(`/api/retomadas?${parametros}`, {
      method: corpo ? "POST" : "GET", cache: "no-store",
      headers: { Authorization: `Bearer ${data.session.access_token}`, "Content-Type": "application/json" },
      ...(corpo ? { body: JSON.stringify(corpo) } : {}),
    });
    const resposta = await r.json();
    if (r.ok && resposta.ok === true && resposta.valor) return { ok: true, valor: resposta.valor };
    const erro: ErroRetomada = ehErroRetomada(resposta.erro) ? resposta.erro : "falha-operacao";
    return { ok: false, erro };
  } catch { return { ok: false, erro: "falha-operacao" }; }
}
