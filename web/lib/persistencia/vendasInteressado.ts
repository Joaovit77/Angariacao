/* ================================================================
   VENDAS V1-B3.1: CONTRATO DO INTERESSADO (TypeScript puro).

   Define como a criação de uma oportunidade identifica a pessoa
   interessada sem cadastro paralelo: ela é sempre um `contatos.id`. Este
   módulo só valida, normaliza e decide sobre dados já carregados; não lê
   banco, não chama RPC e não é usado por nenhuma porta de `vendas.ts`.
   O SQL do B3.2 (`vendas_resolver_interessado` e a evolução de
   `vendas_criar_oportunidade`) terá de reproduzir exatamente estas regras.

   Regras fixas (B3.0):
   - identidade é o id; nome nunca identifica, nunca deduplica e nunca é
     normalizado para escolher pessoa;
   - telefone usa a MESMA forma canônica do resto do sistema
     (`telefoneCanonico`, gêmea de `public.telefone_canonico()`);
   - nada é fundido, renomeado ou ganha telefone por aqui;
   - conflito volta para decisão humana, nunca é escolhido sozinho;
   - outra conta nunca entra na entrada de uma decisão.
   ================================================================ */
import { resolverContatoSobrevivente, type ContatoParaResolucao } from "../calculo/resolucaoContato";
import { telefoneCanonico } from "../calculo/webhookWhatsapp";

/** `contatos_nome_check`: 1 a 200 caracteres depois de aparar. */
export const LIMITE_NOME_INTERESSADO_VENDA = 200;
/** `contatos_telefones_telefone_check`: 1 a 40 caracteres depois de aparar. */
export const LIMITE_TELEFONE_INTERESSADO_VENDA = 40;

/* ----------------------------------------------------------------
   COMANDO: o que o chamador envia
   ---------------------------------------------------------------- */

export interface InteressadoExistenteVenda { readonly modo: "existente"; readonly contatoId: string }
export interface InteressadoNovoVenda { readonly modo: "novo"; readonly nome: string; readonly telefone: string | null }
export type InteressadoVenda = InteressadoExistenteVenda | InteressadoNovoVenda;

/** Forma validada: id em minúsculas, nome aparado, telefone digitado + canônico. */
export type InteressadoNormalizadoVenda =
  | { readonly modo: "existente"; readonly contatoId: string }
  | {
      readonly modo: "novo";
      readonly nome: string;
      readonly telefone: { readonly digitado: string; readonly canonico: string } | null;
    };

/** Como o normalizador do B3.2 distingue as duas formas aceitas em `criar`:
    exatamente uma das chaves `contatoId` (legado B2, intocado) ou
    `interessado` (B3). As duas juntas, ou nenhuma, é `estrutura-invalida`. */
export type IdentificacaoCriarVenda =
  | { readonly forma: "legado-b2"; readonly contatoId: string }
  | { readonly forma: "interessado"; readonly interessado: InteressadoNormalizadoVenda };

/** Formato futuro do comando de criação com interessado. Fica FORA de
    `ComandosVenda`: até o B3.2 existir em Production não há caminho
    executável que o envie. */
export interface CriarComandoInteressadoVenda {
  readonly chaveIdempotencia: string;
  readonly interessado: InteressadoVenda;
}

/* ----------------------------------------------------------------
   ERROS: catálogo fechado
   ---------------------------------------------------------------- */

/** Os de B2 são reaproveitados com o mesmo significado e SQLSTATE; os
    demais são novos e não têm sinônimo no catálogo B2. O envelope de erro
    proposto para o B3.2 é o mesmo do B2 (`contrato: "vendas-b2-v1"`). */
