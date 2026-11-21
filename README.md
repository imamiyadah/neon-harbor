# NEON HARBOR

[![make.fun · gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![rank](https://make.fun/badge/gta6-01/imamiyadah/neon-harbor/rank.svg)](https://make.fun/bounty/gta6-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)
[![reward](https://make.fun/badge/gta6-01/imamiyadah/neon-harbor/reward.svg)](https://make.fun/bounty/gta6-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-01)

An original top-down open-world crime game in plain browser JavaScript — no
engine, no build step, no network, no assets. You are Rook, a getaway driver
with a debt, in Neon Harbor: a sun-soaked harbour city of neon signs, palm
quays and salt air. Mara Voss at the Driftline Garage has five jobs that will
clear what you owe — if the Harbor Precinct doesn't collect you first.

## What's in the city

- **A complete open world** — a street grid of named, neon-signed businesses,
  a working harbour with piers, explorable on foot and by car from the first
  minute, with a live minimap.
- **Traffic and pedestrians** — cars drive the lanes, turn at intersections and
  brake for each other; pedestrians stroll the sidewalks and run from trouble.
- **Stealable cars** — five kinds of vehicle, all parked, driving and stealable
  with E. Sell stolen cars at the Driftline Garage chop shop.
- **Wanted system** — crimes raise your stars; precinct interceptors spawn,
  chase and ram you; break their line of sight and the heat decays. Get boxed
  in standing still and you're **busted**; get wrecked and you're **wasted**.
- **A five-mission story** — a pickup run, a repossession, a rival takedown, a
  police escape, and a timed ferry run, with cash rewards and ammo.
- **Combat** — fists up close, a pistol with limited ammo on the mouse,
  driveable-into trouble, NPC health, player health with hospital healing.
- **Free-roam depth** — 12 hidden packages, the chop shop, stats, and
  save/continue through localStorage.
- **Sound, synthesised** — engine, sirens that swell as police close in,
  gunshots, crashes and cash, all from WebAudio. No audio files.

## How to play

- **W A S D / arrows** — walk / drive · **SHIFT** — sprint
- **E / F** — enter & exit cars · **MOUSE** — aim · **CLICK** — punch / shoot
- **H** — horn · **P / Esc** — pause · **ENTER** — confirm · **N** — new game

## Run it

```sh
node serve.ts        # then open http://localhost:8080
```

Everything is static files under `game/`; the simulation runs at a fixed
60 steps a second and the city is generated from a seed, so every visit sees
the same Neon Harbor.
