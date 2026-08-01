/* ================================================================
   IMPORTAR A CARTEIRA DE UMA PLANILHA — a parte pura

   O corretor que chega com 200 imóveis numa planilha não tem por onde
   entrar: hoje ele digita, um por um, ou desiste. O `csv.ts` só EXPORTA
   (Relatórios); isto é o caminho de volta.

   O RISCO QUE DÁ FORMA A ESTE MÓDULO não é o parse — é o que uma
   importação em massa faz com o resto do sistema. Cadastro em lote é
   exatamente o que enche a base de registro sem endereço (a razão pela
   qual a extensão de navegador foi descartada, em 2026-07-27): imóvel
   sem endereço não geocodifica, fica fora do mapa, é invisível para a
   duplicidade, e MESMO ASSIM ocupa linha no pipeline disparando
   `isStale` e cobrando o corretor todo dia por algo que ele não pode
   trabalhar. Por isso endereço é obrigatório aqui, e a linha sem ele é
   recusada em vez de entrar pela metade.

   TRÊS REGRAS QUE CAEM DISSO:

   1. **Tudo entra como "Novo contato".** Uma planilha com coluna
      "status" dizendo "Locado" injetaria na conversão, na comissão e
      na meta do mês um negócio que nunca aconteceu neste sistema — e
      sem data para pôr no `statusHistory`, as coortes e o tempo médio
      não teriam o que medir. É a mesma regra do desdobramento, em que
      a unidade nunca nasce "Locado".

   2. **Telefone ilegível não derruba a linha, mas não entra.** Imóvel
      sem telefone é trabalhável (o corretor descobre depois); imóvel
      com telefone ERRADO manda mensagem para um estranho. Na dúvida,
      fica sem — e a prévia diz quantos.

   3. **A duplicata é checada duas vezes:** contra a carteira e DENTRO
      do próprio arquivo. Planilha de verdade tem linha repetida, e sem
      o segundo corte a importação criaria a duplicata que o
      `ModalImovel` passa o tempo todo evitando.
   ================================================================ */
import { imoveisDuplicados } from "./duplicidade";
import { telefoneCanonico } from "./webhookWhatsapp";
import type { Imovel } from "../tipos";

/** Delimitadores que uma planilha brasileira produz. O ';' vem primeiro
    porque é o que o Excel pt-BR usa (a vírgula é separador decimal) —
    e é o que o nosso próprio `csv.ts` gera ao exportar. */
const DELIMITADORES = [";", ",", "\t"] as const;

/**
 * Qual delimitador o arquivo usa.
 *
 * Decidido pela PRIMEIRA linha, contando fora das aspas: um endereço
 * como `"Rua X, 250"` tem vírgula dentro do campo, e contar cru elegeria
 * a vírgula num arquivo separado por ponto e vírgula — quebrando todas
 * as colunas de um jeito que o corretor não teria como diagnosticar.
 */
export function detectarDelimitador(texto: string): string {
  const primeira = (texto.split(/\r?\n/)[0] || "");
  let melhor: string = DELIMITADORES[0];
  let maior = -1;
  for (const d of DELIMITADORES) {
    let n = 0;
    let dentroDeAspas = false;
    for (const ch of primeira) {
      if (ch === '"') dentroDeAspas = !dentroDeAspas;
      else if (ch === d && !dentroDeAspas) n++;
    }
    if (n > maior) {
      maior = n;
      melhor = d;
    }
  }
  return melhor;
}

/**
 * Quebra o CSV em matriz de células, respeitando aspas do RFC 4180
 * (aspas duplicadas escapam uma aspa, e o campo entre aspas pode conter
 * o delimitador e quebras de linha).
 *
 * Escrito à mão, sem dependência: são 30 linhas, e uma biblioteca a
 * mais no bundle do browser para isto não se paga.
 */
export function lerCsv(texto: string, delim?: string): string[][] {
  // BOM do Excel: se sobrar, vira parte do primeiro cabeçalho e nenhuma
  // coluna é reconhecida.
  const limpo = texto.replace(/^﻿/, "");
  const d = delim || detectarDelimitador(limpo);

  const linhas: string[][] = [];
  let celula = "";
  let linha: string[] = [];
  let dentroDeAspas = false;

  for (let i = 0; i < limpo.length; i++) {
    const ch = limpo[i];
    if (dentroDeAspas) {
      if (ch === '"') {
        if (limpo[i + 1] === '"') {
          celula += '"';
          i++;
        } else dentroDeAspas = false;
      } else celula += ch;
      continue;
    }
    if (ch === '"') dentroDeAspas = true;
    else if (ch === d) {
      linha.push(celula);
      celula = "";
    } else if (ch === "\n") {
      linha.push(celula);
      linhas.push(linha);
      linha = [];
      celula = "";
    } else if (ch !== "\r") celula += ch;
  }
  linha.push(celula);
  linhas.push(linha);

  // Linha totalmente vazia é ruído do fim do arquivo, não registro.
  return linhas.filter((l) => l.some((c) => c.trim() !== ""));
}

