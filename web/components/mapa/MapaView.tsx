"use client";

/* ================================================================
   VIEW: MAPA
   Port de viewMapa() (app.js, 5H). Mostra todos os imóveis com
   localização definida, coloridos por desfecho: verde = locado
   (conseguiu), vermelho = tentativa sem sucesso (perdido/cancelado/
   sem resposta), âmbar = em andamento.

   Três modos, trocados por botões: pinos, agrupado (clusters) e mapa
   de calor da captação. A legenda se adapta ao modo. O Leaflet toca
   `window`, então entra por import dinâmico sem SSR (MIGRATION_NEXT.md
   §11, risco 10).
   ================================================================ */
import dynamic from "next/dynamic";
import { useMemo, useState } from "react";
import { useAppStore } from "@/lib/store";
import { useUiModal } from "@/lib/uiModal";
import { addDaysISO, todayISO } from "@/lib/datas";
import {
  CATEGORIAS_MAPA,
  type CategoriaMapa,
  categoriaMapa,
  entraNoCalorMapa,
  filtrarImoveisMapa,
  leituraTerritorialMapa,
  resumoMapa,
} from "@/lib/calculo/mapa";
import { analisarMapa } from "@/lib/ia";
import { toast } from "@/lib/toast";
import { HEAT_GRADIENT, type ModoMapa } from "./MapaLeaflet";

const MapaLeaflet = dynamic(() => import("./MapaLeaflet"), { ssr: false });

const MODOS: { id: ModoMapa; label: string }[] = [
  { id: "pinos", label: "Pinos" },
  { id: "agrupado", label: "Agrupado" },
  { id: "calor", label: "Calor" },
];

const PERIODOS = [
  { dias: 0, label: "Todo o período" },
  { dias: 30, label: "Últimos 30 dias" },
  { dias: 90, label: "Últimos 90 dias" },
  { dias: 180, label: "Últimos 180 dias" },
];

// linear-gradient a partir do MESMO gradiente do heatmap (fonte única).
const GRADIENTE_CSS = `linear-gradient(90deg, ${Object.entries(HEAT_GRADIENT)
  .sort((a, b) => Number(a[0]) - Number(b[0]))
  .map(([stop, cor]) => `${cor} ${Number(stop) * 100}%`)
  .join(", ")})`;

function valoresUnicos(
  imoveis: ReturnType<typeof useAppStore.getState>["imoveis"],
  campo: "bairro" | "status" | "responsavel" | "origemImovel",
) {
  return [...new Set(imoveis.map((i) => (i[campo] || "").trim()).filter(Boolean))].sort((a, b) =>
    a.localeCompare(b, "pt-BR"),
  );
}

