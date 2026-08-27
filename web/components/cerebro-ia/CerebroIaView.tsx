"use client";

import Link from "next/link";
import { useCallback, useEffect, useState, type CSSProperties, type ReactNode } from "react";
import IconeSistema from "@/components/Icone";
import type { AtividadeIa } from "@/lib/calculo/atividadeIa";
import { carregarAtividadesIa, type RespostaAtividadesIa } from "@/lib/ia/atividades";
import { useAppStore } from "@/lib/store";
import styles from "./CerebroIaView.module.css";

type NomeIcone =
  | "analise"
  | "atendimento"
  | "cerebro"
  | "contexto"
  | "crm"
  | "ferramentas"
  | "imoveis"
  | "leads"
  | "pergunta"
  | "protocolos"
  | "resposta"
  | "validacoes"
  | "whatsapp";

interface NoCerebro {
  id: string;
  rotulo: string;
  descricao: string;
  icone: NomeIcone;
  x: number;
  y: number;
  caminho: string;
}

type ClassificacaoDado = "REAL" | "DERIVÁVEL";

interface FonteIa {
  rotulo: string;
  valor: string;
  icone: NomeIcone;
  classificacao: ClassificacaoDado;
}

interface DadosCerebroIa {
  fontes: FonteIa[];
  atividades: AtividadeIa[];
  carregandoAtividades: boolean;
  erroAtividades: string | null;
  recarregarAtividades: () => Promise<void>;
}

const NOS: NoCerebro[] = [
  {
    id: "protocolos",
    rotulo: "Protocolos",
    descricao: "Regras e informações que orientam a IA.",
    icone: "protocolos",
    x: 50,
    y: 10,
    caminho: "M400 210 C400 174 400 144 400 90",
  },
  {
    id: "contexto",
    rotulo: "Contexto",
    descricao: "Entendimento da conversa, da tela e da solicitação atual.",
    icone: "contexto",
    x: 22,
    y: 19,
    caminho: "M340 226 C298 190 262 132 176 112",
  },
  {
    id: "crm",
    rotulo: "CRM",
    descricao: "Dados do Angario que o usuário já pode consultar.",
    icone: "crm",
    x: 78,
    y: 19,
    caminho: "M460 226 C502 190 538 132 624 112",
  },
  {
    id: "imoveis",
    rotulo: "Imóveis",
    descricao: "Informações da carteira usadas para responder com precisão.",
    icone: "imoveis",
    x: 14,
    y: 38,
    caminho: "M326 248 C270 226 218 202 112 212",
  },
  {
    id: "atendimento",
    rotulo: "Atendimento",
    descricao: "Condução clara e coerente de cada conversa.",
    icone: "atendimento",
    x: 86,
    y: 38,
    caminho: "M474 248 C530 226 582 202 688 212",
  },
  {
    id: "analise",
    rotulo: "Análise",
    descricao: "Leitura organizada dos fatos antes de formar a resposta.",
    icone: "analise",
    x: 13,
    y: 62,
    caminho: "M326 282 C260 292 218 320 104 322",
  },
  {
    id: "ferramentas",
    rotulo: "Ferramentas",
    descricao: "Consultas seguras que ajudam a IA a encontrar fatos atuais.",
    icone: "ferramentas",
    x: 87,
    y: 62,
    caminho: "M474 282 C540 292 582 320 696 322",
  },
  {
    id: "leads",
    rotulo: "Leads",
    descricao: "Dados do contato vinculados à operação do usuário.",
    icone: "leads",
    x: 21,
    y: 79,
    caminho: "M345 318 C314 356 270 404 168 410",
  },
  {
    id: "validacoes",
    rotulo: "Validações",
    descricao: "Checagens de regras, consistência e segurança antes da entrega.",
    icone: "validacoes",
    x: 79,
    y: 79,
    caminho: "M455 318 C486 356 530 404 632 410",
  },
  {
    id: "whatsapp",
    rotulo: "WhatsApp",
    descricao: "Canal que pode integrar o fluxo de atendimento quando está configurado.",
    icone: "whatsapp",
    x: 36,
    y: 91,
    caminho: "M374 328 C360 388 340 440 288 468",
  },
  {
    id: "resposta",
    rotulo: "Resposta",
    descricao: "Entrega final, clara e baseada apenas no que foi validado.",
    icone: "resposta",
    x: 64,
    y: 91,
    caminho: "M426 328 C440 388 460 440 512 468",
  },
];

