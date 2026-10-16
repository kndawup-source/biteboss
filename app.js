(() => {
  "use strict";

  const BITEBOSS_BUILD = "81.71";
  window.__BITEBOSS_BUILD__ = BITEBOSS_BUILD;
  if(window.__BITEBOSS_APP_BOOTED__) return;
  window.__BITEBOSS_APP_BOOTED__ = true;

  const $ = q => document.querySelector(q);
  const $$ = q => [...document.querySelectorAll(q)];

  const cfg = window.BITEBOSS_CONFIG || {};

  async function ensureRuntimeDependency(name){
    try{
      if(window.BiteBossDeps?.ensure) await window.BiteBossDeps.ensure(name);
      return true;
    }catch(error){
      console.warn(`BiteBoss dependency ${name}:`, error);
      return false;
    }
  }

  const DEFAULT_NICKNAME_AREAS = Object.freeze(["명동","성수","홍대","연남","을지로","종로","강남","잠실","신촌","이태원","망원","합정","한남","청담","압구정","건대","문래","익선","서촌","해방촌","일산","가로수길","용산","마포","여의도","광화문","동대문","신사","혜화","상수"]);
  const DEFAULT_NICKNAME_TITLES = Object.freeze(["먹깨비","먹짱","맛대장","한입왕","밥도둑","맛도깨비","냠냠왕","먹보스","맛보스","쩝쩝박사","한그릇왕","두그릇왕","맛집사냥꾼","메뉴정복자","골목미식가","야식대장","간식대장","국밥대장","면치기왕","고기대장","디저트왕","커피대장","빵순례자","밥친구","맛탐험가","먹방대장","맛부장","냠냠대장","식도락왕","한입대장","배부른왕","맛고수","먹고수","맛수집가","끼니대장","메뉴헌터","맛집대장","먹대장","맛짱","푸드파이터"]);
  const DEFAULT_NICKNAME_CAPACITY = DEFAULT_NICKNAME_AREAS.length * DEFAULT_NICKNAME_TITLES.length;
  const NICKNAME_MAX_LENGTH = 40;

  function normalizeNickname(value = ""){
    return String(value || "").trim().replace(/\s+/g, " ").slice(0, NICKNAME_MAX_LENGTH);
  }

  function stableHash(value = ""){
    let hash = 2166136261;
    for(const char of String(value)){
      hash ^= char.codePointAt(0) || 0;
      hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
  }

  function generateDefaultNickname(seed = "", attempt = 0){
    const source = String(seed || `${Date.now()}-${Math.random()}`);
    const offset = Math.max(0, Number(attempt) || 0) % DEFAULT_NICKNAME_CAPACITY;
    const index = (stableHash(source) + offset * 7919) % DEFAULT_NICKNAME_CAPACITY;
    const area = DEFAULT_NICKNAME_AREAS[index % DEFAULT_NICKNAME_AREAS.length];
    const title = DEFAULT_NICKNAME_TITLES[Math.floor(index / DEFAULT_NICKNAME_AREAS.length) % DEFAULT_NICKNAME_TITLES.length];
    return `${area}${title}`;
  }


  function isNicknameConflict(error){
    const code = String(error?.code || "");
    const message = String(error?.message || error || "").toLowerCase();
    return code === "23505" || message.includes("nickname_unique") || message.includes("duplicate key") && message.includes("nickname");
  }

  function rpcRow(data){
    return Array.isArray(data) ? (data[0] || null) : (data || null);
  }

  async function nicknameAvailable(value){
    const nickname = normalizeNickname(value);
    if(!nickname) return false;
    const {data,error} = await sb.rpc("biteboss_nickname_available_v7543", {p_nickname:nickname});
    if(error) throw error;
    return data === true;
  }

  async function findAvailableDefaultNickname(seed, maxAttempts = 120){
    const attempts = Math.min(DEFAULT_NICKNAME_CAPACITY, Math.max(1, Number(maxAttempts) || 1));
    for(let attempt=0; attempt<attempts; attempt+=1){
      const candidate = generateDefaultNickname(seed, attempt);
      if(await nicknameAvailable(candidate)) return candidate;
    }
    throw new Error("NICKNAME_POOL_EXHAUSTED");
  }

  async function syncAuthNickname(nickname){
    const normalized = normalizeNickname(nickname);
    if(!authUser || !normalized || normalizeNickname(authUser.user_metadata?.nickname) === normalized) return;
    const {data,error} = await sb.auth.updateUser({data:{nickname:normalized}});
    if(error){
      console.warn("BiteBoss nickname metadata sync:", error);
      return;
    }
    authUser = data?.user || authUser;
  }


  function notificationKindLabel(kind){
    return ({
      boss_lost:"점령", boss_won:"점령", boss_protection:"방어",
      crew_invite:"크루", crew_joined:"크루", crew_member_joined:"크루",
      crew_member_left:"크루", crew_kicked:"크루", crew_leader_changed:"크루",
      store_offer:"매장", system:"시스템"
    })[String(kind || "")] || "BiteBoss";
  }

  function notificationIsUnread(item = {}){
    if(Object.prototype.hasOwnProperty.call(item,"is_read")) return item.is_read === false;
    if(Object.prototype.hasOwnProperty.call(item,"read_at")) return !item.read_at;
    return false;
  }

  function notificationIconMarkup(kind){
    const category = notificationKindLabel(kind);
    const path = category === "점령"
      ? '<path d="M12 3v18M5 8h14M7 8l2-3h6l2 3M8 21h8"/>'
      : category === "방어"
        ? '<path d="M12 3 5.5 5.5v5.7c0 4.3 2.7 7.9 6.5 9.8 3.8-1.9 6.5-5.5 6.5-9.8V5.5L12 3z"/><path d="m9.2 12 1.8 1.8 3.8-4"/>'
        : category === "크루"
          ? '<path d="M8.5 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM15.8 10a2.4 2.4 0 1 0 0-4.8M3.5 19a5 5 0 0 1 10 0M14 14.5a4.3 4.3 0 0 1 6.5 3.7"/>'
          : category === "매장"
            ? '<path d="M5 9 6.2 5h11.6L19 9M6 11v8h12v-8M9 19v-5h6v5"/>'
            : '<path d="M12 8v4l2.5 2.5M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18z"/>';
    return `<span class="notification-kind-icon" aria-hidden="true"><svg viewBox="0 0 24 24">${path}</svg></span>`;
  }

  function notificationFallbackTitle(item = {}){
    return ({
      boss_lost:"점령지를 빼앗겼습니다", boss_won:"새 매장을 점령했습니다", boss_protection:"보호 상태가 변경됐습니다",
      crew_invite:"크루 초대가 도착했습니다", crew_joined:"크루에 가입했습니다", crew_member_joined:"새 크루원이 합류했습니다",
      crew_member_left:"크루원이 떠났습니다", crew_kicked:"크루에서 제외되었습니다", crew_leader_changed:"크루 리더가 변경됐습니다",
      store_offer:"새 매장 혜택이 있습니다", system:"BiteBoss 안내"
    })[String(item.kind || "")] || "BiteBoss 알림";
  }
  let homeSplashRequestId = 0;
  const HOME_SPLASH_CACHE_KEY = "biteboss:home-splash-url";
  const PARTNER_BANNERS_CACHE_KEY = "biteboss-partner-banners-v81";

  const config = {
    protect_minutes:60,
    reclaim_cooldown_minutes:1440,
    capture_cooldown_minutes:60,
    gps_radius_m:50,
    max_location_accuracy_m:100,
    gps_dwell_seconds:120,
    gps_presence_ping_seconds:10,
    gps_nearby_refresh_distance_m:80,
    gps_nearby_refresh_min_seconds:12,
    gps_nearby_watch_max_accuracy_m:250,
    daily_store_limit:1,
    nearby_radius_m:3000,
    nearby_limit:20,
    auto_store_import_enabled:true,
    auto_store_import_min_count:10,
    auto_store_import_radius_m:1000,
    feature_ranking:true,
    feature_offers:true,
    home_splash_image_url:"",
    default_profile_image_url:"",
    home_hook_enabled:true,
    home_hook_text:"찍고, 점령하고, 보스가 돼.",
    home_primary_cta:"QR 스캔하기",
    home_secondary_cta:"내 주변 보스 찾기",
    partner_banners:[],
    ad_public_campaigns:[],
    crew_qr_invite_hours:72,
    crew_qr_max_uses:30,
    crew_max_members:30,
    // Backend takeover-session policy keys remain available because the server RPC reads them.
    // The visible capture countdown is driven by biteboss_presence_ping only,
    // so users never see a timer finish before the server can actually award the store.
    takeover_empty_seconds:120,
    takeover_challenge_seconds:120,
    takeover_retake_seconds:120,
    takeover_hot_seconds:120,
    takeover_grace_seconds:3,
    takeover_cancel_outside_seconds:12,
    hot_store_challenges_24h:5,
    new_player_protection_claims:5
  };

  const DEFAULT_PROFILE_IMAGE_CACHE_KEY = "biteboss-default-profile-image-v1";

  function readCachedDefaultProfileImage(){
    try{ return String(localStorage.getItem(DEFAULT_PROFILE_IMAGE_CACHE_KEY) || "").trim(); }
    catch{ return ""; }
  }

  function cacheDefaultProfileImage(url){
    try{
      const value = String(url || "").trim();
      if(value) localStorage.setItem(DEFAULT_PROFILE_IMAGE_CACHE_KEY, value);
      else localStorage.removeItem(DEFAULT_PROFILE_IMAGE_CACHE_KEY);
    }catch{}
  }

  function defaultProfileImageUrl(){
    return String(config.default_profile_image_url || readCachedDefaultProfileImage() || "").trim();
  }

  const defaultProfilePreloads = new Map();
  function preloadDefaultProfileImage(url = defaultProfileImageUrl()){
    const src = String(url || "").trim();
    if(!src) return Promise.resolve(false);
    if(defaultProfilePreloads.has(src)) return defaultProfilePreloads.get(src);

    const request = new Promise(resolve => {
      const image = new Image();
      image.decoding = "sync";
      image.fetchPriority = "high";
      image.onload = () => resolve(true);
      image.onerror = () => resolve(false);
      image.src = src;
      if(image.complete && image.naturalWidth > 0) resolve(true);
    });
    defaultProfilePreloads.set(src, request);
    return request;
  }

  // Warm-start campaign/profile assets so first paint never waits for a second avatar request.
  config.partner_banners = readCachedPartnerBanners();
  config.default_profile_image_url = readCachedDefaultProfileImage();
  void preloadDefaultProfileImage(config.default_profile_image_url);

  const RUNTIME = Object.freeze({
    foregroundRefreshMinMs:30000,
    autoImportRetryMs:120000,
    autoImportCacheLimit:12,
    apiTimeoutMs:7000,
    initialLocationTimeoutMs:2500,
    initialLocationMaxAgeMs:60000,
    foregroundLocationMaxAgeMs:30000,
    takeoverUiTickMs:250,
    localOwnershipGraceMs:120000,
    gamePulseCacheMs:15000,
    storeSearchDebounceMs:250
  });
  const TAKEOVER_IDLE_STATES = new Set(["hold","outside","low_accuracy","cancelled","ready"]);


  let authUser = null;
  let profile = null;
  let organization = null;
  let organizationCooldown = null;
  let captureCooldown = null;
  let organizationInvites = [];
  let organizationMembers = [];
  let playerSession = null;
  const storeCommentState = new Map();
  let stores = [];
  let lastPosition = null;
  let nearbyWatchId = null;
  let nearbyRefreshBusy = false;
  let nearbyLastRefreshPosition = null;
  let nearbyLastRefreshAt = 0;
  let scanner = null;
  let currentRank = "players";
  let currentRankPeriod = "week";
  const RANK_PERIODS = new Set(["week","month","all"]);
  function normalizeRankPeriod(value){
    const period = String(value || "").trim();
    return RANK_PERIODS.has(period) ? period : "week";
  }
  let rankLoadSeq = 0;
  let storePage = 1;
  const STORE_PAGE_SIZE = 8;
  let storeViewRows = [];
  let rankPage = 1;
  const RANK_PAGE_SIZE = 10;
  let rankViewItems = [];
  let profileActivityPage = 1;
  const PROFILE_ACTIVITY_PAGE_SIZE = 8;
  let profileActivityRows = [];
  let visitPage = 1;
  const VISIT_PAGE_SIZE = 8;
  let visitRows = [];
  let summary = null;
  let homeLoadPromise = null;
  let storeSearchTimer = null;
  let storeSearchSeq = 0;
  let presenceTimer = null;
  let delayedTakeoverCloseTimer = null;
  let takeoverCancelResetTimer = null;
  const autoImportAttempts = new Map();
  let presenceBusy = false;
  let presenceBlockedReason = "";
  let presenceBoundaryTargetId = "";
  let presenceLastInRadiusAt = 0;
  const PRESENCE_BOUNDARY_GRACE_MS = 15 * 1000;
  let takeoverUi = null;
  let takeoverUiTimer = null;
  let storeReclaimTimer = null;
  let storeListReclaimTimer = null;
  let activeStoreDetailId = "";
  const storeReclaimCache = new Map();
  const storeReclaimInflight = new Map();
  const STORE_RECLAIM_CACHE_TTL_MS = 60 * 1000;
  let takeoverLastServerAt = 0;
  let takeoverRemaining = 0;
  let takeoverRequired = 0;
  let takeoverCancelledLocally = false;
  const dismissedTakeoverStores = new Map();
  let preferredTakeoverStoreId = "";
  let takeoverChoiceOpen = false;
  const TAKEOVER_DISMISS_RESET_DISTANCE_M = 180;
  let modalScrollY = 0;
  let modalReturnFocus = null;
  let gamePulseLoadedAt = 0;
  let activeBanner = null;
  const presenceState = new Map();
  const storeRoleMap = new Map();
  const locallyOwnedStoreIds = new Map();
  let territoryMap = null;
  let storeDetailMap = null;
  let storeDetailStorePoint = null;
  let storeDetailUserMarker = null;
  let storeDetailAccuracyCircle = null;
  let territoryMapLayer = null;
  let territoryUserLayer = null;
  let territoryMapRows = [];
  let pendingCrewInviteToken = "";
  let lastForegroundRefreshAt = 0;
  let foregroundRefreshPromise = null;
  let pushListenersBound = false;
  let pushDeviceToken = "";
  let pushPermissionState = "unknown";
  let pushPreferences = null;
  let pushUnreadCount = 0;
  let notificationPage = 1;
  const NOTIFICATION_PAGE_SIZE = 8;
  const adSessionKey = getAdSessionKey();

  init().catch(fatalError);


  function syncRuntimeShell(){
    let native = false;
    try{
      native = Boolean(window.Capacitor?.isNativePlatform?.()) ||
        (typeof window.Capacitor?.getPlatform === "function" && window.Capacitor.getPlatform() !== "web");
    }catch{}

    const standalone = !native && (
      window.matchMedia?.("(display-mode: standalone)")?.matches === true ||
      window.navigator.standalone === true
    );

    document.documentElement.classList.toggle("native-shell", native);
    document.body?.classList.toggle("native-shell", native);
    document.documentElement.classList.toggle("pwa-standalone", standalone);
    document.body?.classList.toggle("pwa-standalone", standalone);
    return native || standalone;
  }

  async function init(){
    syncRuntimeShell();
    syncViewportMetrics();
    bindUi();
    bindStaticUi();
    const initialTab = primaryTabFromPath(location.pathname);
    setupNativeUrlListener();
    setupPushListeners();
    updateNetworkState();

    // Paint the last successful hero immediately while auth/config load in the background.
    renderHomeSplashImage({ preferCached:true, allowEmpty:false });

    if(!window.sb){
      throw new Error(window.BITEBOSS_BOOT_ERROR || "BiteBoss could not connect to Supabase.");
    }

    await ensureUserSession();
    await restorePlayerSession();
    await ensureProfile();

    // Paint persisted member values before config/organization/network refreshes begin.
    // This makes the next-level number and bar available on the first rank frame.
    if(playerSession?.authenticated){
      const cachedMemberSummary = readCachedMemberSummary();
      if(cachedMemberSummary) paintMemberSummary(cachedMemberSummary);
      else restoreRankMeter(); // legacy cache fallback; migrated on the next successful summary refresh
    }

    // Do not activate a deep-linked primary tab before auth/profile cache restoration.
    // In particular, #rank used to render the HTML 0 / 500 XP placeholder for one frame.
    if(["stores","rank","profile"].includes(initialTab)) openTab(initialTab, { historyMode:"replace" });

    // Load server state in parallel. Location must not block first paint.
    await Promise.all([
      loadConfig(),
      loadMyOrganization(),
      loadGameActivity(),
      loadCaptureCooldownStatus()
    ]);

    renderHomeSplashImage();
    renderHomeCopy();
    paintImmediatePartnerBanner();
    updateProfileUi();
    await refreshNotificationState({ registerIfGranted:true });

    const initialPositionPromise = getPositionSafe(false, {
      timeout:RUNTIME.initialLocationTimeoutMs,
      maximumAge:RUNTIME.initialLocationMaxAgeMs
    });

    await Promise.all([
      loadHome(),
      loadAlerts(),
      loadBanner()
    ]);

    lastPosition = await initialPositionPromise;
    if(lastPosition?.coords){
      gamePulseLoadedAt = 0;
      if($("#page-stores")?.classList.contains("active")) void loadGamePulse(true);
    }
    await loadStores();
    if(lastPosition?.coords){
      nearbyLastRefreshPosition = lastPosition;
      nearbyLastRefreshAt = Date.now();
    }
    startNearbyLocationWatch();

    // Cleanup is non-critical. Never delay app readiness for maintenance work.
    void (async () => {
      try{
        await sb.rpc("biteboss_runtime_cleanup");
      }catch(error){
        console.warn("BiteBoss runtime cleanup:", error);
      }
    })();

    await handleClaimParam();
    await handleCrewInviteParam();
    startPresenceTracking();
    registerServiceWorker();
  }

  function setupNativeUrlListener(){
    try{
      const appPlugin = window.Capacitor?.Plugins?.App;
      if(!appPlugin?.addListener) return;

      appPlugin.addListener("appUrlOpen", async event => {
        const incoming = String(event?.url || "").trim();
        if(!incoming) return;

        const crewToken = extractCrewInviteToken(incoming);
        if(crewToken){
          pendingCrewInviteToken = crewToken;
          await previewCrewInvite(crewToken);
        }
      });
    }catch(error){
      console.warn("BiteBoss app URL listener:", error);
    }
  }

  function bindStaticUi(){
    const privacy = $("#privacyLink");
    const support = $("#supportLink");
    if(privacy) privacy.href = cfg.privacyUrl || "./privacy-policy.html?return=profile";
    if(support) support.href = cfg.supportUrl || "./support.html?return=profile";

    window.addEventListener("online", updateNetworkState);
    window.addEventListener("offline", updateNetworkState);
    window.addEventListener("resize", () => { syncRuntimeShell(); syncViewportMetrics(); }, { passive:true });
    window.addEventListener("orientationchange", () => { syncRuntimeShell(); syncViewportMetrics(); }, { passive:true });
    window.visualViewport?.addEventListener("resize", syncViewportMetrics, { passive:true });

    const resume = () => {
      if(document.hidden) return;
      startNearbyLocationWatch();
      // Resume GPS capture immediately. The full foreground refresh can finish in parallel.
      startPresenceTracking();
      refreshAfterForeground().catch(error => {
        console.warn("BiteBoss foreground refresh:", error);
      });
    };

    document.addEventListener("visibilitychange", () => {
      if(document.hidden){
        stopPresenceTracking();
        stopNearbyLocationWatch();
        return;
      }
      resume();
    });
    window.addEventListener("focus", resume);
    window.addEventListener("pagehide", cleanupRuntime, { once:false });
  }

  function clearTimeoutRef(value){
    if(value !== null) clearTimeout(value);
    return null;
  }

  function clearIntervalRef(value){
    if(value !== null) clearInterval(value);
    return null;
  }

  function cleanupRuntime(){
    stopPresenceTracking();
    stopNearbyLocationWatch();
    storeSearchTimer = clearTimeoutRef(storeSearchTimer);
    takeoverUiTimer = clearIntervalRef(takeoverUiTimer);
    storeReclaimTimer = clearIntervalRef(storeReclaimTimer);
    storeListReclaimTimer = clearIntervalRef(storeListReclaimTimer);
    delayedTakeoverCloseTimer = clearTimeoutRef(delayedTakeoverCloseTimer);
    takeoverCancelResetTimer = clearTimeoutRef(takeoverCancelResetTimer);
  }

  async function refreshAfterForeground(){
    if(!window.sb || document.hidden) return;
    if(foregroundRefreshPromise) return foregroundRefreshPromise;

    const now = Date.now();
    const elapsed = now - lastForegroundRefreshAt;

    // Returning from Control Center / camera can trigger visibility repeatedly.
    // Avoid re-fetching the entire app more than once every 30 seconds.
    if(elapsed < RUNTIME.foregroundRefreshMinMs){
      startPresenceTracking();
      return;
    }

    lastForegroundRefreshAt = now;
    foregroundRefreshPromise = (async () => {
      await loadConfig();
      renderHomeSplashImage();
      renderHomeCopy();
  
      const positionPromise = getPositionSafe(false, {
        timeout:RUNTIME.initialLocationTimeoutMs,
        maximumAge:RUNTIME.foregroundLocationMaxAgeMs
      });

      await Promise.all([
        loadHome(),
        loadMyOrganization(),
        loadBanner(),
        loadGameActivity(),
        refreshNotificationState({ registerIfGranted:true })
      ]);

      const nextPosition = await positionPromise;
      if(nextPosition) lastPosition = nextPosition;
      await loadStores();

      if($("#page-alerts")?.classList.contains("active")) await loadAlerts();
      if($("#page-rank")?.classList.contains("active")) await loadRank();

      startPresenceTracking();
    })();

    try{
      await foregroundRefreshPromise;
    }finally{
      foregroundRefreshPromise = null;
    }
  }

  function bindUi(){
    document.addEventListener("touchmove", blockHomeViewportScroll, { passive:false });
    document.addEventListener("wheel", blockHomeViewportScroll, { passive:false });
    window.addEventListener("popstate", () => {
      openTab(primaryTabFromPath(location.pathname), { historyMode:"replace" });
    });

    $$(".nav-btn,[data-tab]").forEach(btn => {
      btn.addEventListener("click", () => openTab(btn.dataset.tab));
    });

    $("#modalClose")?.addEventListener("click", closeModal);
    $("#modal")?.addEventListener("click", event => {
      if(event.target.id === "modal") closeModal();
    });

    $("#scanBtn")?.addEventListener("click", scanPrompt);
    $("#storeSearch")?.addEventListener("input", () => {
      clearTimeout(storeSearchTimer);
      storeSearchTimer = setTimeout(searchStores, RUNTIME.storeSearchDebounceMs);
    });
    $("#homeEditProfile")?.addEventListener("click", openProfileEditor);
    $("#homeAvatarButton")?.addEventListener("click", openProfileEditor);
    $("#profileAvatarButton")?.addEventListener("click", openProfileEditor);
    $$("[data-profile-action]").forEach(button => {
      button.addEventListener("click", () => {
        const action = button.dataset.profileAction;
        if(action === "level"){
          openTab("rank");
          return;
        }
        const target = action === "boss" ? $("#profileBattleSection") : $("#profileVisitSection");
        target?.scrollIntoView?.({ behavior:"smooth", block:"start" });
      });
    });
    $("#storesLoginBtn")?.addEventListener("click", openMemberLogin);
    $("#addStoreBtn")?.addEventListener("click", openMemberStoreForm);
    const organizationAction = (selector, handler) => {
      $(selector)?.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        handler(event);
      });
    };

    organizationAction("#createOrganizationBtn", openOrganizationCreate);
    organizationAction("#leaveOrganizationBtn", openOrganizationLeave);
    organizationAction("#inviteOrganizationMemberBtn", openOrganizationInvite);
    organizationAction("#foundIndependentOrganizationBtn", openIndependentOrganizationCreate);
    organizationAction("#organizationAvatarButton", openOrganizationAvatarEditor);

    $("#organizationInvites")?.addEventListener("click", handleOrganizationInviteAction);
    $("#organizationMemberList")?.addEventListener("click", handleOrganizationMemberAction);
    document.addEventListener("click", handlePlayerProfileOpen);

    const openCrewProfileFromRank = event => {
      const trigger = event.target.closest(".crew-rank-profile-trigger");
      if(!trigger) return;

      if(event.type === "keydown" && event.key !== "Enter" && event.key !== " ") return;

      const organizationId = String(trigger.dataset.organizationProfile || "").trim();
      if(!organizationId) return;

      event.preventDefault();
      event.stopPropagation();
      openOrganizationDetail(organizationId);
    };

    $("#rankList")?.addEventListener("click", openCrewProfileFromRank);
    $("#rankList")?.addEventListener("keydown", openCrewProfileFromRank);
    $("#myRankSummary")?.addEventListener("click", openCrewProfileFromRank);
    $("#myRankSummary")?.addEventListener("keydown", openCrewProfileFromRank);

    $("#organizationPanelOpen")?.addEventListener("click", event => {
      if(event.target.closest("button,a,input,select,textarea,label")) return;
      if(event.target.closest("[data-player-profile],[data-transfer-leader],[data-kick-member]")) return;
      if(!organization?.id) return;
      openCurrentOrganizationDetail();
    });
    $("#takeoverCancelBtn")?.addEventListener("click", cancelTakeoverUi);
    $("#challengeNextCard")?.addEventListener("click", () => {
      const storeId = String($("#challengeNextCard")?.dataset.storeId || "").trim();
      if(storeId) openStoreDetail(storeId);
    });
    $("#deleteAccountBtn")?.addEventListener("click", openDeleteAccount);
    $("#logoutBtn")?.addEventListener("click", logout);

    $$("[data-rank]").forEach(btn => {
      btn.addEventListener("click", async () => {
        currentRank = btn.dataset.rank || "players";
        $$("[data-rank]").forEach(item => item.classList.toggle("active", item === btn));
        syncTerritoryMapVisibility();
        syncRankPeriodVisibility();
        await loadRank();
        if(currentRank === "territory") await loadTerritoryMap();
      });
    });
    $$("[data-rank-period]").forEach(btn => {
      btn.addEventListener("click", async () => {
        currentRankPeriod = normalizeRankPeriod(btn.dataset.rankPeriod);
        $$("[data-rank-period]").forEach(item => item.classList.toggle("active", item === btn));
        await loadRank();
      });
    });
  }

  function syncViewportMetrics(){
    const viewportHeight = Math.max(1, Math.round(document.documentElement.clientHeight || window.innerHeight || 1));
    document.documentElement.style.setProperty("--app-viewport-height", `${viewportHeight}px`);
  }

  function setHomeViewportLocked(locked){
    syncViewportMetrics();
    document.body.classList.toggle("home-active", locked);
    document.documentElement.classList.toggle("home-active", locked);
    if(locked) window.scrollTo(0, 0);
  }

  function blockHomeViewportScroll(event){
    if(!document.body.classList.contains("home-active")) return;
    if(event.target?.closest?.(".modal-card")) return;
    event.preventDefault();
  }

  const PRIMARY_TAB_PATHS = Object.freeze({
    home:"/",
    stores:"/stores",
    rank:"/rank",
    profile:"/profile"
  });

  function primaryTabFromPath(pathname = location.pathname){
    const path = String(pathname || "/").replace(/\/+$/, "") || "/";
    if(path === "/stores") return "stores";
    if(path === "/rank") return "rank";
    if(path === "/profile") return "profile";
    return "home";
  }

  function syncPrimaryTabUrl(tab, historyMode = "push"){
    const path = PRIMARY_TAB_PATHS[tab];
    if(!path) return;
    const next = `${path}${location.search || ""}`;
    const current = `${location.pathname}${location.search || ""}`;
    if(current === next && !location.hash) return;
    const method = historyMode === "replace" ? "replaceState" : "pushState";
    history[method]({ ...(history.state || {}), bitebossTab:tab }, "", next);
  }

  function openTab(tab, options = {}){
    if(!tab) return;
    const isHome = tab === "home";
    setHomeViewportLocked(isHome);

    // Each primary tab is a top-level screen. Never inherit scroll position from the previous screen.
    window.scrollTo({ top:0, left:0, behavior:"auto" });

    $$(".page").forEach(page => page.classList.remove("active"));
    $(`#page-${tab}`)?.classList.add("active");
    $$(".nav-btn").forEach(btn => btn.classList.toggle("active", btn.dataset.tab === tab));
    if(["home","stores","rank","profile"].includes(tab)){
      // Public primary screens use clean paths instead of URL fragments.
      syncPrimaryTabUrl(tab, options.historyMode || "push");
    }

    if(isHome){
      window.scrollTo(0, 0);
      loadHome();
      loadBanner();
    }
    if(tab === "stores"){
      const storeList = $("#storeList");
      if(storeList && !storeList.children.length) renderStores();
      paintImmediatePartnerBanner();
      void loadGamePulse();
    }
    if(tab === "rank"){
      // Paint synchronously from memory. Persistent storage is only a cold-start fallback.
      if(summary && Number.isFinite(Number(summary.xp))) updateRankMeter(summary.xp);
      else restoreRankMeter();
      syncTerritoryMapVisibility();
      loadRank();
      if(currentRank === "territory") loadTerritoryMap();
    }
    if(tab === "alerts") loadAlerts();
    if(tab === "profile"){
      loadHistory();
      loadMyOrganization();
      loadGameActivity();
      loadMyCommentHistory(1);
    }
  }

  async function ensureUserSession(){
    const { data:{ session }, error } = await sb.auth.getSession();
    if(error) throw error;

    if(session?.user){
      // Local storage may contain an auth session whose anonymous user
      // was already deleted from auth.users. Verify it against Supabase
      // before using its UUID in biteboss_player_sessions.
      const { data:userData, error:userError } = await sb.auth.getUser();

      if(!userError && userData?.user){
        authUser = userData.user;
        return session;
      }

      console.warn("BiteBoss stale auth session detected. Recreating anonymous user.");

      try{
        await sb.auth.signOut({ scope:"local" });
      }catch(error){
        console.warn("BiteBoss stale auth cleanup:", error);
      }

      authUser = null;
    }

    const guestNickname = generateDefaultNickname(`${Date.now()}-${Math.random()}`, 0);
    const signed = await sb.auth.signInAnonymously({
      options:{
        data:{
          app:"biteboss",
          nickname:guestNickname
        }
      }
    });

    if(signed.error) throw signed.error;

    authUser = signed.data.user || signed.data.session?.user || null;

    if(!authUser){
      throw new Error("AUTH_SESSION_UNAVAILABLE");
    }

    return signed.data.session;
  }

  async function ensureProfile(){
    const metadataNickname = normalizeNickname(authUser?.user_metadata?.nickname);
    const seed = authUser?.id || `${Date.now()}-${Math.random()}`;
    const preferredNickname = metadataNickname || generateDefaultNickname(seed, 0);
    let resolvedProfile = null;

    for(let attempt=0; attempt<120; attempt+=1){
      const candidate = attempt === 0 ? preferredNickname : generateDefaultNickname(seed, attempt);
      const {data,error} = await sb.rpc("biteboss_ensure_profile", {p_nickname:candidate});
      if(!error){
        resolvedProfile = rpcRow(data);
        break;
      }
      if(!isNicknameConflict(error)) throw error;
    }

    if(!resolvedProfile) throw new Error("NICKNAME_POOL_EXHAUSTED");
    profile = resolvedProfile;

    await syncAuthNickname(profile?.nickname);
  }

  function readCachedPartnerBanners(){
    try{
      const parsed = JSON.parse(localStorage.getItem(PARTNER_BANNERS_CACHE_KEY) || "[]");
      return Array.isArray(parsed) ? parsed : [];
    }catch{
      return [];
    }
  }

  function cachePartnerBanners(rows){
    try{
      if(Array.isArray(rows)) localStorage.setItem(PARTNER_BANNERS_CACHE_KEY, JSON.stringify(rows));
    }catch{}
  }

  async function loadConfig(){
    const { data, error } = await sb
      .from("biteboss_app_config")
      .select("key,value");

    if(error){
      console.warn("BiteBoss config:", error);
      return;
    }

    const rows = Object.fromEntries((data || []).map(row => [row.key, row.value]));
    Object.keys(config).forEach(key => {
      if(Object.prototype.hasOwnProperty.call(rows, key)) config[key] = rows[key];
    });
    if(Array.isArray(rows.partner_banners)){
      config.partner_banners = rows.partner_banners;
      cachePartnerBanners(config.partner_banners);
    }

    if(Object.prototype.hasOwnProperty.call(rows, "default_profile_image_url")){
      config.default_profile_image_url = String(rows.default_profile_image_url || "").trim();
      cacheDefaultProfileImage(config.default_profile_image_url);
      await preloadDefaultProfileImage(config.default_profile_image_url);
    }

    // v81 canonical banner payload. Legacy keys are read only as a temporary
    // compatibility source; the public renderer itself uses one payload only.
    if(!Array.isArray(config.partner_banners) || !config.partner_banners.length){
      const ids = Array.isArray(rows.partner_banner_store_ids) ? rows.partner_banner_store_ids.map(String) : [];
      const copies = rows.partner_banner_copy && typeof rows.partner_banner_copy === "object" ? rows.partner_banner_copy : {};
      const distances = rows.partner_banner_distance_km && typeof rows.partner_banner_distance_km === "object" ? rows.partner_banner_distance_km : {};
      const priorities = rows.partner_banner_priority && typeof rows.partner_banner_priority === "object" ? rows.partner_banner_priority : {};
      const legacyCandidates = stores.filter(store => ids.includes(String(store?.id || "")));
      if(legacyCandidates.length){
        config.partner_banners = legacyCandidates.map(store => ({
          id:String(store.id),
          name:String(store.name || ""),
          photo_url:String(store.photo_url || ""),
          status:String(store.status || "active"),
          latitude:Number(store.latitude),
          longitude:Number(store.longitude),
          partnership_status:String(store.partnership_status || ""),
          copy:String(copies[String(store.id)] || ""),
          distance_km:distances[String(store.id)] ?? 5,
          priority:Number(priorities[String(store.id)] || 3)
        }));
        cachePartnerBanners(config.partner_banners);
      }
    }
  }

  function renderHomeSplashImage(options = {}){
    const image = $("#homeSplashImage");
    const promo = $("#homePromo");
    if(!image || !promo) return;

    const preferCached = Boolean(options.preferCached);
    const allowEmpty = options.allowEmpty !== false;
    let cachedUrl = "";
    try{ cachedUrl = String(localStorage.getItem(HOME_SPLASH_CACHE_KEY) || "").trim(); }catch{}

    const configuredUrl = String(config.home_splash_image_url || "").trim();
    const url = preferCached ? (cachedUrl || configuredUrl) : (configuredUrl || cachedUrl);

    if(!url){
      if(!allowEmpty) return;
      homeSplashRequestId += 1;
      image.removeAttribute("src");
      delete image.dataset.loadedUrl;
      image.classList.add("hidden");
      promo.classList.remove("has-splash");
      return;
    }

    const currentUrl = String(image.dataset.loadedUrl || image.getAttribute("src") || "").trim();
    if(currentUrl === url && !image.classList.contains("hidden")){
      promo.classList.add("has-splash");
      return;
    }

    const requestId = ++homeSplashRequestId;
    image.onload = () => {
      if(requestId !== homeSplashRequestId) return;
      image.dataset.loadedUrl = url;
      image.classList.remove("hidden");
      promo.classList.add("has-splash");
      try{ localStorage.setItem(HOME_SPLASH_CACHE_KEY, url); }catch{}
    };
    image.onerror = () => {
      if(requestId !== homeSplashRequestId) return;
      // If the configured URL failed, keep a previously cached hero when available.
      if(configuredUrl && cachedUrl && cachedUrl !== configuredUrl){
        image.src = cachedUrl;
        return;
      }
      image.classList.add("hidden");
      promo.classList.remove("has-splash");
    };

    image.classList.remove("hidden");
    image.src = url;
    if(image.complete && image.naturalWidth > 0){
      image.onload();
    }
  }


  function configBoolean(value, fallback=false){
    if(typeof value === "boolean") return value;
    if(typeof value === "number") return value !== 0;
    const normalized = String(value ?? "").trim().toLowerCase();
    if(["true","1","yes","on"].includes(normalized)) return true;
    if(["false","0","no","off",""].includes(normalized)) return false;
    return fallback;
  }

  function renderHomeCopy(){
    const hook = $("#homeHook");
    const primary = $("#homePrimaryCtaLabel");
    const secondary = $("#homeSecondaryCtaLabel");

    const hookText = String(config.home_hook_text || "").trim();
    const hookEnabled = configBoolean(config.home_hook_enabled, true) && Boolean(hookText);
    if(hook){
      hook.textContent = hookText;
      hook.classList.toggle("hidden", !hookEnabled);
    }

    if(primary){
      const text = String(config.home_primary_cta || "").trim();
      primary.textContent = text || "QR 스캔하기";
    }
    if(secondary){
      const text = String(config.home_secondary_cta || "").trim();
      secondary.textContent = text || "내 주변 보스 찾기";
    }
  }

  function getAdSessionKey(){
    try{
      const key = sessionStorage.getItem("biteboss-ad-session");
      if(key) return key;
      const next = window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`;
      sessionStorage.setItem("biteboss-ad-session", next);
      return next;
    }catch{
      return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    }
  }

  function adRegionKeyForStore(store){
    return [String(store?.city || "").trim(), String(store?.district || "").trim()].filter(Boolean).join(" ").trim();
  }

  function currentAdRegion(){
    const takeoverStore=takeoverUi?.storeId ? stores.find(store => String(store.id) === String(takeoverUi.storeId)) : null;
    if(takeoverStore) return adRegionKeyForStore(takeoverStore);
    if(!lastPosition?.coords) return "";
    const nearby=stores.filter(store => Number.isFinite(Number(store.latitude)) && Number.isFinite(Number(store.longitude)))
      .map(store => ({ store, distance:localStoreDistance(store) }))
      .filter(item => Number.isFinite(item.distance))
      .sort((a,b) => a.distance-b.distance)[0]?.store;
    return adRegionKeyForStore(nearby);
  }

  function campaignMatchesPlacement(campaign, placement){
    const value=String(campaign?.placement || "both");
    return value === "both" || value === placement;
  }

  function campaignMatchesRegion(campaign){
    if(String(campaign?.target_type || "all") !== "region") return true;
    const target=String(campaign?.target_region || "").replace(/\s+/g," ").trim();
    const current=currentAdRegion().replace(/\s+/g," ").trim();
    return Boolean(target && current && (current === target || current.includes(target) || target.includes(current)));
  }

  function activeCampaignFor(placement){
    const now=Date.now();
    const rows=Array.isArray(config.ad_public_campaigns) ? config.ad_public_campaigns : [];
    const eligible=rows.filter(item => {
      if(!item?.id || !item?.image_url || !item.is_active) return false;
      const start=item.starts_at ? new Date(item.starts_at).getTime() : 0;
      const end=item.ends_at ? new Date(item.ends_at).getTime() : Infinity;
      return start <= now && end > now && campaignMatchesPlacement(item,placement) && campaignMatchesRegion(item);
    });
    if(!eligible.length) return null;

    // Priority is authoritative. When several eligible campaigns share the
    // highest priority, choose one at random so inventory rotates fairly.
    const highestPriority=eligible.reduce((max,item) => Math.max(max,Number(item.sort_order || 0)), -Infinity);
    const topTier=eligible.filter(item => Number(item.sort_order || 0) === highestPriority);
    return topTier[Math.floor(Math.random()*topTier.length)] || null;
  }

  async function loadBanner(){
    const banner = $("#homeAdBanner");
    const image = $("#homeAdImage");
    if(!banner || !image || !window.sb) return;

    let homeCampaign=activeCampaignFor("home");
    let takeoverCampaign=activeCampaignFor("takeover");

    // Legacy fallback until an administrator opens the Ads page once and the
    // public campaign config is synchronized.
    if(!Array.isArray(config.ad_public_campaigns) || !config.ad_public_campaigns.length){
      const { data, error } = await sb.rpc("biteboss_active_banner");
      if(error) console.warn("BiteBoss banner:", error);
      else if(data?.id && data?.image_url){ homeCampaign=data; takeoverCampaign=data; }
    }

    activeBanner = homeCampaign;
    if(takeoverUi){
      if(takeoverCampaign) renderTakeoverAd(takeoverCampaign);
      else hideTakeoverAd();
    }
    if(!homeCampaign){
      banner.classList.add("hidden");
      banner.removeAttribute("href");
      banner.onclick=null;
      image.removeAttribute("src");
      image.onerror=null;
      return;
    }

    image.src = homeCampaign.image_url;
    image.alt = homeCampaign.advertiser_name ? `${homeCampaign.advertiser_name} sponsored banner` : "Sponsored banner";
    banner.href = /^https?:\/\//i.test(String(homeCampaign.click_url || "")) ? homeCampaign.click_url : "#";
    banner.classList.remove("hidden");
    banner.onclick = event => {
      if(!homeCampaign?.click_url){ event.preventDefault(); return; }
      trackAdEvent(homeCampaign.id, "click");
    };
    image.onerror = () => { banner.classList.add("hidden"); image.removeAttribute("src"); };
    trackAdEvent(homeCampaign.id, "impression");
  }

  function hideTakeoverAd(){
    const slot=$("#takeoverAdSlot");
    const link=$("#takeoverAdLink");
    const image=$("#takeoverAdImage");
    if(slot) slot.classList.add("hidden");
    if(link){ link.removeAttribute("href"); link.onclick=null; }
    if(image){ image.removeAttribute("src"); image.onerror=null; }
  }

  function renderTakeoverAd(campaign=activeCampaignFor("takeover")){
    const slot=$("#takeoverAdSlot");
    const link=$("#takeoverAdLink");
    const image=$("#takeoverAdImage");
    const advertiser=$("#takeoverAdAdvertiser");
    if(!slot || !link || !image || !campaign?.id || !campaign?.image_url){
      hideTakeoverAd();
      return;
    }

    const storeId=String(takeoverUi?.storeId || "");
    image.src=String(campaign.image_url);
    image.alt=campaign.advertiser_name ? `${campaign.advertiser_name} 광고` : "Sponsored";
    if(advertiser) advertiser.textContent=String(campaign.advertiser_name || "광고");
    const clickUrl=/^https?:\/\//i.test(String(campaign.click_url || "")) ? String(campaign.click_url) : "";
    if(clickUrl) link.href=clickUrl; else link.removeAttribute("href");
    link.onclick=event=>{
      if(!clickUrl){ event.preventDefault(); return; }
      trackAdEvent(campaign.id,"click",`${adSessionKey}:takeover:${storeId}`);
    };
    image.onerror=hideTakeoverAd;
    slot.classList.remove("hidden");
    trackAdEvent(campaign.id,"impression",`${adSessionKey}:takeover:${storeId}`);
  }

  async function trackAdEvent(campaignId, eventType, sessionKey=adSessionKey){
    if(!campaignId || !window.sb) return;
    try{
      const { error } = await sb.rpc("biteboss_track_ad_event", {
        p_campaign_id:campaignId,
        p_event_type:eventType,
        p_session_key:sessionKey
      });
      if(error) console.warn("BiteBoss ad tracking:", error);
    }catch(error){
      console.warn("BiteBoss ad tracking:", error);
    }
  }

  function shouldRefreshNearbyStores(pos){
    if(!pos?.coords) return false;

    const lat = Number(pos.coords.latitude);
    const lng = Number(pos.coords.longitude);
    if(!Number.isFinite(lat) || !Number.isFinite(lng)) return false;

    const accuracy = Number(pos.coords.accuracy || 0);
    const maxAccuracy = Math.max(
      50,
      Number(config.gps_nearby_watch_max_accuracy_m || 250)
    );
    if(accuracy && accuracy > maxAccuracy) return false;

    if(!nearbyLastRefreshPosition?.coords) return true;

    const moved = haversineMeters(
      lat,
      lng,
      Number(nearbyLastRefreshPosition.coords.latitude),
      Number(nearbyLastRefreshPosition.coords.longitude)
    );

    const minDistance = Math.max(
      20,
      Number(config.gps_nearby_refresh_distance_m || 80)
    );
    const minSeconds = Math.max(
      5,
      Number(config.gps_nearby_refresh_min_seconds || 12)
    );
    const elapsed = Date.now() - Number(nearbyLastRefreshAt || 0);

    return moved >= minDistance && elapsed >= minSeconds * 1000;
  }

  async function refreshStoresForPosition(pos, { force=false } = {}){
    if(!pos?.coords || nearbyRefreshBusy) return false;
    if(!force && !shouldRefreshNearbyStores(pos)) return false;

    nearbyRefreshBusy = true;
    try{
      lastPosition = pos;
      await loadStores();
      nearbyLastRefreshPosition = pos;
      nearbyLastRefreshAt = Date.now();

      const input = $("#storeSearch");
      if(String(input?.value || "").trim()){
        await searchStores();
      }
      return true;
    }catch(error){
      console.warn("BiteBoss live nearby refresh:", error);
      return false;
    }finally{
      nearbyRefreshBusy = false;
    }
  }

  function startNearbyLocationWatch(){
    if(nearbyWatchId !== null) return;
    if(!navigator.geolocation?.watchPosition) return;

    try{
      nearbyWatchId = navigator.geolocation.watchPosition(
        position => {
          const hadLocation = Boolean(lastPosition?.coords);
          lastPosition = position;
          updateStoreDetailUserLocation(position);
          if(!hadLocation && $("#page-stores")?.classList.contains("active")){
            gamePulseLoadedAt = 0;
            void loadGamePulse(true);
          }
          void refreshStoresForPosition(position);
        },
        error => {
          if(error?.code !== 1){
            console.warn("BiteBoss location watch:", error);
          }
        },
        {
          enableHighAccuracy:true,
          maximumAge:5000,
          timeout:15000
        }
      );
    }catch(error){
      console.warn("BiteBoss location watch start:", error);
    }
  }

  function stopNearbyLocationWatch(){
    if(nearbyWatchId === null) return;
    try{
      navigator.geolocation?.clearWatch?.(nearbyWatchId);
    }catch{}
    nearbyWatchId = null;
  }


  async function loadStoreRoles(list){
    const ids = [...new Set(
      (Array.isArray(list) ? list : [])
        .map(store => String(store?.id || "").trim())
        .filter(Boolean)
    )];

    if(!ids.length || !playerSession?.authenticated){
      storeRoleMap.clear();
      return;
    }

    const { data, error } = await sb.rpc("biteboss_my_store_roles", {
      p_store_ids:ids
    });

    if(error){
      console.warn("BiteBoss store roles:", error);
      return;
    }

    ids.forEach(id => storeRoleMap.delete(id));

    (Array.isArray(data) ? data : []).forEach(row => {
      if(!row?.store_id) return;
      const storeId=String(row.store_id);
      storeRoleMap.set(storeId, row);
      if(row.is_my_boss_store || row.my_role === "boss") locallyOwnedStoreIds.set(storeId,Date.now());
    });
    reconcileTakeoverOwnership();
  }


  function renderBaseStoreList(options = {}){
    const keyword = String($("#storeSearch")?.value || "").trim();
    if(keyword) return false;
    renderStores(stores, options);
    return true;
  }

  async function loadStores(){
    let result;

    if(lastPosition){
      result = await sb.rpc("biteboss_nearby_stores_v631", {
        p_lat:lastPosition.coords.latitude,
        p_lng:lastPosition.coords.longitude,
        p_radius_m:Number(config.nearby_radius_m || 3000),
        p_limit:Number(config.nearby_limit || 20)
      });
    }else{
      result = await sb.rpc("biteboss_list_stores_v631", { p_limit:100 });
    }

    if(result.error){
      console.warn(result.error);
      toast("매장 정보를 불러오지 못했습니다.");
      setRetryState("#storeList", "매장 정보를 불러오지 못했습니다.", async () => {
        await loadStores();
      });
      return;
    }

    stores = Array.isArray(result.data) ? result.data : [];
    stores.sort(compareNearbyStores);

    // Fast first paint: show the nearby RPC result immediately.
    renderBaseStoreList({ resetPage:true });
    renderHomeNearbyBosses();

    const autoImportEnabled = config.auto_store_import_enabled !== false &&
      String(config.auto_store_import_enabled).toLowerCase() !== "false";

    const roleTask = loadStoreRoles(stores)
      .then(() => {
        stores.sort(compareNearbyStores);
        renderBaseStoreList({ patch:true });
        void loadGamePulse(false);
      })
      .catch(error => console.warn("BiteBoss store roles:", error));

    const importTask = (lastPosition && autoImportEnabled)
      ? syncNearbyAutoStores(lastPosition).catch(error => {
          console.warn("BiteBoss auto store import:", error);
          return null;
        })
      : Promise.resolve(null);

    const sync = await importTask;
    if(sync?.ok && lastPosition){
      const refreshed = await sb.rpc("biteboss_nearby_stores_v631", {
        p_lat:lastPosition.coords.latitude,
        p_lng:lastPosition.coords.longitude,
        p_radius_m:Number(config.nearby_radius_m || 3000),
        p_limit:Number(config.nearby_limit || 20)
      });

      if(!refreshed.error){
        const nextStores = Array.isArray(refreshed.data) ? refreshed.data : stores;
        const beforeIds = stores.map(store => String(store.id)).join("|");
        const afterIds = nextStores.map(store => String(store.id)).join("|");
        stores = nextStores;
        await loadStoreRoles(stores);
        stores.sort(compareNearbyStores);

        if(beforeIds === afterIds){
          renderBaseStoreList({ patch:true });
        }else{
          renderBaseStoreList({ resetPage:true });
        }
        renderHomeNearbyBosses();
      }else{
        console.warn("BiteBoss nearby refresh:", refreshed.error);
      }
    }

    await roleTask;
  }

  function autoImportAttemptKey(pos, radius){
    const lat = Number(pos?.coords?.latitude);
    const lng = Number(pos?.coords?.longitude);
    if(!Number.isFinite(lat) || !Number.isFinite(lng)) return "";
    return `${lat.toFixed(3)}:${lng.toFixed(3)}:${radius}`;
  }

  function shouldAttemptAutoImport(pos, radius){
    const key = autoImportAttemptKey(pos, radius);
    if(!key) return false;
    const now = Date.now();
    const last = Number(autoImportAttempts.get(key) || 0);
    if(now - last < RUNTIME.autoImportRetryMs) return false;
    autoImportAttempts.set(key, now);

    // Bound the small in-memory cache for long driving sessions.
    if(autoImportAttempts.size > RUNTIME.autoImportCacheLimit){
      const oldest = [...autoImportAttempts.entries()].sort((a,b) => a[1] - b[1]).slice(0, autoImportAttempts.size - RUNTIME.autoImportCacheLimit);
      oldest.forEach(([oldKey]) => autoImportAttempts.delete(oldKey));
    }
    return true;
  }

  async function syncNearbyAutoStores(pos){
    if(!pos?.coords) return null;

    try{
      const { data:sessionData } = await sb.auth.getSession();
      const accessToken = sessionData?.session?.access_token;
      if(!accessToken) return null;

      const lat = Number(pos.coords.latitude);
      const lng = Number(pos.coords.longitude);
      const radius = Math.max(
        300,
        Math.min(2000, Number(config.auto_store_import_radius_m || 1000))
      );

      if(!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      if(!shouldAttemptAutoImport(pos, radius)) return null;

      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), RUNTIME.apiTimeoutMs);

      try{
        const configuredApiBase = String(cfg.apiBaseUrl || cfg.publicAppUrl || "").trim();
        let apiBase = null;

        try{
          if(configuredApiBase){
            const candidate = new URL(configuredApiBase);
            if(candidate.protocol === "https:" || candidate.protocol === "http:") apiBase = candidate;
          }else if(location.protocol === "https:" || location.protocol === "http:"){
            apiBase = new URL(location.origin);
          }
        }catch{}

        // Native packaged origins cannot host /api routes.
        // Without a configured HTTPS API, only auto-import is skipped.
        if(!apiBase) return null;

        const url = new URL("/api/nearby-stores", apiBase);
        url.searchParams.set("lat", String(lat));
        url.searchParams.set("lng", String(lng));
        url.searchParams.set("radius", String(radius));

        const response = await fetch(url, {
          method:"GET",
          headers:{
            "Accept":"application/json",
            "Authorization":`Bearer ${accessToken}`
          },
          cache:"no-store",
          signal:controller.signal
        });

        if(!response.ok){
          const message = await response.text().catch(() => "");
          console.warn("BiteBoss auto store import:", response.status, message);
          return null;
        }

        const payload = await response.json();
        if(payload?.error){
          console.warn("BiteBoss auto store import:", payload.error, payload.detail || "");
          return null;
        }
        return payload && typeof payload === "object" ? payload : null;
      }finally{
        clearTimeout(timer);
      }
    }catch(error){
      if(error?.name !== "AbortError"){
        console.warn("BiteBoss auto store import:", error);
      }
      return null;
    }
  }

  function clampPage(page, totalItems, pageSize){
    const pages = Math.max(1, Math.ceil(Math.max(0, Number(totalItems || 0)) / Math.max(1, Number(pageSize || 1))));
    return Math.min(pages, Math.max(1, Number(page || 1)));
  }

  function pageSlice(items, page, pageSize){
    const rows = Array.isArray(items) ? items : [];
    const safePage = clampPage(page, rows.length, pageSize);
    const start = (safePage - 1) * pageSize;
    return { page:safePage, pages:Math.max(1, Math.ceil(rows.length / pageSize)), rows:rows.slice(start, start + pageSize), start };
  }

  function renderPagination(selector, page, totalItems, pageSize, onChange){
    const nav = typeof selector === "string" ? $(selector) : selector;
    if(!nav) return;
    const total = Math.max(0, Number(totalItems || 0));
    const pages = Math.max(1, Math.ceil(total / Math.max(1, pageSize)));
    const safePage = clampPage(page, total, pageSize);
    const shouldShow = pages > 1;
    nav.classList.toggle("hidden", !shouldShow);
    if(!shouldShow){ nav.innerHTML = ""; return; }
    nav.innerHTML = `
      <button type="button" class="pagination-btn" data-page-prev ${safePage <= 1 ? "disabled" : ""} aria-label="이전 페이지">이전</button>
      <span class="pagination-status" aria-live="polite"><b>${safePage}</b><span>/ ${pages}</span></span>
      <button type="button" class="pagination-btn" data-page-next ${safePage >= pages ? "disabled" : ""} aria-label="다음 페이지">다음</button>
    `;
    nav.querySelector("[data-page-prev]")?.addEventListener("click", () => onChange(Math.max(1, safePage - 1)));
    nav.querySelector("[data-page-next]")?.addEventListener("click", () => onChange(Math.min(pages, safePage + 1)));
  }

  function setRetryState(target, message, retry){
    const el = typeof target === "string" ? $(target) : target;
    if(!el) return;
    el.innerHTML = `
      <div class="app-state is-error app-state-retry">
        <span>${escapeHtml(message || "불러오지 못했습니다.")}</span>
        ${typeof retry === "function" ? '<button class="app-state-retry-btn" type="button">다시 시도</button>' : ''}
      </div>
    `;
    const button = el.querySelector(".app-state-retry-btn");
    if(button && typeof retry === "function"){
      button.addEventListener("click", async () => {
        if(button.disabled) return;
        button.disabled = true;
        button.textContent = "불러오는 중…";
        try{
          await retry();
        }catch(error){
          console.warn("BiteBoss retry:", error);
          button.disabled = false;
          button.textContent = "다시 시도";
        }
      }, { once:true });
    }
  }

  function captureCooldownActive(){
    const until = captureCooldown?.cooldown_until || null;
    return Boolean(captureCooldown?.active && until && new Date(until).getTime() > Date.now());
  }

  async function loadCaptureCooldownStatus(force=false){
    if(!playerSession?.authenticated){
      captureCooldown = null;
      return null;
    }
    if(!force && captureCooldown?.loaded_at && Date.now()-captureCooldown.loaded_at < 15000){
      return captureCooldown;
    }
    try{
      const {data,error}=await sb.rpc("biteboss_capture_cooldown_status_v7514");
      if(error){
        if(!String(error.message||"").includes("biteboss_capture_cooldown_status_v7514")) console.warn("BiteBoss capture cooldown:",error);
        return captureCooldown;
      }
      captureCooldown={...(data||{}),loaded_at:Date.now()};
      return captureCooldown;
    }catch(error){
      console.warn("BiteBoss capture cooldown:",error);
      return captureCooldown;
    }
  }

  function captureCooldownMessage(){
    if(!captureCooldownActive()) return "";
    return `다음 매장 점령까지 ${formatRemaining(captureCooldown.cooldown_until)} 남음`;
  }

  function updateChallengeCommand(list = stores){
    const rows = Array.isArray(list) ? list : [];
    const card = $("#challengeNextCard");
    const target = $("#challengeNextTarget");
    const meta = $("#challengeNextMeta");

    if(captureCooldownActive()){
      if(card){
        card.dataset.storeId = "";
        card.disabled = true;
      }
      if(target) target.textContent = "다음 점령 대기 중";
      if(meta){
        meta.textContent = `${formatRemaining(captureCooldown.cooldown_until)} 후 다음 매장 점령 가능`;
        meta.classList.remove("hidden");
      }
      return;
    }

    const challengeableRows = rows.filter(store => !isMyBossStore(store));
    const next = challengeableRows[0] || null;
    if(card){
      card.dataset.storeId = next?.id ? String(next.id) : "";
      card.disabled = !next?.id;
    }
    if(target) target.textContent = next?.name ? String(next.name) : "주변 매장 탐색 중";
    if(meta){
      const address = next ? String(next.address || [next.city,next.district].filter(Boolean).join(" ") || "").trim() : "";
      meta.textContent = address;
      meta.classList.toggle("hidden", !address);
    }
  }

  function storeRenderSignature(store){
    if(!store) return "";
    const role = storeRoleMap.get(String(store.id)) || {};
    return JSON.stringify([
      store.id,
      store.name,
      store.photo_url,
      store.current_boss_user_id,
      store.boss_user_id,
      store.current_boss_nickname,
      store.boss_nickname,
      store.current_boss_avatar_url,
      store.boss_avatar_url,
      store.boss_organization_id,
      store.current_boss_organization_id,
      store.boss_organization_avatar_url,
      store.current_boss_organization_avatar_url,
      store.distance_m,
      store.distance,
      store.challenges_24h,
      store.is_hot,
      role.my_role,
      role.is_my_boss_store,
      role.can_retake
    ]);
  }

  function bindStoreCard(card){
    if(!card || card.dataset.bound === "1") return;
    card.dataset.bound = "1";
    const open = () => openStoreDetail(card.dataset.storeDetail);
    card.addEventListener("click", open);
    card.addEventListener("keydown", event => {
      if(event.key === "Enter" || event.key === " "){
        event.preventDefault();
        open();
      }
    });
    card.querySelectorAll("[data-scan-store]").forEach(btn => {
      btn.onclick = event => {
        event.stopPropagation();
        scanPrompt();
      };
    });
  }

  function patchVisibleStoreCards(rows){
    const box = $("#storeList");
    if(!box) return false;
    const cards = [...box.querySelectorAll("[data-store-detail]")];
    if(cards.length !== rows.length) return false;

    let changed = false;
    rows.forEach((store,index) => {
      const card = cards[index];
      if(String(card?.dataset?.storeDetail || "") !== String(store?.id || "")){
        changed = true;
        return;
      }
      const signature = storeRenderSignature(store);
      if(card.dataset.renderSignature === signature) return;

      const template = document.createElement("template");
      template.innerHTML = storeCard(store).trim();
      const next = template.content.firstElementChild;
      if(!next) return;
      next.dataset.renderSignature = signature;
      card.replaceWith(next);
      bindStoreCard(next);
      changed = true;
    });
    return changed;
  }

  function renderStores(list = stores, options = {}){
    const box = $("#storeList");
    if(!box) return;

    storeViewRows = Array.isArray(list) ? list : [];
    if(options.resetPage) storePage = 1;
    const view = pageSlice(storeViewRows, storePage, STORE_PAGE_SIZE);
    storePage = view.page;

    const canPatch = options.patch === true && box.children.length > 0;
    if(!canPatch || !patchVisibleStoreCards(view.rows)){
      box.innerHTML = view.rows.map(store => {
        const html = storeCard(store);
        return html.replace(
          /(<[^>]+data-store-detail="[^"]+")/,
          `$1 data-render-signature="${escapeAttr(storeRenderSignature(store))}"`
        );
      }).join("") || `<div class="app-state">검색 결과가 없습니다.</div>`;
      $$("#storeList [data-store-detail]").forEach(bindStoreCard);
    }

    updateChallengeCommand(storeViewRows);
    renderPagination("#storePagination", storePage, storeViewRows.length, STORE_PAGE_SIZE, nextPage => {
      storePage = nextPage;
      renderStores(storeViewRows);
      $("#page-stores")?.scrollTo?.({ top:0, behavior:"smooth" });
      window.scrollTo({ top:0, behavior:"smooth" });
    });

    const loginNotice = $("#storesLoginNotice");
    loginNotice?.classList.toggle("hidden", presenceBlockedReason !== "MEMBER_LOGIN_REQUIRED");
    startStoreListReclaimCountdowns();
  }


  async function searchStores(){
    const input = $("#storeSearch");
    const keyword = String(input?.value || "").trim();
    const seq = ++storeSearchSeq;

    if(!keyword){
      renderStores(stores, { resetPage:true });
      return;
    }

    const box = $("#storeList");
    if(box) box.innerHTML = `<div class="app-state">검색 중…</div>`;

    const { data, error } = await sb.rpc("biteboss_search_stores_v631", {
      p_query:keyword,
      p_lat:lastPosition?.coords?.latitude ?? null,
      p_lng:lastPosition?.coords?.longitude ?? null,
      p_limit:50
    });

    if(seq !== storeSearchSeq) return;

    if(error){
      console.error("BiteBoss store search:", error);
      setRetryState(box, "매장 검색에 실패했습니다.", searchStores);
      return;
    }

    const searchRows = Array.isArray(data) ? data : [];
    await loadStoreRoles(searchRows);
    searchRows.sort((a,b) => compareStoreSearchResults(a,b,keyword));
    renderStores(searchRows, { resetPage:true });
  }

  function normalizeStoreSearchText(value = ""){
    return String(value || "")
      .normalize("NFKC")
      .toLocaleLowerCase("ko-KR")
      .replace(/\s+/g," ")
      .trim();
  }

  function storeSearchRelevance(row = {}, keyword = ""){
    const query = normalizeStoreSearchText(keyword);
    if(!query) return 4;

    const name = normalizeStoreSearchText(row.name || row.store_name || "");
    if(name === query) return 0;
    if(name.startsWith(query)) return 1;

    const tokens = name.split(/[\s·._()\-\/]+/).filter(Boolean);
    if(tokens.some(token => token.startsWith(query))) return 2;
    if(name.includes(query)) return 3;
    return 4;
  }

  function compareStoreSearchResults(a,b,keyword){
    const relevanceDelta = storeSearchRelevance(a,keyword) - storeSearchRelevance(b,keyword);
    if(relevanceDelta) return relevanceDelta;

    const aDistance = Number(a.distance_m ?? a.distance ?? Number.POSITIVE_INFINITY);
    const bDistance = Number(b.distance_m ?? b.distance ?? Number.POSITIVE_INFINITY);
    if(Number.isFinite(aDistance) || Number.isFinite(bDistance)){
      if(aDistance !== bDistance) return aDistance - bDistance;
    }

    return compareNearbyStores(a,b);
  }

  function compareNearbyStores(a,b){
    const ar=storeRoleMap.get(String(a.id))||{}, br=storeRoleMap.get(String(b.id))||{};
    const aOwned=isMyBossStore(a), bOwned=isMyBossStore(b);
    // Owned stores are reference/history items, not active targets. Keep them at the bottom.
    if(aOwned!==bOwned) return aOwned ? 1 : -1;
    const now=Date.now();
    const aProtected=Boolean((ar.protected_until||a.protected_until)&&new Date(ar.protected_until||a.protected_until).getTime()>now);
    const bProtected=Boolean((br.protected_until||b.protected_until)&&new Date(br.protected_until||b.protected_until).getTime()>now);
    if(aProtected!==bProtected) return aProtected?1:-1;
    const aPartner=String(a.partnership_status||"unclaimed")==="partnered", bPartner=String(b.partnership_status||"unclaimed")==="partnered";
    if(aPartner!==bPartner) return aPartner?-1:1;
    const aMyPower=Math.max(0,Number(ar.my_power ?? 0));
    const bMyPower=Math.max(0,Number(br.my_power ?? 0));
    const aDefense=Math.max(0,Number(a.boss_defense||ar.boss_defense||0)), bDefense=Math.max(0,Number(b.boss_defense||br.boss_defense||0));
    const aAdv=aMyPower>aDefense, bAdv=bMyPower>bDefense; if(aAdv!==bAdv) return aAdv?-1:1;
    const ad=Number.isFinite(Number(a.distance_m))?Number(a.distance_m):Number.MAX_SAFE_INTEGER;
    const bd=Number.isFinite(Number(b.distance_m))?Number(b.distance_m):Number.MAX_SAFE_INTEGER;
    return ad-bd;
  }

  function storeAvatarMarkup(photoUrl, storeName, className = "store-avatar"){
    const url = String(photoUrl || "").trim();
    const name = String(storeName || "매장").trim();

    if(url){
      return `<img class="${escapeAttr(className)}" src="${escapeAttr(url)}" alt="${escapeAttr(name)} 매장 사진" loading="lazy" decoding="async" />`;
    }

    const initial = Array.from(name)[0] || "B";
    return `<span class="${escapeAttr(className)} store-avatar-fallback" aria-hidden="true"><span class="store-avatar-initial">${escapeHtml(initial)}</span></span>`;
  }

  const occupiedAvatarPreloads = new Set();
  function preloadOccupiedAvatar(url){
    const src = String(url || "").trim();
    if(!src || occupiedAvatarPreloads.has(src)) return;
    occupiedAvatarPreloads.add(src);
    const image = new Image();
    image.decoding = "async";
    image.fetchPriority = "high";
    image.src = src;
  }

  function occupiedStoreAvatarMarkup(store, className = "store-card-photo", { priority = false } = {}){
    const photoUrl = String(store?.photo_url || "").trim();
    const storeName = String(store?.name || "매장").trim();
    const occupierCustomUrl = String(
      store?.current_boss_avatar_url
      || store?.boss_avatar_url
      || store?.boss_organization_avatar_url
      || store?.current_boss_organization_avatar_url
      || ""
    ).trim();
    const occupied = Boolean(
      occupierCustomUrl
      || store?.current_boss_user_id
      || store?.boss_user_id
      || store?.current_boss_nickname
      || store?.boss_nickname
      || store?.boss_organization_id
      || store?.current_boss_organization_id
    );
    const occupierUrl = occupierCustomUrl;

    if(!occupied || !occupierUrl){
      return storeAvatarMarkup(photoUrl, storeName, className);
    }

    const imageLoading = priority ? `loading="eager" fetchpriority="high"` : `loading="lazy"`;
    if(priority) preloadOccupiedAvatar(occupierUrl);
    const storeSide = photoUrl
      ? `<img src="${escapeAttr(photoUrl)}" alt="" ${imageLoading} decoding="async" />`
      : `<span class="occupied-store-initial" aria-hidden="true">${escapeHtml(Array.from(storeName)[0] || "B")}</span>`;

    return `<span class="${escapeAttr(className)} occupied-store-avatar" role="img" aria-label="${escapeAttr(storeName)} 점령 매장">
      <span class="occupied-store-half occupied-store-half-store">${storeSide}</span>
      <span class="occupied-store-half occupied-store-half-boss"><img src="${escapeAttr(occupierUrl)}" alt="" ${imageLoading} decoding="async" /></span>
    </span>`;
  }

  function bossAvatarMarkup(avatarUrl, nickname, className = "boss-avatar"){
    const customUrl = String(avatarUrl || "").trim();
    const defaultUrl = defaultProfileImageUrl();
    const url = customUrl || defaultUrl;
    const name = String(nickname || "보스").trim();
    if(url){
      const criticalAvatar = !customUrl || /(?:arena-boss-avatar|boss-focus-avatar|my-rank-avatar)/.test(String(className));
      if(criticalAvatar) preloadOccupiedAvatar(url);
      const loading = criticalAvatar
        ? `loading="eager" fetchpriority="high"`
        : `loading="lazy"`;
      return `<img class="${escapeAttr(className)}" src="${escapeAttr(url)}" alt="${escapeAttr(name)} 프로필" ${loading} decoding="${customUrl ? "async" : "sync"}" />`;
    }
    return `<span class="${escapeAttr(className)} boss-avatar-fallback" aria-hidden="true"></span>`;
  }


  function storeCard(store){
    const roleState = storeRoleMap.get(String(store.id)) || {};
    const ownedByMe = isMyBossStore(store);
    const protectionUntil = roleState.protected_until || store.protected_until || null;
    const protectedNow = Boolean(protectionUntil && new Date(protectionUntil).getTime() > Date.now());

    const boss = String(store.current_boss_nickname || "").trim();
    const bossExists = Boolean(boss && boss !== "No Boss" && boss !== "미점령");

    const distance = Number.isFinite(Number(store.distance_m)) ? formatDistance(store.distance_m) : "";
    const place = [store.city, store.district].filter(Boolean).join(" ");
    const protectionSummary = protectedNow ? `보호 ${formatRemaining(protectionUntil)} 남음` : "";
    const details = [categoryLabel(store.category), place, distance, protectionSummary].filter(Boolean).join(" · ");
    const isPartner = String(store.partnership_status || "unclaimed") === "partnered";
    const presence = presenceState.get(String(store.id));
    const requiredSeconds = Math.max(30, Number(presence?.required_seconds || config.gps_dwell_seconds || 120));
    const remainingSeconds = Math.max(0, Number(presence?.remaining_seconds ?? requiredSeconds));
    const loginRequired = presenceBlockedReason === "MEMBER_LOGIN_REQUIRED";

    const cachedReclaim = ownedByMe ? getCachedStoreReclaimState(store.id)?.data : null;
    const reclaimAt = cachedReclaim?.is_boss ? String(cachedReclaim.available_at || "").trim() : "";

    let status = "";
    if(ownedByMe){
      if(["tracking","grace"].includes(String(presence?.status || "")) && String(presence?.mode || "") === "reclaim"){
        status = `자동 재점령 확인 중 · ${formatPresenceSeconds(remainingSeconds)} 남음`;
      }else if(presence?.status === "outside"){
        status = `${Math.round(Number(presence.distance_m || 0))}m · ${Math.max(1, Number(config.gps_radius_m || 50))}m 안에서 재점령 확인`;
      }else if(presence?.status === "low_accuracy"){
        status = "재점령 GPS 정확도 확인 중";
      }else if(reclaimAt){
        status = `재점령 ${formatOwnStoreReclaim(reclaimAt)}`;
      }else{
        // Protected state is folded into the metadata line so store cards stay compact.
        status = "";
      }
    }else if(bossExists && protectedNow){
      // Keep protected store cards at the same two-line height as ordinary stores.
      status = "";
    }else if(presence?.status === "tracking"){
      status = "자동 점령 진행 중";
    }else if(presence?.status === "outside"){
      status = `${Math.round(Number(presence.distance_m || 0))}m 더 가까이 가면 자동 시작`;
    }else if(presence?.status === "low_accuracy"){
      status = "GPS 정확도 확인 중";
    }else if(isPartner){
      status = "QR로 바로 도전";
    }

    let action = "";
    if(!ownedByMe && isPartner){
      action = `<button class="store-list-action is-primary" data-scan-store="${escapeAttr(store.id)}" type="button">QR 도전</button>`;
    }else if(!ownedByMe && presence?.status === "tracking"){
      action = `<span class="store-list-action is-live" aria-live="polite">${formatPresenceSeconds(remainingSeconds)} 남음</span>`;
    }

    const badges = [
      isPartner ? {label:"제휴", cls:"partner"} : null,
      Boolean(store.has_benefit || Number(store.active_offer_count || 0) > 0) ? {label:"혜택", cls:"benefit"} : null
    ].filter(Boolean);


    const cardMode = takeoverModeFromStore(store);
    return `
      <article class="store-card store-card-open challenge-card mode-${escapeAttr(cardMode)} ${isPartner ? "is-partner-store" : ""}" data-store-detail="${escapeAttr(store.id)}" role="button" tabindex="0" aria-label="${escapeAttr(store.name)} 매장 정보 보기">
        <div class="store-card-main">
          ${occupiedStoreAvatarMarkup(store, "store-card-photo")}
          <div class="store-card-copy">
            <div class="store-card-title-row">
              <strong class="store-card-name">${escapeHtml(store.name)}</strong>
              ${badges.length ? `<div class="store-status-tags">${badges.map(tag => `<span class="store-status-tag ${tag.cls}">${tag.label}</span>`).join("")}</div>` : ""}
            </div>
            ${details ? `<div class="store-card-meta">${escapeHtml(details)}</div>` : ""}
            ${status ? `<div class="store-card-status ${protectedNow ? "is-protected" : ""}" ${ownedByMe && reclaimAt && !presence?.status ? `data-store-reclaim-at="${escapeAttr(reclaimAt)}"` : ""}>${escapeHtml(status)}</div>` : ""}
          </div>
        </div>
        ${action}
      </article>
    `;
  }

  async function hydrateStoreDetailCoordinates(store = {}, cached = null){
    const hasCoordinates = value => {
      const lat = value?.latitude == null || value.latitude === "" ? NaN : Number(value.latitude);
      const lng = value?.longitude == null || value.longitude === "" ? NaN : Number(value.longitude);
      return Number.isFinite(lat) && Number.isFinite(lng);
    };

    if(hasCoordinates(store)) return store;

    if(hasCoordinates(cached)){
      store.latitude = Number(cached.latitude);
      store.longitude = Number(cached.longitude);
      return store;
    }

    const name = String(store.name || "").trim();
    const id = String(store.id || "").trim();
    if(!name || !id) return store;

    try{
      const { data, error } = await sb.rpc("biteboss_search_stores_v631", {
        p_query:name,
        p_lat:lastPosition?.coords?.latitude ?? null,
        p_lng:lastPosition?.coords?.longitude ?? null,
        p_limit:20
      });
      if(error) throw error;

      const matched = (Array.isArray(data) ? data : []).find(row => String(row?.id || "") === id);
      if(hasCoordinates(matched)){
        store.latitude = Number(matched.latitude);
        store.longitude = Number(matched.longitude);
        if(!Number.isFinite(Number(store.distance_m)) && Number.isFinite(Number(matched.distance_m))){
          store.distance_m = Number(matched.distance_m);
        }
      }
    }catch(error){
      console.warn("BiteBoss store detail coordinates:", error);
    }

    return store;
  }

  async function openStoreDetail(storeId, options = {}){
    const cached = stores.find(store => String(store.id) === String(storeId))
      || (options?.storeFallback && String(options.storeFallback.id) === String(storeId)
        ? options.storeFallback
        : null);
    if(options?.preserveModal !== true){
      openModal(
        "",
        `<div class="app-state">매장 정보를 불러오는 중…</div>`,
        { type:"store-detail" }
      );
    }

    try{
      const [detailResult, statusResult, orgResult, offerResult, partnerRequestResult, growthResult, arenaResult, historyResult] = await Promise.all([
        sb.rpc("biteboss_store_detail", { p_store_id:storeId }),
        sb.rpc("biteboss_my_store_status", { p_store_id:storeId }),
        sb.rpc("biteboss_store_organization_status", { p_store_id:storeId }),
        sb.rpc("biteboss_store_offer_access", { p_store_id:storeId }),
        playerSession?.authenticated && options?.showStoreManagerCard !== false
          ? sb.rpc("biteboss_partner_request_status", { p_store_id:storeId })
          : Promise.resolve({ data:null, error:null }),
        sb.rpc("biteboss_store_public_growth_v63", { p_store_id:storeId, p_days:30 }),
        sb.rpc("biteboss_store_game_board_v631", { p_store_id:storeId }),
        sb.rpc("biteboss_store_history_v71", { p_store_id:storeId, p_limit:12 })
      ]);

      if(detailResult.error) throw detailResult.error;
      if(!detailResult.data?.store) throw new Error("STORE_NOT_FOUND");

      if(statusResult.error){
        console.warn("BiteBoss store battle status:", statusResult.error);
      }
      if(orgResult.error){
        console.warn("BiteBoss store organization status:", orgResult.error);
      }
      if(offerResult.error){
        console.warn("BiteBoss store offer access:", offerResult.error);
      }

      const data = detailResult.data;
      data.game = statusResult.error ? null : (statusResult.data || null);
      data.organization = orgResult.error ? null : (orgResult.data || null);
      data.offerAccess = offerResult.error ? null : (offerResult.data || null);
      data.partnerRequest = partnerRequestResult?.error ? null : (partnerRequestResult?.data || null);
      data.publicGrowth = growthResult?.error ? null : (growthResult?.data || null);
      data.arena = arenaResult?.error ? null : (arenaResult?.data || null);
      data.history = historyResult?.error || !Array.isArray(historyResult?.data) ? [] : historyResult.data;
      const cachedReclaim = getCachedStoreReclaimState(storeId);
      data.reclaim = cachedReclaim?.data || deriveOptimisticStoreReclaimState(data.history, String(data.game?.my_role || "visitor") === "boss");
      if(historyResult?.error && !String(historyResult.error.message||"").includes("biteboss_store_history_v71")) console.warn("BiteBoss conquest history:", historyResult.error);
      if(partnerRequestResult?.error) console.warn("BiteBoss partner request status:", partnerRequestResult.error);
      if(growthResult?.error) console.warn("BiteBoss public growth:", growthResult.error);
      if(arenaResult?.error) console.warn("BiteBoss arena:", arenaResult.error);

      if(cached && !Number.isFinite(Number(data.store.distance_m)) && Number.isFinite(Number(cached.distance_m))){
        data.store.distance_m = Number(cached.distance_m);
      }

      // Store detail RPCs on older deployments may omit coordinates. This must not make
      // "내 점령지" different from any other store detail: resolve the same canonical
      // store coordinates by id before rendering the shared detail map.
      await hydrateStoreDetailCoordinates(data.store, cached);

      activeStoreDetailId = String(storeId);
      renderStoreDetail(data, options);

      if(playerSession?.authenticated && String(data.game?.my_role || "visitor") === "boss" && !cachedReclaim?.fresh){
        void refreshOwnStoreReclaimState(storeId);
      }
    }catch(error){
      console.warn("BiteBoss store detail:", error);
      const body = $("#modalBody");
      setRetryState(body, "매장 정보를 불러오지 못했습니다.", async () => {
        await openStoreDetail(storeId, options);
      });
    }
  }

  function getCachedStoreReclaimState(storeId){
    const key = String(storeId || "").trim();
    if(!key) return null;
    const entry = storeReclaimCache.get(key);
    if(!entry?.data) return null;
    const age = Date.now() - Number(entry.fetchedAt || 0);
    return { data:entry.data, fresh:Number.isFinite(age) && age >= 0 && age < STORE_RECLAIM_CACHE_TTL_MS };
  }

  function deriveOptimisticStoreReclaimState(history = [], isBoss = false){
    if(!isBoss || !Array.isArray(history)) return null;
    const current = history.find(row => row && !row.ended_at && row.started_at);
    if(!current?.started_at) return null;

    const startedAtMs = new Date(current.started_at).getTime();
    if(!Number.isFinite(startedAtMs)) return null;

    const cooldownMinutes = Math.max(1, Number(config.reclaim_cooldown_minutes || 1440));
    const availableAtMs = startedAtMs + cooldownMinutes * 60 * 1000;
    const remainingSeconds = Math.max(0, Math.ceil((availableAtMs - Date.now()) / 1000));

    return {
      is_boss:true,
      available_at:new Date(availableAtMs).toISOString(),
      remaining_seconds:remainingSeconds,
      eligible:remainingSeconds <= 0,
      optimistic:true
    };
  }

  async function refreshOwnStoreReclaimState(storeId){
    const key = String(storeId || "").trim();
    if(!key || !playerSession?.authenticated) return null;

    let request = storeReclaimInflight.get(key);
    if(!request){
      request = sb.rpc("biteboss_own_store_reclaim_state_v7546", { p_store_id:storeId })
        .then(result => {
          if(result?.error) throw result.error;
          const data = result?.data || null;
          storeReclaimCache.set(key, { data, fetchedAt:Date.now() });
          return data;
        })
        .catch(error => {
          if(!String(error?.message || "").includes("biteboss_own_store_reclaim_state_v7546")){
            console.warn("BiteBoss reclaim state:", error);
          }
          return null;
        })
        .finally(() => storeReclaimInflight.delete(key));
      storeReclaimInflight.set(key, request);
    }

    const data = await request;
    if(data && activeStoreDetailId === key && !$("#modal")?.classList.contains("hidden")){
      applyOwnerReclaimState(data);
    }
    return data;
  }

  function applyOwnerReclaimState(reclaim = {}){
    const card = $(".owner-store-reclaim");
    if(!card) return;
    const label = card.querySelector("span");
    const value = card.querySelector("strong");
    const note = card.querySelector("small");
    const availableAt = reclaim?.is_boss ? String(reclaim.available_at || "").trim() : "";

    card.classList.toggle("is-unavailable", !availableAt);
    if(label) label.textContent = availableAt ? "재점령 가능까지" : "재점령";
    if(value){
      value.id = availableAt ? "ownerReclaimCountdown" : "";
      if(availableAt){
        value.dataset.reclaimAt = availableAt;
        value.textContent = formatOwnStoreReclaim(availableAt);
      }else{
        delete value.dataset.reclaimAt;
        value.textContent = "확인 불가";
      }
    }
    if(note){
      note.textContent = availableAt
        ? (reclaim?.eligible ? "재방문 시 자동 재점령" : "시간 종료 후 재방문 시 자동 재점령")
        : "현재 점령 상태를 확인할 수 없습니다.";
    }
    startOwnerReclaimCountdown();
  }

  function syncOwnerReclaimPresence(storeId, state = {}){
    if(String(activeStoreDetailId || "") !== String(storeId || "")) return;
    const card = $(".owner-store-reclaim");
    if(!card) return;
    const label = card.querySelector("span");
    const value = card.querySelector("strong");
    const note = card.querySelector("small");
    if(!value) return;

    const status = String(state?.status || "");
    const radius = Math.max(1, Number(config.gps_radius_m || 50));
    const remaining = Math.max(0, Number(state?.remaining_seconds ?? config.gps_dwell_seconds ?? 120));

    if((status === "tracking" || status === "grace") && String(state?.mode || "") === "reclaim"){
      if(label) label.textContent = "재점령 확인";
      value.textContent = formatPresenceSeconds(remaining);
      delete value.dataset.reclaimAt;
      if(note) note.textContent = "현재 위치를 유지하면 자동 재점령됩니다.";
      card.classList.remove("is-unavailable");
      return;
    }

    if(status === "outside"){
      if(label) label.textContent = "재점령 확인";
      value.textContent = `${radius}m 이내`;
      delete value.dataset.reclaimAt;
      if(note) note.textContent = "매장 위치 안으로 들어오면 자동 확인이 시작됩니다.";
      return;
    }

    if(status === "low_accuracy"){
      if(label) label.textContent = "재점령 확인";
      value.textContent = "GPS 확인 중";
      delete value.dataset.reclaimAt;
      if(note) note.textContent = "위치 정확도가 안정되면 자동으로 계속 진행됩니다.";
    }
  }

  function applyOptimisticReclaimCompletion(storeId, reclaimedAt){
    const key = String(storeId || "").trim();
    if(!key) return;
    const base = new Date(reclaimedAt || Date.now()).getTime();
    const cooldownMinutes = Math.max(1, Number(config.reclaim_cooldown_minutes || 1440));
    const availableAt = new Date((Number.isFinite(base) ? base : Date.now()) + cooldownMinutes * 60000).toISOString();
    const data = {
      is_boss:true,
      eligible:false,
      available_at:availableAt,
      remaining_seconds:cooldownMinutes * 60
    };
    storeReclaimCache.set(key, { data, fetchedAt:Date.now() });
    if(String(activeStoreDetailId || "") === key) applyOwnerReclaimState(data);
  }

  function renderStoreDetail(data, options = {}){
    const store = data.store || {};
    const game = data.game || {};
    const orgStatus = data.organization || {};
    const offerAccess = data.offerAccess || {};
    const partnerRequest = data.partnerRequest || {};
    const publicGrowth = data.publicGrowth || {};
    const arena = data.arena || {};
    const reclaim = data.reclaim || {};
    const growth = game.growth || {};
    const defenseActivity = game.defense_activity || {};
    const photos = Array.isArray(data.photos) ? data.photos : [];
    const menu = Array.isArray(data.menu) ? data.menu : [];
    const offers = Array.isArray(offerAccess.offers)
      ? offerAccess.offers
      : (Array.isArray(data.offers) ? data.offers.filter(item => item.status === "active") : []);
    const isPartner = String(store.partnership_status || "unclaimed") === "partnered";

    const protectionUntil = game.protected_until || store.protected_until || null;
    const protectedNow = Boolean(game.protected ?? (protectionUntil && new Date(protectionUntil).getTime() > Date.now()));
    const cooldownUntil = game.challenge_cooldown_until || null;
    const cooldownNow = Boolean(cooldownUntil && new Date(cooldownUntil).getTime() > Date.now());

    const bossExists = Boolean(game.boss_user_id || game.boss_nickname || store.current_boss_nickname);
    const bossName = game.boss_nickname || arena.current_boss_nickname || store.current_boss_nickname || "";
    const bossOrganizationName = String(orgStatus.boss_organization_name || "").trim();
    const bossOrganizationAvatar = String(orgStatus.boss_organization_avatar_url || "").trim();
    const bossAvatar = bossOrganizationAvatar || arena.current_boss_avatar_url || store.current_boss_avatar_url || "";
    const myRole = String(game.my_role || "visitor");
    const isBoss = myRole === "boss";
    const isCrew = myRole === "crew";
    const showStoreManagerCard = shouldShowStoreManagerCard({ isBoss, options });
    const myPower = Math.max(0, Number(game.my_power ?? 0));
    const storeBonus = Math.max(0, Number(game.my_store_bonus ?? growth.store_bonus ?? 0));
    const validVisits = Math.max(0, Number(game.my_valid_visits ?? growth.valid_visits ?? 0));
    const bossLevel = Math.max(1, Number(game.boss_level ?? 1));
    const bossLevelBonus = Math.max(0, Number(game.boss_level_bonus ?? 0));
    const bossStoreBonus = Math.max(0, Number(game.boss_store_bonus ?? 0));
    const bossDefense = Math.max(0, Number(game.boss_defense || 0));
    const defenseDecay = Math.max(0, Number(game.defense_decay ?? defenseActivity.decay ?? 0));

    const visitsToNextBonus = Math.max(0, Number(growth.visits_to_next_bonus || 0));
    const bonusMax = Math.max(storeBonus, Number(growth.store_bonus_max || 5));
    const nextBonus = Math.max(storeBonus, Number(growth.next_store_bonus || storeBonus));
    const bonusProgress = Math.max(0, Math.min(100, Number(growth.bonus_progress_percent || 0)));

    const powerNeeded = Math.max(
      0,
      Number(game.power_needed || (bossExists && !isBoss && myPower <= bossDefense ? bossDefense - myPower + 1 : 0))
    );

    const globalCaptureCooldownNow = captureCooldownActive();
    const canChallenge = game.challengeable !== false && !protectedNow && !cooldownNow && !globalCaptureCooldownNow && !isBoss;

    const distance = Number.isFinite(Number(store.distance_m)) ? formatDistance(store.distance_m) : "";
    const place = [store.city, store.district].filter(Boolean).join(" ");
    const address = String(store.address || "").trim();
    const detailLine = [categoryLabel(store.category), place, distance].filter(Boolean).join(" · ");

    let battleState = "점령 가능";
    if(isBoss) battleState = "내 점령지";
    else if(protectedNow) battleState = "보호 중";
    else if(globalCaptureCooldownNow) battleState = "다음 점령 대기";
    else if(cooldownNow) battleState = "재도전 대기";
    else if(bossExists) battleState = "점령 중";

    const defenseStateRaw = String(defenseActivity.state || (defenseDecay > 0 ? "weak" : "active"));
    const defenseState = ({
      active:"활성",
      cooling:"유지 중",
      weak:"약화",
      vulnerable:"취약"
    })[defenseStateRaw] || "활성";

    const nextDefenseAt = defenseActivity.next_decay_at || null;
    const nextDefenseValue = Number(defenseActivity.next_decay_value || defenseDecay);
    const defenseTimelineCopy = !bossExists
      ? ""
      : nextDefenseAt
        ? `다음 약화까지 ${formatRemaining(nextDefenseAt)} · 방어력 -${nextDefenseValue}`
        : `장시간 미방문 · 방어력 -${defenseDecay}`;

    const gallery = photos.length ? `
      <section class="store-detail-section">
        <h4>사진</h4>
        <div class="store-detail-gallery">
          ${photos.map(photo => `<img src="${escapeAttr(photo.image_url)}" alt="${escapeAttr(photo.caption || store.name || "Store photo")}" loading="lazy" decoding="async" />`).join("")}
        </div>
      </section>` : "";

    const managerManagedStore = hasStoreManagerAccount(store, partnerRequest) || isPartner;
    const prioritizedMenu = [...menu].sort((a,b) => Number(Boolean(b?.is_signature)) - Number(Boolean(a?.is_signature)));
    const featuredMenu = prioritizedMenu.slice(0,3);
    const remainingMenu = prioritizedMenu.slice(3);

    const noticeHtml = managerManagedStore && store.notice ? `
      <section class="store-managed-notice" aria-label="매장 공지">
        <span>공지</span>
        <strong>${escapeHtml(store.notice)}</strong>
      </section>` : "";

    const featuredMenuHtml = managerManagedStore && featuredMenu.length ? `
      <section class="store-managed-menu" aria-label="대표 메뉴">
        <div class="store-managed-section-head">
          <span>메뉴</span>
          <small>매장 관리자 등록</small>
        </div>
        <div class="store-detail-menu featured-menu-list">
          ${featuredMenu.map(item => `
            <article>
              <div>
                <strong>${escapeHtml(item.name)}</strong>
                ${item.description ? `<p>${escapeHtml(item.description)}</p>` : ""}
              </div>
              <span>${item.price != null && item.price !== "" ? `${Number(item.price).toLocaleString("ko-KR")}원` : "-"}${item.is_signature ? `<small>대표</small>` : ""}</span>
            </article>`).join("")}
        </div>
      </section>` : "";

    const menuHtml = (!managerManagedStore ? menu : remainingMenu).length ? `
      <section class="store-detail-section">
        <h4>${managerManagedStore ? "메뉴 더보기" : "메뉴"}</h4>
        <div class="store-detail-menu">
          ${(!managerManagedStore ? menu : remainingMenu).map(item => `
            <article>
              <div>
                <strong>${escapeHtml(item.name)}</strong>
                ${item.description ? `<p>${escapeHtml(item.description)}</p>` : ""}
              </div>
              <span>${item.price != null && item.price !== "" ? `${Number(item.price).toLocaleString("ko-KR")}원` : "-"}${item.is_signature ? `<small>대표</small>` : ""}</span>
            </article>`).join("")}
        </div>
      </section>` : "";

    const history = Array.isArray(data.history) ? data.history : [];
    const currentPlayerId = String(playerSession?.player_user_id || authUser?.id || "").trim();
    const myPastReigns = currentPlayerId
      ? history.filter(row => String(row?.boss_user_id || "") === currentPlayerId)
      : [];
    const wasPastBoss = !isBoss && myPastReigns.some(row => Boolean(row?.ended_at));
    const hasVisitHistory = validVisits > 0;
    const storeCreatedAt = new Date(store.created_at || "").getTime();
    const NEW_STORE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;
    const isNewStore = Number.isFinite(storeCreatedAt)
      && storeCreatedAt <= Date.now()
      && (Date.now() - storeCreatedAt) < NEW_STORE_WINDOW_MS;
    const reclaimAvailable = isBoss && reclaim?.eligible !== false && Number(reclaim?.remaining_seconds || 0) <= 0;

    const occupancyBadge = isBoss
      ? {label:"내 점령지",cls:"mine"}
      : protectedNow
        ? {label:"보호 중",cls:"protected"}
        : bossExists
          ? {label:"점령 중",cls:"occupied"}
          : {label:"점령 가능",cls:"open"};

    const relationshipBadge = wasPastBoss
      ? {label:"과거 점령지",cls:"history"}
      : isBoss
        ? {label:hasVisitHistory ? "재방문" : "첫 점령",cls:"history"}
        : hasVisitHistory
          ? {label:"방문 이력",cls:"history"}
          : {label:"첫 방문",cls:"history"};

    const opportunityBadge = isNewStore
      ? {label:"신규 매장",cls:"new"}
      : isBoss
        ? {label:reclaimAvailable ? "재점령 가능" : "재점령 대기",cls:reclaimAvailable ? "open" : "history"}
        : canChallenge
          ? {label:"도전 가능",cls:"open"}
          : protectedNow
            ? {label:"도전 대기",cls:"history"}
            : cooldownNow || globalCaptureCooldownNow
              ? {label:"대기 중",cls:"history"}
              : bossExists
                ? {label:"도전 준비",cls:"history"}
                : {label:"첫 점령 가능",cls:"open"};

    const detailBadges=[
      occupancyBadge,
      relationshipBadge,
      opportunityBadge,
      isPartner ? {label:"제휴",cls:"partner"} : null,
      offers.length ? {label:"혜택",cls:"benefit"} : null
    ].filter(Boolean);

    const offersHtml = isPartner ? `
      <section class="store-detail-section partner-benefits">
        <div class="partner-benefits-head">
          <h4>혜택</h4>
        </div>
        <div class="store-detail-offers">
          ${offers.length ? offers.map(item => {
            const minimumRole = String(item.minimum_role || (item.boss_only ? "boss" : "visitor"));
            const eligible = item.eligible !== false && (
              item.eligible === true ||
              minimumRole === "visitor" ||
              (minimumRole === "crew" && (myRole === "crew" || myRole === "boss")) ||
              (minimumRole === "boss" && myRole === "boss")
            );
            const accessLabel = minimumRole === "boss"
              ? "보스 전용"
              : minimumRole === "crew"
                ? "크루 + 보스"
                : "모두 사용";

            return `
              <article class="partner-benefit ${eligible ? "is-eligible" : "is-locked"}">
                <div>
                  <span>${escapeHtml(accessLabel)}</span>
                  <strong>${escapeHtml(item.title)}</strong>
                  ${item.description ? `<p>${escapeHtml(item.description)}</p>` : ""}
                </div>
                ${eligible
                  ? `<button class="text-btn benefit-use-btn" type="button" data-benefit-offer="${escapeAttr(item.id)}">혜택 사용</button>`
                  : `<small>${minimumRole === "boss" ? "보스가 되면 사용할 수 있습니다" : "크루가 되면 사용할 수 있습니다"}</small>`}
              </article>
            `;
          }).join("") : `<div class="store-detail-empty">현재 사용 가능한 혜택이 없습니다.</div>`}
        </div>
      </section>` : "";

    const arenaCurrentBoss = String(arena.current_boss_nickname || bossName || "아직 없음");
    const arenaCurrentBossAvatar = String(arena.current_boss_avatar_url || bossAvatar || "");
    const arenaLongestBoss = String(arena.longest_boss_nickname || "—");
    const arenaLongestHours = Math.max(0, Number(arena.longest_reign_hours || 0));
    const arenaTodayChallengers = Math.max(0, Number(arena.today_challengers || 0));
    const arenaMonthVisits = Math.max(0, Number(arena.month_visits || publicGrowth.visits || 0));
    const arenaCrew = String(arena.current_crew_name || "");
    const arenaCrewTerritory = Math.max(0, Number(arena.current_crew_territory || 0));

    const historyHtml = history.length ? `
      <section class="store-detail-section conquest-history">
        <h4>점령 히스토리</h4>
        <div class="conquest-history-list">${history.slice(0,8).map((row,index)=>`<div><span>${index===0 && !row.ended_at ? "NOW" : formatDate(row.started_at)}</span><strong>${escapeHtml(row.boss_nickname||"Boss")}</strong><small>${row.ended_at ? `${Number(row.hours||0).toFixed(1)}h` : "점령 중"}</small></div>`).join("")}</div>
      </section>` : "";

    const arenaHtml = `
      <section class="store-arena" aria-label="Store arena">
        <div class="store-arena-head">
          <span>현재 점령</span>
          <strong>이 매장을 차지하고 있는 보스</strong>
        </div>
        <div class="store-arena-grid">
          <article class="arena-boss-card">
            <span>보스</span>
            <div class="arena-boss-identity">
              ${bossAvatarMarkup(arenaCurrentBossAvatar, arenaCurrentBoss, "arena-boss-avatar")}
              <strong>${escapeHtml(arenaCurrentBoss)}</strong>
            </div>
          </article>
          <article><span>최장 점령</span><strong>${escapeHtml(arenaLongestBoss)}</strong><small>${arenaLongestHours ? `${arenaLongestHours.toFixed(arenaLongestHours < 10 ? 1 : 0)}h` : "—"}</small></article>
          <article><span>오늘 도전자</span><strong>${arenaTodayChallengers}</strong></article>
          <article><span>30일 방문</span><strong>${arenaMonthVisits}</strong></article>
        </div>
        ${arenaCrew ? `
          <div class="store-arena-crew">
            <span>크루 점령지</span>
            <strong>${escapeHtml(arenaCrew)}</strong>
            <b>${arenaCrewTerritory}개 매장</b>
          </div>` : ""}
      </section>
    `;

    const impactVisits = Math.max(0, Number(publicGrowth.visits || 0));
    const impactUnique = Math.max(0, Number(publicGrowth.unique_visitors || 0));
    const impactRepeat = Math.max(0, Number(publicGrowth.repeat_visitors || 0));
    const impactChallengers = Math.max(0, Number(publicGrowth.challengers || 0));
    const impactShares = Math.max(0, Number(publicGrowth.shares || 0));
    const ownerClaimHtml = showStoreManagerCard ? renderPartnerRequestCard(store, partnerRequest, isPartner, {
      visits:impactVisits,
      users:impactUnique,
      repeats:impactRepeat,
      challengers:impactChallengers,
      shares:impactShares
    }) : "";



    const powerState = isBoss
      ? ""
      : protectedNow
        ? `보호 ${formatRemaining(protectionUntil)} 남음`
        : cooldownNow
          ? `재도전 ${formatRemaining(cooldownUntil)} 남음`
          : powerNeeded > 0
            ? `파워 +${powerNeeded} 필요`
            : "";

    const powerStateClass = isBoss
      ? "is-mine"
      : protectedNow
        ? "is-protected"
        : powerNeeded > 0
          ? "is-needs-power"
          : "is-ready";

    const growthTargetText = storeBonus >= bonusMax
      ? "매장 보너스 최대"
      : `다음 +${nextBonus}까지 유효 방문 ${visitsToNextBonus}회`;

    const reclaimAvailableAt = reclaim?.is_boss ? reclaim.available_at : null;
    const ownerStatusHtml = isBoss && bossExists ? `
      <section class="owner-store-status" aria-label="내 점령 상태">
        <div class="owner-store-status-grid">
          <article>
            <span>방어력</span>
            <strong>${bossDefense}</strong>
            <small>${protectedNow
              ? `보호 ${escapeHtml(formatRemaining(protectionUntil))} 남음`
              : (nextDefenseAt
                ? `다음 약화 ${escapeHtml(formatRemaining(nextDefenseAt))}`
                : "점령 유지 중")}</small>
          </article>
          ${reclaimAvailableAt ? `<article class="owner-store-reclaim">
            <span>재점령 가능까지</span>
            <strong id="ownerReclaimCountdown" data-reclaim-at="${escapeAttr(reclaimAvailableAt)}">${escapeHtml(formatOwnStoreReclaim(reclaimAvailableAt))}</strong>
            <small>${reclaim?.eligible ? "재방문 시 자동 재점령" : "시간 종료 후 재방문 시 자동 재점령"}</small>
          </article>` : `<article class="owner-store-reclaim is-unavailable">
            <span>재점령</span>
            <strong>—</strong>
            <small>재점령 시간은 자동으로 갱신됩니다.</small>
          </article>`}
        </div>
      </section>
    ` : "";

    let action = "";
    if(isBoss){
      action = "";
    }else if(protectedNow){
      action = `<div class="store-detail-auto"><strong>보호 중</strong><span>${escapeHtml(formatRemaining(protectionUntil))} 후 도전할 수 있습니다.</span></div>`;
    }else if(globalCaptureCooldownNow){
      action = `<div class="store-detail-auto"><strong>다음 점령 대기</strong><span>${escapeHtml(formatRemaining(captureCooldown.cooldown_until))} 후 다른 매장을 점령할 수 있습니다.</span></div>`;
    }else if(cooldownNow){
      action = `<div class="store-detail-auto"><strong>재도전 대기</strong><span>${escapeHtml(formatRemaining(cooldownUntil))} 후 다시 도전할 수 있습니다.</span></div>`;
    }else if(isPartner){
      action = `<button id="detailScanQr" class="primary-btn store-detail-primary" type="button">QR로 도전</button>`;
    }

    $("#modal")?.classList.add("store-detail-modal");
    setText("#modalTitle", "");
    const body = $("#modalBody");
    if(!body) return;

    body.innerHTML = `
      <div class="store-detail store-detail-v635">
        <header class="store-detail-head compact-store-head store-detail-identity">
          <div class="store-detail-primary-identity">
            ${occupiedStoreAvatarMarkup(store, "store-detail-avatar", { priority:true })}
            <div class="store-detail-identity-copy">
              <strong>${escapeHtml(store.name || "매장")}</strong>
              ${detailLine ? `<p>${escapeHtml(detailLine)}</p>` : ""}
              ${address ? `<p class="store-detail-address">${escapeHtml(address)}</p>` : ""}
            </div>
          </div>
          ${detailBadges.length ? `
            <div class="store-detail-status">
              ${detailBadges.map(tag=>`<span class="store-status-tag ${tag.cls}">${tag.label}</span>`).join("")}
            </div>` : ""}
        </header>

        ${ownerStatusHtml}

        ${store.latitude != null && store.latitude !== "" && store.longitude != null && store.longitude !== "" &&
          Number.isFinite(Number(store.latitude)) && Number.isFinite(Number(store.longitude)) ? `
          <section class="store-detail-map-section" aria-label="매장 위치">
            <div id="storeDetailMap" class="store-detail-map" aria-label="${escapeAttr(store.name || "매장")} 지도"></div>
          </section>
        ` : ""}

        ${noticeHtml}
        ${featuredMenuHtml}

        ${bossExists && !isBoss ? `
          <section class="boss-focus" aria-label="보스 정보">
            <div class="boss-focus-main">
              ${bossAvatarMarkup(bossAvatar, bossName || "보스", "boss-focus-avatar")}
              <div class="boss-focus-copy">
                <strong>${escapeHtml(bossName || "보스")}</strong>
                <small>${escapeHtml([bossOrganizationName, `Lv ${bossLevel}`, `방어력 ${bossDefense}`].filter(Boolean).join(" · "))}</small>
              </div>
            </div>
          </section>
        ` : ""}

        ${offersHtml}

        <details class="store-more">
          <summary class="store-more-toggle">
            <span class="store-more-label store-more-label-open">상세 정보 보기</span>
            <span class="store-more-label store-more-label-close">상세 정보 닫기</span>
            <b aria-hidden="true">
              <span class="store-more-icon-open">+</span>
              <span class="store-more-icon-close">−</span>
            </b>
          </summary>
          <div class="store-more-body">
            ${bossExists ? `
              <section class="store-more-stats">
                <div><span>점령자</span><strong>${escapeHtml(bossName || "보스")}</strong></div>
                <div><span>레벨</span><strong>Lv ${bossLevel}</strong><small>보너스 +${bossLevelBonus}</small></div>
                <div><span>방어력</span><strong>${bossDefense}</strong><small>${escapeHtml(defenseState)}</small></div>
                <div><span>크루</span><strong>${escapeHtml(bossOrganizationName || "없음")}</strong></div>
              </section>` : ""}

            <section class="store-detail-subsection">
              <div class="subsection-title">현재 점령</div>
              <div class="store-more-stats arena-mini">
                <div><span>최장 점령</span><strong>${escapeHtml(arenaLongestBoss)}</strong><small>${arenaLongestHours ? `${arenaLongestHours.toFixed(arenaLongestHours < 10 ? 1 : 0)}시간` : "—"}</small></div>
                <div><span>오늘 도전자</span><strong>${arenaTodayChallengers}</strong></div>
                <div><span>30일 방문</span><strong>${arenaMonthVisits}</strong></div>
                <div><span>크루 점령지</span><strong>${arenaCrew ? `${arenaCrewTerritory}개` : "—"}</strong></div>
              </div>
              ${arenaCrew ? `<p class="detail-note">${escapeHtml(arenaCrew)}</p>` : ""}
            </section>

            <section class="store-detail-subsection">
              <div class="subsection-title">최근 30일 기록</div>
              <div class="store-more-stats">
                <div><span>방문</span><strong>${impactVisits}</strong></div>
                <div><span>사용자</span><strong>${impactUnique}</strong></div>
                <div><span>재방문</span><strong>${impactRepeat}</strong></div>
                <div><span>도전</span><strong>${impactChallengers}</strong></div>
              </div>
              ${impactShares ? `<p class="detail-note">최근 30일 공유 ${impactShares}회</p>` : ""}
            </section>

            ${(store.hours || store.phone || (!managerManagedStore && store.notice)) ? `
              <section class="store-detail-section store-detail-info">
                <h4>매장 정보</h4>
                ${store.hours ? `<div><span>영업시간</span><strong>${escapeHtml(store.hours)}</strong></div>` : ""}
                ${store.phone ? `<div><span>전화</span><strong>${escapeHtml(store.phone)}</strong></div>` : ""}
                ${!managerManagedStore && store.notice ? `<div><span>안내</span><strong>${escapeHtml(store.notice)}</strong></div>` : ""}
              </section>` : ""}

            ${gallery}
            ${menuHtml}
          </div>
        </details>

        <section class="store-comments" data-store-comments="${escapeAttr(store.id)}" aria-label="매장 한마디">
          ${playerSession?.authenticated ? `
            <form class="store-comment-form" data-store-comment-form="${escapeAttr(store.id)}">
              <div class="store-comment-input-row">
                <span class="store-comment-input-viewport">
                  <input class="store-comment-input" name="body" type="text" maxlength="120" autocomplete="off" placeholder="한마디 남겨보세요" aria-label="한마디 입력" />
                </span>
                <button class="store-comment-submit" type="submit">등록</button>
              </div>
              <div class="store-comment-form-meta">
                <span data-store-comment-status aria-live="polite"></span>
                <span><b data-store-comment-length>0</b>/120</span>
              </div>
            </form>
          ` : `<button class="store-comment-login" data-store-comment-login type="button">로그인하고 한마디 남기기</button>`}
          <div class="store-comment-list" data-store-comment-list>
            <div class="app-state">한마디를 불러오는 중…</div>
          </div>
          <nav class="list-pagination store-comment-pagination hidden" data-store-comment-pagination aria-label="한마디 페이지"></nav>
        </section>

        ${ownerClaimHtml ? `
          <div class="store-owner-entry">
            <p class="store-owner-entry-copy">이 매장의 관리자이신가요? 매장을 인증하면 방문·도전 현황과 매장 정보를 직접 관리할 수 있습니다.</p>
            ${ownerClaimHtml}
          </div>
        ` : ""}

        ${action ? `<div class="store-detail-bottom-action">${action}</div>` : ""}
      </div>
    `;

    void renderStoreDetailMap(store);
    bindStoreComments(store.id);

    if(ownerClaimHtml){
      const ownerDetails = body.querySelector("details.store-owner-conversion");
      ownerDetails?.addEventListener("toggle", () => {
        if(!ownerDetails.open) return;
        requestAnimationFrame(() => smoothScrollToStoreOwner(ownerDetails));
      });
      $("#detailPartnerRequest")?.addEventListener("click", event => {
        const button = event.currentTarget;
        if(button.dataset.transitioning === "true") return;
        button.dataset.transitioning = "true";

        smoothScrollToStoreOwner(
          body.querySelector(".store-owner-conversion"),
          () => openPartnerRequestForm(store)
        );
      });
      $("#detailPartnerAdmin")?.addEventListener("click", () => { location.href = "./store-admin.html"; });
    }
    $("#shareBossCardBtn")?.addEventListener("click",()=>shareBossCard({
      store,bossName,bossDefense,protectedNow,protectionUntil,myPower,isBoss,context:"store_detail"
    }));

    startOwnerReclaimCountdown();

    $("#detailScanQr")?.addEventListener("click", () => {
      closeModal();
      scanPrompt();
    });


    $$("[data-benefit-offer]", body).forEach(button => {
      button.addEventListener("click", () => createBenefitPass(button.dataset.benefitOffer));
    });
  }


  function bindStoreComments(storeId){
    const root = $(`[data-store-comments="${cssEscape(storeId)}"]`);
    if(!root) return;

    const input = root.querySelector(".store-comment-input");
    const length = root.querySelector("[data-store-comment-length]");
    if(input && length){
      const syncLength = () => { length.textContent = String(Array.from(input.value || "").length); };
      input.addEventListener("input", syncLength);
      syncLength();
    }

    root.querySelector("[data-store-comment-login]")?.addEventListener("click", () => openMemberLogin());
    root.querySelector("[data-store-comment-form]")?.addEventListener("submit", event => submitStoreComment(event, storeId));
    void loadStoreComments(storeId, 1);
  }

  function cssEscape(value){
    if(window.CSS?.escape) return CSS.escape(String(value ?? ""));
    return String(value ?? "").replace(/["\\]/g, "\\$&");
  }

  async function loadStoreComments(storeId, page=1){
    const root = $(`[data-store-comments="${cssEscape(storeId)}"]`);
    if(!root) return;
    const list = root.querySelector("[data-store-comment-list]");
    const pagination = root.querySelector("[data-store-comment-pagination]");
    if(list) list.innerHTML = `<div class="app-state">한마디를 불러오는 중…</div>`;

    const { data, error } = await sb.rpc("biteboss_store_comments_v7582", {
      p_store_id:storeId,
      p_page:Math.max(1, Number(page || 1)),
      p_page_size:10
    });

    if(error){
      console.warn("BiteBoss store comments:", error);
      if(list) setRetryState(list, "한마디를 불러오지 못했습니다.", () => loadStoreComments(storeId, page));
      return;
    }

    const payload = data && typeof data === "object" ? data : {};
    const items = Array.isArray(payload.items) ? payload.items : [];
    const total = Math.max(0, Number(payload.total || 0));
    const safePage = Math.max(1, Number(payload.page || page || 1));
    storeCommentState.set(String(storeId), { page:safePage, total });

    const count = root.querySelector("[data-store-comment-count]");
    if(count) count.textContent = String(total);

    if(list){
      list.innerHTML = items.length
        ? items.map(comment => storeCommentMarkup(comment)).join("")
        : `<div class="store-comment-empty">아직 한마디가 없습니다.</div>`;
    }

    bindStoreCommentRows(root, storeId);
    renderPagination(pagination, safePage, total, 10, next => loadStoreComments(storeId, next));
  }

  function storeCommentMarkup(comment){
    const nickname = String(comment.nickname || "사용자");
    const time = formatCommentTime(comment.created_at);
    const edited = comment.edited_at ? " · 수정됨" : "";

    return       `<article class="store-comment-row ${comment.is_pinned ? "is-pinned" : ""}" data-store-comment-id="${escapeAttr(comment.id)}">
        <button class="store-comment-profile" type="button" data-player-profile="${escapeAttr(comment.user_id || "")}" aria-label="${escapeAttr(nickname)} 프로필">
          ${bossAvatarMarkup(comment.avatar_url || "", nickname, "store-comment-avatar")}
        </button>
        <div class="store-comment-copy">
          <div class="store-comment-topline">
            <div class="store-comment-identity">
              <button type="button" class="store-comment-name" data-player-profile="${escapeAttr(comment.user_id || "")}">${escapeHtml(nickname)}</button>
              
              ${comment.is_pinned ? `<span class="store-comment-pinned" role="img" aria-label="고정 댓글" title="고정 댓글">📌</span>` : ""}
              <time>${escapeHtml(time + edited)}</time>
            </div>
            <div class="store-comment-actions">
              ${comment.is_mine ? `<button type="button" data-comment-edit>수정</button><button type="button" data-comment-delete>삭제</button>` : `<button type="button" data-comment-report>신고</button>`}
            </div>
          </div>
          <p>${escapeHtml(comment.body || "")}</p>
        </div>
      </article>`;
  }

  function bindStoreCommentRows(root, storeId){
    root.querySelectorAll("[data-store-comment-id]").forEach(row => {
      const id = String(row.dataset.storeCommentId || "");
      row.querySelector("[data-comment-edit]")?.addEventListener("click", async () => {
        const bodyEl = row.querySelector(".store-comment-copy p");
        const current = String(bodyEl?.textContent || "");
        const next = prompt("한마디 수정", current);
        if(next === null) return;
        const body = String(next).trim();
        if(!body || Array.from(body).length > 120){
          toast("한마디는 1~120자로 작성해 주세요.");
          return;
        }
        const { data, error } = await sb.rpc("biteboss_store_comment_update_v7582", { p_comment_id:id, p_body:body });
        if(error || !data?.ok){
          toast("수정하지 못했습니다.");
          return;
        }
        const state = storeCommentState.get(String(storeId));
        await loadStoreComments(storeId, state?.page || 1);
      });

      row.querySelector("[data-comment-delete]")?.addEventListener("click", async () => {
        if(!confirm("이 한마디를 삭제할까요?")) return;
        const { data, error } = await sb.rpc("biteboss_store_comment_delete_v7582", { p_comment_id:id });
        if(error || !data?.ok){
          toast("삭제하지 못했습니다.");
          return;
        }
        const state = storeCommentState.get(String(storeId));
        await loadStoreComments(storeId, state?.page || 1);
      });

      row.querySelector("[data-comment-report]")?.addEventListener("click", async () => {
        if(!playerSession?.authenticated){
          openMemberLogin();
          return;
        }
        const { data, error } = await sb.rpc("biteboss_store_comment_report_v7582", { p_comment_id:id, p_reason:"user_report" });
        if(error || !data?.ok){
          const code = String(data?.error || error?.message || "");
          toast(code.includes("ALREADY_REPORTED") ? "이미 신고한 한마디입니다." : "신고하지 못했습니다.");
          return;
        }
        toast("신고가 접수되었습니다.");
      });
    });
  }

  async function submitStoreComment(event, storeId){
    event.preventDefault();
    if(!playerSession?.authenticated){
      openMemberLogin();
      return;
    }
    const form = event.currentTarget;
    const input = form.elements.body;
    const button = form.querySelector('button[type="submit"]');
    const status = form.querySelector("[data-store-comment-status]");
    const body = String(input?.value || "").trim();

    if(!body || Array.from(body).length > 120){
      if(status) status.textContent = "1~120자로 작성해 주세요.";
      return;
    }

    if(button) button.disabled = true;
    if(status) status.textContent = "등록 중…";
    try{
      const { data, error } = await sb.rpc("biteboss_store_comment_create_v7582", {
        p_store_id:storeId,
        p_body:body
      });
      if(error || !data?.ok){
        const code = String(data?.error || error?.message || "");
        if(status) status.textContent = code.includes("COMMENT_COOLDOWN")
          ? "잠시 후 다시 작성해 주세요."
          : "등록하지 못했습니다.";
        return;
      }
      form.reset();
      const length = form.querySelector("[data-store-comment-length]");
      if(length) length.textContent = "0";
      if(status) status.textContent = "";
      await loadStoreComments(storeId, 1);
    }finally{
      if(button) button.disabled = false;
    }
  }

  function formatCommentTime(value){
    if(!value) return "";
    const date = new Date(value);
    const time = date.getTime();
    if(!Number.isFinite(time)) return "";
    const seconds = Math.max(0, Math.floor((Date.now() - time) / 1000));
    if(seconds < 60) return "방금 전";
    const minutes = Math.floor(seconds / 60);
    if(minutes < 60) return `${minutes}분 전`;
    const hours = Math.floor(minutes / 60);
    if(hours < 24) return `${hours}시간 전`;
    const days = Math.floor(hours / 24);
    if(days < 7) return `${days}일 전`;

    const now = new Date();
    const options = date.getFullYear() === now.getFullYear()
      ? { month:"numeric", day:"numeric" }
      : { year:"numeric", month:"numeric", day:"numeric" };
    return date.toLocaleDateString("ko-KR", options);
  }

  function destroyStoreDetailMap(){
    if(storeDetailMap){
      try{ storeDetailMap.remove(); }catch(_error){}
    }
    storeDetailMap = null;
    storeDetailStorePoint = null;
    storeDetailUserMarker = null;
    storeDetailAccuracyCircle = null;
  }

  function fitStoreDetailMap(){
    if(!storeDetailMap || !storeDetailStorePoint) return;

    const points = [storeDetailStorePoint];
    if(storeDetailUserMarker){
      points.push(storeDetailUserMarker.getLatLng());
    }

    if(points.length > 1){
      const bounds = L.latLngBounds(points);
      storeDetailMap.fitBounds(bounds, {
        padding:[28,28],
        maxZoom:17,
        animate:false
      });
    }else{
      storeDetailMap.setView(storeDetailStorePoint,17,{animate:false});
    }
  }

  function updateStoreDetailUserLocation(pos = lastPosition, { fit=false } = {}){
    if(!storeDetailMap || !pos?.coords || typeof L === "undefined") return false;

    const lat = Number(pos.coords.latitude);
    const lng = Number(pos.coords.longitude);
    if(!Number.isFinite(lat) || !Number.isFinite(lng)) return false;

    const point = L.latLng(lat,lng);
    const accuracy = Number(pos.coords.accuracy);

    if(!storeDetailUserMarker){
      storeDetailUserMarker = L.circleMarker(point, {
        radius:6,
        weight:2,
        color:"#ffffff",
        fillColor:"#d33f3f",
        fillOpacity:1
      }).addTo(storeDetailMap).bindTooltip("내 위치", {
        permanent:false,
        direction:"top",
        offset:[0,-6]
      });
    }else{
      storeDetailUserMarker.setLatLng(point);
    }

    if(Number.isFinite(accuracy) && accuracy > 0){
      if(!storeDetailAccuracyCircle){
        storeDetailAccuracyCircle = L.circle(point, {
          radius:accuracy,
          weight:1,
          color:"#d33f3f",
          opacity:.22,
          fillColor:"#d33f3f",
          fillOpacity:.06,
          interactive:false
        }).addTo(storeDetailMap);
      }else{
        storeDetailAccuracyCircle.setLatLng(point);
        storeDetailAccuracyCircle.setRadius(accuracy);
      }
    }else if(storeDetailAccuracyCircle){
      try{ storeDetailAccuracyCircle.remove(); }catch(_error){}
      storeDetailAccuracyCircle = null;
    }

    if(fit) fitStoreDetailMap();
    return true;
  }

  async function renderStoreDetailMap(store = {}){
    destroyStoreDetailMap();

    const mapEl = $("#storeDetailMap");
    if(!mapEl) return;
    if(!window.L && !await ensureRuntimeDependency("leaflet")) return;
    if(!document.body.contains(mapEl) || typeof L === "undefined") return;

    const lat = store.latitude == null || store.latitude === "" ? NaN : Number(store.latitude);
    const lng = store.longitude == null || store.longitude === "" ? NaN : Number(store.longitude);
    if(!Number.isFinite(lat) || !Number.isFinite(lng)) return;

    storeDetailMap = L.map(mapEl, {
      zoomControl:true,
      attributionControl:true,
      preferCanvas:true,
      scrollWheelZoom:false
    });

    L.tileLayer(
      "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
      {
        maxZoom:19,
        subdomains:"abc",
        attribution:'&copy; OpenStreetMap contributors'
      }
    ).addTo(storeDetailMap);

    storeDetailStorePoint = L.latLng(lat,lng);

    L.circleMarker(storeDetailStorePoint, {
      radius:8,
      weight:3,
      color:"#ffffff",
      fillColor:"#111111",
      fillOpacity:1
    }).addTo(storeDetailMap).bindTooltip(String(store.name || "매장"), {
      permanent:false,
      direction:"top",
      offset:[0,-7]
    });

    const hasUserLocation = updateStoreDetailUserLocation(lastPosition);
    if(hasUserLocation){
      fitStoreDetailMap();
    }else{
      storeDetailMap.setView(storeDetailStorePoint,17,{animate:false});
    }

    window.requestAnimationFrame(() => storeDetailMap?.invalidateSize());
  }


  function shouldShowStoreManagerCard({ isBoss = false, options = {} } = {}){
    // A player who currently owns this territory is in the Boss flow, not the store-owner claim flow.
    // Explicitly hidden entry points (profile battle history, compact activity views, etc.) also stay hidden.
    return !isBoss && options?.showStoreManagerCard !== false;
  }

  function smoothScrollToStoreOwner(ownerSection, afterScroll){
    if(!ownerSection){
      afterScroll?.();
      return;
    }

    const modalCard = ownerSection.closest(".modal-card");
    if(!modalCard){
      ownerSection.scrollIntoView({ behavior:"smooth", block:"start" });
      afterScroll?.();
      return;
    }

    const targetTop = Math.max(
      0,
      modalCard.scrollTop + ownerSection.getBoundingClientRect().top - modalCard.getBoundingClientRect().top
    );

    if(Math.abs(modalCard.scrollTop - targetTop) <= 2){
      afterScroll?.();
      return;
    }

    let completed = false;
    let fallbackTimer = 0;
    const complete = () => {
      if(completed) return;
      completed = true;
      if(fallbackTimer) window.clearTimeout(fallbackTimer);
      modalCard.removeEventListener("scrollend", complete);
      afterScroll?.();
    };

    modalCard.addEventListener("scrollend", complete, { once:true });
    modalCard.scrollTo({ top:targetTop, behavior:"smooth" });
    fallbackTimer = window.setTimeout(complete, 650);
  }

  function hasStoreManagerAccount(store = {}, request = {}){
    const truthyFlags = [
      store.has_store_admin, store.store_admin_exists, store.manager_exists, store.has_manager,
      store.admin_account_exists, store.store_admin_active, request.store_admin_exists,
      request.manager_exists, request.account_exists, request.activated, request.is_activated
    ];
    if(truthyFlags.some(value => value === true || String(value).toLowerCase() === "true")) return true;

    const ids = [
      store.store_admin_id, store.store_admin_user_id, store.manager_user_id, store.manager_id,
      store.admin_user_id, store.store_admin_username, request.store_admin_id,
      request.store_admin_user_id, request.manager_user_id, request.manager_id,
      request.store_admin_username
    ];
    if(ids.some(value => String(value || "").trim())) return true;

    const activatedAt = request.activated_at || request.account_activated_at || request.store_admin_activated_at || store.store_admin_activated_at;
    return Boolean(String(activatedAt || "").trim());
  }

  function getStoreOwnerClaimState(store = {}, request = {}, isPartner = false){
    if(hasStoreManagerAccount(store, request)) return "managed";
    const status = String(request?.status || "").trim().toLowerCase();
    const activationCode = String(request?.activation_code || "").trim();
    if(status === "approved" && activationCode) return "approved";
    if(status === "pending") return "pending";
    if(isPartner) return "partner";
    if(status === "rejected") return "rejected";
    return "available";
  }

  function renderPartnerRequestCard(store, request, isPartner, activity = {}){
    const ownerState = getStoreOwnerClaimState(store, request, isPartner);
    const activationCode = String(request?.activation_code || "").trim();
    if(ownerState === "managed" || ownerState === "partner") return "";

    if(ownerState === "approved"){
      return `
        <section class="store-owner-conversion approved">
          <span class="store-owner-kicker">매장 관리자</span>
          <strong>매장 인증이 완료됐습니다.</strong>
          <p>활성화 코드로 관리자 계정을 만들고 매장 활동과 혜택을 관리하세요.</p>
          <code>${escapeHtml(activationCode)}</code>
          <button id="detailPartnerAdmin" class="primary-btn" type="button">매장 관리자 열기</button>
        </section>`;
    }
    if(ownerState === "pending"){
      return `
        <section class="store-owner-conversion pending">
          <span class="store-owner-kicker">매장 인증</span>
          <strong>매장 관리자 확인 중</strong>
          <p>확인이 끝나면 이 화면에서 관리자 활성화를 진행할 수 있습니다.</p>
        </section>`;
    }
    const visits = Math.max(0, Number(activity.visits || 0));
    const users = Math.max(0, Number(activity.users || 0));
    const repeats = Math.max(0, Number(activity.repeats || 0));
    const challengers = Math.max(0, Number(activity.challengers || 0));
    const shares = Math.max(0, Number(activity.shares || 0));
    const hasActivity = visits + users + repeats + challengers > 0;

    return `
      <details class="store-owner-conversion ${hasActivity ? "has-activity" : "is-empty"}">
        <summary class="store-owner-manage-btn">${ownerState === "rejected" ? "다시 매장 관리하기" : "이 매장 관리하기"}</summary>
        <div class="store-owner-body">
          ${hasActivity ? `
            <div class="store-owner-body-head">
              <span class="store-owner-kicker">최근 30일</span>
              <strong>BiteBoss 활동 현황</strong>
            </div>
          ` : `<strong class="store-owner-empty-title">아직 집계된 활동이 없습니다.</strong>`}
          ${hasActivity ? `
            <div class="store-owner-stats" aria-label="최근 30일 BiteBoss 활동">
              <article><span>방문</span><strong>${visits.toLocaleString("ko-KR")}</strong></article>
              <article><span>사용자</span><strong>${users.toLocaleString("ko-KR")}</strong></article>
              <article><span>재방문</span><strong>${repeats.toLocaleString("ko-KR")}</strong></article>
              <article><span>도전</span><strong>${challengers.toLocaleString("ko-KR")}</strong></article>
            </div>
            ${shares ? `<p class="store-owner-share">공유 ${shares.toLocaleString("ko-KR")}회</p>` : ""}
          ` : ""}
          <p>${hasActivity ? "매장을 인증하면 이 현황을 직접 확인하고 매장 정보와 혜택을 관리할 수 있습니다." : "매장을 인증하면 매장 정보와 혜택을 직접 관리할 수 있습니다."}</p>
          <button id="detailPartnerRequest" class="store-owner-auth-btn" type="button">${ownerState === "rejected" ? "다시 인증 요청" : "매장 인증하기"}</button>
        </div>
      </details>`;
  }

  function openPartnerRequestForm(store){
    recordGrowthEvent(store?.id, "claim_store_opened", {});
    if(!playerSession?.authenticated){
      toast("회원 로그인 후 매장 관리자 인증을 신청할 수 있습니다.");
      return;
    }
    openModal("매장 인증", `
      <form id="partnerRequestForm" class="partner-request-form">
        <div class="partner-request-store">
          <strong>${escapeHtml(store.name || "매장")}</strong>
          <p>${escapeHtml(store.address || [store.city,store.district].filter(Boolean).join(" "))}</p>
        </div>
        <label>이름<input class="input" name="requester_name" maxlength="40" autocomplete="name" required /></label>
        <label>연락처<input class="input" name="contact" maxlength="60" autocomplete="tel" inputmode="tel" placeholder="010-0000-0000" required /></label>
        <label>메모<textarea class="input partner-request-note" name="message" maxlength="300" placeholder="확인에 필요한 내용을 적어주세요."></textarea></label>
        <button class="primary-btn" type="submit">인증 요청</button>
        <p id="partnerRequestStatus" class="inline-status"></p>
      </form>`, {type:"partner-request"});
    $("#partnerRequestForm")?.addEventListener("submit", event => submitPartnerRequest(event, store.id));
  }

  async function submitPartnerRequest(event, storeId){
    event.preventDefault();
    const formEl = event.currentTarget;
    if(formEl.dataset.submitting === "true") return;
    formEl.dataset.submitting = "true";
    const form = new FormData(formEl);
    const status = $("#partnerRequestStatus");
    const submit = formEl.querySelector('button[type="submit"]');
    const requesterName = String(form.get("requester_name") || "").trim();
    const contact = String(form.get("contact") || "").trim();
    const message = String(form.get("message") || "").trim();

    if(!requesterName || contact.length < 4){
      if(status) status.textContent = "이름과 연락처를 확인하세요.";
      formEl.dataset.submitting = "false";
      return;
    }
    if(submit) submit.disabled = true;
    if(status) status.textContent = "신청 중…";
    try{
      const { data, error } = await sb.rpc("biteboss_partner_request_create", {
        p_store_id:storeId,
        p_requester_name:requesterName,
        p_contact:contact,
        p_business_number:"",
        p_message:message,
        p_website_url:null,
        p_sns_url:null
      });
      if(error) throw error;
      if(!data?.ok){
        const messageText = ({
          MEMBER_LOGIN_REQUIRED:"회원 로그인 후 신청할 수 있습니다.",
          STORE_NOT_FOUND:"매장을 찾을 수 없습니다.",
          ALREADY_PARTNERED:"이미 제휴된 매장입니다.",
          REQUEST_ALREADY_PENDING:"이미 확인 중인 신청이 있습니다.",
          INVALID_REQUEST:"이름과 연락처를 확인하세요."
        })[data?.error] || "신청을 완료하지 못했습니다.";
        if(status) status.textContent = messageText;
        formEl.dataset.submitting = "false";
        return;
      }
      closeModal();
      toast("매장 관리자 인증 신청이 접수되었습니다.");
      await openStoreDetail(storeId);
    }catch(error){
      console.warn("BiteBoss partner request:", error);
      if(status) status.textContent = error?.message || "신청을 완료하지 못했습니다.";
    }finally{
      formEl.dataset.submitting = "false";
      if(submit) submit.disabled = false;
    }
  }

  async function recordGrowthEvent(storeId, eventType, payload = {}){
    if(!playerSession?.authenticated || !storeId) return;
    try{
      await sb.rpc("biteboss_record_growth_event_v63", {
        p_store_id:storeId,
        p_event_type:String(eventType || "share"),
        p_payload:payload || {}
      });
    }catch(error){
      console.warn("BiteBoss growth event:", error);
    }
  }

  async function shareBossCard({
    store,
    bossName,
    bossDefense,
    protectedNow,
    protectionUntil,
    myPower,
    isBoss=false,
    context="store_detail"
  }){
    const canvas=document.createElement("canvas");
    canvas.width=1080;
    canvas.height=1350;
    const ctx=canvas.getContext("2d");

    const storeName=String(store?.name||"STORE").trim();
    const place=[store?.city,store?.district].filter(Boolean).join(" ");
    const statusLine=isBoss ? "내가 현재 보스" : (bossName ? `현재 보스 ${bossName}` : "아직 보스 없음");
    const timeText=new Intl.DateTimeFormat("en",{month:"short",day:"2-digit",hour:"2-digit",minute:"2-digit"}).format(new Date()).toUpperCase();

    ctx.fillStyle="#000";
    ctx.fillRect(0,0,1080,1350);

    ctx.fillStyle="#d5232f";
    ctx.fillRect(0,0,1080,18);
    ctx.fillRect(72,102,12,126);

    ctx.fillStyle="#fff";
    ctx.font="900 50px system-ui";
    ctx.fillText("BITEBOSS",112,150);

    ctx.fillStyle="#777";
    ctx.font="800 26px system-ui";
    ctx.fillText("매장 점령",72,286);

    ctx.fillStyle="#fff";
    ctx.font="900 92px system-ui";
    const name=storeName.toUpperCase();
    ctx.fillText(name.slice(0,18),72,410);
    if(name.length>18) ctx.fillText(name.slice(18,34),72,510);

    // Keep the card factual: ownership state only. No challenge/slogan copy.
    ctx.fillStyle="#d5232f";
    ctx.font="900 72px system-ui";
    ctx.fillText(statusLine.slice(0,24).toUpperCase(),72,690);

    ctx.strokeStyle="#242424";
    ctx.lineWidth=2;
    ctx.beginPath();
    ctx.moveTo(72,790);
    ctx.lineTo(1008,790);
    ctx.stroke();

    ctx.fillStyle="#777";
    ctx.font="800 25px system-ui";
    ctx.fillText("보스 방어력",72,870);
    ctx.fillText("내 파워",400,870);
    ctx.fillText("상태",730,870);

    ctx.fillStyle="#fff";
    ctx.font="900 56px system-ui";
    ctx.fillText(String(Math.max(0,Number(bossDefense||0))),72,935);
    ctx.fillText(String(Math.max(0,Number(myPower||0))),400,935);

    ctx.fillStyle=protectedNow ? "#fff" : "#d5232f";
    ctx.font="900 34px system-ui";
    ctx.fillText(protectedNow ? "보호 중" : "도전 가능",730,931);

    ctx.fillStyle="#777";
    ctx.font="700 24px system-ui";
    if(place) ctx.fillText(place.toUpperCase().slice(0,36),72,1110);
    ctx.fillText(timeText,72,1157);
    if(protectedNow&&protectionUntil){
      ctx.fillText(`보호 ${formatRemaining(protectionUntil)} 남음`,72,1204);
    }

    const blob=await new Promise((resolve,reject)=>
      canvas.toBlob(b=>b?resolve(b):reject(new Error("CARD_EXPORT_FAILED")),"image/png")
    );
    const file=new File(
      [blob],
      `biteboss-${storeName.replace(/[^a-z0-9가-힣_-]+/gi,"-")}.png`,
      {type:"image/png"}
    );

    let shared=false;
    try{
      if(navigator.share&&navigator.canShare?.({files:[file]})){
        await navigator.share({
          files:[file],
          title:`${storeName} · BiteBoss`,
          text:`${storeName} · BiteBoss`
        });
        shared=true;
      }
    }catch(error){
      if(error?.name==="AbortError") return;
    }

    if(!shared){
      const url=URL.createObjectURL(blob);
      const a=document.createElement("a");
      a.href=url;
      a.download=file.name;
      a.click();
      setTimeout(()=>URL.revokeObjectURL(url),1000);
    }

    await recordGrowthEvent(store?.id, shared ? "share_card_shared" : "share_card_saved", {
      context,
      is_boss:Boolean(isBoss)
    });
  }

  async function createBenefitPass(offerId){
    if(!offerId) return;

    try{
      const { data, error } = await sb.rpc("biteboss_create_offer_pass", {
        p_offer_id:offerId
      });
      if(error) throw error;

      if(!data?.ok){
        const message = ({
          MEMBER_LOGIN_REQUIRED:"회원 로그인 후 혜택을 사용할 수 있습니다.",
          OFFER_NOT_FOUND:"현재 사용할 수 없는 혜택입니다.",
          STORE_NOT_PARTNERED:"제휴 매장에서만 사용할 수 있습니다.",
          ROLE_REQUIRED:data?.minimum_role === "boss"
            ? "현재 보스만 사용할 수 있는 혜택입니다."
            : "현재 크루 이상만 사용할 수 있는 혜택입니다."
        })[data?.error] || "혜택 패스를 만들지 못했습니다.";

        toast(message);
        return;
      }

      openModal("Benefit pass", `
        <div class="benefit-pass">
          <span>SHOW TO STORE STAFF</span>
          <strong>${escapeHtml(data.token || "")}</strong>
          <h4>${escapeHtml(data.offer_title || "Benefit")}</h4>
          <p>${escapeHtml(data.store_name || "Partner Store")}</p>
          <div class="benefit-pass-meta">
            <span>${escapeHtml(String(data.player_role || "visitor").toUpperCase())}</span>
            <span>${escapeHtml(formatRemaining(data.expires_at))} left</span>
          </div>
          <small>직원이 이 코드를 확인하면 1회 사용 처리됩니다. 코드는 5분 후 만료됩니다.</small>
        </div>
      `);
    }catch(error){
      console.warn("BiteBoss benefit pass:", error);
      toast("혜택 패스를 만들지 못했습니다.");
    }
  }


  function renderHomeNearbyBosses(){
    const box = $("#homeNearbyBosses");
    if(!box) return;

    const nearby = stores.slice(0, 8);
    box.innerHTML = nearby.map(store => {
      const boss = store.current_boss_nickname || "보스 없음";
      const label = Number.isFinite(Number(store.distance_m))
        ? `${store.name} · ${formatDistance(store.distance_m)}`
        : store.name;
      const avatar = String(store.current_boss_avatar_url || "").trim();
      return `
        <button class="nearby-boss" type="button" data-tab="stores">
          ${boss !== "보스 없음"
            ? bossAvatarMarkup(avatar, boss, "nearby-avatar")
            : `<span class="nearby-avatar boss-avatar-fallback" aria-hidden="true"></span>`}
          <strong>${escapeHtml(boss)}</strong>
          <small>${escapeHtml(label)}</small>
        </button>
      `;
    }).join("") || `
      <button class="nearby-empty" type="button" data-tab="stores">
        <strong>주변 매장이 아직 없습니다.</strong>
        <small>위치 권한을 허용하면 가까운 보스를 찾습니다.</small>
      </button>
    `;

    $$("#homeNearbyBosses [data-tab]").forEach(btn => btn.onclick = () => openTab(btn.dataset.tab));
  }

  function attachActivityRowHandlers(scope){
    const root = scope || document;
    [...root.querySelectorAll("[data-activity-store]")].forEach(button => {
      button.onclick = event => {
        const storeId = button.dataset.activityStore;
        if(!storeId) return;
        const fromProfileBattleLog = Boolean(button.closest("#profileActivity"));
        if(fromProfileBattleLog){
          event?.preventDefault?.();
          event?.stopPropagation?.();
        }
        openStoreDetail(storeId, {
          source:fromProfileBattleLog ? "profile_battle" : "activity",
          showStoreManagerCard:!fromProfileBattleLog
        });
      };
    });
  }

  function renderProfileActivityPage(){
    const box = $("#profileActivity");
    if(!box) return;
    const view = pageSlice(profileActivityRows, profileActivityPage, PROFILE_ACTIVITY_PAGE_SIZE);
    profileActivityPage = view.page;
    box.innerHTML = renderActivityRows(view.rows, false);
    attachActivityRowHandlers(box);
    renderPagination("#activityPagination", profileActivityPage, profileActivityRows.length, PROFILE_ACTIVITY_PAGE_SIZE, nextPage => {
      profileActivityPage = nextPage;
      renderProfileActivityPage();
      $("#profileBattleSection")?.scrollIntoView({ behavior:"smooth", block:"start" });
    });
  }

  async function loadGameActivity(){
    const homeBox = $("#homeActivity");
    const profileBox = $("#profileActivity");

    if(!playerSession?.authenticated){
      if(homeBox) homeBox.innerHTML = `<div class="activity-empty">로그인 후 전투 기록을 확인할 수 있습니다.</div>`;
      if(profileBox) profileBox.innerHTML = `<div class="activity-empty">로그인 후 전투 기록을 확인할 수 있습니다.</div>`;
      return;
    }

    const { data, error } = await sb.rpc("biteboss_game_activity", {
      p_limit:30
    });

    if(error){
      console.warn("BiteBoss activity:", error);
      if(homeBox) homeBox.innerHTML = `<div class="activity-empty">활동 기록을 불러오지 못했습니다.</div>`;
      setRetryState(profileBox, "전투 기록을 불러오지 못했습니다.", loadGameActivity);
      return;
    }

    const rows = Array.isArray(data) ? data : [];
    profileActivityRows = rows;
    profileActivityPage = 1;

    if(homeBox){
      homeBox.innerHTML = renderActivityRows(rows.slice(0,5), true);
      attachActivityRowHandlers(homeBox);
    }
    if(profileBox) renderProfileActivityPage();
  }

  function renderActivityRows(rows, compact){
    if(!rows.length){
      return `<div class="activity-empty">${compact ? "최근 전투 기록이 없습니다." : "아직 전투 기록이 없습니다."}</div>`;
    }

    return rows.map(row => {
      const result = String(row.result || "");
      const actor = row.actor_name || "사용자";
      const defender = row.defender_name || "보스";
      const storeName = row.store_name || "매장";

      const perspective = String(row.viewer_side || "");
      let title = "보스 도전";
      let detail = `${actor} → ${defender}`;

      if(result === "boss_win"){
        if(perspective === "defender") title = "보스 상실";
        else if(perspective === "org_defender") title = "크루 점령지 상실";
        else if(perspective === "org_challenger") title = "크루 점령";
        else title = "보스 점령";
        detail = perspective === "defender" || perspective === "org_defender" ? actor : actor;
      }else if(result === "crew"){
        if(perspective === "defender") title = "방어 성공";
        else if(perspective === "org_defender") title = "크루 방어 성공";
        else if(perspective === "org_challenger") title = "크루 점령 실패";
        else title = "점령 실패";
        detail = actor;
      }else if(result === "boss_visit"){
        title = "방어 유지";
        detail = actor;
      }

      if(compact){
        const scope = row.is_mine ? "나" : row.is_org ? "크루" : "";
        return `
          <button class="activity-row is-compact" type="button" data-activity-store="${escapeAttr(row.store_id)}" data-player-profile="${escapeAttr(row.actor_user_id || "")}">
            <div class="activity-main">
              <div class="activity-title-row">
                <strong>${escapeHtml(title)}</strong>
                ${scope ? `<span class="activity-scope">${escapeHtml(scope)}</span>` : ""}
              </div>
              <p><b>${escapeHtml(storeName)}</b><span>${escapeHtml(detail)}</span></p>
            </div>
            <time>${escapeHtml(formatActivityTime(row.created_at))}</time>
          </button>
        `;
      }

      const cachedStore = stores.find(item => String(item.id) === String(row.store_id)) || null;
      const photoUrl = String(
        row.store_photo_url ||
        row.photo_url ||
        cachedStore?.photo_url ||
        ""
      ).trim();
      const fallback = Array.from(String(storeName).trim())[0] || "B";
      const thumb = photoUrl
        ? `<img class="profile-record-thumb" src="${escapeAttr(photoUrl)}" alt="" loading="lazy" decoding="async" />`
        : `<span class="profile-record-thumb profile-record-thumb-fallback" aria-hidden="true">${escapeHtml(fallback)}</span>`;

      return `
        <button class="profile-record-row has-thumb" type="button" data-activity-store="${escapeAttr(row.store_id)}" data-player-profile="${escapeAttr(row.actor_user_id || "")}">
          ${thumb}
          <span class="profile-record-main">
            <strong class="profile-record-title">${escapeHtml(title)}</strong>
            <span class="profile-record-meta profile-record-meta-with-time"><span>${escapeHtml(storeName)} · ${escapeHtml(detail)}</span><time class="profile-record-time">${escapeHtml(formatActivityTime(row.created_at))}</time></span>
          </span>
        </button>
      `;
    }).join("");
  }

  function formatActivityTime(value){
    const time = new Date(value).getTime();
    if(!Number.isFinite(time)) return "";
    const diff = Math.max(0,Date.now()-time);
    const minutes = Math.floor(diff/60000);
    if(minutes < 1) return "방금";
    if(minutes < 60) return `${minutes}분 전`;
    const hours = Math.floor(minutes/60);
    if(hours < 24) return `${hours}시간 전`;
    const days = Math.floor(hours/24);
    if(days < 7) return `${days}일 전`;
    return new Date(value).toLocaleDateString("ko-KR",{month:"numeric",day:"numeric"});
  }


  function rankMeterCacheKey(){
    const playerId = String(
      playerSession?.player_user_id ||
      profile?.user_id ||
      authUser?.id ||
      ""
    ).trim();
    return playerId ? `biteboss-rank-meter:${playerId}` : "";
  }

  function summaryCacheKey(){
    const playerId = String(
      playerSession?.player_user_id ||
      profile?.user_id ||
      authUser?.id ||
      ""
    ).trim();
    return playerId ? `biteboss-summary:${playerId}` : "";
  }

  function cacheRankMeterXp(xp){
    const key = rankMeterCacheKey();
    if(!key) return;
    try{
      localStorage.setItem(key, String(Math.max(0, Number(xp) || 0)));
    }catch{}
  }

  function cacheMemberSummary(data){
    const key = summaryCacheKey();
    if(!key || !data || typeof data !== "object") return;
    try{
      localStorage.setItem(key, JSON.stringify(data));
    }catch{}
  }

  function readCachedMemberSummary(){
    const key = summaryCacheKey();
    if(!key) return null;
    try{
      const value = JSON.parse(localStorage.getItem(key) || "null");
      return value && typeof value === "object" ? value : null;
    }catch{
      return null;
    }
  }

  function paintMemberSummary(data, { cache = false } = {}){
    if(!data || typeof data !== "object") return false;
    summary = data;
    const bossCount = Number(data.active_boss_count || 0);
    const crewCount = Number(data.crew_count || 0);
    const checkins = Number(data.checkin_count || 0);
    const claims = Number(data.claim_count || 0);
    const xp = Math.max(0, Number(data.xp || 0));
    const level = levelProgressFromXp(xp).level;

    setText("#homeBossCount", bossCount);
    setText("#myBossCount", bossCount);
    setText("#myCrewCount", crewCount);
    setText("#myLevel", `Lv ${level}`);
    setText("#homeCheckinCount", checkins);
    setText("#myCheckinCount", checkins);
    setText("#homeStreakCount", claims);
    setText("#homeXp", `Lv ${level} · ${xp} XP`);
    renderOrganizationUi();
    updateHomeProtectionMeter(data);
    updateProfileMeter(bossCount);
    updateRankMeter(xp);

    if(cache){
      cacheRankMeterXp(xp);
      cacheMemberSummary(data);
    }
    return true;
  }

  function restoreRankMeter(){
    const liveXp = Number(summary?.xp);
    if(Number.isFinite(liveXp)){
      updateRankMeter(liveXp);
      return true;
    }

    const cachedSummary = readCachedMemberSummary();
    const summaryXp = Number(cachedSummary?.xp);
    if(Number.isFinite(summaryXp) && summaryXp >= 0){
      updateRankMeter(summaryXp);
      return true;
    }

    const key = rankMeterCacheKey();
    if(!key) return false;
    try{
      const raw = localStorage.getItem(key) ?? sessionStorage.getItem(key);
      if(raw === null) return false;
      const cached = Number(raw);
      if(Number.isFinite(cached) && cached >= 0){
        updateRankMeter(cached);
        return true;
      }
    }catch{}
    return false;
  }

  async function loadHome(){
    if(!playerSession?.authenticated){
      resetMemberSummaryUi();
      return;
    }

    // Warm paint first. Read persistent state only when there is no in-memory summary.
    // paintMemberSummary already paints the rank meter, so avoid the old duplicate restore pass.
    if(!summary){
      const cachedMemberSummary = readCachedMemberSummary();
      if(cachedMemberSummary) paintMemberSummary(cachedMemberSummary);
      else restoreRankMeter(); // compatibility with pre-summary-cache builds
    }else{
      updateRankMeter(summary.xp);
    }

    // Many actions refresh home/rank together. Share one in-flight summary RPC instead of
    // issuing duplicate requests that compete with ranking and store requests.
    if(homeLoadPromise) return homeLoadPromise;

    homeLoadPromise = (async () => {
      const { data, error } = await sb.rpc("biteboss_my_summary");
      if(error){
        console.warn(error);
        return;
      }
      paintMemberSummary(data || {}, { cache:true });
    })().finally(() => {
      homeLoadPromise = null;
    });

    return homeLoadPromise;
  }

  function updateHomeProtectionMeter(data){
    const expiresAt = data?.protected_until;
    if(!expiresAt){
      setPageMeter("home", "보스 기록 없음", "-", 0, true);
      return;
    }

    const totalMs = Math.max(1, Number(config.protect_minutes || 60)) * 60 * 1000;
    const remainingMs = Math.max(0, new Date(expiresAt).getTime() - Date.now());
    const name = data.active_store_name || "매장";
    setPageMeter("home", `${name} 보스`, formatRemaining(expiresAt), remainingMs / totalMs * 100, false);
  }

  async function loadHistory(){
    const box = $("#myHistory");
    if(!box) return;

    const { data, error } = await sb.rpc("biteboss_my_history", { p_limit:30 });
    if(error){
      console.warn(error);
      setRetryState(box, "방문 기록을 불러오지 못했습니다.", loadHistory);
      return;
    }

    renderVisitLog(data || []);
  }

  function renderVisitLog(entries, options = {}){
    const box = $("#myHistory");
    if(!box) return;

    if(Array.isArray(entries)){
      visitRows = entries;
      if(options.resetPage !== false) visitPage = 1;
    }

    const view = pageSlice(visitRows, visitPage, VISIT_PAGE_SIZE);
    visitPage = view.page;
    setText("#visitPlaceCount", `${visitRows.length}곳`);

    const summaryText = $("#visitSummaryText");
    if(summaryText){
      summaryText.textContent = visitRows.length
        ? `${visitRows[0].store_name}${visitRows.length > 1 ? ` 외 ${visitRows.length - 1}곳` : ""} 방문 기록`
        : "매장을 방문하면 기록이 여기에 남습니다.";
    }

    box.innerHTML = view.rows.map(entry => {
      const storeName = String(entry.store_name || "매장").trim();
      const place = [entry.city, entry.district].filter(Boolean).join(" ") || entry.address || categoryLabel(entry.category) || "";
      const cachedStore = stores.find(item => String(item.id) === String(entry.store_id)) || null;
      const photoUrl = String(
        entry.store_photo_url ||
        entry.photo_url ||
        cachedStore?.photo_url ||
        ""
      ).trim();
      const fallback = Array.from(storeName)[0] || "B";
      const thumb = photoUrl
        ? `<img class="profile-record-thumb" src="${escapeAttr(photoUrl)}" alt="" loading="lazy" decoding="async" />`
        : `<span class="profile-record-thumb profile-record-thumb-fallback" aria-hidden="true">${escapeHtml(fallback)}</span>`;
      const visitTime = formatDate(entry.claimed_at || entry.visited_at || entry.created_at);
      const meta = [place, visitTime].filter(Boolean).join(" · ");

      return `
        <button
          class="profile-record-row has-thumb"
          type="button"
          data-visit-store="${escapeAttr(entry.store_id || "")}"
          aria-label="${escapeAttr(storeName)} 매장 상세 보기"
        >
          ${thumb}
          <span class="profile-record-main">
            <strong class="profile-record-title">${escapeHtml(storeName)}</strong>
            <span class="profile-record-meta">${escapeHtml(meta || "방문 기록")}</span>
          </span>
        </button>
      `;
    }).join("") || `<div class="profile-record-empty">아직 방문 기록이 없습니다.</div>`;

    renderPagination("#visitPagination", visitPage, visitRows.length, VISIT_PAGE_SIZE, nextPage => {
      visitPage = nextPage;
      renderVisitLog(null, { resetPage:false });
      $("#profileVisitSection")?.scrollIntoView({ behavior:"smooth", block:"start" });
    });

    [...box.querySelectorAll("[data-visit-store]")].forEach(row => {
      const storeId = String(row.dataset.visitStore || "").trim();
      if(!storeId){
        row.disabled = true;
        return;
      }

      row.addEventListener("click", () => {
        openStoreDetail(storeId, {
          source:"profile_visit",
          showStoreManagerCard:false
        });
      });
    });
  }


  function hasRecentLocalOwnership(storeId){
    const key=String(storeId||"").trim();
    if(!key) return false;
    const ownedAt=Number(locallyOwnedStoreIds.get(key) || 0);
    if(!ownedAt) return false;
    if(Date.now()-ownedAt <= RUNTIME.localOwnershipGraceMs) return true;
    locallyOwnedStoreIds.delete(key);
    return false;
  }

  function currentUserIdSet(){
    return new Set([
      playerSession?.player_user_id,
      profile?.user_id,
      authUser?.id
    ].filter(Boolean).map(String));
  }

  function isMyBossStore(store){
    const storeId=String(store?.id || "").trim();
    if(!storeId) return false;
    if(hasRecentLocalOwnership(storeId)) return true;

    const role=storeRoleMap.get(storeId)||{};
    if(role.is_my_boss_store || role.my_role === "boss") return true;

    const bossUserId=String(store.current_boss_user_id || store.boss_user_id || "");
    if(bossUserId && currentUserIdSet().has(bossUserId)) return true;

    const myNickname=String(profile?.nickname || playerSession?.nickname || "").trim();
    const bossNickname=String(store.current_boss_nickname || "").trim();
    return Boolean(myNickname && bossNickname && myNickname === bossNickname);
  }

  function markStoreOwnedLocally(store){
    const storeId=String(store?.id || "").trim();
    if(!storeId) return;
    locallyOwnedStoreIds.set(storeId,Date.now());
    const previous=storeRoleMap.get(storeId)||{};
    storeRoleMap.set(storeId,{...previous,store_id:storeId,is_my_boss_store:true,my_role:"boss"});
  }

  function reconcileTakeoverOwnership(){
    if(!takeoverUi?.storeId) return;
    const activeStore=stores.find(item=>String(item.id)===String(takeoverUi.storeId));
    if(!activeStore || isMyBossStore(activeStore)) closeTakeoverUi();
  }

  function currentTakeoverVisualRemaining(){
    if(!takeoverUi) return 0;
    if(TAKEOVER_IDLE_STATES.has(String(takeoverUi.status||""))){
      return Math.max(0,Number(takeoverRemaining||0));
    }
    const elapsed=Math.max(0,(Date.now()-takeoverLastServerAt)/1000);
    return Math.max(0,Number(takeoverRemaining||0)-elapsed);
  }

  function takeoverModeLabel(mode){
    return ({takeover:"TAKING OVER",challenge:"CHALLENGING",retake:"RETAKING",hot:"HOT TAKEOVER",reclaim:"RECLAIMING"})[String(mode||"")] || "TAKING OVER";
  }

  function takeoverModeFromStore(store){
    const role=storeRoleMap.get(String(store?.id||""))||{};
    if(role.was_previous_boss || role.can_retake) return "retake";
    if(Number(store?.challenges_24h||0)>=Number(config.hot_store_challenges_24h||5) || store?.is_hot) return "hot";
    const boss=String(store?.current_boss_nickname||"").trim();
    return boss && boss!=="No Boss" && boss!=="미점령" ? "challenge" : "takeover";
  }

  function takeoverFallbackSeconds(){
    // One authoritative capture clock: presence/dwell time.
    // takeover-session RPC is used for eligibility/cooldown/mode only.
    return Math.max(30,Number(config.gps_dwell_seconds||120));
  }

  function showTakeoverUi(store,state={}){
    if(!store?.id || takeoverCancelledLocally) return;
    const requestedMode=String(state.mode||"");
    if(isMyBossStore(store) && requestedMode!=="reclaim"){
      if(takeoverUi?.storeId===String(store.id)) closeTakeoverUi();
      return;
    }
    const screen=$("#takeoverScreen");
    if(!screen) return;
    const mode=String(state.mode||takeoverModeFromStore(store));
    const required=Math.max(5,Number(state.required_seconds||takeoverFallbackSeconds(mode)));
    const remaining=Math.max(0,Number(state.remaining_seconds ?? required));
    takeoverUi={storeId:String(store.id),storeName:String(store.name||"매장"),mode,status:String(state.status||"tracking")};
    screen.dataset.mode=mode;
    screen.dataset.status=String(state.status||"tracking");
    takeoverRequired=required;
    takeoverRemaining=remaining;
    takeoverLastServerAt=Date.now();
    $("#takeoverEyebrow").textContent=takeoverModeLabel(mode);
    $("#takeoverStoreName").textContent=takeoverUi.storeName;
    const cancelButton=$("#takeoverCancelBtn");
    if(cancelButton) cancelButton.textContent=mode==="reclaim" ? "재점령 취소" : "점령 취소";
    updateTakeoverUi(state.status||"tracking",state.reason||"");
    screen.classList.remove("hidden");
    document.body.classList.add("takeover-active");
    renderTakeoverAd(activeCampaignFor("takeover"));
    startTakeoverUiTicker();
  }

  function startTakeoverUiTicker(){
    if(takeoverUiTimer) return;
    takeoverUiTimer=window.setInterval(()=>{
      if(!takeoverUi || TAKEOVER_IDLE_STATES.has(String(takeoverUi.status||""))) return;
      const elapsed=Math.max(0,(Date.now()-takeoverLastServerAt)/1000);
      const visual=Math.max(0,takeoverRemaining-elapsed);
      renderTakeoverCount(visual);
    },RUNTIME.takeoverUiTickMs);
  }

  function setTakeoverCountDisplay(value){
    const count=$("#takeoverCount");
    if(!count) return;
    if(typeof value === "string"){
      count.classList.add("is-word");
      count.innerHTML=`<span class="takeover-word">${escapeHtml(value)}</span>`;
      count.setAttribute("aria-label",value);
      return;
    }
    const whole=Math.max(0,Math.ceil(Number(value||0)));
    count.classList.remove("is-word");
    if(!count.querySelector(".takeover-minutes")){
      count.innerHTML='<span class="takeover-minutes">00</span><span class="takeover-colon" aria-hidden="true">:</span><span class="takeover-seconds">00</span>';
    }
    const minutes=count.querySelector(".takeover-minutes");
    const seconds=count.querySelector(".takeover-seconds");
    if(minutes) minutes.textContent=String(Math.floor(whole/60)).padStart(2,"0");
    if(seconds) seconds.textContent=String(whole%60).padStart(2,"0");
    count.setAttribute("aria-label",`${String(Math.floor(whole/60)).padStart(2,"0")}:${String(whole%60).padStart(2,"0")}`);
    count.classList.toggle("is-final",whole>0&&whole<=5);
  }

  function renderTakeoverCount(seconds){
    const bar=$("#takeoverProgressBar");
    setTakeoverCountDisplay(seconds);
    if(bar){
      const done=takeoverRequired>0 ? Math.max(0,Math.min(100,(1-Number(seconds||0)/takeoverRequired)*100)) : 0;
      bar.style.width=`${done}%`;
    }
  }

  function updateTakeoverUi(status,reason=""){
    if(!takeoverUi) return;
    takeoverUi.status=String(status||"tracking");
    const screen=$("#takeoverScreen");
    if(screen){ screen.dataset.status=takeoverUi.status; screen.dataset.mode=takeoverUi.mode||"takeover"; }
    const label=$("#takeoverStatus");
    const count=$("#takeoverCount");
    if(status==="hold" || status==="outside"){
      if(label) label.textContent=reason==="SUSPICIOUS_SPEED" ? "비정상 이동이 감지되어 점령을 확인 중입니다." : "HOLD · 매장 가까이 돌아오면 계속됩니다.";
      count?.classList.add("is-hold");
    }else if(status==="low_accuracy"){
      if(label) label.textContent="HOLD · GPS 정확도를 확인하고 있습니다.";
      count?.classList.add("is-hold");
    }else if(status==="cancelled"){
      if(label) label.textContent="점령이 취소되었습니다. 매장 가까이에서 다시 시작하세요.";
      count?.classList.add("is-hold");
    }else if(status==="ready"){
      if(label) label.textContent="점령 판정 중…";
      count?.classList.remove("is-hold");
      renderTakeoverCount(0);
    }else{
      if(label) label.textContent="매장 안에서 위치를 유지하세요.";
      count?.classList.remove("is-hold");
    }
    renderTakeoverCount(takeoverRemaining);
  }

  function syncTakeoverUi(store,state={}){
    if(!store?.id) return;
    const requestedMode=String(state.mode||"");
    if(isMyBossStore(store) && requestedMode!=="reclaim"){
      if(takeoverUi?.storeId===String(store.id)) closeTakeoverUi();
      return;
    }

    const status=String(state.status||"tracking");
    const storeId=String(store.id);
    const freshSession=!takeoverUi || takeoverUi.storeId!==storeId ||
      (["cancelled","ready"].includes(String(takeoverUi.status||"")) && status==="tracking");

    if(freshSession){
      showTakeoverUi(store,state);
      return;
    }

    const visualNow=currentTakeoverVisualRemaining();
    const incomingRaw=Number(state.remaining_seconds);
    const incomingRemaining=Number.isFinite(incomingRaw) ? Math.max(0,incomingRaw) : visualNow;

    // The server is authoritative, but a delayed GPS/RPC response must never make
    // an active countdown move backwards. A genuinely new session is handled above.
    takeoverRemaining=Math.min(visualNow,incomingRemaining);
    takeoverLastServerAt=Date.now();

    const incomingRequired=Number(state.required_seconds);
    if(Number.isFinite(incomingRequired) && incomingRequired>0){
      takeoverRequired=Math.max(30,incomingRequired);
    }else if(!takeoverRequired){
      takeoverRequired=takeoverFallbackSeconds();
    }
    if(state.mode) takeoverUi.mode=String(state.mode);
    $("#takeoverEyebrow").textContent=takeoverModeLabel(takeoverUi.mode);
    const cancelButton=$("#takeoverCancelBtn");
    if(cancelButton) cancelButton.textContent=takeoverUi.mode==="reclaim" ? "재점령 취소" : "점령 취소";
    updateTakeoverUi(status,state.reason||"");
  }

  function closeTakeoverUi(delay=0){
    delayedTakeoverCloseTimer = clearTimeoutRef(delayedTakeoverCloseTimer);

    const run=()=>{
      $("#takeoverScreen")?.classList.add("hidden");
      hideTakeoverAd();
      document.body.classList.remove("takeover-active");
      takeoverUiTimer = clearIntervalRef(takeoverUiTimer);
      takeoverUi=null; takeoverRemaining=0; takeoverRequired=0; takeoverLastServerAt=0;
      delayedTakeoverCloseTimer = null;
    };

    if(delay>0){
      delayedTakeoverCloseTimer = window.setTimeout(run, delay);
    }else{
      run();
    }
  }

  function dismissTakeoverStore(storeId){
    const id=String(storeId||"").trim();
    if(!id) return;
    dismissedTakeoverStores.set(id,Date.now());
    if(preferredTakeoverStoreId===id) preferredTakeoverStoreId="";
  }

  function pruneDismissedTakeoverStores(pos){
    if(!pos?.coords) return;
    for(const storeId of [...dismissedTakeoverStores.keys()]){
      const store=stores.find(item=>String(item?.id||"")===storeId);
      if(!store || !Number.isFinite(Number(store.latitude)) || !Number.isFinite(Number(store.longitude))){
        dismissedTakeoverStores.delete(storeId);
        continue;
      }
      const distance=haversineMeters(
        pos.coords.latitude,
        pos.coords.longitude,
        Number(store.latitude),
        Number(store.longitude)
      );
      if(distance>=TAKEOVER_DISMISS_RESET_DISTANCE_M) dismissedTakeoverStores.delete(storeId);
    }
    if(preferredTakeoverStoreId){
      const preferred=stores.find(item=>String(item?.id||"")===preferredTakeoverStoreId);
      if(!preferred || !Number.isFinite(Number(preferred.latitude)) || !Number.isFinite(Number(preferred.longitude))){
        preferredTakeoverStoreId="";
      }else{
        const distance=haversineMeters(
          pos.coords.latitude,
          pos.coords.longitude,
          Number(preferred.latitude),
          Number(preferred.longitude)
        );
        if(distance>=TAKEOVER_DISMISS_RESET_DISTANCE_M) preferredTakeoverStoreId="";
      }
    }
  }

  function closeTakeoverChoice(){
    takeoverChoiceOpen=false;
    closeModal();
  }

  function takeoverChoiceCard(row){
    const store=row?.store||{};
    const roleState=storeRoleMap.get(String(store.id))||{};
    const protectionUntil=roleState.protected_until||store.protected_until||null;
    const protectedNow=Boolean(protectionUntil&&new Date(protectionUntil).getTime()>Date.now());
    const isPartner=String(store.partnership_status||"unclaimed")==="partnered";
    const hasBenefit=Boolean(store.has_benefit||Number(store.active_offer_count||0)>0);
    const boss=String(store.current_boss_nickname||"").trim();
    const bossExists=Boolean(boss&&boss!=="No Boss"&&boss!=="미점령");
    const place=[store.city,store.district].filter(Boolean).join(" ");
    const distance=Number.isFinite(Number(row?.distance))?formatDistance(row.distance):(Number.isFinite(Number(store.distance_m))?formatDistance(store.distance_m):"");
    const protectionSummary=protectedNow?`보호 ${formatRemaining(protectionUntil)} 남음`:"";
    const details=[categoryLabel(store.category),place,distance,protectionSummary].filter(Boolean).join(" · ");
    const status=bossExists?`현재 BOSS · ${boss}`:"미점령";
    const badges=[isPartner?{label:"제휴",cls:"partner"}:null,hasBenefit?{label:"혜택",cls:"benefit"}:null].filter(Boolean);
    const cardMode=takeoverModeFromStore(store);
    return `<div class="takeover-choice-row" data-choice-row="${escapeAttr(store.id)}">
      <button class="takeover-choice-store" type="button" data-takeover-choice="${escapeAttr(store.id)}" aria-label="${escapeAttr(store.name||"매장")} 점령 선택">
        <article class="store-card challenge-card mode-${escapeAttr(cardMode)} ${isPartner?"is-partner-store":""}">
          <div class="store-card-main">
            ${occupiedStoreAvatarMarkup(store,"store-card-photo")}
            <div class="store-card-copy">
              <div class="store-card-title-row">
                <strong class="store-card-name">${escapeHtml(store.name||"매장")}</strong>
                ${badges.length?`<div class="store-status-tags">${badges.map(tag=>`<span class="store-status-tag ${tag.cls}">${tag.label}</span>`).join("")}</div>`:""}
              </div>
              ${details?`<div class="store-card-meta">${escapeHtml(details)}</div>`:""}
              <div class="store-card-status ${protectedNow?"is-protected":""}">${escapeHtml(status)}</div>
            </div>
          </div>
        </article>
      </button>
      <button class="takeover-choice-dismiss" type="button" data-takeover-dismiss="${escapeAttr(store.id)}">제외</button>
    </div>`;
  }

  function openTakeoverChoice(rows){
    if(takeoverChoiceOpen||!Array.isArray(rows)||rows.length<2) return false;
    const modal=$("#modal");
    if(modal&&!modal.classList.contains("hidden")) return false;
    takeoverChoiceOpen=true;
    const visibleRows=rows.slice(0,8);
    openModal("점령할 매장 선택",`
      <div class="takeover-choice-copy">현재 위치에서 매장을 선택하세요.</div>
      <div class="takeover-choice-list">${visibleRows.map(takeoverChoiceCard).join("")}</div>
      ${rows.length>visibleRows.length?`<div class="takeover-choice-more">가까운 매장 ${visibleRows.length}곳을 먼저 표시합니다.</div>`:""}
    `,{type:"notice"});
    const body=$("#modalBody");
    body?.querySelectorAll("[data-takeover-choice]").forEach(button=>{
      button.addEventListener("click",()=>{
        preferredTakeoverStoreId=String(button.dataset.takeoverChoice||"").trim();
        takeoverCancelledLocally=false;
        takeoverCancelResetTimer=clearTimeoutRef(takeoverCancelResetTimer);
        closeTakeoverChoice();
        void tickPresenceTracking();
      });
    });
    body?.querySelectorAll("[data-takeover-dismiss]").forEach(button=>{
      button.addEventListener("click",()=>{
        const storeId=String(button.dataset.takeoverDismiss||"").trim();
        dismissTakeoverStore(storeId);
        button.closest("[data-choice-row]")?.remove();
        const remaining=[...body.querySelectorAll("[data-takeover-choice]")].filter(item=>!dismissedTakeoverStores.has(String(item.dataset.takeoverChoice||"")));
        if(remaining.length===1){preferredTakeoverStoreId=String(remaining[0].dataset.takeoverChoice||"").trim();closeTakeoverChoice();void tickPresenceTracking();}
        else if(remaining.length===0) closeTakeoverChoice();
      });
    });
    return true;
  }

  function cancelTakeoverUi(){
    const cancelledStoreId=String(takeoverUi?.storeId||"").trim();
    if(cancelledStoreId) dismissTakeoverStore(cancelledStoreId);
    takeoverCancelledLocally=true;
    closeTakeoverUi();
    takeoverCancelResetTimer = clearTimeoutRef(takeoverCancelResetTimer);
    takeoverCancelResetTimer = window.setTimeout(()=>{
      takeoverCancelledLocally=false;
      takeoverCancelResetTimer=null;
    },Math.max(1200,Number(config.gps_presence_ping_seconds||10)*250));
    showTakeoverCancelledNotice();
  }

  async function pingTakeoverSession(store,pos){
    if(!store?.id || !pos?.coords || !window.sb) return null;
    try{
      const {data,error}=await sb.rpc("biteboss_takeover_session_ping_v7514",{
        p_store_id:store.id,
        p_lat:Number(pos.coords.latitude),
        p_lng:Number(pos.coords.longitude),
        p_accuracy_m:Number.isFinite(pos.coords.accuracy)?Number(pos.coords.accuracy):null
      });
      if(error){
        if(!String(error.message||"").includes("biteboss_takeover_session_ping_v7514")) console.warn("BiteBoss takeover session:",error);
        return null;
      }
      return data||null;
    }catch{return null;}
  }

  function resolvePulseStoreId(row){
    if(!row || typeof row !== "object") return "";
    const directCandidates = [row.store_id, row.store?.id, row.storeId]
      .map(value => String(value ?? "").trim())
      .filter(Boolean);

    for(const candidate of directCandidates){
      if(stores.some(store => String(store?.id || "").trim() === candidate)) return candidate;
    }

    const targetName = String(row.store_name || row.name || row.store?.name || "").trim().toLowerCase();
    if(targetName){
      const exact = stores.find(store => String(store?.name || "").trim().toLowerCase() === targetName);
      if(exact?.id) return String(exact.id);
    }

    return directCandidates[0] || "";
  }

  function normalizePulseStore(row){
    if(!row || typeof row !== "object") return null;
    const storeName = row.store_name || row.name || row.store?.name || "매장";
    const storeId = resolvePulseStoreId({...row, store_name:storeName});
    if(!storeId) return null;
    return {
      ...row,
      store_id:storeId,
      store_name:storeName,
      challenges_24h:Number(row.challenges_24h ?? row.challenge_count ?? row.store?.challenges_24h ?? 0)
    };
  }

  function localStoreForPulse(row){
    const id = String(row?.store_id || "").trim();
    const name = String(row?.store_name || "").trim().toLowerCase();
    return stores.find(store => String(store?.id || "").trim() === id)
      || (name ? stores.find(store => String(store?.name || "").trim().toLowerCase() === name) : null)
      || null;
  }

  function localStoreDistance(store){
    const directRaw = store?.distance_m;
    const direct = directRaw == null || directRaw === "" ? NaN : Number(directRaw);
    if(Number.isFinite(direct)) return direct;
    const lat = Number(store?.latitude);
    const lng = Number(store?.longitude);
    const userLat = Number(lastPosition?.coords?.latitude);
    const userLng = Number(lastPosition?.coords?.longitude);
    if([lat,lng,userLat,userLng].every(Number.isFinite)){
      return haversineMeters(userLat,userLng,lat,lng);
    }
    return Number.MAX_SAFE_INTEGER;
  }

  function nearbyHotRows(rows){
    const seen = new Set();
    return rows
      .map(row => ({ row, store:localStoreForPulse(row) }))
      .filter(item => item.store)
      .sort((a,b) => localStoreDistance(a.store) - localStoreDistance(b.store))
      .filter(item => {
        const id = String(item.store.id);
        if(seen.has(id)) return false;
        seen.add(id);
        return true;
      })
      .map(item => ({
        ...item.row,
        store_id:String(item.store.id),
        store_name:item.store.name || item.row.store_name
      }));
  }

  function currentPartnerBanner(){
    const banners = Array.isArray(config.partner_banners) ? config.partner_banners : [];
    const hasLocation = Boolean(
      lastPosition?.coords &&
      Number.isFinite(Number(lastPosition.coords.latitude)) &&
      Number.isFinite(Number(lastPosition.coords.longitude))
    );
    const eligible = banners.filter(banner => {
      if(!banner?.id || String(banner.status || "active") !== "active") return false;
      // The banner must paint immediately when the Stores tab opens.
      // Distance becomes enforceable only after GPS is available; before that, do not
      // incorrectly treat "location not ready" as "store is out of range".
      if(!hasLocation) return true;
      const rawLimit = banner.distance_km ?? 5;
      const limitKm = rawLimit === "all" ? Infinity : Math.max(0, Number(rawLimit));
      if(!Number.isFinite(limitKm)) return true;
      const distanceM = localStoreDistance(banner);
      return Number.isFinite(distanceM) && distanceM <= limitKm * 1000;
    });
    const topPriority = eligible.reduce((max,banner) => Math.max(max, Number(banner.priority || 3)), -Infinity);
    const top = eligible
      .filter(banner => Number(banner.priority || 3) === topPriority)
      .sort((left,right) => localStoreDistance(left) - localStoreDistance(right));
    if(!top.length) return null;
    const slot = Math.floor(Date.now() / (30 * 60 * 1000));
    return top[slot % top.length];
  }

  function partnerBannerMarkup(banner){
    if(!banner) return "";
    const defaultCopy = String(banner.partnership_status || "") === "partnered"
      ? "이 매장에서 BiteBoss 혜택을 확인해 보세요."
      : "지금 이 매장을 확인해 보세요.";
    const copy = String(banner.copy || defaultCopy).trim();
    const image = String(banner.photo_url || "").trim();
    const visual = image
      ? `<span class="partner-banner-thumb" aria-hidden="true"><img src="${escapeAttr(image)}" alt="" loading="eager" decoding="async" fetchpriority="high" /></span>`
      : `<span class="partner-banner-thumb partner-banner-fallback" aria-hidden="true">${escapeHtml(String(banner.name || "P").trim().charAt(0) || "P")}</span>`;
    return `<button class="game-pulse-item is-partner-banner" type="button" data-pulse-store="${escapeAttr(banner.id)}" data-pulse-name="${escapeAttr(banner.name || "")}">${visual}<strong>${escapeHtml(banner.name || "매장")}</strong><small>${escapeHtml(copy)}</small></button>`;
  }

  function bindGamePulseStoreLinks(box){
    $$("[data-pulse-store]",box).forEach(btn => btn.addEventListener("click",()=>{
      const rawStoreId=String(btn.dataset.pulseStore||"").trim();
      const storeName=String(btn.dataset.pulseName||"").trim();
      const matchedStore = stores.find(store => String(store?.id || "").trim() === rawStoreId)
        || (storeName ? stores.find(store => String(store?.name || "").trim().toLowerCase() === storeName.toLowerCase()) : null);
      const bannerStore = (Array.isArray(config.partner_banners) ? config.partner_banners : [])
        .find(store => String(store?.id || "").trim() === rawStoreId);
      const storeId = String(matchedStore?.id || bannerStore?.id || rawStoreId || "").trim();
      if(storeId) openStoreDetail(storeId, { storeFallback:matchedStore || bannerStore || null });
    }));
  }

  function paintImmediatePartnerBanner(){
    const box=$("#gamePulse");
    if(!box) return;
    const markup=partnerBannerMarkup(currentPartnerBanner());
    if(!markup) return;
    box.innerHTML=markup;
    box.classList.remove("hidden");
    bindGamePulseStoreLinks(box);
  }

  async function loadGamePulse(force=false){
    const box=$("#gamePulse");
    if(!box) return;
    if(!force && Date.now()-gamePulseLoadedAt<RUNTIME.gamePulseCacheMs) return;
    gamePulseLoadedAt=Date.now();

    // Paint the campaign from config immediately. No network request is required
    // before the user can see the store banner.
    const partnerBanner=currentPartnerBanner();
    const immediateMarkup=partnerBannerMarkup(partnerBanner);
    if(immediateMarkup){
      box.innerHTML=immediateMarkup;
      box.classList.remove("hidden");
      bindGamePulseStoreLinks(box);
    }

    let data=null;
    try{
      const result=await sb.rpc("biteboss_game_pulse_v71");
      if(!result.error) data=result.data;
    }catch{}

    const fallbackRetakes=stores
      .filter(s=>Boolean((storeRoleMap.get(String(s.id))||{}).can_retake))
      .slice(0,3)
      .map(s=>({store_id:s.id,store_name:s.name}));
    const fallbackHot=stores
      .filter(s=>s.is_hot||Number(s.challenges_24h||0)>=Number(config.hot_store_challenges_24h||5))
      .sort((left,right)=>localStoreDistance(left)-localStoreDistance(right))
      .slice(0,3)
      .map(s=>({store_id:s.id,store_name:s.name,challenges_24h:s.challenges_24h||0}));

    const retakes=(Array.isArray(data?.retakes)?data.retakes:fallbackRetakes)
      .map(normalizePulseStore).filter(Boolean)
      .filter(row=>!isMyBossStore(stores.find(store=>String(store.id)===String(row.store_id))||{}));
    const serverHot=(Array.isArray(data?.hot)?data.hot:[]).map(normalizePulseStore).filter(Boolean);
    const localHot=fallbackHot.map(normalizePulseStore).filter(Boolean);
    const hot=nearbyHotRows([...serverHot,...localHot])
      .filter(row=>!isMyBossStore(stores.find(store=>String(store.id)===String(row.store_id))||{}));
    const newcomer=data?.new_player_protected===true;

    const items=[];
    if(newcomer){
      items.push(`<div class="game-pulse-item is-guide" role="note"><span class="guide-bulb" aria-hidden="true">💡</span><strong>첫 점령 가이드</strong><small>가까운 미점령 매장부터 시작해 보세요.</small></div>`);
    }
    if(partnerBanner) items.push(partnerBannerMarkup(partnerBanner));
    if(retakes[0]){
      items.push(`<button class="game-pulse-item is-retake" type="button" data-pulse-store="${escapeAttr(retakes[0].store_id)}" data-pulse-name="${escapeAttr(retakes[0].store_name||"")}"><span>RETAKE</span><strong>${escapeHtml(retakes[0].store_name||"빼앗긴 매장")}</strong><small>다시 가져오기</small></button>`);
    }
    if(hot[0]){
      items.push(`<button class="game-pulse-item is-hot" type="button" data-pulse-store="${escapeAttr(hot[0].store_id)}" data-pulse-name="${escapeAttr(hot[0].store_name||"")}"><span class="hot-flame" aria-hidden="true">🔥</span><strong>${escapeHtml(hot[0].store_name||"인기 매장")}</strong><small>가장 치열한 점령지</small></button>`);
    }

    if(!items.length){
      box.innerHTML="";
      box.classList.add("hidden");
      return;
    }
    box.innerHTML=items.join("");
    box.classList.remove("hidden");
    bindGamePulseStoreLinks(box);
  }


  function startPresenceTracking(){
    stopPresenceTracking();
    if(document.hidden || !window.sb) return;
    if(!playerSession?.authenticated){
      presenceBlockedReason = "MEMBER_LOGIN_REQUIRED";
      renderStores();
      return;
    }

    const intervalSeconds = Math.max(5, Number(config.gps_presence_ping_seconds || 10));
    tickPresenceTracking();
    presenceTimer = window.setInterval(tickPresenceTracking, intervalSeconds * 1000);
  }

  function stopPresenceTracking(){
    presenceTimer = clearIntervalRef(presenceTimer);
  }

  async function tickPresenceTracking(){
    if(presenceBusy || document.hidden || !window.sb) return;

    const candidates = stores.filter(store => {
      if(!store?.id) return false;
      if(String(store.partnership_status || "unclaimed") === "partnered") return false;
      if(!Number.isFinite(Number(store.latitude)) || !Number.isFinite(Number(store.longitude))) return false;

      const roleState = storeRoleMap.get(String(store.id)) || {};
      const ownedByMe = isMyBossStore(store);
      const protectionUntil = roleState.protected_until || store.protected_until || null;
      const protectedNow = Boolean(
        protectionUntil &&
        new Date(protectionUntil).getTime() > Date.now()
      );

      if(captureCooldownActive()) return ownedByMe;
      return ownedByMe || !protectedNow;
    });

    if(!candidates.length) return;

    presenceBusy = true;
    try{
      const pos = await getPositionSafe(false);
      if(!pos) return;
      lastPosition = pos;
      pruneDismissedTakeoverStores(pos);
      updateStoreDetailUserLocation(pos);
      void refreshStoresForPosition(pos);

      const accuracy = Number(pos.coords.accuracy || 0);
      const maxAccuracy = Math.max(1, Number(config.max_location_accuracy_m || 100));
      if(accuracy && accuracy > maxAccuracy){
        candidates.forEach(store => presenceState.set(String(store.id), {
          status:"low_accuracy",
          accuracy_m:accuracy,
          required_seconds:Number(config.gps_dwell_seconds || 120),
          remaining_seconds:Number(config.gps_dwell_seconds || 120)
        }));
        if(takeoverUi){
          const activeStore=stores.find(item=>String(item.id)===takeoverUi.storeId)||null;
          if(!activeStore || isMyBossStore(activeStore)) closeTakeoverUi();
          else syncTakeoverUi(activeStore,{status:"low_accuracy",remaining_seconds:currentTakeoverVisualRemaining(),required_seconds:takeoverRequired});
        }
        const activeOwned = candidates.find(store => isMyBossStore(store) && String(store.id) === String(activeStoreDetailId || ""));
        if(activeOwned){
          syncOwnerReclaimPresence(activeOwned.id, {
            status:"low_accuracy",
            required_seconds:Number(config.gps_dwell_seconds || 120),
            remaining_seconds:Number(config.gps_dwell_seconds || 120)
          });
        }
        renderStores();
        return;
      }

      const radius = Math.max(1, Number(config.gps_radius_m || 50));
      const distanceRows = candidates
        .map(store => ({
          store,
          ownedByMe:isMyBossStore(store),
          distance:haversineMeters(
            pos.coords.latitude,
            pos.coords.longitude,
            Number(store.latitude),
            Number(store.longitude)
          )
        }))
        .sort((a,b) => a.distance - b.distance);

      // Only an actually due reclaim should outrank a normal nearby challenge.
      // Resolve current-Boss reclaim state from the authoritative server (cached for 60s)
      // so an owned store still in its 24h cooldown cannot block another valid target.
      const ownedInRadius = distanceRows
        .filter(row => row.ownedByMe && row.distance <= radius)
        .slice(0,5);

      if(ownedInRadius.length){
        await Promise.all(ownedInRadius.map(async row => {
          const cached = getCachedStoreReclaimState(row.store.id);
          let reclaim = cached?.data || null;
          if(!cached?.fresh){
            reclaim = await refreshOwnStoreReclaimState(row.store.id) || reclaim;
          }
          row.reclaim = reclaim;
        }));
      }

      const reclaimTarget = ownedInRadius
        .filter(row => !dismissedTakeoverStores.has(String(row.store.id)) && row.reclaim?.is_boss !== false && (row.reclaim?.eligible === true || Number(row.reclaim?.remaining_seconds || 0) <= 0))
        .sort((a,b) => a.distance - b.distance)[0];

      const challengeRowsInRadius = distanceRows.filter(row =>
        !row.ownedByMe &&
        row.distance <= radius &&
        !dismissedTakeoverStores.has(String(row.store.id))
      );

      let normalTarget = null;
      if(preferredTakeoverStoreId){
        normalTarget = distanceRows.find(row =>
          !row.ownedByMe &&
          String(row.store.id)===preferredTakeoverStoreId &&
          !dismissedTakeoverStores.has(String(row.store.id))
        ) || null;
      }

      if(!normalTarget && challengeRowsInRadius.length===1){
        normalTarget=challengeRowsInRadius[0];
        preferredTakeoverStoreId=String(normalTarget.store.id);
      }else if(!normalTarget && challengeRowsInRadius.length>1 && !reclaimTarget){
        if(openTakeoverChoice(challengeRowsInRadius)) return;
        // Do not silently choose the nearest store while another modal is open.
        return;
      }

      const nearest = reclaimTarget || normalTarget || distanceRows.find(row =>
        row.ownedByMe || !dismissedTakeoverStores.has(String(row.store.id))
      );

      if(!nearest) return;

      const ownedByMe=nearest.ownedByMe;
      if(ownedByMe && takeoverUi?.storeId===String(nearest.store.id) && takeoverUi?.mode!=="reclaim") closeTakeoverUi();

      const nearestId = String(nearest.store.id);
      const withinRadius = nearest.distance <= radius;
      if(withinRadius){
        presenceBoundaryTargetId = nearestId;
        presenceLastInRadiusAt = Date.now();
      }
      const boundaryGraceActive = ownedByMe &&
        !withinRadius &&
        presenceBoundaryTargetId === nearestId &&
        (Date.now() - presenceLastInRadiusAt) <= PRESENCE_BOUNDARY_GRACE_MS;

      if(!withinRadius && !boundaryGraceActive){
        presenceState.set(nearestId, {
          status:"outside",
          distance_m:nearest.distance,
          required_seconds:Number(config.gps_dwell_seconds || 120),
          remaining_seconds:Number(config.gps_dwell_seconds || 120)
        });
        if(ownedByMe){
          const outsideState={
            status:"outside",
            mode:"reclaim",
            distance_m:nearest.distance,
            required_seconds:Number(config.gps_dwell_seconds || 120),
            remaining_seconds:Number(config.gps_dwell_seconds || 120)
          };
          syncOwnerReclaimPresence(nearest.store.id, outsideState);
          if(nearest.reclaim?.eligible === true || Number(nearest.reclaim?.remaining_seconds || 0) <= 0){
            syncTakeoverUi(nearest.store,outsideState);
          }
        }else if(takeoverUi?.storeId===nearestId){
          syncTakeoverUi(nearest.store,{status:"hold",reason:"OUTSIDE",remaining_seconds:currentTakeoverVisualRemaining(),required_seconds:takeoverRequired});
        }
        renderStores();
        return;
      }

      // Already-owned stores still send the presence ping so defense/visit records
      // remain intact, but they never create a takeover session or takeover UI.
      const takeoverSession = ownedByMe ? null : await pingTakeoverSession(nearest.store, pos);
      if(takeoverSession?.reason === "CAPTURE_COOLDOWN"){
        captureCooldown={active:true,cooldown_until:takeoverSession.cooldown_until,loaded_at:Date.now()};
        if(takeoverUi?.storeId===String(nearest.store.id)) closeTakeoverUi();
        updateChallengeCommand(stores);
        return;
      }
      if(takeoverSession?.ok && takeoverSession.status === "cancelled"){
        presenceState.set(String(nearest.store.id), takeoverSession);
        if(takeoverUi?.storeId===String(nearest.store.id)){
          syncTakeoverUi(nearest.store,{
            ...takeoverSession,
            required_seconds:takeoverRequired || takeoverFallbackSeconds(),
            remaining_seconds:currentTakeoverVisualRemaining()
          });
        }
        renderStores();
        return;
      }

      const hadOrganizationBeforeChallenge = Boolean(String(organization?.id || "").trim());

      const { data, error } = await sb.rpc("biteboss_presence_ping_v7546", {
        p_store_id:nearest.store.id,
        p_lat:pos.coords.latitude,
        p_lng:pos.coords.longitude,
        p_accuracy_m:Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : null
      });

      if(error){
        console.warn("BiteBoss presence:", error);
        // Keep the last authoritative dwell clock on transient network failures.
        // The server session grace window handles the missed ping when connectivity returns.
        return;
      }

      if(!data?.eligible){
        presenceBlockedReason = String(data?.reason || "");
        if(presenceBlockedReason === "MEMBER_LOGIN_REQUIRED") stopPresenceTracking();
        const blockedPresence = {
          status:data?.status || "blocked",
          mode:ownedByMe ? "reclaim" : String(takeoverSession?.mode || takeoverModeFromStore(nearest.store)),
          required_seconds:Number(data?.required_seconds || config.gps_dwell_seconds || 120),
          remaining_seconds:Number(data?.remaining_seconds || config.gps_dwell_seconds || 120),
          distance_m:Number(data?.distance_m || nearest.distance)
        };
        presenceState.set(String(nearest.store.id), blockedPresence);
        if(ownedByMe && String(data?.reason || "") === "OWN_STORE_RECLAIM_COOLDOWN"){
          const reclaimData = {
            is_boss:true,
            eligible:false,
            available_at:data?.reclaim_available_at || null,
            remaining_seconds:Number(data?.reclaim_remaining_seconds || 0)
          };
          storeReclaimCache.set(String(nearest.store.id), { data:reclaimData, fetchedAt:Date.now() });
          if(String(activeStoreDetailId || "") === String(nearest.store.id)) applyOwnerReclaimState(reclaimData);
          if(takeoverUi?.storeId===String(nearest.store.id) && takeoverUi?.mode==="reclaim") closeTakeoverUi();
        }else if(ownedByMe){
          syncOwnerReclaimPresence(nearest.store.id, blockedPresence);
        }
        renderStores();
        return;
      }

      presenceBlockedReason = "";
      const presenceClock = {
        status:String(data?.status || "tracking"),
        mode:String(data?.mode || takeoverSession?.mode || (ownedByMe ? "reclaim" : takeoverModeFromStore(nearest.store))),
        required_seconds:Number(data?.required_seconds || config.gps_dwell_seconds || 120),
        remaining_seconds:Number(data?.remaining_seconds ?? data?.required_seconds ?? config.gps_dwell_seconds ?? 120),
        elapsed_seconds:Number(data?.elapsed_seconds || 0),
        distance_m:Number(data?.distance_m || nearest.distance)
      };

      // Single authoritative clock: the countdown the user sees is the same
      // server presence/dwell clock that can actually complete the capture.
      if(ownedByMe){
        syncOwnerReclaimPresence(nearest.store.id, presenceClock);
        if(!takeoverCancelledLocally && !["boss_visit","boss_reclaim"].includes(presenceClock.status)){
          syncTakeoverUi(nearest.store,{...presenceClock,mode:"reclaim"});
        }
      }else if(!takeoverCancelledLocally && !["claimed","crew","boss_visit","boss_reclaim"].includes(presenceClock.status)){
        syncTakeoverUi(nearest.store,presenceClock);
      }
      presenceState.set(String(nearest.store.id), presenceClock);

      if(["claimed","crew","boss_visit","boss_reclaim"].includes(String(data?.status || ""))){
        const outcomeStatus=String(data?.status || "");
        const outcome=String(data?.outcome || "");
        if(outcomeStatus === "claimed" || outcomeStatus === "boss_visit" || outcomeStatus === "boss_reclaim") markStoreOwnedLocally(nearest.store);
        if(outcome === "boss_reclaim" || outcomeStatus === "boss_reclaim"){
          applyOptimisticReclaimCompletion(nearest.store.id, data?.reclaimed_at);
        }
        presenceState.delete(String(nearest.store.id));
        dismissedTakeoverStores.delete(String(nearest.store.id));
        if(preferredTakeoverStoreId===String(nearest.store.id)) preferredTakeoverStoreId="";
        if(presenceBoundaryTargetId === String(nearest.store.id)){
          presenceBoundaryTargetId = "";
          presenceLastInRadiusAt = 0;
        }
        if(takeoverUi?.storeId===String(nearest.store.id)){
          setTakeoverCountDisplay(String(data?.status||"")==="crew" ? "HOLD" : "BOSS");
          const status=$("#takeoverStatus");
          if(status) status.textContent=String(data?.status||"")==="crew" ? "도전 결과를 확인하세요." : (String(data?.status||"")==="boss_reclaim" ? `${nearest.store.name||"매장"} 재점령 완료` : `${nearest.store.name||"매장"} 점령 완료`);
          closeTakeoverUi(900);
        }
        showChallengeOutcome({
          ...data,
          store_name:data?.store_name || nearest.store.name || "매장",
          had_organization_before:hadOrganizationBeforeChallenge
        });
        await Promise.all([
          loadCaptureCooldownStatus(true),
          loadStores(),
          loadHome(),
          loadMyOrganization()
        ]);
        if(String(activeStoreDetailId || "") === String(nearest.store.id))
          await openStoreDetail(nearest.store.id, { preserveModal:true, showStoreManagerCard:false });
        return;
      }

      renderStores();
    }finally{
      presenceBusy = false;
    }
  }

  function updateStoreListReclaimCountdowns(){
    let active = false;
    $$("#storeList [data-store-reclaim-at]").forEach(node => {
      const availableAt = String(node.dataset.storeReclaimAt || "").trim();
      if(!availableAt) return;
      const remaining = getOwnStoreReclaimRemainingSeconds(availableAt);
      node.textContent = `재점령 ${formatOwnStoreReclaim(availableAt)}`;
      if(remaining !== null && remaining > 0) active = true;
    });
    if(!active) storeListReclaimTimer = clearIntervalRef(storeListReclaimTimer);
    return active;
  }

  function startStoreListReclaimCountdowns(){
    storeListReclaimTimer = clearIntervalRef(storeListReclaimTimer);
    if(updateStoreListReclaimCountdowns())
      storeListReclaimTimer = window.setInterval(updateStoreListReclaimCountdowns, 1000);
  }

  function formatPresenceSeconds(value){
    const seconds = Math.max(0, Math.ceil(Number(value || 0)));
    const minutes = Math.floor(seconds / 60);
    const rest = seconds % 60;
    if(minutes <= 0) return `${rest}초`;
    return `${minutes}:${String(rest).padStart(2, "0")}`;
  }

  function haversineMeters(lat1, lng1, lat2, lng2){
    const toRad = value => value * Math.PI / 180;
    const earth = 6371000;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a = Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return earth * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(Math.max(0, 1 - a)));
  }

  function syncTerritoryMapVisibility(){
    const section = $("#territoryMapSection");
    if(!section) return;
    section.classList.toggle("hidden", currentRank !== "territory");
  }

  async function loadTerritoryMap(){
    const section = $("#territoryMapSection");
    const mapEl = $("#territoryMap");
    const summaryEl = $("#territoryMapSummary");

    if(!section || !mapEl) return;
    section.classList.remove("hidden");

    if(summaryEl) summaryEl.textContent = "점령지 불러오는 중…";
    if(!window.L && !await ensureRuntimeDependency("leaflet")){
      if(summaryEl) summaryEl.textContent = "지도를 불러올 수 없습니다";
      return;
    }

    const { data, error } = await sb.rpc("biteboss_territory_map");

    if(error){
      console.warn("BiteBoss territory map:", error);
      if(summaryEl) summaryEl.textContent = "점령지 지도를 불러오지 못했습니다";
      return;
    }

    territoryMapRows = Array.isArray(data) ? data : [];

    const currentPosition = await getPositionSafe(false);
    const currentLat = Number(currentPosition?.coords?.latitude);
    const currentLng = Number(currentPosition?.coords?.longitude);
    const hasCurrentPosition = Number.isFinite(currentLat) && Number.isFinite(currentLng);

    if(hasCurrentPosition){
      territoryMapRows = [...territoryMapRows].sort((a,b) => {
        const aLat = Number(a.latitude);
        const aLng = Number(a.longitude);
        const bLat = Number(b.latitude);
        const bLng = Number(b.longitude);
        const aDistance = Number.isFinite(aLat) && Number.isFinite(aLng)
          ? haversineMeters(currentLat,currentLng,aLat,aLng)
          : Number.POSITIVE_INFINITY;
        const bDistance = Number.isFinite(bLat) && Number.isFinite(bLng)
          ? haversineMeters(currentLat,currentLng,bLat,bLng)
          : Number.POSITIVE_INFINITY;
        return aDistance - bDistance;
      });
    }

    if(!territoryMap){
      territoryMap = L.map(mapEl, {
        zoomControl:true,
        attributionControl:true,
        preferCanvas:true
      });

      L.tileLayer(
        "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
        {
          maxZoom:19,
          subdomains:"abc",
          attribution:'&copy; OpenStreetMap contributors'
        }
      ).addTo(territoryMap);

      territoryMapLayer = L.layerGroup().addTo(territoryMap);
      territoryUserLayer = L.layerGroup().addTo(territoryMap);

      territoryMap.on("popupopen", event => {
        const node = event.popup?.getElement?.();
        const button = node?.querySelector?.("[data-map-store]");
        if(!button) return;

        button.onclick = () => {
          const storeId = button.dataset.mapStore;
          territoryMap.closePopup();
          if(storeId) openStoreDetail(storeId);
        };
      });
    }

    territoryMapLayer.clearLayers();
    territoryUserLayer?.clearLayers();

    if(hasCurrentPosition && territoryUserLayer){
      const userMarker = L.circleMarker([currentLat,currentLng], {
        radius:7,
        weight:3,
        color:"#ffffff",
        fillColor:"#111111",
        fillOpacity:1
      });
      userMarker.bindTooltip("내 위치", {
        permanent:false,
        direction:"top",
        offset:[0,-6]
      });
      userMarker.addTo(territoryUserLayer);
    }

    const bounds = [];
    const orgIds = new Set();

    territoryMapRows.forEach(row => {
      const lat = Number(row.latitude);
      const lng = Number(row.longitude);
      if(!Number.isFinite(lat) || !Number.isFinite(lng)) return;

      bounds.push([lat,lng]);
      if(row.organization_id) orgIds.add(String(row.organization_id));

      const protectedNow = Boolean(
        row.protected_until &&
        new Date(row.protected_until).getTime() > Date.now()
      );

      const rowOrganizationId = String(row.organization_id || row.crew_id || "").trim();
      const myOrganizationId = String(organization?.id || "").trim();
      const mine = Boolean(
        row.is_my_organization ||
        (rowOrganizationId && myOrganizationId && rowOrganizationId === myOrganizationId)
      );
      const distanceMeters = hasCurrentPosition
        ? haversineMeters(currentLat,currentLng,lat,lng)
        : null;
      const distanceLabel = Number.isFinite(distanceMeters)
        ? (distanceMeters < 1000
          ? `${Math.round(distanceMeters)}m`
          : `${(distanceMeters / 1000).toFixed(1)}km`)
        : "";

      const marker = L.circleMarker([lat,lng], {
        radius:mine ? 8 : 6,
        weight:mine ? 3 : 2,
        color:"#ffffff",
        fillColor:mine ? "#d72f38" : "#c8c8cc",
        fillOpacity:mine ? 1 : 0.95
      });

      marker.bindPopup(`
        <div class="territory-map-popup">
          <span>${escapeHtml(row.organization_name || "크루")}</span>
          <strong>${escapeHtml(row.store_name || "매장")}</strong>
          <p>${escapeHtml(row.boss_name || "보스")} · 방어력 ${Number(row.boss_defense || 0)}${distanceLabel ? ` · ${escapeHtml(distanceLabel)}` : ""}</p>
          <small>${protectedNow ? `보호 ${escapeHtml(formatRemaining(row.protected_until))} 남음` : "도전 가능"}</small>
          <button type="button" data-map-store="${escapeAttr(row.store_id)}">Open store</button>
        </div>
      `, {
        closeButton:false,
        offset:[0,-2]
      });

      marker.addTo(territoryMapLayer);
    });

    if(summaryEl){
      const myOrganizationId = String(organization?.id || "").trim();
      const myTerritoryCount = territoryMapRows.filter(row => {
        const rowOrganizationId = String(row.organization_id || row.crew_id || "").trim();
        return Boolean(row.is_my_organization || (myOrganizationId && rowOrganizationId === myOrganizationId));
      }).length;
      summaryEl.textContent = myOrganizationId
        ? `${territoryMapRows.length}개 매장 · 내 크루 ${myTerritoryCount}개`
        : `${territoryMapRows.length}개 매장 · ${orgIds.size}개 크루`;
    }

    requestAnimationFrame(() => {
      territoryMap.invalidateSize();

      if(hasCurrentPosition){
        territoryMap.setView([currentLat,currentLng],15,{
          animate:false
        });
      }else if(bounds.length === 1){
        territoryMap.setView(bounds[0],15);
      }else if(bounds.length > 1){
        territoryMap.fitBounds(bounds,{
          padding:[28,28],
          maxZoom:15
        });
      }else{
        territoryMap.setView([37.5665,126.9780],11);
      }
    });
  }


  function rankingPlayerName(row = {}){
    const nickname = String(row?.nickname || "").trim();
    if(nickname && nickname !== "사용자") return nickname;

    const seed = String(row?.user_id || row?.username || "").trim();
    return generateDefaultNickname(seed || "biteboss-player");
  }

  function renderRankPage(){
    const box = $("#rankList");
    if(!box) return;
    const view = pageSlice(rankViewItems, rankPage, RANK_PAGE_SIZE);
    rankPage = view.page;
    box.innerHTML = view.rows.join("") || `<div class="app-state">표시할 순위가 없습니다.</div>`;
    renderPagination("#rankPagination", rankPage, rankViewItems.length, RANK_PAGE_SIZE, nextPage => {
      rankPage = nextPage;
      renderRankPage();
      window.scrollTo({ top:0, behavior:"smooth" });
    });
  }

  function setRankItems(items, emptyText){
    rankViewItems = Array.isArray(items) ? items : [];
    rankPage = 1;
    if(!rankViewItems.length){
      const box = $("#rankList");
      if(box) box.innerHTML = `<div class="app-state">${escapeHtml(emptyText || "표시할 순위가 없습니다.")}</div>`;
      const nav = $("#rankPagination");
      nav?.classList.add("hidden");
      if(nav) nav.innerHTML = "";
      return;
    }
    renderRankPage();
  }

  async function filterActivePlayerRankRows(rows){
    const source = Array.isArray(rows) ? rows : [];
    const ids = [...new Set(source.map(row => String(row?.user_id || "").trim()).filter(Boolean))];
    if(!ids.length) return [];

    try{
      const { data, error } = await sb.rpc("biteboss_active_player_ids_v7520", { p_user_ids:ids });
      if(error){
        const message = String(error.message || "");
        if(!message.includes("biteboss_active_player_ids_v7520")) console.warn("BiteBoss active ranking players:", error);
        return source;
      }
      const activeIds = new Set((Array.isArray(data) ? data : []).map(value => String(value || "")));
      return source.filter(row => activeIds.has(String(row?.user_id || "")));
    }catch(error){
      console.warn("BiteBoss active ranking players:", error);
      return source;
    }
  }

  function crewLeaderName(row = {}, members = []){
    const direct = [row.leader_name, row.founder_name, row.founder_nickname]
      .map(value => String(value || "").trim())
      .find(Boolean);
    if(direct) return direct;

    const leader = (Array.isArray(members) ? members : []).find(member =>
      String(member?.role || "").toLowerCase() === "leader"
    );
    return String(leader?.nickname || leader?.username || "").trim();
  }

  async function hydrateCrewLeaderNames(rows = [], idKeys = ["id"]){
    const source = Array.isArray(rows) ? rows : [];
    const missingIds = [...new Set(source
      .filter(row => !crewLeaderName(row))
      .map(row => idKeys.map(key => String(row?.[key] || "").trim()).find(Boolean) || "")
      .filter(Boolean))];
    if(!missingIds.length) return source;

    try{
      const { data, error } = await sb.rpc("biteboss_crew_leader_names_v8167", {
        p_organization_ids:missingIds
      });
      if(error) throw error;
      const names = new Map((Array.isArray(data) ? data : []).map(row => [
        String(row.organization_id || ""),
        String(row.leader_name || "").trim()
      ]));
      return source.map(row => {
        if(crewLeaderName(row)) return row;
        const id = idKeys.map(key => String(row?.[key] || "").trim()).find(Boolean) || "";
        const leaderName = names.get(id) || "";
        return leaderName ? {...row, leader_name:leaderName, founder_name:leaderName} : row;
      });
    }catch(error){
      console.warn("BiteBoss crew leader names:", error);
      return source;
    }
  }

  function crewMetaMarkup(row = {}, members = []){
    const leaderName = crewLeaderName(row, members);
    const memberCount = Number(row.member_count || 0);
    return escapeHtml([leaderName ? `개설자 ${leaderName}` : "", `멤버 ${memberCount}명`].filter(Boolean).join(" · "));
  }

  function syncRankPeriodVisibility(){
    const periods = $("#rankPeriodTabs");
    if(!periods) return;
    const supported = currentRank === "players" || currentRank === "organizations";
    periods.classList.toggle("hidden", !supported);
    const activePeriod = normalizeRankPeriod(currentRankPeriod);
    $$('[data-rank-period]').forEach(button => {
      button.classList.toggle("active", button.dataset.rankPeriod === activePeriod);
      button.setAttribute("aria-pressed", button.dataset.rankPeriod === activePeriod ? "true" : "false");
    });
  }

  async function loadRank(){
    const box = $("#rankList");
    const myBox = $("#myRankSummary");
    if(!box) return;

    syncTerritoryMapVisibility();
    const requestedRank = currentRank;
    const requestSeq = ++rankLoadSeq;
    const isCurrentRequest = () => requestSeq === rankLoadSeq && requestedRank === currentRank;
    const commitRankView = ({ hideMyRank = true } = {}) => {
      if(!isCurrentRequest()) return false;
      if(hideMyRank) myBox?.classList.add("hidden");
      return true;
    };

    if(config.feature_ranking === false){
      if(commitRankView()) box.innerHTML = `<div class="app-state">순위 기능이 현재 비활성화되어 있습니다.</div>`;
      return;
    }

    // Keep the previous tab visible while the next ranking is fetched.
    // Replacing it with a temporary loading row caused a visible one-frame flash.

    if(requestedRank === "local_crew"){
      const position = lastPosition || await getPositionSafe(false, { timeout:2500, maximumAge:60000 });
      if(!isCurrentRequest()) return;
      if(!position){
        commitRankView();
        box.innerHTML = `<div class="app-state"><strong>위치 권한이 필요합니다.</strong><span>현재 위치를 허용하면 주변 크루 순위를 볼 수 있습니다.</span></div>`;
        return;
      }

      const { data, error } = await sb.rpc("biteboss_local_crew_rank_v660", {
        p_lat:Number(position.coords.latitude),
        p_lng:Number(position.coords.longitude),
        p_radius_km:5,
        p_limit:30
      });
      if(!isCurrentRequest()) return;

      if(error){
        commitRankView();
        console.warn("BiteBoss local crew ranking:", error);
        box.innerHTML = `<div class="app-state is-error">주변 크루 순위를 불러오지 못했습니다.</div>`;
        return;
      }

      let rows = Array.isArray(data) ? data : [];
      rows = await hydrateCrewLeaderNames(rows, ["crew_id", "id"]);
      if(!isCurrentRequest()) return;
      if(!commitRankView()) return;
      setRankItems(rows.map((row,index)=>`
          <article class="rank-card local-crew-rank-card">
            <span class="rank-number">${index+1}</span>
            <span
              class="rank-avatar-slot crew-rank-profile-trigger"
              data-organization-profile="${escapeAttr(row.crew_id || "")}"
              role="button"
              tabindex="0"
              aria-label="${escapeAttr(row.crew_name || "크루")} 크루 프로필 열기">
              ${bossAvatarMarkup(row.avatar_url || "", row.crew_name || "크루", "crew-rank-avatar")}
            </span>
            <div class="rank-copy crew-rank-copy">
              <strong
                class="rank-title crew-rank-name-link crew-rank-profile-trigger"
                data-organization-profile="${escapeAttr(row.crew_id || "")}"
                role="button"
                tabindex="0">${escapeHtml(row.crew_name || "크루")}</strong>
              <div class="rank-meta meta">${crewMetaMarkup(row)}</div>
            </div>
            <div class="rank-result">
              <b>${Number(row.territory_count || 0)}</b>
              <span>점령지</span>
            </div>
          </article>
        `), "주변에 점령지를 가진 크루가 아직 없습니다.");
      return;
    }

    const period = normalizeRankPeriod(currentRankPeriod);
    const usePeriodRanking = requestedRank === "players" || requestedRank === "organizations";
    const rankingRequest = usePeriodRanking
      ? sb.rpc("biteboss_period_rank_v8160", { p_scope:requestedRank, p_period:period, p_limit:50 })
      : sb.rpc("biteboss_game_rankings_v656", { p_scope:requestedRank, p_limit:50 });
    const { data, error } = await rankingRequest;
    if(!isCurrentRequest()) return;

    if(error){
      commitRankView();
      console.warn("BiteBoss ranking:", error);
      box.innerHTML = `<div class="app-state is-error">순위를 불러오지 못했습니다.</div>`;
      return;
    }

    let rows = Array.isArray(data) ? data : [];
    if(requestedRank === "organizations"){
      rows = await hydrateCrewLeaderNames(rows, ["id"]);
      if(!isCurrentRequest()) return;
    }

    if(requestedRank === "organizations"){
      if(!commitRankView()) return;
      const myOrganizationId = String(organization?.id || "").trim();
      const myOrganizationIndex = myOrganizationId
        ? rows.findIndex(row => String(row.id || "").trim() === myOrganizationId)
        : -1;

      if(myBox && myOrganizationId){
        const me = myOrganizationIndex >= 0 ? rows[myOrganizationIndex] : organization;
        const myCrewName = String(me?.name || organization?.name || "내 크루").trim();
        const myCrewAvatar = String(me?.avatar_url || organization?.avatar_url || "").trim();
        const myCrewLeader = crewLeaderName(me, organizationMembers)
          || crewLeaderName(organization, organizationMembers)
          || (organization?.is_leader ? String(profile?.nickname || "").trim() : "");
        const myCrewMembers = Number(me?.member_count ?? organization?.member_count ?? 0);
        const myCrewTerritories = Number(me?.territory_count ?? organization?.territory_count ?? 0);

        myBox.innerHTML=`
          <strong class="my-rank-position ${myOrganizationIndex < 0 ? "is-out" : ""}">${myOrganizationIndex >= 0 ? myOrganizationIndex + 1 : "–"}</strong>
          <span
            class="crew-rank-profile-trigger"
            data-organization-profile="${escapeAttr(myOrganizationId)}"
            role="button"
            tabindex="0"
            aria-label="${escapeAttr(myCrewName)} 크루 프로필 열기">
            ${bossAvatarMarkup(myCrewAvatar, myCrewName, "my-rank-avatar")}
          </span>
          <div class="my-rank-copy">
            <b
              class="crew-rank-profile-trigger"
              data-organization-profile="${escapeAttr(myOrganizationId)}"
              role="button"
              tabindex="0">${escapeHtml(myCrewName)}</b>
            <small>${escapeHtml([myCrewLeader ? `개설자 ${myCrewLeader}` : "", `멤버 ${myCrewMembers}명`, usePeriodRanking ? `활동 ${Number(me?.score || 0)}` : `점령지 ${myCrewTerritories}`].filter(Boolean).join(" · "))}</small>
          </div>
          <span class="my-rank-label">${myOrganizationIndex >= 0 ? "내 크루" : "50위 밖"}</span>`;
        myBox.classList.remove("hidden");
      }

      setRankItems(rows.map((row,index)=>`
        <article class="rank-card organization-rank-card">
          <span class="rank-number">${index+1}</span>
          <span
            class="rank-avatar-slot crew-rank-profile-trigger"
            data-organization-profile="${escapeAttr(row.id || "")}"
            role="button"
            tabindex="0"
            aria-label="${escapeAttr(row.name || "크루")} 크루 프로필 열기">
            ${bossAvatarMarkup(row.avatar_url || "", row.name || "크루", "crew-rank-avatar")}
          </span>
          <div class="rank-copy crew-rank-copy">
            <strong
              class="rank-title crew-rank-name-link crew-rank-profile-trigger"
              data-organization-profile="${escapeAttr(row.id || "")}"
              role="button"
              tabindex="0">${escapeHtml(row.name || "크루")}</strong>
            <div class="rank-meta meta">${crewMetaMarkup(row)}</div>
          </div>
          <div class="rank-result">
            <b>${Number(usePeriodRanking ? row.score : (row.territory_count || 0)).toLocaleString("ko-KR")}</b>
            <span>${usePeriodRanking ? "활동" : "점령지"}</span>
          </div>
        </article>
      `), "아직 크루 순위가 없습니다.");
      return;
    }

    if(requestedRank === "territory"){
      if(!commitRankView()) return;
      syncTerritoryMapVisibility();
      loadTerritoryMap();
      setRankItems(rows.map((row,index)=>{
        const area=[row.city,row.district].filter(Boolean).join(" ");
        return `
          <article class="rank-card territory-rank-card">
            <span class="rank-number">${index+1}</span>
            <div>
              <strong>${escapeHtml(area || "지역 정보 없음")}</strong>
              <div class="meta">${escapeHtml(row.organization_name || "크루")}</div>
            </div>
            <div class="rank-result">
              <b>${Number(row.store_count || 0)}</b>
              <span>매장</span>
            </div>
          </article>`;
      }), "아직 현재 점령 순위가 없습니다.");
      return;
    }

    // Ranking rows use BiteBoss's stable logical player ID.
    // A member login can run on top of a different anonymous Supabase auth ID,
    // so authUser.id must not be used as the primary identity here.
    rows = await filterActivePlayerRankRows(rows);
    if(!commitRankView()) return;

    const myId=String(
      playerSession?.player_user_id ||
      profile?.user_id ||
      authUser?.id ||
      ""
    );
    const myIndex=rows.findIndex(row=>String(row.user_id || "")===myId);
    if(myBox && myIndex>=0){
      const me=rows[myIndex];
      const myAvatar=String(profile?.avatar_url || me.avatar_url || "").trim();
      const myCrewName=String(me.organization_name || organization?.name || "").trim();
      const myRankMeta=[myCrewName, `BOSS ${Number(me.boss_count || 0)}`].filter(Boolean).join(" · ");
      myBox.innerHTML=`
        <strong class="my-rank-position">${myIndex+1}</strong>
        ${bossAvatarMarkup(myAvatar, rankingPlayerName(me) || "나", "my-rank-avatar")}
        <div class="my-rank-copy">
          <b>${escapeHtml(rankingPlayerName(me) || profile?.nickname || playerSession?.nickname || "나")}</b>
          <small>${escapeHtml(myRankMeta)} · Lv ${Number(me.level || 1)}</small>
        </div>
        <span class="my-rank-label">내 순위</span>`;
      myBox.classList.remove("hidden");
    }else if(myBox && playerSession?.authenticated){
      const myAvatar=String(profile?.avatar_url || "").trim();
      myBox.innerHTML=`
        <strong class="my-rank-position is-out">–</strong>
        ${bossAvatarMarkup(myAvatar, profile?.nickname || playerSession?.nickname || "나", "my-rank-avatar")}
        <div class="my-rank-copy">
          <b>${escapeHtml(profile?.nickname || playerSession?.nickname || "나")}</b>
          <small>현재 상위 50명 목록에는 표시되지 않습니다.</small>
        </div>
        <span class="my-rank-label">50위 밖</span>`;
      myBox.classList.remove("hidden");
    }

    setRankItems(rows.map((row,index)=>{
      const rowIsMe = String(row.user_id || "") === myId;
      const playerName=rankingPlayerName(row);
      const crewName=String(row.organization_name || "").trim();
      const rankMeta=[crewName, `BOSS ${Number(row.boss_count || 0)}`].filter(Boolean).join(" · ");
      const personalAvatar = rowIsMe
        ? String(profile?.avatar_url || row.avatar_url || "").trim()
        : String(row.avatar_url || "").trim();
      return `
        <article
          class="rank-card player-rank-card ${rowIsMe ? "is-me" : ""}"
          data-player-profile="${escapeAttr(row.user_id || "")}"
          data-player-avatar="${escapeAttr(personalAvatar)}">
          <span class="rank-number">${index+1}</span>
          <span class="rank-avatar-slot">${bossAvatarMarkup(personalAvatar, playerName, "rank-player-avatar")}</span>
          <div class="rank-copy rank-player-copy">
            <strong class="rank-title">${escapeHtml(playerName)}</strong>
            <div class="rank-meta meta">${escapeHtml(rankMeta)}</div>
          </div>
          <div class="rank-result">
            <b>${Number(usePeriodRanking ? row.score : (row.xp || 0)).toLocaleString("ko-KR")}</b>
            <span>${usePeriodRanking ? "활동" : "XP"}</span>
          </div>
        </article>`;
    }), "아직 사용자 순위가 없습니다.");
  }

  async function loadAlerts(){
    const box = $("#alertsList");
    if(!box) return;

    if(config.feature_offers === false){
      updateAlertMeter(0);
      box.innerHTML = `<div class="timeline-item muted">매장 소식 기능이 현재 비활성화되어 있습니다.</div>`;
      return;
    }

    const { data, error } = await sb.rpc("biteboss_active_offers", {
      p_limit:20
    });

    if(error){
      console.warn("BiteBoss offers:", error);
      updateAlertMeter(0);
      box.innerHTML = `<div class="app-state is-error">매장 소식을 불러오지 못했습니다.</div>`;
      return;
    }

    const rows = Array.isArray(data) ? data : [];
    updateAlertMeter(rows.length);

    box.innerHTML = rows.map(item => {
      const place = [item.city,item.district].filter(Boolean).join(" ");
      const role = String(item.minimum_role || "visitor");
      const audience = role === "boss" ? "보스 전용" : role === "crew" ? "크루 + 보스" : "모두 사용";
      const eligible = item.eligible !== false;

      return `
        <article class="timeline-item offer-feed-item ${eligible ? "" : "is-locked"}">
          <strong>${escapeHtml(item.title)}</strong>
          <div class="meta">${escapeHtml(item.store_name || "BiteBoss")}${place ? ` · ${escapeHtml(place)}` : ""} · ${escapeHtml(audience)}</div>
          ${item.description ? `<p>${escapeHtml(item.description)}</p>` : ""}
          ${eligible ? "" : `<small>${role === "boss" ? "보스가 되면 사용할 수 있습니다" : "크루가 되면 사용할 수 있습니다"}</small>`}
        </article>
      `;
    }).join("") || `<div class="app-state">아직 새로운 매장 소식이 없습니다.</div>`;
  }

  async function scanPrompt(){
    if(!playerSession?.authenticated) return openMemberLogin();
    if(!window.Html5Qrcode && !await ensureRuntimeDependency("scanner")){
      toast("QR 스캐너를 불러오지 못했습니다.");
      return;
    }
    openModal("QR 스캔", `
      <div class="scan-direct">
        <div id="qrReader" class="scanner-box"></div>
        <p id="scannerHint" class="scanner-hint">매장 또는 크루 QR을 화면 안에 맞춰주세요.</p>
        <button id="scannerRetry" class="secondary-btn hidden" type="button">다시 시도</button>
      </div>
    `);

    requestAnimationFrame(() => startScanner());
  }

  async function startScanner(){
    if(!window.Html5Qrcode){
      return toast("QR 스캐너를 불러오지 못했습니다.");
    }

    try{
      scanner = new Html5Qrcode("qrReader");
      await scanner.start(
        { facingMode:"environment" },
        { fps:10, qrbox:{ width:240, height:240 } },
        async decodedText => {
          await stopScanner();
          closeModal();
          await handleScannedQr(decodedText);
        }
      );

      const hint = $("#scannerHint");
      if(hint) hint.textContent = "QR을 인식하는 중입니다…";
    }catch(error){
      console.warn(error);
      const hint = $("#scannerHint");
      if(hint) hint.textContent = "카메라 권한을 허용한 뒤 다시 시도해주세요.";
      const retry = $("#scannerRetry");
      if(retry){
        retry.classList.remove("hidden");
        retry.onclick = async () => {
          retry.classList.add("hidden");
          if(hint) hint.textContent = "카메라를 여는 중입니다…";
          await startScanner();
        };
      }
    }
  }

  async function stopScanner(){
    if(!scanner) return;
    try{ await scanner.stop(); }catch{}
    try{ await scanner.clear(); }catch{}
    scanner = null;
  }

  function extractCrewInviteToken(raw){
    const value = String(raw || "").trim();
    if(!value) return "";

    if(value.startsWith("BITEBOSS:CREW:")){
      return value.slice("BITEBOSS:CREW:".length).trim();
    }

    try{
      const parsed = new URL(value, location.origin);
      return String(parsed.searchParams.get("crew_invite") || "").trim();
    }catch{
      return "";
    }
  }

  async function handleScannedQr(decodedText){
    const crewToken = extractCrewInviteToken(decodedText);
    if(crewToken){
      await previewCrewInvite(crewToken);
      return;
    }

    await claimByQrToken(extractToken(decodedText));
  }

  async function handleCrewInviteParam(){
    const url = new URL(location.href);
    const token = String(url.searchParams.get("crew_invite") || "").trim();
    if(!token) return;

    url.searchParams.delete("crew_invite");
    const next = `${url.pathname}${url.search}${url.hash}`;
    history.replaceState({}, "", next || location.pathname);

    await previewCrewInvite(token);
  }

  function publicAppBaseUrl(){
    const configured = String(cfg.publicAppUrl || "").trim();
    if(configured){
      try{
        const url = new URL(configured);
        if(url.protocol === "https:" || url.protocol === "http:") return url;
      }catch{}
    }

    if(location.protocol === "https:" || location.protocol === "http:"){
      const url = new URL(location.href);
      url.search = "";
      url.hash = "";
      return url;
    }

    return null;
  }

  function crewInviteShareUrl(token){
    const base = publicAppBaseUrl();
    if(!base){
      // In native builds without a public HTTPS URL, keep the QR usable
      // inside BiteBoss instead of producing an invalid capacitor:// link.
      return `BITEBOSS:CREW:${String(token || "").trim()}`;
    }

    base.searchParams.set("crew_invite", String(token || "").trim());
    return base.toString();
  }

  async function previewCrewInvite(token){
    const cleanToken = String(token || "").trim();
    if(!cleanToken) return toast("유효한 크루 초대 QR이 아닙니다.");

    pendingCrewInviteToken = cleanToken;

    try{
      const { data, error } = await sb.rpc("biteboss_preview_crew_qr_invite_v624", {
        p_token:cleanToken
      });
      if(error) throw error;

      if(!data?.ok){
        const message = ({
          INVITE_NOT_FOUND:"유효하지 않은 크루 초대 QR입니다.",
          INVITE_EXPIRED:"만료된 크루 초대 QR입니다.",
          INVITE_REVOKED:"취소된 크루 초대 QR입니다.",
          INVITE_EXHAUSTED:"사용 가능한 인원이 모두 찬 크루 초대 QR입니다."
        })[data?.error] || "크루 초대 정보를 확인하지 못했습니다.";
        toast(message);
        return;
      }

      const canJoin = data.can_join === true;
      const reason = String(data.join_error || "");
      const founder = data.founder_nickname || "Founder";
      const remaining = Math.max(0, Number(data.remaining_uses || 0));
      const memberCount = Number(data.member_count || 0);
      const territoryCount = Number(data.territory_count || 0);
      const expires = data.expires_at ? formatRemaining(data.expires_at) : "-";

      let actionHtml = "";
      if(canJoin){
        actionHtml = `<button id="crewQrJoinBtn" class="primary-btn wide" type="button">크루 가입</button>`;
      }else if(reason === "MEMBER_LOGIN_REQUIRED"){
        actionHtml = `
          <button id="crewQrLoginBtn" class="primary-btn wide" type="button">로그인 후 가입</button>
          <button id="crewQrRegisterBtn" class="secondary-btn wide" type="button">계정 만들기</button>
        `;
      }else{
        const label = ({
          ALREADY_IN_THIS_CREW:"이미 이 크루의 멤버입니다.",
          ALREADY_IN_CREW:"다른 크루에 소속되어 있습니다. 먼저 현재 크루를 나가야 합니다.",
          CREW_COOLDOWN:data.cooldown_until
            ? `크루 가입 쿨다운이 ${formatRemaining(data.cooldown_until)} 남았습니다.`
            : "크루 가입 쿨다운 중입니다.",
          CREW_FULL:"크루 최대 인원에 도달했습니다."
        })[reason] || "현재 이 크루에 가입할 수 없습니다.";
        actionHtml = `<p class="crew-join-state">${escapeHtml(label)}</p>`;
      }

      openModal(escapeHtml(data.crew_name || "크루"), `
        <div class="crew-join-preview crew-invite-detail">
          <div class="crew-invite-detail-head">
            <p>개설자 ${escapeHtml(founder)}</p>
          </div>
          <div class="crew-join-stats" aria-label="크루 정보">
            <div><span>멤버</span><b>${memberCount}</b></div>
            <div><span>점령지</span><b>${territoryCount}</b></div>
          </div>
          <div class="crew-invite-facts">
            <span>초대 만료 ${escapeHtml(expires)}</span>
            <span>남은 참여 ${remaining}명</span>
          </div>
          <div class="crew-invite-detail-actions">${actionHtml}</div>
        </div>
      `, { type:"detail-sheet" });

      $("#crewQrJoinBtn")?.addEventListener("click", () => joinCrewByQr(cleanToken));
      $("#crewQrLoginBtn")?.addEventListener("click", openMemberLogin);
      $("#crewQrRegisterBtn")?.addEventListener("click", openMemberRegister);
    }catch(error){
      console.warn("BiteBoss crew QR preview:", error);
      toast("크루 초대 정보를 확인하지 못했습니다.");
    }
  }

  async function joinCrewByQr(token){
    const button = $("#crewQrJoinBtn");
    if(button) button.disabled = true;

    try{
      const { data, error } = await sb.rpc("biteboss_join_crew_by_qr_v624", {
        p_token:String(token || "").trim()
      });
      if(error) throw error;

      if(!data?.ok){
        const message = ({
          MEMBER_LOGIN_REQUIRED:"회원 로그인이 필요합니다.",
          INVITE_NOT_FOUND:"유효하지 않은 크루 초대 QR입니다.",
          INVITE_EXPIRED:"만료된 크루 초대 QR입니다.",
          INVITE_REVOKED:"취소된 크루 초대 QR입니다.",
          INVITE_EXHAUSTED:"사용 가능한 인원이 모두 찼습니다.",
          ALREADY_IN_THIS_CREW:"이미 이 크루의 멤버입니다.",
          ALREADY_IN_CREW:"다른 크루에 소속되어 있습니다.",
          CREW_COOLDOWN:data?.cooldown_until
            ? `크루 가입 쿨다운이 ${formatRemaining(data.cooldown_until)} 남았습니다.`
            : "크루 가입 쿨다운 중입니다.",
          CREW_FULL:"크루 최대 인원에 도달했습니다."
        })[data?.error] || "크루에 가입하지 못했습니다.";
        toast(message);
        return;
      }

      pendingCrewInviteToken = "";
      organization = data.organization || null;
      closeModal();

      await Promise.all([
        loadMyOrganization(),
        loadHome(),
        loadRank(),
        loadGameActivity()
      ]);

      toast(`${organization?.name || data.crew_name || "크루"}에 가입했습니다.`);
    }catch(error){
      console.warn("BiteBoss crew QR join:", error);
      toast("크루에 가입하지 못했습니다.");
    }finally{
      if(button) button.disabled = false;
    }
  }

  async function claimByQrToken(token){
    const cleanToken = String(token || "").trim();
    if(!cleanToken) return toast("유효한 QR이 아닙니다.");

    await loadCaptureCooldownStatus(true);
    if(captureCooldownActive()) return toast(captureCooldownMessage());

    const pos = await getPositionSafe(true);
    if(!pos) return toast("보스 점령에는 위치 권한이 필요합니다.");

    const hadOrganizationBeforeChallenge = Boolean(String(organization?.id || "").trim());

    const { data, error } = await sb.rpc("biteboss_claim_store", {
      p_qr_token:cleanToken,
      p_lat:pos.coords.latitude,
      p_lng:pos.coords.longitude,
      p_accuracy_m:Number.isFinite(pos.coords.accuracy) ? pos.coords.accuracy : null
    });

    if(error){
      console.warn(error);
      return toast(claimErrorMessage(error.message));
    }

    showChallengeOutcome({
      ...data,
      had_organization_before:hadOrganizationBeforeChallenge
    });
    lastPosition = pos;
    await Promise.all([
      loadCaptureCooldownStatus(true),
      loadStores(),
      loadHome(),
      loadRank(),
      loadGameActivity(),
      loadAlerts(),
      loadMyOrganization()
    ]);
  }

  function showChallengeOutcome(data){
    const storeName = data?.store_name || "매장";
    const outcome = String(data?.outcome || "boss");

    if(outcome === "crew"){
      const myPower = Number(data?.challenger_power || 0);
      const bossPower = Number(data?.defender_power || 0);
      const needed = myPower && bossPower && myPower <= bossPower ? bossPower - myPower + 1 : 0;
      const hadOrganizationBefore = Boolean(data?.had_organization_before);
      const resultCopy = hadOrganizationBefore
        ? "도전 실패 · 기존 크루 유지 + 상대 정보 공개."
        : "도전 실패 · 크루 합류 + 상대 정보 공개.";
      return toast(`${storeName} ${resultCopy}${myPower && bossPower ? ` 내 파워 ${myPower} / 보스 방어력 ${bossPower}.` : ""}${needed ? ` 파워 +${needed}이면 다시 도전할 수 있습니다.` : ""}`);
    }

    if(outcome === "boss_visit"){
      return toast(`${storeName} 보스 활동이 갱신되었습니다. 이 매장의 방어력 감소가 초기화됩니다.`);
    }

    if(outcome === "boss_reclaim"){
      openModal("재점령 완료", `
        <div class="boss-victory">
          <div class="boss-victory-copy">
            <span>BOSS 유지</span>
            <strong>${escapeHtml(storeName)}</strong>
            <p>재방문이 확인되어 점령 기록과 보호시간이 갱신되었습니다.</p>
          </div>
          <div class="boss-victory-actions">
            <button id="reclaimOkBtn" class="primary-btn" type="button">확인</button>
          </div>
        </div>
      `, { type:"victory" });
      $("#reclaimOkBtn")?.addEventListener("click", closeModal);
      return;
    }

    const myPower = Number(data?.challenger_power || 0);
    const bossPower = Number(data?.defender_power || 0);
    const storeId = String(data?.store_id || "");
    const store = stores.find(item => String(item.id) === storeId) || {
      id:storeId,
      name:storeName
    };

    openModal("점령 완료", `
      <div class="boss-victory">
        <div class="boss-victory-copy">
          <span>새로운 BOSS</span>
          <strong>${escapeHtml(storeName)}</strong>
          <p>이 매장의 새로운 BOSS가 되었습니다.${myPower ? ` 파워 ${myPower}${bossPower ? ` · 이전 방어력 ${bossPower}` : ""}` : ""}</p>
        </div>
        <div class="boss-victory-actions">
          <button id="victoryOkBtn" class="primary-btn" type="button">확인</button>
          <div class="boss-victory-secondary-actions">
            <button id="shareVictoryBtn" class="secondary-btn" type="button">공유하기</button>
            <button id="openVictoryStoreBtn" class="secondary-btn" type="button">매장 보기</button>
          </div>
        </div>
      </div>
    `, { type:"victory" });

    $("#victoryOkBtn")?.addEventListener("click", closeModal);

    $("#shareVictoryBtn")?.addEventListener("click", () => shareBossCard({
      store,
      bossName:String(data?.boss_nickname || profile?.nickname || "보스"),
      bossDefense:Math.max(0, Number(data?.challenger_power || 0)),
      protectedNow:Boolean(data?.protected_until),
      protectionUntil:data?.protected_until || null,
      myPower,
      isBoss:true,
      context:"boss_win"
    }));

    $("#openVictoryStoreBtn")?.addEventListener("click", async () => {
      closeModal();
      if(storeId) await openStoreDetail(storeId);
    });
  }

  function claimErrorMessage(rawMessage){
    const message = String(rawMessage || "");
    if(message.includes("MEMBER_LOGIN_REQUIRED")) return "회원 로그인이 필요합니다.";
    if(message.includes("PARTNER_ONLY_QR")) return "QR 점령은 제휴 매장에서만 사용할 수 있습니다.";
    if(message.includes("INVALID_QR")) return "유효하지 않거나 만료된 QR입니다.";
    if(message.includes("STORE_NOT_AVAILABLE")) return "현재 점령할 수 없는 매장입니다.";
    if(message.includes("STORE_STAFF_CANNOT_CLAIM")) return "이 매장의 직원 계정은 보스에 도전할 수 없습니다.";
    if(message.includes("ADMIN_CANNOT_CLAIM")) return "운영자 계정은 보스 경쟁에서 제외됩니다.";
    if(message.includes("LOCATION_REQUIRED")) return "현재 위치를 확인할 수 없습니다.";
    if(message.includes("STORE_LOCATION_MISSING")) return "매장 위치가 아직 등록되지 않았습니다.";
    if(message.includes("LOCATION_ACCURACY_LOW")) return "GPS 정확도가 낮습니다. 매장 가까이에서 다시 시도하세요.";
    if(message.includes("TOO_FAR:")){
      const meters = Number(message.split("TOO_FAR:")[1]?.match(/\d+/)?.[0]);
      return Number.isFinite(meters) ? `매장과 약 ${meters}m 떨어져 있습니다.` : "매장 가까이에서만 점령할 수 있습니다.";
    }
    if(message.includes("STORE_PROTECTED:")) return `현재 보스 보호시간이 남아 있습니다. ${secondsFromError(message, "STORE_PROTECTED:")}`;
    if(message.includes("ALREADY_BOSS:")) return `이미 이 매장의 보스입니다. ${secondsFromError(message, "ALREADY_BOSS:")}`;
    if(message.includes("CAPTURE_COOLDOWN:")) return `다음 매장 점령 대기 중입니다. ${secondsFromError(message, "CAPTURE_COOLDOWN:")}`;
    if(message.includes("RECLAIM_COOLDOWN:")) return `이 매장은 재점령 쿨다운 중입니다. ${secondsFromError(message, "RECLAIM_COOLDOWN:")}`;
    if(message.includes("DAILY_LIMIT_REACHED")) return "오늘 이 매장에서 가능한 점령 횟수를 모두 사용했습니다.";
    if(message.includes("ACCOUNT_BLOCKED")) return "현재 이 계정에서는 보스 기능을 사용할 수 없습니다.";
    return "점령에 실패했습니다. 잠시 후 다시 시도하세요.";
  }

  function secondsFromError(message, prefix){
    const value = Number(message.split(prefix)[1]?.match(/\d+/)?.[0] || 0);
    if(!value) return "";
    const minutes = Math.ceil(value / 60);
    if(minutes < 60) return `약 ${minutes}분 후 다시 시도하세요.`;
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return `약 ${hours}시간${rest ? ` ${rest}분` : ""} 후 다시 시도하세요.`;
  }

  async function handleClaimParam(){
    const url = new URL(location.href);
    const token = url.searchParams.get("claim");
    if(!token) return;
    history.replaceState({}, "", location.pathname);
    await claimByQrToken(token);
  }

  function extractToken(raw){
    try{
      const parsed = new URL(raw);
      return parsed.searchParams.get("claim") || raw;
    }catch{
      return raw;
    }
  }


  async function restorePlayerSession(){
    try{
      const { data, error } = await sb.rpc("biteboss_player_session");
      if(error) throw error;
      playerSession = data?.authenticated ? data : null;
      return playerSession;
    }catch(error){
      console.warn("BiteBoss player session:", error);
      playerSession = null;
      return null;
    }
  }

  function openMemberLogin(){
    openModal("로그인", `
      <div class="form-grid member-auth-form">
        <label class="wide">ID<input id="memberLoginId" class="input" maxlength="32" autocomplete="username" autocapitalize="none" spellcheck="false" placeholder="yourid" /></label>
        <label class="wide">6자리 PIN<input id="memberLoginPin" class="input" type="password" inputmode="numeric" maxlength="6" autocomplete="current-password" placeholder="000000" /></label>
        <button id="memberLoginSubmit" class="primary-btn wide" type="button">로그인</button>
        <button id="memberAuthSwitchToRegister" class="auth-switch-btn wide" type="button">계정이 없나요? 계정 만들기</button>
        <p id="memberAuthStatus" class="inline-status wide" aria-live="polite"></p>
      </div>
    `);
    $("#memberLoginSubmit").onclick = loginMember;
    $("#memberAuthSwitchToRegister").onclick = openMemberRegister;
  }

  async function loginMember(){
    const username = String($("#memberLoginId")?.value || "").trim().toLowerCase();
    const pin = String($("#memberLoginPin")?.value || "").trim();
    const status = $("#memberAuthStatus");
    const button = $("#memberLoginSubmit");

    if(!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(username)){
      setStatus(status, "ID를 확인하세요.");
      return;
    }
    if(!/^\d{6}$/.test(pin)){
      setStatus(status, "PIN은 숫자 6자리입니다.");
      return;
    }

    if(button) button.disabled = true;
    setStatus(status, "로그인 중…");

    try{
      // A logical BiteBoss account always runs on top of a live anonymous Supabase session.
      // Refresh/restore it before the login RPC so stale browser auth cannot break member login.
      const session = await ensureUserSession();
      if(!session?.user && !authUser){
        throw new Error("AUTH_SESSION_UNAVAILABLE");
      }

      const { data, error } = await sb.rpc("biteboss_player_login", {
        p_username:username,
        p_pin:pin
      });

      if(error){
        console.error("BiteBoss member login RPC:", error);
        throw new Error(error.message || error.code || "LOGIN_RPC_FAILED");
      }

      if(!data?.ok){
        throw new Error(data?.error || "LOGIN_FAILED");
      }

      // Re-read the server session instead of trusting only the login response.
      const restored = await restorePlayerSession();
      if(!restored?.authenticated){
        throw new Error("SESSION_RESTORE_FAILED");
      }

      playerSession = restored;
      await ensureProfile();
      closeModal();
      updateProfileUi();

      const loginPositionPromise = getPositionSafe(false, {
        timeout:3000,
        maximumAge:30000
      });

      await Promise.all([
        loadHome(),
        loadMyOrganization(),
        loadGameActivity(),
        loadAlerts()
      ]);

      lastPosition = await loginPositionPromise;
      await loadStores();
      if(lastPosition?.coords){
        nearbyLastRefreshPosition = lastPosition;
        nearbyLastRefreshAt = Date.now();
      }
      startNearbyLocationWatch();

      startPresenceTracking();
      await refreshNotificationState({ registerIfGranted:true });

      if(pendingCrewInviteToken){
        await previewCrewInvite(pendingCrewInviteToken);
      }
    }catch(error){
      const code = String(error?.message || error || "LOGIN_FAILED");
      console.error("BiteBoss member login:", code);

      const message =
        code.includes("LOCKED")
          ? "로그인 시도가 많습니다. 15분 후 다시 시도하세요."
          : code.includes("AUTH_REQUIRED") || code.includes("AUTH_SESSION_UNAVAILABLE")
            ? "로그인 세션을 만들지 못했습니다. 새로고침 후 다시 시도하세요."
            : code.includes("SESSION_RESTORE_FAILED")
              ? "로그인은 확인됐지만 세션 복원에 실패했습니다. 다시 시도하세요."
              : code.includes("INVALID_CREDENTIALS")
                ? "ID 또는 PIN이 올바르지 않습니다."
                : `로그인 실패 · ${code}`;

      setStatus(status, message);
    }finally{
      if(button) button.disabled = false;
    }
  }

  function openMemberRegister(){
    const suggestionSeed = `register-${Date.now()}-${Math.random()}`;
    const suggestedNickname = generateDefaultNickname(suggestionSeed, 0);
    openModal("계정 만들기", `
      <div class="form-grid member-auth-form">
        <label class="wide">ID<input id="memberRegisterId" class="input" maxlength="32" autocomplete="username" autocapitalize="none" spellcheck="false" placeholder="yourid" /></label>
        <label class="wide">닉네임<input id="memberRegisterNick" class="input" maxlength="40" value="${escapeAttr(suggestedNickname)}" placeholder="${escapeAttr(suggestedNickname)}" /></label>
        <p class="member-nickname-hint wide">BiteBoss가 만든 기본 별명입니다. 지금 바꾸거나 프로필에서 나중에 변경할 수 있습니다.</p>
        <label class="wide">6자리 PIN<input id="memberRegisterPin" class="input" type="password" inputmode="numeric" maxlength="6" autocomplete="new-password" placeholder="000000" /></label>
        <button id="memberRegisterSubmit" class="primary-btn wide" type="button">계정 만들기</button>
        <button id="memberAuthSwitchToLogin" class="auth-switch-btn wide" type="button">이미 계정이 있나요? 로그인</button>
        <p id="memberAuthStatus" class="inline-status wide" aria-live="polite"></p>
      </div>
    `);
    $("#memberRegisterSubmit").onclick = registerMember;
    $("#memberAuthSwitchToLogin").onclick = openMemberLogin;

    void findAvailableDefaultNickname(suggestionSeed).then(uniqueNickname => {
      const input = $("#memberRegisterNick");
      if(input && input.value === suggestedNickname) input.value = uniqueNickname;
    }).catch(error => console.warn("BiteBoss nickname suggestion:", error));
  }

  async function registerMember(){
    const username = String($("#memberRegisterId")?.value || "").trim().toLowerCase();
    const nickname = normalizeNickname($("#memberRegisterNick")?.value);
    const pin = String($("#memberRegisterPin")?.value || "").trim();
    const status = $("#memberAuthStatus");
    const button = $("#memberRegisterSubmit");
    if(!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(username)) return setStatus(status, "ID는 영문 소문자/숫자/._- 조합 3~32자입니다.");
    if(!/^\d{6}$/.test(pin)) return setStatus(status, "PIN은 숫자 6자리입니다.");
    if(button) button.disabled = true;
    setStatus(status, "계정을 만드는 중…");
    try{
      const finalNickname = nickname || await findAvailableDefaultNickname(username);
      if(!(await nicknameAvailable(finalNickname))) throw new Error("NICKNAME_TAKEN");
      const { data, error } = await sb.rpc("biteboss_member_register", { p_username:username, p_pin:pin, p_nickname:finalNickname });
      if(error) throw error;
      if(!data?.ok) throw new Error(data?.error || "REGISTER_FAILED");
      playerSession = data;
      await ensureProfile();
      closeModal();
      updateProfileUi();
      const registerPositionPromise = getPositionSafe(false, {
        timeout:3000,
        maximumAge:30000
      });
      await Promise.all([loadHome(), loadMyOrganization()]);
      lastPosition = await registerPositionPromise;
      await loadStores();
      if(lastPosition?.coords){
        nearbyLastRefreshPosition = lastPosition;
        nearbyLastRefreshAt = Date.now();
      }
      startNearbyLocationWatch();
      startPresenceTracking();
      await refreshNotificationState({ registerIfGranted:true });

      if(pendingCrewInviteToken){
        await previewCrewInvite(pendingCrewInviteToken);
      }
    }catch(error){
      const code = String(error?.message || error);
      const message = code.includes("USERNAME_TAKEN")
        ? "이미 사용 중인 ID입니다."
        : code.includes("NICKNAME_TAKEN") || isNicknameConflict(error)
          ? "이미 사용 중인 닉네임입니다."
          : code.includes("ALREADY_REGISTERED")
            ? "이 기기에서 이미 회원 계정이 만들어져 있습니다."
            : "계정을 만들지 못했습니다.";
      setStatus(status, message);
    }finally{
      if(button) button.disabled = false;
    }
  }

  async function openMemberStoreForm(){
    if(!playerSession?.authenticated) return openMemberLogin();
    const pos = await getPositionSafe(true);
    const lat = pos?.coords?.latitude;
    const lng = pos?.coords?.longitude;
    openModal("매장 등록", `
      <div class="form-grid member-store-form">
        <label class="wide">매장명<input id="memberStoreName" class="input" maxlength="120" placeholder="매장명" /></label>
        <label>카테고리<select id="memberStoreCategory" class="input"><option value="restaurant">음식점</option><option value="cafe">카페</option><option value="dessert">디저트</option><option value="bakery">베이커리</option><option value="fastfood">패스트푸드</option><option value="pub">펍</option></select></label>
        <label>도시<input id="memberStoreCity" class="input" maxlength="120" placeholder="Seoul" /></label>
        <label>지역<input id="memberStoreDistrict" class="input" maxlength="120" placeholder="Gangnam" /></label>
        <label class="wide">주소<input id="memberStoreAddress" class="input" maxlength="300" placeholder="주소 (선택)" /></label>
        <div class="wide member-location-state" id="memberStoreLocation">${Number.isFinite(lat) && Number.isFinite(lng) ? `현재 위치 확인됨 · ${lat.toFixed(5)}, ${lng.toFixed(5)}` : "현재 위치를 확인하지 못했습니다."}</div>
        <button id="memberStoreSubmit" class="primary-btn wide" type="button" ${Number.isFinite(lat) && Number.isFinite(lng) ? "" : "disabled"}>매장 등록</button>
        <p id="memberStoreStatus" class="inline-status wide" aria-live="polite"></p>
      </div>
    `);
    $("#memberStoreSubmit").onclick = () => submitMemberStore(lat, lng);
  }

  async function submitMemberStore(latitude, longitude){
    const name = String($("#memberStoreName")?.value || "").trim();
    const status = $("#memberStoreStatus");
    const button = $("#memberStoreSubmit");
    if(!name) return setStatus(status, "매장명을 입력하세요.");
    if(!Number.isFinite(latitude) || !Number.isFinite(longitude)) return setStatus(status, "현재 위치가 필요합니다.");
    if(button) button.disabled = true;
    setStatus(status, "등록 중…");
    try{
      const { data, error } = await sb.rpc("biteboss_member_create_store", {
        p_name:name,
        p_category:String($("#memberStoreCategory")?.value || "restaurant"),
        p_city:String($("#memberStoreCity")?.value || "").trim(),
        p_district:String($("#memberStoreDistrict")?.value || "").trim(),
        p_address:String($("#memberStoreAddress")?.value || "").trim(),
        p_latitude:latitude,
        p_longitude:longitude
      });
      if(error) throw error;
      if(!data?.ok) throw new Error(data?.error || "STORE_CREATE_FAILED");
      closeModal();
      toast(`${data.store?.name || name} 등록 완료. 비제휴 매장은 현장 체류로 자동 점령됩니다.`);
      await loadStores();
    }catch(error){
      setStatus(status, String(error?.message || error).includes("MEMBER_LOGIN_REQUIRED") ? "회원 로그인이 필요합니다." : "매장을 등록하지 못했습니다.");
    }finally{
      if(button) button.disabled = false;
    }
  }

  function setStatus(node, text){
    if(node) node.textContent = text;
  }

  function openProfileEditor(){
    if(!playerSession?.authenticated){
      openMemberLogin();
      return;
    }
    const nickname = profile?.nickname || "보스";
    const avatarUrl = String(profile?.avatar_url || "").trim();
    openModal("프로필 수정", `
      <div class="profile-edit-form">
        <section class="profile-edit-section">
          <div class="profile-edit-label">
            <strong>프로필 이미지</strong>
            <span>다른 사용자에게 보여지는 이미지입니다.</span>
          </div>
          <label class="profile-image-picker" for="profilePhotoInput">
            <span class="profile-image-picker-preview">
              ${avatarUrl ? `<img src="${escapeAttr(avatarUrl)}" alt="" loading="lazy" decoding="async" />` : `<span aria-hidden="true"></span>`}
            </span>
            <span class="profile-image-picker-copy">
              <strong>이미지 선택</strong>
              <small>JPG · PNG · WEBP</small>
            </span>
            <span class="profile-image-picker-action" aria-hidden="true">변경</span>
          </label>
          <input id="profilePhotoInput" class="visually-hidden-file" type="file" accept="image/png,image/jpeg,image/webp" />
        </section>

        <section class="profile-edit-section">
          <div class="profile-edit-label">
            <strong>닉네임</strong>
            <span>다른 사용자에게 표시되는 이름입니다.</span>
          </div>
          <input id="profileNickInput" class="input profile-edit-input" maxlength="40" autocomplete="nickname" value="${escapeAttr(nickname)}" />
        </section>

        <button id="saveProfileBtn" class="primary-btn profile-edit-save" type="button">저장</button>
      </div>
    `);
    $("#saveProfileBtn").onclick = saveProfileFromModal;
  }

  async function saveProfileFromModal(){
    const button = $("#saveProfileBtn");
    const nickname = normalizeNickname($("#profileNickInput")?.value);
    const file = $("#profilePhotoInput")?.files?.[0];
    if(!nickname) return toast("닉네임을 입력하세요.");

    if(button) button.disabled = true;
    try{
      const currentNickname = normalizeNickname(profile?.nickname);
      if(nickname.toLocaleLowerCase("ko-KR") !== currentNickname.toLocaleLowerCase("ko-KR") && !(await nicknameAvailable(nickname))){
        return toast("이미 사용 중인 닉네임입니다.");
      }

      let avatarUrl = profile?.avatar_url || "";
      if(file) avatarUrl = await uploadAvatar(file);

      const { data, error } = await sb.rpc("biteboss_update_profile", {
        p_nickname:nickname,
        p_avatar_url:avatarUrl
      });

      if(error) throw error;
      profile = rpcRow(data);
      await syncAuthNickname(profile?.nickname);
      closeModal();
      updateProfileUi();
      await Promise.all([loadStores(), loadHome()]);
    }catch(error){
      console.warn(error);
      toast(isNicknameConflict(error) ? "이미 사용 중인 닉네임입니다." : "프로필을 저장하지 못했습니다.");
    }finally{
      if(button) button.disabled = false;
    }
  }

  async function uploadAvatar(file){
    const blob = await imageFileToJpegBlob(file, 720, 720, 0.86);
    const path = `${authUser.id}/avatar.jpg`;
    const { error } = await sb.storage
      .from("biteboss-avatars")
      .upload(path, blob, { contentType:"image/jpeg", upsert:true, cacheControl:"3600" });
    if(error) throw error;
    const { data } = sb.storage.from("biteboss-avatars").getPublicUrl(path);
    return `${data.publicUrl}?v=${Date.now()}`;
  }


  async function uploadOrganizationAvatar(file){
    if(!organization?.id) throw new Error("CREW_NOT_FOUND");
    if(!file) throw new Error("CREW_AVATAR_FILE_REQUIRED");

    const allowedTypes = new Set(["image/jpeg","image/png","image/webp","image/heic","image/heif"]);
    const fileType = String(file.type || "").toLowerCase();
    if(fileType && !allowedTypes.has(fileType)){
      throw new Error("CREW_AVATAR_UNSUPPORTED_FILE");
    }

    const { data:userData, error:userError } = await sb.auth.getUser();
    if(userError) throw new Error(`CREW_AVATAR_AUTH:${userError.message || "AUTH_FAILED"}`);

    const storageUserId = String(userData?.user?.id || "").trim();
    if(!storageUserId) throw new Error("CREW_AVATAR_AUTH_REQUIRED");

    let blob;
    try{
      blob = await imageFileToJpegBlob(file, 720, 720, 0.86);
    }catch(error){
      throw new Error(`CREW_AVATAR_IMAGE:${error?.message || "IMAGE_CONVERT_FAILED"}`);
    }

    const path = `${storageUserId}/crew/${organization.id}/avatar.jpg`;
    const { error:uploadError } = await sb.storage
      .from("biteboss-avatars")
      .upload(path, blob, {
        contentType:"image/jpeg",
        upsert:true,
        cacheControl:"3600"
      });

    if(uploadError){
      throw new Error(`CREW_AVATAR_STORAGE:${uploadError.message || "UPLOAD_FAILED"}`);
    }

    const { data } = sb.storage.from("biteboss-avatars").getPublicUrl(path);
    const publicUrl = String(data?.publicUrl || "").trim();
    if(!publicUrl) throw new Error("CREW_AVATAR_PUBLIC_URL_FAILED");
    return `${publicUrl}?v=${Date.now()}`;
  }

  function openOrganizationAvatarEditor(){
    if(!playerSession?.authenticated || !organization?.id){
      toast("크루 정보를 찾지 못했습니다.");
      return;
    }
    if(!organization?.is_leader){
      toast("크루 개설자만 크루 프로필을 변경할 수 있습니다.");
      return;
    }

    const currentUrl = String(organization.avatar_url || "").trim();
    const crewName = String(organization.name || "크루").trim();
    const fallback = Array.from(crewName)[0] || "C";
    const renameAvailableAt = organization.name_change_available_at || null;
    const renameLocked = Boolean(
      renameAvailableAt &&
      new Date(renameAvailableAt).getTime() > Date.now()
    );

    openModal("크루 프로필", `
      <div class="crew-profile-editor">
        <div class="crew-profile-editor-hero">
          <div class="crew-avatar-editor-preview">
            ${currentUrl
              ? `<img src="${escapeAttr(currentUrl)}" alt="${escapeAttr(crewName)} 크루 프로필" loading="lazy" decoding="async" />`
              : `<span aria-hidden="true">${escapeHtml(fallback)}</span>`}
          </div>
          <div class="crew-profile-hero-copy">
            <strong>${escapeHtml(crewName)}</strong>
            <p>크루 이미지와 크루명은 개인 프로필과 별도로 관리됩니다.</p>
          </div>
        </div>

        <section class="crew-profile-edit-section">
          <div class="profile-edit-label">
            <strong>크루 이미지</strong>
            <span>크루를 대표하는 이미지를 등록하세요.</span>
          </div>
          <label class="crew-image-picker" for="organizationAvatarInput">
            <span class="crew-image-picker-copy">
              <strong>이미지 선택</strong>
              <small>JPG · PNG · WEBP</small>
            </span>
            <span class="crew-image-picker-action" aria-hidden="true">선택</span>
          </label>
          <input id="organizationAvatarInput" class="visually-hidden-file" type="file" accept="image/png,image/jpeg,image/webp" />
          <div class="crew-profile-edit-actions">
            <button id="saveOrganizationAvatarBtn" class="secondary-btn" type="button">이미지 저장</button>
            ${currentUrl ? `<button id="removeOrganizationAvatarBtn" class="text-btn crew-avatar-remove" type="button">이미지 삭제</button>` : ""}
          </div>
        </section>

        <section class="crew-profile-edit-section crew-name-edit-section">
          <div class="profile-edit-label">
            <strong>크루명</strong>
            <span>${renameLocked ? `다음 변경까지 ${escapeHtml(formatRemaining(renameAvailableAt))}` : "크루명은 월 1회 변경할 수 있습니다."}</span>
          </div>
          <input
            id="organizationRenameInput"
            class="input profile-edit-input"
            type="text"
            maxlength="30"
            autocomplete="off"
            value="${escapeAttr(crewName)}" />
          <button
            id="renameOrganizationBtn"
            class="primary-btn crew-name-save"
            type="button"
            ${renameLocked ? "disabled" : ""}>
            ${renameLocked ? "변경 대기" : "크루명 저장"}
          </button>
        </section>
      </div>
    `);

    $("#saveOrganizationAvatarBtn")?.addEventListener("click", saveOrganizationAvatarFromModal);
    $("#removeOrganizationAvatarBtn")?.addEventListener("click", removeOrganizationAvatar);
    $("#renameOrganizationBtn")?.addEventListener("click", renameOrganizationFromModal);
  }

  async function saveOrganizationAvatarFromModal(){
    const button = $("#saveOrganizationAvatarBtn");
    const file = $("#organizationAvatarInput")?.files?.[0];
    if(!file){
      toast("이미지를 선택하세요.");
      return;
    }

    if(button) button.disabled = true;
    try{
      const avatarUrl = await uploadOrganizationAvatar(file);
      const { data, error } = await sb.rpc("biteboss_update_organization_avatar_v649", {
        p_avatar_url:avatarUrl
      });

      if(error) throw new Error(`CREW_AVATAR_RPC:${error.message || "RPC_FAILED"}`);
      if(!data?.ok) throw new Error(`CREW_AVATAR_RPC:${data?.error || "CREW_AVATAR_UPDATE_FAILED"}`);

      organization = data.organization || organization;
      closeModal();
      renderOrganizationUi();
      updateProfileUi();
      await Promise.all([loadStores(), loadHome()]);
      toast("크루 프로필 이미지를 변경했습니다.");
    }catch(error){
      console.warn("BiteBoss crew avatar:", error);
      const code = String(error?.message || "");
      let message = "크루 프로필 이미지를 저장하지 못했습니다.";

      if(code.includes("LEADER_REQUIRED")){
        message = "크루 개설자만 프로필 이미지를 변경할 수 있습니다.";
      }else if(code.includes("CREW_AVATAR_STORAGE")){
        message = "이미지 업로드 권한이 없습니다. 크루 이미지 저장 SQL을 먼저 적용하세요.";
      }else if(code.includes("CREW_AVATAR_RPC") && code.includes("Could not find the function")){
        message = "크루 이미지 저장 기능이 서버에 아직 적용되지 않았습니다.";
      }else if(code.includes("CREW_AVATAR_RPC")){
        message = "이미지는 업로드됐지만 크루 정보 저장에 실패했습니다.";
      }else if(code.includes("CREW_AVATAR_IMAGE") || code.includes("UNSUPPORTED_FILE")){
        message = "이 이미지를 처리하지 못했습니다. JPG, PNG 또는 WEBP 이미지를 사용하세요.";
      }else if(code.includes("CREW_AVATAR_AUTH")){
        message = "로그인 세션을 확인하지 못했습니다. 다시 로그인한 뒤 시도하세요.";
      }

      toast(message);
    }finally{
      if(button) button.disabled = false;
    }
  }

  async function removeOrganizationAvatar(){
    const button = $("#removeOrganizationAvatarBtn");
    if(button) button.disabled = true;
    try{
      const { data, error } = await sb.rpc("biteboss_update_organization_avatar_v649", {
        p_avatar_url:""
      });
      if(error) throw error;
      if(!data?.ok) throw new Error(data?.error || "CREW_AVATAR_UPDATE_FAILED");

      organization = data.organization || organization;
      closeModal();
      renderOrganizationUi();
      updateProfileUi();
      await Promise.all([loadStores(), loadHome()]);
      toast("크루 프로필 이미지를 삭제했습니다.");
    }catch(error){
      console.warn("BiteBoss remove crew avatar:", error);
      toast("크루 프로필 이미지를 삭제하지 못했습니다.");
    }finally{
      if(button) button.disabled = false;
    }
  }


  async function renameOrganizationFromModal(){
    if(!organization?.is_leader){
      toast("크루 개설자만 크루명을 변경할 수 있습니다.");
      return;
    }

    const button = $("#renameOrganizationBtn");
    const input = $("#organizationRenameInput");
    const nextName = String(input?.value || "").trim().replace(/\s+/g," ");
    const currentName = String(organization?.name || "").trim().replace(/\s+/g," ");

    if(nextName.length < 2 || nextName.length > 30){
      toast("크루명은 2~30자로 입력하세요.");
      return;
    }
    if(nextName === currentName){
      toast("현재 크루명과 같습니다.");
      return;
    }

    if(button) button.disabled = true;
    try{
      const { data, error } = await sb.rpc("biteboss_rename_organization_v652", {
        p_name:nextName
      });
      if(error) throw error;

      if(!data?.ok){
        const message = ({
          MEMBER_LOGIN_REQUIRED:"회원 로그인이 필요합니다.",
          LEADER_REQUIRED:"크루 개설자만 크루명을 변경할 수 있습니다.",
          INVALID_NAME:"크루명은 2~30자로 입력하세요.",
          SAME_NAME:"현재 크루명과 같습니다.",
          NAME_TAKEN:"이미 사용 중인 크루명입니다.",
          NAME_RESERVED:"이미 사용 중인 크루명입니다."
        })[data?.error];

        if(data?.error === "RENAME_COOLDOWN"){
          toast(data?.available_at
            ? `크루명은 ${formatRemaining(data.available_at)} 후 다시 변경할 수 있습니다.`
            : "크루명은 월 1회 변경할 수 있습니다.");
        }else{
          toast(message || "크루명을 변경하지 못했습니다.");
        }
        return;
      }

      organization = data.organization || organization;
      closeModal();
      await loadMyOrganization();
      await Promise.all([loadStores(), loadHome(), loadRank()]);
      toast(`크루명이 ${organization?.name || nextName}(으)로 변경되었습니다.`);
    }catch(error){
      console.warn("BiteBoss crew rename:", error);
      toast("크루명을 변경하지 못했습니다.");
    }finally{
      if(button) button.disabled = false;
    }
  }

  async function loadMyOrganization(){
    if(!window.sb){
      organization = null;
      organizationCooldown = null;
      organizationInvites = [];
      organizationMembers = [];
      renderOrganizationUi();
      return null;
    }

    try{
      const [orgResult, cooldownResult, invitesResult, membersResult] = await Promise.all([
        sb.rpc("biteboss_my_organization"),
        sb.rpc("biteboss_organization_cooldown_status"),
        sb.rpc("biteboss_my_organization_invites"),
        sb.rpc("biteboss_organization_members")
      ]);

      if(orgResult.error) throw orgResult.error;

      organization = orgResult.data || null;
      organizationInvites = Array.isArray(invitesResult.data) ? invitesResult.data : [];
      organizationMembers = Array.isArray(membersResult.data) ? membersResult.data : [];

      if(cooldownResult.error){
        console.warn("BiteBoss organization cooldown:", cooldownResult.error);
        organizationCooldown = null;
      }else{
        organizationCooldown = cooldownResult.data || null;
      }

      if(invitesResult.error){
        console.warn("BiteBoss organization invites:", invitesResult.error);
        organizationInvites = [];
      }

      if(membersResult.error){
        console.warn("BiteBoss organization members:", membersResult.error);
        organizationMembers = [];
      }
    }catch(error){
      console.warn("BiteBoss organization:", error);
      organization = null;
      organizationCooldown = null;
      organizationInvites = [];
      organizationMembers = [];
    }

    renderOrganizationUi();
    updateProfileUi();
    return organization;
  }

  function renderOrganizationUi(){
    const hasOrg = Boolean(organization?.id);
    const name = String(organization?.name || "").trim();
    const cooldownActive = Boolean(organizationCooldown?.active);
    const cooldownUntil = organizationCooldown?.cooldown_until || null;

    setText("#organizationName", hasOrg ? name : "크루 없음");
    setText(
      "#organizationRole",
      hasOrg
        ? (organization.is_leader ? "개설자" : "멤버")
        : cooldownActive && cooldownUntil
          ? `Affiliation cooldown · ${formatRemaining(cooldownUntil)}`
          : ""
    );
    const roleEl = $("#organizationRole");
    if(roleEl) roleEl.classList.toggle("hidden", !hasOrg && !cooldownActive);

    setText("#organizationMembers", hasOrg ? Number(organization.member_count || 0) : 0);
    setText("#organizationTerritory", hasOrg ? Number(organization.territory_count || 0) : 0);

    const crewAvatarButton = $("#organizationAvatarButton");
    const crewAvatarImage = $("#organizationAvatarImage");
    const crewAvatarFallback = $("#organizationAvatarFallback");
    const crewAvatarUrl = hasOrg ? String(organization.avatar_url || "").trim() : "";
    if(crewAvatarButton){
      crewAvatarButton.classList.toggle("hidden", !hasOrg);
      crewAvatarButton.disabled = !Boolean(hasOrg && organization?.is_leader);
      crewAvatarButton.classList.toggle("is-editable", Boolean(hasOrg && organization?.is_leader));
      crewAvatarButton.setAttribute(
        "aria-label",
        organization?.is_leader ? "크루 프로필 이미지 변경" : "크루 프로필 이미지"
      );
    }
    if(crewAvatarImage){
      if(crewAvatarUrl){
        crewAvatarImage.src = crewAvatarUrl;
        crewAvatarImage.alt = `${name || "크루"} 프로필`;
        crewAvatarImage.classList.remove("hidden");
      }else{
        crewAvatarImage.removeAttribute("src");
        crewAvatarImage.alt = "";
        crewAvatarImage.classList.add("hidden");
      }
    }
    if(crewAvatarFallback){
      crewAvatarFallback.textContent = Array.from(name || "C")[0] || "C";
      crewAvatarFallback.classList.toggle("hidden", Boolean(crewAvatarUrl));
    }

    const create = $("#createOrganizationBtn");
    if(create){
      const hasBoss = Number(summary?.active_boss_count || 0) > 0;
      const loggedIn = Boolean(playerSession?.authenticated);
      const canCreate = Boolean(
        loggedIn &&
        !hasOrg &&
        hasBoss &&
        !cooldownActive
      );

      create.classList.toggle("hidden", hasOrg || !loggedIn);
      create.disabled = Boolean(loggedIn && !canCreate);

      if(loggedIn && cooldownActive && cooldownUntil){
        create.textContent = `재가입 대기 ${formatRemaining(cooldownUntil)}`;
      }else if(loggedIn){
        create.textContent = canCreate ? "크루 만들기" : "보스가 되어 크루 만들기";
      }
    }

    const crewActions = $(".crew-actions");
    const isCrewLeader = Boolean(hasOrg && organization?.is_leader);
    crewActions?.classList.toggle("is-leader-actions", isCrewLeader);

    const invite = $("#inviteOrganizationMemberBtn");
    if(invite){
      const canInvite = isCrewLeader;
      invite.classList.toggle("hidden", !canInvite);
      invite.disabled = !canInvite;
      invite.textContent = "QR 초대";
    }

    const independence = $("#foundIndependentOrganizationBtn");
    if(independence){
      const canFoundIndependent = Boolean(
        hasOrg &&
        !organization?.is_leader &&
        Number(summary?.active_boss_count || 0) > 0
      );
      independence.classList.toggle("hidden", !canFoundIndependent);
      independence.disabled = !canFoundIndependent;
    }

    const leave = $("#leaveOrganizationBtn");
    if(leave){
      leave.classList.toggle("hidden", !hasOrg);
      leave.textContent = organization?.is_leader ? "크루 해산" : "크루 탈퇴";
    }

    const memberBox = $("#organizationMemberList");
    if(memberBox){
      memberBox.classList.toggle("hidden", !hasOrg);

      if(hasOrg && organizationMembers.length){
        memberBox.innerHTML = organizationMembers.map(member => {
          const canTransfer = Boolean(
            organization?.is_leader &&
            member.role !== "leader" &&
            member.user_id
          );
          const canKick = Boolean(
            organization?.is_leader &&
            member.role !== "leader" &&
            member.user_id
          );

          const memberName = String(member.nickname || member.username || "사용자").trim();
          const isCurrentProfile = Boolean(
            profile?.nickname &&
            memberName &&
            memberName === String(profile.nickname).trim()
          );
          const memberAvatar = String(
            member.avatar_url ||
            member.profile_avatar_url ||
            member.profile_image_url ||
            member.photo_url ||
            member.image_url ||
            (isCurrentProfile ? profile?.avatar_url : "") ||
            ""
          ).trim();

          return `
            <article
              class="organization-member-row"
              data-player-profile="${escapeAttr(member.user_id || "")}"
              data-player-avatar="${escapeAttr(memberAvatar)}">
              ${bossAvatarMarkup(memberAvatar, memberName, "organization-member-avatar")}
              <div class="organization-member-copy">
                <strong>${escapeHtml(member.nickname || member.username || "사용자")}</strong>
                <span>${escapeHtml(member.role === "leader" ? "개설자" : "멤버")}</span>
              </div>
              <div class="organization-member-side">
                ${(canTransfer || canKick) ? `
                  <div class="organization-member-actions">
                    ${canTransfer ? `
                      <button
                        class="text-btn organization-transfer-btn"
                        type="button"
                        data-transfer-leader="${escapeAttr(member.user_id)}"
                        data-member-name="${escapeAttr(member.nickname || member.username || "멤버")}">
                        리더 변경
                      </button>` : ""}
                    ${canKick ? `
                      <button
                        class="text-btn organization-kick-btn"
                        type="button"
                        data-kick-member="${escapeAttr(member.user_id)}"
                        data-member-name="${escapeAttr(member.nickname || member.username || "멤버")}">
                        강퇴
                      </button>` : ""}
                  </div>` : ""}
              </div>
            </article>
          `;
        }).join("");
        memberBox.insertAdjacentHTML("afterbegin", `
          <div class="organization-member-list-head">
            <span>멤버</span>
            <strong>${organizationMembers.length}명</strong>
          </div>
        `);
      }else{
        memberBox.innerHTML = "";
      }
    }

    const invitesBox = $("#organizationInvites");
    if(invitesBox){
      const showInvites = !hasOrg && organizationInvites.length > 0;
      invitesBox.classList.toggle("hidden", !showInvites);

      if(showInvites){
        invitesBox.innerHTML = `
          <div class="organization-invites-head">
            <span>초대</span>
            <strong>${organizationInvites.length}</strong>
          </div>
          ${organizationInvites.map(inviteRow => `
            <article class="organization-invite-row">
              <div>
                <strong>${escapeHtml(inviteRow.organization_name || "Crew")}</strong>
                <span>${escapeHtml(formatRemaining(inviteRow.expires_at))} 남음</span>
              </div>
              <div class="organization-invite-actions">
                <button type="button" data-org-invite="${escapeAttr(inviteRow.id)}" data-accept="true">참여</button>
                <button type="button" data-org-invite="${escapeAttr(inviteRow.id)}" data-accept="false">거절</button>
              </div>
            </article>
          `).join("")}
        `;
      }else{
        invitesBox.innerHTML = "";
      }
    }
  }

  function openOrganizationCreate(){
    if(!playerSession?.authenticated){
      openMemberLogin();
      return;
    }

    if(organization?.id){
      toast("이미 크루에 소속되어 있습니다.");
      return;
    }

    if(organizationCooldown?.active){
      toast(`크루 재가입/창설 쿨다운이 ${formatRemaining(organizationCooldown.cooldown_until)} 남았습니다.`);
      return;
    }

    if(Number(summary?.active_boss_count || 0) < 1){
      toast("한 매장의 보스가 된 뒤 크루를 만들 수 있습니다.");
      return;
    }

    openModal("크루 만들기", `
      <div class="form-grid organization-create-form">
        <label>
          크루명
          <input id="organizationNameInput" class="input" maxlength="30" autocomplete="off" placeholder="BLACK FORK" />
        </label>
        <p class="organization-create-note">현재 보스 매장 1곳 이상이 필요합니다. 대소문자·연속 공백만 다른 크루명은 같은 이름으로 처리됩니다.</p>
        <button id="organizationCreateSubmit" class="primary-btn" type="button">만들기</button>
      </div>
    `);

    $("#organizationCreateSubmit")?.addEventListener("click", createOrganization);
  }

  async function createOrganization(){
    const name = String($("#organizationNameInput")?.value || "").trim().replace(/\s+/g," ");
    if(name.length < 2 || name.length > 30){
      toast("크루명은 2~30자로 입력하세요.");
      return;
    }

    const button = $("#organizationCreateSubmit");
    if(button) button.disabled = true;

    try{
      const { data, error } = await sb.rpc("biteboss_create_organization_v62", { p_name:name });
      if(error) throw error;

      if(!data?.ok){
        const message = ({
          MEMBER_LOGIN_REQUIRED:"회원 로그인이 필요합니다.",
          BOSS_REQUIRED:"한 매장의 보스가 된 뒤 조직을 만들 수 있습니다.",
          ALREADY_IN_CREW:"이미 조직에 소속되어 있습니다.",
          CREW_COOLDOWN:data?.cooldown_until ? `조직 창설 쿨다운이 ${formatRemaining(data.cooldown_until)} 남았습니다.` : "조직 창설 쿨다운 중입니다.",
          NAME_TAKEN:"이미 사용 중인 조직명입니다.",
          NAME_RESERVED:"대소문자·공백만 다른 동일 조직명이 이미 사용 중입니다.",
          INVALID_NAME:"조직명은 2~30자로 입력하세요."
        })[data?.error] || "조직을 만들지 못했습니다.";
        toast(message);
        return;
      }

      organization = data.organization || null;
      organizationCooldown = null;
      closeModal();
      await loadMyOrganization();
      renderOrganizationUi();
      updateProfileUi();
      toast(`${organization?.name || name} 크루를 만들었습니다.`);
      if(organization?.id) await openOrganizationDetail(organization.id);
    }catch(error){
      console.warn("BiteBoss create crew:", error);
      toast("크루를 만들지 못했습니다.");
    }finally{
      if(button) button.disabled = false;
    }
  }

  function handleOrganizationMemberAction(event){
    const actionButton = event.target.closest("[data-kick-member],[data-transfer-leader]");
    if(!actionButton)return;
    event.preventDefault();
    event.stopPropagation();

    const kickButton = actionButton.matches("[data-kick-member]") ? actionButton : null;
    if(kickButton){const userId=String(kickButton.dataset.kickMember||"").trim();
      const memberName=String(kickButton.dataset.memberName||"멤버").trim();
      if(userId) openOrganizationKickConfirm(userId, memberName);
      return;
    }

    const transferButton = actionButton.matches("[data-transfer-leader]") ? actionButton : null;
    if(!transferButton) return;

    const userId=String(transferButton.dataset.transferLeader||"").trim();
    const memberName = String(transferButton.dataset.memberName || "멤버").trim();
    if(!userId) return;

    openLeadershipTransferConfirm(userId, memberName);
  }
  function openOrganizationKickConfirm(userId, memberName){
    if(!organization?.is_leader){
      toast("크루 개설자만 멤버를 강퇴할 수 있습니다.");
      return;
    }

    openModal("크루원 강퇴", `
      <div class="organization-kick-confirm">
        <span>강퇴할 멤버</span>
        <strong>${escapeHtml(memberName)}</strong>
        <p>${escapeHtml(organization?.name || "크루")}에서 이 멤버를 제외합니다.</p>
        <p class="organization-kick-note">멤버의 개인 보스 기록과 XP는 유지됩니다. 크루 점령 집계에서는 즉시 제외됩니다.</p>
        <button
          id="organizationKickConfirm"
          class="danger-btn"
          type="button"
          data-kick-user="${escapeAttr(userId)}">
          강퇴
        </button>
      </div>
    `);

    $("#organizationKickConfirm")?.addEventListener("click", kickOrganizationMember);
  }
  async function kickOrganizationMember(event){
    const button = event.currentTarget;
    const userId = String(button?.dataset?.kickUser || "").trim();
    if(!userId) return;

    if(button) button.disabled = true;
    try{
      const { data, error } = await sb.rpc("biteboss_kick_organization_member_v7513", {
        p_target_user_id:userId
      });
      if(error) throw error;

      if(!data?.ok){
        const message = ({
          MEMBER_LOGIN_REQUIRED:"회원 로그인이 필요합니다.",
          LEADER_REQUIRED:"크루 개설자만 멤버를 강퇴할 수 있습니다.",
          TARGET_REQUIRED:"강퇴할 멤버를 선택하세요.",
          CANNOT_KICK_SELF:"본인은 강퇴할 수 없습니다. 크루 해산 또는 리더 변경을 이용하세요.",
          TARGET_NOT_MEMBER:"현재 크루 멤버가 아닙니다.",
          CANNOT_KICK_LEADER:"개설자는 강퇴할 수 없습니다."
        })[data?.error] || "크루원을 강퇴하지 못했습니다.";
        toast(message);
        return;
      }

      closeModal();
      await Promise.all([
        loadMyOrganization(),
        loadStores(),
        loadHome(),
        loadRank()
      ]);
      toast(`${data?.member_name || "크루원"}을(를) 크루에서 제외했습니다.`);
    }catch(error){
      console.warn("BiteBoss kick organization member:", error);
      const message = String(error?.message || "");
      if(message.includes("Could not find the function") || message.includes("PGRST202")){
        toast("크루원 강퇴 기능이 서버에 아직 적용되지 않았습니다.");
      }else{
        toast("크루원을 강퇴하지 못했습니다.");
      }
    }finally{
      if(button) button.disabled = false;
    }
  }
  function openLeadershipTransferConfirm(userId, memberName){
    if(!organization?.is_leader){
      toast("현재 개설자만 리더를 변경할 수 있습니다.");
      return;
    }

    openModal("리더 변경", `
      <div class="organization-transfer-confirm">
        <span>새 개설자</span>
        <strong>${escapeHtml(memberName)}</strong>
        <p>${escapeHtml(organization?.name || "크루")}의 개설자 권한을 이 멤버에게 넘깁니다.</p>
        <div class="organization-transfer-rules">
          <p>XP 차감 <strong>0</strong></p>
          <p>재가입 대기 <strong>0일</strong></p>
          <p>보스 / 점령지 <strong>유지</strong></p>
        </div>
        <p class="organization-transfer-note">이전 개설자는 일반 멤버가 됩니다. 이후 조직을 탈퇴하면 일반 멤버 탈퇴 규칙이 적용됩니다.</p>
        <button
          id="organizationTransferConfirm"
          class="primary-btn"
          type="button"
          data-new-leader="${escapeAttr(userId)}">
          리더 변경
        </button>
      </div>
    `);

    $("#organizationTransferConfirm")?.addEventListener("click", transferOrganizationLeadership);
  }
  async function transferOrganizationLeadership(event){
    const button = event.currentTarget;
    const userId = String(button?.dataset?.newLeader || "").trim();
    if(!userId) return;

    button.disabled = true;

    try{
      const { data, error } = await sb.rpc("biteboss_transfer_organization_leadership", {
        p_new_leader_user_id:userId
      });
      if(error) throw error;

      if(!data?.ok){
        const message = ({
          MEMBER_LOGIN_REQUIRED:"회원 로그인이 필요합니다.",
          TARGET_REQUIRED:"새 개설자를 선택하세요.",
          ALREADY_LEADER:"이미 현재 개설자입니다.",
          LEADER_REQUIRED:"현재 개설자만 리더를 변경할 수 있습니다.",
          TARGET_NOT_MEMBER:"같은 크루의 멤버만 개설자로 지정할 수 있습니다."
        })[data?.error] || "리더 변경에 실패했습니다.";

        toast(message);
        return;
      }

      closeModal();
      await loadMyOrganization();
      toast(`${data.new_leader_name || "멤버"}에게 개설자 권한을 넘겼습니다.`);
    }catch(error){
      console.warn("BiteBoss transfer organization leadership:", error);
      toast("리더 변경에 실패했습니다.");
    }finally{
      button.disabled = false;
    }
  }


  function handlePlayerProfileOpen(event){
    if(event.target.closest("button,a,input,select,textarea,label,[data-kick-member],[data-transfer-leader]")) return;
    const target = event.target.closest("[data-player-profile]");
    if(!target) return;

    const userId = String(target.dataset.playerProfile || "").trim();
    if(!userId) return;

    if(target.matches("[data-activity-store]")){
      const storeId = target.dataset.activityStore;
      if(event.metaKey || event.ctrlKey){
        if(storeId) openStoreDetail(storeId);
        return;
      }
    }

    event.preventDefault();
    event.stopPropagation();

    const avatarHint = String(target.dataset.playerAvatar || "").trim();
    openPlayerProfile(userId, avatarHint);
  }

  async function fetchPlayerProfileData(userId){
    const params = { p_user_id:userId };

    const corrected = await sb.rpc("biteboss_player_profile_v766", params);
    if(!corrected.error) return corrected;

    const correctedMessage = String(corrected.error?.message || "");
    const correctedMissing = correctedMessage.includes("Could not find the function") || correctedMessage.includes("PGRST202");
    if(!correctedMissing) return corrected;

    const primary = await sb.rpc("biteboss_player_profile_v7568", params);
    if(!primary.error) return primary;

    const message = String(primary.error?.message || "");
    const missingRpc = message.includes("Could not find the function") || message.includes("PGRST202");
    if(!missingRpc) return primary;

    return sb.rpc("biteboss_player_profile", params);
  }

  async function openPlayerProfile(userId, avatarHint = ""){
    openModal("사용자 프로필", `<div class="app-state">사용자 정보를 불러오는 중…</div>`, { type:"player-profile" });

    try{
      const { data, error } = await fetchPlayerProfileData(userId);

      if(error) throw error;
      if(!data?.ok) throw new Error(data?.error || "PLAYER_LOAD_FAILED");

      if(data?.player){
        const sameAsCurrentProfile = Boolean(
          profile?.nickname &&
          data.player.nickname &&
          String(profile.nickname).trim() === String(data.player.nickname).trim()
        );

        data.player.avatar_url = String(
          data.player.avatar_url ||
          data.player.profile_avatar_url ||
          data.player.profile_image_url ||
          data.player.photo_url ||
          data.player.image_url ||
          avatarHint ||
          (sameAsCurrentProfile ? profile?.avatar_url : "") ||
          ""
        ).trim();
      }

      renderPlayerProfile(data, userId);
    }catch(error){
      console.warn("BiteBoss player profile:", error);
      const body = $("#modalBody");
      setRetryState(body, "플레이어 정보를 불러오지 못했습니다.", async () => {
        await openPlayerProfile(userId, avatarHint);
      });
    }
  }

  function getPlayerBattleRecord(data, recentActivity){
    const candidates = [
      data?.battle_record,
      data?.record,
      data?.player?.battle_record,
      data?.player?.record
    ];

    for(const candidate of candidates){
      if(!candidate || typeof candidate !== "object") continue;
      const wins = Math.max(0, Number(candidate.wins ?? candidate.win_count ?? candidate.victories ?? 0));
      const losses = Math.max(0, Number(candidate.losses ?? candidate.loss_count ?? candidate.defeats ?? 0));
      const explicitTotal = Number(candidate.total ?? candidate.total_battles ?? candidate.matches);
      const total = Number.isFinite(explicitTotal) ? Math.max(0, explicitTotal) : wins + losses;
      return { total:Math.max(total, wins + losses), wins, losses };
    }

    // v76.x profile RPCs already return the target player's battle activity.
    // Count only battles where that player was the challenger; visits, defenses and
    // crew membership events are not a player's W/L record.
    return (Array.isArray(recentActivity) ? recentActivity : []).reduce((record, row) => {
      if(!row?.as_challenger) return record;
      const result = String(row.result || "");
      if(result === "boss_win"){
        record.wins += 1;
        record.total += 1;
      }else if(result === "crew"){
        record.losses += 1;
        record.total += 1;
      }
      return record;
    }, { total:0, wins:0, losses:0 });
  }

  function renderPlayerProfile(data, userId){
    const player = data.player || {};
    const recentAll = Array.isArray(data.recent_activity) ? data.recent_activity : [];
    const battleRecord = getPlayerBattleRecord(data, recentAll);
    const recent = recentAll.slice(0, 3);

    // Modal shell is generic; the nickname is the hero title.
    setText("#modalTitle", "사용자 프로필");

    const orgLine = player.organization_name
      ? `${player.organization_name}${player.organization_role === "leader" ? " · 개설자" : ""}`
      : "소속 크루 없음";

    const recentHtml = recent.map(row => {
      const result = String(row.result || "");
      let title = "전투 기록";
      if(result === "boss_win") title = row.as_challenger ? "보스 점령" : "보스 상실";
      else if(result === "crew") title = row.as_challenger ? "점령 실패" : "방어 성공";
      else if(result === "boss_visit") title = "보스 활동";
      else if(result === "crew_kicked") title = "크루 강퇴";
      else if(result === "crew_left") title = "크루 탈퇴";
      else if(result === "crew_joined") title = "크루 합류";
      else if(result === "crew_disbanded") title = "크루 해산";
      else if(result === "crew_leader_changed") title = "리더 변경";

      const hasStore = Boolean(String(row.store_id || "").trim());
      const tag = hasStore ? "button" : "div";
      const attrs = hasStore
        ? `type="button" data-profile-store="${escapeAttr(row.store_id)}"`
        : `role="group"`;
      const subject = row.store_name || row.organization_name || "크루";

      return `
        <${tag} class="player-profile-history-row" ${attrs}>
          <div>
            <strong>${escapeHtml(title)}</strong>
            <span>${escapeHtml(subject)}</span>
          </div>
          <time>${escapeHtml(formatActivityTime(row.created_at))}</time>
        </${tag}>
      `;
    }).join("") || `<div class="app-state player-profile-empty">아직 전투 기록이 없습니다.</div>`;

    const body = $("#modalBody");
    if(!body) return;

    body.innerHTML = `
      <div class="player-profile-detail">
        <section class="player-profile-hero">
          ${bossAvatarMarkup(player.avatar_url || "", player.nickname || "사용자", "player-profile-avatar")}
          <div class="player-profile-hero-copy">
            <span>사용자</span>
            <strong>${escapeHtml(player.nickname || "사용자")}</strong>
            <p>${escapeHtml(orgLine)}</p>
          </div>
        </section>

        <section class="player-profile-stats" aria-label="사용자 기록">
          <div><span>레벨</span><strong>Lv ${Number(player.level || 1)}</strong></div>
          <div><span>XP</span><strong>${Number(player.xp || 0).toLocaleString("ko-KR")}</strong></div>
          <div><span>보스</span><strong>${Number(player.boss_count || 0)}</strong></div>
          <div><span>방문</span><strong>${Number(player.valid_visits || 0).toLocaleString("ko-KR")}</strong></div>
        </section>

        <section class="player-profile-record">
          <div class="player-profile-section-head">
            <span>전적</span>
            <strong>${Number(battleRecord.total || 0)}전</strong>
          </div>
          <div class="player-profile-record-grid">
            <p><span>승리</span><strong>${Number(battleRecord.wins || 0)}</strong></p>
            <p><span>패배</span><strong>${Number(battleRecord.losses || 0)}</strong></p>
          </div>
        </section>

        <section class="player-profile-history">
          <div class="player-profile-section-head">
            <span>최근 기록</span>
            <strong>${recent.length ? `최근 ${recent.length}건` : "0건"}</strong>
          </div>
          <div class="player-profile-history-list">${recentHtml}</div>
        </section>

      </div>
    `;

    $$("[data-profile-store]", body).forEach(button => {
      button.addEventListener("click", () => {
        const storeId = button.dataset.profileStore;
        closeModal();
        if(storeId){
          openStoreDetail(storeId, {
            source:"player_profile_battle",
            showStoreManagerCard:false
          });
        }
      });
    });

  }

  async function loadMyCommentHistory(page = 1){
    const section = $("#profileCommentSection");
    const list = $("#profileCommentList");
    const pagination = $("#profileCommentPagination");
    const totalEl = $("#profileCommentCount");
    if(!section || !list) return;

    if(!playerSession?.authenticated){
      section.classList.add("hidden");
      list.innerHTML = "";
      if(totalEl) totalEl.textContent = "0건";
      pagination?.classList.add("hidden");
      return;
    }

    const userId = String(
      playerSession?.player_user_id ||
      profile?.user_id ||
      authUser?.id ||
      ""
    ).trim();

    if(!userId){
      section.classList.add("hidden");
      return;
    }

    section.classList.remove("hidden");
    list.innerHTML = `<div class="app-state">한마디 기록을 불러오는 중…</div>`;

    const { data, error } = await sb.rpc("biteboss_player_comment_history_v7585", {
      p_user_id:userId,
      p_page:Math.max(1, Number(page || 1)),
      p_page_size:5
    });

    if(error){
      console.warn("BiteBoss my comment history:", error);
      setRetryState(list, "한마디 기록을 불러오지 못했습니다.", () => loadMyCommentHistory(page));
      return;
    }

    const payload = data && typeof data === "object" ? data : {};
    const items = Array.isArray(payload.items) ? payload.items : [];
    const total = Math.max(0, Number(payload.total || 0));
    const safePage = Math.max(1, Number(payload.page || page || 1));

    if(totalEl) totalEl.textContent = `${total.toLocaleString("ko-KR")}건`;

    list.innerHTML = items.length ? items.map(row => `
      <button class="player-profile-comment-row" type="button" data-profile-comment-store="${escapeAttr(row.store_id || "")}">
        <div class="player-profile-comment-meta">
          <strong>${escapeHtml(row.store_name || "매장")}</strong>
          <time>${escapeHtml(formatCommentTime(row.created_at))}${row.edited_at ? " · 수정됨" : ""}</time>
        </div>
        <p>${escapeHtml(row.body || "")}</p>
      </button>
    `).join("") : `<div class="app-state player-profile-empty">아직 남긴 한마디가 없습니다.</div>`;

    list.querySelectorAll("[data-profile-comment-store]").forEach(button => {
      button.addEventListener("click", () => {
        const storeId = button.dataset.profileCommentStore;
        if(storeId) openStoreDetail(storeId, { source:"my_profile_comment", showStoreManagerCard:false });
      });
    });

    renderPagination(pagination, safePage, total, 5, next => loadMyCommentHistory(next));
  }

  async function openCurrentOrganizationDetail(){
    const orgId = organization?.id;
    if(!orgId){
      toast("소속된 크루가 없습니다.");
      return;
    }

    await openOrganizationDetail(orgId);
  }


  function organizationMemberAvatar(member = {}){
    return String(
      member.avatar_url ||
      member.profile_avatar_url ||
      member.profile_image_url ||
      member.photo_url ||
      member.image_url ||
      ""
    ).trim();
  }

  function organizationMemberUserIds(member = {}){
    return [...new Set([
      member.user_id,
      member.player_user_id,
      member.member_user_id,
      member.profile_user_id,
      member.player_id
    ].map(value => String(value || "").trim()).filter(Boolean))];
  }

  async function hydrateOrganizationMemberAvatars(members = []){
    const source = Array.isArray(members) ? members : [];
    const hydrated = await Promise.all(source.map(async member => {
      if(organizationMemberAvatar(member)) return member;

      for(const userId of organizationMemberUserIds(member)){
        try{
          const { data:profileData, error:profileError } = await sb.rpc("biteboss_player_profile", {
            p_user_id:userId
          });
          if(profileError || !profileData?.ok || !profileData?.player) continue;
          const avatarUrl = organizationMemberAvatar(profileData.player);
          if(avatarUrl) return {...member, avatar_url:avatarUrl, user_id:member.user_id || userId};
        }catch(profileError){
          console.warn("BiteBoss crew member profile avatar:", profileError);
        }
      }

      return member;
    }));

    const needsRankFallback = hydrated.some(member => !organizationMemberAvatar(member));
    if(!needsRankFallback) return hydrated;

    try{
      const { data:rankData, error:rankError } = await sb.rpc("biteboss_game_rankings_v656", {
        p_scope:"players",
        p_limit:50
      });
      if(rankError || !Array.isArray(rankData)) return hydrated;

      const byUserId = new Map();
      const byNickname = new Map();
      rankData.forEach(row => {
        const avatarUrl = organizationMemberAvatar(row);
        if(!avatarUrl) return;
        const userId = String(row.user_id || "").trim();
        const nickname = String(row.nickname || "").trim();
        if(userId) byUserId.set(userId, avatarUrl);
        if(nickname && !byNickname.has(nickname)) byNickname.set(nickname, avatarUrl);
      });

      return hydrated.map(member => {
        if(organizationMemberAvatar(member)) return member;
        const matchedId = organizationMemberUserIds(member).find(userId => byUserId.has(userId));
        const nickname = String(member.nickname || member.username || "").trim();
        const avatarUrl = (matchedId && byUserId.get(matchedId)) || byNickname.get(nickname) || "";
        return avatarUrl ? {...member, avatar_url:avatarUrl} : member;
      });
    }catch(rankError){
      console.warn("BiteBoss crew member ranking avatar fallback:", rankError);
      return hydrated;
    }
  }

  async function openOrganizationDetail(orgId){
    openModal("크루 프로필", `<div class="store-detail-loading">크루 정보를 불러오는 중…</div>`, { type:"detail-sheet" });

    try{
      const { data, error } = await sb.rpc("biteboss_organization_detail", {
        p_organization_id:orgId
      });
      if(error) throw error;
      if(!data?.ok) throw new Error(data?.error || "CREW_LOAD_FAILED");

      if(Array.isArray(data.members) && data.members.length){
        data.members = await hydrateOrganizationMemberAvatars(data.members);
      }

      renderOrganizationDetail(data, orgId);
    }catch(error){
      console.warn("BiteBoss organization detail:", error);
      const body = $("#modalBody");
      if(body) body.innerHTML = `<div class="store-detail-empty is-error-state"><strong>크루 정보를 불러오지 못했습니다.</strong><button id="organizationDetailRetry" class="secondary-btn" type="button">다시 시도</button></div>`;
      $("#organizationDetailRetry")?.addEventListener("click", () => openOrganizationDetail(orgId));
    }
  }

  function territoryRecencyValue(row = {}){
    const value = row.started_at || row.captured_at || row.claimed_at || row.updated_at || row.created_at || "";
    const timestamp = value ? new Date(value).getTime() : 0;
    return Number.isFinite(timestamp) ? timestamp : 0;
  }

  function renderOrganizationDetail(data, requestedOrgId = ""){
    const org = data.organization || {};
    const members = Array.isArray(data.members) ? data.members : [];
    const allTerritories = Array.isArray(data.territories) ? data.territories : [];
    const isOwnOrganization = Boolean(
      organization?.id &&
      String(organization.id) === String(requestedOrgId || org.id || "")
    );
    const sortedTerritories = [...allTerritories].sort((a,b) => territoryRecencyValue(b) - territoryRecencyValue(a));
    const publicTerritories = sortedTerritories.slice(0,3);
    const leaderName = crewLeaderName(org, members);
    const CREW_PAGE_SIZE = 8;
    let territoryPage = 1;
    let memberPage = 1;

    setText("#modalTitle", "크루 프로필");

    const body = $("#modalBody");
    if(!body) return;

    const memberRowMarkup = member => {
      const memberName = String(member.nickname || member.username || "사용자").trim();
      const roleLabel = member.role === "leader" ? "개설자" : "멤버";
      const memberAvatar = String(
        member.avatar_url ||
        member.profile_avatar_url ||
        member.profile_image_url ||
        member.photo_url ||
        member.image_url ||
        ""
      ).trim();
      return `
        <article class="organization-detail-member">
          ${bossAvatarMarkup(memberAvatar, memberName, "organization-detail-member-avatar")}
          <div class="organization-detail-member-copy">
            <strong>${escapeHtml(memberName)}</strong>
            <span>${escapeHtml(roleLabel)}</span>
          </div>
        </article>
      `;
    };

    const territoryRegionKey = row => {
      const city = String(row.city || "").trim();
      const district = String(row.district || "").trim();
      return [city, district].filter(Boolean).join(" ") || "기타 지역";
    };

    const territoryRegionGroups = rows => {
      const groups = new Map();
      rows.forEach(row => {
        const key = territoryRegionKey(row);
        if(!groups.has(key)) groups.set(key, []);
        groups.get(key).push(row);
      });
      return [...groups.entries()]
        .map(([region, items]) => ({ region, items }))
        .sort((a,b) => b.items.length - a.items.length || a.region.localeCompare(b.region, "ko"));
    };

    const territoryStoreMarkup = row => {
      const protectedNow = Boolean(
        row.protected_until &&
        new Date(row.protected_until).getTime() > Date.now()
      );
      const privateStatus = protectedNow
        ? `보호 ${formatRemaining(row.protected_until)} 남음`
        : `방어력 ${Number(row.boss_defense || 0)}`;

      return `
        <button
          class="crew-territory-store"
          type="button"
          data-org-territory-store="${escapeAttr(row.store_id)}">
          <span class="crew-territory-store-copy">
            <strong>${escapeHtml(row.store_name || "매장")}</strong>
            ${row.category ? `<small>${escapeHtml(row.category)}</small>` : ""}
          </span>
          ${isOwnOrganization
            ? `<span class="crew-territory-store-meta"><b>${escapeHtml(row.boss_nickname || "보스")}</b><small>${escapeHtml(privateStatus)}</small></span>`
            : `<span class="crew-territory-store-arrow" aria-hidden="true">→</span>`}
        </button>
      `;
    };

    const territoryRegionCardMarkup = (group, index) => {
      const leadStore = group.items[0]?.store_name || "점령 매장";
      const extraCount = Math.max(0, group.items.length - 1);
      const summary = extraCount ? `${leadStore} 외 ${extraCount}곳` : leadStore;
      return `
        <article class="crew-territory-card" data-crew-region-card>
          <button
            class="crew-territory-card-toggle"
            type="button"
            aria-expanded="false"
            aria-controls="crewRegionStores${index}"
            data-crew-region-toggle>
            <span class="crew-territory-card-title">
              <strong>${escapeHtml(group.region)}</strong>
              <small>${group.items.length}곳 점령</small>
            </span>
            <span class="crew-territory-card-summary">
              <span>${escapeHtml(summary)}</span>
              <b aria-hidden="true">+</b>
            </span>
          </button>
          <div
            id="crewRegionStores${index}"
            class="crew-territory-card-stores hidden"
            data-crew-region-stores>
            ${group.items.map(territoryStoreMarkup).join("")}
          </div>
        </article>
      `;
    };

    const primaryRegion = territoryRegionGroups(sortedTerritories)[0]?.region || "";

    body.innerHTML = `
      <div class="organization-detail crew-profile-detail">
        <section class="player-profile-hero crew-profile-hero">
          <div class="player-profile-avatar crew-profile-avatar">
            ${String(org.avatar_url || "").trim()
              ? `<img src="${escapeAttr(org.avatar_url)}" alt="${escapeAttr(org.name || "크루")} 프로필" loading="eager" fetchpriority="high" decoding="async" />`
              : `<span aria-hidden="true">${escapeHtml(Array.from(String(org.name || "C"))[0] || "C")}</span>`}
          </div>
          <div class="player-profile-hero-copy crew-profile-hero-copy">
            <span>크루</span>
            <strong>${escapeHtml(org.name || "크루")}</strong>
            ${leaderName ? `<p>개설자 ${escapeHtml(leaderName)}</p>` : ""}
            ${primaryRegion ? `<p>주요 활동 지역 · ${escapeHtml(primaryRegion)}</p>` : ""}
          </div>
        </section>

        <section class="crew-profile-overview" aria-label="크루 기록">
          <div><strong>${Number(org.member_count || members.length || 0)}</strong><span>멤버</span></div>
          <div><strong>${Number(org.territory_count || allTerritories.length || 0)}</strong><span>점령지</span></div>
        </section>

        <div class="crew-detail-tabs" role="tablist" aria-label="크루 상세">
          <button class="crew-detail-tab active" type="button" role="tab" aria-selected="true" data-crew-detail-tab="territory">점령지</button>
          <button class="crew-detail-tab" type="button" role="tab" aria-selected="false" data-crew-detail-tab="members">멤버</button>
        </div>

        <section class="organization-detail-section crew-detail-panel" data-crew-detail-panel="territory">
          <div class="crew-detail-section-head">
            <h4>${isOwnOrganization ? "점령지" : "최근 점령지"}</h4>
            <span>${isOwnOrganization ? `${sortedTerritories.length}곳` : `${publicTerritories.length}곳`}</span>
          </div>
          <div class="organization-territory-list" data-crew-territory-list></div>
          <nav class="list-pagination crew-detail-pagination hidden" data-crew-territory-pagination aria-label="크루 점령지 페이지"></nav>
          ${!isOwnOrganization && Number(org.territory_count || allTerritories.length) > publicTerritories.length
            ? `<p class="crew-public-note">다른 크루의 점령지는 최근 3곳만 공개됩니다.</p>`
            : ""}
        </section>

        <section class="organization-detail-section crew-detail-panel hidden" data-crew-detail-panel="members">
          <div class="crew-detail-section-head"><h4>멤버</h4><span>${members.length}명</span></div>
          <div class="organization-detail-members" data-crew-member-list></div>
          <nav class="list-pagination crew-detail-pagination hidden" data-crew-member-pagination aria-label="크루 멤버 페이지"></nav>
        </section>
      </div>
    `;

    const bindTerritoryRows = () => {
      $$('[data-org-territory-store]', body).forEach(button => {
        button.addEventListener("click", () => {
          const storeId = button.dataset.orgTerritoryStore;
          closeModal();
          if(storeId) openStoreDetail(storeId);
        });
      });
    };

    const renderTerritoryPage = () => {
      const list = $('[data-crew-territory-list]', body);
      const nav = $('[data-crew-territory-pagination]', body);
      if(!list || !nav) return;

      const source = isOwnOrganization ? sortedTerritories : publicTerritories;
      const groups = territoryRegionGroups(source);
      const REGION_PAGE_SIZE = 4;
      const slice = pageSlice(groups, territoryPage, REGION_PAGE_SIZE);
      territoryPage = slice.page;

      list.innerHTML = slice.rows.map((group,index) => territoryRegionCardMarkup(group, index)).join("") ||
        `<div class="store-detail-empty">아직 점령지가 없습니다.</div>`;
      bindTerritoryRows();

      $$('[data-crew-region-toggle]', list).forEach(toggle => {
        toggle.addEventListener("click", () => {
          const card = toggle.closest("[data-crew-region-card]");
          const stores = card?.querySelector("[data-crew-region-stores]");
          if(!card || !stores) return;
          const opening = toggle.getAttribute("aria-expanded") !== "true";

          $$('[data-crew-region-card]', list).forEach(otherCard => {
            const otherToggle = otherCard.querySelector("[data-crew-region-toggle]");
            const otherStores = otherCard.querySelector("[data-crew-region-stores]");
            otherToggle?.setAttribute("aria-expanded", "false");
            otherStores?.classList.add("hidden");
          });

          toggle.setAttribute("aria-expanded", opening ? "true" : "false");
          stores.classList.toggle("hidden", !opening);
        });
      });

      renderPagination(nav, territoryPage, groups.length, REGION_PAGE_SIZE, nextPage => {
        territoryPage = nextPage;
        renderTerritoryPage();
        $('[data-crew-detail-panel="territory"]', body)?.scrollIntoView({block:"nearest"});
      });
    };

    const renderMemberPage = () => {
      const list = $('[data-crew-member-list]', body);
      const nav = $('[data-crew-member-pagination]', body);
      if(!list || !nav) return;
      const slice = pageSlice(members, memberPage, CREW_PAGE_SIZE);
      memberPage = slice.page;
      list.innerHTML = slice.rows.map(memberRowMarkup).join("") || `<div class="store-detail-empty">멤버가 없습니다.</div>`;
      renderPagination(nav, memberPage, members.length, CREW_PAGE_SIZE, nextPage => {
        memberPage = nextPage;
        renderMemberPage();
        $('[data-crew-detail-panel="members"]', body)?.scrollIntoView({block:"nearest"});
      });
    };

    renderTerritoryPage();
    renderMemberPage();

    $$('[data-crew-detail-tab]', body).forEach(tab => {
      tab.addEventListener("click", () => {
        const target = tab.dataset.crewDetailTab;
        $$('[data-crew-detail-tab]', body).forEach(item => {
          const active = item === tab;
          item.classList.toggle("active", active);
          item.setAttribute("aria-selected", active ? "true" : "false");
        });
        $$('[data-crew-detail-panel]', body).forEach(panel => {
          panel.classList.toggle("hidden", panel.dataset.crewDetailPanel !== target);
        });
      });
    });
  }


  function openIndependentOrganizationCreate(){
    if(!playerSession?.authenticated){
      toast("회원 로그인이 필요합니다.");
      return;
    }

    if(!organization?.id || organization?.is_leader){
      toast("현재 조직의 일반 멤버만 독립할 수 있습니다.");
      return;
    }

    const bossCount = Number(summary?.active_boss_count || 0);
    if(bossCount < 1){
      toast("한 매장의 보스가 된 뒤 독립할 수 있습니다.");
      return;
    }

    openModal("Found your organization", `
      <div class="form-grid organization-create-form independence-create-form">
        <div class="independence-summary">
          <span>PROMOTION</span>
          <strong>Boss → Founder</strong>
          <p>현재 보스 매장 ${bossCount}곳을 기반으로 자기 조직을 만듭니다.</p>
        </div>
        <label>
          Organization name
          <input id="independentOrganizationNameInput" class="input" maxlength="30" autocomplete="off" placeholder="NIGHT BITE" />
        </label>
        <div class="independence-rules">
          <p>XP 차감 <strong>0</strong></p>
          <p>Independent founding cooldown <strong>14 days</strong></p>
          <p>현재 보스 매장 <strong>유지</strong></p>
        </div>
        <p class="organization-create-note">활성 Boss가 있어야 독립할 수 있습니다. 독립 창설 후 14일 동안 다시 독립 창설할 수 없습니다. 현재 Boss 기록은 유지됩니다.</p>
        <button id="independentOrganizationCreateSubmit" class="primary-btn" type="button">Found organization</button>
      </div>
    `);

    $("#independentOrganizationCreateSubmit")?.addEventListener("click", foundIndependentOrganization);
  }

  async function foundIndependentOrganization(){
    const name = String($("#independentOrganizationNameInput")?.value || "").trim().replace(/\s+/g," ");
    if(name.length < 2 || name.length > 30){
      toast("조직명은 2~30자로 입력하세요.");
      return;
    }

    const button = $("#independentOrganizationCreateSubmit");
    if(button) button.disabled = true;

    try{
      const { data, error } = await sb.rpc("biteboss_found_independent_organization_v62", {
        p_name:name
      });
      if(error) throw error;

      if(!data?.ok){
        const message = ({
          MEMBER_LOGIN_REQUIRED:"회원 로그인이 필요합니다.",
          INVALID_NAME:"조직명은 2~30자로 입력하세요.",
          CREW_MEMBERSHIP_REQUIRED:"현재 소속 조직이 없습니다.",
          ALREADY_CREW_LEADER:"이미 자기 조직의 Founder입니다.",
          CREW_NOT_FOUND:"현재 조직 정보를 찾지 못했습니다.",
          BOSS_REQUIRED:"현재 Boss인 매장이 1곳 이상 있어야 독립할 수 있습니다.",
          INDEPENDENCE_COOLDOWN:data?.cooldown_until ? `다시 독립하려면 ${formatRemaining(data.cooldown_until)} 남았습니다.` : "독립 창설 쿨다운 중입니다.",
          NAME_TAKEN:"이미 사용 중인 조직명입니다.",
          NAME_RESERVED:"대소문자·공백만 다른 동일 조직명이 이미 사용 중입니다."
        })[data?.error] || "독립 조직을 만들지 못했습니다.";

        toast(message);
        return;
      }

      organization = data.new_organization || null;
      organizationCooldown = null;
      organizationInvites = [];

      closeModal();

      await Promise.all([
        loadHome(),
        loadMyOrganization(),
        loadRank()
      ]);

      toast(`${organization?.name || name} 창설 · Boss ${Number(data.boss_count || 0)}곳이 새 Territory가 되었습니다.`);
    }catch(error){
      console.warn("BiteBoss independent organization:", error);
      toast("독립 조직을 만들지 못했습니다.");
    }finally{
      if(button) button.disabled = false;
    }
  }


  async function openOrganizationInvite(){
    if(!organization?.id || !organization?.is_leader){
      toast("크루 개설자만 초대 QR을 만들 수 있습니다.");
      return;
    }

    openModal(escapeHtml(organization?.name || "크루"), `
      <div class="crew-invite-shell">
        <div class="crew-invite-loading">QR을 준비하는 중…</div>
      </div>
    `, { type:"detail-sheet" });

    await loadCrewInviteQr();
  }

  async function loadCrewInviteQr(forceNew = false){
    const shell = $(".crew-invite-shell");
    if(!shell) return;

    try{
      let data = null;

      if(!forceNew){
        const current = await sb.rpc("biteboss_crew_qr_invite_status_v624");
        if(current.error) throw current.error;
        if(current.data?.ok && current.data?.active){
          data = current.data;
        }
      }

      if(!data){
        const created = await sb.rpc("biteboss_create_crew_qr_invite_v624");
        if(created.error) throw created.error;
        data = created.data;
      }

      if(!data?.ok){
        const message = ({
          MEMBER_LOGIN_REQUIRED:"회원 로그인이 필요합니다.",
          LEADER_REQUIRED:"크루 개설자만 초대 QR을 만들 수 있습니다.",
          CREW_NOT_FOUND:"크루 정보를 찾지 못했습니다."
        })[data?.error] || "크루 초대 QR을 만들지 못했습니다.";
        shell.innerHTML = `<p class="crew-join-state">${escapeHtml(message)}</p>`;
        return;
      }

      const token = String(data.token || "").trim();
      const shareUrl = crewInviteShareUrl(token);
      const expires = formatRemaining(data.expires_at);
      const uses = Number(data.use_count || 0);
      const maxUses = Number(data.max_uses || config.crew_qr_max_uses || 30);

      shell.innerHTML = `
        <div class="crew-invite-head">
          <p>QR을 공유하면 상대방이 크루 정보를 확인한 뒤 가입할 수 있습니다.</p>
        </div>

        <div class="crew-invite-qr-wrap">
          <div id="crewInviteQr" class="crew-invite-qr" aria-label="크루 초대 QR"></div>
        </div>

        <div class="crew-invite-facts">
          <span>만료까지 ${escapeHtml(expires)}</span>
          <span>${uses}/${maxUses}명 참여</span>
        </div>

        <div class="crew-invite-actions">
          <button id="crewInviteShareBtn" class="primary-btn crew-invite-share" type="button">QR 공유</button>
          <button id="crewInviteNewBtn" class="secondary-btn" type="button">새 QR 만들기</button>
          <button id="crewInviteRevokeBtn" class="secondary-btn danger-text" type="button">QR 폐기</button>
        </div>

        <details class="crew-id-invite">
          <summary>ID로 직접 초대</summary>
          <div class="organization-invite-form">
            <label>
              사용자 ID
              <input id="organizationInviteUsername" class="input" maxlength="32" autocapitalize="none" autocomplete="off" placeholder="사용자 ID" />
            </label>
            <p>ID 초대는 보조 수단입니다. 상대방이 초대를 수락해야 가입됩니다.</p>
            <button id="organizationInviteSubmit" class="secondary-btn wide" type="button">초대 보내기</button>
          </div>
        </details>
      `;

      await renderCrewInviteQr(shareUrl);

      $("#crewInviteShareBtn")?.addEventListener("click", () => shareCrewInvite(shareUrl));
      $("#crewInviteNewBtn")?.addEventListener("click", rotateCrewInviteQr);
      $("#crewInviteRevokeBtn")?.addEventListener("click", revokeCrewInviteQr);
      $("#organizationInviteSubmit")?.addEventListener("click", sendOrganizationInvite);
    }catch(error){
      console.warn("BiteBoss crew invite QR:", error);
      shell.innerHTML = `<p class="crew-join-state">크루 초대 QR을 불러오지 못했습니다.</p>`;
    }
  }

  async function renderCrewInviteQr(value){
    const target = $("#crewInviteQr");
    if(!target) return;

    target.innerHTML = "";

    if(!window.QRCode && !await ensureRuntimeDependency("qrcode")){
      target.innerHTML = `<div class="crew-qr-fallback">QR을 사용할 수 없습니다.</div>`;
      return;
    }
    if(!document.body.contains(target)) return;

    new QRCode(target, {
      text:value,
      width:220,
      height:220,
      correctLevel:QRCode.CorrectLevel.M
    });
  }

  async function shareCrewInvite(url){
    const shareValue = String(url || "");
    const isPublicUrl = /^https?:\/\//i.test(shareValue);

    if(!isPublicUrl){
      toast("앱 출시 전 app-config.js의 publicAppUrl에 공개 HTTPS 주소를 설정하세요.");
      return;
    }

    const payload = {
      title:`${organization?.name || "BiteBoss Crew"} · BiteBoss`,
      text:`Join ${organization?.name || "my Crew"} on BiteBoss`,
      url:shareValue
    };

    try{
      if(navigator.share){
        await navigator.share(payload);
        return;
      }

      if(navigator.clipboard?.writeText){
        await navigator.clipboard.writeText(shareValue);
        toast("Crew 초대 링크를 복사했습니다.");
        return;
      }

      toast("이 기기에서는 공유 기능을 사용할 수 없습니다.");
    }catch(error){
      if(error?.name !== "AbortError") console.warn("BiteBoss crew share:", error);
    }
  }

  async function rotateCrewInviteQr(){
    const button = $("#crewInviteNewBtn");
    if(button) button.disabled = true;

    try{
      const revoked = await sb.rpc("biteboss_revoke_crew_qr_invite_v624");
      if(revoked.error) throw revoked.error;
      await loadCrewInviteQr(true);
    }catch(error){
      console.warn("BiteBoss rotate crew QR:", error);
      toast("새 Crew QR을 만들지 못했습니다.");
    }finally{
      if(button) button.disabled = false;
    }
  }

  async function revokeCrewInviteQr(){
    const button = $("#crewInviteRevokeBtn");
    if(button) button.disabled = true;

    try{
      const { data, error } = await sb.rpc("biteboss_revoke_crew_qr_invite_v624");
      if(error) throw error;
      if(!data?.ok) throw new Error(data?.error || "REVOKE_FAILED");

      const shell = $(".crew-invite-shell");
      if(shell){
        shell.innerHTML = `
          <div class="crew-invite-revoked">
            <strong>QR이 폐기되었습니다</strong>
            <p>기존 QR은 더 이상 사용할 수 없습니다.</p>
            <button id="crewInviteCreateAgainBtn" class="primary-btn" type="button">새 QR 만들기</button>
          </div>
        `;
        $("#crewInviteCreateAgainBtn")?.addEventListener("click", () => loadCrewInviteQr(true));
      }
    }catch(error){
      console.warn("BiteBoss revoke crew QR:", error);
      toast("Crew QR을 취소하지 못했습니다.");
    }finally{
      if(button) button.disabled = false;
    }
  }

  async function sendOrganizationInvite(){
    const username = String($("#organizationInviteUsername")?.value || "").trim().toLowerCase();
    if(!username){
      toast("초대할 회원 ID를 입력하세요.");
      return;
    }

    const button = $("#organizationInviteSubmit");
    if(button) button.disabled = true;

    try{
      const { data, error } = await sb.rpc("biteboss_organization_invite_member_v62", {
        p_username:username
      });
      if(error) throw error;

      if(!data?.ok){
        const message = ({
          MEMBER_LOGIN_REQUIRED:"회원 로그인이 필요합니다.",
          USERNAME_REQUIRED:"회원 ID를 입력하세요.",
          LEADER_REQUIRED:"Founder만 초대할 수 있습니다.",
          MEMBER_NOT_FOUND:"해당 회원 ID를 찾지 못했습니다.",
          CANNOT_INVITE_SELF:"자기 자신은 초대할 수 없습니다.",
          ALREADY_IN_CREW:"이미 크루에 소속된 회원입니다.",
          INVITE_ALREADY_PENDING:"이미 초대를 보낸 회원입니다.",
          INVITE_RATE_LIMIT_TARGET:data?.retry_at ? `같은 회원은 ${formatRemaining(data.retry_at)} 뒤 다시 초대할 수 있습니다.` : "같은 회원에게 너무 자주 초대했습니다.",
          INVITE_RATE_LIMIT_DAILY:"오늘 보낼 수 있는 Crew 초대 한도에 도달했습니다.",
          CREW_COOLDOWN:data?.cooldown_until
            ? `상대방의 Crew 쿨다운이 ${formatRemaining(data.cooldown_until)} 남았습니다.`
            : "상대방이 Crew 쿨다운 중입니다."
        })[data?.error] || "초대를 보내지 못했습니다.";

        toast(message);
        return;
      }

      toast(`${data.invitee_username || username}에게 Crew 초대를 보냈습니다.`);
    }catch(error){
      console.warn("BiteBoss crew ID invite:", error);
      toast("Crew 초대를 보내지 못했습니다.");
    }finally{
      if(button) button.disabled = false;
    }
  }


  async function handleOrganizationInviteAction(event){
    const button = event.target.closest("[data-org-invite]");
    if(!button) return;

    const inviteId = button.dataset.orgInvite;
    const accept = button.dataset.accept === "true";
    if(!inviteId) return;

    button.disabled = true;

    try{
      const { data, error } = await sb.rpc("biteboss_respond_organization_invite", {
        p_invite_id:inviteId,
        p_accept:accept
      });
      if(error) throw error;

      if(!data?.ok){
        const message = ({
          MEMBER_LOGIN_REQUIRED:"회원 로그인이 필요합니다.",
          INVITE_NOT_FOUND:"초대를 찾지 못했습니다.",
          INVITE_NOT_PENDING:"이미 만료되거나 처리된 초대입니다.",
          ALREADY_IN_CREW:"이미 조직에 소속되어 있습니다.",
          CREW_NOT_FOUND:"조직이 존재하지 않습니다.",
          CREW_COOLDOWN:data?.cooldown_until
            ? `조직 가입 쿨다운이 ${formatRemaining(data.cooldown_until)} 남았습니다.`
            : "조직 가입 쿨다운 중입니다."
        })[data?.error] || "초대를 처리하지 못했습니다.";

        toast(message);
        await loadMyOrganization();
        return;
      }

      if(data.accepted){
        organization = data.organization || null;
        organizationInvites = [];
        toast(`${organization?.name || "조직"}에 가입했습니다.`);
      }else{
        toast("Crew 초대를 거절했습니다.");
      }

      await loadMyOrganization();
    }catch(error){
      console.warn("BiteBoss organization invitation response:", error);
      toast("초대를 처리하지 못했습니다.");
    }finally{
      button.disabled = false;
    }
  }

  function openOrganizationLeave(){
    if(!organization?.id){
      toast("소속된 크루가 없습니다.");
      return;
    }

    const isLeader = Boolean(organization.is_leader);
    const memberCount = Number(organization.member_count || 0);

    if(isLeader && memberCount > 1){
      toast("멤버가 남아 있습니다. 개설자를 먼저 이전해야 합니다.");
      return;
    }

    const penaltyPercent = isLeader ? 15 : 10;
    const cooldownDays = isLeader ? 14 : 7;
    const title = isLeader ? "크루 해산" : "크루 탈퇴";
    const orgName = String(organization.name || "크루").trim();

    openModal(title, `
      <div class="organization-leave-confirm">
        <section class="organization-leave-summary">
          <strong class="organization-leave-name">${escapeHtml(orgName)}</strong>
          <div class="organization-leave-copy">
            <p>현재 보스 매장은 유지되지만 이 크루의 점령지에서는 제외됩니다.</p>
            <p>탈퇴 후 XP는 최대 ${penaltyPercent}% 차감되고 ${cooldownDays}일 동안 조직 가입·창설이 제한됩니다.</p>
          </div>
        </section>
        ${isLeader ? `
          <section class="organization-disband-confirm">
            <label for="organizationDisbandNameConfirm">해산 확인</label>
            <input id="organizationDisbandNameConfirm" class="input" autocomplete="off" placeholder="${escapeAttr(orgName)}" />
            <p class="organization-disband-note">실수 방지를 위해 크루명을 정확히 입력해야 해산할 수 있습니다.</p>
          </section>
        ` : ""}
        <button id="organizationLeaveConfirm" class="danger-btn organization-leave-submit" type="button">${isLeader ? "크루 해산" : "크루 탈퇴"}</button>
      </div>
    `);

    $("#organizationLeaveConfirm")?.addEventListener("click", leaveOrganization);
  }

  async function leaveOrganization(){
    const button = $("#organizationLeaveConfirm");
    if(button) button.disabled = true;

    const isLeader = Boolean(organization?.is_leader);
    const confirmation = isLeader
      ? String($("#organizationDisbandNameConfirm")?.value || "").trim().replace(/\s+/g," ")
      : "";

    if(isLeader && confirmation !== String(organization?.name || "").trim().replace(/\s+/g," ")){
      toast("조직명을 정확히 입력하세요.");
      if(button) button.disabled = false;
      return;
    }

    try{
      const { data, error } = await sb.rpc("biteboss_leave_organization_v62", {
        p_confirm_name:confirmation || null
      });
      if(error) throw error;

      if(!data?.ok){
        const message = ({
          MEMBER_LOGIN_REQUIRED:"회원 로그인이 필요합니다.",
          NOT_IN_CREW:"소속된 크루가 없습니다.",
          CREW_NOT_FOUND:"조직 정보를 찾지 못했습니다.",
          LEADER_TRANSFER_REQUIRED:"멤버가 남아 있습니다. 개설자를 먼저 이전해야 합니다.",
          DISBAND_CONFIRMATION_REQUIRED:"해산하려면 조직명을 정확히 입력해야 합니다."
        })[data?.error] || "조직을 탈퇴하지 못했습니다.";

        toast(message);
        return;
      }

      organization = null;
      organizationCooldown = {
        active:true,
        cooldown_until:data.cooldown_until,
        seconds_remaining:0,
        reason:"leave"
      };

      closeModal();

      await Promise.all([
        loadHome(),
        loadMyOrganization()
      ]);

      const penalty = Number(data.xp_penalty || 0);
      const days = Number(data.cooldown_days || 0);
      toast(`크루 탈퇴 완료 · XP -${penalty.toLocaleString("ko-KR")} · ${days}일 제한`);
    }catch(error){
      console.warn("BiteBoss leave organization:", error);
      toast("크루를 탈퇴하지 못했습니다.");
    }finally{
      if(button) button.disabled = false;
    }
  }


  function updateProfileUi(){
    const loggedIn = Boolean(playerSession?.authenticated);
    const profilePage = $("#page-profile");
    profilePage?.classList.toggle("is-guest", !loggedIn);
    profilePage?.classList.toggle("is-member", loggedIn);
    $("#profileGuestInfo")?.classList.toggle("hidden", loggedIn);
    $("#page-profile .profile-actions")?.classList.toggle("hidden", loggedIn);

    const nickname = loggedIn ? (profile?.nickname || "보스") : "게스트";
    const avatar = loggedIn ? (profile?.avatar_url || "") : "";
    const organizationName = loggedIn ? String(organization?.name || "").trim() : "";
    const homeDisplayName = organizationName ? `${nickname} · ${organizationName}` : nickname;

    setText("#profileName", nickname);
    setText("#homeProfileName", homeDisplayName);
    const profileMeta = $("#profileMeta");
    if(profileMeta){
      const metaText = loggedIn
        ? "개인 프로필"
        : "로그인하면 점령 기록과 크루를 관리할 수 있습니다.";
      profileMeta.textContent = metaText;
      profileMeta.classList.toggle("hidden", !metaText);
    }
    setText("#homeProfileMeta", loggedIn
      ? (organizationName ? `${organizationName} · 점령지 ${Number(organization.territory_count || 0)}개` : "매장 가까이 머물거나 QR을 스캔해 보스를 차지하세요.")
      : "로그인하면 보스 기록을 쌓을 수 있습니다.");

    renderProfilePhoto("#homeProfilePhoto", "#homeProfileFallback", avatar);
    renderProfilePhoto("#profilePhoto", "#profileFallback", avatar);

    const addStore = $("#addStoreBtn");
    const deleteAccount = $("#deleteAccountBtn");
    const logout = $("#logoutBtn");
    addStore?.classList.toggle("hidden", !loggedIn);
    deleteAccount?.classList.toggle("hidden", !loggedIn);
    logout?.classList.toggle("hidden", !loggedIn);
    setText("#memberSessionLabel", "");
    renderOrganizationUi();
  }

  function resetMemberSummaryUi(){
    summary = null;
    setText("#homeBossCount", 0);
    setText("#myBossCount", 0);
    setText("#myCrewCount", 0);
    setText("#myLevel", "Lv 1");
    setText("#homeCheckinCount", 0);
    setText("#myCheckinCount", 0);
    setText("#homeStreakCount", 0);
    setText("#homeXp", "Lv 1 · 0 XP");
    updateHomeProtectionMeter(null);
    updateProfileMeter(0);
    updateRankMeter(0);
    const history = $("#myHistory");
    if(history) history.innerHTML = `<div class="activity-empty">로그인 후 전투 기록을 확인할 수 있습니다.</div>`;
    const activity = $("#profileActivity");
    if(activity) activity.innerHTML = `<div class="activity-empty">로그인 후 전투 기록을 확인할 수 있습니다.</div>`;
    const commentSection = $("#profileCommentSection");
    commentSection?.classList.add("hidden");
    const commentList = $("#profileCommentList");
    if(commentList) commentList.innerHTML = "";
    setText("#profileCommentCount", "0건");
    $("#profileCommentPagination")?.classList.add("hidden");
  }

  function renderProfilePhoto(imageSelector, fallbackSelector, url){
    const image = $(imageSelector);
    const fallback = $(fallbackSelector);
    const customUrl = String(url || "").trim();
    const resolvedUrl = customUrl || defaultProfileImageUrl();
    const hasPhoto = Boolean(resolvedUrl);
    if(image){
      if(hasPhoto){
        image.decoding = customUrl ? "async" : "sync";
        image.fetchPriority = customUrl ? "auto" : "high";
        if(image.getAttribute("src") !== resolvedUrl) image.src = resolvedUrl;
        image.classList.remove("hidden");
      }else{
        image.removeAttribute("src");
        image.classList.add("hidden");
      }
    }
    fallback?.classList.toggle("hidden", hasPhoto);
  }


  function isNativeApp(){
    try{
      return Boolean(window.Capacitor?.isNativePlatform?.()) ||
        (typeof window.Capacitor?.getPlatform === "function" && window.Capacitor.getPlatform() !== "web");
    }catch{
      return false;
    }
  }

  function pushPlugin(){
    return window.Capacitor?.Plugins?.PushNotifications || null;
  }

  async function setupPushListeners(){
    if(pushListenersBound || !isNativeApp()) return;
    const push = pushPlugin();
    if(!push?.addListener) return;
    pushListenersBound = true;

    await push.addListener("registration", async token => {
      pushDeviceToken = String(token?.value || "").trim();
      if(!pushDeviceToken || !playerSession?.authenticated) return;
      try{
        const { data, error } = await sb.rpc("biteboss_register_push_device_v627", {
          p_token:pushDeviceToken,
          p_platform:"ios",
          p_environment:String(cfg.pushEnvironment || "production")
        });
        if(error) throw error;
        if(!data?.ok) throw new Error(data?.error || "PUSH_REGISTER_FAILED");
        try{ localStorage.setItem("biteboss-push-token", pushDeviceToken); }catch{}
          }catch(error){
        console.warn("BiteBoss push token register:", error);
      }
    });

    await push.addListener("registrationError", error => {
      console.warn("BiteBoss push registration:", error);
      pushPermissionState = "error";
      });

    await push.addListener("pushNotificationReceived", async notification => {
      const data = notification?.data || {};
      const title = String(notification?.title || notificationKindLabel(data.kind));
      if(title) toast(title);
      await refreshPushInboxSummary();
    });

    await push.addListener("pushNotificationActionPerformed", async action => {
      const data = action?.notification?.data || {};
      await handlePushAction(data);
      await refreshPushInboxSummary();
    });
  }

  async function handlePushAction(data = {}){
    const kind = String(data.kind || "");
    const storeId = String(data.store_id || "").trim();

    if(storeId){
      openTab("stores");
      await loadStores();
      await openStoreDetail(storeId);
      return;
    }

    if(kind.startsWith("crew_")){
      openTab("profile");
      await loadMyOrganization();
      await loadGameActivity();
      return;
    }

    openTab("profile");
  }

  async function readPushPermission(){
    if(!isNativeApp()){
      pushPermissionState = "web";
      return pushPermissionState;
    }
    const push = pushPlugin();
    if(!push?.checkPermissions){
      pushPermissionState = "unavailable";
      return pushPermissionState;
    }
    try{
      const result = await push.checkPermissions();
      pushPermissionState = String(result?.receive || "prompt");
    }catch(error){
      console.warn("BiteBoss push permission:", error);
      pushPermissionState = "error";
    }
    return pushPermissionState;
  }

  async function registerPushIfGranted(){
    if(!isNativeApp() || !playerSession?.authenticated) return false;
    const push = pushPlugin();
    if(!push?.register) return false;
    const permission = await readPushPermission();
    if(permission !== "granted") return false;
    try{
      await setupPushListeners();
      await push.register();
      return true;
    }catch(error){
      console.warn("BiteBoss push register:", error);
      return false;
    }
  }

  async function enablePushNotifications(){
    if(!playerSession?.authenticated){
      openMemberLogin();
      return;
    }
    if(!isNativeApp()){
      toast("푸시 알림은 iOS 앱에서 사용할 수 있습니다.");
      return;
    }
    const push = pushPlugin();
    if(!push?.requestPermissions || !push?.register){
      toast("이 빌드에서는 푸시 알림을 사용할 수 없습니다.");
      return;
    }

    try{
      await setupPushListeners();
      let permission = await readPushPermission();
      if(permission !== "granted"){
        const result = await push.requestPermissions();
        permission = String(result?.receive || "denied");
        pushPermissionState = permission;
      }

      if(permission !== "granted"){
        toast("알림 권한이 허용되지 않았습니다. iPhone 설정에서 BiteBoss 알림을 허용해 주세요.");
            return;
      }

      await push.register();
      await sb.rpc("biteboss_update_notification_preferences_v627", {
        p_push_enabled:true,
        p_boss_events:pushPreferences?.boss_events ?? true,
        p_crew_events:pushPreferences?.crew_events ?? true,
        p_store_offers:pushPreferences?.store_offers ?? false,
        p_system_events:pushPreferences?.system_events ?? true
      });
      await refreshNotificationState();
      await loadNotificationInbox();
      renderNotificationSettingsModal();
      toast("BiteBoss 알림을 켰습니다.");
    }catch(error){
      console.warn("BiteBoss enable push:", error);
      toast("알림을 켜지 못했습니다.");
    }
  }

  async function disablePushNotifications(){
    if(!playerSession?.authenticated) return;
    try{
      await sb.rpc("biteboss_update_notification_preferences_v627", {
        p_push_enabled:false,
        p_boss_events:pushPreferences?.boss_events ?? true,
        p_crew_events:pushPreferences?.crew_events ?? true,
        p_store_offers:pushPreferences?.store_offers ?? false,
        p_system_events:pushPreferences?.system_events ?? true
      });
      if(pushDeviceToken){
        await sb.rpc("biteboss_unregister_push_device_v627", { p_token:pushDeviceToken });
      }
      await refreshNotificationState();
      await loadNotificationInbox();
      renderNotificationSettingsModal();
      toast("BiteBoss 푸시 알림을 껐습니다.");
    }catch(error){
      console.warn("BiteBoss disable push:", error);
      toast("알림 설정을 변경하지 못했습니다.");
    }
  }

  async function refreshNotificationState({ registerIfGranted = false } = {}){
    if(!playerSession?.authenticated){
      pushPreferences = null;
      pushUnreadCount = 0;
      pushPermissionState = isNativeApp() ? "unknown" : "web";
        return;
    }

    await Promise.all([
      loadNotificationPreferences(),
      refreshPushInboxSummary(),
      readPushPermission()
    ]);

    if(registerIfGranted && pushPermissionState === "granted" && pushPreferences?.push_enabled !== false){
      await registerPushIfGranted();
    }
  }

  async function loadNotificationPreferences(){
    try{
      const { data, error } = await sb.rpc("biteboss_my_notification_preferences_v627");
      if(error) throw error;
      pushPreferences = data || null;
    }catch(error){
      console.warn("BiteBoss notification preferences:", error);
      pushPreferences = null;
    }
  }

  async function refreshPushInboxSummary(){
    if(!playerSession?.authenticated){
      pushUnreadCount = 0;
        return;
    }
    try{
      const { data, error } = await sb.rpc("biteboss_notification_summary_v627");
      if(error) throw error;
      pushUnreadCount = Math.max(0, Number(data?.unread_count || 0));
      }catch(error){
      console.warn("BiteBoss notification summary:", error);
    }
  }

  async function markNotificationsRead(){
    try{
      const { error } = await sb.rpc("biteboss_mark_notifications_read_v627");
      if(error) throw error;
      pushUnreadCount = 0;
      }catch(error){
      console.warn("BiteBoss mark notifications read:", error);
    }
  }

  async function loadNotificationInbox(){
    try{
      const { data, error } = await sb.rpc("biteboss_my_notifications_v627", { p_limit:50 });
      if(error) throw error;
      window.__BITEBOSS_NOTIFICATION_INBOX__ = (Array.isArray(data) ? data : []).map(item => ({
        ...item,
        __was_unread:notificationIsUnread(item)
      }));
    }catch(error){
      console.warn("BiteBoss notification inbox:", error);
      window.__BITEBOSS_NOTIFICATION_INBOX__ = [];
    }
  }

  function notificationToggleRow(key, label, description){
    const value = pushPreferences?.[key] === true;
    return `
      <button class="notification-pref-row ${value ? "is-on" : ""}" type="button" data-notification-pref="${escapeAttr(key)}">
        <span>
          <strong>${escapeHtml(label)}</strong>
          <small>${escapeHtml(description)}</small>
        </span>
        <b>${value ? "ON" : "OFF"}</b>
      </button>
    `;
  }

  function renderNotificationSettingsModal(){
    const inbox = Array.isArray(window.__BITEBOSS_NOTIFICATION_INBOX__) ? window.__BITEBOSS_NOTIFICATION_INBOX__ : [];
    const native = isNativeApp();
    const pushEnabled = pushPreferences?.push_enabled === true && pushPermissionState === "granted";
    const totalPages = Math.max(1, Math.ceil(inbox.length / NOTIFICATION_PAGE_SIZE));
    notificationPage = Math.min(Math.max(1, notificationPage), totalPages);
    const pageStart = (notificationPage - 1) * NOTIFICATION_PAGE_SIZE;
    const pageItems = inbox.slice(pageStart, pageStart + NOTIFICATION_PAGE_SIZE);

    openModal("알림", `
      <div class="notification-settings">
        <section class="notification-master">
          <div class="notification-master-copy">
            <span>푸시 알림</span>
            <strong>${pushEnabled ? "알림 켜짐" : "알림 꺼짐"}</strong>
            <p>${native ? "점령, 방어, 크루 변화를 중요한 순간에 알려줍니다." : "알림 내역은 여기서 확인할 수 있고, 푸시는 iOS 앱에서 사용할 수 있습니다."}</p>
          </div>
          ${native ? `<button id="notificationMasterBtn" class="notification-master-action ${pushEnabled ? "is-on" : ""}" type="button">${pushEnabled ? "끄기" : "알림 켜기"}</button>` : ""}
        </section>

        <section class="notification-preferences" aria-label="알림 종류 설정">
          <div class="notification-section-head"><span>알림 종류</span><small>${pushEnabled ? "필요한 알림만 선택하세요." : "푸시를 켜면 설정할 수 있습니다."}</small></div>
          <div class="notification-pref-list ${pushEnabled ? "" : "is-disabled"}">
            ${notificationToggleRow("boss_events", "점령 · 방어", "점령 성공, 빼앗김, 보호시간 변화")}
            ${notificationToggleRow("crew_events", "크루", "초대, 가입, 멤버 및 리더 변화")}
            ${notificationToggleRow("store_offers", "매장 혜택", "제휴 매장의 혜택과 이벤트")}
            ${notificationToggleRow("system_events", "시스템", "계정과 서비스에 필요한 중요 안내")}
          </div>
        </section>

        <section class="notification-inbox">
          <div class="notification-inbox-head">
            <div><span>최근 알림</span><small>${inbox.length ? `총 ${inbox.length}개` : "새 소식이 없습니다."}</small></div>
          </div>
          <div class="notification-inbox-list">
            ${pageItems.map(item => {
              const unread = item.__was_unread === true;
              return `
                <button class="notification-inbox-row ${unread ? "is-unread" : ""}" type="button"
                  data-notification-kind="${escapeAttr(item.kind || "")}"
                  data-notification-store="${escapeAttr(item.data?.store_id || "")}">
                  ${notificationIconMarkup(item.kind)}
                  <span class="notification-inbox-copy">
                    <span class="notification-inbox-meta"><b>${escapeHtml(notificationKindLabel(item.kind))}</b>${unread ? '<i>새 알림</i>' : ""}</span>
                    <strong>${escapeHtml(item.title || notificationFallbackTitle(item))}</strong>
                    ${item.body ? `<p>${escapeHtml(item.body)}</p>` : ""}
                    <small>${escapeHtml(formatDate(item.created_at))}</small>
                  </span>
                  <span class="notification-row-arrow" aria-hidden="true">›</span>
                </button>
              `;
            }).join("") || `
              <div class="notification-empty-state">
                <span class="notification-empty-icon" aria-hidden="true">✓</span>
                <strong>아직 알림이 없습니다.</strong>
                <p>점령, 방어, 크루 변화가 생기면 이곳에 표시됩니다.</p>
              </div>`}
          </div>
          <nav id="notificationPagination" class="list-pagination ${inbox.length > NOTIFICATION_PAGE_SIZE ? "" : "hidden"}" aria-label="알림 페이지"></nav>
        </section>
      </div>
    `);

    if(inbox.length > NOTIFICATION_PAGE_SIZE){
      renderPagination("#notificationPagination", notificationPage, inbox.length, NOTIFICATION_PAGE_SIZE, nextPage => {
        notificationPage = nextPage;
        renderNotificationSettingsModal();
        $("#modalBody")?.scrollTo({top:0,behavior:"smooth"});
      });
    }

    $("#notificationMasterBtn")?.addEventListener("click", () => pushEnabled ? disablePushNotifications() : enablePushNotifications());

    $$('[data-notification-pref]').forEach(button => {
      button.addEventListener("click", async () => {
        if(!pushEnabled){
          toast("먼저 푸시 알림을 켜주세요.");
          return;
        }
        const key = button.dataset.notificationPref;
        if(!key || !pushPreferences) return;

        const next = {
          push_enabled:true,
          boss_events:pushPreferences.boss_events === true,
          crew_events:pushPreferences.crew_events === true,
          store_offers:pushPreferences.store_offers === true,
          system_events:pushPreferences.system_events === true
        };
        next[key] = !next[key];

        try{
          button.disabled = true;
          const { data, error } = await sb.rpc("biteboss_update_notification_preferences_v627", {
            p_push_enabled:next.push_enabled,
            p_boss_events:next.boss_events,
            p_crew_events:next.crew_events,
            p_store_offers:next.store_offers,
            p_system_events:next.system_events
          });
          if(error) throw error;
          pushPreferences = data || next;
          renderNotificationSettingsModal();
              }catch(error){
          console.warn("BiteBoss notification pref update:", error);
          toast("알림 설정을 변경하지 못했습니다.");
          button.disabled = false;
        }
      });
    });

    $$(".notification-inbox-row").forEach(button => {
      button.addEventListener("click", async () => {
        const data = {
          kind:button.dataset.notificationKind || "",
          store_id:button.dataset.notificationStore || ""
        };
        closeModal();
        await handlePushAction(data);
      });
    });
  }


  async function unregisterCurrentPushDevice(){
    const token = pushDeviceToken || (() => {
      try{ return localStorage.getItem("biteboss-push-token") || ""; }catch{ return ""; }
    })();
    if(!token || !playerSession?.authenticated) return;

    try{
      await sb.rpc("biteboss_unregister_push_device_v627", { p_token:token });
    }catch(error){
      console.warn("BiteBoss push unregister:", error);
    }

    try{ localStorage.removeItem("biteboss-push-token"); }catch{}
    pushDeviceToken = "";
  }

  function openDeleteAccount(){
    if(!playerSession?.authenticated){
      toast("회원 로그인이 필요합니다.");
      return;
    }

    openModal("계정 삭제", `
      <div class="account-delete-form">
        <strong>이 작업은 되돌릴 수 없습니다.</strong>
        <p>프로필, 점령·방문 기록, Crew 소속 등 BiteBoss 계정과 연결된 데이터를 삭제합니다.</p>
        <label>
          6-digit PIN
          <input id="deleteAccountPin" class="input" type="password" inputmode="numeric" maxlength="6" autocomplete="current-password" placeholder="000000" />
        </label>
        <label class="account-delete-confirm">
          확인 문구
          <input id="deleteAccountPhrase" class="input" maxlength="6" autocomplete="off" placeholder="DELETE" />
        </label>
        <button id="deleteAccountConfirmBtn" class="primary-btn danger-action" type="button">DELETE ACCOUNT</button>
        <p id="deleteAccountStatus" class="inline-status" aria-live="polite"></p>
      </div>
    `);

    $("#deleteAccountConfirmBtn")?.addEventListener("click", deleteMyAccount);
  }

  async function removeAvatarBeforeAccountDelete(){
    const avatarUrl = String(profile?.avatar_url || "").trim();
    if(!avatarUrl || !window.sb) return;

    try{
      const marker = "/object/public/biteboss-avatars/";
      const index = avatarUrl.indexOf(marker);
      if(index < 0) return;

      const rawPath = avatarUrl.slice(index + marker.length).split("?")[0];
      const path = decodeURIComponent(rawPath);
      if(!path) return;

      await sb.storage.from("biteboss-avatars").remove([path]);
    }catch(error){
      console.warn("BiteBoss avatar cleanup:", error);
    }
  }

  async function deleteMyAccount(){
    const pin = String($("#deleteAccountPin")?.value || "").trim();
    const phrase = String($("#deleteAccountPhrase")?.value || "").trim().toUpperCase();
    const status = $("#deleteAccountStatus");
    const button = $("#deleteAccountConfirmBtn");

    if(!/^\\d{6}$/.test(pin)){
      setStatus(status, "PIN은 숫자 6자리입니다.");
      return;
    }
    if(phrase !== "DELETE"){
      setStatus(status, "DELETE를 입력해 주세요.");
      return;
    }

    if(button) button.disabled = true;
    setStatus(status, "계정을 삭제하는 중…");

    try{
      await removeAvatarBeforeAccountDelete();

      const { data, error } = await sb.rpc("biteboss_delete_my_account_v625", {
        p_pin:pin
      });
      if(error) throw error;

      if(!data?.ok){
        const message = ({
          MEMBER_LOGIN_REQUIRED:"회원 로그인이 필요합니다.",
          INVALID_PIN:"PIN이 올바르지 않습니다.",
          MEMBER_NOT_FOUND:"회원 계정을 찾지 못했습니다."
        })[data?.error] || "계정을 삭제하지 못했습니다.";
        setStatus(status, message);
        return;
      }

      try{ localStorage.removeItem("biteboss-push-token"); }catch{}
      pushDeviceToken = "";
      pushPreferences = null;
      pushUnreadCount = 0;
      try{ await sb.auth.signOut({ scope:"local" }); }catch{}

      closeModal();
      playerSession = null;
      authUser = null;
      profile = null;
      summary = null;
      organization = null;
      organizationCooldown = null;
      organizationInvites = [];
      organizationMembers = [];
      storeRoleMap.clear();
      locallyOwnedStoreIds.clear();
      presenceBlockedReason = "MEMBER_LOGIN_REQUIRED";
      presenceState.clear();
      stopPresenceTracking();
      resetMemberSummaryUi();
      updateProfileUi();
      renderOrganizationUi();

      toast("BiteBoss 계정이 삭제되었습니다.");
      openTab("home");
    }catch(error){
      console.warn("BiteBoss account deletion:", error);
      setStatus(status, "계정을 삭제하지 못했습니다. 네트워크 연결 후 다시 시도하세요.");
    }finally{
      if(button) button.disabled = false;
    }
  }


  async function logout(){
    await unregisterCurrentPushDevice();
    try{ await sb.rpc("biteboss_player_logout"); }catch(error){ console.warn(error); }
    playerSession = null;
    profile = null;
    summary = null;
    organization = null;
    organizationCooldown = null;
    organizationInvites = [];
    organizationMembers = [];
    storeRoleMap.clear();
    locallyOwnedStoreIds.clear();
    presenceBlockedReason = "MEMBER_LOGIN_REQUIRED";
    presenceState.clear();
    stopPresenceTracking();
    resetMemberSummaryUi();
    updateProfileUi();
    renderOrganizationUi();
    await loadStores();
  }

  async function getPositionSafe(showErrors = false, options = {}){
    const timeout = Math.max(1000, Number(options.timeout || 10000));
    const maximumAge = Math.max(0, Number(options.maximumAge ?? 10000));
    const enableHighAccuracy = options.enableHighAccuracy !== false;

    try{
      const geo = window.Capacitor?.Plugins?.Geolocation;
      if(geo){
        const result = await geo.getCurrentPosition({
          enableHighAccuracy,
          timeout,
          maximumAge
        });
        return result || null;
      }
    }catch(error){
      if(showErrors) console.warn("Native geolocation:", error);
    }

    return new Promise(resolve => {
      if(!navigator.geolocation) return resolve(null);
      navigator.geolocation.getCurrentPosition(
        position => resolve(position),
        error => {
          if(showErrors) console.warn("Web geolocation:", error);
          resolve(null);
        },
        { enableHighAccuracy, timeout, maximumAge }
      );
    });
  }

  // Canonical level curve. Keep this in sync with sql/biteboss-level-curve-v8152.sql.
  // XP is cumulative; only the requirement for the next level grows.
  function xpRequiredForNextLevel(level = 1){
    const lv = Math.max(1, Math.floor(Number(level) || 1));
    if(lv <= 4) return [500,650,800,1000][lv - 1];
    if(lv <= 10) return Math.round((1200 + (lv - 5) * (800 / 5)) / 50) * 50;
    if(lv <= 30) return Math.round((2000 + (lv - 10) * 150) / 50) * 50;
    return Math.round((5000 + (lv - 30) * 150) / 50) * 50;
  }

  function levelProgressFromXp(xp = 0){
    const totalXp = Math.max(0, Math.floor(Number(xp) || 0));
    let level = 1;
    let floorXp = 0;
    let target = xpRequiredForNextLevel(level);

    // A hard guard protects rendering even if a malformed XP value reaches the client.
    while(level < 1000 && totalXp >= floorXp + target){
      floorXp += target;
      level += 1;
      target = xpRequiredForNextLevel(level);
    }

    return {
      level,
      current:Math.max(0, totalXp - floorXp),
      target,
      floorXp,
      totalXp
    };
  }

  function updateRankMeter(xp = 0){
    const progress = levelProgressFromXp(xp);
    const valueEl = $("#rankMeterValue");
    const barEl = $("#rankMeterBar");
    const percent = Math.max(0, Math.min(100, (progress.current / progress.target) * 100));

    if(valueEl) valueEl.textContent = `${progress.current} / ${progress.target} XP`;
    if(barEl) barEl.style.width = `${percent}%`;
  }

  function updateProfileMeter(count = 0){
    const active = Math.max(0, Number(count) || 0);
    setPageMeter(
      "profile",
      active ? "활동 중" : "활동 없음",
      `${active}곳`,
      active ? 100 : 0,
      active === 0
    );
  }

  function updateAlertMeter(count = 0){
    const unread = Math.max(0, Number(count) || 0);
    setPageMeter("alerts", unread ? "Store updates" : "No new updates", `${unread}`, unread ? 100 : 0, unread === 0);
  }

  function setPageMeter(prefix, title, value, percent, muted = false){
    const titleEl = $(`#${prefix}MeterTitle`);
    const valueEl = $(`#${prefix}MeterValue`);
    const barEl = $(`#${prefix}MeterBar`);
    const safePercent = Math.max(0, Math.min(100, Number(percent) || 0));
    if(titleEl) titleEl.textContent = title;
    if(valueEl) valueEl.textContent = value;
    if(barEl){
      barEl.style.width = `${safePercent}%`;
      barEl.classList.toggle("muted", muted);
    }
  }

  function categoryLabel(category){
    return ({
      cafe:"카페",
      restaurant:"음식점",
      dessert:"디저트",
      bakery:"베이커리",
      fastfood:"패스트푸드",
      pub:"펍"
    })[category] || category || "매장";
  }

  function getOwnStoreReclaimRemainingSeconds(value){
    const availableAtMs = new Date(value).getTime();
    if(!Number.isFinite(availableAtMs)) return null;
    return Math.max(0, Math.ceil((availableAtMs - Date.now()) / 1000));
  }

  function formatOwnStoreReclaim(value){
    const totalSeconds = getOwnStoreReclaimRemainingSeconds(value);
    if(totalSeconds === null) return "확인 불가";
    if(totalSeconds <= 0) return "재점령 가능";

    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const two = number => String(number).padStart(2, "0");

    return hours > 0
      ? `${two(hours)}:${two(minutes)}:${two(seconds)}`
      : `${two(minutes)}:${two(seconds)}`;
  }

  function updateOwnerReclaimCountdown(){
    const target = $("#ownerReclaimCountdown");
    if(!target) return false;
    const availableAt = String(target.dataset.reclaimAt || "").trim();
    if(!availableAt) return false;

    const remainingSeconds = getOwnStoreReclaimRemainingSeconds(availableAt);
    target.textContent = formatOwnStoreReclaim(availableAt);

    if(remainingSeconds === null) return false;
    if(remainingSeconds <= 0){
      const card = target.closest(".owner-store-reclaim");
      const label = card?.querySelector("span");
      const note = card?.querySelector("small");
      if(label) label.textContent = "재점령";
      if(note) note.textContent = "매장에 다시 방문하면 자동 재점령됩니다.";
      storeReclaimTimer = clearIntervalRef(storeReclaimTimer);
      return false;
    }
    return true;
  }

  function startOwnerReclaimCountdown(){
    storeReclaimTimer = clearIntervalRef(storeReclaimTimer);
    const target = $("#ownerReclaimCountdown");
    if(!target) return;
    if(updateOwnerReclaimCountdown()){
      storeReclaimTimer = setInterval(updateOwnerReclaimCountdown, 1000);
    }
  }

  function formatRemaining(value){
    const diff = new Date(value).getTime() - Date.now();
    if(!Number.isFinite(diff) || diff <= 0) return "종료";
    const minutes = Math.ceil(diff / 60000);
    if(minutes < 60) return `${minutes}분`;
    const hours = Math.floor(minutes / 60);
    const restMinutes = minutes % 60;
    if(hours < 24) return `${hours}시간${restMinutes ? ` ${restMinutes}분` : ""}`;
    const days = Math.floor(hours / 24);
    const restHours = hours % 24;
    return `${days}일${restHours ? ` ${restHours}시간` : ""}`;
  }

  function formatDistance(value){
    const meters = Number(value);
    if(!Number.isFinite(meters)) return "";
    if(meters < 1000) return `${Math.round(meters)}m`;
    return `${(meters / 1000).toFixed(meters < 10000 ? 1 : 0)}km`;
  }

  function formatDate(value){
    if(!value) return "-";
    try{
      return new Intl.DateTimeFormat("ko-KR", {
        month:"short",
        day:"numeric",
        hour:"2-digit",
        minute:"2-digit"
      }).format(new Date(value));
    }catch{
      return "-";
    }
  }


  function updateNetworkState(){
    $("#offlineBanner")?.classList.toggle("hidden", navigator.onLine !== false);
  }

  function lockModalScroll(){
    if(document.body.classList.contains("modal-open")) return;
    modalScrollY = window.scrollY || window.pageYOffset || 0;
    document.body.style.top = `-${modalScrollY}px`;
    document.body.classList.add("modal-open");
    document.documentElement.classList.add("modal-open");
  }

  function unlockModalScroll(){
    if(!document.body.classList.contains("modal-open")) return;
    document.body.classList.remove("modal-open");
    document.documentElement.classList.remove("modal-open");
    document.body.style.top = "";
    window.scrollTo(0, modalScrollY);
  }

  function openModal(title, body, options = {}){
    stopScanner();

    const modal = $("#modal");
    const modalType = String(options?.type || "").trim();
    if(!modal) return;

    modalReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const detailTypes = new Set(["detail-sheet", "store-detail", "player-profile", "partner-request"]);
    const isDetailSheet = detailTypes.has(modalType);
    modal.classList.remove("modal-detail-sheet", "modal-compact", "store-detail-modal", "player-profile-modal", "partner-request-modal", "notice-modal", "victory-modal");
    modal.classList.toggle("modal-detail-sheet", isDetailSheet);
    modal.classList.toggle("modal-compact", !isDetailSheet);
    modal.classList.toggle("store-detail-modal", modalType === "store-detail");
    modal.classList.toggle("player-profile-modal", modalType === "player-profile");
    modal.classList.toggle("partner-request-modal", modalType === "partner-request");
    modal.classList.toggle("notice-modal", modalType === "notice");
    modal.classList.toggle("victory-modal", modalType === "victory");

    setText("#modalTitle", title);

    const bodyEl = $("#modalBody");
    if(bodyEl){
      bodyEl.innerHTML = body;
      bodyEl.scrollTop = 0;
    }

    lockModalScroll();
    modal.classList.remove("hidden");
    const modalCard = modal.querySelector(".modal-card");
    if(modalCard) modalCard.scrollTop = 0;
    // Do not force focus onto the close button. Touch browsers can retain a
    // focused/active visual state on the top-right X after the modal transition.
  }

  function closeModal(){
    stopScanner();
    destroyStoreDetailMap();
    storeReclaimTimer = clearIntervalRef(storeReclaimTimer);
    activeStoreDetailId = "";

    const modal = $("#modal");
    takeoverChoiceOpen=false;
    modal?.classList.add("hidden");
    modal?.classList.remove("modal-detail-sheet", "modal-compact", "store-detail-modal", "player-profile-modal", "partner-request-modal", "notice-modal", "victory-modal");
    unlockModalScroll();
    const returnFocus = modalReturnFocus;
    modalReturnFocus = null;
    window.requestAnimationFrame(() => returnFocus?.focus?.({preventScroll:true}));
  }

  function showTakeoverCancelledNotice(){
    openModal("점령 취소", `
      <div class="notice-copy">점령을 취소했습니다.</div>
      <button class="primary-btn notice-confirm" id="takeoverCancelOk" type="button">확인</button>
    `, {type:"notice"});
    $("#takeoverCancelOk").onclick = closeModal;
  }

  function toast(message){
    openModal("BiteBoss", `
      <div class="modal-message">${escapeHtml(message)}</div>
      <button class="primary-btn modal-confirm" id="toastOk" type="button">확인</button>
    `);
    $("#toastOk").onclick = closeModal;
  }

  function fatalError(error){
    console.error(error);
    openModal("BiteBoss", `
      <div class="app-state is-error">
        <strong>앱을 시작하지 못했습니다.</strong>
        <span>네트워크 연결을 확인한 뒤 다시 실행해 주세요.</span>
      </div>
    `);
  }

  function setText(selector, value){
    const el = $(selector);
    if(el) el.textContent = String(value ?? "");
  }

  function escapeHtml(value){
    return String(value ?? "").replace(/[&<>"']/g, char => ({
      "&":"&amp;",
      "<":"&lt;",
      ">":"&gt;",
      '"':"&quot;",
      "'":"&#039;"
    }[char]));
  }

  function escapeAttr(value){
    return escapeHtml(value).replace(/`/g, "&#096;");
  }

  function imageFileToJpegBlob(file, maxWidth, maxHeight, quality){
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = reject;
      reader.onload = () => {
        const image = new Image();
        image.onerror = reject;
        image.onload = () => {
          const scale = Math.min(1, maxWidth / image.width, maxHeight / image.height);
          const width = Math.max(1, Math.round(image.width * scale));
          const height = Math.max(1, Math.round(image.height * scale));
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          const context = canvas.getContext("2d");
          context.drawImage(image, 0, 0, width, height);
          canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("Image conversion failed")), "image/jpeg", quality);
        };
        image.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function registerServiceWorker(){
    let native = false;
    try{
      native = Boolean(window.Capacitor?.isNativePlatform?.()) ||
        (typeof window.Capacitor?.getPlatform === "function" && window.Capacitor.getPlatform() !== "web");
    }catch{}

    // Capacitor/WKWebView uses packaged files. A service worker adds no value
    // there and can create stale-web-asset behavior during app updates.
    if(native) return;
    if(!("serviceWorker" in navigator)) return;
    if(location.protocol !== "https:" && location.hostname !== "localhost") return;

    navigator.serviceWorker.register("./service-worker.js")
      .catch(error => console.warn("SW:", error));
  }

})();
