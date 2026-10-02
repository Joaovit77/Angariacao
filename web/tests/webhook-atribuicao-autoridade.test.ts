import { readFileSync } from "node:fs";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { todayISO } from "@/lib/datas";
import { ehNotaDeMensagemEnviada, ehNotaDeResposta } from "@/lib/calculo/notas";
import { idExternoDaNotaWhatsapp } from "@/lib/calculo/importacaoConversaWhatsapp";

/* Fase 1a-C2.1a — a rota do webhook com autoridade parcial do motor.

   Tudo aqui roda contra um banco FALSO em memória: nenhuma chamada de
   rede, nenhum Supabase real, nenhum WhatsApp. O banco falso aplica os
   filtros que a rota pede (eq/in/is/gte/order/limit), então um filtro de
   `user_id` que some muda o resultado, e não só uma asserção de texto. */

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

const CONTA = "conta-a";
const OUTRA = "conta-b";
const SEGREDO = "segredo-teste";
/** 5543999990001 canonizado pela regra do projeto. */
const TEL = "4399990001";
const OUTRO_TEL = "4388880002";
const HOJE = todayISO();

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
interface Consulta {
  tabela: string;
  op: "select" | "update" | "insert";
  eq: [string, unknown][];
  unica: boolean;
  payload?: unknown;
}

function criarBanco(parcial: Partial<Banco>): Banco {
  return {
    whatsapp_instancias: [{ instancia: "inst-1", user_id: CONTA, token: "tk" }],
    imoveis: [],
    contatos_telefones: [{ contato_id: "c1", user_id: CONTA, telefone_canonico: TEL, desativado_em: null }],
    contatos: [{ id: "c1", user_id: CONTA, fundido_em_contato_id: null }],
    imoveis_contatos: [],
    mensagens_agendadas: [],
    agenda: [],
    ...parcial,
  };
}

function clienteFalso(banco: Banco, opcoes: { falhar?: string[]; falharCarga?: boolean; falharRpc?: boolean } = {}) {
  const consultas: Consulta[] = [];
  const rpcs: { nome: string; args: Record<string, unknown> }[] = [];

  function tabela(nome: string) {
    const eq: [string, unknown][] = [];
    const inn: [string, unknown[]][] = [];
    const is: [string, unknown][] = [];
    const gte: [string, string][] = [];
    let ordem: [string, boolean] | null = null;
    let teto: number | null = null;
    const registro: Consulta = { tabela: nome, op: "select", eq, unica: false };
    consultas.push(registro);

    const linhas = () =>
      ((banco as unknown as Record<string, Linha[]>)[nome] || []).filter(
        (l) =>
          eq.every(([c, v]) => l[c] === v) &&
          inn.every(([c, vs]) => vs.includes(l[c])) &&
          is.every(([c, v]) => (l[c] ?? null) === v) &&
          gte.every(([c, v]) => String(l[c] ?? "") >= v),
      );

    const executar = (): { data: unknown; error: unknown } => {
      if (opcoes.falhar?.includes(nome)) return { data: null, error: { message: "boom" } };
      if (registro.op === "update") {
        for (const l of linhas()) Object.assign(l, registro.payload);
        return { data: null, error: null };
      }
      let r = linhas();
      if (ordem) {
        const [c, asc] = ordem;
        r = [...r].sort((a, b) => String(a[c]).localeCompare(String(b[c])) * (asc ? 1 : -1));
      }
      if (teto !== null) r = r.slice(0, teto);
      return { data: r.map((l) => structuredClone(l)), error: null };
    };

    const chain = {
      select: () => chain,
      eq: (c: string, v: unknown) => (eq.push([c, v]), chain),
      in: (c: string, v: unknown[]) => (inn.push([c, v]), chain),
      is: (c: string, v: unknown) => (is.push([c, v]), chain),
      gte: (c: string, v: string) => (gte.push([c, v]), chain),
      order: (c: string, o: { ascending: boolean }) => ((ordem = [c, o.ascending]), chain),
      limit: (n: number) => ((teto = n), chain),
      update: (payload: unknown) => {
        registro.op = "update";
        registro.payload = payload;
        return chain;
      },
      insert: async (payload: Linha) => {
        registro.op = "insert";
        registro.payload = payload;
        (banco as unknown as Record<string, Linha[]>)[nome].push(payload);
        return { error: null };
      },
      maybeSingle: async () => {
        registro.unica = true;
        if (nome === "imoveis" && opcoes.falharCarga) return { data: null, error: { message: "boom" } };
        const r = executar();
        return { data: (r.data as Linha[] | null)?.[0] ?? null, error: r.error };
      },
      then: (ok: (r: unknown) => unknown, erro?: (e: unknown) => unknown) =>
        Promise.resolve(executar()).then(ok, erro),
    };
    return chain;
  }

  const cliente = {
    from: (nome: string) => tabela(nome),
    rpc: async (nome: string, args: Record<string, unknown>) => {
      rpcs.push({ nome, args });
      if (opcoes.falharRpc && nome === "registrar_nota_whatsapp_conta") {
        return { data: null, error: { message: "boom" } };
      }
      if (nome === "registrar_nota_whatsapp_conta") {
        // Mesma semântica da função SQL: a família do id em TODOS os imóveis
        // da conta; nunca remove; grava no imóvel operacional se não achou.
        const nota = args.p_nota as Linha;
        const mid = idExternoDaNotaWhatsapp({ id: String(nota.id) });
        const daConta = banco.imoveis.filter((i) => i.user_id === args.p_user_id);
        const comMensagem = daConta
          .filter((i) => ((i.notas as Linha[] | null) || []).some((n) => idExternoDaNotaWhatsapp({ id: String(n.id) }) === mid))
          .sort((a, b) => Number(b.id === args.p_imovel_id) - Number(a.id === args.p_imovel_id));
        if (comMensagem.length) {
          return { data: comMensagem[0].id === args.p_imovel_id ? "duplicada-mesmo-imovel" : "duplicada-outro-imovel", error: null };
        }
        const alvo = daConta.find((i) => i.id === args.p_imovel_id);
        if (!alvo) return { data: "imovel-inexistente", error: null };
        alvo.notas = [...((alvo.notas as Linha[] | null) || []), nota];
        return { data: "gravada", error: null };
      }
      if (nome === "registrar_nota_whatsapp" || nome === "registrar_nota_imovel") {
        const alvo = banco.imoveis.find((i) => i.id === args.p_imovel_id && i.user_id === args.p_user_id);
        if (!alvo) return { data: false, error: null };
        const notas = (alvo.notas as Linha[] | null) || [];
        const nota = args.p_nota as Linha;
        if (notas.some((n) => n.id === nota.id)) return { data: false, error: null };
        alvo.notas = [...notas, nota];
        return { data: true, error: null };
      }
      if (nome === "processar_evento_resposta_acompanhamento") return { data: { agendaIds: [] }, error: null };
      return { data: null, error: null };
    },
  };
  return { cliente, consultas, rpcs };
}

