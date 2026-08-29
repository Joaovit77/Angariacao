# Como colocar o sistema no ar (Supabase + Vercel)

> **Nota sobre a migração (2026-07).** O sistema foi migrado de um site estático puro para uma
> aplicação **Next.js**, que vive na pasta **`web/`**. Os arquivos antigos (`index.html`, `app.js`,
> `style.css`, `supabase-config.js`) já foram removidos. Este guia descreve o deploy do app atual.
> O banco (Supabase) não muda.

Duas partes: primeiro o banco de dados (Supabase), depois o site (Vercel).
Os dois são gratuitos no plano que você vai usar.

---

## Parte 1 — Criar o banco de dados no Supabase

> Se você já tem o projeto Supabase funcionando com o app antigo, **pule esta parte**: o app
> novo usa o mesmíssimo banco, as mesmas tabelas e as mesmas políticas de segurança.

1. Acesse **https://supabase.com** e crie uma conta (dá pra usar login do Google).
2. Clique em **"New Project"**.
   - Escolha um nome (ex: `angariacoes`)
   - Crie uma senha de banco de dados (guarde em algum lugar, mas não vai precisar no dia a dia)
   - Escolha a região mais perto de você (ex: São Paulo, se disponível)
   - Clique em **"Create new project"** e espere uns 2 minutos.
3. Quando o projeto abrir, vá no menu lateral em **"SQL Editor"** → **"New query"**.
4. Abra o arquivo **`supabase-schema.sql`** (na raiz do repositório), copie todo o conteúdo,
   cole no editor do Supabase e clique em **"Run"**.
   - Isso cria as tabelas (`imoveis`, `metas`, `agenda`, `user_config`) e já configura a segurança
     para que cada login só veja os próprios dados. É idempotente — pode rodar de novo sem medo.
5. Vá em **Project Settings** (engrenagem) → **API** e copie dois valores:
   - **"Project URL"**
   - **"anon public"** (a chave pública — é seguro deixá-la à vista; a segurança de verdade está
     nas políticas de Row Level Security do banco)
6. **Confirmação de e-mail (opcional):** em **Authentication → Providers → Email**, se quiser que
   o cadastro libere o acesso na hora, desative "Confirm email". Pode reativar depois.
7. **Recuperação de senha:** o app novo tem o fluxo "Esqueci minha senha". O link do e-mail cai na
   raiz do site (`/`). Confira em **Authentication → URL Configuration** que a **Site URL** aponta
   para o endereço final do app na Vercel (senão o link de recuperação volta para o lugar errado).

---

## Parte 2 — As credenciais agora são variáveis de ambiente

O app antigo guardava a URL e a anon key dentro de `supabase-config.js`. O app novo lê essas duas
informações de **variáveis de ambiente** (continuam públicas — o prefixo `NEXT_PUBLIC_` só diz ao
Next.js que elas podem ir para o navegador):

```
NEXT_PUBLIC_SUPABASE_URL=https://SEU-PROJETO.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=sua-anon-key
```

- **Localmente:** copie `web/.env.example` para `web/.env.local` e preencha os valores. O
  `.env.local` não é versionado.
- **Na Vercel:** você vai colar essas duas variáveis nas configurações do projeto (Parte 3).

Os valores são os que você copiou no passo 5 da Parte 1 (ou os que já estão em `supabase-config.js`,
na raiz, do deploy antigo — são os mesmos).

### Feedback das sugestões da IA — ativação controlada

A ativação exige duas condições cumulativas: a trava de código `IA_FEEDBACK_SCHEMA_READY` e a
variável de servidor `IA_FEEDBACK_SUGESTOES_ENABLED=true`. A trava de código permanece
explicitamente `false` enquanto o schema não foi validado/aplicado; portanto nenhuma configuração
existente na Vercel consegue ativar a coleta. Enquanto qualquer condição estiver desligada, o app
não usa `ia_sugestoes` nem `ia_feedbacks`.

Antes de ativá-la em qualquer ambiente:

