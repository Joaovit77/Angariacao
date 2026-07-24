"use client";

/* ================================================================
   MODAL: DESDOBRAR IMÓVEL EM UNIDADES
   O galpão captado que o proprietário aceita dividir em salas
   comerciais: uma conversa ganha, várias linhas na carteira.

   A tela inteira é construída em cima de uma frase, e ela está no
   rodapé para o corretor ler antes de confirmar: as unidades entram
   na carteira, não na contagem de angariações. Sem isso a feature
   viraria um multiplicador de meta — cadastrar quatro salas fecharia
   o mês sem nenhuma conversa nova.

   Por que só depois de angariado (e a recusa vem do núcleo, em
   calculo/desdobramento.ts): antes disso as unidades seriam imóveis
   que talvez nunca existam, e imóvel que não existe não fica quieto —
   entra no pipeline, dispara "parado" e enche a fila do follow-up.
   ================================================================ */
import { useState } from "react";
import { useSessao } from "@/components/SessaoProvider";
import { TIPOS_IMOVEL } from "@/lib/constantes";
import { sugerirCodigoImovel } from "@/lib/codigoImovel";
import {
  type EspecificacaoUnidade,
  MAX_UNIDADES_DESDOBRAMENTO,
  motivoNaoPodeDesdobrar,
  statusDaUnidade,
} from "@/lib/calculo/desdobramento";
import { imoveisDuplicados } from "@/lib/calculo/duplicidade";
import { desdobrarImovel, numOrNull } from "@/lib/mutacoes";
import { useAppStore } from "@/lib/store";
import { useUiModal } from "@/lib/uiModal";
import type { Imovel } from "@/lib/tipos";

interface Linha {
  /** Chave estável de render — o índice mudaria ao remover uma linha do meio,
      e o React remontaria os inputs seguintes perdendo o foco. */
  key: string;
  unidade: string;
  tipo: string;
  codigo: string;
  valorAluguel: string;
  valorCondominio: string;
}

/** Uma linha nova, já com o próximo código sugerido — contando as linhas que
    ainda nem foram salvas, senão as quatro unidades sairiam com o mesmo código. */
function linhaNova(imoveis: Imovel[], linhas: Linha[], principal: Imovel): Linha {
  const jaUsados = linhas.map((l) => ({ codigo: l.codigo }));
  return {
    key: crypto.randomUUID(),
    unidade: "",
    tipo: principal.tipo || "Sala Comercial",
    codigo: sugerirCodigoImovel([...imoveis, ...jaUsados]),
    valorAluguel: "",
    valorCondominio: "",
  };
}

