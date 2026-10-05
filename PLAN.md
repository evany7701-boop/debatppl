# debat ppl — plan

Omegle for speech & debate. No account, no lobby chat, no profile setup: you press one
button, you are dropped into a real round against a stranger, you get a motion and five
minutes to research it, and then you actually debate.

## 1. Product shape

| Omegle                        | debat ppl                                               |
| ----------------------------- | ------------------------------------------------------- |
| "Start a chat"                | "Start a round"                                           |
| random stranger, text/video   | random opponent, audio (WebRTC)                           |
| no login                      | no login (identity is a local anon id in localStorage)    |
| "Stranger is typing"          | "Opponent is preparing" — you never see who they are      |
| Esc, Esc, next                | "Next round" requeues you instantly                       |

Flow:

1. Pick a **league** (= a debate format). Press start.
2. Matchmaking. You are matched but **you do not meet the person yet.**
3. The motion and your side appear. **5:00 research time.** Mics are hard-muted, there is
   a scratchpad, and there is no way to talk to the opponent.
4. The round runs on a real speech schedule. Only the current speaker's mic is open; the
   app enforces it by disabling the outbound audio track.
5. Live speech-to-text (browser Web Speech API, no keys) builds a shared transcript.
6. The transcript goes to a **blinded judge** which returns a ballot and an RFD.
7. Elo moves, your rank in that league moves, "Next round".

## 2. Leagues (real formats, 1v1)

All leagues start with the same 5:00 research block. Prep banks are spendable between
speeches, as on a real circuit.

| League              | Schedule                                                      | Prep bank |
| ------------------- | ------------------------------------------------------------- | --------- |
| Spar                | 2 / 2 / cross 1:30 / 1:30 / 1:30 / 1 / 1                       | 1:00      |
| Public Forum (1v1)  | 4 / 4 / cross 3 / reb 4 / reb 4 / cross 3 / sum 3 / sum 3 / GC 3 / FF 2 / FF 2 | 3:00 |
| Lincoln–Douglas     | AC 6 / CX 3 / NC 7 / CX 3 / 1AR 4 / NR 6 / 2AR 3               | 4:00      |
| World Schools (1v1) | 6 / 6 / 6 / 6 / reply 4 / reply 4, POIs live                   | 2:00      |
| British Parl. (1v1) | 7 / 7 / 7 / 7, POIs live, protected first and last minute      | 0         |

Each league keeps its **own** rating, record and rank.

## 3. Ranks

Elo, start 1000, K=32 for the first 10 rounds then 20.

`Copper < 900 · Bronze 900 · Silver 1100 · Gold 1300 · Platinum 1500 · Diamond 1700+`

Divisions IV–I inside each tier every 50 points. Diamond is undivided and shows the raw
rating. Rank badges are drawn as small inline SVG, not images.

## 4. The judge, and why it is blind

`lib/rubric.mjs` is deterministic and runs the same in the browser and on the server, so
both debaters always see the same ballot.

Before anything is scored the transcript is **relabelled**: sides become Speaker A and
Speaker B under a content-seeded permutation, and the scorers are never handed the side,
the id, the order of joining, or who spoke first. Scores come back keyed to A/B and are
only mapped to Pro/Con at the very end.

Criteria, weighted: clash & refutation 25, evidence & warranting 20, structure 15,
responsiveness 15, weighing 15, delivery & time use 10. Penalties for repetition, for
personal attacks, and for drifting off the motion. Everything that could reward sheer
volume is measured per 100 words.

`POST /api/judge` is the seam where a model-written ballot drops in later. **No API keys
in this build** — today it returns the rubric ballot, and the client falls back to the
identical local computation if the call fails.

## 5. Topics

`lib/topics.mjs` — a large bank of motions drawn from the way the activity is actually
run around the world: WUDC / EUDC / Australs / UADC / WSDC / Pan-African / All-Asians
"This House…" motions, plus NSDA-style "Resolved:" resolutions. Each entry is tagged with
a region and a theme.

Non-repetition is enforced twice: the server keeps a ring buffer of recently served
motions, and each client sends the ids it has already seen (kept in localStorage) so the
server can exclude them for that player. The bag only resets once a player has exhausted
it.

## 6. Stack

Static HTML/CSS/ES modules + Vercel Node functions. No framework, no build step, no
dependencies, no keys.

- `/index.html`, `/css/*`, `/js/*` — the app
- `/lib/*.mjs` — shared by browser and functions (topics, formats, rubric, ranks)
- `/api/lobby.js` — matchmaking queue + WebRTC signal relay (long-poll)
- `/api/judge.js` — ballot
- WebRTC audio peer-to-peer over public STUN; a data channel carries phase sync,
  transcript lines and POIs.
- State lives in the function's memory, behind a small store interface. An Upstash /
  Vercel KV adapter is wired up but stays dormant unless its env vars exist, so the
  default build needs no credentials.

## 7. Look

Omegle's plainness, done deliberately: one column, real borders instead of shadows, no
gradients, no emoji, no stock illustration. System serif for the wordmark, system sans
for UI, monospace for every number that ticks. Six SVG icons total, in one sprite.

## 8. Build order

1. `lib/` — topics, formats, ranks, rubric, store
2. `api/` — lobby, judge
3. `js/` — net, speech, round engine, UI
4. `index.html` + css
5. git init → GitHub repo (REST) → push
6. Vercel deploy (REST, no CLI)
7. Fix pass: re-read every file, check the seams, document what is and is not real

## 9. Motion

Requested: "cool animations/effects that fit the site". Done as a real motion layer,
`js/motion.js`, rather than by adding React — the whole app is a no-build static deploy
and a runtime React dependency would buy nothing here. The layer implements the same
primitives Framer Motion is built on:

- a critically-damped **spring integrator** on a single rAF loop, so nothing uses
  CSS easing curves that fight each other
- **FLIP** transitions, so views change position by measuring and inverting rather than
  by cross-fading
- **staggered reveals** with per-child delay
- an **audio-reactive waveform** driven by a real Web Audio analyser node on the live
  microphone — it moves because someone is actually speaking
- the countdown as a **spring-driven SVG ring** that tightens and reddens in the last
  thirty seconds
- transcript lines that settle in as they are recognised, with interim text held at low
  opacity until the recogniser commits it
- the ballot: criterion bars race out under stagger, the rating counter rolls, and a
  promotion between tiers gets a single restrained pop

All of it is behind `prefers-reduced-motion`, which cuts durations to zero rather than
disabling the app.
