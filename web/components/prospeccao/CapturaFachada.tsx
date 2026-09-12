"use client";

import Image, { type ImageLoaderProps } from "next/image";
import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";

import {
  ErroFotoFachada,
  processarFotoFachada,
  type ResultadoProcessamentoFoto,
} from "@/lib/calculo/fotoFachada";
import type { FotoAvistamento, ReservaFotoAvistamento } from "@/lib/prospeccao";
import { getSupabase } from "@/lib/persistencia/supabase";
import { useProspeccao } from "@/lib/useProspeccao";

import CameraFachada, {
  cameraEmPaginaDisponivel,
  type DependenciasCameraFachada,
} from "./CameraFachada";
import styles from "./Prospeccao.module.css";

export const BUCKET_FACHADAS = "fachadas";
export const TTL_URL_FACHADA_SEGUNDOS = 300;

export type EtapaEnvio =
  | "ocioso"
  | "preparando"
  | "pronto"
  | "reservando"
  | "enviando-original"
  | "enviando-miniatura"
  | "finalizando"
  | "concluido"
  | "envio-nao-concluido"
  | "erro-recuperavel";

const PROGRESSO: Partial<Record<EtapaEnvio, { percentual: number; passo: string }>> = {
  reservando: { percentual: 20, passo: "Etapa 1 de 4" },
  "enviando-original": { percentual: 45, passo: "Etapa 2 de 4" },
  "enviando-miniatura": { percentual: 70, passo: "Etapa 3 de 4" },
  finalizando: { percentual: 90, passo: "Etapa 4 de 4" },
  concluido: { percentual: 100, passo: "100%" },
};

const ROTULOS_ETAPA: Record<EtapaEnvio, string> = {
  ocioso: "Aguardando foto",
  preparando: "Preparando imagem",
  pronto: "Foto pronta para registrar",
  reservando: "Reservando",
  "enviando-original": "Enviando original",
  "enviando-miniatura": "Enviando miniatura",
  finalizando: "Finalizando",
  concluido: "Concluído",
  "envio-nao-concluido": "Envio não concluído",
  "erro-recuperavel": "Envio não concluído",
};

interface DestinoFachada {
  imovelIdentificadoId: string;
  avistamentoId: string;
}

export interface PrazosFachada {
  processamentoMs: number;
  reservaMs: number;
  uploadMs: number;
  finalizacaoMs: number;
}

export const PRAZOS_FACHADA: PrazosFachada = {
  processamentoMs: 45_000,
  reservaMs: 30_000,
  uploadMs: 60_000,
  finalizacaoMs: 30_000,
};

interface DependenciasEnvio {
  reservar: (
    imovelIdentificadoId: string,
    avistamentoId: string,
    dados: { largura: number; altura: number; bytes: number },
  ) => Promise<ReservaFotoAvistamento | null>;
  enviarObjeto: (caminho: string, arquivo: Blob, contentType: string) => Promise<unknown | null>;
  finalizar: (imovelIdentificadoId: string, fotoId: string) => Promise<boolean>;
}

interface DependenciasCapturaFachada extends DependenciasEnvio {
  preparar: (arquivo: File) => Promise<ResultadoProcessamentoFoto<Blob>>;
  /** Força a disponibilidade da câmera em página (teste); por padrão
      consulta `navigator.mediaDevices`. */
  cameraDisponivel: boolean;
  camera: Partial<DependenciasCameraFachada>;
}

export type FalhaFachada =
  | "processamento"
  | "reserva"
  | "upload-original"
  | "upload-miniatura"
  | "finalizacao";

export class ErroEnvioFachada extends Error {
  constructor(
    mensagem: string,
    public readonly reservaCriada: boolean,
    public readonly etapaFalha: FalhaFachada = "reserva",
    public readonly reserva: ReservaFotoAvistamento | null = null,
  ) {
    super(mensagem);
    this.name = "ErroEnvioFachada";
  }
}

function comTempoLimite<T>(
  operacao: () => Promise<T>,
  tempoMaximoMs: number,
  erroDePrazo: () => ErroEnvioFachada,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let encerrada = false;
    const temporizador = window.setTimeout(() => {
      if (encerrada) return;
      encerrada = true;
      reject(erroDePrazo());
    }, tempoMaximoMs);

    void Promise.resolve()
      .then(operacao)
      .then(
        (resultado) => {
          if (encerrada) return;
          encerrada = true;
          window.clearTimeout(temporizador);
          resolve(resultado);
        },
        (falha) => {
          if (encerrada) return;
          encerrada = true;
          window.clearTimeout(temporizador);
          reject(falha);
        },
      );
  });
}

