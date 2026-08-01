/* ================================================================
   PAINEL DO SUPER ADMIN — a parte pura

   Quem opera o sistema faz três perguntas, e só três: quem está
   travado, quem está custando caro e o que quebrou. Este módulo é o
   que transforma as linhas cruas (contas, uso de IA, log) nas
   respostas — sem React, sem Supabase, testável puro, como todo o
   resto de `lib/calculo/`.

   A decisão que dá forma a ele: **a lista é ordenada por quem precisa
   de você, não por volume.** É a mesma lição que a `rodadaDia` tirou
   do termômetro — ordenar por quantidade faz a categoria mais
   populosa vencer todo dia, e aqui a mais populosa vai ser sempre
   "está tudo bem". Uma tela de operação que abre mostrando quem está
   bem é uma tela que se para de abrir.
   ================================================================ */
import { daysBetween } from "../datas";
import type { GastoIa } from "./custoIa";

/** Os fatos de um corretor, como as rotas de admin os montam. */
export interface CorretorAdmin {
  id: string;
  email: string;
  /** O nome digitado no cadastro, quando houve. */
  nome: string | null;
  criadoEm: string;
  /** ISO do último login, ou null para quem nunca entrou. */
  ultimoAcesso: string | null;
  /** Nome da instância na Evolution, ou null se ninguém cadastrou ainda. */
  instancia: string | null;
  iaLiberada: boolean;
  googleConectado: boolean;
  imoveis: number;
  /** Tentativas registradas nos últimos 30 dias — o pulso do uso real. */
  tentativas30d: number;
  /** Respostas de proprietário recebidas nos últimos 30 dias. */
  respostas30d: number;
  /** Eventos de nível "erro" nos últimos 7 dias. */
  errosRecentes: number;
  gasto: GastoIa;
}

export type NivelSaude = "bloqueado" | "atencao" | "ok";

export interface Saude {
  nivel: NivelSaude;
  /** Já escrito para a tela, como o `motivo` do termômetro: uma lista
      em que não dá para concordar com o critério vira lista que
      ninguém lê. */
  motivo: string;
}

/** Dias sem login a partir dos quais uma conta ativa vira "sumiu". */
export const DIAS_INATIVIDADE = 21;

/** Dias de tolerância para a conta nova ser configurada antes de a
    tela cobrar. Curto de propósito: o corretor que se cadastrou hoje e
    não consegue enviar mensagem desiste nesta semana, não no mês que
    vem. */
export const DIAS_CONTA_NOVA = 2;

/**
 * O estado de um corretor, em uma frase.
 *
 * A ordem das checagens É a regra de negócio, e a primeira é a que
 * justificou o painel inteiro: **sem instância de WhatsApp o produto
 * não existe.** A conta entra, o cadastro funciona, e o botão "Enviar
 * agora" responde "fale com o responsável pelo sistema" — que é uma
 * frase que só faz sentido se o responsável estiver olhando. Este é o
 * lugar onde ele olha.
 *
 * Erro recente vem antes de inatividade de propósito: quem parou de
 * entrar porque algo quebrou não é um caso de sumiço, é um caso de
 * conserto — e tratar os dois igual manda a pessoa errada receber uma
 * ligação de "está tudo bem por aí?".
 */
export function saudeDoCorretor(c: CorretorAdmin, hoje: string): Saude {
  if (!c.instancia) {
    // `daysBetween` devolve null quando a data não parseia. Cair em 0
    // (e não em "muito tempo") mantém a regra do lado seguro: uma data
    // ilegível não pode, sozinha, promover a conta a "bloqueado".
    const dias = daysBetween(c.criadoEm.slice(0, 10), hoje) ?? 0;
    // Recém-cadastrado ainda não é problema: é a fila normal de quem
    // acabou de entrar. Vira problema quando passa da tolerância.
    return {
      nivel: dias > DIAS_CONTA_NOVA ? "bloqueado" : "atencao",
      motivo:
        dias > DIAS_CONTA_NOVA
          ? `Sem número de WhatsApp há ${dias} dias — não consegue enviar nada`
          : "Conta nova, falta cadastrar o número de WhatsApp",
    };
  }

  if (c.errosRecentes > 0) {
    return {
      nivel: "atencao",
      motivo: `${c.errosRecentes} erro(s) nos últimos 7 dias — ver o log`,
    };
  }

  if (c.ultimoAcesso) {
    const dias = daysBetween(c.ultimoAcesso.slice(0, 10), hoje);
    if (dias !== null && dias >= DIAS_INATIVIDADE) {
      return { nivel: "atencao", motivo: `Sem entrar há ${dias} dias` };
    }
  } else {
    return { nivel: "atencao", motivo: "Nunca entrou no painel" };
  }

  // Configurado, entrando e sem erro — mas sem trabalhar. Não é falha
  // técnica, e por isso não é "erro": é o caso em que a conversa é
  // comercial, não de suporte.
  if (c.tentativas30d === 0) {
    return { nivel: "atencao", motivo: "Nenhuma mensagem enviada em 30 dias" };
  }

  return { nivel: "ok", motivo: `${c.tentativas30d} mensagens em 30 dias` };
}

