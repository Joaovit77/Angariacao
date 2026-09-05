# Fase 6 — Contexto Tipado do Assistente

## Objetivo

Fazer o Assistente receber contexto dinâmico seletivo, tipado e rastreável, mantendo a governança,
as políticas de autonomia e os fluxos reais do Angario. A fase não altera modelo, interface, schema,
RLS nem capacidades do produto.

## Diagnóstico anterior

Antes desta fase, o Assistente recebia três grupos principais de informação:

1. instruções permanentes, conhecimento do produto, catálogo compacto de capacidades, data/hora,
   contexto visual e catálogo de protocolos no mesmo `instructions`;
2. até 12 turnos compactados de histórico, com limite agregado aproximado de 24 mil caracteres;
3. resultados das ferramentas, serializados como JSON sem um envelope uniforme de autoridade e
   temporalidade.

O cliente enviava somente rota, página, superfície e, em drawer/modal compatível, tipo e ID da
entidade. O `user_id` já permanecia no servidor, derivado da sessão. Os fatos operacionais eram
reconsultados pelas ferramentas com o cliente autenticado e RLS, mas:

- até 40 protocolos comerciais eram relidos em toda mensagem, mesmo sem assunto comercial;
- fonte e autoridade ficavam implícitas no nome da ferramenta;
- `null`, lista vazia e fonte indisponível não compartilhavam um contrato explícito de ausência;
- memória conversacional e estado atual tinham precedência descrita em prompt, sem representação
  estrutural comum;
- ferramentas diferentes podiam repetir a mesma leitura integral de `imoveis` na mesma resposta;
- duração e tamanho do contexto não eram medidos separadamente.

Não existe tabela separada de lead: a oportunidade/proprietário operacional pertence a `imoveis`.
Conversas também derivam do histórico bidirecional real ligado ao imóvel. Avaliação e mercado não
são capacidades atuais do Assistente, embora existam em outros domínios do produto.

## Contrato implementado

`lib/assistente/contextoTipado.ts` define os tipos de bloco `imovel`, `agenda`, `pipeline`,
`conversa`, `mensagens`, `protocolos`, `avaliacao` e `mercado`. Cada bloco carregado informa:

- `estado`: `disponivel`, `ausente` ou `indisponivel`;
- `fonte`;
- `autoridade`;
- `temporalidade`;
- `observadoEm`;
- `dados` tipados ou `null` com `motivoAusencia`.

A base contém papel autenticado, capacidades e blocos selecionados, blocos sob demanda, data/hora
operacional, fuso e o tipo da entidade visual. O `userIdInterno` existe somente durante a execução no
servidor e é removido na borda do modelo.

O seletor é determinístico e usa o catálogo executável de capacidades. Ele não chama um segundo
modelo. A intenção indica os blocos permitidos; um loader ainda exige referência inequívoca antes de
consultar uma entidade específica.

## Loaders e limites

- **Imóvel/lead operacional:** consulta colunas explícitas de `imoveis`, por ID visual ou código
  declarado, sempre com `user_id`. Telefone, observações e conteúdo textual das notas não são
  selecionados. A última movimentação expõe apenas data, categoria e origem.
- **Agenda:** consulta compromissos pendentes por entidade, imóvel ou período, limitada a 10 itens,
  sempre com `user_id`. Se o pedido depende de um imóvel ausente ou fora do tenant, não cai para uma
  consulta global.
- **Pipeline:** deriva status atual, responsável e última movimentação do bloco já carregado do
  imóvel, sem uma segunda consulta.
- **Protocolos:** o catálogo ativo é carregado somente para intenção comercial ou operação que
  realmente o exige. O modelo vê apenas IDs e títulos; conteúdo completo continua atrás da
  ferramenta com IDs validados e no máximo cinco itens.
- **Conversas e mensagens:** permanecem sob demanda das ferramentas já existentes, que consultam as
  fontes reais e agora retornam ao modelo em envelope com fonte de autoridade e consulta atual.
