import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/* Imóvel de venda, IV-4A: o contrato do SQL, lido do arquivo. A migration
   só recria `private.prever_locacoes` com um bloco novo (a recusa de
   `venda`) e repete o revoke original; o schema canônico a espelha
   literalmente. O comportamento está em `imovel-venda-iv4a-banco.test.ts`. */

const ler = (arquivo: string) => readFileSync(new URL("../../" + arquivo, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const NOME = "20261008150000_imoveis_finalidade_guarda_locacao.sql";
const MIGRATION = ler("supabase/migrations/" + NOME);
const ORIGINAL = ler("supabase/migrations/20260908132609_repasses_configuraveis.sql");
const SCHEMA = ler("supabase-schema.sql");
const CODIGO = MIGRATION.split("\n").filter((linha) => !/^\s*--/.test(linha)).join("\n");

/** O `create or replace function private.prever_locacoes(...) ... $$;` de um texto. */
function funcao(texto: string) {
  const inicio = texto.indexOf("create or replace function private.prever_locacoes(");
  const corpo = texto.indexOf("as $$", inicio) + "as $$".length;
  return texto.slice(inicio, texto.indexOf("$$;", corpo) + "$$;".length);
}

const GUARDA = /\n    -- IV-4A:[^\n]*\n(?:    --[^\n]*\n)*    if v_imovel\.finalidade = 'venda' then\n[\s\S]*?\n      continue;\n    end if;\n/;

describe("IV-4A: migration", () => {
  it("vem logo depois do IV-1, com timestamp de 08/10, sem colidir com a R6.1 antiga", () => {
    const pasta = readdirSync(new URL("../../supabase/migrations/", import.meta.url)).filter((f) => f.endsWith(".sql")).sort();
    expect(pasta.at(-1)).toBe(NOME);
    expect(pasta.at(-2)).toBe("20261006200215_imoveis_finalidade_venda.sql");
    expect(NOME.slice(0, 14) > "20261006200215").toBe(true);
    expect(NOME.startsWith("20261008")).toBe(true);
    expect(pasta.filter((f) => f.slice(0, 14) === NOME.slice(0, 14))).toEqual([NOME]);
    expect(pasta.some((f) => f.startsWith("20261003233240"))).toBe(false);
    expect(NOME).not.toMatch(/dedupe|duplic|prospeccao|radar|r6_1|vendas_v1/);
  });

  it("uma transação: timeouts locais, a função e o revoke original", () => {
    const comandos = CODIGO.split(/;\n/).map((c) => c.trim()).filter(Boolean);
    expect(comandos[0]).toBe("begin");
    expect(comandos[1]).toBe("set local lock_timeout = '5s'");
    expect(comandos[2]).toBe("set local statement_timeout = '60s'");
    expect(comandos.at(-1)).toBe("commit");
    expect(comandos.at(-2)).toBe(
      "revoke all on function private.prever_locacoes(uuid, uuid, jsonb, boolean) from public, anon, authenticated",
    );
    expect(ORIGINAL).toContain(comandos.at(-2) + ";");
  });

  it("o corpo é o da migration de repasses mais um único bloco, depois do de retirado", () => {
    const nova = funcao(MIGRATION);
    const antiga = funcao(ORIGINAL);
    expect(nova.match(new RegExp(GUARDA.source, "g"))).toHaveLength(1);
    expect(nova.replace(GUARDA, "\n")).toBe(antiga);
    const retirado = nova.indexOf("'codigo', 'imovel_retirado'");
    const guarda = nova.indexOf("if v_imovel.finalidade = 'venda' then");
    const datas = nova.indexOf("v_data := private.ler_data_iso");
    expect(retirado).toBeGreaterThan(0);
    expect(guarda).toBeGreaterThan(retirado);
    expect(datas).toBeGreaterThan(guarda);
  });

  it("compara com 'venda' explicitamente, sem barrar null nem locacao_venda, e fora de p_validar_status", () => {
    const referencias = [...CODIGO.matchAll(/[^\n]*finalidade[^\n]*/g)].map((m) => m[0].trim());
    expect(referencias).toEqual([
      "if v_imovel.finalidade = 'venda' then",
      "'codigo', 'finalidade_venda',",
      "'mensagem', 'Imóvel com finalidade Venda não pode ser marcado como locado.'",
    ]);
    expect(CODIGO).not.toMatch(/finalidade\s*(<>|!=|is distinct|not in|in \()/i);
  });

  it("mantém assinatura, retorno, SECURITY DEFINER e search_path, sem nada além da função", () => {
    const cabecalho = funcao(MIGRATION).slice(0, funcao(MIGRATION).indexOf("as $$"));
    expect(cabecalho).toBe(funcao(ORIGINAL).slice(0, funcao(ORIGINAL).indexOf("as $$")));
    expect(cabecalho).toMatch(/returns jsonb\nlanguage plpgsql\nsecurity definer\nset search_path = ''\n$/);
    expect(CODIGO.match(/create or replace function/g)).toHaveLength(1);
    expect(CODIGO).not.toMatch(/\bcreate (table|index|unique index|policy|trigger|type)\b|\balter (table|function|policy)\b|\bgrant\b|\bdrop\b|\benum\b/i);
    expect(CODIGO).not.toMatch(/^\s*(insert|update|delete|truncate|copy)\b/im);
  });
});

describe("IV-4A: espelho no schema canônico", () => {
  const bloco = (texto: string) => texto.split("-- BEGIN IMOVEL VENDA IV-4A\n")[1]?.split("-- END IMOVEL VENDA IV-4A\n")[0];

  it("o bloco entre os marcadores é a migration inteira, idêntica, uma vez só", () => {
    expect(bloco(SCHEMA)).toBe(MIGRATION);
    expect(SCHEMA.match(/-- BEGIN IMOVEL VENDA IV-4A/g)).toHaveLength(1);
    expect(SCHEMA.match(/-- END IMOVEL VENDA IV-4A/g)).toHaveLength(1);
  });

  it("fica logo depois do Vendas B3.2, com cabeçalho apontando a migration, e vem depois da definição antiga", () => {
    expect(SCHEMA).toMatch(
      /-- END VENDAS V1-B3\.2\n\n-- =+\n-- IMÓVEL DE VENDA IV-4A: [^\n]*\n-- supabase\/migrations\/20261008150000_imoveis_finalidade_guarda_locacao\.sql; o\n/,
    );
    const inicio = SCHEMA.indexOf("-- BEGIN IMOVEL VENDA IV-4A");
    expect(SCHEMA.indexOf("create or replace function private.prever_locacoes(")).toBeLessThan(inicio);
    expect(SCHEMA.lastIndexOf("create or replace function private.prever_locacoes(")).toBeGreaterThan(inicio);
    expect(SCHEMA.match(/create or replace function private\.prever_locacoes\(/g)).toHaveLength(2);
  });

  it("a definição antiga no schema continua igual à migration de repasses (aplicar o schema inteiro termina na nova)", () => {
    expect(funcao(SCHEMA)).toBe(funcao(ORIGINAL));
  });
});
