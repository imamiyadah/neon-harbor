// NEON HARBOR itself: the street grid, the blocks and buildings between the streets, the
// harbour water and piers to the south, and the named landmarks the story uses (the Driftline
// Garage, the Harbor Precinct, St. Sable Medical, the Saltline warehouse, Pier 9). The city is
// generated from the seeded random, so every visit - and every screenshot - sees the same town.
// This module knows geometry only: what is solid, what is road, where things are.
import { PALETTE, ROAD, WORLD } from './config.js';

const HALF_ROAD = ROAD.width / 2;
/** Buildings sit this far inside their block; the ring between is the sidewalk. */
const SIDEWALK = 26;

const BUSINESS_NAMES = [
  'Kestrel Motors', 'Noodle Nine', 'Hotel Marisol', 'Casa Del Sol Diner', 'The Gilded Eel',
  'Palm Court Apartments', 'Vinyl Voyage Records', 'Sunset Laundromat', 'Tidepool Arcade',
  'Marina Bait & Tackle', 'Ozone Gym', 'Palmetto Pharmacy', 'Cielo Rooftop', 'Dockside Donuts',
  'The Rusty Anchor', 'Lumen Electronics', 'Sable & Sons Tailors', 'Harbor Library',
  'Neon Nights Club', 'Pierside Hotel', 'Copacabana Coffee', 'The Velvet Crab', 'Anchor Ink',
  'Solstice Suites', 'Breakwater Books', 'Mango Radio Shack', 'The Salty Parrot', 'Vista Video',
];
const BUILDING_COLORS = ['#e8b4a0', '#d9e2ec', '#f2cc8f', '#bcccdc', '#e07a5f', '#81b29a', '#f4f1de', '#d8a7b1', '#a8dadc', '#e9c46a'];
const SIGN_COLORS = [PALETTE.neonPink, PALETTE.neonCyan, PALETTE.neonAmber, '#7be495', '#c39bff'];

/** The spans between two boundary lists, skipping the road spans: blocks sit between roads. */
function blockSpans(boundaries) {
  const spans = [];
  for (let index = 0; index + 1 < boundaries.length; index += 2) {
    spans.push({ from: boundaries[index], to: boundaries[index + 1] });
  }
  return spans;
}

function boundariesFor(centres, limit) {
  const list = [24];
  for (const centre of centres) list.push(centre - HALF_ROAD, centre + HALF_ROAD);
  list.push(limit);
  return list;
}

