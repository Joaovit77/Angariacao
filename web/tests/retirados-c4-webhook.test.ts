/* ================================================================
   RETIRADOS, FASE C / C4: RETIRADA AUTOMÁTICA PELO WEBHOOK

   Quando o proprietário responde no WhatsApp informando que o imóvel não está
   mais disponível (alugou por conta própria, alugou por outra imobiliária,
   vendeu, desistiu, etc.):

   - Imóvel JÁ CAPTADO e em carteira (`podeRetirarDaCarteira`: Angariado,
     Autorização assinada ou Publicado com captação ganha) -> `retirado = true`
     com `retirado_em` no dia civil de Brasília, `retirado_motivo` na lista
     fechada `MOTIVOS_RETIRADA` e `retirado_observacao` obrigatória quando
     `"outro"`, preservando `status` e `status_history` intactos.
   - Lead AINDA NÃO CAPTADO (Novo contato, Visita agendada, Em negociação,
     Documentação, Sem resposta sem Angariado) -> continua virando `"Perdido"`
     com `motivo_perda` e transição no `status_history`.
   - Imóvel já retirado, Locado, Perdido ou Cancelado -> nunca alterado.

   Nenhuma rede, nenhum Supabase real, nenhuma IA real.
   ================================================================ */
import { beforeEach, describe, expect, it, vi } from "vitest";

import { MOTIVO_PERDA_IMOVEL_INDISPONIVEL } from "@/lib/constantes";
import { MOTIVOS_PERDA_IA } from "@/lib/calculo/ia";
import {
  ehMotivoRetirada,
  LIMITE_OBSERVACAO_RETIRADA,
  tamanhoObservacaoRetirada,
  validarRetirada,
} from "@/lib/calculo/retiradaCarteira";
import {
  encerramentoPorResposta,
  motivoRetiradaPorResposta,
  notaDoEncerramento,
} from "@/lib/calculo/webhookWhatsapp";
import { agoraTimestamp, dataOperacionalDeTimestamp } from "@/lib/datas";

const HOJE_UTC = "2026-10-16";
const HOJE_BRASILIA = "2026-10-15";
const HIST_CAPTADO = [
  { status: "Novo contato", date: "2026-08-01" },
  { status: "Angariado", date: "2026-08-10" },
];

/* ----------------------------------------------------------------
   1. MAPEAMENTO PURO DE MOTIVOS E CONTRATO DO BANCO (C1/C2)
   ---------------------------------------------------------------- */
describe("motivoRetiradaPorResposta — mapeamento fechado e invariantes C1", () => {
  it("mapeia todos os 6 motivos de MOTIVOS_PERDA_IA corretamente", () => {
    expect(motivoRetiradaPorResposta("Imóvel já alugado por conta própria", "Já aluguei direto")).toEqual({
      motivo: "locado-proprietario",
      observacao: null,
    });
    expect(motivoRetiradaPorResposta("Imóvel já vendido", "Acabei vendendo a casa")).toEqual({
      motivo: "vendido",
      observacao: null,
    });
    expect(motivoRetiradaPorResposta("Proprietário desistiu de alugar", "Não vou mais alugar")).toEqual({
      motivo: "desistiu",
      observacao: null,
    });
    expect(motivoRetiradaPorResposta("Não é mais o proprietário", "Não sou mais o dono")).toEqual({
      motivo: "nao-e-mais-proprietario",
      observacao: null,
    });
    expect(
      motivoRetiradaPorResposta("Optou por outra imobiliária", "Já foi alugado por outra imobiliária"),
    ).toEqual({
      motivo: "locado-outra-imobiliaria",
      observacao: null,
    });
    expect(
      motivoRetiradaPorResposta(
        "Optou por outra imobiliária",
        "Já assinei exclusividade vigente com outra imobiliária",
      ),
    ).toEqual({
      motivo: "outro",
      observacao: "Exclusividade vigente com outra imobiliária",
    });
    expect(
      motivoRetiradaPorResposta(MOTIVO_PERDA_IMOVEL_INDISPONIVEL, "O imóvel não está mais disponível"),
    ).toEqual({
      motivo: "outro",
      observacao: "Imóvel não está mais disponível",
    });
  });

  it("todo motivo de MOTIVOS_PERDA_IA (e até um fallback desconhecido) passa na validação C1/C2", () => {
    for (const motivoIa of [...MOTIVOS_PERDA_IA, "Motivo inesperado futuro"]) {
      const mapeado = motivoRetiradaPorResposta(motivoIa, "texto qualquer");
      expect(ehMotivoRetirada(mapeado.motivo)).toBe(true);
      if (mapeado.motivo === "outro") {
        expect(mapeado.observacao?.trim().length).toBeGreaterThan(0);
      }
      if (mapeado.observacao !== null) {
        expect(tamanhoObservacaoRetirada(mapeado.observacao)).toBeLessThanOrEqual(LIMITE_OBSERVACAO_RETIRADA);
      }
      const validacao = validarRetirada(
        { motivo: mapeado.motivo, observacao: mapeado.observacao ?? "", data: HOJE_BRASILIA },
        "criar",
        HOJE_BRASILIA,
      );
      expect(validacao.ok).toBe(true);
    }
  });
});

