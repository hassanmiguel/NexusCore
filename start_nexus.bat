@echo off
setlocal
cd /d "%~dp0"
echo Closing any running NexusCore...
taskkill /F /IM "WormGPT - Unleashed and Uncensored.exe" >nul 2>&1
timeout /t 1 >nul
echo Starting NexusCore...
if exist "dist\win-unpacked\WormGPT - Unleashed and Uncensored.exe" (
  start "" "dist\win-unpacked\WormGPT - Unleashed and Uncensored.exe"
) else (
  call npm run build:renderer
  call npx electron .
)
endlocal