/* ================================================================
   GARIMPO EM CAMPO × JEV — classificação de catálogo fechado

   Módulo SÓ DE SERVIDOR. Traduz o catálogo fechado de etiquetas do
   Garimpo (`estado-visual` + `sinal-de-prospeccao`) e `TIPOS_IMOVEL` em
   perguntas `Choice` para uma única chamada ao JEV (`jev-1.14.0`).

   Invariantes preservados:
   - Recebe somente a observação relida do banco (nunca endereço, foto ou PII);
   - A saída ainda passa integralmente por `validarEtiquetasClassificadas`
     (catálogo, piso de confiança e evidência literal obrigatória para
     `sem-placa-visivel`);
   - Em qualquer falha operacional/estrutural do JEV, devolve `ok: false`
     para que `classificacaoProspeccao.ts` faça fallback limpo.
   ================================================================ */
import {
  CATALOGO_ETIQUETAS,
  CATEGORIAS_ETIQUETAS_CLASSIFICADAS,
  type CodigoEtiquetaProspeccao,
} from "@/lib/calculo/catalogoEtiquetas";
import { CONFIANCA_MINIMA_ETIQUETA, type SugestaoEtiquetaClassificada } from "@/lib/calculo/etiquetasProspeccao";
import type { TipoImovelProspeccao } from "@/lib/calculo/prospeccao";
import { TIPOS_IMOVEL } from "@/lib/constantes";
import {
  executarJev,
  MODELO_JEV_PADRAO,
  type OpcoesExecucaoJev,
  type PedidoJev,
  type PerguntaChoiceJev,
  type ResultadoJev,
} from "@/lib/servidor/jev";

const OPCAO_NENHUM_TIPO = "NENHUM";

const DESCRICAO_ETIQUETA: Record<string, string> = {
  "aparenta-vago": "A observação descreve explicitamente indício de imóvel vago, vazio ou desocupado?",
  "aparenta-ocupado": "A observação descreve explicitamente indício de imóvel ocupado ou com moradores/atividade?",
  "aparenta-bem-conservado": "A observação descreve explicitamente o imóvel como bem conservado, novo ou reformado?",
  "aparenta-deteriorado": "A observação descreve explicitamente deterioração, abandono, desgaste ou mau estado?",
  "aparenta-em-obra": "A observação descreve explicitamente o imóvel em obra ou reforma ativa?",
  "placa-aluga-se": "A observação menciona explicitamente placa de aluga-se ou locação?",
  "placa-vende-se": "A observação menciona explicitamente placa de vende-se ou venda?",
  "placa-de-proprietario": "A observação menciona explicitamente placa direto com o proprietário ou particular?",
  "placa-de-imobiliaria": "A observação menciona explicitamente placa de imobiliária ou corretor?",
  "sem-placa-visivel": "A observação afirma explicitamente que NÃO há placa visível no imóvel? Não marcar por simples ausência de menção à placa.",
  "imovel-fechado": "A observação afirma explicitamente que o imóvel está fechado, trancado ou sem movimento?",
  "mato-alto": "A observação menciona explicitamente mato alto, vegetação crescida ou falta de limpeza externa?",
  "obra-parada": "A observação menciona explicitamente obra parada ou interrompida?",
};

/** Evidência literal para etiquetas negativas (`sem-placa-visivel`). Só
    retorna trecho que realmente existe na observação — nunca fabrica texto. */
const EVIDENCIA_SEM_PLACA =
  /\b(?:sem\s+(?:nenhuma\s+)?placa(?:\s+vis[ií]vel)?|n[aã]o\s+(?:tem|h[aá]|possui|vi|encontrei)\s+(?:nenhuma\s+)?placa(?:\s+vis[ií]vel)?|nenhuma\s+placa(?:\s+vis[ií]vel)?)\b/iu;

interface EntradaCatalogoJev {
  idPergunta: string;
  categoria: (typeof CATEGORIAS_ETIQUETAS_CLASSIFICADAS)[number];
  codigo: CodigoEtiquetaProspeccao;
  rotulo: string;
  exigeEvidenciaExplicita: boolean;
}

function entradasClassificaveis(): EntradaCatalogoJev[] {
  const lista: EntradaCatalogoJev[] = [];
  for (const categoria of CATEGORIAS_ETIQUETAS_CLASSIFICADAS) {
    for (const item of CATALOGO_ETIQUETAS[categoria]) {
      lista.push({
        idPergunta: `etq_${item.codigo.replace(/-/g, "_")}`,
        categoria,
        codigo: item.codigo,
        rotulo: item.rotulo,
        exigeEvidenciaExplicita: "exigeEvidenciaExplicita" in item && item.exigeEvidenciaExplicita === true,
      });
    }
  }
  return lista;
}

