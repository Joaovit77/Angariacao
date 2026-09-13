"use client";

import { useEffect, useId, useRef, useState } from "react";

import { fmtDataHoraIso } from "@/lib/datas";
import { podeFundirIdentificado, type ImovelIdentificado } from "@/lib/prospeccao";
import { useProspeccao } from "@/lib/useProspeccao";

import styles from "./Prospeccao.module.css";

function endereco(item: ImovelIdentificado): string {
  const rua = [item.logradouro, item.numero].filter(Boolean).join(", ");
  const complemento = [item.unidade && "Unidade " + item.unidade, item.bloco && "Bloco " + item.bloco, item.edificio]
    .filter(Boolean).join(" · ");
  return [rua || item.pontoReferencia || "Local sem endereço", complemento,
    [item.bairro, item.cidade, item.estado].filter(Boolean).join(" · ")].filter(Boolean).join(" — ");
}

/** Diálogo local, como o de exclusão C5b; não abre um modal global. */
export default function DialogoFundirIdentificados({
  identificado, candidato, fotosIdentificado, aoFechar,
}: {
  identificado: ImovelIdentificado;
  candidato: ImovelIdentificado;
  fotosIdentificado?: number;
  aoFechar: () => void;
}) {
  const fundir = useProspeccao((estado) => estado.fundir);
  const salvando = useProspeccao((estado) => estado.salvando);
  const carregando = useProspeccao((estado) => estado.carregando);
  const [sobreviventeId, setSobreviventeId] = useState<string | null>(null);
  const [confirmado, setConfirmado] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const emVoo = useRef(false);
  const tituloRef = useRef<HTMLHeadingElement>(null);
  const id = useId();
  const ocupado = enviando || salvando || carregando;
  const permitido = identificado.id !== candidato.id
    && podeFundirIdentificado(identificado) && podeFundirIdentificado(candidato);
  const registros = [
    { item: identificado, rotulo: "Registro aberto", fotos: fotosIdentificado },
    { item: candidato, rotulo: "Registro sugerido", fotos: undefined },
  ];
  const sobrevivente = registros.find(({ item }) => item.id === sobreviventeId);
  const absorvido = sobrevivente ? registros.find(({ item }) => item.id !== sobreviventeId) : undefined;

  useEffect(() => {
    const anterior = document.activeElement;
    tituloRef.current?.focus();
    return () => {
      if (anterior instanceof HTMLElement && anterior.isConnected) anterior.focus();
    };
  }, []);

  async function confirmar() {
    if (emVoo.current || ocupado || !permitido || !confirmado || !sobrevivente || !absorvido) return;
    emVoo.current = true;
    setEnviando(true);
    setErro(null);
    try {
      const resultado = await fundir(sobrevivente.item.id, absorvido.item.id);
      if (resultado) aoFechar();
      else setErro(useProspeccao.getState().erro ?? "Não foi possível confirmar a união. Tente novamente.");
    } catch (falha) {
      setErro(falha instanceof Error ? falha.message : "Não foi possível confirmar a união. Tente novamente.");
    } finally {
      emVoo.current = false;
      setEnviando(false);
    }
  }

  return (
    <div className={styles.dialogoFusao} role="dialog" aria-labelledby={id + "-titulo"}
      aria-describedby={id + "-explicacao"} aria-busy={ocupado}
      onKeyDown={(evento) => {
        if (evento.key === "Escape") {
          evento.stopPropagation();
          if (!ocupado) aoFechar();
        }
      }}>
      <h4 id={id + "-titulo"} ref={tituloRef} tabIndex={-1}>Unir registros</h4>
      <p id={id + "-explicacao"}>
        Os dois históricos serão unidos no registro principal. Nenhum avistamento, foto ou evidência
        será apagado. Esta operação não cria oportunidade no Pipeline.
      </p>
      <fieldset className={styles.escolhaFusao} disabled={ocupado || !permitido}>
        <legend>Qual registro você quer manter como principal?</legend>
        <div className={styles.opcoesFusao}>
          {registros.map(({ item, rotulo, fotos }) => (
            <label className={styles.opcaoFusao} key={item.id} data-registro-id={item.id}>
              <input type="radio" name={id + "-principal"} checked={sobreviventeId === item.id}
                aria-label={"Manter " + rotulo.toLowerCase() + " como principal"}
                onChange={() => { setSobreviventeId(item.id); setConfirmado(false); setErro(null); }} />
              <span>
                <span className={styles.papelFusao}>{rotulo}</span>
                <strong>{endereco(item)}</strong>
                <span>{item.tipo ?? "Tipo não definido"} · {item.avistamentosTotal} avistamento{item.avistamentosTotal === 1 ? "" : "s"}</span>
                <span>Último: {fmtDataHoraIso(item.ultimoAvistamentoEm) || "Sem avistamento"}</span>
                <span>Registrado em {fmtDataHoraIso(item.criadoEm) || "data não informada"}</span>
                {fotos !== undefined ? <span>{fotos} foto{fotos === 1 ? "" : "s"} no histórico</span> : null}
                <b>{sobreviventeId === item.id ? "Será mantido como principal" : sobreviventeId ? "Terá o histórico absorvido" : "Manter este como principal"}</b>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      {sobrevivente && absorvido ? (
        <div className={styles.resumoFusao} aria-label="Escolha da união">
          <p><strong>Sobrevivente — {sobrevivente.rotulo.toLowerCase()}:</strong> {endereco(sobrevivente.item)}</p>
          <p><strong>Absorvido — {absorvido.rotulo.toLowerCase()}:</strong> {endereco(absorvido.item)}</p>
          <p>O absorvido ficará marcado como fundido nos ocultos. Seu histórico estará no principal.</p>
        </div>
      ) : null}
      <label className={styles.confirmacaoFusao}>
        <input type="checkbox" checked={confirmado} disabled={ocupado || !permitido || !sobrevivente}
          onChange={(evento) => setConfirmado(evento.target.checked)} />
        Confirmo que estes registros são o mesmo lugar e quero unir os históricos.
      </label>
      {!permitido ? <p role="alert">Estes registros não podem ser unidos. Atualize a lista e confira a situação e a exclusão pendente.</p> : null}
      {erro ? <p className={styles.erroFusao} role="alert">{erro}</p> : null}
      <div className={styles.dialogoAcoes}>
        <button type="button" className="btn btn-primary" disabled={ocupado || !permitido || !confirmado || !sobrevivente}
          onClick={() => void confirmar()}>{enviando ? "Unindo históricos…" : "Confirmar união dos históricos"}</button>
        <button type="button" className="btn btn-ghost" disabled={ocupado} onClick={aoFechar}>Cancelar</button>
      </div>
    </div>
  );
}
