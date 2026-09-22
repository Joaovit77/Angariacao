import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";

import {
  MAX_SALTOS_FUSAO,
  classificarComparacao,
  resolverContatoSobrevivente,
  type ContatoParaResolucao,
} from "@/lib/calculo/resolucaoContato";
import {
  detalheDoEvento,
  eventoDaObservacao,
  observarAtribuicao,
  type ObservacaoShadow,
} from "@/lib/servidor/contatos";

/* Fase 1a-C1 — o shadow da atribuição.

   O que estes testes protegem, em ordem de importância: (1) o resultado
   novo NÃO decide nada — o webhook continua com o imóvel legado; (2) uma
   falha do observador não derruba o observado; (3) nenhuma consulta escapa
   do `user_id`; (4) nada de PII sai no log. O acerto da resolução em si já
   é coberto por `atribuicao-mensagem.test.ts`; aqui o alvo é a integração
   e a fronteira. */

const CONTA = "conta-a";
const OUTRA = "conta-b";
const RECEBIDA = "2026-09-22T10:00:00";
/** O repo grava com `text=auto`: normalizar é o que faz a asserção
    estrutural valer nas duas plataformas. */
function lerFonte(relativo: string): string {
  return readFileSync(new URL(relativo, import.meta.url), "utf8").replace(/\r\n/g, "\n");
}
/** Só o código: a prosa dos comentários fala de `updated_at` justamente
    para explicar por que ele saiu da decisão. */
function semComentarios(fonte: string): string {
  return fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}
const ROTA = lerFonte("../app/api/whatsapp/webhook/[[...segredo]]/route.ts");
const SERVIDOR = lerFonte("../lib/servidor/contatos.ts");

/* ----------------------------------------------------------------
   Cliente falso: devolve, por tabela, a resposta preparada, e guarda os
   filtros aplicados para os testes de tenant.
   ---------------------------------------------------------------- */
type Resposta = { data: unknown; error: unknown };

function consulta(resposta: Resposta, registro: { tabela: string; filtros: Record<string, unknown> }[]) {
  const filtros: Record<string, unknown> = {};
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn((coluna: string, valor: unknown) => {
      filtros[coluna] = valor;
      return chain;
    }),
    is: vi.fn((coluna: string, valor: unknown) => {
      filtros[`${coluna}:is`] = valor;
      return chain;
    }),
    in: vi.fn((coluna: string, valor: unknown) => {
      filtros[`${coluna}:in`] = valor;
      return chain;
    }),
    gte: vi.fn((coluna: string, valor: unknown) => {
      filtros[`${coluna}:gte`] = valor;
      return chain;
    }),
    limit: vi.fn(() => chain),
    maybeSingle: vi.fn(async () => resposta),
    then: (resolver: (r: Resposta) => unknown, rejeitar?: (e: unknown) => unknown) =>
      Promise.resolve(resposta).then(resolver, rejeitar),
  };
  return { chain, filtros, registro };
}

/* Uma TABELA falsa, não uma resposta fixa: aplica os `eq` pedidos e
   respeita o `limit`, como o banco faria. É o que permite reproduzir o
   defeito de Production — ler N linhas quaisquer e esperar que o contato
   certo esteja entre elas depende da POSIÇÃO da linha, e só um fake que
   tenha posição mostra isso. */
type LinhaContato = { id: string; user_id: string; fundido_em_contato_id: string | null };
const CONTATO_PADRAO: LinhaContato = { id: "contato-1", user_id: CONTA, fundido_em_contato_id: null };

function consultaTabela(linhas: readonly LinhaContato[]) {
  const filtros: Record<string, unknown> = {};
  const iguais: [string, unknown][] = [];
  let teto: number | null = null;
  const aplicar = () => {
    const casam = linhas.filter((linha) =>
      iguais.every(([coluna, valor]) => (linha as unknown as Record<string, unknown>)[coluna] === valor),
    );
    return teto === null ? casam : casam.slice(0, teto);
  };
  const chain = {
    select: vi.fn(() => chain),
    eq: vi.fn((coluna: string, valor: unknown) => {
      filtros[coluna] = valor;
      iguais.push([coluna, valor]);
      return chain;
    }),
    is: vi.fn((coluna: string, valor: unknown) => {
      filtros[`${coluna}:is`] = valor;
      return chain;
    }),
    in: vi.fn(() => chain),
    gte: vi.fn(() => chain),
    limit: vi.fn((n: number) => {
      teto = n;
      return chain;
    }),
    maybeSingle: vi.fn(async () => ({ data: aplicar()[0] ?? null, error: null })),
    then: (resolver: (r: Resposta) => unknown, rejeitar?: (e: unknown) => unknown) =>
      Promise.resolve({ data: aplicar(), error: null } as Resposta).then(resolver, rejeitar),
  };
  return { chain, filtros };
}

