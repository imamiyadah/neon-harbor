// Cars: the shared body every vehicle uses, the driving physics (accelerate, brake, steer,
// collide with the city), and the two kinds of computer driving that are not police - traffic
// that follows lanes and turns at intersections, and the fleeing car that runs from the player.
// Police pursuit lives in police.js; both build on stepCar here.
import { CAR_TYPES, ROAD, TRAFFIC } from './config.js';
import { circleHitsSolid } from './city.js';

let nextCarId = 1;

export function createCar(typeName, x, y, angle, color) {
  const spec = CAR_TYPES[typeName];
  return {
    id: nextCarId++,
    type: typeName,
    spec,
    x, y, angle,
    speed: 0,
    color,
    health: spec.health,
    maxHealth: spec.health,
    driver: null, // null = parked/empty, otherwise 'player', 'traffic', 'police', 'flee'
    stolen: false,
    isPolice: false,
    dead: false,
    ai: null,
    honkT: 0,
  };
}

export function pickColor(random, typeName) {
  const colors = CAR_TYPES[typeName].colors;
  return colors[Math.floor(random() * colors.length)];
}

/** Do the car's two body circles (front and rear axle) touch the city at this pose? */
export function carHitsSolid(city, car, x, y, angle) {
  const reach = car.spec.w * 0.32;
  const r = car.spec.h * 0.62;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  return circleHitsSolid(city, x + cos * reach, y + sin * reach, r)
    || circleHitsSolid(city, x - cos * reach, y - sin * reach, r);
}

/**
 * Advance one car under driver control. throttle is -1..1 (negative brakes, then reverses),
 * steer is -1..1. Returns the impact speed if the car crashed into the city this step, else 0.
 */
export function stepCar(city, car, dt, throttle, steer) {
  const spec = car.spec;
  if (car.dead) { car.speed = 0; return 0; }
  // De-penetration: a car that nosed into the sidewalk strip can overlap a building face so
  // that every axis slide stays overlapped and no throttle can ever move it. If the car is
  // already touching solid, nudge it out along the first free compass direction.
  if (carHitsSolid(city, car, car.x, car.y, car.angle)) {
    let freed = false;
    for (const dist of [8, 16, 26]) {
      for (let dir = 0; dir < 8 && !freed; dir += 1) {
        const a = dir * Math.PI / 4;
        const nx = car.x + Math.cos(a) * dist;
        const ny = car.y + Math.sin(a) * dist;
        if (!carHitsSolid(city, car, nx, ny, car.angle)) { car.x = nx; car.y = ny; freed = true; }
      }
      if (freed) break;
    }
  }
  if (throttle > 0) {
    car.speed = Math.min(spec.topSpeed, car.speed + spec.accel * throttle * dt);
  } else if (throttle < 0) {
    if (car.speed > 5) car.speed = Math.max(0, car.speed + spec.accel * 1.7 * throttle * dt);
    else car.speed = Math.max(-spec.reverse, car.speed + spec.accel * 0.7 * throttle * dt);
  } else {
    const drag = 150 * dt + Math.abs(car.speed) * 0.5 * dt;
    car.speed = Math.abs(car.speed) <= drag ? 0 : car.speed - Math.sign(car.speed) * drag;
  }
  const speedAbs = Math.abs(car.speed);
  if (speedAbs > 1 && steer !== 0) {
    const grip = 2.5 * (0.35 + 0.65 * Math.min(1, speedAbs / 130));
    car.angle += steer * grip * dt * (car.speed < 0 ? -1 : 1);
  }
  if (speedAbs === 0) return 0;
  const dx = Math.cos(car.angle) * car.speed * dt;
  const dy = Math.sin(car.angle) * car.speed * dt;
  const before = Math.abs(car.speed);
  if (!carHitsSolid(city, car, car.x + dx, car.y + dy, car.angle)) {
    car.x += dx;
    car.y += dy;
    return 0;
  }
  // Blocked: try sliding along each axis before calling it a crash.
  if (!carHitsSolid(city, car, car.x + dx, car.y, car.angle)) { car.x += dx; car.speed *= 0.55; return before * 0.4; }
  if (!carHitsSolid(city, car, car.x, car.y + dy, car.angle)) { car.y += dy; car.speed *= 0.55; return before * 0.4; }
  car.speed = -car.speed * 0.22;
  return before;
}

/** Lane bookkeeping shared by traffic and the fleeing car. */
function lanePose(car) {
  const ai = car.ai;
  if (ai.axis === 'v') {
    const centre = ROAD.vx[ai.road];
    return { x: centre + (ai.dir > 0 ? -ROAD.lane : ROAD.lane), angle: ai.dir > 0 ? Math.PI / 2 : -Math.PI / 2 };
  }
  const centre = ROAD.hy[ai.road];
  return { x: centre + (ai.dir > 0 ? ROAD.lane : -ROAD.lane), angle: ai.dir > 0 ? 0 : Math.PI };
}

function startLane(city, car, random) {
  const onVertical = random() < 0.55;
  if (onVertical) {
    const road = Math.floor(random() * ROAD.vx.length);
    car.ai = { axis: 'v', road, dir: random() < 0.5 ? 1 : -1, cruise: 0, decisionAt: 0 };
    car.x = ROAD.vx[road] + (car.ai.dir > 0 ? -ROAD.lane : ROAD.lane);
    car.y = 200 + random() * (city.waterY - 400);
  } else {
    const road = Math.floor(random() * ROAD.hy.length);
    car.ai = { axis: 'h', road, dir: random() < 0.5 ? 1 : -1, cruise: 0, decisionAt: 0 };
    car.y = ROAD.hy[road] + (car.ai.dir > 0 ? ROAD.lane : -ROAD.lane);
    car.x = 200 + random() * (city.width - 400);
  }
  car.ai.cruise = TRAFFIC.speedMin + random() * (TRAFFIC.speedMax - TRAFFIC.speedMin);
  const pose = lanePose(car);
  car.angle = pose.angle;
  car.speed = car.ai.cruise * 0.6;
  return car;
}

