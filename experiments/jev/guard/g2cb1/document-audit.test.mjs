// Testes dos documentos; nenhum teste de interpretação semântica ou produto.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {here,repo,json,sha,loadDocuments,validateDocuments,verifyPreservation} from './document-audit.mjs';
import {probes,executeMutations} from './mutation-probes.mjs';
const docs=loadDocuments();
test('Baseline documental preserva escopo, fontes, UNKNOWN e métricas não medidas',()=>validateDocuments(docs));
for(const f of docs.families.families)test(`Família ${f.name}: vinte perguntas com fundamento e sem certificação`,()=>{
  assert.equal(f.answers.length,20);assert.equal(f.current_operational_certified,false);
  assert.ok(f.answers.every(a=>a.evidence_kind==='DOCUMENTARY_DESIGN_NOT_EXECUTED_CERTIFICATION'));
});
for(const [id,name,mutate] of probes)test(`${id}: ${name}`,()=>{
  validateDocuments(docs);const copy=structuredClone(docs);mutate(copy);assert.throws(()=>validateDocuments(copy));
});
test('Relatório de mutantes é reproduzível como teste documental',()=>{
  const result=executeMutations();assert.equal(result.executed,26);assert.equal(result.survived,0);assert.equal(result.planned,0);
});
test('36 referências correspondem aos inputs históricos sem nova annotation',()=>{
  const frozen=json(path.join(repo,'experiments/jev/guard/g2cb0/corpus-fixtures.json'));
  for(const [i,ref] of docs.cases.references.entries()) {
    assert.equal(ref.input_sha256,sha(JSON.stringify(frozen.fixtures[i].input_snapshot)));
    assert.equal(ref.case_id,frozen.fixtures[i].case_id);
    assert.equal(ref.existing_b0_fixture_reference,`experiments/jev/guard/g2cb0/corpus-fixtures.json#/fixtures/${i}`);
    assert.equal(ref.new_annotation_produced,false);
  }
});
test('Matriz REJECT × INCONCLUSIVE reusada por hash sem modificação',()=>{
  const r=docs.design.b0_matrix_reference;assert.equal(sha(fs.readFileSync(path.join(repo,r.path))),r.sha256);
});
test('551 históricos, 769 arquivos do produto e listas preservados',()=>verifyPreservation());
test('Recibo cobre leitura prévia e não alega revisão humana independente',()=>{
  const r=json(path.join(here,'source-reading-receipt.json'));
  assert.equal(r.files,190);assert.equal(r.bytes,4990347);assert.equal(r.inventory.length,190);
  assert.equal(r.independent_human_review_claimed,false);
  const prefix=json(path.join(here,'preservation-before.json')).propagation_prefix;
  for(const entry of r.inventory) {
    const bytes=fs.readFileSync(path.join(repo,entry.path));
    const original=entry.path==='PROPAGACAO_PENDENTE_TABELA_MESTRE_IA.md'?bytes.subarray(0,prefix.bytes):bytes;
    assert.equal(original.length,entry.bytes);assert.equal(sha(original),entry.sha256);
  }
});
test('Teste inteiro permaneceu sem tentativas de rede',()=>assert.equal(globalThis.__JEV_OFFLINE_NETWORK_ATTEMPTS,0));
