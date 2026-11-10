import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdir } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { atomicJson, verifyFrozen, guardBudget, budgetOf, contextGate, runCampaign, claimAuthorization } from './core.mjs';
import { createLedger } from '../v2/adapter-run-v2.mjs';
import { wireFixture, fixtureCase } from '../v2/adapter-fixtures-v2.mjs';
import { buildRequestV2 } from '../v2/request-v2.mjs';
const here = dirname(fileURLToPath(import.meta.url));
const v2 = join(here, '../v2'), results = join(here, '../results');
const plan = JSON.parse(await readFile(join(v2, 'planned-run-v2.json'), 'utf8'));
const pricing = JSON.parse(await readFile(join(here, 'pricing-verified.json'), 'utf8'));
const folder = async () => { const path = join(results, `s2b-offline-${randomUUID()}`); await mkdir(path); return path; };

test('escrita atômica real preserva snapshot anterior em falha antes do rename', async () => {
  const dir = await folder(), path = join(dir, 'ledger.json');
  const ack = await atomicJson(path, { version: 1 }); assert.equal(ack.readback_verified, true);
  await assert.rejects(atomicJson(path, { version: 2 }, () => { throw new Error('queda-sintetica'); }));
  assert.deepEqual(JSON.parse(await readFile(path, 'utf8')), { version: 1 });
  await atomicJson(path, { version: 3 }); assert.deepEqual(JSON.parse(await readFile(path, 'utf8')), { version: 3 });
});
test('autorização persistente impede outro processo/run de reiniciar o orçamento', async () => {
  const dir = await folder(); await claimAuthorization(dir, 'run-original');
  await assert.rejects(claimAuthorization(dir, 'run-duplicado'), { code: 'EEXIST' });
  assert.equal(JSON.parse(await readFile(join(dir, 's2b-authorization.lock'), 'utf8')).run_id, 'run-original');
});
test('budget reserva limite documentado e bloqueia chamada 181, custo inseguro e usage desconhecido', () => {
  const ledger = createLedger('run-budget', plan), b = guardBudget(ledger);
  assert.ok(b.known_plus_remaining_worst_case_usd < 0.50);
  ledger.stages[0].attempt_id = 'run-budget-a001'; assert.throws(() => guardBudget(ledger));
  ledger.stages[0].record = { status: 'COMPLETED', usage_status: 'USAGE_PRESENT', usage: { input_tokens: 11900000, output_tokens: 0 } };
  assert.throws(() => guardBudget(ledger));
  for (const [i, s] of ledger.stages.entries()) { s.attempt_id = `run-budget-a${i}`; s.record = { status: 'COMPLETED', usage_status: 'USAGE_PRESENT', usage: { input_tokens: 0, output_tokens: 0 } }; }
  assert.equal(budgetOf(ledger).started_calls, 180); assert.throws(() => guardBudget(ledger));
});
test('contexto não é truncado nem enviado se não couber no filtro conservador', () => {
  assert.ok(contextGate(buildRequestV2(fixtureCase('V2-01'), 'decision')).body_bytes > 0);
  const request = buildRequestV2(fixtureCase('V2-01'), 'decision'); request.state.current_message = 'x'.repeat(64000);
  assert.throws(() => contextGate(request), /CONTEXT_UNCERTAIN_GATE/); assert.equal(request.state.current_message.length, 64000);
});
test('persistência IN_PROGRESS antecede envio simulado; hard gate para exatamente no primeiro false accept', async () => {
  const dir = await folder(); let sends = 0;
  const summary = await runCampaign({ directory: dir, runId: 'run-semantic', plan, pricing, hashes: await verifyFrozen(v2), send: async body => {
    const ledger = JSON.parse(await readFile(join(dir, 'ledger.json'), 'utf8'));
    assert.equal(ledger.stages[sends].status, 'IN_PROGRESS'); assert.ok(ledger.stages[sends].stage_id);
    const s = plan.schedule[sends++], c = fixtureCase(s.case_id);
    assert.equal(body, JSON.stringify(buildRequestV2(c, s.stage)));
    return { status: 200, text: JSON.stringify(wireFixture(c, s.stage)) };
  } });
  assert.equal(sends, 6); assert.equal(summary.halt_reason, 'HARD_GATE_SEMANTICO'); assert.equal(summary.budget.started_calls, 6);
  const ledger = JSON.parse(await readFile(join(dir, 'ledger.json'), 'utf8'));
  assert.equal(ledger.stages[6].status, 'NOT_STARTED'); assert.equal(ledger.status, 'HALTED');
});
test('falha operacional consome uma tentativa, sem retry, corpo bruto ou metadados privados', async () => {
  const dir = await folder(); let sends = 0;
  const summary = await runCampaign({ directory: dir, runId: 'run-http', plan, pricing, hashes: {}, send: async () => { sends++; return { status: 429, text: 'FAKE_SECRET_DO_NOT_LOG' }; } });
  assert.equal(sends, 1); assert.equal(summary.budget.failed_calls, 1); assert.equal(summary.budget.usage_unknown_calls, 1);
  assert.equal(summary.halt_reason, 'OPERATIONAL_ERROR');
  assert.equal((await readFile(join(dir, 'ledger.json'), 'utf8')).includes('FAKE_SECRET_DO_NOT_LOG'), false);
});
test('persistência quebrada antes do transporte impede qualquer envio', async () => {
  const dir = await folder(); let sends = 0, ledgerWrites = 0;
  const persist = async (path, value) => { if (path.endsWith('ledger.json') && ++ledgerWrites === 2) throw new Error('falha-sintetica'); return atomicJson(path, value); };
  const summary = await runCampaign({ directory: dir, runId: 'run-persistence', plan, pricing, hashes: {}, persistence: persist, send: async () => { sends++; } });
  assert.equal(sends, 0); assert.equal(summary.status, 'HOLD'); assert.equal(summary.halt_reason, 'PERSISTENCE_OR_LOCAL_GATE');
});
