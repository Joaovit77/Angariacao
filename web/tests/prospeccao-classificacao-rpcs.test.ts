/* ================================================================
   C2d — RPCs DE CLASSIFICAÇÃO (MODELO SERVIDOR)

   Teste estrutural sobre o SQL, no molde de prospeccao-schema/-rls/-triggers:
   não há Postgres na suíte, então o que se prova aqui é o CONTRATO escrito na
   migration. Cada asserção foi escolhida para falhar quando uma decisão do
   plano for perdida — claim, lease, idempotência, reuso, snapshot temporal,
   precedência da confirmação humana, atomicidade e modelo de identidade.
   ================================================================ */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const RAIZ = new URL("../../", import.meta.url);

/* `core.autocrlf=true` deixa o schema em CRLF e a migration em LF num checkout
   novo no Windows; sem normalizar, o espelho falharia por fim de linha. */
function lerSql(relativo: string): string {
  return readFileSync(new URL(relativo, RAIZ), "utf8").replace(/\r\n/g, "\n");
}

const MIGRATION = lerSql(
  "supabase/migrations/20260910201530_prospeccao_campo_rpcs_classificacao.sql",
);
const SCHEMA = lerSql("supabase-schema.sql");
const MIGRATION_C2A = lerSql("supabase/migrations/20260910184310_prospeccao_campo.sql");

const RPCS = [
  "public.iniciar_classificacao",
  "public.concluir_classificacao",
  "public.falhar_classificacao",
] as const;

function corpo(nome: string): string {
  const trecho = MIGRATION.match(
    new RegExp(`create or replace function ${nome}\\b[\\s\\S]*?\\n\\$\\$;`, "i"),
  )?.[0];
  if (!trecho) throw new Error(`Função ${nome} ausente da migration.`);
  return trecho;
}

const INICIAR = corpo(RPCS[0]);
const CONCLUIR = corpo(RPCS[1]);
const FALHAR = corpo(RPCS[2]);

describe("C2d — fronteira do checkpoint", () => {
  it("espelha a migration no schema canônico uma única vez", () => {
    const bloco = `\n${MIGRATION.trim()}\n`;
    expect(SCHEMA).toContain(bloco);
    expect(SCHEMA.split(bloco)).toHaveLength(2);
  });

  it("cria exatamente as três RPCs previstas e nenhuma a mais", () => {
    const criadas = [...MIGRATION.matchAll(/create or replace function ([\w.]+)/gi)]
      .map((m) => m[1]);
    expect(criadas).toEqual([...RPCS]);
  });

  it("não traz tabela, índice, policy, trigger, Storage nem RPC de outro checkpoint", () => {
    expect(MIGRATION).not.toMatch(/\bcreate table\b/i);
    expect(MIGRATION).not.toMatch(/\bcreate (?:unique )?index\b/i);
    expect(MIGRATION).not.toMatch(/\bcreate policy\b/i);
    expect(MIGRATION).not.toMatch(/\bcreate trigger\b/i);
    expect(MIGRATION).not.toMatch(/storage\.(?:buckets|objects)/i);
    // Nada de exclusão, promoção, merge, foto ou etiqueta humana aqui.
    for (const proibida of [
      "reservar_foto_avistamento", "finalizar_foto_avistamento",
      "iniciar_exclusao", "confirmar_objeto_removido", "concluir_exclusao",
      "apagar_prospeccao_do_usuario", "listar_objetos_do_usuario",
      "aplicar_etiqueta_humana", "definir_estado_etiqueta", "definir_tipo_manual",
      "confirmar_tipo_identificado", "definir_situacao_identificado",
      "vincular_promocao", "fundir_imoveis_identificados", "cancelar_exclusao",
    ]) {
      expect(MIGRATION).not.toContain(proibida);
    }
  });

  it("não altera os gatilhos aprovados no C2c", () => {
    expect(MIGRATION).not.toMatch(/private\.proteger_avistamento/);
    expect(MIGRATION).not.toMatch(/private\.proteger_identificado/);
    expect(MIGRATION).not.toMatch(/private\.tipo_manual_no_cadastro/);
    expect(MIGRATION).not.toMatch(/private\.sincronizar_avistamentos_identidade/);
    expect(MIGRATION).not.toMatch(/private\.recalcular_agregados_identificado/);
  });

  it("usa security definer e search_path vazio nas três", () => {
    for (const fn of [INICIAR, CONCLUIR, FALHAR]) {
      expect(fn).toMatch(/security definer/i);
      expect(fn).toContain("set search_path = ''");
    }
  });
});

