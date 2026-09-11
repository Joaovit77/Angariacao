"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";

import { useSessao } from "@/components/SessaoProvider";
import CapturaFachada, { type EstadoArquivoFachada } from "@/components/prospeccao/CapturaFachada";
import styles from "@/components/prospeccao/Prospeccao.module.css";
import type { ResultadoProcessamentoFoto } from "@/lib/calculo/fotoFachada";
import { TIPOS_IMOVEL } from "@/lib/constantes";
import { dataHoraLocalParaIso, partesDataHoraLocal } from "@/lib/datas";
import type { ReservaFotoAvistamento } from "@/lib/prospeccao";
import {
  armazemRascunhoCaptura,
  avaliarRascunho,
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

function horaCurta(iso: string): string {
  const data = new Date(iso);
  if (Number.isNaN(data.getTime())) return "";
  return data.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
}

export default function ModalAvistamento({
  imovelIdentificadoId,
  armazemRascunho,
}: {
  imovelIdentificadoId?: string;
  /** Injetável para teste; em produção é o IndexedDB do aparelho. */
  armazemRascunho?: ArmazemRascunhoCaptura;
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
  const tocado = useRef(false);
  const fotoProcessada = useRef<ResultadoProcessamentoFoto<Blob> | null>(null);
  const destinoRef = useRef<typeof destinoFoto>(null);
  const reservaRef = useRef<ReservaFotoAvistamento | null>(null);
  const temporizador = useRef<number | null>(null);

  const camposAtuais = useCallback((): CamposRascunhoCaptura => ({
    data, hora, observacao, logradouro, numero, unidade, bloco, edificio,
    bairro, cidade, estado, cep, pontoReferencia, tipo,
  }), [bairro, bloco, cep, cidade, data, edificio, estado, hora, logradouro, numero, observacao, pontoReferencia, tipo, unidade]);

  const persistirRascunho = useCallback(() => {
    if (!usuario) return;
    const rascunho: RascunhoCaptura = {
      usuarioId: usuario.id,
      imovelIdentificadoId: contextoRascunho,
      salvoEm: new Date().toISOString(),
      campos: camposAtuais(),
      foto: fotoProcessada.current,
      destino: destinoRef.current,
      reserva: reservaRef.current,
    };
    void armazem.salvar(rascunho);
  }, [armazem, camposAtuais, contextoRascunho, usuario]);

  const limparRascunho = useCallback(() => {
    if (!usuario) return;
    if (temporizador.current !== null) window.clearTimeout(temporizador.current);
    void armazem.limpar(usuario.id);
  }, [armazem, usuario]);

  // Restaura ao montar. Só o contexto certo, só dentro do prazo, e só se
  // houver algo além de data/hora (que já nascem preenchidas).
  useEffect(() => {
    if (!usuario) return;
    let cancelado = false;
    void (async () => {
      const rascunho = await armazem.ler(usuario.id);
      if (cancelado) return;
      const veredito = avaliarRascunho(rascunho, usuario.id, contextoRascunho);
      if (veredito === "expirado") void armazem.limpar(usuario.id);
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
      }
      setRascunhoPronto(true);
    })();
    return () => { cancelado = true; };
    // Só na montagem: os setters são estáveis e `agora` é o instante de abrir.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [armazem, contextoRascunho, usuario?.id]);

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

  function aoEstadoArquivo(estadoArquivo: EstadoArquivoFachada) {
    setFotoSelecionada(estadoArquivo);
    if (estadoArquivo.pronta && estadoArquivo.processada) {
      // A foto processada é o que mais custa refazer: grava na hora.
      fotoProcessada.current = estadoArquivo.processada;
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

  function aoAntesDeCapturar() {
    // Último instante em que a página tem certeza de estar viva.
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
    const dadosAvistamento = {
      observadoEm,
      observacao,
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
                {avistamentoSalvo
                  ? "Avistamento já salvo; a foto ficou pendente."
                  : "Registro não concluído restaurado."}
              </strong>
              <span>
                {avistamentoSalvo
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
                <div className="field-row">
                  <div className="field-group">
                    <label htmlFor="avistamento-logradouro">Logradouro</label>
                    <input
                      id="avistamento-logradouro"
                      type="text"
                      maxLength={200}
                      value={logradouro}
                      onChange={(evento) => setLogradouro(evento.target.value)}
                      placeholder="Rua, avenida ou estrada"
                    />
                  </div>
                  <div className="field-group">
                    <label htmlFor="avistamento-numero">Número</label>
                    <input
                      id="avistamento-numero"
                      type="text"
                      value={numero}
                      onChange={(evento) => setNumero(evento.target.value)}
                    />
                  </div>
                </div>
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
                    <label htmlFor="avistamento-cidade">Cidade</label>
                    <input
                      id="avistamento-cidade"
                      type="text"
                      value={cidade}
                      onChange={(evento) => setCidade(evento.target.value)}
                    />
                  </div>
                </div>
                <div className="field-row">
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
