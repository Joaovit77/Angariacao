import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  COLUNAS_CONTATO_VENDA, COLUNAS_EVENTO_VENDA, COLUNAS_OPORTUNIDADE_VENDA, COLUNAS_REFERENCIA_VENDA,
  listarEventosVenda, listarOportunidadesVenda, type OportunidadeListadaVenda,
} from "@/lib/persistencia/vendasLeitura";
import { FILTROS_INICIAIS_VENDA, filtrarOportunidadesVenda, ordenarOportunidadesVenda } from "@/components/vendas/filtrosVenda";
import {
  ROTULOS_ESTADO_VENDA, ROTULOS_EVENTO_VENDA, ROTULOS_MOTIVO_PERDA_VENDA, ROTULOS_ORIGEM_VENDA, detalheEventoVenda, detalheImovelVenda,
  fmtInstanteVenda, fmtValorVenda, origemImovelVenda, rotuloInteressadoVenda, rotuloOrigemVenda, tituloImovelVenda, valorPrincipalVenda,
} from "@/components/vendas/rotulosVenda";
import { ESTADOS_VENDA, MOTIVOS_PERDA_VENDA, ORIGENS_COMERCIAIS_VENDA } from "@/lib/vendas/tipos";
import { PORTAS_VENDAS, PORTA_RESOLVER_INTERESSADO_VENDA } from "@/lib/persistencia/vendasComandos";
import {
  CONTATO_ANA, CONTATO_ILEGIVEL, CONTATO_SEM_NOME, OP_GANHA, OP_NOVA, OP_PERDIDA_ARQUIVADA, OP_REFERENCIA, REFERENCIA,
  clienteFalso, contatosPadrao, eventosPadrao, linhaOportunidade, oportunidadesPadrao, referenciaPadrao,
} from "./fixtures/vendasB34a";

const RAIZ = join(__dirname, "..");
const fonte = (caminho: string) => readFileSync(join(RAIZ, caminho), "utf8");

async function listarPadrao() {
  const falso = clienteFalso({ vendas_oportunidades: oportunidadesPadrao(), vendas_imoveis_referencias: [referenciaPadrao()], contatos: contatosPadrao() });
  const resultado = await listarOportunidadesVenda(falso.cliente);
  if (!resultado.ok) throw new Error("leitura recusada: " + resultado.erro);
  return { ...falso, itens: resultado.dados };
}
const porId = (itens: OportunidadeListadaVenda[], id: string) => itens.find((item) => item.oportunidade.id === id)!;

