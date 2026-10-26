const assert = require('node:assert/strict');
const http = require('node:http');
const { test } = require('node:test');
const { chromium } = require('./cu-tools/node_modules/playwright-core');
const { getProxyForUrl } = require('./cu-tools/node_modules/playwright-core/lib/utilsBundle.js');
const { validatePort, budgetMs, discoverEndpoint, bypassLoopbackProxy } = require('./038-cdp-connection.cjs');

async function server(handler, run) {
  const instance = http.createServer(handler);
  await new Promise(resolve => instance.listen(0, '127.0.0.1', resolve));
  try { await run(instance.address().port); }
  finally { instance.closeAllConnections(); await new Promise(resolve => instance.close(resolve)); }
}

test('invalid private ports fail before networking', () => {
  for (const value of [0, -1, 65536, 'not-a-port']) assert.throws(() => validatePort(value));
});

test('direct local discovery validates metadata and path', async () => {
  await server((request, response) => {
    assert.equal(request.url, '/json/version/');
    response.end(JSON.stringify({ Browser: 'fixture', webSocketDebuggerUrl: `ws://127.0.0.1:${request.socket.localPort}/devtools/browser/fixture` }));
  }, async port => { assert.equal((await discoverEndpoint(port)).port, port); });
});

test('foreign CDP endpoint is refused', async () => {
  await server((request, response) => response.end(JSON.stringify({ webSocketDebuggerUrl: 'ws://example.com:9247/devtools/browser/fixture' })),
    port => assert.rejects(discoverEndpoint(port), /invalid or foreign/));
});

test('HTTP failures and malformed metadata are explicit', async () => {
  await server((request, response) => { response.statusCode = 503; response.end(); },
    port => assert.rejects(discoverEndpoint(port), /HTTP 503/));
  await server((request, response) => response.end('not-json'),
    port => assert.rejects(discoverEndpoint(port), /metadata invalid/));
});

test('unresponsive discovery is bounded', async () => {
  const start = Date.now();
  await server(() => {}, port => assert.rejects(discoverEndpoint(port, 150), /discovery timed out/));
  assert.ok(Date.now() - start < 5000);
});

test('expired approval cannot fall through to an idle-based grant', () => {
  const previous = process.env.ZEDUI_CU_DEADLINE;
  try {
    process.env.ZEDUI_CU_DEADLINE = '1';
    assert.throws(() => budgetMs(), /deadline expired/);
  } finally {
    if (previous === undefined) delete process.env.ZEDUI_CU_DEADLINE;
    else process.env.ZEDUI_CU_DEADLINE = previous;
  }
});

test('phase cutoff wins over a still-valid run window', () => {
  const saved = { run: process.env.ZEDUI_CU_DEADLINE, phase: process.env.ZEDUI_CU_PHASE_DEADLINE };
  try {
    process.env.ZEDUI_CU_DEADLINE = (BigInt(Date.now() + 10000) * 10000n + 621355968000000000n).toString();
    process.env.ZEDUI_CU_PHASE_DEADLINE = '1';
    assert.throws(() => budgetMs(), /deadline expired/);
  } finally {
    for (const [key, value] of [['ZEDUI_CU_DEADLINE', saved.run], ['ZEDUI_CU_PHASE_DEADLINE', saved.phase]]) {
      if (value === undefined) delete process.env[key]; else process.env[key] = value;
    }
  }
});

test('reproduce proxy stall; direct discovery and narrow bypass avoid it', async () => {
  const keys = ['http_proxy', 'HTTP_PROXY', 'all_proxy', 'ALL_PROXY', 'no_proxy', 'NO_PROXY'];
  const saved = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  let proxied = 0;
  let direct = 0;
  try {
    await server(() => { proxied++; }, async proxyPort => {
      for (const key of keys) process.env[key] = key.toLowerCase() === 'no_proxy' ? '' : `http://127.0.0.1:${proxyPort}`;
      await server((request, response) => {
        direct++;
        response.end(JSON.stringify({ webSocketDebuggerUrl: `ws://127.0.0.1:${request.socket.localPort}/devtools/browser/fixture` }));
      }, async port => {
        await assert.rejects(chromium.connectOverCDP(`http://127.0.0.1:${port}`, { timeout: 350 }), /Timeout/);
        assert.ok(proxied > 0);
        assert.equal(direct, 0);
        await discoverEndpoint(port, 1000);
        assert.equal(direct, 1);
        const externalProxy = getProxyForUrl('http://example.com');
        bypassLoopbackProxy();
        assert.equal(getProxyForUrl(`http://127.0.0.1:${port}`), '');
        assert.equal(getProxyForUrl('http://example.com'), externalProxy);
      });
    });
  } finally {
    for (const key of keys) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  }
});
