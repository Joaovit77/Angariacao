/* ================================================================
   RETIRAR DA CARTEIRA (Imovel.retirado)

   `retirado` não é status: é a marca de um imóvel cuja captação foi
   GANHA e que depois saiu da carteira. "Perdido" diz que a captação
   falhou; "Locado" diz que a imobiliária locou. A retirada não mexe em
   nenhum dos dois, nem no statusHistory (ver `filtros.ts` e o PROJECT.md).

   Aqui mora só a pergunta "a ação pode ser oferecida?", montada com as
   regras que já existem, sem heurística nova de histórico:

   - `captacaoGanha` (motor) diz se a captação foi ganha;
   - `DISPONIBILIDADE_STATUS_ALVO` (followup) é o público "captado e sem
     locar", o mesmo que o banco usa para a disponibilidade.

   Os dois juntos bloqueiam, de propósito, os casos ambíguos:
   - lead que nunca foi captado (a saída dele é "Perdido");
   - "Locado" (retirar não desfaz locação);
   - "Perdido", "Cancelado" e "Sem resposta" mesmo com Angariado no
     histórico: são registros encerrados por outro caminho, e decidir se
     eram retiradas é reparo de dados à parte;
   - imóvel que voltou a uma etapa anterior à captação.
   ================================================================ */
import { DISPONIBILIDADE_STATUS_ALVO } from "./followup";
import { captacaoGanha } from "./motor";
import type { Imovel } from "../tipos";

/** A ação "Retirar da carteira" pode ser oferecida para este imóvel? */
export function podeRetirarDaCarteira(imovel: Imovel): boolean {
  if (imovel.retirado === true) return false;
  const alvo: readonly string[] = DISPONIBILIDADE_STATUS_ALVO;
  return alvo.includes(imovel.status) && captacaoGanha(imovel);
}

/** A ação "Reativar imóvel" pode ser oferecida? Só desfaz a marca. */
export function podeReativarNaCarteira(imovel: Imovel): boolean {
  return imovel.retirado === true;
}
