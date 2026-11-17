// Page wiring: the GitHub Actions run, the logo strip, and the live platform simulation
// in a sticky card whose camera follows whichever "How I work" step you're reading.

import { Sim, ZONES, setPalette, clamp, lerp, ease } from './sim.js';
import { Terminal } from './terminal.js';
import { mountPipeline } from './pipeline.js';
import { asciiPortrait } from './ascii.js';
import { mountGrowth } from './growth.js';

// Hero name: split into letters so CSS can stagger them in on load.
const h1 = document.querySelector('h1');
h1.setAttribute('aria-label', h1.textContent);
h1.innerHTML = h1.textContent.split(' ').map((word, wi) =>
  `<span class="word" aria-hidden="true">${[...word].map((ch, ci) => `<span class="ch" style="--i:${wi * 8 + ci}">${ch}</span>`).join('')}</span>`).join(' ');

asciiPortrait(document.querySelector('.portrait img'), document.querySelector('.portrait .ascii'));
mountPipeline(document.getElementById('gha'));
mountGrowth(document.querySelector('[data-contrib]'), document.querySelector('[data-contrib-axis]'));

// Logo strip: duplicate the list so the marquee loops seamlessly.
const strip = document.querySelector('.strip-list');
const copy = strip.cloneNode(true);
copy.setAttribute('aria-hidden', 'true');
strip.after(copy);

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- palette from CSS ----------
function readPalette() {
  const cs = getComputedStyle(document.documentElement);
  const keys = ['bg', 'zone', 'line', 'ink', 'ink2', 'mute', 'faint', 'accent', 'ok', 'warn', 'err'];
  setPalette(Object.fromEntries(keys.map((k) => [k, cs.getPropertyValue(`--sim-${k}`).trim()])));
}
readPalette();
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', readPalette);

// ---------- live readouts ----------
function onStats(s) {
  for (const el of $$('[data-stat="ready"]')) el.textContent = `${s.ready}/${s.desired} healthy`;
  for (const el of $$('[data-stat="tag"]')) el.textContent = `v${s.tag}`;
  for (const el of $$('[data-stat="rps"]')) el.textContent = `${s.rps} req/s`;
  for (const el of $$('[data-health]')) el.dataset.health = s.firing ? 'err' : s.ready < s.desired ? 'warn' : 'ok';
}
function onEvent(e) {
  for (const el of $$('[data-event]')) {
    el.textContent = `${e.reason} · ${e.obj} — ${e.msg}`;
    el.dataset.type = e.type;
  }
}
const sim = new Sim({ onEvent, onStats });
window.platform = sim; // for the curious: poke at it from devtools

// ---------- views ----------
function fit(keys, w, h, pad = 0.86, offY = 0) {
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const k of keys) {
    const z = ZONES[k];
    x0 = Math.min(x0, z.x); y0 = Math.min(y0, z.y - 50); x1 = Math.max(x1, z.x + z.w); y1 = Math.max(y1, z.y + z.h);
  }
  const z = Math.min((w * pad) / (x1 - x0), ((h - offY * 2) * pad) / (y1 - y0));
  return { cx: (x0 + x1) / 2, cy: (y0 + y1) / 2, z, ax: w / 2, ay: h / 2 + offY };
}

