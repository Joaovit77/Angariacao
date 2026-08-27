"use client";

import { useState } from "react";
import ConexaoGoogle from "@/components/modais/ConexaoGoogle";
import ResumoConexaoWhatsapp from "./ResumoConexaoWhatsapp";
import { useSessao } from "@/components/SessaoProvider";
import {
  COMISSAO_PERCENT_PADRAO,
  origensAprendidas,
  origensDoUsuario,
  tiposAgendaAprendidos,
  tiposAgendaDoUsuario,
} from "@/lib/configuracaoUsuario";
import { AGENDA_TYPES, ORIGENS_IMOVEL } from "@/lib/constantes";
import { getSupabase } from "@/lib/persistencia/supabase";
import {
  apagarTodosOsDados,
  carregarDadosDemo,
  numOrNull,
  salvarConfig,
} from "@/lib/mutacoes";
import { chaveNormalizada } from "@/lib/normalizacao";
import {
  textoParaExpressoes,
  type PerfilComunicacao,
} from "@/lib/perfilComunicacao";
import { useAppStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import { useUiModal } from "@/lib/uiModal";

type Secao = "geral" | "ia" | "agenda" | "prospeccao" | "whatsapp" | "conta" | "dados";

const SECOES: Array<{ id: Secao; titulo: string; descricao: string }> = [
  { id: "geral", titulo: "Geral", descricao: "Empresa e comissão" },
  { id: "ia", titulo: "IA e escrita", descricao: "Tom e vocabulário" },
  { id: "agenda", titulo: "Agenda", descricao: "Google e compromissos" },
  { id: "prospeccao", titulo: "Prospecção", descricao: "Portais e abordagens" },
  { id: "whatsapp", titulo: "WhatsApp", descricao: "Estado da conexão" },
  { id: "conta", titulo: "Conta", descricao: "Acesso e transferência" },
  { id: "dados", titulo: "Dados", descricao: "Importação e exclusão" },
];

function ehSecao(valor: string | undefined): valor is Secao {
  return SECOES.some((secao) => secao.id === valor);
}

function listasIguais(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((valor, indice) => valor === b[indice]);
}

function CabecalhoSecao({ titulo, descricao }: { titulo: string; descricao: string }) {
  return (
    <div className="config-secao-head">
      <h2>{titulo}</h2>
      <p>{descricao}</p>
    </div>
  );
}

function AcaoSalvar({
  alterado,
  salvando,
  aoSalvar,
}: {
  alterado: boolean;
  salvando: boolean;
  aoSalvar: () => void;
}) {
  if (!alterado) return null;
  return (
    <div className="config-salvar">
      <span>Há alterações ainda não salvas.</span>
      <button type="button" className="btn btn-primary" onClick={aoSalvar} disabled={salvando}>
        {salvando ? "Salvando…" : "Salvar alterações"}
      </button>
    </div>
  );
}

export default function ConfiguracoesView({ secaoInicial }: { secaoInicial?: string }) {
  const { usuario } = useSessao();
  const config = useAppStore((estado) => estado.config);
  const agenda = useAppStore((estado) => estado.agenda);
  const imoveis = useAppStore((estado) => estado.imoveis);
  const totalAbordagens = useAppStore((estado) => estado.abordagens.length);
  const abrirModal = useUiModal((estado) => estado.abrirModal);

  const [secao, setSecao] = useState<Secao>(ehSecao(secaoInicial) ? secaoInicial : "geral");
  const [comissao, setComissao] = useState(String(config.comissaoPercent));
  const [empresa, setEmpresa] = useState(config.empresa || "");
  const [dadosPagamento, setDadosPagamento] = useState(config.dadosPagamento || "");
  const [perfil, setPerfil] = useState<PerfilComunicacao>(config.perfilComunicacao);
  const [expressoesPreferidas, setExpressoesPreferidas] = useState(
    config.perfilComunicacao.expressoesPreferidas.join("\n"),
  );
  const [expressoesEvitar, setExpressoesEvitar] = useState(
    config.perfilComunicacao.expressoesEvitar.join("\n"),
  );
  const [tipos, setTipos] = useState<string[]>(config.agendaTipos ?? []);
  const [novoTipo, setNovoTipo] = useState("");
  const [portais, setPortais] = useState<string[]>(config.origensExtras ?? []);
  const [novoPortal, setNovoPortal] = useState("");
  const [ocupado, setOcupado] = useState<string | null>(null);

  const tiposAprendidos = tiposAgendaAprendidos(agenda, tipos);
  const portaisAprendidos = origensAprendidas(imoveis, portais);
  const comissaoNormalizada = numOrNull(comissao) ?? COMISSAO_PERCENT_PADRAO;
  const perfilNormalizado: PerfilComunicacao = {
    ...perfil,
    expressoesPreferidas: textoParaExpressoes(expressoesPreferidas),
    expressoesEvitar: textoParaExpressoes(expressoesEvitar),
  };

  const geralAlterado =
    comissaoNormalizada !== config.comissaoPercent || empresa.trim() !== config.empresa;
  const iaAlterada = JSON.stringify(perfilNormalizado) !== JSON.stringify(config.perfilComunicacao);
  const agendaAlterada = !listasIguais(tipos, config.agendaTipos);
  const prospeccaoAlterada = !listasIguais(portais, config.origensExtras);
  const contaAlterada = dadosPagamento.trim() !== config.dadosPagamento;

  async function salvarSecao(id: Secao) {
    if (!usuario || ocupado) return;
    setOcupado(id);
    const parcial =
      id === "geral"
        ? { comissaoPercent: comissaoNormalizada, empresa: empresa.trim() }
        : id === "ia"
          ? { perfilComunicacao: perfilNormalizado }
          : id === "agenda"
            ? { agendaTipos: tipos }
            : id === "prospeccao"
              ? { origensExtras: portais }
              : id === "conta"
                ? { dadosPagamento: dadosPagamento.trim() }
                : {};
    await salvarConfig({ ...config, ...parcial }, usuario.id, "Alterações salvas.");
    setOcupado(null);
  }

  function adicionarTipo() {
    const valor = novoTipo.trim();
    if (!valor) return;
    const existe = tiposAgendaDoUsuario(tipos, agenda).some(
      (item) => chaveNormalizada(item) === chaveNormalizada(valor),
    );
    if (existe) return toast("Esse tipo já existe.", "error");
    setTipos([...tipos, valor]);
    setNovoTipo("");
  }

  function adicionarPortal() {
    const valor = novoPortal.trim();
    if (!valor) return;
    const existe = origensDoUsuario(portais, imoveis).some(
      (item) => chaveNormalizada(item) === chaveNormalizada(valor),
    );
    if (existe) return toast("Esse portal já existe.", "error");
    setPortais([...portais, valor]);
    setNovoPortal("");
  }

  async function carregarExemplos() {
    if (!usuario || ocupado) return;
    setOcupado("demo");
    await carregarDadosDemo(usuario.id);
    setOcupado(null);
  }

  async function apagarDados() {
    if (!usuario || ocupado) return;
    setOcupado("apagar");
    await apagarTodosOsDados(usuario.id);
    setOcupado(null);
  }

  return (
    <>
      <div className="page-head config-page-head">
        <div>
          <h1 className="page-title">Configurações</h1>
          <p className="page-sub">Gerencie preferências, integrações e dados do sistema.</p>
        </div>
      </div>

      <div className="config-mobile-nav">
        <label htmlFor="config-secao">Seção</label>
        <select id="config-secao" value={secao} onChange={(evento) => setSecao(evento.target.value as Secao)}>
          {SECOES.map((item) => (
            <option key={item.id} value={item.id}>{item.titulo}</option>
          ))}
        </select>
      </div>

      <div className="config-layout">
        <nav className="config-nav" aria-label="Seções das configurações">
          {SECOES.map((item) => (
            <button
              key={item.id}
              type="button"
              className={secao === item.id ? "ativo" : ""}
              aria-current={secao === item.id ? "page" : undefined}
              onClick={() => setSecao(item.id)}
            >
              <strong>{item.titulo}</strong>
              <span>{item.descricao}</span>
            </button>
          ))}
        </nav>

        <section className="config-conteudo" aria-live="polite">
          {secao === "geral" && (
            <>
              <CabecalhoSecao titulo="Geral" descricao="Preferências usadas nos cálculos e nas comunicações." />
              <div className="config-bloco">
                <div className="config-campo-cabecalho">
                  <label htmlFor="config-empresa">Empresa / imobiliária</label>
                  <p>Esse nome pode aparecer nas sugestões e abordagens da IA.</p>
                </div>
                <input id="config-empresa" type="text" value={empresa} onChange={(evento) => setEmpresa(evento.target.value)} placeholder="Ex.: Imobiliária Atual" />
              </div>
              <div className="config-bloco">
                <div className="config-campo-cabecalho">
                  <label htmlFor="config-comissao">Comissão padrão</label>
                  <p>Percentual utilizado nos cálculos estimados de comissão.</p>
                </div>
                <div className="config-percentual">
                  <input id="config-comissao" type="number" min="0" step="1" value={comissao} onChange={(evento) => setComissao(evento.target.value)} />
                  <span aria-hidden="true">%</span>
                </div>
              </div>
              <AcaoSalvar alterado={geralAlterado} salvando={ocupado === "geral"} aoSalvar={() => void salvarSecao("geral")} />
            </>
          )}

          {secao === "ia" && (
            <>
              <CabecalhoSecao titulo="IA e escrita" descricao="Defina como as sugestões devem soar sem alterar as regras da imobiliária." />
              <div className="config-subtitulo">
                <h3>Como a IA deve escrever</h3>
              </div>
              <div className="config-grid-campos">
                <label>Tom
                  <select value={perfil.formalidade} onChange={(evento) => setPerfil({ ...perfil, formalidade: evento.target.value as PerfilComunicacao["formalidade"] })}>
                    <option value="natural">Natural</option><option value="profissional">Profissional</option><option value="informal">Informal</option><option value="consultivo">Consultivo</option>
                  </select>
                </label>
                <label>Tamanho das respostas
                  <select value={perfil.tamanho} onChange={(evento) => setPerfil({ ...perfil, tamanho: evento.target.value as PerfilComunicacao["tamanho"] })}>
                    <option value="curto">Curto</option><option value="medio">Médio</option>
                  </select>
                </label>
                <label>Emojis
                  <select value={perfil.emojis} onChange={(evento) => setPerfil({ ...perfil, emojis: evento.target.value as PerfilComunicacao["emojis"] })}>
                    <option value="nenhum">Nenhum</option><option value="poucos">Poucos</option><option value="moderados">Moderados</option>
                  </select>
                </label>
                <label>Tratamento
                  <select value={perfil.tratamento} onChange={(evento) => setPerfil({ ...perfil, tratamento: evento.target.value as PerfilComunicacao["tratamento"] })}>
                    <option value="voce">Você</option><option value="senhor-senhora">Senhor/Senhora</option><option value="automatico">Automático</option>
                  </select>
                </label>
              </div>
              <div className="config-subtitulo com-divisor"><h3>Vocabulário</h3></div>
              <div className="config-grid-vocabulario">
                <label>Expressões que gosto de usar
                  <textarea rows={5} value={expressoesPreferidas} onChange={(evento) => setExpressoesPreferidas(evento.target.value)} placeholder={"Uma por linha. Ex.:\nPerfeito!\nEntendi!"} />
                </label>
                <label>Expressões que quero evitar
                  <textarea rows={5} value={expressoesEvitar} onChange={(evento) => setExpressoesEvitar(evento.target.value)} placeholder={"Uma por linha. Ex.:\nColoco-me à disposição"} />
                </label>
              </div>
              <AcaoSalvar alterado={iaAlterada} salvando={ocupado === "ia"} aoSalvar={() => void salvarSecao("ia")} />
            </>
          )}

          {secao === "agenda" && (
            <>
              <CabecalhoSecao titulo="Agenda" descricao="Conexão com o Google e tipos usados nos compromissos." />
              <div className="config-integracao-card"><ConexaoGoogle /></div>
              <div className="config-bloco config-lista-bloco">
                <div className="config-campo-cabecalho">
                  <h3>Tipos de compromisso</h3>
                  <p>Os tipos padrão e os já usados continuam disponíveis automaticamente.</p>
                </div>
                <div className="config-chips" aria-label="Tipos padrão">
                  {AGENDA_TYPES.map((tipo) => <span className="config-chip padrao" key={tipo}>{tipo}</span>)}
                  {tipos.map((tipo) => (
                    <span className="config-chip" key={tipo}>{tipo}<button type="button" aria-label={`Remover ${tipo}`} onClick={() => setTipos(tipos.filter((item) => item !== tipo))}>×</button></span>
                  ))}
                  {tiposAprendidos.map((tipo) => <span className="config-chip automatico" title="Reconhecido da sua agenda" key={tipo}>{tipo}<small>automático</small></span>)}
                </div>
                <div className="config-adicionar">
                  <input type="text" value={novoTipo} onChange={(evento) => setNovoTipo(evento.target.value)} onKeyDown={(evento) => { if (evento.key === "Enter") { evento.preventDefault(); adicionarTipo(); } }} placeholder="Novo tipo (ex.: Avaliação)" aria-label="Novo tipo de compromisso" />
                  <button type="button" className="btn" onClick={adicionarTipo}>Adicionar</button>
                </div>
              </div>
              <AcaoSalvar alterado={agendaAlterada} salvando={ocupado === "agenda"} aoSalvar={() => void salvarSecao("agenda")} />
            </>
          )}

          {secao === "prospeccao" && (
            <>
              <CabecalhoSecao titulo="Prospecção" descricao="Organize os canais de busca e os roteiros usados na captação." />
              <div className="config-bloco config-lista-bloco">
                <div className="config-campo-cabecalho"><h3>Portais de prospecção</h3><p>Cadastre somente canais que queira preparar antes do primeiro imóvel.</p></div>
                <div className="config-chips" aria-label="Portais de prospecção">
                  {ORIGENS_IMOVEL.map((portal) => <span className="config-chip padrao" key={portal}>{portal}</span>)}
                  {portais.map((portal) => <span className="config-chip" key={portal}>{portal}<button type="button" aria-label={`Remover ${portal}`} onClick={() => setPortais(portais.filter((item) => item !== portal))}>×</button></span>)}
                  {portaisAprendidos.map((portal) => <span className="config-chip automatico" title="Reconhecido da sua carteira" key={portal}>{portal}<small>automático</small></span>)}
                </div>
                <div className="config-adicionar">
                  <input type="text" value={novoPortal} onChange={(evento) => setNovoPortal(evento.target.value)} onKeyDown={(evento) => { if (evento.key === "Enter") { evento.preventDefault(); adicionarPortal(); } }} placeholder="Novo portal (ex.: Marketplace)" aria-label="Novo portal de prospecção" />
                  <button type="button" className="btn" onClick={adicionarPortal}>Adicionar</button>
                </div>
              </div>
              <div className="config-bloco config-resumo-acao">
                <div><h3>Abordagens de captação</h3><p>A IA utiliza esses roteiros para sugerir mensagens e comparar resultados.{totalAbordagens > 0 && ` ${totalAbordagens} cadastrada(s).`}</p></div>
                <button type="button" className="btn" onClick={() => abrirModal("abordagens")}>Gerenciar abordagens</button>
              </div>
              <AcaoSalvar alterado={prospeccaoAlterada} salvando={ocupado === "prospeccao"} aoSalvar={() => void salvarSecao("prospeccao")} />
            </>
          )}

          {secao === "whatsapp" && (
            <>
              <CabecalhoSecao titulo="WhatsApp" descricao="Acompanhe o número usado para enviar e receber mensagens." />
              <div className="config-integracao-card"><ResumoConexaoWhatsapp /></div>
            </>
          )}

          {secao === "conta" && (
            <>
              <CabecalhoSecao titulo="Conta" descricao="Informações do acesso atual e dados para repasse de comissão." />
              <div className="config-bloco config-conta-identidade">
                <div><span>E-mail</span><strong>{usuario?.email || "E-mail não disponível"}</strong></div>
                <button type="button" className="btn btn-sm" onClick={() => void getSupabase().auth.signOut()}>Sair da conta</button>
              </div>
              <div className="config-bloco">
                <div className="config-campo-cabecalho"><label htmlFor="config-pagamento">Conta ou PIX para transferência</label><p>Usado na solicitação de angariação enviada ao financeiro da imobiliária.</p></div>
                <input id="config-pagamento" type="text" value={dadosPagamento} onChange={(evento) => setDadosPagamento(evento.target.value)} placeholder="Ex.: chave PIX ou agência e conta" />
              </div>
              <AcaoSalvar alterado={contaAlterada} salvando={ocupado === "conta"} aoSalvar={() => void salvarSecao("conta")} />
            </>
          )}

          {secao === "dados" && (
            <>
              <CabecalhoSecao titulo="Dados" descricao="Importe sua carteira ou gerencie os dados desta conta." />
              <div className="config-bloco config-resumo-acao">
                <div><h3>Importar carteira</h3><p>Já possui imóveis em uma planilha? Importe sua carteira em CSV.</p></div>
                <button type="button" className="btn" onClick={() => abrirModal("importar")}>Importar CSV</button>
              </div>
              <div className="config-bloco config-resumo-acao">
                <div><h3>Dados de exemplo</h3><p>Adiciona imóveis, metas e compromissos fictícios para explorar o sistema.</p></div>
                <button type="button" className="btn" onClick={() => void carregarExemplos()} disabled={ocupado !== null}>{ocupado === "demo" ? "Carregando…" : "Carregar dados de exemplo"}</button>
              </div>
              <div className="config-zona-perigo">
                <div><span>Zona de perigo</span><h3>Excluir todos os dados</h3><p>Remove permanentemente imóveis, metas, compromissos e abordagens desta conta.</p></div>
                <button type="button" className="btn btn-danger" onClick={() => void apagarDados()} disabled={ocupado !== null}>{ocupado === "apagar" ? "Excluindo…" : "Excluir todos os dados"}</button>
              </div>
            </>
          )}
        </section>
      </div>
    </>
  );
}
