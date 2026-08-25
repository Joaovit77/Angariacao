/* Contrato do prompt que classifica a resposta do proprietário
   (lib/calculo/ia). O que estes testes prendem é o CONTEXTO da conversa: cada
   mensagem do WhatsApp é um evento separado, e classificar evento por evento é
   classificar pedaço de recado.

   O caso que originou isto é o LD-110 (03/08/2026): "Boa tarde" / "Por hora,
   não tenho interesse" / "Já está em negociação para venda" em três mensagens.
   Nenhuma encerra o imóvel sozinha, e o imóvel ficou em "Novo contato" com a
   recusa escrita no histórico. Também prende o LD-179 (17/08/2026), em que
   “o imóvel não está mais disponível” virou recusa, mas ficou sem motivo e não
   acionou o encerramento automático. */
import { describe, expect, it } from "vitest";
import {
  ESQUEMA_CLASSIFICACAO,
  MAX_MENSAGENS_CONTEXTO,
  MAX_TEXTO_CLASSIFICACAO,
  MOTIVOS_PERDA_IA,
  dataContextualDaResposta,
  desistenciaAluguelExplicita,
  exclusividadeVigenteExplicita,
  motivoPerdaSeguro,
  promptClassificarResposta,
} from "@/lib/calculo/ia";
import { MOTIVO_PERDA_IMOVEL_INDISPONIVEL, MOTIVOS_PERDA } from "@/lib/constantes";

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

  it("preserva a autoria e lê a mensagem do corretor que a resposta está continuando", () => {
    const prompt = promptClassificarResposta("Na quinta a gente se fala", HOJE, [
      { autor: "corretor", texto: "Fica confirmado para 04/09. Posso falar um dia antes." },
    ]);

    expect(prompt).toContain("Corretor: Fica confirmado para 04/09");
    expect(prompt).toContain("a pergunta respondida, uma data já confirmada");
    expect(prompt).toContain("pode apontar para a semana DESSA DATA");
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

  it("não confunde informação de venda com retirada da locação", () => {
    const prompt = promptClassificarResposta("Já está em negociação para venda", HOJE);
    expect(prompt).toContain("informar um preço de venda");
    expect(prompt).toContain("venda e locação podem coexistir");
    expect(prompt).toContain("Proprietário desistiu de alugar");
    expect(prompt).toContain("venda um milhão e meio");
    expect(prompt).toContain("a venda JÁ ESTÁ FECHADA");
  });

  it("mantém a porta aberta como null — recusa mole não encerra", () => {
    const prompt = promptClassificarResposta("qualquer coisa", HOJE);
    expect(prompt).toContain("se não vender penso em alugar");
    expect(prompt).toContain("Na dúvida, null.");
  });

  it("não trata a própria responsável como outro contato — o caso LD-247", () => {
    const prompt = promptClassificarResposta("Tenho sim", HOJE, ["Bom dia, sou a responsável"]);
    expect(prompt).toContain("ELA PRÓPRIA é responsável");
    expect(prompt).toContain('NÃO use "outro-contato"');
  });

  it("manda juntar data e hora quando o agendamento veio em mensagens separadas", () => {
    const prompt = promptClassificarResposta("Às 10h", HOJE, ["Pode ser quinta"]);
    expect(prompt).toContain("dividir o combinado em mensagens curtas");
    expect(prompt).toContain("MESMA data e a hora");
  });

  it("manda encerrar indisponibilidade definitiva sem inventar a causa — o caso LD-179", () => {
    const prompt = promptClassificarResposta("O imóvel não está mais disponível.", HOJE);
    expect(prompt).toContain(MOTIVO_PERDA_IMOVEL_INDISPONIVEL);
    expect(prompt).toContain("Use este motivo genérico em vez de inventar a causa");
  });
});

