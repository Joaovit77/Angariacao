export interface SlideApresentacao {
  titulo: string;
  descricao: string;
  imagem: string;
  video?: string;
  alt: string;
  enquadramento: "abertura" | "mercado" | "operacao" | "inteligencia";
  cta?: string;
  fluxo?: readonly string[];
}

export const SLIDES_APRESENTACAO: readonly SlideApresentacao[] = [
  {
    titulo: "ANGARIO",
    descricao:
      "Inteligência e organização para transformar oportunidades em imóveis angariados.",
    imagem: "/apresentacao/londrina-lago-igapo-poster.jpg",
    video: "/apresentacao/londrina-lago-igapo.mp4",
    alt: "Vista aérea de Londrina e do Lago Igapó durante o dia.",
    enquadramento: "abertura",
    cta: "Solicitar demonstração",
  },
  {
    titulo: "Conheça o mercado. Antecipe oportunidades.",
    descricao:
      "Centralize imóveis, proprietários, negociações e informações estratégicas em um único lugar.",
    imagem: "/apresentacao/londrina-entardecer.jpg",
    alt: "Vista panorâmica de Londrina ao entardecer, sob nuvens alaranjadas.",
    enquadramento: "mercado",
  },
  {
    titulo: "Da prospecção à publicação.",
    descricao:
      "Acompanhe cada etapa da angariação com histórico, agenda, follow-ups e prioridades bem definidas.",
    imagem: "/apresentacao/pexels-gaion-17204341.jpg",
    alt: "Vista aérea do centro de Londrina, com a Catedral Metropolitana entre os edifícios.",
    enquadramento: "mercado",
    fluxo: ["Prospecção", "Contato", "Negociação", "Angariado", "Publicado"],
  },
  {
    titulo: "Sua operação imobiliária, mais inteligente.",
    descricao:
      "Dados, automações e inteligência artificial trabalhando juntos para você focar nas melhores oportunidades.",
    imagem: "/apresentacao/pexels-gaion-30893717.jpg",
    alt: "Panorama do centro de Londrina sob grandes nuvens, com uma avenida em primeiro plano.",
    enquadramento: "inteligencia",
    cta: "Solicitar demonstração",
  },
];
