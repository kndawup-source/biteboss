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
  assert.match(app,/locallyOwnedStoreIds\.get\(key\)/);
  assert.match(app,/markStoreOwnedLocally\(nearest\.store\)/);
  assert.match(app,/const next = challengeableRows\[0\] \|\| null/);
  assert.match(app,/if\(!items\.length\)\{\s*box\.innerHTML="";\s*box\.classList\.add\("hidden"\)/);
  assert.doesNotMatch(app,/READY TO TAKE OVER/);
  assert.doesNotMatch(app,/label:"내 점령지"/);
  assert.doesNotMatch(app,/status = protectedNow[\s\S]*내 점령지/);
  assert.match(app,/if\(!ownedByMe && isPartner\)/);
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


test("home hero and occupied-store avatar layout regressions stay fixed", () => {
  const css = read("styles.css").toString();
  const app = read("app.js").toString();
  assert.match(css, /\.boss-home-hero\.has-splash \.boss-home-fallback\{display:none\}/);
  assert.match(css, /\.occupied-store-avatar\{display:grid;grid-template-columns:50% 50%/);
  assert.match(css, /\.occupied-store-half>img,\.occupied-boss-half>img\{[^}]*border-radius:0!important;clip-path:none!important/);
  assert.match(app, /image\.src = url;/);
});


test("high-volume public lists use real pagination controls", () => {
  const html = read("index.html").toString();
  const app = read("app.js").toString();
  for(const id of ["storePagination","rankPagination","activityPagination","visitPagination"]){
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(app,/const STORE_PAGE_SIZE = 8/);
  assert.match(app,/const RANK_PAGE_SIZE = 10/);
  assert.match(app,/function renderPagination\(/);
  assert.match(app,/function renderProfileActivityPage\(/);
});

test("non-action store states are not rendered as fake disabled buttons", () => {
  const app = read("app.js").toString();
  assert.doesNotMatch(app,/type="button" disabled>보호 중/);
  assert.doesNotMatch(app,/type="button" disabled>재도전/);
  assert.match(app,/store-detail-auto/);
});


test("territory rank uses dedicated 3-column layout and crew marker fallback", () => {
  const css = read("styles.css").toString();
  const app = read("app.js").toString();
  assert.match(css, /\.territory-rank-card\{grid-template-columns:22px minmax\(0,1fr\) auto/);
  assert.match(app, /row\.is_my_organization[\s\S]*rowOrganizationId[\s\S]*myOrganizationId/);
  assert.match(app, /fillColor:mine \? "#d72f38" : "#c8c8cc"/);
});

test("top-level tab navigation resets inherited scroll position", () => {
  const app = read("app.js").toString();
  assert.match(app, /function openTab\(tab\)[\s\S]*window\.scrollTo\(\{ top:0, left:0, behavior:"auto" \}\)/);
});


test("challenge store list keeps owned stores last and avoids per-row login CTAs", () => {
  const html = read("index.html").toString();
  const app = read("app.js").toString();
  const css = read("styles.css").toString();
  assert.match(app,/const aOwned=isMyBossStore\(a\), bOwned=isMyBossStore\(b\)/);
  assert.match(app,/if\(aOwned!==bOwned\) return aOwned \? 1 : -1/);
  assert.doesNotMatch(app,/data-store-login=/);
  assert.match(html,/id="storesLoginBtn"/);
  assert.match(css,/\.challenge-login-btn\{/);
  assert.doesNotMatch(app,/label:"내 점령지"/);
});

test("challenge header has no redundant GPS status card", () => {
  const html = read("index.html").toString();
  assert.equal(html.includes('id="challengeGpsState"'), false);
  assert.equal(html.includes('class="takeover-command-stat"'), false);
});

test("public player profile limits recent activity to three rows", () => {
  const app = read("app.js").toString();
  assert.match(app, /const recent = recentAll\.slice\(0, 3\)/);
});

test("profile game metrics are actionable buttons", () => {
  const html = read("index.html").toString();
  assert.match(html, /data-profile-action="level"/);
  assert.match(html, /data-profile-action="boss"/);
  assert.match(html, /data-profile-action="visits"/);
});


test("owned store detail uses owner layout instead of self-vs-self battle UI", () => {
  const app = read("app.js").toString();
  const css = read("styles.css").toString();
  assert.match(app, /bossExists && !isBoss \? `\n          <section class="boss-focus"/);
  assert.match(app, /!isBoss \? `\n          <section class="power-matchup"/);
  assert.match(app, /ownerStatusHtml = isBoss && bossExists/);
  assert.match(app, /<span>방어력<\/span>/);
  assert.doesNotMatch(app, /<span>내 방어 상태<\/span>/);
  assert.match(css, /\.owner-store-status\{/);
});


test("guest profile uses a single entry CTA and hides crew creation until login", () => {
  const html = read("index.html").toString();
  const app = read("app.js").toString();
  assert.match(html, /id="memberLoginBtn"[^>]*>시작하기<\/button>/);
  assert.doesNotMatch(html, /id="memberRegisterBtn"/);
  assert.match(app, /create\.classList\.toggle\("hidden", hasOrg \|\| !loggedIn\)/);
  assert.doesNotMatch(app, /로그인 후 크루 만들기/);
  assert.match(app, /memberAuthSwitchToRegister/);
  assert.match(app, /memberAuthSwitchToLogin/);
});

test("challenge HOT pulse is full-width, opens normalized store ids, and store initials stay subdued", () => {
  const app = read("app.js").toString();
  const css = read("styles.css").toString();
  assert.match(app, /function resolvePulseStoreId\(row\)/);
  assert.match(app, /\[row\.store_id, row\.store\?\.id, row\.storeId\]/);
  assert.doesNotMatch(app, /row\.store_id \?\? row\.id/);
  assert.match(app, /stores\.find\(store => String\(store\?\.name/);
  assert.match(app, /openStoreDetail\(storeId\)/);
  assert.match(css, /\.game-pulse\{[^}]*display:grid;grid-template-columns:minmax\(0,1fr\)/);
  assert.match(css, /\.game-pulse-info,\.game-pulse-item\{width:100%/);
  assert.match(css, /\.store-avatar-fallback,\.occupied-store-half-fallback\{font-size:15px;font-weight:700\}/);
});


test("roleCopy regression: store detail defines role label before rendering", () => {
  const src = readFileSync(new URL("../app.js", import.meta.url), "utf8");
  assert.match(src, /const roleCopy = isBoss \? "보스" : \(isCrew \? "크루" : "방문자"\);/);
  const def = src.indexOf("const roleCopy =");
  const use = src.indexOf("escapeHtml(roleCopy)");
  assert.ok(def >= 0 && use > def);
});
