import { describe, expect, it } from "vitest";

import { ATRIBUICAO_MENSAGEM } from "@/lib/constantes";
import { addDaysISO } from "@/lib/datas";
import {
  resolverAtribuicaoMensagem,
  type ContextoAgendamento,
  type EntradaAtribuicao,
  type ImovelParaAtribuicao,
} from "@/lib/calculo/atribuicaoMensagem";
import { decidirImovelOperacional, type ResolucaoRelacional } from "@/lib/calculo/autoridadeAtribuicao";
import { TIPO_RETOMADA_RETIRADO } from "@/lib/mensagensAgendadas";
import { observarAtribuicao } from "@/lib/servidor/contatos";

/* Retirados, Fase B / B3: a resposta a uma retomada vai para o imóvel
   RETIRADO que a recebeu, e não para um ativo do mesmo dono.

   - motor: nível `contexto-retomada` entre o N1 e o "sem plausíveis", com
     retomada `enviada` na janela, concorrência de OUTRO imóvel como
     empate, e o contexto do próprio retirado fora da concorrência;
   - autoridade: o motor vence com terminal SÓ nesse nível e com
     `terminal === true`;
   - carga: `tipo` e `status` chegam ao motor, sem afrouxar tenant.

   A prova ponta a ponta na rota fica em `webhook-atribuicao-autoridade`, e
   a contra tabelas reais em `integration/retomada-atribuicao-supabase-local`. */

const CONTA = "conta-a";
const OUTRA = "conta-b";
const RECEBIDA = "2026-10-05T10:00";

function imovel(id: string, extra: Partial<ImovelParaAtribuicao> = {}): ImovelParaAtribuicao {
  return { id, userId: CONTA, status: "Publicado", retirado: false, ...extra };
}
const retirado = (id: string, extra: Partial<ImovelParaAtribuicao> = {}) => imovel(id, { retirado: true, ...extra });

/** Datetime local `horas` antes de RECEBIDA (só horas inteiras até 48). */
function antes(horas: number, minutos = 0): string {
  const totalMin = horas * 60 + minutos;
  const dias = Math.floor(totalMin / (24 * 60));
  const resto = totalMin - dias * 24 * 60;
  const [h, m] = RECEBIDA.slice(11).split(":").map(Number);
  let min = h * 60 + m - resto;
  let voltar = dias;
  if (min < 0) {
    min += 24 * 60;
    voltar += 1;
  }
  const dia = addDaysISO(RECEBIDA.slice(0, 10), -voltar);
  if (!dia) throw new Error("data de teste inválida");
  return `${dia}T${String(Math.floor(min / 60)).padStart(2, "0")}:${String(min % 60).padStart(2, "0")}`;
}

function retomada(imovelId: string, extra: Partial<ContextoAgendamento> = {}): ContextoAgendamento {
  return { enviadoEm: antes(2), imovelIds: [imovelId], tipo: TIPO_RETOMADA_RETIRADO, status: "enviada", ...extra };
}
function envio(imovelId: string, tipo = "verificacao-disponibilidade", enviadoEm = antes(3)): ContextoAgendamento {
  return { enviadoEm, imovelIds: [imovelId], tipo, status: "enviada" };
}
const tentativaPendente = () => ({ data: `${RECEBIDA.slice(0, 10)}T08:00`, aguardandoResultado: true });

function resolver(
  vinculos: ImovelParaAtribuicao[],
  agendamentos: ContextoAgendamento[] = [],
  texto = "oi, tudo bem",
  extra: Partial<EntradaAtribuicao> = {},
) {
  return resolverAtribuicaoMensagem({
    userId: CONTA,
    contatoId: "c1",
    mensagem: { texto, recebidaEm: RECEBIDA },
    vinculos,
    agendamentos,
    ...extra,
  });
}

