"use client";

/* ================================================================
   RAIZ — tela de acesso.
   É também onde cai o link de recuperação de senha do e-mail
   (resetPasswordForEmail usa window.location.origin como redirectTo),
   por isso o evento PASSWORD_RECOVERY do onAuthStateChange abre aqui
   o formulário "Defina sua nova senha", como no app antigo.
   Com sessão válida, segue para o app (/dashboard).
   ================================================================ */
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import TelaAuth from "@/components/auth/TelaAuth";
import { useSessao } from "@/components/SessaoProvider";

export default function Raiz() {
  const { estado } = useSessao();
  const router = useRouter();

  useEffect(() => {
    if (estado === "auth") router.replace("/dashboard");
  }, [estado, router]);

  if (estado === "auth") return null;
  return <TelaAuth recuperacao={estado === "recuperacao"} />;
}
