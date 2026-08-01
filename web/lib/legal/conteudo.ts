/* ================================================================
   O TEXTO DOS DOIS DOCUMENTOS

   Estruturado (seções com título e parágrafos) em vez de HTML solto na
   página: as duas telas renderizam igual, o índice sai sozinho, e a
   revisão jurídica acontece num arquivo só em vez de dentro de JSX.

   ————————————————————————————————————————————————————————————
   A DECISÃO QUE DÁ FORMA A TUDO AQUI: SÃO DOIS PAPÉIS, NÃO UM.

   Este sistema trata dois conjuntos de dados que a LGPD trata de
   maneiras opostas, e escrevê-los como se fossem um só é o erro que
   deixaria todo mundo exposto:

   1. Os dados do CORRETOR (nome, e-mail, senha, acessos, consumo de
      IA). Ele se cadastrou, ele concordou, e quem responde por esses
      dados é quem opera a plataforma — CONTROLADOR.

   2. Os dados do PROPRIETÁRIO (nome, telefone, endereço do imóvel e o
      conteúdo das conversas de WhatsApp, inclusive áudios
      transcritos). Essa pessoa NUNCA se cadastrou aqui, nunca aceitou
      nada, e na maioria das vezes não sabe que este sistema existe.
      Quem tem relação com ela — e portanto responde por esses dados —
      é o corretor. A plataforma é OPERADORA: trata em nome dele.

   Isso não é formalidade. É o que define quem responde quando um
   proprietário perguntar "de onde vocês tiraram meu telefone?", e é
   por isso que os termos de uso obrigam o corretor a ter base legal
   para o dado que ele cadastra. Sem essa divisão escrita, a resposta
   padrão sobra para quem hospeda o sistema.
   ================================================================ */
import { IDENTIDADE, VERSAO_TERMOS } from "./identidade";

export interface Secao {
  titulo: string;
  /** Cada item é um parágrafo. Item que começa com "- " vira lista. */
  paragrafos: string[];
}

export interface Documento {
  titulo: string;
  subtitulo: string;
  secoes: Secao[];
}

const EMPRESA = IDENTIDADE.nome;
const PRODUTO = IDENTIDADE.produto;
const CONTATO = IDENTIDADE.emailEncarregado;

/* ----------------------------------------------------------------
   POLÍTICA DE PRIVACIDADE
   ---------------------------------------------------------------- */

