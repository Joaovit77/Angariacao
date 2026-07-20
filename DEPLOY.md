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

### Evolution API (envio direto de WhatsApp) — opcional

O botão **"Enviar agora"** do modal de WhatsApp dispara a mensagem pela Evolution sem abrir o
WhatsApp Web. Ele exige mais três variáveis — e estas são **segredos**:

```
EVOLUTION_SERVER_URL=https://sua-evolution.exemplo.com
EVOLUTION_INSTANCE=nome-da-sua-instancia
EVOLUTION_TOKEN=token-da-instancia
```

- **Nunca** prefixe com `NEXT_PUBLIC_`. Isso publicaria o token no navegador e qualquer visitante
  passaria a mandar WhatsApp pela sua instância. Sem o prefixo, elas só existem no servidor
  (a rota `web/app/api/whatsapp/enviar`) — é ela, e só ela, que fala com a Evolution.
- Use o **token da instância**, não a *global api key*: a rota só envia mensagem e não precisa de
  poder para criar/apagar instâncias.
- **Se você não configurar:** nada quebra. O modal cai no `wa.me` (abrir o WhatsApp Web com a
  mensagem pronta), que é como o app funcionava antes.
- Para conferir se a instância está no ar (`state` deve ser `open`):
  ```bash
  curl -H "apikey: $EVOLUTION_TOKEN" "$EVOLUTION_SERVER_URL/instance/connectionState/$EVOLUTION_INSTANCE"
  ```
  Se voltar `close`, releia o QR Code no painel da Evolution — o app avisa isso no toast.

### OpenAI (sugestão de roteiros e leitura do ranking) — opcional

Os botões de IA — sugerir roteiros de abordagem e interpretar o ranking — exigem mais uma
variável, também **segredo**:

```
OPENAI_API_KEY=sk-...
```

- Crie a chave em <https://platform.openai.com/api-keys>. A cobrança é **por token consumido**,
  em faturamento separado de qualquer assinatura do ChatGPT — ter ChatGPT Plus não dá crédito de
  API. Vale colocar um limite de gasto no painel da OpenAI (Settings → Limits).
- **Nunca** prefixe com `NEXT_PUBLIC_`: qualquer visitante leria a chave no DevTools e gastaria
  na sua conta. Sem o prefixo, ela só existe no servidor (a rota `web/app/api/ia`).
- **Se você não configurar:** nada quebra. Os botões de IA simplesmente não aparecem — o app
  pergunta ao servidor se há chave (`GET /api/ia`) e esconde o que não funcionaria.
- O modelo usado é a constante `MODELO` no topo de `web/app/api/ia/route.ts`. Para conferir se a
  chave está válida:
  ```bash
  curl -H "Authorization: Bearer $OPENAI_API_KEY" https://api.openai.com/v1/models
  ```

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
   (`NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY`) e, se for usar o envio direto de
   WhatsApp, as três da Evolution (`EVOLUTION_SERVER_URL`, `EVOLUTION_INSTANCE`, `EVOLUTION_TOKEN`).
   Se for usar os botões de IA, some a `OPENAI_API_KEY`.
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
O jeito mais simples é o painel do Supabase (Table Editor). Um "modo gestor" dentro do sistema dá
para construir — é uma melhoria futura.

**Posso usar o sistema sem internet?**
Não nessa versão — os dados ficam na nuvem para sincronizar entre dispositivos e logins.

**É seguro deixar a "anon key" visível?**
Sim. Ela é pública por design — a segurança está nas políticas de Row Level Security do banco
(`supabase-schema.sql`), que bloqueiam qualquer acesso aos dados de outro usuário.

**Por que a Root Directory tem que ser `web`?**
Porque o app novo (Next.js) vive nessa subpasta. A raiz do repositório ainda tem o app antigo
(estático) durante o período de segurança. Apontar a Vercel para `web` é o que faz ela publicar o
app novo em vez do antigo.
