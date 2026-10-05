// debat ppl.

import { h, icon, rankBadge } from "/js/ui.js";
import * as motion from "/js/motion.js";
import { FORMATS, LEAGUES, fmtClock } from "/lib/formats.mjs";
import { ALL_TOPICS, REGIONS, THEMES } from "/lib/topics.mjs";
import { TIERS, rankOf, START_RATING } from "/lib/ranks.mjs";
import * as profile from "/js/profile.js";
import { Session, lobbyStats } from "/js/net.js";
import { Round } from "/js/round.js";
import { Dictation, supported as speechSupported } from "/js/speech.js";
import { judge as localJudge } from "/lib/rubric.mjs";

const root = document.getElementById("view");
const remoteAudio = document.getElementById("remote-audio");

const S = {
  view: "home",
  league: profile.me().lastLeague || "spar",
  session: null,
  round: null,
  room: null,
  stream: null,
  micError: null,
  dictation: null,
  wave: null,
  link: "connecting",
  linkNote: null,
  opponentRating: null,
  ballot: null,
  result: null,
  notes: "",
  ui: {},
  judgeTimer: 0,
};

const sideName = (league, side) => FORMATS[league].sides[side];
const otherSide = (s) => (s === "pro" ? "con" : "pro");

function show(name, build) {
  S.view = name;
  motion.swapView(root, build);
}

// --- home ---------------------------------------------------------------------

function viewHome() {
  const frag = h("div");

  frag.append(
    h("p", { class: "lede" },
      "You are put in a round with a stranger. You do not meet them, you do not see a name. ",
      "A motion appears, you get five minutes, and then you debate it."),
  );

  const list = h("div", { class: "leagues" });
  for (const id of LEAGUES) {
    const f = FORMATS[id];
    const l = profile.league(id);
    const r = rankOf(l.rating);
    const btn = h("button", {
      class: "league",
      "aria-pressed": String(id === S.league),
      onclick: () => {
        S.league = id;
        profile.setLastLeague(id);
        for (const el of list.children) el.setAttribute("aria-pressed", String(el === btn));
        motion.pop(btn.querySelector(".badge"));
      },
    },
      rankBadge(r, 30),
      h("span", {},
        h("span", { class: "league-name" }, f.name), h("br"),
        h("span", { class: "league-sub" }, f.tagline)),
      h("span", { class: "league-rank" },
        h("b", {}, r.label),
        l.rounds ? `${l.rating} · ${l.wins}-${l.losses}${l.draws ? "-" + l.draws : ""}` : "unrated"),
    );
    list.append(btn);
  }
  frag.append(list);

  const go = h("button", { class: "btn big", onclick: beginSearch },
    "Start a round", icon("next", 17));
  frag.append(go);

  frag.append(h("p", { class: "small", style: { marginTop: "12px" } },
    "Five minutes of research, then the real speech times for the format. ",
    "Your microphone only opens when it is your turn."));

  if (!speechSupported) {
    frag.append(h("div", { class: "notice" },
      "This browser has no speech recognition, so your speeches will be typed instead of spoken. ",
      "Chrome, Edge or Safari will transcribe you."));
  }

  motion.stagger(frag.children, { step: 55, y: 12 });
  return frag;
}

// --- about ---------------------------------------------------------------------

function viewAbout() {
  const frag = h("div");
  frag.append(h("h2", {}, "How it works"));

  const steps = [
    ["Pick a league and press start", "Each league is a real format with its own rating. Nothing else is configured; there is nothing to sign up for."],
    ["You are matched, but not introduced", "You get the motion and your side. You do not get a name, a face or a profile, and neither do they."],
    ["Five minutes", "Both of you research in silence. Microphones are closed. There is a scratchpad that nobody else can see."],
    ["The round runs itself", "Speeches follow the published times for the format. Only the speaker's microphone is open; the app enforces it. Prep time comes out of your own bank, and in World Schools and British Parliamentary you can offer points of information."],
    ["Your speech becomes a transcript", "Recognition runs in your browser. Nothing is uploaded to transcribe it."],
    ["A blind ballot", "The transcript is relabelled Speaker A and Speaker B before anything is scored, so the judge cannot know which side it is rewarding. You get the criteria, the numbers behind them, and a reason for decision."],
  ];
  const ol = h("div");
  steps.forEach(([t, d], i) => {
    ol.append(h("div", { class: "panel" },
      h("h3", {}, `${i + 1} — ${t}`),
      h("p", { class: "small", style: { margin: 0 } }, d)));
  });
  frag.append(ol);

  frag.append(h("hr", { class: "rule" }));
  frag.append(h("h2", {}, "What is honest about this build"));
  frag.append(h("ul", { class: "rfd" },
    h("li", {}, "The ballot is a rubric, not a model. It counts refutation, warranting, structure, responsiveness, weighing and use of time, all per hundred words so that talking longer is not the same as arguing better. ",
      "The endpoint is built so a model can take over the ballot later without the rest of the app changing."),
    h("li", {}, "Ratings live in your browser. There is no account, so there is no global leaderboard and no way to stop someone clearing their storage to reset."),
    h("li", {}, "Audio is peer to peer. There is no relay server with credentials, so on a small number of restrictive networks the audio will not connect. ",
      "When that happens the round carries on over the transcript and the interface says so."),
    h("li", {}, "Formats that are normally team events have been collapsed to one speaker a side. The speech times are unchanged."),
  ));

  motion.stagger(frag.children, { step: 40 });
  return frag;
}

