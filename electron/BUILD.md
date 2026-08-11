# PHENIX: NULL EDEN — Πώς φτιάχνεις το .exe (στον υπολογιστή σου, Windows)

## ΔΥΟ ΔΙΑΦΟΡΕΤΙΚΑ EXE — μην τα μπερδέψεις

| | φορτώνει | internet | για Steam |
|---|---|---|---|
| **αυτός ο φάκελος** (`npm run dist`) | `game/index.html` από τον δίσκο | **ΟΧΙ** | **ναι — αυτό ανεβάζεις** |
| `.github/workflows/build-exe.yml` | `https://mariastergiou1985-cpu.github.io/…` | **ΝΑΙ, πάντα** | όχι |

Το workflow στο GitHub **δεν χρησιμοποιεί το `main.js` αυτού του φακέλου** — γράφει δικό του
`app/main.js` με `loadURL(...)` στο live GitHub Pages. Το exe που βγάζει είναι ένα παράθυρο γύρω
από την ιστοσελίδα: χωρίς internet δείχνει λευκή/μαύρη οθόνη. Χρήσιμο για γρήγορο demo,
**ακατάλληλο για Steam.**

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

## Steam — τι λείπει ακόμη
- `preload.js` κάνει `require('steamworks.js')`, αλλά **δεν είναι δηλωμένο dependency**. Μέχρι να
  τρέξεις `npm install steamworks.js`, το Steam bridge πέφτει πάντα στο catch και τα achievements
  δεν φτάνουν στο Steam (το παιχνίδι παίζει κανονικά — απλά χωρίς Steam achievements).
- Στο `preload.js` άλλαξε `APP_ID = 480` με το δικό σου App ID όταν το πάρεις.
- Δίπλα στο .exe βάλε αρχείο `steam_appid.txt` με το App ID (για τοπικό testing).
- Τα fonts (Press Start 2P / Orbitron / Share Tech Mono) κατεβαίνουν από Google Fonts. Χωρίς
  internet το παιχνίδι παίζει κανονικά αλλά με fallback γραμματοσειρές. Για Steam αξίζει να
  μπουν τοπικά.
