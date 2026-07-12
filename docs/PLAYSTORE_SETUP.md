# PHENIX: NULL EDEN — Google Play Setup (ο δρόμος είναι στρωμένος)

## Τι υπάρχει ΗΔΗ (μπήκε 2026-07-12)
- **PWA πλήρες**: manifest.json (fullscreen, landscape, εικονίδια 192/512 από την τέχνη σου
  — άλλαξέ τα όποτε θες με δικά σου στο assets/pwa/) + sw.js (network-first service worker).
  Το παιχνίδι είναι ήδη ΕΓΚΑΤΑΣΤΑΣΙΜΟ από Chrome κινητού («Προσθήκη στην αρχική οθόνη»)
  και τρέχει fullscreen σαν εφαρμογή — δοκίμασέ το τώρα!
- **Touch controls πλήρη**: joystick, DASH/Q/E/ULT, pause, fullscreen, taps παντού
  (menus, κάρτες, campaign stages).
- **Gamepad πλήρες** (παίζει και σε Android με Bluetooth χειριστήριο): PS4/PS5/Xbox/PC pads,
  κίνηση/dash/Q/E/Ult/pause/menus/aim/rumble.
- Το PlatformAchievements bridge μπορεί αργότερα να δεχθεί και Google Play Games.

## Βήματα για το Play Store
1. **Google Play Console** λογαριασμός — $25 εφάπαξ. https://play.google.com/console
2. **Bubblewrap** (το επίσημο εργαλείο TWA της Google):
   ```bash
   npm i -g @bubblewrap/cli
   bubblewrap init --manifest https://mariastergiou1985-cpu.github.io/phenix_survivors_game/manifest.json
   bubblewrap build
   ```
   Παράγει έτοιμο .aab (Android App Bundle) + .apk για δοκιμή στο κινητό σου.
3. **Digital Asset Links**: το bubblewrap σου δίνει ένα assetlinks.json → το ανεβάζεις στο
   repo στη διαδρομή `.well-known/assetlinks.json` (σκέτο commit+push, το GitHub Pages το σερβίρει).
   Αυτό «δένει» το app με το site σου ώστε να τρέχει χωρίς μπάρα browser.
4. Ανέβασμα .aab στο Play Console → store listing (εικόνες/περιγραφή — τέχνη σου!) → review.

## Σημειώσεις
- Το παιχνίδι σερβίρεται ΠΑΝΤΑ από το GitHub Pages — κάθε push σου ενημερώνει ΚΑΙ το app
  αυτόματα, χωρίς νέο upload στο Play Store. (Αυτή είναι η μαγεία του TWA.)
- Απόδοση σε κινητά: το enemy cap κλιμακώνεται ήδη· αν χρειαστεί mobile προφίλ
  (χαμηλότερα caps σε μικρές οθόνες) το προσθέτουμε εύκολα.
- Για Google Play Games achievements: δεύτερο injection στο PlatformAchievements,
  ίδια λογική με το Steam.
