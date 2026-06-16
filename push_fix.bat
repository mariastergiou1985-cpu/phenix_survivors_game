@echo off
cd /d "%~dp0"
if exist .git\index.lock del /f .git\index.lock
git add js/main.js js/audio/AudioManager.js js/game/HUD.js
git commit -m "fix: restore truncated requestAnimationFrame in game loop + audio/equalizer patches"
git push
echo.
echo Done! Press any key to close.
pause
