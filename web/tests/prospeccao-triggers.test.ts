/* ================================================================
   C2c — GATILHOS E AGREGADOS DO GARIMPO EM CAMPO

   Teste estrutural sobre o SQL, no molde de rls-obrigatoria-schema e
   prospeccao-rls: não há Postgres na suíte, então o que se prova aqui é o
   CONTRATO escrito na migration. As asserções foram escolhidas para falhar
   quando uma decisão do plano for perdida, não quando o texto for reescrito.
   ================================================================ */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const RAIZ = new URL("../../", import.meta.url);

/* Mesma normalização de prospeccao-rls: `core.autocrlf=true` deixa o schema em
   CRLF e a migration em LF num checkout novo no Windows. Sem isto, a asserção
   de espelho falha por fim de linha na máquina de quem clonou. */
function lerSql(relativo: string): string {
  return readFileSync(new URL(relativo, RAIZ), "utf8").replace(/\r\n/g, "\n");
}

const MIGRATION = lerSql("supabase/migrations/20260910193412_prospeccao_campo_triggers.sql");
const SCHEMA = lerSql("supabase-schema.sql");

/** Corpo de uma função da migration, do cabeçalho até o `$$;` que a fecha. */
function corpo(nome: string): string {
  const trecho = MIGRATION.match(
    new RegExp(`create or replace function ${nome}\\b[\\s\\S]*?\\n\\$\\$;`, "i"),
  )?.[0];
  if (!trecho) throw new Error(`Função ${nome} ausente da migration.`);
  return trecho;
}

/** Os `create trigger` declarados, já normalizados numa linha. */
function gatilhos(): string[] {
  return [...MIGRATION.matchAll(/create trigger [\s\S]*?;/gi)].map((m) =>
    m[0].replace(/\s+/g, " ").trim(),
  );
}

describe("C2c — fronteira do checkpoint", () => {
  it("espelha a migration no schema canônico uma única vez", () => {
    const bloco = `\n${MIGRATION.trim()}\n`;
    expect(SCHEMA).toContain(bloco);
    expect(SCHEMA.split(bloco)).toHaveLength(2);
  });

  it("não traz RPC, Storage, bucket, policy nem grant de execute", () => {
    // As cinco funções são de gatilho/privadas: nenhuma é exposta como RPC.
    expect(MIGRATION).not.toMatch(/\bgrant execute\b/i);
    expect(MIGRATION).not.toMatch(/storage\.(?:buckets|objects)/i);
    expect(MIGRATION).not.toMatch(/\bcreate policy\b/i);
    expect(MIGRATION).not.toMatch(/\bcreate table\b/i);
  });

  it("cria exatamente as cinco funções previstas e nenhuma a mais", () => {
    const criadas = [...MIGRATION.matchAll(/create or replace function ([\w.]+)/gi)]
      .map((m) => m[1]);
    expect(criadas).toEqual([
      "private.recalcular_agregados_identificado",
      "private.sincronizar_avistamentos_identidade",
      "private.proteger_avistamento",
      "private.proteger_identificado",
      "private.tipo_manual_no_cadastro",
    ]);
  });

  it("revoga as cinco funções de todos os papéis", () => {
    for (const nome of [
      "private.recalcular_agregados_identificado\\(uuid\\)",
      "private.sincronizar_avistamentos_identidade\\(\\)",
      "private.proteger_avistamento\\(\\)",
      "private.proteger_identificado\\(\\)",
      "private.tipo_manual_no_cadastro\\(\\)",
    ]) {
      expect(MIGRATION).toMatch(
        new RegExp(
          `revoke all on function ${nome}\\s+from public, anon, authenticated, service_role;`,
          "i",
        ),
      );
    }
  });

  it("usa search_path vazio em todas as funções", () => {
    const cabecalhos = MIGRATION.match(/create or replace function[\s\S]*?as \$\$/gi) ?? [];
    expect(cabecalhos).toHaveLength(5);
    for (const cabecalho of cabecalhos) {
      expect(cabecalho).toContain("set search_path = ''");
    }
  });

  it("marca security definer só onde há escrita fora do grant do cliente", () => {
    // Escrevem em colunas/tabelas que o C2b não concedeu: precisam do definer,
    // senão a correção de observação falharia com 42501 para o próprio dono.
    for (const nome of [
      "private.recalcular_agregados_identificado",
      "private.sincronizar_avistamentos_identidade",
      "private.proteger_avistamento",
    ]) {
      expect(corpo(nome)).toMatch(/security definer/i);
    }
    // Só mexem em NEW: não precisam e não recebem.
    for (const nome of ["private.proteger_identificado", "private.tipo_manual_no_cadastro"]) {
      expect(corpo(nome)).not.toMatch(/security definer/i);
    }
  });
});

