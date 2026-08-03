"use client";

/* ================================================================
   CONQUISTAS DO MÊS — o bloco que se move enquanto o mês corre
   Renderiza os desafios de lib/calculo/conquistasDoMes.ts (puros,
   derivados de tentativas/notas/metas — nada persistido).

   Fica ACIMA das medalhas permanentes de propósito: o que muda hoje
   vem antes do mural do que já foi conquistado. As medalhas continuam
   intactas logo abaixo — nenhuma é perdida na virada do mês.
   ================================================================ */
import { conquistasDoMes } from "@/lib/calculo/conquistasDoMes";
import { currentMonthKey, monthLabelLong, todayISO } from "@/lib/datas";
import { useAppStore } from "@/lib/store";

export default function ConquistasDoMes() {
  const imoveis = useAppStore((s) => s.imoveis);
  const metas = useAppStore((s) => s.metas);
  const mKey = currentMonthKey();
  const desafios = conquistasDoMes(imoveis, metas, mKey, todayISO());
  const concluidos = desafios.filter((d) => d.concluido).length;

  return (
    <>
      <div className="card-title" style={{ marginBottom: "14px" }}>
        Conquistas de {monthLabelLong(mKey)}{" "}
        <span className="badges-contador">
          {concluidos} de {desafios.length}
        </span>
      </div>
      {/* `em-andamento`, nunca `bloqueada`: um desafio do mês que ainda não
          fechou não é medalha travada, é o que está acontecendo agora. Com a
          classe das medalhas o bloco inteiro nascia cinza no dia 1º. */}
      <div className="badges-grid">
        {desafios.map((d) => (
          <div
            className={`badge-card${d.concluido ? "" : " em-andamento"}`}
            key={d.id}
            title={d.descricao}
          >
            <div className="badge-icone">{d.icone}</div>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div className="badge-nome">{d.nome}</div>
              <div className="badge-desc">{d.descricao}</div>
              {/* A barra aparece SEMPRE, inclusive no concluído: aqui ela não
                  é só "quanto falta", é o quanto já andou no mês — e é essa
                  linha que muda de um dia para o outro. */}
              <div className="badge-progresso">
                <div className="badge-progresso-track">
                  <div
                    className="badge-progresso-fill"
                    style={{ width: `${d.progresso * 100}%` }}
                  ></div>
                </div>
                <span className="badge-progresso-texto">{d.progressoTexto}</span>
              </div>
              {d.detalhe && <div className="badge-detalhe">{d.detalhe}</div>}
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
