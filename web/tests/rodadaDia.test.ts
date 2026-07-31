/* A rodada do dia (lib/calculo/rodadaDia).
   Feature nova da pós-migração — sem oráculo do app antigo. Os testes fixam
   as três coisas que fazem o card informar em vez de decorar a tela: a ORDEM
   (de quem é a vez, não quem tem mais fila), a CAPACIDADE (o teto diário é
   compartilhado e visível antes de abrir o lote) e o silêncio das frentes
   vazias. */
import { describe, expect, it } from "vitest";
import { FOLLOWUP_TETO_DIA } from "@/lib/calculo/followup";
import { contarRespostasPendentes } from "@/lib/calculo/respostas";
import { rodadaDoDia, type FrenteRodada } from "@/lib/calculo/rodadaDia";
import type { AgendaItem, Imovel, NotaImovel, Tentativa } from "@/lib/tipos";

const HOJE = "2026-07-21";

let seq = 0;
function telefone(): string {
  seq += 1;
  return `(43) 9${String(9000 + seq)}-${String(1000 + seq)}`;
}

function tentativa(data: string, over: Partial<Tentativa> = {}): Tentativa {
  return { id: `t${data}-${seq}`, data: `${data}T10:00`, canal: "WhatsApp", resultado: "sem-resposta", ...over };
}

/** Imóvel pronto para a fila do follow-up: sem resposta, telefone bom,
    último contato bem antigo. */
function paraFollowUp(over: Partial<Imovel> = {}): Imovel {
  seq += 1;
  return {
    id: `f${seq}`,
    endereco: `Rua ${seq}`,
    proprietarioTelefone: telefone(),
    status: "Sem resposta",
    tentativas: [tentativa("2026-05-01")],
    ...over,
  };
}

/** Imóvel de captação com uma resposta do proprietário por tratar. */
function comRespostaPendente(over: Partial<Imovel> = {}): Imovel {
  seq += 1;
  const nota: NotaImovel = {
    id: `wa:m${seq}`,
    data: "2026-07-20T09:00",
    texto: "Resposta pelo WhatsApp: pode me mandar mais detalhes?",
  };
  return {
    id: `r${seq}`,
    endereco: `Rua R${seq}`,
    proprietarioTelefone: telefone(),
    status: "Em negociação",
    notas: [nota],
    ...over,
  };
}

function compromisso(date: string, over: Partial<AgendaItem> = {}): AgendaItem {
  seq += 1;
  return {
    id: `a${seq}`,
    date,
    title: "Retorno",
    type: "Retorno",
    done: false,
    isVerificacaoDisponibilidade: false,
    ...over,
  };
}

const frentes = (imoveis: Imovel[], agenda: AgendaItem[] = []): FrenteRodada[] =>
  rodadaDoDia(imoveis, agenda, [], HOJE).itens.map((i) => i.frente);

