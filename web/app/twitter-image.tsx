import { criarImagemSocial } from "./imagem-social";

export const alt = "Angariação — sua carteira imobiliária em movimento";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function ImagemTwitter() {
  return criarImagemSocial();
}
