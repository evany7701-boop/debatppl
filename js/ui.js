// Small DOM helpers, the icon set, and the rank badge.
//
// Six icons, drawn as paths rather than pulled from a library, because six icons is
// not a reason to ship an icon library.

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === "class") el.className = v;
    else if (k === "html") el.innerHTML = v;
    else if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2), v);
    else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
    else el.setAttribute(k, v === true ? "" : String(v));
  }
  add(el, children);
  return el;
}

function add(el, children) {
  for (const c of children) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) add(el, c);
    else el.append(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

const PATHS = {
  mic: "M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11v1a7 7 0 0 0 14 0v-1M12 19v3",
  micOff: "M9 9v3a3 3 0 0 0 4.9 2.3M15 11V6a3 3 0 0 0-5.9-.7M5 11v1a7 7 0 0 0 10.3 6.2M12 19v3M3 3l18 18",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM12 7v5l3 2",
  next: "M4 12h15M13 6l6 6-6 6",
  check: "M4 12.5 9 17.5 20 6.5",
  close: "M6 6l12 12M18 6 6 18",
};

export function icon(name, size = 16) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", size);
  svg.setAttribute("height", size);
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.6");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  svg.classList.add("icon");
  const p = document.createElementNS("http://www.w3.org/2000/svg", "path");
  p.setAttribute("d", PATHS[name] || "");
  svg.append(p);
  return svg;
}

const NUMERALS = { IV: 4, III: 3, II: 2, I: 1 };

// A badge, not a trophy: a hexagon in the tier colour with one pip per division.
export function rankBadge(rank, size = 34) {
  const ns = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(ns, "svg");
  svg.setAttribute("viewBox", "0 0 40 44");
  svg.setAttribute("width", size);
  svg.setAttribute("height", Math.round((size * 44) / 40));
  svg.classList.add("badge");
  svg.setAttribute("role", "img");
  svg.setAttribute("aria-label", rank.label);

  const hex = document.createElementNS(ns, "path");
  hex.setAttribute("d", "M20 1.5 37 11v22L20 42.5 3 33V11z");
  hex.setAttribute("fill", rank.tier.hue);
  hex.setAttribute("fill-opacity", "0.14");
  hex.setAttribute("stroke", rank.tier.hue);
  hex.setAttribute("stroke-width", "1.5");
  svg.append(hex);

  const inner = document.createElementNS(ns, "path");
  inner.setAttribute("d", "M20 8.5 31 14.5v15L20 35.5 9 29.5v-15z");
  inner.setAttribute("fill", "none");
  inner.setAttribute("stroke", rank.tier.hue);
  inner.setAttribute("stroke-width", "1");
  inner.setAttribute("stroke-opacity", "0.5");
  svg.append(inner);

  const pips = rank.division ? NUMERALS[rank.division] : 5;
  const span = (pips - 1) * 5;
  for (let i = 0; i < pips; i++) {
    const dot = document.createElementNS(ns, "circle");
    dot.setAttribute("cx", String(20 - span / 2 + i * 5));
    dot.setAttribute("cy", "22");
    dot.setAttribute("r", rank.division ? "2" : "1.7");
    dot.setAttribute("fill", rank.tier.hue);
    svg.append(dot);
  }
  return svg;
}

export function bar(valueZeroToTen) {
  const outer = h("span", { class: "bar" });
  const fill = h("span", { class: "bar-fill" });
  outer.append(fill);
  outer.dataset.value = String(valueZeroToTen);
  return { outer, fill };
}

export function sentence(n, one, many) {
  return `${n} ${n === 1 ? one : many || one + "s"}`;
}
