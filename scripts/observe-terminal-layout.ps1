param()
$ErrorActionPreference='Stop'
[Console]::OutputEncoding=New-Object Text.UTF8Encoding($false)
Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
# START> Tharyn | ZedUIMax
# 2026-11-04: Read-only Terminal topology evidence; never focus, select, move or close a window.
Add-Type @'
using System;using System.Text;using System.Collections.Generic;using System.Runtime.InteropServices;
public static class ZedLayoutObserver {
 public delegate bool Callback(IntPtr h,IntPtr p);
 [StructLayout(LayoutKind.Sequential)] public struct Rect { public int L,T,R,B; }
 [StructLayout(LayoutKind.Sequential)] public struct Point { public int X,Y; }
 [StructLayout(LayoutKind.Sequential)] public struct Placement { public int length,flags,showCmd;public Point min,max;public Rect normal; }
 [DllImport("user32.dll")] static extern bool EnumWindows(Callback c,IntPtr p);
 [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern int GetClassName(IntPtr h,StringBuilder b,int n);
 [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
 [DllImport("user32.dll")] public static extern bool IsIconic(IntPtr h);
 [DllImport("user32.dll")] public static extern bool IsZoomed(IntPtr h);
 [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h,out Rect r);
 [DllImport("user32.dll")] public static extern bool GetWindowPlacement(IntPtr h,ref Placement p);
 [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr h,out uint p);
 [DllImport("user32.dll")] public static extern uint GetDpiForWindow(IntPtr h);
 [DllImport("user32.dll")] public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr context);
 public static long[] Windows(){var a=new List<long>();EnumWindows((h,p)=>{var b=new StringBuilder(256);GetClassName(h,b,256);if(b.ToString()=="CASCADIA_HOSTING_WINDOW_CLASS")a.Add(h.ToInt64());return true;},IntPtr.Zero);return a.ToArray();}
}
'@
$previousDpiContext=[ZedLayoutObserver]::SetThreadDpiAwarenessContext([intptr](-4))
$windows=@();$errors=@()
foreach($handle in [ZedLayoutObserver]::Windows()){
 $h=[intptr]$handle
 if(-not [ZedLayoutObserver]::IsWindowVisible($h) -and -not [ZedLayoutObserver]::IsIconic($h)){continue}
 try{
  [uint32]$owner=0;[void][ZedLayoutObserver]::GetWindowThreadProcessId($h,[ref]$owner)
  $process=Get-Process -Id $owner
  if($process.ProcessName -ne 'WindowsTerminal'){throw 'Unexpected Terminal HWND process'}
  $rect=New-Object ZedLayoutObserver+Rect
  if(-not [ZedLayoutObserver]::GetWindowRect($h,[ref]$rect)){throw 'Window bounds unavailable'}
  $placement=New-Object ZedLayoutObserver+Placement
  $placement.length=[Runtime.InteropServices.Marshal]::SizeOf($placement)
  if(-not [ZedLayoutObserver]::GetWindowPlacement($h,[ref]$placement)){throw 'Normal window placement unavailable'}
  $root=[Windows.Automation.AutomationElement]::FromHandle($h)
  $condition=New-Object Windows.Automation.PropertyCondition([Windows.Automation.AutomationElement]::ControlTypeProperty,[Windows.Automation.ControlType]::TabItem)
  $tabs=@();$tabError=$null
  try{
   $index=0
   foreach($tab in $root.FindAll([Windows.Automation.TreeScope]::Descendants,$condition)){
    $selection=$null;$selected=$null
    if($tab.TryGetCurrentPattern([Windows.Automation.SelectionItemPattern]::Pattern,[ref]$selection)){$selected=$selection.Current.IsSelected}
    $bounds=$tab.Current.BoundingRectangle
    $tabs+=@{index=$index;title=$tab.Current.Name;automationId=$tab.Current.AutomationId;selected=$selected;runtimeId=@($tab.GetRuntimeId());bounds=@{x=$bounds.X;y=$bounds.Y;width=$bounds.Width;height=$bounds.Height};offscreen=$tab.Current.IsOffscreen;splitTopology='unknown'}
    $index++
   }
  }catch{$tabError='UIA tab enumeration failed: '+$_.Exception.GetType().Name}
  $windows+=@{
   hwnd=[string]$handle;pid=$owner;processStart=$process.StartTime.ToUniversalTime().ToString('o');
   wtVersion=$process.MainModule.FileVersionInfo.FileVersion;
   windowName=$null;windowId=$null;title=$root.Current.Name;
   rect=@{x=$rect.L;y=$rect.T;width=$rect.R-$rect.L;height=$rect.B-$rect.T};
   normalPlacement=@{x=$placement.normal.L;y=$placement.normal.T;width=$placement.normal.R-$placement.normal.L;height=$placement.normal.B-$placement.normal.T;coordinateSpace='workspace'};
   dpi=[ZedLayoutObserver]::GetDpiForWindow($h);maximized=[ZedLayoutObserver]::IsZoomed($h);minimized=[ZedLayoutObserver]::IsIconic($h);
   tabs=@($tabs);tabError=$tabError;tabOrderEvidence='UIA traversal order; visual-order proof pending'
  }
 }catch{$errors+=@{hwnd=[string]$handle;error=$_.Exception.GetType().Name}}
}
if($previousDpiContext -ne [intptr]::Zero){[void][ZedLayoutObserver]::SetThreadDpiAwarenessContext($previousDpiContext)}
@{schemaVersion=1;capturedAt=[datetimeoffset]::UtcNow.ToString('o');machineName=$env:COMPUTERNAME;windows=@($windows);errors=@($errors);sideEffects='none'}|ConvertTo-Json -Depth 10 -Compress
# <END Tharyn | ZedUIMax
