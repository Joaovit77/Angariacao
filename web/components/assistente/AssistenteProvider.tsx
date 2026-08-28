"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  cancelarAcaoDoAssistente,
  confirmarAcaoDoAssistente,
  perguntarAoAssistente,
  prepararAcaoAssistente,
} from "@/lib/assistente/cliente";
import { compactarBlocosParaHistorico } from "@/lib/assistente/historico";
import type { AcaoAssistente, ContextoAssistente, ItemHistoricoAssistente, MensagemAssistente } from "@/lib/assistente/tipos";
import { rascunharResposta } from "@/lib/ia";
import { useAppStore } from "@/lib/store";
import { useUiModal } from "@/lib/uiModal";

const BOAS_VINDAS: MensagemAssistente = {
  id: "boas-vindas",
  papel: "assistente",
  texto: "Olá! Posso consultar sua operação e preparar compromissos, visitas, follow-ups, respostas baseadas nas conversas e a mudança para Sem resposta após 3 tentativas sem retorno. Toda alteração exige sua confirmação antes de ser executada.",
};

interface ParametrosVisitaGuiada {
  imovelId: string;
  imovelCodigo: string;
  data: string;
  hora: string;
}

interface EstadoAssistente {
  mensagens: MensagemAssistente[];
  texto: string;
  carregando: boolean;
  processandoAcaoId: string | null;
  setTexto: (texto: string) => void;
  enviar: (contexto: ContextoAssistente, mensagemDireta?: string) => Promise<void>;
  prepararVisita: (parametros: ParametrosVisitaGuiada) => Promise<void>;
  confirmarAcao: (mensagemId: string, acaoId: string) => Promise<void>;
  cancelarAcao: (mensagemId: string, acaoId: string) => Promise<void>;
  cancelarConsulta: () => void;
  limparConversa: () => void;
}

const ContextoEstadoAssistente = createContext<EstadoAssistente | null>(null);

function sincronizarAgendaDaAcao(acao: AcaoAssistente | undefined): void {
  if (!acao || acao.tipo === "alterar_status_sem_resposta_em_lote") return;
  if (acao.estado !== "succeeded" || !acao.resultado?.agendaId) return;
  const { agenda, setAgenda } = useAppStore.getState();
  if (agenda.some((item) => item.id === acao.resultado?.agendaId)) return;
  const item = acao.tipo === "agendar_visita"
    ? {
        id: acao.resultado.agendaId,
        title: `Visita ao imóvel ${acao.entidade.codigo}`,
        type: "Visita",
        date: acao.dados.data,
        hora: acao.dados.hora,
        imovelId: acao.entidade.imovelId,
        notes: "Agendada pelo Assistente após confirmação explícita do usuário.",
        done: false,
        isVerificacaoDisponibilidade: false,
      }
    : {
        id: acao.resultado.agendaId,
        title: acao.dados.titulo,
        type: acao.dados.tipo,
        date: acao.dados.data,
        hora: acao.dados.hora,
        imovelId: acao.entidade.imovelId,
        notes: acao.dados.observacao,
        done: false,
        isVerificacaoDisponibilidade: false,
      };
  setAgenda([...agenda, item]);
}

function acaoParaHistorico(
  acao: AcaoAssistente,
): NonNullable<ItemHistoricoAssistente["acao"]> {
  if (acao.tipo === "alterar_status_sem_resposta_em_lote") {
    return {
      id: acao.id,
      tipo: acao.tipo,
      estado: acao.estado,
      entidade: { imoveis: acao.entidade.imoveis.slice(0, 100) },
      dados: acao.dados,
    };
  }
  if (acao.tipo === "agendar_visita") {
    return {
      id: acao.id,
      tipo: acao.tipo,
      estado: acao.estado,
      entidade: acao.entidade,
      dados: acao.dados,
    };
  }
  return {
    id: acao.id,
    tipo: acao.tipo,
    estado: acao.estado,
    entidade: acao.entidade,
    dados: acao.dados,
  };
}

