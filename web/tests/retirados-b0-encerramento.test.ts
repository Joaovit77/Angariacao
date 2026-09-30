/* ================================================================
   RETIRADOS, FASE B / B0: PORTÃO ESTREITO DE ENCERRAMENTO AUTOMÁTICO

   Retirado é captação ganha que saiu da carteira. O encerramento automático
   por resposta (`encerramentoPorResposta`, gravado pela rota do webhook) não
   pode transformá-lo em "Perdido", nem mexer no histórico, nem desligar a
   marca. Todo o resto do fluxo da mensagem segue igual: nota, classificação,
   tentativa e o caminho normal de quem não foi encerrado.

   A rota roda contra um banco FALSO em memória que respeita a lista de
   colunas do `select`: se `retirado` sair da consulta do imóvel, a trava
   deixa de enxergar a marca e o teste de rota cai. Nenhuma rede, nenhum
   Supabase real, nenhum WhatsApp, nenhuma IA real (a classificação é mock).
   ================================================================ */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { todayISO } from "@/lib/datas";
import { MOTIVOS_PERDA_IA } from "@/lib/calculo/ia";
import { encerramentoPorResposta, STATUS_ENCERRAMENTO_IA } from "@/lib/calculo/webhookWhatsapp";

const HOJE = todayISO();
const JA_ALUGUEI = "Imóvel já alugado por conta própria";
const HIST_CAPTADO = [
  { status: "Novo contato", date: "2026-05-01" },
  { status: "Angariado", date: "2026-05-20" },
];

/* ----------------------------------------------------------------
   1. A FUNÇÃO PURA
   ---------------------------------------------------------------- */
describe("encerramentoPorResposta — imóvel retirado", () => {
  it("retirado em Angariado com 'já aluguei' não é encerrado", () => {
    const r = encerramentoPorResposta({ status: "Angariado", statusHistory: HIST_CAPTADO, retirado: true }, JA_ALUGUEI, HOJE);
    expect(r).toBeNull();
  });

  it("nenhum motivo da IA encerra um retirado, em nenhum status em que ele possa estar", () => {
    for (const status of ["Angariado", "Autorização assinada", "Publicado", "Novo contato", "Sem resposta", "Documentação"]) {
      for (const motivo of MOTIVOS_PERDA_IA) {
        expect(encerramentoPorResposta({ status, statusHistory: HIST_CAPTADO, retirado: true }, motivo, HOJE)).toBeNull();
      }
    }
  });

  it("o mesmo imóvel sem a marca continua encerrando exatamente como antes", () => {
    for (const retirado of [false, null, undefined]) {
      const r = encerramentoPorResposta({ status: "Angariado", statusHistory: HIST_CAPTADO, retirado }, JA_ALUGUEI, HOJE);
      expect(r?.status).toBe(STATUS_ENCERRAMENTO_IA);
      expect(r?.statusHistory).toEqual([...HIST_CAPTADO, { status: "Perdido", date: HOJE }]);
    }
    // E quem chama sem conhecer o campo (assinatura antiga) também.
    expect(encerramentoPorResposta({ status: "Sem resposta", statusHistory: [] }, JA_ALUGUEI, HOJE)?.status).toBe("Perdido");
  });

  it("as barreiras antigas continuam valendo para quem não é retirado", () => {
    expect(encerramentoPorResposta({ status: "Locado", statusHistory: [], retirado: false }, JA_ALUGUEI, HOJE)).toBeNull();
    expect(encerramentoPorResposta({ status: "Perdido", statusHistory: [], retirado: false }, JA_ALUGUEI, HOJE)).toBeNull();
    expect(encerramentoPorResposta({ status: "Cancelado", statusHistory: [], retirado: false }, JA_ALUGUEI, HOJE)).toBeNull();
    expect(encerramentoPorResposta({ status: "Novo contato", statusHistory: [], retirado: false }, null, HOJE)).toBeNull();
  });
});

