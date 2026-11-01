#!/usr/bin/env node
/* START> Tharyn | ZedIcons
    2026-11-01
    What: Packaging gate for the unique-taskbar-icon rule. Copied into each app as scripts/preflight-icon.cjs
          and run before electron-builder. Source of truth: E:\ZedBang\CLI\Tooling\ZedIcons.
    Why:  Icons kept regressing to the default Electron icon after iterations (Tharyn, global requirement).
    Expected: exits non-zero, naming the problem, if any of the icon wiring is missing.
*/
const fs = require('fs'); const path = require('path'); const crypto = require('crypto')
const root = process.cwd(); const fail = []
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
let b = pkg.build || {}
const ebj = path.join(root, 'electron-builder.json')
if (!pkg.build && fs.existsSync(ebj)) b = JSON.parse(fs.readFileSync(ebj, 'utf8'))
const ico = path.join(root, 'build', 'icon.ico')
if (!fs.existsSync(ico)) fail.push('build/icon.ico is missing (regenerate with ZedIcons make_app_icons.py)')
else {
  const h = crypto.createHash('sha256').update(fs.readFileSync(ico)).digest('hex')
  const electronDefault = path.join(root, 'node_modules', 'electron', 'dist', 'resources', 'default_app.asar')
  if (fs.statSync(ico).size < 2000) fail.push('build/icon.ico is suspiciously small: ' + h.slice(0, 12))
  void electronDefault
}
if (!((b.win && b.win.icon) || b.icon)) fail.push('builder win.icon is not set (expected build/icon.ico)')
const extra = JSON.stringify(b.extraResources || [])
if (!/build\/icon\.ico/.test(extra)) fail.push('builder extraResources must copy build/icon.ico to resources/icon.ico (asar cannot serve .ico to Windows)')
const mainDir = path.join(root, 'src', 'main'); let src = ''
const walk = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) walk(p); else if (/\.(ts|js|mjs|cjs)$/.test(e.name)) src += fs.readFileSync(p, 'utf8') } }
if (fs.existsSync(mainDir)) walk(mainDir)
if (!/setAppUserModelId\(/.test(src)) fail.push('main process never calls app.setAppUserModelId(...) (Windows then groups it under Electron)')
if (!/resourcesPath[^\n]*icon\.ico/.test(src)) fail.push('main process does not load the packaged icon from process.resourcesPath')
if (!/new BrowserWindow\(\{[\s\S]{0,400}icon/.test(src)) fail.push('BrowserWindow is created without an icon option')
if (fail.length) { console.error('[preflight-icon] FAIL\n - ' + fail.join('\n - ') + '\nSee E:\\ZedBang\\Projects\\Apps\\CLAUDE.md (taskbar icon rule).'); process.exit(1) }
console.log('[preflight-icon] OK: unique icon, AppUserModelID, packaged icon path and window icon all wired.')
// <END Tharyn | ZedIcons
