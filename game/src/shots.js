// The screenshot scenes behind ?shot=start|play|end. Each one runs the real simulation from
// a fresh world: start lets traffic and pedestrians live under the title for a few seconds;
// play hands Rook to an autopilot that walks to a car, steals it and drives Mara's first job
// across the city on the street grid; end surrounds a wanted Rook with precinct cars until
// the bust lands. The same seed always gives the same frames.
import { ROAD, STEP } from './config.js';
import { circleHitsSolid, nearestStreetPoint } from './city.js';
import { createPoliceCar } from './police.js';
import { SCREEN_BUSTED, SCREEN_PLAY, SCREEN_TITLE } from './render.js';

const START_SECONDS = 6;
const PLAY_SECONDS = 115;
const END_LIMIT = 60 * 20;
const NEUTRAL = { mx: 0, my: 0, sprint: false, attackHeld: false, attackPressed: false, interact: false, aimX: 0, aimY: 0, hasAim: false };

function wrapAngle(angle) {
  return ((angle + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
}

function nearestParkedCar(state) {
  let best = null;
  let bestDist = Infinity;
  for (const car of state.cars) {
    if (car.driver !== null || car.dead || car.isPolice) continue;
    const d = Math.hypot(car.x - state.player.x, car.y - state.player.y);
    if (d < bestDist) { bestDist = d; best = car; }
  }
  return best;
}

function nearestOf(list, value) {
  let best = list[0];
  for (const item of list) if (Math.abs(item - value) < Math.abs(best - value)) best = item;
  return best;
}

/**
 * A street-grid route from (px, py) to the target, as waypoints driven in order: along the
 * street the car is on, across on the crossing street, along the target's street, then in.
 * (Driving "straight" at the target crosses blocks and wedges on buildings.)
 */
function routeFrom(state, px, py, target) {
  const hyNear = nearestOf(ROAD.hy, target.y);
  const vxTarget = nearestOf(ROAD.vx, target.x);
  const vxHere = nearestOf(ROAD.vx, px);
  const hyHere = nearestOf(ROAD.hy, py);
  const points = [];
  if (Math.abs(px - vxHere) <= Math.abs(py - hyHere)) {
    // On (or nearest) a vertical street: ride it to the target's horizontal street.
    if (Math.abs(py - hyNear) > 46) points.push({ x: vxHere, y: hyNear });
    if (Math.abs(target.x - vxHere) > 46) points.push({ x: target.x, y: hyNear });
  } else {
    // On a horizontal street: ride it to the target's vertical street, then to its street.
    if (Math.abs(px - vxTarget) > 46) points.push({ x: vxTarget, y: hyHere });
    if (Math.abs(hyHere - hyNear) > 46) points.push({ x: vxTarget, y: hyNear });
    if (Math.abs(target.x - vxTarget) > 46) points.push({ x: target.x, y: hyNear });
  }
  points.push({ x: target.x, y: target.y });
  return points;
}

function buildRoute(state, car, target) {
  const vxHere = nearestOf(ROAD.vx, car.x);
  const hyHere = nearestOf(ROAD.hy, car.y);
  if (Math.abs(car.x - vxHere) >= 60 && Math.abs(car.y - hyHere) >= 60) {
    // Off-street (a lot, a sidewalk): get to the nearest street point first, then route.
    const entry = nearestStreetPoint(state.city, car.x, car.y);
    return [entry, ...routeFrom(state, entry.x, entry.y, target)];
  }
  return routeFrom(state, car.x, car.y, target);
}

/** One step of autopilot controls: walk to a car, steal it, then drive the route. */
function makePilot() {
  let route = null;
  let routeTarget = null;
  let stuckT = 0;
  let stuckCycles = 0;
  let bestDist = Infinity;
  let reverseT = 0;
  let sidestepT = 0;
  let sidestepSign = 1;
  let lastX = 0;
  let lastY = 0;
  return function pilot(state) {
    const player = state.player;
    const ctl = { ...NEUTRAL };
    if (!player.onCar) {
      const car = nearestParkedCar(state);
      if (!car) return ctl;
      const dx = car.x - player.x;
      const dy = car.y - player.y;
      const d = Math.hypot(dx, dy);
      if (d < 50) { ctl.interact = true; return ctl; }
      let moveX = dx / d;
      let moveY = dy / d;
      // Wedged on a wall? Sidestep along it for a moment, alternating sides.
      const moved = Math.hypot(player.x - lastX, player.y - lastY);
      lastX = player.x;
      lastY = player.y;
      if (sidestepT > 0) {
        sidestepT -= STEP;
        moveX = -dy / d * sidestepSign;
        moveY = dx / d * sidestepSign;
      } else if (moved < 0.25) {
        stuckT += STEP;
        if (stuckT > 0.7) { sidestepT = 0.65; sidestepSign = -sidestepSign; stuckT = 0; }
      } else stuckT = 0;
      // Prefer walking in the street when the way is blocked by a building.
      if (circleHitsSolid(state.city, player.x + moveX * 60, player.y + moveY * 60, 13)) {
        const street = nearestStreetPoint(state.city, player.x, player.y);
        const sx = street.x - player.x;
        const sy = street.y - player.y;
        const sd = Math.hypot(sx, sy);
        if (sd > 12) { moveX = sx / sd; moveY = sy / sd; }
      }
      ctl.mx = moveX;
      ctl.my = moveY;
      ctl.sprint = d > 130;
      return ctl;
    }
    const car = player.onCar;
    if (car.dead) { ctl.interact = true; return ctl; } // a wreck is a coffin: get out, find other wheels
    const target = state.marker ?? { x: car.x, y: car.y };
    if (route === null || routeTarget !== target) {
      route = buildRoute(state, car, target);
      routeTarget = target;
    }
    while (route.length > 1 && Math.hypot(route[0].x - car.x, route[0].y - car.y) < 46) route.shift();
    let point = route[0];
    // Overtake: something slow directly ahead gets aimed around, on its far side, instead of
    // rear-ended and sat behind (which is also how the precinct catches this driver).
    const fwdX = Math.cos(car.angle);
    const fwdY = Math.sin(car.angle);
    for (const other of state.cars) {
      if (other === car) continue;
      const relX = other.x - car.x;
      const relY = other.y - car.y;
      const forward = relX * fwdX + relY * fwdY;
      const lateral = relX * -fwdY + relY * fwdX;
      if (forward > 4 && forward < 78 && Math.abs(lateral) < 24 && Math.abs(other.speed) < Math.abs(car.speed) + 40) {
        // Aim around it - but only on a side whose aim point is clear of buildings,
        // otherwise the "overtake" steers straight into a wall face and grinds there.
        const preferred = lateral >= 0 ? -1 : 1;
        for (const side of [preferred, -preferred]) {
          const cand = { x: point.x - fwdY * side * 46, y: point.y + fwdX * side * 46 };
          if (!circleHitsSolid(state.city, cand.x, cand.y, 22)) { point = cand; break; }
        }
        break;
      }
    }
    const desired = Math.atan2(point.y - car.y, point.x - car.x);
    const diff = wrapAngle(desired - car.angle);
    ctl.mx = Math.max(-1, Math.min(1, diff * 1.7));
    const moved = Math.hypot(car.x - lastX, car.y - lastY);
    lastX = car.x;
    lastY = car.y;
    // Police alongside and the car crawling is how busts happen: floor it, route be damned.
    const panicked = state.nearestPolice < 170 && Math.abs(car.speed) < 170;
    if (reverseT > 0) {
      reverseT -= STEP;
      ctl.my = 0.85;
      ctl.mx = -ctl.mx;
      return ctl;
    }
    if (Math.abs(car.speed) > 8) stuckT = 0;
    else if (moved < 0.4) {
      stuckT += STEP;
      // Wedged hard (barely creeping for over a second): backing out IS escaping, even
      // with the precinct alongside - grinding forward against a wall is how busts land.
      const wedged = Math.abs(car.speed) < 6 && moved < 0.3 && stuckT > 1.1;
      if (stuckT > 1.5 || wedged) {
        reverseT = 0.75;
        stuckT = 0;
        // Twice wedged on the same waypoint without getting closer? The grid has other
        // streets: drop the waypoint (and keep the rest of the route - rebuilding it
        // would only restore the waypoint that wedged us).
        const distNow = Math.hypot(point.x - car.x, point.y - car.y);
        if (distNow > bestDist - 30) stuckCycles += 1;
        else stuckCycles = 0;
        bestDist = distNow;
        if (stuckCycles >= 2 && route && route.length > 1) { route.shift(); stuckCycles = 0; }
        else route = null;
      }
    }
    // Final approach: if the straight line to the marker crosses a building, the marker's
    // stage ring is wide enough to complete from the street - aim at the nearest street
    // point instead of grinding along the wall behind which the marker sits.
    let finalDist = Infinity;
    if (route === null || route.length === 1) {
      finalDist = Math.hypot(target.x - car.x, target.y - car.y);
      if (finalDist < 210) {
        let clear = true;
        for (let s = 1; s < 8; s += 1) {
          const t = s / 8;
          if (circleHitsSolid(state.city, car.x + (target.x - car.x) * t, car.y + (target.y - car.y) * t, 14)) { clear = false; break; }
        }
        if (!clear) {
          const street = nearestStreetPoint(state.city, target.x, target.y);
          point = street;
          ctl.mx = Math.max(-1, Math.min(1, wrapAngle(Math.atan2(street.y - car.y, street.x - car.x) - car.angle) * 1.7));
        }
      }
    }
    if (finalDist < 130) ctl.my = -0.5;
    // Never reverse-turn toward a target behind: at diff near +/-PI the wrapped steering
    // sign flips every step and the car pirouettes in place. A forward U-turn is stable.
    else if (Math.abs(diff) > 2.4) { ctl.my = -0.85; ctl.mx = diff > 0 ? 1 : -1; }
    else ctl.my = panicked || Math.abs(diff) < 1.9 ? -1 : 0.55;
    return ctl;
  };
}

/** The play scene's autopilot, exported so the staging can be traced headlessly. */
export { makePilot };

/**
 * Set `world` to the named scene (start, play or end; any other name is start) and return the
 * screen to draw over it and the best cash figure to show.
 */
export function stageShot(name, world) {
  world.reset();
  const state = world.state;
  if (name === 'play') {
    const pilot = makePilot();
    for (let index = 0; index < PLAY_SECONDS / STEP; index += 1) {
      world.step(STEP, pilot(state), false);
      if (state.missionIndex >= 1 && index > 20 / STEP) break; // first job done: hold the frame
      if (state.over || state.busted) break;
    }
    return { screen: SCREEN_PLAY, best: state.money };
  }
  if (name === 'end') {
    // A wanted Rook, standing his ground badly: three interceptors close in and the bust lands.
    state.wanted = 3;
    const player = state.player;
    for (let index = 0; index < 3; index += 1) {
      const angle = index * (Math.PI * 2 / 3) + 0.4;
      const car = createPoliceCar(
        player.x + Math.cos(angle) * 54,
        player.y + Math.sin(angle) * 54,
        angle + Math.PI,
      );
      state.cars.push(car);
    }
    for (let index = 0; index < END_LIMIT; index += 1) {
      world.step(STEP, NEUTRAL, false);
      if (state.busted || state.over) break;
    }
    return { screen: SCREEN_BUSTED, best: state.money };
  }
  for (let index = 0; index < START_SECONDS / STEP; index += 1) world.step(STEP, null, true);
  return { screen: SCREEN_TITLE, best: 0 };
}