/* ----------------------------------------------------------------
   2. A ROTA DO WEBHOOK
   ---------------------------------------------------------------- */
const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  registrarEvento: vi.fn(),
  classificarResposta: vi.fn(),
  transcreverAudio: vi.fn(),
}));

vi.mock("@supabase/supabase-js", () => ({ createClient: mocks.createClient }));
vi.mock("@/lib/servidor/registro", () => ({ registrarEvento: mocks.registrarEvento }));
vi.mock("@/lib/servidor/ia", () => ({ classificarResposta: mocks.classificarResposta }));
vi.mock("@/app/api/whatsapp/_transcricao", () => ({ transcreverAudio: mocks.transcreverAudio }));
vi.mock("@/app/api/google/_comum", () => ({ ambiente: () => null }));
vi.mock("@/app/api/google/_espelho", () => ({ espelharCompromisso: vi.fn() }));

import { POST } from "@/app/api/whatsapp/webhook/[[...segredo]]/route";
import { idExternoDaNotaWhatsapp } from "@/lib/calculo/importacaoConversaWhatsapp";

const CONTA = "conta-a";
const SEGREDO = "segredo-teste";
/** 5543999990001 canonizado pela regra do projeto. */
const TEL = "4399990001";

type Linha = Record<string, unknown>;
interface Banco {
  whatsapp_instancias: Linha[];
  imoveis: Linha[];
  contatos_telefones: Linha[];
  contatos: Linha[];
  imoveis_contatos: Linha[];
  mensagens_agendadas: Linha[];
  agenda: Linha[];
}
interface Escrita {
  tabela: string;
  payload: Linha;
  /** Quantas linhas o UPDATE realmente alterou. */
  afetadas: number;
}

/** `antesDaEscritaDeStatus` roda no instante em que o UPDATE de status chega
    ao banco, depois da leitura da rota: é a retirada concorrente. */