const ETAPAS_FLUXO: Array<{ rotulo: string; icone: NomeIcone }> = [
  { rotulo: "Pergunta do usuário", icone: "pergunta" },
  { rotulo: "Intenção", icone: "analise" },
  { rotulo: "Consulta CRM", icone: "crm" },
  { rotulo: "Protocolos", icone: "protocolos" },
  { rotulo: "Validação", icone: "validacoes" },
  { rotulo: "Resposta", icone: "resposta" },
];

function quantidadeComRotulo(quantidade: number, singular: string, plural: string): string {
  return `${quantidade} ${quantidade === 1 ? singular : plural}`;
}

function useDadosCerebroIa(): DadosCerebroIa {
  const carregado = useAppStore((estado) => estado.carregado);
  const imoveis = useAppStore((estado) => estado.imoveis);
  const protocolos = useAppStore((estado) => estado.protocolos);
  const protocolosAtivos = protocolos.filter((protocolo) => !protocolo.arquivado).length;
  const [atividades, setAtividades] = useState<AtividadeIa[]>([]);
  const [carregandoAtividades, setCarregandoAtividades] = useState(true);
  const [erroAtividades, setErroAtividades] = useState<string | null>(null);

  const aplicarAtividades = useCallback((resultado: RespostaAtividadesIa) => {
    setAtividades(resultado.atividades);
    setErroAtividades(resultado.ok ? null : resultado.mensagem || "Não foi possível carregar o histórico.");
    setCarregandoAtividades(false);
  }, []);

  const recarregarAtividades = useCallback(async () => {
    setCarregandoAtividades(true);
    const resultado = await carregarAtividadesIa();
    aplicarAtividades(resultado);
  }, [aplicarAtividades]);

  useEffect(() => {
    let ativo = true;
    void carregarAtividadesIa().then((resultado) => {
      if (ativo) aplicarAtividades(resultado);
    });
    return () => { ativo = false; };
  }, [aplicarAtividades]);

  return {
    fontes: [
      {
        rotulo: "CRM",
        valor: carregado
          ? quantidadeComRotulo(imoveis.length, "imóvel visível", "imóveis visíveis")
          : "Carregando…",
        icone: "crm",
        classificacao: "DERIVÁVEL",
      },
      {
        rotulo: "Protocolos",
        valor: carregado
          ? quantidadeComRotulo(protocolosAtivos, "ativo", "ativos")
          : "Carregando…",
        icone: "protocolos",
        classificacao: "DERIVÁVEL",
      },
    ],
    atividades,
    carregandoAtividades,
    erroAtividades,
    recarregarAtividades,
  };
}

