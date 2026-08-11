"use client";

/* ================================================================
   VIEW: CAIXA DE RESPOSTAS
   O que o proprietário escreveu, num lugar só. Toda a regra (o que é
   "pendente", a ordem, o agrupamento por imóvel) vem do cálculo puro
   em calculo/respostas.ts — aqui só há montagem e as ações.

   A unidade da lista é o IMÓVEL, não a mensagem: no WhatsApp as
   pessoas mandam três mensagens curtas seguidas, e uma linha por
   mensagem faria um proprietário empurrar todos os outros para fora
   da tela.

   O botão "Atualizar" não é enfeite: a resposta entra pelo webhook,
   no servidor, e o painel carrega o estado uma vez por sessão — numa
   aba aberta desde cedo, a caixa está congelada na hora do login.
   ================================================================ */
import { useMemo, useState } from "react";
import type { LinhaResposta } from "@/lib/calculo/respostas";
import { caixaDeRespostas } from "@/lib/calculo/respostas";
import { corpoDaResposta } from "@/lib/calculo/notas";
import { rotuloModeloWhatsapp, sugestaoRespostaModelo } from "@/lib/calculo/whatsapp";
import { todayISO } from "@/lib/datas";
import { rascunharResposta } from "@/lib/ia";
import { marcarRespostasLidas, marcarTodasRespostasLidas, recarregarEstado } from "@/lib/mutacoes";
import { toast } from "@/lib/toast";
import { useAppStore } from "@/lib/store";
import type { Imovel } from "@/lib/tipos";
import { useUiModal } from "@/lib/uiModal";

type Filtro = "pendentes" | "todas";

/** "há 2 dias" / "hoje" — o mesmo vocabulário curto do resto do painel. */
function rotuloDias(dias: number): string {
  if (dias <= 0) return "hoje";
  if (dias === 1) return "ontem";
  return `há ${dias} dias`;
}

/** Hora da mensagem ("14:30"), quando o webhook a gravou. */
function hora(data: string): string {
  return data.length >= 16 ? data.slice(11, 16) : "";
}

function Conversa({ linha, expandida }: { linha: LinhaResposta; expandida: boolean }) {
  // Fechada, mostra só a prévia — a última mensagem COM TEXTO. As anteriores
  // existem para reler o contexto, não para varrer a tela.
  const visiveis = expandida ? linha.mensagens : [linha.previa];
  return (
    <div className="resp-conversa">
      {visiveis.map((m) => (
        <div
          key={m.id}
          className={`resp-msg${m.tratada ? " tratada" : ""}${m.soMidia ? " midia" : ""}`}
        >
          {/* Sem o prefixo do webhook: "Resposta pelo WhatsApp:" em cada balão,
              numa tela chamada Respostas, é uma linha de ruído por mensagem. */}
          <div className="resp-msg-txt">{corpoDaResposta(m.texto) || "(mensagem sem texto)"}</div>
          <div className="resp-msg-meta">
            {m.dia.split("-").reverse().join("/")}
            {hora(m.data) && ` · ${hora(m.data)}`}
            {m.tratada && " · tratada"}
          </div>
        </div>
      ))}
    </div>
  );
}

