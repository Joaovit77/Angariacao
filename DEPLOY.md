# Como colocar o sistema no ar (Supabase + Vercel)

> **Nota sobre a migração (2026-07).** O sistema foi migrado de um site estático puro
> para uma aplicação **Next.js**, que agora vive na pasta **`web/`**. Os arquivos antigos
> (`index.html`, `app.js`, `style.css`, `supabase-config.js`) continuam na raiz durante o
> período de segurança do cutover e serão removidos depois (ver `MIGRATION_NEXT.md`, Etapa 9).
> Este guia descreve o deploy do app **novo**. O banco (Supabase) não muda.

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

---

## Parte 3 — Colocar no ar na Vercel

O detalhe que mais importa: como o app agora está na subpasta **`web/`**, é preciso dizer à Vercel
que a **raiz do projeto é `web`**. O resto ela detecta sozinha (é um projeto Next.js).

### Passo a passo (via GitHub — recomendado)

1. Garanta que o código esteja no GitHub (este repositório).
2. Na Vercel: **Add New → Project** → **Import Git Repository** → selecione este repositório.
3. **Root Directory:** clique em **Edit** e escolha a pasta **`web`**. (Este é o passo que não pode
   faltar — sem ele a Vercel tenta publicar a raiz, que é o site antigo.)
4. **Framework Preset:** deve aparecer **Next.js** automaticamente. Build Command, Output e Install
   ficam nos padrões — não precisa mexer.
5. **Environment Variables:** adicione as duas da Parte 2
   (`NEXT_PUBLIC_SUPABASE_URL` e `NEXT_PUBLIC_SUPABASE_ANON_KEY`).
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

## Cutover: trocar a produção do app antigo para o novo

Enquanto os dois apps coexistem no repositório, o caminho seguro é:

1. **Rodar o app novo em preview** por alguns dias (a URL de preview da Vercel, ou um projeto
   Vercel separado com Root Directory `web`), com o app antigo ainda em produção. Os dois leem o
   mesmo banco, então dá para comparar lado a lado.
2. Quando estiver aprovado, apontar a produção para o app novo. Duas formas:
   - **Mesmo projeto Vercel:** em **Settings → General → Root Directory**, troque de raiz para
     `web` e refaça o deploy. O domínio de produção passa a servir o Next.
   - **Projeto novo:** mova o domínio de produção (Settings → Domains) do projeto antigo para o
     projeto novo.
3. Manter o app antigo acessível (deploy de preview congelado) por um período de segurança
   (sugestão: **2 semanas**).

### Rollback (se algo der errado depois do cutover)

O app antigo continua sendo um site estático servido a partir da raiz do repositório — nada nele
foi alterado. Para voltar:

- **Mesmo projeto:** em **Settings → General → Root Directory**, apague o `web` (volta para a raiz)
  e refaça o deploy — a produção volta a servir o `index.html`/`app.js` antigos.
- **Projeto novo:** mova o domínio de produção de volta para o projeto antigo.
- Alternativa imediata: na Vercel, em **Deployments**, use **"Promote to Production"** num deploy
  antigo que sabidamente funcionava.

Como os dois apps usam o mesmo banco e o mesmo contrato de dados, o rollback não perde nenhum dado.

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
