// R6.1-A: complemento estrutural em PGlite, sem APIs, credenciais ou dados reais.
// Não comprova RLS/PostgREST/ACL reais nem corrida multi-conexão; esses gates permanecem no R6.1-C.
import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { chaveNormalizada } from "@/lib/normalizacao";
import { UFS_BRASIL } from "@/lib/calculo/geografia";

const RAIZ = new URL("../../", import.meta.url);
const NOME = "20261014111445_radar_r6_1_fundacao_global_ofertas.sql";
const ler = (nome: string) => readFileSync(new URL(nome, RAIZ), "utf8").replace(/\r\n/g, "\n");
const MIGRATION = ler("supabase/migrations/" + NOME);
const SCHEMA = ler("supabase-schema.sql");
const ESPELHO = SCHEMA.split("-- BEGIN RADAR R6.1-A\n")[1]?.split("-- END RADAR R6.1-A")[0]?.trim() ?? "";
const TABELAS = ["radar_universos", "radar_varreduras", "radar_anuncios_globais", "radar_presencas"];
const LEGADAS = ["radar_buscas", "radar_anuncios", "central_anuncios_visualizados", "comparaveis_mercado", "observacoes_comparaveis_mercado", "mercados_monitorados"];
const PORTAIS = ["zap", "viva-real", "chaves-na-mao", "olx", "wimoveis"];
const T0 = "2026-10-14T12:00:00Z", T1 = "2026-10-14T12:01:00Z", T2 = "2026-10-14T12:02:00Z";
type Valores = Record<string, unknown>;

const COLUNAS: Record<string, string[]> = {
  radar_universos: ["id","portal","finalidade","uf","cidade","tipo_recorte","anunciante_recorte","versao_semantica","baseline_varredura_id","baseline_concluido_em","criado_em"],
  radar_varreduras: ["id","universo_id","chave_idempotencia","iniciada_em","concluida_em","status","expira_em","iniciador","aquisicao_id","aquisicao_em","origem_aquisicao","versao_aquisicao","cobertura","codigo_resultado","contagem_bruta","contagem_admitida","paginas_lidas","paginas_planejadas","criado_em"],
  radar_anuncios_globais: ["id","portal","finalidade","id_externo","url_canonica","primeira_varredura_id","primeiro_visto_em","ultimo_visto_em","dados_objetivos","criado_em"],
  radar_presencas: ["varredura_id","anuncio_global_id","observado_em","preco_observado","tipo_observado","uf_observada","cidade_observada","url_observada","dados_objetivos"],
};
const ATUALIZAVEIS: Record<string, string[]> = {
  radar_universos: ["baseline_varredura_id","baseline_concluido_em"],
  radar_anuncios_globais: ["url_canonica","ultimo_visto_em","dados_objetivos"],
  radar_varreduras: ["concluida_em","status","expira_em","aquisicao_id","aquisicao_em","origem_aquisicao","versao_aquisicao","cobertura","codigo_resultado","contagem_bruta","contagem_admitida","paginas_lidas","paginas_planejadas"],
  radar_presencas: [],
};
// Defaults permissivos de propósito: REVOKE esquecido deve aparecer no catálogo.
const PREPARACAO = [
  "create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls;",
  "grant usage on schema public to anon, authenticated, service_role;",
  "alter default privileges in schema public grant all on tables to public, anon, authenticated, service_role;",
].join("\n");

async function catalogo(db: PGlite, tabelas: string[]) {
  const nomes = [tabelas];
  return {
    colunas: (await db.query<{table_name:string;column_name:string;data_type:string;is_nullable:string;column_default:string|null}>(
      "select table_name,column_name,data_type,is_nullable,column_default from information_schema.columns where table_schema='public' and table_name=any($1::text[]) order by table_name,ordinal_position", nomes)).rows,
    constraints: (await db.query<{tabela:string;conname:string;contype:string;definicao:string}>(
      "select c.relname as tabela,k.conname,k.contype,pg_get_constraintdef(k.oid) as definicao from pg_constraint k join pg_class c on c.oid=k.conrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname=any($1::text[]) order by c.relname,k.conname", nomes)).rows,
    indices: (await db.query<{tablename:string;indexname:string;indexdef:string}>(
      "select tablename,indexname,indexdef from pg_indexes where schemaname='public' and tablename=any($1::text[]) order by tablename,indexname", nomes)).rows,
    seguranca: (await db.query<{relname:string;relrowsecurity:boolean;relacl:string|null}>(
      "select c.relname,c.relrowsecurity,c.relacl::text from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname=any($1::text[]) order by c.relname", nomes)).rows,
    policies: (await db.query(
      "select tablename,policyname,roles,cmd,qual,with_check from pg_policies where schemaname='public' and tablename=any($1::text[]) order by tablename,policyname", nomes)).rows,
    updates: (await db.query<{table_name:string;column_name:string;grantee:string}>(
      "select table_name,column_name,grantee from information_schema.column_privileges where table_schema='public' and table_name=any($1::text[]) and privilege_type='UPDATE' order by table_name,column_name,grantee", nomes)).rows,
  };
}

