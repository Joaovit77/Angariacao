import { createClient } from "@supabase/supabase-js";
import {
  CONFIGURACAO_IA_PADRAO,
  normalizarConfiguracaoIa,
  type ConfiguracaoIa,
  type VersaoConfiguracaoIa,
} from "@/lib/ia/configuracao";

interface LinhaConfiguracaoIa {
  id: number;
  modelo_operacoes: string;
  esforco_operacoes: string;
  modelo_classificacao: string;
  esforco_classificacao: string;
  modelo_atendimento: string;
  esforco_atendimento: string;
  modelo_assistente: string;
  esforco_assistente: string;
  instrucao_atendimento: string | null;
  alterado_por: string | null;
  criado_em: string;
}

export function configuracaoIaDaLinha(linha: LinhaConfiguracaoIa): VersaoConfiguracaoIa | null {
  const configuracao = normalizarConfiguracaoIa({
    operacoes: { modelo: linha.modelo_operacoes, esforco: linha.esforco_operacoes },
    classificacao: { modelo: linha.modelo_classificacao, esforco: linha.esforco_classificacao },
    atendimento: { modelo: linha.modelo_atendimento, esforco: linha.esforco_atendimento },
    assistente: { modelo: linha.modelo_assistente, esforco: linha.esforco_assistente },
    instrucaoAtendimento: linha.instrucao_atendimento || "",
  });
  if (!configuracao) return null;
  return {
    ...configuracao,
    versao: Number(linha.id) || null,
    criadoEm: linha.criado_em || null,
    alteradoPor: linha.alterado_por || null,
    origem: "banco",
  };
}

export function configuracaoIaPadrao(): VersaoConfiguracaoIa {
  return {
    ...CONFIGURACAO_IA_PADRAO,
    assistente: {
      ...CONFIGURACAO_IA_PADRAO.assistente,
      modelo: normalizarModeloDoAmbiente(process.env.OPENAI_ASSISTENTE_MODEL),
    },
    versao: null,
    criadoEm: null,
    alteradoPor: null,
    origem: "padrao",
  };
}

function normalizarModeloDoAmbiente(valor: string | undefined): ConfiguracaoIa["assistente"]["modelo"] {
  const teste = normalizarConfiguracaoIa({
    ...CONFIGURACAO_IA_PADRAO,
    assistente: { ...CONFIGURACAO_IA_PADRAO.assistente, modelo: valor?.trim() || CONFIGURACAO_IA_PADRAO.assistente.modelo },
  });
  return teste?.assistente.modelo || CONFIGURACAO_IA_PADRAO.assistente.modelo;
}

/**
 * Lê somente a versão mais recente. A tabela é global e não contém dados de
 * carteira; ainda assim, a service role fica restrita ao servidor e a leitura
 * sempre filtra/limita explicitamente a versão usada.
 */
export async function carregarConfiguracaoIa(): Promise<VersaoConfiguracaoIa> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const chave = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !chave) return configuracaoIaPadrao();

  const sb = createClient(url, chave, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await sb
    .from("ia_configuracoes")
    .select("id, modelo_operacoes, esforco_operacoes, modelo_classificacao, esforco_classificacao, modelo_atendimento, esforco_atendimento, modelo_assistente, esforco_assistente, instrucao_atendimento, alterado_por, criado_em")
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("IA: falha ao ler a configuração global; usando padrão seguro:", error.message);
    return configuracaoIaPadrao();
  }
  return (data && configuracaoIaDaLinha(data as LinhaConfiguracaoIa)) || configuracaoIaPadrao();
}