1. valide o schema em PostgreSQL/Supabase real;
2. aplique `ia_sugestoes` e `ia_feedbacks` pelo procedimento controlado do ambiente;
3. valide constraints, incluindo a FK composta `(sugestao_id, user_id)`;
4. valide isolamento RLS entre dois usuários;
5. valide os grants mínimos;
6. execute smoke da interface para aprovação, rejeição, edição, reload e idempotência;
7. execute smoke do envio e do retry de feedback sem novo envio;
8. altere `IA_FEEDBACK_SCHEMA_READY` para `true` em uma revisão de código específica e publique
   mantendo a variável de ambiente desligada;
9. somente depois configure `IA_FEEDBACK_SUGESTOES_ENABLED=true` e faça novo deploy.

A flag não substitui essas verificações. O schema não é aplicado automaticamente pelo deploy da
aplicação.

### Endereço e CEP — gratuito, sem chave

Os cadastros consultam o ViaCEP diretamente no navegador. Digitar um CEP preenche rua, bairro,
cidade e UF; digitar uma rua mostra CEPs da cidade/UF preenchidas no formulário. A pesquisa por rua
usa debounce, cancelamento e cache local para respeitar o serviço público. Não há variável de
ambiente, projeto Google ou faturamento para configurar. O mapa continua usando OpenStreetMap.

Depois de publicar esta versão, rode novamente o `supabase-schema.sql` no SQL Editor. O script é
idempotente e acrescenta somente a coluna `imoveis.estado`, necessária para persistir a UF que o
ViaCEP devolve; as políticas RLS não mudam.

### Service role (obrigatória a partir do painel de administração)

```
SUPABASE_SERVICE_ROLE_KEY=eyJ...
```

Copie em **Project Settings → API → service_role**. Ela já era usada pelo envio de WhatsApp e pelo
webhook; com o painel de administração ela passou a ser necessária também para `/api/admin/*`.

- **Nunca** prefixe com `NEXT_PUBLIC_`. Esta chave **ignora a Row Level Security por completo** —
  quem a tiver lê e escreve a carteira de todos os corretores. É o segredo mais perigoso do
  projeto.
- **Se você não configurar:** o envio direto e o painel de administração respondem "não
  configurado". O resto do app funciona.

### Super admin — liberando o primeiro

O painel `/admin` mostra todos os corretores, o estado da conexão de WhatsApp de cada um, quanto
consumiram de IA (no mês e nos últimos seis), o que está configurado neste deploy e o log do que
quebrou; é também de lá que se libera a IA de uma conta, se cadastra o número de WhatsApp dela, se
põe um teto de gasto e se promove alguém a administrador (tudo o que antes se fazia à mão no Table
Editor).

Quem entra é quem tem linha na tabela `admins`. **O primeiro precisa ser inserido à mão** — não há
administrador para promovê-lo. Do segundo em diante, use o botão **Tornar admin** no detalhe do
corretor.

1. Supabase → **Table Editor** → `auth.users` → copie o `id` (uuid) da sua conta.
2. Table Editor → `admins` → **Insert row** → cole o uuid em `user_id` → Save.

Ou pelo SQL editor:

```sql
insert into admins (user_id, observacao)
select id, 'primeiro admin' from auth.users where email = 'voce@exemplo.com'
on conflict (user_id) do nothing;
```

Recarregue o painel: o item **Administração** aparece no menu. Para revogar, apague a linha (ou use
**Remover admin** na tela — que recusa fazê-lo com a sua própria conta, para o sistema não ficar sem
nenhum administrador).

> A tabela não tem política de RLS nenhuma — nem de leitura. Isso é proposital: quem consulta é o
> servidor, com a service role. Não crie políticas ali "por simetria" com as outras tabelas.

**Conta que só OPERA o sistema** (sem carteira própria): a coluna `admins.opera_carteira` decide se
aquele admin também vê as dez telas do corretor. O padrão é `true` — o caso comum é o dono da
imobiliária administrar o sistema *e* trabalhar a própria carteira. Marque `false` (pelo botão
**Deixar só operação**, ou pelo SQL abaixo) para as contas de operação pura: nelas o painel do
corretor abriria numa parede de zeros, e uma caixa de respostas vazia diria "nada chegou" quando o
que há é uma conta que nunca vai receber mensagem.

