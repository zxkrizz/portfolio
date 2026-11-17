# krystian-niwa / platform

Portfolio of a Platform & DevOps Engineer. Flat, typography-led layout with a live platform
simulation (`commit → GitHub Actions → registry → rolling update → Grafana → on-call`) shown in two
cards: an auto-touring hero, and a sticky card that follows the "How I work" steps as you scroll.
Light and dark themes follow the system setting.

- Zero dependencies, no build step — `index.html` + `assets/`.
- Click a pod in the cluster to kill it; the reconciler heals it and the alert pages on-call.
- Press `` ` `` (or Ctrl/Cmd+K) for a shell: `help`, `kubectl get pods`, `kubectl delete pod --all`, `terraform plan`, `cat cv.yaml`…

## Run locally

```bash
node scripts/dev-server.mjs
```

Open http://localhost:5173 (ES modules need http, `file://` will not work).

## Structure

| file | what |
| --- | --- |
| `index.html` | all page copy (crawlable without JS) |
| `assets/js/sim.js` | the simulation + canvas renderer |
| `assets/js/main.js` | scroll → camera, HUD, boot sequence |
| `assets/js/terminal.js` | the drop-down shell |
| `assets/js/data.js` | shared content (commits, jobs, layers, certs) |
| `.github/workflows/deploy.yml` | deploys to GitHub Pages on push to `main` |

## Deploy

Push to GitHub, then **Settings → Pages → Source: GitHub Actions**.