// --- topics ---------------------------------------------------------------------

function viewTopics() {
  const frag = h("div");
  const seen = new Set(profile.seen());

  frag.append(h("h2", {}, "The motion bank"));
  frag.append(h("p", { class: "small" },
    `${ALL_TOPICS.length} motions, drawn from the way the activity is run around the world: `,
    "worlds-style motions from the British Parliamentary, World Schools, Australs, United Asians and Pan-African circuits, ",
    "and American-circuit resolutions. A motion you have already had is not drawn again until the bag is empty."));

  const search = h("input", { type: "search", placeholder: "Search motions", "aria-label": "Search motions" });
  const region = h("select", { "aria-label": "Region" }, h("option", { value: "" }, "Everywhere"),
    ...Object.entries(REGIONS).map(([k, v]) => h("option", { value: k }, v)));
  const theme = h("select", { "aria-label": "Theme" }, h("option", { value: "" }, "Any theme"),
    ...Object.entries(THEMES).map(([k, v]) => h("option", { value: k }, v)));
  const count = h("span", { class: "small mono" });
  frag.append(h("div", { class: "filters" }, search, region, theme, count));

  const list = h("div", { class: "topic-list" });
  frag.append(list);

  function draw() {
    const q = search.value.trim().toLowerCase();
    const rows = ALL_TOPICS.filter((t) =>
      (!q || t.text.toLowerCase().includes(q))
      && (!region.value || t.region === region.value)
      && (!theme.value || t.theme === theme.value));
    count.textContent = `${rows.length} shown · ${seen.size} already debated`;
    list.replaceChildren(...rows.slice(0, 400).map((t) =>
      h("div", { class: "topic-row" },
        t.text,
        h("div", { class: "meta" },
          REGIONS[t.region], " · ", THEMES[t.theme], seen.has(t.id) ? " · debated" : ""))));
    if (rows.length > 400) list.append(h("div", { class: "topic-row small" }, `and ${rows.length - 400} more — narrow the filter`));
    if (!rows.length) list.append(h("div", { class: "topic-row small" }, "Nothing matches."));
  }
  search.addEventListener("input", draw);
  region.addEventListener("change", draw);
  theme.addEventListener("change", draw);
  draw();

  motion.stagger(frag.children, { step: 40 });
  return frag;
}

// --- ladder ----------------------------------------------------------------------

