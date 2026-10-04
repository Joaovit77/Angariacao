// R6.1: SQL real em PostgreSQL efêmero. Sem APIs, credenciais ou dados reais.
import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { chaveNormalizada } from "@/lib/normalizacao";
import { UFS_BRASIL } from "@/lib/calculo/geografia";

const RAIZ = new URL("../../", import.meta.url);
const NOME = "20261003233240_radar_r6_1_schema_global.sql";
const ler = (nome: string) => readFileSync(new URL(nome, RAIZ), "utf8").replace(/\r\n/g, "\n");
const MIGRATION = ler(`supabase/migrations/${NOME}`);
const SCHEMA = ler("supabase-schema.sql");
const INICIO = "-- INÍCIO RADAR R6.1 — SCHEMA GLOBAL INERTE";
const FIM = "-- FIM RADAR R6.1 — SCHEMA GLOBAL INERTE";
const ESPELHO = SCHEMA.split(INICIO)[1]?.split(FIM)[0]?.trim() ?? "";
const TABELAS = ["radar_universos", "radar_anuncios_globais", "radar_varreduras", "radar_presencas"] as const;
const LEGADAS = ["radar_buscas", "radar_anuncios", "comparaveis_mercado"];
const PORTAIS = ["zap", "viva-real", "chaves-na-mao", "olx", "wimoveis"];
const T0 = "2026-10-01T12:00:00Z";
const T1 = "2026-10-01T12:01:00Z";
const T2 = "2026-10-01T12:02:00Z";

// Reproduz defaults permissivos existentes, inclusive PUBLIC, para provar o REVOKE.
const PREPARACAO = `
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin bypassrls;
  create role visitante_r6 nologin;
  grant usage on schema public to anon, authenticated, service_role, visitante_r6;
  alter default privileges in schema public grant all on tables to public, anon, authenticated, service_role;
`;

async function catalogo(db: PGlite, tabelas: readonly string[]) {
  const parametros = [tabelas];
  const colunas = await db.query<{ table_name: string; column_name: string; data_type: string; is_nullable: string; column_default: string | null }>(`select table_name, column_name, data_type, is_nullable, column_default
    from information_schema.columns where table_schema = 'public' and table_name = any($1::text[])
    order by table_name, ordinal_position`, parametros);
  const constraints = await db.query(`select c.relname as tabela, k.conname, k.contype,
    pg_get_constraintdef(k.oid) as definicao from pg_constraint k join pg_class c on c.oid = k.conrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = any($1::text[]) order by c.relname, k.conname`, parametros);
  const indices = await db.query(`select tablename, indexname, indexdef from pg_indexes
    where schemaname = 'public' and tablename = any($1::text[]) order by tablename, indexname`, parametros);
  const seguranca = await db.query<{ relname: string; relrowsecurity: boolean; relforcerowsecurity: boolean; relacl: string | null }>(`select c.relname, c.relrowsecurity, c.relforcerowsecurity, c.relacl::text
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relname = any($1::text[]) order by c.relname`, parametros);
  const policies = await db.query(`select tablename, policyname, roles, cmd, qual, with_check from pg_policies
    where schemaname = 'public' and tablename = any($1::text[]) order by tablename, policyname`, parametros);
  const privilegiosColunas = await db.query(`select table_name, column_name, grantee, privilege_type
    from information_schema.column_privileges where table_schema = 'public' and table_name = any($1::text[])
    order by table_name, column_name, grantee, privilege_type`, parametros);
  return { colunas: colunas.rows, constraints: constraints.rows, indices: indices.rows,
    seguranca: seguranca.rows, policies: policies.rows, privilegiosColunas: privilegiosColunas.rows };
}

