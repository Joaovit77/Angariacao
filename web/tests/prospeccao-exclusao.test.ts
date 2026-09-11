/* ================================================================
   C2f — EXCLUSÃO COORDENADA E STORAGE

   Teste estrutural sobre o SQL. O checkpoint ainda não aplica migration nem
   cria bucket remoto; portanto estas asserções travam o contrato da V7 no
   artefato versionado: identidade de servidor, objeto antes da linha,
   cascata, reconciliação de prefixo e superfície mínima do Storage.
   ================================================================ */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const RAIZ = new URL("../../", import.meta.url);

/* O schema pode estar em CRLF e a migration em LF por `core.autocrlf=true`.
   A comparação continua literal depois de normalizar apenas o fim de linha. */
function lerSql(relativo: string): string {
  return readFileSync(new URL(relativo, RAIZ), "utf8").replace(/\r\n/g, "\n");
}

const CAMINHO_MIGRATION =
  "supabase/migrations/20260911115908_prospeccao_campo_exclusao_storage.sql";
const MIGRATION = lerSql(CAMINHO_MIGRATION);
const SCHEMA = lerSql("supabase-schema.sql");
const MIGRATION_C2A = lerSql("supabase/migrations/20260910184310_prospeccao_campo.sql");
const MIGRATION_C2B = lerSql(
  "supabase/migrations/20260910190155_prospeccao_campo_rls_grants.sql",
);
const MIGRATION_C2E = lerSql(
  "supabase/migrations/20260910211045_prospeccao_campo_rpcs_navegador.sql",
);

const RPCS = [
  "iniciar_exclusao_imovel_identificado",
  "confirmar_objeto_removido",
  "concluir_exclusao_imovel_identificado",
  "apagar_prospeccao_do_usuario",
  "listar_objetos_do_usuario",
] as const;

function corpo(sql: string, nome: string): string {
  const trecho = sql.match(
    new RegExp(`create or replace function public\\.${nome}\\([\\s\\S]*?\\n\\$\\$;`, "i"),
  )?.[0];
  if (!trecho) throw new Error(`Função ${nome} ausente.`);
  return trecho;
}

function policy(nome: string): string {
  const trecho = MIGRATION.match(
    new RegExp(`create policy "${nome}"[\\s\\S]*?;`, "i"),
  )?.[0];
  if (!trecho) throw new Error(`Policy ${nome} ausente.`);
  return trecho;
}

const FN = Object.fromEntries(RPCS.map((nome) => [nome, corpo(MIGRATION, nome)])) as Record<
  (typeof RPCS)[number],
  string
>;

