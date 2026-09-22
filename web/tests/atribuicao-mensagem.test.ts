import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { ATRIBUICAO_MENSAGEM } from "@/lib/constantes";
import { DIAS_COBRANCA_RESULTADO } from "@/lib/calculo/abordagens";
import { addDaysISO } from "@/lib/datas";
import {
  STATUS_TERMINAL_ATRIBUICAO,
  codigoServeComoReferencia,
  ehImovelTerminalParaAtribuicao,
  resolverAtribuicaoMensagem,
  textoCitaCodigo,
  type ContextoAgendamento,
  type EntradaAtribuicao,
  type ImovelParaAtribuicao,
  type ResultadoAtribuicao,
} from "@/lib/calculo/atribuicaoMensagem";

/* Fase 1a-B: o motor puro que decide a qual imóvel uma mensagem recebida
   pertence. Os testes cobrem a precedência, os empates (que NÃO descem de
   nível), a fronteira plausível/terminal, o tenant e o determinismo. O motor
   não integra nada: nenhum teste aqui grava, suspende efeito ou move nota. */

const CONTA = "conta-a";
const OUTRA_CONTA = "conta-b";
const RECEBIDA = "2026-09-22T10:00";

function imovel(
  id: string,
  sobrescritas: Partial<ImovelParaAtribuicao> = {},
): ImovelParaAtribuicao {
  return { id, userId: CONTA, status: "Novo contato", ...sobrescritas };
}

/** Tentativa pendente com `dias` de idade em relação a `RECEBIDA`. */
function pendenteHa(dias: number, hora = "09:00") {
  const data = addDaysISO(RECEBIDA.slice(0, 10), -dias);
  return { data: `${data}T${hora}`, aguardandoResultado: true };
}

function resolver(
  vinculos: readonly ImovelParaAtribuicao[],
  extra: Partial<EntradaAtribuicao> = {},
): ResultadoAtribuicao {
  return resolverAtribuicaoMensagem({
    userId: CONTA,
    contatoId: "contato-1",
    mensagem: { texto: "oi, tudo bem?", recebidaEm: RECEBIDA },
    vinculos,
    ...extra,
  });
}

describe("plausível x terminal (semântica exclusiva da atribuição)", () => {
  it("14. 'Sem resposta' continua plausível — é o público do follow-up", () => {
    expect(ehImovelTerminalParaAtribuicao({ status: "Sem resposta" })).toBe(false);
    expect(STATUS_TERMINAL_ATRIBUICAO).not.toContain("Sem resposta");
    const r = resolver([imovel("a", { status: "Sem resposta" })]);
    expect(r).toMatchObject({ ok: true, imovelId: "a", nivel: "unico", terminal: false });
  });

  it.each(["Perdido", "Cancelado", "Locado"])("15-17. %s é terminal", (status) => {
    expect(ehImovelTerminalParaAtribuicao({ status })).toBe(true);
  });

  it("18. retirado = true é terminal mesmo com status vivo", () => {
    expect(ehImovelTerminalParaAtribuicao({ status: "Publicado", retirado: true })).toBe(true);
    expect(ehImovelTerminalParaAtribuicao({ status: "Publicado", retirado: false })).toBe(false);
  });

  it("19. um ativo + vários terminais resolve no ativo pelo N4", () => {
    const r = resolver([
      imovel("ativo", { status: "Publicado" }),
      imovel("t1", { status: "Perdido" }),
      imovel("t2", { status: "Locado" }),
      imovel("t3", { status: "Novo contato", retirado: true }),
    ]);
    expect(r).toMatchObject({ ok: true, imovelId: "ativo", nivel: "unico" });
    if (r.ok) {
      expect(r.candidatos).toEqual(["ativo"]);
      expect(r.terminais).toEqual(["t1", "t2", "t3"]);
    }
  });

  it("20. terminal com tentativa pendente não participa do N2", () => {
    const r = resolver([
      imovel("perdido", { status: "Perdido", tentativas: [pendenteHa(1)] }),
      imovel("ativo-a", { status: "Publicado" }),
      imovel("ativo-b", { status: "Angariado" }),
    ]);
    expect(r).toMatchObject({ ok: false, motivo: "pendente", nivelEmpate: "unico" });
  });

  it("21. terminal com agendamento na janela não participa do N3", () => {
    const r = resolver(
      [
        imovel("locado", { status: "Locado" }),
        imovel("ativo-a", { status: "Publicado" }),
        imovel("ativo-b", { status: "Angariado" }),
      ],
      { agendamentos: [{ enviadoEm: "2026-09-22T08:00", imovelIds: ["locado"] }] },
    );
    expect(r).toMatchObject({ ok: false, motivo: "pendente", nivelEmpate: "unico" });
  });

  it("22. terminal não participa do N4: só terminais devolve sem-candidatos", () => {
    const r = resolver([
      imovel("t1", { status: "Perdido" }),
      imovel("t2", { status: "Cancelado" }),
    ]);
    expect(r).toMatchObject({ ok: false, motivo: "sem-candidatos", nivelEmpate: null });
    if (!r.ok) expect(r.terminais).toEqual(["t1", "t2"]);
  });

  it("33. nenhum vínculo devolve sem-candidatos", () => {
    expect(resolver([])).toMatchObject({ ok: false, motivo: "sem-candidatos", candidatos: [] });
  });
});

