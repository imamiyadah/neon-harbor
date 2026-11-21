// NEON HARBOR's rules and state, with no drawing and no browser in it: the city, Rook on
// foot and behind the wheel, traffic, pedestrians, the police and the wanted level, gunplay,
// the mission chain, hidden packages, the chop shop, and the busted / wasted endings. step()
// advances one fixed step under a controls object and returns what happened as bit flags, so
// the caller (main.js, or the screenshot stager) reacts without the world knowing about
// screens or sound.
import {
  CAR_TYPE_NAMES, CHOP_MIN_FRACTION, COMBAT, PACKAGE_REWARD, PED, PLAYER, POLICE, TRAFFIC, WANTED,
} from './config.js';
import { circleHitsSolid, createCity } from './city.js';
import {
  carHitsSolid, createCar, createFleeCar, createTrafficCar, pickColor, stepCar, stepFlee, stepTraffic,
} from './vehicles.js';
import { createPoliceCar, policeSpawnPoint, stepPolice } from './police.js';
import { buildMissions, FREE_ROAM_TEXT } from './missions.js';

export const EV_SHOT = 1;
export const EV_PUNCH = 2;
export const EV_CRASH = 4;
export const EV_CASH = 8;
export const EV_PICKUP = 16;
export const EV_COMPLETE = 32;
export const EV_FAIL = 64;
export const EV_ENTER = 128;
export const EV_HURT = 256;
export const EV_BUSTED = 512;
export const EV_OVER = 1024;
export const EV_STEAL = 2048;
export const EV_DRY = 4096;

const NEUTRAL = { mx: 0, my: 0, sprint: false, attackHeld: false, attackPressed: false, interact: false, aimX: 0, aimY: 0, hasAim: false };
const TRAFFIC_TYPES = ['compact', 'sedan', 'sedan', 'compact', 'coupe', 'van', 'taxi'];

function clamp(value, lo, hi) { return Math.max(lo, Math.min(hi, value)); }
function dist(ax, ay, bx, by) { return Math.hypot(ax - bx, ay - by); }
function wrapAngle(angle) { return ((angle + Math.PI * 3) % (Math.PI * 2)) - Math.PI; }

