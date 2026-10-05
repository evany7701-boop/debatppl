// The round itself.
//
// One side is the host and owns the clock. The other side renders what the host
// tells it and sends requests back. This is deliberately not a synchronised
// distributed clock: two browsers with drifting clocks and a flaky data channel
// will disagree about whose speech it is, and in a debate that is the one thing
// that must never happen.
//
// Protocol, all over the data channel (or the relay, transparently):
//   host -> guest   clock, poi, done, ballot
//   guest -> host   ready, prep, poi
//   either way      line  (a committed sentence of transcript)

import { FORMATS, POI_PROTECT } from "/lib/formats.mjs";

const TICK = 250;
const BROADCAST = 500;
const PREP_CHUNK = 30;
const POI_SECONDS = 15;

export class Round {
  constructor(opts) {
    this.format = FORMATS[opts.league];
    this.side = opts.side;                 // "pro" | "con"
    this.isHost = opts.isHost;
    this.send = opts.send;
    this.on = opts.on || (() => {});
    this.solo = Boolean(opts.solo);       // preview harness: no second person to wait for

    this.index = 0;
    this.rem = this.format.phases[0].sec;
    this.remStamp = performance.now();
    this.prep = { pro: this.format.prepBank, con: this.format.prepBank };
    this.ready = { pro: false, con: false };
    this.poi = null;                       // { by, until } while one is live
    this.poiOffer = null;                  // { by } while one is pending
    this.over = false;
    this.started = false;

    this.lines = [];                       // { side, phase, text, at }
    this.spans = new Map();                // phaseIndex:side -> { first, last }
    this.timer = 0;
    this.lastBroadcast = 0;
  }

  get phase() { return this.format.phases[this.index]; }
  get other() { return this.side === "pro" ? "con" : "pro"; }

  start() {
    this.started = true;
    this._setPhase(0);
    if (this.isHost) {
      this.timer = setInterval(() => this._tick(), TICK);
    } else {
      this.timer = setInterval(() => this._followTick(), TICK);
    }
    this.on("phase", this.view());
  }

  stop() { clearInterval(this.timer); this.timer = 0; }

  // The guest renders the host's clock and never advances itself — except at the
  // very end, where a lost "done" would otherwise leave it waiting forever.
  _followTick() {
    this.on("tick", this.view());
    if (this.over) return;
    const last = this.index + 1 >= this.format.phases.length;
    if (last && this.remaining() <= 0) {
      this.endGrace = (this.endGrace || 0) + TICK;
      if (this.endGrace > 12000) this._finish(true);
    } else {
      this.endGrace = 0;
    }
  }

  // --- clock -----------------------------------------------------------------

  _setPhase(i) {
    this.index = i;
    this.rem = this.format.phases[i].sec;
    this.remStamp = performance.now();
    this.ready = { pro: false, con: false };
    this.poi = null;
    this.poiOffer = null;
  }

  remaining() {
    const drift = (performance.now() - this.remStamp) / 1000;
    return Math.max(0, this.rem - drift);
  }

  _tick() {
    const now = performance.now();
    if (this.remaining() <= 0) {
      if (this.index + 1 >= this.format.phases.length) return this._finish();
      this._setPhase(this.index + 1);
      this._broadcast(true);
      this.on("phase", this.view());
      return;
    }
    if (this.poi && now > this.poi.until) {
      this.poi = null;
      this.on("poi", this.view());
      this._broadcast(true);
    }
    if (now - this.lastBroadcast > BROADCAST) this._broadcast();
    this.on("tick", this.view());
  }

  _broadcast(force) {
    if (!this.isHost) return;
    this.lastBroadcast = performance.now();
    this.send({
      t: "clock",
      i: this.index,
      rem: Number(this.remaining().toFixed(2)),
      prep: this.prep,
      ready: this.ready,
      poi: this.poi ? { by: this.poi.by, left: Math.max(0, (this.poi.until - performance.now()) / 1000) } : null,
      offer: this.poiOffer ? { by: this.poiOffer.by } : null,
      force: Boolean(force),
    });
  }

  // --- requests ---------------------------------------------------------------

  // Skip the gap between speeches once both have said they are ready.
  markReady() {
    if (this.phase.kind !== "gate" && this.phase.kind !== "research") return;
    if (this.isHost) this._ready(this.side);
    else this.send({ t: "ready" });
  }

  _ready(who) {
    this.ready[who] = true;
    if (this.solo || (this.ready.pro && this.ready.con)) {
      if (this.index + 1 >= this.format.phases.length) return this._finish();
      this._setPhase(this.index + 1);
      this.on("phase", this.view());
    }
    this._broadcast(true);
  }

  // Spend thirty seconds of your own prep bank, as you would on a real flow.
  takePrep() {
    if (this.isHost) this._prep(this.side);
    else this.send({ t: "prep" });
  }

  _prep(who) {
    if (this.phase.kind !== "gate") return;
    if (this.phase.prep && this.phase.prep !== who) return;
    if (this.prep[who] < 1) return;
    const spend = Math.min(PREP_CHUNK, this.prep[who]);
    this.prep[who] -= spend;
    this.rem = this.remaining() + spend;
    this.remStamp = performance.now();
    this.ready = { pro: false, con: false };
    this._broadcast(true);
    this.on("prep", this.view());
  }

