"use client";

/* ================================================================
   MODAL: CONFIGURAÇÕES
   Port de openConfigModal() + saveConfig() + carregarDadosDemo() +
   resetAllData() (app.js, seções 7 e 8).
   ================================================================ */
import { useState } from "react";
import ConexaoGoogle from "@/components/modais/ConexaoGoogle";
import { useSessao } from "@/components/SessaoProvider";
import {
  COMISSAO_PERCENT_PADRAO,
  origensAprendidas,
  origensDoUsuario,
  tiposAgendaAprendidos,
  tiposAgendaDoUsuario,
} from "@/lib/configuracaoUsuario";
import { AGENDA_TYPES, ORIGENS_IMOVEL } from "@/lib/constantes";
import { apagarTodosOsDados, carregarDadosDemo, numOrNull, salvarConfig } from "@/lib/mutacoes";
import { chaveNormalizada } from "@/lib/normalizacao";
import { useAppStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import { useUiModal } from "@/lib/uiModal";

export default function ModalConfig() {
  const fecharModal = useUiModal((s) => s.fecharModal);
  const abrirModal = useUiModal((s) => s.abrirModal);
  const { usuario } = useSessao();
  const config = useAppStore((s) => s.config);
  const agenda = useAppStore((s) => s.agenda);
  const imoveis = useAppStore((s) => s.imoveis);
  const totalAbordagens = useAppStore((s) => s.abordagens.length);

  const [comissao, setComissao] = useState(String(config.comissaoPercent));
  const [empresa, setEmpresa] = useState(config.empresa || "");
  const [dadosPagamento, setDadosPagamento] = useState(config.dadosPagamento || "");
  const [tipos, setTipos] = useState<string[]>(config.agendaTipos ?? []);
  const [novoTipo, setNovoTipo] = useState("");
  const [portais, setPortais] = useState<string[]>(config.origensExtras ?? []);
  const [novoPortal, setNovoPortal] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const tiposAprendidos = tiposAgendaAprendidos(agenda, tipos);
  const portaisAprendidos = origensAprendidas(imoveis, portais);

  function adicionarTipo() {
    const t = novoTipo.trim();
    if (!t) return;
    const jaExiste = tiposAgendaDoUsuario(tipos, agenda)
      .some((x) => chaveNormalizada(x) === chaveNormalizada(t));
    if (jaExiste) {
      toast("Esse tipo já existe.", "error");
      return;
    }
    setTipos([...tipos, t]);
    setNovoTipo("");
  }

  function removerTipo(t: string) {
    setTipos(tipos.filter((x) => x !== t));
  }

  function adicionarPortal() {
    const p = novoPortal.trim();
    if (!p) return;
    const jaExiste = origensDoUsuario(portais, imoveis)
      .some((x) => chaveNormalizada(x) === chaveNormalizada(p));
    if (jaExiste) {
      toast("Esse portal já existe.", "error");
      return;
    }
    setPortais([...portais, p]);
    setNovoPortal("");
  }

  function removerPortal(p: string) {
    setPortais(portais.filter((x) => x !== p));
  }

  async function salvar() {
    if (!usuario) return;
    setOcupado(true);
    const ok = await salvarConfig(
      {
        ...config,
        comissaoPercent: numOrNull(comissao) ?? COMISSAO_PERCENT_PADRAO,
        agendaTipos: tipos,
        empresa: empresa.trim(),
        origensExtras: portais,
        dadosPagamento: dadosPagamento.trim(),
      },
      usuario.id,
    );
    setOcupado(false);
    if (ok) fecharModal();
  }

  async function demo() {
    if (!usuario) return;
    setOcupado(true);
    const ok = await carregarDadosDemo(usuario.id);
    setOcupado(false);
    if (ok) fecharModal();
  }

  async function apagar() {
    if (!usuario) return;
    setOcupado(true);
    const ok = await apagarTodosOsDados(usuario.id);
    setOcupado(false);
    if (ok) fecharModal();
  }

  return (
    <>
      <div className="modal-head">
        <div className="modal-title">Configurações</div>
        <button type="button" className="icon-btn" onClick={fecharModal}>
          ✕
        </button>
      </div>
      <div className="modal-body">
        <div className="field-group">
          <label>Percentual de comissão sobre o aluguel</label>
          <input type="number" min="0" step="1" value={comissao} onChange={(e) => setComissao(e.target.value)} />
          <div className="field-hint">
            100% equivale a 1 mês de aluguel. Usado para calcular a comissão estimada de cada imóvel
            automaticamente.
          </div>
        </div>
        <div className="divider"></div>
        <div className="field-group">
          <label>Empresa / imobiliária</label>
          <input
            type="text"
            value={empresa}
            onChange={(e) => setEmpresa(e.target.value)}
            placeholder="Ex.: Imobiliária Atual"
          />
          <div className="field-hint">
            Entra na apresentação das abordagens sugeridas por IA (&quot;meu nome é X e falo da Y&quot;).
          </div>
        </div>
        <div className="divider"></div>
        <div className="field-group">
          <label>Conta Caixa, Sicredi ou PIX para transferência</label>
          <input
            type="text"
            value={dadosPagamento}
            onChange={(e) => setDadosPagamento(e.target.value)}
            placeholder="Ex.: pix 125.856.399-16"
          />
          <div className="field-hint">
            Entra na solicitação de angariação — o documento de cobrança da comissão que vai para o
            financeiro da imobiliária.
          </div>
        </div>
        <div className="divider"></div>
        <ConexaoGoogle />
        <div className="divider"></div>
        <div className="field-group">
          <label>Tipos de compromisso da agenda</label>
          <div className="field-hint" style={{ marginBottom: "10px" }}>
            O sistema reconhece os tipos já usados na sua agenda. Se quiser deixar um disponível antes
            do primeiro uso, cadastre-o aqui. Tipos padrão: {AGENDA_TYPES.join(", ")}.
          </div>
          {tipos.length > 0 && (
            <div className="config-tipos-lista">
              {tipos.map((t) => (
                <span key={t} className="config-tipo-chip">
                  {t}
                  <button type="button" aria-label={`Remover ${t}`} onClick={() => removerTipo(t)}>
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
          {tiposAprendidos.length > 0 && (
            <div className="config-tipos-lista" aria-label="Tipos reconhecidos automaticamente">
              {tiposAprendidos.map((t) => (
                <span key={t} className="config-tipo-chip config-tipo-chip-automatico" title="Reconhecido da sua agenda">
                  {t}<small>automático</small>
                </span>
              ))}
            </div>
          )}
          <div style={{ display: "flex", gap: "8px" }}>
            <input
              type="text"
              value={novoTipo}
              onChange={(e) => setNovoTipo(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  adicionarTipo();
                }
              }}
              placeholder="Novo tipo (ex.: Avaliação)"
              style={{ flex: 1 }}
            />
            <button type="button" className="btn" onClick={adicionarTipo}>
              Adicionar
            </button>
          </div>
        </div>
        <div className="divider"></div>
        <div className="field-group">
          <label>Portais de prospecção</label>
          <div className="field-hint" style={{ marginBottom: "10px" }}>
            O sistema reconhece os portais já usados na sua carteira e os inclui no cadastro e no Foco
            do dia. Cadastre aqui apenas um canal que queira preparar antes do primeiro imóvel. Padrões:
            {` ${ORIGENS_IMOVEL.join(", ")}`}.
          </div>
          {portais.length > 0 && (
            <div className="config-tipos-lista">
              {portais.map((p) => (
                <span key={p} className="config-tipo-chip">
                  {p}
                  <button type="button" aria-label={`Remover ${p}`} onClick={() => removerPortal(p)}>
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
          {portaisAprendidos.length > 0 && (
            <div className="config-tipos-lista" aria-label="Portais reconhecidos automaticamente">
              {portaisAprendidos.map((p) => (
                <span key={p} className="config-tipo-chip config-tipo-chip-automatico" title="Reconhecido da sua carteira">
                  {p}<small>automático</small>
                </span>
              ))}
            </div>
          )}
          <div style={{ display: "flex", gap: "8px" }}>
            <input
              type="text"
              value={novoPortal}
              onChange={(e) => setNovoPortal(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  adicionarPortal();
                }
              }}
              placeholder="Novo portal (ex.: Marketplace)"
              style={{ flex: 1 }}
            />
            <button type="button" className="btn" onClick={adicionarPortal}>
              Adicionar
            </button>
          </div>
        </div>
        <div className="divider"></div>
        <div className="field-group">
          <label>Abordagens de captação</label>
          <div className="field-hint" style={{ marginBottom: "10px" }}>
            Os roteiros que você usa ao abordar proprietários — o que você diz, não por onde diz.
            Ao registrar uma tentativa num imóvel você escolhe o roteiro usado, e o ranking em
            Relatórios mostra quais funcionam.
            {totalAbordagens > 0 && ` ${totalAbordagens} cadastrada(s).`}
          </div>
          <button type="button" className="btn" onClick={() => abrirModal("abordagens")}>
            Gerenciar abordagens
          </button>
        </div>
        <div className="divider"></div>
        <div className="field-group">
          <label>WhatsApp</label>
          <div className="field-hint" style={{ marginBottom: "10px" }}>
            Estado do número que envia suas mensagens. Se ele cair, nenhum envio sai — e é aqui que
            você reconecta, lendo o código com o celular.
          </div>
          <button
            type="button"
            className="btn"
            style={{ width: "100%" }}
            onClick={() => abrirModal("conexaoWhatsapp")}
          >
            Ver conexão do WhatsApp
          </button>
        </div>

        <div className="divider"></div>
        <div className="field-group">
          <label>Conta</label>
          <div className="field-hint" style={{ marginBottom: "10px" }}>
            Logado como <strong>{usuario?.email}</strong>
          </div>
        </div>
        <div className="field-group">
          <label>Importar carteira</label>
          <div className="field-hint" style={{ marginBottom: "10px" }}>
            Já tem os imóveis numa planilha? Traga de uma vez, em vez de digitar um a um.
          </div>
          <button
            type="button"
            className="btn"
            style={{ width: "100%" }}
            onClick={() => abrirModal("importar")}
          >
            Importar de uma planilha (CSV)
          </button>
        </div>

        <div className="field-group">
          <label>Dados</label>
          <button
            type="button"
            className="btn"
            style={{ width: "100%", marginBottom: "8px" }}
            onClick={demo}
            disabled={ocupado}
          >
            Carregar dados de exemplo
          </button>
          <div className="field-hint" style={{ marginBottom: "14px" }}>
            Adiciona imóveis, metas e compromissos fictícios para você explorar o sistema.
          </div>
          <button type="button" className="btn btn-danger" style={{ width: "100%" }} onClick={apagar} disabled={ocupado}>
            Apagar todos os meus dados
          </button>
          <div className="field-hint">Remove permanentemente todos os imóveis, metas e compromissos desta conta.</div>
        </div>
      </div>
      <div className="modal-foot">
        <div></div>
        <div style={{ display: "flex", gap: "10px" }}>
          <button type="button" className="btn" onClick={fecharModal}>
            Fechar
          </button>
          <button type="button" className="btn btn-primary" onClick={salvar} disabled={ocupado}>
            Salvar
          </button>
        </div>
      </div>
    </>
  );
}