const PESO: Record<NivelSaude, number> = { bloqueado: 0, atencao: 1, ok: 2 };

/**
 * Ordena a lista: quem precisa de você primeiro; dentro do mesmo
 * nível, quem custa mais caro.
 *
 * O desempate por custo não é curiosidade — entre dois corretores
 * igualmente travados, o que já consumiu mais IA é o que está com a
 * conta aberta correndo.
 */
export function ordenarCorretores(
  lista: CorretorAdmin[],
  hoje: string,
): { corretor: CorretorAdmin; saude: Saude }[] {
  return lista
    .map((corretor) => ({ corretor, saude: saudeDoCorretor(corretor, hoje) }))
    .sort(
      (a, b) =>
        PESO[a.saude.nivel] - PESO[b.saude.nivel] ||
        b.corretor.gasto.custoUsd - a.corretor.gasto.custoUsd ||
        (a.corretor.email || "").localeCompare(b.corretor.email || ""),
    );
}

/** O total do sistema — o número que a tela mostra em cima de tudo. */
export interface TotaisAdmin {
  corretores: number;
  bloqueados: number;
  emAtencao: number;
  custoUsd: number;
  chamadas: number;
  /** Algum corretor usou modelo com preço não conferido (ou sem preço). */
  precoNaoConferido: boolean;
}

export function totaisDoPainel(lista: CorretorAdmin[], hoje: string): TotaisAdmin {
  const t: TotaisAdmin = {
    corretores: lista.length,
    bloqueados: 0,
    emAtencao: 0,
    custoUsd: 0,
    chamadas: 0,
    precoNaoConferido: false,
  };
  for (const c of lista) {
    const nivel = saudeDoCorretor(c, hoje).nivel;
    if (nivel === "bloqueado") t.bloqueados++;
    else if (nivel === "atencao") t.emAtencao++;
    t.custoUsd += c.gasto.custoUsd;
    t.chamadas += c.gasto.chamadas;
    if (c.gasto.temPrecoNaoConferido) t.precoNaoConferido = true;
  }
  return t;
}

/* ----------------------------------------------------------------
   O LOG
   ---------------------------------------------------------------- */

export type NivelEvento = "erro" | "aviso" | "info";
export type CategoriaEvento = "whatsapp" | "ia" | "webhook" | "google" | "admin";

export interface EventoLog {
  id: number;
  userId: string | null;
  categoria: string;
  nivel: string;
  evento: string;
  detalhe: string | null;
  criadoEm: string;
}

/**
 * O vocabulário dos eventos, traduzido para quem vai ler.
 *
 * Fechado de propósito, como `MOTIVOS_PERDA_IA`: um log em texto livre
 * vira um lugar onde cada rota escreve do seu jeito, e a primeira
 * pessoa que precisar filtrar não consegue. Evento desconhecido cai no
 * próprio código — nunca em "erro genérico", que esconderia justamente
 * o que ninguém previu.
 */
export const EVENTOS: Record<string, string> = {
  "envio-ok": "Mensagem enviada",
  "envio-falhou": "Falha ao enviar mensagem",
  "sem-instancia": "Tentou enviar sem número cadastrado",
  "instancia-desconectada": "WhatsApp desconectado (releia o QR)",
  "sem-whatsapp": "Número do proprietário não tem WhatsApp",
  "webhook-recebido": "Resposta de proprietário recebida",
  "webhook-sem-imovel": "Mensagem recebida sem imóvel correspondente",
  "webhook-instancia-desconhecida": "Mensagem de instância não cadastrada",
  "transcricao-falhou": "Falha ao transcrever áudio",
  "ia-falhou": "Falha na chamada de IA",
  "ia-sem-permissao": "Tentou usar IA sem liberação",
  "google-expirado": "Autorização do Google Agenda expirou",
  "google-falhou": "Falha ao sincronizar com o Google Agenda",
  "admin-ia-liberada": "IA liberada por um administrador",
  "admin-ia-revogada": "IA revogada por um administrador",
  "admin-instancia-salva": "Número de WhatsApp cadastrado por um administrador",
};

export function rotuloEvento(evento: string): string {
  return EVENTOS[evento] || evento;
}

/** Conta os erros por corretor num conjunto de eventos — o que
    alimenta `errosRecentes`. */
export function errosPorCorretor(eventos: EventoLog[]): Map<string, number> {
  const mapa = new Map<string, number>();
  for (const e of eventos) {
    if (e.nivel !== "erro" || !e.userId) continue;
    mapa.set(e.userId, (mapa.get(e.userId) || 0) + 1);
  }
  return mapa;
}
