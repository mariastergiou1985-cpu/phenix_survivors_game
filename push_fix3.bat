@echo off
cd /d "%~dp0"

:: Find git in common locations
set GIT=
if exist "C:\Program Files\Git\bin\git.exe" set GIT="C:\Program Files\Git\bin\git.exe"
if exist "C:\Program Files\Git\cmd\git.exe" set GIT="C:\Program Files\Git\cmd\git.exe"
if not defined GIT (
  for /f "delims=" %%i in ('where git 2^>nul') do set GIT="%%i"
)
if not defined GIT (
  :: Try GitHub Desktop bundled git
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

:: Remove stale lock
if exist .git\index.lock del /f /q .git\index.lock

%GIT% add js/main.js js/audio/AudioManager.js js/game/HUD.js
%GIT% commit -m "fix: restore truncated requestAnimationFrame in game loop + audio/equalizer patches"
%GIT% push

echo.
echo === Done! ===
pause
