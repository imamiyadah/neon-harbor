// The story of NEON HARBOR, as data. Rook, a getaway driver who swore he was out, owes money
// all over the harbour. Mara Voss, who runs the Driftline Garage, has work that pays. Five
// jobs, one after another; each is a list of stages the world steps through. Stage kinds:
//   goto      - reach the marker (on foot or in a car)
//   steal     - get into the one marked car (spawns when the stage starts)
//   deliverCar- be inside that same car, stopped in the garage lot
//   disable   - wreck the marked fleeing car (ram it or shoot it), then it is done
//   escape    - shake the police completely (wanted back to zero)
//   timed     - reach the marker before the clock runs out, or the stage restarts
// Positions come from the city's landmarks, so the story always fits the map.

export function buildMissions(city) {
  const L = city.landmarks;
  return [
    {
      id: 'first-run',
      title: 'First Run',
      from: 'Mara Voss — Driftline Garage',
      intro: 'A sealed cooler is waiting at Saltline Storage. Fetch it, bring it home. No questions.',
      reward: 300,
      outro: 'Clean work. The harbour provides, Rook.',
      stages: [
        { kind: 'goto', x: L.warehouse.x, y: L.warehouse.y, r: 64, text: 'Pick up the cooler at Saltline Storage' },
        { kind: 'goto', x: L.garage.x, y: L.garage.y, r: 74, text: 'Bring the cooler back to the Driftline Garage' },
      ],
    },
    {
      id: 'the-kestrel',
      title: 'The Kestrel',
      from: 'Mara Voss — Driftline Garage',
      intro: 'A pink Kestrel Coupe near the marina is three payments behind. Repossess it. Quietly, or not.',
      reward: 500,
      ammo: 12,
      outro: 'She purrs. The garage thanks you; the owner will not.',
      stages: [
        {
          kind: 'steal', x: 1942, y: 880, r: 60, text: 'Steal the pink Kestrel Coupe',
          spawn: { type: 'coupe', color: '#ff5da2', x: 1942, y: 880, angle: Math.PI / 2 },
        },
        { kind: 'deliverCar', x: L.garage.x, y: L.garage.y, r: 78, text: 'Deliver the Kestrel to the Driftline Garage lot' },
      ],
    },
    {
      id: 'tail-spin',
      title: 'Tail Spin',
      from: 'Mara Voss — Driftline Garage',
      intro: 'Dario Fen is running Corsair product through my streets in a grey van. Stop the van. Hard.',
      reward: 700,
      ammo: 12,
      outro: 'Dario walks home tonight. The Corsairs send their regards, and their fear.',
      stages: [
        {
          kind: 'disable', x: 1250, y: 220, r: 70, text: 'Disable Dario\'s van — ram it or shoot it out',
          spawn: { type: 'van', color: '#6d6875', x: 1250, y: 220, angle: 0 },
        },
        { kind: 'goto', x: L.garage.x, y: L.garage.y, r: 74, text: 'Report back to the Driftline Garage' },
      ],
    },
    {
      id: 'heat-wave',
      title: 'Heat Wave',
      from: 'Mara Voss — Driftline Garage',
      intro: 'The last drop was watched. The precinct wants you, Rook — lose them, then lie low on the east pier.',
      reward: 800,
      outro: 'Gone like harbour mist. Even the gulls saw nothing.',
      stages: [
        { kind: 'escape', x: L.hideout.x, y: L.hideout.y, r: 70, text: 'Lose the police completely', heat: 2.4 },
        { kind: 'goto', x: L.hideout.x, y: L.hideout.y, r: 70, text: 'Lie low at the east pier hideout' },
      ],
    },
    {
      id: 'harbor-run',
      title: 'Harbor Run',
      from: 'Mara Voss — Driftline Garage',
      intro: 'Last job. One cooler, one ferry at Pier 9, and the tide does not wait. Neither does the clock.',
      reward: 1200,
      outro: 'The ferry pulls away, the debt is paid, and Neon Harbor is yours again.',
      stages: [
        { kind: 'goto', x: L.garage.x, y: L.garage.y, r: 74, text: 'Pick up the last cooler at the Driftline Garage' },
        { kind: 'timed', x: L.pier9.x, y: L.pier9.y, r: 62, text: 'Reach Pier 9 before the ferry leaves', timeLimit: 150 },
      ],
    },
  ];
}

/** The objective line shown when the story is finished and the city is simply Rook's. */
export const FREE_ROAM_TEXT = 'Free roam — steal cars and sell them at the Driftline Garage, find the hidden packages';
