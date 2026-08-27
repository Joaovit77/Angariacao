"use client";

import { useEffect, useState } from "react";
import {
  mensagemConexao,
  type Conexao,
} from "@/lib/calculo/conexaoWhatsapp";
import { consultarConexao } from "@/lib/conexaoWhatsapp";
import { useUiModal } from "@/lib/uiModal";

const ROTULO: Record<string, string> = {
  conectado: "Conectado",
  conectando: "Conectando…",
  desconectado: "Desconectado",
  "sem-instancia": "Não configurado",
  "nao-configurado": "Indisponível",
  falha: "Sem resposta",
};

export default function ResumoConexaoWhatsapp() {
  const abrirModal = useUiModal((estado) => estado.abrirModal);
  const modalAtivo = useUiModal((estado) => estado.modal?.tipo ?? null);
  const [conexao, setConexao] = useState<Conexao | null>(null);

  useEffect(() => {
    // O modal faz a própria consulta em laço. Ao fechá-lo, este resumo consulta
    // novamente para refletir uma conexão que acabou de ser concluída.
    if (modalAtivo === "conexaoWhatsapp") return;
    let ativo = true;
    consultarConexao().then((resultado) => {
      if (ativo) setConexao(resultado);
    });
    return () => {
      ativo = false;
    };
  }, [modalAtivo]);

  const estado = conexao?.estado ?? "consultando";
  const conectado = estado === "conectado";
  const podeReconectar = estado === "desconectado" || estado === "conectando";

  return (
    <div className="config-integracao-status">
      <div className="config-integracao-identidade">
        <span className="config-integracao-marca whatsapp" aria-hidden="true">
          <svg viewBox="0 0 24 24" fill="currentColor">
            <path d="M12 2a10 10 0 0 0-8.58 15.15L2 22l4.99-1.31A10 10 0 1 0 12 2Zm0 18.17a8.15 8.15 0 0 1-4.16-1.14l-.3-.18-2.96.78.79-2.88-.2-.31A8.17 8.17 0 1 1 12 20.17Zm4.48-6.12c-.25-.13-1.47-.73-1.7-.81-.23-.09-.4-.13-.57.12-.17.25-.65.81-.8.98-.14.17-.29.19-.54.06-.25-.12-1.04-.38-1.99-1.23a7.45 7.45 0 0 1-1.38-1.72c-.14-.25-.01-.38.11-.5.11-.11.25-.29.37-.44.13-.14.17-.25.25-.42.08-.16.04-.31-.02-.44-.06-.12-.56-1.35-.77-1.85-.2-.49-.41-.42-.56-.43h-.48c-.17 0-.44.06-.67.31-.23.25-.88.86-.88 2.1s.9 2.44 1.03 2.6c.12.17 1.77 2.7 4.29 3.79.6.26 1.07.41 1.44.53.6.19 1.15.16 1.58.1.48-.07 1.47-.6 1.68-1.18.21-.58.21-1.08.15-1.18-.06-.1-.23-.17-.48-.29Z" />
          </svg>
        </span>
        <div>
          <h3>WhatsApp</h3>
          <span
            className={`config-status ${conectado ? "conectado" : estado}`}
            role="status"
          >
            <i aria-hidden="true" />
            {estado === "consultando" ? "Consultando…" : ROTULO[estado] || "Indisponível"}
          </span>
        </div>
      </div>

      {conexao?.numero && conectado && (
        <div className="config-integracao-dado">
          <span>Número conectado</span>
          <strong>{conexao.numero}</strong>
        </div>
      )}

      <p>
        {conexao
          ? mensagemConexao(conexao.estado)
          : "Consultando o estado da conexão com o WhatsApp."}
      </p>

      <button
        type="button"
        className={`btn btn-sm${podeReconectar ? " btn-primary" : ""}`}
        onClick={() => abrirModal("conexaoWhatsapp")}
      >
        {conectado ? "Gerenciar conexão" : podeReconectar ? "Reconectar WhatsApp" : "Ver detalhes"}
      </button>
    </div>
  );
}
