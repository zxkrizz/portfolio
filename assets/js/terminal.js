// Drop-down shell. Talks to the live simulation, so `kubectl get pods` shows real (simulated) state.

import { PROFILE, CERTS, LAYERS } from './data.js';

const PROMPT = 'visitor@krystian-niwa:~$';

export class Terminal {
  constructor(root, sim, api) {
    this.root = root;
    this.sim = sim;
    this.api = api; // { goto(id), close() }
    this.out = root.querySelector('.term-out');
    this.input = root.querySelector('.term-input');
    this.history = [];
    this.hi = 0;
    this.greeted = false;

    this.commands = {
      help: () => this.help(),
      whoami: () => [`${PROFILE.handle} — ${PROFILE.role.toLowerCase()} · ${PROFILE.location.toLowerCase()}`, 'building and running enterprise azure platforms @ etteplan'],
      ls: () => ['about.md  cv.yaml  cv.pdf  skills/  projects/  .secrets'],
      'cat about.md': () => ['Infrastructure first — servers, networks, hypervisors, backups — then cloud.', 'Today: Azure platforms, Terraform, GitHub Actions, observability.', 'Optimising for one thing: making the right way the easy way.'],
      'cat cv.yaml': () => this.cvYaml(),
      'cat .secrets': () => [{ cls: 'err', text: 'permission denied — secrets live in key vault, not in repos.' }],
      'cat cv.pdf': () => ['binary file. try `cv` to open it.'],
      'ls skills': () => LAYERS.map((l) => `  ${l.name}`),
      'ls projects': () => ['azure-golden-paths/  homelab/  ops-automation/  this-site/'],
      'kubectl get pods': () => this.pods(),
      'kubectl get deploy': () => this.deploy(),
      'kubectl rollout history deploy/krystian-niwa': () => this.history_(),
      'kubectl rollout history': () => this.history_(),
      'kubectl delete pod --all': () => this.chaos(),
      'kubectl get certs': () => ['NAME' + ' '.repeat(52) + 'STATUS', ...CERTS.map((c) => `${c.padEnd(56)}Passing`)],
      'git log': () => this.sim.commits.slice(0, 6).map((c, i) => `${c.hash}${i === 0 ? ' (HEAD -> main)' : ''} ${c.msg}`),
      'gh run list': () => this.sim.runs.map((r) => `✓  #${r.n}  ${r.msg.padEnd(36)} ${r.dur.toFixed(1)}s`),
      'terraform plan': () => this.plan(),
      'terraform apply': () => [{ cls: 'err', text: 'Error: apply requires approval from a hiring manager.' }, 'hint: run `contact`'],
      contact: () => this.contact(),
      cv: () => { window.open(PROFILE.cv, '_blank', 'noopener'); return ['opening cv.pdf…']; },
      linkedin: () => { window.open(PROFILE.linkedin, '_blank', 'noopener'); return ['opening linkedin…']; },
      'sudo hire krystian': () => { location.href = `mailto:${PROFILE.email}?subject=${encodeURIComponent('Let\'s talk — Platform / DevOps role')}`; return [{ cls: 'ok', text: '[sudo] permission granted. opening mail client…' }]; },
      'ping krystian': () => ['PING krystian (open-to-work): 56 data bytes', '64 bytes from krystian: icmp_seq=0 ttl=64 time<24h', '--- 1 packets transmitted, 1 received, 0% packet loss ---'],
      clear: () => { this.out.textContent = ''; return []; },
      exit: () => { this.api.close(); return []; },
    };
    this.aliases = { 'k get pods': 'kubectl get pods', 'k get po': 'kubectl get pods', 'kubectl get po': 'kubectl get pods', 'k delete pod --all': 'kubectl delete pod --all', 'kubectl get deployment': 'kubectl get deploy', 'cat cv': 'cat cv.yaml', 'sudo hire': 'sudo hire krystian', 'hire': 'sudo hire krystian', 'k rollout history': 'kubectl rollout history' };

    this.input.addEventListener('keydown', (e) => this.onKey(e));
    root.addEventListener('click', (e) => { if (e.target.closest('a,button')) return; this.input.focus(); });
  }

