/* ================================================================
   SOLICITAÇÃO DE RECEBIMENTO DE ANGARIAÇÃO DE LOCAÇÃO

   O documento que o corretor manda ao financeiro da imobiliária para
   receber a comissão da captação — o último passo do funil, depois
   que o imóvel angariado virou contrato assinado. Até aqui ele era
   digitado à mão num .docx: endereço, referências e valor recopiados
   do painel para o Word, um por locação.

   Quase tudo que o formulário pede o painel já sabe (`endereco` +
   `unidade`, `valorAluguel`, `comissaoPercent`, `origemImovel`,
   `referenciaCrm`, `responsavel`), e é por isso que o gerador vale a
   pena: o erro que ele evita não é o de digitação em geral, é o
   endereço sem a UNIDADE e o valor recopiado errado — os dois campos
   que decidem para qual contrato o dinheiro vai.

   Três decisões:

   - **A REF INQUILINO é DERIVADA, e o número tem significado.** Ela é
     `<ref do proprietário>.<NN>`, onde NN é a vez em que o imóvel foi
     locado (01 = primeiro locatário, 02 = segundo). Isso o
     `statusHistory` sabe contar — cada entrada em "Locado" é uma
     locação —, e é o mesmo invariante de que descendem as coortes e a
     conversão. Contar errado aqui pede comissão no contrato errado,
     então o número é SUGESTÃO editável: um imóvel importado, ou
     marcado "Locado" antes de o app existir, tem histórico vazio e
     mesmo assim é uma locação de verdade (daí o piso de 1).

   - **Nada é gravado.** O documento é montado na leitura, a partir do
     imóvel e da config — mesma disciplina de `resultadoObservado.ts`.
     Corrigir a formatação de uma linha é editar uma função, e a
     solicitação de um contrato antigo sai igual à de hoje. O que o
     corretor digita na hora (a data do 1º aluguel) não vira coluna
     porque não tem segundo leitor: é dado do documento, não do imóvel.

   - **Uma estrutura só alimenta as três saídas.** `linhasSolicitacao`
     é a fonte do .docx, do texto para colar no WhatsApp e da prévia
     na tela. Montar cada uma por seu lado faria o que o corretor
     confere na tela divergir do que o financeiro recebe no arquivo —
     e a divergência só apareceria numa cobrança errada.

   Módulo puro: sem React, sem Supabase, sem store. O empacotamento do
   .docx (zip + download) mora em `lib/documentoDocx.ts`, que toca o
   browser; aqui ficam só os bytes de texto do OOXML.
   ================================================================ */
import { fmtMoneyFull } from "../formatadores";
import type { Imovel, UserConfig } from "../tipos";
import { enderecoComUnidade } from "./whatsapp";

/** Título do documento — o mesmo cabeçalho que o financeiro já recebe. */
export const TITULO_SOLICITACAO = "SOLICITAÇÃO DE RECEBIMENTO DE ANGARIAÇÃO DE LOCAÇÃO";

/** Subtítulo (a seção do formulário original). */
export const SUBTITULO_SOLICITACAO = "ANGARIAÇÃO";

/** Uma linha do formulário: rótulo em negrito, valor em texto normal.
    O rótulo já vem sem os dois-pontos — quem monta a saída os acrescenta. */
export interface LinhaSolicitacao {
  rotulo: string;
  valor: string;
}

/** Os campos editáveis do documento, já resolvidos. */
export interface CamposSolicitacao {
  /** Referência do imóvel no CRM da imobiliária (ex.: "03280.001"). */
  refProprietario: string;
  /** `<ref do proprietário>.<NN>` — ver `referenciaInquilino`. */
  refInquilino: string;
  /** Nome de quem angariou: é ele que recebe. */
  corretor: string;
  /** Endereço com unidade e bloco (`enderecoComUnidade`). */
  endereco: string;
  valorAluguel: number | null;
  /** % sobre um aluguel (40 = 40% de um mês). */
  comissaoPercent: number;
  /** Data ISO em que a imobiliária recebe o 1º aluguel. */
  dataPrimeiroAluguel: string;
  /** Conta ou chave PIX para a transferência. */
  dadosPagamento: string;
  observacao: string;
}

