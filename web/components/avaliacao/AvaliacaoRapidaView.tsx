"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useSessao } from "@/components/SessaoProvider";
import EnderecoAutocompleteViaCep, {
  type EnderecoViaCepSelecionado,
} from "@/components/formularios/EnderecoAutocompleteViaCep";
import {
  DIFERENCIAIS_AVALIACAO,
  avaliarImovel,
  compararPretensao,
  descricaoSemanticaComDiferenciais,
  entradaDeImovel,
  internalComparablesProvider,
  type ConservacaoAvaliacao,
  type DiferencialAvaliacao,
  type EntradaAvaliacao,
  type FinalidadeAvaliacao,
  type OrigemExternaAvaliacao,
  type ResultadoAvaliacao,
} from "@/lib/calculo/avaliacao";
import type {
  PrefillAvaliacao,
  ReferenciaContextoAvaliacao,
} from "@/lib/calculo/contextoAvaliacao";
import { carregarContextoAvaliacao } from "@/lib/contextoAvaliacao";
import { TIPOS_IMOVEL } from "@/lib/constantes";
import { todayISO } from "@/lib/datas";
import { fmtDataHora, fmtDate, fmtMoney } from "@/lib/formatadores";
import { geocodeEndereco } from "@/lib/geo";
import {
  carregarHistoricoAvaliacoes,
  registrarAvaliacao,
  registrarValorFinalAvaliacao,
  type HistoricoAvaliacao,
} from "@/lib/persistencia/avaliacoes";
import { buscarComparaveisMercado } from "@/lib/persistencia/comparaveisMercado";
import { useAppStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import type { Imovel } from "@/lib/tipos";
import { normalizarUf, UFS_BRASIL, ufValida } from "@/lib/calculo/geografia";

interface FormularioAvaliacao {
  imovelId: string;
  finalidade: FinalidadeAvaliacao;
  endereco: string;
  bairro: string;
  cidade: string;
  estado: string;
  edificio: string;
  tipo: string;
  areaM2: string;
  quartos: number;
  banheiros: number;
  vagas: number;
  conservacao: ConservacaoAvaliacao;
  diferenciais: DiferencialAvaliacao[];
  latitude: number | null;
  longitude: number | null;
  valorProprietario: string;
}

interface AvaliacaoExibida {
  id: string;
  entrada: EntradaAvaliacao;
  resultado: ResultadoAvaliacao;
  valorProprietario: number | null;
  valorFinalCorretor: number | null;
  justificativaValorFinal: string | null;
  valorFinalEm: string | null;
  criadoEm: string;
  valorAnterior: number | null;
}

interface ReferenciaEdicaoAvaliacao {
  criadoEm: string;
}

const FORMULARIO_VAZIO: FormularioAvaliacao = {
  imovelId: "",
  finalidade: "locacao",
  endereco: "",
  bairro: "",
  cidade: "",
  estado: "",
  edificio: "",
  tipo: "Apartamento",
  areaM2: "",
  quartos: 0,
  banheiros: 0,
  vagas: 0,
  conservacao: "Bom",
  diferenciais: [],
  latitude: null,
  longitude: null,
  valorProprietario: "",
};

function formularioDoImovel(imovel: Imovel, finalidade: FinalidadeAvaliacao): FormularioAvaliacao {
  const entrada = entradaDeImovel(imovel, finalidade);
  return {
    ...FORMULARIO_VAZIO,
    imovelId: imovel.id,
    finalidade,
    endereco: entrada.endereco || "",
    bairro: entrada.bairro || "",
    cidade: entrada.cidade || "",
    estado: ufValida(entrada.estado) ? normalizarUf(entrada.estado) : "",
    edificio: entrada.edificio || "",
    tipo: entrada.tipo || "Apartamento",
    areaM2: entrada.areaM2 ? String(entrada.areaM2) : "",
    quartos: entrada.quartos ?? 0,
    banheiros: entrada.banheiros ?? 0,
    vagas: entrada.vagas ?? 0,
    latitude: entrada.latitude ?? null,
    longitude: entrada.longitude ?? null,
  };
}

function formularioDaAvaliacao(
  entrada: EntradaAvaliacao,
  valorProprietario: number | null,
  imovelId: string,
): FormularioAvaliacao {
  return {
    ...FORMULARIO_VAZIO,
    imovelId,
    finalidade: entrada.finalidade,
    endereco: entrada.endereco || "",
    bairro: entrada.bairro || "",
    cidade: entrada.cidade || "",
    estado: ufValida(entrada.estado) ? normalizarUf(entrada.estado) : "",
    edificio: entrada.edificio || "",
    tipo: entrada.tipo || "Apartamento",
    areaM2: entrada.areaM2 > 0 ? String(entrada.areaM2) : "",
    quartos: entrada.quartos ?? 0,
    banheiros: entrada.banheiros ?? 0,
    vagas: entrada.vagas ?? 0,
    conservacao: entrada.conservacao || "Bom",
    diferenciais: [...(entrada.diferenciais || [])],
    latitude: entrada.latitude ?? null,
    longitude: entrada.longitude ?? null,
    valorProprietario: valorProprietario == null ? "" : String(valorProprietario),
  };
}

function formularioInicial(imoveis: Imovel[], imovelIdInicial?: string | null): FormularioAvaliacao {
  const imovel = imovelIdInicial ? imoveis.find((item) => item.id === imovelIdInicial) : null;
  return imovel ? formularioDoImovel(imovel, "locacao") : { ...FORMULARIO_VAZIO };
}

function formularioDoContexto(prefill: PrefillAvaliacao): FormularioAvaliacao {
  return {
    ...FORMULARIO_VAZIO,
    finalidade: prefill.finalidade,
    endereco: prefill.endereco || "",
    bairro: prefill.bairro || "",
    cidade: prefill.cidade || FORMULARIO_VAZIO.cidade,
    estado: ufValida(prefill.estado) ? normalizarUf(prefill.estado) : FORMULARIO_VAZIO.estado,
    tipo: prefill.tipo || FORMULARIO_VAZIO.tipo,
    areaM2: prefill.areaM2 && prefill.areaM2 > 0 ? String(prefill.areaM2) : "",
    quartos: prefill.quartos ?? 0,
    banheiros: prefill.banheiros ?? 0,
    vagas: prefill.vagas ?? 0,
  };
}

function ControleQuantidade({
  rotulo,
  valor,
  aoMudar,
}: {
  rotulo: string;
  valor: number;
  aoMudar: (valor: number) => void;
}) {
  return (
    <div className="avaliacao-contador">
      <span>{rotulo}</span>
      <div>
        <button type="button" onClick={() => aoMudar(Math.max(0, valor - 1))} aria-label={`Diminuir ${rotulo}`}>
          −
        </button>
        <strong>{valor}</strong>
        <button type="button" onClick={() => aoMudar(valor + 1)} aria-label={`Aumentar ${rotulo}`}>
          +
        </button>
      </div>
    </div>
  );
}

function IconeAvaliacao() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M4 19V9M10 19V5M16 19v-7M22 19H2" />
      <path d="m3 6 5-3 5 4 7-5" />
    </svg>
  );
}

