import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const read=p=>readFileSync(new URL(`../${p}`,import.meta.url));
const hash=p=>createHash('sha256').update(read(p)).digest('hex');

test('canonical web assets and native www bundle are identical',()=>{
  for(const f of ['index.html','app.js','styles.css','bootstrap.js','app-config.js','supabase.js','service-worker.js','manifest.webmanifest','privacy-policy.html','support.html']) assert.equal(hash(f),hash(`www/${f}`),f);
});

test('Capacitor configs agree on production bundle and webDir',()=>{
  const json=JSON.parse(read('capacitor.config.json').toString()); const ts=read('capacitor.config.ts').toString();
  assert.equal(json.appId,'com.dasaft.biteboss'); assert.equal(json.webDir,'www');
  assert.match(ts,/com\.dasaft\.biteboss/); assert.match(ts,/webDir: 'www'/);
});

test('public HTML has baseline SEO and search accessibility',()=>{
  const html=read('index.html').toString();
  assert.match(html,/meta name="description"/); assert.match(html,/aria-label="매장, 카테고리 또는 지역 검색"/);
});

test('admin pages are not indexable',()=>{
  for(const f of ['admin.html','store-admin.html']) assert.match(read(f).toString(),/noindex,nofollow,noarchive/);
});

test('server function never embeds service-role credential in client config',()=>{
  assert.doesNotMatch(read('app-config.js').toString(),/SERVICE_ROLE/i);
  assert.match(read('api/nearby-stores.js').toString(),/process\.env\.SUPABASE_SERVICE_ROLE_KEY/);
});

test('all declared navigation tabs have matching pages',()=>{
  const html=read('index.html').toString();
  const pages=new Set([...html.matchAll(/id="page-([a-z_]+)"/g)].map(m=>m[1]));
  const tabs=new Set([...html.matchAll(/data-tab="([a-z_]+)"/g)].map(m=>m[1]));
  for(const tab of tabs) assert.ok(pages.has(tab),`missing page for tab ${tab}`);
});

test('release assets stay within source-size budgets',()=>{
  assert.ok(read('index.html').byteLength < 30*1024,'index.html budget');
  assert.ok(read('app.js').byteLength < 250*1024,'app.js budget');
  assert.ok(read('styles.css').byteLength < 250*1024,'styles.css budget');
});


test('v71 game loop ships takeover, retake/hot pulse, history and season UI',()=>{
  const html=read('index.html').toString();
  const app=read('app.js').toString();
  const css=read('styles.css').toString();
  assert.match(html,/id="takeoverScreen"/);
  assert.match(html,/id="gamePulse"/);
  assert.match(html,/data-rank="season"/);
  assert.match(app,/biteboss_takeover_session_ping_v71/);
  assert.match(app,/biteboss_game_pulse_v71/);
  assert.match(app,/biteboss_store_history_v71/);
  assert.match(css,/\.takeover-count/);
});
