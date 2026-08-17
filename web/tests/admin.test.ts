/* Painel do super admin (lib/calculo/admin) — a parte pura.

   O contrato que estes testes guardam: a lista abre por quem PRECISA de
   alguém, não por quem tem mais volume. É a mesma armadilha que matou a
   faixa de "imóvel parado" no termômetro e que a `rodadaDia` documenta —
   a categoria mais populosa vence sempre, e aqui a mais populosa é
   "está tudo bem". */
import { describe, expect, it } from "vitest";
import {
  DIAS_CONTA_NOVA,
  DIAS_INATIVIDADE,
  errosPorCorretor,
  ordenarCorretores,
  rotuloEvento,
  saudeDoCorretor,
  totaisDoPainel,
  type CorretorAdmin,
  type EventoLog,
} from "@/lib/calculo/admin";
import { somarGasto } from "@/lib/calculo/custoIa";

const HOJE = "2026-08-01";

let seq = 0;
function corretor(over: Partial<CorretorAdmin> = {}): CorretorAdmin {
  seq += 1;
  return {
    id: `u${seq}`,
    email: `corretor${seq}@exemplo.com`,
    nome: null,
    criadoEm: "2026-01-10T12:00:00Z",
    ultimoAcesso: "2026-07-31T09:00:00Z",
    instancia: "instancia-1",
    iaLiberada: true,
    tetoUsd: null,
    googleConectado: false,
    ehAdmin: false,
    operaCarteira: true,
    imoveis: 40,
    tentativas30d: 25,
    respostas30d: 4,
    errosRecentes: 0,
    gasto: somarGasto([]),
    ...over,
  };
}

