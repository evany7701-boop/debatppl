#!/usr/bin/env python3
"""End-to-end checks against a running deployment.

    python3 tests/smoke.py https://debatppl.vercel.app

Covers what the browser self-check cannot: that the functions actually run on
Node, that the hardening headers are served, that two players really do find
each other through the live lobby, and that the relay does not hand your id to
the person you are debating. Exits non-zero on any failure.
"""
import json, sys, time, urllib.request, urllib.error

BASE = sys.argv[1] if len(sys.argv) > 1 else "https://debatppl.vercel.app"
passed = failed = 0

def check(name, cond, detail=""):
    global passed, failed
    ok = cond is True
    passed += ok; failed += not ok
    print(("PASS  " if ok else "FAIL  ") + name + (f"  — {detail or cond}" if not ok else ""))

def req(path, payload=None, method=None):
    url = BASE + path
    data = json.dumps(payload).encode() if payload is not None else None
    r = urllib.request.Request(url, data=data, method=method or ("POST" if data else "GET"))
    r.add_header("Content-Type", "application/json")
    r.add_header("User-Agent", "debatppl-smoke/1")
    try:
        with urllib.request.urlopen(r, timeout=30) as resp:
            body = resp.read()
            ctype = resp.headers.get("Content-Type", "")
            try: return resp.status, json.loads(body), ctype
            except Exception: return resp.status, body.decode("utf-8", "replace"), ctype
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", "replace")[:300]
        try: return e.code, json.loads(raw), ""
        except Exception: return e.code, raw, ""
    except Exception as e:
        return 0, str(e), ""

print(f"=== {BASE} ===\n")

# --- static ------------------------------------------------------------------
st, body, _ = req("/")
check("home page serves", st == 200, st)
check("home page is the app", isinstance(body, str) and "debat ppl" in body and "/js/app.js" in body)
check("wordmark is one colour now", isinstance(body, str) and "<em>" not in body)

for path in ["/js/app.js", "/js/motion.js", "/js/round.js", "/js/net.js", "/lib/rubric.mjs",
             "/lib/topics.mjs", "/lib/formats.mjs", "/css/app.css", "/tests/selfcheck.html"]:
    st, body, ctype = req(path)
    ok = st == 200
    if path.endswith((".js", ".mjs")):
        ok = ok and ("javascript" in ctype or "ecmascript" in ctype)
    check(f"serves {path}", ok, f"{st} {ctype}")

# --- hardening ----------------------------------------------------------------
import urllib.request as _u
_r = _u.Request(BASE + "/", method="GET"); _r.add_header("User-Agent", "debatppl-smoke/1")
with _u.urlopen(_r, timeout=30) as resp:
    H = {k.lower(): v for k, v in resp.headers.items()}

csp = H.get("content-security-policy", "")
check("a content security policy is served", bool(csp), "none")
check("scripts are same-origin only, with no inline escape",
      "script-src 'self'" in csp and "unsafe-inline" not in csp and "unsafe-eval" not in csp, csp[:160])
check("the page cannot be framed", "frame-ancestors 'none'" in csp, csp[:160])
check("objects and base tags are locked down",
      "object-src 'none'" in csp and "base-uri 'self'" in csp, csp[:160])
check("nothing is loaded cross-origin", "default-src 'self'" in csp and "connect-src 'self'" in csp)
check("mime sniffing is off", H.get("x-content-type-options") == "nosniff", H.get("x-content-type-options"))
check("no referrer is leaked to github", H.get("referrer-policy") == "no-referrer", H.get("referrer-policy"))
check("the microphone is not delegated to anyone else",
      "microphone=(self)" in H.get("permissions-policy", "") and "camera=()" in H.get("permissions-policy", ""),
      H.get("permissions-policy"))
check("hsts is set", "max-age" in H.get("strict-transport-security", ""), H.get("strict-transport-security"))

# --- stats -------------------------------------------------------------------
st, body, _ = req("/api/lobby")
check("GET /api/lobby answers", st == 200 and isinstance(body, dict), st)
if isinstance(body, dict):
    check("the whole motion bank loaded on the server", body.get("topics", 0) >= 400, body.get("topics"))
    check("all five leagues are up", len(body.get("leagues", [])) == 5, body.get("leagues"))
    print(f"      store backend: {body.get('backend')}")

