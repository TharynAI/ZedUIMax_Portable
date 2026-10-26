$ErrorActionPreference='Stop'
$root=Split-Path $PSScriptRoot -Parent
$electron=Join-Path $root 'node_modules\electron\dist\electron.exe'
$package=Join-Path $root 'release\win-unpacked\ZedUI Session Launcher.exe'
if((Get-FileHash $electron).Hash-ne(Get-FileHash $package).Hash){throw 'Packaged runtime differs from fixture runtime; no equivalence claim'}
if(@(Get-NetTCPConnection -State Listen -LocalPort 9248 -ErrorAction SilentlyContinue).Count){throw 'Fixture port already occupied'}
$directory=Join-Path $PSScriptRoot ('038-hidden-fixture-'+[Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $directory|Out-Null
$oldRunAsNode=$env:ELECTRON_RUN_AS_NODE
$oldDeadline=$env:ZEDUI_CU_DEADLINE
$oldExplicit=$env:ZEDUI_CU_EXPLICIT_GO_UNTIL
$oldEvidence=$env:ZEDUI_CU_EVIDENCE_DIR
$oldPhase=$env:ZEDUI_CU_PHASE
$oldPhaseDeadline=$env:ZEDUI_CU_PHASE_DEADLINE
$p=$null
try {
 Remove-Item Env:ELECTRON_RUN_AS_NODE,Env:ZEDUI_CU_DEADLINE,Env:ZEDUI_CU_EXPLICIT_GO_UNTIL,Env:ZEDUI_CU_PHASE_DEADLINE -ErrorAction SilentlyContinue
 $env:ZEDUI_CU_EVIDENCE_DIR=$directory
 $env:ZEDUI_CU_PHASE='hidden-fixture'
 $arguments=@(('"'+(Join-Path $PSScriptRoot '038-headless-cdp.cjs')+'"'),('"'+$directory+'"'),'--remote-debugging-port=9248','--remote-debugging-address=127.0.0.1')
 $p=Start-Process -FilePath $electron -ArgumentList $arguments -PassThru -RedirectStandardOutput (Join-Path $directory 'stdout.log') -RedirectStandardError (Join-Path $directory 'stderr.log')
 @{stage='hidden-fixture-started';pid=$p.Id;directory=$directory;runtimeHashMatches=$true}|ConvertTo-Json -Compress
 $until=[DateTime]::UtcNow.AddSeconds(10)
 while(-not(Test-Path (Join-Path $directory 'fixture.json'))){
  $p.Refresh();if($p.HasExited-or[DateTime]::UtcNow-gt$until){throw 'Hidden fixture did not become ready'}
  Start-Sleep -Milliseconds 100
 }
 $status=Get-Content (Join-Path $directory 'fixture.json') -Raw|ConvertFrom-Json
 if($status.visible-or$status.pid-ne$p.Id){throw 'Hidden fixture visibility/identity mismatch'}
 $owner=@(Get-NetTCPConnection -State Listen -LocalPort 9248 -ErrorAction Stop|Where-Object{$_.OwningProcess-eq$p.Id})
 if(-not$owner.Count){throw 'Fixture does not own its CDP listener'}
 $first=& node (Join-Path $PSScriptRoot 'popup-machine-ui.cjs') 9248 --health
 if($LASTEXITCODE){throw 'First hidden CDP readiness probe failed'}
 $p.Refresh();if($p.HasExited){throw 'Read-only CDP disconnect closed the app'}
 $second=& node (Join-Path $PSScriptRoot 'popup-machine-ui.cjs') 9248 --health
 if($LASTEXITCODE){throw 'Second hidden CDP readiness probe failed'}
 if(-not($first|ConvertFrom-Json).healthy-or-not($second|ConvertFrom-Json).healthy){throw 'Hidden readiness false'}
 $events=@(Get-Content (Join-Path $directory 'steps.jsonl')|ForEach-Object{$_|ConvertFrom-Json})
 foreach($stage in @('cdp-discovery-completed','cdp-websocket-connected','cdp-renderer-ready')){
  if(@($events|Where-Object{$_.stage-eq$stage}).Count-ne2){throw "Missing durable CDP stage: $stage"}
 }
 @{passed=$true;runtimeHashMatches=$true;ownedListener=$true;twoReadOnlyProbes=$true;durableCdpStages=$true;disconnectPreservesApp=$true;hidden=$true;screenInput=$false;capture=$false;directory=$directory}|ConvertTo-Json -Compress
}finally{
 if($p){
  [IO.File]::WriteAllText((Join-Path $directory 'quit'),'quit')
  if(-not$p.WaitForExit(25000)){throw 'Own hidden fixture did not exit normally'}
 }
 $env:ELECTRON_RUN_AS_NODE=$oldRunAsNode
 $env:ZEDUI_CU_DEADLINE=$oldDeadline
 $env:ZEDUI_CU_EXPLICIT_GO_UNTIL=$oldExplicit
 $env:ZEDUI_CU_EVIDENCE_DIR=$oldEvidence
 $env:ZEDUI_CU_PHASE=$oldPhase
 $env:ZEDUI_CU_PHASE_DEADLINE=$oldPhaseDeadline
}
