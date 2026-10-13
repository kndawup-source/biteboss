import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
const read=p=>readFileSync(new URL(`../${p}`,import.meta.url));
const hash=p=>createHash('sha256').update(read(p)).digest('hex');

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


test('takeover timer excludes owned stores and uses one monotonic clock source',()=>{
  const app=read('app.js').toString();
  assert.match(app,/if\(isMyBossStore\(store\)\)/);
  assert.match(app,/const takeoverSession = ownedByMe \? null : await pingTakeoverSession/);
  assert.match(app,/takeoverRemaining=Math\.min\(visualNow,incomingRemaining\)/);
  assert.match(app,/if\(!ownedByMe && !takeoverCancelledLocally && takeoverSession\?\.ok\)/);
  assert.doesNotMatch(app,/remaining_seconds:Number\(data\?\.remaining_seconds \?\? takeoverSession\?\.remaining_seconds/);
});

test('owned store takeover suppression persists immediately after a successful claim',()=>{
  const app=read('app.js').toString();
  assert.match(app,/const locallyOwnedStoreIds = new Map\(\)/);
  assert.match(app,/locallyOwnedStoreIds\.get\(storeId\)/);
  assert.match(app,/markStoreOwnedLocally\(nearest\.store\)/);
  assert.match(app,/const next = challengeableRows\[0\] \|\| null/);
  assert.match(app,/const next=stores\.find\(store=>!isMyBossStore\(store\)\)/);
  assert.match(app,/action = `<span class="store-list-action is-owned">내 점령지<\/span>`/);
});

test('ranking and profile avatars are forced to circular masks',()=>{
  const css=read('styles.css').toString();
  for(const selector of ['.my-rank-avatar','.rank-player-avatar','.crew-rank-avatar','.profile-identity .avatar','.crew-profile-avatar']){
    assert.ok(css.includes(selector), `missing avatar selector ${selector}`);
  }
  assert.match(css,/clip-path:circle\(50% at 50% 50%\)/);
  assert.match(css,/border-radius:50%/);
});


test("v74.1 critical layout contracts prevent store/profile overlap", () => {
  const css = read("styles.css").toString();
  assert.match(css, /\.store-detail-avatar\{[^}]*width:54px[^}]*height:54px/);
  assert.match(css, /\.power-matchup-values\{[^}]*grid-template-columns:minmax\(0,1fr\) auto minmax\(0,1fr\)/);
  assert.match(css, /\.organization-stats>div\{/);
  assert.match(css, /\.organization-panel-head\{[^}]*grid-template-columns:auto minmax\(0,1fr\)/);
  assert.match(css, /\.rank-player-avatar[^\{]*\{[^}]*border-radius:50%/);
  assert.doesNotMatch(css, /v73\.3 avatar geometry/);
});
