import { describe, expect, it } from "vitest";
import { idDoAnuncio } from "@/lib/calculo/centralAngariacao";
import { extrairAnunciosFirecrawl } from "@/lib/servidor/firecrawlCentralAngariacao";

// Cards sintéticos exercitam o contrato do parser; não são captura do portal.
const filtros = { portal: "viva-real" as const, cidade: "Londrina", estado: "PR" };
const url = "https://www.vivareal.com.br/imovel/apartamento-londrina-id-2904079401/?origem=busca";

function card(paragrafos: string[], href = url, titulo = "Apartamento para alugar em Londrina") {
  return `<a href="${href}"><h2>${titulo}</h2>${paragrafos.map((valor) => `<p>${valor}</p>`).join("")}</a>`;
}

function unico(paragrafos: string[], href = url) {
  const anuncios = extrairAnunciosFirecrawl(card(paragrafos, href), filtros);
  expect(anuncios).toHaveLength(1);
  return anuncios[0];
}

describe("Viva Real: preço com evidência", () => {
  it.each([
    ["primeiro R$ sem marcador", ["Rua Sergipe", "R$ 3.200"]],
    ["primeiro R$ antes de IPTU", ["Rua Sergipe", "R$ 3.200", "IPTU R$ 130"]],
    ["múltiplos valores sem semântica", ["Rua Sergipe", "R$ 3.200", "R$ 700", "R$ 130"]],
    ["condomínio identificado", ["Rua Sergipe", "Condomínio R$ 700"]],
    ["IPTU identificado", ["Rua Sergipe", "IPTU R$ 130"]],
  ] as const)("não presume aluguel: %s", (_caso, paragrafos) => {
    expect(unico([...paragrafos]).preco).toBeNull();
  });

  it("não aprova faixa de aluguel quando o preço não é comprovado", () => {
    expect(extrairAnunciosFirecrawl(card(["R$ 3.200"]), { ...filtros, valorMin: 1000 })).toEqual([]);
  });
});

describe("Viva Real: identidade e dados publicados", () => {
  it("prioriza o ID numérico da URL independentemente de query, slug e posição", () => {
    const outroSlug = "https://www.vivareal.com.br/imovel/outro-slug-id-2904079401/?pagina=2";
    expect(idDoAnuncio("viva-real", url, 0)).toBe("2904079401");
    expect(idDoAnuncio("viva-real", url, 45)).toBe("2904079401");
    expect(idDoAnuncio("viva-real", outroSlug, 7)).toBe("2904079401");
    expect(unico(["Rua Sergipe"], outroSlug).idExterno).toBe("2904079401");
  });

  it("usa o fallback existente somente quando a URL não contém ID estável", () => {
    const semId = "https://www.vivareal.com.br/imovel/apartamento-sem-codigo/";
    expect(idDoAnuncio("viva-real", semId, 0)).toMatch(/^viva-real-0-/);
    expect(idDoAnuncio("viva-real", semId, 1)).not.toBe(idDoAnuncio("viva-real", semId, 0));
    expect(idDoAnuncio("viva-real", url, 1)).not.toBe(idDoAnuncio("viva-real", semId, 1));
    expect(idDoAnuncio("viva-real", url.replace("2904079401", "2904079402"), 0)).toBe("2904079402");
  });

  it("não inventa número, bairro nem autoria a partir do portal ou da busca", () => {
    const anuncio = unico(["Rua Sergipe", "R$ 3.200", "IPTU R$ 130"]);
    expect(anuncio.endereco).toBe("Rua Sergipe");
    expect(anuncio.bairro).toBeNull();
    expect(anuncio.cidade).toBe("Londrina"); // contexto do filtro, não publicação no card
    expect(anuncio.estado ?? null).toBeNull();
    expect(anuncio.anunciante).toBe("incerto");
    expect(anuncio.publicadoEm ?? null).toBeNull();
  });
});
