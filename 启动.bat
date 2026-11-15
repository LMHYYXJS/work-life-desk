@echo off
setlocal
cd /d "%~dp0"
set "PYW=%~dp0app\runtime\pythonw.exe"
if not exist "%PYW%" (
  echo Python runtime missing: app\runtime\pythonw.exe
  pause
  exit /b 1
)
start "" "%PYW%" "%~dp0app\server.py"
endlocal
