// "Growth" heatmap in the style of a GitHub contribution graph: one column per week since
// September 2023, intensity rising with how much of the stack Krystian was running.
// Illustrative, not real commit data: the caption on the page says so.

const START = new Date(Date.UTC(2023, 8, 4)); // Monday, 4 Sep 2023
const PHASES = [
  { from: new Date(Date.UTC(2023, 8, 1)), label: 'support & endpoints', base: 0.18 },
  { from: new Date(Date.UTC(2024, 5, 1)), label: 'servers, networks, VMware', base: 0.42 },
  { from: new Date(Date.UTC(2025, 11, 1)), label: 'enterprise Azure, platform engineering, CI/CD', base: 0.66, current: true },
  { from: new Date(Date.UTC(2026, 5, 1)), label: null, base: 0.8 }, // AI infrastructure, folded into the label above
];

// small deterministic PRNG so the pattern is stable between visits
function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function mountGrowth(grid, axis) {
  const rnd = mulberry32(2023);
  const now = new Date();
  const weeks = Math.floor((now - START) / (7 * 864e5)) + 1;
  const frag = document.createDocumentFragment();
  const fmt = new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric' });

  for (let w = 0; w < weeks; w++) {
    const weekStart = new Date(START.getTime() + w * 7 * 864e5);
    const phase = [...PHASES].reverse().find((p) => weekStart >= p.from) || PHASES[0];
    const t = w / Math.max(1, weeks - 1);
    const holiday = (weekStart.getUTCMonth() === 11 && weekStart.getUTCDate() > 20) || (weekStart.getUTCMonth() === 7 && rnd() < 0.35);
    for (let d = 0; d < 7; d++) {
      const weekend = d >= 5;
      let v = phase.base * 0.75 + t * 0.3 + (rnd() - 0.5) * 0.45;
      if (weekend) v = v * 0.35 + (rnd() < 0.12 + t * 0.25 ? 0.4 : 0); // homelab weekends, more of them lately
      if (holiday) v *= 0.25;
      const level = Math.max(0, Math.min(4, Math.round(v * 4.2)));
      const cell = document.createElement('i');
      cell.dataset.l = level;
      cell.style.setProperty('--w', w);
      frag.append(cell);
    }
  }
  grid.style.setProperty('--weeks', weeks);
  grid.append(frag);

  // phase labels positioned at the week each phase starts
  for (const p of PHASES) {
    if (!p.label) continue;
    const w = Math.max(0, Math.round((p.from - START) / (7 * 864e5)));
    const el = document.createElement('span');
    el.style.setProperty('--x', (w / weeks) * 100 + '%');
    el.innerHTML = `<b>${fmt.format(p.from)}${p.current ? ' – now' : ''}</b>${p.label}`;
    if (p.current) el.classList.add('current');
    axis.append(el);
  }

  // reveal column by column the first time the graph scrolls into view
  const io = new IntersectionObserver(([e]) => {
    if (!e.isIntersecting) return;
    grid.classList.add('on');
    io.disconnect();
  }, { threshold: 0.3 });
  io.observe(grid);
}
