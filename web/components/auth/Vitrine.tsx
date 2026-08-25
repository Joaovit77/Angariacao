"use client";

import { motion, useReducedMotion } from "framer-motion";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

type Icone =
  | "dashboard"
  | "pipeline"
  | "agenda"
  | "ia"
  | "avaliacao"
  | "whatsapp"
  | "mapa"
  | "relatorios"
  | "integracoes";

interface Funcionalidade {
  id: string;
  titulo: string;
  icone: Icone;
  sobrelinha: string;
  headline: string;
  frase: string;
  problema: string;
  solucoes: string[];
  resultado: string;
}

interface Props {
  aoEntrar: () => void;
  aoCriarConta: () => void;
}

const CONSULTA_MOBILE = "(max-width: 720px)";

function assinarLarguraMobile(notificar: () => void) {
  const consulta = window.matchMedia(CONSULTA_MOBILE);
  consulta.addEventListener("change", notificar);
  return () => consulta.removeEventListener("change", notificar);
}

const lerLarguraMobile = () => window.matchMedia(CONSULTA_MOBILE).matches;
const lerLarguraServidor = () => false;

const FUNCIONALIDADES: Funcionalidade[] = [
  {
    id: "dashboard",
    titulo: "Dashboard",
    icone: "dashboard",
    sobrelinha: "Visão do dia",
    headline: "Tenha sua operação inteira em uma única tela.",
    frase: "Comece o dia sabendo exatamente onde sua atenção gera mais resultado.",
    problema:
      "Quando números, tarefas e negociações vivem em lugares diferentes, o gestor descobre os gargalos tarde demais.",
    solucoes: [
      "Métricas da operação atualizadas em tempo real",
      "Foco do dia ordenado pela próxima ação",
      "Imóveis angariados e evolução da carteira",
      "Produtividade da equipe em uma leitura rápida",
    ],
    resultado: "Tomada de decisão imediata, sem procurar dados em várias telas.",
  },
  {
    id: "pipeline",
    titulo: "Pipeline",
    icone: "pipeline",
    sobrelinha: "Controle da operação",
    headline: "Nunca mais perca uma oportunidade de angariar.",
    frase: "Cada imóvel avança com contexto, responsável e próxima ação visíveis.",
    problema:
      "Oportunidades se perdem quando o acompanhamento depende da memória do corretor ou de planilhas que ninguém atualiza.",
    solucoes: [
      "Etapas claras da prospecção ao imóvel angariado",
      "Responsáveis e histórico preservados em cada card",
      "Sinalização de imóveis sem movimento",
      "Follow-up visual, no ponto certo da negociação",
    ],
    resultado: "Uma carteira em movimento, com menos oportunidades esquecidas.",
  },
  {
    id: "agenda",
    titulo: "Agenda",
    icone: "agenda",
    sobrelinha: "Rotina organizada",
    headline: "Organize visitas, retornos e prioridades automaticamente.",
    frase: "Compromissos e pendências deixam de disputar espaço na sua memória.",
    problema:
      "Visitas, retornos e confirmações espalhados entre conversas e calendários criam atrasos e retrabalho.",
    solucoes: [
      "Calendário com compromissos ligados ao imóvel",
      "Lembretes para visitas e retornos importantes",
      "Prioridades com e sem horário na mesma visão",
      "Follow-ups integrados à rotina do corretor",
    ],
    resultado: "Mais pontualidade e uma rotina organizada mesmo nos dias cheios.",
  },
  {
    id: "inteligencia-artificial",
    titulo: "Inteligência Artificial",
    icone: "ia",
    sobrelinha: "Copiloto imobiliário",
    headline: "Uma IA treinada para trabalhar como corretor.",
    frase: "Contexto do seu negócio para transformar tarefas longas em decisões simples.",
    problema:
      "A equipe perde tempo produzindo textos, procurando informações e interpretando dados que já existem dentro da operação.",
    solucoes: [
      "Gera anúncios e abordagens adequados ao imóvel",
      "Analisa proprietários e sugere respostas",
      "Responde dúvidas com os protocolos da imobiliária",
      "Avalia imóveis e consulta dados internos",
      "Mantém a revisão humana antes de qualquer ação",
    ],
    resultado: "Mais capacidade operacional sem perder contexto, controle ou a voz da equipe.",
  },
  {
    id: "avaliacao-de-imoveis",
    titulo: "Avaliação de Imóveis",
    icone: "avaliacao",
    sobrelinha: "Inteligência de mercado",
    headline: "Precifique com muito mais precisão.",
    frase: "Transforme referências de mercado em uma recomendação clara para o proprietário.",
    problema:
      "Uma avaliação sem comparáveis e critérios claros fragiliza a negociação e pode deixar o imóvel parado.",
    solucoes: [
      "Imóveis comparáveis reunidos em uma análise",
      "Fatores de valorização considerados no contexto",
      "Sugestão de faixa de preço, não um número solto",
      "Apoio da IA para explicar a recomendação",
    ],
    resultado: "Mais segurança para defender o preço e conquistar a confiança do proprietário.",
  },
  {
    id: "whatsapp",
    titulo: "WhatsApp",
    icone: "whatsapp",
    sobrelinha: "Relacionamento centralizado",
    headline: "Centralize o relacionamento com proprietários.",
    frase: "A conversa continua humana; o histórico e a próxima ação ficam organizados.",
    problema:
      "Quando as conversas ficam isoladas no celular, a equipe perde contexto, timing e continuidade no atendimento.",
    solucoes: [
      "Histórico de mensagens ligado ao imóvel",
      "Respostas e áudios organizados em uma linha do tempo",
      "Follow-ups preparados no momento certo",
      "Automações com confirmação antes do envio",
    ],
    resultado: "Relacionamentos consistentes usando o número que o corretor já conhece.",
  },
  {
    id: "mapa-inteligente",
    titulo: "Mapa Inteligente",
    icone: "mapa",
    sobrelinha: "Visão territorial",
    headline: "Visualize oportunidades pela cidade inteira.",
    frase: "Leia a carteira pela geografia e encontre regiões que merecem atenção.",
    problema:
      "Listas escondem padrões de localização e dificultam perceber concentração, cobertura e novas frentes de prospecção.",
    solucoes: [
      "Mapa de Londrina com a carteira distribuída por região",
      "Imóveis e status identificados visualmente",
      "Regiões estratégicas evidenciadas no território",
      "Prospecção geográfica com mais contexto",
    ],
    resultado: "Uma visão espacial da operação para prospectar com mais intenção.",
  },
  {
    id: "relatorios",
    titulo: "Relatórios",
    icone: "relatorios",
    sobrelinha: "Gestão baseada em dados",
    headline: "Transforme dados em decisões.",
    frase: "Entenda o esforço, a conversão e o que precisa mudar na próxima rodada.",
    problema:
      "Sem indicadores confiáveis, volume de atividade parece resultado e decisões importantes viram opinião.",
    solucoes: [
      "Gráficos claros para acompanhar a evolução",
      "Produtividade por período e frente de trabalho",
      "Conversão e motivos de perda visíveis",
      "Exportação pronta para reuniões e prestação de contas",
    ],
    resultado: "Decisões sustentadas pelo trabalho real registrado na operação.",
  },
  {
    id: "integracoes",
    titulo: "Integrações",
    icone: "integracoes",
    sobrelinha: "Ecossistema conectado",
    headline: "O Angario conversa com todo o seu ecossistema.",
    frase: "Conecte os canais da operação sem fragmentar o trabalho da equipe.",
    problema:
      "Ferramentas desconectadas criam cadastros duplicados, perda de contexto e processos que param na troca de sistema.",
    solucoes: [
      "Integração com o CRM e a rotina imobiliária",
      "WhatsApp conectado pela Evolution API",
      "Inteligência artificial aplicada aos dados da operação",
      "Supabase como base segura e isolada por conta",
    ],
    resultado: "Um fluxo contínuo de informação, da prospecção à gestão.",
  },
];

