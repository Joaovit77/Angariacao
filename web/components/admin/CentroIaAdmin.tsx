"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CONFIGURACAO_IA_PADRAO,
  CONFIGURACAO_IA_RECOMENDADA,
  ESFORCOS_IA_PERMITIDOS,
  INFO_MODELOS_IA,
  MAX_INSTRUCAO_ATENDIMENTO,
  MODELOS_IA_PERMITIDOS,
  type ConfiguracaoIa,
  type EsforcoIaPermitido,
  type ModeloIaPermitido,
  type RotaModeloIa,
  type VersaoConfiguracaoIa,
} from "@/lib/ia/configuracao";
import {
  carregarConfiguracaoIaAdmin,
  salvarConfiguracaoIaAdmin,
} from "@/lib/admin";
import { toast } from "@/lib/toast";

const ROTAS: { chave: keyof Pick<ConfiguracaoIa, "operacoes" | "classificacao" | "atendimento" | "assistente">; titulo: string; descricao: string; sugestao: string }[] = [
  { chave: "classificacao", titulo: "Classificação do WhatsApp", descricao: "Interpreta cada resposta recebida e sugere desfecho.", sugestao: "Luna · baixo volume de saída" },
  { chave: "atendimento", titulo: "Sugestão de mensagem", descricao: "Decide, escreve e valida o rascunho da aba Mensagens.", sugestao: "Terra · equilíbrio de qualidade" },
  { chave: "operacoes", titulo: "Operações do painel", descricao: "Análises, anúncios, roteiros, mapa e resumo do dia.", sugestao: "Terra · raciocínio low" },
  { chave: "assistente", titulo: "Assistente global", descricao: "Consulta a carteira com ferramentas somente de leitura.", sugestao: "Terra · Responses API" },
];

const ARQUITETURA = [
  { numero: "01", titulo: "Entradas", itens: ["Mensagens", "Webhook + áudio", "Painel", "Assistente"] },
  { numero: "02", titulo: "Roteamento ADM", itens: ["Modelo por função", "Esforço", "Versão ativa"] },
  { numero: "03", titulo: "Pipelines", itens: ["Decidir → gerar → validar", "Classificar", "Ferramentas de leitura"] },
  { numero: "04", titulo: "Fontes confiáveis", itens: ["Histórico", "Protocolos", "Perfil", "Dados tipados"] },
  { numero: "05", titulo: "Saídas e controle", itens: ["Rascunho humano", "Sugestões", "Uso e custo", "Log operacional"] },
];

function copiarConfiguracao(config: ConfiguracaoIa): ConfiguracaoIa {
  return {
    operacoes: { ...config.operacoes },
    classificacao: { ...config.classificacao },
    atendimento: { ...config.atendimento },
    assistente: { ...config.assistente },
    instrucaoAtendimento: config.instrucaoAtendimento,
  };
}

function RotaEditor({
  titulo,
  descricao,
  sugestao,
  valor,
  onChange,
}: {
  titulo: string;
  descricao: string;
  sugestao: string;
  valor: RotaModeloIa;
  onChange: (valor: RotaModeloIa) => void;
}) {
  const info = INFO_MODELOS_IA[valor.modelo];
  return (
    <div className="admin-ia-rota">
      <div className="admin-ia-rota-cabecalho">
        <div>
          <strong>{titulo}</strong>
          <p>{descricao}</p>
        </div>
        <span className="admin-ia-rota-perfil">{info.perfil}</span>
      </div>
      <div className="admin-ia-campos">
        <label>
          <span>Modelo</span>
          <select
            value={valor.modelo}
            onChange={(e) => onChange({ ...valor, modelo: e.target.value as ModeloIaPermitido })}
          >
            {MODELOS_IA_PERMITIDOS.map((modelo) => (
              <option key={modelo} value={modelo}>{INFO_MODELOS_IA[modelo].nome}</option>
            ))}
          </select>
        </label>
        <label>
          <span>Raciocínio</span>
          <select
            value={valor.esforco}
            onChange={(e) => onChange({ ...valor, esforco: e.target.value as EsforcoIaPermitido })}
          >
            {ESFORCOS_IA_PERMITIDOS.map((esforco) => <option key={esforco} value={esforco}>{esforco}</option>)}
          </select>
        </label>
      </div>
      <div className="admin-ia-rota-rodape">
        <span>{sugestao}</span>
        <span>US$ {info.entradaUsd}/M entrada · US$ {info.saidaUsd}/M saída</span>
      </div>
    </div>
  );
}