/* ----------------------------------------------------------------
   2. DECISÃO PURA: RETIRADA (CAPTADO) vs PERDIDO (LEAD)
   ---------------------------------------------------------------- */
describe("encerramentoPorResposta — C4 (retirada para captado, Perdido para lead)", () => {
  it("retira da carteira imóveis em Angariado, Autorização assinada e Publicado", () => {
    const casos = [
      { status: "Angariado", statusHistory: HIST_CAPTADO },
      // Autorização assinada prova captação ganha mesmo sem Angariado no histórico (integração externa).
      { status: "Autorização assinada", statusHistory: [{ status: "Documentação", date: "2026-08-05" }] },
      { status: "Publicado", statusHistory: [...HIST_CAPTADO, { status: "Publicado", date: "2026-08-15" }] },
    ];

    for (const imovel of casos) {
      const r = encerramentoPorResposta(
        { ...imovel, retirado: false },
        "Imóvel já alugado por conta própria",
        HOJE_UTC,
        { textoMensagem: "Já aluguei por conta própria", hojeBrasilia: HOJE_BRASILIA },
      );
      expect(r).toEqual({
        acao: "retirar",
        retirado: true,
        retiradoEm: HOJE_BRASILIA,
        retiradoMotivo: "locado-proprietario",
        retiradoObservacao: null,
      });
    }
  });

  it("usa a data civil de Brasília (hojeBrasilia) em retiradoEm mesmo quando UTC já virou o dia", () => {
    const r = encerramentoPorResposta(
      { status: "Angariado", statusHistory: HIST_CAPTADO, retirado: false },
      "Imóvel já vendido",
      HOJE_UTC,
      { textoMensagem: "Vendi ontem", hojeBrasilia: HOJE_BRASILIA },
    );
    expect(r?.acao).toBe("retirar");
    if (r?.acao === "retirar") {
      expect(r.retiradoEm).toBe(HOJE_BRASILIA);
      expect(r.retiradoEm).not.toBe(HOJE_UTC);
    }
  });

  it("leads NÃO captados continuam encerrando como Perdido (regressão)", () => {
    for (const status of ["Novo contato", "Visita agendada", "Em negociação", "Documentação", "Sem resposta"]) {
      const hist = [{ status, date: "2026-09-01" }];
      const r = encerramentoPorResposta(
        { status, statusHistory: hist, retirado: false },
        "Imóvel já alugado por conta própria",
        HOJE_UTC,
        { textoMensagem: "Já aluguei", hojeBrasilia: HOJE_BRASILIA },
      );
      expect(r).toEqual({
        acao: "encerrar",
        status: "Perdido",
        motivoPerda: "Imóvel já alugado por conta própria",
        statusHistory: [...hist, { status: "Perdido", date: HOJE_UTC }],
      });
    }
  });

  it("notaDoEncerramento explica retirada automática e aponta para reativação no cadastro", () => {
    const nota = notaDoEncerramento(
      "MSG42",
      {
        acao: "retirar",
        retirado: true,
        retiradoEm: HOJE_BRASILIA,
        retiradoMotivo: "outro",
        retiradoObservacao: "Exclusividade vigente com outra imobiliária",
      },
      "2026-10-15T22:30",
    );
    expect(nota.id).toBe("wa:MSG42:encerrado");
    expect(nota.texto).toContain("retirado da carteira automaticamente");
    expect(nota.texto).toContain("Outro — Exclusividade vigente com outra imobiliária");
    expect(nota.texto).toContain("reative o imóvel no cadastro");
  });
});