describe("motor: contexto-retomada", () => {
  it("1. A retirado com retomada, sem outro contexto → A, terminal", () => {
    expect(resolver([retirado("a"), imovel("b")], [retomada("a")])).toMatchObject({
      ok: true,
      imovelId: "a",
      nivel: "contexto-retomada",
      terminal: true,
      evidencia: { tipo: "retomada", enviadoEm: antes(2) },
    });
  });

  it("2. vence o N4: B ativo sem contexto, que hoje ganharia como único plausível", () => {
    const vinculos = [retirado("a"), imovel("b")];
    expect(resolver(vinculos, [])).toMatchObject({ ok: true, imovelId: "b", nivel: "unico" });
    expect(resolver(vinculos, [retomada("a")])).toMatchObject({ ok: true, imovelId: "a", nivel: "contexto-retomada" });
  });

  it("3. B com tentativa pendente (N2) concorre → pendente no nível da retomada", () => {
    expect(resolver([retirado("a"), imovel("b", { tentativas: [tentativaPendente()] })], [retomada("a")])).toMatchObject({
      ok: false,
      motivo: "pendente",
      nivelEmpate: "contexto-retomada",
    });
  });

  it("4. B com envio na janela (N3) concorre → pendente", () => {
    expect(resolver([retirado("a"), imovel("b")], [retomada("a"), envio("b")])).toMatchObject({
      ok: false,
      nivelEmpate: "contexto-retomada",
    });
  });

  it("5. dois retirados com retomada → pendente, sem escolher o mais recente", () => {
    const r = resolver(
      [retirado("a"), retirado("c")],
      [retomada("a", { enviadoEm: antes(1) }), retomada("c", { enviadoEm: antes(5) })],
    );
    expect(r).toMatchObject({ ok: false, motivo: "pendente", nivelEmpate: "contexto-retomada" });
  });

  it("6. dois retirados, só A com retomada → A", () => {
    expect(resolver([retirado("a"), retirado("c")], [retomada("a")])).toMatchObject({ ok: true, imovelId: "a" });
  });

  it("7. só o retirado A (hoje: sem-candidatos) → A", () => {
    expect(resolver([retirado("a")], [])).toMatchObject({ ok: false, motivo: "sem-candidatos" });
    expect(resolver([retirado("a")], [retomada("a")])).toMatchObject({ ok: true, imovelId: "a", nivel: "contexto-retomada" });
  });

  it("8. exatamente 48 h antes → dentro", () => {
    expect(resolver([retirado("a"), imovel("b")], [retomada("a", { enviadoEm: antes(48) })])).toMatchObject({
      imovelId: "a",
      nivel: "contexto-retomada",
    });
  });

  it("9. 48 h e um minuto → fora: comportamento de antes (B pelo N4)", () => {
    expect(resolver([retirado("a"), imovel("b")], [retomada("a", { enviadoEm: antes(48, 1) })])).toMatchObject({
      imovelId: "b",
      nivel: "unico",
    });
  });

  it("envio posterior à resposta não é contexto dela", () => {
    const depois = `${RECEBIDA.slice(0, 11)}10:05`;
    expect(resolver([retirado("a"), imovel("b")], [retomada("a", { enviadoEm: depois })])).toMatchObject({ imovelId: "b" });
  });

  it("10. N1 continua soberano: o texto cita B", () => {
    expect(
      resolver([retirado("a"), imovel("b", { codigo: "LD-901" })], [retomada("a")], "sobre o LD-901, ainda está?"),
    ).toMatchObject({ ok: true, imovelId: "b", nivel: "referencia-explicita" });
  });

  it("11. A reativado antes da resposta: sem tratamento especial, o N3 normal resolve A", () => {
    expect(resolver([imovel("a"), imovel("b")], [retomada("a")])).toMatchObject({
      ok: true,
      imovelId: "a",
      nivel: "contexto-agendamento",
      terminal: false,
    });
  });

  it("12. contexto sem tipo → comportamento de antes", () => {
    const semTipo: ContextoAgendamento = { enviadoEm: antes(2), imovelIds: ["a"] };
    expect(resolver([retirado("a"), imovel("b")], [semTipo])).toMatchObject({ imovelId: "b", nivel: "unico" });
  });

  it("13. retirado de outra conta com retomada é ignorado", () => {
    expect(resolver([retirado("a", { userId: OUTRA }), imovel("b")], [retomada("a")])).toMatchObject({
      imovelId: "b",
      nivel: "unico",
    });
  });

  it.each(["livre", "verificacao-disponibilidade", "outro-tipo"])("14-15. tipo %s não ativa o nível", (tipo) => {
    expect(resolver([retirado("a"), imovel("b")], [retomada("a", { tipo })])).toMatchObject({ imovelId: "b", nivel: "unico" });
  });

  it.each(["agendada", "processando", "cancelada", "erro", null])("16-19. retomada com status %s não ativa", (status) => {
    expect(resolver([retirado("a"), imovel("b")], [retomada("a", { status })])).toMatchObject({ imovelId: "b", nivel: "unico" });
  });

  it("20. tentativa pendente do PRÓPRIO A não é concorrência", () => {
    expect(
      resolver([retirado("a", { tentativas: [tentativaPendente()] }), imovel("b")], [retomada("a")]),
    ).toMatchObject({ ok: true, imovelId: "a", nivel: "contexto-retomada" });
  });

  it("21. outro envio para o PRÓPRIO A não é concorrência", () => {
    expect(resolver([retirado("a"), imovel("b")], [retomada("a"), envio("a", "livre")])).toMatchObject({
      ok: true,
      imovelId: "a",
      nivel: "contexto-retomada",
    });
  });

  it("concorrência de B fora da janela do N3 não conta", () => {
    expect(resolver([retirado("a"), imovel("b")], [retomada("a"), envio("b", "livre", antes(48, 1))])).toMatchObject({
      imovelId: "a",
      nivel: "contexto-retomada",
    });
  });

  it("concorrência de imóvel terminal (Perdido) não conta: ele não é plausível", () => {
    expect(
      resolver([retirado("a"), imovel("p", { status: "Perdido", tentativas: [tentativaPendente()] })], [retomada("a"), envio("p")]),
    ).toMatchObject({ imovelId: "a", nivel: "contexto-retomada" });
  });

  it("retomada consolidada não existe, mas uma que cite A e B só vale para o retirado", () => {
    const c: ContextoAgendamento = { ...retomada("a"), imovelIds: ["a", "b"] };
    // B não é retirado: a retomada não o torna candidato do NR; e o mesmo
    // envio conta como N3 de B, o que é concorrência.
    expect(resolver([retirado("a"), imovel("b")], [c])).toMatchObject({ ok: false, nivelEmpate: "contexto-retomada" });
  });

  it("22. a ordem da entrada não muda o resultado", () => {
    const vinculos = [retirado("a"), imovel("b"), retirado("c")];
    const contextos = [retomada("a"), envio("c", "livre")];
    const base = resolver(vinculos, contextos);
    expect(resolver([...vinculos].reverse(), [...contextos].reverse())).toEqual(base);
    const empate = [retomada("a"), retomada("c")];
    expect(resolver([...vinculos].reverse(), [...empate].reverse())).toEqual(resolver(vinculos, empate));
  });

  it("sem retomada nenhuma, o resultado é idêntico ao de antes em todos os níveis", () => {
    const casos: [ImovelParaAtribuicao[], ContextoAgendamento[], string][] = [
      [[imovel("a"), imovel("b", { tentativas: [tentativaPendente()] })], [], "oi"],
      [[imovel("a"), imovel("b")], [envio("a")], "oi"],
      [[imovel("a", { codigo: "LD-77" }), imovel("b")], [], "LD-77"],
      [[retirado("a"), imovel("b")], [envio("b", "livre")], "oi"],
    ];
    for (const [vinculos, contextos, texto] of casos) {
      const semCampos = contextos.map(({ enviadoEm, imovelIds }) => ({ enviadoEm, imovelIds }));
      expect(resolver(vinculos, contextos, texto)).toEqual(resolver(vinculos, semCampos, texto));
    }
  });
});