/** Campos que a importação sabe preencher. */
export type CampoImportavel =
  | "endereco"
  | "bairro"
  | "cidade"
  | "unidade"
  | "bloco"
  | "edificio"
  | "proprietarioNome"
  | "proprietarioTelefone"
  | "tipo"
  | "valorAluguel"
  | "origemImovel"
  | "observacoes"
  | "dataAngariacao";

/**
 * Sinônimos de cabeçalho, por campo.
 *
 * Comparados por forma normalizada (sem acento, sem pontuação, minúsculo),
 * porque a planilha vem de onde vier: "Endereço", "ENDERECO", "end.",
 * "Logradouro". Exigir um cabeçalho exato transformaria a importação num
 * formulário que só funciona com o arquivo que nós mesmos exportamos — e
 * quem tem o nosso arquivo não precisa importar.
 */
const SINONIMOS: Record<CampoImportavel, string[]> = {
  endereco: ["endereco", "end", "logradouro", "rua", "enderecocompleto"],
  bairro: ["bairro", "regiao"],
  cidade: ["cidade", "municipio"],
  unidade: ["unidade", "apto", "apartamento", "ap", "sala", "numeroapto"],
  bloco: ["bloco", "torre"],
  edificio: ["edificio", "predio", "condominio", "empreendimento"],
  proprietarioNome: ["proprietario", "proprietarionome", "nome", "nomeproprietario", "dono", "contato"],
  proprietarioTelefone: ["telefone", "celular", "fone", "whatsapp", "tel", "contatotelefone"],
  tipo: ["tipo", "tipoimovel", "tipodeimovel"],
  valorAluguel: ["valor", "aluguel", "valoraluguel", "preco", "valordoaluguel"],
  origemImovel: ["origem", "fonte", "origemimovel", "portal"],
  observacoes: ["observacao", "observacoes", "obs", "anotacoes", "notas", "descricao"],
  /* A coluna que mais importa e que ninguém pensaria em mapear.
     `imoveisContatadosNoMes` conta por `dataAngariacao` — importar 200
     imóveis sem ela carimbaria todos com a data de hoje e o painel
     anunciaria "200 contatados este mês", que é falso e estraga a
     coorte, a meta e o relatório do mês. Com a data da planilha, cada
     um cai no mês em que de fato entrou na carteira. */
  dataAngariacao: ["data", "datacadastro", "dataangariacao", "cadastro", "datacontato", "criadoem"],
};

/** Minúsculo, sem acento e só letras/números — a forma em que dois
    cabeçalhos "iguais" de planilhas diferentes finalmente batem. */
