import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MAX_SALTOS_FUSAO } from "../lib/calculo/resolucaoContato";
import { CODIGOS_ERRO_VENDA, PORTAS_VENDAS, type ComandosVenda } from "../lib/persistencia/vendasComandos";
import { decodificarErroVenda } from "../lib/persistencia/vendasDecodificacao";
import {
  ERROS_INTERESSADO_VENDA, EntradaInteressadoInvalida, LIMITE_NOME_INTERESSADO_VENDA,
  arvoreFingerprintCriarVenda, avaliarContatoExistenteVenda, classificarIdentificacaoCriarVenda,
  codificarArvoreFingerprintVenda, decidirInteressadoNovoVenda, resolverInteressadoVenda, validarInteressadoVenda,
  type ContatoEstadoVenda, type CriarComandoInteressadoVenda, type EntradaResolucaoInteressadoVenda,
  type IdentificacaoCriarVenda, type InteressadoNormalizadoVenda, type ResolucaoInteressadoVenda,
} from "../lib/persistencia/vendasInteressado";

const CONTA = "11111111-1111-4111-8111-111111111111";
const OUTRA = "99999999-9999-4999-8999-999999999999";
const C1 = "22222222-2222-4222-8222-222222222222";
const C2 = "33333333-3333-4333-8333-333333333333";
const C3 = "44444444-4444-4444-8444-444444444444";
const TELEFONE = "(43) 99802-4316";

function contato(id: string, extra: Partial<ContatoEstadoVenda> = {}): ContatoEstadoVenda {
  return { id, userId: CONTA, fundidoEmContatoId: null, arquivado: false, anonimizado: false, revisaoPendente: false, ...extra };
}
function entrada(extra: Partial<EntradaResolucaoInteressadoVenda> = {}): EntradaResolucaoInteressadoVenda {
  return { userId: CONTA, telefone: TELEFONE, canaisAtivos: [], revisoesTelefone: [], contatos: [], ...extra };
}
const canal = (contatoId: string, userId = CONTA) => ({ userId, contatoId });
const novo = (nome: string, telefone: string | null) => {
  const r = validarInteressadoVenda({ modo: "novo", nome, telefone });
  if (!r.ok || r.interessado.modo !== "novo") throw new Error("fixture inválida");
  return r.interessado as Extract<InteressadoNormalizadoVenda, { modo: "novo" }>;
};

