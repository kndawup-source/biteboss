import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = p => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

const html = read('index.html');
const app = read('app.js');
const css = read('styles.css');
const admin = read('admin.js');
const adminHtmlGlobal = read('admin.html');
const storeAdmin = read('store-admin.js');
const serviceWorker = read('service-worker.js');

function blockBetween(source, start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from + start.length);
  assert.ok(from >= 0, `missing block start: ${start}`);
  assert.ok(to > from, `missing block end: ${end}`);
  return source.slice(from, to);
}

test('public HTML has baseline SEO and accessible store search', () => {
  assert.match(html, /meta name="description"/);
  assert.match(html, /aria-label="매장, 카테고리 또는 지역 검색"/);
});

test('admin pages are not indexable', () => {
  for (const f of ['admin.html', 'store-admin.html']) {
    assert.match(read(f), /noindex,nofollow,noarchive/);
  }
});

test('client config never exposes the Supabase service role credential', () => {
  assert.doesNotMatch(read('app-config.js'), /SERVICE_ROLE/i);
  assert.match(read('api/nearby-stores.js'), /process\.env\.SUPABASE_SERVICE_ROLE_KEY/);
});

test('all declared navigation tabs have matching pages', () => {
  const pages = new Set([...html.matchAll(/id="page-([a-z_]+)"/g)].map(m => m[1]));
  const tabs = new Set([...html.matchAll(/data-tab="([a-z_]+)"/g)].map(m => m[1]));
  for (const tab of tabs) assert.ok(pages.has(tab), `missing page for tab ${tab}`);
});

test('release assets stay inside current maintainability budgets', () => {
  assert.ok(Buffer.byteLength(html) < 30 * 1024, 'index.html budget');
  assert.ok(Buffer.byteLength(app) < 430 * 1024, 'app.js budget');
  assert.ok(Buffer.byteLength(css) < 250 * 1024, 'styles.css budget');
});

