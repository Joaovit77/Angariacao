"use client";

/* ================================================================
   VIEW: ADMINISTRAÇÃO (super admin)

   As perguntas de quem OPERA o sistema, nesta ordem, porque é a ordem
   em que elas custam dinheiro: o que está configurado no deploy, quem
   está travado, quanto cada um consome e o que quebrou.

   A lista abre por QUEM PRECISA DE VOCÊ (ver `ordenarCorretores`), não
   por volume nem por ordem de cadastro. Ordenar por qualquer outra
   coisa faz a maioria — que está bem — enterrar as duas linhas que
   pedem ação, e é assim que uma tela de operação deixa de ser aberta.

   A CONEXÃO DO WHATSAPP é consultada SOB DEMANDA, no botão, e não a
   cada abertura da tela. Cada consulta ocupa a mesma instância que
   precisa estar livre para enviar mensagem (a razão de
   `intervaloConsultaMs` existir), e uma varredura automática a cada
   render transformaria esta tela num consumidor permanente das
   instâncias de todos os corretores. No detalhe de UM corretor a
   consulta volta a ser em laço: ali alguém está com o celular na mão.

   Nada aqui decide acesso: o menu escondido é conveniência, e toda
   rota /api/admin/* reconfere o cargo por conta própria.
   ================================================================ */
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ordenarCorretores,
  rotuloEvento,
  totaisDoPainel,
  type CorretorAdmin,
  type EventoLog,
  type NivelSaude,
} from "@/lib/calculo/admin";
import {
  intervaloConsultaMs,
  mensagemConexaoDeTerceiro,
  type Conexao,
  type EstadoConexao,
} from "@/lib/calculo/conexaoWhatsapp";
import { fmtUsd, type GastoIa, type MesDeGasto } from "@/lib/calculo/custoIa";
import { linhaDoHistorico } from "@/lib/calculo/sistemaPrincipal";
import {
  carregarAmbiente,
  carregarHistoricoIa,
  carregarLogs,
  carregarPainelAdmin,
  carregarUsoFirecrawl,
  conexaoDoCorretor,
  definirCargo,
  definirIa,
  definirTetoIa,
  salvarInstancia,
  verificarConexoes,
  type CapacidadeAmbiente,
  type ConexaoDeCorretor,
  type PainelAdmin,
  type RespostaUsoFirecrawlAdmin,
} from "@/lib/admin";
import { useSessao } from "@/components/SessaoProvider";
import { fmtDate } from "@/lib/formatadores";
import { todayISO } from "@/lib/datas";
import { toast } from "@/lib/toast";

const CORES: Record<NivelSaude, string> = {
  bloqueado: "var(--bad)",
  atencao: "var(--warn)",
  ok: "var(--good)",
};

const ROTULO_NIVEL: Record<NivelSaude, string> = {
  bloqueado: "Travado",
  atencao: "Atenção",
  ok: "Ok",
};

/** O estado da conexão em uma palavra, para caber na coluna. A frase
    inteira (`mensagemConexaoDeTerceiro`) fica para o detalhe, onde há
    espaço e onde ela vira instrução. */
const ROTULO_CONEXAO: Record<EstadoConexao, string> = {
  conectado: "Conectado",
  desconectado: "Caiu",
  conectando: "Conectando",
  "sem-instancia": "Sem número",
  "nao-configurado": "Sem Evolution",
  falha: "Sem resposta",
};

const COR_CONEXAO: Record<EstadoConexao, string> = {
  conectado: "var(--good)",
  desconectado: "var(--bad)",
  conectando: "var(--warn)",
  "sem-instancia": "var(--bad)",
  "nao-configurado": "var(--text-faint)",
  falha: "var(--warn)",
};

/** Data curta a partir de um timestamp ISO do banco. */
function dia(iso: string | null): string {
  if (!iso) return "—";
  return fmtDate(iso.slice(0, 10)) || "—";
}

/** "2026-08" -> "ago/26". A série tem seis colunas estreitas; o mês por
    extenso não cabe e o número puro ("2026-08") não se lê de relance. */
const MESES_CURTOS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
function mesCurto(mes: string): string {
  const n = Number(mes.slice(5, 7));
  return `${MESES_CURTOS[n - 1] || mes}/${mes.slice(2, 4)}`;
}

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/**
 * Troca o uuid de quem executou uma ação pelo e-mail, na hora de exibir.
 *
 * O log GRAVA o uuid de propósito — é o que continua identificando a
 * pessoa depois de uma troca de e-mail, e não duplica dado pessoal numa
 * tabela que quem opera o sistema lê. Mas "por eb553f27-…" não diz nada a
 * ninguém, então a tradução acontece aqui, onde a lista de contas já
 * está carregada. Sem correspondência, o uuid fica — melhor um id
 * ilegível do que sumir com a informação de quem agiu.
 */
function comNomes(detalhe: string | null, contas: CorretorAdmin[]): string {
  if (!detalhe) return "—";
  return detalhe.replace(UUID, (id) => contas.find((c) => c.id === id)?.email || id);
}

