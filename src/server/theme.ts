/**
 * The shared visual system.
 *
 * Colour carries meaning rather than decoration: signal blue is the public channel,
 * amber is a private breakout, vermilion is an infrastructure failure. The same three
 * appear on the overview, in the documentation, and in every run timeline, so a reader
 * only learns the legend once.
 *
 * Everything is inline: no external fonts, stylesheets, or scripts on any page.
 */
export const BASE_STYLES = `
:root {
  color-scheme: light dark;
  --paper: #eef1f5;
  --panel: #ffffff;
  --grid: #dde3ea;
  --ink: #14181f;
  --muted: #5d6673;
  --line: #d3dae2;
  /* The palette is the legend. */
  --public: #2f5fe0;
  --private: #b57408;
  --fault: #c7361f;
  --public-soft: #e4ebfc;
  --private-soft: #fbf0dc;
  --fault-soft: #fbe6e2;
  --mono: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace;
  --sans: ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
}
@media (prefers-color-scheme: dark) {
  :root:not([data-theme="light"]) {
    --paper: #101319; --panel: #171b23; --grid: #1e242e; --ink: #e9edf3;
    --muted: #98a2b1; --line: #262d38;
    --public: #7fa2ff; --private: #e8b25c; --fault: #ff8f80;
    --public-soft: #16203a; --private-soft: #2c2413; --fault-soft: #331a19;
  }
}
* { box-sizing: border-box; }
html { scroll-behavior: smooth; }
body {
  margin: 0;
  color: var(--ink);
  background-color: var(--paper);
  /* Plotter paper: a fine grid, the ground an instrument draws on. */
  background-image:
    linear-gradient(var(--grid) 1px, transparent 1px),
    linear-gradient(90deg, var(--grid) 1px, transparent 1px);
  background-size: 28px 28px, 28px 28px;
  font: 16px/1.65 var(--sans);
  -webkit-font-smoothing: antialiased;
}
main { max-width: 68rem; margin: 0 auto; padding: 0 1.25rem 4rem; }
em { font-style: normal; }
a { color: var(--public); }

nav.top {
  display: flex; gap: 1.1rem; align-items: baseline;
  max-width: 68rem; margin: 0 auto; padding: 1.4rem 1.25rem;
  font-size: .9rem;
}
nav.top a { text-decoration: none; font-weight: 600; }
nav.top .brand { color: var(--ink); font-weight: 800; letter-spacing: .16em; font-size: .95rem; }
nav.top .brand-note {
  font-family: var(--mono); font-size: .7rem; color: var(--muted);
  border: 1px solid var(--line); border-radius: 999px; padding: .05rem .5rem; margin-right: auto;
}
nav.top a:focus-visible, .btn:focus-visible { outline: 2px solid var(--public); outline-offset: 3px; }

.eyebrow {
  font-family: var(--mono); font-size: .72rem; letter-spacing: .18em;
  text-transform: uppercase; color: var(--muted); margin: 0 0 .5rem;
}
h1 {
  font-size: clamp(2rem, 4.4vw, 3.15rem); line-height: 1.05;
  letter-spacing: -.035em; font-weight: 800; margin: 0 0 1rem; text-wrap: balance;
}
/* The accent enters as a drawn line, not as coloured type: the instrument recording
   a trace under the claim. Blue stays reserved for "public channel" everywhere else.
   Painted as a background so it follows the text when the headline wraps — an
   absolutely-positioned rule would force the phrase onto one line and overflow. */
h1 em {
  background-image: linear-gradient(var(--public), var(--public));
  background-repeat: no-repeat;
  background-position: 0 100%;
  background-size: 0 4px;
  padding-bottom: .1em;
  animation: drawRule 1.1s .35s cubic-bezier(.2,.7,.25,1) both;
}
@keyframes drawRule { from { background-size: 0 4px; } to { background-size: 100% 4px; } }
h2 {
  font-size: clamp(1.4rem, 2.9vw, 2rem); line-height: 1.15;
  letter-spacing: -.025em; font-weight: 750; margin: 0 0 .8rem; text-wrap: balance;
}
h3 { font-size: 1.02rem; letter-spacing: -.01em; margin: 0 0 .5rem; }
.lede { font-size: clamp(1rem, 1.6vw, 1.16rem); color: var(--muted); max-width: 46rem; margin: 0 0 2rem; }
.body { max-width: 46rem; margin: 0 0 1.5rem; }
.aside {
  max-width: 46rem; font-size: .92rem; color: var(--muted);
  border-left: 2px solid var(--line); padding-left: .9rem; margin: 1.5rem 0 0;
}

.btn {
  display: inline-block; background: var(--public); color: #fff; text-decoration: none;
  font-weight: 650; padding: .6rem 1.1rem; border-radius: 8px; font-size: .95rem;
}
.btn:hover { filter: brightness(1.08); }

figcaption { display: flex; flex-wrap: wrap; gap: .5rem 1.4rem; justify-content: center;
             margin-top: .75rem; font-size: .84rem; color: var(--muted); }
.legend { display: inline-flex; align-items: center; gap: .4rem; }
.dot { width: 9px; height: 9px; border-radius: 999px; display: inline-block; flex: none; }
.dot.public { background: var(--public); }
.dot.private { background: var(--private); }
.dot.fault { background: var(--fault); }
.dot.grey { background: var(--line); }

/* ---------- the spine: the page is itself a trace ---------- */
.spine { border-left: 1px solid var(--line); margin-left: .5rem; padding-left: 2.25rem; }
.spine > section { position: relative; padding: 3.25rem 0; }
.spine > section::before {
  content: ""; position: absolute; left: -2.68rem; top: 3.9rem;
  width: 9px; height: 9px; border-radius: 999px;
  background: var(--paper); border: 2px solid var(--public);
}
.spine > section + section { border-top: 1px solid var(--line); }


`;
