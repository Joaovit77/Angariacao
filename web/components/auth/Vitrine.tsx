"use client";

/* ================================================================
   VITRINE / APRESENTAÇÃO DO SISTEMA
   Deixou de ser uma lista estática de features e virou uma
   APRESENTAÇÃO QUE ANDA COM O SCROLL: uma abertura e, abaixo dela,
   capítulos que se revelam conforme entram na tela. Ela ocupa a tela
   inteira porque o formulário saiu daqui — virou modal, chamado pelo
   botão do cabeçalho (CabecalhoAuth) ou pelos CTAs desta página.

   Quem revela é um IntersectionObserver, não uma animação por tempo:
   o gatilho é o próprio scroll do leitor. São DOIS observadores de
   propósito, com recortes diferentes:
   - o de ENTRADA (limiar baixo) marca a cena como vista e para de
     observá-la — revelar é mutirão de mão única; re-esconder ao subir
     faria a página piscar a cada rolagem para cima;
   - o de FOCO (faixa estreita no meio da tela) diz qual capítulo está
     sendo lido agora, e é só isso que acende o ponto na régua lateral.

   Movimento é enfeite, então some com `prefers-reduced-motion`: o
   CSS neutraliza ali o estado inicial das cenas, e nada depende mais
   do observador para ser lido.
   ================================================================ */
import { useEffect, useRef, useState } from "react";

interface Cena {
  /** Rótulo curto do capítulo — vira o `title` do ponto na régua. */
  rotulo: string;
  titulo: string;
  texto: string;
  visual: React.ReactNode;
}

interface Props {
  aoEntrar: () => void;
  aoCriarConta: () => void;
}

/* ---------- ilustrações de cada capítulo (estáticas) ---------- */

const COLUNAS_FUNIL = [
  { nome: "Novo contato", cards: 3, cor: "var(--text-faint)" },
  { nome: "Contato feito", cards: 2, cor: "var(--accent)" },
  { nome: "Visita", cards: 2, cor: "var(--warn)" },
  { nome: "Angariado", cards: 1, cor: "var(--good)" },
];

const VisualFunil = (
  <div className="mini-kanban">
    {COLUNAS_FUNIL.map((col) => (
      <div className="mk-col" key={col.nome}>
        <div className="mk-tit">{col.nome}</div>
        {Array.from({ length: col.cards }, (_, i) => (
          <div className="mk-card" key={i} style={{ borderLeftColor: col.cor }} />
        ))}
      </div>
    ))}
  </div>
);

const VisualFoco = (
  <>
    <div className="chips-portal">
      {[
        ["Garimpo", 4],
        ["OLX", 4],
        ["Marketplace", 4],
      ].map(([nome, qtd]) => (
        <span className="chip-portal" key={String(nome)}>
          <b>{qtd}</b>
          {nome}
        </span>
      ))}
    </div>
    <p className="visual-nota">12 contatos novos hoje — o seu dia típico, repartido igualmente.</p>
  </>
);

const VisualZap = (
  <>
    <div className="zap">
      <span className="zap-bolha sai">
        Bom dia, Sr. Antônio! Vi seu apartamento na Gleba Palhano e faço uma avaliação de aluguel
        sem compromisso. Posso mandar os valores da região?
      </span>
      <span className="zap-bolha entra">Pode mandar sim</span>
    </div>
    <p className="visual-nota">Follow-up em lote: 10 por rodada, com 30 a 60s entre um envio e outro.</p>
  </>
);

const VisualResposta = (
  <>
    <div className="zap">
      <span className="zap-bolha entra">Obrigado, mas já aluguei o apartamento semana passada.</span>
    </div>
    <div className="ia-chip">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1" />
        <circle cx="12" cy="12" r="3.2" />
      </svg>
      Leitura da IA: <strong>recusou</strong> — alugou por conta própria
    </div>
    <p className="visual-nota">O imóvel sai da carteira com o motivo certo, e a nota explica na tela por quê.</p>
  </>
);

const RANKING = [
  { nome: "Avaliação gratuita", pct: 62 },
  { nome: "Já tenho cliente para a região", pct: 48 },
  { nome: "Apresentação da imobiliária", pct: 24 },
];

const VisualRanking = (
  <div className="rank">
    {RANKING.map((r) => (
      <div className="rank-linha" key={r.nome}>
        <div className="rank-topo">
          <span className="rank-nome">{r.nome}</span>
          <span className="rank-pct">{r.pct}%</span>
        </div>
        <div className="rank-track">
          <div className="rank-fill" style={{ "--w": `${r.pct}%` } as React.CSSProperties} />
        </div>
      </div>
    ))}
  </div>
);

const VisualIa = (
  <div className="ia-card">
    <span className="ia-selo">Leitura do ranking</span>
    <p>
      “Seus melhores resultados vêm de abrir com avaliação gratuita: responde quase o dobro do que a
      apresentação institucional. O roteiro de fechamento aparece pouco — só 3 tentativas, ainda é
      cedo para tirar conclusão.”
    </p>
  </div>
);

