@echo off
:: Delete stale git locks
del /f /q "C:\Users\maria\OneDrive\code\phenix_survivors_game\.git\HEAD.lock" >nul 2>&1
del /f /q "C:\Users\maria\OneDrive\code\phenix_survivors_game\.git\index.lock" >nul 2>&1

:: Find git — check common install locations
set GIT=
if exist "C:\Program Files\Git\cmd\git.exe" set GIT=C:\Program Files\Git\cmd\git.exe
if exist "C:\Program Files (x86)\Git\cmd\git.exe" set GIT=C:\Program Files (x86)\Git\cmd\git.exe
for /d %%D in ("C:\Users\maria\AppData\Local\GitHubDesktop\app-*") do (
    if exist "%%D\resources\app\git\cmd\git.exe" set GIT=%%D\resources\app\git\cmd\git.exe
)

if not defined GIT (
    echo ERROR: git.exe not found. Add git to PATH and retry.
    pause
    exit /b 1
)
echo Using git: %GIT%

cd /d "C:\Users\maria\OneDrive\code\phenix_survivors_game"
"%GIT%" add js/game/Game.js js/game/push_overload_fix.bat
"%GIT%" commit -m "fix: Overload rises in Act 1 - drain 1.0 to 0.12 per sec, dump hit +2pct, Chaos Mode guard, gentle floor"
"%GIT%" push origin main
echo Done!
pause
