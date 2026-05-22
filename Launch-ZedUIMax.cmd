@echo off
setlocal
set "SCRIPT_DIR=%~dp0"
set "LAUNCHER_PS=%SCRIPT_DIR%_Launcher\zeduimax-launcher.ps1"

if /I "%~1"=="/console" (
    goto run_console
)

start "ZedUIMax Portable Launcher" /MIN powershell.exe -NoLogo -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File "%LAUNCHER_PS%" %*
exit /b 0

:run_console
shift /1
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%LAUNCHER_PS%" %1 %2 %3 %4 %5 %6 %7 %8 %9
exit /b %ERRORLEVEL%