# --- the judge ---------------------------------------------------------------
TOPIC = "This House would abolish the Electoral College"
STRONG = ("My first contention is that the college distorts the value of a vote. According to a 2020 study "
  "a vote in Wyoming is worth 3.6 times a vote in California, because the floor of three electors is fixed. "
  "They say the college protects small states. That is false, and here is why: the data shows campaign visits "
  "concentrate in six swing states, which means forty four states are ignored. Even if you buy their claim about "
  "federalism, the magnitude of disenfranchising ninety million voters outweighs it, and it is irreversible in a "
  "way their harm is not. Second, the mechanism they describe does not follow. Their evidence concerns the Senate, "
  "not the presidency. To conclude, on balance the harm comes first in both probability and scope.")
WEAK = ("So basically I think like the electoral college is kind of good you know. Um it is sort of traditional "
  "and I mean people like tradition. Basically it is good. Um yeah I think it is just better honestly. I mean like "
  "it has been around a long time and that matters a lot I guess. So yeah basically that is my case.")

def speech(side, text, sec=214, phase="p1"):
    return {"phase": phase, "label": "Constructive", "kind": "speech", "side": side,
            "allotted": 240, "spoken": sec, "text": text}

def send(transcript):
    # Explicitly the rubric: these assertions are about determinism, blinding and
    # exact antisymmetry. A model has none of those properties, and billing one to
    # answer the same question eight times a run would be money set on fire.
    st, b, _ = req("/api/judge", {"topic": TOPIC, "formatId": "pf",
                                  "transcript": transcript, "judge": "rubric"})
    return st, (b.get("ballot") if isinstance(b, dict) else b)

def send_model(transcript):
    st, b, _ = req("/api/judge", {"topic": TOPIC, "formatId": "pf", "transcript": transcript})
    return st, (b.get("ballot") if isinstance(b, dict) else b)

def ballot(pro, con, pro_sec=214, con_sec=214):
    return send([speech("pro", pro, pro_sec), speech("con", con, con_sec, "c1")])

st, b = ballot(STRONG, WEAK)
check("POST /api/judge answers", st == 200 and isinstance(b, dict), f"{st} {b}")
if isinstance(b, dict):
    check("the better speech wins", b.get("winner") == "pro", b.get("winner"))
    check("a reason for decision comes back", len(b.get("rfd", [])) >= 4, len(b.get("rfd", [])))
    check("all six criteria are scored", len(b.get("scores", {}).get("pro", {}).get("criteria", {})) == 6)
    crit = b["scores"]["pro"]["criteria"]; crit2 = b["scores"]["con"]["criteria"]
    check("criteria are antisymmetric", all(abs(crit[k] + crit2[k] - 10) < 0.02 for k in crit),
          {k: round(crit[k] + crit2[k], 3) for k in crit})
    print(f"      {b['winner']} by {b['margin']} — blinded A={b['blind']['A']}")
    print(f"      {b['rfd'][0]}")

st2, b2 = ballot(WEAK, STRONG)
check("side labels do not decide it", isinstance(b2, dict) and b2.get("winner") == "con",
      b2.get("winner") if isinstance(b2, dict) else b2)
if isinstance(b, dict) and isinstance(b2, dict):
    check("the same two speeches give the same margin either way round",
          abs(b["margin"] - b2["margin"]) < 0.1, f'{b["margin"]} vs {b2["margin"]}')

# Relabelling the sides must swap the ballot and move nothing else.
st7, b7 = send([speech("con", STRONG), speech("pro", WEAK, 214, "c1")])
if isinstance(b, dict) and isinstance(b7, dict):
    check("relabelling the sides swaps the ballot exactly",
          b7["winner"] == "con" and abs(b7["margin"] - b["margin"]) < 0.001,
          f'{b7["winner"]} by {b7["margin"]} vs pro by {b["margin"]}')

# Where only one side ever speaks after the other, responsiveness must not be scored.
if isinstance(b, dict):
    check("responsiveness is dropped when only one side could show it",
          "response" not in b.get("scored", []), b.get("scored"))

st8, b8 = send([speech("pro", STRONG), speech("con", WEAK, 214, "c1"),
                speech("pro", STRONG, 214, "p2"), speech("con", WEAK, 214, "c2")])
check("responsiveness is scored when both sides get a later speech",
      isinstance(b8, dict) and "response" in b8.get("scored", []),
      b8.get("scored") if isinstance(b8, dict) else b8)

