"use client";

/* ================================================================
   MODAL: IMPORTAR PLANILHA

   O corretor que chega com 200 imóveis numa planilha não tinha por onde
   entrar — digitava um por um, ou desistia. O `csv.ts` só exportava.

   A DECISÃO DE DESENHO: **prévia antes de gravar, sempre.** Importar
   200 registros é irreversível na prática (desfazer é apagar 200 à
   mão), então a tela mostra quantos entram, quantos ficam de fora e
   POR QUÊ, linha a linha, antes de qualquer escrita. Uma importação
   que só conta o estrago depois não serve.

   As colunas ignoradas aparecem em destaque pelo mesmo motivo: quase
   sempre significam cabeçalho com nome inesperado — o telefone que
   ficou de fora porque a planilha chamava a coluna de "Contato 1" —, e
   não coluna irrelevante. Sem esse aviso, o corretor importa e só
   descobre semanas depois que metade dos telefones sumiu.
   ================================================================ */
import { useCallback, useMemo, useState } from "react";
import {
  descreverProblema,
  impedeEntrada,
  lerImportacao,
  resumirImportacao,
  type ResultadoLeitura,
} from "@/lib/calculo/importacao";
import { todayISO } from "@/lib/datas";
import { importarImoveis } from "@/lib/mutacoes";
import { prepararPdfParaImportacao } from "@/lib/importacaoPdf";
import { useSessao } from "@/components/SessaoProvider";
import { useAppStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import { useUiModal } from "@/lib/uiModal";

/** Quantas linhas problemáticas listar antes de resumir. Uma planilha
    ruim tem centenas — despejar todas transformaria a prévia num muro
    de texto que ninguém lê, que é o mesmo que não avisar. */
const MAX_PROBLEMAS_LISTADOS = 12;

export default function ModalImportar() {
  const fecharModal = useUiModal((s) => s.fecharModal);
  const { usuario } = useSessao();
  const imoveis = useAppStore((s) => s.imoveis);

  const [texto, setTexto] = useState("");
  const [gravando, setGravando] = useState(false);
  const [lendoArquivo, setLendoArquivo] = useState(false);
  const [erroArquivo, setErroArquivo] = useState("");
  const [resumoArquivo, setResumoArquivo] = useState("");

  // A leitura é pura: dá para recalcular a cada tecla sem tocar em nada.
  const leitura: ResultadoLeitura | null = useMemo(
    () => (texto.trim() ? lerImportacao(texto, imoveis, todayISO()) : null),
    [texto, imoveis],
  );
  const resumo = useMemo(() => (leitura ? resumirImportacao(leitura.linhas) : null), [leitura]);

  const carregarArquivo = useCallback(async (arquivo: File | undefined) => {
    if (!arquivo) return;
    setLendoArquivo(true);
    setErroArquivo("");
    setResumoArquivo("");
    try {
      const pdf = arquivo.type === "application/pdf" || arquivo.name.toLowerCase().endsWith(".pdf");
      if (pdf) {
        const preparado = await prepararPdfParaImportacao(arquivo);
        setTexto(preparado.textoCsv);
        setResumoArquivo(
          `${preparado.registros} imóvel(is) reconhecido(s) em ${preparado.paginas} página(s) do PDF.`,
        );
      } else {
        setTexto(await arquivo.text());
        setResumoArquivo(`Arquivo CSV carregado: ${arquivo.name}.`);
      }
    } catch (erro) {
      setTexto("");
      setErroArquivo(erro instanceof Error ? erro.message : "Não foi possível ler o arquivo.");
    } finally {
      setLendoArquivo(false);
    }
  }, []);

  async function importar() {
    if (!leitura || !usuario) return;
    const candidatos = leitura.linhas.map((l) => l.imovel).filter((i) => i !== null);
    if (candidatos.length === 0) return;

    setGravando(true);
    const r = await importarImoveis(candidatos, usuario.id);
    setGravando(false);

    if (!r.ok) {
      toast(r.mensagem || "Não foi possível importar.", "error");
      return;
    }
    toast(`${r.gravados} imóvel(is) importado(s).`, "success");
    fecharModal();
  }

  const problemas = (leitura?.linhas || []).filter((l) => l.problemas.some(impedeEntrada));

  return (
    <>
      <div className="modal-head">
        <div className="modal-title">Importar carteira</div>
        <button type="button" className="icon-btn" onClick={fecharModal} aria-label="Fechar">
          ✕
        </button>
      </div>

      <div className="modal-body">
        <div className="field-group">
          <label>Arquivo PDF ou CSV</label>
          <input
            type="file"
            accept=".pdf,.csv,application/pdf,text/csv,text/plain"
            disabled={lendoArquivo}
            onChange={(e) => void carregarArquivo(e.target.files?.[0])}
          />
          <div className="field-hint">
            Aceitamos diretamente o relatório <strong>Imóveis Angariados</strong> em PDF do
            CasaSoft. CSV e conteúdo colado continuam disponíveis.
          </div>
          {lendoArquivo && <div className="field-hint">Lendo e conferindo o PDF…</div>}
          {resumoArquivo && <div className="field-hint">{resumoArquivo}</div>}
          {erroArquivo && <div className="importar-aviso">{erroArquivo}</div>}
        </div>

        <div className="field-group">
          <label>Ou cole aqui</label>
          <textarea
            rows={5}
            value={texto}
            onChange={(e) => {
              setTexto(e.target.value);
              setErroArquivo("");
              setResumoArquivo("");
            }}
            placeholder={"endereco;bairro;proprietario;telefone;valor;data\nRua X, 250;Centro;João;43 99999-0000;1800;10/07/2026"}
          />
          <div className="field-hint">
            A primeira linha precisa ser o cabeçalho. Reconhecemos nomes comuns em português —
            endereço, bairro, cidade, proprietário, telefone, tipo, valor, origem, data. Só o
            endereço é obrigatório.
          </div>
        </div>

        {resumo && leitura && (
          <>
            <div className="divider"></div>

            <div className="importar-resumo">
              <div className="importar-numero">
                <strong>{resumo.entram}</strong> de {resumo.total} linha(s) serão importadas
              </div>
              {resumo.entram > 0 && (
                <div className="field-hint">
                  Todas entram como <strong>Novo contato</strong> — a importação não define etapa do
                  funil.
                </div>
              )}
            </div>

            {/* Coluna não reconhecida quase sempre é cabeçalho com nome
                inesperado, não coluna irrelevante: é assim que o telefone
                de uma planilha inteira fica de fora em silêncio. */}
            {leitura.colunasIgnoradas.length > 0 && (
              <div className="importar-aviso">
                <strong>Colunas não reconhecidas:</strong> {leitura.colunasIgnoradas.join(", ")}.
                Se alguma delas era importante, renomeie o cabeçalho na planilha e cole de novo.
              </div>
            )}

            {resumo.semTelefone > 0 && (
              <div className="field-hint" style={{ marginBottom: 10 }}>
                {resumo.semTelefone} linha(s) entram <strong>sem telefone</strong> — o número não
                estava legível. Melhor sem do que errado: telefone errado manda mensagem para um
                estranho.
              </div>
            )}

            {problemas.length > 0 && (
              <div className="field-group">
                <label>O que fica de fora</label>
                <ul className="importar-problemas">
                  {problemas.slice(0, MAX_PROBLEMAS_LISTADOS).map((l) => (
                    <li key={l.linha}>
                      Linha {l.linha}: {l.problemas.filter(impedeEntrada).map(descreverProblema).join("; ")}
                    </li>
                  ))}
                </ul>
                {problemas.length > MAX_PROBLEMAS_LISTADOS && (
                  <div className="field-hint">
                    …e mais {problemas.length - MAX_PROBLEMAS_LISTADOS} linha(s).
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      <div className="modal-foot">
        <div></div>
        <div style={{ display: "flex", gap: "10px" }}>
          <button type="button" className="btn" onClick={fecharModal}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => void importar()}
            disabled={gravando || lendoArquivo || !resumo || resumo.entram === 0}
          >
            {gravando ? "Importando…" : `Importar ${resumo?.entram ?? 0}`}
          </button>
        </div>
      </div>
    </>
  );
}
