// The ballot endpoint.
//
// Two judges live here. The deterministic rubric in lib/rubric.mjs always runs: it
// is the fallback when there is no key or the call fails, and it is a cross-check on
// the model's verdict either way. When ANTHROPIC_API_KEY is set, Claude reads the
// transcript and writes the ballot, and the rubric's agreement or disagreement is
// reported alongside it rather than hidden.
//
// What blinding can and cannot do here, honestly:
//
//   It CAN remove the names. Sides are relabelled Speaker A and Speaker B under a
//   permutation seeded by the words of the round, speech labels are stripped (an
//   "Affirmative constructive" announces its own side), and no id, rating or join
//   order is sent. The model is told not to work out which side is which.
//
//   It CANNOT hide the order. Whoever opened the round spoke first, and in every
//   format here that is the proposition. A judge in the room knows that too. What
//   makes this fair is upstream, not here: the lobby draws sides at random, so no
//   player is systematically handed the side a judge might favour.

import Anthropic from "@anthropic-ai/sdk";
import { judge as rubricJudge, blind, CRITERIA, METHOD } from "../lib/rubric.mjs";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5";
const MAX_SPEECHES = 40;
const CHAR_BUDGET = 120000;

const SYSTEM = `You are judging a one-on-one competitive debate round.

You are given the motion and a transcript of two speakers, A and B. You do not know
which side of the motion either of them was assigned, and you must not try to work it
out or let a guess affect the result.

How to judge:

- Judge only what is in the transcript. Do not bring your own view of the motion into
  the round. If a claim is factually weak but goes unanswered, it still stands, and the
  speaker who failed to answer it loses that exchange.
- Reward clash. A speaker who engages with what the other actually said beats a speaker
  who delivers prepared material past them.
- Reward warranting. A claim with a mechanism or evidence behind it beats an assertion.
- Reward weighing. A speaker who tells you why their impact matters more, and is right
  about it, wins close rounds.
- Do not reward length. More words is not a better speech, and the speaker who used
  more of the clock has no claim on your ballot for that alone.
- Do not reward confidence, fluency, or vocabulary over substance.

About the transcript: it comes from automatic speech recognition. It has unreliable
punctuation, mishears names, numbers and technical terms, and sometimes drops words.
Never penalise a speaker for a transcription artefact, and read a garbled passage
charitably rather than treating it as incoherence.

Score each criterion from 0 to 10 for each speaker, as a pair that reflects how they
compared on it. Then write 4 to 7 lines of reason for decision. Each line must point at
something specific that was actually said, in your own words, and refer to the speakers
only as "Speaker A" and "Speaker B". Do not pad the ballot with generic advice.

Call the record_ballot tool with your decision. Do not reply with prose.`;

const score = {
  type: "object",
  properties: Object.fromEntries(CRITERIA.map((c) => [c.id, {
    type: "number",
    description: `${c.name}, 0 to 10.`,
  }])),
  required: CRITERIA.map((c) => c.id),
  additionalProperties: false,
};

const TOOL = {
  name: "record_ballot",
  description: "Record the decision for this debate round.",
  strict: true,
  input_schema: {
    type: "object",
    properties: {
      winner: { type: "string", enum: ["A", "B", "draw"], description: "Who won." },
      margin: { type: "number", description: "How decisive it was, 0 to 10. Under 1 is a very close round." },
      a: score,
      b: score,
      rfd: {
        type: "array",
        items: { type: "string" },
        description: "4 to 7 lines of reason for decision, each citing something said in the round.",
      },
    },
    required: ["winner", "margin", "a", "b", "rfd"],
    additionalProperties: false,
  },
};

// Speech labels announce their own side, so they are dropped. Order is kept, because
// a rebuttal cannot be judged before the thing it answers.
function brief(round, b) {
  const lines = round.transcript.map((t, i) => {
    const who = t.side === b.A ? "Speaker A" : "Speaker B";
    const kind = t.kind === "cross" ? "open exchange, both speakers" : "speech";
    const used = t.allotted ? `, used about ${t.spoken}s of ${t.allotted}s allowed` : "";
    return `[${i + 1}] ${who} (${kind}${used})\n${t.text}`;
  });
  return `Motion: ${round.topic}\n\n${lines.join("\n\n")}`;
}

function totalFor(criteria) {
  return CRITERIA.reduce((n, c) => n + c.weight * clamp(Number(criteria[c.id]) || 0, 0, 10), 0);
}

const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

