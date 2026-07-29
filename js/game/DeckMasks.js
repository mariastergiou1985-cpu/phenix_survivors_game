// ══════════════════════════════════════════════════════════════════════════════════════════════
// DECK MASKS — MULTI-DECK MAP (BATCH 1, 2026-07-28; OPEN-FLOOR REVISION 2026-07-29)
// ----------------------------------------------------------------------------------------------
// Explicit, frozen walkability data for the four authored section decks. GENERATED OFFLINE and
// checked in as data; the game NEVER classifies pixels at runtime.
//
// WHY A MASK AND NOT MORE AUTHORED ROWS
// The two MAIN strips are single horizontal floor bands, so CITY_WALK_ROWS / CHAOS_WALK_ROWS
// describe them exactly and are still the authority for those two decks — this file does not
// touch them. The four section assets are not bands: each one is a floor with an irregular
// authored outline — walkways that taper, platforms that end in a drop, an arena cut into a wall
// — and no row range can describe that shape. Each one therefore gets a per-cell mask.
//
// WHY THE SECTIONS ARE SEPARATE DECKS AND NOT A TALLER STRIP (measured 2026-07-28)
//   * gradient NCC across every candidate seam peaked at 0.07-0.15 over a ±70px dx sweep and a
//     -120..+160px overlap sweep, with flat peaks that wander ±100px: there is no shared
//     structure, so there is nothing to stitch to.
//   * the widths do not match — 2172 / 1672 / 2184 — so any single rectangle leaves 250-256px
//     void columns beside the main strip.
//   * the edges are authored boundaries: upper ends on a railing or a floor edge, main begins on
//     a skyline or a window wall. lower_section_endless is a closed arena bordered on all four
//     sides.
// Stacking them would mean inventing art. Each asset is used exactly as drawn instead.
//
// FORMAT
//   cell            8 source pixels; at CITY_SCALE 3 that is 24 world px per cell
//   cols/rows       mask dimensions, floor(imgW/cell) x floor(imgH/cell)
//   bits            base64 of the row-major bitset, MSB first within each byte
//   cropTop/Bottom  rows of pure white padding stripped off the source image before masking.
//                   chaos_mode_map_upper_section.png carries 53 white rows on top and 49 on the
//                   bottom — real content is 622px tall, not 724. Every offset here is measured
//                   against the CONTENT box, never the canvas.
//   anchorCell      the deck side of the MAIN transition, chosen offline as a cell with two
//                   clear cells in every direction (>=120 world px of slack around a 32px player)
//
// WHAT BLOCKS: THE OUTER VOID, AND NOTHING ELSE (Maria's decision, 2026-07-29)
// These are survivor maps. The decks have to read as open arenas, so everything drawn INSIDE the
// floor is decoration and nothing more: machines, kiosks, robots, fountains, pillars, bases,
// fences, planters, plants and decorative structures are all walked straight through. The only
// cells that still block are the ones outside the authored deck — the void past a walkway edge,
// the sky above a platform, the wall an arena is cut into. There is no internal collision left.
//
// HOW THE MASK IS DERIVED
// Take the largest 4-connected component of walkable cells, then fill its holes
// (scipy.ndimage.binary_fill_holes, 4-connectivity). Any blocked island fully enclosed by floor
// becomes floor, so what survives as blocked is exactly the region that reaches the edge of the
// deck rectangle. Filling only ever ADDS walkable cells, so an anchorCell that was walkable stays
// walkable; all four were re-checked against the new bits.
//
// MEASURED, BEFORE -> AFTER (walkable cells, and share of the deck rectangle)
//   endless/upper    4741 ->  4741    19.4% -> 19.4%     0 interior islands to fill
//   endless/lower    5927 ->  6136    24.2% -> 25.1%     4 interior islands filled
//   chaos/upper      8353 ->  9941    40.0% -> 47.6%    12 interior islands filled
//   chaos/lower     16389 -> 16594    56.6% -> 57.3%     2 interior islands filled
// Each input already had a single walkable component, so the "before" figure is also the size of
// the kept component. After the fill every deck has exactly ONE walkable component and ZERO
// blocked components that do not touch the deck border, which is the property this data is now
// defined by. endless/upper does not move because it is a suspended walkway that encloses
// nothing: every cell it blocked already opened onto the sky above it or the drop below it.
//
// componentsFound / keptComponentCells / droppedComponentCells describe the shipped mask, so they
// now read 1 / all walkable cells / none for every deck. The 1082-cell second walkway that
// endless/upper once listed as dropped was already absent from the checked-in bits and is not
// reintroduced: it has no authored route to the plaza, and inventing a bridge is still off-limits.
//
// The old cleanup pipeline is gone. No opening, no closing, no minimum corridor width, no
// small-component pruning — those existed to keep prop collision survivable, and there is no prop
// collision any more. The MAIN-strip obstacle masks that shipped in this file were deleted in the
// same pass, so both main strips are back to floor-band collision only.
// ══════════════════════════════════════════════════════════════════════════════════════════════

