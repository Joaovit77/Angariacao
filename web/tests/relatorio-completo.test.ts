/* Relatório completo (lib/calculo/relatorioCompleto).
   Feature nova da pós-migração — sem oráculo do app antigo. O que os testes
   fixam é a honestidade das medidas, que é a razão de o documento existir:
   abertura contada pelo histórico INTEIRO (não pelo recorte), taxa de resposta
   por COORTE (não fotografia), desfecho de HOJE com "em disputa" à parte, e os
   baldes de perda separando mercado de cadastro. */
import { describe, expect, it } from "vitest";
import {
  esforcoDoPeriodo,
  MOTIVOS_CHEGAMOS_TARDE,
  MOTIVOS_PERDA_POS_CAPTACAO,
  perdasDoPeriodo,
  relatorioCompleto,
  respostasDoPeriodo,
  CANAL_NAO_INFORMADO,
  MOTIVO_NAO_INFORMADO,
} from "@/lib/calculo/relatorioCompleto";
import { MOTIVO_PERDA_LOCADO_FORA } from "@/lib/constantes";
import type { Imovel, NotaImovel, Tentativa } from "@/lib/tipos";

const INICIO = "2026-07-01";
const FIM = "2026-07-31";
const HOJE = "2026-07-31";

let seq = 0;
function tentativa(data: string, over: Partial<Tentativa> = {}): Tentativa {
  seq += 1;
  return { id: `t${seq}`, data: `${data}T10:00`, canal: "WhatsApp", resultado: "sem-resposta", ...over };
}

function resposta(data: string): NotaImovel {
  seq += 1;
  return { id: `wa:m${seq}`, data: `${data}T11:00`, texto: "Resposta pelo WhatsApp: tenho interesse" };
}

function imovel(over: Partial<Imovel> = {}): Imovel {
  seq += 1;
  return { id: `i${seq}`, endereco: `Rua ${seq}`, status: "Novo contato", ...over };
}

describe("esforcoDoPeriodo", () => {
  it("conta só as tentativas dentro do período", () => {
    const i = imovel({ tentativas: [tentativa("2026-06-28"), tentativa("2026-07-05"), tentativa("2026-08-02")] });
    const e = esforcoDoPeriodo([i], INICIO, FIM);
    expect(e.tentativas).toBe(1);
    expect(e.imoveis).toBe(1);
  });

  /* O recorte não pode redefinir o que é abertura: se contasse só o que está
     dentro do período, toda retomada do começo do mês viraria "primeiro
     contato" e o relatório diria que a prospecção cresceu. */
  it("abertura é a primeira tentativa do imóvel, não a primeira do período", () => {
    const antigo = imovel({ tentativas: [tentativa("2026-05-10"), tentativa("2026-07-03")] });
    const novo = imovel({ tentativas: [tentativa("2026-07-04")] });
    const e = esforcoDoPeriodo([antigo, novo], INICIO, FIM);
    expect(e.tentativas).toBe(2);
    expect(e.aberturas).toBe(1);
    expect(e.seguimentos).toBe(1);
  });

  it("separa o que saiu pelo lote do que saiu uma a uma", () => {
    const i = imovel({
      tentativas: [tentativa("2026-07-02", { viaLote: true }), tentativa("2026-07-03")],
    });
    const e = esforcoDoPeriodo([i], INICIO, FIM);
    expect(e.viaLote).toBe(1);
    expect(e.avulsas).toBe(1);
  });

  it("agrupa por canal, com rótulo próprio para a tentativa sem canal", () => {
    const i = imovel({
      tentativas: [
        tentativa("2026-07-02"),
        tentativa("2026-07-03"),
        tentativa("2026-07-04", { canal: "Ligação telefônica" }),
        tentativa("2026-07-05", { canal: null }),
      ],
    });
    const e = esforcoDoPeriodo([i], INICIO, FIM);
    expect(e.porCanal[0]).toEqual({ rotulo: "WhatsApp", n: 2 });
    expect(e.porCanal.map((c) => c.rotulo)).toContain(CANAL_NAO_INFORMADO);
  });

  it("agrupa por dia em ordem crescente", () => {
    const i = imovel({ tentativas: [tentativa("2026-07-09"), tentativa("2026-07-02"), tentativa("2026-07-02")] });
    const e = esforcoDoPeriodo([i], INICIO, FIM);
    expect(e.porDia).toEqual([
      { rotulo: "2026-07-02", n: 2 },
      { rotulo: "2026-07-09", n: 1 },
    ]);
  });

  /* Ele prospecta em rajadas: 4 tentativas em 2 dias é ritmo de 2 por dia
     trabalhado, não de 0,13 por dia do mês. */
  it("a média divide pelos dias TRABALHADOS, não pelos dias do período", () => {
    const i = imovel({
      tentativas: [tentativa("2026-07-02"), tentativa("2026-07-02"), tentativa("2026-07-09"), tentativa("2026-07-09")],
    });
    const e = esforcoDoPeriodo([i], INICIO, FIM);
    expect(e.diasAtivos).toBe(2);
    expect(e.mediaPorDiaAtivo).toBe(2);
  });

  it("período sem contato não inventa média", () => {
    const e = esforcoDoPeriodo([imovel()], INICIO, FIM);
    expect(e.tentativas).toBe(0);
    expect(e.mediaPorDiaAtivo).toBeNull();
  });
});

