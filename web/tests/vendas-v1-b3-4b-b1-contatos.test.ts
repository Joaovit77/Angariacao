import { describe, expect, it } from "vitest";
import { listarContatosCandidatosVenda, type ClienteContatosVenda } from "@/lib/persistencia/vendasContatosLeitura";
import { bancoSinteticoB1, contatoB1, CONTATO_ANA, USUARIO } from "./fixtures/vendasB34bB1";
describe("B3.4b-B1: leitura autenticada mínima", () => {
  it("nome ausente permitido pelo schema não derruba a seleção dos demais contatos", async () => {
    const { estado, cliente } = bancoSinteticoB1();
    estado.tabelas.contatos[0].nome = null;
    const r = await listarContatosCandidatosVenda(cliente as unknown as ClienteContatosVenda);
    expect(r).toMatchObject({ ok: true, dados: expect.arrayContaining([{ id: CONTATO_ANA, nome: "Contato sem nome", telefones: ["5543998024316"], arquivado: false }]) });
  });
  it("próprio, sem telefone e arquivado; exclui fundido, anonimizado e outra conta", async () => {
    const { estado, cliente } = bancoSinteticoB1();
    estado.tabelas.contatos.push(contatoB1(crypto.randomUUID(), { fundido_em_contato_id: CONTATO_ANA }), contatoB1(crypto.randomUUID(), { anonimizado_em: "2026-01-01" }));
    const r = await listarContatosCandidatosVenda(cliente as unknown as ClienteContatosVenda);
    expect(r).toEqual({ ok: true, usuarioId: USUARIO, dados: [
      { id: CONTATO_ANA, nome: "Ana Sintética", telefones: ["5543998024316"], arquivado: false },
      { id: "c0000000-0000-4000-8000-00000000000d", nome: "Bruno Arquivado", telefones: [], arquivado: true },
    ] });
    for (const q of estado.consultas) { expect(q.filtros).toContainEqual(["eq", "user_id", USUARIO]); expect(q.colunas).not.toMatch(/email|observacoes|documento|\*/); }
  });
  it("resposta estrangeira mesmo com RLS defeituosa é recusada sem PII parcial", async () => {
    const { estado, cliente } = bancoSinteticoB1(); estado.ignorarEscopo = true;
    expect(await listarContatosCandidatosVenda(cliente as unknown as ClienteContatosVenda)).toEqual({ ok: false, erro: "resposta-invalida" });
  });
  it("pagina contatos e telefones, sem truncar em 500/1000", async () => {
    const { estado, cliente } = bancoSinteticoB1();
    estado.tabelas.contatos = Array.from({ length: 1001 }, (_, n) => contatoB1(`c0000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`));
    estado.tabelas.contatos_telefones = Array.from({ length: 501 }, (_, n) => ({ id: `f0000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`, user_id: USUARIO, contato_id: estado.tabelas.contatos[n].id, telefone: "5543998024316", desativado_em: null }));
    const r = await listarContatosCandidatosVenda(cliente as unknown as ClienteContatosVenda);
    expect(r.ok && r.dados.length).toBe(1001); expect(estado.consultas.map((c) => c.intervalo)).toEqual([[0, 499], [500, 999], [1000, 1499], [0, 499], [500, 999]]);
  });
  it("sem sessão não consulta; erro de rede, vazio e resposta malformada são distintos", async () => {
    const { estado, cliente } = bancoSinteticoB1(); const c = cliente as unknown as ClienteContatosVenda;
    estado.usuario = null; expect(await listarContatosCandidatosVenda(c)).toEqual({ ok: false, erro: "nao-autenticado" }); expect(estado.consultas).toHaveLength(0);
    estado.usuario = USUARIO; estado.erroLeitura = true; expect(await listarContatosCandidatosVenda(c)).toEqual({ ok: false, erro: "transporte-indisponivel" });
    estado.erroLeitura = false; estado.tabelas.contatos = []; expect(await listarContatosCandidatosVenda(c)).toEqual({ ok: true, usuarioId: USUARIO, dados: [] });
    estado.tabelas.contatos = [contatoB1("id-ruim")]; expect(await listarContatosCandidatosVenda(c)).toEqual({ ok: false, erro: "resposta-invalida" });
  });
});
