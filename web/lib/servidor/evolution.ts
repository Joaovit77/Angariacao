/* ================================================================
   CLIENTE ÚNICO DA EVOLUTION API 2.3.7

   A versão foi confirmada contra o servidor real. Toda operação de
   ciclo de vida da instância fixa passa por aqui: consultar, conectar,
   criar e absorver uma corrida de criação. As rotas continuam sendo as
   fronteiras de autenticação; este módulo só fala com a Evolution.

   A global api key aparece apenas na listagem/criação. Envio, histórico
   e QR usam o token da própria instância, preservando o menor privilégio.
   ================================================================ */
import {
  INSTANCIA_CORRETORA,
} from "@/lib/calculo/instanciaCorretora";
import {
  qrParaImagem,
  traduzirEstado,
  type Conexao,
  type EstadoConexao,
} from "@/lib/calculo/conexaoWhatsapp";

export const TIMEOUT_EVOLUTION_MS = 10000;

type Objeto = Record<string, unknown>;

function objeto(valor: unknown): Objeto | null {
  return valor && typeof valor === "object" ? (valor as Objeto) : null;
}

function texto(valor: unknown): string | null {
  return typeof valor === "string" && valor.trim() ? valor.trim() : null;
}

function baseSemBarra(serverUrl: string): string {
  return serverUrl.replace(/\/+$/, "");
}

function qrDoCorpo(corpo: unknown): string | null {
  const raiz = objeto(corpo);
  const qrcode = objeto(raiz?.qrcode);
  return qrParaImagem(
    texto(raiz?.base64) ?? texto(qrcode?.base64) ?? texto(raiz?.code) ?? texto(qrcode?.code),
  );
}

function nomeDaInstancia(corpo: unknown): string | null {
  const raiz = objeto(corpo);
  const instance = objeto(raiz?.instance);
  return texto(raiz?.name) ?? texto(raiz?.instanceName) ?? texto(instance?.instanceName);
}

function tokenDaInstancia(corpo: unknown): string | null {
  const raiz = objeto(corpo);
  const instance = objeto(raiz?.instance);
  const hash = objeto(raiz?.hash);
  return (
    texto(raiz?.token) ??
    texto(raiz?.hash) ??
    texto(hash?.apikey) ??
    texto(instance?.token) ??
    texto(instance?.apikey)
  );
}

function estadoDaInstancia(corpo: unknown): string | null {
  const raiz = objeto(corpo);
  const instance = objeto(raiz?.instance);
  return texto(raiz?.connectionStatus) ?? texto(raiz?.state) ?? texto(instance?.state);
}

type ConsultaGlobal =
  | { tipo: "encontrada"; token: string | null; estado: string | null }
  | { tipo: "ausente" }
  | { tipo: "falha" };

/**
 * `ausente` só nasce de HTTP 200 com lista vazia. Timeout, 5xx, 401 e
 * formato desconhecido são `falha`: indisponibilidade nunca autoriza criar.
 */
export async function consultarInstanciaGlobal(
  serverUrl: string,
  apiKey: string,
  instancia = INSTANCIA_CORRETORA,
): Promise<ConsultaGlobal> {
  try {
    /* Na instalação 2.3.7 real, o filtro por um nome inexistente responde
       404. A listagem global sem filtro responde 200 e é a única forma de
       distinguir ausência confirmada de erro de comunicação/autorização. */
    const resposta = await fetch(
      `${baseSemBarra(serverUrl)}/instance/fetchInstances`,
      {
        headers: { apikey: apiKey },
        signal: AbortSignal.timeout(TIMEOUT_EVOLUTION_MS),
        cache: "no-store",
      },
    );
    if (!resposta.ok) {
      console.error("Evolution: fetchInstances global respondeu", resposta.status);
      return { tipo: "falha" };
    }
    const corpo = (await resposta.json().catch(() => null)) as unknown;
    if (!Array.isArray(corpo)) return { tipo: "falha" };
    if (corpo.length === 0) return { tipo: "ausente" };

    const encontrada = corpo.find((item) => nomeDaInstancia(item) === instancia) ??
      (corpo.length === 1 && nomeDaInstancia(corpo[0]) === null ? corpo[0] : null);
    if (!encontrada) return { tipo: "falha" };
    return {
      tipo: "encontrada",
      token: tokenDaInstancia(encontrada),
      estado: estadoDaInstancia(encontrada),
    };
  } catch (erro) {
    console.error("Evolution: não foi possível consultar a instância fixa:", erro);
    return { tipo: "falha" };
  }
}

