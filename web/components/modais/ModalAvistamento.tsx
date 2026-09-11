"use client";

import { useState, type FormEvent } from "react";

import { useSessao } from "@/components/SessaoProvider";
import CapturaFachada from "@/components/prospeccao/CapturaFachada";
import styles from "@/components/prospeccao/Prospeccao.module.css";
import { TIPOS_IMOVEL } from "@/lib/constantes";
import { dataHoraLocalParaIso, partesDataHoraLocal } from "@/lib/datas";
import { useProspeccao } from "@/lib/useProspeccao";
import { useUiModal } from "@/lib/uiModal";

export default function ModalAvistamento({
  imovelIdentificadoId,
}: {
  imovelIdentificadoId?: string;
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
  const [fotoSelecionada, setFotoSelecionada] = useState({
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
    setDestinoFoto({
      imovelIdentificadoId: detalheAtual.identificado.id,
      avistamentoId: avistamentoCriado.id,
    });
  }

  return (
    <>
      <div className="modal-head">
        <div className="modal-title">
          {primeiroAvistamento ? "Registrar primeiro avistamento" : "Novo avistamento"}
        </div>
        <button type="button" className="icon-btn" aria-label="Fechar" onClick={fecharModal}>
          ✕
        </button>
      </div>
      <form onSubmit={salvar}>
        <div className="modal-body">
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
          <CapturaFachada
            imovelIdentificadoId={destinoFoto?.imovelIdentificadoId}
            avistamentoId={destinoFoto?.avistamentoId}
            aoEstadoArquivo={setFotoSelecionada}
            aoConcluir={fecharModal}
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
            <button type="button" className="btn" disabled={salvando} onClick={fecharModal}>
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
