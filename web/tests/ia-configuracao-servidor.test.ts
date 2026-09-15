/* ================================================================
   Resolução da configuração de IA no servidor: padrão × recomendado × banco

   Registro pós-smoke do Gate C (Garimpo em Campo). O smoke real rodou a
   classificação em `gpt-5.4-mini` enquanto a V7 supunha `gpt-5.6-luna`;
   o diagnóstico mostrou que não é bug: sem versão publicada em
   `ia_configuracoes` vale `CONFIGURACAO_IA_PADRAO` (contrato pré-existente do
   produto), o preset recomendado é PROPOSTA do /admin e só passa a valer
   quando salvo como versão, e a versão persistida sobrescreve o padrão. O
   Garimpo lê a rota `classificacao` — a mesma do classificador do webhook —
   e não tem configuração paralela. Estes testes fixam exatamente isso; não
   existe (nem deve existir) teste exigindo o recomendado como fallback.
   ================================================================ */
import { afterEach, describe, expect, it } from "vitest";

import { CONFIGURACAO_IA_PADRAO, CONFIGURACAO_IA_RECOMENDADA } from "@/lib/ia/configuracao";
import { carregarConfiguracaoIa, configuracaoIaDaLinha, configuracaoIaPadrao } from "@/lib/servidor/ia/configuracao";

const linhaPublicada = {
  id: 7,
  modelo_operacoes: "gpt-5.6-terra", esforco_operacoes: "low",
  modelo_classificacao: "gpt-5.6-luna", esforco_classificacao: "low",
  modelo_atendimento: "gpt-5.6-terra", esforco_atendimento: "low",
  modelo_assistente: "gpt-5.6-terra", esforco_assistente: "low",
  instrucao_atendimento: null, alterado_por: null, criado_em: "2026-09-14T12:00:00.000Z",
};

describe("padrão × recomendado × versão publicada", () => {
  const ambiente = { url: process.env.NEXT_PUBLIC_SUPABASE_URL, chave: process.env.SUPABASE_SERVICE_ROLE_KEY };
  afterEach(() => {
    if (ambiente.url === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL; else process.env.NEXT_PUBLIC_SUPABASE_URL = ambiente.url;
    if (ambiente.chave === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY; else process.env.SUPABASE_SERVICE_ROLE_KEY = ambiente.chave;
  });

  it("sem versão publicada, a rota `classificacao` resolve para o padrão de código (contrato atual), com origem 'padrao'", () => {
    const padrao = configuracaoIaPadrao();
    expect(padrao.origem).toBe("padrao");
    expect(padrao.versao).toBeNull();
    expect(padrao.classificacao).toEqual(CONFIGURACAO_IA_PADRAO.classificacao);
    expect(padrao.classificacao).toEqual({ modelo: "gpt-5.4-mini", esforco: "low" });
  });

  it("o recomendado é sugestão: difere do padrão na rota `classificacao` e não é promovido pelo fallback", () => {
    expect(CONFIGURACAO_IA_RECOMENDADA.classificacao.modelo).toBe("gpt-5.6-luna");
    expect(configuracaoIaPadrao().classificacao).not.toEqual(CONFIGURACAO_IA_RECOMENDADA.classificacao);
  });

  it("sem banco configurado, carregarConfiguracaoIa() devolve o padrão sem tentar rede", async () => {
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    const resolvida = await carregarConfiguracaoIa();
    expect(resolvida.origem).toBe("padrao");
    expect(resolvida.classificacao).toEqual(CONFIGURACAO_IA_PADRAO.classificacao);
  });

  it("uma versão publicada sobrescreve o padrão: salvar o recomendado é o que faz a classificação ir para o modelo sugerido", () => {
    const publicada = configuracaoIaDaLinha(linhaPublicada)!;
    expect(publicada.origem).toBe("banco");
    expect(publicada.versao).toBe(7);
    expect(publicada.classificacao).toEqual(CONFIGURACAO_IA_RECOMENDADA.classificacao);
    expect(publicada.classificacao).not.toEqual(CONFIGURACAO_IA_PADRAO.classificacao);
  });

  it("linha fora do contrato não vira configuração (o chamador volta ao padrão)", () => {
    expect(configuracaoIaDaLinha({ ...linhaPublicada, modelo_classificacao: "modelo-inventado" })).toBeNull();
  });
});
