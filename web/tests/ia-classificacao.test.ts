/* Contrato do prompt que classifica a resposta do proprietário
   (lib/calculo/ia). O que estes testes prendem é o CONTEXTO da conversa: cada
   mensagem do WhatsApp é um evento separado, e classificar evento por evento é
   classificar pedaço de recado.

   O caso que originou isto é o LD-110 (03/08/2026): "Boa tarde" / "Por hora,
   não tenho interesse" / "Já está em negociação para venda" em três mensagens.
   Nenhuma encerra o imóvel sozinha, e o imóvel ficou em "Novo contato" com a
   recusa escrita no histórico. */
import { describe, expect, it } from "vitest";
import {
  ESQUEMA_CLASSIFICACAO,
  MAX_MENSAGENS_CONTEXTO,
  MAX_TEXTO_CLASSIFICACAO,
  MOTIVOS_PERDA_IA,
  promptClassificarResposta,
} from "@/lib/calculo/ia";
import { MOTIVOS_PERDA } from "@/lib/constantes";

const HOJE = "2026-08-03";

describe("promptClassificarResposta", () => {
  it("delimita a mensagem e a trunca no teto", () => {
    const gigante = "x".repeat(MAX_TEXTO_CLASSIFICACAO + 200);
    const prompt = promptClassificarResposta(gigante, HOJE);
    expect(prompt).toContain('"""');
    expect(prompt).toContain("x".repeat(MAX_TEXTO_CLASSIFICACAO));
    expect(prompt).not.toContain("x".repeat(MAX_TEXTO_CLASSIFICACAO + 1));
  });

  it("sem mensagens anteriores, não inventa bloco de contexto", () => {
    const prompt = promptClassificarResposta("Já aluguei", HOJE);
    expect(prompt).not.toContain("já tinha escrito");
  });

  it("inclui as mensagens anteriores dele — o caso LD-110", () => {
    const prompt = promptClassificarResposta("Já está em negociação para venda", HOJE, [
      "Boa tarde",
      "Por hora, não tenho interesse",
    ]);
    expect(prompt).toContain("Por hora, não tenho interesse");
    expect(prompt).toContain("Já está em negociação para venda");
  });

  it("manda classificar a MAIS RECENTE, com as anteriores só desambiguando", () => {
    const prompt = promptClassificarResposta("Já está em negociação para venda", HOJE, ["Boa tarde"]);
    // Sem isto, a IA classificaria de novo uma mensagem já classificada — e
    // poderia encerrar o imóvel por causa do que ele disse semana passada.
    expect(prompt).toContain("mais recente");
    expect(prompt).toContain("não encerre o imóvel por causa de uma mensagem antiga");
  });

  it("limita o contexto a MAX_MENSAGENS_CONTEXTO, mantendo as mais recentes", () => {
    const antigas = Array.from({ length: MAX_MENSAGENS_CONTEXTO + 3 }, (_, i) => `mensagem ${i}`);
    const prompt = promptClassificarResposta("e aí?", HOJE, antigas);
    expect(prompt).not.toContain("mensagem 0");
    expect(prompt).toContain(`mensagem ${MAX_MENSAGENS_CONTEXTO + 2}`);
  });

  it("descarta anteriores vazias em vez de virar linha em branco", () => {
    const prompt = promptClassificarResposta("ok", HOJE, ["   ", ""]);
    expect(prompt).not.toContain("já tinha escrito");
  });

  it("cobre 'vai vender em vez de alugar', que não tinha rótulo nenhum", () => {
    /* A segunda metade do LD-110: mesmo lendo a conversa inteira, a IA não
       tinha em que balde pôr "está em negociação para venda" — "Imóvel já
       vendido" é falso (não vendeu) e os outros não falam de venda. Sem rótulo,
       motivoPerda saía null e o imóvel não encerrava. */
    const prompt = promptClassificarResposta("Já está em negociação para venda", HOJE);
    expect(prompt).toContain("negociação para venda");
    expect(prompt).toContain("Proprietário desistiu de alugar");
    // E a distinção com "Imóvel já vendido" precisa estar escrita: senão a IA
    // marca venda fechada onde há só negociação.
    expect(prompt).toContain("a venda JÁ ESTÁ FECHADA");
  });

  it("mantém a porta aberta como null — recusa mole não encerra", () => {
    const prompt = promptClassificarResposta("qualquer coisa", HOJE);
    expect(prompt).toContain("se não vender penso em alugar");
    expect(prompt).toContain("Na dúvida, null.");
  });
});

describe("MOTIVOS_PERDA_IA", () => {
  it("todo motivo que a IA pode aplicar existe no seletor do cadastro", () => {
    // Se não existisse, o <select> do ModalImovel abriria sem a opção que o
    // webhook acabou de gravar, e o corretor veria um motivo que não dá para
    // reescolher.
    for (const m of MOTIVOS_PERDA_IA) expect(MOTIVOS_PERDA).toContain(m);
  });

  it("o esquema aceita exatamente esses motivos, mais null", () => {
    expect(ESQUEMA_CLASSIFICACAO.properties.motivoPerda.enum).toEqual([...MOTIVOS_PERDA_IA, null]);
  });
});