/**
 * Em que locação este imóvel está — o NN da REF INQUILINO.
 *
 * Cada entrada em "Locado" no `statusHistory` é um contrato: o imóvel volta
 * para a carteira quando o inquilino sai, é locado de novo, e o histórico
 * registra a segunda entrada. Piso de 1 porque histórico vazio não significa
 * "nunca locou" — significa que a locação aconteceu fora do app (imóvel
 * importado, ou marcado "Locado" antes de o histórico existir), e nesses casos
 * o documento sendo pedido AGORA é, para todos os efeitos, a primeira locação
 * que este painel conhece. Zero não é resposta possível: quem abre o gerador
 * está com um contrato assinado na mão.
 */
export function numeroLocacao(imovel: Imovel): number {
  const locacoes = (imovel.statusHistory || []).filter((h) => h.status === "Locado").length;
  return Math.max(1, locacoes);
}

/** "1" → "01". Dois dígitos é o formato do CRM; acima de 99 não trunca. */
export function sufixoLocacao(n: number): string {
  return String(Math.max(1, Math.trunc(n))).padStart(2, "0");
}

/** "03280.001" + 1 → "03280.001.01". Sem a referência do proprietário não há
    o que derivar: devolve "" em vez de um ".01" solto, que o financeiro leria
    como referência de outro imóvel. */
export function referenciaInquilino(refProprietario: string, n: number): string {
  const ref = (refProprietario || "").trim();
  if (!ref) return "";
  return `${ref}.${sufixoLocacao(n)}`;
}

/** Comissão em reais. null quando não há aluguel — o documento mostra o campo
    vazio em vez de "R$ 0,00", que num pedido de pagamento é um valor afirmado. */
export function comissaoDaSolicitacao(campos: CamposSolicitacao): number | null {
  if (campos.valorAluguel == null || isNaN(campos.valorAluguel)) return null;
  return campos.valorAluguel * (campos.comissaoPercent / 100);
}

/** "2026-08-15" → "15/08". Manipulação de string, nunca `new Date` (ver
    lib/datas.ts). O formato sem ano é o do documento que o financeiro já
    recebe — a solicitação é sempre do mês corrente. */
function diaMes(iso: string): string {
  if (!iso || iso.length < 10) return "";
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
}

/**
 * Os padrões de um imóvel locado — tudo que o painel consegue responder
 * sozinho. O que ele não sabe (a data do 1º aluguel) nasce vazio, para o
 * corretor preencher: chutar uma data num pedido de pagamento seria afirmar
 * um prazo que ninguém combinou.
 */
export function solicitacaoInicial(
  imovel: Imovel,
  config: UserConfig,
  corretorPadrao = "",
): CamposSolicitacao {
  const refProprietario = (imovel.referenciaCrm || "").trim();
  const origem = (imovel.origemImovel || "").trim();
  return {
    refProprietario,
    refInquilino: referenciaInquilino(refProprietario, numeroLocacao(imovel)),
    corretor: (imovel.responsavel || corretorPadrao || "").trim(),
    endereco: enderecoComUnidade(imovel),
    valorAluguel: imovel.valorAluguel ?? null,
    comissaoPercent: config.comissaoPercent,
    dataPrimeiroAluguel: "",
    dadosPagamento: (config.dadosPagamento || "").trim(),
    // "via" e não "pelo": as origens têm gênero e número próprios, e o artigo
    // fixo só acerta as masculinas singulares — o documento real dizia
    // "Angariação feita pelo OLX", mas a mesma frase produz "pelo Redes
    // sociais" e "pelo Placa no imóvel". Nenhum dado do painel diz o gênero de
    // um rótulo que o próprio corretor cadastrou (`origensExtras`).
    observacao: origem ? `Angariação feita via ${origem}` : "",
  };
}

/**
 * A estrutura do documento — fonte única do .docx, do texto e da prévia.
 *
 * A ordem e os rótulos são os do formulário que o financeiro já aceita: mudar
 * um rótulo aqui muda o que ele lê, não só o que aparece na tela.
 */