describe("C2d — modelo de identidade do Servidor", () => {
  it("exige p_user_id em todas e nunca aceita null", () => {
    for (const fn of [INICIAR, CONCLUIR, FALHAR]) {
      expect(fn).toMatch(/p_user_id uuid/);
      expect(fn).toMatch(
        /if p_user_id is null then\s+raise exception[\s\S]*?using errcode = '42501'/i,
      );
    }
  });

  it("recusa JWT divergente do p_user_id", () => {
    for (const fn of [INICIAR, CONCLUIR, FALHAR]) {
      expect(fn).toMatch(/v_jwt uuid := \(select auth\.uid\(\)\)/);
      expect(fn).toMatch(
        /if v_jwt is not null and v_jwt <> p_user_id then\s+raise exception[\s\S]*?'42501'/i,
      );
    }
  });

  it("filtra o alvo por p_user_id e trata posse cruzada como inexistência", () => {
    expect(INICIAR).toMatch(/where a\.id = p_avistamento_id\s+and a\.user_id = p_user_id/);
    expect(INICIAR).toMatch(
      /if v_avistamento\.id is null then\s+raise exception 'Avistamento não encontrado\.'[\s\S]*?'P0002'/i,
    );
    for (const fn of [CONCLUIR, FALHAR]) {
      expect(fn).toMatch(/where c\.id = p_run_id\s+and c\.user_id = p_user_id/);
      expect(fn).toMatch(
        /if v_run\.id is null then\s+raise exception 'Execução de classificação não encontrada\.'[\s\S]*?'P0002'/i,
      );
    }
  });

  it("não concede execute a authenticated em nenhuma das três", () => {
    const grants = [...MIGRATION.matchAll(/^grant execute[\s\S]*?;/gim)].map((m) => m[0]);
    expect(grants).toHaveLength(3);
    for (const grant of grants) {
      expect(grant).toMatch(/to service_role;/);
      expect(grant).not.toMatch(/\bauthenticated\b/);
    }
    for (const nome of ["iniciar", "concluir", "falhar"]) {
      expect(MIGRATION).toMatch(
        new RegExp(
          `revoke all on function public\\.${nome}_classificacao\\([\\s\\S]*?\\)\\s*from public, anon, authenticated, service_role;`,
          "i",
        ),
      );
    }
  });
});

describe("C2d — claim atômico, lease e idempotência", () => {
  it("serializa a decisão por avistamento com advisory lock", () => {
    expect(INICIAR).toMatch(
      /pg_catalog\.pg_advisory_xact_lock\(\s*pg_catalog\.hashtextextended\('classificar:' \|\| p_user_id::text \|\| ':' \|\| p_avistamento_id::text, 0\)/,
    );
  });

  it("devolve repetida para fingerprint já concluído na revisão vigente", () => {
    expect(INICIAR).toMatch(
      /where c\.avistamento_id = p_avistamento_id\s+and c\.observacao_revisao = v_avistamento\.observacao_revisao\s+and c\.fingerprint = p_fingerprint\s+and c\.estado = 'concluida'/,
    );
    expect(INICIAR).toMatch(/'repetida', true/);
  });

  it("devolve ocupado quando há lease vigente, sem chamar nada", () => {
    expect(INICIAR).toMatch(/'ocupado', true/);
    const ocupada = INICIAR.slice(INICIAR.indexOf("v_ocupada"));
    expect(ocupada).toMatch(/and c\.estado = 'processando'/);
  });

  it("reclama o claim quando o lease expirou, marcando abandonada", () => {
    expect(INICIAR).toMatch(
      /set estado = 'abandonada',\s+lease_token = null,\s+lease_expira_em = null\s+where c\.avistamento_id = p_avistamento_id\s+and c\.estado = 'processando'\s+and c\.lease_expira_em <= now\(\)/,
    );
  });

  it("abre o lease em dois minutos, não dez", () => {
    expect(INICIAR).toMatch(/now\(\) \+ interval '2 minutes'/);
    expect(INICIAR).not.toMatch(/interval '10 minutes'/);
  });

  it("conta com os únicos parciais do C2a para o claim ser do banco", () => {
    expect(MIGRATION_C2A).toMatch(
      /create unique index[\s\S]*?imoveis_identificados_classificacoes \(avistamento_id\)\s*where estado = 'processando'/i,
    );
    expect(MIGRATION_C2A).toMatch(
      /create unique index[\s\S]*?avistamento_id, observacao_revisao, fingerprint\s*\) where estado = 'concluida'/i,
    );
  });

  it("recusa iniciar com exclusão em andamento", () => {
    expect(INICIAR).toMatch(/'codigo', 'exclusao_em_andamento'/);
  });

  it("exige dados completos, inclusive modelo, para compor o fingerprint", () => {
    expect(INICIAR).toMatch(/coalesce\(trim\(p_modelo\), ''\) = ''/);
    expect(INICIAR).toMatch(/using errcode = '22023'/);
  });
});