interface Cenario {
  canal?: Resposta;
  contatos?: Resposta;
  /** Quando presente, `contatos` vira tabela de verdade (com posição). */
  contatosTabela?: readonly LinhaContato[];
  vinculos?: Resposta;
  imoveis?: Resposta;
  mensagens_agendadas?: Resposta;
}

function clienteFalso(cenario: Cenario) {
  const chamadas: { tabela: string; filtros: Record<string, unknown> }[] = [];
  const padrao: Record<string, Resposta> = {
    contatos_telefones: cenario.canal ?? { data: { contato_id: "contato-1" }, error: null },
    // Só usado quando o cenário injeta erro; o caminho normal vai à tabela.
    contatos: cenario.contatos ?? { data: null, error: null },
    imoveis_contatos: cenario.vinculos ?? { data: [{ imovel_id: "a" }], error: null },
    imoveis: cenario.imoveis ?? {
      data: [{ id: "a", user_id: CONTA, codigo: "LD-1", status: "Novo contato", retirado: false, tentativas: [] }],
      error: null,
    },
    mensagens_agendadas: cenario.mensagens_agendadas ?? { data: [], error: null },
  };
  return {
    chamadas,
    cliente: {
      from: vi.fn((tabela: string) => {
        // `contatos` é tabela (tem posição); as outras seguem resposta fixa.
        // O cenário `contatos` explícito existe só para injetar erro.
        if (tabela === "contatos" && !cenario.contatos) {
          const t = consultaTabela(cenario.contatosTabela ?? [CONTATO_PADRAO]);
          chamadas.push({ tabela, filtros: t.filtros });
          return t.chain;
        }
        const c = consulta(padrao[tabela] ?? { data: [], error: null }, chamadas);
        chamadas.push({ tabela, filtros: c.filtros });
        return c.chain;
      }),
    },
  };
}

function observar(cenario: Cenario = {}, extra: Record<string, unknown> = {}) {
  const { cliente, chamadas } = clienteFalso(cenario);
  const promessa = observarAtribuicao(cliente as never, {
    userId: CONTA,
    telefoneCanonico: "4399990001",
    texto: "oi",
    recebidaEm: RECEBIDA,
    legadoImovelId: "a",
    direcao: "recebida",
    ...extra,
  });
  return { promessa, chamadas, cliente };
}

/* ================================================================
   1-3. RESOLUÇÃO DO CANAL
   ================================================================ */
describe("1-3. canal ativo resolve o contato", () => {
  it("1. canal relacional resolve contato e o shadow compara com o legado", async () => {
    const o = await observar().promessa;
    expect(o).toMatchObject({ categoria: "concordante", contatoId: "contato-1", novoImovelId: "a", nivel: "unico" });
  });

  it("2-3. toda consulta filtra user_id; canal desativado/de outra conta não resolve", async () => {
    const { promessa, chamadas } = observar();
    await promessa;
    for (const chamada of chamadas) {
      expect(chamada.filtros.user_id, `${chamada.tabela} sem filtro de user_id`).toBe(CONTA);
    }
    const canal = chamadas.find((c) => c.tabela === "contatos_telefones")!;
    expect(canal.filtros["desativado_em:is"]).toBeNull(); // só canal ativo
    const vinculo = chamadas.find((c) => c.tabela === "imoveis_contatos")!;
    expect(vinculo.filtros["encerrado_em:is"]).toBeNull(); // só vínculo vigente

    // Sem linha de canal (desativado ou de outra conta) → sem contato relacional.
    const semCanal = await observar({ canal: { data: null, error: null } }).promessa;
    expect(semCanal).toMatchObject({ categoria: "sem-contato-relacional", contatoId: null });
  });
});

/* ================================================================
   4-7. LÁPIDE (pura)
   ================================================================ */
