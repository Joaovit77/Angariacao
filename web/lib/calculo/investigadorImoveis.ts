import { chaveNormalizada } from "../normalizacao";

/* ================================================================
   INVESTIGADOR DE IMÓVEIS — contratos e regras puras

   Resultado de busca não é Imovel e não pode escrever na carteira. Esta
   camada só prepara consultas, normaliza evidências observáveis e ordena
   possíveis correspondências. Integração externa fica em lib/servidor.
   ================================================================ */

export const LIMITE_CONSULTA_INVESTIGADOR = 500;
export const MAXIMO_BUSCAS_POR_INVESTIGACAO = 3;

export type EtapaInvestigacao =
  | "gerando-buscas"
  | "pesquisando-web"
  | "normalizando-resultados"
  | "cruzando-informacoes";

export type FaixaConfiancaInvestigacao = "muito-forte" | "forte" | "possivel" | "indicio";

export interface CamposImovelEncontrados {
  preco: number | null;
  endereco: string | null;
  referencia: string | null;
  condominio: string | null;
  quartos: number | null;
  vagas: number | null;
  area: number | null;
}

export interface ResultadoWebInvestigacao extends CamposImovelEncontrados {
  titulo: string;
  url: string;
  dominio: string;
  descricao: string;
  consultas: string[];
}

export interface CorrespondenciaInvestigacao extends ResultadoWebInvestigacao {
  confianca: FaixaConfiancaInvestigacao;
  evidencias: string[];
  contradicoes: string[];
  /** Referência já existente no catálogo; nunca é criada pelo Investigador. */
  comparavelId?: string | null;
}

/** C13B: o que aconteceu com a memória de identidade DEPOIS da conclusão,
    só quando a investigação partiu de um imóvel identificado do Garimpo.
    Contagens e estado; nunca valores, nunca resposta bruta. */
export type EstadoMemoriaInvestigacao =
  | "salva"
  | "repetida"
  | "recusada"
  | "falhou"
  | "indisponivel";

export interface MemoriaInvestigacao {
  estado: EstadoMemoriaInvestigacao;
  /** Id da execução, gerado no servidor; é a chave da idempotência. */
  execucaoId: string;
  atributosSalvos: number;
  atributosRecusados: number;
  codigo?: string;
}

export interface ResultadoInvestigacao {
  ok: boolean;
  consultaOriginal: string;
  consultas: string[];
  resultados: CorrespondenciaInvestigacao[];
  pesquisasEvitadas: number;
  encerramentoAntecipado: boolean;
  limiteAtingido: boolean;
  aviso?: string;
  memoria?: MemoriaInvestigacao;
}

export type EventoInvestigacao =
  | { tipo: "etapa"; etapa: EtapaInvestigacao }
  | { tipo: "consultas"; consultas: string[] }
  | { tipo: "resultado"; dados: ResultadoInvestigacao }
  | { tipo: "erro"; mensagem: string };

function limparConsulta(valor: string): string {
  return valor.replace(/\s+/g, " ").trim().slice(0, LIMITE_CONSULTA_INVESTIGADOR);
}

export function consultaInvestigadorValida(valor: unknown): valor is string {
  if (typeof valor !== "string") return false;
  const limpa = valor.replace(/\s+/g, " ").trim();
  return limpa.length >= 3 && limpa.length <= LIMITE_CONSULTA_INVESTIGADOR;
}

const PADRAO_VALOR_MONETARIO = "\\d{1,3}(?:\\.\\d{3})+(?:,\\d{1,2})?|\\d+(?:,\\d{1,2})?";

function valoresMonetariosComContexto(texto: string): string[] {
  const padroes = [
    new RegExp("R\\$\\s*(" + PADRAO_VALOR_MONETARIO + ")", "gi"),
    new RegExp(
      "\\b(?:aluguel|alugar|loca[cç][aã]o|venda|valor|pre[cç]o)\\b"
      + "(?:\\s+(?:mensal|mensais|por|de|a\\s+partir\\s+de)){0,3}"
      + "\\s*[:=-]?\\s*(?:R\\$\\s*)?(" + PADRAO_VALOR_MONETARIO + ")",
      "gi",
    ),
    new RegExp(
      "(" + PADRAO_VALOR_MONETARIO + ")\\s*"
      + "(?:\\/\\s*m[eê]s|\\bpor\\s+m[eê]s\\b|\\bmensais?\\b)",
      "gi",
    ),
    new RegExp(
      "\\bmensais?\\b\\s*[:=-]?\\s*(?:R\\$\\s*)?(" + PADRAO_VALOR_MONETARIO + ")",
      "gi",
    ),
  ];
  return padroes.flatMap((padrao) =>
    [...texto.matchAll(padrao)].map((ocorrencia) => ocorrencia[1]).filter(Boolean)
  );
}

