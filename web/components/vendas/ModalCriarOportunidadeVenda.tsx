"use client";

import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from "react";
import { executarComandoVenda } from "@/lib/persistencia/vendas";
import { confirmarContaCriacaoVenda, listarContatosCandidatosVenda, type ResultadoContatosVenda } from "@/lib/persistencia/vendasContatosLeitura";
import type { ComandosVenda, ResultadoOperacaoVenda } from "@/lib/persistencia/vendasComandos";
import { ERROS_CRIACAO_VENDA, RASCUNHO_CRIACAO_VENDA, ROTULOS_ORIGEM_CRIACAO_VENDA, filtrarContatosVenda,
  validarRascunhoCriacaoVenda, validarPedidoPendenteVenda, type CampoCriacaoVenda, type RascunhoCriacaoVenda } from "./criacaoVenda";
import "./criacaoVenda.css";

type EstadoEnvio = "editando" | "enviando" | "repetir" | "incerto";
type ComandoCriacao = ComandosVenda["criar"];
const INCERTOS = new Set(["transporte-indisponivel", "resposta-invalida", "dado-persistido-invalido", "chave-idempotencia-conflitante"]);
const CHAVE_SESSAO = "angario:vendas:criacao-pendente:";

/** Apenas pedidos já submetidos são guardados nesta aba, separados pela conta. */
function recuperarPedido(usuarioId: string): ComandoCriacao | null {
  const texto = sessionStorage.getItem(CHAVE_SESSAO + usuarioId);
  if (!texto) return null;
  const c: unknown = JSON.parse(texto);
  if (!validarPedidoPendenteVenda(c)) throw new Error("Pedido pendente inválido.");
  return c;
}
export default function ModalCriarOportunidadeVenda({ aoFechar, aoCriar }: {
  aoFechar: () => void; aoCriar: (oportunidadeId: string) => void;
}) {
  const id = useId(), painel = useRef<HTMLDivElement>(null), inicial = useRef<HTMLButtonElement>(null);
  const alerta = useRef<HTMLDivElement>(null), pedido = useRef<ComandoCriacao | null>(null), trava = useRef(false);
  const usuario = useRef<string | null>(null), numeroLeitura = useRef(0);
  const [rascunho, setRascunho] = useState<RascunhoCriacaoVenda>({ ...RASCUNHO_CRIACAO_VENDA });
  const [busca, setBusca] = useState("");
  const [contatos, setContatos] = useState<ResultadoContatosVenda | null>(null);
  const [estado, setEstado] = useState<EstadoEnvio>("editando");
  const [mensagem, setMensagem] = useState<string | null>(null);
  const [campoErro, setCampoErro] = useState<CampoCriacaoVenda | null>(null);
  const [recuperacaoBloqueada, setRecuperacaoBloqueada] = useState(false);
  const bloqueado = estado !== "editando" || recuperacaoBloqueada;
  const podeFechar = !bloqueado;

  const carregar = useCallback(async () => {
    const leitura = ++numeroLeitura.current;
    setContatos(null);
    const resultado = await listarContatosCandidatosVenda();
    if (leitura !== numeroLeitura.current) return;
    setContatos(resultado);
    if (resultado.ok) {
      usuario.current = resultado.usuarioId;
      try {
        const pendente = recuperarPedido(resultado.usuarioId);
        if (pendente) {
          pedido.current = pendente;
          const i = pendente.interessado!;
          setRascunho({ modo: i.modo, contatoId: i.modo === "existente" ? i.contatoId : "", nome: i.modo === "novo" ? i.nome : "", telefone: i.modo === "novo" ? i.telefone ?? "" : "",
            origem: pendente.origem?.tipo ?? "", descricaoOrigem: pendente.origem?.descricao ?? "", valor: pendente.valorNegocioPrevisto?.toString() ?? "", receita: pendente.receitaPrevista?.toString() ?? "" });
          setEstado("incerto");
          setMensagem("Há um pedido desta conta sem confirmação nesta aba. Verifique o mesmo pedido antes de iniciar outro.");
        }
      } catch {
        setRecuperacaoBloqueada(true);
        setMensagem("Não foi possível recuperar com segurança o pedido desta aba. Não envie outra criação antes de conferir o resultado anterior.");
      }
    }
  }, []);
  useEffect(() => {
    const controle = numeroLeitura;
    const timer = window.setTimeout(() => void carregar(), 0);
    return () => { clearTimeout(timer); controle.current++; };
  }, [carregar]);
  useEffect(() => {
    const anterior = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    inicial.current?.focus();
    return () => { document.body.style.overflow = overflowAnterior; if (anterior?.isConnected) anterior.focus(); };
  }, []);
  useEffect(() => {
    function tecla(e: KeyboardEvent) {
      if (e.key === "Escape") { e.preventDefault(); if (podeFechar) aoFechar(); return; }
      if (e.key !== "Tab") return;
      const controles = [...(painel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]') ?? [])];
      const primeiro = controles[0], ultimo = controles.at(-1);
      if (e.shiftKey && document.activeElement === primeiro) { e.preventDefault(); ultimo?.focus(); }
      if (!e.shiftKey && document.activeElement === ultimo) { e.preventDefault(); primeiro?.focus(); }
    }
    const avisarSaida = (e: BeforeUnloadEvent) => { if (bloqueado) { e.preventDefault(); e.returnValue = ""; } };
    document.addEventListener("keydown", tecla); window.addEventListener("beforeunload", avisarSaida);
    return () => { document.removeEventListener("keydown", tecla); window.removeEventListener("beforeunload", avisarSaida); };
  }, [aoFechar, podeFechar, bloqueado]);
  useEffect(() => {
    if (!mensagem) return;
    const campo = campoErro && painel.current?.querySelector<HTMLElement>(`[data-campo="${campoErro}"]`);
    (campo || alerta.current)?.focus();
  }, [mensagem, campoErro]);
  function alterar<K extends keyof RascunhoCriacaoVenda>(campo: K, valor: RascunhoCriacaoVenda[K]) {
    setRascunho((r) => ({ ...r, [campo]: valor })); setCampoErro(null); setMensagem(null);
  }
  async function submeter(e: FormEvent) {
    e.preventDefault();
    if (trava.current || recuperacaoBloqueada || !contatos?.ok || !usuario.current) return;
    const repetindo = pedido.current !== null;
    if (!pedido.current) {
      const validacao = validarRascunhoCriacaoVenda(rascunho);
      if (!validacao.ok) { setCampoErro(validacao.campo); setMensagem(validacao.mensagem); return; }
      pedido.current = { chaveIdempotencia: crypto.randomUUID(), ...validacao.dados };
    }
    trava.current = true; setEstado("enviando"); setMensagem(null); setCampoErro(null);
    if (!await confirmarContaCriacaoVenda(usuario.current)) {
      trava.current = false;
      if (!repetindo) pedido.current = null;
      setEstado(repetindo ? "repetir" : "editando");
      setMensagem("Não foi possível confirmar a mesma conta. Entre novamente na conta deste pedido antes de continuar.");
      return;
    }
    // Persiste antes da rede: reload ou navegação não transforma timeout em outra intenção.
    try { sessionStorage.setItem(CHAVE_SESSAO + usuario.current, JSON.stringify(pedido.current)); }
    catch {
      trava.current = false;
      if (!repetindo) pedido.current = null;
      setEstado(repetindo ? "incerto" : "editando");
      setMensagem("Não foi possível proteger este pedido nesta aba. Habilite o armazenamento da sessão antes de enviar."); return;
    }
    let resultado: ResultadoOperacaoVenda;
    try { resultado = await executarComandoVenda("criar", pedido.current); }
    catch { resultado = { ok: false, erro: { codigo: "transporte-indisponivel", motivo: null } }; }
    trava.current = false;
    if (resultado.ok) {
      try { sessionStorage.removeItem(CHAVE_SESSAO + usuario.current); } catch { /* Replay preservado é seguro se a aba não permitir remover. */ }
      pedido.current = null;
      aoCriar(resultado.oportunidade.id); return;
    }
    const codigo = resultado.erro.codigo;
    setMensagem(ERROS_CRIACAO_VENDA[codigo] ?? "Não foi possível concluir a criação. Revise o pedido e tente novamente.");
    if (INCERTOS.has(codigo)) setEstado("incerto");
    else if (codigo === "conflito-transitorio" || codigo === "nao-autenticado") setEstado("repetir");
    else {
      try { sessionStorage.removeItem(CHAVE_SESSAO + usuario.current); } catch { setEstado("incerto"); return; }
      pedido.current = null; setEstado("editando");
      setCampoErro(codigo === "nome-invalido" ? "nome" : codigo === "telefone-invalido" ? "telefone" : codigo === "origem-invalida" ? "origem" : codigo === "valor-invalido" ? "valor" : codigo.startsWith("contato-") ? "contatoId" : null);
    }
  }
  const candidatos = contatos?.ok ? filtrarContatosVenda(contatos.dados, busca) : [];
  const escolhido = contatos?.ok ? contatos.dados.find((c) => c.id === rascunho.contatoId) : null;
  const erroCampo = (campo: CampoCriacaoVenda) => ({ "aria-invalid": campoErro === campo || undefined, "aria-describedby": campoErro === campo ? `${id}-erro` : undefined, "data-campo": campo });
  return <div className="vendas-criacao-fundo" onMouseDown={(e) => { if (e.target === e.currentTarget && podeFechar) aoFechar(); }}>
    <div className="vendas-criacao-modal" ref={painel} role="dialog" aria-modal="true" aria-labelledby={`${id}-titulo`} aria-describedby={`${id}-descricao`}>
      <header className="vendas-criacao-cabecalho"><div><span className="vendas-criacao-sobrancelha">Vendas</span><h2 id={`${id}-titulo`}>Nova oportunidade</h2><p id={`${id}-descricao`}>Registre o interessado e os dados iniciais do negócio.</p></div>
        <button type="button" ref={inicial} className="icon-btn" aria-label="Fechar criação de oportunidade" disabled={!podeFechar} onClick={aoFechar}>×</button></header>
      <form onSubmit={(e) => void submeter(e)} noValidate className="vendas-criacao-form">
        <div className="vendas-criacao-corpo">
          {mensagem && <div id={`${id}-erro`} className="vendas-criacao-alerta" role="alert" tabIndex={-1} ref={alerta}>{mensagem}</div>}
          <fieldset disabled={bloqueado} className="vendas-criacao-bloco"><legend>1. Interessado</legend>
            <div className="vendas-criacao-modos"><label><input type="radio" name={`${id}-modo`} checked={rascunho.modo === "existente"} onChange={() => alterar("modo", "existente")} /> Contato existente</label><label><input type="radio" name={`${id}-modo`} checked={rascunho.modo === "novo"} onChange={() => alterar("modo", "novo")} /> Novo interessado</label></div>
            {rascunho.modo === "existente" ? <>
              <label htmlFor={`${id}-busca`}>Buscar por nome ou telefone</label><input id={`${id}-busca`} type="search" className="search-input" value={busca} onChange={(e) => setBusca(e.target.value)} {...erroCampo("contatoId")} />
              {contatos === null ? <p role="status">Carregando contatos…</p> : !contatos.ok ? <div role="alert"><p>Não foi possível carregar seus contatos. {contatos.erro === "nao-autenticado" ? "Entre novamente." : "Tente novamente."}</p><button type="button" className="btn btn-secondary" onClick={() => void carregar()}>Atualizar contatos</button></div> : <>
                <p className="vendas-criacao-ajuda">{candidatos.length} contato(s). Escolha a pessoa; nomes iguais podem ser pessoas diferentes.</p>
                <div className="vendas-criacao-contatos" role="group" aria-label="Contatos existentes">{candidatos.length === 0 ? <p>{contatos.dados.length === 0 ? "Nenhum contato disponível. Você pode cadastrar um novo interessado." : "Nenhum contato encontrado nesta busca."}</p> : candidatos.map((c) => <label className="vendas-criacao-contato" key={c.id} data-selecionado={c.id === rascunho.contatoId}><input type="radio" name={`${id}-contato`} checked={c.id === rascunho.contatoId} onChange={() => alterar("contatoId", c.id)} /><span><strong>{c.nome}</strong><small>{c.telefones.join(" · ") || "Sem telefone"}</small>{c.arquivado && <small>Contato arquivado</small>}</span></label>)}</div>
                {escolhido && <p className="vendas-criacao-escolhido">Selecionado: <strong>{escolhido.nome}</strong>{escolhido.arquivado ? " · contato arquivado" : ""}</p>}
              </>}
            </> : <div className="vendas-criacao-grade"><div><label htmlFor={`${id}-nome`}>Nome do interessado <span aria-hidden="true">*</span></label><input id={`${id}-nome`} required autoComplete="name" value={rascunho.nome} onChange={(e) => alterar("nome", e.target.value)} {...erroCampo("nome")} /></div><div><label htmlFor={`${id}-telefone`}>Telefone <span className="vendas-criacao-opcional">opcional</span></label><input id={`${id}-telefone`} type="tel" autoComplete="tel" value={rascunho.telefone} onChange={(e) => alterar("telefone", e.target.value)} {...erroCampo("telefone")} /><p className="vendas-criacao-ajuda">Deixe em branco se não souber.</p></div></div>}
          </fieldset>
          {rascunho.modo === "novo" && (contatos === null || !contatos.ok) && <div role="status"><p>{contatos === null ? "Verificando sua sessão…" : "Não foi possível verificar sua sessão para criar."}</p>{contatos !== null && <button type="button" className="btn btn-secondary" onClick={() => void carregar()}>Tentar novamente</button>}</div>}
          <fieldset disabled={bloqueado} className="vendas-criacao-bloco"><legend>2. Dados comerciais</legend><p className="vendas-criacao-ajuda">Todos os campos deste bloco são opcionais.</p>
            <div className="vendas-criacao-grade"><div><label htmlFor={`${id}-origem`}>Origem comercial</label><select id={`${id}-origem`} value={rascunho.origem} onChange={(e) => alterar("origem", e.target.value as RascunhoCriacaoVenda["origem"])} {...erroCampo("origem")}><option value="">Não informada</option>{Object.entries(ROTULOS_ORIGEM_CRIACAO_VENDA).map(([valor, rotulo]) => <option key={valor} value={valor}>{rotulo}</option>)}</select></div>{rascunho.origem && <div><label htmlFor={`${id}-descricao-origem`}>Detalhe da origem</label><input id={`${id}-descricao-origem`} value={rascunho.descricaoOrigem} onChange={(e) => alterar("descricaoOrigem", e.target.value)} /></div>}</div>
            <div className="vendas-criacao-grade"><div><label htmlFor={`${id}-valor`}>Valor previsto do negócio (R$)</label><input id={`${id}-valor`} inputMode="decimal" placeholder="Não informado" value={rascunho.valor} onChange={(e) => alterar("valor", e.target.value)} {...erroCampo("valor")} /></div><div><label htmlFor={`${id}-receita`}>Receita prevista (R$)</label><input id={`${id}-receita`} inputMode="decimal" placeholder="Não informada" value={rascunho.receita} onChange={(e) => alterar("receita", e.target.value)} {...erroCampo("receita")} /></div></div>
          </fieldset>
          <section className="vendas-criacao-resumo" aria-label="Resumo da criação"><h3>3. Resumo</h3><p>{rascunho.modo === "novo" ? rascunho.nome.trim() || "Novo interessado" : escolhido?.nome || "Escolha um interessado"}</p><div><span className="badge">Nova</span><span>Sem imóvel vinculado</span></div><p className="vendas-criacao-ajuda">A oportunidade começa na etapa Nova. Nenhuma mensagem será enviada.</p></section>
          {bloqueado && <p role="status" className="vendas-criacao-ajuda">{estado === "enviando" ? "Enviando o pedido… Aguarde a confirmação." : "Os dados estão preservados. Repita o mesmo pedido para confirmar o resultado antes de fechar."}</p>}
        </div>
        <footer className="vendas-criacao-rodape"><button type="button" className="btn btn-secondary" disabled={!podeFechar} onClick={aoFechar}>Cancelar</button><button type="submit" className="btn btn-primary" disabled={estado === "enviando" || recuperacaoBloqueada || !contatos?.ok}>{estado === "enviando" ? "Criando…" : estado === "incerto" ? "Verificar mesmo pedido" : estado === "repetir" ? "Repetir mesmo pedido" : "Criar oportunidade"}</button></footer>
      </form>
    </div>
  </div>;
}