describe("4-7. lápide de fusão", () => {
  const mapa = (...contatos: ContatoParaResolucao[]) =>
    new Map(contatos.map((c) => [c.id, c]));

  it("4. um salto chega ao sobrevivente", () => {
    const r = resolverContatoSobrevivente(
      "absorvido",
      CONTA,
      mapa(
        { id: "absorvido", userId: CONTA, fundidoEmContatoId: "vivo" },
        { id: "vivo", userId: CONTA, fundidoEmContatoId: null },
      ),
    );
    expect(r).toEqual({ ok: true, contatoId: "vivo", saltos: 1 });
  });

  it("5. N saltos seguem a cadeia inteira", () => {
    const cadeia = ["c0", "c1", "c2", "c3", "c4"];
    const r = resolverContatoSobrevivente(
      "c0",
      CONTA,
      mapa(...cadeia.map((id, i) => ({ id, userId: CONTA, fundidoEmContatoId: cadeia[i + 1] ?? null }))),
    );
    expect(r).toEqual({ ok: true, contatoId: "c4", saltos: 4 });
  });

  it("6. ciclo falha de forma segura, sem laço infinito", () => {
    const r = resolverContatoSobrevivente(
      "a",
      CONTA,
      mapa(
        { id: "a", userId: CONTA, fundidoEmContatoId: "b" },
        { id: "b", userId: CONTA, fundidoEmContatoId: "a" },
      ),
    );
    expect(r).toMatchObject({ ok: false, falha: "ciclo" });
  });

  it("6b. cadeia mais funda que o teto falha em vez de continuar", () => {
    const ids = Array.from({ length: MAX_SALTOS_FUSAO + 3 }, (_, i) => `c${i}`);
    const r = resolverContatoSobrevivente(
      "c0",
      CONTA,
      mapa(...ids.map((id, i) => ({ id, userId: CONTA, fundidoEmContatoId: ids[i + 1] ?? null }))),
    );
    expect(r).toMatchObject({ ok: false, falha: "profundidade-excedida" });
  });

  it("7. sobrevivente de outra conta falha (tenant nunca é atravessado)", () => {
    const r = resolverContatoSobrevivente(
      "a",
      CONTA,
      mapa(
        { id: "a", userId: CONTA, fundidoEmContatoId: "z" },
        { id: "z", userId: OUTRA, fundidoEmContatoId: null },
      ),
    );
    expect(r).toMatchObject({ ok: false, falha: "tenant-divergente" });
  });

  it("7b. alvo ausente do conjunto carregado falha", () => {
    const r = resolverContatoSobrevivente("a", CONTA, mapa({ id: "a", userId: CONTA, fundidoEmContatoId: "sumiu" }));
    expect(r).toMatchObject({ ok: false, falha: "contato-ausente" });
  });

  it("a falha de lápide vira observação, não exceção", async () => {
    const o = await observar({
      contatosTabela: [{ id: "contato-1", user_id: CONTA, fundido_em_contato_id: "contato-1" }],
    }).promessa;
    expect(o).toMatchObject({ categoria: "falha", falha: "lapide-ciclo" });
  });
});

/* ================================================================
   7c-7k. A CADEIA VEM DO BANCO PELO ID — REGRESSÃO DE PRODUCTION

   A 1a-C1 subiu carregando `contatos` com `.eq("user_id").limit(20)` e
   procurando o contato do canal ali dentro. Numa conta com 331 contatos, o
   contato certo ficou fora das 20 linhas: três mensagens orgânicas viraram
   `lapide-contato-ausente` no primeiro dia. O legado seguiu normal (o
   shadow não tem autoridade), mas a medição não saiu do lugar.

   Estes testes fixam a semântica da CONSULTA, não do objeto em memória: a
   tabela falsa tem posição, e ler uma página nunca mais pode substituir
   perguntar pelo id.
   ================================================================ */