describe("respostasDoPeriodo", () => {
  it("conta as mensagens recebidas e os imóveis distintos de onde vieram", () => {
    const i = imovel({ notas: [resposta("2026-07-10"), resposta("2026-07-11")] });
    const r = respostasDoPeriodo([i, imovel()], INICIO, FIM);
    expect(r.mensagens).toBe(2);
    expect(r.imoveisQueResponderam).toBe(1);
  });

  it("ignora a nota escrita à mão pelo corretor", () => {
    const i = imovel({ notas: [{ id: "n1", data: "2026-07-10T09:00", texto: "lembrar de ligar" }] });
    expect(respostasDoPeriodo([i], INICIO, FIM).mensagens).toBe(0);
  });

  /* A coorte é o que torna a taxa comparável: só entra quem teve a PRIMEIRA
     tentativa no período, e o denominador é essa mesma gente. */
  it("a coorte é quem foi abordado pela primeira vez no período", () => {
    const doPeriodo = imovel({ tentativas: [tentativa("2026-07-05")], notas: [resposta("2026-07-06")] });
    const antigo = imovel({ tentativas: [tentativa("2026-05-05"), tentativa("2026-07-06")] });
    const r = respostasDoPeriodo([doPeriodo, antigo], INICIO, FIM);
    expect(r.coorteAbordados).toBe(1);
    expect(r.coorteResponderam).toBe(1);
    expect(r.taxaCoorte).toBe(100);
  });

  /* Cortar no fim do período puniria sempre o mês mais recente: quem foi
     abordado dia 30 responderia em agosto e contaria como fracasso de julho. */
  it("resposta que chegou DEPOIS do fim do período ainda conta para a coorte", () => {
    const i = imovel({ tentativas: [tentativa("2026-07-30")], notas: [resposta("2026-08-02")] });
    const r = respostasDoPeriodo([i], INICIO, FIM);
    expect(r.coorteResponderam).toBe(1);
    expect(r.medianaAteResponder).toBe(3);
  });

  it("sem ninguém abordado no período não há taxa", () => {
    const r = respostasDoPeriodo([imovel()], INICIO, FIM);
    expect(r.taxaCoorte).toBeNull();
    expect(r.medianaAteResponder).toBeNull();
  });

  it("usa mediana, não média — a conversa que demorou muito não desloca o número", () => {
    const rapidos = [1, 2].map((d) =>
      imovel({ tentativas: [tentativa("2026-07-01")], notas: [resposta(`2026-07-0${1 + d}`)] }),
    );
    const lento = imovel({ tentativas: [tentativa("2026-07-01")], notas: [resposta("2026-07-31")] });
    // Dias: 1, 2 e 30. Média seria 11; mediana é 2.
    expect(respostasDoPeriodo([...rapidos, lento], INICIO, FIM).medianaAteResponder).toBe(2);
  });

  /* Quem respondeu e segue em disputa não é fracasso — é pendência. Contá-lo
     como "não deu em nada" é o erro que conversaoCaptacao existe para evitar. */
  it("separa o desfecho de HOJE em angariado, em disputa e encerrado", () => {
    const angariado = imovel({
      status: "Angariado",
      statusHistory: [{ status: "Angariado", date: "2026-07-15" }],
      notas: [resposta("2026-07-10")],
    });
    const disputa = imovel({ status: "Em negociação", notas: [resposta("2026-07-10")] });
    const perdido = imovel({ status: "Perdido", notas: [resposta("2026-07-10")] });
    const r = respostasDoPeriodo([angariado, disputa, perdido], INICIO, FIM);
    expect([r.angariados, r.emAberto, r.encerrados]).toEqual([1, 1, 1]);
  });

  it("Locado conta como captação ganha mesmo sem a etapa no histórico", () => {
    const i = imovel({ status: "Locado", statusHistory: [], notas: [resposta("2026-07-10")] });
    expect(respostasDoPeriodo([i], INICIO, FIM).angariados).toBe(1);
  });
});

