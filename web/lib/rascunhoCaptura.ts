/* ================================================================
   RASCUNHO DE CAPTURA — sobreviver à ida à câmera

   No Android, abrir a câmera a partir de <input capture> manda a aba
   para segundo plano; sob pressão de memória o navegador DESCARTA a aba
   e, quando o corretor volta, recarrega a página do zero. Todo estado
   React some: modal, texto digitado, foto processada. O smoke real mediu
   uma perda em três voltas da câmera — e toda captura passa pela câmera.

   A V7 promete "interrupção recuperável, nunca invisível". Isto é a parte
   que faltava: o rascunho vive no DISPOSITIVO (IndexedDB, porque Blob não
   cabe em sessionStorage), é gravado antes de a aba correr risco, e é
   oferecido de volta quando a tela remonta.

   Divisão de papéis, no molde do resto do módulo:
   - a lógica (validade, escopo, prazo) é pura e testável;
   - o IndexedDB é um adaptador fino, injetável, que FALHA EM SILÊNCIO —
     sem IndexedDB (jsdom, modo privado, quota) a captura continua
     funcionando como antes, só sem a rede de segurança.

   Nada aqui toca banco, Storage ou rede. O rascunho é dado do próprio
   usuário no próprio aparelho: é apagado ao concluir, ao descartar e ao
   expirar.
   ================================================================ */
import type { ResultadoProcessamentoFoto } from "@/lib/calculo/fotoFachada";
import type { ReservaFotoAvistamento } from "@/lib/prospeccao";

/** Um rascunho esquecido não pode virar foto fantasma meses depois. */
export const TTL_RASCUNHO_CAPTURA_MS = 24 * 60 * 60 * 1000;

export interface CamposRascunhoCaptura {
  data: string;
  hora: string;
  observacao: string;
  logradouro: string;
  numero: string;
  unidade: string;
  bloco: string;
  edificio: string;
  bairro: string;
  cidade: string;
  estado: string;
  cep: string;
  pontoReferencia: string;
  tipo: string;
}

export interface RascunhoCaptura {
  usuarioId: string;
  /** null = primeiro avistamento (identidade ainda não existe). */
  imovelIdentificadoId: string | null;
  salvoEm: string;
  campos: CamposRascunhoCaptura;
  /** A foto já processada (original + miniatura). É o que custa refazer. */
  foto: ResultadoProcessamentoFoto<Blob> | null;
  /** Preenchido depois que "Registrar" gravou identidade e avistamento:
      ao restaurar, NÃO se cria de novo — vai direto para o envio. */
  destino: { imovelIdentificadoId: string; avistamentoId: string } | null;
  /** Preenchido depois da reserva: o retry reutiliza os mesmos caminhos. */
  reserva: ReservaFotoAvistamento | null;
  /** Instante em que a câmera do APARELHO foi aberta (input nativo). Se a
      página recarregar e a foto não chegar, isso é a única prova de que
      houve uma captura interrompida: a interrupção nunca pode ser
      invisível. Rascunhos antigos não têm o campo (lê-se como null). */
  cameraNativaEm?: string | null;
}

export interface ArmazemRascunhoCaptura {
  ler(usuarioId: string): Promise<RascunhoCaptura | null>;
  salvar(rascunho: RascunhoCaptura): Promise<void>;
  limpar(usuarioId: string): Promise<void>;
}

export function camposVazios(): CamposRascunhoCaptura {
  return {
    data: "",
    hora: "",
    observacao: "",
    logradouro: "",
    numero: "",
    unidade: "",
    bloco: "",
    edificio: "",
    bairro: "",
    cidade: "",
    estado: "",
    cep: "",
    pontoReferencia: "",
    tipo: "",
  };
}

export function rascunhoExpirado(
  rascunho: Pick<RascunhoCaptura, "salvoEm">,
  agora: number = Date.now(),
  ttlMs: number = TTL_RASCUNHO_CAPTURA_MS,
): boolean {
  const salvo = Date.parse(rascunho.salvoEm);
  if (!Number.isFinite(salvo)) return true;
  return agora - salvo > ttlMs;
}

/**
 * O rascunho só serve ao contexto em que nasceu: um rascunho de "primeiro
 * avistamento" não deve aparecer ao adicionar avistamento a outro imóvel,
 * e vice-versa. Fora do contexto, ele simplesmente não é oferecido — e
 * continua guardado para quando o contexto certo abrir.
 */
export function rascunhoPertenceAoContexto(
  rascunho: Pick<RascunhoCaptura, "usuarioId" | "imovelIdentificadoId">,
  usuarioId: string,
  imovelIdentificadoId: string | null,
): boolean {
  return rascunho.usuarioId === usuarioId
    && (rascunho.imovelIdentificadoId ?? null) === (imovelIdentificadoId ?? null);
}

/** Há algo que valha a pena restaurar? Data/hora sozinhas não contam:
    elas são preenchidas automaticamente ao abrir. */
