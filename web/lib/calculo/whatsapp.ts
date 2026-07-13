/* ================================================================
   WHATSAPP — modelos de mensagem por etapa do funil
   Novo na pós-migração (item "WhatsApp" do roadmap, versão sem API):
   modelos prontos por status do imóvel para envio via link wa.me
   (click-to-chat). Módulo puro — sem React/Supabase/store — para a
   mensagem ser testável e reutilizável em qualquer view.
   A "Renovação de angariação" reaproveita a mensagem já existente
   da Agenda (mensagemRenovacaoAngariacao) para não haver duas
   redações do mesmo aviso.
   ================================================================ */
import type { Imovel } from "../tipos";
import { mensagemRenovacaoAngariacao, telefoneWhatsapp } from "./agenda";

export interface ModeloWhatsapp {
  id: string;
  rotulo: string;
}

/** "Olá, Fulano! Tudo bem?" — mesma saudação da mensagem de renovação. */
function saudacao(imovel: Imovel): string {
  const nome = imovel.proprietarioNome ? imovel.proprietarioNome.trim() : "";
  return nome ? `Olá, ${nome}! Tudo bem?` : "Olá! Tudo bem?";
}

/** Sem artigo, para o modelo escrever "o/ao/do seu imóvel (…)". */
function referenciaImovel(imovel: Imovel): string {
  const endereco = (imovel.endereco || "").trim();
  if (!endereco) return "seu imóvel";
  const bairro = (imovel.bairro || "").trim();
  return `seu imóvel (${endereco}${bairro ? `, ${bairro}` : ""})`;
}

/** Endereço "cru" (rua, bairro, cidade) para a mensagem de confirmação. */
function enderecoCompletoTexto(imovel: Imovel): string {
  const partes = [imovel.endereco, imovel.bairro, imovel.cidade].map((s) => (s || "").trim()).filter(Boolean);
  return partes.join(", ") || "seu imóvel";
}

/** "Aqui é Fulano, da equipe..." quando há nome do captador; senão a
    apresentação genérica que os modelos antigos sempre usaram. */
function apresentacao(nomeCaptador?: string): string {
  const nome = (nomeCaptador || "").trim();
  return nome
    ? `Aqui é ${nome}, da equipe de locação da imobiliária.`
    : `Falo com você em nome da equipe de locação da imobiliária.`;
}

const GERADORES: Record<string, (imovel: Imovel, nomeCaptador?: string) => string> = {
  "primeiro-contato": (i) => `${saudacao(i)}

Falo com você em nome da equipe de locação da imobiliária. Gostaríamos de conversar sobre cuidar da locação do ${referenciaImovel(i)} para você.

Posso te explicar como funciona o nosso trabalho?`,

  "confirmacao-visita": (i) => `${saudacao(i)}

Passando para confirmar a nossa visita ao ${referenciaImovel(i)}. O horário combinado continua bom para você?

Qualquer imprevisto, é só me avisar por aqui.`,

  "retorno-negociacao": (i) => `${saudacao(i)}

Passando para dar continuidade à nossa conversa sobre o ${referenciaImovel(i)}. Ficou alguma dúvida sobre as condições que apresentamos?

Estou à disposição para ajustar o que for preciso.`,

  "cobranca-documentacao": (i) => `${saudacao(i)}

Para concluirmos o cadastro do ${referenciaImovel(i)}, ainda precisamos de alguns documentos.

Consegue me enviar por aqui quando puder? Assim já deixamos tudo pronto para a divulgação.`,

  "inicio-divulgacao": (i) => `${saudacao(i)}

Boa notícia: a angariação do ${referenciaImovel(i)} foi concluída e já vamos preparar a divulgação.

Qualquer novidade sobre interessados, te aviso por aqui.`,

  "atualizacao-anuncio": (i) => `${saudacao(i)}

Passando para te manter a par: o ${referenciaImovel(i)} está publicado e em divulgação.

Assim que tivermos visitas ou propostas, entro em contato.`,

  "imovel-locado": (i) => `${saudacao(i)}

Ótima notícia: o ${referenciaImovel(i)} foi locado!

Obrigado pela confiança no nosso trabalho. Seguimos à disposição para o que precisar.`,

  // "Dar feedback": aviso de que o imóvel está ativo no pipeline e em
  // divulgação — disparado pelo botão de WhatsApp da listagem do Pipeline.
  "feedback-divulgacao": (i, nome) => `${saudacao(i)}

${apresentacao(nome)} Passando para avisar que o ${referenciaImovel(i)} já está ativo no nosso pipeline e estamos trabalhando na divulgação dele.

Qualquer novidade sobre interessados, te aviso por aqui.`,

  "retomada-contato": (i) => `${saudacao(i)}

Tentei falar com você há alguns dias sobre o ${referenciaImovel(i)}, mas não consegui retorno.

Ainda tem interesse em conversar sobre a locação? Fico à disposição.`,

  "renovacao-angariacao": (i) => mensagemRenovacaoAngariacao(i),

  // Confirmação de endereço: disparada no pré-cadastro rápido. Repete o
  // endereço que temos para o proprietário conferir/corrigir na conversa.
  "confirmacao-endereco": (i, nome) => `${saudacao(i)}

${apresentacao(nome)} Estou organizando o cadastro do seu imóvel para a locação e, antes de seguir, queria confirmar o endereço com você:

📍 ${enderecoCompletoTexto(i)}

Está tudo certo? Se algo estiver diferente, é só me avisar por aqui que eu ajusto. Assim que você confirmar, já damos andamento na divulgação.`,
};