export const ERROS_INTERESSADO_VENDA = {
  "estrutura-invalida": { estado: "PT422", origem: "b2", mensagem: "Comando fora do contrato." },
  "contato-invalido": { estado: "PT422", origem: "b2", mensagem: "Contato não disponível para esta operação." },
  "conflito-transitorio": { estado: "PT503", origem: "b2", mensagem: "Operação interrompida; repita o mesmo comando." },
  "nome-invalido": { estado: "PT422", origem: "b3", mensagem: "Informe o nome do interessado." },
  "telefone-invalido": { estado: "PT422", origem: "b3", mensagem: "Telefone inválido." },
  "contato-fundido": { estado: "PT422", origem: "b3", mensagem: "Este contato foi unificado a outro." },
  "contato-anonimizado": { estado: "PT422", origem: "b3", mensagem: "Este contato não pode mais ser usado." },
  "telefone-ja-cadastrado": { estado: "PT409", origem: "b3", mensagem: "Este telefone já pertence a um contato seu." },
  "telefone-em-revisao": { estado: "PT409", origem: "b3", mensagem: "Este telefone está em revisão em Contatos." },
  "interessado-ambiguo": { estado: "PT409", origem: "b3", mensagem: "Mais de um contato corresponde; escolha um." },
  "interessado-indisponivel": { estado: "PT409", origem: "b3", mensagem: "O contato deste telefone não pode ser usado." },
} as const satisfies Record<string, { estado: "PT409" | "PT422" | "PT503"; origem: "b2" | "b3"; mensagem: string }>;
export type CodigoErroInteressadoVenda = keyof typeof ERROS_INTERESSADO_VENDA;
export interface FalhaInteressadoVenda { readonly ok: false; readonly codigo: CodigoErroInteressadoVenda }
const falha = (codigo: CodigoErroInteressadoVenda): FalhaInteressadoVenda => ({ ok: false, codigo });

/** Violação do contrato por quem chama (ex.: dado de outra conta na
    entrada). Não é resposta ao usuário: é defeito, e a decisão não sai. */
export class EntradaInteressadoInvalida extends Error {
  constructor(motivo: string) { super("Entrada de interessado fora do contrato: " + motivo); this.name = "EntradaInteressadoInvalida"; }
}

/* ----------------------------------------------------------------
   VALIDAÇÃO DO PAYLOAD (objeto fechado)
   ---------------------------------------------------------------- */

/** Mesmo formato aceito por `private.vendas_b2_uuid`. */
const UUID = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;
/** `char_length` do Postgres conta pontos de código, não unidades UTF-16. */
const caracteres = (texto: string) => [...texto].length;

function objetoSimples(valor: unknown): valor is Record<string, unknown> {
  if (typeof valor !== "object" || valor === null || Array.isArray(valor)) return false;
  const prototipo = Object.getPrototypeOf(valor);
  return prototipo === Object.prototype || prototipo === null;
}
function chavesExatas(valor: Record<string, unknown>, chaves: readonly string[]): boolean {
  const presentes = Object.keys(valor);
  return presentes.length === chaves.length && chaves.every((chave) => Object.hasOwn(valor, chave));
}
function uuid(valor: unknown): string | null {
  return typeof valor === "string" && UUID.test(valor) ? valor.toLowerCase() : null;
}

/** Telefone digitado → forma persistível. `null` é ausência explícita;
    texto vazio, longo demais ou sem forma canônica é telefone inválido. */
export function normalizarTelefoneInteressadoVenda(
  telefone: string,
): { readonly ok: true; readonly digitado: string; readonly canonico: string } | FalhaInteressadoVenda {
  const digitado = telefone.trim();
  if (!digitado || caracteres(digitado) > LIMITE_TELEFONE_INTERESSADO_VENDA) return falha("telefone-invalido");
  const canonico = telefoneCanonico(digitado);
  return canonico ? { ok: true, digitado, canonico } : falha("telefone-invalido");
}

