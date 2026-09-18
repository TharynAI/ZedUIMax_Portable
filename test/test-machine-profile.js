const assert = require('assert');
const os = require('os');

const { createDefaultPortableConfig, normalizePortableConfig } = require('../dist/main/main/portable-config');
const { machineProfileKey } = require('../dist/main/shared/portable-config');
const { filterSessionsByMachine, projectsFromSessions } = require('../dist/main/main/session-store');

function session(overrides) {
  return {
    sessionId: 'codex:fixture',
    rawSessionId: 'fixture',
    providerId: 'codex',
    projectPath: 'E:\\ZedBang\\Projects',
    projectDisplay: 'E:\\ZedBang\\Projects',
    autoSummary: '',
    firstMessage: 'fixture',
    timestamp: new Date('2026-09-17T12:00:00Z'),
    messageCount: 1,
    cwd: 'E:\\ZedBang\\Projects',
    filePath: 'E:\\sessions\\fixture.jsonl',
    fileSize: 100,
    machineName: 'FIELD-A',
    machineId: null,
    ...overrides,
  };
}

const local = createDefaultPortableConfig().machine;
assert.strictEqual(local.machineName, os.hostname().trim() || 'Unknown machine');
assert.strictEqual(local.machineId, null);
const normalized = normalizePortableConfig({ machine: { machineName: 'STALE-NAME', machineId: 'device-1' } });
assert.strictEqual(normalized.machine.machineName, local.machineName, 'the trusted hostname refreshes from the OS');
assert.strictEqual(normalized.machine.machineId, 'device-1', 'the durable opaque machine id is retained');

const fieldA = session({ machineName: 'FIELD-A' });
const fieldB = session({
  sessionId: 'codex:fixture-b',
  rawSessionId: 'fixture-b',
  machineName: 'FIELD-B',
  machineId: 'device-b',
});
assert.deepStrictEqual(
  filterSessionsByMachine([fieldA, fieldB], machineProfileKey({ machineName: 'FIELD-B', machineId: 'device-b' })),
  [fieldB],
);

const projects = projectsFromSessions([fieldA, fieldB]);
assert.strictEqual(projects.length, 2, 'the same path on two machines must remain two projects');
assert.deepStrictEqual(projects.map((project) => project.machineName).sort(), ['FIELD-A', 'FIELD-B']);
assert(projects.every((project) => project.path === 'E:\\ZedBang\\Projects'));

console.log('machine profile tests passed');
