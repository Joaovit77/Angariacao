"use client";

import { create } from "zustand";

import {
  acrescentarAvistamento,
  aplicarEtiquetaHumana,
  atualizarEnderecoIdentificado,
  buscarCandidatosDuplicidade,
  cancelarExclusaoIdentificado,
  classificarAvistamento,
  confirmarEtiqueta,
  confirmarTipoIdentificado,
  contestarEtiqueta,
  corrigirObservacaoAvistamento,
  criarIdentificado,
  definirTipoManual,
  descartarIdentificado,
  excluirIdentificado,
  finalizarFotoAvistamento,
  fundirIdentificados,
  listarIdentificados,
  obterIdentificado,
  previaExclusaoIdentificado,
  removerFotoAvistamento,
  reservarFotoAvistamento,
  type DadosAvistamento,
  type DadosEnderecoIdentificado,
  type DadosIdentificacao,
  type DetalheImovelIdentificado,
  identidadeParaDedupe,
  type ImovelIdentificado,
  type PreviaExclusaoIdentificado,
  type ReservaFotoAvistamento,
  type ResultadoClassificacaoAvistamento,
  type ResultadoExclusaoProspeccao,
  type ResultadoFusaoIdentificados,
} from "./prospeccao";
import type {
  CategoriaEtiquetaProspeccao,
  CodigoEtiquetaProspeccao,
} from "./calculo/catalogoEtiquetas";
import {
  encontrarDuplicatasProspeccao,
  type IdentidadeParaDedupe,
  type ResultadoDedupeProspeccao,
} from "./calculo/dedupeProspeccao";
import type { TipoImovelProspeccao } from "./calculo/prospeccao";

/** O que a tela mostra: cada veredito junto do candidato que o produziu. */
export interface DuplicataEncontrada {
  resultado: ResultadoDedupeProspeccao;
  candidato: ImovelIdentificado;
}

interface EstadoProspeccao {
  itens: ImovelIdentificado[];
  detalhe: DetalheImovelIdentificado | null;
  selecionadoId: string | null;
  pagina: number;
  porPagina: number;
  total: number;
  temMais: boolean;
  /** Mostra também descartados, fundidos e exclusões pendentes. */
  incluirOcultos: boolean;
  carregando: boolean;
  salvando: boolean;
  erro: string | null;
  aviso: string | null;
  revisaoFusao: number;
  /** Avistamento cuja classificação por IA está em curso, se houver. Não
      bloqueia o resto da tela: a chamada corre em segundo plano. */
  classificandoAvistamentoId: string | null;
  /** Motivo (código fechado da rota) da última tentativa de análise que
      falhou, preso ao avistamento em que falhou. Estado TRANSITÓRIO de
      tela: não persiste, não vai ao banco, some na próxima tentativa, no
      sucesso, ao trocar de seleção e ao resetar. Nunca guarda mensagem
      bruta de fornecedor: só o código. */
  falhaAnalise: { avistamentoId: string; codigo: string } | null;
  fundir: (sobreviventeId: string, absorvidoId: string) => Promise<ResultadoFusaoIdentificados | null>;
  carregarPagina: (pagina?: number, porPagina?: number) => Promise<boolean>;
  definirIncluirOcultos: (incluirOcultos: boolean) => Promise<boolean>;
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
  /** Assina um tipo inferido pela IA; a origem `ia-texto` fica registrada. */
  confirmarTipo: (imovelIdentificadoId: string) => Promise<boolean>;
  /** Pede a classificação por IA de UM avistamento pela rota (C8). Nunca
      escreve `erro`: IA indisponível é estado do avistamento, não falha da
      tela. Devolve null se a rota não respondeu. */
  classificarAvistamento: (
    imovelIdentificadoId: string,
    avistamentoId: string,
  ) => Promise<ResultadoClassificacaoAvistamento | null>;
  definirTipo: (
    imovelIdentificadoId: string,
    tipo: TipoImovelProspeccao | null,
  ) => Promise<boolean>;
  /** Informa ou corrige o endereço de um imóvel já cadastrado. Só o
      endereço: passagens, localização e tipo ficam como estão. */
  definirEndereco: (
    imovelIdentificadoId: string,
    dados: DadosEnderecoIdentificado,
  ) => Promise<boolean>;
  /** Dedupe (C7): candidatos da conta pela fronteira, veredito pelo núcleo puro.
      Só avisa — não muda estado, não bloqueia, não funde. */
  buscarDuplicatas: (alvo: IdentidadeParaDedupe) => Promise<DuplicataEncontrada[] | null>;
  /** O que a exclusão vai alcançar; não muda estado. */
  previaExclusao: (imovelIdentificadoId: string) => Promise<PreviaExclusaoIdentificado | null>;
  /** Hard delete pela rota. Chamar de novo sobre exclusão pendente é retomar. */
  excluir: (imovelIdentificadoId: string) => Promise<ResultadoExclusaoProspeccao | null>;
  cancelarExclusao: (imovelIdentificadoId: string) => Promise<boolean>;
  removerFoto: (
    imovelIdentificadoId: string,
    fotoId: string,
  ) => Promise<ResultadoExclusaoProspeccao | null>;
}

