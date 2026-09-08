"use client";

import { useEffect, useMemo, useState } from "react";
import { useSessao } from "@/components/SessaoProvider";
import {
  carregarPoliticasRepasse,
  novaPoliticaRepasse,
  salvarPoliticaRepasse,
  validarPoliticaRepasse,
  type AjusteDataNaoUtil,
  type PoliticaRepasse,
  type RegraPrimeiroVencimento,
  type TipoContagemRepasse,
  type TipoPrazoRepasse,
} from "@/lib/repasses";
import { toast } from "@/lib/toast";

function diasDoTexto(texto: string): number[] {
  return texto
    .split(/[\s,;]+/)
    .filter(Boolean)
    .map(Number)
    .filter(Number.isFinite);
}

function textoDosDias(dias: number[]): string {
  return dias.map((dia) => String(dia).padStart(2, "0")).join(", ");
}

export default function PoliticaRepasseConfig() {
  const { usuario } = useSessao();
  const [politicas, setPoliticas] = useState<PoliticaRepasse[]>([]);
  const [politica, setPolitica] = useState<PoliticaRepasse | null>(null);
  const [dias, setDias] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [erroCarregamento, setErroCarregamento] = useState("");

  useEffect(() => {
    let ativo = true;
    void carregarPoliticasRepasse()
      .then((lista) => {
        if (!ativo) return;
        const inicial = lista.find((item) => item.padrao && item.ativo) || lista[0] || novaPoliticaRepasse();
        setPoliticas(lista);
        setPolitica(inicial);
        setDias(textoDosDias(inicial.diasVencimento));
      })
      .catch((erro: Error) => {
        if (ativo) {
          setErroCarregamento(erro.message);
          toast("Não foi possível carregar a política de repasse: " + erro.message, "error");
        }
      })
      .finally(() => { if (ativo) setCarregando(false); });
    return () => { ativo = false; };
  }, []);

  const politicaComDias = useMemo(
    () => politica ? { ...politica, diasVencimento: diasDoTexto(dias) } : null,
    [politica, dias],
  );
  const erros = politicaComDias ? validarPoliticaRepasse(politicaComDias) : [];

  function selecionar(id: string) {
    const escolhida = politicas.find((item) => item.id === id);
    if (!escolhida) return;
    setPolitica(escolhida);
    setDias(textoDosDias(escolhida.diasVencimento));
  }

  function alterar<K extends keyof PoliticaRepasse>(campo: K, valor: PoliticaRepasse[K]) {
    setPolitica((atual) => atual ? { ...atual, [campo]: valor } : atual);
  }

  async function salvar() {
    if (!usuario || !politicaComDias || salvando) return;
    if (erros.length > 0) {
      toast(erros[0], "error");
      return;
    }
    setSalvando(true);
    try {
      const salva = await salvarPoliticaRepasse(politicaComDias, usuario.id);
      setPolitica(salva);
      setDias(textoDosDias(salva.diasVencimento));
      setPoliticas((atuais) => {
        const existe = atuais.some((item) => item.id === salva.id);
        return existe ? atuais.map((item) => item.id === salva.id ? salva : item) : [salva, ...atuais];
      });
      toast("Política de repasse salva.");
    } catch (erro) {
      toast("Não foi possível salvar a política: " + (erro as Error).message, "error");
    } finally {
      setSalvando(false);
    }
  }

  if (carregando) {
    return <div className="config-bloco"><p className="section-note">Carregando política de repasse…</p></div>;
  }
  if (!politica) {
    return (
      <div className="config-bloco config-repasse-erros" role="alert">
        Não foi possível carregar a política de repasse. {erroCarregamento}
      </div>
    );
  }

  return (
    <>
      {politicas.length > 1 && (
        <div className="config-bloco">
          <div className="config-campo-cabecalho">
            <label htmlFor="politica-repasse-selecionada">Política configurada</label>
            <p>A estrutura aceita várias políticas; o fluxo de locação usa a marcada como padrão.</p>
          </div>
          <select id="politica-repasse-selecionada" value={politica.id} onChange={(evento) => selecionar(evento.target.value)}>
            {politicas.map((item) => <option key={item.id} value={item.id}>{item.nome}{item.padrao ? " — padrão" : ""}</option>)}
          </select>
        </div>
      )}

      <div className="config-bloco">
        <div className="config-grid-campos config-repasse-grid">
          <label>Nome da política
            <input value={politica.nome} maxLength={120} onChange={(evento) => alterar("nome", evento.target.value)} />
          </label>
          <label>Quando começa o fluxo
            <select value={politica.eventoOrigem} onChange={(evento) => alterar("eventoOrigem", evento.target.value as "locacao")}>
              <option value="locacao">Quando o imóvel é locado</option>
              <option value="primeiro_aluguel_pago" disabled>Primeiro aluguel pago (futuro)</option>
              <option value="contrato_assinado" disabled>Contrato assinado (futuro)</option>
              <option value="manual" disabled>Informado manualmente (futuro)</option>
            </select>
          </label>
        </div>
        <label className="config-repasse-descricao">Descrição (opcional)
          <textarea rows={2} value={politica.descricao} onChange={(evento) => alterar("descricao", evento.target.value)} />
        </label>
      </div>

      <div className="config-bloco">
        <div className="config-campo-cabecalho">
          <h3>Primeiro vencimento</h3>
          <p>Define a primeira data usada como referência para o repasse.</p>
        </div>
        <div className="config-grid-campos config-repasse-grid">
          <label>Quando ocorre
            <select value={politica.regraPrimeiroVencimento} onChange={(evento) => alterar("regraPrimeiroVencimento", evento.target.value as RegraPrimeiroVencimento)}>
              <option value="mes_seguinte">No mês seguinte à locação</option>
              <option value="proximo_vencimento">No próximo vencimento disponível</option>
              <option value="informado_manualmente">Informado durante a locação</option>
            </select>
          </label>
          {politica.regraPrimeiroVencimento !== "informado_manualmente" && (
            <label>Dias de vencimento disponíveis
              <input value={dias} onChange={(evento) => setDias(evento.target.value)} placeholder="Ex.: 05, 10, 15, 20, 25" />
              <small>Use dias de 1 a 31, separados por vírgula. Se o mês for menor, vale o último dia existente.</small>
            </label>
          )}
        </div>
      </div>

      <div className="config-bloco">
        <div className="config-campo-cabecalho">
          <h3>Prazo para o repasse</h3>
          <p>O cálculo é refeito no banco ao confirmar; a prévia não é aceita como autoridade.</p>
        </div>
        <div className="config-grid-campos config-repasse-grid">
          <label>Contar a partir de
            <select value={politica.tipoPrazo} onChange={(evento) => alterar("tipoPrazo", evento.target.value as TipoPrazoRepasse)}>
              <option value="apos_primeiro_vencimento">Primeiro vencimento do aluguel</option>
              <option value="apos_locacao">Data da locação</option>
              <option value="manual">Data informada durante a locação</option>
              <option value="apos_recebimento" disabled>Recebimento do primeiro aluguel (futuro)</option>
            </select>
          </label>
          {politica.tipoPrazo !== "manual" && (
            <label>Prazo em dias
              <input type="number" min="0" max="365" step="1" value={politica.quantidadeDias ?? ""} onChange={(evento) => alterar("quantidadeDias", evento.target.value === "" ? null : Number(evento.target.value))} />
            </label>
          )}
          {politica.tipoPrazo !== "manual" && (
            <label>Contagem
              <select value={politica.tipoContagem} onChange={(evento) => alterar("tipoContagem", evento.target.value as TipoContagemRepasse)}>
                <option value="corridos">Dias corridos</option>
                <option value="uteis">Dias úteis (segunda a sexta)</option>
              </select>
            </label>
          )}
          {politica.tipoPrazo !== "manual" && (
            <label>Se cair no fim de semana
              <select value={politica.ajusteFimSemana} onChange={(evento) => alterar("ajusteFimSemana", evento.target.value as AjusteDataNaoUtil)}>
                <option value="manter">Manter a data</option>
                <option value="proximo_dia_util">Próximo dia útil</option>
                <option value="dia_util_anterior">Dia útil anterior</option>
              </select>
            </label>
          )}
        </div>
        <p className="section-note config-repasse-feriado">
          Feriados não são ajustados: o Angario ainda não possui um calendário confiável por cidade.
        </p>
      </div>

      {erros.length > 0 && (
        <div className="config-bloco config-repasse-erros" role="alert">
          {erros.map((erro) => <div key={erro}>{erro}</div>)}
        </div>
      )}
      <div className="config-salvar">
        <span>Alterações afetam somente novos repasses. Os históricos mantêm o snapshot original.</span>
        <button type="button" className="btn btn-primary" onClick={() => void salvar()} disabled={salvando || erros.length > 0}>
          {salvando ? "Salvando…" : "Salvar política"}
        </button>
      </div>
    </>
  );
}
