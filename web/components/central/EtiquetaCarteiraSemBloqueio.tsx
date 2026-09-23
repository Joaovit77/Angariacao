import {
  rotuloCarteiraSemBloqueio,
  type CorrespondenciaSemBloqueio,
} from "@/lib/calculo/repeticaoCentralAngariacao";

/** Etiqueta do card para anúncio de imóvel que já esteve na carteira mas não
    o esconde (hoje, status "Perdido"). O motivo da perda fica na dica. */
export default function EtiquetaCarteiraSemBloqueio({
  correspondencias,
}: {
  correspondencias?: readonly CorrespondenciaSemBloqueio[];
}) {
  const rotulo = rotuloCarteiraSemBloqueio(correspondencias);
  if (!rotulo) return null;
  return (
    <span className="carteira-sem-bloqueio" title={rotulo.detalhe}>{rotulo.texto}</span>
  );
}