export default function MapaView() {
  const imoveis = useAppStore((s) => s.imoveis);
  const abrirModal = useUiModal((s) => s.abrirModal);
  const [modo, setModo] = useState<ModoMapa>("pinos");
  // Categoria isolada pela legenda (null = todas). Clicar numa categoria mostra
  // só ela; clicar de novo (ou em "ver todos") volta a mostrar tudo.
  const [filtro, setFiltro] = useState<CategoriaMapa | null>(null);
  const [busca, setBusca] = useState("");
  const [bairro, setBairro] = useState("");
  const [status, setStatus] = useState("");
  const [responsavel, setResponsavel] = useState("");
  const [origem, setOrigem] = useState("");
  const [periodoDias, setPeriodoDias] = useState(0);
  const [mostrarSemLocalizacao, setMostrarSemLocalizacao] = useState(false);
  const [bairroAberto, setBairroAberto] = useState(false);
  const [bairroTermo, setBairroTermo] = useState("");
  const [iaCarregando, setIaCarregando] = useState(false);
  const [acaoIa, setAcaoIa] = useState<{ chave: string; texto: string } | null>(null);
  const iaDisponivel = useAppStore((s) => s.iaDisponivel);

  const bairros = useMemo(() => valoresUnicos(imoveis, "bairro"), [imoveis]);
  const statusDisponiveis = useMemo(() => valoresUnicos(imoveis, "status"), [imoveis]);
  const responsaveis = useMemo(() => valoresUnicos(imoveis, "responsavel"), [imoveis]);
  const origens = useMemo(() => valoresUnicos(imoveis, "origemImovel"), [imoveis]);
  const bairrosSugeridos = bairros
    .filter((v) => !bairroTermo.trim() || v.toLocaleLowerCase("pt-BR").includes(bairroTermo.trim().toLocaleLowerCase("pt-BR")));

  const filtrados = useMemo(() => {
    const desde = periodoDias ? addDaysISO(todayISO(), -periodoDias) : null;
    return filtrarImoveisMapa(imoveis, { busca, bairro, status, responsavel, origem, desde });
  }, [imoveis, busca, bairro, status, responsavel, origem, periodoDias]);

  const filtrosAtivos = Boolean(busca.trim() || bairro || status || responsavel || origem || periodoDias);
  const limparFiltros = () => {
    setBusca("");
    setBairro("");
    setBairroTermo("");
    setStatus("");
    setResponsavel("");
    setOrigem("");
    setPeriodoDias(0);
    setFiltro(null);
  };

  const resumo = resumoMapa(filtrados);
  const territorial = leituraTerritorialMapa(filtrados);
  const chaveFiltros = JSON.stringify({ busca, bairro, status, responsavel, origem, periodoDias });

  async function pedirLeituraIa() {
    if (iaCarregando || !iaDisponivel) return;
    setIaCarregando(true);
    const r = await analisarMapa({ busca, bairro, status, responsavel, origem, periodoDias });
    setIaCarregando(false);
    if (!r.ok || !r.leitura?.acao) {
      toast(r.mensagem || "A IA não respondeu agora.", "error");
      return;
    }
    setAcaoIa({ chave: chaveFiltros, texto: r.leitura.acao });
  }

  const analiseAtual = acaoIa?.chave === chaveFiltros;
  const participacaoConcentracao = territorial.concentracao && resumo.total
    ? territorial.concentracao.total / resumo.total * 100
    : 0;

  const comLocalizacao = filtrados.filter((i) => i.latitude != null && i.longitude != null);
  const semLocalizacaoLista = filtrados.filter((i) => i.latitude == null || i.longitude == null);
  const semLocalizacao = semLocalizacaoLista.length;
  const angariadosLocalizados = comLocalizacao.filter(entraNoCalorMapa).length;

  // Quantos localizados há em cada categoria — o número ao lado de cada linha
  // da legenda, e o que decide se a linha é clicável (categoria vazia não é).
  const contagem: Record<CategoriaMapa, number> = { locado: 0, angariado: 0, andamento: 0, "sem-sucesso": 0 };
  for (const i of comLocalizacao) contagem[categoriaMapa(i)]++;
  const visiveis = filtro ? contagem[filtro] : comLocalizacao.length;

  if (imoveis.length === 0) {
    return (
      <>
        <div className="page-head">
          <div>
            <p className="page-sub">Onde você tentou e onde conseguiu angariar</p>
          </div>
        </div>
        <div className="empty-state card">
          <h3>Nenhum imóvel cadastrado ainda</h3>
          <p>Cadastre imóveis e localize os endereços no mapa para vê-los aqui.</p>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="page-head">
        <div>
          <p className="page-sub">
            {modo === "calor"
              ? `${angariadosLocalizados} imóvel(is) angariado(s) no mapa de calor`
              : filtro
                ? `${visiveis} de ${comLocalizacao.length} imóveis. ${CATEGORIAS_MAPA.find((c) => c.id === filtro)?.label}`
                : `${comLocalizacao.length} imóveis localizados no mapa`}
          </p>
        </div>
        <div className="page-actions">
          <div className="map-mode-switch" role="group" aria-label="Modo de visualização do mapa">
            {MODOS.map((m) => (
              <button
                key={m.id}
                type="button"
                className={"map-mode-btn" + (modo === m.id ? " active" : "")}
                aria-pressed={modo === m.id}
                onClick={() => setModo(m.id)}
              >
                {m.label}
              </button>
            ))}
          </div>
          <button type="button" className="btn btn-primary" onClick={() => abrirModal("imovel")}>
            + Nova angariação
          </button>
        </div>
      </div>
      <div className="map-filter-panel">
        <div className="map-filter-panel-head">
          <div className="map-filter-panel-title">
            <span className="map-filter-panel-icon" aria-hidden="true">⌁</span>
            <div><strong>Refinar visualização</strong><span>Combine os filtros para analisar uma região específica</span></div>
          </div>
          {filtrosAtivos && <button type="button" className="map-filters-clear" onClick={limparFiltros}>Limpar filtros</button>}
        </div>
        <div className="map-filters" aria-label="Filtros do mapa">
          <label className="map-filter-field map-filter-search">
            <span className="map-filter-label">Buscar imóvel</span>
            <input
              type="search"
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Endereço, código, edifício ou proprietário"
              aria-label="Buscar imóveis no mapa"
            />
          </label>
          <div
            className="map-filter-field map-bairro-search"
            onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setBairroAberto(false); }}
          >
            <span className="map-filter-label">Bairro</span>
            <input
              type="search"
              value={bairroAberto ? bairroTermo : bairro}
              onChange={(e) => { setBairroTermo(e.target.value); setBairroAberto(true); }}
              onFocus={() => { setBairroTermo(""); setBairroAberto(true); }}
              onKeyDown={(e) => {
                if (e.key === "Escape") setBairroAberto(false);
                if (e.key === "Enter" && bairrosSugeridos[0]) {
                  e.preventDefault();
                  setBairro(bairrosSugeridos[0]);
                  setBairroTermo(bairrosSugeridos[0]);
                  setBairroAberto(false);
                }
              }}
              placeholder="Todos os bairros"
              aria-label="Filtrar por bairro"
              role="combobox"
              aria-expanded={bairroAberto}
              aria-controls="mapa-bairros-sugestoes"
              aria-autocomplete="list"
            />
            {bairroAberto && (
              <div id="mapa-bairros-sugestoes" className="map-bairro-options" role="listbox">
                <button
                  type="button"
                  role="option"
                  aria-selected={!bairro}
                  onClick={() => { setBairro(""); setBairroTermo(""); setBairroAberto(false); }}
                >
                  Todos os bairros
                </button>
                {bairrosSugeridos.map((v) => (
                  <button
                    key={v}
                    type="button"
                    role="option"
                    aria-selected={bairro === v}
                    onClick={() => { setBairro(v); setBairroTermo(v); setBairroAberto(false); }}
                  >
                    {v}
                  </button>
                ))}
              </div>
            )}
          </div>
          <label className="map-filter-field">
            <span className="map-filter-label">Período</span>
            <select value={periodoDias} onChange={(e) => setPeriodoDias(Number(e.target.value))} aria-label="Filtrar por período">
              {PERIODOS.map((p) => <option key={p.dias} value={p.dias}>{p.label}</option>)}
            </select>
          </label>
          <label className="map-filter-field">
            <span className="map-filter-label">Status</span>
            <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Filtrar por status">
              <option value="">Todos os status</option>
              {statusDisponiveis.map((v) => <option key={v}>{v}</option>)}
            </select>
          </label>
          <label className="map-filter-field">
            <span className="map-filter-label">Responsável</span>
            <select value={responsavel} onChange={(e) => setResponsavel(e.target.value)} aria-label="Filtrar por responsável">
              <option value="">Todos os responsáveis</option>
              {responsaveis.map((v) => <option key={v}>{v}</option>)}
            </select>
          </label>
          <label className="map-filter-field">
            <span className="map-filter-label">Origem</span>
            <select value={origem} onChange={(e) => setOrigem(e.target.value)} aria-label="Filtrar por origem">
              <option value="">Todas as origens</option>
              {origens.map((v) => <option key={v}>{v}</option>)}
            </select>
          </label>
        </div>
      </div>
      <div className="map-summary" aria-label="Resumo dos imóveis filtrados">
        <div><span>Registros</span><strong>{resumo.total}</strong></div>
        <div><span>Localizados</span><strong>{resumo.localizados}</strong></div>
        <div><span>Captações ganhas</span><strong>{resumo.ganhas}</strong></div>
        <div><span>Em andamento</span><strong>{resumo.emAndamento}</strong></div>
        <div className="map-summary-conversion"><span>Conversão</span><strong>{resumo.conversao.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%</strong></div>
      </div>
      <div className="map-page-wrap">
        <MapaLeaflet
          imoveis={filtrados}
          aoAbrirImovel={(id) => abrirModal("imovel", id)}
          modo={modo}
          filtro={modo === "calor" ? null : filtro}
        />

        {semLocalizacao > 0 && (
          <button type="button" className="map-unlocated-note" onClick={() => setMostrarSemLocalizacao((v) => !v)} aria-expanded={mostrarSemLocalizacao}>
            {semLocalizacao} sem localização · {mostrarSemLocalizacao ? "fechar lista" : "corrigir"}
          </button>
        )}

        {mostrarSemLocalizacao && semLocalizacao > 0 && (
          <div className="map-unlocated-list">
            <div className="map-unlocated-title">Imóveis fora do mapa</div>
            {semLocalizacaoLista.slice(0, 8).map((i) => (
              <button key={i.id} type="button" onClick={() => abrirModal("imovel", i.id)}>
                <strong>{i.codigo || i.endereco || "Imóvel sem endereço"}</strong>
                <span>{i.bairro || "Abra para informar a localização"}</span>
              </button>
            ))}
            {semLocalizacao > 8 && <div className="map-unlocated-more">Mais {semLocalizacao - 8} imóvel(is). Refine os filtros para localizar.</div>}
          </div>
        )}

        {modo === "calor" ? (
          <div className="map-legend">
            <div className="map-legend-title">Calor da captação</div>
            {angariadosLocalizados === 0 ? (
              <div className="map-legend-row">Nenhum imóvel angariado localizado ainda.</div>
            ) : (
              <>
                <div className="map-legend-gradient" style={{ background: GRADIENTE_CSS }} />
                <div className="map-legend-scale">
                  <span>menos</span>
                  <span>mais captação</span>
                </div>
              </>
            )}
          </div>
        ) : (
          <div className="map-legend">
            <div className="map-legend-title">
              <span>Legenda</span>
              {filtro && (
                <button type="button" className="map-legend-clear" onClick={() => setFiltro(null)}>
                  ver todos
                </button>
              )}
            </div>
            {CATEGORIAS_MAPA.map((c) => {
              const total = contagem[c.id];
              const ativo = filtro === c.id;
              // Com um filtro ativo, as outras categorias ficam apagadas; sem
              // nenhum imóvel na categoria, a linha não filtra (não há o que ver).
              const apagado = filtro != null && !ativo;
              return (
                <button
                  key={c.id}
                  type="button"
                  className={`map-legend-row map-legend-filtro${ativo ? " ativo" : ""}${apagado ? " apagado" : ""}`}
                  aria-pressed={ativo}
                  disabled={total === 0}
                  title={total === 0 ? "Nenhum imóvel localizado nesta categoria" : "Clique para ver só esta categoria"}
                  onClick={() => setFiltro(ativo ? null : c.id)}
                >
                  <span className="map-legend-dot" style={{ background: c.cor }}></span>
                  <span className="map-legend-label">{c.label}</span>
                  <span className="map-legend-count">{total}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>
      <section className="map-territorial" aria-labelledby="map-territorial-title">
        <div className="map-territorial-head">
          <div>
            <h2 id="map-territorial-title">Leitura territorial</h2>
            <p>A IA interpreta o recorte atual somente quando você solicitar.</p>
          </div>
          {analiseAtual && (
            <button type="button" className="btn btn-sm" onClick={pedirLeituraIa} disabled={iaCarregando || !territorial.concentracao}>
              {iaCarregando ? "Analisando…" : "Atualizar análise"}
            </button>
          )}
        </div>
        {!analiseAtual ? (
          <div className="map-territorial-cta">
            <div className="map-territorial-cta-icon" aria-hidden="true">✦</div>
            <div className="map-territorial-cta-copy">
              <span>Leitura sob demanda</span>
              <strong>{acaoIa ? "Os filtros mudaram. Quer analisar este novo recorte?" : "Descubra onde agir primeiro"}</strong>
              <p>A IA cruza concentração, conversão e volume por bairro. Ela devolve quatro sinais curtos sem alterar nenhum dado.</p>
            </div>
            <button
              type="button"
              className="btn btn-primary map-territorial-cta-btn"
              onClick={pedirLeituraIa}
              disabled={iaCarregando || !iaDisponivel || !territorial.concentracao}
              title={!iaDisponivel ? "A IA não está disponível para esta conta" : undefined}
            >
              {iaCarregando ? "Analisando mapa…" : iaDisponivel ? "Analisar mapa com IA" : "IA indisponível nesta conta"}
            </button>
          </div>
        ) : (
        <div className="map-territorial-grid">
          <article className="map-territorial-card oportunidade">
            <div className="map-territorial-icon" aria-hidden="true">↗</div>
            <span className="map-territorial-kicker">Melhor oportunidade</span>
            <strong>{territorial.oportunidade?.bairro || "Sem amostra suficiente"}</strong>
            <p>{territorial.oportunidade ? `${territorial.oportunidade.conversao.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% de conversão em ${territorial.oportunidade.total} registros.` : "São necessários ao menos 3 registros no bairro."}</p>
            {territorial.oportunidade && <div className="map-territorial-meter"><i style={{ width: `${Math.min(100, territorial.oportunidade.conversao)}%` }} /></div>}
            {territorial.oportunidade && <button type="button" onClick={() => setBairro(territorial.oportunidade!.bairro)}>Filtrar região</button>}
          </article>
          <article className="map-territorial-card atencao">
            <div className="map-territorial-icon" aria-hidden="true">!</div>
            <span className="map-territorial-kicker">Ponto de atenção</span>
            <strong>{territorial.atencao?.bairro || "Nenhum alerta relevante"}</strong>
            <p>{territorial.atencao ? `${territorial.atencao.total} registros e ${territorial.atencao.conversao.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% de conversão.` : "Nenhum bairro com amostra suficiente está abaixo da média."}</p>
            {territorial.atencao && <div className="map-territorial-badge">{Math.max(0, territorial.mediaConversao - territorial.atencao.conversao).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} p.p. abaixo da média</div>}
            {territorial.atencao && <button type="button" onClick={() => setBairro(territorial.atencao!.bairro)}>Examinar região</button>}
          </article>
          <article className="map-territorial-card concentracao">
            <div className="map-territorial-icon" aria-hidden="true">◎</div>
            <span className="map-territorial-kicker">Maior concentração</span>
            <strong>{territorial.concentracao?.bairro || "Sem bairros informados"}</strong>
            <p>{territorial.concentracao ? `${territorial.concentracao.total} registros, com ${territorial.concentracao.ganhas} ${territorial.concentracao.ganhas === 1 ? "captação ganha" : "captações ganhas"}.` : "Informe o bairro dos imóveis para comparar regiões."}</p>
            {territorial.concentracao && <div className="map-territorial-badge">{participacaoConcentracao.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% do recorte</div>}
            {territorial.concentracao && <button type="button" onClick={() => setBairro(territorial.concentracao!.bairro)}>Ver no mapa</button>}
          </article>
          <article className="map-territorial-card acao">
            <div className="map-territorial-icon" aria-hidden="true">✦</div>
            <span className="map-territorial-kicker">Próxima ação</span>
            <strong>Sugestão da IA</strong>
            <p>{acaoIa?.texto}</p>
          </article>
        </div>
        )}
      </section>
    </>
  );
}