function viewLadder() {
  const frag = h("div");
  frag.append(h("h2", {}, "Ranks"));
  frag.append(h("p", { class: "small" },
    "Every league is rated separately. You start at ", START_RATING,
    ", and the first ten rounds in a league move you further than the ones after."));

  const table = h("table", { class: "ladder" },
    h("thead", {}, h("tr", {},
      h("th", {}, "League"), h("th", {}, "Rank"), h("th", {}, "Rating"),
      h("th", {}, "Record"), h("th", {}, "Best"))),
    h("tbody", {}, ...LEAGUES.map((id) => {
      const l = profile.league(id);
      const r = rankOf(l.rating);
      return h("tr", {},
        h("td", {}, FORMATS[id].name),
        h("td", {}, h("span", { class: "row", style: { gap: "8px" } }, rankBadge(r, 24), r.label)),
        h("td", { class: "num" }, String(l.rating)),
        h("td", { class: "num" }, l.rounds ? `${l.wins}-${l.losses}${l.draws ? "-" + l.draws : ""}` : "—"),
        h("td", { class: "num" }, l.rounds ? String(l.best) : "—"));
    })));
  frag.append(table);

  frag.append(h("hr", { class: "rule" }));
  frag.append(h("h3", {}, "The tiers"));
  const scale = h("div", { class: "tier-scale" });
  TIERS.forEach((t, i) => {
    const next = TIERS[i + 1];
    scale.append(h("div", { class: "tier-row" },
      rankBadge({ tier: t, division: t.id === "diamond" ? null : "IV", label: t.name }, 22),
      h("span", {}, t.name),
      h("span", { class: "small mono" }, next ? `${t.floor}–${next.floor - 1}` : `${t.floor}+`)));
  });
  frag.append(scale);
  frag.append(h("p", { class: "small", style: { marginTop: "12px" } },
    "Each tier below Diamond has four divisions, IV up to I. Diamond is undivided and shows the rating itself."));

  frag.append(h("hr", { class: "rule" }));
  const reset = h("button", {
    class: "btn ghost small",
    onclick: () => {
      if (!confirm("Clear your ratings, records and the list of motions you have seen?")) return;
      profile.reset();
      show("ladder", viewLadder);
    },
  }, "Reset everything in this browser");
  frag.append(reset);

  motion.stagger(frag.children, { step: 40 });
  return frag;
}

// --- searching ---------------------------------------------------------------------

async function beginSearch() {
  const f = FORMATS[S.league];
  S.ballot = null; S.result = null; S.opponentRating = null; S.room = null;
  S.link = "connecting"; S.linkNote = null; S.notes = "";

  show("searching", () => viewSearching(f));
  await ensureMic();
  updateSearchMic();

  S.session = new Session({
    id: profile.myId(),
    league: S.league,
    seen: profile.seen(),
    onStatus: onSessionStatus,
    onRoom: onMatched,
    onMessage: onPeerMessage,
    onRemoteStream: (stream) => { remoteAudio.srcObject = stream; remoteAudio.play().catch(() => {}); },
    onLink: onLink,
  });

  try { await S.session.search(); }
  catch (e) { showSearchError(String(e.message || e)); }
}

function viewSearching(f) {
  const dots = h("p", { class: "dots" }, "· · ·");
  const queued = h("p", { class: "small mono" }, "");
  const micLine = h("p", { class: "small" }, "");
  const frag = h("div", { class: "searching" },
    h("h2", {}, `Looking for an opponent in ${f.name}`),
    h("p", { class: "small" }, "You will not be told who they are."),
    dots,
    queued,
    micLine,
    h("div", { style: { marginTop: "22px" } },
      h("button", { class: "btn ghost", onclick: () => { leaveAll(); goHome(); } }, "Cancel")),
  );
  S.ui = { dots, queued, micLine };

  // A three-dot cycle driven by the spring loop rather than a CSS keyframe, so it
  // stops dead when the page is hidden and never drifts out of step with the rest.
  let n = 0;
  S.searchTimer = setInterval(() => {
    n = (n + 1) % 4;
    dots.textContent = "· ".repeat(n).trim() || "·";
    dots.style.opacity = String(0.4 + 0.15 * n);
  }, 420);
  return frag;
}

function updateSearchMic() {
  if (!S.ui.micLine) return;
  S.ui.micLine.textContent = S.stream
    ? "Microphone ready. It stays closed until it is your turn."
    : `No microphone (${S.micError || "declined"}). You can still debate by typing.`;
}

function showSearchError(msg) {
  if (!S.ui.dots) return;
  S.ui.dots.textContent = "";
  S.ui.queued.textContent = "";
  S.ui.micLine.textContent = `Could not reach the lobby: ${msg}`;
}

function onSessionStatus(state, info) {
  if (state === "waiting" && S.ui.queued) {
    const n = info && info.queued ? info.queued : 0;
    S.ui.queued.textContent = n > 1 ? `${n} waiting in this league` : "";
  }
  if (state === "peer-left") onPeerLeft();
}

async function ensureMic() {
  if (S.stream) return S.stream;
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { S.micError = "unsupported"; return null; }
  try {
    S.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    setMic(false);
    S.micError = null;
  } catch (e) {
    S.micError = (e && e.name) || "denied";
  }
  return S.stream;
}

function setMic(on) {
  if (!S.stream) return;
  for (const t of S.stream.getAudioTracks()) t.enabled = Boolean(on);
}

