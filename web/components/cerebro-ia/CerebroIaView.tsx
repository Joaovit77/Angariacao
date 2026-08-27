"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from "react";
import IconeSistema from "@/components/Icone";
import type {
  AtividadeIa,
  CategoriaEtapaIa,
  EstadoEtapaIa,
  EtapaAtividadeIa,
  NoExecucaoIa,
} from "@/lib/calculo/atividadeIa";
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
  id: NoExecucaoIa;
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
    descricao: "Consultas e ações seguras, diferenciadas no painel da execução.",
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

const ROTULOS_CATEGORIA: Record<CategoriaEtapaIa, string> = {
  solicitacao: "Solicitação",
  processamento: "Processamento",
  consulta: "Consulta",
  regra: "Regra",
  validacao: "Validação",
  acao: "Ação",
  resultado: "Resultado",
};

const ROTULOS_ESTADO: Record<EstadoEtapaIa, string> = {
  concluido: "Concluída",
  aguardando: "Aguardando confirmação",
  bloqueado: "Não executada",
  erro: "Não concluída",
};

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
  if (nome === "whatsapp") return <IconeSistema nome="whatsapp" tamanho={tamanho} />;

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
    pergunta: <path d="M21 15a4 4 0 0 1-4 4H8l-5 3 1.5-4A7 7 0 0 1 3 13V8a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4Z" />,
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

function caminhoEntre(origem: NoCerebro, destino: NoCerebro, indice: number): string {
  const x1 = origem.x * 8;
  const y1 = origem.y * 5.2;
  const x2 = destino.x * 8;
  const y2 = destino.y * 5.2;
  const curva = indice % 2 === 0 ? 0.08 : -0.08;
  const cx = (x1 + x2) / 2 + (y2 - y1) * curva;
  const cy = (y1 + y2) / 2 - (x2 - x1) * curva;
  return `M${x1} ${y1} Q${cx} ${cy} ${x2} ${y2}`;
}

