# Phenix Survivors Game

HTML5 Canvas cyberpunk survival game — no install, runs in any modern browser.

## Play Online

After enabling GitHub Pages (see below), the game will be live at:

```
https://<your-github-username>.github.io/phenix_survivors_game/
```

## Run Locally

```bash
cd phenix_survivors_game
python -m http.server 8000
```

Then open: http://localhost:8000

## Deploy to GitHub Pages

1. Push this repo to GitHub as `phenix_survivors_game`
2. Go to the repo on GitHub
3. Click **Settings** → **Pages**
4. Under *Build and deployment*, set:
   - **Source**: Deploy from a branch
   - **Branch**: `main` → `/ (root)`
5. Click **Save**
6. Wait ~60 seconds, then visit:
   `https://<your-github-username>.github.io/phenix_survivors_game/`

## Controls

| Key / Action | Effect |
|---|---|
| WASD / Arrow keys | Move |
| Mouse | Aim |
| Left click | Shoot |
| Q | Sonic Pulse |
| E | EMP Cloud |
| M | Mute / unmute audio |
| ESC | Pause / back to menu |
| R | Restart (after game over) |
| 1 / 2 / 3 | Select upgrade card |

## Tech Stack

- Vanilla HTML5 Canvas (no framework, no build step)
- ES Modules (`type="module"`)
- Web Audio API for sound
