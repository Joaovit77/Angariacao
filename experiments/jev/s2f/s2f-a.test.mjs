import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { resolve, join } from 'node:path';
import { matrix, oracle, pairs, symmetry, requests, plannedStages, calculateCalls, budgetProjection, denominatorRules, caseById, inputProjection, changedPaths, sha, decisionFields, validationFields } from './design.mjs';
import { buildRequestV2 } from '../v2/request-v2.mjs';
import { verifyHistory } from '../s2e/core.mjs';
import { parseTypedResponseWithDiagnostics as wrap } from '../v2/probability-diagnostics/probability-diagnostics.mjs';
import { probabilityFixtures } from '../v2/probability-diagnostics/probability-fixtures.mjs';

const here=fileURLToPath(new URL('.',import.meta.url)),repo=resolve(here,'../../..'),json=name=>JSON.parse(readFileSync(join(here,name),'utf8'));
function normalized(stage){const e=caseById(stage.scenario_id).expected[stage.stage];
 if(stage.stage==='decision')return{...structuredClone(e),relevant_current_facts:[...e.relevant_current_facts.required],relevant_historical_facts:[...e.relevant_historical_facts.required],applicable_protocols:[...e.applicable_protocols.required],confidence:.9};
 return{...structuredClone(e),reasons:validationFields.filter(f=>e.dimensions[f]==='FAIL'),confidence:.9};
}
const complete=()=>plannedStages.map(s=>({stage_id:s.stage_id,structural_status:'STRUCTURALLY_VALID',result:normalized(s)}));

