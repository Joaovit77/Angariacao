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
   marcadores {nome} (proprietário), {endereco} (rua/número) e {imovel} ("seu
   imóvel (rua, bairro)"), preenchidos com o imóvel na hora de usar. Ao salvar
   um modelo, o nome e o endereço do imóvel atual viram {nome}/{endereco} para
   o texto se adaptar quando o modelo for reutilizado em outro contato. */

/** Marcadores oferecidos ao usuário na UI (botões de inserir). */
export const MARCADORES_MODELO = [
  { token: "{nome}", rotulo: "Nome do proprietário" },
  { token: "{endereco}", rotulo: "Endereço (rua/número)" },
] as const;

/** Preenche os marcadores de um modelo com os dados do imóvel. */
export function aplicarModeloUsuario(texto: string, imovel: Imovel): string {
  const nome = (imovel.proprietarioNome || "").trim();
  const endereco = (imovel.endereco || "").trim();
  let out = texto
    .replace(/\{nome\}/g, nome)
    .replace(/\{endereco\}/g, endereco)
    .replace(/\{imovel\}/g, referenciaImovel(imovel));
  // Sem nome, a saudação "Olá, {nome}!" viraria "Olá, !" — limpa a vírgula solta.
  if (!nome) out = out.replace(/,\s*!/g, "!");
  return out.replace(/[ \t]{2,}/g, " ");
}

/** Troca o nome e o endereço do imóvel atual pelos marcadores ao salvar. */
export function tokenizarModeloUsuario(texto: string, imovel: Imovel): string {
  let out = texto;
  const endereco = (imovel.endereco || "").trim();
  if (endereco.length >= 3) out = out.split(endereco).join("{endereco}");
  const nome = (imovel.proprietarioNome || "").trim();
  if (nome.length >= 2) out = out.split(nome).join("{nome}");
  return out;
}

/** Confirmação a mostrar ao salvar um modelo, a partir do texto JÁ tokenizado.
    A tokenização é silenciosa (o texto reaparece com o nome do imóvel atual),
    então o usuário não vê que {nome} "pegou"; este aviso torna isso explícito.
    `ok` indica que o nome do proprietário virou {nome} — o caso que o usuário
    mais espera; quando falso, o modelo salvou mas o nome não se adaptará sozinho
    e ele deve inserir o marcador pelo botão. */
export function avisoAoSalvarModelo(textoTokenizado: string): { mensagem: string; ok: boolean } {
  const temNome = textoTokenizado.includes("{nome}");
  const temEndereco = textoTokenizado.includes("{endereco}");
  if (temNome && temEndereco)
    return { ok: true, mensagem: "Modelo salvo! O nome e o endereço viram {nome} e {endereco} e se adaptam a cada imóvel." };
  if (temNome) return { ok: true, mensagem: "Modelo salvo! O nome vira {nome} e se adapta a cada imóvel." };
  if (temEndereco)
    return {
      ok: false,
      mensagem: "Modelo salvo, mas o nome não virou {nome}. Use o botão {nome} para marcar onde o nome do proprietário entra.",
    };
  return {
    ok: false,
    mensagem: "Modelo salvo, mas sem marcadores. Use os botões {nome} e {endereco} para o texto se adaptar a cada imóvel.",
  };
}

/** Link click-to-chat; null quando o imóvel não tem telefone utilizável. */
export function linkWhatsapp(imovel: Imovel, mensagem: string): string | null {
  const phone = telefoneWhatsapp(imovel.proprietarioTelefone);
  if (!phone) return null;
  return `https://wa.me/${phone}?text=${encodeURIComponent(mensagem)}`;
}

/* --- Envio direto pela Evolution API ---------------------------------------
   O wa.me acima só ABRE a conversa — quem envia é o corretor, na mão. O envio
   direto dispara a mensagem pela Evolution (nossa instância do WhatsApp) sem
   abrir o WhatsApp Web. A chamada em si vive em lib/envioWhatsapp.ts (browser)
   e app/api/whatsapp/enviar (servidor, onde mora o token); aqui ficam só as
   partes puras — normalização do número e a redação dos erros — para serem
   testáveis e para cliente e servidor concordarem no mesmo vocabulário. */

/** Motivos de falha de envio. O servidor devolve um destes; a UI traduz. */
export type FalhaEnvio =
  | "sem-telefone"
  | "numero-invalido"
  | "sem-whatsapp"
  | "instancia-desconectada"
  | "nao-configurado"
  // Distinta de "nao-configurado" pelo mesmo motivo que a IA separa
  // "sem-permissao": ali o ambiente inteiro não tem envio direto; aqui ele
  // tem, e é ESTA CONTA que não tem número próprio. Juntar as duas mandaria
  // o corretor caçar configuração de servidor quando o que falta é a linha
  // dele em `whatsapp_instancias`.
  | "sem-instancia"
  // Duas recusas diferentes, de propósito: "sessao-expirada" é o corretor sem
  // login válido (ele reloga e resolve); "sem-permissao" é a Evolution
  // recusando NOSSO token (só o admin resolve). Juntar as duas mandaria o
  // corretor caçar um token quando bastava entrar de novo.
  | "sessao-expirada"
  | "sem-permissao"
  | "imovel-nao-encontrado"
  | "falha-evolution"
  | "sem-conexao";

/* Formato plausível: DDI 55 + DDD (dois dígitos, nenhum 0 — não existe DDD com
   0) + 8 ou 9 dígitos de assinante.

   Este teste é de FORMA, não de existência, e de propósito. Tentamos aqui exigir
   o "nono dígito" (celular = 9 dígitos começando em 9) e a realidade reprovou: o
   WhatsApp guarda muitos celulares brasileiros SEM o nono dígito — o jid
   canônico de um número de Londrina volta como 554398024316, com 8 dígitos. A
   regra do papel recusava números que funcionam.

   Quem decide de verdade é o WhatsApp, via /chat/whatsappNumbers na rota de
   envio: ele diz se o número existe e devolve o jid canônico (resolvendo o nono
   dígito sozinho). É o que também barra o telefone estrangeiro — o
   telefoneWhatsapp() prefixa 55 em qualquer número de 10–11 dígitos, então
   +1 415 555 2671 vira 5514155552671, que PARECE brasileiro e passa por
   qualquer regex; só a consulta revela que não existe. */
const FORMATO_BR = /^55[1-9][1-9]\d{8,9}$/;

/** Número com DDI, no formato que a Evolution espera (5543988887777).
    null quando nem vale a tentativa — sem telefone ou fora do formato. Passar
    aqui não garante entrega: a existência é conferida no envio. */
export function numeroEvolution(telefone: string | null | undefined): string | null {
  const digits = telefoneWhatsapp(telefone);
  if (!digits || !FORMATO_BR.test(digits)) return null;
  return digits;
}

const TEXTO_FALHA: Record<FalhaEnvio, string> = {
  "sem-telefone": "Este imóvel não tem telefone cadastrado.",
  "numero-invalido": "O telefone cadastrado não parece um número de celular válido. Confira o DDD e os dígitos.",
  "sem-whatsapp": "Este número não tem WhatsApp.",
  "instancia-desconectada": "Seu WhatsApp está desconectado da Evolution. Releia o QR Code no painel da Evolution.",
  "nao-configurado": "O envio direto não está configurado neste ambiente.",
  "sem-instancia": "Sua conta não tem um número de WhatsApp configurado para envio. Fale com o responsável pelo sistema.",
  "sessao-expirada": "Sua sessão expirou. Entre novamente para enviar.",
  "sem-permissao": "A Evolution recusou nossas credenciais. Confira o token da instância.",
  "imovel-nao-encontrado": "Imóvel não encontrado.",
  "falha-evolution": "A Evolution não conseguiu enviar a mensagem agora.",
  "sem-conexao": "Não foi possível falar com o servidor de envio. Verifique sua conexão.",
};

export function mensagemFalhaEnvio(falha: FalhaEnvio): string {
  return TEXTO_FALHA[falha] || TEXTO_FALHA["falha-evolution"];
}
