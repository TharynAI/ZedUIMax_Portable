/* START> Tharyn | ZedMax
    2026-10-10
    What: Verify bounded search, pre-enrichment filters and file-cache invalidation.
    Why: Performance must not hide ranked product hits or return stale session/config metadata.
    Expected: Private DB/transcripts only; real compiled IPC and SQLite FTS behavior.
*/
const { app, ipcMain } = require('electron');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const packaged = process.argv.includes('--packaged');
const appRoot = packaged ? path.join(root, 'release', 'win-unpacked') : root;
const modules = path.join(packaged ? path.join(appRoot, 'resources', 'app.asar') : root, 'dist', 'main', 'main');
const fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'zedui-search-'));
process.env.ZEDUI_APP_ROOT = appRoot;
process.env.ZEDUI_DATA_ROOT = fixture;
process.env.ZEDUI_ALLOW_EXTERNAL_DATA_ROOT = '1';
process.env.ZEDBANG_PATHS = path.join(fixture, 'shared-paths.json');
app.setPath('userData', path.join(fixture, 'userData'));
console.log(JSON.stringify({ pid: process.pid, fixture, hidden: true, packaged }));

app.whenReady().then(async () => {
  require(path.join(modules, 'runtime-paths.js')).initializeRuntimePaths({ appPath: appRoot });
  const portable = require(path.join(modules, 'portable-config.js'));
  const config = portable.createDefaultPortableConfig();
  const roots = Object.fromEntries(['claude', 'codex', 'clausor', 'cursx', 'cursor'].map(id => [id, path.join(fixture, id)]));
  for (const dir of Object.values(roots)) fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(path.join(fixture, 'tower', 'config'), { recursive: true });
  fs.writeFileSync(process.env.ZEDBANG_PATHS, JSON.stringify({ zedTrafficControlData: path.join(fixture, 'tower', 'data'), zeduiDb: path.join(fixture, 'zedui.db') }));
  fs.writeFileSync(path.join(fixture, 'tower', 'config', 'agent-products.json'), JSON.stringify({ version: 1, products: [
    { id: 'claude-code', label: 'Claude Code', keyProvider: 'claude', fallback: true, sessionsDir: roots.claude },
    { id: 'clausor', label: 'Clausor', keyProvider: 'claude', sessionsDir: roots.clausor },
    { id: 'codex', label: 'Codex', keyProvider: 'codex', sessionsDir: roots.codex },
    { id: 'cursx', label: 'CursX', keyProvider: 'codex', sessionsDir: roots.cursx },
  ] }));
  config.providers.claude.enabled = config.providers.codex.enabled = config.providers.cursor.enabled = true;
  config.providers.claude.projectsDir = roots.claude;
  config.providers.codex.sessionsDir = roots.codex;
  config.providers.cursor.projectsDir = roots.cursor;
  const save = () => fs.writeFileSync(path.join(fixture, 'settings.json'), JSON.stringify({ portableConfig: config }));
  save();
  const db = require(path.join(modules, 'metadata-db.js')); db.initDb();
  const store = require(path.join(modules, 'session-store.js'));
  const handlers = new Map(); ipcMain.handle = (name, fn) => handlers.set(name, fn);
  require(path.join(modules, 'ipc-handlers.js')).setupIpcHandlers();
  const search = (q, limit, machine, providers) => handlers.get('sessions:search')(null, q, limit, machine, providers);
  const raw = n => `11111111-1111-4111-8111-${String(n).padStart(12, '0')}`;
  const claude = (n, product = 'claude', text = 'original') => {
    const id = raw(n), dir = path.join(roots[product], '-fixture'); fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, id + '.jsonl');
    fs.writeFileSync(file, [
      { type: 'summary', summary: text },
      { type: 'user', cwd: 'C:\\original', message: { content: text + ' padding '.repeat(200) } },
      { type: 'assistant', message: { content: 'response' } },
    ].map(JSON.stringify).join('\n') + '\n');
    db.setAnnotation('claude:' + id, { userSummary: 'needle '.repeat(product === 'claude' ? 10 : 1) });
    return { id: 'claude:' + id, raw: id, file };
  };
  const codex = (n, product = 'codex', filename = 'rollout-2026-10-10-' + raw(n) + '.jsonl') => {
    const id = raw(n), file = path.join(roots[product], filename);
    fs.writeFileSync(file, [
      { type: 'session_meta', payload: { id, cwd: 'C:\\codex', summary: 'codex original' } },
      { type: 'response_item', payload: { role: 'user', content: [{ type: 'input_text', text: 'needle ' + 'padding '.repeat(200) }] } },
    ].map(JSON.stringify).join('\n') + '\n');
    db.setAnnotation('codex:' + id, { userSummary: 'needle' });
    return { id: 'codex:' + id, raw: id, file };
  };
  const normal = claude(1), isolated = claude(2, 'clausor');
  for (let n = 3; n < 24; n++) claude(n);
  const cx = codex(100), cx2 = codex(101, 'codex', 'noncanonical.jsonl'), cursx = codex(102, 'cursx');
  let checks = 0;
  const check = async (name, fn) => { await fn(); console.log(`PASS ${++checks}: ${name}`); };
  const originalDetails = store.getSessionDetails, originalSearch = db.search;
  let enriched = [], observedLimits = [];
  store.getSessionDetails = (...args) => { enriched.push(args[0]); return originalDetails(...args); };
  db.search = (...args) => { observedLimits.push(args[1]); return originalSearch(...args); };
  const originalRead = fs.readFileSync, originalDirs = fs.readdirSync, originalAsyncDirs = fs.promises.readdir;
  let fullReads = 0, codexWalks = 0;
  fs.readFileSync = function(file, ...args) { if (String(file).endsWith('.jsonl')) fullReads++; return originalRead.call(this, file, ...args); };
  fs.readdirSync = function(dir, ...args) { if (String(dir) === roots.codex) codexWalks++; return originalDirs.call(this, dir, ...args); };
  fs.promises.readdir = async function(dir, ...args) { if (String(dir) === roots.codex) codexWalks++; return originalAsyncDirs.call(this, dir, ...args); };

  await check('caller limit reaches SQLite and bounds results; default is20', async () => {
    assert.equal((await search('needle', 2)).length, 2);
    assert.equal(observedLimits.at(-1), 2);
    assert.equal((await search('needle')).length, 20);
    assert.equal(observedLimits.at(-1), 20);
  });
  await check('zero, negative and invalid limits do no enrichment', async () => {
    enriched = []; observedLimits = [];
    for (const value of [0, -1, NaN, Infinity, 1.5]) assert.deepEqual(await search('needle', value), []);
    assert.equal(enriched.length, 0); assert.equal(observedLimits.length, 0);
  });
  await check('foreign machine rejected before SQLite or filesystem enrichment', async () => {
    enriched = []; observedLimits = []; fullReads = 0;
    assert.deepEqual(await search('needle', 2, 'name:foreign'), []);
    assert.equal(enriched.length, 0); assert.equal(observedLimits.length, 0); assert.equal(fullReads, 0);
  });
  await check('provider filtering precedes enrichment and scans beyond foreign ranked rows', async () => {
    enriched = [];
    const hits = await search('needle', 1, undefined, ['codex']);
    assert.equal(hits.length, 1); assert(hits[0].sessionId.startsWith('codex:'));
    assert.equal(enriched.length, 1); assert.equal(enriched[0], hits[0].sessionId);
    assert.equal(observedLimits.at(-1), 1);
  });
  await check('Clausor product filtering does not enrich normal Claude rows', async () => {
    enriched = [];
    assert.equal((await search('needle', 1, undefined, ['clausor']))[0].sessionId, isolated.id);
    assert.deepEqual(enriched, [isolated.id]);
  });
  await check('CursX product identity and native Codex key survive search', async () => {
    enriched = [];
    const hits = await search('needle', 1, undefined, ['cursx']);
    assert.equal(hits[0].sessionId, cursx.id); assert.equal(hits[0].product, 'cursx');
    assert.deepEqual(enriched, [cursx.id]);
  });
  await check('Codex inventory walked once per search, not once per row', async () => {
    codexWalks = 0;
    assert.equal((await search('needle', 10, undefined, ['codex'])).length, 3);
    assert.equal(codexWalks, 1);
  });
  await check('warm search reuses stat-keyed row cache without transcript reads', async () => {
    await search('needle', 10, undefined, ['codex']); fullReads = 0;
    const hits = await search('needle', 10, undefined, ['codex']);
    assert.equal(fullReads, 0); assert(hits.every(r => r.messages.length === 0));
    assert.equal(originalDetails(cx.id).messages.length, 1);
  });
  await check('normal details cache retains full messages and returns fresh cwd override', async () => {
    originalDetails(normal.id); fullReads = 0;
    assert.equal(originalDetails(normal.id).messages.length, 2); assert.equal(fullReads, 0);
    db.setCwdOverride(normal.id, 'C:\\relocated');
    assert.equal(originalDetails(normal.id).cwd, 'C:\\relocated'); assert.equal(fullReads, 0);
  });
  await check('annotations stay fresh independently of file-cache hits', async () => {
    await search('needle', 1, undefined, ['clausor']);
    db.setAnnotation(isolated.id, { userSummary: 'needle renamed', notes: 'changed notes' });
    const hit = (await search('needle', 1, undefined, ['clausor']))[0];
    assert.equal(hit.displaySummary, 'needle renamed'); assert.equal(hit.annotation.notes, 'changed notes');
  });
  await check('append/size change invalidates cached full and row content', async () => {
    originalDetails(normal.id);
    const stat = fs.statSync(normal.file);
    fs.appendFileSync(normal.file, JSON.stringify({ type: 'assistant', message: { content: 'appended' } }) + '\n');
    fs.utimesSync(normal.file, stat.atime, stat.mtime);
    assert.equal(originalDetails(normal.id).messages.length, 3);
  });
  await check('same-size rewrite invalidates cache by file times', async () => {
    const text = originalRead(normal.file, 'utf8').replaceAll('original', 'modified');
    fs.writeFileSync(normal.file, text);
    assert.equal(originalDetails(normal.id).autoSummary, 'modified');
  });
  await check('metadata ID wins over noncanonical filename and refreshes after edits', async () => {
    assert(originalDetails(cx2.id));
    fs.writeFileSync(cx2.file, originalRead(cx2.file, 'utf8').replaceAll(cx2.raw, raw(110)));
    assert.equal(originalDetails(cx2.id), null);
    assert.equal(originalDetails('codex:' + raw(110)).rawSessionId, raw(110));
  });
  await check('new files are found in the next fresh index and deleted files are absent', async () => {
    const fresh = codex(111); assert(originalDetails(fresh.id));
    fs.unlinkSync(fresh.file); assert.equal(originalDetails(fresh.id), null);
    fs.unlinkSync(cx.file); assert.equal(originalDetails(cx.id), null);
  });
  await check('latest duplicate Codex transcript remains authoritative', async () => {
    const duplicate = codex(102, 'cursx', 'duplicate.jsonl');
    fs.appendFileSync(duplicate.file, ' \n');
    fs.utimesSync(duplicate.file, new Date(), new Date(Date.now() + 1000));
    assert.equal(originalDetails(cursx.id).filePath, duplicate.file);
  });
  await check('cached Claude ID still refuses ambiguity across homes', async () => {
    originalDetails(normal.id); claude(1, 'clausor');
    assert.throws(() => originalDetails(normal.id), /Ambiguous Claude session/);
    fs.unlinkSync(path.join(roots.clausor, '-fixture', normal.raw + '.jsonl'));
  });
  await check('changed provider root uses new file, not old cached content', async () => {
    const old = config.providers.claude.projectsDir;
    config.providers.claude.projectsDir = path.join(fixture, 'other-claude'); save();
    fs.mkdirSync(path.join(config.providers.claude.projectsDir, '-fixture'), { recursive: true });
    fs.copyFileSync(normal.file, path.join(config.providers.claude.projectsDir, '-fixture', normal.raw + '.jsonl'));
    assert.equal(originalDetails(normal.id).filePath, path.join(config.providers.claude.projectsDir, '-fixture', normal.raw + '.jsonl'));
    config.providers.claude.projectsDir = old; save();
  });
  await check('search yields queued main-process work before row enrichment', async () => {
    let ran = false; setImmediate(() => { ran = true; });
    await search('needle', 1, undefined, ['clausor']); assert(ran);
  });
  await check('missing high-ranked rows do not starve a valid result limit', async () => {
    db.setAnnotation('claude:' + raw(999), { userSummary: 'orphanneedle '.repeat(15) });
    db.setAnnotation(isolated.id, { userSummary: 'orphanneedle' });
    const hits = await search('orphanneedle', 1);
    assert.equal(hits.length, 1); assert.equal(hits[0].sessionId, isolated.id);
  });
  await check('cold streaming rows match full Claude/Codex/Cursor parser fields', async () => {
    const cc = claude(210), cd = codex(211);
    fs.appendFileSync(cc.file, '{malformed\n' + JSON.stringify({ type: 'summary', summary: 'last summary' }) + '\n');
    const cursorRaw = raw(212), slug = 'mnt-e-Workspace';
    const cursorDir = path.join(roots.cursor, slug, 'agent-transcripts', cursorRaw);
    fs.mkdirSync(cursorDir, { recursive: true });
    const cursorFile = path.join(cursorDir, cursorRaw + '.jsonl');
    fs.writeFileSync(cursorFile, [
      { role: 'user', message: { content: [{ type: 'text', text: '<user_query>cursor parity</user_query>' }, { type: 'tool_use', name: 'Read', input: { file: 'C:\\file' } }] } },
      { role: 'assistant', message: { content: [{ type: 'text', text: 'response' }] } },
    ].map(JSON.stringify).join('\n') + '\n');
    const candidates = [cc, cd, { id: 'cursor:' + cursorRaw, file: cursorFile }];
    const expected = new Map();
    for (const candidate of candidates) {
      db.setAnnotation(candidate.id, { userSummary: 'parserparity' });
      const full = originalDetails(candidate.id);
      const now = new Date(Date.now() + 2000);
      fs.utimesSync(candidate.file, now, now);
      full.timestamp = fs.statSync(candidate.file).mtime;
      expected.set(candidate.id, full);
    }
    const hits = await search('parserparity', 10);
    assert.equal(hits.length, 3);
    const fields = ['sessionId', 'rawSessionId', 'providerId', 'projectPath', 'projectDisplay', 'autoSummary', 'firstMessage', 'timestamp', 'messageCount', 'cwd', 'filePath', 'fileSize', 'version', 'model'];
    for (const row of hits) for (const field of fields) assert.deepEqual(row[field], expected.get(row.sessionId)[field], row.providerId + ':' + field);
  });
  await check('detail-cache entry bound evicts old transcripts instead of growing forever', async () => {
    originalDetails(isolated.id);
    for (let n = 300; n < 430; n++) originalDetails(claude(n).id);
    fullReads = 0;
    assert(originalDetails(isolated.id)); assert.equal(fullReads, 1);
  });
  console.log(`SEARCH PERFORMANCE PASS ${checks}/${checks}`); app.exit(0);
}).catch(error => { console.error(error); app.exit(1); });
