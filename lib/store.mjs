// State for the lobby.
//
// Default: in process memory. That is deliberate — this build asks for no credentials
// of any kind, so there is nothing to configure before the first round. The cost is
// that matchmaking only works between players whose requests land on the same warm
// function instance, which in practice is most of them at small scale but not all.
//
// Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN (or Vercel KV's
// KV_REST_API_URL / KV_REST_API_TOKEN) and the same interface is served by Redis
// instead, with no other change anywhere in the app. The verbs below are the whole
// contract.

const URL_ = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL || "";
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN || "";
export const BACKEND = URL_ && TOKEN ? "redis" : "memory";

// --- memory -----------------------------------------------------------------

const mem = { kv: new Map(), lists: new Map(), touched: new Map() };
const LIST_TTL = 2 * 60 * 60 * 1000;

// Redis expires keys on its own; the memory backend has to be told. Without this a
// warm instance keeps a mailbox for every player who ever closed the tab mid-round.
function sweep() {
  const now = Date.now();
  for (const [k, v] of mem.kv) if (v.exp && v.exp < now) mem.kv.delete(k);
  for (const [k, at] of mem.touched) {
    if (now - at < LIST_TTL) continue;
    mem.lists.delete(k);
    mem.touched.delete(k);
  }
}

function touch(key) { mem.touched.set(key, Date.now()); }

const memory = {
  async get(key) {
    sweep();
    const v = mem.kv.get(key);
    return v ? v.val : null;
  },
  async set(key, val, ttlSec) {
    mem.kv.set(key, { val, exp: ttlSec ? Date.now() + ttlSec * 1000 : 0 });
  },
  async del(...keys) { for (const k of keys) mem.kv.delete(k); },
  async rpush(key, ...vals) {
    sweep();
    const l = mem.lists.get(key) || [];
    l.push(...vals);
    mem.lists.set(key, l);
    touch(key);
    return l.length;
  },
  async lpop(key) {
    sweep();
    const l = mem.lists.get(key);
    if (!l || !l.length) return null;
    const v = l.shift();
    if (!l.length) mem.lists.delete(key);
    return v;
  },
  async lrem(key, val) {
    const l = mem.lists.get(key);
    if (!l) return 0;
    const i = l.indexOf(val);
    if (i === -1) return 0;
    l.splice(i, 1);
    return 1;
  },
  async drain(key) {
    const l = mem.lists.get(key) || [];
    mem.lists.delete(key);
    mem.touched.delete(key);
    return l;
  },
  async lrange(key, start, stop) {
    const l = mem.lists.get(key) || [];
    return l.slice(start, stop === -1 ? undefined : stop + 1);
  },
  async ltrim(key, start, stop) {
    const l = mem.lists.get(key);
    if (l) mem.lists.set(key, l.slice(start, stop === -1 ? undefined : stop + 1));
  },
  async llen(key) { return (mem.lists.get(key) || []).length; },
};

// --- redis over REST ---------------------------------------------------------

async function pipeline(cmds) {
  const res = await fetch(`${URL_}/pipeline`, {
    method: "POST",
    headers: { Authorization: `Bearer ${TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(cmds),
  });
  if (!res.ok) throw new Error(`store ${res.status}`);
  const out = await res.json();
  return out.map((r) => (r && "result" in r ? r.result : null));
}

const redis = {
  async get(key) { return (await pipeline([["GET", key]]))[0]; },
  async set(key, val, ttlSec) {
    await pipeline([ttlSec ? ["SET", key, val, "EX", String(ttlSec)] : ["SET", key, val]]);
  },
  async del(...keys) { if (keys.length) await pipeline([["DEL", ...keys]]); },
  async rpush(key, ...vals) { return (await pipeline([["RPUSH", key, ...vals], ["EXPIRE", key, "7200"]]))[0]; },
  async lpop(key) { return (await pipeline([["LPOP", key]]))[0]; },
  async lrem(key, val) { return (await pipeline([["LREM", key, "0", val]]))[0]; },
  async drain(key) {
    const [vals] = await pipeline([["LRANGE", key, "0", "-1"], ["DEL", key]]);
    return vals || [];
  },
  async lrange(key, start, stop) {
    return (await pipeline([["LRANGE", key, String(start), String(stop)]]))[0] || [];
  },
  async ltrim(key, start, stop) { await pipeline([["LTRIM", key, String(start), String(stop)]]); },
  async llen(key) { return (await pipeline([["LLEN", key]]))[0] || 0; },
};

export const store = BACKEND === "redis" ? redis : memory;

export async function getJSON(key) {
  const raw = await store.get(key);
  if (!raw) return null;
  try { return typeof raw === "string" ? JSON.parse(raw) : raw; } catch { return null; }
}

export async function setJSON(key, val, ttlSec) {
  await store.set(key, JSON.stringify(val), ttlSec);
}
