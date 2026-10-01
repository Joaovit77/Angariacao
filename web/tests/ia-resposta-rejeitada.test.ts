/* ================================================================
   IA-M1c-C: O HELPER DA REJEIÇÃO PELA APLICAÇÃO

   `ia-resposta-rejeitada` registra "o provedor respondeu, mas a
   aplicação recusou a resposta". Estes testes fixam o contrato do
   helper: taxonomia fechada, as 7 chaves, só códigos do vocabulário do
   F11, request id saneado, nenhum texto da resposta e nunca lançar. Os
   fluxos (F1, F4–F9, F11, F3) são cobertos nos testes de cada um.
   ================================================================ */
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ registrarEvento: vi.fn() }));
vi.mock("@/lib/servidor/registro", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/servidor/registro")>()),
  registrarEvento: mocks.registrarEvento,
}));

import {
  CATEGORIA_DO_MOTIVO,
  CODIGOS_VALIDACAO_ANALISE,
  motivoDaConclusaoRejeitada,
  registrarRespostaRejeitada,
  requisicaoDaConclusao,
  type MotivoRejeicao,
} from "@/lib/servidor/ia/rejeicao";
import { errosPorCorretor, type EventoLog } from "@/lib/calculo/admin";

const EXECUCAO = "11111111-2222-4333-8444-555555555555";
const CHAVES = ["tipo", "execucao_id", "requisicao_provedor_id", "tentativa", "categoria", "motivo", "codigos"];

function conclusao(conteudo: unknown, extra: { finish?: unknown; refusal?: unknown; requestId?: unknown } = {}) {
  const c = { choices: [{ finish_reason: extra.finish ?? "stop", message: { content: conteudo, refusal: extra.refusal ?? null } }] };
  Object.defineProperty(c, "_request_id", { value: "requestId" in extra ? extra.requestId : "req_ok", enumerable: false });
  return c;
}

function registrado() {
  expect(mocks.registrarEvento).toHaveBeenCalledTimes(1);
  const entrada = mocks.registrarEvento.mock.calls[0][0] as { userId: string; categoria: string; nivel: string; evento: string; detalhe: string };
  return { entrada, detalhe: JSON.parse(entrada.detalhe) as Record<string, unknown> };
}

beforeEach(() => mocks.registrarEvento.mockReset());

describe("taxonomia fechada", () => {
  it("dez motivos, três categorias, cada motivo na sua", () => {
    expect(CATEGORIA_DO_MOTIVO).toEqual({
      "sem-choices": "resposta-invalida",
      recusa: "resposta-invalida",
      truncada: "resposta-invalida",
      vazia: "resposta-invalida",
      "json-invalido": "resposta-invalida",
      "fora-do-vocabulario": "fora-do-contrato",
      "campo-obrigatorio-ausente": "fora-do-contrato",
      "lista-vazia": "fora-do-contrato",
      "estrutura-invalida": "fora-do-contrato",
      "validacao-reprovada": "reprovada-pela-validacao",
    });
  });

  it("o vocabulário do F11 é exatamente o que o validador produz", () => {
    const fonte = readFileSync(new URL("../lib/assistente/analiseAprofundada.ts", import.meta.url), "utf8");
    const corpo = fonte.slice(fonte.indexOf("export function validarSaidaAnaliseAprofundada"));
    const doValidador = new Set<string>();
    for (const [, argumento] of corpo.matchAll(/erros(?:\.add\(|: \[)([^;\]]*)[)\]]/g)) {
      for (const [, codigo] of argumento.matchAll(/"([a-z]+(?:-[a-z]+)+)"/g)) doValidador.add(codigo);
    }
    expect([...doValidador].sort()).toEqual([...CODIGOS_VALIDACAO_ANALISE].sort());
  });
});

describe("motivoDaConclusaoRejeitada", () => {
  it.each([
    { nome: "sem choices", valor: {}, motivo: "sem-choices" },
    { nome: "choices null", valor: { choices: null }, motivo: "sem-choices" },
    { nome: "choices vazio", valor: { choices: [] }, motivo: "sem-choices" },
    { nome: "choices não é lista", valor: { choices: { 0: {} } }, motivo: "sem-choices" },
    { nome: "conclusão ausente", valor: undefined, motivo: "sem-choices" },
    { nome: "recusa", valor: conclusao(null, { refusal: "não posso" }), motivo: "recusa" },
    { nome: "recusa vence truncamento", valor: conclusao("{}", { refusal: "não", finish: "length" }), motivo: "recusa" },
    { nome: "truncada", valor: conclusao("{\"a\":", { finish: "length" }), motivo: "truncada" },
    { nome: "conteúdo null", valor: conclusao(null), motivo: "vazia" },
    { nome: "conteúdo em branco", valor: conclusao("   "), motivo: "vazia" },
    { nome: "JSON quebrado", valor: conclusao("{quebrado"), motivo: "json-invalido" },
    { nome: "JSON válido rejeitado", valor: conclusao("{\"roteiros\":[]}"), motivo: "estrutura-invalida" },
  ])("$nome → $motivo", ({ valor, motivo }) => {
    expect(motivoDaConclusaoRejeitada(valor)).toBe(motivo);
  });

  it("um getter que lança não derruba a classificação", () => {
    const hostil = {};
    Object.defineProperty(hostil, "choices", { get() { throw new Error("getter"); } });
    expect(motivoDaConclusaoRejeitada(hostil)).toBe("sem-choices");
  });
});

