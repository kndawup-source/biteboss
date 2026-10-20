(() => {
  "use strict";
  if(window.__BITEBOSS_ADMIN_BOOTED__) return;
  window.__BITEBOSS_ADMIN_BOOTED__ = true;

  const $ = q => document.querySelector(q);
  const $$ = q => [...document.querySelectorAll(q)];

  const adminCfg = window.BITEBOSS_CONFIG || {};
  const adminSb = window.supabase?.createClient && adminCfg.supabaseUrl && adminCfg.supabaseAnonKey
    ? window.supabase.createClient(adminCfg.supabaseUrl, adminCfg.supabaseAnonKey, {
        auth:{
          persistSession:true,
          autoRefreshToken:true,
          detectSessionInUrl:false,
          storageKey:"biteboss-admin-auth"
        },
        global:{ headers:{ "x-client-info":"biteboss-admin-web/82.68" } }
      })
    : null;


  const DIRECT_ADMIN_RPCS = new Set([
    "biteboss_admin_login",
    "biteboss_admin_logout",
    "biteboss_admin_session",
    "biteboss_admin_has_capability_v8217",
    "biteboss_admin_require_capability_v8217",
    "biteboss_admin_config_upsert_v8217",
    "biteboss_admin_list_campaigns_v8217",
    "biteboss_admin_upsert_campaign_v8217",
    "biteboss_admin_delete_campaign_v8217",
    "biteboss_admin_list_campaigns_v8239",
    "biteboss_admin_upsert_campaign_v8239",
    "biteboss_admin_delete_campaign_v8239",
    "biteboss_admin_ad_analytics_v8217",
    "biteboss_admin_ad_creative_analytics_v8217",
    "biteboss_admin_ad_performance_detail_v8243",
    "biteboss_admin_news_list_v8260",
    "biteboss_admin_news_upsert_v8260",
    "biteboss_admin_news_delete_v8260"
  ]);

  async function adminRpc(name, args){
    const rpcName=String(name || "");
    if(!rpcName.startsWith("biteboss_admin_") || DIRECT_ADMIN_RPCS.has(rpcName)){
      return adminSb.rpc(rpcName, args);
    }
    return adminSb.rpc("biteboss_admin_call_v8218", {
      p_function:rpcName,
      p_args:args && typeof args === "object" ? args : {}
    });
  }

  let session = null;
  let admin = null;
  let stores = [];
  const storePlanMap = new Map();
  let appConfig = {};
  let newsAdminPosts = [];
  const activationCodes = new Map();
  let editingStoreId = null;
  let sharedStoreSettingsTimer = null;
  let sharedStoreSettingsBusy = false;
  let adminSeoSyncSignature = "";
  let adminVideoSyncSignature = "";
  let editingStoreBundle = null;
  let adCampaigns = [];
  let selectedAdCampaignId = "";
  let selectedAdPerformanceCampaignId = "";
  let selectedAdPerformanceCreativeId = "";
  let adAnalyticsOverallData = null;
  let adPerformanceDetailRequest = 0;
  const adCreativeAnalyticsMap = new Map();
  let partnerRequests = [];
  let storeRequests = [];
  let analyticsRange = "7d";
  let analyticsCompareMode = "previous";
  let adminCommentPage = 1;
  let adminCommentFilter = "all";
  let adminStorePage = 1;
  let adminStoreFilter = "all";
  let partnerRequestPage = 1;
  let partnerRequestStatus = "pending";
  let storeRequestPage = 1;
  let adminUserPage = 1;
  let bossPage = 1;
  let gameOpsStorePage = 1;
  let gameOpsOrganizationPage = 1;
  const ADMIN_PAGE_SIZE = 10;

  init().catch(showFatal);

  async function init(){
    bindNav();
    bindLogin();
    bindForms();
    bindActions();

    if(!adminSb) throw new Error("Supabase unavailable");
    await ensureAdminAuthSession();
    await restoreAdminSession();
    startOpenStoreSharedSettingsSync();
  }

  async function ensureAdminAuthSession(){
    const current = await adminSb.auth.getSession();
    session = current.data?.session || null;
    if(session) return session;

    const { data, error } = await adminSb.auth.signInAnonymously();
    if(error) throw error;
    session = data.session;
    return session;
  }

  async function restoreAdminSession(){
    const { data, error } = await adminRpc("biteboss_admin_session");
    if(error || !data?.authenticated){
      admin = null;
      showAuthGate();
      return;
    }

    admin = data;
    hideAuthGate();
    setText("#adminRole", isAdManager() ? "광고 관리자" : (admin.role || "admin"));
    applyAdminRoleScope();
    await refreshAll();
    if(isAdManager()) await openAdminPage("ad-performance", "overview");
  }

  function bindLogin(){
    $("#adminLoginForm")?.addEventListener("submit", async event => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const username = String(form.get("admin_id") || "").trim().toLowerCase();
      const pin = String(form.get("pin") || "").trim();
      const status = $("#adminLoginStatus");
      const submit = event.currentTarget.querySelector('button[type="submit"]');

      if(submit?.disabled) return;
      if(!username || !/^\d{6}$/.test(pin)){
        if(status) status.textContent = "ID와 숫자 6자리 비밀번호을 확인하세요.";
        return;
      }

      if(submit) submit.disabled = true;
      if(status) status.textContent = "로그인 중…";

      try{
        await ensureAdminAuthSession();
        const { data, error } = await adminRpc("biteboss_admin_login", {
          p_username:username,
          p_pin:pin
        });
        if(error) throw error;

        if(!data?.ok){
          if(status){
            status.textContent = data?.error === "LOCKED"
              ? "잠시 후 다시 시도하세요."
              : "ID 또는 PIN이 올바르지 않습니다.";
          }
          return;
        }

        if(status) status.textContent = "";
        await restoreAdminSession();
      }catch(error){
        console.warn(error);
        if(status) status.textContent = "로그인에 실패했습니다.";
      }finally{
        if(submit) submit.disabled = false;
      }
    });
  }

  function showAuthGate(){
    $("#adminAuthGate")?.classList.remove("hidden");
    $("#adminApp")?.classList.add("hidden");
  }

  function hideAuthGate(){
    $("#adminAuthGate")?.classList.add("hidden");
    $("#adminApp")?.classList.remove("hidden");
  }

  const ADMIN_GROUPS = {
    overview:["dashboard","ad-performance"],
    stores:["stores","partner-requests","comments","qr"],
    game:["gameops","rules","users"],
    settings:["assets","ads","news","maintenance"]
  };

  const AD_MANAGER_ROLES = new Set(["ad_manager","ads","advertising","advertising_manager"]);
  const AD_MANAGER_PAGES = new Set(["ad-performance","ads"]);

  function normalizedAdminRole(){
    return String(admin?.role || "admin").trim().toLowerCase();
  }

  function isAdManager(){
    return AD_MANAGER_ROLES.has(normalizedAdminRole());
  }

  function canOpenAdminPage(page){
    return !isAdManager() || AD_MANAGER_PAGES.has(String(page || ""));
  }

  function applyAdminRoleScope(){
    const adOnly=isAdManager();
    document.body.classList.toggle("admin-ad-manager", adOnly);
    $$("[data-admin-group]").forEach(node=>{
      const page=String(node.dataset.admin || node.dataset.adminDefault || "");
      const group=String(node.dataset.adminGroup || "");
      const allowed = !adOnly || AD_MANAGER_PAGES.has(page) || (group === "overview" && !page) || (group === "settings" && !page);
      if(node.classList.contains("admin-primary-nav-btn")){
        const groupAllowed = !adOnly || group === "overview" || group === "settings";
        node.classList.toggle("role-hidden", !groupAllowed);
      }else if(node.classList.contains("admin-section-nav")){
        node.classList.toggle("role-hidden", !allowed);
      }
    });
    $$("[data-super-admin-only]").forEach(node=>node.classList.toggle("role-hidden", adOnly));
  }

  let activeAdminGroup = "overview";
  let activeAdminPage = "dashboard";

  function syncAdminNavigation(group, page){
    activeAdminGroup = group;
    activeAdminPage = page;

    $$(".admin-primary-nav-btn").forEach(button => {
      button.classList.toggle("active", button.dataset.adminGroup === group);
    });

    $$(".admin-section-nav").forEach(button => {
      const sameGroup = button.dataset.adminGroup === group;
      button.classList.toggle("hidden", !sameGroup);
      button.classList.toggle("active", sameGroup && button.dataset.admin === page);
    });
  }

  async function openAdminPage(page, group = null){
    if(!canOpenAdminPage(page)){
      if(isAdManager() && page !== "ad-performance") return openAdminPage("ad-performance", "overview");
      return;
    }
    const target = $(`#admin-${page}`);
    if(!target) return;

    const resolvedGroup = group ||
      Object.entries(ADMIN_GROUPS).find(([, pages]) => pages.includes(page))?.[0] ||
      "overview";

    syncAdminNavigation(resolvedGroup, page);

    $$(".admin-page").forEach(section => {
      section.classList.toggle("active", section === target);
    });

    window.scrollTo({ top:0, behavior:"auto" });
    await refreshPage(page);
  }

  function bindNav(){
    $$(".admin-primary-nav-btn").forEach(button => {
      button.addEventListener("click", async () => {
        const group = String(button.dataset.adminGroup || "overview");
        const roleFallback = isAdManager()
          ? (group === "settings" ? "ads" : "ad-performance")
          : String(button.dataset.adminDefault || ADMIN_GROUPS[group]?.[0] || "dashboard");

        const currentStillValid = ADMIN_GROUPS[group]?.includes(activeAdminPage) && canOpenAdminPage(activeAdminPage);
        await openAdminPage(currentStillValid ? activeAdminPage : roleFallback, group);
      });
    });

    $$(".admin-section-nav").forEach(button => {
      button.addEventListener("click", async () => {
        await openAdminPage(
          String(button.dataset.admin || "dashboard"),
          String(button.dataset.adminGroup || activeAdminGroup)
        );
      });
    });
  }

  function bindActions(){
    $("#adminLogoutBtn")?.addEventListener("click", async () => {
      try{ await adminRpc("biteboss_admin_logout"); }catch(error){ console.warn(error); }
      await adminSb.auth.signOut();
      session = null;
      admin = null;
      location.reload();
    });
    $("#userSearch")?.addEventListener("input", () => { adminUserPage = 1; loadUsers(); });
    $("#adminStoreSearch")?.addEventListener("input", () => { adminStorePage = 1; renderStores(); });
    $$("[data-store-filter]").forEach(button => button.addEventListener("click", () => {
      adminStoreFilter = String(button.dataset.storeFilter || "all");
      adminStorePage = 1;
      $$("[data-store-filter]").forEach(item => item.classList.toggle("active", item === button));
      renderStores();
    }));
    $("#adCampaignCancel")?.addEventListener("click", resetAdCampaignForm);
    $("#adAnalyticsDays")?.addEventListener("change", loadAdAnalytics);
    $("#adCampaignSearch")?.addEventListener("input", renderAds);
    $("#adPerformanceSearch")?.addEventListener("input", renderAdPerformanceCampaigns);
    $("#adPerformanceExportCsv")?.addEventListener("click", exportAdPerformanceCsv);
    $("#adPerformanceCreativeClose")?.addEventListener("click", closeAdPerformanceCreativePanel);
    $("#adPerformanceReset")?.addEventListener("click", resetAdPerformanceScope);
    $("#adTargetType")?.addEventListener("change", syncAdTargetRegionField);
    $$('[data-partner-filter]').forEach(button => button.addEventListener("click", () => {
      partnerRequestStatus = String(button.dataset.partnerFilter || "pending");
      partnerRequestPage = 1;
      $$('[data-partner-filter]').forEach(item => item.classList.toggle("active", item === button));
      loadPartnerRequests();
    }));
    $("#refreshPartnerRequests")?.addEventListener("click", loadPartnerRequests);
    $("#refreshAdminComments")?.addEventListener("click", () => loadAdminComments(adminCommentPage));
    $$("[data-comment-filter]").forEach(button => button.addEventListener("click", () => {
      adminCommentFilter = String(button.dataset.commentFilter || "all");
      adminCommentPage = 1;
      $$("[data-comment-filter]").forEach(item => item.classList.toggle("active", item === button));
      loadAdminComments(1);
    }));
    $$('[data-analytics-range]').forEach(btn => btn.addEventListener("click", () => selectAnalyticsRange(btn.dataset.analyticsRange)));
    $$('[data-analytics-compare]').forEach(button => button.addEventListener("click", () => {
      analyticsCompareMode = String(button.dataset.analyticsCompare || "previous");
      syncAnalyticsCompareUi();
      loadAnalytics();
    }));
    $("#analyticsApplyCustom")?.addEventListener("click", () => { analyticsRange = "custom"; syncAnalyticsPresetUi(); loadAnalytics(); });
    $("#refreshAccessAnalytics")?.addEventListener("click", () => loadAccessAnalytics(resolveAnalyticsPeriod()));

    $$('[data-close-store-editor]').forEach(node => node.addEventListener('click', closeStoreEditor));
    $("#adminStoreEditForm")?.addEventListener("submit", saveAdminStoreInfo);
    $("#adminPhotoForm")?.addEventListener("submit", addAdminStorePhoto);
    $("#adminVideoForm")?.addEventListener("submit", saveAdminStoreVideo);
    $("#adminStoreSlugSave")?.addEventListener("click", saveAdminStoreSlug);
    $("#adminStoreUrlCopy")?.addEventListener("click", copyAdminStoreUrl);
    bindAdminDateTimeControl("#adStartsAt", "#adStartsDate", "#adStartsTime");
    bindAdminDateTimeControl("#adEndsAt", "#adEndsDate", "#adEndsTime");
    $("#adminMenuForm")?.addEventListener("submit", saveAdminMenu);
    $("#adminOfferForm")?.addEventListener("submit", saveAdminOffer);
    $("#adminStorePlanForm")?.addEventListener("submit", saveAdminStorePlan);
    $("#adminPartnerPromotionForm")?.addEventListener("submit", saveAdminPartnerPromotion);
    $("#adminPartnerBannerEnabled")?.addEventListener("change", () => {
      if(!editingStoreBundle?.store) return;
      const enabled = $("#adminPartnerBannerEnabled").value === "true";
      const state = bannerOperationalState(editingStoreBundle.store, enabled);
      const el = $("#adminPartnerBannerOperationalState");
      if(el){
        el.className = `admin-banner-operational wide ${state.className}`.trim();
        el.textContent = state.label;
      }
    });
    $("#adminMenuCancel")?.addEventListener("click", resetAdminMenuForm);
    $("#adminOfferCancel")?.addEventListener("click", resetAdminOfferForm);
    $("#adminDeleteStoreBtn")?.addEventListener("click", deleteCurrentStore);
    $$('[data-reset-mode]').forEach(btn => btn.addEventListener('click', () => runAdminReset(btn.dataset.resetMode, btn)));
  }

  function bindForms(){
    $("#storeForm")?.addEventListener("submit", createStore);
    $("#useCurrentLocationBtn")?.addEventListener("click", fillCurrentStoreLocation);
    $("#rulesForm")?.addEventListener("submit", saveRules);
    $("#splashForm")?.addEventListener("submit", saveSplash);
    $("#defaultProfileForm")?.addEventListener("submit", saveDefaultProfileImage);
    $("#homeCopyForm")?.addEventListener("submit", saveHomeCopy);
    $("#firstCaptureGuideForm")?.addEventListener("submit", saveFirstCaptureGuide);
    $("#firstCaptureGuideLinkMode")?.addEventListener("change", syncFirstCaptureGuideLinkFields);
    $("#newsForm")?.addEventListener("submit", saveNewsPost);
    $("#newsNewBtn")?.addEventListener("click", resetNewsForm);
    $("#newsCancelBtn")?.addEventListener("click", resetNewsForm);
    $("#newsUrlCopyBtn")?.addEventListener("click", copyNewsPublicUrl);
    $("#newsDeleteBtn")?.addEventListener("click", deleteNewsPost);
    $("#adCampaignForm")?.addEventListener("submit", saveAdCampaign);
    $("#adCreativeForm")?.addEventListener("submit", saveAdCreative);
    $("#adCreativeCancel")?.addEventListener("click", resetAdCreativeForm);
    $("#adCreativePanelClose")?.addEventListener("click", closeAdCreativePanel);
    $("#adTargetStoreSearch")?.addEventListener("input",event=>{clearTimeout(adTargetStoreSearchTimer);const value=event.currentTarget.value;adTargetStoreSearchTimer=setTimeout(()=>searchAdTargetStores(value),220);});
    $("#adTargetStoreSearch")?.addEventListener("focus",event=>{if(String(event.currentTarget.value || "").trim().length>=2) searchAdTargetStores(event.currentTarget.value);});
    $("#adTargetStoreClear")?.addEventListener("click",()=>setAdTargetStore(null));
  }

  async function fillCurrentStoreLocation(){
    const button = $("#useCurrentLocationBtn");
    const status = $("#locationStatus");
    const latInput = document.querySelector('#storeForm [name="latitude"]');
    const lngInput = document.querySelector('#storeForm [name="longitude"]');

    if(!latInput || !lngInput) return;

    if(button) button.disabled = true;
    if(status) status.textContent = "현재 위치 확인 중…";

    try{
      let coords = null;

      const nativeGeo = window.Capacitor?.Plugins?.Geolocation;
      if(nativeGeo?.getCurrentPosition){
        try{
          const position = await nativeGeo.getCurrentPosition({
            enableHighAccuracy:true,
            timeout:12000,
            maximumAge:0
          });
          coords = position?.coords || null;
        }catch(error){
          console.warn("Native geolocation failed, falling back to browser geolocation.", error);
        }
      }

      if(!coords){
        if(!navigator.geolocation) throw new Error("이 기기에서는 위치 정보를 사용할 수 없습니다.");
        coords = await new Promise((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(
            position => resolve(position.coords),
            error => reject(error),
            { enableHighAccuracy:true, timeout:12000, maximumAge:0 }
          );
        });
      }

      const latitude = Number(coords.latitude);
      const longitude = Number(coords.longitude);
      if(!Number.isFinite(latitude) || !Number.isFinite(longitude)){
        throw new Error("GPS 좌표를 확인할 수 없습니다.");
      }

      latInput.value = latitude.toFixed(7);
      lngInput.value = longitude.toFixed(7);
      latInput.dispatchEvent(new Event("input", { bubbles:true }));
      lngInput.dispatchEvent(new Event("input", { bubbles:true }));

      const accuracy = Number(coords.accuracy);
      if(status){
        status.textContent = Number.isFinite(accuracy)
          ? `현재 위치 입력 완료 · 정확도 약 ${Math.round(accuracy)}m`
          : "현재 위치 입력 완료";
      }
    }catch(error){
      console.error("BiteBoss admin geolocation failed:", error);
      let message = error?.message || "위치 정보를 불러오지 못했습니다.";
      if(error?.code === 1) message = "위치 권한을 허용해 주세요.";
      if(error?.code === 2) message = "현재 위치를 확인할 수 없습니다.";
      if(error?.code === 3) message = "위치 확인 시간이 초과됐습니다.";
      if(status) status.textContent = message;
    }finally{
      if(button) button.disabled = false;
    }
  }

  async function refreshAll(){
    // Advertising-only operators must not fan out into unrelated admin RPCs.
    await loadConfig();
    if(isAdManager()){
      await loadAds();
      return;
    }
    // Store banner state depends on appConfig.partner_banners. Resolve config first
    // so the first store render cannot race against configuration loading.
    await Promise.all([loadDashboard(), loadAnalytics(), loadStores(), loadStoreRequests(), loadBosses(), loadUsers(), loadGameOps(), loadAssets(), loadAds(), loadPartnerRequests(), loadAdminComments()]);
    renderRules();
  }

  async function refreshPage(page){
    if(!canOpenAdminPage(page)) return;
    if(page === "dashboard"){
      await Promise.all([loadDashboard(), loadAnalytics(), loadBosses()]);
    }
    if(page === "stores"){
      await loadConfig();
      await Promise.all([loadStores(), loadStoreRequests()]);
    }
    if(page === "qr"){
      await loadConfig();
      await loadStores();
    }
    if(page === "rules") { await loadConfig(); renderRules(); }
    if(page === "bosses") await loadBosses();
    if(page === "users") await loadUsers();
    if(page === "gameops") await loadGameOps();
    if(page === "assets") await loadAssets();
    if(page === "ads") await loadAds();
    if(page === "news") { await loadConfig(); await loadNewsAdmin(); }
    if(page === "ad-performance") await loadAds();
    if(page === "partner-requests") await loadPartnerRequests();
    if(page === "comments") await loadAdminComments();
  }


  function selectAnalyticsRange(range){
    analyticsRange = String(range || "7d");
    syncAnalyticsPresetUi();
    if(analyticsRange !== "custom") loadAnalytics();
  }

  function syncAnalyticsPresetUi(){
    $$('[data-analytics-range]').forEach(btn => btn.classList.toggle("active", btn.dataset.analyticsRange === analyticsRange));
    $("#analyticsCustomRange")?.classList.toggle("hidden", analyticsRange !== "custom");
    syncAnalyticsCompareUi();
  }

  function syncAnalyticsCompareUi(){
    $$('[data-analytics-compare]').forEach(button => button.classList.toggle("active", button.dataset.analyticsCompare === analyticsCompareMode));
  }

  function analyticsCompareLabel(period){
    if(analyticsCompareMode === "year") return "전년 동기 대비";
    const days = Math.max(1, Math.ceil((period.to.getTime()-period.from.getTime()+1)/86400000));
    if(analyticsRange === "today") return "어제 대비";
    if(analyticsRange === "this_month") return "직전 동일 기간 대비";
    if(analyticsRange === "last_month") return "전월 대비";
    if(analyticsRange === "this_year") return "직전 동일 기간 대비";
    if(analyticsRange === "last_year") return "전년도 대비";
    return `이전 ${days}일 대비`;
  }

  function startOfDay(date){
    const d = new Date(date); d.setHours(0,0,0,0); return d;
  }
  function endOfDay(date){
    const d = new Date(date); d.setHours(23,59,59,999); return d;
  }
  function shiftYear(date, amount){ const d = new Date(date); d.setFullYear(d.getFullYear()+amount); return d; }
  function formatInputDate(date){
    const d = new Date(date); const y=d.getFullYear(); const m=String(d.getMonth()+1).padStart(2,"0"); const day=String(d.getDate()).padStart(2,"0"); return `${y}-${m}-${day}`;
  }

  function resolveAnalyticsPeriod(){
    const now = new Date();
    let from, to, label;
    if(analyticsRange === "today"){
      from=startOfDay(now); to=endOfDay(now); label="오늘";
    }else if(analyticsRange === "30d"){
      to=endOfDay(now); from=startOfDay(new Date(now.getFullYear(),now.getMonth(),now.getDate()-29)); label="최근 30일";
    }else if(analyticsRange === "this_month"){
      from=startOfDay(new Date(now.getFullYear(),now.getMonth(),1)); to=endOfDay(now); label="이번 달";
    }else if(analyticsRange === "last_month"){
      from=startOfDay(new Date(now.getFullYear(),now.getMonth()-1,1)); to=endOfDay(new Date(now.getFullYear(),now.getMonth(),0)); label="지난달";
    }else if(analyticsRange === "this_year"){
      from=startOfDay(new Date(now.getFullYear(),0,1)); to=endOfDay(now); label=`${now.getFullYear()}년`;
    }else if(analyticsRange === "last_year"){
      from=startOfDay(new Date(now.getFullYear()-1,0,1)); to=endOfDay(new Date(now.getFullYear()-1,11,31)); label=`${now.getFullYear()-1}년`;
    }else if(analyticsRange === "custom"){
      const fromValue = $("#analyticsFrom")?.value;
      const toValue = $("#analyticsTo")?.value;
      from = fromValue ? startOfDay(new Date(`${fromValue}T00:00:00`)) : startOfDay(new Date(now.getFullYear(),now.getMonth(),now.getDate()-6));
      to = toValue ? endOfDay(new Date(`${toValue}T00:00:00`)) : endOfDay(now);
      if(from > to){ const tmp=from; from=to; to=tmp; }
      label=`${formatInputDate(from)} ~ ${formatInputDate(to)}`;
    }else{
      to=endOfDay(now); from=startOfDay(new Date(now.getFullYear(),now.getMonth(),now.getDate()-6)); label="최근 7일";
    }

    const span = Math.max(1, to.getTime()-from.getTime()+1);
    let compareFrom, compareTo;
    if(analyticsCompareMode === "year"){
      compareFrom=shiftYear(from,-1); compareTo=shiftYear(to,-1);
    }else{
      compareTo=new Date(from.getTime()-1); compareFrom=new Date(compareTo.getTime()-span+1);
    }
    const days = Math.max(1, Math.ceil(span/86400000));
    const bucket = days > 120 ? "month" : days > 35 ? "week" : "day";
    return { from,to,compareFrom,compareTo,label,bucket };
  }

  async function loadAnalytics(){
    const chart = $("#analyticsVisitChart");
    if(!chart) return;
    syncAnalyticsPresetUi();
    const period = resolveAnalyticsPeriod();
    setText("#analyticsPeriodLabel", period.label);
    setText("#analyticsCompareLabel", analyticsCompareLabel(period));
    setText("#analyticsTrendMeta", period.bucket === "month" ? "월별" : period.bucket === "week" ? "주별" : "일별");
    if(analyticsRange === "custom"){
      if($("#analyticsFrom") && !$("#analyticsFrom").value) $("#analyticsFrom").value=formatInputDate(period.from);
      if($("#analyticsTo") && !$("#analyticsTo").value) $("#analyticsTo").value=formatInputDate(period.to);
    }
    chart.innerHTML='<div class="analytics-loading">불러오는 중…</div>';
    void loadAccessAnalytics(period);

    const {data,error}=await adminRpc("biteboss_admin_analytics_v7582",{
      p_from:period.from.toISOString(), p_to:period.to.toISOString(),
      p_compare_from:period.compareFrom.toISOString(), p_compare_to:period.compareTo.toISOString(),
      p_bucket:period.bucket
    });
    if(error){
      console.warn("BiteBoss analytics:",error);
      chart.innerHTML='<div class="analytics-empty">성과 데이터를 불러오지 못했습니다. 분석 RPC 상태를 확인하세요.</div>';
      return;
    }
    renderAnalytics(data || {});
  }

  function renderAnalytics(data){
    const current=data.current || {}; const compare=data.compare || {};
    setText("#analyticsActiveUsers", Number(current.active_users||0).toLocaleString("ko-KR"));
    setText("#analyticsVisits", Number(current.visits||0).toLocaleString("ko-KR"));
    setText("#analyticsChallenges", Number(current.challenges||0).toLocaleString("ko-KR"));
    setText("#analyticsCaptures", Number(current.captures||0).toLocaleString("ko-KR"));
    setText("#analyticsRepeatRate", `${Number(current.repeat_rate||0).toFixed(1)}%`);
    setText("#analyticsActiveUsersDelta", deltaText(current.active_users,compare.active_users));
    setText("#analyticsVisitsDelta", deltaText(current.visits,compare.visits));
    setText("#analyticsChallengesDelta", deltaText(current.challenges,compare.challenges));
    setText("#analyticsCapturesDelta", deltaText(current.captures,compare.captures));
    setText("#analyticsRepeatRateDelta", pointDeltaText(current.repeat_rate,compare.repeat_rate));
    renderAnalyticsTrend(Array.isArray(data.trend)?data.trend:[]);
    renderPartnerCompare(data.partner_compare || {});
  }


  async function loadAccessAnalytics(period = resolveAnalyticsPeriod()){
    const loadingTargets=[
      "#accessTierBreakdown","#accessSurfaceBreakdown","#accessCountryBreakdown","#accessRegionBreakdown",
      "#accessDeviceBreakdown","#accessOsBreakdown","#accessBrowserBreakdown","#accessRecentList"
    ];
    if(!$("#accessTierBreakdown") || !$("#accessRecentList")) return;
    loadingTargets.forEach(selector=>{ const node=$(selector); if(node) node.innerHTML='<div class="analytics-loading">불러오는 중…</div>'; });
    setText("#accessPeriodLabel",period.label || "선택 기간");

    const {data,error}=await adminRpc("biteboss_admin_access_analytics_v8224",{
      p_from:period.from.toISOString(),
      p_to:period.to.toISOString()
    });
    if(error){
      console.warn("BiteBoss access analytics:",error);
      const empty='<div class="analytics-empty">접속 데이터를 불러오지 못했습니다. 82.24 접속 분석 SQL 배포 상태를 확인하세요.</div>';
      loadingTargets.forEach(selector=>{ const node=$(selector); if(node) node.innerHTML=empty; });
      return;
    }
    renderAccessAnalytics(data || {});
  }

  function renderAccessAnalytics(data){
    const now=data.now || {}, period=data.period || {};
    setText("#accessOnlineNow",Number(now.online_visitors||0).toLocaleString("ko-KR"));
    setText("#accessPeriodActive",Number(period.active_visitors||0).toLocaleString("ko-KR"));
    setText("#accessNewVisitors",Number(period.new_visitors||0).toLocaleString("ko-KR"));
    setText("#accessReturningVisitors",Number(period.returning_visitors||0).toLocaleString("ko-KR"));
    setText("#accessMembers",Number(period.member_users||0).toLocaleString("ko-KR"));
    setText("#accessGuests",Number(period.guest_users||0).toLocaleString("ko-KR"));
    renderAccessBreakdown("#accessTierBreakdown",Array.isArray(data.tiers)?data.tiers:[],"tier");
    renderAccessBreakdown("#accessSurfaceBreakdown",Array.isArray(data.surfaces)?data.surfaces:[],"surface");
    renderAccessBars("#accessCountryBreakdown",Array.isArray(data.countries)?data.countries:[],row=>accessCountryLabel(row.country_code));
    renderAccessBars("#accessRegionBreakdown",Array.isArray(data.regions)?data.regions:[],row=>accessRegionLabel(row.country_code,row.region_code));
    renderAccessBars("#accessDeviceBreakdown",Array.isArray(data.devices)?data.devices:[],row=>accessDeviceLabel(row.device_class));
    renderAccessBars("#accessOsBreakdown",Array.isArray(data.os)?data.os:[],row=>accessOsLabel(row.os_family));
    renderAccessBars("#accessBrowserBreakdown",Array.isArray(data.browsers)?data.browsers:[],row=>accessBrowserLabel(row.browser_family));
    renderRecentAccess(Array.isArray(data.recent)?data.recent:[]);
  }

  function accessTierLabel(value){
    return ({guest:"게스트",member:"일반 회원",store_owner:"매장주",partner:"PARTNER",plus:"PLUS",pro:"PRO"})[String(value||"")] || String(value||"기타").toUpperCase();
  }

  function accessSurfaceLabel(value){
    return ({web:"Web",pwa:"PWA",ios:"iOS 앱",android:"Android 앱"})[String(value||"")] || String(value||"기타").toUpperCase();
  }

  function accessDeviceLabel(value){
    return ({mobile:"모바일",tablet:"태블릿",desktop:"데스크톱",other:"기타"})[String(value||"")] || "기타";
  }

  function accessOsLabel(value){
    return ({ios:"iOS / iPadOS",android:"Android",windows:"Windows",macos:"macOS",linux:"Linux",chromeos:"ChromeOS",other:"기타"})[String(value||"")] || "기타";
  }

  function accessBrowserLabel(value){
    return ({safari:"Safari",chrome:"Chrome",firefox:"Firefox",edge:"Edge",samsung:"Samsung Internet",other:"기타"})[String(value||"")] || "기타";
  }

  function accessCountryLabel(code){
    const value=String(code||"").toUpperCase();
    if(!value || value==="ZZ") return "알 수 없음";
    try{
      const names=new Intl.DisplayNames(["ko"],{type:"region"});
      return names.of(value) || value;
    }catch{return value;}
  }

  function accessRegionLabel(country,region){
    const countryCode=String(country||"").toUpperCase();
    const regionCode=String(region||"").toUpperCase();
    if(!regionCode || regionCode==="UNKNOWN") return `${accessCountryLabel(countryCode)} · 지역 미확인`;
    const kr={"11":"서울","26":"부산","27":"대구","28":"인천","29":"광주","30":"대전","31":"울산","36":"세종","41":"경기","42":"강원","43":"충북","44":"충남","45":"전북","46":"전남","47":"경북","48":"경남","50":"제주"};
    if(countryCode==="KR" && kr[regionCode]) return kr[regionCode];
    return `${accessCountryLabel(countryCode)} · ${regionCode}`;
  }

  function renderAccessBreakdown(selector,rows,type){
    const box=$(selector); if(!box) return;
    const normalized=rows.map(row=>({
      key:String(type==="tier"?row.tier:row.surface || "other"),
      online:Number(row.online_users||0),
      active:Number(row.active_users||0)
    }));
    if(type==="tier"){
      ["guest","member","store_owner","partner","plus","pro"].forEach(key=>{
        if(!normalized.some(row=>row.key===key)) normalized.push({key,online:0,active:0});
      });
      const order={guest:0,member:1,store_owner:2,partner:3,plus:4,pro:5};
      normalized.sort((a,b)=>(order[a.key]??99)-(order[b.key]??99));
    }else{
      normalized.sort((a,b)=>b.active-a.active || b.online-a.online);
    }
    box.innerHTML=normalized.map(row=>`<div class="admin-access-breakdown-row">
      <span>${escapeHtml(type==="tier"?accessTierLabel(row.key):accessSurfaceLabel(row.key))}</span>
      <div><strong>${row.online.toLocaleString("ko-KR")}</strong><small>현재</small></div>
      <div><strong>${row.active.toLocaleString("ko-KR")}</strong><small>기간</small></div>
    </div>`).join("") || '<div class="analytics-empty">접속 기록이 없습니다.</div>';
  }

  function renderAccessBars(selector,rows,labeler){
    const box=$(selector); if(!box) return;
    const normalized=rows.map(row=>({row,value:Number(row.active_users||0),online:Number(row.online_users||0)})).sort((a,b)=>b.value-a.value);
    const max=Math.max(1,...normalized.map(item=>item.value));
    box.innerHTML=normalized.slice(0,12).map(item=>{
      const label=String(labeler(item.row)||"기타");
      const width=Math.max(item.value?5:0,Math.round(item.value/max*100));
      return `<div class="admin-access-bar-row">
        <div class="admin-access-bar-copy"><span>${escapeHtml(label)}</span><div><strong>${item.value.toLocaleString("ko-KR")}</strong><small>${item.online ? `현재 ${item.online.toLocaleString("ko-KR")}` : "기간"}</small></div></div>
        <div class="admin-access-bar-track" aria-hidden="true"><i style="width:${width}%"></i></div>
      </div>`;
    }).join("") || '<div class="analytics-empty">접속 기록이 없습니다.</div>';
  }

  function renderRecentAccess(rows){
    const box=$("#accessRecentList"); if(!box) return;
    box.innerHTML=rows.slice(0,40).map(row=>{
      const tier=accessTierLabel(row.access_tier || (row.account_kind==="guest"?"guest":"member"));
      const surface=accessSurfaceLabel(row.surface);
      const nickname=String(row.nickname || (row.account_kind==="guest"?"게스트":"회원"));
      const page=String(row.current_path || "home").replace(/^page-/,"");
      const online=Boolean(row.is_online);
      const country=accessCountryLabel(row.country_code);
      const region=String(row.region_code||"") ? accessRegionLabel(row.country_code,row.region_code) : country;
      const device=accessDeviceLabel(row.device_class);
      const os=accessOsLabel(row.os_family);
      const browser=accessBrowserLabel(row.browser_family);
      return `<article class="admin-access-recent-row">
        <div class="admin-access-user"><span class="admin-presence-dot ${online?"is-online":""}" aria-hidden="true"></span><div><strong>${escapeHtml(nickname)}</strong><small>${escapeHtml(tier)}${row.is_store_owner?" · 매장주":""}</small></div></div>
        <div class="admin-access-context"><span>${escapeHtml(region)}</span><span>${escapeHtml(device)}</span><span>${escapeHtml(os)}</span><span>${escapeHtml(browser)}</span><span>${escapeHtml(surface)}</span><span>${escapeHtml(page)}</span></div>
        <time datetime="${escapeAttr(row.last_seen_at||"")}">${escapeHtml(formatDate(row.last_seen_at))}</time>
      </article>`;
    }).join("") || '<div class="analytics-empty">최근 접속 기록이 없습니다.</div>';
  }

  function deltaText(value, base){
    const v=Number(value||0), b=Number(base||0);
    if(!b) return v ? "비교기간 0" : "—";
    const pct=((v-b)/b)*100;
    return `${pct>=0?"+":""}${pct.toFixed(1)}%`;
  }
  function pointDeltaText(value,base){ const d=Number(value||0)-Number(base||0); return `${d>=0?"+":""}${d.toFixed(1)}%p`; }

  function renderAnalyticsTrend(rows){
    const box=$("#analyticsVisitChart"); if(!box) return;
    if(!rows.length){ box.innerHTML='<div class="analytics-empty">선택한 기간의 방문 데이터가 없습니다.</div>'; return; }
    const max=Math.max(1,...rows.map(row=>Number(row.visits||0)));
    box.innerHTML=`<div class="analytics-bars">${rows.map(row=>{
      const value=Number(row.visits||0); const height=Math.max(value?6:1,Math.round(value/max*100));
      return `<div class="analytics-bar-item" title="${escapeAttr(row.label||"")} · ${value.toLocaleString("ko-KR")}"><div class="analytics-bar-value">${value.toLocaleString("ko-KR")}</div><div class="analytics-bar-track"><i style="height:${height}%"></i></div><span>${escapeHtml(row.label||"")}</span></div>`;
    }).join("")}</div>`;
  }

  function renderPartnerCompare(data){
    const box=$("#analyticsPartnerChart"); const lift=$("#analyticsPartnerLift");
    if(!box || !lift) return;
    const partner=data.partner || {}, non=data.non_partner || {};
    const metrics=[
      ["인증 방문",Number(partner.avg_visits||0),Number(non.avg_visits||0)],
      ["도전",Number(partner.avg_challenges||0),Number(non.avg_challenges||0)],
      ["점령",Number(partner.avg_captures||0),Number(non.avg_captures||0)],
      ["재방문율",Number(partner.repeat_rate||0),Number(non.repeat_rate||0)]
    ];
    const max=Math.max(1,...metrics.flatMap(row=>[row[1],row[2]]));
    box.innerHTML=`<div class="partner-legend"><span><i></i>제휴</span><span><i></i>미제휴</span></div><div class="partner-bars">${metrics.map(([label,p,n])=>`<div class="partner-metric"><div class="partner-columns"><div><b>${formatAnalyticsValue(label,p)}</b><i class="is-partner" style="height:${Math.max(p?5:1,Math.round(p/max*100))}%"></i></div><div><b>${formatAnalyticsValue(label,n)}</b><i class="is-nonpartner" style="height:${Math.max(n?5:1,Math.round(n/max*100))}%"></i></div></div><span>${escapeHtml(label)}</span></div>`).join("")}</div>`;
    lift.innerHTML=metrics.map(([label,p,n])=>{
      const multiple=n>0?p/n:null;
      return `<div><span>${escapeHtml(label)}</span><strong>${multiple===null?(p>0?"제휴만 기록":"—"):`${multiple.toFixed(1)}배`}</strong><small>제휴 매장 평균</small></div>`;
    }).join("");
  }
  function formatAnalyticsValue(label,value){ return label.includes("율") ? `${Number(value||0).toFixed(1)}%` : Number(value||0).toFixed(1).replace(/\.0$/,""); }

  async function loadAdminComments(page=1){
    const list=$("#adminCommentList"), nav=$("#adminCommentPagination");
    if(!list) return;
    list.innerHTML='<div class="admin-empty">불러오는 중…</div>';

    const {data,error}=await adminRpc("biteboss_admin_store_comments_overview_v7596",{
      p_page:Math.max(1,Number(page||1)),
      p_page_size:10,
      p_filter:adminCommentFilter
    });

    if(error || !data?.ok){
      console.warn("BiteBoss admin comments:", error || data);
      list.innerHTML='<div class="admin-empty">한마디를 불러오지 못했습니다.</div>';
      nav?.classList.add("hidden");
      return;
    }

    adminCommentPage=Math.max(1,Number(data.page||1));
    const total=Math.max(0,Number(data.total||0));
    setText("#adminCommentCount",`${total}개`);
    const items=Array.isArray(data.items)?data.items:[];

    list.innerHTML=items.length?items.map(item=>{
      const reports=Array.isArray(item.reports)?item.reports:[];
      const reportCount=Math.max(0,Number(item.report_count||0));
      const stateBits=[
        item.is_pinned?"고정":"",
        item.is_hidden?"숨김":""
      ].filter(Boolean);

      return `<article class="admin-comment-row ${reportCount?"has-report":""}" data-admin-comment="${escapeAttr(item.id)}">
        <div class="admin-comment-main">
          <div class="admin-comment-head">
            <div class="admin-comment-identity">
              <strong>${escapeHtml(item.store_name||"매장")}</strong>
              <span>${escapeHtml(item.nickname||"사용자")}</span>
            </div>
            <time>${escapeHtml(formatDate(item.created_at))}</time>
          </div>
          <p class="admin-comment-body">${escapeHtml(item.body||"")}</p>
          <div class="admin-comment-meta">
            ${stateBits.length?`<span>${escapeHtml(stateBits.join(" · "))}</span>`:""}
            ${reportCount?`<button type="button" class="admin-report-count" data-report-detail-toggle>${reportCount}건 신고</button>`:""}
          </div>
          ${reportCount?`<div class="admin-report-detail hidden" data-report-detail>
            <div class="admin-report-detail-head"><strong>신고 내역</strong><span>${reportCount}건</span></div>
            ${reports.length?reports.map(report=>`<div class="admin-report-item">
              <div><strong>${escapeHtml(report.reporter_nickname||"사용자")}</strong><time>${escapeHtml(formatDate(report.created_at))}</time></div>
              <p>${escapeHtml(report.reason||"사유 없음")}</p>
            </div>`).join(""):`<div class="admin-report-empty">신고 상세 정보가 없습니다.</div>`}
          </div>`:""}
        </div>
        <div class="admin-comment-actions">
          <button class="text-btn" data-admin-comment-action="${item.is_pinned?"unpin":"pin"}" type="button">${item.is_pinned?"고정 해제":"고정"}</button>
          <button class="text-btn" data-admin-comment-action="${item.is_hidden?"unhide":"hide"}" type="button">${item.is_hidden?"숨김 해제":"숨김"}</button>
          <button class="text-btn danger" data-admin-comment-action="delete" type="button">삭제</button>
        </div>
      </article>`;
    }).join(""):'<div class="admin-empty">해당 조건의 한마디가 없습니다.</div>';

    list.querySelectorAll("[data-report-detail-toggle]").forEach(button=>button.addEventListener("click",()=>{
      const row=button.closest("[data-admin-comment]");
      const detail=row?.querySelector("[data-report-detail]");
      if(!detail) return;
      const open=detail.classList.toggle("hidden")===false;
      button.setAttribute("aria-expanded",String(open));
    }));

    list.querySelectorAll('[data-admin-comment-action]').forEach(button=>button.addEventListener('click',async()=>{
      const row=button.closest('[data-admin-comment]');
      const id=row?.dataset.adminComment;
      const action=button.dataset.adminCommentAction;
      if(!id)return;
      if(action==='delete'&&!confirm('영구 삭제할까요?'))return;
      const r=await adminRpc('biteboss_store_comment_moderate_v7582',{p_comment_id:id,p_action:action});
      if(r.error||!r.data?.ok){
        alert(r.data?.error==='PIN_LIMIT'?'고정은 매장당 최대 3개입니다.':'처리하지 못했습니다.');
        return;
      }
      await loadAdminComments(adminCommentPage);
    }));

    renderPagination(nav,adminCommentPage,total,10,next=>loadAdminComments(next));
  }

  async function loadPartnerRequests(){
    const box = $("#partnerRequestList");
    if(!box) return;
    const filter = String(partnerRequestStatus || "pending");
    const statuses = ["pending", "approved", "rejected"];
    const [currentResult, ...countResults] = await Promise.all([
      adminRpc("biteboss_admin_partner_requests", {p_status: filter, p_limit: 1000}),
      ...statuses.map(status => adminRpc("biteboss_admin_partner_requests", {p_status: status, p_limit: 1000}))
    ]);
    const {data,error} = currentResult;
    if(error){ console.warn("BiteBoss partner requests:", error); box.innerHTML = `<div class="timeline-item muted">제휴 신청을 불러오지 못했습니다.</div>`; return; }
    partnerRequests = Array.isArray(data) ? data : [];
    const counts = Object.fromEntries(statuses.map((status, index) => {
      const result = countResults[index];
      return [status, result && !result.error && Array.isArray(result.data) ? result.data.length : 0];
    }));
    setText("#partnerCountPending", counts.pending || 0);
    setText("#partnerCountApproved", counts.approved || 0);
    setText("#partnerCountRejected", counts.rejected || 0);
    renderPartnerRequests();
  }

  function renderPartnerRequests(){
    const box = $("#partnerRequestList");
    const nav = $("#partnerRequestPagination");
    if(!box) return;

    const total = partnerRequests.length;
    const totalPages = Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE));
    partnerRequestPage = Math.min(Math.max(1, partnerRequestPage), totalPages);
    const startIndex = (partnerRequestPage - 1) * ADMIN_PAGE_SIZE;
    const rows = partnerRequests.slice(startIndex, startIndex + ADMIN_PAGE_SIZE);

    box.innerHTML = rows.length ? rows.map(row => {
      const status = String(row.status || "pending");
      const canReview = status === "pending";
      const code = String(row.activation_code || "").trim();
      return `<article class="partner-request-row">
        <div class="partner-request-row-head"><div><span>${escapeHtml(status.toUpperCase())}</span><strong>${escapeHtml(row.store_name || "Store")}</strong><p>${escapeHtml(row.store_address || "")}</p></div><time>${escapeHtml(formatDate(row.created_at))}</time></div>
        <div class="partner-request-grid"><div><span>담당자</span><strong>${escapeHtml(row.requester_name || row.requester_nickname || "-")}</strong></div><div><span>연락처</span><strong>${escapeHtml(row.contact || "-")}</strong></div><div><span>사업자번호</span><strong>${escapeHtml(formatBusinessNumber(row.business_number || ""))}</strong></div><div><span>신청자</span><strong>${escapeHtml(row.requester_nickname || "-")}</strong></div></div>
        ${(row.website_url||row.sns_url)?`<div class="partner-evidence">${row.website_url?`<a href="${escapeAttr(row.website_url)}" target="_blank" rel="noopener noreferrer">공식 홈페이지 확인</a>`:""}${row.sns_url?`<a href="${escapeAttr(row.sns_url)}" target="_blank" rel="noopener noreferrer">공식 SNS 확인</a>`:""}</div>`:""}
        ${row.message ? `<p class="partner-request-message">${escapeHtml(row.message)}</p>` : ""}
        ${code ? `<div class="partner-activation-code"><span>활성화 코드</span><code>${escapeHtml(code)}</code><button class="text-btn" data-copy-partner-code="${escapeAttr(code)}" type="button">복사</button></div>` : ""}
        ${canReview ? `<div class="partner-request-actions"><button class="primary-btn" data-partner-approve="${escapeAttr(row.id)}" type="button">제휴 승인</button><button class="secondary-btn" data-partner-reject="${escapeAttr(row.id)}" type="button">거절</button></div>` : ""}
      </article>`;
    }).join("") : `<div class="partner-request-empty"><strong>제휴 신청이 없습니다.</strong><span>선택한 상태에 해당하는 신청이 없습니다.</span></div>`;

    $$('[data-partner-approve]').forEach(btn => btn.onclick = () => reviewPartnerRequest(btn.dataset.partnerApprove, "approve", btn));
    $$('[data-partner-reject]').forEach(btn => btn.onclick = () => reviewPartnerRequest(btn.dataset.partnerReject, "reject", btn));
    $$('[data-copy-partner-code]').forEach(btn => btn.onclick = async () => { try{ await navigator.clipboard.writeText(btn.dataset.copyPartnerCode || ""); btn.textContent="복사됨"; setTimeout(()=>btn.textContent="복사",1200); }catch{ alert(btn.dataset.copyPartnerCode || ""); } });

    renderPagination(nav, partnerRequestPage, total, ADMIN_PAGE_SIZE, next => {
      partnerRequestPage = next;
      renderPartnerRequests();
      box.scrollIntoView({ block:"start", behavior:"auto" });
    });
  }

  async function reviewPartnerRequest(requestId, decision, button){
    if(!requestId) return;
    if(button) button.disabled = true;
    try{
      const { data, error } = await adminRpc("biteboss_admin_review_partner_request", { p_request_id:requestId, p_decision:decision });
      if(error) throw error;
      if(!data?.ok){ alert(data?.error || "처리하지 못했습니다."); return; }
      if(decision === "approve" && data.activation_code) alert(`제휴 승인 완료\n활성화 코드: ${data.activation_code}`);
      await Promise.all([loadPartnerRequests(), loadStores(), loadDashboard()]);
    }catch(error){ console.warn("BiteBoss partner request review:", error); alert(error?.message || "처리하지 못했습니다."); }
    finally{ if(button) button.disabled = false; }
  }

  function formatBusinessNumber(value){ const digits=String(value||"").replace(/\D/g,""); return digits.length===10 ? `${digits.slice(0,3)}-${digits.slice(3,5)}-${digits.slice(5)}` : (value||"-"); }

  async function loadDashboard(){
    const [{ data:stats, error:statsError }, { data:logs, error:logsError }] = await Promise.all([
      adminRpc("biteboss_admin_dashboard"),
      adminSb.from("biteboss_event_logs")
        .select("id,event_type,payload,created_at,biteboss_stores(name)")
        .order("created_at", { ascending:false })
        .limit(8)
    ]);

    if(!statsError && stats){
      setText("#statScans", stats.today_checkins || 0);
      setText("#statClaims", stats.today_claims || 0);
      setText("#statStores", stats.active_stores || 0);
      setText("#statSuspicious", stats.suspicious_today || 0);
    }

    const box = $("#adminLogs");
    if(!box) return;
    if(logsError){
      box.innerHTML = `<div class="admin-activity-empty">최근 활동을 불러오지 못했습니다.</div>`;
      return;
    }

    box.innerHTML = (logs || []).map(row => {
      const type = String(row.event_type || "");
      const label = logLabel(type);
      const store = row.biteboss_stores?.name || "BiteBoss";
      const tone = activityTone(type);
      return `
        <article class="admin-activity-row">
          <time>${escapeHtml(formatActivityTime(row.created_at))}</time>
          <strong>${escapeHtml(label)}</strong>
          <span>${escapeHtml(store)}</span>
        </article>
      `;
    }).join("") || `<div class="admin-activity-empty">아직 기록된 활동이 없습니다.</div>`;
  }

  async function loadStoreRequests(){
    const box = $("#adminStoreRequestList");
    if(!box) return;

    const { data, error } = await adminRpc("biteboss_admin_store_requests", {
      p_status:"pending",
      p_limit:1000
    });

    if(error){
      console.warn("BiteBoss store requests:", error);
      box.innerHTML = `<div class="timeline-item muted">매장 등록 요청을 불러오지 못했습니다.</div>`;
      return;
    }

    storeRequests = Array.isArray(data) ? data : [];
    setText("#adminStoreRequestCount", storeRequests.length);
    renderStoreRequests();
  }

  function renderStoreRequests(){
    const box = $("#adminStoreRequestList");
    const nav = $("#adminStoreRequestPagination");
    if(!box) return;

    const total = storeRequests.length;
    const totalPages = Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE));
    storeRequestPage = Math.min(Math.max(1, storeRequestPage), totalPages);
    const startIndex = (storeRequestPage - 1) * ADMIN_PAGE_SIZE;
    const rows = storeRequests.slice(startIndex, startIndex + ADMIN_PAGE_SIZE);

    box.innerHTML = rows.length ? rows.map(row => `
      <article class="partner-request-row">
        <div class="partner-request-row-head">
          <div>
            <span>STORE REQUEST</span>
            <strong>${escapeHtml(row.name || "매장")}</strong>
            <p>${escapeHtml(row.address || [row.city,row.district].filter(Boolean).join(" "))}</p>
          </div>
          <time>${escapeHtml(formatDate(row.created_at))}</time>
        </div>
        <div class="partner-request-grid">
          <div><span>카테고리</span><strong>${escapeHtml(categoryLabel(row.category))}</strong></div>
          <div><span>요청자</span><strong>${escapeHtml(row.requester_nickname || "-")}</strong></div>
          <div><span>위도</span><strong>${Number(row.latitude).toFixed(6)}</strong></div>
          <div><span>경도</span><strong>${Number(row.longitude).toFixed(6)}</strong></div>
        </div>
        <div class="partner-request-actions">
          <button class="primary-btn" data-store-request-approve="${escapeAttr(row.id)}" type="button">등록 승인</button>
          <button class="secondary-btn" data-store-request-reject="${escapeAttr(row.id)}" type="button">반려</button>
        </div>
      </article>
    `).join("") : `<div class="timeline-item muted">확인할 매장 등록 요청이 없습니다.</div>`;

    $$("[data-store-request-approve]").forEach(button => {
      button.onclick = () => reviewStoreRequest(button.dataset.storeRequestApprove, "approve", button);
    });
    $$("[data-store-request-reject]").forEach(button => {
      button.onclick = () => reviewStoreRequest(button.dataset.storeRequestReject, "reject", button);
    });

    renderPagination(nav, storeRequestPage, total, ADMIN_PAGE_SIZE, next => {
      storeRequestPage = next;
      renderStoreRequests();
      box.scrollIntoView({ block:"start", behavior:"auto" });
    });
  }

  async function reviewStoreRequest(requestId, decision, button){
    if(!requestId) return;
    if(decision === "reject" && !confirm("이 매장 등록 요청을 반려할까요?")) return;

    if(button) button.disabled = true;
    try{
      const { data, error } = await adminRpc("biteboss_admin_review_store_request", {
        p_request_id:requestId,
        p_decision:decision
      });
      if(error) throw error;
      if(!data?.ok) throw new Error(data?.message || data?.error || "STORE_REQUEST_REVIEW_FAILED");

      await Promise.all([loadStoreRequests(), loadStores(), loadDashboard()]);
    }catch(error){
      console.warn("BiteBoss store request review:", error);
      alert(error?.message || "처리하지 못했습니다.");
    }finally{
      if(button) button.disabled = false;
    }
  }

  async function loadStores(){
    const pageSize = 1000;
    const allStores = [];

    for(let from = 0; ; from += pageSize){
      const { data, error } = await adminSb
        .from("biteboss_stores")
        .select("*")
        .order("created_at", { ascending:false })
        .range(from, from + pageSize - 1);

      if(error){
        console.warn(error);
        return;
      }

      const rows = Array.isArray(data) ? data : [];
      allStores.push(...rows);
      if(rows.length < pageSize) break;
    }

    stores = allStores;
    storePlanMap.clear();
    renderStores();
    await renderQr();
  }

  async function createStore(event){
    event.preventDefault();

    const formEl = event.currentTarget;
    const form = new FormData(formEl);
    const status = $("#storeCreateStatus");
    const submit = formEl.querySelector('button[type="submit"]');

    const name = String(form.get("name") || "").trim();
    const latitude = Number(form.get("latitude"));
    const longitude = Number(form.get("longitude"));
    if(!name || !Number.isFinite(latitude) || !Number.isFinite(longitude)){
      if(status) status.textContent = "매장명과 위도/경도를 확인하세요.";
      return;
    }
    if(latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180){
      if(status) status.textContent = "위도/경도 범위를 확인하세요.";
      return;
    }

    if(status) status.textContent = "매장을 등록하는 중…";
    if(submit) submit.disabled = true;

    try{
      await ensureAdminAuthSession();

      const { data, error } = await adminRpc("biteboss_admin_create_store", {
        p_name:name,
        p_brand_name:String(form.get("brand_name") || "").trim(),
        p_category:String(form.get("category") || "restaurant"),
        p_city:String(form.get("city") || "").trim(),
        p_district:String(form.get("district") || "").trim(),
        p_address:String(form.get("address") || "").trim(),
        p_latitude:latitude,
        p_longitude:longitude,
        p_partnership_status:"unclaimed",
        p_photo_url:String(form.get("photo_url") || "").trim(),
        p_store_admin_id:null,
        p_store_admin_pin:null
      });

      if(error) throw error;
      if(!data?.ok) throw new Error(data?.message || data?.error || "STORE_CREATE_FAILED");

      formEl.reset();
      if(status) status.textContent = `등록 완료 · ${data.store?.name || name} · 비제휴 매장은 GPS 체류 자동 점령으로 운영됩니다.`;

      await Promise.all([loadStores(), loadDashboard()]);
    }catch(error){
      console.error("BiteBoss store create failed:", error);
      if(status) status.textContent = `등록 실패 · ${error?.message || "알 수 없는 오류"}`;
    }finally{
      if(submit) submit.disabled = false;
    }
  }
  function normalizedStorePlans(){
    const raw=appConfig.store_plans;
    const rows=Array.isArray(raw) ? raw : [];
    return rows.map(item=>({
      store_id:String(item?.store_id || ""),
      plan:String(item?.plan || "partner")==="pro" ? "pro" : "partner",
      started_at:item?.started_at || null,
      expires_at:item?.expires_at || null
    })).filter(item=>item.store_id);
  }

  function hydrateStorePlanMap(){
    storePlanMap.clear();
    normalizedStorePlans().forEach(item=>{
      const expired=item.plan==="pro" && item.expires_at && new Date(item.expires_at).getTime()<=Date.now();
      storePlanMap.set(item.store_id,{...item,plan:expired ? "partner" : item.plan});
    });
    normalizedPartnerBannerIds().forEach(storeId=>{
      if(!storePlanMap.has(String(storeId))){
        storePlanMap.set(String(storeId),{
          store_id:String(storeId),
          plan:"pro",
          started_at:null,
          expires_at:null,
          migrated_from_banner:true
        });
      }
    });
  }


  function renderStores(){
    const box = $("#adminStoreList");
    if(!box) return;

    const query = String($("#adminStoreSearch")?.value || "").trim().toLowerCase();
    const partnerBannerIds = normalizedPartnerBannerIds();
    const filtered = stores.filter(store => {
      const isPartner = String(store.partnership_status || "") === "partnered";
      const plan=storePlanMap.get(String(store.id))?.plan || (isPartner ? "partner" : "none");
      const bannerRegistered = partnerBannerIds.includes(String(store.id));
      const bannerEnabled = bannerRegistered;
      if(adminStoreFilter === "partner" && !isPartner) return false;
      if(adminStoreFilter === "banner" && !bannerRegistered) return false;
      if(!query) return true;
      return [store.name, store.brand_name, store.city, store.district, store.address, categoryLabel(store.category)]
        .filter(Boolean)
        .some(value => String(value).toLowerCase().includes(query));
    });
    setText("#adminStoreCount", stores.length);
    const nav = $("#adminStorePagination");
    const total = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE));
    adminStorePage = Math.min(Math.max(1, adminStorePage), totalPages);
    const startIndex = (adminStorePage - 1) * ADMIN_PAGE_SIZE;
    const pageRows = filtered.slice(startIndex, startIndex + ADMIN_PAGE_SIZE);

    box.innerHTML = pageRows.map(store => {
      const isPartner = store.partnership_status === "partnered";
      const plan=storePlanMap.get(String(store.id))?.plan || (isPartner ? "partner" : "none");
      const bannerRegistered = partnerBannerIds.includes(String(store.id));
      const bannerEnabled = bannerRegistered;
      const location = [store.city, store.district].filter(Boolean).join(" ") || "지역 미등록";
      return `
        <article class="admin-store-row">
          <div class="admin-store-summary">
            <div class="admin-store-thumb-wrap">${store.photo_url ? `<img class="admin-store-thumb" src="${escapeAttr(store.photo_url)}" alt="" loading="lazy" decoding="async" />` : `<span class="admin-store-thumb admin-store-thumb-empty" aria-hidden="true">${escapeHtml(storeInitial(store.name))}</span>`}</div>
            <div class="admin-store-copy">
              <div class="admin-store-title-line"><strong>${escapeHtml(store.name)}</strong><span class="partner-badge ${partnershipClass(store.partnership_status)}">${escapeHtml(partnershipLabel(store.partnership_status))}</span>${isPartner ? `<span class="store-plan-badge ${plan==="pro" ? "is-pro" : ""}">${plan==="pro" ? "PRO" : "PARTNER"}</span>` : ""}${(() => { const state = bannerOperationalState(store, bannerEnabled); return `<span class="admin-banner-state ${state.className}">${escapeHtml(state.label)}</span>`; })()}</div>
              <p>${escapeHtml(location)} · ${escapeHtml(categoryLabel(store.category))}</p>
            </div>
          </div>
          <div class="admin-store-actions">
            <button class="secondary-btn admin-store-edit-btn admin-action-btn" data-edit-store="${escapeAttr(store.id)}" type="button">매장 수정</button>
            <button class="secondary-btn admin-banner-toggle admin-action-btn ${bannerEnabled ? "is-on" : ""}" data-banner-store="${escapeAttr(store.id)}" data-banner-enabled="${bannerEnabled ? "true" : "false"}" data-store-plan="${escapeAttr(plan)}" type="button">${isPartner && plan!=="pro" ? "PRO 전용 배너" : (bannerEnabled ? "배너 끄기" : "배너 켜기")}</button>
            ${isPartner
              ? `<a class="secondary-btn admin-action-btn" href="./store-admin.html">매장 어드민</a>`
              : `<button class="secondary-btn admin-action-btn" data-partner-store="${escapeAttr(store.id)}" type="button">제휴 전환</button>`}
            <button class="secondary-btn admin-action-btn ${store.status === "active" ? "danger-text" : ""}" data-toggle-store="${escapeAttr(store.id)}" type="button">${store.status === "active" ? "비활성화" : "활성화"}</button>
            <button class="secondary-btn admin-action-btn danger-text" data-delete-store="${escapeAttr(store.id)}" type="button">삭제</button>
          </div>
          ${activationCodes.has(String(store.id)) ? (() => { const item = activationCodes.get(String(store.id)); return `<div class="activation-result" data-activation-result="${escapeAttr(store.id)}"><strong>직원 활성화 코드</strong><code>${escapeHtml(item.code)}</code><button class="secondary-btn" data-copy-code="${escapeAttr(item.code)}" type="button">코드 복사</button><p>${escapeHtml(item.expires || "7일 안에 매장 어드민에서 ID/PIN을 등록합니다.")}</p></div>`; })() : `<div class="activation-result hidden" data-activation-result="${escapeAttr(store.id)}"></div>`}
        </article>`;
    }).join("") || `<div class="admin-empty">${query ? "검색 결과가 없습니다." : "등록된 매장이 없습니다."}</div>`;

    $$('[data-edit-store]').forEach(btn => {
      btn.onclick = () => openStoreEditor(btn.dataset.editStore);
    });

    $$('[data-delete-store]').forEach(btn => {
      btn.onclick = () => deleteStoreById(btn.dataset.deleteStore);
    });

    $$('[data-partner-store]').forEach(btn => {
      btn.onclick = async () => {
        const store = stores.find(item => item.id === btn.dataset.partnerStore);
        if(!store) return;
        if(!confirm(`${store.name} 매장을 정식 제휴로 전환할까요?`)) return;
        btn.disabled = true;
        const original = btn.textContent;
        btn.textContent = "전환 중…";
        try{
          const { data, error } = await adminRpc("biteboss_admin_partner_store", { p_store_id:store.id });
          if(error) throw error;
          if(!data?.ok) throw new Error(data?.error || "PARTNER_FAILED");
          activationCodes.set(String(store.id), {
            code:String(data.activation_code || ""),
            expires:data.activation_expires_at ? `유효기간: ${formatDate(data.activation_expires_at)}` : "7일 안에 Store Admin에서 직원이 ID/PIN을 직접 등록합니다."
          });
          await Promise.all([loadDashboard(), loadStores()]);
        }catch(error){
          console.error(error);
          alert(error?.message || "제휴 전환에 실패했습니다.");
          btn.textContent = original;
        }finally{
          btn.disabled = false;
        }
      };
    });

    $$('[data-banner-store]').forEach(btn => {
      btn.onclick = async () => {
        const id = String(btn.dataset.bannerStore || "");
        const store = stores.find(item => String(item.id) === id);
        if(!store) return;
        const plan=String(btn.dataset.storePlan || storePlanMap.get(id)?.plan || (store.partnership_status==="partnered" ? "partner" : "none"));
        if(String(store.partnership_status || "")==="partnered" && plan!=="pro"){
          await openStoreEditor(id);
          setStatusText($("#adminStorePlanStatus"),"추천 배너를 사용하려면 이 매장을 PRO로 변경하세요.");
          $("#adminStorePlanSection")?.scrollIntoView({block:"start",behavior:"smooth"});
          return;
        }
        const enabled = btn.dataset.bannerEnabled === "true";
        const banners = normalizedPartnerBanners().filter(item => item.id !== id);
        if(!enabled){
          banners.push({
            id,
            name:String(store.name || ""),
            photo_url:String(store.photo_url || ""),
            status:String(store.status || "active"),
            latitude:Number(store.latitude),
            longitude:Number(store.longitude),
            partnership_status:String(store.partnership_status || ""),
            copy:"",
            distance_km:5,
            priority:3
          });
        }
        btn.disabled = true;
        try{
          await secureAdminConfigUpsert({ key:"partner_banners", value:banners });
          await loadConfig();
          renderStores();
          if(editingStoreId === id && editingStoreBundle?.store) renderAdminPartnerPromotion(editingStoreBundle.store);
        }catch(error){
          console.error(error);
          alert(error?.message || "배너 설정을 저장하지 못했습니다.");
          btn.disabled = false;
        }
      };
    });

    $$('[data-copy-code]').forEach(btn => {
      btn.onclick = async () => {
        await navigator.clipboard.writeText(btn.dataset.copyCode || "");
        const original = btn.textContent;
        btn.textContent = "복사됨";
        setTimeout(() => { btn.textContent = original; }, 1000);
      };
    });

    $$('[data-toggle-store]').forEach(btn => {
      btn.onclick = async () => {
        const store = stores.find(item => item.id === btn.dataset.toggleStore);
        if(!store) return;
        const next = store.status === "active" ? "inactive" : "active";
        const { error } = await adminSb.from("biteboss_stores").update({ status:next, updated_at:new Date().toISOString() }).eq("id", store.id);
        if(error) return alert(error.message);
        await loadStores();
      };
    });

    renderPagination(nav, adminStorePage, total, ADMIN_PAGE_SIZE, next => {
      adminStorePage = next;
      renderStores();
      box.scrollIntoView({ block:"start", behavior:"auto" });
    });
  }

  async function renderQr(){
    const box = $("#qrList");
    if(!box) return;
    const partnerStores = stores.filter(store => store.partnership_status === "partnered");
    const nonPartnerStores = stores.filter(store => store.partnership_status !== "partnered");
    const ids = partnerStores.map(store => store.id);

    let map = new Map();
    if(ids.length){
      const { data, error } = await adminSb.from("biteboss_qr_codes")
        .select("store_id,token,is_active,expires_at,created_at")
        .in("store_id", ids).eq("is_active", true);
      if(error){ box.innerHTML = `<div class="admin-empty">QR을 불러오지 못했습니다.</div>`; return; }
      map = new Map((data || []).map(row => [row.store_id, row]));
    }

    box.innerHTML = [
      ...partnerStores.map(store => {
        const qr = map.get(store.id);
        const link = qr ? `${location.origin}${location.pathname.replace(/admin\.html.*$/, "index.html")}?claim=${encodeURIComponent(qr.token)}` : "";
        return `<article class="admin-qr-row">
          <div class="admin-qr-head"><div><strong>${escapeHtml(store.name)}</strong><p>정식 제휴 · QR 즉시 점령</p></div><span class="admin-qr-state ${qr ? "is-active" : ""}">${qr ? "활성" : "QR 없음"}</span></div>
          ${qr ? `<div class="admin-qr-data"><div><span>Token</span><code>${escapeHtml(qr.token)}</code></div><div><span>Link</span><p>${escapeHtml(link)}</p></div></div>` : ""}
          <div class="admin-qr-actions">${link ? `<button class="secondary-btn" data-copy="${escapeAttr(link)}" type="button">링크 복사</button>` : ""}<button class="secondary-btn" data-rotate="${escapeAttr(store.id)}" type="button">${qr ? "재발급" : "QR 발급"}</button></div>
        </article>`;
      }),
      ...nonPartnerStores.map(store => `<article class="admin-qr-row"><div class="admin-qr-head"><div><strong>${escapeHtml(store.name)}</strong><p>비제휴 · QR 없음 · GPS 체류 자동점령</p></div><span class="admin-qr-state">GPS</span></div></article>`)
    ].join("") || `<div class="admin-empty">등록된 매장이 없습니다.</div>`;

    $$('[data-copy]').forEach(btn => btn.onclick = async () => { await navigator.clipboard.writeText(btn.dataset.copy); btn.textContent = "복사됨"; });
    $$('[data-rotate]').forEach(btn => btn.onclick = async () => {
      const hasQr = btn.closest('.admin-qr-row')?.querySelector('.admin-qr-state.is-active');
      if(hasQr && !confirm("기존 QR은 즉시 무효화됩니다. 재발급할까요?")) return;
      const { error } = await adminRpc("biteboss_rotate_qr", { p_store_id:btn.dataset.rotate });
      if(error) return alert(error.message.includes('PARTNER_ONLY_QR') ? '정식 제휴 매장만 QR을 사용할 수 있습니다.' : error.message);
      await renderQr();
    });
  }

  async function loadConfig(){
    const { data, error } = await adminSb.from("biteboss_app_config").select("key,value");
    if(error) return console.warn(error);
    appConfig = Object.fromEntries((data || []).map(row => [row.key, row.value]));
    hydrateStorePlanMap();
  }

  function renderRules(){
    const form = $("#rulesForm");
    if(!form) return;
    [...form.elements].forEach(input => {
      if(!input.name || !(input.name in appConfig)) return;
      input.value = String(appConfig[input.name]);
    });
  }

  async function saveRules(event){
    event.preventDefault();
    const formEl = event.currentTarget;
    const submit = formEl.querySelector('button[type="submit"]');
    if(submit?.disabled) return;
    if(submit) submit.disabled = true;
    const form = new FormData(formEl);
    const numeric = new Set([
      "protect_minutes","reclaim_cooldown_minutes","capture_cooldown_minutes","gps_radius_m","max_location_accuracy_m",
      "gps_dwell_seconds","gps_presence_ping_seconds","daily_store_limit","nearby_radius_m","nearby_limit",
      "xp_visit","xp_boss_win","xp_crew","xp_defense_success",
      "store_bonus_visits_per_point","store_bonus_max","challenge_cooldown_minutes",
      "defense_decay_day_1","defense_decay_day_2","defense_decay_day_3","defense_decay_day_4",
      "defense_decay_value_1","defense_decay_value_2","defense_decay_value_3","defense_decay_value_4",
      "organization_leave_xp_percent","organization_leave_cooldown_days",
      "organization_leader_leave_xp_percent","organization_leader_leave_cooldown_days",
      "organization_invite_days"
    ]);
    const boolean = new Set(["feature_ranking","feature_offers"]);
    const rows = [];

    for(const [key, raw] of form.entries()){
      let value = raw;
      if(numeric.has(key)) value = Number(raw);
      if(boolean.has(key)) value = raw === "true";
      rows.push({ key, value, updated_by:session.user.id, updated_at:new Date().toISOString() });
    }

    try{
      await secureAdminConfigUpsert(rows);
      await loadConfig();
      renderRules();
      alert("게임 규칙을 저장했습니다.");
    }catch(error){
      alert(error?.message || "게임 규칙 저장에 실패했습니다.");
    }finally{
      if(submit) submit.disabled = false;
    }
  }

  async function loadBosses(){
    const box = $("#bossList");
    const nav = $("#bossPagination");
    if(!box) return;

    const { data, error } = await adminRpc("biteboss_admin_bosses");

    if(error){
      console.warn("BiteBoss admin bosses:", error);
      box.innerHTML = `<div class="admin-empty">보스 현황을 불러오지 못했습니다.</div>`;
      nav?.classList.add("hidden");
      return;
    }

    const rows = Array.isArray(data) ? data : [];
    const total = rows.length;
    const totalPages = Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE));
    bossPage = Math.min(Math.max(1, bossPage), totalPages);
    const startIndex = (bossPage - 1) * ADMIN_PAGE_SIZE;
    const pageRows = rows.slice(startIndex, startIndex + ADMIN_PAGE_SIZE);

    box.innerHTML = pageRows.map(row => {
      const storeName = String(row.store_name || "매장").trim();
      const bossName = String(row.nickname || "").trim();
      const isOccupied = Boolean(bossName);

      const category = String(
        row.category_label ||
        row.category_name ||
        row.category ||
        ""
      ).trim();

      const protectionActive = Boolean(
        row.protected_until &&
        new Date(row.protected_until).getTime() > Date.now()
      );

      const stateLabel = isOccupied ? bossName : "미점령";
      const statusLabel = protectionActive
        ? `보호 ${formatRemaining(row.protected_until)}`
        : isOccupied
          ? "도전 가능"
          : "점령 가능";

      const meta = [category, statusLabel].filter(Boolean).join(" · ");
      const xp = Math.max(0, Number(row.claims_for_user || 0) * 120);

      return `
        <article class="admin-boss-row ${isOccupied ? "is-occupied" : "is-unclaimed"}">
          <div class="admin-boss-copy">
            <strong class="admin-boss-store">${escapeHtml(storeName)}</strong>
            <span class="admin-boss-owner">${escapeHtml(stateLabel)}</span>
            <small class="admin-boss-meta">${escapeHtml(meta)}</small>
          </div>
          <div class="admin-boss-xp" aria-label="${xp} XP">
            <strong>${xp}</strong>
            <span>XP</span>
          </div>
        </article>
      `;
    }).join("") || `<div class="admin-empty">활성 매장이 없습니다.</div>`;

    renderPagination(nav, bossPage, total, ADMIN_PAGE_SIZE, next => {
      bossPage = next;
      loadBosses();
      box.scrollIntoView({ block:"start", behavior:"auto" });
    });
  }

  async function loadUsers(){
    const box = $("#userList");
    if(!box) return;
    const keyword = String($("#userSearch")?.value || "").trim();
    const { data, error } = await adminRpc("biteboss_admin_list_users", { p_query:keyword || null, p_limit:100 });
    if(error){
      console.warn(error);
      box.innerHTML = `<div class="timeline-item muted">사용자를 불러오지 못했습니다.</div>`;
      return;
    }

    const rows = Array.isArray(data) ? data : [];
    const nav = $("#userPagination");
    const total = rows.length;
    const totalPages = Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE));
    adminUserPage = Math.min(Math.max(1, adminUserPage), totalPages);
    const startIndex = (adminUserPage - 1) * ADMIN_PAGE_SIZE;
    const pageRows = rows.slice(startIndex, startIndex + ADMIN_PAGE_SIZE);

    box.innerHTML = pageRows.map(row => `
      <article class="admin-user-row">
        <div class="admin-user-copy">
          <strong>${escapeHtml(row.nickname || row.username || "Member")}</strong>
          <p>${row.username ? `@${escapeHtml(row.username)} · ` : ""}${escapeHtml(row.status || "active")} · ${escapeHtml(formatDate(row.created_at))}</p>
        </div>
        <div class="admin-user-actions">
          <button class="text-btn ${row.status === "active" ? "danger-text" : "good"}" data-user-status="${escapeAttr(row.user_id)}" data-next-status="${row.status === "active" ? "blocked" : "active"}" type="button">${row.status === "active" ? "차단" : "해제"}</button>
          <button class="text-btn danger-text" data-delete-user="${escapeAttr(row.user_id)}" data-user-label="${escapeAttr(row.nickname || row.username || "Member")}" type="button">삭제</button>
        </div>
      </article>
    `).join("") || `<div class="timeline-item muted">검색 결과가 없습니다.</div>`;

    $$('[data-user-status]').forEach(btn => btn.onclick = async () => {
      const { data:updateData, error:updateError } = await adminRpc("biteboss_admin_set_user_status", {
        p_user_id:btn.dataset.userStatus,
        p_status:btn.dataset.nextStatus
      });
      if(updateError || !updateData?.ok) return alert(updateError?.message || updateData?.error || "상태 변경 실패");
      await loadUsers();
    });

    $$('[data-delete-user]').forEach(btn => btn.onclick = async () => {
      const label = btn.dataset.userLabel || "회원";
      const typed = prompt(`${label} 회원을 완전히 삭제합니다. 계속하려면 DELETE를 입력하세요.`);
      if(typed !== "DELETE") return;
      btn.disabled = true;
      try{
        const { data:deleted, error:deleteError } = await adminRpc("biteboss_admin_delete_user", { p_user_id:btn.dataset.deleteUser });
        if(deleteError) throw deleteError;
        if(!deleted?.ok) throw new Error(deleted?.error || "USER_DELETE_FAILED");
        await Promise.all([loadUsers(), loadDashboard(), loadBosses()]);
      }catch(error){
        alert(error?.message || "회원 삭제에 실패했습니다.");
      }finally{
        btn.disabled = false;
      }
    });

    renderPagination(nav, adminUserPage, total, ADMIN_PAGE_SIZE, next => {
      adminUserPage = next;
      loadUsers();
      box.scrollIntoView({ block:"start", behavior:"auto" });
    });
  }


  async function loadGameOps(){
    const summaryBox = $("#gameOpsSummary");
    const storesBox = $("#gameOpsStores");
    const orgsBox = $("#gameOpsOrganizations");
    const storesNav = $("#gameOpsStorePagination");
    const orgsNav = $("#gameOpsOrganizationPagination");
    if(!summaryBox && !storesBox && !orgsBox) return;

    const [overviewResult, controlsResult, orgsResult] = await Promise.all([
      adminRpc("biteboss_admin_game_overview"),
      adminRpc("biteboss_admin_game_store_controls"),
      adminRpc("biteboss_admin_game_organizations")
    ]);

    if(summaryBox){
      if(overviewResult.error){
        console.warn(overviewResult.error);
        summaryBox.innerHTML = `<div class="admin-empty">게임 현황을 불러오지 못했습니다.</div>`;
      }else{
        const data = overviewResult.data || {};
        summaryBox.innerHTML = `
          <div><span>플레이어</span><strong>${Number(data.players || 0)}</strong></div>
          <div><span>보스 매장</span><strong>${Number(data.bosses || 0)}</strong></div>
          <div><span>크루</span><strong>${Number(data.crews || 0)}</strong></div>
          <div><span>조직</span><strong>${Number(data.organizations || 0)}</strong></div>
          <div><span>크루 점령지</span><strong>${Number(data.organization_territories || 0)}</strong></div>
          <div><span>도전</span><strong>${Number(data.challenges || 0)}</strong></div>
        `;
      }
    }

    if(storesBox){
      if(controlsResult.error){
        console.warn(controlsResult.error);
        storesBox.innerHTML = `<div class="admin-empty">매장 점령 상태를 불러오지 못했습니다.</div>`;
        storesNav?.classList.add("hidden");
        setText("#gameOpsStoreCount", "0");
      }else{
        const rows = Array.isArray(controlsResult.data) ? controlsResult.data : [];
        const total = rows.length;
        setText("#gameOpsStoreCount", total);

        const totalPages = Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE));
        gameOpsStorePage = Math.min(Math.max(1, gameOpsStorePage), totalPages);
        const startIndex = (gameOpsStorePage - 1) * ADMIN_PAGE_SIZE;
        const pageRows = rows.slice(startIndex, startIndex + ADMIN_PAGE_SIZE);

        storesBox.innerHTML = pageRows.map(row => {
          const boss = row.boss_user_id
            ? [row.boss_nickname || "보스", row.organization_name].filter(Boolean).join(" · ")
            : "미점령";
          const protection = row.protected_until && new Date(row.protected_until).getTime() > Date.now()
            ? `보호 ${formatRemaining(row.protected_until)}`
            : row.boss_user_id ? "도전 가능" : "점령 가능";
          return `
            <article class="gameops-store-row">
              <div class="gameops-store-copy">
                <strong>${escapeHtml(row.store_name || "매장")}</strong>
                <p>${escapeHtml([row.city,row.district].filter(Boolean).join(" "))}</p>
              </div>
              <div class="gameops-store-status">
                <strong>${escapeHtml(boss)}</strong>
                <span>${escapeHtml(protection)}${row.boss_user_id ? ` · 방어력 ${Number(row.boss_defense || 0)} · Lv ${Number(row.boss_level || 1)}` : ""}</span>
              </div>
              <div class="gameops-store-action">
                ${row.boss_user_id ? `<button class="text-btn danger-text" data-release-boss="${escapeAttr(row.store_id)}" data-store-name="${escapeAttr(row.store_name || "매장")}" type="button">보스 해제</button>` : ""}
              </div>
            </article>
          `;
        }).join("") || `<div class="admin-empty">등록된 매장이 없습니다.</div>`;

        $$('[data-release-boss]').forEach(btn => btn.onclick = () => releaseStoreBoss(btn));

        renderPagination(storesNav, gameOpsStorePage, total, ADMIN_PAGE_SIZE, next => {
          gameOpsStorePage = next;
          loadGameOps();
          storesBox.scrollIntoView({ block:"start", behavior:"auto" });
        });
      }
    }

    if(orgsBox){
      if(orgsResult.error){
        console.warn(orgsResult.error);
        orgsBox.innerHTML = `<div class="admin-empty">크루 현황을 불러오지 못했습니다.</div>`;
        orgsNav?.classList.add("hidden");
        setText("#gameOpsOrganizationCount", "0");
      }else{
        const rows = Array.isArray(orgsResult.data) ? orgsResult.data : [];
        const total = rows.length;
        setText("#gameOpsOrganizationCount", total);

        const totalPages = Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE));
        gameOpsOrganizationPage = Math.min(Math.max(1, gameOpsOrganizationPage), totalPages);
        const startIndex = (gameOpsOrganizationPage - 1) * ADMIN_PAGE_SIZE;
        const pageRows = rows.slice(startIndex, startIndex + ADMIN_PAGE_SIZE);

        orgsBox.innerHTML = pageRows.map(row => `
          <article class="gameops-org-row">
            <div class="gameops-org-copy">
              <strong>${escapeHtml(row.name || "크루")}</strong>
              <p>크루장 ${escapeHtml(row.leader_name || "—")}</p>
            </div>
            <div class="gameops-org-metric">
              <b>${Number(row.member_count || 0)}</b><span>멤버</span>
            </div>
            <div class="gameops-org-metric">
              <b>${Number(row.territory_count || 0)}</b><span>점령지</span>
            </div>
          </article>
        `).join("") || `<div class="admin-empty">크루가 없습니다.</div>`;

        renderPagination(orgsNav, gameOpsOrganizationPage, total, ADMIN_PAGE_SIZE, next => {
          gameOpsOrganizationPage = next;
          loadGameOps();
          orgsBox.scrollIntoView({ block:"start", behavior:"auto" });
        });
      }
    }
  }

  async function releaseStoreBoss(button){
    const storeId = button?.dataset?.releaseBoss;
    const storeName = button?.dataset?.storeName || "매장";
    if(!storeId) return;

    const typed = prompt(`${storeName}의 현재 Boss를 강제로 해제합니다.\n방문/XP/Store Bonus는 유지됩니다.\n계속하려면 RELEASE를 입력하세요.`);
    if(typed !== "RELEASE") return;

    button.disabled = true;

    try{
      const { data, error } = await adminRpc("biteboss_admin_release_store_boss", {
        p_store_id:storeId
      });
      if(error) throw error;
      if(!data?.ok) throw new Error(data?.error || "RELEASE_FAILED");

      await Promise.all([loadGameOps(), loadBosses(), loadDashboard()]);
    }catch(error){
      console.warn(error);
      alert(error?.message || "Boss 해제에 실패했습니다.");
    }finally{
      button.disabled = false;
    }
  }

  async function loadAssets(){
    if(!Object.keys(appConfig).length) await loadConfig();
    const url = String(appConfig.home_splash_image_url || "");
    const preview = $("#splashPreview");
    if(preview) preview.innerHTML = url ? `<img src="${escapeAttr(url)}" alt="Splash" />` : `<span>SPLASH</span>`;

    const defaultProfileUrl = String(appConfig.default_profile_image_url || "");
    const defaultProfilePreview = $("#defaultProfilePreview");
    if(defaultProfilePreview){
      defaultProfilePreview.innerHTML = defaultProfileUrl
        ? `<img src="${escapeAttr(defaultProfileUrl)}" alt="기본 프로필 이미지" />`
        : `<span>PROFILE</span>`;
    }

    const hookEnabled = String(appConfig.home_hook_enabled ?? "true").toLowerCase() !== "false";
    const hookText = String(appConfig.home_hook_text || "");
    const primary = String(appConfig.home_primary_cta || "QR 스캔하기");
    const secondary = String(appConfig.home_secondary_cta || "내 주변 보스 찾기");

    if($("#homeHookEnabled")) $("#homeHookEnabled").value = hookEnabled ? "true" : "false";
    if($("#homeHookText")) $("#homeHookText").value = hookText;
    if($("#homePrimaryCta")) $("#homePrimaryCta").value = primary;
    if($("#homeSecondaryCta")) $("#homeSecondaryCta").value = secondary;

    if($("#firstCaptureGuideEnabled")) $("#firstCaptureGuideEnabled").value = String(appConfig.first_capture_guide_enabled ?? "true").toLowerCase() === "false" ? "false" : "true";
    if($("#firstCaptureGuideIcon")) $("#firstCaptureGuideIcon").value = String(appConfig.first_capture_guide_icon ?? "💡");
    if($("#firstCaptureGuideTitle")) $("#firstCaptureGuideTitle").value = String(appConfig.first_capture_guide_title ?? "첫 점령 가이드");
    if($("#firstCaptureGuideBody")) $("#firstCaptureGuideBody").value = String(appConfig.first_capture_guide_body ?? "가까운 미점령 매장부터 시작해 보세요.");
    if($("#firstCaptureGuideLinkUrl")) $("#firstCaptureGuideLinkUrl").value = String(appConfig.first_capture_guide_link_url ?? "");
    if(!newsAdminPosts.length) await loadNewsAdmin({render:false});
    const savedPostId=String(appConfig.first_capture_guide_post_id ?? "").trim();
    const savedMode=String(appConfig.first_capture_guide_link_mode ?? (savedPostId ? "internal" : (appConfig.first_capture_guide_link_url ? "external" : "none"))).trim();
    if($("#firstCaptureGuideLinkMode")) $("#firstCaptureGuideLinkMode").value=["none","internal","external"].includes(savedMode)?savedMode:"none";
    hydrateNoticePostOptions(savedPostId);
    syncFirstCaptureGuideLinkFields();

    const copyPreview = $("#homeCopyPreview");
    if(copyPreview){
      copyPreview.innerHTML = `
        <span>HOME PREVIEW</span>
        <strong>${hookEnabled && hookText ? escapeHtml(hookText) : "훅 문구 숨김"}</strong>
        <p>${escapeHtml(primary)} · ${escapeHtml(secondary)}</p>
      `;
    }
  }

  async function saveSplash(event){
    event.preventDefault();
    const formEl = event.currentTarget;
    const submit = formEl?.querySelector('button[type="submit"]');
    if(submit?.disabled) return;
    const status = $("#splashStatus");
    const file = $("#splashFile")?.files?.[0];
    if(!file) return;
    if(submit) submit.disabled = true;
    if(status) status.textContent = "업로드 중…";

    try{
      const blob = await imageFileToJpegBlob(file, 1440, 2560, 0.88);
      const path = "public/home-splash.jpg";
      const upload = await adminSb.storage.from("biteboss-assets").upload(path, blob, { upsert:true, contentType:"image/jpeg", cacheControl:"3600" });
      if(upload.error) throw upload.error;
      const { data } = adminSb.storage.from("biteboss-assets").getPublicUrl(path);
      const url = `${data.publicUrl}?v=${Date.now()}`;
      await secureAdminConfigUpsert({ key:"home_splash_image_url", value:url });
      appConfig.home_splash_image_url = url;
      await loadAssets();
      if(status) status.textContent = "저장되었습니다.";
    }catch(error){
      console.warn(error);
      if(status) status.textContent = "저장에 실패했습니다.";
    }finally{
      if(submit) submit.disabled = false;
    }
  }


  async function saveDefaultProfileImage(event){
    event.preventDefault();
    const formEl = event.currentTarget;
    const submit = formEl?.querySelector('button[type="submit"]');
    if(submit?.disabled) return;

    const status = $("#defaultProfileStatus");
    const file = $("#defaultProfileFile")?.files?.[0];
    if(!file) return;
    if(submit) submit.disabled = true;
    if(status) status.textContent = "업로드 중…";

    try{
      const blob = await imageFileToJpegBlob(file, 720, 720, 0.9);
      const version = Date.now();
      const path = `public/default-profile-${version}.jpg`;
      const upload = await adminSb.storage.from("biteboss-assets").upload(path, blob, {
        upsert:false,
        contentType:"image/jpeg",
        cacheControl:"31536000"
      });
      if(upload.error) throw upload.error;

      const { data } = adminSb.storage.from("biteboss-assets").getPublicUrl(path);
      const url = String(data?.publicUrl || "").trim();
      if(!url) throw new Error("DEFAULT_PROFILE_PUBLIC_URL_MISSING");

      // Preload before publishing the config so clients never switch to an uncached asset mid-render.
      await new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = resolve;
        image.onerror = () => reject(new Error("DEFAULT_PROFILE_PRELOAD_FAILED"));
        image.src = url;
      });

      await secureAdminConfigUpsert({ key:"default_profile_image_url", value:url });

      appConfig.default_profile_image_url = url;
      await loadAssets();
      formEl.reset();
      if(status) status.textContent = "저장되었습니다.";
    }catch(error){
      console.warn(error);
      if(status) status.textContent = "저장에 실패했습니다.";
    }finally{
      if(submit) submit.disabled = false;
    }
  }


  async function saveHomeCopy(event){
    event.preventDefault();
    const status = $("#homeCopyStatus");
    const button = event.currentTarget?.querySelector('button[type="submit"]');
    const hookEnabled = $("#homeHookEnabled")?.value !== "false";
    const hookText = String($("#homeHookText")?.value || "").trim().slice(0,48);
    const primary = String($("#homePrimaryCta")?.value || "").trim().slice(0,24);
    const secondary = String($("#homeSecondaryCta")?.value || "").trim().slice(0,24);

    if(!primary || !secondary){
      if(status) status.textContent = "버튼 문구는 비워둘 수 없습니다.";
      return;
    }

    if(button) button.disabled = true;
    if(status) status.textContent = "저장 중…";

    const now = new Date().toISOString();
    const rows = [
      { key:"home_hook_enabled", value:hookEnabled, updated_by:session.user.id, updated_at:now },
      { key:"home_hook_text", value:hookText, updated_by:session.user.id, updated_at:now },
      { key:"home_primary_cta", value:primary, updated_by:session.user.id, updated_at:now },
      { key:"home_secondary_cta", value:secondary, updated_by:session.user.id, updated_at:now }
    ];

    try{
      await secureAdminConfigUpsert(rows);
      rows.forEach(row => { appConfig[row.key] = row.value; });
      await loadAssets();
      if(status) status.textContent = "저장되었습니다.";
    }catch(error){
      console.warn(error);
      if(status) status.textContent = "저장에 실패했습니다.";
    }finally{
      if(button) button.disabled = false;
    }
  }



  const NEWS_CATEGORIES = new Set(["NOTICE","EVENT","UPDATE","PEOPLE"]);

  function newsPosts(){
    return newsAdminPosts.map(item=>({
      id:String(item?.id || "").trim(),
      slug:String(item?.slug || "").trim(),
      category:NEWS_CATEGORIES.has(String(item?.category || "").toUpperCase()) ? String(item.category).toUpperCase() : "NOTICE",
      title:String(item?.title || "").trim(),
      summary:String(item?.summary || "").trim(),
      image_url:String(item?.image_url || "").trim(),
      body:String(item?.body || ""),
      published:item?.published !== false,
      pinned:item?.pinned === true,
      created_at:String(item?.created_at || ""),
      updated_at:String(item?.updated_at || "")
    })).filter(item=>item.id && item.title);
  }

  function sortedNewsPosts(){
    return newsPosts().sort((a,b)=>Number(b.pinned)-Number(a.pinned) || Date.parse(b.updated_at || b.created_at || 0)-Date.parse(a.updated_at || a.created_at || 0));
  }

  async function loadNewsAdmin({render=true}={}){
    const {data,error}=await adminRpc("biteboss_admin_news_list_v8260",{});
    if(error){ console.warn(error); if(render) setStatusText($("#newsStatus"),"소식을 불러오지 못했습니다."); return; }
    newsAdminPosts=Array.isArray(data) ? data : (Array.isArray(data?.posts) ? data.posts : []);
    if(render) renderNewsAdmin();
    else hydrateNoticePostOptions(String(appConfig.first_capture_guide_post_id || ""));
  }

  function hydrateNoticePostOptions(selectedId=""){
    const select=$("#firstCaptureGuidePostId");
    if(!select) return;
    const posts=sortedNewsPosts().filter(post=>post.published);
    select.innerHTML=`<option value="">게시글을 선택하세요</option>${posts.map(post=>`<option value="${escapeAttr(post.id)}">${escapeHtml(post.category)} · ${escapeHtml(post.title)}</option>`).join("")}`;
    if(selectedId && posts.some(post=>post.id===selectedId)) select.value=selectedId;
  }

  function syncFirstCaptureGuideLinkFields(){
    const mode=String($("#firstCaptureGuideLinkMode")?.value || "none");
    $("#firstCaptureGuidePostField")?.classList.toggle("hidden",mode!=="internal");
    $("#firstCaptureGuideUrlField")?.classList.toggle("hidden",mode!=="external");
  }

  function renderNewsAdmin(){
    const list=$("#newsAdminList");
    if(!list) return;
    const posts=sortedNewsPosts();
    list.innerHTML=posts.length ? posts.map(post=>`
      <article class="admin-news-row" data-news-id="${escapeAttr(post.id)}">
        <div class="admin-news-copy"><span>${escapeHtml(post.category)}${post.pinned ? " · PIN" : ""}${post.published ? "" : " · 비공개"}</span><strong>${escapeHtml(post.title)}</strong>${post.summary ? `<p>${escapeHtml(post.summary)}</p>` : ""}</div>
        <button class="text-btn" type="button" data-news-edit="${escapeAttr(post.id)}">수정</button>
      </article>`).join("") : `<div class="admin-empty">등록된 게시글이 없습니다.</div>`;
    list.querySelectorAll("[data-news-edit]").forEach(button=>button.addEventListener("click",()=>editNewsPost(button.dataset.newsEdit)));
    hydrateNoticePostOptions(String(appConfig.first_capture_guide_post_id || ""));
  }

  function resetNewsForm(){
    if($("#newsPostId")) $("#newsPostId").value="";
    if($("#newsCategory")) $("#newsCategory").value="NOTICE";
    if($("#newsPublished")) $("#newsPublished").value="true";
    if($("#newsPinned")) $("#newsPinned").value="false";
    if($("#newsTitle")) $("#newsTitle").value="";
    if($("#newsPublicUrl")) $("#newsPublicUrl").value="";
    if($("#newsSummary")) $("#newsSummary").value="";
    if($("#newsImageUrl")) $("#newsImageUrl").value="";
    if($("#newsBody")) $("#newsBody").value="";
    setText("#newsEditorTitle","새 글 작성");
    $("#newsDeleteBtn")?.classList.add("hidden");
    setStatusText($("#newsStatus"),"");
  }

  function editNewsPost(id){
    const post=newsPosts().find(item=>item.id===String(id || ""));
    if(!post) return;
    if($("#newsPostId")) $("#newsPostId").value=post.id;
    if($("#newsCategory")) $("#newsCategory").value=post.category;
    if($("#newsPublished")) $("#newsPublished").value=String(post.published);
    if($("#newsPinned")) $("#newsPinned").value=String(post.pinned);
    if($("#newsTitle")) $("#newsTitle").value=post.title;
    if($("#newsPublicUrl")) $("#newsPublicUrl").value=post.slug ? `${location.origin}/news/${encodeURIComponent(post.slug)}` : "";
    if($("#newsSummary")) $("#newsSummary").value=post.summary;
    if($("#newsImageUrl")) $("#newsImageUrl").value=post.image_url;
    if($("#newsBody")) $("#newsBody").value=post.body;
    setText("#newsEditorTitle","게시글 수정");
    $("#newsDeleteBtn")?.classList.remove("hidden");
    $("#newsForm")?.scrollIntoView?.({behavior:"smooth",block:"start"});
  }

  async function copyNewsPublicUrl(){
    const value=String($("#newsPublicUrl")?.value || "").trim();
    if(!value){ setStatusText($("#newsStatus"),"게시글을 먼저 저장해 주세요."); return; }
    try{ await navigator.clipboard.writeText(value); setStatusText($("#newsStatus"),"고유주소를 복사했습니다."); }
    catch{ setStatusText($("#newsStatus"),"주소를 복사하지 못했습니다."); }
  }

  async function saveNewsPost(event){
    event.preventDefault();
    const status=$("#newsStatus");
    const button=event.currentTarget?.querySelector('button[type="submit"]');
    const currentId=String($("#newsPostId")?.value || "").trim();
    const category=String($("#newsCategory")?.value || "NOTICE").toUpperCase();
    const title=String($("#newsTitle")?.value || "").trim().slice(0,100);
    const summary=String($("#newsSummary")?.value || "").trim().slice(0,180);
    const imageUrl=String($("#newsImageUrl")?.value || "").trim().slice(0,500);
    const body=String($("#newsBody")?.value || "").trim().slice(0,12000);
    if(!title || !body){ setStatusText(status,"제목과 본문을 입력해 주세요."); return; }
    if(imageUrl){
      try{ const u=new URL(imageUrl); if(!["http:","https:"].includes(u.protocol)) throw 0; }
      catch{ setStatusText(status,"대표 이미지는 http:// 또는 https:// 주소로 입력해 주세요."); return; }
    }
    if(button) button.disabled=true;
    setStatusText(status,"저장 중…");
    try{
      const {data,error}=await adminRpc("biteboss_admin_news_upsert_v8265",{p_post:{
        id:currentId || null,
        category:NEWS_CATEGORIES.has(category) ? category : "NOTICE",
        title,summary,image_url:imageUrl,body,
        published:$("#newsPublished")?.value !== "false",
        pinned:$("#newsPinned")?.value === "true"
      }});
      if(error) throw error;
      const id=String(data?.id || data?.post?.id || currentId || "");
      await loadNewsAdmin();
      if(id) editNewsPost(id);
      setStatusText(status,"저장되었습니다.");
    }catch(error){ console.warn(error); setStatusText(status,"저장에 실패했습니다."); }
    finally{ if(button) button.disabled=false; }
  }

  async function deleteNewsPost(){
    const id=String($("#newsPostId")?.value || "").trim();
    if(!id) return;
    const post=newsPosts().find(item=>item.id===id);
    if(!post || !confirm(`\"${post.title}\" 게시글을 삭제할까요?`)) return;
    setStatusText($("#newsStatus"),"삭제 중…");
    try{
      const {error}=await adminRpc("biteboss_admin_news_delete_v8260",{p_id:id});
      if(error) throw error;
      if(String(appConfig.first_capture_guide_post_id || "")===id){
        const rows=[{key:"first_capture_guide_post_id",value:""},{key:"first_capture_guide_link_mode",value:"none"}];
        await secureAdminConfigUpsert(rows);
        appConfig.first_capture_guide_post_id="";
        appConfig.first_capture_guide_link_mode="none";
      }
      resetNewsForm(); await loadNewsAdmin(); await loadAssets();
      setStatusText($("#newsStatus"),"삭제되었습니다.");
    }catch(error){ console.warn(error); setStatusText($("#newsStatus"),"삭제에 실패했습니다."); }
  }

  async function saveFirstCaptureGuide(event){
    event.preventDefault();
    const status=$("#firstCaptureGuideStatus");
    const button=event.currentTarget?.querySelector('button[type="submit"]');
    const enabled=$("#firstCaptureGuideEnabled")?.value !== "false";
    const icon=String($("#firstCaptureGuideIcon")?.value ?? "").trim().slice(0,8);
    const title=String($("#firstCaptureGuideTitle")?.value ?? "").trim().slice(0,40);
    const body=String($("#firstCaptureGuideBody")?.value ?? "").trim().slice(0,100);
    const linkMode=String($("#firstCaptureGuideLinkMode")?.value || "none");
    const postId=linkMode === "internal" ? String($("#firstCaptureGuidePostId")?.value || "").trim() : "";
    const linkUrl=linkMode === "external" ? String($("#firstCaptureGuideLinkUrl")?.value ?? "").trim().slice(0,500) : "";

    if(!title){
      if(status) status.textContent="제목은 비워둘 수 없습니다.";
      return;
    }

    if(linkMode === "internal" && !newsPosts().some(post=>post.id===postId && post.published)){
      if(status) status.textContent="연결할 공개 게시글을 선택해 주세요.";
      return;
    }
    if(linkUrl){
      try{
        const parsed=new URL(linkUrl);
        if(!["http:","https:"].includes(parsed.protocol)) throw new Error("INVALID_NOTICE_URL");
      }catch{
        if(status) status.textContent="링크는 http:// 또는 https:// 주소로 입력해 주세요.";
        return;
      }
    }

    if(button) button.disabled=true;
    if(status) status.textContent="저장 중…";

    const now=new Date().toISOString();
    const rows=[
      { key:"first_capture_guide_enabled", value:enabled, updated_by:session.user.id, updated_at:now },
      { key:"first_capture_guide_icon", value:icon, updated_by:session.user.id, updated_at:now },
      { key:"first_capture_guide_title", value:title, updated_by:session.user.id, updated_at:now },
      { key:"first_capture_guide_body", value:body, updated_by:session.user.id, updated_at:now },
      { key:"first_capture_guide_link_mode", value:linkMode, updated_by:session.user.id, updated_at:now },
      { key:"first_capture_guide_post_id", value:postId, updated_by:session.user.id, updated_at:now },
      { key:"first_capture_guide_link_url", value:linkUrl, updated_by:session.user.id, updated_at:now }
    ];

    try{
      await secureAdminConfigUpsert(rows);
      rows.forEach(row=>{ appConfig[row.key]=row.value; });
      if(status) status.textContent="저장되었습니다.";
    }catch(error){
      console.warn(error);
      if(status) status.textContent="저장에 실패했습니다.";
    }finally{
      if(button) button.disabled=false;
    }
  }


  async function openStoreEditor(storeId){
    if(!storeId) return;
    await loadConfig();
    editingStoreId = storeId;
    editingStoreBundle = null;
    const editor = $("#adminStoreEditor");
    editor?.classList.remove("hidden");
    editor?.setAttribute("aria-hidden", "false");
    document.body.classList.add("admin-editor-open");
    $("#adminStoreEditorLoading")?.classList.remove("hidden");
    $("#adminStoreEditorBody")?.classList.add("hidden");
    resetAdminMenuForm();
    resetAdminOfferForm();

    try{
      const [{ data, error }, videoResult, seoResult, planResult, socialResult] = await Promise.all([
        adminRpc("biteboss_admin_store_detail", { p_store_id:storeId }),
        adminRpc("biteboss_admin_store_video", { p_store_id:storeId }),
        adminRpc("biteboss_store_seo_settings", { p_store_id:storeId }),
        Promise.resolve({data:storePlanMap.get(String(storeId)) || {plan:"partner"},error:null}),
        adminSb.from("biteboss_stores").select("website_url,instagram_url,youtube_url,tiktok_url,naver_blog_url").eq("id",storeId).single()
      ]);
      if(error) throw error;
      if(!data?.ok) throw new Error(data?.error || "STORE_LOAD_FAILED");
      editingStoreBundle = { ...data, store:{...(data.store || {}), ...(socialResult?.error ? {} : (socialResult?.data || {}))}, video:videoResult.error ? null : (videoResult.data || null), seo:seoResult?.error ? null : (seoResult?.data || null), plan:planResult?.error ? null : (planResult?.data || {plan:"partner"}) };
      renderAdminStoreEditor();
    }catch(error){
      console.error(error);
      setText("#adminStoreEditorLoading", `불러오기 실패 · ${error?.message || "알 수 없는 오류"}`);
    }
  }

  function closeStoreEditor(){
    editingStoreId = null;
    editingStoreBundle = null;
    $("#adminStoreEditor")?.classList.add("hidden");
    $("#adminStoreEditor")?.setAttribute("aria-hidden", "true");
    document.body.classList.remove("admin-editor-open");
  }

  const STORE_DAY_KEYS = ["mon","tue","wed","thu","fri","sat","sun"];

  function parseStoreHours(value){
    const raw = String(value || "").trim();
    const [timePart = "", ...metaParts] = raw.split("|").map(part => part.trim());
    const match = timePart.match(/^(\d{2}:\d{2})\s*-\s*(\d{2}:\d{2})$/);
    const meta = Object.fromEntries(metaParts.map(part => {
      const index = part.indexOf("=");
      return index > 0 ? [part.slice(0,index).trim(), part.slice(index+1).trim()] : ["", ""];
    }).filter(([key]) => key));
    const breakMatch = String(meta.break || "").match(/^(\d{2}:\d{2})-(\d{2}:\d{2})$/);
    return {
      open:match ? match[1] : "",
      close:match ? match[2] : "",
      breakStart:breakMatch ? breakMatch[1] : "",
      breakEnd:breakMatch ? breakMatch[2] : "",
      open24:meta.open24 === "1",
      closedDays:String(meta.closed || "").split(",").filter(day => STORE_DAY_KEYS.includes(day))
    };
  }

  function composeStoreHours(form){
    const open24 = String(form.get("open_24h") || "") === "1";
    const open = String(form.get("hours_open") || "").trim();
    const close = String(form.get("hours_close") || "").trim();
    const breakStart = String(form.get("break_start") || "").trim();
    const breakEnd = String(form.get("break_end") || "").trim();
    const closedDays = form.getAll("closed_days").map(String).filter(day => STORE_DAY_KEYS.includes(day));
    const timePart = open24 ? "00:00 - 00:00" : (open && close ? `${open} - ${close}` : "");
    if(!timePart && !closedDays.length && !(breakStart && breakEnd)) return "";
    return [
      timePart,
      `open24=${open24 ? "1" : "0"}`,
      `closed=${closedDays.join(",")}`,
      breakStart && breakEnd ? `break=${breakStart}-${breakEnd}` : ""
    ].filter(Boolean).join("|");
  }

  function applyStoreHoursForm(form, value){
    const hours = parseStoreHours(value);
    if(form.elements.hours_open) form.elements.hours_open.value = hours.open;
    if(form.elements.hours_close) form.elements.hours_close.value = hours.close;
    if(form.elements.break_start) form.elements.break_start.value = hours.breakStart;
    if(form.elements.break_end) form.elements.break_end.value = hours.breakEnd;
    if(form.elements.hours) form.elements.hours.value = value || "";
    const open24 = form.elements.open_24h;
    if(open24) open24.checked = hours.open24;
    form.querySelectorAll('input[name="closed_days"]').forEach(input => {
      input.checked = hours.closedDays.includes(input.value);
    });
    const disabled = hours.open24;
    if(form.elements.hours_open) form.elements.hours_open.disabled = disabled;
    if(form.elements.hours_close) form.elements.hours_close.disabled = disabled;
  }

  function bindStoreHoursControls(form){
    const open24 = form?.elements?.open_24h;
    if(!open24 || open24.dataset.bound === "1") return;
    open24.dataset.bound = "1";
    open24.addEventListener("change", () => {
      if(form.elements.hours_open) form.elements.hours_open.disabled = open24.checked;
      if(form.elements.hours_close) form.elements.hours_close.disabled = open24.checked;
    });
  }

  function renderAdminStoreEditor(){
    const bundle = editingStoreBundle || {};
    const store = bundle.store || {};
    setText("#adminStoreEditorTitle", store.name || "매장 수정");
    setText("#adminStoreEditorMeta", `${partnershipLabel(store.partnership_status)} · ${store.partnership_status === "partnered" ? "QR 점령" : "GPS 자동점령"}`);

    const form = $("#adminStoreEditForm");
    if(form){
      ["name","brand_name","category","status","city","district","address","latitude","longitude","phone","website_url","instagram_url","youtube_url","tiktok_url","naver_blog_url","notice"].forEach(key => {
        if(form.elements[key]) form.elements[key].value = store[key] ?? "";
      });
      applyStoreHoursForm(form, store.hours);
      bindStoreHoursControls(form);
    }

    renderAdminPhotos(bundle.photos || []);
    renderAdminVideo(bundle.video || null);
    renderAdminStoreSeo(bundle.seo || null);
    renderAdminStorePlan(store,bundle.plan || null);
    renderAdminMenu(bundle.menu || []);
    renderAdminOffers(bundle.offers || []);
    renderAdminPartnerPromotion(store);
    $("#adminStoreEditorLoading")?.classList.add("hidden");
    $("#adminStoreEditorBody")?.classList.remove("hidden");
  }

  async function syncOpenStoreSharedSettings({force=false}={}){
    if(!editingStoreId || !adminSb || sharedStoreSettingsBusy || document.hidden) return;
    sharedStoreSettingsBusy=true;
    try{
      const [videoResult,seoResult]=await Promise.all([
        adminRpc("biteboss_admin_store_video",{p_store_id:editingStoreId}),
        adminRpc("biteboss_store_seo_settings",{p_store_id:editingStoreId})
      ]);
      if(!seoResult.error){
        const seo=seoResult.data || {};
        const sig=JSON.stringify([String(seo.custom_slug || ""),String(seo.slug || "")]);
        if(force || sig!==adminSeoSyncSignature) renderAdminStoreSeo(seo);
      }
      if(!videoResult.error){
        const rows=Array.isArray(videoResult.data?.videos) ? videoResult.data.videos : [];
        const sig=JSON.stringify(rows.map(item=>[String(item?.id || ""),String(item?.video_url || ""),Number(item?.sort_order || 0)]));
        if(force || sig!==adminVideoSyncSignature) renderAdminVideo({videos:rows});
      }
    }catch(error){ console.warn("BiteBoss admin shared settings sync:",error); }
    finally{ sharedStoreSettingsBusy=false; }
  }

  function startOpenStoreSharedSettingsSync(){
    if(sharedStoreSettingsTimer!==null) return;
    sharedStoreSettingsTimer=window.setInterval(()=>void syncOpenStoreSharedSettings(),3000);
    const refresh=()=>{ if(!document.hidden) void syncOpenStoreSharedSettings({force:true}); };
    document.addEventListener("visibilitychange",refresh);
    window.addEventListener("focus",refresh);
  }

  async function reloadStoreEditor(){
    if(!editingStoreId) return;
    await loadConfig();
    const [{ data, error }, videoResult, seoResult, planResult, socialResult] = await Promise.all([
      adminRpc("biteboss_admin_store_detail", { p_store_id:editingStoreId }),
      adminRpc("biteboss_admin_store_video", { p_store_id:editingStoreId }),
      adminRpc("biteboss_store_seo_settings", { p_store_id:editingStoreId }),
      Promise.resolve({data:storePlanMap.get(String(editingStoreId)) || {plan:"partner"},error:null}),
        adminSb.from("biteboss_stores").select("website_url,instagram_url,youtube_url,tiktok_url,naver_blog_url").eq("id",editingStoreId).single()
    ]);
    if(error) throw error;
    if(!data?.ok) throw new Error(data?.error || "STORE_LOAD_FAILED");
    editingStoreBundle = { ...data, store:{...(data.store || {}), ...(socialResult?.error ? {} : (socialResult?.data || {}))}, video:videoResult.error ? null : (videoResult.data || null), seo:seoResult?.error ? null : (seoResult?.data || null), plan:planResult?.error ? null : (planResult?.data || {plan:"partner"}) };
    renderAdminStoreEditor();
  }

  function renderAdminStorePlan(store={},planData=null){
    const section=$("#adminStorePlanSection");
    if(!section) return;
    const partnered=String(store.partnership_status || "")==="partnered";
    section.classList.toggle("hidden",!partnered);
    if(!partnered) return;
    const plan=String(storePlanMap.get(String(store.id))?.plan || planData?.plan || "partner");
    const select=$("#adminStorePlanSelect");
    if(select) select.value=plan==="pro" ? "pro" : "partner";
    const expires=$("#adminStorePlanExpires");
    if(expires) expires.value=planData?.expires_at ? String(planData.expires_at).slice(0,10) : "";
    const badge=$("#adminStorePlanBadge");
    if(badge){
      badge.textContent=plan==="pro" ? "PRO" : "PARTNER";
      badge.classList.toggle("is-pro",plan==="pro");
    }
    const promo=$("#adminPartnerPromotionSection");
    promo?.classList.toggle("is-plan-locked",plan!=="pro");
    const bannerSelect=$("#adminPartnerBannerEnabled");
    if(bannerSelect) bannerSelect.disabled=plan!=="pro";
  }

  async function saveAdminStorePlan(event){
    event.preventDefault();
    if(!editingStoreId) return;
    const plan=String($("#adminStorePlanSelect")?.value || "partner");
    const expiresRaw=String($("#adminStorePlanExpires")?.value || "").trim();
    const expires=plan==="pro" && expiresRaw ? `${expiresRaw}T23:59:59+09:00` : null;
    const status=$("#adminStorePlanStatus");
    const button=event.currentTarget.querySelector('button[type="submit"]');
    if(button) button.disabled=true;
    setStatusText(status,"저장 중…");
    try{
      const existing=storePlanMap.get(String(editingStoreId)) || editingStoreBundle?.plan || {};
      const now=new Date().toISOString();
      const plans=normalizedStorePlans().filter(item=>item.store_id!==String(editingStoreId));
      plans.push({
        store_id:String(editingStoreId),
        plan,
        started_at:String(existing.plan || "partner")===plan && existing.started_at ? existing.started_at : now,
        expires_at:plan==="pro" ? expires : null
      });
      await secureAdminConfigUpsert({ key:"store_plans", value:plans });
      appConfig.store_plans=plans;
      hydrateStorePlanMap();
      if(editingStoreBundle){
        editingStoreBundle.plan=storePlanMap.get(String(editingStoreId)) || {
          store_id:String(editingStoreId),
          plan,
          started_at:now,
          expires_at:plan==="pro" ? expires : null
        };
      }

      // Downgrading immediately removes paid banner exposure.
      if(plan!=="pro"){
        const banners=normalizedPartnerBanners().filter(item=>item.id!==String(editingStoreId));
        await secureAdminConfigUpsert({ key:"partner_banners", value:banners });
        await loadConfig();
      }
      setStatusText(status,plan==="pro" ? "PRO 플랜이 적용되었습니다." : "PARTNER 플랜이 적용되었습니다.");
      await Promise.all([reloadStoreEditor(),loadStores()]);
    }catch(error){
      setStatusText(status,`저장 실패 · ${error?.message || "다시 시도하세요."}`);
    }finally{ if(button) button.disabled=false; }
  }

  function normalizedPartnerBanners(){
    return Array.isArray(appConfig.partner_banners)
      ? appConfig.partner_banners.map(item => ({ ...item, id:String(item?.id || "") })).filter(item => item.id)
      : [];
  }

  function bannerConfigForStore(store = {}){
    return normalizedPartnerBanners().find(item => item.id === String(store.id)) || null;
  }

  function normalizedPartnerBannerIds(){
    return normalizedPartnerBanners().map(item => item.id);
  }

  function bannerOperationalState(store = {}, enabled = false){
    if(!enabled) return { label:"배너 OFF", className:"" };
    if(String(store.status || "active") !== "active") return { label:"배너 ON · 매장 비활성", className:"is-warning" };
    return { label:"배너 ON · 노출 가능", className:"is-on" };
  }


  function renderAdminPartnerPromotion(store = {}){
    const section = $("#adminPartnerPromotionSection");
    if(!section) return;
    section.classList.remove("hidden");

    const plan=String(storePlanMap.get(String(store.id))?.plan || editingStoreBundle?.plan?.plan || "partner");
    const isPro=plan==="pro";
    const banner = isPro ? bannerConfigForStore(store) : null;
    const enabled = Boolean(banner);
    section.classList.toggle("is-plan-locked",!isPro);
    $("#adminPartnerBannerEnabled").value = enabled ? "true" : "false";
    $("#adminPartnerBannerEnabled").disabled = !isPro;
    $("#adminPartnerBannerDistance").value = String(banner?.distance_km ?? 5);
    $("#adminPartnerBannerPriority").value = String(banner?.priority ?? 3);
    const defaultCopy = String(store.partnership_status || "") === "partnered"
      ? "이 매장에서 BiteBoss 혜택을 확인해 보세요."
      : "지금 이 매장을 확인해 보세요.";
    $("#adminPartnerBannerCopy").placeholder = defaultCopy;
    $("#adminPartnerBannerCopy").value = String(banner?.copy || "");
    const operational = bannerOperationalState(store, enabled);
    const operationalEl = $("#adminPartnerBannerOperationalState");
    if(operationalEl){
      operationalEl.className = `admin-banner-operational wide ${operational.className}`.trim();
      operationalEl.textContent = operational.label;
    }
    setStatusText($("#adminPartnerPromotionStatus"), "");
  }

  async function saveAdminPartnerPromotion(event){
    event.preventDefault();
    if(!editingStoreId || !editingStoreBundle?.store) return;
    const store = editingStoreBundle.store;
    const plan=String(storePlanMap.get(String(store.id))?.plan || editingStoreBundle?.plan?.plan || "partner");
    if(plan!=="pro"){
      setStatusText($("#adminPartnerPromotionStatus"),"추천 배너는 PRO 플랜에서 사용할 수 있습니다.");
      return;
    }
    const enabled = $("#adminPartnerBannerEnabled")?.value === "true";
    const copyText = String($("#adminPartnerBannerCopy")?.value || "").trim();
    const distanceValue = String($("#adminPartnerBannerDistance")?.value || "5");
    const priorityValue = Math.min(5, Math.max(1, Number($("#adminPartnerBannerPriority")?.value || 3)));
    const id = String(editingStoreId);
    const banners = normalizedPartnerBanners().filter(item => item.id !== id);

    if(enabled){
      banners.push({
        id,
        name:String(store.name || ""),
        photo_url:String(store.photo_url || ""),
        status:String(store.status || "active"),
        latitude:Number(store.latitude),
        longitude:Number(store.longitude),
        partnership_status:String(store.partnership_status || ""),
        copy:copyText,
        distance_km:distanceValue === "all" ? "all" : Number(distanceValue || 5),
        priority:priorityValue
      });
    }

    const submit = event.currentTarget.querySelector('button[type="submit"]');
    if(submit) submit.disabled = true;
    setStatusText($("#adminPartnerPromotionStatus"), "저장 중…");
    try{
      await secureAdminConfigUpsert({ key:"partner_banners", value:banners });
      await loadConfig();
      renderAdminPartnerPromotion(store);
      renderStores();
      setStatusText($("#adminPartnerPromotionStatus"), enabled ? "배너 설정을 저장했습니다." : "배너 노출을 껐습니다.");
    }catch(error){
      setStatusText($("#adminPartnerPromotionStatus"), error?.message || "저장하지 못했습니다.");
    }finally{
      if(submit) submit.disabled = false;
    }
  }

  async function saveAdminStoreInfo(event){
    event.preventDefault();
    if(!editingStoreId) return;
    const formEl = event.currentTarget;
    const form = new FormData(formEl);
    const lat = Number(form.get("latitude"));
    const lng = Number(form.get("longitude"));
    const status = $("#adminStoreEditStatus");
    if(!String(form.get("name") || "").trim()) return setStatusText(status, "매장명을 입력하세요.");
    if(!Number.isFinite(lat) || !Number.isFinite(lng) || lat < -90 || lat > 90 || lng < -180 || lng > 180) return setStatusText(status, "위도/경도를 확인하세요.");
    const breakStart = String(form.get("break_start") || "").trim();
    const breakEnd = String(form.get("break_end") || "").trim();
    if(Boolean(breakStart) !== Boolean(breakEnd)) return setStatusText(status, "브레이크 타임 시작과 종료를 모두 입력하세요.");
    if(breakStart && breakEnd && breakStart === breakEnd) return setStatusText(status, "브레이크 타임 시작과 종료 시간을 다르게 입력하세요.");
    const submit = formEl.querySelector('button[type="submit"]');
    if(submit) submit.disabled = true;
    setStatusText(status, "저장 중…");
    try{
      const { data, error } = await adminRpc("biteboss_admin_update_store", {
        p_store_id:editingStoreId,
        p_name:String(form.get("name") || "").trim(),
        p_brand_name:String(form.get("brand_name") || "").trim(),
        p_category:String(form.get("category") || "restaurant"),
        p_city:String(form.get("city") || "").trim(),
        p_district:String(form.get("district") || "").trim(),
        p_address:String(form.get("address") || "").trim(),
        p_latitude:lat,
        p_longitude:lng,
        p_hours:composeStoreHours(form),
        p_phone:String(form.get("phone") || "").trim(),
        p_notice:String(form.get("notice") || "").trim(),
        p_status:String(form.get("status") || "active")
      });
      if(error) throw error;
      if(!data?.ok) throw new Error(data?.error || "STORE_UPDATE_FAILED");

      const socialUpdate = await adminSb.from("biteboss_stores").update({
        website_url:String(form.get("website_url") || "").trim() || null,
        instagram_url:String(form.get("instagram_url") || "").trim() || null,
        youtube_url:String(form.get("youtube_url") || "").trim() || null,
        tiktok_url:String(form.get("tiktok_url") || "").trim() || null,
        naver_blog_url:String(form.get("naver_blog_url") || "").trim() || null
      }).eq("id",editingStoreId);
      if(socialUpdate.error) throw socialUpdate.error;

      const existingBanner = bannerConfigForStore({ id:editingStoreId });
      if(existingBanner){
        const banners = normalizedPartnerBanners().filter(item => item.id !== String(editingStoreId));
        banners.push({
          ...existingBanner,
          name:String(form.get("name") || "").trim(),
          status:String(form.get("status") || "active"),
          latitude:lat,
          longitude:lng
        });
        await secureAdminConfigUpsert({ key:"partner_banners", value:banners });
        await loadConfig();
      }

      setStatusText(status, "저장되었습니다.");
      await Promise.all([reloadStoreEditor(), loadStores(), loadDashboard()]);
    }catch(error){
      setStatusText(status, `저장 실패 · ${error?.message || "다시 시도하세요."}`);
    }finally{
      if(submit) submit.disabled = false;
    }
  }

  function adminStorePublicUrl(slug){
    if(!editingStoreId || !slug) return "";
    return `${location.origin}/store/${encodeURIComponent(slug)}`;
  }
  function renderAdminStoreSeo(seo){
    const input=$("#adminStoreSlug");
    const serverCustom=String(seo?.custom_slug || "");
    adminSeoSyncSignature=JSON.stringify([serverCustom,String(seo?.slug || "")]);
    if(input && document.activeElement !== input) input.value=serverCustom;
    const url=adminStorePublicUrl(String(seo?.slug || ""));
    if($("#adminStoreUrlPreview")) $("#adminStoreUrlPreview").textContent=url;
  }
  async function saveAdminStoreSlug(){
    if(!editingStoreId) return;
    const slug=String($("#adminStoreSlug")?.value || "").trim().toLowerCase();
    const status=$("#adminStoreSlugStatus");
    const button=$("#adminStoreSlugSave");
    if(button){ button.disabled=true; button.classList.remove("is-saved"); button.textContent="저장 중…"; }
    setStatusText(status,"저장 중…");
    try{
      const {data,error}=await adminRpc("biteboss_admin_set_store_seo_slug",{p_store_id:editingStoreId,p_slug:slug});
      if(error || !data?.ok){
        const code=data?.error || "";
        const message=code==="SLUG_TAKEN"?"이미 사용 중인 주소입니다.":code==="INVALID_SLUG"?"영문 소문자, 숫자, 하이픈만 입력하세요.":error?.message || code || "저장 실패";
        if(button){ button.classList.add("is-error"); button.textContent="저장 실패"; }
        setStatusText(status,message);
        return;
      }
      if(button){ button.classList.remove("is-error"); button.classList.add("is-saved"); button.textContent="저장 완료 ✓"; }
      setStatusText(status,slug ? "고유주소가 저장되었습니다." : "자동 주소로 설정되었습니다.");
      await reloadStoreEditor();
      setTimeout(()=>{
        if(!button) return;
        button.classList.remove("is-saved");
        button.textContent="주소 저장";
        button.disabled=false;
      },1400);
    }catch(error){
      if(button){ button.classList.add("is-error"); button.textContent="저장 실패"; }
      setStatusText(status,error?.message || "저장하지 못했습니다.");
    }finally{
      if(button && !button.classList.contains("is-saved")){
        button.disabled=false;
        setTimeout(()=>{ button.classList.remove("is-error"); button.textContent="주소 저장"; },1600);
      }
    }
  }

    async function copyAdminStoreUrl(){
    const url=String($("#adminStoreUrlPreview")?.textContent || "").trim();
    if(!url) return;
    await navigator.clipboard.writeText(url);
    setStatusText($("#adminStoreSlugStatus"),"주소를 복사했습니다.");
  }


  function youtubeAdminMeta(value){
    const raw=String(value || "").trim();
    if(!raw) return null;
    try{
      const url=new URL(raw);
      const host=url.hostname.replace(/^www\./,"").toLowerCase();
      let id="";
      if(host==="youtu.be") id=url.pathname.split("/").filter(Boolean)[0] || "";
      else if(["youtube.com","m.youtube.com","music.youtube.com"].includes(host)){
        const parts=url.pathname.split("/").filter(Boolean);
        if(parts[0]==="shorts" || parts[0]==="embed") id=parts[1] || "";
        else id=url.searchParams.get("v") || "";
      }
      if(!/^[A-Za-z0-9_-]{6,20}$/.test(id)) return null;
      return {id,thumbnail:`https://i.ytimg.com/vi/${id}/hqdefault.jpg`,watch:`https://www.youtube.com/watch?v=${id}`};
    }catch{return null;}
  }

  function renderAdminVideo(video){
    const rows=Array.isArray(video?.videos) ? video.videos : [];
    adminVideoSyncSignature=JSON.stringify(rows.map(item=>[String(item?.id || ""),String(item?.video_url || ""),Number(item?.sort_order || 0)]));
    const input=$("#adminVideoUrl");
    if(input) input.value="";
    const box=$("#adminVideoList");
    if(!box) return;
    box.innerHTML=rows.map((item,index)=>{
      const meta=youtubeAdminMeta(item.video_url);
      return `<article class="admin-media-row store-video-thumb-row">
        ${meta ? `<a class="store-video-thumb" href="${escapeAttr(meta.watch)}" target="_blank" rel="noopener noreferrer" aria-label="영상 ${index+1} YouTube에서 보기"><img src="${escapeAttr(meta.thumbnail)}" alt="" loading="lazy" decoding="async"/></a>` : ""}
        <div class="store-video-thumb-copy"><strong>영상 ${index+1}</strong><p>${escapeHtml(item.video_url || "")}</p></div>
        <button class="text-btn danger-text" data-admin-delete-video="${escapeAttr(item.id)}" type="button">삭제</button>
      </article>`;
    }).join("") || `<div class="admin-empty">등록된 영상이 없습니다.</div>`;
    $$("[data-admin-delete-video]").forEach(button=>button.onclick=()=>deleteAdminStoreVideo(button.dataset.adminDeleteVideo));
  }

  async function saveAdminStoreVideo(event){
    event.preventDefault();
    if(!editingStoreId) return;
    const url=String($("#adminVideoUrl")?.value || "").trim();
    const status=$("#adminVideoStatus");
    if(!url) return setStatusText(status,"YouTube 주소를 입력하세요.");
    setStatusText(status,"추가 중…");
    const {data,error}=await adminRpc("biteboss_admin_add_store_video",{p_store_id:editingStoreId,p_video_url:url});
    if(error || !data?.ok) return setStatusText(status,`추가 실패 · ${error?.message || data?.error || "다시 시도하세요."}`);
    if($("#adminVideoUrl")) $("#adminVideoUrl").value="";
    setStatusText(status,"영상이 추가되었습니다.");
    await reloadStoreEditor();
  }

  async function deleteAdminStoreVideo(videoId){
    if(!editingStoreId || !videoId) return;
    const status=$("#adminVideoStatus");
    setStatusText(status,"삭제 중…");
    const {data,error}=await adminRpc("biteboss_admin_delete_store_video",{p_store_id:editingStoreId,p_video_id:videoId});
    if(error || !data?.ok) return setStatusText(status,`삭제 실패 · ${error?.message || data?.error || "다시 시도하세요."}`);
    setStatusText(status,"영상이 삭제되었습니다.");
    await reloadStoreEditor();
  }

  function renderAdminPhotos(rows){
    const box = $("#adminPhotoList");
    if(!box) return;
    box.innerHTML = rows.map(photo => `
      <article class="admin-media-row">
        <img src="${escapeAttr(photo.image_url)}" alt="" loading="lazy" decoding="async" />
        <div><strong>${escapeHtml(photo.caption || (photo.is_cover ? "대표 사진" : "매장 사진"))}</strong><p>${photo.is_cover ? "대표 이미지" : "추가 이미지"}</p></div>
        <button class="text-btn danger-text" data-admin-delete-photo="${escapeAttr(photo.id)}" data-storage-path="${escapeAttr(photo.storage_path || "")}" type="button">삭제</button>
      </article>
    `).join("") || `<div class="admin-empty">등록된 사진이 없습니다.</div>`;

    $$('[data-admin-delete-photo]').forEach(btn => btn.onclick = async () => {
      if(!confirm("이 사진을 삭제할까요?")) return;
      const path = btn.dataset.storagePath || "";
      try{
        if(path){
          const removed = await adminSb.storage.from("biteboss-store-images").remove([path]);
          if(removed.error) throw removed.error;
        }
        const { data, error } = await adminRpc("biteboss_admin_delete_photo", { p_photo_id:btn.dataset.adminDeletePhoto });
        if(error) throw error;
        if(!data?.ok) throw new Error(data?.error || "PHOTO_DELETE_FAILED");
        await Promise.all([reloadStoreEditor(), loadStores()]);
      }catch(error){ alert(error?.message || "사진 삭제 실패"); }
    });
  }

  async function addAdminStorePhoto(event){
    event.preventDefault();
    const form = event.currentTarget;
    if(!editingStoreId) return;
    const file = $("#adminPhotoFile")?.files?.[0];
    const inputUrl = String($("#adminPhotoUrl")?.value || "").trim();
    const isCover = Boolean($("#adminPhotoCover")?.checked);
    const status = $("#adminPhotoStatus");
    if(!file && !inputUrl) return setStatusText(status, "사진 파일 또는 URL을 입력하세요.");
    setStatusText(status, "사진 저장 중…");
    let imageUrl = inputUrl;
    let storagePath = "";
    try{
      if(file){
        const blob = await imageFileToJpegBlob(file, 1600, 1600, 0.88);
        storagePath = `${editingStoreId}/${crypto.randomUUID()}.jpg`;
        const upload = await adminSb.storage.from("biteboss-store-images").upload(storagePath, blob, { contentType:"image/jpeg", cacheControl:"86400" });
        if(upload.error) throw upload.error;
        imageUrl = adminSb.storage.from("biteboss-store-images").getPublicUrl(storagePath).data.publicUrl;
      }
      const { data, error } = await adminRpc("biteboss_admin_add_photo", {
        p_store_id:editingStoreId,
        p_image_url:canonicalImageUrl,
        p_storage_path:canonicalStoragePath || null,
        p_caption:"",
        p_is_cover:isCover
      });
      if(error) throw error;
      if(!data?.ok) throw new Error(data?.error || "PHOTO_ADD_FAILED");
      form?.reset();
      setStatusText(status, "사진이 등록되었습니다.");
      await Promise.all([reloadStoreEditor(), loadStores()]);
    }catch(error){
      if(storagePath){ try{ await adminSb.storage.from("biteboss-store-images").remove([storagePath]); }catch{} }
      setStatusText(status, `사진 등록 실패 · ${error?.message || "다시 시도하세요."}`);
    }
  }

  function renderAdminMenu(rows){
    const box = $("#adminMenuList");
    if(!box) return;
    box.innerHTML = rows.map(item => `
      <article class="admin-data-row">
        <div><strong>${escapeHtml(item.name)}</strong><p>${item.price != null ? `${Number(item.price).toLocaleString("ko-KR")}원` : "가격 미정"}${item.is_signature ? " · Signature" : ""}${item.description ? ` · ${escapeHtml(item.description)}` : ""}</p></div>
        <div class="admin-data-actions"><button class="text-btn" data-edit-menu="${escapeAttr(item.id)}" type="button">수정</button><button class="text-btn danger-text" data-delete-menu="${escapeAttr(item.id)}" type="button">삭제</button></div>
      </article>
    `).join("") || `<div class="admin-empty">등록된 메뉴가 없습니다.</div>`;
    $$('[data-edit-menu]').forEach(btn => btn.onclick = () => editAdminMenu(btn.dataset.editMenu));
    $$('[data-delete-menu]').forEach(btn => btn.onclick = () => deleteAdminMenu(btn.dataset.deleteMenu));
  }

  function editAdminMenu(id){
    const item = (editingStoreBundle?.menu || []).find(x => String(x.id) === String(id));
    if(!item) return;
    $("#adminMenuId").value = item.id;
    $("#adminMenuName").value = item.name || "";
    $("#adminMenuPrice").value = item.price ?? "";
    $("#adminMenuDescription").value = item.description || "";
    $("#adminMenuSignature").value = String(Boolean(item.is_signature));
    $("#adminMenuCancel")?.classList.remove("hidden");
  }

  function resetAdminMenuForm(){
    $("#adminMenuForm")?.reset();
    if($("#adminMenuId")) $("#adminMenuId").value = "";
    $("#adminMenuCancel")?.classList.add("hidden");
  }

  async function saveAdminMenu(event){
    event.preventDefault();
    if(!editingStoreId) return;
    const id = $("#adminMenuId")?.value || null;
    const name = String($("#adminMenuName")?.value || "").trim();
    if(!name) return;
    const { data, error } = await adminRpc("biteboss_admin_upsert_menu", {
      p_store_id:editingStoreId,
      p_item_id:id || null,
      p_name:name,
      p_price:$("#adminMenuPrice")?.value ? Number($("#adminMenuPrice").value) : null,
      p_description:String($("#adminMenuDescription")?.value || "").trim(),
      p_is_signature:String($("#adminMenuSignature")?.value) === "true"
    });
    if(error || !data?.ok) return alert(error?.message || data?.error || "메뉴 저장 실패");
    resetAdminMenuForm();
    await reloadStoreEditor();
  }

  async function deleteAdminMenu(id){
    if(!confirm("이 메뉴를 삭제할까요?")) return;
    const { data, error } = await adminRpc("biteboss_admin_delete_menu", { p_item_id:id });
    if(error || !data?.ok) return alert(error?.message || data?.error || "메뉴 삭제 실패");
    await reloadStoreEditor();
  }

  function renderAdminOffers(rows){
    const box = $("#adminOfferList");
    if(!box) return;
    box.innerHTML = rows.map(item => `
      <article class="admin-data-row">
        <div><strong>${escapeHtml(item.title)}</strong><p>${escapeHtml(item.status || "draft")} · ${escapeHtml((item.minimum_role || (item.boss_only ? "boss" : "visitor")) === "boss" ? "Boss only" : (item.minimum_role === "crew" ? "Crew + Boss" : "Everyone"))}${item.description ? ` · ${escapeHtml(item.description)}` : ""}</p></div>
        <div class="admin-data-actions"><button class="text-btn" data-edit-offer="${escapeAttr(item.id)}" type="button">수정</button><button class="text-btn danger-text" data-delete-offer="${escapeAttr(item.id)}" type="button">삭제</button></div>
      </article>
    `).join("") || `<div class="admin-empty">등록된 혜택이 없습니다.</div>`;
    $$('[data-edit-offer]').forEach(btn => btn.onclick = () => editAdminOffer(btn.dataset.editOffer));
    $$('[data-delete-offer]').forEach(btn => btn.onclick = () => deleteAdminOffer(btn.dataset.deleteOffer));
  }

  function editAdminOffer(id){
    const item = (editingStoreBundle?.offers || []).find(x => String(x.id) === String(id));
    if(!item) return;
    $("#adminOfferId").value = item.id;
    $("#adminOfferTitle").value = item.title || "";
    $("#adminOfferDescription").value = item.description || "";
    $("#adminOfferStatus").value = item.status || "draft";
    $("#adminOfferMinimumRole").value = item.minimum_role || (item.boss_only ? "boss" : "visitor");
    $("#adminOfferCancel")?.classList.remove("hidden");
  }

  function resetAdminOfferForm(){
    $("#adminOfferForm")?.reset();
    if($("#adminOfferId")) $("#adminOfferId").value = "";
    $("#adminOfferCancel")?.classList.add("hidden");
  }

  async function saveAdminOffer(event){
    event.preventDefault();
    if(!editingStoreId) return;
    const title = String($("#adminOfferTitle")?.value || "").trim();
    if(!title) return;
    const { data, error } = await adminRpc("biteboss_admin_upsert_offer_v2", {
      p_store_id:editingStoreId,
      p_offer_id:$("#adminOfferId")?.value || null,
      p_title:title,
      p_description:String($("#adminOfferDescription")?.value || "").trim(),
      p_status:String($("#adminOfferStatus")?.value || "draft"),
      p_minimum_role:String($("#adminOfferMinimumRole")?.value || "visitor")
    });
    if(error || !data?.ok) return alert(error?.message || data?.error || "혜택 저장 실패");
    resetAdminOfferForm();
    await reloadStoreEditor();
  }

  async function deleteAdminOffer(id){
    if(!confirm("이 혜택을 삭제할까요?")) return;
    const { data, error } = await adminRpc("biteboss_admin_delete_offer", { p_offer_id:id });
    if(error || !data?.ok) return alert(error?.message || data?.error || "혜택 삭제 실패");
    await reloadStoreEditor();
  }

  async function deleteStoreById(storeId){
    const store = stores.find(item => String(item.id) === String(storeId));
    if(!store) return;
    const typed = prompt(`매장과 연결된 메뉴, 사진, 혜택, QR, 점령/방문 기록이 함께 삭제됩니다.\n계속하려면 매장명 “${store.name}”을 정확히 입력하세요.`);
    if(typed !== store.name) return;
    try{
      const detail = await adminRpc("biteboss_admin_store_detail", { p_store_id:storeId });
      if(detail.error) throw detail.error;
      const paths = (detail.data?.photos || []).map(x => x.storage_path).filter(Boolean);
      if(paths.length){
        const removed = await adminSb.storage.from("biteboss-store-images").remove(paths);
        if(removed.error) throw removed.error;
      }
      const { data, error } = await adminRpc("biteboss_admin_delete_store", { p_store_id:storeId });
      if(error) throw error;
      if(!data?.ok) throw new Error(data?.error || "STORE_DELETE_FAILED");
      activationCodes.delete(String(storeId));
      if(editingStoreId === storeId) closeStoreEditor();
      await Promise.all([loadStores(), loadDashboard(), loadBosses()]);
    }catch(error){
      alert(error?.message || "매장 삭제에 실패했습니다.");
    }
  }

  async function deleteCurrentStore(){
    if(editingStoreId) await deleteStoreById(editingStoreId);
  }

  async function runAdminReset(mode, button){
    const phrases = { claims:"RESET CLAIMS", checkins:"RESET VISITS", game:"RESET GAME", factory:"RESET BITEBOSS" };
    const labels = { claims:"점령 기록", checkins:"방문 기록", game:"게임 기록 전체", factory:"BiteBoss 운영 데이터 전체" };
    const phrase = phrases[mode];
    if(!phrase) return;
    const typed = prompt(`${labels[mode]}를 초기화합니다. 되돌릴 수 없습니다.\n계속하려면 ${phrase} 를 입력하세요.`);
    if(typed !== phrase) return;
    const status = $("#maintenanceStatus");
    if(button) button.disabled = true;
    setStatusText(status, "초기화 중…");
    try{
      if(mode === "factory"){
        const { data:adPaths, error:adPathsError } = await adminRpc("biteboss_admin_ad_storage_paths");
        if(adPathsError) throw adPathsError;
        const adAssetPaths = (adPaths || []).map(x => x.storage_path).filter(Boolean);
        for(let i=0;i<adAssetPaths.length;i+=100){
          const removedAds = await adminSb.storage.from("biteboss-assets").remove(adAssetPaths.slice(i, i+100));
          if(removedAds.error) throw removedAds.error;
        }
        const { data:allPhotos, error:pathsError } = await adminRpc("biteboss_admin_storage_paths");
        if(pathsError) throw pathsError;
        const paths = (allPhotos || []).map(x => x.storage_path).filter(Boolean);
        for(let i=0;i<paths.length;i+=100){
          const removed = await adminSb.storage.from("biteboss-store-images").remove(paths.slice(i, i+100));
          if(removed.error) throw removed.error;
        }
      }
      const { data, error } = await adminRpc("biteboss_admin_reset", { p_mode:mode });
      if(error) throw error;
      if(!data?.ok) throw new Error(data?.error || "RESET_FAILED");
      setStatusText(status, `완료 · ${labels[mode]} 초기화`);
      closeStoreEditor();
      await refreshAll();
    }catch(error){
      setStatusText(status, `실패 · ${error?.message || "초기화하지 못했습니다."}`);
    }finally{
      if(button) button.disabled = false;
    }
  }

  function setStatusText(node, text){ if(node) node.textContent = String(text || ""); }

  async function secureAdminConfigUpsert(rows){
    const payload=Array.isArray(rows)?rows:[rows];
    const normalized=payload.map(row=>({ key:String(row?.key||""), value:row?.value }));
    const {data,error}=await adminRpc("biteboss_admin_config_upsert_v8217",{p_rows:normalized});
    if(error) throw error;
    if(!data?.ok) throw new Error(data?.error||"CONFIG_SAVE_FAILED");
    return data;
  }


  function adPlacementConfig(){
    const raw = appConfig.ad_campaign_settings;
    return raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  }

  function adCreativeConfig(){
    const raw = appConfig.ad_creatives;
    return raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {};
  }

  function adCampaignConfig(){
    const raw = appConfig.ad_campaigns;
    return Array.isArray(raw) ? raw : null;
  }

  function normalizeAdCampaignRow(item = {}){
    const id=String(item?.id || item?.campaign_id || "").trim();
    if(!id) return null;
    return {
      id,
      campaign_id:id,
      advertiser_name:String(item?.advertiser_name || "").trim(),
      campaign_name:String(item?.campaign_name || "").trim(),
      image_url:String(item?.image_url || "").trim(),
      storage_path:String(item?.storage_path || "").trim(),
      click_url:String(item?.click_url || "").trim(),
      starts_at:item?.starts_at || null,
      ends_at:item?.ends_at || null,
      is_active:item?.is_active !== false,
      sort_order:Number(item?.sort_order || 0)
    };
  }

  function storedCampaignCreatives(campaignId){
    const rows=adCreativeConfig()[String(campaignId)];
    return Array.isArray(rows) ? rows.filter(item=>item && item.id) : [];
  }

  function primaryCreativeForCampaign(item){
    if(!item?.id) return null;
    const setting=campaignSetting(item.id);
    const usesStoreListFallback=setting.primary_image_kind === "store_list";
    return {
      id:`primary:${item.id}`, campaign_id:String(item.id), name:"기본 소재", is_primary:true,
      image_url:usesStoreListFallback ? "" : String(item.image_url || ""),
      storage_path:usesStoreListFallback ? "" : String(item.storage_path || ""),
      store_list_image_url:setting.store_list_image_url, store_list_storage_path:setting.store_list_storage_path,
      click_url:String(item.click_url || ""), is_active:true, sort_order:0
    };
  }

  function campaignCreatives(item){
    const primary=primaryCreativeForCampaign(item);
    return [primary,...storedCampaignCreatives(item?.id)].filter(Boolean);
  }

  async function saveAdCreativeConfig(next){
    await secureAdminConfigUpsert({ key:"ad_creatives", value:next });
    appConfig.ad_creatives=next;
  }

  function campaignSetting(id){
    const value = adPlacementConfig()[String(id)] || {};
    return {
      placement:["home","takeover","store_list","both","all"].includes(String(value.placement)) ? String(value.placement) : "both",
      target_type:String(value.target_type) === "region" ? "region" : "all",
      target_region:String(value.target_region || "").trim(),
      target_store_id:String(value.target_store_id || "").trim(),
      store_list_image_url:String(value.store_list_image_url || "").trim(),
      store_list_storage_path:String(value.store_list_storage_path || "").trim(),
      primary_image_kind:String(value.primary_image_kind || "") === "store_list" ? "store_list" : "home"
    };
  }

  function syncAdTargetRegionField(){
    const isRegion = String($("#adTargetType")?.value || "all") === "region";
    $("#adTargetRegionField")?.classList.toggle("hidden", !isRegion);
    if($("#adTargetRegion")) $("#adTargetRegion").required = isRegion;
  }

  async function saveAdCampaignSetting(campaignId){
    const id=String(campaignId || "");
    if(!id) return;
    const settings={ ...adPlacementConfig() };
    settings[id]={
      placement:String($("#adPlacement")?.value || "both"),
      target_type:String($("#adTargetType")?.value || "all"),
      target_region:String($("#adTargetRegion")?.value || "").trim(),
      target_store_id:String($("#adTargetStore")?.value || "").trim(),
      store_list_image_url:String($("#adCampaignForm")?.dataset.storeListImageUrl || "").trim(),
      store_list_storage_path:String($("#adCampaignForm")?.dataset.storeListStoragePath || "").trim(),
      primary_image_kind:String($("#adCampaignForm")?.dataset.primaryImageKind || "home") === "store_list" ? "store_list" : "home"
    };
    await secureAdminConfigUpsert({ key:"ad_campaign_settings", value:settings });
    appConfig.ad_campaign_settings=settings;
  }

  function buildPublicAdCampaigns(campaignRows=adCampaigns){
    return (Array.isArray(campaignRows)?campaignRows:[]).flatMap(item=>{
      const setting=campaignSetting(item.id);
      return campaignCreatives(item).filter(creative=>creative.is_active !== false && (creative.image_url || creative.store_list_image_url)).map(creative=>({
        id:item.id, campaign_id:item.id, creative_id:creative.id, creative_name:creative.name || "광고 소재",
        advertiser_name:item.advertiser_name || "", campaign_name:item.campaign_name || "",
        image_url:creative.image_url || "", click_url:creative.click_url || "", starts_at:item.starts_at || null,
        ends_at:item.ends_at || null, is_active:Boolean(item.is_active), sort_order:Number(item.sort_order || 0),
        creative_sort_order:Number(creative.sort_order || 0), placement:setting.placement, target_type:setting.target_type,
        target_region:setting.target_region, target_store_id:setting.target_store_id,
        store_list_image_url:creative.store_list_image_url || ""
      }));
    });
  }

  async function syncPublicAdCampaigns(campaignRows=adCampaigns){
    const publicRows=buildPublicAdCampaigns(campaignRows);
    await secureAdminConfigUpsert({ key:"ad_public_campaigns", value:publicRows });
    appConfig.ad_public_campaigns=publicRows;
    return publicRows;
  }

  async function refreshAdCampaignRows(){
    const canonical=adCampaignConfig();
    if(canonical){
      adCampaigns=canonical.map(normalizeAdCampaignRow).filter(Boolean);
      return adCampaigns;
    }

    // One-time migration from the legacy campaign RPC. Invalid/nameless rows are
    // intentionally excluded so failed historical saves cannot remain as ghost campaigns.
    const {data,error}=await adminRpc("biteboss_admin_list_campaigns_v8239");
    if(error) throw error;
    const legacy=(Array.isArray(data) ? data : Array.isArray(data?.campaigns) ? data.campaigns : [])
      .map(normalizeAdCampaignRow)
      .filter(item=>item && item.campaign_name && item.advertiser_name);
    adCampaigns=legacy;
    await secureAdminConfigUpsert({key:"ad_campaigns",value:legacy});
    appConfig.ad_campaigns=legacy;
    return adCampaigns;
  }

  const adAnalyticsCampaignMap = new Map();

  let adTargetStoreSearchTimer=0;
  let adTargetStoreSearchSeq=0;

  function adStoreLabel(store){
    const meta=[store?.brand_name,store?.district || store?.city,store?.address].filter(Boolean);
    return {name:String(store?.name || "매장"),meta:meta.join(" · ")};
  }

  function setAdTargetStore(store){
    const id=String(store?.id || "");
    if($("#adTargetStore")) $("#adTargetStore").value=id;
    if(!id){
      $("#adTargetStoreSelected")?.classList.add("hidden");
      $("#adTargetStoreSearchWrap")?.classList.remove("hidden");
      if($("#adTargetStoreSearch")) $("#adTargetStoreSearch").value="";
      $("#adTargetStoreResults")?.classList.add("hidden");
      return;
    }
    const label=adStoreLabel(store);
    setText("#adTargetStoreSelectedName",label.name);
    setText("#adTargetStoreSelectedMeta",label.meta || "매장 지정");
    $("#adTargetStoreSelected")?.classList.remove("hidden");
    $("#adTargetStoreSearchWrap")?.classList.add("hidden");
  }

  function populateAdTargetStores(){
    const id=String($("#adTargetStore")?.value || "");
    if(!id){setAdTargetStore(null);return;}
    const store=stores.find(row=>String(row.id)===id);
    if(store) setAdTargetStore(store);
  }

  async function searchAdTargetStores(keyword){
    const box=$("#adTargetStoreResults"); if(!box) return;
    const q=String(keyword || "").trim();
    if(q.length<2){box.innerHTML='<div class="admin-store-picker-hint">2자 이상 입력하세요.</div>';box.classList.remove("hidden");return;}
    const seq=++adTargetStoreSearchSeq;
    box.innerHTML='<div class="admin-store-picker-hint">검색 중…</div>';box.classList.remove("hidden");
    const safe=q.replace(/[,%()]/g," ").replace(/\s+/g," ").trim();
    const filter=`name.ilike.%${safe}%,brand_name.ilike.%${safe}%,district.ilike.%${safe}%,city.ilike.%${safe}%,address.ilike.%${safe}%`;
    const {data,error}=await adminSb.from("biteboss_stores").select("id,name,brand_name,city,district,address").or(filter).order("name",{ascending:true}).limit(12);
    if(seq!==adTargetStoreSearchSeq) return;
    if(error){console.warn("Ad target store search:",error);box.innerHTML='<div class="admin-store-picker-hint">검색하지 못했습니다.</div>';return;}
    const rows=Array.isArray(data)?data:[];
    box.innerHTML=rows.length?rows.map(store=>{const label=adStoreLabel(store);return `<button class="admin-store-picker-result" data-ad-target-store="${escapeAttr(store.id)}" type="button"><strong>${escapeHtml(label.name)}</strong><span>${escapeHtml(label.meta || "매장")}</span></button>`;}).join(""):'<div class="admin-store-picker-hint">검색 결과가 없습니다.</div>';
    $$("[data-ad-target-store]",box).forEach(btn=>btn.onclick=()=>{const store=rows.find(row=>String(row.id)===String(btn.dataset.adTargetStore));if(store)setAdTargetStore(store);});
  }

  async function loadAdAnalytics(){
    const chart=$("#adAnalyticsChart"); if(!chart) return;
    const days=Math.max(1,Number($("#adAnalyticsDays")?.value || 30));
    chart.innerHTML='<div class="analytics-loading">불러오는 중…</div>';
    const {data,error}=await adminRpc("biteboss_admin_ad_analytics_v8217",{p_days:days});
    if(error){
      console.warn("BiteBoss ad analytics:",error);
      chart.innerHTML='<div class="analytics-empty">광고 성과 데이터를 불러오지 못했습니다. 광고 분석 RPC와 데이터베이스 배포 상태를 확인하세요.</div>';
      return;
    }
    adAnalyticsOverallData=data || {};
    adAnalyticsCampaignMap.clear();
    (Array.isArray(adAnalyticsOverallData.campaigns)?adAnalyticsOverallData.campaigns:[]).forEach(row=>adAnalyticsCampaignMap.set(String(row.campaign_id),row));
    await loadAdCreativeAnalytics(days);
    renderAds();
    renderAdPerformanceCampaigns();
    renderAdPerformanceCreatives();
    if(selectedAdPerformanceCampaignId) await loadAdPerformanceDetail();
    else renderAdPerformanceData(adAnalyticsOverallData,{scope:"overall"});
  }

  async function loadAdCreativeAnalytics(days){
    adCreativeAnalyticsMap.clear();
    const {data,error}=await adminRpc("biteboss_admin_ad_creative_analytics_v8217",{p_days:Math.max(1,Number(days||30))});
    if(error){
      console.warn("BiteBoss creative analytics:",error);
      renderAdCreatives();
      return;
    }
    (Array.isArray(data?.creatives)?data.creatives:Array.isArray(data)?data:[]).forEach(row=>{
      const key=`${String(row.campaign_id||"")}:${String(row.creative_id||"")}`;
      adCreativeAnalyticsMap.set(key,row);
    });
    renderAdCreatives();
    renderAdPerformanceCreatives();
  }

  function adPerformanceScopeCopy(scope="overall"){
    const reset=$("#adPerformanceReset");
    if(scope==="creative"){
      const campaign=adCampaigns.find(item=>String(item.id)===String(selectedAdPerformanceCampaignId));
      const creative=campaignCreatives(campaign||{}).find(item=>String(item.id)===String(selectedAdPerformanceCreativeId));
      setText("#adPerformanceScopeTitle",creative?.name || "소재 성과");
      setText("#adPerformanceScopeDescription",`${campaign?.campaign_name || "캠페인"} · 선택한 광고 소재의 성과입니다.`);
      reset?.classList.remove("hidden");
      return;
    }
    if(scope==="campaign"){
      const campaign=adCampaigns.find(item=>String(item.id)===String(selectedAdPerformanceCampaignId));
      setText("#adPerformanceScopeTitle",campaign?.campaign_name || "캠페인 성과");
      setText("#adPerformanceScopeDescription",`${campaign?.advertiser_name || "광고주"} · 선택한 캠페인의 전체 소재 성과입니다.`);
      reset?.classList.remove("hidden");
      return;
    }
    setText("#adPerformanceScopeTitle","전체 성과");
    setText("#adPerformanceScopeDescription","선택한 기간에 집계된 모든 캠페인의 광고 성과입니다.");
    reset?.classList.add("hidden");
  }

  function renderAdPerformanceData(data={},options={}){
    const total=data.total || {};
    const impressions=Number(total.impressions||0), clicks=Number(total.clicks||0);
    const visits=Number(total.visits||0), captures=Number(total.captures||0);
    setText("#adKpiImpressions",impressions.toLocaleString("ko-KR"));
    setText("#adKpiClicks",clicks.toLocaleString("ko-KR"));
    setText("#adKpiCtr",`${impressions ? (clicks/impressions*100).toFixed(1) : "0.0"}%`);
    setText("#adKpiVisits",visits.toLocaleString("ko-KR"));
    setText("#adKpiCaptures",captures.toLocaleString("ko-KR"));
    adPerformanceScopeCopy(options.scope || "overall");

    const rows=Array.isArray(data.trend)?data.trend:[];
    const chart=$("#adAnalyticsChart");
    if(chart){
      if(!rows.length) chart.innerHTML='<div class="analytics-empty">선택한 기간의 광고 데이터가 없습니다.</div>';
      else{
        const max=Math.max(1,...rows.flatMap(row=>[Number(row.impressions||0),Number(row.clicks||0),Number(row.visits||0),Number(row.captures||0)]));
        chart.innerHTML=`<div class="admin-ad-chart-bars">${rows.map(row=>{
          const h=v=>Math.max(Number(v)>0?3:1,Math.round(Number(v||0)/max*100));
          return `<div class="admin-ad-chart-item" title="${escapeAttr(row.label||"")} · 노출 ${Number(row.impressions||0)} · 클릭 ${Number(row.clicks||0)} · 방문 ${Number(row.visits||0)} · 점령 ${Number(row.captures||0)}"><div class="admin-ad-chart-columns"><i style="height:${h(row.impressions)}%"></i><i style="height:${h(row.clicks)}%"></i><i style="height:${h(row.visits)}%"></i><i style="height:${h(row.captures)}%"></i></div><span>${escapeHtml(row.label||"")}</span></div>`;
        }).join("")}</div>`;
      }
    }
    const funnel=$("#adAnalyticsFunnel");
    if(funnel){
      const visitRate=clicks?visits/clicks*100:0;
      const captureRate=visits?captures/visits*100:0;
      funnel.innerHTML=`<div><span>노출</span><strong>${impressions.toLocaleString("ko-KR")}</strong><small>100%</small></div><div><span>클릭</span><strong>${clicks.toLocaleString("ko-KR")}</strong><small>${impressions?(clicks/impressions*100).toFixed(1):"0.0"}%</small></div><div><span>방문</span><strong>${visits.toLocaleString("ko-KR")}</strong><small>클릭 대비 ${visitRate.toFixed(1)}%</small></div><div><span>점령</span><strong>${captures.toLocaleString("ko-KR")}</strong><small>방문 대비 ${captureRate.toFixed(1)}%</small></div>`;
    }
  }

  async function loadAdPerformanceDetail(){
    const campaignId=String(selectedAdPerformanceCampaignId||"");
    if(!campaignId){
      renderAdPerformanceData(adAnalyticsOverallData || {},{scope:"overall"});
      return;
    }
    const creativeId=String(selectedAdPerformanceCreativeId||"");
    const requestId=++adPerformanceDetailRequest;
    const chart=$("#adAnalyticsChart");
    if(chart) chart.innerHTML='<div class="analytics-loading">불러오는 중…</div>';
    const days=Math.max(1,Number($("#adAnalyticsDays")?.value || 30));
    const {data,error}=await adminRpc("biteboss_admin_ad_performance_detail_v8243",{
      p_days:days,
      p_campaign_id:campaignId,
      p_creative_id:creativeId || null
    });
    if(requestId!==adPerformanceDetailRequest) return;
    if(error || data?.ok===false){
      console.warn("BiteBoss ad performance detail:",error || data);
      const fallback=creativeId ? creativeMetric(campaignId,creativeId) : (adAnalyticsCampaignMap.get(campaignId)||{});
      renderAdPerformanceData({total:fallback,trend:[]},{scope:creativeId?"creative":"campaign"});
      return;
    }
    renderAdPerformanceData(data || {},{scope:creativeId?"creative":"campaign"});
  }

  function resetAdPerformanceScope(){
    selectedAdPerformanceCampaignId="";
    selectedAdPerformanceCreativeId="";
    adPerformanceDetailRequest+=1;
    $("#adPerformanceCreativePanel")?.classList.add("hidden");
    renderAdPerformanceCampaigns();
    renderAdPerformanceCreatives();
    renderAdPerformanceData(adAnalyticsOverallData || {},{scope:"overall"});
  }

  async function loadAds(){
    if(!Object.keys(appConfig).length) await loadConfig();
    const box = $("#adCampaignList");
    if(!box) return;
    try{
      await refreshAdCampaignRows();
    }catch(error){
      console.warn(error);
      box.innerHTML = `<div class="admin-empty">광고 캠페인을 불러오지 못했습니다.</div>`;
      return;
    }
    populateAdTargetStores();
    try{ await syncPublicAdCampaigns(); }catch(error){ console.warn("Ad public config sync:", error); }
    renderAds();
    renderAdPerformanceCampaigns();
    await loadAdAnalytics();
    if(!$("#adCampaignId")?.value) ensureAdStartDefault();
  }

  function renderAds(){
    const box = $("#adCampaignList");
    if(!box) return;
    const now = Date.now();
    const query=String($("#adCampaignSearch")?.value||"").trim().toLowerCase();
    const visibleCampaigns=adCampaigns.filter(item=>!query || [item.campaign_name,item.advertiser_name].some(value=>String(value||"").toLowerCase().includes(query)));
    box.innerHTML = visibleCampaigns.map(item => {
      const start = item.starts_at ? new Date(item.starts_at).getTime() : 0;
      const end = item.ends_at ? new Date(item.ends_at).getTime() : Infinity;
      const live = item.is_active && start <= now && end > now;
      const creativeCount=campaignCreatives(item).filter(c=>c.is_active!==false && (c.image_url || c.store_list_image_url)).length;
      const setting = campaignSetting(item.id);
      const placementLabel = ({home:"홈", takeover:"점령 대기", store_list:"매장 목록", both:"홈 + 점령 대기", all:"전체 위치"})[setting.placement] || "홈 + 점령 대기";
      const targetLabel = setting.target_type === "region" && setting.target_region ? ` · ${setting.target_region}` : " · 전체";
      return `
        <article class="admin-ad-row ${String(selectedAdCampaignId)===String(item.id)?"is-selected":""}">
          ${item.image_url?`<img class="admin-ad-thumb" src="${escapeAttr(item.image_url)}" alt="" />`:`<div class="admin-ad-thumb admin-ad-placeholder">AD</div>`}
          <div class="admin-ad-copy">
            <div class="admin-ad-title"><strong>${escapeHtml(item.campaign_name || "이름 없는 캠페인")}</strong><span>${live ? "LIVE" : (item.is_active ? "SCHEDULED" : "OFF")}</span></div>
            <p>${escapeHtml(item.advertiser_name)} · ${creativeCount.toLocaleString("ko-KR")}개 소재 · ${escapeHtml(placementLabel + targetLabel)} · ${escapeHtml(formatAdPeriod(item.starts_at, item.ends_at))}</p>
          </div>
          <div class="admin-data-actions">
            <button class="text-btn" data-manage-ad-creatives="${escapeAttr(item.id)}" type="button">광고 소재</button>
            <button class="text-btn" data-edit-ad="${escapeAttr(item.id)}" type="button">캠페인 수정</button>
            <button class="text-btn danger-text" data-delete-ad="${escapeAttr(item.id)}" type="button">삭제</button>
          </div>
        </article>`;
    }).join("") || `<div class="admin-empty">${query?"검색 결과가 없습니다.":"등록된 광고 캠페인이 없습니다."}</div>`;

    $$('[data-manage-ad-creatives]').forEach(btn => btn.onclick = () => openAdCreativePanel(btn.dataset.manageAdCreatives));
    $$('[data-edit-ad]').forEach(btn => btn.onclick = () => editAdCampaign(btn.dataset.editAd));
    $$('[data-delete-ad]').forEach(btn => btn.onclick = () => deleteAdCampaign(btn.dataset.deleteAd));
  }

  function openAdCreativePanel(campaignId){
    selectedAdCampaignId=String(campaignId || "");
    const campaign=adCampaigns.find(item=>String(item.id)===selectedAdCampaignId);
    if(!campaign) return;
    $("#adCreativePanel")?.classList.remove("hidden");
    setText("#adCreativePanelDescription",`${campaign.campaign_name} · 실제 노출 광고 소재 관리`);
    resetAdCreativeForm();
    renderAds();
    renderAdCreatives();
    $("#adCreativePanel")?.scrollIntoView({behavior:"smooth",block:"start"});
  }

  function closeAdCreativePanel(){
    selectedAdCampaignId="";
    $("#adCreativePanel")?.classList.add("hidden");
    resetAdCreativeForm();
    renderAds();
  }

  function creativeMetric(campaignId, creativeId){
    const exact=adCreativeAnalyticsMap.get(`${String(campaignId)}:${String(creativeId)}`);
    if(exact) return exact;
    const hasCreativeRows=[...adCreativeAnalyticsMap.keys()].some(key=>key.startsWith(`${String(campaignId)}:`));
    if(!hasCreativeRows && String(creativeId)===`primary:${String(campaignId)}`){
      return adAnalyticsCampaignMap.get(String(campaignId)) || {};
    }
    return {};
  }

  function renderAdCreatives(){
    const box=$("#adCreativeList");
    if(!box || !selectedAdCampaignId) return;
    const campaign=adCampaigns.find(item=>String(item.id)===String(selectedAdCampaignId));
    if(!campaign){ closeAdCreativePanel(); return; }
    const rows=campaignCreatives(campaign);
    box.innerHTML=rows.map(creative=>{
      const image=creative.image_url || creative.store_list_image_url || "";
      return `<article class="admin-ad-row admin-ad-creative-row">
        ${image?`<img class="admin-ad-thumb" src="${escapeAttr(image)}" alt="" />`:`<div class="admin-ad-thumb admin-ad-placeholder">AD</div>`}
        <div class="admin-ad-copy">
          <div class="admin-ad-title"><strong>${escapeHtml(creative.name || "광고 소재")}</strong><span class="admin-ad-creative-badge ${creative.is_primary?"is-primary":""}">${creative.is_primary?"기본 소재":(creative.is_active===false?"OFF":"ACTIVE")}</span></div>
          <p>${creative.store_list_image_url?"홈 · 점령 대기 · 매장 목록":"홈 · 점령 대기"}${creative.click_url?" · 클릭 연결":""}</p>
        </div>
        <div class="admin-data-actions">
          ${creative.is_primary?`<button class="text-btn" data-edit-primary-creative="${escapeAttr(campaign.id)}" type="button">기본 소재 수정</button>`:`<button class="text-btn" data-edit-creative="${escapeAttr(creative.id)}" type="button">수정</button><button class="text-btn danger-text" data-delete-creative="${escapeAttr(creative.id)}" type="button">삭제</button>`}
        </div>
      </article>`;
    }).join("") || '<div class="admin-empty">등록된 광고 소재가 없습니다.</div>';
    $$('[data-edit-primary-creative]',box).forEach(btn=>btn.onclick=()=>editAdCampaign(btn.dataset.editPrimaryCreative));
    $$('[data-edit-creative]',box).forEach(btn=>btn.onclick=()=>editAdCreative(btn.dataset.editCreative));
    $$('[data-delete-creative]',box).forEach(btn=>btn.onclick=()=>deleteAdCreative(btn.dataset.deleteCreative));
  }


  function renderAdPerformanceCampaigns(){
    const box=$("#adPerformanceCampaignList");
    if(!box) return;
    const now=Date.now();
    const query=String($("#adPerformanceSearch")?.value||"").trim().toLowerCase();
    const visibleCampaigns=adCampaigns.filter(item=>!query || [item.campaign_name,item.advertiser_name].some(value=>String(value||"").toLowerCase().includes(query)));
    box.innerHTML=visibleCampaigns.map(item=>{
      const measured=adAnalyticsCampaignMap.get(String(item.id)) || {};
      const impressions=Number(measured.impressions ?? item.impressions ?? 0);
      const clicks=Number(measured.clicks ?? item.clicks ?? 0);
      const ctr=impressions ? (clicks/impressions*100).toFixed(1) : "0.0";
      const visits=Number(measured.visits||0), captures=Number(measured.captures||0);
      const start=item.starts_at?new Date(item.starts_at).getTime():0;
      const end=item.ends_at?new Date(item.ends_at).getTime():Infinity;
      const live=item.is_active && start<=now && end>now;
      return `<button class="admin-ad-row admin-ad-performance-row ${String(selectedAdPerformanceCampaignId)===String(item.id)?"is-selected":""}" data-ad-performance-campaign="${escapeAttr(item.id)}" type="button">
        ${item.image_url?`<img class="admin-ad-thumb" src="${escapeAttr(item.image_url)}" alt="" />`:`<span class="admin-ad-thumb admin-ad-placeholder">AD</span>`}
        <span class="admin-ad-copy">
          <span class="admin-ad-title"><strong>${escapeHtml(item.campaign_name || "이름 없는 캠페인")}</strong><span>${live?"LIVE":(item.is_active?"SCHEDULED":"OFF")}</span></span>
          <span class="admin-ad-performance-meta">${escapeHtml(item.advertiser_name || "광고주")} · ${escapeHtml(formatAdPeriod(item.starts_at,item.ends_at))}</span>
          <span class="admin-ad-stats"><span>${impressions.toLocaleString("ko-KR")} 노출</span><span>${clicks.toLocaleString("ko-KR")} 클릭</span><span>CTR ${ctr}%</span><span>${visits.toLocaleString("ko-KR")} 방문</span><span>${captures.toLocaleString("ko-KR")} 점령</span></span>
        </span>
      </button>`;
    }).join("") || `<div class="admin-empty">${query?"검색 결과가 없습니다.":"등록된 광고 캠페인이 없습니다."}</div>`;
    $$('[data-ad-performance-campaign]',box).forEach(btn=>btn.onclick=()=>openAdPerformanceCreativePanel(btn.dataset.adPerformanceCampaign));
  }


  function csvCell(value){
    const text=String(value??"");
    return /[",\n]/.test(text) ? `"${text.replace(/"/g,'""')}"` : text;
  }

  function downloadCsv(filename, rows){
    const csv=`\uFEFF${rows.map(row=>row.map(csvCell).join(",")).join("\n")}`;
    const blob=new Blob([csv],{type:"text/csv;charset=utf-8"});
    const url=URL.createObjectURL(blob);
    const link=document.createElement("a");
    link.href=url; link.download=filename; document.body.appendChild(link); link.click(); link.remove();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  }

  function exportAdPerformanceCsv(){
    const days=Math.max(1,Number($("#adAnalyticsDays")?.value||30));
    const query=String($("#adPerformanceSearch")?.value||"").trim().toLowerCase();
    const campaigns=adCampaigns.filter(item=>!query || [item.campaign_name,item.advertiser_name].some(value=>String(value||"").toLowerCase().includes(query)));
    const rows=[["기간(일)","캠페인","광고주","소재","노출","클릭","CTR(%)","방문","점령"]];
    campaigns.forEach(campaign=>{
      const creatives=campaignCreatives(campaign);
      if(creatives.length){
        creatives.forEach(creative=>{
          const metric=creativeMetric(campaign.id,creative.id);
          const impressions=Number(metric.impressions||0), clicks=Number(metric.clicks||0);
          rows.push([days,campaign.campaign_name||"",campaign.advertiser_name||"",creative.name||"광고 소재",impressions,clicks,impressions?(clicks/impressions*100).toFixed(1):"0.0",Number(metric.visits||0),Number(metric.captures||0)]);
        });
      }else{
        const metric=adAnalyticsCampaignMap.get(String(campaign.id))||{};
        const impressions=Number(metric.impressions||0), clicks=Number(metric.clicks||0);
        rows.push([days,campaign.campaign_name||"",campaign.advertiser_name||"","",impressions,clicks,impressions?(clicks/impressions*100).toFixed(1):"0.0",Number(metric.visits||0),Number(metric.captures||0)]);
      }
    });
    const stamp=new Date().toISOString().slice(0,10);
    downloadCsv(`biteboss-ad-performance-${days}d-${stamp}.csv`,rows);
  }

  function openAdPerformanceCreativePanel(campaignId){
    selectedAdPerformanceCampaignId=String(campaignId||"");
    selectedAdPerformanceCreativeId="";
    const campaign=adCampaigns.find(item=>String(item.id)===selectedAdPerformanceCampaignId);
    if(!campaign) return;
    $("#adPerformanceCreativePanel")?.classList.remove("hidden");
    setText("#adPerformanceCreativeDescription",`${campaign.campaign_name} · 소재를 선택하면 상단 성과가 해당 소재 기준으로 바뀝니다.`);
    renderAdPerformanceCampaigns();
    renderAdPerformanceCreatives();
    void loadAdPerformanceDetail();
    $("#admin-ad-performance")?.scrollIntoView({behavior:"smooth",block:"start"});
  }

  function closeAdPerformanceCreativePanel(){
    resetAdPerformanceScope();
  }

  function renderAdPerformanceCreatives(){
    const box=$("#adPerformanceCreativeList");
    if(!box || !selectedAdPerformanceCampaignId) return;
    const campaign=adCampaigns.find(item=>String(item.id)===selectedAdPerformanceCampaignId);
    if(!campaign){ closeAdPerformanceCreativePanel(); return; }
    const rows=campaignCreatives(campaign);
    box.innerHTML=rows.map(creative=>{
      const metric=creativeMetric(campaign.id,creative.id);
      const impressions=Number(metric.impressions||0), clicks=Number(metric.clicks||0);
      const ctr=impressions ? (clicks/impressions*100).toFixed(1) : "0.0";
      const image=creative.image_url || creative.store_list_image_url || "";
      return `<button class="admin-ad-row admin-ad-creative-row admin-ad-performance-row ${String(selectedAdPerformanceCreativeId)===String(creative.id)?"is-selected":""}" data-ad-performance-creative="${escapeAttr(creative.id)}" type="button">
        ${image?`<img class="admin-ad-thumb" src="${escapeAttr(image)}" alt="" />`:`<span class="admin-ad-thumb admin-ad-placeholder">AD</span>`}
        <span class="admin-ad-copy">
          <span class="admin-ad-title"><strong>${escapeHtml(creative.name||"광고 소재")}</strong><span class="admin-ad-creative-badge ${creative.is_primary?"is-primary":""}">${creative.is_primary?"기본 소재":(creative.is_active===false?"OFF":"ACTIVE")}</span></span>
          <span class="admin-ad-performance-meta">${creative.store_list_image_url?"홈 · 점령 대기 · 매장 목록":"홈 · 점령 대기"}${creative.click_url?" · 클릭 연결":""}</span>
          <span class="admin-ad-stats"><span>${impressions.toLocaleString("ko-KR")} 노출</span><span>${clicks.toLocaleString("ko-KR")} 클릭</span><span>CTR ${ctr}%</span><span>${Number(metric.visits||0).toLocaleString("ko-KR")} 방문</span><span>${Number(metric.captures||0).toLocaleString("ko-KR")} 점령</span></span>
        </span>
      </button>`;
    }).join("") || '<div class="admin-empty">등록된 광고 소재가 없습니다.</div>';
    $$('[data-ad-performance-creative]',box).forEach(btn=>btn.onclick=()=>{
      selectedAdPerformanceCreativeId=String(btn.dataset.adPerformanceCreative||"");
      renderAdPerformanceCreatives();
      void loadAdPerformanceDetail();
      $("#admin-ad-performance")?.scrollIntoView({behavior:"smooth",block:"start"});
    });
  }

  function editAdCreative(id){
    const campaign=adCampaigns.find(item=>String(item.id)===String(selectedAdCampaignId));
    const creative=storedCampaignCreatives(campaign?.id).find(item=>String(item.id)===String(id));
    if(!creative) return;
    const editor=$("#adCreativeEditor"); if(editor) editor.open=true;
    $("#adCreativeId").value=creative.id;
    $("#adCreativeName").value=creative.name || "";
    $("#adCreativeClickUrl").value=creative.click_url || "";
    $("#adCreativeIsActive").value=creative.is_active===false?"false":"true";
    $("#adCreativeSortOrder").value=String(Number(creative.sort_order||0));
    $("#adCreativeForm").dataset.imageUrl=creative.image_url || "";
    $("#adCreativeForm").dataset.storagePath=creative.storage_path || "";
    $("#adCreativeForm").dataset.storeListImageUrl=creative.store_list_image_url || "";
    $("#adCreativeForm").dataset.storeListStoragePath=creative.store_list_storage_path || "";
    $("#adCreativeCancel")?.classList.remove("hidden");
    setStatusText($("#adCreativeStatus"),"새 이미지를 선택하지 않으면 기존 이미지를 유지합니다.");
  }

  function resetAdCreativeForm(){
    const form=$("#adCreativeForm"); if(!form) return;
    form.reset();
    $("#adCreativeId").value="";
    $("#adCreativeIsActive").value="true";
    $("#adCreativeSortOrder").value="0";
    delete form.dataset.imageUrl; delete form.dataset.storagePath; delete form.dataset.storeListImageUrl; delete form.dataset.storeListStoragePath;
    $("#adCreativeCancel")?.classList.add("hidden");
    setStatusText($("#adCreativeStatus"),"");
  }

  async function saveAdCreative(event){
    event.preventDefault();
    const campaign=adCampaigns.find(item=>String(item.id)===String(selectedAdCampaignId));
    const form=$("#adCreativeForm"), status=$("#adCreativeStatus"), submit=event.submitter;
    if(!campaign || !form) return;
    if(submit) submit.disabled=true;
    let uploaded=[];
    try{
      const id=String($("#adCreativeId")?.value || "").trim() || (window.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`);
      let imageUrl=String(form.dataset.imageUrl||""), storagePath=String(form.dataset.storagePath||"");
      let storeListImageUrl=String(form.dataset.storeListImageUrl||""), storeListStoragePath=String(form.dataset.storeListStoragePath||"");
      const imageFile=$("#adCreativeImageFile")?.files?.[0];
      const storeListFile=$("#adCreativeStoreListImageFile")?.files?.[0];
      if(imageFile){
        const blob=await imageFileToJpegBlob(imageFile,1800,900,.88); const path=`ads/${campaign.id}/creative-${id}-${Date.now()}.jpg`;
        const up=await adminSb.storage.from("biteboss-assets").upload(path,blob,{contentType:"image/jpeg",cacheControl:"86400",upsert:false}); if(up.error) throw up.error;
        uploaded.push(path); imageUrl=adminSb.storage.from("biteboss-assets").getPublicUrl(path).data.publicUrl; storagePath=path;
      }
      if(storeListFile){
        const blob=await imageFileToJpegBlob(storeListFile,1800,360,.88); const path=`ads/${campaign.id}/creative-list-${id}-${Date.now()}.jpg`;
        const up=await adminSb.storage.from("biteboss-assets").upload(path,blob,{contentType:"image/jpeg",cacheControl:"86400",upsert:false}); if(up.error) throw up.error;
        uploaded.push(path); storeListImageUrl=adminSb.storage.from("biteboss-assets").getPublicUrl(path).data.publicUrl; storeListStoragePath=path;
      }
      const placement=campaignSetting(campaign.id).placement;
      if(placement === "store_list" && !storeListImageUrl) throw new Error("매장 목록 이미지를 선택하세요.");
      if(["home","takeover","both"].includes(placement) && !imageUrl) throw new Error("홈 · 점령 대기 이미지를 선택하세요.");
      if(placement === "all" && (!imageUrl || !storeListImageUrl)) throw new Error("전체 위치 노출에는 홈 · 점령 대기 이미지와 매장 목록 이미지가 모두 필요합니다.");
      const all={...adCreativeConfig()}; const rows=storedCampaignCreatives(campaign.id); const old=rows.find(x=>String(x.id)===id);
      const next={id,campaign_id:String(campaign.id),name:String($("#adCreativeName")?.value||"").trim(),image_url:imageUrl,storage_path:storagePath,store_list_image_url:storeListImageUrl,store_list_storage_path:storeListStoragePath,click_url:String($("#adCreativeClickUrl")?.value||"").trim(),is_active:String($("#adCreativeIsActive")?.value||"true")==="true",sort_order:Number($("#adCreativeSortOrder")?.value||0)};
      all[String(campaign.id)]=[...rows.filter(x=>String(x.id)!==id),next];
      await saveAdCreativeConfig(all); await syncPublicAdCampaigns();
      const oldPaths=[old?.storage_path && old.storage_path!==storagePath?old.storage_path:"",old?.store_list_storage_path && old.store_list_storage_path!==storeListStoragePath?old.store_list_storage_path:""].filter(Boolean);
      if(oldPaths.length) await adminSb.storage.from("biteboss-assets").remove(oldPaths);
      resetAdCreativeForm(); setStatusText(status,"광고 소재가 저장되었습니다."); renderAds(); renderAdCreatives();
    }catch(error){
      if(uploaded.length) try{await adminSb.storage.from("biteboss-assets").remove(uploaded);}catch{}
      setStatusText(status,`저장 실패 · ${error?.message||"다시 시도하세요."}`);
    }finally{ if(submit) submit.disabled=false; }
  }

  async function deleteAdCreative(id){
    const campaign=adCampaigns.find(item=>String(item.id)===String(selectedAdCampaignId)); if(!campaign) return;
    const rows=storedCampaignCreatives(campaign.id); const creative=rows.find(item=>String(item.id)===String(id)); if(!creative) return;
    if(!confirm(`${creative.name||"광고 소재"}를 삭제할까요?`)) return;
    const all={...adCreativeConfig()}; all[String(campaign.id)]=rows.filter(item=>String(item.id)!==String(id));
    try{
      await saveAdCreativeConfig(all); await syncPublicAdCampaigns();
      const paths=[creative.storage_path,creative.store_list_storage_path].filter(Boolean); if(paths.length) await adminSb.storage.from("biteboss-assets").remove(paths);
      renderAds(); renderAdCreatives();
    }catch(error){ alert(error?.message||"광고 소재 삭제에 실패했습니다."); }
  }

  function editAdCampaign(id){
    const item = adCampaigns.find(row => String(row.id) === String(id));
    if(!item) return;
    const editor = $("#adCampaignEditor");
    if(editor) editor.open = true;
    $("#adCampaignId").value = item.id;
    $("#adAdvertiserName").value = item.advertiser_name || "";
    $("#adCampaignName").value = item.campaign_name || "";
    $("#adClickUrl").value = item.click_url || "";
    $("#adStartsAt").value = toDateTimeLocal(item.starts_at);
    $("#adEndsAt").value = toDateTimeLocal(item.ends_at);
    renderAdminDateTimeControl("#adStartsAt", "#adStartsDatePicker", "#adStartsTimePicker");
    renderAdminDateTimeControl("#adEndsAt", "#adEndsDatePicker", "#adEndsTimePicker");
    $("#adIsActive").value = String(Boolean(item.is_active));
    $("#adSortOrder").value = Number(item.sort_order || 0);
    const setting=campaignSetting(item.id);
    $("#adPlacement").value=setting.placement;
    $("#adTargetType").value=setting.target_type;
    $("#adTargetRegion").value=setting.target_region;
    if($("#adTargetStore")) $("#adTargetStore").value=setting.target_store_id || "";
    const selectedTarget=stores.find(row=>String(row.id)===String(setting.target_store_id || ""));
    setAdTargetStore(selectedTarget || (setting.target_store_id ? {id:setting.target_store_id,name:"선택된 매장"} : null));
    const adForm=$("#adCampaignForm");
    if(adForm){
      adForm.dataset.storeListImageUrl=setting.store_list_image_url || "";
      adForm.dataset.storeListStoragePath=setting.store_list_storage_path || "";
      adForm.dataset.primaryImageKind=setting.primary_image_kind || "home";
    }
    syncAdTargetRegionField();
    $("#adCampaignCancel")?.classList.remove("hidden");
    setStatusText($("#adCampaignStatus"), "새 이미지를 선택하지 않으면 각 위치의 기존 배너가 유지됩니다.");
    $("#adCampaignForm")?.scrollIntoView({ behavior:"smooth", block:"start" });
  }

  function resetAdCampaignForm(){
    const form = $("#adCampaignForm");
    form?.reset();
    if($("#adCampaignId")) $("#adCampaignId").value = "";
    if($("#adIsActive")) $("#adIsActive").value = "true";
    if($("#adSortOrder")) $("#adSortOrder").value = "0";
    if($("#adPlacement")) $("#adPlacement").value = "both";
    if($("#adTargetType")) $("#adTargetType").value = "all";
    if($("#adTargetRegion")) $("#adTargetRegion").value = "";
    if($("#adTargetStore")) $("#adTargetStore").value = "";
    setAdTargetStore(null);
    if(form){
      delete form.dataset.storeListImageUrl;
      delete form.dataset.storeListStoragePath;
      delete form.dataset.primaryImageKind;
    }
    syncAdTargetRegionField();
    $("#adCampaignCancel")?.classList.add("hidden");
    setStatusText($("#adCampaignStatus"), "");
    ensureAdStartDefault();
  }

  function ensureAdStartDefault(){
    const input = $("#adStartsAt");
    if(input && !input.value) input.value = toDateTimeLocal(new Date().toISOString());
  }

  async function saveAdCampaign(event){
    event.preventDefault();
    const form = event.currentTarget;
    const status = $("#adCampaignStatus");
    const submit = form?.querySelector('button[type="submit"]');
    const editingId = String($("#adCampaignId")?.value || "").trim();
    const campaignId = editingId || crypto.randomUUID();
    const previous = editingId ? adCampaigns.find(item => String(item.id) === editingId) : null;
    const file = $("#adImageFile")?.files?.[0] || null;
    const storeListFile = $("#adStoreListImageFile")?.files?.[0] || null;
    const startsRaw = String($("#adStartsAt")?.value || "").trim();
    const endsRaw = String($("#adEndsAt")?.value || "").trim();
    const placement=String($("#adPlacement")?.value || "both");
    const previousSetting=editingId ? campaignSetting(editingId) : {};
    const previousUsesStoreListFallback=previousSetting.primary_image_kind === "store_list";
    let imageUrl = previousUsesStoreListFallback ? "" : String(previous?.image_url || "");
    let storagePath = previousUsesStoreListFallback ? "" : String(previous?.storage_path || "");
    let newStoragePath = "";
    let storeListImageUrl=String(previousSetting.store_list_image_url || form?.dataset.storeListImageUrl || "");
    let storeListStoragePath=String(previousSetting.store_list_storage_path || form?.dataset.storeListStoragePath || "");
    let newStoreListStoragePath="";
    let configPersisted=false;

    if(!startsRaw){
      setStatusText(status, "시작일시를 입력하세요.");
      return;
    }
    if(submit) submit.disabled = true;
    setStatusText(status, "캠페인 저장 중…");

    try{
      if(file){
        const blob = await imageFileToJpegBlob(file, 1800, 600, 0.9);
        newStoragePath = `ads/${campaignId}/home-${crypto.randomUUID()}.jpg`;
        const upload = await adminSb.storage.from("biteboss-assets").upload(newStoragePath, blob, {
          contentType:"image/jpeg",
          cacheControl:"86400",
          upsert:false
        });
        if(upload.error) throw upload.error;
        imageUrl = adminSb.storage.from("biteboss-assets").getPublicUrl(newStoragePath).data.publicUrl;
        storagePath = newStoragePath;
      }

      if(storeListFile){
        const blob=await imageFileToJpegBlob(storeListFile,1800,360,0.9);
        newStoreListStoragePath=`ads/${campaignId}/store-list-${crypto.randomUUID()}.jpg`;
        const upload=await adminSb.storage.from("biteboss-assets").upload(newStoreListStoragePath,blob,{
          contentType:"image/jpeg", cacheControl:"86400", upsert:false
        });
        if(upload.error) throw upload.error;
        storeListImageUrl=adminSb.storage.from("biteboss-assets").getPublicUrl(newStoreListStoragePath).data.publicUrl;
        storeListStoragePath=newStoreListStoragePath;
      }

      if(placement === "store_list" && !storeListImageUrl) throw new Error("매장 목록 이미지를 선택하세요.");
      if(["home","takeover","both"].includes(placement) && !imageUrl) throw new Error("홈 · 점령 대기 이미지를 선택하세요.");
      if(placement === "all" && (!imageUrl || !storeListImageUrl)) throw new Error("전체 위치 노출에는 홈 · 점령 대기 이미지와 매장 목록 이미지가 모두 필요합니다.");

      const usesStoreListFallback=!imageUrl && Boolean(storeListImageUrl);
      const canonicalImageUrl=imageUrl || storeListImageUrl;
      const canonicalStoragePath=storagePath || storeListStoragePath;
      const nextCampaign=normalizeAdCampaignRow({
        id:campaignId,
        advertiser_name:String($("#adAdvertiserName")?.value || "").trim(),
        campaign_name:String($("#adCampaignName")?.value || "").trim(),
        image_url:canonicalImageUrl,
        storage_path:canonicalStoragePath,
        click_url:String($("#adClickUrl")?.value || "").trim(),
        starts_at:new Date(startsRaw).toISOString(),
        ends_at:endsRaw ? new Date(endsRaw).toISOString() : null,
        is_active:String($("#adIsActive")?.value || "true") === "true",
        sort_order:Number($("#adSortOrder")?.value || 0)
      });
      if(!nextCampaign?.advertiser_name) throw new Error("광고주를 입력하세요.");
      if(!nextCampaign?.campaign_name) throw new Error("캠페인명을 입력하세요.");

      const campaigns=[...adCampaigns.filter(item=>String(item.id)!==campaignId),nextCampaign];
      const settings={...adPlacementConfig()};
      settings[campaignId]={
        placement,
        target_type:String($("#adTargetType")?.value || "all"),
        target_region:String($("#adTargetRegion")?.value || "").trim(),
        target_store_id:String($("#adTargetStore")?.value || "").trim(),
        store_list_image_url:storeListImageUrl,
        store_list_storage_path:storeListStoragePath,
        primary_image_kind:usesStoreListFallback ? "store_list" : "home"
      };

      const previousCampaigns=adCampaigns;
      const previousSettings=appConfig.ad_campaign_settings;
      adCampaigns=campaigns;
      appConfig.ad_campaign_settings=settings;
      const publicRows=buildPublicAdCampaigns(campaigns);
      try{
        await secureAdminConfigUpsert([
          {key:"ad_campaigns",value:campaigns},
          {key:"ad_campaign_settings",value:settings},
          {key:"ad_public_campaigns",value:publicRows}
        ]);
        appConfig.ad_campaigns=campaigns;
        appConfig.ad_public_campaigns=publicRows;
        configPersisted=true;
      }catch(configError){
        adCampaigns=previousCampaigns;
        appConfig.ad_campaign_settings=previousSettings;
        throw configError;
      }

      if(newStoragePath && previous?.storage_path && previous.storage_path !== newStoragePath && previous.storage_path !== storeListStoragePath){
        const removed = await adminSb.storage.from("biteboss-assets").remove([previous.storage_path]);
        if(removed.error) console.warn("Old ad asset cleanup:", removed.error);
      }
      if(newStoreListStoragePath && previousSetting.store_list_storage_path && previousSetting.store_list_storage_path !== newStoreListStoragePath){
        const removed=await adminSb.storage.from("biteboss-assets").remove([previousSetting.store_list_storage_path]);
        if(removed.error) console.warn("Old store-list ad asset cleanup:",removed.error);
      }

      resetAdCampaignForm();
      setStatusText(status, "캠페인이 저장되었습니다.");
      await loadAds();
    }catch(error){
      if(!configPersisted && newStoragePath){
        try{ await adminSb.storage.from("biteboss-assets").remove([newStoragePath]); }catch{}
      }
      if(!configPersisted && newStoreListStoragePath){
        try{ await adminSb.storage.from("biteboss-assets").remove([newStoreListStoragePath]); }catch{}
      }
      setStatusText(status, `저장 실패 · ${error?.message || "다시 시도하세요."}`);
    }finally{
      if(submit) submit.disabled = false;
    }
  }

  async function deleteAdCampaign(id){
    const item = adCampaigns.find(row => String(row.id) === String(id));
    if(!item) return;
    if(!confirm(`${item.campaign_name || "광고"} 캠페인을 삭제할까요?`)) return;

    const setting=campaignSetting(id);
    const extraCreatives=storedCampaignCreatives(id);
    const paths=[
      item.storage_path,
      setting.store_list_storage_path,
      ...extraCreatives.flatMap(row=>[row.storage_path,row.store_list_storage_path])
    ].map(value=>String(value || "").trim()).filter(Boolean);
    const uniquePaths=[...new Set(paths)];

    try{
      const campaigns=adCampaigns.filter(row=>String(row.id)!==String(id));
      const creatives={...adCreativeConfig()};
      delete creatives[String(id)];
      const settings={...adPlacementConfig()};
      delete settings[String(id)];
      const previousCampaigns=adCampaigns;
      const previousCreatives=appConfig.ad_creatives;
      const previousSettings=appConfig.ad_campaign_settings;
      adCampaigns=campaigns;
      appConfig.ad_creatives=creatives;
      appConfig.ad_campaign_settings=settings;
      const publicRows=buildPublicAdCampaigns(campaigns);

      try{
        await secureAdminConfigUpsert([
          {key:"ad_campaigns",value:campaigns},
          {key:"ad_creatives",value:creatives},
          {key:"ad_campaign_settings",value:settings},
          {key:"ad_public_campaigns",value:publicRows}
        ]);
        appConfig.ad_campaigns=campaigns;
        appConfig.ad_public_campaigns=publicRows;
      }catch(configError){
        adCampaigns=previousCampaigns;
        appConfig.ad_creatives=previousCreatives;
        appConfig.ad_campaign_settings=previousSettings;
        throw configError;
      }

      // Best-effort legacy cleanup only. Canonical deletion above is authoritative,
      // so a stale legacy row can never block the UI or public ad feed again.
      try{ await adminRpc("biteboss_admin_delete_campaign_v8239", {p_campaign_id:item.id}); }catch{}

      if(uniquePaths.length){
        const removed=await adminSb.storage.from("biteboss-assets").remove(uniquePaths);
        if(removed.error) console.warn("Ad asset cleanup:",removed.error);
      }
      if(String($("#adCampaignId")?.value || "") === String(id)) resetAdCampaignForm();
      if(String(selectedAdCampaignId)===String(id)) closeAdCreativePanel();
      renderAds();
      renderAdPerformanceCampaigns();
    }catch(error){
      alert(error?.message || "캠페인 삭제에 실패했습니다.");
      try{ await loadAds(); }catch{}
    }
  }

  function formatAdPeriod(start, end){
    const startText = start ? new Date(start).toLocaleDateString("ko-KR") : "즉시";
    const endText = end ? new Date(end).toLocaleDateString("ko-KR") : "종료일 없음";
    return `${startText} ~ ${endText}`;
  }

  function toDateTimeLocal(value){
    if(!value) return "";
    const date = new Date(value);
    if(Number.isNaN(date.getTime())) return "";
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
    return local.toISOString().slice(0,16);
  }

  function logLabel(type){
    return ({
      boss_claimed:"보스 점령",
      boss_released:"보스 해제",
      boss_reclaim:"보스 재점령",
      crew_claimed:"크루 점령",
      qr_rotated:"QR 재발급",
      claim_rejected_distance:"GPS 거리 차단",
      challenge_started:"도전 시작",
      capture_started:"점령 시작",
      capture_completed:"점령 완료",
      store_visit:"매장 방문",
      partner_approved:"제휴 승인",
      partner_rejected:"제휴 거절"
    })[type] || "서비스 활동";
  }

  function activityTone(type){
    if(["boss_claimed","boss_reclaim","crew_claimed","capture_completed"].includes(type)) return "strong";
    if(["claim_rejected_distance","partner_rejected"].includes(type)) return "alert";
    return "normal";
  }

  function formatActivityTime(value){
    if(!value) return "-";
    const date = new Date(value);
    const now = Date.now();
    const diff = Math.max(0, now - date.getTime());
    const minutes = Math.floor(diff / 60000);
    if(minutes < 1) return "방금";
    if(minutes < 60) return `${minutes}분 전`;
    const hours = Math.floor(minutes / 60);
    if(hours < 24) return `${hours}시간 전`;
    const days = Math.floor(hours / 24);
    if(days < 7) return `${days}일 전`;
    return date.toLocaleDateString("ko-KR", { month:"numeric", day:"numeric" });
  }

  function splitAdminDateTime(value){
    const text=String(value || "").trim();
    if(!text) return {date:"",time:""};
    const [date="",rawTime=""]=text.split("T");
    return {date,time:rawTime.slice(0,5)};
  }

  function renderAdminDateTimeControl(nativeId,datePickerId,timePickerId){
    const native=$(nativeId),datePicker=$(datePickerId),timePicker=$(timePickerId);
    if(!native || !datePicker || !timePicker) return;
    const parts=splitAdminDateTime(native.value);
    if(datePicker.value!==parts.date) datePicker.value=parts.date;
    if(timePicker.value!==parts.time) timePicker.value=parts.time;
  }

  function bindAdminDateTimeControl(nativeId,dateId,timeId){
    const native=$(nativeId);
    const datePicker=$(`${dateId}Picker`),timePicker=$(`${timeId}Picker`);
    if(!native || !datePicker || !timePicker) return;

    const commit=()=>{
      // 날짜와 시간은 각각 독립적으로 먼저 선택할 수 있어야 한다.
      // 한쪽이 비어 있을 때 hidden datetime 값을 비우고 다시 렌더하면
      // 방금 선택한 값까지 초기화되므로, 둘 다 선택된 시점에만 결합한다.
      if(datePicker.value && timePicker.value){
        native.value=`${datePicker.value}T${timePicker.value}`;
        native.dispatchEvent(new Event("change",{bubbles:true}));
      }
    };
    datePicker.addEventListener("change",commit);
    timePicker.addEventListener("change",commit);
    native.addEventListener("change",()=>{
      if(native.value) renderAdminDateTimeControl(nativeId,`${dateId}Picker`,`${timeId}Picker`);
    });
    renderAdminDateTimeControl(nativeId,`${dateId}Picker`,`${timeId}Picker`);
  }

  function storeInitial(name){
    const value = String(name || "").trim();
    if(!value) return "·";
    return Array.from(value)[0].toUpperCase();
  }

  function categoryLabel(value){
    return ({ restaurant:"식당", cafe:"카페", dessert:"디저트", bakery:"베이커리", fastfood:"패스트푸드", pub:"펍" })[value] || value || "매장";
  }

  function partnershipLabel(value){
    return ({ unclaimed:"비제휴", claimed:"관리중", partnered:"정식 제휴" })[value] || "비제휴";
  }

  function partnershipClass(value){
    if(value === "partnered") return "partnered";
    if(value === "claimed") return "claimed";
    return "unclaimed";
  }

  function formatRemaining(value){
    const diff = new Date(value).getTime() - Date.now();
    if(diff <= 0) return "만료";
    const minutes = Math.ceil(diff / 60000);
    if(minutes < 60) return `${minutes}분`;
    const hours = Math.floor(minutes / 60);
    const rest = minutes % 60;
    return `${hours}시간${rest ? ` ${rest}분` : ""}`;
  }

  function formatDate(value){
    return value ? new Date(value).toLocaleString("ko-KR") : "-";
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
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(image.width * scale));
          canvas.height = Math.max(1, Math.round(image.height * scale));
          canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
          canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error("Image conversion failed")), "image/jpeg", quality);
        };
        image.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  function showFatal(error){
    console.error(error);
    showAuthGate();
    setText("#adminLoginStatus", error?.message === "NOT_ADMIN" ? "BiteBoss 운영자 권한이 없습니다." : "초기화에 실패했습니다.");
  }

  function renderPagination(nav, page, totalItems, pageSize, onChange){
    if(!nav) return;
    const total=Math.max(0,Number(totalItems||0));
    const pages=Math.max(1,Math.ceil(total/Math.max(1,Number(pageSize||10))));
    const current=Math.min(pages,Math.max(1,Number(page||1)));
    nav.classList.toggle("hidden",pages<=1);
    if(pages<=1){ nav.innerHTML=""; return; }
    nav.innerHTML=`<button type="button" class="pagination-btn" data-page-prev ${current<=1?"disabled":""}>이전</button><span class="pagination-status"><b>${current}</b><span>/ ${pages}</span></span><button type="button" class="pagination-btn" data-page-next ${current>=pages?"disabled":""}>다음</button>`;
    nav.querySelector("[data-page-prev]")?.addEventListener("click",()=>onChange(Math.max(1,current-1)));
    nav.querySelector("[data-page-next]")?.addEventListener("click",()=>onChange(Math.min(pages,current+1)));
  }

  function setText(selector, value){ const el = $(selector); if(el) el.textContent = String(value ?? ""); }
  function escapeHtml(value){ return String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c])); }
  function escapeAttr(value){ return escapeHtml(value).replace(/`/g, "&#096;"); }
})();
