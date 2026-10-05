// The ballot endpoint.
//
// Today this runs the deterministic rubric in lib/rubric.mjs. It exists as its own
// endpoint so that a model-written ballot can replace the body of this function
// without the client changing at all: same request, same response shape, and the
// client keeps its local fallback for when the call fails.
//
// No API keys are read here. When one is added, the honest version of this function
// blinds the transcript with blind() before the text ever reaches a model, sends the
// speeches as "Speaker A" and "Speaker B", and maps the answer back afterwards — the
// same discipline the rubric follows.

import { judge, METHOD } from "../lib/rubric.mjs";

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ error: "method" });

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = null; } }
  if (!body || !Array.isArray(body.transcript)) return res.status(400).json({ error: "no transcript" });

  // Keep a stray enormous payload from becoming a bill. The rubric scans every
  // speech against roughly two hundred markers, so the cap is on total characters
  // and not just on the number of speeches.
  let budget = 120000;
  const transcript = body.transcript.slice(0, 40).map((t) => ({
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

  try {
    const ballot = judge({ topic: String(body.topic || "").slice(0, 400), formatId: body.formatId, transcript });
    return res.status(200).json({ ok: true, source: "server", method: METHOD, ballot });
  } catch {
    return res.status(500).json({ error: "could not score the round" });
  }
}