describe("perdasDoPeriodo", () => {
  const perdido = (motivo: string, quando: string): Imovel =>
    imovel({
      status: "Perdido",
      motivoPerda: motivo,
      statusHistory: [{ status: "Novo contato", date: "2026-06-01" }, { status: "Perdido", date: quando }],
    });

  it("a data do encerramento vem do statusHistory", () => {
    const dentro = perdido("Outro", "2026-07-10");
    const fora = perdido("Outro", "2026-06-10");
    expect(perdasDoPeriodo([dentro, fora], INICIO, FIM).decididos).toBe(1);
  });

  /* O erro que a carteira real expôs em 31/07/2026: contando os três terminais
     juntos, a seção 3 dava por perdidos os 29 imóveis em "Sem resposta" que a
     seção 4 mandava trabalhar hoje — e diluía "chegamos tarde" de 58% para
     37%, porque silêncio não tem motivo preenchido. */
  it("'Sem resposta' não é perda decidida: fica fora das taxas", () => {
    const silencio = imovel({
      status: "Sem resposta",
      statusHistory: [{ status: "Sem resposta", date: "2026-07-10" }],
    });
    const tarde = perdido(MOTIVOS_CHEGAMOS_TARDE[0], "2026-07-11");
    const p = perdasDoPeriodo([silencio, tarde], INICIO, FIM);

    expect(p.semResposta).toBe(1);
    expect(p.decididos).toBe(1);
    // 1 de 1 decidido — o silêncio não entra no denominador.
    expect(p.pctChegamosTarde).toBe(100);
    // Nem no balde de "sem motivo", que ele dominaria por construção.
    expect(p.porMotivo.map((m) => m.rotulo)).not.toContain(MOTIVO_NAO_INFORMADO);
  });

  /* O maior balde da carteira, e o que mais informa a manhã: não é recusa ao
     serviço, é o proprietário ter resolvido a vida antes de a gente chegar. */
  it("agrupa 'chegamos tarde' e o mantém fora dos demais motivos", () => {
    const tarde = MOTIVOS_CHEGAMOS_TARDE.map((m) => perdido(m, "2026-07-10"));
    const recusa = perdido("Valor pedido incompatível com mercado", "2026-07-11");
    const p = perdasDoPeriodo([...tarde, recusa], INICIO, FIM);
    expect(p.chegamosTarde).toBe(MOTIVOS_CHEGAMOS_TARDE.length);
    expect(p.demais).toBe(1);
    expect(p.decididos).toBe(MOTIVOS_CHEGAMOS_TARDE.length + 1);
    expect(p.pctChegamosTarde).toBeCloseTo(75);
  });

  /* A captação foi GANHA e a perda veio uma etapa depois — `conversaoCaptacao`
     já lê esse imóvel como angariado. Se esta seção o somasse a "chegamos
     tarde", o mesmo documento diria que o garimpo chegou atrasado num imóvel
     que ele captou, e cada captação perdida pioraria o diagnóstico do garimpo. */
  it("perda depois de captado tem balde próprio, fora de 'chegamos tarde'", () => {
    const p = perdasDoPeriodo([perdido(MOTIVO_PERDA_LOCADO_FORA, "2026-07-10")], INICIO, FIM);
    expect(p.posCaptacao).toBe(1);
    expect(p.chegamosTarde).toBe(0);
    expect(p.pctChegamosTarde).toBe(0);
    // Nem em "demais motivos", onde estão as recusas: aqui o proprietário disse sim.
    expect(p.demais).toBe(0);
  });

  it("os baldes não se sobrepõem", () => {
    // Com o motivo nas duas listas, ele seria contado uma vez e sumiria da
    // outra em silêncio — `demais` acusaria negativo antes de alguém notar.
    // Cada rótulo é conferido: checar só o primeiro deixaria os outros passarem.
    for (const m of MOTIVOS_PERDA_POS_CAPTACAO) expect(MOTIVOS_CHEGAMOS_TARDE).not.toContain(m);
    for (const m of MOTIVOS_CHEGAMOS_TARDE) expect(MOTIVOS_PERDA_POS_CAPTACAO).not.toContain(m);
  });

  /* O caminho que a carteira real usou. O LD-123 foi angariado em 22/07 e
     encerrado À MÃO em 01/08 (nenhuma nota de encerramento automático): o
     seletor do cadastro oferece "Imóvel já alugado por conta própria" e o
     rótulo pós-captação lado a lado, e o primeiro é o que mais se parece com o
     que o proprietário escreveu. Corrigir só no webhook deixaria o relatório
     errado justamente pelo caminho mais usado. */
  it("imóvel captado cai no balde pós-captação mesmo com o motivo antigo gravado", () => {
    const captado = imovel({
      status: "Perdido",
      motivoPerda: MOTIVOS_CHEGAMOS_TARDE[0],
      statusHistory: [
        { status: "Novo contato", date: "2026-06-01" },
        { status: "Angariado", date: "2026-06-20" },
        { status: "Perdido", date: "2026-07-10" },
      ],
    });
    const p = perdasDoPeriodo([captado], INICIO, FIM);
    expect(p.posCaptacao).toBe(1);
    expect(p.chegamosTarde).toBe(0);
    expect(p.demais).toBe(0);
    // A tabela por motivo mostra o rótulo corrigido: com o antigo, ela
    // contradiria os números logo acima dela na mesma seção.
    expect(p.porMotivo).toEqual([{ rotulo: MOTIVO_PERDA_LOCADO_FORA, n: 1 }]);
  });

  /* O outro lado da mesma regra: sem passagem por "Angariado", o motivo fica
     como está. Senão a correção comeria o balde que existe para diagnosticar o
     garimpo — que é o maior da carteira. */
  it("lead que nunca foi captado continua em 'chegamos tarde'", () => {
    const p = perdasDoPeriodo([perdido(MOTIVOS_CHEGAMOS_TARDE[0], "2026-07-10")], INICIO, FIM);
    expect(p.chegamosTarde).toBe(1);
    expect(p.posCaptacao).toBe(0);
  });

  it("telefone errado é problema de cadastro e fica em balde próprio", () => {
    const p = perdasDoPeriodo([perdido("Número não encontrado", "2026-07-10")], INICIO, FIM);
    expect(p.dadoRuim).toBe(1);
    expect(p.chegamosTarde).toBe(0);
    expect(p.demais).toBe(0);
  });

  it("encerramento sem motivo ganha rótulo em vez de sumir", () => {
    const p = perdasDoPeriodo([perdido("", "2026-07-10")], INICIO, FIM);
    expect(p.porMotivo[0]).toEqual({ rotulo: MOTIVO_NAO_INFORMADO, n: 1 });
  });

  it("'Sem resposta' é contado à parte, não somado às perdas", () => {
    const i = imovel({
      status: "Sem resposta",
      statusHistory: [{ status: "Sem resposta", date: "2026-07-10" }],
    });
    const p = perdasDoPeriodo([i], INICIO, FIM);
    expect(p.semResposta).toBe(1);
    expect(p.decididos).toBe(0);
    expect(p.pctChegamosTarde).toBeNull();
  });

  it("período sem encerramento não inventa percentual", () => {
    expect(perdasDoPeriodo([imovel()], INICIO, FIM).pctChegamosTarde).toBeNull();
  });
});

