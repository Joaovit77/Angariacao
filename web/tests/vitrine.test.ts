import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const VITRINE = readFileSync(new URL("../components/auth/Vitrine.tsx", import.meta.url), "utf8");
const ESTILO = readFileSync(new URL("../app/style.css", import.meta.url), "utf8");

describe("vitrine pública", () => {
  it("apresenta todas as áreas de trabalho do corretor", () => {
    const coberturas = [
      "A rodada de hoje",
      "Dashboard e insights",
      "Pipeline",
      "Central e Radar",
      "Conversas e respostas",
      "Metas",
      "Agenda",
      "Mapa da carteira",
      "Relatórios",
      "Protocolos da imobiliária",
      "Mensagens agendadas",
    ];

    for (const cobertura of coberturas) expect(VITRINE).toContain(cobertura);
  });

  it("apresenta os recursos transversais que não têm item próprio no menu", () => {
    for (const recurso of [
      "Assistente em contexto",
      "Entrada e saída por planilha",
      "Anúncios e documentos",
      "Histórico de interações",
      "Google Agenda",
      "WhatsApp",
    ]) {
      expect(VITRINE).toContain(recurso);
    }
  });

  it("mantém a animação do Radar opcional para quem reduz movimento", () => {
    expect(ESTILO).toContain("@keyframes radar-varredura");
    expect(ESTILO).toMatch(
      /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.radar-vitrine-feixe\{ display:none; \}/,
    );
  });
});
