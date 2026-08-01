"use client";

/* ================================================================
   MODAL: CONEXÃO DO WHATSAPP

   A tela que tira o corretor da fila do suporte. Quando o número cai —
   e ele cai —, até agora o caminho era: descobrir pelo toast de falha
   no meio de um lote, e pedir a alguém com acesso ao painel da
   Evolution que lesse o QR Code por ele. Aqui ele lê o próprio QR, do
   próprio número, sem passar por um painel de infraestrutura onde
   estão as instâncias de todos os outros.

   DUAS DECISÕES DE COMPORTAMENTO:

   1. **A consulta é em laço, e o intervalo depende do estado**
      (`intervaloConsultaMs`). Desconectado, a resposta muda a qualquer
      segundo, porque ele está com o celular na mão escaneando — é ali
      que a consulta é rápida. Conectado, a tela só confirma algo que
      já vale, e cada consulta ocupa a mesma instância que precisa
      estar livre para mandar mensagem.

   2. **Conectar fecha o laço, não a janela.** O corretor acabou de
      escanear e precisa ver "conectado" para saber que deu certo;
      fechar sozinho deixaria a dúvida de sempre ("será que pegou?").
   ================================================================ */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  deveMostrarQr,
  intervaloConsultaMs,
  mensagemConexao,
  type Conexao,
} from "@/lib/calculo/conexaoWhatsapp";
import { consultarConexao } from "@/lib/conexaoWhatsapp";
import { useUiModal } from "@/lib/uiModal";

const COR: Record<string, string> = {
  conectado: "var(--good)",
  conectando: "var(--warn)",
  desconectado: "var(--bad)",
  "sem-instancia": "var(--warn)",
  "nao-configurado": "var(--text-faint)",
  falha: "var(--bad)",
};

const ROTULO: Record<string, string> = {
  conectado: "Conectado",
  conectando: "Conectando…",
  desconectado: "Desconectado",
  "sem-instancia": "Não configurado",
  "nao-configurado": "Indisponível",
  falha: "Sem resposta",
};

export default function ModalConexaoWhatsapp() {
  const fecharModal = useUiModal((s) => s.fecharModal);
  const [conexao, setConexao] = useState<Conexao | null>(null);
  const [consultando, setConsultando] = useState(true);
  // Guarda o timer entre renders. Escrito só dentro de efeito/callback —
  // escrever em ref durante o render é a outra regra do React Compiler
  // que já mordeu neste projeto.
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const aplicar = useCallback((c: Conexao) => {
    setConexao(c);
    setConsultando(false);
  }, []);

  useEffect(() => {
    let cancelado = false;

    /* Laço por setTimeout encadeado, e não setInterval: com intervalo
       o pedido lento se empilha, e ao trocar de estado (desconectado →
       conectado) o ritmo teria que ser reagendado à mão. Aqui cada
       resposta decide sozinha quando vem a próxima. */
    const rodar = () => {
      consultarConexao().then((c) => {
        if (cancelado) return;
        aplicar(c);
        const espera = intervaloConsultaMs(c.estado);
        if (espera > 0) timer.current = setTimeout(rodar, espera);
      });
    };
    rodar();

    return () => {
      cancelado = true;
      if (timer.current) clearTimeout(timer.current);
    };
  }, [aplicar]);

  const estado = conexao?.estado ?? "falha";
  const mostrarQr = deveMostrarQr(estado, conexao?.qr);

  return (
    <>
      <div className="modal-head">
        <div className="modal-title">Conexão do WhatsApp</div>
        <button type="button" className="icon-btn" onClick={fecharModal} aria-label="Fechar">
          ✕
        </button>
      </div>

      <div className="modal-body">
        {conexao === null && consultando ? (
          <div className="field-hint">Consultando…</div>
        ) : (
          <>
            <div className="conexao-estado">
              <span className="conexao-bolinha" style={{ background: COR[estado] }} aria-hidden="true" />
              <strong style={{ color: COR[estado] }}>{ROTULO[estado]}</strong>
              {conexao?.numero && estado === "conectado" && (
                <span className="conexao-numero">{conexao.numero}</span>
              )}
            </div>

            <p className="field-hint" style={{ marginBottom: mostrarQr ? 16 : 0 }}>
              {mensagemConexao(estado)}
            </p>

            {mostrarQr && (
              <>
                {/* Fundo branco fixo, e não por token: o leitor do
                    WhatsApp precisa de contraste alto entre os módulos
                    escuros e o fundo claro. Um QR sobre fundo escuro no
                    tema escuro simplesmente não é lido. É a mesma
                    exceção do que fica por cima do mapa. */}
                <div className="conexao-qr">
                  {/* eslint-disable-next-line @next/next/no-img-element -- data URI da
                      Evolution: não é um asset do projeto, e o next/image
                      não otimiza nem serve data URI. */}
                  <img src={conexao?.qr as string} alt="QR Code para conectar o WhatsApp" />
                </div>
                <ol className="conexao-passos">
                  <li>Abra o WhatsApp no celular que atende os proprietários.</li>
                  <li>
                    Toque em <strong>Configurações → Aparelhos conectados</strong>.
                  </li>
                  <li>
                    Toque em <strong>Conectar aparelho</strong> e aponte a câmera para o código.
                  </li>
                </ol>
                <p className="field-hint">
                  O código expira em poucos segundos e é trocado sozinho — não precisa recarregar a
                  página.
                </p>
              </>
            )}
          </>
        )}
      </div>

      <div className="modal-foot">
        <div></div>
        <button type="button" className="btn" onClick={fecharModal}>
          Fechar
        </button>
      </div>
    </>
  );
}