describe("R6.1 — migration e espelho", () => {
  it("possui uma única migration cronológica e espelho integral", () => {
    const nomes = readdirSync(new URL("supabase/migrations/", RAIZ));
    expect(nomes.filter((nome) => nome.endsWith("_radar_r6_1_schema_global.sql"))).toEqual([NOME]);
    expect(nomes.filter((nome) => nome.endsWith(".sql")).sort().at(-1)).toBe(NOME);
    expect(SCHEMA.split(INICIO)).toHaveLength(2);
    expect(SCHEMA.split(FIM)).toHaveLength(2);
    expect(ESPELHO).toBe(MIGRATION.trim());
  });

  it("cria somente quatro tabelas sem DML, funções, triggers ou alterações legadas", () => {
    const sql = MIGRATION.replace(/--[^\n]*/g, "").replace(/comment on[\s\S]*?;/gi, "");
    expect([...sql.matchAll(/create table public\.(\w+)/g)].map((m) => m[1])).toEqual(TABELAS);
    expect(sql).not.toMatch(/\b(insert into|update public\.|delete from|truncate|create (?:or replace )?function|create trigger|create policy|alter default privileges)\b/i);
    for (const legada of LEGADAS) expect(sql).not.toMatch(new RegExp(`\\b${legada}\\b`));
    expect(sql.trim()).toMatch(/^begin;/);
    expect(sql.trim()).toMatch(/commit;$/);
  });

  it("aplica migration e bloco consolidado com o mesmo catálogo real", async () => {
    const primeiro = new PGlite();
    const segundo = new PGlite();
    try {
      await primeiro.exec(PREPARACAO);
      await segundo.exec(PREPARACAO);
      await primeiro.exec(MIGRATION);
      await segundo.exec(ESPELHO);
      expect(await catalogo(segundo, TABELAS)).toEqual(await catalogo(primeiro, TABELAS));
      for (const tabela of TABELAS) {
        expect((await segundo.query(`select count(*)::integer as total from public.${tabela}`)).rows).toEqual([{ total: 0 }]);
      }
    } finally {
      await primeiro.close();
      await segundo.close();
    }
  }, 30_000);
});

