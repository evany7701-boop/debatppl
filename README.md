# debat ppl

Omegle, for speech and debate.

No account and no lobby. You press one button, you are put in a round with a stranger,
you get a motion and five minutes, and then you argue. Your microphone opens only when
it is your turn. At the end a blind ballot reads the transcript and your rating in that
league moves.

**Live:** https://debatppl.vercel.app

---

## The round

1. **Pick a league.** Each league is a real debate format and keeps its own rating.
2. **Matched, not introduced.** You get the motion and your side. No name, no face, no
   profile — theirs or yours.
3. **Five minutes of research.** Both microphones are closed. There is a scratchpad only
   you can see.
4. **The round runs on the real speech times.** Only the speaker's microphone is open and
   the app enforces it by disabling the outbound audio track. Prep comes out of your own
   bank, thirty seconds at a time. In World Schools and British Parliamentary you can
   offer points of information, which open both microphones for fifteen seconds.
5. **Your speech becomes a transcript** through the browser's own speech recognition.
   Nothing is uploaded to transcribe it.
6. **A ballot**, with the criteria, the numbers behind them, and a reason for decision.

## Leagues

| League | Speech times | Prep bank | Points of information |
| --- | --- | --- | --- |
| Spar | 2 / 2 / cross 1:30 / 1:30 / 1:30 / 1 / 1 | 1:00 | — |
| Public Forum | 4 / 4 / cross 3 / 4 / 4 / cross 3 / 3 / 3 / grand cross 3 / 2 / 2 | 3:00 | — |
| Lincoln–Douglas | 6 / cx 3 / 7 / cx 3 / 4 / 6 / 3 | 4:00 | — |
| World Schools | 6 / 6 / 6 / 6 / reply 4 / reply 4 | 2:00 | yes |
| British Parliamentary | 7 / 7 / 7 / 7 | — | yes |

Lincoln–Douglas and Public Forum use the published NSDA times. World Schools, British
Parliamentary and the team halves of Public Forum are normally more than one speaker a
side; here they are collapsed onto one, with the speech times left alone. Every format
gives both sides exactly the same amount of speaking time, which the test page checks.

## Ranks

Elo from 1000, K=32 for your first ten rounds in a league and 20 after.

```
Copper  <900 · Bronze 900 · Silver 1100 · Gold 1300 · Platinum 1500 · Diamond 1700+
```

Four divisions, IV up to I, inside each tier. Diamond is undivided and shows the rating.
Each league is rated separately, so Diamond at Spar says nothing about your Lincoln–Douglas.

## The ballot, and why it is blind

`lib/rubric.mjs` is deterministic and runs identically in the browser and on the server,
so both debaters see the same result.

Before anything is measured the sides are relabelled Speaker A and Speaker B under a
permutation seeded by a hash of the words alone. Nothing downstream is handed the side,
the id, or who joined first.

| Criterion | Weight |
| --- | --- |
| Clash and refutation | 25 |
| Evidence and warranting | 20 |
| Structure and signposting | 15 |
| Responsiveness | 15 |
| Weighing and impact comparison | 15 |
| Delivery and use of time | 10 |

Deductions for recycling your own material, for attacking the person, and for drifting
off the motion. Every marker is counted per hundred words, so talking more is not the
same as arguing better — there is a test for exactly that. Each criterion is an
antisymmetric function of the pair, so swapping the two transcripts swaps the ballot
exactly; there is a test for that too.

**There is no model in this build and no API key anywhere in it.** `POST /api/judge` is
the seam: it returns the rubric ballot today, and a model-written ballot would replace
the body of that one function without the client changing. When that happens the
transcript should be blinded with `blind()` before it reaches the model, sent as Speaker
A and Speaker B, and mapped back afterwards — the same discipline the rubric follows.

## Motions

422 of them in `lib/topics.mjs`, tagged by region and theme: worlds-style "This House…"
motions of the kind run at WUDC, EUDC, Australs, UADC, WSDC, All-Asians and the
Pan-African circuits, plus American-circuit "Resolved:" resolutions.

Repetition is blocked twice over. The server keeps a ring buffer of the last 240 motions
it has served to anyone, and each client sends the ids it has already had so the server
can exclude them. The bag only resets once you personally have exhausted it.

## Running it

```
npx vercel dev          # the api functions need a node runtime
```

Static-only preview, enough for the interface and the test page but not matchmaking:

```
python3 -m http.server 8731
```

`/tests/selfcheck.html` runs the whole suite in the browser — motion bank integrity,
format timing balance, rank boundaries, Elo behaviour, and the judge's bias tests.

## How it is built

No framework, no build step, no dependencies.

```
index.html          the shell
css/app.css         the whole stylesheet
js/motion.js        spring integrator, FLIP, audio-reactive waveform
js/net.js           matchmaking client, WebRTC, relay fallback
js/round.js         the phase engine, host authoritative
js/speech.js        Web Speech API wrapper
js/app.js           views
lib/topics.mjs      the motion bank          \
lib/formats.mjs     the formats               |  shared by the browser
lib/ranks.mjs       elo and tiers             |  and the functions
lib/rubric.mjs      the ballot               /
lib/store.mjs       lobby state
api/lobby.js        matchmaking and signal relay
api/judge.js        the ballot endpoint
```

