import { classificarIdentificacaoCriarVenda, type InteressadoVenda } from "@/lib/persistencia/vendasInteressado";
import type { CodigoErroVenda, ComandosVenda } from "@/lib/persistencia/vendasComandos";
import { ORIGENS_COMERCIAIS_VENDA, type OrigemComercialVenda } from "@/lib/vendas/tipos";
import type { ContatoCandidatoVenda } from "@/lib/persistencia/vendasContatosLeitura";

export interface RascunhoCriacaoVenda {
  modo: "existente" | "novo"; contatoId: string; nome: string; telefone: string;
  origem: "" | OrigemComercialVenda["tipo"]; descricaoOrigem: string;
  valor: string; receita: string;
}
export const RASCUNHO_CRIACAO_VENDA: RascunhoCriacaoVenda = {
  modo: "existente", contatoId: "", nome: "", telefone: "", origem: "", descricaoOrigem: "", valor: "", receita: "",
};
export type CampoCriacaoVenda = "contatoId" | "nome" | "telefone" | "origem" | "valor" | "receita";
export type ValidacaoCriacaoVenda =
  | { ok: true; dados: Omit<ComandosVenda["criar"], "chaveIdempotencia" | "contatoId" | "imovelTratado"> & { interessado: InteressadoVenda } }
  | { ok: false; campo: CampoCriacaoVenda; mensagem: string };

