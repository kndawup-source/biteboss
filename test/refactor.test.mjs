import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const app = fs.readFileSync(new URL('../app.js', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../styles.css', import.meta.url), 'utf8');

test('ownership registry consistently uses Map semantics', () => {
  assert.match(app, /const locallyOwnedStoreIds = new Map\(\)/);
  assert.match(app, /locallyOwnedStoreIds\.set\(storeId,Date\.now\(\)\)/);
  assert.doesNotMatch(app, /locallyOwnedStoreIds\.add\s*\(/);
});

test('takeover runtime constants are centralized', () => {
  assert.match(app, /const RUNTIME = Object\.freeze\(/);
  assert.match(app, /const TAKEOVER_IDLE_STATES = new Set\(/);
  assert.match(app, /RUNTIME\.takeoverUiTickMs/);
  assert.match(app, /RUNTIME\.localOwnershipGraceMs/);
});

test('avatar fallback styling has one canonical user/store block', () => {
  assert.equal(css.split('.store-avatar-fallback,.boss-avatar-fallback{').length - 1, 1);
  assert.equal(css.split('.boss-avatar-fallback{font-size:17px').length - 1, 1);
});

test('store detail coordinate and map responsibilities are centralized', () => {
  assert.equal((app.match(/async function resolveStoreDetailCoordinates\(/g) || []).length, 1);
  assert.equal((app.match(/function renderStoreDetailMap\(/g) || []).length, 1);
  assert.equal((app.match(/function renderStoreDetailMapState\(/g) || []).length, 1);
});
