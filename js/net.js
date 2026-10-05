// Finding someone, then talking to them.
//
// The server is only a rendezvous: it pairs two people, hands them the same motion,
// and passes the WebRTC handshake between them. Once the data channel opens the
// server stops carrying anything that matters and the round is peer to peer.
//
// There is no TURN server, because a TURN server needs credentials and this build
// takes none. On the handful of network pairs where a direct path cannot be found,
// audio will not connect; rather than killing the round, the session falls back to
// relaying the transcript through the lobby endpoint and says so in the interface.

const ICE = [
  { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
  { urls: "stun:stun.cloudflare.com:3478" },
];

const POLL_FAST = 1100;
const POLL_IDLE = 5000;
const P2P_DEADLINE = 14000;

async function post(body) {
  const r = await fetch("/api/lobby", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`lobby ${r.status}`);
  return r.json();
}

export class Session {
  constructor(opts) {
    this.id = opts.id;
    this.league = opts.league;
    this.seen = opts.seen || [];
    this.onStatus = opts.onStatus || (() => {});
    this.onRoom = opts.onRoom || (() => {});
    this.onMessage = opts.onMessage || (() => {});
    this.onRemoteStream = opts.onRemoteStream || (() => {});
    this.onLink = opts.onLink || (() => {});

    this.room = null;
    this.pc = null;
    this.dc = null;
    this.stopped = false;
    this.link = "connecting";
    this.outbox = [];
    this.flushTimer = 0;
    this.pollTimer = 0;
    this.pendingIce = [];
    this.remoteSet = false;
    this.queued = 0;
  }

  // --- lobby ----------------------------------------------------------------

  async search() {
    this.stopped = false;
    const res = await post({ action: "find", id: this.id, league: this.league, seen: this.seen });
    if (res.state === "matched") return this._matched(res.room);
    this.queued = res.queued || 0;
    this.onStatus("waiting", { queued: this.queued });
    this._poll(POLL_FAST);
  }

  _poll(delay) {
    clearTimeout(this.pollTimer);
    if (this.stopped) return;
    this.pollTimer = setTimeout(async () => {
      if (this.stopped) return;
      try {
        const res = await post({ action: "poll", id: this.id, league: this.league });
        if (this.stopped) return;
        if (res.state === "matched") {
          if (!this.room) this._matched(res.room);
          for (const s of res.signals || []) this._incoming(s.d);
        } else {
          this.queued = res.queued || 0;
          this.onStatus("waiting", { queued: this.queued });
        }
      } catch { /* a dropped poll is not fatal; the next one will do */ }
      this._poll(this.link === "p2p" ? POLL_IDLE : POLL_FAST);
    }, delay + Math.random() * 180);
  }

  _matched(room) {
    this.room = room;
    this.onRoom(room);
    this.onStatus("matched", { room });
    this._poll(300);
  }

  // --- peer connection -------------------------------------------------------

  async connect(localStream) {
    if (!this.room || this.pc) return;
    const pc = new RTCPeerConnection({ iceServers: ICE });
    this.pc = pc;

    if (localStream) for (const t of localStream.getTracks()) pc.addTrack(t, localStream);

    pc.ontrack = (e) => { if (e.streams && e.streams[0]) this.onRemoteStream(e.streams[0]); };
    pc.onicecandidate = (e) => { if (e.candidate) this._send({ kind: "ice", c: e.candidate.toJSON() }); };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed") this._degrade("audio could not find a path");
    };

    if (this.room.role === "host") {
      this._wireChannel(pc.createDataChannel("dp", { ordered: true }));
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      this._send({ kind: "offer", sdp: pc.localDescription.sdp });
    } else {
      pc.ondatachannel = (e) => this._wireChannel(e.channel);
    }

    setTimeout(() => {
      if (!this.stopped && this.link !== "p2p") this._degrade("audio could not connect in time");
    }, P2P_DEADLINE);
  }

  _wireChannel(dc) {
    this.dc = dc;
    dc.onopen = () => {
      this.link = "p2p";
      this.onLink("p2p");
      for (const m of this.outbox.splice(0)) this._rawSend(m);
    };
    dc.onclose = () => { if (this.link === "p2p") this.onStatus("peer-left"); };
    dc.onmessage = (e) => {
      try { this.onMessage(JSON.parse(e.data)); } catch { /* ignore malformed */ }
    };
  }

  _degrade(why) {
    if (this.link === "p2p" || this.link === "relay") return;
    this.link = "relay";
    this.onLink("relay", why);
    for (const m of this.outbox.splice(0)) this._send({ kind: "app", m });
  }

  async _incoming(d) {
    if (!d || !this.pc) {
      if (d && d.kind === "bye") this.onStatus("peer-left");
      return;
    }
    try {
      if (d.kind === "offer") {
        await this.pc.setRemoteDescription({ type: "offer", sdp: d.sdp });
        this.remoteSet = true;
        await this._drainIce();
        const answer = await this.pc.createAnswer();
        await this.pc.setLocalDescription(answer);
        this._send({ kind: "answer", sdp: this.pc.localDescription.sdp });
      } else if (d.kind === "answer") {
        if (this.pc.signalingState !== "stable") {
          await this.pc.setRemoteDescription({ type: "answer", sdp: d.sdp });
          this.remoteSet = true;
          await this._drainIce();
        }
      } else if (d.kind === "ice") {
        if (this.remoteSet) await this.pc.addIceCandidate(d.c).catch(() => {});
        else this.pendingIce.push(d.c);
      } else if (d.kind === "app") {
        this.onMessage(d.m);
      } else if (d.kind === "bye") {
        this.onStatus("peer-left");
      }
    } catch { /* a bad frame should not end the round */ }
  }

  async _drainIce() {
    for (const c of this.pendingIce.splice(0)) await this.pc.addIceCandidate(c).catch(() => {});
  }

  // --- messaging --------------------------------------------------------------

  // Application messages: data channel when it is up, lobby relay when it is not.
  send(msg) {
    if (this.dc && this.dc.readyState === "open") return this._rawSend(msg);
    if (this.link === "relay") return this._send({ kind: "app", m: msg });
    this.outbox.push(msg);
    if (this.outbox.length > 200) this.outbox.shift();
  }

  _rawSend(msg) {
    try { this.dc.send(JSON.stringify(msg)); }
    catch { this._send({ kind: "app", m: msg }); }
  }

  // Signalling and relayed frames, batched so the handshake is a few requests
  // rather than one per ICE candidate.
  _send(frame) {
    this.outboxSignals = this.outboxSignals || [];
    this.outboxSignals.push(frame);
    this._scheduleFlush();
  }

  _scheduleFlush() {
    if (this.flushTimer || this.stopped) return;
    this.flushTimer = setTimeout(async () => {
      this.flushTimer = 0;
      const batch = this.outboxSignals.splice(0, 20);   // order preserved
      if (!batch.length || this.stopped) return;
      try { await post({ action: "signal", id: this.id, data: batch }); }
      catch { this.outboxSignals.unshift(...batch); }   // put them back, in order
      if (this.outboxSignals.length) this._scheduleFlush();
    }, 220);
  }

  async leave() {
    this.stopped = true;
    clearTimeout(this.pollTimer);
    clearTimeout(this.flushTimer);
    try { if (this.dc) this.dc.close(); } catch {}
    try { if (this.pc) this.pc.close(); } catch {}
    this.dc = null; this.pc = null;
    try { await post({ action: "leave", id: this.id, league: this.league }); } catch {}
  }
}

export async function lobbyStats() {
  try {
    const r = await fetch("/api/lobby", { headers: { Accept: "application/json" } });
    return r.ok ? r.json() : null;
  } catch { return null; }
}
