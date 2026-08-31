/* Contrato da integração com o Sistema Principal (lib/calculo/sistemaPrincipal).
   Feature nova — não há oráculo do app antigo.

   O que estes testes protegem, em ordem de estrago:

   1. **O casamento errado.** Aplicar um evento no imóvel errado não dá erro em
      lugar nenhum: o painel passa a afirmar que uma captação que não fechou
      está locada, ou credita a comissão de um contrato à angariação de outro
      corretor. Metade do arquivo é sobre `localizarAngariacao` recusar em vez
      de chutar.
   2. **O apagamento silencioso.** Evento magro não pode zerar o que um evento
      anterior gravou.
   3. **A leitura do payload.** Formato de outro sistema, escrito por outra
      equipe: data em dois formatos, valor com vírgula, campo em camelCase ou
      snake_case. */
import { describe, expect, it } from "vitest";
import {
  aplicarEvento,
  detalheDoLog,
  type EventoSistemaPrincipal,
  indicadoresIntegracao,
  interpretarEvento,
  lerDataEvento,
  lerValor,
  linhaDoHistorico,
  localizarAngariacao,
  notaDoEvento,
  notificacoesPendentes,
  ROTULO_TIPO_EVENTO,
  TIPOS_EVENTO,
} from "@/lib/calculo/sistemaPrincipal";
import { ehNotaDeEvento, ehNotaDeResposta, eventosNaoLidos } from "@/lib/calculo/notas";
import { captacaoGanha } from "@/lib/calculo/motor";
import { categoriaMapa } from "@/lib/calculo/mapa";
import { deveTerVerificacaoAberta } from "@/lib/calculo/followup";
import { isStale } from "@/lib/calculo/motor";
import { STATUS_AUTORIZACAO_ASSINADA, STATUS_FLOW, STATUS_STALE_LENTO } from "@/lib/constantes";
import type { Imovel } from "@/lib/tipos";

const HOJE = "2026-08-05";

function imovel(over: Partial<Imovel> = {}): Imovel {
  return {
    id: "i1",
    endereco: "Rua José Francisco Pereira, 800",
    status: "Angariado",
    statusHistory: [{ status: "Angariado", date: "2026-07-10" }],
    valorAluguel: 1600,
    ...over,
  };
}

/* --- Leitura do payload --------------------------------------------------- */

describe("interpretarEvento", () => {
  it("lê o formato plano", () => {
    const e = interpretarEvento({
      evento: "autorizacao-assinada",
      id: "evt-1",
      referencia: "02256.001",
      data: "2026-08-04",
      responsavel: "Marina",
    });
    expect(e?.tipo).toBe("autorizacao-assinada");
    expect(e?.id).toBe("evt-1");
    expect(e?.referencia).toBe("02256.001");
    expect(e?.data).toBe("2026-08-04");
    expect(e?.responsavel).toBe("Marina");
  });

  it("lê os dados aninhados em `dados`, com o tipo na raiz", () => {
    const e = interpretarEvento({
      tipo: "imovel_locado",
      dados: { id: "evt-2", referenciaCrm: "02256.001", numeroContrato: "C-9912", dataLocacao: "05/08/2026" },
    });
    expect(e?.tipo).toBe("imovel-locado");
    expect(e?.contrato).toBe("C-9912");
    // Data em formato brasileiro: 5 de agosto, não 8 de maio. É o erro que
    // `new Date` cometeria, e o motivo de `lerDataEvento` existir.
    expect(e?.data).toBe("2026-08-05");
  });

  it("aceita os apelidos de tipo que o outro lado pode usar", () => {
    for (const t of ["comissao-paga", "comissao_paga", "comissao.paga", "comissao-recebida", "COMISSAO PAGA"]) {
      expect(interpretarEvento({ evento: t, id: "x" })?.tipo).toBe("comissao-paga");
    }
  });

  it("recusa evento sem id — sem ele não há idempotência", () => {
    expect(interpretarEvento({ evento: "comissao-paga", valor: 320 })).toBeNull();
  });

  it("recusa tipo desconhecido em vez de aplicar 'mais ou menos'", () => {
    expect(interpretarEvento({ evento: "imovel-vendido", id: "evt-3" })).toBeNull();
  });
});

