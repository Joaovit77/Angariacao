/* ================================================================
   FASE 1a-C3-B: PORTÃO DE EFEITOS ATIVO NO EMPATE DE MÚLTIPLOS IMÓVEIS

   Quando um proprietário tem 2+ imóveis plausíveis e envia uma mensagem sem
   contexto inequívoco (ex.: "Já aluguei por conta própria" sem dizer qual
   código):
   - A mensagem é gravada normalmente no histórico com `atribuicao.estado = "pendente"`
     e `candidatos = [imovelA, imovelB]`.
   - O portão C3-B BARRA os quatro efeitos automáticos (follow-up, tentativa,
     retirada/encerramento e agenda) e evita chamada desnecessária à IA,
     impedindo que o imóvel errado seja retirado, encerrado ou agendado no chute.
   - Quando o proprietário cita explicitamente o código (ex.: "Já aluguei o LD-200")
     ou só existe 1 imóvel ativo (o outro já é Retirado/Perdido), o motor
     resolve com segurança e os efeitos automáticos (inclusive retirada C4)
     funcionam normalmente.
   - Na UI (`conversasDosImoveis`), a conversa sinaliza a pendência até o
     corretor responder.

   Nenhuma rede, nenhum Supabase real, nenhuma IA real.
   ================================================================ */
import { beforeEach, describe, expect, it, vi } from "vitest";

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
import { conversasDosImoveis } from "@/lib/calculo/conversas";
import { idExternoDaNotaWhatsapp } from "@/lib/calculo/importacaoConversaWhatsapp";
import { todayISO } from "@/lib/datas";
import type { Imovel, NotaImovel } from "@/lib/tipos";

const CONTA = "conta-c3b";
const SEGREDO = "segredo-c3b";
const TEL = "4399802431";
const HOJE = todayISO();
const HIST_CAPTADO = [
  { status: "Novo contato", date: "2026-08-01" },
  { status: "Angariado", date: "2026-08-10" },
];

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