export type FalhaGarantiaEvolution = "nao-configurado" | "indisponivel" | "sem-token";

export type GarantiaInstanciaCorretora =
  | {
      ok: true;
      instancia: typeof INSTANCIA_CORRETORA;
      token: string;
      criada: boolean;
      estadoBruto: string | null;
      qr: string | null;
    }
  | { ok: false; falha: FalhaGarantiaEvolution };

const garantiasEmAndamento = new Map<string, Promise<GarantiaInstanciaCorretora>>();

async function criarOuReconsultarCorretora(
  serverUrl: string,
  apiKey: string,
): Promise<GarantiaInstanciaCorretora> {
  let resposta: Response;
  try {
    resposta = await fetch(`${baseSemBarra(serverUrl)}/instance/create`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: apiKey },
      // Na 2.3.7, qrcode inicia o pareamento por QR. O número não entra
      // no payload: ele será o número do aparelho que ler o código.
      body: JSON.stringify({
        instanceName: INSTANCIA_CORRETORA,
        integration: "WHATSAPP-BAILEYS",
        qrcode: true,
      }),
      signal: AbortSignal.timeout(TIMEOUT_EVOLUTION_MS),
      cache: "no-store",
    });
  } catch (erro) {
    console.error("Evolution: falha de comunicação ao criar a instância fixa:", erro);
    return { ok: false, falha: "indisponivel" };
  }

  if (resposta.ok) {
    const corpo = (await resposta.json().catch(() => null)) as unknown;
    const token = tokenDaInstancia(corpo);
    if (!token) return { ok: false, falha: "sem-token" };
    return {
      ok: true,
      instancia: INSTANCIA_CORRETORA,
      token,
      criada: true,
      estadoBruto: estadoDaInstancia(corpo),
      qr: qrDoCorpo(corpo),
    };
  }

  /* Outra execução pode ter criado `corretora` entre a consulta e o
     POST. Nunca inventamos um sufixo: reconsultamos o MESMO nome. Se o
     erro era autenticação/servidor, a reconsulta também falha e nada é
     assumido como ausente. */
  const depoisDaCorrida = await consultarInstanciaGlobal(serverUrl, apiKey);
  if (depoisDaCorrida.tipo !== "encontrada") {
    console.error("Evolution: criação da instância fixa respondeu", resposta.status);
    return { ok: false, falha: "indisponivel" };
  }
  if (!depoisDaCorrida.token) return { ok: false, falha: "sem-token" };
  return {
    ok: true,
    instancia: INSTANCIA_CORRETORA,
    token: depoisDaCorrida.token,
    criada: false,
    estadoBruto: depoisDaCorrida.estado,
    qr: null,
  };
}

async function garantirSemLock(
  serverUrl: string,
  apiKey: string,
  tokenAtual: string | null,
): Promise<GarantiaInstanciaCorretora> {
  const consulta = await consultarInstanciaGlobal(serverUrl, apiKey);
  if (consulta.tipo === "falha") return { ok: false, falha: "indisponivel" };
  if (consulta.tipo === "encontrada") {
    const token = consulta.token ?? tokenAtual;
    if (!token) return { ok: false, falha: "sem-token" };
    let qr: string | null = null;
    // `close` não autoriza recriar. Pedir a conexão da MESMA instância
    // inicia o QR; `connecting` apenas espera e `open` reutiliza.
    if (traduzirEstado(consulta.estado) !== "conectado") {
      const conexao = await consultarConexao(serverUrl, INSTANCIA_CORRETORA, token, true);
      qr = conexao.qr ?? null;
    }
    return {
      ok: true,
      instancia: INSTANCIA_CORRETORA,
      token,
      criada: false,
      estadoBruto: consulta.estado,
      qr,
    };
  }
  return criarOuReconsultarCorretora(serverUrl, apiKey);
}

