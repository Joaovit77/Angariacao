/* Falhas da análise por IA em linguagem de campo (C9.1).

   A rota `/api/prospeccao/classificar` devolve um CÓDIGO fechado
   (`FalhaClassificacao`); a tela traduz o código, nunca mostra mensagem
   bruta de fornecedor ou exceção. O mapa é fechado de propósito: código
   desconhecido cai na frase genérica, e nada aqui vira estado de domínio. */

const MENSAGENS: Record<string, string> = {
  "limite-diario": "O limite de análises de hoje foi atingido. Amanhã é possível analisar de novo.",
  ocupado: "Uma análise já está em andamento. Aguarde um instante.",
  "nao-configurado": "A análise automática não está disponível no momento.",
  indisponivel: "Não foi possível analisar agora. Tente novamente.",
  "limite-excedido": "O serviço de análise está sobrecarregado. Tente novamente em alguns minutos.",
  "falha-modelo": "A análise não pôde ser concluída. Tente novamente.",
  "falha-ia": "A análise não pôde ser concluída. Tente novamente.",
  "sessao-expirada": "Sua sessão expirou. Entre novamente para analisar.",
  "sem-permissao": "Você não tem permissão para usar a análise automática.",
  "exclusao-em-andamento": "Este registro está em exclusão; não é possível analisar.",
};

export const MENSAGEM_FALHA_ANALISE_GENERICA = MENSAGENS.indisponivel;

export function mensagemFalhaAnalise(codigo: string | null | undefined): string {
  return (codigo && MENSAGENS[codigo]) || MENSAGEM_FALHA_ANALISE_GENERICA;
}