const VisualMetas = (
  <>
    <div className="meta-demo">
      <div className="meta-demo-topo">
        <span>Angariações do mês</span>
        <strong>8 / 10</strong>
      </div>
      <div className="rank-track">
        <div className="rank-fill" style={{ "--w": "80%" } as React.CSSProperties} />
      </div>
    </div>
    <div className="medalhas">
      {[
        <path key="a" d="M12 2l2.6 5.6 6.4.9-4.6 4.4 1.1 6.1L12 16.1 6.5 19l1.1-6.1L3 8.5l6.4-.9z" />,
        <path key="b" d="M6 3h12v5a6 6 0 0 1-12 0zM9 21h6M12 14v7" />,
        <path key="c" d="M12 3s5 4.5 5 9a5 5 0 0 1-10 0c0-1.7.7-3.3 1.6-4.6.5 1.4 1.4 2.1 2.4 2.1 0-2.6-1-4.4 1-6.5z" />,
      ].map((d, i) => (
        <span className="medalha" key={i}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            {d}
          </svg>
        </span>
      ))}
    </div>
  </>
);

const VisualExtras = (
  <ul className="showcase-features">
    <li className="showcase-feature">
      <span className="showcase-feature-ic">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 21s-7-6.5-7-11a7 7 0 0 1 14 0c0 4.5-7 11-7 11z" />
          <circle cx="12" cy="10" r="2.5" />
        </svg>
      </span>
      <span className="showcase-feature-txt">
        <strong>Mapa da carteira</strong>Seus imóveis distribuídos por bairro e região.
      </span>
    </li>
    <li className="showcase-feature">
      <span className="showcase-feature-ic">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="3" y="4" width="18" height="18" rx="2" />
          <path d="M16 2v4M8 2v4M3 10h18" />
        </svg>
      </span>
      <span className="showcase-feature-txt">
        <strong>Agenda inteligente</strong>Lembrete de retorno e de verificar disponibilidade, criado
        sozinho.
      </span>
    </li>
    <li className="showcase-feature">
      <span className="showcase-feature-ic">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z" />
          <path d="M14 3v6h6M9 14h6M9 17h6" />
        </svg>
      </span>
      <span className="showcase-feature-txt">
        <strong>Relatórios em PDF</strong>Semanal e mensal com cara de documento, pronto para prestar
        contas.
      </span>
    </li>
    <li className="showcase-feature">
      <span className="showcase-feature-ic">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M12 9v4M12 17h.01" />
          <path d="M10.3 3.9 2.4 17a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
        </svg>
      </span>
      <span className="showcase-feature-txt">
        <strong>Aviso de duplicidade</strong>O sistema reconhece o imóvel já cadastrado antes de você
        repetir o contato.
      </span>
    </li>
  </ul>
);

const CENAS: Cena[] = [
  {
    rotulo: "O funil",
    titulo: "Nada some no meio do caminho.",
    texto:
      "Cada imóvel caminha do primeiro contato até o “Locado”, e o sistema guarda a data de cada passo. Quem ficou parado tempo demais aparece marcado — você não precisa lembrar de ninguém.",
    visual: VisualFunil,
  },
  {
    rotulo: "Foco do dia",
    titulo: "Quantos contatos novos fazer hoje — e onde.",
    texto:
      "O sistema lê o seu ritmo das últimas semanas e reparte o dia entre os portais que você usa. Nenhum número é digitado: ele sai do que você já faz.",
    visual: VisualFoco,
  },
  {
    rotulo: "WhatsApp",
    titulo: "A mensagem sai do seu próprio número.",
    texto:
      "Escolha a abordagem e envie sem sair da tela. Dá para disparar o follow-up de todo mundo que ficou sem resposta de uma vez — em ritmo seguro, para não queimar o número da imobiliária.",
    visual: VisualZap,
  },
  {
    rotulo: "A resposta volta",
    titulo: "O que o proprietário responde entra no sistema.",
    texto:
      "A resposta vira nota no imóvel assim que chega, e a IA sugere o desfecho para você confirmar. Quando não há mais nada a fazer — “já aluguei”, “já estou com outra imobiliária” —, o imóvel se fecha com o motivo certo.",
    visual: VisualResposta,
  },
  {
    rotulo: "Abordagens",
    titulo: "Descubra qual conversa faz o proprietário responder.",
    texto:
      "Cada roteiro é medido separado: quantos responderam, quantos viraram angariação e quantas vezes ele foi o contato que destravou o negócio. Com poucos casos, o sistema avisa em vez de fingir certeza.",
    visual: VisualRanking,
  },
  {
    rotulo: "Inteligência",
    titulo: "Uma IA que escreve o roteiro e lê o ranking.",
    texto:
      "Peça sugestões de abordagem e uma leitura em português do que os seus números estão dizendo. As contas saem do seu banco de dados — a IA interpreta, não inventa.",
    visual: VisualIa,
  },
  {
    rotulo: "Metas",
    titulo: "Meta do mês, comissão e o mérito de fechar.",
    texto:
      "Dashboard, metas mensais e comissão estimada num olhar só. Quando um imóvel entra em “Angariado” ou a meta do mês fecha, o sistema comemora — uma vez, na hora exata.",
    visual: VisualMetas,
  },
  {
    rotulo: "E ainda",
    titulo: "Mapa, agenda, relatórios e insights.",
    texto: "O resto do dia a dia, no mesmo lugar e com os mesmos números das outras telas.",
    visual: VisualExtras,
  },
];

