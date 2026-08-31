/* ================================================================
   RELATÓRIO PDF "IMÓVEIS ANGARIADOS" (CasaSoft)

   O PDF não é uma planilha disfarçada: cada célula é texto desenhado em
   uma coordenada. O servidor extrai esses textos com posição e este módulo
   puro reconstrói as linhas pelas colunas fixas do relatório. A saída volta
   a ser CSV para passar pela MESMA prévia, duplicidade e gravação em lote da
   importação existente — dois formatos de entrada, um só contrato de dados.
   ================================================================ */
import { lerData, lerInteiro, lerValor } from "./importacao";
import { chaveNormalizada, nomeProprio } from "../normalizacao";

export interface TextoPdfPosicionado {
  pagina: number;
  x: number;
  y: number;
  texto: string;
}

export interface RegistroRelatorioCasaSoft {
  referenciaCrm: string;
  endereco: string;
  bairro: string;
  cidade: string;
  unidade: string;
  bloco: string;
  tipo: string;
  quartos: number | null;
  vagas: number | null;
  valorAluguel: number | null;
  responsavel: string;
  observacoes: string;
  dataAngariacao: string | null;
}

export interface ResultadoRelatorioCasaSoft {
  registros: RegistroRelatorioCasaSoft[];
  totalDeclarado: number;
  paginas: number;
}

const FATOR_ALUGUEL_CASASOFT = 1.2;
const TOLERANCIA_LINHA = 1.25;
const REFERENCIA = /^\d{5}\.\d{3}$/;

function textosDaLinha(
  textos: TextoPdfPosicionado[],
  referencia: TextoPdfPosicionado,
): TextoPdfPosicionado[] {
  return textos.filter(
    (item) => item.pagina === referencia.pagina && Math.abs(item.y - referencia.y) <= TOLERANCIA_LINHA,
  );
}