describe("N4 — único plausível", () => {
  it("1. contato com um imóvel ativo", () => {
    const r = resolver([imovel("a")]);
    expect(r).toMatchObject({ ok: true, imovelId: "a", nivel: "unico" });
    if (r.ok) expect(r.evidencia).toEqual({ tipo: "unico-plausivel" });
  });

  it("2. dois plausíveis sem contexto nenhum → pendente no N4", () => {
    const r = resolver([imovel("a"), imovel("b")]);
    expect(r).toMatchObject({ ok: false, motivo: "pendente", nivelEmpate: "unico" });
    if (!r.ok) expect(r.candidatos).toEqual(["a", "b"]);
  });
});

describe("N1 — referência explícita por código", () => {
  const dois = [imovel("a", { codigo: "LD-225" }), imovel("b", { codigo: "LD-226" })];

  it("3. dois plausíveis e a mensagem cita o código de um", () => {
    const r = resolver(dois, { mensagem: { texto: "sobre o LD-225, ainda está livre", recebidaEm: RECEBIDA } });
    expect(r).toMatchObject({ ok: true, imovelId: "a", nivel: "referencia-explicita", terminal: false });
    if (r.ok) expect(r.evidencia).toEqual({ tipo: "codigo", codigo: "LD-225" });
  });

  it("4. código de imóvel terminal resolve como histórico (terminal = true)", () => {
    const r = resolver(
      [imovel("perdido", { status: "Perdido", codigo: "LD-900" }), imovel("ativo", { codigo: "LD-901" })],
      { mensagem: { texto: "aquele LD-900 eu já aluguei sozinho", recebidaEm: RECEBIDA } },
    );
    expect(r).toMatchObject({ ok: true, imovelId: "perdido", nivel: "referencia-explicita", terminal: true });
  });

  it("5. código inexistente na carteira não casa e a busca desce", () => {
    const r = resolver([imovel("a", { codigo: "LD-225" })], {
      mensagem: { texto: "é sobre o LD-999", recebidaEm: RECEBIDA },
    });
    expect(r).toMatchObject({ ok: true, imovelId: "a", nivel: "unico" });
  });

  it("6. duas referências conflitantes → pendente no N1, sem descer", () => {
    const r = resolver(
      [
        imovel("a", { codigo: "LD-225", tentativas: [pendenteHa(1)] }),
        imovel("b", { codigo: "LD-226" }),
      ],
      { mensagem: { texto: "o LD-225 e o LD-226 seguem disponíveis", recebidaEm: RECEBIDA } },
    );
    expect(r).toMatchObject({ ok: false, motivo: "pendente", nivelEmpate: "referencia-explicita" });
  });

  it("casa variações de escrita e respeita fronteira de token", () => {
    expect(textoCitaCodigo("sobre o LD-225", "LD-225")).toBe(true);
    expect(textoCitaCodigo("sobre o ld 225", "LD-225")).toBe(true);
    expect(textoCitaCodigo("sobre o LD225", "LD-225")).toBe(true);
    expect(textoCitaCodigo("sobre o ld-225!", "ld225")).toBe(true);
    // "LD-2" não pode casar dentro de "LD-225".
    expect(textoCitaCodigo("sobre o LD-225", "LD-2")).toBe(false);
    expect(textoCitaCodigo("mandei 225 fotos", "LD-225")).toBe(false);
    expect(textoCitaCodigo("", "LD-225")).toBe(false);
    // Código com muitas partes continua reconhecível (sem teto de tokens),
    // e um prefixo dele não basta.
    expect(textoCitaCodigo("é o a b c d1 mesmo", "a-b-c-d1")).toBe(true);
    expect(textoCitaCodigo("é o a b c mesmo", "a-b-c-d1")).toBe(false);
  });

  it("dois imóveis com o mesmo código (escrito de formas diferentes) empatam no N1", () => {
    const r = resolver([imovel("a", { codigo: "LD-5" }), imovel("b", { codigo: "ld 5" })], {
      mensagem: { texto: "sobre o LD-5", recebidaEm: RECEBIDA },
    });
    expect(r).toMatchObject({ ok: false, motivo: "pendente", nivelEmpate: "referencia-explicita" });
  });

  it("entrada malformada não resolve nem explode: status vazio é plausível, data de tentativa inválida não conta", () => {
    expect(resolver([imovel("a", { status: "" })])).toMatchObject({ ok: true, nivel: "unico" });
    const r = resolver([
      imovel("a", { tentativas: [{ data: "xx", aguardandoResultado: true }] }),
      imovel("b", { tentativas: null }),
    ]);
    expect(r).toMatchObject({ ok: false, nivelEmpate: "unico" });
  });

  it("código fraco (sem letra, sem dígito ou curto demais) não vira referência", () => {
    expect(codigoServeComoReferencia("22")).toBe(false);
    expect(codigoServeComoReferencia("225")).toBe(false);
    expect(codigoServeComoReferencia("casa")).toBe(false);
    expect(codigoServeComoReferencia("A1")).toBe(false);
    expect(codigoServeComoReferencia(null)).toBe(false);
    expect(codigoServeComoReferencia("LD-1")).toBe(true);
    const r = resolver([imovel("a", { codigo: "22" }), imovel("b", { codigo: "23" })], {
      mensagem: { texto: "pode ser dia 22", recebidaEm: RECEBIDA },
    });
    expect(r).toMatchObject({ ok: false, nivelEmpate: "unico" });
  });

  it("endereço no texto não é referência nesta fatia (decisão registrada)", () => {
    const fonte = readFileSync(new URL("../lib/calculo/atribuicaoMensagem.ts", import.meta.url), "utf8");
    expect(fonte).not.toMatch(/chaveEndereco|chaveImovel/);
    const r = resolver([imovel("a", { codigo: "LD-1" }), imovel("b", { codigo: "LD-2" })], {
      mensagem: { texto: "é o da Rua Souza Naves", recebidaEm: RECEBIDA },
    });
    expect(r).toMatchObject({ ok: false, nivelEmpate: "unico" });
  });
});

