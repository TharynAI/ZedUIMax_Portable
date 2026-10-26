import {readFile,readdir,readlink} from 'node:fs/promises';
import {homedir} from 'node:os';
import {join,basename} from 'node:path';
const input=process.argv[2];
if(!input)throw new Error('Exact disposable workspace is required');
const normalize=p=>p.replace(/^([A-Za-z]):[\\/]/,(_,d)=>'/mnt/'+d.toLowerCase()+'/').replaceAll('\\','/').replace(/\/$/,'').toLowerCase();
const workspace=normalize(input),rows=[];
const approved=new Set(['launch-with-validation.sh','launch-with-validation-resume.sh','launch-sessions.sh','launch.mjs','session-child.mjs','claude2']);
for(const file of await readdir(join(homedir(),'.claude','sessions'))){
 if(!/^\d+\.json$/.test(file))continue;
 try{
  const record=JSON.parse(await readFile(join(homedir(),'.claude','sessions',file),'utf8'));
  const pid=Number(file.slice(0,-5)),stat=await readFile(`/proc/${pid}/stat`,'utf8');
  const fields=stat.slice(stat.lastIndexOf(')')+2).split(/\s+/),exe=await readlink(`/proc/${pid}/exe`),cwd=await readlink(`/proc/${pid}/cwd`);
  if(normalize(cwd)!==workspace||String(record.procStart)!==fields[19]||!exe.includes('/@anthropic-ai/claude-code-linux-'))continue;
  const chain=[];let parent=Number(fields[1]);
  for(let depth=0;depth<12&&parent>1;depth++){
   const s=await readFile(`/proc/${parent}/stat`,'utf8');
   const args=(await readFile(`/proc/${parent}/cmdline`,'utf8')).split('\0');
   chain.push(...args.filter(a=>approved.has(basename(a))).map(a=>({pid:parent,component:basename(a)})));
   parent=Number(s.slice(s.lastIndexOf(')')+2).split(/\s+/)[1]);
  }
  rows.push({pid,startTicks:fields[19],sessionId:record.sessionId,exe,cwd,chain});
 }catch{}
}
console.log(JSON.stringify({workspace:input,count:rows.length,rows}));
