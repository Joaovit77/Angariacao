/* ================================================================
   C2e — RPCs DO MODELO NAVEGADOR

   Teste estrutural sobre o SQL, no molde das demais suítes do módulo. Cada
   asserção existe para falhar quando uma decisão da V7 for perdida: modelo de
   identidade, posse, idempotência, caminho gerado pelo banco, prova de
   presença dos objetos, origem manual não forjável, tipo canônico, merge com
   lápide e ponteiro canônico, e bloqueio durante exclusão.
   ================================================================ */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { VERSAO_CATALOGO_ETIQUETAS } from "@/lib/calculo/catalogoEtiquetas";

const RAIZ = new URL("../../", import.meta.url);

/* `core.autocrlf=true` deixa o schema em CRLF e a migration em LF num checkout
   novo no Windows; sem normalizar, o espelho falharia por fim de linha. */
function lerSql(relativo: string): string {
  return readFileSync(new URL(relativo, RAIZ), "utf8").replace(/\r\n/g, "\n");
}

const MIGRATION = lerSql("supabase/migrations/20260910211045_prospeccao_campo_rpcs_navegador.sql");
const SCHEMA = lerSql("supabase-schema.sql");
const MIGRATION_C2A = lerSql("supabase/migrations/20260910184310_prospeccao_campo.sql");
const MIGRATION_C2B = lerSql(
  "supabase/migrations/20260910190155_prospeccao_campo_rls_grants.sql",
);

/** Os dez nomes canônicos da V7, na ordem em que a migration os cria. */
const RPCS = [
  "reservar_foto_avistamento",
  "finalizar_foto_avistamento",
  "aplicar_etiqueta_humana",
  "definir_estado_etiqueta",
  "definir_tipo_manual",
  "confirmar_tipo_identificado",
  "definir_situacao_identificado",
  "vincular_promocao_imovel_identificado",
  "fundir_imoveis_identificados",
  "cancelar_exclusao_imovel_identificado",
] as const;

function corpo(nome: string): string {
  const trecho = MIGRATION.match(
    new RegExp(`create or replace function public\\.${nome}\\([\\s\\S]*?\\n\\$\\$;`, "i"),
  )?.[0];
  if (!trecho) throw new Error(`Função ${nome} ausente da migration.`);
  return trecho;
}

const FN = Object.fromEntries(RPCS.map((n) => [n, corpo(n)])) as Record<
  (typeof RPCS)[number],
  string
>;