export default function AdminView() {
  const { usuario } = useSessao();
  const [corretores, setCorretores] = useState<CorretorAdmin[]>([]);
  const [orfao, setOrfao] = useState<GastoIa | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [aberto, setAberto] = useState<string | null>(null);

  const [ambiente, setAmbiente] = useState<CapacidadeAmbiente[]>([]);
  const [firecrawl, setFirecrawl] = useState<RespostaUsoFirecrawlAdmin | null>(null);
  const [conexoes, setConexoes] = useState<Map<string, ConexaoDeCorretor> | null>(null);
  const [verificando, setVerificando] = useState(false);
  const [serieIa, setSerieIa] = useState<Map<string, MesDeGasto[]>>(new Map());

  const [eventos, setEventos] = useState<EventoLog[]>([]);
  const [nivelLog, setNivelLog] = useState<string>("erro");
  const [carregandoLog, setCarregandoLog] = useState(true);
  const [eventosSophia, setEventosSophia] = useState<EventoLog[]>([]);
  const [carregandoSophia, setCarregandoSophia] = useState(true);

  const hoje = todayISO();

  /* A forma abaixo — buscar no efeito e aplicar dentro do `.then` — é a
     mesma do `SessaoProvider`, e não é preferência: o React Compiler
     proíbe `setState` SÍNCRONO dentro de `useEffect` (um dos dois
     tropeços documentados no CLAUDE.md). Por isso `carregando` já nasce
     `true` — quem liga o indicador na carga inicial é o valor inicial do
     estado, não o efeito. O botão Atualizar pode ligá-lo à vontade: ali
     é evento, não efeito. */
  const aplicarPainel = useCallback((r: PainelAdmin) => {
    setCarregando(false);
    if (!r.ok) {
      setErro(r.mensagem || "Não foi possível carregar o painel.");
      return;
    }
    setErro(null);
    setCorretores(r.corretores || []);
    setOrfao(r.orfao || null);
  }, []);

  const recarregar = useCallback(() => {
    carregarPainelAdmin().then(aplicarPainel);
    setFirecrawl(null);
    carregarUsoFirecrawl().then(setFirecrawl);
  }, [aplicarPainel]);

  useEffect(() => {
    let cancelado = false;
    carregarPainelAdmin().then((r) => {
      if (!cancelado) aplicarPainel(r);
    });
    return () => {
      cancelado = true;
    };
  }, [aplicarPainel]);

  // O que está configurado no deploy. Uma consulta só, no boot: variável
  // de ambiente não muda sem um deploy novo, que recarrega a página.
  useEffect(() => {
    let cancelado = false;
    carregarAmbiente().then((r) => {
      if (!cancelado && r.ok) setAmbiente(r.capacidades || []);
    });
    return () => {
      cancelado = true;
    };
  }, []);

  // O saldo vem da conta Firecrawl e é global para o deploy. Consultá-lo
  // não executa raspagem nem gasta créditos; só lê a cobrança do ciclo.
  useEffect(() => {
    let cancelado = false;
    carregarUsoFirecrawl().then((r) => {
      if (!cancelado) setFirecrawl(r);
    });
    return () => {
      cancelado = true;
    };
  }, []);

  // A série mensal de IA. Separada da lista de corretores porque a
  // janela é outra (seis meses contra o mês corrente) e porque ela não
  // pode atrasar o painel: a pergunta "quem está travado" vem primeiro.
  useEffect(() => {
    let cancelado = false;
    carregarHistoricoIa().then((r) => {
      if (cancelado || !r.ok) return;
      setSerieIa(new Map((r.historico || []).map((h) => [h.userId, h.serie])));
    });
    return () => {
      cancelado = true;
    };
  }, []);

  useEffect(() => {
    let cancelado = false;
    carregarLogs(nivelLog ? { nivel: nivelLog } : {}).then((r) => {
      if (cancelado) return;
      setCarregandoLog(false);
      if (r.ok) setEventos(r.eventos || []);
    });
    return () => {
      cancelado = true;
    };
  }, [nivelLog]);

  /* O histórico da integração é uma consulta PRÓPRIA, e não um recorte da
     lista acima: aquela abre filtrada por erros (é o que o operador precisa
     ver primeiro), e aqui o desfecho mais comum — e o que mais se audita —
     é "aplicado", que é `info`. Reusar a mesma busca deixaria esta tabela
     vazia justamente quando a integração está funcionando. */
  useEffect(() => {
    let cancelado = false;
    carregarLogs({ categoria: "sophia", limite: 50 }).then((r) => {
      if (cancelado) return;
      setCarregandoSophia(false);
      if (r.ok) setEventosSophia(r.eventos || []);
    });
    return () => {
      cancelado = true;
    };
  }, []);

  const historicoSophia = useMemo(() => eventosSophia.map(linhaDoHistorico), [eventosSophia]);

  // Só os ESTADOS vão para o cálculo: `saudeDoCorretor` decide com eles,
  // e passar o objeto inteiro convidaria a tela a depender do QR, que
  // aqui nunca é pedido.
  const estadosConexao = useMemo(() => {
    if (!conexoes) return undefined;
    return new Map([...conexoes].map(([id, c]) => [id, c.estado] as const));
  }, [conexoes]);

  const linhas = useMemo(
    () => ordenarCorretores(corretores, hoje, estadosConexao),
    [corretores, hoje, estadosConexao],
  );
  const totais = useMemo(
    () => totaisDoPainel(corretores, hoje, estadosConexao),
    [corretores, hoje, estadosConexao],
  );

  // O gasto de contas removidas não pertence a ninguém da lista, mas saiu
  // da fatura — sem ele o total do painel não bate com a da OpenAI.
  const custoTotal = totais.custoUsd + (orfao?.custoUsd || 0);

  const faltando = ambiente.filter((c) => !c.configurado);
  const usoFirecrawl = firecrawl?.ok ? firecrawl.uso : undefined;

  /* O Sophia é o único caso em que a tela sabe mais que a variável: o log
     abaixo já responde "chegou algum evento?", e é a diferença entre "a
     chave está lá" e "a integração está viva". Depende do carregamento
     ter terminado — senão o chip anuncia "sem eventos" no primeiro quadro,
     para todo mundo, e volta atrás sozinho.

     As outras integrações ficam só com a leitura de configuração: dá para
     inferir vida delas por outros sinais (chamadas de IA no mês, a
     varredura de conexões, contas do Google), mas cada inferência dessas
     é uma regra a mais para errar, e a ressalva abaixo do cartão já
     impede a leitura otimista. */
  const semEventosSophia = !carregandoSophia && eventosSophia.length === 0;

  async function alternarIa(c: CorretorAdmin) {
    const r = await definirIa(c.id, !c.iaLiberada);
    if (!r.ok) {
      toast(r.mensagem || "Não foi possível alterar.", "error");
      return;
    }
    toast(c.iaLiberada ? "IA revogada." : "IA liberada.", "success");
    recarregar();
  }

  async function verificar() {
    setVerificando(true);
    const r = await verificarConexoes();
    setVerificando(false);
    if (!r.ok) {
      toast(r.mensagem || "Não foi possível consultar as conexões.", "error");
      return;
    }
    if (r.naoConfigurado) {
      toast("Este ambiente não tem servidor de WhatsApp configurado.", "error");
      return;
    }
    const mapa = new Map((r.conexoes || []).map((c) => [c.userId, c]));
    setConexoes(mapa);
    const caidos = [...mapa.values()].filter((c) => c.estado === "desconectado").length;
    toast(
      caidos === 0
        ? "Todas as conexões estão de pé."
        : `${caidos} número(s) desconectado(s) — abra o detalhe para reconectar.`,
      caidos === 0 ? "success" : "error",
    );
  }

  return (
    <div className="admin-view">
      <div className="page-head admin-page-head">
        <div className="admin-page-identidade">
          <div className="admin-page-icone" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M12 2l8 4v6c0 5-3.4 8.7-8 10-4.6-1.3-8-5-8-10V6z" />
              <path d="M8.5 12.5l2.2 2.2 4.8-5" />
            </svg>
          </div>
          <div>
            <div className="admin-page-sobretitulo">Central de operações</div>
            <h1 className="page-title">Administração</h1>
            <p className="page-sub">Contas, consumo de IA e o que quebrou — em todo o sistema</p>
          </div>
        </div>
        <button
          type="button"
          className="btn admin-atualizar"
          onClick={() => {
            setCarregando(true);
            recarregar();
          }}
          disabled={carregando}
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M20 11a8 8 0 1 0-2.3 5.7" />
            <path d="M20 4v7h-7" />
          </svg>
          {carregando ? "Atualizando…" : "Atualizar"}
        </button>
      </div>

      {erro && (
        <div className="card admin-aviso erro">
          <div>{erro}</div>
        </div>
      )}

      <div className="grid grid-4 admin-kpis">
        <div className="card kpi-card admin-kpi-card admin-kpi-contas">
          <div className="kpi-label">Corretores</div>
          <div className="kpi-value">{totais.corretores}</div>
        </div>
        <div className="card kpi-card admin-kpi-card admin-kpi-travados">
          <div className="kpi-label">Travados</div>
          <div className="kpi-value" style={{ color: totais.bloqueados ? "var(--bad)" : undefined }}>
            {totais.bloqueados}
          </div>
          <div className="kpi-delta flat">
            {/* O texto muda com a varredura porque o número muda: sem ela,
                "travado" só conhece a falta de cadastro. */}
            {conexoes ? "sem número ou desconectados" : "sem número de WhatsApp"}
          </div>
        </div>
        <div className="card kpi-card admin-kpi-card admin-kpi-atencao">
          <div className="kpi-label">Em atenção</div>
          <div className="kpi-value" style={{ color: totais.emAtencao ? "var(--warn)" : undefined }}>
            {totais.emAtencao}
          </div>
        </div>
        <div className="card kpi-card admin-kpi-card admin-kpi-ia">
          <div className="kpi-label">IA no mês</div>
          <div className="kpi-value">{fmtUsd(custoTotal)}</div>
          <div className="kpi-delta flat">
            {totais.chamadas} chamadas
            {totais.acimaDoTeto > 0 && (
              <span className="admin-kpi-alerta"> · {totais.acimaDoTeto} acima do teto</span>
            )}
          </div>
        </div>
      </div>

      <div className="card admin-card-firecrawl">
        <div className="card-title">
          Firecrawl{" "}
          <span className="section-note">consumo global da busca de anúncios</span>
        </div>

        {!firecrawl && <div className="admin-vazio">Consultando créditos…</div>}

        {firecrawl && !usoFirecrawl && (
          <div className="admin-firecrawl-falha">
            {firecrawl.mensagem || "Não foi possível consultar o consumo agora."}
          </div>
        )}

        {usoFirecrawl && (
          <>
            <div className="grid grid-3 admin-firecrawl-kpis">
              <div>
                <div className="kpi-label">Consumidos no ciclo</div>
                <div className="admin-firecrawl-valor">
                  {Intl.NumberFormat("pt-BR").format(usoFirecrawl.creditosConsumidos)}
                </div>
              </div>
              <div>
                <div className="kpi-label">Disponíveis</div>
                <div className="admin-firecrawl-valor">
                  {Intl.NumberFormat("pt-BR").format(usoFirecrawl.creditosDisponiveis)}
                </div>
              </div>
              <div>
                <div className="kpi-label">Plano do ciclo</div>
                <div className="admin-firecrawl-valor">
                  {Intl.NumberFormat("pt-BR").format(usoFirecrawl.creditosDoPlano)}
                </div>
              </div>
            </div>
            <div
              className="admin-firecrawl-trilho"
              role="progressbar"
              aria-label="Créditos Firecrawl consumidos"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.round(usoFirecrawl.percentualConsumido)}
            >
              <div
                className="admin-firecrawl-preenchido"
                style={{ width: `${usoFirecrawl.percentualConsumido}%` }}
              />
            </div>
            <div className="field-hint admin-firecrawl-periodo">
              {usoFirecrawl.percentualConsumido.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}% usado
              {usoFirecrawl.inicioCiclo && usoFirecrawl.fimCiclo
                ? ` · ciclo de ${dia(usoFirecrawl.inicioCiclo)} a ${dia(usoFirecrawl.fimCiclo)}`
                : ""}
              . O Firecrawl cobra em créditos; o valor em dinheiro depende do plano contratado.
            </div>
          </>
        )}
      </div>

      {/* ------------------------------------------------------------------
          O AMBIENTE

          Vem primeiro porque é a única seção que explica as OUTRAS: com a
          Evolution fora do ar, a lista abaixo mostra todo mundo travado e o
          log enche de falhas de envio — e o operador passaria a tarde
          investigando dez contas para descobrir um campo vazio na Vercel.

          Fechado quando está tudo certo: um cartão permanentemente verde
          ocupa o topo da tela sem nunca informar nada, e o que ocupa espaço
          sem informar é o que ensina a rolar a página sem ler.
          ------------------------------------------------------------------ */}
      <div className="card admin-card-ambiente">
        <div className="card-title">
          Ambiente{" "}
          <span className="section-note">
            {ambiente.length === 0
              ? "consultando…"
              : faltando.length === 0
                ? "todas as chaves preenchidas"
                : `${faltando.length} chave(s) faltando`}
          </span>
        </div>

        {/* A fita mostra TODAS as integrações, inclusive as que estão de
            pé. A versão anterior escondia o cartão quando estava tudo
            certo, e o motivo era bom (verde permanente no topo não
            informa nada); o chip resolve os dois lados por caber numa
            linha — confirma de relance o que existe, e o que falta salta
            sem precisar de tabela. */}
        <div className="admin-ambiente">
          {ambiente.map((c) => {
            /* Configurado é NEUTRO, não verde. Chave preenchida não é
               conquista, é ausência de problema — e verde ao lado do nome
               de uma integração lê-se como "conectada", que é coisa que
               esta rota não tem como saber: ela olha variável de
               ambiente, não tráfego. Pintar de verde fez exatamente esse
               estrago com o Sophia, que apareceu "✓" antes de o outro
               sistema ter mandado o primeiro evento. */
            const espera = c.chave === "sophia" && c.configurado && semEventosSophia;
            const estado = !c.configurado
              ? c.essencial
                ? "falta"
                : "opcional"
              : espera
                ? "espera"
                : "ok";
            return (
              <span key={c.chave} className={`admin-cap ${estado}`} title={c.variavel}>
                {c.configurado ? (espera ? "◷" : "•") : "✕"} {c.nome}
                {espera && " · sem eventos"}
              </span>
            );
          })}
        </div>

        {/* A ressalva existia na versão anterior e se perdeu quando o
            cartão virou fita de chips — bem na hora em que o visual ficou
            mais afirmativo. Ela é o que impede "configurado" de ser lido
            como "funcionando". */}
        <div className="field-hint admin-cap-ressalva">
          Diz que a chave está preenchida neste deploy — não que o serviço esteja no ar nem que
          alguém já o tenha usado.
        </div>

        {faltando.length > 0 && (
          <div className="admin-cap-lista">
            {faltando.map((c) => (
              <div key={c.chave} className={`admin-cap-item ${c.essencial ? "essencial" : "opcional"}`}>
                <div>
                  <strong>{c.nome}</strong> <code>{c.variavel}</code>
                  <br />
                  <span>{c.semEla}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* O aviso que impede a tabela de preços de envelhecer em silêncio.
          Sem ele, o painel continuaria somando com valores de meses atrás
          e a diferença só apareceria na fatura. */}
      {totais.precoNaoConferido && (
        <div className="card admin-aviso atencao">
          <div className="admin-aviso-corpo">
            <strong>Preços não conferidos.</strong> Os valores acima
            usam a tabela de <code>web/lib/calculo/custoIa.ts</code>, que ainda não foi verificada
            contra <em>platform.openai.com/docs/pricing</em>. Os tokens são reais; o custo em dólar é
            uma estimativa até alguém conferir e preencher o <code>conferidoEm</code>.
          </div>
        </div>
      )}

      <div className="card admin-card-corretores">
        {/* `.card-title` já é flex com space-between — não precisa de
            estilo inline repetindo isso. */}
        <div className="card-title">
          <span>
            Corretores{" "}
            {!conexoes && (
              <span className="section-note">a coluna WhatsApp mostra o cadastro, não a conexão</span>
            )}
          </span>
          <button type="button" className="btn btn-sm" onClick={() => void verificar()} disabled={verificando}>
            {verificando ? "Verificando…" : "Verificar conexões"}
          </button>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Conta</th>
                <th>Situação</th>
                <th className="admin-num">Imóveis</th>
                <th className="admin-num">Envios 30d</th>
                <th className="admin-num">Respostas 30d</th>
                <th className="admin-num">IA no mês</th>
                <th>WhatsApp</th>
                <th>IA</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {linhas.map(({ corretor: c, saude }) => {
                const conexao = conexoes?.get(c.id);
                return (
                  <tr key={c.id}>
                    <td>
                      <div className="admin-conta-nome">
                        {c.nome || c.email}
                        {c.ehAdmin && (
                          <span className="badge" style={{ color: "var(--accent)" }}>
                            {c.operaCarteira ? "admin" : "só operação"}
                          </span>
                        )}
                      </div>
                      <div className="admin-conta-sub">
                        {c.nome ? `${c.email} · ` : ""}desde {dia(c.criadoEm)}
                      </div>
                    </td>
                    <td>
                      {/* A pílula declara só a COR; o fundo sai dela por
                          color-mix (ver `.badge`), então não existe
                          situação com fundo de um nível e texto de outro. */}
                      <span className="badge" style={{ color: CORES[saude.nivel] }}>
                        <span className="dot" />
                        {ROTULO_NIVEL[saude.nivel]}
                      </span>
                      <div className="admin-motivo">{saude.motivo}</div>
                    </td>
                    <td className="admin-num">{c.imoveis}</td>
                    <td className="admin-num">{c.tentativas30d}</td>
                    <td className="admin-num">{c.respostas30d}</td>
                    <td className="admin-num">
                      {fmtUsd(c.gasto.custoUsd)}
                      {c.tetoUsd !== null && (
                        <div className={`admin-teto${c.gasto.custoUsd > c.tetoUsd ? " estourado" : ""}`}>
                          teto {fmtUsd(c.tetoUsd)}
                        </div>
                      )}
                      {c.gasto.chamadasSemPreco > 0 && (
                        <div className="admin-teto estourado">
                          +{c.gasto.chamadasSemPreco} sem preço
                        </div>
                      )}
                    </td>
                    <td className="admin-instancia">
                      {c.instancia || <span className="ausente">não cadastrado</span>}
                      {conexao && (
                        <div className="admin-conexao" style={{ color: COR_CONEXAO[conexao.estado] }}>
                          <span className="dot" />
                          {ROTULO_CONEXAO[conexao.estado]}
                          {conexao.numero ? ` · ${conexao.numero}` : ""}
                        </div>
                      )}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-sm"
                        onClick={() => void alternarIa(c)}
                        title={c.iaLiberada ? "Revogar o acesso à IA" : "Liberar o acesso à IA"}
                      >
                        {c.iaLiberada ? "Liberada" : "Bloqueada"}
                      </button>
                    </td>
                    <td>
                      <button
                        type="button"
                        className="btn btn-sm btn-ghost"
                        onClick={() => setAberto(aberto === c.id ? null : c.id)}
                      >
                        {aberto === c.id ? "Fechar" : "Detalhes"}
                      </button>
                    </td>
                  </tr>
                );
              })}
              {linhas.length === 0 && !carregando && (
                <tr>
                  <td colSpan={9} className="admin-vazio">
                    Nenhuma conta cadastrada.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* O `key` vai no ELEMENTO, e não numa div lá dentro: é ele que faz
          o React descartar a instância ao trocar de corretor. Sem isso o
          componente é reaproveitado e o `useState` do formulário
          sobrevive — abrir o detalhe de outra pessoa traria o nome de
          instância digitado para a anterior, e salvar plantaria a
          instância de um na conta do outro (a resposta do proprietário
          passaria a cair na caixa errada). É a convenção de "reabrir não
          herda estado do uso anterior" do CLAUDE.md, no caso em que ela
          custa caro. */}
      {aberto && (
        <Detalhe
          key={aberto}
          corretor={corretores.find((c) => c.id === aberto) as CorretorAdmin}
          souEu={usuario?.id === aberto}
          serie={serieIa.get(aberto) || []}
          aoSalvar={() => recarregar()}
        />
      )}

      {/* ------------------------------------------------------------------
          HISTÓRICO DA INTEGRAÇÃO (Sistema Principal)

          Fica no painel de ADMIN, e não numa tela do corretor, por uma razão
          de dado: as linhas mais valiosas para depurar — "angariação não
          encontrada" e "mais de uma angariação" — não têm dono. É justamente
          o `user_id` que faltou descobrir, e uma tela escopada por corretor
          jamais as mostraria, escondendo exatamente os eventos que se perderam.

          Vem ANTES do log geral porque o log geral abre filtrado por erro; a
          pergunta "os eventos estão chegando?" precisa de uma tela em que a
          resposta normal — "sim, aplicado" — apareça.
          ------------------------------------------------------------------ */}
      <div className="card">
        <div className="card-title">
          Integração com o Sistema Principal{" "}
          <span className="section-note">últimos 50 eventos recebidos</span>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Data</th>
                <th>Evento</th>
                <th>Resultado</th>
                <th>Conta</th>
                <th>Detalhe</th>
              </tr>
            </thead>
            <tbody>
              {historicoSophia.map((l) => (
                <tr key={l.id}>
                  <td className="admin-cel-data">
                    {l.quando.slice(0, 16).replace("T", " ")}
                  </td>
                  <td className="admin-cel-min">
                    {l.evento || <span className="admin-nulo">—</span>}
                  </td>
                  <td>
                    <span
                      className="badge"
                      style={{
                        color:
                          l.tom === "ok"
                            ? "var(--good)"
                            : l.tom === "aviso"
                              ? "var(--warn)"
                              : "var(--bad)",
                      }}
                    >
                      {l.tom === "ok" ? "✅" : l.tom === "aviso" ? "⚠️" : "❌"} {l.resultado}
                    </span>
                  </td>
                  <td className="admin-cel-min">
                    {corretores.find((c) => c.id === l.userId)?.email || (
                      <span className="admin-nulo">—</span>
                    )}
                  </td>
                  <td className="admin-cel-detalhe">{l.contexto}</td>
                </tr>
              ))}
              {historicoSophia.length === 0 && !carregandoSophia && (
                <tr>
                  <td colSpan={5} className="admin-vazio">
                    Nenhum evento recebido do Sistema Principal ainda.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <div className="card-title">
          <span>O que aconteceu</span>
          <select
            className="admin-filtro"
            value={nivelLog}
            onChange={(e) => setNivelLog(e.target.value)}
          >
            <option value="erro">Só erros</option>
            <option value="aviso">Só avisos</option>
            <option value="">Tudo</option>
          </select>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Quando</th>
                <th>Conta</th>
                <th>O quê</th>
                <th>Detalhe</th>
              </tr>
            </thead>
            <tbody>
              {eventos.map((e) => (
                <tr key={e.id}>
                  <td className="admin-cel-data">
                    {e.criadoEm.slice(0, 16).replace("T", " ")}
                  </td>
                  <td className="admin-cel-min">
                    {corretores.find((c) => c.id === e.userId)?.email || (
                      <span className="admin-nulo">—</span>
                    )}
                  </td>
                  <td>
                    <span
                      className="badge"
                      style={{
                        color:
                          e.nivel === "erro"
                            ? "var(--bad)"
                            : e.nivel === "aviso"
                              ? "var(--warn)"
                              : "var(--text-dim)",
                      }}
                    >
                      {rotuloEvento(e.evento)}
                    </span>
                  </td>
                  <td className="admin-cel-detalhe">
                    {comNomes(e.detalhe, corretores)}
                  </td>
                </tr>
              ))}
              {eventos.length === 0 && !carregandoLog && (
                <tr>
                  <td colSpan={4} className="admin-vazio">
                    Nada registrado neste filtro.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------
   A CONEXÃO DAQUELE CORRETOR, EM LAÇO

   Aqui a consulta se repete (ao contrário da varredura da lista) porque
   é a tela em que alguém está reconectando: o estado muda de segundo em
   segundo enquanto o QR é lido. O ritmo sai de `intervaloConsultaMs`, que
   devolve zero quando insistir não mudaria nada — e zero encerra o laço,
   em vez de ocupar para sempre a instância que precisa estar livre para
   enviar mensagem.
   ---------------------------------------------------------------- */
function useConexaoAoVivo(userId: string) {
  const [conexao, setConexao] = useState<Conexao | null>(null);

  useEffect(() => {
    let vivo = true;
    let timer: ReturnType<typeof setTimeout> | undefined;

    function consultar() {
      conexaoDoCorretor(userId).then((c) => {
        if (!vivo) return;
        setConexao(c);
        const ms = intervaloConsultaMs(c.estado);
        if (ms > 0) timer = setTimeout(consultar, ms);
      });
    }
    consultar();

    return () => {
      vivo = false;
      if (timer) clearTimeout(timer);
    };
  }, [userId]);

  return conexao;
}

/* ----------------------------------------------------------------
   O detalhe de um corretor: onde se cadastra o número (a ação que
   destrava a conta), onde se reconecta o WhatsApp, onde se decide o
   cargo e onde se vê o gasto quebrado por tipo e por mês.
   ---------------------------------------------------------------- */
function Detalhe({
  corretor,
  souEu,
  serie,
  aoSalvar,
}: {
  corretor: CorretorAdmin;
  /** Este detalhe é da conta de quem está olhando? Só muda uma coisa —
      não se pode remover o próprio cargo —, mas é a coisa que deixaria o
      sistema sem administrador nenhum. A rota recusa de qualquer forma;
      aqui o botão nem se oferece, para o operador não descobrir a regra
      pelo erro. */
  souEu: boolean;
  serie: MesDeGasto[];
  aoSalvar: () => void;
}) {
  const [instancia, setInstancia] = useState(corretor.instancia || "");
  const [token, setToken] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [teto, setTeto] = useState(corretor.tetoUsd === null ? "" : String(corretor.tetoUsd));
  const conexao = useConexaoAoVivo(corretor.id);

  // Quem garante que reabrir para OUTRO corretor não herda o que estava
  // digitado aqui é o `key` no elemento, lá em cima — ver o comentário
  // dele. Este componente não precisa (e não deve) tentar resolver isso
  // sozinho com um efeito de sincronia.

  /* A escala da série. Chamava-se `tetoMaximo`, o que colidia com o
     TETO de gasto logo abaixo — dois "tetos" na mesma tela, um deles
     puramente visual. */
  const maiorDoPeriodo = useMemo(() => Math.max(...serie.map((m) => m.custoUsd), 0), [serie]);

  async function salvar() {
    if (!instancia.trim()) {
      toast("Informe o nome da instância na Evolution.", "error");
      return;
    }
    setSalvando(true);
    const r = await salvarInstancia(corretor.id, instancia.trim(), token.trim());
    setSalvando(false);
    if (!r.ok) {
      toast(r.mensagem || "Não foi possível salvar.", "error");
      return;
    }
    setToken("");
    toast("Número cadastrado.", "success");
    aoSalvar();
  }

  async function salvarTeto() {
    const limpo = teto.trim().replace(",", ".");
    // Campo vazio = remover o teto. É a única forma de dizer isso, e a
    // rota distingue "apague" de "não mexa" — ver o comentário dela.
    const valor = limpo === "" ? null : Number(limpo);
    if (valor !== null && (!Number.isFinite(valor) || valor <= 0)) {
      toast("Informe um valor em dólares maior que zero, ou deixe em branco para remover.", "error");
      return;
    }
    const r = await definirTetoIa(corretor.id, valor);
    if (!r.ok) {
      toast(r.mensagem || "Não foi possível salvar o teto.", "error");
      return;
    }
    toast(valor === null ? "Teto removido." : "Teto salvo.", "success");
    aoSalvar();
  }

  async function mudarCargo(mudanca: { admin?: boolean; operaCarteira?: boolean }) {
    const r = await definirCargo(corretor.id, mudanca);
    if (!r.ok) {
      toast(r.mensagem || "Não foi possível alterar o cargo.", "error");
      return;
    }
    toast("Cargo atualizado.", "success");
    aoSalvar();
  }

  return (
    <div className="card admin-detalhe">
      <div className="admin-detalhe-head">
        <span className="admin-detalhe-nome">{corretor.nome || corretor.email}</span>
        {corretor.nome && <span className="admin-detalhe-email">{corretor.email}</span>}
        {corretor.ehAdmin && (
          <span className="badge" style={{ color: "var(--accent)" }}>
            {corretor.operaCarteira ? "admin" : "só operação"}
          </span>
        )}
      </div>

      <div className="grid grid-2 admin-detalhe-grid">
        <div>
          <div className="field-group">
            <label>Instância na Evolution</label>
            <input
              value={instancia}
              onChange={(e) => setInstancia(e.target.value)}
              placeholder="nome-da-instancia"
            />
            <div className="field-hint">
              Exatamente como aparece no campo <code>instance</code> do evento — é por ele que a
              resposta do proprietário encontra a carteira certa.
            </div>
          </div>

          <div className="field-group">
            <label>Token da instância</label>
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder={corretor.instancia ? "(deixe em branco para manter o atual)" : ""}
              autoComplete="new-password"
            />
            {/* O token nunca volta do servidor — nem mascarado. Ele manda
                mensagem pela instância, e o browser do admin não é mais
                seguro que o de ninguém. */}
            <div className="field-hint">
              Não é a <em>global api key</em>. Em branco, o que já está gravado é mantido.
            </div>
          </div>

          <button type="button" className="btn btn-primary" onClick={() => void salvar()} disabled={salvando}>
            {salvando ? "Salvando…" : "Salvar número"}
          </button>

          {/* ----------------------------------------------------------
              CONEXÃO — o estado que faltava

              O cadastro acima diz que a conta TEM número; isto diz se o
              número está de pé. Eram tratados como a mesma coisa, e não
              são: instância cadastrada com o WhatsApp caído não envia
              nada, e o painel dava "Ok".
              ---------------------------------------------------------- */}
          <div className="field-group">
            <label>Conexão</label>
            {conexao === null ? (
              <div className="field-hint">Consultando a Evolution…</div>
            ) : (
              <>
                <div
                  className="admin-conexao-estado"
                  style={{ color: COR_CONEXAO[conexao.estado] }}
                >
                  <span className="dot" />
                  {ROTULO_CONEXAO[conexao.estado]}
                  {conexao.numero ? ` · ${conexao.numero}` : ""}
                </div>
                {/* A voz de TERCEIRO, não a do corretor: aqui se olha o
                    número de outra pessoa, e "leia o código com o
                    celular" pareraria a instância dela com o aparelho
                    errado. */}
                <div className="field-hint">{mensagemConexaoDeTerceiro(conexao.estado)}</div>
                {/* O QR só aparece desconectado, e só se veio: em
                    "conectando" ele já foi lido, e mostrar outro faria
                    escanear de novo justamente quando a sessão está
                    subindo — o segundo pareamento derruba o primeiro. */}
                {conexao.estado === "desconectado" && conexao.qr && (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    className="admin-qr"
                    src={conexao.qr}
                    alt="QR Code para reconectar o WhatsApp"
                  />
                )}
              </>
            )}
          </div>
        </div>

        <div>
          <div className="field-group">
            <label>Consumo de IA no mês</label>
            {corretor.gasto.chamadas === 0 ? (
              <div className="field-hint">Nenhuma chamada neste período.</div>
            ) : (
              /* Lista, e não <table>: são três colunas sem cabeçalho
                 dentro de um cartão que já tem uma tabela acima, e a
                 segunda herdava o `tbody tr:hover` da primeira. */
              <div className="admin-tipos">
                {corretor.gasto.porTipo.map((t) => (
                  <div key={t.tipo} className="admin-tipo">
                    <span className="admin-tipo-nome">{t.tipo}</span>
                    <span className="admin-tipo-qtd">{t.chamadas}×</span>
                    <span className="admin-tipo-custo">{fmtUsd(t.custoUsd)}</span>
                  </div>
                ))}
              </div>
            )}
            {corretor.gasto.modelosSemPreco.length > 0 && (
              <div className="field-hint admin-kpi-alerta">
                Sem preço cadastrado: {corretor.gasto.modelosSemPreco.join(", ")} — acrescente em{" "}
                <code>lib/calculo/custoIa.ts</code>.
              </div>
            )}
          </div>

          {/* A série. Barras em div, e não Chart.js: são seis valores e
              nenhuma interação — um canvas aqui traria o ciclo de
              instanciar/destruir por uma leitura que o CSS resolve. */}
          <div className="field-group">
            <label>Últimos meses</label>
            {serie.length === 0 ? (
              <div className="field-hint">Sem histórico.</div>
            ) : (
              <div className="admin-serie">
                {serie.map((m, i) => (
                  <div
                    key={m.mes}
                    /* O último é o mês CORRENTE: é o único ainda
                       correndo, e é contra os anteriores que a pergunta
                       "está subindo?" se responde. */
                    className={`admin-serie-col${i === serie.length - 1 ? " atual" : ""}`}
                    title={`${m.chamadas} chamada(s)`}
                  >
                    {/* O trilho é o que faz mês ZERO continuar visível.
                        Sem ele a coluna não desenha nada e volta a se ler
                        como "não tenho esse dado" — a distinção que
                        `gastoPorMes` existe para preservar. */}
                    <div className="admin-serie-trilho">
                      <div
                        className="admin-serie-barra"
                        style={{
                          height:
                            maiorDoPeriodo > 0
                              ? `${Math.max(m.custoUsd > 0 ? 3 : 0, Math.round((m.custoUsd / maiorDoPeriodo) * 100))}%`
                              : 0,
                        }}
                      />
                    </div>
                    <div className="admin-serie-mes">{mesCurto(m.mes)}</div>
                    <div className="admin-serie-valor">{fmtUsd(m.custoUsd)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="field-group">
            <label>Teto de gasto no mês (US$)</label>
            <div className="admin-linha-campo">
              <input
                value={teto}
                onChange={(e) => setTeto(e.target.value)}
                placeholder="sem teto"
                inputMode="decimal"
              />
              <button type="button" className="btn btn-sm" onClick={() => void salvarTeto()}>
                Salvar
              </button>
            </div>
            <div className="field-hint">
              Avisa, não bloqueia: a linha acende no painel e a conta continua funcionando. Em branco
              remove o teto.
            </div>
          </div>

          {/* ----------------------------------------------------------
              CARGO — a última decisão que ainda morava no Table Editor
              ---------------------------------------------------------- */}
          <div className="field-group">
            <label>Cargo</label>
            <div className="admin-acoes">
              {corretor.ehAdmin ? (
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => void mudarCargo({ admin: false })}
                  disabled={souEu}
                  title={
                    souEu
                      ? "Você não pode remover o próprio cargo — é o que impede o sistema de ficar sem administrador."
                      : "Remover o cargo de administrador"
                  }
                >
                  Remover admin
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => void mudarCargo({ admin: true })}
                >
                  Tornar admin
                </button>
              )}

              {corretor.ehAdmin && (
                <button
                  type="button"
                  className="btn btn-sm"
                  onClick={() => void mudarCargo({ operaCarteira: !corretor.operaCarteira })}
                  title="Um admin que só opera o sistema não vê as telas de corretor — elas abririam vazias."
                >
                  {corretor.operaCarteira ? "Deixar só operação" : "Devolver o painel do corretor"}
                </button>
              )}
            </div>
            <div className="field-hint">
              {corretor.ehAdmin
                ? corretor.operaCarteira
                  ? "Administrador com carteira própria: vê o painel do corretor e a Administração."
                  : "Só operação: vê apenas a Administração. As telas de corretor abririam em branco nesta conta."
                : "Corretor. Vê o painel de angariação e nada da operação do sistema."}
            </div>
          </div>

          <div className="field-group">
            <label>Conta</label>
            <div className="field-hint">
              Último acesso: {dia(corretor.ultimoAcesso)}
              <br />
              Google Agenda: {corretor.googleConectado ? "conectado" : "não conectado"}
              <br />
              Tokens no mês: {corretor.gasto.tokensEntrada.toLocaleString("pt-BR")} entrada /{" "}
              {corretor.gasto.tokensSaida.toLocaleString("pt-BR")} saída
              {/* Só aparece quando houve cache. Zerado, seria uma linha
                  a mais dizendo nada — e o cache é a exceção, não a
                  regra: a OpenAI só cacheia prompt longo que se repete. */}
              {corretor.gasto.tokensEntradaCache > 0 && (
                <>
                  <br />
                  Desses, {corretor.gasto.tokensEntradaCache.toLocaleString("pt-BR")} vieram do cache
                  (cobrados 10× menos)
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
