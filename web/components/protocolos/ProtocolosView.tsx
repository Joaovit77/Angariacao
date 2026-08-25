"use client";

/* ================================================================
   VIEW: PROTOCOLOS DA IMOBILIÁRIA
   As regras da EMPRESA, escritas pelo corretor: taxa, prazo, multa,
   quem paga o quê, exclusividade, horário. É a única coisa que o
   rascunho de resposta por IA está autorizado a AFIRMAR.

   O que decide se esta tela vive ou morre é o ESTADO VAZIO. Base
   vazia não muda nada no rascunho, e uma tela que não muda nada é
   uma tela que ninguém volta a abrir — foi assim que a faixa de
   "imóvel parado" morreu no termômetro. Por isso o vazio não é um
   "nenhum protocolo cadastrado": é a lista dos assuntos que os
   proprietários DELE perguntaram, cada um a um clique de virar
   protocolo.

   Não confundir com fato do IMÓVEL (garagem, pet, o condomínio
   daquele apartamento): aquilo varia por imóvel, o painel não tem o
   dado, e continua proibido à IA.
   ================================================================ */
import { useState } from "react";
import { useSessao } from "@/components/SessaoProvider";
import { MAX_PROTOCOLOS, MAX_PROTOCOLO_CHARS } from "@/lib/calculo/ia";
import {
  alternarArquivamentoProtocolo,
  excluirProtocolo,
  salvarProtocolo,
  uid,
} from "@/lib/mutacoes";
import { useAppStore } from "@/lib/store";
import type { Protocolo } from "@/lib/tipos";

/* Os assuntos que os proprietários realmente perguntaram, medidos na carteira
   em 04/08/2026 (49 respostas com pergunta; ~18 sobre a empresa). Cada um saiu
   de uma mensagem real: taxa, repasse, prazo, multa e contas do LD-156; o
   horário do LD-178; a venda do LD-55; a exclusividade do LD-161.

   Não vêm preenchidos com conteúdo de propósito. Um texto padrão sobre taxa de
   administração seria a IA afirmando a um proprietário real um número que esta
   imobiliária nunca disse — e o corretor confirmaria sem ler, porque já estava
   escrito. O título é a pergunta; a resposta é dele. */
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

