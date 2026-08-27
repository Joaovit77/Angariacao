import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function fonte(caminho: string) {
  return readFileSync(join(process.cwd(), caminho), "utf8");
}

describe("Cérebro da IA", () => {
  it("oferece a página na navegação principal e na barra de topo", () => {
    expect(fonte("app/(painel)/cerebro-ia/page.tsx")).toContain("<CerebroIaView />");
    expect(fonte("components/painel/BarraLateral.tsx")).toContain('rota: "/cerebro-ia"');
    expect(fonte("components/painel/Topbar.tsx")).toContain('"/cerebro-ia": "Cérebro da IA"');
    expect(fonte("app/robots.ts")).toContain('"/cerebro-ia"');
  });

  it("explica o fluxo sem expor detalhes técnicos ou criar acesso a dados", () => {
    const tela = fonte("components/cerebro-ia/CerebroIaView.tsx");
    for (const modulo of [
      "Protocolos",
      "Contexto",
      "CRM",
      "Atendimento",
      "Ferramentas",
      "Validações",
      "Resposta",
      "WhatsApp",
      "Leads",
      "Análise",
      "Imóveis",
    ]) {
      expect(tela).toContain(`rotulo: "${modulo}"`);
    }
    expect(tela).toContain("O Cérebro da IA não libera novos acessos");
    expect(tela).not.toContain("fetch(");
    expect(tela).not.toContain("supabase");
  });

  it("usa dados autorizados da sessão e carrega somente atividades reais da IA", () => {
    const tela = fonte("components/cerebro-ia/CerebroIaView.tsx");
    const cliente = fonte("lib/ia/atividades.ts");
    const rota = fonte("app/api/ia/atividades/route.ts");
    expect(tela).toContain("useAppStore");
    expect(tela).toContain("protocolos.filter((protocolo) => !protocolo.arquivado)");
    expect(tela).toContain("imoveis.length");
    expect(tela).toContain("carregarAtividadesIa");
    expect(tela).toContain("Nenhuma interação com IA ainda");
    expect(cliente).toContain('fetch("/api/ia/atividades"');
    expect(rota).toContain('.select("id,tipo,criado_em")');
    expect(rota).toContain('.eq("user_id", auth.user.id)');
    expect(rota).not.toContain("tokens_entrada");
    expect(tela).not.toContain('valor: "Online"');
    expect(tela).not.toContain('valor: "12 ativos"');
    expect(tela).not.toContain('valor: "Conectado"');
    expect(tela).not.toContain("Concluído há");
    expect(tela).not.toContain("Assistente consultou imóveis sem movimento");
  });

  it("representa execuções observadas sem prometer atualização em tempo real", () => {
    const tela = fonte("components/cerebro-ia/CerebroIaView.tsx");
    expect(tela).toContain("VISÃO DA EXECUÇÃO");
    expect(tela).toContain("Ver histórico de execuções");
    expect(tela).toContain("O texto da solicitação e a resposta não são guardados aqui");
    expect(tela).toContain("aoSobreporNo");
    expect(tela).not.toContain("Como a IA processa uma solicitação");
    expect(tela).not.toContain("Visão em tempo real");
    expect(tela).not.toContain("Fluxo em tempo real");
    expect(tela).not.toContain("AO VIVO");
    expect(tela).not.toContain("Disponível para todos os usuários");
    expect(tela).not.toContain("Inteligência organizada");
  });

  it("permite a explicação visual à conta sem carteira e preserva o redirecionamento das demais rotas", () => {
    const layout = fonte("app/(painel)/layout.tsx");
    const barra = fonte("components/painel/BarraLateral.tsx");
    expect(layout).toContain('new Set(["/admin", "/cerebro-ia"])');
    expect(layout).toContain("!ROTAS_SEM_CARTEIRA.has(pathname)");
    expect(barra).toContain("[ITEM_CEREBRO_IA, ITEM_ADMIN]");
  });

  it("usa os tokens dos dois temas e respeita redução de movimento", () => {
    const css = fonte("components/cerebro-ia/CerebroIaView.module.css");
    expect(css).toContain("var(--bg-elev-1)");
    expect(css).toContain("var(--accent-strong)");
    expect(css).toContain("var(--good)");
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
    expect(css).not.toContain("@media (prefers-color-scheme: dark)");
  });
});
