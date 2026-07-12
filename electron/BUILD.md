# PHENIX: NULL EDEN — Πώς φτιάχνεις το .exe (στον υπολογιστή σου, Windows)

## Προαπαιτούμενα (μία φορά)
1. Node.js LTS: https://nodejs.org (κατέβασε + install, όλα default)

## Χτίσιμο
Άνοιξε PowerShell ΜΕΣΑ στον φάκελο C:\Dev\phenix_survivors_game\electron και τρέξε:

    npm install
    node prepare-game.js     # αντιγράφει τα αρχεία του παιχνιδιού στο electron/game/
    npm start                # δοκιμή: ανοίγει το παιχνίδι σε παράθυρο ΤΩΡΑ

Όταν παίζει σωστά:

    npm run dist             # φτιάχνει το installer .exe στο electron/dist/

## Steam
- Στο preload.js άλλαξε APP_ID = 480 με το δικό σου App ID όταν το πάρεις.
- Δίπλα στο .exe βάλε αρχείο steam_appid.txt με το App ID (για τοπικό testing).
- Τα achievements δουλεύουν αυτόματα — είναι ήδη καλωδιωμένα στο παιχνίδι.