function mensagemDaFalha(etapa: FalhaFachada): string {
  if (etapa === "processamento") return "Não foi possível preparar a imagem.";
  if (etapa === "reserva") return "Não foi possível reservar a foto.";
  if (etapa === "upload-original") return "O envio da foto original não foi concluído.";
  if (etapa === "upload-miniatura") return "O envio da miniatura não foi concluído.";
  return "Os dois arquivos ainda não foram confirmados.";
}

function erroDeObjetoExistente(erro: unknown): boolean {
  if (!erro || typeof erro !== "object") return false;
  const registro = erro as Record<string, unknown>;
  const texto = [registro.error, registro.name, registro.message]
    .filter((valor): valor is string => typeof valor === "string")
    .join(" ")
    .toLocaleLowerCase("en-US");
  return /already exists|duplicate|já existe/.test(texto);
}

export async function executarEnvioFachada(
  destino: DestinoFachada,
  foto: ResultadoProcessamentoFoto<Blob>,
  dependencias: DependenciasEnvio,
  informarEtapa: (etapa: EtapaEnvio) => void,
  opcoes: {
    reserva?: ReservaFotoAvistamento | null;
    prazos?: Partial<PrazosFachada>;
  } = {},
): Promise<ReservaFotoAvistamento> {
  const prazos = { ...PRAZOS_FACHADA, ...opcoes.prazos };
  let reserva = opcoes.reserva ?? null;
  let etapaFalha: FalhaFachada = "reserva";

  try {
    if (!reserva) {
      informarEtapa("reservando");
      reserva = await comTempoLimite(
        () => dependencias.reservar(
          destino.imovelIdentificadoId,
          destino.avistamentoId,
          {
            largura: foto.original.largura,
            altura: foto.original.altura,
            bytes: foto.original.bytes,
          },
        ),
        prazos.reservaMs,
        () => new ErroEnvioFachada(
          "A reserva demorou demais. Tente novamente.",
          false,
          "reserva",
        ),
      );
    }
    if (!reserva) throw new ErroEnvioFachada(mensagemDaFalha("reserva"), false, "reserva");
    const caminhoMiniatura = reserva.caminhoMiniatura;
    if (!caminhoMiniatura) {
      throw new ErroEnvioFachada(
        "A reserva não informou o caminho da miniatura.",
        true,
        "reserva",
        reserva,
      );
    }
    const reservaConfirmada = reserva;

    for (const objeto of [
      {
        etapa: "enviando-original" as const,
        etapaFalha: "upload-original" as const,
        caminho: reservaConfirmada.caminho,
        arquivo: foto.original.conteudo,
        mimeType: foto.original.mimeType,
      },
      {
        etapa: "enviando-miniatura" as const,
        etapaFalha: "upload-miniatura" as const,
        caminho: caminhoMiniatura,
        arquivo: foto.miniatura.conteudo,
        mimeType: foto.miniatura.mimeType,
      },
    ]) {
      etapaFalha = objeto.etapaFalha;
      informarEtapa(objeto.etapa);
      const erro = await comTempoLimite(
        () => dependencias.enviarObjeto(objeto.caminho, objeto.arquivo, objeto.mimeType),
        prazos.uploadMs,
        () => new ErroEnvioFachada(
          "O envio demorou demais. Tente novamente.",
          true,
          objeto.etapaFalha,
          reservaConfirmada,
        ),
      );
      if (erro && !erroDeObjetoExistente(erro)) {
        throw new ErroEnvioFachada(
          mensagemDaFalha(objeto.etapaFalha),
          true,
          objeto.etapaFalha,
          reservaConfirmada,
        );
      }
    }

    etapaFalha = "finalizacao";
    informarEtapa("finalizando");
    const finalizada = await comTempoLimite(
      () => dependencias.finalizar(destino.imovelIdentificadoId, reservaConfirmada.fotoId),
      prazos.finalizacaoMs,
      () => new ErroEnvioFachada(
        "A confirmação demorou demais. Tente novamente.",
        true,
        "finalizacao",
        reservaConfirmada,
      ),
    );
    if (!finalizada) {
      throw new ErroEnvioFachada(
        mensagemDaFalha("finalizacao"),
        true,
        "finalizacao",
        reservaConfirmada,
      );
    }
    informarEtapa("concluido");
    return reservaConfirmada;
  } catch (falha) {
    informarEtapa("envio-nao-concluido");
    if (falha instanceof ErroEnvioFachada) throw falha;
    throw new ErroEnvioFachada(
      mensagemDaFalha(etapaFalha),
      Boolean(reserva),
      etapaFalha,
      reserva,
    );
  }
}