  open() {
    this.root.classList.add('open');
    this.root.setAttribute('aria-hidden', 'false');
    this.input.removeAttribute('tabindex');
    if (!this.greeted) {
      this.greeted = true;
      this.print([{ cls: 'mute', text: 'krystian-niwa platform shell · type `help` · esc to close' }]);
    }
    setTimeout(() => this.input.focus(), 30);
  }
  close() {
    this.root.classList.remove('open');
    this.root.setAttribute('aria-hidden', 'true');
    this.input.setAttribute('tabindex', '-1');
    this.input.blur();
  }
  get isOpen() { return this.root.classList.contains('open'); }

  print(lines) {
    for (const l of lines) {
      const div = document.createElement('div');
      if (typeof l === 'string') div.textContent = l;
      else if (l.href) { const a = document.createElement('a'); a.href = l.href; a.textContent = l.text; if (!l.href.startsWith('mailto')) { a.target = '_blank'; a.rel = 'noopener'; } div.append(l.label || '', a); }
      else { div.textContent = l.text; div.className = l.cls || ''; }
      this.out.append(div);
    }
    this.out.scrollTop = this.out.scrollHeight;
  }

  exec(raw) {
    const cmd = raw.trim().replace(/\s+/g, ' ');
    const echo = document.createElement('div');
    echo.className = 'echo';
    echo.textContent = `${PROMPT} ${raw}`;
    this.out.append(echo);
    if (!cmd) return;
    this.history.push(raw); this.hi = this.history.length;
    const key = this.aliases[cmd.toLowerCase()] || cmd.toLowerCase();
    const fn = this.commands[key];
    if (fn) this.print(fn() || []);
    else if (key.startsWith('kubectl delete pod')) this.print(this.killOne(key.split(' ').pop()));
    else if (key.startsWith('sudo')) this.print([{ cls: 'err', text: 'visitor is not in the sudoers file. this incident will be reported (to krystian, who will find it funny).' }]);
    else if (key.startsWith('rm -rf')) this.print([{ cls: 'err', text: 'nice try. state is in remote backend with soft-delete enabled.' }]);
    else this.print([{ cls: 'err', text: `command not found: ${cmd.split(' ')[0]}` }, 'try `help`']);
  }

  onKey(e) {
    if (e.key === 'Enter') { this.exec(this.input.value); this.input.value = ''; }
    else if (e.key === 'ArrowUp') { e.preventDefault(); if (this.hi > 0) this.input.value = this.history[--this.hi]; }
    else if (e.key === 'ArrowDown') { e.preventDefault(); this.hi = Math.min(this.history.length, this.hi + 1); this.input.value = this.history[this.hi] || ''; }
    else if (e.key === 'Tab') {
      e.preventDefault();
      const v = this.input.value.toLowerCase();
      const hits = Object.keys(this.commands).filter((c) => c.startsWith(v));
      if (hits.length === 1) this.input.value = hits[0];
      else if (hits.length > 1) this.print([hits.join('   ')]);
    } else if (e.key === 'Escape') { e.preventDefault(); this.api.close(); }
    e.stopPropagation();
  }

