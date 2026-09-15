"use client";

/* Confirmação de campo (C10.1). Depois de salvar, a primeira coisa que o
   corretor precisa ler é "deu certo, foi este imóvel, pode guardar o
   celular". Só o essencial do que acabou de ser gravado — endereço, foto,
   localização, quando — e as ações que já existem, sem competir com a
   mensagem. Nada aqui grava, cria ou decide: é apresentação sobre
   `detalhe` e `ultimoRegistro`, ambos já no store. */
import Link from "next/link";

import { urlInvestigadorDoImovelIdentificado } from "@/lib/calculo/contextoInvestigador";
import { descreverLocalizacao } from "@/lib/calculo/prospeccao";
import { fmtDataHoraIso } from "@/lib/datas";
import type { DetalheImovelIdentificado } from "@/lib/prospeccao";

import { tipoComMarca } from "./CardIdentificado";
import styles from "./Prospeccao.module.css";

export const TITULO_IMOVEL_REGISTRADO = "Imóvel registrado";
export const TITULO_PASSAGEM_REGISTRADA = "Passagem registrada";
export const ROTULO_CONCLUIR = "Concluir";
export const ROTULO_VER_DETALHES = "Ver detalhes";

export function enderecoCurto(detalhe: DetalheImovelIdentificado): string {
  const item = detalhe.identificado;
  const endereco = [item.logradouro, item.numero].filter(Boolean).join(", ");
  const local = [item.bairro, item.cidade].filter(Boolean).join(" · ");
  return [endereco, local].filter(Boolean).join(" — ")
    || item.pontoReferencia
    || "Local ainda sem endereço";
}

export default function ConfirmacaoRegistro({
  detalhe,
  avistamentoId,
  novoLocal,
  aoConcluir,
  aoVerDetalhes,
}: {
  detalhe: DetalheImovelIdentificado;
  avistamentoId: string;
  novoLocal: boolean;
  aoConcluir: () => void;
  aoVerDetalhes: () => void;
}) {
  const item = detalhe.identificado;
  const passagem = detalhe.avistamentos.find((avistamento) => avistamento.id === avistamentoId) ?? null;
  const fotos = passagem?.fotos.filter((foto) => foto.estado === "ativa").length ?? 0;
  const localizacao = passagem && passagem.latitude !== null && passagem.longitude !== null
    ? descreverLocalizacao(passagem)
    : null;
  const quando = passagem ? fmtDataHoraIso(passagem.observadoEm) : "";
  const tipo = item.tipo ? tipoComMarca(item) : null;

  return (
    <section className={styles.confirmacao} role="status" aria-label="Registro concluído" data-confirmacao-registro>
      <div className={styles.confirmacaoTopo}>
        <span className={styles.confirmacaoMarca} aria-hidden="true">✓</span>
        <div>
          <strong>{novoLocal ? TITULO_IMOVEL_REGISTRADO : TITULO_PASSAGEM_REGISTRADA}</strong>
          <p className={styles.confirmacaoEndereco}>{enderecoCurto(detalhe)}</p>
        </div>
      </div>
      <ul className={styles.confirmacaoItens}>
        {quando ? <li data-confirmacao="quando">{quando}</li> : null}
        {tipo ? <li data-confirmacao="tipo">{tipo}</li> : null}
        <li data-confirmacao="foto" data-registrada={fotos > 0}>
          {fotos > 0 ? (fotos === 1 ? "Foto registrada" : `${fotos} fotos registradas`) : "Sem foto nesta passagem"}
        </li>
        <li data-confirmacao="localizacao" data-registrada={Boolean(localizacao)}>
          {localizacao ? `Localização registrada · ${localizacao}` : "Sem localização nesta passagem"}
        </li>
      </ul>
      <div className={styles.confirmacaoAcoes}>
        <button type="button" className="btn btn-primary" onClick={aoConcluir}>
          {ROTULO_CONCLUIR}
        </button>
        <button type="button" className="btn btn-sm" onClick={aoVerDetalhes}>
          {ROTULO_VER_DETALHES}
        </button>
        <Link className="btn btn-sm btn-ghost" href={urlInvestigadorDoImovelIdentificado(item.id)}>
          Investigar na web
        </Link>
      </div>
    </section>
  );
}
