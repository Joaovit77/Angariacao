"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";

import { useSessao } from "@/components/SessaoProvider";
import EnderecoAutocompleteViaCep, {
  type EnderecoViaCepSelecionado,
} from "@/components/formularios/EnderecoAutocompleteViaCep";
import CapturaFachada, {
  type EstadoArquivoFachada,
  type OrigemCaptura,
} from "@/components/prospeccao/CapturaFachada";
import styles from "@/components/prospeccao/Prospeccao.module.css";
import type { ResultadoProcessamentoFoto } from "@/lib/calculo/fotoFachada";
import { distanciaHaversineMetros } from "@/lib/calculo/dedupeProspeccao";
import {
  descreverLocalizacao,
  gpsImpreciso,
  localizacaoDoGeocode,
  localizacaoDoGps,
  localizacaoDoMapa,
  LOCALIZACAO_DESCONHECIDA,
  resolverFonteLocalizacao,
  type EscolhaFonteLocalizacao,
  type LocalizacaoAvistamento,
  type LocalizacaoCapturada,
} from "@/lib/calculo/prospeccao";
import { TIPOS_IMOVEL } from "@/lib/constantes";
import { dataHoraLocalParaIso, partesDataHoraLocal } from "@/lib/datas";
import {
  capturarPosicaoAtual,
  geocodeEndereco,
  maskCEP,
  type Geocodificacao,
  type ResultadoPosicaoAparelho,
} from "@/lib/geo";
import type { ReservaFotoAvistamento } from "@/lib/prospeccao";
import {
  armazemRascunhoCaptura,
  avaliarRascunho,
  fotoPerdidaNaCameraNativa,
  type ArmazemRascunhoCaptura,
  type CamposRascunhoCaptura,
  type RascunhoCaptura,
} from "@/lib/rascunhoCaptura";
import { useProspeccao } from "@/lib/useProspeccao";
import { useUiModal } from "@/lib/uiModal";

/** Quanto esperar depois da última tecla antes de gravar o rascunho.
    Curto o bastante para não perder texto; longo o bastante para não
    reescrever o Blob a cada letra. */
const ATRASO_RASCUNHO_MS = 400;

/** O Nominatim é público e às vezes lento; o corretor não espera por ele
    para salvar. Passou o prazo, a localização fica "desconhecida". */
const PRAZO_GEOCODE_MS = 8_000;

const MapaProspeccao = dynamic(() => import("@/components/prospeccao/MapaProspeccao"), { ssr: false });

type StatusGps = "ocioso" | "buscando" | "ok" | "negada" | "timeout" | "indisponivel" | "falha";

const MENSAGEM_GPS: Record<Exclude<StatusGps, "ok" | "ocioso">, string> = {
  buscando: "Obtendo a posição do aparelho…",
  negada: "Permissão de localização negada. A posição virá do endereço, de forma aproximada.",
  timeout: "O GPS não respondeu a tempo. Tente de novo ou siga pelo endereço.",
  indisponivel: "Este aparelho não oferece localização. A posição virá do endereço, de forma aproximada.",
  falha: "Não foi possível ler a posição. Tente de novo ou siga pelo endereço.",
};

/** Dependências do C6, injetáveis para teste. Em produção: o GPS do
    navegador e o Nominatim de lib/geo. */
export interface DependenciasLocalizacaoAvistamento {
  capturarPosicao?: () => Promise<ResultadoPosicaoAparelho>;
  geocodificar?: (enderecoCompleto: string, bairro: string, cidade: string) => Promise<Geocodificacao | null>;
}

function comPrazo<T>(promessa: Promise<T>, ms: number, fallback: T): Promise<T> {
  return new Promise((resolve) => {
    const temporizador = setTimeout(() => resolve(fallback), ms);
    promessa.then(
      (valor) => { clearTimeout(temporizador); resolve(valor); },
      () => { clearTimeout(temporizador); resolve(fallback); },
    );
  });
}

/** "Rua X, 123" vindo do ViaCEP vira rua + número separados. */
function separarNumero(endereco: string): { rua: string; numero: string } {
  const partes = endereco.match(/^(.*?),s*(d.*)$/);
  return partes ? { rua: partes[1].trim(), numero: partes[2].trim() } : { rua: endereco.trim(), numero: "" };
}

