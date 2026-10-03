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
import { MOTIVOS_RETIRADA, ROTULO_MOTIVO_RETIRADA_DESCONHECIDO, type MotivoRetirada } from "../constantes";
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

/* ----------------------------------------------------------------
   DADOS DA RETIRADA (Retirados, Fase C / C2)

   Quando e por que o imóvel saiu da carteira: as três colunas do C1
   (`retirado_em`, `retirado_motivo`, `retirado_observacao`). As regras
   abaixo são as mesmas que o banco impõe (lista fechada, "outro" exige
   observação, observação até 1000 caracteres), para a tela recusar antes
   e explicar; o banco continua sendo a última barreira.

   `null` é "não informado", nunca um valor inventado: uma retirada
   antiga editada sem data conhecida continua sem data (decisão D5A).
   ---------------------------------------------------------------- */
export const LIMITE_OBSERVACAO_RETIRADA = 1000;

export type ModoRetirada = "criar" | "editar";

/** O que a janela de retirada grava. `data` null só existe na edição. */
export interface DadosRetirada {
  motivo: MotivoRetirada | null;
  observacao: string | null;
  data: string | null;
}

/** Os dados de uma retirada nova: motivo e data são obrigatórios. */
export interface DadosNovaRetirada extends DadosRetirada {
  motivo: MotivoRetirada;
  data: string;
}

export type ValidacaoRetirada =
  | { ok: true; dados: DadosRetirada }
  | { ok: false; erro: string };

export function ehMotivoRetirada(valor: unknown): valor is MotivoRetirada {
  return MOTIVOS_RETIRADA.some((m) => m.id === valor);
}

/** O rótulo do motivo; `null` ou valor desconhecido viram "Não informado". */
export function rotuloMotivoRetirada(motivo: string | null | undefined): string {
  return MOTIVOS_RETIRADA.find((m) => m.id === motivo)?.rotulo ?? ROTULO_MOTIVO_RETIRADA_DESCONHECIDO;
}

/** Tamanho como o Postgres conta (`char_length`): caractere, não unidade
    UTF-16. Um emoji conta um, como no banco. */
export function tamanhoObservacaoRetirada(texto: string): number {
  return [...texto].length;
}

/** AAAA-MM-DD que existe no calendário, conferido por aritmética (sem `Date`,
    que leria fuso). */
function dataCivilValida(data: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data)) return false;
  const [ano, mes, dia] = data.split("-").map(Number);
  const bissexto = (ano % 4 === 0 && ano % 100 !== 0) || ano % 400 === 0;
  const diasNoMes = [31, bissexto ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return mes >= 1 && mes <= 12 && dia >= 1 && dia <= diasNoMes[mes - 1];
}

/**
 * Confere o que a janela vai gravar. `hoje` é o dia civil de Brasília
 * (`dataOperacionalDeTimestamp`), nunca o `todayISO()` em UTC: depois das
 * 21h ele já é amanhã e deixaria passar uma data futura.
 *
 * Criar: motivo e data obrigatórios. Editar: os dois podem ficar sem valor
 * (retirada antiga cujo motivo ou data ninguém sabe).
 */
export function validarRetirada(
  entrada: { motivo: string; observacao: string; data: string },
  modo: ModoRetirada,
  hoje: string,
): ValidacaoRetirada {
  const motivoCru = entrada.motivo.trim();
  if (motivoCru !== "" && !ehMotivoRetirada(motivoCru)) return { ok: false, erro: "Escolha um motivo da lista." };
  const motivo = motivoCru === "" ? null : (motivoCru as MotivoRetirada);
  if (modo === "criar" && motivo === null) return { ok: false, erro: "Escolha o motivo da retirada." };

  const observacao = entrada.observacao.trim() === "" ? null : entrada.observacao.trim();
  if (observacao !== null && tamanhoObservacaoRetirada(observacao) > LIMITE_OBSERVACAO_RETIRADA) {
    return { ok: false, erro: `A observação passa de ${LIMITE_OBSERVACAO_RETIRADA} caracteres.` };
  }
  if (motivo === "outro" && observacao === null) {
    return { ok: false, erro: "Com o motivo \"Outro\", descreva o que aconteceu na observação." };
  }

  const dataCrua = entrada.data.trim();
  if (dataCrua === "") {
    if (modo === "criar") return { ok: false, erro: "Informe a data da retirada." };
    return { ok: true, dados: { motivo, observacao, data: null } };
  }
  if (!dataCivilValida(dataCrua)) return { ok: false, erro: "Data da retirada inválida." };
  if (dataCrua > hoje) return { ok: false, erro: "A data da retirada não pode ser no futuro." };
  return { ok: true, dados: { motivo, observacao, data: dataCrua } };
}

/** "2026-10-01" → "01/10/2026", sem passar por `Date` (que leria meia-noite
    UTC e mostraria o dia anterior em Brasília). */
export function formatarDataRetirada(data: string | null | undefined): string | null {
  if (!data || !dataCivilValida(data)) return null;
  const [ano, mes, dia] = data.split("-");
  return `${dia}/${mes}/${ano}`;
}

/** A linha que o aviso do imóvel e o drawer mostram. Nada é inventado: o que
    falta aparece como "não informado". */
export function resumoRetirada(imovel: Pick<Imovel, "retiradoEm" | "retiradoMotivo">): string {
  const data = formatarDataRetirada(imovel.retiradoEm);
  const temMotivo = ehMotivoRetirada(imovel.retiradoMotivo);
  if (!data && !temMotivo) return "Data e motivo não informados.";
  const parteData = data ? `Retirado em ${data}` : "Data não informada";
  const parteMotivo = temMotivo ? `Motivo: ${rotuloMotivoRetirada(imovel.retiradoMotivo)}` : "Motivo não informado";
  return `${parteData} · ${parteMotivo}`;
}

/** Texto da nota no histórico de interações quando o imóvel é retirado. */
export function textoNotaRetirada(dados: DadosNovaRetirada): string {
  const partes = [
    `Retirado da carteira em ${formatarDataRetirada(dados.data)}.`,
    `Motivo: ${rotuloMotivoRetirada(dados.motivo)}.`,
  ];
  if (dados.observacao) partes.push(`Observação: ${dados.observacao}`);
  return partes.join(" ");
}

/** Texto da nota quando o imóvel volta à carteira. A retirada encerrada fica
    registrada aqui, porque o banco apaga os três campos ao reativar. */
export function textoNotaReativacao(imovel: Pick<Imovel, "retiradoEm" | "retiradoMotivo" | "retiradoObservacao">): string {
  const data = formatarDataRetirada(imovel.retiradoEm);
  const quando = data ? `de ${data}` : "sem data informada";
  const partes = [`Reativado na carteira. Retirada encerrada (${quando}; motivo: ${rotuloMotivoRetirada(imovel.retiradoMotivo)}).`];
  if (imovel.retiradoObservacao) partes.push(`Observação da retirada: ${imovel.retiradoObservacao}`);
  return partes.join(" ");
}