describe("lerValor", () => {
  it("lê número, string simples e o formato brasileiro", () => {
    expect(lerValor(1920)).toBe(1920);
    expect(lerValor("1920.50")).toBe(1920.5);
    expect(lerValor("1.920,50")).toBe(1920.5);
    expect(lerValor("R$ 1.920,50")).toBe(1920.5);
  });
  it("devolve null no ilegível, nunca NaN nem zero", () => {
    // Zero somaria em silêncio e a tela exibiria um valor menor que o real
    // com cara de exato — a lição do `custoDaChamada`.
    expect(lerValor("à combinar")).toBeNull();
    expect(lerValor(undefined)).toBeNull();
    expect(lerValor(-5)).toBeNull();
  });
});

describe("lerDataEvento", () => {
  it("aceita ISO com e sem hora colada", () => {
    expect(lerDataEvento("2026-08-05")).toBe("2026-08-05");
    expect(lerDataEvento("2026-08-05T14:30:00Z")).toBe("2026-08-05");
  });
  it("aceita o brasileiro sem trocar dia por mês", () => {
    expect(lerDataEvento("05/08/2026")).toBe("2026-08-05");
    expect(lerDataEvento("10-07-2026")).toBe("2026-07-10");
  });
  it("recusa o impossível e o ilegível", () => {
    expect(lerDataEvento("32/13/2026")).toBeNull();
    expect(lerDataEvento("ontem")).toBeNull();
  });
});

/* --- O casamento ----------------------------------------------------------- */

describe("localizarAngariacao", () => {
  const evt: EventoSistemaPrincipal = { id: "e", tipo: "autorizacao-assinada", telefone: "43998024316" };

  it("um candidato é o candidato", () => {
    const r = localizarAngariacao([imovel()], evt);
    expect(r.ok && r.imovel.id).toBe("i1");
  });

  it("sem candidato nenhum, recusa", () => {
    const r = localizarAngariacao([], evt);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.falha).toBe("nao-encontrada");
  });

  it("sem identificação nenhuma, recusa antes de olhar o banco", () => {
    const r = localizarAngariacao([imovel()], { id: "e", tipo: "comissao-paga" });
    expect(!r.ok && r.falha).toBe("sem-identificacao");
  });

  it("desempata pelo endereço quando o proprietário tem vários imóveis", () => {
    const r = localizarAngariacao(
      [
        imovel({ id: "a", endereco: "Rua André Gallo, 101" }),
        imovel({ id: "b", endereco: "Rua José Francisco Pereira, 800" }),
      ],
      { ...evt, endereco: "R. Jose Francisco Pereira 800" },
    );
    // Grafia diferente (abreviação, sem acento, sem vírgula) e mesmo assim casa.
    expect(r.ok && r.imovel.id).toBe("b");
  });

  it("desempata pela unidade dentro do mesmo prédio", () => {
    const r = localizarAngariacao(
      [
        imovel({ id: "a", endereco: "Rua André Gallo, 101", unidade: "101" }),
        imovel({ id: "b", endereco: "Rua André Gallo, 101", unidade: "202" }),
      ],
      { ...evt, endereco: "Rua André Gallo, 101", unidade: "202" },
    );
    expect(r.ok && r.imovel.id).toBe("b");
  });

  it("ignora o imóvel retirado — o evento não é sobre o que saiu da carteira", () => {
    const r = localizarAngariacao(
      [imovel({ id: "a", retirado: true }), imovel({ id: "b" })],
      evt,
    );
    expect(r.ok && r.imovel.id).toBe("b");
  });

  it("prefere o mais avançado no funil entre imóveis vivos do mesmo dono", () => {
    const r = localizarAngariacao(
      [
        imovel({ id: "a", status: "Novo contato", statusHistory: [] }),
        imovel({ id: "b", status: "Documentação", statusHistory: [] }),
      ],
      evt,
    );
    expect(r.ok && r.imovel.id).toBe("b");
  });

  it("RECUSA quando o empate persiste, em vez de chutar", () => {
    // Dois imóveis idênticos e vivos, sem endereço no evento. Escolher um
    // acertaria na maioria das vezes e erraria em silêncio no resto — o pior
    // desfecho possível quando o evento é o pagamento de uma comissão.
    const r = localizarAngariacao([imovel({ id: "a" }), imovel({ id: "b" })], evt);
    expect(r.ok).toBe(false);
    expect(!r.ok && r.falha).toBe("ambigua");
    expect(!r.ok && r.candidatos).toBe(2);
  });
});

/* --- A aplicação ----------------------------------------------------------- */

