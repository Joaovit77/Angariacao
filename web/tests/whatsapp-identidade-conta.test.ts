import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { idExternoDaNotaWhatsapp } from "@/lib/calculo/importacaoConversaWhatsapp";
import {
  PREFIXO_ID_NOTA,
  PREFIXO_ID_NOTA_ENVIADA,
  PREFIXO_ID_NOTA_IMPORTADA_ENVIADA,
  PREFIXO_ID_NOTA_IMPORTADA_RECEBIDA,
  SUFIXO_ID_ENCERRAMENTO,
} from "@/lib/calculo/notas";
import {
  detalheDaAtribuicaoDoEnvio,
  envioPrecisaDeEvento,
  persistenciaContaValida,
} from "@/lib/servidor/historicoWhatsapp";

/* Fase 1a-C2.1b.1 — identidade da mensagem do WhatsApp por conta.

   Estes testes leem o SQL e o TypeScript como texto e fixam as travas que o
   comportamento (coberto em Postgres real por
   `integration/whatsapp-identidade-supabase-local.test.ts`) não mostra
   sozinho: segurança das funções, paridade da família entre SQL e TS,
   paridade migration × schema, e quem NÃO pode chamar as RPCs novas. */

function ler(relativo: string): string {
  return readFileSync(new URL(relativo, import.meta.url), "utf8").replace(/\r\n/g, "\n");
}
function semComentariosSql(sql: string): string {
  return sql.replace(/--[^\n]*/g, "");
}
function semComentariosTs(fonte: string): string {
  return fonte.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

const MIGRATION = ler("../../supabase/migrations/20260929210000_registrar_nota_whatsapp_conta.sql");
const SCHEMA = ler("../../supabase-schema.sql");
const ROTA_WEBHOOK = ler("../app/api/whatsapp/webhook/[[...segredo]]/route.ts");
const ROTA_ENVIAR = ler("../app/api/whatsapp/enviar/route.ts");
const ROTA_CRON = ler("../app/api/cron/mensagens/route.ts");
const ROTA_IMPORTAR = ler("../app/api/whatsapp/importar-conversa/route.ts");
const DISPONIBILIDADE = ler("../lib/servidor/disponibilidadeMensagem.ts");

const FUNCOES = [
  "whatsapp_mensagem_externa_id",
  "registrar_nota_whatsapp_conta",
  "registrar_nota_whatsapp_origem",
] as const;

/** O bloco `create or replace function public.<nome>(` … `$$;`. */
function funcao(sql: string, nome: string): string {
  const inicio = sql.indexOf(`create or replace function public.${nome}(`);
  expect(inicio, `${nome} ausente`).toBeGreaterThanOrEqual(0);
  const abre = sql.indexOf("$$", inicio);
  const fecha = sql.indexOf("$$;", abre + 2);
  return sql.slice(inicio, fecha + 3);
}

describe("migration aditiva e espelhada no schema", () => {
  it("não cria tabela, índice, backfill, nem mexe em RLS ou nas RPCs antigas", () => {
    const codigo = semComentariosSql(MIGRATION);
    expect(codigo).not.toMatch(/create\s+(table|index|unique|policy)|alter\s+table|drop\s+|insert\s+into|\busing\s+gin\b/i);
    expect(codigo).not.toMatch(/registrar_nota_imovel\s*\(|registrar_nota_whatsapp\s*\(/);
    expect(codigo).not.toMatch(/efetivar_consolidacao_contato/);
  });

  it.each(FUNCOES)("%s: schema consolidado idêntico à migration", (nome) => {
    expect(funcao(SCHEMA, nome)).toBe(funcao(MIGRATION, nome));
    for (const linha of [
      `revoke all on function public.${nome}(`,
      `grant execute on function public.${nome}(`,
    ]) {
      const naMigration = MIGRATION.split("\n").find((l) => l.startsWith(linha));
      expect(naMigration, `${linha} na migration`).toBeTruthy();
      expect(SCHEMA.split("\n")).toContain(naMigration);
    }
  });
});

describe("segurança SQL", () => {
  it.each(FUNCOES)("%s: invoker, search_path vazio, só service_role", (nome) => {
    const corpo = funcao(MIGRATION, nome);
    expect(corpo).toContain("set search_path = ''");
    expect(corpo).not.toMatch(/security\s+definer/i);
    const assinatura = MIGRATION.match(new RegExp(`revoke all on function public\\.${nome}\\(([^)]*)\\) from public, anon, authenticated;`));
    expect(assinatura, `revoke de ${nome}`).toBeTruthy();
    expect(MIGRATION).toContain(`grant execute on function public.${nome}(${assinatura![1]}) to service_role;`);
    expect(MIGRATION).not.toMatch(new RegExp(`grant[^;]*${nome}[^;]*to\\s+(anon|authenticated|public)`, "i"));
  });

  it("toda tabela é qualificada por schema", () => {
    for (const nome of FUNCOES) {
      const corpo = semComentariosSql(funcao(MIGRATION, nome));
      expect(corpo).not.toMatch(/\b(from|update|join)\s+imoveis\b/i);
    }
  });
});

describe("lock e tenant", () => {
  const chaveLock =
    "pg_catalog.pg_advisory_xact_lock(\n    pg_catalog.hashtextextended('wa-msg:' || p_user_id::text || ':' || v_mid, 0)\n  );";

  it.each(["registrar_nota_whatsapp_conta", "registrar_nota_whatsapp_origem"])(
    "%s: mesma chave (user_id + id externo), pega ANTES de ler as notas",
    (nome) => {
      const corpo = funcao(MIGRATION, nome);
      expect(corpo).toContain(chaveLock);
      const lock = corpo.indexOf("pg_advisory_xact_lock");
      const leitura = corpo.indexOf("from public.imoveis");
      const primeiraLeituraDeNotas = corpo.indexOf("jsonb_array_elements");
      expect(lock).toBeGreaterThan(0);
      // A checagem de existência do conjunto (origem) pode vir antes; a
      // leitura das NOTAS da conta só depois do lock.
      expect(primeiraLeituraDeNotas).toBeGreaterThan(lock);
      expect(leitura).toBeGreaterThan(0);
    },
  );

  it("toda leitura/escrita de imoveis filtra user_id", () => {
    for (const nome of ["registrar_nota_whatsapp_conta", "registrar_nota_whatsapp_origem"]) {
      const corpo = semComentariosSql(funcao(MIGRATION, nome));
      // Comando a comando (até o `;`): todo comando que toca imoveis filtra o dono.
      const blocos = corpo.split(";").filter((b) => /public\.imoveis/.test(b));
      expect(blocos.length).toBeGreaterThan(0);
      for (const bloco of blocos) {
        expect(bloco, bloco.slice(0, 80)).toMatch(/user_id = p_user_id/);
      }
    }
  });

  it("a RPC do webhook nunca remove nota", () => {
    const corpo = semComentariosSql(funcao(MIGRATION, "registrar_nota_whatsapp_conta"));
    expect(corpo).not.toMatch(/jsonb_agg|delete|- 'id'|#-/);
    expect(corpo).toMatch(/\|\| pg_catalog\.jsonb_build_array\(p_nota\)/);
  });

  it("a origem só reconcilia wa-enviada:<mesmo id> com origem webhook-evolution, de forma null-safe", () => {
    const corpo = funcao(MIGRATION, "registrar_nota_whatsapp_origem");
    const predicado = "coalesce(t.e->>'id' = v_id and t.e->>'origem' = 'webhook-evolution', false)";
    expect(corpo).toContain(`where not ${predicado}`);
    expect(corpo).toContain(`case when ${predicado}`);
    expect(corpo).toContain(
      "pg_catalog.bool_or(not coalesce(n.nota->>'id' = v_id and n.nota->>'origem' = 'webhook-evolution', false))",
    );
    expect(corpo).toMatch(/if not \(v_id like 'wa-enviada:%'\) then/);
  });
});

describe("família de identidade: SQL e TypeScript dizem a mesma coisa", () => {
  const helper = funcao(MIGRATION, "whatsapp_mensagem_externa_id");

  it("o SQL reconhece exatamente os quatro prefixos do TS e exclui o encerrado", () => {
    const prefixos = [...helper.matchAll(/when p_nota_id like '([^'%]+)%'/g)].map((m) => m[1]).sort();
    expect(prefixos).toEqual(
      [PREFIXO_ID_NOTA, PREFIXO_ID_NOTA_ENVIADA, PREFIXO_ID_NOTA_IMPORTADA_ENVIADA, PREFIXO_ID_NOTA_IMPORTADA_RECEBIDA].sort(),
    );
    expect(helper).toContain(`p_nota_id not like '%${SUFIXO_ID_ENCERRAMENTO}'`);
    // O corte de cada prefixo bate com o comprimento real dele.
    for (const [prefixo, inicio] of [...helper.matchAll(/like '([^'%]+)%'[^\n]*substr\(p_nota_id, (\d+)\)/g)].map(
      (m) => [m[1], Number(m[2])] as const,
    )) {
      expect(inicio, prefixo).toBe(prefixo.length + 1);
    }
  });

  it("a mesma tabela de ids dá o mesmo id externo pelas duas regras", () => {
    // Emula o CASE do SQL a partir do próprio texto da função.
    const regras = [...helper.matchAll(/when p_nota_id like '([^'%]+)%'( and p_nota_id not like '%([^']+)')? then pg_catalog\.substr\(p_nota_id, (\d+)\)/g)]
      .map((m) => ({ prefixo: m[1], exclui: m[3] || null, inicio: Number(m[4]) }));
    const sql = (id: string) => {
      for (const r of regras) {
        if (id.startsWith(r.prefixo) && !(r.exclui && id.endsWith(r.exclui))) {
          const v = id.slice(r.inicio - 1);
          return v || null;
        }
      }
      return null;
    };
    const casos = [
      "wa:3EB0ABC", "wa:3EB0ABC:encerrado", "wa-enviada:3EB0ABC", "wa-enviada:api:1f2e",
      "wa-contexto-recebida:3EB0ABC", "wa-contexto-enviada:3EB0ABC", "sophia:9", "manual-uuid",
      "wa-enviada:manual:77", "", "wa:", "wa-contexto-recebida:",
    ];
    for (const id of casos) {
      expect(sql(id), id).toBe(idExternoDaNotaWhatsapp({ id }) || null);
    }
  });
});

describe("namespace: uma instância por conta", () => {
  it("whatsapp_instancias continua com primary key (user_id) e instancia única", () => {
    const inicio = SCHEMA.indexOf("create table if not exists whatsapp_instancias");
    expect(inicio, "tabela whatsapp_instancias no schema").toBeGreaterThanOrEqual(0);
    const tabela = SCHEMA.slice(inicio, SCHEMA.indexOf(");", inicio));
    // Se isto mudar, `user_id + key.id` deixa de ser identidade suficiente:
    // revisar a chave do lock e da família antes de mexer aqui.
    expect(tabela).toMatch(/user_id\s+uuid\s+primary key/);
    expect(tabela).toMatch(/instancia\s+text\s+not null unique/);
  });
});

describe("quem chama o quê", () => {
  it("webhook: recebida e fromMe pela RPC da conta; nenhuma gravação por linha da mensagem", () => {
    const codigo = semComentariosTs(ROTA_WEBHOOK);
    expect(codigo).toContain('supabase.rpc("registrar_nota_whatsapp_conta"');
    expect(codigo).toContain("registrarMensagemEnviadaDoWebhook(supabase");
    expect(codigo).not.toMatch(/registrarMensagemEnviada\(/);
    expect(codigo).not.toContain("registrar_nota_whatsapp_origem");
    // A única gravação por linha que sobra é a do encerramento (derivada).
    const porLinha = [...codigo.matchAll(/rpc\("registrar_nota_whatsapp",/g)];
    expect(porLinha).toHaveLength(1);
    expect(codigo).toMatch(/rpc\("registrar_nota_whatsapp", \{[\s\S]{0,120}notaDoEncerramento\(/);
  });

  it("webhook: falha da RPC não cai para gravação por linha", () => {
    const trecho = ROTA_WEBHOOK.slice(
      ROTA_WEBHOOK.indexOf('supabase.rpc("registrar_nota_whatsapp_conta"'),
      ROTA_WEBHOOK.indexOf("await concluirFollowUpsQuePerderamSentido("),
    );
    expect(trecho).toMatch(/if \(!persistencia\) \{[\s\S]*?return Response\.json\(\{ ok: true \}\);/);
    expect(trecho).toMatch(/if \(persistencia !== "gravada"\) \{[\s\S]*?return Response\.json\(\{ ok: true \}\);/);
    expect(trecho).not.toMatch(/registrar_nota_imovel|rpc\("registrar_nota_whatsapp",/);
  });

  it("painel e cron sem consolidação usam a RPC de origem", () => {
    expect(ROTA_ENVIAR).toContain("registrarMensagemEnviadaDeOrigem(servicoEnvio");
    expect(semComentariosTs(ROTA_ENVIAR)).not.toMatch(/registrarMensagemEnviada\(/);
    expect(ROTA_CRON).toContain("registrarMensagemEnviadaDeOrigem(admin");
    expect(semComentariosTs(ROTA_CRON)).not.toMatch(/registrarMensagemEnviada\(|registrar_nota_whatsapp_conta/);
  });

  it("M3/M4: a consolidação não chama nenhuma RPC nova e segue gravando por linha em N imóveis", () => {
    expect(DISPONIBILIDADE).not.toMatch(/registrar_nota_whatsapp_conta|registrar_nota_whatsapp_origem|registrarMensagemEnviadaDeOrigem/);
    const efetivar = SCHEMA.slice(
      SCHEMA.indexOf("create or replace function public.efetivar_consolidacao_contato("),
    );
    const corpo = efetivar.slice(0, efetivar.indexOf("$$;") + 3);
    expect(corpo).toContain("public.registrar_nota_imovel(v_imovel, p_user_id, v_nota->'nota')");
    expect(corpo).not.toMatch(/registrar_nota_whatsapp_conta|registrar_nota_whatsapp_origem|pg_advisory_xact_lock\(\s*pg_catalog\.hashtextextended\('wa-msg/);
    // No cron, o caminho consolidado continua pela efetivação e sai antes
    // da gravação de origem.
    const consolidado = ROTA_CRON.slice(
      ROTA_CRON.indexOf("if (consolidacao?.reservadasIds.length) {"),
      ROTA_CRON.indexOf("Caminho SEM consolidação"),
    );
    expect(consolidado).toContain("efetivarConsolidacaoContato(admin");
    expect(consolidado).toMatch(/continue;\s*\}\s*\/\*\s*$/);
    expect(consolidado).not.toContain("registrarMensagemEnviadaDeOrigem");
  });

  it("importação segue por linha e não usa a RPC de origem", () => {
    expect(ROTA_IMPORTAR).toContain('supabase.rpc("registrar_nota_imovel"');
    expect(ROTA_IMPORTAR).not.toMatch(/registrar_nota_whatsapp_(conta|origem)/);
  });

  it("nada de C3 ou 1a-D: sem efeitosPendentes, sem reatribuição humana", () => {
    for (const fonte of [MIGRATION, ROTA_WEBHOOK, ROTA_ENVIAR, ROTA_CRON]) {
      expect(fonte).not.toMatch(/efeitosPendentes|reatribuir|atribuir_mensagem|mover_mensagem/i);
    }
  });
});

describe("contratos puros da observabilidade", () => {
  it("vocabulário fechado da RPC do webhook: desconhecido não vira gravada nem duplicada", () => {
    for (const v of ["gravada", "duplicada-mesmo-imovel", "duplicada-outro-imovel", "imovel-inexistente"]) {
      expect(persistenciaContaValida(v)).toBe(v);
    }
    for (const v of [true, false, null, "duplicada", "ok", 1]) expect(persistenciaContaValida(v)).toBeNull();
  });

  it("evento da origem só fora do normal, e sem id da mensagem", () => {
    expect(envioPrecisaDeEvento("gravada", "externa")).toBe(false);
    expect(envioPrecisaDeEvento("duplicada", "externa")).toBe(false);
    expect(envioPrecisaDeEvento("falha", "externa")).toBe(false); // tem evento próprio
    expect(envioPrecisaDeEvento("origem-reconciliou-eco", "externa")).toBe(true);
    expect(envioPrecisaDeEvento("conflito", "externa")).toBe(true);
    expect(envioPrecisaDeEvento("gravada", "fallback-interno")).toBe(true);
    const detalhe = detalheDaAtribuicaoDoEnvio({
      persistencia: "origem-reconciliou-eco", identidade: "externa", origem: "cron",
      imoveisDeclarados: ["a"], imoveisEco: ["b"],
    });
    expect(JSON.parse(detalhe)).toEqual({
      persistencia: "origem-reconciliou-eco", identidade: "externa", origem: "cron",
      imoveis_declarados: ["a"], imovel_eco_id: "b",
    });
  });
});