describe("C2c — um único before update por tabela", () => {
  it("declara apenas um before update no avistamento", () => {
    const doAvistamento = gatilhos().filter((g) =>
      g.includes("on public.imoveis_identificados_avistamentos"),
    );
    const antesDoUpdate = doAvistamento.filter((g) => /before [\w\s]*update/i.test(g));
    expect(antesDoUpdate).toHaveLength(1);
    expect(antesDoUpdate[0]).toContain("private.proteger_avistamento()");
  });

  it("não existe outro before update do avistamento em nenhum arquivo SQL", () => {
    const ocorrencias = [
      ...SCHEMA.matchAll(
        /create trigger[\s\S]*?before[\s\S]*?update on public\.imoveis_identificados_avistamentos[\s\S]*?;/gi,
      ),
    ];
    expect(ocorrencias).toHaveLength(1);
  });

  it("sincroniza nos três eventos, e só depois deles", () => {
    const sincronizacao = gatilhos().filter((g) =>
      g.includes("private.sincronizar_avistamentos_identidade()"),
    );
    expect(sincronizacao).toHaveLength(1);
    expect(sincronizacao[0]).toMatch(
      /after insert or update or delete on public\.imoveis_identificados_avistamentos/i,
    );
    expect(sincronizacao[0]).toContain("for each row");
  });

  it("liga tipo manual no insert e proteção no update da identidade", () => {
    const daIdentidade = gatilhos().filter((g) =>
      g.includes("on public.imoveis_identificados\n") ||
      / on public\.imoveis_identificados /.test(g),
    );
    expect(daIdentidade.some((g) =>
      /before insert on public\.imoveis_identificados /i.test(g) &&
      g.includes("private.tipo_manual_no_cadastro()"),
    )).toBe(true);
    expect(daIdentidade.some((g) =>
      /before update on public\.imoveis_identificados /i.test(g) &&
      g.includes("private.proteger_identificado()"),
    )).toBe(true);
    expect(daIdentidade.some((g) => g.includes("public.set_updated_at()"))).toBe(true);
  });
});

