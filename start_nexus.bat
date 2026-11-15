@echo off
setlocal
cd /d "%~dp0"
echo Starting NexusCore...
if exist "dist\win-unpacked\WormGPT - Unleashed and Uncensored.exe" (
  start "" "dist\win-unpacked\WormGPT - Unleashed and Uncensored.exe"
) else (
  call npm run build:renderer
  call npx electron .
)
endlocal