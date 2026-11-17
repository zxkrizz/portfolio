// A GitHub Actions run rendered in the DOM: jobs, dependency wires, live log. Loops forever.

const JOBS = [
  { id: 'checkout', name: 'Checkout', logo: 'github', mono: true, col: 0, needs: [], dur: 1.0,
    log: ['Run actions/checkout@v5', 'Syncing repository: krystian-niwa/platform', 'HEAD is now at {sha}'] },
  { id: 'validate', name: 'Validate IaC', logo: 'terraform', col: 1, needs: ['checkout'], dur: 1.6,
    log: ['Run terraform fmt -check -recursive', 'Run terraform validate', 'Success! The configuration is valid.'] },
  { id: 'test', name: 'Unit tests', logo: 'powershell', col: 1, needs: ['checkout'], dur: 2.1,
    log: ['Run Invoke-Pester -CI', 'Tests completed in 3.1s', 'Tests Passed: 48, Failed: 0, Skipped: 0'] },
  { id: 'build', name: 'Build image', logo: 'docker', col: 2, needs: ['validate', 'test'], dur: 2.2,
    log: ['Run docker/build-push-action@v6', '#12 exporting layers done', 'pushed kniwa.azurecr.io/platform:{tag}'] },
  { id: 'plan', name: 'Plan infra', logo: 'azure', col: 2, needs: ['validate'], dur: 1.9,
    log: ['Run azure/login@v2 (OIDC, no secrets)', 'Run terraform plan -out=tfplan', 'Plan: 2 to add, 1 to change, 0 to destroy.'] },
  { id: 'deploy', name: 'Deploy to AKS', logo: 'kubernetes', col: 3, needs: ['build', 'plan'], dur: 2.4,
    log: ['Run terraform apply tfplan', 'Run helm upgrade --install platform ./chart', 'deployment "platform" successfully rolled out'] },
  { id: 'verify', name: 'Verify', logo: 'grafana', col: 4, needs: ['deploy'], dur: 1.5,
    log: ['Run smoke tests · 12/12 passed', 'Grafana annotation: release {tag}', 'Error budget burn: 0.2x'] },
];

const hex = (n) => Array.from({ length: n }, () => '0123456789abcdef'[(Math.random() * 16) | 0]).join('');

export function mountPipeline(root) {
  const graph = root.querySelector('[data-graph]');
  const svg = root.querySelector('.gha-wires');
  const logEl = root.querySelector('[data-log]');
  const logHead = root.querySelector('[data-log-head]');
  const $n = root.querySelector('[data-run-n]');
  const $sha = root.querySelector('[data-run-sha]');
  const $time = root.querySelector('[data-run-time]');
  const $status = root.querySelector('[data-run-status]');

  // columns
  const cols = [];
  for (const j of JOBS) {
    if (!cols[j.col]) {
      const c = document.createElement('div');
      c.className = 'gha-col';
      graph.append(c);
      cols[j.col] = c;
    }
    const el = document.createElement('div');
    el.className = 'job';
    el.innerHTML = `<span class="st" aria-hidden="true"></span><img src="assets/logos/${j.logo}.svg" alt="" class="${j.mono ? 'mono' : ''}"><span class="job-name">${j.name}</span><span class="job-time"></span>`;
    cols[j.col].append(el);
    j.el = el;
    j.timeEl = el.querySelector('.job-time');
  }

  function wires() {
    const g = graph.getBoundingClientRect();
    svg.setAttribute('viewBox', `0 0 ${g.width} ${g.height}`);
    const vertical = getComputedStyle(graph).flexDirection === 'column';
    let d = '';
    const paths = [];
    for (const j of JOBS) for (const need of j.needs) {
      const a = JOBS.find((x) => x.id === need).el.getBoundingClientRect();
      const b = j.el.getBoundingClientRect();
      let p;
      if (vertical) {
        const x1 = a.left - g.left + 18, y1 = a.bottom - g.top, x2 = b.left - g.left + 18, y2 = b.top - g.top, my = (y1 + y2) / 2;
        p = `M${x1},${y1} C${x1},${my} ${x2},${my} ${x2},${y2}`;
      } else {
        const x1 = a.right - g.left, y1 = a.top + a.height / 2 - g.top, x2 = b.left - g.left, y2 = b.top + b.height / 2 - g.top, mx = (x1 + x2) / 2;
        p = `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`;
      }
      paths.push(`<path data-from="${need}" d="${p}"/>`);
    }
    svg.innerHTML = paths.join('') + d;
  }
  new ResizeObserver(wires).observe(graph);

  let run = 128, t = 0, start = 0, sha = '', tag = '', state = {}, done = false, doneAt = 0, lastLog = null;
  function reset() {
    run++; t = 0; done = false; sha = hex(7); tag = `1.4.${run - 100}`;
    $n.textContent = `#${run}`; $sha.textContent = sha;
    for (const j of JOBS) { state[j.id] = { status: 'queued', st: 0, lines: 0 }; }
    logEl.textContent = '';
    lastLog = null;
  }
  reset();

  function render() {
    for (const j of JOBS) {
      const s = state[j.id];
      j.el.dataset.status = s.status;
      j.timeEl.textContent = s.status === 'queued' ? '' : `${Math.max(1, Math.round(s.status === 'running' ? t - s.st : j.dur))}s`;
    }
    for (const p of svg.querySelectorAll('path')) p.classList.toggle('ok', state[p.dataset.from].status === 'success');
    $time.textContent = `${Math.round(t)}s`;
    root.dataset.status = done ? 'success' : 'running';
    $status.setAttribute('aria-label', done ? 'Run succeeded' : 'Run in progress');
  }

  function log(j, line) {
    if (lastLog !== j) {
      lastLog = j;
      logHead.textContent = j.name;
      logEl.textContent = '';
    }
    const li = document.createElement('li');
    li.textContent = line.replace('{sha}', sha).replace('{tag}', tag);
    logEl.append(li);
  }

  function tick(dt) {
    t += dt;
    if (done) { if (t - doneAt > 3.5) reset(); render(); return; }
    for (const j of JOBS) {
      const s = state[j.id];
      if (s.status === 'queued' && j.needs.every((n) => state[n].status === 'success')) { s.status = 'running'; s.st = t; }
      if (s.status === 'running') {
        const f = (t - s.st) / j.dur;
        while (s.lines < j.log.length && f >= s.lines / j.log.length) log(j, j.log[s.lines++]);
        if (f >= 1) s.status = 'success';
      }
    }
    if (JOBS.every((j) => state[j.id].status === 'success')) { done = true; doneAt = t; }
    render();
  }

  // Status changes are not vestibular motion, so the run keeps ticking even with reduced motion;
  // CSS already freezes the spinners in that mode.
  let visible = false, last = performance.now();
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(root);
  requestAnimationFrame(function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (visible) tick(dt);
    requestAnimationFrame(frame);
  });
  root.tick = tick; // manual stepping for headless checks
}