describe.sequential("R6.1 — fatos, constraints e permissões no PostgreSQL local", () => {
  let db: PGlite;
  let legadoAntes: Awaited<ReturnType<typeof catalogo>>;
  let tentativa = 0;

  beforeAll(async () => {
    db = new PGlite();
    await db.exec(PREPARACAO);
    // Sentinelas: detectam interferência nas tabelas anteriores, sem simular seu runtime.
    for (const tabela of LEGADAS) {
      await db.exec(`create table public.${tabela} (id uuid primary key, sentinela text not null);
        alter table public.${tabela} enable row level security;
        create policy legado_select on public.${tabela} for select to authenticated using (true);
        insert into public.${tabela} values ('00000000-0000-0000-0000-000000000001', 'preservar');`);
    }
    legadoAntes = await catalogo(db, LEGADAS);
    await db.exec(MIGRATION);
  }, 30_000);

  beforeEach(async () => { await db.exec("reset role; begin"); });
  afterEach(async () => { await db.exec("rollback; reset role"); });
  afterAll(async () => { await db?.close(); });

  // Uma rejeição esperada não deve abortar a transação do restante do cenário.
  async function tentar<T>(acao: () => Promise<T>): Promise<T> {
    const nome = `tentativa_${++tentativa}`;
    await db.exec(`savepoint ${nome}`);
    try {
      const resultado = await acao();
      await db.exec(`release savepoint ${nome}`);
      return resultado;
    } catch (erro) {
      await db.exec(`rollback to savepoint ${nome}; release savepoint ${nome}`);
      throw erro;
    }
  }

  async function como<T>(papel: string, acao: () => Promise<T>) {
    return tentar(async () => {
      await db.exec(`set local role ${papel}`);
      try { return await acao(); } finally { await db.exec("reset role").catch(() => {}); }
    });
  }

  async function universo(alteracoes: Record<string, unknown> = {}) {
    const v = { id: randomUUID(), portal: "zap", finalidade: "locacao", uf: "PR", cidade: "londrina",
      tipo_recorte: "apartamento", anunciante_recorte: "todos", versao_semantica: 1, ...alteracoes };
    await tentar(() => db.query(`insert into public.radar_universos
      (id, portal, finalidade, uf, cidade, tipo_recorte, anunciante_recorte, versao_semantica)
      values ($1,$2,$3,$4,$5,$6,$7,$8)`, Object.values(v)));
    return v.id as string;
  }

  // Códigos sintéticos no formato do caminho ZAP qualificado, só no banco efêmero.
  // A UNIQUE não autoriza promover fallback legado nem qualifica um parser.
  async function anuncio(alteracoes: Record<string, unknown> = {}) {
    const a = { id: randomUUID(), portal: "zap", id_externo: "2612345678",
      url: "https://www.zapimoveis.com.br/imovel/fixture-id-2612345678/", tipo_declarado: "Apartamento",
      dados_objetivos: { titulo: "Anúncio sintético de contrato" }, primeiro_visto_em: T0, ultimo_visto_em: T0, ...alteracoes };
    await tentar(() => db.query(`insert into public.radar_anuncios_globais
      (id, portal, id_externo, url, tipo_declarado, dados_objetivos, primeiro_visto_em, ultimo_visto_em)
      values ($1,$2,$3,$4,$5,$6,$7,$8)`, Object.values(a)));
    return a.id as string;
  }

  async function varredura(alteracoes: Record<string, unknown> = {}) {
    const universoId = alteracoes.universo_id ?? await universo();
    const v = { id: randomUUID(), universo_id: universoId, tipo: "baseline", iniciada_em: T0,
      finalizada_em: null, status: "em_andamento", origem: "fixture_local", cobertura: null,
      paginas_planejadas: null, paginas_lidas: 0, total_informado_portal: null, chamadas_firecrawl: 0, ...alteracoes };
    await tentar(() => db.query(`insert into public.radar_varreduras
      (id, universo_id, tipo, iniciada_em, finalizada_em, status, origem, cobertura,
       paginas_planejadas, paginas_lidas, total_informado_portal, chamadas_firecrawl)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`, Object.values(v)));
    return v.id as string;
  }

  async function presenca(varreduraId: string, anuncioId: string, observado = T1) {
    return tentar(() => db.query(`insert into public.radar_presencas
      (varredura_id, anuncio_global_id, observado_em) values ($1,$2,$3)`, [varreduraId, anuncioId, observado]));
  }

  it("nasce com quatro tabelas vazias, RLS ligada e nenhuma policy", async () => {
    for (const tabela of TABELAS) {
      expect((await db.query(`select count(*)::integer as total from public.${tabela}`)).rows).toEqual([{ total: 0 }]);
    }
    const estado = await catalogo(db, TABELAS);
    expect(estado.seguranca).toHaveLength(4);
    expect(estado.seguranca.every((linha) => linha.relrowsecurity === true)).toBe(true);
    expect(estado.policies).toEqual([]);
  });

  it("preserva dados, colunas, constraints, índices, RLS e grants das tabelas legadas", async () => {
    expect(await catalogo(db, LEGADAS)).toEqual(legadoAntes);
    for (const tabela of LEGADAS) {
      expect((await db.query(`select sentinela from public.${tabela}`)).rows).toEqual([{ sentinela: "preservar" }]);
    }
  });

  it("não inclui estado privado, scheduler nem universo redundante na presença", async () => {
    const { colunas } = await catalogo(db, TABELAS);
    const proibidas = /^(user_id|owner_id|corretor_id|conta_id|responsavel|visto|favorito|descartado|interesse|subscription|busca_id|novo|sumiu|presente|ausente|ausente_recente|nao_observado|next_run_at|lock_until|lease|worker_id|claimed_at|retry|prioridade|fila)/;
    for (const coluna of colunas) expect(coluna.column_name).not.toMatch(proibidas);
    expect(colunas.filter((coluna) => coluna.table_name === "radar_presencas").map((coluna) => coluna.column_name))
      .toEqual(["varredura_id", "anuncio_global_id", "observado_em"]);
  });

  it("todos os timestamps estruturais e observacionais são timestamptz", async () => {
    const { colunas } = await catalogo(db, TABELAS);
    const temporais = colunas.filter((coluna) => coluna.column_name.endsWith("_em"));
    expect(temporais).toHaveLength(7);
    for (const coluna of temporais) expect(coluna.data_type).toBe("timestamp with time zone");
  });

  it("impede repetir a tupla de universo já canonicalizada, inclusive variantes de grafia", async () => {
    await universo({ cidade: chaveNormalizada("  LONDRINA ") });
    await expect(universo({ cidade: chaveNormalizada("Londrina") })).rejects.toMatchObject({ code: "23505" });
  });

  it.each(["portal", "finalidade", "uf", "cidade", "tipo_recorte", "anunciante_recorte", "versao_semantica"])(
    "não admite NULL na dimensão %s", async (dimensao) => {
      await expect(universo({ [dimensao]: null })).rejects.toMatchObject({ code: "23502" });
    },
  );

  it.each<[string, string | number]>([
    ["portal", "ZAP"], ["portal", "outro"], ["finalidade", "aluguel"], ["uf", "pr"], ["uf", "XX"],
    ["cidade", ""], ["cidade", "   "], ["versao_semantica", 0], ["versao_semantica", -1],
    ...["", "all", "qualquer", "sem-filtro", "sobrado", "kitnet", "studio"].map((valor): [string, string] => ["tipo_recorte", valor]),
    ...["", "all", "qualquer", "sem-filtro", "imobiliaria", "incerto"].map((valor): [string, string] => ["anunciante_recorte", valor]),
  ])("rejeita dimensão fora do contrato: %s = %s", async (campo, valor) => {
    await expect(universo({ [campo as string]: valor })).rejects.toMatchObject({ code: "23514" });
  });

  it.each(PORTAIS)("representa portal canônico %s sem autorizar sua coleta", async (portal) => {
    await expect(universo({ portal })).resolves.toBeDefined();
  });
  it.each(UFS_BRASIL)("representa a UF %s", async (uf) => { await expect(universo({ uf })).resolves.toBeDefined(); });
  it.each(["casa", "apartamento", "todos"])("representa tipo de recorte %s", async (tipo_recorte) => {
    await expect(universo({ tipo_recorte })).resolves.toBeDefined();
  });
  it.each(["todos", "proprietario"])("representa recorte de anunciante %s", async (anunciante_recorte) => {
    await expect(universo({ anunciante_recorte })).resolves.toBeDefined();
  });
  it("representa venda e versões semânticas distintas, sem executá-las", async () => {
    await universo();
    await universo({ finalidade: "venda" });
    await universo({ versao_semantica: 2 });
    expect((await db.query("select count(*)::integer as total from public.radar_universos")).rows).toEqual([{ total: 3 }]);
  });

  it("baseline começa não formado e pode registrar somente o instante de formação", async () => {
    const id = await universo();
    expect((await db.query("select baseline_formado_em from public.radar_universos where id=$1", [id])).rows)
      .toEqual([{ baseline_formado_em: null }]);
    await como("service_role", () => db.query("update public.radar_universos set baseline_formado_em=$1 where id=$2", [T2, id]));
    expect((await db.query("select baseline_formado_em is not null as formado from public.radar_universos where id=$1", [id])).rows)
      .toEqual([{ formado: true }]);
  });

  it("impede duplicar portal/código nativo qualificado, sem usar fallback legado", async () => {
    await anuncio();
    await expect(anuncio()).rejects.toMatchObject({ code: "23505" });
  });
  it.each(["", "   "])("rejeita código externo vazio: %j", async (id_externo) => {
    await expect(anuncio({ id_externo })).rejects.toMatchObject({ code: "23514" });
  });
  it("rejeita código nulo e última observação anterior à primeira", async () => {
    await expect(anuncio({ id_externo: null })).rejects.toMatchObject({ code: "23502" });
    await expect(anuncio({ primeiro_visto_em: T2, ultimo_visto_em: T0 })).rejects.toMatchObject({ code: "23514" });
  });
  it("admite tipo declarado desconhecido e objeto de fatos públicos, sem herdar recorte", async () => {
    const id = await anuncio({ tipo_declarado: null, dados_objetivos: {} });
    expect((await db.query("select tipo_declarado from public.radar_anuncios_globais where id=$1", [id])).rows)
      .toEqual([{ tipo_declarado: null }]);
    await expect(anuncio({ id_externo: "2612345699", dados_objetivos: [1, 2] })).rejects.toMatchObject({ code: "23514" });
  });

  it.each(["baseline", "hot", "reconciliation"])("registra tipo de varredura %s sem scheduler", async (tipo) => {
    await expect(varredura({ tipo })).resolves.toBeDefined();
  });
  it.each([
    { status: "agendada" }, { tipo: "retry" }, { origem: "" }, { status: "concluida" },
    { status: "falha" }, { finalizada_em: T2 }, { cobertura: "parcial" },
    { status: "concluida", finalizada_em: T2, cobertura: "desconhecida" },
    { status: "concluida", finalizada_em: T0, iniciada_em: T2, cobertura: "parcial" },
    { paginas_planejadas: 1, paginas_lidas: 2 },
    { status: "concluida", finalizada_em: T2, cobertura: "completa", paginas_planejadas: 2, paginas_lidas: 1 },
    ...["paginas_planejadas", "paginas_lidas", "total_informado_portal", "chamadas_firecrawl"].map((campo) => ({ [campo]: -1 })),
  ])("rejeita varredura estruturalmente inconsistente: %j", async (campos) => {
    await expect(varredura(campos)).rejects.toMatchObject({ code: "23514" });
  });
  it.each(["concluida", "falha"])("status %s permanece independente de cobertura completa/parcial", async (status) => {
    const u = await universo();
    for (const cobertura of ["completa", "parcial"]) {
      await expect(varredura({ universo_id: u, status, finalizada_em: T2, cobertura,
        paginas_planejadas: 2, paginas_lidas: 2 })).resolves.toBeDefined();
    }
  });
  it("permite planejamento e total desconhecidos, sem inventar contadores do portal", async () => {
    await expect(varredura({ status: "concluida", finalizada_em: T2, cobertura: "completa",
      paginas_planejadas: null, paginas_lidas: 1, total_informado_portal: null })).resolves.toBeDefined();
  });

  it("conserva uma presença por varredura/anúncio e deriva o universo pela FK", async () => {
    const u = await universo();
    const v1 = await varredura({ universo_id: u });
    const v2 = await varredura({ universo_id: u, tipo: "hot" });
    const a = await anuncio();
    await presenca(v1, a);
    await expect(presenca(v1, a)).rejects.toMatchObject({ code: "23505" });
    await presenca(v2, a, T2);
    expect((await db.query(`select v.universo_id, count(*)::integer as observacoes
      from public.radar_presencas p join public.radar_varreduras v on v.id=p.varredura_id
      group by v.universo_id`)).rows).toEqual([{ universo_id: u, observacoes: 2 }]);
  });
  it("rejeita FKs inexistentes de universo, varredura e anúncio", async () => {
    await expect(varredura({ universo_id: randomUUID() })).rejects.toMatchObject({ code: "23503" });
    const v = await varredura();
    const a = await anuncio();
    await expect(presenca(randomUUID(), a)).rejects.toMatchObject({ code: "23503" });
    await expect(presenca(v, randomUUID())).rejects.toMatchObject({ code: "23503" });
  });
  it("FKs restringem exclusão dos pais e preservam fatos, mesmo para o dono do banco", async () => {
    const u = await universo();
    const v = await varredura({ universo_id: u });
    const a = await anuncio();
    await presenca(v, a);
    for (const [tabela, id] of [["radar_universos", u], ["radar_varreduras", v], ["radar_anuncios_globais", a]]) {
      await expect(tentar(() => db.query(`delete from public.${tabela} where id=$1`, [id])))
        .rejects.toMatchObject({ code: "23001" });
    }
    expect((await db.query("select count(*)::integer as total from public.radar_presencas")).rows).toEqual([{ total: 1 }]);
  });

  it.each(["anon", "authenticated", "visitante_r6"])("%s não recebe privilégios herdados nem acessa as quatro tabelas", async (papel) => {
    const v = await varredura();
    await presenca(v, await anuncio());
    for (const tabela of TABELAS) {
      for (const privilegio of ["SELECT", "INSERT", "UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER"]) {
        expect((await db.query("select has_table_privilege($1,$2,$3) as permitido", [papel, `public.${tabela}`, privilegio])).rows)
          .toEqual([{ permitido: false }]);
      }
      await expect(como(papel, () => db.query(`select * from public.${tabela}`))).rejects.toMatchObject({ code: "42501" });
      await expect(como(papel, () => db.query(`insert into public.${tabela} default values`))).rejects.toMatchObject({ code: "42501" });
      await expect(como(papel, () => db.query(`delete from public.${tabela}`))).rejects.toMatchObject({ code: "42501" });
      const coluna = tabela === "radar_presencas" ? "observado_em" : "id";
      await expect(como(papel, () => db.query(`update public.${tabela} set ${coluna}=${coluna}`)))
        .rejects.toMatchObject({ code: "42501" });
    }
  });

  it("RLS continua fechada mesmo se SELECT for acidentalmente concedido ao navegador", async () => {
    const v = await varredura();
    await presenca(v, await anuncio());
    for (const tabela of TABELAS) {
      await db.exec(`grant select on public.${tabela} to anon, authenticated`);
      for (const papel of ["anon", "authenticated"]) {
        expect((await como(papel, () => db.query(`select * from public.${tabela}`))).rows).toEqual([]);
      }
    }
  });

  it("backend lê/insere, finaliza execução e atualiza somente campos evolutivos", async () => {
    await como("service_role", async () => {
      const u = await universo();
      const a = await anuncio();
      const v = await varredura({ universo_id: u });
      await presenca(v, a);
      await db.query(`update public.radar_varreduras set status='concluida', finalizada_em=$1,
        cobertura='completa', paginas_planejadas=1, paginas_lidas=1, total_informado_portal=1, chamadas_firecrawl=1
        where id=$2`, [T2, v]);
      await db.query("update public.radar_anuncios_globais set ultimo_visto_em=$1, dados_objetivos=$2 where id=$3",
        [T2, { titulo: "Fato objetivo atualizado" }, a]);
      await db.query("update public.radar_universos set baseline_formado_em=$1 where id=$2", [T2, u]);
      for (const tabela of TABELAS) {
        expect((await db.query(`select count(*)::integer as total from public.${tabela}`)).rows).toEqual([{ total: 1 }]);
      }
    });
  });

  it("grants de UPDATE são exatamente os planejados; presença é somente inserção/leitura", async () => {
    const esperadas: Record<string, string[]> = {
      radar_universos: ["baseline_formado_em"],
      radar_anuncios_globais: ["url", "tipo_declarado", "dados_objetivos", "ultimo_visto_em"],
      radar_varreduras: ["finalizada_em", "status", "cobertura", "paginas_planejadas", "paginas_lidas", "total_informado_portal", "chamadas_firecrawl"],
      radar_presencas: [],
    };
    const { colunas } = await catalogo(db, TABELAS);
    for (const tabela of TABELAS) {
      for (const privilegio of ["SELECT", "INSERT"]) {
        expect((await db.query("select has_table_privilege('service_role',$1,$2) as permitido", [`public.${tabela}`, privilegio])).rows)
          .toEqual([{ permitido: true }]);
      }
      for (const privilegio of ["UPDATE", "DELETE", "TRUNCATE", "REFERENCES", "TRIGGER"]) {
        expect((await db.query("select has_table_privilege('service_role',$1,$2) as permitido", [`public.${tabela}`, privilegio])).rows)
          .toEqual([{ permitido: false }]);
      }
      for (const coluna of colunas.filter((coluna) => coluna.table_name === tabela)) {
        expect((await db.query("select has_column_privilege('service_role',$1,$2,'UPDATE') as permitido",
          [`public.${tabela}`, coluna.column_name])).rows).toEqual([{ permitido: esperadas[tabela].includes(coluna.column_name as string) }]);
      }
    }
  });

  it("BYPASSRLS não abre DELETE/TRUNCATE nem reescrita da identidade e da presença", async () => {
    const v = await varredura();
    await presenca(v, await anuncio());
    for (const tabela of TABELAS) {
      await expect(como("service_role", () => db.query(`delete from public.${tabela}`))).rejects.toMatchObject({ code: "42501" });
      await expect(como("service_role", () => db.query(`truncate public.${tabela}`))).rejects.toMatchObject({ code: "42501" });
      const coluna = tabela === "radar_presencas" ? "observado_em" : "id";
      await expect(como("service_role", () => db.query(`update public.${tabela} set ${coluna}=${coluna}`)))
        .rejects.toMatchObject({ code: "42501" });
    }
  });
});