export function linhasSolicitacao(campos: CamposSolicitacao): LinhaSolicitacao[] {
  const comissao = comissaoDaSolicitacao(campos);
  const valor =
    campos.valorAluguel == null
      ? ""
      : `${fmtMoneyFull(campos.valorAluguel)} – ${campos.comissaoPercent}%${
          comissao == null ? "" : ` ${fmtMoneyFull(comissao)}`
        }`;

  return [
    { rotulo: "CORRETOR", valor: campos.corretor },
    {
      rotulo: "NÚMERO CONTRATO",
      valor: `REF PROP: ${campos.refProprietario} -  REF INQUILINO: ${campos.refInquilino}`,
    },
    { rotulo: "ENDEREÇO", valor: campos.endereco },
    { rotulo: "VALOR", valor },
    { rotulo: "DATA DE RECEBIMENTO DO 1° ALUGUEL DA IMOBILIÁRIA", valor: diaMes(campos.dataPrimeiroAluguel) },
    { rotulo: "CONTA CAIXA, SICREDI OU PIX PARA TRANSFERÊNCIA", valor: campos.dadosPagamento },
    { rotulo: "OBSERVAÇÃO", valor: campos.observacao },
  ];
}

/**
 * O que ainda falta preencher, em português e por rótulo do documento.
 *
 * Avisa, não bloqueia — mesma regra do modal de duplicidade. Uma solicitação
 * sem a data do 1º aluguel volta do financeiro; uma que o corretor não
 * consegue emitir porque o painel achou um campo vazio faz ele voltar ao Word,
 * que é o problema inteiro que o gerador existe para resolver.
 */
export function pendenciasSolicitacao(campos: CamposSolicitacao): string[] {
  const faltando: string[] = [];
  if (!campos.corretor.trim()) faltando.push("CORRETOR");
  if (!campos.refProprietario.trim()) faltando.push("REF PROP");
  if (!campos.refInquilino.trim()) faltando.push("REF INQUILINO");
  if (!campos.endereco.trim()) faltando.push("ENDEREÇO");
  if (campos.valorAluguel == null) faltando.push("VALOR");
  if (!campos.dataPrimeiroAluguel) faltando.push("DATA DE RECEBIMENTO DO 1° ALUGUEL");
  if (!campos.dadosPagamento.trim()) faltando.push("CONTA / PIX");
  return faltando;
}

/** O documento em texto puro, para colar no WhatsApp ou no e-mail do
    financeiro — o mesmo conteúdo do arquivo, sem o arquivo. */
export function textoSolicitacao(campos: CamposSolicitacao): string {
  const corpo = linhasSolicitacao(campos)
    .map((l) => `${l.rotulo}: ${l.valor}`)
    .join("\n");
  return `${TITULO_SOLICITACAO}\n${SUBTITULO_SOLICITACAO}\n\n${corpo}`;
}

/** "Solicitacao-03280.001.01-Rua-Maria-Lucia.docx". Sem acento nem barra: o
    nome vai para o sistema de arquivos e para o anexo do e-mail. */
export function nomeArquivoSolicitacao(campos: CamposSolicitacao): string {
  const partes = ["Solicitacao angariacao", campos.refInquilino || campos.refProprietario, campos.endereco]
    .map((p) => (p || "").trim())
    .filter(Boolean)
    .join(" ");
  const limpo = partes
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9 .-]/g, " ")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return `${limpo.slice(0, 90) || "Solicitacao-angariacao"}.docx`;
}

/* ================================================================
   O ARQUIVO .DOCX (OOXML)

   Um .docx é um zip de XMLs. Aqui ficam só os XMLs — texto puro,
   testável sem browser; quem zipa é `lib/documentoDocx.ts`.

   O markup espelha o documento que o corretor já usa: caixa de borda
   simples em volta do bloco inteiro (`pBdr` com `between`, que é como
   o Word desenha um box contínuo sobre parágrafos consecutivos),
   título em negrito e sublinhado, rótulo em negrito e valor normal.
   Não é decoração — é o formulário que o financeiro reconhece de
   relance, e um documento que chega diferente é um documento que ele
   para para conferir.
   ================================================================ */

