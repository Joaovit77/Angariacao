/* ================================================================
   IDADE DO ANÚNCIO — anúncio velho vale o garimpo? (parte pura)
   Feature nova da pós-migração (sem oráculo do app antigo).

   Nasceu do maior balde de perdas da carteira. Em 28/07/2026, de 50
   encerramentos, **30 eram "chegamos tarde"**: 13 "já alugado por conta
   própria", 11 "optou por outra imobiliária", 6 "já vendido".

   A explicação óbvia seria lentidão do corretor — e ela foi medida e
   DESCARTADA: a mediana entre cadastrar o lead e mandar a primeira
   mensagem é 0 dia (90 de 122 no mesmo dia). Ele não é lento depois de
   achar o anúncio. O atraso está em ACHAR: o anúncio já era velho
   quando entrou no radar, e o proprietário já havia resolvido a vida.

   Essa variável não existia em lugar nenhum — `dataAngariacao` é a data
   do CADASTRO, não a da publicação. Agora ela é capturada no
   pré-cadastro (a IA lê "publicado há 3 dias" do texto colado, sem
   digitação a mais) e congelada em `anuncioIdadeDias`.

   A pergunta que isto responde, e que hoje não tem resposta: **a partir
   de quantos dias de anúncio o garimpo deixa de compensar?** Se os de
   0–3 dias convertem em 8% e os de 30+ em 1%, a manhã do corretor muda.

   Duas ressalvas que o cálculo NÃO corrige e quem usar precisa saber:

   - **Comparar dentro do MESMO canal.** O viés documentado em
     calculo/canais.ts (uns canais cadastram antes do contato, outros
     depois) continua valendo aqui. A idade é propriedade do LEAD, então
     não sofre o viés de denominador — mas misturar canais mistura duas
     populações diferentes de qualquer jeito.
   - **Amostra pequena mente.** Abaixo de MIN_AMOSTRA_FAIXA a faixa é
     marcada e não deve sustentar decisão nenhuma. Uma faixa com 3
     imóveis e 1 angariado exibe "33%", que é ruído com cara de número.

   Puro: só tipos e o motor. Sem React/Next/Supabase/store.
   ================================================================ */
import type { Imovel } from "../tipos";
import { ehPerdaDecidida, foiAngariado, imoveisDeCaptacao } from "./motor";

/** Abaixo disto a faixa é indício, nunca conclusão — mesma disciplina do
    MIN_TENTATIVAS do ranking de abordagens. */
export const MIN_AMOSTRA_FAIXA = 8;

/** As faixas, em dias de anúncio no momento do garimpo. Os cortes seguem o
    ritmo real do mercado de locação: a primeira semana é onde o proprietário
    ainda está decidindo; depois de um mês, quem ia resolver já resolveu. */
export const FAIXAS_IDADE = [
  { id: "0-3", rotulo: "Até 3 dias", min: 0, max: 3 },
  { id: "4-7", rotulo: "4 a 7 dias", min: 4, max: 7 },
  { id: "8-30", rotulo: "8 a 30 dias", min: 8, max: 30 },
  { id: "31+", rotulo: "Mais de 30 dias", min: 31, max: Infinity },
] as const;

export interface FaixaIdadeAnuncio {
  id: string;
  rotulo: string;
  /** Imóveis com DESFECHO nesta faixa (angariados + encerrados sem angariar).
      Quem está em aberto fica fora — mesma forma de `conversaoCaptacao`, senão
      a taxa despencaria a cada dia de prospecção bem-feita. */
  decididos: number;
  angariados: number;
  /** Ainda em disputa: fora da taxa, mas exibido para a faixa não parecer vazia. */
  emAberto: number;
  /** angariados ÷ decididos × 100; null quando nada foi decidido ainda. */
  taxa: number | null;
  /** false = indício, não conclusão (ver MIN_AMOSTRA_FAIXA). */
  amostraSuficiente: boolean;
}

export interface AnaliseIdadeAnuncio {
  faixas: FaixaIdadeAnuncio[];
  /** Imóveis de captação que têm a idade registrada. */
  comIdade: number;
  /** Os que não têm — todo o histórico anterior à coleta. Exibido para o
      corretor saber de que universo a análise fala. */
  semIdade: number;
}

function faixaDe(dias: number): (typeof FAIXAS_IDADE)[number] | null {
  return FAIXAS_IDADE.find((f) => dias >= f.min && dias <= f.max) ?? null;
}

/**
 * Conversão de captação por faixa de idade do anúncio.
 *
 * Só olha imóveis de CAPTAÇÃO (unidade desdobrada não é captação nova) e só os
 * que têm `anuncioIdadeDias` — o resto do histórico não tem como entrar, e
 * fingir que tem idade 0 inventaria a resposta que a análise deveria descobrir.
 */
export function analisarIdadeAnuncio(imoveis: Imovel[]): AnaliseIdadeAnuncio {
  const acc = new Map<string, { decididos: number; angariados: number; emAberto: number }>();
  for (const f of FAIXAS_IDADE) acc.set(f.id, { decididos: 0, angariados: 0, emAberto: 0 });

  let comIdade = 0;
  let semIdade = 0;

  for (const imovel of imoveisDeCaptacao(imoveis)) {
    const dias = imovel.anuncioIdadeDias;
    if (dias == null || dias < 0) {
      semIdade++;
      continue;
    }
    comIdade++;

    const faixa = faixaDe(dias);
    if (!faixa) continue;
    const a = acc.get(faixa.id)!;

    // Mesma regra do motor: "Locado" conta como captação ganha mesmo sem a
    // etapa no histórico — não se aluga o que não se captou.
    const ganhou = foiAngariado(imovel) || imovel.status === "Locado";
    // Mesma régua do motor: DECIDIDO, não apenas fechado. O silêncio que o
    // follow-up ainda trabalha é pendência e cai em `emAberto` — senão a taxa
    // de cada faixa carregaria no denominador quem ainda pode virar captação.
    const encerrado = ehPerdaDecidida(imovel);

    if (ganhou) {
      a.angariados++;
      a.decididos++;
    } else if (encerrado) {
      a.decididos++;
    } else {
      a.emAberto++;
    }
  }

  const faixas: FaixaIdadeAnuncio[] = FAIXAS_IDADE.map((f) => {
    const a = acc.get(f.id)!;
    return {
      id: f.id,
      rotulo: f.rotulo,
      decididos: a.decididos,
      angariados: a.angariados,
      emAberto: a.emAberto,
      taxa: a.decididos ? (a.angariados / a.decididos) * 100 : null,
      amostraSuficiente: a.decididos >= MIN_AMOSTRA_FAIXA,
    };
  });

  return { faixas, comIdade, semIdade };
}