/** Valida `interessado`. Ordem fixa: estrutura → nome → telefone. */
export function validarInteressadoVenda(
  valor: unknown,
): { readonly ok: true; readonly interessado: InteressadoNormalizadoVenda } | FalhaInteressadoVenda {
  if (!objetoSimples(valor)) return falha("estrutura-invalida");
  if (valor.modo === "existente") {
    if (!chavesExatas(valor, ["modo", "contatoId"])) return falha("estrutura-invalida");
    const contatoId = uuid(valor.contatoId);
    return contatoId ? { ok: true, interessado: { modo: "existente", contatoId } } : falha("estrutura-invalida");
  }
  if (valor.modo === "novo") {
    if (!chavesExatas(valor, ["modo", "nome", "telefone"])) return falha("estrutura-invalida");
    if (typeof valor.nome !== "string" || (valor.telefone !== null && typeof valor.telefone !== "string")) {
      return falha("estrutura-invalida");
    }
    const nome = valor.nome.trim();
    if (!nome || caracteres(nome) > LIMITE_NOME_INTERESSADO_VENDA) return falha("nome-invalido");
    if (valor.telefone === null) return { ok: true, interessado: { modo: "novo", nome, telefone: null } };
    const telefone = normalizarTelefoneInteressadoVenda(valor.telefone);
    if (!telefone.ok) return telefone;
    return { ok: true, interessado: { modo: "novo", nome, telefone: { digitado: telefone.digitado, canonico: telefone.canonico } } };
  }
  return falha("estrutura-invalida");
}

/** Lê o comando de `criar` e devolve qual identificação ele usa. Só olha
    `contatoId`/`interessado`; o resto do comando continua sendo do B2. */
export function classificarIdentificacaoCriarVenda(
  comando: unknown,
): { readonly ok: true; readonly identificacao: IdentificacaoCriarVenda } | FalhaInteressadoVenda {
  if (!objetoSimples(comando)) return falha("estrutura-invalida");
  const legado = Object.hasOwn(comando, "contatoId"), novo = Object.hasOwn(comando, "interessado");
  if (legado === novo) return falha("estrutura-invalida");
  if (legado) {
    const contatoId = uuid(comando.contatoId);
    return contatoId ? { ok: true, identificacao: { forma: "legado-b2", contatoId } } : falha("estrutura-invalida");
  }
  const interessado = validarInteressadoVenda(comando.interessado);
  return interessado.ok ? { ok: true, identificacao: { forma: "interessado", interessado: interessado.interessado } } : interessado;
}

/* ----------------------------------------------------------------
   RESOLUÇÃO POR TELEFONE (sobre dados já consultados)
   ---------------------------------------------------------------- */

/** Uma linha de `contatos` no mínimo que a decisão lê. Sem nome: nome não decide. */
export interface ContatoEstadoVenda extends ContatoParaResolucao {
  readonly fundidoEmContatoId: string | null;
  readonly arquivado: boolean;
  readonly anonimizado: boolean;
  /** Existe revisão pendente em `contatos_revisoes` envolvendo a pessoa. */
  readonly revisaoPendente: boolean;
}

/** O que a consulta do B3.2 entrega, já filtrado por `auth.uid()`. */
export interface EntradaResolucaoInteressadoVenda {
  readonly userId: string;
  /** O telefone como digitado; a decisão calcula o canônico. */
  readonly telefone: string;
  /** Números ATIVOS (`desativado_em is null`) com o mesmo canônico. */
  readonly canaisAtivos: readonly { readonly userId: string; readonly contatoId: string }[];
  /** Revisões `telefone-alterado-legado` pendentes cujo `canonico_novo` é este canônico. */
  readonly revisoesTelefone: readonly { readonly userId: string; readonly contatoId: string }[];
  /** Os contatos dos canais e das cadeias de lápide. */
  readonly contatos: readonly ContatoEstadoVenda[];
}

export type AvisoContatoVenda = "contato-arquivado" | "revisao-pendente";

/** União fechada: cada estado carrega só ids e marcas, nunca nome ou telefone. */
export type ResolucaoInteressadoVenda =
  | { readonly status: "telefone-invalido" }
  /** Bloqueia contato novo com este número; os candidatos são as pessoas das revisões. */
  | { readonly status: "em-revisao"; readonly candidatos: readonly [string, ...string[]] }
  | { readonly status: "nao-encontrado" }
  | {
      readonly status: "encontrado";
      /** O sobrevivente, depois de seguir a lápide. */
      readonly contatoId: string;
      readonly seguiuFusao: boolean;
      readonly avisos: readonly AvisoContatoVenda[];
    }
  | { readonly status: "ambiguo"; readonly candidatos: readonly [string, string, ...string[]] }
  | { readonly status: "indisponivel"; readonly motivo: "fusao-invalida" | "contato-anonimizado" };

