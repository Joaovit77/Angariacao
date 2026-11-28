/* ================================================================
   ATRIBUIÇÃO DE MENSAGEM POR ENDEREÇO / EDIFÍCIO / UNIDADE / BAIRRO

   O proprietário não conhece o código interno ("LD-464") do CRM; no WhatsApp
   ele fala a rua ("o da Achiro Kawasaki"), o edifício ("o do Solar"), o
   apartamento ("o ap 202") ou o bairro ("o do Centro").

   Estes testes cobrem tanto o reconhecimento natural quanto as travas
   conservadoras contra falso positivo (mesma rua sem número/unidade continua
   em empate `pendente`; datas/horas nunca casam unidade).
   ================================================================ */
import { describe, expect, it } from "vitest";

import {
  referenciaPorEndereco,
  resolverAtribuicaoMensagem,
  type ImovelParaAtribuicao,
} from "@/lib/calculo/atribuicaoMensagem";

const USER = "user-1";
const CONTATO = "contato-1";
const RECEBIDA = "2026-11-28T09:30";

function imovel(id: string, extra: Partial<ImovelParaAtribuicao> = {}): ImovelParaAtribuicao {
  return {
    id,
    userId: USER,
    codigo: `LD-${id}`,
    status: "Angariado",
    retirado: false,
    ...extra,
  };
}

function resolver(vinculos: ImovelParaAtribuicao[], texto: string) {
  return resolverAtribuicaoMensagem({
    userId: USER,
    contatoId: CONTATO,
    mensagem: { texto, recebidaEm: RECEBIDA },
    vinculos,
  });
}

describe("referenciaPorEndereco e N1 por localização", () => {
  const carteiraMulti = [
    imovel("200", {
      codigo: "LD-200",
      endereco: "Rua Achiro Kawasaki, 641",
      bairro: "Jardim Tókio",
    }),
    imovel("202", {
      codigo: "LD-202",
      endereco: "Rua Yoshikawa Koji, 750",
      bairro: "Jardim Tókio",
    }),
    imovel("334", {
      codigo: "LD-334",
      endereco: "Rua Raposo Tavares, 79 A",
      bairro: "Centro",
    }),
  ];

  it("resolve pelo nome completo da rua (com ou sem 'Rua')", () => {
    expect(resolver(carteiraMulti, "Já aluguei o da Rua Achiro Kawasaki por conta própria")).toMatchObject({
      ok: true,
      imovelId: "200",
      nivel: "referencia-explicita",
      evidencia: { tipo: "endereco", criterio: "logradouro" },
    });
    expect(resolver(carteiraMulti, "O da Yoshikawa Koji vendi ontem")).toMatchObject({
      ok: true,
      imovelId: "202",
      nivel: "referencia-explicita",
    });
  });

  it("resolve pelo sobrenome/token distintivo da rua ('o da Kawasaki')", () => {
    expect(resolver(carteiraMulti, "Já aluguei o da Kawasaki")).toMatchObject({
      ok: true,
      imovelId: "200",
      nivel: "referencia-explicita",
      evidencia: { tipo: "endereco", criterio: "logradouro" },
    });
  });

  it("resolve ruas parecidas com sufixos distintos (caso do smoke: Rua Teste C3B Um vs Dois)", () => {
    const smoke = [
      imovel("464", { codigo: "LD-464", endereco: "Rua Teste C3B Um, 101", bairro: "Centro" }),
      imovel("465", { codigo: "LD-465", endereco: "Rua Teste C3B Dois, 202", bairro: "Centro" }),
    ];
    expect(resolver(smoke, "Já aluguei o da Rua Teste C3B Um por conta própria")).toMatchObject({
      ok: true,
      imovelId: "464",
      nivel: "referencia-explicita",
    });
    expect(resolver(smoke, "Já aluguei o da Rua Teste C3B Dois")).toMatchObject({
      ok: true,
      imovelId: "465",
      nivel: "referencia-explicita",
    });
    // Sem citar a rua, continua empate pendente!
    expect(resolver(smoke, "Já aluguei por conta própria")).toMatchObject({
      ok: false,
      motivo: "pendente",
    });
  });

  it("resolve pelo edifício/condomínio", () => {
    const predios = [
      imovel("a", { endereco: "Av. Higienópolis, 100", edificio: "Edifício Solar das Flores", bairro: "Centro" }),
      imovel("b", { endereco: "Av. Higienópolis, 500", edificio: "Residencial Araucária", bairro: "Centro" }),
    ];
    expect(resolver(predios, "O do Solar das Flores já aluguei")).toMatchObject({
      ok: true,
      imovelId: "a",
      nivel: "referencia-explicita",
      evidencia: { tipo: "endereco", criterio: "edificio" },
    });
  });

  it("mesma rua sem número nem unidade continua em empate (nunca chuta)", () => {
    const mesmaRua = [
      imovel("a", { endereco: "Rua Raposo Tavares, 79", unidade: "101", bairro: "Centro" }),
      imovel("b", { endereco: "Rua Raposo Tavares, 79", unidade: "202", bairro: "Centro" }),
    ];
    expect(resolver(mesmaRua, "Já aluguei o da Raposo Tavares")).toMatchObject({
      ok: false,
      motivo: "pendente",
      nivelEmpate: "referencia-explicita",
    });
    // Com a unidade explícita, desempata com segurança!
    expect(resolver(mesmaRua, "Já aluguei o da Raposo Tavares ap 202")).toMatchObject({
      ok: true,
      imovelId: "b",
      nivel: "referencia-explicita",
    });
  });

  it("mesma rua com números de porta diferentes desempata quando o número é citado", () => {
    const mesmaRua = [
      imovel("a", { endereco: "Rua Raposo Tavares, 79", bairro: "Centro" }),
      imovel("b", { endereco: "Rua Raposo Tavares, 450", bairro: "Centro" }),
    ];
    expect(resolver(mesmaRua, "O da Raposo Tavares 450 já foi alugado")).toMatchObject({
      ok: true,
      imovelId: "b",
      nivel: "referencia-explicita",
    });
  });

  it("resolve por bairro único entre os imóveis do proprietário e dá empate se dois estão no mesmo bairro", () => {
    // Só LD-334 está no Centro -> resolve!
    expect(resolver(carteiraMulti, "Já aluguei o do Centro")).toMatchObject({
      ok: true,
      imovelId: "334",
      nivel: "referencia-explicita",
      evidencia: { tipo: "endereco", criterio: "bairro" },
    });
    // LD-200 e LD-202 estão no Jardim Tókio -> NÃO resolve por bairro, cai em pendente!
    expect(resolver(carteiraMulti, "Já aluguei o do Jardim Tókio")).toMatchObject({
      ok: false,
      motivo: "pendente",
    });
  });

  it("não confunde datas, horas ou valores com unidade ou número de porta", () => {
    const comUnidades = [
      imovel("a", { endereco: "Rua Alpha, 10", unidade: "10", bairro: "Centro" }),
      imovel("b", { endereco: "Rua Beta, 15", unidade: "15", bairro: "Centro" }),
    ];
    expect(referenciaPorEndereco("Pode ser dia 10 às 10h por R$ 1500", comUnidades)).toEqual({
      ok: false,
      empate: false,
    });
    expect(resolver(comUnidades, "Pode ser dia 10 às 10h")).toMatchObject({
      ok: false,
      motivo: "pendente",
    });
  });
});