const CAMINHOS_ICONES: Record<Icone, React.ReactNode> = {
  dashboard: <><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></>,
  pipeline: <><rect x="3" y="4" width="5" height="16" rx="1.5" /><rect x="9.5" y="4" width="5" height="11" rx="1.5" /><rect x="16" y="4" width="5" height="7" rx="1.5" /><path d="M5.5 8h.01M12 8h.01M18.5 8h.01" /></>,
  agenda: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M8 3v4M16 3v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01" /></>,
  ia: <><path d="m12 3 1.45 4.05L17.5 8.5l-4.05 1.45L12 14l-1.45-4.05L6.5 8.5l4.05-1.45z" /><path d="m18.5 14.5.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8zM5 15l.65 1.85L7.5 17.5l-1.85.65L5 20l-.65-1.85-1.85-.65 1.85-.65z" /></>,
  avaliacao: <><path d="M3 20h18M5.5 17V9.5L12 4l6.5 5.5V17" /><path d="M9 17v-4h6v4M16 7.5l3-2.5" /><circle cx="19" cy="5" r="2" /></>,
  whatsapp: <><path d="M20.5 11.7a8.45 8.45 0 0 1-12.3 7.5L3.5 20.5 4.8 16A8.45 8.45 0 1 1 20.5 11.7Z" /><path d="M8.2 7.8c.25-.48.5-.49.73-.49h.55c.18 0 .37.07.48.34l.83 2.02c.1.23.05.42-.08.6l-.64.74a.5.5 0 0 0-.08.56c.68 1.32 1.73 2.37 3.05 3.05a.5.5 0 0 0 .56-.08l.74-.64c.18-.13.37-.18.6-.08l2.02.83c.27.11.34.3.34.48v.55c0 .23-.01.48-.49.73-.48.24-1.58.61-2.75.23-1.17-.38-2.64-1.07-4.16-2.59-1.52-1.52-2.21-2.99-2.59-4.16-.38-1.17-.01-2.27.23-2.75Z" /></>,
  mapa: <><path d="m3 6 5-3 8 3 5-3v15l-5 3-8-3-5 3zM8 3v15M16 6v15" /><path d="M12 7.5a2.5 2.5 0 0 0-2.5 2.5c0 2 2.5 4.5 2.5 4.5s2.5-2.5 2.5-4.5A2.5 2.5 0 0 0 12 7.5Z" /></>,
  relatorios: <><path d="M4 20V10M10 20V5M16 20v-7M22 20H2" /><path d="m4 7 6-4 6 6 5-4" /></>,
  integracoes: <><circle cx="12" cy="12" r="3" /><circle cx="12" cy="3" r="1.5" /><circle cx="21" cy="12" r="1.5" /><circle cx="12" cy="21" r="1.5" /><circle cx="3" cy="12" r="1.5" /><path d="M12 4.5V9M19.5 12H15M12 15v4.5M9 12H4.5" /></>,
};

