# krystian-niwa / portfolio

Personal site of Krystian Niwa, Platform & DevOps Engineer. Static, zero dependencies, no build step.

**Sections:** neofetch-style hero (ASCII portrait generated from the photo), growth story with an
illustrative responsibility heatmap, a simulated GitHub Actions delivery run (clickable jobs and step
logs), a live platform simulation that follows the "approach" steps, projects, stack, certifications
and contact. Light/dark theme follows the system and can be switched manually.

- Click a pod in the simulation to kill it; it gets replaced and the alert pages on-call.
- Press `` ` `` (or Ctrl/Cmd+K) for a shell: `help`, `kubectl get pods`, `kubectl delete pod --all`,
  `kubectl get certs`, `cat profile.yaml`, `contact`.

## Run locally

```bash
node scripts/dev-server.mjs
```

Open http://localhost:5173 (ES modules need http; `file://` will not work).

## Structure

| path | what |
| --- | --- |
| `index.html` | all page copy and meta (crawlable without JS) |
| `assets/css/style.css` | styles, light and dark themes (`[data-theme]`) |
| `assets/js/main.js` | page wiring, scroll-driven simulation camera, portrait toggle |
| `assets/js/sim.js` | platform simulation and canvas renderer |
| `assets/js/pipeline.js` | the GitHub Actions run |
| `assets/js/growth.js` | the responsibility heatmap |
| `assets/js/ascii.js` | ASCII portrait from the photo |
| `assets/js/theme.js` | theme toggle |
| `assets/js/terminal.js` | the shell easter egg |
| `assets/logos/` | tech logos (devicon / simple-icons) |
| `scripts/og/` | social preview template; `node scripts/og/render.mjs` regenerates `assets/img/og.png` |
| `.github/workflows/deploy.yml` | deploys to GitHub Pages on push to `main` |

## Deploy

Push to GitHub, then **Settings → Pages → Source: GitHub Actions**. The workflow replaces
`__SITE_URL__` in `index.html` with the Pages URL, so canonical, Open Graph and JSON-LD URLs are
absolute on the live site.
