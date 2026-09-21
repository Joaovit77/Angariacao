"use client";

import { useEffect, useState } from "react";

import type { ResolucaoCidadePadrao } from "@/lib/configuracaoUsuario";
import { carregarCidadePadraoDaConta } from "@/lib/persistencia/cidadePadrao";

const SEM_CIDADE_PADRAO: ResolucaoCidadePadrao = {
  origem: "nenhuma",
  cidade: null,
  uf: null,
};

interface CidadePadraoCarregada {
  userId: string;
  resolucao: ResolucaoCidadePadrao;
}

export function useCidadePadraoDaConta(userId: string | null | undefined): ResolucaoCidadePadrao {
  const [carregada, setCarregada] = useState<CidadePadraoCarregada | null>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelado = false;

    void carregarCidadePadraoDaConta(userId)
      .then((resolucao) => {
        if (!cancelado) setCarregada({ userId, resolucao });
      })
      .catch(() => {
        if (!cancelado) setCarregada({ userId, resolucao: SEM_CIDADE_PADRAO });
      });

    return () => {
      cancelado = true;
    };
  }, [userId]);

  return carregada && carregada.userId === userId
    ? carregada.resolucao
    : SEM_CIDADE_PADRAO;
}
