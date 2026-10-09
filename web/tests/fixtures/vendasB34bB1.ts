/* Cliente sintético de navegador. Não implementa transações: estas são provadas em PGlite. */
import { CONTATO_ANA, USUARIO, eventosPadrao, linhaOportunidade } from "./vendasB34a";
import { decodificarLinhaOportunidadeVenda } from "@/lib/persistencia/vendasDecodificacao";
export { CONTATO_ANA, USUARIO };
export const OUTRO_USUARIO = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
export const CONTATO_ARQUIVADO = "c0000000-0000-4000-8000-00000000000d";
type Linha = Record<string, unknown>;
export function contatoB1(id = CONTATO_ANA, extra: Linha = {}): Linha {
  return { id, user_id: USUARIO, nome: "Ana Sintética", arquivado_em: null, fundido_em_contato_id: null, anonimizado_em: null, ...extra };
}
export function bancoSinteticoB1() {
  const estado = {
    usuario: USUARIO as string | null, erroLeitura: false, atraso: 0,
    ignorarEscopo: false, proximoErro: null as string | null,
    aposCommit: null as "timeout" | "invalida" | null,
    tabelas: { contatos: [contatoB1(), contatoB1(CONTATO_ARQUIVADO, { nome: "Bruno Arquivado", arquivado_em: "2026-10-01" }),
      contatoB1("c0000000-0000-4000-8000-00000000000e", { nome: "Pessoa de outra conta", user_id: OUTRO_USUARIO })],
      contatos_telefones: [{ id: "f0000000-0000-4000-8000-000000000001", user_id: USUARIO, contato_id: CONTATO_ANA, telefone: "5543998024316", desativado_em: null }],
      vendas_oportunidades: [], vendas_oportunidades_eventos: [], vendas_imoveis_referencias: [] } as Record<string, Linha[]>,
    consultas: [] as { tabela: string; colunas: string; filtros: [string, string, unknown][]; intervalo: number[] }[],
    chamadas: [] as { nome: string; comando: Linha }[], recibos: new Map<string, { assinatura: string; resposta: unknown }>(),
  };
  const erro = (codigo: string) => ({ data: null, error: {
    code: codigo === "nao-autenticado" ? "PT401" : codigo === "conflito-transitorio" ? "PT503" :
      ["falha-interna", "dado-persistido-invalido"].includes(codigo) ? "PT500" :
      ["telefone-ja-cadastrado", "telefone-em-revisao", "interessado-ambiguo", "interessado-indisponivel", "chave-idempotencia-conflitante"].includes(codigo) ? "PT409" : "PT422",
    details: JSON.stringify({ contrato: "vendas-b2-v1", codigo, motivo: null }),
  } });
  const cliente = {
    auth: { async getUser() { return { data: { user: estado.usuario ? { id: estado.usuario } : null }, error: null }; } },
    from(tabela: string) {
      if (!Object.hasOwn(estado.tabelas, tabela)) throw new Error(`Tabela fora do escopo: ${tabela}`);
      const r = { tabela, colunas: "", filtros: [] as [string, string, unknown][], intervalo: [0, Infinity] };
      estado.consultas.push(r);
      const q = {
        eq(c: string, v: unknown) { r.filtros.push(["eq", c, v]); return q; },
        is(c: string, v: null) { r.filtros.push(["is", c, v]); return q; },
        in(c: string, v: readonly string[]) { r.filtros.push(["in", c, v]); return q; },
        order() { return q; }, range(a: number, b: number) { r.intervalo = [a, b]; return q; },
        then(resolve: (v: { data: unknown; error: unknown }) => unknown, reject?: (e: unknown) => unknown) {
          return (async () => {
            if (estado.atraso) await new Promise((res) => setTimeout(res, estado.atraso));
            if (estado.erroLeitura) throw new TypeError("Rede sintética indisponível");
            let linhas = estado.tabelas[tabela].filter((l) => estado.ignorarEscopo || !l.user_id || l.user_id === estado.usuario);
            for (const [op, c, v] of r.filtros) {
              if (estado.ignorarEscopo && c === "user_id") continue;
              linhas = linhas.filter((l) => op === "in" ? (v as string[]).includes(l[c] as string) : l[c] === v);
            }
            linhas = linhas.sort((a, b) => String(a.id).localeCompare(String(b.id))).slice(r.intervalo[0], r.intervalo[1] + 1);
            const chaves = r.colunas.split(",").map((c) => c.split("::")[0]);
            return { data: linhas.map((l) => Object.fromEntries(chaves.map((c) => [c, l[c]]))), error: null };
          })().then(resolve, reject);
        },
      };
      return { select(colunas: string) { r.colunas = colunas; return q; } };
    },
    async rpc(nome: string, args: { p_comando: Linha }) {
      if (nome !== "vendas_criar_oportunidade") throw new Error("Porta fora da criação");
      const c = structuredClone(args.p_comando); estado.chamadas.push({ nome, comando: c });
      if (estado.atraso) await new Promise((res) => setTimeout(res, estado.atraso));
      if (estado.proximoErro) { const codigo = estado.proximoErro; estado.proximoErro = null; return erro(codigo); }
      const chave = c.chaveIdempotencia as string, assinatura = JSON.stringify(c), salvo = estado.recibos.get(chave);
      if (salvo) return salvo.assinatura === assinatura ? { data: salvo.resposta, error: null } : erro("chave-idempotencia-conflitante");
      const i = c.interessado as { modo: string; contatoId?: string; nome?: string; telefone?: string | null };
      let contatoId = i.contatoId;
      if (i.modo === "novo") {
        if (i.telefone && estado.tabelas.contatos_telefones.some((t) => t.telefone === i.telefone?.replace(/\D/g, ""))) return erro("telefone-ja-cadastrado");
        contatoId = crypto.randomUUID(); estado.tabelas.contatos.push(contatoB1(contatoId, { nome: i.nome }));
        if (i.telefone) estado.tabelas.contatos_telefones.push({ id: crypto.randomUUID(), user_id: USUARIO, contato_id: contatoId, telefone: i.telefone, desativado_em: null });
      }
      if (!estado.tabelas.contatos.some((t) => t.id === contatoId && t.user_id === estado.usuario)) return erro("contato-invalido");
      const origem = c.origem as { tipo: string; descricao: string | null } | null;
      const op = linhaOportunidade({ id: crypto.randomUUID(), contato_id: contatoId, origem_tipo: origem?.tipo ?? null, origem_descricao: origem?.descricao ?? null,
        valor_negocio_previsto: c.valorNegocioPrevisto ?? null, receita_prevista: c.receitaPrevista ?? null });
      const ev = eventosPadrao(op.id as string)[0]; ev.id = crypto.randomUUID(); ev.chave_idempotencia = chave;
      const valores = { valorNegocioPrevisto: c.valorNegocioPrevisto ?? null, valorNegocioFechado: null, receitaPrevista: c.receitaPrevista ?? null };
      ev.payload = { versaoContrato: 1, dados: { contatoId, imovelTratado: null, origem, valores } };
      estado.tabelas.vendas_oportunidades.push(op); estado.tabelas.vendas_oportunidades_eventos.push(ev);
      const o = decodificarLinhaOportunidadeVenda(op, null);
      const resposta = { contrato: "vendas-b2-v1", ok: true, noOp: false, oportunidade: { ...o, versao: "1", valores },
        evento: { id: ev.id, userId: USUARIO, oportunidadeId: op.id, tipo: ev.tipo, atorUsuarioId: USUARIO, registradoEm: o.criadoEm,
          dataFato: null, versao: "1", chaveIdempotencia: chave, versaoContrato: 1, dados: (ev.payload as { dados: unknown }).dados } };
      estado.recibos.set(chave, { assinatura, resposta });
      if (estado.aposCommit) { const modo = estado.aposCommit; estado.aposCommit = null; if (modo === "timeout") throw new TypeError("Timeout após commit sintético"); return { data: {}, error: null }; }
      return { data: resposta, error: null };
    },
  };
  return { estado, cliente };
}