  // ---------- command bodies ----------
  help() {
    const rows = [
      ['whoami', 'who is this'],
      ['cat cv.yaml', 'the cv, as config'],
      ['kubectl get pods', 'live pods in the cluster'],
      ['kubectl delete pod --all', 'chaos engineering (go on)'],
      ['kubectl rollout history', 'recent deployments'],
      ['kubectl get certs', 'certifications'],
      ['git log · gh run list', 'what the pipeline is doing'],
      ['terraform plan', 'what happens if you hire me'],
      ['contact · cv · linkedin', 'reach out'],
      ['clear · exit', ''],
    ];
    return ['available commands:', ...rows.map(([c, d]) => `  ${c.padEnd(28)}${d}`)];
  }
  cvYaml() {
    return [
      'apiVersion: people/v1',
      'kind: Engineer',
      'metadata:',
      `  name: ${PROFILE.handle}`,
      '  labels: { role: platform-devops-engineer, cloud: azure, location: poland }',
      'spec:',
      '  stack: [azure, terraform, ansible, github-actions, powershell, python, vmware, proxmox]',
      '  observability: [zabbix, grafana, datadog, wazuh]',
      '  languages: { en: B2+, de: A2 }',
      `  certifications: ${CERTS.length}`,
      'status:',
      '  phase: Running',
    ];
  }
  pods() {
    const s = this.sim;
    const head = `${'NAME'.padEnd(22)}${'READY'.padEnd(8)}${'STATUS'.padEnd(20)}${'IMAGE'.padEnd(10)}NODE`;
    const map = { pending: 'Pending', creating: 'ContainerCreating', running: 'Running', terminating: 'Terminating' };
    return [head, ...s.pods.map((p) => `${p.id.padEnd(22)}${(p.state === 'running' ? '1/1' : '0/1').padEnd(8)}${map[p.state].padEnd(20)}${s.tagName(p.v).padEnd(10)}${s.nodes[p.node].name}`),
      { cls: 'mute', text: 'tip: kubectl delete pod <name>  ·  kubectl delete pod --all' }];
  }
  deploy() {
    const s = this.sim, ready = s.pods.filter((p) => p.state === 'running').length;
    return [`${'NAME'.padEnd(16)}${'READY'.padEnd(8)}${'UP-TO-DATE'.padEnd(12)}IMAGE`, `${'krystian-niwa'.padEnd(16)}${`${ready}/${s.desired}`.padEnd(8)}${String(s.pods.filter((p) => p.v === s.target).length).padEnd(12)}${s.tagName(s.target)}`];
  }
  history_() {
    return ['deployment.apps/krystian-niwa', `${'REVISION'.padEnd(10)}IMAGE`, ...[...this.sim.tags].reverse().map((t, i) => `${String(i + 1).padEnd(10)}krystian-niwa:${t.tag}`)];
  }
  chaos() {
    const victims = this.sim.killAll();
    this.api.goto('runtime');
    return [...victims.map((p) => `pod "${p.id}" deleted`), { cls: 'warn', text: 'watching the reconciler recover → see the cluster' }];
  }
  killOne(name) {
    const p = this.sim.pods.find((x) => x.id === name || x.id.endsWith(name));
    if (!p || !this.sim.kill(p, 'cli')) return [{ cls: 'err', text: `Error from server (NotFound): pods "${name}" not found` }];
    this.api.goto('runtime');
    return [`pod "${p.id}" deleted`];
  }
  plan() {
    return [
      'Terraform will perform the following actions:',
      '',
      { cls: 'ok', text: '  # team.platform_engineer will be created' },
      { cls: 'ok', text: '  + resource "team" "platform_engineer" {' },
      { cls: 'ok', text: '      + engineer      = "krystian-niwa"' },
      { cls: 'ok', text: '      + company       = "your-company"' },
      { cls: 'ok', text: '      + focus         = ["azure", "iac", "ci/cd", "platform"]' },
      { cls: 'ok', text: '      + ramp_up_time  = (known after apply, but short)' },
      { cls: 'ok', text: '    }' },
      '',
      'Plan: 1 to add, 0 to change, 0 to destroy.',
      { cls: 'mute', text: 'run `contact` to approve.' },
    ];
  }
  contact() {
    return [
      { label: 'email     ', href: `mailto:${PROFILE.email}`, text: PROFILE.email },
      { label: 'linkedin  ', href: PROFILE.linkedin, text: 'linkedin.com/in/krystian-niwa' },
      { label: 'cv        ', href: PROFILE.cv, text: 'cv.pdf' },
    ];
  }
}
