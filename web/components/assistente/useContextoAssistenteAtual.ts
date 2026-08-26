"use client";

import { useMemo } from "react";
import { usePathname } from "next/navigation";
import { montarContextoAssistente } from "@/lib/assistente/contexto";
import { usePipelineUi } from "@/lib/uiPipeline";
import { useUiModal } from "@/lib/uiModal";

export function useContextoAssistenteAtual() {
  const pathname = usePathname();
  const drawerId = usePipelineUi((estado) => estado.drawerImovelId);
  const modal = useUiModal((estado) => estado.modal);
  const contexto = useMemo(
    () => montarContextoAssistente(pathname, drawerId, modal),
    [pathname, drawerId, modal],
  );
  return { contexto, modalAtivo: modal !== null };
}
