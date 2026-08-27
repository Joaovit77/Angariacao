import type { BlocoAssistente, ResultadoHistoricoAssistente } from "./tipos";

const MAX_BLOCOS = 4;
const MAX_ITENS_POR_BLOCO = 10;
const MAX_TEXTO = 120;

const textoSeguro = (valor: unknown, max = MAX_TEXTO) =>
  typeof valor === "string" ? valor.trim().slice(0, max) : "";

const marcoSeguro = (valor: unknown): "angariado" | "publicado" | "locado" | undefined =>
  valor === "angariado" || valor === "publicado" || valor === "locado" ? valor : undefined;

export function blocosComItens(blocos: BlocoAssistente[]): BlocoAssistente[] {
  return blocos.filter((bloco) => bloco.itens.length > 0);
}

export function compactarBlocosParaHistorico(blocos: BlocoAssistente[] | undefined): ResultadoHistoricoAssistente[] {
  if (!blocos?.length) return [];
  return blocosComItens(blocos).slice(0, MAX_BLOCOS).flatMap((bloco): ResultadoHistoricoAssistente[] => {
    if (bloco.tipo === "imoveis") return [{ tipo: bloco.tipo, itens: bloco.itens.slice(0, MAX_ITENS_POR_BLOCO).map((item) => ({
      id: textoSeguro(item.id, 100), codigo: textoSeguro(item.codigo, 40), bairro: textoSeguro(item.bairro), status: textoSeguro(item.status, 80),
      ...(item.marco ? { marco: item.marco } : {}),
      ...(item.marcoEm ? { marcoEm: textoSeguro(item.marcoEm, 30) } : {}),
    })) }];
    if (bloco.tipo === "agenda") return [{ tipo: bloco.tipo, itens: bloco.itens.slice(0, MAX_ITENS_POR_BLOCO).map((item) => ({
      id: textoSeguro(item.id, 100), titulo: textoSeguro(item.titulo), data: textoSeguro(item.data, 30), imovelId: item.imovelId ? textoSeguro(item.imovelId, 100) : null,
    })) }];
    if (bloco.tipo === "mensagens_agendadas") return [{ tipo: bloco.tipo, itens: bloco.itens.slice(0, MAX_ITENS_POR_BLOCO).map((item) => ({
      id: textoSeguro(item.id, 100), nomeProprietario: textoSeguro(item.nomeProprietario), dataEnvio: textoSeguro(item.dataEnvio, 40), status: textoSeguro(item.status, 30), imovelId: item.imovelId ? textoSeguro(item.imovelId, 100) : null,
    })) }];
    if (bloco.tipo === "conversas_respondidas") return [{ tipo: bloco.tipo, itens: bloco.itens.slice(0, MAX_ITENS_POR_BLOCO).map((item) => ({
      imovelId: textoSeguro(item.imovelId, 100), codigo: textoSeguro(item.codigo, 40), proprietario: textoSeguro(item.proprietario), ultimaRespostaEm: textoSeguro(item.ultimaRespostaEm, 40), aguardandoCorretor: item.aguardandoCorretor,
    })) }];
    if (bloco.tipo === "metricas") return [{ tipo: bloco.tipo, itens: bloco.itens.slice(0, MAX_ITENS_POR_BLOCO).map((item) => ({ rotulo: textoSeguro(item.rotulo), valor: textoSeguro(item.valor) })) }];
    // Historico detalhado pode conter notas livres e nao e necessario para resolver "desses".
    return [];
  });
}

export function normalizarResultadosHistorico(valor: unknown): ResultadoHistoricoAssistente[] {
  if (!Array.isArray(valor)) return [];
  const blocos = valor.slice(0, MAX_BLOCOS).flatMap((bruto): ResultadoHistoricoAssistente[] => {
    if (!bruto || typeof bruto !== "object") return [];
    const bloco = bruto as Record<string, unknown>;
    if (!Array.isArray(bloco.itens)) return [];
    const itens = bloco.itens.slice(0, MAX_ITENS_POR_BLOCO).filter((item): item is Record<string, unknown> => !!item && typeof item === "object");
    if (bloco.tipo === "imoveis") return [{ tipo: "imoveis", itens: itens.map((item) => {
      const marco = marcoSeguro(item.marco);
      const marcoEm = textoSeguro(item.marcoEm, 30);
      return {
        id: textoSeguro(item.id, 100),
        codigo: textoSeguro(item.codigo, 40),
        bairro: textoSeguro(item.bairro),
        status: textoSeguro(item.status, 80),
        ...(marco ? { marco } : {}),
        ...(marcoEm ? { marcoEm } : {}),
      };
    }).filter((item) => item.id) }];
    if (bloco.tipo === "agenda") return [{ tipo: "agenda", itens: itens.map((item) => ({ id: textoSeguro(item.id, 100), titulo: textoSeguro(item.titulo), data: textoSeguro(item.data, 30), imovelId: textoSeguro(item.imovelId, 100) || null })).filter((item) => item.id) }];
    if (bloco.tipo === "mensagens_agendadas") return [{ tipo: "mensagens_agendadas", itens: itens.map((item) => ({ id: textoSeguro(item.id, 100), nomeProprietario: textoSeguro(item.nomeProprietario), dataEnvio: textoSeguro(item.dataEnvio, 40), status: textoSeguro(item.status, 30), imovelId: textoSeguro(item.imovelId, 100) || null })).filter((item) => item.id) }];
    if (bloco.tipo === "conversas_respondidas") return [{ tipo: "conversas_respondidas", itens: itens.map((item) => ({ imovelId: textoSeguro(item.imovelId, 100), codigo: textoSeguro(item.codigo, 40), proprietario: textoSeguro(item.proprietario), ultimaRespostaEm: textoSeguro(item.ultimaRespostaEm, 40), aguardandoCorretor: item.aguardandoCorretor === true })).filter((item) => item.imovelId) }];
    if (bloco.tipo === "metricas") return [{ tipo: "metricas", itens: itens.map((item) => ({ rotulo: textoSeguro(item.rotulo), valor: textoSeguro(item.valor) })).filter((item) => item.rotulo) }];
    return [];
  });
  return blocos.filter((bloco) => bloco.itens.length > 0);
}