/* ----------------------------------------------------------------
   3. ROTA DO WEBHOOK END-TO-END (MOCK DO BANCO EM MEMÓRIA)
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

const CONTA = "conta-c4";
const SEGREDO = "segredo-c4";
const TEL = "4399990044";

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
  afetadas: number;
}

function clienteFalso(banco: Banco, opcoes: { antesDoUpdateImovel?: () => void } = {}) {
  const updates: Escrita[] = [];

  function tabela(nome: string) {
    const eq: [string, unknown][] = [];
    const inn: [string, unknown[]][] = [];
    const is: [string, unknown][] = [];
    const gte: [string, string][] = [];
    const nots: [string, string, unknown][] = [];
    let colunas: string[] | null = null;
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

    const projetar = (l: Linha): Linha =>
      colunas ? Object.fromEntries(colunas.map((c) => [c, structuredClone(l[c])])) : structuredClone(l);

    const executar = (): { data: unknown; error: unknown } => {
      if (payloadUpdate) {
        if (nome === "imoveis" && ("retirado" in payloadUpdate || "status" in payloadUpdate)) {
          opcoes.antesDoUpdateImovel?.();
        }
        const alvo = linhas();
        updates.push({ tabela: nome, payload: structuredClone(payloadUpdate), afetadas: alvo.length });
        for (const l of alvo) Object.assign(l, payloadUpdate);
        return { data: alvo.map(projetar), error: null };
      }
      return { data: linhas().map(projetar), error: null };
    };

    const chain = {
      select: (lista?: string) => {
        if (lista && lista.trim() !== "*") colunas = lista.split(",").map((c) => c.trim()).filter(Boolean);
        return chain;
      },
      eq: (c: string, v: unknown) => (eq.push([c, v]), chain),
      in: (c: string, v: unknown[]) => (inn.push([c, v]), chain),
      is: (c: string, v: unknown) => (is.push([c, v]), chain),
      not: (c: string, op: string, v: unknown) => (nots.push([c, op, v]), chain),
      gte: (c: string, v: string) => (gte.push([c, v]), chain),
      order: () => chain,
      limit: () => chain,
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
    cliente: {
      from: (nome: string) => tabela(nome),
      rpc: async (nome: string, args: Record<string, unknown>) => {
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
          return { data: { ok: true, repetido: false, agendaIds: [] }, error: null };
        }
        return { data: null, error: null };
      },
    },
  };
}

function criarBanco(imovelExtra: Linha = {}): Banco {
  return {
    whatsapp_instancias: [{ instancia: "inst-c4", user_id: CONTA }],
    imoveis: [
      {
        id: "imovel-c4",
        user_id: CONTA,
        codigo: "LD-900",
        endereco: "Rua das Palmeiras, 100",
        proprietario_nome: "Maria Proprietária",
        status: "Publicado",
        retirado: false,
        retirado_em: null,
        retirado_motivo: null,
        retirado_observacao: null,
        motivo_perda: null,
        motivo_perda_outro: null,
        tentativas: [],
        status_history: structuredClone(HIST_CAPTADO),
        notas: [],
        proprietario_telefone_canonico: TEL,
        updated_at: "2026-10-01T12:00:00Z",
        ...imovelExtra,
      },
    ],
    contatos_telefones: [{ contato_id: "c-c4", user_id: CONTA, telefone_canonico: TEL }],
    contatos: [{ id: "c-c4", user_id: CONTA, nome: "Maria Proprietária" }],
    imoveis_contatos: [{ imovel_id: "imovel-c4", contato_id: "c-c4", user_id: CONTA, encerrado_em: null }],
    mensagens_agendadas: [],
    agenda: [],
  };
}

async function enviarWebhook(banco: Banco, texto: string, opcoes: { antesDoUpdateImovel?: () => void } = {}) {
  const falso = clienteFalso(banco, opcoes);
  mocks.createClient.mockReturnValue(falso.cliente);
  const resposta = await POST(
    new Request("http://localhost/api/whatsapp/webhook", {
      method: "POST",
      headers: { "x-webhook-secret": SEGREDO, "Content-Type": "application/json" },
      body: JSON.stringify({
        event: "messages.upsert",
        instance: "inst-c4",
        data: {
          key: { id: "MSG-C4", remoteJid: "5543999990044@s.whatsapp.net", fromMe: false },
          message: { conversation: texto },
          messageType: "conversation",
        },
      }),
    }),
    { params: Promise.resolve({ segredo: [] }) },
  );
  return { resposta, updates: falso.updates };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.registrarEvento.mockReset();
  mocks.transcreverAudio.mockReset();
  vi.stubEnv("EVOLUTION_WEBHOOK_SECRET", SEGREDO);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://projeto.invalid");
  vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-role-teste");
  vi.stubEnv("OPENAI_API_KEY", "");
});

describe("webhook POST — C4 retirada automática na carteira", () => {
  it("imóvel Publicado + 'já foi alugado por outra imobiliária': marca retirado sem tocar em status/status_history", async () => {
    const banco = criarBanco({ status: "Publicado", status_history: [...HIST_CAPTADO, { status: "Publicado", date: "2026-08-20" }] });
    mocks.classificarResposta.mockResolvedValue({
      resultado: "recusou",
      resumo: "Alugado por outra imobiliária",
      motivoPerda: "Optou por outra imobiliária",
      retomarEm: "2026-12-01",
    });

    const { resposta, updates } = await enviarWebhook(banco, "Já foi alugado por outra imobiliária ontem.");
    expect(resposta.status).toBe(200);

    const linha = banco.imoveis[0];
    const hojeBrasiliaEsperado = dataOperacionalDeTimestamp(agoraTimestamp());
    expect(linha.retirado).toBe(true);
    expect(linha.retirado_em).toBe(hojeBrasiliaEsperado);
    expect(linha.retirado_motivo).toBe("locado-outra-imobiliaria");
    expect(linha.retirado_observacao).toBeNull();
    // Status, histórico e motivo_perda permanecem intactos!
    expect(linha.status).toBe("Publicado");
    expect(linha.status_history).toEqual([...HIST_CAPTADO, { status: "Publicado", date: "2026-08-20" }]);
    expect(linha.motivo_perda).toBeNull();

    // Update gravou apenas colunas de retirada, nunca `status`.
    expect(updates).toHaveLength(1);
    expect(updates[0].payload).toEqual({
      retirado: true,
      retirado_em: hojeBrasiliaEsperado,
      retirado_motivo: "locado-outra-imobiliaria",
      retirado_observacao: null,
    });

    // Nota explicativa gravada e agenda não criada.
    const notas = (linha.notas as Linha[]) || [];
    const notaEncerramento = notas.find((n) => n.id === "wa:MSG-C4:encerrado");
    expect(notaEncerramento).toBeDefined();
    expect(String(notaEncerramento?.texto)).toContain("retirado da carteira automaticamente");
    expect(String(notaEncerramento?.texto)).toContain("Locado por outra imobiliária");
    expect(banco.agenda).toHaveLength(0);
  });

  it("imóvel em Autorização assinada (sem Angariado no histórico) também é retirado automaticamente", async () => {
    const banco = criarBanco({
      status: "Autorização assinada",
      status_history: [{ status: "Documentação", date: "2026-09-01" }],
    });
    mocks.classificarResposta.mockResolvedValue({
      resultado: "recusou",
      resumo: "Desistiu de alugar",
      motivoPerda: "Proprietário desistiu de alugar",
      retomarEm: null,
    });

    const { resposta } = await enviarWebhook(banco, "Desisti de alugar, vou morar lá.");
    expect(resposta.status).toBe(200);
    expect(banco.imoveis[0].retirado).toBe(true);
    expect(banco.imoveis[0].retirado_motivo).toBe("desistiu");
    expect(banco.imoveis[0].status).toBe("Autorização assinada");
  });

  it("imóvel Angariado + exclusividade vigente com outra imobiliária grava motivo 'outro' com observação obrigatória", async () => {
    const banco = criarBanco({ status: "Angariado" });
    mocks.classificarResposta.mockResolvedValue({
      resultado: "recusou",
      resumo: "Exclusividade vigente",
      motivoPerda: "Optou por outra imobiliária",
      retomarEm: null,
    });

    const { resposta } = await enviarWebhook(banco, "Já tenho exclusividade vigente com outra imobiliária.");
    expect(resposta.status).toBe(200);
    expect(banco.imoveis[0]).toMatchObject({
      retirado: true,
      retirado_motivo: "outro",
      retirado_observacao: "Exclusividade vigente com outra imobiliária",
      status: "Angariado",
      motivo_perda: null,
    });
  });

  it("lead em Em negociação (não captado) continua virando Perdido com motivo_perda", async () => {
    const histLead = [{ status: "Novo contato", date: "2026-09-01" }, { status: "Em negociação", date: "2026-09-05" }];
    const banco = criarBanco({ status: "Em negociação", status_history: structuredClone(histLead) });
    mocks.classificarResposta.mockResolvedValue({
      resultado: "recusou",
      resumo: "Já alugou",
      motivoPerda: "Imóvel já alugado por conta própria",
      retomarEm: null,
    });

    const { resposta } = await enviarWebhook(banco, "Já aluguei por conta própria.");
    expect(resposta.status).toBe(200);
    expect(banco.imoveis[0].status).toBe("Perdido");
    expect(banco.imoveis[0].retirado).toBe(false);
    expect(banco.imoveis[0].motivo_perda).toBe("Imóvel já alugado por conta própria");
    expect((banco.imoveis[0].status_history as Linha[]).length).toBe(3);
  });

  it("retirada manual concorrente durante o webhook não é sobrescrita pela retirada automática", async () => {
    const banco = criarBanco({ status: "Angariado" });
    mocks.classificarResposta.mockResolvedValue({
      resultado: "recusou",
      resumo: "Já alugou",
      motivoPerda: "Imóvel já alugado por conta própria",
      retomarEm: null,
    });

    const { updates } = await enviarWebhook(banco, "Já aluguei.", {
      antesDoUpdateImovel: () => {
        banco.imoveis[0].retirado = true;
        banco.imoveis[0].retirado_em = "2026-10-10";
        banco.imoveis[0].retirado_motivo = "vendido";
        banco.imoveis[0].retirado_observacao = "Retirado manualmente pelo corretor";
      },
    });

    expect(updates).toHaveLength(1);
    expect(updates[0].afetadas).toBe(0);
    expect(banco.imoveis[0]).toMatchObject({
      retirado: true,
      retirado_em: "2026-10-10",
      retirado_motivo: "vendido",
      retirado_observacao: "Retirado manualmente pelo corretor",
      status: "Angariado",
    });
    const notas = (banco.imoveis[0].notas as Linha[]) || [];
    expect(notas.some((n) => n.id === "wa:MSG-C4:encerrado")).toBe(false);
  });
});