export function createTrafficCar(random, city, typeName, x, y) {
  const car = createCar(typeName, x ?? 0, y ?? 0, 0, pickColor(random, typeName));
  car.driver = 'traffic';
  if (x === undefined || y === undefined) startLane(city, car, random);
  else {
    // Placed by hand (screenshot scenes): snap to the nearest lane and drive it.
    startLane(city, car, random);
    car.x = x;
    car.y = y;
  }
  return car;
}

export function createFleeCar(typeName, x, y, angle, color) {
  const car = createCar(typeName, x, y, angle, color);
  car.driver = 'flee';
  // Begin on the horizontal street it was placed on, heading east, and run.
  car.ai = { axis: 'h', road: 0, dir: 1, cruise: 305, decisionAt: 0 };
  for (let index = 0; index < ROAD.hy.length; index += 1) {
    if (Math.abs(y - ROAD.hy[index]) < 60) car.ai.road = index;
  }
  return car;
}

/**
 * Drive a lane-following car. `aheadBlocked(car)` reports something slow in front; `chooseTurn`
 * (optional) decides at each intersection: return 'left', 'right', 'straight' or null to keep
 * the default random behaviour. Turning swaps the car onto the crossing street's lane.
 */
function stepLaneCar(city, car, dt, random, aheadBlocked, chooseTurn, topSpeed) {
  const ai = car.ai;
  const blocked = aheadBlocked(car);
  const target = blocked ? 0 : Math.min(ai.cruise, topSpeed);
  const rate = blocked ? 420 : 160;
  car.speed += Math.max(-rate * dt, Math.min(rate * dt, target - car.speed));

  // Crossed an intersection this step? The crossing streets' centres are the decision points.
  const crossings = ai.axis === 'v' ? ROAD.hy : ROAD.vx;
  const along = ai.axis === 'v' ? car.y : car.x;
  const nextAlong = along + ai.dir * car.speed * dt;
  for (let index = 0; index < crossings.length; index += 1) {
    const centre = crossings[index];
    if ((along - centre) * (nextAlong - centre) <= 0 && Math.abs(nextAlong - centre) < Math.abs(car.speed * dt) + 1 && Math.abs(car.speed) > 30) {
      let turn = null;
      if (chooseTurn) turn = chooseTurn(car, index);
      else if (random() < TRAFFIC.turnChance) turn = random() < 0.5 ? 'left' : 'right';
      if (turn === 'left' || turn === 'right') {
        const wasVertical = ai.axis === 'v';
        ai.axis = wasVertical ? 'h' : 'v';
        ai.road = index;
        // The new lane direction comes from the heading after the turn; the lateral lane
        // offset is NOT snapped - the lane-following below eases the car onto its new lane.
        const newAngle = car.angle + (turn === 'left' ? -Math.PI / 2 : Math.PI / 2);
        if (ai.axis === 'h') ai.dir = Math.cos(newAngle) > 0 ? 1 : -1;
        else ai.dir = Math.sin(newAngle) > 0 ? 1 : -1;
        car.angle = newAngle;
      }
      break;
    }
  }

  const pose = lanePose(car);
  if (car.ai.axis === 'v') {
    car.y += car.ai.dir * car.speed * dt;
    car.x += (pose.x - car.x) * Math.min(1, 4 * dt);
  } else {
    car.x += car.ai.dir * car.speed * dt;
    car.y += (pose.x - car.y) * Math.min(1, 4 * dt);
  }
  const angleDelta = ((pose.angle - car.angle + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
  car.angle += angleDelta * Math.min(1, 6 * dt);
  // Keep city traffic inside the map: turn around at the water and the world edge.
  if (car.y > city.waterY - 60 && car.ai.axis === 'v' && car.ai.dir > 0) { car.ai.dir = -1; }
  if (car.y < 90 && car.ai.axis === 'v' && car.ai.dir < 0) { car.ai.dir = 1; }
  if (car.x > city.width - 90 && car.ai.axis === 'h' && car.ai.dir > 0) { car.ai.dir = -1; }
  if (car.x < 90 && car.ai.axis === 'h' && car.ai.dir < 0) { car.ai.dir = 1; }
}

export function stepTraffic(city, car, dt, random, aheadBlocked) {
  stepLaneCar(city, car, dt, random, aheadBlocked, null, car.spec.topSpeed);
}

/** The fleeing car runs the lanes at full pace, turning away from the threat at intersections. */
export function stepFlee(city, car, dt, random, aheadBlocked, threat) {
  const chooseTurn = (laneCar, crossingIndex) => {
    // Score each way by the distance it puts between the car and the threat after the turn.
    const options = ['straight', 'left', 'right'];
    let best = 'straight';
    let bestScore = -Infinity;
    for (const option of options) {
      let angle = laneCar.angle;
      if (option === 'left') angle -= Math.PI / 2;
      if (option === 'right') angle += Math.PI / 2;
      const px = laneCar.x + Math.cos(angle) * 190;
      const py = laneCar.y + Math.sin(angle) * 190;
      if (py > city.waterY - 40 || px < 40 || px > city.width - 40 || py < 40) continue;
      const score = (px - threat.x) ** 2 + (py - threat.y) ** 2;
      if (score > bestScore) { bestScore = score; best = option; }
    }
    void crossingIndex;
    return best;
  };
  stepLaneCar(city, car, dt, random, aheadBlocked, chooseTurn, car.spec.topSpeed);
}