/**
 * Garante a existência remota de `corretora`. O lock evita duplicidade no
 * mesmo processo; entre processos, a unicidade do nome na Evolution faz um
 * POST vencer e os demais absorverem o conflito pela reconsulta.
 */
export function garantirInstanciaCorretora(
  serverUrl: string,
  apiKey: string | null | undefined,
  tokenAtual: string | null = null,
): Promise<GarantiaInstanciaCorretora> {
  if (!serverUrl.trim() || !apiKey?.trim()) {
    return Promise.resolve({ ok: false, falha: "nao-configurado" });
  }
  const chave = `${baseSemBarra(serverUrl)}|${INSTANCIA_CORRETORA}`;
  const existente = garantiasEmAndamento.get(chave);
  if (existente) return existente;

  const promessa = garantirSemLock(serverUrl, apiKey.trim(), tokenAtual).finally(() => {
    if (garantiasEmAndamento.get(chave) === promessa) garantiasEmAndamento.delete(chave);
  });
  garantiasEmAndamento.set(chave, promessa);
  return promessa;
}

/** Qual número está pareado. O endpoint inclui o token; só o ownerJid sai. */
async function identidadeConectada(
  base: string,
  cabecalho: Record<string, string>,
  instancia: string,
): Promise<string | null> {
  try {
    const r = await fetch(
      `${base}/instance/fetchInstances?instanceName=${encodeURIComponent(instancia)}`,
      { headers: cabecalho, signal: AbortSignal.timeout(TIMEOUT_EVOLUTION_MS), cache: "no-store" },
    );
    if (!r.ok) return null;
    const corpo = (await r.json().catch(() => null)) as unknown;
    const lista = Array.isArray(corpo) ? corpo : [corpo];
    const primeiro = objeto(lista[0]);
    const instance = objeto(primeiro?.instance);
    const jid = texto(instance?.ownerJid) ?? texto(primeiro?.ownerJid);
    return jid ? jid.split("@")[0] : null;
  } catch {
    return null;
  }
}

/** Estado e QR da mesma instância. Nunca cria nem troca o nome. */
export async function consultarConexao(
  serverUrl: string,
  instancia: string,
  token: string,
  pedirQr: boolean,
): Promise<Conexao> {
  const base = baseSemBarra(serverUrl);
  const cabecalho = { apikey: token };
  const alvo = encodeURIComponent(instancia);

  let estado: EstadoConexao;
  try {
    const r = await fetch(`${base}/instance/connectionState/${alvo}`, {
      headers: cabecalho,
      signal: AbortSignal.timeout(TIMEOUT_EVOLUTION_MS),
      cache: "no-store",
    });
    if (!r.ok) {
      console.error("Conexão do WhatsApp: connectionState respondeu", r.status);
      return { estado: r.status === 404 ? "instancia-ausente" : "falha" };
    }
    const corpo = (await r.json().catch(() => null)) as unknown;
    estado = traduzirEstado(estadoDaInstancia(corpo));
  } catch (erro) {
    console.error("Conexão do WhatsApp: a Evolution não respondeu:", erro);
    return { estado: "falha" };
  }

  if (estado === "conectado") {
    return { estado, numero: await identidadeConectada(base, cabecalho, instancia) };
  }
  if (estado !== "desconectado" || !pedirQr) return { estado };

  try {
    const r = await fetch(`${base}/instance/connect/${alvo}`, {
      headers: cabecalho,
      signal: AbortSignal.timeout(TIMEOUT_EVOLUTION_MS),
      cache: "no-store",
    });
    if (!r.ok) return { estado: "desconectado", qr: null };
    const corpo = (await r.json().catch(() => null)) as unknown;
    return { estado: "desconectado", qr: qrDoCorpo(corpo) };
  } catch (erro) {
    console.error("Conexão do WhatsApp: falha ao pedir o QR:", erro);
    return { estado: "desconectado", qr: null };
  }
}
