import { readFile, mkdir, readdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { parseEnv } from 'node:util';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join, relative, isAbsolute } from 'node:path';
import { verifyFrozen, runCampaign, atomicJson, claimAuthorization } from './core.mjs';

const here = dirname(fileURLToPath(import.meta.url)), repo = resolve(here, '../../..');
const args = process.argv.slice(2);
if (args.length !== 1 || args[0] !== '--execute-authorized-s2b') throw new Error('Use somente a execução S2-B expressamente autorizada.');
const hashes = await verifyFrozen(join(repo, 'experiments/jev/v2'));
const plan = JSON.parse(await readFile(join(repo, 'experiments/jev/v2/planned-run-v2.json'), 'utf8'));
const pricing = JSON.parse(await readFile(join(here, 'pricing-verified.json'), 'utf8'));
if (pricing.model !== 'jev-1.14.0' || pricing.input_usd_per_million !== 0.042 || pricing.output_usd_per_million !== 0 || pricing.maximum_request_tokens_for_reservation !== 65536) throw new Error('PRICING_GATE');
const text = await readFile(join(repo, 'web/.env.local'), 'utf8');
const matches = text.split(/\r?\n/).filter(line => /^\s*(?:export\s+)?Angario_teste\s*=/.test(line));
if (matches.length !== 1) throw new Error('KEY_MISSING_OR_AMBIGUOUS');
const key = parseEnv(matches[0]).Angario_teste;
if (!key || key.trim() !== key || /\s/.test(key)) throw new Error('KEY_INVALID');
const runId = `jev-s2b-${Date.now()}-${randomUUID().slice(0, 8)}`;
const root = join(repo, 'experiments/jev/results'), directory = join(root, `s2b-${runId}`), rel = relative(root, directory);
if (isAbsolute(rel) || rel.startsWith('..')) throw new Error('INVALID_RUN_DIRECTORY');
await claimAuthorization(root, runId);
await mkdir(directory, { recursive: false });
await atomicJson(join(directory, 'authorization.json'), { checkpoint: 'JEV-S2-B', human_authorization: true, max_calls: 180, model: 'jev-1.14.0', cap_usd: 0.50, certified_pretransport_tests: 65, retries: 0, concurrency: 1 });
const summary = await runCampaign({ directory, runId, plan, pricing, hashes,
  pause: () => new Promise(resolve => setTimeout(resolve, 1000)),
  send: async body => {
    const response = await fetch('https://api.typesafe.ai/v1/systemone', { method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body, redirect: 'error', signal: AbortSignal.timeout(30000) });
    if (!response.ok) { const status = response.status; await response.body?.cancel(); return { status }; }
    return { status: response.status, text: await response.text() };
  },
});
const artifacts = async path => (await Promise.all((await readdir(path, { withFileTypes: true })).map(entry => entry.isDirectory() ? artifacts(join(path, entry.name)) : [join(path, entry.name)]))).flat();
const files = await artifacts(directory);
if ((await Promise.all(files.map(async path => (await readFile(path, 'utf8')).includes(key)))).some(Boolean)) throw new Error('PRIVACY_GATE');
await atomicJson(join(directory, 'privacy-check.json'), { artifact_files_checked: files.length, exact_key_occurrences: 0, raw_response_persisted: false });
console.log(JSON.stringify({ run_id: runId, directory, status: summary.status, halt_reason: summary.halt_reason, started_calls: summary.budget.started_calls, completed_calls: summary.budget.completed_calls, failed_calls: summary.budget.failed_calls, known_cost_usd: summary.budget.known_cost_usd }));