export function extrairReferenciaInvestigacao(texto: string): string | null {
  const rotulada = texto.match(
    /\b(?:ref(?:er[eê]ncia)?|c[oó]d(?:igo)?)\.?(?:\s+do\s+im[oó]vel)?\s*[:#-]?\s*([a-z0-9][a-z0-9./-]{3,30})\b/i,
  )?.[1];
  if (rotulada && /\d/.test(rotulada)) return rotulada;

  const valoresMonetarios = new Set(
    valoresMonetariosComContexto(texto).map((valor) => valor.toLowerCase()),
  );
  const candidatos = texto.match(/\b[a-z0-9]+(?:[./-][a-z0-9]+)+\b/gi) ?? [];
  return candidatos.find((candidato) => {
    const candidatoNormalizado = candidato.toLowerCase();
    const pertenceAValorMonetario = [...valoresMonetarios].some((valor) =>
      candidatoNormalizado === valor || candidatoNormalizado.startsWith(valor + "/")
    );
    if (pertenceAValorMonetario) return false;
    const codigoNumericoComZeroInicial = /^0\d{4,}(?:[./-]\d{2,})+$/.test(candidato);
    return codigoNumericoComZeroInicial;
  }) ?? null;
}

/* ------------------------------------------------------------------
   B1 — pesquisas progressivas. Precisão primeiro, ampliação controlada
   depois: cada etapa só existe quando traz consulta nova e ainda
   identificável. Sem âncora explícita (referência, logradouro com número
   ou condomínio/edifício rotulado) não há ampliação — pesquisar "casa
   Londrina" gera ruído, não investigação. Nada aqui julga relevância.
   ------------------------------------------------------------------ */

/** Ordem fixa, da mais restrita para a mais ampla. */
export type EtapaPesquisaInvestigacao = "especifica" | "nucleo" | "logradouro";

export interface PesquisaPlanejadaInvestigacao {
  etapa: EtapaPesquisaInvestigacao;
  consulta: string;
}

// Detalhes que restringem a busca sem identificar o lugar: anúncios
// costumam omiti-los ou escrevê-los de outro jeito. O nome do tipo fica,
// porque não restringe e pode fazer parte do nome de um condomínio.
const DETALHES_RESTRITIVOS = [
  /\b\d{1,4}(?:[.,]\d{1,2})?\s*m(?:²|2)(?![\p{L}\d])/giu,
  /\b\d{1,2}\s+(?:quartos?|dormit[oó]rios?|su[ií]tes?|banheiros?|vagas?(?:\s+de\s+garagem)?|garagens?)(?![\p{L}\d])/giu,
  /\b(?:unidade|bloco)\s+[\p{L}\d-]{1,10}/giu,
  /\bapto\.?\s*\d[\p{L}\d-]*/giu,
  /\b(?:refer[eê]ncia|ref|c[oó]digo|c[oó]d)(?![\p{L}\d])\.?(?:\s+do\s+im[oó]vel)?\s*[:#-]?\s*[\p{L}\d][\p{L}\d./-]*/giu,
  /\ban[uú]ncio(?![\p{L}\d])[^,]*/giu,
];

const PALAVRAS_DE_TIPO = new Set([
  "apartamento", "casa", "condominio", "kitnet", "studio", "sobrado", "sala", "comercial", "galpao", "terreno", "outro",
]);

function semDetalhesRestritivos(texto: string): string {
  const reduzido = DETALHES_RESTRITIVOS.reduce((atual, padrao) => atual.replace(padrao, " "), texto);
  return reduzido
    .split(",")
    .map((parte) => parte.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join(", ");
}

// "Rua Michigan 610 Londrina": o número sem vírgula só vale quando fecha o
// nome da rua — seguido de vírgula, fim do texto ou palavra que não seja
// "de/da/do(s)". Assim "Rua 10 de Dezembro" não vira rua com número.
const LOGRADOURO_NUMERO_SEM_VIRGULA =
  /\b(?:rua|avenida|av\.?|alameda|travessa|rodovia|estrada)\s+[\p{L}\d .'-]{2,80}?\s+\d{1,6}(?=\s*,|\s*$|\s+(?!d[aeo]s?(?![\p{L}\d]))\p{L})/iu;

/** Âncora de endereço do planejador: o extrator da análise e, como reserva,
    o número separado por espaço em qualquer tipo de via (inclusive rodovia
    e estrada, que o extrator da análise recusa sem vírgula). */
function logradouroComNumero(texto: string): string | null {
  return extrairEndereco(texto) || texto.match(LOGRADOURO_NUMERO_SEM_VIRGULA)?.[0]?.trim() || null;
}

function logradouroSemNumero(endereco: string): string {
  return endereco.replace(/(?:,\s*|\s+(?:n[ºo.]?\s*)?)\d{1,6}$/iu, "").trim();
}

/**
 * Planeja até três pesquisas em ordem progressiva, deterministicamente:
 *
 * 1. `especifica` — a combinação mais forte: a referência exata, quando
 *    houver; senão o texto completo (a mesma primeira consulta de antes).
 * 2. `nucleo` — o texto sem detalhes restritivos (área, quartos, vagas,
 *    unidade, bloco, código, anúncio), somente se ainda houver logradouro
 *    com número ou condomínio/edifício rotulado.
 * 3. `logradouro` — o núcleo sem o número do endereço, somente se sobrar
 *    contexto além do nome da rua (bairro, cidade, edifício).
 */
export function planejarPesquisasInvestigacao(entrada: string): PesquisaPlanejadaInvestigacao[] {
  // Reserva espaço para o qualificador, para uma descrição no limite não
  // virar a mesma string truncada em todas as etapas.
  const base = limparConsulta(entrada).slice(0, LIMITE_CONSULTA_INVESTIGADOR - 30).trim();
  const referencia = extrairReferenciaInvestigacao(base);
  const nucleo = semDetalhesRestritivos(base);
  const endereco = logradouroComNumero(nucleo);
  const ancorado = Boolean(endereco || extrairCondominioExplicito(nucleo));

  const candidatas: PesquisaPlanejadaInvestigacao[] = [
    { etapa: "especifica", consulta: referencia ? `"${referencia}" imóvel` : `${base} imóvel` },
  ];
  if (ancorado) candidatas.push({ etapa: "nucleo", consulta: `${nucleo} imóvel` });
  if (endereco) {
    const rua = logradouroSemNumero(endereco);
    const contexto = [...termosRelevantes(nucleo.replace(endereco, " "))]
      .filter((termo) => !PALAVRAS_DE_TIPO.has(termo));
    if (rua && contexto.length) {
      candidatas.push({ etapa: "logradouro", consulta: `${nucleo.replace(endereco, rua)} imóvel` });
    }
  }

  const plano: PesquisaPlanejadaInvestigacao[] = [];
  for (const candidata of candidatas) {
    const consulta = limparConsulta(candidata.consulta);
    if (!plano.some((item) => chaveNormalizada(item.consulta) === chaveNormalizada(consulta))) {
      plano.push({ etapa: candidata.etapa, consulta });
    }
  }
  return plano.slice(0, MAXIMO_BUSCAS_POR_INVESTIGACAO);
}

function numeroMonetario(valor: string): number | null {
  const numero = Number(valor.replace(/\./g, "").replace(",", "."));
  return Number.isFinite(numero) && numero > 0 ? numero : null;
}

function unico<T>(valores: T[]): T | null {
  const distintos = [...new Set(valores)];
  return distintos.length === 1 ? distintos[0] : null;
}

function extrairPreco(texto: string): number | null {
  const valores = valoresMonetariosComContexto(texto)
    .map((item) => numeroMonetario(item))
    .filter((item): item is number => item !== null);
  return unico(valores);
}

function extrairArea(texto: string): number | null {
  const valores = [...texto.matchAll(/(\d{1,4}(?:[.,]\d{1,2})?)\s*m(?:²|2|\^2)(?=\s|[.,;:|·-]|$)/gi)]
    .map((item) => Number(item[1].replace(",", ".")))
    .filter((item) => item >= 10 && item <= 10_000);
  return unico(valores);
}

function extrairQuantidadeUnica(texto: string, rotulos: string): number | null {
  const depois = [...texto.matchAll(new RegExp(`(\\d{1,2})\\s*(?:${rotulos})\\b`, "gi"))];
  // Quando o rótulo vem antes, exige separador. Sem isso, "3 quartos 2 vagas"
  // faria o 2 parecer também uma quantidade de quartos.
  const antes = [...texto.matchAll(new RegExp(`(?:${rotulos})\\s*[:=-]\\s*(\\d{1,2})\\b`, "gi"))];
  const valores = [...depois.map((item) => Number(item[1])), ...antes.map((item) => Number(item[1]))]
    .filter((item) => Number.isInteger(item) && item >= 0 && item <= 30);
  return unico(valores);
}

// B2: número seguido de rótulo de característica é quantidade, não número
// predial — "Avenida 7 de Setembro, 3 quartos" não tem número do imóvel.
const CARACTERISTICA_APOS_NUMERO =
  String.raw`\s*(?:quartos?|dormit[oó]rios?|su[ií]tes?|banheiros?|vagas?|garagens?|m(?:²|2)(?![\p{L}\d]))`;

const ENDERECO_COM_SEPARADOR = new RegExp(
  String.raw`\b(?:rua|avenida|av\.?|alameda|travessa|rodovia|estrada)\s+[\p{L}\d .'-]{2,80}?(?:,\s*|\s+n[ºo.]?\s*)\d{1,6}\b`
    + `(?!${CARACTERISTICA_APOS_NUMERO})`,
  "iu",
);

// Sem vírgula nem "nº", o número só vale quando fecha o nome: depois dele
// vem pontuação, fim do texto, uma característica ("3 quartos") ou palavra
// que não seja "de/da/do(s)" — "Rua 10 de Dezembro" continua sem número.
// Rodovia e estrada ficam de fora: "Rodovia PR 445" é nome, não endereço.
const ENDERECO_SEM_VIRGULA = new RegExp(
  String.raw`\b(?:rua|avenida|av\.?|alameda|travessa)\s+[\p{L}\d .'-]{2,80}?\s+\d{1,6}`
    + `(?!${CARACTERISTICA_APOS_NUMERO})`
    + String.raw`(?=\s*[,;.|–-]|\s*$|\s+\d{1,4}(?:[.,]\d+)?${CARACTERISTICA_APOS_NUMERO}|\s+(?!d[aeo]s?(?![\p{L}\d]))\p{L})`,
  "iu",
);

/** O primeiro endereço com número no texto, com ou sem vírgula. */
function extrairEndereco(texto: string): string | null {
  const encontrados = [texto.match(ENDERECO_COM_SEPARADOR), texto.match(ENDERECO_SEM_VIRGULA)]
    .filter((item): item is RegExpMatchArray => item !== null)
    .sort((a, b) => (a.index ?? 0) - (b.index ?? 0));
  return encontrados[0]?.[0]?.trim() || null;
}

/** Mesma rua e número escritos com vírgula, "nº" ou só espaço, e "Av."/"Av"
    por "Avenida", têm a mesma chave. Só compara; o texto exibido não muda. */
function chaveEndereco(valor: string | null): string {
  return chaveNormalizada(valor)
    .replace(/\bav\.?(?=\s)/g, "avenida")
    .replace(/\s+n[ºo.]?\s*(?=\d)/g, " ")
    .replace(/\s*,\s*/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** O endereço aparece no texto e o número não continua ("610" ≠ "6100"). */
function textoContemEndereco(texto: string, endereco: string): boolean {
  const escapado = chaveEndereco(endereco).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(escapado + String.raw`(?![\p{L}\d])`, "u").test(chaveEndereco(texto));
}

function extrairCondominioExplicito(texto: string): string | null {
  const valor = texto.match(/\b(?:condom[ií]nio|residencial|edif[ií]cio|ed\.?)\s+([\p{L}\d][\p{L}\d .'-]{2,70}?)(?=\s+\d{1,4}(?:[.,]\d+)?\s*m(?:²|2)|\s+\d{1,2}\s+(?:quartos?|dormit[oó]rios?)|[|,;:]|$)/iu)?.[0];
  return valor?.replace(/\s+/g, " ").trim() || null;
}

// Os mesmos tipos de via que o extrator de endereço reconhece.
const TIPO_DE_LOGRADOURO = /\b(?:rua|avenida|av\.?|alameda|travessa|rodovia|estrada)\s/i;

function expressaoPrincipal(texto: string): string | null {
  if (extrairEndereco(texto) || extrairReferenciaInvestigacao(texto)) return null;
  const antesDasCaracteristicas = texto.split(/\b\d{1,4}(?:[.,]\d+)?\s*m(?:²|2)|\b\d{1,2}\s+(?:quartos?|dormit[oó]rios?|vagas?)\b/i)[0]
    .replace(/\b(?:apartamento|casa|im[oó]vel)\b/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  // Rua sem número não é nome de empreendimento: "Rua Michigan, 3 quartos"
  // não pode virar "Mesmo condomínio" em todo anúncio da mesma rua.
  if (TIPO_DE_LOGRADOURO.test(antesDasCaracteristicas)) return null;
  const palavras = antesDasCaracteristicas.split(" ").filter(Boolean);
  return palavras.length >= 2 && palavras.length <= 7 ? antesDasCaracteristicas : null;
}

export function extrairCamposInvestigacao(
  texto: string,
  referenciaEsperada?: string | null,
): CamposImovelEncontrados {
  const referencia = referenciaEsperada && chaveNormalizada(texto).includes(chaveNormalizada(referenciaEsperada))
    ? referenciaEsperada
    : extrairReferenciaInvestigacao(texto);
  return {
    preco: extrairPreco(texto),
    endereco: extrairEndereco(texto),
    referencia,
    condominio: extrairCondominioExplicito(texto),
    quartos: extrairQuantidadeUnica(texto, "quartos?|dormit[oó]rios?"),
    vagas: extrairQuantidadeUnica(texto, "vagas?(?:\\s+de\\s+garagem)?|garagens?"),
    area: extrairArea(texto),
  };
}

function chaveCondominio(valor: string | null): string {
  return chaveNormalizada(valor).replace(/^(?:condominio|residencial|edificio|ed)\s+/, "");
}

function termosRelevantes(texto: string): Set<string> {
  const ignorados = new Set(["imovel", "apartamento", "casa", "aluguel", "venda", "quarto", "quartos", "vaga", "vagas", "com", "para", "uma", "das", "dos", "por"]);
  return new Set(chaveNormalizada(texto)
    .replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/)
    .filter((item) => item.length >= 4 && !ignorados.has(item) && !/^\d+$/.test(item)));
}

export function canonicalizarUrlInvestigacao(valor: string): string {
  try {
    const url = new URL(valor);
    url.hash = "";
    for (const chave of [...url.searchParams.keys()]) {
      if (/^(?:utm_.+|gclid|fbclid|ref|source)$/i.test(chave)) url.searchParams.delete(chave);
    }
    url.hostname = url.hostname.toLowerCase().replace(/^www\./, "");
    url.pathname = url.pathname.replace(/\/+$/, "") || "/";
    url.searchParams.sort();
    return url.toString();
  } catch {
    return valor.trim();
  }
}

function similaridadeConteudo(a: ResultadoWebInvestigacao, b: ResultadoWebInvestigacao): number {
  const termosA = termosRelevantes(`${a.titulo} ${a.descricao}`);
  const termosB = termosRelevantes(`${b.titulo} ${b.descricao}`);
  if (!termosA.size || !termosB.size) return 0;
  let intersecao = 0;
  for (const termo of termosA) if (termosB.has(termo)) intersecao += 1;
  return intersecao / new Set([...termosA, ...termosB]).size;
}

export function deduplicarResultadosInvestigacao(
  resultados: ResultadoWebInvestigacao[],
): ResultadoWebInvestigacao[] {
  const unicos: ResultadoWebInvestigacao[] = [];
  for (const resultado of resultados) {
    const url = canonicalizarUrlInvestigacao(resultado.url);
    const existente = unicos.find((item) =>
      canonicalizarUrlInvestigacao(item.url) === url
      || (item.dominio === resultado.dominio && similaridadeConteudo(item, resultado) >= 0.9)
    );
    if (!existente) {
      unicos.push({ ...resultado, url });
      continue;
    }
    existente.consultas = [...new Set([...existente.consultas, ...resultado.consultas])];
    if (resultado.descricao.length > existente.descricao.length) existente.descricao = resultado.descricao;
    for (const campo of ["preco", "endereco", "referencia", "condominio", "quartos", "vagas", "area"] as const) {
      if (existente[campo] === null && resultado[campo] !== null) existente[campo] = resultado[campo] as never;
    }
  }
  return unicos;
}

export function analisarCorrespondenciasInvestigacao(
  consultaOriginal: string,
  resultados: ResultadoWebInvestigacao[],
): CorrespondenciaInvestigacao[] {
  const entrada = extrairCamposInvestigacao(consultaOriginal);
  const condominioInformado = entrada.condominio || expressaoPrincipal(consultaOriginal);
  const termosEntrada = termosRelevantes(consultaOriginal);
  const referenciaEntrada = chaveNormalizada(entrada.referencia);
  const resultadosComMesmaReferencia = referenciaEntrada
    ? resultados.filter((resultado) => chaveNormalizada(resultado.referencia) === referenciaEntrada)
    : [];
  const condominiosDaReferencia = new Set(
    resultadosComMesmaReferencia.map((resultado) => chaveCondominio(resultado.condominio)).filter(Boolean),
  );
  const enderecosDaReferencia = new Set(
    resultadosComMesmaReferencia.map((resultado) => chaveNormalizada(resultado.endereco)).filter(Boolean),
  );

  return resultados.map<CorrespondenciaInvestigacao>((resultado) => {
    const textoResultado = chaveNormalizada(`${resultado.titulo} ${resultado.descricao}`);
    const evidencias: string[] = [];
    const contradicoes: string[] = [];
    let conflitoGrave = false;
    let referenciaIdentica = false;
    let enderecoIdentico = false;
    let condominioIdentico = false;
    let caracteristicasCompativeis = 0;

    if (entrada.referencia && resultado.referencia) {
      referenciaIdentica = chaveNormalizada(entrada.referencia) === chaveNormalizada(resultado.referencia);
      if (referenciaIdentica) {
        evidencias.push(`Referência idêntica: ${entrada.referencia}`);
      } else {
        contradicoes.push(`Referência diferente: ${resultado.referencia}`);
        conflitoGrave = true;
      }
    }
    if (referenciaIdentica && condominiosDaReferencia.size > 1) {
      contradicoes.push("Empreendimento diverge entre resultados com a mesma referência");
      conflitoGrave = true;
    }
    if (referenciaIdentica && enderecosDaReferencia.size > 1) {
      contradicoes.push("Endereço diverge entre resultados com a mesma referência");
      conflitoGrave = true;
    }

    if (entrada.endereco && resultado.endereco) {
      enderecoIdentico = chaveEndereco(entrada.endereco) === chaveEndereco(resultado.endereco)
        || textoContemEndereco(textoResultado, entrada.endereco);
      if (enderecoIdentico) {
        evidencias.push(`Endereço idêntico: ${entrada.endereco}`);
      } else {
        contradicoes.push(`Endereço diferente: ${resultado.endereco}`);
        conflitoGrave = true;
      }
    } else if (entrada.endereco && textoContemEndereco(textoResultado, entrada.endereco)) {
      enderecoIdentico = true;
      evidencias.push(`Endereço idêntico: ${entrada.endereco}`);
    }

    const chaveCondominioEntrada = chaveCondominio(condominioInformado);
    const chaveCondominioResultado = chaveCondominio(resultado.condominio);
    if (chaveCondominioEntrada && chaveCondominioResultado) {
      condominioIdentico = chaveCondominioResultado.includes(chaveCondominioEntrada)
        || chaveCondominioEntrada.includes(chaveCondominioResultado);
      if (condominioIdentico) {
        evidencias.push(`Mesmo condomínio ou empreendimento: ${condominioInformado}`);
      } else {
        contradicoes.push(`Empreendimento diferente: ${resultado.condominio}`);
        conflitoGrave = true;
      }
    } else if (chaveCondominioEntrada && textoResultado.includes(chaveCondominioEntrada)) {
      condominioIdentico = true;
      evidencias.push(`Mesmo condomínio ou empreendimento: ${condominioInformado}`);
    }

    if (entrada.area !== null && resultado.area !== null) {
      const diferenca = Math.abs(entrada.area - resultado.area);
      const toleranciaCompatibilidade = Math.max(2, entrada.area * 0.03);
      const toleranciaIncompatibilidade = Math.max(10, entrada.area * 0.2);
      if (diferenca <= toleranciaCompatibilidade) {
        caracteristicasCompativeis += 1;
        evidencias.push(`Área compatível: ${resultado.area.toLocaleString("pt-BR")} m²`);
      } else if (diferenca >= toleranciaIncompatibilidade) {
        contradicoes.push(`Área incompatível: ${resultado.area.toLocaleString("pt-BR")} m²`);
      }
    }
    if (entrada.quartos !== null && resultado.quartos !== null) {
      if (entrada.quartos === resultado.quartos) {
        caracteristicasCompativeis += 1;
        evidencias.push(`Mesma quantidade de quartos: ${resultado.quartos}`);
      } else {
        contradicoes.push(`Quantidade de quartos diferente: ${resultado.quartos}`);
      }
    }
    if (entrada.vagas !== null && resultado.vagas !== null) {
      if (entrada.vagas === resultado.vagas) {
        caracteristicasCompativeis += 1;
        evidencias.push(`Mesma quantidade de vagas: ${resultado.vagas}`);
      } else {
        contradicoes.push(`Quantidade de vagas diferente: ${resultado.vagas}`);
      }
    }

    const termosResultado = termosRelevantes(`${resultado.titulo} ${resultado.descricao}`);
    const comuns = [...termosEntrada].filter((termo) => termosResultado.has(termo));
    if (comuns.length >= 2 && comuns.length / Math.max(termosEntrada.size, 1) >= 0.6
      && !condominioIdentico) {
      evidencias.push(`Termos principais encontrados: ${comuns.slice(0, 4).join(", ")}`);
    }

    const temIdentidade = referenciaIdentica || enderecoIdentico;
    const temConflito = contradicoes.length > 0;
    let confianca: FaixaConfiancaInvestigacao;
    if (conflitoGrave) {
      confianca = evidencias.length ? "possivel" : "indicio";
    } else if (temConflito) {
      confianca = temIdentidade || (condominioIdentico && caracteristicasCompativeis >= 2)
        ? "forte"
        : evidencias.length ? "possivel" : "indicio";
    } else if (temIdentidade || (condominioIdentico && caracteristicasCompativeis >= 2)) {
      confianca = "muito-forte";
    } else if (condominioIdentico && caracteristicasCompativeis >= 1) {
      confianca = "forte";
    } else if (evidencias.length >= 2) {
      confianca = "possivel";
    } else {
      confianca = "indicio";
    }

    return {
      ...resultado,
      confianca,
      evidencias,
      contradicoes,
    };
  }).sort((a, b) => {
    const ordem: Record<FaixaConfiancaInvestigacao, number> = {
      "muito-forte": 4,
      forte: 3,
      possivel: 2,
      indicio: 1,
    };
    return ordem[b.confianca] - ordem[a.confianca]
      || a.contradicoes.length - b.contradicoes.length
      || b.evidencias.length - a.evidencias.length
      || a.titulo.localeCompare(b.titulo, "pt-BR");
  });
}

/**
 * Regra de parada da v1.1: só economiza chamadas quando existe ao menos
 * uma correspondência muito forte, ao menos duas evidências favoráveis
 * independentes e nenhuma contradição observada.
 * Quantidade de resultados, isoladamente, nunca encerra a investigação.
 */
export function haEvidenciaSuficiente(
  resultados: CorrespondenciaInvestigacao[],
): boolean {
  return resultados.some((resultado) => {
    const evidenciasEstruturadas = resultado.evidencias.filter(
      (evidencia) => !evidencia.startsWith("Termos principais encontrados"),
    );
    return resultado.confianca === "muito-forte"
      && evidenciasEstruturadas.length >= 2
      && resultado.contradicoes.length === 0;
  });
}