function avisos(contato: ContatoEstadoVenda): readonly AvisoContatoVenda[] {
  const lista: AvisoContatoVenda[] = [];
  if (contato.arquivado) lista.push("contato-arquivado");
  if (contato.revisaoPendente) lista.push("revisao-pendente");
  return lista;
}
const distintos = (ids: readonly string[]) => [...new Set(ids)].sort();

/**
 * Decisão do B3.0, nesta ordem:
 * telefone inválido → revisão relevante → 0 canais → 1 canal → 2+ canais.
 * Um canal segue a lápide até o sobrevivente; cadeia quebrada, ciclo ou
 * profundidade excedida é `indisponivel`, assim como sobrevivente anonimizado.
 */
export function resolverInteressadoVenda(entrada: EntradaResolucaoInteressadoVenda): ResolucaoInteressadoVenda {
  const linhas = [...entrada.canaisAtivos, ...entrada.revisoesTelefone, ...entrada.contatos];
  if (linhas.some((linha) => linha.userId !== entrada.userId)) throw new EntradaInteressadoInvalida("dado de outra conta");

  const telefone = normalizarTelefoneInteressadoVenda(entrada.telefone);
  if (!telefone.ok) return { status: "telefone-invalido" };

  const [revisao, ...outrasRevisoes] = distintos(entrada.revisoesTelefone.map((r) => r.contatoId));
  if (revisao !== undefined) return { status: "em-revisao", candidatos: [revisao, ...outrasRevisoes] };

  const [canal, segundo, ...demais] = distintos(entrada.canaisAtivos.map((c) => c.contatoId));
  if (canal === undefined) return { status: "nao-encontrado" };
  if (segundo !== undefined) return { status: "ambiguo", candidatos: [canal, segundo, ...demais] };

  const porId = new Map(entrada.contatos.map((c) => [c.id, c] as const));
  const sobrevivente = resolverContatoSobrevivente(canal, entrada.userId, porId);
  if (!sobrevivente.ok) return { status: "indisponivel", motivo: "fusao-invalida" };
  const contato = porId.get(sobrevivente.contatoId)!;
  if (contato.anonimizado) return { status: "indisponivel", motivo: "contato-anonimizado" };
  return { status: "encontrado", contatoId: contato.id, seguiuFusao: sobrevivente.saltos > 0, avisos: avisos(contato) };
}

/* ----------------------------------------------------------------
   DECISÃO NA GRAVAÇÃO (o que o `criar` do B3.2 fará)
   ---------------------------------------------------------------- */

/** Modo existente (e o `contatoId` legado do B2): o id escolhido pelo
    usuário. Outra conta e inexistente dão o MESMO erro; lápide não é
    redirecionada em silêncio; anonimizado é recusado. */
export function avaliarContatoExistenteVenda(
  contatoId: string,
  userId: string,
  contato: ContatoEstadoVenda | null,
): { readonly ok: true; readonly contatoId: string; readonly avisos: readonly AvisoContatoVenda[] } | FalhaInteressadoVenda {
  if (!contato || contato.id !== contatoId || contato.userId !== userId) return falha("contato-invalido");
  if (contato.fundidoEmContatoId) return falha("contato-fundido");
  if (contato.anonimizado) return falha("contato-anonimizado");
  return { ok: true, contatoId, avisos: avisos(contato) };
}

/** Modo novo: sem telefone sempre cria pessoa própria; com telefone, só
    cria quando a resolução refeita na gravação é `nao-encontrado`. Nunca
    reaproveita em silêncio: número já conhecido volta como conflito. */