```sql
update admins set opera_carteira = false
where user_id = (select id from auth.users where email = 'operacao@exemplo.com');
```

### Termos de uso e política de privacidade — antes de oferecer a terceiros

As páginas `/termos` e `/privacidade` já existem, com o texto escrito sobre o que o sistema
realmente faz — quais dados trata, para onde eles vão, quem responde por eles.

**Elas estão em stand by, e ligam sozinhas.** Enquanto faltar identificação do responsável, a
camada legal fica inerte: o portão de aceite **não** bloqueia ninguém, a caixa não aparece no
cadastro e os links somem do rodapé. As páginas continuam acessíveis por URL direta (para revisão),
exibindo um aviso amarelo de "documento ainda não publicável".

Não há interruptor separado: **preencher os três campos abaixo é o que ativa tudo.** A razão é que
exigir aceite de um documento que não identifica quem responde, nem oferece canal para o titular
reclamar, é colher um "eu aceito" que não vale nada.

Os três dados que faltam:

Abra `web/lib/legal/identidade.ts` e substitua os `PENDENTE`:

- `cnpj` — CNPJ (ou CPF, se você ainda opera como pessoa física).
- `endereco` — endereço para correspondência.
- `emailEncarregado` — o e-mail do encarregado de dados (art. 41 da LGPD). Não precisa ser alguém
  contratado para isso; precisa ser um endereço que alguém realmente leia.

> **Revisão jurídica.** Os textos descrevem o produto com precisão, que é a parte que um advogado
> não teria como escrever sozinho. Mas descrever o produto não é responder pela adequação à LGPD —
> passe os dois documentos por um advogado antes de assinar contrato com cliente pagante.

**Quando mudar o texto, suba a `VERSAO_TERMOS`** no mesmo arquivo. É ela que faz o aceite valer:
todo usuário reencontra a tela de aceite no próximo acesso, e fica registrada em `aceites_termos`
uma linha nova, sem apagar a anterior.

**No dia em que você preencher**, contas que já existiam — inclusive a sua — vão encontrar a tela
de aceite no próximo acesso ao painel. É o esperado: ninguém tinha aceitado nada até então. Vale
avisar seus usuários antes, para a tela não parecer um erro.

### Limpeza de log e histórico de uso — opcional

`log_eventos` e `ia_uso` crescem para sempre. A função `limpar_registros_antigos(180)` apaga o que
passou de 180 dias:

```sql
select * from limpar_registros_antigos(180);
```

Ela não roda sozinha porque agendar exige a extensão **pg_cron** ligada no projeto. Se você a
tiver, agende uma vez por mês:

```sql
select cron.schedule('limpeza-logs', '0 4 1 * *', $$select limpar_registros_antigos(180)$$);
```

### Mensagens agendadas - executor por minuto

A Vercel Hobby nao aceita Cron a cada minuto. Por isso a rota
`/api/cron/mensagens` continua na Vercel, mas o relogio fica no Supabase:

1. Rode `supabase-schema.sql` para habilitar `pg_cron`, `pg_net` e as funcoes.
2. Defina `CRON_SECRET` em Production na Vercel.
3. Com o mesmo valor disponivel apenas no ambiente do terminal, execute:

```powershell
$env:CRON_SECRET = "<mesmo valor configurado na Vercel>"
node --env-file=web/.env.local scripts/configurar-cron-mensagens.mjs
Remove-Item Env:CRON_SECRET
```

O script grava URL e segredo no Supabase Vault e cria um unico job chamado
`processar-mensagens-agendadas`, com frequencia de um minuto. Reexecuta-lo
rotaciona os valores e substitui o job anterior.

Mensagens com mais de dez minutos de atraso viram `erro / janela-expirada`.
Isso impede que uma indisponibilidade mande, horas depois, um texto que prometia
outro horario.

