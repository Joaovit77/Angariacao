import { describe, expect, it } from "vitest";
import type { AnuncioCentralAngariacao } from "@/lib/calculo/centralAngariacao";
import { resumirPendenciasRadar, type CandidatoPendenteRadar } from "@/lib/calculo/radarAngariacao";
import { partesEnderecoCasa, situacaoRepeticaoCentral } from "@/lib/calculo/repeticaoCentralAngariacao";
import { avaliarPossivelImovelCarteira } from "@/lib/calculo/sinaisRepeticaoRadar";
import type { Imovel } from "@/lib/tipos";

/* R4.1c.2: caminho extra, só para casa, que reconhece o mesmo logradouro +
   número confiável escrito de outro jeito. Soma ao match atual (endereço
   idêntico). Casos reais da auditoria R4.1c (Production, 23/09/2026). */

const anuncio = (idExterno: string, titulo: string, endereco: string | null, extra: Partial<AnuncioCentralAngariacao> = {}): AnuncioCentralAngariacao => ({
  idExterno,
  portal: "chaves-na-mao",
  titulo,
  endereco,
  cidade: "Londrina",
  estado: "PR",
  tipo: "Casa",
  url: `https://www.chavesnamao.com.br/imovel/casa-para-alugar/id-${idExterno}/`,
  anunciante: "incerto",
  ...extra,
});
const imovel = (codigo: string, endereco: string, status: string, extra: Partial<Imovel> = {}): Imovel =>
  ({ id: `imovel-${codigo}`, codigo, endereco, cidade: "Londrina", tipo: "Casa", status, ...extra });

const LD_65 = imovel("LD-65", "Rua Professora Delvina Borges, 190", "Publicado");
const LD_214 = imovel("LD-214", "Rua Michigan, 610", "Perdido", { quartos: 4, valorAluguel: 8800, motivoPerda: "Imóvel já alugado por conta própria" });
const LD_191 = imovel("LD-191", "Rua Michigan, 490", "Perdido");
const LD_80 = imovel("LD-80", "Rua Henrique Dias, 378", "Sem resposta");
const LD_178 = imovel("LD-178", "Rua Presidente Wilson, 170", "Publicado");
const LD_176 = imovel("LD-176", "Rua Edu Chaves, 112", "Perdido", { tipo: "Apartamento" });

const A_43083373 = anuncio("43083373", "Casa com 3 dormitórios para alugar, 200 m² por R$ 5.700,00/mês - Universitário - Londrina/PR", "Rua Professora Delvina Borges, 190");
const A_40323649 = anuncio("40323649", "Casa com 4 quartos para alugar na Michigan, 610, Quebec, Londrina por R$ 7.500", "Michigan, 610", { quartos: 4, preco: 7500 });
const A_45365235 = anuncio("45365235", "Casa Com 3 quartos, Churrasqueira E 5 Vagas Próxima Ao Lago Igapó", "Rua Henrique Dias, Casa, 378", { quartos: 3, preco: 4900 });
const A_45326545 = anuncio("45326545", "Casa para alugar no Universitário, Londrina", null);
const A_30868208 = anuncio("30868208", "Casa com fino acabamento para Venda ou Locação próximo ao Aeroporto, Londrina-PR", "Rua Edu Chaves, 112");

const situacao = (a: AnuncioCentralAngariacao, imoveis: Imovel[]) => situacaoRepeticaoCentral(a, imoveis);