function textoDaFaixa(linha: TextoPdfPosicionado[], inicio: number, fim: number): string {
  return linha
    .filter((item) => item.x >= inicio && item.x < fim)
    .sort((a, b) => a.x - b.x)
    .map((item) => item.texto.trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizarLogradouro(valor: string): string {
  const expandido = valor
    .replace(/^AVENI\b/i, "Avenida")
    .replace(/^AV\b/i, "Avenida")
    .replace(/^R\b/i, "Rua")
    .replace(/\s+,/g, ",")
    .replace(/\s+/g, " ")
    .trim();
  return nomeProprio(expandido);
}

function separarEndereco(valor: string): { endereco: string; unidade: string; bloco: string } {
  const limpo = valor.replace(/\s+/g, " ").trim();
  const comBloco = limpo.match(
    /^(.*?)\s+(?:BL|BLOCO|TR|TORRE)\s+(.+?)\s+(?:AP|APTO|APARTAMENTO)\s+([\p{L}\d.-]+)$/iu,
  );
  if (comBloco) {
    return {
      endereco: normalizarLogradouro(comBloco[1]),
      bloco: nomeProprio(comBloco[2]),
      unidade: comBloco[3].toLocaleUpperCase("pt-BR"),
    };
  }

  const semBloco = limpo.match(/^(.*?)\s+(?:AP|APTO|APARTAMENTO)\s+([\p{L}\d.-]+)$/iu);
  if (semBloco) {
    return {
      endereco: normalizarLogradouro(semBloco[1]),
      bloco: "",
      unidade: semBloco[2].toLocaleUpperCase("pt-BR"),
    };
  }

  return { endereco: normalizarLogradouro(limpo), unidade: "", bloco: "" };
}

function tipoDoRelatorio(valor: string): string {
  const chave = chaveNormalizada(valor);
  if (chave === "casa residencial") return "Casa";
  if (chave === "casa comercial") return "Sala Comercial";
  return nomeProprio(valor);
}

function aluguelBase(valorRelatorio: string): number | null {
  const bruto = lerValor(valorRelatorio);
  if (bruto === null) return null;
  return Number((bruto / FATOR_ALUGUEL_CASASOFT).toFixed(2));
}

function numeroPositivoOuNull(valor: string): number | null {
  const n = lerValor(valor);
  return n && n > 0 ? n : null;
}

function observacoesDoRelatorio(
  referenciaCrm: string,
  tipoOriginal: string,
  areaTotal: number | null,
  areaUtil: number | null,
  suites: number | null,
): string {
  const partes = [`Captado — relatório 'Imóveis Angariados' do CRM (ref ${referenciaCrm})`];
  if (chaveNormalizada(tipoOriginal) === "casa comercial") {
    partes.push("Tipo no relatório: Casa Comercial");
  }
  if (areaTotal !== null) partes.push(`Área total: ${areaTotal.toLocaleString("pt-BR")} m²`);
  if (areaUtil !== null) partes.push(`Área útil: ${areaUtil.toLocaleString("pt-BR")} m²`);
  if (suites !== null) partes.push(`${suites} suíte(s)`);
  return partes.join(" | ");
}

function responsavelDaLinha(
  textos: TextoPdfPosicionado[],
  referencia: TextoPdfPosicionado,
): string {
  const candidato = textos
    .filter(
      (item) =>
        item.pagina === referencia.pagina &&
        item.x >= 175 &&
        item.x < 280 &&
        item.y < referencia.y - 7 &&
        item.y > referencia.y - 20,
    )
    .sort((a, b) => b.y - a.y)[0];
  return candidato ? nomeProprio(candidato.texto) : "";
}

function totalDeclarado(textos: TextoPdfPosicionado[]): number {
  const totais = textos
    .map((item) => item.texto.match(/Total de registros:\s*(\d+)/i)?.[1])
    .filter((valor): valor is string => !!valor)
    .map(Number)
    .filter((valor) => Number.isInteger(valor) && valor > 0);
  return totais.length ? Math.max(...totais) : 0;
}

/** Reconstrói o relatório a partir dos textos posicionados pelo PDF.js. */
export function interpretarRelatorioCasaSoft(
  textos: TextoPdfPosicionado[],
): ResultadoRelatorioCasaSoft {
  const chaves = new Set(textos.map((item) => chaveNormalizada(item.texto)));
  const formatoReconhecido =
    chaves.has("imoveis angariados") && chaves.has("ref.") && chaves.has("dt. angariacao");
  if (!formatoReconhecido) {
    throw new Error("Este PDF não é o relatório 'Imóveis Angariados' do CasaSoft.");
  }

  const referencias = textos.filter((item) => REFERENCIA.test(item.texto.trim()));
  const declarado = totalDeclarado(textos);
  if (!declarado) {
    throw new Error("Não foi possível confirmar o total de imóveis informado no PDF.");
  }
  if (referencias.length !== declarado) {
    throw new Error(
      `O PDF informa ${declarado} imóvel(is), mas foi possível ler ${referencias.length}. Nada foi preparado para importação.`,
    );
  }

  const registros = referencias.map((referencia) => {
    const linha = textosDaLinha(textos, referencia);
    const referenciaCrm = referencia.texto.trim();
    const enderecoSeparado = separarEndereco(textoDaFaixa(linha, 175, 350));
    const tipoOriginal = textoDaFaixa(linha, 90, 175);
    const areaTotal = numeroPositivoOuNull(textoDaFaixa(linha, 440, 500));
    const areaUtil = numeroPositivoOuNull(textoDaFaixa(linha, 500, 545));
    const suites = lerInteiro(textoDaFaixa(linha, 585, 625));

    return {
      referenciaCrm,
      endereco: enderecoSeparado.endereco,
      bairro: nomeProprio(textoDaFaixa(linha, 350, 440)),
      cidade: "Londrina",
      unidade: enderecoSeparado.unidade,
      bloco: enderecoSeparado.bloco,
      tipo: tipoDoRelatorio(tipoOriginal),
      quartos: lerInteiro(textoDaFaixa(linha, 545, 585)),
      vagas: lerInteiro(textoDaFaixa(linha, 625, 665)),
      valorAluguel: aluguelBase(textoDaFaixa(linha, 774, 820)),
      responsavel: responsavelDaLinha(textos, referencia),
      observacoes: observacoesDoRelatorio(referenciaCrm, tipoOriginal, areaTotal, areaUtil, suites),
      dataAngariacao: lerData(textoDaFaixa(linha, 665, 730)),
    } satisfies RegistroRelatorioCasaSoft;
  });

  return {
    registros,
    totalDeclarado: declarado,
    paginas: Math.max(...textos.map((item) => item.pagina), 0),
  };
}

function celulaCsv(valor: string | number | null): string {
  const texto = valor === null ? "" : String(valor);
  return `"${texto.replace(/"/g, '""')}"`;
}

/** Converte para o contrato já aceito por `lerImportacao`. */
export function csvDoRelatorioCasaSoft(registros: RegistroRelatorioCasaSoft[]): string {
  const cabecalho = [
    "referencia",
    "endereco",
    "bairro",
    "cidade",
    "unidade",
    "bloco",
    "tipo",
    "quartos",
    "vagas",
    "valor",
    "responsavel",
    "observacoes",
    "data",
  ];
  const linhas = registros.map((item) => [
    item.referenciaCrm,
    item.endereco,
    item.bairro,
    item.cidade,
    item.unidade,
    item.bloco,
    item.tipo,
    item.quartos,
    item.vagas,
    item.valorAluguel,
    item.responsavel,
    item.observacoes,
    item.dataAngariacao,
  ]);
  return [cabecalho.map(celulaCsv), ...linhas.map((linha) => linha.map(celulaCsv))]
    .map((linha) => linha.join(";"))
    .join("\n");
}
