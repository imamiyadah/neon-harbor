// The Harbor Precinct's finest: police cars that spawn at intersections out of sight, hunt
// the player across the whole map (they are not bound to lanes), and try to ram and box the
// player in. The wanted maths itself lives in world.js; this module is the driving.
import { POLICE, ROAD } from './config.js';
import { createCar, stepCar } from './vehicles.js';

export function createPoliceCar(x, y, angle) {
  const car = createCar('sedan', x, y, angle, '#eef1f5');
  car.spec = { ...car.spec, topSpeed: POLICE.topSpeed, accel: POLICE.accel, name: 'Precinct Interceptor' };
  car.isPolice = true;
  car.driver = 'police';
  return car;
}

/**
 * Where a fresh police car joins: an intersection at least `spawnDistance` from the player
 * (so it is never seen popping in), preferring the ring around that distance.
 */
export function policeSpawnPoint(city, random, px, py) {
  const options = [];
  for (const vx of ROAD.vx) {
    for (const hy of ROAD.hy) {
      const distance = Math.hypot(vx - px, hy - py);
      if (distance >= POLICE.spawnDistance * 0.8 && distance <= POLICE.spawnDistance * 1.7) options.push({ x: vx, y: hy });
    }
  }
  if (options.length > 0) return options[Math.floor(random() * options.length)];
  // The player is in a corner and every intersection is close or far: use the farthest one.
  let best = { x: ROAD.vx[0], y: ROAD.hy[0] };
  let bestDistance = -1;
  for (const vx of ROAD.vx) {
    for (const hy of ROAD.hy) {
      const distance = Math.hypot(vx - px, hy - py);
      if (distance > bestDistance) { bestDistance = distance; best = { x: vx, y: hy }; }
    }
  }
  void city;
  return best;
}

function wrapAngle(angle) {
  return ((angle + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
}

/**
 * Chase `target` ({x, y, vx, vy}): steer at where the target is heading, full throttle on
 * straights, back up and swing round when the nose points the wrong way at close range.
 * Returns the crash impact from stepCar so the world can price the ram.
 */
export function stepPolice(city, car, dt, target) {
  const lead = 0.35;
  const tx = target.x + (target.vx ?? 0) * lead;
  const ty = target.y + (target.vy ?? 0) * lead;
  const dx = tx - car.x;
  const dy = ty - car.y;
  const distance = Math.hypot(dx, dy);
  const desired = Math.atan2(dy, dx);
  const diff = wrapAngle(desired - car.angle);
  const steer = Math.max(-1, Math.min(1, diff * 2.1));
  let throttle = 1;
  if (Math.abs(diff) > 2.0 && distance < 110) throttle = -0.8; // nose the wrong way: reverse out
  else if (Math.abs(diff) > 1.2) throttle = 0.45;
  if (distance < 34) throttle = Math.min(throttle, 0.25); // alongside: hold the box, don't orbit
  return stepCar(city, car, dt, throttle, steer);
}