describe("saudeDoCorretor", () => {
  it("sem instância há mais que a tolerância é BLOQUEADO — o produto não existe para ele", () => {
    const s = saudeDoCorretor(corretor({ instancia: null, criadoEm: "2026-07-01T12:00:00Z" }), HOJE);
    expect(s.nivel).toBe("bloqueado");
    expect(s.motivo).toContain("Sem número de WhatsApp");
  });

  it("conta recém-criada sem instância é atenção, não bloqueio", () => {
    // É a fila normal de quem acabou de se cadastrar. Marcar como
    // bloqueado faria o painel abrir vermelho todo dia por causa do
    // fluxo esperado, e vermelho constante deixa de ser visto.
    const criadoEm = `2026-07-${String(31 - DIAS_CONTA_NOVA + 1).padStart(2, "0")}T12:00:00Z`;
    const s = saudeDoCorretor(corretor({ instancia: null, criadoEm }), HOJE);
    expect(s.nivel).toBe("atencao");
    expect(s.motivo).toContain("Conta nova");
  });

  it("erro recente vence inatividade", () => {
    // Quem parou de entrar porque algo quebrou é caso de conserto, não
    // de "sumiu" — e a frase muda quem faz a ligação.
    const s = saudeDoCorretor(
      corretor({ errosRecentes: 3, ultimoAcesso: "2026-06-01T09:00:00Z" }),
      HOJE,
    );
    expect(s.nivel).toBe("atencao");
    expect(s.motivo).toContain("3 erro(s)");
  });

  it("marca quem sumiu", () => {
    const s = saudeDoCorretor(corretor({ ultimoAcesso: "2026-06-01T09:00:00Z" }), HOJE);
    expect(s.nivel).toBe("atencao");
    expect(s.motivo).toContain("Sem entrar há");
    expect(Number(s.motivo.replace(/\D/g, ""))).toBeGreaterThanOrEqual(DIAS_INATIVIDADE);
  });

  it("marca quem nunca entrou", () => {
    expect(saudeDoCorretor(corretor({ ultimoAcesso: null }), HOJE).motivo).toBe(
      "Nunca entrou no painel",
    );
  });

  it("configurado, ativo e sem erro, mas sem enviar nada, ainda pede conversa", () => {
    const s = saudeDoCorretor(corretor({ tentativas30d: 0 }), HOJE);
    expect(s.nivel).toBe("atencao");
    expect(s.motivo).toContain("Nenhuma mensagem");
  });

  it("quem trabalha e não quebrou fica em ok", () => {
    expect(saudeDoCorretor(corretor(), HOJE).nivel).toBe("ok");
  });

  it("data ilegível não promove ninguém a bloqueado", () => {
    const s = saudeDoCorretor(corretor({ instancia: null, criadoEm: "sem-data" }), HOJE);
    expect(s.nivel).toBe("atencao");
  });

  /* ------------------------------------------------------------------
     A CONEXÃO

     O buraco que esta parte tapa: instância CADASTRADA com o WhatsApp
     caído tem exatamente o mesmo efeito de não ter número — nenhuma
     mensagem sai —, e a tela dava "Ok". Só entra na conta quando alguém
     rodou a varredura; sem consulta, a saúde volta a ser a de antes.
     ------------------------------------------------------------------ */
  it("WhatsApp desconectado é BLOQUEADO, no mesmo degrau de não ter número", () => {
    const s = saudeDoCorretor(corretor(), HOJE, "desconectado");
    expect(s.nivel).toBe("bloqueado");
    expect(s.motivo).toContain("desconectado");
  });

  it("sem varredura, ninguém é acusado de estar caído", () => {
    // Não saber não é o mesmo que estar quebrado. Acusar por falta de
    // informação encheria a tela de vermelho toda vez que ela abrisse.
    expect(saudeDoCorretor(corretor(), HOJE, undefined).nivel).toBe("ok");
  });

  it("'conectando' não acusa nada — é o estado de quem acabou de ler o QR", () => {
    // Marcar isso mandaria alguém consertar uma conexão que está subindo
    // sozinha, e o conserto (mostrar outro QR) derrubaria o pareamento.
    expect(saudeDoCorretor(corretor(), HOJE, "conectando").nivel).toBe("ok");
  });

  it("Evolution sem responder é atenção, não bloqueio", () => {
    // Não foi o corretor que quebrou; mas não saber também pede olhar.
    const s = saudeDoCorretor(corretor(), HOJE, "falha");
    expect(s.nivel).toBe("atencao");
  });

  it("conexão caída vence erro recente", () => {
    // O erro no log é quase sempre CONSEQUÊNCIA da queda; mostrar a
    // consequência esconderia a causa.
    const s = saudeDoCorretor(corretor({ errosRecentes: 5 }), HOJE, "desconectado");
    expect(s.nivel).toBe("bloqueado");
  });

  /* ------------------------------------------------------------------
     O TETO DE IA
     ------------------------------------------------------------------ */
  it("acima do teto é atenção, com os dois valores na frase", () => {
    const s = saudeDoCorretor(
      corretor({ tetoUsd: 1, gasto: { ...somarGasto([]), custoUsd: 2.5 } }),
      HOJE,
    );
    expect(s.nivel).toBe("atencao");
    expect(s.motivo).toContain("acima do teto");
  });

  it("sem teto definido, gasto nenhum acusa", () => {
    // `null` é "sem teto", e não "teto zero" — que acusaria todo mundo.
    const s = saudeDoCorretor(
      corretor({ tetoUsd: null, gasto: { ...somarGasto([]), custoUsd: 999 } }),
      HOJE,
    );
    expect(s.nivel).toBe("ok");
  });

  it("erro recente vence o teto estourado", () => {
    // Erro é algo quebrado; teto é dinheiro correndo. As duas pedem
    // ação, a primeira pede mais rápido.
    const s = saudeDoCorretor(
      corretor({ errosRecentes: 1, tetoUsd: 1, gasto: { ...somarGasto([]), custoUsd: 2 } }),
      HOJE,
    );
    expect(s.motivo).toContain("erro(s)");
  });

  it("o teto vence a inatividade — quem gasta acima do teto não está parado", () => {
    const s = saudeDoCorretor(
      corretor({
        ultimoAcesso: "2026-06-01T09:00:00Z",
        tetoUsd: 1,
        gasto: { ...somarGasto([]), custoUsd: 2 },
      }),
      HOJE,
    );
    expect(s.motivo).toContain("acima do teto");
  });
});