function MapaCerebral({
  execucao,
  noEmFoco,
  aoSobreporNo,
  aoSelecionarNo,
}: {
  execucao: AtividadeIa | null;
  noEmFoco: NoExecucaoIa | null;
  aoSobreporNo: (no: NoExecucaoIa | null) => void;
  aoSelecionarNo: (no: NoExecucaoIa) => void;
}) {
  const [noExplorado, setNoExplorado] = useState<NoExecucaoIa>("protocolos");
  const percurso = execucao?.percurso ?? [];
  const usados = new Set(percurso);
  const noExplicado = execucao ? noEmFoco : noExplorado;
  const dadosNo = NOS.find((no) => no.id === noExplicado) ?? NOS[0];
  const etapaFocada = execucao?.etapas.find((item) => item.no === noEmFoco);
  const conexoesExecucao = percurso.slice(1).flatMap((destinoId, indice) => {
    const origem = NOS.find((no) => no.id === percurso[indice]);
    const destino = NOS.find((no) => no.id === destinoId);
    return origem && destino ? [{ origem, destino, indice }] : [];
  });

  return (
    <section className={`${styles.card} ${styles.mapaCard} ${execucao ? styles.mapaEmExecucao : ""}`} aria-labelledby="titulo-mapa-cerebral">
      <div className={styles.cabecalhoMapa}>
        <div>
          <span>{execucao ? "VISÃO DA EXECUÇÃO" : "VISÃO GERAL"}</span>
          <h2 id="titulo-mapa-cerebral">{execucao ? execucao.titulo : "Mapa visual do Cérebro da IA"}</h2>
        </div>
        {execucao ? <small>{percurso.length} núcleos percorridos</small> : <small>Explore os nós</small>}
      </div>
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
            {NOS.map((no) => (
              <path key={no.id} d={no.caminho} className={execucao ? (usados.has(no.id) ? styles.trilhaUsada : styles.trilhaInativa) : ""} />
            ))}
          </g>
          {!execucao ? (
            <g className={styles.pulsos}>
              {NOS.map((no, indice) => (
                <circle key={no.id} r="3">
                  <animateMotion dur={`${3.2 + (indice % 4) * 0.55}s`} repeatCount="indefinite" path={no.caminho} />
                </circle>
              ))}
            </g>
          ) : (
            <g className={styles.trilhasExecucao} key={execucao.id}>
              {conexoesExecucao.map(({ origem, destino, indice }) => (
                <path
                  key={`${origem.id}-${destino.id}-${indice}`}
                  d={caminhoEntre(origem, destino, indice)}
                  pathLength={1}
                  style={{ "--ordem": indice } as CSSProperties}
                />
              ))}
            </g>
          )}
        </svg>

        <div className={styles.nucleo}>
          <span className={styles.nucleoIcone}><Icone nome="cerebro" tamanho={46} /></span>
          <strong>Angario AI</strong>
          <small>{execucao ? "Execução observada" : "Interpreta · consulta · valida"}</small>
        </div>

        <div className={styles.nos}>
          {NOS.map((no) => {
            const ordem = percurso.indexOf(no.id);
            const usado = ordem >= 0;
            const ativo = (execucao ? noEmFoco : noExplorado) === no.id;
            return (
              <button
                key={no.id}
                type="button"
                className={[
                  styles.no,
                  ativo ? styles.noAtivo : "",
                  execucao && usado ? styles.noPercorrido : "",
                  execucao && !usado ? styles.noInativo : "",
                ].filter(Boolean).join(" ")}
                style={{ "--x": `${no.x}%`, "--y": `${no.y}%`, "--ordem": ordem } as CSSProperties}
                onMouseEnter={() => execucao ? usado && aoSobreporNo(no.id) : setNoExplorado(no.id)}
                onMouseLeave={() => execucao && aoSobreporNo(null)}
                onFocus={() => execucao ? usado && aoSobreporNo(no.id) : setNoExplorado(no.id)}
                onBlur={() => execucao && aoSobreporNo(null)}
                onClick={() => {
                  if (execucao && usado) aoSelecionarNo(no.id);
                  if (!execucao) setNoExplorado(no.id);
                }}
                disabled={Boolean(execucao && !usado)}
                aria-pressed={ativo}
                aria-describedby="explicacao-no"
              >
                {execucao && usado ? <b className={styles.ordemNo}>{ordem + 1}</b> : null}
                <Icone nome={no.icone} tamanho={20} />
                <span>{no.rotulo}</span>
              </button>
            );
          })}
        </div>
      </div>
      <div className={styles.explicacaoNo} id="explicacao-no" aria-live="polite">
        <span><Icone nome={dadosNo.icone} tamanho={18} /></span>
        <p>
          <strong>{etapaFocada?.titulo ?? dadosNo.rotulo}</strong>
          {etapaFocada?.detalhe ?? (execucao ? "Toque em um nó aceso para relacioná-lo às etapas da execução." : dadosNo.descricao)}
        </p>
        <small>{execucao ? "CAMINHO OBSERVADO" : "EXPLORE OS NÓS"}</small>
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

function classeCategoria(categoria: CategoriaEtapaIa): string {
  return styles[`categoria${categoria[0].toUpperCase()}${categoria.slice(1)}` as keyof typeof styles];
}

function EtapaExecucao({
  etapa,
  indice,
  ativa,
  aoSobrepor,
  aoSelecionar,
}: {
  etapa: EtapaAtividadeIa;
  indice: number;
  ativa: boolean;
  aoSobrepor: (no: NoExecucaoIa | null) => void;
  aoSelecionar: (no: NoExecucaoIa) => void;
}) {
  return (
    <li>
      <button
        type="button"
        className={`${styles.etapaExecucao} ${ativa ? styles.etapaExecucaoAtiva : ""}`}
        onMouseEnter={() => aoSobrepor(etapa.no)}
        onMouseLeave={() => aoSobrepor(null)}
        onFocus={() => aoSobrepor(etapa.no)}
        onBlur={() => aoSobrepor(null)}
        onClick={() => aoSelecionar(etapa.no)}
        aria-pressed={ativa}
      >
        <span className={styles.numeroEtapa}>{indice + 1}</span>
        <span className={`${styles.tipoEtapa} ${classeCategoria(etapa.categoria)}`}>{ROTULOS_CATEGORIA[etapa.categoria]}</span>
        <strong>{etapa.titulo}</strong>
        <small>{etapa.detalhe}</small>
        {etapa.estado !== "concluido" ? <em data-estado={etapa.estado}>{ROTULOS_ESTADO[etapa.estado]}</em> : null}
      </button>
    </li>
  );
}

function HistoricoExecucoes({
  atividades,
  selecionada,
  aoSelecionar,
}: {
  atividades: AtividadeIa[];
  selecionada: AtividadeIa | null;
  aoSelecionar: (atividade: AtividadeIa) => void;
}) {
  return (
    <details className={styles.historico}>
      <summary>Ver histórico de execuções <span>{atividades.length}</span></summary>
      <div className={styles.listaHistorico}>
        {atividades.map((atividade) => (
          <button
            type="button"
            key={atividade.id}
            className={selecionada?.id === atividade.id ? styles.historicoAtivo : ""}
            onClick={() => aoSelecionar(atividade)}
            aria-current={selecionada?.id === atividade.id ? "true" : undefined}
          >
            <span className={styles.atividadeIcone}><Icone nome={atividade.icone} tamanho={17} /></span>
            <span>
              <strong>{atividade.titulo}</strong>
              <small>{atividade.resumo}</small>
              <time dateTime={atividade.concluidaEm}>{formatarConclusao(atividade.concluidaEm)}</time>
            </span>
          </button>
        ))}
      </div>
    </details>
  );
}

function PainelExecucao({
  atividades,
  selecionada,
  carregando,
  erro,
  noEmFoco,
  aoAtualizar,
  aoSelecionar,
  aoVoltar,
  aoSobreporNo,
  aoSelecionarNo,
}: {
  atividades: AtividadeIa[];
  selecionada: AtividadeIa | null;
  carregando: boolean;
  erro: string | null;
  noEmFoco: NoExecucaoIa | null;
  aoAtualizar: () => Promise<void>;
  aoSelecionar: (atividade: AtividadeIa) => void;
  aoVoltar: () => void;
  aoSobreporNo: (no: NoExecucaoIa | null) => void;
  aoSelecionarNo: (no: NoExecucaoIa) => void;
}) {
  const ultima = atividades[0] ?? null;
  return (
    <section className={`${styles.card} ${styles.cardLateral} ${styles.painelExecucao}`} aria-labelledby="titulo-execucao-ia">
      <div className={styles.cabecalhoAtividade}>
        <TituloCard icone="analise"><span id="titulo-execucao-ia">Execução da IA</span></TituloCard>
        <button type="button" onClick={() => void aoAtualizar()} disabled={carregando}>
          {carregando ? "Atualizando…" : "Atualizar"}
        </button>
      </div>

      {selecionada ? (
        <>
          <div className={styles.cabecalhoExecucaoSelecionada}>
            <div>
              <span data-estado={selecionada.estado}>{ROTULOS_ESTADO[selecionada.estado]}</span>
              <h3>{selecionada.titulo}</h3>
              <time dateTime={selecionada.concluidaEm}>{formatarConclusao(selecionada.concluidaEm)}</time>
            </div>
            <button type="button" onClick={aoVoltar}>Visão geral</button>
          </div>
          <p className={styles.notaPrivacidade}>
            O histórico mostra eventos observáveis. O texto da solicitação e a resposta não são guardados aqui.
          </p>
          {!selecionada.detalhesObservados ? (
            <p className={styles.avisoDetalhes}>
              Esta execução é real, mas os registros disponíveis não detalham suas consultas. O mapa destaca apenas o que pode ser confirmado.
            </p>
          ) : null}
          <ol className={styles.etapasExecucao}>
            {selecionada.etapas.map((item, indice) => (
              <EtapaExecucao
                key={item.id}
                etapa={item}
                indice={indice}
                ativa={noEmFoco === item.no}
                aoSobrepor={aoSobreporNo}
                aoSelecionar={aoSelecionarNo}
              />
            ))}
          </ol>
        </>
      ) : ultima ? (
        <div className={styles.ultimaExecucao}>
          <span>ÚLTIMA EXECUÇÃO</span>
          <h3>{ultima.titulo}</h3>
          <p>{ultima.resumo}</p>
          <time dateTime={ultima.concluidaEm}>{formatarConclusao(ultima.concluidaEm)}</time>
          <button type="button" onClick={() => aoSelecionar(ultima)}>Visualizar no cérebro</button>
        </div>
      ) : carregando ? (
        <div className={styles.atividadeVazia} aria-live="polite">
          <span className={styles.atividadeIcone}><Icone nome="analise" tamanho={18} /></span>
          <div><strong>Carregando execuções…</strong><p>Buscando suas interações recentes com a IA.</p></div>
        </div>
      ) : (
        <div className={styles.atividadeVazia}>
          <span className={styles.atividadeIcone}><Icone nome="analise" tamanho={18} /></span>
          <div>
            <strong>{erro ? "Histórico indisponível" : "Nenhuma interação com IA ainda"}</strong>
            <p>{erro || "Quando você usar um recurso de IA do Angario, a execução aparecerá aqui."}</p>
          </div>
        </div>
      )}
      {atividades.length > 0 ? <HistoricoExecucoes atividades={atividades} selecionada={selecionada} aoSelecionar={aoSelecionar} /> : null}
    </section>
  );
}

function ComoInterpretar() {
  const itens: Array<{ categoria: CategoriaEtapaIa; titulo: string; texto: string }> = [
    { categoria: "consulta", titulo: "Consultas", texto: "Leituras de CRM, imóveis, conversas e outras fontes." },
    { categoria: "processamento", titulo: "Processamento", texto: "Interpretação, análise e organização da operação." },
    { categoria: "acao", titulo: "Ações", texto: "Preparações ou alterações executadas por ferramentas." },
    { categoria: "validacao", titulo: "Validações", texto: "Checagens aplicadas antes de entregar ou executar." },
  ];
  return (
    <section className={`${styles.card} ${styles.comoLerCard}`} aria-labelledby="titulo-como-interpretar">
      <div className={styles.comoLerTexto}>
        <TituloCard icone="contexto"><span id="titulo-como-interpretar">Como interpretar o mapa</span></TituloCard>
        <p>
          O Cérebro da IA não libera novos acessos nem mostra pensamentos internos. Ele relaciona somente solicitações,
          consultas, regras, validações, ações e resultados observáveis do sistema.
        </p>
        <Link href="/assistente" className={styles.saibaMais}>Conhecer o Assistente <span aria-hidden="true">→</span></Link>
      </div>
      <div className={styles.legendaExecucao}>
        {itens.map((item) => (
          <div key={item.categoria}>
            <span className={`${styles.tipoEtapa} ${classeCategoria(item.categoria)}`}>{item.titulo}</span>
            <small>{item.texto}</small>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function CerebroIaView() {
  const dados = useDadosCerebroIa();
  const [execucaoId, setExecucaoId] = useState<string | null>(null);
  const [noSelecionado, setNoSelecionado] = useState<NoExecucaoIa | null>(null);
  const [noSobreposto, setNoSobreposto] = useState<NoExecucaoIa | null>(null);
  const execucao = useMemo(
    () => dados.atividades.find((atividade) => atividade.id === execucaoId) ?? null,
    [dados.atividades, execucaoId],
  );
  const noEmFoco = noSobreposto ?? noSelecionado;

  const selecionarExecucao = (atividade: AtividadeIa) => {
    setExecucaoId(atividade.id);
    setNoSelecionado(null);
    setNoSobreposto(null);
  };
  const voltarVisaoGeral = () => {
    setExecucaoId(null);
    setNoSelecionado(null);
    setNoSobreposto(null);
  };

  return (
    <div className={styles.pagina}>
      <header className={styles.cabecalhoPagina}>
        <div>
          <h1>Cérebro da IA</h1>
          <p>Selecione uma execução para ver o caminho operacional percorrido pela IA do Angario.</p>
        </div>
      </header>

      <div className={styles.layoutPrincipal}>
        <div className={styles.colunaPrincipal}>
          <MapaCerebral
            execucao={execucao}
            noEmFoco={noEmFoco}
            aoSobreporNo={setNoSobreposto}
            aoSelecionarNo={setNoSelecionado}
          />
          <ComoInterpretar />
        </div>
        <aside className={styles.colunaLateral} aria-label="Execuções e fontes da IA">
          <PainelExecucao
            atividades={dados.atividades}
            selecionada={execucao}
            carregando={dados.carregandoAtividades}
            erro={dados.erroAtividades}
            noEmFoco={noEmFoco}
            aoAtualizar={dados.recarregarAtividades}
            aoSelecionar={selecionarExecucao}
            aoVoltar={voltarVisaoGeral}
            aoSobreporNo={setNoSobreposto}
            aoSelecionarNo={setNoSelecionado}
          />
          <StatusDaIa fontes={dados.fontes} />
        </aside>
      </div>
    </div>
  );
}
