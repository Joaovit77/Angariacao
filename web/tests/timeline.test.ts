/* Contrato da linha do tempo da angariação (lib/calculo/timeline).

   O que estes testes protegem:

   1. **A duplicata.** A assinatura existe em três lugares ao mesmo tempo
      (statusHistory, campo `autorizacaoAssinadaEm` e nota `sophia:`), e três
      linhas dizendo a mesma coisa é o que faz uma tela deixar de ser lida.
   2. **A data certa.** Quando o evento chega atrasado, o `statusHistory`
      guarda o dia em que o painel SOUBE e o campo guarda o dia em que a coisa
      ACONTECEU. Numa linha do tempo quem manda é o fato.
   3. **O que fica de fora.** Tentativas e respostas não entram — é a lição da
      faixa de "imóvel parado" no termômetro. */
import { describe, expect, it } from "vitest";
import { timelineDaAngariacao } from "@/lib/calculo/timeline";
import { STATUS_AUTORIZACAO_ASSINADA } from "@/lib/constantes";
import type { Imovel } from "@/lib/tipos";

function imovel(over: Partial<Imovel> = {}): Imovel {
  return {
    id: "i1",
    endereco: "Rua José Francisco Pereira, 800",
    status: "Locado",
    dataAngariacao: "2026-07-20",
    statusHistory: [
      { status: "Novo contato", date: "2026-07-20" },
      { status: "Angariado", date: "2026-07-21" },
      { status: STATUS_AUTORIZACAO_ASSINADA, date: "2026-07-25" },
      { status: "Locado", date: "2026-08-06" },
    ],
    ...over,
  };
}

