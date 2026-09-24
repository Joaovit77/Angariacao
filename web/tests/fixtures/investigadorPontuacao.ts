/* ================================================================
   INVESTIGADOR (B3.1): fixtures de pontuação.

   Os casos A–F e J do plano do B3, escritos antes da implementação. Cada
   conjunto traz a entrada, os resultados como o servidor os monta
   (campos extraídos de título + descrição) e as duas ordens esperadas:
   `ordemB2` é a de hoje (faixa → contradições → evidências → título);
   `ordemB3`, a que o cliente passa a receber. Onde as duas são iguais, o
   score não tinha o que desempatar.
   ================================================================ */
import { extrairCamposInvestigacao, type ResultadoWebInvestigacao } from "@/lib/calculo/investigadorImoveis";

export function resultadoWeb(url: string, titulo: string, descricao = "", consultas = ["q"]): ResultadoWebInvestigacao {
  return {
    titulo,
    url,
    dominio: new URL(url).hostname.replace(/^www\./, ""),
    descricao,
    consultas,
    ...extrairCamposInvestigacao(`${titulo} ${descricao}`),
  };
}

export const ENTRADA_MICHIGAN = "Rua Michigan, 610, Jardim Presidente, Londrina, PR, Casa, 120 m², 3 quartos, 2 vagas";
export const ENTRADA_VIVERE = "Ed. Vivere Palhano, 79 m², 3 quartos, 2 vagas, Londrina";
export const ENTRADA_CAYOWAA = "Rua Cayowaá, 1500, Perdizes, São Paulo, SP, Casa";

export interface ConjuntoPontuacao {
  caso: string;
  entrada: string;
  resultados: ResultadoWebInvestigacao[];
  ordemB2: string[];
  ordemB3: string[];
}

