import { timestampDeIso } from "@/lib/datas";
import { regiaoDeBairroLondrina } from "@/lib/calculo/regioesLondrina";
import { chaveNormalizada } from "@/lib/normalizacao";
import { anuncioPertenceAoMercado, idExternoEhFallback, type AnuncioCentralAngariacao, type FiltrosCentralAngariacao } from "@/lib/calculo/centralAngariacao";
import { tipoRecorteObservadoRadar } from "@/lib/calculo/aquisicaoRadar";
import { identidadeVendaRadar } from "@/lib/calculo/identidadeVendaRadar";

function textoObjetivo(valor: string | null | undefined): string | undefined {
  if (!valor || /@|\d{5,}|(?:telefone|whatsapp|contato)/i.test(valor)) return undefined;
  return valor.trim().slice(0, 100) || undefined;
}

/** A URL comprova ID individual; a finalidade e o tipo não nascem do filtro. */
export function qualificarOfertaRadar(anuncio: AnuncioCentralAngariacao, filtros: FiltrosCentralAngariacao): AnuncioCentralAngariacao | null {
  const identidade = identidadeVendaRadar(anuncio.portal, anuncio.url);
  const tipo = tipoRecorteObservadoRadar(anuncio);
  const finalidade = filtros.finalidade;
  const acao = anuncio.finalidadeObservada === finalidade
    || (finalidade === "locacao" ? /(?:para-alugar|aluguel|locacao)/i : /(?:a-venda|para-venda|venda)/i).test(identidade?.url || "");
  if (!identidade || identidade.id !== anuncio.idExterno || !/^\d{6,}$/.test(identidade.id)
    || idExternoEhFallback(anuncio.portal, anuncio.idExterno) || anuncio.portal !== filtros.portal
    || anuncio.finalidade !== finalidade || !acao || !tipo || tipo !== filtros.tipoRecorte
    || !anuncioPertenceAoMercado(anuncio, filtros.cidade, filtros.estado)
    || !anuncio.estado || anuncio.estado.toUpperCase() !== filtros.estado.toUpperCase()
    || typeof anuncio.preco !== "number" || !Number.isFinite(anuncio.preco) || anuncio.preco <= 0) return null;
  const dados: AnuncioCentralAngariacao & { regiao?: string } = {
    idExterno: identidade.id, portal: anuncio.portal, finalidade, url: identidade.url,
    titulo: `${tipo === "casa" ? "Casa" : "Apartamento"} em ${filtros.cidade}`,
    cidade: filtros.cidade, estado: filtros.estado.toUpperCase(),
    tipo: chaveNormalizada(anuncio.tipoDeclarado) === "sobrado" ? anuncio.tipo ?? anuncio.tipoDeclarado : tipo,
    tipoDeclarado: chaveNormalizada(anuncio.tipoDeclarado) === "sobrado" ? anuncio.tipoDeclarado : tipo,
    preco: anuncio.preco, anunciante: anuncio.anunciante,
    bairro: textoObjetivo(anuncio.bairro),
  };
  if (chaveNormalizada(filtros.cidade) === "londrina" && filtros.estado.toUpperCase() === "PR") {
    dados.regiao = regiaoDeBairroLondrina(dados.bairro) ?? undefined;
  }
  if (anuncio.publicadoEm && timestampDeIso(anuncio.publicadoEm) != null) dados.publicadoEm = anuncio.publicadoEm;
  const endereco = textoObjetivo(anuncio.endereco);
  if (endereco) dados.endereco = endereco;
  for (const campo of ["areaM2", "quartos", "banheiros", "vagas"] as const) {
    const valor = anuncio[campo];
    if (typeof valor === "number" && Number.isFinite(valor) && valor >= 0) dados[campo] = valor;
  }
  // Imagem é objetiva, mas não transporta query de rastreamento ou credencial.
  try {
    const imagem = new URL(anuncio.imagem || "");
    if (imagem.protocol === "https:" && !imagem.username && !imagem.password) {
      imagem.search = ""; imagem.hash = ""; dados.imagem = imagem.toString();
    }
  } catch { /* Imagem não qualificada permanece ausente. */ }
  return dados;
}

