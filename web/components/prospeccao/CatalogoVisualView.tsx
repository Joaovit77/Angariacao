"use client";

/* ================================================================
   CATÁLOGO VISUAL DO GARIMPO EM CAMPO (C12)

   Responde "quais imóveis eu já garimpei e fotografei?" com uma grade de
   cards, um por identificado com foto. É camada de LEITURA: lê
   `imoveis_identificados`, as passagens e as fotos que já existem, escolhe
   a capa na leitura e abre o MESMO detalhe do Garimpo. Não grava, não
   promove, não classifica, não chama IA; o bucket continua privado e as
   miniaturas chegam por URL assinada, uma chamada por página.
   ================================================================ */
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";

import { ROTULOS_SITUACAO } from "@/components/prospeccao/CardIdentificado";
import { BUCKET_FACHADAS, TTL_URL_FACHADA_SEGUNDOS } from "@/components/prospeccao/CapturaFachada";
import { TIPOS_IMOVEL } from "@/lib/constantes";
import { getSupabase } from "@/lib/persistencia/supabase";
import {
  listarCatalogoVisual,
  SITUACOES_VISIVEIS_PROSPECCAO,
  type FiltrosCatalogoVisual,
  type PaginaCatalogoVisual,
} from "@/lib/prospeccao";

import CardCatalogoVisual from "./CardCatalogoVisual";
import AlternadorGarimpo, { ROTAS_GARIMPO } from "./AlternadorGarimpo";
import styles from "./Prospeccao.module.css";

/** Quanto esperar depois da última tecla antes de consultar. */
const ATRASO_BUSCA_MS = 300;
const POR_PAGINA = 24;

export const ROTA_GARIMPO = ROTAS_GARIMPO.garimpo;
export const VAZIO_CATALOGO = "Nenhum imóvel fotografado no Garimpo ainda.";
export const VAZIO_FILTRO = "Nenhum imóvel fotografado corresponde aos filtros.";

/** URLs assinadas das miniaturas de UMA página, numa chamada só ao
    Storage (mesmo mecanismo da foto grande em `CapturaFachada`). O bucket
    continua privado; a URL vive o TTL e não é gravada em lugar nenhum.
    Caminho sem URL fica fora do mapa e o card diz "imagem indisponível". */
export async function assinarMiniaturasFachada(
  caminhos: readonly string[],
  opcoes: { bucket: string; ttlSegundos: number },
  client = getSupabase(),
): Promise<Map<string, string>> {
  const urls = new Map<string, string>();
  const unicos = [...new Set(caminhos)];
  if (!unicos.length) return urls;
  const { data, error } = await client.storage.from(opcoes.bucket).createSignedUrls(unicos, opcoes.ttlSegundos);
  if (error || !data) return urls;
  for (const item of data) {
    if (item.path && item.signedUrl && !item.error) urls.set(item.path, item.signedUrl);
  }
  return urls;
}

/** Abre o detalhe do Garimpo: a mesma tela, o mesmo painel, o mesmo
    histórico. O `abrir` é lido pela `ProspeccaoView` ao montar. */
export function urlDetalheGarimpo(id: string): string {
  return `${ROTA_GARIMPO}?abrir=${encodeURIComponent(id)}`;
}

/** As situações visíveis do Garimpo, menos `investigando`, que existe no
    CHECK do banco mas nenhum código escreve (investigar não é transição):
    oferecer o filtro seria oferecer uma lista sempre vazia. */
export const SITUACOES_FILTRO_CATALOGO = SITUACOES_VISIVEIS_PROSPECCAO.filter(
  (situacao) => situacao !== "investigando",
);

export function rotuloTotalCatalogo(total: number): string {
  return total === 1 ? "1 imóvel fotografado" : `${total} imóveis fotografados`;
}

