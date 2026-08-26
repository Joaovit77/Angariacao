"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { rotuloUsuario, useSessao } from "@/components/SessaoProvider";
import Icone from "@/components/Icone";
import {
  contagensConversas,
  conversasDosImoveis,
  filtrarConversas,
  valorMonetarioContexto,
  type ConversaImovel,
  type FiltroPrincipalConversas,
  type FiltrosConversas,
  type MensagemConversa,
} from "@/lib/calculo/conversas";
import { aplicarModeloUsuario, linkWhatsapp, mensagemFalhaEnvio } from "@/lib/calculo/whatsapp";
import { todayISO } from "@/lib/datas";
import { enviarWhatsapp } from "@/lib/envioWhatsapp";
import { fmtDate } from "@/lib/formatadores";
import { rascunharResposta } from "@/lib/ia";
import { imoveisComAgendamentoAtivo } from "@/lib/mensagensAgendadas";
import { marcarRespostasLidas, recarregarEstado } from "@/lib/mutacoes";
import { useAppStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import { useMensagensAgendadas } from "@/lib/useMensagensAgendadas";
import { useUiModal } from "@/lib/uiModal";
import type { AgendaItem, Imovel } from "@/lib/tipos";

const FILTROS_INICIAIS: FiltrosConversas = {
  principal: "todas",
  naoLidas: false,
  agendadas: false,
};

const ROTULOS_PRINCIPAIS: Array<{
  id: FiltroPrincipalConversas;
  texto: string;
  contagem: "todas" | "emAndamento" | "naoRespondidas";
}> = [
  { id: "todas", texto: "Todas", contagem: "todas" },
  { id: "em-andamento", texto: "Em andamento", contagem: "emAndamento" },
  { id: "nao-respondidas", texto: "Não respondidas", contagem: "naoRespondidas" },
];

function nomeConversa(imovel: Imovel): string {
  return imovel.proprietarioNome?.trim() || "Proprietário não informado";
}

function iniciais(nome: string): string {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  return ((partes[0]?.[0] || "?") + (partes.length > 1 ? partes.at(-1)?.[0] || "" : "")).toUpperCase();
}

function codigoImovel(imovel: Imovel): string {
  return imovel.codigo || imovel.referenciaCrm || "Sem código";
}

function horaMensagem(data: string): string {
  const hora = data.match(/T(\d{2}:\d{2})/)?.[1];
  return hora || "";
}

function rotuloDataLista(data: string): string {
  const dia = data.slice(0, 10);
  if (dia === todayISO()) return horaMensagem(data);
  return fmtDate(dia);
}

function rotuloDia(dia: string): string {
  return dia === todayISO() ? "Hoje" : fmtDate(dia);
}

interface TipoConteudo {
  recebido: string;
  enviado: string;
}

const TIPOS_CONTEUDO: Array<[string, TipoConteudo]> = [
  ["audio", { recebido: "Áudio recebido", enviado: "Áudio enviado" }],
  ["image", { recebido: "Imagem recebida", enviado: "Imagem enviada" }],
  ["video", { recebido: "Vídeo recebido", enviado: "Vídeo enviado" }],
  ["document", { recebido: "Documento recebido", enviado: "Documento enviado" }],
  ["sticker", { recebido: "Figurinha recebida", enviado: "Figurinha enviada" }],
  ["location", { recebido: "Localização recebida", enviado: "Localização enviada" }],
  ["contact", { recebido: "Contato recebido", enviado: "Contato enviado" }],
];

function descricaoConteudo(mensagem: MensagemConversa): string | null {
  const identificacao = `${mensagem.tipo} ${mensagem.texto}`.toLocaleLowerCase("pt-BR");
  const encontrado = TIPOS_CONTEUDO.find(([chave]) => identificacao.includes(chave));
  if (!encontrado) return null;
  return mensagem.direcao === "enviada" ? encontrado[1].enviado : encontrado[1].recebido;
}

function conteudoIndisponivel(mensagem: MensagemConversa): boolean {
  return mensagem.soMidia || !mensagem.texto.trim();
}

function previaMensagem(mensagem: MensagemConversa): string {
  const prefixo = mensagem.direcao === "enviada" ? "Você: " : "";
  if (conteudoIndisponivel(mensagem)) {
    return prefixo + (descricaoConteudo(mensagem) || "Conteúdo não disponível");
  }
  return prefixo + mensagem.texto;
}

function estadoConversa(conversa: ConversaImovel): string {
  if (conversa.naoLidas > 0) return "Nova mensagem";
  if (conversa.emAndamento) return "Em andamento";
  if (conversa.naoRespondida) return "Aguardando retorno";
  return "Negociação encerrada";
}

function mensagemEstadoVazio(busca: string, filtros: FiltrosConversas): {
  titulo: string;
  descricao: string;
} {
  if (busca.trim()) {
    return { titulo: "Nenhuma conversa encontrada.", descricao: "Revise o termo buscado ou os filtros ativos." };
  }
  if (filtros.agendadas) {
    return { titulo: "Nenhuma conversa com mensagem agendada.", descricao: "Os agendamentos continuam disponíveis na gestão completa." };
  }
  if (filtros.naoLidas) {
    return { titulo: "Nenhuma mensagem não lida.", descricao: "As mensagens novas aparecerão aqui automaticamente." };
  }
  if (filtros.principal === "em-andamento") {
    return { titulo: "Nenhuma conversa em andamento.", descricao: "Uma resposta válida do contato fará a conversa aparecer aqui." };
  }
  if (filtros.principal === "nao-respondidas") {
    return { titulo: "Todas as conversas receberam retorno.", descricao: "Só aparecem aqui contatos ativos sem nenhuma resposta recebida." };
  }
  return { titulo: "Nenhuma conversa disponível.", descricao: "As conversas aparecem quando há histórico confirmado de WhatsApp." };
}

function ListaConversas({
  conversas,
  selecionadaId,
  busca,
  filtros,
  contagens,
  atualizando,
  carregandoFiltro,
  erro,
  aoBuscar,
  aoFiltrarPrincipal,
  aoAlternarNaoLidas,
  aoAlternarAgendadas,
  aoSelecionar,
  aoAtualizar,
  aoAbrirAgendadas,
}: {
  conversas: ConversaImovel[];
  selecionadaId: string | null;
  busca: string;
  filtros: FiltrosConversas;
  contagens: ReturnType<typeof contagensConversas>;
  atualizando: boolean;
  carregandoFiltro: boolean;
  erro: string;
  aoBuscar: (valor: string) => void;
  aoFiltrarPrincipal: (filtro: FiltroPrincipalConversas) => void;
  aoAlternarNaoLidas: () => void;
  aoAlternarAgendadas: () => void;
  aoSelecionar: (id: string) => void;
  aoAtualizar: () => void;
  aoAbrirAgendadas: () => void;
}) {
  const vazio = mensagemEstadoVazio(busca, filtros);
  return (
    <aside className="mensagens-lista" aria-label="Conversas de mensagens">
      <div className="mensagens-lista-head">
        <div className="mensagens-titulo-linha">
          <div>
            <span className="mensagens-kicker">Conversas</span>
            <strong className="mensagens-lista-total">{conversas.length} exibidas</strong>
          </div>
          <button
            type="button"
            className="mensagens-icon-btn"
            onClick={aoAtualizar}
            disabled={atualizando}
            title="Atualizar conversas"
            aria-label="Atualizar conversas"
          >
            <span className={atualizando ? "mensagens-girando" : ""}>
              <Icone nome="atualizar" tamanho={17} />
            </span>
          </button>
        </div>

        <label className="mensagens-busca">
          <Icone nome="buscar" tamanho={17} />
          <input
            value={busca}
            onChange={(evento) => aoBuscar(evento.target.value)}
            placeholder="Buscar conversas"
            aria-label="Buscar conversas"
          />
        </label>

        <div className="mensagens-filtros principais" aria-label="Filtros principais de conversa">
          {ROTULOS_PRINCIPAIS.map((filtro) => (
            <button
              type="button"
              key={filtro.id}
              className={filtros.principal === filtro.id ? "active" : ""}
              onClick={() => aoFiltrarPrincipal(filtro.id)}
            >
              <span>{filtro.texto}</span>
              <b>{contagens[filtro.contagem]}</b>
            </button>
          ))}
        </div>

        <div className="mensagens-filtros secundarios" aria-label="Filtros rápidos de conversa">
          <button
            type="button"
            className={filtros.naoLidas ? "active" : ""}
            aria-pressed={filtros.naoLidas}
            onClick={aoAlternarNaoLidas}
          >
            <span>Não lidas</span><b>{contagens.naoLidas}</b>
          </button>
          <button
            type="button"
            className={filtros.agendadas ? "active" : ""}
            aria-pressed={filtros.agendadas}
            onClick={aoAlternarAgendadas}
          >
            <span>Agendadas</span><b>{contagens.agendadas}</b>
          </button>
          <button
            type="button"
            className="mensagens-gerenciar"
            onClick={aoAbrirAgendadas}
            title="Abrir agendamentos e programar uma mensagem"
          >
            Agendar
          </button>
        </div>

        {erro ? (
          <div className="mensagens-erro" role="alert">
            <span>{erro}</span>
            <button type="button" onClick={aoAtualizar}>Tentar novamente</button>
          </div>
        ) : null}
      </div>

      <div className="mensagens-lista-scroll">
        {carregandoFiltro ? (
          <div className="mensagens-lista-carregando" role="status">Carregando agendamentos…</div>
        ) : conversas.length === 0 ? (
          <div className="mensagens-vazio compacto">
            <strong>{vazio.titulo}</strong>
            <p>{vazio.descricao}</p>
          </div>
        ) : (
          conversas.map((conversa) => {
            const { imovel } = conversa;
            const selecionada = selecionadaId === imovel.id;
            return (
              <button
                type="button"
                className={`mensagens-item${selecionada ? " active" : ""}`}
                key={imovel.id}
                onClick={() => aoSelecionar(imovel.id)}
                aria-current={selecionada ? "true" : undefined}
              >
                <span className="mensagens-avatar">{iniciais(nomeConversa(imovel))}</span>
                <span className="mensagens-item-corpo">
                  <span className="mensagens-item-topo">
                    <strong>{nomeConversa(imovel)}</strong>
                    <time>{rotuloDataLista(conversa.ultima.data)}</time>
                  </span>
                  <span className="mensagens-previa">{previaMensagem(conversa.ultima)}</span>
                  <span className="mensagens-item-meta">
                    <span>{codigoImovel(imovel)}</span>
                    {imovel.bairro || imovel.edificio ? <><i>·</i><span>{imovel.bairro || imovel.edificio}</span></> : null}
                    {imovel.responsavel ? <><i>·</i><span>{imovel.responsavel}</span></> : null}
                  </span>
                </span>
                {conversa.naoLidas > 0 ? (
                  <span className="mensagens-nao-lidas" aria-label={`${conversa.naoLidas} mensagens não lidas`}>
                    {conversa.naoLidas}
                  </span>
                ) : null}
              </button>
            );
          })
        )}
      </div>
    </aside>
  );
}

function Timeline({ conversa, aoAbrirWhatsapp }: { conversa: ConversaImovel; aoAbrirWhatsapp: () => void }) {
  const fimRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    fimRef.current?.scrollIntoView({ block: "end" });
  }, [conversa.imovel.id, conversa.mensagens.length]);

  return (
    <div className="mensagens-timeline" aria-label="Histórico da conversa">
      {conversa.mensagens.map((mensagem, indice) => {
        const novoDia = indice === 0 || conversa.mensagens[indice - 1].dia !== mensagem.dia;
        const descricao = descricaoConteudo(mensagem);
        const indisponivel = conteudoIndisponivel(mensagem);
        return (
          <div key={mensagem.id} className="mensagens-timeline-grupo">
            {novoDia ? <div className="mensagens-separador"><span>{rotuloDia(mensagem.dia)}</span></div> : null}
            <div className={`mensagens-balao ${mensagem.direcao}${indisponivel ? " somente-midia" : ""}`}>
              {descricao && !indisponivel ? (
                <div className="mensagens-midia-tipo">
                  <Icone nome="anexo" tamanho={15} />
                  <span>{descricao} · texto disponível</span>
                </div>
              ) : null}
              {indisponivel ? (
                <div className="mensagens-conteudo-indisponivel">
                  <span className="mensagens-midia-tipo">
                    <Icone nome="anexo" tamanho={15} />
                    <strong>{descricao || "Conteúdo não disponível nesta visualização"}</strong>
                  </span>
                  <button type="button" className="mensagens-ver-whatsapp" onClick={aoAbrirWhatsapp}>
                    Abrir no WhatsApp
                  </button>
                </div>
              ) : (
                <div className="mensagens-balao-texto">{mensagem.texto}</div>
              )}
              <div className="mensagens-balao-meta">
                {mensagem.importada ? <span>Histórico importado</span> : null}
                <time>{horaMensagem(mensagem.data)}</time>
              </div>
            </div>
          </div>
        );
      })}
      <div ref={fimRef} />
    </div>
  );
}

