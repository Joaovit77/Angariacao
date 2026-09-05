import type {
  ContextoAtendimento,
  ConversaAnterior,
  FonteEvidenciaAtendimento,
  MensagemAnteriorAtendimento,
  ProtocoloPrompt,
} from "./contratos";

interface EntradaCatalogoFontesAtendimento {
  mensagemAtual: string;
  mensagemAtualId: string | null;
  contexto: ContextoAtendimento;
  conversa?: ConversaAnterior;
  informacoesComerciais: readonly ProtocoloPrompt[];
}

/**
 * Constrói somente um inventário das fontes já carregadas. A decisão pode
 * reconhecer fatos nessas fontes, mas não criar uma origem nova.
 */
export function catalogoFontesAtendimento({
  mensagemAtual,
  mensagemAtualId,
  contexto,
  conversa,
  informacoesComerciais,
}: EntradaCatalogoFontesAtendimento): FonteEvidenciaAtendimento[] {
  const fontes: Omit<FonteEvidenciaAtendimento, "id">[] = [];
  const adicionar = (fonte: Omit<FonteEvidenciaAtendimento, "id">) => {
    if (fonte.conteudo.trim()) fontes.push({ ...fonte, conteudo: fonte.conteudo.trim() });
  };

  adicionar({
    origem: "mensagem-recebida",
    autoridade: "fala-atual-atribuida",
    referencia: mensagemAtualId || "mensagem-atual",
    conteudo: mensagemAtual,
    temporalidadeBase: "atual",
  });

  if (contexto.estagio.trim()) {
    adicionar({
      origem: "estado-operacional-atual",
      autoridade: "dado-estruturado-atual",
      referencia: "estagio-angariacao",
      conteudo: contexto.estagio,
      temporalidadeBase: "atual",
    });
  }

  contexto.fatosImovel.forEach((fato, indice) => {
    adicionar({
      origem: "dado-estruturado-imovel",
      autoridade: "dado-estruturado-atual",
      referencia: `fato-imovel-${indice + 1}`,
      conteudo: fato,
      temporalidadeBase: fato.startsWith("ultimos estagios:") ? "historica" : "atual",
    });
  });

  const adicionarMensagemHistorica = (
    mensagem: MensagemAnteriorAtendimento,
    referenciaFallback: string,
  ) => {
    adicionar({
      origem: mensagem.autor === "corretor" ? "mensagem-enviada" : "mensagem-recebida",
      autoridade: "fala-historica-atribuida",
      referencia: mensagem.id || mensagem.data || referenciaFallback,
      conteudo: mensagem.texto,
      temporalidadeBase: "historica",
    });
  };
  (conversa?.anteriores || []).forEach((mensagem, indice) => {
    const normalizada = typeof mensagem === "string"
      ? { autor: "proprietario" as const, texto: mensagem }
      : mensagem;
    adicionarMensagemHistorica(normalizada, `mensagem-recente-${indice + 1}`);
  });
  (conversa?.antigasRelevantes || []).forEach((mensagem, indice) => {
    adicionarMensagemHistorica(mensagem, `mensagem-antiga-${indice + 1}`);
  });

  if (conversa?.enviada?.texto?.trim()) {
    adicionar({
      origem: "historico",
      autoridade: "fallback-legado",
      referencia: conversa.enviada.rotulo?.trim() || "abordagem-legada",
      conteudo: conversa.enviada.texto,
      temporalidadeBase: "desconhecida",
    });
  }

  informacoesComerciais.forEach((protocolo) => {
    adicionar({
      origem: "protocolo",
      autoridade: "protocolo-ativo",
      referencia: protocolo.titulo,
      conteudo: protocolo.conteudo,
      temporalidadeBase: "desconhecida",
    });
  });

  return fontes.map((fonte, indice) => ({ id: `fonte_${indice + 1}`, ...fonte }));
}