describe("N2 — tentativa pendente", () => {
  it("7. única tentativa elegível entre os plausíveis", () => {
    const r = resolver([imovel("a", { tentativas: [pendenteHa(2)] }), imovel("b")]);
    expect(r).toMatchObject({ ok: true, imovelId: "a", nivel: "contexto-tentativa" });
    if (r.ok) expect(r.evidencia).toMatchObject({ tipo: "tentativa" });
  });

  it("8. tentativas elegíveis em dois imóveis → pendente no N2, sem descer para N3", () => {
    const r = resolver(
      [imovel("a", { tentativas: [pendenteHa(1)] }), imovel("b", { tentativas: [pendenteHa(3)] })],
      { agendamentos: [{ enviadoEm: "2026-09-22T09:00", imovelIds: ["a"] }] },
    );
    expect(r).toMatchObject({ ok: false, motivo: "pendente", nivelEmpate: "contexto-tentativa" });
  });

  it("29-30. limite e vencimento de DIAS_COBRANCA_RESULTADO", () => {
    const noLimite = resolver([imovel("a", { tentativas: [pendenteHa(DIAS_COBRANCA_RESULTADO)] }), imovel("b")]);
    expect(noLimite).toMatchObject({ ok: true, nivel: "contexto-tentativa" });
    const vencida = resolver([
      imovel("a", { tentativas: [pendenteHa(DIAS_COBRANCA_RESULTADO + 1)] }),
      imovel("b"),
    ]);
    expect(vencida).toMatchObject({ ok: false, nivelEmpate: "unico" });
  });

  it("31. várias tentativas no mesmo imóvel contam como UM candidato", () => {
    const r = resolver([
      imovel("a", { tentativas: [pendenteHa(1), pendenteHa(2), pendenteHa(3)] }),
      imovel("b"),
    ]);
    expect(r).toMatchObject({ ok: true, imovelId: "a", nivel: "contexto-tentativa" });
  });

  it("tentativa sem a marca automática não é pendente", () => {
    const r = resolver([
      imovel("a", { tentativas: [{ data: "2026-09-21T09:00", aguardandoResultado: false }] }),
      imovel("b"),
    ]);
    expect(r).toMatchObject({ ok: false, nivelEmpate: "unico" });
  });
});