/** Escapa o que quebraria o XML. Sem isto, um "&" no nome do proprietário ou
    um "<" digitado na observação geram um arquivo que o Word recusa a abrir —
    e o corretor descobre na frente do financeiro. */
function escXml(s: string): string {
  return (s || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** A borda aplicada a todo parágrafo do bloco. */
const BORDA =
  '<w:pBdr>' +
  '<w:top w:val="single" w:sz="4" w:space="1" w:color="auto"/>' +
  '<w:left w:val="single" w:sz="4" w:space="4" w:color="auto"/>' +
  '<w:bottom w:val="single" w:sz="4" w:space="1" w:color="auto"/>' +
  '<w:right w:val="single" w:sz="4" w:space="4" w:color="auto"/>' +
  '<w:between w:val="single" w:sz="4" w:space="1" w:color="auto"/>' +
  "</w:pBdr>";

/** Um `<w:r>` (trecho de texto) com ou sem negrito/sublinhado. */
function run(texto: string, opcoes: { negrito?: boolean; sublinhado?: boolean } = {}): string {
  const props =
    "<w:rPr>" +
    (opcoes.negrito ? "<w:b/>" : "") +
    (opcoes.sublinhado ? '<w:u w:val="single"/>' : "") +
    "</w:rPr>";
  // xml:space="preserve" mantém o espaço depois dos dois-pontos — sem ele o
  // Word come o separador e a linha sai "ENDEREÇO:Rua...".
  return `<w:r>${props}<w:t xml:space="preserve">${escXml(texto)}</w:t></w:r>`;
}

function paragrafo(runs: string): string {
  return `<w:p><w:pPr>${BORDA}</w:pPr>${runs}</w:p>`;
}

/** O `word/document.xml` da solicitação. */
export function documentoXmlSolicitacao(campos: CamposSolicitacao): string {
  const corpo = [
    paragrafo(run(TITULO_SOLICITACAO, { negrito: true, sublinhado: true })),
    paragrafo(run(SUBTITULO_SOLICITACAO, { negrito: true })),
    ...linhasSolicitacao(campos).map((l) =>
      paragrafo(run(`${l.rotulo}:`, { negrito: true }) + run(` ${l.valor}`)),
    ),
  ].join("");

  // A4 com as margens do documento original.
  const sect =
    "<w:sectPr>" +
    '<w:pgSz w:w="11906" w:h="16838"/>' +
    '<w:pgMar w:top="1417" w:right="1701" w:bottom="1417" w:left="1701" w:header="708" w:footer="708" w:gutter="0"/>' +
    "</w:sectPr>";

  return (
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
    `<w:body>${corpo}${sect}</w:body>` +
    "</w:document>"
  );
}

/** Estilos mínimos: fonte e corpo do texto (sz é meio-ponto — 22 = 11pt). */
const STYLES_XML =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">' +
  "<w:docDefaults><w:rPrDefault><w:rPr>" +
  '<w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/>' +
  '<w:sz w:val="22"/><w:szCs w:val="22"/>' +
  "</w:rPr></w:rPrDefault></w:docDefaults>" +
  "</w:styles>";

const CONTENT_TYPES_XML =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
  '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
  '<Default Extension="xml" ContentType="application/xml"/>' +
  '<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>' +
  '<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>' +
  "</Types>";

const RELS_XML =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>' +
  "</Relationships>";

const DOC_RELS_XML =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
  "</Relationships>";

/**
 * Os arquivos do .docx, por caminho dentro do zip.
 *
 * São os quatro que o Word exige mais o de estilos. Sem o
 * `word/_rels/document.xml.rels` o arquivo abre, mas com a fonte padrão de
 * fábrica do Word em vez da do documento.
 */
export function arquivosDocxSolicitacao(campos: CamposSolicitacao): Record<string, string> {
  return {
    "[Content_Types].xml": CONTENT_TYPES_XML,
    "_rels/.rels": RELS_XML,
    "word/document.xml": documentoXmlSolicitacao(campos),
    "word/_rels/document.xml.rels": DOC_RELS_XML,
    "word/styles.xml": STYLES_XML,
  };
}
