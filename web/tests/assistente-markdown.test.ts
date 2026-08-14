import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import TextoMarkdownSeguro from "@/components/assistente/TextoMarkdownSeguro";

const renderizar = (texto: string) => renderToStaticMarkup(createElement(TextoMarkdownSeguro, { texto }));

describe("markdown seguro do assistente", () => {
  it("renderiza negrito, italico, listas, quebra e codigo inline", () => {
    const html = renderizar("**LD-225** e *prioritário*\nsegunda linha\n\n- primeiro\n- segundo\n\n1. um\n2. dois\n\nUse `codigo`.");
    expect(html).toContain("<strong>LD-225</strong>");
    expect(html).toContain("<em>prioritário</em>");
    expect(html).toContain("<br/>");
    expect(html).toContain("<ul>");
    expect(html).toContain("<ol>");
    expect(html).toContain("<code>codigo</code>");
  });

  it("trata HTML e conteudo perigoso apenas como texto", () => {
    const html = renderizar('<script>alert("x")</script><img src=x onerror=alert(1)> **seguro**');
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&lt;img");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img");
    expect(html).toContain("<strong>seguro</strong>");
  });

  it("trata marcadores incompletos como texto sem travar a renderizacao", () => {
    const html = renderizar("- \n1. \nTexto normal");

    expect(html).toContain("- ");
    expect(html).toContain("1. ");
    expect(html).toContain("Texto normal");
  });
});
