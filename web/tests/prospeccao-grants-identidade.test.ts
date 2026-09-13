import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const MIGRATION = readFileSync(
  new URL("../../supabase/migrations/20260910190155_prospeccao_campo_rls_grants.sql", import.meta.url),
  "utf8",
);

const INSERT_PERMITIDO = [
  "user_id", "logradouro", "numero", "unidade", "bloco", "edificio", "bairro", "cidade",
  "estado", "cep", "ponto_referencia", "endereco_chave", "cidade_chave", "bairro_chave",
  "origem_identificacao", "tipo",
];
const UPDATE_PERMITIDO = [
  "logradouro", "numero", "unidade", "bloco", "edificio", "bairro", "cidade", "estado",
  "cep", "ponto_referencia", "endereco_chave", "cidade_chave", "bairro_chave",
  "origem_identificacao", "ultima_investigacao_em",
];

function colunasDoGrant(operacao: "insert" | "update"): string[] {
  const lista = MIGRATION.match(new RegExp(
    `grant ${operacao} \\(([\\s\\S]*?)\\) on table public\\.imoveis_identificados to authenticated;`,
    "i",
  ))?.[1];
  if (!lista) throw new Error(`Grant de ${operacao} da identidade ausente.`);
  return lista.split(",").map((coluna) => coluna.trim()).filter(Boolean);
}

describe("C2b — grants por coluna da identidade", () => {
  it("concede exatamente as colunas de insert previstas, incluindo tipo", () => {
    expect(colunasDoGrant("insert")).toEqual(INSERT_PERMITIDO);
  });

  it("concede exatamente as colunas editáveis e mantém tipo fora do update", () => {
    const colunas = colunasDoGrant("update");
    expect(colunas).toEqual(UPDATE_PERMITIDO);
    expect(colunas).not.toContain("tipo");
  });

  it("bloqueia por privilégio estados, agregados, promoção, merge e exclusão", () => {
    const proibidas = [
      "situacao", "fundido_em", "fundido_em_imovel_id", "avistamento_corrente_id",
      "avistamentos_total", "primeiro_avistamento_em", "ultimo_avistamento_em",
      "latitude", "longitude", "acuracia_metros", "precisao_localizacao", "tipo",
      "tipo_origem", "tipo_confianca", "tipo_estado", "tipo_definido_em",
      "tipo_classificacao_id", "tipo_avistamento_id", "tipo_confirmado_por",
      "tipo_confirmado_em", "imovel_id", "promovido_em", "descartado_em",
      "descartado_motivo", "exclusao_solicitada_em", "user_id", "created_at", "updated_at",
    ];
    const atualizaveis = new Set(colunasDoGrant("update"));
    expect(proibidas.filter((coluna) => atualizaveis.has(coluna))).toEqual([]);
  });

  it("não permite nascer em estado interno nem com proveniência forjada", () => {
    const proibidas = [
      "situacao", "fundido_em", "fundido_em_imovel_id", "avistamento_corrente_id",
      "avistamentos_total", "primeiro_avistamento_em", "ultimo_avistamento_em",
      "latitude", "longitude", "acuracia_metros", "precisao_localizacao",
      "tipo_origem", "tipo_confianca", "tipo_estado", "tipo_definido_em",
      "tipo_classificacao_id", "tipo_avistamento_id", "tipo_confirmado_por",
      "tipo_confirmado_em", "imovel_id", "promovido_em", "descartado_em",
      "descartado_motivo", "exclusao_solicitada_em", "created_at", "updated_at",
    ];
    const inseriveis = new Set(colunasDoGrant("insert"));
    expect(proibidas.filter((coluna) => inseriveis.has(coluna))).toEqual([]);
  });

  it("não concede insert/update de tabela inteira nem delete à identidade", () => {
    expect(MIGRATION).not.toMatch(
      /^grant (?:insert|update|delete) on table public\.imoveis_identificados to authenticated;/gim,
    );
    expect(MIGRATION).toContain(
      "grant select on table public.imoveis_identificados to authenticated;",
    );
  });

  it("limita o update direto do avistamento somente à observação", () => {
    expect(MIGRATION).toMatch(
      /grant update \(observacao\)\s+on table public\.imoveis_identificados_avistamentos to authenticated;/i,
    );
    expect(MIGRATION).not.toMatch(
      /grant update \((?!observacao\))[^)]*\)\s+on table public\.imoveis_identificados_avistamentos to authenticated;/i,
    );
  });
});
