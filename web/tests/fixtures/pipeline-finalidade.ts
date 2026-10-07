import type { Imovel } from "@/lib/tipos";

// Carteira sintética independente do oráculo legado e de qualquer banco.
const comum = {
  bairro: "Centro", cidade: "Londrina", tipo: "Casa", responsavel: "Ana",
  status: "Novo contato", dataAngariacao: "2026-10-07", statusHistory: [],
  proprietarioNome: "Contato de teste", proprietarioTelefone: "", valorAluguel: 1500.5,
};
export const CARTEIRA_FINALIDADE = [
  { ...comum, id: "alugar", codigo: "IV-L", endereco: "Rua Locação, 1", finalidade: "locacao" },
  { ...comum, id: "vender", codigo: "IV-V", endereco: "Rua José, 2", finalidade: "venda", valorVenda: 450000.55 },
  { ...comum, id: "ambos", codigo: "IV-A", endereco: "Rua Dupla, 3", finalidade: "locacao_venda", valorVenda: 500000 },
  { ...comum, id: "nulo", codigo: "IV-N", endereco: "Rua Legado, 4", finalidade: null },
  { ...comum, id: "ausente", codigo: "IV-U", endereco: "Rua Antiga, 5" },
] as Imovel[];
export const RETIRADOS_FINALIDADE = CARTEIRA_FINALIDADE.map((i) => ({
  ...i, id: "r-" + i.id, codigo: "R-" + i.codigo, retirado: true,
}));
