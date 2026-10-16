@echo off
setlocal
cd /d "%~dp0.."
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js 22+ is required. Install it on THIS PC, then reopen this file.
  pause
  exit /b 1
)
node scripts\generate-owner-secrets.mjs
pause
