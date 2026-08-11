# PHENIX: NULL EDEN — Πώς φτιάχνεις το .exe (στον υπολογιστή σου, Windows)

## ΔΥΟ ΔΙΑΦΟΡΕΤΙΚΑ EXE — μην τα μπερδέψεις

| | φορτώνει | internet | για Steam |
|---|---|---|---|
| **αυτός ο φάκελος** (`npm run dist`) | `game/index.html` από τον δίσκο | **ΟΧΙ** | **ναι — αυτό ανεβάζεις** |
| `.github/workflows/build-exe.yml` | **το ίδιο** `game/index.html` | **ΟΧΙ** | ναι — ίδιο build |

Μέχρι τις 2026-08-11 το workflow **δεν χρησιμοποιούσε το `main.js` αυτού του φακέλου** — έγραφε
δικό του `app/main.js` με `loadURL(...)` στο live GitHub Pages, οπότε το exe ήταν ένα παράθυρο
γύρω από την ιστοσελίδα και χωρίς internet έδειχνε λευκή οθόνη. Τώρα τρέχει `prepare-game.js` +
`npm run dist`, δηλαδή **ακριβώς το ίδιο build με το τοπικό**, και μετά κάνει smoke-test το
παραγόμενο .exe με όλα τα DNS κλειστά.

Το `main.js` εδώ κάνει `win.loadFile(game/index.html)`. Επαληθεύτηκε στις 2026-08-11 σε πραγματικό
Electron 33.2.0 με **όλα τα DNS μπλοκαρισμένα** (`--host-resolver-rules="MAP * ~NOTFOUND"`):
το παιχνίδι φόρτωσε και ζωγράφισε κανονικά, 0 renderer errors. Βλ.
`tools/qa/browser/release_package_proof.mjs`.

## Προαπαιτούμενα (μία φορά)
1. Node.js LTS: https://nodejs.org (κατέβασε + install, όλα default)

## Χτίσιμο
Άνοιξε PowerShell ΜΕΣΑ στον φάκελο C:\Dev\phenix_survivors_game\electron και τρέξε:

    npm install
    node prepare-game.js     # αντιγράφει τα αρχεία του παιχνιδιού στο electron/game/
    npm start                # δοκιμή: ανοίγει το παιχνίδι σε παράθυρο ΤΩΡΑ

Όταν παίζει σωστά:

    npm run dist             # φτιάχνει το installer .exe στο electron/dist/

### Τι ΔΕΝ μπαίνει στο πακέτο
Το `prepare-game.js` κρατάει μόνο ό,τι τρέχει το παιχνίδι. Πετάει έξω source/spec `.zip`,
`*.png.orig.bak` art backups, Blender `.py`/`.bat`, `desktop.ini`, internal `.md`/`.csv`/`.txt`,
και ό,τι δεν είναι tracked στο git. Τυπώνει τη λίστα όσων άφησε έξω — **κοίταξέ την** πριν
ανεβάσεις. Τελευταία μέτρηση: 644 αρχεία / 839 MB στο πακέτο, 17 αρχεία / 97.5 MB έξω.

## Steam

Το `steamworks.js` είναι **κανονικό dependency** πλέον (`dependencies`, όχι dev), και το
`main.js` έχει `sandbox: false`. Αυτό το δεύτερο ήταν ο πραγματικός λόγος που το Steam bridge
δεν δούλεψε ποτέ: από το Electron 20 τα preload scripts τρέχουν sandboxed και το `require()` τους
βλέπει μόνο μια μικρή λίστα — όχι native modules. Το `require('steamworks.js')` έσκαγε πάντα με
"module not found" και το catch το εμφάνιζε σαν «δεν τρέχει το Steam».

### App ID — ΔΕΝ είναι πια γραμμένο στο preload.js
Δεν υπάρχει ακόμη PHENIX App ID στο project και **δεν εφευρέθηκε**. Το `preload.js` το ψάχνει,
με αυτή τη σειρά:

1. `STEAM_APP_ID` environment variable
2. `steam_appid.txt` **δίπλα στο .exe** ← αυτό θα χρησιμοποιείς
3. `steam_appid.txt` μέσα στα resources

Αν δεν βρει τίποτα, **δεν κάνει init**: `isReady()` false, τα achievements συνεχίζουν να
γράφονται στο τοπικό journal, και το `syncPending()` (js/main.js, 3s μετά το boot) τα στέλνει
ΟΛΑ στο Steam την πρώτη φορά που θα τρέξει build με πραγματικό App ID. Δεν χάνεται τίποτα.

Το **480 (Valve Spacewar) απορρίπτεται**. Ένα production build με 480 κάνει init κανονικά και
γράφει τα achievements του παίκτη σε ξένο app — φαίνεται ότι δουλεύει ενώ δεν φτάνει τίποτα στο
PHENIX. Για τοπικό test μόνο: `set PHENIX_STEAM_ALLOW_TEST_APPID=1`.

**Όταν πάρεις το App ID:** γράψε το σε `steam_appid.txt` δίπλα στο exe. Καμία αλλαγή κώδικα.

### Έλεγχος
    npm run selftest

Ανοίγει το ΠΡΑΓΜΑΤΙΚΟ shell κρυφά, περιμένει το παιχνίδι, διαβάζει τον καμβά και τυπώνει μία
γραμμή: `PHENIX_SELFTEST_RESULT::PASS` ή `FAIL`. Το ίδιο τρέχει και το CI πάνω στο παραγόμενο
.exe με όλα τα DNS κλειστά. Μετρημένο 2026-08-11 (Electron 33.2.0, DNS blackholed):
`booted:true, luminance:31, steamBridge:true, achievementsBridged:true, errors:[]`.

### Τι μένει
- Πραγματικό Steam App ID (μόνο αυτό λείπει για achievements στο Steam).
- Τα fonts (Press Start 2P / Orbitron / Share Tech Mono) κατεβαίνουν από Google Fonts. Χωρίς
  internet το παιχνίδι παίζει κανονικά αλλά με fallback γραμματοσειρές. Για Steam αξίζει να
  μπουν τοπικά.