export function normalizarCabecalho(texto: string): string {
  return (texto || "")
    .normalize("NFD")
    // Faixa dos diacríticos combinantes, escrita por escape e não pelos
    // caracteres em si: eles são invisíveis no editor, e um arquivo
    // salvo noutra codificação os perderia sem ninguém ver — aí
    // "Endereço" deixaria de casar com "endereco" em silêncio.
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

/** Para cada campo, o índice da coluna correspondente (ou -1).

    A PRIMEIRA coluna que casa vence: planilha com "Telefone" e
    "Telefone 2" deve usar a primeira, não a última. */
export function mapearColunas(cabecalho: string[]): Record<CampoImportavel, number> {
  const normalizados = cabecalho.map(normalizarCabecalho);
  const mapa = {} as Record<CampoImportavel, number>;
  for (const campo of Object.keys(SINONIMOS) as CampoImportavel[]) {
    mapa[campo] = normalizados.findIndex((h) => SINONIMOS[campo].includes(h));
  }
  return mapa;
}

/**
 * "R$ 1.850,00" → 1850. Devolve null quando não há número.
 *
 * A ordem importa: tira o separador de milhar (ponto) ANTES de trocar a
 * vírgula decimal por ponto. Invertido, "1.850,00" viraria 1.85 — e um
 * aluguel de mil e oitocentos entraria como um e oitenta e cinco, sem
 * erro nenhum, envenenando comissão e faturamento.
 */
export function lerValor(texto: string | undefined): number | null {
  const s = (texto || "").trim();
  if (!s) return null;
  const limpo = s.replace(/[^\d,.-]/g, "").replace(/\./g, "").replace(",", ".");
  const n = Number(limpo);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Data da planilha → ISO "YYYY-MM-DD". null quando não dá para ler.
 *
 * Feita por manipulação de string, sem `new Date`, e não por preguiça:
 * é a regra do projeto (só `lib/datas.ts` instancia Date), e ela existe
 * porque `new Date("10/07/2026")` interpreta como mês/dia no padrão
 * americano — a data de um imóvel de julho viraria outubro, silenciosa
 * e plausível.
 *
 * Aceita "10/07/2026", "10-07-2026" e "2026-07-10". Ano de dois dígitos
 * é RECUSADO em vez de adivinhado: "10/07/26" pode ser 1926 ou 2026, e
 * o palpite errado joga o imóvel num mês que nenhuma tela mostra.
 */
export function lerData(texto: string | undefined): string | null {
  const s = (texto || "").trim();
  if (!s) return null;

  const iso = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  const br = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})/);
  let ano: string, mes: string, dia: string;
  if (iso) [, ano, mes, dia] = iso;
  else if (br) [, dia, mes, ano] = br;
  else return null;

  const m = Number(mes);
  const d = Number(dia);
  // Sem calendário completo (não há Date aqui): barra o impossível, que
  // é o que denuncia mês e dia trocados na origem.
  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  return `${ano}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

/** O motivo de uma linha não entrar, ou de entrar incompleta. */
export type ProblemaLinha = "sem-endereco" | "duplicada-na-carteira" | "repetida-no-arquivo" | "telefone-ignorado";

export interface LinhaImportada {
  /** Número da linha no arquivo, contando o cabeçalho — é o que o
      corretor vê ao abrir a planilha para conferir. */
  linha: number;
  /** Preenchido quando a linha entra. */
  imovel: Omit<Imovel, "id"> | null;
  problemas: ProblemaLinha[];
}

export interface ResultadoLeitura {
  linhas: LinhaImportada[];
  /** Campos que foram reconhecidos no cabeçalho. */
  colunasReconhecidas: CampoImportavel[];
  /** Cabeçalhos do arquivo que não viraram campo nenhum — a tela avisa,
      porque quase sempre significa coluna com nome inesperado, não
      coluna irrelevante. */
  colunasIgnoradas: string[];
}

const MENSAGENS: Record<ProblemaLinha, string> = {
  "sem-endereco": "sem endereço — não entra",
  "duplicada-na-carteira": "já existe na sua carteira — não entra",
  "repetida-no-arquivo": "repetida na própria planilha — não entra",
  "telefone-ignorado": "telefone ilegível — entra sem telefone",
};

export function descreverProblema(p: ProblemaLinha): string {
  return MENSAGENS[p];
}

/** Só estes impedem a linha de entrar. `telefone-ignorado` é ressalva,
    não recusa: o imóvel continua trabalhável sem telefone. */
export function impedeEntrada(p: ProblemaLinha): boolean {
  return p !== "telefone-ignorado";
}

/**
 * Lê o arquivo inteiro e diz, linha a linha, o que entra e o que não.
 *
 * Nada é gravado aqui — a função é pura e devolve candidatos. Quem
 * grava é a mutação, depois de o corretor ver a prévia: importar 200
 * imóveis é irreversível na prática (desfazer é apagar 200 registros à
 * mão), e uma tela que só avisa depois não serve.
 */
export function lerImportacao(texto: string, carteira: Imovel[], hoje: string): ResultadoLeitura {
  const matriz = lerCsv(texto);
  if (matriz.length < 2) {
    return { linhas: [], colunasReconhecidas: [], colunasIgnoradas: [] };
  }

  const [cabecalho, ...corpo] = matriz;
  const mapa = mapearColunas(cabecalho);
  const usadas = new Set(Object.values(mapa).filter((i) => i >= 0));

  const colunasReconhecidas = (Object.keys(mapa) as CampoImportavel[]).filter((c) => mapa[c] >= 0);
  const colunasIgnoradas = cabecalho.filter((h, i) => !usadas.has(i) && h.trim() !== "");

  const celula = (linha: string[], campo: CampoImportavel): string => {
    const i = mapa[campo];
    return i >= 0 ? (linha[i] || "").trim() : "";
  };

  // Acumula o que já entrou NESTA leitura, para a segunda checagem de
  // duplicata (a de dentro do arquivo). Cresce a cada linha aceita.
  const jaAceitos: Imovel[] = [];
  const linhas: LinhaImportada[] = [];

  corpo.forEach((bruta, idx) => {
    // +2: uma para o cabeçalho, outra porque planilha conta do 1.
    const numero = idx + 2;
    const problemas: ProblemaLinha[] = [];

    const endereco = celula(bruta, "endereco");
    if (!endereco) {
      linhas.push({ linha: numero, imovel: null, problemas: ["sem-endereco"] });
      return;
    }

    const candidato = {
      endereco,
      cidade: celula(bruta, "cidade") || null,
      unidade: celula(bruta, "unidade") || null,
      bloco: celula(bruta, "bloco") || null,
    };

    if (imoveisDuplicados(candidato, carteira).length > 0) {
      linhas.push({ linha: numero, imovel: null, problemas: ["duplicada-na-carteira"] });
      return;
    }
    if (imoveisDuplicados(candidato, jaAceitos).length > 0) {
      linhas.push({ linha: numero, imovel: null, problemas: ["repetida-no-arquivo"] });
      return;
    }

    // O telefone passa pela MESMA forma canônica do webhook: é ela que
    // faz a resposta do proprietário achar o imóvel depois. Um número
    // que não canoniza não serve para nada e não entra.
    const telefoneBruto = celula(bruta, "proprietarioTelefone");
    const telefone = telefoneCanonico(telefoneBruto);
    if (telefoneBruto && !telefone) problemas.push("telefone-ignorado");

    const imovel: Omit<Imovel, "id"> = {
      endereco,
      bairro: celula(bruta, "bairro") || null,
      cidade: candidato.cidade,
      unidade: candidato.unidade,
      bloco: candidato.bloco,
      edificio: celula(bruta, "edificio") || null,
      proprietarioNome: celula(bruta, "proprietarioNome") || null,
      // Guarda o que veio escrito (formatado como a pessoa digitou),
      // não a forma canônica: esta é chave de busca, aquela é o que o
      // corretor lê na tela. `telefoneWhatsapp` normaliza no envio.
      proprietarioTelefone: telefone ? telefoneBruto : null,
      tipo: celula(bruta, "tipo") || null,
      valorAluguel: lerValor(celula(bruta, "valorAluguel")),
      origemImovel: celula(bruta, "origemImovel") || null,
      observacoes: celula(bruta, "observacoes") || null,
      // Ver a regra 1 no topo: importação não escolhe status.
      status: "Novo contato",
      // Sem data na planilha, cai em hoje — é o melhor que se pode
      // afirmar. Quando ela existe, é ela que manda: ver o comentário
      // de `dataAngariacao` nos sinônimos.
      dataAngariacao: lerData(celula(bruta, "dataAngariacao")) || hoje,
      /* `statusHistory` fica VAZIO de propósito, e isto não é
         esquecimento do invariante. O invariante diz que toda MUDANÇA
         de status passa por `aplicarMudancaDeStatus`; importar não é
         mudança, é o estado inicial — e uma entrada carimbada com hoje
         afirmaria uma transição que não aconteceu. O motor já trata
         esse caso: `dateEnteredStatus(i, "Novo contato")` e
         `currentStatusSince` caem em `dataAngariacao` quando o
         histórico está vazio. */
      statusHistory: [],
    };

    jaAceitos.push({ ...imovel, id: `importado-${numero}` } as Imovel);
    linhas.push({ linha: numero, imovel, problemas });
  });

  return { linhas, colunasReconhecidas, colunasIgnoradas };
}

export interface ResumoImportacao {
  total: number;
  entram: number;
  semEndereco: number;
  duplicadasNaCarteira: number;
  repetidasNoArquivo: number;
  semTelefone: number;
}

export function resumirImportacao(linhas: LinhaImportada[]): ResumoImportacao {
  const conta = (p: ProblemaLinha) => linhas.filter((l) => l.problemas.includes(p)).length;
  return {
    total: linhas.length,
    entram: linhas.filter((l) => l.imovel !== null).length,
    semEndereco: conta("sem-endereco"),
    duplicadasNaCarteira: conta("duplicada-na-carteira"),
    repetidasNoArquivo: conta("repetida-no-arquivo"),
    semTelefone: conta("telefone-ignorado"),
  };
}