describe("janela própria da retomada", () => {
  it("é de 48 h e nunca maior que a janela que limita a consulta (a do N3)", () => {
    expect(ATRIBUICAO_MENSAGEM.janelaRetomadaHoras).toBe(48);
    expect(ATRIBUICAO_MENSAGEM.janelaRetomadaHoras).toBeLessThanOrEqual(ATRIBUICAO_MENSAGEM.janelaAgendamentoHoras);
  });

  it("é independente da do N3 no motor", () => {
    const vinculos = [retirado("a"), imovel("b")];
    const r = resolver(vinculos, [retomada("a", { enviadoEm: antes(10) })], "oi", {
      config: { janelaRetomadaHoras: 5 },
    });
    expect(r).toMatchObject({ imovelId: "b", nivel: "unico" });
  });
});

describe("autoridade: exceção controlada para o terminal da retomada", () => {
  const LEGADO = "imovel-b";
  const base = (extra: Partial<ResolucaoRelacional>): ResolucaoRelacional => ({
    estado: "resolvido",
    imovelId: "imovel-a",
    terminal: true,
    nivel: "contexto-retomada",
    contatoId: "c1",
    candidatos: [LEGADO],
    terminais: ["imovel-a"],
    ...extra,
  });

  it("contexto-retomada + terminal true → motor", () => {
    expect(decidirImovelOperacional(LEGADO, base({}))).toEqual({
      autoridade: "motor",
      imovelId: "imovel-a",
      fallbackMotivo: null,
      concordante: false,
    });
  });

  it("contexto-retomada + terminal false → regra comum (motor, por não ser terminal)", () => {
    expect(decidirImovelOperacional(LEGADO, base({ terminal: false }))).toMatchObject({ autoridade: "motor" });
  });

  it("contexto-retomada sem a marca de terminal → legado", () => {
    const semMarca = { ...base({}), terminal: undefined } as unknown as ResolucaoRelacional;
    expect(decidirImovelOperacional(LEGADO, semMarca)).toMatchObject({ autoridade: "legado", fallbackMotivo: "terminal" });
  });

  it.each(["referencia-explicita", "contexto-tentativa", "contexto-agendamento", "unico", null])(
    "nível %s com terminal true → legado",
    (nivel) => {
      expect(decidirImovelOperacional(LEGADO, base({ nivel }))).toMatchObject({ autoridade: "legado", fallbackMotivo: "terminal" });
    },
  );

  it("contexto-retomada sem imóvel → resolução incompleta, legado", () => {
    expect(decidirImovelOperacional(LEGADO, base({ imovelId: null }))).toMatchObject({
      autoridade: "legado",
      fallbackMotivo: "resolucao-incompleta",
    });
  });

  it("estado que não é resolvido não ganha pela exceção", () => {
    expect(decidirImovelOperacional(LEGADO, base({ estado: "pendente" }))).toMatchObject({ autoridade: "legado" });
  });
});