export default function Vitrine({ aoEntrar, aoCriarConta }: Props) {
  const cenasRef = useRef<(HTMLElement | null)[]>([]);
  const [vistas, setVistas] = useState<boolean[]>(() => CENAS.map(() => false));
  const [ativa, setAtiva] = useState(0);

  useEffect(() => {
    const elementos = cenasRef.current.filter((el): el is HTMLElement => el !== null);
    if (elementos.length === 0) return;

    // Entrada: revela e larga a cena — reveleu, reveleu.
    const revelador = new IntersectionObserver(
      (entradas) => {
        for (const entrada of entradas) {
          if (!entrada.isIntersecting) continue;
          const i = Number((entrada.target as HTMLElement).dataset.cena);
          setVistas((prev) => {
            if (prev[i]) return prev;
            const proximo = [...prev];
            proximo[i] = true;
            return proximo;
          });
          revelador.unobserve(entrada.target);
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -8% 0px" },
    );

    // Foco: só a faixa central da tela conta como "estou lendo isto agora".
    const focador = new IntersectionObserver(
      (entradas) => {
        for (const entrada of entradas) {
          if (entrada.isIntersecting) setAtiva(Number((entrada.target as HTMLElement).dataset.cena));
        }
      },
      { rootMargin: "-45% 0px -45% 0px" },
    );

    for (const el of elementos) {
      revelador.observe(el);
      focador.observe(el);
    }
    return () => {
      revelador.disconnect();
      focador.disconnect();
    };
  }, []);

  function irPara(i: number) {
    cenasRef.current[i]?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  return (
    <section className="auth-showcase">
      <div className="vitrine-hero">
        <span className="vitrine-selo">Painel de Angariações</span>
        <h1 className="showcase-headline">
          Toda a sua angariação de locação <span className="hl">em um só lugar.</span>
        </h1>
        <p className="showcase-sub">
          Do primeiro contato com o proprietário até o imóvel locado — o funil, o WhatsApp, as metas
          e o que cada conversa rendeu, sem perder nenhum follow-up.
        </p>

        <div className="vitrine-ctas">
          <button type="button" className="btn btn-primary" onClick={aoCriarConta}>
            Criar minha conta
          </button>
          <button type="button" className="btn" onClick={aoEntrar}>
            Já tenho conta
          </button>
        </div>

        <span className="vitrine-cue">
          Role para conhecer
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M12 5v14M19 12l-7 7-7-7" />
          </svg>
        </span>
      </div>

      {CENAS.map((cena, i) => (
        <article
          key={cena.rotulo}
          data-cena={i}
          ref={(el) => {
            cenasRef.current[i] = el;
          }}
          className={`cena${i % 2 === 1 ? " invertida" : ""}${vistas[i] ? " visivel" : ""}`}
        >
          <div className="cena-texto-col">
            <span className="cena-num">
              {String(i + 1).padStart(2, "0")} — {cena.rotulo}
            </span>
            <h2 className="cena-titulo">{cena.titulo}</h2>
            <p className="cena-texto">{cena.texto}</p>
          </div>
          <div className="cena-visual">{cena.visual}</div>
        </article>
      ))}

      <div className="vitrine-fecho">
        <h2 className="vitrine-fecho-titulo">Comece pela sua carteira de hoje.</h2>
        <p className="vitrine-fecho-texto">
          Cadastre os imóveis que já está trabalhando e o sistema começa a medir a partir do primeiro
          contato — sem instalar nada.
        </p>
        <div className="vitrine-ctas">
          <button type="button" className="btn btn-primary" onClick={aoCriarConta}>
            Criar minha conta
          </button>
          <button type="button" className="btn" onClick={aoEntrar}>
            Fazer login
          </button>
        </div>
        <div className="showcase-foot">
          <span className="showcase-badge">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            </svg>
            Dados isolados por conta
          </span>
          <span className="showcase-foot-note">Feito para corretores e imobiliárias.</span>
        </div>
      </div>

      {/* Régua de capítulos: só orienta, nunca é o único caminho — some
          nas telas estreitas, onde roubaria espaço do conteúdo. */}
      <nav className="vitrine-regua" aria-label="Capítulos da apresentação">
        {CENAS.map((cena, i) => (
          <button
            key={cena.rotulo}
            type="button"
            className={`vitrine-ponto${ativa === i ? " ativo" : ""}`}
            aria-label={cena.rotulo}
            title={cena.rotulo}
            onClick={() => irPara(i)}
          />
        ))}
      </nav>
    </section>
  );
}
