@echo off
setlocal
powershell -NoProfile -ExecutionPolicy Bypass -Command "$p='%~dp0app\runtime\pythonw.exe'; 8848..8878 | ForEach-Object { try { Get-NetTCPConnection -LocalPort $_ -State Listen -ErrorAction Stop | ForEach-Object { $proc=(Get-Process -Id $_.OwningProcess -ErrorAction SilentlyContinue); if ($proc -and $proc.Path -eq $p) { Stop-Process -Id $proc.Id -Force } } } catch {} }"
echo Closed.
endlocal
