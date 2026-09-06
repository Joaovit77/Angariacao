"use client";

import { useRef, useState } from "react";
import { useSessao } from "@/components/SessaoProvider";
import {
  aplicarPreferenciaSupervisionada,
  type CampoPreferenciaSupervisionada,
} from "@/lib/ensinarIa";
import {
  confirmarPreferenciaSupervisionada,
  confirmarRegraSupervisionada,
} from "@/lib/ensinarIaAcoes";
import { salvarConfig, salvarProtocolo, uid } from "@/lib/mutacoes";
import type { TipoProtocolo } from "@/lib/protocolos";
import { useAppStore } from "@/lib/store";

type DestinoEnsino = "preferencia" | "protocolo" | null;

const ROTULOS_VALORES = {
  natural: "Natural",
  profissional: "Profissional",
  informal: "Informal",
  consultivo: "Consultivo",
  curto: "Curto",
  medio: "Médio",
  nenhum: "Nenhum",
  poucos: "Poucos",
  moderados: "Moderados",
  voce: "Você",
  "senhor-senhora": "Senhor/Senhora",
  automatico: "Automático",
} as const;

const OPCOES_PREFERENCIA: Array<{
  campo: CampoPreferenciaSupervisionada;
  rotulo: string;
  valores?: readonly (keyof typeof ROTULOS_VALORES)[];
  placeholder?: string;
}> = [
  { campo: "tamanho", rotulo: "Tamanho das respostas", valores: ["curto", "medio"] },
  { campo: "emojis", rotulo: "Uso de emojis", valores: ["nenhum", "poucos", "moderados"] },
  {
    campo: "formalidade",
    rotulo: "Tom da escrita",
    valores: ["natural", "profissional", "informal", "consultivo"],
  },
  {
    campo: "tratamento",
    rotulo: "Forma de tratamento",
    valores: ["voce", "senhor-senhora", "automatico"],
  },
  {
    campo: "expressao-preferida",
    rotulo: "Expressão que gosto de usar",
    placeholder: "Ex.: Perfeito!",
  },
  {
    campo: "expressao-evitar",
    rotulo: "Expressão que quero evitar",
    placeholder: "Ex.: Coloco-me à disposição",
  },
];

