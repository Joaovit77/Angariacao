import { describe, expect, it } from "vitest";
import { RASCUNHO_CRIACAO_VENDA, ERROS_CRIACAO_VENDA, filtrarContatosVenda, validarPedidoPendenteVenda, validarRascunhoCriacaoVenda, valorDigitadoVenda } from "@/components/vendas/criacaoVenda";
import { CONTATO_ANA } from "./fixtures/vendasB34bB1";
const novo = { ...RASCUNHO_CRIACAO_VENDA, modo: "novo" as const, nome: " Ana " };
describe("B3.4b-B1: contrato do formulário", () => {
  it("nome aparado, telefone vazio explicitamente null, sem etapa nem imóvel", () => {
    const r = validarRascunhoCriacaoVenda({ ...novo, telefone: "   " });
    expect(r).toEqual({ ok: true, dados: { interessado: { modo: "novo", nome: "Ana", telefone: null }, origem: null, valorNegocioPrevisto: null, receitaPrevista: null } });
  });
  it("existente usa id explícito e não vaza campos do modo novo", () => {
    expect(validarRascunhoCriacaoVenda({ ...novo, modo: "existente", contatoId: CONTATO_ANA })).toMatchObject({ ok: true, dados: { interessado: { modo: "existente", contatoId: CONTATO_ANA } } });
    expect(validarRascunhoCriacaoVenda({ ...novo, modo: "existente" })).toMatchObject({ ok: false, campo: "contatoId" });
  });
  it("limites em pontos de código e telefone canônico pelo contrato existente", () => {
    for (const nome of ["", "  ", "😀".repeat(201)]) expect(validarRascunhoCriacaoVenda({ ...novo, nome })).toMatchObject({ ok: false, campo: "nome" });
    expect(validarRascunhoCriacaoVenda({ ...novo, nome: "😀".repeat(200) }).ok).toBe(true);
    expect(validarRascunhoCriacaoVenda({ ...novo, telefone: "(43) 99802-4316" }).ok).toBe(true);
    for (const telefone of ["abc", "123", "ana@exemplo.test", "+1 4155552671"]) expect(validarRascunhoCriacaoVenda({ ...novo, telefone })).toMatchObject({ ok: false, campo: "telefone" });
  });
  it.each([["", null], ["  ", null], ["0", 0], ["0,00", 0], ["1200,50", 1200.5], ["1.25", 1.25], ["-1", undefined], ["NaN", undefined], ["Infinity", undefined], ["9".repeat(400), undefined], ["1.000,00", undefined]])("valor %s preserva ausência/zero/decimal", (entrada, esperado) => expect(valorDigitadoVenda(entrada as string)).toBe(esperado));
  it("zero e origem comercial vão ao comando; origem do contato não é enviada", () => {
    const r = validarRascunhoCriacaoVenda({ ...novo, valor: "0", receita: "0,50", origem: "indicacao", descricaoOrigem: " Maria " });
    expect(r).toMatchObject({ ok: true, dados: { valorNegocioPrevisto: 0, receitaPrevista: 0.5, origem: { tipo: "indicacao", descricao: "Maria" } } });
    if (r.ok) expect(Object.keys(r.dados).sort()).toEqual(["interessado", "origem", "receitaPrevista", "valorNegocioPrevisto"]);
  });
  it("busca humana por nome sem acento ou telefone, sem dedupe por nome", () => {
    const c = [CONTATO_ANA, "outro"].map((id) => ({ id, nome: "Âna", telefones: ["5543998024316"], arquivado: false }));
    expect(filtrarContatosVenda(c, "ana")).toHaveLength(2); expect(filtrarContatosVenda(c, "99802")).toHaveLength(2); expect(filtrarContatosVenda(c, "xyz")).toHaveLength(0);
  });
  it("pedido persistido é fechado e recusa corrupção", () => {
    const c = { chaveIdempotencia: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", interessado: { modo: "novo", nome: "Ana", telefone: null } };
    expect(validarPedidoPendenteVenda(c)).toBe(true);
    for (const invalido of [null, [], { ...c, etapa: "nova" }, { ...c, imovelTratado: null }, { ...c, interessado: { ...c.interessado, email: "x" } }, { ...c, receitaPrevista: Infinity }, { ...c, origem: { tipo: "x" } }]) expect(validarPedidoPendenteVenda(invalido)).toBe(false);
  });
  it("todos os erros solicitados possuem mensagem humana sem detalhes internos", () => {
    expect(Object.keys(ERROS_CRIACAO_VENDA)).toHaveLength(19);
    for (const texto of Object.values(ERROS_CRIACAO_VENDA)) expect(texto).not.toMatch(/SQL|PT409|user_id|constraint|SELECT/);
  });
});