export const CONJUNTOS_PONTUACAO: ConjuntoPontuacao[] = [
  {
    caso: "A. endereço + área/quartos/vagas acima de só endereço e do textual",
    entrada: ENTRADA_MICHIGAN,
    resultados: [
      resultadoWeb("https://portal-a.test/a1", "Casa à venda Rua Michigan, 610 - Jardim Presidente, Londrina", "120 m², 3 quartos, 2 vagas."),
      resultadoWeb("https://portal-b.test/a2", "Casas à venda no Jardim Presidente, Londrina - Rua Michigan", "Veja casas na região."),
      resultadoWeb("https://portal-c.test/a3", "Rua Michigan 610, Jardim Presidente, Londrina", "Imóvel residencial."),
    ],
    ordemB2: ["https://portal-a.test/a1", "https://portal-c.test/a3", "https://portal-b.test/a2"],
    ordemB3: ["https://portal-a.test/a1", "https://portal-c.test/a3", "https://portal-b.test/a2"],
  },
  {
    caso: "B. mesmo endereço, empate de hoje por contagem (termos) desfeito pelas características",
    entrada: ENTRADA_MICHIGAN,
    resultados: [
      resultadoWeb("https://portal-d.test/b1", "Casa na Rua Michigan, 610 - Jardim Presidente", "3 quartos."),
      resultadoWeb("https://portal-e.test/b2", "Rua Michigan 610", "Área 120 m², 2 vagas."),
      resultadoWeb("https://portal-f.test/b3", "Rua Michigan, 610", ""),
    ],
    ordemB2: ["https://portal-d.test/b1", "https://portal-e.test/b2", "https://portal-f.test/b3"],
    ordemB3: ["https://portal-e.test/b2", "https://portal-d.test/b1", "https://portal-f.test/b3"],
  },
  {
    caso: "C. mesmo empreendimento com características, sem endereço",
    entrada: ENTRADA_VIVERE,
    resultados: [
      resultadoWeb("https://portal-a.test/c1", "Ed. Vivere Palhano 79 m²", "3 quartos, 2 vagas."),
      resultadoWeb("https://portal-b.test/c2", "Apartamento Ed. Vivere Palhano", "3 quartos, Gleba Palhano."),
      resultadoWeb("https://portal-c.test/c3", "Ed. Vivere Palhano, apartamento", "Lazer completo."),
      resultadoWeb("https://portal-d.test/c4", "Apartamento Gleba Palhano 79 m² 3 quartos 2 vagas", ""),
    ],
    ordemB2: ["https://portal-a.test/c1", "https://portal-b.test/c2", "https://portal-d.test/c4", "https://portal-c.test/c3"],
    ordemB3: ["https://portal-a.test/c1", "https://portal-b.test/c2", "https://portal-d.test/c4", "https://portal-c.test/c3"],
  },
  {
    caso: "D. endereço certo + uma característica divergente: fica no topo da própria faixa, sem atravessá-la",
    entrada: ENTRADA_MICHIGAN,
    resultados: [
      resultadoWeb("https://portal-a.test/d1", "Casa Rua Michigan, 610 - Jardim Presidente", "120 m², 2 quartos, 2 vagas."),
      resultadoWeb("https://portal-b.test/d2", "Rua Michigan, 610", "4 quartos."),
      resultadoWeb("https://portal-c.test/d3", "Casa 3 quartos 2 vagas Jardim Presidente Londrina", ""),
      resultadoWeb("https://portal-d.test/d4", "Rua Michigan 610, Jardim Presidente, Londrina", "Imóvel residencial."),
    ],
    ordemB2: ["https://portal-d.test/d4", "https://portal-a.test/d1", "https://portal-b.test/d2", "https://portal-c.test/d3"],
    ordemB3: ["https://portal-d.test/d4", "https://portal-a.test/d1", "https://portal-b.test/d2", "https://portal-c.test/d3"],
  },
  {
    caso: "E. inconclusivos pobres continuam visíveis, no fim",
    entrada: ENTRADA_MICHIGAN,
    resultados: [
      resultadoWeb("https://portal-a.test/e0", "Casa à venda Rua Michigan, 610 - Jardim Presidente, Londrina", "120 m², 3 quartos, 2 vagas."),
      resultadoWeb("https://portal-b.test/e1", "Casas à venda em Jardim Presidente, Londrina", ""),
      resultadoWeb("https://portal-c.test/e2", "Imóveis em Londrina", ""),
    ],
    ordemB2: ["https://portal-a.test/e0", "https://portal-b.test/e1", "https://portal-c.test/e2"],
    ordemB3: ["https://portal-a.test/e0", "https://portal-b.test/e1", "https://portal-c.test/e2"],
  },
  {
    caso: "F. fontes diferentes com os mesmos dados não ganham bônus de domínio nem de corroboração",
    entrada: ENTRADA_MICHIGAN,
    resultados: [
      resultadoWeb("https://portal-a.test/f1", "Casa Rua Michigan, 610", "120 m², 3 quartos.", ["q1"]),
      // A mesma página com rastreio: o dedupe a une à primeira.
      resultadoWeb("https://portal-a.test/f1?utm_source=x", "Casa Rua Michigan, 610", "120 m², 3 quartos.", ["q2"]),
      resultadoWeb("https://portal-b.test/f2", "Rua Michigan 610 - casa", "120 m², 3 quartos."),
      resultadoWeb("https://portal-c.test/f3", "Casa na Rua Michigan, 610", "3 quartos, 2 vagas."),
    ],
    ordemB2: ["https://portal-c.test/f3", "https://portal-a.test/f1", "https://portal-b.test/f2"],
    ordemB3: ["https://portal-c.test/f3", "https://portal-a.test/f1", "https://portal-b.test/f2"],
  },
  {
    caso: "J. Garimpo sem memória: só a entrada pesa, como no Pipeline e no Radar",
    entrada: ENTRADA_CAYOWAA,
    resultados: [
      resultadoWeb("https://portal-a.test/g1", "Casa à venda Rua Cayowaá, 1500 - Perdizes", "180 m², 3 quartos, 2 vagas."),
      resultadoWeb("https://portal-b.test/g2", "Rua Cayowaá, 1500, Perdizes", "Sobrado 250 m², 4 quartos."),
      resultadoWeb("https://portal-c.test/g3", "Casa Rua Cayowaá 1500", ""),
      resultadoWeb("https://portal-d.test/g4", "Casas à venda em Perdizes, São Paulo", ""),
    ],
    ordemB2: ["https://portal-a.test/g1", "https://portal-b.test/g2", "https://portal-c.test/g3", "https://portal-d.test/g4"],
    ordemB3: ["https://portal-a.test/g1", "https://portal-b.test/g2", "https://portal-c.test/g3", "https://portal-d.test/g4"],
  },
];
