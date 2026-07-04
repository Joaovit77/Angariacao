# Como colocar o sistema no ar (Supabase + Vercel)

Duas partes: primeiro o banco de dados (Supabase), depois o site (Vercel).
Leva uns 15 minutos, e os dois são gratuitos no plano que você vai usar.

---

## Parte 1 — Criar o banco de dados no Supabase

1. Acesse **https://supabase.com** e crie uma conta (dá pra usar login do Google).
2. Clique em **"New Project"**.
   - Escolha um nome (ex: `angariacoes`)
   - Crie uma senha de banco de dados (guarde ela em algum lugar, mas não vai precisar usá-la no dia a dia)
   - Escolha a região mais perto de você (ex: São Paulo, se disponível)
   - Clique em **"Create new project"** e espere uns 2 minutos enquanto ele é criado.
3. Quando o projeto abrir, vá no menu lateral em **"SQL Editor"**.
4. Clique em **"New query"**.
5. Abra o arquivo **`supabase-schema.sql`** (que veio junto com o sistema), copie todo o conteúdo, cole no editor do Supabase e clique em **"Run"**.
   - Isso cria as tabelas (`imoveis`, `metas`, `agenda`, `user_config`) e já configura a segurança para que cada login só veja os próprios dados.
6. Agora vá em **Project Settings** (ícone de engrenagem) → **API**.
   - Copie o valor de **"Project URL"**
   - Copie o valor de **"anon public"** (a chave pública — é seguro usar essa no código do site, ela não dá acesso a nada além do que as regras de segurança permitirem)
7. **Confirmação de e-mail (opcional, mas recomendado desativar no início):** em **Authentication → Providers → Email**, se quiser que o cadastro libere o acesso na hora (sem precisar confirmar e-mail), desative a opção "Confirm email". Você pode reativar depois se quiser mais segurança.

---

## Parte 2 — Colar as credenciais no sistema

1. Abra o arquivo **`supabase-config.js`**.
2. Troque:
   ```js
   const SUPABASE_URL = "COLE_AQUI_A_URL_DO_SEU_PROJETO_SUPABASE";
   const SUPABASE_ANON_KEY = "COLE_AQUI_A_ANON_KEY_DO_SEU_PROJETO_SUPABASE";
   ```
   pelos valores que você copiou no passo 6 da Parte 1.
3. Salve o arquivo.

---

## Parte 3 — Colocar no ar na Vercel

### Opção A — pelo site (mais simples, sem instalar nada)

1. Acesse **https://vercel.com** e crie uma conta (dá pra usar login do GitHub).
2. Se os arquivos do sistema (`index.html`, `style.css`, `app.js`, `supabase-config.js`) estiverem numa pasta no seu computador:
   - Vá em **Add New → Project**
   - Escolha a opção de fazer upload/arrastar a pasta (ou primeiro suba a pasta pro GitHub e importe o repositório — veja Opção B)
3. Não precisa configurar nada de build — é um site estático puro. Clique em **Deploy**.
4. Em 1 minuto a Vercel te dá um link tipo `https://angariacoes-joao.vercel.app` — esse já é o endereço final do seu sistema.

### Opção B — via GitHub (recomendado se for atualizar com frequência)

1. Crie um repositório novo no GitHub e suba os arquivos (`index.html`, `style.css`, `app.js`, `supabase-config.js`, e os demais).
2. Na Vercel, clique em **Add New → Project**, escolha **"Import Git Repository"** e selecione o repositório.
3. Não mexa em nenhuma configuração de build (framework: **Other** ou **None**). Clique em **Deploy**.
4. Pronto — toda vez que você atualizar o código no GitHub, a Vercel republica automaticamente.

---

## Parte 4 — Testar

1. Abra o link que a Vercel te deu.
2. Clique em **"Criar conta"**, cadastre seu e-mail e senha.
3. Se você desativou a confirmação de e-mail (Parte 1, passo 7), já cai direto no sistema.
4. Peça pros seus colegas criarem a própria conta do mesmo jeito — cada um só vai ver os próprios imóveis.

---

## Perguntas frequentes

**Um colega esqueceu a senha, e agora?**
Na tela de login, dá pra adicionar recuperação de senha por e-mail (o Supabase já suporta isso — se quiser, eu implemento o botão "Esqueci minha senha" depois).

**Quero ver os dados de todo mundo, sou o gestor.**
O jeito mais simples é acessar direto pelo painel do Supabase (Table Editor). Se quiser uma visão dentro do próprio sistema (um "modo gestor" que enxerga todos os colegas), isso dá pra construir — é só pedir como próxima melhoria.

**Posso continuar usando o sistema sem internet?**
Não nessa versão — como os dados agora ficam na nuvem (pra sincronizar entre dispositivos e logins), é necessário estar conectado.

**É seguro deixar a "anon key" visível no código?**
Sim. Ela é feita pra ser pública — a segurança de verdade está nas políticas de Row Level Security configuradas no banco (arquivo `supabase-schema.sql`), que bloqueiam qualquer tentativa de ler ou alterar dados de outro usuário, mesmo que alguém tente usar essa chave diretamente.