describe("aplicarEvento — autorização assinada", () => {
  const evt: EventoSistemaPrincipal = {
    id: "e1",
    tipo: "autorizacao-assinada",
    referencia: "02256.001",
    data: "2026-08-04",
    responsavel: "Marina",
  };

  it("move o status, grava a data e adota a referência como id compartilhado", () => {
    const m = aplicarEvento(imovel(), evt, HOJE, 100);
    expect(m?.status).toBe(STATUS_AUTORIZACAO_ASSINADA);
    expect(m?.campos.autorizacaoAssinadaEm).toBe("2026-08-04");
    expect(m?.campos.autorizacaoResponsavel).toBe("Marina");
    expect(m?.campos.referenciaCrm).toBe("02256.001");
  });

  it("NÃO sobrescreve a referência que o corretor já tinha digitado", () => {
    const m = aplicarEvento(imovel({ referenciaCrm: "99999" }), evt, HOJE, 100);
    expect(m?.campos.referenciaCrm).toBeUndefined();
  });

  it("não puxa para trás um imóvel que já está mais à frente", () => {
    // Eventos podem chegar fora de ordem (fila reprocessada, integração
    // religada). Desfazer um "Locado" com uma assinatura antiga seria pior
    // que perder o evento — mas o FATO é gravado assim mesmo.
    const m = aplicarEvento(imovel({ status: "Locado" }), evt, HOJE, 100);
    expect(m?.status).toBeNull();
    expect(m?.campos.autorizacaoAssinadaEm).toBe("2026-08-04");
  });

  it("CORRIGE um imóvel dado como perdido aqui — lá é a fonte oficial", () => {
    const m = aplicarEvento(imovel({ status: "Perdido" }), evt, HOJE, 100);
    expect(m?.status).toBe(STATUS_AUTORIZACAO_ASSINADA);
  });

  it("sem data no evento, usa o dia da chegada", () => {
    const m = aplicarEvento(imovel(), { ...evt, data: null }, HOJE, 100);
    expect(m?.campos.autorizacaoAssinadaEm).toBe(HOJE);
  });
});

describe("aplicarEvento — imóvel locado", () => {
  it("move para Locado e guarda o contrato", () => {
    const m = aplicarEvento(
      imovel(),
      { id: "e2", tipo: "imovel-locado", data: "2026-08-05", contrato: "C-9912" },
      HOJE,
      100,
    );
    expect(m?.status).toBe("Locado");
    expect(m?.campos.locadoEm).toBe("2026-08-05");
    expect(m?.campos.contratoNumero).toBe("C-9912");
  });

  it("sem contrato no evento, não grava contrato — e não apaga o que havia", () => {
    const m = aplicarEvento(imovel({ contratoNumero: "C-1" }), { id: "e3", tipo: "imovel-locado" }, HOJE, 100);
    expect(m?.campos.contratoNumero).toBeUndefined();
  });

  it("não sobrescreve a primeira data real de locação", () => {
    const m = aplicarEvento(
      imovel({ status: "Locado", locadoEm: "2026-07-20" }),
      { id: "e-reentrada", tipo: "imovel-locado", data: "2026-08-05" },
      HOJE,
      100,
    );
    expect(m?.campos.locadoEm).toBeUndefined();
  });
});

describe("aplicarEvento — comissão paga", () => {
  const locado = imovel({ status: "Locado", statusHistory: [{ status: "Locado", date: "2026-08-01" }] });

  it("marca recebida com o valor que o financeiro AFIRMOU", () => {
    const m = aplicarEvento(
      locado,
      { id: "e4", tipo: "comissao-paga", data: "2026-08-05", valor: 1920, formaPagamento: "PIX" },
      HOJE,
      100,
    );
    expect(m?.campos.comissaoRecebida).toBe(true);
    expect(m?.campos.comissaoRecebidaValor).toBe(1920);
    expect(m?.campos.comissaoFormaPagamento).toBe("PIX");
    expect(m?.texto).toContain("1.920,00");
  });

  it("sem valor no evento, deixa null em vez de gravar a estimativa como fato", () => {
    // Gravar a estimativa transformaria um palpite nosso num número do
    // financeiro. O app segue exibindo a estimativa pelo fallback do motor.
    const m = aplicarEvento(locado, { id: "e5", tipo: "comissao-paga" }, HOJE, 100);
    expect(m?.campos.comissaoRecebidaValor).toBeNull();
    expect(m?.campos.comissaoRecebida).toBe(true);
  });

  it("NÃO mexe no funil — a comissão é paga depois da locação", () => {
    const m = aplicarEvento(locado, { id: "e6", tipo: "comissao-paga" }, HOJE, 100);
    expect(m?.status).toBeNull();
  });

  it("devolve null quando o mesmo pagamento já constava", () => {
    const jaPago = imovel({
      status: "Locado",
      comissaoRecebida: true,
      comissaoRecebidaData: "2026-08-05",
      comissaoRecebidaValor: 1920,
    });
    const m = aplicarEvento(jaPago, { id: "e7", tipo: "comissao-paga", data: "2026-08-05", valor: 1920 }, HOJE, 100);
    expect(m).toBeNull();
  });
});

