@echo off
:: ZedUIMax Session Launcher
:: Delegates launch/validation to PowerShell script (with explicit failure reporting).

set "SCRIPT_DIR=%~dp0"
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%SCRIPT_DIR%zeduimax-launcher.ps1"