export function rascunhoTemConteudo(
  rascunho: Pick<RascunhoCaptura, "campos" | "foto" | "destino" | "cameraNativaEm">,
): boolean {
  if (rascunho.foto || rascunho.destino || rascunho.cameraNativaEm) return true;
  const { data: _data, hora: _hora, ...restante } = rascunho.campos;
  return Object.values(restante).some((valor) => valor.trim() !== "");
}

/** A câmera do aparelho foi aberta e a foto nunca chegou: a página morreu
    no meio. É o caso que precisa de aviso próprio, não de "restaurar". */
export function fotoPerdidaNaCameraNativa(
  rascunho: Pick<RascunhoCaptura, "foto" | "cameraNativaEm"> | null,
): string | null {
  if (!rascunho || rascunho.foto || !rascunho.cameraNativaEm) return null;
  return rascunho.cameraNativaEm;
}

/**
 * Decide o que a tela deve fazer com o que encontrou no aparelho. É a
 * única função que a UI precisa chamar para saber se mostra o aviso.
 */
export function avaliarRascunho(
  rascunho: RascunhoCaptura | null,
  usuarioId: string,
  imovelIdentificadoId: string | null,
  agora: number = Date.now(),
): "nenhum" | "expirado" | "outro-contexto" | "restauravel" {
  if (!rascunho) return "nenhum";
  if (rascunhoExpirado(rascunho, agora)) return "expirado";
  if (!rascunhoPertenceAoContexto(rascunho, usuarioId, imovelIdentificadoId)) return "outro-contexto";
  if (!rascunhoTemConteudo(rascunho)) return "nenhum";
  return "restauravel";
}

/* ----------------------------------------------------------------
   Adaptador em memória — para testes e como fallback explícito.
   ---------------------------------------------------------------- */
export function criarArmazemMemoria(): ArmazemRascunhoCaptura {
  const registros = new Map<string, RascunhoCaptura>();
  return {
    async ler(usuarioId) {
      return registros.get(usuarioId) ?? null;
    },
    async salvar(rascunho) {
      registros.set(rascunho.usuarioId, rascunho);
    },
    async limpar(usuarioId) {
      registros.delete(usuarioId);
    },
  };
}

/* ----------------------------------------------------------------
   Adaptador IndexedDB — um banco, um store, uma chave por usuário.

   Toda operação é engolida em caso de falha: quota, modo privado,
   navegador sem suporte ou a API lançando no acesso (acontece em preview
   de thumbnail). O pior resultado possível é "sem rede de segurança",
   nunca "captura quebrada".
   ---------------------------------------------------------------- */
const NOME_BANCO = "angario-garimpo";
const NOME_STORE = "rascunho-captura";
const VERSAO_BANCO = 1;

function abrirBanco(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const pedido = indexedDB.open(NOME_BANCO, VERSAO_BANCO);
    pedido.onupgradeneeded = () => {
      const banco = pedido.result;
      if (!banco.objectStoreNames.contains(NOME_STORE)) {
        banco.createObjectStore(NOME_STORE, { keyPath: "usuarioId" });
      }
    };
    pedido.onsuccess = () => resolve(pedido.result);
    pedido.onerror = () => reject(pedido.error);
    pedido.onblocked = () => reject(new Error("IndexedDB bloqueado"));
  });
}

function aguardar<T>(pedido: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    pedido.onsuccess = () => resolve(pedido.result);
    pedido.onerror = () => reject(pedido.error);
  });
}

function indexedDbDisponivel(): boolean {
  try {
    return typeof indexedDB !== "undefined" && indexedDB !== null;
  } catch {
    return false;
  }
}

export function criarArmazemIndexedDb(): ArmazemRascunhoCaptura {
  async function comStore<T>(
    modo: IDBTransactionMode,
    operacao: (store: IDBObjectStore) => Promise<T>,
  ): Promise<T | null> {
    if (!indexedDbDisponivel()) return null;
    let banco: IDBDatabase | null = null;
    try {
      banco = await abrirBanco();
      const transacao = banco.transaction(NOME_STORE, modo);
      const resultado = await operacao(transacao.objectStore(NOME_STORE));
      return resultado;
    } catch {
      return null;
    } finally {
      banco?.close();
    }
  }

  return {
    async ler(usuarioId) {
      const registro = await comStore("readonly", (store) => aguardar(store.get(usuarioId)));
      if (!registro || typeof registro !== "object") return null;
      return registro as RascunhoCaptura;
    },
    async salvar(rascunho) {
      await comStore("readwrite", (store) => aguardar(store.put(rascunho)));
    },
    async limpar(usuarioId) {
      await comStore("readwrite", (store) => aguardar(store.delete(usuarioId)));
    },
  };
}

let armazemPadrao: ArmazemRascunhoCaptura | null = null;

/** Singleton do browser. Testes injetam o de memória pelos componentes. */
export function armazemRascunhoCaptura(): ArmazemRascunhoCaptura {
  if (!armazemPadrao) armazemPadrao = criarArmazemIndexedDb();
  return armazemPadrao;
}