function IconeFuncionalidade({ nome }: { nome: Icone }) {
  return <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{CAMINHOS_ICONES[nome]}</svg>;
}

function MolduraMockup({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <div className="mockup-app" aria-label={`Prévia da funcionalidade ${titulo}`}>
      <div className="mockup-barra"><span className="mockup-pontos"><i /><i /><i /></span><span>Angario · {titulo}</span><b><i /> ao vivo</b></div>
      <div className="mockup-corpo"><aside aria-hidden="true"><span className="ativo" /><span /><span /><span /><span /><span /></aside><div className="mockup-tela">{children}</div></div>
    </div>
  );
}

function MockupDashboard() {
  return <MolduraMockup titulo="Dashboard"><div className="mock-kpis">{[["Na carteira", "177"], ["Angariados", "12"], ["Respostas", "08"]].map(([r, v]) => <div key={r}><span>{r}</span><strong>{v}</strong><small>↗ este mês</small></div>)}</div><div className="mock-duplo"><div className="mock-lista"><b>Foco do dia</b>{[["Responder proprietários", "3"], ["Follow-ups pendentes", "20"], ["Visitas hoje", "2"]].map(([r, v]) => <span key={r}>{r}<strong>{v}</strong></span>)}</div><div className="mock-grafico"><b>Produtividade</b><div>{[42, 68, 51, 82, 63, 92, 76].map((v, i) => <i key={i} style={{ height: `${v}%` }} />)}</div></div></div></MolduraMockup>;
}

function MockupPipeline() {
  const colunas = [["NOVO CONTATO", ["Apto · Palhano", "Casa · Quebec"]], ["CONTATO FEITO", ["Studio · Centro", "Apto · Aurora"]], ["VISITA", ["Casa · Canadá"]], ["ANGARIADO", ["Apto · Gleba"]]] as const;
  return <MolduraMockup titulo="Pipeline"><div className="mock-kanban">{colunas.map(([titulo, cards], i) => <div key={titulo}><b><i />{titulo}<small>{cards.length}</small></b>{cards.map((card, j) => <span className={i === 1 && j === 1 ? "parado" : ""} key={card}><strong>{card}</strong><small>{i === 1 && j === 1 ? "6 dias sem movimento" : "Próxima ação definida"}</small><em>{["MR", "LA", "CS", "AV"][(i + j) % 4]}</em></span>)}</div>)}</div></MolduraMockup>;
}

