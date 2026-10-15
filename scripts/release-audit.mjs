import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const failures = [];

const index = read('index.html');
const app = read('app.js');
const styles = read('styles.css');
const serviceWorker = read('service-worker.js');
const packageJson = JSON.parse(read('package.json'));

const build = index.match(/meta name="biteboss-build" content="([^"]+)"/)?.[1] || '';
if (!build) failures.push('index.html: biteboss build meta is missing');

if (build) {
  const escaped = build.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const checks = [
    ['index.html styles version', new RegExp(`styles\\.css\\?v=${escaped}`).test(index)],
    ['index.html bootstrap version', new RegExp(`bootstrap\\.js\\?v=${escaped}`).test(index)],
    ['app.js build constant', new RegExp(`BITEBOSS_BUILD = "${escaped}"`).test(app)],
    ['service-worker.js build constant', new RegExp(`const BUILD = "${escaped}"`).test(serviceWorker)],
    ['package.json version', packageJson.version === `0.${build}`]
  ];
  for (const [label, ok] of checks) if (!ok) failures.push(`${label}: build/version contract mismatch`);
}

const publicText = `${app}\n${styles}\n${index}`;
if (/\b(TODO|FIXME|HACK|HOTFIX)\b/i.test(publicText)) {
  failures.push('release source still contains temporary-work markers');
}
if (/locallyOwnedStoreIds\.add\s*\(/.test(app)) {
  failures.push('local ownership registry uses Set API on a Map');
}
if (/v\d+\s+SQL/i.test(app)) {
  failures.push('user-facing version-specific SQL troubleshooting text remains');
}
if (!/locallyOwnedStoreIds\.set\(storeId,Date\.now\(\)\)/.test(app)) {
  failures.push('local ownership write-through is missing');
}
if (!/TAKEOVER_IDLE_STATES/.test(app) || !/RUNTIME = Object\.freeze/.test(app)) {
  failures.push('runtime constants were not consolidated');
}
if (!/resolveStoreDetailCoordinates\(/.test(app) || !/\.from\("biteboss_stores"\)[\s\S]*?\.select\("id,latitude,longitude"\)/.test(app)) {
  failures.push('store detail coordinates do not have a canonical database fallback');
}
if (!/renderStoreDetailMapState\(/.test(app)) {
  failures.push('store detail map failure state is missing');
}

if (failures.length) {
  console.error(`Release audit failed (${failures.length})`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log(`BiteBoss v${build} release audit passed.`);
