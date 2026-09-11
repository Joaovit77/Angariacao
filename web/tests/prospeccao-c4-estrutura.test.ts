import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

const raiz = resolve(".");
const ler = (caminho: string) => readFileSync(resolve(raiz, caminho), "utf8");

const arquivosComponentes = {
  ProspeccaoView: "components/prospeccao/ProspeccaoView.tsx",
  CardIdentificado: "components/prospeccao/CardIdentificado.tsx",
  PainelIdentificado: "components/prospeccao/PainelIdentificado.tsx",
  LinhaDoTempoAvistamentos: "components/prospeccao/LinhaDoTempoAvistamentos.tsx",
  ModalAvistamento: "components/modais/ModalAvistamento.tsx",
} as const;

describe("C4 do Garimpo em Campo — estrutura", () => {
  it("cria somente a rota pública final e mantém a page mínima", () => {
    const caminho = "app/(painel)/garimpo-em-campo/page.tsx";
    expect(existsSync(resolve(raiz, caminho))).toBe(true);
    expect(existsSync(resolve(raiz, "app/(painel)/prospeccao/page.tsx"))).toBe(false);
    expect(existsSync(resolve(raiz, "app/(painel)/garimpo/page.tsx"))).toBe(false);
    expect(existsSync(resolve(raiz, "app/(painel)/prospeccao-em-campo/page.tsx"))).toBe(false);

    const page = ler(caminho);
    expect(page).toContain('from "@/components/prospeccao/ProspeccaoView"');
    expect(page).toContain("return <ProspeccaoView />;");
    expect(page).not.toMatch(/useProspeccao|Supabase|useState|useEffect/);
  });

  it("preserva exatamente os cinco nomes internos canônicos", () => {
    for (const [nome, caminho] of Object.entries(arquivosComponentes)) {
      expect(existsSync(resolve(raiz, caminho))).toBe(true);
      expect(ler(caminho)).toContain(`function ${nome}`);
    }
  });

  it("usa a fronteira C3 sem Supabase nem store central na UI do módulo", () => {
    const fontes = Object.values(arquivosComponentes).map(ler).join("\n");
    expect(ler(arquivosComponentes.ProspeccaoView)).toContain("useProspeccao");
    expect(ler(arquivosComponentes.ModalAvistamento)).toContain("useProspeccao");
    expect(fontes).not.toMatch(/getSupabase|@supabase\/supabase-js|@\/lib\/store/);
    expect(fontes).not.toMatch(/\.from\s*\(|\.rpc\s*\(/);
  });

  it("registra ModalAvistamento no uiModal e no overlay reais", () => {
    const uiModal = ler("lib/uiModal.ts");
    const overlay = ler("components/modais/ModalOverlay.tsx");
    expect(uiModal).toContain('| "avistamento"');
    expect(overlay).toContain('import ModalAvistamento from "./ModalAvistamento"');
    expect(overlay).toContain('modal?.tipo === "avistamento"');
    expect(overlay).toContain("<ModalAvistamento imovelIdentificadoId={modal.id} />");
  });

  it("adiciona exatamente uma entrada final no menu e em TITULOS", () => {
    const barra = ler("components/painel/BarraLateral.tsx");
    const topbar = ler("components/painel/Topbar.tsx");
    expect(barra.match(/rota: "\/garimpo-em-campo"/g)).toHaveLength(1);
    expect(barra.match(/texto: "Garimpo em Campo"/g)).toHaveLength(1);
    expect(barra).toMatch(/rota: "\/garimpo-em-campo"[\s\S]*?<svg className="ic"/);
    expect(topbar.match(/"\/garimpo-em-campo": "Garimpo em Campo"/g)).toHaveLength(1);
  });

  it("mantém fotografia, mapa, geolocalização, IA, promoção e exclusão fora do C4", () => {
    const fontes = Object.values(arquivosComponentes).map(ler).join("\n");
    for (const proibido of [
      "CapturaFachada",
      "MapaProspeccao",
      "navigator.geolocation",
      "storage.upload",
      "/api/prospeccao",
      "Transformar em oportunidade",
      "DialogoFundirIdentificados",
      "DialogoExcluirIdentificado",
    ]) {
      expect(fontes).not.toContain(proibido);
    }
    expect(existsSync(resolve(raiz, "app/(painel)/garimpo-em-campo/route.ts"))).toBe(false);
  });
});
