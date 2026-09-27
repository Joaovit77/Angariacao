"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSessao } from "@/components/SessaoProvider";
import { useAppStore } from "@/lib/store";
import { getSupabase } from "@/lib/persistencia/supabase";

export default function DiagnosticoVivaReal() {
  const router = useRouter();
  const { usuario } = useSessao();
  const ehAdmin = useAppStore((s) => s.ehAdmin);
  const cargoConfirmado = useAppStore((s) => s.cargoUsuarioId === usuario?.id);
  const acionado = useRef(false);
  const [andamento, setAndamento] = useState(false);
  const [executado, setExecutado] = useState(false);
  const [resposta, setResposta] = useState<unknown>(null);

  useEffect(() => {
    if (cargoConfirmado && !ehAdmin) router.replace("/home");
  }, [cargoConfirmado, ehAdmin, router]);

  if (!cargoConfirmado || !ehAdmin) return null;

  async function executar() {
    if (acionado.current) return;
    acionado.current = true;
    setExecutado(true);
    setAndamento(true);
    try {
      const { data: { session } } = await getSupabase().auth.getSession();
      if (!session) {
        setResposta({ ok: false, falha: "sessao_expirada" });
        return;
      }
      const r = await fetch("/api/admin/diagnostico-vivareal", {
        method: "POST",
        headers: { Authorization: `Bearer ${session.access_token}` },
        cache: "no-store",
      });
      setResposta(await r.json().catch(() => ({ ok: false, falha: "resposta_invalida" })));
    } catch {
      setResposta({ ok: false, falha: "requisicao_falhou" });
    } finally {
      setAndamento(false);
    }
  }

  return (
    <main style={{ maxWidth: 860, margin: "3rem auto", padding: "1.5rem" }}>
      <h1>Diagnóstico estrutural temporário do Viva Real</h1>
      <p>Prova única em Preview para a listagem de apartamentos para locação em Londrina.</p>
      <button type="button" onClick={executar} disabled={executado || andamento}>
        {andamento ? "Executando…" : "Executar uma vez"}
      </button>
      {resposta !== null && <pre style={{ overflowX: "auto", whiteSpace: "pre-wrap" }}>{JSON.stringify(resposta, null, 2)}</pre>}
    </main>
  );
}
