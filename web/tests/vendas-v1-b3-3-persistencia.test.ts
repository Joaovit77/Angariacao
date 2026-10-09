import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { consultarInteressadoVenda, executarComandoVenda, type ClienteRpcVendas } from "../lib/persistencia/vendas";
import type { ComandosVenda, PortaVenda } from "../lib/persistencia/vendasComandos";
import { decodificarResolucaoInteressadoVenda } from "../lib/persistencia/vendasDecodificacao";

const U = "11111111-1111-4111-8111-111111111111", C1 = "22222222-2222-4222-8222-222222222222", C2 = "33333333-3333-4333-8333-333333333333";
const instante = "2026-10-06T15:00:00.123Z";
const TELEFONE = "(43) 99802-4316";

function fake(resposta: { data?: unknown; error?: unknown } | Error) {
  const chamadas: { nome: string; args: unknown }[] = [];
  const cliente: ClienteRpcVendas = {
    rpc: async (nome, args) => {
      chamadas.push({ nome, args: JSON.parse(JSON.stringify(args)) });
      if (resposta instanceof Error) throw resposta;
      return { data: resposta.data ?? null, error: resposta.error ?? null };
    },
  };
  return { cliente, chamadas };
}
const erroBanco = (code: string, codigo: string) => ({ code, message: "qualquer texto", details: JSON.stringify({ contrato: "vendas-b2-v1", codigo, motivo: null }) });
function respostaCriada(contatoId: string) {
  const valores = { valorNegocioPrevisto: null, valorNegocioFechado: null, receitaPrevista: null };
  return { contrato: "vendas-b2-v1", ok: true, noOp: false,
    oportunidade: { id: U, userId: U, contatoId, criadoPor: U, responsavelUsuarioId: U, estado: "nova", versao: "1", imovelTratado: null, origem: null,
      valores, encerramento: null, encerradoEm: null, criadoEm: instante, atualizadoEm: instante, arquivadaEm: null },
    evento: { id: C2, userId: U, oportunidadeId: U, tipo: "oportunidade_criada", atorUsuarioId: U, registradoEm: instante, dataFato: null, versao: "1",
      chaveIdempotencia: "chave-do-formulario", versaoContrato: 1, dados: { contatoId, imovelTratado: null, origem: null, valores } } };
}
const resolucao = (corpo: Record<string, unknown>) => ({ contrato: "vendas-b3-resolucao-v1", ...corpo });

describe("B3.3: decodificador fechado da resolução", () => {
  it.each([
    [{ status: "telefone-invalido" }],
    [{ status: "nao-encontrado" }],
    [{ status: "em-revisao", candidatos: [C1] }],
    [{ status: "ambiguo", candidatos: [C1, C2] }],
    [{ status: "encontrado", contatoId: C1, seguiuFusao: false, avisos: [] }],
    [{ status: "encontrado", contatoId: C1, seguiuFusao: true, avisos: ["contato-arquivado", "revisao-pendente"] }],
    [{ status: "encontrado", contatoId: C1, seguiuFusao: false, avisos: ["revisao-pendente"] }],
    [{ status: "indisponivel", motivo: "fusao-invalida" }],
    [{ status: "indisponivel", motivo: "contato-anonimizado" }],
  ])("aceita %j sem perder o estado próprio", (corpo) => {
    expect(decodificarResolucaoInteressadoVenda(resolucao(corpo))).toEqual(corpo);
  });

  it.each([
    ["contrato errado", { contrato: "vendas-b2-v1", status: "nao-encontrado" }],
    ["sem contrato", { status: "nao-encontrado" }],
    ["status desconhecido", resolucao({ status: "reaproveitar" })],
    ["status ausente", resolucao({})],
    ["não objeto", "nao-encontrado"],
    ["nulo", null],
    ["campo extra", resolucao({ status: "nao-encontrado", contatoId: C1 })],
    ["PII inesperada", resolucao({ status: "encontrado", contatoId: C1, seguiuFusao: false, avisos: [], nome: "Ana" })],
    ["telefone inesperado", resolucao({ status: "nao-encontrado", telefone: TELEFONE })],
    ["encontrado sem avisos", resolucao({ status: "encontrado", contatoId: C1, seguiuFusao: false })],
    ["seguiuFusao texto", resolucao({ status: "encontrado", contatoId: C1, seguiuFusao: "false", avisos: [] })],
    ["id maiúsculo", resolucao({ status: "encontrado", contatoId: "ABCDEF12-3456-4789-8abc-def012345678", seguiuFusao: false, avisos: [] })],
    ["aviso desconhecido", resolucao({ status: "encontrado", contatoId: C1, seguiuFusao: false, avisos: ["outro"] })],
    ["aviso repetido", resolucao({ status: "encontrado", contatoId: C1, seguiuFusao: false, avisos: ["revisao-pendente", "revisao-pendente"] })],
    ["avisos fora de ordem", resolucao({ status: "encontrado", contatoId: C1, seguiuFusao: false, avisos: ["revisao-pendente", "contato-arquivado"] })],
    ["em-revisao vazio", resolucao({ status: "em-revisao", candidatos: [] })],
    ["ambíguo com um", resolucao({ status: "ambiguo", candidatos: [C1] })],
    ["candidatos fora de ordem", resolucao({ status: "ambiguo", candidatos: [C2, C1] })],
    ["candidatos repetidos", resolucao({ status: "ambiguo", candidatos: [C1, C1] })],
    ["candidato inválido", resolucao({ status: "em-revisao", candidatos: ["x"] })],
    ["motivo desconhecido", resolucao({ status: "indisponivel", motivo: "outra-conta" })],
  ])("recusa %s como resposta inválida (erro local, não resultado)", (_nome, valor) => {
    expect(() => decodificarResolucaoInteressadoVenda(valor)).toThrow(expect.objectContaining({ codigo: "resposta-invalida" }));
  });
});

