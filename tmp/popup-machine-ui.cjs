const { chromium } = require('./cu-tools/node_modules/playwright-core');
const { budgetMs, discoverEndpoint, bypassLoopbackProxy } = require('./038-cdp-connection.cjs');
const fs = require('node:fs');
const path = require('node:path');
function diagnostic(stage, details = {}) {
  if (!process.env.ZEDUI_CU_EVIDENCE_DIR) return;
  fs.appendFileSync(path.join(process.env.ZEDUI_CU_EVIDENCE_DIR, 'steps.jsonl'),
    JSON.stringify({ utc: new Date().toISOString(), phase: process.env.ZEDUI_CU_PHASE, stage, details }) + '\n');
}
(async () => {
  const timeout = budgetMs();
  const watchdog = setTimeout(() => { diagnostic('cdp-watchdog-expired'); console.error('Private CDP probe deadline exceeded'); process.exit(2); }, timeout);
  watchdog.unref();
  bypassLoopbackProxy();
  diagnostic('cdp-discovery-started', { port: Number(process.argv[2] || 9247), timeoutMs: timeout });
  const metadata = await discoverEndpoint(process.argv[2] || 9247, timeout);
  diagnostic('cdp-discovery-completed', { port: metadata.port });
  const browser = await chromium.connectOverCDP(metadata.endpoint, { timeout: budgetMs(timeout) });
  diagnostic('cdp-websocket-connected');
  try {
    const page = browser.contexts()[0].pages().find(p => p.url().includes('dist/renderer/index.html'));
    if (!page) throw new Error('Renderer missing');
    if (process.argv.includes('--health')) {
      const ready = await page.evaluate(() => !!window.__ZEDUI_STORE__?.getState);
      if (!ready) throw new Error('Renderer store not ready');
      diagnostic('cdp-renderer-ready');
      console.log(JSON.stringify({ healthy: true, port: metadata.port, browser: metadata.browser, rendererReady: true }));
      return;
    }
    const state = await page.evaluate(() => {
      const rect = e => { const r = e.getBoundingClientRect(); return { x:r.x, y:r.y, w:r.width, h:r.height }; };
      const visible = e => e.getBoundingClientRect().width && getComputedStyle(e).visibility !== 'hidden';
      const machine = document.querySelector('select[aria-label="Machine"]');
      const launcher = Array.from(document.querySelectorAll('button')).find(e=>e.title==='Launch Assistant')?.parentElement;
      const s = window.__ZEDUI_STORE__.getState();
      return {
        viewport:{width:innerWidth,height:innerHeight,x:screenX,y:screenY,zoom:Number(getComputedStyle(document.querySelector('.zed-workspace')).zoom)||1},
        bundle:Array.from(document.scripts).map(e=>e.src),
        machine:machine ? { name:machine.selectedOptions[0].textContent.trim(), title:machine.title,
          labelTitle:machine.closest('label').title, rect:rect(machine), font:getComputedStyle(machine).font,
          width:machine.clientWidth, padding:getComputedStyle(machine).padding, measure:document.querySelector('.zed-machine-measure')?.textContent } : null,
        buttons:Array.from(document.querySelectorAll('button')).filter(visible).map(e=>({text:e.textContent.trim(),title:e.title,aria:e.getAttribute('aria-label'),disabled:e.disabled,launcher:!!launcher?.contains(e),rect:rect(e)})),
        inputs:Array.from(document.querySelectorAll('input')).filter(visible).map(e=>({placeholder:e.placeholder,value:e.value,rect:rect(e)})),
        notice:document.querySelector('.launch-classification-notice')?.textContent || null,
        dialog:document.querySelector('form[role="dialog"]')?.textContent || null,
        filter:s.providerFilter,error:s.error,selected:s.selectedSessionId,loading:s.isLoading,search:s.searchQuery,
        products:s.sessions.reduce((a,r)=>{const k=r.providerId+':'+(r.product||r.providerId);a[k]=(a[k]||0)+1;return a;},{}),
        detail:s.selectedSession ? {id:s.selectedSession.sessionId,provider:s.selectedSession.providerId,product:s.selectedSession.product} : null,
        groups:Array.from(document.querySelectorAll('.browse-tree-group')).map(e=>({text:e.textContent.trim(),rect:rect(e)})),
        rows:Array.from(document.querySelectorAll('.browse-tree-session')).slice(0,8).map(e=>({text:e.textContent.slice(0,120),rect:rect(e)})),
        count:s.sessions.length,
      };
    });
    console.log(JSON.stringify(state));
  } finally { await browser.close(); clearTimeout(watchdog); }
})().catch(e => {diagnostic('cdp-probe-failed', { reason: e.message });console.error(e.message);process.exitCode=1;});
