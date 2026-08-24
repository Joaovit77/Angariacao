import type { Metadata } from "next";
import PaginaInicial from "@/components/auth/PaginaInicial";
import { DESCRICAO_SITE, NOME_SITE } from "@/lib/site";

const TITULO = "Angariação — CRM de captação imobiliária";

export const metadata: Metadata = {
  title: TITULO,
  description: DESCRICAO_SITE,
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "pt_BR",
    url: "/",
    siteName: NOME_SITE,
    title: TITULO,
    description: DESCRICAO_SITE,
  },
  twitter: {
    card: "summary_large_image",
    title: TITULO,
    description: DESCRICAO_SITE,
  },
  robots: { index: true, follow: true },
};

export default function Raiz() {
  return <PaginaInicial />;
}