function imovel(id: string, extra: Linha = {}): Linha {
  return {
    id,
    user_id: CONTA,
    codigo: null,
    endereco: "Rua Teste, 1",
    status: "Publicado",
    retirado: false,
    tentativas: [],
    status_history: [],
    notas: [],
    proprietario_telefone_canonico: TEL,
    updated_at: "2026-09-01T00:00:00Z",
    ...extra,
  };
}
const vinculo = (imovelId: string, userId = CONTA) => ({
  imovel_id: imovelId,
  contato_id: "c1",
  user_id: userId,
  encerrado_em: null,
});
const tentativaPendente = () => ({ id: `t-${Math.random()}`, data: `${HOJE}T08:00`, canal: "WhatsApp", aguardandoResultado: true });

function evento(texto: string, opcoes: { fromMe?: boolean; id?: string } = {}) {
  return {
    event: "messages.upsert",
    instance: "inst-1",
    data: {
      key: { id: opcoes.id ?? "MSG1", remoteJid: "5543999990001@s.whatsapp.net", fromMe: opcoes.fromMe === true },
      message: { conversation: texto },
      messageType: "conversation",
    },
  };
}

async function enviar(banco: Banco, corpo: unknown, opcoes: { falhar?: string[]; falharCarga?: boolean; falharRpc?: boolean } = {}) {
  const falso = clienteFalso(banco, opcoes);
  mocks.createClient.mockReturnValue(falso.cliente);
  const resposta = await POST(
    new Request("http://localhost/api/whatsapp/webhook", {
      method: "POST",
      headers: { "x-webhook-secret": SEGREDO, "Content-Type": "application/json" },
      body: JSON.stringify(corpo),
    }),
    { params: Promise.resolve({ segredo: [] }) },
  );
  return { resposta, ...falso };
}

/** O evento de atribuição registrado nesta requisição. */
function eventoAtribuicao() {
  const chamadas = mocks.registrarEvento.mock.calls
    .map((c) => c[0] as { evento: string; nivel: string; detalhe: string })
    .filter((e) => e.evento.startsWith("webhook-atribuicao"));
  expect(chamadas).toHaveLength(1);
  return { ...chamadas[0], dados: JSON.parse(chamadas[0].detalhe) as Record<string, unknown> };
}

function notaGravada(banco: Banco, imovelId: string, prefixo: string) {
  const alvo = banco.imoveis.find((i) => i.id === imovelId)!;
  return ((alvo.notas as Linha[]) || []).find((n) => String(n.id).startsWith(prefixo)) as
    | (Linha & { atribuicao?: Record<string, unknown> })
    | undefined;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("EVOLUTION_WEBHOOK_SECRET", SEGREDO);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://projeto.invalid");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-teste");
  vi.stubEnv("OPENAI_API_KEY", "");
  mocks.classificarResposta.mockResolvedValue(null);
});

/* Cenário "divergente": o legado escolhe o Perdido mexido por último; o
   motor, sem olhar `updated_at`, vê um único plausível. */
function cenarioDivergente(extraX: Linha = {}) {
  return criarBanco({
    imoveis: [
      imovel("imovel-l", { codigo: "LD-2", status: "Perdido", updated_at: "2026-09-28T00:00:00Z" }),
      imovel("imovel-x", { codigo: "LD-3", updated_at: "2026-09-01T00:00:00Z", ...extraX }),
    ],
    imoveis_contatos: [vinculo("imovel-l"), vinculo("imovel-x")],
  });
}

/* ================================================================
   A-I. QUEM RECEBE A NOTA
   ================================================================ */
