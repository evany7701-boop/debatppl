// Matchmaking and WebRTC signal relay.
//
// One endpoint, four actions. Clients long-ish poll it every second or so while they
// are waiting and while the peer connection is still being negotiated; once the data
// channel is open the relay goes quiet and everything runs peer to peer.

import { store, getJSON, setJSON, BACKEND } from "../lib/store.mjs";
import { ALL_TOPICS } from "../lib/topics.mjs";
import { FORMATS, LEAGUES, preferredStyle } from "../lib/formats.mjs";

const WAIT_TTL = 40;      // seconds a queued player stays claimable without polling
const ROOM_TTL = 7200;
const RECENT_KEY = "recent:topics";
const RECENT_KEEP = 240;  // motions served lately, excluded from the next draw
const MAILBOX_CAP = 120;

const qKey = (l) => `q:${l}`;
const wKey = (id) => `w:${id}`;
const pKey = (id) => `p:${id}`;
const rKey = (id) => `r:${id}`;
const mKey = (id) => `m:${id}`;

function rid(n = 10) {
  const a = "abcdefghijkmnpqrstuvwxyz23456789";
  let s = "";
  for (let i = 0; i < n; i++) s += a[Math.floor(Math.random() * a.length)];
  return s;
}

function clean(s, max = 64) {
  // Player ids go straight into store keys. Letters, digits, dash only — nothing
  // that could reach into another key namespace.
  return typeof s === "string" ? s.slice(0, max).replace(/[^A-Za-z0-9-]/g, "") : "";
}

const SEEN_CAP = 600;

async function pickTopic(league, seenRaw) {
  const seen = Array.isArray(seenRaw) ? seenRaw.slice(0, SEEN_CAP) : [];
  const style = preferredStyle(league);
  const recent = new Set((await store.lrange(RECENT_KEY, 0, RECENT_KEEP)).map(Number));
  const skip = new Set([...seen.map(Number), ...recent]);

  // Preferred style, not seen by this player, not served lately.
  let pool = ALL_TOPICS.filter((t) => t.style === style && !skip.has(t.id));
  // Then anything not seen by this player.
  if (!pool.length) pool = ALL_TOPICS.filter((t) => !skip.has(t.id));
  // Then anything they personally have not had, ignoring the global ring buffer.
  if (!pool.length) {
    const mine = new Set(seen.map(Number));
    pool = ALL_TOPICS.filter((t) => !mine.has(t.id));
  }
  // Only once the bag is genuinely exhausted does it reset.
  if (!pool.length) pool = ALL_TOPICS;

  const topic = pool[Math.floor(Math.random() * pool.length)];
  await store.rpush(RECENT_KEY, String(topic.id));
  const len = await store.llen(RECENT_KEY);
  if (len > RECENT_KEEP) await store.ltrim(RECENT_KEY, len - RECENT_KEEP, -1);
  return topic;
}

function viewFor(room, id) {
  const side = room.sides.pro === id ? "pro" : "con";
  return {
    roomId: room.id,
    league: room.league,
    topic: room.topic,
    side,
    role: room.host === id ? "host" : "guest",
    createdAt: room.createdAt,
  };
}

async function roomOf(id) {
  const roomId = await store.get(pKey(id));
  if (!roomId) return null;
  const room = await getJSON(rKey(String(roomId)));
  if (!room || !room.members.includes(id)) {
    await store.del(pKey(id));
    return null;
  }
  return room;
}

async function createRoom(league, waitingId, joinerId, seen) {
  const topic = await pickTopic(league, seen);
  const id = rid(12);
  // Sides are drawn, not awarded. Whoever waited longer has no claim on proposition.
  const proFirst = Math.random() < 0.5;
  const room = {
    id,
    league,
    topic,
    createdAt: Date.now(),
    members: [waitingId, joinerId],
    host: waitingId,                       // the one who was already here negotiates
    sides: proFirst
      ? { pro: waitingId, con: joinerId }
      : { pro: joinerId, con: waitingId },
  };
  await setJSON(rKey(id), room, ROOM_TTL);
  await store.set(pKey(waitingId), id, ROOM_TTL);
  await store.set(pKey(joinerId), id, ROOM_TTL);
  await store.del(wKey(waitingId), wKey(joinerId));
  return room;
}

