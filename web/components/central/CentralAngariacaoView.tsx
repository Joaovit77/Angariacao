"use client";

import Image, { type ImageLoaderProps } from "next/image";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSessao } from "@/components/SessaoProvider";
import { ORIGEM_GARIMPO_SITE } from "@/lib/constantes";
import { buscarNaCentral } from "@/lib/centralAngariacao";
import {
  avaliarOportunidade,
  numeroOpcional,
  type PeriodoPublicacao,
  rotuloPortal,
  textoParaPreCadastro,
  type AnuncioCentralAngariacao,
  type PortalAngariacao,
  type ResultadoBuscaCentral,
} from "@/lib/calculo/centralAngariacao";
import { nomePadraoBuscaRadar, type EstadoRadar } from "@/lib/calculo/radarAngariacao";
import {
  chaveAnuncio,
  situacaoRepeticaoCentral,
  urlsDosImoveis,
} from "@/lib/calculo/repeticaoCentralAngariacao";
import { fmtMoney } from "@/lib/formatadores";
import { fmtDataHoraIso } from "@/lib/datas";
import {
  urlInvestigadorDoComparavel,
  urlInvestigadorDoRadarAnuncio,
} from "@/lib/calculo/contextoInvestigador";
import { carregarIdsComparaveisDosAnuncios } from "@/lib/persistencia/referenciasInvestigador";
import { carregarChavesAnunciosCentralVisualizados } from "@/lib/persistencia/historicoCentralAngariacao";
import { marcarAnuncioCentralComoVisualizado } from "@/lib/mutacoes";
import {
  carregarRadar,
  definirBuscaRadarAtiva,
  excluirBuscaRadar,
  marcarRadarComoVisto,
  publicarAtualizacaoRadar,
  salvarBuscaRadar,
  verificarBuscaRadar,
  EVENTO_RADAR_ATUALIZADO,
} from "@/lib/radarAngariacao";
import { useAppStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import { useUiModal } from "@/lib/uiModal";

const carregarImagemPortal = ({ src }: ImageLoaderProps) => src;

type Aba = "buscar" | "resultados" | "selecionados" | "radar";

export default function CentralAngariacaoView() {
  const { usuario } = useSessao();
  const abrirPreCadastro = useUiModal((s) => s.abrirPreCadastro);
  const imoveis = useAppStore((s) => s.imoveis);
  const [aba, setAba] = useState<Aba>("buscar");
  const [portal, setPortal] = useState<PortalAngariacao>("olx");
  const [cidade, setCidade] = useState("Londrina");
  const [estado, setEstado] = useState("PR");
  const [bairro, setBairro] = useState("");
  const [tipo, setTipo] = useState("");
  const [valorMin, setValorMin] = useState("");
  const [valorMax, setValorMax] = useState("");
  const [dormitorios, setDormitorios] = useState("");
  const [somenteProprietario, setSomenteProprietario] = useState(true);
  const [diasPublicacao, setDiasPublicacao] = useState<PeriodoPublicacao | null>(null);
  const [buscando, setBuscando] = useState(false);
  const [resultado, setResultado] = useState<ResultadoBuscaCentral | null>(null);
  const [selecionados, setSelecionados] = useState<AnuncioCentralAngariacao[]>([]);
  const [filtrosResultado, setFiltrosResultado] = useState<Parameters<typeof buscarNaCentral>[0] | null>(null);
  const [radar, setRadar] = useState<EstadoRadar>({ buscas: [], anuncios: [] });
  const [carregandoRadar, setCarregandoRadar] = useState(true);
  const [salvandoRadar, setSalvandoRadar] = useState(false);
  const [preparandoRadar, setPreparandoRadar] = useState(false);
  const [nomeBuscaRadar, setNomeBuscaRadar] = useState("");
  const [verificandoRadar, setVerificandoRadar] = useState<string | null>(null);
  const [anunciosVisualizados, setAnunciosVisualizados] = useState<Set<string>>(() => new Set());
  const [idsComparaveis, setIdsComparaveis] = useState<Map<string, string>>(() => new Map());
  const [mostrarOcultos, setMostrarOcultos] = useState(false);
  const radarNovos = useAppStore((s) => s.radarNovos);
  const setRadarNovos = useAppStore((s) => s.setRadarNovos);

  async function recarregarRadar() {
    try {
      const estado = await carregarRadar();
      setRadar(estado);
      setRadarNovos(estado.anuncios.filter((item) => !item.visto).length);
    } catch {
      toast("Não foi possível carregar o Radar agora.", "error");
    } finally {
      setCarregandoRadar(false);
    }
  }

  useEffect(() => {
    const quadro = window.requestAnimationFrame(() => {
      if (new URLSearchParams(window.location.search).get("aba") === "radar") setAba("radar");
      void recarregarRadar();
    });
    const atualizar = () => void recarregarRadar();
    window.addEventListener(EVENTO_RADAR_ATUALIZADO, atualizar);
    return () => {
      window.cancelAnimationFrame(quadro);
      window.removeEventListener(EVENTO_RADAR_ATUALIZADO, atualizar);
    };
    // A função usa somente setters estáveis; a carga acontece uma vez no mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!usuario?.id) return;
    let cancelado = false;
    carregarChavesAnunciosCentralVisualizados()
      .then((chaves) => {
        if (!cancelado) setAnunciosVisualizados(chaves);
      })
      .catch(() => {
        if (!cancelado) toast("Não foi possível carregar o histórico de anúncios visualizados.", "error");
      });
    return () => {
      cancelado = true;
    };
  }, [usuario?.id]);

  const urlsNaCarteira = useMemo(() => {
    return urlsDosImoveis(imoveis);
  }, [imoveis]);

  const novosPorBusca = useMemo(() => {
    const contagem = new Map<string, number>();
    for (const item of radar.anuncios) {
      if (!item.visto) contagem.set(item.buscaId, (contagem.get(item.buscaId) || 0) + 1);
    }
    return contagem;
  }, [radar.anuncios]);

  async function buscar() {
    if (!cidade.trim()) return;
    setBuscando(true);
    setIdsComparaveis(new Map());
    const filtros = {
      portal,
      cidade,
      estado,
      bairro: bairro || undefined,
      tipo: tipo || undefined,
      valorMin: numeroOpcional(valorMin),
      valorMax: numeroOpcional(valorMax),
      dormitorios: numeroOpcional(dormitorios),
      somenteProprietario: (portal === "olx" || portal === "wimoveis") && somenteProprietario,
      diasPublicacao: portal === "olx" ? diasPublicacao : null,
    } satisfies Parameters<typeof buscarNaCentral>[0];
    const dados = await buscarNaCentral(filtros);
    setResultado(dados);
    setFiltrosResultado(filtros);
    if (usuario?.id && dados.anuncios.length) {
      try {
        setIdsComparaveis(await carregarIdsComparaveisDosAnuncios(usuario.id, dados.anuncios));
      } catch {
        toast("Os resultados foram carregados, mas os atalhos do Investigador estão indisponíveis agora.", "error");
      }
    }
    setBuscando(false);
    setAba("resultados");
  }

  async function salvarNoRadar() {
    if (!usuario || !resultado || !filtrosResultado) return;
    const nome = nomeBuscaRadar.trim();
    if (!nome) return;
    setSalvandoRadar(true);
    try {
      await salvarBuscaRadar(usuario.id, nome, filtrosResultado, resultado.anuncios);
      toast("Busca salva. O Radar avisará somente sobre anúncios que surgirem daqui para frente.");
      await recarregarRadar();
      setAba("radar");
      setPreparandoRadar(false);
    } catch {
      toast("Não foi possível salvar esta busca no Radar.", "error");
    } finally {
      setSalvandoRadar(false);
    }
  }

  function prepararSalvarNoRadar() {
    if (!filtrosResultado) return;
    setNomeBuscaRadar(nomePadraoBuscaRadar(filtrosResultado));
    setPreparandoRadar(true);
  }

  async function verificarAgora(buscaId: string) {
    if (!usuario) return;
    const busca = radar.buscas.find((item) => item.id === buscaId);
    if (!busca) return;
    setVerificandoRadar(buscaId);
    try {
      const novos = await verificarBuscaRadar(usuario.id, busca);
      toast(novos.length ? `${novos.length} anúncio${novos.length === 1 ? " novo encontrado" : "s novos encontrados"}.` : "Radar verificado: nada novo por enquanto.");
      publicarAtualizacaoRadar();
      await recarregarRadar();
    } catch (erro) {
      toast(erro instanceof Error ? erro.message : "Não foi possível verificar esta busca.", "error");
    } finally {
      setVerificandoRadar(null);
    }
  }

  async function alternarRadar(buscaId: string, ativo: boolean) {
    try {
      await definirBuscaRadarAtiva(buscaId, ativo);
      await recarregarRadar();
    } catch {
      toast("Não foi possível alterar esta busca.", "error");
    }
  }

  async function removerRadar(buscaId: string) {
    if (!window.confirm("Excluir esta busca e o histórico de anúncios encontrados por ela?")) return;
    try {
      await excluirBuscaRadar(buscaId);
      await recarregarRadar();
      toast("Busca removida do Radar.");
    } catch {
      toast("Não foi possível excluir esta busca.", "error");
    }
  }

  async function marcarTodosVistos() {
    try {
      await marcarRadarComoVisto();
      await recarregarRadar();
    } catch {
      toast("Não foi possível atualizar os anúncios.", "error");
    }
  }

  function alternarSelecionado(anuncio: AnuncioCentralAngariacao) {
    setSelecionados((atuais) =>
      atuais.some((a) => a.url === anuncio.url)
        ? atuais.filter((a) => a.url !== anuncio.url)
        : [...atuais, anuncio],
    );
  }

  function importar(anuncio: AnuncioCentralAngariacao) {
    void registrarVisualizacao(anuncio);
    abrirPreCadastro({
      endereco: anuncio.endereco || "",
      bairro: anuncio.bairro || "",
      cidade: anuncio.cidade || cidade,
      estado,
      origemImovel: anuncio.portal === "olx" ? "OLX / Canal Pro" : ORIGEM_GARIMPO_SITE,
      valorAluguel: anuncio.preco,
      textoAnuncio: textoParaPreCadastro(anuncio),
    });
  }

  async function registrarVisualizacao(anuncio: AnuncioCentralAngariacao) {
    if (!usuario) return;
    const chave = chaveAnuncio(anuncio);
    if (anunciosVisualizados.has(chave)) return;
    try {
      await marcarAnuncioCentralComoVisualizado(anuncio, usuario.id);
      setAnunciosVisualizados((atuais) => new Set(atuais).add(chave));
    } catch {
      toast("Não foi possível marcar o anúncio como visualizado.", "error");
    }
  }

  const lista = aba === "selecionados" ? selecionados : (resultado?.anuncios || []);
  const repeticaoDo = (anuncio: AnuncioCentralAngariacao) => situacaoRepeticaoCentral(anuncio, imoveis, urlsNaCarteira);
  const estaOculto = (anuncio: AnuncioCentralAngariacao) => anunciosVisualizados.has(chaveAnuncio(anuncio)) || repeticaoDo(anuncio).ocultar;
  const listaOculta = aba === "selecionados" ? [] : lista.filter(estaOculto);
  const listaVisivel = aba === "selecionados" || mostrarOcultos ? lista : lista.filter((anuncio) => !estaOculto(anuncio));
  const anunciosRadarOcultos = radar.anuncios.filter((item) => estaOculto(item.anuncio));
  const anunciosRadarVisiveis = mostrarOcultos ? radar.anuncios : radar.anuncios.filter((item) => !estaOculto(item.anuncio));

  return (
    <>
      <div className="page-head central-head">
        <div>
          <h2 className="page-title">Central de Angariação</h2>
          <p className="page-sub">Encontre oportunidades nos portais e revise antes de enviar ao Pipeline.</p>
        </div>
        <span className="central-badge">Busca sob demanda</span>
      </div>

      <div className="central-tabs" role="tablist" aria-label="Central de Angariação">
        <button className={aba === "buscar" ? "active" : ""} onClick={() => setAba("buscar")}>Pesquisar</button>
        <button className={aba === "resultados" ? "active" : ""} onClick={() => setAba("resultados")}>
          Resultados {resultado?.anuncios.length ? `(${resultado.anuncios.length})` : ""}
        </button>
        <button className={aba === "selecionados" ? "active" : ""} onClick={() => setAba("selecionados")}>
          Selecionados ({selecionados.length})
        </button>
        <button className={aba === "radar" ? "active" : ""} onClick={() => setAba("radar")}>
          Radar {radarNovos ? `(${radarNovos})` : ""}
        </button>
      </div>

      {aba === "radar" ? (
        <section className="central-radar">
          <div className="central-radar-hero card">
            <div>
              <span className="central-radar-kicker">Radar Inteligente</span>
              <h3>Novas oportunidades, sem repetir anúncio</h3>
              <p>O Radar faz uma checagem diária mesmo com o painel fechado. Enquanto você trabalha no sistema, buscas vencidas também podem ser atualizadas a cada 2 horas. O primeiro resultado vira a referência e não gera alerta.</p>
            </div>
            <div className="central-radar-metricas">
              <strong>{radar.buscas.filter((item) => item.ativo).length}<small>buscas ativas</small></strong>
              <strong>{radarNovos}<small>anúncios novos</small></strong>
            </div>
          </div>

          {carregandoRadar ? (
            <div className="card central-empty">Carregando o Radar…</div>
          ) : !radar.buscas.length ? (
            <div className="card empty-state central-empty">
              <div className="empty-icon">⌁</div>
              <div className="empty-title">Nenhuma busca salva ainda</div>
              <div className="empty-sub">Faça uma pesquisa, revise o resultado e clique em “Salvar no Radar”.</div>
              <button className="btn btn-primary" type="button" onClick={() => setAba("buscar")}>Criar primeira busca</button>
            </div>
          ) : (
            <>
              <div className="central-radar-buscas">
                {radar.buscas.map((busca) => {
                  const novos = novosPorBusca.get(busca.id) || 0;
                  return (
                    <article className="card central-radar-busca" key={busca.id}>
                      <div>
                        <div className="central-card-tags"><span>{busca.filtros.portal}</span>{novos > 0 && <span className="radar-novo">{novos} novo{novos === 1 ? "" : "s"}</span>}</div>
                        <h3>{busca.nome}</h3>
                        <p>{[busca.filtros.tipo, busca.filtros.bairro, busca.filtros.cidade].filter(Boolean).join(" · ")}</p>
                        <small>{busca.ultimoCheck ? `Última verificação: ${fmtDataHoraIso(busca.ultimoCheck)}` : "Ainda não verificada"}</small>
                      </div>
                      <div className="central-radar-actions">
                        <label className="central-radar-toggle"><input type="checkbox" checked={busca.ativo} onChange={(e) => void alternarRadar(busca.id, e.target.checked)} /> Ativa</label>
                        <button className="btn btn-ghost" type="button" disabled={verificandoRadar === busca.id} onClick={() => void verificarAgora(busca.id)}>{verificandoRadar === busca.id ? "Verificando…" : "Verificar agora"}</button>
                        <button className="btn btn-ghost" type="button" onClick={() => void removerRadar(busca.id)}>Excluir</button>
                      </div>
                    </article>
                  );
                })}
              </div>

              <div className="central-radar-lista-head">
                <div><h3>Anúncios encontrados</h3><span>Priorizados por sinais objetivos do anúncio</span></div>
                <div className="central-result-actions">
                  {anunciosRadarOcultos.length > 0 && <button className="btn btn-ghost" type="button" onClick={() => setMostrarOcultos((atual) => !atual)}>{mostrarOcultos ? "Ocultar repetidos" : `Mostrar ${anunciosRadarOcultos.length} visualizado${anunciosRadarOcultos.length === 1 ? "" : "s"}/repetido${anunciosRadarOcultos.length === 1 ? "" : "s"}`}</button>}
                  {radarNovos > 0 && <button className="btn btn-ghost" type="button" onClick={() => void marcarTodosVistos()}>Marcar todos como vistos</button>}
                </div>
              </div>
              {!anunciosRadarVisiveis.length ? <div className="card central-empty">{radar.anuncios.length ? "Todos os anúncios encontrados já foram visualizados ou estão no pipeline." : "O histórico começará a aparecer quando o Radar encontrar anúncios novos."}</div> : (
                <div className="central-result-grid">
                  {anunciosRadarVisiveis.map((item) => {
                    const anuncio = item.anuncio;
                    const avaliacao = avaliarOportunidade(anuncio);
                    const repeticao = repeticaoDo(anuncio);
                    const visualizado = anunciosVisualizados.has(chaveAnuncio(anuncio));
                    const duplicado = repeticao.ocultar;
                    return (
                      <article className={`card central-card${item.visto ? "" : " radar-nao-visto"}${visualizado ? " central-card-visualizado" : ""}`} key={item.id}>
                        <div className="central-card-media">{anuncio.imagem ? <Image loader={carregarImagemPortal} unoptimized src={`/api/central-angariacao/imagem?url=${encodeURIComponent(anuncio.imagem)}`} alt="" fill sizes="(max-width: 720px) 100vw, 33vw" /> : <span>Sem foto disponibilizada</span>}</div>
                        <div className="central-card-body">
                          <div className="central-card-tags"><span>{rotuloPortal(anuncio.portal)}</span><span className={`radar-score ${avaliacao.faixa}`}>{avaliacao.nota}/100</span>{!item.visto && <span className="radar-novo">Novo</span>}{visualizado && <span className="visualizado">Visualizado</span>}{repeticao.motivo === "url-na-carteira" && <span className="duplicado">Já está na carteira</span>}{repeticao.motivo === "casa-no-pipeline" && <span className="duplicado">Casa já no pipeline</span>}{repeticao.motivo === "apartamento-no-endereco" && <span className="endereco-pipeline">Endereço no pipeline</span>}</div>
                          <h3>{anuncio.titulo}</h3>
                          <strong className="central-price">{anuncio.preco ? fmtMoney(anuncio.preco) : "Preço não informado"}</strong>
                          <p>{[anuncio.endereco, anuncio.bairro, anuncio.cidade].filter(Boolean).join(" · ") || "Localização não informada"}</p>
                          <div className="central-radar-motivos">{avaliacao.motivos.slice(0, 3).map((motivo) => <span key={motivo}>✓ {motivo}</span>)}</div>
                          <div className="central-card-actions">
                            <a className="btn btn-ghost" href={anuncio.url} target="_blank" rel="noreferrer" onClick={() => void registrarVisualizacao(anuncio)}>Ver anúncio ↗</a>
                            <Link className="btn btn-ghost" href={urlInvestigadorDoRadarAnuncio(item.id)}>Investigar na web</Link>
                            <button className="btn btn-primary" type="button" disabled={duplicado} onClick={() => importar(anuncio)}>Revisar e importar</button>
                          </div>
                        </div>
                      </article>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </section>
      ) : aba === "buscar" ? (
        <section className="card central-filtros">
          <div className="central-intro">
            <strong>Onde vamos procurar?</strong>
            <span>A consulta só acontece quando você clicar em Buscar.</span>
          </div>
          <div className="central-portal-grid">
            {(["olx", "chaves-na-mao", "wimoveis", "viva-real"] as const).map((item) => (
              <button
                key={item}
                type="button"
                className={`central-portal${portal === item ? " active" : ""}`}
                onClick={() => setPortal(item)}
              >
                <span>{rotuloPortal(item)}</span>
                <small>{{
                  olx: "Foco em anúncio direto",
                  "chaves-na-mao": "Maior chance de localização detalhada",
                  wimoveis: "Direto com proprietário e endereço",
                  "viva-real": "Grande volume com localização",
                }[item]}</small>
              </button>
            ))}
          </div>
          <div className="central-form-grid">
            <label>Cidade<input value={cidade} onChange={(e) => setCidade(e.target.value)} /></label>
            <label>UF<input value={estado} maxLength={2} onChange={(e) => setEstado(e.target.value.toUpperCase())} /></label>
            <label>Bairro<input value={bairro} onChange={(e) => setBairro(e.target.value)} placeholder="Todos" /></label>
            <label>Tipo<input value={tipo} onChange={(e) => setTipo(e.target.value)} placeholder="Apartamento, casa…" /></label>
            <label>Valor mínimo<input inputMode="numeric" value={valorMin} onChange={(e) => setValorMin(e.target.value)} placeholder="R$ 0" /></label>
            <label>Valor máximo<input inputMode="numeric" value={valorMax} onChange={(e) => setValorMax(e.target.value)} placeholder="Sem limite" /></label>
            <label>Dormitórios<input inputMode="numeric" value={dormitorios} onChange={(e) => setDormitorios(e.target.value)} placeholder="Todos" /></label>
            <label>
              Data do anúncio
              <select
                value={portal === "olx" ? (diasPublicacao || "") : ""}
                disabled={portal !== "olx"}
                onChange={(e) => setDiasPublicacao(e.target.value ? Number(e.target.value) as PeriodoPublicacao : null)}
              >
                <option value="">Todos os anúncios</option>
                <option value="1">Últimas 24 horas</option>
                <option value="7">Últimos 7 dias</option>
                <option value="30">Últimos 30 dias</option>
              </select>
            </label>
          </div>
          {portal !== "olx" && <div className="central-hint">O {rotuloPortal(portal)} não publica uma data verificável na listagem, por isso o período está disponível somente para a OLX.</div>}
          {(portal === "olx" || portal === "wimoveis") && (
            <label className="central-check">
              <input type="checkbox" checked={somenteProprietario} onChange={(e) => setSomenteProprietario(e.target.checked)} />
              Mostrar somente anúncios diretos com o proprietário
            </label>
          )}
          <div className="central-actions">
            <button type="button" className="btn btn-primary" disabled={buscando || !cidade.trim()} onClick={() => void buscar()}>
              {buscando ? "Consultando portal…" : "Buscar imóveis"}
            </button>
          </div>
        </section>
      ) : (
        <section>
          {resultado?.aviso && aba === "resultados" && <div className="central-aviso">{resultado.aviso}</div>}
          {aba === "resultados" && resultado?.urlPesquisa && (
            <div className="central-result-head">
              <span>{listaVisivel.length} de {resultado.anuncios.length} resultado{resultado.anuncios.length === 1 ? "" : "s"} exibido{listaVisivel.length === 1 ? "" : "s"}</span>
              <div className="central-result-actions">
                {listaOculta.length > 0 && <button className="btn btn-ghost" type="button" onClick={() => setMostrarOcultos((atual) => !atual)}>{mostrarOcultos ? "Ocultar visualizados e repetidos" : `Mostrar ${listaOculta.length} visualizado${listaOculta.length === 1 ? "" : "s"}/repetido${listaOculta.length === 1 ? "" : "s"}`}</button>}
                {preparandoRadar ? (
                  <div className="central-radar-nome">
                    <input aria-label="Nome da busca no Radar" value={nomeBuscaRadar} maxLength={120} onChange={(e) => setNomeBuscaRadar(e.target.value)} autoFocus />
                    <button className="btn btn-primary" type="button" disabled={salvandoRadar || !nomeBuscaRadar.trim()} onClick={() => void salvarNoRadar()}>{salvandoRadar ? "Salvando…" : "Confirmar"}</button>
                    <button className="btn btn-ghost" type="button" onClick={() => setPreparandoRadar(false)}>Cancelar</button>
                  </div>
                ) : <button className="btn btn-primary" type="button" disabled={!resultado.ok} onClick={prepararSalvarNoRadar}>Salvar no Radar</button>}
                <a className="btn btn-ghost" href={resultado.urlPesquisa} target="_blank" rel="noreferrer">Abrir pesquisa no portal ↗</a>
              </div>
            </div>
          )}
          {!listaVisivel.length ? (
            <div className="card empty-state central-empty">
              <div className="empty-icon">⌕</div>
              <div className="empty-title">{aba === "selecionados" ? "Nenhum anúncio selecionado" : lista.length ? "Todos os resultados já foram tratados" : "Nenhum resultado disponível"}</div>
              <div className="empty-sub">{aba === "selecionados" ? "Marque resultados interessantes para comparar antes de importar." : lista.length ? "Use “Mostrar visualizados e repetidos” para revisar os anúncios ocultados." : "Ajuste os filtros ou abra a pesquisa diretamente no portal."}</div>
            </div>
          ) : (
            <div className="central-result-grid">
              {listaVisivel.map((anuncio) => {
                const escolhido = selecionados.some((a) => a.url === anuncio.url);
                const comparavelId = idsComparaveis.get(chaveAnuncio(anuncio));
                const repeticao = repeticaoDo(anuncio);
                const visualizado = anunciosVisualizados.has(chaveAnuncio(anuncio));
                const duplicado = repeticao.ocultar;
                const avaliacao = avaliarOportunidade(anuncio);
                return (
                  <article className={`card central-card${visualizado ? " central-card-visualizado" : ""}`} key={`${anuncio.portal}:${anuncio.idExterno}`}>
                    <div className="central-card-media">
                      {anuncio.imagem ? (
                        <Image
                          loader={carregarImagemPortal}
                          unoptimized
                          src={`/api/central-angariacao/imagem?url=${encodeURIComponent(anuncio.imagem)}`}
                          alt=""
                          fill
                          sizes="(max-width: 720px) 100vw, 33vw"
                        />
                      ) : <span>Sem foto disponibilizada</span>}
                    </div>
                    <div className="central-card-body">
                      <div className="central-card-tags">
                        <span>{rotuloPortal(anuncio.portal)}</span>
                        <span className={`radar-score ${avaliacao.faixa}`}>Oportunidade {avaliacao.nota}/100</span>
                        {anuncio.publicadoTexto && <span>{anuncio.publicadoTexto}</span>}
                        {visualizado && <span className="visualizado">Visualizado</span>}
                        {repeticao.motivo === "url-na-carteira" && <span className="duplicado">Já está na carteira</span>}
                        {repeticao.motivo === "casa-no-pipeline" && <span className="duplicado">Casa já no pipeline</span>}
                        {repeticao.motivo === "apartamento-no-endereco" && <span className="endereco-pipeline">Endereço no pipeline</span>}
                      </div>
                      <h3>{anuncio.titulo}</h3>
                      <strong className="central-price">{anuncio.preco ? fmtMoney(anuncio.preco) : "Preço não informado"}</strong>
                      <p>{[anuncio.endereco, anuncio.bairro, anuncio.cidade].filter(Boolean).join(" · ") || "Localização não informada"}</p>
                      <div className="central-card-actions">
                        <a className="btn btn-ghost" href={anuncio.url} target="_blank" rel="noreferrer" onClick={() => void registrarVisualizacao(anuncio)}>Ver anúncio ↗</a>
                        {comparavelId ? <Link className="btn btn-ghost" href={urlInvestigadorDoComparavel(comparavelId)}>Investigar na web</Link> : null}
                        <button className="btn btn-ghost" type="button" onClick={() => alternarSelecionado(anuncio)}>{escolhido ? "Remover" : "Selecionar"}</button>
                        <button className="btn btn-primary" type="button" disabled={duplicado} onClick={() => importar(anuncio)}>Revisar e importar</button>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}
    </>
  );
}