describe("A-I. autoridade na rota", () => {
  it("A. motor resolve o mesmo imóvel do legado → nota no imóvel, autoridade motor", async () => {
    const banco = criarBanco({ imoveis: [imovel("imovel-a")], imoveis_contatos: [vinculo("imovel-a")] });
    const { resposta } = await enviar(banco, evento("bom dia"));
    expect(resposta.status).toBe(200);
    const nota = notaGravada(banco, "imovel-a", "wa:MSG1")!;
    expect(nota.atribuicao).toMatchObject({ autoridade: "motor", estado: "resolvido", nivel: "unico", legadoImovelId: "imovel-a" });
    expect(eventoAtribuicao().dados).toMatchObject({ autoridade: "motor", concordante: true, fallback_motivo: null });
  });

  it("B/I. recebida: motor resolve outro imóvel inequívoco → nota vai para o imóvel do motor", async () => {
    const banco = cenarioDivergente();
    await enviar(banco, evento("bom dia"));
    expect(notaGravada(banco, "imovel-l", "wa:")).toBeUndefined();
    const nota = notaGravada(banco, "imovel-x", "wa:MSG1")!;
    expect(nota.atribuicao).toMatchObject({
      autoridade: "motor",
      estado: "resolvido",
      novoImovelId: "imovel-x",
      legadoImovelId: "imovel-l",
      candidatos: ["imovel-x"],
      terminais: ["imovel-l"],
      fallbackMotivo: null,
    });
    expect(eventoAtribuicao().dados).toMatchObject({
      autoridade: "motor",
      operacional_imovel_id: "imovel-x",
      legado_imovel_id: "imovel-l",
      novo_imovel_id: "imovel-x",
      concordante: false,
    });
  });

  it("B2. imóvel do motor fora do casamento legado é carregado por id E user_id", async () => {
    const banco = criarBanco({
      imoveis: [
        imovel("imovel-l", { status: "Perdido" }),
        // Outro telefone no legado: só o vínculo relacional o liga ao contato.
        imovel("imovel-x", { proprietario_telefone_canonico: OUTRO_TEL }),
      ],
      imoveis_contatos: [vinculo("imovel-l"), vinculo("imovel-x")],
    });
    const { consultas } = await enviar(banco, evento("oi"));
    expect(notaGravada(banco, "imovel-x", "wa:MSG1")?.atribuicao).toMatchObject({ autoridade: "motor" });
    const carga = consultas.filter((c) => c.tabela === "imoveis" && c.unica);
    expect(carga).toHaveLength(1);
    expect(carga[0].eq).toEqual(expect.arrayContaining([["id", "imovel-x"], ["user_id", CONTA]]));
  });

  it("C. pendente → nota continua no legado, com o empate registrado", async () => {
    const banco = criarBanco({
      imoveis: [
        imovel("imovel-a", { updated_at: "2026-09-28T00:00:00Z" }),
        imovel("imovel-b", { updated_at: "2026-09-01T00:00:00Z" }),
      ],
      imoveis_contatos: [vinculo("imovel-a"), vinculo("imovel-b")],
    });
    await enviar(banco, evento("oi"));
    const nota = notaGravada(banco, "imovel-a", "wa:MSG1")!;
    expect(nota.atribuicao).toMatchObject({
      autoridade: "legado",
      estado: "pendente",
      nivelEmpate: "unico",
      candidatos: ["imovel-a", "imovel-b"],
      fallbackMotivo: "pendente",
    });
    expect(notaGravada(banco, "imovel-b", "wa:")).toBeUndefined();
  });

  it("D. sem-candidatos (só terminal) → legado", async () => {
    const banco = criarBanco({
      imoveis: [imovel("imovel-l", { status: "Perdido" })],
      imoveis_contatos: [vinculo("imovel-l")],
    });
    await enviar(banco, evento("oi"));
    expect(notaGravada(banco, "imovel-l", "wa:MSG1")?.atribuicao).toMatchObject({
      autoridade: "legado",
      estado: "sem-candidatos",
      terminais: ["imovel-l"],
      fallbackMotivo: "sem-candidatos",
    });
  });

  it("E. resolução falha → legado, estado falha (nunca sem-candidatos), 200", async () => {
    const banco = cenarioDivergente();
    const { resposta } = await enviar(banco, evento("oi"), { falhar: ["contatos_telefones"] });
    expect(resposta.status).toBe(200);
    expect(notaGravada(banco, "imovel-l", "wa:MSG1")?.atribuicao).toMatchObject({
      autoridade: "legado",
      estado: "falha",
      fallbackMotivo: "falha",
    });
    const e = eventoAtribuicao();
    expect(e).toMatchObject({ evento: "webhook-atribuicao-falhou", nivel: "aviso" });
    expect(e.dados).toMatchObject({ falha: "consulta-canal", fallback_motivo: "falha" });
  });

  it("F. carga do imóvel do motor falha → legado, motivo próprio, aviso, 200", async () => {
    const banco = criarBanco({
      imoveis: [imovel("imovel-l", { status: "Perdido" }), imovel("imovel-x", { proprietario_telefone_canonico: OUTRO_TEL })],
      imoveis_contatos: [vinculo("imovel-l"), vinculo("imovel-x")],
    });
    const { resposta } = await enviar(banco, evento("oi"), { falharCarga: true });
    expect(resposta.status).toBe(200);
    expect(notaGravada(banco, "imovel-x", "wa:")).toBeUndefined();
    expect(notaGravada(banco, "imovel-l", "wa:MSG1")?.atribuicao).toMatchObject({
      autoridade: "legado",
      estado: "resolvido",
      novoImovelId: "imovel-x",
      fallbackMotivo: "carregamento-imovel",
    });
    expect(eventoAtribuicao()).toMatchObject({ evento: "webhook-atribuicao", nivel: "aviso" });
  });

  it("G. referência explícita a terminal não vira autoridade", async () => {
    const banco = criarBanco({
      imoveis: [
        imovel("imovel-l", { codigo: "LD-2", status: "Perdido", updated_at: "2026-09-01T00:00:00Z" }),
        imovel("imovel-x", { codigo: "LD-3", updated_at: "2026-09-28T00:00:00Z" }),
      ],
      imoveis_contatos: [vinculo("imovel-l"), vinculo("imovel-x")],
    });
    await enviar(banco, evento("sobre o LD-2 que eu tinha"));
    expect(notaGravada(banco, "imovel-l", "wa:")).toBeUndefined();
    expect(notaGravada(banco, "imovel-x", "wa:MSG1")?.atribuicao).toMatchObject({
      autoridade: "legado",
      estado: "resolvido",
      nivel: "referencia-explicita",
      terminal: true,
      novoImovelId: "imovel-l",
      fallbackMotivo: "terminal",
    });
  });

  it("H. fromMe segue a mesma política: saída vai para o imóvel do motor, com metadado", async () => {
    const banco = cenarioDivergente();
    const { rpcs } = await enviar(banco, evento("mensagem do corretor", { fromMe: true, id: "OUT1" }));
    const nota = notaGravada(banco, "imovel-x", "wa-enviada:OUT1")!;
    expect(ehNotaDeMensagemEnviada(nota as never)).toBe(true);
    expect(nota.atribuicao).toMatchObject({ autoridade: "motor", legadoImovelId: "imovel-l", novoImovelId: "imovel-x" });
    expect(notaGravada(banco, "imovel-l", "wa-enviada:")).toBeUndefined();
    // Saída continua sem efeito de recebimento.
    expect(mocks.classificarResposta).not.toHaveBeenCalled();
    expect(rpcs.map((r) => r.nome)).toEqual(["registrar_nota_whatsapp_conta"]);
    expect(eventoAtribuicao().dados).toMatchObject({ direcao: "enviada", autoridade: "motor" });
  });

  it("H2. fromMe pendente fica no legado, com o mesmo metadado de uma recebida", async () => {
    const banco = criarBanco({
      imoveis: [imovel("imovel-a", { updated_at: "2026-09-28T00:00:00Z" }), imovel("imovel-b")],
      imoveis_contatos: [vinculo("imovel-a"), vinculo("imovel-b")],
    });
    await enviar(banco, evento("x", { fromMe: true, id: "OUT2" }));
    expect(notaGravada(banco, "imovel-a", "wa-enviada:OUT2")?.atribuicao).toMatchObject({
      autoridade: "legado",
      fallbackMotivo: "pendente",
    });
  });
});

