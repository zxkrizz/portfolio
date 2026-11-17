// Renders a photo as ASCII art into a <pre>, neofetch-style.
// The plain wall behind the subject is flood-filled from the top edge and left blank,
// so the portrait reads correctly on both light (dark ink) and dark (light ink) themes.

// light → dense (Paul Bourke's 70-level ramp, reversed)
const RAMP = " .'`^\",:;Il!i><~+_-?][}{1)(|/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$";

export function asciiPortrait(img, pre, { cols = 72, crop = [0.22, 0.05, 0.58, 0.8], cell = 0.6, tol = 70, step = 16 } = {}) {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const scheme = matchMedia('(prefers-color-scheme: dark)');
  let timer = 0;

  function frame() {
    const W = img.naturalWidth, H = img.naturalHeight;
    const [cx, cy, cw, ch] = crop;
    const sw = W * cw, sh = H * ch;
    const rows = Math.round(cols * (sh / sw) * cell);
    const c = document.createElement('canvas');
    c.width = cols; c.height = rows;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, W * cx, H * cy, sw, sh, 0, 0, cols, rows);
    const px = ctx.getImageData(0, 0, cols, rows).data;
    const n = cols * rows;
    const rgb = (i) => [px[i * 4], px[i * 4 + 1], px[i * 4 + 2]];

    // Background: flood fill from the top row through cells close to the median wall colour.
    const top = Array.from({ length: cols }, (_, x) => rgb(x)).sort((a, b) => a[0] + a[1] + a[2] - (b[0] + b[1] + b[2]));
    const wall = top[top.length >> 1];
    const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    const near = (i) => dist(rgb(i), wall) < tol * 0.5;
    // grow through gentle gradients (wall shading) but stop at real edges (hair, skin, shirt)
    const grow = (from, to) => dist(rgb(from), rgb(to)) < step && dist(rgb(to), wall) < tol;
    const bg = new Uint8Array(n);
    const stack = [];
    for (let x = 0; x < cols; x++) if (near(x)) { bg[x] = 1; stack.push(x); }
    for (let y = 0; y < rows; y++) for (const x of [0, cols - 1]) { const i = y * cols + x; if (!bg[i] && near(i)) { bg[i] = 1; stack.push(i); } }
    while (stack.length) {
      const i = stack.pop(), x = i % cols, y = (i / cols) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const X = x + dx, Y = y + dy;
        if (X < 0 || Y < 0 || X >= cols || Y >= rows) continue;
        const j = Y * cols + X;
        if (!bg[j] && grow(i, j)) { bg[j] = 1; stack.push(j); }
      }
    }

    // Luminance, sharpened (unsharp mask), then histogram-equalised over the subject only.
    const raw = new Float32Array(n);
    for (let i = 0; i < n; i++) { const [r, g, b] = rgb(i); raw[i] = 0.2126 * r + 0.7152 * g + 0.0722 * b; }
    const lum = new Float32Array(n);
    for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
      let sum = 0, k = 0;
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
        const X = x + dx, Y = y + dy;
        if (X >= 0 && Y >= 0 && X < cols && Y < rows) { sum += raw[Y * cols + X]; k++; }
      }
      const i = y * cols + x;
      lum[i] = raw[i] + 1.1 * (raw[i] - sum / k);
    }
    const fg = [];
    for (let i = 0; i < n; i++) if (!bg[i]) fg.push(lum[i]);
    fg.sort((a, b) => a - b);
    const rank = (v) => { let lo = 0, hi = fg.length; while (lo < hi) { const m = (lo + hi) >> 1; if (fg[m] < v) lo = m + 1; else hi = m; } return lo / (fg.length || 1); };
    const dark = scheme.matches;

    const lines = [];
    for (let y = 0; y < rows; y++) {
      let s = '';
      for (let x = 0; x < cols; x++) {
        const i = y * cols + x;
        if (bg[i]) { s += ' '; continue; }
        const v = rank(lum[i]);
        const d = dark ? v : 1 - v; // ink density: light ink on dark, dark ink on light
        s += RAMP[Math.max(1, Math.round(d * (RAMP.length - 1)))];
      }
      lines.push(s.replace(/\s+$/, ''));
    }
    return lines;
  }

  function render() {
    clearInterval(timer);
    const lines = frame();
    if (reduced) { pre.textContent = lines.join('\n'); return; }
    let i = 0;
    pre.textContent = '';
    timer = setInterval(() => {
      pre.textContent += (i ? '\n' : '') + lines[i];
      if (++i >= lines.length) clearInterval(timer);
    }, 22);
  }

  const go = () => { if (img.naturalWidth) render(); };
  if (img.complete) go(); else img.addEventListener('load', go, { once: true });
  scheme.addEventListener('change', go);
}
