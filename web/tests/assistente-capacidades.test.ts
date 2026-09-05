import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import ManualCapacidadesAssistente from "@/components/assistente/ManualCapacidadesAssistente";
import {
  CATALOGO_CAPACIDADES_ASSISTENTE,
  agruparCapacidades,
  montarManualCapacidades,
  respostaParaLimiteAssistente,
  respostaSobreCapacidades,
  type DefinicaoCapacidadeAssistente,
} from "@/lib/assistente/capacidades";
import {
  POLITICAS_ACOES_ASSISTENTE,
  POLITICAS_CRITICAS_ASSISTENTE,
} from "@/lib/assistente/politicas";
import { DEFINICOES_FERRAMENTAS } from "@/lib/servidor/assistente/ferramentas";
import { DEFINICOES_FERRAMENTAS_ACOES } from "@/lib/servidor/assistente/acoes";

const contextoDisponivel = { podeUsarIa: true } as const;

describe("catálogo de capacidades do Assistente", () => {
  it("expõe somente capacidades ligadas a ferramentas reais ou ao evento automático implementado", () => {
    const ferramentasReais = new Set([
      ...DEFINICOES_FERRAMENTAS.map((ferramenta) => ferramenta.name),
      ...DEFINICOES_FERRAMENTAS_ACOES.map((ferramenta) => ferramenta.name),
      "consultar_protocolos_comerciais",
    ]);
    const disponiveis = montarManualCapacidades(contextoDisponivel).filter((capacidade) => capacidade.disponivel);

    for (const capacidade of disponiveis) {
      if (capacidade.tipo === "evento") {
        expect(capacidade.acao).toBe("concluir_followups_por_resposta");
        continue;
      }
      expect(capacidade.ferramentas.length, capacidade.id).toBeGreaterThan(0);
      for (const ferramenta of capacidade.ferramentas) expect(ferramentasReais.has(ferramenta), ferramenta).toBe(true);
    }
    const ferramentasRegistradas = new Set(disponiveis.flatMap((capacidade) => capacidade.ferramentas));
    for (const ferramenta of ferramentasReais) expect(ferramentasRegistradas.has(ferramenta), ferramenta).toBe(true);
  });

  it("mostra como confirmação uma capacidade cuja política exige confirmação", () => {
    const visita = montarManualCapacidades(contextoDisponivel).find((capacidade) => capacidade.id === "agendar_visita");
    expect(POLITICAS_ACOES_ASSISTENTE.agendar_visita.modo).toBe("confirmacao");
    expect(visita).toMatchObject({ disponivel: true, controle: "Pede confirmação" });
  });

  it("reflete como automático o evento de resposta real", () => {
    const evento = montarManualCapacidades({ podeUsarIa: true, whatsappConectado: true })
      .find((capacidade) => capacidade.id === "concluir_followups_por_resposta");
    expect(POLITICAS_ACOES_ASSISTENTE.concluir_followups_por_resposta.modo).toBe("automatico");
    expect(evento).toMatchObject({ tipo: "evento", controle: "Automático", disponibilidade: "disponivel" });
  });

  it("deriva todos os controles operacionais da política sem metadado paralelo", () => {
    const capacidades = montarManualCapacidades(contextoDisponivel);
    for (const capacidade of capacidades.filter((item) => item.acao)) {
      const modo = POLITICAS_ACOES_ASSISTENTE[capacidade.acao!].modo;
      const esperado = capacidade.tipo === "evento"
        ? modo === "automatico" ? "Automático" : modo === "confirmacao" ? "Pede confirmação" : "Ainda não disponível"
        : modo === "automatico" ? "Executa diretamente" : modo === "confirmacao" ? "Pede confirmação" : "Ainda não disponível";
      expect(capacidade.controle, capacidade.id).toBe(esperado);
    }
    const fonte = readFileSync(join(process.cwd(), "lib/assistente/capacidades.ts"), "utf8");
    expect(fonte).not.toContain("requerConfirmacao:");
    expect(fonte).not.toContain("nivelAutonomia:");
  });

  it("mantém exemplos dentro de capacidades existentes e nunca os atribui a limites bloqueados", () => {
    const ids = new Set(CATALOGO_CAPACIDADES_ASSISTENTE.map((capacidade) => capacidade.id));
    for (const capacidade of montarManualCapacidades(contextoDisponivel)) {
      expect(ids.has(capacidade.id)).toBe(true);
      if (capacidade.exemplos.length) expect(capacidade.disponivel).toBe(true);
      if (capacidade.categoria === "indisponivel") expect(capacidade.exemplos).toEqual([]);
    }
  });

  it("expõe ações críticas somente como limites indisponíveis", () => {
    const capacidades = montarManualCapacidades(contextoDisponivel);
    for (const operacao of Object.keys(POLITICAS_CRITICAS_ASSISTENTE)) {
      const capacidade = capacidades.find((item) => item.operacaoCritica === operacao);
      expect(capacidade, operacao).toMatchObject({ disponivel: false, controle: "Ainda não disponível", categoria: "indisponivel" });
      expect(capacidade?.ferramentas).toEqual([]);
    }
  });

  it("responde perguntas gerais e sobre envio a partir da fonte dinâmica", () => {
    const nova: DefinicaoCapacidadeAssistente = {
      id: "consultar_teste_dinamico",
      nome: "Teste dinâmico",
      descricao: "Consulta uma capacidade registrada para teste.",
      categoria: "consultar",
      tipo: "consulta",
      controle: "Somente consulta",
      exemplos: ["Consulte o teste dinâmico."],
      limitacoes: [],
      ferramentas: ["ferramenta_teste"],
      termosDescoberta: ["teste dinâmico"],
      destaque: true,
    };
    expect(respostaSobreCapacidades("O que você consegue fazer?", contextoDisponivel, [nova]))
      .toContain("teste dinâmico");
    expect(respostaSobreCapacidades("Você consegue mandar mensagem sozinho?", contextoDisponivel))
      .toContain("não envia mensagens externas");
  });

  it("reconhece Mercado como limite informativo sem oferecer ferramenta operacional substituta", () => {
    const limite = respostaParaLimiteAssistente(
      "Como está o mercado para este imóvel?",
      contextoDisponivel,
    );

    expect(limite).toMatchObject({ capacidadeId: "consultar_mercado" });
    expect(limite?.texto).toContain("não possui uma leitura integrada");
    expect(limite?.texto).toContain("não substituem");
    expect(limite?.texto).not.toContain("movimentação moderada");
    expect(montarManualCapacidades(contextoDisponivel).find((item) => item.id === "consultar_mercado"))
      .toMatchObject({ disponivel: false, ferramentas: [], contextoNecessario: [] });
  });

  it("faz uma nova capacidade registrada aparecer no manual sem segunda lista", () => {
    const nova: DefinicaoCapacidadeAssistente = {
      id: "consulta_nova",
      nome: "Consulta nova",
      descricao: "Nova consulta real.",
      categoria: "consultar",
      tipo: "consulta",
      controle: "Somente consulta",
      exemplos: ["Faça a consulta nova."],
      limitacoes: [],
      ferramentas: ["consulta_nova"],
      termosDescoberta: ["consulta nova"],
    };
    const manual = montarManualCapacidades(contextoDisponivel, [...CATALOGO_CAPACIDADES_ASSISTENTE, nova]);
    expect(agruparCapacidades(manual).flatMap((grupo) => grupo.capacidades).some((item) => item.id === nova.id)).toBe(true);
  });

  it("aceita catálogo vazio sem criar grupos nem exemplos órfãos", () => {
    expect(montarManualCapacidades(contextoDisponivel, [])).toEqual([]);
    expect(agruparCapacidades([])).toEqual([]);
    const html = renderToStaticMarkup(createElement(ManualCapacidadesAssistente, {
      aoFechar: () => undefined,
      capacidades: [],
    }));
    expect(html).toContain("Nenhuma capacidade está disponível");
  });

  it("respeita permissão e condições de integração sem vazar disponibilidade", () => {
    const semPermissao = montarManualCapacidades({ podeUsarIa: false });
    expect(semPermissao.every((capacidade) => !capacidade.disponivel)).toBe(true);
    expect(respostaSobreCapacidades("O que você consegue fazer?", { podeUsarIa: false }))
      .toContain("não estão disponíveis");
    const eventoSemCanal = montarManualCapacidades({ podeUsarIa: true, whatsappConectado: false })
      .find((capacidade) => capacidade.id === "concluir_followups_por_resposta");
    expect(eventoSemCanal).toMatchObject({ disponivel: false, disponibilidade: "indisponivel" });

    const rota = readFileSync(join(process.cwd(), "app/api/assistente/route.ts"), "utf8");
    expect(rota.indexOf("podeUsarIa(supabase, auth.user.id)")).toBeLessThan(rota.indexOf("respostaSobreCapacidades(pedido.mensagem"));
  });
});
