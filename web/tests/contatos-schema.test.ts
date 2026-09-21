import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/* Fase 1a-A: fundação relacional de contatos. Este teste lê o SQL (migration
   e espelho canônico) e cobra as decisões fechadas do plano: pessoa ≠
   telefone ≠ imóvel, N:N desde o início, canal ativo único por conta,
   vínculo nunca apagado, revisão humana persistente, RLS/grants só de
   leitura para o browser, FKs compostas por tenant e compatibilidade com o
   legado `proprietario_*` sem sobrescrevê-lo. O comportamento vivo (backfill,
   projeção, INSERT/UPDATE legados, isolamento entre contas) é provado em
   `integration/contatos-supabase-local.test.ts` contra o Postgres local. */

function lerSql(relativo: string): string {
  return readFileSync(new URL(relativo, import.meta.url), "utf8").replace(/\r\n/g, "\n");
}

const MIGRATION = lerSql("../../supabase/migrations/20260921183930_contatos_fase1a.sql");
const SCHEMA = lerSql("../../supabase-schema.sql");
const TIPOS = lerSql("../lib/tipos.ts");
const MAPEADORES = lerSql("../lib/persistencia/mapeadores.ts");

const TABELAS = ["contatos", "contatos_telefones", "imoveis_contatos", "contatos_revisoes"] as const;

function trechoTabela(sql: string, tabela: string): string {
  const inicio = sql.indexOf(`create table if not exists public.${tabela} (`);
  expect(inicio, `create table ${tabela}`).toBeGreaterThan(-1);
  const fim = sql.indexOf("\n);\n", inicio);
  return sql.slice(inicio, fim + 3);
}

/** Só o código: linhas de comentário fora, para as negativas não baterem em prosa. */
function semComentarios(sql: string): string {
  return sql.split("\n").filter((linha) => !/^\s*--/.test(linha)).join("\n");
}

function trechoFuncao(sql: string, nome: string): string {
  const inicio = sql.indexOf(`create or replace function ${nome}`);
  expect(inicio, `função ${nome}`).toBeGreaterThan(-1);
  const fim = sql.indexOf("\n$$;\n", inicio);
  return sql.slice(inicio, fim + 4);
}

describe("espelho canônico", () => {
  it("o supabase-schema.sql contém a migration da Fase 1a byte a byte (CRLF normalizado)", () => {
    expect(SCHEMA).toContain(MIGRATION);
  });

  it("a migration é aditiva: não apaga, não altera nem renomeia o legado", () => {
    expect(MIGRATION).not.toMatch(/drop (table|column)/i);
    expect(MIGRATION).not.toMatch(/alter table (public\.)?imoveis\s+(drop|rename|alter column)/i);
    // Não existe `imoveis.contato_id`: a relação é N:N pela tabela de vínculo.
    expect(MIGRATION).not.toMatch(/alter table (public\.)?imoveis\s+add column/i);
    expect(SCHEMA).not.toMatch(/imoveis\s+add column if not exists contato_id/i);
  });
});

describe("as quatro tabelas", () => {
  it.each(TABELAS)("%s liga RLS no mesmo arquivo e só tem policy de SELECT do dono", (tabela) => {
    expect(MIGRATION).toContain(`alter table public.${tabela} enable row level security;`);
    const policies = [...MIGRATION.matchAll(new RegExp(`create policy "([^"]+)" on public\\.${tabela}\\s+for (\\w+)`, "g"))];
    expect(policies.map((m) => m[2])).toEqual(["select"]);
    expect(MIGRATION).toContain(`create policy "select_own_${tabela}" on public.${tabela}\n  for select to authenticated\n  using ((select auth.uid()) = user_id);`);
  });

  it.each(TABELAS)("%s tem user_id redundante amarrado ao tenant", (tabela) => {
    expect(trechoTabela(MIGRATION, tabela)).toContain("user_id uuid not null references auth.users(id) on delete cascade");
  });

  it("o browser só lê; toda escrita é da service role (RPC/trigger)", () => {
    const lista = "public.contatos, public.contatos_telefones, public.imoveis_contatos, public.contatos_revisoes";
    expect(MIGRATION).toContain(`revoke all on table\n  ${lista}\nfrom public, anon, authenticated, service_role;`);
    expect(MIGRATION).toContain(`grant select on table\n  ${lista}\nto authenticated;`);
    expect(MIGRATION).toContain(`grant select, insert, update, delete on table\n  ${lista}\nto service_role;`);
    expect(MIGRATION).not.toMatch(/grant (insert|update|delete)[^;]*to authenticated/);
  });
});

