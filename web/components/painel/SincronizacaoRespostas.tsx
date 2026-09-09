"use client";

/* ================================================================
   SINCRONIZAÇÃO AO VIVO DOS IMÓVEIS (Realtime do Supabase)

   Não renderiza nada. Existe para tapar o buraco estrutural que a
   caixa de respostas contornava com um botão: a resposta do
   proprietário entra pelo WEBHOOK, no servidor, e o painel carregava
   o estado UMA VEZ por sessão. Numa aba aberta desde cedo, o badge
   marcava zero e o sino dizia "tudo em dia" enquanto as mensagens se
   empilhavam no banco.

   Fica montado no layout do painel, FORA do <main>, pelo mesmo motivo
   do IndicadorFollowUp: trocar de view não pode derrubar a assinatura
   e reabrir um canal a cada navegação.

   Por que empurrar e não perguntar de tempo em tempo: um polling que
   desse a mesma sensação de "na hora" teria que reler as cinco
   tabelas a cada poucos segundos, o dia inteiro, para quase sempre
   descobrir que nada mudou. O Realtime é o banco avisando — custo
   zero enquanto não chega nada.

   O que ele NÃO faz: escrever. A ordem "Supabase primeiro, store
   depois" das mutações continua valendo para tudo. Aqui só entra
   dado que o banco já confirmou.
   ================================================================ */
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSessao } from "@/components/SessaoProvider";
import { agoraBoot, registrarEtapaBoot } from "@/lib/bootPerformance";
import {
  avisoDeEvento,
  avisoDeResposta,
  eventosQueChegaram,
  respostasQueChegaram,
} from "@/lib/calculo/chegadaResposta";
import {
  deveAplicarVersaoRealtime,
  linhaRealtimeSuficiente,
  reconciliarImovelRealtime,
  type LinhaParcialImovel,
} from "@/lib/calculo/estabilidadeMensagens";
import { notificarSistema } from "@/lib/notificacaoSistema";
import { fromDbImovel, type DbImovelRow } from "@/lib/persistencia/mapeadores";
import { getSupabase } from "@/lib/persistencia/supabase";
import { useAppStore } from "@/lib/store";
import { useUiModal } from "@/lib/uiModal";
import { toastCartao } from "@/lib/toast";