describe("B3.3: consultarInteressadoVenda", () => {
  it("chama só a RPC de leitura, com {telefone} exatamente como digitado", async () => {
    const { cliente, chamadas } = fake({ data: resolucao({ status: "nao-encontrado" }) });
    expect(await consultarInteressadoVenda(" " + TELEFONE + " ", cliente)).toEqual({ ok: true, resolucao: { status: "nao-encontrado" } });
    expect(chamadas).toEqual([{ nome: "vendas_resolver_interessado", args: { p_consulta: { telefone: " " + TELEFONE + " " } } }]);
  });

  it("encontrado é devolvido como candidato, não como escolha", async () => {
    const corpo = { status: "encontrado", contatoId: C1, seguiuFusao: false, avisos: ["contato-arquivado"] };
    const { cliente, chamadas } = fake({ data: resolucao(corpo) });
    expect(await consultarInteressadoVenda(TELEFONE, cliente)).toEqual({ ok: true, resolucao: corpo });
    expect(chamadas).toHaveLength(1);
  });

  it.each(["em-revisao", "ambiguo", "indisponivel"])("preserva %s como estado próprio", async (status) => {
    const corpo = status === "em-revisao" ? { status, candidatos: [C1] } : status === "ambiguo" ? { status, candidatos: [C1, C2] } : { status, motivo: "fusao-invalida" };
    const { cliente } = fake({ data: resolucao(corpo) });
    expect(await consultarInteressadoVenda(TELEFONE, cliente)).toEqual({ ok: true, resolucao: corpo });
  });

  it("telefone inválido não sai do navegador; tipo errado é estrutura inválida", async () => {
    const { cliente, chamadas } = fake({ data: null });
    for (const telefone of ["", "abc", "+1 415 555 2671", "43 9802-431"]) {
      expect(await consultarInteressadoVenda(telefone, cliente)).toEqual({ ok: true, resolucao: { status: "telefone-invalido" } });
    }
    expect(await consultarInteressadoVenda(43998024316 as unknown as string, cliente)).toEqual({ ok: false, erro: { codigo: "estrutura-invalida", motivo: null } });
    expect(chamadas).toEqual([]);
  });

  it("erros do banco viram códigos de domínio; rede e resposta torta ficam locais", async () => {
    const casos: [Parameters<typeof fake>[0], string][] = [
      [{ error: erroBanco("PT401", "nao-autenticado") }, "nao-autenticado"],
      [{ error: { code: "42501", message: "permission denied for function vendas_resolver_interessado" } }, "nao-autenticado"],
      [{ error: erroBanco("PT422", "estrutura-invalida") }, "estrutura-invalida"],
      [{ error: { code: "XX000", details: "interno" } }, "falha-interna"],
      [{ error: erroBanco("PT409", "estrutura-invalida") }, "falha-interna"],
      [new Error("Conexão interrompida."), "transporte-indisponivel"],
      [{ data: { contrato: "vendas-b3-resolucao-v1", status: "reaproveitar" } }, "resposta-invalida"],
      [{ data: null }, "resposta-invalida"],
    ];
    for (const [resposta, codigo] of casos) {
      expect(await consultarInteressadoVenda(TELEFONE, fake(resposta).cliente)).toEqual({ ok: false, erro: { codigo, motivo: null } });
    }
  });
});