interface ImagemDecodificada {
  largura: number;
  altura: number;
  desenhar: (contexto: CanvasRenderingContext2D, largura: number, altura: number) => void;
  liberar: () => void;
}

async function decodificarImagem(arquivo: File): Promise<ImagemDecodificada> {
  if (typeof createImageBitmap === "function") {
    const bitmap = await createImageBitmap(arquivo);
    return {
      largura: bitmap.width,
      altura: bitmap.height,
      desenhar: (contexto, largura, altura) => contexto.drawImage(bitmap, 0, 0, largura, altura),
      liberar: () => bitmap.close(),
    };
  }
  const url = URL.createObjectURL(arquivo);
  let imagem: HTMLImageElement;
  try {
    imagem = await new Promise<HTMLImageElement>((resolve, reject) => {
      const elemento = document.createElement("img");
      elemento.onload = () => resolve(elemento);
      elemento.onerror = () => reject(new ErroFotoFachada("dimensoes-invalidas", "Não foi possível ler a imagem."));
      elemento.src = url;
    });
  } catch (erro) {
    URL.revokeObjectURL(url);
    throw erro;
  }
  return {
    largura: imagem.naturalWidth,
    altura: imagem.naturalHeight,
    desenhar: (contexto, largura, altura) => contexto.drawImage(imagem, 0, 0, largura, altura),
    liberar: () => URL.revokeObjectURL(url),
  };
}

function canvasParaBlob(canvas: HTMLCanvasElement, mimeType: string, qualidade: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => blob ? resolve(blob) : reject(new ErroFotoFachada("dimensoes-invalidas", "Não foi possível codificar a imagem.")),
      mimeType,
      qualidade,
    );
  });
}

export async function prepararArquivoFachada(
  arquivo: File,
): Promise<ResultadoProcessamentoFoto<Blob>> {
  const imagem = await decodificarImagem(arquivo);
  try {
    return await processarFotoFachada(
      { largura: imagem.largura, altura: imagem.altura, mimeType: arquivo.type },
      async (tentativa) => {
        const canvas = document.createElement("canvas");
        canvas.width = tentativa.largura;
        canvas.height = tentativa.altura;
        const contexto = canvas.getContext("2d");
        if (!contexto) {
          throw new ErroFotoFachada("dimensoes-invalidas", "O navegador não permitiu processar a imagem.");
        }
        imagem.desenhar(contexto, tentativa.largura, tentativa.altura);
        const conteudo = await canvasParaBlob(canvas, tentativa.mimeType, tentativa.qualidade);
        return { conteudo, bytes: conteudo.size };
      },
    );
  } finally {
    imagem.liberar();
  }
}

export async function executarProcessamentoFachada(
  arquivo: File,
  preparar: (arquivo: File) => Promise<ResultadoProcessamentoFoto<Blob>>,
  informarEtapa: (etapa: EtapaEnvio) => void,
  tempoMaximoMs = PRAZOS_FACHADA.processamentoMs,
): Promise<ResultadoProcessamentoFoto<Blob>> {
  informarEtapa("preparando");
  try {
    const resultado = await comTempoLimite(
      () => preparar(arquivo),
      tempoMaximoMs,
      () => new ErroEnvioFachada(
        "O processamento da imagem demorou demais. Tente novamente.",
        false,
        "processamento",
      ),
    );
    informarEtapa("pronto");
    return resultado;
  } catch (falha) {
    informarEtapa("erro-recuperavel");
    if (falha instanceof ErroEnvioFachada) throw falha;
    throw new ErroEnvioFachada(
      falha instanceof Error ? falha.message : mensagemDaFalha("processamento"),
      false,
      "processamento",
    );
  }
}

function manterUrlAssinada({ src }: ImageLoaderProps): string {
  return src;
}

export type OrigemCaptura = "pagina" | "aparelho";

