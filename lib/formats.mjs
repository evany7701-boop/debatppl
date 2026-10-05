// Debate formats, adapted to one-on-one. Speech times follow the real circuits:
// NSDA Lincoln-Douglas is 6-3-7-3-4-6-3 with a four minute prep bank, NSDA Public
// Forum is 4-3-4-3-3-3-2 with three minutes, World Schools and British Parliamentary
// are worlds-style with points of information. Where a format is normally a team
// event the speeches have been collapsed onto one speaker, which is marked below.
//
// phase.kind   research | gate | speech | cross
// phase.who    pro | con | both | none        (whose microphone is live)
// phase.asks   pro | con                      (on a cross-examination, who questions)
//
// Between every pair of speeches there is a flat thirty seconds. There is no prep
// bank and no way to buy more time: on a real circuit prep is a resource you manage,
// but here both people are strangers on a clock neither of them chose, and the one
// thing that should never happen is one of them stalling the other.

export const RESEARCH_SECONDS = 300;
export const GATE_SECONDS = 30;

const research = { id: "research", kind: "research", label: "Research time", who: "none", sec: RESEARCH_SECONDS };
const gate = (id) => ({ id, kind: "gate", label: "Between speeches", who: "none", sec: GATE_SECONDS });

export const FORMATS = {
  spar: {
    id: "spar",
    name: "Spar",
    tagline: "Short, sharp, eight minutes of speech",
    note: "A pick-up format. Nothing is dropped from it because nothing is in it.",
    sides: { pro: "Proposition", con: "Opposition" },
    poi: false,
    phases: [
      research,
      gate("g0"),
      { id: "p1", kind: "speech", label: "Opening", who: "pro", sec: 120 },
      gate("g1"),
      { id: "c1", kind: "speech", label: "Opening", who: "con", sec: 120 },
      gate("g2"),
      { id: "x1", kind: "cross", label: "Crossfire", who: "both", sec: 90 },
      gate("g3"),
      { id: "p2", kind: "speech", label: "Rebuttal", who: "pro", sec: 90 },
      gate("g4"),
      { id: "c2", kind: "speech", label: "Rebuttal", who: "con", sec: 90 },
      gate("g5"),
      { id: "p3", kind: "speech", label: "Final word", who: "pro", sec: 60 },
      gate("g6"),
      { id: "c3", kind: "speech", label: "Final word", who: "con", sec: 60 },
    ],
  },

  pf: {
    id: "pf",
    name: "Public Forum",
    tagline: "NSDA times, run one against one",
    note: "Normally two against two. The partner speeches are collapsed onto you.",
    sides: { pro: "Pro", con: "Con" },
    poi: false,
    phases: [
      research,
      gate("g0"),
      { id: "p1", kind: "speech", label: "Constructive", who: "pro", sec: 240 },
      gate("g1"),
      { id: "c1", kind: "speech", label: "Constructive", who: "con", sec: 240 },
      gate("g2"),
      { id: "x1", kind: "cross", label: "Crossfire", who: "both", sec: 180 },
      gate("g3"),
      { id: "p2", kind: "speech", label: "Rebuttal", who: "pro", sec: 240 },
      gate("g4"),
      { id: "c2", kind: "speech", label: "Rebuttal", who: "con", sec: 240 },
      gate("g5"),
      { id: "x2", kind: "cross", label: "Crossfire", who: "both", sec: 180 },
      gate("g6"),
      { id: "p3", kind: "speech", label: "Summary", who: "pro", sec: 180 },
      gate("g7"),
      { id: "c3", kind: "speech", label: "Summary", who: "con", sec: 180 },
      gate("g8"),
      { id: "x3", kind: "cross", label: "Grand crossfire", who: "both", sec: 180 },
      gate("g9"),
      { id: "p4", kind: "speech", label: "Final focus", who: "pro", sec: 120 },
      gate("g10"),
      { id: "c4", kind: "speech", label: "Final focus", who: "con", sec: 120 },
    ],
  },

  ld: {
    id: "ld",
    name: "Lincoln-Douglas",
    tagline: "6-3-7-3-4-6-3, value debate, one against one",
    note: "The published speech times, with a flat thirty seconds between them.",
    sides: { pro: "Affirmative", con: "Negative" },
    poi: false,
    phases: [
      research,
      gate("g0"),
      { id: "ac", kind: "speech", label: "Affirmative constructive", who: "pro", sec: 360 },
      gate("g1"),
      { id: "cx1", kind: "cross", label: "Cross-examination", who: "both", asks: "con", sec: 180 },
      gate("g2"),
      { id: "nc", kind: "speech", label: "Negative constructive", who: "con", sec: 420 },
      gate("g3"),
      { id: "cx2", kind: "cross", label: "Cross-examination", who: "both", asks: "pro", sec: 180 },
      gate("g4"),
      { id: "ar1", kind: "speech", label: "First affirmative rebuttal", who: "pro", sec: 240 },
      gate("g5"),
      { id: "nr", kind: "speech", label: "Negative rebuttal", who: "con", sec: 360 },
      gate("g6"),
      { id: "ar2", kind: "speech", label: "Second affirmative rebuttal", who: "pro", sec: 180 },
    ],
  },

  ws: {
    id: "ws",
    name: "World Schools",
    tagline: "Substantives and replies, points of information live",
    note: "Three against three on the real circuit; two substantives each here.",
    sides: { pro: "Proposition", con: "Opposition" },
    poi: true,
    phases: [
      research,
      gate("g0"),
      { id: "p1", kind: "speech", label: "First proposition", who: "pro", sec: 360 },
      gate("g1"),
      { id: "c1", kind: "speech", label: "First opposition", who: "con", sec: 360 },
      gate("g2"),
      { id: "p2", kind: "speech", label: "Second proposition", who: "pro", sec: 360 },
      gate("g3"),
      { id: "c2", kind: "speech", label: "Second opposition", who: "con", sec: 360 },
      gate("g4"),
      { id: "cr", kind: "speech", label: "Opposition reply", who: "con", sec: 240 },
      gate("g5"),
      { id: "pr", kind: "speech", label: "Proposition reply", who: "pro", sec: 240 },
    ],
  },

  bp: {
    id: "bp",
    name: "British Parliamentary",
    tagline: "Seven minute speeches, points of information live",
    note: "Four teams in a real room; here it is opening half only, head to head.",
    sides: { pro: "Proposition", con: "Opposition" },
    poi: true,
    phases: [
      research,
      gate("g0"),
      { id: "pm", kind: "speech", label: "Prime Minister", who: "pro", sec: 420 },
      gate("g1"),
      { id: "lo", kind: "speech", label: "Leader of the Opposition", who: "con", sec: 420 },
      gate("g2"),
      { id: "dpm", kind: "speech", label: "Deputy Prime Minister", who: "pro", sec: 420 },
      gate("g3"),
      { id: "dlo", kind: "speech", label: "Deputy Leader of the Opposition", who: "con", sec: 420 },
    ],
  },
};

export const LEAGUES = ["spar", "pf", "ld", "ws", "bp"];

// Points of information are open outside the protected first and last minute.
export const POI_PROTECT = 60;

export function speechSeconds(format) {
  return format.phases.filter((p) => p.kind === "speech" || p.kind === "cross")
    .reduce((n, p) => n + p.sec, 0);
}

export function roundSeconds(format) {
  return format.phases.reduce((n, p) => n + p.sec, 0);
}

export function phaseIndexOf(format, id) {
  return format.phases.findIndex((p) => p.id === id);
}

// Which motion style suits which league. Worlds-style rooms debate "This House...",
// the American circuit debates "Resolved:...". Either is allowed as a fallback so
// that a thinned-out bag never blocks a match.
export function preferredStyle(leagueId) {
  return leagueId === "ld" || leagueId === "pf" ? "res" : "thw";
}

export function fmtClock(sec) {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
