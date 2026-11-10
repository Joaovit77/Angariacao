import {readFile} from 'node:fs/promises';
import {join, dirname, resolve, relative} from 'node:path';
import {fileURLToPath} from 'node:url';
import assert from 'node:assert/strict';
import {benchmark, oracle} from '../g0/corpus.mjs';
import {sha} from '../g0/contract.mjs';
import {listArtifacts} from '../g2b/core.mjs';
import {RUN_ID} from './analysis.mjs';

export const here = dirname(fileURLToPath(import.meta.url));
export const repo = resolve(here, '../../../..');
export const json = async p => JSON.parse(await readFile(p, 'utf8'));
export async function loadEvidence() {
  const dir = join(repo, 'experiments/jev/results', RUN_ID);
  return {ledger: await json(join(dir, 'ledger.json')), summary: await json(join(dir, 'summary.json')),
    full: await json(join(dir, 'full-arm-metrics.json')), reduced: await json(join(dir, 'reduced-arm-metrics.json')),
    paired: await json(join(dir, 'paired-metrics.json')), authorization: await json(join(dir, 'authorization.json')),
    oracle: structuredClone(oracle), cases: structuredClone(benchmark)};
}
export async function verifyPreservation() {
  const before = await json(join(here, 'preservation-before.json'));
  for (const [p, h] of Object.entries({...before.files, ...before.product_files})) assert.equal(sha(await readFile(join(repo, p))), h, `HASH_HISTORICO: ${p}`);
  for (const [p, expected] of Object.entries(before.lists)) assert.deepEqual((await listArtifacts(join(repo, p))).map(f => relative(repo, f).replaceAll('\\', '/')).sort(), expected);
  const propagation = await readFile(join(repo, 'PROPAGACAO_PENDENTE_TABELA_MESTRE_IA.md'));
  assert.ok(propagation.length >= before.propagation_prefix.bytes);
  assert.equal(sha(propagation.subarray(0, before.propagation_prefix.bytes)), before.propagation_prefix.sha256);
  return {status: 'PASS', historical_files: Object.keys(before.files).length, product_files: Object.keys(before.product_files).length, namespace_lists: Object.keys(before.lists).length, propagation_prefix: before.propagation_prefix};
}
