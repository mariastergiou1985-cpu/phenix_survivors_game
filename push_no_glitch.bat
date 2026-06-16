@echo off
cd /d "%~dp0"

set GIT=
if exist "C:\Program Files\Git\bin\git.exe" set GIT="C:\Program Files\Git\bin\git.exe"
if exist "C:\Program Files\Git\cmd\git.exe" set GIT="C:\Program Files\Git\cmd\git.exe"
if not defined GIT (
  for /f "delims=" %%i in ('where git 2^>nul') do set GIT="%%i"
)
if not defined GIT (
  for /d %%d in ("%LOCALAPPDATA%\GitHubDesktop\app-*") do (
    if exist "%%d\resources\app\git\cmd\git.exe" set GIT="%%d\resources\app\git\cmd\git.exe"
  )
)

if not defined GIT (
  echo ERROR: git not found!
  pause
  exit /b 1
)

echo Using git: %GIT%

taskkill /IM GitHubDesktop.exe /F >nul 2>&1
timeout /t 2 /nobreak >nul
if exist .git\index.lock del /f /q .git\index.lock

%GIT% add js/game/Game.js
%GIT% commit -m "fix: remove chaos glitch transition — instant clean Chaos Mode activation"
%GIT% push

echo.
echo === Done! ===
pause