describe("B3.3: criar pelo caminho executável", () => {
  it("legado B2: payload exatamente igual ao de antes (sem interessado)", async () => {
    const { cliente, chamadas } = fake({ data: respostaCriada(C1) });
    const comando = { chaveIdempotencia: "chave-do-formulario", contatoId: C1, origem: { tipo: "portal" as const }, valorNegocioPrevisto: 0.1 };
    expect((await executarComandoVenda("criar", comando, cliente)).ok).toBe(true);
    expect(chamadas).toEqual([{ nome: "vendas_criar_oportunidade", args: { p_comando: { chaveIdempotencia: "chave-do-formulario", contatoId: C1, origem: { tipo: "portal" }, valorNegocioPrevisto: "1e-1" } } }]);
  });

  it.each([
    ["existente", { modo: "existente", contatoId: C1 }],
    ["novo com telefone", { modo: "novo", nome: "  Ana ", telefone: " " + TELEFONE }],
    ["novo sem telefone", { modo: "novo", nome: "Ana", telefone: null }],
  ] as const)("B3 %s: envia o interessado como recebido e a chave do chamador", async (_nome, interessado) => {
    const { cliente, chamadas } = fake({ data: respostaCriada(C1) });
    const r = await executarComandoVenda("criar", { chaveIdempotencia: "chave-do-formulario", interessado }, cliente);
    expect(r).toMatchObject({ ok: true, oportunidade: { contatoId: C1 } });
    expect(chamadas).toEqual([{ nome: "vendas_criar_oportunidade", args: { p_comando: { chaveIdempotencia: "chave-do-formulario", interessado } } }]);
  });

  it("a mesma chave sai igual em toda repetição; nada gera chave nova", async () => {
    const { cliente, chamadas } = fake({ data: respostaCriada(C1) });
    const comando: ComandosVenda["criar"] = { chaveIdempotencia: "chave-do-formulario", interessado: { modo: "novo", nome: "Ana", telefone: TELEFONE } };
    await executarComandoVenda("criar", comando, cliente); await executarComandoVenda("criar", comando, cliente);
    expect(chamadas.map((c) => (c.args as { p_comando: { chaveIdempotencia: string } }).p_comando.chaveIdempotencia)).toEqual(["chave-do-formulario", "chave-do-formulario"]);
    const conflito = await executarComandoVenda("criar", { ...comando, interessado: { modo: "novo", nome: "Outra", telefone: null } }, fake({ error: erroBanco("PT409", "chave-idempotencia-conflitante") }).cliente);
    expect(conflito).toEqual({ ok: false, erro: { codigo: "chave-idempotencia-conflitante", motivo: null } });
  });

  it("formas inválidas são recusadas antes da rede", async () => {
    const { cliente, chamadas } = fake({ data: respostaCriada(C1) });
    const casos: [unknown, string][] = [
      [{ chaveIdempotencia: "k", contatoId: C1, interessado: { modo: "existente", contatoId: C1 } }, "estrutura-invalida"],
      [{ chaveIdempotencia: "k" }, "estrutura-invalida"],
      [{ chaveIdempotencia: "k", interessado: { modo: "novo", nome: "   ", telefone: null } }, "nome-invalido"],
      [{ chaveIdempotencia: "k", interessado: { modo: "novo", nome: "Ana", telefone: "abc" } }, "telefone-invalido"],
      [{ chaveIdempotencia: "k", interessado: { modo: "novo", nome: "Ana" } }, "estrutura-invalida"],
      [{ chaveIdempotencia: "k", interessado: { modo: "existente", contatoId: C1, nome: "Ana" } }, "estrutura-invalida"],
      [{ chaveIdempotencia: "k", interessado: { modo: "existente", contatoId: "x" } }, "estrutura-invalida"],
      [{ chaveIdempotencia: "k", interessado: null }, "estrutura-invalida"],
    ];
    for (const [comando, codigo] of casos) {
      expect(await executarComandoVenda("criar", comando as ComandosVenda["criar"], cliente)).toEqual({ ok: false, erro: { codigo, motivo: null } });
    }
    expect(chamadas).toEqual([]);
  });

  it.each(["transicionar", "alterar_imovel", "alterar_valores", "ganhar", "perder", "arquivar"] as const)(
    "%s nunca leva contato nem interessado (contato imutável no V1)", async (porta) => {
      const { cliente, chamadas } = fake({ data: null });
      for (const extra of [{ contatoId: C2 }, { interessado: { modo: "existente", contatoId: C2 } }]) {
        const comando = { chaveIdempotencia: "k", oportunidadeId: U, versaoEsperada: 1, ...extra } as unknown as ComandosVenda[typeof porta];
        expect(await executarComandoVenda(porta as PortaVenda, comando, cliente)).toEqual({ ok: false, erro: { codigo: "estrutura-invalida", motivo: null } });
      }
      expect(chamadas).toEqual([]);
    });

  it.each([
    ["PT409", "telefone-ja-cadastrado"], ["PT409", "telefone-em-revisao"], ["PT409", "interessado-ambiguo"], ["PT409", "interessado-indisponivel"],
    ["PT422", "nome-invalido"], ["PT422", "telefone-invalido"], ["PT422", "contato-fundido"], ["PT422", "contato-anonimizado"],
    ["PT422", "contato-invalido"], ["PT503", "conflito-transitorio"], ["PT401", "nao-autenticado"], ["PT409", "versao-conflitante"],
  ])("%s %s do banco chega como o mesmo código de domínio", async (estado, codigo) => {
    const r = await executarComandoVenda("criar", { chaveIdempotencia: "k", interessado: { modo: "novo", nome: "Ana", telefone: TELEFONE } }, fake({ error: erroBanco(estado, codigo) }).cliente);
    expect(r).toEqual({ ok: false, erro: { codigo, motivo: null } });
  });

  it("SQLSTATE trocado ou erro desconhecido segue o comportamento seguro (falha-interna)", async () => {
    for (const error of [erroBanco("PT422", "telefone-ja-cadastrado"), erroBanco("PT409", "nome-invalido"), { code: "23505", details: "duplicate key" }]) {
      const r = await executarComandoVenda("criar", { chaveIdempotencia: "k", interessado: { modo: "novo", nome: "Ana", telefone: TELEFONE } }, fake({ error }).cliente);
      expect(r).toEqual({ ok: false, erro: { codigo: "falha-interna", motivo: null } });
    }
  });
});