describe("N3 — contexto de agendamento", () => {
  const dois = [imovel("a"), imovel("b")];

  it("9. único contexto na janela", () => {
    const r = resolver(dois, { agendamentos: [{ enviadoEm: "2026-09-21T15:00", imovelIds: ["a"] }] });
    expect(r).toMatchObject({ ok: true, imovelId: "a", nivel: "contexto-agendamento" });
    if (r.ok) expect(r.evidencia).toEqual({ tipo: "agendamento", enviadoEm: "2026-09-21T15:00" });
  });

  it("10. dois contextos distintos → pendente no N3", () => {
    const r = resolver(dois, {
      agendamentos: [
        { enviadoEm: "2026-09-21T15:00", imovelIds: ["a"] },
        { enviadoEm: "2026-09-21T16:00", imovelIds: ["b"] },
      ],
    });
    expect(r).toMatchObject({ ok: false, motivo: "pendente", nivelEmpate: "contexto-agendamento" });
  });

  it("11. mensagem consolidada cobrindo dois plausíveis → pendente; âncora não ganha", () => {
    const r = resolver(dois, {
      agendamentos: [{ enviadoEm: "2026-09-21T15:00", imovelIds: ["a", "b"] }],
    });
    expect(r).toMatchObject({ ok: false, motivo: "pendente", nivelEmpate: "contexto-agendamento" });
  });

  it("consolidada cobrindo um plausível e um terminal resolve no plausível", () => {
    const r = resolver([imovel("a"), imovel("t", { status: "Locado" }), imovel("c")], {
      agendamentos: [{ enviadoEm: "2026-09-21T15:00", imovelIds: ["a", "t"] }],
    });
    expect(r).toMatchObject({ ok: true, imovelId: "a", nivel: "contexto-agendamento" });
  });

  it("32. ids repetidos em imoveis_consultados não criam empate falso", () => {
    const r = resolver(dois, {
      agendamentos: [
        { enviadoEm: "2026-09-21T15:00", imovelIds: ["a", "a", "a"] },
        { enviadoEm: "2026-09-21T16:00", imovelIds: ["a"] },
      ],
    });
    expect(r).toMatchObject({ ok: true, imovelId: "a", nivel: "contexto-agendamento" });
    if (r.ok) expect(r.evidencia).toEqual({ tipo: "agendamento", enviadoEm: "2026-09-21T16:00" });
  });

  it("27-28. limite exato de 48h entra; um minuto além fica de fora", () => {
    expect(ATRIBUICAO_MENSAGEM.janelaAgendamentoHoras).toBe(48);
    const noLimite = resolver(dois, { agendamentos: [{ enviadoEm: "2026-09-20T10:00", imovelIds: ["a"] }] });
    expect(noLimite).toMatchObject({ ok: true, nivel: "contexto-agendamento" });
    const fora = resolver(dois, { agendamentos: [{ enviadoEm: "2026-09-20T09:59", imovelIds: ["a"] }] });
    expect(fora).toMatchObject({ ok: false, nivelEmpate: "unico" });
  });

  it("envio posterior à chegada da resposta não é contexto dela", () => {
    const r = resolver(dois, { agendamentos: [{ enviadoEm: "2026-09-22T10:01", imovelIds: ["a"] }] });
    expect(r).toMatchObject({ ok: false, nivelEmpate: "unico" });
  });

  it("agendamento sem hora utilizável não vira evidência", () => {
    const r = resolver(dois, { agendamentos: [{ enviadoEm: "2026-09-21", imovelIds: ["a"] }] });
    expect(r).toMatchObject({ ok: false, nivelEmpate: "unico" });
  });
});