/** Decimal digitado em pt-BR ou com ponto; vazio é ausência, nunca zero implícito. */
export function valorDigitadoVenda(texto: string): number | null | undefined {
  const valor = texto.trim();
  if (!valor) return null;
  if (!/^\d+(?:[.,]\d+)?$/.test(valor)) return undefined;
  const numero = Number(valor.replace(",", "."));
  return Number.isFinite(numero) && numero >= 0 ? numero : undefined;
}
export function validarRascunhoCriacaoVenda(r: RascunhoCriacaoVenda): ValidacaoCriacaoVenda {
  if (r.modo === "existente" && !r.contatoId) return { ok: false, campo: "contatoId", mensagem: "Escolha um contato existente." };
  const interessado: InteressadoVenda = r.modo === "existente"
    ? { modo: "existente", contatoId: r.contatoId }
    : { modo: "novo", nome: r.nome.trim(), telefone: r.telefone.trim() || null };
  const validacao = classificarIdentificacaoCriarVenda({ interessado });
  if (!validacao.ok) {
    const campo = r.modo === "existente" ? "contatoId" : validacao.codigo === "telefone-invalido" ? "telefone" : "nome";
    return { ok: false, campo, mensagem: campo === "telefone" ? "Informe um telefone brasileiro válido ou deixe em branco." : campo === "nome" ? "Informe um nome com até 200 caracteres." : "Escolha um contato válido." };
  }
  if (r.origem && !ORIGENS_COMERCIAIS_VENDA.includes(r.origem)) return { ok: false, campo: "origem", mensagem: "Escolha uma origem comercial válida." };
  const valor = valorDigitadoVenda(r.valor), receita = valorDigitadoVenda(r.receita);
  if (valor === undefined) return { ok: false, campo: "valor", mensagem: "Informe um valor não negativo, sem separador de milhares." };
  if (receita === undefined) return { ok: false, campo: "receita", mensagem: "Informe uma receita não negativa, sem separador de milhares." };
  return { ok: true, dados: { interessado, origem: r.origem ? { tipo: r.origem, descricao: r.descricaoOrigem.trim() || null } : null, valorNegocioPrevisto: valor, receitaPrevista: receita } };
}
export function filtrarContatosVenda(contatos: readonly ContatoCandidatoVenda[], busca: string): readonly ContatoCandidatoVenda[] {
  const normalizar = (v: string) => v.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase("pt-BR").trim();
  const termo = normalizar(busca), digitos = busca.replace(/\D/g, "");
  return contatos.filter((c) => normalizar(c.nome).includes(termo) || (digitos.length > 0 && c.telefones.some((t) => t.replace(/\D/g, "").includes(digitos))));
}
/** Pedido de sessão é dado não confiável: recusa corrupção e campos de outras fatias. */
export function validarPedidoPendenteVenda(entrada: unknown): entrada is ComandosVenda["criar"] & { interessado: InteressadoVenda } {
  if (!entrada || typeof entrada !== "object" || Array.isArray(entrada)) return false;
  const c = entrada as Record<string, unknown>;
  const permitidas = ["chaveIdempotencia", "interessado", "origem", "valorNegocioPrevisto", "receitaPrevista"];
  if (Object.keys(c).some((k) => !permitidas.includes(k)) ||
      typeof c.chaveIdempotencia !== "string" || !/^[0-9a-f-]{36}$/i.test(c.chaveIdempotencia) ||
      !classificarIdentificacaoCriarVenda({ interessado: c.interessado }).ok) return false;
  for (const campo of ["valorNegocioPrevisto", "receitaPrevista"]) {
    const v = c[campo];
    if (v !== null && v !== undefined && (typeof v !== "number" || !Number.isFinite(v) || v < 0)) return false;
  }
  if (c.origem !== null && c.origem !== undefined) {
    if (typeof c.origem !== "object" || Array.isArray(c.origem)) return false;
    const o = c.origem as Record<string, unknown>;
    if (Object.keys(o).some((k) => k !== "tipo" && k !== "descricao") ||
        !ORIGENS_COMERCIAIS_VENDA.includes(o.tipo as OrigemComercialVenda["tipo"]) ||
        (o.descricao !== null && o.descricao !== undefined && typeof o.descricao !== "string")) return false;
  }
  return true;
}
export const ROTULOS_ORIGEM_CRIACAO_VENDA: Record<OrigemComercialVenda["tipo"], string> = {
  indicacao: "Indicação", portal: "Portal", whatsapp: "WhatsApp", telefone: "Telefone", formulario: "Formulário", atendimento_presencial: "Atendimento presencial", outro: "Outro",
};
export const ERROS_CRIACAO_VENDA: Partial<Record<CodigoErroVenda, string>> = {
  "estrutura-invalida": "Revise os dados da oportunidade.", "nome-invalido": "Informe um nome com até 200 caracteres.",
  "telefone-invalido": "Informe um telefone brasileiro válido ou deixe em branco.", "origem-invalida": "Escolha uma origem comercial válida.",
  "valor-invalido": "Revise os valores informados.", "nao-autenticado": "Sua sessão expirou. Entre novamente antes de continuar.",
  "contato-invalido": "Este contato não está disponível. Atualize a lista e escolha novamente.",
  "contato-fundido": "Este contato foi unificado. Atualize a lista e escolha o contato atual.",
  "contato-anonimizado": "Este contato não pode ser usado. Escolha outro contato.",
  "telefone-ja-cadastrado": "Este telefone já pertence a um contato seu. Escolha a opção Contato existente e selecione a pessoa.",
  "telefone-em-revisao": "Este telefone está em revisão. Resolva a revisão antes de cadastrar uma nova pessoa com ele.",
  "interessado-ambiguo": "Há mais de um contato associado. Escolha a pessoa em Contato existente.",
  "interessado-indisponivel": "O contato associado a este telefone não pode ser usado. Revise a identificação.",
  "chave-idempotencia-conflitante": "Este pedido está associado a outros dados. Não inicie outra criação antes de esclarecer o resultado.",
  "conflito-transitorio": "A operação foi interrompida. Tente novamente com os mesmos dados.",
  "transporte-indisponivel": "Não foi possível confirmar o resultado. A oportunidade pode ter sido criada. Verifique repetindo este mesmo pedido.",
  "resposta-invalida": "Não foi possível confirmar a resposta. A oportunidade pode ter sido criada. Verifique repetindo este mesmo pedido.",
  "falha-interna": "Não foi possível concluir a criação. Tente novamente em alguns instantes.",
  "dado-persistido-invalido": "Não foi possível confirmar os dados retornados. Verifique repetindo este mesmo pedido.",
};
