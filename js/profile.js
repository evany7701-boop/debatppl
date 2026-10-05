// Who you are here: a random string in localStorage and nothing else. No account,
// no email, no profile to fill in. Clearing site data makes you a new person, which
// is the same bargain Omegle offered.

import { LEAGUES } from "/lib/formats.mjs";
import { blankLeague, applyResult, rankOf } from "/lib/ranks.mjs";

const KEY = "debatppl.v1";
const SEEN_CAP = 500;

// Your id is what the lobby uses to know which queue slot and which mailbox are
// yours. That makes it a bearer token, so it is drawn from the CSPRNG and is 128
// bits wide rather than something guessable from a timestamp.
function newId() {
  const bytes = new Uint8Array(16);
  if (globalThis.crypto && globalThis.crypto.getRandomValues) {
    globalThis.crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  return [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function fresh() {
  const leagues = {};
  for (const l of LEAGUES) leagues[l] = blankLeague();
  return {
    id: newId(),
    created: Date.now(),
    leagues,
    seen: [],
    rounds: 0,
    lastLeague: "spar",
  };
}

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return fresh();
    const p = JSON.parse(raw);
    if (!p || !p.id) return fresh();
    p.leagues = p.leagues || {};
    for (const l of LEAGUES) if (!p.leagues[l]) p.leagues[l] = blankLeague();
    p.seen = Array.isArray(p.seen) ? p.seen : [];
    return p;
  } catch {
    return fresh();
  }
}

let profile = read();
save();

function save() {
  try { localStorage.setItem(KEY, JSON.stringify(profile)); } catch { /* private window */ }
}

export function me() { return profile; }
export function myId() { return profile.id; }
export function league(id) { return profile.leagues[id] || blankLeague(); }
export function rank(id) { return rankOf(league(id).rating); }
export function seen() { return profile.seen; }

export function markSeen(topicId) {
  if (typeof topicId !== "number") return;
  if (!profile.seen.includes(topicId)) profile.seen.push(topicId);
  if (profile.seen.length > SEEN_CAP) profile.seen = profile.seen.slice(-SEEN_CAP);
  save();
}

export function setLastLeague(id) { profile.lastLeague = id; save(); }

// score: 1 won, 0 lost, 0.5 draw.
export function record(leagueId, score, opponentRating) {
  const before = league(leagueId);
  const beforeRank = rankOf(before.rating);
  const { league: after, delta } = applyResult(before, opponentRating ?? before.rating, score);
  profile.leagues[leagueId] = after;
  profile.rounds += 1;
  save();
  const afterRank = rankOf(after.rating);
  return {
    before, after, delta, beforeRank, afterRank,
    promoted: afterRank.label !== beforeRank.label && after.rating > before.rating,
    demoted: afterRank.label !== beforeRank.label && after.rating < before.rating,
  };
}

export function reset() { profile = fresh(); save(); }