function clienteFalso(banco: Banco, opcoes: { antesDaEscritaDeStatus?: () => void } = {}) {
  const updates: Escrita[] = [];
  const rpcs: { nome: string; args: Record<string, unknown> }[] = [];

  function tabela(nome: string) {
    const eq: [string, unknown][] = [];
    const inn: [string, unknown[]][] = [];
    const is: [string, unknown][] = [];
    const gte: [string, string][] = [];
    const nots: [string, string, unknown][] = [];
    let colunas: string[] | null = null;
    let ordem: [string, boolean] | null = null;
    let teto: number | null = null;
    let payloadUpdate: Linha | null = null;

    const linhas = () =>
      ((banco as unknown as Record<string, Linha[]>)[nome] || []).filter(
        (l) =>
          eq.every(([c, v]) => l[c] === v) &&
          inn.every(([c, vs]) => vs.includes(l[c])) &&
          is.every(([c, v]) => (l[c] ?? null) === v) &&
          gte.every(([c, v]) => String(l[c] ?? "") >= v) &&
          // `not(c, "is", v)` = NOT (c IS v): null não é true.
          nots.every(([c, op, v]) => op !== "is" || (l[c] ?? null) !== v),
      );
    // Projeção: a rota só enxerga as colunas que pediu.
    const projetar = (l: Linha): Linha =>
      colunas ? Object.fromEntries(colunas.map((c) => [c, structuredClone(l[c])])) : structuredClone(l);

    const executar = (): { data: unknown; error: unknown } => {
      if (payloadUpdate) {
        if (nome === "imoveis" && "status" in payloadUpdate) opcoes.antesDaEscritaDeStatus?.();
        // Os filtros valem NA escrita, como no Postgres: só as linhas que
        // ainda casam são alteradas e devolvidas.
        const alvo = linhas();
        updates.push({ tabela: nome, payload: structuredClone(payloadUpdate), afetadas: alvo.length });
        for (const l of alvo) Object.assign(l, payloadUpdate);
        return { data: alvo.map(projetar), error: null };
      }
      let r = linhas();
      if (ordem) {
        const [c, asc] = ordem;
        r = [...r].sort((a, b) => String(a[c]).localeCompare(String(b[c])) * (asc ? 1 : -1));
      }
      if (teto !== null) r = r.slice(0, teto);
      return { data: r.map(projetar), error: null };
    };

    const chain = {
      select: (lista?: string) => {
        if (lista && lista.trim() !== "*") colunas = lista.split(",").map((c) => c.trim()).filter(Boolean);
        return chain;
      },
      eq: (c: string, v: unknown) => (eq.push([c, v]), chain),
      in: (c: string, v: unknown[]) => (inn.push([c, v]), chain),
      is: (c: string, v: unknown) => (is.push([c, v]), chain),
      gte: (c: string, v: string) => (gte.push([c, v]), chain),
      not: (c: string, op: string, v: unknown) => (nots.push([c, op, v]), chain),
      order: (c: string, o: { ascending: boolean }) => ((ordem = [c, o.ascending]), chain),
      limit: (n: number) => ((teto = n), chain),
      update: (payload: Linha) => ((payloadUpdate = payload), chain),
      insert: async (payload: Linha) => {
        (banco as unknown as Record<string, Linha[]>)[nome].push(payload);
        return { error: null };
      },
      maybeSingle: async () => {
        const r = executar();
        return { data: (r.data as Linha[] | null)?.[0] ?? null, error: r.error };
      },
      then: (ok: (r: unknown) => unknown, erro?: (e: unknown) => unknown) => Promise.resolve(executar()).then(ok, erro),
    };
    return chain;
  }

  const cliente = {
    from: (nome: string) => tabela(nome),
    rpc: async (nome: string, args: Record<string, unknown>) => {
      rpcs.push({ nome, args: structuredClone(args) });
      if (nome === "registrar_nota_whatsapp_conta") {
        const nota = args.p_nota as Linha;
        const mid = idExternoDaNotaWhatsapp({ id: String(nota.id) });
        const daConta = banco.imoveis.filter((i) => i.user_id === args.p_user_id);
        if (daConta.some((i) => ((i.notas as Linha[] | null) || []).some((n) => idExternoDaNotaWhatsapp({ id: String(n.id) }) === mid))) {
          return { data: "duplicada-mesmo-imovel", error: null };
        }
        const alvo = daConta.find((i) => i.id === args.p_imovel_id);
        if (!alvo) return { data: "imovel-inexistente", error: null };
        alvo.notas = [...((alvo.notas as Linha[] | null) || []), nota];
        return { data: "gravada", error: null };
      }
      if (nome === "registrar_nota_whatsapp" || nome === "registrar_nota_imovel") {
        const alvo = banco.imoveis.find((i) => i.id === args.p_imovel_id && i.user_id === args.p_user_id);
        if (!alvo) return { data: false, error: null };
        alvo.notas = [...((alvo.notas as Linha[] | null) || []), args.p_nota as Linha];
        return { data: true, error: null };
      }
      if (nome === "processar_evento_resposta_acompanhamento") return { data: { agendaIds: [] }, error: null };
      return { data: null, error: null };
    },
  };
  return { cliente, updates, rpcs };
}

function imovel(extra: Linha = {}): Linha {
  return {
    id: "imovel-r",
    user_id: CONTA,
    codigo: "LD-900",
    endereco: "Rua Teste, 1",
    status: "Angariado",
    retirado: true,
    tentativas: [],
    status_history: structuredClone(HIST_CAPTADO),
    notas: [],
    motivo_perda: null,
    proprietario_telefone_canonico: TEL,
    updated_at: "2026-09-01T00:00:00Z",
    ...extra,
  };
}