/* ----------------------------------------------------------------
   Carga: um banco falso que APLICA os filtros, para provar tenant e
   status pelo resultado, não só pelo texto da consulta.
   ---------------------------------------------------------------- */
type Linha = Record<string, unknown>;

function bancoFalso(tabelas: Record<string, Linha[]>) {
  const pedidos: { tabela: string; colunas: string; eq: [string, unknown][] }[] = [];
  return {
    pedidos,
    cliente: {
      from(tabela: string) {
        const eq: [string, unknown][] = [];
        const inn: [string, unknown[]][] = [];
        const is: [string, unknown][] = [];
        const gte: [string, string][] = [];
        const pedido = { tabela, colunas: "", eq };
        pedidos.push(pedido);
        const linhas = () =>
          (tabelas[tabela] || []).filter(
            (l) =>
              eq.every(([c, v]) => l[c] === v) &&
              inn.every(([c, vs]) => vs.includes(l[c])) &&
              is.every(([c, v]) => (l[c] ?? null) === v) &&
              gte.every(([c, v]) => String(l[c] ?? "") >= v),
          );
        const chain = {
          select: (colunas: string) => ((pedido.colunas = colunas), chain),
          eq: (c: string, v: unknown) => (eq.push([c, v]), chain),
          in: (c: string, v: unknown[]) => (inn.push([c, v]), chain),
          is: (c: string, v: unknown) => (is.push([c, v]), chain),
          gte: (c: string, v: string) => (gte.push([c, v]), chain),
          maybeSingle: async () => ({ data: linhas()[0] ?? null, error: null }),
          then: (ok: (r: unknown) => unknown, erro?: (e: unknown) => unknown) =>
            Promise.resolve({ data: linhas(), error: null }).then(ok, erro),
        };
        return chain;
      },
    },
  };
}

