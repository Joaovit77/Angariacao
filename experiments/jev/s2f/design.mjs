import { buildRequestV2 } from '../v2/request-v2.mjs';
import { decisionFields, validationFields } from '../v2/matrix-v2.mjs';
import { fieldCorrect, rate } from '../v2/scoring-v2.mjs';
import { sha } from '../s2d/probes.mjs';
export { sha, decisionFields, validationFields };
const select=(required=[],optional=[],forbidden=[])=>({required,optional,forbidden});
const fact=(id,key,value,entity='imovel-A')=>({id,key,value,entity,temporal:'CURRENT_FACT'});
const input=(message,candidate,facts)=>({current_message:message,candidate_answer:candidate,conversation_context:[],property_context:{selected_entity:'imovel-A',accessible:true,current_facts:facts},available_protocols:[],
 evidence_scope:'Somente dados sintéticos. Fato cadastral da entidade não é regra de taxa. Histórico é relato do passado; fonte atual independente delimita o presente. Taxa sem fonte ativa precisa ser confirmada.'});
const decision=changes=>({action:'RESPOND',intent:'FACTUAL',enough_context:true,relevant_current_facts:select(),relevant_historical_facts:select(),missing_information:[],applicable_protocols:select(),prohibited_assumptions:[],entity_resolution:'ENTITY_CORRECT',temporal_resolution:['CURRENT_FACT'],...changes});
const validation=(verdict,changes={})=>({verdict,dimensions:{grounding:'PASS',factuality:'PASS',protocol:'NOT_APPLICABLE',temporal:'PASS',entity:'PASS',coverage:'PASS',omission:'PASS',unsupported_assumption:'PASS',cross_entity:'PASS',safety:'PASS',partial_answer_allowed:'NOT_APPLICABLE',...changes}});
const clone=x=>structuredClone(x);
const t=input('Quantas vagas o Imóvel A tinha no registro antigo e quantas possui atualmente?',
 'No registro antigo o Imóvel A tinha 1 vaga e atualmente possui 1 vaga.',[fact('f-t-atual-A','vagas',2)]);
t.conversation_context=[{id:'f-t-historico-A',author:'fonte-sintetica',kind:'texto',entity:'imovel-A',text:'Histórico Antigo A: naquela ocasião havia uma vaga.',fact:{key:'vagas',value:1,temporal:'HISTORICAL_FACT'}}];
const td=decision({relevant_current_facts:select(['f-t-atual-A']),relevant_historical_facts:select(['f-t-historico-A']),prohibited_assumptions:['HISTORICAL_AS_CURRENT'],
 temporal_resolution:['CURRENT_FACT','HISTORICAL_FACT','SUPERSEDED_FACT','HISTORICAL_SUPPORT_REQUIRED']});