describe("C2f — fronteira do checkpoint", () => {
  it("espelha a migration no schema canônico uma única vez", () => {
    const bloco = `\n${MIGRATION.trim()}\n`;
    expect(SCHEMA).toContain(bloco);
    expect(SCHEMA.split(bloco)).toHaveLength(2);
  });

  it("cria exatamente as cinco RPCs previstas, com os nomes canônicos", () => {
    const criadas = [...MIGRATION.matchAll(/create or replace function public\.(\w+)\(/gi)]
      .map((resultado) => resultado[1]);
    expect(criadas).toEqual([...RPCS]);
  });

  it("não reabre tabelas, índices, gatilhos nem RPCs de checkpoints anteriores", () => {
    expect(MIGRATION).not.toMatch(/\bcreate table\b/i);
    expect(MIGRATION).not.toMatch(/\bcreate (?:unique )?index\b/i);
    expect(MIGRATION).not.toMatch(/\bcreate trigger\b/i);
    for (const anterior of [
      "iniciar_classificacao",
      "concluir_classificacao",
      "falhar_classificacao",
      "reservar_foto_avistamento",
      "finalizar_foto_avistamento",
      "fundir_imoveis_identificados",
      "cancelar_exclusao_imovel_identificado",
    ]) {
      expect(MIGRATION).not.toContain(`function public.${anterior}(`);
    }
  });

  it("mantém as cinco security definer com search_path vazio", () => {
    for (const nome of RPCS) {
      expect(FN[nome]).toMatch(/security definer/i);
      expect(FN[nome]).toContain("set search_path = ''");
    }
  });
});

describe("C2f — modelo Servidor e isolamento entre usuários", () => {
  it("exige p_user_id e aplica a trava de JWT nas cinco funções", () => {
    for (const nome of RPCS) {
      expect(FN[nome]).toMatch(/p_user_id uuid/);
      expect(FN[nome]).toMatch(
        /if p_user_id is null then\s+raise exception[\s\S]*?using errcode = '42501'/i,
      );
      expect(FN[nome]).toMatch(/v_jwt uuid := \(select auth\.uid\(\)\)/);
      expect(FN[nome]).toMatch(
        /if v_jwt is not null and v_jwt <> p_user_id then\s+raise exception[\s\S]*?'42501'/i,
      );
    }
  });

  it("filtra identidades e fotos pelo usuário e não revela posse cruzada", () => {
    for (const nome of [
      "iniciar_exclusao_imovel_identificado",
      "concluir_exclusao_imovel_identificado",
    ] as const) {
      expect(FN[nome]).toMatch(
        /where i\.id = p_imovel_identificado_id\s+and i\.user_id = p_user_id/,
      );
      expect(FN[nome]).toMatch(
        /raise exception 'Imóvel identificado não encontrado\.' using errcode = 'P0002'/,
      );
    }

    expect(FN.confirmar_objeto_removido).toMatch(
      /where f\.id = p_foto_id\s+and f\.user_id = p_user_id/,
    );
    expect(FN.confirmar_objeto_removido).toMatch(
      /raise exception 'Foto não encontrada\.' using errcode = 'P0002'/,
    );
    expect(FN.apagar_prospeccao_do_usuario).toMatch(/where f\.user_id = p_user_id/);
    expect(FN.apagar_prospeccao_do_usuario).toMatch(/where i\.user_id = p_user_id/);
    expect(FN.listar_objetos_do_usuario).toMatch(/where i\.user_id = p_user_id/);
    expect(FN.listar_objetos_do_usuario).toMatch(/errcode = 'P0002'/);
  });

  it("revoga todos os papéis e concede execute somente a service_role", () => {
    const revokes = [...MIGRATION.matchAll(/^revoke all on function[\s\S]*?;/gim)];
    const grants = [...MIGRATION.matchAll(/^grant execute on function[\s\S]*?;/gim)]
      .map((resultado) => resultado[0]);
    expect(revokes).toHaveLength(5);
    expect(grants).toHaveLength(5);
    for (const revoke of revokes) {
      expect(revoke[0]).toMatch(/from public, anon, authenticated, service_role;/);
    }
    for (const grant of grants) {
      expect(grant).toMatch(/to service_role;/);
      expect(grant).not.toMatch(/\bauthenticated\b|\banon\b/);
    }
  });

  it("não torna confirmar_objeto_removido executável por authenticated", () => {
    expect(MIGRATION).not.toMatch(
      /grant execute on function public\.confirmar_objeto_removido\([\s\S]*?to authenticated;/i,
    );
    expect(MIGRATION).toMatch(
      /revoke all on function public\.confirmar_objeto_removido\(uuid, uuid\)[\s\S]*?from public, anon, authenticated, service_role;/i,
    );
  });
});

describe("C2f — objeto primeiro, metadado depois", () => {
  it("iniciar marca uma vez e devolve toda foto, inclusive reservada", () => {
    const fn = FN.iniciar_exclusao_imovel_identificado;
    expect(fn).toMatch(/v_repetida := v_identidade\.exclusao_solicitada_em is not null/);
    expect(fn).toMatch(/if not v_repetida then[\s\S]*?set exclusao_solicitada_em = now\(\)/);
    expect(fn).toMatch(/'repetida', v_repetida/);
    expect(fn).toMatch(/'foto_id', f\.id/);
    expect(fn).toMatch(/'caminho', f\.caminho/);
    expect(fn).toMatch(/'caminho_miniatura', f\.caminho_miniatura/);
    expect(fn).not.toMatch(/f\.estado\s*=/);
  });

  it("iniciar contabiliza as lápides que a FK levará por cascata", () => {
    const fn = FN.iniciar_exclusao_imovel_identificado;
    expect(fn).toMatch(/i\.situacao = 'fundido'/);
    expect(fn).toMatch(/i\.fundido_em_imovel_id = p_imovel_identificado_id/);
    expect(fn).toMatch(/'lapides_total', v_lapides/);
    expect(MIGRATION_C2A).toMatch(
      /foreign key \(fundido_em_imovel_id\)[\s\S]*?references public\.imoveis_identificados\(id\) on delete cascade/,
    );
  });

  it("confirmar preserva a linha enquanto qualquer objeto estiver presente", () => {
    const fn = FN.confirmar_objeto_removido;
    expect(fn).toMatch(
      /storage\.objects o[\s\S]*?o\.bucket_id = 'fachadas'[\s\S]*?o\.name = v_foto\.caminho/,
    );
    expect(fn).toMatch(
      /storage\.objects o[\s\S]*?o\.bucket_id = 'fachadas'[\s\S]*?o\.name = v_foto\.caminho_miniatura/,
    );
    expect(fn).toMatch(
      /if v_original_presente or v_miniatura_presente then[\s\S]*?'codigo', 'objeto_pendente'/,
    );
    expect(fn.indexOf("delete from public.imoveis_identificados_fotos")).toBeGreaterThan(
      fn.indexOf("if v_original_presente or v_miniatura_presente"),
    );
  });

  it("concluir exige exclusão iniciada e recusa enquanto existir linha de foto", () => {
    const fn = FN.concluir_exclusao_imovel_identificado;
    expect(fn).toMatch(
      /if v_identidade\.exclusao_solicitada_em is null then[\s\S]*?'exclusao_nao_iniciada'/,
    );
    expect(fn).toMatch(
      /from public\.imoveis_identificados_fotos f[\s\S]*?f\.imovel_identificado_id = p_imovel_identificado_id[\s\S]*?f\.user_id = p_user_id/,
    );
    expect(fn).toMatch(/if v_fotos_pendentes > 0 then[\s\S]*?'objetos_pendentes'/);
    expect(fn.indexOf("delete from public.imoveis_identificados i")).toBeGreaterThan(
      fn.indexOf("if v_fotos_pendentes > 0"),
    );
  });

  it("concluir apaga o pai por último e depende das cascatas aprovadas", () => {
    const fn = FN.concluir_exclusao_imovel_identificado;
    expect(fn).toMatch(
      /delete from public\.imoveis_identificados i\s+where i\.id = p_imovel_identificado_id\s+and i\.user_id = p_user_id/,
    );
    for (const tabela of [
      "imoveis_identificados_avistamentos",
      "imoveis_identificados_fotos",
      "imoveis_identificados_classificacoes",
      "imoveis_identificados_etiquetas",
    ]) {
      expect(MIGRATION_C2A).toMatch(
        new RegExp(
          `create table if not exists public\\.${tabela}[\\s\\S]*?references public\\.imoveis_identificados\\(id\\) on delete cascade`,
          "i",
        ),
      );
    }
  });

  it("a versão em lote recusa fotos não confirmadas antes de apagar o tenant", () => {
    const fn = FN.apagar_prospeccao_do_usuario;
    expect(fn).toMatch(/from public\.imoveis_identificados_fotos f\s+where f\.user_id = p_user_id/);
    expect(fn).toMatch(/if v_fotos_pendentes > 0 then[\s\S]*?'objetos_pendentes'/);
    expect(fn.indexOf("delete from public.imoveis_identificados i")).toBeGreaterThan(
      fn.indexOf("if v_fotos_pendentes > 0"),
    );
  });

  it("o cliente continua sem delete nas tabelas de identidade e foto", () => {
    const grantsAuthenticated = [
      ...MIGRATION_C2B.matchAll(/^grant\b[\s\S]*?\bto authenticated;/gim),
    ].map((resultado) => resultado[0]);
    for (const tabela of ["imoveis_identificados", "imoveis_identificados_fotos"]) {
      expect(
        grantsAuthenticated.filter((grant) => grant.includes(`public.${tabela}`)).join("\n"),
      ).not.toMatch(/\bdelete\b/i);
    }
  });
});

describe("C2f — backstop e acesso somente leitura a storage.objects", () => {
  it("aceita somente o prefixo inteiro do usuário ou de uma identidade dele", () => {
    const fn = FN.listar_objetos_do_usuario;
    expect(fn).toMatch(/p_prefixo = p_user_id::text \|\| '\/'/);
    expect(fn).toMatch(
      /p_prefixo = p_user_id::text \|\| '\/' \|\| i\.id::text \|\| '\/'/,
    );
    expect(fn).toMatch(/where i\.user_id = p_user_id/);
    expect(fn).toMatch(/o\.bucket_id = 'fachadas'/);
    expect(fn).toMatch(/left\(o\.name, char_length\(p_prefixo\)\) = p_prefixo/);
  });

  it("somente as três RPCs previstas leem storage.objects", () => {
    const tocantes: string[] = [];
    for (const nome of [
      "finalizar_foto_avistamento",
      ...RPCS,
    ]) {
      const origem = nome === "finalizar_foto_avistamento" ? MIGRATION_C2E : MIGRATION;
      if (corpo(origem, nome).includes("storage.objects")) tocantes.push(nome);
    }
    expect(tocantes).toEqual([
      "finalizar_foto_avistamento",
      "confirmar_objeto_removido",
      "listar_objetos_do_usuario",
    ]);
  });

  it("nenhuma RPC insere, atualiza ou apaga storage.objects", () => {
    for (const sql of [MIGRATION_C2E, MIGRATION]) {
      expect(sql).not.toMatch(/insert into storage\.objects/i);
      expect(sql).not.toMatch(/update storage\.objects/i);
      expect(sql).not.toMatch(/delete from storage\.objects/i);
    }
  });
});

describe("C2f — bucket fachadas e policies do navegador", () => {
  const SELECT = policy("fachadas_select_proprio_prefixo");
  const INSERT = policy("fachadas_insert_reserva_aberta");

  it("declara o bucket privado de 5 MB com os dois MIME types", () => {
    expect(MIGRATION).toMatch(/insert into storage\.buckets/);
    expect(MIGRATION).toMatch(
      /values \(\s*'fachadas',\s*'fachadas',\s*false,\s*5242880,\s*array\['image\/jpeg', 'image\/webp'\]\s*\)\s*on conflict do nothing/i,
    );
  });

  it("cria exatamente duas policies em storage.objects", () => {
    const criadas = [...MIGRATION.matchAll(/^create policy "([^"]+)"[\s\S]*?;/gim)]
      .map((resultado) => resultado[1]);
    expect(criadas).toEqual([
      "fachadas_select_proprio_prefixo",
      "fachadas_insert_reserva_aberta",
    ]);
  });

  it("select fica no bucket e no primeiro segmento do usuário autenticado", () => {
    expect(SELECT).toContain("for select to authenticated");
    expect(SELECT).toContain("bucket_id = 'fachadas'");
    expect(SELECT).toContain(
      "(storage.foldername(name))[1] = (select auth.uid())::text",
    );
  });

  it("insert exige caminho reservado e reserva ainda aberta", () => {
    expect(INSERT).toContain("for insert to authenticated");
    expect(INSERT).toContain("bucket_id = 'fachadas'");
    expect(INSERT).toContain(
      "(storage.foldername(name))[1] = (select auth.uid())::text",
    );
    expect(INSERT).toContain("name in (f.caminho, f.caminho_miniatura)");
    expect(INSERT).toContain("f.estado = 'reservada'");
  });

  it("insert prova separadamente a posse da foto, do avistamento e do imóvel", () => {
    expect(INSERT).toContain("f.user_id = (select auth.uid())");
    expect(INSERT).toContain("a.user_id = (select auth.uid())");
    expect(INSERT).toContain("i.user_id = (select auth.uid())");
    expect(INSERT).toMatch(
      /join public\.imoveis_identificados_avistamentos a on a\.id = f\.avistamento_id/,
    );
    expect(INSERT).toMatch(
      /join public\.imoveis_identificados i on i\.id = f\.imovel_identificado_id/,
    );
  });

  it("insert fecha a aba velha durante exclusão e bloqueia lápide", () => {
    expect(INSERT).toContain("i.exclusao_solicitada_em is null");
    expect(INSERT).toContain("i.situacao <> 'fundido'");
  });

  it("não bloqueia promovido nem promovendo na policy de upload", () => {
    expect(INSERT).not.toMatch(/promovido|promovendo/);
  });

  it("não cria policy de update ou delete para authenticated", () => {
    expect(MIGRATION).not.toMatch(/create policy[\s\S]*?for update to authenticated/i);
    expect(MIGRATION).not.toMatch(/create policy[\s\S]*?for delete to authenticated/i);
    expect(MIGRATION).not.toMatch(/grant[\s\S]*?\b(?:update|delete)\b[\s\S]*?storage\.objects/i);
  });
});