function Linha({ linha, imovel }: { linha: LinhaResposta; imovel: Imovel }) {
  const abrirModal = useUiModal((s) => s.abrirModal);
  const abrirWhatsappRascunho = useUiModal((s) => s.abrirWhatsappRascunho);
  const iaDisponivel = useAppStore((s) => s.iaDisponivel);
  const [expandida, setExpandida] = useState(false);
  const [marcando, setMarcando] = useState(false);
  const [rascunhando, setRascunhando] = useState(false);

  const anteriores = linha.total - 1;

  /* Sugestão de resposta conforme a última mensagem classificada (camada 1, sem
     IA nova): quando existe, o botão abre o WhatsApp já com a réplica escrita —
     o corretor só confere e envia.

     Sem classificação, ele abre EM BRANCO — e não mais no modelo por etapa do
     funil. Aquele padrão vinha do Pipeline, onde a conversa pode nem ter
     começado; aqui ela sempre começou, porque a linha só existe porque a pessoa
     escreveu. O resultado era o app propondo abertura no meio de conversa viva:
     em "Angariado" saía "Olá, Fulano! Tudo bem?" seguido do início da
     divulgação (no LD-156, com 74 mensagens trocadas), e em "Perdido"/"Sem
     resposta" saía "Tentei falar com você há alguns dias, mas não consegui
     retorno" para quem tinha acabado de responder. Medido em 04/08/2026: 9 dos
     32 imóveis com resposta caíam nisso. O seletor continua ali dentro para
     quem quiser um modelo — o que sai é o palpite errado por padrão. */
  const modeloSugerido = sugestaoRespostaModelo(imovel);
  const rotuloSugerido = modeloSugerido
    ? rotuloModeloWhatsapp(modeloSugerido).replace(/^Resposta:\s*/, "")
    : "";

  // Camada 2: sem réplica pronta (o "respondeu" genérico — uma dúvida, uma
  // pergunta), a IA lê a última mensagem e rascunha a resposta. Só faz sentido
  // com IA liberada, telefone e ao menos uma mensagem COM texto para ler.
  const podeRascunhar = iaDisponivel && !modeloSugerido && !!imovel.proprietarioTelefone && !linha.previa.soMidia;

  async function rascunhar() {
    if (rascunhando) return;
    setRascunhando(true);
    const r = await rascunharResposta(imovel.id);
    setRascunhando(false);
    if (r.ok && r.rascunho) {
      // Abre o WhatsApp já com o rascunho — visível e editável, o corretor
      // confere e envia. Nada sai sozinho. Os protocolos usados viajam junto:
      // quando a IA AFIRMA algo (taxa, prazo, multa), o corretor precisa ver de
      // onde saiu sem ter que reler a base inteira.
      abrirWhatsappRascunho(imovel.id, r.rascunho, r.protocolosUsados);
    } else {
      toast(r.mensagem || "A IA não conseguiu rascunhar a resposta agora.", "error");
    }
  }

  async function marcarLida() {
    if (marcando) return;
    setMarcando(true);
    await marcarRespostasLidas(linha.imovelId, true);
    setMarcando(false);
  }

  return (
    <div className={`resp-linha${linha.pendente ? " pendente" : ""}`}>
      <div className="resp-top">
        <button
          type="button"
          className="resp-codigo"
          title="Abrir o imóvel"
          onClick={() => abrirModal("imovel", imovel.id)}
        >
          {imovel.codigo || imovel.referenciaCrm || "Sem código"}
        </button>
        <span className="resp-top-dir">
          {linha.pendente && (
            <span className="home-list-chip bad">
              {linha.naoTratadas > 1 ? `${linha.naoTratadas} novas` : "nova"}
            </span>
          )}
          <span className="home-list-chip">{rotuloDias(linha.dias)}</span>
          <span className="resp-status">{imovel.status}</span>
        </span>
      </div>

      <div className="resp-row" title={imovel.endereco}>
        <span className="resp-ic">📍</span>
        <span className="resp-val">{imovel.endereco || "Sem endereço"}</span>
      </div>
      <div className="resp-row">
        <span className="resp-ic">👤</span>
        <span className={`resp-val${imovel.proprietarioNome ? "" : " vazio"}`}>
          {imovel.proprietarioNome || "Sem proprietário"}
        </span>
      </div>

      {/* Escrita automática tem que se explicar na tela: sem esta linha, a
          caixa mostraria um "Perdido" sem dizer que foi o app que o marcou,
          a partir de uma destas mensagens. */}
      {linha.encerradoAutomaticamente && (
        <div className="resp-auto">
          ⚠ Este imóvel foi encerrado automaticamente a partir de uma destas respostas.
        </div>
      )}

      {/* O que chegou sem texto. Não cobra ação porque não há ação possível
          por aqui — mas dizer que existe importa: nove áudios são um
          proprietário muito ativo, e a linha ficaria mentindo sem isso. */}
      {linha.midiaPendentes > 0 && (
        <div className="resp-midia">
          🎧 {linha.midiaPendentes}{" "}
          {linha.midiaPendentes > 1 ? "mensagens sem texto" : "mensagem sem texto"} (áudio, foto) —
          só dá para ouvir no WhatsApp
        </div>
      )}

      <Conversa linha={linha} expandida={expandida} />

      {anteriores > 0 && (
        <button type="button" className="resp-mais" onClick={() => setExpandida((v) => !v)}>
          {expandida
            ? "ocultar as anteriores"
            : `+ ${anteriores} ${anteriores > 1 ? "mensagens anteriores" : "mensagem anterior"}`}
        </button>
      )}

      {modeloSugerido && imovel.proprietarioTelefone && (
        <div className="resp-sugestao">
          💡 Sugestão de resposta pronta: <strong>{rotuloSugerido}</strong> — clique em Responder para
          conferir e enviar.
        </div>
      )}

      <div className="resp-acoes">
        {imovel.proprietarioTelefone && (
          <button
            type="button"
            className="btn btn-sm btn-primary"
            title={modeloSugerido ? `Abre a resposta já escrita: ${rotuloSugerido}` : undefined}
            onClick={() =>
              modeloSugerido
                ? abrirModal("whatsapp", imovel.id, modeloSugerido)
                : // Em branco: o texto livre nasce sem modelo, então também não
                  // credita tentativa — responder não é contato de captação.
                  abrirWhatsappRascunho(imovel.id, "")
            }
          >
            {modeloSugerido ? "💬 Responder (sugestão)" : "💬 Responder"}
          </button>
        )}
        {podeRascunhar && (
          <button
            type="button"
            className="btn btn-sm"
            title="A IA lê a última mensagem e escreve um rascunho de resposta para você conferir"
            onClick={rascunhar}
            disabled={rascunhando}
          >
            {rascunhando ? "Rascunhando..." : "✨ Rascunhar resposta (IA)"}
          </button>
        )}
        <button type="button" className="btn btn-sm" onClick={() => abrirModal("tentativas", imovel.id)}>
          Registrar contato
        </button>
        <button type="button" className="btn btn-sm" onClick={() => abrirModal("imovel", imovel.id)}>
          Abrir imóvel
        </button>
        {linha.pendente && (
          <button type="button" className="btn btn-sm resp-lida" onClick={marcarLida} disabled={marcando}>
            ✓ Marcar como lida
          </button>
        )}
      </div>
    </div>
  );
}

