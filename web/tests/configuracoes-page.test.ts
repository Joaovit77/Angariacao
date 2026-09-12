import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function fonte(caminho: string) {
  return readFileSync(join(process.cwd(), caminho), "utf8");
}

describe("página de Configurações", () => {
  it("substitui o modal por uma rota autenticada e acessível pelo menu do usuário", () => {
    expect(fonte("app/(painel)/configuracoes/page.tsx")).toContain("<ConfiguracoesView");
    expect(fonte("components/painel/MenuUsuario.tsx")).toContain('router.push("/configuracoes")');
    expect(fonte("components/painel/Topbar.tsx")).toContain('"/configuracoes": "Configurações"');
    expect(fonte("components/modais/ModalOverlay.tsx")).not.toContain("ModalConfig");
    expect(fonte("lib/uiModal.ts")).not.toContain('| "config"');
  });

  it("organiza somente categorias com conteúdo real e preserva todos os fluxos existentes", () => {
    const tela = fonte("components/configuracoes/ConfiguracoesView.tsx");
    for (const categoria of ["Geral", "Política de Repasse", "IA e escrita", "Agenda", "Prospecção", "WhatsApp", "Conta", "Dados"]) {
      expect(tela).toContain(`titulo: "${categoria}"`);
    }
    expect(tela).not.toContain('titulo: "Integrações"');
    expect(tela).toContain("<ConexaoGoogle />");
    expect(tela).toContain("<ResumoConexaoWhatsapp />");
    expect(tela).toContain('abrirModal("abordagens")');
    expect(tela).toContain('abrirModal("importar")');
    expect(tela).toContain("carregarDadosDemo");
    expect(tela).toContain("apagarTodosOsDados");
  });

  it("a Zona de perigo diz que a exclusão alcança o Garimpo em Campo e suas fotos, e é definitiva", () => {
    const tela = fonte("components/configuracoes/ConfiguracoesView.tsx");
    const zona = tela.match(/<div className="config-zona-perigo">[\s\S]*?<\/div>\s*<button/)?.[0] ?? "";
    for (const trecho of ["imóveis", "metas", "compromissos", "abordagens", "Garimpo em Campo", "fotos", "Não pode ser desfeito"]) {
      expect(zona).toContain(trecho);
    }
    // O confirm() de apagarTodosOsDados conta a mesma história que a tela.
    expect(fonte("lib/mutacoes.ts")).toMatch(/confirm\([\s\S]*?Garimpo em Campo \(com as fotos\)/);
  });

  it("salva somente seções alteradas usando a persistência central existente", () => {
    const tela = fonte("components/configuracoes/ConfiguracoesView.tsx");
    expect(tela).toContain("await salvarConfig({ ...config, ...parcial }");
    expect(tela).toContain("if (!alterado) return null");
    expect(tela).toContain("Há alterações ainda não salvas.");
  });
});