export default function AvaliacaoRapidaView({
  imovelIdInicial,
  referenciaInicial,
}: {
  imovelIdInicial?: string | null;
  referenciaInicial?: ReferenciaContextoAvaliacao | null;
}) {
  const { usuario } = useSessao();
  const imoveis = useAppStore((estado) => estado.imoveis);
  const [formulario, setFormulario] = useState(() => formularioInicial(imoveis, imovelIdInicial));
  const [refinamentoAberto, setRefinamentoAberto] = useState(false);
  const [processando, setProcessando] = useState(false);
  const [fase, setFase] = useState("");
  const [avaliacao, setAvaliacao] = useState<AvaliacaoExibida | null>(null);
  const [valorAnterior, setValorAnterior] = useState<number | null>(null);
  const [mostrarComparaveis, setMostrarComparaveis] = useState(false);
  const [mostrarCalculo, setMostrarCalculo] = useState(false);
  const [mostrarHistorico, setMostrarHistorico] = useState(false);
  const [historico, setHistorico] = useState<HistoricoAvaliacao[]>([]);
  const [carregandoHistorico, setCarregandoHistorico] = useState(false);
  const [referenciaEdicao, setReferenciaEdicao] = useState<ReferenciaEdicaoAvaliacao | null>(null);
  const [editorValorFinalAberto, setEditorValorFinalAberto] = useState(false);
  const [valorFinalDigitado, setValorFinalDigitado] = useState("");
  const [justificativaValorFinal, setJustificativaValorFinal] = useState("");
  const [salvandoValorFinal, setSalvandoValorFinal] = useState(false);
  const [carregandoContexto, setCarregandoContexto] = useState(Boolean(referenciaInicial));
  const [origemExterna, setOrigemExterna] = useState<OrigemExternaAvaliacao | null>(null);
  const [origemContexto, setOrigemContexto] = useState<"central" | "radar" | null>(null);
  const [avisoContexto, setAvisoContexto] = useState<string | null>(null);

  useEffect(() => {
    if (!referenciaInicial) return;
    const controle = new AbortController();
    carregarContextoAvaliacao(referenciaInicial, controle.signal)
      .then((contexto) => {
        setFormulario(formularioDoContexto(contexto.prefill));
        setOrigemExterna(contexto.origemExterna);
        setOrigemContexto(contexto.origem);
        setRefinamentoAberto(contexto.prefill.banheiros != null);
        setAvisoContexto(null);
      })
      .catch((erro) => {
        if (controle.signal.aborted) return;
        setAvisoContexto(erro instanceof Error ? erro.message : "Não foi possível carregar o anúncio indicado.");
      })
      .finally(() => {
        if (!controle.signal.aborted) setCarregandoContexto(false);
      });
    return () => controle.abort();
  }, [referenciaInicial]);

  function atualizar<K extends keyof FormularioAvaliacao>(campo: K, valor: FormularioAvaliacao[K]) {
    setFormulario((atual) => ({ ...atual, [campo]: valor }));
  }

  function alternarDiferencial(diferencial: DiferencialAvaliacao) {
    setFormulario((atual) => ({
      ...atual,
      diferenciais: atual.diferenciais.includes(diferencial)
        ? atual.diferenciais.filter((item) => item !== diferencial)
        : [...atual.diferenciais, diferencial],
    }));
  }

  function selecionarImovel(id: string) {
    setReferenciaEdicao(null);
    setOrigemExterna(null);
    setOrigemContexto(null);
    setAvisoContexto(null);
    const selecionado = imoveis.find((item) => item.id === id);
    if (!selecionado) {
      setFormulario((atual) => ({
        ...FORMULARIO_VAZIO,
        finalidade: atual.finalidade,
        valorProprietario: atual.valorProprietario,
      }));
      return;
    }
    setFormulario((atual) => ({
      ...formularioDoImovel(selecionado, atual.finalidade),
      valorProprietario: atual.valorProprietario,
    }));
  }

  function aplicarEndereco(selecionado: EnderecoViaCepSelecionado) {
    setFormulario((atual) => ({
      ...atual,
      endereco: selecionado.endereco || atual.endereco,
      bairro: selecionado.bairro || atual.bairro,
      cidade: selecionado.cidade || atual.cidade,
      estado: ufValida(selecionado.estado) ? normalizarUf(selecionado.estado) : atual.estado,
      latitude: null,
      longitude: null,
    }));
  }

  async function calcular(evento: FormEvent) {
    evento.preventDefault();
    if (!usuario) return;
    const areaM2 = Number(formulario.areaM2.replace(",", "."));
    if (!formulario.endereco.trim()) return toast("Informe o endereço do imóvel.", "error");
    if (!formulario.cidade.trim()) return toast("Informe a cidade do imóvel.", "error");
    if (!ufValida(formulario.estado)) return toast("Informe uma UF válida para buscar comparáveis.", "error");
    if (!formulario.tipo.trim()) return toast("Informe o tipo do imóvel.", "error");
    if (!Number.isFinite(areaM2) || areaM2 < 10) {
      return toast("Informe uma área válida, a partir de 10 m².", "error");
    }

    setProcessando(true);
    setFase("Buscando imóveis semelhantes…");
    let latitude = formulario.latitude;
    let longitude = formulario.longitude;
    if (latitude == null || longitude == null) {
      try {
        const localizacao = await geocodeEndereco(
          formulario.endereco.trim(),
          formulario.bairro.trim(),
          formulario.cidade.trim(),
        );
        latitude = localizacao?.lat ?? null;
        longitude = localizacao?.lon ?? null;
      } catch {
        // A geocodificação melhora a proximidade, mas bairro e cidade ainda
        // permitem avaliar. A confiança absorve a ausência das coordenadas.
      }
    }

    const entrada: EntradaAvaliacao = {
      imovelId: formulario.imovelId || null,
      finalidade: formulario.finalidade,
      endereco: formulario.endereco.trim(),
      bairro: formulario.bairro.trim() || null,
      cidade: formulario.cidade.trim() || null,
      estado: formulario.estado.trim().toUpperCase() || null,
      edificio: formulario.edificio.trim() || null,
      tipo: formulario.tipo,
      areaM2,
      quartos: formulario.quartos,
      banheiros: refinamentoAberto ? formulario.banheiros : null,
      vagas: formulario.vagas,
      conservacao: formulario.conservacao,
      diferenciais: formulario.diferenciais,
      descricaoSemantica: descricaoSemanticaComDiferenciais(
        imoveis.find((item) => item.id === formulario.imovelId)?.textoAnuncio,
        formulario.diferenciais,
      ),
      latitude,
      longitude,
      origemExterna,
    };
    const valorProprietario = Number(formulario.valorProprietario.replace(",", ".")) || null;

    try {
      setFase("Analisando valores e consistência…");
      const [internos, externos] = await Promise.all([
        internalComparablesProvider.buscar(entrada, { imoveis }),
        buscarComparaveisMercado(usuario.id, entrada),
      ]);
      const resultado = avaliarImovel(entrada, [...internos, ...externos], todayISO());
      const registro = await registrarAvaliacao(usuario.id, entrada, valorProprietario, resultado);
      const eraNovaVersao = referenciaEdicao !== null;
      setAvaliacao({
        id: registro.id,
        entrada,
        resultado,
        valorProprietario,
        valorFinalCorretor: null,
        justificativaValorFinal: null,
        valorFinalEm: null,
        criadoEm: registro.criadoEm,
        valorAnterior,
      });
      setFormulario((atual) => ({ ...atual, latitude, longitude }));
      setValorAnterior(null);
      setReferenciaEdicao(null);
      setEditorValorFinalAberto(false);
      setValorFinalDigitado("");
      setJustificativaValorFinal("");
      setMostrarComparaveis(false);
      setMostrarCalculo(false);
      setMostrarHistorico(false);
      toast(eraNovaVersao ? "Nova versão registrada; a avaliação anterior foi preservada." : "Avaliação registrada no histórico.");
    } catch (erro) {
      console.error("Falha ao registrar avaliação:", erro);
      toast("Não foi possível salvar a avaliação. Confira se o schema foi atualizado e tente novamente.", "error");
    } finally {
      setProcessando(false);
      setFase("");
    }
  }

  function refinar() {
    setValorAnterior(avaliacao?.resultado.valorRecomendado ?? null);
    if (avaliacao) {
      setReferenciaEdicao({
        criadoEm: avaliacao.criadoEm,
      });
    }
    setRefinamentoAberto(true);
    setAvaliacao(null);
  }

  function abrirEditorValorFinal() {
    const valorAtual = avaliacao?.valorFinalCorretor ?? avaliacao?.resultado.valorRecomendado;
    setValorFinalDigitado(valorAtual == null ? "" : String(valorAtual));
    setJustificativaValorFinal(avaliacao?.justificativaValorFinal || "");
    setEditorValorFinalAberto(true);
  }

  async function salvarValorFinal(evento: FormEvent) {
    evento.preventDefault();
    if (!usuario || !avaliacao) return;
    const valorFinal = Number(valorFinalDigitado.replace(",", "."));
    if (!Number.isFinite(valorFinal) || valorFinal <= 0) {
      toast("Informe um valor final válido.", "error");
      return;
    }
    setSalvandoValorFinal(true);
    try {
      const ajuste = await registrarValorFinalAvaliacao(
        usuario.id,
        avaliacao.id,
        valorFinal,
        justificativaValorFinal,
      );
      setAvaliacao((atual) => atual ? {
        ...atual,
        valorFinalCorretor: ajuste.valorFinal,
        justificativaValorFinal: ajuste.justificativa,
        valorFinalEm: ajuste.criadoEm,
      } : atual);
      setEditorValorFinalAberto(false);
      toast("Valor final do corretor registrado sem alterar a referência calculada.");
    } catch (erro) {
      console.error("Falha ao registrar valor final da avaliação:", erro);
      toast("Não foi possível salvar o valor final. Confira se o novo schema foi aplicado.", "error");
    } finally {
      setSalvandoValorFinal(false);
    }
  }

  function editarAvaliacaoHistorica(item: HistoricoAvaliacao) {
    const imovelId = item.entrada.imovelId
      && imoveis.some((imovel) => imovel.id === item.entrada.imovelId)
      ? item.entrada.imovelId
      : "";
    setFormulario(formularioDaAvaliacao(item.entrada, item.valorProprietario, imovelId));
    setOrigemExterna(item.entrada.origemExterna || null);
    setOrigemContexto(item.entrada.origemExterna?.tipo === "comparavel" ? "central" : item.entrada.origemExterna ? "radar" : null);
    setRefinamentoAberto(item.entrada.banheiros != null || !!item.entrada.edificio);
    setValorAnterior(item.valorRecomendado);
    setReferenciaEdicao({
      criadoEm: item.criadoEm,
    });
    setAvaliacao(null);
    setMostrarHistorico(false);
  }

  async function alternarHistorico() {
    if (mostrarHistorico) {
      setMostrarHistorico(false);
      return;
    }
    if (!usuario) return;
    setCarregandoHistorico(true);
    try {
      const itens = await carregarHistoricoAvaliacoes(usuario.id, formulario.imovelId || null);
      setHistorico(itens);
      setMostrarHistorico(true);
    } catch (erro) {
      console.error("Falha ao carregar histórico de avaliações:", erro);
      toast("Não foi possível carregar o histórico agora.", "error");
    } finally {
      setCarregandoHistorico(false);
    }
  }

  const resultado = avaliacao?.resultado;
  const temComparaveisInternos = !!resultado?.comparaveis.some((item) => item.origem === "interno");
  const temComparaveisExternos = !!resultado?.comparaveis.some((item) => item.origem === "externo");
  const fonteResultado = !resultado?.comparaveis.length
    ? "Sem base observada"
    : temComparaveisInternos && temComparaveisExternos
    ? "Carteira + mercado"
    : (temComparaveisExternos ? "Mercado anunciado" : "Carteira interna");
  const diferenciaisInformados = DIFERENCIAIS_AVALIACAO
    .filter((item) => avaliacao?.entrada.diferenciais?.includes(item.id))
    .map((item) => item.rotulo);

  const relacaoPretensao = compararPretensao(avaliacao?.valorProprietario, resultado?.valorRecomendado);
  const diferencaRefinamento = resultado?.valorRecomendado && avaliacao?.valorAnterior
    ? resultado.valorRecomendado - avaliacao.valorAnterior
    : 0;

  return (
    <main className="avaliacao-pagina">
      <header className="avaliacao-cabecalho">
        <div className="avaliacao-cabecalho-icone"><IconeAvaliacao /></div>
        <div className="avaliacao-cabecalho-texto">
          <span className="avaliacao-sobretitulo">Apoio à angariação</span>
          <h1>Avaliação Rápida de Imóvel</h1>
          <p>Uma faixa objetiva baseada na sua carteira e no histórico observado do mercado.</p>
        </div>
        <button type="button" className="btn btn-ghost avaliacao-historico-atalho" onClick={alternarHistorico} disabled={carregandoHistorico}>
          {carregandoHistorico ? "Carregando…" : mostrarHistorico ? "Fechar histórico" : "Ver histórico"}
        </button>
      </header>

      {mostrarHistorico && (
        <div className="avaliacao-detalhes avaliacao-historico-painel">
          <h3>Últimas avaliações {formulario.imovelId ? "deste imóvel" : "da conta"}</h3>
          <div className="avaliacao-historico">
            {historico.length ? historico.map((item) => (
              <article key={item.id}>
                <div><strong>{item.finalidade === "locacao" ? "Locação" : "Venda"}</strong><span>{fmtDataHora(item.criadoEm)}</span></div>
                <strong>{item.valorFinalCorretor ? fmtMoney(item.valorFinalCorretor) : item.valorRecomendado ? fmtMoney(item.valorRecomendado) : "Sem faixa calculada"}</strong>
                <span>{item.entrada.endereco || item.entrada.bairro || item.entrada.tipo} · {item.nivelConfianca} · {item.quantidadeComparaveis} comparáveis{item.valorFinalCorretor && item.valorRecomendado ? ` · referência calculada ${fmtMoney(item.valorRecomendado)}` : ""}</span>
                <button type="button" className="avaliacao-historico-editar" onClick={() => editarAvaliacaoHistorica(item)}>Editar e recalcular</button>
              </article>
            )) : <p>Nenhuma avaliação anterior encontrada.</p>}
          </div>
        </div>
      )}

      {!avaliacao ? (
        <form className="avaliacao-formulario" onSubmit={calcular}>
          {referenciaEdicao && (
            <div className="avaliacao-edicao-aviso">
              <strong>Editando uma avaliação de {fmtDataHora(referenciaEdicao.criadoEm)}</strong>
              <span>Altere os dados necessários e recalcule. A versão anterior continuará intacta no histórico.</span>
            </div>
          )}
          {carregandoContexto && (
            <div className="avaliacao-edicao-aviso" role="status">
              <strong>Carregando dados do anúncio…</strong>
              <span>A avaliação não será executada automaticamente.</span>
            </div>
          )}
          {!carregandoContexto && origemContexto && (
            <div className="avaliacao-edicao-aviso">
              <strong>Dados preenchidos a partir {origemContexto === "central" ? "da Central" : "do Radar"}</strong>
              <span>Revise e complete o formulário. O valor anunciado não foi usado como expectativa nem como insumo do cálculo.</span>
            </div>
          )}
          {!carregandoContexto && avisoContexto && (
            <div className="avaliacao-aviso" role="alert">{avisoContexto}</div>
          )}
          <section className="avaliacao-card">
            <div className="avaliacao-secao-titulo">
              <span>1</span>
              <div><h2>Qual imóvel vamos avaliar?</h2><p>Use um cadastro existente ou preencha manualmente.</p></div>
            </div>
            <div className="field-group">
              <label>Imóvel cadastrado</label>
              <select value={formulario.imovelId} onChange={(evento) => selecionarImovel(evento.target.value)}>
                <option value="">Preencher um novo endereço</option>
                {imoveis.map((imovel) => (
                  <option key={imovel.id} value={imovel.id}>
                    {[imovel.codigo, imovel.endereco, imovel.unidade].filter(Boolean).join(" · ")}
                  </option>
                ))}
              </select>
            </div>
            <div className="avaliacao-finalidade" role="group" aria-label="Finalidade da avaliação">
              {(["locacao", "venda"] as const).map((finalidade) => (
                <button
                  key={finalidade}
                  type="button"
                  className={formulario.finalidade === finalidade ? "ativo" : ""}
                  onClick={() => atualizar("finalidade", finalidade)}
                >
                  {finalidade === "locacao" ? "Locação" : "Venda"}
                </button>
              ))}
            </div>
            {formulario.finalidade === "venda" && (
              <div className="avaliacao-aviso">
                A carteira atual ainda não possui preços de venda comparáveis. Você pode registrar os dados,
                mas o sistema não inventará uma faixa sem uma fonte confiável.
              </div>
            )}
            <div className="avaliacao-grade-endereco">
              <div className="field-group avaliacao-endereco">
                <label>Endereço</label>
                <EnderecoAutocompleteViaCep
                  value={formulario.endereco}
                  cidade={formulario.cidade}
                  estado={formulario.estado}
                  onChange={(valor) => setFormulario((atual) => ({
                    ...atual,
                    endereco: valor,
                    latitude: null,
                    longitude: null,
                  }))}
                  onSelecionar={aplicarEndereco}
                  placeholder="Rua, número"
                />
              </div>
              <div className="field-group"><label>Bairro</label><input value={formulario.bairro} onChange={(e) => atualizar("bairro", e.target.value)} /></div>
              <div className="field-group"><label>Cidade</label><input value={formulario.cidade} onChange={(e) => atualizar("cidade", e.target.value)} /></div>
              <div className="field-group avaliacao-uf"><label>UF</label><select value={formulario.estado} onChange={(e) => atualizar("estado", e.target.value)}><option value="">Selecione</option>{UFS_BRASIL.map((uf) => <option key={uf} value={uf}>{uf}</option>)}</select></div>
            </div>
          </section>

          <section className="avaliacao-card">
            <div className="avaliacao-secao-titulo">
              <span>2</span>
              <div><h2>Características principais</h2><p>Leva menos de um minuto.</p></div>
            </div>
            <div className="avaliacao-grade-campos">
              <div className="field-group">
                <label>Tipo de imóvel</label>
                <select value={formulario.tipo} onChange={(e) => atualizar("tipo", e.target.value)}>
                  {TIPOS_IMOVEL.map((tipo) => <option key={tipo} value={tipo}>{tipo}</option>)}
                </select>
              </div>
              <div className="field-group">
                <label>Área privativa (m²)</label>
                <input type="number" min="10" max="10000" step="0.1" inputMode="decimal" value={formulario.areaM2} onChange={(e) => atualizar("areaM2", e.target.value)} placeholder="Ex.: 72" />
              </div>
            </div>
            <div className="avaliacao-contadores">
              <ControleQuantidade rotulo="Quartos" valor={formulario.quartos} aoMudar={(valor) => atualizar("quartos", valor)} />
              <ControleQuantidade rotulo="Vagas" valor={formulario.vagas} aoMudar={(valor) => atualizar("vagas", valor)} />
            </div>
            <div className="field-group">
              <label>Estado de conservação</label>
              <div className="avaliacao-opcoes" role="group" aria-label="Estado de conservação">
                {(["Regular", "Bom", "Excelente"] as const).map((conservacao) => (
                  <button key={conservacao} type="button" className={formulario.conservacao === conservacao ? "ativo" : ""} onClick={() => atualizar("conservacao", conservacao)}>
                    {conservacao}
                  </button>
                ))}
              </div>
            </div>
            <fieldset className="avaliacao-diferenciais">
              <legend>Diferenciais do imóvel</legend>
              <p>Marque o que faz parte da unidade para buscar anúncios mais parecidos.</p>
              <div>
                {DIFERENCIAIS_AVALIACAO.map((diferencial) => {
                  const selecionado = formulario.diferenciais.includes(diferencial.id);
                  return (
                    <button
                      key={diferencial.id}
                      type="button"
                      className={selecionado ? "ativo" : ""}
                      aria-pressed={selecionado}
                      onClick={() => alternarDiferencial(diferencial.id)}
                    >
                      <span aria-hidden="true">{selecionado ? "✓" : "+"}</span>
                      {diferencial.rotulo}
                    </button>
                  );
                })}
              </div>
            </fieldset>
            <button type="button" className="avaliacao-link" onClick={() => setRefinamentoAberto((aberto) => !aberto)} aria-expanded={refinamentoAberto}>
              {refinamentoAberto ? "Ocultar refinamento" : "Adicionar detalhes para refinar"}
            </button>
            {refinamentoAberto && (
              <div className="avaliacao-refinamento">
                <ControleQuantidade rotulo="Banheiros" valor={formulario.banheiros} aoMudar={(valor) => atualizar("banheiros", valor)} />
                <div className="field-group"><label>Edifício ou condomínio</label><input value={formulario.edificio} onChange={(e) => atualizar("edificio", e.target.value)} placeholder="Opcional" /></div>
              </div>
            )}
          </section>

          <section className="avaliacao-card avaliacao-card-opcional">
            <div className="avaliacao-secao-titulo">
              <span>3</span>
              <div><h2>Expectativa do proprietário</h2><p>Opcional — nunca influencia o cálculo.</p></div>
            </div>
            <div className="field-group">
              <label>Valor pretendido (R$)</label>
              <input type="number" min="0" step="50" inputMode="decimal" value={formulario.valorProprietario} onChange={(e) => atualizar("valorProprietario", e.target.value)} placeholder="Ex.: 2.500" />
              <div className="field-hint">Usado apenas para comparar a expectativa com a referência calculada.</div>
            </div>
          </section>

          <button type="submit" className="btn btn-primary avaliacao-calcular" disabled={processando}>
            {processando ? fase : referenciaEdicao ? "Recalcular e salvar nova versão" : "Calcular avaliação"}
          </button>
          <p className="avaliacao-rodape-form">Cálculo determinístico, sem IA definindo preço e sem consulta paga a cada avaliação.</p>
        </form>
      ) : (
        <section className="avaliacao-resultado" aria-live="polite">
          <div className={`avaliacao-resultado-principal ${resultado?.situacao || ""}`}>
            <span className="avaliacao-sobretitulo">
              {resultado?.situacao === "preliminar" ? "Referência preliminar" : "Resultado registrado"}
            </span>
            {resultado && resultado.situacao !== "insuficiente" ? (
              <>
                <h2>{fmtMoney(resultado.valorMinimo)} a {fmtMoney(resultado.valorMaximo)}</h2>
                <p className="avaliacao-recomendado">
                  {resultado.situacao === "preliminar" ? "Referência central" : "Valor recomendado"}{" "}
                  <strong>{fmtMoney(resultado.valorRecomendado)}</strong>
                </p>
                <div className="avaliacao-faixa" aria-label={`Faixa de ${fmtMoney(resultado.valorMinimo)} a ${fmtMoney(resultado.valorMaximo)}`}>
                  <div className="avaliacao-faixa-trilho"><span /></div>
                  <div className="avaliacao-faixa-legendas"><span>{fmtMoney(resultado.valorMinimo)}</span><strong>{fmtMoney(resultado.valorRecomendado)}</strong><span>{fmtMoney(resultado.valorMaximo)}</span></div>
                </div>
                {resultado.situacao === "preliminar" && (
                  <p className="avaliacao-alerta-preliminar">
                    Amostra pequena ou regional. Use esta faixa para orientar a conversa e confirme com novos comparáveis antes de anunciar.
                  </p>
                )}
              </>
            ) : (
              <>
                <h2>Sem referência disponível</h2>
                <p>Nenhum preço observado é compatível com este imóvel. Revise área, cidade e tipo ou atualize a base de mercado.</p>
              </>
            )}
            <div className="avaliacao-resumo-chips">
              <span>Confiança <strong>{resultado?.nivelConfianca} · {resultado?.scoreConfianca}%</strong></span>
              <span>Comparáveis <strong>{resultado?.comparaveis.length}</strong></span>
              <span>Fonte <strong>{fonteResultado}</strong></span>
              {resultado?.metodologia.regiaoReferencia && (
                <span>Região <strong>{resultado.metodologia.regiaoReferencia}</strong></span>
              )}
            </div>
            {diferenciaisInformados.length > 0 && (
              <p className="avaliacao-diferenciais-informados">
                <strong>Diferenciais informados:</strong> {diferenciaisInformados.join(" · ")}
              </p>
            )}
            {diferencaRefinamento !== 0 && (
              <p className="avaliacao-mudanca">O refinamento alterou a recomendação em {fmtMoney(Math.abs(diferencaRefinamento))} {diferencaRefinamento > 0 ? "para cima" : "para baixo"}.</p>
            )}
          </div>

          {resultado?.valorRecomendado != null && (
            <section className={`avaliacao-valor-final ${avaliacao.valorFinalCorretor != null ? "definido" : ""}`}>
              <div className="avaliacao-valor-final-resumo">
                <div>
                  <span>{avaliacao.valorFinalCorretor != null ? "Valor final definido pelo corretor" : "Decisão comercial do corretor"}</span>
                  {avaliacao.valorFinalCorretor != null ? (
                    <>
                      <strong>{fmtMoney(avaliacao.valorFinalCorretor)}</strong>
                      <p>Referência calculada preservada em {fmtMoney(resultado.valorRecomendado)}{avaliacao.valorFinalEm ? ` · definida em ${fmtDataHora(avaliacao.valorFinalEm)}` : ""}.</p>
                      {avaliacao.justificativaValorFinal && <p>Observação: {avaliacao.justificativaValorFinal}</p>}
                    </>
                  ) : (
                    <p>Se a estratégia comercial pedir outro preço, registre-o sem alterar o cálculo técnico acima.</p>
                  )}
                </div>
                <button type="button" className="btn" onClick={abrirEditorValorFinal}>
                  {avaliacao.valorFinalCorretor != null ? "Alterar valor final" : "Definir valor final"}
                </button>
              </div>
              {editorValorFinalAberto && (
                <form className="avaliacao-valor-final-editor" onSubmit={salvarValorFinal}>
                  <div className="field-group">
                    <label>Valor final do corretor (R$)</label>
                    <input type="number" min="1" step="50" inputMode="decimal" value={valorFinalDigitado} onChange={(e) => setValorFinalDigitado(e.target.value)} placeholder="Ex.: 2.200" autoFocus />
                  </div>
                  <div className="field-group">
                    <label>Observação do ajuste <span>(opcional)</span></label>
                    <input maxLength={500} value={justificativaValorFinal} onChange={(e) => setJustificativaValorFinal(e.target.value)} placeholder="Ex.: estratégia para acelerar a locação" />
                  </div>
                  <div className="avaliacao-valor-final-acoes">
                    <button type="button" className="btn btn-ghost" onClick={() => setEditorValorFinalAberto(false)} disabled={salvandoValorFinal}>Cancelar</button>
                    <button type="submit" className="btn btn-primary" disabled={salvandoValorFinal}>{salvandoValorFinal ? "Salvando…" : "Salvar valor final"}</button>
                  </div>
                </form>
              )}
            </section>
          )}

          {relacaoPretensao && (
            <div className="avaliacao-pretensao">
              <span>Expectativa do proprietário</span>
              <strong>{fmtMoney(avaliacao.valorProprietario)}</strong>
              <p>{relacaoPretensao.direcao === "alinhada" ? "Está alinhada ao valor recomendado." : `Está ${relacaoPretensao.percentual}% ${relacaoPretensao.direcao} do valor recomendado.`}</p>
            </div>
          )}

          {resultado?.estrategias.length ? (
            <div className="avaliacao-estrategias">
              <h3>Estratégias de preço</h3>
              <div>{resultado.estrategias.map((estrategia) => <article key={estrategia.id}><span>{estrategia.titulo}</span><strong>{fmtMoney(estrategia.valor)}</strong><p>{estrategia.descricao}</p></article>)}</div>
            </div>
          ) : null}

          <div className="avaliacao-acoes">
            <button type="button" className="btn btn-primary" onClick={() => setMostrarComparaveis((mostrar) => !mostrar)}>Ver imóveis comparáveis</button>
            <button type="button" className="btn" onClick={refinar}>Editar dados e recalcular</button>
            <button type="button" className="btn" onClick={() => setMostrarCalculo((mostrar) => !mostrar)}>Entender o cálculo</button>
          </div>

          {mostrarComparaveis && (
            <div className="avaliacao-detalhes">
              <h3>Imóveis que sustentam a faixa</h3>
              {resultado?.comparaveis.length ? resultado.comparaveis.map((comparavel) => (
                <article className="avaliacao-comparavel" key={`${comparavel.origem}-${comparavel.id}`}>
                  <div><strong>{comparavel.codigo || comparavel.endereco}</strong><span>{[comparavel.bairro, comparavel.cidade].filter(Boolean).join(" · ")}</span></div>
                  <div className="avaliacao-comparavel-dados"><span>{comparavel.origem === "interno" ? "Fonte: carteira interna" : "Fonte externa"}</span><span>{comparavel.regiao || resultado.metodologia.regiaoReferencia || "Região não identificada"}</span><span>{comparavel.tipo}</span><span>{comparavel.areaM2 ? `${comparavel.areaM2} m²` : "Área não informada"}</span><span>{comparavel.quartos ?? "—"} quartos</span><span>{comparavel.vagas ?? "—"} vagas</span><span>{comparavel.distanciaKm == null ? "Distância aproximada" : `${comparavel.distanciaKm} km`}</span><span>Referência em {fmtDate(comparavel.dataInformacao)}</span></div>
                  <div className="avaliacao-comparavel-valor"><strong>{fmtMoney(comparavel.valorAnunciado)}</strong><span>{comparavel.valorM2 ? `${fmtMoney(comparavel.valorM2)}/m²` : "Sem preço/m²"}</span></div>
                  <div className="avaliacao-similaridade"><span style={{ width: `${comparavel.comparabilidadeFinal}%` }} /><strong>{comparavel.comparabilidadeFinal}% comparável · estrutural {comparavel.similaridadeEstrutural}%{comparavel.similaridadeVetorial == null ? "" : ` · semântica ${Math.round(comparavel.similaridadeVetorial * 100)}%`}</strong></div>
                </article>
              )) : <p>Nenhum comparável atingiu o corte mínimo de similaridade.</p>}
            </div>
          )}

          {mostrarCalculo && (
            <div className="avaliacao-detalhes">
              <h3>Como chegamos a este resultado</h3>
              <ol>{resultado?.explicacao.map((linha) => <li key={linha}>{linha}</li>)}</ol>
              <p className="avaliacao-metodo">{resultado?.metodologia.comparaveisCandidatos ?? 0} candidatos encontrados · {resultado?.metodologia.comparaveisAprovados ?? 0} utilizados · {resultado?.metodologia.outliersRemovidos ?? 0} outliers removidos · {resultado?.metodologia.comparaveisComEmbedding ?? 0} com similaridade semântica{resultado?.metodologia.medianaValorM2 ? ` · mediana de ${fmtMoney(resultado.metodologia.medianaValorM2)}/m²` : ""}.</p>
              <p className="avaliacao-metodo">Os filtros objetivos vêm primeiro. Localização, tipo, área, quartos, banheiros, vagas, conservação e recência formam o score estrutural; quando disponível, a semântica apenas reordena os comparáveis. O preço usa o peso estrutural e valores extremos são removidos antes da mediana ponderada.</p>
            </div>
          )}

          <div className="avaliacao-nota">
            <strong>Referência comercial, não laudo formal.</strong>
            <span>O resultado reflete os dados disponíveis na carteira e na base de mercado em {fmtDataHora(avaliacao.criadoEm)}. Não substitui avaliação técnica de engenharia ou perícia.</span>
          </div>
          <button type="button" className="avaliacao-link avaliacao-nova" onClick={() => { setAvaliacao(null); setReferenciaEdicao(null); setEditorValorFinalAberto(false); }}>Fazer outra avaliação</button>
        </section>
      )}
    </main>
  );
}