describe("C2c — recálculo total dos agregados", () => {
  const fn = corpo("private.recalcular_agregados_identificado");

  it("reconta do zero em vez de somar", () => {
    expect(fn).toMatch(/count\(\*\)/);
    expect(fn).toMatch(/min\(a\.observado_em\)/);
    expect(fn).toMatch(/max\(a\.observado_em\)/);
    // Incremental seria `+ 1` / `- 1` sobre o valor guardado: não existe.
    expect(fn).not.toMatch(/avistamentos_total\s*[+-]\s*1/);
  });

  it("elege corrente pela DATA DO EVENTO, com desempate estável", () => {
    expect(fn).toMatch(
      /order by a\.observado_em desc, a\.created_at desc, a\.id desc\s+limit 1/i,
    );
  });

  it("escolhe a melhor localização pela menor acurácia, ignorando sem coordenada", () => {
    expect(fn).toMatch(/a\.latitude is not null/);
    expect(fn).toMatch(/a\.longitude is not null/);
    expect(fn).toMatch(/order by a\.acuracia_metros asc nulls last/i);
  });

  it("sobrevive a zero avistamentos sem violar o not null da precisão", () => {
    expect(fn).toMatch(/avistamentos_total = coalesce\(v_total, 0\)/);
    expect(fn).toMatch(/precisao_localizacao = coalesce\(v_precisao, 'desconhecida'\)/);
  });

  it("é no-op quando nada muda e quando a identidade já não existe", () => {
    expect(fn).toMatch(/if p_imovel_id is null then\s+return;/i);
    expect(fn).toMatch(/where i\.id = p_imovel_id\s+and \(/i);
    expect(fn).toMatch(/i\.avistamento_corrente_id is distinct from v_corrente/);
  });

  it("deriva as nove colunas de agregado e localização", () => {
    for (const coluna of [
      "primeiro_avistamento_em =",
      "ultimo_avistamento_em =",
      "avistamentos_total =",
      "avistamento_corrente_id =",
      "latitude =",
      "longitude =",
      "acuracia_metros =",
      "precisao_localizacao =",
    ]) {
      expect(fn).toContain(coluna);
    }
  });
});

describe("C2c — sincronização recalcula os dois lados", () => {
  const fn = corpo("private.sincronizar_avistamentos_identidade");

  it("recalcula OLD no delete e NEW nos demais", () => {
    expect(fn).toMatch(/if tg_op = 'DELETE' then[\s\S]*?old\.imovel_identificado_id/i);
    expect(fn).toMatch(
      /perform private\.recalcular_agregados_identificado\(new\.imovel_identificado_id\)/,
    );
  });

  it("recalcula OLD e NEW quando o reparenteamento move o avistamento", () => {
    expect(fn).toMatch(
      /tg_op = 'UPDATE'\s+and old\.imovel_identificado_id is distinct from new\.imovel_identificado_id/i,
    );
    const depois = fn.slice(fn.indexOf("tg_op = 'UPDATE'"));
    expect(depois).toMatch(
      /perform private\.recalcular_agregados_identificado\(old\.imovel_identificado_id\)/,
    );
  });
});

describe("C2c — proteger_avistamento", () => {
  const fn = corpo("private.proteger_avistamento");

  it("trava os campos do evento e deixa só a observação corrigível", () => {
    for (const coluna of [
      "new.id is distinct from old.id",
      "new.user_id is distinct from old.user_id",
      "new.observado_em is distinct from old.observado_em",
      "new.latitude is distinct from old.latitude",
      "new.longitude is distinct from old.longitude",
      "new.acuracia_metros is distinct from old.acuracia_metros",
      "new.precisao_localizacao is distinct from old.precisao_localizacao",
      "new.created_at is distinct from old.created_at",
    ]) {
      expect(fn).toContain(coluna);
    }
    expect(fn).toMatch(/raise exception[\s\S]*?imut[aá]ve/i);
  });

  it("autoriza reparenteamento só pela lápide, e nunca em exclusão", () => {
    expect(fn).toMatch(/v_pai\.situacao is distinct from 'fundido'/);
    expect(fn).toMatch(
      /v_pai\.fundido_em_imovel_id is distinct from new\.imovel_identificado_id/,
    );
    expect(fn).toMatch(/v_pai\.user_id is distinct from v_destino\.user_id/);
    expect(fn).toMatch(
      /v_pai\.exclusao_solicitada_em is not null\s+or v_destino\.exclusao_solicitada_em is not null/,
    );
    // Nada de flag de sessão: a autorização é DADO.
    expect(fn).not.toMatch(/current_setting|set_config/i);
  });

  it("congela o avistamento enquanto houver exclusão em andamento", () => {
    expect(fn).toMatch(/elsif v_pai\.exclusao_solicitada_em is not null then/);
    expect(fn).toMatch(/raise exception[\s\S]*?exclus[aã]o em andamento/i);
  });

  it("a revisão é do gatilho e só sobe quando o texto muda", () => {
    expect(fn).toMatch(/v_observacao_mudou := new\.observacao is distinct from old\.observacao/);
    expect(fn).toMatch(
      /new\.observacao_revisao :=\s*old\.observacao_revisao \+ \(case when v_observacao_mudou then 1 else 0 end\)/,
    );
    expect(fn).toMatch(/if not v_observacao_mudou then[\s\S]*?return new;/i);
  });

  it("invalida a classificação na mesma transação da correção", () => {
    const depois = fn.slice(fn.indexOf("if not v_observacao_mudou"));
    expect(depois).toContain("new.classificacao_estado := 'pendente'");
    expect(depois).toContain("new.classificacao_id := null");
    expect(depois).toContain("new.classificacao_em := null");
    expect(depois).toContain("new.fingerprint := null");
  });

  it("desatualiza as inferidas sem apagá-las e sem tocar nas confirmadas", () => {
    expect(fn).toMatch(
      /update public\.imoveis_identificados_etiquetas\s+set estado = 'desatualizada',\s+desatualizada_em = now\(\)\s+where avistamento_id = old\.id\s+and estado = 'inferida'/i,
    );
    // Nunca apaga etiqueta, e nunca rebaixa confirmada.
    expect(fn).not.toMatch(/delete from public\.imoveis_identificados_etiquetas/i);
    expect(fn).not.toMatch(/set estado = 'inferida'[\s\S]*?estado = 'confirmada'/i);
  });

  it("sinaliza conflito quando havia confirmação, sem revogá-la", () => {
    expect(fn).toMatch(/where avistamento_id = old\.id\s+and estado = 'confirmada'/i);
    expect(fn).toMatch(/if v_tem_confirmada then\s+new\.revisao_conflito_em := now\(\)/i);
  });

  it("limpa o snapshot de tipo só quando a inferência perdeu a evidência", () => {
    const limpeza = fn.slice(fn.lastIndexOf("update public.imoveis_identificados i"));
    expect(limpeza).toMatch(/i\.tipo_avistamento_id = old\.id/);
    expect(limpeza).toMatch(/i\.tipo_origem = 'ia-texto'/);
    expect(limpeza).toMatch(/i\.tipo_estado = 'inferido'/);
    for (const coluna of [
      "tipo = null",
      "tipo_origem = null",
      "tipo_confianca = null",
      "tipo_estado = null",
      "tipo_definido_em = null",
      "tipo_classificacao_id = null",
      "tipo_avistamento_id = null",
      "tipo_confirmado_por = null",
      "tipo_confirmado_em = null",
    ]) {
      expect(limpeza).toContain(coluna);
    }
  });
});

describe("C2c — proteger_identificado", () => {
  const fn = corpo("private.proteger_identificado");

  it("bloqueia mutação humana enquanto houver exclusão em andamento", () => {
    expect(fn).toMatch(/if old\.exclusao_solicitada_em is not null/);
    expect(fn).toMatch(/\(to_jsonb\(new\) - v_livres\) is distinct from \(to_jsonb\(old\) - v_livres\)/);
    expect(fn).toMatch(/raise exception[\s\S]*?exclus[aã]o em andamento/i);
  });

  it("libera só o próprio flag e as colunas derivadas pelo recálculo", () => {
    const livres = fn.match(/v_livres text\[\] := array\[([\s\S]*?)\];/)?.[1] ?? "";
    const lista = [...livres.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]).sort();
    expect(lista).toEqual([
      "acuracia_metros",
      "avistamento_corrente_id",
      "avistamentos_total",
      "exclusao_solicitada_em",
      "latitude",
      "longitude",
      "precisao_localizacao",
      "primeiro_avistamento_em",
      "ultimo_avistamento_em",
      "updated_at",
    ]);
    // Estado, promoção, lápide e proveniência de tipo NÃO são liberados.
    for (const proibida of [
      "situacao", "imovel_id", "promovido_em", "fundido_em", "fundido_em_imovel_id",
      "tipo", "tipo_origem", "tipo_classificacao_id", "descartado_em",
    ]) {
      expect(lista).not.toContain(proibida);
    }
  });

  it("sobrescreve a data de investigação pelo instante do servidor", () => {
    expect(fn).toMatch(
      /if new\.ultima_investigacao_em is distinct from old\.ultima_investigacao_em then\s+new\.ultima_investigacao_em := now\(\)/i,
    );
  });

  it("não policia escrita que o grant do C2b já fechou", () => {
    // A autorização mora no grant; este gatilho deriva. Se ele começar a
    // recusar coluna por coluna, a regra D9 foi perdida.
    expect(fn).not.toMatch(/new\.situacao is distinct from old\.situacao/);
    expect(fn).not.toMatch(/new\.tipo is distinct from old\.tipo/);
  });
});

describe("C2c — tipo_manual_no_cadastro", () => {
  const fn = corpo("private.tipo_manual_no_cadastro");

  it("codifica origem manual e estado declarado quando vem tipo", () => {
    expect(fn).toMatch(/new\.tipo_origem := 'manual'/);
    expect(fn).toMatch(/new\.tipo_estado := 'declarado'/);
    expect(fn).toMatch(/new\.tipo_definido_em := now\(\)/);
  });

  it("zera qualquer proveniência de IA, com tipo ou sem tipo", () => {
    for (const coluna of [
      "new.tipo_confianca := null",
      "new.tipo_classificacao_id := null",
      "new.tipo_avistamento_id := null",
      "new.tipo_confirmado_por := null",
      "new.tipo_confirmado_em := null",
    ]) {
      expect(fn).toContain(coluna);
    }
    // Fora do `if`: vale nos dois ramos.
    const depoisDoIf = fn.slice(fn.indexOf("end if;"));
    expect(depoisDoIf).toContain("new.tipo_confianca := null");
  });

  it("não usa heurística para adivinhar quem escreveu", () => {
    expect(fn).not.toMatch(/current_setting|set_config|session_user|current_user/i);
    expect(fn).not.toMatch(/ia-texto/);
  });
});