describe("precedência entre níveis", () => {
  it("12. tentativa aponta A e agendamento aponta B → A (N2 > N3)", () => {
    const r = resolver([imovel("a", { tentativas: [pendenteHa(1)] }), imovel("b")], {
      agendamentos: [{ enviadoEm: "2026-09-22T09:00", imovelIds: ["b"] }],
    });
    expect(r).toMatchObject({ ok: true, imovelId: "a", nivel: "contexto-tentativa" });
  });

  it("13. referência aponta A e tentativa aponta B → A (N1 > N2)", () => {
    const r = resolver(
      [imovel("a", { codigo: "LD-225" }), imovel("b", { tentativas: [pendenteHa(1)] })],
      { mensagem: { texto: "é sobre o LD-225", recebidaEm: RECEBIDA } },
    );
    expect(r).toMatchObject({ ok: true, imovelId: "a", nivel: "referencia-explicita" });
  });

  it("referência a terminal vence a tentativa de um plausível (e marca terminal)", () => {
    const r = resolver(
      [
        imovel("perdido", { status: "Perdido", codigo: "LD-900" }),
        imovel("ativo", { tentativas: [pendenteHa(1)] }),
      ],
      { mensagem: { texto: "sobre o LD-900", recebidaEm: RECEBIDA } },
    );
    expect(r).toMatchObject({ ok: true, imovelId: "perdido", terminal: true });
  });
});

describe("23. tenant", () => {
  it("candidato de outra conta é ignorado em todos os níveis", () => {
    const deOutraConta = imovel("z", {
      userId: OUTRA_CONTA,
      codigo: "LD-777",
      tentativas: [pendenteHa(1)],
    });
    const r = resolver([imovel("a"), deOutraConta], {
      mensagem: { texto: "sobre o LD-777", recebidaEm: RECEBIDA },
      agendamentos: [{ enviadoEm: "2026-09-22T09:00", imovelIds: ["z"] }],
    });
    expect(r).toMatchObject({ ok: true, imovelId: "a", nivel: "unico" });
    if (r.ok) {
      expect(r.candidatos).toEqual(["a"]);
      expect(r.terminais).toEqual([]);
    }
  });

  it("só imóveis de outra conta devolve sem-candidatos", () => {
    expect(resolver([imovel("z", { userId: OUTRA_CONTA })])).toMatchObject({
      ok: false,
      motivo: "sem-candidatos",
    });
  });
});

