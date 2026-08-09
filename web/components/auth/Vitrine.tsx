"use client";

/* ================================================================
   VITRINE / APRESENTAÇÃO DO SISTEMA
   Deixou de ser uma lista estática de features e virou uma
   APRESENTAÇÃO QUE ANDA COM O SCROLL: uma abertura e, abaixo dela,
   capítulos que se revelam conforme entram na tela. Ela ocupa a tela
   inteira porque o formulário saiu daqui: virou modal, chamado pelo
   botão do cabeçalho (CabecalhoAuth) ou pelos CTAs desta página.

   Quem revela é um IntersectionObserver, não uma animação por tempo:
   o gatilho é o próprio scroll do leitor. São DOIS observadores de
   propósito, com recortes diferentes:
   - o de ENTRADA (limiar baixo) marca a cena como vista e para de
     observá-la. Revelar é mutirão de mão única; re-esconder ao subir
     faria a página piscar a cada rolagem para cima;
   - o de FOCO (faixa estreita no meio da tela) diz qual capítulo está
     sendo lido agora, e é só isso que acende o ponto na régua lateral.

   Movimento é enfeite, então some com `prefers-reduced-motion`: o
   CSS neutraliza ali o estado inicial das cenas, e nada depende mais
   do observador para ser lido.

   ## As TRÊS PARTES (e por que existem)

   A lista de capítulos cresceu junto com o app, e uma fila de onze
   cenas equivalentes vira rolagem sem forma: o leitor não sabe onde
   está nem quanto falta. As partes dão espinha à leitura e respondem,
   nesta ordem, as três perguntas de quem avalia a ferramenta: "como
   começa o meu dia?", "o que acontece na conversa?" e "o que eu
   descubro depois?". A régua lateral abre um vão entre elas, para o
   agrupamento se ver também na navegação.

   O rótulo de cada parte é o ASSUNTO dela ("O seu dia", "A conversa",
   "Os números"), e não uma numeração. Já foi "Ato um / Ato dois /
   Ato três", e o corretor leu e não entendeu: numerar não informa
   nada a quem chegou agora, e "ato" é palavra de teatro. O número da
   cena já cumpre o papel de dizer onde se está.

   ## O que a página promete tem que EXISTIR

   Esta tela é a única do projeto que fala com quem ainda não entrou,
   e por isso é a mais fácil de deixar mentir: ela não quebra quando
   descreve um recurso que saiu. Já aconteceu: a vitrine anunciou
   "foto da placa: os campos vêm preenchidos" por meses depois de a
   leitura por imagem ser removida (2026-07-25, reprovada em campo).
   Ao mexer em feature, passe por aqui.
   ================================================================ */
import { useEffect, useRef, useState } from "react";

interface Cena {
  /** Rótulo curto do capítulo. Vira o `title` do ponto na régua. */
  rotulo: string;
  /** Parte a que pertence; muda de valor = começa uma parte nova. */
  parte: number;
  titulo: string;
  texto: string;
  visual: React.ReactNode;
}

interface Parte {
  numero: number;
  rotulo: string;
  titulo: string;
  texto: string;
}

interface Props {
  aoEntrar: () => void;
  aoCriarConta: () => void;
}

const PARTES: Parte[] = [
  {
    numero: 1,
    rotulo: "O seu dia",
    titulo: "Você abre o painel e ele já sabe o que fazer hoje.",
    texto: "A carteira deixa de ser uma lista parada e vira uma fila de trabalho com ordem, contexto e próxima ação.",
  },
  {
    numero: 2,
    rotulo: "A conversa",
    titulo: "A conversa com o proprietário acontece dentro do sistema.",
    texto: "Mensagem, resposta, áudio e compromisso ficam ligados ao imóvel, sem perder o fio da negociação.",
  },
  {
    numero: 3,
    rotulo: "Os números",
    titulo: "E os números dizem o que fazer diferente amanhã.",
    texto: "O painel transforma o trabalho registrado em metas, comparações e decisões que ajudam a próxima captação.",
  },
];