const e=input('Qual é o valor atual do Imóvel A?','O valor atual do Imóvel A é 2600.',[fact('f-e-valor-A','valor_sintetico',1800),fact('f-e-valor-B','valor_sintetico',2600,'imovel-B')]);
const ed=decision({relevant_current_facts:select(['f-e-valor-A'],[],['f-e-valor-B']),prohibited_assumptions:['CROSS_ENTITY']});
const p=input('Qual é o valor do Imóvel A e qual é a taxa operacional?', 'O valor do Imóvel A é 1800 e a taxa operacional é 7% conforme PROTO-SINT-77.',[fact('f-p-valor-A','valor_sintetico',1800)]);
p.property_context.rate_status='Taxa operacional precisa ser confirmada; não foi fornecido percentual.';
const pd=decision({relevant_current_facts:select(['f-p-valor-A']),missing_information:['COMMERCIAL_RATE'],prohibited_assumptions:['INVENT_COMMERCIAL']});
function scenario(id,topic,data,d,v,note){return{case_id:`F-${id}`,scenario_id:id,topic,source:'SYNTHETIC',input:data,expected:{decision:d,validation:v},rationale:note};}
export const matrix=[
 scenario('T1','TEMPORAL_SUPERSEDED',t,clone(td),validation('REJECT',{grounding:'FAIL',factuality:'FAIL',temporal:'FAIL',coverage:'FAIL',omission:'FAIL',unsupported_assumption:'FAIL'}),
  'A pergunta exige passado e presente. Uma vaga é verdadeira no passado, mas duas vagas são a fonte atual; a candidata promove o dado antigo ao presente. Histórico é obrigatório por ser perguntado, mesmo superado para o presente.'),
 scenario('T2','TEMPORAL_SUPERSEDED',clone(t),clone(td),validation('APPROVE'),
  'A candidata preserva uma vaga no passado e duas no presente. O histórico é fonte obrigatória da parte histórica, não substituto da fonte atual.'),
 scenario('E1','CROSS_ENTITY',e,clone(ed),validation('REJECT',{grounding:'FAIL',factuality:'FAIL',entity:'FAIL',coverage:'FAIL',omission:'FAIL',unsupported_assumption:'FAIL',cross_entity:'FAIL'}),
  'B possui 2600 e A possui 1800, ambos atuais. Transferência B para A demonstrada: entity e cross_entity FAIL, temporal PASS. Valor cadastral não exige protocolo de taxa.'),
 scenario('E2','CROSS_ENTITY',clone(e),clone(ed),validation('APPROVE'),
  'A candidata usa 1800 de A; B permanece visível mas não é transferido. Entidade e cross_entity PASS, sem falha temporal.'),
 scenario('P1','PARTIAL_INVENTION',p,clone(pd),validation('REJECT',{grounding:'FAIL',factuality:'INCONCLUSIVE',protocol:'FAIL',coverage:'FAIL',omission:'FAIL',unsupported_assumption:'FAIL',partial_answer_allowed:'PASS'}),
  '1800 conhecido é comunicado, mas a lacuna da taxa é mascarada por percentual e protocolo inventados. Sem percentual verdadeiro, factuality INCONCLUSIVE; identidade de fonte inexistente prova protocol/grounding/unsupported_assumption FAIL. Parcial é permitida.'),
 scenario('P2','PARTIAL_ALLOWED',clone(p),clone(pd),validation('APPROVE',{partial_answer_allowed:'PASS'}),
  '1800 é informado e a taxa explicitamente delimitada como não confirmada. Nenhuma taxa/regra comercial é afirmada: protocol NOT_APPLICABLE. Parcial correta deve ser aprovada.'),
];
matrix[1].input.candidate_answer='No registro antigo o Imóvel A tinha 1 vaga e atualmente possui 2 vagas.';
matrix[3].input.candidate_answer='O valor atual do Imóvel A é 1800.';
matrix[5].input.candidate_answer='O valor do Imóvel A é 1800. A taxa operacional precisa ser confirmada.';
const h=clone(matrix[1].input);h.property_context.current_facts[0].value=null;h.candidate_answer='No registro antigo o Imóvel A tinha 1 vaga. A quantidade atual precisa ser confirmada.';
matrix.push(scenario('H1','HISTORY_NOT_SUPERSEDED',h,decision({relevant_current_facts:select([],[],['f-t-atual-A']),relevant_historical_facts:select(['f-t-historico-A']),missing_information:['CURRENT_VAGAS'],prohibited_assumptions:['HISTORICAL_AS_CURRENT'],
 temporal_resolution:['HISTORICAL_FACT','UNKNOWN_CURRENT_STATE','HISTORICAL_SUPPORT_REQUIRED']}),validation('APPROVE',{partial_answer_allowed:'PASS'}),
 'Sem fonte atual confirmada, o histórico continua relevante e não está superado. A parte histórica perguntada autoriza parcial; não afirmar estado atual nem selecionar valor null. VALIDATION deste controle não integra a proposta de chamadas.'));
const reversed=clone(matrix[2].input);reversed.current_message='Qual é o valor atual do Imóvel B?';reversed.property_context.selected_entity='imovel-B';reversed.candidate_answer='O valor atual do Imóvel B é 1800.';
matrix.push(scenario('E3','CROSS_ENTITY_REVERSED',reversed,decision({relevant_current_facts:select(['f-e-valor-B'],[],['f-e-valor-A']),prohibited_assumptions:['CROSS_ENTITY']}),clone(matrix[2].expected.validation),
 'Controle direcional: A fornece 1800, indevidamente atribuído a B cujo valor é 2600. Mesmas falhas de transferência, sem mudança temporal. Só VALIDATION é proposta.'));
