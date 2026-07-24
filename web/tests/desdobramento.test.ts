/* Desdobramento: um espaço captado que vira várias unidades (lib/calculo/
   desdobramento + o corte de esforço em lib/calculo/motor).

   Feature nova da pós-migração — não há oráculo do app antigo. O que os
   testes prendem é o contrato que a feature existe para sustentar: as
   unidades entram na CARTEIRA e ficam fora da contagem de CAPTAÇÃO. Perder
   esse corte transformaria o botão num multiplicador de meta. */
import { describe, expect, it } from "vitest";
import {
  motivoNaoPodeDesdobrar,
  podeDesdobrar,
  statusDaUnidade,
  textoNotaDesdobramento,
  unidadeDesdobrada,
  type EspecificacaoUnidade,
} from "@/lib/calculo/desdobramento";
import {
  ehUnidadeDesdobrada,
  imoveisAngariadosNoMes,
  imoveisContatadosNoMes,
  imoveisDeCaptacao,
  imoveisLocadosNoMes,
  tempoAteLocacao,
  unidadesDesdobradas,
} from "@/lib/calculo/motor";
import type { Imovel } from "@/lib/tipos";

/** O galpão do caso real: captado em julho, com uma tentativa registrada. */
function galpao(over: Partial<Imovel> = {}): Imovel {
  return {
    id: "galpao",
    codigo: "LD-01",
    endereco: "Rua Souza Naves, 1200",
    bairro: "Centro",
    cidade: "Londrina",
    tipo: "Galpão",
    valorAluguel: 9000,
    proprietarioNome: "Marta",
    proprietarioTelefone: "(43) 99802-4316",
    formaAbordagem: "WhatsApp",
    origemImovel: "Placa no imóvel",
    responsavel: "João",
    latitude: -23.31,
    longitude: -51.16,
    dataAngariacao: "2026-07-02",
    status: "Angariado",
    statusHistory: [
      { status: "Novo contato", date: "2026-07-02" },
      { status: "Angariado", date: "2026-07-10" },
    ],
    tentativas: [
      { id: "t1", data: "2026-07-02T10:00", canal: "WhatsApp", resultado: "respondeu", abordagemId: "ab-1" },
    ],
    notas: [{ id: "n1", texto: "Aceita dividir em salas", data: "2026-07-02T10:05" }],
    ...over,
  };
}

const SALA: EspecificacaoUnidade = {
  unidade: "Sala 1",
  tipo: "Sala Comercial",
  codigo: "LD-02",
  valorAluguel: 2500,
  valorCondominio: 300,
};

describe("quando dá para desdobrar", () => {
  it("libera o imóvel já angariado", () => {
    expect(podeDesdobrar(galpao())).toBe(true);
  });

  it("recusa antes de angariar — as unidades seriam imóveis que talvez nunca existam", () => {
    const emNegociacao = galpao({ status: "Em negociação", statusHistory: [{ status: "Novo contato", date: "2026-07-02" }] });
    expect(motivoNaoPodeDesdobrar(emNegociacao)).toContain("Desdobre depois de angariar");
  });

  it("recusa saída lateral: não há negócio a dividir", () => {
    expect(podeDesdobrar(galpao({ status: "Perdido" }))).toBe(false);
    expect(podeDesdobrar(galpao({ status: "Sem resposta" }))).toBe(false);
  });

  it("recusa desdobrar uma unidade — o vínculo não vira corrente", () => {
    const sala = galpao({ id: "sala", imovelPrincipalId: "galpao" });
    expect(motivoNaoPodeDesdobrar(sala)).toContain("já é uma unidade");
  });
});

