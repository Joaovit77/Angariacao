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
import type { ContextoAssistente, MensagemAssistente } from "@/lib/assistente/tipos";
import { useAppStore } from "@/lib/store";

const BOAS_VINDAS: MensagemAssistente = {
  id: "boas-vindas",
  papel: "assistente",
  texto: "Olá! Posso consultar sua operação e preparar visitas. Toda alteração exige sua confirmação antes de ser executada.",
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
            ...(acao ? {
              acao: {
                id: acao.id,
                tipo: acao.tipo,
                estado: acao.estado,
                entidade: acao.entidade,
                dados: acao.dados,
              },
            } : {}),
          })),
      }, { signal: controller.signal });
      if (resposta.ok === false && resposta.codigo === "cancelado") return;
      setMensagens((atuais) => [
        ...atuais,
        resposta.ok
          ? resposta.mensagem
          : { id: crypto.randomUUID(), papel: "assistente", texto: resposta.erro },
      ]);
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
      setMensagens((atuais) => [
        ...atuais,
        resposta.ok
          ? resposta.mensagem
          : { id: crypto.randomUUID(), papel: "assistente", texto: resposta.erro },
      ]);
    } finally {
      if (montadoRef.current) setCarregando(false);
    }
  }, [carregando, processandoAcaoId, sessaoId]);

  const aplicarRespostaAcao = useCallback((mensagemId: string, resposta: Awaited<ReturnType<typeof confirmarAcaoDoAssistente>>) => {
    if (resposta.ok) {
      const acao = resposta.mensagem.acao;
      if (acao?.estado === "succeeded" && acao.resultado?.agendaId) {
        const { agenda, setAgenda } = useAppStore.getState();
        if (!agenda.some((item) => item.id === acao.resultado!.agendaId)) {
          setAgenda([...agenda, {
            id: acao.resultado.agendaId,
            title: `Visita ao imóvel ${acao.entidade.codigo}`,
            type: "Visita",
            date: acao.dados.data,
            hora: acao.dados.hora,
            imovelId: acao.entidade.imovelId,
            notes: "Agendada pelo Assistente após confirmação explícita do usuário.",
            done: false,
            isVerificacaoDisponibilidade: false,
          }]);
        }
      }
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
      aplicarRespostaAcao(mensagemId, await confirmarAcaoDoAssistente(acaoId));
    } finally {
      if (montadoRef.current) setProcessandoAcaoId(null);
    }
  }, [aplicarRespostaAcao, processandoAcaoId]);

  const cancelarAcao = useCallback(async (mensagemId: string, acaoId: string) => {
    if (processandoAcaoId) return;
    setProcessandoAcaoId(acaoId);
    try {
      aplicarRespostaAcao(mensagemId, await cancelarAcaoDoAssistente(acaoId));
    } finally {
      if (montadoRef.current) setProcessandoAcaoId(null);
    }
  }, [aplicarRespostaAcao, processandoAcaoId]);

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