st3, b3 = ballot(STRONG, (WEAK + " ") * 4)
check("talking more is not arguing better", isinstance(b3, dict) and b3.get("winner") == "pro",
      b3.get("winner") if isinstance(b3, dict) else b3)

st4, b4 = ballot(STRONG, STRONG)
check("identical speeches draw", isinstance(b4, dict) and b4.get("winner") == "draw"
      and b4.get("margin", 9) < 0.01,
      (b4.get("winner"), b4.get("margin")) if isinstance(b4, dict) else b4)

st5, b5 = ballot(STRONG, "um")
check("silence is a forfeit", isinstance(b5, dict) and b5.get("forfeit") and b5.get("winner") == "pro",
      b5 if not isinstance(b5, dict) else (b5.get("winner"), b5.get("forfeit")))

st6, b6, _ = req("/api/judge", {"topic": "x"})
check("a request with no transcript is refused", st6 == 400, st6)

st9, b9, _ = req("/api/lobby", {"action": "nonsense", "id": "x"})
check("an unknown action is refused", st9 == 400, st9)
check("errors do not describe the inside of the function",
      isinstance(b9, dict) and "/" not in str(b9.get("error", "")) and "at " not in str(b9.get("error", "")), b9)

# an id with characters that could reach across store key namespaces
st10, b10, _ = req("/api/lobby", {"action": "find", "id": "q:spar", "league": "spar", "seen": []})
check("key-shaped ids are stripped rather than honoured",
      st10 == 200 and isinstance(b10, dict) and b10.get("state") in ("waiting", "matched"), b10)

# a huge seen list must not be accepted wholesale
st11, b11, _ = req("/api/lobby", {"action": "find", "id": "floodtest1", "league": "bp",
                                  "seen": list(range(0, 50000))})
check("an oversized seen list is survivable", st11 == 200, st11)
req("/api/lobby", {"action": "leave", "id": "floodtest1", "league": "bp"})

# --- which judge is configured -------------------------------------------------
st, health, _ = req("/api/judge")
check("GET /api/judge reports its configuration", st == 200 and isinstance(health, dict), health)
if isinstance(health, dict):
    check("the health check never echoes the key",
          "key" not in json.dumps(health).lower().replace("api_key_set", ""), health)
    print(f"      judge: {health.get('judge')} ({health.get('model') or health.get('rubric')})")

# The model path costs real money, so it runs only when asked for:
#   python3 tests/smoke.py <url> --model
if "--model" in sys.argv:
    st, mb = send_model([speech("pro", STRONG), speech("con", WEAK, 214, "c1"),
                         speech("pro", STRONG, 214, "p2"), speech("con", WEAK, 214, "c2")])
    check("the model judge returns a ballot",
          isinstance(mb, dict) and mb.get("winner") in ("pro", "con", "draw"), mb)
    if isinstance(mb, dict):
        check("the model ballot is labelled as the model's",
              str(mb.get("method", "")).startswith("model:"), mb.get("method"))
        check("the model ballot carries a reason for decision", len(mb.get("rfd", [])) >= 3)
        check("the rubric is reported alongside it as a cross-check",
              isinstance(mb.get("cross"), dict), mb.get("cross"))
        print(f"      model said {mb.get('winner')} by {mb.get('margin')}; "
              f"rubric said {(mb.get('cross') or {}).get('rubric')}")
elif isinstance(health, dict) and health.get("judge") == "model":
    print("      (model path not exercised - pass --model to spend ~5c on one round)")

# --- matchmaking --------------------------------------------------------------
A, B = f"smokeA{int(time.time())}", f"smokeB{int(time.time())}"
matched = None
for attempt in range(4):
    req("/api/lobby", {"action": "leave", "id": A, "league": "spar"})
    req("/api/lobby", {"action": "leave", "id": B, "league": "spar"})
    st, r1, _ = req("/api/lobby", {"action": "find", "id": A, "league": "spar", "seen": []})
    st, r2, _ = req("/api/lobby", {"action": "find", "id": B, "league": "spar", "seen": []})
    if isinstance(r2, dict) and r2.get("state") == "matched":
        matched = (r1, r2); break
    time.sleep(1.5)

check("two players find each other", matched is not None,
      "never matched across 4 attempts — likely separate function instances")

