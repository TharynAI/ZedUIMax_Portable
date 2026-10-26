/* START> Tharyn | ZedUIMax
    2026-09-18
    What: Isolated title-selection and lifecycle regression tests.
    Why: Reconnects, shared workspaces, and subagents must not rename the wrong terminal.
    Expected: Windows Node runs these tests without starting a CLI, Tower, or Remote.
*/
import assert from 'node:assert/strict';
import test from 'node:test';
import { createTitleController, MAX_TITLE_CHARS, sanitizeTitle, selectSessionTitle } from './session-title.mjs';

const NOW = 1_800_000_000_000;
const ID = '86ebe98a-88dd-4b40-a9b5-ec34cb0dca8f';
const identity = { provider: 'codex', sessionId: ID, machine: 'EchoBox', product: 'codex' };
function agent(overrides = {}) {
  return { ...identity, agentId: 'codex-fixture', name: 'Flint - ZedUIMax', tier: 'interactive',
    parentAgentId: null, status: 'active', endedAt: null, cwd: 'E:\\ZedBang\\Projects', ...overrides };
}
function snapshot(agents = [agent()], overrides = {}) {
  return { protocolVersion: 1, hubGeneration: 'hg_fixture', generatedAt: NOW, agents, ...overrides };
}
function resolve(value = snapshot(), who = identity, options = {}) {
  return selectSessionTitle(value, who, { now: NOW, ...options });
}
function controller(options = {}) {
  const writes = [], warnings = [];
  const value = createTitleController({ identity, writeTitle: title => writes.push(title),
    onWarning: warning => warnings.push(warning), ...options });
  return { value, writes, warnings };
}

test('sanitizes controls, bidi, hidden formatting, whitespace and isolated surrogates', () => {
  assert.equal(sanitizeTitle('  Fl\u202eint\u200b\t-\nZed\x1b\x07Cache\ud800  '), 'Flint - ZedCache');
  assert.equal(sanitizeTitle('\x1b\x07\u2066\ufe0f'), '');
  assert.equal(sanitizeTitle(null), '');
  const title = sanitizeTitle('🚀'.repeat(300));
  assert.equal([...title].length, MAX_TITLE_CHARS);
  assert.equal(title, '🚀'.repeat(MAX_TITLE_CHARS));
  assert.equal(sanitizeTitle('a'.repeat(239) + ' b'), 'a'.repeat(239) + 'b');
});

test('resolves one exact primary among concurrent same-workspace sessions', () => {
  const others = Array.from({ length: 12 }, (_, i) => agent({
    sessionId: `11111111-2222-3333-4444-${String(i).padStart(12, '0')}`, name: 'Other',
  }));
  assert.equal(resolve(snapshot([...others, agent()])).title, 'Flint - ZedUIMax');
});

test('never falls back to a UUID prefix, another machine/provider/product or historical name', () => {
  assert.equal(resolve(snapshot(), { ...identity, sessionId: ID.slice(0, 8) }).reason, 'invalid_identity');
  for (const changed of [{ machine: 'Other' }, { provider: 'claude-code' }, { sessionId: ID.replace('86eb', 'ffff') }]) {
    assert.equal(resolve(snapshot([agent(changed)])).reason, 'not_registered');
  }
  assert.equal(resolve(snapshot([agent({ product: 'cursx' })])).reason, 'product_mismatch');
  assert.equal(resolve(snapshot([], { agentNames: { 'codex-fixture': 'Flint' } })).reason, 'not_registered');
});

test('supports Claude primary UUID identity without forcing a Codex product', () => {
  const claude = { provider: 'claude-code', sessionId: ID, machine: 'EchoBox' };
  assert.equal(resolve(snapshot([agent({ ...claude, product: 'claude2' })]), claude).ok, true);
});

test('rejects duplicate identity even when one candidate is stale or another product', () => {
  assert.equal(resolve(snapshot([agent(), agent({ status: 'stale' })])).reason, 'ambiguous_identity');
  assert.equal(resolve(snapshot([agent(), agent({ product: 'cursx' })])).reason, 'ambiguous_identity');
});

test('rejects subagent/background/malformed ownership and ended/stale state', () => {
  for (const changed of [{ parentAgentId: 'parent' }, { parentAgentId: undefined }, { tier: 'background' }]) {
    assert.equal(resolve(snapshot([agent(changed)])).reason, 'not_primary_terminal');
  }
  for (const changed of [{ status: 'ended' }, { status: 'stale' }, { endedAt: NOW }, { endedAt: undefined }]) {
    assert.equal(resolve(snapshot([agent(changed)])).reason, 'session_not_live');
  }
  for (const status of ['active', 'idle', 'blocked', 'awaiting-user']) {
    assert.equal(resolve(snapshot([agent({ status })])).ok, true);
  }
});

