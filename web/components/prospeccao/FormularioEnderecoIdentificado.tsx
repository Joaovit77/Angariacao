"use client";

/* Endereço de um imóvel já identificado.

   Quem sai com pressa registra a foto e deixa o endereço para depois (ou
   o manda pelo WhatsApp). Este formulário fecha essa lacuna: informa ou
   corrige só o endereço, pelo grant de update que a V7 já concede. Nada
   além disso muda — as passagens, a localização (que vem das passagens),
   o tipo e o histórico ficam como estão. Ao salvar, as chaves de
   deduplicação são recalculadas e a tela volta a conferir se este local
   já foi registrado antes. */
import { useEffect, useRef, useState } from "react";

import { useSessao } from "@/components/SessaoProvider";
import EnderecoAutocompleteViaCep, {
  type EnderecoViaCepSelecionado,
} from "@/components/formularios/EnderecoAutocompleteViaCep";
import { separarNumeroDoEndereco } from "@/lib/calculo/enderecoViaCep";
import { aplicarCidadePadraoInicial } from "@/lib/configuracaoUsuario";
import { maskCEP } from "@/lib/geo";
import type { DadosEnderecoIdentificado, ImovelIdentificado } from "@/lib/prospeccao";
import { useProspeccao } from "@/lib/useProspeccao";
import { useCidadePadraoDaConta } from "@/lib/useCidadePadraoDaConta";

import styles from "./Prospeccao.module.css";

export const EXPLICACAO_ENDERECO =
  "O endereço identifica o imóvel e permite conferir se este local já foi registrado. As passagens, a localização e o tipo não mudam.";

type CamposEndereco = { [campo in keyof DadosEnderecoIdentificado]-?: string };

function camposDoIdentificado(
  identificado: Pick<ImovelIdentificado, keyof DadosEnderecoIdentificado>,
): CamposEndereco {
  return {
    logradouro: identificado.logradouro ?? "",
    numero: identificado.numero ?? "",
    unidade: identificado.unidade ?? "",
    bloco: identificado.bloco ?? "",
    edificio: identificado.edificio ?? "",
    bairro: identificado.bairro ?? "",
    cidade: identificado.cidade ?? "",
    estado: identificado.estado ?? "",
    cep: identificado.cep ?? "",
    pontoReferencia: identificado.pontoReferencia ?? "",
  };
}

/** Muda só quando o endereço gravado muda: é a `key` do formulário, para
    o que você está digitando sobreviver a outras ações do painel. */
export function chaveFormularioEndereco(
  identificado: Pick<ImovelIdentificado, "id" | keyof DadosEnderecoIdentificado>,
): string {
  return [identificado.id, ...Object.values(camposDoIdentificado(identificado))].join("|");
}

/** Só endereço com rua ou ponto de referência identifica alguma coisa;
    o resto sozinho (cidade, CEP) não dá nome ao lugar. */
export function enderecoIdentificaOLugar(campos: Pick<CamposEndereco, "logradouro" | "pontoReferencia">): boolean {
  return Boolean(campos.logradouro.trim() || campos.pontoReferencia.trim());
}

