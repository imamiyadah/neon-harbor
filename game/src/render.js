// Drawing only: the world's state and the current screen in, pixels out. A smooth camera
// follows Rook (wider and lazier behind a car, with lookahead), the city is painted from its
// data - streets, blocks, neon-signed buildings, the harbour - and only what the camera can
// see is drawn. Screens (title, pause, wasted, busted) are panels over the live city.
import { FONT, PALETTE, ROAD, VIEW } from './config.js';
import { drawHud } from './hud.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_OVER = 'over';
export const SCREEN_BUSTED = 'busted';

const HALF_ROAD = ROAD.width / 2;
const fonts = new Map();

function text(context, value, x, y, size, color, align = 'center', weight = '') {
  const key = size + weight;
  if (!fonts.has(key)) fonts.set(key, `${weight} ${size}px ${FONT}`);
  context.font = fonts.get(key);
  context.fillStyle = color;
  context.textAlign = align;
  context.textBaseline = 'alphabetic';
  context.fillText(value, x, y);
}

export function createRenderer(canvas) {
  const context = canvas.getContext('2d');
  const view = { scale: 1, x: 0, y: 0 };
  const camera = { x: 880, y: 1540, zoom: 1 };

  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(window.innerWidth * ratio);
    const height = Math.round(window.innerHeight * ratio);
    canvas.width = width;
    canvas.height = height;
    view.scale = Math.min(width / VIEW.width, height / VIEW.height);
    view.x = (width - VIEW.width * view.scale) / 2;
    view.y = (height - VIEW.height * view.scale) / 2;
  }

  /** Turn a mouse position in client pixels into a world point (Rook's aim). */
  function clientToWorld(clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const px = (clientX - rect.left) * (canvas.width / rect.width);
    const py = (clientY - rect.top) * (canvas.height / rect.height);
    const logicalX = (px - view.x) / view.scale;
    const logicalY = (py - view.y) / view.scale;
    return {
      x: camera.x + (logicalX - VIEW.width / 2) / camera.zoom,
      y: camera.y + (logicalY - VIEW.height / 2) / camera.zoom,
    };
  }

  function updateCamera(state, screen, dt) {
    const player = state.player;
    let tx;
    let ty;
    let tz;
    if (screen === SCREEN_TITLE) {
      tx = state.titleCam.x;
      ty = state.titleCam.y;
      tz = 0.72;
    } else if (player.onCar) {
      const car = player.onCar;
      tx = car.x + Math.cos(car.angle) * car.speed * 0.38;
      ty = car.y + Math.sin(car.angle) * car.speed * 0.38;
      tz = 0.8 - Math.min(0.1, Math.abs(car.speed) / 4200);
    } else {
      tx = player.x;
      ty = player.y;
      tz = 1;
    }
    const follow = Math.min(1, dt * (player.onCar ? 3.4 : 5.5));
    camera.x += (tx - camera.x) * follow;
    camera.y += (ty - camera.y) * follow;
    camera.zoom += (tz - camera.zoom) * Math.min(1, dt * 2.6);
    const marginX = VIEW.width / 2 / camera.zoom;
    const marginY = VIEW.height / 2 / camera.zoom;
    camera.x = Math.max(marginX - 60, Math.min(state.city.width - marginX + 60, camera.x));
    camera.y = Math.max(marginY - 60, Math.min(state.city.height - marginY + 60, camera.y));
  }

  function visible(state) {
    const w = VIEW.width / camera.zoom + 80;
    const h = VIEW.height / camera.zoom + 80;
    return { x: camera.x - w / 2, y: camera.y - h / 2, w, h };
  }

  function drawGround(state, vis) {
    const city = state.city;
    context.fillStyle = PALETTE.blockBase;
    context.fillRect(vis.x, vis.y, vis.w, vis.h);
    // The harbour.
    context.fillStyle = PALETTE.water;
    context.fillRect(vis.x, city.waterY, vis.w, city.height - city.waterY);
    context.fillStyle = PALETTE.waterDeep;
    for (let y = city.waterY + 26; y < city.height; y += 44) context.fillRect(vis.x, y, vis.w, 5);
    context.fillStyle = PALETTE.sand;
    context.fillRect(vis.x, city.waterY - 26, vis.w, 26);
    // Piers.
    for (const pier of city.piers) {
      context.fillStyle = '#9a7b4f';
      context.fillRect(pier.x, pier.y, pier.w, pier.h);
      context.fillStyle = 'rgba(0,0,0,0.16)';
      for (let y = pier.y + 14; y < pier.y + pier.h; y += 22) context.fillRect(pier.x, y, pier.w, 3);
    }
    // Blocks (sidewalk slabs).
    context.fillStyle = PALETTE.sidewalk;
    for (const block of city.blocks) {
      if (block.x + block.w < vis.x || block.x > vis.x + vis.w || block.y + block.h < vis.y || block.y > vis.y + vis.h) continue;
      context.fillRect(block.x, block.y, block.w, block.h);
    }
    // Streets.
    context.fillStyle = PALETTE.asphalt;
    for (const vx of ROAD.vx) context.fillRect(vx - HALF_ROAD, 0, ROAD.width, city.waterY);
    for (const hy of ROAD.hy) context.fillRect(0, hy - HALF_ROAD, city.width, ROAD.width);
    // Centre dashes.
    context.fillStyle = PALETTE.laneMark;
    for (const vx of ROAD.vx) for (let y = 14; y < city.waterY - 20; y += 52) context.fillRect(vx - 2, y, 4, 26);
    for (const hy of ROAD.hy) for (let x = 14; x < city.width - 20; x += 52) context.fillRect(x, hy - 2, 26, 4);
    // Crosswalks at intersections.
    context.fillStyle = 'rgba(207, 212, 218, 0.5)';
    for (const vx of ROAD.vx) {
      for (const hy of ROAD.hy) {
        for (let s = -1; s <= 1; s += 2) {
          for (let stripe = -1; stripe <= 1; stripe += 1) {
            context.fillRect(vx + s * (HALF_ROAD + 4) - 3, hy + stripe * 26 - 8, 6, 16);
            context.fillRect(vx + stripe * 26 - 8, hy + s * (HALF_ROAD + 4) - 3, 16, 6);
          }
        }
      }
    }
    // The garage lot.
    const zone = city.landmarks.garage.zone;
    context.fillStyle = '#b8a888';
    context.fillRect(zone.x, zone.y, zone.w, zone.h);
    context.strokeStyle = PALETTE.marker;
    context.lineWidth = 3;
    context.setLineDash([12, 9]);
    context.strokeRect(zone.x + 3, zone.y + 3, zone.w - 6, zone.h - 6);
    context.setLineDash([]);
    // Palms.
    for (const palm of city.palms) {
      if (palm.x < vis.x - 30 || palm.x > vis.x + vis.w + 30 || palm.y < vis.y - 30 || palm.y > vis.y + vis.h + 30) continue;
      context.strokeStyle = PALETTE.palmTrunk;
      context.lineWidth = 4;
      context.beginPath();
      context.moveTo(palm.x, palm.y);
      context.lineTo(palm.x + 3, palm.y - 9);
      context.stroke();
      context.strokeStyle = PALETTE.palmLeaf;
      context.lineWidth = 3;
      for (let leaf = 0; leaf < 5; leaf += 1) {
        const angle = (leaf / 5) * Math.PI * 2 + 0.5;
        context.beginPath();
        context.moveTo(palm.x + 3, palm.y - 9);
        context.quadraticCurveTo(
          palm.x + 3 + Math.cos(angle) * 11, palm.y - 13 + Math.sin(angle) * 6,
          palm.x + 3 + Math.cos(angle) * 17, palm.y - 6 + Math.sin(angle) * 10,
        );
        context.stroke();
      }
    }
  }

  function drawBuildings(state, vis) {
    for (const building of state.city.buildings) {
      if (building.x + building.w < vis.x || building.x > vis.x + vis.w || building.y + building.h < vis.y || building.y > vis.y + vis.h) continue;
      context.fillStyle = 'rgba(30, 16, 8, 0.20)';
      context.fillRect(building.x + 11, building.y + 13, building.w, building.h);
      context.fillStyle = building.color;
      context.fillRect(building.x, building.y, building.w, building.h);
      context.fillStyle = 'rgba(255, 255, 255, 0.16)';
      context.fillRect(building.x + building.roof, building.y + building.roof, building.w - building.roof * 2, building.h - building.roof * 2);
      context.fillStyle = 'rgba(0, 0, 0, 0.13)';
      const inset = building.roof + 7;
      if (building.w > 90 && building.h > 70) context.fillRect(building.x + inset, building.y + inset, building.w - inset * 2, building.h - inset * 2);
      // The neon sign along the street edge.
      context.fillStyle = building.signColor;
      context.fillRect(building.x, building.y + building.h - 5, building.w, 5);
      text(context, building.name.toUpperCase(), building.x + building.w / 2, building.y + building.h - 10, 11, building.signColor, 'center', '700');
    }
  }

  function drawMarker(state) {
    const marker = state.marker;
    if (!marker) return;
    const bounce = Math.sin(state.time * 4) * 6;
    const gradient = context.createLinearGradient(0, marker.y - 150, 0, marker.y);
    gradient.addColorStop(0, 'rgba(255, 209, 102, 0)');
    gradient.addColorStop(1, 'rgba(255, 209, 102, 0.35)');
    context.fillStyle = gradient;
    context.fillRect(marker.x - 13, marker.y - 150, 26, 150);
    context.strokeStyle = PALETTE.marker;
    context.lineWidth = 2.5;
    context.beginPath();
    context.arc(marker.x, marker.y, 20 + Math.sin(state.time * 5) * 4, 0, Math.PI * 2);
    context.stroke();
    context.save();
    context.translate(marker.x, marker.y - 34 + bounce);
    context.rotate(Math.PI / 4);
    context.fillStyle = PALETTE.marker;
    context.fillRect(-9, -9, 18, 18);
    context.restore();
  }

  function drawCar(state, car) {
    const spec = car.spec;
    context.save();
    context.translate(car.x, car.y);
    context.fillStyle = 'rgba(20, 12, 6, 0.28)';
    context.beginPath();
    context.ellipse(3, 5, spec.w * 0.52, spec.h * 0.62, 0, 0, Math.PI * 2);
    context.fill();
    context.rotate(car.angle);
    // Wheels.
    context.fillStyle = '#14161a';
    const wx = spec.w * 0.32;
    const wy = spec.h * 0.5;
    context.fillRect(wx - 6, -wy - 2, 12, 5);
    context.fillRect(wx - 6, wy - 3, 12, 5);
    context.fillRect(-wx - 6, -wy - 2, 12, 5);
    context.fillRect(-wx - 6, wy - 3, 12, 5);
    // Body.
    context.fillStyle = car.dead ? '#3c3a38' : car.color;
    context.beginPath();
    context.roundRect(-spec.w / 2, -spec.h / 2, spec.w, spec.h, 6);
    context.fill();
    if (car.isPolice) {
      context.fillStyle = PALETTE.policeTrim;
      context.fillRect(-spec.w * 0.1, -spec.h / 2, spec.w * 0.2, spec.h);
    }
    // Glass and roof.
    context.fillStyle = '#1d2733';
    context.fillRect(spec.w * 0.06, -spec.h * 0.36, spec.w * 0.2, spec.h * 0.72);
    context.fillRect(-spec.w * 0.3, -spec.h * 0.34, spec.w * 0.12, spec.h * 0.68);
    context.fillStyle = 'rgba(255,255,255,0.20)';
    context.fillRect(-spec.w * 0.16, -spec.h * 0.3, spec.w * 0.2, spec.h * 0.6);
    // Headlights.
    context.fillStyle = '#fff6c9';
    context.fillRect(spec.w / 2 - 3, -spec.h * 0.32, 3, 5);
    context.fillRect(spec.w / 2 - 3, spec.h * 0.32 - 5, 3, 5);
    if (car.isPolice && !car.dead) {
      const phase = Math.floor(state.time * 7 + car.id) % 2 === 0;
      context.fillStyle = phase ? PALETTE.lightRed : PALETTE.lightBlue;
      context.fillRect(-7, -spec.h * 0.3, 6, spec.h * 0.6);
      context.fillStyle = phase ? PALETTE.lightBlue : PALETTE.lightRed;
      context.fillRect(1, -spec.h * 0.3, 6, spec.h * 0.6);
    }
    context.restore();
    // The mission car wears a gold ring so it can be found in traffic.
    if (state.missionCar === car) {
      context.strokeStyle = PALETTE.marker;
      context.lineWidth = 2.5;
      context.beginPath();
      context.arc(car.x, car.y, spec.w * 0.78 + Math.sin(state.time * 5) * 3, 0, Math.PI * 2);
      context.stroke();
    }
    // Damage smoke is the world's job (particles); a wreck just sits dark.
  }

  function drawPed(state, ped) {
    context.fillStyle = 'rgba(20, 12, 6, 0.25)';
    context.beginPath();
    context.ellipse(ped.x + 2, ped.y + 3, 8, 5, 0, 0, Math.PI * 2);
    context.fill();
    if (ped.state === 'down') {
      context.fillStyle = '#5b5348';
      context.beginPath();
      context.ellipse(ped.x, ped.y, 11, 5.5, ped.angle, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = 'rgba(160, 30, 40, 0.5)';
      context.beginPath();
      context.arc(ped.x, ped.y, 6, 0, Math.PI * 2);
      context.fill();
      return;
    }
    context.fillStyle = ped.color;
    context.beginPath();
    context.arc(ped.x, ped.y, 7.5, 0, Math.PI * 2);
    context.fill();
    context.fillStyle = '#e8b08a';
    context.beginPath();
    context.arc(ped.x + Math.cos(ped.angle) * 2.5, ped.y + Math.sin(ped.angle) * 2.5, 3.8, 0, Math.PI * 2);
    context.fill();
  }

  function drawPlayer(state) {
    const player = state.player;
    if (player.onCar) return;
    context.fillStyle = 'rgba(20, 12, 6, 0.3)';
    context.beginPath();
    context.ellipse(player.x + 2, player.y + 4, 10, 6, 0, 0, Math.PI * 2);
    context.fill();
    // The pistol, toward the aim.
    context.strokeStyle = '#20242c';
    context.lineWidth = 4;
    context.beginPath();
    context.moveTo(player.x, player.y);
    context.lineTo(player.x + Math.cos(player.angle) * 17, player.y + Math.sin(player.angle) * 17);
    context.stroke();
    context.fillStyle = PALETTE.player;
    context.beginPath();
    context.arc(player.x, player.y, 9.5, 0, Math.PI * 2);
    context.fill();
    context.strokeStyle = '#fdf6ec';
    context.lineWidth = 2;
    context.stroke();
    context.fillStyle = '#e8b08a';
    context.beginPath();
    context.arc(player.x + Math.cos(player.angle) * 3, player.y + Math.sin(player.angle) * 3, 4.4, 0, Math.PI * 2);
    context.fill();
    if (player.hitCd > 0.35) {
      context.strokeStyle = 'rgba(239, 71, 111, 0.8)';
      context.lineWidth = 2.5;
      context.beginPath();
      context.arc(player.x, player.y, 14, 0, Math.PI * 2);
      context.stroke();
    }
  }

  function drawWorld(state) {
    const vis = visible(state);
    drawGround(state, vis);
    drawBuildings(state, vis);
    // Packages.
    for (const pack of state.packages) {
      if (pack.taken) continue;
      if (pack.x < vis.x - 20 || pack.x > vis.x + vis.w + 20 || pack.y < vis.y - 20 || pack.y > vis.y + vis.h + 20) continue;
      context.fillStyle = 'rgba(255, 209, 102, 0.3)';
      context.beginPath();
      context.arc(pack.x, pack.y, 13 + Math.sin(state.time * 5 + pack.x) * 2.5, 0, Math.PI * 2);
      context.fill();
      context.fillStyle = '#8a6d1d';
      context.fillRect(pack.x - 6, pack.y - 6, 12, 12);
      context.fillStyle = PALETTE.marker;
      context.fillRect(pack.x - 6, pack.y - 2, 12, 3.4);
    }
    drawMarker(state);
    for (const ped of state.peds) {
      if (ped.x < vis.x - 30 || ped.x > vis.x + vis.w + 30 || ped.y < vis.y - 30 || ped.y > vis.y + vis.h + 30) continue;
      drawPed(state, ped);
    }
    for (const car of state.cars) {
      if (car.x < vis.x - 70 || car.x > vis.x + vis.w + 70 || car.y < vis.y - 70 || car.y > vis.y + vis.h + 70) continue;
      drawCar(state, car);
    }
    drawPlayer(state);
    // Bullets.
    context.strokeStyle = PALETTE.bullet;
    context.lineWidth = 3;
    context.beginPath();
    for (const bullet of state.bullets) {
      context.moveTo(bullet.x - bullet.vx * 0.014, bullet.y - bullet.vy * 0.014);
      context.lineTo(bullet.x, bullet.y);
    }
    context.stroke();
    // Particles.
    for (const particle of state.particles) {
      context.globalAlpha = Math.max(0, particle.life / particle.maxLife);
      context.fillStyle = particle.color;
      context.fillRect(particle.x - particle.size / 2, particle.y - particle.size / 2, particle.size, particle.size);
    }
    context.globalAlpha = 1;
  }

  function drawPanel(title, lines, prompt, accent) {
    context.fillStyle = 'rgba(12, 9, 20, 0.55)';
    context.fillRect(0, 0, VIEW.width, VIEW.height);
    const w = 700;
    const h = 150 + lines.length * 30;
    const x = (VIEW.width - w) / 2;
    const y = (VIEW.height - h) / 2 - 20;
    context.fillStyle = PALETTE.panel;
    context.beginPath();
    context.roundRect(x, y, w, h, 12);
    context.fill();
    context.fillStyle = accent;
    context.fillRect(x, y, w, 5);
    context.save();
    context.shadowColor = accent;
    context.shadowBlur = 22;
    text(context, title, VIEW.width / 2, y + 72, 46, PALETTE.text, 'center', '800');
    context.restore();
    lines.forEach((line, index) => text(context, line, VIEW.width / 2, y + 116 + index * 30, 19, PALETTE.muted));
    text(context, prompt, VIEW.width / 2, y + h - 24, 20, PALETTE.marker, 'center', '700');
  }

  const TITLE_LINES = [
    'Rook drove getaway for the Corsairs once. Once was enough -',
    'and the debt stayed. Mara Voss at the Driftline Garage has work:',
    'five jobs across a sun-soaked harbour of neon and salt.',
    '',
    'Drive and walk the whole city. Steal cars, dodge the precinct,',
    'sell hot wheels at the garage, and never get caught standing still.',
    '',
    'W A S D move / drive · E enter & exit cars · MOUSE aim · CLICK punch / shoot',
    'SHIFT sprint · H horn · P pause · Your progress saves as you play',
  ];

  function statsLines(state, best) {
    const stats = state.stats;
    return [
      `Cash $${state.money} · Best haul $${Math.max(best, state.money)}`,
      `Missions done ${stats.missions} · Cars stolen ${stats.stolen} · Packages ${stats.packages}/${state.packages.length}`,
      `Shots fired ${stats.shots}`,
    ];
  }

  /** Paint one frame. `best` is the best cash total, for the end panels. */
  function draw(state, screen, best, dt) {
    updateCamera(state, screen, dt || 1 / 60);
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.fillStyle = PALETTE.backdrop;
    context.fillRect(0, 0, canvas.width, canvas.height);
    const shakeX = state.shake > 0 ? (Math.random() - 0.5) * state.shake : 0;
    const shakeY = state.shake > 0 ? (Math.random() - 0.5) * state.shake : 0;
    context.setTransform(
      view.scale * camera.zoom, 0, 0, view.scale * camera.zoom,
      view.x + view.scale * (VIEW.width / 2 - camera.x * camera.zoom + shakeX),
      view.y + view.scale * (VIEW.height / 2 - camera.y * camera.zoom + shakeY),
    );
    drawWorld(state);
    context.setTransform(view.scale, 0, 0, view.scale, view.x, view.y);
    if (screen === SCREEN_PLAY || screen === SCREEN_PAUSED) drawHud(context, state);
    if (screen === SCREEN_TITLE) {
      drawPanel('NEON HARBOR', TITLE_LINES, state.uiSave ? 'ENTER — continue · N — new game' : 'ENTER — hit the streets', PALETTE.neonPink);
    } else if (screen === SCREEN_PAUSED) {
      drawPanel('PAUSED', ['The harbour waits. Progress is saved.', '', ...statsLines(state, best)], 'P — resume · ENTER — resume', PALETTE.neonCyan);
    } else if (screen === SCREEN_OVER) {
      drawPanel('WASTED', ['St. Sable patches you up and sends the bill.', '', ...statsLines(state, best)], 'ENTER — wake up at the hospital', PALETTE.health);
    } else if (screen === SCREEN_BUSTED) {
      drawPanel('BUSTED', ['The precinct thanks you for the donation.', '', ...statsLines(state, best)], 'ENTER — walk out of the precinct', PALETTE.lightBlue);
    }
  }

  resize();
  window.addEventListener('resize', resize);
  return { draw, clientToWorld };
}
