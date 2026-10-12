@echo off
cd /d "%~dp0.."

echo.
echo   ==========================================
echo     Blog Admin  -  local writing tool
echo   ==========================================
echo.
echo   Editor :  http://127.0.0.1:4321
echo   Project:  %CD%
echo.
echo   The browser will open in a moment.
echo   Keep this window open; press Ctrl+C to stop.
echo.

start "" powershell -WindowStyle Hidden -Command "Start-Sleep 2; Start-Process 'http://127.0.0.1:4321'"

node "tools\server.js"

echo.
echo   Server stopped.
pause