export default function CentroIaAdmin() {
  const [configuracao, setConfiguracao] = useState<ConfiguracaoIa>(() => copiarConfiguracao(CONFIGURACAO_IA_PADRAO));
  const [salva, setSalva] = useState<VersaoConfiguracaoIa | null>(null);
  const [historico, setHistorico] = useState<VersaoConfiguracaoIa[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [persistenciaDisponivel, setPersistenciaDisponivel] = useState(true);
  const [mensagem, setMensagem] = useState<string | null>(null);

  useEffect(() => {
    let cancelado = false;
    carregarConfiguracaoIaAdmin().then((resposta) => {
      if (cancelado) return;
      setCarregando(false);
      if (!resposta.ok || !resposta.configuracao) {
        setMensagem(resposta.mensagem || "Não foi possível carregar a configuração.");
        return;
      }
      setSalva(resposta.configuracao);
      setConfiguracao(copiarConfiguracao(resposta.configuracao));
      setHistorico(resposta.historico || []);
      setPersistenciaDisponivel(resposta.persistenciaDisponivel !== false);
      setMensagem(resposta.mensagem || null);
    });
    return () => { cancelado = true; };
  }, []);

  const alterada = useMemo(() => {
    if (!salva) return false;
    return JSON.stringify(configuracao) !== JSON.stringify(copiarConfiguracao(salva));
  }, [configuracao, salva]);

  function mudarRota(chave: (typeof ROTAS)[number]["chave"], valor: RotaModeloIa) {
    setConfiguracao((atual) => ({ ...atual, [chave]: valor }));
  }

  async function salvar() {
    setSalvando(true);
    const resposta = await salvarConfiguracaoIaAdmin(configuracao);
    setSalvando(false);
    if (!resposta.ok || !resposta.configuracao) {
      toast(resposta.mensagem || "Não foi possível salvar a configuração.", "error");
      return;
    }
    setSalva(resposta.configuracao);
    setConfiguracao(copiarConfiguracao(resposta.configuracao));
    setHistorico((atual) => [resposta.configuracao as VersaoConfiguracaoIa, ...atual].slice(0, 8));
    toast(`Configuração de IA salva na versão ${resposta.configuracao.versao}.`, "success");
  }

  return (
    <section className="card admin-ia-centro" aria-labelledby="admin-ia-titulo">
      <div className="admin-ia-topo">
        <div>
          <div className="admin-ia-selo">Governança de IA</div>
          <h2 id="admin-ia-titulo">Centro de IA</h2>
          <p>Veja o caminho completo e controle qual modelo atende cada responsabilidade.</p>
        </div>
        <div className="admin-ia-versao">
          <span>Versão ativa</span>
          <strong>{carregando ? "…" : salva?.versao ? `v${salva.versao}` : "padrão do código"}</strong>
          {salva?.criadoEm && <small>{new Date(salva.criadoEm).toLocaleString("pt-BR")}</small>}
        </div>
      </div>

      {mensagem && <div className={`admin-ia-nota${persistenciaDisponivel ? "" : " alerta"}`}>{mensagem}</div>}

      <div className="admin-ia-mapa" aria-label="Arquitetura atual da inteligência artificial">
        {ARQUITETURA.map((bloco, indice) => (
          <div className="admin-ia-no" key={bloco.numero}>
            <div className="admin-ia-no-numero">{bloco.numero}</div>
            <strong>{bloco.titulo}</strong>
            <ul>{bloco.itens.map((item) => <li key={item}>{item}</li>)}</ul>
            {indice < ARQUITETURA.length - 1 && <span className="admin-ia-seta" aria-hidden="true">→</span>}
          </div>
        ))}
      </div>

      <div className="admin-ia-seguranca">
        <strong>O que o painel pode alterar</strong>
        <span>modelos, esforço e uma orientação editorial complementar</span>
        <strong>O que continua protegido</strong>
        <span>travas contra invenção, contratos JSON, RLS, protocolos e validações determinísticas</span>
      </div>

      <div className="admin-ia-barra">
        <div>
          <h3>Roteamento dos modelos</h3>
          <p>Trocar uma rota cria uma nova versão; as anteriores não são sobrescritas.</p>
        </div>
        <button
          type="button"
          className="btn"
          onClick={() => setConfiguracao({
            ...copiarConfiguracao(CONFIGURACAO_IA_RECOMENDADA),
            instrucaoAtendimento: configuracao.instrucaoAtendimento,
          })}
          disabled={carregando}
        >
          Aplicar sugestão
        </button>
      </div>

      <div className="admin-ia-rotas">
        {ROTAS.map((rota) => (
          <RotaEditor
            key={rota.chave}
            {...rota}
            valor={configuracao[rota.chave]}
            onChange={(valor) => mudarRota(rota.chave, valor)}
          />
        ))}
      </div>

      <div className="admin-ia-instrucao">
        <label htmlFor="admin-ia-instrucao">
          <strong>Orientação complementar para as sugestões de mensagem</strong>
          <span>Use para tom e prioridade. Valores, taxas, procedimentos e promessas devem continuar em Protocolos.</span>
        </label>
        <textarea
          id="admin-ia-instrucao"
          value={configuracao.instrucaoAtendimento}
          maxLength={MAX_INSTRUCAO_ATENDIMENTO}
          rows={4}
          placeholder="Ex.: Priorize respostas diretas e evite encerrar toda mensagem com uma pergunta."
          onChange={(e) => setConfiguracao((atual) => ({ ...atual, instrucaoAtendimento: e.target.value }))}
        />
        <div className="admin-ia-contador">{configuracao.instrucaoAtendimento.length}/{MAX_INSTRUCAO_ATENDIMENTO}</div>
      </div>

      <div className="admin-ia-acoes">
        <span>{alterada ? "Há alterações ainda não publicadas." : "Configuração sincronizada."}</span>
        <button
          type="button"
          className="btn primary"
          disabled={!alterada || salvando || !persistenciaDisponivel}
          onClick={salvar}
        >
          {salvando ? "Salvando…" : "Salvar nova versão"}
        </button>
      </div>

      {historico.length > 0 && (
        <details className="admin-ia-historico">
          <summary>Histórico de versões ({historico.length})</summary>
          <div className="admin-ia-historico-lista">
            {historico.map((versao) => (
              <button
                type="button"
                key={versao.versao}
                onClick={() => setConfiguracao(copiarConfiguracao(versao))}
              >
                <span><strong>v{versao.versao}</strong> · {versao.criadoEm ? new Date(versao.criadoEm).toLocaleString("pt-BR") : "sem data"}</span>
                <small>{versao.classificacao.modelo} / {versao.atendimento.modelo} / {versao.operacoes.modelo}</small>
              </button>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}
