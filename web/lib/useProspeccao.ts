"use client";

import { create } from "zustand";

import {
  acrescentarAvistamento,
  aplicarEtiquetaHumana,
  confirmarEtiqueta,
  contestarEtiqueta,
  corrigirObservacaoAvistamento,
  criarIdentificado,
  definirTipoManual,
  descartarIdentificado,
  finalizarFotoAvistamento,
  listarIdentificados,
  obterIdentificado,
  reservarFotoAvistamento,
  type DadosAvistamento,
  type DadosIdentificacao,
  type DetalheImovelIdentificado,
  type ImovelIdentificado,
  type ReservaFotoAvistamento,
} from "./prospeccao";
import type {
  CategoriaEtiquetaProspeccao,
  CodigoEtiquetaProspeccao,
} from "./calculo/catalogoEtiquetas";
import type { TipoImovelProspeccao } from "./calculo/prospeccao";

interface EstadoProspeccao {
  itens: ImovelIdentificado[];
  detalhe: DetalheImovelIdentificado | null;
  selecionadoId: string | null;
  pagina: number;
  porPagina: number;
  total: number;
  temMais: boolean;
  carregando: boolean;
  salvando: boolean;
  erro: string | null;
  carregarPagina: (pagina?: number, porPagina?: number) => Promise<boolean>;
  carregarDetalhe: (id: string, incluirClassificacoes?: boolean) => Promise<boolean>;
  limparSelecao: () => void;
  limparErro: () => void;
  resetar: () => void;
  criar: (
    usuarioId: string,
    dados: DadosIdentificacao,
    primeiroAvistamento: DadosAvistamento,
  ) => Promise<boolean>;
  adicionarAvistamento: (
    usuarioId: string,
    imovelIdentificadoId: string,
    dados: DadosAvistamento,
  ) => Promise<boolean>;
  corrigirObservacao: (
    imovelIdentificadoId: string,
    avistamentoId: string,
    observacao: string,
  ) => Promise<boolean>;
  reservarFoto: (
    imovelIdentificadoId: string,
    avistamentoId: string,
    dados: { largura: number; altura: number; bytes: number },
  ) => Promise<ReservaFotoAvistamento | null>;
  finalizarFoto: (imovelIdentificadoId: string, fotoId: string) => Promise<boolean>;
  descartar: (imovelIdentificadoId: string, motivo?: string | null) => Promise<boolean>;
  aplicarEtiqueta: (
    imovelIdentificadoId: string,
    avistamentoId: string | null,
    categoria: CategoriaEtiquetaProspeccao,
    codigo: CodigoEtiquetaProspeccao,
  ) => Promise<boolean>;
  confirmarEtiqueta: (imovelIdentificadoId: string, etiquetaId: number) => Promise<boolean>;
  contestarEtiqueta: (imovelIdentificadoId: string, etiquetaId: number) => Promise<boolean>;
  definirTipo: (
    imovelIdentificadoId: string,
    tipo: TipoImovelProspeccao | null,
  ) => Promise<boolean>;
}

const estadoInicial = {
  itens: [] as ImovelIdentificado[],
  detalhe: null as DetalheImovelIdentificado | null,
  selecionadoId: null as string | null,
  pagina: 1,
  porPagina: 24,
  total: 0,
  temMais: false,
  carregando: false,
  salvando: false,
  erro: null as string | null,
};

function substituirIdentificado(
  itens: ImovelIdentificado[],
  identificado: ImovelIdentificado,
): ImovelIdentificado[] {
  const indice = itens.findIndex((item) => item.id === identificado.id);
  if (indice < 0) return [identificado, ...itens];
  return itens.map((item) => (item.id === identificado.id ? identificado : item));
}

