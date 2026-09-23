import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import EtiquetaCarteiraSemBloqueio from "@/components/central/EtiquetaCarteiraSemBloqueio";
import type { AnuncioCentralAngariacao } from "@/lib/calculo/centralAngariacao";
import { resumirPendenciasRadar, type CandidatoPendenteRadar } from "@/lib/calculo/radarAngariacao";
import {
  rotuloCarteiraSemBloqueio,
  situacaoRepeticaoCentral,
  type CorrespondenciaSemBloqueio,
} from "@/lib/calculo/repeticaoCentralAngariacao";
import type { Imovel } from "@/lib/tipos";

/* R4.1c.1: o card de anúncio ligado a imóvel "Perdido" fica visível e diz que
   o imóvel já esteve na carteira. Casos reais da auditoria R4.1c.0. */

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

/** O card renderiza a etiqueta a partir do mesmo resultado que decide ocultar. */
function card(a: AnuncioCentralAngariacao) {
  const repeticao = situacaoRepeticaoCentral(a, CARTEIRA);
  const html = renderToStaticMarkup(createElement(EtiquetaCarteiraSemBloqueio, { correspondencias: repeticao.naCarteiraSemBloqueio }));
  return { oculto: repeticao.ocultar, html };
}

describe("etiqueta 'já esteve na carteira' no card (R4.1c.1)", () => {
  it("card de imóvel Perdido fica visível e mostra código, status e motivo", () => {
    const { oculto, html } = card(A_LD_75);
    expect(oculto).toBe(false);
    expect(html).toContain("Já esteve na carteira · LD-75 · Perdido");
    expect(html).toContain('class="carteira-sem-bloqueio"');
    expect(html).toContain('title="LD-75 · Perdido · Imóvel já alugado por conta própria"');
  });

  it("Publicado continua escondido e sem a etiqueta", () => {
    expect(card(A_LD_65)).toEqual({ oculto: true, html: "" });
  });

  it("Novo contato continua escondido e sem a etiqueta", () => {
    expect(card(A_LD_298)).toEqual({ oculto: true, html: "" });
  });

  it("card comum, sem imóvel da carteira, não ganha etiqueta", () => {
    expect(card(A_COMUM)).toEqual({ oculto: false, html: "" });
  });
});

describe("rotuloCarteiraSemBloqueio", () => {
  const perdido = (codigo: string, motivoPerda: string | null, via: CorrespondenciaSemBloqueio["via"] = "endereco"): CorrespondenciaSemBloqueio =>
    ({ codigo, status: "Perdido", motivoPerda, via });

  it("sem motivo, o detalhe traz só código e status", () => {
    expect(rotuloCarteiraSemBloqueio([perdido("LD-254", null)])).toEqual({
      texto: "Já esteve na carteira · LD-254 · Perdido",
      detalhe: "LD-254 · Perdido",
    });
  });

  it("vários imóveis: etiqueta compacta com +N e todos no detalhe, na ordem encontrada", () => {
    expect(rotuloCarteiraSemBloqueio([
      perdido("LD-10", "Optou por outra imobiliária", "url"),
      perdido("LD-75", "Imóvel já alugado por conta própria"),
    ])).toEqual({
      texto: "Já esteve na carteira · LD-10 · Perdido +1",
      detalhe: "LD-10 · Perdido · Optou por outra imobiliária\nLD-75 · Perdido · Imóvel já alugado por conta própria",
    });
  });

  it("sem correspondência não há rótulo", () => {
    expect(rotuloCarteiraSemBloqueio(undefined)).toBeNull();
    expect(rotuloCarteiraSemBloqueio([])).toBeNull();
    expect(renderToStaticMarkup(createElement(EtiquetaCarteiraSemBloqueio, {}))).toBe("");
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
});
