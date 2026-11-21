// All sound is synthesised with WebAudio - no audio files. A tiny engine: one master gain,
// short envelope-shaped blips for effects, a sawtooth loop whose pitch follows the car's speed
// for the engine, and a two-tone siren that fades with the nearest police car's distance.
// The context is created lazily on the first user gesture (browsers refuse it sooner), and
// every method is safe to call before that: it simply stays silent.

export function createAudio() {
  let context = null;
  let master = null;
  let engineOsc = null;
  let engineGain = null;
  let sirenOsc = null;
  let sirenGain = null;
  let sirenFlip = 0;

  function unlock() {
    if (context !== null) {
      if (context.state === 'suspended') context.resume().catch(() => {});
      return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      context = new AC();
      master = context.createGain();
      master.gain.value = 0.5;
      master.connect(context.destination);
    } catch {
      context = null;
    }
  }

  function tone(freq, dur, type, vol, slideTo, delay = 0) {
    if (context === null || master === null) return;
    const t0 = context.currentTime + delay;
    const osc = context.createOscillator();
    const gain = context.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain).connect(master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function noise(dur, vol, freq) {
    if (context === null || master === null) return;
    const t0 = context.currentTime;
    const length = Math.max(1, Math.floor(context.sampleRate * dur));
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let index = 0; index < length; index += 1) data[index] = (Math.random() * 2 - 1) * (1 - index / length);
    const source = context.createBufferSource();
    source.buffer = buffer;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = freq;
    const gain = context.createGain();
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    source.connect(filter).connect(gain).connect(master);
    source.start(t0);
  }

  /** Continuous engine note; call every frame with speed 0..1, or stop it when on foot. */
  function engine(speedNorm, running) {
    if (context === null || master === null) return;
    if (running) {
      if (engineOsc === null) {
        engineOsc = context.createOscillator();
        engineGain = context.createGain();
        engineOsc.type = 'sawtooth';
        engineGain.gain.value = 0.0;
        const filter = context.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 420;
        engineOsc.connect(filter).connect(engineGain).connect(master);
        engineOsc.start();
      }
      const target = 55 + speedNorm * 165;
      engineOsc.frequency.setTargetAtTime(target, context.currentTime, 0.06);
      engineGain.gain.setTargetAtTime(0.05 + speedNorm * 0.075, context.currentTime, 0.09);
    } else if (engineOsc !== null) {
      engineGain.gain.setTargetAtTime(0, context.currentTime, 0.05);
      const osc = engineOsc;
      window.setTimeout(() => { try { osc.stop(); } catch { /* already stopped */ } }, 220);
      engineOsc = null;
      engineGain = null;
    }
  }

  /** Continuous siren; volume follows how close the nearest police car is (0 = none audible). */
  function siren(level, dt) {
    if (context === null || master === null) return;
    if (level > 0.01) {
      if (sirenOsc === null) {
        sirenOsc = context.createOscillator();
        sirenGain = context.createGain();
        sirenOsc.type = 'triangle';
        sirenGain.gain.value = 0;
        sirenOsc.connect(sirenGain).connect(master);
        sirenOsc.start();
      }
      sirenFlip += dt;
      const high = Math.floor(sirenFlip * 1.6) % 2 === 0;
      sirenOsc.frequency.setTargetAtTime(high ? 880 : 660, context.currentTime, 0.03);
      sirenGain.gain.setTargetAtTime(0.028 * level, context.currentTime, 0.1);
    } else if (sirenOsc !== null) {
      sirenGain.gain.setTargetAtTime(0, context.currentTime, 0.05);
      const osc = sirenOsc;
      window.setTimeout(() => { try { osc.stop(); } catch { /* already stopped */ } }, 200);
      sirenOsc = null;
      sirenGain = null;
    }
  }

  return {
    unlock,
    engine,
    siren,
    shot() { noise(0.14, 0.5, 2600); tone(160, 0.1, 'square', 0.16, 60); },
    punch() { noise(0.08, 0.35, 500); tone(90, 0.09, 'sine', 0.3, 45); },
    crash(strength) { noise(0.22, Math.min(0.6, 0.2 + strength * 0.4), 700); tone(70, 0.2, 'sine', 0.3, 35); },
    cash() { tone(880, 0.09, 'square', 0.12); tone(1318, 0.14, 'square', 0.12, undefined, 0.07); },
    pickup() { tone(520, 0.08, 'sine', 0.18, 780); tone(780, 0.1, 'sine', 0.14, 1040, 0.06); },
    enter() { tone(240, 0.07, 'sine', 0.14, 180); },
    complete() { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.16, 'triangle', 0.16, undefined, i * 0.09)); },
    fail() { tone(320, 0.22, 'sawtooth', 0.12, 140); tone(210, 0.3, 'sawtooth', 0.1, 90, 0.14); },
    busted() { [660, 660, 880, 880].forEach((f, i) => tone(f, 0.13, 'square', 0.1, undefined, i * 0.13)); },
    click() { tone(660, 0.05, 'sine', 0.1); },
    honk() { tone(370, 0.16, 'square', 0.14); tone(466, 0.16, 'square', 0.1); },
  };
}