/* --- O histórico da integração --------------------------------------------- */

describe("linhaDoHistorico", () => {
  const base = { id: 1, criadoEm: "2026-08-05T15:32:00", userId: "u1" };

  it("separa o TIPO do evento do resto do detalhe", () => {
    const l = linhaDoHistorico({
      ...base,
      evento: "sophia-aplicado",
      detalhe: detalheDoLog("autorizacao-assinada", "Autorização assinada"),
    });
    expect(l.evento).toBe("Autorização assinada");
    expect(l.resultado).toBe("Aplicado");
    expect(l.tom).toBe("ok");
    expect(l.contexto).toBe("Autorização assinada");
  });

  it("o duplicado aparece como ignorado, não como erro", () => {
    // É o caso que MAIS precisa aparecer na auditoria: tudo funcionou e nada
    // mudou. Marcá-lo como erro faria o operador caçar um problema que não
    // existe; escondê-lo faria a integração parecer quebrada.
    const l = linhaDoHistorico({
      ...base,
      evento: "sophia-duplicado",
      detalhe: detalheDoLog("comissao-paga", "id evt-1211"),
    });
    expect(l.resultado).toBe("Ignorado (evento duplicado)");
    expect(l.tom).toBe("aviso");
  });

  it("o evento ilegível não tem tipo, e isso é o próprio diagnóstico", () => {
    const l = linhaDoHistorico({
      ...base,
      evento: "sophia-invalido",
      detalhe: "sem id ou tipo reconhecível",
      userId: null,
    });
    expect(l.evento).toBeNull();
    expect(l.tom).toBe("erro");
    // O detalhe inteiro vira contexto: não havia tipo a extrair.
    expect(l.contexto).toBe("sem id ou tipo reconhecível");
  });

  it("código desconhecido não some da lista", () => {
    const l = linhaDoHistorico({ ...base, evento: "sophia-coisa-nova", detalhe: null });
    expect(l.resultado).toBe("sophia-coisa-nova");
    expect(l.contexto).toBeNull();
  });

  it("todo tipo de evento tem rótulo — senão a coluna nasceria vazia", () => {
    for (const tipo of TIPOS_EVENTO) {
      const l = linhaDoHistorico({ ...base, evento: "sophia-aplicado", detalhe: detalheDoLog(tipo) });
      expect(l.evento).toBe(ROTULO_TIPO_EVENTO[tipo]);
    }
  });
});

/* --- A notificação --------------------------------------------------------- */

describe("nota do evento", () => {
  const evt: EventoSistemaPrincipal = { id: "evt-42", tipo: "imovel-locado" };
  const nota = notaDoEvento(evt, "O imóvel X foi locado.", "2026-08-05T10:00");

  it("o id carrega o id do evento — é ele que dá a idempotência no banco", () => {
    expect(nota.id).toBe("sophia:evt-42");
  });

  it("nasce NÃO LIDA (sem o campo), senão o sino marcaria zero para sempre", () => {
    expect(nota.lida).toBeUndefined();
    expect(eventosNaoLidos([nota])).toHaveLength(1);
    expect(eventosNaoLidos([{ ...nota, lida: true }])).toHaveLength(0);
  });

  it("NÃO é resposta de proprietário — este é o erro que o prefixo evita", () => {
    // Caísse no `wa:`, `isStale` trataria a assinatura como manifestação do
    // proprietário e a caixa de respostas cobraria leitura de um recado que
    // ninguém mandou.
    expect(ehNotaDeEvento(nota)).toBe(true);
    expect(ehNotaDeResposta(nota)).toBe(false);
  });

  it("notificacoesPendentes lista da mais recente para a mais antiga", () => {
    const i = imovel({
      notas: [
        { id: "sophia:a", texto: "antiga", data: "2026-08-01T09:00" },
        { id: "sophia:b", texto: "nova", data: "2026-08-05T09:00" },
        { id: "wa:x", texto: "Resposta pelo WhatsApp: oi", data: "2026-08-06T09:00" },
        { id: "sophia:c", texto: "lida", data: "2026-08-04T09:00", lida: true },
      ],
    });
    const lista = notificacoesPendentes([i]);
    expect(lista.map((n) => n.texto)).toEqual(["nova", "antiga"]);
  });
});

