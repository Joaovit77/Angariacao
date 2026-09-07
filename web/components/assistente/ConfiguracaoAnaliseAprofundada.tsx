"use client";

import { useMemo, useState } from "react";
import { useAppStore } from "@/lib/store";
import { useEstadoAssistente } from "./AssistenteProvider";
import styles from "./Assistente.module.css";

const FONTES_OBRIGATORIAS = [
  "Dados do imóvel",
  "Mercado e comparáveis",
  "Histórico operacional",
  "Agenda e follow-ups",
  "Protocolos",
];

export default function ConfiguracaoAnaliseAprofundada({ aoFechar }: { aoFechar: () => void }) {
  const imoveis = useAppStore((estado) => estado.imoveis);
  const { analisarAprofundadamente, carregando } = useEstadoAssistente();
  const [imovelId, setImovelId] = useState("");
  const [atendimento, setAtendimento] = useState(false);
  const opcoes = useMemo(
    () => [...imoveis]
      .filter((imovel) => !imovel.retirado)
      .sort((a, b) => (a.codigo || a.endereco).localeCompare(b.codigo || b.endereco, "pt-BR")),
    [imoveis],
  );

  async function executar() {
    if (!imovelId || carregando) return;
    await analisarAprofundadamente(imovelId, atendimento);
    aoFechar();
  }

  return (
    <section className={styles.configuracaoAnalise} aria-labelledby="titulo-analise-aprofundada">
      <div className={styles.configuracaoAnaliseCabecalho}>
        <span>
          <small>Modo somente leitura</small>
          <strong id="titulo-analise-aprofundada">Análise aprofundada</strong>
        </span>
        <button type="button" onClick={aoFechar} aria-label="Fechar configuração">×</button>
      </div>
      <p>Compare um imóvel de locação com os dados já disponíveis no Angario. Nenhuma ação ou pesquisa externa será executada.</p>
      <label>
        Imóvel obrigatório
        <select value={imovelId} onChange={(evento) => setImovelId(evento.target.value)} disabled={carregando}>
          <option value="">Selecione um imóvel</option>
          {opcoes.map((imovel) => (
            <option value={imovel.id} key={imovel.id}>
              {imovel.codigo || "Sem código"} · {imovel.endereco}
            </option>
          ))}
        </select>
      </label>
      <fieldset>
        <legend>Fontes da análise</legend>
        {FONTES_OBRIGATORIAS.map((rotulo) => (
          <label key={rotulo}>
            <input type="checkbox" checked disabled />
            <span>{rotulo}</span>
          </label>
        ))}
        <label className={styles.fonteAtendimento}>
          <input
            type="checkbox"
            checked={atendimento}
            onChange={(evento) => setAtendimento(evento.target.checked)}
            disabled={carregando}
          />
          <span><b>Atendimento</b><small>Inclui somente mensagens relevantes e exige sua autorização explícita.</small></span>
        </label>
      </fieldset>
      <button type="button" onClick={() => void executar()} disabled={!imovelId || carregando}>
        {carregando ? "Analisando…" : "Executar análise"}
      </button>
    </section>
  );
}
