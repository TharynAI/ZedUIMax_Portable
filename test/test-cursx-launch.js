/* START> Tharyn | CursX
    2026-09-08
    What: Exercise compiled rocket launch routing with in-memory configuration.
    Why: Tests must never overwrite live settings, registry or session databases.
    Expected: Both CursX actions use its route; missing routes cannot launch normal Codex.
*/
const assert = require('node:assert/strict');
const config = require('../dist/main/main/portable-config.js');
const products = require('../dist/main/main/agent-products.js');
const launch = require('../dist/main/main/launch-config.js');
const originalLoad = config.loadPortableConfigFromSettingsFile;
const originalProduct = products.productById;
const fixture = config.createDefaultPortableConfig();
fixture.defaultWorkspaceWin = 'G:\\Workspace with spaces';
fixture.providers.codex.enabled = true;
fixture.providers.codex.newScriptWin = 'C:\\Fixture\\codex.ps1';
fixture.providers.codex.resumeScriptWin = 'C:\\Fixture\\codex_resume.ps1';
let product = {
  id: 'cursx', label: 'CursX', keyProvider: 'codex',
  launch: { exe: 'powershell.exe', args: ['-File', 'C:\\Fixture\\cursx.ps1', '{cwd}', '-Operation', 'new'] },
  resume: { exe: 'powershell.exe', args: ['-File', 'C:\\Fixture\\cursx_resume.ps1', '{cwd}', '{sessionId}'] },
};
try {
  config.loadPortableConfigFromSettingsFile = () => fixture;
  products.productById = id => id === 'cursx' ? product : null;
  const fresh = launch.buildAssistantLaunch('cursx', 'new');
  assert.equal(fresh.command, 'wt.exe');
  assert.deepEqual(fresh.args, ['powershell.exe', '-File', 'C:\\Fixture\\cursx.ps1', fixture.defaultWorkspaceWin, '-Operation', 'new']);
  const resume = launch.buildAssistantLaunch('cursx', 'resume');
  assert.deepEqual(resume.args, ['powershell.exe', '-File', 'C:\\Fixture\\cursx_resume.ps1', fixture.defaultWorkspaceWin]);
  assert.equal(launch.buildAssistantLaunch('cursx', 'new', 'G:\\Other').args[3], 'G:\\Other');
  assert(launch.buildAssistantLaunch('codex2', 'new').args.includes('C:\\Fixture\\codex.ps1'));
  assert(launch.buildAssistantLaunch('codex2', 'resume').args.includes('C:\\Fixture\\codex_resume.ps1'));
  const saved = launch.buildCodexLaunch('resume', 'G:\\Workspace with spaces', 'native-resume-id', 'codex', 'cursx');
  assert.equal(saved.command, 'wt.exe');
  assert.deepEqual(saved.args, ['powershell.exe', '-File', 'C:\\Fixture\\cursx_resume.ps1', fixture.defaultWorkspaceWin, 'native-resume-id']);
  assert.equal(saved.displayCommand.startsWith('wt powershell.exe '), true);
  const valid = product;
  for (const bad of [null, { ...valid, fallback: true }, { ...valid, keyProvider: 'cursor' }]) {
    product = bad;
    for (const mode of ['new', 'resume']) assert.throws(() => launch.buildAssistantLaunch('cursx', mode), /refusing to launch it as Codex/);
  }
  product = { ...valid, launch: undefined, resume: undefined };
  for (const mode of ['new', 'resume']) assert.throws(() => launch.buildAssistantLaunch('cursx', mode), /has no .* command configured/);
  assert.throws(() => launch.buildAssistantLaunch('unknown', 'new'), /Unknown launcher/);
  product = null;
  assert.throws(() => launch.buildCodexLaunch('resume', fixture.defaultWorkspaceWin, 'native-resume-id', 'codex', 'cursx'), /refusing to launch it as Codex/);
  console.log('PASS: CursX new/picker/exact-ID resume, workspace, normal Codex and fail-closed route checks (19 assertions)');
} finally {
  config.loadPortableConfigFromSettingsFile = originalLoad;
  products.productById = originalProduct;
}
// <END Tharyn | CursX