describe("ordenarCorretores", () => {
  it("põe bloqueado antes de atenção, e atenção antes de ok", () => {
    const ok = corretor({ email: "ok@x.com" });
    const bloqueado = corretor({
      email: "bloqueado@x.com",
      instancia: null,
      criadoEm: "2026-01-01T12:00:00Z",
    });
    const atencao = corretor({ email: "atencao@x.com", errosRecentes: 1 });

    const ordem = ordenarCorretores([ok, atencao, bloqueado], HOJE).map((r) => r.corretor.email);
    expect(ordem).toEqual(["bloqueado@x.com", "atencao@x.com", "ok@x.com"]);
  });

  it("dentro do mesmo nível, o mais caro primeiro", () => {
    const modelo = "gpt-5.4-mini";
    const caro = corretor({
      email: "caro@x.com",
      gasto: somarGasto([
        {
          userId: "x",
          tipo: "resumo-dia",
          modelo,
          tokensEntrada: 900000,
          tokensEntradaCache: 0,
          tokensSaida: 900000,
          criadoEm: HOJE,
        },
      ]),
    });
    const barato = corretor({ email: "barato@x.com" });
    const ordem = ordenarCorretores([barato, caro], HOJE).map((r) => r.corretor.email);
    expect(ordem[0]).toBe("caro@x.com");
  });

  it("lista vazia não quebra", () => {
    expect(ordenarCorretores([], HOJE)).toEqual([]);
  });
});

describe("totaisDoPainel", () => {
  it("conta bloqueados e em atenção separadamente", () => {
    const t = totaisDoPainel(
      [
        corretor(),
        corretor({ instancia: null, criadoEm: "2026-01-01T12:00:00Z" }),
        corretor({ errosRecentes: 2 }),
      ],
      HOJE,
    );
    expect(t.corretores).toBe(3);
    expect(t.bloqueados).toBe(1);
    expect(t.emAtencao).toBe(1);
  });

  it("propaga o aviso de preço não conferido de qualquer corretor", () => {
    /* Usa um modelo INEXISTENTE de propósito. A versão anterior deste
       teste citava um modelo real e fixava o estado da tabela de preços
       naquele dia — quebrou legitimamente na primeira vez que alguém
       conferiu os preços (2026-08-01). O que precisa ser guardado é o
       MECANISMO: basta um corretor sem preço para o painel avisar. */
    const comUso = corretor({
      gasto: somarGasto([
        {
          userId: "x",
          tipo: "resumo-dia",
          modelo: "modelo-sem-preco",
          tokensEntrada: 10,
          tokensEntradaCache: 0,
          tokensSaida: 10,
          criadoEm: HOJE,
        },
      ]),
    });
    expect(totaisDoPainel([corretor(), comUso], HOJE).precoNaoConferido).toBe(true);
  });
});

describe("log", () => {
  function evento(over: Partial<EventoLog> = {}): EventoLog {
    return {
      id: 1,
      userId: "u1",
      categoria: "whatsapp",
      nivel: "erro",
      evento: "envio-falhou",
      detalhe: null,
      criadoEm: "2026-08-01T10:00:00Z",
      ...over,
    };
  }

  it("conta erros por corretor, ignorando aviso e info", () => {
    const mapa = errosPorCorretor([
      evento({ userId: "a" }),
      evento({ userId: "a" }),
      evento({ userId: "b", nivel: "aviso" }),
      evento({ userId: "b", nivel: "info" }),
    ]);
    expect(mapa.get("a")).toBe(2);
    expect(mapa.get("b")).toBeUndefined();
  });

  it("erro sem dono não entra na conta de ninguém", () => {
    expect(errosPorCorretor([evento({ userId: null })]).size).toBe(0);
  });

  it("evento desconhecido aparece pelo próprio código, nunca como erro genérico", () => {
    // Traduzir o desconhecido para "erro genérico" esconderia exatamente
    // o que ninguém previu — que é o único log que importa de verdade.
    expect(rotuloEvento("evento-que-ainda-nao-existe")).toBe("evento-que-ainda-nao-existe");
    expect(rotuloEvento("envio-ok")).toBe("Mensagem enviada");
    expect(rotuloEvento("historico-envio-falhou")).toBe(
      "Mensagem enviada sem registro no histórico",
    );
  });
});
