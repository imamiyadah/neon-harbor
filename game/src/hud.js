// The heads-up display, drawn in the fixed 1280x720 logical space after the world: health,
// money and ammo, the wanted stars, the current objective (with the ferry clock when a timed
// stage is running), the bust meter, centre-screen banners and toasts, a controls hint, and
// the minimap - streets, water, traffic, police, packages, the objective and Rook himself.
import { FONT, PALETTE, POLICE, ROAD, VIEW } from './config.js';

const MAP = { x: VIEW.width - 216, y: 64, w: 196, h: 150 };
const fonts = new Map();

function text(context, value, x, y, size, color, align = 'left', weight = '') {
  const key = size + weight;
  if (!fonts.has(key)) fonts.set(key, `${weight} ${size}px ${FONT}`);
  context.font = fonts.get(key);
  context.fillStyle = color;
  context.textAlign = align;
  context.textBaseline = 'alphabetic';
  context.fillText(value, x, y);
}

function roundRect(context, x, y, w, h, r) {
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + w, y, x + w, y + h, r);
  context.arcTo(x + w, y + h, x, y + h, r);
  context.arcTo(x, y + h, x, y, r);
  context.arcTo(x, y, x + w, y, r);
  context.closePath();
}

function star(context, cx, cy, r, filled) {
  context.beginPath();
  for (let index = 0; index < 10; index += 1) {
    const angle = -Math.PI / 2 + index * Math.PI / 5;
    const radius = index % 2 === 0 ? r : r * 0.45;
    const x = cx + Math.cos(angle) * radius;
    const y = cy + Math.sin(angle) * radius;
    if (index === 0) context.moveTo(x, y);
    else context.lineTo(x, y);
  }
  context.closePath();
  context.fillStyle = filled ? PALETTE.star : PALETTE.starOff;
  context.fill();
}

function wrap(context, value, size, maxWidth) {
  context.font = `${size}px ${FONT}`;
  const words = value.split(' ');
  const lines = [];
  let line = '';
  for (const word of words) {
    const trial = line === '' ? word : line + ' ' + word;
    if (context.measureText(trial).width > maxWidth && line !== '') {
      lines.push(line);
      line = word;
    } else line = trial;
  }
  if (line !== '') lines.push(line);
  return lines;
}

function drawMinimap(context, state) {
  const city = state.city;
  const sx = MAP.w / city.width;
  const sy = MAP.h / city.height;
  const px = (x) => MAP.x + x * sx;
  const py = (y) => MAP.y + y * sy;
  context.fillStyle = PALETTE.minimapBg;
  roundRect(context, MAP.x - 4, MAP.y - 4, MAP.w + 8, MAP.h + 8, 8);
  context.fill();
  context.fillStyle = '#241d33';
  context.fillRect(MAP.x, MAP.y, MAP.w, MAP.h);
  context.fillStyle = PALETTE.minimapWater;
  context.fillRect(MAP.x, py(city.waterY), MAP.w, MAP.h - (py(city.waterY) - MAP.y));
  context.strokeStyle = PALETTE.minimapRoad;
  context.lineWidth = 1.4;
  context.beginPath();
  for (const vx of ROAD.vx) { context.moveTo(px(vx), MAP.y); context.lineTo(px(vx), py(city.waterY)); }
  for (const hy of ROAD.hy) { context.moveTo(MAP.x, py(hy)); context.lineTo(MAP.x + MAP.w, py(hy)); }
  context.stroke();
  // Packages still out there.
  context.fillStyle = 'rgba(255, 209, 102, 0.55)';
  for (const pack of state.packages) {
    if (!pack.taken) context.fillRect(px(pack.x) - 1, py(pack.y) - 1, 2, 2);
  }
  // Cars: traffic grey, police flashing, Rook's ride white.
  for (const car of state.cars) {
    if (car.isPolice) {
      context.fillStyle = Math.floor(state.time * 6) % 2 === 0 ? PALETTE.lightRed : PALETTE.lightBlue;
      context.fillRect(px(car.x) - 2, py(car.y) - 2, 4, 4);
    } else if (car.driver === 'player') {
      context.fillStyle = '#ffffff';
      context.fillRect(px(car.x) - 2, py(car.y) - 2, 4, 4);
    } else if (car.driver === 'traffic' || car.driver === 'flee') {
      context.fillStyle = '#9aa3b2';
      context.fillRect(px(car.x) - 1, py(car.y) - 1, 2, 2);
    }
  }
  // The objective, pulsing gold.
  if (state.marker) {
    const pulse = 3 + Math.sin(state.time * 5) * 1.2;
    context.fillStyle = PALETTE.marker;
    context.beginPath();
    context.arc(px(state.marker.x), py(state.marker.y), pulse, 0, Math.PI * 2);
    context.fill();
  }
  // Rook.
  const player = state.player;
  context.save();
  context.translate(px(player.x), py(player.y));
  context.rotate(player.angle);
  context.fillStyle = PALETTE.player;
  context.beginPath();
  context.moveTo(5, 0);
  context.lineTo(-3.4, -3);
  context.lineTo(-3.4, 3);
  context.closePath();
  context.fill();
  context.restore();
}