describe("B3.4a: vendasLeitura (cliente falso)", () => {
  it("consultas exatas: só SELECT, colunas fechadas, ordem por updated_at, nenhum filtro de usuário vindo do chamador", async () => {
    const { consultas } = await listarPadrao();
    expect(consultas.map((c) => c.tabela)).toEqual(["vendas_oportunidades", "vendas_imoveis_referencias", "contatos"]);
    expect(consultas[0]).toEqual({ tabela: "vendas_oportunidades", colunas: COLUNAS_OPORTUNIDADE_VENDA, filtros: [], ordem: [["updated_at", false], ["id", false]] });
    expect(consultas[1]).toEqual({ tabela: "vendas_imoveis_referencias", colunas: COLUNAS_REFERENCIA_VENDA, filtros: [["in", "id", [REFERENCIA]]], ordem: [] });
    expect(consultas[2].colunas).toBe("id,nome");
    expect(consultas[2].filtros).toEqual([["in", "id", [CONTATO_ANA, CONTATO_SEM_NOME, CONTATO_ILEGIVEL]]]);
    for (const c of consultas) expect(c.filtros.some(([, coluna]) => coluna === "user_id")).toBe(false);
  });

  it("do contato sai só o nome: nada de telefone, observações ou metadados", () => {
    expect(COLUNAS_CONTATO_VENDA).toBe("id,nome");
    for (const colunas of [COLUNAS_OPORTUNIDADE_VENDA, COLUNAS_REFERENCIA_VENDA, COLUNAS_EVENTO_VENDA, COLUNAS_CONTATO_VENDA]) {
      expect(colunas).not.toMatch(/telefone|observac|metadados|\*/);
    }
    // numeric/bigint chegam como texto exato para o decodificador estrito.
    expect(COLUNAS_OPORTUNIDADE_VENDA).toContain("valor_negocio_previsto::text");
    expect(COLUNAS_OPORTUNIDADE_VENDA).toContain("versao::text");
    expect(COLUNAS_EVENTO_VENDA).toContain("versao::text");
  });

  it("monta nome, imóvel e valores; contato sem nome e ilegível caem no mesmo fallback", async () => {
    const { itens } = await listarPadrao();
    // A ordem é a do banco (order by updated_at desc, id desc); a leitura não reordena.
    expect(itens.map((i) => i.oportunidade.id)).toEqual([OP_NOVA, OP_REFERENCIA, OP_GANHA, OP_PERDIDA_ARQUIVADA]);
    expect(porId(itens, OP_NOVA).interessadoNome).toBe("Ana Compradora");
    expect(porId(itens, OP_REFERENCIA).interessadoNome).toBeNull();
    expect(porId(itens, OP_PERDIDA_ARQUIVADA).interessadoNome).toBeNull();
    expect(rotuloInteressadoVenda(null)).toBe("Contato sem nome");
    expect(porId(itens, OP_NOVA).imovel).toEqual({ tipo: "nenhum" });
    expect(porId(itens, OP_REFERENCIA).imovel).toEqual({ tipo: "referencia", codigo: "LD-77", referencia: "CRM-77", endereco: "Av. Brasil, 500", unidade: "301", bloco: null, naCarteira: true });
    expect(porId(itens, OP_GANHA).imovel).toEqual({ tipo: "manual", endereco: "Rua das Palmeiras, 100", referencia: null, unidade: "12", bloco: "B", descricaoCurta: null });
    expect(porId(itens, OP_REFERENCIA).oportunidade.valores).toEqual({ valorNegocioPrevisto: 350000.5, valorNegocioFechado: null, receitaPrevista: 17500 });
    expect(porId(itens, OP_NOVA).oportunidade.valores.valorNegocioPrevisto).toBe(0);
  });

  it("lista vazia não consulta referências nem contatos", async () => {
    const { cliente, consultas } = clienteFalso({ vendas_oportunidades: [] });
    expect(await listarOportunidadesVenda(cliente)).toEqual({ ok: true, dados: [] });
    expect(consultas.map((c) => c.tabela)).toEqual(["vendas_oportunidades"]);
  });

  it("erros viram código fechado: rede, sessão, interno e linha fora do contrato", async () => {
    expect(await listarOportunidadesVenda(clienteFalso({ vendas_oportunidades: "rede" }).cliente)).toEqual({ ok: false, erro: "transporte-indisponivel" });
    expect(await listarOportunidadesVenda(clienteFalso({ vendas_oportunidades: { error: { code: "42501" } } }).cliente)).toEqual({ ok: false, erro: "nao-autenticado" });
    expect(await listarOportunidadesVenda(clienteFalso({ vendas_oportunidades: { error: { code: "XX000" } } }).cliente)).toEqual({ ok: false, erro: "falha-interna" });
    for (const linha of [linhaOportunidade({ valor_negocio_previsto: 0.1 }), linhaOportunidade({ estado: "ganha" }), { ...linhaOportunidade(), telefone: "43999990000" }]) {
      expect(await listarOportunidadesVenda(clienteFalso({ vendas_oportunidades: [linha], contatos: [] }).cliente)).toEqual({ ok: false, erro: "resposta-invalida" });
    }
    // Referência ausente (ou de outra conta) não vira imóvel inventado.
    const semReferencia = clienteFalso({ vendas_oportunidades: [oportunidadesPadrao()[1]], vendas_imoveis_referencias: [], contatos: [] });
    expect(await listarOportunidadesVenda(semReferencia.cliente)).toEqual({ ok: false, erro: "resposta-invalida" });
    const falhaContatos = clienteFalso({ vendas_oportunidades: [linhaOportunidade()], contatos: "rede" });
    expect(await listarOportunidadesVenda(falhaContatos.cliente)).toEqual({ ok: false, erro: "transporte-indisponivel" });
  });

  it("referência cujo imóvel saiu da carteira continua exibindo o retrato gravado", async () => {
    const { cliente } = clienteFalso({ vendas_oportunidades: [oportunidadesPadrao()[1]], vendas_imoveis_referencias: [referenciaPadrao({ imovel_id: null })], contatos: [] });
    const resultado = await listarOportunidadesVenda(cliente);
    if (!resultado.ok) throw new Error(resultado.erro);
    expect(resultado.dados[0].imovel).toMatchObject({ tipo: "referencia", codigo: "LD-77", naCarteira: false });
    expect(origemImovelVenda(resultado.dados[0].imovel)).toBe("Imóvel da carteira (não está mais na carteira)");
  });

  it("histórico: só da oportunidade pedida, versão crescente, decodificado", async () => {
    const { cliente, consultas } = clienteFalso({ vendas_oportunidades_eventos: [...eventosPadrao(), ...eventosPadrao(OP_NOVA).slice(0, 1)] });
    const resultado = await listarEventosVenda(OP_REFERENCIA, cliente);
    if (!resultado.ok) throw new Error(resultado.erro);
    expect(resultado.dados.map((e) => [e.tipo, e.versao])).toEqual([["oportunidade_criada", 1], ["etapa_alterada", 2], ["valor_alterado", 3]]);
    expect(consultas).toEqual([{ tabela: "vendas_oportunidades_eventos", colunas: COLUNAS_EVENTO_VENDA, filtros: [["eq", "oportunidade_id", OP_REFERENCIA]], ordem: [["versao", true]] }]);
  });

  it("histórico fora de ordem, de outra oportunidade ou com payload estranho é recusado", async () => {
    const [a, b] = eventosPadrao();
    expect(await listarEventosVenda(OP_REFERENCIA, clienteFalso({ vendas_oportunidades_eventos: [b, a] }).cliente)).toEqual({ ok: false, erro: "resposta-invalida" });
    expect(await listarEventosVenda(OP_REFERENCIA, clienteFalso({ vendas_oportunidades_eventos: [{ ...a, payload: { versaoContrato: 1, dados: {}, extra: 1 } }] }).cliente))
      .toEqual({ ok: false, erro: "resposta-invalida" });
    expect(await listarEventosVenda(OP_REFERENCIA, clienteFalso({ vendas_oportunidades_eventos: "rede" }).cliente)).toEqual({ ok: false, erro: "transporte-indisponivel" });
  });
});