export default function FormularioEnderecoIdentificado({
  identificado,
  aoCancelar,
}: {
  identificado: Pick<ImovelIdentificado, "id" | keyof DadosEnderecoIdentificado>;
  /** Presente quando o formulário foi aberto por um botão e pode ser fechado sem salvar. */
  aoCancelar?: () => void;
}) {
  const { usuario } = useSessao();
  const cidadePadrao = useCidadePadraoDaConta(usuario?.id);
  const inicial = camposDoIdentificado(identificado);
  const [campos, setCampos] = useState<CamposEndereco>(inicial);
  const cidadeEstadoProtegidos = useRef(false);
  const definirEndereco = useProspeccao((estado) => estado.definirEndereco);
  const salvando = useProspeccao((estado) => estado.salvando);
  const alterado = (Object.keys(campos) as (keyof CamposEndereco)[])
    .some((campo) => campos[campo].trim() !== inicial[campo].trim());
  const podeSalvar = alterado && enderecoIdentificaOLugar(campos) && !salvando;
  // Já aberto quando algum detalhe foi gravado antes: o que existe não se esconde.
  const temDetalhes = Boolean(
    inicial.bairro || inicial.cep || inicial.pontoReferencia || inicial.unidade || inicial.bloco || inicial.edificio,
  );

  useEffect(() => {
    setCampos((atual) => aplicarCidadePadraoInicial(
      atual,
      cidadePadrao,
      cidadeEstadoProtegidos.current,
    ));
  }, [cidadePadrao]);

  function definir(campo: keyof CamposEndereco) {
    return (valor: string) => {
      if (campo === "cidade" || campo === "estado") cidadeEstadoProtegidos.current = true;
      setCampos((atual) => ({ ...atual, [campo]: valor }));
    };
  }

  /** A sugestão completa detalhes vazios; cidade e UF acompanham o endereço selecionado. */
  function aplicarEnderecoViaCep(selecionado: EnderecoViaCepSelecionado) {
    if (selecionado.cidade || selecionado.estado) cidadeEstadoProtegidos.current = true;
    const { rua, numero } = separarNumeroDoEndereco(selecionado.endereco);
    setCampos((atual) => ({
      ...atual,
      logradouro: rua || atual.logradouro,
      numero: atual.numero.trim() || numero,
      bairro: atual.bairro.trim() || selecionado.bairro || "",
      cidade: selecionado.cidade || atual.cidade,
      estado: selecionado.estado || atual.estado,
      cep: atual.cep.trim() || (selecionado.cep ? maskCEP(selecionado.cep) : ""),
    }));
  }

  async function salvar() {
    if (!podeSalvar) return;
    await definirEndereco(identificado.id, campos);
  }

  const id = (campo: string) => `endereco-${campo}-${identificado.id}`;
  return (
    <div className={styles.formularioEndereco} data-formulario-endereco>
      <div className="field-row">
        <div className="field-group">
          <label htmlFor={id("logradouro")}>Logradouro</label>
          <EnderecoAutocompleteViaCep
            id={id("logradouro")}
            value={campos.logradouro}
            cidade={campos.cidade}
            estado={campos.estado}
            onChange={definir("logradouro")}
            onSelecionar={aplicarEnderecoViaCep}
            placeholder="Digite a rua e escolha a sugestão"
          />
        </div>
        <div className="field-group">
          <label htmlFor={id("numero")}>Número</label>
          <input id={id("numero")} type="text" value={campos.numero} onChange={(evento) => definir("numero")(evento.target.value)} />
        </div>
      </div>
      <div className="field-row">
        <div className="field-group">
          <label htmlFor={id("cidade")}>Cidade</label>
          <input id={id("cidade")} type="text" value={campos.cidade} onChange={(evento) => definir("cidade")(evento.target.value)} />
        </div>
        <div className="field-group">
          <label htmlFor={id("estado")}>Estado</label>
          <input id={id("estado")} type="text" maxLength={2} placeholder="PR" value={campos.estado} onChange={(evento) => definir("estado")(evento.target.value.toUpperCase())} />
        </div>
      </div>
      {/* O que raramente muda fica recolhido, como no cadastro. */}
      <details className={styles.maisDetalhes} open={temDetalhes}>
        <summary>Mais detalhes (opcional)</summary>
        <div className={styles.camposDetalhes}>
          <div className="field-row">
            <div className="field-group">
              <label htmlFor={id("bairro")}>Bairro</label>
              <input id={id("bairro")} type="text" value={campos.bairro} onChange={(evento) => definir("bairro")(evento.target.value)} />
            </div>
            <div className="field-group">
              <label htmlFor={id("cep")}>CEP</label>
              <input id={id("cep")} type="text" inputMode="numeric" value={campos.cep} onChange={(evento) => definir("cep")(maskCEP(evento.target.value))} />
            </div>
          </div>
          <div className="field-group">
            <label htmlFor={id("referencia")}>Ponto de referência</label>
            <input id={id("referencia")} type="text" placeholder="Ex.: ao lado do mercado" value={campos.pontoReferencia} onChange={(evento) => definir("pontoReferencia")(evento.target.value)} />
          </div>
          <div className="field-row-3">
            <div className="field-group">
              <label htmlFor={id("unidade")}>Unidade</label>
              <input id={id("unidade")} type="text" value={campos.unidade} onChange={(evento) => definir("unidade")(evento.target.value)} />
            </div>
            <div className="field-group">
              <label htmlFor={id("bloco")}>Bloco</label>
              <input id={id("bloco")} type="text" value={campos.bloco} onChange={(evento) => definir("bloco")(evento.target.value)} />
            </div>
            <div className="field-group">
              <label htmlFor={id("edificio")}>Edifício</label>
              <input id={id("edificio")} type="text" value={campos.edificio} onChange={(evento) => definir("edificio")(evento.target.value)} />
            </div>
          </div>
        </div>
      </details>
      <div className={styles.acoesFormulario}>
        <button type="button" className="btn btn-sm" disabled={!podeSalvar} onClick={() => void salvar()}>
          {salvando ? "Salvando…" : "Salvar endereço"}
        </button>
        {aoCancelar ? (
          <button type="button" className="btn btn-sm btn-ghost" disabled={salvando} onClick={aoCancelar}>
            Cancelar
          </button>
        ) : null}
      </div>
      <small className={styles.explicacao}>{EXPLICACAO_ENDERECO}</small>
    </div>
  );
}
