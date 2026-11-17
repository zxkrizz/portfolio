// A GitHub Actions run rendered in the DOM, modelled on a real platform delivery workflow:
// parallel checks → build + Terraform plan → staging → approval gate → production → verify.
// Step durations are realistic seconds; the animation plays them back SCALE times faster.

const SCALE = 30;   // real seconds per animation second
const GATE = 2.6;   // animation seconds the production job waits for a reviewer

const RUNS = [
  'feat(network): private endpoints for storage accounts',
  'chore(terraform): bump azurerm provider',
  'feat(monitoring): alert on failed backup jobs',
  'fix(aks): pin node image version',
  'feat(identity): managed identity for the api',
];

// steps: [name, seconds, output?]
const JOBS = [
  { id: 'lint', name: 'Lint', logo: 'terraform', col: 0, needs: [], steps: [
    ['Set up job', 2], ['Run actions/checkout@v4', 3], ['Run hashicorp/setup-terraform@v3', 4],
    ['terraform fmt -check -recursive', 3], ['tflint --recursive', 9, '0 issue(s) found'], ['Complete job', 1]] },
  { id: 'test', name: 'Unit tests', logo: 'powershell', col: 0, needs: [], steps: [
    ['Set up job', 2], ['Run actions/checkout@v4', 3],
    ['Invoke-Pester -Path ./tests -CI', 24, 'Tests Passed: 48, Failed: 0, Skipped: 0'],
    ['pytest -q', 15, '31 passed in 4.21s'], ['Complete job', 1]] },
  { id: 'scan', name: 'Security scan', logo: 'github', mono: true, col: 0, needs: [], steps: [
    ['Set up job', 2], ['Run actions/checkout@v4', 3],
    ['checkov -d infra --compact', 17, 'Passed checks: 112, Failed checks: 0'],
    ['trivy fs --severity HIGH,CRITICAL .', 14, 'Total: 0 (HIGH: 0, CRITICAL: 0)'],
    ['Upload SARIF to code scanning', 4], ['Complete job', 1]] },
  { id: 'build', name: 'Build image', logo: 'docker', col: 1, needs: ['lint', 'test', 'scan'], steps: [
    ['Set up job', 2], ['Run azure/login@v2', 5, 'Federated credential (OIDC), no client secret'],
    ['Run docker/build-push-action@v6', 81, 'pushed kniwacr.azurecr.io/platform-api:{sha}'],
    ['Generate SBOM', 12, 'sbom.spdx.json · 214 packages'], ['Complete job', 1]] },
  { id: 'plan', name: 'Terraform plan', logo: 'terraform', col: 1, needs: ['lint', 'scan'], steps: [
    ['Set up job', 2], ['Run azure/login@v2', 5, 'Federated credential (OIDC), no client secret'],
    ['terraform init', 14, 'Successfully configured the backend "azurerm"!'],
    ['terraform plan · staging', 31, 'Plan: 3 to add, 1 to change, 0 to destroy.'],
    ['terraform plan · production', 33, 'Plan: 3 to add, 1 to change, 0 to destroy.'],
    ['Upload artifacts: tfplan-staging, tfplan-production', 4], ['Complete job', 1]] },
  { id: 'staging', name: 'Deploy staging', logo: 'kubernetes', env: 'staging', col: 2, needs: ['build', 'plan'], steps: [
    ['Set up job', 2], ['Download artifact: tfplan-staging', 3],
    ['terraform apply tfplan-staging', 47, 'Apply complete! Resources: 3 added, 1 changed, 0 destroyed.'],
    ['az aks get-credentials', 4],
    ['helm upgrade --install platform-api ./charts/api --atomic --wait', 58, 'Release "platform-api" has been upgraded.'],
    ['Smoke tests', 19, '14/14 checks passed'], ['Complete job', 1]] },
  { id: 'prod', name: 'Deploy production', logo: 'azure', env: 'production', gate: true, col: 3, needs: ['staging'], steps: [
    ['Set up job', 2], ['Download artifact: tfplan-production', 3],
    ['terraform apply tfplan-production', 52, 'Apply complete! Resources: 3 added, 1 changed, 0 destroyed.'],
    ['az aks get-credentials', 4],
    ['helm upgrade --install platform-api ./charts/api --atomic --wait', 66, 'Release "platform-api" has been upgraded.'],
    ['Complete job', 1]] },
  { id: 'verify', name: 'Verify', logo: 'grafana', col: 4, needs: ['prod'], steps: [
    ['Set up job', 2], ['Smoke tests · production', 21, '14/14 checks passed'],
    ['Check alerts and SLOs', 9, '0 alerts firing · error budget burn 0.3x'],
    ['Annotate release in Grafana', 3, 'release {sha}'], ['Complete job', 1]] },
];
for (const j of JOBS) {
  j.total = j.steps.reduce((a, s) => a + s[1], 0);
  j.dur = j.total / SCALE;
}

