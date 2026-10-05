import { ALL_TOPICS, MOTIONS, RESOLUTIONS, REGIONS, THEMES } from "/lib/topics.mjs";
import { FORMATS, LEAGUES, roundSeconds, fmtClock } from "/lib/formats.mjs";
import { rankOf, tierOf, TIERS, expectedScore, applyResult, blankLeague } from "/lib/ranks.mjs";
import { judge, checkSymmetry, blind } from "/lib/rubric.mjs";

const out = document.getElementById("out");
let pass = 0, fail = 0;
function t(name, fn) {
  let ok = false, detail = "";
  try { const r = fn(); ok = r === true || r === undefined; if (typeof r === "string") { ok = false; detail = r; } }
  catch (e) { detail = String(e && e.message || e); }
  ok ? pass++ : fail++;
  const d = document.createElement("div");
  d.className = "r " + (ok ? "pass" : "fail");
  d.textContent = name + (detail ? "  — " + detail : "");
  out.append(d);
}
const note = (s) => { const d = document.createElement("div"); d.className = "r note"; d.textContent = "      " + s; out.append(d); };

// --- topics ---------------------------------------------------------------
t("topic bank is large", () => ALL_TOPICS.length >= 400 || `only ${ALL_TOPICS.length}`);
t("no duplicate motions", () => {
  const seen = new Set(); const dupes = [];
  for (const x of ALL_TOPICS) { const k = x.text.toLowerCase(); if (seen.has(k)) dupes.push(k); seen.add(k); }
  return dupes.length === 0 || `${dupes.length}: ${dupes[0]}`;
});
t("every region tag is defined", () => {
  const bad = ALL_TOPICS.filter((x) => !REGIONS[x.region]).map((x) => x.region);
  return bad.length === 0 || [...new Set(bad)].join(",");
});
t("every theme tag is defined", () => {
  const bad = ALL_TOPICS.filter((x) => !THEMES[x.theme]).map((x) => x.theme);
  return bad.length === 0 || [...new Set(bad)].join(",");
});
t("both motion styles are present", () => {
  const thw = ALL_TOPICS.filter((x) => x.style === "thw").length;
  const res = ALL_TOPICS.filter((x) => x.style === "res").length;
  return (thw > 300 && res > 30) || `thw ${thw}, res ${res}`;
});
t("ids are unique and sequential", () => ALL_TOPICS.every((x, i) => x.id === i) || "ids drifted");
note(`${ALL_TOPICS.length} motions · ${MOTIONS.length} worlds-style · ${RESOLUTIONS.length} resolutions · ${Object.keys(REGIONS).length} regions`);

// --- formats --------------------------------------------------------------
t("every league exists", () => LEAGUES.every((l) => FORMATS[l]) || "missing format");
t("research comes first everywhere", () =>
  LEAGUES.every((l) => FORMATS[l].phases[0].kind === "research" && FORMATS[l].phases[0].sec === 300) || "research block wrong");
t("speaking time is equal on both sides", () => {
  const bad = [];
  for (const l of LEAGUES) {
    const f = FORMATS[l];
    let pro = 0, con = 0;
    for (const p of f.phases) {
      if (p.kind !== "speech") continue;
      if (p.who === "pro") pro += p.sec; else if (p.who === "con") con += p.sec;
    }
    if (pro !== con) bad.push(`${l}: ${pro}v${con}`);
  }
  return bad.length === 0 || bad.join(", ");
});
t("phase ids are unique within a format", () => {
  for (const l of LEAGUES) {
    const ids = FORMATS[l].phases.map((p) => p.id);
    if (new Set(ids).size !== ids.length) return `${l} repeats a phase id`;
  }
  return true;
});
t("Lincoln-Douglas matches the published times", () => {
  const sec = FORMATS.ld.phases.filter((p) => p.kind === "speech" || p.kind === "cross").map((p) => p.sec);
  return String(sec) === String([360, 180, 420, 180, 240, 360, 180]) || `got ${sec}`;
});
t("Public Forum matches the published times", () => {
  const sec = FORMATS.pf.phases.filter((p) => p.kind === "speech" || p.kind === "cross").map((p) => p.sec);
  return String(sec) === String([240, 240, 180, 240, 240, 180, 180, 180, 180, 120, 120]) || `got ${sec}`;
});
t("every gap between speeches is a flat thirty seconds", () => {
  for (const l of LEAGUES) {
    const bad = FORMATS[l].phases.filter((p) => p.kind === "gate" && p.sec !== 30);
    if (bad.length) return `${l}: ${bad.map((p) => p.id + "=" + p.sec).join(",")}`;
  }
  return true;
});
t("no format carries a prep bank", () =>
  LEAGUES.every((l) => !FORMATS[l].prepBank) || "a prep bank survived");
for (const l of LEAGUES) note(`${FORMATS[l].name}: ${fmtClock(roundSeconds(FORMATS[l]))} end to end`);

// --- ranks ----------------------------------------------------------------
t("tier boundaries are exact", () =>
  (tierOf(899).id === "copper" && tierOf(900).id === "bronze" && tierOf(1699).id === "platinum"
    && tierOf(1700).id === "diamond") || "boundary drift");
t("divisions run IV up to I", () => {
  const a = rankOf(900), b = rankOf(1099);
  return (a.label === "Bronze IV" && b.label === "Bronze I") || `${a.label} / ${b.label}`;
});
t("diamond is undivided", () => rankOf(1900).label === "Diamond" || rankOf(1900).label);
t("elo expectations sum to one", () =>
  Math.abs(expectedScore(1200, 1000) + expectedScore(1000, 1200) - 1) < 1e-9 || "asymmetric");