describe("Vendas B3.1: payload fechado do interessado", () => {
  it("modo existente aceita só modo + contatoId UUID, normalizado em minúsculas", () => {
    expect(validarInteressadoVenda({ modo: "existente", contatoId: C1.toUpperCase() }))
      .toEqual({ ok: true, interessado: { modo: "existente", contatoId: C1 } });
    for (const extra of [{ nome: "Ana" }, { telefone: TELEFONE }, { userId: CONTA }, { contatoId: C1, x: null }]) {
      expect(validarInteressadoVenda({ modo: "existente", contatoId: C1, ...extra })).toEqual({ ok: false, codigo: "estrutura-invalida" });
    }
    for (const id of ["", "x", 1, null, C1 + " ", "{" + C1 + "}", C1.replace(/-/g, "")]) {
      expect(validarInteressadoVenda({ modo: "existente", contatoId: id })).toEqual({ ok: false, codigo: "estrutura-invalida" });
    }
  });

  it("modo novo exige nome aparado de 1 a 200 caracteres, mesmo com telefone", () => {
    expect(validarInteressadoVenda({ modo: "novo", nome: "  Ana Souza\n", telefone: null }))
      .toEqual({ ok: true, interessado: { modo: "novo", nome: "Ana Souza", telefone: null } });
    expect(validarInteressadoVenda({ modo: "novo", nome: "Ana", telefone: " +55 43 99802-4316 " }))
      .toEqual({ ok: true, interessado: { modo: "novo", nome: "Ana", telefone: { digitado: "+55 43 99802-4316", canonico: "4398024316" } } });
    for (const nome of ["", "   ", " 　\t", "a".repeat(LIMITE_NOME_INTERESSADO_VENDA + 1)]) {
      expect(validarInteressadoVenda({ modo: "novo", nome, telefone: TELEFONE })).toEqual({ ok: false, codigo: "nome-invalido" });
    }
    // Limite em pontos de código, como o char_length do Postgres.
    expect(validarInteressadoVenda({ modo: "novo", nome: "😀".repeat(200), telefone: null }).ok).toBe(true);
    expect(validarInteressadoVenda({ modo: "novo", nome: "😀".repeat(201), telefone: null })).toEqual({ ok: false, codigo: "nome-invalido" });
  });

  it("telefone informado precisa canonizar e caber em 40 caracteres", () => {
    for (const telefone of ["", "   ", "abc", "9802-4316", "43 9802-431", "+1 415 555 2671", "+44 20 7946 0958"]) {
      expect(validarInteressadoVenda({ modo: "novo", nome: "Ana", telefone })).toEqual({ ok: false, codigo: "telefone-invalido" });
    }
    const longo = "43 99802-4316 " + "-".repeat(27); // canoniza, mas tem 41 caracteres
    expect(longo.trim().length).toBeGreaterThan(40);
    expect(validarInteressadoVenda({ modo: "novo", nome: "Ana", telefone: longo })).toEqual({ ok: false, codigo: "telefone-invalido" });
  });

  it("ordem de erro fixa: estrutura, depois nome, depois telefone", () => {
    expect(validarInteressadoVenda({ modo: "novo", nome: "", telefone: "abc" })).toEqual({ ok: false, codigo: "nome-invalido" });
    expect(validarInteressadoVenda({ modo: "novo", nome: 1, telefone: "abc" })).toEqual({ ok: false, codigo: "estrutura-invalida" });
  });

  it.each([
    null, undefined, [], "novo", 1, { modo: "NOVO", nome: "Ana", telefone: null }, { nome: "Ana", telefone: null },
    { modo: "novo", nome: "Ana" }, { modo: "novo", nome: "Ana", telefone: undefined }, { modo: "novo", nome: "Ana", telefone: 4398024316 },
    { modo: "novo", nome: ["Ana"], telefone: null }, { modo: "novo", nome: "Ana", telefone: null, userId: CONTA },
    { modo: "novo", nome: "Ana", telefone: null, contatoId: C1 }, new (class { modo = "novo"; nome = "Ana"; telefone = null })(),
    JSON.parse(`{"modo":"existente","contatoId":"${C1}","__proto__":{"x":1}}`),
  ])("payload hostil ou de tipo errado é estrutura inválida: %j", (valor) => {
    expect(validarInteressadoVenda(valor)).toEqual({ ok: false, codigo: "estrutura-invalida" });
  });
});