function clienteFalso(banco: Banco) {
  const updates: { tabela: string; payload: Linha; eq: [string, unknown][] }[] = [];
  const rpcs: { nome: string; args: Record<string, unknown> }[] = [];

  function tabela(nome: string) {
    const eq: [string, unknown][] = [];
    const inn: [string, unknown[]][] = [];
    const is: [string, unknown][] = [];
    const gte: [string, string][] = [];
    const nots: [string, string, unknown][] = [];
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
          nots.every(([c, op, v]) => op !== "is" || (l[c] ?? null) !== v),
      );

    const executar = (): { data: unknown; error: unknown } => {
      if (payloadUpdate) {
        const alvo = linhas();
        updates.push({ tabela: nome, payload: structuredClone(payloadUpdate), eq: [...eq] });
        for (const l of alvo) Object.assign(l, payloadUpdate);
        return { data: alvo.map((l) => structuredClone(l)), error: null };
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
      not: (c: string, op: string, v: unknown) => (nots.push([c, op, v]), chain),
      gte: (c: string, v: string) => (gte.push([c, v]), chain),
      order: (c: string, o: { ascending: boolean }) => ((ordem = [c, o.ascending]), chain),
      limit: (n: number) => ((teto = n), chain),
      update: (p: Linha) => {
        payloadUpdate = p;
        return chain;
      },
      insert: async (p: Linha) => {
        ((banco as unknown as Record<string, Linha[]>)[nome] || []).push(p);
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

  return {
    updates,
    rpcs,
    cliente: {
      from: (nome: string) => tabela(nome),
      rpc: async (nome: string, args: Record<string, unknown>) => {
        rpcs.push({ nome, args });
        if (nome === "registrar_nota_whatsapp_conta") {
          const nota = args.p_nota as Linha;
          const mid = idExternoDaNotaWhatsapp({ id: String(nota.id) });
          const alvo = banco.imoveis.find((i) => i.id === args.p_imovel_id && i.user_id === args.p_user_id);
          if (!alvo) return { data: "imovel-inexistente", error: null };
          const jaExiste = ((alvo.notas as Linha[] | null) || []).some(
            (n) => idExternoDaNotaWhatsapp({ id: String(n.id) }) === mid,
          );
          if (jaExiste) return { data: "duplicada-mesmo-imovel", error: null };
          alvo.notas = [...((alvo.notas as Linha[] | null) || []), nota];
          return { data: "gravada", error: null };
        }
        if (nome === "registrar_nota_whatsapp") {
          const alvo = banco.imoveis.find((i) => i.id === args.p_imovel_id && i.user_id === args.p_user_id);
          if (alvo) alvo.notas = [...((alvo.notas as Linha[] | null) || []), args.p_nota as Linha];
          return { data: true, error: null };
        }
        if (nome === "processar_evento_resposta_acompanhamento") {
          return { data: { ok: true, repetido: false, agendaIds: ["ag-fw-1"] }, error: null };
        }
        return { data: null, error: null };
      },
    },
  };
}

function criarImovel(id: string, codigo: string, extra: Linha = {}): Linha {
  return {
    id,
    user_id: CONTA,
    codigo,
    endereco: `Rua ${codigo}, 100`,
    proprietario_nome: "Proprietário Multi",
    status: "Publicado",
    retirado: false,
    retirado_em: null,
    retirado_motivo: null,
    retirado_observacao: null,
    motivo_perda: null,
    tentativas: [],
    status_history: structuredClone(HIST_CAPTADO),
    notas: [],
    proprietario_telefone_canonico: TEL,
    updated_at: "2026-10-01T12:00:00Z",
    ...extra,
  };
}

function criarBancoDoisImoveis(extraA: Linha = {}, extraB: Linha = {}): Banco {
  return {
    whatsapp_instancias: [{ instancia: "inst-c3b", user_id: CONTA }],
    imoveis: [
      criarImovel("imovel-200", "LD-200", { updated_at: "2026-10-10T12:00:00Z", ...extraA }),
      criarImovel("imovel-202", "LD-202", { updated_at: "2026-10-05T12:00:00Z", ...extraB }),
    ],
    contatos_telefones: [{ contato_id: "c-multi", user_id: CONTA, telefone_canonico: TEL }],
    contatos: [{ id: "c-multi", user_id: CONTA, nome: "Proprietário Multi" }],
    imoveis_contatos: [
      { imovel_id: "imovel-200", contato_id: "c-multi", user_id: CONTA, encerrado_em: null },
      { imovel_id: "imovel-202", contato_id: "c-multi", user_id: CONTA, encerrado_em: null },
    ],
    mensagens_agendadas: [],
    agenda: [],
  };
}

async function enviar(banco: Banco, texto: string, id = "MSG-C3B") {
  const falso = clienteFalso(banco);
  mocks.createClient.mockReturnValue(falso.cliente);
  const resposta = await POST(
    new Request("http://localhost/api/whatsapp/webhook", {
      method: "POST",
      headers: { "x-webhook-secret": SEGREDO, "Content-Type": "application/json" },
      body: JSON.stringify({
        event: "messages.upsert",
        instance: "inst-c3b",
        data: {
          key: { id, remoteJid: "5543999802431@s.whatsapp.net", fromMe: false },
          message: { conversation: texto },
          messageType: "conversation",
        },
      }),
    }),
    { params: Promise.resolve({ segredo: [] }) },
  );
  return { resposta, ...falso };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.registrarEvento.mockReset();
  mocks.transcreverAudio.mockReset();
  vi.stubEnv("EVOLUTION_WEBHOOK_SECRET", SEGREDO);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://projeto.invalid");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-teste");
  vi.stubEnv("OPENAI_API_KEY", "");
  mocks.classificarResposta.mockResolvedValue({
    resultado: "recusou",
    resumo: "Já alugou",
    motivoPerda: "Imóvel já alugado por conta própria",
    retomarEm: "2026-12-10",
    horaRetomar: "10:00",
  });
});

describe("Webhook C3-B — proteção no empate de múltiplos imóveis", () => {
  it("2 imóveis ativos + 'Já aluguei por conta própria' sem código: grava a mensagem com pendência e BARRA retirada, encerramento, follow-up, tentativa, agenda e IA", async () => {
    const banco = criarBancoDoisImoveis(
      { tentativas: [{ id: "t1", data: `${HOJE}T08:00`, canal: "WhatsApp", aguardandoResultado: true }] },
      { tentativas: [{ id: "t2", data: `${HOJE}T08:00`, canal: "WhatsApp", aguardandoResultado: true }] },
    );

    const { resposta, updates, rpcs } = await enviar(banco, "Já aluguei por conta própria");
    expect(resposta.status).toBe(200);

    // Mensagem foi gravada com o metadado de pendência e os dois candidatos.
    const notasA = (banco.imoveis[0].notas as Linha[]) || [];
    expect(notasA).toHaveLength(1);
    expect(notasA[0].id).toBe("wa:MSG-C3B");
    expect(notasA[0].atribuicao).toMatchObject({
      estado: "pendente",
      candidatos: ["imovel-200", "imovel-202"],
    });

    // NENHUM imóvel foi retirado, encerrado ou teve tentativa alterada.
    expect(banco.imoveis[0]).toMatchObject({ status: "Publicado", retirado: false, retirado_motivo: null });
    expect(banco.imoveis[1]).toMatchObject({ status: "Publicado", retirado: false, retirado_motivo: null });
    expect(updates).toHaveLength(0);
    expect(banco.agenda).toHaveLength(0);
    expect(rpcs.some((r) => r.nome === "processar_evento_resposta_acompanhamento")).toBe(false);
    expect(rpcs.some((r) => r.nome === "registrar_nota_whatsapp")).toBe(false);
    expect(mocks.classificarResposta).not.toHaveBeenCalled();
  });

  it("2 imóveis ativos + código explícito ('Já aluguei o LD-202'): resolve LD-202 e retira SOMENTE o LD-202 (C4), mantendo LD-200 intacto", async () => {
    const banco = criarBancoDoisImoveis();

    const { resposta } = await enviar(banco, "Já aluguei o LD-202 por conta própria", "MSG-EXP");
    expect(resposta.status).toBe(200);

    // LD-200 (mais recente no legado!) permanece intacto; LD-202 é retirado!
    expect(banco.imoveis[0]).toMatchObject({ codigo: "LD-200", status: "Publicado", retirado: false });
    expect(banco.imoveis[1]).toMatchObject({
      codigo: "LD-202",
      status: "Publicado",
      retirado: true,
      retirado_motivo: "locado-proprietario",
    });
    expect(mocks.classificarResposta).toHaveBeenCalledTimes(1);
  });

  it("2 imóveis ativos + endereço no texto ('Já aluguei o da Rua Achiro Kawasaki'): resolve pelo endereço sem precisar do código", async () => {
    const banco = criarBancoDoisImoveis(
      { endereco: "Rua Yoshikawa Koji, 750", bairro: "Jardim Tókio" },
      { endereco: "Rua Achiro Kawasaki, 641", bairro: "Jardim Tókio" },
    );

    const { resposta } = await enviar(banco, "Já aluguei o da Rua Achiro Kawasaki por conta própria", "MSG-END");
    expect(resposta.status).toBe(200);

    // LD-200 (mais recente no legado!) permanece intacto; LD-202 (Achiro Kawasaki) é retirado!
    expect(banco.imoveis[0]).toMatchObject({ codigo: "LD-200", status: "Publicado", retirado: false });
    expect(banco.imoveis[1]).toMatchObject({
      codigo: "LD-202",
      status: "Publicado",
      retirado: true,
      retirado_motivo: "locado-proprietario",
    });
  });

  it("2 imóveis vinculados onde apenas 1 está ativo (outro já Retirado): resolve o único ativo e aplica C4 normalmente", async () => {
    const banco = criarBancoDoisImoveis({ retirado: true, retirado_motivo: "vendido" }, { retirado: false });

    const { resposta } = await enviar(banco, "Já aluguei por conta própria", "MSG-UNICO");
    expect(resposta.status).toBe(200);

    expect(banco.imoveis[0]).toMatchObject({ codigo: "LD-200", retirado: true, retirado_motivo: "vendido" });
    expect(banco.imoveis[1]).toMatchObject({
      codigo: "LD-202",
      status: "Publicado",
      retirado: true,
      retirado_motivo: "locado-proprietario",
    });
  });
});

describe("UI de Mensagens — detecção de pendência de atribuição (C3-B)", () => {
  function imovelUi(id: string, codigo: string, notas: Array<NotaImovel & { atribuicao?: unknown }>): Imovel {
    return {
      id,
      codigo,
      endereco: `Rua ${codigo}`,
      bairro: "Centro",
      cidade: "Londrina",
      tipo: "Apartamento",
      status: "Publicado",
      retirado: false,
      dataAngariacao: "2026-10-01",
      statusHistory: [],
      notas,
    } as Imovel;
  }

  it("sinaliza pendenciaAtribuicao quando a última mensagem recebida chegou em empate e limpa após resposta do corretor", () => {
    const notaPendente = {
      id: "wa:M1",
      texto: "Resposta pelo WhatsApp: Já aluguei",
      data: "2026-11-28T09:00:00",
      direcao: "recebida" as const,
      atribuicao: {
        versao: 1,
        estado: "pendente",
        nivelEmpate: "sem-contexto",
        candidatos: ["a", "b"],
      },
    };

    const comPendencia = conversasDosImoveis([imovelUi("a", "LD-200", [notaPendente])], "2026-11-28");
    expect(comPendencia[0].pendenciaAtribuicao).toEqual({
      mensagemId: "wa:M1",
      data: "2026-11-28T09:00:00",
      candidatos: ["a", "b"],
      nivelEmpate: "sem-contexto",
    });
    expect(comPendencia[0].mensagens[0].atribuicaoPendente).toEqual({
      candidatos: ["a", "b"],
      nivelEmpate: "sem-contexto",
    });

    // Depois que o corretor responde, o banner sai da conversa mas a marca histórica na bolha permanece.
    const notaRespostaCorretor: NotaImovel = {
      id: "wa-enviada:M2",
      texto: "Mensagem enviada pelo WhatsApp: Qual dos imóveis você alugou?",
      data: "2026-11-28T09:05:00",
      direcao: "enviada",
    };
    const aposResposta = conversasDosImoveis(
      [imovelUi("a", "LD-200", [notaPendente, notaRespostaCorretor])],
      "2026-11-28",
    );
    expect(aposResposta[0].pendenciaAtribuicao).toBeNull();
    expect(aposResposta[0].mensagens[0].atribuicaoPendente).not.toBeNull();
  });
});
