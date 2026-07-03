/**
 * PetCatalog.js — PHENIX: NULL EDEN
 * ──────────────────────────────────
 * Data-only cyber-pet definitions. Each pet has a sprite, role,
 * type, and behavior parameters. No gameplay logic — that lives
 * in Game.js (pet AI tick + render).
 */

export const PETS = Object.freeze([
  {
    id: 'byte_mite',
    name: 'Byte-Mite',
    role: 'Attack',
    type: 'attack',
    spritePath: 'assets/enemies/pets/byte_mite.png',
    desc: 'Auto-fires cyber-bolts at the nearest enemy. Agile and aggressive.',
    costGrids: 0,
    costFragments: 0,
    unlockByDefault: true,
    // Behavior params
    fireRate: 0.6,         // seconds between shots
    boltSpeed: 420,        // pixels/sec
    boltDamage: 4,         // per hit
    boltRange: 280,        // max targeting range
    boltColor: '#00e6ff',  // cyan bolt
  },
  {
    id: 'data_miner_drone',
    name: 'Data Miner Drone',
    role: 'Utility',
    type: 'utility',
    spritePath: 'assets/enemies/pets/data_miner_drone.png',
    desc: 'Auto-collects distant Grids and XP pickups. Permanent magnet effect.',
    costGrids: 3000,
    costFragments: 1,
    unlockByDefault: false,
    // Behavior params
    collectRadius: 220,    // pickup magnet radius
    collectSpeed: 300,     // pull speed for pickups
    scanInterval: 0.5,     // seconds between scans
  },
  {
    id: 'firewall_sentinel',
    name: 'Firewall Sentinel',
    role: 'Defense',
    type: 'defense',
    spritePath: 'assets/enemies/pets/firewall_sentinel.png',
    desc: 'Orbits the player and destroys enemy projectiles on contact.',
    costGrids: 5000,
    costFragments: 3,
    unlockByDefault: false,
    // Behavior params
    orbitRadius: 82,       // orbit distance from player — close enough to feel attached, far enough to block
    orbitSpeed: 1.8,       // radians/sec
    blockRadius: 24,       // collision radius vs enemy projectiles (scaled with larger sprite)
  },
  {
    id: 'error_code_bomber',
    name: 'Error-Code Bomber',
    role: 'Control',
    type: 'control',
    spritePath: 'assets/enemies/pets/error_code_bomber.png',
    desc: 'Every 5s throws a digital bomb that freezes enemies for 2s.',
    costGrids: 4000,
    costFragments: 2,
    unlockByDefault: false,
    // Behavior params
    bombInterval: 5.0,     // seconds between bombs
    freezeDuration: 2.0,   // seconds enemies are frozen
    blastRadius: 110,      // freeze bomb AoE radius
    bombColor: '#9650ff',  // purple bomb
  },
]);

// Quick lookup
const _petIndex = new Map(PETS.map(p => [p.id, p]));
export function getPetById(id) { return _petIndex.get(id) || null; }
export function getDefaultPetId() { return 'byte_mite'; }
