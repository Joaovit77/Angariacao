import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { TIPO_RETOMADA_RETIRADO } from "../lib/mensagensAgendadas";

/* Retirados, Fase B / B2: o banco reconhece `retomada-retirado`. Este teste lê
   o SQL (migration e espelho canônico) e cobra o contrato aprovado: os
   valores exatos dos checks, a identidade da retomada sem regra global nova,
   a validação só para a linha que resulta `agendada` (o claim é um UPDATE em
   lote), o cancelamento por reativação/saída do alvo fail-open, a segurança
   das funções e o escopo: nada de backfill, nada redefinido do M3/M4, da
   consolidação, do claim, do destinatário ou da RLS. O comportamento vivo é
   provado em `integration/retomada-retirado-supabase-local.test.ts`. */

function ler(relativo: string): string {
  return readFileSync(new URL(relativo, import.meta.url), "utf8").replace(/\r\n/g, "\n");
}

const MIGRATION = ler("../../supabase/migrations/20261001210000_retomada_retirado_schema.sql");
const SCHEMA = ler("../../supabase-schema.sql");
const TS = ler("../lib/mensagensAgendadas.ts");

/** Só o código: linhas de comentário fora, para as negativas não baterem em prosa. */
function semComentarios(sql: string): string {
  return sql.split("\n").filter((linha) => !/^\s*--/.test(linha)).join("\n");
}

const CODIGO = semComentarios(MIGRATION);

function trechoFuncao(nome: string): string {
  const inicio = CODIGO.indexOf(`create or replace function ${nome}()`);
  expect(inicio, `função ${nome}`).toBeGreaterThan(-1);
  const fim = CODIGO.indexOf("\n$$;\n", inicio);
  return CODIGO.slice(inicio, fim + 4);
}

/** O que roda fora de corpo de função: onde um backfill apareceria. */
const FORA_DE_FUNCOES = CODIGO.replace(/as \$\$[\s\S]*?\n\$\$;/g, "");