/** Ordem de exibição no seletor — acompanha a progressão do funil. */
export const MODELOS_WHATSAPP: ModeloWhatsapp[] = [
  { id: "confirmacao-endereco", rotulo: "Confirmação de endereço" },
  { id: "primeiro-contato", rotulo: "Primeiro contato" },
  { id: "confirmacao-visita", rotulo: "Confirmação de visita" },
  { id: "retorno-negociacao", rotulo: "Retorno de negociação" },
  { id: "cobranca-documentacao", rotulo: "Cobrança de documentação" },
  { id: "inicio-divulgacao", rotulo: "Início da divulgação" },
  { id: "atualizacao-anuncio", rotulo: "Atualização do anúncio" },
  { id: "feedback-divulgacao", rotulo: "Feedback de divulgação" },
  { id: "imovel-locado", rotulo: "Imóvel locado" },
  { id: "retomada-contato", rotulo: "Retomada de contato" },
  { id: "renovacao-angariacao", rotulo: "Renovação de angariação" },
];

const MODELO_PADRAO_POR_STATUS: Record<string, string> = {
  "Novo contato": "primeiro-contato",
  "Visita agendada": "confirmacao-visita",
  "Em negociação": "retorno-negociacao",
  "Documentação": "cobranca-documentacao",
  "Angariado": "inicio-divulgacao",
  "Publicado": "atualizacao-anuncio",
  "Locado": "imovel-locado",
  "Sem resposta": "retomada-contato",
  "Perdido": "retomada-contato",
  "Cancelado": "retomada-contato",
};

/** Modelo pré-selecionado conforme a etapa atual do imóvel no funil. */
export function modeloPadraoWhatsapp(status: string | null | undefined): string {
  return MODELO_PADRAO_POR_STATUS[status || ""] || "retomada-contato";
}

export function mensagemWhatsapp(modeloId: string, imovel: Imovel, nomeCaptador?: string): string {
  const gerar = GERADORES[modeloId] || GERADORES["retomada-contato"];
  return gerar(imovel, nomeCaptador);
}

/* --- Modelos personalizados do usuário -------------------------------------
   Guardados na config (user_config.whatsapp_modelos). O texto pode conter os
   marcadores {nome} e {imovel}, preenchidos com o imóvel na hora de usar. Ao
   salvar um modelo, o nome do proprietário atual vira {nome} para a saudação
   se adaptar quando o modelo for reutilizado em outro contato. */

/** Preenche {nome} e {imovel} de um modelo com os dados do imóvel. */
export function aplicarModeloUsuario(texto: string, imovel: Imovel): string {
  const nome = (imovel.proprietarioNome || "").trim();
  let out = texto.replace(/\{nome\}/g, nome).replace(/\{imovel\}/g, referenciaImovel(imovel));
  // Sem nome, a saudação "Olá, {nome}!" viraria "Olá, !" — limpa a vírgula solta.
  if (!nome) out = out.replace(/,\s*!/g, "!");
  return out.replace(/[ \t]{2,}/g, " ");
}

/** Troca o nome do proprietário atual por {nome} ao salvar um modelo. */
export function tokenizarModeloUsuario(texto: string, imovel: Imovel): string {
  const nome = (imovel.proprietarioNome || "").trim();
  if (nome.length < 2) return texto;
  return texto.split(nome).join("{nome}");
}

/** Link click-to-chat; null quando o imóvel não tem telefone utilizável. */
export function linkWhatsapp(imovel: Imovel, mensagem: string): string | null {
  const phone = telefoneWhatsapp(imovel.proprietarioTelefone);
  if (!phone) return null;
  return `https://wa.me/${phone}?text=${encodeURIComponent(mensagem)}`;
}
