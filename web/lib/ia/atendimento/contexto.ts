import type { Imovel } from "@/lib/tipos";
import { corpoDaResposta, ehSoMidia } from "@/lib/calculo/notas";
import { respostasDoImovel } from "@/lib/calculo/respostas";
import {
  MAX_MENSAGENS_ATENDIMENTO,
  type ContextoAtendimento,
  type ConversaAnterior,
} from "./contratos";

export interface SelecaoMensagensAtendimento {
  /** Todas as notas de WhatsApp do proprietario, inclusive midia e vazias. */
  mensagensRecebidas: number;
  /** Mensagens com texto que podem ser usadas pelo agente. */
  mensagensDisponiveis: number;
  mensagensDescartadasComoMidia: number;
  mensagensDescartadasVazias: number;
  /** A mensagem atual mais as anteriores que efetivamente entram no prompt. */
  mensagensSelecionadas: number;
  mensagemAtual: string;
  mensagemAtualEm: string | null;
  anteriores: string[];
}

/**
 * Seleciona, de forma pura e deterministica, as falas do proprietario usadas
 * pelo atendimento. A consulta do Supabase entrega o array JSONB inteiro; o
 * corte acontece somente aqui, depois da ordenacao cronologica.
 */
export function selecionarMensagensAtendimento(imovel: Imovel): SelecaoMensagensAtendimento {
  const recebidas = respostasDoImovel(imovel);
  let mensagensDescartadasComoMidia = 0;
  let mensagensDescartadasVazias = 0;
  const legiveis: Array<{ texto: string; data: string }> = [];

  for (const nota of recebidas) {
    if (ehSoMidia(nota.texto)) {
      mensagensDescartadasComoMidia += 1;
      continue;
    }
    const texto = corpoDaResposta(nota.texto).trim();
    if (!texto) {
      mensagensDescartadasVazias += 1;
      continue;
    }
    legiveis.push({ texto, data: nota.data || "" });
  }

  const atual = legiveis.at(-1);
  const anteriores = legiveis
    .slice(0, -1)
    .slice(-MAX_MENSAGENS_ATENDIMENTO)
    .map((mensagem) => mensagem.texto);

  return {
    mensagensRecebidas: recebidas.length,
    mensagensDisponiveis: legiveis.length,
    mensagensDescartadasComoMidia,
    mensagensDescartadasVazias,
    mensagensSelecionadas: anteriores.length + (atual ? 1 : 0),
    mensagemAtual: atual?.texto || "",
    mensagemAtualEm: atual?.data || null,
    anteriores,
  };
}

export function conversaAtendimento(
  selecao: SelecaoMensagensAtendimento,
  enviada: ConversaAnterior["enviada"],
): ConversaAnterior {
  return { anteriores: selecao.anteriores, enviada };
}

/** Somente fatos tipados. Observações e anúncio ficam fora porque são texto livre. */
export function contextoAtendimentoDoImovel(imovel: Imovel): ContextoAtendimento {
  const primeiroNome = (imovel.proprietarioNome || "").trim().split(/\s+/)[0] || "";
  const fatos = [
    imovel.endereco ? `endereco: ${imovel.endereco}` : "",
    imovel.unidade ? `unidade: ${imovel.unidade}` : "",
    imovel.bloco ? `bloco: ${imovel.bloco}` : "",
    imovel.edificio ? `edificio ou condominio: ${imovel.edificio}` : "",
    imovel.bairro ? `bairro: ${imovel.bairro}` : "",
    imovel.cidade ? `cidade: ${imovel.cidade}` : "",
    imovel.estado ? `estado: ${imovel.estado}` : "",
    imovel.tipo ? `tipo: ${imovel.tipo}` : "",
    typeof imovel.quartos === "number" && imovel.quartos > 0 ? `quartos: ${imovel.quartos}` : "",
    typeof imovel.banheiros === "number" && imovel.banheiros > 0 ? `banheiros: ${imovel.banheiros}` : "",
    typeof imovel.vagas === "number" && imovel.vagas > 0 ? `vagas: ${imovel.vagas}` : "",
    typeof imovel.valorAluguel === "number" && imovel.valorAluguel > 0
      ? `aluguel informado: R$ ${imovel.valorAluguel.toFixed(2)}`
      : "",
    typeof imovel.valorCondominio === "number" && imovel.valorCondominio > 0
      ? `condominio informado: R$ ${imovel.valorCondominio.toFixed(2)}`
      : "",
  ].filter(Boolean);

  return {
    proprietario: primeiroNome,
    fatosImovel: fatos,
    estagio: (imovel.status || "").trim(),
  };
}