test('release build version is synchronized across public assets', () => {
  const build = html.match(/biteboss-build" content="([^"]+)"/)?.[1];
  assert.ok(build);
  assert.match(app, new RegExp(`BITEBOSS_BUILD = "${build.replace('.', '\\.')}"`));
  assert.match(serviceWorker, new RegExp(`const BUILD = "${build.replace('.', '\\.')}"`));
  assert.match(html, new RegExp(`styles\\.css\\?v=${build.replace('.', '\\.')}`));
  assert.match(html, new RegExp(`bootstrap\\.js\\?v=${build.replace('.', '\\.')}`));
});

test('store detail coordinates resolve from detail data, memory, then canonical store row', () => {
  assert.match(app, /function normalizeStoreCoordinates\(/);
  assert.match(app, /const storeDetailCoordinateCache = new Map\(\)/);
  assert.match(app, /async function resolveStoreDetailCoordinates\(/);
  const resolver = blockBetween(app, 'async function resolveStoreDetailCoordinates', 'async function openStoreDetail');
  assert.match(resolver, /cacheStoreCoordinates\(id, store\)/);
  assert.match(resolver, /storeDetailCoordinateCache\.get\(id\)/);
  assert.match(resolver, /\.from\("biteboss_stores"\)[\s\S]*?\.select\("id,latitude,longitude"\)/);
});

test('store detail map is always placed directly under store identity', () => {
  const render = blockBetween(app, 'function renderStoreDetail(data', 'function bindStoreComments');
  const head = render.indexOf('store-detail-head');
  const map = render.indexOf('store-detail-map-section');
  const owner = render.indexOf('${ownerStatusHtml}');
  assert.ok(head >= 0 && map > head && owner > map);
  assert.match(render, /id="storeDetailMap"/);
});

test('store detail map has explicit missing-library, missing-coordinate and retry states', () => {
  assert.match(app, /function renderStoreDetailMapState\(/);
  assert.match(app, /매장 위치 정보가 없습니다\./);
  assert.match(app, /지도를 불러오지 못했습니다\./);
  assert.match(app, /store-detail-map-retry/);
  assert.match(css, /\.store-detail-map-state\{/);
  assert.match(css, /\.store-detail-map-retry\{/);
});

test('occupied store does not render a duplicate standalone boss-focus card', () => {
  assert.doesNotMatch(app, /<section class="boss-focus"/);
  const render = blockBetween(app, 'function renderStoreDetail(data', 'function bindStoreComments');
  assert.match(render, /<span>점령자<\/span><strong>\$\{escapeHtml\(bossName \|\| "보스"\)\}<\/strong>/);
});

test('owner store layout keeps defense status without self-vs-self battle UI', () => {
  const render = blockBetween(app, 'function renderStoreDetail(data', 'function bindStoreComments');
  assert.match(render, /ownerStatusHtml = isBoss && bossExists/);
  assert.match(render, /<span>방어력<\/span>/);
  assert.doesNotMatch(render, /class="power-matchup"/);
  assert.match(css, /\.owner-store-status\{/);
});

test('takeover uses the server presence clock and suppresses takeover session for owned stores', () => {
  assert.match(app, /const takeoverSession = ownedByMe \? null : await pingTakeoverSession/);
  assert.match(app, /const presenceClock = \{/);
  assert.match(app, /remaining_seconds:Number\(data\?\.remaining_seconds \?\? data\?\.required_seconds/);
  assert.match(app, /if\(ownedByMe\)\{[\s\S]*?syncOwnerReclaimPresence/);
  assert.match(app, /else if\(!takeoverCancelledLocally/);
});

test('owned stores are sorted after challengeable stores', () => {
  const compare = blockBetween(app, 'function compareNearbyStores', 'function storeAvatarMarkup');
  assert.match(compare, /const aOwned=isMyBossStore\(a\), bOwned=isMyBossStore\(b\)/);
  assert.match(compare, /if\(aOwned!==bOwned\) return aOwned \? 1 : -1/);
});

test('store cards avoid per-row login CTAs and expose one challenge login notice', () => {
  assert.doesNotMatch(app, /data-store-login=/);
  assert.match(html, /id="storesLoginBtn"/);
  assert.match(css, /\.challenge-login-btn\{/);
});

test('high-volume public lists and profile activity use real pagination controls', () => {
  for (const id of ['storePagination', 'rankPagination']) {
    assert.match(html, new RegExp(`id="${id}"`));
  }
  assert.match(app, /const STORE_PAGE_SIZE = 15/);
  assert.match(app, /const RANK_PAGE_SIZE = 10/);
  assert.match(app, /const PROFILE_ACTIVITY_ALL_PAGE_SIZE = 10/);
  assert.match(app, /function renderPagination\(/);
  assert.match(app, /profile-activity-pagination/);
});

test('guest account flow uses one login modal path and hides crew creation until login', () => {
  assert.match(html, /id="storesLoginBtn"/);
  assert.match(app, /function openMemberLogin\(/);
  assert.match(app, /create\.classList\.toggle\("hidden", hasOrg \|\| !loggedIn\)/);
  assert.match(app, /memberAuthSwitchToRegister/);
  assert.match(app, /memberAuthSwitchToLogin/);
  assert.doesNotMatch(html, /id="memberRegisterBtn"/);
});



test('battle views use the canonical v81.29+ server ledger instead of client-side loss repair', () => {
  assert.match(app, /biteboss_player_profile_v8129/);
  assert.doesNotMatch(app, /ensureFailedChallengeRecorded/);
  assert.doesNotMatch(app, /biteboss_record_failed_challenge_v8128/);
  assert.match(app, /sb\.rpc\("biteboss_game_activity"/);
});

test('player battle record reconciles aggregate and activity for both wins and losses', () => {
  const record = blockBetween(app, 'function isBattleChallenger', 'function renderPlayerProfile');
  assert.match(record, /\["boss_win","claimed","challenger_win","win","victory"\]/);
  assert.match(record, /\["crew","challenger_loss","boss_defense","defended","loss","lose","defeat","failed"\]/);
  assert.match(record, /viewer_side \|\| row\.perspective \|\| row\.side/);
  assert.match(record, /actor_user_id \|\| row\.challenger_user_id \|\| row\.attacker_user_id/);
  assert.match(record, /if\(hasTotal && total > wins \+ losses\)/);
  assert.match(record, /losses = Math\.max\(losses, total - wins\)/);
  assert.match(record, /wins = Math\.max\(wins, activityRecord\.wins\)/);
  assert.match(record, /losses = Math\.max\(losses, activityRecord\.losses\)/);
});

test('runtime user and store images use deliberate loading priorities', () => {
  assert.match(app, /매장 사진" loading="lazy" decoding="async"/);
  assert.match(app, /alt="\$\{escapeAttr\(name\)\} 프로필" \$\{loading\} decoding="\$\{customUrl \? "async" : "sync"\}"/);
  assert.match(app, /profile-record-thumb"[^`]+loading="lazy" decoding="async"/);
  assert.match(html, /homeSplashImage[^>]+loading="eager"[^>]+fetchpriority="high"/);
});

test('avatar fallbacks are blank for users and explicit initials for stores', () => {
  assert.match(app, /boss-avatar-fallback" aria-hidden="true"><\/span>/);
  assert.match(app, /store-avatar-initial/);
  assert.doesNotMatch(app, /boss-avatar-fallback" aria-hidden="true">\?<\/span>/);
});

test('store activation and login guard duplicate submissions', () => {
  const activation = blockBetween(storeAdmin, 'function bindActivation', 'function bindLogin');
  assert.match(activation, /if\(submit\?\.disabled\) return;/);
  const login = blockBetween(storeAdmin, 'function bindLogin', 'async function restoreStoreSession');
  assert.match(login, /if\(submit\?\.disabled\) return;/);
  assert.match(login, /if\(submit\) submit\.disabled = true;/);
  assert.match(login, /finally\{[\s\S]*?submit\.disabled = false/);
  assert.match(admin, /if\(submit\?\.disabled\) return;/);
});

test('challenge HOT pulse uses normalized store ids and a compact fire marker', () => {
  assert.match(app, /function resolvePulseStoreId\(row\)/);
  assert.match(app, /\[row\.store_id, row\.store\?\.id, row\.storeId\]/);
  assert.match(app, /class="hot-flame"[^>]*>🔥<\/span>/);
  assert.match(app, /가장 치열한 점령지/);
  assert.match(css, /\.game-pulse-item\.is-hot \.hot-flame[^}]*border-radius:50%/);
});

test('ranking and profile avatars remain circular', () => {
  for (const selector of ['.my-rank-avatar', '.rank-player-avatar', '.crew-rank-avatar', '.profile-identity .avatar', '.crew-profile-avatar']) {
    assert.ok(css.includes(selector), `missing avatar selector ${selector}`);
  }
  assert.match(css, /clip-path:circle\(50% at 50% 50%\)/);
  assert.match(css, /border-radius:50%/);
});

test('network-bound user views retain retry states', () => {
  assert.match(app, /function setRetryState\(/);
  assert.match(app, /setRetryState\("#storeList", "매장 정보를 불러오지 못했습니다\.",/);
  assert.match(app, /setRetryState\(\$\("#modalBody"\),"매장 정보를 불러오지 못했습니다\.",/);
  assert.match(css, /\.app-state-retry-btn\{/);
});

test('release source contains no temporary patch markers', () => {
  assert.doesNotMatch(`${app}\n${css}\n${html}`, /\b(?:TODO|FIXME|HACK|HOTFIX)\b/i);
});

test('deleted stores preserve battle history and do not expose dead store navigation', () => {
  assert.match(app, /const storeDeleted = Boolean\(row\.store_deleted \|\| !storeId\)/);
  assert.match(app, /row\.store_name \|\| \(storeDeleted \? "삭제된 매장" : "매장"\)/);
  assert.match(app, /const tag = storeDeleted \? "div" : "button"/);
  assert.match(app, /const attrs = storeDeleted \? 'role="group"'/);
  assert.match(app, /is-deleted-store/);
});

test('store manager CTA remains visible for eligible non-owner detail views and hidden for explicitly compact flows', () => {
  assert.match(app, /function shouldShowStoreManagerCard/);
  assert.match(app, /return !isBoss && options\?\.showStoreManagerCard !== false/);
  assert.match(app, /playerSession\?\.authenticated && options\?\.showStoreManagerCard!==false/);
  assert.match(app, /showStoreManagerCard:!fromProfileBattleLog/);
  assert.match(app, /이 매장 관리하기/);
});

test('ads separate campaign management from creative management without breaking legacy campaign tracking', () => {
  assert.match(read('admin.html'), /id="adCreativePanel"/);
  assert.match(read('admin.html'), /id="adCreativeForm"/);
  assert.match(read('admin.html'), /캠페인의 운영 조건을 설정합니다/);
  assert.match(read('admin.html'), /같은 캠페인 안에 여러 소재를 등록하면 같은 우선순위에서 랜덤 노출됩니다/);
  assert.match(admin, /function campaignCreatives\(/);
  assert.match(admin, /key:"ad_creatives"/);
  assert.match(admin, /creative_id:creative\.id/);
  assert.match(app, /biteboss_track_ad_event_v8179/);
  assert.match(app, /biteboss_track_ad_creative_event_v8211/);
  assert.match(app, /creative_id:attribution\.creative_id/);
});

test('capture victory modal keeps share actions visible while store detail refreshes', () => {
  assert.match(app, /id="shareVictoryBtn"[^>]*>공유하기<\/button>/);
  assert.match(app, /classList\.contains\("victory-modal"\)/);
  assert.match(app, /activeStoreDetailId[\s\S]*?!victoryModalVisible[\s\S]*?openStoreDetail\(nearest\.store\.id, \{ preserveModal:true, showStoreManagerCard:false \}\)/);
});

test('owned stores never expose reclaim timers during the player-wide capture cooldown', () => {
  assert.match(app, /if\(captureCooldownActive\(\)\)\{\n\s*status = "";/);
  assert.match(app, /if\(captureCooldownActive\(\)\)\{\n\s*card\.classList\.add\("hidden"\);\n\s*storeReclaimTimer = clearIntervalRef\(storeReclaimTimer\);/);
  assert.match(app, /globalCaptureCooldownNow \? "" : \(reclaimAvailableAt \?/);
  assert.match(app, /const captureCooldownNow = captureCooldownActive\(\);[\s\S]*?node\.removeAttribute\("data-store-reclaim-at"\)/);
});

test('admin separates ad operations from ad performance reporting', () => {
  const adminHtml = read('admin.html');
  assert.match(adminHtml, /data-admin="ad-performance"[^>]*data-admin-group="overview"[^>]*>광고 성과<\/button>/);
  assert.match(adminHtml, /data-admin="ads"[^>]*data-admin-group="settings"[^>]*>광고 관리<\/button>/);
  assert.match(adminHtml, /id="admin-ad-performance"/);
  assert.match(adminHtml, /id="adPerformanceCampaignList"/);
  assert.match(adminHtml, /id="adPerformanceCreativeList"/);
  assert.match(admin, /overview:\["dashboard","ad-performance"\]/);
  assert.match(admin, /function renderAdPerformanceCampaigns\(/);
  assert.match(admin, /function renderAdPerformanceCreatives\(/);
  const manageRender = blockBetween(admin, 'function renderAds', 'function openAdCreativePanel');
  assert.doesNotMatch(manageRender, /admin-ad-stats/);
  const creativeManageRender = blockBetween(admin, 'function renderAdCreatives', 'function renderAdPerformanceCampaigns');
  assert.doesNotMatch(creativeManageRender, /admin-ad-stats/);
});

test('admin ad operations support search and performance supports filtered CSV export', () => {
  const adminHtml = read('admin.html');
  assert.match(adminHtml, /id="adCampaignSearch"/);
  assert.match(adminHtml, /id="adPerformanceSearch"/);
  assert.match(adminHtml, /id="adPerformanceExportCsv"[^>]*>CSV 내보내기<\/button>/);
  assert.match(admin, /function exportAdPerformanceCsv\(\)/);
  assert.match(admin, /biteboss-ad-performance-\$\{days\}d-/);
});


test('advertising manager is scoped to ad performance and ad management only', () => {
  assert.match(admin, /AD_MANAGER_ROLES = new Set\(\["ad_manager","ads","advertising","advertising_manager"\]\)/);
  assert.match(admin, /AD_MANAGER_PAGES = new Set\(\["ad-performance","ads"\]\)/);
  assert.match(admin, /if\(!canOpenAdminPage\(page\)\)/);
  assert.match(admin, /if\(isAdManager\(\)\)\{\s*await loadAds\(\);\s*return;/);
  assert.match(adminHtmlGlobal, /data-super-admin-only href="\.\/store-admin\.html"/);
});

test('advertising security layer enforces server-side config and analytics capabilities', () => {
  const sql = read('sql/biteboss-82.17-ad-security.sql');
  assert.match(sql, /biteboss_admin_has_capability_v8217/);
  assert.match(sql, /AD_CONFIG_KEY_FORBIDDEN/);
  assert.match(sql, /ad_campaign_settings','ad_creatives','ad_public_campaigns/);
  assert.match(sql, /revoke insert, update, delete on table public\.biteboss_app_config from anon, authenticated/);
  assert.match(sql, /AD_EVENT_INPUT_TOO_LONG/);
  assert.match(sql, /name like 'ads\/%'/);
  assert.match(admin, /biteboss_admin_config_upsert_v8217/);
  assert.match(admin, /biteboss_admin_list_campaigns_v8217/);
  assert.match(admin, /biteboss_admin_upsert_campaign_v8217/);
  assert.match(admin, /biteboss_admin_delete_campaign_v8217/);
  assert.match(admin, /biteboss_admin_ad_analytics_v8217/);
  assert.match(admin, /biteboss_admin_ad_creative_analytics_v8217/);
  assert.doesNotMatch(admin, /from\("biteboss_app_config"\)\.upsert/);
});


test('82.18 routes legacy admin RPCs through a full-admin server proxy', () => {
  const sql = read('sql/biteboss-82.18-admin-rpc-lockdown.sql');
  assert.match(admin, /DIRECT_ADMIN_RPCS = new Set/);
  assert.match(admin, /biteboss_admin_call_v8218/);
  assert.match(admin, /if\(!rpcName\.startsWith\("biteboss_admin_"\) \|\| DIRECT_ADMIN_RPCS\.has\(rpcName\)\)/);
  assert.match(sql, /biteboss_admin_require_capability_v8217\('admin\.full'\)/);
  assert.match(sql, /revoke execute on function %s from public, anon, authenticated/);
  assert.match(sql, /p\.proname like 'biteboss_admin_%'/);
  assert.match(sql, /has_function_privilege\('authenticated'/);
});