export interface EstadoArquivoFachada {
  selecionada: boolean;
  pronta: boolean;
  processando: boolean;
  /** A foto já processada, quando `pronta`. É o que o rascunho guarda
      para sobreviver a uma recarga da página. */
  processada?: ResultadoProcessamentoFoto<Blob> | null;
}

export default function CapturaFachada({
  imovelIdentificadoId,
  avistamentoId,
  foto,
  fotoInicial,
  reservaInicial,
  aoEstadoArquivo,
  aoReserva,
  aoAntesDeCapturar,
  aoConcluir,
  dependencias,
  prazos,
}: {
  imovelIdentificadoId?: string;
  avistamentoId?: string;
  foto?: FotoAvistamento;
  /** Foto restaurada de um rascunho: entra já processada, sem passar pelo
      input. É o que evita fotografar de novo depois de a aba ser descartada. */
  fotoInicial?: ResultadoProcessamentoFoto<Blob> | null;
  /** Reserva restaurada de um rascunho: o retry reutiliza os caminhos. */
  reservaInicial?: ReservaFotoAvistamento | null;
  aoEstadoArquivo?: (estado: EstadoArquivoFachada) => void;
  /** Disparado assim que uma reserva existe — sucesso ou falha depois dela. */
  aoReserva?: (reserva: ReservaFotoAvistamento) => void;
  /** Disparado ao tocar em "Fotografar", ANTES de a câmera abrir: é o último
      instante em que a página tem a certeza de estar viva. "aparelho" é o
      input nativo, que troca de aplicativo e pode não voltar. */
  aoAntesDeCapturar?: (origem: OrigemCaptura) => void;
  aoConcluir?: () => void;
  dependencias?: Partial<DependenciasCapturaFachada>;
  prazos?: Partial<PrazosFachada>;
}) {
  const reservarDoStore = useProspeccao((estado) => estado.reservarFoto);
  const finalizarDoStore = useProspeccao((estado) => estado.finalizarFoto);
  const reservar = dependencias?.reservar ?? reservarDoStore;
  const finalizar = dependencias?.finalizar ?? finalizarDoStore;
  const preparar = dependencias?.preparar ?? prepararArquivoFachada;
  const [processada, setProcessada] = useState<ResultadoProcessamentoFoto<Blob> | null>(
    fotoInicial ?? null,
  );
  const [etapa, setEtapa] = useState<EtapaEnvio>(
    fotoInicial ? "pronto" : foto?.estado === "reservada" ? "envio-nao-concluido" : "ocioso",
  );
  const [erro, setErro] = useState("");
  const [urlAssinada, setUrlAssinada] = useState<string | null>(null);
  const [imagemIndisponivel, setImagemIndisponivel] = useState(false);
  const [arquivoDisponivel, setArquivoDisponivel] = useState(Boolean(fotoInicial));
  const [reservaPreservada, setReservaPreservada] = useState(
    Boolean(reservaInicial) || foto?.estado === "reservada",
  );
  // Lido uma vez na montagem: o modal só existe no cliente, então não há
  // divergência com o servidor.
  const [cameraEmPagina] = useState(
    () => dependencias?.cameraDisponivel ?? cameraEmPaginaDisponivel(),
  );
  const [cameraAberta, setCameraAberta] = useState(false);
  const versaoArquivo = useRef(0);
  const arquivoSelecionado = useRef<File | null>(null);
  const reservaAtual = useRef<ReservaFotoAvistamento | null>(reservaInicial ?? null);
  const envioIniciado = useRef("");
  const enviando = etapa === "preparando"
    || etapa === "reservando"
    || etapa === "enviando-original"
    || etapa === "enviando-miniatura"
    || etapa === "finalizando";

  const enviarObjeto = useCallback(async (caminho: string, arquivo: Blob, contentType: string) => {
    if (dependencias?.enviarObjeto) {
      return dependencias.enviarObjeto(caminho, arquivo, contentType);
    }
    const { error } = await getSupabase().storage.from(BUCKET_FACHADAS).upload(
      caminho,
      arquivo,
      { contentType, cacheControl: "3600", upsert: false },
    );
    return error;
  }, [dependencias]);

  // A visualização grande é sempre a foto ORIGINAL. A miniatura (320 px) é
  // para card e prévia pequena; esticada a 100% do painel ela vira borrão —
  // foi a "qualidade baixa" vista no smoke de 12/09.
  useEffect(() => {
    const caminho = foto?.estado === "ativa" ? foto.caminho : null;
    if (!caminho) return;
    let cancelado = false;
    void (async () => {
      try {
        const { data, error } = await getSupabase().storage
          .from(BUCKET_FACHADAS)
          .createSignedUrl(caminho, TTL_URL_FACHADA_SEGUNDOS);
        if (cancelado) return;
        if (error || !data?.signedUrl) setImagemIndisponivel(true);
        else setUrlAssinada(data.signedUrl);
      } catch {
        if (!cancelado) setImagemIndisponivel(true);
      }
    })();
    return () => { cancelado = true; };
  }, [foto?.caminho, foto?.estado]);

  const enviar = useCallback(async () => {
    if (!processada || !imovelIdentificadoId || !avistamentoId || enviando) return;
    setErro("");
    try {
      const reserva = await executarEnvioFachada(
        { imovelIdentificadoId, avistamentoId },
        processada,
        {
          reservar,
          finalizar,
          enviarObjeto,
        },
        setEtapa,
        { reserva: reservaAtual.current, prazos },
      );
      reservaAtual.current = reserva;
      setReservaPreservada(true);
      aoReserva?.(reserva);
      aoConcluir?.();
    } catch (falha) {
      if (falha instanceof ErroEnvioFachada && falha.reserva) {
        reservaAtual.current = falha.reserva;
        setReservaPreservada(true);
        aoReserva?.(falha.reserva);
      }
      setEtapa("envio-nao-concluido");
      setErro(falha instanceof Error ? falha.message : "Não foi possível enviar a foto.");
    }
  }, [aoConcluir, aoReserva, avistamentoId, enviando, enviarObjeto, finalizar, imovelIdentificadoId, prazos, processada, reservar]);

  useEffect(() => {
    if (!processada || !imovelIdentificadoId || !avistamentoId) return;
    const chave = `${imovelIdentificadoId}:${avistamentoId}:${versaoArquivo.current}`;
    if (envioIniciado.current === chave) return;
    envioIniciado.current = chave;
    void enviar();
  }, [avistamentoId, enviar, imovelIdentificadoId, processada]);

  const processarArquivoAtual = useCallback(async () => {
    const arquivo = arquivoSelecionado.current;
    if (!arquivo || enviando) return;
    const versao = versaoArquivo.current + 1;
    versaoArquivo.current = versao;
    setProcessada(null);
    setErro("");
    aoEstadoArquivo?.({ selecionada: true, pronta: false, processando: true });
    try {
      const resultado = await executarProcessamentoFachada(
        arquivo,
        preparar,
        setEtapa,
        prazos?.processamentoMs,
      );
      if (versaoArquivo.current !== versao) return;
      setProcessada(resultado);
      aoEstadoArquivo?.({ selecionada: true, pronta: true, processando: false, processada: resultado });
    } catch (falha) {
      if (versaoArquivo.current !== versao) return;
      setEtapa("erro-recuperavel");
      setErro(falha instanceof Error ? falha.message : "Não foi possível preparar a imagem.");
      aoEstadoArquivo?.({ selecionada: true, pronta: false, processando: false });
    }
  }, [aoEstadoArquivo, enviando, preparar, prazos]);

  function selecionarArquivo(evento: ChangeEvent<HTMLInputElement>) {
    const arquivo = evento.target.files?.[0] ?? null;
    evento.currentTarget.value = "";
    arquivoSelecionado.current = arquivo;
    setArquivoDisponivel(Boolean(arquivo));
    if (!arquivo) {
      setProcessada(null);
      setErro("");
      aoEstadoArquivo?.({ selecionada: false, pronta: false, processando: false });
      setEtapa(foto?.estado === "reservada" ? "envio-nao-concluido" : "ocioso");
      return;
    }
    void processarArquivoAtual();
  }

  function tentarNovamente() {
    if (processada) void enviar();
    else void processarArquivoAtual();
  }

  function abrirCamera() {
    // A página não sai de cena aqui, mas guardar o rascunho é barato e
    // mantém a mesma garantia dos dois caminhos.
    aoAntesDeCapturar?.("pagina");
    setErro("");
    setCameraAberta(true);
  }

  function receberCaptura(arquivo: File) {
    setCameraAberta(false);
    arquivoSelecionado.current = arquivo;
    setArquivoDisponivel(true);
    void processarArquivoAtual();
  }

  function cameraFalhou(mensagem: string) {
    setCameraAberta(false);
    setErro(mensagem);
  }

  if (foto?.estado === "ativa") {
    return (
      <div className={styles.fotoFachada}>
        {urlAssinada && !imagemIndisponivel ? (
          <Image
            loader={manterUrlAssinada}
            unoptimized
            src={urlAssinada}
            alt="Fachada registrada neste avistamento"
            width={640}
            height={400}
            onError={() => setImagemIndisponivel(true)}
          />
        ) : (
          <span className={styles.imagemIndisponivel}>
            {!imagemIndisponivel ? "Carregando imagem…" : "Imagem indisponível"}
          </span>
        )}
      </div>
    );
  }

  return (
    <section className={styles.capturaFachada} aria-label="Foto da fachada">
      <div className={styles.capturaTopo}>
        <div>
          <strong>{ROTULOS_ETAPA[etapa]}</strong>
          <small>JPEG ou WebP · até 5 MB após o processamento</small>
        </div>
        {PROGRESSO[etapa] ? <span>{PROGRESSO[etapa]?.passo}</span> : null}
      </div>
      {etapa === "preparando" ? (
        <progress aria-label="Preparando a foto" />
      ) : PROGRESSO[etapa] ? (
        <progress
          max={100}
          value={PROGRESSO[etapa]?.percentual}
          aria-label="Progresso por etapas do envio da foto"
        />
      ) : null}
      {etapa === "pronto" ? <p>Salve o avistamento para iniciar o envio.</p> : null}
      {etapa === "envio-nao-concluido" || etapa === "erro-recuperavel" ? (
        <p>A foto foi preservada e qualquer reserva existente será reutilizada na nova tentativa.</p>
      ) : null}
      {erro ? <p className={styles.erroCaptura} role="alert">{erro}</p> : null}
      {cameraAberta ? (
        <CameraFachada
          aoCapturar={receberCaptura}
          aoCancelar={() => setCameraAberta(false)}
          aoFalhar={cameraFalhou}
          dependencias={dependencias?.camera}
        />
      ) : null}
      <div className={styles.capturaAcoes}>
        {!cameraAberta && (!reservaPreservada || !arquivoDisponivel) ? (
          <>
            {/* Caminho principal: câmera dentro da página. O input nativo
                troca de aplicativo e, em aparelhos apertados, o Chrome
                descarta a aba e perde a foto na volta. */}
            {cameraEmPagina && !reservaPreservada ? (
              <button type="button" className="btn btn-sm btn-primary" onClick={abrirCamera} disabled={enviando}>
                Fotografar fachada
              </button>
            ) : null}
            <label className={cameraEmPagina && !reservaPreservada ? styles.capturaAlternativa : "btn btn-sm"}>
              {reservaPreservada
                ? "Selecionar a mesma foto para retomar"
                : cameraEmPagina ? "Usar a câmera do aparelho" : "Fotografar fachada"}
              {/* O clique no input é o último instante em que a página está viva
                  antes de a câmera abrir; no Android a aba pode ser descartada. */}
              <input
                className={styles.inputFoto}
                type="file"
                accept="image/*"
                capture="environment"
                disabled={enviando}
                onClick={() => aoAntesDeCapturar?.("aparelho")}
                onChange={selecionarArquivo}
              />
            </label>
            {/* Quem saiu fotografando e registra depois escolhe da galeria. É o
                mesmo input sem `capture`; a foto passa pelo mesmo processamento,
                e o EXIF (inclusive GPS) continua sendo descartado no re-encode. */}
            {!reservaPreservada ? (
              <label className={styles.capturaAlternativa}>
                Escolher da galeria
                <input
                  className={styles.inputFoto}
                  type="file"
                  accept="image/*"
                  disabled={enviando}
                  onClick={() => aoAntesDeCapturar?.("aparelho")}
                  onChange={selecionarArquivo}
                />
              </label>
            ) : null}
          </>
        ) : null}
        {(etapa === "envio-nao-concluido" || etapa === "erro-recuperavel")
          && (processada || arquivoDisponivel) ? (
          <button type="button" className="btn btn-sm btn-primary" onClick={tentarNovamente}>
            Tentar novamente
          </button>
        ) : null}
      </div>
    </section>
  );
}
