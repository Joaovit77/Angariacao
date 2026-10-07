import { beforeEach, describe, expect, it, vi } from "vitest";

import { todayISO } from "@/lib/datas";
import { idExternoDaNotaWhatsapp } from "@/lib/calculo/importacaoConversaWhatsapp";

/* Fase 1a-C3-A2: o shadow do portão de efeitos na rota do webhook.

   O portão NÃO manda em nada: os efeitos rodam como antes, e a rota só
   registra, depois deles, o que o portão faria ao lado do que de fato
   aconteceu (`webhook-portao-efeitos-shadow`). Tudo contra um banco falso
   em memória, sem rede, sem Supabase e sem WhatsApp. */

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
const SEGREDO = "segredo-teste";
/** 5543999990001 canonizado pela regra do projeto. */
const TEL = "4399990001";
const HOJE = todayISO();
const AMANHA = (() => {
  const [a, m, d] = HOJE.split("-").map(Number);
  const x = new Date(Date.UTC(a, m - 1, d + 1));
  return x.toISOString().slice(0, 10);
})();
const EVENTO_SHADOW = "webhook-portao-efeitos-shadow";
const JA_ALUGUEI = "Imóvel já alugado por conta própria";

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
interface Opcoes {
  falhar?: string[];
  falharRpcNota?: boolean;
  followupsConcluidos?: string[];
  followupRepetido?: boolean;
  falharFollowup?: boolean;
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

function clienteFalso(banco: Banco, opcoes: Opcoes = {}) {
  const updates: { tabela: string; eq: [string, unknown][]; payload: unknown }[] = [];
  const rpcs: { nome: string; args: Record<string, unknown> }[] = [];

  function tabela(nome: string) {
    const eq: [string, unknown][] = [];
    const inn: [string, unknown[]][] = [];
    const is: [string, unknown][] = [];
    const nao: [string, unknown][] = [];
    const gte: [string, string][] = [];
    let ordem: [string, boolean] | null = null;
    let teto: number | null = null;
    let op: "select" | "update" = "select";
    let payload: unknown = null;
    let devolverLinhas = false;

    const linhas = () =>
      ((banco as unknown as Record<string, Linha[]>)[nome] || []).filter(
        (l) =>
          eq.every(([c, v]) => l[c] === v) &&
          inn.every(([c, vs]) => vs.includes(l[c])) &&
          is.every(([c, v]) => (l[c] ?? null) === v) &&
          nao.every(([c, v]) => (l[c] ?? null) !== v) &&
          gte.every(([c, v]) => String(l[c] ?? "") >= v),
      );

    const executar = (): { data: unknown; error: unknown } => {
      if (opcoes.falhar?.includes(nome)) return { data: null, error: { message: "boom" } };
      if (op === "update") {
        const alvo = linhas();
        for (const l of alvo) Object.assign(l, payload);
        updates.push({ tabela: nome, eq: [...eq], payload });
        return { data: devolverLinhas ? alvo.map((l) => ({ id: l.id })) : null, error: null };
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
      select: () => {
        if (op === "update") devolverLinhas = true;
        return chain;
      },
      eq: (c: string, v: unknown) => (eq.push([c, v]), chain),
      in: (c: string, v: unknown[]) => (inn.push([c, v]), chain),
      is: (c: string, v: unknown) => (is.push([c, v]), chain),
      not: (c: string, _op: string, v: unknown) => (nao.push([c, v]), chain),
      gte: (c: string, v: string) => (gte.push([c, v]), chain),
      order: (c: string, o: { ascending: boolean }) => ((ordem = [c, o.ascending]), chain),
      limit: (n: number) => ((teto = n), chain),
      update: (p: unknown) => {
        op = "update";
        payload = p;
        return chain;
      },
      insert: async (p: Linha) => {
        if (opcoes.falhar?.includes(nome)) return { error: { message: "boom" } };
        (banco as unknown as Record<string, Linha[]>)[nome].push(p);
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
      rpcs.push({ nome, args });
      if (nome === "registrar_nota_whatsapp_conta") {
        if (opcoes.falharRpcNota) return { data: null, error: { message: "boom" } };
        const nota = args.p_nota as Linha;
        const mid = idExternoDaNotaWhatsapp({ id: String(nota.id) });
        const daConta = banco.imoveis.filter((i) => i.user_id === args.p_user_id);
        const comMensagem = daConta.filter((i) =>
          ((i.notas as Linha[] | null) || []).some((n) => idExternoDaNotaWhatsapp({ id: String(n.id) }) === mid),
        );
        if (comMensagem.length) {
          return { data: comMensagem.some((i) => i.id === args.p_imovel_id) ? "duplicada-mesmo-imovel" : "duplicada-outro-imovel", error: null };
        }
        const alvo = daConta.find((i) => i.id === args.p_imovel_id);
        if (!alvo) return { data: "imovel-inexistente", error: null };
        alvo.notas = [...((alvo.notas as Linha[] | null) || []), nota];
        return { data: "gravada", error: null };
      }
      if (nome === "registrar_nota_whatsapp") {
        const alvo = banco.imoveis.find((i) => i.id === args.p_imovel_id && i.user_id === args.p_user_id);
        if (alvo) alvo.notas = [...((alvo.notas as Linha[] | null) || []), args.p_nota as Linha];
        return { data: true, error: null };
      }
      if (nome === "processar_evento_resposta_acompanhamento") {
        if (opcoes.falharFollowup) return { data: null, error: { message: "boom" } };
        return {
          data: { ok: true, repetido: opcoes.followupRepetido === true, agendaIds: opcoes.followupsConcluidos ?? [] },
          error: null,
        };
      }
      return { data: null, error: null };
    },
  };
  return { cliente, updates, rpcs };
}

function imovel(id: string, extra: Linha = {}): Linha {
  return {
    id,
    user_id: CONTA,
    codigo: null,
    endereco: "Rua Secreta do Teste, 987",
    proprietario_nome: "Fulano Proprietario Secreto",
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
const vinculo = (imovelId: string) => ({ imovel_id: imovelId, contato_id: "c1", user_id: CONTA, encerrado_em: null });
const tentativaPendente = () => ({ id: `t-${imovelIdSeq++}`, data: `${HOJE}T08:00`, canal: "WhatsApp", aguardandoResultado: true });
let imovelIdSeq = 0;

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

async function enviar(banco: Banco, corpo: unknown, opcoes: Opcoes = {}) {
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

type EfeitoShadow = { shadow: string; motivo: string; real: string; contraste: string };
type DadosShadow = {
  versao: number;
  categoria: string;
  autoridade: string;
  nivel: string | null;
  imovel_terminal: boolean | null;
  casamentos_legados: number | null;
  pendencia: boolean;
  requer_resolucao: boolean;
  operacional_imovel_id: string;
  efeitos: Record<"followup" | "tentativa" | "encerramento" | "agenda", EfeitoShadow>;
  suprimiria_mas_aplicou: string[];
  suprimiria_com_execucao_sem_confirmacao: string[];
};

function eventosShadow() {
  return mocks.registrarEvento.mock.calls
    .map((c) => c[0] as { evento: string; nivel: string; categoria: string; userId: string; detalhe: string })
    .filter((e) => e.evento === EVENTO_SHADOW);
}

function unicoShadow(): DadosShadow & { _bruto: string; _nivel: string } {
  const lista = eventosShadow();
  expect(lista).toHaveLength(1);
  return { ...(JSON.parse(lista[0].detalhe) as DadosShadow), _bruto: lista[0].detalhe, _nivel: lista[0].nivel };
}

function campo(d: DadosShadow, chave: keyof EfeitoShadow) {
  return {
    followup: d.efeitos.followup[chave],
    tentativa: d.efeitos.tentativa[chave],
    encerramento: d.efeitos.encerramento[chave],
    agenda: d.efeitos.agenda[chave],
  };
}

/** A IA leu uma data: vira compromisso na agenda. */
const sugestaoComData = (extra: Linha = {}) => ({
  resultado: "agendou",
  resumo: "RESUMO-DA-IA-SECRETO",
  motivoPerda: null,
  retomarEm: AMANHA,
  horaRetomar: "10:00",
  ...extra,
});

beforeEach(() => {
  vi.clearAllMocks();
  // `clearAllMocks` não desfaz implementações: sem isto, o registro que lança
  // no teste L continuaria lançando nos testes seguintes.
  mocks.registrarEvento.mockReset();
  mocks.transcreverAudio.mockReset();
  vi.stubEnv("EVOLUTION_WEBHOOK_SECRET", SEGREDO);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://projeto.invalid");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-teste");
  vi.stubEnv("OPENAI_API_KEY", "");
  mocks.classificarResposta.mockResolvedValue(null);
});

describe("A. concordante normal", () => {
  it("emite um evento: o portão liberaria os quatro, e a realidade bate", async () => {
    const banco = criarBanco({
      imoveis: [imovel("imovel-a", { codigo: "LD-1", tentativas: [tentativaPendente()] })],
      imoveis_contatos: [vinculo("imovel-a")],
    });
    mocks.classificarResposta.mockResolvedValue(sugestaoComData());
    const { resposta, updates } = await enviar(banco, evento("pode ser amanhã às 10h"), { followupsConcluidos: ["ag-1"] });
    expect(resposta.status).toBe(200);

    const d = unicoShadow();
    expect(d._nivel).toBe("info");
    expect(d).toMatchObject({
      versao: 1,
      categoria: "concordante",
      autoridade: "motor",
      nivel: "contexto-tentativa",
      imovel_terminal: false,
      casamentos_legados: 1,
      pendencia: false,
      requer_resolucao: false,
      operacional_imovel_id: "imovel-a",
      suprimiria_mas_aplicou: [],
      suprimiria_com_execucao_sem_confirmacao: [],
    });
    expect(campo(d, "shadow")).toEqual({ followup: "liberaria", tentativa: "liberaria", encerramento: "liberaria", agenda: "liberaria" });
    expect(campo(d, "real")).toEqual({
      followup: "aplicado-confirmado",
      tentativa: "executado-sem-confirmacao",
      encerramento: "nao-elegivel",
      agenda: "executado-sem-confirmacao",
    });
    expect(campo(d, "contraste")).toEqual({ followup: "compativel", tentativa: "compativel", encerramento: "compativel", agenda: "compativel" });

    // Os efeitos são os de sempre.
    expect(updates.some((u) => u.tabela === "imoveis" && "tentativas" in (u.payload as Linha))).toBe(true);
    expect(banco.agenda).toHaveLength(1);
  });

  it("sem gatilho nenhum, tudo fica nao-elegivel e compatível (liberar o que não tinha gatilho não é divergência)", async () => {
    const banco = criarBanco({ imoveis: [imovel("imovel-a")], imoveis_contatos: [vinculo("imovel-a")] });
    await enviar(banco, evento("oi"));
    const d = unicoShadow();
    expect(campo(d, "real")).toEqual({ followup: "nao-aplicado", tentativa: "nao-elegivel", encerramento: "nao-elegivel", agenda: "nao-elegivel" });
    expect(campo(d, "contraste")).toEqual({ followup: "compativel", tentativa: "compativel", encerramento: "compativel", agenda: "compativel" });
  });

  it("encerramento aplicado: o evento sai no retorno antecipado, com a agenda nao-elegivel", async () => {
    const banco = criarBanco({ imoveis: [imovel("imovel-a")], imoveis_contatos: [vinculo("imovel-a")] });
    mocks.classificarResposta.mockResolvedValue({ resultado: "recusou", resumo: "x", motivoPerda: JA_ALUGUEI, retomarEm: AMANHA });
    await enviar(banco, evento("já aluguei"));
    expect(banco.imoveis[0].status).toBe("Perdido");
    const d = unicoShadow();
    expect(d.efeitos.encerramento).toEqual({
      shadow: "liberaria",
      motivo: "autoridade-segura",
      real: "aplicado-confirmado",
      contraste: "compativel",
    });
    expect(d.efeitos.agenda.real).toBe("nao-elegivel");
    expect(banco.agenda).toHaveLength(0);
  });
});

describe("B. terminal: o portão suprimiria, o legado executa, e o evento separa prova de execução", () => {
  it("contato só com imóvel Perdido: follow-up confirmado é violação; tentativa e agenda sem prova vão para revisão", async () => {
    const banco = criarBanco({
      imoveis: [imovel("imovel-l", { status: "Perdido", tentativas: [tentativaPendente()] })],
      imoveis_contatos: [vinculo("imovel-l")],
    });
    mocks.classificarResposta.mockResolvedValue(sugestaoComData({ motivoPerda: JA_ALUGUEI }));
    const { updates } = await enviar(banco, evento("pode ser amanhã"), { followupsConcluidos: ["ag-9"] });

    const d = unicoShadow();
    expect(d).toMatchObject({ categoria: "novo-sem-candidatos", autoridade: "legado", imovel_terminal: true, pendencia: false });
    expect(campo(d, "shadow")).toEqual({ followup: "suprimiria", tentativa: "suprimiria", encerramento: "suprimiria", agenda: "suprimiria" });
    expect(campo(d, "motivo")).toEqual({
      followup: "terminal-historico",
      tentativa: "terminal-historico",
      encerramento: "terminal-historico",
      agenda: "terminal-historico",
    });
    // O encerramento tinha gatilho (motivo de perda) e a trava do terminal barrou.
    expect(campo(d, "real")).toEqual({
      followup: "aplicado-confirmado",
      tentativa: "executado-sem-confirmacao",
      encerramento: "barrado",
      agenda: "executado-sem-confirmacao",
    });
    expect(campo(d, "contraste")).toEqual({
      followup: "suprimiria-mas-aplicou",
      tentativa: "suprimiria-com-execucao-sem-confirmacao",
      encerramento: "compativel",
      agenda: "suprimiria-com-execucao-sem-confirmacao",
    });
    // Só o que tem prova entra na lista de violação confirmada.
    expect(d.suprimiria_mas_aplicou).toEqual(["followup"]);
    expect(d.suprimiria_com_execucao_sem_confirmacao).toEqual(["tentativa", "agenda"]);

    // Comportamento legado intacto: os efeitos aconteceram de verdade.
    expect(updates.some((u) => u.tabela === "imoveis" && "tentativas" in (u.payload as Linha))).toBe(true);
    expect(banco.agenda).toHaveLength(1);
    expect(banco.imoveis[0].status).toBe("Perdido");
  });
});

describe("C. novo-pendente", () => {
  it("dois plausíveis sem contexto: pendência no shadow, efeitos legados no imóvel mais recente", async () => {
    const banco = criarBanco({
      imoveis: [
        imovel("imovel-a", { updated_at: "2026-09-28T00:00:00Z", tentativas: [tentativaPendente()] }),
        imovel("imovel-b", { tentativas: [tentativaPendente()] }),
      ],
      imoveis_contatos: [vinculo("imovel-a"), vinculo("imovel-b")],
    });
    const { updates } = await enviar(banco, evento("pode ser"));
    const d = unicoShadow();
    expect(d).toMatchObject({
      categoria: "novo-pendente",
      autoridade: "legado",
      pendencia: true,
      requer_resolucao: true,
      casamentos_legados: 2,
      operacional_imovel_id: "imovel-a",
    });
    expect(campo(d, "shadow")).toEqual({ followup: "suprimiria", tentativa: "suprimiria", encerramento: "suprimiria", agenda: "suprimiria" });
    expect(d.efeitos.tentativa).toMatchObject({
      motivo: "atribuicao-pendente",
      real: "executado-sem-confirmacao",
      contraste: "suprimiria-com-execucao-sem-confirmacao",
    });
    expect(d.suprimiria_mas_aplicou).toEqual([]);
    expect(d.suprimiria_com_execucao_sem_confirmacao).toEqual(["tentativa"]);
    expect(updates.find((u) => u.tabela === "imoveis")?.eq).toEqual(expect.arrayContaining([["id", "imovel-a"]]));
  });
});

describe("D. sem-candidatos em imóvel vivo", () => {
  it("contato sem vínculo vigente: suprimiria por sem-candidatos", async () => {
    const banco = criarBanco({ imoveis: [imovel("imovel-a")], imoveis_contatos: [] });
    await enviar(banco, evento("oi"));
    const d = unicoShadow();
    expect(d).toMatchObject({ categoria: "novo-sem-candidatos", imovel_terminal: false });
    expect(campo(d, "motivo")).toEqual({ followup: "sem-candidatos", tentativa: "sem-candidatos", encerramento: "sem-candidatos", agenda: "sem-candidatos" });
  });
});

describe("E-F. regras abertas em imóvel vivo: indefinido", () => {
  it("E. sem-contato-relacional: indefinido em todos, com o efeito real registrado", async () => {
    const banco = criarBanco({ imoveis: [imovel("imovel-a", { tentativas: [tentativaPendente()] })], contatos_telefones: [] });
    await enviar(banco, evento("oi"));
    const d = unicoShadow();
    expect(d).toMatchObject({ categoria: "sem-contato-relacional", autoridade: "legado", imovel_terminal: false, casamentos_legados: 1 });
    expect(campo(d, "shadow")).toEqual({ followup: "indefinido", tentativa: "indefinido", encerramento: "indefinido", agenda: "indefinido" });
    expect(campo(d, "contraste")).toEqual({ followup: "indefinido", tentativa: "indefinido", encerramento: "indefinido", agenda: "indefinido" });
    expect(d.efeitos.tentativa.real).toBe("executado-sem-confirmacao");
    expect(d.suprimiria_mas_aplicou).toEqual([]);
    expect(d.suprimiria_com_execucao_sem_confirmacao).toEqual([]);
  });

  it("F. falha da resolução: indefinido em todos", async () => {
    const banco = criarBanco({ imoveis: [imovel("imovel-a")], imoveis_contatos: [vinculo("imovel-a")] });
    await enviar(banco, evento("oi"), { falhar: ["imoveis_contatos"] });
    const d = unicoShadow();
    expect(d).toMatchObject({ categoria: "falha", autoridade: "legado", imovel_terminal: false });
    expect(campo(d, "motivo")).toEqual({
      followup: "falha-regra-pendente",
      tentativa: "falha-regra-pendente",
      encerramento: "falha-regra-pendente",
      agenda: "falha-regra-pendente",
    });
  });
});

describe("G. retomada (Retirados B3)", () => {
  it("libera follow-up, tentativa e agenda; o encerramento suprimiria e a trava do retirado barrou", async () => {
    const banco = criarBanco({
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
          enviado_em: new Date(Date.now() - 2 * 3_600_000).toISOString(),
        },
      ],
    });
    mocks.classificarResposta.mockResolvedValue({ resultado: "recusou", resumo: "x", motivoPerda: JA_ALUGUEI, retomarEm: null });
    await enviar(banco, evento("já aluguei"));
    const d = unicoShadow();
    expect(d).toMatchObject({ categoria: "terminal-historico", autoridade: "motor", nivel: "contexto-retomada", imovel_terminal: true });
    expect(campo(d, "shadow")).toEqual({ followup: "liberaria", tentativa: "liberaria", encerramento: "suprimiria", agenda: "liberaria" });
    expect(d.efeitos.encerramento).toEqual({ shadow: "suprimiria", motivo: "retomada-sem-encerramento", real: "barrado", contraste: "compativel" });
    expect(banco.imoveis[0]).toMatchObject({ retirado: true, status: "Publicado" });
  });
});

describe("H. divergente", () => {
  it("o motor escolhe o vivo contra o legado Perdido: liberaria no imóvel do motor", async () => {
    const banco = criarBanco({
      imoveis: [
        imovel("imovel-l", { status: "Perdido", updated_at: "2026-09-28T00:00:00Z" }),
        imovel("imovel-x", { tentativas: [tentativaPendente()] }),
      ],
      imoveis_contatos: [vinculo("imovel-l"), vinculo("imovel-x")],
    });
    await enviar(banco, evento("pode ser"));
    const d = unicoShadow();
    expect(d).toMatchObject({ categoria: "divergente", autoridade: "motor", imovel_terminal: false, operacional_imovel_id: "imovel-x" });
    expect(campo(d, "shadow")).toEqual({ followup: "liberaria", tentativa: "liberaria", encerramento: "liberaria", agenda: "liberaria" });
    expect(d.efeitos.tentativa).toMatchObject({ real: "executado-sem-confirmacao", contraste: "compativel" });
  });
});

describe("efeito real: prova de efeito x execução sem erro", () => {
  const vivo = (extra: Linha = {}) =>
    criarBanco({ imoveis: [imovel("imovel-a", extra)], imoveis_contatos: [vinculo("imovel-a")] });

  it("tentativa: o update volta sem erro e sem linhas, então é executado-sem-confirmacao, nunca confirmado", async () => {
    await enviar(vivo({ tentativas: [tentativaPendente()] }), evento("pode ser"));
    expect(unicoShadow().efeitos.tentativa.real).toBe("executado-sem-confirmacao");
  });

  it("agenda criada: o insert não devolve linha, então é executado-sem-confirmacao", async () => {
    const banco = vivo();
    mocks.classificarResposta.mockResolvedValue(sugestaoComData());
    await enviar(banco, evento("amanhã às 10h"));
    expect(banco.agenda).toHaveLength(1);
    expect(unicoShadow().efeitos.agenda.real).toBe("executado-sem-confirmacao");
  });

  it("agenda: hora completada num compromisso do mesmo dia também é executado-sem-confirmacao", async () => {
    const banco = vivo();
    banco.agenda.push({ id: "ag-x", user_id: CONTA, imovel_id: "imovel-a", date: AMANHA, done: false, hora: null });
    mocks.classificarResposta.mockResolvedValue(sugestaoComData());
    await enviar(banco, evento("às 10h"));
    expect(banco.agenda).toHaveLength(1);
    expect(banco.agenda[0].hora).toBe("10:00");
    expect(unicoShadow().efeitos.agenda.real).toBe("executado-sem-confirmacao");
  });

  it("agenda: compromisso do mesmo dia já com a mesma hora fica como está e é nao-aplicado", async () => {
    const banco = vivo();
    banco.agenda.push({ id: "ag-x", user_id: CONTA, imovel_id: "imovel-a", date: AMANHA, done: false, hora: "10:00" });
    mocks.classificarResposta.mockResolvedValue(sugestaoComData());
    await enviar(banco, evento("amanhã às 10h"));
    expect(banco.agenda).toHaveLength(1);
    expect(banco.agenda[0].hora).toBe("10:00");
    expect(unicoShadow().efeitos.agenda.real).toBe("nao-aplicado");
  });

  it("encerramento com linha devolvida é aplicado-confirmado", async () => {
    const banco = vivo();
    mocks.classificarResposta.mockResolvedValue({ resultado: "recusou", resumo: "x", motivoPerda: JA_ALUGUEI, retomarEm: null });
    await enviar(banco, evento("já aluguei"));
    expect(banco.imoveis[0].status).toBe("Perdido");
    expect(unicoShadow().efeitos.encerramento.real).toBe("aplicado-confirmado");
  });

  it("follow-up: ids devolvidos são aplicado-confirmado; nenhum id, ou reentrega, é nao-aplicado; erro é falhou", async () => {
    await enviar(vivo(), evento("oi", { id: "F1" }), { followupsConcluidos: ["ag-1"] });
    expect(unicoShadow().efeitos.followup.real).toBe("aplicado-confirmado");

    mocks.registrarEvento.mockClear();
    await enviar(vivo(), evento("oi", { id: "F2" }));
    expect(unicoShadow().efeitos.followup.real).toBe("nao-aplicado");

    mocks.registrarEvento.mockClear();
    await enviar(vivo(), evento("oi", { id: "F3" }), { followupsConcluidos: ["ag-1"], followupRepetido: true });
    expect(unicoShadow().efeitos.followup.real).toBe("nao-aplicado");

    mocks.registrarEvento.mockClear();
    await enviar(vivo(), evento("oi", { id: "F4" }), { falharFollowup: true });
    expect(unicoShadow().efeitos.followup).toMatchObject({ real: "falhou", contraste: "real-falhou" });
  });

  it("supressão com execução sem prova NÃO entra em suprimiria_mas_aplicou; vai para a lista de revisão", async () => {
    const banco = criarBanco({
      imoveis: [imovel("imovel-l", { status: "Perdido", tentativas: [tentativaPendente()] })],
      imoveis_contatos: [vinculo("imovel-l")],
    });
    await enviar(banco, evento("oi"));
    const d = unicoShadow();
    expect(d.efeitos.tentativa).toMatchObject({
      shadow: "suprimiria",
      real: "executado-sem-confirmacao",
      contraste: "suprimiria-com-execucao-sem-confirmacao",
    });
    expect(d.efeitos.followup).toMatchObject({ shadow: "suprimiria", real: "nao-aplicado", contraste: "compativel" });
    expect(d.suprimiria_mas_aplicou).toEqual([]);
    expect(d.suprimiria_com_execucao_sem_confirmacao).toEqual(["tentativa"]);
  });
});

describe("I-K. quando NÃO há evento", () => {
  it("I. fromMe: nota gravada, nenhum efeito e nenhum evento de shadow", async () => {
    const banco = criarBanco({ imoveis: [imovel("imovel-a")], imoveis_contatos: [vinculo("imovel-a")] });
    const { resposta } = await enviar(banco, evento("mensagem do corretor", { fromMe: true }));
    expect(resposta.status).toBe(200);
    expect(eventosShadow()).toHaveLength(0);
    expect(((banco.imoveis[0].notas as Linha[]) || []).length).toBe(1);
  });

  it("J. reentrega da mesma mensagem: um evento só", async () => {
    const banco = criarBanco({ imoveis: [imovel("imovel-a")], imoveis_contatos: [vinculo("imovel-a")] });
    await enviar(banco, evento("oi", { id: "MSG-R" }));
    await enviar(banco, evento("oi", { id: "MSG-R" }));
    expect(eventosShadow()).toHaveLength(1);
  });

  it("K. persistência não gravada (falha da RPC): nenhum evento e nenhum efeito", async () => {
    const banco = criarBanco({ imoveis: [imovel("imovel-a")], imoveis_contatos: [vinculo("imovel-a")] });
    const { rpcs } = await enviar(banco, evento("oi"), { falharRpcNota: true });
    expect(eventosShadow()).toHaveLength(0);
    expect(rpcs.some((r) => r.nome === "processar_evento_resposta_acompanhamento")).toBe(false);
  });

  it("K2. mensagem já gravada em outro imóvel da conta: nenhum evento", async () => {
    const banco = criarBanco({
      imoveis: [imovel("imovel-a"), imovel("imovel-z", { proprietario_telefone_canonico: "4300000000", notas: [{ id: "wa:MSG1", texto: "x" }] })],
      imoveis_contatos: [vinculo("imovel-a")],
    });
    await enviar(banco, evento("oi"));
    expect(eventosShadow()).toHaveLength(0);
  });
});

describe("L. a telemetria nunca derruba o webhook", () => {
  it("registrar o shadow falha: 200, efeitos intactos, nada reprocessado", async () => {
    mocks.registrarEvento.mockImplementation((e: { evento: string }) => {
      if (e.evento === EVENTO_SHADOW) throw new Error("log fora do ar");
    });
    const erro = vi.spyOn(console, "error").mockImplementation(() => {});
    const banco = criarBanco({
      imoveis: [imovel("imovel-a", { tentativas: [tentativaPendente()] })],
      imoveis_contatos: [vinculo("imovel-a")],
    });
    mocks.classificarResposta.mockResolvedValue(sugestaoComData());
    const { resposta, rpcs } = await enviar(banco, evento("amanhã às 10h"));
    expect(resposta.status).toBe(200);
    expect(await resposta.json()).toEqual({ ok: true });
    expect(banco.agenda).toHaveLength(1);
    expect(rpcs.filter((r) => r.nome === "registrar_nota_whatsapp_conta")).toHaveLength(1);
    expect(erro.mock.calls.flat().join(" ")).not.toMatch(/4399990001|Fulano|Rua Secreta|amanhã às 10h/);
    erro.mockRestore();
  });
});

describe("payload sem dado pessoal", () => {
  it("o detalhe não carrega telefone, nome, endereço, texto, transcrição nem saída da IA", async () => {
    mocks.transcreverAudio.mockResolvedValue({ ok: true, texto: "TRANSCRICAO-SECRETA amanhã" });
    const banco = criarBanco({
      imoveis: [imovel("imovel-a", { codigo: "LD-1", tentativas: [tentativaPendente()] })],
      imoveis_contatos: [vinculo("imovel-a")],
    });
    mocks.classificarResposta.mockResolvedValue(sugestaoComData({ motivoPerda: null }));
    const corpo = evento("");
    corpo.data.messageType = "audioMessage";
    corpo.data.message = { audioMessage: {} } as never;
    await enviar(banco, corpo);
    const bruto = unicoShadow()._bruto;
    for (const proibido of [
      TEL,
      "5543999990001",
      "999990001",
      "Fulano",
      "Proprietario",
      "Rua Secreta",
      "987",
      "TRANSCRICAO-SECRETA",
      "RESUMO-DA-IA",
      "agendou",
      "10:00",
      AMANHA,
      JA_ALUGUEI,
      "LD-1",
      "c1",
    ]) {
      expect(bruto).not.toContain(proibido);
    }
    expect(Object.keys(JSON.parse(bruto)).sort()).toEqual([
      "autoridade",
      "casamentos_legados",
      "categoria",
      "efeitos",
      "imovel_terminal",
      "nivel",
      "operacional_imovel_id",
      "pendencia",
      "requer_resolucao",
      "suprimiria_com_execucao_sem_confirmacao",
      "suprimiria_mas_aplicou",
      "versao",
    ]);
  });

  it("texto da mensagem não vaza", async () => {
    const banco = criarBanco({ imoveis: [imovel("imovel-a")], imoveis_contatos: [vinculo("imovel-a")] });
    await enviar(banco, evento("TEXTO-SECRETO-DO-PROPRIETARIO"));
    expect(unicoShadow()._bruto).not.toContain("TEXTO-SECRETO");
  });
});