// --- the round -----------------------------------------------------------------------

function onMatched(room) {
  clearInterval(S.searchTimer);
  S.room = room;
  profile.markSeen(room.topic.id);
  S.round = new Round({
    league: room.league,
    side: room.side,
    isHost: room.role === "host",
    send: (m) => S.session.send(m),
    on: onRoundEvent,
  });
  S.session.connect(S.stream);
  show("round", viewRound);
}

function onLink(kind, why) {
  S.link = kind;
  S.linkNote = why || null;
  paintStatus();
  if (S.round && !S.round.started) {
    S.session.send({ t: "hello", rating: profile.league(S.league).rating });
    S.round.start();
  }
}

function onPeerMessage(m) {
  if (m && m.t === "hello") { S.opponentRating = Number(m.rating) || null; return; }
  if (S.round) S.round.handle(m);
}

function onPeerLeft() {
  if (!S.round || S.round.over) return;
  S.round.stop();
  S.round.over = true;
  stopDictation();
  setMic(false);
  const mine = S.room.side;
  const ballot = {
    method: "walkover",
    winner: mine,
    margin: 0,
    forfeit: true,
    walkover: true,
    scores: {},
    rfd: ["Your opponent left the round. Awarded as a walkover."],
    blind: null,
  };
  settleAndShow(ballot);
}

const SVG = "http://www.w3.org/2000/svg";
function svgEl(tag, attrs) {
  const el = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs || {})) el.setAttribute(k, String(v));
  return el;
}

function viewRound() {
  const room = S.room;
  const f = FORMATS[room.league];
  const frag = h("div");

  // motion
  const card = h("div", { class: "motion-card" },
    h("div", { class: "row", style: { justifyContent: "space-between" } },
      h("h3", { style: { margin: 0 } }, f.name),
      h("span", { class: `side-tag side-${room.side}` }, sideName(room.league, room.side))),
    h("p", { class: "motion-text" }, room.topic.text),
    h("div", { class: "motion-meta" },
      h("span", {}, REGIONS[room.topic.region] || "International"),
      h("span", {}, THEMES[room.topic.theme] || ""),
      h("span", {}, `motion #${room.topic.id}`)),
  );
  frag.append(card);

  // clock
  const ringHead = svgEl("circle", { class: "ring-head", cx: 62, cy: 62, r: 54 });
  const ring = svgEl("svg", { viewBox: "0 0 124 124", width: 124, height: 124 });
  ring.append(svgEl("circle", { class: "ring-track", cx: 62, cy: 62, r: 54 }), ringHead);
  const timeText = h("div", { class: "ring-time mono" }, "5:00");
  const timeSub = h("div", { class: "ring-sub" }, "research");
  const ringWrap = h("div", { class: "ring-wrap" }, ring, h("div", { class: "ring-label" }, timeText, timeSub));

  const phaseName = h("p", { class: "phase-name" }, "Research time");
  const phaseWho = h("p", { class: "phase-who" }, "");
  const schedule = h("div", { class: "schedule" },
    ...f.phases.map(() => h("span", {})));

  frag.append(h("div", { class: "panel" },
    h("div", { class: "clockbar" }, ringWrap, h("div", {}, phaseName, phaseWho, schedule))));

  // microphone
  const wave = h("canvas", { class: "wave" });
  const micState = h("span", { class: "mic-state" }, "closed");
  const micRow = h("div", { class: "mic muted" }, icon("micOff", 16), micState, wave);
  frag.append(h("div", { style: { marginTop: "14px" } }, micRow));

  // controls
  const controls = h("div", { class: "row", style: { marginTop: "12px" } });
  frag.append(controls);

  // research pad / transcript
  const pad = h("textarea", {
    class: "pad",
    placeholder: "Your notes. Nobody else can see this, and it is not part of the transcript.",
    oninput: (e) => { S.notes = e.target.value; },
  });
  const padPanel = h("div", { class: "panel", style: { marginTop: "14px" } },
    h("h3", {}, "Scratchpad"), pad);

  const lines = h("div", { class: "transcript" }, h("p", { class: "t-empty" }, "The transcript builds here as the two of you speak."));
  const interim = h("div", { class: "t-line t-interim", style: { display: "none" } },
    h("span", { class: "t-who" }, "you"), h("span", {}, ""));
  const typeBox = h("input", {
    class: "pad", style: { minHeight: "0", height: "40px" },
    placeholder: "Type your speech and press enter",
    onkeydown: (e) => {
      if (e.key !== "Enter") return;
      const v = e.target.value.trim();
      if (!v) return;
      e.target.value = "";
      S.round.addLine(v);
    },
  });
  const typeWrap = h("div", { style: { marginTop: "10px", display: "none" } }, typeBox);
  const transcriptPanel = h("div", { class: "panel", style: { marginTop: "14px", display: "none" } },
    h("h3", {}, "Transcript"), lines, interim, typeWrap);

  frag.append(padPanel, transcriptPanel);

  // status
  const statusDot = h("span", { class: "dot" });
  const statusText = h("span", {}, "connecting to your opponent");
  const leave = h("button", { class: "btn ghost small", onclick: () => { if (confirm("Leave the round?")) { leaveAll(); goHome(); } } }, "Leave");
  frag.append(h("div", { class: "spread", style: { marginTop: "16px" } },
    h("span", { class: "status" }, statusDot, statusText), leave));

  S.ui = {
    ringWrap, timeText, timeSub, phaseName, phaseWho, schedule, micRow, micState,
    controls, padPanel, transcriptPanel, lines, interim, typeWrap, typeBox,
    statusDot, statusText, emptyNote: lines.firstElementChild,
    ring: new motion.Ring(ringHead, { radius: 54 }),
    wave: new motion.Waveform(wave),
  };
  S.ui.wave.start();
  if (S.stream) S.ui.wave.attach(S.stream);

  paintStatus();
  motion.stagger(frag.children, { step: 50, y: 12 });
  return frag;
}

