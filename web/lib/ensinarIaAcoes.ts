import type { ResultadoFeedbackSugestaoIa } from "./ia/feedback";
import type { TipoProtocolo } from "./protocolos";
import type { Protocolo, UserConfig } from "./tipos";
import {
  aplicarPreferenciaSupervisionada,
  type PreferenciaSupervisionada,
} from "./ensinarIa";

/**
 * O convite só existe depois do envio confirmado e de o feedback normal ter
 * sido persistido como edição. Aprovar, rejeitar ou apenas editar o campo não
 * cria aprendizado.
 */
export function deveOferecerEnsinoAposFeedback(
  resultado: ResultadoFeedbackSugestaoIa | null,
  envioConfirmado: boolean,
): boolean {
  return envioConfirmado && resultado === "editado";
}

export interface EntradaPreferenciaSupervisionada {
  config: UserConfig;
  userId: string;
  preferencia: PreferenciaSupervisionada;
}

type PersistirConfig = (
  config: UserConfig,
  userId: string,
  mensagemOk?: string,
) => Promise<boolean>;

/**
 * Atualiza somente o perfil já existente. A dependência de persistência é
 * recebida do CRUD atual para manter esta regra pura e testável sem banco.
 */
export async function confirmarPreferenciaSupervisionada(
  entrada: EntradaPreferenciaSupervisionada,
  persistir: PersistirConfig,
): Promise<boolean> {
  const perfil = aplicarPreferenciaSupervisionada(
    entrada.config.perfilComunicacao,
    entrada.preferencia,
  );
  if (!perfil || JSON.stringify(perfil) === JSON.stringify(entrada.config.perfilComunicacao)) {
    return false;
  }
  return persistir(
    { ...entrada.config, perfilComunicacao: perfil },
    entrada.userId,
    "Preferência de escrita salva.",
  );
}

export interface EntradaRegraSupervisionada {
  id: string;
  userId: string;
  tipo: TipoProtocolo;
  titulo: string;
  conteudo: string;
  escopoConfirmado: boolean;
}

type PersistirProtocolo = (protocolo: Protocolo, userId: string) => Promise<boolean>;

/**
 * Cria um protocolo somente com o texto digitado e confirmado pelo usuário.
 * Não recebe a mensagem enviada e não executa classificação ou transformação.
 */
export async function confirmarRegraSupervisionada(
  entrada: EntradaRegraSupervisionada,
  persistir: PersistirProtocolo,
): Promise<boolean> {
  const titulo = entrada.titulo.trim();
  const conteudo = entrada.conteudo.trim();
  if (!entrada.escopoConfirmado || !titulo || !conteudo) return false;
  return persistir(
    {
      id: entrada.id,
      tipo: entrada.tipo,
      titulo,
      conteudo,
      arquivado: false,
    },
    entrada.userId,
  );
}