function Compositor({ conversa }: { conversa: ConversaImovel }) {
  const [texto, setTexto] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [rascunhando, setRascunhando] = useState(false);
  const [falha, setFalha] = useState("");
  const [protocolos, setProtocolos] = useState<string[]>([]);
  const config = useAppStore((estado) => estado.config);
  const iaDisponivel = useAppStore((estado) => estado.iaDisponivel);
  const abrirWhatsappRascunho = useUiModal((estado) => estado.abrirWhatsappRascunho);
  const { imovel } = conversa;

  async function enviar() {
    const mensagem = texto.trim();
    if (!mensagem || enviando) return;
    setEnviando(true);
    setFalha("");
    const resultado = await enviarWhatsapp(imovel.id, mensagem);
    if (!resultado.ok) {
      const motivo = resultado.mensagem || mensagemFalhaEnvio(resultado.falha || "falha-evolution");
      setFalha(motivo);
      toast(motivo, "error");
      setEnviando(false);
      return;
    }
    setTexto("");
    setProtocolos([]);
    await marcarRespostasLidas(imovel.id, true);
    await recarregarEstado();
    setEnviando(false);
    toast(
      resultado.historicoPersistido === false
        ? "Mensagem enviada, mas o histórico ainda não foi confirmado."
        : "Mensagem enviada no WhatsApp.",
      resultado.historicoPersistido === false ? "warning" : "success",
    );
  }

  async function sugerirComIa() {
    if (rascunhando) return;
    setRascunhando(true);
    setFalha("");
    const resultado = await rascunharResposta(imovel.id);
    setRascunhando(false);
    if (!resultado.ok || !resultado.rascunho) {
      setFalha(resultado.mensagem || "A IA não conseguiu sugerir uma resposta agora.");
      return;
    }
    setTexto(resultado.rascunho);
    setProtocolos(resultado.protocolosUsados || []);
  }

  function aplicarModelo(id: string) {
    const modelo = config.whatsappModelos.find((item) => item.id === id);
    if (!modelo) return;
    setTexto(aplicarModeloUsuario(modelo.texto, imovel));
    setProtocolos([]);
  }

  return (
    <div className="mensagens-compositor">
      <div className="mensagens-compositor-tabs">
        <span className="active">Responder</span>
        <small>Envio revisado por você</small>
      </div>
      <textarea
        value={texto}
        onChange={(evento) => setTexto(evento.target.value)}
        placeholder={imovel.proprietarioTelefone ? "Digite uma mensagem…" : "Cadastre o telefone do proprietário para responder"}
        disabled={!imovel.proprietarioTelefone || enviando}
        aria-label="Mensagem"
        onKeyDown={(evento) => {
          if (evento.key === "Enter" && (evento.ctrlKey || evento.metaKey)) {
            evento.preventDefault();
            void enviar();
          }
        }}
      />
      {protocolos.length > 0 ? (
        <div className="mensagens-protocolos">
          Sugestão baseada em: <strong>{protocolos.join(" · ")}</strong>. Confira antes de enviar.
        </div>
      ) : null}
      {falha ? <div className="mensagens-compositor-erro" role="alert">{falha}</div> : null}
      <div className="mensagens-compositor-acoes">
        <div className="mensagens-compositor-esquerda">
          {config.whatsappModelos.length > 0 ? (
            <label className="mensagens-modelos">
              <span>Resposta salva</span>
              <select defaultValue="" onChange={(evento) => aplicarModelo(evento.target.value)} aria-label="Usar resposta salva">
                <option value="" disabled>Escolher</option>
                {config.whatsappModelos.map((modelo) => <option value={modelo.id} key={modelo.id}>{modelo.nome}</option>)}
              </select>
            </label>
          ) : null}
          {iaDisponivel ? (
            <button type="button" className="mensagens-acao-texto ia" onClick={sugerirComIa} disabled={rascunhando || enviando}>
              {rascunhando ? "Sugerindo…" : "Sugerir com IA"}
            </button>
          ) : null}
          <button type="button" className="mensagens-acao-texto" onClick={() => abrirWhatsappRascunho(imovel.id, texto, protocolos)}>
            Mais opções
          </button>
        </div>
        <button
          type="button"
          className="mensagens-enviar"
          onClick={() => void enviar()}
          disabled={!texto.trim() || enviando || !imovel.proprietarioTelefone}
          aria-label={enviando ? "Enviando mensagem" : "Enviar mensagem"}
        >
          <span>{enviando ? "Enviando…" : "Enviar"}</span>
          <Icone nome="enviar" tamanho={17} />
        </button>
      </div>
    </div>
  );
}

