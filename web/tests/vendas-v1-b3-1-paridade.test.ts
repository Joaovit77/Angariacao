/* B3.1: o contrato TS contra o SQL real, num Postgres local descartável
   (PGlite). Nada aqui toca banco remoto: o SQL vem do schema canônico e
   das migrations B1/B2 versionadas. */
import { PGlite } from "@electric-sql/pglite";
import { createHash, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { telefoneCanonico } from "../lib/calculo/webhookWhatsapp";
import { codificarNumericVenda } from "../lib/persistencia/vendasDecodificacao";
import {
  arvoreFingerprintCriarVenda, classificarIdentificacaoCriarVenda, codificarArvoreFingerprintVenda,
  type ArvoreFingerprintVenda,
} from "../lib/persistencia/vendasInteressado";

const ler = (arquivo: string) => readFileSync(new URL("../../" + arquivo, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const A = "11111111-1111-4111-8111-111111111111";
const CA = "33333333-3333-4333-8333-333333333333";
let db: PGlite;

beforeAll(async () => {
  db = new PGlite();
  await db.exec("create schema private; create schema auth; create role anon; create role authenticated; create role service_role bypassrls; create table auth.users(id uuid primary key); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema auth,public to authenticated,anon,service_role;");
  const schema = ler("supabase-schema.sql");
  const funcao = schema.indexOf("create or replace function telefone_canonico(telefone text)");
  await db.exec(schema.slice(funcao, schema.indexOf("\n$$;", funcao) + 4));
  for (const nome of ["imoveis", "public.contatos"]) {
    const inicio = schema.indexOf("create table if not exists " + nome + " (");
    await db.exec(schema.slice(inicio, schema.indexOf("\n);", inicio) + 3));
  }
  await db.exec("alter table public.imoveis add column unidade text; alter table public.imoveis add column bloco text;");
  await db.exec(ler("supabase/migrations/20260921173129_imoveis_unique_id_user_id.sql"));
  await db.exec(ler("supabase/migrations/20261005003257_vendas_v1_b1_estrutura.sql"));
  await db.exec(ler("supabase/migrations/20261005160044_vendas_v1_b2_operacoes.sql"));
}, 60_000);
afterAll(async () => { if (db) await db.close(); });

/** Vetores com o resultado esperado pelo produto; a paridade é cobrada à parte. */
const VETORES_TELEFONE: readonly (readonly [string | null, string | null])[] = [
  // máscara, celular com o nono
  ["(43) 99802-4316", "4398024316"], ["43 99802 4316", "4398024316"], ["43998024316", "4398024316"],
  // DDI 55, com e sem +, com e sem o nono
  ["+55 (43) 99802-4316", "4398024316"], ["55 43 99802-4316", "4398024316"], ["5543998024316", "4398024316"],
  ["554398024316", "4398024316"],
  // zeros à esquerda (operadora/discagem)
  ["0 43 99802-4316", "4398024316"], ["043998024316", "4398024316"], ["00 55 43 99802-4316", "4398024316"],
  // fixo e celular antigo de 10 dígitos
  ["(43) 3324-5678", "4333245678"], ["+55 43 3324-5678", "4333245678"], ["43 8802-4316", "4388024316"],
  // DDD 55 não é confundido com DDI
  ["(55) 99123-4567", "5591234567"], ["+55 (55) 99123-4567", "5591234567"], ["(55) 3222-1234", "5532221234"],
  // espaços e brancos Unicode
  ["  (43) 99802-4316\t\n", "4398024316"], [" 43998024316　", "4398024316"],
  // risco conhecido e herdado: fixo e celular "9 + mesmo número" colidem
  ["43 9 3324-5678", "4333245678"],
  // inválidos, incompletos e estrangeiros
  [null, null], ["", null], ["   ", null], ["abc", null], ["9802-4316", null], ["43 9802-431", null],
  ["43 89802-4316", null], ["43 99802-43160", null], ["5543998024316 ramal 21", null],
  ["+1 415 555 2671", null], ["+44 20 7946 0958", null], ["+351 912 345 678", null],
  ["４３９９８０２４３１６", null], ["٤٣٩٩٨٠٢٤٣١٦", null],
];

describe("Vendas B3.1: telefone canônico TS × SQL", () => {
  it.each(VETORES_TELEFONE)("%j → %j nas duas implementações", async (entrada, esperado) => {
    const sql = (await db.query<{ c: string | null }>("select telefone_canonico($1) c", [entrada])).rows[0].c;
    expect(telefoneCanonico(entrada)).toBe(esperado);
    expect(sql).toBe(esperado);
  });
});

describe("Vendas B3.1: fingerprint B2 preservado", () => {
  async function fingerprintSql(comando: Record<string, unknown>) {
    return (await db.query<{ hash: string }>("select private.vendas_b2_fingerprint($1::uuid,'criar',private.vendas_b2_normalizar('criar',$2::jsonb)) hash",
      [A, JSON.stringify(comando)])).rows[0].hash;
  }
  const numerico = (valor: number | null): ArvoreFingerprintVenda => valor === null ? null : ["numeric", codificarNumericVenda(valor)];
  function fingerprintTs(comando: Record<string, unknown>, imovel: ArvoreFingerprintVenda, origem: ArvoreFingerprintVenda, previsto: number | null, receita: number | null) {
    const r = classificarIdentificacaoCriarVenda(comando);
    if (!r.ok) throw new Error(r.codigo);
    return createHash("sha256").update(codificarArvoreFingerprintVenda(arvoreFingerprintCriarVenda({
      usuario: A, chaveIdempotencia: comando.chaveIdempotencia as string, identificacao: r.identificacao,
      imovel, origem, valorNegocioPrevisto: numerico(previsto), receitaPrevista: numerico(receita),
    }))).digest("hex");
  }
  const imovelId = "55555555-5555-4555-8555-555555555555";
  it.each([
    ["mínimo", { chaveIdempotencia: " chave ", contatoId: CA }, null, null, null, null],
    ["id maiúsculo", { chaveIdempotencia: "k-2", contatoId: CA.toUpperCase() }, null, null, null, null],
    ["referência", { chaveIdempotencia: "k-3", contatoId: CA, imovelTratado: { modo: "referencia", imovelId: imovelId.toUpperCase() } }, ["referencia", imovelId], null, null, null],
    ["manual aparado", { chaveIdempotencia: "k-4", contatoId: CA, imovelTratado: { modo: "manual", endereco: " Rua A, 10 ", referencia: "  " } }, ["manual", "Rua A, 10", null, null, null, null], null, null, null],
    ["origem e valores", { chaveIdempotencia: "k-5", contatoId: CA, origem: { tipo: "portal", descricao: " ZAP " }, valorNegocioPrevisto: "0.1", receitaPrevista: "1000" }, null, ["portal", "ZAP"], 0.1, 1000],
    ["unicode na chave", { chaveIdempotencia: "chave-é-😀", contatoId: CA, receitaPrevista: null }, null, null, null, null],
  ] as const)("%s: a árvore TS do legado reproduz o hash SQL do B2", async (_nome, comando, imovel, origem, previsto, receita) => {
    expect(fingerprintTs(comando, imovel as ArvoreFingerprintVenda, origem as ArvoreFingerprintVenda, previsto, receita)).toBe(await fingerprintSql(comando));
  });
});

describe("Vendas B3.1: o B2 em vigor não tem caminho para o B3 nem para troca de contato", () => {
  async function normalizar(porta: string, comando: Record<string, unknown>) {
    return db.query("select private.vendas_b2_normalizar($1,$2::jsonb)", [porta, JSON.stringify(comando)]);
  }
  it("criar com interessado, ou com as duas formas, é recusado como estrutura inválida", async () => {
    for (const comando of [
      { chaveIdempotencia: "k", interessado: { modo: "existente", contatoId: CA } },
      { chaveIdempotencia: "k", contatoId: CA, interessado: { modo: "existente", contatoId: CA } },
    ]) await expect(normalizar("criar", comando)).rejects.toMatchObject({ code: "PT422" });
  });
  it.each([
    ["transicionar", { destino: "em_atendimento" }],
    ["alterar_imovel", { imovelTratado: null }],
    ["alterar_valores", { valorNegocioPrevisto: null, receitaPrevista: null }],
    ["ganhar", { confirmacaoExplicita: true, dataFato: "2026-10-01", registroFormalizacao: "Contrato assinado" }],
    ["perder", { dataFato: "2026-10-01", motivo: "outro", justificativa: "Contato incorreto" }],
    ["arquivar", {}],
  ] as const)("%s: comando válido passa; o mesmo com contatoId ou interessado é recusado", async (porta, corpo) => {
    const valido = { chaveIdempotencia: randomUUID(), oportunidadeId: CA, versaoEsperada: 1, ...corpo };
    await expect(normalizar(porta, valido)).resolves.toBeDefined();
    for (const extra of [{ contatoId: CA }, { interessado: { modo: "existente", contatoId: CA } }]) {
      await expect(normalizar(porta, { ...valido, ...extra })).rejects.toMatchObject({ code: "PT422" });
    }
  });
});