  // --- points of information ----------------------------------------------------

  canOfferPoi() {
    if (!this.format.poi || this.phase.kind !== "speech") return false;
    if (this.phase.who === this.side) return false;
    if (this.poi || this.poiOffer) return false;
    const r = this.remaining();
    return r < this.phase.sec - POI_PROTECT && r > POI_PROTECT;
  }

  offerPoi() {
    if (!this.canOfferPoi()) return;
    if (this.isHost) this._poi("offer", this.side);
    else this.send({ t: "poi", act: "offer" });
  }

  answerPoi(accept) {
    if (this.isHost) this._poi(accept ? "accept" : "decline", this.side);
    else this.send({ t: "poi", act: accept ? "accept" : "decline" });
  }

  _poi(act, who) {
    if (act === "offer") {
      if (this.phase.kind !== "speech" || this.phase.who === who) return;
      this.poiOffer = { by: who };
    } else if (act === "accept") {
      if (!this.poiOffer || this.phase.who !== who) return;
      this.poi = { by: this.poiOffer.by, until: performance.now() + POI_SECONDS * 1000 };
      this.poiOffer = null;
    } else {
      this.poiOffer = null;
    }
    this._broadcast(true);
    this.on("poi", this.view());
  }

  // --- transcript ----------------------------------------------------------------

  addLine(text) {
    const clean = (text || "").trim();
    if (!clean) return;
    const entry = { side: this.side, phase: this.index, text: clean, at: Date.now() };
    this._absorb(entry);
    this.send({ t: "line", ...entry });
  }

  _absorb(entry) {
    if (this.lines.length > 1500) return;   // a peer cannot grow this without bound
    this.lines.push(entry);
    const key = `${entry.phase}:${entry.side}`;
    const span = this.spans.get(key) || { first: entry.at, last: entry.at };
    span.first = Math.min(span.first, entry.at);
    span.last = Math.max(span.last, entry.at);
    this.spans.set(key, span);
    this.on("line", entry);
  }

  transcript() {
    const out = [];
    this.format.phases.forEach((p, i) => {
      if (p.kind !== "speech" && p.kind !== "cross") return;
      for (const side of ["pro", "con"]) {
        if (p.kind === "speech" && p.who !== side) continue;
        const text = this.lines.filter((l) => l.phase === i && l.side === side).map((l) => l.text).join(" ");
        if (!text) continue;
        const span = this.spans.get(`${i}:${side}`);
        const spoken = span ? Math.min(p.sec, Math.round((span.last - span.first) / 1000) + 3) : 0;
        out.push({ phase: p.id, label: p.label, kind: p.kind, side, allotted: p.sec, spoken, text });
      }
    });
    return out;
  }

  // --- messages ---------------------------------------------------------------------

  handle(m) {
    if (!m || typeof m !== "object") return;
    switch (m.t) {
      case "clock": {
        if (this.isHost) return;
        const moved = m.i !== this.index;
        // Apply the whole frame before announcing it, so a phase change is never
        // rendered against the previous phase's clock.
        this.index = m.i;
        this.rem = m.rem;
        this.remStamp = performance.now();
        this.prep = m.prep || this.prep;
        this.ready = m.ready || this.ready;
        this.poi = m.poi ? { by: m.poi.by, until: performance.now() + m.poi.left * 1000 } : null;
        this.poiOffer = m.offer || null;
        this.lastClock = performance.now();
        this.on(moved ? "phase" : "tick", this.view());
        break;
      }
      case "ready": if (this.isHost) this._ready(this.other); break;
      case "prep": if (this.isHost) this._prep(this.other); break;
      case "poi": if (this.isHost) this._poi(m.act, this.other); break;
      case "line":
        if (m.side === this.side) return;   // our own lines are already in
        this._absorb({ side: m.side, phase: m.phase, text: String(m.text || "").slice(0, 1200), at: m.at || Date.now() });
        break;
      case "done": if (!this.isHost) this._finish(true); break;
      // A ballot is never accepted from the other side: they would be marking
      // their own round. Both clients ask the server for their own.
      case "ballot": break;
      default: break;
    }
  }

  _finish(fromPeer) {
    if (this.over) return;
    this.over = true;
    this.stop();
    if (this.isHost && !fromPeer) this.send({ t: "done" });
    this.on("done", this.transcript());
  }

  endEarly() { this._finish(); }

  // --- what the interface draws --------------------------------------------------

  view() {
    const p = this.phase;
    const rem = this.remaining();
    const poiLive = Boolean(this.poi);
    let floor;
    if (p.kind === "cross") floor = "both";
    else if (p.kind === "speech") floor = poiLive ? "both" : p.who;
    else floor = "none";

    return {
      index: this.index,
      total: this.format.phases.length,
      phase: p,
      rem,
      progress: p.sec ? rem / p.sec : 0,
      floor,
      mine: floor === "both" || floor === this.side,
      prep: this.prep,
      ready: this.ready,
      poi: this.poi,
      poiOffer: this.poiOffer,
      canOfferPoi: this.canOfferPoi(),
      over: this.over,
    };
  }
}