function ValorContexto({
  valor,
  rotuloAusente,
  destaque = false,
}: {
  valor: number | null | undefined;
  rotuloAusente?: string;
  destaque?: boolean;
}) {
  const formatado = valorMonetarioContexto(valor, rotuloAusente);
  return (
    <span className={`${destaque ? "mensagens-valor " : ""}${formatado.informado ? "" : "nao-informado"}`}>
      {formatado.texto}
    </span>
  );
}

function Contexto({
  conversa,
  agenda,
  aoFechar,
}: {
  conversa: ConversaImovel;
  agenda: AgendaItem[];
  aoFechar: () => void;
}) {
  const abrirModal = useUiModal((estado) => estado.abrirModal);
  const { imovel } = conversa;
  const whatsapp = linkWhatsapp(imovel, "");
  const local = [imovel.bairro, imovel.cidade].filter(Boolean).join(", ");
  const proxima = agenda
    .filter((item) => item.imovelId === imovel.id && !item.done && item.date >= todayISO())
    .sort((a, b) => a.date.localeCompare(b.date) || (a.hora || "").localeCompare(b.hora || ""))[0];

  return (
    <aside className="mensagens-contexto" aria-label="Contexto do imóvel">
      <div className="mensagens-contexto-head">
        <h2>Contexto do imóvel</h2>
        <button type="button" onClick={aoFechar} aria-label="Fechar contexto">×</button>
      </div>
      <div className="mensagens-contexto-scroll">
        <section className="mensagens-contexto-secao">
          <h3>Proprietário</h3>
          <div className="mensagens-proprietario-card">
            <span className="mensagens-avatar grande">{iniciais(nomeConversa(imovel))}</span>
            <div>
              <strong>{nomeConversa(imovel)}</strong>
              <span>{imovel.proprietarioTelefone || "Telefone não informado"}</span>
            </div>
            <div className="mensagens-contato-acoes">
              {imovel.proprietarioTelefone ? (
                <a href={`tel:${imovel.proprietarioTelefone}`} title="Ligar"><Icone nome="telefone" tamanho={17} /></a>
              ) : null}
              {whatsapp ? (
                <a href={whatsapp} target="_blank" rel="noreferrer" title="Abrir WhatsApp"><Icone nome="whatsapp" tamanho={18} /></a>
              ) : null}
            </div>
          </div>
        </section>

        <section className="mensagens-contexto-secao">
          <h3>Imóvel</h3>
          <div className="mensagens-imovel-card">
            <span className="mensagens-imovel-icone"><Icone nome="imovel" tamanho={22} /></span>
            <div className="mensagens-imovel-dados">
              <div className="mensagens-imovel-titulo">
                <strong>{codigoImovel(imovel)}</strong>
                {imovel.tipo ? <span>{imovel.tipo}</span> : null}
              </div>
              {imovel.edificio ? <p>{imovel.edificio}</p> : null}
              <p>{imovel.endereco || "Endereço não informado"}</p>
              {local ? <p>{local}</p> : null}
              <ValorContexto valor={imovel.valorAluguel} destaque />
              <p className="mensagens-condominio">
                <ValorContexto valor={imovel.valorCondominio} rotuloAusente="Condomínio não informado" />
              </p>
            </div>
          </div>
        </section>

        <section className="mensagens-contexto-secao negociacao">
          <h3>Negociação</h3>
          <div className="mensagens-contexto-grade">
            <div className="mensagens-contexto-campo">
              <span>Etapa do funil</span><strong>{imovel.status}</strong>
            </div>
            <div className="mensagens-contexto-campo">
              <span>Responsável</span><strong>{imovel.responsavel || "Não atribuído"}</strong>
            </div>
            <div className="mensagens-contexto-campo amplo">
              <span>Próxima ação</span>
              {proxima ? (
                <button type="button" onClick={() => abrirModal("agenda", proxima.id)}>
                  <strong>{proxima.title}</strong>
                  <small>{fmtDate(proxima.date)}{proxima.hora ? ` às ${proxima.hora}` : ""}</small>
                </button>
              ) : <small>Nenhum compromisso futuro</small>}
            </div>
            <div className="mensagens-contexto-campo amplo">
              <span>Último contato</span>
              <strong>{fmtDate(conversa.ultima.dia)}{horaMensagem(conversa.ultima.data) ? ` às ${horaMensagem(conversa.ultima.data)}` : ""}</strong>
            </div>
          </div>
        </section>
      </div>
      <div className="mensagens-contexto-acoes">
        <button type="button" onClick={() => abrirModal("imovel", imovel.id)}>
          <Icone nome="externo" tamanho={17} />Abrir imóvel
        </button>
        <button type="button" onClick={() => abrirModal("agenda", undefined, undefined, imovel.id)}>
          <Icone nome="agenda" tamanho={17} />Agendar follow-up
        </button>
      </div>
    </aside>
  );
}