Audio is peer to peer over public STUN. The server pairs the two of you, hands over the
same motion, passes the WebRTC handshake, and then stops carrying anything that matters.

Animations are a spring integrator rather than CSS transitions, and rather than React:
the app is a no-build static deploy and a runtime React dependency would buy nothing
here. Everything is behind `prefers-reduced-motion`.

## What is not real yet

- **The judge is a rubric, not a model.** It is a good rubric and it is honest about the
  numbers, but it reads markers, not arguments.
- **Ratings live in your browser.** No account means no global leaderboard, and nothing
  stops someone clearing their storage to reset.
- **Lobby state is in the function's memory.** No credentials are needed to run this,
  which is the point, but two players only match if their requests reach the same warm
  instance. Setting `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` (or Vercel
  KV's `KV_REST_API_URL` / `KV_REST_API_TOKEN`) switches `lib/store.mjs` to Redis with no
  other change.
- **No TURN server**, because TURN needs credentials. On restrictive networks audio will
  not connect; the round then runs on the transcript and the interface says so.
- **Leaving mid-round is a walkover** for whoever stayed. Two people who know each other
  could farm that.
- **Firefox has no speech recognition.** It falls back to typing.

## Preview

`#/preview` renders the round chrome and a sample ballot against canned data —
the two screens that otherwise need two people and a live lobby to look at. It does
not queue you, connect to anyone, or write to your rating.

## Security

What was looked for, and what was done about it.

- **A player id is a bearer token.** It is the only thing identifying you to the lobby,
  so it is 128 bits from the CSPRNG, and the relay no longer stamps forwarded frames
  with the sender's id — the person you are debating never learns it. Before that fix
  they could have drained your mailbox, taken your room or dropped you from the queue.
- **The other player cannot mark the round.** Both clients ask `/api/judge` for their
  own ballot and a ballot arriving over the data channel is ignored outright. A patched
  client can no longer tell you that you lost.
- **Nothing from the wire becomes markup.** The DOM helper has no way to pass HTML
  through it; everything that is not an element is appended as a text node, and there is
  no `innerHTML` anywhere in the codebase. A line of transcript is text wherever it is
  rendered.
- **Content Security Policy** is `default-src 'self'` with `script-src 'self'`, no
  `unsafe-inline` and no `unsafe-eval`, plus `object-src 'none'`, `base-uri 'self'` and
  `frame-ancestors 'none'`. There is no inline script or inline style left in the
  project, including on the test page. Alongside it: `nosniff`, `no-referrer`,
  `X-Frame-Options: DENY`, HSTS, and a `Permissions-Policy` that grants the microphone
  to this origin and denies camera, geolocation, payment, USB, MIDI and serial.
- **Inputs are bounded.** Player ids are stripped to `[A-Za-z0-9-]` before they are used
  in a store key, the `seen` list is capped at 600 ids, a transcript is capped at 40
  speeches and 120,000 characters in total, one signal call carries at most 20 frames, a
  mailbox holds at most 120, and a client's transcript stops growing at 1,500 lines so a
  peer cannot inflate it.
- **Errors say nothing.** Both endpoints return a fixed string rather than an exception
  message.
- **The memory store expires.** Queues and mailboxes for players who closed the tab are
  swept after two hours, so a warm instance does not accumulate them.
- **No secrets exist in this project.** There is no key, no token and no `.env`, in the
  working tree or anywhere in the git history.

Known and accepted, because fixing them properly needs infrastructure this build
deliberately does not have:

- **No rate limiting.** There is no shared state to count against, so the lobby can be
  flooded with ghost entries that real players then have to pop through. Turning on the
  Redis backend is the first step to fixing it.
- **Your IP address is visible to your opponent.** That is how a peer-to-peer call
  works, and routing around it needs a TURN server, which needs credentials. The privacy
  page says so plainly rather than hiding it.
- **Ratings are client-side and therefore unenforceable.** Anyone can edit them. They
  mean something only because nothing is at stake.

## Tests

```
python3 tests/smoke.py https://debatppl.vercel.app
```

52 end-to-end checks against a live deployment: that every file is served with the
right type, that the hardening headers are present, that the judge behaves (the better
speech wins, side labels do not decide it, relabelling swaps the ballot exactly,
identical speeches draw, padding does not win, silence forfeits), that inputs are
bounded, and that two players really do find each other through the live lobby, get the
same motion on opposite sides, relay signals, and are told when the other leaves —
without the relay ever handing one of them the other's id.

`/tests/selfcheck.html` is the browser half: motion-bank integrity, format timing
balance, equal speaking time on both sides of every league, rank boundaries, Elo
behaviour and the judge's bias tests, run in the page.