export function montarPedidoGarimpoJev(observacao: string): PedidoJev {
  const questions: Record<string, PerguntaChoiceJev> = {};
  for (const item of entradasClassificaveis()) {
    questions[item.idPergunta] = {
      type: "choice",
      instructions:
        DESCRICAO_ETIQUETA[item.codigo]
        ?? `A observação de campo descreve explicitamente o sinal "${item.rotulo}"?`,
      criteria: {
        YES: "Explicitamente sustentado pela observação de campo.",
        NO: "Não mencionado, incerto ou contradito pela observação.",
      },
    };
  }

  const criteriosTipo: Record<string, string | null> = {
    [OPCAO_NENHUM_TIPO]: "A observação não identifica o tipo do imóvel com clareza.",
  };
  for (const tipo of TIPOS_IMOVEL) {
    criteriosTipo[tipo] = `A observação identifica explicitamente o imóvel como ${tipo}.`;
  }
  questions.tipo_imovel = {
    type: "choice",
    instructions: "Qual tipo de imóvel está explicitamente indicado na observação de campo? Escolha NENHUM se não estiver claro.",
    criteria: criteriosTipo,
  };

  return {
    model: MODELO_JEV_PADRAO,
    state: {
      regras: [
        "Classifique apenas sinais explicitamente presentes na observação de campo.",
        "Ausência de menção a placa NÃO autoriza marcar sem-placa-visivel.",
        "Não invente características nem infira o tipo do imóvel sem menção clara.",
      ],
      observacao_campo: observacao,
    },
    questions,
  };
}

export type ResultadoClassificacaoGarimpoJev =
  | {
      ok: true;
      modelo: string;
      etiquetas: SugestaoEtiquetaClassificada[];
      tipo: TipoImovelProspeccao | null;
      tipoConfianca: number | null;
      duracaoMs: number;
      usage: ResultadoJev["usage"];
    }
  | {
      ok: false;
      status: ResultadoJev["status"];
      codigoErro: string | null;
      statusHttp: number | null;
      duracaoMs: number;
    };

export type ClassificadorGarimpoJev = (
  observacao: string,
) => Promise<ResultadoClassificacaoGarimpoJev>;

export function interpretarRespostaGarimpoJev(
  resultado: ResultadoJev,
  observacao: string,
): ResultadoClassificacaoGarimpoJev {
  if (resultado.status !== "COMPLETED" || !resultado.answers) {
    return {
      ok: false,
      status: resultado.status,
      codigoErro: resultado.codigoErro,
      statusHttp: resultado.statusHttp,
      duracaoMs: resultado.duracaoMs,
    };
  }

  const etiquetas: SugestaoEtiquetaClassificada[] = [];
  const trechoSemPlaca = observacao.match(EVIDENCIA_SEM_PLACA)?.[0];

  for (const item of entradasClassificaveis()) {
    const resposta = resultado.answers[item.idPergunta];
    if (!resposta || resposta.choice !== "YES") continue;
    const confianca = Math.round(resposta.confidence * 100);
    etiquetas.push({
      categoria: item.categoria,
      codigo: item.codigo,
      confianca,
      ...(item.exigeEvidenciaExplicita && trechoSemPlaca ? { evidencia: trechoSemPlaca } : {}),
    });
  }

  const respostaTipo = resultado.answers.tipo_imovel;
  let tipo: TipoImovelProspeccao | null = null;
  let tipoConfianca: number | null = null;
  if (
    respostaTipo
    && respostaTipo.choice !== OPCAO_NENHUM_TIPO
    && (TIPOS_IMOVEL as readonly string[]).includes(respostaTipo.choice)
  ) {
    const confiancaPercentual = Math.round(respostaTipo.confidence * 100);
    if (confiancaPercentual >= CONFIANCA_MINIMA_ETIQUETA) {
      tipo = respostaTipo.choice as TipoImovelProspeccao;
      tipoConfianca = confiancaPercentual;
    }
  }

  return {
    ok: true,
    modelo: resultado.modelObserved ?? resultado.modelRequested,
    etiquetas,
    tipo,
    tipoConfianca,
    duracaoMs: resultado.duracaoMs,
    usage: resultado.usage,
  };
}

export async function classificarObservacaoComJev(
  observacao: string,
  opcoes: OpcoesExecucaoJev = {},
): Promise<ResultadoClassificacaoGarimpoJev> {
  const pedido = montarPedidoGarimpoJev(observacao);
  const resposta = await executarJev(pedido, opcoes);
  return interpretarRespostaGarimpoJev(resposta, observacao);
}
