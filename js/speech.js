// Speech to text, in the browser, with no key and no upload.
//
// This is the Web Speech API, which in practice means Chrome, Edge and Safari behave
// and Firefox does not. Where it is missing the round still runs: the speaker types
// into the same box instead, and the transcript the judge sees is identical.

const Impl = typeof window !== "undefined"
  && (window.SpeechRecognition || window.webkitSpeechRecognition);

export const supported = Boolean(Impl);

export class Dictation {
  constructor({ onFinal, onInterim, onError } = {}) {
    this.onFinal = onFinal || (() => {});
    this.onInterim = onInterim || (() => {});
    this.onError = onError || (() => {});
    this.wanted = false;
    this.rec = null;
    this.restarts = 0;
  }

  start() {
    if (!supported || this.wanted) return;
    this.wanted = true;
    this.restarts = 0;
    this._spin();
  }

  _spin() {
    if (!this.wanted) return;
    const rec = new Impl();
    this.rec = rec;
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = document.documentElement.lang || "en-US";
    rec.maxAlternatives = 1;

    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        const text = (r[0] && r[0].transcript) || "";
        if (r.isFinal) {
          const clean = text.trim();
          if (clean) this.onFinal(clean);
        } else {
          interim += text;
        }
      }
      this.onInterim(interim.trim());
    };

    rec.onerror = (e) => {
      // no-speech and aborted are routine during a pause; everything else is worth
      // telling the speaker about, because a silent transcript loses them the round.
      if (e.error === "no-speech" || e.error === "aborted") return;
      this.onError(e.error || "speech error");
      if (e.error === "not-allowed" || e.error === "service-not-allowed") this.wanted = false;
    };

    // The recogniser stops itself every minute or so. Restart it, with a ceiling so
    // a permanently broken recogniser does not spin forever.
    rec.onend = () => {
      if (!this.wanted) return;
      if (this.restarts++ > 400) { this.onError("recogniser stopped"); return; }
      setTimeout(() => { if (this.wanted) this._spin(); }, 180);
    };

    try { rec.start(); } catch { /* already started */ }
  }

  stop() {
    this.wanted = false;
    this.onInterim("");
    if (this.rec) { try { this.rec.stop(); } catch {} }
    this.rec = null;
  }
}
