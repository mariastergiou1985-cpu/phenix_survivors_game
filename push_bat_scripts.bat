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

taskkill /IM GitHubDesktop.exe /F >nul 2>&1
timeout /t 2 /nobreak >nul
if exist .git\index.lock del /f /q .git\index.lock
if exist .git\HEAD.lock  del /f /q .git\HEAD.lock

%GIT% add push_euclid_dash.bat push_euclid_multishot.bat push_taekwondo_ice.bat
%GIT% commit -m "chore: add push bat scripts for euclid multishot, dash, taekwondo ice field"
%GIT% push

echo.
echo === Done! ===
pause
