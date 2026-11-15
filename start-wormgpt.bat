@echo off
title WormGPT - Launcher
cd /d "%~dp0"

where npm >nul 2>&1
if errorlevel 1 (
  echo Node.js was not found. Install it first from https://nodejs.org
  echo Then run this file again.
  pause
  exit /b 1
)

if not exist node_modules (
  echo Installing dependencies... this only happens the first time.
  call npm install
  if errorlevel 1 (
    echo npm install failed.
    pause
    exit /b 1
  )
)

echo Starting WormGPT...
call npm start

set "EXIT_CODE=%errorlevel%"
echo.
echo WormGPT closed.
if not "%EXIT_CODE%"=="0" (
  echo It exited with an error code: %EXIT_CODE%
)
pause