describe("R6.1-A — escopo aditivo e espelho", () => {
  it("possui uma migration nova posterior ao B0 e espelho integral", () => {
    const nomes = readdirSync(new URL("supabase/migrations/", RAIZ)).filter(n => n.endsWith(".sql")).sort();
    expect(nomes.filter(n => n.endsWith("_radar_r6_1_fundacao_global_ofertas.sql"))).toEqual([NOME]);
    expect(NOME.slice(0,14) > "20261011203141").toBe(true);
    // A/B continuam imutáveis; somente a ponte aditiva aprovada pode sucedê-las.
    expect(nomes.slice(nomes.indexOf(NOME)+1)).toEqual(["20261014130154_radar_r6_1_b_invariantes_globais.sql", "20261021120000_radar_baseline_cobertura_novos.sql", "20261022180000_radar_chaves_populacao_qualificada.sql"]);
    expect(nomes).not.toContain("20261003233240_radar_r6_1_schema_global.sql");
    expect(SCHEMA.split("-- BEGIN RADAR R6.1-A")).toHaveLength(2);
    expect(SCHEMA.split("-- END RADAR R6.1-A")).toHaveLength(2);
    expect(ESPELHO).toBe(MIGRATION.trim());
  });

  it("é transacional e cria só quatro tabelas, sem DML, funções, policies, triggers ou legado", () => {
    const codigo = MIGRATION.replace(/--[^\n]*/g,"").replace(/comment on[\s\S]*?;/gi,"");
    expect(codigo.trim()).toMatch(/^begin;/);
    expect(codigo.trim()).toMatch(/commit;$/);
    expect([...codigo.matchAll(/create table public\.(\w+)/g)].map(m => m[1])).toEqual(TABELAS);
    expect(codigo).not.toMatch(/\b(insert into|delete from|truncate|create (?:or replace )?function|create trigger|create policy|alter default privileges|security definer)\b/i);
    expect(codigo).not.toMatch(/^\s*update\s/gim);
    for (const tabela of LEGADAS) expect(codigo).not.toMatch(new RegExp("\\b"+tabela+"\\b"));
    expect(codigo).not.toMatch(/\b(user_id|owner_id|visto|novo|fingerprint|posicao)\b/i);
  });

  it("nenhum consumidor de aplicação referencia as tabelas globais", () => {
    for (const pasta of ["web/app/","web/lib/","web/components/"]) {
      const raiz = new URL(pasta,RAIZ);
      for (const nome of readdirSync(raiz,{recursive:true})) {
        if (typeof nome !== "string" || !/\.(ts|tsx|js|mjs)$/.test(nome)) continue;
        const codigo = readFileSync(new URL(nome.replace(/\\/g,"/"),raiz),"utf8");
        for (const tabela of TABELAS) expect(codigo,pasta+nome).not.toContain(tabela);
      }
    }
  });

  it("documenta semântica autorizada, limites de PII e pendências operacionais", () => {
    for (const palavra of ["OBSERVACIONAL","primeira observação global confirmada","recente","R6.1-B","R6.2","R6.3",
      "telefone","e-mail","proprietário","contato","HTML bruto","cookie","token","dado privado","allowlist"]) expect(MIGRATION).toContain(palavra);
    expect(ler("PROJECT.md")).toContain("primeiro observado globalmente após baseline");
  });

  it("migration e espelho deixam quatro tabelas vazias com catálogo equivalente", async () => {
    const a = new PGlite(), b = new PGlite();
    try {
      for (const banco of [a,b]) await banco.exec(PREPARACAO);
      await a.exec(MIGRATION); await b.exec(ESPELHO);
      expect(await catalogo(a,TABELAS)).toEqual(await catalogo(b,TABELAS));
      for (const banco of [a,b]) for (const tabela of TABELAS) {
        expect((await banco.query("select count(*)::int as n from public."+tabela)).rows).toEqual([{n:0}]);
      }
    } finally { await a.close(); await b.close(); }
  },30_000);
});