describe("C2e — as dez RPCs com nomes exatos", () => {
  it("espelha a migration no schema canônico uma única vez", () => {
    const bloco = `\n${MIGRATION.trim()}\n`;
    expect(SCHEMA).toContain(bloco);
    expect(SCHEMA.split(bloco)).toHaveLength(2);
  });

  it("cria exatamente as dez previstas, com os nomes canônicos da V7", () => {
    const criadas = [...MIGRATION.matchAll(/create or replace function public\.(\w+)\(/gi)]
      .map((m) => m[1]);
    expect(criadas).toEqual([...RPCS]);
  });

  it("não traz tabela, índice, policy, trigger, bucket nem Storage escrito", () => {
    expect(MIGRATION).not.toMatch(/\bcreate table\b/i);
    expect(MIGRATION).not.toMatch(/\bcreate (?:unique )?index\b/i);
    expect(MIGRATION).not.toMatch(/\bcreate policy\b/i);
    expect(MIGRATION).not.toMatch(/\bcreate trigger\b/i);
    expect(MIGRATION).not.toMatch(/storage\.buckets/i);
    // Só LÊ storage.objects, nunca escreve nem apaga.
    expect(MIGRATION).not.toMatch(/insert into storage\.objects/i);
    expect(MIGRATION).not.toMatch(/update storage\.objects/i);
    expect(MIGRATION).not.toMatch(/delete from storage\.objects/i);
  });

  it("não invade o C2f nem redefine nada dos checkpoints anteriores", () => {
    for (const proibida of [
      "iniciar_exclusao_imovel_identificado",
      "confirmar_objeto_removido",
      "concluir_exclusao_imovel_identificado",
      "apagar_prospeccao_do_usuario",
      "listar_objetos_do_usuario",
      "iniciar_classificacao",
      "concluir_classificacao",
      "falhar_classificacao",
      "private.proteger_avistamento",
      "private.proteger_identificado",
      "private.tipo_manual_no_cadastro",
      "private.sincronizar_avistamentos_identidade",
    ]) {
      expect(MIGRATION).not.toContain(`function public.${proibida}`);
      expect(MIGRATION).not.toContain(`create or replace function ${proibida}`);
    }
  });

  it("usa security definer e search_path vazio nas dez", () => {
    for (const nome of RPCS) {
      expect(FN[nome]).toMatch(/security definer/i);
      expect(FN[nome]).toContain("set search_path = ''");
    }
  });
});

describe("C2e — modelo de identidade do Navegador", () => {
  it("nenhuma recebe p_user_id", () => {
    // Asserção sobre os CORPOS: o cabeçalho do arquivo menciona `p_user_id`
    // justamente para dizer que ele pertence ao modelo Servidor do C2d.
    for (const nome of RPCS) {
      expect(FN[nome]).not.toMatch(/\bp_user_id\b/);
    }
  });

  it("todas derivam a identidade de auth.uid() e exigem sessão", () => {
    for (const nome of RPCS) {
      expect(FN[nome]).toMatch(/v_user uuid := \(select auth\.uid\(\)\)/);
      expect(FN[nome]).toMatch(
        /if v_user is null then\s+raise exception 'Sessão autenticada obrigatória\.'[\s\S]*?'42501'/i,
      );
    }
  });

  it("concede execute só a authenticated, nunca a service_role", () => {
    const grants = [...MIGRATION.matchAll(/^grant execute[\s\S]*?;/gim)].map((m) => m[0]);
    expect(grants).toHaveLength(10);
    for (const grant of grants) {
      expect(grant).toMatch(/to authenticated;/);
      expect(grant).not.toMatch(/\bservice_role\b/);
      expect(grant).not.toMatch(/\banon\b/);
    }
  });

  it("revoga as dez de todos os papéis antes de conceder", () => {
    const revokes = [...MIGRATION.matchAll(/^revoke all on function[\s\S]*?;/gim)];
    expect(revokes).toHaveLength(10);
    for (const revoke of revokes) {
      expect(revoke[0]).toMatch(/from public, anon, authenticated, service_role;/);
    }
  });

  it("não mistura com o modelo Servidor do C2d", () => {
    // A marca do outro modelo é `v_jwt`/`p_user_id`: nenhuma aqui tem.
    expect(MIGRATION).not.toMatch(/v_jwt/);
  });

  it("valida posse explicitamente, porque o definer passa por cima da RLS", () => {
    // Toda função filtra o alvo pelo usuário da sessão.
    for (const nome of RPCS) {
      expect(FN[nome]).toMatch(/user_id = v_user/);
    }
  });

  it("posse cruzada devolve o mesmo erro de inexistência", () => {
    const naoEncontrado = [...MIGRATION.matchAll(/raise exception '[^']*não encontrad[ao][^']*'[\s\S]*?'P0002'/gi)];
    expect(naoEncontrado.length).toBeGreaterThanOrEqual(10);
  });
});

describe("C2e — bloqueio durante exclusão", () => {
  it("as nove mutáveis recusam com exclusao_em_andamento", () => {
    for (const nome of RPCS.filter((n) => n !== "cancelar_exclusao_imovel_identificado")) {
      expect(FN[nome]).toMatch(/'codigo', 'exclusao_em_andamento'/);
    }
  });

  it("o cancelamento é a única exceção, e existe para sair do estado", () => {
    const fn = FN["cancelar_exclusao_imovel_identificado"];
    expect(fn).not.toMatch(/'codigo', 'exclusao_em_andamento'/);
    expect(fn).toMatch(/if v_identidade\.exclusao_solicitada_em is null then\s+return jsonb_build_object\('ok', true, 'repetida', true\)/);
    expect(fn).toMatch(/set exclusao_solicitada_em = null/);
  });

  it("o cancelamento não ressuscita foto já removida", () => {
    const fn = FN["cancelar_exclusao_imovel_identificado"];
    expect(fn).not.toMatch(/insert into public\.imoveis_identificados_fotos/i);
    expect(fn).toMatch(/'fotos_restantes', v_fotos/);
  });
});

describe("C2e — reservar_foto_avistamento", () => {
  const fn = FN["reservar_foto_avistamento"];

  it("não aceita caminho do browser: gera os dois no banco", () => {
    expect(fn).not.toMatch(/p_caminho|p_path|p_miniatura/);
    expect(fn).toMatch(
      /v_base := v_user::text \|\| '\/' \|\| v_avistamento\.imovel_identificado_id::text\s*\|\| '\/' \|\| p_avistamento_id::text \|\| '\/' \|\| v_uuid/,
    );
    expect(fn).toMatch(/v_caminho := v_base \|\| '\.jpg'/);
    expect(fn).toMatch(/v_miniatura := v_base \|\| '_thumb\.jpg'/);
  });

  it("cria a linha ANTES do upload, em estado reservada", () => {
    expect(fn).toMatch(/insert into public\.imoveis_identificados_fotos/);
    expect(fn).toMatch(/'reservada'/);
  });

  it("é idempotente para a reserva aberta do mesmo avistamento", () => {
    expect(fn).toMatch(
      /if v_foto\.estado = 'reservada' then\s+return jsonb_build_object\(\s*'ok', true, 'repetida', true,/,
    );
    // Devolve os MESMOS caminhos, não gera outros.
    expect(fn).toMatch(/'caminho', v_foto\.caminho/);
    expect(fn).toMatch(/'caminho_miniatura', v_foto\.caminho_miniatura/);
    expect(fn).toMatch(/pg_advisory_xact_lock/);
  });

  it("uma foto por avistamento: recusa quando já existe ativa", () => {
    expect(fn).toMatch(/'codigo', 'foto_ja_ativa'/);
    // A garantia dura é o índice único total do C2a.
    expect(MIGRATION_C2A).toMatch(
      /create unique index if not exists idx_identificados_fotos_avistamento_unico\s+on public\.imoveis_identificados_fotos \(avistamento_id\)/i,
    );
  });

  it("recusa exclusão em andamento e pai fundido", () => {
    expect(fn).toMatch(/'codigo', 'exclusao_em_andamento'/);
    expect(fn).toMatch(/'codigo', 'registro_fundido'/);
  });

  it("exige dimensões e tamanho positivos", () => {
    expect(fn).toMatch(/p_largura is null or p_largura <= 0/);
    expect(fn).toMatch(/p_altura is null or p_altura <= 0/);
    expect(fn).toMatch(/p_bytes is null or p_bytes <= 0/);
  });
});

describe("C2e — finalizar_foto_avistamento", () => {
  const fn = FN["finalizar_foto_avistamento"];

  it("lê storage.objects e exige os DOIS objetos exatos", () => {
    expect(fn).toMatch(
      /select exists \(\s*select 1 from storage\.objects o\s+where o\.bucket_id = 'fachadas' and o\.name = v_foto\.caminho\s*\) into v_tem_original/,
    );
    expect(fn).toMatch(
      /where o\.bucket_id = 'fachadas' and o\.name = v_foto\.caminho_miniatura\s*\) into v_tem_miniatura/,
    );
  });

  it("não ativa faltando qualquer um, com código distinto por caso", () => {
    expect(fn).toMatch(/not v_tem_original and not v_tem_miniatura[\s\S]*?'nenhum_objeto'/);
    expect(fn).toMatch(/v_tem_original and not v_tem_miniatura[\s\S]*?'miniatura_ausente'/);
    expect(fn).toMatch(/v_tem_miniatura and not v_tem_original[\s\S]*?'original_ausente'/);
    // O update de ativação vem depois de todas as recusas.
    const ativacao = fn.indexOf("set estado = 'ativa'");
    expect(ativacao).toBeGreaterThan(fn.indexOf("'original_ausente'"));
  });

  it("ativa só com os dois presentes", () => {
    expect(fn).toMatch(/set estado = 'ativa',\s+ativada_em = now\(\)/);
  });

  it("é idempotente quando já ativa e os dois existem", () => {
    expect(fn).toMatch(
      /if v_foto\.estado = 'ativa' then\s+if v_tem_original and v_tem_miniatura then\s+return jsonb_build_object\('ok', true, 'repetida', true/,
    );
  });

  it("NUNCA rebaixa ativa para reservada", () => {
    expect(fn).toMatch(/'codigo', 'objeto_ausente'/);
    expect(fn).not.toMatch(/set estado = 'reservada'/);
  });

  it("não escreve nem apaga objeto do Storage", () => {
    expect(fn).not.toMatch(/insert into storage|update storage|delete from storage/i);
  });
});

describe("C2e — aplicar_etiqueta_humana", () => {
  const fn = FN["aplicar_etiqueta_humana"];

  it("codifica origem manual e não tem parâmetro de origem", () => {
    expect(fn).toMatch(/'manual', null, 'confirmada', null,/);
    expect(fn).not.toMatch(/p_origem|p_estado|p_confianca|p_modelo/);
    // Nem a palavra do outro mundo aparece: não há onde forjar ia-texto.
    expect(fn).not.toMatch(/ia-texto/);
  });

  it("a autoria é do usuário da sessão, nunca recebida", () => {
    expect(fn).toMatch(/v_user, now\(\)\s*\)/);
    expect(fn).not.toMatch(/p_confirmada_por/);
  });

  it("valida posse do imóvel e do avistamento, e o vínculo entre os dois", () => {
    expect(fn).toMatch(/where i\.id = p_imovel_identificado_id\s+and i\.user_id = v_user/);
    expect(fn).toMatch(
      /where a\.id = p_avistamento_id\s+and a\.user_id = v_user\s+and a\.imovel_identificado_id = p_imovel_identificado_id/,
    );
  });

  it("aceita etiqueta do LUGAR com avistamento nulo", () => {
    expect(fn).toMatch(/if p_avistamento_id is not null then/);
    expect(fn).toMatch(/p_avistamento_id is null\s+and e\.avistamento_id is null/);
  });

  it("é idempotente para etiqueta já vigente no mesmo escopo", () => {
    expect(fn).toMatch(/e\.estado in \('inferida', 'confirmada'\)/);
    expect(fn).toMatch(/if v_existente is not null then\s+return jsonb_build_object\('ok', true, 'repetida', true/);
  });

  it("tem exatamente os quatro parâmetros da V7, e nenhum de versão", () => {
    const assinatura = MIGRATION.match(
      /create or replace function public\.aplicar_etiqueta_humana\(([\s\S]*?)\)\s*\nreturns/,
    )?.[1];
    expect(assinatura).toBeDefined();
    const parametros = (assinatura ?? "")
      .split(",")
      .map((p) => p.trim().split(/\s+/)[0])
      .filter(Boolean);
    expect(parametros).toEqual([
      "p_imovel_identificado_id",
      "p_avistamento_id",
      "p_categoria",
      "p_codigo",
    ]);
    expect(parametros).toHaveLength(4);
  });

  it("o navegador não fornece nem escolhe a versão do catálogo", () => {
    // Nem na assinatura, nem no revoke/grant, nem em lugar algum da migration.
    expect(MIGRATION).not.toMatch(/p_versao_catalogo/);
    expect(MIGRATION).toMatch(
      /revoke all on function public\.aplicar_etiqueta_humana\(uuid, uuid, text, text\)/,
    );
    expect(MIGRATION).toMatch(
      /grant execute on function public\.aplicar_etiqueta_humana\(uuid, uuid, text, text\) to authenticated;/,
    );
  });

  it("persiste a versão canônica, amarrada a VERSAO_CATALOGO_ETIQUETAS", () => {
    // O catálogo vive em código (D3) e a versão precisa existir em dois lugares.
    // O mecanismo que o próprio plano usa para o schema do modelo vale aqui: um
    // teste amarra os dois. Subir a versão no TS e esquecer o SQL falha AQUI.
    const literal = fn.match(
      /v_versao_catalogo constant integer := (\d+);/,
    )?.[1];
    expect(literal).toBeDefined();
    expect(Number(literal)).toBe(VERSAO_CATALOGO_ETIQUETAS);
    // E é esse valor que entra na linha, não algo vindo de fora.
    expect(fn).toMatch(/v_versao_catalogo, null,/);
    expect(MIGRATION_C2A).toMatch(/versao_catalogo integer not null/);
  });
});

describe("C2e — definir_estado_etiqueta", () => {
  const fn = FN["definir_estado_etiqueta"];

  it("aceita só os dois estados humanos da V7", () => {
    expect(fn).toMatch(/p_estado not in \('confirmada', 'contestada'\)/);
  });

  it("a autoria da confirmação vem de auth.uid()", () => {
    expect(fn).toMatch(
      /set estado = 'confirmada',\s+confirmada_por = v_user,\s+confirmada_em = now\(\)/,
    );
    expect(fn).not.toMatch(/p_confirmada_por|p_autor/);
  });

  it("contestar não apaga a assinatura anterior", () => {
    const contestar = fn.slice(fn.indexOf("set estado = 'contestada'"));
    expect(contestar).not.toMatch(/confirmada_por = null/);
  });

  it("não reabre etiqueta fora de vigência", () => {
    expect(fn).toMatch(/'codigo', 'etiqueta_nao_vigente'/);
    expect(fn).toMatch(/v_etiqueta\.estado not in \('inferida', 'confirmada', 'contestada'\)/);
  });

  it("é idempotente para o mesmo estado", () => {
    expect(fn).toMatch(/if v_etiqueta\.estado = p_estado then\s+return jsonb_build_object\('ok', true, 'repetida', true/);
  });
});

describe("C2e — tipo canônico: manual e confirmação", () => {
  it("definir_tipo_manual codifica manual/declarado e zera proveniência de IA", () => {
    const fn = FN["definir_tipo_manual"];
    // Tipo nulo limpa tudo; tipo presente nasce manual/declarado com a data
    // do servidor. Nenhum dos três é escolha do cliente.
    expect(fn).toMatch(/tipo_origem = case when v_tipo is null then null else 'manual' end/);
    expect(fn).toMatch(/tipo_estado = case when v_tipo is null then null else 'declarado' end/);
    expect(fn).toMatch(/tipo_definido_em = case when v_tipo is null then null else now\(\) end/);
    for (const zerada of [
      "tipo_confianca = null",
      "tipo_classificacao_id = null",
      "tipo_avistamento_id = null",
      "tipo_confirmado_por = null",
      "tipo_confirmado_em = null",
    ]) {
      expect(fn).toContain(zerada);
    }
    // Não existe parâmetro de origem/estado: manual não é escolha do cliente.
    expect(fn).not.toMatch(/p_tipo_origem|p_tipo_estado|p_tipo_confianca/);
  });

  it("confirmar_tipo_identificado mantém a cadeia de proveniência de IA", () => {
    const fn = FN["confirmar_tipo_identificado"];
    expect(fn).toMatch(
      /set tipo_estado = 'confirmado',\s+tipo_confirmado_por = v_user,\s+tipo_confirmado_em = now\(\)/,
    );
    // NÃO toca origem, confiança nem os ids: a história "IA sugeriu, humano
    // assinou" tem de sobreviver.
    const atualizacao = fn.slice(fn.indexOf("set tipo_estado = 'confirmado'"));
    expect(atualizacao).not.toMatch(/tipo_origem =/);
    expect(atualizacao).not.toMatch(/tipo_classificacao_id =/);
    expect(atualizacao).not.toMatch(/tipo_avistamento_id =/);
    expect(atualizacao).not.toMatch(/tipo_confianca =/);
  });

  it("confirmar só age sobre inferência válida e é idempotente", () => {
    const fn = FN["confirmar_tipo_identificado"];
    expect(fn).toMatch(/v_identidade\.tipo_origem is distinct from 'ia-texto'/);
    expect(fn).toMatch(/v_identidade\.tipo_estado is distinct from 'inferido'/);
    expect(fn).toMatch(/'codigo', 'tipo_nao_inferido'/);
    expect(fn).toMatch(/if v_identidade\.tipo_estado = 'confirmado' then\s+return jsonb_build_object\('ok', true, 'repetida', true\)/);
  });
});

describe("C2e — definir_situacao_identificado", () => {
  const fn = FN["definir_situacao_identificado"];

  it("aceita só os quatro estados permitidos pela V7", () => {
    expect(fn).toMatch(
      /p_situacao not in \('identificado', 'investigando', 'promovendo', 'descartado'\)/,
    );
  });

  it("promovido e fundido são inalcançáveis por aqui", () => {
    const permitidos = fn.match(/p_situacao not in \(([^)]*)\)/)?.[1] ?? "";
    expect(permitidos).not.toContain("'promovido'");
    expect(permitidos).not.toContain("'fundido'");
    expect(fn).toMatch(/'codigo', 'ja_promovido'/);
    expect(fn).toMatch(/'codigo', 'registro_fundido'/);
  });

  it("mantém coerência dos campos de descarte nos dois sentidos", () => {
    expect(fn).toMatch(
      /descartado_em = case when p_situacao = 'descartado' then now\(\) else null end/,
    );
    expect(fn).toMatch(
      /descartado_motivo = case when p_situacao = 'descartado' then v_motivo else null end/,
    );
  });

  it("é idempotente para a situação já vigente", () => {
    expect(fn).toMatch(/if v_identidade\.situacao = p_situacao then\s+return jsonb_build_object\('ok', true, 'repetida', true/);
  });

  it("'promovendo' existe para a recuperação de promoção parcial", () => {
    // O CHECK do C2a é o que impede o meio-estado incoerente.
    expect(MIGRATION_C2A).toMatch(
      /situacao <> 'promovendo' or \(imovel_id is null and promovido_em is null\)/,
    );
  });
});

describe("C2e — vincular_promocao_imovel_identificado", () => {
  const fn = FN["vincular_promocao_imovel_identificado"];

  it("é o único caminho de imovel_id e promovido_em", () => {
    expect(fn).toMatch(
      /set situacao = 'promovido',\s+imovel_id = p_imovel_id,\s+promovido_em = now\(\)/,
    );
    // Nenhuma outra RPC do C2e escreve essas colunas.
    for (const nome of RPCS.filter((n) => n !== "vincular_promocao_imovel_identificado")) {
      expect(FN[nome]).not.toMatch(/imovel_id = p_imovel_id/);
      expect(FN[nome]).not.toMatch(/promovido_em = now\(\)/);
    }
  });

  it("NÃO cria imóvel e não promove sozinha", () => {
    expect(fn).not.toMatch(/insert into public\.imoveis\b/i);
    expect(MIGRATION).not.toMatch(/insert into public\.imoveis\s*\(/i);
    expect(MIGRATION).not.toMatch(/update public\.imoveis\s+set/i);
  });

  it("valida posse da oportunidade no Pipeline", () => {
    expect(fn).toMatch(
      /select 1 from public\.imoveis m\s+where m\.id = p_imovel_id and m\.user_id = v_user/,
    );
    expect(fn).toMatch(/raise exception 'Oportunidade não encontrada\.'[\s\S]*?'P0002'/);
  });

  it("é idempotente com o mesmo imovel_id e recusa com outro", () => {
    expect(fn).toMatch(
      /if v_identidade\.imovel_id = p_imovel_id then\s+return jsonb_build_object\(\s*'ok', true, 'repetida', true/,
    );
    expect(fn).toMatch(/'codigo', 'ja_promovido_em_outra'/);
  });

  it("recusa oportunidade já vinculada a outro identificado", () => {
    expect(fn).toMatch(/'codigo', 'imovel_ja_vinculado'/);
    expect(fn).toMatch(/where o\.imovel_id = p_imovel_id\s+and o\.id <> p_imovel_identificado_id/);
  });

  it("recusa registro descartado", () => {
    expect(fn).toMatch(/'codigo', 'registro_descartado'/);
  });
});

describe("C2e — fundir_imoveis_identificados", () => {
  const fn = FN["fundir_imoveis_identificados"];

  it("exige mesmo usuário nos dois lados e recusa fusão em si mesmo", () => {
    expect(fn).toMatch(/where i\.id = p_sobrevivente_id and i\.user_id = v_user/);
    expect(fn).toMatch(/where i\.id = p_absorvido_id and i\.user_id = v_user/);
    expect(fn).toMatch(/'codigo', 'fusao_em_si_mesmo'/);
    expect(MIGRATION_C2A).toMatch(/fundido_em_imovel_id is null or fundido_em_imovel_id <> id/);
  });

  it("recusa promovido, promovendo e lápide nos dois lados", () => {
    expect(fn).toMatch(
      /v_sobrevivente\.situacao in \('fundido', 'promovido', 'promovendo'\)\s+or v_absorvido\.situacao in \('fundido', 'promovido', 'promovendo'\)/,
    );
    expect(fn).toMatch(/'codigo', 'situacao_incompativel'/);
  });

  it("cria a lápide ANTES de reparentear — é ela que autoriza o gatilho", () => {
    const lapide = fn.indexOf("set situacao = 'fundido'");
    const reparente = fn.indexOf("set imovel_identificado_id = p_sobrevivente_id");
    expect(lapide).toBeGreaterThan(0);
    expect(reparente).toBeGreaterThan(lapide);
    expect(fn).toMatch(
      /set situacao = 'fundido',\s+fundido_em = now\(\),\s+fundido_em_imovel_id = p_sobrevivente_id/,
    );
  });

  it("repontua as lápides antigas para o sobrevivente canônico", () => {
    expect(fn).toMatch(
      /set fundido_em_imovel_id = p_sobrevivente_id\s+where i\.user_id = v_user\s+and i\.fundido_em_imovel_id = p_absorvido_id/,
    );
    expect(fn).toMatch(/get diagnostics v_lapides = row_count/);
  });

  it("reparenteia o histórico preservando id e timestamps", () => {
    // Extrai o SET daquele UPDATE e prova que ele tem UMA atribuição só: o
    // vínculo. `id`, `observado_em`, `observacao_revisao` e `created_at` ficam
    // intocados, então o evento histórico muda de pai sem ser recriado.
    const set = fn.match(
      /update public\.imoveis_identificados_avistamentos a\s+set ([\s\S]*?)\s+where /,
    )?.[1];
    expect(set).toBeDefined();
    expect(set).toBe("imovel_identificado_id = p_sobrevivente_id");
    expect(set).not.toContain(",");
    expect(fn).not.toMatch(/delete from public\.imoveis_identificados_avistamentos/i);
    expect(fn).not.toMatch(/insert into public\.imoveis_identificados_avistamentos/i);
  });

  it("ajusta o denormalizado em fotos, classificações e etiquetas", () => {
    for (const tabela of [
      "imoveis_identificados_fotos f",
      "imoveis_identificados_classificacoes c",
      "imoveis_identificados_etiquetas e",
    ]) {
      expect(fn).toContain(`update public.${tabela}`);
    }
    // Caminho de Storage não se move: é identificador opaco.
    expect(fn).not.toMatch(/set caminho|caminho_miniatura =/);
  });

  it("recalcula os DOIS lados explicitamente", () => {
    expect(fn).toMatch(
      /perform private\.recalcular_agregados_identificado\(p_absorvido_id\);\s+perform private\.recalcular_agregados_identificado\(p_sobrevivente_id\)/,
    );
  });

  it("não reinfere tipo: herda só quando o sobrevivente não tinha", () => {
    expect(fn).toMatch(
      /if v_sobrevivente\.tipo is null and v_absorvido\.tipo is not null then/,
    );
    const heranca = fn.slice(fn.indexOf("if v_sobrevivente.tipo is null"));
    for (const campo of [
      "tipo_origem = v_absorvido.tipo_origem",
      "tipo_confianca = v_absorvido.tipo_confianca",
      "tipo_estado = v_absorvido.tipo_estado",
      "tipo_classificacao_id = v_absorvido.tipo_classificacao_id",
      "tipo_avistamento_id = v_absorvido.tipo_avistamento_id",
      "tipo_confirmado_por = v_absorvido.tipo_confirmado_por",
    ]) {
      expect(heranca).toContain(campo);
    }
    expect(heranca).not.toMatch(/'ia-texto'|'manual'/);
  });

  it("não escreve em imoveis e não promove", () => {
    expect(fn).not.toMatch(/public\.imoveis\b(?!_identificados)/);
    expect(fn).not.toMatch(/promovido_em|situacao = 'promovido'/);
  });

  it("é atômica: uma função, sem commit nem savepoint", () => {
    expect(fn).not.toMatch(/\bcommit\b|\bsavepoint\b|\brollback\b/i);
    expect(fn).toMatch(/pg_advisory_xact_lock/);
    // Ordem estável do lock evita espera cruzada entre duas fusões.
    expect(fn).toMatch(/least\(p_sobrevivente_id::text, p_absorvido_id::text\)/);
    expect(fn).toMatch(/greatest\(p_sobrevivente_id::text, p_absorvido_id::text\)/);
  });

  it("é idempotente quando já fundido neste sobrevivente", () => {
    expect(fn).toMatch(
      /if v_absorvido\.situacao = 'fundido'\s+and v_absorvido\.fundido_em_imovel_id = p_sobrevivente_id then\s+return jsonb_build_object\('ok', true, 'repetida', true/,
    );
  });

  it("cadeia A→B→C é impossível por construção", () => {
    // Lápide não pode ser sobrevivente nem ser absorvida de novo, e o passo de
    // repontuação move quem apontava para o absorvido.
    expect(fn).toMatch(/v_sobrevivente\.situacao in \('fundido'/);
    expect(fn).toMatch(/and i\.fundido_em_imovel_id = p_absorvido_id/);
    // E a FK da lápide é cascade, não set null — não violaria o CHECK.
    expect(MIGRATION_C2A).toMatch(
      /foreign key \(fundido_em_imovel_id\)\s+references public\.imoveis_identificados\(id\) on delete cascade/,
    );
  });
});

describe("C2e — o cliente continua sem escrita direta", () => {
  it("o C2b não concedeu delete a authenticated em tabela alguma", () => {
    const grants = [...MIGRATION_C2B.matchAll(/^grant\b[\s\S]*?\bto authenticated;/gim)]
      .map((m) => m[0]);
    expect(grants.join("\n")).not.toMatch(/\bdelete\b/i);
  });

  it("nenhuma RPC do C2e apaga linha das cinco tabelas", () => {
    for (const tabela of [
      "imoveis_identificados",
      "imoveis_identificados_avistamentos",
      "imoveis_identificados_fotos",
      "imoveis_identificados_classificacoes",
      "imoveis_identificados_etiquetas",
    ]) {
      expect(MIGRATION).not.toMatch(
        new RegExp(`delete from public\\.${tabela}\\b`, "i"),
      );
    }
  });
});
