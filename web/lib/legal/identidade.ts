/* ================================================================
   IDENTIDADE JURÍDICA E VERSÃO DOS TERMOS

   Os dois documentos legais (termos de uso e política de privacidade)
   são gerados a partir daqui, e não escritos à mão em cada página, por
   um motivo prático: eles se repetem: nome, CNPJ e canal de contato
   aparecem em vários pontos dos dois textos, e uma cópia solta em cada
   lugar é como um deles fica desatualizado sem ninguém perceber.

   ATENÇÃO — ESTES DOCUMENTOS PRECISAM DE REVISÃO JURÍDICA.
   Eles descrevem com precisão o que o sistema faz (quais dados trata,
   para onde eles vão, com quem são compartilhados), que é justamente a
   parte que um advogado não teria como escrever sozinho. Mas descrever
   o produto não é o mesmo que responder pela adequação à LGPD: quem
   assina contrato com cliente pagante precisa de revisão profissional
   antes.
   ================================================================ */

/**
 * Quem responde pelo serviço.
 *
 * PREENCHA antes de publicar. Uma política de privacidade sem
 * identificação do controlador e sem canal de contato não cumpre o
 * artigo 9º da LGPD — e, na prática, deixa o titular sem para onde
 * reclamar, que é o ponto inteiro.
 *
 * `PENDENTE` é literal e aparece no texto: melhor a página dizer que
 * falta preencher do que exibir um CNPJ inventado com cara de oficial.
 * Há teste guardando que nada aqui vá para produção em branco.
 */
export const IDENTIDADE = {
  /** Razão social ou nome empresarial de quem opera o serviço. */
  nome: "Grupo SophiaHub",
  /** CNPJ (ou CPF, se você ainda opera como pessoa física). */
  cnpj: "PENDENTE",
  /** Endereço para correspondência. */
  endereco: "PENDENTE",
  /**
   * Canal do encarregado pelo tratamento de dados (o "DPO" do art. 41).
   * Não precisa ser uma pessoa contratada para isso — precisa ser um
   * e-mail que alguém realmente leia.
   */
  emailEncarregado: "PENDENTE",
  /** Nome comercial do produto, como aparece para o usuário. */
  produto: "Angario",
} as const;

/** Um campo ainda não preenchido? A UI usa isto para avisar em vez de
    exibir "PENDENTE" no meio de um parágrafo como se fosse conteúdo. */
export function identidadeIncompleta(): string[] {
  return Object.entries(IDENTIDADE)
    .filter(([, valor]) => valor === "PENDENTE" || !String(valor).trim())
    .map(([campo]) => campo);
}

/**
 * A CHAVE QUE LIGA A CAMADA LEGAL — e por que ela é derivada, e não um
 * `LEGAL_ATIVO = false` que alguém precisa lembrar de virar.
 *
 * Enquanto faltar CNPJ, endereço ou contato do encarregado, os
 * documentos não são publicáveis: falta neles justamente a
 * identificação de quem responde e o canal para o titular reclamar.
 * Exigir aceite de um texto assim é pior que não exigir nada — é
 * colher um "eu aceito" sobre um documento que não identifica a outra
 * parte, e é exatamente o tipo de aceite que não vale.
 *
 * Então, enquanto isto for falso, tudo fica INERTE: o portão não
 * bloqueia ninguém, a caixa não aparece no cadastro e os links somem
 * do rodapé. As páginas seguem acessíveis por URL direta, com o aviso
 * de "não publicável", para revisão.
 *
 * Derivado da própria identidade de propósito: preencher os três
 * campos é o que ATIVA, sem segundo passo e sem ninguém lembrar de
 * um interruptor. A precondição e o gatilho são a mesma coisa.
 */
export function legalPublicavel(): boolean {
  return identidadeIncompleta().length === 0;
}

/**
 * Versão dos documentos.
 *
 * É a peça que faz o aceite significar alguma coisa. Sem ela, "o
 * usuário aceitou os termos" é uma afirmação sobre um texto que pode
 * ter mudado três vezes desde então — e aí não há como saber ao que
 * ele disse sim.
 *
 * A regra: **mudou o texto de um dos documentos, sobe a versão.**
 * Quem aceitou a anterior volta a ver a tela de aceite no próximo
 * acesso (ver `lib/legal/aceite.ts`). Correção de vírgula não precisa;
 * mudança no que se faz com os dados, sempre.
 *
 * Formato ISO para ordenar sozinho e dizer, de cara, de quando é o
 * texto que a pessoa aceitou.
 */
export const VERSAO_TERMOS = "2026-08-01";
