// Motion.
//
// One requestAnimationFrame loop drives every spring on the page. Springs are
// integrated with semi-implicit Euler at a fixed 1/240s substep so the result does
// not change with frame rate, which matters because the countdown ring and the
// transcript both animate while the browser is busy doing speech recognition.
//
// Nothing here uses CSS transitions. Two CSS transitions on the same property at
// different durations fight; two springs on the same value do not, because the
// second one simply takes over the first one's velocity.

export const reduced = typeof matchMedia === "function"
  && matchMedia("(prefers-reduced-motion: reduce)").matches;

const SUB = 1 / 240;
const live = new Set();
let running = false;
let last = 0;

function tick(now) {
  const dt = Math.min(0.064, (now - last) / 1000 || 0);
  last = now;
  for (const s of live) s.step(dt);
  if (live.size) requestAnimationFrame(tick);
  else running = false;
}

function start() {
  if (running) return;
  running = true;
  last = performance.now();
  requestAnimationFrame(tick);
}

export class Spring {
  constructor(value, opts = {}) {
    this.v = value;
    this.target = value;
    this.vel = 0;
    this.stiffness = opts.stiffness ?? 170;
    this.damping = opts.damping ?? 26;
    this.mass = opts.mass ?? 1;
    this.precision = opts.precision ?? 0.002;
    this.onUpdate = opts.onUpdate || null;
    this.onRest = opts.onRest || null;
    this.resting = true;
  }

  set(target, { jump = false } = {}) {
    this.target = target;
    if (jump || reduced) {
      this.v = target;
      this.vel = 0;
      this.resting = true;
      live.delete(this);
      if (this.onUpdate) this.onUpdate(this.v);
      if (this.onRest) this.onRest(this.v);
      return this;
    }
    this.resting = false;
    live.add(this);
    start();
    return this;
  }

  step(dt) {
    let t = dt;
    while (t > 0) {
      const h = Math.min(SUB, t);
      const f = -this.stiffness * (this.v - this.target) - this.damping * this.vel;
      this.vel += (f / this.mass) * h;
      this.v += this.vel * h;
      t -= h;
    }
    const settled = Math.abs(this.v - this.target) < this.precision && Math.abs(this.vel) < this.precision * 60;
    if (settled) {
      this.v = this.target;
      this.vel = 0;
      this.resting = true;
      live.delete(this);
    }
    if (this.onUpdate) this.onUpdate(this.v);
    if (settled && this.onRest) this.onRest(this.v);
  }

  stop() { live.delete(this); this.resting = true; return this; }
}

export function spring(from, to, opts, onUpdate) {
  const s = new Spring(from, { ...opts, onUpdate });
  if (onUpdate) onUpdate(from);
  s.set(to);
  return s;
}

// --- FLIP --------------------------------------------------------------------
// Measure, mutate, invert, release. Used when a panel changes size or an element
// moves between containers, so it travels instead of blinking into place.

export function flip(nodes, mutate, opts = {}) {
  const list = [...nodes].filter(Boolean);
  const before = new Map(list.map((n) => [n, n.getBoundingClientRect()]));
  mutate();
  if (reduced) return;
  for (const n of list) {
    const a = before.get(n);
    const b = n.getBoundingClientRect();
    if (!a || !b.width) continue;
    const dx = a.left - b.left;
    const dy = a.top - b.top;
    const sx = a.width / (b.width || 1);
    const sy = a.height / (b.height || 1);
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5 && Math.abs(sx - 1) < 0.01 && Math.abs(sy - 1) < 0.01) continue;
    n.style.willChange = "transform";
    const s = new Spring(0, {
      stiffness: opts.stiffness ?? 210,
      damping: opts.damping ?? 28,
      onUpdate: (p) => {
        const k = 1 - p;
        n.style.transform = `translate(${dx * k}px, ${dy * k}px) scale(${1 + (sx - 1) * k}, ${1 + (sy - 1) * k})`;
      },
      onRest: () => { n.style.transform = ""; n.style.willChange = ""; },
    });
    s.set(1);
  }
}

// --- entrances ---------------------------------------------------------------

export function enter(node, { y = 10, delay = 0, stiffness = 190, damping = 24 } = {}) {
  if (!node) return;
  if (reduced) { node.style.opacity = "1"; node.style.transform = ""; return; }
  node.style.opacity = "0";
  node.style.transform = `translateY(${y}px)`;
  const go = () => {
    const s = new Spring(0, {
      stiffness, damping,
      onUpdate: (p) => {
        node.style.opacity = String(Math.min(1, p * 1.25));
        node.style.transform = `translateY(${y * (1 - p)}px)`;
      },
      onRest: () => { node.style.opacity = ""; node.style.transform = ""; },
    });
    s.set(1);
  };
  if (delay) setTimeout(go, delay); else go();
}

