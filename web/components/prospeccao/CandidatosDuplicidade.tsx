"use client";

/* ================================================================
   POSSÍVEIS DUPLICATAS (C7) — a dedupe avisa, nunca bloqueia nem promove.
   A união (C7b) exige escolha e confirmação no diálogo próprio.

   Quatro camadas, na ordem de autoridade do núcleo puro: unidade veta;
   identidade textual; proximidade com a incerteza declarada; carteira.
   Cada linha diz POR QUE foi sugerida, com os números que produziram o
   veredito. "É o mesmo" abre o diálogo; não chama a RPC neste card.
   "São diferentes" ainda não tem onde ser guardado (Fase 2).

   A carteira é lida do store central — só lida; nada aqui escreve em
   `imoveis`, e é por isso que este arquivo, e não os cinco do C4, é o
   único do módulo que o importa.
   ================================================================ */
import { useEffect, useState } from "react";

import {
  descreverResultadoDedupe,
  duplicatasDoIdentificadoNaCarteira,
  geografiaOpina,
  ROTULO_GRAU_DUPLICIDADE,
  type IdentidadeParaDedupe,
} from "@/lib/calculo/dedupeProspeccao";
import { descreverDuplicados } from "@/lib/calculo/duplicidade";
import { obterEtiquetaCatalogo } from "@/lib/calculo/catalogoEtiquetas";
import { derivarEtiquetasProspeccao } from "@/lib/calculo/etiquetasProspeccao";
import type { SituacaoImovelIdentificado } from "@/lib/calculo/prospeccao";
import { fmtDataHoraIso, todayISO } from "@/lib/datas";
import { useAppStore } from "@/lib/store";
import { identidadeParaDedupe, podeFundirIdentificado, type ImovelIdentificado } from "@/lib/prospeccao";
import { useProspeccao, type DuplicataEncontrada } from "@/lib/useProspeccao";

import DialogoFundirIdentificados from "./DialogoFundirIdentificados";
import styles from "./Prospeccao.module.css";

const ATRASO_CONSULTA_MS = 400;

/** Etiquetas derivadas que esta seção explica. O resto do catálogo derivado
    não é assunto de dedupe. */
const CODIGOS_DA_DEDUPE = new Set([
  "possivel-duplicata",
  "ja-na-carteira",
  "coordenada-imprecisa",
  "unidade-desconhecida",
]);

function enderecoCurto(identificado: ImovelIdentificado): string {
  const rua = [identificado.logradouro, identificado.numero].filter(Boolean).join(", ");
  const complemento = [identificado.unidade && `un. ${identificado.unidade}`, identificado.bloco && `bl. ${identificado.bloco}`]
    .filter(Boolean)
    .join(" ");
  return [rua || identificado.pontoReferencia || "Local sem endereço", complemento].filter(Boolean).join(" · ");
}

