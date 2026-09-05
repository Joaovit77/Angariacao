import { describe, expect, it } from "vitest";
import {
  diagnosticoContextoAssistente,
  idsProtocolosDeclaradosSemAmbiguidade,
  metadadosExecucaoIa,
} from "@/lib/ia/observabilidade";

describe("metadados seguros da execução de IA", () => {
  it("mantém somente fatos estruturados, remove vazios e duplicidades", () => {
    const metadados = metadadosExecucaoIa({
      operacao: "assistente-chat",
      protocolosConsiderados: ["protocolo-1", "protocolo-1", null],
      protocolosAplicados: [],
      ferramentasChamadas: ["consultar_imovel", "consultar_imovel"],
      entidadesUtilizadas: [undefined, "imovel-1"],
      fontesDeDados: ["ferramenta:consultar_imovel"],
      validacoesAplicadas: ["sanitizacao-da-saida"],
      blocosContexto: ["imovel", "imovel"],
      fontesContexto: ["imoveis"],
      consultasExecutadas: 2,
      duracaoContextoMs: 12,
      caracteresContexto: 800,
      tokensContextoAproximados: 200,
      consultasReutilizadas: 1,
      resultado: "respondido",
      motivo: "resposta-gerada",
    });

    expect(metadados.protocolosConsiderados).toEqual(["protocolo-1"]);
    expect(metadados.ferramentasChamadas).toEqual(["consultar_imovel"]);
    expect(metadados.entidadesUtilizadas).toEqual(["imovel-1"]);
    expect(metadados).toMatchObject({
      blocosContexto: ["imovel"],
      fontesContexto: ["imoveis"],
      consultasExecutadas: 2,
      duracaoContextoMs: 12,
      caracteresContexto: 800,
      tokensContextoAproximados: 200,
      consultasReutilizadas: 1,
    });
    expect(Object.keys(metadados)).not.toContain("raciocinio");
    expect(JSON.stringify(metadados)).not.toContain("chain-of-thought");
  });

  it("projeta somente metadados estruturais em logs independentes do histórico", () => {
    const diagnostico = diagnosticoContextoAssistente({
      blocos: ["imovel", "agenda", "Rua privada"],
      fontes: ["imoveis", "agenda", "mensagem completa"],
      consultas: 2,
      consultasReutilizadas: 0,
      duracaoMs: 17.4,
      caracteresContexto: 801,
      tokensContextoAproximados: 201,
    });

    expect(diagnostico).toEqual({
      operacao: "assistente_contexto",
      blocos: ["imovel", "agenda"],
      fontes: ["imoveis", "agenda"],
      consultas: 2,
      consultas_reutilizadas: 0,
      duracao_ms: 17,
      tamanho_aproximado: 801,
      tokens_aproximados: 201,
    });
    expect(JSON.stringify(diagnostico)).not.toContain("privada");
    expect(JSON.stringify(diagnostico)).not.toContain("mensagem completa");
  });

  it("não atribui um título declarado a IDs ambíguos", () => {
    expect(idsProtocolosDeclaradosSemAmbiguidade([
      { id: "taxa-1", titulo: "Taxa" },
      { id: "taxa-2", titulo: "Taxa" },
      { id: "vistoria-1", titulo: "Vistoria" },
    ], ["Taxa", "Vistoria"])).toEqual(["vistoria-1"]);
  });
});