export const useProspeccao = create<EstadoProspeccao>((set, get) => {
  async function detalheAtualizado(
    imovelIdentificadoId: string,
  ): Promise<DetalheImovelIdentificado> {
    const incluirClassificacoes =
      get().detalhe?.identificado.id === imovelIdentificadoId &&
      get().detalhe?.classificacoesCarregadas === true;
    const detalhe = await obterIdentificado(imovelIdentificadoId, { incluirClassificacoes });
    if (!detalhe) throw new Error("Identificação não encontrada após a operação.");
    return detalhe;
  }

  function registrarDetalhe(detalhe: DetalheImovelIdentificado) {
    set((estado) => ({
      itens: substituirIdentificado(estado.itens, detalhe.identificado),
      detalhe,
      selecionadoId: detalhe.identificado.id,
    }));
  }

  async function executarMutacao(
    mensagem: string,
    operacao: () => Promise<DetalheImovelIdentificado>,
  ): Promise<boolean> {
    set({ salvando: true, erro: null });
    try {
      const detalhe = await operacao();
      registrarDetalhe(detalhe);
      set({ salvando: false });
      return true;
    } catch {
      set({ salvando: false, erro: mensagem });
      return false;
    }
  }

  return {
    ...estadoInicial,
    async carregarPagina(pagina = get().pagina, porPagina = get().porPagina) {
      set({ carregando: true, erro: null });
      try {
        const resultado = await listarIdentificados({ pagina, porPagina });
        set({
          itens: resultado.itens,
          pagina: resultado.pagina,
          porPagina: resultado.porPagina,
          total: resultado.total,
          temMais: resultado.temMais,
          carregando: false,
        });
        return true;
      } catch {
        set({ carregando: false, erro: "Não foi possível carregar o Garimpo em Campo." });
        return false;
      }
    },
    async carregarDetalhe(id, incluirClassificacoes = false) {
      set({ carregando: true, erro: null });
      try {
        const detalhe = await obterIdentificado(id, { incluirClassificacoes });
        if (!detalhe) {
          set({ carregando: false, erro: "Identificação não encontrada." });
          return false;
        }
        registrarDetalhe(detalhe);
        set({ carregando: false });
        return true;
      } catch {
        set({ carregando: false, erro: "Não foi possível carregar esta identificação." });
        return false;
      }
    },
    limparSelecao() {
      set({ detalhe: null, selecionadoId: null });
    },
    limparErro() {
      set({ erro: null });
    },
    resetar() {
      set(estadoInicial);
    },
    criar(usuarioId, dados, primeiroAvistamento) {
      return executarMutacao("Não foi possível registrar esta identificação.", async () => {
        const criado = await criarIdentificado(usuarioId, dados, primeiroAvistamento);
        return detalheAtualizado(criado.identificado.id);
      });
    },
    adicionarAvistamento(usuarioId, imovelIdentificadoId, dados) {
      return executarMutacao("Não foi possível adicionar o avistamento.", async () => {
        await acrescentarAvistamento(usuarioId, imovelIdentificadoId, dados);
        return detalheAtualizado(imovelIdentificadoId);
      });
    },
    corrigirObservacao(imovelIdentificadoId, avistamentoId, observacao) {
      return executarMutacao("Não foi possível corrigir a observação.", async () => {
        await corrigirObservacaoAvistamento(avistamentoId, observacao);
        return detalheAtualizado(imovelIdentificadoId);
      });
    },
    async reservarFoto(imovelIdentificadoId, avistamentoId, dados) {
      set({ salvando: true, erro: null });
      try {
        const reserva = await reservarFotoAvistamento(avistamentoId, dados);
        const detalhe = await detalheAtualizado(imovelIdentificadoId);
        registrarDetalhe(detalhe);
        set({ salvando: false });
        return reserva;
      } catch {
        set({ salvando: false, erro: "Não foi possível reservar a foto." });
        return null;
      }
    },
    finalizarFoto(imovelIdentificadoId, fotoId) {
      return executarMutacao("Não foi possível finalizar a foto.", async () => {
        await finalizarFotoAvistamento(fotoId);
        return detalheAtualizado(imovelIdentificadoId);
      });
    },
    descartar(imovelIdentificadoId, motivo) {
      return executarMutacao("Não foi possível descartar esta identificação.", async () => {
        await descartarIdentificado(imovelIdentificadoId, motivo);
        return detalheAtualizado(imovelIdentificadoId);
      });
    },
    aplicarEtiqueta(imovelIdentificadoId, avistamentoId, categoria, codigo) {
      return executarMutacao("Não foi possível aplicar a etiqueta.", async () => {
        await aplicarEtiquetaHumana(imovelIdentificadoId, avistamentoId, categoria, codigo);
        return detalheAtualizado(imovelIdentificadoId);
      });
    },
    confirmarEtiqueta(imovelIdentificadoId, etiquetaId) {
      return executarMutacao("Não foi possível confirmar a etiqueta.", async () => {
        await confirmarEtiqueta(etiquetaId);
        return detalheAtualizado(imovelIdentificadoId);
      });
    },
    contestarEtiqueta(imovelIdentificadoId, etiquetaId) {
      return executarMutacao("Não foi possível contestar a etiqueta.", async () => {
        await contestarEtiqueta(etiquetaId);
        return detalheAtualizado(imovelIdentificadoId);
      });
    },
    definirTipo(imovelIdentificadoId, tipo) {
      return executarMutacao("Não foi possível definir o tipo do imóvel.", async () => {
        await definirTipoManual(imovelIdentificadoId, tipo);
        return detalheAtualizado(imovelIdentificadoId);
      });
    },
  };
});