function banco(extra: Linha = {}): Banco {
  // Sem canal relacional: a atribuição cai no legado (telefone), que é o
  // caminho real de um retirado hoje (terminal nunca ganha a autoridade).
  return {
    whatsapp_instancias: [{ instancia: "inst-1", user_id: CONTA, token: "tk" }],
    imoveis: [imovel(extra)],
    contatos_telefones: [],
    contatos: [],
    imoveis_contatos: [],
    mensagens_agendadas: [],
    agenda: [],
  };
}

function evento(texto: string, id = "MSG1") {
  return {
    event: "messages.upsert",
    instance: "inst-1",
    data: {
      key: { id, remoteJid: "5543999990001@s.whatsapp.net", fromMe: false },
      message: { conversation: texto },
      messageType: "conversation",
    },
  };
}

async function receber(b: Banco, texto: string, opcoes: { antesDaEscritaDeStatus?: () => void } = {}) {
  const falso = clienteFalso(b, opcoes);
  mocks.createClient.mockReturnValue(falso.cliente);
  const resposta = await POST(
    new Request("http://localhost/api/whatsapp/webhook", {
      method: "POST",
      headers: { "x-webhook-secret": SEGREDO, "Content-Type": "application/json" },
      body: JSON.stringify(evento(texto)),
    }),
    { params: Promise.resolve({ segredo: [] }) },
  );
  return { resposta, ...falso };
}

const linhaDoImovel = (b: Banco) => b.imoveis[0];
const idsDasNotas = (b: Banco) => ((linhaDoImovel(b).notas as Linha[]) || []).map((n) => String(n.id));
const updatesDeStatus = (updates: Escrita[]) =>
  updates.filter(
    (u) => u.tabela === "imoveis" && u.afetadas > 0 && ("status" in u.payload || "status_history" in u.payload || "retirado" in u.payload),
  );

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("EVOLUTION_WEBHOOK_SECRET", SEGREDO);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://projeto.invalid");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-teste");
  vi.stubEnv("OPENAI_API_KEY", "");
  mocks.classificarResposta.mockResolvedValue({ resultado: "recusou", resumo: "Já alugou.", motivoPerda: JA_ALUGUEI, retomarEm: null });
});

describe("webhook — resposta que encerraria, num imóvel retirado", () => {
  it("A. 'já aluguei' num retirado em Angariado: status, histórico e marca ficam intactos", async () => {
    const b = banco();
    const { resposta, updates } = await receber(b, "Já aluguei, obrigado.");

    expect(resposta.status).toBe(200);
    const linha = linhaDoImovel(b);
    expect(linha.status).toBe("Angariado");
    expect(linha.retirado).toBe(true);
    expect(linha.status_history).toEqual(HIST_CAPTADO);
    expect(linha.motivo_perda).toBeNull();
    // Nada gravou status, histórico ou a marca.
    expect(updatesDeStatus(updates)).toEqual([]);
    // E o guard da leitura nem chegou a TENTAR a escrita: a condição da
    // escrita é a segunda camada, para a retirada concorrente, não a única.
    expect(updates.filter((u) => u.tabela === "imoveis" && "status" in u.payload)).toEqual([]);
    // Nem a nota que explicaria um encerramento que não aconteceu.
    expect(idsDasNotas(b).some((id) => id.endsWith(":encerrado"))).toBe(false);
  });

  it("A/F. a mensagem continua processada: nota gravada e classificação chamada uma vez, como hoje", async () => {
    const b = banco();
    await receber(b, "Já aluguei, obrigado.");
    expect(idsDasNotas(b)).toContain("wa:MSG1");
    expect(mocks.classificarResposta).toHaveBeenCalledTimes(1);
  });

  it("F. a tentativa pendente continua recebendo a sugestão da IA (efeito independente do status)", async () => {
    const pendente = { id: "t1", data: `${HOJE}T08:00`, canal: "WhatsApp", resultado: "sem-resposta", aguardandoResultado: true };
    const b = banco({ tentativas: [pendente] });
    const { updates } = await receber(b, "Já aluguei, obrigado.");
    const deTentativa = updates.filter((u) => u.tabela === "imoveis" && "tentativas" in u.payload);
    expect(deTentativa).toHaveLength(1);
    expect(Object.keys(deTentativa[0].payload)).toEqual(["tentativas"]);
    expect(linhaDoImovel(b).status).toBe("Angariado");
  });

  it("D. resposta positiva ('pode anunciar de novo') nunca desliga a marca", async () => {
    mocks.classificarResposta.mockResolvedValue({ resultado: "respondeu", resumo: "Quer anunciar de novo.", motivoPerda: null, retomarEm: null });
    const b = banco();
    const { updates } = await receber(b, "Pode anunciar de novo!");
    expect(linhaDoImovel(b).retirado).toBe(true);
    expect(linhaDoImovel(b).status).toBe("Angariado");
    expect(updates.some((u) => "retirado" in u.payload)).toBe(false);
  });

  it("B. em qualquer status do alvo, um retirado nunca vira Perdido, Cancelado ou Locado", async () => {
    for (const status of ["Autorização assinada", "Publicado", "Sem resposta"]) {
      const b = banco({ status });
      await receber(b, "Já aluguei.");
      expect(linhaDoImovel(b).status).toBe(status);
      expect(["Perdido", "Cancelado", "Locado"]).not.toContain(linhaDoImovel(b).status);
      expect(linhaDoImovel(b).retirado).toBe(true);
    }
  });
});