/** "2026-10-05T10:00" em São Paulo (UTC−3) = 13:00Z. */
const RECEBIDA_UTC_MS = Date.UTC(2026, 9, 5, 13, 0);
const utcHorasAntes = (h: number) => new Date(RECEBIDA_UTC_MS - h * 3_600_000).toISOString();

function cenarioCarga(mensagens: Linha[]) {
  return bancoFalso({
    contatos_telefones: [{ contato_id: "c1", user_id: CONTA, telefone_canonico: "4399990001", desativado_em: null }],
    contatos: [{ id: "c1", user_id: CONTA, fundido_em_contato_id: null }],
    imoveis_contatos: [
      { imovel_id: "a", contato_id: "c1", user_id: CONTA, encerrado_em: null },
      { imovel_id: "b", contato_id: "c1", user_id: CONTA, encerrado_em: null },
    ],
    imoveis: [
      { id: "a", user_id: CONTA, codigo: null, status: "Publicado", retirado: true, tentativas: [] },
      { id: "b", user_id: CONTA, codigo: null, status: "Publicado", retirado: false, tentativas: [] },
    ],
    mensagens_agendadas: mensagens,
  });
}
const linhaMensagem = (extra: Linha): Linha => ({
  user_id: CONTA,
  imovel_id: "a",
  imoveis_consultados: null,
  enviado_em: utcHorasAntes(2),
  tipo: TIPO_RETOMADA_RETIRADO,
  status: "enviada",
  ...extra,
});

async function observarCom(mensagens: Linha[]) {
  const banco = cenarioCarga(mensagens);
  const observacao = await observarAtribuicao(banco.cliente as never, {
    userId: CONTA,
    telefoneCanonico: "4399990001",
    texto: "oi",
    recebidaEm: RECEBIDA,
    legadoImovelId: "b",
    direcao: "recebida",
  });
  return { observacao, pedidos: banco.pedidos };
}

describe("carga: tipo e status chegam ao motor, sem afrouxar tenant", () => {
  it("a consulta dos envios pede tipo e status, filtra a conta e só os enviados", async () => {
    const { observacao, pedidos } = await observarCom([linhaMensagem({})]);
    const pedido = pedidos.find((p) => p.tabela === "mensagens_agendadas")!;
    expect(pedido.colunas).toBe("imovel_id, imoveis_consultados, enviado_em, tipo, status");
    expect(pedido.eq).toEqual(expect.arrayContaining([["user_id", CONTA], ["status", "enviada"]]));
    expect(observacao).toMatchObject({ estado: "resolvido", novoImovelId: "a", nivel: "contexto-retomada", terminal: true });
  });

  it("retomada de outra conta não chega ao motor", async () => {
    const { observacao } = await observarCom([linhaMensagem({ user_id: OUTRA })]);
    expect(observacao).toMatchObject({ estado: "resolvido", novoImovelId: "b", nivel: "unico" });
  });

  it.each(["agendada", "processando", "cancelada", "erro"])("retomada %s não é carregada", async (status) => {
    const { observacao } = await observarCom([linhaMensagem({ status })]);
    expect(observacao).toMatchObject({ novoImovelId: "b", nivel: "unico" });
  });

  it("verificação enviada para A retirado não vira retomada", async () => {
    const { observacao } = await observarCom([linhaMensagem({ tipo: "verificacao-disponibilidade" })]);
    expect(observacao).toMatchObject({ novoImovelId: "b", nivel: "unico" });
  });
});
