"use client";

/* ================================================================
   DASHBOARD: DA ASSINATURA AO PAGAMENTO

   Os sete indicadores que a integração com o Sistema Principal
   tornou possíveis. Eles respondem a uma pergunta que o painel não
   sabia responder: das captações já ganhas, quantas viraram contrato
   e quanto disso já virou dinheiro na conta do corretor.

   Fica numa SEÇÃO PRÓPRIA, e não misturado aos KPIs de cima, por
   dois motivos. O primeiro é de leitura: aqueles medem a captação
   (o trabalho deste painel), estes medem o que acontece DEPOIS dela,
   em outro sistema — e empilhar dezessete cards iguais faz o corretor
   parar de ler todos. O segundo é honestidade sobre a fonte: o rodapé
   da seção diz de onde vêm os números, porque um card de dinheiro sem
   procedência é exatamente o tipo de número que ninguém confere.

   Os cálculos são de `calculo/sistemaPrincipal.ts`, e os valores
   saem das mesmas funções de comissão do resto do app — o dashboard
   não pode discordar de Metas e Relatórios sobre quanto vale uma
   comissão.
   ================================================================ */
import Contador from "@/components/Contador";
import { indicadoresIntegracao } from "@/lib/calculo/sistemaPrincipal";
import { fmtMoney } from "@/lib/formatadores";
import { useAppStore } from "@/lib/store";

function Indicador({
  label,
  valor,
  descricao,
  formatar,
}: {
  label: string;
  valor: number;
  descricao?: string;
  formatar?: (n: number) => string;
}) {
  return (
    <div className="card kpi-card">
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">
        <Contador valor={valor} formatar={formatar} />
      </div>
      {descricao && <div className="kpi-desc">{descricao}</div>}
    </div>
  );
}

export default function IntegracaoSistemaPrincipal() {
  const imoveis = useAppStore((s) => s.imoveis);
  const comissaoPercent = useAppStore((s) => s.config.comissaoPercent);
  const ind = indicadoresIntegracao(imoveis, comissaoPercent);

  return (
    <section style={{ marginBottom: "16px" }}>
      <div className="card-title" style={{ marginBottom: "8px" }}>
        Da assinatura ao pagamento{" "}
        <span className="section-note">o que o Sistema Principal informou</span>
      </div>

      <div className="grid grid-3 anim-stagger">
        <Indicador
          label="Aguardando assinatura"
          valor={ind.aguardandoAssinatura}
          descricao="Captadas, sem autorização registrada"
        />
        <Indicador
          label="Angariações autorizadas"
          valor={ind.autorizadas}
          descricao="Autorização de locação assinada"
        />
        <Indicador
          label="Angariações locadas"
          valor={ind.locadas}
          descricao="Contrato de locação fechado"
        />
        <Indicador
          label="Comissões pendentes"
          valor={ind.comissoesPendentes}
          descricao="Locadas, ainda sem pagamento"
        />
        <Indicador
          label="Comissões recebidas"
          valor={ind.comissoesRecebidas}
          descricao="Pagamento confirmado pelo financeiro"
        />
        <Indicador
          label="Valor total recebido"
          valor={ind.valorRecebido}
          formatar={fmtMoney}
          descricao="Soma do que já entrou"
        />
        {/* O único card ESTIMADO da seção, e ele diz isso. Os outros seis são
            fato informado pelo Sistema Principal; este é a comissão de quem
            ainda não pagou, e o financeiro só informa o valor ao pagar.
            Exibi-lo com a mesma cara dos demais faria um número nosso passar
            por número deles — o erro que `custoDaChamada` evita devolvendo
            null em vez de zero. */}
        <Indicador
          label="Valor pendente"
          valor={ind.valorPendente}
          formatar={fmtMoney}
          descricao="Estimado sobre a comissão configurada"
        />
      </div>
    </section>
  );
}