function horaCurta(iso: string): string {
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return "";
  return data.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export default function ModalAvistamento({
  imovelIdentificadoId,
  armazemRascunho,
  dependenciasLocalizacao,
}: {
  imovelIdentificadoId?: string;
  /** Injetável para teste; em produção é o IndexedDB do aparelho. */
  armazemRascunho?: ArmazemRascunhoCaptura;
  dependenciasLocalizacao?: DependenciasLocalizacaoAvistamento;
}) {
  const { usuario } = useSessao();
  const fecharModal = useUiModal((estado) => estado.fecharModal);
  const criar = useProspeccao((estado) => estado.criar);
  const adicionarAvistamento = useProspeccao((estado) => estado.adicionarAvistamento);
  const salvando = useProspeccao((estado) => estado.salvando);
  const identificadoConhecido = useProspeccao((estado) => {
    const identificado = estado.detalhe?.identificado;
    return identificado?.id === imovelIdentificadoId ? identificado : null;
  });
  const agora = partesDataHoraLocal();
  const [data, setData] = useState(agora.data);
  const [hora, setHora] = useState(agora.hora);
  const [observacao, setObservacao] = useState("");
  const [logradouro, setLogradouro] = useState("");
  const [numero, setNumero] = useState("");
  const [unidade, setUnidade] = useState("");
  const [bloco, setBloco] = useState("");
  const [edificio, setEdificio] = useState("");
  const [bairro, setBairro] = useState("");
  const [cidade, setCidade] = useState("");
  const [estado, setEstado] = useState("");
  const [cep, setCep] = useState("");
  const [pontoReferencia, setPontoReferencia] = useState("");
  const [tipo, setTipo] = useState("");
  const [erro, setErro] = useState("");
  /* ---- localização (C6) ----------------------------------------------
     GPS e pino no mapa ficam separados; na hora de salvar, a de menor
     raio vence (mesma regra do trigger). O endereço só entra como
     último recurso, e nunca segura o salvamento além do prazo. */
  const [localizacaoGps, setLocalizacaoGps] = useState<LocalizacaoCapturada | null>(null);
  const [localizacaoMapa, setLocalizacaoMapa] = useState<LocalizacaoCapturada | null>(null);
  /* O endereço é geocodificado assim que fica completo (sugestão escolhida
     ou número informado): o mapa vai até ele sem esperar o salvamento. Quem
     registra depois, longe do imóvel, precisa disso — e precisa poder
     dizer que o GPS não é o lugar. */
  const [localizacaoEndereco, setLocalizacaoEndereco] = useState<LocalizacaoCapturada | null>(null);
  const [geocodificando, setGeocodificando] = useState(false);
  const [fonteEscolhida, setFonteEscolhida] = useState<EscolhaFonteLocalizacao>("auto");
  const geocodeRef = useRef({ chave: "", pedido: 0 });
  // Nasce "buscando": o pedido ao GPS acontece assim que o rascunho for lido.
  const [statusGps, setStatusGps] = useState<StatusGps>("buscando");
  const gpsPedido = useRef(false);
  const capturarPosicao = dependenciasLocalizacao?.capturarPosicao ?? capturarPosicaoAtual;
  const geocodificar = dependenciasLocalizacao?.geocodificar ?? geocodeEndereco;
  /* O que o ViaCEP preencheu por último. Uma nova sugestão só troca o
     campo se ele ainda estiver vazio ou igual ao que o ViaCEP pôs; o que
     o corretor corrigiu à mão fica. */
  const viaCepRef = useRef({ bairro: "", cidade: "", estado: "", cep: "" });
  const [fotoSelecionada, setFotoSelecionada] = useState<EstadoArquivoFachada>({
    selecionada: false,
    pronta: false,
    processando: false,
  });
  const [destinoFoto, setDestinoFoto] = useState<{
    imovelIdentificadoId: string;
    avistamentoId: string;
  } | null>(null);
  const [avistamentoSalvo, setAvistamentoSalvo] = useState(false);
  const primeiroAvistamento = !imovelIdentificadoId;

  /* ---- rascunho no aparelho ------------------------------------------
     Guarda o que custa refazer (foto processada, texto, destino, reserva)
     ANTES de a aba correr risco — a ida à câmera pode matar a página no
     Android. Ao remontar, restaura em silêncio e avisa; nada é enviado
     sem o corretor. */
  const [armazem] = useState<ArmazemRascunhoCaptura>(() => armazemRascunho ?? armazemRascunhoCaptura());
  const contextoRascunho = imovelIdentificadoId ?? null;
  const [rascunhoRestauradoEm, setRascunhoRestauradoEm] = useState<string | null>(null);
  const [fotoInicial, setFotoInicial] = useState<ResultadoProcessamentoFoto<Blob> | null>(null);
  const [reservaInicial, setReservaInicial] = useState<ReservaFotoAvistamento | null>(null);
  const [rascunhoPronto, setRascunhoPronto] = useState(false);
  const [fotoPerdidaEm, setFotoPerdidaEm] = useState<string | null>(null);
  const tocado = useRef(false);
  const cameraNativaRef = useRef<string | null>(null);
  const fotoProcessada = useRef<ResultadoProcessamentoFoto<Blob> | null>(null);
  const destinoRef = useRef<typeof destinoFoto>(null);
  const reservaRef = useRef<ReservaFotoAvistamento | null>(null);
  const temporizador = useRef<number | null>(null);

  const camposAtuais = useCallback((): CamposRascunhoCaptura => ({
    data, hora, observacao, logradouro, numero, unidade, bloco, edificio,
    bairro, cidade, estado, cep, pontoReferencia, tipo,
  }), [bairro, bloco, cep, cidade, data, edificio, estado, hora, logradouro, numero, observacao, pontoReferencia, tipo, unidade]);

  // Callbacks e efeitos dependem do id, não do objeto `usuario`: o
  // SessaoProvider troca o objeto a cada evento de sessão (voltar da câmera
  // dispara um), e isso não pode reexecutar nada aqui.
  const usuarioId = usuario?.id ?? null;

  const persistirRascunho = useCallback(() => {
    if (!usuarioId) return;
    const rascunho: RascunhoCaptura = {
      usuarioId,
      imovelIdentificadoId: contextoRascunho,
      salvoEm: new Date().toISOString(),
      campos: camposAtuais(),
      foto: fotoProcessada.current,
      destino: destinoRef.current,
      reserva: reservaRef.current,
      cameraNativaEm: cameraNativaRef.current,
    };
    void armazem.salvar(rascunho);
  }, [armazem, camposAtuais, contextoRascunho, usuarioId]);

  const limparRascunho = useCallback(() => {
    if (!usuarioId) return;
    if (temporizador.current !== null) window.clearTimeout(temporizador.current);
    void armazem.limpar(usuarioId);
  }, [armazem, usuarioId]);

  // Restaura ao montar. Só o contexto certo, só dentro do prazo, e só se
  // houver algo além de data/hora (que já nascem preenchidas).
  useEffect(() => {
    if (!usuarioId) return;
    let cancelado = false;
    void (async () => {
      const rascunho = await armazem.ler(usuarioId);
      if (cancelado) return;
      const veredito = avaliarRascunho(rascunho, usuarioId, contextoRascunho);
      if (veredito === "expirado") void armazem.limpar(usuarioId);
      if (veredito === "restauravel" && rascunho) {
        const c = rascunho.campos;
        setData(c.data || agora.data);
        setHora(c.hora || agora.hora);
        setObservacao(c.observacao);
        setLogradouro(c.logradouro);
        setNumero(c.numero);
        setUnidade(c.unidade);
        setBloco(c.bloco);
        setEdificio(c.edificio);
        setBairro(c.bairro);
        setCidade(c.cidade);
        setEstado(c.estado);
        setCep(c.cep);
        setPontoReferencia(c.pontoReferencia);
        setTipo(c.tipo);
        if (rascunho.foto) {
          fotoProcessada.current = rascunho.foto;
          setFotoInicial(rascunho.foto);
          setFotoSelecionada({ selecionada: true, pronta: true, processando: false, processada: rascunho.foto });
        }
        if (rascunho.reserva) {
          reservaRef.current = rascunho.reserva;
          setReservaInicial(rascunho.reserva);
        }
        if (rascunho.destino) {
          destinoRef.current = rascunho.destino;
          setDestinoFoto(rascunho.destino);
          setAvistamentoSalvo(true);
        }
        tocado.current = true;
        setRascunhoRestauradoEm(rascunho.salvoEm);
        // Não se carrega o marcador adiante: a próxima gravação o apaga.
        setFotoPerdidaEm(fotoPerdidaNaCameraNativa(rascunho));
      } else if (!imovelIdentificadoId) {
        // Local novo: cidade e UF do último registro já carregado. O
        // corretor trabalha numa cidade; digitar isso a cada casa é atrito,
        // e o ViaCEP precisa dos dois para sugerir a rua.
        const referencia = useProspeccao.getState().itens[0];
        if (referencia?.cidade) setCidade(referencia.cidade);
        if (referencia?.estado) setEstado(referencia.estado);
      }
      setRascunhoPronto(true);
    })();
    return () => { cancelado = true; };
    // Só na montagem: os setters são estáveis e `agora` é o instante de abrir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [armazem, contextoRascunho, usuarioId]);

  // Texto digitado vai para o aparelho com atraso curto. Antes da primeira
  // interação não há o que guardar — evita criar rascunho de modal intocado.
  useEffect(() => {
    if (!rascunhoPronto || !tocado.current || avistamentoSalvo) return;
    if (temporizador.current !== null) window.clearTimeout(temporizador.current);
    temporizador.current = window.setTimeout(() => {
      temporizador.current = null;
      persistirRascunho();
    }, ATRASO_RASCUNHO_MS);
    return () => {
      if (temporizador.current !== null) window.clearTimeout(temporizador.current);
    };
  }, [avistamentoSalvo, camposAtuais, persistirRascunho, rascunhoPronto]);

  function marcarTocado() {
    tocado.current = true;
  }

  const registrarPosicao = useCallback((resultado: ResultadoPosicaoAparelho) => {
    if (resultado.ok) {
      setLocalizacaoGps(localizacaoDoGps(resultado));
      setStatusGps("ok");
    } else {
      setLocalizacaoGps(null);
      setStatusGps(resultado.motivo);
    }
  }, []);

  function lerGps() {
    setStatusGps("buscando");
    void capturarPosicao().then(registrarPosicao);
  }

  // O GPS é pedido ao abrir, uma vez: em campo, o momento certo de medir é
  // agora, parado em frente ao imóvel. Retomada de foto já salva não mede.
  useEffect(() => {
    if (!rascunhoPronto || gpsPedido.current || avistamentoSalvo) return;
    gpsPedido.current = true;
    void capturarPosicao().then(registrarPosicao);
  }, [avistamentoSalvo, capturarPosicao, rascunhoPronto, registrarPosicao]);

  const distanciaGpsEndereco = localizacaoGps && localizacaoEndereco
    ? distanciaHaversineMetros(localizacaoGps, localizacaoEndereco)
    : null;
  const resolvida = resolverFonteLocalizacao({
    gps: localizacaoGps,
    mapa: localizacaoMapa,
    endereco: localizacaoEndereco,
    distanciaGpsEnderecoMetros: distanciaGpsEndereco,
    escolha: fonteEscolhida,
  });
  const localizacaoAtual: LocalizacaoAvistamento = resolvida.localizacao;

  /** Geocodifica o endereço atual (ou o passado) uma vez por combinação. */
  const localizarEndereco = useCallback((endereco: {
    logradouro: string; numero: string; bairro: string; cidade: string;
  }) => {
    const rua = endereco.logradouro.trim();
    const cidadeLimpa = endereco.cidade.trim();
    if (!rua || !cidadeLimpa) return;
    const chave = [rua, endereco.numero.trim(), endereco.bairro.trim(), cidadeLimpa].join("|").toLocaleLowerCase("pt-BR");
    if (chave === geocodeRef.current.chave) return;
    const pedido = ++geocodeRef.current.pedido;
    geocodeRef.current.chave = chave;
    setGeocodificando(true);
    const enderecoCompleto = [rua, endereco.numero.trim()].filter(Boolean).join(", ");
    void comPrazo(geocodificar(enderecoCompleto, endereco.bairro.trim(), cidadeLimpa), PRAZO_GEOCODE_MS, null)
      .then((geo) => {
        if (pedido !== geocodeRef.current.pedido) return;
        setLocalizacaoEndereco(geo ? localizacaoDoGeocode(geo) : null);
        setGeocodificando(false);
      });
  }, [geocodificar]);

  function localizarEnderecoDigitado() {
    localizarEndereco({ logradouro, numero, bairro, cidade });
  }

  function aplicarEnderecoViaCep(selecionado: EnderecoViaCepSelecionado) {
    const { rua, numero: numeroSugerido } = separarNumero(selecionado.endereco);
    if (rua) setLogradouro(rua);
    if (numeroSugerido && !numero.trim()) setNumero(numeroSugerido);
    const aplicar = (
      campo: keyof typeof viaCepRef.current,
      atual: string,
      novo: string | undefined,
      definir: (valor: string) => void,
    ) => {
      if (!novo) return;
      if (atual.trim() === "" || atual === viaCepRef.current[campo]) definir(novo);
      viaCepRef.current[campo] = novo;
    };
    aplicar("bairro", bairro, selecionado.bairro, setBairro);
    aplicar("cidade", cidade, selecionado.cidade, setCidade);
    aplicar("estado", estado, selecionado.estado, setEstado);
    aplicar("cep", cep, selecionado.cep ? maskCEP(selecionado.cep) : undefined, setCep);
    tocado.current = true;
    // O mapa vai ao endereço agora, com o que a sugestão trouxe.
    localizarEndereco({
      logradouro: rua || logradouro,
      numero: numero.trim() || numeroSugerido,
      bairro: selecionado.bairro || bairro,
      cidade: selecionado.cidade || cidade,
    });
  }

  function escolherPontoNoMapa(ponto: { latitude: number; longitude: number }) {
    setLocalizacaoMapa(localizacaoDoMapa(ponto));
    tocado.current = true;
  }

  /** GPS e mapa já estão em mãos; o endereço só entra se nenhum dos dois
      existir, e nunca além do prazo. Sem nada, "desconhecida" — jamais zero. */
  async function resolverLocalizacao(): Promise<LocalizacaoAvistamento> {
    if (localizacaoAtual.latitude !== null) return localizacaoAtual;
    const enderecoBase = identificadoConhecido
      ? { logradouro: identificadoConhecido.logradouro ?? "", numero: identificadoConhecido.numero ?? "",
          bairro: identificadoConhecido.bairro ?? "", cidade: identificadoConhecido.cidade ?? "" }
      : { logradouro, numero, bairro, cidade };
    if (!enderecoBase.logradouro.trim() || !enderecoBase.cidade.trim()) return LOCALIZACAO_DESCONHECIDA;
    const enderecoCompleto = [enderecoBase.logradouro.trim(), enderecoBase.numero.trim()].filter(Boolean).join(", ");
    const geo = await comPrazo(
      geocodificar(enderecoCompleto, enderecoBase.bairro.trim(), enderecoBase.cidade.trim()),
      PRAZO_GEOCODE_MS,
      null,
    );
    return geo ? localizacaoDoGeocode(geo) : LOCALIZACAO_DESCONHECIDA;
  }

  function aoEstadoArquivo(estadoArquivo: EstadoArquivoFachada) {
    setFotoSelecionada(estadoArquivo);
    if (estadoArquivo.pronta && estadoArquivo.processada) {
      // A foto processada é o que mais custa refazer: grava na hora.
      fotoProcessada.current = estadoArquivo.processada;
      cameraNativaRef.current = null;
      setFotoPerdidaEm(null);
      tocado.current = true;
      persistirRascunho();
    } else if (!estadoArquivo.selecionada) {
      fotoProcessada.current = null;
    }
  }

  function aoReserva(reserva: ReservaFotoAvistamento) {
    reservaRef.current = reserva;
    persistirRascunho();
  }

  function aoAntesDeCapturar(origem: OrigemCaptura) {
    // Último instante em que a página tem certeza de estar viva. Só a
    // câmera do aparelho sai da página; é ela que deixa marca.
    cameraNativaRef.current = origem === "aparelho" ? new Date().toISOString() : null;
    tocado.current = true;
    persistirRascunho();
  }

  function aoConcluirEnvio() {
    limparRascunho();
    fecharModal();
  }

  function cancelar() {
    // Antes de salvar, cancelar é abandonar: o rascunho vai junto. Depois de
    // salvo, o avistamento existe e a foto pode estar pendente: o rascunho
    // fica para a retomada.
    if (!avistamentoSalvo) limparRascunho();
    fecharModal();
  }

  function descartarRascunho() {
    limparRascunho();
    fecharModal();
  }
  const enderecoConhecido = identificadoConhecido
    ? [
        [identificadoConhecido.logradouro, identificadoConhecido.numero].filter(Boolean).join(", "),
        identificadoConhecido.pontoReferencia,
        [identificadoConhecido.bairro, identificadoConhecido.cidade, identificadoConhecido.estado]
          .filter(Boolean)
          .join(" · "),
      ].filter(Boolean).join(" — ")
    : "Identificação selecionada";

  async function salvar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (!usuario || salvando || avistamentoSalvo) return;
    const observadoEm = dataHoraLocalParaIso(data, hora);
    if (!observadoEm) {
      setErro("Informe uma data e um horário válidos.");
      return;
    }
    const uf = estado.trim().toUpperCase();
    if (uf && !/^[A-Z]{2}$/.test(uf)) {
      setErro("Informe o estado com duas letras.");
      return;
    }
    if (fotoSelecionada.processando) {
      setErro("Aguarde a preparação da foto.");
      return;
    }

    setErro("");
    const idsAnteriores = new Set(
      imovelIdentificadoId
        ? (useProspeccao.getState().detalhe?.avistamentos ?? []).map((item) => item.id)
        : [],
    );
    const localizacao = await resolverLocalizacao();
    const dadosAvistamento = {
      observadoEm,
      observacao,
      latitude: localizacao.latitude,
      longitude: localizacao.longitude,
      acuraciaMetros: localizacao.acuraciaMetros,
      precisaoLocalizacao: localizacao.precisaoLocalizacao,
    };
    const tipoSelecionado = TIPOS_IMOVEL.find((opcao) => opcao === tipo) ?? null;
    const sucesso = imovelIdentificadoId
      ? await adicionarAvistamento(usuario.id, imovelIdentificadoId, dadosAvistamento)
      : await criar(
          usuario.id,
          {
            logradouro,
            numero,
            unidade,
            bloco,
            edificio,
            bairro,
            cidade,
            estado: uf,
            cep,
            pontoReferencia,
            tipo: tipoSelecionado,
          },
          dadosAvistamento,
        );
    if (!sucesso) {
      setErro(useProspeccao.getState().erro ?? "Não foi possível salvar o avistamento.");
      return;
    }
    if (!fotoSelecionada.selecionada) {
      limparRascunho();
      fecharModal();
      return;
    }

    setAvistamentoSalvo(true);
    const detalheAtual = useProspeccao.getState().detalhe;
    const avistamentoCriado = detalheAtual?.avistamentos.find(
      (item) => !idsAnteriores.has(item.id),
    );
    if (!detalheAtual || !avistamentoCriado) {
      setErro(
        "O avistamento foi salvo, mas não foi possível localizar o destino da foto. Abra o registro para tentar novamente.",
      );
      return;
    }
    // A partir daqui uma recarga NÃO pode criar segundo avistamento: o
    // rascunho passa a carregar o destino, e a restauração vai direto ao envio.
    destinoRef.current = {
      imovelIdentificadoId: detalheAtual.identificado.id,
      avistamentoId: avistamentoCriado.id,
    };
    persistirRascunho();
    setDestinoFoto({
      imovelIdentificadoId: detalheAtual.identificado.id,
      avistamentoId: avistamentoCriado.id,
    });
  }

  return (
    <>
      <div className="modal-head">
        <div className="modal-title">
          {avistamentoSalvo && rascunhoRestauradoEm
            ? "Concluir envio da foto"
            : primeiroAvistamento
              ? "Registrar primeiro avistamento"
              : "Novo avistamento"}
        </div>
        <button type="button" className="icon-btn" aria-label="Fechar" onClick={cancelar}>
          ✕
        </button>
      </div>
      <form onSubmit={salvar} onChange={marcarTocado}>
        <div className="modal-body">
          {rascunhoRestauradoEm ? (
            <div className={styles.rascunhoRestaurado} role="status">
              <strong>
                {fotoPerdidaEm
                  ? "A foto da câmera do aparelho não chegou."
                  : avistamentoSalvo
                    ? "Avistamento já salvo; a foto ficou pendente."
                    : "Registro não concluído restaurado."}
              </strong>
              <span>
                {fotoPerdidaEm
                  ? `A página foi recarregada ao voltar da câmera às ${horaCurta(fotoPerdidaEm)}. Nada foi enviado. Fotografe de novo por "Fotografar fachada", que usa a câmera aqui na página.`
                  : avistamentoSalvo
                    ? `O envio da foto de ${horaCurta(rascunhoRestauradoEm)} continua de onde parou.`
                    : `Foto e dados de ${horaCurta(rascunhoRestauradoEm)} foram recuperados deste aparelho. Nada foi enviado ainda.`}
              </span>
              <button type="button" className="btn btn-sm" onClick={descartarRascunho}>
                Descartar rascunho
              </button>
            </div>
          ) : null}
          <div className={styles.capturaRapida}>
            <strong>Registre o essencial agora</strong>
            <span>
              Data e horário já estão preenchidos. Foto, observação e dados do imóvel podem ser
              complementados quando fizer sentido.
            </span>
          </div>
          {!primeiroAvistamento ? (
            <div className={styles.identidadeReutilizada}>
              <span>Novo avistamento de</span>
              <strong>{enderecoConhecido}</strong>
              <small>Os dados já conhecidos serão reutilizados; você não precisa digitá-los novamente.</small>
            </div>
          ) : null}
          {/* `key` remonta a captura quando um rascunho é restaurado, para que
              `fotoInicial`/`reservaInicial` entrem como estado inicial. Só a
              restauração muda a chave; limpar o rascunho não a toca. */}
          <CapturaFachada
            key={rascunhoRestauradoEm ?? "novo"}
            imovelIdentificadoId={destinoFoto?.imovelIdentificadoId}
            avistamentoId={destinoFoto?.avistamentoId}
            fotoInicial={fotoInicial}
            reservaInicial={reservaInicial}
            aoEstadoArquivo={aoEstadoArquivo}
            aoReserva={aoReserva}
            aoAntesDeCapturar={aoAntesDeCapturar}
            aoConcluir={aoConcluirEnvio}
          />
          <div className="field-group">
            <label htmlFor="avistamento-observacao">Observação (opcional)</label>
            <textarea
              id="avistamento-observacao"
              rows={3}
              maxLength={2000}
              value={observacao}
              onChange={(evento) => setObservacao(evento.target.value)}
              placeholder="Ex.: placa no portão, imóvel fechado, fachada em obra"
            />
            <div className="field-hint">
              Não registre nome ou telefone aqui · {observacao.length}/2000 caracteres
            </div>
          </div>
          {avistamentoSalvo ? null : (
          <section className={styles.localizacao} aria-label="Localização do avistamento">
            <div className={styles.localizacaoCabecalho}>
              <div>
                <strong>Localização</strong>
                <span role="status">
                  {statusGps === "buscando" || (statusGps !== "ok" && statusGps !== "ocioso" && localizacaoAtual.latitude === null)
                    ? MENSAGEM_GPS[statusGps as Exclude<StatusGps, "ok" | "ocioso">]
                    : descreverLocalizacao(localizacaoAtual)}
                </span>
                {gpsImpreciso(localizacaoAtual) ? (
                  <small className={styles.localizacaoAviso}>
                    Leitura imprecisa (carro, prédios, GPS frio). Ela é guardada mesmo assim; um avistamento
                    mais preciso depois substitui. Toque no mapa se souber o ponto exato.
                  </small>
                ) : null}
                {geocodificando ? <small>Localizando o endereço no mapa…</small> : null}
              </div>
              <button
                type="button"
                className="btn btn-sm"
                disabled={statusGps === "buscando"}
                onClick={lerGps}
              >
                {statusGps === "buscando" ? "Localizando…" : statusGps === "ok" ? "Ler o GPS de novo" : "Usar minha localização"}
              </button>
            </div>
            {localizacaoGps && localizacaoEndereco && !localizacaoMapa ? (
              <fieldset className={styles.fonteLocalizacao}>
                <legend>Onde fica este imóvel?</legend>
                {resolvida.gpsLonge ? (
                  <small className={styles.localizacaoAviso} role="alert">
                    Você está a {distanciaGpsEndereco !== null && distanciaGpsEndereco >= 1000
                      ? `${(distanciaGpsEndereco / 1000).toFixed(1).replace(".", ",")} km`
                      : `${Math.round(distanciaGpsEndereco ?? 0)} m`} do endereço informado.
                    Registrando depois? Use o endereço.
                  </small>
                ) : null}
                <label>
                  <input
                    type="radio"
                    name="fonte-localizacao"
                    checked={resolvida.fonte === "gps"}
                    onChange={() => setFonteEscolhida("gps")}
                  />
                  Onde estou agora ({descreverLocalizacao(localizacaoGps)})
                </label>
                <label>
                  <input
                    type="radio"
                    name="fonte-localizacao"
                    checked={resolvida.fonte === "endereco"}
                    onChange={() => setFonteEscolhida("endereco")}
                  />
                  No endereço informado ({descreverLocalizacao(localizacaoEndereco)})
                </label>
              </fieldset>
            ) : null}
            {localizacaoAtual.latitude !== null ? (
              <MapaProspeccao localizacao={localizacaoAtual} aoEscolherPonto={escolherPontoNoMapa} altura={200} />
            ) : null}
          </section>
          )}
          {primeiroAvistamento ? (
            <div className={styles.enderecoRapido}>
              <div className="field-row">
                <div className="field-group">
                  <label htmlFor="avistamento-logradouro">Logradouro</label>
                  <EnderecoAutocompleteViaCep
                    id="avistamento-logradouro"
                    value={logradouro}
                    cidade={cidade}
                    estado={estado}
                    onChange={setLogradouro}
                    onSelecionar={aplicarEnderecoViaCep}
                    placeholder="Digite a rua e escolha a sugestão"
                  />
                </div>
                <div className="field-group">
                  <label htmlFor="avistamento-numero">Número</label>
                  <input
                    id="avistamento-numero"
                    type="text"
                    value={numero}
                    onChange={(evento) => setNumero(evento.target.value)}
                    onBlur={localizarEnderecoDigitado}
                  />
                </div>
              </div>
              <div className="field-row">
                <div className="field-group">
                  <label htmlFor="avistamento-cidade">Cidade</label>
                  <input
                    id="avistamento-cidade"
                    type="text"
                    value={cidade}
                    onChange={(evento) => setCidade(evento.target.value)}
                    onBlur={localizarEnderecoDigitado}
                  />
                </div>
                <div className="field-group">
                  <label htmlFor="avistamento-estado">Estado</label>
                  <input
                    id="avistamento-estado"
                    type="text"
                    maxLength={2}
                    value={estado}
                    onChange={(evento) => setEstado(evento.target.value)}
                    placeholder="PR"
                  />
                </div>
              </div>
            </div>
          ) : null}
          <div className="field-row">
            <div className="field-group">
              <label htmlFor="avistamento-data">Data</label>
              <input
                id="avistamento-data"
                type="date"
                required
                value={data}
                onChange={(evento) => setData(evento.target.value)}
              />
            </div>
            <div className="field-group">
              <label htmlFor="avistamento-hora">Horário</label>
              <input
                id="avistamento-hora"
                type="time"
                required
                value={hora}
                onChange={(evento) => setHora(evento.target.value)}
              />
            </div>
          </div>
          {primeiroAvistamento ? (
            <details className={styles.maisDetalhes}>
              <summary>Mais detalhes do imóvel (opcional)</summary>
              <div className={styles.camposDetalhes}>
                <div className="field-group">
                  <label htmlFor="avistamento-referencia">Ponto de referência</label>
                  <input
                    id="avistamento-referencia"
                    type="text"
                    value={pontoReferencia}
                    onChange={(evento) => setPontoReferencia(evento.target.value)}
                    placeholder="Ex.: ao lado do mercado"
                  />
                </div>
                <div className="field-row-3">
                  <div className="field-group">
                    <label htmlFor="avistamento-unidade">Unidade</label>
                    <input
                      id="avistamento-unidade"
                      type="text"
                      value={unidade}
                      onChange={(evento) => setUnidade(evento.target.value)}
                    />
                  </div>
                  <div className="field-group">
                    <label htmlFor="avistamento-bloco">Bloco</label>
                    <input
                      id="avistamento-bloco"
                      type="text"
                      value={bloco}
                      onChange={(evento) => setBloco(evento.target.value)}
                    />
                  </div>
                  <div className="field-group">
                    <label htmlFor="avistamento-edificio">Edifício</label>
                    <input
                      id="avistamento-edificio"
                      type="text"
                      value={edificio}
                      onChange={(evento) => setEdificio(evento.target.value)}
                    />
                  </div>
                </div>
                <div className="field-row">
                  <div className="field-group">
                    <label htmlFor="avistamento-bairro">Bairro</label>
                    <input
                      id="avistamento-bairro"
                      type="text"
                      value={bairro}
                      onChange={(evento) => setBairro(evento.target.value)}
                    />
                  </div>
                  <div className="field-group">
                    <label htmlFor="avistamento-cep">CEP</label>
                    <input
                      id="avistamento-cep"
                      type="text"
                      value={cep}
                      onChange={(evento) => setCep(evento.target.value)}
                    />
                  </div>
                </div>
                <div className="field-group">
                  <label htmlFor="avistamento-tipo">Tipo do imóvel</label>
                  <select
                    id="avistamento-tipo"
                    value={tipo}
                    onChange={(evento) => setTipo(evento.target.value)}
                  >
                    <option value="">Não definido</option>
                    {TIPOS_IMOVEL.map((opcao) => (
                      <option value={opcao} key={opcao}>{opcao}</option>
                    ))}
                  </select>
                </div>
              </div>
            </details>
          ) : null}
          {avistamentoSalvo ? (
            <div className={styles.avistamentoPersistido} role="status">
              Avistamento salvo. Se a foto falhar, tente novamente sem preencher os dados outra vez.
            </div>
          ) : null}
          {erro ? <div className="field-hint" style={{ color: "var(--bad)" }} role="alert">{erro}</div> : null}
        </div>
        <div className="modal-foot">
          <div></div>
          <div className="modal-foot-primary">
            <button type="button" className="btn" disabled={salvando} onClick={cancelar}>
              {avistamentoSalvo ? "Fechar" : "Cancelar"}
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={salvando || !usuario || avistamentoSalvo || fotoSelecionada.processando}
            >
              {avistamentoSalvo
                ? "Avistamento salvo"
                : salvando
                  ? "Salvando…"
                  : fotoSelecionada.selecionada && fotoSelecionada.pronta
                    ? "Registrar e enviar foto"
                    : "Salvar avistamento"}
            </button>
          </div>
        </div>
      </form>
    </>
  );
}