describe("7c-7k. a travessia busca por identidade, não por página", () => {
  /** Uma conta grande, com o contato do canal propositalmente longe do
      começo — exatamente a forma do caso de Production. */
  function contaGrande(alvo: LinhaContato, posicao = 23): LinhaContato[] {
    const outros = Array.from({ length: 30 }, (_, i) => ({
      id: `outro-${i}`,
      user_id: CONTA,
      fundido_em_contato_id: null,
    }));
    return [...outros.slice(0, posicao), alvo, ...outros.slice(posicao)];
  }

  it("7c. REGRESSÃO: contato fora das primeiras 20 linhas ainda resolve", async () => {
    const { promessa, chamadas } = observar({
      contatosTabela: contaGrande(CONTATO_PADRAO),
    });
    const o = await promessa;
    // Com `.limit(20)` isto dava `lapide-contato-ausente`.
    expect(o).toMatchObject({ categoria: "concordante", contatoId: "contato-1", novoImovelId: "a", saltos: 0 });
    expect(o.falha).toBeUndefined();
    // E a consulta perguntou pelo id, com o tenant explícito.
    const busca = chamadas.find((c) => c.tabela === "contatos")!;
    expect(busca.filtros.id).toBe("contato-1");
    expect(busca.filtros.user_id).toBe(CONTA);
  });

  it("7d. o caminho sem lápide custa UMA consulta a contatos", async () => {
    const { promessa, chamadas } = observar({ contatosTabela: contaGrande(CONTATO_PADRAO) });
    await promessa;
    expect(chamadas.filter((c) => c.tabela === "contatos")).toHaveLength(1);
  });

  it("7e. um salto: cada lápide custa exatamente uma busca a mais", async () => {
    const { promessa, chamadas } = observar({
      contatosTabela: contaGrande({ id: "contato-1", user_id: CONTA, fundido_em_contato_id: "vivo" }).concat([
        { id: "vivo", user_id: CONTA, fundido_em_contato_id: null },
      ]),
    });
    const o = await promessa;
    expect(o).toMatchObject({ categoria: "concordante", contatoId: "vivo", saltos: 1 });
    expect(chamadas.filter((c) => c.tabela === "contatos")).toHaveLength(2);
  });

  it("7f. N saltos seguem a cadeia inteira, mesmo espalhada pela tabela", async () => {
    const cadeia: LinhaContato[] = ["contato-1", "c1", "c2", "c3", "vivo"].map((id, i, todos) => ({
      id,
      user_id: CONTA,
      fundido_em_contato_id: todos[i + 1] ?? null,
    }));
    // Ordem invertida: se a posição importasse, isto quebraria.
    const o = await observar({ contatosTabela: [...contaGrande(cadeia[0]!), ...cadeia.slice(1).reverse()] }).promessa;
    expect(o).toMatchObject({ categoria: "concordante", contatoId: "vivo", saltos: 4 });
  });

  it("7g. o teto de 8 saltos é respeitado: 8 resolve, 9 falha", async () => {
    const monta = (tamanho: number): LinhaContato[] =>
      Array.from({ length: tamanho + 1 }, (_, i) => ({
        id: i === 0 ? "contato-1" : `c${i}`,
        user_id: CONTA,
        fundido_em_contato_id: i === tamanho ? null : `c${i + 1}`,
      }));
    const oito = await observar({ contatosTabela: monta(MAX_SALTOS_FUSAO) }).promessa;
    expect(oito).toMatchObject({ contatoId: `c${MAX_SALTOS_FUSAO}`, saltos: MAX_SALTOS_FUSAO });
    const nove = await observar({ contatosTabela: monta(MAX_SALTOS_FUSAO + 1) }).promessa;
    expect(nove).toMatchObject({ categoria: "falha", falha: "lapide-profundidade-excedida" });
  });

  it("7h. ciclo no banco para a busca em vez de girar", async () => {
    const { promessa, chamadas } = observar({
      contatosTabela: [
        { id: "contato-1", user_id: CONTA, fundido_em_contato_id: "b" },
        { id: "b", user_id: CONTA, fundido_em_contato_id: "contato-1" },
      ],
    });
    expect(await promessa).toMatchObject({ categoria: "falha", falha: "lapide-ciclo" });
    expect(chamadas.filter((c) => c.tabela === "contatos").length).toBeLessThanOrEqual(MAX_SALTOS_FUSAO + 1);
  });

  it("7i. alvo da lápide inexistente falha seguro", async () => {
    const o = await observar({
      contatosTabela: [{ id: "contato-1", user_id: CONTA, fundido_em_contato_id: "sumiu" }],
    }).promessa;
    expect(o).toMatchObject({ categoria: "falha", falha: "lapide-contato-ausente", saltos: 1 });
  });

  it("7j. contato do canal inexistente falha seguro (e não vira candidato)", async () => {
    const o = await observar({ contatosTabela: [] }).promessa;
    expect(o).toMatchObject({ categoria: "falha", falha: "lapide-contato-ausente", saltos: 0, candidatos: 0 });
  });

  it("7k. alvo de outra conta não é alcançado: o filtro de tenant é da consulta", async () => {
    const o = await observar({
      contatosTabela: [
        { id: "contato-1", user_id: CONTA, fundido_em_contato_id: "z" },
        { id: "z", user_id: OUTRA, fundido_em_contato_id: null },
      ],
    }).promessa;
    // A linha existe na tabela, mas é de `conta-b`: o `eq("user_id")` a
    // esconde, e a travessia para em vez de atravessar o tenant.
    expect(o).toMatchObject({ categoria: "falha", falha: "lapide-contato-ausente" });
  });
});

