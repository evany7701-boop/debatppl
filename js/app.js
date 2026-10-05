// debat ppl.

import { h, icon, rankBadge } from "/js/ui.js";
import * as motion from "/js/motion.js";
import { FORMATS, LEAGUES, fmtClock } from "/lib/formats.mjs";
import { ALL_TOPICS, REGIONS, THEMES } from "/lib/topics.mjs";
import { TIERS, rankOf, START_RATING, applyResult } from "/lib/ranks.mjs";
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

  frag.append(h("div", { class: "hero" },
    h("h1", {}, "Debate a stranger."),
    h("p", {}, "You are put in a round with someone you will never meet. A motion appears, "
      + "you both get five minutes, and then you argue it on the clock.")));

  frag.append(h("div", { class: "section-label" },
    "Choose a league", h("span", {}, "each one is rated separately")));

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
      },
    },
      h("div", {},
        h("div", { class: "league-name" }, f.name),
        h("div", { class: "league-sub" }, f.tagline)),
      h("div", { class: "league-rank" },
        rankBadge(r, 18),
        h("b", {}, l.rounds ? r.label : "unrated"),
        l.rounds ? h("span", { class: "mono" }, `${l.rating} · ${l.wins}-${l.losses}`) : null),
    );
    list.append(btn);
  }
  frag.append(list);

  frag.append(h("button", { class: "btn big", onclick: beginSearch },
    "Start a round", icon("next", 17)));

  frag.append(h("p", { class: "small", style: { marginTop: "14px", maxWidth: "58ch" } },
    "Your microphone stays closed until it is your turn, and closed entirely during research. "
    + "At the end the transcript is judged with the sides anonymised."));

  if (!speechSupported) {
    frag.append(h("div", { class: "notice" },
      "This browser has no speech recognition, so your speeches will be typed instead of spoken. "
      + "Chrome, Edge or Safari will transcribe you."));
  }

  motion.stagger(frag.children, { step: 55, y: 12 });
  return frag;
}


// --- preview -------------------------------------------------------------------
// A design harness at #/preview. The round and the ballot are the two screens that
// cannot be looked at without two people and a working lobby, so this renders them
// against canned data. It touches nothing real: no queue, no peer connection, and
// no write to your rating.

const SAMPLE_PRO = "My first contention is that the college distorts the value of a vote. According to a 2020 "
  + "study a vote in Wyoming is worth 3.6 times a vote in California, because the floor of three electors is "
  + "fixed regardless of population. They say the college protects small states. That is false, and here is "
  + "why: the data shows campaign visits concentrate in six states, which means forty four states are ignored "
  + "entirely. Even if you buy their claim about federalism, the magnitude of disenfranchising ninety million "
  + "voters outweighs it, and it is irreversible in a way their harm is not. Second, the mechanism they "
  + "describe does not follow. Their evidence concerns the Senate, not the presidency. To conclude, on balance "
  + "the harm comes first on both probability and scope.";

const SAMPLE_CON = "I want to respond directly to their first contention. The 3.6 figure is real but it measures "
  + "electors per head, not influence, and the research they cite concedes that in its own limitations section. "
  + "My case is that the college forces coalitions to be geographically broad. Because a candidate cannot win on "
  + "turnout in three cities alone, they have to build support across regions, which means rural interests get a "
  + "hearing they would otherwise lose. On their swing state point: that is a feature of winner-take-all "
  + "allocation at state level, not of the college itself, so their link is to the wrong thing. Finally, on "
  + "weighing, their impact is reversible through a compact between states; the instability of a disputed "
  + "national recount is not.";

function previewRoom(league) {
  const pool = ALL_TOPICS.filter((t) => t.style === (league === "ld" || league === "pf" ? "res" : "thw"));
  return {
    roomId: "preview",
    league,
    topic: pool[Math.floor(Math.random() * pool.length)],
    side: "pro",
    role: "host",
    createdAt: Date.now(),
    preview: true,
  };
}

