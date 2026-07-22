"use client";

/* ================================================================
   MODAL: MENSAGEM PARA WHATSAPP
   Aberto pela Agenda ("Enviar WhatsApp" do retorno ao proprietário)
   e pelo pré-cadastro rápido (confirmação de endereço). Mostra a
   mensagem preenchida e EDITÁVEL, com seletor de modelos: os modelos
   prontos por etapa do funil + os criados pelo usuário. Dá para
   salvar a mensagem atual como um novo modelo reutilizável — o nome
   do proprietário vira {nome} para a saudação se adaptar depois.
   "Enviar agora" dispara pela Evolution (nosso WhatsApp), sem abrir o
   WhatsApp Web; se a Evolution recusar, o wa.me aparece como saída.
   Sem telefone, é só copiar.

   O seletor tem TRÊS grupos, e o terceiro ("Minhas abordagens") é o que
   liga esta tela ao ranking. Enviar por uma abordagem registra a tentativa
   sozinho — antes disso o ranking só enxergava o que fosse anotado à mão,
   ou seja, quase nada: o caminho real de envio era invisível para ele.

   Modelo comum NÃO registra tentativa, de propósito. "Imóvel locado" e
   "confirmação de visita" não disputam captação nenhuma; creditá-los
   encheria o ranking de mensagens que não são roteiro de abordagem.
   ================================================================ */
import { useRef, useState } from "react";
import { rotuloUsuario, useSessao } from "@/components/SessaoProvider";
import { telefoneWhatsapp } from "@/lib/calculo/agenda";
import {
  aplicarModeloUsuario,
  avisoAoSalvarModelo,
  linkWhatsapp,
  MARCADORES_MODELO,
  mensagemFalhaEnvio,
  mensagemWhatsapp,
  MODELOS_WHATSAPP,
  numeroEvolution,
  tokenizarModeloUsuario,
} from "@/lib/calculo/whatsapp";
import { enviarWhatsapp } from "@/lib/envioWhatsapp";
import { adicionarModeloWhatsapp, registrarTentativa, removerModeloWhatsapp } from "@/lib/mutacoes";
import { useAppStore } from "@/lib/store";
import { toast } from "@/lib/toast";
import { useUiModal } from "@/lib/uiModal";

const MODELO_PADRAO = "renovacao-angariacao";

