import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { SLIDES_APRESENTACAO } from "@/components/auth/dadosApresentacao";

const APRESENTACAO = readFileSync(
  new URL("../components/auth/Apresentacao.tsx", import.meta.url),
  "utf8",
);
const CONTROLES = readFileSync(
  new URL("../components/auth/ControlesApresentacao.tsx", import.meta.url),
  "utf8",
);
const ESTILO = readFileSync(new URL("../app/apresentacao.css", import.meta.url), "utf8");
const ESTILO_BASE = readFileSync(new URL("../app/style.css", import.meta.url), "utf8");
const VITRINE = readFileSync(
  new URL("../components/auth/Vitrine.tsx", import.meta.url),
  "utf8",
);
const TELA_AUTH = readFileSync(
  new URL("../components/auth/TelaAuth.tsx", import.meta.url),
  "utf8",
);
const CABECALHO = readFileSync(
  new URL("../components/auth/CabecalhoApresentacao.tsx", import.meta.url),
  "utf8",
);
const SLIDE = readFileSync(
  new URL("../components/auth/SlideApresentacao.tsx", import.meta.url),
  "utf8",
);

describe("apresentação pública", () => {
  it("mantém as quatro cenas, textos e fotos definidos para Londrina", () => {
    expect(SLIDES_APRESENTACAO).toHaveLength(4);
    expect(SLIDES_APRESENTACAO.map((slide) => slide.titulo)).toEqual([
      "ANGARIAÇÃO",
      "Conheça o mercado. Antecipe oportunidades.",
      "Da prospecção à publicação.",
      "Sua operação imobiliária, mais inteligente.",
    ]);
    expect(SLIDES_APRESENTACAO.map((slide) => slide.imagem)).toEqual([
      "/apresentacao/pexels-japy-35391295.jpg",
      "/apresentacao/pexels-gaion-17204341.jpg",
      "/apresentacao/pexels-oliveiratp-8602177.jpg",
      "/apresentacao/pexels-gaion-30893717.jpg",
    ]);
    expect(SLIDES_APRESENTACAO[2].fluxo).toEqual([
      "Prospecção",
      "Contato",
      "Negociação",
      "Angariado",
      "Publicado",
    ]);
    for (const slide of SLIDES_APRESENTACAO) expect(slide.alt.trim()).not.toBe("");
  });

  it("oferece autoplay, navegação manual, teclado, pausa e swipe sem biblioteca externa", () => {
    expect(APRESENTACAO).toContain("TEMPO_AUTOPLAY_MS = 6500");
    expect(APRESENTACAO).toContain('evento.key === "ArrowLeft"');
    expect(APRESENTACAO).toContain('evento.key === "ArrowRight"');
    expect(APRESENTACAO).toContain("onTouchStart={aoIniciarToque}");
    expect(APRESENTACAO).toContain("onTouchEnd={aoEncerrarToque}");
    expect(CONTROLES).toContain('aria-label="Voltar ao slide anterior"');
    expect(CONTROLES).toContain('aria-label="Avançar ao próximo slide"');
    expect(CONTROLES).toContain("aria-pressed=");
    expect(CONTROLES).toContain("disabled={movimentoReduzido}");
    expect(CONTROLES).toContain("Apresentação automática desativada");
    expect(CONTROLES).toContain("aria-current=");
  });

  it("usa a otimização atual do Next e antecipa somente a primeira foto", () => {
    expect(APRESENTACAO).toContain('import Image from "next/image"');
    expect(APRESENTACAO).toContain('sizes="100vw"');
    expect(APRESENTACAO).toContain("{ preload: true }");
    expect(APRESENTACAO).toContain('{ loading: "lazy" as const }');
    expect(APRESENTACAO).toContain("proximoPrecarregamento");
    expect(APRESENTACAO).toContain('CONSULTA_FOTO_UNICA_MOBILE = "(max-width: 720px)"');
    expect(APRESENTACAO).toContain("fotoUnicaMobile ?");
    expect(APRESENTACAO).toContain("SLIDES_APRESENTACAO[0].imagem");
  });

  it("remove movimento e autoplay quando essa preferência está ativa", () => {
    expect(APRESENTACAO).toContain("prefers-reduced-motion: reduce");
    expect(APRESENTACAO).toContain("movimentoReduzido ||");
    expect(ESTILO).toMatch(
      /@media \(prefers-reduced-motion:reduce\)[\s\S]*?\.apresentacao-foto\.ativo \.apresentacao-imagem/,
    );
  });

  it("explica o sistema após a apresentação fotográfica sem alterar o acesso", () => {
    expect(TELA_AUTH).toContain("<Vitrine");
    expect(VITRINE).toContain('id="conheca-o-sistema"');
    expect(TELA_AUTH).toContain('import RodapeApp from "@/components/RodapeApp"');
    expect(TELA_AUTH).toContain('<RodapeApp variante="auth" />');
    expect(ESTILO_BASE).toMatch(/\.rodape-app-auth\{[^}]*margin-inline:\s*auto/);
    expect(ESTILO).toMatch(/#conheca-o-sistema\{[^}]*margin-inline:auto/);
    expect(VITRINE).toContain("Sua carteira não precisa de mais contatos.");
    expect(VITRINE).toContain("O sistema abre dizendo o que está esperando você.");
    expect(VITRINE).toContain("Tudo que escreveram para você, em uma tela só.");
    expect(VITRINE).toContain("Prestação de contas que mostra o trabalho feito.");
    expect(CABECALHO).toContain('href="#conheca-o-sistema"');
    expect(SLIDE).toContain('href="#conheca-o-sistema"');
  });

  it("troca o cabeçalho transparente por uma barra compatível com os dois temas", () => {
    expect(CABECALHO).toContain("IntersectionObserver");
    expect(CABECALHO).toContain("fora-da-foto");
    expect(ESTILO).toContain(".apresentacao-topo.fora-da-foto");
    expect(ESTILO).toContain("background:var(--bg-blur)");
    expect(ESTILO).toContain("color:var(--text); background:var(--bg)");
  });
});
