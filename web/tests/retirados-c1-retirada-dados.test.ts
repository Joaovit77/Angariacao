import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { MOTIVOS_RETIRADA, ROTULO_MOTIVO_RETIRADA_DESCONHECIDO } from "../lib/constantes";
import { fromDbImovel, toDbImovel, type DbImovelRow } from "../lib/persistencia/mapeadores";
import type { Imovel } from "../lib/tipos";
import dbJson from "./fixtures-db.json";
import fixturesJson from "./fixtures.json";

/* Retirados, Fase C / C1: o banco guarda quando e por que o imóvel saiu da
   carteira. Este teste lê o SQL (migration e espelho canônico) e cobra o
   contrato aprovado: a lista fechada igual à do app, a coerência com
   `retirado`, a data só na transição para retirado, a limpeza ao reativar, a
   segurança da função e o escopo (nada de backfill, RLS, status_history ou
   trigger antigo redefinido). E cobra o lado do app: o mapeador lê os três
   campos e o `toDbImovel` NUNCA os manda, porque o upsert do cadastro
   regravaria por cima do que a retirada guardou. O comportamento vivo está em
   `integration/retirada-dados-supabase-local.test.ts`. */

function ler(relativo: string): string {
  return readFileSync(new URL(relativo, import.meta.url), "utf8").replace(/\r\n/g, "\n");
}

const MIGRATION = ler("../../supabase/migrations/20261002210000_retirada_data_motivo.sql");
const SCHEMA = ler("../../supabase-schema.sql");

function semComentarios(sql: string): string {
  return sql.split("\n").filter((linha) => !/^\s*--/.test(linha)).join("\n");
}

const CODIGO = semComentarios(MIGRATION);
const FORA_DE_FUNCOES = CODIGO.replace(/as \$\$[\s\S]*?\n\$\$;/g, "");
const FUNCAO = (() => {
  const inicio = CODIGO.indexOf("create or replace function private.preencher_dados_retirada_imovel()");
  expect(inicio).toBeGreaterThan(-1);
  return CODIGO.slice(inicio, CODIGO.indexOf("\n$$;\n", inicio) + 4);
})();

const IDS = MOTIVOS_RETIRADA.map((m) => m.id);

describe("espelho canônico", () => {
  it("supabase-schema.sql contém a migration inteira, idêntica, uma vez só, antes do bloco C13", () => {
    const inicio = SCHEMA.indexOf(MIGRATION);
    expect(inicio, "bloco da migration no schema").toBeGreaterThan(-1);
    expect(SCHEMA.lastIndexOf(MIGRATION)).toBe(inicio);
    expect(SCHEMA.slice(0, inicio)).toMatch(/-- RETIRADOS C1: data e motivo da retirada\. Espelho de\n-- supabase\/migrations\/20261002210000_retirada_data_motivo\.sql/);
    expect(SCHEMA.indexOf("-- Garimpo em Campo — C13")).toBeGreaterThan(inicio + MIGRATION.length);
  });
});

describe("colunas e checks", () => {
  it("cria as três colunas, todas anuláveis e sem default", () => {
    expect(CODIGO).toContain("alter table public.imoveis add column if not exists retirado_em date;");
    expect(CODIGO).toContain("alter table public.imoveis add column if not exists retirado_motivo text;");
    expect(CODIGO).toContain("alter table public.imoveis add column if not exists retirado_observacao text;");
    expect(CODIGO).not.toMatch(/retirado_\w+ \w+ (not null|default)/);
  });

  it("a lista do banco é exatamente a do app, na mesma ordem, sem 'nao-informado'", () => {
    const trecho = /retirado_motivo in \(([\s\S]*?)\)/.exec(CODIGO)![1];
    const sql = [...trecho.matchAll(/'([^']+)'/g)].map((m) => m[1]);
    expect(sql).toEqual(IDS);
    expect(sql).not.toContain("nao-informado");
    expect(CODIGO).toContain("retirado_motivo is null\n    or retirado_motivo in (");
  });

  it("fora de Retirados não há data, motivo nem observação", () => {
    expect(CODIGO).toContain(
      "    retirado\n    or (retirado_em is null and retirado_motivo is null and retirado_observacao is null)",
    );
  });

  it("'outro' exige observação não vazia, e a observação tem teto", () => {
    expect(CODIGO).toContain(
      "    retirado_motivo is distinct from 'outro'\n    or nullif(btrim(retirado_observacao), '') is not null",
    );
    expect(CODIGO).toContain("check (retirado_observacao is null or char_length(retirado_observacao) <= 1000);");
  });

  it("cada check é recriado (drop if exists antes do add)", () => {
    for (const nome of [
      "imoveis_retirado_motivo_check",
      "imoveis_retirada_coerente_check",
      "imoveis_retirada_outro_check",
      "imoveis_retirado_observacao_tamanho_check",
    ]) {
      expect(CODIGO).toContain(`alter table public.imoveis drop constraint if exists ${nome};`);
      expect(CODIGO).toContain(`add constraint ${nome}`);
    }
  });
});

