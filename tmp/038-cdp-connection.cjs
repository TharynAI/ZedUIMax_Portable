const http = require('node:http');

function validatePort(value) {
  const port = Number(value);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid private CDP port');
  return port;
}

function budgetMs(maximum = 5000) {
  const ticks = ['ZEDUI_CU_DEADLINE', 'ZEDUI_CU_PHASE_DEADLINE', 'ZEDUI_CU_EXPLICIT_GO_UNTIL']
    .map(key => process.env[key]).filter(Boolean).map(Number);
  const remaining = ticks.length ? (Math.min(...ticks) - 621355968000000000) / 10000 - Date.now() : maximum;
  if (remaining < 100) throw new Error('Native run deadline expired');
  return Math.max(1, Math.min(maximum, Math.floor(remaining)));
}

function discoverEndpoint(value, timeoutMs = budgetMs()) {
  const port = validatePort(value);
  return new Promise((resolve, reject) => {
    // Direct loopback transport: never route private CDP through an inherited proxy.
    const request = http.get({ host: '127.0.0.1', port, path: '/json/version/', agent: false }, response => {
      let data = '';
      if (response.statusCode !== 200) {
        response.resume();
        reject(new Error(`Private CDP discovery HTTP ${response.statusCode}`));
        request.destroy();
        return;
      }
      response.setEncoding('utf8');
      response.on('data', chunk => {
        data += chunk;
        if (data.length > 65536) request.destroy(new Error('Private CDP metadata too large'));
      });
      response.on('error', reject);
      response.on('end', () => {
        try {
          const metadata = JSON.parse(data);
          const endpoint = new URL(metadata.webSocketDebuggerUrl);
          if (endpoint.protocol !== 'ws:' || !['127.0.0.1', 'localhost', '[::1]'].includes(endpoint.hostname) ||
              Number(endpoint.port) !== port || endpoint.username || endpoint.password || endpoint.search ||
              !endpoint.pathname.startsWith('/devtools/browser/')) {
            throw new Error('Private CDP returned a foreign endpoint');
          }
          resolve({ endpoint: endpoint.href, port, browser: String(metadata.Browser || '').slice(0, 80) });
        } catch { reject(new Error('Private CDP metadata invalid or foreign')); }
      });
    });
    const timer = setTimeout(() => request.destroy(new Error('Private CDP discovery timed out')), timeoutMs);
    request.on('close', () => clearTimeout(timer));
    request.on('error', error => reject(new Error(error.message === 'Private CDP discovery timed out'
      ? error.message : `Private CDP discovery failed (${error.code || 'transport'})`)));
  });
}

function bypassLoopbackProxy() {
  const previous = process.env.no_proxy || process.env.NO_PROXY || '';
  const value = [previous, '127.0.0.1', 'localhost', '::1'].filter(Boolean).join(',');
  process.env.no_proxy = value;
  process.env.NO_PROXY = value;
}

module.exports = { validatePort, budgetMs, discoverEndpoint, bypassLoopbackProxy };