export default function EnsinarIa({ aoConcluir }: { aoConcluir: () => void }) {
  const { usuario } = useSessao();
  const config = useAppStore((estado) => estado.config);
  const envioEmCurso = useRef(false);
  const [destino, setDestino] = useState<DestinoEnsino>(null);
  const [campoPreferencia, setCampoPreferencia] =
    useState<CampoPreferenciaSupervisionada | "">("");
  const [valorPreferencia, setValorPreferencia] = useState("");
  const [tipoProtocolo, setTipoProtocolo] = useState<TipoProtocolo | "">("");
  const [tituloProtocolo, setTituloProtocolo] = useState("");
  const [conteudoProtocolo, setConteudoProtocolo] = useState("");
  const [escopoConfirmado, setEscopoConfirmado] = useState(false);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState("");
  const [protocoloId] = useState(() => uid());

  const opcaoPreferencia = OPCOES_PREFERENCIA.find(
    (opcao) => opcao.campo === campoPreferencia,
  );
  const perfilAtualizado = campoPreferencia
    ? aplicarPreferenciaSupervisionada(config.perfilComunicacao, {
        campo: campoPreferencia,
        valor: valorPreferencia,
      })
    : null;
  const preferenciaAlterada =
    perfilAtualizado !== null &&
    JSON.stringify(perfilAtualizado) !== JSON.stringify(config.perfilComunicacao);

  function escolherDestino(novoDestino: Exclude<DestinoEnsino, null>) {
    setDestino(novoDestino);
    setErro("");
  }

  function voltar() {
    setDestino(null);
    setErro("");
  }

  async function confirmarPreferencia() {
    if (
      !usuario ||
      !campoPreferencia ||
      !perfilAtualizado ||
      !preferenciaAlterada ||
      envioEmCurso.current
    ) return;
    envioEmCurso.current = true;
    setSalvando(true);
    setErro("");
    const ok = await confirmarPreferenciaSupervisionada(
      {
        config,
        userId: usuario.id,
        preferencia: { campo: campoPreferencia, valor: valorPreferencia },
      },
      salvarConfig,
    );
    envioEmCurso.current = false;
    setSalvando(false);
    if (!ok) {
      setErro("A preferência não foi salva. Revise e tente novamente.");
      return;
    }
    aoConcluir();
  }

  async function confirmarProtocolo() {
    if (
      !usuario ||
      !tipoProtocolo ||
      !tituloProtocolo.trim() ||
      !conteudoProtocolo.trim() ||
      !escopoConfirmado ||
      envioEmCurso.current
    ) return;
    envioEmCurso.current = true;
    setSalvando(true);
    setErro("");
    const ok = await confirmarRegraSupervisionada(
      {
        id: protocoloId,
        userId: usuario.id,
        tipo: tipoProtocolo,
        titulo: tituloProtocolo,
        conteudo: conteudoProtocolo,
        escopoConfirmado,
      },
      salvarProtocolo,
    );
    envioEmCurso.current = false;
    setSalvando(false);
    if (!ok) {
      setErro("A regra não foi salva. Revise e tente novamente.");
      return;
    }
    aoConcluir();
  }

  return (
    <section className="ensinar-ia" aria-label="Ensinar a IA com confirmação humana">
      <div className="ensinar-ia-cabecalho">
        <strong>Deseja ensinar algo à IA com esta correção?</strong>
        <p>
          Só salve o que deve valer em atendimentos futuros. Dados deste imóvel, proprietário,
          negociação, Agenda ou Pipeline ficam somente nesta conversa.
        </p>
      </div>

      {destino === null ? (
        <div className="ensinar-ia-destinos">
          <button type="button" onClick={aoConcluir} disabled={salvando}>
            <strong>Só nesta mensagem</strong>
            <span>Não cria preferência nem protocolo.</span>
          </button>
          <button type="button" onClick={() => escolherDestino("preferencia")} disabled={salvando}>
            <strong>Preferência de escrita</strong>
            <span>Ajusta o perfil usado em respostas futuras.</span>
          </button>
          <button type="button" onClick={() => escolherDestino("protocolo")} disabled={salvando}>
            <strong>Regra da imobiliária</strong>
            <span>Cria um protocolo revisado para atendimentos futuros.</span>
          </button>
        </div>
      ) : null}

      {destino === "preferencia" ? (
        <div className="ensinar-ia-formulario">
          <div className="ensinar-ia-aviso">
            Escolha exatamente o ajuste. O sistema não interpreta sua edição nem tenta descobrir
            uma preferência automaticamente.
          </div>
          <label>
            Preferência que será aplicada
            <select
              value={campoPreferencia}
              onChange={(evento) => {
                setCampoPreferencia(evento.target.value as CampoPreferenciaSupervisionada | "");
                setValorPreferencia("");
                setErro("");
              }}
              disabled={salvando}
            >
              <option value="">Escolha o que deseja ajustar</option>
              {OPCOES_PREFERENCIA.map((opcao) => (
                <option key={opcao.campo} value={opcao.campo}>{opcao.rotulo}</option>
              ))}
            </select>
          </label>
          {opcaoPreferencia?.valores ? (
            <label>
              Novo valor
              <select
                value={valorPreferencia}
                onChange={(evento) => setValorPreferencia(evento.target.value)}
                disabled={salvando}
              >
                <option value="">Escolha o valor que será salvo</option>
                {opcaoPreferencia.valores.map((valor) => (
                  <option key={valor} value={valor}>{ROTULOS_VALORES[valor]}</option>
                ))}
              </select>
            </label>
          ) : opcaoPreferencia ? (
            <label>
              Texto exato
              <input
                type="text"
                value={valorPreferencia}
                onChange={(evento) => setValorPreferencia(evento.target.value)}
                placeholder={opcaoPreferencia.placeholder}
                maxLength={80}
                disabled={salvando}
              />
            </label>
          ) : null}
          <p className="ensinar-ia-ajuda">
            Você poderá editar novamente em Configurações → IA e escrita.
          </p>
          {erro ? <p className="ensinar-ia-erro" role="alert">{erro}</p> : null}
          <div className="ensinar-ia-acoes">
            <button type="button" className="btn btn-sm" onClick={voltar} disabled={salvando}>
              Cancelar
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => void confirmarPreferencia()}
              disabled={!preferenciaAlterada || salvando}
            >
              {salvando ? "Salvando…" : "Salvar preferência"}
            </button>
          </div>
        </div>
      ) : null}

      {destino === "protocolo" ? (
        <div className="ensinar-ia-formulario">
          <div className="ensinar-ia-aviso importante">
            Não registre endereço, valor de imóvel, nome, telefone, proposta, exceção, condição de
            uma negociação ou informação temporária. Não use este fluxo para cadastrar lei, norma,
            regra do CRECI/COFECI ou orientação jurídica.
          </div>
          <fieldset>
            <legend>Categoria do protocolo</legend>
            <label className="ensinar-ia-radio">
              <input
                type="radio"
                name={`tipo-protocolo-${protocoloId}`}
                checked={tipoProtocolo === "informacao_comercial"}
                onChange={() => setTipoProtocolo("informacao_comercial")}
                disabled={salvando}
              />
              <span><strong>Informação comercial</strong> — taxa, serviço ou condição oficial da imobiliária.</span>
            </label>
            <label className="ensinar-ia-radio">
              <input
                type="radio"
                name={`tipo-protocolo-${protocoloId}`}
                checked={tipoProtocolo === "regra_conduta"}
                onChange={() => setTipoProtocolo("regra_conduta")}
                disabled={salvando}
              />
              <span><strong>Regra de conduta</strong> — como a IA deve agir em uma situação futura.</span>
            </label>
          </fieldset>
          <label>
            Assunto
            <input
              type="text"
              value={tituloProtocolo}
              onChange={(evento) => setTituloProtocolo(evento.target.value)}
              placeholder="Ex.: Exclusividade"
              disabled={salvando}
            />
          </label>
          <label>
            Regra da imobiliária
            <textarea
              value={conteudoProtocolo}
              onChange={(evento) => setConteudoProtocolo(evento.target.value)}
              placeholder="Escreva somente a regra geral que foi confirmada pela imobiliária."
              disabled={salvando}
            />
          </label>
          <p className="ensinar-ia-ajuda">
            Esta regra poderá ser utilizada em atendimentos futuros. Você poderá editar, arquivar ou
            excluir o conteúdo na página Protocolos.
          </p>
          <label className="ensinar-ia-confirmacao">
            <input
              type="checkbox"
              checked={escopoConfirmado}
              onChange={(evento) => setEscopoConfirmado(evento.target.checked)}
              disabled={salvando}
            />
            <span>
              Confirmo que o texto acima é uma regra geral da imobiliária, não um dado específico
              deste atendimento nem uma afirmação legal ou regulatória.
            </span>
          </label>
          {erro ? <p className="ensinar-ia-erro" role="alert">{erro}</p> : null}
          <div className="ensinar-ia-acoes">
            <button type="button" className="btn btn-sm" onClick={voltar} disabled={salvando}>
              Cancelar
            </button>
            <button
              type="button"
              className="btn btn-primary btn-sm"
              onClick={() => void confirmarProtocolo()}
              disabled={
                !tipoProtocolo ||
                !tituloProtocolo.trim() ||
                !conteudoProtocolo.trim() ||
                !escopoConfirmado ||
                salvando
              }
            >
              {salvando ? "Salvando…" : "Confirmar regra"}
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
