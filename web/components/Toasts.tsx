"use client";

/* ================================================================
   <Toasts /> — o #toast-container do index.html original.
   Cada toast some depois de TOAST_DURACAO_MS (o cartão, depois de
   TOAST_DURACAO_CARTAO_MS), com o mesmo fade de TOAST_FADE_MS antes
   de sair do DOM (port do toast() do app.js).
   ================================================================ */
import { useCallback, useEffect, useState } from "react";
import {
  inscreverToast,
  TOAST_DURACAO_MS,
  TOAST_FADE_MS,
  type ToastItem,
} from "@/lib/toast";

function Toast({ item, aoRemover }: { item: ToastItem; aoRemover: (id: number) => void }) {
  const [saindo, setSaindo] = useState(false);

  useEffect(() => {
    let fade: ReturnType<typeof setTimeout>;
    const espera = setTimeout(() => {
      setSaindo(true);
      fade = setTimeout(() => aoRemover(item.id), TOAST_FADE_MS);
    }, item.duracaoMs ?? TOAST_DURACAO_MS);
    return () => {
      clearTimeout(espera);
      clearTimeout(fade);
    };
  }, [item.id, item.duracaoMs, aoRemover]);

  const estilo = saindo ? { opacity: 0, transition: "opacity .25s" } : undefined;
  const cartao = item.cartao;

  if (!cartao) {
    return (
      <div className={`toast ${item.type}`} style={estilo}>
        {item.msg}
      </div>
    );
  }

  // O conteúdo é um <button> DENTRO do cartão, e o × é irmão dele — não um
  // botão dentro do outro, que é HTML inválido e some do teclado. O corpo
  // clicável leva à caixa de respostas, mesmo destino do clique na
  // notificação do sistema: um cartão com cara de clicável que não fizesse
  // nada seria pior que a faixa de texto que ele veio substituir.
  const Corpo = cartao.aoClicar ? "button" : "div";
  return (
    <div className={`toast toast-cartao ${item.type}`} style={estilo}>
      <Corpo
        className="toast-cartao-corpo"
        {...(cartao.aoClicar
          ? { type: "button" as const, onClick: cartao.aoClicar, "aria-label": item.msg }
          : {})}
      >
        <span className="toast-cartao-ic" aria-hidden="true">
          💬
        </span>
        <span className="toast-cartao-texto">
          <span className="toast-cartao-topo">
            <strong className="toast-cartao-titulo">{cartao.titulo}</strong>
            {cartao.selo && <span className="toast-cartao-selo">{cartao.selo}</span>}
          </span>
          {cartao.detalhe && <span className="toast-cartao-detalhe">{cartao.detalhe}</span>}
          {cartao.mensagem && <span className="toast-cartao-msg">{cartao.mensagem}</span>}
        </span>
      </Corpo>
      {/* Fechar sem navegar: com o corpo inteiro clicável, tirar o aviso da
          frente não pode custar uma troca de tela. */}
      <button
        type="button"
        className="toast-cartao-fechar"
        aria-label="Dispensar aviso"
        onClick={() => aoRemover(item.id)}
      >
        ×
      </button>
    </div>
  );
}

export default function Toasts() {
  const [itens, setItens] = useState<ToastItem[]>([]);

  useEffect(() => inscreverToast((item) => setItens((atuais) => [...atuais, item])), []);

  const remover = useCallback((id: number) => {
    setItens((atuais) => atuais.filter((t) => t.id !== id));
  }, []);

  return (
    <div className="toast-container" id="toast-container">
      {itens.map((item) => (
        <Toast key={item.id} item={item} aoRemover={remover} />
      ))}
    </div>
  );
}