function viewPreview() {
  const frag = h("div", { class: "prose" });
  frag.append(h("h2", {}, "Preview"));
  frag.append(h("p", { class: "small" },
    "A harness for looking at the two screens that normally need an opponent. "
    + "Nothing here queues you, connects to anyone, or changes your rating."));

  const pick = h("select", { "aria-label": "League" },
    ...LEAGUES.map((id) => h("option", { value: id, selected: id === S.league }, FORMATS[id].name)));

  frag.append(h("div", { class: "filters" }, pick,
    h("button", {
      class: "btn small",
      onclick: () => startPreviewRound(pick.value),
    }, "Round chrome"),
    h("button", {
      class: "btn ghost small",
      onclick: () => showPreviewBallot(pick.value),
    }, "Sample ballot")));

  frag.append(h("p", { class: "small" },
    "The round preview runs the real clock on the real speech times, so the first thing "
    + "you will see is the five minute research block. Press Ready to move on."));

  motion.stagger(frag.children, { step: 35 });
  return frag;
}

function startPreviewRound(league) {
  leaveAll();
  S.room = previewRoom(league);
  S.league = league;
  S.link = "p2p";
  S.round = new Round({
    league, side: "pro", isHost: true,
    solo: true,                           // the gates must not wait for a second person
    send: () => {},                       // nobody is listening, by design
    on: onRoundEvent,
  });
  show("round", viewRound);
  ensureMic().then(() => { if (S.ui.wave && S.stream) S.ui.wave.attach(S.stream); });
  S.round.start();
}

function showPreviewBallot(league) {
  leaveAll();
  S.room = previewRoom(league);
  S.league = league;
  const transcript = [
    { phase: "p1", label: "Constructive", kind: "speech", side: "pro", allotted: 240, spoken: 214, text: SAMPLE_PRO },
    { phase: "c1", label: "Constructive", kind: "speech", side: "con", allotted: 240, spoken: 201, text: SAMPLE_CON },
  ];
  S.ballot = localJudge({ topic: S.room.topic.text, formatId: league, transcript });
  S.round = { lines: transcript.map((t) => ({ side: t.side, text: t.text })) };

  // A rating move computed the same way a real one is, but never written down.
  const before = profile.league(league);
  const { league: after, delta } = applyResult(before, before.rating + 40,
    S.ballot.winner === "draw" ? 0.5 : S.ballot.winner === "pro" ? 1 : 0);
  S.result = {
    before, after, delta,
    beforeRank: rankOf(before.rating), afterRank: rankOf(after.rating),
    promoted: false, demoted: false,
  };
  show("ballot", viewBallot);
}

// --- privacy and terms -------------------------------------------------------

function viewPrivacy() {
  const frag = h("div", { class: "prose" });
  frag.append(h("h2", {}, "Privacy"));
  frag.append(h("p", { class: "small" }, "Short version: there is no account, so there is almost nothing to collect."));

  frag.append(h("h3", {}, "What stays in your browser"));
  frag.append(h("ul", {},
    h("li", {}, "A random id, generated on your first visit. It is not linked to anything about you and it never leaves your device except as the label on your place in the queue."),
    h("li", {}, "Your rating, record and rank in each league."),
    h("li", {}, "The ids of motions you have already debated, so you are not given them again."),
    h("li", {}, "Clearing this site's data erases all of it, permanently, and makes you a new person here.")));

  frag.append(h("h3", {}, "What the server sees"));
  frag.append(h("ul", {},
    h("li", {}, "While you are waiting or connecting: your random id, the league you chose, and the WebRTC handshake messages being passed to your opponent. These are held in memory for the length of the round and are not written to a database."),
    h("li", {}, "When the round ends, the transcript is sent once to the judging endpoint to produce the ballot. It is scored and discarded — it is not stored, logged or used to train anything."),
    h("li", {}, "Your hosting provider keeps ordinary web request logs, including IP addresses, as every web host does.")));

  frag.append(h("h3", {}, "Your voice"));
  frag.append(h("ul", {},
    h("li", {}, "Audio goes directly between the two browsers. It is not recorded and it does not pass through this server."),
    h("li", {}, "Because the connection is direct, the person you are debating can see your IP address, and you can see theirs. "
      + "That is true of every peer-to-peer call, including the ones that do not tell you. An IP address is roughly a city and an "
      + "internet provider, not a street address, but if that is not acceptable to you, do not use this."),
    h("li", {}, "Speech recognition is the browser's own. In Chrome and Edge that feature sends audio to Google's recognition service under Google's terms; in Safari it is handled by Apple. That is the browser's behaviour, not this site's, and it is the same engine any dictation box on the web uses."),
    h("li", {}, "The scratchpad during research is never sent anywhere.")));

  frag.append(h("h3", {}, "No tracking"));
  frag.append(h("p", { class: "small" }, "No analytics, no advertising, no third-party scripts, no cookies. The page loads nothing from any domain other than its own."));

  frag.append(h("h3", {}, "Children"));
  frag.append(h("p", { class: "small" }, "This is a live, unmoderated audio conversation with a stranger. It is not intended for under-13s, and under-18s should have a parent's permission."));

  motion.stagger(frag.children, { step: 30 });
  return frag;
}