describe("24-26. determinismo", () => {
  const base: ImovelParaAtribuicao[] = [
    imovel("a", { codigo: "LD-1", tentativas: [pendenteHa(3), pendenteHa(1)] }),
    imovel("b", { status: "Perdido" }),
    imovel("c"),
  ];
  const agendamentos: ContextoAgendamento[] = [
    { enviadoEm: "2026-09-21T10:00", imovelIds: ["c"] },
    { enviadoEm: "2026-09-21T11:00", imovelIds: ["b"] },
  ];

  it("24. a ordem dos imóveis não muda o resultado", () => {
    const direta = resolver(base, { agendamentos });
    const invertida = resolver([...base].reverse(), { agendamentos });
    expect(invertida).toEqual(direta);
  });

  it("25. a ordem das tentativas não muda o resultado", () => {
    const invertidas = base.map((i) =>
      i.tentativas ? { ...i, tentativas: [...i.tentativas].reverse() } : i,
    );
    expect(resolver(invertidas, { agendamentos })).toEqual(resolver(base, { agendamentos }));
  });

  it("26. a ordem dos agendamentos não muda o resultado", () => {
    expect(resolver(base, { agendamentos: [...agendamentos].reverse() })).toEqual(
      resolver(base, { agendamentos }),
    );
  });

  it("imóvel repetido na entrada não vira empate", () => {
    const a = imovel("a");
    expect(resolver([a, { ...a }])).toMatchObject({ ok: true, imovelId: "a", nivel: "unico" });
  });

  it("35. duas execuções seguidas devolvem exatamente o mesmo objeto", () => {
    const entrada = { agendamentos };
    expect(resolver(base, entrada)).toEqual(resolver(base, entrada));
  });

  it("a saída não depende do relógio: datas muito no futuro seguem a mesma regra", () => {
    const futuro = "2099-01-02T10:00";
    const r = resolver([imovel("a", { tentativas: [{ data: "2099-01-01T10:00", aguardandoResultado: true }] }), imovel("b")], {
      mensagem: { texto: "oi", recebidaEm: futuro },
    });
    expect(r).toMatchObject({ ok: true, imovelId: "a", nivel: "contexto-tentativa" });
  });
});

describe("34. fronteira arquitetural do módulo", () => {
  const fonte = readFileSync(new URL("../lib/calculo/atribuicaoMensagem.ts", import.meta.url), "utf8");
  // Só o CÓDIGO: os comentários falam de `updated_at` justamente para
  // explicar por que ele não entra na decisão, e essa prosa é o registro
  // da regra — quem não pode citá-lo é o código executável.
  const codigo = fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");

  it.each(["updated_at", "Date.now", "createClient", "supabase", "fetch(", "Math.random", "process.env"])(
    "não contém %s",
    (proibido) => {
      expect(codigo).not.toContain(proibido);
    },
  );

  it("não usa `new Date` (regra do projeto: datas só por lib/datas.ts)", () => {
    expect(codigo).not.toMatch(/new Date\b/);
  });

  it("só importa núcleo puro do próprio projeto", () => {
    const imports = [...fonte.matchAll(/from "([^"]+)"/g)].map((m) => m[1]).sort();
    expect(imports).toEqual([
      "../constantes",
      "../datas",
      "../normalizacao",
      "./abordagens",
    ]);
    expect(fonte).not.toMatch(/from "(next|react|@supabase|@\/lib\/servidor)/);
  });

  it("não escreve nada: nenhuma mutação de banco nem efeito externo", () => {
    expect(codigo).not.toMatch(/\.(insert|update|delete|upsert|rpc)\(/);
    expect(codigo).not.toMatch(/console\.(log|error|warn)/);
  });
});