export function decidirInteressadoNovoVenda(
  interessado: Extract<InteressadoNormalizadoVenda, { modo: "novo" }>,
  resolucao: ResolucaoInteressadoVenda | null,
): { readonly ok: true; readonly acao: "criar-contato" } | FalhaInteressadoVenda {
  if (interessado.telefone === null) {
    if (resolucao !== null) throw new EntradaInteressadoInvalida("resolução sem telefone");
    return { ok: true, acao: "criar-contato" };
  }
  if (resolucao === null) throw new EntradaInteressadoInvalida("telefone sem resolução");
  switch (resolucao.status) {
    case "nao-encontrado": return { ok: true, acao: "criar-contato" };
    case "telefone-invalido": return falha("telefone-invalido");
    case "em-revisao": return falha("telefone-em-revisao");
    case "encontrado": return falha("telefone-ja-cadastrado");
    case "ambiguo": return falha("interessado-ambiguo");
    case "indisponivel": return falha("interessado-indisponivel");
  }
}

/* ----------------------------------------------------------------
   FINGERPRINT (representação canônica para o recibo idempotente)
   ---------------------------------------------------------------- */

export type ArvoreFingerprintVenda = null | boolean | string | number | readonly ArvoreFingerprintVenda[];

/** O primeiro argumento de `criar` na árvore do fingerprint. No legado é a
    string do id, exatamente como no B2; no B3 é uma tupla com o modo, que
    nunca colide com uma string na codificação prefix-free. */
export function argumentoIdentificacaoFingerprintVenda(identificacao: IdentificacaoCriarVenda): ArvoreFingerprintVenda {
  if (identificacao.forma === "legado-b2") return identificacao.contatoId;
  const i = identificacao.interessado;
  return i.modo === "existente" ? ["existente", i.contatoId] : ["novo", i.nome, i.telefone?.canonico ?? null];
}

/** Árvore completa de `criar`, igual à de `private.vendas_b2_fingerprint`.
    Imóvel, origem e valores entram já normalizados pelo B2. */
export function arvoreFingerprintCriarVenda(entrada: {
  readonly usuario: string;
  readonly chaveIdempotencia: string;
  readonly identificacao: IdentificacaoCriarVenda;
  readonly imovel: ArvoreFingerprintVenda;
  readonly origem: ArvoreFingerprintVenda;
  readonly valorNegocioPrevisto: ArvoreFingerprintVenda;
  readonly receitaPrevista: ArvoreFingerprintVenda;
}): ArvoreFingerprintVenda {
  return ["vendas-b2-fingerprint-1", entrada.usuario, entrada.chaveIdempotencia, "criar", null, null, [
    argumentoIdentificacaoFingerprintVenda(entrada.identificacao),
    entrada.imovel, entrada.origem, entrada.valorNegocioPrevisto, entrada.receitaPrevista,
  ]];
}

/** Mesma codificação de `private.vendas_b2_codificar`: tipo + bytes UTF-8 + conteúdo. */
export function codificarArvoreFingerprintVenda(arvore: ArvoreFingerprintVenda): Uint8Array {
  const utf8 = (texto: string) => new TextEncoder().encode(texto);
  const juntar = (partes: readonly Uint8Array[]) => {
    const saida = new Uint8Array(partes.reduce((total, parte) => total + parte.length, 0));
    let posicao = 0;
    for (const parte of partes) { saida.set(parte, posicao); posicao += parte.length; }
    return saida;
  };
  if (arvore === null) return utf8("N");
  if (typeof arvore === "boolean") return utf8(arvore ? "T" : "F");
  if (typeof arvore === "string") { const bytes = utf8(arvore); return juntar([utf8("S" + bytes.length + ":"), bytes]); }
  if (typeof arvore === "number") {
    if (!Number.isSafeInteger(arvore)) throw new EntradaInteressadoInvalida("número fora do fingerprint");
    const bytes = utf8(String(arvore)); return juntar([utf8("D" + bytes.length + ":"), bytes]);
  }
  return juntar([utf8("A" + arvore.length + ":"), ...arvore.map(codificarArvoreFingerprintVenda)]);
}
