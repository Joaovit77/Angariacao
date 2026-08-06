"use client";

/* ================================================================
   LINHA DO TEMPO DA ANGARIAÇÃO

   Só desenha. Toda a decisão de o que é marco, de onde sai a data e
   o que não entra está em `calculo/timeline.ts` — inclusive a regra
   de manter tentativas e respostas FORA, que é o que impede esta
   lista de nascer cheia e deixar de ser lida.

   Não aparece em imóvel novo (sem `dataAngariacao` não há história a
   contar, e um bloco vazio no meio do formulário só ocupa espaço).
   ================================================================ */
import { timelineDaAngariacao } from "@/lib/calculo/timeline";
import { fmtDate, fmtMoneyFull } from "@/lib/formatadores";
import type { Imovel } from "@/lib/tipos";

export default function TimelineImovel({ imovel }: { imovel: Imovel }) {
  const marcos = timelineDaAngariacao(imovel);
  if (marcos.length === 0) return null;

  return (
    <fieldset>
      <legend>Linha do tempo</legend>
      <ol className="timeline">
        {marcos.map((m, i) => (
          // A chave junta data + título porque nada aqui tem id: os marcos são
          // DERIVADOS na leitura, não linhas de tabela. O índice entra no fim
          // para o caso de dois marcos idênticos no mesmo dia (um reenvio de
          // evento corrigindo uma data, por exemplo) não colidirem.
          <li
            key={`${m.data}-${m.titulo}-${i}`}
            className={`timeline-item${m.fonte === "sistema-principal" ? " do-sistema" : ""}`}
          >
            <div className="timeline-data">{fmtDate(m.data)}</div>
            <div className="timeline-titulo">
              <span className="timeline-icone" aria-hidden="true">
                {m.icone}
              </span>
              {m.titulo}
            </div>
            {(m.detalhe || m.valor != null) && (
              <div className="timeline-detalhe">
                {m.valor != null && <span className="timeline-valor">{fmtMoneyFull(m.valor)}</span>}
                {m.valor != null && m.detalhe ? " · " : ""}
                {m.detalhe}
              </div>
            )}
          </li>
        ))}
      </ol>
    </fieldset>
  );
}
