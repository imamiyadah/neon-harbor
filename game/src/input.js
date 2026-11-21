// Keyboard and pointer input. Held keys give a movement / driving vector; one-shot presses
// (confirm, pause, interact, new game) are queued as bit flags and taken once by the loop, so
// a press between two frames is never lost and never counted twice. The mouse position is
// tracked in client pixels; main.js turns it into a world aim point through the renderer.

export const ACTION_CONFIRM = 1;
export const ACTION_PAUSE = 2;
export const ACTION_INTERACT = 4;
export const ACTION_NEW = 8;
export const ACTION_HONK = 16;

const UP = new Set(['ArrowUp', 'KeyW']);
const DOWN = new Set(['ArrowDown', 'KeyS']);
const LEFT = new Set(['ArrowLeft', 'KeyA']);
const RIGHT = new Set(['ArrowRight', 'KeyD']);
const CONFIRM = new Set(['Space', 'Enter']);
const PAUSE = new Set(['KeyP', 'Escape']);
const INTERACT = new Set(['KeyE', 'KeyF']);
const NEW_GAME = new Set(['KeyN']);
const HONK = new Set(['KeyH']);
const SPRINT = new Set(['ShiftLeft', 'ShiftRight']);

export function createInput(target) {
  const held = { up: false, down: false, left: false, right: false, sprint: false };
  let actions = 0;
  let attackHeld = false;
  let attackPressed = false;
  const mouse = { x: 0, y: 0, seen: false };

  window.addEventListener('keydown', (event) => {
    if (UP.has(event.code)) held.up = true;
    else if (DOWN.has(event.code)) held.down = true;
    else if (LEFT.has(event.code)) held.left = true;
    else if (RIGHT.has(event.code)) held.right = true;
    else if (SPRINT.has(event.code)) held.sprint = true;
    else if (CONFIRM.has(event.code)) { if (!event.repeat) actions |= ACTION_CONFIRM; }
    else if (PAUSE.has(event.code)) { if (!event.repeat) actions |= ACTION_PAUSE; }
    else if (INTERACT.has(event.code)) { if (!event.repeat) actions |= ACTION_INTERACT; }
    else if (NEW_GAME.has(event.code)) { if (!event.repeat) actions |= ACTION_NEW; }
    else if (HONK.has(event.code)) { if (!event.repeat) actions |= ACTION_HONK; }
    else return;
    event.preventDefault();
  });
  window.addEventListener('keyup', (event) => {
    if (UP.has(event.code)) held.up = false;
    else if (DOWN.has(event.code)) held.down = false;
    else if (LEFT.has(event.code)) held.left = false;
    else if (RIGHT.has(event.code)) held.right = false;
    else if (SPRINT.has(event.code)) held.sprint = false;
  });
  // A key released while the tab is hidden never sends keyup: let go of everything on blur.
  window.addEventListener('blur', () => {
    held.up = held.down = held.left = held.right = held.sprint = false;
    attackHeld = false;
  });
  target.addEventListener('pointerdown', (event) => {
    attackHeld = true;
    attackPressed = true;
    mouse.x = event.clientX;
    mouse.y = event.clientY;
    mouse.seen = true;
  });
  window.addEventListener('pointerup', () => { attackHeld = false; });
  window.addEventListener('pointermove', (event) => {
    mouse.x = event.clientX;
    mouse.y = event.clientY;
    mouse.seen = true;
  });

  return {
    /** The held movement vector: mx is strafe/steer (-1..1), my is forward/back (-1..1, up is -1). */
    axes() {
      return {
        mx: (held.right ? 1 : 0) - (held.left ? 1 : 0),
        my: (held.down ? 1 : 0) - (held.up ? 1 : 0),
      };
    },
    sprint() { return held.sprint; },
    attackHeld() { return attackHeld; },
    /** True once per physical click, then clears. */
    takeAttackPressed() {
      const taken = attackPressed;
      attackPressed = false;
      return taken;
    },
    mouse() { return mouse; },
    /** The one-shot presses since the last call, as ACTION_* flags. */
    takeActions() {
      const taken = actions;
      actions = 0;
      return taken;
    },
  };
}
