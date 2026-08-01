"use client";

/* ================================================================
   VIEW: ADMINISTRAÇÃO (super admin)

   As três perguntas de quem OPERA o sistema, nesta ordem, porque é a
   ordem em que elas custam dinheiro: quem está travado, quanto cada um
   está consumindo, e o que quebrou.

   A lista abre por QUEM PRECISA DE VOCÊ (ver `ordenarCorretores`), não
   por volume nem por ordem de cadastro. Ordenar por qualquer outra
   coisa faz a maioria — que está bem — enterrar as duas linhas que
   pedem ação, e é assim que uma tela de operação deixa de ser aberta.

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
import { fmtUsd, type GastoIa } from "@/lib/calculo/custoIa";
import {
  carregarLogs,
  carregarPainelAdmin,
  definirIa,
  salvarInstancia,
  type PainelAdmin,
} from "@/lib/admin";
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

/** Data curta a partir de um timestamp ISO do banco. */
function dia(iso: string | null): string {
  if (!iso) return "—";
  return fmtDate(iso.slice(0, 10)) || "—";
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
  const [corretores, setCorretores] = useState<CorretorAdmin[]>([]);
  const [orfao, setOrfao] = useState<GastoIa | null>(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState<string | null>(null);
  const [aberto, setAberto] = useState<string | null>(null);

  const [eventos, setEventos] = useState<EventoLog[]>([]);
  const [nivelLog, setNivelLog] = useState<string>("erro");
  const [carregandoLog, setCarregandoLog] = useState(true);

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

  const linhas = useMemo(() => ordenarCorretores(corretores, hoje), [corretores, hoje]);
  const totais = useMemo(() => totaisDoPainel(corretores, hoje), [corretores, hoje]);

  // O gasto de contas removidas não pertence a ninguém da lista, mas saiu
  // da fatura — sem ele o total do painel não bate com a da OpenAI.
  const custoTotal = totais.custoUsd + (orfao?.custoUsd || 0);

  async function alternarIa(c: CorretorAdmin) {
    const r = await definirIa(c.id, !c.iaLiberada);
    if (!r.ok) {
      toast(r.mensagem || "Não foi possível alterar.", "error");
      return;
    }
    toast(c.iaLiberada ? "IA revogada." : "IA liberada.", "success");
    recarregar();
  }

  return (
    <>
      <div className="page-head">
        <div>
          <h1 className="page-title">Administração</h1>
          <p className="page-sub">Contas, consumo de IA e o que quebrou — em todo o sistema</p>
        </div>
        <button
          type="button"
          className="btn"
          onClick={() => {
            setCarregando(true);
            recarregar();
          }}
          disabled={carregando}
        >
          {carregando ? "Atualizando…" : "Atualizar"}
        </button>
      </div>

      {erro && (
        <div className="card" style={{ borderColor: "var(--bad)", marginBottom: 16 }}>
          <div style={{ color: "var(--bad)" }}>{erro}</div>
        </div>
      )}

      <div className="grid grid-4" style={{ marginBottom: 16 }}>
        <div className="card kpi-card">
          <div className="kpi-label">Corretores</div>
          <div className="kpi-value">{totais.corretores}</div>
        </div>
        <div className="card kpi-card">
          <div className="kpi-label">Travados</div>
          <div className="kpi-value" style={{ color: totais.bloqueados ? "var(--bad)" : undefined }}>
            {totais.bloqueados}
          </div>
          <div className="kpi-delta flat">sem número de WhatsApp</div>
        </div>
        <div className="card kpi-card">
          <div className="kpi-label">Em atenção</div>
          <div className="kpi-value" style={{ color: totais.emAtencao ? "var(--warn)" : undefined }}>
            {totais.emAtencao}
          </div>
        </div>
        <div className="card kpi-card">
          <div className="kpi-label">IA no mês</div>
          <div className="kpi-value">{fmtUsd(custoTotal)}</div>
          <div className="kpi-delta flat">{totais.chamadas} chamadas</div>
        </div>
      </div>

      {/* O aviso que impede a tabela de preços de envelhecer em silêncio.
          Sem ele, o painel continuaria somando com valores de meses atrás
          e a diferença só apareceria na fatura. */}
      {totais.precoNaoConferido && (
        <div className="card" style={{ borderColor: "var(--warn)", marginBottom: 16 }}>
          <div style={{ fontSize: 13 }}>
            <strong style={{ color: "var(--warn)" }}>Preços não conferidos.</strong> Os valores acima
            usam a tabela de <code>web/lib/calculo/custoIa.ts</code>, que ainda não foi verificada
            contra <em>platform.openai.com/docs/pricing</em>. Os tokens são reais; o custo em dólar é
            uma estimativa até alguém conferir e preencher o <code>conferidoEm</code>.
          </div>
        </div>
      )}

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-title">Corretores</div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th style={{ textAlign: "left" }}>Conta</th>
                <th style={{ textAlign: "left" }}>Situação</th>
                <th style={{ textAlign: "right" }}>Imóveis</th>
                <th style={{ textAlign: "right" }}>Envios 30d</th>
                <th style={{ textAlign: "right" }}>Respostas 30d</th>
                <th style={{ textAlign: "right" }}>IA no mês</th>
                <th style={{ textAlign: "left" }}>WhatsApp</th>
                <th style={{ textAlign: "left" }}>IA</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {linhas.map(({ corretor: c, saude }) => (
                <tr key={c.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{c.nome || c.email}</div>
                    <div style={{ fontSize: 11, color: "var(--text-faint)" }}>
                      {c.nome ? `${c.email} · ` : ""}desde {dia(c.criadoEm)}
                    </div>
                  </td>
                  <td>
                    <span className="badge" style={{ color: CORES[saude.nivel] }}>
                      {ROTULO_NIVEL[saude.nivel]}
                    </span>
                    <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 4 }}>
                      {saude.motivo}
                    </div>
                  </td>
                  <td style={{ textAlign: "right" }}>{c.imoveis}</td>
                  <td style={{ textAlign: "right" }}>{c.tentativas30d}</td>
                  <td style={{ textAlign: "right" }}>{c.respostas30d}</td>
                  <td style={{ textAlign: "right" }}>
                    {fmtUsd(c.gasto.custoUsd)}
                    {c.gasto.chamadasSemPreco > 0 && (
                      <div style={{ fontSize: 11, color: "var(--warn)" }}>
                        +{c.gasto.chamadasSemPreco} sem preço
                      </div>
                    )}
                  </td>
                  <td style={{ fontSize: 12 }}>
                    {c.instancia || <span style={{ color: "var(--bad)" }}>não cadastrado</span>}
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
              ))}
              {linhas.length === 0 && !carregando && (
                <tr>
                  <td colSpan={9} style={{ color: "var(--text-faint)", padding: "18px 0" }}>
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
          aoSalvar={() => recarregar()}
        />
      )}

      <div className="card">
        <div
          className="card-title"
          style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}
        >
          <span>O que aconteceu</span>
          <select
            value={nivelLog}
            onChange={(e) => setNivelLog(e.target.value)}
            style={{ fontSize: 12, padding: "4px 8px" }}
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
                <th style={{ textAlign: "left" }}>Quando</th>
                <th style={{ textAlign: "left" }}>Conta</th>
                <th style={{ textAlign: "left" }}>O quê</th>
                <th style={{ textAlign: "left" }}>Detalhe</th>
              </tr>
            </thead>
            <tbody>
              {eventos.map((e) => (
                <tr key={e.id}>
                  <td style={{ whiteSpace: "nowrap", fontSize: 12 }}>
                    {e.criadoEm.slice(0, 16).replace("T", " ")}
                  </td>
                  <td style={{ fontSize: 12 }}>
                    {corretores.find((c) => c.id === e.userId)?.email || (
                      <span style={{ color: "var(--text-faint)" }}>—</span>
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
                  <td style={{ fontSize: 12, color: "var(--text-dim)" }}>
                    {comNomes(e.detalhe, corretores)}
                  </td>
                </tr>
              ))}
              {eventos.length === 0 && !carregandoLog && (
                <tr>
                  <td colSpan={4} style={{ color: "var(--text-faint)", padding: "18px 0" }}>
                    Nada registrado neste filtro.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

/* ----------------------------------------------------------------
   O detalhe de um corretor: onde se cadastra o número (a ação que
   destrava a conta) e onde se vê o gasto quebrado por tipo.
   ---------------------------------------------------------------- */
function Detalhe({ corretor, aoSalvar }: { corretor: CorretorAdmin; aoSalvar: () => void }) {
  const [instancia, setInstancia] = useState(corretor.instancia || "");
  const [token, setToken] = useState("");
  const [salvando, setSalvando] = useState(false);

  // Quem garante que reabrir para OUTRO corretor não herda o que estava
  // digitado aqui é o `key` no elemento, lá em cima — ver o comentário
  // dele. Este componente não precisa (e não deve) tentar resolver isso
  // sozinho com um efeito de sincronia.

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

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-title">{corretor.nome || corretor.email}</div>

      <div className="grid grid-2" style={{ alignItems: "start" }}>
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
        </div>

        <div>
          <div className="field-group">
            <label>Consumo de IA no mês</label>
            {corretor.gasto.chamadas === 0 ? (
              <div className="field-hint">Nenhuma chamada neste período.</div>
            ) : (
              <table>
                <tbody>
                  {corretor.gasto.porTipo.map((t) => (
                    <tr key={t.tipo}>
                      <td>{t.tipo}</td>
                      <td style={{ textAlign: "right", color: "var(--text-dim)" }}>{t.chamadas}×</td>
                      <td style={{ textAlign: "right" }}>{fmtUsd(t.custoUsd)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {corretor.gasto.modelosSemPreco.length > 0 && (
              <div className="field-hint" style={{ color: "var(--warn)" }}>
                Sem preço cadastrado: {corretor.gasto.modelosSemPreco.join(", ")} — acrescente em{" "}
                <code>lib/calculo/custoIa.ts</code>.
              </div>
            )}
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
