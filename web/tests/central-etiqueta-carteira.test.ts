/** @vitest-environment jsdom */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { createElement } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import EtiquetaCarteiraSemBloqueio from "@/components/central/EtiquetaCarteiraSemBloqueio";
import type { AnuncioCentralAngariacao } from "@/lib/calculo/centralAngariacao";
import { resumirPendenciasRadar, type CandidatoPendenteRadar } from "@/lib/calculo/radarAngariacao";
import {
  rotuloCarteiraSemBloqueio,
  situacaoRepeticaoCentral,
  type CorrespondenciaSemBloqueio,
} from "@/lib/calculo/repeticaoCentralAngariacao";
import type { Imovel } from "@/lib/tipos";

/* R4.1c.1: o card de anúncio ligado a imóvel "Perdido" fica visível e a
   etiqueta "já esteve na carteira" abre, por clique/toque/teclado, um painel
   com código, status e motivo da perda. Casos reais da auditoria R4.1c.0. */

const anuncio = (idExterno: string, titulo: string, endereco: string): AnuncioCentralAngariacao => ({
  idExterno,
  portal: "chaves-na-mao",
  titulo,
  endereco,
  cidade: "Londrina",
  estado: "PR",
  tipo: "Casa",
  url: `https://www.chavesnamao.com.br/imovel/casa-para-alugar/id-${idExterno}/`,
  anunciante: "incerto",
});
const imovel = (codigo: string, endereco: string, status: string, extra: Partial<Imovel> = {}): Imovel =>
  ({ id: `imovel-${codigo}`, codigo, endereco, cidade: "Londrina", tipo: "Casa", status, ...extra });

const LD_75 = imovel("LD-75", "Avenida Alziro Zarur, 200", "Perdido", { motivoPerda: "Imóvel já alugado por conta própria" });
const LD_65 = imovel("LD-65", "Rua Professora Delvina Borges, 190", "Publicado");
const LD_298 = imovel("LD-298", "Rua Joel Braz de Oliveira, 677", "Novo contato");
const CARTEIRA = [LD_75, LD_65, LD_298];

const A_LD_75 = anuncio("32495077", "Casa com 1 quarto para alugar na Avenida Alziro Zarur, 200, San Conrado, Londrina", "Avenida Alziro Zarur, 200");
const A_LD_65 = anuncio("43083373", "Casa com 3 dormitórios para alugar, 200 m² por R$ 5.700,00/mês - Universitário - Londrina/PR", "Rua Professora Delvina Borges, 190");
const A_LD_298 = anuncio("32580375", "Casa com 3 dormitórios para alugar, 80 m² por R$ 2.700,00/mês - Jardim Guararapes - Londrina/PR", "Rua Joel Braz De Oliveira, 677");
const A_COMUM = anuncio("46605369", "Casa com 3 quartos para alugar na Rua Virgílio Jorge, 386, San Remo, Londrina", "Rua Virgílio Jorge, 386");

const perdido = (codigo: string, motivoPerda: string | null, via: CorrespondenciaSemBloqueio["via"] = "endereco"): CorrespondenciaSemBloqueio =>
  ({ codigo, status: "Perdido", motivoPerda, via });

/** Monta a etiqueta como o card faz: a partir do mesmo resultado que decide ocultar. */
function renderizarCard(a: AnuncioCentralAngariacao, aoClicarNoCard = vi.fn()) {
  const repeticao = situacaoRepeticaoCentral(a, CARTEIRA);
  render(createElement("article", { onClick: aoClicarNoCard },
    createElement(EtiquetaCarteiraSemBloqueio, { correspondencias: repeticao.naCarteiraSemBloqueio })));
  return { oculto: repeticao.ocultar, aoClicarNoCard };
}

const etiqueta = () => screen.getByRole("button", { name: /Já esteve na carteira/ });
const painel = () => document.querySelector(".carteira-popover");

afterEach(() => cleanup());

