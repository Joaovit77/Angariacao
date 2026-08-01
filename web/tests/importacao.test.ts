/* Importação de planilha (lib/calculo/importacao) — a parte pura.

   O que estes testes guardam não é o parse: é o que uma importação em
   massa faz com o RESTO do sistema. Cadastro em lote é exatamente o que
   enche a base de registro sem endereço — que não geocodifica, fica
   fora do mapa, é invisível para a duplicidade, e mesmo assim ocupa
   linha no pipeline disparando `isStale` todo dia. */
import { describe, expect, it } from "vitest";
import {
  detectarDelimitador,
  lerCsv,
  lerData,
  lerImportacao,
  lerValor,
  mapearColunas,
  normalizarCabecalho,
  resumirImportacao,
} from "@/lib/calculo/importacao";
import type { Imovel } from "@/lib/tipos";

const CARTEIRA: Imovel[] = [
  { id: "a1", endereco: "Rua das Flores, 100", cidade: "Londrina", status: "Novo contato" },
];

const HOJE = "2026-08-01";

/** Envolve lerImportacao fixando `hoje` — o módulo não lê relógio. */
function imp(texto: string, carteira: Imovel[] = []) {
  return lerImportacao(texto, carteira, HOJE);
}

function csv(...linhas: string[]): string {
  return linhas.join("\n");
}

describe("lerCsv e delimitador", () => {
  it("elege o delimitador ignorando vírgula DENTRO de aspas", () => {
    /* O caso que quebra tudo em silêncio: endereço é "Rua X, 250", e
       contar vírgulas cru elegeria a vírgula num arquivo separado por
       ponto e vírgula — todas as colunas sairiam trocadas. */
    const texto = 'endereco;cidade\n"Rua X, 250";Londrina';
    expect(detectarDelimitador(texto)).toBe(";");
    expect(lerCsv(texto)[1]).toEqual(["Rua X, 250", "Londrina"]);
  });

  it("entende aspas duplicadas (RFC 4180)", () => {
    expect(lerCsv('a;b\n"diz ""oi""";x')[1]).toEqual(['diz "oi"', "x"]);
  });

  it("engole o BOM do Excel", () => {
    // Sem isso o BOM vira parte do primeiro cabeçalho e nenhuma coluna
    // é reconhecida — o corretor vê "0 imóveis" sem explicação.
    const comBom = "﻿endereco;cidade\nRua A;Londrina";
    expect(mapearColunas(lerCsv(comBom)[0]).endereco).toBe(0);
  });

  it("descarta linha totalmente vazia", () => {
    expect(lerCsv("a;b\nx;y\n\n").length).toBe(2);
  });
});

describe("mapearColunas", () => {
  it("reconhece cabeçalho com acento, maiúscula e pontuação", () => {
    const mapa = mapearColunas(["Endereço", "PROPRIETÁRIO", "Tel.", "Valor do Aluguel"]);
    expect(mapa.endereco).toBe(0);
    expect(mapa.proprietarioNome).toBe(1);
    expect(mapa.proprietarioTelefone).toBe(2);
    expect(mapa.valorAluguel).toBe(3);
  });

  it("normaliza para a mesma forma", () => {
    expect(normalizarCabecalho("Endereço")).toBe(normalizarCabecalho("ENDERECO"));
  });

  it("a primeira coluna que casa vence", () => {
    // "Telefone" e "Telefone 2": vale a primeira.
    expect(mapearColunas(["telefone", "telefone2"]).proprietarioTelefone).toBe(0);
  });

  it("coluna desconhecida não vira campo, e é reportada", () => {
    const r = imp(csv("endereco;matricula", "Rua B;12345"));
    expect(r.colunasIgnoradas).toEqual(["matricula"]);
    expect(r.colunasReconhecidas).toContain("endereco");
  });
});

describe("lerValor", () => {
  it("tira o milhar ANTES de trocar a vírgula decimal", () => {
    /* Invertido, "1.850,00" viraria 1.85 — mil e oitocentos entrando
       como um e oitenta e cinco, sem erro nenhum, envenenando comissão
       e faturamento. */
    expect(lerValor("R$ 1.850,00")).toBe(1850);
    expect(lerValor("2.500")).toBe(2500);
    expect(lerValor("1850")).toBe(1850);
  });

  it("sem número devolve null, não zero", () => {
    expect(lerValor("")).toBeNull();
    expect(lerValor("a combinar")).toBeNull();
    expect(lerValor("0")).toBeNull();
  });
});

