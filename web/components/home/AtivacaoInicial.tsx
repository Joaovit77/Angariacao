"use client";

/* A regra do progresso vem pronta de calculo/ativacao. Este componente
   apenas apresenta o próximo passo e liga cada item aos fluxos que já
   existem no app. */
import { useRouter } from "next/navigation";
import type { EstadoAtivacao, EtapaAtivacaoId } from "@/lib/calculo/ativacao";
import { useUiModal } from "@/lib/uiModal";

const ETAPAS: Record<EtapaAtivacaoId, { titulo: string; detalhe: string }> = {
  "primeiro-imovel": {
    titulo: "Primeiro imóvel cadastrado",
    detalhe: "Sua primeira oportunidade já está na carteira.",
  },
  "primeiro-contato": {
    titulo: "Primeiro contato registrado",
    detalhe: "Anote uma tentativa com o proprietário.",
  },
  "proxima-acao": {
    titulo: "Primeira próxima ação agendada",
    detalhe: "Marque o retorno para nada se perder.",
  },
  "meta-mensal": {
    titulo: "Meta mensal definida",
    detalhe: "Escolha o alvo que vai orientar este mês.",
  },
};

function Icone({ nome }: { nome: "importar" | "cadastrar" | "buscar" }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {nome === "importar" && <><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" /></>}
      {nome === "cadastrar" && <><path d="m3 11 9-8 9 8" /><path d="M5 10v10h14V10" /><path d="M12 13v6M9 16h6" /></>}
      {nome === "buscar" && <><circle cx="10.5" cy="10.5" r="6.5" /><path d="m15.5 15.5 5 5" /><path d="M10.5 7.5v6M7.5 10.5h6" /></>}
    </svg>
  );
}

export default function AtivacaoInicial({
  ativacao,
  imovelAlvoId,
}: {
  ativacao: EstadoAtivacao;
  imovelAlvoId?: string;
}) {
  const router = useRouter();
  const abrirModal = useUiModal((s) => s.abrirModal);

  if (ativacao.estado === "concluida") return null;

  if (ativacao.estado === "vazia") {
    return (
      <section className="card ativacao ativacao-vazia" aria-labelledby="ativacao-titulo">
        <div className="ativacao-intro">
          <span className="ativacao-sobretitulo">Primeiros passos</span>
          <h2 id="ativacao-titulo">Comece por aqui</h2>
          <p>Escolha o caminho mais rápido para colocar sua primeira oportunidade no Angario.</p>
        </div>

        <div className="ativacao-acoes">
          <button type="button" className="ativacao-acao principal" onClick={() => abrirModal("importar")}>
            <span className="ativacao-acao-icone"><Icone nome="importar" /></span>
            <span><strong>Trazer minha carteira</strong><small>Importar PDF do CasaSoft ou CSV</small></span>
            <i aria-hidden>→</i>
          </button>
          <button type="button" className="ativacao-acao" onClick={() => abrirModal("preCadastro")}>
            <span className="ativacao-acao-icone"><Icone nome="cadastrar" /></span>
            <span><strong>Cadastrar minha primeira oportunidade</strong><small>Fazer um pré-cadastro rápido</small></span>
            <i aria-hidden>→</i>
          </button>
          <button type="button" className="ativacao-acao" onClick={() => router.push("/central-angariacao")}>
            <span className="ativacao-acao-icone"><Icone nome="buscar" /></span>
            <span><strong>Encontrar oportunidades</strong><small>Pesquisar na Central de Angariação</small></span>
            <i aria-hidden>→</i>
          </button>
        </div>
      </section>
    );
  }

  function executar(id: EtapaAtivacaoId) {
    if (id === "primeiro-contato" && imovelAlvoId) {
      abrirModal("tentativas", imovelAlvoId);
      return;
    }
    if (id === "proxima-acao") {
      abrirModal("agenda", undefined, undefined, imovelAlvoId);
      return;
    }
    if (id === "meta-mensal") abrirModal("meta");
  }

  const percentual = (ativacao.concluidas / ativacao.total) * 100;

  return (
    <section className="card ativacao ativacao-andamento" aria-labelledby="ativacao-progresso-titulo">
      <div className="ativacao-progresso-head">
        <div>
          <span className="ativacao-sobretitulo">Prepare sua rotina</span>
          <h2 id="ativacao-progresso-titulo">Primeiros passos</h2>
        </div>
        <span className="ativacao-contagem">{ativacao.concluidas} de {ativacao.total}</span>
      </div>
      <div className="ativacao-barra" role="progressbar" aria-valuemin={0} aria-valuemax={ativacao.total} aria-valuenow={ativacao.concluidas} aria-label="Progresso dos primeiros passos">
        <span style={{ width: `${percentual}%` }} />
      </div>
      <div className="ativacao-checklist">
        {ativacao.etapas.map((etapa, indice) => {
          const texto = ETAPAS[etapa.id];
          const conteudo = (
            <>
              <span className="ativacao-check" aria-hidden>{etapa.concluida ? "✓" : indice + 1}</span>
              <span className="ativacao-etapa-texto"><strong>{texto.titulo}</strong><small>{texto.detalhe}</small></span>
              {!etapa.concluida && <span className="ativacao-etapa-seta" aria-hidden>→</span>}
            </>
          );

          return etapa.concluida ? (
            <div className="ativacao-etapa concluida" key={etapa.id}>{conteudo}</div>
          ) : (
            <button type="button" className="ativacao-etapa" key={etapa.id} onClick={() => executar(etapa.id)}>{conteudo}</button>
          );
        })}
      </div>
    </section>
  );
}