/** O resultado carrega a CHAVE dos parâmetros que o produziram; "está
    carregando" é a chave atual ainda não ter resultado. Assim o efeito
    não precisa marcar estado antes de buscar. */
type Resultado =
  | { chave: string; fase: "erro" }
  | { chave: string; fase: "pronto"; pagina: PaginaCatalogoVisual; urls: Map<string, string> };

export default function CatalogoVisualView({
  dependencias,
}: {
  /** Injetáveis para teste; em produção, a fronteira real. */
  dependencias?: {
    listar?: typeof listarCatalogoVisual;
    assinar?: (caminhos: readonly string[]) => Promise<Map<string, string>>;
  };
}) {
  const router = useRouter();
  const listar = dependencias?.listar ?? listarCatalogoVisual;
  const assinarInjetado = dependencias?.assinar;
  // Estável entre renders: é dependência do efeito de carga.
  const assinar = useMemo(
    () => assinarInjetado
      ?? ((caminhos: readonly string[]) =>
        assinarMiniaturasFachada(caminhos, { bucket: BUCKET_FACHADAS, ttlSegundos: TTL_URL_FACHADA_SEGUNDOS })),
    [assinarInjetado],
  );

  const [busca, setBusca] = useState("");
  const [buscaAplicada, setBuscaAplicada] = useState("");
  const [tipo, setTipo] = useState<FiltrosCatalogoVisual["tipo"]>("");
  const [situacao, setSituacao] = useState<FiltrosCatalogoVisual["situacao"]>("");
  const [paginaAtual, setPaginaAtual] = useState(1);
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [tentativa, setTentativa] = useState(0);
  const pedido = useRef(0);
  const chave = JSON.stringify([paginaAtual, buscaAplicada, tipo, situacao, tentativa]);

  // O texto espera a pessoa parar de digitar; tipo e situação valem na hora.
  useEffect(() => {
    const temporizador = window.setTimeout(() => {
      setBuscaAplicada(busca);
      setPaginaAtual(1);
    }, ATRASO_BUSCA_MS);
    return () => window.clearTimeout(temporizador);
  }, [busca]);

  useEffect(() => {
    const meuPedido = ++pedido.current;
    const [pagina, busca, tipoFiltro, situacaoFiltro] = JSON.parse(chave) as [number, string, string, string];
    void (async () => {
      try {
        const resposta = await listar({
          pagina,
          porPagina: POR_PAGINA,
          filtros: {
            busca,
            tipo: tipoFiltro as FiltrosCatalogoVisual["tipo"],
            situacao: situacaoFiltro as FiltrosCatalogoVisual["situacao"],
          },
        });
        // Uma chamada ao Storage por página: o ORIGINAL de cada capa (é ele
        // que o card mostra, senão a miniatura de 320 px vira borrão em
        // qualquer tela com DPR alto) e a miniatura, como fallback.
        const urls = await assinar(resposta.itens.flatMap((item) => [item.capa.caminho, item.capa.caminhoMiniatura]));
        if (meuPedido !== pedido.current) return;
        setResultado({ chave, fase: "pronto", pagina: resposta, urls });
      } catch {
        if (meuPedido !== pedido.current) return;
        setResultado({ chave, fase: "erro" });
      }
    })();
  }, [assinar, chave, listar]);

  const estado = resultado && resultado.chave === chave ? resultado : { fase: "carregando" as const };
  const filtrando = Boolean(buscaAplicada.trim() || tipo || situacao);

  function abrirImovel(id: string) {
    router.push(urlDetalheGarimpo(id));
  }

  return (
    <div className={styles.pagina} data-catalogo-visual>
      <section className={styles.hero}>
        <div className={styles.heroTexto}>
          <div className={styles.heroIcone} aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <rect x="3" y="4" width="18" height="16" rx="2" />
              <path d="m3 16 5-5 4 4 3-3 6 6" />
              <circle cx="16" cy="9" r="1.5" />
            </svg>
          </div>
          <div>
            <span className={styles.sobretitulo}>MEMÓRIA DE CAMPO</span>
            <h2>Catálogo Visual</h2>
            <p className={styles.heroDescricao}>
              Os imóveis que você já fotografou no Garimpo em Campo, um card por imóvel.
            </p>
          </div>
        </div>
        <AlternadorGarimpo ativo="catalogo" />
      </section>

      <section className={styles.catalogoFiltros} aria-label="Filtros do catálogo">
        <input
          type="search"
          className={styles.catalogoBusca}
          value={busca}
          onChange={(evento) => setBusca(evento.target.value)}
          placeholder="Buscar por endereço, bairro ou cidade"
          aria-label="Buscar por endereço, bairro ou cidade"
          autoComplete="off"
        />
        <select
          value={tipo}
          onChange={(evento) => { setTipo(evento.target.value as FiltrosCatalogoVisual["tipo"]); setPaginaAtual(1); }}
          aria-label="Tipo do imóvel"
        >
          <option value="">Todos os tipos</option>
          {TIPOS_IMOVEL.map((opcao) => (
            <option value={opcao} key={opcao}>{opcao}</option>
          ))}
        </select>
        <select
          value={situacao}
          onChange={(evento) => { setSituacao(evento.target.value as FiltrosCatalogoVisual["situacao"]); setPaginaAtual(1); }}
          aria-label="Situação"
        >
          <option value="">Todas as situações</option>
          {SITUACOES_FILTRO_CATALOGO.map((opcao) => (
            <option value={opcao} key={opcao}>{ROTULOS_SITUACAO[opcao] || "Só no Garimpo"}</option>
          ))}
        </select>
        {estado.fase === "pronto" ? (
          <span className={styles.catalogoTotal} data-catalogo-total>
            {rotuloTotalCatalogo(estado.pagina.total)}
          </span>
        ) : null}
      </section>

      {estado.fase === "carregando" ? (
        <div className={styles.estado} role="status">Carregando o catálogo…</div>
      ) : estado.fase === "erro" ? (
        <div className={`${styles.estado} ${styles.erro}`} role="alert">
          <div>
            <strong>Não foi possível carregar o catálogo.</strong>
            <button type="button" className="btn btn-sm" onClick={() => setTentativa((t) => t + 1)}>
              Tentar novamente
            </button>
          </div>
        </div>
      ) : !estado.pagina.itens.length ? (
        <div className={styles.estado} data-catalogo-vazio>
          <div>
            <strong>{filtrando ? VAZIO_FILTRO : VAZIO_CATALOGO}</strong>
            {!filtrando ? (
              <p>Fotografe uma fachada no Garimpo e ela aparece aqui.</p>
            ) : null}
            <button type="button" className="btn btn-primary" onClick={() => router.push(ROTA_GARIMPO)}>
              Ir para o Garimpo
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className={styles.catalogoGrade} data-catalogo-grade>
            {estado.pagina.itens.map((item) => (
              <CardCatalogoVisual
                key={item.identificado.id}
                item={item}
                urlOriginal={estado.urls.get(item.capa.caminho) ?? null}
                urlMiniatura={estado.urls.get(item.capa.caminhoMiniatura) ?? null}
                aoAbrir={abrirImovel}
              />
            ))}
          </div>
          {estado.pagina.temMais || estado.pagina.pagina > 1 ? (
            <div className={styles.paginacao}>
              <button
                type="button"
                className="btn btn-sm"
                disabled={estado.pagina.pagina <= 1}
                onClick={() => setPaginaAtual((p) => Math.max(1, p - 1))}
              >
                Anterior
              </button>
              <span>Página {estado.pagina.pagina}</span>
              <button
                type="button"
                className="btn btn-sm"
                disabled={!estado.pagina.temMais}
                onClick={() => setPaginaAtual((p) => p + 1)}
              >
                Próxima
              </button>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}
