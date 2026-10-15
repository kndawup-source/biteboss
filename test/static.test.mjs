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
  assert.ok(read('app.js').byteLength < 260*1024,'app.js budget');
  assert.ok(read('styles.css').byteLength < 250*1024,'styles.css budget');
});


test('v71 game loop ships takeover, retake/hot pulse, history and season UI',()=>{
  const html=read('index.html').toString();
  const app=read('app.js').toString();
  const css=read('styles.css').toString();
  assert.match(html,/id="takeoverScreen"/);
  assert.match(html,/id="gamePulse"/);
  assert.match(html,/data-rank="season"/);
  assert.match(app,/biteboss_takeover_session_ping_v7514/);
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
  assert.doesNotMatch(app, /<section class="boss-focus"/);
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

test("HOT pulse remains visible for owned stores and legal pages use BiteBoss editorial hierarchy", () => {
  const app = read("app.js").toString();
  const privacy = read("privacy-policy.html").toString();
  const support = read("support.html").toString();
  const css = read("styles.css").toString();
  const hotStart = app.indexOf('const hot=(Array.isArray(data?.hot)?data.hot:fallbackHot)');
  const hotEnd = app.indexOf('const newcomer=', hotStart);
  const hotBlock = app.slice(hotStart, hotEnd);
  assert.ok(hotStart >= 0 && hotEnd > hotStart);
  assert.doesNotMatch(hotBlock, /isMyBossStore/);
  assert.match(privacy, /BITEBOSS \/ PRIVACY/);
  assert.match(support, /BITEBOSS \/ SUPPORT/);
  assert.match(css, /\.legal-page-shell\{/);
  assert.match(css, /\.support-faq-item\{/);
});

test("user avatar fallbacks are intentionally blank", () => {
  const app = read("app.js").toString();
  assert.match(app, /return `<span class="\$\{escapeAttr\(className\)\} boss-avatar-fallback" aria-hidden="true"><\/span>`;/);
  assert.match(app, /<span class="occupied-boss-half-fallback" aria-hidden="true"><\/span>/);
  assert.doesNotMatch(app, /nearby-avatar boss-avatar-fallback" aria-hidden="true">\?<\/span>/);
});

test('release QA provides retry states for network-bound user views', () => {
  const app=read('app.js').toString();
  const css=read('styles.css').toString();
  assert.match(app, /function setRetryState\(/);
  assert.match(app, /setRetryState\("#storeList", "매장 정보를 불러오지 못했습니다\.",/);
  assert.match(app, /setRetryState\(body, "매장 정보를 불러오지 못했습니다\.",/);
  assert.match(app, /setRetryState\(profileBox, "전투 기록을 불러오지 못했습니다\.",/);
  assert.match(css, /\.app-state-retry-btn\{/);
});

test('non-hero runtime images are lazy decoded', () => {
  const app=read('app.js').toString();
  const html=read('index.html').toString();
  assert.match(app, /매장 사진" loading="lazy" decoding="async"/);
  assert.match(app, /프로필" loading="lazy" decoding="async"/);
  assert.match(app, /profile-record-thumb[^`]+loading="lazy" decoding="async"/);
  assert.match(html, /homeSplashImage[^>]+loading="eager"[^>]+fetchpriority="high"/);
});

test('admin save flows guard against duplicate submissions', () => {
  const admin=read('admin.js').toString();
  const storeAdmin=read('store-admin.js').toString();
  assert.match(admin, /if\(submit\?\.disabled\) return;/);
  assert.match(storeAdmin, /async function withFormLock\(/);
  assert.match(storeAdmin, /await withFormLock\(formEl,/);
});

test("crew management exposes leader kick controls and keeps member self-leave flow", () => {
  const app = read("app.js").toString();
  const html = read("index.html").toString();
  const css = read("styles.css").toString();
  assert.match(app, /data-kick-member=/);
  assert.match(app, /biteboss_kick_organization_member_v7513/);
  assert.match(app, /function openOrganizationKickConfirm\(/);
  assert.match(app, /function kickOrganizationMember\(/);
  assert.match(app, /leave\.textContent = organization\?\.is_leader \? "크루 해산" : "크루 탈퇴"/);
  assert.match(html, /id="leaveOrganizationBtn"/);
  assert.match(css, /\.organization-kick-btn\{/);
});


test('global capture cooldown blocks the next store for 60 minutes',()=>{
  const app=read('app.js').toString();
  const admin=read('admin.html').toString();
  assert.match(app,/capture_cooldown_minutes:60/);
  assert.match(app,/biteboss_capture_cooldown_status_v7514/);
  assert.match(app,/biteboss_takeover_session_ping_v7514/);
  assert.match(app,/다음 점령 대기 중/);
  assert.match(app,/if\(captureCooldownActive\(\)\) return ownedByMe/);
  assert.match(admin,/name="capture_cooldown_minutes"/);
});

test('v75.18 public crew detail exposes members but limits other-crew territory to three',()=>{
  const app=read('app.js').toString();
  assert.match(app,/publicTerritories = sortedTerritories\.slice\(0,3\)/);
  assert.match(app,/data-crew-detail-tab="territory"/);
  assert.match(app,/data-crew-detail-tab="members"/);
  assert.match(app,/다른 크루의 점령지는 최근 3곳만 공개됩니다/);
});

test('v75.18 notification center has structured unread rows and pagination',()=>{
  const app=read('app.js').toString();
  const css=read('styles.css').toString();
  assert.match(app,/NOTIFICATION_PAGE_SIZE = 8/);
  assert.match(app,/notification-inbox-row \$\{unread \? "is-unread"/);
  assert.match(app,/notificationIconMarkup\(item\.kind\)/);
  assert.match(app,/id="notificationPagination"/);
  assert.match(css,/\.notification-kind-icon/);
  assert.match(css,/\.notification-inbox-row\.is-unread/);
});

test('v75.18 challenge and ranking pages use compact bottom spacing',()=>{
  const css=read('styles.css').toString();
  assert.match(css,/#page-stores,#page-rank\{padding-bottom:calc\(82px \+ var\(--safe-bottom\)\)\}/);
  assert.match(css,/\.challenge-page\{padding-bottom:14px!important\}/);
  assert.match(css,/#page-rank \.inner-page\{padding-bottom:14px\}/);
});

test('v75.18 new members receive Korean BiteBoss-style suggested nicknames',()=>{
  const app=read('app.js').toString();
  const helpers=read('ui-helpers.js').toString();
  assert.match(app,/generateDefaultNickname\(\)/);
  assert.match(app,/p_nickname:nickname \|\| generateDefaultNickname\(username\)/);
  assert.match(helpers,/명동/);
  assert.match(helpers,/불주먹/);
});

test('v75.18 player ranking separates nickname from crew and BOSS metadata',()=>{
  const app=read('app.js').toString();
  assert.match(app,/const rankMeta=\[crewName, `BOSS \$\{Number\(row\.boss_count \|\| 0\)\}`\]/);
  assert.match(app,/<strong>\$\{escapeHtml\(playerName\)\}<\/strong>/);
  assert.doesNotMatch(app,/const identity=\[playerName,row\.organization_name\]/);
});

test('v75.18 crew member management actions do not fall through to profile row clicks',()=>{
  const app=read('app.js').toString();
  assert.match(app,/actionButton = event\.target\.closest\("\[data-kick-member\],\[data-transfer-leader\]"\)/);
  assert.match(app,/event\.stopPropagation\(\)/);
  assert.match(app,/handlePlayerProfileOpen\(event\)[\s\S]*?data-kick-member[\s\S]*?data-transfer-leader/);
  assert.match(app,/biteboss_kick_organization_member_v7513/);
  assert.match(app,/biteboss_transfer_organization_leadership/);
});

test('v75.18 crew pagination HOT emphasis and stable countdown typography',()=>{
  const app=read('app.js').toString();
  const css=read('styles.css').toString();
  assert.match(app,/const CREW_PAGE_SIZE = 8/);
  assert.match(app,/data-crew-territory-pagination/);
  assert.match(app,/data-crew-member-pagination/);
  assert.match(app,/pageSlice\(members, memberPage, CREW_PAGE_SIZE\)/);
  assert.match(app,/isOwnOrganization \? pageSlice\(source, territoryPage, CREW_PAGE_SIZE\)/);
  assert.match(css,/\.game-pulse-item\.is-hot\{[^}]*background:var\(--accent\);[^}]*color:#fff/);
  assert.match(css,/\.takeover-count\{[^}]*font-variant-numeric:tabular-nums[^}]*font-feature-settings:"tnum" 1/);
  assert.match(css,/\.takeover-count\{[^}]*letter-spacing:\.015em/);
  assert.match(css,/\.crew-profile-overview/);
});

test('v75.20 crew leader actions fill one row and invite detail has explicit hierarchy',()=>{
  const app=read('app.js').toString();
  const css=read('styles.css').toString();
  assert.match(app,/is-leader-actions/);
  assert.match(css,/\.crew-actions\.is-leader-actions\{[\s\S]*grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
  assert.match(app,/crew-invite-detail/);
  assert.match(app,/만료까지/);
  assert.match(app,/새 QR 만들기/);
});

test('v75.20 HOT banner uses circular fire emoji and no challenge-count copy',()=>{
  const app=read('app.js').toString();
  const css=read('styles.css').toString();
  assert.match(app,/class="hot-flame"[^>]*>🔥<\/span>/);
  assert.match(app,/가장 치열한 점령지/);
  assert.doesNotMatch(app,/class="game-pulse-item is-hot"[\s\S]{0,400}명 도전/);
  assert.match(css,/\.game-pulse-item\.is-hot \.hot-flame\{[\s\S]*border-radius:50%/);
  assert.match(css,/Apple Color Emoji/);
});


test('v75.20 challenge HOT QR battle spacing and active ranking cleanup are release-safe',()=>{
  const html=read('index.html').toString();
  const app=read('app.js').toString();
  const css=read('styles.css').toString();
  assert.match(html,/가까운 매장을 찾아 점령하세요\./);
  assert.match(css,/\.game-pulse-item\.is-hot \.hot-flame\{[^}]*background:rgba\(0,0,0,\.12\)/);
  assert.match(css,/\.crew-invite-qr\{[^}]*border-radius:0/);
  assert.match(css,/\.crew-invite-qr img,\.crew-invite-qr canvas\{[^}]*border-radius:0!important/);
  assert.match(app,/profile-record-meta-with-time/);
  assert.match(css,/\.profile-record-meta-with-time\{[^}]*gap:2px 6px/);
  assert.match(app,/biteboss_active_player_ids_v7520/);
  assert.match(app,/rows = await filterActivePlayerRankRows\(rows\)/);
});