describe("lerImportacao", () => {
  it("linha sem endereço não entra", () => {
    // Registro sem endereço não geocodifica, some do mapa, é invisível
    // para a duplicidade — e ainda cobra o corretor no pipeline.
    const r = imp(csv("endereco;nome", ";João"));
    expect(r.linhas[0].imovel).toBeNull();
    expect(r.linhas[0].problemas).toEqual(["sem-endereco"]);
  });

  it("recusa duplicata da carteira", () => {
    const r = imp(csv("endereco;cidade", "RUA DAS FLORES 100;londrina"), CARTEIRA);
    expect(r.linhas[0].imovel).toBeNull();
    expect(r.linhas[0].problemas).toEqual(["duplicada-na-carteira"]);
  });

  it("recusa repetida DENTRO do próprio arquivo", () => {
    /* A segunda checagem, que só existe porque planilha de verdade tem
       linha repetida. Sem ela, a importação criaria justamente a
       duplicata que o ModalImovel passa o tempo todo evitando. */
    const r = imp(csv("endereco;cidade", "Rua Nova, 5;Londrina", "Rua Nova, 5;Londrina"));
    expect(r.linhas[0].imovel).not.toBeNull();
    expect(r.linhas[1].imovel).toBeNull();
    expect(r.linhas[1].problemas).toEqual(["repetida-no-arquivo"]);
  });

  it("unidade diferente no mesmo prédio NÃO é duplicata", () => {
    // A identidade inclui unidade/bloco: ap 101 e ap 202 são imóveis
    // diferentes, e tratá-los como um só perderia metade do prédio.
    const r = imp(csv("endereco;unidade", "Rua X, 250;101", "Rua X, 250;202"));
    expect(r.linhas.every((l) => l.imovel !== null)).toBe(true);
  });

  it("telefone ilegível não derruba a linha, mas não entra", () => {
    /* Imóvel sem telefone é trabalhável; imóvel com telefone ERRADO
       manda mensagem para um estranho. */
    const r = imp(csv("endereco;telefone", "Rua C;não tem"));
    expect(r.linhas[0].imovel).not.toBeNull();
    expect(r.linhas[0].imovel?.proprietarioTelefone).toBeNull();
    expect(r.linhas[0].problemas).toEqual(["telefone-ignorado"]);
  });

  it("telefone válido entra como foi digitado", () => {
    const r = imp(csv("endereco;telefone", "Rua D;(43) 99802-4316"));
    expect(r.linhas[0].imovel?.proprietarioTelefone).toBe("(43) 99802-4316");
  });

  it("TUDO entra como Novo contato, mesmo com coluna de status", () => {
    /* A regra que protege as métricas: um "Locado" importado somaria à
       conversão, à comissão e à meta do mês um negócio que nunca
       aconteceu aqui — e sem data não há o que pôr no statusHistory.
       Mesma regra do desdobramento, em que a unidade nunca nasce
       "Locado". A coluna "status" nem é reconhecida. */
    const r = imp(csv("endereco;status", "Rua E;Locado"));
    expect(r.linhas[0].imovel?.status).toBe("Novo contato");
    expect(r.colunasReconhecidas).not.toContain("status");
  });

  it("arquivo só com cabeçalho não produz nada", () => {
    expect(imp("endereco;cidade").linhas).toEqual([]);
  });

  it("texto vazio não quebra", () => {
    expect(imp("").linhas).toEqual([]);
  });
});

describe("resumirImportacao", () => {
  it("conta cada motivo separadamente", () => {
    const r = imp(
      csv(
        "endereco;cidade;telefone",
        "Rua Nova, 5;Londrina;43998024316",
        ";Londrina;43998024316", // sem endereço
        "RUA DAS FLORES 100;Londrina;", // duplicata da carteira
        "Rua Nova, 5;Londrina;", // repetida no arquivo
        "Rua Outra, 9;Londrina;abc", // telefone ilegível
      ),
      CARTEIRA,
    );
    const resumo = resumirImportacao(r.linhas);
    expect(resumo).toEqual({
      total: 5,
      entram: 2,
      semEndereco: 1,
      duplicadasNaCarteira: 1,
      repetidasNoArquivo: 1,
      semTelefone: 1,
    });
  });
});

describe("data de angariação — a coluna que salva a coorte", () => {
  it("usa a data da planilha quando ela existe", () => {
    /* `imoveisContatadosNoMes` conta por `dataAngariacao`. Sem esta
       coluna, importar 200 imóveis carimbaria todos com hoje e o painel
       anunciaria "200 contatados este mês" — falso, e estragando a
       coorte, a meta e o relatório do mês. */
    const r = imp(csv("endereco;data", "Rua F;10/07/2026"));
    expect(r.linhas[0].imovel?.dataAngariacao).toBe("2026-07-10");
  });

  it("aceita ISO e dd-mm-aaaa", () => {
    expect(imp(csv("endereco;data", "Rua G;2026-07-10")).linhas[0].imovel?.dataAngariacao).toBe("2026-07-10");
    expect(imp(csv("endereco;data", "Rua H;10-07-2026")).linhas[0].imovel?.dataAngariacao).toBe("2026-07-10");
  });

  it("dd/mm NÃO é lido como mm/dd", () => {
    // `new Date("10/07/2026")` leria outubro. É por isso que a leitura é
    // por string, e por isso `lib/datas.ts` monopoliza o Date.
    expect(lerData("10/07/2026")).toBe("2026-07-10");
  });

  it("ano de dois dígitos é recusado, não adivinhado", () => {
    // "10/07/26" pode ser 1926 ou 2026; o palpite errado joga o imóvel
    // num mês que nenhuma tela mostra.
    expect(lerData("10/07/26")).toBeNull();
  });

  it("data impossível não passa", () => {
    expect(lerData("32/13/2026")).toBeNull();
    expect(lerData("qualquer coisa")).toBeNull();
  });

  it("sem coluna de data, cai em hoje", () => {
    expect(imp(csv("endereco", "Rua I")).linhas[0].imovel?.dataAngariacao).toBe(HOJE);
  });

  it("statusHistory nasce VAZIO — importar não é transição", () => {
    /* Uma entrada carimbada com hoje afirmaria uma mudança de status que
       não aconteceu. O motor já trata histórico vazio caindo em
       `dataAngariacao` (ver `currentStatusSince`). */
    expect(imp(csv("endereco", "Rua J")).linhas[0].imovel?.statusHistory).toEqual([]);
  });
});