/* ================================================================
   REENTREGA NA MESMA RESOLUÇÃO

   Só o caso que o dedupe por linha cobre: mesma mensagem, mesma decisão,
   mesmo imóvel. A reentrega depois de o contexto mudar (e a decisão trocar
   de imóvel) é dívida da C2.1b e não é congelada aqui.
   ================================================================ */
describe("reentrega", () => {
  it("mesma wa:<id> entregue duas vezes com a mesma decisão fica uma nota só, sem repetir efeito", async () => {
    const banco = cenarioDivergente();
    await enviar(banco, evento("bom dia"));
    mocks.registrarEvento.mockClear();
    mocks.classificarResposta.mockClear();
    const { rpcs } = await enviar(banco, evento("bom dia"));

    const notas = (banco.imoveis.find((i) => i.id === "imovel-x")!.notas as Linha[]).filter((n) => n.id === "wa:MSG1");
    expect(notas).toHaveLength(1);
    expect(eventoAtribuicao().dados).toMatchObject({ autoridade: "motor", operacional_imovel_id: "imovel-x" });
    // A segunda entrega para na nota recusada: nada de IA nem de follow-up de novo.
    expect(mocks.classificarResposta).not.toHaveBeenCalled();
    expect(rpcs.map((r) => r.nome)).toEqual(["registrar_nota_whatsapp_conta"]);
  });

  it("fromMe reentregue com a mesma decisão também fica uma nota só", async () => {
    const banco = cenarioDivergente();
    await enviar(banco, evento("x", { fromMe: true, id: "OUT9" }));
    await enviar(banco, evento("x", { fromMe: true, id: "OUT9" }));
    const notas = (banco.imoveis.find((i) => i.id === "imovel-x")!.notas as Linha[]).filter((n) => n.id === "wa-enviada:OUT9");
    expect(notas).toHaveLength(1);
  });
});

/* ================================================================
   J-K. METADADO E NOTAS ANTIGAS
   ================================================================ */
