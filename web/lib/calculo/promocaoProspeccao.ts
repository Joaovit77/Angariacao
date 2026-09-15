/* ================================================================
   PROMOÇÃO — o que o Garimpo entrega ao Pipeline, e nada além (V7 §13)

   Núcleo puro: decide o que pode ser promovido, o que vai pré-preenchido
   no ModalImovel e quais oportunidades do Pipeline são elegíveis para
   concluir um vínculo pendente. Não escreve, não lê banco, não conhece
   React. Quem promove é o humano, no ModalImovel; quem grava o vínculo é
   a RPC `vincular_promocao_imovel_identificado`. Nenhuma função daqui
   cria nada.
   ================================================================ */
import type { Imovel } from "@/lib/tipos";
import { ORIGENS_IMOVEL } from "@/lib/constantes";
import { chaveImovel } from "./duplicidade";
import type { SituacaoImovelIdentificado, TipoImovelProspeccao } from "./prospeccao";

export type OrigemImovelPipeline = (typeof ORIGENS_IMOVEL)[number];

/** As duas origens que `origem_identificacao` admite (CHECK do C2a), cada
    uma mapeada para um rótulo que JÁ existe em `ORIGENS_IMOVEL`. O
    `planoDia` e o ranking de canais pulam imóvel sem origem; inventar
    rótulo novo os deixaria de fora do mesmo jeito. */
export const ORIGEM_IMOVEL_POR_IDENTIFICACAO = {
  campo: "Prospecção ativa (porta a porta)",
  placa: "Placa no imóvel",
} as const satisfies Record<"campo" | "placa", OrigemImovelPipeline>;

export type OrigemIdentificacaoPromovivel = keyof typeof ORIGEM_IMOVEL_POR_IDENTIFICACAO;

export function origemImovelDaIdentificacao(
  origem: OrigemIdentificacaoPromovivel,
): OrigemImovelPipeline {
  return ORIGEM_IMOVEL_POR_IDENTIFICACAO[origem];
}

/** O recorte do identificado que a promoção lê. Endereço, unidade, bloco,
    edifício, bairro, cidade, UF, tipo e origem — o que o `Imovel` entende. */
export interface IdentificadoParaPromocao {
  situacao: SituacaoImovelIdentificado;
  exclusaoSolicitadaEm: string | null;
  logradouro: string | null;
  numero: string | null;
  unidade: string | null;
  bloco: string | null;
  edificio: string | null;
  bairro: string | null;
  cidade: string | null;
  estado: string | null;
  tipo: TipoImovelProspeccao | null;
  origemIdentificacao: OrigemIdentificacaoPromovivel;
  enderecoChave: string;
}

/** Só o texto da PASSAGEM CORRENTE vai ao modal — não o histórico inteiro. */
export interface PassagemParaPromocao {
  observacao: string;
}

/** Valores iniciais do ModalImovel. Fotos, etiquetas, classificações e
    datas de observação NÃO entram: continuam do lado do Garimpo, acessíveis
    pelo vínculo. Nada aqui é dado pessoal — o proprietário e o telefone
    são digitados pelo humano dentro do modal. */
export interface PreenchimentoPromocao {
  endereco: string;
  unidade: string;
  bloco: string;
  edificio: string;
  bairro: string;
  cidade: string;
  estado: string;
  tipo: TipoImovelProspeccao | null;
  origemImovel: OrigemImovelPipeline;
  observacoes: string;
}

function texto(valor: string | null | undefined): string {
  return (valor ?? "").trim();
}

/** Só `identificado` e `investigando` promovem. `promovendo` já está a
    caminho (a recuperação é outra ação), `promovido` já foi, `descartado`
    e `fundido` não são oportunidade, e exclusão pendente bloqueia tudo
    (§13.4). A RPC revalida; aqui é só a antecipação para a tela. */
export function podePromoverIdentificado(
  identificado: Pick<IdentificadoParaPromocao, "situacao" | "exclusaoSolicitadaEm">,
): boolean {
  return !identificado.exclusaoSolicitadaEm
    && (identificado.situacao === "identificado" || identificado.situacao === "investigando");
}

/** `promovendo` = oportunidade criada (ou a caminho), vínculo pendente. É o
    ÚNICO estado em que a tela oferece concluir o vínculo — e nunca
    oferece criar outra oportunidade. */
export function precisaConcluirVinculo(
  identificado: Pick<IdentificadoParaPromocao, "situacao" | "exclusaoSolicitadaEm">,
): boolean {
  return !identificado.exclusaoSolicitadaEm && identificado.situacao === "promovendo";
}

export function preenchimentoDaPromocao(
  identificado: Omit<IdentificadoParaPromocao, "situacao" | "exclusaoSolicitadaEm" | "enderecoChave">,
  passagemCorrente: PassagemParaPromocao | null,
): PreenchimentoPromocao {
  const endereco = [texto(identificado.logradouro), texto(identificado.numero)]
    .filter(Boolean)
    .join(", ");
  return {
    endereco,
    unidade: texto(identificado.unidade),
    bloco: texto(identificado.bloco),
    edificio: texto(identificado.edificio),
    bairro: texto(identificado.bairro),
    cidade: texto(identificado.cidade),
    estado: texto(identificado.estado).toUpperCase(),
    tipo: identificado.tipo,
    origemImovel: origemImovelDaIdentificacao(identificado.origemIdentificacao),
    observacoes: texto(passagemCorrente?.observacao),
  };
}

/** O que a recuperação mostra de cada oportunidade candidata. */
export type OportunidadeCandidata = Pick<
  Imovel,
  "id" | "codigo" | "endereco" | "unidade" | "bloco" | "edificio" | "bairro" | "cidade" | "status" | "dataAngariacao"
>;

/** Depois de recarregar a aba, o id transitório da sessão não existe mais.
    Elegíveis são os `Imovel` do usuário (a carteira já chega filtrada por
    RLS) que NÃO estão vinculados a nenhum identificado e que têm a mesma
    chave de endereço deste registro, do mais recente para o mais antigo.
    Sem chave (registro sem endereço) não há como afirmar correspondência:
    lista vazia, e o humano decide o que fazer. NUNCA escolhe por ele. */
export function oportunidadesElegiveisParaVinculo<T extends OportunidadeCandidata>(
  carteira: readonly T[],
  imoveisJaVinculados: ReadonlySet<string>,
  identificado: Pick<IdentificadoParaPromocao, "enderecoChave">,
): T[] {
  const chave = identificado.enderecoChave;
  if (!chave) return [];
  return carteira
    .filter((imovel) => !imoveisJaVinculados.has(imovel.id))
    .filter((imovel) => chaveImovel(imovel) === chave)
    .map((imovel, ordem) => ({ imovel, ordem }))
    .sort((a, b) =>
      (b.imovel.dataAngariacao ?? "").localeCompare(a.imovel.dataAngariacao ?? "")
      || a.ordem - b.ordem)
    .map(({ imovel }) => imovel);
}