describe("etiqueta clicável 'já esteve na carteira' (R4.1c.1)", () => {
  it("card de imóvel Perdido fica visível com a etiqueta LD + Perdido, fechada", () => {
    const { oculto } = renderizarCard(A_LD_75);
    expect(oculto).toBe(false);
    expect(etiqueta().textContent).toBe("Já esteve na carteira · LD-75 · Perdido");
    expect(etiqueta().getAttribute("type")).toBe("button");
    expect(etiqueta().getAttribute("aria-expanded")).toBe("false");
    expect(etiqueta().hasAttribute("title")).toBe(false);
    expect(painel()).toBeNull();
  });

  it("clique/toque abre o painel com código, status e motivo, ligado à etiqueta", () => {
    renderizarCard(A_LD_75);
    fireEvent.click(etiqueta());
    expect(etiqueta().getAttribute("aria-expanded")).toBe("true");
    const aberto = painel();
    expect(aberto).not.toBeNull();
    expect(etiqueta().getAttribute("aria-controls")).toBe(aberto!.id);
    expect(aberto!.textContent).toContain("Já esteve na carteira");
    expect(aberto!.textContent).toContain("LD-75 · Perdido");
    expect(aberto!.textContent).toContain("Motivo da perda");
    expect(aberto!.textContent).toContain("Imóvel já alugado por conta própria");
    // Fora do card: o card corta o que passa da borda.
    expect(aberto!.parentElement).toBe(document.body);
  });

  it("a própria etiqueta fecha de novo", () => {
    renderizarCard(A_LD_75);
    fireEvent.click(etiqueta());
    fireEvent.click(etiqueta());
    expect(painel()).toBeNull();
    expect(etiqueta().getAttribute("aria-expanded")).toBe("false");
  });

  it("Escape fecha e devolve o foco à etiqueta", () => {
    renderizarCard(A_LD_75);
    fireEvent.click(etiqueta());
    fireEvent.keyDown(document, { key: "Escape" });
    expect(painel()).toBeNull();
    expect(document.activeElement).toBe(etiqueta());
  });

  it("clique fora fecha; clique dentro do painel não fecha", () => {
    renderizarCard(A_LD_75);
    fireEvent.click(etiqueta());
    fireEvent.pointerDown(painel()!);
    expect(painel()).not.toBeNull();
    fireEvent.pointerDown(document.body);
    expect(painel()).toBeNull();
  });

  it("não dispara ações do card nem navega", () => {
    const { aoClicarNoCard } = renderizarCard(A_LD_75);
    fireEvent.click(etiqueta());
    fireEvent.click(painel()!);
    expect(aoClicarNoCard).not.toHaveBeenCalled();
    expect(painel()!.querySelector("a")).toBeNull();
  });

  it("sem motivo, mostra só código e status, sem campo vazio", () => {
    render(createElement(EtiquetaCarteiraSemBloqueio, { correspondencias: [perdido("LD-254", null)] }));
    fireEvent.click(etiqueta());
    expect(painel()!.textContent).toContain("LD-254 · Perdido");
    expect(painel()!.textContent).not.toContain("Motivo");
  });

  it("vários imóveis: etiqueta compacta com +N, painel com todos e seus motivos", () => {
    render(createElement(EtiquetaCarteiraSemBloqueio, {
      correspondencias: [perdido("LD-10", "Optou por outra imobiliária", "url"), perdido("LD-75", "Imóvel já alugado por conta própria")],
    }));
    expect(etiqueta().textContent).toBe("Já esteve na carteira · LD-10 · Perdido +1");
    fireEvent.click(etiqueta());
    const itens = [...painel()!.querySelectorAll("li")].map((li) => li.textContent);
    expect(itens).toEqual([
      "LD-10 · PerdidoMotivo da perdaOptou por outra imobiliária",
      "LD-75 · PerdidoMotivo da perdaImóvel já alugado por conta própria",
    ]);
  });

  it.each([
    ["card comum", A_COMUM, false],
    ["Publicado", A_LD_65, true],
    ["Novo contato", A_LD_298, true],
  ])("%s não recebe o controle (oculto=%s como antes)", (_caso, a, ocultoEsperado) => {
    const { oculto } = renderizarCard(a);
    expect(oculto).toBe(ocultoEsperado);
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("rotuloCarteiraSemBloqueio", () => {
  it("sem correspondência não há rótulo", () => {
    expect(rotuloCarteiraSemBloqueio(undefined)).toBeNull();
    expect(rotuloCarteiraSemBloqueio([])).toBeNull();
  });
});

describe("contador não muda com a etiqueta", () => {
  it("segue a regra aprovada: só o anúncio de imóvel Perdido e o comum contam", () => {
    const buscas = [{ id: "b", filtros: { portal: "chaves-na-mao" as const, cidade: "Londrina", estado: "PR", tipo: "Casa" } }];
    const candidatos: CandidatoPendenteRadar[] = [A_LD_75, A_LD_65, A_LD_298, A_COMUM]
      .map((a) => ({ id: a.idExterno, buscaId: "b", anuncio: a }));
    expect([...resumirPendenciasRadar(candidatos, buscas, CARTEIRA).ids].sort()).toEqual(["32495077", "46605369"]);
  });
});

describe("fronteira da tela", () => {
  it("as duas listas de cards (Radar e resultados) mostram a etiqueta a partir da regra", () => {
    const tela = readFileSync(resolve("components/central/CentralAngariacaoView.tsx"), "utf8");
    const usos = tela.match(/<EtiquetaCarteiraSemBloqueio correspondencias=\{repeticao\.naCarteiraSemBloqueio\} \/>/g) || [];
    expect(usos).toHaveLength(2);
    // A etiqueta não participa da decisão de esconder.
    expect(tela).toMatch(/repeticaoDo\(anuncio\)\.ocultar/);
    expect(tela).not.toMatch(/naCarteiraSemBloqueio[^}]*ocultar|ocultar[^;]*naCarteiraSemBloqueio/);
  });

  it("a etiqueta só apresenta dados: não consulta banco nem rede ao clicar", () => {
    const componente = readFileSync(resolve("components/central/EtiquetaCarteiraSemBloqueio.tsx"), "utf8");
    expect(componente).not.toMatch(/supabase|fetch\(|getSupabase|persistencia/);
  });
});
