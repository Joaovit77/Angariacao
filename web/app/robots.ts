import type { MetadataRoute } from "next";
import { URL_SITE } from "@/lib/site";

const ROTAS_PRIVADAS = [
  "/admin",
  "/agenda",
  "/api/",
  "/avaliacao",
  "/central-angariacao",
  "/dashboard",
  "/home",
  "/insights",
  "/mapa",
  "/mensagens",
  "/metas",
  "/pipeline",
  "/protocolos",
  "/relatorios",
  "/respostas",
  "/roadmap",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ROTAS_PRIVADAS,
    },
    sitemap: `${URL_SITE}/sitemap.xml`,
    host: URL_SITE,
  };
}
