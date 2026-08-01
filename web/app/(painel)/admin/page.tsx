"use client";

/* ================================================================
   ROTA: /admin

   A verificação é feita AQUI, e não pelo `ehAdmin` do store, por causa
   de um detalhe de tempo: aquele flag começa `false` e só vira `true`
   quando a consulta ao servidor volta. Usá-lo direto expulsaria o
   administrador da própria página no primeiro quadro, antes de a
   resposta chegar. Daí o estado de três valores — "ainda não sei" é
   diferente de "não é".

   Isto continua sendo conveniência, não controle de acesso: quem barra
   de verdade é o `exigirAdmin` em cada rota /api/admin/*. Uma página
   que carregasse sem permissão não mostraria nada, porque toda consulta
   dela voltaria 403.
   ================================================================ */
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import AdminView from "@/components/admin/AdminView";
import { souAdmin } from "@/lib/admin";

export default function Pagina() {
  const [permitido, setPermitido] = useState<boolean | null>(null);
  const router = useRouter();

  useEffect(() => {
    let cancelado = false;
    souAdmin().then((ok) => {
      if (cancelado) return;
      setPermitido(ok);
      if (!ok) router.replace("/home");
    });
    return () => {
      cancelado = true;
    };
  }, [router]);

  if (permitido !== true) return null;
  return <AdminView />;
}
