"use client";

/* Recuperação de promoção parcial (V7 §13.2).

   O registro está `promovendo`: o ModalImovel salvou (ou pode ter
   salvado) uma oportunidade no Pipeline e o vínculo não foi gravado. Este
   componente só conclui o vínculo com uma oportunidade que JÁ existe —
   não tem botão de criar outra, não grava nada no Pipeline e não reabre o
   modal de cadastro. Por isso ele não importa nada do Pipeline além da
   leitura da carteira.

   Duas situações, sem meio-termo:
   - na mesma sessão, `lib/prospeccao.ts` guardou EXATAMENTE o id que
     o cadastro devolveu: o retry usa aquele id, sem escolher nada;
   - depois de recarregar, o id transitório não existe mais: a tela lista
     as oportunidades da conta não vinculadas a nenhum registro, com a
     mesma chave de endereço, da mais recente para a mais antiga — e o
     HUMANO escolhe. Nunca se seleciona "a mais provável". */
import { useEffect, useState } from "react";

import { oportunidadesElegiveisParaVinculo } from "@/lib/calculo/promocaoProspeccao";
import { fmtDate } from "@/lib/formatadores";
import type { DetalheImovelIdentificado } from "@/lib/prospeccao";
import { useAppStore } from "@/lib/store";
import { useProspeccao } from "@/lib/useProspeccao";

import styles from "./Prospeccao.module.css";

export const MENSAGEM_VINCULO_PENDENTE =
  "A oportunidade foi criada no Pipeline, mas o vínculo com este registro ficou pendente. Escolha a oportunidade correta para concluir.";
export const ROTULO_CONCLUIR_VINCULO = "Concluir vínculo da oportunidade";
export const AVISO_DESISTIR =
  "Desistir do vínculo? Este registro volta ao estado anterior no Garimpo. A oportunidade já criada continua no Pipeline: apagá-la, se for o caso, é uma decisão feita lá, não aqui.";

export default function ConcluirVinculoOportunidade({
  detalhe,
}: {
  detalhe: DetalheImovelIdentificado;
}) {
  const item = detalhe.identificado;
  const vincularPromocao = useProspeccao((estado) => estado.vincularPromocao);
  const desistirPromocao = useProspeccao((estado) => estado.desistirPromocao);
  const oportunidadeCriadaNaSessao = useProspeccao((estado) => estado.oportunidadeCriadaNaSessao);
  const imoveisJaVinculados = useProspeccao((estado) => estado.imoveisJaVinculados);
  const salvando = useProspeccao((estado) => estado.salvando);
  const carteira = useAppStore((estado) => estado.imoveis);
  const [vinculados, setVinculados] = useState<{ id: string; ids: Set<string> | null } | null>(null);

  const idDaSessao = oportunidadeCriadaNaSessao(item.id);

  // Só o caminho pós-reload consulta o banco; com o id em sessão não há o
  // que escolher. Trocar de registro descarta a resposta do anterior.
  useEffect(() => {
    if (idDaSessao) return;
    let cancelado = false;
    void imoveisJaVinculados().then((ids) => {
      if (!cancelado) setVinculados({ id: item.id, ids });
    });
    return () => { cancelado = true; };
  }, [idDaSessao, imoveisJaVinculados, item.id]);

  const consulta = vinculados?.id === item.id ? vinculados : null;
  const candidatas = consulta?.ids
    ? oportunidadesElegiveisParaVinculo(carteira, consulta.ids, item)
    : [];

  async function desistir() {
    if (salvando || !window.confirm(AVISO_DESISTIR)) return;
    await desistirPromocao(item.id);
  }

  return (
    <div className={styles.vinculoPendente} role="status" data-vinculo-pendente>
      <div>
        <strong>Oportunidade criada, vínculo pendente</strong>
        <p>{MENSAGEM_VINCULO_PENDENTE}</p>
      </div>

      {idDaSessao ? (
        <div className={styles.acoesVinculo}>
          <button
            type="button"
            className="btn btn-primary btn-sm"
            disabled={salvando}
            data-vinculo-sessao={idDaSessao}
            onClick={() => void vincularPromocao(item.id, idDaSessao)}
          >
            {salvando ? "Concluindo…" : ROTULO_CONCLUIR_VINCULO}
          </button>
          <small className={styles.explicacao}>
            Conclui o vínculo com a oportunidade que acabou de ser salva nesta sessão. Nenhuma outra é criada.
          </small>
        </div>
      ) : !consulta ? (
        <p>Procurando oportunidades sem vínculo com o mesmo endereço…</p>
      ) : !consulta.ids ? (
        <p>Não foi possível consultar as oportunidades agora. Recarregue a página para tentar de novo.</p>
      ) : candidatas.length ? (
        <ul className={styles.candidatas} aria-label="Oportunidades elegíveis">
          {candidatas.map((candidata) => (
            <li key={candidata.id} className={styles.candidata} data-candidata={candidata.id}>
              <div>
                <strong>{candidata.codigo ? `${candidata.codigo} · ` : ""}{candidata.endereco}</strong>
                <small>
                  {[
                    candidata.unidade ? `un. ${candidata.unidade}` : "",
                    candidata.bloco ? `bl. ${candidata.bloco}` : "",
                    candidata.edificio,
                    candidata.bairro,
                    candidata.status,
                    candidata.dataAngariacao ? `cadastrada em ${fmtDate(candidata.dataAngariacao)}` : "",
                  ].filter(Boolean).join(" · ")}
                </small>
              </div>
              <button
                type="button"
                className="btn btn-sm"
                disabled={salvando}
                onClick={() => void vincularPromocao(item.id, candidata.id)}
              >
                {ROTULO_CONCLUIR_VINCULO}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p>
          Nenhuma oportunidade sem vínculo com o mesmo endereço foi encontrada na sua carteira.
          Se o endereço foi alterado ao salvar, confira no Pipeline; se preferir, desista do vínculo abaixo.
        </p>
      )}

      <div className={styles.acoesVinculo}>
        <button
          type="button"
          className="btn btn-sm btn-ghost"
          disabled={salvando}
          onClick={() => void desistir()}
        >
          Desistir do vínculo
        </button>
        <small className={styles.explicacao}>
          Este registro volta ao estado anterior. A oportunidade já criada continua no Pipeline.
        </small>
      </div>
    </div>
  );
}