t("a win raises and a loss lowers", () => {
  const l = blankLeague();
  const up = applyResult(l, 1000, 1).league.rating;
  const down = applyResult(l, 1000, 0).league.rating;
  return (up > 1000 && down < 1000 && up - 1000 === 1000 - down) || `${up}/${down}`;
});
t("beating someone stronger pays more", () => {
  const l = blankLeague();
  return applyResult(l, 1400, 1).delta > applyResult(l, 600, 1).delta || "flat";
});

// --- the judge --------------------------------------------------------------
const topic = "This House would abolish the Electoral College";
const strong = "My first contention is that the college distorts the value of a vote. According to a 2020 study "
  + "a vote in Wyoming is worth 3.6 times a vote in California, because the floor of three electors is fixed. "
  + "They say the college protects small states. That is false, and here is why: the data shows campaign visits "
  + "concentrate in six swing states, which means forty four states are ignored. Even if you buy their claim about "
  + "federalism, the magnitude of disenfranchising ninety million voters outweighs it, and it is irreversible in a "
  + "way their harm is not. Second, the mechanism they describe does not follow. Their evidence concerns the Senate, "
  + "not the presidency. To conclude, on balance the harm comes first in both probability and scope.";
const weak = "So basically I think like the electoral college is kind of good you know. Um it is sort of traditional "
  + "and I mean people like tradition. Basically it is good. Um yeah I think it is just better honestly. I mean like "
  + "it has been around a long time and that matters a lot I guess. So yeah basically that is my case.";
const padded = (weak + " ").repeat(4);

function round(proText, conText, proSec = 240, conSec = 240) {
  return {
    topic,
    transcript: [
      { phase: "p1", label: "Constructive", kind: "speech", side: "pro", allotted: 240, spoken: proSec, text: proText },
      { phase: "c1", label: "Constructive", kind: "speech", side: "con", allotted: 240, spoken: conSec, text: conText },
    ],
  };
}

t("the better speech wins", () => judge(round(strong, weak)).winner === "pro" || "lost to filler");
t("side labels do not decide it", () => judge(round(weak, strong)).winner === "con" || "side bias");
t("swapping sides swaps the ballot exactly", () => {
  const r = checkSymmetry(round(strong, weak));
  return r.ok || `${r.a.winner} vs ${r.b.winner}, margins ${r.a.margin}/${r.b.margin}`;
});
t("talking more is not the same as arguing better", () => {
  const v = judge(round(strong, padded));
  return v.winner === "pro" || `padding won with ${padded.split(" ").length} words against ${strong.split(" ").length}`;
});
t("the ballot is deterministic", () => {
  const a = JSON.stringify(judge(round(strong, weak)));
  const b = JSON.stringify(judge(round(strong, weak)));
  return a === b || "two runs disagreed";
});
t("blinding is driven by the words, not the sides", () => {
  const r = round(strong, weak);
  const flipped = { ...r, transcript: r.transcript.map((x) => ({ ...x, side: x.side === "pro" ? "con" : "pro" })) };
  return blind(r.transcript).seed === blind(flipped.transcript).seed || "seed moved when sides moved";
});
t("silence is a forfeit, not a close round", () => {
  const v = judge(round(strong, "um"));
  return (v.forfeit && v.winner === "pro") || `${v.winner} forfeit=${v.forfeit}`;
});
t("two silent speakers produce no result", () => judge(round("um", "er")).winner === "draw" || "awarded silence");
t("identical speeches draw", () => {
  const v = judge(round(strong, strong));
  return (v.winner === "draw" && v.margin < 0.01) || `${v.winner} by ${v.margin}`;
});
t("going second is not worth a criterion on its own", () => {
  const v = judge(round(strong, strong));
  return !v.scored.includes("response") || "responsiveness scored with no chance to reciprocate";
});
t("responsiveness is scored when both sides get a later speech", () => {
  const four = { topic, transcript: [
    { phase: "p1", label: "Constructive", kind: "speech", side: "pro", allotted: 240, spoken: 220, text: strong },
    { phase: "c1", label: "Constructive", kind: "speech", side: "con", allotted: 240, spoken: 220, text: weak },
    { phase: "p2", label: "Rebuttal", kind: "speech", side: "pro", allotted: 240, spoken: 220, text: strong },
    { phase: "c2", label: "Rebuttal", kind: "speech", side: "con", allotted: 240, spoken: 220, text: weak },
  ] };
  return judge(four).scored.includes("response") || "dropped when it should count";
});
t("every criterion is reported", () => {
  const v = judge(round(strong, weak));
  const keys = Object.keys(v.scores.pro.criteria);
  return keys.length === 6 || keys.join(",");
});
t("criterion scores are antisymmetric", () => {
  const v = judge(round(strong, weak));
  for (const k of Object.keys(v.scores.pro.criteria)) {
    const s = v.scores.pro.criteria[k] + v.scores.con.criteria[k];
    if (Math.abs(s - 10) > 0.02) return `${k} sums to ${s.toFixed(2)}`;
  }
  return true;
});
t("the reason for decision cites numbers", () => {
  const v = judge(round(strong, weak));
  return (v.rfd.length >= 4 && v.rfd.some((l) => /\d/.test(l))) || "thin rfd";
});
{
  const v = judge(round(strong, weak));
  note(`sample ballot: ${v.winner} by ${v.margin} — ${v.rfd[0]}`);
  note(`blinded as A=${v.blind.A} B=${v.blind.B}`);
}

const sum = document.getElementById("summary");
sum.className = fail ? "bad" : "ok";
sum.textContent = fail ? `${fail} FAILED, ${pass} passed` : `ALL ${pass} CHECKS PASSED`;
document.title = sum.textContent;
