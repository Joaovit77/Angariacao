export interface PosicaoAssistente { x: number; y: number }

export function limitarPosicaoAssistente(
  x: number,
  y: number,
  largura: number,
  altura: number,
  viewportLargura: number,
  viewportAltura: number,
  margem = 8,
): PosicaoAssistente {
  return {
    x: Math.max(margem, Math.min(x, Math.max(margem, viewportLargura - largura - margem))),
    y: Math.max(margem, Math.min(y, Math.max(margem, viewportAltura - altura - margem))),
  };
}