describe("rodadaDoDia", () => {
  it("não renderiza frente vazia — e a rodada limpa se declara vazia", () => {
    const r = rodadaDoDia([], [], [], HOJE);
    expect(r.itens).toEqual([]);
    expect(r.vazia).toBe(true);
    expect(r.total).toBe(0);
  });

  it("uma frente com fila basta para a rodada existir", () => {
    const r = rodadaDoDia([paraFollowUp()], [], [], HOJE);
    expect(r.vazia).toBe(false);
    expect(frentes([paraFollowUp()])).toEqual(["followup"]);
  });

  /* A ordem é o ponto todo: em captação o silêncio é sempre a categoria mais
     populosa, então ordenar por volume enterraria todo dia quem já agiu. */
  it("põe quem já agiu (resposta, hora marcada) na frente da nossa iniciativa", () => {
    // Fila de follow-up enorme contra UMA resposta e UM compromisso.
    const imoveis = [...Array(30)].map(() => paraFollowUp());
    imoveis.push(comRespostaPendente());
    const ordem = frentes(imoveis, [compromisso(HOJE)]);

    expect(ordem.slice(0, 2).sort()).toEqual(["compromissos", "respostas"]);
    expect(ordem[2]).toBe("followup");
  });

  it("deixa o que arruma o registro por último, mesmo com fila grande", () => {
    // Só conta como pendente a tentativa cujo proprietário RESPONDEU — o
    // silêncio o app resolve sozinho (ver calculo/resultadoObservado.ts).
    const pendentes = [...Array(20)].map((_, n) =>
      paraFollowUp({
        tentativas: [tentativa("2026-07-20", { aguardandoResultado: true })],
        notas: [{ id: `wa:p${n}`, data: "2026-07-20T15:00", texto: "Resposta pelo WhatsApp: oi" }],
      }),
    );
    const ordem = frentes([...pendentes, comRespostaPendente()]);
    expect(ordem[0]).toBe("respostas");
    expect(ordem[ordem.length - 1]).toBe("resultados");
  });

  it("dentro da mesma urgência, a fila maior vem antes", () => {
    // Duas frentes "agora": 3 respostas contra 1 compromisso.
    const imoveis = [comRespostaPendente(), comRespostaPendente(), comRespostaPendente()];
    expect(frentes(imoveis, [compromisso(HOJE)])[0]).toBe("respostas");
  });

  it("conta compromisso de hoje e atrasado na mesma frente", () => {
    const r = rodadaDoDia([], [compromisso(HOJE), compromisso("2026-07-10"), compromisso("2026-07-11")], [], HOJE);
    const item = r.itens.find((i) => i.frente === "compromissos")!;
    expect(item.quantos).toBe(3);
    expect(item.detalhe).toContain("2 atrasados");
  });

  it("ignora compromisso concluído e o que ainda está longe", () => {
    const agenda = [compromisso(HOJE, { done: true }), compromisso("2026-08-30")];
    expect(frentes([], agenda)).toEqual([]);
  });

  /* Se este teste quebrar, o badge do menu e a rodada passaram a discordar —
     e divergência entre telas é sinal de bug, não de recorte novo. */
  it("conta respostas pelo mesmo cálculo do badge do menu (só captação)", () => {
    const imoveis = [
      comRespostaPendente({ status: "Novo contato" }),
      // Já captado: entra na caixa de respostas, mas não no badge nem aqui.
      comRespostaPendente({ status: "Angariado" }),
    ];
    const item = rodadaDoDia(imoveis, [], [], HOJE).itens.find((i) => i.frente === "respostas")!;
    expect(item.quantos).toBe(contarRespostasPendentes(imoveis, HOJE));
    expect(item.quantos).toBe(1);
  });

  describe("capacidade", () => {
    it("expõe o que já saiu hoje e o que sobra do teto — antes de abrir o lote", () => {
      const jaEnviados = [...Array(3)].map(() =>
        paraFollowUp({ tentativas: [tentativa("2026-05-01"), tentativa(HOJE, { viaLote: true })] }),
      );
      const r = rodadaDoDia([...jaEnviados, paraFollowUp()], [], [], HOJE);
      expect(r.enviadosHoje).toBe(3);
      expect(r.vagasRestantes).toBe(FOLLOWUP_TETO_DIA - 3);
    });

    it("cota esgotada zera as vagas e o detalhe diz isso", () => {
      const gastos = [...Array(FOLLOWUP_TETO_DIA)].map(() =>
        paraFollowUp({ tentativas: [tentativa("2026-05-01"), tentativa(HOJE, { viaLote: true })] }),
      );
      const r = rodadaDoDia([...gastos, paraFollowUp()], [], [], HOJE);
      expect(r.vagasRestantes).toBe(0);
      const item = r.itens.find((i) => i.frente === "followup")!;
      expect(item.cabemHoje).toBe(0);
      expect(item.detalhe).toContain("já foi usado");
    });

    it("cabemHoje nunca passa do tamanho da fila", () => {
      const r = rodadaDoDia([paraFollowUp(), paraFollowUp()], [], [], HOJE);
      expect(r.itens.find((i) => i.frente === "followup")!.cabemHoje).toBe(2);
    });

    /* O número que faltava: a fila não é uma caixa de entrada que se esvazia
       "quando der" — ela drena no teto diário, e o dia pulado é vaga perdida. */
    it("diasParaVazar é a fila atual dividida pelo teto, arredondando para cima", () => {
      const fila = [...Array(FOLLOWUP_TETO_DIA * 2 + 1)].map(() => paraFollowUp());
      expect(rodadaDoDia(fila, [], [], HOJE).diasParaVazar).toBe(3);
    });

    it("sem fila de follow-up não há dias a projetar", () => {
      expect(rodadaDoDia([comRespostaPendente()], [], [], HOJE).diasParaVazar).toBeNull();
    });

    it("frente sem teto declara cabemHoje nulo", () => {
      const item = rodadaDoDia([comRespostaPendente()], [], [], HOJE).itens[0];
      expect(item.cabemHoje).toBeNull();
    });
  });

  it("o total soma as filas de todas as frentes", () => {
    const r = rodadaDoDia([paraFollowUp(), paraFollowUp(), comRespostaPendente()], [compromisso(HOJE)], [], HOJE);
    expect(r.total).toBe(r.itens.reduce((s, i) => s + i.quantos, 0));
    expect(r.total).toBe(4);
  });
});
