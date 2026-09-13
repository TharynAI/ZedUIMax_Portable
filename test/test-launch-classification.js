const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const compiledPath = path.join(root, 'dist', 'main', 'main', 'launch-classifier.js');
if (!fs.existsSync(compiledPath)) {
  throw new Error('launch classification test requires a compiled main process. Run npm run build:electron first.');
}

const { sanitizeClassificationInput, selectPendingCandidate } = require(compiledPath);

assert.deepEqual(
  sanitizeClassificationInput({ userSummary: '  Build   launcher metadata  ', type: '  App   Development  ' }),
  { userSummary: 'Build launcher metadata', type: 'App Development' },
);
assert.throws(
  () => sanitizeClassificationInput({ userSummary: 'A summary', type: '   ' }),
  /Category and summary are required/,
);

const record = {
  providerId: 'codex',
  product: 'cursx',
  workspace: 'E:\\ZedBang\\Projects',
  knownSessionIds: ['codex:old'],
  createdAt: '2026-09-12T20:00:00.000Z',
};
const candidates = [
  {
    sessionId: 'codex:old', providerId: 'codex', product: 'cursx',
    workspace: '/mnt/e/ZedBang/Projects', projectPath: 'old', timestamp: '2026-09-12T20:00:01.000Z',
  },
  {
    sessionId: 'codex:wrong-product', providerId: 'codex', product: 'codex',
    workspace: '/mnt/e/ZedBang/Projects', projectPath: 'wrong-product', timestamp: '2026-09-12T20:00:02.000Z',
  },
  {
    sessionId: 'codex:wrong-workspace', providerId: 'codex', product: 'cursx',
    workspace: 'E:\\Other', projectPath: 'wrong-workspace', timestamp: '2026-09-12T20:00:03.000Z',
  },
  {
    sessionId: 'codex:claimed', providerId: 'codex', product: 'cursx',
    workspace: '/mnt/e/ZedBang/Projects', projectPath: 'claimed', timestamp: '2026-09-12T20:00:04.000Z',
  },
  {
    sessionId: 'codex:new', providerId: 'codex', product: 'cursx',
    workspace: '/mnt/e/ZedBang/Projects', projectPath: 'new', timestamp: '2026-09-12T20:00:05.000Z',
  },
];

assert.equal(selectPendingCandidate(record, candidates, new Set(['codex:claimed'])).sessionId, 'codex:new');
assert.equal(selectPendingCandidate(record, candidates, new Set(['codex:claimed', 'codex:new'])), null);

console.log('launch classification matching tests passed');