describe("Vendas B3.1: compatibilidade com o criar do B2", () => {
  it("contatoId sozinho continua sendo o legado B2; interessado sozinho é B3", () => {
    expect(classificarIdentificacaoCriarVenda({ chaveIdempotencia: "k", contatoId: C1.toUpperCase(), origem: null }))
      .toEqual({ ok: true, identificacao: { forma: "legado-b2", contatoId: C1 } });
    expect(classificarIdentificacaoCriarVenda({ chaveIdempotencia: "k", interessado: { modo: "existente", contatoId: C1 } }))
      .toEqual({ ok: true, identificacao: { forma: "interessado", interessado: { modo: "existente", contatoId: C1 } } });
  });

  it("as duas formas juntas, nenhuma, ou nula são recusadas", () => {
    for (const comando of [
      { contatoId: C1, interessado: { modo: "existente", contatoId: C1 } },
      { contatoId: C1, interessado: null }, { contatoId: null, interessado: { modo: "existente", contatoId: C1 } },
      { chaveIdempotencia: "k" }, { contatoId: null }, { interessado: null }, null, [],
    ]) expect(classificarIdentificacaoCriarVenda(comando)).toEqual({ ok: false, codigo: "estrutura-invalida" });
  });

  it("o comando B3 não tem caminho executável: fica fora de ComandosVenda e das portas", () => {
    expect(Object.entries(PORTAS_VENDAS)).toEqual([
      ["criar", "vendas_criar_oportunidade"], ["transicionar", "vendas_transicionar_oportunidade"],
      ["alterar_imovel", "vendas_alterar_imovel"], ["alterar_valores", "vendas_alterar_valores"],
      ["ganhar", "vendas_ganhar_oportunidade"], ["perder", "vendas_perder_oportunidade"],
      ["arquivar", "vendas_arquivar_oportunidade"],
    ]);
    const comandoB3: CriarComandoInteressadoVenda = { chaveIdempotencia: "k", interessado: { modo: "novo", nome: "Ana", telefone: null } };
    // @ts-expect-error o criar executável do B2 ainda exige contatoId e não conhece interessado
    const comandoB2: ComandosVenda["criar"] = comandoB3;
    expect(comandoB2).toBe(comandoB3);
    // Os códigos de erro do interessado (B3.2) podem existir no decodificador; campo, porta ou import do B3, não.
    for (const arquivo of ["../lib/persistencia/vendas.ts", "../lib/persistencia/vendasComandos.ts", "../lib/persistencia/vendasDecodificacao.ts"]) {
      expect(readFileSync(new URL(arquivo, import.meta.url), "utf8")).not.toMatch(/vendasInteressado|resolver_interessado|\binteressado\s*\??\s*:/);
    }
  });
});

