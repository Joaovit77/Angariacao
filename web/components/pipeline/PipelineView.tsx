"use client";

/* ================================================================
   VIEW: PIPELINE (Lista / Kanban)
   Port de viewPipelineEnhanced() + renderListaEnhanced() +
   renderKanbanEnhanced() + renderKanbanCard() + renderPipelineDrawer()
   (app.js, seção 5B).

   O debounce da busca do app antigo não foi portado — ele existia só
   para o input não ser recriado a cada tecla pela montagem de HTML por
   string; com input controlado do React o foco nunca se perde.
   ================================================================ */
import { useEffect, useRef, useState } from "react";
import { rotuloUsuario, useSessao } from "@/components/SessaoProvider";
import {
  filtrarImoveis,
  ordenarPipelineLista,
  pipelineColDistinct,
  pipelineUniqueSorted,
  type PipelineCol,
} from "@/lib/calculo/filtros";
import { daysInCurrentStatus, isPausado, isStale } from "@/lib/calculo/motor";
import {
  aplicarModeloUsuario,
  avisoAoSalvarModelo,
  linkWhatsapp,
  MARCADORES_MODELO,
  mensagemWhatsapp,
  MODELOS_WHATSAPP,
  modeloPadraoWhatsapp,
  tokenizarModeloUsuario,
} from "@/lib/calculo/whatsapp";
import { STATUS_ALL, STATUS_COLORS, TIPOS_IMOVEL } from "@/lib/constantes";
import { fmtDate, fmtMoney } from "@/lib/formatadores";
import { adicionarModeloWhatsapp, excluirImovel, removerModeloWhatsapp } from "@/lib/mutacoes";
import { useAppStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import type { Imovel } from "@/lib/tipos";
import { useUiModal } from "@/lib/uiModal";
import { usePipelineUi } from "@/lib/uiPipeline";
import ColunaFiltro from "./ColunaFiltro";

/** Abre o wa.me do proprietário com o modelo preenchido; sem telefone,
    orienta a copiar a mensagem pelo drawer/modal do imóvel. */
function abrirWhatsapp(imovel: Imovel, modeloId: string, nomeCaptador?: string): void {
  const link = linkWhatsapp(imovel, mensagemWhatsapp(modeloId, imovel, nomeCaptador));
  if (link) window.open(link, "_blank", "noopener");
  else toast("Sem telefone cadastrado — abra o imóvel para copiar a mensagem.", "error");
}

/** Ação rápida "Retomar Contato": só para imóveis parados na etapa inicial. */
function precisaRetomarContato(i: Imovel): boolean {
  return i.status === "Novo contato" && isStale(i);
}

function rotuloModelo(id: string): string {
  return MODELOS_WHATSAPP.find((m) => m.id === id)?.rotulo || id;
}

function CartaoKanban({ i, color, aoAbrir }: { i: Imovel; color: string; aoAbrir: (id: string) => void }) {
  const stale = isStale(i);
  const paused = isPausado(i);
  const dias = daysInCurrentStatus(i);

  let metaBadge: React.ReactNode = null;
  if (paused) {
    metaBadge = (
      <span className="kanban-card-days kanban-card-paused">⏸ até {fmtDate(i.pausadoAte)}</span>
    );
  } else if (dias != null) {
    metaBadge = (
      <span className={`kanban-card-days ${stale ? "kanban-card-stale" : ""}`}>
        {stale ? `⚠ ${dias}d parado` : `${dias}d`}
      </span>
    );
  }

  const motivo =
    i.status === "Perdido" || i.status === "Cancelado"
      ? i.motivoPerda
        ? i.motivoPerda === "Outro"
          ? i.motivoPerdaOutro || "Outro motivo"
          : i.motivoPerda
        : null
      : null;

  return (
    <div
      className="kanban-card"
      style={{ "--col-color": color } as React.CSSProperties}
      onClick={() => aoAbrir(i.id)}
    >
      <div className="kanban-card-code">
        {i.codigo || "s/ código"}
        {i.preCadastro && <span className="pre-cadastro-flag">pré-cadastro</span>}
      </div>
      <div className="kanban-card-addr">
        {i.endereco}
        {i.bairro ? `, ${i.bairro}` : ""}
      </div>
      <div className="kanban-card-meta">
        <span className="kanban-card-rent">{fmtMoney(i.valorAluguel)}</span>
        {metaBadge}
      </div>
      {i.imobiliariaConcorrente && (
        <div className="kanban-card-concorrente">🏢 {i.imobiliariaConcorrente}</div>
      )}
      {motivo && <div className="kanban-card-motivo">{motivo}</div>}
      {precisaRetomarContato(i) && (
        <button
          type="button"
          className="btn btn-sm kanban-retomar"
          title="Abrir WhatsApp com a mensagem de retomada de contato"
          onClick={(e) => {
            e.stopPropagation();
            abrirWhatsapp(i, "retomada-contato");
          }}
        >
          ↺ Retomar contato
        </button>
      )}
    </div>
  );
}

function Kanban({ imoveis, aoAbrir }: { imoveis: Imovel[]; aoAbrir: (id: string) => void }) {
  return (
    <div className="kanban">
      {STATUS_ALL.map((status) => {
        const items = imoveis
          .filter((i) => i.status === status)
          .sort((a, b) => (b.dataAngariacao || "").localeCompare(a.dataAngariacao || ""));
        const color = STATUS_COLORS[status] || "#3a4150";
        return (
          <div
            className="kanban-col"
            key={status}
            style={{ "--col-color": color } as React.CSSProperties}
          >
            <div className="kanban-col-head" style={{ "--col-bg": `${color}12` } as React.CSSProperties}>
              <span className="badge" data-status={status}>
                <span className="dot"></span>
                {status}
              </span>
              <span className="kanban-col-count">{items.length}</span>
            </div>
            <div className="kanban-col-body">
              {items.length === 0 ? (
                <div className="kanban-empty">Nenhum imóvel</div>
              ) : (
                items.map((i) => <CartaoKanban key={i.id} i={i} color={color} aoAbrir={aoAbrir} />)
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Cabeçalho "Código" clicável: ordena crescente → decrescente → sem ordenação.
function HeaderCodigo() {
  const { colSort, setColSort, limparColSort } = usePipelineUi();
  const ativo = colSort.key === "codigo";
  const seta = ativo ? (colSort.dir === "desc" ? " ▾" : " ▴") : "";
  function alternar() {
    if (!ativo) setColSort("codigo", "asc");
    else if (colSort.dir === "asc") setColSort("codigo", "desc");
    else limparColSort();
  }
  return (
    <th
      onClick={alternar}
      title="Ordenar por código"
      style={{ cursor: "pointer", userSelect: "none" }}
    >
      Código{seta}
    </th>
  );
}

function Lista({ imoveis, todos }: { imoveis: Imovel[]; todos: Imovel[] }) {
  const { drawerImovelId, abrirDrawer } = usePipelineUi();
  const { usuario } = useSessao();
  const nomeCaptador = rotuloUsuario(usuario);

  if (imoveis.length === 0) {
    return (
      <div className="empty-state card">
        <h3>Nenhum imóvel encontrado</h3>
        <p>Ajuste os filtros ou cadastre uma nova angariação.</p>
      </div>
    );
  }

  const distintos = (col: PipelineCol) => pipelineColDistinct(todos, col);

  return (
    <div className="card table-scroll pipeline-list-card">
      <table>
        <thead>
          <tr>
            <HeaderCodigo />
            <th>Endereço</th>
            <ColunaFiltro col="bairro" distintos={distintos("bairro")} />
            <ColunaFiltro col="tipo" distintos={distintos("tipo")} />
            <ColunaFiltro col="origem" distintos={distintos("origem")} />
            <th>Aluguel</th>
            <ColunaFiltro col="status" distintos={distintos("status")} />
            <th>Cadastro</th>
            <ColunaFiltro col="captador" distintos={distintos("captador")} />
            <th></th>
          </tr>
        </thead>
        <tbody>
          {imoveis.map((i) => (
            <tr
              key={i.id}
              className={`pipeline-list-row ${drawerImovelId === i.id ? "selected" : ""}`}
              onClick={() => abrirDrawer(i.id)}
            >
              <td className="cell-strong">
                {i.codigo || "-"}
                {i.preCadastro && <span className="pre-cadastro-flag">pré-cadastro</span>}
              </td>
              <td>{i.endereco || "-"}</td>
              <td className="cell-dim">{i.bairro || "-"}</td>
              <td className="cell-dim">{i.tipo || "-"}</td>
              <td className="cell-dim">{i.origemImovel || "-"}</td>
              <td>{fmtMoney(i.valorAluguel)}</td>
              <td>
                <span className="badge" data-status={i.status}>
                  <span className="dot"></span>
                  {i.status || "-"}
                </span>{" "}
                {isStale(i) && <span className="stale-flag">parado</span>}
              </td>
              <td className="cell-dim">{fmtDate(i.dataAngariacao)}</td>
              <td className="cell-dim">{i.responsavel || "-"}</td>
              <td>
                <div className="row-actions">
                  {precisaRetomarContato(i) && (
                    <button
                      type="button"
                      className="icon-btn retomar"
                      title="Retomar contato: abrir WhatsApp com a mensagem de retomada"
                      onClick={(e) => {
                        e.stopPropagation();
                        abrirWhatsapp(i, "retomada-contato");
                      }}
                    >
                      ↺
                    </button>
                  )}
                  {/* O modelo acompanha a etapa do imóvel no funil — mesma regra
                      do drawer (modeloPadraoWhatsapp). */}
                  <button
                    type="button"
                    className="icon-btn whatsapp"
                    title={`WhatsApp: ${rotuloModelo(modeloPadraoWhatsapp(i.status))}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      abrirWhatsapp(i, modeloPadraoWhatsapp(i.status), nomeCaptador);
                    }}
                  >
                    💬
                  </button>
                  <button
                    type="button"
                    className="icon-btn btn-danger"
                    title="Excluir"
                    onClick={(e) => {
                      e.stopPropagation();
                      excluirImovel(i.id);
                    }}
                  >
                    ×
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function InfoDrawer({ label, value }: { label: string; value: string }) {
  return (
    <div className="drawer-info-item">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

// Item "WhatsApp" do roadmap na versão sem API: modelo por etapa do funil,
// prévia editável e envio via link wa.me (click-to-chat). O componente é
// montado com key={imovel.id} para trocar de imóvel descartar edições.
function DrawerWhatsapp({ imovel, nomeCaptador }: { imovel: Imovel; nomeCaptador?: string }) {
  const { usuario } = useSessao();
  const config = useAppStore((s) => s.config);
  const modelosUsuario = config.whatsappModelos || [];
  const padrao = modeloPadraoWhatsapp(imovel.status);
  const [modeloId, setModeloId] = useState(padrao);
  const [texto, setTexto] = useState(() => mensagemWhatsapp(padrao, imovel, nomeCaptador));
  const [salvarAberto, setSalvarAberto] = useState(false);
  const [nomeNovo, setNomeNovo] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const link = linkWhatsapp(imovel, texto);
  const modeloCustomSel = modelosUsuario.find((m) => m.id === modeloId) || null;

  function trocarModelo(id: string) {
    setModeloId(id);
    const custom = modelosUsuario.find((m) => m.id === id);
    setTexto(custom ? aplicarModeloUsuario(custom.texto, imovel) : mensagemWhatsapp(id, imovel, nomeCaptador));
  }

  async function salvarModelo() {
    if (!usuario) return;
    const nome = nomeNovo.trim();
    if (!nome) {
      toast("Dê um nome ao modelo.", "error");
      return;
    }
    if (modelosUsuario.some((m) => m.nome.toLowerCase() === nome.toLowerCase())) {
      toast("Já existe um modelo com esse nome.", "error");
      return;
    }
    const tokenizado = tokenizarModeloUsuario(texto, imovel);
    const aviso = avisoAoSalvarModelo(tokenizado);
    const novo = await adicionarModeloWhatsapp(nome, tokenizado, config, usuario.id, "");
    if (novo) {
      toast(aviso.mensagem, aviso.ok ? "success" : "warning");
      setModeloId(novo.id);
      setNomeNovo("");
      setSalvarAberto(false);
    }
  }

  async function excluirModelo() {
    if (!usuario || !modeloCustomSel) return;
    const ok = await removerModeloWhatsapp(modeloCustomSel.id, config, usuario.id);
    if (ok) {
      setModeloId(padrao);
      setTexto(mensagemWhatsapp(padrao, imovel, nomeCaptador));
    }
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(texto);
      toast("Mensagem copiada.");
    } catch {
      const el = textareaRef.current;
      if (!el) return;
      el.focus();
      el.select();
      document.execCommand("copy");
      toast("Mensagem copiada.");
    }
  }

  /** Insere um marcador ({nome}/{endereco}) na posição do cursor do textarea. */
  function inserirMarcador(token: string) {
    const el = textareaRef.current;
    const start = el?.selectionStart ?? texto.length;
    const end = el?.selectionEnd ?? texto.length;
    setTexto(texto.slice(0, start) + token + texto.slice(end));
    if (el) {
      requestAnimationFrame(() => {
        el.focus();
        const pos = start + token.length;
        el.setSelectionRange(pos, pos);
      });
    }
  }

  return (
    <div className="drawer-section">
      <div className="drawer-section-title">Mensagem de WhatsApp</div>
      <div style={{ display: "flex", gap: "8px", marginBottom: "8px" }}>
        <select
          aria-label="Modelo de mensagem"
          value={modeloId}
          onChange={(e) => trocarModelo(e.target.value)}
          style={{ flex: 1 }}
        >
          {MODELOS_WHATSAPP.map((m) => (
            <option key={m.id} value={m.id}>
              {m.rotulo}
            </option>
          ))}
          {modelosUsuario.length > 0 && (
            <optgroup label="Meus modelos">
              {modelosUsuario.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.nome}
                </option>
              ))}
            </optgroup>
          )}
        </select>
        {modeloCustomSel && (
          <button type="button" className="btn btn-sm btn-ghost btn-danger" onClick={excluirModelo}>
            Excluir
          </button>
        )}
      </div>
      <textarea
        ref={textareaRef}
        aria-label="Prévia da mensagem"
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        style={{ width: "100%", minHeight: "160px", marginBottom: "8px" }}
      />
      <div className="marcadores-modelo">
        <span>Inserir marcador:</span>
        {MARCADORES_MODELO.map((m) => (
          <button
            key={m.token}
            type="button"
            className="chip-marcador"
            title={`${m.rotulo} — adapta-se a cada imóvel`}
            onClick={() => inserirMarcador(m.token)}
          >
            {m.token}
          </button>
        ))}
      </div>
      {salvarAberto ? (
        <div style={{ display: "flex", gap: "8px", marginBottom: "8px" }}>
          <input
            type="text"
            value={nomeNovo}
            onChange={(e) => setNomeNovo(e.target.value)}
            placeholder="Nome do modelo (ex: Falar mais tarde)"
            style={{ flex: 1 }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                salvarModelo();
              }
            }}
          />
          <button type="button" className="btn btn-sm btn-primary" onClick={salvarModelo}>
            Salvar
          </button>
          <button type="button" className="btn btn-sm" onClick={() => setSalvarAberto(false)}>
            Cancelar
          </button>
        </div>
      ) : (
        <button
          type="button"
          className="btn btn-sm btn-ghost"
          style={{ marginBottom: "8px" }}
          onClick={() => setSalvarAberto(true)}
        >
          + Salvar como modelo
        </button>
      )}
      {!link && (
        <p className="section-note" style={{ marginBottom: "8px" }}>
          Sem telefone cadastrado — copie a mensagem para enviar manualmente.
        </p>
      )}
      <div style={{ display: "flex", gap: "10px", justifyContent: "flex-end" }}>
        <button type="button" className="btn btn-sm" onClick={copiar}>
          Copiar mensagem
        </button>
        {link && (
          <button
            type="button"
            className="btn btn-sm btn-ghost agenda-whatsapp-btn"
            onClick={() => window.open(link, "_blank", "noopener")}
          >
            Enviar WhatsApp
          </button>
        )}
      </div>
    </div>
  );
}

function Drawer({ imovel }: { imovel: Imovel }) {
  const fecharDrawer = usePipelineUi((s) => s.fecharDrawer);
  const abrirModal = useUiModal((s) => s.abrirModal);
  const { usuario } = useSessao();
  const enderecoCompleto = [imovel.endereco, imovel.bairro, imovel.cidade].filter(Boolean).join(", ");
  const totalNotas = (imovel.notas || []).length;

  return (
    <>
      <div className="pipeline-drawer-backdrop" onClick={fecharDrawer}></div>
      <aside className="pipeline-drawer" aria-label="Detalhes do imovel">
        <div className="pipeline-drawer-head">
          <div>
            <div className="pipeline-drawer-kicker">Imóvel selecionado</div>
            <h2>{imovel.codigo || "Sem codigo"}</h2>
          </div>
          <button type="button" className="icon-btn" onClick={fecharDrawer} title="Fechar painel">
            ×
          </button>
        </div>
        <div className="pipeline-drawer-body">
          <div className="drawer-status-line">
            <span className="badge" data-status={imovel.status}>
              <span className="dot"></span>
              {imovel.status || "-"}
            </span>
            {isStale(imovel) && <span className="stale-flag">parado</span>}
          </div>
          <div className="drawer-info-grid">
            <InfoDrawer label="Codigo" value={imovel.codigo || "-"} />
            <InfoDrawer label="Referência CRM" value={imovel.referenciaCrm || "-"} />
            <InfoDrawer label="Proprietario" value={imovel.proprietarioNome || "-"} />
            <InfoDrawer label="Telefones" value={imovel.proprietarioTelefone || "-"} />
            <InfoDrawer label="Endereco completo" value={enderecoCompleto || "-"} />
            <InfoDrawer label="Bairro" value={imovel.bairro || "-"} />
            <InfoDrawer label="Cidade" value={imovel.cidade || "-"} />
            <InfoDrawer label="Tipo" value={imovel.tipo || "-"} />
            <InfoDrawer label="Valor" value={fmtMoney(imovel.valorAluguel)} />
            <InfoDrawer label="Status" value={imovel.status || "-"} />
            <InfoDrawer label="Data de cadastro" value={fmtDate(imovel.dataAngariacao)} />
          </div>
          <div className="drawer-section">
            <div className="drawer-section-title">Observacoes</div>
            <div className="drawer-notes">{imovel.observacoes || "Sem observacoes cadastradas."}</div>
          </div>
          <div className="drawer-section">
            <div className="drawer-section-title">Histórico de interações</div>
            <div className="drawer-notas-resumo">
              <span className="drawer-notes">
                {totalNotas === 0
                  ? "Nenhuma nota registrada ainda."
                  : `${totalNotas} nota(s) registrada(s).`}
              </span>
              {/* O modal abre por cima do drawer (z-index maior); Esc fecha os dois,
                  comportamento pré-existente do ModalOverlay. */}
              <button type="button" className="btn btn-sm" onClick={() => abrirModal("notas", imovel.id)}>
                Ver / adicionar notas
              </button>
            </div>
          </div>
          {/* A seção "Fotos" do app antigo lia imovel.fotos, campo que nenhum
              mapeador produz — sempre mostrava "Sem fotos cadastradas.". Removida
              na pós-migração (achado A2) por ser bloco morto. */}
          <DrawerWhatsapp key={imovel.id} imovel={imovel} nomeCaptador={rotuloUsuario(usuario)} />
        </div>
        <div className="pipeline-drawer-foot">
          <button type="button" className="btn btn-ghost" onClick={fecharDrawer}>
            Fechar painel
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-danger"
            onClick={async () => {
              const ok = await excluirImovel(imovel.id);
              if (ok) fecharDrawer();
            }}
          >
            Excluir
          </button>
          <button type="button" className="btn btn-primary" onClick={() => abrirModal("imovel", imovel.id)}>
            Editar
          </button>
        </div>
      </aside>
    </>
  );
}

export default function PipelineView() {
  const imoveis = useAppStore((s) => s.imoveis);
  const abrirModal = useUiModal((s) => s.abrirModal);
  const { filters, viewMode, colFilters, colSort, openCol, drawerImovelId, setFiltro, setViewMode, fecharColMenu } =
    usePipelineUi();

  // Um único listener de documento fecha o dropdown de coluna aberto ao clicar
  // fora ou apertar Esc (equivale ao afterRenderPipeline() do app antigo; o
  // cleanup do efeito faz o papel do removeEventListener no renderCurrentView).
  useEffect(() => {
    if (!openCol) return;
    const aoClicar = (e: MouseEvent) => {
      const alvo = e.target as HTMLElement;
      if (!alvo.closest(".col-menu") && !alvo.closest(".col-funnel-btn")) fecharColMenu();
    };
    const aoTeclar = (e: KeyboardEvent) => {
      if (e.key === "Escape") fecharColMenu();
    };
    document.addEventListener("click", aoClicar);
    document.addEventListener("keydown", aoTeclar);
    return () => {
      document.removeEventListener("click", aoClicar);
      document.removeEventListener("keydown", aoTeclar);
    };
  }, [openCol, fecharColMenu]);

  const bairros = pipelineUniqueSorted(imoveis.map((i) => i.bairro));
  const cidades = pipelineUniqueSorted(imoveis.map((i) => i.cidade));
  const responsaveis = pipelineUniqueSorted(imoveis.map((i) => i.responsavel));
  const filtrados = filtrarImoveis(imoveis, filters, viewMode, colFilters);
  const drawerImovel =
    viewMode === "lista" && drawerImovelId ? imoveis.find((i) => i.id === drawerImovelId) : null;

  return (
    <>
      <div className="page-head">
        <div>
          <p className="page-sub">{imoveis.length} imóveis cadastrados</p>
        </div>
        <div className="page-actions">
          <button type="button" className="btn" onClick={() => abrirModal("preCadastro")}>
            ⚡ Pré-cadastro rápido
          </button>
          <button type="button" className="btn btn-primary" onClick={() => abrirModal("imovel")}>
            + Nova angariação
          </button>
        </div>
      </div>

      <div className="pipeline-toolbar pipeline-toolbar-enhanced">
        <div className={`pipeline-filterbar ${viewMode === "lista" ? "lista" : ""}`}>
          <input
            type="text"
            className="search-input pipeline-search"
            placeholder="Buscar por código, proprietário, endereço, bairro, cidade, telefone ou tipo..."
            value={filters.search}
            onChange={(e) => setFiltro("search", e.target.value)}
          />
          {viewMode === "kanban" && (
            <>
              <select
                className="filter-select"
                value={filters.tipo}
                onChange={(e) => setFiltro("tipo", e.target.value)}
              >
                <option value="">Todos os tipos</option>
                {TIPOS_IMOVEL.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
              <select
                className="filter-select"
                value={filters.bairro}
                onChange={(e) => setFiltro("bairro", e.target.value)}
              >
                <option value="">Todos os bairros</option>
                {bairros.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
              <select
                className="filter-select"
                value={filters.status}
                onChange={(e) => setFiltro("status", e.target.value)}
              >
                <option value="">Todos os status</option>
                {STATUS_ALL.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
              <select
                className="filter-select"
                value={filters.responsavel}
                onChange={(e) => setFiltro("responsavel", e.target.value)}
              >
                <option value="">Todos os captadores</option>
                {responsaveis.map((r) => (
                  <option key={r} value={r}>
                    {r}
                  </option>
                ))}
              </select>
            </>
          )}
          <select
            className="filter-select"
            value={filters.cidade}
            onChange={(e) => setFiltro("cidade", e.target.value)}
          >
            <option value="">Todas as cidades</option>
            {cidades.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </div>
        <div className="pipeline-toolbar-side">
          <span className="pipeline-result-count" id="pipeline-result-count">
            {filtrados.length} de {imoveis.length}
          </span>
          <div className="view-toggle">
            <button
              type="button"
              className={viewMode === "lista" ? "active" : ""}
              onClick={() => setViewMode("lista")}
            >
              Lista
            </button>
            <button
              type="button"
              className={viewMode === "kanban" ? "active" : ""}
              onClick={() => setViewMode("kanban")}
            >
              Kanban
            </button>
          </div>
        </div>
      </div>

      <div id="pipeline-results">
        {viewMode === "kanban" ? (
          <Kanban imoveis={filtrados} aoAbrir={(id) => abrirModal("imovel", id)} />
        ) : (
          <Lista imoveis={ordenarPipelineLista(filtrados, colSort)} todos={imoveis} />
        )}
      </div>
      {drawerImovel && <Drawer imovel={drawerImovel} />}
    </>
  );
}