export const PRIVACIDADE: Documento = {
  titulo: "Política de Privacidade",
  subtitulo: `Versão ${VERSAO_TERMOS} · ${PRODUTO}`,
  secoes: [
    {
      titulo: "1. Quem somos e o que esta política cobre",
      paragrafos: [
        `O ${PRODUTO} é um sistema de apoio ao trabalho de captação de imóveis para locação, operado por ${EMPRESA} (CNPJ ${IDENTIDADE.cnpj}), com endereço em ${IDENTIDADE.endereco}.`,
        `Esta política explica quais dados pessoais o sistema trata, por quê, com quem eles são compartilhados e quais são os seus direitos. Ela vale para o corretor ou imobiliária que usa o sistema e, no que couber, para os proprietários de imóveis cujos dados são registrados nele.`,
        `Encarregado pelo tratamento de dados (art. 41 da LGPD): ${CONTATO}.`,
      ],
    },
    {
      titulo: "2. Os dois papéis — e por que a diferença importa para você",
      paragrafos: [
        `Este sistema trata dois conjuntos de dados muito diferentes, e a lei os trata de maneiras diferentes também. Ler esta seção é o que faz o resto do documento fazer sentido.`,
        `- **Dados da sua conta** (seu nome, e-mail, senha, datas de acesso, consumo de recursos de IA e registros de falha). Aqui ${EMPRESA} é CONTROLADORA: decidimos como esses dados são tratados, e respondemos por eles.`,
        `- **Dados dos proprietários e imóveis** que você cadastra (nome, telefone, endereço, valores, anotações e o conteúdo das conversas de WhatsApp). Aqui ${EMPRESA} é OPERADORA: tratamos esses dados em seu nome e segundo suas instruções. O CONTROLADOR é você — porque é você quem tem a relação com aquela pessoa, quem decidiu abordá-la e quem sabe de onde veio o contato.`,
        `Na prática, isso significa que a responsabilidade por ter uma base legal adequada para tratar os dados do proprietário é sua, e está detalhada nos Termos de Uso. Nós fornecemos a ferramenta, a segurança e o suporte para você cumprir essa obrigação.`,
      ],
    },
    {
      titulo: "3. Quais dados são tratados",
      paragrafos: [
        `**Da sua conta:** nome, e-mail e senha (armazenada apenas de forma criptografada, nunca em texto legível — nem nós temos acesso a ela). Registramos também a data de criação da conta, a data do último acesso, o consumo de recursos de inteligência artificial (quantidade de tokens por chamada) e registros técnicos de falha.`,
        `**Dos imóveis e proprietários que você cadastra:** nome e telefone do proprietário, endereço e características do imóvel, valores, origem do contato, histórico de status, suas anotações, o histórico de tentativas de contato e o conteúdo das mensagens trocadas por WhatsApp — incluindo a transcrição em texto dos áudios recebidos.`,
        `**Da integração com o Google Agenda,** se você optar por conectá-la: o e-mail da conta conectada e uma autorização de acesso à sua agenda, usada exclusivamente para criar e atualizar os compromissos que você registra no sistema.`,
        `O sistema não coleta dados de localização do seu dispositivo, não usa cookies de publicidade e não faz rastreamento entre sites.`,
      ],
    },
    {
      titulo: "4. Para que os dados são usados",
      paragrafos: [
        `- Autenticar seu acesso e manter sua carteira isolada da de qualquer outro usuário.`,
        `- Enviar, por sua ação, mensagens de WhatsApp aos proprietários que você cadastrou, e registrar as respostas que eles enviarem de volta.`,
        `- Transcrever em texto os áudios recebidos, para que você possa ler no painel o que o proprietário disse.`,
        `- Interpretar as respostas recebidas e sugerir desfechos, textos e prioridades — sempre como sugestão, sujeita à sua confirmação.`,
        `- Calcular indicadores, metas e relatórios sobre o seu próprio trabalho.`,
        `- Manter a segurança e o funcionamento do serviço, incluindo o registro de falhas técnicas e do consumo de recursos.`,
        `Seus dados e os da sua carteira não são vendidos, alugados ou cedidos a terceiros para fins comerciais, e não são usados para publicidade.`,
      ],
    },
    {
      titulo: "5. Com quem os dados são compartilhados",
      paragrafos: [
        `Para funcionar, o sistema depende de fornecedores que tratam dados em nosso nome. São eles, e apenas eles:`,
        `- **Supabase** — banco de dados e autenticação. Armazena todos os dados da sua carteira.`,
        `- **Vercel** — hospedagem da aplicação.`,
        `- **Evolution API** — envio e recebimento das mensagens de WhatsApp, a partir do número de WhatsApp vinculado à sua conta.`,
        `- **OpenAI** — transcrição dos áudios recebidos, interpretação das respostas dos proprietários e geração dos textos sugeridos. Isso significa que o conteúdo das mensagens recebidas, incluindo áudios, é enviado a esse fornecedor para processamento. Pelos termos de uso da API que utilizamos, esse conteúdo não é usado para treinar modelos.`,
        `- **Google** — apenas se você conectar o Google Agenda, e apenas para criar e atualizar os seus compromissos.`,
        `Também poderemos compartilhar dados quando houver obrigação legal ou ordem de autoridade competente.`,
      ],
    },
    {
      titulo: "6. Transferência internacional",
      paragrafos: [
        `Parte dos fornecedores acima processa dados fora do Brasil, notadamente nos Estados Unidos. Isso está previsto no art. 33 da LGPD e ocorre com base na necessidade de execução do serviço que você contratou, e mediante cláusulas contratuais firmadas com esses fornecedores.`,
        `Na prática, e por transparência: o conteúdo das mensagens que os proprietários enviam a você, incluindo áudios, é processado por serviço sediado no exterior. Se isso for incompatível com a sua política interna, a transcrição e a interpretação por IA podem ser desativadas na sua conta — fale conosco em ${CONTATO}.`,
      ],
    },
    {
      titulo: "7. Por quanto tempo os dados ficam guardados",
      paragrafos: [
        `- **Dados da sua carteira** (imóveis, proprietários, mensagens, histórico): enquanto sua conta existir. Você pode apagá-los a qualquer momento, de uma vez, pelo próprio sistema, em Configurações → Apagar todos os meus dados.`,
        `- **Registros técnicos de falha e de consumo de IA:** 180 dias, após os quais são eliminados.`,
        `- **Dados de cadastro da conta:** enquanto a conta existir e pelo prazo necessário ao cumprimento de obrigações legais após seu encerramento.`,
        `O encerramento da conta elimina os dados da carteira. Registros de consumo podem ser mantidos de forma dissociada da sua identidade, para fins contábeis.`,
      ],
    },
    {
      titulo: "8. Como os dados são protegidos",
      paragrafos: [
        `- Cada conta enxerga exclusivamente os próprios dados, por regras aplicadas no banco de dados (Row Level Security), e não apenas por controle na tela.`,
        `- Sua senha é armazenada de forma criptografada e não é acessível a ninguém, incluindo nossa equipe.`,
        `- As credenciais sensíveis (token do WhatsApp, autorização do Google, chaves de serviço) ficam exclusivamente no servidor, em tabelas sem qualquer permissão de leitura pelo navegador.`,
        `- O acesso administrativo é restrito, identificado e registrado.`,
        `- O registro técnico de falhas, consultado pela nossa equipe, nunca contém o conteúdo das conversas nem o telefone de proprietários — apenas o motivo classificado do erro.`,
        `Nenhum sistema é infalível. Em caso de incidente de segurança que possa acarretar risco relevante, comunicaremos você e a Autoridade Nacional de Proteção de Dados, conforme o art. 48 da LGPD.`,
      ],
    },
    {
      titulo: "9. Seus direitos",
      paragrafos: [
        `A LGPD garante a você, quanto aos dados da sua conta: confirmação da existência de tratamento, acesso, correção, anonimização ou eliminação, portabilidade, informação sobre compartilhamento e revogação do consentimento. Para exercê-los, escreva para ${CONTATO}.`,
        `**Se você é um proprietário de imóvel** e recebeu contato de um corretor que usa este sistema: os seus dados foram cadastrados por ele, que é o responsável por eles. O caminho mais direto é solicitar a exclusão diretamente ao corretor ou à imobiliária que entrou em contato. Ainda assim, se preferir escrever para ${CONTATO}, encaminharemos sua solicitação ao responsável e prestaremos o apoio técnico necessário para atendê-la.`,
      ],
    },
    {
      titulo: "10. Alterações nesta política",
      paragrafos: [
        `Esta política pode ser atualizada. Quando a mudança afetar o que é feito com os dados, publicaremos uma nova versão e solicitaremos seu aceite no próximo acesso ao sistema — você saberá que mudou, em vez de descobrir depois.`,
        `Versão atual: ${VERSAO_TERMOS}.`,
      ],
    },
  ],
};

