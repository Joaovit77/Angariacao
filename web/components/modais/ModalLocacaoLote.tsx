"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import {
  carregarPoliticasRepasse,
  locarImoveisEmLote,
  preverRepassesLocacao,
  type ItemLocacaoRepasse,
  type PoliticaRepasse,
  type ResultadoPreviaRepasse,
} from "@/lib/repasses";
import { todayISO } from "@/lib/datas";
import { fmtDate } from "@/lib/formatadores";
import { recarregarEstado } from "@/lib/mutacoes";
import { useAppStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import { useUiModal } from "@/lib/uiModal";
import type { Imovel } from "@/lib/tipos";

type Linhas = Record<string, ItemLocacaoRepasse>;

function primeiraPolitica(lista: PoliticaRepasse[]): PoliticaRepasse | null {
  return lista.find((item) => item.ativo && item.padrao) || lista.find((item) => item.ativo) || null;
}

export default function ModalLocacaoLote({ imovelIds }: { imovelIds: string[] }) {
  const fecharModal = useUiModal((estado) => estado.fecharModal);
  const imoveis = useAppStore((estado) => estado.imoveis);
  const selecionados = useMemo(
    () => imovelIds
      .map((id) => imoveis.find((imovel) => imovel.id === id))
      .filter((imovel): imovel is Imovel => Boolean(imovel)),
    [imovelIds, imoveis],
  );
  const [politicas, setPoliticas] = useState<PoliticaRepasse[]>([]);
  const [politicaId, setPoliticaId] = useState("");
  const [linhas, setLinhas] = useState<Linhas>({});
  const [dataComum, setDataComum] = useState(todayISO());
  const [diaComum, setDiaComum] = useState<number | null>(null);
  const [primeiroComum, setPrimeiroComum] = useState("");
  const [previstaComum, setPrevistaComum] = useState("");
  const [aplicarTodos, setAplicarTodos] = useState(true);
  const [carregando, setCarregando] = useState(true);
  const [calculando, setCalculando] = useState(false);
  const [confirmando, setConfirmando] = useState(false);
  const [previa, setPrevia] = useState<ResultadoPreviaRepasse | null>(null);
  const [erroConsulta, setErroConsulta] = useState("");
  const [operacaoId] = useState(() => crypto.randomUUID());

  const politica = politicas.find((item) => item.id === politicaId) || null;
  const itens = useMemo(() => Object.values(linhas), [linhas]);

  useEffect(() => {
    let ativo = true;
    void carregarPoliticasRepasse()
      .then((lista) => {
        if (!ativo) return;
        const padrao = primeiraPolitica(lista);
        setPoliticas(lista.filter((item) => item.ativo));
        if (!padrao) return;
        const dia = padrao.diasVencimento[0] ?? null;
        setPoliticaId(padrao.id);
        setDiaComum(dia);
        setLinhas(Object.fromEntries(selecionados.map((imovel) => [imovel.id, {
          imovelId: imovel.id,
          dataLocacao: todayISO(),
          diaVencimento: dia,
          primeiroVencimento: null,
          dataPrevista: null,
        }])));
      })
      .catch((erro: Error) => setErroConsulta(erro.message))
      .finally(() => { if (ativo) setCarregando(false); });
    return () => { ativo = false; };
  }, [selecionados]);

  useEffect(() => {
    if (!politicaId || itens.length === 0) return;
    let ativo = true;
    const timer = window.setTimeout(() => {
      setCalculando(true);
      setErroConsulta("");
      void preverRepassesLocacao(politicaId, itens)
        .then((resultado) => { if (ativo) setPrevia(resultado); })
        .catch((erro: Error) => { if (ativo) { setPrevia(null); setErroConsulta(erro.message); } })
        .finally(() => { if (ativo) setCalculando(false); });
    }, 220);
    return () => { ativo = false; window.clearTimeout(timer); };
  }, [politicaId, itens]);

  function atualizarLinha(id: string, patch: Partial<ItemLocacaoRepasse>) {
    setLinhas((atuais) => ({ ...atuais, [id]: { ...atuais[id], ...patch } }));
  }

  function aplicarComuns(politicaAtual = politica) {
    if (!politicaAtual) return;
    setLinhas((atuais) => Object.fromEntries(Object.entries(atuais).map(([id, item]) => [id, {
      ...item,
      dataLocacao: dataComum,
      diaVencimento: politicaAtual.regraPrimeiroVencimento === "informado_manualmente" ? null : diaComum,
      primeiroVencimento: politicaAtual.regraPrimeiroVencimento === "informado_manualmente" ? primeiroComum : null,
      dataPrevista: politicaAtual.tipoPrazo === "manual" ? previstaComum : null,
    }])));
  }

  function alterarDataComum(valor: string) {
    setDataComum(valor);
    if (aplicarTodos) setLinhas((atuais) => Object.fromEntries(Object.entries(atuais).map(([id, item]) => [id, { ...item, dataLocacao: valor }])));
  }

  function alterarDiaComum(valor: number) {
    setDiaComum(valor);
    if (aplicarTodos) setLinhas((atuais) => Object.fromEntries(Object.entries(atuais).map(([id, item]) => [id, { ...item, diaVencimento: valor }])));
  }

  function alterarPrimeiroComum(valor: string) {
    setPrimeiroComum(valor);
    if (aplicarTodos) setLinhas((atuais) => Object.fromEntries(Object.entries(atuais).map(([id, item]) => [id, { ...item, primeiroVencimento: valor }])));
  }

  function alterarPrevistaComum(valor: string) {
    setPrevistaComum(valor);
    if (aplicarTodos) setLinhas((atuais) => Object.fromEntries(Object.entries(atuais).map(([id, item]) => [id, { ...item, dataPrevista: valor }])));
  }

  function alterarPolitica(id: string) {
    const nova = politicas.find((item) => item.id === id) || null;
    setPoliticaId(id);
    const dia = nova?.diasVencimento[0] ?? null;
    setDiaComum(dia);
    if (nova) {
      setLinhas((atuais) => Object.fromEntries(Object.entries(atuais).map(([imovelId, item]) => [imovelId, {
        ...item,
        diaVencimento: nova.regraPrimeiroVencimento === "informado_manualmente" ? null : dia,
        primeiroVencimento: nova.regraPrimeiroVencimento === "informado_manualmente" ? primeiroComum : null,
        dataPrevista: nova.tipoPrazo === "manual" ? previstaComum : null,
      }])));
    }
  }

  async function confirmar() {
    if (!politica || !previa?.ok || confirmando) return;
    setConfirmando(true);
    try {
      const resultado = await locarImoveisEmLote(operacaoId, politica.id, itens);
      if (!resultado.ok) {
        setPrevia(resultado);
        return;
      }
      await recarregarEstado();
      window.dispatchEvent(new CustomEvent("repasses:atualizados"));
      toast(`${resultado.totalImoveis ?? itens.length} imóvel(is) marcado(s) como locado(s) e ${resultado.totalRepasses ?? itens.length} repasse(s) gerado(s).`);
      fecharModal();
    } catch (erro) {
      toast("Não foi possível concluir a locação em massa: " + (erro as Error).message, "error");
    } finally {
      setConfirmando(false);
    }
  }

  const previaPorImovel = new Map((previa?.itens || []).map((item) => [item.imovelId, item]));

  return (
    <>
      <div className="modal-head">
        <div className="modal-title">Marcar {selecionados.length} imóvel(is) como locado(s)</div>
        <button type="button" className="icon-btn" onClick={fecharModal}>✕</button>
      </div>
      <div className="modal-body modal-locacao-lote">
        {carregando ? (
          <p className="section-note">Carregando política de repasse…</p>
        ) : !politica && erroConsulta ? (
          <div className="lote-erros" role="alert">
            <strong>Não foi possível carregar as políticas de repasse.</strong>
            <p>{erroConsulta}</p>
            <span>Nenhuma alteração foi realizada.</span>
          </div>
        ) : !politica ? (
          <div className="empty-state">
            <h3>Configure a política de repasse</h3>
            <p>Nenhuma alteração foi feita. Cadastre prazos e dias de vencimento antes de registrar a locação.</p>
            <Link className="btn btn-primary" href="/configuracoes?secao=repasses" onClick={fecharModal}>Abrir Configurações</Link>
          </div>
        ) : (
          <>
            <div className="locacao-resumo">
              <div><span>Imóveis</span><strong>{selecionados.length}</strong></div>
              <div><span>Repasses previstos</span><strong>{previa?.ok ? previa.itens.length : "—"}</strong></div>
              <div><span>Política</span><strong>{politica.nome}</strong></div>
            </div>

            {politicas.length > 1 && (
              <div className="field-group">
                <label>Política aplicável</label>
                <select value={politicaId} onChange={(evento) => alterarPolitica(evento.target.value)}>
                  {politicas.map((item) => <option key={item.id} value={item.id}>{item.nome}{item.padrao ? " — padrão" : ""}</option>)}
                </select>
              </div>
            )}

            <fieldset>
              <legend>Dados da locação</legend>
              <div className="field-row">
                <div className="field-group"><label>Data da locação</label><input type="date" value={dataComum} onChange={(evento) => alterarDataComum(evento.target.value)} /></div>
                {politica.regraPrimeiroVencimento === "informado_manualmente" ? (
                  <div className="field-group"><label>Primeiro vencimento</label><input type="date" value={primeiroComum} onChange={(evento) => alterarPrimeiroComum(evento.target.value)} /></div>
                ) : (
                  <div className="field-group"><label>Dia de vencimento</label><select value={diaComum ?? ""} onChange={(evento) => alterarDiaComum(Number(evento.target.value))}>{politica.diasVencimento.map((dia) => <option key={dia} value={dia}>Dia {String(dia).padStart(2, "0")}</option>)}</select></div>
                )}
                {politica.tipoPrazo === "manual" && (
                  <div className="field-group"><label>Repasse previsto</label><input type="date" value={previstaComum} onChange={(evento) => alterarPrevistaComum(evento.target.value)} /></div>
                )}
              </div>
              <label className="locacao-aplicar-todos"><input type="checkbox" checked={aplicarTodos} onChange={(evento) => { setAplicarTodos(evento.target.checked); if (evento.target.checked) aplicarComuns(); }} /> Aplicar estes dados a todos</label>
              {aplicarTodos && <button type="button" className="btn btn-sm" onClick={() => aplicarComuns()}>Aplicar agora</button>}
            </fieldset>

            <div className="table-scroll locacao-previa-tabela">
              <table>
                <thead><tr><th>Imóvel</th><th>Data da locação</th><th>Vencimento</th><th>Primeiro vencimento</th><th>Repasse previsto</th></tr></thead>
                <tbody>
                  {selecionados.map((imovel) => {
                    const linha = linhas[imovel.id];
                    const calculada = previaPorImovel.get(imovel.id);
                    if (!linha) return null;
                    return (
                      <tr key={imovel.id}>
                        <td><strong>{imovel.codigo || imovel.referenciaCrm || "Sem código"}</strong><small>{imovel.endereco}</small></td>
                        <td><input type="date" value={linha.dataLocacao} onChange={(evento) => atualizarLinha(imovel.id, { dataLocacao: evento.target.value })} /></td>
                        <td>{politica.regraPrimeiroVencimento === "informado_manualmente" ? <input type="date" aria-label={`Primeiro vencimento de ${imovel.codigo}`} value={linha.primeiroVencimento || ""} onChange={(evento) => atualizarLinha(imovel.id, { primeiroVencimento: evento.target.value })} /> : <select aria-label={`Dia de vencimento de ${imovel.codigo}`} value={linha.diaVencimento ?? ""} onChange={(evento) => atualizarLinha(imovel.id, { diaVencimento: Number(evento.target.value) })}>{politica.diasVencimento.map((dia) => <option key={dia} value={dia}>{String(dia).padStart(2, "0")}</option>)}</select>}</td>
                        <td>{calculada ? fmtDate(calculada.primeiroVencimento) : "—"}</td>
                        <td>{politica.tipoPrazo === "manual" ? <input type="date" aria-label={`Repasse previsto de ${imovel.codigo}`} value={linha.dataPrevista || ""} onChange={(evento) => atualizarLinha(imovel.id, { dataPrevista: evento.target.value })} /> : calculada ? fmtDate(calculada.dataPrevista) : "—"}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {calculando && <p className="section-note">Recalculando a prévia no banco…</p>}
            {(erroConsulta || (previa && !previa.ok)) && (
              <div className="lote-erros" role="alert">
                <strong>Não foi possível concluir a operação.</strong>
                <p>Nenhuma alteração foi realizada.</p>
                {erroConsulta && <div>{erroConsulta}</div>}
                {previa?.erros.map((erro, indice) => <div key={`${erro.codigo}-${indice}`}><strong>{erro.rotulo || "Item do lote"}</strong> — {erro.mensagem}</div>)}
              </div>
            )}
            {previa?.ok && !calculando && (
              <div className="locacao-confirmacao">
                <strong>{previa.itens.length} imóvel(is) serão marcados como locados.</strong>
                <span>{previa.itens.length} repasse(s) pendente(s) serão gerado(s) pela política {politica.nome}.</span>
              </div>
            )}
          </>
        )}
      </div>
      <div className="modal-foot">
        <div></div>
        <div className="modal-foot-primary">
          <button type="button" className="btn" onClick={fecharModal}>Cancelar</button>
          <button type="button" className="btn btn-primary" onClick={() => void confirmar()} disabled={!previa?.ok || calculando || confirmando}>{confirmando ? "Confirmando…" : "Confirmar locações"}</button>
        </div>
      </div>
    </>
  );
}