Verificacao operacional:

```sql
select jobid, jobname, schedule, active
from cron.job
where jobname = 'processar-mensagens-agendadas';

select id, status_code, timed_out, error_msg, created
from net._http_response
order by created desc
limit 10;
```

Uma execucao saudavel devolve HTTP 200. O corpo da resposta informa quantas
mensagens foram processadas, enviadas e quantas falharam.

### Evolution API (envio direto de WhatsApp) — opcional

O botão **"Enviar agora"** do modal de WhatsApp dispara a mensagem pela Evolution sem abrir o
WhatsApp Web. A URL é global; os tokens de envio são por corretor e ficam no banco. Para a
instância fixa `corretora`, a criação e a recuperação automáticas também exigem a *global api key*:

```
EVOLUTION_SERVER_URL=https://sua-evolution.exemplo.com
AUTHENTICATION_API_KEY=global-api-key-da-evolution
EVOLUTION_WEBHOOK_SECRET=segredo-do-webhook-de-recebimento
```

- **Nunca** prefixe com `NEXT_PUBLIC_`. Isso publicaria credenciais no navegador.
- A `AUTHENTICATION_API_KEY` só consulta/cria a instância fixa. Envio, histórico e QR usam o token da
  própria instância, persistido em `whatsapp_instancias`; a chave global nunca volta ao browser.
- O cadastro da corretora é feito em **Admin → conta da corretora → Gerar QR da corretora**. O
  nome é sempre `corretora`; o número informado `43 9653-4523` fica preservado em `observacao`, e
  o vínculo real ocorre quando o aparelho lê o QR Code.
- Instância existente e desconectada é reconectada no mesmo nome. Só uma listagem global HTTP 200
  sem `corretora` autoriza recriá-la; timeout, 401 ou 5xx nunca são tratados como exclusão.
- A recriação reutiliza o **webhook global já configurado na Evolution**. Mantenha-o apontando para
  `/api/whatsapp/webhook/<EVOLUTION_WEBHOOK_SECRET>` com o evento `MESSAGES_UPSERT`; o app não cria
  um segundo webhook por instância.
- **Se você não configurar:** nada quebra. O modal cai no `wa.me` (abrir o WhatsApp Web com a
  mensagem pronta), que é como o app funcionava antes. Sem `AUTHENTICATION_API_KEY`, instâncias já
  cadastradas continuam no fluxo legado, mas `corretora` não pode ser provisionada/recuperada.
- **Para conferir se a instância está no ar, use o próprio painel:** Configurações → *Ver conexão do
  WhatsApp*. Ela mostra o estado, o número pareado e — se tiver caído — o QR Code para reconectar,
  sem ninguém precisar abrir o painel da Evolution (onde estão as instâncias de todos os
  corretores).

> **Atenção às variáveis legadas.** Se o seu `.env.local` ainda tem `EVOLUTION_INSTANCE` e
> `EVOLUTION_TOKEN`, elas **não são mais usadas** — o nome e o token da instância saem da tabela
> `whatsapp_instancias`, uma linha por corretor. Valores antigos ali confundem: em 01/08/2026 o
> `EVOLUTION_INSTANCE` do ambiente local apontava para uma instância que já não existia, e um
> `curl` de diagnóstico com ele voltava 404 sem que houvesse nada errado com o sistema. Pode
> apagar as duas linhas.

#### Histórico anterior ao cadastro

O botão **“Importar conversa recente”** depende de a própria Evolution persistir mensagens. No
ambiente em que a Evolution API roda (não na Vercel), mantenha o banco habilitado e, no mínimo:

```env
DATABASE_ENABLED=true
DATABASE_SAVE_DATA_NEW_MESSAGE=true
DATABASE_SAVE_DATA_HISTORIC=true
```

Sem essa retenção, envio e webhook em tempo real continuam funcionando, mas
`POST /chat/findMessages/{instancia}` não terá conversa antiga para oferecer na prévia. A importação
é limitada às 30 mensagens recentes encontradas e grava somente o que o corretor selecionar; áudio
e outras mídias antigas entram como marcador (`[áudio]`, `[imagem]`), sem inventar transcrição.