export default function ProtocolosView() {
  const { usuario } = useSessao();
  const protocolos = useAppStore((s) => s.protocolos);

  const [edicao, setEdicao] = useState<Protocolo | null>(null);
  const [salvando, setSalvando] = useState(false);
  const [mostrarArquivados, setMostrarArquivados] = useState(false);

  const ativos = protocolos.filter((p) => !p.arquivado);
  const visiveis = protocolos.filter((p) => mostrarArquivados || !p.arquivado);
  const totalArquivados = protocolos.length - ativos.length;

  // Títulos já usados: a sugestão some da grade depois de virar protocolo, para
  // o vazio não continuar oferecendo o que já está cadastrado.
  const jaCadastrados = new Set(protocolos.map((p) => p.titulo.trim().toLowerCase()));
  const sugestoesRestantes = SUGESTOES.filter((s) => !jaCadastrados.has(s.titulo.toLowerCase()));

  function novo(titulo = "") {
    setEdicao({ id: uid(), titulo, conteudo: "", arquivado: false });
  }

  async function salvar() {
    if (!edicao || !usuario || salvando) return;
    setSalvando(true);
    const ok = await salvarProtocolo(edicao, usuario.id);
    setSalvando(false);
    if (ok) setEdicao(null);
  }

  const excedente = ativos.length - MAX_PROTOCOLOS;

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Protocolos</h1>
          <p className="page-sub">As regras da imobiliária que a IA consulta para responder</p>
        </div>
        {!edicao && (
          <button type="button" className="btn btn-primary btn-sm" onClick={() => novo()}>
            Novo protocolo
          </button>
        )}
      </div>

      <p className="section-note" style={{ marginBottom: "14px" }}>
        Quando o proprietário pergunta sobre a <strong>imobiliária</strong> (taxa, prazo de contrato,
        quem paga o condomínio), a IA só consegue responder o que estiver escrito aqui. Sem um
        protocolo sobre o assunto, ela reconhece a pergunta e sugere marcar uma ligação, em vez de
        arriscar um número.
      </p>
      <p className="section-note" style={{ marginBottom: "18px" }}>
        <strong>O que você escrever aqui a IA pode afirmar a um proprietário real.</strong> Sobre o
        imóvel em si (garagem, pet, valor daquele apartamento) ela continua proibida de afirmar
        qualquer coisa, porque o painel não tem esse dado.
      </p>

      {excedente > 0 && (
        <p className="section-note" style={{ marginBottom: "14px" }}>
          Você tem {ativos.length} protocolos ativos e só os {MAX_PROTOCOLOS} primeiros vão para a
          IA. Arquive {excedente === 1 ? "um" : `${excedente}`} que não use mais, ou junte os
          parecidos.
        </p>
      )}

      {edicao && (
        <div className="card" style={{ padding: "14px", marginBottom: "16px" }}>
          <div className="field-group">
            <label>Assunto</label>
            <input
              type="text"
              value={edicao.titulo}
              onChange={(e) => setEdicao({ ...edicao, titulo: e.target.value })}
              placeholder="Ex.: Taxa de administração"
            />
            <div className="field-hint">
              Escreva como o proprietário perguntaria. É por este título que a IA acha o assunto.
            </div>
          </div>
          <div className="field-group">
            <label>Regra ou fato da imobiliária</label>
            <textarea
              value={edicao.conteudo}
              onChange={(e) => setEdicao({ ...edicao, conteudo: e.target.value })}
              placeholder="Ex.: A taxa de administração é de 10% sobre o valor do aluguel, e cobre a cobrança mensal, o repasse até o dia 10 e a vistoria de entrada e saída."
              style={{ width: "100%", minHeight: "110px" }}
            />
            <div className="field-hint">
              {edicao.conteudo.trim().length} de {MAX_PROTOCOLO_CHARS} caracteres. Registre a regra
              de forma objetiva, sem saudação, frase pronta ou jeito pessoal de escrever. O que não
              couber provavelmente são dois protocolos.
            </div>
          </div>
          <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
            <button type="button" className="btn btn-sm" onClick={() => setEdicao(null)}>
              Cancelar
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={salvar}
              disabled={
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
        <div className="card" style={{ padding: "16px", marginBottom: "16px" }}>
          <p className="section-note" style={{ marginBottom: "12px" }}>
            Ainda não há protocolo nenhum, então a IA não pode afirmar nada. Estes são os assuntos
            que seus proprietários já perguntaram por escrito. Clique em um para escrever a sua
            resposta.
          </p>
          <div className="proto-sugestoes">
            {SUGESTOES.map((s) => (
              <button
                key={s.titulo}
                type="button"
                className="proto-sugestao"
                onClick={() => novo(s.titulo)}
              >
                <span className="proto-sugestao-titulo">{s.titulo}</span>
                <span className="proto-sugestao-ajuda">{s.ajuda}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {visiveis.map((p) => (
        <div
          key={p.id}
          className={`card proto-card${p.arquivado ? " arquivado" : ""}`}
          style={{ padding: "14px", marginBottom: "10px" }}
        >
          <div className="proto-card-topo">
            <strong className="proto-card-titulo">{p.titulo}</strong>
            <span className="proto-card-acoes">
              {!p.arquivado && (
                <button type="button" className="btn btn-sm" onClick={() => setEdicao(p)}>
                  Editar
                </button>
              )}
              <button
                type="button"
                className="btn btn-sm"
                onClick={() => alternarArquivamentoProtocolo(p.id)}
              >
                {p.arquivado ? "Reativar" : "Arquivar"}
              </button>
              <button type="button" className="btn btn-sm" onClick={() => excluirProtocolo(p.id)}>
                Excluir
              </button>
            </span>
          </div>
          <div className="section-note proto-card-texto">{p.conteudo}</div>
          {p.arquivado && <div className="field-hint">Arquivado: não vai para a IA.</div>}
        </div>
      ))}

      {/* As sugestões que sobraram continuam à mão depois do primeiro cadastro:
          uma base com dois protocolos ainda deixa a IA muda na maioria das
          perguntas, e é justamente aí que o corretor para de preencher. */}
      {visiveis.length > 0 && sugestoesRestantes.length > 0 && !edicao && (
        <div className="card" style={{ padding: "14px", marginTop: "16px" }}>
          <p className="section-note" style={{ marginBottom: "10px" }}>
            Assuntos que seus proprietários já perguntaram e ainda não têm protocolo:
          </p>
          <div className="proto-sugestoes">
            {sugestoesRestantes.map((s) => (
              <button
                key={s.titulo}
                type="button"
                className="proto-sugestao"
                onClick={() => novo(s.titulo)}
              >
                <span className="proto-sugestao-titulo">{s.titulo}</span>
                <span className="proto-sugestao-ajuda">{s.ajuda}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {totalArquivados > 0 && (
        <div style={{ marginTop: "14px" }}>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => setMostrarArquivados((v) => !v)}
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
