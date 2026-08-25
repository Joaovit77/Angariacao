"use client";

/* A ordem vem do motor determinístico. A Home mostra somente a primeira
   ação; despejar a fila inteira aqui transforma prioridade em backlog. */
import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { focoInteligenteDoDia, type AcaoFoco, type TipoAcaoFoco } from "@/lib/calculo/focoDia";
import { diasSemMovimento, ultimoMovimentoISO } from "@/lib/calculo/motor";
import { enderecoComUnidade } from "@/lib/calculo/whatsapp";
import { todayISO } from "@/lib/datas";
import { fmtDate } from "@/lib/formatadores";
import { useAppStore } from "@/lib/store";
import { useUiModal } from "@/lib/uiModal";

const ROTULO_TIPO: Record<TipoAcaoFoco, string> = {
  resposta: "Resposta pendente",
  atrasado: "Compromisso atrasado",
  hoje: "Compromisso de hoje",
  parado: "Imóvel sem movimento",
  prospeccao: "Prospecção",
};

function rotuloBotao(acao: AcaoFoco): string {
  if (acao.tipo === "parado" && acao.imovelId) return "Retomar imóvel";
  if (acao.destino === "/respostas") return "Abrir respostas";
  if (acao.destino === "/agenda") return "Abrir agenda";
  return "Abrir pipeline";
}

type IconeFocoNome = "raio" | "casa" | "relogio" | "pessoa" | "endereco" | "calendario" | "mensagem" | "busca";

function IconeFoco({ nome }: { nome: IconeFocoNome }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {nome === "raio" && <path d="m13 2-8 11h6l-1 9 9-12h-6V2Z" />}
      {nome === "casa" && <><path d="m3 11 9-8 9 8" /><path d="M5 10v10h14V10M9 20v-6h6v6" /></>}
      {nome === "relogio" && <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>}
      {nome === "pessoa" && <><circle cx="12" cy="8" r="3" /><path d="M5 21c.6-4 3-6 7-6s6.4 2 7 6" /></>}
      {nome === "endereco" && <><path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" /><circle cx="12" cy="10" r="2.5" /></>}
      {nome === "calendario" && <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></>}
      {nome === "mensagem" && <><path d="M21 15a4 4 0 0 1-4 4H8l-5 3 1.5-5A7 7 0 0 1 3 13V8a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4v7Z" /><path d="M8 10h8M8 14h5" /></>}
      {nome === "busca" && <><circle cx="11" cy="11" r="7" /><path d="m16 16 5 5" /></>}
    </svg>
  );
}

function iconeDaAcao(tipo: TipoAcaoFoco): IconeFocoNome {
  if (tipo === "parado") return "casa";
  if (tipo === "resposta") return "mensagem";
  if (tipo === "prospeccao") return "busca";
  return "calendario";
}

export default function PlanoExecucao() {
  const router = useRouter();
  const imoveis = useAppStore((s) => s.imoveis);
  const agenda = useAppStore((s) => s.agenda);
  const origensExtras = useAppStore((s) => s.config.origensExtras);
  const abrirModal = useUiModal((s) => s.abrirModal);
  const hoje = todayISO();

  const foco = useMemo(
    () => focoInteligenteDoDia(imoveis, agenda, origensExtras, hoje),
    [imoveis, agenda, origensExtras, hoje],
  );
  const principal = foco.acoes[0];
  const imovelPrincipal = principal?.imovelId
    ? imoveis.find((imovel) => imovel.id === principal.imovelId)
    : undefined;
  const proprietario = imovelPrincipal?.proprietarioNome?.trim() || "";
  const endereco = imovelPrincipal
    ? [enderecoComUnidade(imovelPrincipal), imovelPrincipal.bairro, imovelPrincipal.cidade]
        .map((parte) => parte?.trim())
        .filter(Boolean)
        .join(" · ")
    : "";
  const diasParado = principal?.tipo === "parado" && imovelPrincipal
    ? diasSemMovimento(imovelPrincipal, hoje)
    : null;
  const ultimoMovimento = imovelPrincipal ? ultimoMovimentoISO(imovelPrincipal) : null;
  const desde = ultimoMovimento ? fmtDate(ultimoMovimento).replace(/\/\d{4}$/, "") : "";
  const tituloPrincipal = principal?.tipo === "parado" ? "Imóvel sem movimento" : principal?.titulo;
  const identificacao = principal?.tipo === "parado" && imovelPrincipal
    ? [imovelPrincipal.codigo || imovelPrincipal.endereco, imovelPrincipal.status].filter(Boolean).join(" · ")
    : principal?.contexto;

  if (!principal) return null;

  function abrirAcao(acao: AcaoFoco) {
    if (acao.tipo === "parado" && acao.imovelId) {
      abrirModal("imovel", acao.imovelId);
      return;
    }
    router.push(acao.destino);
  }

  return (
    <div className="card foco-card foco-card-enxuto">
      <div className="home-card-head foco-cabecalho">
        <span className="foco-cabecalho-icone"><IconeFoco nome="raio" /></span>
        <div>
          <div className="card-title">Faça agora</div>
          <span className="section-note">{ROTULO_TIPO[principal.tipo]}</span>
        </div>
      </div>

      <div className="foco-principal">
        <div className="foco-principal-topo">
          <span className="foco-principal-icone">
            <IconeFoco nome={iconeDaAcao(principal.tipo)} />
            {principal.tipo === "parado" && <i aria-hidden>!</i>}
          </span>
          <div className="foco-principal-identidade">
            <div className="foco-principal-titulo">
              <h3>{tituloPrincipal}</h3>
              {diasParado != null && (
                <span className="foco-tempo"><IconeFoco nome="relogio" /> {diasParado} dia{diasParado === 1 ? "" : "s"} parado</span>
              )}
            </div>
            <p>{identificacao}</p>
          </div>
        </div>

        <div className="foco-principal-conteudo">
          {(proprietario || endereco) && (
            <div className="foco-principal-dados" aria-label="Dados do imóvel e do proprietário">
              {proprietario && (
                <div className="foco-principal-dado">
                  <span className="foco-dado-icone"><IconeFoco nome="pessoa" /></span>
                  <span className="foco-dado-texto"><small>Proprietário</small><strong>{proprietario}</strong></span>
                </div>
              )}
              {endereco && (
                <div className="foco-principal-dado">
                  <span className="foco-dado-icone"><IconeFoco nome="endereco" /></span>
                  <span className="foco-dado-texto"><small>Endereço</small><strong title={endereco}>{endereco}</strong></span>
                </div>
              )}
            </div>
          )}
          <div className="foco-principal-motivo">
            <IconeFoco nome="calendario" />
            <small>{desde ? `Sem movimentação desde ${desde}` : principal.motivo}</small>
          </div>
        </div>
        <button type="button" className="btn btn-primary foco-principal-btn" onClick={() => abrirAcao(principal)}>
          {rotuloBotao(principal)} <span aria-hidden>→</span>
        </button>
      </div>
    </div>
  );
}