### OpenAI (IA textual e embeddings da Avaliação) — opcional

Os botões de IA — sugerir roteiros de abordagem e interpretar o ranking — exigem mais uma
variável, também **segredo**:

```
OPENAI_API_KEY=sk-...
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
```

- Crie a chave em <https://platform.openai.com/api-keys>. A cobrança é **por token consumido**,
  em faturamento separado de qualquer assinatura do ChatGPT — ter ChatGPT Plus não dá crédito de
  API. Vale colocar um limite de gasto no painel da OpenAI (Settings → Limits).
- **Nunca** prefixe com `NEXT_PUBLIC_`: qualquer visitante leria a chave no DevTools e gastaria
  na sua conta. Sem o prefixo, ela só existe no servidor (a rota `web/app/api/ia`).
- **Se você não configurar:** nada quebra. Os botões de IA simplesmente não aparecem — o app
  pergunta ao servidor se há chave (`GET /api/ia`) e esconde o que não funcionaria. A Avaliação
  continua com filtros e score estruturais; apenas a seleção semântica de comparáveis fica ausente.
- `OPENAI_EMBEDDING_MODEL` é opcional e deve produzir vetores com a dimensão pedida pela aplicação
  (512). Ao trocar o modelo, anúncios antigos ficam fora da busca vetorial até serem reobservados e
  reprocessados; vetores de modelos diferentes nunca são comparados.
- O modelo usado é a constante `MODELO` no topo de `web/app/api/ia/route.ts`. Para conferir se a
  chave está válida:
  ```bash
  curl -H "Authorization: Bearer $OPENAI_API_KEY" https://api.openai.com/v1/models
  ```

### RapidAPI (Investigador de Imóveis) — opcional

O Investigador pesquisa possíveis correspondências na web pela Google Search API do RapidAPI
(`google-search-api7.p.rapidapi.com`). Configure uma única chave, sempre como segredo de servidor:

```
RAPIDAPI_KEY=
```

- A assinatura e a franquia são geridas no painel do RapidAPI. Cada investigação faz até três
  pesquisas sequenciais e encerra antes quando encontra ao menos duas evidências independentes
  suficientes, sem contradições.
  Vale configurar limite rígido de uso no plano.
- **Nunca** crie `NEXT_PUBLIC_RAPIDAPI_KEY`: qualquer valor com esse prefixo entra no bundle do
  navegador. A chave é lida somente por `web/lib/servidor/investigadorImoveis.ts`.
- O endpoint usado é `GET /search`, com os parâmetros documentados `keyword` e `device=Desktop`,
  e os headers `x-rapidapi-key` e `x-rapidapi-host`.
- Em 27/08/2026, a página pública do provider informava 500 chamadas/mês no Basic e 1.000/hora;
  a resposta real da conta local confirmou `x-ratelimit-requests-limit: 500` e expôs os headers
  de restante/reset. O painel e os headers da assinatura ativa são a fonte operacional, pois planos
  antigos podem permanecer diferentes. Em 429, confira `Retry-After` e os headers
  `x-ratelimit-*`; não presuma janela por segundo ou minuto quando o provider não a publicar.
- **Se você não configurar:** o restante do Angario continua funcionando; somente a página do
  Investigador informa que o serviço ainda não está configurado.

### Sistema Principal / Sophia (eventos da locação) — opcional

O Sistema Principal da imobiliária avisa o painel quando o proprietário assina a Autorização de
Locação, quando o imóvel é locado e quando o financeiro paga a comissão. Uma variável, **segredo**:

```
SOPHIA_WEBHOOK_SECRET=<valor longo e aleatório>
```

Gere assim:

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

- Exige também a `SUPABASE_SERVICE_ROLE_KEY` (a mesma do webhook do WhatsApp), porque a rota
  precisa achar o imóvel sem haver corretor logado.