describe("J-K. metadado", () => {
  it("J. o metadado gravado não carrega telefone, texto nem nome", async () => {
    const banco = cenarioDivergente();
    await enviar(banco, evento("meu telefone é 43 99999-0001, falar com Maria"));
    const meta = notaGravada(banco, "imovel-x", "wa:MSG1")!.atribuicao!;
    expect(meta.versao).toBe(1);
    expect(JSON.stringify(meta)).not.toMatch(/Maria|telefone|99999|4399990001/);
  });

  it("K. nota antiga sem atribuicao continua legível e entra no contexto da IA", async () => {
    const antiga = { id: "wa:ANTIGA", texto: "Resposta pelo WhatsApp: ainda está disponível", data: "2026-09-20T10:00:00" };
    const banco = cenarioDivergente({ notas: [antiga] });
    await enviar(banco, evento("sim"));
    const notas = banco.imoveis.find((i) => i.id === "imovel-x")!.notas as Linha[];
    expect(notas.map((n) => n.id)).toEqual(["wa:ANTIGA", "wa:MSG1"]);
    expect(notas.every((n) => ehNotaDeResposta(n as never))).toBe(true);
    expect("atribuicao" in notas[0]).toBe(false);
    const anteriores = mocks.classificarResposta.mock.calls[0][3] as { texto: string }[];
    expect(anteriores.map((a) => a.texto)).toContain("ainda está disponível");
  });
});

/* ================================================================
   L-O. EFEITOS: CONTINUAM, NO IMÓVEL OPERACIONAL (NADA DE C3)
   ================================================================ */
describe("L-O. efeitos", () => {
  it("L. efeitos seguem o imóvel operacional escolhido pelo motor", async () => {
    const banco = cenarioDivergente({ tentativas: [tentativaPendente()] });
    const { consultas, rpcs } = await enviar(banco, evento("pode ser"));
    const tentativa = consultas.find((c) => c.tabela === "imoveis" && c.op === "update")!;
    expect(tentativa.eq).toEqual(expect.arrayContaining([["id", "imovel-x"], ["user_id", CONTA]]));
    expect(rpcs.find((r) => r.nome === "processar_evento_resposta_acompanhamento")?.args.p_imovel_id).toBe("imovel-x");
    expect(mocks.classificarResposta).toHaveBeenCalledTimes(1);
  });

  it("M. pendente NÃO suprime efeitos: IA, tentativa e follow-ups rodam no legado", async () => {
    // Tentativa pendente nos dois: empate no N2, que não desce.
    const banco = criarBanco({
      imoveis: [
        imovel("imovel-a", { updated_at: "2026-09-28T00:00:00Z", tentativas: [tentativaPendente()] }),
        imovel("imovel-b", { tentativas: [tentativaPendente()] }),
      ],
      imoveis_contatos: [vinculo("imovel-a"), vinculo("imovel-b")],
    });
    const { consultas, rpcs } = await enviar(banco, evento("pode ser"));
    expect(notaGravada(banco, "imovel-a", "wa:MSG1")?.atribuicao).toMatchObject({
      autoridade: "legado",
      estado: "pendente",
      nivelEmpate: "contexto-tentativa",
    });
    expect(mocks.classificarResposta).toHaveBeenCalledTimes(1);
    const tentativa = consultas.find((c) => c.tabela === "imoveis" && c.op === "update")!;
    expect(tentativa.eq).toEqual(expect.arrayContaining([["id", "imovel-a"]]));
    expect(rpcs.find((r) => r.nome === "processar_evento_resposta_acompanhamento")?.args.p_imovel_id).toBe("imovel-a");
  });

  it("M2. sem-candidatos e terminal também mantêm os efeitos atuais no legado", async () => {
    const banco = criarBanco({
      imoveis: [imovel("imovel-l", { status: "Perdido", tentativas: [tentativaPendente()] })],
      imoveis_contatos: [vinculo("imovel-l")],
    });
    const { rpcs } = await enviar(banco, evento("oi"));
    expect(mocks.classificarResposta).toHaveBeenCalledTimes(1);
    expect(rpcs.find((r) => r.nome === "processar_evento_resposta_acompanhamento")?.args.p_imovel_id).toBe("imovel-l");
  });

  it("N-O. nenhum efeitosPendentes, nenhuma fila e nenhum estado novo de pendência", async () => {
    const banco = criarBanco({
      imoveis: [imovel("imovel-a", { updated_at: "2026-09-28T00:00:00Z" }), imovel("imovel-b")],
      imoveis_contatos: [vinculo("imovel-a"), vinculo("imovel-b")],
    });
    await enviar(banco, evento("oi"));
    const nota = notaGravada(banco, "imovel-a", "wa:MSG1")!;
    expect(nota).not.toHaveProperty("efeitosPendentes");
    expect(nota).not.toHaveProperty("classificacaoIa");
    const fontes = [
      "../app/api/whatsapp/webhook/[[...segredo]]/route.ts",
      "../lib/calculo/autoridadeAtribuicao.ts",
      "../lib/servidor/contatos.ts",
      "../lib/servidor/historicoWhatsapp.ts",
    ].map((f) => readFileSync(new URL(f, import.meta.url), "utf8"));
    for (const fonte of fontes) {
      expect(fonte).not.toMatch(/efeitosPendentes|reatribuir_mensagem/);
    }
  });
});

/* ================================================================
   24. NÍVEIS PELA ROTA
   ================================================================ */
