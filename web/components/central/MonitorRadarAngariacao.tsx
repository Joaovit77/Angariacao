"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSessao } from "@/components/SessaoProvider";
import { buscaRadarEstaVencida } from "@/lib/calculo/radarAngariacao";
import { notificarSistema } from "@/lib/notificacaoSistema";
import {
  carregarRadar,
  contarNovosRadar,
  publicarAtualizacaoRadar,
  verificarBuscaRadar,
} from "@/lib/radarAngariacao";
import { useAppStore } from "@/lib/store";
import { toastCartao } from "@/lib/toast";

const INTERVALO_ENTRE_RODADAS_MS = 5 * 60 * 1000;
const DURACAO_TRAVA_MS = 5 * 60 * 1000;

function adquirirTrava(buscaId: string): boolean {
  const chave = `radar-em-verificacao:${buscaId}`;
  const agora = Date.now();
  try {
    const anterior = Number(localStorage.getItem(chave));
    if (Number.isFinite(anterior) && agora - anterior < DURACAO_TRAVA_MS) return false;
    localStorage.setItem(chave, String(agora));
    return true;
  } catch {
    return true;
  }
}

function liberarTrava(buscaId: string) {
  try {
    localStorage.removeItem(`radar-em-verificacao:${buscaId}`);
  } catch {
    /* localStorage indisponível: a trava desta aba já termina com a função */
  }
}

/**
 * Mantém o Radar vivo enquanto o painel está aberto. Uma rodada verifica no
 * máximo uma busca vencida; assim os portais nunca recebem uma rajada.
 */
export default function MonitorRadarAngariacao() {
  const router = useRouter();
  const { usuario } = useSessao();
  const usuarioId = usuario?.id ?? null;

  useEffect(() => {
    if (!usuarioId) return;
    const idUsuario = usuarioId;
    let ativo = true;
    let executando = false;

    async function atualizarContagem() {
      try {
        const quantidade = await contarNovosRadar();
        if (ativo) useAppStore.getState().setRadarNovos(quantidade);
      } catch {
        /* Radar é complementar: uma falha não interrompe o painel. */
      }
    }

    async function rodada() {
      if (!ativo || executando || !navigator.onLine) return;
      executando = true;
      try {
        const estado = await carregarRadar();
        const busca = estado.buscas
          .filter((item) => buscaRadarEstaVencida(item))
          .sort((a, b) => (a.ultimoCheck || "").localeCompare(b.ultimoCheck || ""))[0];
        if (!busca || !adquirirTrava(busca.id)) return;

        try {
          const novos = await verificarBuscaRadar(idUsuario, busca);
          if (!novos.length || !ativo) return;

          const quantidade = novos.length;
          const irAoRadar = () => router.push("/central-angariacao?aba=radar");
          const mostrarCartao = () => toastCartao({
            titulo: "Radar de Angariação",
            detalhe: busca.nome,
            mensagem: `${quantidade} anúncio${quantidade === 1 ? " novo encontrado" : "s novos encontrados"}.`,
            selo: `${quantidade} novo${quantidade === 1 ? "" : "s"}`,
            aoClicar: irAoRadar,
          });

          if (document.visibilityState === "visible") mostrarCartao();
          else if (!notificarSistema({
            titulo: "Novos anúncios no Radar",
            corpo: `${busca.nome}: ${quantidade} oportunidade${quantidade === 1 ? " nova" : "s novas"}.`,
            tag: `radar:${busca.id}`,
            aoClicar: irAoRadar,
          })) mostrarCartao();

          publicarAtualizacaoRadar();
        } finally {
          liberarTrava(busca.id);
        }
      } catch {
        /* A próxima rodada tenta novamente sem criar ruído para o usuário. */
      } finally {
        executando = false;
        await atualizarContagem();
      }
    }

    void atualizarContagem();
    const primeira = window.setTimeout(() => void rodada(), 8_000);
    const intervalo = window.setInterval(() => void rodada(), INTERVALO_ENTRE_RODADAS_MS);
    return () => {
      ativo = false;
      window.clearTimeout(primeira);
      window.clearInterval(intervalo);
    };
  }, [usuarioId, router]);

  return null;
}