describe("B3.4a: ordem e filtros (cliente)", () => {
  it("ordena por atualizado em decrescente, desempate estável por id", async () => {
    const { itens } = await listarPadrao();
    const embaralhado = [itens[2], itens[0], itens[3], itens[1]];
    expect(ordenarOportunidadesVenda(embaralhado).map((i) => i.oportunidade.id)).toEqual([OP_PERDIDA_ARQUIVADA, OP_REFERENCIA, OP_GANHA, OP_NOVA]);
    const empate = itens.map((i) => ({ ...i, oportunidade: { ...i.oportunidade, atualizadoEm: "2026-10-01T00:00:00.000Z" } }));
    expect(ordenarOportunidadesVenda(empate).map((i) => i.oportunidade.id)).toEqual([OP_PERDIDA_ARQUIVADA, OP_GANHA, OP_REFERENCIA, OP_NOVA]);
  });

  it("arquivadas ficam ocultas por padrão e voltam com o toggle, sem alterar os dados", async () => {
    const { itens } = await listarPadrao();
    const copia = structuredClone(itens);
    expect(filtrarOportunidadesVenda(itens, FILTROS_INICIAIS_VENDA).map((i) => i.oportunidade.id)).toEqual([OP_REFERENCIA, OP_GANHA, OP_NOVA]);
    expect(filtrarOportunidadesVenda(itens, { ...FILTROS_INICIAIS_VENDA, mostrarArquivadas: true })).toHaveLength(4);
    expect(itens).toEqual(copia);
  });

  it("etapa: abertas, terminais e cada etapa", async () => {
    const { itens } = await listarPadrao();
    const ids = (etapa: Parameters<typeof filtrarOportunidadesVenda>[1]["etapa"]) =>
      filtrarOportunidadesVenda(itens, { ...FILTROS_INICIAIS_VENDA, etapa, mostrarArquivadas: true }).map((i) => i.oportunidade.id);
    expect(ids("abertas")).toEqual([OP_REFERENCIA, OP_NOVA]);
    expect(ids("ganha")).toEqual([OP_GANHA]);
    expect(ids("perdida")).toEqual([OP_PERDIDA_ARQUIVADA]);
    expect(ids("em_atendimento")).toEqual([]);
  });

  it("busca por interessado e imóvel, sem acento e sem caixa; é só recorte visual", async () => {
    const { itens } = await listarPadrao();
    const buscar = (busca: string) => filtrarOportunidadesVenda(itens, { ...FILTROS_INICIAIS_VENDA, busca }).map((i) => i.oportunidade.id);
    expect(buscar("ANA")).toEqual([OP_GANHA, OP_NOVA]);
    expect(buscar("ld-77")).toEqual([OP_REFERENCIA]);
    expect(buscar("palmeiras")).toEqual([OP_GANHA]);
    expect(buscar("avenida inexistente")).toEqual([]);
    expect(buscar("   ")).toHaveLength(3);
  });
});