/* ---------- ilustrações de cada capítulo (estáticas) ---------- */

/* A abertura mostra o PRODUTO, não um desenho abstrato: quem avalia uma
   ferramenta quer ver a tela. É uma maquete, e os números são de exemplo,
   mas a forma é a da Início de verdade (KPIs mais a rodada do dia). */
const HeroMock = (
  <div className="hero-mock" aria-hidden="true">
    <div className="hm-topo">
      <span className="hm-bolinhas">
        <i />
        <i />
        <i />
      </span>
      <span className="hm-url">Painel de Angariações · Início</span>
    </div>
    <div className="hm-corpo">
      <div className="hm-nav">
        {Array.from({ length: 7 }, (_, i) => (
          <span className={`hm-nav-item${i === 0 ? " ativo" : ""}`} key={i} />
        ))}
      </div>
      <div className="hm-tela">
        <div className="hm-kpis">
          {[
            ["Na carteira", "177"],
            ["Angariados no mês", "12"],
            ["Respostas novas", "8"],
          ].map(([rotulo, valor]) => (
            <div className="hm-kpi" key={rotulo}>
              <span className="hm-kpi-rot">{rotulo}</span>
              <strong className="hm-kpi-num">{valor}</strong>
            </div>
          ))}
        </div>
        <div className="hm-bloco">
          <span className="hm-bloco-tit">A rodada de hoje</span>
          {[
            ["Respostas sem leitura", "3"],
            ["Follow-up esperando", "20"],
            ["Compromissos de hoje", "2"],
          ].map(([nome, qtd]) => (
            <span className="hm-linha" key={nome}>
              <i className="hm-ponto" />
              {nome}
              <b>{qtd}</b>
            </span>
          ))}
        </div>
      </div>
    </div>
  </div>
);

/* A rodada do dia: frentes com fila, na ordem de quem é a vez. */
const FRENTES = [
  { ic: "💬", nome: "Responder quem escreveu", qtd: 3, urg: "agora", nota: "sem leitura" },
  { ic: "📅", nome: "Compromissos de hoje", qtd: 2, urg: "agora", nota: "hora marcada" },
  { ic: "📣", nome: "Follow-up de quem não respondeu", qtd: 20, urg: "hoje", nota: "82 na fila" },
  { ic: "🏠", nome: "Confirmar disponibilidade", qtd: 4, urg: "quando-der", nota: "60+ dias" },
];

const VisualRodada = (
  <>
    <div className="rodada-demo">
      {FRENTES.map((f) => (
        <div className={`rd-item ${f.urg}`} key={f.nome}>
          <span className="rd-ic">{f.ic}</span>
          <span className="rd-txt">
            <strong>
              {f.nome}
              <span className="rd-qtd">{f.qtd}</span>
            </strong>
            {f.nota}
          </span>
        </div>
      ))}
    </div>
    <p className="visual-nota">
      A ordem é de quem é a vez: quem já fez a parte dele vem antes de quem ainda não sabe que você
      existe.
    </p>
  </>
);

const COLUNAS_FUNIL = [
  { nome: "Novo contato", cards: 3, cor: "var(--text-faint)" },
  { nome: "Contato feito", cards: 2, cor: "var(--accent)" },
  { nome: "Visita", cards: 2, cor: "var(--warn)" },
  { nome: "Angariado", cards: 1, cor: "var(--good)" },
];

const VisualFunil = (
  <>
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
    <p className="visual-nota">
      “Parado” conta movimento de verdade: mudança de etapa, mensagem enviada ou resposta recebida.
      Quem falou com você ontem não aparece como esquecido.
    </p>
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
    <p className="visual-nota">
      Follow-up em lote: 10 por rodada, com 30 a 60s sorteados entre um envio e outro. E uma
      mensagem por proprietário, mesmo que ele tenha quatro imóveis com você.
    </p>
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
      Leitura da IA: <strong>recusou</strong>, alugou por conta própria
    </div>
    <p className="visual-nota">O imóvel sai da carteira com o motivo certo, e a nota explica na tela por quê.</p>
  </>
);

