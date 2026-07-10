/* ================================================================
   VIEW: ROADMAP (Integrações & IA)
   Port literal de viewRoadmap() (app.js, seção 5G). Não são
   integrações funcionais — é o painel de planejamento que documenta
   a visão de produto para essas frentes. Página estática.
   ================================================================ */

function ItemRoadmap({ titulo, desc }: { titulo: string; desc: string }) {
  return (
    <div className="roadmap-item">
      <div className="roadmap-item-title">{titulo}</div>
      <div className="roadmap-item-desc">{desc}</div>
    </div>
  );
}

export default function Pagina() {
  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Integrações &amp; IA</h1>
          <p className="page-sub">Visão de produto para as próximas etapas do sistema</p>
        </div>
      </div>

      <div className="grid grid-2" style={{ alignItems: "start" }}>
        <div>
          <div className="roadmap-col-head">
            <span className="roadmap-tag planned">Integrações planejadas</span>
          </div>

          <ItemRoadmap
            titulo="CRM da imobiliária"
            desc="Sincronização bidirecional de imóveis e proprietários, evitando cadastro duplicado entre este painel e o sistema oficial da imobiliária. Prioridade alta por ser a fonte de verdade da empresa."
          />
          <ItemRoadmap
            titulo="OLX Pro / Canal Pro"
            desc="Importação automática de leads e status de anúncio (ativo, pausado, expirado) direto da plataforma, alimentando o pipeline sem digitação manual e cruzando com os dados de slot/demanda que você já acompanha no trabalho."
          />
          <ItemRoadmap
            titulo="WhatsApp"
            desc="Envio de lembretes de follow-up e retorno ao proprietário diretamente pelo WhatsApp, com modelos de mensagem por etapa do funil (ex: confirmação de visita, cobrança de documentação)."
          />
          <ItemRoadmap
            titulo="Google Agenda"
            desc="Sincronização de visitas e retornos cadastrados na Agenda deste painel com o Google Agenda, incluindo lembretes automáticos no celular."
          />
        </div>

        <div>
          <div className="roadmap-col-head">
            <span className="roadmap-tag future">Assistente de IA (futuro)</span>
          </div>

          <ItemRoadmap
            titulo="Lembrar follow-ups"
            desc="A assistente identificaria compromissos próximos do vencimento e enviaria um resumo diário priorizado, em vez de depender de revisão manual da agenda."
          />
          <ItemRoadmap
            titulo="Identificar imóveis parados"
            desc="Análise automática do tempo em cada status (já calculada hoje pelas regras deste painel) evoluindo para sugestões específicas: qual ação tomar, e não apenas o alerta de que o imóvel está parado."
          />
          <ItemRoadmap
            titulo="Sugerir prioridades do dia"
            desc="Cruzando agenda, imóveis estagnados e metas do mês, a assistente sugeriria por onde começar o dia para ter o maior impacto nos resultados."
          />
          <ItemRoadmap
            titulo="Gerar relatórios automaticamente"
            desc="Os relatórios semanais e mensais já estruturados hoje passariam a ser redigidos em linguagem natural, com destaques automáticos do que mais mudou."
          />
          <ItemRoadmap
            titulo="Resumir produtividade"
            desc="Um resumo em texto corrido do desempenho do período, complementando os números do dashboard com uma leitura qualitativa."
          />
          <ItemRoadmap
            titulo="Sugestões de melhoria"
            desc="Recomendações baseadas em padrões históricos — por exemplo, indicar o melhor dia da semana para agendar visitas com base na taxa de conversão observada."
          />
        </div>
      </div>

      <div className="divider"></div>
      <div className="card">
        <div className="card-title">Como pedir novas funcionalidades</div>
        <p style={{ fontSize: "13px", color: "var(--text-dim)", lineHeight: 1.6 }}>
          Sempre que quiser evoluir o sistema, descreva o que precisa e será avaliado como uma
          melhoria de produto: o que resolve, para quem, e como se encaixa no fluxo diário de
          angariação — antes de qualquer decisão de implementação.
        </p>
      </div>
    </>
  );
}
