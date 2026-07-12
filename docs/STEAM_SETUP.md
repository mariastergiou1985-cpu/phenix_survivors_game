# PHENIX: NULL EDEN — Steam Setup (έτοιμο για όταν έρθει η ώρα)

## Τι υπάρχει ΗΔΗ μέσα στο παιχνίδι
- `js/platform/PlatformAchievements.js` — το bridge. Κάθε achievement που κερδίζεται
  καταγράφεται μόνιμα (localStorage journal). Στο browser: αόρατο. Στο Steam build:
  η ίδια κλήση ανάβει το πραγματικό Steam achievement, και στο πρώτο άνοιγμα το
  `syncPending()` ΞΑΝΑΠΑΙΖΕΙ ό,τι κερδήθηκε στο web — κανείς δεν χάνει τίποτα.
- Hook στο μοναδικό σημείο ξεκλειδώματος (MetaProgress.unlockEndlessAchievements).

## Βήματα για το Steam (με τη σειρά)
1. **Steamworks λογαριασμός** → https://partner.steamgames.com → Steam Direct fee $100 → παίρνεις App ID.
2. **Achievements στο dashboard**: Stats & Achievements → New Achievement — βάλε τα
   API Names ΑΚΡΙΒΩΣ όπως στον πίνακα παρακάτω. Ανέβασε 64x64 εικονίδια (τέχνη σου!).
3. **Electron shell** (το .exe):
   ```bash
   npm init -y && npm i electron steamworks.js --save
   ```
   `main.js` (Electron): άνοιξε BrowserWindow στο index.html του παιχνιδιού, με preload.
   `preload.js`:
   ```js
   const steamworks = require('steamworks.js');
   const client = steamworks.init(YOUR_APP_ID);
   window.phenixSteam = {
     isReady: () => !!client,
     activate: (apiName) => { try { client.achievement.activate(apiName); } catch (e) {} },
   };
   ```
   Αυτό είναι ΟΛΟ — το παιχνίδι δεν αλλάζει ούτε γραμμή.
4. `steam_appid.txt` με το App ID δίπλα στο exe για τοπικό testing.
5. Πακετάρισμα: `electron-builder` → NSIS installer ή portable → upload μέσω SteamPipe.

## Πίνακας mapping (copy-paste στο Steamworks)
| Game id | Steam API Name | Τίτλος |
|---|---|---|
| first_endless | ACH_FIRST_ENDLESS | FIRST ENDLESS RUN |
| endless_survivor | ACH_ENDLESS_SURVIVOR | ENDLESS SURVIVOR |
| grid_legend | ACH_GRID_LEGEND | GRID LEGEND |
| level_breaker | ACH_LEVEL_BREAKER | LEVEL BREAKER |
| score_hunter | ACH_SCORE_HUNTER | SCORE HUNTER |
| combo_master | ACH_COMBO_MASTER | COMBO MASTER |
| core_defender | ACH_CORE_DEFENDER | CORE DEFENDER |
| endless_titan | ACH_ENDLESS_TITAN | ENDLESS TITAN |
| score_legend | ACH_SCORE_LEGEND | SCORE LEGEND |
| level_ascendant | ACH_LEVEL_ASCENDANT | LEVEL ASCENDANT |
| combo_god | ACH_COMBO_GOD | COMBO GOD |
| core_warden | ACH_CORE_WARDEN | CORE WARDEN |

Νέα achievements στο μέλλον: πρόσθεσέ τα στο STEAM_ACHIEVEMENT_MAP (ένα ζεύγος
γραμμή) + στο Steamworks dashboard. Τίποτα άλλο.