describe("C2d — ramos modelo e reuso", () => {
  it("iniciar decide o modo pelo banco, nunca pelo chamador", () => {
    expect(INICIAR).toMatch(
      /v_modo := case when v_reuso is null then 'modelo' else 'reuso' end/,
    );
    // Não existe parâmetro de modo: o cliente não pode forjar reuso.
    expect(INICIAR).not.toMatch(/p_modo\b/);
  });

  it("procura reuso no mesmo imóvel e mesmo usuário, por fingerprint", () => {
    const busca = INICIAR.slice(INICIAR.indexOf("select c.id into v_reuso"));
    expect(busca).toMatch(/c\.user_id = p_user_id/);
    expect(busca).toMatch(/c\.imovel_identificado_id = v_avistamento\.imovel_identificado_id/);
    expect(busca).toMatch(/c\.fingerprint = p_fingerprint/);
    expect(busca).toMatch(/c\.estado = 'concluida'/);
  });

  it("no reuso ignora o payload e copia da execução de origem", () => {
    const ramo = CONCLUIR.slice(
      CONCLUIR.indexOf("if v_run.modo = 'reuso' then"),
      CONCLUIR.indexOf("else"),
    );
    expect(ramo).toMatch(/from public\.imoveis_identificados_etiquetas e/);
    expect(ramo).toMatch(/e\.classificacao_id = v_run\.reusada_de_classificacao_id/);
    expect(ramo).not.toMatch(/p_etiquetas/);
    expect(ramo).not.toMatch(/p_tipo_sugerido/);
  });

  it("nunca copia confirmação humana para o run de reuso", () => {
    const ramo = CONCLUIR.slice(
      CONCLUIR.indexOf("if v_run.modo = 'reuso' then"),
      CONCLUIR.indexOf("else"),
    );
    expect(ramo).not.toMatch(/confirmada_por/);
    expect(ramo).not.toMatch(/confirmada_em/);
    // O insert comum força 'inferida' em qualquer ramo.
    expect(CONCLUIR).toMatch(/'ia-texto', d\.confianca, 'inferida'/);
  });

  it("no ramo modelo a proveniência vem do run, não do payload", () => {
    // `'modelo', v_run.modelo` só existe no ramo modelo: no de reuso o modelo
    // vem linha por linha da execução de origem.
    expect(CONCLUIR).toMatch(/'modelo', v_run\.modelo/);
    expect(CONCLUIR).toMatch(/'versao_classificador', v_run\.versao_classificador/);
    expect(CONCLUIR).toMatch(/v_run\.versao_catalogo,/);
    expect(CONCLUIR).toMatch(/v_run\.observacao_revisao, v_avistamento\.observado_em/);
  });

  it("o payload do ramo modelo não carrega origem, estado nem avistamento", () => {
    expect(CONCLUIR).toMatch(/as x\(categoria text, codigo text, confianca smallint\)/);
    expect(CONCLUIR).not.toMatch(/x\.origem/);
    expect(CONCLUIR).not.toMatch(/x\.estado/);
    expect(CONCLUIR).not.toMatch(/x\.avistamento_id/);
  });
});

