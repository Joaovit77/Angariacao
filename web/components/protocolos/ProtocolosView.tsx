"use client";

import { useState } from "react";
import { useSessao } from "@/components/SessaoProvider";
import { MAX_PROTOCOLOS, MAX_PROTOCOLO_CHARS } from "@/lib/calculo/ia";
import {
  alternarArquivamentoProtocolo,
  excluirProtocolo,
  salvarProtocolo,
  uid,
} from "@/lib/mutacoes";
import type { TipoProtocolo } from "@/lib/protocolos";
import { useAppStore } from "@/lib/store";
import type { Protocolo } from "@/lib/tipos";

const CATEGORIAS: Array<{
  tipo: TipoProtocolo;
  titulo: string;
  descricao: string;
}> = [
  {
    tipo: "informacao_comercial",
    titulo: "Informações comerciais",
    descricao:
      "Fatos oficiais sobre taxas, serviços, contratos e funcionamento da Imobiliária. A IA pode usar essas informações para responder aos proprietários.",
  },
  {
    tipo: "regra_conduta",
    titulo: "Regras de conduta da IA",
    descricao:
      "Instruções que controlam como a IA conversa, conduz o atendimento e lida com situações específicas. Essas regras não são apresentadas como informações comerciais.",
  },
];

const SUGESTOES: { titulo: string; ajuda: string }[] = [
  { titulo: "Taxa de administração", ajuda: "Quanto é, e o que está incluso" },
  { titulo: "Como funciona o repasse", ajuda: "Quem recebe o primeiro mês, quando cai o aluguel" },
  { titulo: "Prazo de contrato", ajuda: "De quantos anos, e se dá para ser menor" },
  { titulo: "Multa por rescisão", ajuda: "O que acontece se o proprietário quiser sair antes" },
  { titulo: "Quem paga o quê", ajuda: "Condomínio, IPTU, água, luz e gás" },
  { titulo: "Exclusividade", ajuda: "É exigida, e o que muda se não houver" },
  { titulo: "Garantia do inquilino", ajuda: "Fiador, seguro-fiança, caução" },
  { titulo: "Horário de atendimento", ajuda: "Dias e horários, inclusive fim de semana" },
  { titulo: "Trabalham com venda?", ajuda: "A resposta para quem pergunta se também vende" },
  { titulo: "Como funciona a avaliação", ajuda: "Se é gratuita, quanto demora, o que é preciso" },
];

function rotuloTipo(tipo: TipoProtocolo): string {
  return tipo === "informacao_comercial" ? "Informação comercial" : "Regra de conduta";
}

