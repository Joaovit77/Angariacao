import type { Metadata } from "next";
import Script from "next/script";
import AplicadorTema from "@/components/AplicadorTema";
import SessaoProvider from "@/components/SessaoProvider";
import Toasts from "@/components/Toasts";
import { URL_SITE } from "@/lib/site";
import { SCRIPT_TEMA } from "@/lib/tema";
// O app antigo carregava o CSS do Leaflet por <link> no index.html; aqui ele
// entra pelo bundle, na mesma ordem (antes do style.css do projeto).
import "leaflet/dist/leaflet.css";
// CSS estrutural do markercluster (posicionamento/animação dos clusters). NÃO
// importamos o MarkerCluster.Default.css: o tema claro dele destoaria do app —
// os clusters ganham ícone próprio na paleta via iconCreateFunction (MapaLeaflet).
import "leaflet.markercluster/dist/MarkerCluster.css";
import "./style.css";
import "./apresentacao.css";

// O style.css é uma cópia fiel do app estático original — a migração
// (MIGRATION_NEXT.md) importa os estilos como estão, sem redesign.
// A fonte display ('Zilla Slab') cai nos fallbacks do próprio CSS,
// exatamente como no app original, que não carrega webfonts.

export const metadata: Metadata = {
  metadataBase: new URL(URL_SITE),
  title: "Painel de Angariações — Controle de Locação",
  icons: {
    icon: "/logo-angariacao-claro.png",
    apple: "/logo-angariacao-claro.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    // suppressHydrationWarning: o SCRIPT_TEMA escreve `data-tema` no <html>
    // antes da hidratação, então o servidor (que não sabe a preferência do
    // aparelho) sempre entrega a tag sem o atributo. É a única diferença
    // esperada — sem isto o React avisaria de uma "divergência" que É o
    // recurso funcionando.
    <html lang="pt-BR" suppressHydrationWarning>
      <body>
        {/* Antes de qualquer módulo do Next: pinta a tela já no tema certo,
            em vez de piscar o escuro e corrigir depois. */}
        <Script id="tema-inicial" strategy="beforeInteractive">
          {SCRIPT_TEMA}
        </Script>
        <AplicadorTema />
        <SessaoProvider>{children}</SessaoProvider>
        <Toasts />
      </body>
    </html>
  );
}