describe("requisicaoDaConclusao", () => {
  it("preserva o id válido, até 200 caracteres", () => {
    expect(requisicaoDaConclusao(conclusao("x", { requestId: "req_abc.123:x-9" }))).toBe("req_abc.123:x-9");
    expect(requisicaoDaConclusao(conclusao("x", { requestId: "r".repeat(200) }))).toBe("r".repeat(200));
  });

  it.each(["req com espaço", "req_<script>", "r".repeat(201), "", 42, null, undefined])("inválido (%s) vira null", (id) => {
    expect(requisicaoDaConclusao(conclusao("x", { requestId: id }))).toBeNull();
  });

  it("getter que lança vira null", () => {
    const hostil = {};
    Object.defineProperty(hostil, "_request_id", { get() { throw new Error("getter"); } });
    expect(requisicaoDaConclusao(hostil)).toBeNull();
  });
});

describe("registrarRespostaRejeitada", () => {
  it("um evento ia/aviso com exatamente as 7 chaves, nesta ordem", () => {
    registrarRespostaRejeitada({ userId: "u1", tipo: "resumo-dia", execucaoId: EXECUCAO, conclusao: conclusao("{quebrado", { requestId: "req_9" }) });
    const { entrada, detalhe } = registrado();
    expect(entrada).toMatchObject({ userId: "u1", categoria: "ia", nivel: "aviso", evento: "ia-resposta-rejeitada" });
    expect(Object.keys(detalhe)).toEqual(CHAVES);
    expect(detalhe).toEqual({
      tipo: "resumo-dia",
      execucao_id: EXECUCAO,
      requisicao_provedor_id: "req_9",
      tentativa: 1,
      categoria: "resposta-invalida",
      motivo: "json-invalido",
      codigos: [],
    });
  });

  it.each(Object.entries(CATEGORIA_DO_MOTIVO))("motivo explícito %s sai na categoria %s", (motivo, categoria) => {
    registrarRespostaRejeitada({ userId: null, tipo: "t", execucaoId: EXECUCAO, conclusao: conclusao("ok"), motivo: motivo as MotivoRejeicao });
    expect(registrado().detalhe).toMatchObject({ motivo, categoria });
  });

  it.each([[2, 2], [0, 1], [-1, 1], [1.5, 1], [undefined, 1]])("tentativa %s → %s", (tentativa, esperada) => {
    registrarRespostaRejeitada({ userId: null, tipo: "t", execucaoId: EXECUCAO, conclusao: {}, tentativa: tentativa as number | undefined });
    expect(registrado().detalhe.tentativa).toBe(esperada);
  });

  it("códigos: só o vocabulário fechado, sem repetição; texto livre nunca passa", () => {
    registrarRespostaRejeitada({
      userId: null,
      tipo: "analise-aprofundada-imovel",
      execucaoId: EXECUCAO,
      conclusao: {},
      motivo: "validacao-reprovada",
      codigos: ["fato-sem-fonte", "TEXTO LIVRE Maria (43) 99999-0000", "fato-sem-fonte", 7, "inventado", "protocolo-nao-carregado"],
    });
    const { detalhe, entrada } = registrado();
    expect(detalhe.codigos).toEqual(["fato-sem-fonte", "protocolo-nao-carregado"]);
    expect(entrada.detalhe).not.toContain("Maria");
  });

  it("nenhum conteúdo da resposta vai para o evento", () => {
    registrarRespostaRejeitada({
      userId: null,
      tipo: "t",
      execucaoId: EXECUCAO,
      conclusao: conclusao("{SEGREDO Maria Souza (43) 99999-0000 Rua das Flores", { refusal: null }),
    });
    const serializado = JSON.stringify(registrado().entrada);
    for (const trecho of ["SEGREDO", "Maria", "99999", "Flores"]) expect(serializado).not.toContain(trecho);
  });

  it("usa o registrador injetado quando há um, e o comum quando não há", () => {
    const injetado = vi.fn();
    registrarRespostaRejeitada({ userId: null, tipo: "t", execucaoId: EXECUCAO, conclusao: {}, registrar: injetado });
    expect(injetado).toHaveBeenCalledTimes(1);
    expect(mocks.registrarEvento).not.toHaveBeenCalled();
  });

  it("nunca lança, nem quando o registro lança", () => {
    expect(() => registrarRespostaRejeitada({
      userId: null,
      tipo: "t",
      execucaoId: EXECUCAO,
      conclusao: {},
      registrar: () => { throw new Error("registro quebrado"); },
    })).not.toThrow();
  });

  it("nível aviso não entra na contagem de erros do admin", () => {
    registrarRespostaRejeitada({ userId: "u1", tipo: "t", execucaoId: EXECUCAO, conclusao: {} });
    const { entrada } = registrado();
    const comoLog = (nivel: string): EventoLog => ({
      id: 1, userId: entrada.userId, categoria: entrada.categoria, nivel, evento: entrada.evento, detalhe: entrada.detalhe, criadoEm: "2026-10-01T00:00:00.000Z",
    });
    expect(errosPorCorretor([comoLog(entrada.nivel)]).get("u1")).toBeUndefined();
    expect(errosPorCorretor([comoLog("erro")]).get("u1")).toBe(1);
  });
});
