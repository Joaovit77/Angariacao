# Nova funcionalidade: Central de Angariação


## Objetivo

Implementar uma nova funcionalidade chamada **Central de Angariação** dentro do meu sistema de Angariação.

**A prioridade absoluta é manter a arquitetura existente.**

Não quero refatorações desnecessárias nem alterações em funcionalidades já implementadas.

---

# Primeira etapa (obrigatória)

Antes de escrever qualquer código:

1. Analise toda a estrutura do projeto.
2. Entenda a arquitetura atual.
3. Identifique:

   * organização das pastas;
   * padrão de componentes;
   * padrão das páginas;
   * utilização do Supabase;
   * autenticação;
   * APIs existentes;
   * Server Actions;
   * padrões de UI;
   * hooks existentes;
   * utilitários reutilizáveis.

Após essa análise, apresente um plano de implementação.

Não escreva código antes dessa análise.

---

# Objetivo da funcionalidade

Criar uma tela chamada:

**Central de Angariação**

Essa tela permitirá pesquisar imóveis diretamente em portais imobiliários.

Nesta primeira versão, o suporte será apenas para **OLX**.

---

# Fluxo

O usuário acessa:

Central de Angariação

↓

Preenche filtros

↓

Clica em Buscar

↓

O backend executa uma pesquisa utilizando Playwright

↓

Os imóveis encontrados são retornados

↓

O usuário escolhe quais deseja importar

↓

Os imóveis são salvos no Supabase

↓

São enviados automaticamente para o Pipeline

---

# Filtros

Criar filtros para:

* Cidade
* Bairro
* Tipo
* Valor mínimo
* Valor máximo
* Dormitórios (se disponível)

---

# Resultado da pesquisa

Cada imóvel deve aparecer em um card contendo:

* foto
* título
* preço
* cidade
* bairro
* link original
* botão Ver anúncio
* botão Importar

---

# Importação

Ao importar:

* salvar no banco
* impedir duplicidade pelo link
* registrar origem = OLX
* registrar data da importação
* criar oportunidade no Pipeline
* manter vínculo com o anúncio original

---

# Playwright

O Playwright deve ser utilizado apenas sob demanda.

Ele nunca deve executar automaticamente.

O scraping deve ocorrer somente quando o usuário clicar em "Buscar".

---

# Arquitetura

Criar uma estrutura organizada.

Exemplo esperado:

* services
* lib
* scraper
* repository
* actions
* components
* types

Respeitando o padrão já existente no projeto.

Evite criar arquivos grandes.

Separe responsabilidades.

---

# Qualidade

Escreva código limpo.

Utilize TypeScript corretamente.

Reutilize componentes existentes.

Evite duplicação.

Utilize tipagem forte.

Documente funções complexas.

---

# Muito importante

Sempre explique:

* por que está criando determinado arquivo;
* por que escolheu determinada arquitetura;
* qual impacto aquela alteração terá no restante do sistema.

Nunca implemente funcionalidades que não foram solicitadas.

Caso identifique oportunidades de melhoria, apresente-as antes de modificar o projeto.