function MockupAgenda() {
  return <MolduraMockup titulo="Agenda"><div className="mock-agenda-topo"><b>Agosto 2026</b><span>Hoje</span></div><div className="mock-agenda"><div className="mock-calendario">{["S", "T", "Q", "Q", "S", "S", "D"].map((d, i) => <b key={`${d}-${i}`}>{d}</b>)}{Array.from({ length: 28 }, (_, i) => <span className={i === 11 ? "hoje" : i === 15 || i === 17 ? "evento" : ""} key={i}>{i + 1}</span>)}</div><div className="mock-compromissos"><b>Próximos</b><span><i>10:00</i><strong>Visita · Gleba Palhano</strong><small>Sr. Antônio</small></span><span><i>14:30</i><strong>Retorno de avaliação</strong><small>Imóvel LD-142</small></span><span><i>16:00</i><strong>Follow-up proprietário</strong><small>Lembrete automático</small></span></div></div></MolduraMockup>;
}

function MockupIa() {
  return <MolduraMockup titulo="Assistente IA"><div className="mock-ia"><div className="mock-ia-selo"><IconeFuncionalidade nome="ia" /><span><b>Assistente Angario</b><small>Contexto da sua operação</small></span></div><div className="mock-ia-pergunta">Prepare uma abordagem para o proprietário deste apartamento na Gleba Palhano.</div><div className="mock-ia-resposta"><span>✦</span><p><b>Abordagem sugerida</b>Olá, Sr. Antônio. Analisei imóveis semelhantes na região e preparei uma avaliação atualizada, sem compromisso. Posso compartilhar a faixa de valor com você?</p></div><div className="mock-ia-acoes">{["Gerar anúncio", "Avaliar imóvel", "Analisar resposta", "Consultar carteira"].map((a) => <span key={a}>{a}</span>)}</div></div></MolduraMockup>;
}

function MockupAvaliacao() {
  return <MolduraMockup titulo="Avaliação"><div className="mock-avaliacao"><div className="mock-faixa"><span>Faixa recomendada</span><strong>R$ 2.350 — R$ 2.620</strong><small>Confiança alta · 8 comparáveis</small><div><i /><i /><b /></div></div><div className="mock-comparaveis"><b>Imóveis comparáveis</b>{[["Gleba Palhano", "R$ 2.480", "+3%"], ["Jardim Petrópolis", "R$ 2.390", "−1%"], ["Aurora", "R$ 2.570", "+5%"]].map(([l, v, d]) => <span key={l}><i /><strong>{l}<small>2 quartos · 68 m²</small></strong><b>{v}<small>{d}</small></b></span>)}</div></div></MolduraMockup>;
}

function MockupWhatsapp() {
  return <MolduraMockup titulo="WhatsApp"><div className="mock-whatsapp"><div className="mock-conversas"><b>Conversas</b>{[["Sr. Antônio", "Pode mandar sim", "2"], ["Marina R.", "Quanto vocês cobram?", "1"], ["Dona Célia", "Pode ser quinta", ""]].map(([n, m, q], i) => <span className={i === 0 ? "ativo" : ""} key={n}><i>{n.split(" ").map((p) => p[0]).join("").slice(0, 2)}</i><strong>{n}<small>{m}</small></strong>{q && <b>{q}</b>}</span>)}</div><div className="mock-chat"><b>Sr. Antônio <small>LD-142 · Gleba Palhano</small></b><span className="sai">Preparei uma avaliação atualizada da região. Posso enviar?</span><span className="entra">Pode mandar sim</span><em>IA sugeriu uma resposta · revisar antes de enviar</em></div></div></MolduraMockup>;
}

function MockupMapa() {
  return <MolduraMockup titulo="Mapa"><div className="mock-mapa"><div className="mock-mapa-filtros"><b>Londrina</b><span>● 177 imóveis</span><span>● 12 angariados</span></div><div className="mock-ruas"><i className="r1" /><i className="r2" /><i className="r3" /><i className="r4" /><i className="r5" /><i className="r6" /><span className="lago" /><b className="ponto p1">12</b><b className="ponto p2">8</b><b className="ponto p3">24</b><b className="ponto p4">5</b><em className="regiao">GLEBA PALHANO</em><em className="centro">CENTRO</em></div><div className="mock-mapa-card"><span>Região em destaque</span><b>Gleba Palhano</b><small>24 oportunidades · 6 em follow-up</small></div></div></MolduraMockup>;
}

