import type { ReactNode } from "react";

type NomeIcone =
  | "agenda"
  | "anexo"
  | "atualizar"
  | "buscar"
  | "enviar"
  | "externo"
  | "imovel"
  | "menu"
  | "pessoa"
  | "telefone"
  | "voltar"
  | "whatsapp";

const CAMINHOS: Record<NomeIcone, ReactNode> = {
  agenda: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M16 3v4M8 3v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01" />
    </>
  ),
  anexo: <path d="m21.4 11.6-8.9 8.9a6 6 0 0 1-8.5-8.5l9.2-9.2a4 4 0 1 1 5.7 5.7l-9.2 9.2a2 2 0 0 1-2.9-2.8l8.6-8.6" />,
  atualizar: (
    <>
      <path d="M21 12a9 9 0 0 0-15.2-6.5L3 8" />
      <path d="M3 3v5h5" />
      <path d="M3 12a9 9 0 0 0 15.2 6.5L21 16" />
      <path d="M16 16h5v5" />
    </>
  ),
  buscar: (
    <>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-4-4" />
    </>
  ),
  enviar: (
    <>
      <path d="m22 2-7 20-4-9-9-4Z" />
      <path d="M22 2 11 13" />
    </>
  ),
  externo: (
    <>
      <path d="M15 3h6v6M10 14 21 3" />
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
    </>
  ),
  imovel: <path d="M4 21V3h12v18M16 9h4v12M8 7h.01M12 7h.01M8 11h.01M12 11h.01M8 15h.01M12 15h.01M2 21h20" />,
  menu: (
    <>
      <circle cx="12" cy="5" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none" />
      <circle cx="12" cy="19" r="1.5" fill="currentColor" stroke="none" />
    </>
  ),
  pessoa: (
    <>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21a8 8 0 0 1 16 0" />
    </>
  ),
  telefone: <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3.1-8.7A2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1 1 .4 1.9.7 2.8a2 2 0 0 1-.4 2.1L8.1 9.9a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.8.7a2 2 0 0 1 1.7 2Z" />,
  voltar: <path d="m15 18-6-6 6-6" />,
  whatsapp: (
    <path
      fill="currentColor"
      fillRule="evenodd"
      stroke="none"
      d="M12 2a10 10 0 0 0-8.58 15.15L2 22l4.99-1.31A10 10 0 1 0 12 2Zm0 18.17a8.15 8.15 0 0 1-4.16-1.14l-.3-.18-2.96.78.79-2.88-.2-.31A8.17 8.17 0 1 1 12 20.17Zm4.48-6.12c-.25-.13-1.47-.73-1.7-.81-.23-.09-.4-.13-.57.12-.17.25-.65.81-.8.98-.14.17-.29.19-.54.06-.25-.12-1.04-.38-1.99-1.23a7.45 7.45 0 0 1-1.38-1.72c-.14-.25-.01-.38.11-.5.11-.11.25-.29.37-.44.13-.14.17-.25.25-.42.08-.16.04-.31-.02-.44-.06-.12-.56-1.35-.77-1.85-.2-.49-.41-.42-.56-.43h-.48c-.17 0-.44.06-.67.31-.23.25-.88.86-.88 2.1s.9 2.44 1.03 2.6c.12.17 1.77 2.7 4.29 3.79.6.26 1.07.41 1.44.53.6.19 1.15.16 1.58.1.48-.07 1.47-.6 1.68-1.18.21-.58.21-1.08.15-1.18-.06-.1-.23-.17-.48-.29Z"
    />
  ),
};

export default function Icone({ nome, tamanho = 20 }: { nome: NomeIcone; tamanho?: number }) {
  return (
    <svg
      aria-hidden="true"
      width={tamanho}
      height={tamanho}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {CAMINHOS[nome]}
    </svg>
  );
}
