"use client";

import { useRouter } from "next/navigation";
import type { BlocoAssistente } from "@/lib/assistente/tipos";
import { blocosComItens } from "@/lib/assistente/historico";
import { usePipelineUi } from "@/lib/uiPipeline";
import { useUiModal } from "@/lib/uiModal";
import styles from "./Assistente.module.css";

export default function RespostaEstruturada({ blocos }: { blocos: BlocoAssistente[] }) {
  const router = useRouter();
  const aplicarBusca = usePipelineUi((s) => s.aplicarBusca);
  const abrirDrawer = usePipelineUi((s) => s.abrirDrawer);
  const abrirModal = useUiModal((s) => s.abrirModal);

  function abrirImovel(id: string, codigo: string) {
    aplicarBusca(codigo === "Sem codigo" ? "" : codigo);
    abrirDrawer(id);
    router.push("/pipeline");
  }

  return blocosComItens(blocos).map((bloco, indice) => (
    <section className={styles.bloco} key={`${bloco.tipo}-${indice}`}>
      <strong>{bloco.titulo}</strong>
      {bloco.tipo === "metricas" && <div className={styles.metricas}>{bloco.itens.map((item) => <div key={item.rotulo}><span>{item.rotulo}</span><b>{item.valor}</b></div>)}</div>}
      {bloco.tipo === "imoveis" && bloco.itens.map((item) => <button className={styles.item} type="button" key={item.id} onClick={() => abrirImovel(item.id, item.codigo)}><span><b>{item.codigo}</b> · {item.status}</span><small>{item.endereco}{item.bairro ? ` · ${item.bairro}` : ""}{item.diasSemMovimento != null ? ` · ${item.diasSemMovimento} dias` : ""}</small></button>)}
      {bloco.tipo === "agenda" && bloco.itens.map((item) => <button className={styles.item} type="button" key={item.id} onClick={() => { router.push("/agenda"); abrirModal("agenda", item.id); }}><span><b>{item.titulo}</b>{item.concluido ? " · concluido" : ""}</span><small>{item.data}{item.hora ? ` às ${item.hora}` : ""} · {item.tipo}</small></button>)}
      {bloco.tipo === "mensagens_agendadas" && bloco.itens.map((item) => <div className={styles.item} key={item.id}><span><b>{item.nomeProprietario}</b> · {item.status}</span><small>{item.dataEnvio}</small>{item.resumoMensagem && <small>{item.resumoMensagem}</small>}</div>)}
      {bloco.tipo === "historico" && bloco.itens.map((item, i) => <div className={styles.historico} key={`${item.data}-${i}`}><small>{item.data} · {item.tipo}</small><span>{item.texto}</span></div>)}
    </section>
  ));
}