function MockupRelatorios() {
  return <MolduraMockup titulo="Relatórios"><div className="mock-relatorio-topo"><span>Relatório de captação · Agosto</span><b>Exportar PDF ↗</b></div><div className="mock-relatorio"><div className="mock-relatorio-grafico"><b>Conversão por semana</b><div>{[32, 48, 43, 67, 58, 76, 84].map((v, i) => <span key={i}><i style={{ height: `${v}%` }} /></span>)}</div><small><i /> Contatos <i /> Angariações</small></div><div className="mock-relatorio-metricas">{[["Conversão", "18,4%", "+2,1%"], ["Respostas", "64", "+12"], ["Angariados", "12", "+4"]].map(([r, v, d]) => <span key={r}><small>{r}</small><strong>{v}</strong><b>{d}</b></span>)}</div></div></MolduraMockup>;
}

function MockupIntegracoes() {
  const nomes = ["WhatsApp", "Evolution API", "Supabase", "IA", "CRM"];
  return <MolduraMockup titulo="Integrações"><div className="mock-integracoes"><div className="mock-orbita"><div className="mock-orbita-centro"><IconeFuncionalidade nome="integracoes" /><b>ANGARIO</b></div>{nomes.map((n, i) => <span className={`i${i + 1}`} key={n}>{n}</span>)}</div><div className="mock-integracoes-status"><b>Ecossistema conectado</b>{nomes.slice(0, 4).map((n) => <span key={n}><i />{n}<small>Operacional</small></span>)}</div></div></MolduraMockup>;
}

function MockupFuncionalidade({ nome }: { nome: Icone }) {
  const mockups: Record<Icone, React.ReactNode> = {
    dashboard: <MockupDashboard />, pipeline: <MockupPipeline />, agenda: <MockupAgenda />,
    ia: <MockupIa />, avaliacao: <MockupAvaliacao />, whatsapp: <MockupWhatsapp />,
    mapa: <MockupMapa />, relatorios: <MockupRelatorios />, integracoes: <MockupIntegracoes />,
  };
  return mockups[nome];
}

