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
  const canonicalSql = read('sql/biteboss-82.41-ad-campaign-canonical-config.sql');
  assert.match(sql, /biteboss_admin_has_capability_v8217/);
  assert.match(sql, /AD_CONFIG_KEY_FORBIDDEN/);
  assert.match(canonicalSql, /'ad_campaigns','ad_campaign_settings','ad_creatives','ad_public_campaigns'/);
  assert.match(sql, /revoke insert, update, delete on table public\.biteboss_app_config from anon, authenticated/);
  assert.match(sql, /AD_EVENT_INPUT_TOO_LONG/);
  assert.match(sql, /name like 'ads\/%'/);
  assert.match(admin, /biteboss_admin_config_upsert_v8217/);
  assert.match(admin, /biteboss_admin_list_campaigns_v8239/);
  assert.match(admin, /key:"ad_campaigns"/);
  assert.match(admin, /const campaignId = editingId \|\| crypto\.randomUUID\(\)/);
  assert.doesNotMatch(admin, /adminRpc\("biteboss_admin_upsert_campaign_v8239"/);
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

test('82.24 tracks privacy-minimized total traffic and member access analytics', () => {
  const baseSql = read('sql/biteboss-82.19-access-analytics.sql');
  const sql = read('sql/biteboss-82.24-traffic-analytics.sql');
  const adminHtml = read('admin.html');
  const geoApi = read('api/access-context.js');
  assert.match(app, /biteboss_access_ping_v8224/);
  assert.match(app, /function accessTelemetryVisitorKey\(\)/);
  assert.match(app, /function accessTelemetryDevice\(\)/);
  assert.match(app, /function accessTelemetryGeo\(\)/);
  assert.match(app, /tier:"plus"/);
  assert.match(app, /tier:"pro"/);
  assert.match(baseSql, /create table if not exists public\.biteboss_access_sessions/);
  assert.match(sql, /biteboss_admin_access_analytics_v8224/);
  assert.match(sql, /add column if not exists country_code/);
  assert.match(sql, /add column if not exists device_class/);
  assert.match(sql, /never stores IP addresses, GPS coordinates/);
  assert.match(geoApi, /x-vercel-ip-country/);
  assert.doesNotMatch(geoApi, /x-forwarded-for|req\.socket|remoteAddress/i);
  assert.match(adminHtml, /id="accessNewVisitors"/);
  assert.match(adminHtml, /id="accessCountryBreakdown"/);
  assert.match(adminHtml, /id="accessDeviceBreakdown"/);
  assert.match(adminHtml, /id="accessRecentList"/);
  assert.match(admin, /biteboss_admin_access_analytics_v8224/);
  assert.match(admin, /PARTNER/);
  assert.match(admin, /PLUS/);
  assert.match(admin, /PRO/);
});

test('82.19 admin layout uses unified hierarchy and explicit moderation/ad action controls', () => {
  const adminCss = read('admin.css');
  assert.match(adminCss, /admin-page-head h2\{[^}]*font-size:30px/);
  assert.match(adminCss, /admin-comment-actions \.text-btn\{[^}]*min-height:30px/);
  assert.match(adminCss, /admin-ad-thumb\.admin-ad-placeholder/);
  assert.match(admin, /이름 없는 캠페인/);
});

test('82.20 dashboard performance and partner request controls use direct button choices', () => {
  const adminHtml = read('admin.html');
  const adminCss = read('admin.css');
  assert.match(adminHtml, /data-analytics-compare="previous"[^>]*>이전 기간<\/button>/);
  assert.match(adminHtml, /data-analytics-compare="year"[^>]*>전년 동기<\/button>/);
  assert.doesNotMatch(adminHtml, /id="analyticsCompareMode"/);
  assert.match(admin, /function analyticsCompareLabel\(period\)/);
  assert.match(adminHtml, /data-partner-filter="pending"[^>]*>확인 대기<\/button>/);
  assert.match(adminHtml, /data-partner-filter="approved"[^>]*>승인 완료<\/button>/);
  assert.doesNotMatch(adminHtml, /id="partnerRequestFilter"/);
  assert.match(adminCss, /analytics-compare-tabs button\.active\{background:#111;color:#fff\}/);
  assert.match(adminCss, /partner-request-filters button\.active\{background:#111;color:#fff\}/);
});


test('82.24 home hook copy paints before network config resolves', () => {
  const initBlock = blockBetween(app, 'async function init()', 'function readPartnerBannerPhotoCache');
  assert.match(app, /HOME_COPY_CACHE_KEY = "biteboss:home-copy-v1"/);
  assert.match(app, /function restoreCachedHomeCopy\(\)/);
  assert.match(app, /function cacheHomeCopy\(\)/);
  const restoreIndex = initBlock.indexOf('restoreCachedHomeCopy();');
  const renderIndex = initBlock.indexOf('renderHomeCopy();');
  const sessionIndex = initBlock.indexOf('await ensureUserSession();');
  const configIndex = initBlock.indexOf('await loadConfig();');
  assert.ok(restoreIndex >= 0 && renderIndex > restoreIndex, 'cached home copy renders immediately');
  assert.ok(sessionIndex > renderIndex && configIndex > sessionIndex, 'home copy renders before auth/config network waits');
  const configBlock = blockBetween(app, 'async function loadConfig()', 'function renderHomeCopy');
  assert.match(configBlock, /cacheHomeCopy\(\)/);
});


test('store info renders every supported social account as an information row without link decoration', () => {
  assert.match(app, /\["웹사이트",store\.website_url\]/);
  assert.match(app, /\["Instagram",store\.instagram_url\]/);
  assert.match(app, /\["YouTube",store\.youtube_url\]/);
  assert.match(app, /\["TikTok",store\.tiktok_url\]/);
  assert.match(app, /\["네이버 블로그",store\.naver_blog_url\]/);
  assert.match(app, /class="store-detail-link-row"/);
  assert.doesNotMatch(css, /\.store-social-links/);
  assert.match(css, /\.store-detail-link-row a\{[^}]*text-decoration:none/);
  assert.match(css, /\.store-detail-link-row a:hover,\.store-detail-link-row a:focus-visible\{text-decoration:none\}/);
});

test('release source contains no stale historical version-tag comments', () => {
  const releaseText = `${app}\n${css}\n${read('admin.css')}\n${read('store-admin.css')}\n${read('app-config.js')}`;
  assert.doesNotMatch(releaseText, /(?:release\s+66\.3|\/\*\s*81\.|\/\*\s*82\.18)/i);
});


test('82.26 current territory ranking opens the occupied store list and avoids duplicate map loads', () => {
  assert.match(app, /data-territory-rank/);
  assert.match(app, /function openTerritoryRankStores\(trigger\)/);
  assert.match(app, /fetchTerritoryRows\(\)/);
  assert.match(app, /data-territory-store=/);
  assert.match(app, /await openStoreDetail\(storeId\)/);
  assert.match(css, /\.territory-rank-card\[data-territory-rank\]\{[^}]*cursor:pointer/);
  const rankTabBlock = blockBetween(app, 'const openTerritoryStoresFromRank', '$$("[data-rank-period]")');
  assert.match(rankTabBlock, /openTerritoryRankStores\(trigger\)/);
  assert.doesNotMatch(rankTabBlock, /if\(currentRank === "territory"\) await loadTerritoryMap\(\)/);
});


test('82.26 keeps PRO store-manager features visible but disabled for PARTNER stores', () => {
  const storeAdminHtml = read('store-admin.html');
  const storeAdminJs = read('store-admin.js');
  const storeAdminCss = read('store-admin.css');
  assert.match(storeAdminHtml, /data-pro-feature="unique"/);
  assert.match(storeAdminHtml, /data-pro-feature="new"/);
  assert.match(storeAdminHtml, /data-pro-feature="repeat"/);
  assert.match(storeAdminHtml, /data-pro-feature="benefits"/);
  assert.match(storeAdminHtml, /PRO에서 사용/);
  assert.match(storeAdminJs, /classList\.toggle\("is-locked",!isPro\)/);
  assert.match(storeAdminJs, /setAttribute\("aria-disabled",isPro \? "false" : "true"\)/);
  assert.match(storeAdminCss, /\.pro-feature\.is-locked/);
  assert.match(storeAdminCss, /cursor:not-allowed/);
  assert.match(storeAdminCss, /store-plan-pro \.pro-feature-head>b\{display:none\}/);
});


test('82.31 benefit passes keep eligibility secure while removing duplicate pass copy and visual noise', () => {
  const storeAdminHtml = read('store-admin.html');
  assert.match(html, /id="benefitPassScreen" class="benefit-pass-screen hidden"/);
  assert.match(html, /id="benefitPassClock"/);
  assert.match(html, /id="benefitPassCountdown"/);
  assert.doesNotMatch(html, /benefit-pass-signal/);
  assert.doesNotMatch(html, /id="benefitPassRole"/);
  assert.doesNotMatch(html, /id="benefitPassCode"/);
  assert.match(app, /sb\.rpc\("biteboss_create_offer_pass"/);
  assert.match(app, /openBenefitPassScreen\(data, offerId\)/);
  assert.match(app, /ROLE_REQUIRED/);
  assert.match(css, /\.benefit-pass-screen\{position:fixed;z-index:1800;inset:0/);
  assert.doesNotMatch(css, /benefitSignal/);
  assert.match(storeAdminHtml, /<option value="crew" selected>크루 \+ 보스<\/option>/);
  assert.match(app, /async function createDefaultBossPass\(storeId, storeName\)/);
  assert.match(app, /sb\.rpc\("biteboss_my_store_status",\{p_store_id:id\}\)/);
  assert.match(app, /data-default-benefit-store/);
  assert.match(app, /data-default-benefit-name/);
  assert.match(app, />인증하기<\/button>/);
  assert.match(app, /\$\$\("\[data-default-benefit-store\]", body\)\.forEach/);
  assert.match(app, /createDefaultBossPass\(\s*button\.dataset\.defaultBenefitStore,\s*button\.dataset\.defaultBenefitName\s*\)/s);
  assert.match(app, /혜택 제공 여부는 매장 정책에 따라 달라질 수 있습니다/);
  assert.match(app, /defaultBossPassEligible = !isPartner && \(isBoss \|\| isCrew\)/);
  assert.doesNotMatch(app, /label:"BOSS PASS"/);
  assert.doesNotMatch(app, /점령 인증 패스/);
  assert.doesNotMatch(app, /패스 보기/);
});


test('82.31 current territory ranking and territory store modal have no decorative arrows', () => {
  assert.doesNotMatch(app, /territory-rank-result[\s\S]{0,220}<i[^>]*>→<\/i>/);
  assert.doesNotMatch(app, /rank-territory-store-arrow/);
  assert.doesNotMatch(css, /rank-territory-store-arrow/);
  assert.match(css, /\.territory-rank-result\{display:block\}/);
  assert.match(css, /\.rank-territory-store\{[^}]*display:block/);
});



test('82.35 store-list-only ads save without requiring a home banner image', () => {
  const adminHtml = read('admin.html');
  assert.match(adminHtml, /id="adStoreListImageFile"[\s\S]*?1200×240/);
  assert.match(admin, /placement === "store_list" && !storeListImageUrl/);
  assert.match(admin, /const usesStoreListFallback=!imageUrl && Boolean\(storeListImageUrl\)/);
  assert.match(admin, /p_image_url:canonicalImageUrl/);
  assert.match(admin, /creative\.image_url \|\| creative\.store_list_image_url/);
  assert.match(admin, /imageFileToJpegBlob\(storeListFile,1800,360/);
  assert.doesNotMatch(admin, /setStatusText\(status, "배너 이미지를 선택하세요\."\)/);
});

test('82.35 current territory store modal paginates 10 stores per page', () => {
  assert.match(app, /const TERRITORY_STORE_PAGE_SIZE = 10/);
  assert.match(app, /rank-territory-pagination hidden/);
  assert.match(app, /pageSlice\(rows, territoryStorePage, TERRITORY_STORE_PAGE_SIZE\)/);
  assert.match(app, /renderPagination\(nav, territoryStorePage, rows\.length, TERRITORY_STORE_PAGE_SIZE/);
  assert.match(app, /territoryStorePage = nextPage/);
  assert.match(app, /renderTerritoryStorePage\(\)/);
});

test('82.41 ad campaign CRUD uses one canonical config contract', () => {
  assert.match(admin, /function adCampaignConfig\(\)/);
  assert.match(admin, /const campaignId = editingId \|\| crypto\.randomUUID\(\)/);
  assert.match(admin, /\{key:"ad_campaigns",value:campaigns\}/);
  assert.doesNotMatch(admin, /CAMPAIGN_NOT_RESOLVED_AFTER_CREATE|CAMPAIGN_ID_NOT_RETURNED/);
  assert.doesNotMatch(admin, /adminRpc\("biteboss_admin_upsert_campaign_v8239"/);
  assert.match(admin, /configPersisted=true/);
  assert.match(admin, /if\(!configPersisted && newStoreListStoragePath\)/);
});

test('82.41 ad campaign delete clears canonical campaigns, settings, creatives and public inventory together', () => {
  assert.match(admin, /const uniquePaths=\[\.\.\.new Set\(paths\)\]/);
  assert.match(admin, /secureAdminConfigUpsert\(\[\s*\{key:"ad_campaigns",value:campaigns\}/s);
  assert.match(admin, /\{key:"ad_creatives",value:creatives\}/);
  assert.match(admin, /\{key:"ad_campaign_settings",value:settings\}/);
  assert.match(admin, /\{key:"ad_public_campaigns",value:publicRows\}/);
  assert.match(admin, /const campaigns=adCampaigns\.filter\(row=>String\(row\.id\)!==String\(id\)\)/);
  assert.match(admin, /Best-effort legacy cleanup only/);
  assert.match(admin, /creativeCount=campaignCreatives\(item\)\.filter\(c=>c\.is_active!==false && \(c\.image_url \|\| c\.store_list_image_url\)\)\.length/);
});

test('82.43 ad performance drills down from overall to campaign to creative', () => {
  const adminHtml = read('admin.html');
  const sql = read('sql/biteboss-82.43-ad-performance-drilldown.sql');
  assert.match(adminHtml, /id="adPerformanceScopeTitle"/);
  assert.match(adminHtml, /id="adPerformanceScopeDescription"/);
  assert.match(adminHtml, /id="adPerformanceReset"/);
  assert.match(admin, /biteboss_admin_ad_performance_detail_v8243/);
  assert.match(admin, /selectedAdPerformanceCreativeId/);
  assert.match(admin, /data-ad-performance-creative/);
  assert.match(admin, /function resetAdPerformanceScope\(\)/);
  assert.match(admin, /renderAdPerformanceData\(data \|\| \{\},\{scope:creativeId\?"creative":"campaign"\}\)/);
  assert.match(sql, /create or replace function public\.biteboss_admin_ad_performance_detail_v8243/);
  assert.match(sql, /and \(v_campaign_id is null or e\.campaign_id = v_campaign_id\)/);
  assert.match(sql, /and \(v_creative_id is null or e\.creative_id = v_creative_id\)/);
  assert.match(sql, /generate_series/);
});
