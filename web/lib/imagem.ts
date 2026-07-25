/* ================================================================
   IMAGEM (lado do browser)
   Prepara a foto tirada no celular para a leitura por IA. Fora de
   calculo/ porque depende do DOM (Image + canvas) — é o mesmo caso
   do geo.ts, que depende de fetch.

   Existe por um motivo prático: foto de celular atual sai com 3 a 8 MB,
   e a extração recusa acima de MAX_IMAGEM_BYTES. Sem redução, o
   caminho principal da feature — apontar a câmera para a placa —
   falharia quase sempre, e o corretor não tem como "mandar uma foto
   menor". Reduzir também corta o custo por chamada: o que se paga é
   proporcional ao tamanho da imagem, e placa e print de anúncio são
   texto grande, legível de sobra em 1600px.
   ================================================================ */

/** Maior lado da imagem enviada, em pixels. Placa e print de anúncio são
    texto grande; abaixo disso o dígito do telefone começa a se perder. */
const LADO_MAXIMO = 1600;

/** Qualidade do JPEG. Acima disso o arquivo cresce sem o texto ficar
    mais legível. */
const QUALIDADE = 0.85;

/** Lê o arquivo como data URI, sem reprocessar. */
function lerComoDataUrl(arquivo: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const leitor = new FileReader();
    leitor.onload = () => resolve(String(leitor.result || ""));
    leitor.onerror = () => reject(new Error("Não foi possível ler o arquivo."));
    leitor.readAsDataURL(arquivo);
  });
}

/**
 * Converte a foto escolhida numa data URI JPEG reduzida a `LADO_MAXIMO`.
 *
 * Imagem menor que o limite passa direto, sem reencodar: reencodar um print
 * já pequeno só perderia nitidez no texto — que é justamente o que a IA
 * precisa ler.
 *
 * Rejeita quando o arquivo não é imagem decodificável.
 */
export async function prepararImagemParaIa(arquivo: File): Promise<string> {
  const original = await lerComoDataUrl(arquivo);

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error("Arquivo não é uma imagem válida."));
    el.src = original;
  });

  const maiorLado = Math.max(img.width, img.height);
  if (maiorLado <= LADO_MAXIMO) return original;

  const escala = LADO_MAXIMO / maiorLado;
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.width * escala);
  canvas.height = Math.round(img.height * escala);

  const ctx = canvas.getContext("2d");
  // Sem contexto 2d não há redução possível; devolver o original é melhor que
  // falhar — se ele couber no teto, a leitura acontece do mesmo jeito.
  if (!ctx) return original;

  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL("image/jpeg", QUALIDADE);
}