async function modelBallot(round, rubric) {
  const b = blind(round.transcript);
  const client = new Anthropic();

  const stream = client.messages.stream({
    model: MODEL,
    max_tokens: 16000,
    system: SYSTEM,
    thinking: { type: "adaptive" },
    tools: [TOOL],
    messages: [{ role: "user", content: brief(round, b) }],
  });
  const message = await stream.finalMessage();

  if (message.stop_reason === "refusal") throw new Error("declined");
  const call = message.content.find((x) => x.type === "tool_use" && x.name === "record_ballot");
  if (!call) throw new Error("no ballot returned");
  const out = call.input;
  if (!out || !out.a || !out.b || !Array.isArray(out.rfd)) throw new Error("malformed ballot");

  const key = { A: b.A, B: b.B };
  const winner = out.winner === "draw" ? "draw" : key[out.winner];
  if (!winner) throw new Error("unknown winner");

  // Worlds-style names here; the client renames them for the league in play.
  const named = (s) => String(s)
    .replace(/Speaker A/g, b.A === "pro" ? "Proposition" : "Opposition")
    .replace(/Speaker B/g, b.B === "pro" ? "Proposition" : "Opposition");

  const packed = {};
  for (const [tag, side] of [["a", b.A], ["b", b.B]]) {
    const criteria = {};
    for (const c of CRITERIA) criteria[c.id] = Number(clamp(Number(out[tag][c.id]) || 0, 0, 10).toFixed(2));
    packed[side] = {
      total: Number(totalFor(criteria).toFixed(2)),
      criteria,
      penalties: [],
      // The counting the rubric did is real and worth keeping on the ballot, even
      // when the verdict came from the model.
      stats: (rubric.scores[side] && rubric.scores[side].stats) || {},
    };
  }

  const agreed = rubric.winner === winner;
  return {
    method: `model:${MODEL}`,
    source: "model",
    winner,
    margin: Number(clamp(Number(out.margin) || 0, 0, 10).toFixed(2)),
    forfeit: false,
    scored: CRITERIA.map((c) => c.id),
    scores: packed,
    rfd: out.rfd.slice(0, 8).map(named),
    blind: { A: b.A, B: b.B },
    cross: {
      rubric: rubric.winner,
      margin: rubric.margin,
      agreed,
      note: agreed
        ? "The deterministic rubric scored this round the same way."
        : "The deterministic rubric would have given it the other way. Both readings are on the record.",
    },
    usage: {
      input: message.usage && message.usage.input_tokens,
      output: message.usage && message.usage.output_tokens,
    },
  };
}

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "method" });

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = null; } }
  if (!body || !Array.isArray(body.transcript)) return res.status(400).json({ error: "no transcript" });

  // Keep a stray enormous payload from becoming a bill. The rubric scans every speech
  // against roughly two hundred markers and the model is paid by the token, so the cap
  // is on total characters and not just on the number of speeches.
  let budget = CHAR_BUDGET;
  const transcript = body.transcript.slice(0, MAX_SPEECHES).map((t) => ({
    phase: String(t.phase || "").slice(0, 32),
    label: String(t.label || "").slice(0, 64),
    kind: String(t.kind || "speech").slice(0, 16),
    side: t.side === "con" ? "con" : "pro",
    allotted: Number(t.allotted) || 0,
    spoken: Number(t.spoken) || 0,
    text: (() => {
      const text = String(t.text || "").slice(0, Math.max(0, Math.min(20000, budget)));
      budget -= text.length;
      return text;
    })(),
  }));

  const round = {
    topic: String(body.topic || "").slice(0, 400),
    formatId: body.formatId,
    transcript,
  };

  let rubric;
  try {
    rubric = rubricJudge(round);
  } catch {
    return res.status(500).json({ error: "could not score the round" });
  }

  // A round nobody spoke in does not need a model to adjudicate it.
  if (rubric.forfeit || !process.env.ANTHROPIC_API_KEY) {
    return res.status(200).json({
      ok: true,
      source: "rubric",
      method: METHOD,
      ballot: { ...rubric, source: "rubric" },
    });
  }

  try {
    const ballot = await modelBallot(round, rubric);
    return res.status(200).json({ ok: true, source: "model", method: ballot.method, ballot });
  } catch {
    // Any failure at all and the round is still judged, just not by the model.
    return res.status(200).json({
      ok: true,
      source: "rubric",
      method: METHOD,
      ballot: { ...rubric, source: "rubric", degraded: true },
    });
  }
}
