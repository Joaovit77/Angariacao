import { describe, expect, it } from "vitest";
import {
  CONFIGURACAO_IA_PADRAO,
  CONFIGURACAO_IA_RECOMENDADA,
  MAX_INSTRUCAO_ATENDIMENTO,
  normalizarConfiguracaoIa,
} from "@/lib/ia/configuracao";
import { PROMPT_BASE_ATENDIMENTO, promptBaseAtendimento } from "@/lib/ia/atendimento";

describe("configuração operacional da IA", () => {
  it("mantém o comportamento atual quando ainda não existe versão no banco", () => {
    expect(CONFIGURACAO_IA_PADRAO).toMatchObject({
      classificacao: { modelo: "gpt-5.4-mini", esforco: "low" },
      atendimento: { modelo: "gpt-5.4-mini", esforco: "low" },
      operacoes: { modelo: "gpt-5.4-mini", esforco: "medium" },
    });
  });

  it("oferece a família nova por responsabilidade, sem promovê-la automaticamente", () => {
    expect(CONFIGURACAO_IA_RECOMENDADA.classificacao.modelo).toBe("gpt-5.6-luna");
    expect(CONFIGURACAO_IA_RECOMENDADA.atendimento.modelo).toBe("gpt-5.6-terra");
    expect(CONFIGURACAO_IA_PADRAO.atendimento.modelo).not.toBe(CONFIGURACAO_IA_RECOMENDADA.atendimento.modelo);
  });

  it("recusa modelo, esforço ou instrução fora do contrato do ADM", () => {
    expect(normalizarConfiguracaoIa({ ...CONFIGURACAO_IA_PADRAO, atendimento: { modelo: "modelo-inventado", esforco: "low" } })).toBeNull();
    expect(normalizarConfiguracaoIa({ ...CONFIGURACAO_IA_PADRAO, operacoes: { modelo: "gpt-5.4-mini", esforco: "max" } })).toBeNull();
    expect(normalizarConfiguracaoIa({ ...CONFIGURACAO_IA_PADRAO, instrucaoAtendimento: "x".repeat(MAX_INSTRUCAO_ATENDIMENTO + 1) })).toBeNull();
  });
});

describe("orientação complementar do atendimento", () => {
  it("mantém as regras permanentes e a seção obrigatória quando o campo está vazio", () => {
    const prompt = promptBaseAtendimento("   ");
    expect(prompt).toContain(PROMPT_BASE_ATENDIMENTO);
    expect(prompt).toContain("REGRAS OBRIGATÓRIAS DE CONDUTA:");
    expect(prompt).not.toContain("Orientação complementar do administrador:");
  });

  it("mantém as travas permanentes depois da orientação do ADM", () => {
    const prompt = promptBaseAtendimento("Prefira mensagens curtas e objetivas.");
    expect(prompt).toContain("Prefira mensagens curtas e objetivas.");
    expect(prompt).toContain("Nunca invente valor");
    expect(prompt).toContain("não autoriza fatos comerciais");
    expect(prompt.indexOf("Regras permanentes")).toBeLessThan(prompt.indexOf("Orientação complementar"));
    expect(prompt.indexOf("Orientação complementar")).toBeLessThan(prompt.indexOf("REGRAS OBRIGATÓRIAS DE CONDUTA"));
  });

  it("trunca chamadas internas no mesmo limite aceito pelo ADM", () => {
    const prompt = promptBaseAtendimento("z".repeat(MAX_INSTRUCAO_ATENDIMENTO + 200));
    expect(prompt).not.toContain("z".repeat(MAX_INSTRUCAO_ATENDIMENTO + 1));
  });
});
