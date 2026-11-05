import type { ConsoleLayoutSnapshot } from './console-layout';

/* START> Tharyn | ZedUIMax
   2026-11-04: Static, escaped review of observed usage data. No launch controls or embedded commands.
*/
function escape(value: unknown): string {
  return String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}
function validGeometry(r: { x: number; y: number; width: number; height: number } | null): boolean {
  return !!r && [r.x, r.y, r.width, r.height].every(Number.isFinite) && r.width > 0 && r.height > 0;
}
function rectLabel(r: { x: number; y: number; width: number; height: number } | null): string {
  return r ? `${r.x}, ${r.y} / ${r.width} x ${r.height}` : 'Unknown';
}
function groupFor(title: string): string {
  if (/\b(Tower|Remote|ZedUI|Advisor)\b/i.test(title)) return 'Tower / Remote / ZedUI';
  if (/\b(LMR|MetaHuman|Unreal)\b/i.test(title)) return 'LMR / Unreal';
  if (/\b(CBridge|Clausor)\b/i.test(title)) return 'CBridge';
  if (/\b(Slack|CodaTeam|ET|ZedWork)\b/i.test(title)) return 'ZedWork / Slack / ET';
  if (/\bDAM\b/i.test(title)) return 'DAM';
  return 'Unassigned';
}
export function renderConsoleLayoutReport(snapshot: ConsoleLayoutSnapshot): string {
  const allTabs = snapshot.windows.flatMap(w => w.tabs);
  const mapped = allTabs.filter(t => t.session);
  const groups = new Map<string, typeof allTabs>();
  for (const t of allTabs) {
    const group = t.session ? groupFor(t.title) : 'Unmapped - not assigned';
    groups.set(group, [...(groups.get(group) || []), t]);
  }
  const validPanels = snapshot.panels.filter(p => validGeometry(p.rect));
  const minX = Math.min(0, ...validPanels.map(p => p.rect!.x));
  const minY = Math.min(0, ...validPanels.map(p => p.rect!.y));
  const maxX = Math.max(1, ...validPanels.map(p => p.rect!.x + p.rect!.width));
  const maxY = Math.max(1, ...validPanels.map(p => p.rect!.y + p.rect!.height));
  const diagram = validPanels.length ? `<svg role="img" aria-label="Observed panel and window geometry" viewBox="${minX - 20} ${minY - 20} ${maxX - minX + 40} ${maxY - minY + 40}">
    ${validPanels.map((p, i) => `<rect x="${p.rect!.x}" y="${p.rect!.y}" width="${p.rect!.width}" height="${p.rect!.height}" fill="${p.reserved ? '#fce5e5' : '#edf1f4'}" stroke="#65727a" stroke-width="5"/><text x="${p.rect!.x + 30}" y="${p.rect!.y + 60}" font-size="40" fill="#33434a">P${i + 1}</text>`).join('')}
    ${snapshot.windows.map((w, i) => w.observedRect && validGeometry(w.observedRect) && !w.minimized ? `<rect x="${w.observedRect.x}" y="${w.observedRect.y}" width="${w.observedRect.width}" height="${w.observedRect.height}" fill="#0c79791f" stroke="#0c7979" stroke-width="5"/><text x="${w.observedRect.x + 25}" y="${w.observedRect.y + 110}" font-size="44" fill="#075454">W${i + 1}</text>` : '').join('')}
    </svg>` : '<p>No panel geometry available.</p>';
  const windowHtml = snapshot.windows.map((w, i) => `<article class="window" id="window-${i}">
    <header><h3>W${i + 1} <span>${w.tabs.length} tabs${w.minimized ? ' / minimized' : ''}</span></h3>
    <p>${escape(w.panelSerial || 'Panel unknown')} <span class="muted">${escape(rectLabel(w.observedRect))}</span></p></header>
    <p class="muted">HWND ${escape(w.hwnd)} / WT ${escape(w.wtVersion)} / ${escape(w.tabOrderEvidence)}</p>
    <ol>${w.tabs.map(t => `<li><div class="tab-head"><strong>${escape(t.title || '(untitled)')}</strong><span class="state ${t.session ? 'ok' : 'warn'}">${t.session ? 'Corroborated' : 'Unmapped'}</span></div>
      ${t.session ? `<dl><dt>Product</dt><dd>${escape(t.session.productId)}</dd><dt>UUID</dt><dd><code>${escape(t.session.sessionId)}</code></dd><dt>Folder</dt><dd>${escape(t.session.cwd)}</dd><dt>Native</dt><dd>PID ${t.session.pid} / start ${escape(t.session.startTicks)}</dd></dl>
      <p class="muted">Unique title + native UUID/PID/start. Exact pane, split tree and product home are not proven.</p>` : `<p class="warning">${escape(t.blockers.join('; ') || 'No exact native binding')}</p>`}
      <p><b>Cold-restore preview:</b> ${t.session ? 'skip: already live at observation' : 'blocked: binding required'}. <b>Live move:</b> not authorized.</p>
      ${t.recipe ? `<details><summary>Canonical resume recipe / preview only</summary><pre>${escape(JSON.stringify(t.recipe, null, 2))}</pre></details>` : ''}
      </li>`).join('')}</ol></article>`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>041 Console Layout: Observed Desktop</title>
  <style>*{box-sizing:border-box}body{margin:0;background:#f7f9fa;color:#202d34;font:15px/1.55 "Segoe UI",sans-serif}main{max-width:1080px;margin:auto;padding:28px 20px 60px}h1{font-size:30px;line-height:1.2;margin:8px 0 16px}h2{font-size:21px;margin:0 0 12px}h3{font-size:18px;margin:0}h3 span{font-size:14px;font-weight:400;color:#53646e}p{margin:8px 0}a{color:#006c77}nav{display:flex;gap:18px;flex-wrap:wrap;border-bottom:1px solid #cbd6dc;padding:12px 0}section{padding:24px 0;border-bottom:1px solid #cbd6dc}.result{border-left:4px solid #b65f13;background:#fff1de;padding:14px 18px}.metrics{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:20px;padding:22px 0;border-bottom:1px solid #cbd6dc}.metrics b{display:block;font-size:27px;color:#075f65}.muted{color:#53646e}.window{border:1px solid #cbd6dc;border-radius:6px;background:white;padding:16px;margin:16px 0}.window header{border-bottom:1px solid #e0e6e9;padding-bottom:10px}ol{padding-left:24px}li{padding:12px 0;border-bottom:1px solid #e0e6e9}li:last-child{border:0}.tab-head{display:flex;gap:10px;justify-content:space-between;align-items:start}.state{font-size:12px;white-space:nowrap}.ok{color:#09635b}.warn,.warning{color:#98521b}dl{display:grid;grid-template-columns:64px minmax(0,1fr);gap:4px 10px;margin:10px 0}dt{color:#53646e}dd{margin:0}code,pre{font:12px/1.55 Consolas,monospace}pre{white-space:pre-wrap;overflow-wrap:anywhere;background:#f0f3f5;padding:12px;border-radius:4px}details{margin-top:8px}summary{cursor:pointer;color:#006c77}svg{width:100%;height:auto;display:block;background:white;border:1px solid #cbd6dc}ul{padding-left:20px}.group{border-top:1px solid #d7dfe4;padding:12px 0}p,dd,li,code,summary,strong{overflow-wrap:anywhere}footer{font-size:12px;padding-top:20px;color:#53646e}@media(max-width:520px){main{padding:18px 12px 40px}h1{font-size:25px}.metrics{grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.window{padding:12px}.tab-head{display:block}.state{display:block}dl{grid-template-columns:55px minmax(0,1fr)}}</style></head><body><main>
  <p class="muted">041 / read-only desktop evidence / ${escape(snapshot.capturedAt)}</p><h1>Console Layout: Observed Desktop</h1>
  <div class="result"><b>Review only. Nothing will move or restart.</b><p>This capture is an inventory preview, not an executable restore plan. Existing live sessions are skipped. Unsupported or ambiguous bindings stay blocked.</p></div>
  <div class="metrics"><div><b>${snapshot.windows.length}</b>Terminal windows</div><div><b>${allTabs.length}</b>Observed tabs</div><div><b>${mapped.length}</b>Corroborated sessions</div><div><b>${allTabs.length - mapped.length}</b>Unmapped tabs</div></div>
  <nav><a href="#desktop">Desktop</a><a href="#windows">Windows and tabs</a><a href="#groups">Proposed groups</a><a href="#limits">Proof limits</a></nav>
  <section id="desktop"><h2>Observed Desktop</h2>${diagram}<ul>${snapshot.panels.map((p, i) => `<li>P${i + 1}: <b>${escape(p.serial || 'Unknown serial')}</b> / ${escape(p.deviceName)} / ${escape(rectLabel(p.rect))}${p.reserved ? ' / RESERVED: excluded' : ''}</li>`).join('')}</ul><p>Configured reserved panel: <b>${escape(snapshot.reservedPanelSerial || 'UNKNOWN')}</b>. Absence does not remove its exclusion.</p></section>
  <section id="windows"><h2>Windows and Ordered Tabs</h2><p>W numbers and HWNDs are observation-local, not durable Windows Terminal names. Current bounds are captured; normal placement for minimized/maximized windows is not yet proven.</p>${windowHtml}</section>
  <section id="groups"><h2>Proposed Groups</h2><p>Draft grouping by call-sign label only, not an instruction to move. Destination panels and rectangles remain unset. Unmapped tabs are not assigned.</p>${[...groups].map(([group, tabs]) => `<div class="group"><h3>${escape(group)}</h3><p>${tabs.map(t => escape(t.title)).join(' / ')}</p></div>`).join('')}</section>
  <section id="limits"><h2>Proof Limits and Next Gate</h2><ul><li>No restore executor, native transfer or desktop input was exercised.</li><li>Unique titles corroborate native sessions; shared Terminal PID is not exact pane/window proof.</li><li>Split topology, managed window names and product-home fingerprints remain unknown.</li><li>Null/duplicate panel serials, stale sources and reservation conflicts block placement.</li><li>Live rearrangement requires a reviewed target plan and coordinated disposable transfer proof first.</li></ul><p>Capture diagnostics: ${escape(snapshot.diagnostics.join('; ') || 'none reported by observers')}.</p><p>Guardian is the restore controller. ZedUI supplies capture data and canonical launch adapters; no parallel restore engine.</p></section>
  <footer>Snapshot ${escape(snapshot.snapshotId)} / ${escape(snapshot.machineName)} / local usage data, excluded from Git. Recipes shown are regenerated previews, never replayed by this page.</footer>
  <section data-zedremote-feedback="v1" aria-label="Your feedback"><h2>Your feedback</h2><p>Persistent feedback requires Remote support.</p></section></main></body></html>`;
}
// <END Tharyn | ZedUIMax
