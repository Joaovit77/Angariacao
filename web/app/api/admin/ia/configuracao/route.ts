import { normalizarConfiguracaoIa, type ConfiguracaoIa } from "@/lib/ia/configuracao";
import {
  configuracaoIaDaLinha,
  configuracaoIaPadrao,
} from "@/lib/servidor/ia/configuracao";
import { registrarEvento } from "@/lib/servidor/registro";
import { erro, exigirAdmin } from "../../_comum";

const COLUNAS = "id, modelo_operacoes, esforco_operacoes, modelo_classificacao, esforco_classificacao, modelo_atendimento, esforco_atendimento, modelo_assistente, esforco_assistente, instrucao_atendimento, alterado_por, criado_em";

function linhaDaConfiguracao(config: ConfiguracaoIa, alteradoPor: string) {
  return {
    modelo_operacoes: config.operacoes.modelo,
    esforco_operacoes: config.operacoes.esforco,
    modelo_classificacao: config.classificacao.modelo,
    esforco_classificacao: config.classificacao.esforco,
    modelo_atendimento: config.atendimento.modelo,
    esforco_atendimento: config.atendimento.esforco,
    modelo_assistente: config.assistente.modelo,
    esforco_assistente: config.assistente.esforco,
    instrucao_atendimento: config.instrucaoAtendimento,
    alterado_por: alteradoPor,
  };
}

export async function GET(request: Request): Promise<Response> {
  const guarda = await exigirAdmin(request);
  if ("resposta" in guarda) return guarda.resposta;

  const { data, error } = await guarda.sb
    .from("ia_configuracoes")
    .select(COLUNAS)
    .order("id", { ascending: false })
    .limit(8);

  if (error) {
    // Durante a implantação do schema, o ADM continua útil e deixa claro que
    // o padrão de código está ativo; salvar permanece bloqueado pela rota.
    console.error("Admin: falha ao ler configurações de IA:", error.message);
    return Response.json({
      ok: true,
      configuracao: configuracaoIaPadrao(),
      historico: [],
      persistenciaDisponivel: false,
      mensagem: "A tabela ia_configuracoes ainda não está disponível neste ambiente.",
    });
  }

  const historico = (data || [])
    .map((linha) => configuracaoIaDaLinha(linha as Parameters<typeof configuracaoIaDaLinha>[0]))
    .filter((item): item is NonNullable<typeof item> => !!item);
  return Response.json({
    ok: true,
    configuracao: historico[0] || configuracaoIaPadrao(),
    historico,
    persistenciaDisponivel: true,
  });
}

export async function POST(request: Request): Promise<Response> {
  const guarda = await exigirAdmin(request);
  if ("resposta" in guarda) return guarda.resposta;

  let bruto: unknown;
  try {
    bruto = await request.json();
  } catch {
    return erro("requisicao-invalida", 400);
  }
  const configuracao = normalizarConfiguracaoIa(bruto);
  if (!configuracao) return erro("requisicao-invalida", 400);

  const { data, error } = await guarda.sb
    .from("ia_configuracoes")
    .insert(linhaDaConfiguracao(configuracao, guarda.userId))
    .select(COLUNAS)
    .single();
  if (error || !data) {
    console.error("Admin: falha ao salvar configuração de IA:", error?.message || "sem retorno");
    return erro("falha", 500);
  }

  const salva = configuracaoIaDaLinha(data as Parameters<typeof configuracaoIaDaLinha>[0]);
  if (!salva) return erro("falha", 500);
  registrarEvento({
    userId: guarda.userId,
    categoria: "admin",
    nivel: "info",
    evento: "admin-configuracao-ia",
    detalhe: JSON.stringify({
      versao: salva.versao,
      modelos: {
        operacoes: salva.operacoes,
        classificacao: salva.classificacao,
        atendimento: salva.atendimento,
        assistente: salva.assistente,
      },
      instrucaoComplementarCaracteres: salva.instrucaoAtendimento.length,
    }),
  });

  return Response.json({ ok: true, configuracao: salva });
}
