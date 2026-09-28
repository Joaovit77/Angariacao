"use client";

/* R4.2f — página TEMPORÁRIA do discovery do ZAP. Não executa nada ao abrir:
   só o clique em "Executar uma vez" dispara um único POST, e a página mostra
   apenas o JSON agregado devolvido pela rota. Sai junto com o harness. */
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSessao } from "@/components/SessaoProvider";
import { useAppStore } from "@/lib/store";
import { getSupabase } from "@/lib/persistencia/supabase";

export default function DiagnosticoZap() {
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
      const r = await fetch("/api/admin/diagnostico-zap", {
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
      <p style={{ fontWeight: 600 }}>Diagnóstico temporário (R4.2f). Não faz parte do produto.</p>
      <h1>Discovery estrutural do ZAP</h1>
      <p>
        Prova única em Preview: uma consulta ao Firecrawl para a listagem de apartamentos para locação
        em Londrina/PR. Nada é gravado e só números agregados aparecem abaixo.
      </p>
      <button type="button" onClick={executar} disabled={executado || andamento}>
        {andamento ? "Executando…" : "Executar uma vez"}
      </button>
      {resposta !== null && (
        <pre style={{ overflowX: "auto", whiteSpace: "pre-wrap" }}>{JSON.stringify(resposta, null, 2)}</pre>
      )}
    </main>
  );
}