function paintStatus() {
  const { statusDot, statusText } = S.ui;
  if (!statusDot) return;
  statusDot.className = "dot " + (S.link === "p2p" ? "ok" : S.link === "relay" ? "warn" : "");
  statusText.textContent = S.link === "p2p"
    ? "connected, peer to peer"
    : S.link === "relay"
      ? `audio unavailable (${S.linkNote || "no direct path"}) — running on the transcript`
      : "connecting to your opponent";
}

// --- round events ---------------------------------------------------------------------

function onRoundEvent(type, payload) {
  switch (type) {
    case "phase": paintPhase(payload); paintControls(payload); break;
    case "tick": paintTick(payload); break;
    case "prep": case "poi": paintControls(S.round.view()); break;
    case "line": appendLine(payload); break;
    case "done": finish(payload); break;
    case "ballot": onBallot(payload); break;
    default: break;
  }
}

function paintPhase(v) {
  const u = S.ui;
  if (!u.phaseName) return;
  const p = v.phase;
  const room = S.room;

  const owner = p.kind === "speech" ? sideName(room.league, p.who) : null;
  u.phaseName.textContent = owner ? `${p.label} — ${owner}` : p.label;
  u.timeSub.textContent = p.kind === "research" ? "research" : p.kind === "gate" ? "between" : p.kind;

  if (p.kind === "research") u.phaseWho.textContent = "Both microphones are closed. Nobody can hear you.";
  else if (p.kind === "gate") u.phaseWho.textContent = "Take prep, or say you are ready.";
  else if (p.kind === "cross") u.phaseWho.innerHTML = "<span class='floor-mine'>Both microphones are open.</span>";
  else u.phaseWho.innerHTML = v.mine
    ? "<span class='floor-mine'>You have the floor.</span>"
    : "Your opponent has the floor.";

  [...u.schedule.children].forEach((el, i) => {
    el.className = i < v.index ? "done" : i === v.index ? "now" : "";
  });

  const showPad = p.kind === "research";
  if ((u.padPanel.style.display === "none") === showPad) {
    motion.flip([u.padPanel, u.transcriptPanel], () => {
      u.padPanel.style.display = showPad ? "" : "none";
      u.transcriptPanel.style.display = showPad ? "none" : "";
    });
  }

  const live = (p.kind === "speech" || p.kind === "cross") && v.mine;
  setMic(live);
  if (live) startDictation(); else stopDictation();
  u.micRow.className = "mic " + (live ? "live" : "muted");
  u.micState.textContent = live ? "open" : p.kind === "research" ? "closed for research" : "closed";
  u.micRow.replaceChild(icon(live ? "mic" : "micOff", 16), u.micRow.firstChild);
  u.wave.setActive(live);
  u.typeWrap.style.display = live && (!speechSupported || !S.stream) ? "" : "none";
  if (u.typeWrap.style.display === "") u.typeBox.focus();
  if (live) motion.pop(u.micRow, { scale: 1.02 });
}