/* ================================================================
   8-14. CANDIDATOS E AGENDAMENTOS
   ================================================================ */
describe("8-14. candidatos e contextos alimentam o motor", () => {
  it("8. contato sem vínculos vigentes → sem-candidatos", async () => {
    const o = await observar({ vinculos: { data: [], error: null } }).promessa;
    expect(o).toMatchObject({ categoria: "novo-sem-candidatos", candidatos: 0, terminais: 0 });
  });

  it("9-10. vínculo encerrado é filtrado na consulta e o vigente vira candidato", async () => {
    const { promessa, chamadas } = observar({ vinculos: { data: [{ imovel_id: "a" }], error: null } });
    const o = await promessa;
    expect(chamadas.find((c) => c.tabela === "imoveis_contatos")!.filtros["encerrado_em:is"]).toBeNull();
    expect(o.candidatos).toBe(1);
  });

  it("11. os imóveis carregados alimentam o motor (e o resultado reflete o status)", async () => {
    const o = await observar({
      vinculos: { data: [{ imovel_id: "a" }, { imovel_id: "t" }], error: null },
      imoveis: {
        data: [
          { id: "a", user_id: CONTA, codigo: "LD-1", status: "Sem resposta", retirado: false, tentativas: [] },
          { id: "t", user_id: CONTA, codigo: "LD-2", status: "Locado", retirado: false, tentativas: [] },
        ],
        error: null,
      },
    }).promessa;
    // 34. "Sem resposta" continua plausível; 35. o terminal só é observado.
    expect(o).toMatchObject({ categoria: "concordante", novoImovelId: "a", nivel: "unico", candidatos: 1, terminais: 1 });
  });

  it("12-14. agendamento entra por imovel_id e por imoveis_consultados, com a janela ancorada na mensagem", async () => {
    const dois = {
      vinculos: { data: [{ imovel_id: "a" }, { imovel_id: "b" }], error: null },
      imoveis: {
        data: [
          { id: "a", user_id: CONTA, codigo: null, status: "Publicado", retirado: false, tentativas: [] },
          { id: "b", user_id: CONTA, codigo: null, status: "Publicado", retirado: false, tentativas: [] },
        ],
        error: null,
      },
    };
    // 12. por imovel_id
    const porImovel = await observar({
      ...dois,
      mensagens_agendadas: {
        data: [{ imovel_id: "a", imoveis_consultados: null, enviado_em: "2026-09-21T18:00:00.000Z" }],
        error: null,
      },
    }).promessa;
    expect(porImovel).toMatchObject({ categoria: "concordante", nivel: "contexto-agendamento", novoImovelId: "a" });

    // 13. por imoveis_consultados (a âncora é de outro imóvel)
    const porConsultados = await observar({
      ...dois,
      mensagens_agendadas: {
        data: [{ imovel_id: "z", imoveis_consultados: ["a"], enviado_em: "2026-09-21T18:00:00.000Z" }],
        error: null,
      },
    }).promessa;
    expect(porConsultados).toMatchObject({ nivel: "contexto-agendamento", novoImovelId: "a" });

    // 14. consolidada cobrindo os dois plausíveis chega inteira ao motor → empate.
    const consolidada = await observar({
      ...dois,
      mensagens_agendadas: {
        data: [{ imovel_id: "a", imoveis_consultados: ["a", "b"], enviado_em: "2026-09-21T18:00:00.000Z" }],
        error: null,
      },
    }).promessa;
    expect(consolidada).toMatchObject({ categoria: "novo-pendente", nivel: "contexto-agendamento" });

    // A consulta recorta a janela pelo instante da mensagem, não pelo relógio.
    const { promessa, chamadas } = observar(dois);
    await promessa;
    const filtro = chamadas.find((c) => c.tabela === "mensagens_agendadas")!.filtros["enviado_em:gte"] as string;
    expect(filtro.startsWith("2026-09-20T")).toBe(true);
  });
});

