"use client";

/* ================================================================
   Wrapper imperativo do Chart.js — espelha o par
   afterRenderX()/destroy do renderCurrentView() antigo: a instância
   nasce no useEffect e morre no cleanup, então trocar de rota ou
   re-renderizar nunca deixa gráfico órfão (MIGRATION_NEXT.md §12).
   ================================================================ */
import { useEffect, useRef } from "react";
import Chart, { type ChartConfiguration } from "chart.js/auto";

export function aplicarPadroesChart() {
  Chart.defaults.color = "#9aa1ad";
  Chart.defaults.font.family = "-apple-system, BlinkMacSystemFont, Segoe UI, Inter, Roboto, sans-serif";
  Chart.defaults.font.size = 11.5;
  Chart.defaults.borderColor = "#2f3a32";
}

// Paleta categórica dos gráficos — lidera com o dourado da marca e o verde
// (antes começava no terracota #d98a4f, que destoava do logo verde/dourado).
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
      y: { grid: { color: "#222c25" }, border: { display: false }, beginAtZero: true, ticks: { precision: 0 } },
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
    return () => {
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
