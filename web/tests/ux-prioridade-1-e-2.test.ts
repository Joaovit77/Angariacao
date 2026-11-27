// @vitest-environment jsdom
import React from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  pathname: "/avaliacao",
}));

vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
  useRouter: () => ({ push: vi.fn(), prefetch: vi.fn() }),
}));

vi.mock("@/components/BotaoTema", () => ({
  default: () => React.createElement("button", null, "Tema"),
}));
vi.mock("@/components/MarcaApp", () => ({
  default: () => React.createElement("span", null, "Angario"),
}));
vi.mock("@/components/painel/SinoNotificacoes", () => ({
  default: () => React.createElement("div", null, "Sino"),
}));
vi.mock("@/components/painel/MenuUsuario", () => ({
  default: () => React.createElement("div", null, "Menu"),
}));
vi.mock("@/components/assistente/ConversaAssistente", () => ({
  default: () => React.createElement("div", null, "Conversa"),
}));
vi.mock("@/components/assistente/AssistenteProvider", () => ({
  useEstadoAssistente: () => ({ cancelarConsulta: vi.fn(), limparConversa: vi.fn() }),
}));
vi.mock("@/components/assistente/useContextoAssistenteAtual", () => ({
  useContextoAssistenteAtual: () => ({
    contexto: { superficie: "pagina", rota: mocks.pathname },
    modalAtivo: false,
  }),
}));
vi.mock("@/lib/assistente/preferenciaFlutuante", () => ({
  useAssistenteFlutuanteAtivo: () => [true, vi.fn()] as const,
}));
vi.mock("@/lib/superficiesBloqueantes", () => ({
  useSuperficiesBloqueantes: (sel: (estado: { registros: Set<string> }) => unknown) =>
    sel({ registros: new Set() }),
}));
vi.mock("@/lib/store", () => ({
  useAppStore: (sel: (estado: { iaDisponivel: boolean; operaCarteira: boolean }) => unknown) =>
    sel({ iaDisponivel: true, operaCarteira: true }),
}));

import Topbar from "@/components/painel/Topbar";
import Assistente from "@/components/assistente/Assistente";
import {
  motivoEhRessalva,
  rotuloOrigemVerificacaoRadar,
} from "@/components/central/CentralAngariacaoView";
import {
  filtrarImoveis,
  filtrosPipelineVazios,
  paginarLista,
  pipelineColFiltersVazios,
  pipelineUniqueCanonical,
} from "@/lib/calculo/filtros";
import type { Imovel } from "@/lib/tipos";

function fonte(caminho: string): string {
  return readFileSync(join(process.cwd(), caminho), "utf8");
}

afterEach(() => {
  cleanup();
});

describe("UX Prioridade 1 e 2 — regressões de navegação, filtros e clareza", () => {
  it("Topbar exibe 'Avaliação Rápida' na rota /avaliacao", () => {
    mocks.pathname = "/avaliacao";
    render(React.createElement(Topbar, { aoAlternar: vi.fn(), menuAtivo: false }));
    expect(screen.getByRole("heading", { level: 1, name: "Avaliação Rápida" })).toBeTruthy();
  });

  it("Assistente flutuante não aparece em /assistente, mas aparece nas demais rotas", () => {
    mocks.pathname = "/assistente";
    const { unmount } = render(React.createElement(Assistente));
    expect(screen.queryByRole("button", { name: /assistente/i })).toBeNull();
    unmount();

    mocks.pathname = "/agenda";
    render(React.createElement(Assistente));
    expect(screen.getByRole("button", { name: /assistente/i })).toBeTruthy();
  });

  it("pipelineUniqueCanonical deduplica cidades/bairros por caixa, acento e espaço", () => {
    const cidades = pipelineUniqueCanonical([
      "londrina",
      "Londrina",
      "LONDRINA ",
      "Londrina",
      "Sao Paulo",
      "São Paulo",
      "  São   Paulo ",
      "",
      null,
    ]);
    expect(cidades).toEqual(["Londrina", "São Paulo"]);
  });

  it("filtrarImoveis casa variantes de caixa/acento em cidade e busca incremental em bairro", () => {
    const carteira = [
      { id: "1", cidade: "londrina", bairro: "Gleba Palhano", status: "Novo contato" },
      { id: "2", cidade: "Londrina", bairro: "Centro", status: "Novo contato" },
      { id: "3", cidade: "Cambé", bairro: "Centro", status: "Novo contato" },
    ] as Imovel[];

    const porCidade = filtrarImoveis(
      carteira,
      { ...filtrosPipelineVazios(), cidade: "Londrina" },
      "kanban",
      pipelineColFiltersVazios(),
    );
    expect(porCidade.map((i) => i.id)).toEqual(["1", "2"]);

    const porBairroParcial = filtrarImoveis(
      carteira,
      { ...filtrosPipelineVazios(), bairro: "palhano" },
      "kanban",
      pipelineColFiltersVazios(),
    );
    expect(porBairroParcial.map((i) => i.id)).toEqual(["1"]);
  });

  it("paginarLista fatia carteiras grandes corretamente e limita páginas fora da faixa", () => {
    const itens = Array.from({ length: 452 }, (_, idx) => idx + 1);
    const primeira = paginarLista(itens, 1, 50);
    expect(primeira).toMatchObject({ paginaAtual: 1, totalPaginas: 10, inicio: 1, fim: 50, total: 452 });
    expect(primeira.itens).toHaveLength(50);

    const ultima = paginarLista(itens, 99, 50);
    expect(ultima).toMatchObject({ paginaAtual: 10, totalPaginas: 10, inicio: 451, fim: 452, total: 452 });
    expect(ultima.itens).toEqual([451, 452]);

    const vazia = paginarLista([], 3, 50);
    expect(vazia).toMatchObject({ paginaAtual: 1, totalPaginas: 1, inicio: 0, fim: 0, total: 0 });
  });

  it("Radar diferencia ressalvas de sinais positivos e traduz origem da verificação", () => {
    expect(motivoEhRessalva("anunciante ainda precisa ser confirmado")).toBe(true);
    expect(motivoEhRessalva("Preço não informado")).toBe(true);
    expect(motivoEhRessalva("Direto com o proprietário")).toBe(false);
    expect(motivoEhRessalva("Endereço completo disponível")).toBe(false);

    expect(rotuloOrigemVerificacaoRadar("navegador")).toBe("automática com o painel aberto");
    expect(rotuloOrigemVerificacaoRadar("manual")).toBe("manual");
    expect(rotuloOrigemVerificacaoRadar("cron")).toBe("automática diária");
  });

  it("views do painel não duplicam <h1>, não aninham <main> e ocultam nome de provedor no rodapé", () => {
    for (const caminho of [
      "components/assistente/AssistenteView.tsx",
      "components/protocolos/ProtocolosView.tsx",
      "components/configuracoes/ConfiguracoesView.tsx",
      "components/cerebro-ia/CerebroIaView.tsx",
      "components/avaliacao/AvaliacaoRapidaView.tsx",
    ]) {
      expect(fonte(caminho), caminho).not.toMatch(/<h1[\s>]/);
    }

    const avaliacao = fonte("components/avaliacao/AvaliacaoRapidaView.tsx");
    expect(avaliacao).not.toMatch(/<main[\s>]/);
    expect(avaliacao).toContain('aria-label="Filtrar imóvel cadastrado"');

    const barra = fonte("components/painel/BarraLateral.tsx");
    expect(barra).not.toContain("(Supabase)");
    expect(barra).toContain("TOOLTIP_BADGES");
  });
});
