import type { Imovel } from "@/lib/tipos";
import type { ContextoAtendimento } from "./contratos";

/** Somente fatos tipados. Observações e anúncio ficam fora porque são texto livre. */
export function contextoAtendimentoDoImovel(imovel: Imovel): ContextoAtendimento {
  const primeiroNome = (imovel.proprietarioNome || "").trim().split(/\s+/)[0] || "";
  const fatos = [
    imovel.endereco ? `endereco: ${imovel.endereco}` : "",
    imovel.unidade ? `unidade: ${imovel.unidade}` : "",
    imovel.bloco ? `bloco: ${imovel.bloco}` : "",
    imovel.edificio ? `edificio ou condominio: ${imovel.edificio}` : "",
    imovel.bairro ? `bairro: ${imovel.bairro}` : "",
    imovel.cidade ? `cidade: ${imovel.cidade}` : "",
    imovel.estado ? `estado: ${imovel.estado}` : "",
    imovel.tipo ? `tipo: ${imovel.tipo}` : "",
    typeof imovel.quartos === "number" && imovel.quartos > 0 ? `quartos: ${imovel.quartos}` : "",
    typeof imovel.banheiros === "number" && imovel.banheiros > 0 ? `banheiros: ${imovel.banheiros}` : "",
    typeof imovel.vagas === "number" && imovel.vagas > 0 ? `vagas: ${imovel.vagas}` : "",
    typeof imovel.valorAluguel === "number" && imovel.valorAluguel > 0
      ? `aluguel informado: R$ ${imovel.valorAluguel.toFixed(2)}`
      : "",
    typeof imovel.valorCondominio === "number" && imovel.valorCondominio > 0
      ? `condominio informado: R$ ${imovel.valorCondominio.toFixed(2)}`
      : "",
  ].filter(Boolean);

  return {
    proprietario: primeiroNome,
    fatosImovel: fatos,
    estagio: (imovel.status || "").trim(),
  };
}
