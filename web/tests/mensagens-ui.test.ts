import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function fonte(caminho: string) {
  return readFileSync(join(process.cwd(), caminho), "utf8");
}

describe("acabamento da central de mensagens", () => {
  it("usa Mensagens como nome único na navegação e nos metadados", () => {
    expect(fonte("components/painel/Topbar.tsx")).toContain('"/respostas": "Mensagens"');
    expect(fonte("components/painel/BarraLateral.tsx")).toContain('texto: "Mensagens"');
    expect(fonte("app/(painel)/respostas/page.tsx")).toContain('title: "Mensagens | Angario"');
    expect(fonte("components/respostas/CentralMensagensView.tsx")).not.toContain("<h1");
    expect(fonte("components/mensagens/MensagensAgendadasView.tsx")).not.toContain("<h1");
  });

  it("não monta o assistente flutuante nas duas páginas de mensagens", () => {
    const layout = fonte("app/(painel)/layout.tsx");
    expect(layout).toContain('pathname === "/respostas" || pathname === "/mensagens"');
    expect(layout).toContain("ocultarAssistente ? null : <Assistente />");
  });

  it("expõe filtros combináveis, contagens e estados legíveis", () => {
    const central = fonte("components/respostas/CentralMensagensView.tsx");
    const css = fonte("app/style.css");
    for (const texto of ["Todas", "Em andamento", "Não respondidas", "Não lidas", "Agendadas"]) {
      expect(central).toContain(texto);
    }
    expect(central).toContain("Abrir agendamentos e programar uma mensagem");
    expect(css).toContain("font-variant-numeric:tabular-nums");
    expect(css).toContain(".mensagens-filtros.principais button{ gap:3px");
    expect(central).toContain("Carregando agendamentos…");
    expect(central).toContain("Tentar novamente");
    expect(central).toContain("mensagens-lista-total");
  });

  it("mantém criação e gestão de mensagens agendadas acessíveis pela Central", () => {
    const central = fonte("components/respostas/CentralMensagensView.tsx");
    const conversas = fonte("components/respostas/ConversasView.tsx");
    const agendadas = fonte("components/mensagens/MensagensAgendadasView.tsx");
    expect(central).toContain("aoAbrirAgendadas");
    expect(conversas).toContain('setAba("agendadas")');
    expect(agendadas).toContain('abrirModal("mensagemAgendada")');
    expect(agendadas).toContain("Agendar mensagem");
  });

  it("não inventa texto para mídia indisponível e preserva saída pelo WhatsApp", () => {
    const central = fonte("components/respostas/CentralMensagensView.tsx");
    expect(central).not.toContain("Mensagem sem texto");
    expect(central).toContain("Conteúdo não disponível nesta visualização");
    expect(central).toContain("Abrir no WhatsApp");
    expect(central).not.toContain("<img");
  });

  it("representa valores ausentes sem destaque financeiro", () => {
    const central = fonte("components/respostas/CentralMensagensView.tsx");
    const css = fonte("app/style.css");
    expect(central).toContain('rotuloAusente="Condomínio não informado"');
    expect(css).toContain(".mensagens-imovel-dados .nao-informado");
  });

  it("mantém o contexto compacto e a adaptação mobile", () => {
    const css = fonte("app/style.css");
    expect(css).toContain(".mensagens-contexto-grade{ display:grid");
    expect(css).toContain(".mensagens-contexto-campo.amplo{ grid-column:1/-1; }");
    const mobile = css.slice(css.indexOf("@media (max-width:720px)", css.indexOf("CENTRAL DE MENSAGENS")));
    expect(mobile).toContain(".mensagens-central{ display:block");
    expect(mobile).toContain(".mensagens-contexto{ position:fixed");
    expect(mobile).toContain(".mensagens-conteudo-indisponivel");
  });

  it("isola a consulta de agendamentos pela conta autenticada", () => {
    const hook = fonte("lib/useMensagensAgendadas.ts");
    expect(hook).toContain('.eq("user_id", usuarioId)');
    expect(hook).toContain('filter: `user_id=eq.${usuarioId}`');
    expect(hook).toContain("setInterval");
  });
});
