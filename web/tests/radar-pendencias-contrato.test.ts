import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const ler = (caminho: string) => readFileSync(resolve(caminho), "utf8").replace(/\r\n/g, "\n");
const MIGRATION = "../supabase/migrations/20260922200000_radar_candidatos_pendentes.sql";

function corpoDaFuncao(sql: string): string {
  const inicio = sql.indexOf("create or replace function public.candidatos_pendentes_radar()");
  expect(inicio).toBeGreaterThanOrEqual(0);
  return sql.slice(inicio, sql.indexOf("$$;", inicio) + 3);
}

describe("RPC candidatos_pendentes_radar (R4)", () => {
  const migration = ler(MIGRATION);
  const funcao = corpoDaFuncao(migration);

  it("é somente leitura, invoker e com search_path vazio", () => {
    expect(funcao).toMatch(/\bstable\b/);
    expect(funcao).toMatch(/security invoker/);
    expect(funcao).toMatch(/set search_path = ''/);
    expect(funcao).not.toMatch(/\b(update|insert|delete|truncate)\b/i);
  });

  it("filtra o usuário autenticado e somente visto = false", () => {
    expect(funcao).toMatch(/r\.user_id = \(select auth\.uid\(\)\)/);
    expect(funcao).toMatch(/r\.visto = false/);
  });

  it("exclui visualizados pela identidade real user_id + portal + id_externo, sem depender da busca", () => {
    const antiJoin = funcao.slice(funcao.indexOf("not exists"));
    expect(antiJoin).toMatch(/public\.central_anuncios_visualizados v/);
    expect(antiJoin).toMatch(/v\.user_id = r\.user_id/);
    expect(antiJoin).toMatch(/v\.portal = r\.portal/);
    expect(antiJoin).toMatch(/v\.id_externo = r\.id_externo/);
    expect(antiJoin).not.toMatch(/busca_id/);
  });

  it("não decide pipeline no SQL e não tem limite de linhas", () => {
    expect(funcao).not.toMatch(/imoveis|texto_anuncio/);
    expect(funcao).not.toMatch(/\blimit\b/i);
  });

  it("devolve só campos leves, sem o jsonb inteiro", () => {
    expect(funcao).not.toMatch(/r\.dados\s*(,|$)/m);
    for (const campo of ["titulo", "descricao", "endereco", "cidade", "estado"]) {
      expect(funcao).toContain(`r.dados ->> '${campo}'`);
    }
  });

  it("só authenticated executa", () => {
    expect(migration).toMatch(/revoke all on function public\.candidatos_pendentes_radar\(\) from public, anon, authenticated, service_role;/);
    expect(migration).toMatch(/grant execute on function public\.candidatos_pendentes_radar\(\) to authenticated;/);
  });

  it("o schema canônico tem exatamente a mesma função e os mesmos grants", () => {
    const schema = ler("../supabase-schema.sql");
    expect(corpoDaFuncao(schema)).toBe(funcao);
    expect(schema).toContain("grant execute on function public.candidatos_pendentes_radar() to authenticated;");
  });

  it("a migration não altera dados existentes", () => {
    expect(migration).not.toMatch(/^\s*(update|insert|delete|alter table)\b/im);
  });
});

describe("contador do Radar tem uma única fonte (R4)", () => {
  const arquivos = [
    "components/central/CentralAngariacaoView.tsx",
    "components/central/MonitorRadarAngariacao.tsx",
    "components/painel/BarraLateral.tsx",
    "components/painel/NavAngariacao.tsx",
  ];

  it("só lib/radarAngariacao.ts escreve radarNovos", () => {
    for (const arquivo of arquivos) expect(ler(arquivo)).not.toMatch(/setRadarNovos/);
    expect(ler("lib/radarAngariacao.ts").match(/setRadarNovos\(/g)).toHaveLength(1);
  });

  it("tela e monitor consomem a mesma atualização de pendências", () => {
    expect(ler("components/central/CentralAngariacaoView.tsx")).toMatch(/atualizarPendenciasRadar\(\)/);
    expect(ler("components/central/MonitorRadarAngariacao.tsx")).toMatch(/atualizarPendenciasRadar\(\)/);
    expect(ler("lib/radarAngariacao.ts")).not.toMatch(/contarNovosRadar/);
  });

  it("a janela de 120 da lista não participa da contagem", () => {
    const view = ler("components/central/CentralAngariacaoView.tsx");
    expect(view).not.toMatch(/filter\(\(item\) => !item\.visto\)\.length/);
    const fonte = ler("lib/radarAngariacao.ts");
    const pendencias = fonte.slice(fonte.indexOf("carregarCandidatosPendentesRadar"));
    expect(pendencias).not.toMatch(/limit\(120\)/);
  });

  it("\"Ver anúncio\" e \"Revisar e importar\" registram a visualização que resolve a pendência", () => {
    const view = ler("components/central/CentralAngariacaoView.tsx");
    expect(view).toMatch(/onClick=\{\(\) => void registrarVisualizacao\(anuncio\)\}>Ver anúncio/);
    expect(view).toMatch(/function importar\(anuncio: AnuncioCentralAngariacao\) \{\s*void registrarVisualizacao\(anuncio\);/);
    const registrar = view.slice(view.indexOf("async function registrarVisualizacao"));
    expect(registrar.slice(0, registrar.indexOf("\n  }\n"))).toMatch(/atualizarPendencias\(\)/);
  });
});