function Icone({ nome, tamanho = 20 }: { nome: NomeIcone; tamanho?: number }) {
  if (nome === "whatsapp") {
    return <IconeSistema nome="whatsapp" tamanho={tamanho} />;
  }

  const comuns = {
    width: tamanho,
    height: tamanho,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  const desenhos: Record<Exclude<NomeIcone, "whatsapp">, ReactNode> = {
    analise: <><path d="M4 19V10M10 19V6M16 19v-5M3 19h18" /><path d="m4 7 5-3 5 4 6-5" /></>,
    atendimento: <><path d="M4 13v-2a8 8 0 0 1 16 0v2" /><path d="M4 13H2v5h4v-7H4M20 13h2v5h-4v-7h2M18 20h-4" /></>,
    cerebro: <><path d="M9.5 4.5A3 3 0 0 0 4 6v2a3 3 0 0 0-1 5.5A3.5 3.5 0 0 0 6.5 19H10V5.5a2 2 0 0 0-.5-1Z" /><path d="M14.5 4.5A3 3 0 0 1 20 6v2a3 3 0 0 1 1 5.5 3.5 3.5 0 0 1-3.5 5.5H14V5.5a2 2 0 0 1 .5-1ZM7 9h3M14 9h3M6 14h4M14 14h4" /></>,
    contexto: <><path d="M21 15a4 4 0 0 1-4 4H8l-5 3 1.5-4A7 7 0 0 1 3 13V8a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4Z" /><path d="M8 11h.01M12 11h.01M16 11h.01" /></>,
    crm: <><circle cx="9" cy="8" r="3" /><circle cx="17" cy="9" r="2.5" /><path d="M3 20v-1a6 6 0 0 1 12 0v1M14 14.5a5 5 0 0 1 7 4.5v1" /></>,
    ferramentas: <><path d="M14.5 6.5a4 4 0 0 0-5-5l2.2 2.2-2.5 2.5L7 4a4 4 0 0 0 5 5L4 17a2 2 0 0 0 3 3l8-8a4 4 0 0 0 5-5l-2.2 2.2-2.5-2.5Z" /></>,
    imoveis: <><path d="m3 11 9-8 9 8" /><path d="M5 10v10h14V10M9 20v-6h6v6" /></>,
    leads: <><circle cx="10" cy="8" r="4" /><path d="M3 21v-2a7 7 0 0 1 14 0v2M19 8v6M16 11h6" /></>,
    pergunta: <><path d="M21 15a4 4 0 0 1-4 4H8l-5 3 1.5-4A7 7 0 0 1 3 13V8a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4Z" /></>,
    protocolos: <><path d="M6 2h9l4 4v16H6z" /><path d="M14 2v5h5M9 12h6M9 16h6" /></>,
    resposta: <><path d="m22 2-9 20-3-9-8-4Z" /><path d="M22 2 10 13" /></>,
    validacoes: <><path d="m12 2 8 4v6c0 5-3.4 8.7-8 10-4.6-1.3-8-5-8-10V6Z" /><path d="m8.5 12.5 2.2 2.2 4.8-5" /></>,
  };

  return <svg {...comuns}>{desenhos[nome]}</svg>;
}

function TituloCard({ icone, children }: { icone: NomeIcone; children: ReactNode }) {
  return (
    <div className={styles.tituloCard}>
      <span className={styles.iconeTitulo}><Icone nome={icone} tamanho={19} /></span>
      <h2>{children}</h2>
    </div>
  );
}

function MapaCerebral() {
  const [noAtivo, setNoAtivo] = useState(NOS[0]);

  return (
    <section className={`${styles.card} ${styles.mapaCard}`} aria-labelledby="titulo-mapa-cerebral">
      <h2 id="titulo-mapa-cerebral" className={styles.srOnly}>Mapa visual do Cérebro da IA</h2>
      <div className={styles.mapa}>
        <svg className={styles.conexoes} viewBox="0 0 800 520" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <radialGradient id="halo-cerebro">
              <stop offset="0" stopColor="currentColor" stopOpacity=".18" />
              <stop offset="1" stopColor="currentColor" stopOpacity="0" />
            </radialGradient>
          </defs>
          <circle className={styles.haloFundo} cx="400" cy="270" r="210" fill="url(#halo-cerebro)" />
          <g className={styles.trilhasSecundarias}>
            <path d="M95 150 C230 55 280 178 400 95 S590 110 714 68" />
            <path d="M65 270 C205 182 252 400 400 248 S612 186 740 270" />
            <path d="M90 382 C240 480 288 322 400 444 S590 402 728 444" />
            <path d="M230 55 C276 180 235 245 400 270 S550 340 575 485" />
          </g>
          <g className={styles.trilhasPrincipais}>
            {NOS.map((no) => <path key={no.id} d={no.caminho} />)}
          </g>
          <g className={styles.pulsos}>
            {NOS.map((no, indice) => (
              <circle key={no.id} r="3">
                <animateMotion dur={`${3.2 + (indice % 4) * 0.55}s`} repeatCount="indefinite" path={no.caminho} />
              </circle>
            ))}
          </g>
        </svg>

        <div className={styles.nucleo}>
          <span className={styles.nucleoIcone}><Icone nome="cerebro" tamanho={46} /></span>
          <strong>Angario AI</strong>
          <small>Interpreta · consulta · valida</small>
        </div>

        <div className={styles.nos}>
          {NOS.map((no) => (
            <button
              key={no.id}
              type="button"
              className={`${styles.no} ${noAtivo.id === no.id ? styles.noAtivo : ""}`}
              style={{ "--x": `${no.x}%`, "--y": `${no.y}%` } as CSSProperties}
              onMouseEnter={() => setNoAtivo(no)}
              onFocus={() => setNoAtivo(no)}
              onClick={() => setNoAtivo(no)}
              aria-pressed={noAtivo.id === no.id}
              aria-describedby="explicacao-no"
            >
              <Icone nome={no.icone} tamanho={20} />
              <span>{no.rotulo}</span>
            </button>
          ))}
        </div>
      </div>
      <div className={styles.explicacaoNo} id="explicacao-no" aria-live="polite">
        <span><Icone nome={noAtivo.icone} tamanho={18} /></span>
        <p><strong>{noAtivo.rotulo}</strong>{noAtivo.descricao}</p>
        <small>Explore os nós</small>
      </div>
    </section>
  );
}

function StatusDaIa({ fontes }: { fontes: FonteIa[] }) {
  return (
    <section className={`${styles.card} ${styles.cardLateral}`} aria-labelledby="titulo-status-ia">
      <TituloCard icone="cerebro"><span id="titulo-status-ia">Fontes disponíveis para a IA</span></TituloCard>
      <div className={styles.listaStatus}>
        {fontes.map((item) => (
          <div className={styles.statusItem} key={item.rotulo}>
            <span className={styles.statusIcone}><Icone nome={item.icone} tamanho={16} /></span>
            <strong>{item.rotulo}</strong>
            <span className={styles.statusValor}>{item.valor}</span>
          </div>
        ))}
      </div>
      <p className={styles.notaFonte}>Contagens calculadas com os dados que você pode acessar.</p>
    </section>
  );
}

function formatarConclusao(valor: string): string {
  const data = new Date(valor);
  if (Number.isNaN(data.getTime())) return valor;
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(data);
}

function UltimaAtividade({
  atividades,
  carregando,
  erro,
  aoAtualizar,
}: {
  atividades: AtividadeIa[];
  carregando: boolean;
  erro: string | null;
  aoAtualizar: () => Promise<void>;
}) {
  return (
    <section className={`${styles.card} ${styles.cardLateral}`} aria-labelledby="titulo-atividade-ia">
      <div className={styles.cabecalhoAtividade}>
        <TituloCard icone="analise"><span id="titulo-atividade-ia">Atividade recente</span></TituloCard>
        <button type="button" onClick={() => void aoAtualizar()} disabled={carregando}>
          {carregando ? "Atualizando…" : "Atualizar"}
        </button>
      </div>
      {atividades.length > 0 ? (
        <div className={styles.listaAtividades} aria-live="polite">
          {atividades.map((atividade) => (
            <article className={styles.atividade} key={atividade.id}>
              <span className={styles.atividadeIcone}><Icone nome={atividade.icone} tamanho={17} /></span>
              <div>
                <strong>{atividade.titulo}</strong>
                <span>Fluxo: {atividade.fluxo.join(" → ")}</span>
                <time dateTime={atividade.concluidaEm}>{formatarConclusao(atividade.concluidaEm)}</time>
              </div>
            </article>
          ))}
        </div>
      ) : carregando ? (
        <div className={styles.atividadeVazia} aria-live="polite">
          <span className={styles.atividadeIcone}><Icone nome="analise" tamanho={18} /></span>
          <div>
            <strong>Carregando atividade…</strong>
            <p>Buscando suas interações recentes com a IA.</p>
          </div>
        </div>
      ) : (
        <div className={styles.atividadeVazia}>
          <span className={styles.atividadeIcone}><Icone nome="analise" tamanho={18} /></span>
          <div>
            <strong>{erro ? "Histórico indisponível" : "Nenhuma interação com IA ainda"}</strong>
            <p>{erro || "Quando você usar um recurso de IA do Angario, a atividade aparecerá aqui."}</p>
          </div>
        </div>
      )}
    </section>
  );
}

function FluxoDaIa() {
  return (
    <section className={`${styles.card} ${styles.fluxoCard}`} aria-labelledby="titulo-fluxo-ia">
      <TituloCard icone="analise"><span id="titulo-fluxo-ia">Como a IA processa uma solicitação</span></TituloCard>
      <ol className={styles.etapasFluxo}>
        {ETAPAS_FLUXO.map((etapa, indice) => (
          <li key={etapa.rotulo}>
            <div className={styles.etapaIcone}><Icone nome={etapa.icone} tamanho={24} /></div>
            <span className={styles.numeroEtapa}>{indice + 1}</span>
            <strong>{etapa.rotulo}</strong>
            {indice < ETAPAS_FLUXO.length - 1 ? <i className={styles.setaEtapa} aria-hidden="true">→</i> : null}
          </li>
        ))}
      </ol>
      <div className={styles.resumoFluxo}>
        <span>VISÃO GERAL</span>
        <p>A IA interpreta a solicitação, consulta o sistema, valida as regras e entrega a resposta.</p>
      </div>
    </section>
  );
}

function ComoFunciona() {
  return (
    <section className={`${styles.card} ${styles.comoCard}`} aria-labelledby="titulo-como-funciona">
      <TituloCard icone="contexto"><span id="titulo-como-funciona">Como funciona?</span></TituloCard>
      <div className={styles.comoConteudo}>
        <div>
          <p>
            O Cérebro da IA não libera novos acessos. Ele apenas mostra, de forma visual, como a
            inteligência do Angario trabalha com os dados que você já tem permissão para usar.
          </p>
          <Link href="/assistente" className={styles.saibaMais}>
            Saiba mais sobre a IA do Angario <span aria-hidden="true">→</span>
          </Link>
        </div>
        <div className={styles.cerebroDecorativo} aria-hidden="true">
          <Icone nome="cerebro" tamanho={74} />
          <i /><i /><i />
        </div>
      </div>
    </section>
  );
}

export default function CerebroIaView() {
  const dados = useDadosCerebroIa();

  return (
    <div className={styles.pagina}>
      <header className={styles.cabecalhoPagina}>
        <div>
          <h1>Cérebro da IA</h1>
          <p>Como a IA do Angario interpreta, consulta, valida e responde dentro do sistema.</p>
        </div>
      </header>

      <div className={styles.layoutPrincipal}>
        <div className={styles.colunaPrincipal}>
          <MapaCerebral />
          <FluxoDaIa />
        </div>
        <aside className={styles.colunaLateral} aria-label="Resumo do funcionamento da IA">
          <StatusDaIa fontes={dados.fontes} />
          <UltimaAtividade
            atividades={dados.atividades}
            carregando={dados.carregandoAtividades}
            erro={dados.erroAtividades}
            aoAtualizar={dados.recarregarAtividades}
          />
          <ComoFunciona />
        </aside>
      </div>
    </div>
  );
}
