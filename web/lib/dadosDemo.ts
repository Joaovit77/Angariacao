/* ================================================================
   DADOS DE DEMONSTRAÇÃO
   Port de seedDemoData() (app.js, seção 7). Disponíveis sob demanda
   em Configurações → "Carregar dados de exemplo". Uma conta nova
   sempre começa vazia.

   Diferença de forma (lógica intacta): o app antigo fazia aritmética
   de datas com `new Date` + toISOString(); aqui as mesmas contas
   passam por addDaysISO/todayISO, os únicos helpers autorizados
   (MIGRATION_NEXT.md §3.5).
   ================================================================ */
import { AGENDA_TYPES, FORMAS_ABORDAGEM, ORIGENS_IMOVEL, STATUS_FLOW, STATUS_TERMINAL_NEGATIVE, TIPOS_IMOVEL } from "./constantes";
import { addDaysISO, todayISO } from "./datas";
import { uid } from "./mutacoes";
import type { AgendaItem, Imovel, StatusHistoryEntry } from "./tipos";

const TERMINAIS: readonly string[] = STATUS_TERMINAL_NEGATIVE;

const BAIRROS = ["Gleba Palhano", "Centro", "Jardim Higienópolis", "Vila Nova", "Aeroporto", "Cinco Conjuntos"];

// Coordenadas aproximadas de cada bairro em Londrina/PR, usadas para
// espalhar os pinos de demonstração de forma realista no mapa.
const BAIRRO_COORDS: Record<string, [number, number]> = {
  "Gleba Palhano": [-23.3287, -51.1552],
  Centro: [-23.3103, -51.1628],
  "Jardim Higienópolis": [-23.296, -51.178],
  "Vila Nova": [-23.298, -51.14],
  Aeroporto: [-23.334, -51.13],
  "Cinco Conjuntos": [-23.282, -51.155],
};

const NOMES = [
  "Marcos Silva", "Ana Beatriz", "Carlos Eduardo", "Fernanda Lima",
  "Roberto Alves", "Juliana Costa", "Paulo Henrique", "Camila Souza",
];
const RESPONSAVEIS = ["João Vitor"];

export function seedDemoData(comissaoPercent: number): { demo: Imovel[]; agendaDemo: AgendaItem[] } {
  const tipos = TIPOS_IMOVEL;
  const demo: Imovel[] = [];
  const hoje = todayISO();

  for (let i = 0; i < 22; i++) {
    const daysAgo = Math.floor(Math.random() * 150);
    const dataISO = addDaysISO(hoje, -daysAgo) as string;

    const roll = Math.random();
    let status: string;
    if (daysAgo > 100)
      status = roll < 0.5 ? "Locado" : roll < 0.65 ? "Perdido" : roll < 0.78 ? "Sem resposta" : roll < 0.88 ? "Cancelado" : "Publicado";
    else if (daysAgo > 45)
      status = roll < 0.35 ? "Locado" : roll < 0.5 ? "Publicado" : roll < 0.65 ? "Angariado" : roll < 0.78 ? "Documentação" : roll < 0.9 ? "Perdido" : "Sem resposta";
    else status = STATUS_FLOW[Math.floor(Math.random() * (STATUS_FLOW.length - 1))];

    const statusHistory: StatusHistoryEntry[] = [{ status: "Novo contato", date: dataISO }];
    let cursor = dataISO;
    if (status !== "Novo contato") {
      const flowIdx = (STATUS_FLOW as readonly string[]).indexOf(status);
      const stepsToSimulate = flowIdx >= 0 ? flowIdx : 2;
      for (let s = 1; s <= stepsToSimulate; s++) {
        cursor = addDaysISO(cursor, Math.floor(Math.random() * 8) + 2) as string;
        statusHistory.push({ status: STATUS_FLOW[s], date: cursor });
      }
      if (TERMINAIS.includes(status)) {
        cursor = addDaysISO(cursor, Math.floor(Math.random() * 6) + 2) as string;
        statusHistory.push({ status, date: cursor });
      }
    }

    const valorAluguel = Math.round((900 + Math.random() * 3200) / 50) * 50;
    const comissaoRecebida = status === "Locado" ? Math.random() < 0.7 : false;
    let comissaoRecebidaData: string | null = null;
    if (comissaoRecebida) {
      const locEntry = statusHistory.find((h) => h.status === "Locado");
      const base = locEntry ? locEntry.date : hoje;
      comissaoRecebidaData = addDaysISO(base, Math.floor(Math.random() * 5)) as string;
    }

    const bairro = BAIRROS[i % BAIRROS.length];
    const [baseLat, baseLng] = BAIRRO_COORDS[bairro];
    // pequeno espalhamento aleatório para os pinos não ficarem empilhados
    const latitude = baseLat + (Math.random() - 0.5) * 0.012;
    const longitude = baseLng + (Math.random() - 0.5) * 0.012;

    demo.push({
      id: uid(),
      codigo: `LD-${String(1000 + i)}`,
      endereco: `Rua Demonstração, ${100 + i * 7}`,
      bairro,
      cidade: "Londrina",
      tipo: tipos[i % (tipos.length - 1)],
      quartos: 1 + (i % 4),
      banheiros: 1 + (i % 3),
      vagas: i % 3,
      valorAluguel,
      valorCondominio: Math.round(Math.random() * 500),
      proprietarioNome: NOMES[i % NOMES.length],
      proprietarioTelefone: `(43) 9${String(8000 + i * 37).padStart(4, "0")}-${String(1000 + i * 13).padStart(4, "0")}`,
      formaAbordagem: FORMAS_ABORDAGEM[i % FORMAS_ABORDAGEM.length],
      origemImovel: ORIGENS_IMOVEL[i % ORIGENS_IMOVEL.length],
      latitude,
      longitude,
      dataAngariacao: dataISO,
      responsavel: RESPONSAVEIS[0],
      status,
      observacoes: "",
      statusHistory,
      comissaoRecebida,
      comissaoRecebidaValor: comissaoRecebida ? valorAluguel * (comissaoPercent / 100) : null,
      comissaoRecebidaData,
    });
  }

  // Alguns compromissos de agenda de exemplo
  const funil: readonly string[] = STATUS_FLOW;
  const sample = demo.filter((d) => funil.includes(d.status) && d.status !== "Locado").slice(0, 6);
  const agendaDemo: AgendaItem[] = sample.map((d, idx) => {
    const delta = idx % 3 === 0 ? -Math.floor(Math.random() * 3) - 1 : Math.floor(Math.random() * 6);
    return {
      id: uid(),
      title: `${AGENDA_TYPES[idx % AGENDA_TYPES.length]} — ${d.codigo}`,
      type: AGENDA_TYPES[idx % AGENDA_TYPES.length],
      date: addDaysISO(hoje, delta) as string,
      imovelId: d.id,
      notes: "",
      done: false,
      isVerificacaoDisponibilidade: false,
    };
  });

  return { demo, agendaDemo };
}
