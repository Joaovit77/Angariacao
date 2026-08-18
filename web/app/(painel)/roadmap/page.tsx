/* ================================================================
   VIEW: INTEGRAÇÕES & IA
   Retrato do que o produto oferece hoje e das próximas evoluções.
   A página é estática: os estados abaixo só mudam quando uma entrega
   entra ou sai do sistema, nunca a partir de disponibilidade momentânea.
   ================================================================ */

interface ItemRoadmapProps {
  titulo: string;
  desc: string;
}

function ItemRoadmap({ titulo, desc }: ItemRoadmapProps) {
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
          <p className="page-sub">O que já funciona no sistema e para onde o produto evolui</p>
        </div>
      </div>

      <div className="roadmap-intro">
        O painel já conecta a rotina de captação ao WhatsApp, ao Google Agenda e ao Sistema
        Principal. A IA atua com os dados reais da carteira, sem substituir as regras e os
        cálculos do sistema.
      </div>

      <div className="grid grid-2 roadmap-grid" style={{ alignItems: "start" }}>
        <section aria-labelledby="roadmap-integracoes-disponiveis">
          <div className="roadmap-col-head">
            <span className="roadmap-tag available">Disponível agora</span>
            <h2 id="roadmap-integracoes-disponiveis">Integrações</h2>
          </div>

          <ItemRoadmap
            titulo="WhatsApp conectado"
            desc="Envia mensagens individuais, follow-ups em lote e mensagens agendadas. As respostas voltam para o histórico do imóvel, podem ser transcritas quando chegam em áudio e alimentam a fila diária de trabalho."
          />
          <ItemRoadmap
            titulo="Google Agenda"
            desc="Espelha visitas, retornos e compromissos do painel no calendário conectado, mantendo os lembretes no celular. O painel continua sendo a fonte de verdade da agenda."
          />
          <ItemRoadmap
            titulo="Sistema Principal (Sophia)"
            desc="Recebe autorização assinada, publicação, locação e pagamento de comissão. Cada evento atualiza o imóvel, preserva o histórico e avisa o corretor dentro do painel."
          />
        </section>

        <section aria-labelledby="roadmap-ia-disponivel">
          <div className="roadmap-col-head">
            <span className="roadmap-tag available">Disponível agora</span>
            <h2 id="roadmap-ia-disponivel">Inteligência artificial</h2>
          </div>

          <ItemRoadmap
            titulo="Assistente da carteira"
            desc="Consulta imóveis, agenda, mensagens, follow-ups, métricas e marcos históricos em conversa. É somente leitura: responde com os dados atuais sem alterar ou enviar nada sozinho."
          />
          <ItemRoadmap
            titulo="Foco e resumo do dia"
            desc="Cruza respostas pendentes, compromissos, imóveis sem movimento, follow-ups e metas para ordenar o trabalho. A IA explica a prioridade calculada pelo sistema."
          />
          <ItemRoadmap
            titulo="Análises de desempenho"
            desc="Interpreta os números do Dashboard, compara abordagens e sugere uma ação territorial a partir do Mapa, sempre usando indicadores calculados pelo próprio painel."
          />
          <ItemRoadmap
            titulo="Apoio à comunicação"
            desc="Extrai dados de anúncios colados, sugere roteiros, cria abordagens contextualizadas e classifica respostas do proprietário para organizar o próximo passo."
          />
        </section>
      </div>

      <div className="divider" />

      <section aria-labelledby="roadmap-proximas-etapas">
        <div className="roadmap-col-head">
          <span className="roadmap-tag future">Próximas etapas</span>
          <h2 id="roadmap-proximas-etapas">Evoluções em avaliação</h2>
        </div>

        <div className="grid grid-3 roadmap-grid">
          <ItemRoadmap
            titulo="CRM bidirecional"
            desc="Evoluir a entrada de eventos da Sophia para sincronizar também imóveis e proprietários, reduzindo cadastros repetidos entre os dois sistemas."
          />
          <ItemRoadmap
            titulo="OLX Pro / Canal Pro"
            desc="Importar leads e situação dos anúncios diretamente da plataforma, quando houver um contrato de integração confiável e mensurável."
          />
          <ItemRoadmap
            titulo="Acompanhamento proativo"
            desc="Entregar resumos e relatórios narrados no momento certo, sem depender de o corretor abrir uma tela e pedir a análise manualmente."
          />
        </div>
      </section>

      <div className="divider" />
      <div className="card">
        <div className="card-title">Como priorizamos uma evolução</div>
        <p className="roadmap-note">
          Cada ideia é avaliada pelo problema que resolve, por quem será beneficiado e pelo impacto
          no fluxo diário de angariação. Uma integração só entra quando a fonte dos dados, a
          segurança e o comportamento em caso de falha estiverem claros.
        </p>
      </div>
    </>
  );
}