/* Transcrição: a bolha de áudio deixa de ser um marcador e vira texto. */
const VisualAudio = (
  <>
    <div className="zap">
      <span className="zap-bolha entra audio">
        <span className="audio-onda" aria-hidden="true">
          {[6, 11, 16, 9, 14, 7, 12, 17, 8, 13, 6, 10].map((h, i) => (
            <i key={i} style={{ height: `${h}px` }} />
          ))}
        </span>
        <span className="audio-tempo">0:23</span>
      </span>
      <span className="zap-bolha entra transcrito">
        <span className="transcrito-selo">Transcrição automática</span>
        “Olha, esse aí vai desocupar esse mês. Se quiser pode passar pra ver, tá disponível sim.”
      </span>
    </div>
    <p className="visual-nota">
      O texto entra antes de qualquer decisão automática. Um “já aluguei” falado encerra o registro
      igual a um escrito.
    </p>
  </>
);

/* A caixa de respostas: uma linha por imóvel, separada por fase. */
const CAIXA = [
  { fase: "Captação", cod: "LD-142", nome: "Sr. Antônio", qtd: 3, previa: "Pode mandar sim", nova: true },
  { fase: "Captação", cod: "LD-155", nome: "Marina R.", qtd: 1, previa: "Quanto vocês cobram?", nova: true },
  { fase: "Carteira", cod: "LD-156", nome: "Dona Célia", qtd: 2, previa: "Já Assinei", nova: false },
];

const VisualCaixa = (
  <>
    <div className="caixa-demo">
      {CAIXA.map((c, i) => (
        <div key={c.cod}>
          {(i === 0 || CAIXA[i - 1].fase !== c.fase) && (
            <span className="caixa-fase">{c.fase}</span>
          )}
          <div className={`caixa-linha${c.nova ? " nova" : ""}`}>
            <span className="caixa-cod">{c.cod}</span>
            <span className="caixa-txt">
              <strong>{c.nome}</strong>
              {c.previa}
            </span>
            <span className="caixa-qtd">{c.qtd}</span>
          </div>
        </div>
      ))}
    </div>
    <div className="ia-chip">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="m3 21 1.6-4.8A8.4 8.4 0 1 1 8 19.4z" />
      </svg>
      Botão <strong>Rascunhar resposta</strong>: a IA lê a última mensagem e escreve, você revisa
    </div>
    <p className="visual-nota">
      A mensagem sai da caixa quando você age: registrou o contato, mudou a etapa ou marcou como
      lida. Nada exige burocracia diária.
    </p>
  </>
);

/* O dia da agenda em dois blocos, a mesma leitura da AgendaView
   (separarPorHorario): os horários marcados e o que se resolve quando der. */
const VisualAgenda = (
  <>
    <div className="dia-agenda">
      <div className="dia-bloco">
        <span className="dia-bloco-label">Com horário</span>
        <div className="dia-item">
          <span className="dia-hora">10:00</span>
          <span className="dia-txt">
            <strong>Visita ao Sr. Antônio</strong>Gleba Palhano, apartamento de 3 quartos
          </span>
        </div>
      </div>
      <div className="dia-bloco">
        <span className="dia-bloco-label">Sem hora marcada</span>
        <div className="dia-item">
          <span className="dia-ic">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0" />
            </svg>
          </span>
          <span className="dia-txt">
            <strong>Verificar disponibilidade</strong>Anunciado há 60 dias. Ainda está de pé?
          </span>
        </div>
      </div>
    </div>
    <div className="ia-chip">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </svg>
      Criado por <strong>“pode ser quinta às 10h”</strong>
    </div>
    <p className="visual-nota">
      Se você conectar o Google Agenda, o compromisso aparece também no celular, com o lembrete que
      você já usa.
    </p>
  </>
);

const RANKING = [
  { nome: "Avaliação gratuita", pct: 62 },
  { nome: "Já tenho cliente para a região", pct: 48 },
  { nome: "Apresentação da imobiliária", pct: 24 },
];