function paintTick(v) {
  const u = S.ui;
  if (!u.timeText) return;
  u.timeText.textContent = fmtClock(Math.ceil(v.rem));
  u.ring.set(Math.max(0, Math.min(1, v.progress)));
  const urgent = v.rem <= 30 && (v.phase.kind === "speech" || v.phase.kind === "cross");
  u.ringWrap.classList.toggle("urgent", urgent);

  // Repaint the controls only when something about them actually changed: the peer
  // marking ready, a prep bank draining, or the point-of-information window opening.
  const sig = [v.ready.pro, v.ready.con, v.prep.pro, v.prep.con, v.canOfferPoi,
    v.poiOffer ? v.poiOffer.by : "", v.poi ? 1 : 0].join("|");
  if (sig !== u.controlSig) { u.controlSig = sig; paintControls(v); }
}

function paintControls(v) {
  const u = S.ui;
  if (!u.controls) return;
  const f = FORMATS[S.room.league];
  const kids = [];
  const p = v.phase;

  if (p.kind === "research" || p.kind === "gate") {
    const ready = v.ready[S.room.side];
    kids.push(h("button", {
      class: "btn small" + (ready ? " ghost" : ""),
      disabled: ready,
      onclick: () => { S.round.markReady(); paintControls(S.round.view()); },
    }, ready ? "waiting for them" : "Ready", ready ? null : icon("check", 15)));

    if (p.kind === "gate" && f.prepBank > 0 && (!p.prep || p.prep === S.room.side)) {
      const left = v.prep[S.room.side] || 0;
      const label = h("span", { class: "mono" }, fmtClock(left));
      u.prepLabel = label;
      kids.push(h("button", {
        class: "btn ghost small",
        disabled: left < 1,
        onclick: () => S.round.takePrep(),
      }, icon("clock", 15), "Prep +30s · ", label));
    }
  }

  if (f.poi && p.kind === "speech") {
    if (v.poiOffer && p.who === S.room.side) {
      kids.push(h("button", { class: "btn small", onclick: () => S.round.answerPoi(true) }, "Accept point"));
      kids.push(h("button", { class: "btn ghost small", onclick: () => S.round.answerPoi(false) }, "No thank you"));
    } else if (v.canOfferPoi) {
      kids.push(h("button", { class: "btn ghost small", onclick: () => S.round.offerPoi() }, "Point of information"));
    } else if (v.poiOffer && p.who !== S.room.side) {
      kids.push(h("span", { class: "small" }, "point offered"));
    } else if (v.poi) {
      kids.push(h("span", { class: "small floor-mine" }, "point being taken"));
    }
  }

  if (v.poi) kids.push(h("span", { class: "small" }, "both microphones open for the point"));

  u.controls.replaceChildren(...kids.filter(Boolean));
  if (kids.length) motion.stagger(u.controls.children, { step: 30, y: 6 });
}

function appendLine(entry) {
  const u = S.ui;
  if (!u.lines) return;
  if (u.emptyNote && u.emptyNote.parentNode) { u.emptyNote.remove(); u.emptyNote = null; }
  const mine = entry.side === S.room.side;
  const node = h("div", { class: "t-line" },
    h("span", { class: `t-who t-${entry.side}` }, mine ? "you" : "them"),
    h("span", {}, entry.text));
  u.lines.append(node);
  motion.enter(node, { y: 6 });
  u.lines.scrollTop = u.lines.scrollHeight;
}

function setInterim(text) {
  const u = S.ui;
  if (!u.interim) return;
  u.interim.style.display = text ? "" : "none";
  u.interim.lastElementChild.textContent = text;
  if (text) u.lines.scrollTop = u.lines.scrollHeight;
}

function startDictation() {
  if (!speechSupported || !S.stream) return;
  if (!S.dictation) {
    S.dictation = new Dictation({
      onFinal: (t) => { if (S.round && !S.round.over) S.round.addLine(t); },
      onInterim: setInterim,
      onError: (e) => {
        if (!S.ui.typeWrap) return;
        S.ui.typeWrap.style.display = "";
        S.ui.statusText.textContent = `speech recognition stopped (${e}) — type instead`;
      },
    });
  }
  S.dictation.start();
}

function stopDictation() {
  if (S.dictation) S.dictation.stop();
  setInterim("");
}

// --- the ballot -------------------------------------------------------------------------