function viewTerms() {
  const frag = h("div", { class: "prose" });
  frag.append(h("h2", {}, "Terms"));
  frag.append(h("p", { class: "small" }, "Plain terms for a free, unmoderated site run as a side project."));

  frag.append(h("h3", {}, "What this is"));
  frag.append(h("p", { class: "small" }, "A free service that pairs two strangers for a debate round. It is provided as it is, with no guarantee that it works, stays available, or keeps your rating."));

  frag.append(h("h3", {}, "You are talking to a stranger"));
  frag.append(h("ul", {},
    h("li", {}, "Rounds are live and nobody is screening them. You may be matched with someone who is rude, offensive, or not debating in good faith."),
    h("li", {}, "Leave any round you are not comfortable in. Leaving is always available and costs you nothing but the round."),
    h("li", {}, "Do not share anything that identifies you — your name, your school, where you live, or any way to contact you."),
    h("li", {}, "Recording the other person without telling them may be illegal where you or they live. This site does not record anyone.")));

  frag.append(h("h3", {}, "What you agree not to do"));
  frag.append(h("ul", {},
    h("li", {}, "Harass, threaten, or abuse the person you are matched with."),
    h("li", {}, "Use the round for anything sexual, or for anything involving a minor."),
    h("li", {}, "Attempt to identify, follow or contact an opponent outside the round."),
    h("li", {}, "Automate, script or flood the matchmaking endpoint, or arrange rounds with someone you know in order to inflate a rating.")));

  frag.append(h("h3", {}, "Ratings and ballots"));
  frag.append(h("p", { class: "small" }, "The ballot is produced by a rubric that counts features of the transcript. It is not a qualified judge and it will sometimes be wrong. Ratings are stored only in your browser and carry no standing anywhere, in any real competition."));

  frag.append(h("h3", {}, "Liability"));
  frag.append(h("p", { class: "small" }, "To the extent the law allows, this site is provided without warranty of any kind, and whoever runs it is not liable for anything that happens in or because of a round. If you do not accept that, do not use it."));

  motion.stagger(frag.children, { step: 30 });
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
    ["The round runs itself", "Speeches follow the published times for the format. Only the speaker's microphone is open and the app enforces it. There are thirty seconds between speeches, which either of you can cut short by pressing Ready, and nobody can add time. In World Schools and British Parliamentary you can offer points of information."],
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
  // Wait for the previous round's leave to land first. Without this, "Next round"
  // can issue find() and leave() concurrently and the leave deletes the queue
  // entry the find just created, leaving you waiting forever.
  if (S.leaving) { try { await S.leaving; } catch { /* nothing to do */ } S.leaving = null; }

  const f = FORMATS[S.league];
  S.ballot = null; S.result = null; S.opponentRating = null; S.room = null;
  S.link = "connecting"; S.linkNote = null; S.notes = "";

  S.searchStarted = Date.now();
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
  catch (e) { showSearchError(String(e.message || e)); return; }

  // Nobody is coming. Say so plainly rather than spinning for ever.
  S.giveUpTimer = setTimeout(giveUpSearch, QUEUE_PATIENCE);
}

const QUEUE_PATIENCE = 60000;

