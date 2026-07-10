import type { Metadata } from "next";
import SessaoProvider from "@/components/SessaoProvider";
import Toasts from "@/components/Toasts";
// O app antigo carregava o CSS do Leaflet por <link> no index.html; aqui ele
// entra pelo bundle, na mesma ordem (antes do style.css do projeto).
import "leaflet/dist/leaflet.css";
import "./style.css";

// O style.css é uma cópia fiel do app estático original — a migração
// (MIGRATION_NEXT.md) importa os estilos como estão, sem redesign.
// A fonte display ('Zilla Slab') cai nos fallbacks do próprio CSS,
// exatamente como no app original, que não carrega webfonts.

export const metadata: Metadata = {
  title: "Painel de Angariações — Controle de Locação",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body>
        <SessaoProvider>{children}</SessaoProvider>
        <Toasts />
      </body>
    </html>
  );
}