describe("a unidade criada", () => {
  const principal = galpao();
  const sala = unidadeDesdobrada(principal, SALA, "sala-1");

  it("aponta para o principal e é reconhecida como unidade", () => {
    expect(sala.imovelPrincipalId).toBe("galpao");
    expect(ehUnidadeDesdobrada(sala)).toBe(true);
    expect(ehUnidadeDesdobrada(principal)).toBe(false);
  });

  it("herda endereço, proprietário e localização", () => {
    expect(sala.endereco).toBe(principal.endereco);
    expect(sala.cidade).toBe(principal.cidade);
    expect(sala.proprietarioTelefone).toBe(principal.proprietarioTelefone);
    expect(sala.latitude).toBe(principal.latitude);
  });

  it("herda canal e origem — a oportunidade apareceu uma vez só", () => {
    // Zerar jogaria a unidade no balde "Não informado" dos rankings, sujando
    // uma leitura que o principal já responde certo.
    expect(sala.formaAbordagem).toBe("WhatsApp");
    expect(sala.origemImovel).toBe("Placa no imóvel");
  });

  it("fica com tipo, unidade e valores próprios", () => {
    expect(sala.tipo).toBe("Sala Comercial");
    expect(sala.unidade).toBe("Sala 1");
    expect(sala.valorAluguel).toBe(2500);
    expect(sala.codigo).toBe("LD-02");
  });

  it("NÃO herda tentativas nem notas — duplicá-las inflaria o ranking de abordagens", () => {
    expect(sala.tentativas).toEqual([]);
    expect(sala.notas).toEqual([]);
  });

  it("herda o histórico de status: é a mesma captação", () => {
    expect(sala.statusHistory).toEqual(principal.statusHistory);
    expect(sala.dataAngariacao).toBe("2026-07-02");
  });

  it("copia o histórico em vez de compartilhar o array", () => {
    // Compartilhar faria uma mudança de status na sala reescrever o do galpão.
    expect(sala.statusHistory).not.toBe(principal.statusHistory);
  });

  it("o tempo até a locação mede o negócio inteiro, da conversa ao contrato", () => {
    const locada: Imovel = {
      ...sala,
      status: "Locado",
      statusHistory: [...(sala.statusHistory || []), { status: "Locado", date: "2026-08-01" }],
    };
    expect(tempoAteLocacao(locada)).toBe(30); // 2026-07-02 -> 2026-08-01
  });

  it("nunca nasce Locado, nem quando o principal está", () => {
    // Somaria à conversão, ao faturamento e à comissão um negócio inexistente.
    expect(statusDaUnidade(galpao({ status: "Locado" }))).toBe("Angariado");
    expect(unidadeDesdobrada(galpao({ status: "Locado" }), SALA, "x").status).toBe("Angariado");
  });

  it("herda o status do principal nos demais casos", () => {
    expect(unidadeDesdobrada(galpao({ status: "Publicado" }), SALA, "x").status).toBe("Publicado");
  });
});

describe("carteira sim, captação não", () => {
  const principal = galpao();
  const salas = [1, 2, 3].map((n) =>
    unidadeDesdobrada(principal, { ...SALA, unidade: `Sala ${n}`, codigo: `LD-0${n + 1}` }, `sala-${n}`),
  );
  const carteira = [principal, ...salas];

  it("uma conversa ganha conta UMA angariação, não quatro", () => {
    expect(carteira).toHaveLength(4);
    expect(imoveisAngariadosNoMes(carteira, "2026-07")).toHaveLength(1);
    expect(imoveisAngariadosNoMes(carteira, "2026-07")[0].id).toBe("galpao");
  });

  it("também não multiplica o topo do funil", () => {
    expect(imoveisContatadosNoMes(carteira, "2026-07")).toHaveLength(1);
  });

  it("mas a locação de cada unidade conta inteira — é contrato e comissão de verdade", () => {
    const comUmaLocada = carteira.map((i) =>
      i.id === "sala-2"
        ? {
            ...i,
            status: "Locado",
            statusHistory: [...(i.statusHistory || []), { status: "Locado", date: "2026-08-05" }],
          }
        : i,
    );
    expect(imoveisLocadosNoMes(comUmaLocada, "2026-08")).toHaveLength(1);
  });

  it("imoveisDeCaptacao devolve só os principais", () => {
    expect(imoveisDeCaptacao(carteira).map((i) => i.id)).toEqual(["galpao"]);
  });

  it("unidadesDesdobradas lista as filhas de um principal", () => {
    expect(unidadesDesdobradas(carteira, "galpao")).toHaveLength(3);
    expect(unidadesDesdobradas(carteira, "sala-1")).toHaveLength(0);
  });

  it("carteira sem desdobramento não muda de comportamento", () => {
    const soPrincipais = [galpao({ id: "a" }), galpao({ id: "b" })];
    expect(imoveisAngariadosNoMes(soPrincipais, "2026-07")).toHaveLength(2);
  });
});

describe("textoNotaDesdobramento", () => {
  it("lista as unidades criadas", () => {
    const specs = [
      { ...SALA, unidade: "Sala 1" },
      { ...SALA, unidade: "Sala 2" },
    ];
    expect(textoNotaDesdobramento(specs)).toBe("Imóvel desdobrado em 2 unidades: Sala 1, Sala 2.");
  });

  it("concorda no singular", () => {
    expect(textoNotaDesdobramento([SALA])).toBe("Imóvel desdobrado em 1 unidade: Sala 1.");
  });
});
