import { readFileSync, statSync } from "node:fs";
import { describe, expect, it } from "vitest";

const MARCA = readFileSync(new URL("../components/MarcaApp.tsx", import.meta.url), "utf8");
const ESTILO = readFileSync(new URL("../app/style.css", import.meta.url), "utf8");
const NOTIFICACAO = readFileSync(new URL("../lib/notificacaoSistema.ts", import.meta.url), "utf8");
const LAYOUT = readFileSync(new URL("../app/layout.tsx", import.meta.url), "utf8");

describe("marca principal por tema", () => {
  it("mantém as duas artes no componente para evitar troca tardia após a hidratação", () => {
    expect(MARCA).toContain('src="/logo-angario-escuro.png"');
    expect(MARCA).toContain('src="/logo-angario-claro.png"');
  });

  it("cobre a escolha explícita e o tema claro herdado do sistema", () => {
    expect(ESTILO).toContain(':root[data-tema="claro"] .marca-app-imagem-escuro');
    expect(ESTILO).toContain(':root:not([data-tema="escuro"]) .marca-app-imagem-claro');
  });

  it("compensa a área útil diferente das artes sem mudar o box da marca", () => {
    expect(ESTILO).toContain("transform:translate(-.7px,.3px) scale(1.067,1.174)");
    expect(ESTILO).toContain(".vitrine-topo-marca .brand-mark{ width:40px; height:40px;");
  });

  it("usa a nova identidade também nas notificações do sistema", () => {
    expect(NOTIFICACAO).toContain('icon: "/angario-favicon.png"');
    expect(NOTIFICACAO).not.toContain('icon: "/logo.png"');
  });

  it("publica o ícone Angario como favicon e ícone de dispositivo", () => {
    expect(LAYOUT).toContain('icon: "/angario-favicon.png"');
    expect(LAYOUT).toContain('apple: "/angario-favicon.png"');
    expect(statSync(new URL("../app/favicon.ico", import.meta.url)).size).toBeGreaterThan(1_000);
    expect(statSync(new URL("../public/angario-favicon.png", import.meta.url)).size).toBeGreaterThan(
      1_000,
    );
  });
});
