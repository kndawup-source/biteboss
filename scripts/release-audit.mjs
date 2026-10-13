import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = rel => fs.readFileSync(path.join(root, rel), 'utf8');
const build = '75.6';
const failures = [];

const checks = [
  ['index.html', new RegExp(`biteboss-build" content="${build.replace('.', '\\.')}`)],
  ['index.html', new RegExp(`styles\\.css\\?v=${build.replace('.', '\\.')}`)],
  ['index.html', new RegExp(`bootstrap\\.js\\?v=${build.replace('.', '\\.')}`)],
  ['bootstrap.js', new RegExp(`app\\.js\\?v=${build.replace('.', '\\.')}`)],
  ['service-worker.js', new RegExp(`biteboss-v${build.replace('.', '\\.')}`)],
  ['app.js', new RegExp(`BITEBOSS_BUILD = "${build.replace('.', '\\.')}"`)]
];

for (const [file, pattern] of checks) {
  if (!pattern.test(read(file))) failures.push(`${file}: build/version contract mismatch`);
}

const app = read('app.js');
const styles = read('styles.css');
const publicText = `${app}\n${styles}\n${read('index.html')}`;

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

if (failures.length) {
  console.error(`Release audit failed (${failures.length})`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}
console.log('BiteBoss v75.6 release audit passed.');
