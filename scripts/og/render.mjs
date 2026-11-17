// Renders scripts/og/og.html to assets/img/og.png (1200x627) with a local Chromium browser.
// Usage: node scripts/og/render.mjs   (set BROWSER=path\to\chrome.exe to override)
import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = (p) => fileURLToPath(new URL(p, import.meta.url));
const candidates = [
  process.env.BROWSER,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files/BraveSoftware/Brave-Browser/Application/brave.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium',
].filter(Boolean);
const browser = candidates.find((p) => existsSync(p));
if (!browser) throw new Error('No Chromium browser found; set BROWSER=...');

const out = here('../../assets/img/og.png');
execFileSync(browser, [
  '--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
  '--window-size=1200,627', '--virtual-time-budget=6000', '--allow-file-access-from-files',
  `--screenshot=${out}`, pathToFileURL(here('./og.html')).href,
], { stdio: 'inherit' });
console.log('wrote', out);