export default function SincronizacaoRespostas() {
  const router = useRouter();
  const { usuario } = useSessao();
  const usuarioId = usuario?.id ?? null;

  useEffect(() => {
    if (!usuarioId) return;
    const usuarioIdAtual = usuarioId;
    const supabase = getSupabase();
    const inicioRealtime = agoraBoot();
    let ativo = true;
    const versoesAplicadas = new Map<string, string>();
    const releiturasEmCurso = new Map<string, Promise<void>>();
    const releiturasPendentes = new Set<string>();
    const releiturasInvalidas = new Set<string>();
    const revisoesEventos = new Map<string, number>();

    function aplicar(linha: LinhaParcialImovel, versao?: string) {
      const { imoveis, carregado, setImoveis } = useAppStore.getState();
      // Antes da carga inicial não há retrato anterior de nada, e mexer no
      // store aqui só criaria uma lista parcial que o setEstado do boot
      // sobrescreveria em seguida.
      if (!carregado) return;

      const ultimaVersao = versoesAplicadas.get(linha.id);
      if (!deveAplicarVersaoRealtime(ultimaVersao, versao)) return;

      const anterior = imoveis.find((i) => i.id === linha.id);
      const novo = anterior
        ? reconciliarImovelRealtime(anterior, linha, usuarioIdAtual)
        : linhaRealtimeSuficiente(linha)
          ? fromDbImovel(linha)
          : null;
      if (!novo) {
        if (versao) versoesAplicadas.set(linha.id, versao);
        relerImovel(linha.id);
        return;
      }

      if (versao) versoesAplicadas.set(linha.id, versao);
      setImoveis(anterior ? imoveis.map((i) => (i.id === novo.id ? novo : i)) : [...imoveis, novo]);

      // A comparação é contra o retrato ANTERIOR, então a nossa própria
      // escrita (registrar tentativa, mudar status) não vira aviso: os ids
      // das notas já eram conhecidos. Ver `respostasQueChegaram`.
      avisar(avisoDeResposta(novo, respostasQueChegaram(anterior, novo)), "resposta", () =>
        router.push("/respostas"),
      );
      // A MESMA linha do banco carrega as duas coisas: o Realtime empurra o
      // imóvel inteiro, e nele podem ter chegado uma resposta de proprietário
      // e um evento do Sistema Principal. São avisos separados porque levam a
      // lugares diferentes — um pede resposta, o outro é o desfecho do negócio.
      avisar(avisoDeEvento(novo, eventosQueChegaram(anterior, novo)), "evento", () =>
        useUiModal.getState().abrirModal("imovel", novo.id),
      );

      // O merge mantém o item e os contadores estáveis. Se o evento veio
      // truncado, a releitura pontual traz a mensagem/coluna que não coube no
      // payload, usando a mesma RLS e o mesmo user_id da assinatura.
      if (anterior && !linhaRealtimeSuficiente(linha)) relerImovel(linha.id);
    }

    function relerImovel(id: string) {
      if (releiturasEmCurso.has(id)) {
        releiturasPendentes.add(id);
        return;
      }
      const revisaoAoIniciar = revisoesEventos.get(id) || 0;
      const releitura = Promise.resolve(
        supabase
          .from("imoveis")
          .select("*")
          .eq("id", id)
          .eq("user_id", usuarioIdAtual)
          .maybeSingle(),
      )
        .then(({ data, error }) => {
          if (
            !ativo ||
            releiturasInvalidas.has(id) ||
            (revisoesEventos.get(id) || 0) !== revisaoAoIniciar ||
            error ||
            !data
          ) return;
          const linha = data as DbImovelRow;
          aplicar(linha);
        })
        .finally(() => {
          releiturasEmCurso.delete(id);
          if (
            ativo &&
            !releiturasInvalidas.has(id) &&
            releiturasPendentes.delete(id)
          ) {
            relerImovel(id);
          }
        });
      releiturasEmCurso.set(id, releitura);
    }

    function avisar(
      aviso: ReturnType<typeof avisoDeResposta>,
      assunto: string,
      ir: () => void,
    ) {
      if (!aviso) return;

      // Aba visível = ele está olhando: o toast basta, e a caixinha do
      // sistema por cima seria interrupção dupla pelo mesmo assunto.
      // Aba oculta = o toast nasceria e morreria sem ninguém ver.
      // Em cartão, não em faixa de texto: quem falou, de qual imóvel e o que
      // disse têm pesos diferentes, e o clique leva ao mesmo lugar que o
      // clique na notificação do sistema (ver lib/toast.ts).
      const mostrarCartao = () =>
        toastCartao({
          titulo: aviso.quem,
          detalhe: aviso.imovel,
          mensagem: aviso.mensagem,
          selo: aviso.quantidade > 1 ? `${aviso.quantidade} mensagens` : undefined,
          aoClicar: ir,
        });
      if (document.visibilityState === "visible") {
        mostrarCartao();
        return;
      }
      const mostrou = notificarSistema({
        titulo: aviso.titulo,
        corpo: aviso.corpo,
        // A tag agrupa por imóvel E por assunto: só pelo imóvel, o aviso da
        // comissão substituiria na bandeja o aviso da resposta que chegou
        // junto, e um dos dois sumiria sem nunca ter sido visto.
        tag: `${aviso.imovelId}:${assunto}`,
        aoClicar: ir,
      });
      // Sem permissão concedida sobra o toast: ele estará lá quando a pessoa
      // voltar para a aba — o badge e o sino, que não expiram, é que contam
      // a história inteira.
      if (!mostrou) mostrarCartao();
    }

    function assinar() {
      return supabase
        .channel(`imoveis:${usuarioId}`)
        .on(
          "postgres_changes",
          // O filtro por user_id é redundante com a RLS de propósito: a RLS é
          // que garante o isolamento, este filtro só evita receber e descartar
          // tráfego que não é nosso.
          { event: "*", schema: "public", table: "imoveis", filter: `user_id=eq.${usuarioId}` },
          (payload) => {
            if (!ativo) return;
            if (payload.eventType === "DELETE") {
              const id = (payload.old as { id?: string } | null)?.id;
              if (!id) return;
              revisoesEventos.set(id, (revisoesEventos.get(id) || 0) + 1);
              versoesAplicadas.delete(id);
              releiturasPendentes.delete(id);
              releiturasInvalidas.add(id);
              const { imoveis, carregado, setImoveis } = useAppStore.getState();
              if (!carregado) return;
              setImoveis(imoveis.filter((i) => i.id !== id));
              return;
            }
            const linha = payload.new as LinhaParcialImovel;
            if (typeof linha.id !== "string") return;
            revisoesEventos.set(linha.id, (revisoesEventos.get(linha.id) || 0) + 1);
            releiturasInvalidas.delete(linha.id);
            aplicar(linha, linha.updated_at || payload.commit_timestamp);
          },
        )
        .subscribe((status) => {
          if (status === "SUBSCRIBED") {
            registrarEtapaBoot("realtime_setup", inicioRealtime, { sucesso: true });
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
            registrarEtapaBoot("realtime_setup", inicioRealtime, { sucesso: false });
          }
        });
    }

    // O `postgres_changes` com RLS só entrega evento com um JWT válido no
    // socket. O supabase-js já faz isso sozinho (onAuthStateChange chama
    // realtime.setAuth), mas depender dessa ordem deixaria a assinatura
    // sujeita a uma corrida que falha do pior jeito possível: em SILÊNCIO —
    // canal inscrito, nenhum evento chegando, nada no console. Chamar sem
    // argumento reusa o token que o cliente já tem; é idempotente.
    let canal: ReturnType<typeof assinar> | null = null;
    const inicioAuthRealtime = agoraBoot();
    supabase.realtime
      .setAuth()
      .catch(() => {
        /* sem token o subscribe abaixo simplesmente não recebe nada */
      })
      .then(() => {
        registrarEtapaBoot("realtime_auth", inicioAuthRealtime);
        if (ativo) canal = assinar();
      });

    return () => {
      ativo = false;
      if (canal) supabase.removeChannel(canal);
    };
  }, [usuarioId, router]);

  return null;
}
