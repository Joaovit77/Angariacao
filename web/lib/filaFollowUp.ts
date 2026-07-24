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
import { type FalhaEnvio, mensagemFalhaEnvio } from "./calculo/whatsapp";
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
  /** Para a UI abrir o cadastro e corrigir o telefone sem procurar o imóvel. */
  imovelId: string;
  rotulo: string;
  mensagem: string;
  /** O motivo classificado, que decide quais ações a UI oferece
      (ver `falhaEhDoNumero`). */
  falha?: FalhaEnvio;
}

interface FilaFollowUp {
  itens: ItemFila[];
  /** Índice do item sendo enviado (0 quando a fila está parada). */
  indice: number;
  enviados: number;
  falhas: FalhaFila[];
  rodando: boolean;
  /**
   * O lote acabou deixando falhas para trás, e elas ainda não foram lidas.
   *
   * Sem isto, o motivo de cada falha era coletado e jogado fora: o indicador
   * mostrava "1 falhou" e sumia junto com a fila, e o único registro de QUEM
   * falhou e POR QUÊ morria no store. Quem visse "9 enviadas, 1 falhou" não
   * tinha como saber que o telefone de um proprietário estava errado — o
   * imóvel voltava para a fila do dia seguinte com o mesmo número.
   */
  resumoAberto: boolean;
  /** Abordagem creditada nas tentativas deste lote. */
  abordagemId: string | null;

  iniciar: (itens: ItemFila[], abordagemId: string | null) => void;
  cancelar: () => void;
  registrarEnvio: (falha?: FalhaFila) => void;
  encerrar: () => void;
  fecharResumo: () => void;
}

const VAZIO = {
  itens: [] as ItemFila[],
  indice: 0,
  enviados: 0,
  falhas: [] as FalhaFila[],
  rodando: false,
  resumoAberto: false,
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

  // A fila para, mas o que falhou fica na tela até alguém ler. É o único
  // momento em que o motivo de cada falha existe — a rodada seguinte zera tudo.
  encerrar: () => set((s) => ({ rodando: false, resumoAberto: s.falhas.length > 0 })),

  fecharResumo: () => set({ resumoAberto: false }),
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

/** O que muda de um lote para o outro. O SEGUIMENTO usa os defaults; o de
    DISPONIBILIDADE passa a observação, o nome do modelo e o efeito de dar baixa
    no lembrete da agenda. Tudo o mais (freios, intervalo, relatório) é igual. */
export interface OpcoesLote {
  /** Observação gravada na tentativa de cada envio. */
  observacao?: string;
  /** Nome guardado na tentativa quando não há abordagem — para o histórico e o
      nudge mostrarem o que saiu (não entra no ranking). */
  modeloNome?: string | null;
  /** Efeito após CADA envio confirmado, depois de registrar a tentativa (ex.:
      dar baixa no lembrete de disponibilidade e reagendar o próximo). O retorno
      é ignorado (a mutação devolve boolean, a fila não o usa). Não deve lançar —
      se lançar, a falha é engolida para não derrubar a fila. */
  aposEnvioOk?: (imovelId: string) => Promise<unknown>;
}

/** Dispara o lote. Não lança: cada falha entra no resumo e a fila segue —
    um número sem WhatsApp no meio da lista não pode abortar os outros nove. */
export async function dispararLote(
  itens: ItemFila[],
  abordagemId: string | null,
  opcoes: OpcoesLote = {},
): Promise<void> {
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
        {
          abordagemId,
          modeloNome: opcoes.modeloNome ?? null,
          canal: FOLLOWUP_CANAL,
          resultado: "sem-resposta",
          observacao: opcoes.observacao ?? "Follow-up em lote",
          // Palpite, como em qualquer envio: o nudge cobra a confirmação
          // depois. Sem isso, um lote de 10 empurraria dez "sem-resposta"
          // definitivos para o ranking sem ninguém ter observado nada.
          aguardandoResultado: true,
        },
        true,
      );
      // Efeito próprio do lote (ex.: dar baixa no lembrete de disponibilidade).
      // Só depois da tentativa, e nunca derruba a fila — é auxiliar ao envio.
      if (opcoes.aposEnvioOk) {
        try {
          await opcoes.aposEnvioOk(item.imovelId);
        } catch {
          /* efeito secundário: o envio valeu, a baixa do lembrete pode esperar */
        }
      }
      useFilaFollowUp.getState().registrarEnvio();
    } else {
      useFilaFollowUp.getState().registrarEnvio({
        imovelId: item.imovelId,
        rotulo: item.rotulo,
        mensagem: r.mensagem || mensagemFalhaEnvio(r.falha || "falha-evolution"),
        falha: r.falha,
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
  // Com falhas, quem informa é o relatório do indicador — ele fica na tela e
  // diz QUEM falhou, não só quantos. O toast continua para o lote limpo (onde
  // não há relatório) e para o encerramento anormal, cuja explicação
  // ("o problema afetaria todos os envios seguintes") o relatório não carrega.
  if (fim.falhas.length === 0 || situacao !== "concluido") {
    toast(
      resumoLote(fim.enviados, fim.falhas.length, situacao),
      fim.falhas.length > 0 ? "warning" : "success",
    );
  }
}
