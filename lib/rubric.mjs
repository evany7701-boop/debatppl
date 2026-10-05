// The ballot.
//
// This module is deterministic and runs identically in the browser and in the
// serverless function, so both debaters always see the same result from the same
// transcript. It is also the seam where a model-written ballot drops in later:
// api/judge.js calls judge() today and would call a model tomorrow, returning the
// same shape.
//
// How bias is kept out, concretely:
//
//   1. Blinding. Before anything is measured the sides are relabelled to A and B
//      under a permutation seeded by a hash of the words alone. Nothing downstream
//      of blind() is ever handed "pro", "con", a side name, an id, or the order in
//      which the two people joined.
//   2. No volume advantage. Every marker is counted per hundred words, so talking
//      more is not the same as arguing better.
//   3. No position advantage. Speaking first or last is not scored. The one thing
//      order is used for is responsiveness, which by definition needs it.
//   4. Symmetry. Each criterion is a pure function of (mine, theirs) that is
//      antisymmetric about 5.0, so relabelling the two sides swaps the ballot exactly
//      and nothing else about it moves. checkSymmetry() asserts this.
//   5. No credit for going second. Responsiveness is the one measure that depends on
//      the order of speeches, because answering something requires it to have been
//      said first. Where only one side ever gets a speech after the other's, the
//      criterion is dropped and its weight is shared over the others, rather than
//      handing the later speaker a criterion the earlier one could not contest.

export const METHOD = "rubric-v1";

export const CRITERIA = [
  { id: "clash", name: "Clash and refutation", weight: 0.25 },
  { id: "evidence", name: "Evidence and warranting", weight: 0.2 },
  { id: "structure", name: "Structure and signposting", weight: 0.15 },
  { id: "response", name: "Responsiveness", weight: 0.15 },
  { id: "weighing", name: "Weighing and impact comparison", weight: 0.15 },
  { id: "delivery", name: "Delivery and use of time", weight: 0.1 },
];

const STOP = new Set(("a an the and or but if then than that this these those of in on at to for with "
  + "from by as is are was were be been being am do does did doing have has had having will would shall "
  + "should can could may might must i you he she it we they me him her us them my your his its our their "
  + "not no nor so such own same too very just about into over under again further once here there when "
  + "where why how all any both each few more most other some only also well because while during before "
  + "after above below up down out off who whom which what s t don now going gonna thing things lot really "
  + "think know say said says like get got make made want need one two three go goes").split(" "));

const FILLERS = ["um", "uh", "erm", "like", "basically", "literally", "actually", "you know", "sort of", "kind of", "i mean"];

const MARKERS = {
  clash: ["however", "but their", "they say", "they claim", "they argue", "their argument", "their case",
    "my opponent", "the opposition", "the proposition", "the affirmative", "the negative", "this is false",
    "that is false", "that's wrong", "that is wrong", "incorrect", "mistaken", "refute", "rebut", "respond to",
    "in response", "counter", "on the contrary", "turn this", "the turn", "cross-apply", "cross apply",
    "they dropped", "dropped the", "concede", "conceded", "non-unique", "no link", "no warrant", "unwarranted",
    "even if", "does not follow", "doesn't follow", "ignores", "fails to", "misrepresent", "straw man",
    "begs the question", "circular", "their evidence", "their study", "their framing", "against this"],
  evidence: ["according to", "a study", "the study", "studies show", "research", "researchers", "report",
    "reported", "survey", "data", "statistics", "evidence", "found that", "concluded", "estimate", "estimates",
    "analysis", "journal", "university", "professor", "economist", "the bank", "the fund", "the commission",
    "for example", "for instance", "in practice", "case study", "empirically", "the record shows",
    "because", "since", "therefore", "which means", "leads to", "results in", "causes", "the mechanism",
    "the reason", "this is why", "follows that"],
  structure: ["my first", "my second", "my third", "first", "second", "third", "fourth", "finally",
    "contention", "my case", "framework", "the standard", "the criterion", "value", "observation",
    "sub-point", "subpoint", "point one", "point two", "to begin", "moving to", "turning to", "on to",
    "in summary", "to summarise", "to summarize", "to conclude", "in conclusion", "three reasons",
    "two reasons", "the first reason", "signpost", "off the top", "on their case", "on my case"],
  weighing: ["outweigh", "outweighs", "more important", "most important", "comes first", "prior to",
    "on balance", "net benefit", "magnitude", "probability", "likelihood", "timeframe", "scope",
    "reversible", "irreversible", "even if you buy", "even granting", "the bigger impact", "terminal impact",
    "at the margin", "trade-off", "tradeoff", "cost benefit", "worst case", "best case", "the threshold",
    "weigh", "weighing", "matters more", "takes precedence", "the key question", "the central clash"],
  attack: ["stupid", "idiot", "idiotic", "moron", "dumb", "shut up", "liar", "lying", "ignorant", "clown",
    "pathetic", "loser", "nonsense from", "ridiculous person"],
};