/* --- O funil ---------------------------------------------------------------
   Estes quatro travam as réguas que o status novo atravessa. Cada um deles
   corresponde a um jeito de a etapa nova quebrar algo em silêncio. */

describe("o status novo no funil", () => {
  const autorizado = imovel({
    status: STATUS_AUTORIZACAO_ASSINADA,
    statusHistory: [{ status: STATUS_AUTORIZACAO_ASSINADA, date: "2026-07-01" }],
  });

  it("fica entre Angariado e Publicado", () => {
    const ordem = [...STATUS_FLOW] as string[];
    expect(ordem.indexOf(STATUS_AUTORIZACAO_ASSINADA)).toBe(ordem.indexOf("Angariado") + 1);
    expect(ordem.indexOf("Publicado")).toBe(ordem.indexOf(STATUS_AUTORIZACAO_ASSINADA) + 1);
  });

  it("NÃO acusa estagnação em 7 dias — senão todo imóvel autorizado nasceria com selo", () => {
    expect((STATUS_STALE_LENTO as readonly string[]).includes(STATUS_AUTORIZACAO_ASSINADA)).toBe(true);
    // 35 dias no status: passaria do limite de 7, não passa do de 60.
    expect(isStale(autorizado, HOJE)).toBe(false);
  });

  it("continua na régua do lembrete de disponibilidade", () => {
    expect(deveTerVerificacaoAberta(STATUS_AUTORIZACAO_ASSINADA)).toBe(true);
  });

  it("conta como captação ganha mesmo SEM 'Angariado' no histórico", () => {
    // O caso real: o Sistema Principal escreve a assinatura sobre um imóvel
    // que aqui ainda estava em "Documentação". Sem isto, a conversão de
    // captação leria como pendência um negócio já formalizado.
    const semHistorico = imovel({ status: STATUS_AUTORIZACAO_ASSINADA, statusHistory: [] });
    expect(captacaoGanha(semHistorico)).toBe(true);
    expect(categoriaMapa(semHistorico)).toBe("angariado");
  });
});

/* --- Os indicadores -------------------------------------------------------- */

describe("indicadoresIntegracao", () => {
  it("conta os três baldes sem sobreposição e soma o dinheiro", () => {
    const ind = indicadoresIntegracao(
      [
        imovel({ id: "a", status: "Angariado" }),
        imovel({ id: "b", status: STATUS_AUTORIZACAO_ASSINADA }),
        imovel({ id: "c", status: "Locado", valorAluguel: 2000, comissaoRecebida: true, comissaoRecebidaValor: 1920 }),
        imovel({ id: "d", status: "Locado", valorAluguel: 1000 }),
      ],
      100,
    );
    expect(ind.aguardandoAssinatura).toBe(1);
    expect(ind.autorizadas).toBe(1);
    expect(ind.locadas).toBe(2);
    expect(ind.comissoesRecebidas).toBe(1);
    expect(ind.comissoesPendentes).toBe(1);
    expect(ind.valorRecebido).toBe(1920);
    expect(ind.valorPendente).toBe(1000);
  });

  it("o imóvel PUBLICADO com autorização não volta a 'aguardando assinatura'", () => {
    // O caminho mais comum: o corretor publica o anúncio e move o card para
    // "Publicado", à frente da etapa da assinatura no funil. Perguntando só
    // ao status, o card cobraria para sempre um documento já assinado.
    const ind = indicadoresIntegracao(
      [imovel({ status: "Publicado", autorizacaoAssinadaEm: "2026-07-20" })],
      100,
    );
    expect(ind.aguardandoAssinatura).toBe(0);
    expect(ind.autorizadas).toBe(1);
  });

  it("o retirado sai de tudo — comissão que nunca será paga não é pendência", () => {
    const ind = indicadoresIntegracao([imovel({ status: "Locado", retirado: true })], 100);
    expect(ind.locadas).toBe(0);
    expect(ind.comissoesPendentes).toBe(0);
    expect(ind.valorPendente).toBe(0);
  });
});
