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
const VIDEO_ABERTURA = readFileSync(
  new URL("../components/auth/VideoAbertura.tsx", import.meta.url),
  "utf8",
);

describe("apresentação pública", () => {
  it("mantém as quatro cenas, textos e fotos definidos para Londrina", () => {
    expect(SLIDES_APRESENTACAO).toHaveLength(4);
    expect(SLIDES_APRESENTACAO.map((slide) => slide.titulo)).toEqual([
      "ANGARIO",
      "Conheça o mercado. Antecipe oportunidades.",
      "Da prospecção à publicação.",
      "Sua operação imobiliária, mais inteligente.",
    ]);
    expect(SLIDES_APRESENTACAO.map((slide) => slide.imagem)).toEqual([
      "/apresentacao/londrina-lago-igapo-poster.jpg",
      "/apresentacao/londrina-entardecer.jpg",
      "/apresentacao/pexels-gaion-17204341.jpg",
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

  it("usa vídeo na abertura e otimiza as demais fotos com o Next", () => {
    expect(APRESENTACAO).toContain('import Image from "next/image"');
    expect(APRESENTACAO).toContain('sizes="100vw"');
    expect(APRESENTACAO).toContain('loading="lazy"');
    expect(APRESENTACAO).toContain("proximoPrecarregamento");
    expect(APRESENTACAO).toContain('CONSULTA_FOTO_UNICA_MOBILE = "(max-width: 720px)"');
    expect(APRESENTACAO).toContain("fotoUnicaMobile || indiceAtivo === 0");
    expect(APRESENTACAO).toContain("<VideoAbertura");
    expect(APRESENTACAO.match(/<VideoAbertura/g)).toHaveLength(1);
    expect(APRESENTACAO).toContain("SLIDES_APRESENTACAO.slice(1)");
    expect(SLIDES_APRESENTACAO[0].video).toBe(
      "/apresentacao/londrina-lago-igapo.mp4",
    );
    expect(VIDEO_ABERTURA).toContain("src={poster}");
    expect(VIDEO_ABERTURA).toContain("src={video}");
    expect(VIDEO_ABERTURA).toContain('className="apresentacao-video-poster"');
    expect(VIDEO_ABERTURA).toContain("priority");
    expect(VIDEO_ABERTURA).not.toContain("{falhaVideo && (");
    expect(VIDEO_ABERTURA).toContain("onError={registrarFalha}");
    expect(VIDEO_ABERTURA).toContain("DURACAO_TRANSICAO_LOOP_SEGUNDOS = 0.85");
    expect(VIDEO_ABERTURA).toContain("autoPlay=");
    expect(VIDEO_ABERTURA).toContain("muted");
    expect(VIDEO_ABERTURA).toContain("loop={repetir}");
    expect(VIDEO_ABERTURA).toContain("playsInline");
    expect(VIDEO_ABERTURA).toContain('type="video/mp4"');
    expect(VIDEO_ABERTURA).toContain("onTimeUpdate={acompanharLoop}");
    expect(VIDEO_ABERTURA).toContain("onEnded={aoFinalizar}");
    expect(VIDEO_ABERTURA).toContain("carregamentoConfirmadoRef");
    expect(VIDEO_ABERTURA).toContain("video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA");
    expect(VIDEO_ABERTURA).toContain("onCanPlay={confirmarCarregamento}");
    expect(VIDEO_ABERTURA).toContain("movimentoReduzido || !repetir");
    expect(VIDEO_ABERTURA).toContain('carregado && (!repetir || !finalizandoLoop)');
    expect(APRESENTACAO).toContain("repetir={fotoUnicaMobile}");
    expect(APRESENTACAO).toContain("aoFinalizar={aoFinalizarVideoAbertura}");
    expect(APRESENTACAO).toContain("navegarPara(1, false)");
    expect(APRESENTACAO).toContain("solicitadoRef.current !== null");
    expect(ESTILO).toContain(".enquadramento-abertura:not(.apresentacao-video)");
    expect(ESTILO).toMatch(/\.apresentacao-video\{[^}]*transition:opacity \.28s/);
    expect(ESTILO).toContain(".apresentacao-video.visivel{ opacity:1; }");
  });

  it("remove movimento e autoplay quando essa preferência está ativa", () => {
    expect(APRESENTACAO).toContain("prefers-reduced-motion: reduce");
    expect(VIDEO_ABERTURA).toContain("video.pause()");
    expect(VIDEO_ABERTURA).toContain('movimentoReduzido ? "metadata" : "auto"');
    expect(APRESENTACAO).toContain("movimentoReduzido ||");
    expect(ESTILO).toMatch(
      /@media \(prefers-reduced-motion:reduce\)[\s\S]*?\.apresentacao-foto\.ativo \.apresentacao-imagem/,
    );
  });

  it("mantém a altura da apresentação estável durante a rolagem mobile", () => {
    expect(ESTILO).toMatch(
      /@media \(max-width:720px\)[\s\S]*?\.auth-showcase\.apresentacao\{[^}]*height:100svh; min-height:100svh;/,
    );
  });

  it("explica o sistema após a apresentação fotográfica sem alterar o acesso", () => {
    expect(TELA_AUTH).toContain("<Vitrine");
    expect(VITRINE).toContain('id="conheca-o-sistema"');
    expect(TELA_AUTH).toContain('import RodapeApp from "@/components/RodapeApp"');
    expect(TELA_AUTH).toContain('<RodapeApp variante="auth" />');
    expect(ESTILO_BASE).toMatch(/\.rodape-app-auth\{[^}]*margin-inline:\s*auto/);
    expect(ESTILO).toMatch(/#conheca-o-sistema\{[^}]*margin-inline:auto/);
    expect(VITRINE).toContain("Explore o Angario CRM");
    expect(VITRINE).toContain("Tenha sua operação inteira em uma única tela.");
    expect(VITRINE).toContain("Uma IA treinada para trabalhar como corretor.");
    expect(VITRINE).toContain("O Angario conversa com todo o seu ecossistema.");
    for (const id of [
      "dashboard",
      "pipeline",
      "agenda",
      "inteligencia-artificial",
      "avaliacao-de-imoveis",
      "whatsapp",
      "mapa-inteligente",
      "relatorios",
      "integracoes",
    ]) {
      expect(VITRINE).toContain(`id: "${id}"`);
    }
    expect(VITRINE).toContain("explore-menu-wrap");
    expect(VITRINE).toContain('className="explore-menu-mobile-toggle"');
    expect(VITRINE).toContain('aria-controls="explore-menu-opcoes"');
    expect(VITRINE).toContain("Abrir menu de funcionalidades");
    expect(VITRINE).toContain("explore-menu-backdrop");
    expect(VITRINE).toContain("explore-menu-drawer");
    expect(VITRINE).toContain("createPortal");
    expect(VITRINE.indexOf("explore-menu-wrap")).toBeLessThan(VITRINE.indexOf("explore-intro"));
    expect(VITRINE).toContain("menuMobileAberto");
    expect(VITRINE).toContain("scrollIntoView");
    expect(VITRINE).toContain("window.requestAnimationFrame");
    expect(VITRINE).toContain("window.history.replaceState");
    expect(VITRINE).toContain('from "framer-motion"');
    expect(ESTILO_BASE).toMatch(/\.explore-menu-wrap\{[\s\S]*?position:sticky/);
    expect(ESTILO_BASE).toMatch(
      /@media \(max-width:720px\)[\s\S]*?\.explore-menu-mobile-toggle\{[\s\S]*?display:grid/,
    );
    expect(ESTILO_BASE).toMatch(
      /@media \(max-width:720px\)[\s\S]*?\.explore-menu-wrap\{[\s\S]*?height:0[\s\S]*?backdrop-filter:none/,
    );
    expect(ESTILO_BASE).toMatch(
      /@media \(max-width:720px\)[\s\S]*?\.explore-menu-mobile-atual\{ display:none; \}/,
    );
    expect(ESTILO_BASE).toContain(".explore-menu-drawer.aberto");
    expect(ESTILO_BASE).toMatch(/\.explore-menu-drawer\{[\s\S]*?transform:translateX\(-100%\)/);
    expect(ESTILO_BASE).toMatch(
      /\.explore-feature\{[\s\S]*?grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/,
    );
    expect(ESTILO_BASE).toContain("width:calc(var(--explore-gap) / 2)");
    expect(CABECALHO).toContain('href="#conheca-o-sistema"');
    expect(SLIDE).toContain('href="#conheca-o-sistema"');
    expect(SLIDE).toContain("aoSolicitarDemonstracao");
  });

  it("troca o cabeçalho transparente por uma barra compatível com os dois temas", () => {
    expect(CABECALHO).toContain("IntersectionObserver");
    expect(CABECALHO).toContain("fora-da-foto");
    expect(ESTILO).toContain(".apresentacao-topo.fora-da-foto");
    expect(ESTILO).toContain("background:var(--bg-blur)");
    expect(ESTILO).toContain("color:var(--text); background:var(--bg)");
    expect(ESTILO).toContain("--apresentacao-acento:#e3c368");
    expect(ESTILO).toMatch(
      /\.apresentacao-sobrelinha\{[^}]*color:var\(--apresentacao-acento\)/,
    );
    expect(ESTILO).toMatch(
      /\.apresentacao-conhecer-topo\{[^}]*text-decoration:none/,
    );
    expect(APRESENTACAO).toContain("Imagens disponibilizadas pelo Pexels");
    expect(ESTILO).toMatch(
      /#conheca-o-sistema::before\{[\s\S]*?rgb\(var\(--sombra-rgb\) \/ \.14\)[\s\S]*?var\(--bg\) 100%/,
    );
  });
});
