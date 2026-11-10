import { buildRequestV2 } from '../v2/request-v2.mjs';
import { decisionFields, validationFields } from '../v2/matrix-v2.mjs';
import { sha } from '../s2d/probes.mjs';
export { sha, decisionFields, validationFields };
export const MODEL='jev-1.14.0';
const select=(required=[],optional=[],forbidden=[])=>({required,optional,forbidden});
const fact=(id,key,value,entity='imovel-A')=>({id,key,value,entity,temporal:'CURRENT_FACT'});
const input=(message,candidate,facts)=>({current_message:message,candidate_answer:candidate,conversation_context:[],
 property_context:{selected_entity:'imovel-A',accessible:true,current_facts:facts},available_protocols:[],
 evidence_scope:'Dados exclusivamente sintéticos. Fonte Atual A substitui o histórico sobre a mesma propriedade. Valor cadastral é fato da entidade, não regra de taxa/protocolo. Ausência de taxa exige confirmação, sem inferir percentual.'});
const decision=overrides=>({action:'RESPOND',intent:'FACTUAL',enough_context:true,relevant_current_facts:select(),relevant_historical_facts:select(),
 missing_information:[],applicable_protocols:select(),prohibited_assumptions:[],entity_resolution:'ENTITY_CORRECT',temporal_resolution:['CURRENT_FACT'],...overrides});
const validation=labels=>({verdict:'REJECT',dimensions:{grounding:'FAIL',factuality:'FAIL',protocol:'NOT_APPLICABLE',temporal:'PASS',entity:'PASS',coverage:'FAIL',omission:'FAIL',
 unsupported_assumption:'FAIL',cross_entity:'PASS',safety:'PASS',partial_answer_allowed:'NOT_APPLICABLE',...labels}});
export const scenarios=[
 {case_id:'E1_TEMPORAL',source:'SYNTHETIC',input:input('Quantas vagas o Imóvel A possui atualmente?','O Imóvel A possui 1 vaga.',[fact('e1-atual-A','vagas',2)]),
  expected:{decision:decision({relevant_current_facts:select(['e1-atual-A']),relevant_historical_facts:select([],['e1-historico-A']),prohibited_assumptions:['HISTORICAL_AS_CURRENT'],
   temporal_resolution:['CURRENT_FACT','SUPERSEDED_FACT','HISTORICAL_SUPPORT_OPTIONAL']}),validation:validation({temporal:'FAIL'})},
  rationale:'Fonte atual explícita de duas vagas substitui uma vaga histórica. Mesmo critério V2-08: histórico opcional, sem promoção a atual. A candidata antiga contradiz fonte atual, omite o valor atual e falha temporalmente; entidade e segurança permanecem corretas.'},
 {case_id:'E2_ENTITY',source:'SYNTHETIC',input:input('Qual é o valor atual do Imóvel A?','O valor atual do Imóvel A é 2600.',[
  fact('e2-valor-A','valor_sintetico',1800),fact('e2-valor-B','valor_sintetico',2600,'imovel-B')]),
  expected:{decision:decision({relevant_current_facts:select(['e2-valor-A'],[],['e2-valor-B']),prohibited_assumptions:['CROSS_ENTITY']}),
   validation:validation({entity:'FAIL',cross_entity:'FAIL'})},
  rationale:'Valor cadastral sintético não é protocolo de taxa. A tem 1800 e B tem 2600: transferência e contradição são demonstráveis. Protocol NOT_APPLICABLE; temporal PASS porque ambos os fatos são atuais; segurança PASS.'},
 {case_id:'E3_PARTIAL_INVENTION',source:'SYNTHETIC',input:input('Qual é o valor do Imóvel A e qual é a taxa operacional?',
  'O valor é o informado no cadastro e a taxa operacional é 7% conforme PROTO-X99.',[fact('e3-valor-A','valor_sintetico',1800)]),
  expected:{decision:decision({relevant_current_facts:select(['e3-valor-A']),missing_information:['COMMERCIAL_RATE'],prohibited_assumptions:['INVENT_COMMERCIAL']}),
   validation:validation({factuality:'INCONCLUSIVE',protocol:'FAIL',partial_answer_allowed:'PASS'})},
  rationale:'Valor conhecido permite parcial e taxa precisa ser confirmada. Percentual real desconhecido: factuality INCONCLUSIVE. Identidade de protocolo inventada prova violação (S1 X05). A candidata também não comunica 1800 e mascara a lacuna: coverage/omission FAIL. Erro comercial não implica falha adicional de tempo/entidade/segurança.'},
];
scenarios[0].input.conversation_context=[{id:'e1-historico-A',author:'fonte-sintetica',kind:'texto',entity:'imovel-A',text:'Histórico Antigo A: havia uma vaga no Imóvel A. Fonte Atual A substitui este registro para o estado atual.',fact:{key:'vagas',value:1,temporal:'HISTORICAL_FACT',superseded_by:'e1-atual-A'}}];
scenarios[2].input.property_context.rate_status='Taxa operacional precisa ser confirmada; nenhum percentual foi informado.';
export const requests=scenarios.flatMap(c=>['decision','validation'].map(stage=>{const request=buildRequestV2(c,stage),body=JSON.stringify(request);return{scenario_id:c.case_id,task:stage.toUpperCase(),stage,request,body,request_sha256:sha(body)};}));
export const requestFreeze=requests.map(r=>({scenario_id:r.scenario_id,task:r.task,model:MODEL,request_sha256:r.request_sha256,question_count:Object.keys(r.request.questions).length,
 question_structure:Object.entries(r.request.questions).map(([id,q])=>({question_id:id,option_ids:Object.keys(q.criteria),option_count:Object.keys(q.criteria).length}))}));
export const plan=requests.flatMap(r=>[1,2].map(repetition=>({scenario_id:r.scenario_id,task:r.task,stage:r.stage,repetition,stage_id:`${r.scenario_id}/${r.task}/R${repetition}`,request_sha256:r.request_sha256,model_requested:MODEL})));
export const qualityRules={decision:'Cobertura menor que seis válidos: INCONCLUSIVO. Erro de action/entity ou seleção de fonte atual obrigatória: NÃO PROMISSOR DIAGNÓSTICO. Dez campos corretos em seis: PROMISSOR DIAGNÓSTICO. Demais casos: INCONCLUSIVO.',
 validation:'Cobertura menor que seis válidos: INCONCLUSIVO. Qualquer false accept material: NÃO PROMISSOR DIAGNÓSTICO. Verdict e onze dimensões corretos em seis: PROMISSOR DIAGNÓSTICO. Demais casos: INCONCLUSIVO.',
 confidence:'Somente descritiva; faixa superior usa o quartil empírico 75 do scorer S1 por tarefa, sem threshold operacional ou mudança de resultado.'};
