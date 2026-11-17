// Content shared by the simulation and the terminal.
// Page copy lives in index.html so it stays crawlable without JS.

export const PROFILE = {
  name: 'Krystian Niwa',
  handle: 'krystian-niwa',
  role: 'Platform & DevOps Engineer',
  location: 'Poland',
  email: 'krystianniwa.poczta@gmail.com',
  linkedin: 'https://www.linkedin.com/in/krystian-niwa/',
  cv: 'assets/cv.pdf',
};

// Commit messages the simulated repo pushes, in order (they loop).
export const COMMIT_MSGS = [
  'feat(tf): azure landing zone module',
  'feat(gha): reusable deploy workflow',
  'fix: it was dns. it is always dns',
  'chore: bump azurerm provider',
  'feat: golden path for app service',
  'refactor(ps): idempotent ad sync',
  'fix(ansible): handlers run once',
  'feat(obs): alert on failed backups',
  'feat: policy-as-code for tagging',
  'test: pester coverage for modules',
  'perf: cache tf providers in ci',
  'feat(ai): ticket triage assistant',
];

// GitHub Actions jobs rendered in the CI zone.
export const JOBS = [
  { id: 'checkout', label: 'checkout',        col: 0, row: 0.5, dur: 0.7, needs: [],
    log: ['actions/checkout@v5', 'fetching 1 commit', 'HEAD is now at {hash}'] },
  { id: 'lint',     label: 'tf fmt · tflint', col: 1, row: 0,   dur: 1.1, needs: ['checkout'],
    log: ['terraform fmt -check -recursive', 'tflint --recursive', '0 issue(s) found'] },
  { id: 'test',     label: 'pester · pytest', col: 1, row: 1,   dur: 1.5, needs: ['checkout'],
    log: ['Invoke-Pester -CI', 'Tests Passed: 48, Failed: 0', 'pytest -q · 31 passed'] },
  { id: 'build',    label: 'build',           col: 2, row: 0.5, dur: 1.4, needs: ['lint', 'test'],
    log: ['docker buildx build --push .', 'terraform plan -out=tfplan', 'artifacts ready'] },
  { id: 'deploy',   label: 'deploy',          col: 3, row: 0.5, dur: 0.8, needs: ['build'],
    log: ['az acr login -n kniwa', 'pushing {tag}', 'digest: sha256:{sha}'] },
];

// Artifact layers, bottom → top (registry zone).
export const LAYERS = [
  { name: 'base · linux · windows server',        size: '412MB' },
  { name: 'identity · entra id · active directory', size: '96MB' },
  { name: 'network · fortigate · aruba',           size: '88MB' },
  { name: 'virtualization · vmware · proxmox',     size: '1.4GB' },
  { name: 'backup · veeam · azure backup',         size: '780MB' },
  { name: 'observability · grafana · zabbix',      size: '230MB' },
  { name: 'cloud · azure · gcp',                   size: '1.9GB' },
  { name: 'iac · terraform · ansible',             size: '640MB' },
  { name: 'ci/cd · github actions',                size: '120MB' },
  { name: 'automation · powershell · python',      size: '64MB' },
];

export const REVISIONS = [
  { rev: 3, role: 'Platform Operations Engineer', org: 'Etteplan', when: '2025 → now' },
  { rev: 2, role: 'IT Administrator', org: 'Grupa Familijna', when: '2024 → 2025' },
  { rev: 1, role: 'IT Support Specialist', org: 'SI-Consulting / Akquinet', when: '2023 → 2024' },
];

export const CERTS = [
  'AZ-800 · Windows Server Hybrid Core Infrastructure',
  'AZ-040 · Automate Administration with PowerShell',
  'AZ-900 · Azure Fundamentals',
  'MS-900 · Microsoft 365 Fundamentals',
  'Fortinet Certified Associate in Cybersecurity',
  'CCNA · Introduction to Networks',
  'Cisco Cybersecurity Essentials',
  'AWS Academy Cloud Foundations',
];