describe("dataContextualDaResposta", () => {
  it("ancora a quinta na semana da data confirmada pelo corretor — LD-152", () => {
    expect(
      dataContextualDaResposta("Na quinta a gente se fala", "2026-08-25", [
        {
          autor: "corretor",
          texto: "Perfeito, Silvia. Então fica confirmado para 04/09. Me fala o melhor horário para a visita, ou se preferir entro em contato um dia antes.",
        },
      ]),
    ).toBe("2026-09-03");
  });

  it("não força data quando a resposta nega, relativiza ou traz duas referências", () => {
    const contexto = [{ autor: "corretor" as const, texto: "Visita confirmada para 04/09." }];
    expect(dataContextualDaResposta("Na quinta não consigo", "2026-08-25", contexto)).toBeNull();
    expect(dataContextualDaResposta("Talvez na quinta a gente se fale", "2026-08-25", contexto)).toBeNull();
    expect(dataContextualDaResposta("Quinta ou sexta a gente se fala", "2026-08-25", contexto)).toBeNull();
  });

  it("ignora uma data citada apenas pelo proprietário, sem proposta do corretor", () => {
    expect(
      dataContextualDaResposta("Na quinta a gente se fala", "2026-08-25", [
        { autor: "proprietario", texto: "Talvez depois de 04/09." },
      ]),
    ).toBeNull();
  });
});

describe("motivoPerdaSeguro", () => {
  it("mantém o LD-152 aberto quando a proprietária informa apenas o preço de venda", () => {
    const classificacao = { resultado: "recusou", motivoPerda: "Proprietário desistiu de alugar" };

    expect(motivoPerdaSeguro(classificacao, "Venda hum milhão e meio")).toBeNull();
    expect(motivoPerdaSeguro(classificacao, "Venda por R$ 1.500.000")).toBeNull();
    expect(motivoPerdaSeguro(classificacao, "Também aceito proposta para venda")).toBeNull();
  });

  it.each([
    "Desisti de alugar o imóvel.",
    "Não vou mais alugar a casa.",
    "Somente venda.",
    "Vou morar neste imóvel.",
  ])("aceita desistência explícita da locação: %s", (texto) => {
    expect(desistenciaAluguelExplicita(texto)).toBe(true);
    expect(
      motivoPerdaSeguro(
        { resultado: "recusou", motivoPerda: "Proprietário desistiu de alugar" },
        texto,
      ),
    ).toBe("Proprietário desistiu de alugar");
  });

  it("não encerra uma recusa provisória mesmo quando ela menciona venda", () => {
    const texto = "Por enquanto não quero alugar, estou tentando vender.";
    expect(desistenciaAluguelExplicita(texto)).toBe(false);
    expect(
      motivoPerdaSeguro(
        { resultado: "recusou", motivoPerda: "Proprietário desistiu de alugar" },
        texto,
      ),
    ).toBeNull();
  });

  it("não encerra por outra imobiliária sem exclusividade", () => {
    expect(
      motivoPerdaSeguro(
        { resultado: "recusou", motivoPerda: "Optou por outra imobiliária" },
        "Já estou trabalhando com outra imobiliária.",
      ),
    ).toBeNull();
    expect(promptClassificarResposta("Já estou trabalhando com outra imobiliária.", HOJE))
      .toContain("NÃO é recusa");
  });

  it("reconhece exclusividade vigente explícita sem orientar quebra", () => {
    const texto = "Tenho contrato de exclusividade com eles até novembro.";
    expect(exclusividadeVigenteExplicita(texto)).toBe(true);
    expect(motivoPerdaSeguro({ resultado: "recusou", motivoPerda: "Optou por outra imobiliária" }, texto))
      .toBe("Optou por outra imobiliária");
    expect(promptClassificarResposta(texto, HOJE)).toContain("exclusividade vigente");
  });
  it("transforma a recusa explícita do LD-179 no motivo genérico", () => {
    expect(
      motivoPerdaSeguro(
        { resultado: "recusou", motivoPerda: null },
        "Bom dia. O imóvel não está mais disponível. Agradeço o interesse.",
      ),
    ).toBe(MOTIVO_PERDA_IMOVEL_INDISPONIVEL);
  });

  it("preserva um motivo específico válido devolvido pela IA", () => {
    expect(
      motivoPerdaSeguro(
        { resultado: "recusou", motivoPerda: "Imóvel já vendido" },
        "O imóvel não está mais disponível.",
      ),
    ).toBe("Imóvel já vendido");
  });

  it.each([
    ["respondeu", "O imóvel não está mais disponível."],
    ["recusou", "O imóvel não está mais disponível por enquanto."],
    ["recusou", "O imóvel ainda não está disponível."],
    ["recusou", "Esse horário não está mais disponível."],
  ])("não encerra quando o desfecho ou a frase deixam dúvida (%s)", (resultado, texto) => {
    expect(motivoPerdaSeguro({ resultado, motivoPerda: null }, texto)).toBeNull();
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