describe("C2d — conclusão atômica e supersessão", () => {
  it("é uma função só, logo uma transação só", () => {
    // Nenhum commit/savepoint: a atomicidade é a da própria chamada.
    expect(CONCLUIR).not.toMatch(/\bcommit\b|\bsavepoint\b|\brollback\b/i);
  });

  it("fecha o avistamento com os quatro campos juntos", () => {
    expect(CONCLUIR).toMatch(
      /set classificacao_estado = 'concluida',\s+classificacao_id = v_run\.id,\s+classificacao_em = now\(\),\s+fingerprint = v_run\.fingerprint/,
    );
  });

  it("supersede só o que a execução nova não reafirmou", () => {
    expect(CONCLUIR).toMatch(
      /set estado = 'substituida',\s+substituida_em = now\(\),\s+substituida_por_classificacao_id = v_run\.id/,
    );
    const sup = CONCLUIR.slice(CONCLUIR.indexOf("set estado = 'substituida'"));
    expect(sup).toMatch(/and e\.estado = 'inferida'/);
    expect(sup).toMatch(/and not exists \(/);
  });

  it("nunca apaga etiqueta e nunca rebaixa confirmada", () => {
    expect(CONCLUIR).not.toMatch(/delete from public\.imoveis_identificados_etiquetas/i);
    const sup = CONCLUIR.slice(
      CONCLUIR.indexOf("set estado = 'substituida'"),
      CONCLUIR.indexOf("select count(*) into v_reafirmadas"),
    );
    // A supersessão toca apenas 'inferida': confirmada fica fora por construção.
    expect(sup).toContain("e.estado = 'inferida'");
    expect(sup).not.toContain("'confirmada'");
  });

  it("não insere código já confirmado e o conta em ja_confirmada", () => {
    expect(CONCLUIR).toMatch(/and e\.estado = 'confirmada'\s+\)\s*;?\s*$/m);
    expect(CONCLUIR).toMatch(/ja_confirmada = v_ja_confirmada/);
    const insert = CONCLUIR.slice(CONCLUIR.indexOf("with desejadas as"));
    expect(insert).toMatch(/and e\.estado in \('inferida', 'confirmada'\)/);
  });

  it("deduplica o payload antes de inserir", () => {
    expect(CONCLUIR).toMatch(/select distinct on \(x\.categoria, x\.codigo\)/);
  });

  it("conta aplicadas como inseridas mais reafirmadas", () => {
    expect(CONCLUIR).toMatch(/get diagnostics v_inseridas = row_count/);
    expect(CONCLUIR).toMatch(/aplicadas = v_inseridas \+ v_reafirmadas/);
  });

  it("é idempotente ao concluir de novo", () => {
    expect(CONCLUIR).toMatch(
      /if v_run\.estado = 'concluida' then\s+return jsonb_build_object\('ok', true, 'repetida', true/,
    );
  });

  it("exige lease válido e vigente", () => {
    expect(CONCLUIR).toMatch(
      /v_run\.estado <> 'processando'\s+or v_run\.lease_token is null\s+or v_run\.lease_token <> p_lease_token\s+or v_run\.lease_expira_em <= now\(\)/,
    );
    expect(CONCLUIR).toMatch(/'codigo', 'lease_invalido'/);
  });

  it("abandona em vez de concluir quando exclusão começou ou o texto mudou", () => {
    expect(CONCLUIR).toMatch(/'codigo', 'exclusao_em_andamento'/);
    expect(CONCLUIR).toMatch(
      /v_avistamento\.observacao_revisao <> v_run\.observacao_revisao/,
    );
    expect(CONCLUIR).toMatch(/'codigo', 'revisao_desatualizada'/);
  });

  it("trava a execução e a identidade antes de escrever", () => {
    expect(CONCLUIR).toMatch(
      /from public\.imoveis_identificados_classificacoes c\s+where c\.id = p_run_id\s+and c\.user_id = p_user_id\s+for update/,
    );
    expect(CONCLUIR).toMatch(
      /from public\.imoveis_identificados i\s+where i\.id = v_run\.imovel_identificado_id\s+for update/,
    );
  });
});

describe("C2d — snapshot temporal e tipo canônico", () => {
  it("só a execução do avistamento corrente pode mover o snapshot", () => {
    expect(CONCLUIR).toMatch(
      /v_corrente := v_identidade\.avistamento_corrente_id is not null\s+and v_identidade\.avistamento_corrente_id = v_run\.avistamento_id/,
    );
    expect(CONCLUIR).toMatch(/snapshot_aplicado = v_corrente/);
  });

  it("classificação histórica grava as etiquetas e não toca a identidade", () => {
    // A aplicação de tipo é condicionada a v_corrente; fora dele, nenhum
    // update na identidade acontece.
    expect(CONCLUIR).toMatch(/v_aplica_tipo := v_corrente/);
    expect(CONCLUIR).toMatch(/if v_aplica_tipo then\s+update public\.imoveis_identificados i/);
  });

  it("confirmação humana e tipo manual vencem inferência posterior", () => {
    expect(CONCLUIR).toMatch(/coalesce\(v_identidade\.tipo_origem, ''\) <> 'manual'/);
    expect(CONCLUIR).toMatch(/coalesce\(v_identidade\.tipo_estado, ''\) <> 'confirmado'/);
  });

  it("sugestão nula não apaga tipo conhecido", () => {
    expect(CONCLUIR).toMatch(/and v_tipo is not null/);
    expect(CONCLUIR).toMatch(/and v_tipo_confianca is not null/);
  });

  it("grava a proveniência completa do tipo inferido", () => {
    const aplica = CONCLUIR.slice(CONCLUIR.indexOf("if v_aplica_tipo then"));
    for (const atribuicao of [
      "tipo = v_tipo",
      "tipo_origem = 'ia-texto'",
      "tipo_confianca = v_tipo_confianca",
      "tipo_estado = 'inferido'",
      "tipo_definido_em = now()",
      "tipo_classificacao_id = v_run.id",
      "tipo_avistamento_id = v_run.avistamento_id",
      "tipo_confirmado_por = null",
      "tipo_confirmado_em = null",
    ]) {
      expect(aplica).toContain(atribuicao);
    }
  });
});

describe("C2d — falha fechada", () => {
  it("só persiste código de lista fechada, caindo em falha-ia no desconhecido", () => {
    expect(FALHAR).toMatch(/when p_falha_codigo in \(/);
    expect(FALHAR).toMatch(/else 'falha-ia'/);
    // A lista da RPC não pode divergir do CHECK criado no C2a.
    const daRpc = (FALHAR.match(/when p_falha_codigo in \(([\s\S]*?)\) then/)?.[1] ?? "")
      .match(/'([a-z-]+)'/g)?.sort();
    const doCheck = (MIGRATION_C2A.match(
      /falha_codigo is null or falha_codigo in \(([\s\S]*?)\)/,
    )?.[1] ?? "").match(/'([a-z-]+)'/g)?.sort();
    expect(daRpc).toEqual(doCheck);
  });

  it("nunca persiste mensagem, URL, token ou stack", () => {
    expect(FALHAR).not.toMatch(/sqlerrm|p_mensagem|p_detalhe|p_stack/i);
  });

  it("devolve o avistamento a indisponivel ou pendente, nunca meio concluído", () => {
    expect(FALHAR).toMatch(/then 'indisponivel'\s+else 'pendente'/);
    expect(FALHAR).toMatch(
      /set classificacao_estado = v_estado_avistamento,\s+classificacao_id = null,\s+classificacao_em = null,\s+fingerprint = null/,
    );
  });

  it("exige lease válido e é idempotente", () => {
    expect(FALHAR).toMatch(/'codigo', 'lease_invalido'/);
    expect(FALHAR).toMatch(
      /if v_run\.estado = 'falhou' then\s+return jsonb_build_object\('ok', true, 'repetida', true/,
    );
  });

  it("fecha a execução e nunca marca snapshot aplicado", () => {
    expect(FALHAR).toMatch(
      /set estado = 'falhou',\s+falha_codigo = v_codigo,\s+concluida_em = now\(\),\s+lease_token = null,\s+lease_expira_em = null,\s+snapshot_aplicado = false/,
    );
  });
});

describe("C2d — o avistamento não ganha estado processando", () => {
  it("nenhuma das três escreve 'processando' no avistamento", () => {
    for (const fn of [INICIAR, CONCLUIR, FALHAR]) {
      expect(fn).not.toMatch(/classificacao_estado = 'processando'/);
    }
  });

  it("'processando' aparece só no estado da execução", () => {
    const ocorrencias = [...MIGRATION.matchAll(/'processando'/g)];
    expect(ocorrencias.length).toBeGreaterThan(0);
    for (const trecho of MIGRATION.split("\n").filter((l) => l.includes("'processando'"))) {
      expect(trecho).not.toMatch(/classificacao_estado/);
    }
  });

  it("o enum do avistamento continua sem processando", () => {
    const enumAvistamento = MIGRATION_C2A.match(
      /classificacao_estado in \(([^)]*)\)/,
    )?.[1] ?? "";
    expect(enumAvistamento).toContain("'pendente'");
    expect(enumAvistamento).toContain("'concluida'");
    expect(enumAvistamento).toContain("'indisponivel'");
    expect(enumAvistamento).toContain("'nao_aplicavel'");
    expect(enumAvistamento).not.toContain("'processando'");
  });
});