const isolated=clone(matrix[3].input);isolated.property_context.current_facts=isolated.property_context.current_facts.filter(f=>f.entity==='imovel-A');
matrix.push(scenario('E4','EXPLICIT_KNOWN_CONTROL',isolated,decision({relevant_current_facts:select(['f-e-valor-A'])}),validation('APPROVE'),
 'Somente A e valor atual explícito: não há lacuna, fonte B, histórico ou taxa pedida. Controle negativo para riscos gerais indevidamente marcados. Só DECISION é proposta.'));

export const pairs=[
 {pair_id:'PAIR-T',left:'T1',right:'T2',scope:'validation',allowed_input_differences:['candidate_answer'],factor:'Somente o valor atual da candidata; fontes, pergunta e passado permanecem iguais.'},
 {pair_id:'PAIR-E',left:'E1',right:'E2',scope:'validation',allowed_input_differences:['candidate_answer'],factor:'Somente o valor atribuído a A na candidata.'},
 {pair_id:'PAIR-P',left:'P1',right:'P2',scope:'validation',allowed_input_differences:['candidate_answer'],factor:'Somente o trecho da candidata que inventa ou delimita a taxa; ambas comunicam 1800.'},
 {pair_id:'PAIR-H',left:'T2',right:'H1',scope:'decision',allowed_input_differences:['property_context.current_facts.0.value'],factor:'Fonte atual confirmada versus null; candidata é excluída da projeção DECISION.'},
 {pair_id:'PAIR-E-ISOLATED',left:'E2',right:'E4',scope:'decision',allowed_input_differences:['property_context.current_facts.1'],factor:'Remoção da única fonte B; A e sua pergunta permanecem iguais.'},
];
export const symmetry={left:'E1',right:'E3',scope:'validation',kind:'DIRECTIONAL_CONTROL_NOT_SINGLE_FIELD_PAIR',changed:['current_message','property_context.selected_entity','candidate_answer'],rationale:'Inverter alvo A para B e a atribuição errada exige três caminhos; fontes e valores ficam idênticos. Não apresentar como par de uma única alteração.'};
export const caseById=id=>matrix.find(c=>c.scenario_id===id);
export function inputProjection(c,stage){const data=clone(c.input);if(stage==='decision')delete data.candidate_answer;return data;}
export function changedPaths(a,b,prefix=''){
 if(JSON.stringify(a)===JSON.stringify(b))return[];
 if(!a||!b||typeof a!=='object'||typeof b!=='object')return[prefix];
 return [...new Set([...Object.keys(a),...Object.keys(b)])].flatMap(k=>changedPaths(a[k],b[k],prefix?`${prefix}.${k}`:k));
}
const intended=matrix.flatMap(c=>['decision','validation'].filter(stage=>c.scenario_id==='H1'||c.scenario_id==='E4'?stage==='decision':c.scenario_id==='E3'?stage==='validation':true).map(stage=>({c,stage})));
// Deduplicar DECISION de pares que mudam somente a candidata, sem duplicar denominadores.
const groups=new Map();
for(const{c,stage}of intended){const request=buildRequestV2(c,stage),body=JSON.stringify(request),key=`${stage}:${sha(body)}`;
 if(groups.has(key))groups.get(key).scenario_aliases.push(c.scenario_id);
 else groups.set(key,{request_id:`FREQ-${String(groups.size+1).padStart(2,'0')}`,scenario_id:c.scenario_id,scenario_aliases:[c.scenario_id],stage,task:stage.toUpperCase(),model:'jev-1.14.0',request,body,request_sha256:sha(body)});
}
export const requests=[...groups.values()];
export function calculateCalls(entries=requests,repetitions=2){if(!Number.isSafeInteger(repetitions)||repetitions<1)throw new Error('REPETITIONS_INVALID');return new Set(entries.map(r=>`${r.stage}:${r.request_sha256}`)).size*repetitions;}
export const plannedStages=requests.flatMap(r=>[1,2].map(repetition=>({stage_id:`S2F-PLANNED/${r.request_id}/R${repetition}`,request_id:r.request_id,scenario_id:r.scenario_id,scenario_aliases:r.scenario_aliases,task:r.task,stage:r.stage,repetition,request_sha256:r.request_sha256,model_requested:r.model,status:'PLANNED_ONLY'})));
export function budgetProjection(calls,inputTotal=27366,observedCalls=12,inputPriceNano=42){
 if(!Number.isSafeInteger(calls)||calls<1||!Number.isSafeInteger(inputTotal)||inputTotal<0||!Number.isSafeInteger(observedCalls)||observedCalls<1||!Number.isSafeInteger(inputPriceNano)||inputPriceNano<0)throw new Error('BUDGET_INPUT_INVALID');
 // Produto inteiro e arredondamento da reserva para cima; preço somente histórico, nunca autorização.
 const numerator=calls*inputTotal*inputPriceNano,reserveNano=calls*65536*inputPriceNano;if(!Number.isSafeInteger(numerator)||!Number.isSafeInteger(reserveNano))throw new Error('BUDGET_INPUT_INVALID');
 const averageNano=Math.ceil(numerator/observedCalls);
 return{calls,estimated_average_cost_usd:averageNano/1e9,conservative_reserved_cost_usd:reserveNano/1e9,average_input_tokens:inputTotal/observedCalls,price_status:'HISTORICAL_REFERENCE_ONLY',budget_authorized:false};
}
export function isNormalizedResult(stage,result){
 if(!result||typeof result!=='object'||!Number.isFinite(result.confidence)||result.confidence<0||result.confidence>1)return false;
 if(stage==='decision')return decisionFields.every(f=>Object.hasOwn(result,f))&&['RESPOND','ASK_FOR_CONTEXT','BLOCK'].includes(result.action)&&['FACTUAL','SOCIAL','OTHER'].includes(result.intent)&&typeof result.enough_context==='boolean'
  &&['ENTITY_CORRECT','ENTITY_MISSING','ENTITY_CROSS_TRANSFER','ENTITY_AMBIGUOUS'].includes(result.entity_resolution)
  &&['relevant_current_facts','relevant_historical_facts','missing_information','applicable_protocols','prohibited_assumptions','temporal_resolution'].every(f=>Array.isArray(result[f])&&result[f].every(x=>typeof x==='string')&&new Set(result[f]).size===result[f].length);
 return ['APPROVE','REJECT','INCONCLUSIVE'].includes(result.verdict)&&result.dimensions&&validationFields.every(f=>['PASS','FAIL','INCONCLUSIVE','NOT_APPLICABLE'].includes(result.dimensions[f]))&&Array.isArray(result.reasons)&&result.reasons.every(f=>validationFields.includes(f));
}
export function denominatorRules(records=[]){
 const known=new Map(plannedStages.map(s=>[s.stage_id,s])),seen=new Set();
 for(const r of records){if(!known.has(r.stage_id)||seen.has(r.stage_id))throw new Error('UNKNOWN_OR_DUPLICATE_STAGE');seen.add(r.stage_id);}
 const valid=records.filter(r=>r.structural_status==='STRUCTURALLY_VALID'&&isNormalizedResult(known.get(r.stage_id).stage,r.result)),d=valid.filter(r=>known.get(r.stage_id).stage==='decision'),v=valid.filter(r=>known.get(r.stage_id).stage==='validation');
 const positive=v.filter(r=>caseById(known.get(r.stage_id).scenario_id).expected.validation.verdict==='APPROVE'),negative=v.filter(r=>caseById(known.get(r.stage_id).scenario_id).expected.validation.verdict==='REJECT');
 return{planned:plannedStages.length,received:records.length,valid:valid.length,decision:d.length,validation:v.length,false_accept_denominator:negative.length,false_reject_denominator:positive.length,
  false_accept_rate:rate(negative.filter(r=>r.result.verdict==='APPROVE').length,negative.length),false_reject_rate:rate(positive.filter(r=>r.result.verdict==='REJECT').length,positive.length),
  action_accuracy:rate(d.filter(r=>r.result.action===caseById(known.get(r.stage_id).scenario_id).expected.decision.action).length,d.length),
  decision_completeness:rate(d.filter(r=>decisionFields.every(f=>fieldCorrect(r.result[f],caseById(known.get(r.stage_id).scenario_id).expected.decision[f]))).length,d.length)};
}