function giveUpSearch() {
  if (S.room) return;
  leaveAll();
  show("nobody", viewNobody);
}

function viewAbandoned() {
  const frag = h("div", { class: "searching" },
    h("h2", {}, "Your opponent left before the round started"),
    h("p", { class: "small" },
      "Nothing was said, so nothing was scored and no rating moved."),
    h("div", { class: "row", style: { marginTop: "24px", justifyContent: "center" } },
      h("button", { class: "btn", onclick: beginSearch }, "Find someone else", icon("next", 16)),
      h("button", { class: "btn ghost", onclick: () => navigate("home") }, "Home")));
  motion.stagger(frag.children, { step: 60, y: 10 });
  return frag;
}

function viewNobody() {
  const frag = h("div", { class: "searching" },
    h("h2", {}, "sorry we could not find you a user to debate with :("),
    h("p", { class: "small" },
      `Nobody else was in the ${FORMATS[S.league].name} queue for a minute. `
      + "It is quiet rather than broken — try again, or try a different league."),
    h("div", { class: "row", style: { marginTop: "24px", justifyContent: "center" } },
      h("button", { class: "btn", onclick: beginSearch }, "Try again", icon("next", 16)),
      h("button", { class: "btn ghost", onclick: () => navigate("home") }, "Pick another league")));
  motion.stagger(frag.children, { step: 60, y: 10 });
  return frag;
}

function viewSearching(f) {
  const dots = h("div", { class: "dots" });
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
  S.stopWave = motion.dotWave(dots, { count: 3, amp: 8, size: 9, speed: 2.5, gap: 11 });
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
  if (S.stopWave) { S.stopWave(); S.stopWave = null; }
  S.ui.dots.replaceChildren();
  S.ui.queued.textContent = "";
  S.ui.micLine.textContent = `Could not reach the lobby: ${msg}`;
}

function onSessionStatus(state, info) {
  if (state === "waiting" && S.ui.queued) {
    const n = info && info.queued ? info.queued : 0;
    const left = Math.max(0, Math.ceil((QUEUE_PATIENCE - (Date.now() - (S.searchStarted || 0))) / 1000));
    S.ui.queued.textContent = [
      n > 1 ? `${n} waiting in this league` : "",
      left ? `giving up in ${left}s` : "",
    ].filter(Boolean).join(" · ");
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
  clearTimeout(S.giveUpTimer);
  if (S.stopWave) { S.stopWave(); S.stopWave = null; }
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

  // Nobody has spoken yet, so there is nothing to award and nothing to lose. A
  // dropped connection in the first minute should not move anyone's rating.
  const spoken = S.round.lines && S.round.lines.length;
  if (!spoken) {
    leaveAll();
    show("nobody", () => viewAbandoned());
    return;
  }

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
  else if (p.kind === "gate") u.phaseWho.textContent = "Thirty seconds. Press Ready when you both are.";
  else if (p.kind === "cross") u.phaseWho.replaceChildren(h("span", { class: "floor-mine" }, "Both microphones are open."));
  else if (v.mine) u.phaseWho.replaceChildren(h("span", { class: "floor-mine" }, "You have the floor."));
  else u.phaseWho.textContent = "Your opponent has the floor.";

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
  const sig = [v.ready.pro, v.ready.con, v.canOfferPoi,
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
      onclick: () => { S.round.markReady(); paintControls(S.round.view()); },
    }, ready ? "Cancel ready" : "Ready", ready ? icon("close", 15) : icon("check", 15)));
    if (ready && !v.ready[otherSide(S.room.side)]) {
      kids.push(h("span", { class: "small" }, "waiting for your opponent"));
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
    const spin = motion.spinner(20);
    S.judgeSpinner = spin;
    S.ui.controls.replaceChildren(h("span", { class: "judging" }, spin,
      h("span", {}, S.round.isHost ? "scoring the round" : "waiting for the ballot")));
    if (S.ui.ringWrap) {
      S.ui.ringWrap.classList.remove("urgent");
      S.ui.timeText.textContent = "";
      S.ui.timeSub.textContent = "judging";
      const big = motion.spinner(56, 3);
      S.ui.bigSpinner = big;
      S.ui.ringWrap.querySelector(".ring-label").replaceChildren(big);
    }
  }

  // Both sides ask for their own ballot. Letting the host compute it and send it
  // over would mean trusting the other player to mark the round.
  settleAndShow(await requestBallot(transcript));
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