- **Nunca** prefixe com `NEXT_PUBLIC_`. O segredo protege o sentido contrário do usual: ele não
  esconde nada de quem opera o Sophia — aqueles dados são dele —, e sim impede que qualquer um na
  internet forje "a comissão foi paga" ou "o imóvel foi locado", o que mexeria no funil, na
  conversão e no faturamento do corretor.
- **Se você não configurar:** a rota responde 503 e o resto do app segue exatamente igual.

> 📄 **Mande [INTEGRACAO_SOPHIA.md](INTEGRACAO_SOPHIA.md) para a equipe do outro sistema.** Aquele
> documento é autossuficiente — payloads, casamento, códigos de resposta, idempotência, exemplos e
> checklist de homologação — e foi escrito para quem não tem acesso a este repositório. O resumo
> abaixo é só para quem está configurando o deploy.

**O que informar a quem vai integrar do outro lado:**

| | |
|---|---|
| URL | `https://SEU-DOMINIO/api/sophia/eventos` |
| Método | `POST`, corpo JSON |
| Autenticação | header `x-webhook-secret: <o segredo>` **ou** o segredo como último segmento da URL (`/api/sophia/eventos/<segredo>`), para o caso de o cliente não permitir header |
| Teste de vida | `GET` na mesma URL responde `{"ok":true,"pronto":true}` quando o segredo bate |

Os três eventos, com os campos que importam (o resto é opcional; nomes aceitos em camelCase ou
snake_case, datas em ISO ou `dd/mm/aaaa`):

```jsonc
// 1. Autorização de locação assinada
{ "evento": "autorizacao-assinada", "id": "evt-1029",
  "referencia": "02256.001",           // a referência DO SISTEMA PRINCIPAL
  "telefone": "43998024316",           // essencial no PRIMEIRO evento (ver abaixo)
  "data": "2026-08-04", "responsavel": "Marina" }

// 2. Imóvel locado
{ "evento": "imovel-locado", "id": "evt-1104",
  "referencia": "02256.001", "data": "2026-08-20", "contrato": "C-9912" }

// 3. Comissão paga
{ "evento": "comissao-paga", "id": "evt-1211",
  "referencia": "02256.001", "data": "2026-09-05",
  "valor": 1920.00, "formaPagamento": "PIX", "observacao": "fechamento de agosto" }
```

Três coisas que evitam a maior parte dos problemas de integração aqui:

1. **O `id` é obrigatório e tem que ser estável.** É ele que torna o reenvio inofensivo: mandar o
   mesmo evento duas vezes não aplica nada duas vezes. Sem `id`, a rota recusa com 400.
2. **No primeiro evento, mande o `telefone` do proprietário** (ou o `codigo` da angariação). A
   `referencia` costuma NASCER no Sophia junto com a assinatura, então nesse momento o painel
   ainda não a conhece — e é justamente o Evento 1 que a grava, passando a usá-la como id
   compartilhado nos eventos seguintes.
3. **Leia o código de resposta.** `404` = nenhuma angariação bate com essa chave. `409` = bateu com
   mais de uma (proprietário com vários imóveis) — mande a `referencia`, ou o `endereco` e a
   `unidade`, para desempatar. Nos dois casos **nada foi aplicado**, de propósito: aplicar no
   imóvel errado não daria erro em lugar nenhum e creditaria uma comissão à angariação errada.
   Os dois casos também entram no log de eventos, visíveis em `/admin`.

---

## Parte 3 — Colocar no ar na Vercel

O detalhe que mais importa: como o app agora está na subpasta **`web/`**, é preciso dizer à Vercel
que a **raiz do projeto é `web`**. O resto ela detecta sozinha (é um projeto Next.js).

### Passo a passo (via GitHub — recomendado)

1. Garanta que o código esteja no GitHub (este repositório).
2. Na Vercel: **Add New → Project** → **Import Git Repository** → selecione este repositório.
3. **Root Directory:** clique em **Edit** e escolha a pasta **`web`**. (Este é o passo que não pode
   faltar — o app fica nessa subpasta; sem ele a Vercel tenta publicar a raiz, que não tem o app.)