export default function ProtocolosView() {
  const { usuario } = useSessao();
  const protocolos = useAppStore((estado) => estado.protocolos);

  const [categoriaAtiva, setCategoriaAtiva] = useState<TipoProtocolo>("informacao_comercial");
  const [edicao, setEdicao] = useState<Protocolo | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [mostrarArquivados, setMostrarArquivados] = useState(false);

  const protocolosDaCategoria = protocolos.filter((protocolo) => protocolo.tipo === categoriaAtiva);
  const ativos = protocolosDaCategoria.filter((protocolo) => !protocolo.arquivado);
  const visiveis = protocolosDaCategoria.filter(
    (protocolo) => mostrarArquivados || !protocolo.arquivado,
  );
  const totalArquivados = protocolosDaCategoria.length - ativos.length;
  const categoria = CATEGORIAS.find((item) => item.tipo === categoriaAtiva) || CATEGORIAS[0];

  const jaCadastrados = new Set(
    protocolos
      .filter((protocolo) => protocolo.tipo === "informacao_comercial")
      .map((protocolo) => protocolo.titulo.trim().toLowerCase()),
  );
  const sugestoesRestantes = SUGESTOES.filter(
    (sugestao) => !jaCadastrados.has(sugestao.titulo.toLowerCase()),
  );

  function selecionarCategoria(tipo: TipoProtocolo) {
    setCategoriaAtiva(tipo);
    setEdicao(null);
    setMostrarArquivados(false);
  }

  function novo(titulo = "") {
    setEdicao({ id: uid(), tipo: categoriaAtiva, titulo, conteudo: "", arquivado: false });
  }

  async function salvar() {
    if (!edicao || !usuario || salvando) return;
    setSalvando(true);
    const protocoloSalvo = edicao;
    const ok = await salvarProtocolo(protocoloSalvo, usuario.id);
    setSalvando(false);
    if (ok) {
      setCategoriaAtiva(protocoloSalvo.tipo);
      setEdicao(null);
    }
  }

  const excedente =
    categoriaAtiva === "informacao_comercial" ? ativos.length - MAX_PROTOCOLOS : 0;
  const ehInformacaoComercial = edicao?.tipo === "informacao_comercial";

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Protocolos</h1>
          <p className="page-sub">Fontes oficiais e regras que orientam o atendimento por IA</p>
        </div>
        {!edicao && (
          <button type="button" className="btn btn-primary btn-sm" onClick={() => novo()}>
            Novo protocolo
          </button>
        )}
      </div>

      <div className="proto-categorias" role="tablist" aria-label="Categorias de protocolos">
        {CATEGORIAS.map((item) => {
          const quantidade = protocolos.filter(
            (protocolo) => protocolo.tipo === item.tipo && !protocolo.arquivado,
          ).length;
          const ativa = categoriaAtiva === item.tipo;
          return (
            <button
              key={item.tipo}
              type="button"
              role="tab"
              aria-selected={ativa}
              className={`proto-categoria${ativa ? " ativa" : ""}`}
              onClick={() => selecionarCategoria(item.tipo)}
            >
              <span className="proto-categoria-topo">
                <strong>{item.titulo}</strong>
                <b>{quantidade}</b>
              </span>
              <span>{item.descricao}</span>
            </button>
          );
        })}
      </div>

      <div className="proto-categoria-resumo" role="tabpanel">
        <strong>{categoria.titulo}</strong>
        <span>
          {categoriaAtiva === "informacao_comercial"
            ? "A IA recupera somente os fatos relacionados à pergunta atual. Se a informação não estiver cadastrada, ela deve oferecer confirmação em vez de inventar."
            : "Todas as regras ativas são aplicadas em cada geração, independentemente do assunto da pergunta."}
        </span>
      </div>

      {excedente > 0 && (
        <p className="section-note proto-aviso-limite">
          Você tem {ativos.length} informações comerciais ativas e somente as {MAX_PROTOCOLOS}{" "}
          primeiras entram no catálogo de recuperação. Arquive {excedente === 1 ? "uma" : excedente}{" "}
          que não use mais, ou divida os assuntos de forma mais objetiva.
        </p>
      )}

      {edicao && (
        <div className="card proto-editor">
          <fieldset className="proto-tipo-campo">
            <legend>Tipo do protocolo</legend>
            <div className="proto-tipo-opcoes">
              {CATEGORIAS.map((item) => (
                <label
                  key={item.tipo}
                  className={`proto-tipo-opcao${edicao.tipo === item.tipo ? " selecionada" : ""}`}
                >
                  <input
                    type="radio"
                    name="tipo-protocolo"
                    value={item.tipo}
                    checked={edicao.tipo === item.tipo}
                    onChange={() => setEdicao({ ...edicao, tipo: item.tipo })}
                  />
                  <span>
                    <strong>{item.titulo}</strong>
                    <small>{item.descricao}</small>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <div className="field-group">
            <label>Assunto</label>
            <input
              type="text"
              value={edicao.titulo}
              onChange={(evento) => setEdicao({ ...edicao, titulo: evento.target.value })}
              placeholder={
                ehInformacaoComercial ? "Ex.: Taxa de administração" : "Ex.: Não repetir informações"
              }
            />
            <div className="field-hint">
              {ehInformacaoComercial
                ? "Escreva como o proprietário perguntaria. Esse título ajuda a IA a localizar o fato relevante."
                : "Use um nome interno curto. O título organiza a regra no painel e não deve aparecer na resposta ao proprietário."}
            </div>
          </div>

          <div className="field-group">
            <label>{ehInformacaoComercial ? "Informação oficial da imobiliária" : "Regra obrigatória de conduta"}</label>
            <textarea
              value={edicao.conteudo}
              onChange={(evento) => setEdicao({ ...edicao, conteudo: evento.target.value })}
              placeholder={
                ehInformacaoComercial
                  ? "Ex.: A taxa de administração é de 10% sobre o valor do aluguel."
                  : "Ex.: Se a informação não estiver cadastrada, a IA não deve inventar nem estimar."
              }
            />
            <div className="field-hint">
              {edicao.conteudo.trim().length} de {MAX_PROTOCOLO_CHARS} caracteres. {" "}
              {ehInformacaoComercial
                ? "Registre somente fatos confirmados, sem saudação ou texto pronto."
                : "Descreva a conduta esperada sem incluir taxas, serviços ou condições comerciais novas."}
            </div>
          </div>

          <div className="proto-editor-acoes">
            <button type="button" className="btn btn-sm" onClick={() => setEdicao(null)}>
              Cancelar
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={salvar}
              disabled={
                !edicao.tipo ||
                !edicao.titulo.trim() ||
                !edicao.conteudo.trim() ||
                edicao.conteudo.trim().length > MAX_PROTOCOLO_CHARS ||
                salvando
              }
            >
              Salvar protocolo
            </button>
          </div>
        </div>
      )}

      {visiveis.length === 0 && !edicao && (
        <div className="card proto-vazio">
          <p className="section-note">
            {categoriaAtiva === "informacao_comercial"
              ? "Ainda não há informações comerciais nesta categoria. Use os assuntos abaixo como ponto de partida e preencha apenas o que a Imobiliária confirmou."
              : "Ainda não há regras de conduta. Crie uma regra para orientar permanentemente como a IA deve lidar com uma situação de atendimento."}
          </p>
          {categoriaAtiva === "informacao_comercial" && (
            <div className="proto-sugestoes">
              {SUGESTOES.map((sugestao) => (
                <button
                  key={sugestao.titulo}
                  type="button"
                  className="proto-sugestao"
                  onClick={() => novo(sugestao.titulo)}
                >
                  <span className="proto-sugestao-titulo">{sugestao.titulo}</span>
                  <span className="proto-sugestao-ajuda">{sugestao.ajuda}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="proto-lista">
        {visiveis.map((protocolo) => (
          <div
            key={protocolo.id}
            className={`card proto-card${protocolo.arquivado ? " arquivado" : ""}`}
          >
            <div className="proto-card-topo">
              <div className="proto-card-identidade">
                <strong className="proto-card-titulo">{protocolo.titulo}</strong>
                <span className={`proto-tipo-badge ${protocolo.tipo}`}>
                  {rotuloTipo(protocolo.tipo)}
                </span>
              </div>
              <span className="proto-card-acoes">
                {!protocolo.arquivado && (
                  <button type="button" className="btn btn-sm" onClick={() => setEdicao(protocolo)}>
                    Editar
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => alternarArquivamentoProtocolo(protocolo.id)}
                >
                  {protocolo.arquivado ? "Reativar" : "Arquivar"}
                </button>
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => excluirProtocolo(protocolo.id)}
                >
                  Excluir
                </button>
              </span>
            </div>
            <div className="section-note proto-card-texto">{protocolo.conteudo}</div>
            {protocolo.arquivado && <div className="field-hint">Arquivado: não é utilizado pela IA.</div>}
          </div>
        ))}
      </div>

      {categoriaAtiva === "informacao_comercial" &&
        visiveis.length > 0 &&
        sugestoesRestantes.length > 0 &&
        !edicao && (
          <div className="card proto-sugestoes-bloco">
            <p className="section-note">
              Assuntos que seus proprietários já perguntaram e ainda não têm informação cadastrada:
            </p>
            <div className="proto-sugestoes">
              {sugestoesRestantes.map((sugestao) => (
                <button
                  key={sugestao.titulo}
                  type="button"
                  className="proto-sugestao"
                  onClick={() => novo(sugestao.titulo)}
                >
                  <span className="proto-sugestao-titulo">{sugestao.titulo}</span>
                  <span className="proto-sugestao-ajuda">{sugestao.ajuda}</span>
                </button>
              ))}
            </div>
          </div>
        )}

      {totalArquivados > 0 && (
        <div className="proto-arquivados-acao">
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => setMostrarArquivados((valor) => !valor)}
          >
            {mostrarArquivados
              ? "Esconder arquivados"
              : `Mostrar arquivados (${totalArquivados})`}
          </button>
        </div>
      )}
    </>
  );
}