export default function CandidatosDuplicidade({
  alvo,
  identificado,
  fotosIdentificado,
  situacao = "identificado",
  avistamentosTotal = 0,
  titulo = "Pode ser o mesmo que…",
}: {
  alvo: IdentidadeParaDedupe;
  /** Ausente no rascunho de local novo: ainda não existem duas identidades. */
  identificado?: ImovelIdentificado;
  fotosIdentificado?: number;
  situacao?: SituacaoImovelIdentificado;
  avistamentosTotal?: number;
  titulo?: string;
}) {
  const buscarDuplicatas = useProspeccao((estado) => estado.buscarDuplicatas);
  const carteira = useAppStore((estado) => estado.imoveis);
  const revisaoFusao = useProspeccao((estado) => estado.revisaoFusao) ?? 0;
  const salvando = useProspeccao((estado) => estado.salvando);
  const carregando = useProspeccao((estado) => estado.carregando);
  const [candidatoParaUnir, setCandidatoParaUnir] = useState<ImovelIdentificado | null>(null);
  const [consulta, setConsulta] = useState<{
    chave: string; revisao: number; duplicatas: DuplicataEncontrada[] | null;
  } | null>(null);

  // Mesma entrada ⇒ mesma consulta; a chave evita repetir a cada render, e o
  // atraso evita consultar a cada letra digitada no modal.
  const chave = JSON.stringify(alvo);
  // Uma resposta do alvo anterior nunca pode oferecer uma união no alvo novo.
  const consultaAtual = consulta?.chave === chave && consulta.revisao === revisaoFusao ? consulta : null;
  const duplicatas = consultaAtual ? consultaAtual.duplicatas ?? [] : null;
  const indisponivel = consultaAtual?.duplicatas === null;
  useEffect(() => {
    let cancelado = false;
    const temporizador = setTimeout(() => {
      void buscarDuplicatas(JSON.parse(chave) as IdentidadeParaDedupe).then((encontradas) => {
        if (cancelado) return;
        setConsulta({ chave, revisao: revisaoFusao, duplicatas: encontradas });
      });
    }, ATRASO_CONSULTA_MS);
    return () => { cancelado = true; clearTimeout(temporizador); };
  }, [buscarDuplicatas, chave, revisaoFusao]);

  const naCarteira = duplicatasDoIdentificadoNaCarteira(alvo, carteira);
  const encontradas = duplicatas ?? [];
  const etiquetas = derivarEtiquetasProspeccao({
    ...alvo,
    avistamentosTotal,
    situacao,
    possivelDuplicata: encontradas.length > 0,
    jaNaCarteira: naCarteira.length > 0,
    hoje: todayISO(),
  }).filter((etiqueta) => CODIGOS_DA_DEDUPE.has(etiqueta.codigo));
  const geografiaCalada = alvo.latitude != null && alvo.longitude != null && !geografiaOpina(alvo);

  if (duplicatas === null && !naCarteira.length) return null;
  if (!encontradas.length && !naCarteira.length && !indisponivel) return null;

  return (
    <section className={styles.duplicatas} aria-label="Possíveis duplicatas">
      <div className={styles.secaoCabecalho}>
        <h4>{titulo}</h4>
        <span>Só um aviso: você continua livre para registrar e trabalhar.</span>
      </div>
      {etiquetas.length ? (
        <div className={styles.chips} aria-label="Etiquetas derivadas">
          {etiquetas.map((etiqueta) => (
            <span className={styles.chip} key={etiqueta.codigo} data-derivada={etiqueta.codigo}>
              {obterEtiquetaCatalogo(etiqueta.categoria, etiqueta.codigo)?.rotulo ?? etiqueta.codigo}
            </span>
          ))}
        </div>
      ) : null}
      {geografiaCalada ? (
        <p className={styles.duplicatasNota}>
          Coordenada imprecisa: a geografia não opina aqui; só o endereço decide.
        </p>
      ) : null}
      {indisponivel ? (
        <p className={styles.duplicatasNota} role="status">
          Não foi possível conferir duplicatas agora. Nada impede o registro.
        </p>
      ) : null}
      {encontradas.length ? (
        <ul className={styles.duplicatasLista}>
          {encontradas.map(({ resultado, candidato }) => (
            <li key={candidato.id} data-candidato-id={candidato.id} data-grau={resultado.grau}>
              <div className={styles.duplicataTopo}>
                <strong>{enderecoCurto(candidato)}</strong>
                <span className={styles.chip}>{ROTULO_GRAU_DUPLICIDADE[resultado.grau]}</span>
              </div>
              <small>
                {candidato.ultimoAvistamentoEm
                  ? `Avistado em ${fmtDataHoraIso(candidato.ultimoAvistamentoEm)}`
                  : "Sem avistamento registrado"}
                {" · "}
                {descreverResultadoDedupe(resultado, alvo, identidadeParaDedupe(candidato))}
              </small>
              {identificado && identificado.id === alvo.id && podeFundirIdentificado(identificado)
                && candidato.id !== identificado.id && podeFundirIdentificado(candidato) ? (
                <button type="button" className="btn btn-sm" disabled={salvando || carregando || candidatoParaUnir !== null}
                  onClick={() => setCandidatoParaUnir(candidato)}>É o mesmo</button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      {candidatoParaUnir && identificado && identificado.id === alvo.id ? (
        <DialogoFundirIdentificados key={identificado.id + ":" + candidatoParaUnir.id}
          identificado={identificado} candidato={candidatoParaUnir} fotosIdentificado={fotosIdentificado}
          aoFechar={() => setCandidatoParaUnir(null)} />
      ) : null}
      {naCarteira.length ? (
        <p className={styles.duplicatasCarteira} role="status">
          Esse imóvel já está no Pipeline. {descreverDuplicados(naCarteira)}
        </p>
      ) : null}
    </section>
  );
}