describe("pessoa ≠ telefone", () => {
  it("contatos: identidade é o id; nenhuma unicidade por nome ou telefone", () => {
    const t = trechoTabela(MIGRATION, "contatos");
    expect(t).toContain("id uuid primary key default gen_random_uuid()");
    expect(t).toContain("constraint contatos_id_user_id_key unique (id, user_id)");
    expect(t).not.toMatch(/unique[^;]*nome/);
    expect(semComentarios(t)).not.toMatch(/\n\s+telefone\w* /); // nenhuma coluna de telefone na pessoa
    // Lápide de fusão (humana): aponta o sobrevivente e exige arquivamento.
    expect(t).toContain("fundido_em_contato_id uuid");
    expect(t).toContain("fundido_em_contato_id is null or fundido_em_contato_id <> id");
    expect(t).toContain("fundido_em_contato_id is null or arquivado_em is not null");
    expect(MIGRATION).toContain("foreign key (fundido_em_contato_id, user_id)\n      references public.contatos (id, user_id)\n      on delete set null (fundido_em_contato_id)");
  });

  it("contatos_telefones: canal com histórico, canônico pela MESMA função do legado", () => {
    const t = trechoTabela(MIGRATION, "contatos_telefones");
    expect(t).toContain("telefone_canonico text\n    generated always as (public.telefone_canonico(telefone)) stored");
    expect(t).toContain("public.telefone_canonico(telefone) is not null");
    expect(t).toContain("desativado_em timestamptz");
    expect(t).not.toMatch(/jid_observado/); // nada reservado sem consumidor
    expect(t).toContain("foreign key (contato_id, user_id)\n    references public.contatos (id, user_id)");
    // Nenhuma segunda regra de normalização.
    expect(MIGRATION).not.toMatch(/create (or replace )?function [\w.]*telefone_canonico/);
    expect(MIGRATION).not.toMatch(/regexp_replace\([^)]*telefone/);
  });

  it("canal ATIVO único por conta; ≤ 1 principal ativo por pessoa; histórico consultável", () => {
    expect(MIGRATION).toContain("create unique index if not exists contatos_telefones_ativo_unico_idx\n  on public.contatos_telefones (user_id, telefone_canonico)\n  where desativado_em is null;");
    expect(MIGRATION).toContain("create unique index if not exists contatos_telefones_principal_unico_idx\n  on public.contatos_telefones (contato_id)\n  where principal and desativado_em is null;");
    expect(MIGRATION).toContain("create index if not exists contatos_telefones_historico_idx\n  on public.contatos_telefones (user_id, telefone_canonico);");
  });
});