const hex = (n) => Array.from({ length: n }, () => '0123456789abcdef'[(Math.random() * 16) | 0]).join('');
const fmt = (s) => { s = Math.max(0, Math.round(s)); return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`; };
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

export function mountPipeline(root) {
  const $ = (s) => root.querySelector(s);
  const graph = $('[data-graph]'), svg = $('.gha-wires');
  const logHead = $('[data-log-head]'), logMeta = $('[data-log-meta]'), logEl = $('[data-log]');
  const $title = $('[data-run-title]'), $n = $('[data-run-n]'), $sha = $('[data-run-sha]');
  const $time = $('[data-run-time]'), $state = $('[data-run-state]'), $hint = $('[data-log-hint]');
  const envEls = Object.fromEntries([...root.querySelectorAll('[data-env]')].map((e) => [e.dataset.env, e]));

  // ---- build job graph ----
  const cols = [];
  for (const j of JOBS) {
    if (!cols[j.col]) { cols[j.col] = document.createElement('div'); cols[j.col].className = 'gha-col'; graph.append(cols[j.col]); }
    const el = document.createElement('button');
    el.type = 'button';
    el.className = 'job';
    el.innerHTML = `<span class="st" aria-hidden="true"></span><img src="assets/logos/${j.logo}.svg" alt="" class="${j.mono ? 'mono' : ''}"><span class="job-name">${j.name}</span><span class="job-time"></span>`;
    el.addEventListener('click', () => { pinned = pinned === j ? null : j; lastSig = ''; render(); });
    cols[j.col].append(el);
    j.el = el;
    j.timeEl = el.querySelector('.job-time');
  }

  function wires() {
    const g = graph.getBoundingClientRect();
    svg.setAttribute('viewBox', `0 0 ${g.width} ${g.height}`);
    const vertical = getComputedStyle(graph).flexDirection === 'column';
    const paths = [];
    for (const j of JOBS) for (const need of j.needs) {
      const a = JOBS.find((x) => x.id === need).el.getBoundingClientRect();
      const b = j.el.getBoundingClientRect();
      let p;
      if (vertical) {
        const x1 = a.left - g.left + 20, y1 = a.bottom - g.top, x2 = b.left - g.left + 20, y2 = b.top - g.top, my = (y1 + y2) / 2;
        p = `M${x1},${y1} C${x1},${my} ${x2},${my} ${x2},${y2}`;
      } else {
        const x1 = a.right - g.left, y1 = a.top + a.height / 2 - g.top, x2 = b.left - g.left, y2 = b.top + b.height / 2 - g.top, mx = (x1 + x2) / 2;
        p = `M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2},${y2}`;
      }
      paths.push(`<path data-from="${need}" d="${p}"/>`);
    }
    svg.innerHTML = paths.join('');
  }
  new ResizeObserver(wires).observe(graph);

  // ---- run state ----
  let runIdx = -1, runN = 213, t = 0, sha = '', state = {}, done = false, doneAt = 0, pinned = null, follow = null, lastSig = '';
  function reset() {
    runIdx = (runIdx + 1) % RUNS.length; runN++;
    t = 0; done = false; sha = hex(7); follow = null; lastSig = '';
    $title.textContent = RUNS[runIdx];
    $n.textContent = `#${runN}`; $sha.textContent = sha;
    for (const j of JOBS) state[j.id] = { status: 'queued', st: 0, waitAt: 0 };
  }
  reset();

  const elapsedReal = (j) => {
    const s = state[j.id];
    if (s.status === 'success') return j.total;
    if (s.status === 'running') return (t - s.st) * SCALE;
    return 0;
  };

  function tick(dt) {
    t += dt;
    if (done) { if (t - doneAt > 5) reset(); render(); return; }
    for (const j of JOBS) {
      const s = state[j.id];
      if (s.status === 'queued' && j.needs.every((n) => state[n].status === 'success')) {
        if (j.gate) { s.status = 'waiting'; s.waitAt = t; } else { s.status = 'running'; s.st = t; }
        follow = j;
      }
      if (s.status === 'waiting' && t - s.waitAt >= GATE) { s.status = 'running'; s.st = t; s.approved = true; }
      if (s.status === 'running' && t - s.st >= j.dur) s.status = 'success';
    }
    if (JOBS.every((j) => state[j.id].status === 'success')) { done = true; doneAt = t; }
    render();
  }

  function render() {
    for (const j of JOBS) {
      const s = state[j.id];
      j.el.dataset.status = s.status;
      j.el.classList.toggle('sel', (pinned || follow) === j);
      j.timeEl.textContent = s.status === 'queued' ? '' : s.status === 'waiting' ? 'waiting' : fmt(elapsedReal(j));
    }
    for (const p of svg.querySelectorAll('path')) p.classList.toggle('ok', state[p.dataset.from].status === 'success');

    const waiting = JOBS.some((j) => state[j.id].status === 'waiting');
    root.dataset.status = done ? 'success' : waiting ? 'waiting' : 'running';
    $state.textContent = done ? 'Success' : waiting ? 'Waiting for approval' : 'In progress';
    $time.textContent = fmt((done ? doneAt : t) * SCALE);

    for (const env of ['staging', 'production']) {
      const j = JOBS.find((x) => x.env === env), s = state[j.id];
      envEls[env].dataset.state = s.status === 'success' ? 'active' : s.status === 'queued' ? 'pending' : s.status;
    }
    renderLog();
  }

  function renderLog() {
    const j = pinned || follow || JOBS[0], s = state[j.id];
    const real = elapsedReal(j);
    // signature: only touch the DOM when something visible changed
    let cum = 0, doneSteps = 0;
    for (const st of j.steps) { if (s.status === 'success' || (s.status === 'running' && real >= cum + st[1])) doneSteps++; cum += st[1]; }
    const sig = `${j.id}|${s.status}|${doneSteps}|${pinned ? 1 : 0}|${sha}`;
    if (sig === lastSig) return;
    lastSig = sig;

    logHead.textContent = j.name;
    logMeta.textContent = j.env ? `environment: ${j.env}` : `runs-on: ubuntu-latest`;
    $hint.textContent = pinned ? 'pinned · click the job again to follow the run' : 'following the run · click any job to inspect it';

    if (s.status === 'queued') {
      logEl.innerHTML = `<li class="note">Queued. Waiting for ${j.needs.map((n) => JOBS.find((x) => x.id === n).name).join(', ')}.</li>`;
      return;
    }
    if (s.status === 'waiting') {
      logEl.innerHTML = '<li class="note gate">Waiting for review: production needs approval to start deploying changes.</li>';
      return;
    }
    let html = j.gate && s.approved ? '<li class="note ok">Approved by platform-leads</li>' : '';
    let c = 0;
    j.steps.forEach((st, i) => {
      const isDone = i < doneSteps, isRun = !isDone && s.status === 'running' && i === doneSteps;
      if (!isDone && !isRun) { html += `<li class="lstep" data-s="queued"><i></i><span>${esc(st[0])}</span><b></b></li>`; c += st[1]; return; }
      html += `<li class="lstep" data-s="${isDone ? 'done' : 'run'}"><i></i><span>${esc(st[0])}</span><b>${isDone ? fmt(st[1]) : ''}</b></li>`;
      if (isDone && st[2]) html += `<li class="out">${esc(st[2].replace('{sha}', sha))}</li>`;
      c += st[1];
    });
    logEl.innerHTML = html;
  }

  // Status changes are not vestibular motion, so the run keeps ticking with reduced motion too;
  // CSS freezes the spinners in that mode.
  let visible = false, last = performance.now();
  new IntersectionObserver(([e]) => { visible = e.isIntersecting; }).observe(root);
  requestAnimationFrame(function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    if (visible) tick(dt);
    requestAnimationFrame(frame);
  });
  root.tick = tick; // manual stepping for headless checks
}