export function createCity(random) {
  const columns = blockSpans(boundariesFor(ROAD.vx, WORLD.width - 24));
  const rows = blockSpans(boundariesFor(ROAD.hy, WORLD.waterY - 24));
  const blocks = [];
  const buildings = [];
  let nameIndex = Math.floor(random() * BUSINESS_NAMES.length);

  function addBuilding(x, y, w, h, name) {
    const building = {
      x, y, w, h,
      color: BUILDING_COLORS[Math.floor(random() * BUILDING_COLORS.length)],
      signColor: SIGN_COLORS[Math.floor(random() * SIGN_COLORS.length)],
      name: name ?? BUSINESS_NAMES[nameIndex++ % BUSINESS_NAMES.length],
      roof: 6 + Math.floor(random() * 10),
    };
    buildings.push(building);
    return building;
  }

  // The quay row (last row) is warehouses and open lots, not towers.
  const quayRow = rows.length - 1;
  for (let row = 0; row < rows.length; row += 1) {
    for (let col = 0; col < columns.length; col += 1) {
      const block = {
        x: columns[col].from,
        y: rows[row].from,
        w: columns[col].to - columns[col].from,
        h: rows[row].to - rows[row].from,
        col,
        row,
      };
      blocks.push(block);
      const inner = { x: block.x + SIDEWALK, y: block.y + SIDEWALK, w: block.w - SIDEWALK * 2, h: block.h - SIDEWALK * 2 };
      if (inner.w < 40 || inner.h < 30) continue;
      const isGarage = col === 2 && row === 3;
      const isPrecinct = col === 5 && row === 0;
      const isHospital = col === 0 && row === 2;
      const isWarehouse = col === 6 && row === 4;
      if (isGarage) {
        // The garage building takes the north half; the south half is its open lot.
        addBuilding(inner.x, inner.y, inner.w, inner.h * 0.42, 'Driftline Garage');
        continue;
      }
      if (isPrecinct) { addBuilding(inner.x, inner.y, inner.w, inner.h, 'Harbor Precinct'); continue; }
      if (isHospital) { addBuilding(inner.x, inner.y, inner.w, inner.h, 'St. Sable Medical'); continue; }
      if (isWarehouse) { addBuilding(inner.x, inner.y, inner.w, inner.h, 'Saltline Storage'); continue; }
      if (row === quayRow) {
        if (random() < 0.45) continue; // an open lot by the water
        addBuilding(inner.x, inner.y + inner.h * 0.2, inner.w, inner.h * 0.6, undefined);
        continue;
      }
      const layout = Math.floor(random() * 3);
      if (layout === 0 || inner.w < 130) {
        addBuilding(inner.x, inner.y, inner.w, inner.h, undefined);
      } else if (layout === 1) {
        const gap = 14;
        const w = (inner.w - gap) / 2;
        addBuilding(inner.x, inner.y, w, inner.h, undefined);
        addBuilding(inner.x + w + gap, inner.y, w, inner.h, undefined);
      } else {
        const gap = 14;
        const w = (inner.w - gap) / 2;
        const h = (inner.h - gap) / 2;
        addBuilding(inner.x, inner.y, w, h, undefined);
        addBuilding(inner.x + w + gap, inner.y, w, h, undefined);
        addBuilding(inner.x, inner.y + h + gap, w, h, undefined);
        addBuilding(inner.x + w + gap, inner.y + h + gap, w, h, undefined);
      }
    }
  }

  const blockAt = (col, row) => blocks[row * columns.length + col];
  const garageBlock = blockAt(2, 3);
  const garageZone = {
    x: garageBlock.x + 8,
    y: garageBlock.y + garageBlock.h * 0.52,
    w: garageBlock.w - 16,
    h: garageBlock.h * 0.44,
  };
  const precinctBlock = blockAt(5, 0);
  const hospitalBlock = blockAt(0, 2);
  const warehouseBlock = blockAt(6, 4);

  const piers = [800, 1650, 2500].map((cx) => ({ x: cx - 45, y: WORLD.waterY, w: 90, h: 200 }));

  const landmarks = {
    garage: { x: garageZone.x + garageZone.w / 2, y: garageZone.y + garageZone.h / 2, zone: garageZone },
    precinct: { x: precinctBlock.x + precinctBlock.w / 2, y: precinctBlock.y + precinctBlock.h + 26 },
    hospital: { x: hospitalBlock.x + hospitalBlock.w + 26, y: hospitalBlock.y + hospitalBlock.h / 2 },
    warehouse: { x: warehouseBlock.x + warehouseBlock.w / 2, y: warehouseBlock.y + warehouseBlock.h + 26 },
    pier9: { x: 1650, y: WORLD.waterY + 168 },
    playerStart: { x: 880, y: 1540 },
    hideout: { x: 2500, y: WORLD.waterY + 168 },
  };

  // Hidden packages: tucked at block corners, in the garage lot, and out on the piers.
  const packages = [];
  const packageBlocks = [3, 9, 14, 20, 26, 31, 37, 40, 44, 8];
  for (let index = 0; index < packageBlocks.length; index += 1) {
    const block = blocks[packageBlocks[index] % blocks.length];
    const cornerX = index % 2 === 0 ? block.x + 16 : block.x + block.w - 16;
    const cornerY = index % 3 === 0 ? block.y + block.h - 16 : block.y + 16;
    packages.push({ x: cornerX, y: cornerY });
  }
  packages.push({ x: landmarks.garage.x - 90, y: landmarks.garage.y + 30 });
  packages.push({ x: 800, y: WORLD.waterY + 168 });

  // Parked cars line the streets at mid-block, clear of the intersections.
  const parkedSpots = [];
  for (let index = 0; index < ROAD.vx.length; index += 1) {
    for (let row = 0; row < rows.length - 1; row += 1) {
      if ((index + row) % 2 !== 0) continue;
      const side = (index + row) % 4 === 0 ? 1 : -1;
      parkedSpots.push({
        x: ROAD.vx[index] + side * (HALF_ROAD + 8),
        y: (rows[row].from + rows[row].to) / 2,
        angle: side > 0 ? -Math.PI / 2 : Math.PI / 2,
      });
    }
  }
  for (let index = 0; index < ROAD.hy.length - 1; index += 1) {
    for (let col = 0; col < columns.length; col += 1) {
      if ((index + col) % 3 !== 0) continue;
      const side = (index + col) % 2 === 0 ? 1 : -1;
      parkedSpots.push({
        x: (columns[col].from + columns[col].to) / 2,
        y: ROAD.hy[index] + side * (HALF_ROAD + 8),
        angle: side > 0 ? Math.PI : 0,
      });
    }
  }

  // Palms along the quay and scattered on sidewalks: pure decoration, never solid.
  const palms = [];
  for (let x = 120; x < WORLD.width - 60; x += 190) palms.push({ x, y: WORLD.waterY - 34 });
  for (let index = 0; index < 26; index += 1) {
    const block = blocks[Math.floor(random() * blocks.length)];
    palms.push({ x: block.x + 12, y: block.y + 12 });
  }

  return {
    width: WORLD.width,
    height: WORLD.height,
    waterY: WORLD.waterY,
    blocks,
    buildings,
    piers,
    landmarks,
    packages,
    parkedSpots,
    palms,
  };
}