const estadoInicial = {
  itens: [] as ImovelIdentificado[],
  detalhe: null as DetalheImovelIdentificado | null,
  selecionadoId: null as string | null,
  pagina: 1,
  porPagina: 24,
  total: 0,
  temMais: false,
  incluirOcultos: false,
  carregando: false,
  salvando: false,
  erro: null as string | null,
  aviso: null as string | null,
  revisaoFusao: 0,
  classificandoAvistamentoId: null as string | null,
  falhaAnalise: null as { avistamentoId: string; codigo: string } | null,
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
  let versaoEstado = 0;
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
      // Trocar de imóvel apaga o motivo de falha do anterior: ele é do
      // avistamento em que falhou e não tem o que dizer sobre outro registro.
      falhaAnalise: estado.detalhe?.identificado.id === detalhe.identificado.id ? estado.falhaAnalise : null,
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

  /** Gatilho do C8: avistamento salvo ou observação corrigida pede
      classificação em segundo plano. A gravação já aconteceu — a
      classificação não a condiciona nem a atrasa. */
  function classificarEmSegundoPlano(imovelIdentificadoId: string, avistamentoId: string): void {
    void get().classificarAvistamento(imovelIdentificadoId, avistamentoId);
  }

  return {
    ...estadoInicial,
    async carregarPagina(pagina = get().pagina, porPagina = get().porPagina) {
      set({ carregando: true, erro: null });
      try {
        const resultado = await listarIdentificados({
          pagina,
          porPagina,
          incluirOcultos: get().incluirOcultos,
        });
        set({
          itens: resultado.itens,
          pagina: resultado.pagina,
          porPagina: resultado.porPagina,
          total: resultado.total,
          temMais: resultado.temMais,
          carregando: false,
          aviso: null,
        });
        return true;
      } catch {
        set({ carregando: false, erro: "Não foi possível carregar o Garimpo em Campo." });
        return false;
      }
    },
    definirIncluirOcultos(incluirOcultos) {
      set({ incluirOcultos });
      return get().carregarPagina(1, get().porPagina);
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
      set({ detalhe: null, selecionadoId: null, falhaAnalise: null });
    },
    limparErro() {
      set({ erro: null });
    },
    resetar() {
      versaoEstado += 1;
      set(estadoInicial);
    },
    async fundir(sobreviventeId, absorvidoId) {
      if (get().salvando || get().carregando) return null;
      const versao = versaoEstado;
      const { porPagina, incluirOcultos, detalhe } = get();
      set({ salvando: true, erro: null, aviso: null });
      let resultado: ResultadoFusaoIdentificados;
      try {
        resultado = await fundirIdentificados(sobreviventeId, absorvidoId);
      } catch (erro) {
        if (versao === versaoEstado) set({
          salvando: false,
          erro: erro instanceof Error ? erro.message : "Não foi possível confirmar a união. Tente novamente com a mesma escolha.",
        });
        return null;
      }
      if (versao !== versaoEstado) return null;
      try {
        // A lista e o histórico são publicados juntos, somente depois da RPC.
        // Começar na primeira página evita uma página vazia após a união.
        const [pagina, sobrevivente] = await Promise.all([
          listarIdentificados({ pagina: 1, porPagina, incluirOcultos }),
          obterIdentificado(sobreviventeId, { incluirClassificacoes: detalhe?.classificacoesCarregadas === true }),
        ]);
        if (!sobrevivente) throw new Error("Registro principal não encontrado após a união.");
        if (versao !== versaoEstado) return null;
        set((estado) => ({
          ...pagina,
          detalhe: sobrevivente,
          selecionadoId: sobreviventeId,
          salvando: false,
          revisaoFusao: estado.revisaoFusao + 1,
        }));
      } catch {
        if (versao !== versaoEstado) return null;
        // A união já aconteceu. Retirar o retrato antigo evita operar a lápide
        // como se estivesse viva; a recuperação é só leitura, sem outra RPC.
        set((estado) => ({
          itens: [], detalhe: null, selecionadoId: null, pagina: 1, total: 0, temMais: false,
          salvando: false, revisaoFusao: estado.revisaoFusao + 1,
          aviso: "Os registros foram unidos, mas não foi possível atualizar a tela. Recarregue para consultar o histórico.",
        }));
      }
      return resultado;
    },
    async criar(usuarioId, dados, primeiroAvistamento) {
      let criadoId: { identificado: string; avistamento: string } | null = null;
      const sucesso = await executarMutacao("Não foi possível registrar esta identificação.", async () => {
        const criado = await criarIdentificado(usuarioId, dados, primeiroAvistamento);
        criadoId = { identificado: criado.identificado.id, avistamento: criado.avistamento.id };
        return detalheAtualizado(criado.identificado.id);
      });
      if (sucesso && criadoId) {
        const { identificado, avistamento } = criadoId as { identificado: string; avistamento: string };
        // A releitura canônica já inseriu o novo registro na lista local,
        // mas não passa pela consulta paginada que traz o `count`. Como a
        // criação acabou de ser confirmada, o total disponível sobe uma vez
        // sem exigir outra leitura do banco.
        set((estado) => ({
          total: estado.total + 1,
          temMais: estado.pagina * estado.porPagina < estado.total + 1,
        }));
        classificarEmSegundoPlano(identificado, avistamento);
      }
      return sucesso;
    },
    async adicionarAvistamento(usuarioId, imovelIdentificadoId, dados) {
      let avistamentoId: string | null = null;
      const sucesso = await executarMutacao("Não foi possível adicionar o avistamento.", async () => {
        const avistamento = await acrescentarAvistamento(usuarioId, imovelIdentificadoId, dados);
        avistamentoId = avistamento.id;
        return detalheAtualizado(imovelIdentificadoId);
      });
      if (sucesso && avistamentoId) classificarEmSegundoPlano(imovelIdentificadoId, avistamentoId);
      return sucesso;
    },
    async corrigirObservacao(imovelIdentificadoId, avistamentoId, observacao) {
      const sucesso = await executarMutacao("Não foi possível corrigir a observação.", async () => {
        await corrigirObservacaoAvistamento(avistamentoId, observacao);
        return detalheAtualizado(imovelIdentificadoId);
      });
      // O gatilho do banco já subiu a revisão e devolveu o avistamento a
      // `pendente`; a nova classificação é sobre o texto novo.
      if (sucesso) classificarEmSegundoPlano(imovelIdentificadoId, avistamentoId);
      return sucesso;
    },
    async classificarAvistamento(imovelIdentificadoId, avistamentoId) {
      if (get().classificandoAvistamentoId === avistamentoId) return null;
      const versao = versaoEstado;
      // Nova tentativa apaga o motivo anterior DESTE avistamento.
      set((estado) => ({
        classificandoAvistamentoId: avistamentoId,
        falhaAnalise: estado.falhaAnalise?.avistamentoId === avistamentoId ? null : estado.falhaAnalise,
      }));
      let resultado: ResultadoClassificacaoAvistamento | null = null;
      try {
        resultado = (await classificarAvistamento(avistamentoId)) ?? null;
      } catch {
        resultado = null;
      }
      if (versao !== versaoEstado) return resultado;
      // Motivo transitório para a tela: só o código fechado da rota; sem
      // resposta (rede, sessão) vira "indisponivel". Sucesso limpa.
      if (!resultado) {
        set({ falhaAnalise: { avistamentoId, codigo: "indisponivel" } });
      } else if (!resultado.ok) {
        set({ falhaAnalise: { avistamentoId, codigo: resultado.falha ?? "indisponivel" } });
      } else {
        set((estado) => ({
          falhaAnalise: estado.falhaAnalise?.avistamentoId === avistamentoId ? null : estado.falhaAnalise,
        }));
      }
      // Seja qual for a resposta (inclusive "indisponível"), o que a tela
      // mostra é o estado do banco. Releitura silenciosa: nada de
      // `salvando`, nada de `erro`. Sem resposta, nada mudou: não relê.
      if (resultado && get().detalhe?.identificado.id === imovelIdentificadoId) {
        try {
          registrarDetalhe(await detalheAtualizado(imovelIdentificadoId));
        } catch {
          // A classificação já está gravada (ou não); a próxima leitura mostra.
        }
      }
      if (get().classificandoAvistamentoId === avistamentoId) set({ classificandoAvistamentoId: null });
      return resultado;
    },
    confirmarTipo(imovelIdentificadoId) {
      return executarMutacao("Não foi possível confirmar o tipo do imóvel.", async () => {
        await confirmarTipoIdentificado(imovelIdentificadoId);
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
    definirEndereco(imovelIdentificadoId, dados) {
      return executarMutacao("Não foi possível salvar o endereço.", async () => {
        await atualizarEnderecoIdentificado(imovelIdentificadoId, dados);
        return detalheAtualizado(imovelIdentificadoId);
      });
    },
    async buscarDuplicatas(alvo) {
      try {
        const candidatos = await buscarCandidatosDuplicidade(alvo);
        const porId = new Map(candidatos.map((candidato) => [candidato.id, candidato]));
        return encontrarDuplicatasProspeccao(alvo, candidatos.map(identidadeParaDedupe))
          .map((resultado) => ({ resultado, candidato: porId.get(resultado.candidatoId)! }));
      } catch {
        return null;
      }
    },
    async previaExclusao(imovelIdentificadoId) {
      try {
        return await previaExclusaoIdentificado(imovelIdentificadoId);
      } catch {
        return null;
      }
    },
    async excluir(imovelIdentificadoId) {
      set({ salvando: true, erro: null });
      try {
        const resultado = await excluirIdentificado(imovelIdentificadoId);
        if (resultado.concluido) {
          // O pai já não existe: nada a reler. Sai da lista e do detalhe.
          set((estado) => ({
            itens: estado.itens.filter((item) => item.id !== imovelIdentificadoId),
            total: Math.max(0, estado.total - 1),
            detalhe: estado.detalhe?.identificado.id === imovelIdentificadoId ? null : estado.detalhe,
            selecionadoId: estado.selecionadoId === imovelIdentificadoId ? null : estado.selecionadoId,
            salvando: false,
          }));
        } else {
          // Ficou pendente: o registro segue existindo, bloqueado e retomável.
          registrarDetalhe(await detalheAtualizado(imovelIdentificadoId));
          set({ salvando: false });
        }
        return resultado;
      } catch {
        set({ salvando: false, erro: "Não foi possível concluir a exclusão. O registro continua retomável." });
        return null;
      }
    },
    cancelarExclusao(imovelIdentificadoId) {
      return executarMutacao("Não foi possível cancelar a exclusão.", async () => {
        await cancelarExclusaoIdentificado(imovelIdentificadoId);
        return detalheAtualizado(imovelIdentificadoId);
      });
    },
    async removerFoto(imovelIdentificadoId, fotoId) {
      set({ salvando: true, erro: null });
      try {
        const resultado = await removerFotoAvistamento(fotoId);
        registrarDetalhe(await detalheAtualizado(imovelIdentificadoId));
        set({
          salvando: false,
          erro: resultado.concluido ? null : "O arquivo da foto não foi removido; ela continua no registro.",
        });
        return resultado;
      } catch {
        set({ salvando: false, erro: "Não foi possível remover a foto." });
        return null;
      }
    },
  };
});