describe("trigger", () => {
  it("reativar limpa os três campos", () => {
    expect(FUNCAO).toContain(
      "  if tg_op = 'UPDATE' and old.retirado and not new.retirado then\n" +
        "    new.retirado_em := null;\n" +
        "    new.retirado_motivo := null;\n" +
        "    new.retirado_observacao := null;\n" +
        "    return new;\n" +
        "  end if;",
    );
  });

  // Decisão D5A: INSERT já retirado fica com a data null ("data histórica
  // desconhecida"). O carimbo é só da transição real para retirado; carimbar
  // no INSERT fabricaria a data de uma importação de retirados antigos.
  it("só a transição para retirado, por UPDATE e sem data, ganha o dia de hoje em Brasília", () => {
    expect(FUNCAO).toContain(
      "  if tg_op = 'UPDATE' and new.retirado and not old.retirado and new.retirado_em is null then\n" +
        "    new.retirado_em := (now() at time zone 'America/Sao_Paulo')::date;\n" +
        "  end if;",
    );
    expect(FUNCAO.match(/new\.retirado_em :=/g)).toHaveLength(2);
  });

  it("nunca inventa motivo e só apara a observação", () => {
    expect(FUNCAO).not.toMatch(/new\.retirado_motivo := (?!null)/);
    expect(FUNCAO).toContain("new.retirado_observacao := nullif(btrim(new.retirado_observacao), '');");
    expect(FUNCAO).not.toMatch(/\braise\b/);
  });

  it("dispara antes de INSERT e de UPDATE das quatro colunas, e só delas", () => {
    expect(CODIGO).toContain(
      "create trigger trg_retirada_dados_imovel\n" +
        "  before insert or update of retirado, retirado_em, retirado_motivo, retirado_observacao\n" +
        "  on public.imoveis\n" +
        "  for each row execute function private.preencher_dados_retirada_imovel();",
    );
  });

  it("função no schema private, search_path vazio, sem security definer e sem execução pública", () => {
    expect(FUNCAO).toContain("set search_path = ''");
    expect(FUNCAO).not.toMatch(/security definer/i);
    // Sem acesso a tabela nenhuma: só decide sobre a própria linha.
    expect(FUNCAO).not.toMatch(/\bfrom\b|\bselect\b|insert into|update public\.|delete from/i);
    expect(CODIGO).toContain(
      "revoke all on function private.preencher_dados_retirada_imovel() from public, anon, authenticated;",
    );
  });
});

describe("escopo", () => {
  it("sem backfill: nenhuma linha existente é tocada", () => {
    expect(FORA_DE_FUNCOES).not.toMatch(/\bupdate public\.|insert into|delete from|\btruncate\b/i);
  });

  it("não mexe em RLS, status_history nem nos triggers que já reagem a retirado", () => {
    expect(CODIGO).not.toMatch(/\bpolicy\b|row level security/i);
    expect(CODIGO).not.toContain("status_history");
    expect(CODIGO).not.toMatch(/trg_transicao_disponibilidade_imovel|trg_retomada_retirado_imovel|trg_imoveis_status_history/);
    expect(CODIGO).not.toMatch(/\bstatus\b(?!_)/);
  });
});

describe("motivos no app", () => {
  it("ids únicos, rótulos preenchidos, e 'não informado' é só rótulo do null", () => {
    expect(new Set(IDS).size).toBe(IDS.length);
    expect(IDS).toHaveLength(7);
    for (const m of MOTIVOS_RETIRADA) expect(m.rotulo.trim()).not.toBe("");
    expect(IDS).toContain("reservado-outra-imobiliaria");
    expect(IDS).toContain("outro");
    expect(ROTULO_MOTIVO_RETIRADA_DESCONHECIDO).toBe("Não informado");
    expect(MOTIVOS_RETIRADA.map((m) => m.rotulo)).not.toContain(ROTULO_MOTIVO_RETIRADA_DESCONHECIDO);
  });
});

describe("mapeador", () => {
  const linha = (dbJson.imoveisRows as unknown as DbImovelRow[])[0];
  const imovel = (fixturesJson.imoveis as unknown as Imovel[])[0];

  it("fromDbImovel lê data, motivo e observação", () => {
    const lido = fromDbImovel({
      ...linha,
      retirado: true,
      retirado_em: "2026-09-21",
      retirado_motivo: "locado-proprietario",
      retirado_observacao: "Avisou por WhatsApp",
    });
    expect(lido).toMatchObject({
      retirado: true,
      retiradoEm: "2026-09-21",
      retiradoMotivo: "locado-proprietario",
      retiradoObservacao: "Avisou por WhatsApp",
    });
  });

  it("coluna ausente, vazia ou motivo desconhecido viram null", () => {
    expect(fromDbImovel(linha)).toMatchObject({ retiradoEm: null, retiradoMotivo: null, retiradoObservacao: null });
    expect(fromDbImovel({ ...linha, retirado_em: "", retirado_motivo: "", retirado_observacao: "" })).toMatchObject({
      retiradoEm: null,
      retiradoMotivo: null,
      retiradoObservacao: null,
    });
    for (const desconhecido of ["nao-informado", "Vendido", "perdido"]) {
      expect(fromDbImovel({ ...linha, retirado: true, retirado_motivo: desconhecido }).retiradoMotivo).toBeNull();
    }
  });

  it("toDbImovel nunca manda os campos da retirada, nem quando o imóvel os tem", () => {
    const comRetirada: Imovel = {
      ...imovel,
      retirado: true,
      retiradoEm: "2026-09-21",
      retiradoMotivo: "vendido",
      retiradoObservacao: "x",
    };
    const payload = toDbImovel(comRetirada, "u1");
    expect(Object.keys(payload).filter((k) => k.startsWith("retirado_"))).toEqual([]);
    expect(payload.retirado).toBe(true);
  });
});