// --- small deterministic helpers -------------------------------------------

function hash32(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function words(text) {
  return (text || "").toLowerCase().replace(/[^a-z0-9%\s'-]/g, " ").split(/\s+/).filter(Boolean);
}

function contentTerms(text, exclude) {
  const out = new Map();
  for (const w of words(text)) {
    const t = w.replace(/^'+|'+$/g, "");
    if (t.length < 4 || STOP.has(t) || (exclude && exclude.has(t))) continue;
    out.set(t, (out.get(t) || 0) + 1);
  }
  return out;
}

function keyTerms(text, exclude, n = 14) {
  return [...contentTerms(text, exclude).entries()]
    .sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1))
    .slice(0, n).map((e) => e[0]);
}

function countMarkers(lower, list) {
  let n = 0;
  for (const m of list) {
    let i = 0;
    while ((i = lower.indexOf(m, i)) !== -1) { n++; i += m.length; }
  }
  return n;
}

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

// --- blinding ---------------------------------------------------------------

// Returns { A, B, swapped }. The seed is drawn from the words of the round only,
// never from a side, a name, an id or a join order, so the labelling cannot be
// steered by either debater and is stable for both clients.
export function blind(transcript) {
  const seed = hash32(transcript.map((t) => t.text || "").join(" "));
  const swapped = (seed & 1) === 1;
  return { A: swapped ? "con" : "pro", B: swapped ? "pro" : "con", swapped, seed };
}

// --- measurement ------------------------------------------------------------

function measure(speeches, topicTerms, oppSpeeches) {
  const all = speeches.map((s) => s.text || "").join(" \n ");
  const lower = " " + all.toLowerCase() + " ";
  const w = words(all);
  const n = w.length;
  const per100 = (x) => (n < 40 ? 0 : (x * 100) / n);

  const fillerHits = countMarkers(lower, FILLERS);
  const spoken = speeches.reduce((a, s) => a + (s.spoken || 0), 0);
  const allotted = speeches.reduce((a, s) => a + (s.allotted || 0), 0);
  const wpm = spoken > 5 ? (n * 60) / spoken : 0;

  // Responsiveness: for each opposing speech, how much of what they actually put
  // in the round shows up in anything said afterwards.
  let covered = 0, considered = 0;
  for (const opp of oppSpeeches) {
    const later = speeches.filter((s) => s.order > opp.order);
    if (!later.length) continue;
    const keys = keyTerms(opp.text, topicTerms, 12);
    if (keys.length < 3) continue;
    const hay = " " + later.map((s) => s.text || "").join(" ").toLowerCase() + " ";
    const hit = keys.filter((k) => hay.includes(k)).length;
    covered += hit / keys.length;
    considered += 1;
  }
  const response = considered ? covered / considered : 0;

  // Repetition: how much each speech recycles the one before it.
  let rep = 0, reps = 0;
  for (let i = 1; i < speeches.length; i++) {
    const a = new Set(keyTerms(speeches[i - 1].text, topicTerms, 18));
    const b = new Set(keyTerms(speeches[i].text, topicTerms, 18));
    if (a.size < 4 || b.size < 4) continue;
    let inter = 0;
    for (const t of b) if (a.has(t)) inter++;
    rep += inter / b.size;
    reps += 1;
  }
  const repetition = reps ? rep / reps : 0;

  const topicHits = topicTerms.size
    ? [...topicTerms].filter((t) => lower.includes(t)).length / topicTerms.size
    : 1;

  return {
    words: n,
    spoken,
    allotted,
    wpm,
    clash: per100(countMarkers(lower, MARKERS.clash)),
    evidence: per100(countMarkers(lower, MARKERS.evidence)),
    structure: per100(countMarkers(lower, MARKERS.structure)),
    weighing: per100(countMarkers(lower, MARKERS.weighing)),
    attacks: countMarkers(lower, MARKERS.attack),
    filler: per100(fillerHits),
    numbers: per100((all.match(/\b\d[\d,.]*\b/g) || []).length),
    response,
    responseChances: considered,
    repetition,
    topicality: topicHits,
    useOfTime: allotted ? clamp(spoken / allotted, 0, 1) : 0,
    rawClash: countMarkers(lower, MARKERS.clash),
    rawEvidence: countMarkers(lower, MARKERS.evidence),
  };
}

// Antisymmetric about 5: score(x,y) + score(y,x) === 10 exactly.
// `anchor` is the value at which a criterion is considered fully met on its own,
// and pulls both scores toward the middle when neither side did much of it.
function pairScore(mine, theirs, anchor) {
  const sum = mine + theirs;
  const rel = sum > 1e-9 ? (mine - theirs) / sum : 0;
  const present = clamp(sum / (2 * anchor), 0, 1); // how live this criterion was
  return clamp(5 + 4.2 * rel * (0.45 + 0.55 * present), 0, 10);
}

function deliveryScore(m) {
  // Pace inside a band a judge can follow, time actually used, little filler.
  const pace = m.wpm === 0 ? 0 : 1 - clamp(Math.abs(m.wpm - 155) / 105, 0, 1);
  const used = clamp(m.useOfTime / 0.85, 0, 1);
  const clean = 1 - clamp(m.filler / 4, 0, 1);
  return 0.4 * pace + 0.35 * used + 0.25 * clean;
}

function penalties(m) {
  const p = [];
  if (m.repetition > 0.55) p.push({ id: "repetition", cost: clamp((m.repetition - 0.55) * 4, 0, 1.2), note: "recycled earlier material instead of extending it" });
  if (m.attacks > 0) p.push({ id: "attack", cost: clamp(m.attacks * 0.4, 0, 1.5), note: "attacked the person rather than the case" });
  if (m.topicality < 0.3 && m.words > 60) p.push({ id: "topicality", cost: clamp((0.3 - m.topicality) * 3, 0, 1.2), note: "drifted off the motion" });
  return p;
}

// --- the ballot -------------------------------------------------------------

export function judge(round) {
  const transcript = (round.transcript || []).map((t, i) => ({ ...t, order: i }));
  const topicTerms = new Set(keyTerms(round.topic || "", null, 10));
  const b = blind(transcript);

  const forKey = (key) => transcript.filter((t) => t.side === b[key]);
  const sideA = forKey("A"), sideB = forKey("B");

  const mA = measure(sideA, topicTerms, sideB);
  const mB = measure(sideB, topicTerms, sideA);

  // A round nobody showed up to is not a round.
  const silentA = mA.words < 25, silentB = mB.words < 25;
  if (silentA || silentB) {
    const winnerKey = silentA && silentB ? null : silentA ? "B" : "A";
    return {
      method: METHOD,
      winner: winnerKey ? b[winnerKey] : "draw",
      margin: winnerKey ? 10 : 0,
      forfeit: true,
      scores: emptyScores(b, mA, mB),
      rfd: [silentA && silentB
        ? "Neither speaker put enough on the record to judge. No result."
        : "One side did not speak. Awarded on forfeit, with no rating weight given to the content of the round."],
      blind: { A: b.A, B: b.B },
    };
  }

  const raw = {
    clash: [pairScore(mA.clash, mB.clash, 2.2), pairScore(mB.clash, mA.clash, 2.2)],
    evidence: [pairScore(mA.evidence + mA.numbers * 0.5, mB.evidence + mB.numbers * 0.5, 3.0),
      pairScore(mB.evidence + mB.numbers * 0.5, mA.evidence + mA.numbers * 0.5, 3.0)],
    structure: [pairScore(mA.structure, mB.structure, 2.0), pairScore(mB.structure, mA.structure, 2.0)],
    response: [pairScore(mA.response, mB.response, 0.5), pairScore(mB.response, mA.response, 0.5)],
    weighing: [pairScore(mA.weighing, mB.weighing, 1.2), pairScore(mB.weighing, mA.weighing, 1.2)],
    delivery: [pairScore(deliveryScore(mA), deliveryScore(mB), 0.7), pairScore(deliveryScore(mB), deliveryScore(mA), 0.7)],
  };

  // Responsiveness needs a speech after the other side's to be possible at all. In a
  // round where one of them never gets that chance — a two-speech spar, or a round cut
  // short — scoring it would hand the other side a free criterion for being second.
  // So it is dropped and its weight is shared out over the rest.
  const responsive = mA.responseChances > 0 && mB.responseChances > 0;
  const active = CRITERIA.filter((c) => responsive || c.id !== "response");
  const totalWeight = active.reduce((n, c) => n + c.weight, 0);

  const penA = penalties(mA), penB = penalties(mB);
  const costA = penA.reduce((a, p) => a + p.cost, 0);
  const costB = penB.reduce((a, p) => a + p.cost, 0);

  let totalA = 0, totalB = 0;
  const criteria = {};
  for (const c of CRITERIA) criteria[c.id] = { a: raw[c.id][0], b: raw[c.id][1] };
  for (const c of active) {
    const w = c.weight / totalWeight;
    totalA += w * raw[c.id][0];
    totalB += w * raw[c.id][1];
  }
  totalA = clamp(totalA - costA, 0, 10);
  totalB = clamp(totalB - costB, 0, 10);

  const margin = Math.abs(totalA - totalB);
  let winnerKey;
  if (margin < 0.12) {
    // Too close on the aggregate. Clash decides it, then evidence; a round that is
    // still level after both is a draw rather than a coin flip.
    const d1 = criteria.clash.a - criteria.clash.b;
    const d2 = criteria.evidence.a - criteria.evidence.b;
    winnerKey = Math.abs(d1) > 0.25 ? (d1 > 0 ? "A" : "B")
      : Math.abs(d2) > 0.25 ? (d2 > 0 ? "A" : "B") : null;
  } else {
    winnerKey = totalA > totalB ? "A" : "B";
  }

  const scores = {
    [b.A]: packScore(totalA, criteria, "a", mA, penA),
    [b.B]: packScore(totalB, criteria, "b", mB, penB),
  };

  return {
    method: METHOD,
    winner: winnerKey ? b[winnerKey] : "draw",
    margin: Number(margin.toFixed(2)),
    forfeit: false,
    scored: active.map((c) => c.id),
    scores,
    rfd: writeRfd(b, winnerKey, criteria, mA, mB, penA, penB, margin, responsive),
    blind: { A: b.A, B: b.B },
  };
}

function packScore(total, criteria, k, m, pen) {
  const out = { total: Number(total.toFixed(2)), criteria: {}, penalties: pen, stats: {} };
  for (const c of CRITERIA) out.criteria[c.id] = Number(criteria[c.id][k].toFixed(2));
  out.stats = {
    words: m.words,
    wpm: Math.round(m.wpm),
    refutations: m.rawClash,
    citations: m.rawEvidence,
    answered: Math.round(m.response * 100),
    timeUsed: Math.round(m.useOfTime * 100),
    filler: Number(m.filler.toFixed(1)),
  };
  return out;
}

function emptyScores(b, mA, mB) {
  return {
    [b.A]: packScore(0, Object.fromEntries(CRITERIA.map((c) => [c.id, { a: 0, b: 0 }])), "a", mA, []),
    [b.B]: packScore(0, Object.fromEntries(CRITERIA.map((c) => [c.id, { a: 0, b: 0 }])), "b", mB, []),
  };
}

// A reason for decision that points at the numbers it came from, rather than
// paraphrasing the round back at the people who were in it.
function writeRfd(b, winnerKey, criteria, mA, mB, penA, penB, margin, responsive) {
  const name = (k) => (b[k] === "pro" ? "Proposition" : "Opposition");
  const lines = [];

  const gaps = CRITERIA.filter((c) => responsive || c.id !== "response").map((c) => ({
    c, diff: criteria[c.id].a - criteria[c.id].b, w: c.weight,
  })).sort((x, y) => Math.abs(y.diff * y.w) - Math.abs(x.diff * x.w));

  const top = gaps[0];
  if (winnerKey) {
    lines.push(`${name(winnerKey)} takes it by ${margin.toFixed(2)} of ten. The round turned on ${top.c.name.toLowerCase()}.`);
  } else {
    lines.push("Level on every criterion that could separate the two. Recorded as a draw.");
  }

  lines.push(`Clash: ${mA.rawClash} direct responses from ${name("A")} against ${mB.rawClash} from ${name("B")}, counted per hundred words so length is not rewarded.`);
  if (responsive) {
    lines.push(`Responsiveness: ${name("A")} answered ${Math.round(mA.response * 100)}% of what was put to them, ${name("B")} answered ${Math.round(mB.response * 100)}%.`);
  } else {
    lines.push("Responsiveness was not scored: only one side had a speech after the other's, so it was not a criterion both could meet. Its weight went to the rest.");
  }
  lines.push(`Warranting: ${mA.rawEvidence} warranted or sourced claims against ${mB.rawEvidence}.`);

  const second = gaps[1];
  if (second && Math.abs(second.diff) > 0.4) {
    const lead = second.diff > 0 ? "A" : "B";
    lines.push(`${name(lead)} also led on ${second.c.name.toLowerCase()}, which is why the margin is not closer.`);
  }

  for (const [k, pens] of [["A", penA], ["B", penB]]) {
    for (const p of pens) lines.push(`Deduction against ${name(k)}: ${p.note} (-${p.cost.toFixed(2)}).`);
  }

  const slow = mA.wpm && mA.wpm < 95 ? "A" : mB.wpm && mB.wpm < 95 ? "B" : null;
  if (slow) lines.push(`${name(slow)} left a lot of the clock unused; the speech was thinner than the time allowed for.`);

  lines.push("Sides were anonymised before scoring. Nothing above was computed from who spoke first or from which side anyone was assigned.");
  return lines;
}

// Self-check used by the test page: swapping the transcripts must swap the ballot.
export function checkSymmetry(round) {
  const flip = (t) => ({ ...t, side: t.side === "pro" ? "con" : "pro" });
  const a = judge(round);
  const bb = judge({ ...round, transcript: (round.transcript || []).map(flip) });
  const expect = a.winner === "draw" ? "draw" : a.winner === "pro" ? "con" : "pro";
  return { ok: bb.winner === expect && Math.abs(a.margin - bb.margin) < 0.01, a, b: bb };
}