4. **Framework Preset:** deve aparecer **Next.js** automaticamente. Build Command, Output e Install
   ficam nos padrões — não precisa mexer.
5. **Environment Variables:** adicione as duas da Parte 2
   (`NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY`). Se for usar o envio direto de
   WhatsApp, adicione as variáveis da Evolution descritas na Parte 2. Se for usar os botões de IA,
   some a `OPENAI_API_KEY`. Para usar o Investigador de Imóveis, adicione também `RAPIDAPI_KEY`.
6. Clique em **Deploy**. Em 1–2 minutos a Vercel te dá um link
   (ex.: `https://angariacoes-web.vercel.app`).
7. Volte no Supabase (Parte 1, passo 7) e confirme que a **Site URL** aponta para esse endereço.

> Toda vez que você atualizar o código no GitHub, a Vercel republica sozinha. Cada branch/PR
> ganha uma **URL de preview** própria — é assim que dá para testar o app novo sem tocar na
> produção (ver "Cutover" abaixo).

---

## Parte 4 — Testar

1. Abra o link que a Vercel te deu.
2. Clique em **"Criar conta"**, cadastre e-mail e senha.
3. Se você desativou a confirmação de e-mail (Parte 1, passo 6), cai direto no sistema.
4. Confira que os dados aparecem, navegue pelas telas e teste "Esqueci minha senha".
5. Peça pros colegas criarem a própria conta — cada um só vê os próprios imóveis.

---

## Cutover (já feito em 2026-07) e rollback

O cutover foi concluído: o projeto Vercel `angariacao` (que serve `angariacao.vercel.app`) teve a
**Root Directory trocada de `./` para `web`** e ganhou as duas env vars, passando a servir o app
Next. Os arquivos do app antigo foram removidos da raiz na sequência.

### Rollback (se algo der errado)

O app antigo não está mais na árvore de arquivos atual, mas continua **recuperável**:

- **Imediato (segundos), sem Git:** na Vercel, projeto `angariacao` → **Deployments** → num deploy
  **anterior ao cutover** (que servia o site estático) use **"Promote to Production"**. O site
  estático volta ao ar na hora. *(Válido pela janela de retenção de deploys da Vercel.)*
- **Via Git:** os arquivos antigos seguem no histórico. `git revert` do commit de limpeza
  (`[migração][etapa-9] …`) restaura `index.html`/`app.js`/`style.css`/`supabase-config.js` na raiz;
  aí basta apontar a Root Directory de volta para `./`.

Como o app novo e o antigo usam o mesmo banco e o mesmo contrato de dados, o rollback não perde
nenhum dado.

---

## Perguntas frequentes

**Um colega esqueceu a senha, e agora?**
O app novo já tem "Esqueci minha senha" na tela de login — ele recebe um link de recuperação por
e-mail. Confira a **Site URL** no Supabase (Parte 1, passo 7) para o link cair no lugar certo.

**Quero ver os dados de todo mundo, sou o gestor.**
Existe: o painel **Administração** (`/admin`), com a lista de corretores, o consumo de IA de cada um
e o log de falhas — ver "Super admin" na Parte 2. Ele mostra números agregados por conta (imóveis,
envios, respostas), não a carteira imóvel a imóvel; para isso continua valendo o Table Editor.

**Posso usar o sistema sem internet?**
Não nessa versão — os dados ficam na nuvem para sincronizar entre dispositivos e logins.

**É seguro deixar a "anon key" visível?**
Sim. Ela é pública por design — a segurança está nas políticas de Row Level Security do banco
(`supabase-schema.sql`), que bloqueiam qualquer acesso aos dados de outro usuário.

**Por que a Root Directory tem que ser `web`?**
Porque o app novo (Next.js) vive nessa subpasta. A raiz do repositório ainda tem o app antigo
(estático) durante o período de segurança. Apontar a Vercel para `web` é o que faz ela publicar o
app novo em vez do antigo.
