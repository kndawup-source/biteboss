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

test('release CSS has one canonical avatar fallback block', () => {
  const selector = '.store-avatar-fallback,.boss-avatar-fallback,.occupied-store-half-fallback,.occupied-boss-half-fallback';
  assert.equal(css.split(selector).length - 1, 1);
});