function literais(trecho: string): string[] {
  return [...trecho.matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

function uniaoTs(nome: string): string[] {
  const ts = semComentariosTs(TS);
  const inicio = ts.indexOf(`export type ${nome} =`);
  expect(inicio, nome).toBeGreaterThan(-1);
  const fim = ts.indexOf(";", inicio);
  return ts.slice(inicio, fim).match(/"[^"]+"/g)!.map((s) => s.slice(1, -1));
}

function semComentariosTs(ts: string): string {
  return ts.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

const MOTIVOS_SQL = literais(/cancelamento_motivo in \(([\s\S]*?)\)/.exec(CODIGO)![1]);
const TIPOS_SQL = literais(/check \(tipo in \(([^)]*)\)\)/.exec(CODIGO)![1]);

const IDENTIDADE = trechoFuncao("private.proteger_identidade_retomada_retirado");
const VALIDACAO = trechoFuncao("private.validar_retomada_retirado");
const IMOVEL = trechoFuncao("private.reagir_retomada_retirado_imovel");

describe("espelho canônico", () => {
  it("supabase-schema.sql contém a migration inteira, idêntica, uma vez só", () => {
    const inicio = SCHEMA.indexOf(MIGRATION);
    expect(inicio, "bloco da migration no schema").toBeGreaterThan(-1);
    expect(SCHEMA.lastIndexOf(MIGRATION)).toBe(inicio);
    expect(SCHEMA.slice(0, inicio)).toMatch(/-- RETIRADOS B2: retomada de imóvel retirado\. Espelho de\n-- supabase\/migrations\/20261001210000_retomada_retirado_schema\.sql/);
  });
});

describe("checks", () => {
  it("tipo aceita exatamente os três valores", () => {
    expect(TIPOS_SQL).toEqual(["livre", "verificacao-disponibilidade", "retomada-retirado"]);
    expect(CODIGO).toContain("drop constraint if exists mensagens_agendadas_tipo_check;");
  });

  it("motivos: os cinco de antes mais imovel-reativado, e nenhum outro", () => {
    expect(MOTIVOS_SQL).toEqual([
      "usuario",
      "imovel-indisponivel",
      "disponibilidade-confirmada",
      "imovel-excluido",
      "contato-consolidado",
      "imovel-reativado",
    ]);
    expect(CODIGO).toContain("drop constraint if exists mensagens_agendadas_cancelamento_motivo_check;");
  });

  it("destinatario-alterado não é antecipado (pertence ao checkpoint que implementar a regra)", () => {
    expect(MIGRATION).not.toContain("destinatario-alterado");
    expect(TS).not.toContain("destinatario-alterado");
  });

  it("o TypeScript fala a mesma língua do SQL", () => {
    expect(TIPO_RETOMADA_RETIRADO).toBe("retomada-retirado");
    expect(uniaoTs("TipoMensagemAgendada")).toEqual(TIPOS_SQL);
    expect(uniaoTs("MotivoCancelamentoMensagemAgendada")).toEqual(MOTIVOS_SQL);
  });
});

describe("uma retomada ativa por imóvel", () => {
  it("índice único parcial em imovel_id, só para retomada agendada ou processando", () => {
    expect(CODIGO).toContain(
      "create unique index if not exists mensagens_agendadas_retomada_ativa_idx\n" +
        "  on public.mensagens_agendadas (imovel_id)\n" +
        "  where tipo = 'retomada-retirado' and status in ('agendada', 'processando');",
    );
  });
});

describe("identidade da retomada", () => {
  it("trigger antes de mudar tipo ou imóvel", () => {
    expect(CODIGO).toContain(
      "create trigger trg_retomada_identidade_mensagem\n" +
        "  before update of tipo, imovel_id on public.mensagens_agendadas\n" +
        "  for each row execute function private.proteger_identidade_retomada_retirado();",
    );
  });

  it("protege só a entrada e a saída da retomada, sem regra global entre os tipos antigos", () => {
    expect(IDENTIDADE).toContain("if (old.tipo = 'retomada-retirado') is distinct from (new.tipo = 'retomada-retirado') then");
    expect(IDENTIDADE).not.toMatch(/new\.tipo is distinct from old\.tipo|old\.tipo is distinct from new\.tipo|new\.tipo <> old\.tipo/);
  });

  it("o imóvel é fixo, e a única troca aceita é para nulo (a FK da exclusão)", () => {
    expect(IDENTIDADE).toContain(
      "if new.tipo = 'retomada-retirado'\n" +
        "     and new.imovel_id is not null\n" +
        "     and new.imovel_id is distinct from old.imovel_id then",
    );
  });
});

describe("invariantes da retomada agendada", () => {
  it("trigger em todo INSERT e UPDATE", () => {
    expect(CODIGO).toContain(
      "create trigger trg_retomada_validacao_mensagem\n" +
        "  before insert or update on public.mensagens_agendadas\n" +
        "  for each row execute function private.validar_retomada_retirado();",
    );
  });

  it("só valida a linha que resulta agendada; o INSERT nasce agendada", () => {
    const insert = VALIDACAO.indexOf("if tg_op = 'INSERT' and new.status is distinct from 'agendada' then");
    const saida = VALIDACAO.indexOf("if new.status is distinct from 'agendada' then\n    return new;\n  end if;");
    const primeiraInvariante = VALIDACAO.indexOf("if new.imovel_id is null then");
    expect(insert).toBeGreaterThan(-1);
    expect(saida).toBeGreaterThan(insert);
    expect(primeiraInvariante).toBeGreaterThan(saida);
  });

  it("exige imóvel, sem agenda, sem imoveis_consultados, data futura, mesmo dono, retirado e status-alvo", () => {
    for (const trecho of [
      "if new.imovel_id is null then",
      "if new.agenda_id is not null then",
      "if new.imoveis_consultados is not null then",
      "if new.data_envio is null or new.data_envio <= now() then",
      "where i.id = new.imovel_id\n     and i.user_id = new.user_id;",
      "if v_imovel.retirado is not true then",
      "if not (v_imovel.status = any (private.disponibilidade_status_alvo())) then",
    ]) {
      expect(VALIDACAO).toContain(trecho);
    }
  });

  it("imóvel excluído (FK set null) vira cancelamento; nulo com o imóvel existindo continua inválido", () => {
    expect(VALIDACAO).toContain(
      "if tg_op = 'UPDATE'\n" +
        "     and new.imovel_id is null\n" +
        "     and old.imovel_id is not null\n" +
        "     and not exists (select 1 from public.imoveis i where i.id = old.imovel_id) then",
    );
    expect(VALIDACAO).toContain("new.cancelamento_motivo := 'imovel-excluido';");
    expect(VALIDACAO).toContain("new.cancelamento_origem := 'automacao';");
  });
});

describe("o imóvel muda", () => {
  it("trigger próprio em imoveis, separado do M3/M4", () => {
    expect(CODIGO).toContain(
      "create trigger trg_retomada_retirado_imovel\n" +
        "  after update of retirado, status on public.imoveis\n" +
        "  for each row execute function private.reagir_retomada_retirado_imovel();",
    );
  });

  it("saída do alvo prevalece sobre a reativação", () => {
    const indisponivel = IMOVEL.indexOf("v_motivo := 'imovel-indisponivel';");
    const reativado = IMOVEL.indexOf("v_motivo := 'imovel-reativado';");
    expect(indisponivel).toBeGreaterThan(-1);
    expect(reativado).toBeGreaterThan(indisponivel);
    expect(IMOVEL).toContain("elsif old.retirado is true and new.retirado is not true then");
  });

  it("cancela só retomada agendada do mesmo imóvel e do mesmo dono", () => {
    expect(IMOVEL).toContain(
      "where m.user_id = new.user_id\n" +
        "       and m.imovel_id = new.id\n" +
        "       and m.tipo = 'retomada-retirado'\n" +
        "       and m.status = 'agendada';",
    );
    expect(IMOVEL).toContain("cancelamento_origem = 'automacao'");
  });

  it("fail-open em dois níveis: a automação e o próprio log", () => {
    expect(IMOVEL.match(/exception when others then/g)).toHaveLength(2);
    expect(IMOVEL).toMatch(/insert into public\.log_eventos[\s\S]*'retomada-cancelamento-falhou'[\s\S]*exception when others then\n\s*null;/);
  });
});

describe("segurança das funções", () => {
  it.each([
    "private.proteger_identidade_retomada_retirado",
    "private.validar_retomada_retirado",
    "private.reagir_retomada_retirado_imovel",
  ])("%s: security definer, search_path vazio e execute revogado", (nome) => {
    const corpo = trechoFuncao(nome);
    expect(corpo).toContain("security definer");
    expect(corpo).toContain("set search_path = ''");
    expect(CODIGO).toContain(`revoke all on function ${nome}() from public, anon, authenticated;`);
  });

  it("nenhum grant novo, e só três funções", () => {
    expect(CODIGO).not.toMatch(/\bgrant\b/i);
    expect(CODIGO.match(/create or replace function/g)).toHaveLength(3);
  });
});

describe("escopo do B2", () => {
  it("sem backfill: fora das funções não há UPDATE, INSERT nem DELETE de dados", () => {
    expect(FORA_DE_FUNCOES).not.toMatch(/\bupdate\s+public\./i);
    expect(FORA_DE_FUNCOES).not.toMatch(/\binsert\s+into\b/i);
    expect(FORA_DE_FUNCOES).not.toMatch(/\bdelete\s+from\b/i);
  });

  it("não redefine claim, M3/M4, consolidação, destinatário nem RLS", () => {
    for (const proibido of [
      "claim_mensagens_agendadas",
      "aplicar_transicao_disponibilidade",
      "registrar_confirmacao_disponibilidade",
      "encerrar_disponibilidade_imovel",
      "reagir_transicao_disponibilidade_imovel",
      "trg_transicao_disponibilidade_imovel",
      "efetivar_consolidacao_contato",
      "preencher_destinatario_mensagem_agendada",
      "trg_destinatario_mensagem_agendada",
      "excluir_imovel_com_dependencias",
    ]) {
      expect(CODIGO, proibido).not.toContain(proibido);
    }
    expect(CODIGO).not.toMatch(/\bpolicy\b/i);
    expect(CODIGO).not.toMatch(/row level security/i);
  });
});

describe("a aplicação não cria retomada", () => {
  const raiz = fileURLToPath(new URL("..", import.meta.url));
  const arquivos = ["app", "components", "lib"].flatMap((pasta) =>
    (readdirSync(join(raiz, pasta), { recursive: true }) as string[])
      .filter((f) => /\.(ts|tsx)$/.test(f))
      .map((f) => join(pasta, f).replace(/\\/g, "/")),
  );

  it("o valor só aparece no tipo/classificador e no worker que o bloqueia", () => {
    const usam = arquivos.filter((f) => {
      const texto = readFileSync(join(raiz, f), "utf8");
      return texto.includes("retomada-retirado") || texto.includes("TIPO_RETOMADA_RETIRADO");
    });
    expect(usam.sort()).toEqual(["app/api/cron/mensagens/route.ts", "lib/mensagensAgendadas.ts"]);
  });

  it("o único caller do ModalMensagemAgendada passa só livre ou verificação", () => {
    const callers = arquivos.filter((f) => readFileSync(join(raiz, f), "utf8").includes("<ModalMensagemAgendada"));
    expect(callers).toEqual(["components/modais/ModalOverlay.tsx"]);
    const overlay = readFileSync(join(raiz, callers[0]), "utf8");
    expect(overlay).toContain('tipoInicial={modal.agendaIdMensagemAgendada ? "verificacao-disponibilidade" : "livre"}');
  });
});
