import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function fonte(caminho: string) {
  return readFileSync(join(process.cwd(), caminho), "utf8");
}

describe("superficies compartilhadas do Assistente", () => {
  it("oferece uma pagina dedicada pela navegacao do painel", () => {
    expect(fonte("app/(painel)/assistente/page.tsx")).toContain("<AssistenteView />");
    expect(fonte("components/painel/BarraLateral.tsx")).toContain('rota: "/assistente"');
    expect(fonte("components/painel/Topbar.tsx")).toContain('"/assistente": "Assistente"');
  });

  it("reutiliza a mesma conversa na pagina e no atalho flutuante", () => {
    const flutuante = fonte("components/assistente/Assistente.tsx");
    const pagina = fonte("components/assistente/AssistenteView.tsx");
    const layout = fonte("app/(painel)/layout.tsx");
    expect(flutuante).toContain("<ConversaAssistente />");
    expect(pagina).toContain("<ConversaAssistente />");
    expect(layout).toContain("<AssistenteProvider>");
    expect(layout).toContain("{children}");
  });

  it("mantem envio, historico e cancelamento em um unico estado de sessao", () => {
    const provider = fonte("components/assistente/AssistenteProvider.tsx");
    const flutuante = fonte("components/assistente/Assistente.tsx");
    expect(provider).toContain("perguntarAoAssistente");
    expect(provider).toContain("compactarBlocosParaHistorico");
    expect(provider).toContain("mensagens");
    expect(flutuante).not.toContain("perguntarAoAssistente");
  });

  it("faz a preferencia controlar apenas o atalho visual", () => {
    const flutuante = fonte("components/assistente/Assistente.tsx");
    const pagina = fonte("components/assistente/AssistenteView.tsx");
    const cliente = fonte("lib/assistente/cliente.ts");
    expect(flutuante).toContain("!flutuanteAtivo");
    expect(pagina).toContain("Assistente flutuante");
    expect(pagina).toContain("Esta opção não desativa o Assistente nem os demais recursos de IA.");
    expect(cliente).not.toContain("flutuanteAtivo");
  });

  it("nao cria outro agente ou outra rota de API", () => {
    const provider = fonte("components/assistente/AssistenteProvider.tsx");
    expect(provider).toContain('from "@/lib/assistente/cliente"');
    expect(fonte("lib/assistente/cliente.ts")).toContain('fetch("/api/assistente"');
  });
});