function settleAndShow(ballot) {
  if (S.ballot) return;
  if (S.judgeSpinner && S.judgeSpinner.stop) S.judgeSpinner.stop();
  if (S.ui.bigSpinner && S.ui.bigSpinner.stop) S.ui.bigSpinner.stop();
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

  // Who decided this, and whether the other judge agreed.
  const byModel = ballot.source === "model";
  frag.append(h("p", { class: "small judged" },
    byModel
      ? `Judged by ${String(ballot.method || "").replace(/^model:/, "")}, reading the transcript with the sides anonymised.`
      : ballot.walkover ? "No ballot: the round did not finish."
        : ballot.degraded
          ? "The model judge could not be reached, so this round was scored by the rubric."
          : "Scored by the rubric. Sides were anonymised before anything was measured.",
    ballot.cross ? " " + ballot.cross.note : ""));

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

  // reason for decision, in this league's own names for the sides
  const rename = (line) => line
    .replace(/Proposition/g, sideName(room.league, "pro"))
    .replace(/Opposition/g, sideName(room.league, "con"));
  frag.append(h("h3", { style: { marginTop: "22px" } }, "Reason for decision"));
  frag.append(h("ul", { class: "rfd" }, ...(ballot.rfd || []).map((l) => h("li", {}, rename(l)))));

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
  clearTimeout(S.giveUpTimer);
  if (S.stopWave) { S.stopWave(); S.stopWave = null; }
  for (const k of ["judgeSpinner", "bigSpinner"]) {
    if (S[k] && S[k].stop) S[k].stop();
    if (S.ui && S.ui[k] && S.ui[k].stop) S.ui[k].stop();
    S[k] = null;
  }
  stopDictation();
  setMic(false);
  if (S.ui.wave) { S.ui.wave.stop(); S.ui.wave = null; }
  if (S.round) { if (S.round.stop) S.round.stop(); S.round = null; }
  if (S.session) { S.leaving = S.session.leave(); S.session = null; }
  remoteAudio.srcObject = null;
  S.ui = {};
}

function goHome() { route("home"); }

const PAGES = {
  "": viewHome,
  home: viewHome,
  topics: viewTopics,
  ladder: viewLadder,
  about: viewAbout,
  privacy: viewPrivacy,
  terms: viewTerms,
  preview: viewPreview,
};

function route(name, { push = true } = {}) {
  const build = PAGES[name] || viewHome;
  const key = PAGES[name] ? name : "home";
  if (push) {
    const hash = key === "home" ? "#/" : `#/${key}`;
    if (location.hash !== hash) history.pushState(null, "", hash);
  }
  show(key, build);
}

function navigate(name) {
  if (S.round && !S.round.over && !confirm("Leave the round?")) return;
  leaveAll();
  route(name);
}

document.getElementById("home-link").addEventListener("click", () => navigate("home"));
for (const b of document.querySelectorAll("[data-nav]")) {
  b.addEventListener("click", () => navigate(b.dataset.nav));
}

// Back and forward should work on the reading pages. A round is not a page: if you
// are mid-round the history move is honoured but the round is torn down first.
window.addEventListener("popstate", () => {
  const name = (location.hash || "").replace(/^#\/?/, "");
  if (S.round && !S.round.over) leaveAll();
  if (S.view === "round" || S.view === "searching" || S.view === "ballot") leaveAll();
  route(name, { push: false });
});

window.addEventListener("beforeunload", () => { if (S.session) S.session.leave(); });

route((location.hash || "").replace(/^#\/?/, ""), { push: false });

lobbyStats().then((s) => {
  const el = document.getElementById("foot-stats");
  if (!el || !s) return;
  const waiting = (s.leagues || []).reduce((n, l) => n + (l.waiting || 0), 0);
  el.textContent = `${s.topics} motions in the bank · ${waiting} waiting to debate`;
});
