// Every tuning number and colour for NEON HARBOR in one place. The view is a fixed 1280x720
// logical area that the renderer scales to the window; the world itself is much bigger than
// the view, and a camera moves over it, so no rule below depends on the screen size.

export const VIEW = { width: 1280, height: 720 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** The whole map, in world pixels. South of `waterY` is the harbour water (piers reach into it). */
export const WORLD = { width: 3080, height: 2360, waterY: 2140 };

/**
 * The street grid. Vertical streets run north-south at these x centres, horizontal streets
 * east-west at these y centres; every street is ROAD.width wide, and the blocks between
 * streets hold the buildings. Traffic lanes are offset from the centres (right-hand traffic).
 */
export const ROAD = {
  width: 100,
  vx: [220, 660, 1100, 1540, 1980, 2420, 2860],
  hy: [220, 660, 1100, 1540, 1980],
  lane: 26,
};

export const PLAYER = {
  radius: 13,
  walkSpeed: 178,
  sprintSpeed: 268,
  maxHealth: 100,
  /** Health per second regained once no damage has landed for a while (never past the cap). */
  regen: 4,
  regenDelay: 6,
  regenCap: 55,
  punchRange: 38,
  punchDamage: 16,
  punchCooldown: 0.34,
  startMoney: 120,
  startAmmo: 24,
};

/** Car kinds. w/h are the body's length and width; prices are what the chop shop pays, mint. */
export const CAR_TYPES = {
  compact: { name: 'Pico Compact', w: 44, h: 22, topSpeed: 355, reverse: 110, accel: 300, health: 100, value: 140, colors: ['#c94f42', '#4f7ec9', '#57a773', '#d9a441', '#8d99ae', '#e07a5f'] },
  sedan: { name: 'Marisol Sedan', w: 50, h: 24, topSpeed: 395, reverse: 120, accel: 330, health: 120, value: 220, colors: ['#3d5a80', '#98c1d9', '#606c38', '#bc6c25', '#6d6875', '#e0fbfc'] },
  coupe: { name: 'Kestrel Coupe', w: 50, h: 23, topSpeed: 470, reverse: 130, accel: 430, health: 110, value: 380, colors: ['#ff5da2', '#ffd166', '#06d6a0', '#118ab2', '#ef476f', '#f4f1de'] },
  van: { name: 'Saltline Van', w: 56, h: 26, topSpeed: 320, reverse: 100, accel: 260, health: 170, value: 260, colors: ['#e9ecef', '#adb5bd', '#457b9d', '#2a9d8f', '#e76f51'] },
  taxi: { name: 'Harbor Cab', w: 50, h: 24, topSpeed: 385, reverse: 120, accel: 325, health: 120, value: 200, colors: ['#ffc300'] },
};
export const CAR_TYPE_NAMES = Object.keys(CAR_TYPES);

export const TRAFFIC = {
  count: 15,
  /** Cruise speed range for city traffic, px/s. */
  speedMin: 130,
  speedMax: 210,
  /** Chance a traffic car turns when it reaches an intersection. */
  turnChance: 0.34,
  parkedCount: 24,
};

export const PED = {
  count: 22,
  walkSpeed: 52,
  fleeSpeed: 128,
  health: 30,
  /** How close a gunshot or a fast car has to be before a pedestrian runs. */
  scareRadius: 250,
};

export const COMBAT = {
  bulletSpeed: 940,
  bulletLife: 0.55,
  bulletDamage: 34,
  fireCooldown: 0.17,
  ammoPerPickup: 12,
};

/**
 * The wanted system. `heat` is a float: crimes add to it, the star count is its ceiling
 * (any heat at all is one star). Police presence scales with the stars. Heat only drains
 * while no police car is close enough to see the player, after `unseenDelay` seconds.
 */
export const WANTED = {
  max: 5,
  stealCar: 0.7,
  runOver: 1.0,
  killPed: 1.0,
  shootWitnessed: 0.3,
  ramPolice: 0.6,
  hitCar: 0.15,
  unseenDelay: 5,
  decayPerSecond: 0.14,
  sightRange: 470,
};

export const POLICE = {
  topSpeed: 430,
  accel: 380,
  /** Police cars on the street at each star count (index = stars). */
  strength: [0, 2, 3, 4, 5, 6],
  spawnDistance: 620,
  despawnDistance: 980,
  /** Standing next to a stopped player this long, in seconds, busts them. */
  bustTime: 2.4,
  bustRange: 58,
  ramDamage: 9,
};

export const PACKAGE_COUNT = 12;
export const PACKAGE_REWARD = 50;

/** What the Driftline Garage pays for a stolen car, as a fraction of value at full health. */
export const CHOP_MIN_FRACTION = 0.25;

export const PALETTE = {
  backdrop: '#171320',
  water: '#17616e',
  waterDeep: '#0f4a56',
  quay: '#c9b083',
  sand: '#e3cf9f',
  sidewalk: '#d8c49a',
  blockBase: '#cdb894',
  asphalt: '#3c414d',
  asphaltEdge: '#2f333d',
  laneMark: '#e8dcc0',
  crosswalk: '#cfd4da',
  grass: '#7fb069',
  palmTrunk: '#8a6642',
  palmLeaf: '#3e8914',
  player: '#14b8a6',
  playerSkin: '#e8b08a',
  pedShirt: ['#e07a5f', '#3d405b', '#81b29a', '#f2cc8f', '#9d6bc9', '#4ea8de'],
  bullet: '#ffe66d',
  marker: '#ffd166',
  policeBody: '#eef1f5',
  policeTrim: '#2456c8',
  lightRed: '#ff3b30',
  lightBlue: '#2e7dff',
  panel: '#1d1829',
  panelEdge: '#ff5da2',
  text: '#fdf6ec',
  muted: '#b8ab90',
  money: '#7be495',
  health: '#ef476f',
  healthBack: '#3a2430',
  neonPink: '#ff5da2',
  neonCyan: '#37e0d8',
  neonAmber: '#ffb347',
  star: '#ffd166',
  starOff: '#4a4238',
  minimapBg: 'rgba(16, 12, 26, 0.78)',
  minimapRoad: '#8f96a8',
  minimapWater: '#17616e',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the saved game is kept between visits (this browser only). */
export const SAVE_KEY = 'neon-harbor.save';
export const BEST_KEY = 'neon-harbor.best';