export function createWorld(random) {
  const city = createCity(random);
  const missions = buildMissions(city);

  const player = {
    x: city.landmarks.playerStart.x, y: city.landmarks.playerStart.y,
    angle: -Math.PI / 2, vx: 0, vy: 0, health: PLAYER.maxHealth,
    onCar: null, hurtT: 99, hitCd: 0, punchCd: 0, fireCd: 0,
  };

  // --- The cast, created once; reset() restores these exact snapshots (screenshots rely on it).
  const cars = [];
  const parkedSpots = [...city.parkedSpots];
  for (let index = 0; index < TRAFFIC.parkedCount && parkedSpots.length > 0; index += 1) {
    const spot = parkedSpots.splice(Math.floor(random() * parkedSpots.length), 1)[0];
    const type = CAR_TYPE_NAMES[Math.floor(random() * CAR_TYPE_NAMES.length)];
    const car = createCar(type, spot.x, spot.y, spot.angle, pickColor(random, type));
    // A spot hard against a building face would wedge the car forever: nudge it along the
    // street, and skip the spot if it still touches anything solid.
    if (carHitsSolid(city, car, car.x, car.y, car.angle)) {
      car.x += Math.cos(spot.angle) * 52;
      car.y += Math.sin(spot.angle) * 52;
      if (carHitsSolid(city, car, car.x, car.y, car.angle)) continue;
    }
    cars.push(car);
  }
  for (let index = 0; index < TRAFFIC.count; index += 1) {
    const type = TRAFFIC_TYPES[Math.floor(random() * TRAFFIC_TYPES.length)];
    cars.push(createTrafficCar(random, city, type));
  }
  const peds = [];
  for (let index = 0; index < PED.count; index += 1) {
    const block = city.blocks[Math.floor(random() * city.blocks.length)];
    const inset = 13;
    const corners = [
      { x: block.x + inset, y: block.y + inset },
      { x: block.x + block.w - inset, y: block.y + inset },
      { x: block.x + block.w - inset, y: block.y + block.h - inset },
      { x: block.x + inset, y: block.y + block.h - inset },
    ];
    const corner = Math.floor(random() * 4);
    const next = corners[(corner + 1) % 4];
    const t = random();
    peds.push({
      x: corners[corner].x + (next.x - corners[corner].x) * t,
      y: corners[corner].y + (next.y - corners[corner].y) * t,
      angle: 0, corners, corner, health: PED.health, state: 'walk',
      fleeT: 0, scareX: 0, scareY: 0, downT: 0,
      color: ['#e07a5f', '#3d405b', '#81b29a', '#f2cc8f', '#9d6bc9', '#4ea8de'][Math.floor(random() * 6)],
    });
  }
  const carSnapshot = cars.map((car) => ({ car, x: car.x, y: car.y, angle: car.angle, ai: car.ai ? { ...car.ai } : null }));
  const pedSnapshot = peds.map((ped) => ({ ped, x: ped.x, y: ped.y, corner: ped.corner }));

  const state = {
    city, time: 0, player, cars, peds,
    bullets: [], particles: [],
    packages: city.packages.map((p) => ({ x: p.x, y: p.y, taken: false })),
    money: PLAYER.startMoney, ammo: PLAYER.startAmmo,
    wanted: 0, stars: 0, unseen: 0, bust: 0,
    missionIndex: 0, stageIndex: 0, missionCar: null, stageTimer: null,
    objective: '', marker: null, banner: null, toast: null,
    stats: { stolen: 0, packages: 0, missions: 0, shots: 0 },
    over: false, busted: false, storyDone: false,
    nearestPolice: Infinity, shake: 0, chopT: 0, policeSpawnT: 0,
    titleCam: { x: 1540, y: 1100 },
  };

  function toast(text) { state.toast = { text, t: 2.6 }; }
  function banner(title, text, dur = 4.4) { state.banner = { title, text, t: dur, dur }; }

  function addHeat(amount) {
    if (amount > 0) state.unseen = 0;
    state.wanted = clamp(state.wanted + amount, 0, WANTED.max);
  }

  function currentMission() { return state.missionIndex < missions.length ? missions[state.missionIndex] : null; }
  function currentStage() {
    const mission = currentMission();
    return mission ? mission.stages[state.stageIndex] : null;
  }

  function removeCar(car) {
    const index = state.cars.indexOf(car);
    if (index !== -1) state.cars.splice(index, 1);
  }

  function beginStage() {
    const mission = currentMission();
    const stage = currentStage();
    state.missionCar = null;
    state.stageTimer = null;
    if (!mission || !stage) {
      state.objective = state.storyDone ? FREE_ROAM_TEXT : '';
      state.marker = null;
      return;
    }
    state.objective = stage.text;
    state.marker = { x: stage.x, y: stage.y };
    if (stage.spawn) {
      const spec = stage.spawn;
      if (stage.kind === 'disable') {
        state.missionCar = createFleeCar(spec.type, spec.x, spec.y, spec.angle, spec.color);
      } else {
        state.missionCar = createCar(spec.type, spec.x, spec.y, spec.angle, spec.color);
      }
      state.cars.push(state.missionCar);
    }
    if (stage.kind === 'escape' && stage.heat) addHeat(stage.heat - state.wanted > 0 ? stage.heat - state.wanted : 0);
    if (stage.kind === 'timed') state.stageTimer = stage.timeLimit;
  }

  function completeMission(events) {
    const mission = currentMission();
    if (!mission) return events;
    state.money += mission.reward;
    if (mission.ammo) state.ammo += mission.ammo;
    state.stats.missions += 1;
    banner(mission.title + ' — complete', mission.outro + `  +$${mission.reward}`);
    state.missionIndex += 1;
    state.stageIndex = 0;
    if (state.missionIndex >= missions.length) {
      state.storyDone = true;
      banner('NEON HARBOR', 'The debt is paid. The city, and everything in it, is yours. Story complete — free roam!', 7);
    } else {
      const next = currentMission();
      banner(next.title, next.intro, 5.2);
    }
    beginStage();
    return events | EV_COMPLETE | EV_CASH;
  }

  function advanceStage(events) {
    const mission = currentMission();
    if (!mission) return events;
    state.stageIndex += 1;
    if (state.stageIndex >= mission.stages.length) return completeMission(events);
    beginStage();
    return events;
  }

  function reset() {
    for (const snap of carSnapshot) {
      snap.car.x = snap.x; snap.car.y = snap.y; snap.car.angle = snap.angle;
      snap.car.speed = 0; snap.car.health = snap.car.maxHealth; snap.car.dead = false;
      snap.car.driver = snap.ai ? 'traffic' : null; snap.car.stolen = false; snap.car.countedSteal = false;
      if (snap.ai) snap.car.ai = { ...snap.ai };
      if (!state.cars.includes(snap.car)) state.cars.push(snap.car);
    }
    const snapshotCars = new Set(carSnapshot.map((snap) => snap.car));
    for (let index = state.cars.length - 1; index >= 0; index -= 1) {
      if (!snapshotCars.has(state.cars[index])) state.cars.splice(index, 1);
    }
    state.missionCar = null;
    for (const snap of pedSnapshot) {
      snap.ped.x = snap.x; snap.ped.y = snap.y; snap.ped.corner = snap.corner;
      snap.ped.health = PED.health; snap.ped.state = 'walk'; snap.ped.downT = 0;
    }
    player.x = city.landmarks.playerStart.x;
    player.y = city.landmarks.playerStart.y;
    player.angle = -Math.PI / 2;
    player.health = PLAYER.maxHealth;
    player.onCar = null;
    player.hurtT = 99; player.hitCd = 0; player.punchCd = 0; player.fireCd = 0;
    state.bullets.length = 0;
    state.particles.length = 0;
    for (const pack of state.packages) pack.taken = false;
    state.money = PLAYER.startMoney;
    state.ammo = PLAYER.startAmmo;
    state.wanted = 0; state.stars = 0; state.unseen = 0; state.bust = 0;
    state.missionIndex = 0; state.stageIndex = 0; state.stageTimer = null;
    state.banner = null; state.toast = null;
    state.stats = { stolen: 0, packages: 0, missions: 0, shots: 0 };
    state.over = false; state.busted = false; state.storyDone = false;
    state.chopT = 0; state.policeSpawnT = 0;
    beginStage();
    const first = currentMission();
    if (first) banner(first.title, first.intro, 5.2);
  }

  function respawn(kind) {
    // Clear the law and any mission-spawned car, then restart the current stage.
    for (let index = state.cars.length - 1; index >= 0; index -= 1) {
      if (state.cars[index].isPolice) state.cars.splice(index, 1);
    }
    if (state.missionCar) { removeCar(state.missionCar); state.missionCar = null; }
    if (player.onCar) { player.onCar.driver = null; player.onCar = null; }
    const fine = kind === 'busted' ? Math.min(state.money, 100 + state.stars * 25) : Math.min(state.money, 120);
    state.money -= fine;
    state.wanted = 0; state.stars = 0; state.bust = 0; state.unseen = 0;
    player.health = PLAYER.maxHealth;
    player.hurtT = 99;
    const point = kind === 'busted' ? city.landmarks.precinct : city.landmarks.hospital;
    player.x = point.x; player.y = point.y;
    state.over = false; state.busted = false;
    state.stageIndex = Math.max(0, state.stageIndex);
    beginStage();
    toast(kind === 'busted' ? `Busted. The precinct keeps $${fine} of your money.` : `You wake up at St. Sable. The bill was $${fine}.`);
  }

  function makeSave() {
    return {
      money: state.money, ammo: state.ammo, missionIndex: state.missionIndex,
      packages: state.packages.map((p, index) => (p.taken ? index : -1)).filter((index) => index >= 0),
      x: player.x, y: player.y, stats: { ...state.stats }, storyDone: state.storyDone,
    };
  }

  function applySave(data) {
    reset();
    state.money = data.money | 0;
    state.ammo = data.ammo | 0;
    state.missionIndex = clamp(data.missionIndex | 0, 0, missions.length);
    state.stageIndex = 0;
    if (Array.isArray(data.packages)) for (const index of data.packages) if (state.packages[index]) state.packages[index].taken = true;
    if (data.stats) state.stats = { ...state.stats, ...data.stats };
    state.storyDone = Boolean(data.storyDone) || state.missionIndex >= missions.length;
    if (typeof data.x === 'number' && typeof data.y === 'number' && !circleHitsSolid(city, data.x, data.y, PLAYER.radius)) {
      player.x = data.x; player.y = data.y;
    }
    state.banner = null;
    beginStage();
  }

  // ------------------------------------------------------------- particles
  function burst(x, y, color, count, speed, life, size) {
    for (let index = 0; index < count; index += 1) {
      const angle = random() * Math.PI * 2;
      const v = speed * (0.3 + random() * 0.7);
      state.particles.push({
        x, y, vx: Math.cos(angle) * v, vy: Math.sin(angle) * v,
        life: life * (0.5 + random() * 0.5), maxLife: life, color, size: size * (0.6 + random() * 0.8),
      });
    }
  }

  function scarePeds(x, y) {
    for (const ped of state.peds) {
      if (ped.state === 'down') continue;
      if (dist(ped.x, ped.y, x, y) < PED.scareRadius) {
        ped.state = 'flee'; ped.fleeT = 3.5; ped.scareX = x; ped.scareY = y;
      }
    }
  }

  function hurtPlayer(amount, events) {
    if (player.hitCd > 0 || state.over) return events;
    player.health -= amount;
    player.hurtT = 0;
    player.hitCd = 0.7;
    events |= EV_HURT;
    if (player.health <= 0) {
      player.health = 0;
      state.over = true;
      events |= EV_OVER;
    }
    return events;
  }

  function downPed(ped, events, byPlayer) {
    ped.state = 'down';
    ped.downT = 0;
    burst(ped.x, ped.y, '#c0392b', 8, 90, 0.5, 3);
    if (byPlayer && random() < 0.45) {
      const cash = 5 + Math.floor(random() * 20);
      state.money += cash;
      toast(`+$${cash} — dropped cash`);
      events |= EV_CASH;
    }
    return events;
  }

  // ------------------------------------------------------------- per-entity steps
  function footHits(x, y) {
    if (circleHitsSolid(city, x, y, PLAYER.radius)) return true;
    for (const car of state.cars) {
      if (car === player.onCar) continue;
      const reach = car.spec.w * 0.32;
      const r = car.spec.h * 0.62 + PLAYER.radius * 0.8;
      const cos = Math.cos(car.angle);
      const sin = Math.sin(car.angle);
      if (dist(x, y, car.x + cos * reach, car.y + sin * reach) < r) return true;
      if (dist(x, y, car.x - cos * reach, car.y - sin * reach) < r) return true;
    }
    return false;
  }

  function stepPlayerOnFoot(dt, ctl, events) {
    const speed = ctl.sprint ? PLAYER.sprintSpeed : PLAYER.walkSpeed;
    let mx = ctl.mx;
    let my = ctl.my;
    const len = Math.hypot(mx, my);
    if (len > 1) { mx /= len; my /= len; }
    player.vx = mx * speed;
    player.vy = my * speed;
    if (len > 0.05) {
      const nx = player.x + player.vx * dt;
      const ny = player.y + player.vy * dt;
      if (!footHits(nx, ny)) { player.x = nx; player.y = ny; }
      else if (!footHits(nx, player.y)) player.x = nx;
      else if (!footHits(player.x, ny)) player.y = ny;
      if (!ctl.hasAim) player.angle = Math.atan2(player.vy, player.vx);
    } else { player.vx = 0; player.vy = 0; }
    if (ctl.hasAim) player.angle = Math.atan2(ctl.aimY - player.y, ctl.aimX - player.x);

    // Heal at the hospital doors.
    const hospital = city.landmarks.hospital;
    if (dist(player.x, player.y, hospital.x, hospital.y) < 78 && player.health < PLAYER.maxHealth) {
      player.health = Math.min(PLAYER.maxHealth, player.health + 26 * dt);
    }

    // Packages.
    for (const pack of state.packages) {
      if (pack.taken) continue;
      if (dist(player.x, player.y, pack.x, pack.y) < 30) {
        pack.taken = true;
        state.stats.packages += 1;
        state.money += PACKAGE_REWARD;
        if (state.stats.packages % 3 === 0) { state.ammo += COMBAT.ammoPerPickup; toast(`Package ${state.stats.packages}/${state.packages.length} — +$${PACKAGE_REWARD}, +${COMBAT.ammoPerPickup} ammo`); }
        else toast(`Package ${state.stats.packages}/${state.packages.length} — +$${PACKAGE_REWARD}`);
        burst(pack.x, pack.y, '#ffd166', 10, 80, 0.6, 3);
        events |= EV_PICKUP | EV_CASH;
      }
    }

    // Attack: a swing connects before a trigger pull - check the fist first.
    player.punchCd = Math.max(0, player.punchCd - dt);
    player.fireCd = Math.max(0, player.fireCd - dt);
    if ((ctl.attackPressed || ctl.attackHeld) && player.fireCd <= 0 && player.punchCd <= 0) {
      let target = null;
      let targetDist = Infinity;
      for (const ped of state.peds) {
        if (ped.state === 'down') continue;
        const d = dist(player.x, player.y, ped.x, ped.y);
        if (d < PLAYER.punchRange && d < targetDist) {
          const diff = Math.abs(wrapAngle(Math.atan2(ped.y - player.y, ped.x - player.x) - player.angle));
          if (diff < 1.2 || d < 22) { target = ped; targetDist = d; }
        }
      }
      if (target) {
        target.health -= PLAYER.punchDamage;
        target.x += Math.cos(player.angle) * 9;
        target.y += Math.sin(player.angle) * 9;
        player.punchCd = PLAYER.punchCooldown;
        events |= EV_PUNCH;
        scarePeds(player.x, player.y);
        if (target.health <= 0) { events = downPed(target, events, true); addHeat(WANTED.killPed); }
        else { target.state = 'flee'; target.fleeT = 3; target.scareX = player.x; target.scareY = player.y; }
      } else if (ctl.attackHeld || ctl.attackPressed) {
        if (state.ammo > 0) {
          state.ammo -= 1;
          state.stats.shots += 1;
          const spread = (random() - 0.5) * 0.05;
          state.bullets.push({
            x: player.x + Math.cos(player.angle) * 18, y: player.y + Math.sin(player.angle) * 18,
            vx: Math.cos(player.angle + spread) * COMBAT.bulletSpeed,
            vy: Math.sin(player.angle + spread) * COMBAT.bulletSpeed,
            life: COMBAT.bulletLife,
          });
          player.fireCd = COMBAT.fireCooldown;
          events |= EV_SHOT;
          scarePeds(player.x, player.y);
          let witnessed = false;
          for (const ped of state.peds) if (ped.state !== 'down' && dist(ped.x, ped.y, player.x, player.y) < 280) witnessed = true;
          if (state.nearestPolice < 320) witnessed = true;
          if (witnessed) addHeat(WANTED.shootWitnessed);
        } else {
          player.fireCd = 0.25;
          events |= EV_DRY;
        }
      }
    }

    // Enter a car.
    if (ctl.interact) {
      let best = null;
      let bestDist = 56;
      for (const car of state.cars) {
        if (car.driver !== null || car.dead) continue;
        const d = dist(player.x, player.y, car.x, car.y);
        if (d < bestDist) { best = car; bestDist = d; }
      }
      if (best) {
        player.onCar = best;
        best.driver = 'player';
        events |= EV_ENTER;
        if (!best.countedSteal) {
          best.countedSteal = true;
          best.stolen = true;
          state.stats.stolen += 1;
          addHeat(WANTED.stealCar);
          events |= EV_STEAL;
          toast(`Stole the ${best.spec.name}`);
        }
      }
    }
    return events;
  }

  function stepPlayerInCar(dt, ctl, events) {
    const car = player.onCar;
    player.x = car.x; player.y = car.y;
    player.angle = car.angle;
    const impact = stepCar(city, car, dt, -ctl.my, ctl.mx);
    player.x = car.x; player.y = car.y;
    if (impact > 170) {
      car.health -= (impact - 150) * 0.09;
      state.shake = Math.min(13, impact * 0.035);
      burst(car.x, car.y, '#ffb347', 10, 130, 0.5, 3);
      events |= EV_CRASH;
      if (impact > 250) events = hurtPlayer((impact - 240) * 0.05, events);
      scarePeds(car.x, car.y);
      if (car.health <= 0 && !car.dead) { car.dead = true; car.health = 0; toast('Engine dead. Get out and find other wheels.'); }
    }
    if (car.health > 0 && car.health < 35 && random() < dt * 8) {
      state.particles.push({ x: car.x, y: car.y, vx: (random() - 0.5) * 12, vy: -22 - random() * 14, life: 0.9, maxLife: 0.9, color: '#555560', size: 5 });
    }

    // Chop shop: a stolen car, stopped in the garage lot, is sold after a short negotiation.
    const zone = city.landmarks.garage.zone;
    const inZone = car.x > zone.x && car.x < zone.x + zone.w && car.y > zone.y && car.y < zone.y + zone.h;
    const stage = currentStage();
    const protectedCar = car === state.missionCar && stage && (stage.kind === 'deliverCar' || stage.kind === 'steal');
    if (inZone && car.stolen && !car.isPolice && !protectedCar && Math.abs(car.speed) < 6) {
      state.chopT += dt;
      if (state.chopT > 0.2 && state.chopT < 1.6) toast('Mara\'s crew is pricing the car…');
      if (state.chopT >= 1.6) {
        const fraction = CHOP_MIN_FRACTION + (1 - CHOP_MIN_FRACTION) * (car.health / car.maxHealth);
        const price = Math.round(car.spec.value * fraction);
        state.money += price;
        toast(`Sold the ${car.spec.name} for $${price}`);
        burst(car.x, car.y, '#7be495', 12, 90, 0.7, 3);
        removeCar(car);
        player.onCar = null;
        player.x = city.landmarks.garage.x;
        player.y = city.landmarks.garage.y;
        state.chopT = 0;
        return events | EV_CASH | EV_ENTER;
      }
    } else state.chopT = 0;

    if (ctl.interact) {
      const side = car.angle + Math.PI / 2;
      for (const sign of [1, -1]) {
        const nx = car.x + Math.cos(side) * 32 * sign;
        const ny = car.y + Math.sin(side) * 32 * sign;
        if (!footHits(nx, ny)) { player.x = nx; player.y = ny; break; }
      }
      car.driver = null;
      player.onCar = null;
      events |= EV_ENTER;
    }
    return events;
  }

  function stepPeds(dt, events) {
    for (const ped of state.peds) {
      if (ped.state === 'down') { ped.downT += dt; continue; }
      // Self-preservation: a car coming fast and close is worth stepping out of the way of.
      if (ped.state === 'walk') {
        for (const car of state.cars) {
          if (Math.abs(car.speed) > 140 && dist(car.x, car.y, ped.x, ped.y) < 64) {
            ped.state = 'flee'; ped.fleeT = 1.1; ped.scareX = car.x; ped.scareY = car.y;
            break;
          }
        }
      }
      if (ped.state === 'flee') {
        ped.fleeT -= dt;
        const away = Math.atan2(ped.y - ped.scareY, ped.x - ped.scareX);
        ped.angle = away;
        const nx = ped.x + Math.cos(away) * PED.fleeSpeed * dt;
        const ny = ped.y + Math.sin(away) * PED.fleeSpeed * dt;
        if (!circleHitsSolid(city, nx, ny, 9)) { ped.x = nx; ped.y = ny; }
        else if (!circleHitsSolid(city, nx, ped.y, 9)) ped.x = nx;
        else if (!circleHitsSolid(city, ped.x, ny, 9)) ped.y = ny;
        if (ped.fleeT <= 0) ped.state = 'walk';
        continue;
      }
      const target = ped.corners[(ped.corner + 1) % 4];
      const d = dist(ped.x, ped.y, target.x, target.y);
      if (d < 6) { ped.corner = (ped.corner + 1) % 4; continue; }
      ped.angle = Math.atan2(target.y - ped.y, target.x - ped.x);
      ped.x += Math.cos(ped.angle) * PED.walkSpeed * dt;
      ped.y += Math.sin(ped.angle) * PED.walkSpeed * dt;
    }
    return events;
  }

  function aheadBlocked(self) {
    // Forward/lateral geometry, not a bubble: a car parked at the curb (lateral ~30) must
    // not block the lane, while a car in the same lane (lateral < 26) up ahead must.
    const fx = Math.cos(self.angle);
    const fy = Math.sin(self.angle);
    function blocks(x, y, reach) {
      const relX = x - self.x;
      const relY = y - self.y;
      const forward = relX * fx + relY * fy;
      const lateral = Math.abs(relX * -fy + relY * fx);
      return forward > 2 && forward < reach && lateral < 26;
    }
    for (const other of state.cars) {
      if (other === self) continue;
      if (blocks(other.x, other.y, 80)) return true;
    }
    if (!player.onCar && blocks(player.x, player.y, 66)) return true;
    if (player.onCar && player.onCar !== self && blocks(player.onCar.x, player.onCar.y, 80)) return true;
    return false;
  }

  function stepCars(dt, events) {
    for (const car of state.cars) {
      if (car.driver === 'traffic') stepTraffic(city, car, dt, random, aheadBlocked);
      else if (car.driver === 'flee') {
        if (car.dead) { car.speed = 0; continue; }
        stepFlee(city, car, dt, random, aheadBlocked, player);
        if (car.health <= 0 && !car.dead) car.dead = true;
      } else if (car.driver === 'police') {
        if (state.stars === 0) {
          // The chase is off: head for the precinct and despawn on arrival.
          const target = { x: city.landmarks.precinct.x, y: city.landmarks.precinct.y, vx: 0, vy: 0 };
          stepPolice(city, car, dt, target);
          car.leaveT = (car.leaveT ?? 6) - dt;
          if (dist(car.x, car.y, target.x, target.y) < 90 || car.leaveT <= 0) removeCar(car);
        } else {
          const target = player.onCar
            ? { x: player.onCar.x, y: player.onCar.y, vx: Math.cos(player.onCar.angle) * player.onCar.speed, vy: Math.sin(player.onCar.angle) * player.onCar.speed }
            : { x: player.x, y: player.y, vx: player.vx, vy: player.vy };
          stepPolice(city, car, dt, target);
        }
      }
    }
    // Car-to-car contact: push apart, trade paint, price the damage.
    for (let i = 0; i < state.cars.length; i += 1) {
      for (let j = i + 1; j < state.cars.length; j += 1) {
        const a = state.cars[i];
        const b = state.cars[j];
        const minDist = (a.spec.w + b.spec.w) * 0.40;
        const d = dist(a.x, a.y, b.x, b.y);
        if (d === 0 || d >= minDist) continue;
        const rel = Math.abs(a.speed - b.speed) + Math.abs(a.speed) * 0.2;
        const nx = (b.x - a.x) / d;
        const ny = (b.y - a.y) / d;
        const push = (minDist - d) / 2;
        a.x -= nx * push; a.y -= ny * push;
        b.x += nx * push; b.y += ny * push;
        if (rel > 110) {
          const damage = rel * 0.055;
          a.health -= damage; b.health -= damage;
          if (a.health <= 0) a.dead = true;
          if (b.health <= 0) b.dead = true;
          const playerCar = player.onCar;
          if (playerCar === a || playerCar === b) {
            events |= EV_CRASH;
            state.shake = Math.min(12, rel * 0.04);
            burst(playerCar.x, playerCar.y, '#ffb347', 8, 120, 0.45, 3);
            if ((a.isPolice || b.isPolice) && random() < 0.8) addHeat(WANTED.ramPolice * 0.4);
            if (rel > 230) events = hurtPlayer((rel - 220) * 0.045, events);
          } else if ((a.isPolice && b.driver === 'player') || (b.isPolice && a.driver === 'player')) {
            addHeat(WANTED.ramPolice * 0.4);
          }
          scarePeds(a.x, a.y);
        }
        const swap = (a.speed + b.speed) / 2;
        if (a.driver !== null) a.speed = swap * 0.7;
        if (b.driver !== null) b.speed = swap * 0.7;
      }
    }
    // Cars versus the player on foot, and versus pedestrians.
    for (const car of state.cars) {
      if (Math.abs(car.speed) < 55) continue;
      if (!player.onCar && player.hitCd <= 0 && dist(car.x, car.y, player.x, player.y) < 26) {
        events = hurtPlayer(car.isPolice ? 13 : 9, events);
        player.x += Math.cos(car.angle) * 16;
        player.y += Math.sin(car.angle) * 16;
        burst(player.x, player.y, '#ef476f', 8, 110, 0.5, 3);
      }
      for (const ped of state.peds) {
        if (ped.state === 'down') continue;
        if (dist(car.x, car.y, ped.x, ped.y) < 20) {
          ped.health = 0;
          events = downPed(ped, events, car.driver === 'player');
          if (car.driver === 'player') { addHeat(WANTED.runOver); events |= EV_CRASH; }
          scarePeds(ped.x, ped.y);
        }
      }
    }
    return events;
  }

  function stepBullets(dt, events) {
    // Two half-steps per bullet: at 940 px/s a full step jumps nearly 16 px, enough to
    // tunnel clean through a pedestrian between checks.
    function bulletHits(bullet) {
      if (circleHitsSolid(city, bullet.x, bullet.y, 2)) return true;
      for (const ped of state.peds) {
        if (ped.state === 'down') continue;
        if (dist(bullet.x, bullet.y, ped.x, ped.y) < 15) {
          ped.health -= COMBAT.bulletDamage;
          burst(ped.x, ped.y, '#c0392b', 6, 90, 0.4, 3);
          if (ped.health <= 0) { events = downPed(ped, events, true); addHeat(WANTED.killPed); }
          else { ped.state = 'flee'; ped.fleeT = 3.5; ped.scareX = player.x; ped.scareY = player.y; }
          return true;
        }
      }
      for (const car of state.cars) {
        if (car === player.onCar) continue;
        if (dist(bullet.x, bullet.y, car.x, car.y) < car.spec.w * 0.52) {
          car.health -= COMBAT.bulletDamage;
          burst(bullet.x, bullet.y, '#ffd166', 5, 120, 0.35, 2);
          if (car.isPolice) addHeat(0.4);
          if (car.health <= 0 && !car.dead) {
            car.dead = true;
            burst(car.x, car.y, '#555560', 14, 100, 0.9, 5);
            if (car.driver === 'traffic' || car.driver === 'flee') car.speed = 0;
          }
          return true;
        }
      }
      return false;
    }
    for (let index = state.bullets.length - 1; index >= 0; index -= 1) {
      const bullet = state.bullets[index];
      bullet.life -= dt;
      let gone = bullet.life <= 0;
      for (let sub = 0; sub < 2 && !gone; sub += 1) {
        bullet.x += bullet.vx * dt / 2;
        bullet.y += bullet.vy * dt / 2;
        gone = bulletHits(bullet);
      }
      if (gone) state.bullets.splice(index, 1);
    }
    return events;
  }

  function stepPoliceSpawning(dt) {
    state.nearestPolice = Infinity;
    let policeCount = 0;
    for (let index = state.cars.length - 1; index >= 0; index -= 1) {
      const car = state.cars[index];
      if (!car.isPolice) continue;
      policeCount += 1;
      const d = dist(car.x, car.y, player.x, player.y);
      if (d < state.nearestPolice) state.nearestPolice = d;
      if (state.stars === 0 && d > POLICE.despawnDistance) state.cars.splice(index, 1);
      // Wedged nose-first on a corner far from the action? Quietly rejoin from another
      // intersection - the player never sees it, and the chase never dies on geometry.
      if (state.stars > 0 && d > 220 && Math.abs(car.speed) < 12) {
        car.stuckT = (car.stuckT ?? 0) + dt;
        if (car.stuckT > 1.6) {
          const point = policeSpawnPoint(city, random, player.x, player.y);
          car.x = point.x; car.y = point.y; car.speed = 0; car.stuckT = 0;
          car.angle = Math.atan2(player.y - point.y, player.x - point.x);
        }
      } else car.stuckT = 0;
    }
    const desired = POLICE.strength[state.stars] ?? 0;
    state.policeSpawnT -= dt;
    if (policeCount < desired && state.policeSpawnT <= 0) {
      const point = policeSpawnPoint(city, random, player.x, player.y);
      const car = createPoliceCar(point.x, point.y, Math.atan2(player.y - point.y, player.x - point.x));
      state.cars.push(car);
      state.policeSpawnT = 1.4;
    }
    // Sight and decay.
    if (state.nearestPolice < WANTED.sightRange) state.unseen = 0;
    else state.unseen += dt;
    if (state.wanted > 0 && state.unseen > WANTED.unseenDelay) {
      state.wanted = Math.max(0, state.wanted - WANTED.decayPerSecond * dt);
    }
    state.stars = state.wanted <= 0 ? 0 : Math.ceil(state.wanted);
    // The bust meter: police close in on a player who cannot get moving.
    if (state.stars > 0 && !state.over && !state.busted) {
      const playerSpeed = player.onCar ? Math.abs(player.onCar.speed) : Math.hypot(player.vx, player.vy);
      const threshold = player.onCar ? 34 : 62;
      if (state.nearestPolice < POLICE.bustRange + (player.onCar ? 14 : 0) && playerSpeed < threshold) {
        state.bust += dt * (player.onCar ? 0.8 : 1);
      } else state.bust = Math.max(0, state.bust - dt * 1.4);
      if (state.bust >= POLICE.bustTime) {
        state.busted = true;
        return EV_BUSTED;
      }
    } else state.bust = Math.max(0, state.bust - dt * 2);
    return 0;
  }

  function stepMissions(dt, events) {
    const mission = currentMission();
    const stage = currentStage();
    if (!mission || !stage) return events;
    const px = player.x;
    const py = player.y;
    switch (stage.kind) {
      case 'goto':
      case 'timed': {
        if (stage.kind === 'timed') {
          state.stageTimer -= dt;
          if (state.stageTimer <= 0) {
            state.stageTimer = stage.timeLimit;
            banner('Too late', 'The ferry left without the cooler. The clock restarts — go again.', 3.6);
            return events | EV_FAIL;
          }
        }
        if (dist(px, py, stage.x, stage.y) < stage.r) return advanceStage(events);
        break;
      }
      case 'steal':
        if (state.missionCar && player.onCar === state.missionCar) return advanceStage(events);
        break;
      case 'deliverCar':
        if (state.missionCar && player.onCar === state.missionCar && Math.abs(state.missionCar.speed) < 8
          && dist(px, py, stage.x, stage.y) < stage.r) return advanceStage(events);
        break;
      case 'disable':
        if (state.missionCar && state.missionCar.dead) {
          toast('The van is wrecked. Dario is done.');
          return advanceStage(events);
        }
        break;
      case 'escape':
        if (state.wanted <= 0) return advanceStage(events);
        break;
      default:
        break;
    }
    return events;
  }

  /**
   * One fixed step. `ctl` is the controls object (see NEUTRAL for the shape). With `harmless`
   * set (the title screen's backdrop) traffic and pedestrians live their lives but the player
   * stands untouched, no crimes are recorded and no mission advances.
   */
  function step(dt, ctl, harmless) {
    const c = ctl ?? NEUTRAL;
    let events = 0;
    state.time += dt;
    if (state.banner) { state.banner.t -= dt; if (state.banner.t <= 0) state.banner = null; }
    if (state.toast) { state.toast.t -= dt; if (state.toast.t <= 0) state.toast = null; }
    state.shake = Math.max(0, state.shake - dt * 26);
    player.hitCd = Math.max(0, player.hitCd - dt);
    player.hurtT += dt;
    if (!harmless && player.hurtT > PLAYER.regenDelay && player.health > 0 && player.health < PLAYER.regenCap) {
      player.health = Math.min(PLAYER.regenCap, player.health + PLAYER.regen * dt);
    }

    if (harmless) {
      state.titleCam.x = 1540 + Math.sin(state.time * 0.05) * 620;
      state.titleCam.y = 1100 + Math.cos(state.time * 0.037) * 420;
      events = stepCars(dt, events);
      events = stepPeds(dt, events);
    } else if (!state.over && !state.busted) {
      events = player.onCar ? stepPlayerInCar(dt, c, events) : stepPlayerOnFoot(dt, c, events);
      events = stepCars(dt, events);
      events = stepPeds(dt, events);
      events = stepBullets(dt, events);
      events |= stepPoliceSpawning(dt);
      events = stepMissions(dt, events);
    } else {
      events = stepCars(dt, events);
      events = stepPeds(dt, events);
    }

    for (let index = state.particles.length - 1; index >= 0; index -= 1) {
      const particle = state.particles[index];
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.vx *= 0.92;
      particle.vy *= 0.92;
      particle.life -= dt;
      if (particle.life <= 0) state.particles.splice(index, 1);
    }
    // Downed pedestrians are cleared away after a while; the harbour keeps its headcount.
    for (const ped of state.peds) {
      if (ped.state === 'down' && ped.downT > 7) {
        const snap = pedSnapshot.find((entry) => entry.ped === ped);
        if (snap) { ped.x = snap.x; ped.y = snap.y; ped.corner = snap.corner; }
        ped.health = PED.health;
        ped.state = 'walk';
        ped.downT = 0;
      }
    }
    return events;
  }

  reset();
  return { state, reset, respawn, step, makeSave, applySave, missions };
}