if matched:
    r1, r2 = matched
    room_b = r2["room"]
    st, p1, _ = req("/api/lobby", {"action": "poll", "id": A, "league": "spar"})
    ok = isinstance(p1, dict) and p1.get("state") == "matched"
    check("the waiting player is told", ok, p1)
    if ok:
        room_a = p1["room"]
        check("both are in the same room", room_a["roomId"] == room_b["roomId"])
        check("both get the same motion", room_a["topic"]["id"] == room_b["topic"]["id"])
        check("they are on opposite sides", room_a["side"] != room_b["side"],
              f'{room_a["side"]}/{room_b["side"]}')
        check("exactly one of them hosts", (room_a["role"] == "host") != (room_b["role"] == "host"))
        print(f'      motion #{room_a["topic"]["id"]}: {room_a["topic"]["text"][:70]}...')

        req("/api/lobby", {"action": "signal", "id": A, "data": [{"kind": "ping", "n": 7}]})
        st, p2, _ = req("/api/lobby", {"action": "poll", "id": B, "league": "spar"})
        sigs = p2.get("signals", []) if isinstance(p2, dict) else []
        check("signals relay to the other side",
              any(s.get("d", {}).get("kind") == "ping" for s in sigs), sigs)
        # A player id is the only thing authenticating a player here, so it must not
        # be handed to the person on the other end of the round.
        check("the relay does not tell the peer your id",
              all("from" not in s for s in sigs) and not any(A in json.dumps(s) for s in sigs), sigs)

        req("/api/lobby", {"action": "leave", "id": A, "league": "spar"})
        st, p3, _ = req("/api/lobby", {"action": "poll", "id": B, "league": "spar"})
        byes = [s for s in (p3.get("signals", []) if isinstance(p3, dict) else [])
                if s.get("d", {}).get("kind") == "bye"]
        check("leaving tells the other side", len(byes) == 1, p3)

    # Regression: a "bye" written to a mailbox after its owner left used to sit
    # there until their next room, arriving as though the new opponent had quit.
    for pid in (A, B):
        req("/api/lobby", {"action": "leave", "id": pid, "league": "spar"})
    again = None
    for attempt in range(4):
        req("/api/lobby", {"action": "find", "id": A, "league": "spar", "seen": []})
        st, r2b, _ = req("/api/lobby", {"action": "find", "id": B, "league": "spar", "seen": []})
        if isinstance(r2b, dict) and r2b.get("state") == "matched":
            again = r2b["room"]; break
        time.sleep(1.5)
    if again:
        st, pa, _ = req("/api/lobby", {"action": "poll", "id": A, "league": "spar"})
        sig = pa.get("signals", []) if isinstance(pa, dict) else []
        here = pa.get("room", {}).get("roomId") if isinstance(pa, dict) else None
        # Clearing the mailbox server-side is best effort: on the memory backend the
        # leave and the room creation can land on different function instances. The
        # guarantee the client actually relies on is the stamp - every frame names the
        # room it belongs to, so one from a finished round is recognisable as such.
        unstamped = [x for x in sig if not x.get("r")]
        check("every relayed frame names the room it belongs to", not unstamped, unstamped)
        inherited = [x for x in sig
                     if x.get("d", {}).get("kind") == "bye" and x.get("r") == here]
        check("a new round does not inherit the last round's goodbye", not inherited, sig)
        check("the new room is a different room", here and here != room_b["roomId"], here)
        for pid in (A, B):
            req("/api/lobby", {"action": "leave", "id": pid, "league": "spar"})
    else:
        check("a new round does not inherit the last round's goodbye", False, "could not rematch")

    # motions should not repeat for a player who says they have seen them
    seen = list(range(0, 300))
    st, r3, _ = req("/api/lobby", {"action": "find", "id": A + "x", "league": "spar", "seen": seen})
    req("/api/lobby", {"action": "find", "id": B + "x", "league": "spar", "seen": seen})
    st, p4, _ = req("/api/lobby", {"action": "poll", "id": A + "x", "league": "spar"})
    if isinstance(p4, dict) and p4.get("state") == "matched":
        check("motions a player has seen are not served again",
              p4["room"]["topic"]["id"] not in seen, p4["room"]["topic"]["id"])
    for pid in (A, B, A + "x", B + "x"):
        req("/api/lobby", {"action": "leave", "id": pid, "league": "spar"})

print(f"\n{'ALL ' + str(passed) + ' CHECKS PASSED' if not failed else str(failed) + ' FAILED, ' + str(passed) + ' passed'}")
sys.exit(1 if failed else 0)
