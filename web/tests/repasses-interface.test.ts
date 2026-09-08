import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { novaPoliticaRepasse, validarPoliticaRepasse } from "@/lib/repasses";

function fonte(caminho: string) {
  return readFileSync(new URL(`../${caminho}`, import.meta.url), "utf8");
}

describe("política e interfaces de repasse", () => {
  it("não fixa dias nem prazo no domínio e valida entradas administrativas", () => {
    const politica = novaPoliticaRepasse();
    expect(politica.diasVencimento).toEqual([]);
    expect(validarPoliticaRepasse(politica)).toContain("Informe ao menos um dia de vencimento.");
    expect(validarPoliticaRepasse({ ...politica, diasVencimento: [10, 10] })).toContain("Não repita dias de vencimento.");
    expect(validarPoliticaRepasse({ ...politica, diasVencimento: [32] })).toContain(
      "Os dias de vencimento devem ser inteiros entre 1 e 31.",
    );
  });

  it("mantém o banco como autoridade tanto na prévia quanto na confirmação", () => {
    const dominio = fonte("lib/repasses.ts");
    expect(dominio).toContain('client.rpc("prever_repasses_locacao"');
    expect(dominio).toContain('client.rpc("locar_imoveis_em_lote"');
    expect(dominio).not.toMatch(/new Date\([^)]*dataLocacao/);
    const migration = fonte("../supabase/migrations/20260908132609_repasses_configuraveis.sql");
    expect(migration.match(/pg_advisory_xact_lock/g)).toHaveLength(2);
  });

  it("oferece edição comum e individual, preview, cancelamento e recebimento em massa", () => {
    const locacao = fonte("components/modais/ModalLocacaoLote.tsx");
    const recebimento = fonte("components/modais/ModalRecebimentoRepassesLote.tsx");
    const pipeline = fonte("components/pipeline/PipelineView.tsx");
    const repasses = fonte("components/repasses/RepassesView.tsx");
    expect(locacao).toContain("Aplicar estes dados a todos");
    expect(locacao).toContain("Primeiro vencimento");
    expect(locacao).toContain("Repasse previsto");
    expect(locacao).toContain("Nenhuma alteração foi realizada");
    expect(locacao).toContain("Cancelar");
    expect(pipeline).toContain("Marcar como locado");
    expect(pipeline).toContain('novoStatus === "Locado"');
    expect(fonte("components/modais/ModalImovel.tsx")).toContain("Locado — use a ação do Pipeline");
    expect(repasses).toContain("Receber em massa");
    expect(recebimento).toContain("Data de recebimento");
    expect(recebimento).toContain("Total previsto");
  });

  it("expõe configuração extensível sem alegar suporte a feriados inexistente", () => {
    const configuracao = fonte("components/configuracoes/PoliticaRepasseConfig.tsx");
    expect(configuracao).toContain("No mês seguinte à locação");
    expect(configuracao).toContain("No próximo vencimento disponível");
    expect(configuracao).toContain("Informado durante a locação");
    expect(configuracao).toContain("Feriados não são ajustados");
    expect(configuracao).toContain("Alterações afetam somente novos repasses");
  });
});
