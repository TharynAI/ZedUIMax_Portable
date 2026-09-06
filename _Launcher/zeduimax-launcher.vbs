' ZedUIMax Session Launcher - hidden/no-console launch
' Called from Windows right-click context menu via registry.

Set WshShell = CreateObject("WScript.Shell")
Set FSO = CreateObject("Scripting.FileSystemObject")

scriptDir = FSO.GetParentFolderName(WScript.ScriptFullName)
cmdPath = scriptDir & "\zeduimax-launcher.cmd"

' Use the shared CMD launcher so manual launch and context-menu launch stay identical.
WshShell.Run "cmd.exe /c """ & cmdPath & """", 0, False