describe("B3.4a: rótulos pt-BR", () => {
  it("cobrem todos os códigos do domínio, sem texto técnico", () => {
    expect(Object.keys(ROTULOS_ESTADO_VENDA).sort()).toEqual([...ESTADOS_VENDA].sort());
    expect(Object.keys(ROTULOS_ORIGEM_VENDA).sort()).toEqual([...ORIGENS_COMERCIAIS_VENDA].sort());
    expect(Object.keys(ROTULOS_MOTIVO_PERDA_VENDA).sort()).toEqual([...MOTIVOS_PERDA_VENDA].sort());
    expect(Object.keys(ROTULOS_EVENTO_VENDA)).toHaveLength(7);
    for (const rotulo of [...Object.values(ROTULOS_ESTADO_VENDA), ...Object.values(ROTULOS_ORIGEM_VENDA), ...Object.values(ROTULOS_MOTIVO_PERDA_VENDA), ...Object.values(ROTULOS_EVENTO_VENDA)]) {
      expect(rotulo).not.toMatch(/_|—/);
    }
  });

  it("valor vazio é 'Não informado', zero é R$ 0,00; fechado só na ganha", async () => {
    const { itens } = await listarPadrao();
    expect(fmtValorVenda(null)).toBe("Não informado");
    expect(fmtValorVenda(0)).toMatch(/^R\$\s0,00$/);
    expect(fmtValorVenda(350000.5)).toMatch(/^R\$\s350\.000,50$/);
    const ganha = porId(itens, OP_GANHA).oportunidade, nova = porId(itens, OP_NOVA).oportunidade;
    expect(valorPrincipalVenda(ganha.estado, ganha.valores)).toBe(480000);
    expect(valorPrincipalVenda(nova.estado, nova.valores)).toBe(0);
  });

  it("imóvel: fallback sem imóvel, título e detalhe sem repetição", async () => {
    const { itens } = await listarPadrao();
    expect(tituloImovelVenda({ tipo: "nenhum" })).toBe("Sem imóvel");
    expect(detalheImovelVenda({ tipo: "nenhum" })).toBe("");
    const referencia = porId(itens, OP_REFERENCIA).imovel;
    expect(tituloImovelVenda(referencia)).toBe("LD-77");
    expect(detalheImovelVenda(referencia)).toBe("Av. Brasil, 500 · CRM-77 · unidade 301");
    const manual = porId(itens, OP_GANHA).imovel;
    expect(tituloImovelVenda(manual)).toBe("Rua das Palmeiras, 100");
    expect(detalheImovelVenda(manual)).toBe("unidade 12 · bloco B");
    expect(tituloImovelVenda({ tipo: "referencia", codigo: null, referencia: null, endereco: null, unidade: null, bloco: null, naCarteira: true })).toBe("Imóvel da carteira");
  });

  it("origem, instante no fuso operacional e histórico sem id, chave ou JSON", async () => {
    expect(rotuloOrigemVenda(null)).toBe("Não informado");
    expect(rotuloOrigemVenda({ tipo: "portal", descricao: "Anúncio no portal" })).toBe("Portal · Anúncio no portal");
    expect(fmtInstanteVenda("2026-10-05T15:30:00.000Z")).toBe("05/10/2026 12:30");
    const { cliente } = clienteFalso({ vendas_oportunidades_eventos: eventosPadrao() });
    const resultado = await listarEventosVenda(OP_REFERENCIA, cliente);
    if (!resultado.ok) throw new Error(resultado.erro);
    const textos = resultado.dados.map(detalheEventoVenda);
    expect(textos).toEqual(["Etapa inicial: Nova", "Nova → Em atendimento", expect.stringMatching(/^Valor do negócio previsto: Não informado → R\$\s350\.000,50$/)]);
    for (const texto of textos) expect(texto).not.toMatch(/[0-9a-f]{8}-|chave|\{|contatoId/);
  });
});

describe("B3.4a: fronteira de segurança e ausência de escrita", () => {
  const arquivosB34a = [
    "components/vendas/VendasView.tsx", "components/vendas/DrawerOportunidadeVenda.tsx", "components/vendas/rotulosVenda.ts",
    "components/vendas/filtrosVenda.ts", "app/(painel)/vendas/page.tsx", "lib/persistencia/vendasLeitura.ts",
  ];

  it("a pasta de Vendas tem só os arquivos previstos", () => {
    expect(readdirSync(join(RAIZ, "components/vendas")).sort()).toEqual(["DrawerOportunidadeVenda.tsx", "VendasView.tsx", "filtrosVenda.ts", "rotulosVenda.ts", "vendas.css"]);
  });

  it("componentes de Vendas não importam Supabase nem as portas que gravam: só vendasLeitura", () => {
    for (const arquivo of arquivosB34a.filter((a) => !a.startsWith("lib/"))) {
      const codigo = fonte(arquivo);
      expect(codigo, arquivo).not.toMatch(/@supabase|persistencia\/supabase|getSupabase|persistencia\/vendas["']|persistencia\/vendasInteressado|createClient|fetch\(/);
      for (const linha of codigo.split("\n").filter((l) => /^\s*import\b.*persistencia\//.test(l))) {
        expect(linha, arquivo).toMatch(/persistencia\/(vendasLeitura|vendasComandos)"/);
        if (linha.includes("vendasComandos")) expect(linha, arquivo).toMatch(/^\s*import type /);
      }
    }
  });

  it("nenhum arquivo do B3.4a chama RPC, porta mutante, service role, SQL ou rota de API", () => {
    const portas = [...Object.values(PORTAS_VENDAS), PORTA_RESOLVER_INTERESSADO_VENDA];
    expect(portas).toHaveLength(8);
    for (const arquivo of arquivosB34a) {
      const codigo = fonte(arquivo);
      for (const porta of portas) expect(codigo, arquivo).not.toContain(porta);
      expect(codigo, arquivo).not.toMatch(/\.rpc\(|executarComandoVenda|consultarInteressadoVenda|PORTAS_VENDAS|service_role|SERVICE_ROLE|supabaseAdmin|\/api\/|\.insert\(|\.update\(|\.upsert\(|\.delete\(|crypto\.randomUUID|chaveIdempotencia/);
    }
    expect(fonte("lib/persistencia/vendasLeitura.ts")).toMatch(/from "\.\/supabase"/);
  });
});