export function drawHud(context, state) {
  const player = state.player;
  // Health bar, top left.
  context.fillStyle = 'rgba(16, 12, 26, 0.66)';
  roundRect(context, 16, 14, 250, 64, 8);
  context.fill();
  context.fillStyle = PALETTE.healthBack;
  context.fillRect(28, 26, 226, 14);
  context.fillStyle = player.health > 30 ? PALETTE.health : (Math.floor(state.time * 5) % 2 === 0 ? PALETTE.health : '#ff8fa3');
  context.fillRect(28, 26, 226 * Math.max(0, player.health) / 100, 14);
  text(context, `$${state.money}`, 28, 68, 24, PALETTE.money, 'left', '700');
  if (!player.onCar) text(context, `AMMO ${state.ammo}`, 262, 68, 17, PALETTE.text, 'right', '600');

  // Wanted stars, top right, above the minimap.
  for (let index = 0; index < 5; index += 1) {
    star(context, VIEW.width - 196 + index * 40 + 16, 34, 14, index < state.stars);
  }
  drawMinimap(context, state);

  // Objective, top centre.
  if (state.objective) {
    const lines = wrap(context, state.objective, 19, 520);
    const h = 20 + lines.length * 24 + (state.stageTimer !== null ? 26 : 0);
    context.fillStyle = 'rgba(16, 12, 26, 0.66)';
    roundRect(context, VIEW.width / 2 - 290, 14, 580, h, 8);
    context.fill();
    lines.forEach((line, index) => text(context, line, VIEW.width / 2, 42 + index * 24, 19, PALETTE.text, 'center', '600'));
    if (state.stageTimer !== null) {
      const seconds = Math.max(0, Math.ceil(state.stageTimer));
      const label = `FERRY LEAVES IN ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;
      text(context, label, VIEW.width / 2, 42 + lines.length * 24, 19, seconds < 30 ? PALETTE.health : PALETTE.marker, 'center', '700');
    }
  }

  // The bust meter, under the objective, only while it is filling.
  if (state.bust > 0.08) {
    const fraction = Math.min(1, state.bust / POLICE.bustTime);
    context.fillStyle = 'rgba(16, 12, 26, 0.7)';
    roundRect(context, VIEW.width / 2 - 130, 128, 260, 30, 6);
    context.fill();
    context.fillStyle = PALETTE.lightRed;
    context.fillRect(VIEW.width / 2 - 122, 136, 244 * fraction, 8);
    text(context, 'BUSTED', VIEW.width / 2, 154, 13, '#ffb3ab', 'center', '700');
  }

  // Speed, bottom right, when driving.
  if (player.onCar) {
    const kmh = Math.round(Math.abs(player.onCar.speed) * 0.36);
    text(context, `${kmh} km/h`, VIEW.width - 24, VIEW.height - 22, 24, PALETTE.text, 'right', '700');
    if (player.onCar.dead) text(context, 'ENGINE DEAD', VIEW.width - 24, VIEW.height - 52, 16, PALETTE.health, 'right', '700');
  }

  // Controls hint, bottom left, until it has been on screen a while.
  if (state.time < 26) {
    context.globalAlpha = state.time < 22 ? 0.92 : (26 - state.time) / 4;
    const hint = player.onCar
      ? 'W A S D drive · E get out · H horn · P pause'
      : 'W A S D move · SHIFT sprint · E enter car · MOUSE aim · CLICK punch / shoot · P pause';
    text(context, hint, 20, VIEW.height - 20, 15, PALETTE.muted, 'left');
    context.globalAlpha = 1;
  }

  // Toast: small news (cash, packages, sales) above the hint.
  if (state.toast) {
    context.globalAlpha = Math.min(1, state.toast.t / 0.5);
    text(context, state.toast.text, VIEW.width / 2, VIEW.height - 54, 20, PALETTE.marker, 'center', '700');
    context.globalAlpha = 1;
  }

  // Banner: mission titles and story beats, centre screen, fading at both ends.
  if (state.banner) {
    const banner = state.banner;
    const fade = Math.min(1, (banner.dur - banner.t) / 0.4, banner.t / 0.6);
    context.globalAlpha = Math.max(0, fade);
    const lines = wrap(context, banner.text, 20, 640);
    const h = 64 + lines.length * 27;
    context.fillStyle = 'rgba(16, 12, 26, 0.82)';
    roundRect(context, VIEW.width / 2 - 360, 196, 720, h, 10);
    context.fill();
    context.fillStyle = PALETTE.neonPink;
    context.fillRect(VIEW.width / 2 - 360, 196, 720, 4);
    text(context, banner.title, VIEW.width / 2, 240, 30, PALETTE.text, 'center', '800');
    lines.forEach((line, index) => text(context, line, VIEW.width / 2, 274 + index * 27, 20, PALETTE.muted, 'center'));
    context.globalAlpha = 1;
  }

  // Low health: the edges close in.
  if (player.health > 0 && player.health < 30 && !player.onCar) {
    context.fillStyle = `rgba(190, 20, 40, ${0.10 + 0.06 * Math.sin(state.time * 6)})`;
    context.fillRect(0, 0, VIEW.width, 10);
    context.fillRect(0, VIEW.height - 10, VIEW.width, 10);
    context.fillRect(0, 0, 10, VIEW.height);
    context.fillRect(VIEW.width - 10, 0, 10, VIEW.height);
  }
}