describe("timelineDaAngariacao", () => {
  it("monta o exemplo do corretor, em ordem", () => {
    const t = timelineDaAngariacao(
      imovel({
        autorizacaoAssinadaEm: "2026-07-22",
        locadoEm: "2026-08-05",
        contratoNumero: "C-9912",
        comissaoRecebida: true,
        comissaoRecebidaData: "2026-08-15",
        comissaoRecebidaValor: 1920,
      }),
    );
    expect(t.map((m) => [m.data, m.titulo])).toEqual([
      ["2026-07-20", "Angariação criada"],
      ["2026-07-21", "Imóvel angariado"],
      ["2026-07-22", "Proprietário assinou a autorização de locação"],
      ["2026-08-05", "Imóvel locado"],
      ["2026-08-15", "Comissão recebida"],
    ]);
  });

  it("a data do FATO vence a data em que o painel soube", () => {
    // O statusHistory diz 25/07 (quando o evento chegou); o campo diz 22/07
    // (quando o proprietário assinou). A linha do tempo conta a história do
    // negócio, não a do nosso servidor.
    const t = timelineDaAngariacao(imovel({ autorizacaoAssinadaEm: "2026-07-22" }));
    const assinatura = t.find((m) => m.titulo.includes("assinou"));
    expect(assinatura?.data).toBe("2026-07-22");
    expect(assinatura?.fonte).toBe("sistema-principal");
  });

  it("sem o campo, cai na data do statusHistory e não se diz do sistema", () => {
    const t = timelineDaAngariacao(imovel());
    const assinatura = t.find((m) => m.titulo.includes("assinou"));
    expect(assinatura?.data).toBe("2026-07-25");
    expect(assinatura?.fonte).toBe("funil");
  });

  it("NÃO duplica a assinatura, mesmo com etapa e campo preenchidos", () => {
    const t = timelineDaAngariacao(imovel({ autorizacaoAssinadaEm: "2026-07-22" }));
    expect(t.filter((m) => m.titulo.includes("assinou"))).toHaveLength(1);
  });

  it("mostra o fato mesmo quando a etapa NÃO entrou no histórico", () => {
    // Caso real: o imóvel já estava em "Locado" quando a assinatura chegou. O
    // status não anda para trás, mas o fato é gravado — e sem esta varredura
    // a data ficaria no banco, invisível na única tela feita para mostrá-la.
    const t = timelineDaAngariacao(
      imovel({
        statusHistory: [
          { status: "Novo contato", date: "2026-07-20" },
          { status: "Locado", date: "2026-08-06" },
        ],
        autorizacaoAssinadaEm: "2026-07-22",
      }),
    );
    expect(t.some((m) => m.titulo.includes("assinou"))).toBe(true);
  });

  it("não repete o cadastro como primeira etapa do funil no mesmo dia", () => {
    // Cadastrar já põe o imóvel em "Novo contato": as duas linhas descreveriam
    // o mesmo clique, e a lista abriria se repetindo.
    const t = timelineDaAngariacao(imovel());
    expect(t.filter((m) => m.data === "2026-07-20")).toHaveLength(1);
    expect(t[0].titulo).toBe("Angariação criada");
  });

  it("mas MANTÉM 'Novo contato' quando ele é posterior ao cadastro", () => {
    // Imóvel importado: o cadastro é de hoje e a entrada no funil tem a data
    // antiga da planilha. Aí são dois acontecimentos distintos.
    const t = timelineDaAngariacao(
      imovel({
        dataAngariacao: "2026-07-20",
        statusHistory: [{ status: "Novo contato", date: "2026-07-28" }],
      }),
    );
    expect(t.map((m) => m.titulo)).toEqual(["Angariação criada", "Novo contato"]);
  });

  it("ignora tentativas e notas — a lista é de MARCOS", () => {
    const t = timelineDaAngariacao(
      imovel({
        tentativas: [
          { id: "t1", data: "2026-07-23T10:00", resultado: "sem-resposta" },
          { id: "t2", data: "2026-07-24T10:00", resultado: "respondeu" },
        ],
        notas: [
          { id: "wa:1", texto: "Resposta pelo WhatsApp: oi", data: "2026-07-24T11:00" },
          { id: "sophia:e1", texto: "Autorização assinada…", data: "2026-07-25T09:00" },
        ],
      }),
    );
    expect(t).toHaveLength(4);
    expect(t.some((m) => m.titulo.includes("WhatsApp"))).toBe(false);
  });

  it("a comissão só entra quando marcada como recebida e com data", () => {
    expect(
      timelineDaAngariacao(imovel({ comissaoRecebida: true })).some((m) => m.titulo.includes("Comissão")),
    ).toBe(false);
    expect(
      timelineDaAngariacao(imovel({ comissaoRecebidaData: "2026-08-15" })).some((m) =>
        m.titulo.includes("Comissão"),
      ),
    ).toBe(false);
  });

  it("a comissão marcada à mão não se apresenta como vinda da integração", () => {
    // Sem forma de pagamento nem observação, ninguém informou nada: carimbar a
    // linha como "sistema-principal" afirmaria uma procedência que não existe,
    // num campo de dinheiro.
    const mao = timelineDaAngariacao(
      imovel({ comissaoRecebida: true, comissaoRecebidaData: "2026-08-15" }),
    ).find((m) => m.titulo.includes("Comissão"));
    expect(mao?.fonte).toBe("funil");

    const doSistema = timelineDaAngariacao(
      imovel({
        comissaoRecebida: true,
        comissaoRecebidaData: "2026-08-15",
        comissaoFormaPagamento: "PIX",
      }),
    ).find((m) => m.titulo.includes("Comissão"));
    expect(doSistema?.fonte).toBe("sistema-principal");
    expect(doSistema?.detalhe).toBe("PIX");
  });

  it("o valor vai CRU, para a UI formatar", () => {
    const m = timelineDaAngariacao(
      imovel({ comissaoRecebida: true, comissaoRecebidaData: "2026-08-15", comissaoRecebidaValor: 1920 }),
    ).find((x) => x.titulo.includes("Comissão"));
    expect(m?.valor).toBe(1920);
  });

  it("sem valor afirmado não inventa a estimativa", () => {
    const m = timelineDaAngariacao(
      imovel({ comissaoRecebida: true, comissaoRecebidaData: "2026-08-15", valorAluguel: 1600 }),
    ).find((x) => x.titulo.includes("Comissão"));
    expect(m?.valor).toBeNull();
  });

  it("a criação é a data MAIS ANTIGA, e sempre abre a lista", () => {
    /* Bug real, achado olhando a tela e não rodando teste: no AP-009 da conta
       de teste o `dataAngariacao` é posterior à primeira transição do funil, e
       "Angariação criada" caía no meio da lista, depois de "Documentação em
       andamento". Uma angariação não pode ter sido criada depois da própria
       primeira transição — se o histórico marca 20/05, o registro existia lá. */
    const t = timelineDaAngariacao(
      imovel({
        dataAngariacao: "2026-06-08",
        statusHistory: [
          { status: "Novo contato", date: "2026-05-20" },
          { status: "Documentação", date: "2026-06-02" },
          { status: "Angariado", date: "2026-06-08" },
        ],
      }),
    );
    expect(t[0].titulo).toBe("Angariação criada");
    expect(t[0].data).toBe("2026-05-20");
    // E o "Novo contato" de 20/05 não vira linha própria: é o mesmo dia.
    expect(t.map((m) => m.titulo)).toEqual([
      "Angariação criada",
      "Documentação em andamento",
      "Imóvel angariado",
    ]);
  });

  it("imóvel sem data nenhuma devolve lista vazia em vez de inventar hoje", () => {
    expect(timelineDaAngariacao(imovel({ dataAngariacao: null, statusHistory: [] }))).toEqual([]);
  });

  it("o motivo aparece no encerramento", () => {
    const t = timelineDaAngariacao(
      imovel({
        status: "Perdido",
        statusHistory: [
          { status: "Novo contato", date: "2026-07-20" },
          { status: "Perdido", date: "2026-07-30" },
        ],
        motivoPerda: "Optou por outra imobiliária",
      }),
    );
    expect(t[1].detalhe).toBe("Optou por outra imobiliária");
  });
});
