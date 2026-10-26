param([string]$Action='list', [long]$Handle=0, [string]$Text='', [string]$TickFile='', [string]$ImagePath='', [int]$X=0, [int]$Y=0, [int]$MoveX=200,[int]$MoveY=120,[int]$Width=1500,[int]$Height=1050)
$ErrorActionPreference='Stop'
. (Join-Path $PSScriptRoot '038-evidence.ps1')
$script:cuStep=$null
trap {if($script:cuStep){Write-CuEvidence 'failed' @{id=$script:cuStep;action=$Action;hwnd=$Handle;reason=$_.Exception.Message}};throw}
function Start-CuStep {
 Assert-CuBudget
 $script:cuStep=[Guid]::NewGuid().ToString('N')
 Write-CuEvidence 'started' @{id=$script:cuStep;action=$Action;hwnd=$Handle;x=$X;y=$Y;target=$env:ZEDUI_CU_TARGET;textLength=$Text.Length}
}
function Complete-CuStep {
 Write-CuEvidence 'completed' @{id=$script:cuStep;action=$Action;hwnd=$Handle}
 if($env:ZEDUI_CU_EVIDENCE_DIR){
  $image=Join-Path $env:ZEDUI_CU_EVIDENCE_DIR ($script:cuStep+'.png')
  try{
   Assert-CuBudget
   $capture=@(& $PSCommandPath -Action capture -Handle $Handle -ImagePath $image)
   if($LASTEXITCODE){throw 'Own-window capture refused'}
   Write-CuEvidence 'screenshot' @{id=$script:cuStep;path=$image;hwnd=$Handle}
  }catch{Write-CuEvidence 'screenshot-blocked' @{id=$script:cuStep;hwnd=$Handle;reason=$_.Exception.Message}}
 }
}
$monitorX=if($env:ZEDUI_CU_MONITOR_X){[int]$env:ZEDUI_CU_MONITOR_X}else{0}
$monitorRight=$monitorX+2560
Add-Type -AssemblyName System.Windows.Forms
Add-Type @'
using System; using System.Text; using System.Runtime.InteropServices;
public class CU {
 public delegate bool P(IntPtr h, IntPtr l);
 [DllImport("user32.dll")] public static extern bool EnumWindows(P p,IntPtr l);
 [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
 [DllImport("user32.dll")] public static extern bool IsWindow(IntPtr h);
 [DllImport("user32.dll")] public static extern int GetWindowText(IntPtr h,StringBuilder s,int n);
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h,out uint p);
 [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
 [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr h);
 [DllImport("user32.dll",SetLastError=true)] public static extern bool AttachThreadInput(uint a,uint b,bool attach);
 [DllImport("kernel32.dll")] public static extern uint GetCurrentThreadId();
 [DllImport("user32.dll")] public static extern void keybd_event(byte v,byte s,uint f,UIntPtr e);
 [DllImport("user32.dll")] public static extern bool SetCursorPos(int x,int y);
 [DllImport("user32.dll")] public static extern void mouse_event(uint f,uint x,uint y,uint d,UIntPtr e);
 [StructLayout(LayoutKind.Sequential)] public struct POINT {public int X,Y;}
 [DllImport("user32.dll")] public static extern IntPtr WindowFromPoint(POINT p);
 [DllImport("user32.dll")] public static extern IntPtr GetAncestor(IntPtr h,uint f);
 [DllImport("user32.dll")] public static extern bool MoveWindow(IntPtr h,int x,int y,int w,int ht,bool r);
 [DllImport("user32.dll",SetLastError=true)] public static extern bool SetWindowPos(IntPtr h,IntPtr after,int x,int y,int w,int ht,uint flags);
 [DllImport("dwmapi.dll")] public static extern int DwmGetWindowAttribute(IntPtr h,int a,out uint value,int size);
 [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
 [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr h,int mode);
 [DllImport("user32.dll")] public static extern bool PostMessage(IntPtr h,uint m,IntPtr w,IntPtr l);
 [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h,out RECT r);
 [StructLayout(LayoutKind.Sequential)] public struct RECT {public int L,T,R,B;}
 [StructLayout(LayoutKind.Sequential)] public struct LII {public uint cb,t;}
 [DllImport("user32.dll")] public static extern bool GetLastInputInfo(ref LII i);
 [DllImport("kernel32.dll")] public static extern uint GetTickCount();
}
'@
function LastInput { $i=New-Object CU+LII; $i.cb=8; [void][CU]::GetLastInputInfo([ref]$i); $i.t }
function Describe($h) {
 $s=New-Object Text.StringBuilder 512; [void][CU]::GetWindowText($h,$s,512)
 [uint32]$windowPid=0; [void][CU]::GetWindowThreadProcessId($h,[ref]$windowPid)
 $r=New-Object CU+RECT; [void][CU]::GetWindowRect($h,[ref]$r)
 [uint32]$cloaked=0; $cloakResult=[CU]::DwmGetWindowAttribute($h,14,[ref]$cloaked,4)
 @{hwnd=[long]$h;pid=$windowPid;title=$s.ToString();x=$r.L;y=$r.T;width=$r.R-$r.L;height=$r.B-$r.T;visible=[CU]::IsWindowVisible($h);minimized=[CU]::IsIconic($h);cloaked=$cloaked;cloakResult=$cloakResult;foreground=([CU]::GetForegroundWindow()-eq $h)}
}
$h=[IntPtr]$Handle
if ($Action -eq 'idle') { @{idleMs=([CU]::GetTickCount()-(LastInput));tick=(LastInput)} | ConvertTo-Json -Compress; exit }
if ($Action -eq 'list') {
 $script:items=@(); $cb=[CU+P]{ param($wh,$l) if ([CU]::IsWindowVisible($wh)) {$script:items+=Describe $wh}; return $true }
 [void][CU]::EnumWindows($cb,[IntPtr]::Zero); $items | ConvertTo-Json -Compress; exit
}
if (-not [CU]::IsWindow($h)) { throw 'Exact owned HWND no longer exists' }
$d=Describe $h
if ($Action -eq 'describe') { $d | ConvertTo-Json -Compress; exit }
if ($Action -eq 'hit') {
 $point=New-Object CU+POINT; $point.X=$d.x+100; $point.Y=$d.y+60
 $hit=[CU]::WindowFromPoint($point)
 @{owned=$d;hit=Describe ([CU]::GetAncestor($hit,2));foreground=Describe ([CU]::GetForegroundWindow())}|ConvertTo-Json -Depth 5 -Compress;exit
}
if ($Action -eq 'capture') {
 Assert-CuBudget
 if(@(Get-Process PickerHost,CredentialUIBroker -ErrorAction SilentlyContinue).Count){throw 'Security prompt; no capture'}
 if (-not $d.foreground -or $d.x -lt $monitorX -or $d.y -lt 0 -or ($d.x+$d.width) -gt $monitorRight -or ($d.y+$d.height) -gt 1440) { throw 'Capture refused: owned HWND not foreground/contained in authorized display' }
 foreach($fx in @(0.05,0.25,0.5,0.75,0.95)) { foreach($fy in @(0.05,0.25,0.5,0.75,0.95)) {
  $point=New-Object CU+POINT; $point.X=[int]($d.x+$d.width*$fx); $point.Y=[int]($d.y+$d.height*$fy)
  if([CU]::GetAncestor([CU]::WindowFromPoint($point),2)-ne$h){throw 'Capture refused: another window covers own crop'}
 }}
 Add-Type -AssemblyName System.Drawing
 $bitmap=New-Object Drawing.Bitmap $d.width,$d.height; $g=[Drawing.Graphics]::FromImage($bitmap)
 try {$g.CopyFromScreen($d.x,$d.y,0,0,$bitmap.Size); $bitmap.Save($ImagePath,[Drawing.Imaging.ImageFormat]::Png)} finally {$g.Dispose();$bitmap.Dispose()}
 $ImagePath; exit
}
if ($Action -eq 'close') { [void][CU]::PostMessage($h,0x0010,[IntPtr]::Zero,[IntPtr]::Zero); 'close sent'; exit }
$last=LastInput
Assert-CuBudget
if(@(Get-Process PickerHost,CredentialUIBroker -ErrorAction SilentlyContinue).Count){throw 'Security prompt; no interaction'}
$since=[CU]::GetTickCount()-$last
$explicitGo=$env:ZEDUI_CU_EXPLICIT_GO_UNTIL-and[DateTime]::UtcNow.Ticks-lt[long]$env:ZEDUI_CU_EXPLICIT_GO_UNTIL
if (-not$explicitGo-and$since -lt 120000 -and (-not $TickFile -or -not (Test-Path $TickFile) -or $last -ne [uint32](Get-Content $TickFile))) { "PAUSE human activity idle_ms=$since"; exit 7 }
if ($Action -eq 'move') { $Width=[Math]::Max(800,$Width); if($MoveX-lt$monitorX-or$MoveY-lt0-or$MoveX+$Width-gt$monitorRight-or$MoveY+$Height-gt1440){throw 'Move outside authorized display'}; Start-CuStep; if(-not[CU]::MoveWindow($h,$MoveX,$MoveY,$Width,$Height,$true)){throw 'Own window move refused'};Complete-CuStep; Describe $h | ConvertTo-Json -Compress; exit }
if ($Action -eq 'raise') {
 if($d.cloaked){throw "Own window is DWM-cloaked=$($d.cloaked); no input"}
 if($d.minimized){[void][CU]::ShowWindow($h,9);$d=Describe $h}
 if($d.x-lt$monitorX-or$d.y-lt0-or$d.x+$d.width-gt$monitorRight-or$d.y+$d.height-gt1440){throw 'Raise outside authorized display'}
 Describe $h|ConvertTo-Json -Compress;exit
}
if ($Action -eq 'untop') { [void][CU]::SetWindowPos($h,[IntPtr](-2),0,0,0,0,0x13); Describe $h|ConvertTo-Json -Compress; exit }
if ($d.x -lt $monitorX -or $d.y -lt 0 -or ($d.x+$d.width) -gt $monitorRight -or ($d.y+$d.height) -gt 1440) { throw 'Owned HWND is not contained within authorized display' }
if ($Action -eq 'focus') {
 if($d.cloaked-or$d.minimized){throw 'Own window is cloaked/minimized; no input'}
 $point=New-Object CU+POINT; $point.X=$d.x+100; $point.Y=$d.y+60
 # Dune's verified WSL/PowerShell route satisfies Windows' foreground lock.
 Start-CuStep
 try {[CU]::keybd_event(0x12,0,0,[UIntPtr]::Zero)} finally {[CU]::keybd_event(0x12,0,2,[UIntPtr]::Zero)}
 $focusRequested=[CU]::SetForegroundWindow($h)
 Start-Sleep -Milliseconds 300
 if ([CU]::GetForegroundWindow() -ne $h -or [CU]::GetAncestor([CU]::WindowFromPoint($point),2) -ne $h) { throw "Focus refused: foregroundRequested=$focusRequested ownCloaked=$($d.cloaked); exact owned window is not foreground/visibly reachable" }
 if ($TickFile) { Set-Content $TickFile ([string](LastInput)) }
 Complete-CuStep
 Describe $h | ConvertTo-Json -Compress; exit
}
if ($Action -eq 'type') {
 if ([CU]::GetForegroundWindow() -ne $h) { throw 'Owned HWND is not foreground; no input sent' }
 Start-CuStep
 foreach($chunk in ([regex]::Matches($Text,'[\^+%]?\{[^}]+\}|[\^+%].|[^{\^+%]{1,6}') | ForEach-Object {$_.Value})) {
  Assert-CuBudget
  if ([CU]::GetForegroundWindow() -ne $h) { throw 'Focus changed; input aborted' }
  if(-not$explicitGo-and$TickFile-and(Test-Path $TickFile)-and(LastInput)-ne[uint32](Get-Content $TickFile)){throw 'Human input changed; typing aborted'}
  [Windows.Forms.SendKeys]::SendWait($chunk)
  if($TickFile){Set-Content $TickFile ([string](LastInput))}
 }
 if ($TickFile) { Set-Content $TickFile ([string](LastInput)) }
 Complete-CuStep
 'typed'; exit
}
if ($Action -eq 'click' -or $Action -eq 'activate-click' -or $Action -eq 'hover') {
 if ($Action -eq 'activate-click' -or $Action -eq 'click' -or $Action -eq 'hover') {
  $point=New-Object CU+POINT; $point.X=$X; $point.Y=$Y
  if ([CU]::GetAncestor([CU]::WindowFromPoint($point),2) -ne $h) {throw 'Activation point is not visibly owned HWND; no click sent'}
 } elseif ([CU]::GetForegroundWindow() -ne $h) { throw 'Owned HWND is not foreground; no click sent' }
 if ($X -lt $d.x -or $Y -lt $d.y -or $X -ge $d.x+$d.width -or $Y -ge $d.y+$d.height) {throw 'Click outside owned window'}
 Start-CuStep
 [void][CU]::SetCursorPos($X,$Y)
 if ($Action -ne 'activate-click' -and [CU]::GetForegroundWindow() -ne $h) {throw 'Focus changed; click aborted'}
 if ($Action -eq 'hover') {if ($TickFile) {Set-Content $TickFile ([string](LastInput))}; Complete-CuStep; 'hovered'; exit}
 [CU]::mouse_event(2,0,0,0,[UIntPtr]::Zero); [CU]::mouse_event(4,0,0,0,[UIntPtr]::Zero)
 if ($TickFile) {Set-Content $TickFile ([string](LastInput))}
 Complete-CuStep
 'clicked'; exit
}
throw 'Unknown action'
