"use client";

/* ================================================================
   ROTA: /admin

   O cargo vem do boot único do `SessaoProvider`. `cargoUsuarioId` forma o
   terceiro estado que um booleano sozinho não oferece: antes da resposta,
   esta página não decide nem renderiza; depois dela, `ehAdmin` pode negar ou
   liberar sem fazer o perfil errado piscar.

   Isto continua sendo conveniência, não controle de acesso: quem barra
   de verdade é o `exigirAdmin` em cada rota /api/admin/*. Uma página
   que carregasse sem permissão não mostraria nada, porque toda consulta
   dela voltaria 403.
   ================================================================ */
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import AdminView from "@/components/admin/AdminView";
import { useSessao } from "@/components/SessaoProvider";
import { useAppStore } from "@/lib/store";

export default function Pagina() {
  const router = useRouter();
  const { usuario } = useSessao();
  const ehAdmin = useAppStore((s) => s.ehAdmin);
  const cargoConfirmado = useAppStore((s) => s.cargoUsuarioId === usuario?.id);

  useEffect(() => {
    if (cargoConfirmado && !ehAdmin) router.replace("/home");
  }, [cargoConfirmado, ehAdmin, router]);

  if (!cargoConfirmado || !ehAdmin) return null;
  return <AdminView />;
}
