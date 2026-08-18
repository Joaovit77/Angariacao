import type { Imovel } from "@/lib/tipos";
import {
  corpoDaMensagemEnviada,
  corpoDaResposta,
  ehNotaDeMensagemEnviada,
  ehNotaRecebidaNaConversa,
  ehSoMidia,
} from "@/lib/calculo/notas";
import {
  MAX_MENSAGENS_ATENDIMENTO,
  type ContextoAtendimento,
  type ConversaAnterior,
  type MensagemAnteriorAtendimento,
} from "./contratos";

export interface SelecaoMensagensAtendimento {
  /** Todas as notas de WhatsApp do proprietario, inclusive midia e vazias. */
  mensagensRecebidas: number;
  mensagensEnviadas: number;
  /** Mensagens com texto que podem ser usadas pelo agente. */
  mensagensDisponiveis: number;
  mensagensRecebidasDisponiveis: number;
  mensagensEnviadasDisponiveis: number;
  mensagensDescartadasComoMidia: number;
  mensagensDescartadasVazias: number;
  /** A mensagem atual mais as anteriores que efetivamente entram no prompt. */
  mensagensSelecionadas: number;
  recebidasSelecionadas: number;
  enviadasSelecionadas: number;
  historicoBidirecional: boolean;
  classificacaoHistorico:
    | "historico_completo"
    | "historico_parcial"
    | "somente_recebidas"
    | "legado_sem_conversa";
  origemHistorico:
    | "notas-bidirecionais"
    | "notas-recebidas-legadas"
    | "notas-enviadas"
    | "sem-notas-whatsapp";
  mensagemAtual: string;
  mensagemAtualEm: string | null;
  anteriores: MensagemAnteriorAtendimento[];
}

/**
 * Seleciona, de forma pura e deterministica, a conversa bidirecional usada
 * pelo atendimento. A consulta do Supabase entrega o array JSONB inteiro; o
 * corte acontece somente aqui, depois da ordenacao cronologica.
 */
export function selecionarMensagensAtendimento(imovel: Imovel): SelecaoMensagensAtendimento {
  const todas = [...(imovel.notas || [])]
    .filter((nota) => ehNotaRecebidaNaConversa(nota) || ehNotaDeMensagemEnviada(nota))
    .sort((a, b) => (a.data || "").localeCompare(b.data || "") || (a.id || "").localeCompare(b.id || ""));
  const recebidas = todas.filter(ehNotaRecebidaNaConversa);
  const enviadas = todas.filter(ehNotaDeMensagemEnviada);
  let mensagensDescartadasComoMidia = 0;
  let mensagensDescartadasVazias = 0;
  const legiveis: Array<MensagemAnteriorAtendimento & { data: string; id: string }> = [];

  for (const nota of todas) {
    const autor = ehNotaDeMensagemEnviada(nota) ? "corretor" : "proprietario";
    const texto = (autor === "corretor" ? corpoDaMensagemEnviada(nota.texto) : corpoDaResposta(nota.texto)).trim();
    if (ehSoMidia(texto)) {
      mensagensDescartadasComoMidia += 1;
      continue;
    }
    if (!texto) {
      mensagensDescartadasVazias += 1;
      continue;
    }
    legiveis.push({ autor, texto, data: nota.data || "", id: nota.id || "" });
  }

  // Se a fala legível mais recente é do corretor, a última entrada já foi
  // respondida: não a reapresentamos ao agente como uma pendência atual.
  const indiceAtual = legiveis.at(-1)?.autor === "proprietario" ? legiveis.length - 1 : -1;
  const atual = indiceAtual >= 0 ? legiveis[indiceAtual] : undefined;
  const anteriores = legiveis
    .slice(0, indiceAtual < 0 ? 0 : indiceAtual)
    .slice(-MAX_MENSAGENS_ATENDIMENTO)
    .map(({ autor, texto }) => ({ autor, texto }));
  const recebidasDisponiveis = legiveis.filter((m) => m.autor === "proprietario").length;
  const enviadasDisponiveis = legiveis.filter((m) => m.autor === "corretor").length;
  const recebidasSelecionadas = anteriores.filter((m) => m.autor === "proprietario").length + (atual ? 1 : 0);
  const enviadasSelecionadas = anteriores.filter((m) => m.autor === "corretor").length;
  const historicoBidirecional = recebidasDisponiveis > 0 && enviadasDisponiveis > 0;
  const classificacaoHistorico = historicoBidirecional
    ? todas.every((nota) => nota.direcao === "recebida" || nota.direcao === "enviada")
      ? "historico_completo"
      : "historico_parcial"
    : recebidasDisponiveis > 0
      ? "somente_recebidas"
      : enviadasDisponiveis > 0
        ? "historico_parcial"
        : "legado_sem_conversa";

  return {
    mensagensRecebidas: recebidas.length,
    mensagensEnviadas: enviadas.length,
    mensagensDisponiveis: legiveis.length,
    mensagensRecebidasDisponiveis: recebidasDisponiveis,
    mensagensEnviadasDisponiveis: enviadasDisponiveis,
    mensagensDescartadasComoMidia,
    mensagensDescartadasVazias,
    mensagensSelecionadas: anteriores.length + (atual ? 1 : 0),
    recebidasSelecionadas,
    enviadasSelecionadas,
    historicoBidirecional,
    classificacaoHistorico,
    origemHistorico: historicoBidirecional
      ? "notas-bidirecionais"
      : recebidas.length
        ? "notas-recebidas-legadas"
        : enviadas.length
          ? "notas-enviadas"
          : "sem-notas-whatsapp",
    mensagemAtual: atual?.texto || "",
    mensagemAtualEm: atual?.data || null,
    anteriores,
  };
}

export function conversaAtendimento(
  selecao: SelecaoMensagensAtendimento,
  enviada: ConversaAnterior["enviada"],
): ConversaAnterior {
  return {
    anteriores: selecao.anteriores,
    // A abordagem é apenas a ponte para registros antigos. Assim que existe
    // uma saída textual persistida, ela deixa de ser sintetizada no prompt.
    enviada: selecao.mensagensEnviadasDisponiveis > 0 ? null : enviada,
  };
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