const VisualRanking = (
  <>
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
    <p className="visual-nota">
      Na hora de escolher o que dizer, o seletor já vem ordenado pelo que funciona, sem precisar
      abrir o relatório para lembrar.
    </p>
  </>
);

const VisualIa = (
  <>
    <div className="ia-card">
      <span className="ia-selo">Leitura do ranking</span>
      <p>
        “Seus melhores resultados vêm de abrir com avaliação gratuita: responde quase o dobro do que
        a apresentação institucional. O roteiro de fechamento aparece pouco, só 3 tentativas, ainda
        é cedo para tirar conclusão.”
      </p>
    </div>
    <div className="colagem">
      <span className="colagem-de">
        Texto colado do anúncio
        <em>“Alugo apartamento 2 quartos, Gleba Palhano, R$ 1.800 + cond…”</em>
      </span>
      <span className="colagem-seta" aria-hidden="true">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      </span>
      <span className="colagem-para">
        {["Endereço", "Tipo", "Valor", "Telefone"].map((c) => (
          <b key={c}>{c}</b>
        ))}
      </span>
    </div>
    <p className="visual-nota">
      As contas saem do seu banco de dados. A IA interpreta e preenche, nunca inventa número nem
      salva nada sozinha.
    </p>
  </>
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
      <div className="meta-projecao">
        <span className="meta-proj-linha">
          No seu ritmo, o mês fecha em <b>9</b>
        </span>
        <span className="meta-proj-linha">
          Faltam <b>2</b> em <b>6</b> dias úteis, cerca de 1 a cada 3 dias
        </span>
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

const SECOES_RELATORIO = [
  { nome: "Esforço", detalhe: "200 mensagens · 48 imóveis novos" },
  { nome: "Respostas", detalhe: "20 responderam · 12,5% da coorte" },
  { nome: "Perdas", detalhe: "58% “já está com outra imobiliária”" },
  { nome: "Fila de hoje", detalhe: "29 esperando follow-up" },
];

const VisualRelatorio = (
  <>
    <div className="rel-demo">
      <span className="rel-tit">Relatório completo de julho</span>
      {SECOES_RELATORIO.map((s, i) => (
        <div className="rel-linha" key={s.nome}>
          <span className="rel-num">{i + 1}</span>
          <span className="rel-txt">
            <strong>{s.nome}</strong>
            {s.detalhe}
          </span>
        </div>
      ))}
    </div>
    <p className="visual-nota">
      Angariação é lenta: um mês pode fechar com poucos desfechos e muito trabalho feito. Este
      relatório mostra o trabalho. Os de resultado, semanal e mensal, continuam onde estavam.
    </p>
  </>
);

const CENAS: Cena[] = [
  {
    rotulo: "A rodada de hoje",
    parte: 1,
    titulo: "O sistema abre dizendo o que está esperando você.",
    texto:
      "Quem escreveu e ainda não foi lido, quem tem hora marcada, quem está há dias sem retorno. Cada frente vem com o tamanho da fila e o botão que a resolve, mais quantas mensagens ainda cabem hoje: o envio tem ritmo seguro, e vaga não usada não volta.",
    visual: VisualRodada,
  },
  {
    rotulo: "O funil",
    parte: 1,
    titulo: "Nada some no meio do caminho.",
    texto:
      "Cada imóvel caminha do primeiro contato até o “Locado”, e o sistema guarda a data de cada passo. Quem ficou parado tempo demais aparece marcado, então você não precisa lembrar de ninguém.",
    visual: VisualFunil,
  },
  {
    rotulo: "WhatsApp",
    parte: 2,
    titulo: "A mensagem sai do seu próprio número.",
    texto:
      "Escolha a abordagem e envie sem sair da tela. Dá para disparar o follow-up de todo mundo que ficou sem resposta de uma vez, em ritmo seguro, para não queimar o número da imobiliária.",
    visual: VisualZap,
  },
  {
    rotulo: "A resposta volta",
    parte: 2,
    titulo: "O que o proprietário responde entra no sistema.",
    texto:
      "A resposta vira nota no imóvel assim que chega, e a IA sugere o desfecho para você confirmar. Quando não há mais nada a fazer, como “já aluguei” ou “já estou com outra imobiliária”, o imóvel se fecha com o motivo certo. E o silêncio o sistema enxerga sozinho: ninguém precisa clicar para dizer que não houve resposta.",
    visual: VisualResposta,
  },
  {
    rotulo: "Áudio vira texto",
    parte: 2,
    titulo: "O áudio de meio minuto você lê em três segundos.",
    texto:
      "Boa parte dos proprietários responde falando, e é aí que costuma estar o que decide o negócio: o “vai desocupar esse mês”, a negociação inteira do contrato. Cada áudio recebido é transcrito automaticamente e fica escrito no imóvel, pesquisável como qualquer outra nota.",
    visual: VisualAudio,
  },
  {
    rotulo: "Caixa de respostas",
    parte: 2,
    titulo: "Tudo que escreveram para você, em uma tela só.",
    texto:
      "Uma linha por proprietário, os leads de captação antes do operacional da carteira. E responder é um clique: para as respostas que o sistema já entendeu, a réplica vem pronta; para as outras, a IA rascunha lendo a mensagem. Quem envia é sempre você.",
    visual: VisualCaixa,
  },
  {
    rotulo: "Agenda",
    parte: 2,
    titulo: "O horário que o proprietário marcou já entra na sua agenda.",
    texto:
      "Quando ele responde “pode ser quinta às 10h”, o compromisso nasce no dia certo, com a frase que o gerou anotada junto. O dia se lê em dois blocos: os horários marcados e o que dá para resolver quando der. E tudo pode ser espelhado no seu Google Agenda, para o lembrete tocar no celular.",
    visual: VisualAgenda,
  },
  {
    rotulo: "Abordagens",
    parte: 3,
    titulo: "Descubra qual conversa faz o proprietário responder.",
    texto:
      "Cada roteiro é medido separado: quantos responderam, quantos viraram angariação e quantas vezes ele foi o contato que destravou o negócio. Com poucos casos, o sistema avisa em vez de fingir certeza.",
    visual: VisualRanking,
  },
  {
    rotulo: "Inteligência",
    parte: 3,
    titulo: "Uma IA que lê os seus números e cadastra por você.",
    texto:
      "Peça sugestões de roteiro e uma leitura em português do que os seus números dizem. No garimpo, cole o texto do anúncio e os campos voltam preenchidos, endereço, tipo, valor e telefone, com o WhatsApp já pronto para abrir.",
    visual: VisualIa,
  },
  {
    rotulo: "Metas",
    parte: 3,
    titulo: "Meta do mês com o calendário dentro da conta.",
    texto:
      "“Faltam 2” é tranquilidade no dia 3 e emergência no dia 28. O painel projeta o fechamento no seu ritmo de dias úteis e diz o quanto por dia falta. E comemora quando um imóvel entra em “Angariado” ou a meta fecha.",
    visual: VisualMetas,
  },
  {
    rotulo: "Relatórios",
    parte: 3,
    titulo: "Prestação de contas que mostra o trabalho feito.",
    texto:
      "Semanal, mensal e o relatório completo de captação: esforço, taxa de resposta por coorte, motivos de perda e a fila que sobrou. Tudo em PDF, com cara de documento, pronto para levar à reunião.",
    visual: VisualRelatorio,
  },
];

const EXTRAS = [
  {
    titulo: "Mapa da carteira",
    texto: "Seus imóveis por bairro, com a legenda filtrando o que já foi angariado.",
    icone: (
      <>
        <path d="M12 21s-7-6.5-7-11a7 7 0 0 1 14 0c0 4.5-7 11-7 11z" />
        <circle cx="12" cy="10" r="2.5" />
      </>
    ),
  },
  {
    titulo: "Termômetro do proprietário",
    texto: "Quem chamar hoje, na ordem do sinal que cada um deu, com o motivo escrito.",
    icone: (
      <>
        <path d="M14 14.8V5a2 2 0 1 0-4 0v9.8a4 4 0 1 0 4 0z" />
        <path d="M12 9v6" />
      </>
    ),
  },
  {
    titulo: "Foco do dia",
    texto: "Quantos contatos novos fazer hoje e em quais portais, lido do seu próprio ritmo.",
    icone: (
      <>
        <circle cx="12" cy="12" r="9" />
        <circle cx="12" cy="12" r="4.5" />
        <circle cx="12" cy="12" r="1" />
      </>
    ),
  },
  {
    titulo: "Aviso de duplicidade",
    texto: "O sistema reconhece o imóvel já cadastrado antes de você repetir o contato.",
    icone: (
      <>
        <path d="M12 9v4M12 17h.01" />
        <path d="M10.3 3.9 2.4 17a2 2 0 0 0 1.7 3h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
      </>
    ),
  },
  {
    titulo: "Um espaço, várias unidades",
    texto: "O galpão que vira quatro salas rende quatro contratos e continua sendo uma captação.",
    icone: (
      <>
        <path d="M3 21h18M5 21V8l7-5 7 5v13" />
        <path d="M12 3v18M5 13h14" />
      </>
    ),
  },
  {
    titulo: "Dados isolados por conta",
    texto: "Cada login enxerga só os próprios imóveis. A separação é do banco, não da tela.",
    icone: (
      <>
        <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
        <path d="m9 12 2 2 4-4" />
      </>
    ),
  },
];

const GARANTIAS = [
  "Nada para instalar: abre no navegador e no celular",
  "Seu próprio número de WhatsApp",
  "Você confirma antes de qualquer mensagem sair",
];

export default function Vitrine({ aoEntrar, aoCriarConta }: Props) {
  const cenasRef = useRef<(HTMLElement | null)[]>([]);
  const [vistas, setVistas] = useState<boolean[]>(() => CENAS.map(() => false));

  useEffect(() => {
    const elementos = cenasRef.current.filter((el): el is HTMLElement => el !== null);
    if (elementos.length === 0) return;

    // Entrada: revela e larga a cena. Revelou, revelou.
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

    for (const el of elementos) revelador.observe(el);
    return () => revelador.disconnect();
  }, []);

  return (
    <section className="auth-showcase">
      <div className="vitrine-hero">
        <div className="vitrine-hero-copy">
          <span className="vitrine-selo">CRM de captação para locação</span>
          <h1 className="showcase-headline">
            Sua carteira não precisa de mais contatos. Precisa de <span className="hl">movimento.</span>
          </h1>
          <p className="showcase-sub">
            Organize cada imóvel, converse com proprietários pelo seu WhatsApp e saiba exatamente
            quem responder, quem retomar e onde está cada negociação.
          </p>

          <div className="vitrine-ctas">
            <button type="button" className="btn btn-primary" onClick={aoCriarConta}>
              Começar agora <span aria-hidden="true">→</span>
            </button>
            <button type="button" className="btn" onClick={aoEntrar}>
              Entrar no painel
            </button>
          </div>

          <ul className="vitrine-garantias">
            {GARANTIAS.map((g) => (
              <li key={g}>
                <span aria-hidden="true">✓</span>
                {g}
              </li>
            ))}
          </ul>
        </div>

        <div className="vitrine-hero-produto">
          <div className="vitrine-hero-status" aria-hidden="true">
            <span>PAINEL / VISÃO DO DIA</span>
            <b><i /> operação ativa</b>
          </div>
          {HeroMock}
          <div className="vitrine-hero-destaque" aria-hidden="true">
            <span>PRÓXIMA AÇÃO</span>
            <strong>3 respostas esperando você</strong>
            <small>O outro lado já fez a parte dele.</small>
          </div>
        </div>
      </div>

      <section className="vitrine-faixa" aria-label="Diferenciais do painel">
        {[
          ["01 / ROTINA", "A próxima ação aparece primeiro"],
          ["02 / CONVERSA", "Seu WhatsApp continua sendo seu"],
          ["03 / DECISÃO", "Seus dados mostram o que funciona"],
        ].map(([rotulo, texto]) => (
          <div key={rotulo}>
            <span>{rotulo}</span>
            <strong>{texto}</strong>
          </div>
        ))}
      </section>

      <section className="vitrine-manifesto" id="como-funciona">
        <span>OPERAÇÃO DE CAPTAÇÃO, CONECTADA</span>
        <h2>Não é uma planilha com mais campos. É uma forma mais clara de trabalhar a carteira.</h2>
        <p>
          Da primeira abordagem ao imóvel locado, cada ação alimenta a próxima. O corretor cuida
          da relação; o painel cuida para nenhuma oportunidade desaparecer no caminho.
        </p>
      </section>

      <div id="recursos">
        {PARTES.map((parte) => {
          const cenasDaParte = CENAS.map((cena, i) => ({ cena, i })).filter(
            ({ cena }) => cena.parte === parte.numero,
          );

          return (
            <section className="vitrine-parte" key={parte.numero} data-parte={parte.numero}>
              <header className="vitrine-parte-cabecalho">
                <span className="vitrine-parte-numero">0{parte.numero}</span>
                <div>
                  <span className="vitrine-parte-rotulo">{parte.rotulo}</span>
                  <h2>{parte.titulo}</h2>
                </div>
                <p>{parte.texto}</p>
              </header>

              <div className="vitrine-produtos-grid">
                {cenasDaParte.map(({ cena, i }, indiceNaParte) => (
                  <article
                    data-cena={i}
                    ref={(el) => {
                      cenasRef.current[i] = el;
                    }}
                    className={`produto-card${indiceNaParte === 0 ? " destaque" : ""}${
                      vistas[i] ? " visivel" : ""
                    }`}
                    key={cena.rotulo}
                  >
                    <div className="produto-card-topo">
                      <span>[{String(i + 1).padStart(2, "0")}]</span>
                      <strong>{cena.rotulo}</strong>
                    </div>
                    <div className="produto-card-visual">{cena.visual}</div>
                    <div className="produto-card-texto">
                      <h3>{cena.titulo}</h3>
                      <p>{cena.texto}</p>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          );
        })}
      </div>

      <section className="extras" id="seguranca">
        <span className="extras-rotulo">MAIS CONTROLE, MENOS PONTAS SOLTAS</span>
        <h2 className="extras-titulo">Os detalhes que sustentam a operação.</h2>
        <p className="extras-subtitulo">
          Recursos discretos, mas decisivos para trabalhar uma carteira grande sem perder contexto.
        </p>
        <ul className="extras-grade">
          {EXTRAS.map((e, i) => (
            <li className="extra" key={e.titulo}>
              <span className="extra-numero">0{i + 1}</span>
              <span className="extra-ic">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  {e.icone}
                </svg>
              </span>
              <strong>{e.titulo}</strong>
              <span>{e.texto}</span>
            </li>
          ))}
        </ul>
      </section>

      <div className="vitrine-fecho">
        <span className="vitrine-fecho-rotulo">SUA CARTEIRA, EM MOVIMENTO</span>
        <h2 className="vitrine-fecho-titulo">A próxima angariação começa no contato que você não vai esquecer.</h2>
        <p className="vitrine-fecho-texto">
          Traga os imóveis que já está trabalhando e transforme cada conversa em uma próxima ação clara.
        </p>
        <div className="vitrine-ctas">
          <button type="button" className="btn btn-primary" onClick={aoCriarConta}>
            Criar minha conta <span aria-hidden="true">→</span>
          </button>
          <button type="button" className="btn" onClick={aoEntrar}>
            Fazer login
          </button>
        </div>
        <div className="showcase-foot">
          <span className="showcase-badge">
            <span aria-hidden="true">✓</span>
            Dados isolados por conta
          </span>
          <span className="showcase-foot-note">Feito para corretores e imobiliárias.</span>
        </div>
      </div>
    </section>
  );
}