describe("imóvel ↔ contato é N:N", () => {
  it("vínculo com papel mínimo, relação livre, principal no vínculo e FKs compostas por tenant", () => {
    const t = trechoTabela(MIGRATION, "imoveis_contatos");
    expect(t).toContain("papel in ('proprietario', 'contato')");
    expect(t).not.toMatch(/relacao[^,]*in \(/); // sem enum de parentesco
    expect(t).toContain("principal boolean not null default false");
    expect(t).not.toMatch(/principal[^;]*telefone/); // principal não exige telefone (Decisão 2)
    expect(t).toContain("foreign key (imovel_id, user_id)\n    references public.imoveis (id, user_id)");
    expect(t).toContain("foreign key (contato_id, user_id)\n    references public.contatos (id, user_id)");
    // A Fase 0 existe para isto.
    expect(SCHEMA).toContain("add constraint imoveis_id_user_id_key unique (id, user_id)");
  });

  it("vínculo nunca é apagado: encerra com motivo; unicidades só sobre vigentes", () => {
    const t = trechoTabela(MIGRATION, "imoveis_contatos");
    expect(t).toContain("encerrado_em timestamptz");
    expect(t).toContain("(encerrado_em is null) = (encerramento_motivo is null)");
    expect(MIGRATION).toContain("create unique index if not exists imoveis_contatos_vigente_unico_idx\n  on public.imoveis_contatos (imovel_id, contato_id)\n  where encerrado_em is null;");
    expect(MIGRATION).toContain("create unique index if not exists imoveis_contatos_principal_unico_idx\n  on public.imoveis_contatos (imovel_id)\n  where principal and encerrado_em is null;");
    expect(MIGRATION).not.toMatch(/delete from public\.imoveis_contatos/);
  });

  it("duas views separam 'com quem falo' de 'quem é o dono', com security invoker", () => {
    expect(MIGRATION).toContain("create or replace view public.imoveis_contato_principal\nwith (security_invoker = true) as");
    expect(MIGRATION).toContain("where v.principal and v.encerrado_em is null;");
    expect(MIGRATION).toContain("create or replace view public.imoveis_proprietario\nwith (security_invoker = true) as");
    expect(MIGRATION).toContain("where v.papel = 'proprietario' and v.encerrado_em is null;");
    expect(MIGRATION).toContain("grant select on table public.imoveis_contato_principal, public.imoveis_proprietario\n  to authenticated, service_role;");
  });
});

describe("revisão humana", () => {
  it("fila persistente; pendência derivada da fila, sem booleano em contatos", () => {
    const t = trechoTabela(MIGRATION, "contatos_revisoes");
    expect(t).toContain("estado in ('pendente', 'resolvida')");
    expect(t).toContain("(estado = 'pendente' and decisao is null and resolvido_em is null)");
    expect(trechoTabela(MIGRATION, "contatos")).not.toMatch(/revisao_pendente/);
    expect(MIGRATION).toContain("create unique index if not exists contatos_revisoes_pendente_unica_idx");
    expect(MIGRATION).toContain("create unique index if not exists contatos_revisoes_pendente_par_idx");
  });

  it("escopo explícito pelo tipo: revisão de imóvel exige imovel_id e morre com o imóvel; a de par não colide após SET NULL", () => {
    const t = trechoTabela(MIGRATION, "contatos_revisoes");
    expect(t).toContain("tipo not in ('nome-divergente-importacao', 'telefone-alterado-legado', 'nome-alterado-legado')\n    or imovel_id is not null");
    expect(t).toContain("foreign key (imovel_id, user_id)\n    references public.imoveis (id, user_id)\n    on delete cascade");
    expect(t).toContain("foreign key (contato_relacionado_id, user_id)\n    references public.contatos (id, user_id)\n    on delete set null (contato_relacionado_id)");
    // Tipos de par: únicos enquanto o par existe; tipos sem par: por (pessoa, imóvel-ou-grupo).
    expect(MIGRATION).toContain("where estado = 'pendente' and contato_relacionado_id is not null;");
    expect(MIGRATION).toContain("where estado = 'pendente'\n    and tipo in ('nome-divergente-backfill', 'nome-divergente-importacao',\n                 'telefone-alterado-legado', 'nome-alterado-legado');");
    expect(MIGRATION).not.toMatch(/coalesce\(contato_relacionado_id/);
    // A dimensão congelada respeita o escopo: NULL em imovel_id nunca amplia um tipo de imóvel.
    const f = trechoFuncao(MIGRATION, "private.contato_em_revisao(");
    expect(f).toContain("(r.imovel_id = p_imovel_id");
    expect(f).toContain("array['nome-alterado-legado', 'nome-divergente-importacao', 'fusao']");
    expect(f).toContain("array['telefone-alterado-legado', 'fusao']");
    expect(f).toContain("array['nome-divergente-backfill', 'fusao']");
    expect(f).toContain("array['telefone-conflito', 'fusao']");
    expect(f).not.toMatch(/r\.imovel_id is null/);
  });

  it("os tipos cobrem backfill, importação e edição legada; sem IA e sem fusão automática", () => {
    const t = trechoTabela(MIGRATION, "contatos_revisoes");
    for (const tipo of ["nome-divergente-backfill", "nome-divergente-importacao", "telefone-alterado-legado", "nome-alterado-legado", "telefone-conflito", "fusao"]) {
      expect(t).toContain(`'${tipo}'`);
    }
    expect(MIGRATION).not.toMatch(/fundir_contatos|resolver_revisao_contato/);
    expect(semComentarios(MIGRATION)).not.toMatch(/openai|ia_uso|pg_net|net\.http/i);
  });
});

describe("compatibilidade com o legado proprietario_*", () => {
  it("as colunas legadas continuam no schema, inclusive a canônica gerada", () => {
    expect(SCHEMA).toContain("proprietario_nome text,");
    expect(SCHEMA).toContain("proprietario_telefone text,");
    expect(SCHEMA).toContain("add column if not exists proprietario_telefone_canonico text\n  generated always as (telefone_canonico(proprietario_telefone)) stored;");
  });

  it("projeção: só o principal vigente (fallback ao único proprietário), só quando muda, e nunca durante o backfill", () => {
    const f = trechoFuncao(MIGRATION, "private.projetar_contato_legado(p_imovel_id uuid, p_user_id uuid)");
    expect(f).toContain("v.principal and v.encerrado_em is null");
    expect(f).toContain("if v_n <> 1 then v_contato_id := null; end if;");
    // Sem candidato inequívoco (sem principal e 0 ou ≥2 proprietários) projeta NULL — nunca escolhe por nada.
    expect(f).not.toMatch(/if v_contato_id is null then return; end if;/);
    expect(f).toContain("if v_contato_id is not null then\n    select c.nome into v_nome");
    expect(f).not.toMatch(/order by[^;]*(updated_at|created_at|vinculado_em)/);
    expect(f).toContain("i.proprietario_nome is distinct from v_nome");
    expect(f).toContain("i.proprietario_telefone is distinct from v_telefone");
    expect(f).toContain("contato_em_revisao(p_user_id, v_contato_id, p_imovel_id, 'nome')");
    expect(f).toContain("contato_em_revisao(p_user_id, v_contato_id, p_imovel_id, 'telefone')");
    const g = trechoFuncao(MIGRATION, "private.projetar_contato_principal()");
    expect(g).toContain("if pg_trigger_depth() > 1 then return null; end if;");
    expect(g).toContain("current_setting('angario.contatos_backfill', true) = '1'");
    expect(MIGRATION).toContain("after insert or update or delete on public.imoveis_contatos");
    expect(MIGRATION).toContain("after insert or update or delete on public.contatos_telefones");
    expect(MIGRATION).toContain("after update of nome on public.contatos");
  });

  it("INSERT legado cria/resolve a pessoa sem renomear nem fundir; sem telefone confiável é pessoa própria", () => {
    const f = trechoFuncao(MIGRATION, "private.sincronizar_contato_legado(");
    expect(f).toContain("private.resolver_contato_por_canal(p_user_id, v_canonico)");
    expect(trechoFuncao(MIGRATION, "private.resolver_contato_por_canal(")).toContain("t.desativado_em is null");
    expect(f).toContain("'nome-divergente-importacao'");
    // Telefone resolve canal, nunca autoriza nome: nenhum caminho preenche/renomeia contatos.nome.
    expect(f).not.toMatch(/update public\.contatos\b/);
    expect(trechoFuncao(MIGRATION, "private.registrar_alteracao_legada_contato()")).not.toMatch(/update public\.contatos\b/);
    expect(trechoFuncao(MIGRATION, "private.backfill_contatos(p_user_id uuid)")).not.toMatch(/update public\.contatos\b/);
    // Pessoa reaproveitada só como canal: nome informado ≠ confirmado (inclusive pessoa sem nome) → revisão.
    expect(f).toContain("if v_reutilizado and v_nome is not null\n     and private.normalizar_nome(v_nome) is distinct from private.normalizar_nome(v_nome_existente) then");
    // O modelo já conhece o imóvel (vínculo vigente OU encerrado) → não há "primeiro contato".
    expect(f).toMatch(/where v\.imovel_id = p_imovel_id and v\.user_id = p_user_id\n  \) then\n    return null;/);
    expect(f).toContain("'telefone_implausivel'");
    expect(f).not.toMatch(/normalizar_nome\([^)]*\)\s*=\s*private\.normalizar_nome[^;]*from public\.contatos/); // não procura pessoa por nome
    expect(MIGRATION).toContain("after insert on public.imoveis\n  for each row execute function private.sincronizar_contato_no_insert();");
  });

  it("UPDATE legado de nome/telefone é aceito e vira revisão; o modelo novo não decide", () => {
    const f = trechoFuncao(MIGRATION, "private.registrar_alteracao_legada_contato()");
    expect(f).toContain("if pg_trigger_depth() > 1 then return null; end if;");
    expect(f).toContain("if not v_nome_mudou and not v_tel_mudou then return null; end if;");
    expect(f).toContain("'telefone-alterado-legado'");
    expect(f).toContain("'nome-alterado-legado'");
    expect(f).not.toMatch(/raise exception/);
    expect(f).not.toMatch(/insert into public\.contatos_telefones/); // nunca troca o canal sozinho
    expect(f).not.toMatch(/update public\.contatos_telefones/);
    expect(f).not.toMatch(/v_nome_contato is null/); // nome vazio não é exceção: vira revisão como qualquer outro
    expect(MIGRATION).toContain("after update of proprietario_nome, proprietario_telefone on public.imoveis");
  });

  it("backfill: por (conta, telefone canônico), classes A–G, nunca por nome, nunca escreve no legado", () => {
    const f = trechoFuncao(MIGRATION, "private.backfill_contatos(p_user_id uuid)");
    expect(f).toContain("set_config('angario.contatos_backfill', '1', true)");
    expect(f).toContain("group by i.proprietario_telefone_canonico");
    expect(f).not.toMatch(/group by[^;]*nome/);
    // Nunca desfaz decisão humana: imóvel com QUALQUER vínculo (vigente ou encerrado) é pulado.
    expect(f).not.toMatch(/where v\.imovel_id = i\.id and v\.user_id = i\.user_id and v\.encerrado_em is null/);
    expect((f.match(/where v\.imovel_id = i\.id and v\.user_id = i\.user_id\)/g) ?? []).length).toBe(3);
    // Contato já existente + nome divergente → revisão por imóvel, sem sobrescrever.
    expect(f).toContain("'backfill-reexecucao'");
    expect(f).not.toMatch(/update public\.imoveis\b/);
    expect(f).toContain("'nome-divergente-backfill'");
    expect(f).toContain("'backfill-imovel'");
    expect(f).toContain("'possivel_recadastro'");
    expect(f).toMatch(/'a', n_a, 'b', n_b, 'c', n_c, 'd', n_d, 'e', n_e, 'f', n_f, 'g', n_g/);
    expect(MIGRATION).toContain("values (u.user_id, 'admin', 'info', 'contatos-backfill', relatorio::text);");
  });

  it("funções privadas: security definer com search_path vazio e sem acesso do browser", () => {
    for (const nome of [
      "private.contato_em_revisao(uuid, uuid, uuid, text)",
      "private.projetar_contato_legado(uuid, uuid)",
      "private.projetar_contato_principal()",
      "private.resolver_contato_por_canal(uuid, text)",
      "private.abrir_revisao_contato(uuid, text, uuid, uuid, jsonb)",
      "private.sincronizar_contato_legado(uuid, uuid, text, text, text, text)",
      "private.sincronizar_contato_no_insert()",
      "private.registrar_alteracao_legada_contato()",
      "private.backfill_contatos(uuid)",
    ]) {
      expect(MIGRATION.replace(/\)\n\s+from/g, ") from")).toContain(`revoke all on function ${nome} from public, anon, authenticated;`);
    }
    const definers = [...MIGRATION.matchAll(/security definer\nset search_path = ''/g)];
    expect(definers.length).toBeGreaterThanOrEqual(7);
    expect(MIGRATION).not.toMatch(/security definer\n(?!set search_path = '')/);
  });
});

describe("este slice não toca o núcleo nem os consumidores", () => {
  it("tipos.ts e mapeadores.ts não ganharam contatos (fica para o slice seguinte / 1b)", () => {
    expect(TIPOS).not.toMatch(/contato_id|Contato\b|ContatoTelefone|VinculoImovelContato/);
    expect(MAPEADORES).not.toMatch(/imoveis_contatos|contatos_telefones/);
  });

  it("nenhuma RPC pública nova: escrita só por trigger; M3/M4 e webhook seguem lendo o legado", () => {
    expect(MIGRATION).not.toMatch(/create or replace function public\./);
    expect(semComentarios(MIGRATION)).not.toMatch(/mensagens_agendadas|claim_mensagens|efetivar_consolidacao/);
  });
});
