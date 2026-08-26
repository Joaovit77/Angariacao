import { describe, expect, it } from "vitest";
import {
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
      resultado: "respondido",
      motivo: "resposta-gerada",
    });

    expect(metadados.protocolosConsiderados).toEqual(["protocolo-1"]);
    expect(metadados.ferramentasChamadas).toEqual(["consultar_imovel"]);
    expect(metadados.entidadesUtilizadas).toEqual(["imovel-1"]);
    expect(Object.keys(metadados)).not.toContain("raciocinio");
    expect(JSON.stringify(metadados)).not.toContain("chain-of-thought");
  });

  it("não atribui um título declarado a IDs ambíguos", () => {
    expect(idsProtocolosDeclaradosSemAmbiguidade([
      { id: "taxa-1", titulo: "Taxa" },
      { id: "taxa-2", titulo: "Taxa" },
      { id: "vistoria-1", titulo: "Vistoria" },
    ], ["Taxa", "Vistoria"])).toEqual(["vistoria-1"]);
  });
});
