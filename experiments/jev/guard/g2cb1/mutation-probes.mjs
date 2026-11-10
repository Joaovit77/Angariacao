// Mutantes em cópias dos artefatos, sem modificar históricos ou classificar candidatas.
import assert from 'node:assert/strict';
import {loadDocuments,validateDocuments} from './document-audit.mjs';
const rule=(key,value)=>d=>{d.design.rules[key]=value;};
export const probes=[
  ['M01','Usar oracle como input',rule('oracle_as_input',true)],
  ['M02','Usar rationale como input',rule('rationale_as_input',true)],
  ['M03','Expected verdict gera obrigação',rule('expected_generates_obligation',true)],
  ['M04','Regex específica GG29',rule('exact_gg29_regex',true)],
  ['M05','UNCONFIRMED global',rule('global_unconfirmed_caveat',true)],
  ['M06','Anotação humana vira observação automática',rule('annotation_is_automatic',true)],
  ['M07','Não encontrado equivale a ausente',rule('not_found_means_absent',true)],
  ['M08','Completeness sem enumerar claims',rule('completeness_requires_claim_enumeration',false)],
  ['M09','Caveat missing sem inspeção completa',rule('caveat_missing_requires_full_inspection',false)],
  ['M10','Aceitar claim sem binding',rule('claim_requires_source_binding',false)],
  ['M11','REJECT por falta de prova',rule('reject_for_missing_proof',true)],
  ['M12','APPROVE por falta de contradição',rule('approve_for_no_contradiction',true)],
  ['M13','HOLD como acerto semântico',rule('hold_is_semantic_success',true)],
  ['M14','Esconder false block em HOLD',rule('hold_false_block_hidden',true)],
  ['M15','Outro LLM como determinístico',rule('other_llm_is_deterministic',true)],
  ['M16','Autoatestação do provider',rule('provider_self_attestation',true)],
  ['M17','Reclassificar históricos',rule('historical_reclassification',true)],
  ['M18','Abrir autorização de chamadas',rule('calls_authorized',1)],
  ['M19','Alterar prompt operacional',rule('operational_prompt_change',true)],
  ['M20','Promover só por menor custo',rule('cost_alone_promotes_architecture',true)],
  ['M21','Codex se declara revisor humano',d=>{d.sources.doc_author_is_human_reviewer=true;}],
  ['M22','Renderer certifica texto livre antigo',rule('controlled_renderer_certifies_old_free_text',true)],
  ['M23','Cobertura de caracteres prova completude semântica',rule('character_coverage_proves_semantic_completeness',true)],
  ['M24','Alterar matriz B0 na referência',d=>{d.design.b0_matrix_reference.changed=true;}],
  ['M25','Inventar métrica sem execução',d=>{d.design.metrics.accuracy={value:1,status:'MEASURED'};}],
  ['M26','Executar validação cega sem novo gate',d=>{d.design.execution.blind_validation_started=true;}],
];
export function executeMutations() {
  const docs=loadDocuments(),baseline=validateDocuments(docs);
  const results=probes.map(([id,description,mutate])=>{
    const copy=structuredClone(docs);mutate(copy);
    let caught=null;
    try{validateDocuments(copy);}catch(error){caught=error;}
    assert.ok(caught,`MUTANTE_SOBREVIVENTE:${id}`);
    return {id,description,status:'EXECUTED',baseline:baseline.status,result:'REJECTED_DOCUMENTARY_MUTATION',assertion:caught.message.split('\n')[0],semantic_detection_test:false};
  });
  return {scope:'DOCUMENTARY_CONSISTENCY_MUTATIONS_ONLY',baseline,executed:results.length,rejected:results.length,survived:0,planned:0,results};
}
