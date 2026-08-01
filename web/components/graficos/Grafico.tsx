"use client";

/* ================================================================
   Wrapper imperativo do Chart.js — espelha o par
   afterRenderX()/destroy do renderCurrentView() antigo: a instância
   nasce no useEffect e morre no cleanup, então trocar de rota ou
   re-renderizar nunca deixa gráfico órfão (MIGRATION_NEXT.md §12).
   ================================================================ */
import { useEffect, useRef } from "react";
import Chart, { type ChartConfiguration } from "chart.js/auto";
import { inscreverTema } from "@/lib/tema";

/**
 * A cor de um design token, resolvida agora. O canvas não participa da
 * cascata: o Chart.js guarda a string que recebeu e a pinta em pixels,
 * então token nenhum chega aqui sozinho — é preciso LER o valor
 * computado e repintar quando o tema troca (ver o efeito lá embaixo).
 * O fallback é a paleta escura, para o gráfico nunca sair sem cor caso
 * seja construído antes do CSS aplicar.
 */
export function corToken(nome: string, alternativa: string): string {
  if (typeof window === "undefined") return alternativa;
  const valor = getComputedStyle(document.documentElement).getPropertyValue(nome).trim();
  return valor || alternativa;
}

export function aplicarPadroesChart() {
  Chart.defaults.color = corToken("--text-dim", "#9aa1ad");
  Chart.defaults.font.family = "-apple-system, BlinkMacSystemFont, Segoe UI, Inter, Roboto, sans-serif";
  Chart.defaults.font.size = 11.5;
  Chart.defaults.borderColor = corToken("--border", "#2f3a32");
}

// Paleta categórica dos gráficos — lidera com o dourado da marca e o verde
// (antes começava no terracota #d98a4f, que destoava do logo verde/dourado).
// Estas ficam literais de propósito: são cores de PREENCHIMENTO (fatia,
// barra), que valem nos dois temas — o que muda com o tema é o que
// precisa de contraste com o fundo (rótulo, grade, borda da fatia).
export const CHART_COLORS = [
  "#cca24a", "#5fb896", "#6fa8c9", "#9b8fd9", "#e0b458", "#d97878", "#7bd4b2", "#e08f8f",
];

export function baseBarOptions() {
  return {
    responsive: true,
    maintainAspectRatio: false,
    plugins: { legend: { display: false } },
    scales: {
      x: { grid: { display: false }, border: { display: false } },
      y: {
        // Função, não string: o Chart.js reavalia a cada desenho, então a
        // grade acompanha a troca de tema sem recriar o gráfico.
        grid: { color: () => corToken("--border-soft", "#222c25") },
        border: { display: false },
        beginAtZero: true,
        ticks: { precision: 0 },
      },
    },
  };
}

export default function Grafico({ id, config }: { id: string; config: ChartConfiguration }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<Chart | null>(null);
  // A config muda de identidade a cada render; guardamos a última para o
  // efeito de montagem usá-la sem recriar o gráfico a cada re-render.
  // (Este efeito é declarado antes e portanto roda antes do de montagem.)
  const configRef = useRef(config);
  useEffect(() => {
    configRef.current = config;
  }, [config]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    aplicarPadroesChart();
    const chart = new Chart(canvas, configRef.current);
    chartRef.current = chart;
    // Trocar de tema repinta o gráfico: os padrões (rótulo, grade) são
    // globais do Chart.js e ficaram com a cor do tema anterior.
    const sairDoTema = inscreverTema(() => {
      aplicarPadroesChart();
      chart.update();
    });
    return () => {
      sairDoTema();
      chartRef.current = null;
      chart.destroy();
    };
  }, []);

  // Dados novos (ex.: uma mutação da Etapa 6) atualizam o gráfico existente
  // em vez de recriá-lo.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    chart.data = config.data;
    chart.update();
  }, [config]);

  return <canvas id={id} ref={canvasRef}></canvas>;
}