export default function ModalWhatsapp({ imovelId, modeloInicial }: { imovelId: string; modeloInicial?: string }) {
  const fecharModal = useUiModal((s) => s.fecharModal);
  const abrirModal = useUiModal((s) => s.abrirModal);
  const { usuario } = useSessao();
  const imoveis = useAppStore((s) => s.imoveis);
  const config = useAppStore((s) => s.config);
  const abordagens = useAppStore((s) => s.abordagens);
  const imovel = imoveis.find((i) => i.id === imovelId) || null;
  const nomeCaptador = rotuloUsuario(usuario);
  const modelosUsuario = config.whatsappModelos || [];
  // Sem roteiro não há o que enviar; arquivada saiu de circulação.
  const abordagensUsaveis = abordagens.filter((a) => !a.arquivada && (a.roteiro || "").trim());

  // Modelo inicial: o pedido pela abertura (ex.: confirmação de endereço no
  // pré-cadastro), desde que exista; senão, a renovação de angariação.
  const padraoInicial =
    modeloInicial && MODELOS_WHATSAPP.some((m) => m.id === modeloInicial) ? modeloInicial : MODELO_PADRAO;

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // A origem do texto anda junto com o id: sem ela não daria para saber se o
  // selecionado é uma abordagem (que credita tentativa) ou um modelo comum
  // (que não credita), e ids de modelo e de abordagem são ambos uuid.
  const [tipoSel, setTipoSel] = useState<"sistema" | "usuario" | "abordagem">("sistema");
  const [modeloId, setModeloId] = useState(padraoInicial);
  const [mensagem, setMensagem] = useState(() =>
    imovel ? mensagemWhatsapp(padraoInicial, imovel, nomeCaptador) : "",
  );
  const [salvarAberto, setSalvarAberto] = useState(false);
  const [nomeNovo, setNomeNovo] = useState("");
  // Grupos do seletor (accordion). Ambos começam fechados; "Meus modelos" fica
  // em cima (preferência) e o "Selecionado: …" abaixo deixa claro o modelo ativo.
  const [verUsuario, setVerUsuario] = useState(false);
  const [verSistema, setVerSistema] = useState(false);
  const [verAbordagens, setVerAbordagens] = useState(false);
  const [enviando, setEnviando] = useState(false);
  // Envio direto falhou (instância caída, número sem WhatsApp...): revela o
  // wa.me como saída, em vez de deixar o corretor sem caminho.
  const [falhouEnvio, setFalhouEnvio] = useState(false);

  if (!imovel) return null;
  const temTelefone = !!telefoneWhatsapp(imovel.proprietarioTelefone);
  const podeEnviarDireto = !!numeroEvolution(imovel.proprietarioTelefone);
  const modeloCustomSel = tipoSel === "usuario" ? modelosUsuario.find((m) => m.id === modeloId) || null : null;
  const abordagemSel = tipoSel === "abordagem" ? abordagensUsaveis.find((a) => a.id === modeloId) || null : null;
  const rotuloSelecionado =
    abordagemSel?.nome ||
    modeloCustomSel?.nome ||
    MODELOS_WHATSAPP.find((m) => m.id === modeloId)?.rotulo ||
    "Modelo";

  function trocarModelo(tipo: "sistema" | "usuario" | "abordagem", id: string) {
    if (!imovel) return;
    setTipoSel(tipo);
    setModeloId(id);
    if (tipo === "abordagem") {
      const a = abordagensUsaveis.find((x) => x.id === id);
      setMensagem(a ? aplicarModeloUsuario(a.roteiro || "", imovel) : "");
      return;
    }
    if (tipo === "usuario") {
      const custom = modelosUsuario.find((m) => m.id === id);
      setMensagem(custom ? aplicarModeloUsuario(custom.texto, imovel) : "");
      return;
    }
    setMensagem(mensagemWhatsapp(id, imovel, nomeCaptador));
  }

  async function salvarModelo() {
    if (!usuario || !imovel) return;
    const nome = nomeNovo.trim();
    if (!nome) {
      toast("Dê um nome ao modelo.", "error");
      return;
    }
    if (modelosUsuario.some((m) => m.nome.toLowerCase() === nome.toLowerCase())) {
      toast("Já existe um modelo com esse nome.", "error");
      return;
    }
    const texto = tokenizarModeloUsuario(mensagem, imovel);
    const aviso = avisoAoSalvarModelo(texto);
    const novo = await adicionarModeloWhatsapp(nome, texto, config, usuario.id, "");
    if (novo) {
      toast(aviso.mensagem, aviso.ok ? "success" : "warning");
      setTipoSel("usuario");
      setModeloId(novo.id);
      setNomeNovo("");
      setSalvarAberto(false);
    }
  }

  async function excluirModelo(id: string) {
    if (!usuario || !imovel) return;
    const ok = await removerModeloWhatsapp(id, config, usuario.id);
    // Só reescreve o texto se o modelo excluído era o que estava selecionado.
    if (ok && modeloId === id) {
      setTipoSel("sistema");
      setModeloId(padraoInicial);
      setMensagem(mensagemWhatsapp(padraoInicial, imovel, nomeCaptador));
    }
  }

  async function copiar() {
    try {
      await navigator.clipboard.writeText(mensagem);
      toast("Mensagem copiada.");
    } catch {
      const el = textareaRef.current;
      if (el) {
        el.focus();
        el.select();
        document.execCommand("copy");
        toast("Mensagem copiada.");
      }
    }
  }

  /** Envia pela Evolution — o corretor não sai do painel. */
  async function enviarAgora() {
    if (!imovel || enviando) return;
    const texto = mensagem.trim();
    if (!texto) {
      toast("Escreva a mensagem antes de enviar.", "error");
      return;
    }
    setEnviando(true);
    const r = await enviarWhatsapp(imovel.id, texto);
    // Registra tanto a abordagem do catálogo quanto o modelo PRÓPRIO do
    // corretor: os dois são coisas que ele disse a um proprietário, e sem
    // registro o webhook não teria tentativa nenhuma para fechar quando a
    // resposta chegasse. O que os separa é o ranking — só a abordagem tem id
    // estável (arquiva, não apaga) e é comparável com as outras; o modelo
    // entra sem `abordagemId` e fica de fora, com o nome guardado por valor.
    //
    // Modelo do SISTEMA continua sem registrar: "imóvel locado" e
    // "confirmação de visita" não são contato de captação.
    if (r.ok && (abordagemSel || modeloCustomSel)) {
      // Só depois do envio CONFIRMADO pela Evolution. Registrar antes criaria
      // tentativa fantasma toda vez que o número não tivesse WhatsApp.
      //
      // O resultado nasce "sem-resposta" porque agora ninguém sabe — e nasce
      // marcado como palpite, para o nudge cobrar a confirmação depois. Sem
      // essa cobrança, toda taxa de resposta tenderia a zero.
      await registrarTentativa(
        imovel.id,
        {
          abordagemId: abordagemSel ? abordagemSel.id : null,
          modeloNome: modeloCustomSel ? modeloCustomSel.nome : null,
          canal: "WhatsApp",
          resultado: "sem-resposta",
          observacao: null,
          aguardandoResultado: true,
        },
        true,
      );
    }
    setEnviando(false);
    if (r.ok) {
      toast(
        abordagemSel
          ? `Mensagem enviada. Tentativa registrada em “${abordagemSel.nome}”.`
          : modeloCustomSel
            ? `Mensagem enviada. Tentativa registrada com o modelo “${modeloCustomSel.nome}”.`
            : "Mensagem enviada no WhatsApp.",
      );
      fecharModal();
      return;
    }
    // A rota já manda o texto pronto; o fallback cobre falha de rede.
    toast(r.mensagem || mensagemFalhaEnvio(r.falha || "falha-evolution"), "error");
    setFalhouEnvio(true);
  }

  /** Saída antiga (click-to-chat): abre a conversa com o texto pronto. */
  function abrirWhatsappWeb() {
    if (!imovel) return;
    const link = linkWhatsapp(imovel, mensagem);
    if (!link) return;
    window.open(link, "_blank", "noopener");
    fecharModal();
  }

  /** Insere um marcador ({nome}/{endereco}) na posição do cursor do textarea. */
  function inserirMarcador(token: string) {
    const el = textareaRef.current;
    const start = el?.selectionStart ?? mensagem.length;
    const end = el?.selectionEnd ?? mensagem.length;
    setMensagem(mensagem.slice(0, start) + token + mensagem.slice(end));
    if (el) {
      requestAnimationFrame(() => {
        el.focus();
        const pos = start + token.length;
        el.setSelectionRange(pos, pos);
      });
    }
  }

  return (
    <>
      <div className="modal-head">
        <div className="modal-title">Mensagem para WhatsApp</div>
        <button type="button" className="icon-btn" onClick={fecharModal}>
          ✕
        </button>
      </div>
      <div className="modal-body">
        <p className="section-note" style={{ marginBottom: "14px" }}>
          {podeEnviarDireto
            ? "Escolha um modelo, ajuste o texto e clique em Enviar agora — a mensagem sai direto pelo WhatsApp da imobiliária, sem abrir o WhatsApp Web."
            : temTelefone
              ? "Escolha um modelo, ajuste o texto e clique em Abrir WhatsApp Web para abrir a conversa já com a mensagem."
              : `${imovel.codigo || imovel.endereco || "Imóvel sem código"} não tem telefone cadastrado. Edite e copie a mensagem abaixo para enviar manualmente.`}
        </p>

        <div className="field-group">
          <label>Modelo</label>
          <div className="wpp-picker">
            {/* Abordagens no topo: são as únicas que alimentam o ranking, e é
                onde caem os roteiros sugeridos pela IA. */}
            <div className="wpp-grupo">
              <button
                type="button"
                className="wpp-grupo-head"
                aria-expanded={verAbordagens}
                onClick={() => setVerAbordagens((v) => !v)}
              >
                <span className="wpp-grupo-caret" aria-hidden>
                  {verAbordagens ? "▾" : "▸"}
                </span>
                <span className="wpp-grupo-nome">Abordagens sugeridas por IA</span>
                <span className="wpp-grupo-count">{abordagensUsaveis.length}</span>
              </button>
              {verAbordagens && (
                <div className="wpp-grupo-lista">
                  {abordagensUsaveis.length === 0 ? (
                    <p className="wpp-vazio">
                      Nenhuma abordagem com roteiro ainda.{" "}
                      <button
                        type="button"
                        className="insight-action"
                        style={{ padding: 0 }}
                        onClick={() => abrirModal("abordagens")}
                      >
                        Cadastrar abordagens
                      </button>
                    </p>
                  ) : (
                    abordagensUsaveis.map((a) => (
                      <div
                        key={a.id}
                        className={`wpp-opt${tipoSel === "abordagem" && modeloId === a.id ? " ativa" : ""}`}
                      >
                        <button
                          type="button"
                          className="wpp-opt-sel"
                          onClick={() => trocarModelo("abordagem", a.id)}
                        >
                          {a.nome}
                        </button>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Meus modelos — texto livre, sem crédito no ranking. */}
            <div className="wpp-grupo">
              <button
                type="button"
                className="wpp-grupo-head"
                aria-expanded={verUsuario}
                onClick={() => setVerUsuario((v) => !v)}
              >
                <span className="wpp-grupo-caret" aria-hidden>
                  {verUsuario ? "▾" : "▸"}
                </span>
                <span className="wpp-grupo-nome">Meus modelos</span>
                <span className="wpp-grupo-count">{modelosUsuario.length}</span>
              </button>
              {verUsuario && (
                <div className="wpp-grupo-lista">
                  {modelosUsuario.length === 0 ? (
                    <p className="wpp-vazio">
                      Nenhum modelo salvo ainda. Ajuste o texto abaixo e use “+ Salvar como modelo”.
                    </p>
                  ) : (
                    modelosUsuario.map((m) => (
                      <div
                        key={m.id}
                        className={`wpp-opt${tipoSel === "usuario" && modeloId === m.id ? " ativa" : ""}`}
                      >
                        <button type="button" className="wpp-opt-sel" onClick={() => trocarModelo("usuario", m.id)}>
                          {m.nome}
                        </button>
                        <button
                          type="button"
                          className="wpp-opt-del"
                          title={`Excluir “${m.nome}”`}
                          onClick={() => excluirModelo(m.id)}
                        >
                          ✕
                        </button>
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>

            {/* Modelos do sistema — prontos por etapa do funil. */}
            <div className="wpp-grupo">
              <button
                type="button"
                className="wpp-grupo-head"
                aria-expanded={verSistema}
                onClick={() => setVerSistema((v) => !v)}
              >
                <span className="wpp-grupo-caret" aria-hidden>
                  {verSistema ? "▾" : "▸"}
                </span>
                <span className="wpp-grupo-nome">Modelos do sistema</span>
                <span className="wpp-grupo-count">{MODELOS_WHATSAPP.length}</span>
              </button>
              {verSistema && (
                <div className="wpp-grupo-lista">
                  {MODELOS_WHATSAPP.map((m) => (
                    <div
                      key={m.id}
                      className={`wpp-opt${tipoSel === "sistema" && modeloId === m.id ? " ativa" : ""}`}
                    >
                      <button type="button" className="wpp-opt-sel" onClick={() => trocarModelo("sistema", m.id)}>
                        {m.rotulo}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
          <p className="wpp-selecionado">
            Selecionado: <strong>{rotuloSelecionado}</strong>
            {abordagemSel && " · o envio entra no ranking desta abordagem"}
          </p>
        </div>

        <textarea
          ref={textareaRef}
          style={{ minHeight: "200px" }}
          value={mensagem}
          onChange={(e) => setMensagem(e.target.value)}
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
          <div className="field-group" style={{ marginTop: "10px" }}>
            <label>Nome do novo modelo</label>
            <div style={{ display: "flex", gap: "8px" }}>
              <input
                type="text"
                value={nomeNovo}
                onChange={(e) => setNomeNovo(e.target.value)}
                placeholder="Ex: Falar mais tarde"
                style={{ flex: 1 }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    salvarModelo();
                  }
                }}
              />
              <button type="button" className="btn btn-sm btn-primary" onClick={salvarModelo}>
                Salvar modelo
              </button>
              <button type="button" className="btn btn-sm" onClick={() => setSalvarAberto(false)}>
                Cancelar
              </button>
            </div>
            <div className="field-hint">
              O modelo guarda o texto atual. O nome e o endereço do imóvel viram os marcadores{" "}
              <strong>{"{nome}"}</strong> e <strong>{"{endereco}"}</strong>, que se adaptam sozinhos
              quando você usar o modelo em outro contato.
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            style={{ marginTop: "10px" }}
            onClick={() => setSalvarAberto(true)}
          >
            + Salvar como modelo
          </button>
        )}
      </div>
      <div className="modal-foot">
        <div></div>
        <div style={{ display: "flex", gap: "10px" }}>
          <button type="button" className="btn" onClick={fecharModal}>
            Fechar
          </button>
          <button type="button" className="btn" onClick={copiar}>
            Copiar mensagem
          </button>
          {/* wa.me: caminho principal quando o envio direto não serve (número
              fora do padrão) e saída de emergência quando ele falha. */}
          {temTelefone && (!podeEnviarDireto || falhouEnvio) && (
            <button
              type="button"
              className={`btn${podeEnviarDireto ? "" : " btn-primary"}`}
              onClick={abrirWhatsappWeb}
            >
              Abrir WhatsApp Web
            </button>
          )}
          {podeEnviarDireto && (
            <button type="button" className="btn btn-primary" onClick={enviarAgora} disabled={enviando}>
              {enviando ? "Enviando..." : falhouEnvio ? "Tentar de novo" : "Enviar agora"}
            </button>
          )}
        </div>
      </div>
    </>
  );
}