test('malformed, stale, future-dated, unsupported snapshots and clock policies fail closed', () => {
  for (const value of [null, {}, snapshot([], { protocolVersion: 2 }), snapshot([], { generatedAt: NaN }),
    snapshot([], { hubGeneration: '' }), snapshot([], { agents: {} })]) {
    assert.equal(resolve(value).reason, 'invalid_snapshot');
  }
  assert.equal(resolve(snapshot([], { generatedAt: NOW - 60_001 })).reason, 'stale_snapshot');
  assert.equal(resolve(snapshot([], { generatedAt: NOW + 5_001 })).reason, 'stale_snapshot');
  assert.equal(resolve(snapshot(), identity, { maxAgeMs: Infinity }).reason, 'invalid_clock_policy');
  assert.equal(resolve(snapshot([agent({ name: '\x07\u200b' })])).reason, 'empty_title');
  assert.equal(resolve(snapshot([agent({ agentId: '' })])).reason, 'invalid_agent');
});

test('writes on connect, rename and hub-generation change; not on unrelated updates', () => {
  const { value, writes } = controller();
  assert.equal(value.update(snapshot(), NOW).changed, true);
  assert.equal(value.update(snapshot([agent({ status: 'idle' })]), NOW).changed, false);
  assert.equal(value.update(snapshot([agent({ name: 'Flint - New' })]), NOW).changed, true);
  assert.equal(value.update(snapshot([agent({ name: 'Flint - New' })], { hubGeneration: 'hg_restarted' }), NOW).changed, true);
  assert.deepEqual(writes, ['Flint - ZedUIMax', 'Flint - New', 'Flint - New']);
});

test('outage leaves last title alone, deduplicates warnings and reapplies on reattachment', () => {
  const { value, writes, warnings } = controller();
  value.update(snapshot(), NOW);
  value.unavailable();
  value.unavailable();
  assert.deepEqual(writes, ['Flint - ZedUIMax']);
  assert.deepEqual(warnings, ['snapshot_unavailable']);
  value.update(snapshot(), NOW);
  assert.deepEqual(writes, ['Flint - ZedUIMax', 'Flint - ZedUIMax']);
  assert.deepEqual(warnings, ['snapshot_unavailable', null]);
});

test('stale snapshots trigger warning without clearing the title; recovery reapplies', () => {
  const { value, writes, warnings } = controller();
  value.update(snapshot(), NOW);
  value.update(snapshot(), NOW + 60_001);
  assert.equal(writes.length, 1);
  assert.deepEqual(warnings, ['stale_snapshot']);
  value.update(snapshot(undefined, { generatedAt: NOW + 60_002 }), NOW + 60_002);
  assert.equal(writes.length, 2);
  assert.deepEqual(warnings, ['stale_snapshot', null]);
});

test('writer failure retries, while warning-consumer exceptions cannot interrupt the CLI', () => {
  let attempts = 0;
  const { value, warnings } = controller({ writeTitle() {
    attempts++;
    if (attempts === 1) throw new Error('fixture failure');
  } });
  assert.equal(value.update(snapshot(), NOW).reason, 'title_write_failed');
  assert.equal(value.update(snapshot(), NOW).changed, true);
  assert.equal(attempts, 2);
  assert.deepEqual(warnings, ['title_write_failed', null]);
  const brokenWarning = controller({ onWarning() { throw new Error('fixture failure'); } });
  assert.doesNotThrow(() => brokenWarning.value.unavailable());
  assert.equal(brokenWarning.value.update(snapshot(), NOW).ok, true);
});

test('invalid identities are rejected and caller mutation cannot retarget the controller', () => {
  assert.throws(() => createTitleController({ identity: {}, writeTitle() {} }), TypeError);
  assert.throws(() => createTitleController({ identity, writeTitle: null }), TypeError);
  const supplied = { ...identity };
  const { value, writes } = controller({ identity: supplied });
  supplied.sessionId = '11111111-2222-3333-4444-555555555555';
  value.update(snapshot(), NOW);
  assert.deepEqual(writes, ['Flint - ZedUIMax']);
});
// <END Tharyn | ZedUIMax
