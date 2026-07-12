// Copies the web game into electron/game/ (run before npm start / npm run dist).
const fs = require('fs'); const path = require('path');
const SRC = path.join(__dirname, '..');
const DST = path.join(__dirname, 'game');
const TAKE = ['index.html', 'manifest.json', 'sw.js', 'js', 'assets'];
fs.rmSync(DST, { recursive: true, force: true });
fs.mkdirSync(DST, { recursive: true });
for (const item of TAKE) {
  const s = path.join(SRC, item), d = path.join(DST, item);
  if (!fs.existsSync(s)) { console.warn('skip missing', item); continue; }
  fs.cpSync(s, d, { recursive: true });
  console.log('copied', item);
}
console.log('game/ ready — now: npm start');
