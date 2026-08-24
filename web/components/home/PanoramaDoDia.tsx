"use client";

/* Um resumo para bater o olho, não quatro listas novas. Cada número reutiliza
   o cálculo da tela de destino e o cartão inteiro funciona como atalho. */
import { useRouter } from "next/navigation";
import { AGENDA_PENDENTES_JANELA_DIAS } from "@/lib/calculo/agenda";
import { metaDoMes } from "@/lib/calculo/metaMes";
import { imoveisAngariadosNoMes, isStale } from "@/lib/calculo/motor";
import { contarRespostasPendentes } from "@/lib/calculo/respostas";
import { addDaysISO, currentMonthKey, todayISO } from "@/lib/datas";
import { useAppStore } from "@/lib/store";

export default function PanoramaDoDia() {
  const router = useRouter();
  const imoveis = useAppStore((s) => s.imoveis);
  const agenda = useAppStore((s) => s.agenda);
  const metas = useAppStore((s) => s.metas);

  const hoje = todayISO();
  const fimJanela = addDaysISO(hoje, AGENDA_PENDENTES_JANELA_DIAS) as string;
  const mes = currentMonthKey();
  const meta = metaDoMes(metas, mes);
  const angariados = imoveisAngariadosNoMes(imoveis, mes).length;
  const alvoAngariacoes = meta.angariacoes;

  const itens = [
    {
      titulo: "Conversas",
      valor: contarRespostasPendentes(imoveis, hoje),
      detalhe: "respostas pendentes",
      rota: "/respostas",
    },
    {
      titulo: "Agenda",
      valor: agenda.filter((item) => !item.done && item.date <= fimJanela).length,
      detalhe: `próximos ${AGENDA_PENDENTES_JANELA_DIAS} dias`,
      rota: "/agenda",
    },
    {
      titulo: "Pipeline",
      valor: imoveis.filter((imovel) => isStale(imovel, hoje)).length,
      detalhe: "sem movimento",
      rota: "/pipeline",
    },
    {
      titulo: "Meta do mês",
      valor: alvoAngariacoes > 0 ? `${angariados}/${alvoAngariacoes}` : angariados,
      detalhe: alvoAngariacoes > 0 ? "angariações" : "sem meta definida",
      rota: "/metas",
    },
  ] as const;

  return (
    <section className="home-panorama" aria-labelledby="home-panorama-titulo">
      <div className="home-panorama-head">
        <h2 id="home-panorama-titulo">Panorama</h2>
        <span>O detalhe continua em cada área</span>
      </div>
      <div className="home-panorama-grid">
        {itens.map((item) => (
          <button
            type="button"
            className="home-panorama-item"
            key={item.titulo}
            onClick={() => router.push(item.rota)}
          >
            <span className="home-panorama-titulo">{item.titulo}</span>
            <strong>{item.valor}</strong>
            <span className="home-panorama-detalhe">{item.detalhe}</span>
            <span className="home-panorama-seta" aria-hidden>→</span>
          </button>
        ))}
      </div>
    </section>
  );
}