/* ----------------------------------------------------------------
   TERMOS DE USO
   ---------------------------------------------------------------- */

export const TERMOS: Documento = {
  titulo: "Termos de Uso",
  subtitulo: `Versão ${VERSAO_TERMOS} · ${PRODUTO}`,
  secoes: [
    {
      titulo: "1. O que é este serviço",
      paragrafos: [
        `O ${PRODUTO} é um sistema de apoio ao trabalho de captação de imóveis para locação, operado por ${EMPRESA}. Ele organiza a carteira de imóveis, registra contatos com proprietários, envia e recebe mensagens de WhatsApp pelo número vinculado à sua conta e produz indicadores sobre o seu trabalho.`,
        `Ao criar uma conta, você declara ter lido e aceito estes Termos e a Política de Privacidade.`,
      ],
    },
    {
      titulo: "2. Sua conta",
      paragrafos: [
        `A conta é individual e intransferível. Você é responsável por manter sua senha em sigilo e por tudo o que for feito com ela. Avise-nos imediatamente se suspeitar de uso indevido.`,
        `Você deve ter pelo menos 18 anos e capacidade civil para contratar.`,
      ],
    },
    {
      titulo: "3. Sua responsabilidade sobre os dados que você cadastra",
      paragrafos: [
        `Esta é a cláusula mais importante deste documento, e vale a pena lê-la com atenção.`,
        `Os proprietários cujos dados você cadastra não se cadastraram aqui e não aceitaram estes termos. Perante a LGPD, quem trata esses dados é você: foi você quem obteve o contato, quem decidiu abordar aquela pessoa e quem conhece a origem do dado. ${EMPRESA} atua como operadora, tratando esses dados em seu nome.`,
        `Ao usar o sistema, você declara que:`,
        `- Possui base legal adequada para tratar os dados pessoais que cadastra, e obteve esses dados de forma lícita — anúncio público, indicação, contato direto do proprietário ou outra origem legítima.`,
        `- Identifica-se corretamente ao proprietário, informando em nome de quem fala.`,
        `- Atende as solicitações de exclusão, correção ou interrupção de contato que receber dos proprietários.`,
        `- Não cadastra dados pessoais sensíveis (art. 5º, II da LGPD) no sistema, que não foi projetado para isso.`,
        `Você é o único responsável perante os proprietários pelo conteúdo que cadastra e pelas mensagens que envia.`,
      ],
    },
    {
      titulo: "4. Uso do WhatsApp",
      paragrafos: [
        `As mensagens saem do número de WhatsApp vinculado à sua conta, e é você quem responde por elas — pelo conteúdo, pela frequência e pela adequação ao destinatário.`,
        `Você se compromete a respeitar os Termos de Serviço do WhatsApp e a não usar o sistema para envio em massa não solicitado, mensagens enganosas ou qualquer prática que caracterize spam.`,
        `O sistema aplica limites automáticos de volume e intervalo entre envios, projetados para reduzir o risco de bloqueio do número. Esses limites são uma proteção, não uma garantia: a decisão de restringir ou banir um número é do WhatsApp, e ${EMPRESA} não responde por bloqueios, restrições ou perdas decorrentes do uso da sua conta de WhatsApp. Contornar deliberadamente esses limites é violação destes Termos.`,
      ],
    },
    {
      titulo: "5. Recursos de inteligência artificial",
      paragrafos: [
        `O sistema usa IA para transcrever áudios, interpretar respostas e sugerir textos, roteiros e prioridades. Todos esses resultados são SUGESTÕES, sujeitas a erro, e devem ser conferidos antes de qualquer uso.`,
        `Em especial: transcrições podem conter erros; interpretações de resposta podem classificar mal uma conversa; textos sugeridos podem conter afirmações imprecisas sobre um imóvel. Você é responsável por revisar qualquer conteúdo antes de enviá-lo a um proprietário.`,
        `${EMPRESA} não garante exatidão dos resultados de IA e não responde por decisões comerciais tomadas com base neles.`,
      ],
    },
    {
      titulo: "6. Disponibilidade e dependências",
      paragrafos: [
        `Trabalhamos para manter o serviço disponível, mas ele não é oferecido com garantia de disponibilidade ininterrupta. Podem ocorrer interrupções para manutenção, correção ou por falha de fornecedores.`,
        `O sistema depende de serviços de terceiros — WhatsApp, provedor de envio de mensagens, provedor de IA, Google Agenda, banco de dados e hospedagem. A indisponibilidade de qualquer um deles pode afetar total ou parcialmente o funcionamento, sem que isso configure descumprimento por nossa parte.`,
      ],
    },
    {
      titulo: "7. Limitação de responsabilidade",
      paragrafos: [
        `O sistema é uma ferramenta de apoio. Ele não substitui o julgamento profissional do corretor, não presta assessoria jurídica ou imobiliária e não garante resultado comercial.`,
        `Na máxima extensão permitida pela lei, ${EMPRESA} não responde por lucros cessantes, perda de oportunidade de negócio, bloqueio de número de WhatsApp ou danos indiretos decorrentes do uso do serviço.`,
        `Nada nesta cláusula afasta responsabilidades que a lei brasileira não permite excluir.`,
      ],
    },
    {
      titulo: "8. Suspensão e encerramento",
      paragrafos: [
        `Você pode encerrar sua conta quando quiser. Antes disso, é possível apagar todos os seus dados pelo próprio sistema, em Configurações.`,
        `Podemos suspender ou encerrar o acesso em caso de violação destes Termos, uso que coloque em risco a segurança do serviço ou de outros usuários, ou exigência legal. Sempre que possível, avisaremos com antecedência para que você possa extrair seus dados.`,
      ],
    },
    {
      titulo: "9. Alterações destes Termos",
      paragrafos: [
        `Estes Termos podem ser atualizados. Quando a mudança for relevante, publicaremos uma nova versão e pediremos seu aceite no próximo acesso — você não será vinculado a um texto novo sem ter tido a chance de lê-lo.`,
        `Versão atual: ${VERSAO_TERMOS}.`,
      ],
    },
    {
      titulo: "10. Lei aplicável e foro",
      paragrafos: [
        `Estes Termos são regidos pelas leis da República Federativa do Brasil.`,
        `Fica eleito o foro da comarca de domicílio do usuário para dirimir controvérsias decorrentes destes Termos.`,
        `Dúvidas: ${CONTATO}.`,
      ],
    },
  ],
};
