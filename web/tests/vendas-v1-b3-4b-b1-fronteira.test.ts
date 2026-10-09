import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const fonte = (f: string) => readFileSync(new URL("../" + f, import.meta.url), "utf8");
describe("B3.4b-B1: autorização fechada de criação", () => {
  it("somente criar e nenhuma criação separada de contato ou escrita direta", () => {
    const modal = fonte("components/vendas/ModalCriarOportunidadeVenda.tsx");
    expect([...modal.matchAll(/executarComandoVenda\(\s*"([^"]+)"/g)].map((m) => m[1])).toEqual(["criar"]);
    for (const f of ["components/vendas/ModalCriarOportunidadeVenda.tsx", "components/vendas/criacaoVenda.ts", "lib/persistencia/vendasContatosLeitura.ts"]) {
      expect(fonte(f), f).not.toMatch(/\.insert\(|\.update\(|\.upsert\(|\.delete\(|\.rpc\(|criarContato|cadastrarContato|consultarInteressadoVenda|SeletorImovelVenda|vendasImoveisLeitura|SERVICE_ROLE|service_role|\/api\/|sophia|agenda|repasse|openai|investigador/i);
    }
  });
  it("identificação mínima: leitura só das tabelas de contato e campos auditados", () => {
    const codigo = fonte("lib/persistencia/vendasContatosLeitura.ts");
    expect(codigo).toMatch(/auth\.getUser\(/); expect(codigo).toMatch(/\.eq\("user_id", usuarioId!/);
    expect(codigo).not.toMatch(/imoveis|email|observacoes|createClient|process\.env|fetch\(/);
    expect(codigo).toContain('q.order("id", { ascending: true }).range(');
  });
  it("formulário não oferece outras mutações nem controla imóvel ou etapa", () => {
    const codigo = fonte("components/vendas/ModalCriarOportunidadeVenda.tsx");
    expect(codigo).not.toMatch(/etapa\s*:|imovelTratado\s*:|valorNegocioFechado\s*:|executarComandoVenda\("(ganhar|perder|arquivar|transicionar|alterar)/);
  });
});