function ConversaSelecionada({
  conversa,
  aoVoltar,
  aoAbrirContexto,
}: {
  conversa: ConversaImovel;
  aoVoltar: () => void;
  aoAbrirContexto: () => void;
}) {
  const abrirModal = useUiModal((estado) => estado.abrirModal);
  const whatsapp = linkWhatsapp(conversa.imovel, "");
  return (
    <section className="mensagens-conversa" aria-label={`Conversa com ${nomeConversa(conversa.imovel)}`}>
      <header className="mensagens-conversa-head">
        <button type="button" className="mensagens-voltar" onClick={aoVoltar} aria-label="Voltar para conversas">
          <Icone nome="voltar" />
        </button>
        <span className="mensagens-avatar">{iniciais(nomeConversa(conversa.imovel))}</span>
        <div className="mensagens-conversa-identidade">
          <strong>{nomeConversa(conversa.imovel)}</strong>
          <span>
            {codigoImovel(conversa.imovel)}
            {conversa.imovel.bairro
              ? ` · ${conversa.imovel.bairro}`
              : conversa.imovel.edificio
                ? ` · ${conversa.imovel.edificio}`
                : ""}
          </span>
        </div>
        <span className={`mensagens-estado${conversa.naoLidas > 0 ? " novo" : ""}`}>{estadoConversa(conversa)}</span>
        <div className="mensagens-responsavel">
          <Icone nome="pessoa" tamanho={16} />
          <span>{conversa.imovel.responsavel || "Não atribuído"}</span>
        </div>
        <button type="button" className="mensagens-contexto-toggle" onClick={aoAbrirContexto} aria-label="Abrir contexto do imóvel">
          <Icone nome="imovel" tamanho={18} /><span>Contexto</span>
        </button>
        <div className="mensagens-head-menu">
          {whatsapp ? (
            <a href={whatsapp} target="_blank" rel="noreferrer" title="Abrir conversa no WhatsApp">
              <Icone nome="whatsapp" tamanho={18} />
            </a>
          ) : null}
          <button type="button" onClick={() => abrirModal("imovel", conversa.imovel.id)} title="Abrir imóvel">
            <Icone nome="menu" tamanho={19} />
          </button>
        </div>
      </header>
      <Timeline conversa={conversa} aoAbrirWhatsapp={() => whatsapp && window.open(whatsapp, "_blank", "noopener")} />
      <Compositor key={conversa.imovel.id} conversa={conversa} />
    </section>
  );
}