/* ================================================================
   15-19. COMPARAÇÃO LEGADO × NOVO
   ================================================================ */
describe("15-19. classificação da comparação", () => {
  it("15. legado A / novo A → concordante", () => {
    expect(classificarComparacao("a", { ok: true, imovelId: "a", terminal: false })).toBe("concordante");
  });

  it("16. legado A / novo B → divergente", () => {
    expect(classificarComparacao("a", { ok: true, imovelId: "b", terminal: false })).toBe("divergente");
  });

  it("17. legado A / novo pendente", () => {
    expect(classificarComparacao("a", { ok: false, motivo: "pendente" })).toBe("novo-pendente");
  });

  it("18. legado A / novo sem-candidatos", () => {
    expect(classificarComparacao("a", { ok: false, motivo: "sem-candidatos" })).toBe("novo-sem-candidatos");
  });

  it("19. legado encontrou / relacional ausente → evidência do fallback futuro", async () => {
    const o = await observar({ canal: { data: null, error: null } }).promessa;
    expect(o).toMatchObject({ categoria: "sem-contato-relacional", legadoImovelId: "a", novoImovelId: null });
    expect(classificarComparacao("a", null)).toBe("sem-contato-relacional");
  });

  it("referência a terminal é classificada como histórica, não como divergência", () => {
    expect(classificarComparacao("a", { ok: true, imovelId: "t", terminal: true })).toBe("terminal-historico");
  });
});

/* ================================================================
   20-22. FALHA ABERTA PARA O LEGADO
   ================================================================ */