class View {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.cam = null;
    this.visible = true;
    this.hover = null;
    this.active = [];
    new ResizeObserver(() => this.resize()).observe(canvas);
    new IntersectionObserver(([e]) => { this.visible = e.isIntersecting; }).observe(canvas);
    canvas.addEventListener('pointermove', (e) => {
      const w = this.toWorld(e);
      this.hover = sim.hitPod(w.x, w.y);
      canvas.style.cursor = this.hover ? 'pointer' : '';
    });
    canvas.addEventListener('pointerleave', () => { this.hover = null; });
    canvas.addEventListener('click', (e) => {
      const w = this.toWorld(e);
      const p = sim.hitPod(w.x, w.y);
      if (p) { sim.kill(p); this.hover = null; }
    });
    this.resize();
  }
  resize() {
    const r = this.canvas.getBoundingClientRect();
    this.dpr = Math.min(devicePixelRatio || 1, 2);
    this.w = Math.max(1, r.width); this.h = Math.max(1, r.height);
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
  }
  toWorld(e) {
    const r = this.canvas.getBoundingClientRect(), c = this.cam;
    return { x: (e.clientX - r.left - c.ax) / c.z + c.cx, y: (e.clientY - r.top - c.ay) / c.z + c.cy };
  }
  step(target, dt, speed) {
    if (!this.cam) this.cam = { ...target };
    const c = this.cam, k = reduced ? 1 : 1 - Math.exp(-dt * speed);
    c.cx = lerp(c.cx, target.cx, k); c.cy = lerp(c.cy, target.cy, k);
    c.ax = lerp(c.ax, target.ax, k); c.ay = lerp(c.ay, target.ay, k);
    c.z = Math.exp(lerp(Math.log(c.z), Math.log(target.z), k));
  }
}

// Story: sticky card follows the step being read.
const story = new View($('#story-canvas'));
const steps = $$('.step');
let anchors = [];
function measure() {
  const mobile = innerWidth < 900;
  const focus = mobile ? innerHeight * 0.74 : innerHeight * 0.5;
  anchors = steps.map((s) => s.getBoundingClientRect().top + scrollY + s.offsetHeight / 2 - focus);
}
addEventListener('resize', measure);
document.fonts?.ready.then(measure);
new ResizeObserver(measure).observe(document.body);
measure();

let activeStep = -1;
function storyTarget() {
  const y = scrollY, n = anchors.length;
  let i = 0;
  while (i < n - 1 && y >= anchors[i + 1]) i++;
  let g = 0;
  if (i < n - 1 && y > anchors[i]) g = ease(clamp(((y - anchors[i]) / (anchors[i + 1] - anchors[i]) - 0.25) / 0.5, 0, 1));
  const keysA = steps[i].dataset.zones.split(','), keysB = steps[Math.min(n - 1, i + 1)].dataset.zones.split(',');
  const pad = story.w < 600 ? 0.9 : 0.94;
  const A = fit(keysA, story.w, story.h, pad, 22), B = fit(keysB, story.w, story.h, pad, 22);
  const idx = g > 0.5 ? Math.min(n - 1, i + 1) : i;
  if (idx !== activeStep) {
    activeStep = idx;
    steps.forEach((s, j) => s.classList.toggle('on', j === idx));
    story.active = steps[idx].dataset.zones.split(',');
  }
  const dip = reduced ? 1 : 1 - 0.3 * Math.sin(Math.PI * g);
  return {
    cx: lerp(A.cx, B.cx, g), cy: lerp(A.cy, B.cy, g),
    z: Math.exp(lerp(Math.log(A.z), Math.log(B.z), g)) * dip,
    ax: lerp(A.ax, B.ax, g), ay: lerp(A.ay, B.ay, g),
  };
}

// ---------- loop ----------
function step(dt) {
  sim.update(dt);
  if (story.visible) { story.step(storyTarget(), dt, 5); sim.renderView(story); }
}
sim.step = step; // lets devtools / headless checks advance time manually
let last = performance.now();
requestAnimationFrame(function frame(now) {
  step(Math.min(0.05, (now - last) / 1000));
  last = now;
  requestAnimationFrame(frame);
});

// ---------- navigation & terminal ----------
function goto(zone) {
  const s = steps.find((x) => x.dataset.zones.split(',').includes(zone === 'runtime' ? 'cluster' : zone));
  if (!s) return;
  measure();
  scrollTo({ top: anchors[steps.indexOf(s)], behavior: reduced ? 'auto' : 'smooth' });
}
const term = new Terminal($('#term'), sim, { goto, close: () => term.close() });
$$('[data-open-term]').forEach((b) => b.addEventListener('click', () => term.open()));
addEventListener('keydown', (e) => {
  if (e.target.closest?.('input, textarea')) return;
  if (e.key === '`' || ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k')) {
    e.preventDefault();
    term.isOpen ? term.close() : term.open();
  }
});
addEventListener('keydown', (e) => { if (e.key === 'Escape' && term.isOpen) term.close(); });