describe.sequential("R6.1-A — contrato estrutural no PostgreSQL embutido", () => {
  let db: PGlite;
  let legadoAntes: Awaited<ReturnType<typeof catalogo>>;
  let numeroTentativa = 0;
  beforeAll(async () => {
    db = new PGlite(); await db.exec(PREPARACAO);
    // Sentinelas locais detectam alteração de estrutura, dados, ACL e policies anteriores.
    for (const tabela of LEGADAS) await db.exec(
      "create table public."+tabela+" (id uuid primary key,sentinela text not null);"+
      "alter table public."+tabela+" enable row level security;"+
      "create policy legado_select on public."+tabela+" for select to authenticated using (true);"+
      "insert into public."+tabela+" values ('00000000-0000-0000-0000-000000000001','preservar');");
    legadoAntes = await catalogo(db,LEGADAS);
    await db.exec(MIGRATION);
  },30_000);
  beforeEach(async () => { await db.exec("reset role; begin"); });
  afterEach(async () => { await db.exec("rollback; reset role"); });
  afterAll(async () => { await db?.close(); });

  // Rejeição esperada não aborta o restante do cenário.
  async function tentar<T>(acao: () => Promise<T>): Promise<T> {
    const nome = "tentativa_"+ ++numeroTentativa;
    await db.exec("savepoint "+nome);
    try { return await acao(); }
    catch (erro) { await db.exec("rollback to savepoint "+nome); throw erro; }
    finally { await db.exec("release savepoint "+nome); }
  }
  async function inserir(tabela:string,dados:Valores):Promise<string> {
    const colunas = Object.keys(dados);
    return tentar(async () => (await db.query<{id:string}>(
      "insert into public."+tabela+" ("+colunas.join(",")+") values ("+colunas.map((_,i)=>"$"+(i+1)).join(",")+") returning id",
      Object.values(dados))).rows[0].id);
  }
  const universo = (dados:Valores = {}) => inserir("radar_universos",{
    portal:"zap",finalidade:"locacao",uf:"PR",cidade:"londrina",tipo_recorte:"apartamento",
    anunciante_recorte:"todos",versao_semantica:1,...dados,
  });
  async function varredura(dados:Valores = {}) {
    return inserir("radar_varreduras",{
      universo_id: "universo_id" in dados ? dados.universo_id : await universo({cidade:"teste-"+randomUUID()}),
      chave_idempotencia:randomUUID(),iniciada_em:T0,status:"running",iniciador:"teste_local",cobertura:"desconhecida",...dados,
    });
  }
  async function anuncio(dados:Valores = {}) {
    return inserir("radar_anuncios_globais",{
      portal:"zap",finalidade:"locacao",id_externo:"123",url_canonica:"https://www.zapimoveis.com.br/imovel/sintetico-id-123/",
      primeira_varredura_id:"primeira_varredura_id" in dados ? dados.primeira_varredura_id : await varredura(),
      primeiro_visto_em:T0,ultimo_visto_em:T1,...dados,
    });
  }
  async function presenca(v:string,a:string,dados:Valores = {}) {
    const valores = {varredura_id:v,anuncio_global_id:a,observado_em:T1,...dados};
    const colunas = Object.keys(valores);
    return tentar(() => db.query("insert into public.radar_presencas ("+colunas.join(",")+") values ("+
      colunas.map((_,i)=>"$"+(i+1)).join(",")+")",Object.values(valores)));
  }

  it("preserva sentinelas, catálogo, ACL e policies legadas", async () => {
    expect(await catalogo(db,LEGADAS)).toEqual(legadoAntes);
    for (const tabela of LEGADAS) expect((await db.query("select sentinela from public."+tabela)).rows).toEqual([{sentinela:"preservar"}]);
  });

  it("mantém colunas exatas, timestamptz, defaults mínimos e zero triggers", async () => {
    const {colunas} = await catalogo(db,TABELAS);
    for (const [tabela,esperadas] of Object.entries(COLUNAS)) expect(colunas.filter(c=>c.table_name===tabela).map(c=>c.column_name)).toEqual(esperadas);
    const instantes = colunas.filter(c=>c.column_name.endsWith("_em"));
    expect(instantes).toHaveLength(11);
    for (const coluna of instantes) {
      expect(coluna.data_type).toBe("timestamp with time zone");
      expect(coluna.column_default).toBe(coluna.column_name==="criado_em" ? "now()" : null);
    }
    for (const coluna of colunas.filter(c=>c.column_name==="id")) {
      expect(coluna.data_type).toBe("uuid"); expect(coluna.column_default).toBe("gen_random_uuid()");
    }
    for (const coluna of colunas.filter(c=>c.column_name==="dados_objetivos")) {
      expect(coluna.data_type).toBe("jsonb"); expect(coluna.is_nullable).toBe("NO"); expect(coluna.column_default).toBe("'{}'::jsonb");
    }
    expect((await db.query("select tgname from pg_trigger where not tgisinternal and tgrelid=any($1::regclass[])",[TABELAS.map(t=>"public."+t)])).rows).toEqual([]);
  });

  it("define quatro PKs, cinco FKs RESTRICT e quatro UNIQUEs", async () => {
    const {constraints} = await catalogo(db,TABELAS);
    expect(constraints.filter(c=>c.contype==="p").map(c=>[c.tabela,c.definicao])).toEqual([
      ["radar_anuncios_globais","PRIMARY KEY (id)"],["radar_presencas","PRIMARY KEY (varredura_id, anuncio_global_id)"],
      ["radar_universos","PRIMARY KEY (id)"],["radar_varreduras","PRIMARY KEY (id)"],
    ]);
    const fks = constraints.filter(c=>c.contype==="f");
    expect(fks).toHaveLength(5);
    expect(fks.map(c=>c.definicao).sort()).toEqual([
      "FOREIGN KEY (primeira_varredura_id) REFERENCES radar_varreduras(id) ON DELETE RESTRICT",
      "FOREIGN KEY (baseline_varredura_id, id) REFERENCES radar_varreduras(id, universo_id) ON DELETE RESTRICT",
      "FOREIGN KEY (universo_id) REFERENCES radar_universos(id) ON DELETE RESTRICT",
      "FOREIGN KEY (varredura_id) REFERENCES radar_varreduras(id) ON DELETE RESTRICT",
      "FOREIGN KEY (anuncio_global_id) REFERENCES radar_anuncios_globais(id) ON DELETE RESTRICT",
    ].sort());
    expect(constraints.filter(c=>c.contype==="u").map(c=>c.definicao).sort()).toEqual([
      "UNIQUE (id, universo_id)","UNIQUE (portal, finalidade, id_externo)",
      "UNIQUE (portal, finalidade, uf, cidade, tipo_recorte, anunciante_recorte, versao_semantica)",
      "UNIQUE (universo_id, chave_idempotencia)",
    ].sort());
  });

  it("indexa running, histórico e lados das FKs", async () => {
    const {indices} = await catalogo(db,TABELAS);
    const explicitos = indices.filter(i=>i.indexname.startsWith("idx_"));
    expect(explicitos).toHaveLength(5);
    const indice = (nome:string) => explicitos.find(i=>i.indexname===nome)?.indexdef;
    expect(indice("idx_radar_varreduras_universo_running")).toMatch(/CREATE UNIQUE INDEX.*\(universo_id\) WHERE \(status = 'running'::text\)/);
    expect(indice("idx_radar_varreduras_universo_inicio")).toContain("(universo_id, iniciada_em DESC)");
    expect(indice("idx_radar_presencas_anuncio_observacao")).toContain("(anuncio_global_id, observado_em DESC)");
    expect(indice("idx_radar_anuncios_globais_primeira_varredura")).toContain("(primeira_varredura_id)");
    expect(indice("idx_radar_universos_baseline_varredura")).toContain("(baseline_varredura_id, id)");
  });

  it("deduplica universo canônico e separa finalidade, cidade, UF, tipo, portal e versão", async () => {
    await universo({cidade:chaveNormalizada(" LONDRINA ")});
    await expect(universo({cidade:chaveNormalizada("Londrina")})).rejects.toMatchObject({code:"23505"});
    for (const dados of [{finalidade:"venda"},{cidade:"maringa"},{uf:"SP"},{tipo_recorte:"casa"},{portal:"olx"},{versao_semantica:2}])
      await expect(universo(dados)).resolves.toBeDefined();
  });

  it("mesmo portal/ID admite duas finalidades, mas não duplicata da mesma oferta", async () => {
    const v = await varredura(), a = await anuncio({primeira_varredura_id:v});
    const b = await anuncio({primeira_varredura_id:v,finalidade:"venda"});
    expect(a).not.toBe(b);
    await expect(anuncio({primeira_varredura_id:v})).rejects.toMatchObject({code:"23505"});
    await expect(anuncio({primeira_varredura_id:v,portal:"olx"})).resolves.toBeDefined();
    await expect(anuncio({primeira_varredura_id:v,id_externo:"456"})).resolves.toBeDefined();
    // Mesma URL não é identidade alternativa UNIQUE; concordância de contexto ficará no B.
  });

  it("idempotência é por universo e uma running expirada ainda bloqueia outra running", async () => {
    const a = await universo(), b = await universo({tipo_recorte:"casa"});
    await varredura({universo_id:a,chave_idempotencia:"execucao",expira_em:T1});
    await expect(varredura({universo_id:a,chave_idempotencia:"outra"})).rejects.toMatchObject({code:"23505"});
    await expect(varredura({universo_id:b,chave_idempotencia:"execucao"})).resolves.toBeDefined();
    await expect(varredura({universo_id:a,chave_idempotencia:"execucao",status:"success",concluida_em:T2})).rejects.toMatchObject({code:"23505"});
    await expect(varredura({universo_id:a,chave_idempotencia:"historica",status:"success",concluida_em:T2,cobertura:"amostra"})).resolves.toBeDefined();
  });

  it("presença não duplica na execução; outra execução pode reobservar", async () => {
    const u = await universo(), v = await varredura({universo_id:u}), a = await anuncio({primeira_varredura_id:v});
    await presenca(v,a,{preco_observado:1000,tipo_observado:"apartamento",uf_observada:"PR"});
    await expect(presenca(v,a)).rejects.toMatchObject({code:"23505"});
    const v2 = await varredura({universo_id:u,status:"success",concluida_em:T2});
    await expect(presenca(v2,a)).resolves.toBeDefined();
  });

  it("baseline é opcional, em par e ligado ao próprio universo", async () => {
    const a = await universo(), b = await universo({cidade:"maringa"});
    const v = await varredura({universo_id:a,status:"success",concluida_em:T2,cobertura:"amostra"});
    expect((await db.query("select baseline_varredura_id,baseline_concluido_em from radar_universos where id=$1",[a])).rows)
      .toEqual([{baseline_varredura_id:null,baseline_concluido_em:null}]);
    await expect(tentar(()=>db.query("update radar_universos set baseline_varredura_id=$1 where id=$2",[v,a]))).rejects.toMatchObject({code:"23514"});
    await expect(tentar(()=>db.query("update radar_universos set baseline_varredura_id=$1,baseline_concluido_em=$2 where id=$3",[v,T2,b]))).rejects.toMatchObject({code:"23503"});
    await db.query("update radar_universos set baseline_varredura_id=$1,baseline_concluido_em=$2 where id=$3",[v,T2,a]);
    expect((await db.query("select baseline_varredura_id from radar_universos where id=$1",[a])).rows).toEqual([{baseline_varredura_id:v}]);
  });

  it("FKs recusam órfãos e RESTRICT preserva proveniência", async () => {
    await expect(varredura({universo_id:randomUUID()})).rejects.toMatchObject({code:"23503"});
    const u = await universo(), v = await varredura({universo_id:u});
    await expect(anuncio({primeira_varredura_id:randomUUID()})).rejects.toMatchObject({code:"23503"});
    const a = await anuncio({primeira_varredura_id:v});
    await expect(presenca(randomUUID(),a)).rejects.toMatchObject({code:"23503"});
    await expect(presenca(v,randomUUID())).rejects.toMatchObject({code:"23503"});
    await presenca(v,a);
    for (const [tabela,id] of [["radar_universos",u],["radar_varreduras",v],["radar_anuncios_globais",a]])
      await expect(tentar(()=>db.query("delete from "+tabela+" where id=$1",[id]))).rejects.toMatchObject({code:"23001"});
  });

  it.each([
    {portal:"outro"},{finalidade:"locacao_venda"},{uf:"XX"},{uf:"pr"},{cidade:" "},{tipo_recorte:"todos"},
    {tipo_recorte:"sobrado"},{anunciante_recorte:"proprietario"},{versao_semantica:0},{versao_semantica:-1},
  ])("recusa universo fora do contrato: %j",async dados=>{
    await expect(universo(dados)).rejects.toMatchObject({code:"23514"});
  });

  it("aceita cinco portais, 27 UFs e duas finalidades sem afirmar capacidade geográfica",async()=>{
    for (const portal of PORTAIS) for (const finalidade of ["locacao","venda"]) await universo({portal,finalidade,cidade:"mercado-"+portal});
    for (const uf of UFS_BRASIL) await universo({uf,cidade:"cidade-sintetica"});
  });

  it.each([
    {status:"concluida"},{status:"success"},{concluida_em:T1},{status:"success",concluida_em:"2026-10-14T11:59:00Z"},
    {cobertura:"completa"},{contagem_bruta:-1},{contagem_admitida:-1},{paginas_lidas:-1},{paginas_planejadas:-1},
    {contagem_bruta:1,contagem_admitida:2},{paginas_lidas:2,paginas_planejadas:1},{chave_idempotencia:" "},
    {iniciador:" "},{expira_em:"2026-10-14T11:59:00Z"},{aquisicao_id:" "},{origem_aquisicao:" "},{versao_aquisicao:" "},{codigo_resultado:" "},
  ])("CHECKs recusam execução inconsistente: %j",async dados=>{
    await expect(varredura(dados)).rejects.toMatchObject({code:"23514"});
  });

  it.each(["success","partial","failed"])("aceita terminal %s com conclusão e contadores desconhecidos",async status=>{
    await expect(varredura({status,concluida_em:T2,cobertura:"amostra"})).resolves.toBeDefined();
  });

  it.each([
    {id_externo:" "},{url_canonica:" "},{finalidade:"outra"},{portal:"outro"},{primeiro_visto_em:T2,ultimo_visto_em:T0},
    {dados_objetivos:"[]"},{dados_objetivos:'"texto"'},{dados_objetivos:"null"},
  ])("recusa oferta inválida: %j",async dados=>{
    await expect(anuncio(dados)).rejects.toMatchObject({code:"23514"});
  });

  it.each([
    {preco_observado:0},{preco_observado:-1},{tipo_observado:"sobrado"},{uf_observada:"XX"},
    {cidade_observada:" "},{url_observada:" "},{dados_objetivos:"[]"},{dados_objetivos:"null"},
  ])("recusa snapshot inválido: %j",async dados=>{
    const v = await varredura(), a = await anuncio({primeira_varredura_id:v});
    await expect(presenca(v,a,dados)).rejects.toMatchObject({code:"23514"});
  });

  it("permite opcionais desconhecidos e exige fatos obrigatórios",async()=>{
    const v = await varredura(), a = await anuncio({primeira_varredura_id:v});
    await presenca(v,a);
    for (const campo of ["portal","finalidade","id_externo","url_canonica","primeira_varredura_id","primeiro_visto_em","ultimo_visto_em","dados_objetivos"])
      await expect(anuncio({primeira_varredura_id:v,id_externo:randomUUID(),[campo]:null})).rejects.toMatchObject({code:"23502"});
    await expect(presenca(v,a,{observado_em:null})).rejects.toMatchObject({code:"23502"});
  });

  it("catálogo embutido mostra RLS, zero policies e ACL mínima contra defaults permissivos",async()=>{
    const {seguranca,policies,updates} = await catalogo(db,TABELAS);
    expect(seguranca).toHaveLength(4);
    expect(seguranca.every(t=>t.relrowsecurity)).toBe(true);
    expect(policies).toEqual([]);
    for (const tabela of TABELAS) {
      expect((await db.query("select a.privilege_type from pg_class c cross join lateral aclexplode(c.relacl) a where c.oid=$1::regclass and a.grantee=0",["public."+tabela])).rows).toEqual([]);
      for (const role of ["anon","authenticated"]) expect((await db.query(
        "select has_table_privilege($1,$2,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') as tabela,has_any_column_privilege($1,$2,'SELECT,INSERT,UPDATE,REFERENCES') as coluna",
        [role,"public."+tabela])).rows).toEqual([{tabela:false,coluna:false}]);
      expect((await db.query(
        "select has_table_privilege('service_role',$1,'SELECT') as ler,has_table_privilege('service_role',$1,'INSERT') as inserir,has_table_privilege('service_role',$1,'UPDATE') as alterar,has_table_privilege('service_role',$1,'DELETE') as apagar,has_table_privilege('service_role',$1,'TRUNCATE') as truncar",
        ["public."+tabela])).rows).toEqual([{ler:true,inserir:true,alterar:false,apagar:false,truncar:false}]);
      expect(updates.filter(c=>c.table_name===tabela&&c.grantee==="service_role").map(c=>c.column_name).sort()).toEqual([...ATUALIZAVEIS[tabela]].sort());
    }
    // Somente evidência estrutural complementar; validação real permanece no R6.1-C.
  });
});
