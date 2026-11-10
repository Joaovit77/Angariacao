import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { parseEnv } from 'node:util';
import { fileURLToPath } from 'node:url';
import { join, dirname, resolve } from 'node:path';
import { cases } from './cases.mjs';
import { model, endpoint, datasetHash, digest, buildRequest, parseResponse, normalize, summarize } from './harness.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const real = args.includes('--real');
const option = name => args[args.indexOf(name) + 1];
if (!real && args.some(a => a !== '--prepare')) throw new Error('Use --prepare ou --real com --env-file e --key-variable explícitos.');
if (real && (!args.includes('--env-file') || !args.includes('--key-variable'))) throw new Error('Origem da chave precisa ser explícita.');
const runId = `${real ? 'real' : 'prepare'}-${Date.now()}`;
const destination = join(root, 'results', runId);
await mkdir(destination, { recursive: true });
const save = (name, value) => writeFile(join(destination, name), `${JSON.stringify(value, null, 2)}\n`, { flag: 'wx' });
const requests = cases.flatMap(c => ['decision', 'validation'].map(stage => ({ case_id: c.case_id, stage, request: buildRequest(c, stage) })));
await save('baseline.json', { dataset_hash: datasetHash, cases });
await save('requests.json', requests);
await save('manifest.json', { checkpoint: 'JEV-S0', model, endpoint, dataset_hash: datasetHash, requests_hash: digest(requests), planned_cases: 10, max_calls: 20, timeout_ms: 30000, retries: 0, real, frozen_before_inference: true });
const records = [];
if (real) {
  // Leitura explícita e exclusiva: nenhuma variável do produto é carregada no processo.
  const variable = option('--key-variable');
  if (!['JEV_API_KEY', 'TYPESAFE_API_KEY', 'TYPESAFE_AI_API_KEY', 'Angario_teste'].includes(variable)) throw new Error('variavel-nao-autorizada');
  const values = parseEnv(await readFile(resolve(option('--env-file')), 'utf8'));
  const key = values[variable];
  if (!key || key.trim() !== key || /\s/.test(key)) throw new Error('chave-ausente-ou-invalida');
  for (const { case_id, stage, request } of requests) {
    const started = performance.now();
    const record = { case_id, stage, timestamp: new Date().toISOString(), model_requested: model, model: null, latency_ms: null, usage: null, result: null, error: null };
    try {
      const response = await fetch(endpoint, { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify(request), redirect: 'error', signal: AbortSignal.timeout(30000) });
      if (!response.ok) {
        // Nunca ler/persistir corpo de erro ou headers de autenticação.
        record.error = { code: 'http-error', status: response.status };
        await response.body?.cancel();
      } else {
        const body = await response.json();
        const parsed = parseResponse(body, request);
        record.model = parsed.model;
        record.usage = parsed.usage;
        record.result = normalize(cases.find(c => c.case_id === case_id), stage, parsed);
        await save(`response-${case_id}-${stage}.json`, parsed);
      }
    } catch (error) {
      record.error = { code: error?.name === 'TimeoutError' ? 'timeout' : error?.message === 'resposta-estrutural-invalida' ? 'invalid-structure' : error instanceof SyntaxError ? 'invalid-json' : 'transport-or-local-error' };
    }
    record.latency_ms = Math.round((performance.now() - started) * 100) / 100;
    records.push(record);
    await save(`record-${case_id}-${stage}.json`, record);
    console.log(`${case_id} ${stage}: ${record.error ? record.error.code : record.result.action ?? record.result.verdict} (${record.latency_ms} ms)`);
    // Falha operacional encerra o lote, sem repetição paga nem avalanche de erros.
    if (record.error) break;
  }
}
await save('errors.json', records.filter(r => r.error));
await save('records.json', records);
const summary = summarize(records);
await save('summary.json', summary);
await save('metrics.json', summary.metrics);
console.log(JSON.stringify({ real, destination, attempted_calls: records.length, completed_cases: summary.completed_cases, errors: summary.operational_errors }));