test('nove casos, cinco pares mínimos e um controle direcional explicitamente diferente',()=>{
 assert.equal(matrix.length,9);assert.equal(new Set(matrix.map(c=>c.case_id)).size,9);assert.equal(pairs.length,5);
 assert.equal(symmetry.kind,'DIRECTIONAL_CONTROL_NOT_SINGLE_FIELD_PAIR');
 assert.deepEqual(changedPaths(caseById('E1').input,caseById('E3').input).sort(),symmetry.changed.sort());
});
for(const p of pairs)test(`par mínimo auditável ${p.pair_id}`,()=>{
 assert.deepEqual(changedPaths(inputProjection(caseById(p.left),p.scope),inputProjection(caseById(p.right),p.scope)),p.allowed_input_differences);
});
test('pares de candidata têm DECISION idêntica e nenhuma exposição extra',()=>{
 for(const[left,right]of[['T1','T2'],['E1','E2'],['P1','P2']]){
  assert.deepEqual(buildRequestV2(caseById(left),'decision'),buildRequestV2(caseById(right),'decision'));
  const r=requests.find(r=>r.stage==='decision'&&r.scenario_aliases.includes(left));assert.ok(r.scenario_aliases.includes(right));assert.equal(plannedStages.filter(s=>s.request_id===r.request_id).length,2);
 }
});
test('controle positivo correto/parcial: três APPROVE com seis exposições futuras',()=>{
 for(const id of['T2','E2','P2'])assert.equal(caseById(id).expected.validation.verdict,'APPROVE');
 const v=plannedStages.filter(s=>s.stage==='validation');assert.equal(v.length,14);assert.equal(v.filter(s=>caseById(s.scenario_id).expected.validation.verdict==='APPROVE').length,6);
 assert.equal(caseById('P2').expected.validation.dimensions.partial_answer_allowed,'PASS');assert.equal(caseById('P2').expected.validation.dimensions.protocol,'NOT_APPLICABLE');
});
test('false reject agora tem denominador seis e não é compensado por negativos corretos',()=>{
 const rows=complete(),positive=rows.find(r=>plannedStages.find(s=>s.stage_id===r.stage_id).scenario_id==='P2'&&plannedStages.find(s=>s.stage_id===r.stage_id).stage==='validation');
 positive.result.verdict='REJECT';const d=denominatorRules(rows);assert.equal(d.false_reject_denominator,6);assert.equal(d.false_reject_rate.numerator,1);assert.equal(d.false_reject_rate.value,1/6);assert.equal(d.false_accept_rate.numerator,0);assert.equal(d.false_accept_denominator,8);
});
test('false accept permanece eixo separado, sem maioria ou compensação',()=>{
 const rows=complete(),negative=rows.find(r=>plannedStages.find(s=>s.stage_id===r.stage_id).scenario_id==='E3');negative.result.verdict='APPROVE';
 const d=denominatorRules(rows);assert.equal(d.false_accept_rate.numerator,1);assert.equal(d.false_accept_rate.denominator,8);assert.equal(d.false_reject_rate.numerator,0);
});
test('temporal separa atual/superado de histórico necessário não superado',()=>{
 assert.equal(caseById('T1').expected.validation.dimensions.temporal,'FAIL');assert.equal(caseById('T2').expected.validation.dimensions.temporal,'PASS');
 for(const id of['T1','T2']){const e=caseById(id).expected.decision;assert.ok(e.temporal_resolution.includes('SUPERSEDED_FACT'));assert.ok(e.temporal_resolution.includes('HISTORICAL_SUPPORT_REQUIRED'));assert.deepEqual(e.relevant_historical_facts.required,['f-t-historico-A']);}
 const h=caseById('H1');assert.equal(h.input.property_context.current_facts[0].value,null);assert.ok(h.expected.decision.temporal_resolution.includes('UNKNOWN_CURRENT_STATE'));assert.equal(h.expected.decision.temporal_resolution.includes('SUPERSEDED_FACT'),false);assert.equal(h.expected.decision.enough_context,true);
});
test('transferência nos dois sentidos não implica erro temporal',()=>{
 for(const id of['E1','E3']){const d=caseById(id).expected.validation.dimensions;for(const f of['entity','cross_entity','grounding','factuality'])assert.equal(d[f],'FAIL');assert.equal(d.temporal,'PASS');assert.equal(d.safety,'PASS');}
 assert.equal(caseById('E3').input.property_context.selected_entity,'imovel-B');assert.equal(caseById('E3').input.candidate_answer,'O valor atual do Imóvel B é 1800.');
});
test('riscos são previstos antes da candidata e têm controle explícito de fonte única',()=>{
 assert.deepEqual(caseById('T1').expected.decision.prohibited_assumptions,['HISTORICAL_AS_CURRENT']);assert.deepEqual(caseById('E1').expected.decision.prohibited_assumptions,['CROSS_ENTITY']);assert.deepEqual(caseById('P1').expected.decision.prohibited_assumptions,['INVENT_COMMERCIAL']);
 assert.deepEqual(caseById('P1').expected.decision,caseById('P2').expected.decision);assert.deepEqual(caseById('E4').expected.decision.prohibited_assumptions,[]);assert.deepEqual(caseById('E4').expected.decision.missing_information,[]);assert.deepEqual(caseById('H1').expected.decision.missing_information,['CURRENT_VAGAS']);
});
test('invenção e parcial preservam fato conhecido, factuality e permissibilidade independentes',()=>{
 const bad=caseById('P1'),good=caseById('P2');assert.ok(bad.input.candidate_answer.includes('1800'));assert.ok(good.input.candidate_answer.includes('1800'));assert.equal(bad.expected.validation.verdict,'REJECT');assert.equal(good.expected.validation.verdict,'APPROVE');
 assert.equal(bad.expected.validation.dimensions.factuality,'INCONCLUSIVE');for(const c of[bad,good])assert.equal(c.expected.validation.dimensions.partial_answer_allowed,'PASS');assert.equal(bad.expected.validation.dimensions.temporal,'PASS');
});
test('cada campo/dimensão tem expected, aplicabilidade e justificativa, sem probabilidades golden',()=>{
 for(const c of oracle){assert.deepEqual(Object.keys(c.decision),decisionFields);assert.deepEqual(Object.keys(c.validation.dimensions),validationFields);for(const d of[...Object.values(c.decision),c.validation.verdict,...Object.values(c.validation.dimensions)]){assert.ok(Object.hasOwn(d,'expected'));assert.ok(d.applicability);assert.ok(d.rationale.length>30);}
  for(const d of Object.values(c.validation.dimensions))assert.ok(['PASS','FAIL','INCONCLUSIVE','NOT_APPLICABLE'].includes(d.expected));
 }
 assert.equal(/"(?:probabilities|confidence|expected_probability_values)"\s*:/.test(JSON.stringify(oracle)),false);
});
test('oracle/expected/rationale não entram no payload; candidate somente em VALIDATION',()=>{
 for(const r of requests){const c=caseById(r.scenario_id);assert.deepEqual(r.request,buildRequestV2(c,r.stage));assert.equal(/"(?:expected|oracle|golden|rationale|scenario_id|case_id)"\s*:/.test(r.body),false);assert.equal(Object.hasOwn(r.request.state,'candidate_answer'),r.stage==='validation');assert.equal(r.body.includes(c.input.candidate_answer),r.stage==='validation');assert.equal(r.body.includes(c.case_id),false);}
});
test('nenhum dado pessoal/referência real nos casos e requests',()=>{
 const text=JSON.stringify(matrix.map(c=>c.input));assert.equal(/\+55\d|\bLD-\d|\bCPF\b|[\w.+-]+@[\w.-]+\.\w+|\bRua\s+|\bAvenida\s+/i.test(text),false);for(const c of matrix)assert.equal(c.source,'SYNTHETIC');
});
test('stress usa 2/3/4 opções, doze ou mais perguntas e NOT_APPLICABLE legítimo, sem alterar rubricas',()=>{
 const counts=new Set();for(const r of requests){assert.ok(Object.keys(r.request.questions).length>=12);for(const q of Object.values(r.request.questions))counts.add(Object.keys(q.criteria).length);assert.equal(sha(r.request),r.request_sha256);}
 assert.deepEqual([...counts].sort(),[2,3,4]);assert.equal(caseById('P1').expected.validation.dimensions.protocol,'FAIL');assert.equal(caseById('P2').expected.validation.dimensions.protocol,'NOT_APPLICABLE');
});
test('empate legítimo continua aceito pelo parser congelado, sem impor vetor a chamadas futuras',()=>{
 const fixture=probabilityFixtures().find(f=>f.id==='TIE_CHOOSE_SECOND');const p=wrap(fixture.raw,fixture.request);assert.equal(p.parsed.status,'COMPLETED');assert.deepEqual(p.parsed.answers.q.probabilities,fixture.raw.answers.q.probabilities);assert.equal(p.parsed.answers.q.choice,'B');
});
test('os dois defeitos reais S2-E continuam inválidos com subcódigos e números preservados',()=>{
 const observed=json('s2e-observed-facts.json');assert.equal(observed.defects.length,2);
 for(const d of observed.defects){const req={model:'jev-1.14.0',questions:{q:{type:'choice',criteria:Object.fromEntries(Object.keys(d.probabilities).map(k=>[k,null]))}}};
  const raw=JSON.stringify({model:'jev-1.14.0',answers:{q:{type:'choice',choice:d.choice,confidence:.5,probabilities:d.probabilities}}});const p=wrap(raw,req);assert.equal(p.parsed.error.code,'INVALID_PROBABILITIES');assert.equal(p.diagnostic.error_code,d.subcode);assert.equal(p.diagnostic.sum,d.sum);
 }
 assert.equal(observed.defects[0].sum,.9900000000000001);assert.equal(observed.defects[0].sum_delta_from_1,-.009999999999999898);assert.deepEqual(observed.confidence_priorities.map(q=>q.confidence),[.93,.94,.94]);
});
test('calculadora de chamadas deduplica aliases e mantém plano exato de 24, sem retry',()=>{
 assert.equal(requests.length,12);assert.equal(calculateCalls(),24);assert.equal(calculateCalls([...requests,...requests]),24);assert.equal(calculateCalls(requests,1),12);assert.throws(()=>calculateCalls(requests,0));assert.equal(new Set(plannedStages.map(s=>s.stage_id)).size,24);
 assert.equal(plannedStages.filter(s=>s.stage==='decision').length,10);assert.equal(plannedStages.filter(s=>s.stage==='validation').length,14);
 for(const r of requests){const rows=plannedStages.filter(s=>s.request_id===r.request_id);assert.deepEqual(rows.map(s=>s.repetition),[1,2]);assert.ok(rows.every(s=>s.request_sha256===r.request_sha256));}
});
for(const[calls,average,reserve]of[[12,.001149372,.033030144],[16,.001532496,.044040192],[20,.001915620,.055050240],[24,.002298744,.066060288]])test(`custo histórico para ${calls} chamadas, sem autorização automática`,()=>{
 const p=budgetProjection(calls);assert.equal(p.estimated_average_cost_usd,average);assert.equal(p.conservative_reserved_cost_usd,reserve);assert.equal(p.price_status,'HISTORICAL_REFERENCE_ONLY');assert.equal(p.budget_authorized,false);
});
test('cálculo financeiro rejeita entradas inseguras e arredonda reserva média para cima',()=>{
 for(const n of[0,-1,NaN,Infinity,1.5,Number.MAX_SAFE_INTEGER])assert.throws(()=>budgetProjection(n));assert.throws(()=>budgetProjection(1,10,0));assert.throws(()=>budgetProjection(1,10,1,-1));assert.equal(budgetProjection(1,1,3,1).estimated_average_cost_usd,1e-9);assert.ok(budgetProjection(20).conservative_reserved_cost_usd>.05);assert.ok(budgetProjection(24).conservative_reserved_cost_usd>.05);
});
test('denominadores são chamadas válidas, não casos, aliases ou plano não recebido',()=>{
 const d=denominatorRules(complete());assert.equal(d.planned,24);assert.equal(d.decision,10);assert.equal(d.validation,14);assert.equal(d.false_reject_denominator,6);assert.equal(d.false_accept_denominator,8);assert.equal(d.action_accuracy.numerator,10);assert.equal(d.decision_completeness.numerator,10);
 assert.equal(denominatorRules([]).false_reject_rate.value,null);assert.throws(()=>denominatorRules([{stage_id:'historico'}]));assert.throws(()=>denominatorRules([complete()[0],complete()[0]]));
});
test('invalid probability, operational, resultado parcial e confidence ausente não recebem crédito semântico',()=>{
 const all=complete();for(const r of all.filter(r=>plannedStages.find(s=>s.stage_id===r.stage_id).stage==='validation'&&caseById(plannedStages.find(s=>s.stage_id===r.stage_id).scenario_id).expected.validation.verdict==='APPROVE')){r.structural_status='INVALID_PROBABILITIES';r.result=null;}
 const d=denominatorRules(all);assert.equal(d.false_reject_denominator,0);assert.equal(d.false_reject_rate.value,null);assert.equal(d.validation,8);
 for(const mutate of[r=>delete r.confidence,r=>delete r.intent,r=>r.confidence=NaN]){const rows=complete();mutate(rows[0].result);assert.equal(denominatorRules(rows).decision,9);}
});
test('action correta não compensa campo de risco omitido',()=>{
 const rows=complete();rows[0].result.prohibited_assumptions=[];const d=denominatorRules(rows);assert.equal(d.action_accuracy.value,1);assert.equal(d.decision_completeness.value,.9);
});
test('questões de investigação e riscos declaram limite causal e gate humano',()=>{
 const q=json('investigation-map.json');assert.equal(q.length,12);assert.equal(q.find(q=>q.id==='Q4').scope_limit,'DESCRIPTIVE_ONLY_NOT_CAUSAL');
 const risk=json('risk-register.json');for(const code of['MODEL_MISMATCH','OPERATIONAL_ERROR','STRUCTURAL_UNKNOWN','PRIVACY_BREACH','RAW_PERSISTED','BUDGET_VIOLATION','RETRY_ATTEMPT'])assert.ok(risk.future_hard_stops.includes(code));assert.equal(risk.current_execution.authorization,false);
});
test('JSONs gerados refletem fontes novos, sem criar run real ou autoridade de execução',()=>{
 assert.equal(json('diagnostic-matrix.json').cases.length,9);assert.deepEqual(json('oracle-mini.json').cases,oracle);const p=json('requests-plan.json');assert.equal(p.authorized,false);assert.equal(p.executed_calls,0);assert.equal(p.no_real_run_created,true);assert.equal(p.unique_requests,12);assert.equal(p.recommended_calls,24);assert.deepEqual(p.stages,plannedStages);
 for(const r of p.requests)assert.equal(sha(r.request),r.request_sha256);assert.equal(existsSync(join(here,'runner.mjs')),false);assert.equal(existsSync(join(here,'execution.lock')),false);
});
test('fontes novos não oferecem rede, ambiente, secrets ou entrada de execução real',()=>{
 for(const f of['design.mjs','generate.mjs']){const source=readFileSync(join(here,f),'utf8');assert.equal(/\bfetch\s*\(|process\.env|parseEnv|\.env\.local|Angario_teste|Bearer|node:(?:http|https|net|tls|dns)|execute-authorized/.test(source),false,f);}
});
test('históricos S0 até S2-E, runs, freezes e locks permanecem byte a byte',async()=>{
 const before=json('preservation-before.json');await verifyHistory(repo,before);
 for(const[p,expected]of Object.entries(before.lists)){const walk=path=>readdirSync(join(repo,path),{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(`${path}/${e.name}`):[`${path}/${e.name}`]);assert.deepEqual(walk(p).sort(),expected);}
});
test('freeze próprio confere fontes/artefatos quando presente',()=>{
 if(!existsSync(join(here,'freeze.json')))return;for(const[f,d]of Object.entries(json('freeze.json').files))assert.equal(sha(readFileSync(join(here,f))),d,f);
});