describe("B3.3: fronteira (sem service role, sem UI)", () => {
  const WEB = join(dirname(fileURLToPath(import.meta.url)), "..");
  const ler = (arquivo: string) => readFileSync(join(WEB, arquivo), "utf8");
  function arquivos(pasta: string): string[] {
    return readdirSync(join(WEB, pasta), { withFileTypes: true }).flatMap((item) => {
      const caminho = join(pasta, item.name);
      return item.isDirectory() ? arquivos(caminho) : /\.(ts|tsx)$/.test(item.name) ? [caminho] : [];
    });
  }

  it("o adaptador usa só o cliente autenticado do navegador", () => {
    for (const arquivo of ["lib/persistencia/vendas.ts", "lib/persistencia/vendasComandos.ts", "lib/persistencia/vendasDecodificacao.ts", "lib/persistencia/vendasInteressado.ts"]) {
      expect(ler(arquivo)).not.toMatch(/SERVICE_ROLE|service_role|servidor\/|supabaseAdmin|createClient|process\.env/);
    }
    expect(ler("lib/persistencia/vendas.ts")).toMatch(/import \{ getSupabase \} from "\.\/supabase";/);
    expect(ler("lib/persistencia/supabase.ts")).toMatch(/NEXT_PUBLIC_SUPABASE_ANON_KEY/);
    expect(ler("lib/persistencia/supabase.ts")).not.toMatch(/SERVICE_ROLE/);
  });

  it("nenhuma tela usa o adaptador que grava nem a resolução; só B3.4a e os tipos do catálogo B3.4b-A chegam à interface", () => {
    const telas = [...arquivos("app"), ...arquivos("components")];
    expect(telas.length).toBeGreaterThan(20);
    const relativo = (arquivo: string) => relative(WEB, join(WEB, arquivo)).replace(/\\/g, "/");
    const gravam = telas.filter((arquivo) => /persistencia\/vendas["']|persistencia\/vendasInteressado|vendas_resolver_interessado|consultarInteressadoVenda|executarComandoVenda/.test(ler(arquivo)));
    expect(gravam.map(relativo)).toEqual([]);
    // Nenhuma tela chama RPC de Vendas direto, por nome de porta ou pelo prefixo.
    const rpcDireta = telas.filter((arquivo) => /vendas_(criar|transicionar|alterar|ganhar|perder|arquivar|resolver)_|\.rpc\(\s*["'`]vendas_/.test(ler(arquivo)));
    expect(rpcDireta.map(relativo)).toEqual([]);
    // B3.4a só lê snapshots; B3.4b-A recebe tipos do catálogo neutro. Lista fechada por arquivo.
    const leem = telas.filter((arquivo) => /persistencia\/vendas/.test(ler(arquivo)));
    expect(leem.map(relativo).sort()).toEqual([
      "components/vendas/DrawerOportunidadeVenda.tsx", "components/vendas/SeletorImovelVenda.tsx", "components/vendas/VendasView.tsx",
      "components/vendas/filtrosVenda.ts", "components/vendas/rotulosVenda.ts",
    ]);
    const seletor = ler("components/vendas/SeletorImovelVenda.tsx");
    expect(seletor).toMatch(/import type \{[^}]+\} from "@\/lib\/persistencia\/vendasImoveisLeitura"/);
    expect(seletor).not.toMatch(/persistencia\/vendasComandos|persistencia\/vendasLeitura|persistencia\/vendasInteressado/);
  });
});