async function find(body) {
  const id = clean(body.id);
  const league = LEAGUES.includes(body.league) ? body.league : "spar";
  if (!id) return { error: "no id" };

  const existing = await roomOf(id);
  if (existing) return { state: "matched", room: viewFor(existing, id) };

  for (let i = 0; i < 6; i++) {
    const peer = await store.lpop(qKey(league));
    if (!peer) break;
    if (peer === id) continue;                      // our own stale entry
    if (!(await store.get(wKey(peer)))) continue;   // they gave up or timed out
    if (await store.get(pKey(peer))) continue;      // already matched by someone else
    const room = await createRoom(league, peer, id, body.seen);
    return { state: "matched", room: viewFor(room, id) };
  }

  await store.lrem(qKey(league), id);
  await store.rpush(qKey(league), id);
  await store.set(wKey(id), String(Date.now()), WAIT_TTL);
  return { state: "waiting", queued: await store.llen(qKey(league)) };
}

async function poll(body) {
  const id = clean(body.id);
  if (!id) return { error: "no id" };

  const room = await roomOf(id);
  if (room) {
    const raw = await store.drain(mKey(id));
    const signals = raw.map((r) => { try { return JSON.parse(r); } catch { return null; } }).filter(Boolean);
    return { state: "matched", room: viewFor(room, id), signals };
  }

  const league = LEAGUES.includes(body.league) ? body.league : "spar";
  await store.set(wKey(id), String(Date.now()), WAIT_TTL);
  return { state: "waiting", queued: await store.llen(qKey(league)) };
}

async function signal(body) {
  const id = clean(body.id);
  const room = await roomOf(id);
  if (!room) return { error: "no room" };
  const peer = room.members.find((m) => m !== id);
  if (!peer) return { error: "no peer" };
  const items = Array.isArray(body.data) ? body.data : [body.data];
  if ((await store.llen(mKey(peer))) > MAILBOX_CAP) return { ok: true, dropped: true };
  // Deliberately no sender id in the envelope. A player id is the only thing that
  // authenticates a player to this endpoint, so it must never reach the other side.
  await store.rpush(mKey(peer), ...items.slice(0, 20).map((d) => JSON.stringify({ d })));
  return { ok: true };
}

async function leave(body) {
  const id = clean(body.id);
  const league = LEAGUES.includes(body.league) ? body.league : null;
  if (league) await store.lrem(qKey(league), id);
  else for (const l of LEAGUES) await store.lrem(qKey(l), id);
  await store.del(wKey(id));

  const room = await roomOf(id);
  if (room) {
    const peer = room.members.find((m) => m !== id);
    if (peer) await store.rpush(mKey(peer), JSON.stringify({ d: { kind: "bye" } }));
    await store.del(pKey(id));
  }
  return { ok: true };
}

async function stats() {
  const queues = {};
  for (const l of LEAGUES) queues[l] = await store.llen(qKey(l));
  return {
    ok: true,
    backend: BACKEND,
    topics: ALL_TOPICS.length,
    leagues: LEAGUES.map((l) => ({ id: l, name: FORMATS[l].name, waiting: queues[l] })),
  };
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");

  if (req.method === "GET") {
    return res.status(200).json(await stats());
  }
  if (req.method !== "POST") {
    return res.status(405).json({ error: "method" });
  }

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  if (!body || typeof body !== "object") body = {};

  try {
    switch (body.action) {
      case "find": return res.status(200).json(await find(body));
      case "poll": return res.status(200).json(await poll(body));
      case "signal": return res.status(200).json(await signal(body));
      case "leave": return res.status(200).json(await leave(body));
      default: return res.status(400).json({ error: "unknown action" });
    }
  } catch {
    // Nothing about the inside of this function is the caller's business.
    return res.status(500).json({ error: "lobby unavailable" });
  }
}