async function finish(transcript) {
  stopDictation();
  setMic(false);
  if (S.ui.wave) S.ui.wave.setActive(false);
  if (S.ballot) return;

  if (S.ui.phaseName) {
    S.ui.phaseName.textContent = "Reading the transcript";
    S.ui.phaseWho.textContent = "Sides are anonymised before anything is scored.";
    S.ui.controls.replaceChildren();
  }

  if (S.round.isHost) {
    const ballot = await requestBallot(transcript);
    try { S.session.send({ t: "ballot", ballot }); } catch {}
    settleAndShow(ballot);
  } else {
    S.judgeTimer = setTimeout(() => {
      if (S.ballot) return;
      settleAndShow(localJudge({ topic: S.room.topic.text, formatId: S.room.league, transcript }));
    }, 9000);
  }
}

async function requestBallot(transcript) {
  const body = { topic: S.room.topic.text, formatId: S.room.league, transcript };
  try {
    const r = await fetch("/api/judge", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
    });
    if (r.ok) {
      const j = await r.json();
      if (j && j.ballot) return j.ballot;
    }
  } catch { /* fall through */ }
  return localJudge(body);
}

function onBallot(ballot) {
  clearTimeout(S.judgeTimer);
  settleAndShow(ballot);
}

function settleAndShow(ballot) {
  if (S.ballot) return;
  S.ballot = ballot;
  const mine = S.room.side;
  const score = ballot.winner === "draw" ? 0.5 : ballot.winner === mine ? 1 : 0;
  S.result = profile.record(S.room.league, score, S.opponentRating);
  show("ballot", viewBallot);
}