export function stagger(nodes, { step = 45, ...rest } = {}) {
  [...nodes].forEach((n, i) => enter(n, { ...rest, delay: i * step }));
}

export function pop(node, { scale = 1.06 } = {}) {
  if (!node || reduced) return;
  const s = new Spring(0, {
    stiffness: 420, damping: 16,
    onUpdate: (p) => {
      const k = Math.sin(p * Math.PI);
      node.style.transform = `scale(${1 + (scale - 1) * k})`;
    },
    onRest: () => { node.style.transform = ""; },
  });
  s.set(1);
}

export function shake(node) {
  if (!node || reduced) return;
  const s = new Spring(0, {
    stiffness: 600, damping: 12,
    onUpdate: (p) => {
      const k = Math.sin(p * Math.PI * 3) * (1 - p);
      node.style.transform = `translateX(${k * 6}px)`;
    },
    onRest: () => { node.style.transform = ""; },
  });
  s.set(1);
}

// --- numbers -----------------------------------------------------------------
// Ratings roll rather than jump, because a rating change is the one number people
// stare at.

export function rollNumber(node, from, to, format = (n) => String(Math.round(n))) {
  if (!node) return;
  if (reduced) { node.textContent = format(to); return; }
  const s = new Spring(from, {
    stiffness: 90, damping: 20, precision: 0.05,
    onUpdate: (v) => { node.textContent = format(v); },
    onRest: () => { node.textContent = format(to); },
  });
  s.set(to);
  return s;
}

// --- the countdown ring -------------------------------------------------------

export class Ring {
  constructor(circle, { radius = 54 } = {}) {
    this.circle = circle;
    this.circumference = 2 * Math.PI * radius;
    circle.style.strokeDasharray = String(this.circumference);
    this.s = new Spring(1, {
      stiffness: 120, damping: 24, precision: 0.0005,
      onUpdate: (p) => {
        circle.style.strokeDashoffset = String(this.circumference * (1 - Math.max(0, Math.min(1, p))));
      },
    });
  }
  set(progress, jump) { this.s.set(progress, { jump }); }
}

// --- live audio ---------------------------------------------------------------
// A real analyser on the real microphone. The bars move because someone is talking,
// which is the only honest version of this widget.

export class Waveform {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.bars = new Float32Array(48);
    this.analyser = null;
    this.data = null;
    this.raf = 0;
    this.colour = "currentColor";
    this.active = false;
  }

  attach(stream) {
    try {
      this.audioCtx = this.audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      if (this.source) this.source.disconnect();
      this.source = this.audioCtx.createMediaStreamSource(stream);
      this.analyser = this.audioCtx.createAnalyser();
      this.analyser.fftSize = 256;
      this.analyser.smoothingTimeConstant = 0.75;
      this.source.connect(this.analyser);
      this.data = new Uint8Array(this.analyser.frequencyBinCount);
      this.start();
    } catch { /* no analyser: the bars simply idle */ }
  }

  start() {
    if (this.raf) return;
    const draw = () => {
      this.raf = requestAnimationFrame(draw);
      this.render();
    };
    this.raf = requestAnimationFrame(draw);
  }

  stop() { cancelAnimationFrame(this.raf); this.raf = 0; }

  setActive(on) { this.active = on; }

  render() {
    const c = this.canvas;
    const dpr = window.devicePixelRatio || 1;
    const w = c.clientWidth, h = c.clientHeight;
    if (c.width !== w * dpr || c.height !== h * dpr) { c.width = w * dpr; c.height = h * dpr; }
    const ctx = this.ctx;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    if (this.analyser && this.active) this.analyser.getByteFrequencyData(this.data);

    const n = this.bars.length;
    const gap = 2;
    const bw = Math.max(1, (w - gap * (n - 1)) / n);
    const style = getComputedStyle(c);
    ctx.fillStyle = style.color;

    for (let i = 0; i < n; i++) {
      let target = 0.04;
      if (this.analyser && this.active && this.data) {
        const lo = Math.floor((i / n) * (this.data.length * 0.6));
        target = Math.max(0.04, Math.pow(this.data[lo] / 255, 1.35));
      } else {
        // Idle: a slow, almost-flat drift so the panel is not dead, not a fake pulse.
        target = 0.04 + 0.02 * (0.5 + 0.5 * Math.sin(performance.now() / 900 + i * 0.4));
      }
      this.bars[i] += (target - this.bars[i]) * 0.25;
      const bh = Math.max(1.5, this.bars[i] * h);
      const x = i * (bw + gap);
      const y = (h - bh) / 2;
      ctx.globalAlpha = this.active ? 1 : 0.4;
      roundRect(ctx, x, y, bw, bh, Math.min(bw / 2, 1.5));
    }
    ctx.globalAlpha = 1;
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
  ctx.fill();
}

