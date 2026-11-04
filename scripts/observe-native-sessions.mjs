// START> Tharyn | ZedUIMax
// 2026-11-04: Allowlisted native identity probe. No environment, transcript or full argv output.
import fs from 'node:fs/promises';
import path from 'node:path';
const uuid=/^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const records=[],errors=[];
for(const name of (await fs.readdir('/proc')).filter(value=>/^\d+$/.test(value))){
 try{
  const dir=`/proc/${name}`;
  const executable=await fs.readlink(`${dir}/exe`);
  const binary=path.basename(executable);
  if(!['claude','claude.exe','codex','codex-code-mode-host'].includes(binary))continue;
  const args=(await fs.readFile(`${dir}/cmdline`,'utf8')).split('\0');
  const ids=[];
  for(let i=0;i<args.length;i++){
   if(['resume','--resume','-r','--session-id'].includes(args[i])&&uuid.test(args[i+1]??''))ids.push(args[i+1].toLowerCase());
   const match=args[i].match(/^--(?:resume|session-id)=([0-9a-f-]+)$/i);
   if(match&&uuid.test(match[1]))ids.push(match[1].toLowerCase());
  }
  const stat=await fs.readFile(`${dir}/stat`,'utf8');
  const fields=stat.slice(stat.lastIndexOf(') ')+2).split(' ');
  records.push({pid:Number(name),parentPid:Number(fields[1]),startTicks:fields[19],executable,cwd:await fs.readlink(`${dir}/cwd`),sessionIds:[...new Set(ids)],identityEvidence:ids.length?'explicit-native-argv':'unknown'});
 }catch(error){if(!['ENOENT','ESRCH'].includes(error.code))errors.push({pid:Number(name),error:error.code??'probe-failed'});}
}
console.log(JSON.stringify({schemaVersion:1,capturedAt:new Date().toISOString(),bootId:(await fs.readFile('/proc/sys/kernel/random/boot_id','utf8')).trim(),records,errors,sideEffects:'none'}));
// <END Tharyn | ZedUIMax
