// Quick CDP runner for the portable app debug port.
const http = require('http');
const WebSocket = require('ws');
const PORT = Number(process.env.ZEDUI_CDP_PORT || 9233);

async function getDebuggerUrl() {
  return new Promise((resolve, reject) => {
    http.get(`http://localhost:${PORT}/json`, (res) => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => {
        try {
          const targets = JSON.parse(data);
          const t = targets.find(x => x.type === 'page');
          if (t) resolve(t.webSocketDebuggerUrl);
          else reject(new Error('no page target'));
        } catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

async function evalExpr(expr) {
  const url = await getDebuggerUrl();
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url);
    ws.on('open', () => {
      ws.send(JSON.stringify({
        id: 1, method: 'Runtime.evaluate',
        params: { expression: expr, returnByValue: true, awaitPromise: true }
      }));
    });
    ws.on('message', (data) => {
      const r = JSON.parse(data.toString());
      if (r.id === 1) {
        ws.close();
        if (r.error) return reject(new Error(r.error.message));
        if (r.result.exceptionDetails) {
          const ex = r.result.exceptionDetails;
          return reject(new Error(ex.exception?.description || ex.text));
        }
        resolve(r.result.result.value);
      }
    });
    ws.on('error', reject);
    setTimeout(() => { ws.close(); reject(new Error('timeout')); }, 30000);
  });
}

(async () => {
  const args = process.argv.slice(2);
  let expr;
  if (args[0] === '--file' && args[1]) {
    expr = require('fs').readFileSync(args[1], 'utf8');
  } else {
    expr = args[0];
  }
  try {
    const v = await evalExpr(expr);
    if (v === undefined) console.log('undefined');
    else if (typeof v === 'object') console.log(JSON.stringify(v, null, 2));
    else console.log(v);
  } catch (e) {
    console.error('ERR:', e.message);
    process.exit(1);
  }
})();