/** Is the point on a street (or a pier, or in the garage lot)? Used for spawns and traffic. */
export function isOnRoad(city, x, y) {
  for (const cx of ROAD.vx) if (Math.abs(x - cx) <= HALF_ROAD) return true;
  for (const cy of ROAD.hy) if (Math.abs(y - cy) <= HALF_ROAD) return true;
  for (const pier of city.piers) if (x >= pier.x && x <= pier.x + pier.w && y >= pier.y && y <= pier.y + pier.h) return true;
  const zone = city.landmarks.garage.zone;
  return x >= zone.x && x <= zone.x + zone.w && y >= zone.y && y <= zone.y + zone.h;
}

function circleRect(cx, cy, r, rect) {
  const nearX = Math.max(rect.x, Math.min(cx, rect.x + rect.w));
  const nearY = Math.max(rect.y, Math.min(cy, rect.y + rect.h));
  const dx = cx - nearX;
  const dy = cy - nearY;
  return dx * dx + dy * dy < r * r;
}

function inWater(city, x, y) {
  if (y < city.waterY) return false;
  for (const pier of city.piers) {
    if (x >= pier.x && x <= pier.x + pier.w && y >= pier.y && y <= pier.y + pier.h) return false;
  }
  return true;
}

/** Does a circle at (x, y) touch a building, the harbour water, or the edge of the world? */
export function circleHitsSolid(city, x, y, r) {
  if (x < r || y < r || x > city.width - r || y > city.height - r) return true;
  if (inWater(city, x, y)) return true;
  for (const building of city.buildings) {
    if (circleRect(x, y, r, building)) return true;
  }
  return false;
}

/** The point a busted or wasted player is returned to, and where new traffic prefers to be. */
export function nearestStreetPoint(city, x, y) {
  let best = { x, y };
  let bestDistance = Infinity;
  for (const cx of ROAD.vx) {
    const distance = Math.abs(x - cx);
    if (distance < bestDistance) { bestDistance = distance; best = { x: cx, y }; }
  }
  for (const cy of ROAD.hy) {
    const distance = Math.abs(y - cy);
    if (distance < bestDistance) { bestDistance = distance; best = { x, y: cy }; }
  }
  return best;
}
