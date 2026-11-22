/* START> Tharyn | ZedUIMax Startup Performance
   2026-11-22: Exercise the actual worker, list/project projections, and cache invalidation.
*/
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { performance } = require('node:perf_hooks');
const { app } = require('electron');

const root = path.resolve(__dirname, '..');
const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'zedui-library-'));
const real = process.argv.includes('--real');
const asar = process.argv.find(arg => arg.startsWith('--asar='))?.slice('--asar='.length);
const compiled = name => path.join(asar || root, 'dist', 'main', 'main', name + '.js');
process.env.ZEDUI_APP_ROOT = root;
process.env.ZEDUI_DATA_ROOT = fixture;
process.env.ZEDUI_ALLOW_EXTERNAL_DATA_ROOT = '1';
app.setPath('userData', path.join(fixture, 'userData'));

app.whenReady().then(async () => {
  const portable = require(compiled('portable-config'));
  const db = require(compiled('metadata-db'));
  const { loadSessionLibrary } = require(compiled('session-library'));
  const { getSessionDetails } = require(compiled('session-store'));
  const settings = path.join(fixture, 'settings.json');
  const read = (days = 30, providers, machine) => loadSessionLibrary('both', days, undefined, providers, machine);

  if (real) {
    const live = path.join(root, 'data');
    fs.copyFileSync(path.join(live, 'settings.json'), settings);
    const Database = require('better-sqlite3');
    const source = new Database(path.join(live, 'zedui.db'), { readonly: true, fileMustExist: true });
    try { await source.backup(path.join(fixture, 'zedui.db')); } finally { source.close(); }
    db.initDb();
    const measure = async label => {
      const start = performance.now();
      let previous = start;
      let worstGap = 0;
      let firstTick;
      const timer = setInterval(() => {
        const now = performance.now();
        firstTick ??= now - start;
        worstGap = Math.max(worstGap, now - previous);
        previous = now;
      }, 20);
      try {
        const result = await read();
        console.log(JSON.stringify({ label, ms: Math.round(performance.now() - start),
          firstTickMs: Math.round(firstTick || 0), worstGapMs: Math.round(worstGap),
          sessions: result.sessions.length, projects: result.projects.length,
          counts: Object.fromEntries([...new Set(result.sessions.map(s => s.product || s.providerId))]
            .map(product => [product, result.sessions.filter(s => (s.product || s.providerId) === product).length])),
        }));
        return result;
      } finally { clearInterval(timer); }
    };
    const cold = await measure('cold worker with empty cache');
    const warm = await measure('warm worker reloads persisted cache');
    assert(cold.sessions.length > 0);
    // Source transcripts are live. Appends can change recency without changing membership.
    const identities = result => result.sessions.map(s => `${s.product}:${s.sessionId}`).sort();
    const memberships = result => result.projects.map(p => `${p.providerId}:${p.path}:${p.sessionCount}`).sort();
    assert.deepEqual(identities(warm), identities(cold));
    assert.deepEqual(memberships(warm), memberships(cold));
    return;
  }

  const config = portable.createDefaultPortableConfig();
  const makeDir = (...parts) => {
    const dir = path.join(fixture, ...parts);
    fs.mkdirSync(dir, { recursive: true });
    return dir;
  };
  const normal = makeDir('codex'), isolated = makeDir('cursx'), cursor = makeDir('cursor');
  process.env.ZEDBANG_PATHS = path.join(fixture, 'shared-paths.json');
  fs.writeFileSync(process.env.ZEDBANG_PATHS, JSON.stringify({
    zedTrafficControlData: makeDir('tower', 'data'), zeduiDb: path.join(fixture, 'zedui.db'),
  }));
  fs.writeFileSync(path.join(makeDir('tower', 'config'), 'agent-products.json'), JSON.stringify({ products: [
    { id: 'codex', keyProvider: 'codex', label: 'Codex', sessionsDir: normal },
    { id: 'cursx', keyProvider: 'codex', label: 'CursX', sessionsDir: isolated },
  ] }));
  Object.assign(config.providers.claude, { enabled: false, projectsDir: '' });
  Object.assign(config.providers.codex, { enabled: true, sessionsDir: normal });
  Object.assign(config.providers.cursor, { enabled: true, projectsDir: cursor });
  config.providers.geminiCli.enabled = false;
  fs.writeFileSync(settings, JSON.stringify({ portableConfig: config }));
  db.initDb();
  const codex = (dir, id, age, cwd) => {
    const file = path.join(dir, `noncanonical-${id}.jsonl`);
    fs.writeFileSync(file, [
      { type: 'session_meta', payload: { id, cwd } },
      { type: 'response_item', payload: { role: 'user', content: [{ type: 'input_text', text: 'padding '.repeat(600) }] } },
    ].map(JSON.stringify).join('\n'));
    const stamp = new Date(Date.now() - age * 86400000);
    fs.utimesSync(file, stamp, stamp);
    return file;
  };
  const recent = codex(normal, 'new', 2, 'C:/recent');
  codex(normal, 'older', 15, 'C:/older');
  codex(isolated, 'isolated', 45, 'C:/isolated');
  const transcript = path.join(makeDir('cursor', 'project', 'agent-transcripts', 'cursor-id'), 'cursor-id.jsonl');
  fs.writeFileSync(transcript, '\n'.repeat(130_000) + [
    { role: 'user', message: { content: [{ type: 'text', text: 'after the preamble' }] } },
    { role: 'assistant', message: { content: [{ type: 'text', text: 'response' }] } },
  ].map(JSON.stringify).join('\n'));
  const list = await read(7);
  assert.deepEqual(list.sessions.map(s => s.rawSessionId), ['cursor-id', 'new', 'isolated']);
  assert.equal(list.sessions[2].product, 'cursx');
  assert.equal(list.projects.length, 4);
  assert.equal(list.sessions[0].firstMessage, 'after the preamble');
  assert.equal(list.sessions[0].messageCount, null);
  assert.equal(getSessionDetails('cursor:cursor-id').messageCount, 2);
  console.log('PASS: one worker preserves independent dates, scoped fallback, header IDs and Cursor discovery');

  const cache = path.join(fixture, 'library-cache-v1.json');
  const stamp = fs.statSync(cache).mtimeMs;
  assert.deepEqual(await read(7), list);
  assert.equal(fs.statSync(cache).mtimeMs, stamp);
  db.setCwdOverride('codex:new', 'C:/overridden');
  assert.equal((await read(7)).sessions.find(s => s.sessionId === 'codex:new').cwd, 'C:/overridden');
  fs.unlinkSync(recent);
  codex(normal, 'replacement', 1, 'C:/replacement');
  assert.deepEqual((await read(7, ['codex'])).sessions.map(s => s.rawSessionId), ['replacement', 'isolated']);
  fs.appendFileSync(transcript, '\n' + JSON.stringify({ role: 'assistant', message: { content: [] } }));
  assert.equal((await read(7, ['cursor'])).sessions[0].fileSize, fs.statSync(transcript).size);
  assert.equal(getSessionDetails('cursor:cursor-id').messageCount, 3);
  assert.deepEqual((await read(7, undefined, 'id:another-machine')).sessions, []);
  console.log('PASS: persisted cache reuses files, reapplies overrides and excludes removed files');
}).then(() => app.exit(0)).catch(error => {
  console.error(error);
  app.exit(1);
});
// <END Tharyn | ZedUIMax Startup Performance
