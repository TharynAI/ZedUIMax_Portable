param([ValidateSet('Select','Resume')][string]$Action='Select',[Parameter(Mandatory=$true)][long]$Handle,[int]$Port=9247,[int]$MonitorX=2560,[Parameter(Mandatory=$true)][string]$SessionId,[string]$Summary='Claude entry 038 acceptance Claude2')
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot '038-evidence.ps1')
if($SessionId-notmatch'^claude:[a-f0-9-]{36}$'){throw 'An exact normal-Claude session key is required'}
$env:ZEDUI_CU_MONITOR_X=[string]$MonitorX
$cu=Join-Path $PSScriptRoot 'cu-window.ps1'
$tick=Join-Path $PSScriptRoot 'cu-input-tick.txt'
function InputOwn([string]$action,[int]$x=0,[int]$y=0,[string]$text=''){
 & $cu -Action $action -Handle $Handle -X $x -Y $y -Text $text -TickFile $tick
 if($LASTEXITCODE-ne0){throw "Own-window input refused: $action"}
}
function Probe {
 Assert-CuBudget
 $out=& node (Join-Path $PSScriptRoot 'popup-machine-ui.cjs') $Port
 if($LASTEXITCODE-ne0){throw 'Read-only DOM probe failed'}
 $out|ConvertFrom-Json
}
function ClickOwn($state,$element){
 if(-not$element){throw 'Exact visible target missing'}
 $env:ZEDUI_CU_TARGET=([string]($element.title+' '+$element.text+' '+$element.placeholder)).Trim()
 $x=[int]($state.viewport.x+($element.rect.x+$element.rect.w/2)*$state.viewport.zoom)
 $y=[int]($state.viewport.y+($element.rect.y+$element.rect.h/2)*$state.viewport.zoom)
 InputOwn click $x $y
}
if(@(Get-Process PickerHost,CredentialUIBroker -ErrorAction SilentlyContinue).Count){throw 'Pause: security prompt'}
Assert-CuBudget
InputOwn raise
InputOwn focus
if($Action-eq'Select'){
 $v=Probe
 $search=@($v.inputs|Where-Object{$_.placeholder-like'Filter sessions*'})
 if($search.Count-ne1){throw 'Expected one session filter'}
 ClickOwn $v $search[0]
 InputOwn type 0 0 ('^a'+$Summary+'{ENTER}')
 for($i=0;$i-lt25;$i++){
  Start-Sleep -Milliseconds 200
  $v=Probe
  if(-not$v.loading){
   $rows=@($v.rows|Where-Object{$_.text.Contains($Summary)})
   if($rows.Count-eq1){break}
   $groups=@($v.groups|Where-Object{$_.text-like'Validation*'})
   if($i-eq3-and$groups.Count-eq1){ClickOwn $v $groups[0]}
  }
 }
 if($rows.Count-ne1){throw 'The exact disposable session row was not uniquely visible'}
 ClickOwn $v $rows[0]
 for($i=0;$i-lt25;$i++){Start-Sleep -Milliseconds 100;$v=Probe;if($v.detail.id-eq$SessionId){break}}
 if($v.selected-ne$SessionId-or$v.detail.id-ne$SessionId){throw 'Selected UUID mismatch; will not continue'}
 @{action='selected';sessionId=$SessionId;hwnd=$Handle;realInput=$true}|ConvertTo-Json -Compress
}else{
 $v=Probe
 if($v.selected-ne$SessionId-or$v.detail.id-ne$SessionId){throw 'Exact disposable session must already be selected'}
 $button=@($v.buttons|Where-Object{$_.title-eq'Continue session'})
 if($button.Count-ne1-or$button[0].disabled){throw 'Exact Continue button unavailable'}
 $before=(& $cu -Action list)|ConvertFrom-Json
 ClickOwn $v $button[0]
 for($i=0;$i-lt50;$i++){
  Assert-CuBudget
  Start-Sleep -Milliseconds 200
  $after=(& $cu -Action list)|ConvertFrom-Json
  $windows=@($after|Where-Object{$_.hwnd-notin@($before.hwnd)-and$_.title})
  if($windows.Count){break}
 }
 if($windows.Count-ne1){throw 'Expected exactly one new resume window; inspect before retrying'}
 $Handle=[long]$windows[0].hwnd
 & $cu -Action move -Handle $Handle -MoveX ($MonitorX+200) -MoveY 180 -Width 1150 -Height 800 -TickFile $tick
 if($LASTEXITCODE-ne0){throw 'Resume window positioning refused'}
 InputOwn raise
 InputOwn focus
 @{action='resumed';sessionId=$SessionId;terminal=$windows[0];realInput=$true}|ConvertTo-Json -Depth 5 -Compress
}