describe("partesEnderecoCasa", () => {
  it("lê tipo, logradouro e número, ignorando caixa, acento, espaços e pontuação", () => {
    const esperado = { tipoLogradouro: "avenida", logradouro: "sao joao", numero: "1872" };
    expect(partesEnderecoCasa("Avenida São João, 1872")).toEqual(esperado);
    expect(partesEnderecoCasa("  av.   SAO  JOÃO ,  1872 ")).toEqual(esperado);
    expect(partesEnderecoCasa("São João, 1872")).toEqual({ ...esperado, tipoLogradouro: null });
    expect(partesEnderecoCasa("R. Michigan, 610")).toEqual({ tipoLogradouro: "rua", logradouro: "michigan", numero: "610" });
    expect(partesEnderecoCasa("Michigan, 610")).toEqual({ tipoLogradouro: null, logradouro: "michigan", numero: "610" });
    expect(partesEnderecoCasa("Trav. Xingu, 10")).toEqual({ tipoLogradouro: "travessa", logradouro: "xingu", numero: "10" });
  });

  it("aceita só 'logradouro, casa, número' como token intermediário", () => {
    expect(partesEnderecoCasa("Rua Henrique Dias, Casa, 378")).toEqual({ tipoLogradouro: "rua", logradouro: "henrique dias", numero: "378" });
    expect(partesEnderecoCasa("Rua Henrique Dias, CASA , 378")).toEqual({ tipoLogradouro: "rua", logradouro: "henrique dias", numero: "378" });
    // Unidade específica ou qualquer outro trecho: sem evidência segura.
    expect(partesEnderecoCasa("Rua Xingu, Casa 2, 100")).toBeNull();
    expect(partesEnderecoCasa("Rua Xingu, Fundos, 100")).toBeNull();
    expect(partesEnderecoCasa("Rua Xingu, 100, Casa 2")).toBeNull();
    expect(partesEnderecoCasa("Rua Alagoas, 1674, Centro, Londrina - CEP: 86010520")).toBeNull();
  });

  it("preserva a letra do número: 321 A = 321A, mas 92A ≠ 92B e 92 ≠ 92A", () => {
    expect(partesEnderecoCasa("Rua Xingu, 321 A")?.numero).toBe("321a");
    expect(partesEnderecoCasa("Rua Xingu, 321A")?.numero).toBe("321a");
    expect(partesEnderecoCasa("Rua Xingu, 92 A")?.numero).not.toBe(partesEnderecoCasa("Rua Xingu, 92 B")?.numero);
    expect(partesEnderecoCasa("Rua Xingu, 92")?.numero).not.toBe(partesEnderecoCasa("Rua Xingu, 92 A")?.numero);
  });

  it.each(["Edu Chaves, --", "Rua Xingu, sn", "Rua Xingu, 0", "Rua Xingu, 00", "Rua Xingu, 000", "Rua Xingu, 1", "Rua Xingu, 228-3", "Rua Xingu, 766 ap 1006"])(
    "rejeita número sem evidência segura: %s",
    (endereco) => {
      expect(partesEnderecoCasa(endereco)).toBeNull();
    },
  );

  it("rejeita endereço sem vírgula, vazio ou sem logradouro", () => {
    expect(partesEnderecoCasa("Rua Cambará 448")).toBeNull();
    expect(partesEnderecoCasa(null)).toBeNull();
    expect(partesEnderecoCasa("")).toBeNull();
    expect(partesEnderecoCasa("Rua, 100")).toBeNull();
  });
});

describe("situacaoRepeticaoCentral com o caminho estruturado (casos reais)", () => {
  it("LD-65 continua reconhecida pelo endereço idêntico", () => {
    expect(situacao(A_43083373, [LD_65])).toEqual({ motivo: "casa-no-pipeline", ocultar: true });
  });

  it("40323649 ↔ LD-214: mesmo imóvel, Perdido, fica visível com contexto", () => {
    expect(situacao(A_40323649, [LD_214, LD_191])).toEqual({
      motivo: null,
      ocultar: false,
      naCarteiraSemBloqueio: [{ codigo: "LD-214", status: "Perdido", motivoPerda: "Imóvel já alugado por conta própria", via: "endereco" }],
    });
  });

  it("45365235 ↔ LD-80: mesmo imóvel, Sem resposta, continua escondendo", () => {
    expect(situacao(A_45365235, [LD_80])).toEqual({ motivo: "casa-no-pipeline", ocultar: true });
  });

  it("antes do R4.1c.2 os dois não eram reconhecidos (a chave inteira diferia)", () => {
    // Com status ativo, o anúncio "Michigan, 610" agora esconde; sem o caminho novo, não esconderia.
    expect(situacao(A_40323649, [{ ...LD_214, status: "Novo contato" }])).toEqual({ motivo: "casa-no-pipeline", ocultar: true });
  });

  it("45326545 ↔ LD-178: sem endereço no card, continua sem correspondência", () => {
    expect(situacao(A_45326545, [LD_178])).toEqual({ motivo: null, ocultar: false });
  });

  it("LD-176 (Perdido, Apartamento) não vira casa-no-pipeline nem ganha contexto", () => {
    expect(situacao(A_30868208, [LD_176])).toEqual({ motivo: null, ocultar: false });
  });
});