export default function RespostasView() {
  const imoveis = useAppStore((s) => s.imoveis);
  const [filtro, setFiltro] = useState<Filtro>("pendentes");
  const [atualizando, setAtualizando] = useState(false);
  const [limpando, setLimpando] = useState(false);

  const linhas = useMemo(() => caixaDeRespostas(imoveis, todayISO()), [imoveis]);
  const pendentes = linhas.filter((l) => l.pendente);
  const visiveis = filtro === "pendentes" ? pendentes : linhas;

  const imovelDe = (id: string) => imoveis.find((i) => i.id === id) || null;

  async function atualizar() {
    if (atualizando) return;
    setAtualizando(true);
    await recarregarEstado();
    setAtualizando(false);
  }

  // Zerar o backlog. Pergunta antes porque é irreversível pela tela: não há
  // "marcar como não lida", e o que sai daqui só volta pelo banco.
  async function limparTudo() {
    if (limpando || pendentes.length === 0) return;
    if (
      !confirm(
        `Marcar como lidas as respostas de ${pendentes.length} imóve${pendentes.length > 1 ? "is" : "l"}? ` +
          "Elas saem da caixa e não há como desmarcar por aqui.",
      )
    )
      return;
    setLimpando(true);
    const n = await marcarTodasRespostasLidas(pendentes.map((l) => l.imovelId));
    setLimpando(false);
    if (n > 0) toast(n === 1 ? "1 imóvel marcado como lido." : `${n} imóveis marcados como lidos.`);
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h2 className="page-title">Respostas recebidas</h2>
          <p className="page-sub">O que os proprietários escreveram, e o que ainda não foi tratado</p>
        </div>
        <div className="resp-head-acoes">
          <button type="button" className="btn btn-sm" onClick={atualizar} disabled={atualizando}>
            {atualizando ? "Atualizando..." : "↻ Atualizar"}
          </button>
          {pendentes.length > 0 && (
            <button type="button" className="btn btn-sm" onClick={limparTudo} disabled={limpando}>
              {limpando ? "Marcando..." : `✓ Marcar todas como lidas (${pendentes.length})`}
            </button>
          )}
        </div>
      </div>

      <div className="resp-filtros">
        <button
          type="button"
          className={`resp-filtro${filtro === "pendentes" ? " active" : ""}`}
          onClick={() => setFiltro("pendentes")}
        >
          Pendentes ({pendentes.length})
        </button>
        <button
          type="button"
          className={`resp-filtro${filtro === "todas" ? " active" : ""}`}
          onClick={() => setFiltro("todas")}
        >
          Todas ({linhas.length})
        </button>
      </div>

      {visiveis.length === 0 ? (
        <div className="card">
          <p className="section-note">
            {linhas.length === 0
              ? "Nenhuma resposta recebida ainda. Quando um proprietário responder no WhatsApp, a mensagem aparece aqui automaticamente."
              : "Tudo tratado — nenhuma resposta pendente. 🎉"}
          </p>
        </div>
      ) : (
        // Dois blocos, nesta ordem: a captação é a conversa que ainda pode ser
        // perdida. Misturadas, a carteira afundaria o lead — ela produz muito
        // mais mensagem (documento, visita do inquilino, contrato) e venceria
        // sempre no volume, que é como o termômetro já morreu uma vez.
        <div className="anim-stagger">
          {(["captacao", "carteira"] as const).map((fase) => {
            const doBloco = visiveis.filter((l) => l.fase === fase);
            if (doBloco.length === 0) return null;
            return (
              <section className="resp-bloco" key={fase}>
                <div className="resp-bloco-head">
                  <h2 className="resp-bloco-titulo">
                    {fase === "captacao" ? "Captação" : "Carteira"}
                  </h2>
                  <span className="section-note">
                    {fase === "captacao"
                      ? "proprietários que ainda podem virar (ou perder) uma angariação"
                      : "imóveis já captados — assunto operacional, não disputa"}
                  </span>
                  <span className="resp-bloco-n">{doBloco.length}</span>
                </div>
                <div className="resp-lista">
                  {doBloco.map((linha) => {
                    const imovel = imovelDe(linha.imovelId);
                    if (!imovel) return null;
                    return <Linha key={linha.imovelId} linha={linha} imovel={imovel} />;
                  })}
                </div>
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}