export default function CentralMensagensView({ aoAbrirAgendadas }: { aoAbrirAgendadas: () => void }) {
  const imoveis = useAppStore((estado) => estado.imoveis);
  const agenda = useAppStore((estado) => estado.agenda);
  const carregado = useAppStore((estado) => estado.carregado);
  const { usuario } = useSessao();
  const {
    itens: mensagensAgendadas,
    carregando: carregandoAgendadas,
    erro: erroAgendadas,
    recarregar: recarregarAgendadas,
  } = useMensagensAgendadas();
  const [busca, setBusca] = useState("");
  const buscaAdiada = useDeferredValue(busca);
  const [filtros, setFiltros] = useState<FiltrosConversas>(FILTROS_INICIAIS);
  const [selecionadaId, setSelecionadaId] = useState<string | null>(null);
  const [atualizando, setAtualizando] = useState(false);
  const [erro, setErro] = useState("");
  const [mobileAberta, setMobileAberta] = useState(false);
  const [contextoAberto, setContextoAberto] = useState(false);

  const conversas = useMemo(() => conversasDosImoveis(imoveis, todayISO()), [imoveis]);
  const agendadasPorImovel = useMemo(
    () => imoveisComAgendamentoAtivo(mensagensAgendadas),
    [mensagensAgendadas],
  );
  const visiveis = useMemo(
    () => filtrarConversas(conversas, buscaAdiada, filtros, agendadasPorImovel),
    [conversas, buscaAdiada, filtros, agendadasPorImovel],
  );
  const contagens = useMemo(
    () => contagensConversas(conversas, buscaAdiada, filtros, agendadasPorImovel),
    [conversas, buscaAdiada, filtros, agendadasPorImovel],
  );
  const selecionada = visiveis.find((conversa) => conversa.imovel.id === selecionadaId) || visiveis[0] || null;

  async function atualizar() {
    if (atualizando) return;
    setAtualizando(true);
    setErro("");
    try {
      await Promise.all([recarregarEstado(), recarregarAgendadas(true)]);
    } catch {
      setErro("Não foi possível atualizar as conversas.");
    } finally {
      setAtualizando(false);
    }
  }

  function selecionar(id: string) {
    setSelecionadaId(id);
    setMobileAberta(true);
    setContextoAberto(false);
  }

  if (!carregado) {
    return (
      <div className="mensagens-central carregando" aria-busy="true" aria-label="Carregando mensagens">
        <div className="mensagens-skeleton lista" />
        <div className="mensagens-skeleton conversa" />
        <div className="mensagens-skeleton contexto" />
      </div>
    );
  }

  const erroLista = filtros.agendadas && erroAgendadas ? erroAgendadas : erro;
  return (
    <div
      className={`mensagens-central${mobileAberta ? " mobile-conversa-aberta" : ""}${contextoAberto ? " contexto-aberto" : ""}`}
      data-pagina="mensagens"
    >
      <ListaConversas
        conversas={visiveis}
        selecionadaId={selecionada?.imovel.id || null}
        busca={busca}
        filtros={filtros}
        contagens={contagens}
        atualizando={atualizando}
        carregandoFiltro={filtros.agendadas && carregandoAgendadas}
        erro={erroLista}
        aoBuscar={setBusca}
        aoFiltrarPrincipal={(principal) => setFiltros((atuais) => ({ ...atuais, principal }))}
        aoAlternarNaoLidas={() => setFiltros((atuais) => ({ ...atuais, naoLidas: !atuais.naoLidas }))}
        aoAlternarAgendadas={() => setFiltros((atuais) => ({ ...atuais, agendadas: !atuais.agendadas }))}
        aoSelecionar={selecionar}
        aoAtualizar={() => void atualizar()}
        aoAbrirAgendadas={aoAbrirAgendadas}
      />
      {selecionada ? (
        <>
          <ConversaSelecionada
            conversa={selecionada}
            aoVoltar={() => setMobileAberta(false)}
            aoAbrirContexto={() => setContextoAberto(true)}
          />
          <Contexto conversa={selecionada} agenda={agenda} aoFechar={() => setContextoAberto(false)} />
          <button
            type="button"
            className="mensagens-contexto-backdrop"
            onClick={() => setContextoAberto(false)}
            aria-label="Fechar contexto"
          />
        </>
      ) : (
        <div className="mensagens-sem-selecao">
          <span className="mensagens-sem-selecao-icone"><Icone nome="whatsapp" tamanho={28} /></span>
          <strong>Nenhuma conversa disponível</strong>
          <p>Revise os filtros ou aguarde uma nova atividade do WhatsApp.</p>
          <small>Conta: {rotuloUsuario(usuario) || "sessão atual"}</small>
        </div>
      )}
    </div>
  );
}
