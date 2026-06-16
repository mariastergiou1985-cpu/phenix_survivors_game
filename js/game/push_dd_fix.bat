@echo off
del /f /q "C:\Users\maria\OneDrive\code\phenix_survivors_game\.git\HEAD.lock" >nul 2>&1
del /f /q "C:\Users\maria\OneDrive\code\phenix_survivors_game\.git\index.lock" >nul 2>&1
set GIT=
for /d %%D in ("C:\Users\maria\AppData\Local\GitHubDesktop\app-*") do (
    if exist "%%D\resources\app\git\cmd\git.exe" set GIT=%%D\resources\app\git\cmd\git.exe
)
if not defined GIT set GIT=C:\Program Files\Git\cmd\git.exe
cd /d "C:\Users\maria\OneDrive\code\phenix_survivors_game"
"%GIT%" add js/game/Game.js js/game/push_dd_fix.bat
"%GIT%" commit -m "fix: Euclid auto-weapons now damage DoubleDemon via _ddParent proxy"
"%GIT%" push origin main
echo Done!
pause