function viewBallot() {
  const ballot = S.ballot;
  const res = S.result;
  const room = S.room;
  const mine = room.side;
  const theirs = otherSide(mine);
  const frag = h("div");

  const won = ballot.winner === mine;
  const drew = ballot.winner === "draw";
  frag.append(h("div", { class: "verdict" },
    h("p", { class: "verdict-line " + (drew ? "" : won ? "verdict-won" : "verdict-lost") },
      drew ? "Draw." : won ? "You won." : "You lost."),
    h("p", { class: "small" },
      ballot.walkover ? "Walkover."
        : ballot.forfeit ? "Forfeit."
          : `${sideName(room.league, ballot.winner)} by ${ballot.margin.toFixed(2)} of ten.`)));

  frag.append(h("p", { class: "small", style: { marginTop: "14px" } }, room.topic.text));

  // criteria
  if (ballot.scores && ballot.scores[mine] && ballot.scores[mine].criteria) {
    const box = h("div", { class: "criteria" });
    const labels = {
      clash: "Clash and refutation", evidence: "Evidence and warranting",
      structure: "Structure and signposting", response: "Responsiveness",
      weighing: "Weighing and impact comparison", delivery: "Delivery and use of time",
    };
    const bars = [];
    for (const [key, label] of Object.entries(labels)) {
      const a = ballot.scores[mine].criteria[key] ?? 0;
      const b = ballot.scores[theirs].criteria[key] ?? 0;
      const mineFill = h("span", { class: "bar-fill" });
      const theirFill = h("span", { class: "bar-fill" });
      bars.push([mineFill, a], [theirFill, b]);
      box.append(h("div", { class: "crit" },
        h("div", { class: "crit-head" },
          h("span", {}, label),
          h("span", { class: "mono" }, `${a.toFixed(1)} · ${b.toFixed(1)}`)),
        h("div", { class: "twin" },
          h("span", { class: `bar ${mine}` }, mineFill),
          h("span", { class: `bar ${theirs} flip` }, theirFill))));
    }
    frag.append(h("h3", { style: { marginTop: "20px" } }, `You · them`), box);

    requestAnimationFrame(() => {
      bars.forEach(([fill, value], i) => {
        const pct = Math.max(0, Math.min(100, value * 10));
        const flipped = fill.parentElement.classList.contains("flip");
        setTimeout(() => {
          motion.spring(0, pct, { stiffness: 140, damping: 22 }, (p) => {
            if (flipped) fill.style.inset = `0 0 0 ${100 - p}%`;
            else fill.style.inset = `0 ${100 - p}% 0 0`;
          });
        }, i * 35);
      });
    });

    const s = ballot.scores[mine].stats || {};
    const t = ballot.scores[theirs].stats || {};
    frag.append(h("p", { class: "small mono", style: { marginTop: "12px" } },
      `words ${s.words}/${t.words} · refutations ${s.refutations}/${t.refutations} · `
      + `answered ${s.answered}%/${t.answered}% · time used ${s.timeUsed}%/${t.timeUsed}%`));
  }

  // reason for decision
  frag.append(h("h3", { style: { marginTop: "22px" } }, "Reason for decision"));
  frag.append(h("ul", { class: "rfd" }, ...(ballot.rfd || []).map((l) => h("li", {}, l))));

  // rating
  if (res) {
    const badgeBefore = rankBadge(res.beforeRank, 30);
    const badgeAfter = rankBadge(res.afterRank, 34);
    const num = h("span", { class: "rating-num mono" }, String(res.before.rating));
    const delta = h("span", { class: "rating-delta " + (res.delta > 0 ? "up" : res.delta < 0 ? "down" : "") },
      `${res.delta > 0 ? "+" : ""}${res.delta}`);
    const note = h("p", { class: "progress-note" },
      res.promoted ? `Promoted to ${res.afterRank.label}.`
        : res.demoted ? `Down to ${res.afterRank.label}.`
          : res.afterRank.next ? `${res.afterRank.next - res.after.rating} to ${res.afterRank.label.split(" ")[0]} ${nextDivision(res.afterRank)}.`
            : "Top of the ladder.");

    frag.append(h("hr", { class: "rule" }));
    frag.append(h("div", { class: "rating-move" },
      res.promoted || res.demoted ? badgeBefore : badgeAfter,
      h("div", {}, h("div", {}, num, " ", delta),
        h("div", { class: "small" }, `${FORMATS[room.league].name} · ${res.afterRank.label}`), note),
      res.promoted || res.demoted ? badgeAfter : null));

    requestAnimationFrame(() => {
      motion.rollNumber(num, res.before.rating, res.after.rating);
      if (res.promoted) setTimeout(() => motion.pop(badgeAfter, { scale: 1.3 }), 500);
    });
  }

  // transcript
  const full = h("details", { style: { marginTop: "18px" } },
    h("summary", { class: "small" }, "Read the transcript"),
    h("div", { class: "transcript", style: { marginTop: "10px" } },
      ...(S.round ? S.round.lines : []).map((l) => h("div", { class: "t-line" },
        h("span", { class: `t-who t-${l.side}` }, l.side === mine ? "you" : "them"),
        h("span", {}, l.text)))));
  frag.append(full);

  frag.append(h("div", { class: "row", style: { marginTop: "22px" } },
    h("button", { class: "btn", onclick: () => { leaveAll(); beginSearch(); } }, "Next round", icon("next", 16)),
    h("button", { class: "btn ghost", onclick: () => { leaveAll(); goHome(); } }, "Home")));

  motion.stagger(frag.children, { step: 45, y: 10 });
  return frag;
}

function nextDivision(rank) {
  const order = ["IV", "III", "II", "I"];
  const i = order.indexOf(rank.division);
  return i === order.length - 1 ? "" : order[i + 1];
}

// --- shell -------------------------------------------------------------------------------

function leaveAll() {
  clearInterval(S.searchTimer);
  clearTimeout(S.judgeTimer);
  stopDictation();
  setMic(false);
  if (S.ui.wave) { S.ui.wave.stop(); S.ui.wave = null; }
  if (S.round) { S.round.stop(); S.round = null; }
  if (S.session) { S.session.leave(); S.session = null; }
  remoteAudio.srcObject = null;
  S.ui = {};
}

function goHome() { show("home", viewHome); }

document.getElementById("home-link").addEventListener("click", () => { leaveAll(); goHome(); });
for (const b of document.querySelectorAll("[data-nav]")) {
  b.addEventListener("click", () => {
    const n = b.dataset.nav;
    if (S.round && !S.round.over && !confirm("Leave the round?")) return;
    leaveAll();
    if (n === "topics") show("topics", viewTopics);
    else if (n === "ladder") show("ladder", viewLadder);
    else show("about", viewAbout);
  });
}

window.addEventListener("beforeunload", () => { if (S.session) S.session.leave(); });

goHome();

lobbyStats().then((s) => {
  const el = document.getElementById("foot-stats");
  if (!el || !s) return;
  const waiting = (s.leagues || []).reduce((n, l) => n + (l.waiting || 0), 0);
  el.textContent = `${s.topics} motions in the bank · ${waiting} waiting to debate`;
});
