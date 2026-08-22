import Image from "next/image";

interface Props {
  className?: string;
  alt?: string;
}

/**
 * Símbolo principal do produto. As duas artes ficam no HTML para o CSS
 * decidir o tema já no primeiro quadro, inclusive antes da hidratação.
 */
export default function MarcaApp({ className = "", alt = "" }: Props) {
  const classes = `marca-app${className ? ` ${className}` : ""}`;

  return (
    <span
      className={classes}
      role={alt ? "img" : undefined}
      aria-label={alt || undefined}
      aria-hidden={alt ? undefined : true}
    >
      <Image
        className="marca-app-imagem marca-app-imagem-escuro"
        src="/logo-angariacao-escuro.png"
        alt=""
        width={1254}
        height={1254}
      />
      <Image
        className="marca-app-imagem marca-app-imagem-claro"
        src="/logo-angariacao-claro.png"
        alt=""
        width={1254}
        height={1254}
      />
    </span>
  );
}
