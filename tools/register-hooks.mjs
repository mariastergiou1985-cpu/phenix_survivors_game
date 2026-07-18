// Εγκαθιστά το strip-v resolve hook (node:module.register) — χρήση:
//   node --import ./tools/register-hooks.mjs tools/validate_data.mjs
import { register } from 'node:module';
register('./strip-v-loader.mjs', import.meta.url);