describe("tipo do logradouro: só pode faltar de um lado", () => {
  const ativo = (endereco: string) => [imovel("LD-X", endereco, "Novo contato")];
  const casa = (endereco: string) => anuncio("n", "Casa com 4 quartos", endereco);

  it.each([
    ["Michigan, 610", "Rua Michigan, 610"],
    ["Rua Michigan, 610", "R. Michigan, 610"],
    ["Avenida Michigan, 610", "Av. Michigan, 610"],
  ])("%s × %s → mesmo endereço", (doAnuncio, daCarteira) => {
    expect(situacao(casa(doAnuncio), ativo(daCarteira))).toEqual({ motivo: "casa-no-pipeline", ocultar: true });
  });

  it.each([
    ["Rua Michigan, 610", "Avenida Michigan, 610"],
    ["Travessa Xingu, 10", "Rua Xingu, 10"],
    ["Av. Xingu, 10", "Trav. Xingu, 10"],
  ])("%s × %s → tipos explícitos diferentes, sem correspondência", (doAnuncio, daCarteira) => {
    expect(situacao(casa(doAnuncio), ativo(daCarteira))).toEqual({ motivo: null, ocultar: false });
  });
});

describe("controles de falso positivo (casos reais com números diferentes)", () => {
  it.each([
    ["45490359 ↔ LD-01 (112 × 113, vizinhas)", "Rua Doutor Juvenal Egger Filho, 112", "Rua Doutor Juvenal Egger Filho, 113"],
    ["40323649 ↔ LD-191 (610 × 490)", "Michigan, 610", "Rua Michigan, 490"],
    ["32580375 ↔ LD-238 (677 × 741)", "Rua Joel Braz De Oliveira, 677", "Rua Joel Braz de Oliveira, 741"],
    ["46105375 ↔ LD-99 (72 × 562)", "Avenida Aminthas De Barros, 72", "Avenida Aminthas de Barros, 562"],
    ["34611953 ↔ LD-207 (1372 × 2022)", "Avenida São João, 1372", "Avenida São João, 2022"],
    ["34611953 ↔ LD-258 (1372 × 1872)", "Avenida São João, 1372", "Avenida São João, 1872"],
    ["112 × 116", "Rua Edu Chaves, 116", "Rua Edu Chaves, 112"],
    ["92A × 92B", "Rua Xingu, 92 A", "Rua Xingu, 92 B"],
    ["92 × 92A", "Rua Xingu, 92", "Rua Xingu, 92 A"],
  ])("%s: não há correspondência", (_caso, doAnuncio, daCarteira) => {
    expect(situacao(anuncio("n", "Casa com 3 quartos", doAnuncio), [imovel("LD-X", daCarteira, "Novo contato")]))
      .toEqual({ motivo: null, ocultar: false });
  });

  it("vários imóveis na mesma rua: só o de número igual corresponde", () => {
    const rua = [imovel("LD-A", "Rua Michigan, 490", "Novo contato"), imovel("LD-B", "Rua Michigan, 612", "Novo contato"), { ...LD_214 }];
    expect(situacao(A_40323649, rua).naCarteiraSemBloqueio?.map((item) => item.codigo)).toEqual(["LD-214"]);
    expect(situacao(A_40323649, rua).ocultar).toBe(false);
  });

  it("placeholders dos dois lados não usam o caminho novo", () => {
    // "Edu Chaves, --" × "Rua Edu Chaves, --": nada a comparar pelo caminho estruturado.
    expect(situacao(anuncio("n", "Casa com 3 quartos", "Edu Chaves, --"), [imovel("LD-X", "Rua Edu Chaves, --", "Novo contato")]))
      .toEqual({ motivo: null, ocultar: false });
    expect(situacao(anuncio("n", "Casa com 3 quartos", "Luiz Viotti, 1"), [imovel("LD-X", "Rua Luiz Viotti, 1", "Novo contato")]))
      .toEqual({ motivo: null, ocultar: false });
  });

  it("'Casa 2' não é descartado: não corresponde à casa sem unidade", () => {
    expect(situacao(anuncio("n", "Casa de fundos", "Rua Henrique Dias, Casa 2, 378"), [LD_80])).toEqual({ motivo: null, ocultar: false });
  });

  it("cidade diferente não corresponde", () => {
    expect(situacao(A_40323649, [{ ...LD_214, status: "Novo contato", cidade: "Cambé" }])).toEqual({ motivo: null, ocultar: false });
  });

  it("apartamento no mesmo endereço continua só com selo", () => {
    const apto = anuncio("n", "Apartamento com 2 quartos", "Michigan, 610", { tipo: "Apartamento" });
    expect(situacao(apto, [{ ...LD_214, status: "Novo contato" }])).toEqual({ motivo: null, ocultar: false });
    expect(situacao(apto, [imovel("LD-X", "Michigan, 610", "Novo contato")])).toEqual({ motivo: "apartamento-no-endereco", ocultar: false });
  });

  it("carteira cadastrada como apartamento não vira bloqueio de casa pelo caminho novo", () => {
    expect(situacao(A_40323649, [{ ...LD_214, status: "Novo contato", tipo: "Apartamento" }])).toEqual({ motivo: null, ocultar: false });
  });
});