// --- view transitions ----------------------------------------------------------

export function swapView(container, build, { y = 14 } = {}) {
  const old = container.firstElementChild;
  const next = build();
  if (reduced || !old) {
    container.replaceChildren(next);
    enter(next, { y: 0 });
    return next;
  }
  const outS = new Spring(1, {
    stiffness: 260, damping: 30,
    onUpdate: (p) => {
      old.style.opacity = String(Math.max(0, p));
      old.style.transform = `translateY(${(1 - p) * -8}px)`;
    },
    onRest: () => {
      container.replaceChildren(next);
      enter(next, { y });
    },
  });
  outS.set(0);
  return next;
}

// --- loops -------------------------------------------------------------------
// A shared rAF registry for the two things that are genuinely continuous rather
// than springing toward a target: the waiting dots and the judging spinner.

const loops = new Set();
let looping = false;

function loopTick(now) {
  for (const fn of loops) fn(now);
  if (loops.size) requestAnimationFrame(loopTick);
  else looping = false;
}

function addLoop(fn) {
  loops.add(fn);
  if (!looping) { looping = true; requestAnimationFrame(loopTick); }
  return () => loops.delete(fn);
}

// Dots travelling up and down in a wave, the way a queue should feel: moving,
// but not in a hurry.
export function dotWave(host, { count = 5, amp = 6, size = 7, speed = 2.4, gap = 8 } = {}) {
  host.replaceChildren();
  host.style.display = "flex";
  host.style.alignItems = "center";
  host.style.justifyContent = "center";
  host.style.gap = `${gap}px`;
  host.style.height = `${amp * 2 + size + 4}px`;

  const dots = [];
  for (let i = 0; i < count; i++) {
    const d = document.createElement("span");
    Object.assign(d.style, {
      width: `${size}px`, height: `${size}px`, borderRadius: "50%",
      background: "currentColor", display: "block", opacity: "0.35",
    });
    host.append(d);
    dots.push(d);
  }
  if (reduced) { for (const d of dots) d.style.opacity = "0.5"; return () => {}; }

  return addLoop((now) => {
    const t = (now / 1000) * speed;
    dots.forEach((d, i) => {
      const phase = t - i * 0.42;
      const lift = Math.sin(phase);
      d.style.transform = `translateY(${-lift * amp}px)`;
      d.style.opacity = String(0.3 + 0.55 * (0.5 + 0.5 * lift));
    });
  });
}

// A circle that is actually being drawn and undrawn, rather than a ring with a
// gap spun around. It reads as work in progress instead of as a stuck gif.
export function spinner(size = 22, stroke = 2) {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 40 40");
  svg.setAttribute("width", size);
  svg.setAttribute("height", size);
  svg.classList.add("spinner");
  svg.setAttribute("aria-hidden", "true");

  const track = document.createElementNS(ns, "circle");
  const arc = document.createElementNS(ns, "circle");
  for (const c of [track, arc]) {
    c.setAttribute("cx", "20"); c.setAttribute("cy", "20"); c.setAttribute("r", "16");
    c.setAttribute("fill", "none");
    c.setAttribute("stroke-width", String(stroke));
    c.setAttribute("stroke-linecap", "round");
  }
  track.setAttribute("stroke", "currentColor");
  track.setAttribute("stroke-opacity", "0.16");
  arc.setAttribute("stroke", "currentColor");
  const C = 2 * Math.PI * 16;
  arc.setAttribute("stroke-dasharray", String(C));
  svg.append(track, arc);

  if (reduced) {
    arc.setAttribute("stroke-dashoffset", String(C * 0.75));
    svg.stop = () => {};
    return svg;
  }

  const stop = addLoop((now) => {
    const t = now / 1000;
    // The arc grows and shrinks on its own cycle while the whole thing turns, so
    // the head never sits still long enough to look frozen.
    const sweep = 0.12 + 0.56 * (0.5 - 0.5 * Math.cos(t * 1.9));
    arc.setAttribute("stroke-dashoffset", String(C * (1 - sweep)));
    svg.style.transform = `rotate(${(t * 150) % 360}deg)`;
    svg.style.transformOrigin = "50% 50%";
  });
  svg.stop = stop;
  return svg;
}