export const DECK_MASKS = Object.freeze({
  endless: Object.freeze({
    upper: Object.freeze({
      file: 'assets/maps/new_endless/upper_section_endless.png',
      imgW: 2172, imgH: 724,
      cropTop: 0, cropBottom: 0,
      cell: 8, cols: 271, rows: 90,
      walkableCells: 4741, walkablePct: 19.4,
      componentsFound: 1,
      keptComponentCells: 4741,
      droppedComponentCells: [],
      anchorCell: [114, 50],
      bits:
        'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD/+AAAAAAAAAAAAAAAAPgAAAAAAAAAAAAAAAAAAAAAAAAB////AD/+AAAAAAAfAH//AAAAAAAAAAAAAAAAAAAAAAAAB/////////+AAAAAP////gAAAAAAAAAAAAAAAAAAAAAAAA//////////AAAAAH/////AAAAAAAAAAAAAAAAAAAAAAAAf/////////gAAAAD////////gAAAAAAAAAAAAAAAAAAAAP/////////wAAAAB////////wP+AAAAAAAAAAAAAAAAAAH/////////4AAAAA////////4H/4AAAAAAAAAAAAAAAAAP/////////8AAAAAf///////8D/8AAAAAAAAAAAAAAAAAH/////////+AAAAAP///////+B/+AAAAAAAAAAAAAAAAAD//////////wAAAAH///////AP//AAAAAAAAAAAAAAAAAB//////////4AAAAD//////8AH//gAAAAAAAAAAAAAAAAA//////////8AAAAB//////+AD//wAAAAAAAAAAAAAAAAAf//////////AAAAA//////+AB//4AAAAAAAAAAAAAAB/wP//////////gAAAA///////AA//8AAAAAAAAAAAAAD//4D//////////////////////gAf/+AAAAAAAAAAAAAB//8B//////////////////////wAP//gAAAAAAAAAAAAA//+A//////////////////////4AH//wAAAAAAAAAAAAA///Af/////////////////////8AD//4AAAAAAAAAAAAA///gP//////////////////////AB///8AAAAAAAAAAAA/////////////////Af////////8A///+APgAAAAAAAAD/////////////////AP//////////////AHwAAAAAAAAB/////////////////gH////////////////4AAAAAAAAB/////////////////wD////////////////8AAAAAAAAB/////////////////4B//////////////////8AAAAAAA/////////////////8A//////////////////+AAAAAAAf////////////////+A///////////////////+AAAAAAP/////////////////Af//////gAf//////////wAAAAAH///////wAD8D/////gP//Af//wAP//////////4AAAAAD///////4AAAB/////wHwAAP//4AH//////////8AAAAAAP//AD4AAAAAA/////4D4AAB//8AAB////4P///+AAAAAAAA/gB8AAAAAAf////8B8AAA//+AAA////4H////AAAAAAAAAAAAAAAAAAB///8AAAAAAf//AAAAAHwAAAAAAAAAAAAAAAAAAAAAAAAA///+AAAAAAH/+AAAAAD4AAAAAAAAAAAAAAAAAAAAAAAAAfAAfAAAAAAD//AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAPgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==',
    }),
    lower: Object.freeze({
      file: 'assets/maps/new_endless/lower_section_endless.png',
      imgW: 1672, imgH: 941,
      cropTop: 0, cropBottom: 0,
      cell: 8, cols: 209, rows: 117,
      walkableCells: 6136, walkablePct: 25.1,
      componentsFound: 1,
      keptComponentCells: 6136,
      droppedComponentCells: [],
      anchorCell: [69, 23],
      bits:
        'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAH8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP4AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAfwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA/gAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD+AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAH8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP4AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP//wAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAf//gAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA///AAAAAAAAAAAAAAAAAAAAAAAAAAAAAH////+AAAAAAAAAAAAAAAf8AAAAAAAAAAAAP/////gAAAAAAAAAAAAAA/4AAAAAAAAAAAAf/////AAAAAAAAAAAAAAB/wAAAAAAAAAAAA/////+AAA///AAAAAAAAD/gAAAAAAAAAAAB/////8AAH//+AAAAAAAAH/AAAAAAAAAAAAD/4B//4H////8AAAAAAAAPgAAAAAAAAAAAAf8AD//wP//////+AAAAf//AAAAAAAAAAAAA/4AH//gf//////8AAAA//+AAAAAAAAAAAAB/wAP//A///////4AAAB//8AAAAAAAAAAAAD/gAf//5///////wAAAD//4AAAAAAAAAAAAH/AA///wAH/////gAAAH//wAAAAAAAAAAAAP+AB///gAP/////fAAAP/8AAAAAAAAAAAAAf/8D///AAf////++AAAf/4AAAAAAAAAAAAA//4H//+AA/////98AAAD4AAAAAAAAAAAAAB//wAA/8AB/////7/gAAHwAAAAAAAAAAAAB///gAB/4AD///gAH/AAAPgAAAAAAAAAAAAP///AAD///////AAP+AAAfAAAAAAAAAAAAAf//+AAH//////+AAf8AAA+AAAAAAAAAAAAA///8AAP//////8AA/4AAB8AAAAAAAAAAAAB///4AAf//////4AB/wAf//8AAAAAAAAAAAf///wAA///////+AD/gA///4AAAAAAAAAAA////AAB///////////AB///wAAAAAAAAAAB/gAAAD///////////+AD///gAAAAAAAAAAD/AAAAH/////////////////AAAAAAAAAAAH+AAAAP////////////////+AAAAAAAAAAAAAAAAAf////////////////8AAAAAAAAAAAAAAAAA////////////////4AAAAAAAAAAAAAAAAAB////////////////wAAAAAAAAAAAAAAAAH/////////////////gAAAAAAAAAAAAAAAAP/////////////////AAAAAAAAAAAAAAAAAf////////////////+AAAAAAAAAAAAAAAD///////////////////4AAAAAAAAAAAAAAH///////////////////wAAAAAAAAAAAAH/////////////////////gAAAAAAAAAAAAP/////////////////////AAAAAAAAAAAAAf////////////////////+AAAAAAAAAAAAA/////////////////////8AAAAAAAAAAAAB/////////////////////4AAAAAAAAAAAAD/////////////////////wAAAAAAAAAAAAH/////////////////////gAAAAAAAAAAAAP/////////////////////gAAAAAAAAAAAAf/////////////////////AAAAAAAAAAAAA/////////////////////+AAAAAAAAAAAAB/////////////////////8AAAAAAAAAAAAD/////////////////////4AAAAAAAAAAAAH/////////////////////wAAAAAAAAAAAAP/////////////////////gAAAAAAAAAAAAf/////////////////////AAAAAAAAAAAAA//////////////////////gAAAAAAAAAAAB//////////4P//////////AAAAAAAAAAAAD/wP///////wf//////////wAAAAAAAAAAAH/Af///////g///////////wAAAAAAAAAAH/+A////////B///////////gAAAAAAAAAAP/8B///////+D///////////AAAAAAAAAAAf/4D///////8H//////////+AAAAAAAAAAA//wH///////4P//////////8AAAAAAAAAAB//gP8B////AAfwB/+Af/+APwAAAAAAAAAAD/4AfwD///+AA/gD/8AAH8AfgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    }),
  }),
  chaos: Object.freeze({
    upper: Object.freeze({
      file: 'assets/maps/chaos_mode_map/chaos_mode_map_upper_section.png',
      imgW: 2172, imgH: 622,
      cropTop: 53, cropBottom: 49,
      cell: 8, cols: 271, rows: 77,
      walkableCells: 9941, walkablePct: 47.6,
      componentsFound: 1,
      keptComponentCells: 9941,
      droppedComponentCells: [],
      anchorCell: [116, 72],
      bits:
        'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAPgAD8AAAAAAAAAAAAAAAAAAAAAAAB/4AAAAAAAAAAD8AAf4AB/AADwAAAAAAAAAAfg4DgADgAB/8AD+AAAAAAAB/wAP8AA/gAD4AAAfAAAAAA//8B8AHwAB/+AB/gAAAAAAA/8B/////8AB8A///gAADgAf/+A+AD/////wD/wAAAAAAAP////////gA8Af//wAP/wAf/+AfAB////////4AAAAAAAH////////wA+AP//8AP/8AP/+AHwB////////8AAAAAAAD////////4B+AH///////////AB+B////////+AAAAAAAB////////8B/AD///////////gA/g/////////gAAAAAAA////////+A/gA///////////wAfwf////////8AAAAAAAf////////gfwAf//////////4AP4P////////+AAAAAAAP//////////4AP//////////8AH///////////AAAAAAB///////////8AH//////////+AD///////////gAAAAA////////////+AD///////////AD/////////////8AAAf////////////AB///////////wD/////////////+AAAP////////////gD///////////4B//////////////AAAH/////////////////////////////////////////gAAD/////////////////////////////////////////wAAB/////////////////////////////////////////4AAA/////////////////////////////////////////8AAA/////////////////////////////////////////+AAD//////////////////////////////////////////AAH//////////////////////////////////////////gAD//////////////////////////////////////////gAB//////////////////////////////////////////wAA//////////////////////////////////////////wAAf/////////////////////////////////////////4AAP/////////////////////////////////////////8AAH/////////////////////////////////////////+AAD//////////////////////////////////////////AAB//////////////////////////////////////////gAA//////////////////////////////////////////4AAAD////////////////////////////////////////+AAAB/////////////////////////////////////////gAAA/////////////////////////////////////////wAAAf////////////////////////////////////////4AAAP////////wA//////////////////////////////4AAAH////////wAf/////////////////////////////8AAAH////////4AP//////////////////8B/////////+AAf/////////8AAf/////////////////+Af/////////AAP/////////wAAP/////////////////wAP/////////gAH/////////wAAD/////////////////4AA/////////wAD/////////4AAA/////////////8Af/4AAP////////4AB/////////4AAAP////////////+AP/8AAH////////8AA/////////8AAAH////+AAAAB///AH/+AAD////////8AAf////////+AAAD/////AAAAA///gD/+AAA//////wD+AAA/////8A/+AAAB/////AAAAAP//gB//AAAAD////wAHAAAAD///+Af/AAAA/////gAAAAD//wA//gAAAB////4AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=',
    }),
    lower: Object.freeze({
      file: 'assets/maps/chaos_mode_map/chaos_mode_map_lower_section.png',
      imgW: 2184, imgH: 848,
      cropTop: 0, cropBottom: 0,
      cell: 8, cols: 273, rows: 106,
      walkableCells: 16594, walkablePct: 57.3,
      componentsFound: 1,
      keptComponentCells: 16594,
      droppedComponentCells: [],
      anchorCell: [153, 8],
      bits:
        'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA8ABwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAB/gAfgAAAHgAAfwAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP8D/8AAAA/8AH+AAAAAAAAAAAAAAPgAAAAAAAAAAAAAAAB////gAAAH/gA/wAAAAAAAAAAAAAB/8AAAAAAAAAAAAAAAD///8DwB//8AH+AAAAAAAAAAAA////gAAAAAAAAAD8AAAAf////////////4AAeAAAAAAAAH////wAAAAAAAAB/g4AAD////////////////wAAAAAAAA/////AAAAAAAAA/8HgAAf///////////////+AAAAAAB4H////4AAAADgAAf//+AAD////////////////wAAAAAH///////AAAAAfAAH///wAAP////////////////AOAAAA///////4AAAAf4AA///+AAA////////////////4B/+AAH///////AAAAP/gAH///wAAH////////////////AP/wAA///////4AAAB/8AA////AAA////////////////wA//8AH///////gAAAP/gP////4AAH///////////////8AH//gAf//////8AAAB/8B/////gAA///////////////8AAP/8AB////////gAAP/gP////+AAH///////////////gAB//AAH///////8AAB/8B/////wAH///////////////8AAH/wAAP///////gAD/////////8H////////////////gAA/+AAB///////8AAf//////////////////////////8AAH/wAAP///////gAD///////////////////////////gAA/+AAB///////8AAf//////////////////////////8AAH/wAAP///////gAH///////////////////////////gAA/+AAB///////8AB///////////////////////////+AAP/4AA////////gAP///////////////////////////8AH//wAf///////8AB////////////////////////////gB///AD///////wAAAf///////////////////////////g///4D///////+AAAD///////////////////////////8H///Af///////wAAAf///////////////////////////g///8D///////+AAAD///////////////////////////8H///gf///////wAAAf///////////////////////////g///8H///////+AAAf///////////////////////////8H////////////wAAD//////////////////////////////////////////AAAf/////////////////////////////////////////4AAD//////////////////////////////////////////AAAAA//////////////////////////////////////+A4AAAAH//////////////////////////////////////gAAAAAA//////////////////////////////////////4AAAAAAH//////////////////////////////////////AAAAAAA//////////////////////////////////////4AAAAAAH//////////////////////////////////////AAAAAAA//////////////////////////////////////4AAAAAAP//////////////////////////////////////gAAAAAB//////////////////////////////////////8AAAAAAP//////////////////////////////////////gAAAAAA//////////////////////////////////////4AAAAAAH//////////////////////////////////////AAAAAAA//////////////////////////////////////4AAAAAAH//////////////////////////////////////AAAAAAA//////////////////////////////////////4AAAAAAD/////////////////////////////////////+AAAAAAAP/////////////////////////////////////gAAAAAAA/////////////////////////////////////4AAAAAAAB////////////////////////////////////8AAAAAAAAP////////////////////////////////////gAAAAAAAB////////////////////////////////////8AAAAAAAAP////////////////////////////////////gAAAAAAAB////////////////////////////////////8AAAAAAAAP////////////////////////////////////gAAAAAAAD////////////////////////////////////+AAAAAAAB/////////////////////////////////////8AAAAAAAP/////////////////////////////////////wAAAAAAB/////////////////////////////////////+AAAAAAAf/////////////////////////////////////4AAAAAAH//////////////////////////////////////AAAAAAA//////////////////////////////////////+AAAAAAH//////////////////////////////////////wAAAAAA//////////////////////////////////////+AAAAAAP//////////////////////////////////////wAAAAAB///////////////////////////////////////AAAAAAP//////////////////////////////////////4AAAAAA//////////////////////////////////B////AAAAAAH///////////////gf////////////////4H///4AAAAAA///g///////////4AD////+AP/////////AP//+AAAAAAD//wAH/////////+AAP////gA////////+AA///wAAAAAAH/8AAP/////////gAB////4AB////////wAB//+AAAAAAA//AAB/////////4AAP////AAH///////+AAP//AAAAAAAB/4AAP/////////AAB////4AAP///////wAB//4AAAAAAAP/AAB/////////4AAP////AAB///////+AAB//AAAAAAAAPwAAP/////////AAB////4AAP///////wAAP/wAAAAAAAB+AAB/////////4AAP///4AAB///////+AAB8AAAAAAAAAAAAAP/////////AAA4AfAAAAP///////wAAAAAAAAAAAAAAAAAf////////AAAAAAAAAAAf//////8AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAHAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    }),
  }),});

// Decoded lazily, once per section, and cached. Returns a Uint8Array of cols*rows, 1 = walkable.
const _cache = new Map();
export function deckMaskBits(mode, section) {
  const key = mode + '/' + section;
  const hit = _cache.get(key);
  if (hit) return hit;
  const spec = DECK_MASKS[mode] && DECK_MASKS[mode][section];
  if (!spec) return null;
  const total = spec.cols * spec.rows;
  const out = new Uint8Array(total);
  try {
    const bin = (typeof atob === 'function')
      ? atob(spec.bits)
      : Buffer.from(spec.bits, 'base64').toString('binary');
    for (let i = 0; i < total; i++) {
      const byte = bin.charCodeAt(i >> 3);
      // A truncated or corrupt payload must fail CLOSED (everything blocked), never open:
      // an open failure would drop entities through the floor of a deck that does not exist.
      if (!Number.isFinite(byte)) return _cache.set(key, out), out;
      out[i] = (byte >> (7 - (i & 7))) & 1;
    }
  } catch (_) { out.fill(0); }
  _cache.set(key, out);
  return out;
}