describe("regra atual continua valendo (caminho novo só soma)", () => {
  it.each([
    ["Rua Cambará 448", "Rua Cambará, 448", "Casa · 161m² · 1 Quarto · Casa em Centro, Londrina"],
    ["Avenida Dos Pioneiros 1100", "Avenida Dos Pioneiros, 1100", "Casa Em Condomínio Para Alugar Condomínio Ilha"],
  ])("Wimóveis sem vírgula '%s' continua reconhecido", (doAnuncio, daCarteira, titulo) => {
    const a = anuncio("w", titulo, doAnuncio, { portal: "wimoveis" });
    expect(partesEnderecoCasa(doAnuncio)).toBeNull();
    expect(situacao(a, [imovel("LD-W", daCarteira, "Novo contato")])).toEqual({ motivo: "casa-no-pipeline", ocultar: true });
  });

  it("Perdido pela regra atual continua visível com contexto", () => {
    const a = anuncio("w", "Casa Em Condomínio Para Alugar", "Avenida Dos Pioneiros 1100", { portal: "wimoveis" });
    expect(situacao(a, [imovel("LD-31", "Avenida Dos Pioneiros, 1100", "Perdido")]).naCarteiraSemBloqueio?.[0].codigo).toBe("LD-31");
  });
});

describe("contador e shadow do R4.1a seguem a mesma regra", () => {
  const buscas = [{ id: "b", filtros: { portal: "chaves-na-mao" as const, cidade: "Londrina", estado: "PR", tipo: "Casa" } }];
  const candidatos: CandidatoPendenteRadar[] = [A_40323649, A_45365235].map((a) => ({ id: a.idExterno, buscaId: "b", anuncio: a }));

  it("LD-214 (Perdido) continua contando; LD-80 (Sem resposta) sai do contador", () => {
    const resumo = resumirPendenciasRadar(candidatos, buscas, [LD_214, LD_80]);
    expect([...resumo.ids]).toEqual(["40323649"]);
    for (const candidato of candidatos) {
      expect(resumo.ids.has(candidato.id)).toBe(!situacao(candidato.anuncio as AnuncioCentralAngariacao, [LD_214, LD_80]).ocultar);
    }
  });

  it("shadow: LD-80 passa a 'já reconhecido'; LD-214 segue como possível imóvel da carteira", () => {
    expect(avaliarPossivelImovelCarteira(A_45365235, [LD_80]).classe).toBe("ja_reconhecido_regra_atual");
    expect(avaliarPossivelImovelCarteira(A_40323649, [LD_214, LD_191])).toMatchObject({
      classe: "possivel_imovel_carteira",
      candidatos: [{ codigo: "LD-214" }],
    });
  });
});