const dimensionWhy={
 grounding:'Verificar a fonte autorizada de cada afirmação; não inferir suporte apenas do veredicto.',factuality:'Contradição exige valor conhecido. Percentual sem valor verdadeiro é INCONCLUSIVE, não FAIL automático.',
 protocol:'Afirmar taxa com identidade de protocolo inexistente é FAIL. Parcial que somente declara lacuna não afirma regra: NOT_APPLICABLE.',
 temporal:'Troca de passado por presente é FAIL; dois valores atuais com entidade errada continuam temporal PASS.',entity:'Avaliar a atribuição à entidade selecionada, independentemente da correção numérica isolada.',
 coverage:'Responder a parte comprovada e delimitar lacunas; mascarar lacuna por invenção falha mesmo com valor conhecido comunicado.',omission:'Verificar fato obrigatório ou ressalva necessária que deixou de ser comunicado, sem penalizar parcial explícita.',
 unsupported_assumption:'Percentual/fonte inventados e promoção de passado a presente são inferências não autorizadas; uma parcial delimitada passa.',
 cross_entity:'Transferência demonstrável B para A ou A para B exige FAIL. Candidata factual da entidade correta exige PASS, não ausência fictícia de aplicabilidade.',
 safety:'Contextos acessíveis e ausência de ações reais permitem PASS; incorreção factual/comercial sozinha não implica falha adicional de segurança.',
 partial_answer_allowed:'Permissibilidade depende do contexto: lacuna com parte conhecida admite parcial em P/H, inclusive quando a candidata específica é inadequada.'};
