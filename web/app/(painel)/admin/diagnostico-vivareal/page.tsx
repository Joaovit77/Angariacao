"use client";

import { useState } from "react";
import { useSessao } from "@/components/SessaoProvider";
import { getSupabase } from "@/lib/persistencia/supabase";
import { useAppStore } from "@/lib/store";

const CHAVE_EXECUCAO = "r4-2d-vivareal-prova-preview";

export default function DiagnosticoVivaReal() {
  const { usuario } = useSessao();
  const ehAdmin = useAppStore((s) => s.ehAdmin);
  const cargoConfirmado = useAppStore((s) => s.cargoUsuarioId === usuario?.id);
  const [executando, setExecutando] = useState(false);
  const [resultado, setResultado] = useState<unknown>(null);
  const [executado, setExecutado] = useState(false);

  if (!cargoConfirmado || !ehAdmin) return null;

  async function executar() {
    if (executando || executado || sessionStorage.getItem(CHAVE_EXECUCAO)) return;
    sessionStorage.setItem(CHAVE_EXECUCAO, "1");
    setExecutado(true);
    setExecutando(true);
    try {
      const { data: { session } } = await getSupabase().auth.getSession();
      if (!session) {
        setResultado({ ok: false, falha: "sessao_indisponivel" });
        return;
      }
      const resposta = await fetch("/api/admin/diagnostico-vivareal", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: "no-store",
      });
      setResultado(await resposta.json());
    } catch {
      setResultado({ ok: false, falha: "requisicao_indisponivel" });
    } finally {
      setExecutando(false);
    }
  }

  return (
    <main style={{ maxWidth: 760, margin: "3rem auto", padding: "1rem" }}>
      <h1>Prova temporária Viva Real — R4.2d</h1>
      <p>Uma execução no Preview. O resultado contém somente métricas agregadas.</p>
      <button type="button" disabled={executando || executado} onClick={executar}>
        {executando ? "Executando…" : executado ? "Prova acionada" : "Executar uma vez"}
      </button>
      {resultado !== null && <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{JSON.stringify(resultado, null, 2)}</pre>}
    </main>
  );
}