describe("Vendas B3.1: resolução por telefone (0/1/N, revisão, lápide)", () => {
  it("telefone inválido decide antes de qualquer dado consultado", () => {
    expect(resolverInteressadoVenda(entrada({ telefone: "123", canaisAtivos: [canal(C1)], contatos: [contato(C1)] })))
      .toEqual({ status: "telefone-invalido" });
  });

  it("revisão de telefone pendente bloqueia e vence os canais; candidatos ordenados e únicos", () => {
    const r = resolverInteressadoVenda(entrada({
      revisoesTelefone: [canal(C3), canal(C2), canal(C3)], canaisAtivos: [canal(C1)], contatos: [contato(C1)],
    }));
    expect(r).toEqual({ status: "em-revisao", candidatos: [C2, C3] });
  });

  it("0 canais é nao-encontrado; 1 é encontrado; 2+ é ambíguo e não escolhe", () => {
    expect(resolverInteressadoVenda(entrada())).toEqual({ status: "nao-encontrado" });
    expect(resolverInteressadoVenda(entrada({ canaisAtivos: [canal(C1)], contatos: [contato(C1)] })))
      .toEqual({ status: "encontrado", contatoId: C1, seguiuFusao: false, avisos: [] });
    expect(resolverInteressadoVenda(entrada({ canaisAtivos: [canal(C3), canal(C1)], contatos: [contato(C1), contato(C3)] })))
      .toEqual({ status: "ambiguo", candidatos: [C1, C3] });
  });

  it("lápide leva ao sobrevivente; cadeia quebrada, ciclo ou funda demais é indisponível", () => {
    expect(resolverInteressadoVenda(entrada({
      canaisAtivos: [canal(C1)], contatos: [contato(C1, { fundidoEmContatoId: C2, arquivado: true }), contato(C2)],
    }))).toEqual({ status: "encontrado", contatoId: C2, seguiuFusao: true, avisos: [] });
    expect(resolverInteressadoVenda(entrada({ canaisAtivos: [canal(C1)], contatos: [contato(C1, { fundidoEmContatoId: C2 })] })))
      .toEqual({ status: "indisponivel", motivo: "fusao-invalida" });
    expect(resolverInteressadoVenda(entrada({
      canaisAtivos: [canal(C1)], contatos: [contato(C1, { fundidoEmContatoId: C2 }), contato(C2, { fundidoEmContatoId: C1 })],
    }))).toEqual({ status: "indisponivel", motivo: "fusao-invalida" });
    const cadeia = Array.from({ length: MAX_SALTOS_FUSAO + 2 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`);
    const contatos = cadeia.map((id, i) => contato(id, { fundidoEmContatoId: cadeia[i + 1] ?? null }));
    expect(resolverInteressadoVenda(entrada({ canaisAtivos: [canal(cadeia[0])], contatos })))
      .toEqual({ status: "indisponivel", motivo: "fusao-invalida" });
    expect(resolverInteressadoVenda(entrada({ canaisAtivos: [canal(cadeia[1])], contatos })).status).toBe("encontrado");
  });

  it("sobrevivente anonimizado é indisponível; arquivado e revisão pendente só avisam", () => {
    expect(resolverInteressadoVenda(entrada({ canaisAtivos: [canal(C1)], contatos: [contato(C1, { anonimizado: true })] })))
      .toEqual({ status: "indisponivel", motivo: "contato-anonimizado" });
    expect(resolverInteressadoVenda(entrada({ canaisAtivos: [canal(C1)], contatos: [contato(C1, { arquivado: true, revisaoPendente: true })] })))
      .toEqual({ status: "encontrado", contatoId: C1, seguiuFusao: false, avisos: ["contato-arquivado", "revisao-pendente"] });
  });

  it("qualquer dado de outra conta na entrada é defeito do chamador, nunca resultado", () => {
    for (const extra of [
      { canaisAtivos: [canal(C1, OUTRA)] }, { revisoesTelefone: [canal(C1, OUTRA)] },
      { canaisAtivos: [canal(C1)], contatos: [{ ...contato(C1), userId: OUTRA }] },
    ]) expect(() => resolverInteressadoVenda(entrada(extra))).toThrow(EntradaInteressadoInvalida);
  });

  it("é determinística em qualquer ordem e não carrega nome nem telefone", () => {
    const base = { canaisAtivos: [canal(C1), canal(C2)], contatos: [contato(C1), contato(C2)] };
    const invertida = { canaisAtivos: [canal(C2), canal(C1)], contatos: [contato(C2), contato(C1)] };
    expect(resolverInteressadoVenda(entrada(base))).toEqual(resolverInteressadoVenda(entrada(invertida)));
    const r = JSON.stringify(resolverInteressadoVenda(entrada({ canaisAtivos: [canal(C1)], contatos: [contato(C1)] })));
    expect(r).not.toMatch(/99802|4398024316|nome|telefone/);
  });
});

describe("Vendas B3.1: decisão na gravação", () => {
  it("existente: inexistente e outra conta dão o mesmo erro; lápide e anonimizado são recusados", () => {
    expect(avaliarContatoExistenteVenda(C1, CONTA, null)).toEqual({ ok: false, codigo: "contato-invalido" });
    expect(avaliarContatoExistenteVenda(C1, CONTA, { ...contato(C1), userId: OUTRA })).toEqual(avaliarContatoExistenteVenda(C1, CONTA, null));
    expect(avaliarContatoExistenteVenda(C1, CONTA, contato(C2))).toEqual({ ok: false, codigo: "contato-invalido" });
    expect(avaliarContatoExistenteVenda(C1, CONTA, contato(C1, { fundidoEmContatoId: C2, arquivado: true }))).toEqual({ ok: false, codigo: "contato-fundido" });
    expect(avaliarContatoExistenteVenda(C1, CONTA, contato(C1, { anonimizado: true }))).toEqual({ ok: false, codigo: "contato-anonimizado" });
    expect(avaliarContatoExistenteVenda(C1, CONTA, contato(C1, { arquivado: true })))
      .toEqual({ ok: true, contatoId: C1, avisos: ["contato-arquivado"] });
  });

  it("novo: só cria quando o número não existe; nunca reaproveita em silêncio", () => {
    const esperado: Record<ResolucaoInteressadoVenda["status"], unknown> = {
      "nao-encontrado": { ok: true, acao: "criar-contato" },
      "telefone-invalido": { ok: false, codigo: "telefone-invalido" },
      "em-revisao": { ok: false, codigo: "telefone-em-revisao" },
      "encontrado": { ok: false, codigo: "telefone-ja-cadastrado" },
      "ambiguo": { ok: false, codigo: "interessado-ambiguo" },
      "indisponivel": { ok: false, codigo: "interessado-indisponivel" },
    };
    const resolucoes: ResolucaoInteressadoVenda[] = [
      { status: "nao-encontrado" }, { status: "telefone-invalido" }, { status: "em-revisao", candidatos: [C1] },
      { status: "encontrado", contatoId: C1, seguiuFusao: false, avisos: [] }, { status: "ambiguo", candidatos: [C1, C2] },
      { status: "indisponivel", motivo: "contato-anonimizado" },
    ];
    for (const r of resolucoes) expect(decidirInteressadoNovoVenda(novo("Ana", TELEFONE), r)).toEqual(esperado[r.status]);
  });

  it("novo sem telefone cria pessoa própria; resolução incoerente com o telefone é defeito", () => {
    expect(decidirInteressadoNovoVenda(novo("Ana", null), null)).toEqual({ ok: true, acao: "criar-contato" });
    expect(() => decidirInteressadoNovoVenda(novo("Ana", null), { status: "nao-encontrado" })).toThrow(EntradaInteressadoInvalida);
    expect(() => decidirInteressadoNovoVenda(novo("Ana", TELEFONE), null)).toThrow(EntradaInteressadoInvalida);
  });
});

describe("Vendas B3.1: casos A a J do B3.0", () => {
  it("A: número existente resolve a pessoa e o modo novo com ele é conflito", () => {
    const r = resolverInteressadoVenda(entrada({ telefone: "5543998024316", canaisAtivos: [canal(C1)], contatos: [contato(C1)] }));
    expect(r).toEqual({ status: "encontrado", contatoId: C1, seguiuFusao: false, avisos: [] });
    expect(decidirInteressadoNovoVenda(novo("Ana", TELEFONE), r)).toEqual({ ok: false, codigo: "telefone-ja-cadastrado" });
    expect(avaliarContatoExistenteVenda(C1, CONTA, contato(C1)).ok).toBe(true);
  });

  it("B: número novo permite criar", () => {
    expect(decidirInteressadoNovoVenda(novo("Ana", TELEFONE), resolverInteressadoVenda(entrada()))).toEqual({ ok: true, acao: "criar-contato" });
  });

  it("C: nome diferente não muda a resolução nem renomeia: nome não é entrada nem saída", () => {
    const r = resolverInteressadoVenda(entrada({ canaisAtivos: [canal(C1)], contatos: [contato(C1)] }));
    expect(r.status).toBe("encontrado");
    expect(Object.keys(r).sort()).toEqual(["avisos", "contatoId", "seguiuFusao", "status"]);
    expect(decidirInteressadoNovoVenda(novo("Outro Nome", TELEFONE), r)).toEqual({ ok: false, codigo: "telefone-ja-cadastrado" });
  });

  it("D: dois contatos para o mesmo número não são escolhidos", () => {
    const r = resolverInteressadoVenda(entrada({ canaisAtivos: [canal(C1), canal(C2)], contatos: [contato(C1), contato(C2)] }));
    expect(r.status).toBe("ambiguo");
    expect(decidirInteressadoNovoVenda(novo("Ana", TELEFONE), r)).toEqual({ ok: false, codigo: "interessado-ambiguo" });
  });

  it("E: outra conta não aparece; o mesmo número fica livre para esta conta", () => {
    const r = resolverInteressadoVenda(entrada()); // a consulta filtrada por auth.uid() não traz a outra conta
    expect(r).toEqual({ status: "nao-encontrado" });
    expect(decidirInteressadoNovoVenda(novo("Ana", TELEFONE), r)).toEqual({ ok: true, acao: "criar-contato" });
    expect(avaliarContatoExistenteVenda(C1, CONTA, { ...contato(C1), userId: OUTRA })).toEqual({ ok: false, codigo: "contato-invalido" });
  });

  it("F: sem telefone exige nome e sempre cria pessoa própria", () => {
    expect(validarInteressadoVenda({ modo: "novo", nome: "", telefone: null })).toEqual({ ok: false, codigo: "nome-invalido" });
    expect(decidirInteressadoNovoVenda(novo("Ana", null), null)).toEqual({ ok: true, acao: "criar-contato" });
  });

  it("G: contato existente não ganha telefone pelo B3", () => {
    expect(validarInteressadoVenda({ modo: "existente", contatoId: C1, telefone: TELEFONE })).toEqual({ ok: false, codigo: "estrutura-invalida" });
    expect(avaliarContatoExistenteVenda(C1, CONTA, contato(C1))).toEqual({ ok: true, contatoId: C1, avisos: [] });
  });

  it("H: fundido segue o sobrevivente na busca e é recusado por id; anonimizado recusado; arquivado e revisão avisam", () => {
    const fundido = contato(C1, { fundidoEmContatoId: C2, arquivado: true });
    expect(resolverInteressadoVenda(entrada({ canaisAtivos: [canal(C1)], contatos: [fundido, contato(C2)] })))
      .toMatchObject({ status: "encontrado", contatoId: C2, seguiuFusao: true });
    expect(avaliarContatoExistenteVenda(C1, CONTA, fundido)).toEqual({ ok: false, codigo: "contato-fundido" });
    expect(avaliarContatoExistenteVenda(C1, CONTA, contato(C1, { anonimizado: true }))).toEqual({ ok: false, codigo: "contato-anonimizado" });
    expect(avaliarContatoExistenteVenda(C1, CONTA, contato(C1, { arquivado: true, revisaoPendente: true })))
      .toEqual({ ok: true, contatoId: C1, avisos: ["contato-arquivado", "revisao-pendente"] });
    expect(resolverInteressadoVenda(entrada({ revisoesTelefone: [canal(C1)] }))).toEqual({ status: "em-revisao", candidatos: [C1] });
  });

  it("I: não existe porta que troque o contato (o banco recusa contatoId fora do criar: ver teste de paridade)", () => {
    expect(Object.keys(PORTAS_VENDAS).filter((porta) => /contato|interessado/.test(porta))).toEqual([]);
    // @ts-expect-error nenhuma porta de alteração aceita contatoId
    const alteracao: ComandosVenda["alterar_imovel"] = { chaveIdempotencia: "k", oportunidadeId: C1, versaoEsperada: 1, imovelTratado: null, contatoId: C2 };
    expect(alteracao.versaoEsperada).toBe(1);
  });

  it("J: o mesmo contato pode entrar em várias oportunidades; nada aqui conta oportunidades", () => {
    const r1 = resolverInteressadoVenda(entrada({ canaisAtivos: [canal(C1)], contatos: [contato(C1)] }));
    const r2 = resolverInteressadoVenda(entrada({ canaisAtivos: [canal(C1)], contatos: [contato(C1)] }));
    expect(r1).toEqual(r2);
    expect(avaliarContatoExistenteVenda(C1, CONTA, contato(C1))).toEqual(avaliarContatoExistenteVenda(C1, CONTA, contato(C1)));
  });
});

describe("Vendas B3.1: fingerprint", () => {
  const hash = (identificacao: IdentificacaoCriarVenda) => createHash("sha256").update(codificarArvoreFingerprintVenda(arvoreFingerprintCriarVenda({
    usuario: CONTA, chaveIdempotencia: " chave ", identificacao, imovel: null, origem: null, valorNegocioPrevisto: null, receitaPrevista: null,
  }))).digest("hex");
  const identificar = (comando: unknown) => {
    const r = classificarIdentificacaoCriarVenda(comando);
    if (!r.ok) throw new Error(r.codigo);
    return r.identificacao;
  };

  it("codificação é a do B2: tipo, tamanho em bytes e conteúdo, sem ambiguidade", () => {
    const texto = (arvore: Parameters<typeof codificarArvoreFingerprintVenda>[0]) => new TextDecoder().decode(codificarArvoreFingerprintVenda(arvore));
    expect(texto(["a", null, [true, false], "é", 12])).toBe("A5:S1:aNA2:TFS2:éD2:12");
    expect(texto(["ab"])).not.toBe(texto(["a", "b"]));
    expect(() => codificarArvoreFingerprintVenda(0.5)).toThrow(EntradaInteressadoInvalida);
  });

  it("legado B2 conserva a árvore exata; existente com o mesmo id é outro pedido", () => {
    expect(arvoreFingerprintCriarVenda({ usuario: CONTA, chaveIdempotencia: " chave ", identificacao: identificar({ contatoId: C1 }), imovel: null, origem: null, valorNegocioPrevisto: null, receitaPrevista: null }))
      .toEqual(["vendas-b2-fingerprint-1", CONTA, " chave ", "criar", null, null, [C1, null, null, null, null]]);
    expect(hash(identificar({ contatoId: C1 }))).not.toBe(hash(identificar({ interessado: { modo: "existente", contatoId: C1 } })));
    expect(hash(identificar({ interessado: { modo: "existente", contatoId: C1.toUpperCase() } })))
      .toBe(hash(identificar({ interessado: { modo: "existente", contatoId: C1 } })));
  });

  it("novo usa nome aparado e telefone canônico: grafias do mesmo número são o mesmo pedido", () => {
    const base = hash(identificar({ interessado: { modo: "novo", nome: "Ana", telefone: TELEFONE } }));
    for (const telefone of ["43998024316", "+55 43 99802-4316", "554398024316", " 0 43 99802 4316 "]) {
      expect(hash(identificar({ interessado: { modo: "novo", nome: "  Ana ", telefone } }))).toBe(base);
    }
    expect(hash(identificar({ interessado: { modo: "novo", nome: "ana", telefone: TELEFONE } }))).not.toBe(base);
    expect(hash(identificar({ interessado: { modo: "novo", nome: "Ana", telefone: null } }))).not.toBe(base);
    expect(hash(identificar({ interessado: { modo: "novo", nome: "Ana", telefone: "(43) 3324-5678" } }))).not.toBe(base);
  });
});

describe("Vendas B3.1: catálogo de erros", () => {
  const codigos = Object.keys(ERROS_INTERESSADO_VENDA);
  it("contém o mínimo aprovado", () => {
    for (const codigo of ["telefone-invalido", "telefone-em-revisao", "telefone-ja-cadastrado", "interessado-ambiguo",
      "interessado-indisponivel", "contato-fundido", "contato-anonimizado", "nome-invalido", "estrutura-invalida", "conflito-transitorio"]) {
      expect(codigos).toContain(codigo);
    }
  });

  it("todos decodificam com o SQLSTATE do catálogo; os novos não existiam no catálogo SQL do B2", () => {
    // Desde o B3.2 o decodificador conhece os códigos novos; a origem continua sendo a migration B2.
    const catalogoB2 = readFileSync(new URL("../../supabase/migrations/20261005160044_vendas_v1_b2_operacoes.sql", import.meta.url), "utf8");
    for (const [codigo, erro] of Object.entries(ERROS_INTERESSADO_VENDA)) {
      expect(CODIGOS_ERRO_VENDA).toContain(codigo);
      const detalhe = JSON.stringify({ contrato: "vendas-b2-v1", codigo, motivo: null });
      expect(decodificarErroVenda({ code: erro.estado, details: detalhe })).toEqual({ codigo, motivo: null });
      expect(catalogoB2.includes(`'${codigo}'`)).toBe(erro.origem === "b2");
    }
  });

  it("mensagens não carregam dado do contato", () => {
    for (const erro of Object.values(ERROS_INTERESSADO_VENDA)) expect(erro.mensagem).not.toMatch(/\{|\$|%s|\d{4}/);
  });
});
