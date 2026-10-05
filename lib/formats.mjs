// Debate formats, adapted to one-on-one. Speech times follow the real circuits:
// NSDA Lincoln-Douglas is 6-3-7-3-4-6-3 with a four minute prep bank, NSDA Public
// Forum is 4-3-4-3-3-3-2 with three minutes, World Schools and British Parliamentary
// are worlds-style with points of information. Where a format is normally a team
// event the speeches have been collapsed onto one speaker, which is marked below.
//
// phase.kind   research | gate | speech | cross
// phase.who    pro | con | both | none        (whose microphone is live)
// phase.asks   pro | con                      (on a cross-examination, who questions)
// phase.prep   pro | con                      (on a gate, who may spend prep time)

export const RESEARCH_SECONDS = 300;

const research = { id: "research", kind: "research", label: "Research time", who: "none", sec: RESEARCH_SECONDS };
const gate = (id, sec, prep) => ({ id, kind: "gate", label: "Between speeches", who: "none", sec, prep });

export const FORMATS = {
  spar: {
    id: "spar",
    name: "Spar",
    tagline: "Short, sharp, eight minutes of speech",
    note: "A pick-up format. Nothing is dropped from it because nothing is in it.",
    sides: { pro: "Proposition", con: "Opposition" },
    prepBank: 60,
    poi: false,
    phases: [
      research,
      gate("g0", 10),
      { id: "p1", kind: "speech", label: "Opening", who: "pro", sec: 120 },
      gate("g1", 15, "con"),
      { id: "c1", kind: "speech", label: "Opening", who: "con", sec: 120 },
      gate("g2", 15),
      { id: "x1", kind: "cross", label: "Crossfire", who: "both", sec: 90 },
      gate("g3", 15, "pro"),
      { id: "p2", kind: "speech", label: "Rebuttal", who: "pro", sec: 90 },
      gate("g4", 15, "con"),
      { id: "c2", kind: "speech", label: "Rebuttal", who: "con", sec: 90 },
      gate("g5", 15, "pro"),
      { id: "p3", kind: "speech", label: "Final word", who: "pro", sec: 60 },
      gate("g6", 10, "con"),
      { id: "c3", kind: "speech", label: "Final word", who: "con", sec: 60 },
    ],
  },

  pf: {
    id: "pf",
    name: "Public Forum",
    tagline: "NSDA times, run one against one",
    note: "Normally two against two. The partner speeches are collapsed onto you.",
    sides: { pro: "Pro", con: "Con" },
    prepBank: 180,
    poi: false,
    phases: [
      research,
      gate("g0", 10),
      { id: "p1", kind: "speech", label: "Constructive", who: "pro", sec: 240 },
      gate("g1", 10, "con"),
      { id: "c1", kind: "speech", label: "Constructive", who: "con", sec: 240 },
      gate("g2", 10),
      { id: "x1", kind: "cross", label: "Crossfire", who: "both", sec: 180 },
      gate("g3", 15, "pro"),
      { id: "p2", kind: "speech", label: "Rebuttal", who: "pro", sec: 240 },
      gate("g4", 15, "con"),
      { id: "c2", kind: "speech", label: "Rebuttal", who: "con", sec: 240 },
      gate("g5", 10),
      { id: "x2", kind: "cross", label: "Crossfire", who: "both", sec: 180 },
      gate("g6", 15, "pro"),
      { id: "p3", kind: "speech", label: "Summary", who: "pro", sec: 180 },
      gate("g7", 15, "con"),
      { id: "c3", kind: "speech", label: "Summary", who: "con", sec: 180 },
      gate("g8", 10),
      { id: "x3", kind: "cross", label: "Grand crossfire", who: "both", sec: 180 },
      gate("g9", 15, "pro"),
      { id: "p4", kind: "speech", label: "Final focus", who: "pro", sec: 120 },
      gate("g10", 15, "con"),
      { id: "c4", kind: "speech", label: "Final focus", who: "con", sec: 120 },
    ],
  },

  ld: {
    id: "ld",
    name: "Lincoln-Douglas",
    tagline: "6-3-7-3-4-6-3, value debate, one against one",
    note: "The format as it is actually run. Four minutes of prep, spent when you choose.",
    sides: { pro: "Affirmative", con: "Negative" },
    prepBank: 240,
    poi: false,
    phases: [
      research,
      gate("g0", 10),
      { id: "ac", kind: "speech", label: "Affirmative constructive", who: "pro", sec: 360 },
      gate("g1", 10),
      { id: "cx1", kind: "cross", label: "Cross-examination", who: "both", asks: "con", sec: 180 },
      gate("g2", 15, "con"),
      { id: "nc", kind: "speech", label: "Negative constructive", who: "con", sec: 420 },
      gate("g3", 10),
      { id: "cx2", kind: "cross", label: "Cross-examination", who: "both", asks: "pro", sec: 180 },
      gate("g4", 15, "pro"),
      { id: "ar1", kind: "speech", label: "First affirmative rebuttal", who: "pro", sec: 240 },
      gate("g5", 15, "con"),
      { id: "nr", kind: "speech", label: "Negative rebuttal", who: "con", sec: 360 },
      gate("g6", 15, "pro"),
      { id: "ar2", kind: "speech", label: "Second affirmative rebuttal", who: "pro", sec: 180 },
    ],
  },

  ws: {
    id: "ws",
    name: "World Schools",
    tagline: "Substantives and replies, points of information live",
    note: "Three against three on the real circuit; two substantives each here.",
    sides: { pro: "Proposition", con: "Opposition" },
    prepBank: 120,
    poi: true,
    phases: [
      research,
      gate("g0", 10),
      { id: "p1", kind: "speech", label: "First proposition", who: "pro", sec: 360 },
      gate("g1", 10, "con"),
      { id: "c1", kind: "speech", label: "First opposition", who: "con", sec: 360 },
      gate("g2", 10, "pro"),
      { id: "p2", kind: "speech", label: "Second proposition", who: "pro", sec: 360 },
      gate("g3", 10, "con"),
      { id: "c2", kind: "speech", label: "Second opposition", who: "con", sec: 360 },
      gate("g4", 20),
      { id: "cr", kind: "speech", label: "Opposition reply", who: "con", sec: 240 },
      gate("g5", 15),
      { id: "pr", kind: "speech", label: "Proposition reply", who: "pro", sec: 240 },
    ],
  },

  bp: {
    id: "bp",
    name: "British Parliamentary",
    tagline: "Seven minute speeches, points of information live",
    note: "Four teams in a real room; here it is opening half only, head to head.",
    sides: { pro: "Proposition", con: "Opposition" },
    prepBank: 0,
    poi: true,
    phases: [
      research,
      gate("g0", 10),
      { id: "pm", kind: "speech", label: "Prime Minister", who: "pro", sec: 420 },
      gate("g1", 10),
      { id: "lo", kind: "speech", label: "Leader of the Opposition", who: "con", sec: 420 },
      gate("g2", 10),
      { id: "dpm", kind: "speech", label: "Deputy Prime Minister", who: "pro", sec: 420 },
      gate("g3", 10),
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
  return format.phases.reduce((n, p) => n + p.sec, 0) + format.prepBank;
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
