"use client";

import { useEffect, useState, type FormEvent } from "react";
import { UFS_BRASIL } from "@/lib/calculo/geografia";
import type { MercadoMonitorado } from "@/lib/calculo/mercadosMonitorados";
import {
  carregarMercadosMonitorados,
  criarMercadoMonitorado,
  definirMercadoMonitoradoAtivo,
  excluirMercadoMonitorado,
} from "@/lib/persistencia/mercadosMonitorados";
import { toast } from "@/lib/toast";

export default function MercadosMonitorados() {
  const [mercados, setMercados] = useState<MercadoMonitorado[]>([]);
  const [cidade, setCidade] = useState("");
  const [estado, setEstado] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [ocupado, setOcupado] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    carregarMercadosMonitorados()
      .then((dados) => {
        if (!cancelado) setMercados(dados);
      })
      .catch((erro) => {
        if (!cancelado) toast(erro instanceof Error ? erro.message : "Não foi possível carregar os mercados.", "error");
      })
      .finally(() => {
        if (!cancelado) setCarregando(false);
      });
    return () => {
      cancelado = true;
    };
  }, []);

  async function adicionar(evento: FormEvent) {
    evento.preventDefault();
    if (ocupado) return;
    setOcupado("novo");
    try {
      const criado = await criarMercadoMonitorado({
        cidade,
        estado,
        finalidade: "locacao",
        segmento: "residencial",
      });
      setMercados((atuais) => [criado, ...atuais]);
      setCidade("");
      setEstado("");
      toast("Mercado configurado. Nenhuma coleta foi iniciada.");
    } catch (erro) {
      toast(erro instanceof Error ? erro.message : "Não foi possível adicionar o mercado.", "error");
    } finally {
      setOcupado(null);
    }
  }

  async function alternar(mercado: MercadoMonitorado) {
    if (ocupado) return;
    setOcupado(mercado.id);
    try {
      await definirMercadoMonitoradoAtivo(mercado.id, !mercado.ativo);
      setMercados((atuais) => atuais.map((item) =>
        item.id === mercado.id ? { ...item, ativo: !item.ativo } : item
      ));
    } catch (erro) {
      toast(erro instanceof Error ? erro.message : "Não foi possível alterar o mercado.", "error");
    } finally {
      setOcupado(null);
    }
  }

  async function excluir(mercado: MercadoMonitorado) {
    if (ocupado || !window.confirm(`Excluir o mercado ${mercado.cidade}/${mercado.estado}?`)) return;
    setOcupado(mercado.id);
    try {
      await excluirMercadoMonitorado(mercado.id);
      setMercados((atuais) => atuais.filter((item) => item.id !== mercado.id));
      toast("Mercado excluído.");
    } catch (erro) {
      toast(erro instanceof Error ? erro.message : "Não foi possível excluir o mercado.", "error");
    } finally {
      setOcupado(null);
    }
  }

  return (
    <>
      <div className="config-bloco mercados-introducao">
        <div className="config-campo-cabecalho">
          <h3>Mercados que você acompanha</h3>
          <p>
            Esta configuração prepara a inteligência por cidade e UF. A coleta automática será
            ativada em uma etapa futura e não começa ao adicionar um mercado.
          </p>
        </div>
        <form className="mercados-form" onSubmit={(evento) => void adicionar(evento)}>
          <label>
            Cidade
            <input
              value={cidade}
              maxLength={100}
              onChange={(evento) => setCidade(evento.target.value)}
              placeholder="Ex.: Campinas"
              autoComplete="address-level2"
            />
          </label>
          <label>
            UF
            <select value={estado} onChange={(evento) => setEstado(evento.target.value)}>
              <option value="">Selecione</option>
              {UFS_BRASIL.map((uf) => <option key={uf} value={uf}>{uf}</option>)}
            </select>
          </label>
          <label>
            Finalidade
            <select value="locacao" disabled aria-describedby="mercados-capacidade">
              <option value="locacao">Locação</option>
            </select>
          </label>
          <label>
            Segmento
            <select value="residencial" disabled aria-describedby="mercados-capacidade">
              <option value="residencial">Residencial</option>
            </select>
          </label>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={ocupado !== null || !cidade.trim() || !estado}
          >
            {ocupado === "novo" ? "Adicionando…" : "Adicionar mercado"}
          </button>
        </form>
        <p id="mercados-capacidade" className="mercados-capacidade">
          A primeira capacidade operacional será locação residencial. Venda e comercial continuam
          previstos no domínio, sem indicação de coleta disponível nesta fase.
        </p>
      </div>

      <div className="config-bloco mercados-lista-bloco">
        {carregando ? (
          <p className="mercados-vazio">Carregando mercados…</p>
        ) : mercados.length === 0 ? (
          <p className="mercados-vazio">Nenhum mercado configurado ainda.</p>
        ) : (
          <div className="mercados-lista">
            {mercados.map((mercado) => (
              <article className={`mercado-item${mercado.ativo ? "" : " inativo"}`} key={mercado.id}>
                <div>
                  <strong>{mercado.cidade} / {mercado.estado}</strong>
                  <span>Locação residencial · a cada {mercado.frequenciaDias} dias</span>
                  <small>{mercado.ativo ? "Ativo para a futura coleta" : "Monitoramento pausado"}</small>
                </div>
                <div className="mercado-acoes">
                  <button
                    type="button"
                    className="btn btn-sm"
                    disabled={ocupado !== null}
                    onClick={() => void alternar(mercado)}
                  >
                    {mercado.ativo ? "Desativar" : "Ativar"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-sm btn-danger"
                    disabled={ocupado !== null}
                    onClick={() => void excluir(mercado)}
                  >
                    Excluir
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