describe("24. níveis do motor chegando à rota", () => {
  function dois(extraA: Linha = {}, extraB: Linha = {}) {
    return criarBanco({
      imoveis: [
        imovel("imovel-a", { codigo: "LD-10", updated_at: "2026-09-28T00:00:00Z", ...extraA }),
        imovel("imovel-b", { codigo: "LD-11", ...extraB }),
      ],
      imoveis_contatos: [vinculo("imovel-a"), vinculo("imovel-b")],
    });
  }

  it("N1 único resolve pelo código, mesmo contra o legado", async () => {
    const banco = dois();
    await enviar(banco, evento("sobre o LD-11"));
    expect(notaGravada(banco, "imovel-b", "wa:MSG1")?.atribuicao).toMatchObject({
      autoridade: "motor",
      nivel: "referencia-explicita",
    });
  });

  it("empate no N1 não desce para o N2", async () => {
    // A tentativa pendente em B resolveria no N2; o empate no N1 encerra antes.
    const banco = dois({}, { tentativas: [tentativaPendente()] });
    await enviar(banco, evento("LD-10 ou LD-11?"));
    expect(notaGravada(banco, "imovel-a", "wa:MSG1")?.atribuicao).toMatchObject({
      autoridade: "legado",
      estado: "pendente",
      nivelEmpate: "referencia-explicita",
    });
  });

  it("empate no N3 não desce para o N4", async () => {
    const enviadoEm = new Date(Date.now() - 3_600_000).toISOString();
    const banco = dois();
    banco.mensagens_agendadas = [
      { user_id: CONTA, status: "enviada", imovel_id: "imovel-a", imoveis_consultados: ["imovel-a", "imovel-b"], enviado_em: enviadoEm },
    ];
    await enviar(banco, evento("oi"));
    expect(notaGravada(banco, "imovel-a", "wa:MSG1")?.atribuicao).toMatchObject({
      autoridade: "legado",
      nivelEmpate: "contexto-agendamento",
    });
  });

  it("N3 único resolve", async () => {
    const enviadoEm = new Date(Date.now() - 3_600_000).toISOString();
    const banco = dois();
    banco.mensagens_agendadas = [
      { user_id: CONTA, status: "enviada", imovel_id: "imovel-b", imoveis_consultados: ["imovel-b"], enviado_em: enviadoEm },
    ];
    await enviar(banco, evento("oi"));
    expect(notaGravada(banco, "imovel-b", "wa:MSG1")?.atribuicao).toMatchObject({
      autoridade: "motor",
      nivel: "contexto-agendamento",
    });
  });

  it("updated_at nunca decide quando o motor resolve: inverter a recência não muda o imóvel", async () => {
    for (const [l, x] of [
      ["2026-09-28T00:00:00Z", "2026-09-01T00:00:00Z"],
      ["2026-09-01T00:00:00Z", "2026-09-28T00:00:00Z"],
    ]) {
      mocks.registrarEvento.mockClear();
      const banco = criarBanco({
        imoveis: [
          imovel("imovel-l", { status: "Perdido", updated_at: l }),
          imovel("imovel-x", { updated_at: x }),
        ],
        imoveis_contatos: [vinculo("imovel-l"), vinculo("imovel-x")],
      });
      await enviar(banco, evento("oi"));
      expect(notaGravada(banco, "imovel-x", "wa:MSG1")?.atribuicao).toMatchObject({ autoridade: "motor" });
    }
  });
});

/* ================================================================
   25. TENANT E 27. CUSTO
   ================================================================ */
describe("25. tenant", () => {
  it("imóvel de outra conta nunca vira candidato nem imóvel operacional", async () => {
    const banco = criarBanco({
      imoveis: [
        imovel("imovel-a"),
        imovel("imovel-z", { user_id: OUTRA, updated_at: "2026-09-29T00:00:00Z" }),
      ],
      // Vínculo forjado apontando para a linha de outra conta.
      imoveis_contatos: [vinculo("imovel-a"), vinculo("imovel-z")],
    });
    const { consultas } = await enviar(banco, evento("oi"));
    expect(notaGravada(banco, "imovel-a", "wa:MSG1")?.atribuicao).toMatchObject({
      autoridade: "motor",
      candidatos: ["imovel-a"],
    });
    expect(notaGravada(banco, "imovel-z", "wa:")).toBeUndefined();
    for (const c of consultas.filter((q) => q.tabela !== "whatsapp_instancias" && q.op === "select")) {
      expect(c.eq, `${c.tabela} sem user_id`).toContainEqual(["user_id", CONTA]);
    }
  });
});

describe("27. a resolução roda uma vez e com número fixo de consultas", () => {
  it("uma resolução por mensagem, sem consulta por candidato", async () => {
    const muitos = Array.from({ length: 12 }, (_, i) => imovel(`imovel-${String(i).padStart(2, "0")}`));
    const banco = criarBanco({
      imoveis: muitos,
      imoveis_contatos: muitos.map((m) => vinculo(String(m.id))),
    });
    const { consultas } = await enviar(banco, evento("oi"));
    const por = (t: string) => consultas.filter((c) => c.tabela === t).length;
    expect(por("contatos_telefones")).toBe(1);
    expect(por("contatos")).toBe(1);
    expect(por("imoveis_contatos")).toBe(1);
    expect(por("mensagens_agendadas")).toBe(1);
    // Casamento legado + candidatos do motor (um `in`, não um por imóvel).
    expect(consultas.filter((c) => c.tabela === "imoveis" && c.op === "select").length).toBe(2);
  });

  it("fromMe também resolve uma vez só", async () => {
    const banco = cenarioDivergente();
    const { consultas } = await enviar(banco, evento("x", { fromMe: true, id: "OUT3" }));
    expect(consultas.filter((c) => c.tabela === "contatos_telefones")).toHaveLength(1);
  });
});

