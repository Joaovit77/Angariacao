import type { ImovelCandidatoVenda } from "@/lib/persistencia/vendasImoveisLeitura";

export const CONTA_CANDIDATOS = "11111111-1111-4111-8111-111111111111";
export const OUTRA_CONTA_CANDIDATOS = "22222222-2222-4222-8222-222222222222";
export const idCandidato = (numero: number) => `33333333-3333-4333-8333-${String(numero).padStart(12, "0")}`;
export function linhaCandidato(extra: Record<string, unknown> = {}) {
  return {
    id: idCandidato(1), codigo: "VD-01", referencia_crm: "CRM-01", endereco: "Rua das Palmeiras, 100",
    bairro: "Centro", cidade: "Curitiba", estado: "PR", unidade: "301", bloco: "A",
    finalidade: "venda", status: "Publicado", retirado: false, valor_venda: 450000.55,
    ...extra,
  };
}
export function candidatosSinteticos() {
  return [
    linhaCandidato(),
    linhaCandidato({ id: idCandidato(2), codigo: "VD-02", endereco: "Avenida Brasil, 500", finalidade: "locacao_venda", status: "Locado", valor_venda: 600000 }),
    linhaCandidato({ id: idCandidato(3), codigo: "LC-03", endereco: "Rua do Comércio, 30", finalidade: "locacao", valor_venda: null }),
    linhaCandidato({ id: idCandidato(4), codigo: "LG-04", endereco: "Rua São João, 40", finalidade: null, valor_venda: null }),
    linhaCandidato({ id: idCandidato(5), codigo: "RT-05", endereco: "Rua dos Ipês, 50", retirado: true, valor_venda: 0 }),
    linhaCandidato({ id: idCandidato(6), codigo: "PD-06", endereco: "Rua das Flores, 60", status: "Perdido", valor_venda: null }),
    linhaCandidato({ id: idCandidato(7), codigo: "VD-07", endereco: "Rua do Lago, 70", finalidade: "venda", status: "Locado", valor_venda: null }),
  ];
}
/** Dados sintéticos de apresentação do harness, sem cliente ou acesso ao banco. */
export function imoveisSinteticosVenda(): readonly ImovelCandidatoVenda[] {
  return candidatosSinteticos().map((r) => ({
    id: r.id, codigo: r.codigo, referenciaCrm: r.referencia_crm, endereco: r.endereco,
    bairro: r.bairro, cidade: r.cidade, estado: r.estado, unidade: r.unidade, bloco: r.bloco,
    finalidade: r.finalidade, status: r.status, retirado: r.retirado, valorVenda: r.valor_venda,
  })) as readonly ImovelCandidatoVenda[];
}
