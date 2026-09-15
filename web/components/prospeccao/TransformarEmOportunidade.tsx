"use client";

/* Promoção — o único caminho do Garimpo ao Pipeline (V7 §13).

   Um clique humano em "Transformar em oportunidade" faz três coisas, nesta
   ordem: marca o registro `promovendo`; abre o ModalImovel EXISTENTE com
   endereço, unidade, bloco, edifício, bairro, cidade, UF, tipo e a
   observação da passagem corrente; e, só depois de `salvarImovel`
   confirmar a gravação, grava o vínculo pela RPC própria do Garimpo.
   Nenhum arquivo deste módulo escreve em `imoveis`: quem cria é o modal.

   Nada aqui acontece sozinho. Classificação, etiqueta, tipo inferido,
   investigação, dedupe, merge, cron, trigger ou webhook não chegam a este
   componente; ele só reage ao clique. */
import { useEffect, useRef } from "react";

import {
  podePromoverIdentificado,
  precisaConcluirVinculo,
  preenchimentoDaPromocao,
} from "@/lib/calculo/promocaoProspeccao";
import { fmtDataHoraIso } from "@/lib/datas";
import type { DetalheImovelIdentificado } from "@/lib/prospeccao";
import { useProspeccao } from "@/lib/useProspeccao";
import { useUiModal } from "@/lib/uiModal";

import ConcluirVinculoOportunidade from "./ConcluirVinculoOportunidade";
import styles from "./Prospeccao.module.css";

export const ROTULO_TRANSFORMAR = "Transformar em oportunidade";
export const EXPLICACAO_TRANSFORMAR =
  "Cria uma oportunidade no Pipeline usando este imóvel como ponto de partida. Você poderá completar os dados antes de salvar.";

export default function TransformarEmOportunidade({
  detalhe,
}: {
  detalhe: DetalheImovelIdentificado;
}) {
  const item = detalhe.identificado;
  const abrirImovelDoGarimpo = useUiModal((estado) => estado.abrirImovelDoGarimpo);
  const modal = useUiModal((estado) => estado.modal);
  const iniciarPromocao = useProspeccao((estado) => estado.iniciarPromocao);
  const registrarOportunidadeCriada = useProspeccao((estado) => estado.registrarOportunidadeCriada);
  const desistirPromocao = useProspeccao((estado) => estado.desistirPromocao);
  const salvando = useProspeccao((estado) => estado.salvando);
  // O modal que ESTE componente abriu e ainda não salvou. Ref, não estado:
  // é memória de fluxo, não algo que a tela desenha.
  const aguardandoModal = useRef<{ id: string; salvou: boolean } | null>(null);

  // Fechou o modal sem salvar (X ou Esc): nenhuma oportunidade foi criada,
  // então `promovendo` seria um vínculo pendente falso. Volta a
  // `identificado`. Com salvamento, o `aoSalvar` já assumiu o resto.
  useEffect(() => {
    const espera = aguardandoModal.current;
    if (!espera || modal) return;
    aguardandoModal.current = null;
    if (!espera.salvou) void desistirPromocao(espera.id);
  }, [modal, desistirPromocao]);

  async function transformar() {
    if (salvando) return;
    // Passo 1 ANTES do modal: a partir daqui a tela não oferece criar de
    // novo, só concluir o vínculo — mesmo que a aba seja fechada no meio.
    const iniciou = await iniciarPromocao(item.id);
    if (!iniciou) return;
    const corrente = detalhe.avistamentos.find(
      (avistamento) => avistamento.id === item.avistamentoCorrenteId,
    ) ?? null;
    const espera = { id: item.id, salvou: false };
    aguardandoModal.current = espera;
    abrirImovelDoGarimpo({
      imovelIdentificadoId: item.id,
      inicial: preenchimentoDaPromocao(item, corrente),
      aoSalvar: (imovelId) => {
        espera.salvou = true;
        void registrarOportunidadeCriada(item.id, imovelId);
      },
    });
  }

  if (precisaConcluirVinculo(item)) {
    return <ConcluirVinculoOportunidade detalhe={detalhe} />;
  }

  if (item.situacao === "promovido") {
    return (
      <div className={styles.oportunidade} data-oportunidade="promovida">
        <p>
          <strong>Já é uma oportunidade no Pipeline</strong>
          {item.promovidoEm ? ` desde ${fmtDataHoraIso(item.promovidoEm)}` : ""}.
          {" "}As passagens e fotos continuam aqui, ligadas a ela.
        </p>
      </div>
    );
  }

  if (!podePromoverIdentificado(item)) return null;

  return (
    <div className={styles.oportunidade} data-oportunidade="disponivel">
      <button
        type="button"
        className="btn btn-primary"
        disabled={salvando}
        aria-describedby={`explicacao-transformar-${item.id}`}
        onClick={() => void transformar()}
      >
        {ROTULO_TRANSFORMAR}
      </button>
      <small className={styles.explicacao} id={`explicacao-transformar-${item.id}`}>
        {EXPLICACAO_TRANSFORMAR}
      </small>
    </div>
  );
}
