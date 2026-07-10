"use client";

/* ================================================================
   <Toasts /> — o #toast-container do index.html original.
   Cada toast some depois de TOAST_DURACAO_MS, com o mesmo fade de
   TOAST_FADE_MS antes de sair do DOM (port do toast() do app.js).
   ================================================================ */
import { useCallback, useEffect, useState } from "react";
import { inscreverToast, TOAST_DURACAO_MS, TOAST_FADE_MS, type ToastItem } from "@/lib/toast";

function Toast({ item, aoRemover }: { item: ToastItem; aoRemover: (id: number) => void }) {
  const [saindo, setSaindo] = useState(false);

  useEffect(() => {
    let fade: ReturnType<typeof setTimeout>;
    const espera = setTimeout(() => {
      setSaindo(true);
      fade = setTimeout(() => aoRemover(item.id), TOAST_FADE_MS);
    }, TOAST_DURACAO_MS);
    return () => {
      clearTimeout(espera);
      clearTimeout(fade);
    };
  }, [item.id, aoRemover]);

  return (
    <div
      className={`toast ${item.type}`}
      style={saindo ? { opacity: 0, transition: "opacity .25s" } : undefined}
    >
      {item.msg}
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
