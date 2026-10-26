param([string]$Provider, [long]$Handle=6165074,[int]$Port=9247,[int]$MonitorX=0,[switch]$NoCapture)
$ErrorActionPreference='Stop'
$ProgressPreference='SilentlyContinue'
. (Join-Path $PSScriptRoot '038-evidence.ps1')
$env:ZEDUI_CU_MONITOR_X=[string]$MonitorX
$s=Join-Path $PSScriptRoot 'cu-window.ps1'
$tick=Join-Path $PSScriptRoot 'cu-input-tick.txt'
function Cu([string]$action,[int]$x=0,[int]$y=0,[string]$text='') {
 & $s -Action $action -Handle $Handle -X $x -Y $y -Text $text -TickFile $tick
 if($LASTEXITCODE-ne0){throw "Native $action refused ($LASTEXITCODE)"}
}
function Snap {
 Assert-CuBudget
 $json=& node (Join-Path $PSScriptRoot 'popup-machine-ui.cjs') $Port
 if($LASTEXITCODE-ne0){throw 'Read-only DOM probe failed'}
 $json|ConvertFrom-Json
}
function Button($state,[string]$text,[string]$title='') {
 $b=@($state.buttons|Where-Object{if($title){$_.title-eq$title}elseif($text-in@('Claude2','Codex2','Clausor','CursX')){$_.text-eq$text-and$_.launcher}else{$_.text-eq$text}})
 if($b.Count-ne1){throw "Expected one visible button $text$title; got $($b.Count)"}
 $b[0]
}
function At($state,$element,[string]$action='click') {
 $env:ZEDUI_CU_TARGET=([string]($element.title+' '+$element.text+' '+$element.placeholder)).Trim().Substring(0,[Math]::Min(100,([string]($element.title+' '+$element.text+' '+$element.placeholder)).Trim().Length))
 $x=[int]($state.viewport.x+($element.rect.x+$element.rect.w/2)*$state.viewport.zoom)
 $y=[int]($state.viewport.y+($element.rect.y+$element.rect.h/2)*$state.viewport.zoom)
 Cu $action $x $y
}
$idle=(& $s -Action idle)|ConvertFrom-Json
Assert-CuBudget
$explicitGo=$env:ZEDUI_CU_EXPLICIT_GO_UNTIL-and[DateTime]::UtcNow.Ticks-lt[long]$env:ZEDUI_CU_EXPLICIT_GO_UNTIL
if(-not$explicitGo-and$idle.idleMs-lt120000-and(-not(Test-Path $tick)-or$idle.tick-ne[uint32](Get-Content $tick))){throw "PAUSE new input: idle $($idle.idleMs)ms"}
if(@(Get-Process -Name PickerHost,CredentialUIBroker -ErrorAction SilentlyContinue).Count){throw 'PAUSE new security prompt'}
$before=(& $s -Action list)|ConvertFrom-Json
Cu 'raise'
Cu 'focus'
$v=Snap
if(-not@($v.buttons|Where-Object{$_.launcher-and$_.text-eq$Provider}).Count){At $v (Button $v '' 'Launch Assistant')}
Start-Sleep -Milliseconds 100
$v=Snap
At $v (Button $v $Provider) 'hover'
Start-Sleep -Milliseconds 100
$v=Snap
At $v (Button $v 'New')
Start-Sleep -Milliseconds 100
$v=Snap
if(-not$v.dialog){throw 'Required prelaunch form missing'}
if(-not(Button $v 'Launch & classify').disabled){throw 'Empty form unexpectedly enabled'}
$summary=@($v.inputs|Where-Object{$_.placeholder-eq'What is this session for?'})[0]
At $v $summary
Cu 'type' 0 0 "Claude entry 038 acceptance $Provider"
$v=Snap
$category=@($v.inputs|Where-Object{$_.placeholder-eq'Select or enter a category'})[0]
At $v $category
Cu 'type' 0 0 'Validation'
$v=Snap
$submit=Button $v 'Launch & classify'
if($submit.disabled){throw 'Completed form still disabled'}
if(-not$NoCapture){& $s -Action capture -Handle $Handle -ImagePath (Join-Path $PSScriptRoot "popup-native-$Provider-form.png")}
At $v $submit
for($i=0;$i-lt15;$i++){
 Start-Sleep -Milliseconds 100
 $v=Snap
 if(-not$v.dialog){break}
}
if($v.dialog-or$v.notice-or$v.error){throw "Successful-launch UI not quiet: dialog=$($v.dialog);notice=$($v.notice);error=$($v.error)"}
$after=(& $s -Action list)|ConvertFrom-Json
$new=@($after|Where-Object{$_.hwnd-notin@($before.hwnd)-and$_.title-and$_.pid-ne74024})
@{provider=$Provider;idleStart=$idle.idleMs;quiet=$true;newWindows=$new}|ConvertTo-Json -Depth 8 -Compress
Cu 'focus'
if(-not$NoCapture){& $s -Action capture -Handle $Handle -ImagePath (Join-Path $PSScriptRoot "popup-native-$Provider-success.png")}
Cu 'untop'
if($new.Count-ne1){throw "Expected exactly one new own CLI window; found $($new.Count)"}
$Handle=[long]$new[0].hwnd
& $s -Action move -Handle $Handle -MoveX ($MonitorX+200) -MoveY 180 -Width 1150 -Height 800 -TickFile $tick
if($LASTEXITCODE-ne0){throw 'New terminal positioning refused'}
Cu 'raise'
Cu 'focus'
Start-Sleep -Milliseconds 800
if(-not$NoCapture){& $s -Action capture -Handle $Handle -ImagePath (Join-Path $PSScriptRoot "popup-native-$Provider-terminal.png")}
Cu 'untop'
