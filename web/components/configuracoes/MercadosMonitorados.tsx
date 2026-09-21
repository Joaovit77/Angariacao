"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useSessao } from "@/components/SessaoProvider";
import { UFS_BRASIL } from "@/lib/calculo/geografia";
import type { MercadoMonitorado } from "@/lib/calculo/mercadosMonitorados";
import {
  aplicarCidadePadraoInicial,
  type ResolucaoCidadePadrao,
} from "@/lib/configuracaoUsuario";
import { salvarCidadePadraoDaConta } from "@/lib/persistencia/cidadePadrao";
import {
  carregarMercadosMonitorados,
  criarMercadoMonitorado,
  definirMercadoMonitoradoAtivo,
  excluirMercadoMonitorado,
} from "@/lib/persistencia/mercadosMonitorados";
import { toast } from "@/lib/toast";
import { useCidadePadraoDaConta } from "@/lib/useCidadePadraoDaConta";

export default function MercadosMonitorados() {
  const { usuario } = useSessao();
  const cidadePadraoCarregada = useCidadePadraoDaConta(usuario?.id);
  const [cidadePadraoSalva, setCidadePadraoSalva] = useState<{
    userId: string;
    resolucao: ResolucaoCidadePadrao;
  } | null>(null);
  const cidadePadrao =
    cidadePadraoSalva && cidadePadraoSalva.userId === usuario?.id
      ? cidadePadraoSalva.resolucao
      : cidadePadraoCarregada;
  const [mercados, setMercados] = useState<MercadoMonitorado[]>([]);
  const [cidade, setCidade] = useState("");
  const [estado, setEstado] = useState("");
  const [usarComoPadrao, setUsarComoPadrao] = useState(false);
  const cidadeEstadoProtegidos = useRef(false);
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

  useEffect(() => {
    const preenchido = aplicarCidadePadraoInicial(
      { cidade, estado },
      cidadePadrao,
      cidadeEstadoProtegidos.current,
    );
    if (preenchido.cidade === cidade && preenchido.estado === estado) return;
    setCidade(preenchido.cidade);
    setEstado(preenchido.estado);
    setUsarComoPadrao(cidadePadrao.origem === "configurada");
  }, [cidade, cidadePadrao, estado]);

  async function adicionar(evento: FormEvent) {
    evento.preventDefault();
    if (ocupado) return;
    if (usarComoPadrao && !usuario?.id) {
      toast("Sessão inválida para definir a cidade padrão.", "error");
      return;
    }
    setOcupado("novo");
    try {
      const criado = await criarMercadoMonitorado({
        cidade,
        estado,
        finalidade: "locacao",
        segmento: "residencial",
      });
      setMercados((atuais) => [criado, ...atuais]);

      let proximaCidadePadrao = cidadePadrao;
      let erroCidadePadrao: unknown = null;
      if (usarComoPadrao && usuario?.id) {
        try {
          proximaCidadePadrao = await salvarCidadePadraoDaConta(
            usuario.id,
            criado.cidade,
            criado.estado,
          );
          setCidadePadraoSalva({ userId: usuario.id, resolucao: proximaCidadePadrao });
        } catch (erro) {
          erroCidadePadrao = erro;
        }
      }

      cidadeEstadoProtegidos.current = false;
      const proximo = aplicarCidadePadraoInicial(
        { cidade: "", estado: "" },
        proximaCidadePadrao,
      );
      setCidade(proximo.cidade);
      setEstado(proximo.estado);
      setUsarComoPadrao(proximaCidadePadrao.origem === "configurada");

      if (erroCidadePadrao) {
        const detalhe = erroCidadePadrao instanceof Error
          ? erroCidadePadrao.message
          : "Não foi possível salvar a preferência.";
        toast(`Mercado configurado, mas a cidade padrão não foi alterada. ${detalhe}`, "error");
      } else if (usarComoPadrao) {
        toast("Mercado configurado e cidade definida como padrão. Nenhuma coleta foi iniciada.");
      } else {
        toast("Mercado configurado. Nenhuma coleta foi iniciada.");
      }
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
            Os mercados ativos entram na verificação diária de coleta, respeitando a frequência
            e a cobertura dos portais. Adicionar um mercado não inicia uma coleta imediata.
          </p>
        </div>
        <form className="mercados-form" onSubmit={(evento) => void adicionar(evento)}>
          <label>
            Cidade
            <input
              value={cidade}
              maxLength={100}
              onChange={(evento) => {
                cidadeEstadoProtegidos.current = true;
                setUsarComoPadrao(false);
                setCidade(evento.target.value);
              }}
              placeholder="Ex.: Campinas"
              autoComplete="address-level2"
            />
          </label>
          <label>
            UF
            <select
              value={estado}
              onChange={(evento) => {
                cidadeEstadoProtegidos.current = true;
                setUsarComoPadrao(false);
                setEstado(evento.target.value);
              }}
            >
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
          <label className="mercados-padrao-check">
            <input
              type="checkbox"
              checked={usarComoPadrao}
              disabled={ocupado !== null || !cidade.trim() || !estado}
              onChange={(evento) => setUsarComoPadrao(evento.target.checked)}
            />
            Usar esta cidade como padrão nos cadastros
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
          A coleta periódica atende locação residencial, conforme a cobertura dos portais.
          Venda e comercial não possuem coleta automática disponível.
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
                  <small>{mercado.ativo ? "Ativo para a coleta agendada" : "Monitoramento pausado"}</small>
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