function incorporarRespostaNaConversa(
  atuais: MensagemAssistente[],
  resposta: MensagemAssistente,
): MensagemAssistente[] {
  const acaoResposta = resposta.acao;
  if (!acaoResposta) return [...atuais, resposta];
  if (acaoResposta.estado !== "ready_for_confirmation") {
    const atualizadas = atuais.map((mensagem) => mensagem.acao?.id === acaoResposta.id
      ? { ...mensagem, acao: acaoResposta }
      : mensagem);
    return [...atualizadas, { ...resposta, acao: undefined }];
  }
  const atualizadas = atuais.map((mensagem) => mensagem.acao?.estado === "ready_for_confirmation"
    ? { ...mensagem, acao: { ...mensagem.acao, estado: "cancelled" as const, erro: "Substituída por uma nova versão." } }
    : mensagem);
  return [...atualizadas, resposta];
}

export function AssistenteProvider({ children }: { children: ReactNode }) {
  const [texto, setTexto] = useState("");
  const [mensagens, setMensagens] = useState<MensagemAssistente[]>([BOAS_VINDAS]);
  const [carregando, setCarregando] = useState(false);
  const [processandoAcaoId, setProcessandoAcaoId] = useState<string | null>(null);
  const [sessaoId, setSessaoId] = useState(() => crypto.randomUUID());
  const requisicaoRef = useRef<AbortController | null>(null);
  const montadoRef = useRef(true);

  useEffect(() => {
    montadoRef.current = true;
    return () => {
      montadoRef.current = false;
      requisicaoRef.current?.abort();
    };
  }, []);

  const cancelarConsulta = useCallback(() => {
    requisicaoRef.current?.abort();
    requisicaoRef.current = null;
    setCarregando(false);
  }, []);

  const limparConversa = useCallback(() => {
    cancelarConsulta();
    setMensagens([BOAS_VINDAS]);
    setSessaoId(crypto.randomUUID());
  }, [cancelarConsulta]);

  const enviar = useCallback(async (contexto: ContextoAssistente, mensagemDireta?: string) => {
    const pergunta = (mensagemDireta ?? texto).trim();
    if (!pergunta || carregando) return;
    const usuario: MensagemAssistente = {
      id: crypto.randomUUID(),
      papel: "usuario",
      texto: pergunta,
    };
    const anteriores = mensagens;
    setMensagens((atuais) => [...atuais, usuario]);
    setTexto("");
    setCarregando(true);
    const controller = new AbortController();
    requisicaoRef.current = controller;
    try {
      const resposta = await perguntarAoAssistente({
        mensagem: pergunta,
        contexto,
        sessaoId,
        historico: anteriores
          .filter((mensagem) => mensagem.id !== "boas-vindas")
          .map(({ papel, texto: textoAnterior, blocos, acao }) => ({
            papel,
            texto: textoAnterior,
            ...(blocos?.length ? { resultados: compactarBlocosParaHistorico(blocos) } : {}),
            ...(acao ? { acao: acaoParaHistorico(acao) } : {}),
          })),
      }, { signal: controller.signal });
      if (resposta.ok === false && resposta.codigo === "cancelado") return;
      let mensagemResposta: MensagemAssistente;
      if (!resposta.ok) {
        mensagemResposta = { id: crypto.randomUUID(), papel: "assistente", texto: resposta.erro };
      } else if (resposta.mensagem.comandoUi?.tipo === "abrir_followup_lote") {
        useUiModal.getState().abrirModal("followUpLote");
        mensagemResposta = resposta.mensagem;
      } else if (resposta.mensagem.comandoUi?.tipo === "rascunhar_resposta") {
        const comando = resposta.mensagem.comandoUi;
        const resultado = await rascunharResposta(comando.imovelId);
        if (controller.signal.aborted) return;
        if (resultado.ok && resultado.rascunho) {
          useUiModal.getState().abrirWhatsappRascunho(
            comando.imovelId,
            resultado.rascunho,
            resultado.protocolosUsados,
          );
          mensagemResposta = {
            ...resposta.mensagem,
            texto: `Preparei um rascunho para ${comando.proprietario} (${comando.codigo}) com base na conversa. Ele está aberto para sua revisão; nada foi enviado.`,
          };
        } else {
          mensagemResposta = {
            ...resposta.mensagem,
            texto: resultado.mensagem || `Identifiquei a conversa de ${comando.proprietario} (${comando.codigo}), mas não consegui preparar um rascunho seguro. Nenhuma mensagem foi enviada.`,
            comandoUi: undefined,
          };
        }
      } else {
        mensagemResposta = resposta.mensagem;
      }
      sincronizarAgendaDaAcao(mensagemResposta.acao);
      setMensagens((atuais) => incorporarRespostaNaConversa(atuais, mensagemResposta));
    } finally {
      if (requisicaoRef.current === controller) requisicaoRef.current = null;
      if (montadoRef.current && !requisicaoRef.current) setCarregando(false);
    }
  }, [carregando, mensagens, sessaoId, texto]);

  const prepararVisita = useCallback(async (parametros: ParametrosVisitaGuiada) => {
    if (carregando || processandoAcaoId) return;
    const usuario: MensagemAssistente = {
      id: crypto.randomUUID(),
      papel: "usuario",
      texto: `Agendar visita em ${parametros.imovelCodigo} no dia ${parametros.data} às ${parametros.hora}.`,
    };
    setMensagens((atuais) => [...atuais, usuario]);
    setCarregando(true);
    try {
      const resposta = await prepararAcaoAssistente({
        tipo: "preparar_acao",
        acao: "agendar_visita",
        sessaoId,
        parametros: {
          imovelId: parametros.imovelId,
          data: parametros.data,
          hora: parametros.hora,
        },
      });
      const mensagemResposta: MensagemAssistente = resposta.ok
        ? resposta.mensagem
        : { id: crypto.randomUUID(), papel: "assistente", texto: resposta.erro };
      setMensagens((atuais) => incorporarRespostaNaConversa(atuais, mensagemResposta));
    } finally {
      if (montadoRef.current) setCarregando(false);
    }
  }, [carregando, processandoAcaoId, sessaoId]);

  const aplicarRespostaAcao = useCallback((mensagemId: string, resposta: Awaited<ReturnType<typeof confirmarAcaoDoAssistente>>) => {
    if (resposta.ok) {
      const acao = resposta.mensagem.acao;
      sincronizarAgendaDaAcao(acao);
      setMensagens((atuais) => atuais.map((mensagem) =>
        mensagem.id === mensagemId ? { ...resposta.mensagem, id: mensagemId } : mensagem));
      return;
    }
    setMensagens((atuais) => [
      ...atuais,
      { id: crypto.randomUUID(), papel: "assistente", texto: resposta.erro },
    ]);
  }, []);

  const confirmarAcao = useCallback(async (mensagemId: string, acaoId: string) => {
    if (processandoAcaoId) return;
    setProcessandoAcaoId(acaoId);
    try {
      aplicarRespostaAcao(mensagemId, await confirmarAcaoDoAssistente(acaoId, sessaoId));
    } finally {
      if (montadoRef.current) setProcessandoAcaoId(null);
    }
  }, [aplicarRespostaAcao, processandoAcaoId, sessaoId]);

  const cancelarAcao = useCallback(async (mensagemId: string, acaoId: string) => {
    if (processandoAcaoId) return;
    setProcessandoAcaoId(acaoId);
    try {
      aplicarRespostaAcao(mensagemId, await cancelarAcaoDoAssistente(acaoId, sessaoId));
    } finally {
      if (montadoRef.current) setProcessandoAcaoId(null);
    }
  }, [aplicarRespostaAcao, processandoAcaoId, sessaoId]);

  const valor = useMemo<EstadoAssistente>(() => ({
    mensagens,
    texto,
    carregando,
    processandoAcaoId,
    setTexto,
    enviar,
    prepararVisita,
    confirmarAcao,
    cancelarAcao,
    cancelarConsulta,
    limparConversa,
  }), [mensagens, texto, carregando, processandoAcaoId, enviar, prepararVisita, confirmarAcao, cancelarAcao, cancelarConsulta, limparConversa]);

  return (
    <ContextoEstadoAssistente.Provider value={valor}>
      {children}
    </ContextoEstadoAssistente.Provider>
  );
}

export function useEstadoAssistente(): EstadoAssistente {
  const estado = useContext(ContextoEstadoAssistente);
  if (!estado) throw new Error("useEstadoAssistente deve ser usado dentro de AssistenteProvider.");
  return estado;
}