describe("webhook — o mesmo cenário num imóvel que NÃO é retirado (regressão)", () => {
  it("C/E. continua encerrando como Perdido, com uma entrada nova no histórico e a nota de encerramento", async () => {
    for (const retirado of [false, null]) {
      const b = banco({ retirado });
      const { updates } = await receber(b, "Já aluguei, obrigado.");
      const linha = linhaDoImovel(b);
      expect(linha.status).toBe("Perdido");
      expect(linha.status_history).toEqual([...HIST_CAPTADO, { status: "Perdido", date: HOJE }]);
      expect(updatesDeStatus(updates)).toHaveLength(1);
      expect(idsDasNotas(b).some((id) => id.endsWith(":encerrado"))).toBe(true);
    }
  });
});

describe("webhook — retirada concorrente entre a leitura e a escrita do encerramento", () => {
  it("lido como não retirado, retirado antes do UPDATE: nada de status, histórico, motivo ou nota", async () => {
    const b = banco({ retirado: false });
    const { updates } = await receber(b, "Já aluguei, obrigado.", {
      // O corretor clica em "Retirar da carteira" enquanto o webhook processa.
      antesDaEscritaDeStatus: () => {
        b.imoveis[0].retirado = true;
      },
    });

    const linha = linhaDoImovel(b);
    // A rota chegou a TENTAR o encerramento (a leitura dizia não retirado)...
    const tentativa = updates.filter((u) => u.tabela === "imoveis" && "status" in u.payload);
    expect(tentativa).toHaveLength(1);
    // ...mas a condição da escrita não casou linha nenhuma.
    expect(tentativa[0].afetadas).toBe(0);
    expect(linha.status).toBe("Angariado");
    expect(linha.retirado).toBe(true);
    expect(linha.status_history).toEqual(HIST_CAPTADO);
    expect(linha.motivo_perda).toBeNull();
    expect(idsDasNotas(b).some((id) => id.endsWith(":encerrado"))).toBe(false);
    // A mensagem em si continua registrada, como em qualquer resposta.
    expect(idsDasNotas(b)).toContain("wa:MSG1");
  });

  it("sem retirada no meio, o mesmo cenário encerra normalmente (a condição não bloqueia o fluxo normal)", async () => {
    const b = banco({ retirado: false });
    await receber(b, "Já aluguei, obrigado.", { antesDaEscritaDeStatus: () => undefined });
    expect(linhaDoImovel(b).status).toBe("Perdido");
    expect(idsDasNotas(b).some((id) => id.endsWith(":encerrado"))).toBe(true);
  });
});
