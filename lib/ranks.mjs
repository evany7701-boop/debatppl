// Rating and rank. Every league keeps its own rating, its own record and its own
// rank, so being Diamond at Spar tells you nothing about your Lincoln-Douglas.

export const START_RATING = 1000;
export const PROVISIONAL_ROUNDS = 10;

export const TIERS = [
  { id: "copper", name: "Copper", floor: 0, hue: "#8a5a3b" },
  { id: "bronze", name: "Bronze", floor: 900, hue: "#9c6b2f" },
  { id: "silver", name: "Silver", floor: 1100, hue: "#6f7780" },
  { id: "gold", name: "Gold", floor: 1300, hue: "#9a7b1f" },
  { id: "platinum", name: "Platinum", floor: 1500, hue: "#4a7a74" },
  { id: "diamond", name: "Diamond", floor: 1700, hue: "#3a5f9e" },
];

const DIVISIONS = ["IV", "III", "II", "I"];

export function tierOf(rating) {
  let t = TIERS[0];
  for (const tier of TIERS) if (rating >= tier.floor) t = tier;
  return t;
}

// Divisions run IV up to I in fifty point steps inside a tier. Diamond is undivided:
// at the top there is nothing left to promote you into, so it shows the raw number.
export function rankOf(rating) {
  const tier = tierOf(rating);
  if (tier.id === "diamond") {
    return { tier, division: null, label: "Diamond", short: "Diamond", next: null };
  }
  const idx = TIERS.indexOf(tier);
  const ceiling = TIERS[idx + 1].floor;
  const span = ceiling - tier.floor;
  const step = span / DIVISIONS.length;
  const d = Math.min(DIVISIONS.length - 1, Math.floor((rating - tier.floor) / step));
  const division = DIVISIONS[d];
  const nextAt = d === DIVISIONS.length - 1 ? ceiling : tier.floor + (d + 1) * step;
  return {
    tier,
    division,
    label: `${tier.name} ${division}`,
    short: `${tier.name} ${division}`,
    next: Math.round(nextAt),
  };
}

export function kFactor(rounds) {
  return rounds < PROVISIONAL_ROUNDS ? 32 : 20;
}

export function expectedScore(mine, theirs) {
  return 1 / (1 + Math.pow(10, (theirs - mine) / 400));
}

// score: 1 win, 0 loss, 0.5 draw.
export function nextRating(mine, theirs, score, rounds) {
  const k = kFactor(rounds);
  const delta = Math.round(k * (score - expectedScore(mine, theirs)));
  return { rating: Math.max(100, mine + delta), delta };
}

export function blankLeague() {
  return { rating: START_RATING, rounds: 0, wins: 0, losses: 0, draws: 0, streak: 0, best: START_RATING };
}

export function applyResult(league, opponentRating, score) {
  const l = { ...league };
  const { rating, delta } = nextRating(l.rating, opponentRating, score, l.rounds);
  l.rating = rating;
  l.rounds += 1;
  if (score === 1) { l.wins += 1; l.streak = l.streak > 0 ? l.streak + 1 : 1; }
  else if (score === 0) { l.losses += 1; l.streak = l.streak < 0 ? l.streak - 1 : -1; }
  else { l.draws += 1; l.streak = 0; }
  l.best = Math.max(l.best, l.rating);
  return { league: l, delta };
}
