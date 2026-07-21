/* ================================================================
   FILA DO FOLLOW-UP EM LOTE — estado + orquestração
   O modal monta o lote e some; quem envia é esta fila. Ela vive num
   store Zustand (e não no estado do modal) por um motivo direto: o
   corretor quer seguir prospectando enquanto as mensagens saem. Se a
   fila morasse no componente, fechar o modal para cadastrar um imóvel
   mataria o lote no meio.

   Exceção consciente à regra "lib/ não importa Supabase/store": este
   módulo é orquestrador de EFEITOS, não cálculo — o parente dele é o
   mutacoes.ts, não o calculo/. Toda a parte pura (elegibilidade,
   texto, intervalos, resumo) está em calculo/followup.ts e é testada
   lá; aqui fica só o "quando" de cada envio.

   Por que sequencial e com espera sorteada entre um envio e outro:
   ver o cabeçalho de calculo/followup.ts. Em resumo — rajada pela
   mesma instância do WhatsApp derruba o número da imobiliária.
   ================================================================ */
import { create } from "zustand";
import {
  falhaEncerraLote,
  type FimDeLote,
  FOLLOWUP_CANAL,
  intervaloFollowUpMs,
  resumoLote,
} from "./calculo/followup";
import { mensagemFalhaEnvio } from "./calculo/whatsapp";
import { enviarWhatsapp } from "./envioWhatsapp";
import { registrarTentativa } from "./mutacoes";
import { toast } from "./toast";

export interface ItemFila {
  imovelId: string;
  /** Rótulo curto para o indicador e para o resumo de falhas. */
  rotulo: string;
  /** Texto já personalizado para este proprietário. */
  texto: string;
}

export interface FalhaFila {
  rotulo: string;
  mensagem: string;
}

interface FilaFollowUp {
  itens: ItemFila[];
  /** Índice do item sendo enviado (0 quando a fila está parada). */
  indice: number;
  enviados: number;
  falhas: FalhaFila[];
  rodando: boolean;
  /** Abordagem creditada nas tentativas deste lote. */
  abordagemId: string | null;

  iniciar: (itens: ItemFila[], abordagemId: string | null) => void;
  cancelar: () => void;
  registrarEnvio: (falha?: FalhaFila) => void;
  encerrar: () => void;
}

const VAZIO = {
  itens: [] as ItemFila[],
  indice: 0,
  enviados: 0,
  falhas: [] as FalhaFila[],
  rodando: false,
  abordagemId: null as string | null,
};

export const useFilaFollowUp = create<FilaFollowUp>((set) => ({
  ...VAZIO,

  iniciar: (itens, abordagemId) => set({ ...VAZIO, itens, abordagemId, rodando: true }),

  cancelar: () => {
    set({ rodando: false });
    acordarEspera();
  },

  registrarEnvio: (falha) =>
    set((s) => ({
      indice: s.indice + 1,
      enviados: falha ? s.enviados : s.enviados + 1,
      falhas: falha ? [...s.falhas, falha] : s.falhas,
    })),

  encerrar: () => set({ rodando: false }),
}));

/* --- Espera cancelável ------------------------------------------------------
   Um `await sleep(45s)` comum faria o botão "Cancelar" levar até 45 segundos
   para surtir efeito — o corretor clicaria de novo achando que travou. O
   resolvedor fica acessível para o cancelamento acordar a espera na hora. */
let acordar: (() => void) | null = null;

function acordarEspera(): void {
  const fn = acordar;
  acordar = null;
  if (fn) fn();
}

function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      acordar = null;
      resolve();
    }, ms);
    acordar = () => {
      clearTimeout(timer);
      resolve();
    };
  });
}

/** Dispara o lote. Não lança: cada falha entra no resumo e a fila segue —
    um número sem WhatsApp no meio da lista não pode abortar os outros nove. */
export async function dispararLote(itens: ItemFila[], abordagemId: string | null): Promise<void> {
  const store = useFilaFollowUp.getState();
  if (store.rodando || itens.length === 0) return;
  store.iniciar(itens, abordagemId);

  let interrompido = false;

  for (let k = 0; k < itens.length; k++) {
    // Cancelado entre um envio e outro: para aqui, sem mandar o resto.
    if (!useFilaFollowUp.getState().rodando) break;

    const item = itens[k];
    const r = await enviarWhatsapp(item.imovelId, item.texto);

    if (r.ok) {
      // A tentativa é o que dá memória ao lote: é dela que saem o corte de
      // "falou há pouco tempo" e o teto do dia na próxima rodada — e é ela
      // que credita a abordagem no ranking. Silenciosa, senão viram dez
      // toasts por cima do que o corretor está fazendo.
      await registrarTentativa(
        item.imovelId,
        { abordagemId, canal: FOLLOWUP_CANAL, resultado: "sem-resposta", observacao: "Follow-up em lote" },
        true,
      );
      useFilaFollowUp.getState().registrarEnvio();
    } else {
      useFilaFollowUp.getState().registrarEnvio({
        rotulo: item.rotulo,
        mensagem: r.mensagem || mensagemFalhaEnvio(r.falha || "falha-evolution"),
      });
      // Instância caída, token recusado, sessão expirada: não é problema
      // deste número, é do ambiente. Os nove seguintes falhariam igual.
      if (falhaEncerraLote(r.falha)) {
        interrompido = true;
        break;
      }
    }

    // Espera só ENTRE envios — depois do último não há o que aguardar.
    const ultimo = k === itens.length - 1;
    if (!ultimo && useFilaFollowUp.getState().rodando) {
      await esperar(intervaloFollowUpMs(Math.random()));
    }
  }

  const fim = useFilaFollowUp.getState();
  const situacao: FimDeLote = interrompido
    ? "interrompido"
    : !fim.rodando && fim.indice < itens.length
      ? "cancelado"
      : "concluido";
  fim.encerrar();
  toast(
    resumoLote(fim.enviados, fim.falhas.length, situacao),
    fim.falhas.length > 0 ? "warning" : "success",
  );
}