- **Avaliação e mercado:** não são carregados nem consultados porque não há capacidade correspondente
  no Assistente atual. A presença desses domínios no contrato reserva vocabulário sem prometer
  funcionalidade.

A carteira integral usada por ferramentas é memoizada somente dentro de uma resposta do Assistente.
Ações continuam revalidando os dados nos contratos próprios; o cache não atravessa requisições,
sessões ou usuários.

## Autoridade e conflito

A ordem de evidência existente permanece inalterada. O contexto dinâmico é enviado em item separado
das instruções permanentes e do histórico. Memória conversacional recebe marca explícita de
`historico_conversacional`; dado estruturado atual prevalece em conflito. Resultado de ferramenta é
envelopado como `resultado_ferramenta` ou `protocolo`, com temporalidade de consulta atual.

Protocolos continuam subordinados ao System Prompt e às travas determinísticas. Eles podem sustentar
somente fatos comerciais que declaram; nunca substituem estado do imóvel, permissões, validações ou
confirmação humana.

## Segurança e privacidade

- identidade vem da sessão autenticada;
- todas as novas consultas repetem filtro explícito de `user_id`, além da RLS;
- não há service role nesta fronteira;
- o cliente não fornece dados de negócio como verdade;
- serialização remove `user_id`, IDs internos de imóvel/Agenda, telefone e conteúdo livre de notas;
- logs recebem apenas nomes de blocos/fontes, duração, tamanho aproximado, leituras reaproveitadas,
  ferramentas, IDs técnicos já permitidos e validações; pergunta, resposta, protocolo completo e
  contexto bruto não são registrados.

## Performance e custo

A seleção elimina a leitura fixa de protocolos em mensagens não comerciais. Uma saudação sem
intenção reconhecida faz zero consultas de contexto. Imóvel e Agenda usam seleção explícita de
colunas e limites. Pipeline deriva do imóvel já lido. A memoização por resposta evita leituras
integrais duplicadas quando o modelo encadeia ferramentas que dependem da carteira.

Os eventos estruturados medem `duracaoContextoMs`, `caracteresContexto`,
`tokensContextoAproximados` e `consultasReutilizadas`. Esses números são diagnósticos aproximados;
não incluem texto sensível nem alegam medir o custo total da chamada ao modelo.

## Regressões cobertas

Os testes da fase verificam:

- seleção por intenção e entidade visual;
- consulta do imóvel correto e da Agenda vinculada;
- ausência explícita e bloqueio de fallback global entre tenants;
- não exposição de IDs internos, telefone e conteúdo das notas;
- separação entre estado atual, memória histórica e protocolos;
- catálogo comercial sem conteúdo até a ferramenta validada;
- zero consulta de contexto para intenção irrelevante;
- avaliação/mercado não apresentados como capacidade;
- política de confirmação preservada para visita;
- reaproveitamento de leitura integral da carteira;
- observabilidade sem conteúdo bruto.

## Migração e rollback

Não há migração de banco. O rollback é exclusivamente de código: reverter os arquivos desta fase
restaura o carregamento anterior. Nenhum dado persistido precisa de conversão.

## Smoke manual

Depois de publicar uma Preview, validar com uma conta segura:

1. abrir um imóvel no Pipeline e perguntar pelo status e pela última movimentação;
2. perguntar pelo próximo compromisso desse imóvel e confirmar que não aparecem compromissos de
   outro imóvel ou usuário;
3. perguntar por uma condição comercial coberta por protocolo e outra não coberta;
4. retomar um imóvel citado em turno anterior cujo status tenha mudado e confirmar que prevalece o
   estado atual;
5. preparar uma visita e confirmar que nada é gravado antes da confirmação no card;
6. cancelar ou alterar o preview e confirmar que o anterior não executa;
7. consultar mensagens, follow-ups, foco e marco histórico para verificar os fluxos existentes;
8. confirmar que não houve envio real de WhatsApp durante a validação.

O resultado executado da validação automatizada e do smoke deve ser registrado no relatório final
da tarefa; este documento preserva apenas o contrato permanente e o roteiro reutilizável.
