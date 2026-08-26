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
import { perguntarAoAssistente } from "@/lib/assistente/cliente";
import { compactarBlocosParaHistorico } from "@/lib/assistente/historico";
import type { ContextoAssistente, MensagemAssistente } from "@/lib/assistente/tipos";

const BOAS_VINDAS: MensagemAssistente = {
  id: "boas-vindas",
  papel: "assistente",
  texto: "Olá! Posso consultar sua carteira, agenda, follow-ups e indicadores. Estou em modo somente leitura.",
};

interface EstadoAssistente {
  mensagens: MensagemAssistente[];
  texto: string;
  carregando: boolean;
  setTexto: (texto: string) => void;
  enviar: (contexto: ContextoAssistente) => Promise<void>;
  cancelarConsulta: () => void;
  limparConversa: () => void;
}

const ContextoEstadoAssistente = createContext<EstadoAssistente | null>(null);

export function AssistenteProvider({ children }: { children: ReactNode }) {
  const [texto, setTexto] = useState("");
  const [mensagens, setMensagens] = useState<MensagemAssistente[]>([BOAS_VINDAS]);
  const [carregando, setCarregando] = useState(false);
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
  }, [cancelarConsulta]);

  const enviar = useCallback(async (contexto: ContextoAssistente) => {
    const pergunta = texto.trim();
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
        historico: anteriores
          .filter((mensagem) => mensagem.id !== "boas-vindas")
          .map(({ papel, texto: textoAnterior, blocos }) => ({
            papel,
            texto: textoAnterior,
            ...(blocos?.length ? { resultados: compactarBlocosParaHistorico(blocos) } : {}),
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
  }, [carregando, mensagens, texto]);

  const valor = useMemo<EstadoAssistente>(() => ({
    mensagens,
    texto,
    carregando,
    setTexto,
    enviar,
    cancelarConsulta,
    limparConversa,
  }), [mensagens, texto, carregando, enviar, cancelarConsulta, limparConversa]);

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
