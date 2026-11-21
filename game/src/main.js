// Boot and the one loop: input is read every frame, the world advances in fixed 1/60 s steps
// (several in a slow frame, none in a fast one), and the renderer paints what is there. The
// game moves between five screens: title, play, paused, wasted and busted. World events come
// back as bit flags and are turned into sound and saves here, where the browser lives.
//
// ?seed=N fixes the city's generation. ?shot=start|play|end (with &seed=N) stages that scene
// instead of running the loop, paints it twice and sets window.__shotReady for a screenshot.
import { BEST_KEY, STEP } from './config.js';
import { createRandom } from './random.js';
import {
  createWorld, EV_BUSTED, EV_CASH, EV_COMPLETE, EV_CRASH, EV_DRY, EV_ENTER, EV_FAIL, EV_HURT,
  EV_OVER, EV_PICKUP, EV_PUNCH, EV_SHOT, EV_STEAL,
} from './world.js';
import { ACTION_CONFIRM, ACTION_HONK, ACTION_INTERACT, ACTION_NEW, ACTION_PAUSE, createInput } from './input.js';
import { createRenderer, SCREEN_BUSTED, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE } from './render.js';
import { createAudio } from './audio.js';
import { hasSave, loadSave, writeSave } from './save.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
const audio = createAudio();

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off: the best haul then lasts this visit only.
  }
}

function runShot(name) {
  const scene = stageShot(name, world);
  world.state.uiSave = false;
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, scene.best, STEP);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();
  let pendingInteract = false;
  let pendingAttack = false;

  function announce(message) {
    status.textContent = message;
  }

  function persist() {
    writeSave(world.makeSave());
    if (world.state.money > best) {
      best = world.state.money;
      saveBest(best);
    }
  }

  function startRun(useSave) {
    audio.unlock();
    audio.click();
    if (useSave) {
      const data = loadSave();
      if (data) world.applySave(data);
      else world.reset();
    } else world.reset();
    accumulator = 0;
    screen = SCREEN_PLAY;
    persist();
    announce('Playing. ' + world.state.objective);
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_INTERACT) pendingInteract = true;
    if (input.takeAttackPressed()) pendingAttack = true;
    if (screen === SCREEN_TITLE) {
      if (actions & ACTION_NEW) startRun(false);
      else if (actions & ACTION_CONFIRM) startRun(hasSave());
      return;
    }
    if (screen === SCREEN_OVER || screen === SCREEN_BUSTED) {
      if (actions & ACTION_CONFIRM) {
        audio.unlock();
        world.respawn(screen === SCREEN_BUSTED ? 'busted' : 'over');
        screen = SCREEN_PLAY;
        persist();
        announce('Playing. ' + world.state.objective);
      }
      return;
    }
    if (actions & ACTION_HONK && screen === SCREEN_PLAY && world.state.player.onCar) {
      audio.unlock();
      audio.honk();
    }
    if (actions & ACTION_PAUSE) {
      if (screen === SCREEN_PLAY) {
        screen = SCREEN_PAUSED;
        persist();
        announce('Paused.');
      } else if (screen === SCREEN_PAUSED) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
    } else if (actions & ACTION_CONFIRM && screen === SCREEN_PAUSED) {
      screen = SCREEN_PLAY;
      announce('Playing.');
    }
  }

  function controls() {
    const axes = input.axes();
    const mouse = input.mouse();
    const aim = mouse.seen ? renderer.clientToWorld(mouse.x, mouse.y) : { x: world.state.player.x, y: world.state.player.y - 60 };
    const ctl = {
      mx: axes.mx,
      my: axes.my,
      sprint: input.sprint(),
      attackHeld: input.attackHeld(),
      attackPressed: pendingAttack,
      interact: pendingInteract,
      aimX: aim.x,
      aimY: aim.y,
      hasAim: mouse.seen,
    };
    pendingAttack = false;
    pendingInteract = false;
    return ctl;
  }

  function react(events) {
    if (events & EV_SHOT) audio.shot();
    if (events & EV_PUNCH) audio.punch();
    if (events & EV_CRASH) audio.crash(0.7);
    else if (events & EV_HURT) audio.crash(0.3);
    if (events & EV_CASH) audio.cash();
    if (events & EV_PICKUP) audio.pickup();
    if (events & EV_ENTER) audio.enter();
    if (events & EV_STEAL) audio.pickup();
    if (events & EV_COMPLETE) { audio.complete(); persist(); announce('Mission complete. ' + world.state.objective); }
    if (events & EV_FAIL) audio.fail();
    if (events & EV_DRY) audio.click();
    if (events & EV_BUSTED) {
      audio.busted();
      screen = SCREEN_BUSTED;
      persist();
      announce('Busted. Press Enter to walk out of the precinct.');
    } else if (events & EV_OVER) {
      audio.fail();
      screen = SCREEN_OVER;
      persist();
      announce('Wasted. Press Enter to wake up at the hospital.');
    }
  }

  function step() {
    if (screen === SCREEN_TITLE) {
      world.step(STEP, null, true);
      return;
    }
    if (screen !== SCREEN_PLAY) return;
    react(world.step(STEP, controls(), false));
  }

  function frame(now) {
    requestAnimationFrame(frame);
    const frameDt = Math.min((now - last) / 1000, MAX_FRAME);
    accumulator += frameDt;
    last = now;
    handleActions();
    if (screen === SCREEN_TITLE || screen === SCREEN_PLAY) {
      while (accumulator >= STEP && (screen === SCREEN_TITLE || screen === SCREEN_PLAY)) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    // Continuous sound follows the frame, not the fixed step.
    const state = world.state;
    if (screen === SCREEN_PLAY) {
      const car = state.player.onCar;
      audio.engine(car ? Math.abs(car.speed) / car.spec.topSpeed : 0, Boolean(car));
      const sirenLevel = state.stars > 0 ? Math.max(0, Math.min(1, 1.15 - state.nearestPolice / 650)) : 0;
      audio.siren(sirenLevel, frameDt);
    } else {
      audio.engine(0, false);
      audio.siren(0, frameDt);
    }
    state.uiSave = hasSave();
    renderer.draw(state, screen, best, frameDt);
  }

  // Leaving the tab pauses a running game rather than letting the precinct work unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      persist();
      announce('Paused.');
    }
  });

  announce('Neon Harbor. Press Enter to start.');
  requestAnimationFrame(frame);
}

if (shot) runShot(shot);
else runGame();
