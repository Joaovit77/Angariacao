/* ================================================================
   IA — CHAMADA DE SERVIDOR (fora do fluxo do /api/ia)

   ATENÇÃO: este módulo é SÓ DE SERVIDOR. Ele importa o SDK da OpenAI
   e lê `OPENAI_API_KEY`. Nunca importe daqui em componente, store ou
   qualquer coisa que chegue ao browser — a chave iria junto.

   Por que ele existe, se já há `app/api/ia`: aquela rota é o caminho
   do BROWSER até a IA, e por isso exige sessão do Supabase e checa a
   permissão da conta. O webhook do WhatsApp não tem sessão nenhuma —
   quem chama é a Evolution — então não pode passar por lá. O que os
   dois compartilham (prompts, esquema, vocabulário de erro) continua
   em `lib/calculo/ia.ts`, que não conhece provedor nenhum.

   Aqui a IA faz a única coisa que não é escrever texto: lê a resposta
   do proprietário e devolve dado. Ainda assim é SUGESTÃO — quem grava
   o fato é o corretor, no nudge.
   ================================================================ */
import OpenAI from "openai";
import {
  ESQUEMA_CLASSIFICACAO,
  dataContextualDaResposta,
  motivoPerdaSeguro,
  promptClassificarResposta,
  type MensagemContextoClassificacao,
  type RespostaClassificada,
} from "../calculo/ia";
import { horaExplicitaDaMensagem, interlocutorSeDeclarouResponsavel } from "../calculo/webhookWhatsapp";
import { RESULTADOS_TENTATIVA, type ResultadoTentativa } from "../constantes";
import { registrarUsoDaResposta } from "./registro";
import {
  MAX_TOKENS_CLASSIFICACAO_IA as MAX_TOKENS,
} from "./ia/config";
import { carregarConfiguracaoIa } from "./ia/configuracao";

const VALIDOS: readonly string[] = RESULTADOS_TENTATIVA.map((r) => r.valor);

/** Só aceita data ISO plausível e não passada. O modelo às vezes devolve
    "2025-.." por hábito de treino, e uma data no passado viraria um follow-up
    que já venceu — pior que nenhum. */
function dataValida(valor: unknown, hoje: string): string | null {
  if (typeof valor !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) return null;
  return valor >= hoje ? valor : null;
}

/** Hora "HH:MM" em 24h, com os limites reais do relógio. O esquema pede o
    formato, mas nada nele impede "25:80" — e isso viraria um compromisso com
    hora impossível na faixa de horários da agenda. */
function horaValida(valor: unknown): string | null {
  if (typeof valor !== "string") return null;
  const m = valor.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h > 23 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${m[2]}`;
}

/**
 * Lê a resposta do proprietário e devolve o desfecho sugerido.
 *
 * `null` quando não há chave configurada, quando a IA falha ou quando ela
 * devolve algo fora do contrato. Nunca lança: o webhook precisa seguir e
 * gravar a nota de qualquer jeito — perder a sugestão é degradação aceitável,
 * perder a resposta do proprietário não é.
 */
export async function classificarResposta(
  texto: string,
  hoje: string,
  /** Dono da carteira, para o gasto ter dono no painel de admin. Vem da
      instância em `whatsapp_instancias`, nunca da requisição — o webhook
      não tem sessão de usuário. Opcional porque a classificação funciona
      sem ele; o que se perde é só a atribuição do custo. */
  userId: string | null = null,
  /** As mensagens trocadas antes desta, da mais antiga para a mais recente.
      A autoria mantém tanto os pedaços do recado do proprietário quanto a
      pergunta/data do corretor que a resposta atual está referenciando. */
  anteriores: readonly MensagemContextoClassificacao[] = [],
): Promise<{
  resultado: ResultadoTentativa;
  retomarEm: string | null;
  horaRetomar: string | null;
  resumo: string;
  motivoPerda: string | null;
} | null> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return null;
  // Sem texto não há o que ler (áudio, figurinha): a nota já registra o que
  // chegou, e pedir classificação de string vazia só gastaria token.
  if (!texto.trim()) return null;

  try {
    const configuracaoIa = await carregarConfiguracaoIa();
    const MODELO = configuracaoIa.classificacao.modelo;
    const openai = new OpenAI({ apiKey });
    const conclusao = await openai.chat.completions.create({
      model: MODELO,
      max_completion_tokens: MAX_TOKENS,
      reasoning_effort: configuracaoIa.classificacao.esforco,
      response_format: {
        type: "json_schema",
        json_schema: { name: "classificacao", strict: true, schema: ESQUEMA_CLASSIFICACAO },
      },
      messages: [{ role: "user", content: promptClassificarResposta(texto, hoje, anteriores) }],
    });

    /* O gasto, registrado antes de qualquer validação do conteúdo.
       Esta é a chamada de IA mais frequente do sistema — roda a CADA
       mensagem que um proprietário manda, sem ninguém pedir —, então é
       provavelmente a maior linha da fatura, e era a mais invisível de
       todas: as outras pelo menos nascem de um clique. */
    registrarUsoDaResposta(userId, "classificar-resposta", MODELO, conclusao.usage);

    const escolha = conclusao.choices[0];
    if (!escolha || escolha.message.refusal || escolha.finish_reason === "length") {
      console.error("IA: não classificou a resposta (recusa ou resposta truncada).");
      return null;
    }

    const dados = JSON.parse(escolha.message.content || "{}") as RespostaClassificada;
    // O enum do esquema já restringe, mas a checagem aqui é o que garante que
    // um desfecho desconhecido nunca entre no ranking — nem que o esquema mude
    // e alguém esqueça de olhar este arquivo.
    if (!VALIDOS.includes(dados.resultado)) {
      console.error("IA: desfecho fora do vocabulário:", dados.resultado);
      return null;
    }

    // Encerramento só vale junto de uma recusa. O modelo às vezes preenche o
    // motivo e classifica como "respondeu" ou "vai-retornar" — e aí as duas
    // leituras se contradizem. Diante da contradição, fica a menos destrutiva:
    // o imóvel continua na carteira e o corretor decide. O helper também cobre
    // o caso LD-179: recusa + "o imóvel não está mais disponível" ganha o
    // motivo genérico sem inventar se houve aluguel, venda ou desistência.
    const anterioresDoProprietario = anteriores.flatMap((mensagem) => {
      if (typeof mensagem === "string") return [mensagem];
      return mensagem.autor === "proprietario" ? [mensagem.texto] : [];
    });
    const resultado =
      dados.resultado === "outro-contato" && interlocutorSeDeclarouResponsavel([...anterioresDoProprietario, texto])
        ? "respondeu"
        : dados.resultado;
    const motivo = motivoPerdaSeguro({ ...dados, resultado }, texto);

    // Hora sem data não agenda nada ("às 10h" de que dia?), e sozinha só
    // poluiria a sugestão — por isso depende da data ter passado no filtro.
    const data = dataContextualDaResposta(texto, hoje, anteriores) || dataValida(dados.retomarEm, hoje);
    const horaDoTexto = horaExplicitaDaMensagem(texto);
    return {
      resultado: resultado as ResultadoTentativa,
      retomarEm: data,
      horaRetomar: data ? horaDoTexto || horaValida(dados.horaRetomar) : null,
      resumo: typeof dados.resumo === "string" ? dados.resumo.trim().slice(0, 300) : "",
      motivoPerda: motivo,
    };
  } catch (e) {
    console.error("IA: falha ao classificar a resposta:", e);
    return null;
  }
}