/* ================================================================
   C2.1b.1 — UMA MENSAGEM, UMA IDENTIDADE POR CONTA

   O banco falso emula `registrar_nota_whatsapp_conta` com a MESMA família
   de `idExternoDaNotaWhatsapp` (a paridade SQL × TS está em
   `whatsapp-identidade-conta.test.ts`, e o SQL de verdade roda no Postgres
   local em `integration/whatsapp-identidade-supabase-local.test.ts`).
   ================================================================ */
describe("C2.1b.1 — dedupe por conta na rota", () => {
  function efeitosRodaram(rpcs: { nome: string }[], consultas: { tabela: string; op: string }[]) {
    return (
      mocks.classificarResposta.mock.calls.length > 0 ||
      rpcs.some((r) => r.nome === "processar_evento_resposta_acompanhamento") ||
      consultas.some((c) => (c.tabela === "imoveis" && c.op === "update") || (c.tabela === "agenda" && c.op !== "select"))
    );
  }

  it("mensagem já gravada em OUTRO imóvel da conta: não grava de novo e não repete efeito nenhum", async () => {
    // A primeira entrega foi para L (antes de o contexto mudar); agora o
    // motor resolve X. O dedupe por linha deixaria passar.
    const banco = cenarioDivergente({ tentativas: [tentativaPendente()] });
    banco.imoveis[0].notas = [{ id: "wa:MSG1", texto: "Resposta pelo WhatsApp: oi", data: "2026-09-29T10:00:00" }];
    const { resposta, rpcs, consultas } = await enviar(banco, evento("pode ser"));
    expect(resposta.status).toBe(200);
    expect(notaGravada(banco, "imovel-x", "wa:")).toBeUndefined();
    expect(efeitosRodaram(rpcs, consultas)).toBe(false);
    expect(rpcs.map((r) => r.nome)).toEqual(["registrar_nota_whatsapp_conta"]);
    expect(eventoAtribuicao().dados).toMatchObject({ persistencia: "duplicada-outro-imovel", autoridade: "motor" });
  });

  it("mensagem importada (wa-contexto) em outro imóvel conta como a mesma mensagem", async () => {
    const banco = cenarioDivergente();
    banco.imoveis[0].notas = [{ id: "wa-contexto-recebida:MSG1", texto: "Resposta pelo WhatsApp: oi", data: "2026-09-29T09:00:00" }];
    const { rpcs, consultas } = await enviar(banco, evento("oi"));
    expect(notaGravada(banco, "imovel-x", "wa:")).toBeUndefined();
    expect(efeitosRodaram(rpcs, consultas)).toBe(false);
    expect(eventoAtribuicao().dados).toMatchObject({ persistencia: "duplicada-outro-imovel" });
  });

  it("wa:<id>:encerrado não é a mensagem: não impede gravar a wa:<id>", async () => {
    const banco = cenarioDivergente();
    banco.imoveis[1].notas = [{ id: "wa:MSG1:encerrado", texto: "Encerrado", data: "2026-09-29T09:00:00" }];
    await enviar(banco, evento("oi"));
    expect(notaGravada(banco, "imovel-x", "wa:MSG1")?.id).toBe("wa:MSG1:encerrado");
    expect(((banco.imoveis[1].notas as Linha[]) || []).map((n) => n.id)).toEqual(["wa:MSG1:encerrado", "wa:MSG1"]);
    expect(eventoAtribuicao().dados).toMatchObject({ persistencia: "gravada" });
  });

  it("gravação normal: evento único com persistencia gravada", async () => {
    const banco = cenarioDivergente();
    await enviar(banco, evento("oi"));
    const e = eventoAtribuicao();
    expect(e.nivel).toBe("info");
    expect(e.dados).toMatchObject({ persistencia: "gravada", autoridade: "motor" });
  });

  it("falha da RPC: 200, nada gravado, nenhum efeito, sem fallback por linha, evento de erro", async () => {
    const banco = cenarioDivergente();
    const { resposta, rpcs, consultas } = await enviar(banco, evento("oi"), { falharRpc: true });
    expect(resposta.status).toBe(200);
    expect(notaGravada(banco, "imovel-x", "wa:")).toBeUndefined();
    expect(notaGravada(banco, "imovel-l", "wa:")).toBeUndefined();
    expect(efeitosRodaram(rpcs, consultas)).toBe(false);
    expect(rpcs.map((r) => r.nome)).toEqual(["registrar_nota_whatsapp_conta"]);
    const e = eventoAtribuicao();
    expect(e.nivel).toBe("erro");
    expect(e.dados).toMatchObject({ persistencia: "falha" });
  });

  it("fromMe cujo envio a origem já gravou em outro imóvel: não duplica", async () => {
    const banco = cenarioDivergente();
    banco.imoveis[0].notas = [
      { id: "wa-enviada:OUT7", texto: "Mensagem enviada pelo WhatsApp: x", data: "2026-09-29T10:00:00", origem: "api-evolution" },
    ];
    const { rpcs } = await enviar(banco, evento("x", { fromMe: true, id: "OUT7" }));
    expect(notaGravada(banco, "imovel-x", "wa-enviada:")).toBeUndefined();
    expect(rpcs.map((r) => r.nome)).toEqual(["registrar_nota_whatsapp_conta"]);
    expect(eventoAtribuicao().dados).toMatchObject({ direcao: "enviada", persistencia: "duplicada-outro-imovel" });
  });

  it("fromMe com falha da RPC: registra falha, não grava por linha", async () => {
    const banco = cenarioDivergente();
    const { rpcs } = await enviar(banco, evento("x", { fromMe: true, id: "OUT8" }), { falharRpc: true });
    expect(rpcs.map((r) => r.nome)).toEqual(["registrar_nota_whatsapp_conta"]);
    expect(eventoAtribuicao().dados).toMatchObject({ persistencia: "falha" });
    expect(mocks.registrarEvento).toHaveBeenCalledWith(expect.objectContaining({ evento: "historico-envio-falhou" }));
  });
});