export default function ModalDesdobrar({ imovelId }: { imovelId: string }) {
  const fecharModal = useUiModal((s) => s.fecharModal);
  const { usuario } = useSessao();
  const imoveis = useAppStore((s) => s.imoveis);
  const principal = imoveis.find((i) => i.id === imovelId) || null;

  const [linhas, setLinhas] = useState<Linha[]>(() =>
    principal ? [linhaNova(imoveis, [], principal)] : [],
  );
  const [salvando, setSalvando] = useState(false);

  if (!principal) return null;

  const recusa = motivoNaoPodeDesdobrar(principal);

  function alterar(key: string, campo: keyof Omit<Linha, "key">, valor: string) {
    setLinhas((atual) => atual.map((l) => (l.key === key ? { ...l, [campo]: valor } : l)));
  }

  function adicionar() {
    if (!principal) return;
    setLinhas((atual) =>
      atual.length >= MAX_UNIDADES_DESDOBRAMENTO ? atual : [...atual, linhaNova(imoveis, atual, principal)],
    );
  }

  function remover(key: string) {
    setLinhas((atual) => atual.filter((l) => l.key !== key));
  }

  /** Aviso por linha: a unidade digitada já existe neste endereço? A
      identidade do imóvel é endereço + unidade + bloco, então repetir o nome
      criaria dois cadastros indistinguíveis um do outro. Avisa e bloqueia —
      ao contrário do ModalImovel, onde recadastrar às vezes é proposital;
      aqui as duas linhas nasceriam no mesmo gesto, então é sempre engano. */
  function conflito(linha: Linha): string | null {
    const nome = linha.unidade.trim();
    if (!nome) return null;
    const irma = linhas.some((l) => l.key !== linha.key && l.unidade.trim().toLowerCase() === nome.toLowerCase());
    if (irma) return "Essa unidade está repetida na lista abaixo.";
    if (!principal) return null;
    const existentes = imoveisDuplicados(
      { endereco: principal.endereco, cidade: principal.cidade, unidade: nome, bloco: principal.bloco },
      imoveis,
      null,
    );
    return existentes.length ? "Já existe um imóvel cadastrado com essa unidade neste endereço." : null;
  }

  const semNome = linhas.some((l) => !l.unidade.trim());
  const temConflito = linhas.some((l) => conflito(l) !== null);
  const podeSalvar = !recusa && linhas.length > 0 && !semNome && !temConflito;

  async function salvar() {
    if (!usuario || !principal || !podeSalvar) return;
    const specs: EspecificacaoUnidade[] = linhas.map((l) => ({
      unidade: l.unidade.trim(),
      tipo: l.tipo,
      codigo: l.codigo.trim(),
      valorAluguel: numOrNull(l.valorAluguel) || 0,
      valorCondominio: numOrNull(l.valorCondominio) || 0,
    }));
    setSalvando(true);
    // A mutação já explica a falha em toast; aqui só o fechamento depende dela.
    const ok = await desdobrarImovel(principal.id, specs, usuario.id);
    setSalvando(false);
    if (ok) fecharModal();
  }

  return (
    <>
      <div className="modal-head">
        <div className="modal-title">Desdobrar em unidades</div>
        <button type="button" className="icon-btn" onClick={fecharModal}>
          ✕
        </button>
      </div>

      <div className="modal-body">
        <p className="section-note" style={{ marginBottom: "14px" }}>
          Use quando o mesmo espaço captado for alugado em partes — o galpão que vira salas
          comerciais, a casa que vira dois pontos. Cada unidade fica com aluguel, contrato e comissão
          próprios, herdando o endereço e o proprietário de{" "}
          <strong>{principal.codigo || principal.endereco}</strong>.
        </p>

        {recusa ? (
          <p className="section-note" role="alert">
            ⚠️ {recusa}
          </p>
        ) : (
          <>
            {linhas.map((linha, i) => {
              const aviso = conflito(linha);
              return (
                <fieldset key={linha.key}>
                  <legend>Unidade {i + 1}</legend>
                  <div className="field-row-3">
                    <div className="field-group">
                      <label>Identificação da unidade</label>
                      <input
                        type="text"
                        value={linha.unidade}
                        onChange={(e) => alterar(linha.key, "unidade", e.target.value)}
                        placeholder="Ex: Sala 1"
                      />
                    </div>
                    <div className="field-group">
                      <label>Tipo do imóvel</label>
                      <select value={linha.tipo} onChange={(e) => alterar(linha.key, "tipo", e.target.value)}>
                        {TIPOS_IMOVEL.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="field-group">
                      <label>Código do imóvel</label>
                      <input
                        type="text"
                        value={linha.codigo}
                        onChange={(e) => alterar(linha.key, "codigo", e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="field-row">
                    <div className="field-group">
                      <label>Valor do aluguel (R$)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={linha.valorAluguel}
                        onChange={(e) => alterar(linha.key, "valorAluguel", e.target.value)}
                      />
                    </div>
                    <div className="field-group">
                      <label>Valor do condomínio (R$)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={linha.valorCondominio}
                        onChange={(e) => alterar(linha.key, "valorCondominio", e.target.value)}
                      />
                    </div>
                  </div>
                  {aviso && (
                    <div className="field-hint" style={{ color: "var(--danger, #d64545)", fontWeight: 600 }}>
                      ⚠️ {aviso}
                    </div>
                  )}
                  {linhas.length > 1 && (
                    <button type="button" className="btn btn-sm btn-ghost btn-danger" onClick={() => remover(linha.key)}>
                      Remover unidade {i + 1}
                    </button>
                  )}
                </fieldset>
              );
            })}

            <button
              type="button"
              className="btn btn-sm"
              onClick={adicionar}
              disabled={linhas.length >= MAX_UNIDADES_DESDOBRAMENTO}
            >
              + Adicionar unidade
            </button>
            {linhas.length >= MAX_UNIDADES_DESDOBRAMENTO && (
              <div className="field-hint">
                Máximo de {MAX_UNIDADES_DESDOBRAMENTO} unidades por vez. Acima disso é um prédio, e aí
                cada imóvel tem a captação do seu proprietário.
              </div>
            )}

            <p className="section-note" style={{ marginTop: "16px" }}>
              As unidades nascem em <strong>{statusDaUnidade(principal)}</strong> e entram na sua
              carteira, no mapa e nos relatórios de locação e comissão. O que elas <strong>não</strong>{" "}
              fazem é contar como angariações novas: a captação foi uma só, e é a do imóvel principal.
              O histórico de tentativas e as notas também continuam lá.
            </p>
          </>
        )}
      </div>

      <div className="modal-foot">
        <div></div>
        <div style={{ display: "flex", gap: "10px" }}>
          <button type="button" className="btn" onClick={fecharModal}>
            Cancelar
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={salvar}
            disabled={!podeSalvar || salvando}
          >
            {salvando
              ? "Criando..."
              : linhas.length === 1
                ? "Criar 1 unidade"
                : `Criar ${linhas.length} unidades`}
          </button>
        </div>
      </div>
    </>
  );
}