describe("relatorioCompleto", () => {
  /* A seção 4 é o MESMO cálculo do card da Início. Se divergirem, o relatório
     e a tela inicial passam a discordar sobre quantos estão esperando. */
  it("a fila da seção 4 é a rodada de hoje, não a do fim do período", () => {
    const i = imovel({
      status: "Sem resposta",
      proprietarioTelefone: "(43) 99802-4316",
      tentativas: [tentativa("2026-05-01")],
    });
    const r = relatorioCompleto([i], [], [], INICIO, FIM, HOJE);
    expect(r.fila.itens.some((f) => f.frente === "followup")).toBe(true);
    expect(r.start).toBe(INICIO);
    expect(r.end).toBe(FIM);
  });

  it("junta as quatro seções sem recalcular nada por fora", () => {
    const imoveis = [imovel({ tentativas: [tentativa("2026-07-03")], notas: [resposta("2026-07-04")] })];
    const r = relatorioCompleto(imoveis, [], [], INICIO, FIM, HOJE);
    expect(r.esforco).toEqual(esforcoDoPeriodo(imoveis, INICIO, FIM));
    expect(r.respostas).toEqual(respostasDoPeriodo(imoveis, INICIO, FIM));
    expect(r.perdas).toEqual(perdasDoPeriodo(imoveis, INICIO, FIM));
  });
});
