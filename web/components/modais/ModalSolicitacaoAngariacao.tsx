"use client";

/* ================================================================
   MODAL: SOLICITAÇÃO DE ANGARIAÇÃO

   O formulário que o financeiro da imobiliária recebe quando a
   captação vira contrato. Componente de montagem: toda a regra —
   quais linhas, em que ordem, como a REF INQUILINO se deriva, o que
   ainda falta — mora em `calculo/solicitacaoAngariacao.ts`.

   Duas escolhas de tela:

   - **A REF INQUILINO não se digita, se conta.** Ela é
     `<REF PROP>.<NN>`, e NN é a vez em que o imóvel foi locado — algo
     que o `statusHistory` já sabe. O campo editável é o NÚMERO da
     locação, não a referência montada: com os dois em texto livre,
     eles poderiam divergir na tela, e a solicitação sairia pedindo
     comissão de um contrato para a referência de outro.

   - **A prévia mostra o documento, não os campos.** É ela que o
     corretor confere antes de mandar, e vem de `linhasSolicitacao`,
     a mesma função que gera o .docx — o que ele lê aqui é o que o
     financeiro abre lá.
   ================================================================ */
import { useState } from "react";
import { captadorPadrao, useSessao } from "@/components/SessaoProvider";
import {
  SUBTITULO_SOLICITACAO,
  TITULO_SOLICITACAO,
  arquivosDocxSolicitacao,
  comissaoDaSolicitacao,
  linhasSolicitacao,
  nomeArquivoSolicitacao,
  numeroLocacao,
  pendenciasSolicitacao,
  referenciaInquilino,
  solicitacaoInicial,
  textoSolicitacao,
  type CamposSolicitacao,
} from "@/lib/calculo/solicitacaoAngariacao";
import { baixarArquivo, montarDocx } from "@/lib/documentoDocx";
import { fmtMoneyFull } from "@/lib/formatadores";
import { numOrNull, salvarConfig } from "@/lib/mutacoes";
import { useAppStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import { useUiModal } from "@/lib/uiModal";

export default function ModalSolicitacaoAngariacao({ imovelId }: { imovelId: string }) {
  const fecharModal = useUiModal((s) => s.fecharModal);
  const { usuario } = useSessao();
  const imoveis = useAppStore((s) => s.imoveis);
  const config = useAppStore((s) => s.config);

  const imovel = imoveis.find((i) => i.id === imovelId) || null;
  const inicial = imovel
    ? solicitacaoInicial(imovel, config, captadorPadrao(usuario, imoveis))
    : null;

  const [corretor, setCorretor] = useState(inicial?.corretor ?? "");
  const [refProprietario, setRefProprietario] = useState(inicial?.refProprietario ?? "");
  const [locacaoN, setLocacaoN] = useState(() => String(imovel ? numeroLocacao(imovel) : 1));
  const [endereco, setEndereco] = useState(inicial?.endereco ?? "");
  const [valorBase, setValorBase] = useState(
    inicial?.valorBase != null ? String(inicial.valorBase) : "",
  );
  const [percent, setPercent] = useState(String(inicial?.comissaoPercent ?? 100));
  const [dataPrimeiroAluguel, setDataPrimeiroAluguel] = useState("");
  const [dadosPagamento, setDadosPagamento] = useState(inicial?.dadosPagamento ?? "");
  const [observacao, setObservacao] = useState(inicial?.observacao ?? "");
  const [ocupado, setOcupado] = useState(false);

  if (!imovel) {
    return (
      <>
        <div className="modal-head">
          <div className="modal-title">Solicitação de angariação</div>
          <button type="button" className="icon-btn" onClick={fecharModal}>
            ✕
          </button>
        </div>
        <div className="modal-body">
          <p className="section-note">Imóvel não encontrado.</p>
        </div>
      </>
    );
  }

  const n = Math.max(1, Math.trunc(numOrNull(locacaoN) || 1));
  const campos: CamposSolicitacao = {
    corretor: corretor.trim(),
    refProprietario: refProprietario.trim(),
    refInquilino: referenciaInquilino(refProprietario, n),
    endereco: endereco.trim(),
    valorBase: numOrNull(valorBase),
    comissaoPercent: numOrNull(percent) || 0,
    dataPrimeiroAluguel,
    dadosPagamento: dadosPagamento.trim(),
    observacao: observacao.trim(),
  };

  const linhas = linhasSolicitacao(campos);
  const comissao = comissaoDaSolicitacao(campos);
  const faltando = pendenciasSolicitacao(campos);
  // Só oferece guardar o que ainda não está guardado — botão que não muda nada
  // vira ruído, e aqui ele apareceria em toda solicitação depois da primeira.
  const pagamentoDiferente =
    campos.dadosPagamento !== "" && campos.dadosPagamento !== (config.dadosPagamento || "").trim();

  async function baixar() {
    setOcupado(true);
    try {
      const blob = await montarDocx(arquivosDocxSolicitacao(campos));
      baixarArquivo(blob, nomeArquivoSolicitacao(campos));
      toast("Documento gerado.");
    } catch (e) {
      toast("Não foi possível gerar o documento: " + (e as Error).message, "error");
    }
    setOcupado(false);
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(textoSolicitacao(campos));
      toast("Texto copiado.");
    } catch {
      toast("Não foi possível copiar. Selecione o texto da prévia.", "error");
    }
  }

  async function guardarPagamento() {
    if (!usuario) return;
    setOcupado(true);
    await salvarConfig(
      { ...config, dadosPagamento: campos.dadosPagamento },
      usuario.id,
      "Conta/PIX salvo para as próximas solicitações.",
    );
    setOcupado(false);
  }

  return (
    <>
      <div className="modal-head">
        <div className="modal-title">Solicitação de angariação</div>
        <button type="button" className="icon-btn" onClick={fecharModal}>
          ✕
        </button>
      </div>
      <div className="modal-body">
        <p className="section-note" style={{ marginBottom: "14px" }}>
          Documento de cobrança da comissão, para o financeiro da imobiliária. Os campos já vêm do
          cadastro do imóvel — confira antes de gerar.
        </p>

        <fieldset>
          <legend>Quem recebe</legend>
          <div className="field-group">
            <label>Corretor</label>
            <input
              type="text"
              value={corretor}
              onChange={(e) => setCorretor(e.target.value)}
              placeholder="Nome de quem angariou"
            />
          </div>
          <div className="field-group">
            <label>Conta Caixa, Sicredi ou PIX para transferência</label>
            <input
              type="text"
              value={dadosPagamento}
              onChange={(e) => setDadosPagamento(e.target.value)}
              placeholder="Ex.: pix 125.856.399-16"
            />
            <div className="field-hint">
              Vem das Configurações e vale para todas as solicitações.
              {pagamentoDiferente && (
                <>
                  {" "}
                  <button
                    type="button"
                    className="btn btn-sm"
                    onClick={guardarPagamento}
                    disabled={ocupado}
                  >
                    Salvar como padrão
                  </button>
                </>
              )}
            </div>
          </div>
        </fieldset>

        <fieldset>
          <legend>Contrato</legend>
          <div className="field-row">
            <div className="field-group">
              <label>REF PROP (referência do CRM)</label>
              <input
                type="text"
                value={refProprietario}
                onChange={(e) => setRefProprietario(e.target.value)}
                placeholder="Ex.: 03280.001"
              />
            </div>
            <div className="field-group">
              <label>Locação nº</label>
              <input
                type="number"
                min="1"
                step="1"
                value={locacaoN}
                onChange={(e) => setLocacaoN(e.target.value)}
              />
              <div className="field-hint">
                {`REF INQUILINO: ${campos.refInquilino || "—"} (1 = primeiro locatário)`}
              </div>
            </div>
          </div>
          <div className="field-group">
            <label>Endereço</label>
            <input type="text" value={endereco} onChange={(e) => setEndereco(e.target.value)} />
          </div>
          <div className="field-row">
            <div className="field-group">
              {/* Deixa explícito que NÃO é o aluguel anunciado: a angariação
                  é calculada sobre o valor com o acréscimo de atraso, e o
                  campo vinha rotulado como "Valor do aluguel" — o mesmo nome
                  do outro valor, que é 20% menor. */}
              <label>Valor da angariação (R$)</label>
              <input
                type="number"
                min="0"
                step="0.01"
                value={valorBase}
                onChange={(e) => setValorBase(e.target.value)}
              />
              <div className="field-hint">
                Valor com o acréscimo de atraso, não o do anúncio.
              </div>
            </div>
            <div className="field-group">
              <label>Comissão (%)</label>
              <input
                type="number"
                min="0"
                step="1"
                value={percent}
                onChange={(e) => setPercent(e.target.value)}
              />
              <div className="field-hint">
                {comissao == null ? "Informe o aluguel" : `A receber: ${fmtMoneyFull(comissao)}`}
              </div>
            </div>
          </div>
          <div className="field-group">
            <label>Data de recebimento do 1° aluguel da imobiliária</label>
            <input
              type="date"
              value={dataPrimeiroAluguel}
              onChange={(e) => setDataPrimeiroAluguel(e.target.value)}
            />
          </div>
          <div className="field-group">
            <label>Observação</label>
            <input
              type="text"
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="Ex.: Angariação feita pelo OLX"
            />
          </div>
        </fieldset>

        {faltando.length > 0 && (
          <p className="section-note" style={{ marginTop: "4px" }}>
            {`Ainda em branco: ${faltando.join(", ")}. Dá para gerar assim mesmo.`}
          </p>
        )}

        <div className="solicitacao-previa">
          <div className="solicitacao-previa-titulo">{TITULO_SOLICITACAO}</div>
          <div className="solicitacao-previa-sub">{SUBTITULO_SOLICITACAO}</div>
          {linhas.map((l) => (
            <div className="solicitacao-previa-linha" key={l.rotulo}>
              <strong>{l.rotulo}:</strong> {l.valor}
            </div>
          ))}
        </div>
      </div>
      <div className="modal-foot">
        <button type="button" className="btn btn-ghost" onClick={copiar}>
          Copiar texto
        </button>
        <div style={{ display: "flex", gap: "10px" }}>
          <button type="button" className="btn" onClick={fecharModal}>
            Fechar
          </button>
          <button type="button" className="btn btn-primary" onClick={baixar} disabled={ocupado}>
            Baixar .docx
          </button>
        </div>
      </div>
    </>
  );
}