/* ================================================================
   Retirados, Fase B / B3: a resposta à retomada vai para o retirado.
   A = retirado que recebeu a retomada; B = ativo do mesmo dono, mexido
   por último (é quem o legado escolheria pelo `updated_at`).
   ================================================================ */
describe("B3: resposta a uma retomada enviada", () => {
  const JA_ALUGUEI = "Imóvel já alugado por conta própria";

  function cenarioRetomada() {
    return criarBanco({
      imoveis: [
        imovel("imovel-a", { codigo: "LD-RA", retirado: true, updated_at: "2026-09-01T00:00:00Z" }),
        imovel("imovel-b", { codigo: "LD-RB", updated_at: "2026-09-30T00:00:00Z" }),
      ],
      imoveis_contatos: [vinculo("imovel-a"), vinculo("imovel-b")],
      mensagens_agendadas: [
        {
          user_id: CONTA,
          imovel_id: "imovel-a",
          imoveis_consultados: null,
          tipo: "retomada-retirado",
          status: "enviada",
          // Duas horas antes, em UTC como o banco grava.
          enviado_em: new Date(Date.now() - 2 * 3_600_000).toISOString(),
        },
      ],
    });
  }

  it("nota em A, B intocado, follow-up de A, autoridade do motor no nível da retomada", async () => {
    const banco = cenarioRetomada();
    const bAntes = structuredClone(banco.imoveis[1]);
    const { resposta, rpcs } = await enviar(banco, evento("Oi! Tenho interesse sim, vamos conversar."));
    expect(resposta.status).toBe(200);

    expect(notaGravada(banco, "imovel-a", "wa:")).toBeDefined();
    expect(notaGravada(banco, "imovel-b", "wa:")).toBeUndefined();
    expect(banco.imoveis[1]).toEqual(bAntes);

    expect(rpcs.find((r) => r.nome === "registrar_nota_whatsapp_conta")?.args.p_imovel_id).toBe("imovel-a");
    expect(rpcs.find((r) => r.nome === "processar_evento_resposta_acompanhamento")?.args.p_imovel_id).toBe("imovel-a");

    expect(eventoAtribuicao().dados).toMatchObject({
      autoridade: "motor",
      nivel: "contexto-retomada",
      terminal: true,
      novo_imovel_id: "imovel-a",
      legado_imovel_id: "imovel-b",
      operacional_imovel_id: "imovel-a",
    });
    expect(notaGravada(banco, "imovel-a", "wa:")?.atribuicao).toMatchObject({
      autoridade: "motor",
      nivel: "contexto-retomada",
      terminal: true,
      fallbackMotivo: null,
    });
    // Nenhum caminho reativa: A continua retirado.
    expect(banco.imoveis[0]).toMatchObject({ retirado: true, status: "Publicado" });
  });

  it("'já aluguei' com motivo de perda: A não é encerrado (B0) nem reativado, e B segue intocado", async () => {
    const banco = cenarioRetomada();
    const bAntes = structuredClone(banco.imoveis[1]);
    mocks.classificarResposta.mockResolvedValue({ resultado: "recusou", resumo: "Já alugou.", motivoPerda: JA_ALUGUEI, retomarEm: null });
    const { consultas } = await enviar(banco, evento("Já aluguei por conta própria, obrigado."));

    expect(notaGravada(banco, "imovel-a", "wa:")).toBeDefined();
    expect(banco.imoveis[0]).toMatchObject({ retirado: true, status: "Publicado" });
    expect(banco.imoveis[1]).toEqual(bAntes);
    expect(consultas.some((c) => c.tabela === "imoveis" && c.op === "update")).toBe(false);
    expect(eventoAtribuicao().dados).toMatchObject({ autoridade: "motor", nivel: "contexto-retomada" });
  });

  it("sem a retomada, o mesmo cenário segue o caminho de antes (B pelo N4)", async () => {
    const banco = cenarioRetomada();
    banco.mensagens_agendadas = [];
    await enviar(banco, evento("Oi! Tenho interesse sim."));
    expect(notaGravada(banco, "imovel-b", "wa:")).toBeDefined();
    expect(notaGravada(banco, "imovel-a", "wa:")).toBeUndefined();
    expect(eventoAtribuicao().dados).toMatchObject({ autoridade: "motor", nivel: "unico", operacional_imovel_id: "imovel-b" });
  });

  it("retomada ainda não enviada (processando) não muda nada", async () => {
    const banco = cenarioRetomada();
    banco.mensagens_agendadas[0].status = "processando";
    await enviar(banco, evento("Oi! Tenho interesse sim."));
    expect(notaGravada(banco, "imovel-b", "wa:")).toBeDefined();
    expect(eventoAtribuicao().dados).toMatchObject({ nivel: "unico" });
  });
});
