// The platform simulation: one world, six zones, any number of views.
// commit → GitHub Actions → registry → rolling update → metrics → on-call.
// update() advances state once per frame; renderView() draws it into a given canvas/camera.

import { LAYERS, COMMIT_MSGS, JOBS } from './data.js';

// Palette is injected from CSS custom properties (light/dark) via setPalette().
export const C = {
  bg: '#f3f3f1', zone: '#ffffff', line: '#e4e4e0', ink: '#0d0d0d', ink2: '#3d3d3b', mute: '#8a8a86',
  faint: '#d4d4cf', accent: '#f2551d', ok: '#17924d', warn: '#c97f00', err: '#e5484d',
};
export function setPalette(p) { for (const k in p) if (p[k]) C[k] = p[k]; }
const A = (hex, al) => {
  const h = hex.replace('#', '');
  const n = parseInt(h.length === 3 ? h.split('').map((c) => c + c).join('') : h, 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${al})`;
};
const MONO = '"Geist Mono", ui-monospace, Consolas, monospace';
const SANS = '"Geist", system-ui, sans-serif';

export const rand = (a, b) => a + Math.random() * (b - a);
export const pick = (a) => a[(Math.random() * a.length) | 0];
export const hex = (n) => { let s = ''; for (let i = 0; i < n; i++) s += '0123456789abcdef'[(Math.random() * 16) | 0]; return s; };
export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
export const lerp = (a, b, t) => a + (b - a) * t;
export const ease = (t) => t * t * (3 - 2 * t);

export const ZONES = {
  git:      { x: 0,    y: 0,    w: 720,  h: 560, n: '01', label: 'Source' },
  ci:       { x: 1060, y: -180, w: 900,  h: 600, n: '02', label: 'CI · GitHub Actions' },
  registry: { x: 2300, y: 120,  w: 680,  h: 640, n: '03', label: 'Registry' },
  cluster:  { x: 3340, y: -80,  w: 1220, h: 800, n: '04', label: 'Runtime · Kubernetes' },
  observe:  { x: 4920, y: -160, w: 940,  h: 660, n: '05', label: 'Observability' },
  pager:    { x: 6200, y: 60,   w: 640,  h: 520, n: '06', label: 'On-call' },
};

const POD = 108, POD_GAP = 18, SLOTS = 4, SURGE = 3;
const T_PENDING = 0.5, T_CREATE = 0.9, T_TERM = 0.9;

const route = (a, b) => {
  const mx = (a.x + b.x) / 2;
  return [a, { x: mx, y: a.y }, { x: mx, y: b.y }, b];
};

export class Sim {
  constructor(hooks = {}) {
    this.hooks = hooks;
    this.t = 0;
    this.msgIdx = 0;
    this.commits = [];
    this.runN = 41;
    this.run = null;
    this.runs = [];
    this.version = 13;
    this.target = 13;
    this.tags = [];
    this.layerPulse = -10;
    this.pods = [];
    this.desired = 9;
    this.packets = [];
    this.queue = [];
    this.reqTimes = [];
    this.series = { rps: [], ready: [], lat: [] };
    this.lat = 42;
    this.alert = null;
    this.alerts = [];
    this.pager = { state: 'ok', t: -10 };
    this.phase = 'idle';
    this.nextCommit = 1.5;
    this.chaos = 0;
    this.deploys = 0;
    this.timers = { reconcile: 0, sample: 0, scrape: 0, stats: 0, req: 0 };

    this.layout();
    this.nodes = [0, 1, 2].map((i) => ({ name: `node-pool-${hex(4)}-0${i}`, cpu: rand(0.25, 0.45), mem: rand(0.35, 0.55) }));

    for (let i = 0; i < 7; i++) this.commits.push(this.mkCommit(-60 * (i + 1)));
    for (let i = 0; i < 4; i++) this.tags.push({ tag: this.tagName(this.version - i), sha: hex(12), t: -900 * i });
    this.run = this.mkRun(this.commits[0], true);
    for (let i = 0; i < 3; i++) this.runs.push({ n: this.runN - i, msg: this.commits[i].msg, dur: rand(5.2, 6.4) });
    for (let i = 0; i < this.desired; i++) this.createPod(this.version, true);
    for (let i = 0; i < 120; i++) {
      this.series.rps.push(10 + Math.sin(i * 0.2) * 3 + rand(-1, 1));
      this.series.ready.push(9);
      this.series.lat.push(42 + rand(-4, 4));
    }
  }

  // ---------- geometry ----------
  layout() {
    const c = ZONES.cluster;
    const api = { x: c.x + 30, y: c.y + 70, w: 200, h: 110 };
    const ingress = { x: c.x + 30, y: c.y + 560, w: 200, h: 130 };
    const nodes = [0, 1, 2].map((i) => ({ x: c.x + 270 + i * 305, y: c.y + 70, w: 285, h: 450 }));
    const internet = { x: ingress.x + ingress.w / 2, y: c.y + c.h + 150 };
    const Z = ZONES;
    const mid = (z, side) => ({ x: side === 'r' ? z.x + z.w : z.x, y: z.y + z.h / 2 });
    this.geo = {
      api, ingress, nodes, internet,
      paths: {
        git: route(mid(Z.git, 'r'), mid(Z.ci, 'l')),
        ci: route(mid(Z.ci, 'r'), mid(Z.registry, 'l')),
        reg: [...route(mid(Z.registry, 'r'), { x: c.x, y: api.y + api.h / 2 }), { x: api.x, y: api.y + api.h / 2 }],
        scrape: route(mid(Z.cluster, 'r'), mid(Z.observe, 'l')),
        page: route(mid(Z.observe, 'r'), mid(Z.pager, 'l')),
        internet: [internet, { x: internet.x, y: ingress.y + ingress.h }],
      },
    };
  }

  podRect(node, slot) {
    const n = this.geo.nodes[node];
    const col = slot % 2, row = slot >> 1;
    return { x: n.x + 22 + col * (POD + POD_GAP), y: n.y + 64 + row * (POD + POD_GAP), w: POD, h: POD };
  }

  // ---------- helpers ----------
  tagName(v) { return `1.4.${v}`; }
  emit(type, reason, obj, msg) { this.hooks.onEvent?.({ type, reason, obj, msg }); }
  after(s, fn) { this.queue.push({ at: this.t + s, fn }); }
  mkCommit(t) {
    const msg = COMMIT_MSGS[this.msgIdx++ % COMMIT_MSGS.length];
    return { hash: hex(7), msg, lane: msg.startsWith('feat') ? 1 : 0, t };
  }
  mkRun(cm, done = false) {
    return {
      n: this.runN, cm, start: this.t, done, end: this.t,
      jobs: JOBS.map((j) => ({ ...j, status: done ? 'success' : 'queued', st: 0, took: j.dur })),
    };
  }
  send(pts, o = {}) {
    const segs = []; let len = 0;
    for (let i = 0; i < pts.length - 1; i++) { const l = Math.hypot(pts[i + 1].x - pts[i].x, pts[i + 1].y - pts[i].y); segs.push(l); len += l; }
    this.packets.push({ pts, segs, len, d: 0, speed: o.speed ?? 700, color: o.color ?? 'accent', size: o.size ?? 9, onArrive: o.onArrive });
  }
  posAt(p, d) {
    d = clamp(d, 0, p.len);
    let i = 0;
    while (i < p.segs.length - 1 && d > p.segs[i]) { d -= p.segs[i]; i++; }
    const a = p.pts[i], b = p.pts[i + 1], f = p.segs[i] ? d / p.segs[i] : 0;
    return { x: lerp(a.x, b.x, f), y: lerp(a.y, b.y, f) };
  }

  // ---------- pods ----------
  freeSlot() {
    let best = null;
    for (let n = 0; n < 3; n++) {
      const here = this.pods.filter((p) => p.node === n);
      if (here.length >= SLOTS) continue;
      const used = new Set(here.map((p) => p.slot));
      let slot = 0; while (used.has(slot)) slot++;
      const load = here.filter((p) => p.state !== 'terminating').length;
      if (!best || load < best.load) best = { node: n, slot, load };
    }
    return best;
  }
  createPod(v, instant = false) {
    const s = this.freeSlot();
    if (!s) return null;
    const p = { id: `krystian-niwa-${hex(5)}`, node: s.node, slot: s.slot, v, state: instant ? 'running' : 'pending', t0: this.t - (instant ? 10 : 0), hit: -10 };
    this.pods.push(p);
    if (!instant) this.emit('Normal', 'Scheduled', `pod/${p.id}`, `assigned to ${this.nodes[s.node].name}`);
    return p;
  }
  kill(p, by = 'visitor') {
    if (!p || p.state === 'terminating') return false;
    p.state = 'terminating'; p.t0 = this.t;
    this.chaos++;
    this.emit('Warning', 'Killing', `pod/${p.id}`, by === 'visitor' ? 'chaos experiment by visitor' : 'deleted');
    return true;
  }
  killAll() {
    const victims = this.pods.filter((p) => p.state !== 'terminating');
    victims.forEach((p) => this.kill(p, 'cli'));
    return victims;
  }
  hitPod(wx, wy) {
    for (const p of this.pods) {
      if (p.state === 'terminating') continue;
      const r = this.podRect(p.node, p.slot);
      if (wx >= r.x && wx <= r.x + r.w && wy >= r.y && wy <= r.y + r.h) return p;
    }
    return null;
  }

  reconcile() {
    const live = this.pods.filter((p) => p.state !== 'terminating');
    const running = live.filter((p) => p.state === 'running');
    const old = live.filter((p) => p.v < this.target);
    if (live.length < this.desired) {
      this.createPod(this.target);
    } else if (old.length) {
      const warming = live.filter((p) => p.v === this.target && p.state !== 'running').length;
      if (live.length < this.desired + SURGE && warming < SURGE) this.createPod(this.target);
    }
    if (running.length > this.desired) {
      const victim = running.find((p) => p.v < this.target) || (old.length ? null : running[running.length - 1]);
      if (victim) {
        victim.state = 'terminating'; victim.t0 = this.t;
        this.emit('Normal', 'Killing', `pod/${victim.id}`, `scaled down old replica (${this.tagName(victim.v)})`);
      }
    }
    if (this.phase === 'rolling' && !old.length && live.length === this.desired && running.length === this.desired) {
      this.phase = 'idle';
      this.deploys++;
      this.nextCommit = this.t + rand(2.5, 4);
      this.emit('Normal', 'RolloutComplete', 'deployment/krystian-niwa', `successfully rolled out ${this.tagName(this.target)}`);
    }
  }

  // ---------- pipeline ----------
  commit() {
    this.phase = 'ci';
    const cm = this.mkCommit(this.t);
    this.commits.unshift(cm);
    if (this.commits.length > 9) this.commits.pop();
    this.emit('Normal', 'Push', 'repo/platform', `${cm.hash} ${cm.msg}`);
    this.send(this.geo.paths.git, { speed: 900, onArrive: () => this.startRun(cm) });
  }
  startRun(cm) {
    this.runN++;
    this.run = this.mkRun(cm);
    this.emit('Normal', 'Triggered', 'workflow/deploy.yml', `run #${this.runN} on push`);
  }
  stepRun() {
    const r = this.run, t = this.t;
    const ok = (id) => r.jobs.find((j) => j.id === id).status === 'success';
    for (const j of r.jobs) {
      if (j.status === 'queued' && j.needs.every(ok)) { j.status = 'running'; j.st = t; }
      else if (j.status === 'running' && t - j.st >= j.dur) { j.status = 'success'; j.took = j.dur + rand(-0.1, 0.3); }
    }
    if (!r.jobs.every((j) => j.status === 'success')) return;
    r.done = true; r.end = t;
    this.runs.unshift({ n: r.n, msg: r.cm.msg, dur: t - r.start });
    if (this.runs.length > 4) this.runs.pop();
    this.emit('Normal', 'Succeeded', `run/#${r.n}`, `deploy.yml completed in ${(t - r.start).toFixed(1)}s`);
    this.send(this.geo.paths.ci, {
      speed: 900,
      onArrive: () => {
        this.version++;
        this.tags.unshift({ tag: this.tagName(this.version), sha: hex(12), t: this.t });
        if (this.tags.length > 5) this.tags.pop();
        this.layerPulse = this.t;
        this.emit('Normal', 'Pushed', `image:${this.tagName(this.version)}`, '10 layers, 7 cached');
        this.after(0.6, () => this.send(this.geo.paths.reg, {
          speed: 900,
          onArrive: () => {
            this.target = this.version;
            this.phase = 'rolling';
            this.emit('Normal', 'ScalingReplicaSet', 'deployment/krystian-niwa', `rolling update → ${this.tagName(this.target)}`);
          },
        }));
      },
    });
  }

  request() {
    const running = this.pods.filter((p) => p.state === 'running');
    const g = this.geo, ing = g.ingress;
    if (!running.length) { this.send(g.paths.internet, { speed: 1100, color: 'err', size: 7 }); return; }
    const p = pick(running);
    const r = this.podRect(p.node, p.slot);
    const busX = g.nodes[p.node].x - 18, cy = ing.y + ing.h / 2, py = r.y + r.h / 2;
    const pts = [g.internet, { x: g.internet.x, y: cy }, { x: busX, y: cy }, { x: busX, y: py }, { x: r.x, y: py }];
    this.send(pts, { speed: 1300, size: 6, onArrive: () => { p.hit = this.t; this.reqTimes.push(this.t); } });
  }

  // ---------- tick ----------
  update(dt) {
    this.t += dt;
    const t = this.t;

    for (let i = this.queue.length - 1; i >= 0; i--) if (this.queue[i].at <= t) this.queue.splice(i, 1)[0].fn();

    if (this.phase === 'idle' && t >= this.nextCommit) this.commit();
    if (this.run && !this.run.done) this.stepRun();

    for (const p of this.pods) {
      const age = t - p.t0;
      if (p.state === 'pending' && age > T_PENDING) { p.state = 'creating'; p.t0 = t; this.emit('Normal', 'Pulling', `pod/${p.id}`, `image ${this.tagName(p.v)}`); }
      else if (p.state === 'creating' && age > T_CREATE) { p.state = 'running'; p.t0 = t; this.emit('Normal', 'Started', `pod/${p.id}`, 'container ready'); }
      else if (p.state === 'terminating' && age > T_TERM) p.dead = true;
    }
    this.pods = this.pods.filter((p) => !p.dead);

    if ((this.timers.reconcile += dt) > 0.3) { this.timers.reconcile = 0; this.reconcile(); }

    const rate = 9 + 4 * Math.sin(t * 0.4) + 2 * Math.sin(t * 1.7);
    this.timers.req += dt * rate;
    while (this.timers.req >= 1) { this.timers.req--; this.request(); }

    for (const p of this.packets) {
      p.d += p.speed * dt;
      if (p.d >= p.len) { p.done = true; p.onArrive?.(); }
    }
    this.packets = this.packets.filter((p) => !p.done);

    const ready = this.pods.filter((p) => p.state === 'running').length;
    if ((this.timers.sample += dt) > 0.5) {
      this.timers.sample = 0;
      this.reqTimes = this.reqTimes.filter((x) => t - x < 2);
      const target = 40 + rand(-4, 6) + (1 - Math.min(1, ready / this.desired)) * 260 + (this.phase === 'rolling' ? 14 : 0);
      this.lat = lerp(this.lat, target, 0.5);
      this.series.rps.push(this.reqTimes.length / 2);
      this.series.ready.push(ready);
      this.series.lat.push(this.lat);
      for (const k in this.series) if (this.series[k].length > 120) this.series[k].shift();
      for (const n of this.nodes) { n.cpu = clamp(n.cpu + rand(-0.03, 0.03), 0.15, 0.85); n.mem = clamp(n.mem + rand(-0.015, 0.015), 0.3, 0.8); }
    }
    if ((this.timers.scrape += dt) > 1.5) {
      this.timers.scrape = 0;
      this.send(this.geo.paths.scrape, { speed: 1000, color: 'ok', size: 6 });
    }

    // Alerting: PodsNotReady → page the on-call engineer.
    if (ready < this.desired) {
      if (!this.alert) this.alert = { since: t, firing: false };
      else if (!this.alert.firing && t - this.alert.since > 0.6) {
        this.alert.firing = true;
        this.emit('Warning', 'AlertFiring', 'alert/PodsNotReady', `ready ${ready}/${this.desired} → paging on-call`);
        this.send(this.geo.paths.page, { speed: 1400, color: 'err', size: 11, onArrive: () => { if (this.alert) { this.pager.state = 'paging'; this.pager.t = this.t; } } });
      }
    } else if (this.alert) {
      if (this.alert.firing) {
        const dur = t - this.alert.since;
        this.alerts.unshift({ name: 'PodsNotReady', dur, t });
        if (this.alerts.length > 4) this.alerts.pop();
        this.emit('Normal', 'Resolved', 'alert/PodsNotReady', `self-healed in ${dur.toFixed(1)}s`);
      }
      this.alert = null;
      this.pager.state = 'ok'; this.pager.t = t;
    }

    if ((this.timers.stats += dt) > 0.25) {
      this.timers.stats = 0;
      this.hooks.onStats?.({
        ready, desired: this.desired, rps: Math.round(this.series.rps.at(-1)), lat: Math.round(this.lat),
        tag: this.tagName(this.target), run: this.runN, phase: this.phase, chaos: this.chaos, deploys: this.deploys,
        firing: !!this.alert?.firing,
      });
    }
  }

  // ---------- drawing primitives ----------
  get px() { return 1 / this.cam.z; } // one CSS pixel in world units

  text(s, x, y, size, color, o = {}) {
    const ctx = this.ctx;
    if (size * this.cam.z < 3) { // level of detail: unreadable text becomes a soft bar
      const w = s.length * size * 0.56;
      const bx = o.align === 'right' ? x - w : o.align === 'center' ? x - w / 2 : x;
      ctx.fillStyle = A(color, 0.28);
      ctx.fillRect(bx, y - size * 0.2, w, size * 0.4);
      return;
    }
    ctx.font = `${o.weight || 400} ${size}px ${o.mono === false || o.sans ? SANS : MONO}`;
    ctx.fillStyle = color;
    ctx.textAlign = o.align || 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(s, x, y);
  }
  box(x, y, w, h, { fill, stroke, lw = 1, r = 10, dash } = {}) {
    const ctx = this.ctx;
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) {
      ctx.strokeStyle = stroke; ctx.lineWidth = lw * this.px;
      if (dash) ctx.setLineDash(dash.map((d) => d * this.px));
      ctx.stroke();
      if (dash) ctx.setLineDash([]);
    }
  }
  poly(pts, color, lw = 1) {
    const ctx = this.ctx;
    ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.strokeStyle = color; ctx.lineWidth = lw * this.px; ctx.lineJoin = 'round';
    ctx.stroke();
  }
  zone(key) {
    const z = ZONES[key], on = this.active?.includes(key);
    this.box(z.x, z.y, z.w, z.h, { fill: C.zone, stroke: on ? C.faint : C.line, r: 24 });
    this.text(z.n, z.x + 4, z.y - 30, 18, on ? C.accent : C.mute, { sans: true, weight: 500 });
    this.text(z.label, z.x + 38, z.y - 30, 18, on ? C.ink : C.mute, { sans: true, weight: 500 });
  }
  dot(x, y, status, r = 9) {
    const ctx = this.ctx;
    ctx.lineWidth = 2 * this.px;
    if (status === 'success') {
      ctx.fillStyle = C.ok; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = C.zone; ctx.beginPath(); ctx.moveTo(x - r * 0.45, y); ctx.lineTo(x - r * 0.1, y + r * 0.38); ctx.lineTo(x + r * 0.5, y - r * 0.35); ctx.stroke();
    } else if (status === 'running') {
      ctx.strokeStyle = A(C.warn, 0.25); ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
      ctx.strokeStyle = C.warn; ctx.beginPath(); ctx.arc(x, y, r, this.t * 6, this.t * 6 + Math.PI * 1.2); ctx.stroke();
    } else {
      ctx.strokeStyle = C.faint; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
    }
  }

  // ---------- render ----------
  renderView(v) {
    this.ctx = v.ctx; this.cam = v.cam; this.active = v.active; this.hover = v.hover;
    const { ctx, cam } = this, dpr = v.dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = C.bg;
    ctx.fillRect(0, 0, v.canvas.width, v.canvas.height);
    ctx.setTransform(cam.z * dpr, 0, 0, cam.z * dpr, dpr * (cam.ax - cam.cx * cam.z), dpr * (cam.ay - cam.cy * cam.z));
    this.drawEdges();
    this.drawGit();
    this.drawCI();
    this.drawRegistry();
    this.drawCluster();
    this.drawObserve();
    this.drawPager();
    this.drawPackets();
  }

  drawEdges() {
    const P = this.geo.paths;
    for (const k of ['git', 'ci', 'reg', 'scrape', 'page', 'internet']) this.poly(P[k], C.faint, 1.5);
    const i = this.geo.internet, ctx = this.ctx;
    ctx.strokeStyle = C.mute; ctx.lineWidth = 1.5 * this.px;
    ctx.beginPath(); ctx.arc(i.x, i.y, 26, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.ellipse(i.x, i.y, 11, 26, 0, 0, Math.PI * 2); ctx.moveTo(i.x - 26, i.y); ctx.lineTo(i.x + 26, i.y); ctx.stroke();
    this.text('Users', i.x + 42, i.y, 18, C.mute, { sans: true, weight: 500 });
  }

  drawGit() {
    const z = ZONES.git, t = this.t;
    this.zone('git');
    this.text('platform', z.x + 40, z.y + 52, 24, C.ink, { sans: true, weight: 600 });
    this.box(z.x + 160, z.y + 36, 64, 30, { fill: C.bg, r: 15 });
    this.text('main', z.x + 192, z.y + 51, 14, C.ink2, { align: 'center' });

    const x0 = z.x + 70, y0 = z.y + 116, sp = 54;
    const e = ease(clamp((t - this.commits[0].t) / 0.6, 0, 1));
    const n = Math.min(this.commits.length, 8);
    this.poly([{ x: x0, y: y0 - sp + e * sp }, { x: x0, y: y0 + (n - 1) * sp }], C.faint, 2);
    for (let i = 0; i < n; i++) {
      const cm = this.commits[i];
      const y = y0 + (i - 1 + e) * sp;
      this.ctx.globalAlpha = i === 0 ? e : i === n - 1 ? 1 - e : 1;
      let x = x0;
      if (cm.lane) {
        x = x0 + 34;
        this.poly([{ x: x0, y: y + sp * 0.75 }, { x, y: y + sp * 0.35 }, { x, y }, { x: x0, y: y - sp * 0.5 }], C.faint, 2);
      }
      const head = i === 0;
      this.ctx.beginPath(); this.ctx.arc(x, y, head ? 10 : 7, 0, Math.PI * 2);
      this.ctx.fillStyle = head ? C.accent : C.zone; this.ctx.fill();
      this.ctx.strokeStyle = head ? C.accent : C.ink2; this.ctx.lineWidth = 2 * this.px; this.ctx.stroke();
      this.text(cm.hash, x0 + 80, y, 15, head ? C.accent : C.mute);
      this.text(cm.msg, x0 + 165, y, 15, head ? C.ink : C.ink2);
    }
    this.ctx.globalAlpha = 1;
  }

  drawCI() {
    const z = ZONES.ci, r = this.run, t = this.t;
    this.zone('ci');
    this.text('deploy.yml', z.x + 40, z.y + 52, 24, C.ink, { sans: true, weight: 600 });
    this.text(`Run #${r.n} · ${r.cm.hash}`, z.x + 190, z.y + 53, 15, C.mute);
    this.dot(z.x + z.w - 50, z.y + 52, r.done ? 'success' : 'running', 11);

    const bx = (j) => z.x + 40 + j.col * 215, by = (j) => z.y + 120 + j.row * 100, W = 180, H = 60;
    for (const j of r.jobs) for (const need of j.needs) {
      const d = r.jobs.find((q) => q.id === need);
      this.poly(route({ x: bx(d) + W, y: by(d) + H / 2 }, { x: bx(j), y: by(j) + H / 2 }), d.status === 'success' ? A(C.ok, 0.5) : C.faint, 2);
    }
    for (const j of r.jobs) {
      const x = bx(j), y = by(j), live = j.status === 'running';
      this.box(x, y, W, H, { fill: live ? A(C.warn, 0.08) : C.bg, stroke: live ? A(C.warn, 0.6) : null, lw: 1.5, r: 12 });
      this.dot(x + 26, y + H / 2, j.status, 9);
      this.text(j.label, x + 46, y + H / 2 - 9, 14, j.status === 'queued' ? C.mute : C.ink);
      const sec = j.status === 'running' ? t - j.st : j.status === 'success' ? j.took : null;
      this.text(sec == null ? 'queued' : `${sec.toFixed(1)}s`, x + 46, y + H / 2 + 12, 12, C.mute);
    }

    const cur = r.jobs.find((j) => j.status === 'running') || r.jobs[r.jobs.length - 1];
    const ly = z.y + 350;
    this.box(z.x + 40, ly - 28, z.w - 80, 116, { fill: C.bg, r: 12 });
    const frac = cur.status === 'running' ? (t - cur.st) / cur.dur : 1;
    cur.log.forEach((line, i) => {
      if (frac < i / cur.log.length) return;
      const s = line.replace('{hash}', r.cm.hash).replace('{tag}', `krystian-niwa:${this.tagName(this.version + (r.done ? 0 : 1))}`).replace('{sha}', 'a91f…' + r.cm.hash);
      this.text(`${i === 0 ? '$' : ' '} ${s}`, z.x + 62, ly + i * 28, 14, i === 0 ? C.ink : C.ink2);
    });

    this.text('Recent runs', z.x + 40, z.y + 490, 15, C.mute, { sans: true, weight: 500 });
    this.runs.slice(0, 3).forEach((run, i) => {
      const y = z.y + 522 + i * 26;
      this.text('✓', z.x + 40, y, 14, C.ok);
      this.text(`#${run.n}`, z.x + 64, y, 14, C.mute);
      this.text(run.msg, z.x + 130, y, 14, C.ink2);
      this.text(`${run.dur.toFixed(1)}s`, z.x + z.w - 40, y, 14, C.mute, { align: 'right' });
    });
  }

  drawRegistry() {
    const z = ZONES.registry, t = this.t;
    this.zone('registry');
    this.text('krystian-niwa', z.x + 40, z.y + 52, 24, C.ink, { sans: true, weight: 600 });
    this.tags.slice(0, 4).forEach((tg, i) => {
      const y = z.y + 104 + i * 36;
      const fresh = t - tg.t < 1.2;
      if (fresh) this.box(z.x + 28, y - 16, z.w - 56, 32, { fill: A(C.accent, 0.14 * (1 - (t - tg.t) / 1.2)), r: 8 });
      this.text(tg.tag, z.x + 40, y, 15, i === 0 ? C.ink : C.ink2, { weight: i === 0 ? 500 : 400 });
      this.text(`sha256:${tg.sha}`, z.x + 150, y, 14, C.mute);
      if (i === 0) { this.box(z.x + z.w - 120, y - 14, 80, 28, { fill: C.ink, r: 14 }); this.text('latest', z.x + z.w - 80, y, 13, C.zone, { align: 'center' }); }
    });

    const base = z.y + z.h - 46, lh = 30;
    LAYERS.forEach((l, i) => {
      const w = z.w - 80 - i * 22, x = z.x + (z.w - w) / 2, y = base - (i + 1) * (lh + 4);
      const hot = Math.max(0, 1 - Math.abs((t - this.layerPulse) * 9 - i));
      this.box(x, y, w, lh, { fill: hot > 0 ? A(C.accent, 0.08 + 0.25 * hot) : C.bg, r: 8 });
      this.text(l.name, x + 14, y + lh / 2, 13, C.ink2);
      this.text(l.size, x + w - 14, y + lh / 2, 12, C.mute, { align: 'right' });
    });
  }

  drawCluster() {
    const z = ZONES.cluster, g = this.geo, t = this.t;
    this.zone('cluster');
    const rolling = this.phase === 'rolling';

    const a = g.api;
    this.box(a.x, a.y, a.w, a.h, { fill: rolling ? A(C.accent, 0.08) : C.bg, stroke: rolling ? A(C.accent, 0.6) : null, lw: 1.5, r: 14 });
    this.text('Control plane', a.x + 18, a.y + 28, 15, C.ink, { sans: true, weight: 600 });
    this.text('deploy/krystian-niwa', a.x + 18, a.y + 56, 12, C.mute);
    this.text(rolling ? `Rolling → ${this.tagName(this.target)}` : `Stable · ${this.tagName(this.target)}`, a.x + 18, a.y + 82, 13, rolling ? C.accent : C.ok, { weight: 500 });

    const ing = g.ingress;
    this.box(ing.x, ing.y, ing.w, ing.h, { fill: C.bg, r: 14 });
    this.text('Ingress', ing.x + 18, ing.y + 30, 15, C.ink, { sans: true, weight: 600 });
    this.text(`${Math.round(this.series.rps.at(-1))} req/s`, ing.x + 18, ing.y + 62, 14, C.accent, { weight: 500 });
    this.text(`p95 ${Math.round(this.lat)} ms`, ing.x + 18, ing.y + 90, 13, C.mute);

    g.nodes.forEach((n, i) => {
      const meta = this.nodes[i];
      this.box(n.x, n.y, n.w, n.h, { fill: C.bg, r: 16 });
      this.ctx.fillStyle = C.ok; this.ctx.beginPath(); this.ctx.arc(n.x + 24, n.y + 30, 5, 0, Math.PI * 2); this.ctx.fill();
      this.text(meta.name, n.x + 38, n.y + 30, 12, C.mute);
      [['cpu', meta.cpu], ['mem', meta.mem]].forEach(([k, v], j) => {
        const y = n.y + 340 + j * 34;
        this.text(k, n.x + 22, y, 12, C.mute);
        this.box(n.x + 66, y - 5, 190, 10, { fill: C.line, r: 5 });
        this.box(n.x + 66, y - 5, 190 * v, 10, { fill: v > 0.7 ? C.warn : C.ink2, r: 5 });
      });
      const count = this.pods.filter((p) => p.node === i && p.state !== 'terminating').length;
      this.text(`${count}/${SLOTS} pods`, n.x + 22, n.y + 416, 12, C.mute);
    });

    for (const p of this.pods) {
      const r = this.podRect(p.node, p.slot), age = t - p.t0;
      const isNew = p.v === this.target, hov = this.hover === p;
      const cx = r.x + r.w / 2;
      let label, color = C.ink2;
      if (p.state === 'pending') {
        this.box(r.x, r.y, r.w, r.h, { fill: C.zone, stroke: C.mute, dash: [5, 5], lw: 1.5, r: 14 });
        label = 'Pending'; color = C.mute;
      } else if (p.state === 'creating') {
        const f = clamp(age / T_CREATE, 0, 1);
        this.box(r.x, r.y, r.w, r.h, { fill: C.zone, stroke: A(C.warn, 0.7), lw: 1.5, r: 14 });
        this.ctx.save(); this.ctx.beginPath(); this.ctx.roundRect(r.x, r.y, r.w, r.h, 14); this.ctx.clip();
        this.ctx.fillStyle = A(C.warn, 0.16); this.ctx.fillRect(r.x, r.y + r.h * (1 - f), r.w, r.h * f); this.ctx.restore();
        label = 'Starting'; color = C.warn;
      } else if (p.state === 'running') {
        const flash = Math.max(0, 1 - (t - p.hit) * 5);
        this.box(r.x, r.y, r.w, r.h, {
          fill: hov ? A(C.err, 0.1) : A(C.ok, (isNew ? 0.1 : 0.04) + flash * 0.1),
          stroke: hov ? C.err : isNew ? A(C.ok, 0.7) : C.faint, lw: hov ? 2.5 : 1.5, r: 14,
        });
        label = 'Running'; color = isNew ? C.ok : C.mute;
      } else {
        this.ctx.globalAlpha = 1 - clamp(age / T_TERM, 0, 1);
        this.box(r.x, r.y, r.w, r.h, { fill: A(C.err, 0.1), stroke: C.err, lw: 1.5, r: 14 });
        label = 'Stopping'; color = C.err;
      }
      this.text(p.id.slice(-5), cx, r.y + 32, 16, C.ink, { align: 'center', weight: 500 });
      this.text(this.tagName(p.v), cx, r.y + 58, 12, C.mute, { align: 'center' });
      this.text(hov ? 'Click to kill' : label, cx, r.y + 84, 12, hov ? C.err : color, { align: 'center', weight: 500 });
      this.ctx.globalAlpha = 1;
    }

    const live = this.pods.filter((p) => p.state === 'running').length;
    this.text(`${live}/${this.desired} replicas ready · rolling updates, max surge ${SURGE}`, z.x + 270, z.y + 600, 15, live < this.desired ? C.warn : C.ink2);
    this.text('Click any pod to break it. The platform replaces it.', z.x + 270, z.y + 640, 15, C.accent, { weight: 500 });
  }

  chart(x, y, w, h, title, data, color, o = {}) {
    this.box(x, y, w, h, { fill: C.bg, r: 14 });
    this.text(title, x + 20, y + 28, 14, C.mute, { sans: true, weight: 500 });
    const last = data.at(-1);
    this.text(String(Math.round(last)), x + w - 20, y + 30, 24, color, { align: 'right', sans: true, weight: 600 });
    const min = o.min ?? Math.min(...data), max = o.max ?? Math.max(...data) * 1.1;
    const px = x + 20, py = y + 56, pw = w - 40, ph = h - 74;
    const Y = (v) => py + ph - clamp((v - min) / (max - min || 1), 0, 1) * ph;
    if (o.threshold != null) this.poly([{ x: px, y: Y(o.threshold) }, { x: px + pw, y: Y(o.threshold) }], A(C.err, 0.35), 1);
    const ctx = this.ctx;
    ctx.beginPath();
    let prev = null;
    data.forEach((v, i) => {
      const X = px + (i / (data.length - 1)) * pw, YY = Y(v);
      if (!i) ctx.moveTo(X, YY);
      else { if (o.step) ctx.lineTo(X, prev); ctx.lineTo(X, YY); }
      prev = YY;
    });
    ctx.strokeStyle = color; ctx.lineWidth = 2 * this.px; ctx.lineJoin = 'round'; ctx.stroke();
    ctx.lineTo(px + pw, py + ph); ctx.lineTo(px, py + ph); ctx.closePath();
    ctx.fillStyle = A(color, 0.08); ctx.fill();
  }

  drawObserve() {
    const z = ZONES.observe;
    this.zone('observe');
    this.text('Platform overview', z.x + 40, z.y + 52, 24, C.ink, { sans: true, weight: 600 });
    const s = this.series;
    this.chart(z.x + 30, z.y + 86, z.w - 60, 200, 'Requests / s', s.rps, C.accent, { min: 0 });
    this.chart(z.x + 30, z.y + 304, (z.w - 80) / 2, 170, 'Ready pods', s.ready, C.ok, { min: 0, max: 12, step: true, threshold: this.desired });
    this.chart(z.x + 50 + (z.w - 80) / 2, z.y + 304, (z.w - 80) / 2, 170, 'p95 latency (ms)', s.lat, C.warn, { min: 0 });

    const y = z.y + 494, f = this.alert?.firing;
    this.box(z.x + 30, y, z.w - 60, 136, { fill: f ? A(C.err, 0.08) : C.bg, stroke: f ? A(C.err, 0.6) : null, lw: 1.5, r: 14 });
    this.text('Alerts', z.x + 50, y + 30, 14, C.mute, { sans: true, weight: 500 });
    const rows = [[f ? 'Firing' : 'OK', f ? C.err : C.ok, 'PodsNotReady', 'ready < 9 for 0.6s'], ['OK', C.ok, 'BackupJobFailed', 'last veeam job ≠ success']];
    rows.forEach(([st, col, name, expr], i) => {
      const yy = y + 66 + i * 36;
      this.box(z.x + 50, yy - 13, 72, 26, { fill: A(col, 0.14), r: 13 });
      this.text(st, z.x + 86, yy, 13, col, { align: 'center', weight: 500 });
      this.text(name, z.x + 142, yy, 14, C.ink, { weight: 500 });
      this.text(expr, z.x + 340, yy, 13, C.mute);
    });
  }

  drawPager() {
    const z = ZONES.pager, t = this.t, paging = this.pager.state === 'paging';
    this.zone('pager');
    this.text('On-call', z.x + 40, z.y + 52, 24, C.ink, { sans: true, weight: 600 });
    const bx = z.x + 30, by = z.y + 86, bw = z.w - 60, bh = 170;
    const blink = paging && Math.sin(t * 12) > 0;
    this.box(bx, by, bw, bh, { fill: paging ? A(C.err, blink ? 0.16 : 0.08) : C.bg, stroke: paging ? C.err : null, lw: 2, r: 16 });
    this.text('Primary', bx + 26, by + 32, 14, C.mute, { sans: true, weight: 500 });
    this.text('Krystian Niwa', bx + 26, by + 78, 44, C.ink, { sans: true, weight: 600 });
    this.text(paging ? '● Paging' : '● All quiet', bx + 26, by + 130, 16, paging ? C.err : C.ok, { weight: 500 });

    this.text('Recent incidents', z.x + 40, z.y + 296, 15, C.mute, { sans: true, weight: 500 });
    const list = this.alerts.length ? this.alerts : [{ name: 'None yet. Try breaking a pod.', dur: null }];
    list.slice(0, 4).forEach((al, i) => {
      const y = z.y + 330 + i * 32;
      this.text(al.dur == null ? '·' : '✓', z.x + 40, y, 15, al.dur == null ? C.mute : C.ok);
      this.text(al.name, z.x + 66, y, 15, C.ink2);
      if (al.dur != null) this.text(`resolved in ${al.dur.toFixed(1)}s`, z.x + z.w - 40, y, 14, C.mute, { align: 'right' });
    });
  }

  drawPackets() {
    const ctx = this.ctx;
    for (const p of this.packets) {
      const col = C[p.color] || C.accent;
      const s = Math.max(p.size, 3.5 * this.px);
      const head = this.posAt(p, p.d), tail = this.posAt(p, p.d - 70);
      ctx.strokeStyle = A(col, 0.3); ctx.lineWidth = s * 0.6; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(tail.x, tail.y); ctx.lineTo(head.x, head.y); ctx.stroke();
      ctx.fillStyle = col; ctx.beginPath(); ctx.arc(head.x, head.y, s * 0.6, 0, Math.PI * 2); ctx.fill();
    }
    ctx.lineCap = 'butt';
  }
}