export default function Vitrine({ aoEntrar, aoCriarConta }: Props) {
  const [ativa, setAtiva] = useState(FUNCIONALIDADES[0].id);
  const secoesRef = useRef<Record<string, HTMLElement | null>>({});
  const movimentoReduzido = useReducedMotion();
  const ehMobile = useSyncExternalStore(
    assinarLarguraMobile,
    lerLarguraMobile,
    lerLarguraServidor,
  );
  /* No celular, revelar um bloco só depois de ele cruzar o limiar da viewport
     faz o conteúdo já visível recuar e reaparecer durante o gesto. Mantemos a
     entrada editorial no desktop, onde não disputa com a rolagem por toque. */
  const semAnimacaoDeEntrada = movimentoReduzido || ehMobile;

  useEffect(() => {
    const secoes = FUNCIONALIDADES.map(({ id }) => secoesRef.current[id]).filter(
      (secao): secao is HTMLElement => secao !== null,
    );
    if (secoes.length === 0) return;
    const visiveis = new Map<string, number>();
    const observador = new IntersectionObserver(
      (entradas) => {
        entradas.forEach((entrada) => {
          if (entrada.isIntersecting) visiveis.set(entrada.target.id, entrada.intersectionRatio);
          else visiveis.delete(entrada.target.id);
        });
        const proxima = [...visiveis.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
        if (proxima) setAtiva(proxima);
      },
      { rootMargin: "-24% 0px -48% 0px", threshold: [0.08, 0.2, 0.4, 0.65] },
    );
    secoes.forEach((secao) => observador.observe(secao));
    return () => observador.disconnect();
  }, []);

  function navegarPara(id: string) {
    setAtiva(id);
    window.history.replaceState(null, "", `#${id}`);
    window.requestAnimationFrame(() => {
      secoesRef.current[id]?.scrollIntoView({ behavior: movimentoReduzido ? "auto" : "smooth", block: "start" });
    });
  }

  function itensDoMenu() {
    return FUNCIONALIDADES.map((funcionalidade) => (
      <button type="button" className={`explore-menu-item${ativa === funcionalidade.id ? " ativo" : ""}`} aria-current={ativa === funcionalidade.id ? "true" : undefined} onClick={() => navegarPara(funcionalidade.id)} key={funcionalidade.id}><span><IconeFuncionalidade nome={funcionalidade.icone} /></span>{funcionalidade.titulo}</button>
    ));
  }

  return (
    <>
    <section className="auth-showcase explore-angario" id="conheca-o-sistema">
      <div className="explore-menu-wrap">
        <nav className="explore-menu" aria-label="Navegação pelas funcionalidades">
          <div className="explore-menu-desktop">
            <div className="explore-menu-rolagem">
              {itensDoMenu()}
            </div>
          </div>
        </nav>
      </div>

      <header className="explore-intro">
        <motion.div initial={false} whileInView={semAnimacaoDeEntrada ? {} : { opacity: [0, 1], y: [22, 0] }} viewport={{ once: true, amount: 0.4 }} transition={{ duration: 0.55 }}>
          <span className="explore-sobrelinha">Explore o produto</span>
          <h2>Explore o Angario CRM</h2>
          <p>Uma operação imobiliária completa, conectada do primeiro contato à decisão. Escolha uma funcionalidade e veja como ela transforma o trabalho da equipe.</p>
        </motion.div>
        <div className="explore-intro-indicadores" aria-label="Resumo do produto"><span><strong>09</strong> frentes conectadas</span><span><strong>01</strong> fonte de verdade</span><span><strong>24/7</strong> operação organizada</span></div>
      </header>

      <div className="explore-funcionalidades">
        {FUNCIONALIDADES.map((funcionalidade, indice) => (
          <section className={`explore-feature${indice % 2 ? " invertida" : ""}${funcionalidade.icone === "ia" ? " principal" : ""}`} id={funcionalidade.id} ref={(elemento) => { secoesRef.current[funcionalidade.id] = elemento; }} key={funcionalidade.id}>
            <motion.div className="explore-feature-copy" initial={false} whileInView={semAnimacaoDeEntrada ? {} : { opacity: [0, 1], x: [indice % 2 ? 28 : -28, 0] }} viewport={{ once: true, amount: 0.22 }} transition={{ duration: 0.58, ease: [0.22, 1, 0.36, 1] }}>
              <span className="explore-feature-numero">{String(indice + 1).padStart(2, "0")} / {funcionalidade.sobrelinha}</span>
              <div className="explore-feature-icone"><IconeFuncionalidade nome={funcionalidade.icone} /></div>
              <h2>{funcionalidade.headline}</h2><p className="explore-feature-frase">{funcionalidade.frase}</p>
              <div className="explore-problema"><span>O problema</span><p>{funcionalidade.problema}</p></div>
              <div className="explore-solucao"><span>Como o Angario resolve</span><ul>{funcionalidade.solucoes.map((solucao) => <li key={solucao}>{solucao}</li>)}</ul></div>
              <div className="explore-resultado"><span>Resultado</span><strong>{funcionalidade.resultado}</strong></div>
            </motion.div>
            <motion.div className="explore-feature-visual" initial={false} whileInView={semAnimacaoDeEntrada ? {} : { opacity: [0, 1], y: [30, 0], scale: [0.985, 1] }} viewport={{ once: true, amount: 0.2 }} transition={{ duration: 0.66, delay: semAnimacaoDeEntrada ? 0 : 0.08, ease: [0.22, 1, 0.36, 1] }}><div className="explore-visual-aura" aria-hidden="true" /><MockupFuncionalidade nome={funcionalidade.icone} /></motion.div>
          </section>
        ))}
      </div>

      <motion.section className="explore-fecho" initial={false} whileInView={semAnimacaoDeEntrada ? {} : { opacity: [0, 1], y: [24, 0] }} viewport={{ once: true, amount: 0.3 }}>
        <span>Veja o Angario em ação</span><h2>Sua próxima angariação pode começar com uma operação mais clara.</h2><p>Descubra como o Angario se adapta à rotina da sua imobiliária e transforma cada oportunidade em uma próxima ação.</p>
        <div><button type="button" className="btn btn-primary" onClick={aoCriarConta}>Solicitar demonstração <span aria-hidden="true">→</span></button><button type="button" className="btn" onClick={aoEntrar}>Entrar no painel</button></div>
        <small><i>✓</i> Seus dados isolados por conta <i>✓</i> Funciona no navegador e no celular <i>✓</i> Revisão humana antes dos envios</small>
      </motion.section>
    </section>
    </>
  );
}