describe("20-22. o observador nunca derruba o observado", () => {
  it.each([
    ["consulta-canal", { canal: { data: null, error: { message: "boom" } } }],
    ["consulta-contatos", { contatos: { data: null, error: { message: "boom" } } }],
    ["consulta-vinculos", { vinculos: { data: null, error: { message: "boom" } } }],
    ["consulta-imoveis", { imoveis: { data: null, error: { message: "boom" } } }],
    ["consulta-agendamentos", { mensagens_agendadas: { data: null, error: { message: "boom" } } }],
  ])("20. falha de %s vira observação, não exceção", async (esperada, cenario) => {
    const o = await observar(cenario as Cenario).promessa;
    expect(o).toMatchObject({ categoria: "falha", falha: esperada });
  });

  it("21. cliente quebrado (exceção crua) também vira observação", async () => {
    const quebrado = {
      from: () => {
        throw new Error("conexão caiu");
      },
    };
    const o = await observarAtribuicao(quebrado as never, {
      userId: CONTA,
      telefoneCanonico: "4399990001",
      texto: "oi",
      recebidaEm: RECEBIDA,
      legadoImovelId: "a",
      direcao: "recebida",
    });
    expect(o).toMatchObject({ categoria: "falha", falha: "inesperada", legadoImovelId: "a" });
  });

  it("22. a rota isola o observador: after com fallback, try/catch e sem await no fluxo", () => {
    const bloco = ROTA.slice(ROTA.indexOf("SOMBRA DA ATRIBUIÇÃO"), ROTA.indexOf("// Uma saída `fromMe`"));
    expect(bloco).toContain("try {\n    after(observar);\n  } catch {");
    expect(bloco).toContain("void observar()");
    expect(bloco).toMatch(/catch \{[\s\S]*webhook-atribuicao-falhou/);
    expect(bloco).not.toMatch(/await observar\(\)/);
    expect(bloco).not.toMatch(/\breturn\b/); // o shadow não interrompe a rota
  });
});

/* ================================================================
   23-35. FRONTEIRA: O SHADOW NÃO TEM AUTORIDADE
   ================================================================ */
describe("23-35. fronteira da C1", () => {
  it("23-24, 29. a rota não usa o resultado do shadow em nenhuma decisão nem no retorno", () => {
    // O único ponto que menciona o observador é o bloco da sombra.
    const bloco = ROTA.slice(ROTA.indexOf("SOMBRA DA ATRIBUIÇÃO"), ROTA.indexOf("// Uma saída `fromMe`"));
    const fora = (
      ROTA.slice(0, ROTA.indexOf("SOMBRA DA ATRIBUIÇÃO")) + ROTA.slice(ROTA.indexOf("// Uma saída `fromMe`"))
    )
      .split("\n")
      .filter((linha) => /observarAtribuicao|observacao|observar\(/.test(linha));
    // Fora do bloco da sombra, o observador só aparece no import.
    expect(fora.every((linha) => /^\s*(import|})|^\s+observarAtribuicao,$/.test(linha))).toBe(true);
    // Uma única CHAMADA no bloco (as outras menções são comentário).
    expect([...bloco.matchAll(/observarAtribuicao\(/g)]).toHaveLength(1);
    // Nada depois da sombra lê o resultado novo.
    const depois = ROTA.slice(ROTA.indexOf("// Uma saída `fromMe`"));
    expect(depois).not.toMatch(/observacao|novoImovelId|observarAtribuicao/);
  });

  it("25, 32. o imóvel operacional continua vindo do casamento legado", () => {
    expect(ROTA).toContain("const imovel = imoveis[0] as {");
    expect(ROTA).toContain('.order("updated_at", { ascending: false })');
    expect(ROTA).toContain(".limit(2)");
    // A nota continua sendo gravada no imóvel legado.
    expect(ROTA).toContain("p_imovel_id: imovel.id");
    expect(ROTA).toContain("const legadoImovelId = imovel.id;");
  });

  it("26-28. o shadow não escreve dado de negócio: nem imóveis, nem agenda, nem contatos", () => {
    expect(SERVIDOR).not.toMatch(/\.(insert|update|upsert|delete)\(/);
    expect(SERVIDOR).not.toMatch(/\.rpc\(/);
    expect(SERVIDOR).toMatch(/\.select\(/);
  });

  it("30. a resolução nova nunca lê updated_at", () => {
    expect(semComentarios(SERVIDOR)).not.toContain("updated_at");
    expect(semComentarios(lerFonte("../lib/calculo/atribuicaoMensagem.ts"))).not.toContain("updated_at");
  });

  it("31. o shadow chama o motor da 1a-B, não uma segunda heurística", () => {
    expect(SERVIDOR).toContain("resolverAtribuicaoMensagem");
    expect(SERVIDOR).not.toMatch(/order\(|localeCompare\(.*data|Math\.max/);
  });

  it("nenhuma IA ou transcrição extra é disparada pelo shadow", () => {
    expect(SERVIDOR).not.toMatch(/classificarResposta|transcreverAudio|openai|OPENAI/i);
    // A rota continua com UMA única chamada de classificação.
    expect([...ROTA.matchAll(/classificarResposta\(/g)]).toHaveLength(1);
  });

  it("o shadow não carrega notas (custo sem uso nesta fatia)", () => {
    expect(SERVIDOR).not.toMatch(/"notas"|notas,/);
  });

  it("as colunas pedidas ao banco, em execução, são o mínimo do motor — sem notas e sem updated_at", async () => {
    const colunas: string[] = [];
    const espiao = {
      from: (tabela: string) => {
        const chain: Record<string, unknown> = {};
        const dados: Record<string, unknown> = {
          contatos_telefones: { contato_id: "contato-1" },
          contatos: { id: "contato-1", user_id: CONTA, fundido_em_contato_id: null },
          imoveis_contatos: [{ imovel_id: "a" }],
        };
        const resposta = { data: dados[tabela] ?? [], error: null };
        Object.assign(chain, {
          select: (cols: string) => {
            colunas.push(`${tabela}: ${cols}`);
            return chain;
          },
          eq: () => chain,
          is: () => chain,
          in: () => chain,
          gte: () => chain,
          limit: () => chain,
          maybeSingle: async () => resposta,
          then: (r: (x: unknown) => unknown, j?: (e: unknown) => unknown) => Promise.resolve(resposta).then(r, j),
        });
        return chain;
      },
    };
    await observarAtribuicao(espiao as never, {
      userId: CONTA,
      telefoneCanonico: "4399990001",
      texto: "oi",
      recebidaEm: RECEBIDA,
      legadoImovelId: "a",
      direcao: "recebida",
    });
    const deImoveis = colunas.find((c) => c.startsWith("imoveis:")) ?? "";
    expect(colunas.some((c) => c.includes("notas"))).toBe(false);
    expect(colunas.some((c) => c.includes("updated_at"))).toBe(false);
    // O caminho inteiro roda: o shadow chega a `imoveis` e pede o mínimo.
    expect(deImoveis).toContain("tentativas");
    expect(colunas).toContain("contatos: id, user_id, fundido_em_contato_id");
  });

  it("nenhuma consulta do shadow usa página como identidade", () => {
    // O defeito da 1a-C1 foi este: `.limit(20)` em `contatos` e a esperança
    // de que o contato certo estivesse na página. Identidade vem de `eq`.
    expect(semComentarios(SERVIDOR)).not.toMatch(/\.limit\(/);
    expect(semComentarios(SERVIDOR)).not.toMatch(/\.range\(|\.offset\(/);
    expect(SERVIDOR).toContain('.eq("id", atual)');
  });

  it("imóvel de outra conta devolvido pelo banco não entra na resolução", async () => {
    const o = await observar({
      imoveis: {
        data: [{ id: "z", user_id: OUTRA, codigo: null, status: "Publicado", retirado: false, tentativas: [] }],
        error: null,
      },
    }).promessa;
    expect(o).toMatchObject({ categoria: "novo-sem-candidatos", candidatos: 0 });
  });

  it("a C1 não mexe em tipos congelados nem em migrations", () => {
    expect(SERVIDOR).not.toMatch(/from "\.\.\/tipos"/);
    const tipos = readFileSync(new URL("../lib/tipos.ts", import.meta.url), "utf8");
    expect(tipos).not.toMatch(/atribuicao|efeitosPendentes|classificacaoIa/);
  });
});

/* ================================================================
   33. LOG SEM PII
   ================================================================ */
describe("33. observabilidade sem dado pessoal", () => {
  const observacao: ObservacaoShadow = {
    categoria: "divergente",
    contatoId: "contato-1",
    nivel: "contexto-tentativa",
    terminal: false,
    candidatos: 2,
    terminais: 1,
    novoImovelId: "b",
    legadoImovelId: "a",
    direcao: "recebida",
    saltos: 0,
  };

  it("o detalhe tem só contagens, vocabulário fechado e ids técnicos", () => {
    const detalhe = detalheDoEvento(observacao);
    expect(JSON.parse(detalhe)).toEqual({
      categoria: "divergente",
      direcao: "recebida",
      nivel: "contexto-tentativa",
      terminal: false,
      candidatos: 2,
      terminais: 1,
      contato_id: "contato-1",
      legado_imovel_id: "a",
      novo_imovel_id: "b",
    });
    for (const proibido of ["telefone", "nome", "endereco", "mensagem"]) {
      expect(detalhe.toLowerCase()).not.toContain(proibido);
    }
    // Nada com cara de telefone, e nenhum valor longo o bastante para ser
    // texto livre — o vocabulário é fechado e os ids são técnicos.
    expect(detalhe).not.toMatch(/\d{8,}/);
    expect(
      Object.values(JSON.parse(detalhe)).every((v) => typeof v !== "string" || v.length <= 40),
    ).toBe(true);
  });

  it("um evento por mensagem, e falha sobe para aviso", () => {
    expect(eventoDaObservacao(observacao)).toEqual({ evento: "webhook-atribuicao-shadow", nivel: "info" });
    expect(eventoDaObservacao({ ...observacao, categoria: "falha", falha: "motor" })).toEqual({
      evento: "webhook-atribuicao-falhou",
      nivel: "aviso",
    });
    const bloco = ROTA.slice(ROTA.indexOf("SOMBRA DA ATRIBUIÇÃO"), ROTA.indexOf("// Uma saída `fromMe`"));
    expect([...bloco.matchAll(/registrarEvento\(/g)]).toHaveLength(2); // sucesso + rede de segurança
    // O texto da mensagem entra no motor, mas nunca no log.
    expect(SERVIDOR).toMatch(/texto: entrada\.texto|texto: string/);
    expect(detalheDoEvento({ ...observacao, categoria: "falha", falha: "motor" })).toContain('"falha":"motor"');
  });

  it("23. fromMe é observado com a direção marcada, sem mudar o fluxo de saída", async () => {
    const o = await observar({}, { direcao: "enviada" }).promessa;
    expect(o.direcao).toBe("enviada");
    // A rota continua tratando `fromMe` exatamente como antes: grava
    // histórico e retorna, sem efeito e sem depender do shadow.
    const trecho = ROTA.slice(ROTA.indexOf('if (mensagem.direcao === "enviada")'), ROTA.indexOf("3.5. ÁUDIO VIRA TEXTO"));
    expect(trecho).toContain("registrarMensagemEnviada");
    expect(trecho).not.toMatch(/observacao|observarAtribuicao/);
  });
});