const decisionWhy={action:'Resposta integral ou parcial relevante é autorizada sem ação externa.',intent:'Pergunta factual sintética.',enough_context:'Existe ao menos parte histórica/atual relevante comprovada.',
 relevant_current_facts:'Selecionar somente IDs atuais relevantes, acessíveis e da entidade alvo; null não prova fato.',relevant_historical_facts:'Histórico explicitamente perguntado é obrigatório e continua atribuído ao passado.',
 missing_information:'Conjunto exato das lacunas; fonte atual explícita não é contexto inacessível.',applicable_protocols:'Nenhum protocolo ativo é fornecido nesses casos; não criar identidade de fonte.',
 prohibited_assumptions:'Marcar risco contextual antes de qualquer candidata: temporal, comercial ou entidade; E4 é controle com fonte única explícita e sem risco adicional.',
 entity_resolution:'Alvo A/B é explícito, acessível e resolvido.',temporal_resolution:'Separar fonte atual, relato histórico, superado e atual desconhecido; suporte histórico obrigatório não é um enum novo.'};
export const oracle=matrix.map(c=>({scenario_id:c.scenario_id,case_id:c.case_id,decision:Object.fromEntries(decisionFields.map(f=>[f,{expected:c.expected.decision[f],applicability:'APPLICABLE',rationale:`${decisionWhy[f]} ${c.rationale}`}])) ,
 validation:{verdict:{expected:c.expected.validation.verdict,applicability:'APPLICABLE',rationale:c.rationale},dimensions:Object.fromEntries(validationFields.map(f=>{const label=c.expected.validation.dimensions[f];return[f,{expected:label,applicability:label==='NOT_APPLICABLE'?'NOT_APPLICABLE':label==='INCONCLUSIVE'?'APPLICABLE_EVIDENCE_INSUFFICIENT':'APPLICABLE',rationale:`${dimensionWhy[f]} Neste caso: ${c.rationale}`}];}))}}));
