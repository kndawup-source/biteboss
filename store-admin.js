(() => {
  "use strict";
  if(window.__BITEBOSS_STORE_ADMIN_BOOTED__) return;
  window.__BITEBOSS_STORE_ADMIN_BOOTED__ = true;

  const $ = q => document.querySelector(q);
  const $$ = q => [...document.querySelectorAll(q)];

  const storeCfg = window.BITEBOSS_CONFIG || {};
  const storeSb = window.supabase?.createClient && storeCfg.supabaseUrl && storeCfg.supabaseAnonKey
    ? window.supabase.createClient(storeCfg.supabaseUrl, storeCfg.supabaseAnonKey, {
        auth:{
          persistSession:true,
          autoRefreshToken:true,
          detectSessionInUrl:false,
          storageKey:"biteboss-store-auth"
        },
        global:{ headers:{ "x-client-info":"biteboss-store-admin-web/76.6" } }
      })
    : null;

  let session = null;
  let storeAccount = null;
  let accessibleStores = [];
  let currentStore = null;
  let currentRole = null;
  let snapshot = {};
  let activeQr = null;
  let commentAdminPage = 1;

  init().catch(showFatal);

  async function init(){
    bindNav();
    bindLogin();
    bindActivation();
    bindForms();
    bindActions();

    if(!storeSb) throw new Error(window.BITEBOSS_BOOT_ERROR || "Supabase unavailable");
    await ensureStoreAuthSession();
    await restoreStoreSession();
  }

  async function ensureStoreAuthSession(){
    const current = await storeSb.auth.getSession();
    session = current.data?.session || null;
    if(session) return session;

    const { data, error } = await storeSb.auth.signInAnonymously();
    if(error) throw error;
    session = data.session;
    return session;
  }

  function bindActivation(){
    $("#openStoreActivationBtn")?.addEventListener("click", () => {
      $("#storeLoginForm")?.classList.add("hidden");
      $("#storeActivationForm")?.classList.remove("hidden");
      setText("#storeActivationStatus", "");
    });
    $("#backToStoreLoginBtn")?.addEventListener("click", () => {
      $("#storeActivationForm")?.classList.add("hidden");
      $("#storeLoginForm")?.classList.remove("hidden");
      setText("#storeLoginStatus", "");
    });

    $("#storeActivationForm")?.addEventListener("submit", async event => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const code = String(form.get("activation_code") || "").trim().toUpperCase();
      const username = String(form.get("store_id") || "").trim().toLowerCase();
      const pin = String(form.get("pin") || "").trim();
      const status = $("#storeActivationStatus");
      const submit = event.currentTarget.querySelector('button[type="submit"]');

      if(!code) return setText("#storeActivationStatus", "활성화 코드를 입력하세요.");
      if(!/^[a-z0-9][a-z0-9._-]{2,31}$/.test(username)) return setText("#storeActivationStatus", "ID는 영문 소문자/숫자/._- 조합 3~32자입니다.");
      if(!/^\d{6}$/.test(pin)) return setText("#storeActivationStatus", "PIN은 숫자 6자리입니다.");

      if(submit) submit.disabled = true;
      if(status) status.textContent = "계정을 만드는 중…";
      try{
        await ensureStoreAuthSession();
        const { data, error } = await storeSb.rpc("biteboss_store_activate", {
          p_activation_code:code,
          p_username:username,
          p_pin:pin
        });
        if(error) throw error;
        if(!data?.ok) throw new Error(data?.error || "STORE_ACTIVATION_FAILED");
        event.currentTarget.reset();
        if(status) status.textContent = "등록 완료";
        await restoreStoreSession();
      }catch(error){
        const message = String(error?.message || error);
        const text = message.includes("INVALID_OR_EXPIRED_CODE") ? "활성화 코드가 올바르지 않거나 만료되었습니다."
          : message.includes("USERNAME_TAKEN") ? "이미 사용 중인 ID입니다."
          : message.includes("STORE_ACCOUNT_EXISTS") ? "이미 매장 관리자 계정이 등록된 매장입니다."
          : message.includes("STORE_NOT_PARTNERED") ? "아직 정식 제휴 매장이 아닙니다."
          : "매장 계정을 만들지 못했습니다.";
        if(status) status.textContent = text;
      }finally{
        if(submit) submit.disabled = false;
      }
    });
  }

  function bindLogin(){
    $("#storeLoginForm")?.addEventListener("submit", async event => {
      event.preventDefault();
      const form = new FormData(event.currentTarget);
      const username = String(form.get("store_id") || "").trim().toLowerCase();
      const pin = String(form.get("pin") || "").trim();
      const status = $("#storeLoginStatus");

      if(!username || !/^\d{6}$/.test(pin)){
        if(status) status.textContent = "ID와 6자리 PIN을 확인하세요.";
        return;
      }

      if(status) status.textContent = "로그인 중…";

      try{
        await ensureStoreAuthSession();
        const { data, error } = await storeSb.rpc("biteboss_store_login", {
          p_username:username,
          p_pin:pin
        });
        if(error) throw error;
        if(!data?.ok){
          if(status){
            status.textContent = data?.error === "LOCKED"
              ? "로그인 시도가 많습니다. 15분 후 다시 시도하세요."
              : data?.error === "STORE_INACTIVE"
                ? "비활성화된 매장입니다."
                : data?.error === "STORE_NOT_PARTNERED"
                  ? "정식 제휴 매장만 Store Admin을 사용할 수 있습니다."
                  : "ID 또는 PIN이 올바르지 않습니다.";
          }
          return;
        }
        if(status) status.textContent = "";
        await restoreStoreSession();
      }catch(error){
        console.error("BiteBoss store login failed:", error);
        if(status) status.textContent = `로그인 실패 · ${error?.message || "알 수 없는 오류"}`;
      }
    });
  }

  async function restoreStoreSession(){
    const { data, error } = await storeSb.rpc("biteboss_store_session");
    if(error || !data?.authenticated){
      storeAccount = null;
      showAuthGate();
      return;
    }

    storeAccount = data;
    currentRole = data.role || "owner";

    const result = await storeSb
      .from("biteboss_stores")
      .select("*")
      .eq("id", data.store_id)
      .single();

    if(result.error) throw result.error;
    currentStore = result.data;
    if(currentStore.partnership_status !== "partnered"){
      try{ await storeSb.rpc("biteboss_store_logout"); }catch{}
      storeAccount = null;
      currentStore = null;
      showAuthGate();
      setText("#storeLoginStatus", "정식 제휴 매장만 Store Admin을 사용할 수 있습니다.");
      return;
    }
    accessibleStores = [currentStore];

    renderStoreSelector();
    applyRoleUi();
    hideAuthGate();
    await refreshStore();
  }

  function showAuthGate(){
    $("#storeAuthGate")?.classList.remove("hidden");
    $("#storeAdminApp")?.classList.add("hidden");
  }

  function hideAuthGate(){
    $("#storeAuthGate")?.classList.add("hidden");
    $("#storeAdminApp")?.classList.remove("hidden");
  }

  function renderStoreSelector(){
    const select = $("#storeSelector");
    if(!select) return;
    select.innerHTML = `<option value="${escapeAttr(currentStore.id)}">${escapeHtml(currentStore.name)}</option>`;
    select.value = currentStore.id;
    select.disabled = true;
  }

  function applyRoleUi(){
    $("#operatorAdminLink")?.classList.add("hidden");
  }

  function openStoreAdminPage(name){
    const page = $(`#store-admin-${name}`);
    if(!page) return;
    $$(".store-admin-nav").forEach(item => item.classList.toggle("active", item.dataset.storeAdmin === name));
    $$(".store-admin-page").forEach(item => item.classList.remove("active"));
    page.classList.add("active");
    if(name === "comments") void loadStoreCommentAdmin(commentAdminPage);
    window.scrollTo({ top:0, behavior:"smooth" });
  }
  function bindNav(){
    $$(".store-admin-nav").forEach(btn => {
      btn.addEventListener("click", () => openStoreAdminPage(btn.dataset.storeAdmin));
    });
    $$('[data-open-store-page]').forEach(btn => {
      btn.addEventListener("click", () => openStoreAdminPage(btn.dataset.openStorePage));
    });
  }
  function bindForms(){
    $("#storeInfoForm")?.addEventListener("submit", saveStoreInfo);
    $("#storeVideoForm")?.addEventListener("submit", saveStoreVideo);
    $("#storeSeoForm")?.addEventListener("submit", saveStoreSeo);
    $("#menuForm")?.addEventListener("submit", addMenu);
    $("#offerForm")?.addEventListener("submit", addOffer);
    $("#benefitPassForm")?.addEventListener("submit", redeemBenefitPass);
  }

  function bindActions(){
    $("#storeLogoutBtn")?.addEventListener("click", async () => {
      try{ await storeSb.rpc("biteboss_store_logout"); }catch(error){ console.warn(error); }
      await storeSb.auth.signOut();
      session = null;
      storeAccount = null;
      location.reload();
    });
    $("#clearBossBtn")?.addEventListener("click", releaseBoss);
    $("#storeVideoDelete")?.addEventListener("click", deleteStoreVideo);
    $("#storeUrlCopy")?.addEventListener("click", copyStoreUrl);
    $("#copyQrBtn")?.addEventListener("click", copyQr);
    $("#rotateQrBtn")?.addEventListener("click", rotateQr);

    const cameraInput = $("#cameraPhotoInput");
    const libraryInput = $("#libraryPhotoInput");
    $("#takePhotoBtn")?.addEventListener("click", () => cameraInput?.click());
    $("#choosePhotoBtn")?.addEventListener("click", () => libraryInput?.click());
    $("#quickPhotoBtn")?.addEventListener("click", () => {
      openStoreAdminPage("store");
      setTimeout(() => cameraInput?.click(), 120);
    });
    cameraInput?.addEventListener("change", quickAddPhoto);
    libraryInput?.addEventListener("change", quickAddPhoto);
  }

  async function refreshStore(){
    if(!currentStore) return;
    setText("#storeSyncStatus", "syncing");

    const fresh = await storeSb.from("biteboss_stores").select("*").eq("id", currentStore.id).single();
    if(fresh.error) throw fresh.error;
    currentStore = fresh.data;
    accessibleStores = accessibleStores.map(store => store.id === currentStore.id ? currentStore : store);

    const [snapshotResult] = await Promise.all([
      storeSb.rpc("biteboss_store_snapshot", { p_store_id:currentStore.id }),
      loadPhotos(), loadStoreVideo(), loadStoreSeo(), loadMenu(), loadOffers(), loadQr(), loadActivity()
    ]);

    if(snapshotResult.error) throw snapshotResult.error;
    snapshot = snapshotResult.data || {};
    renderOverview();
    renderStoreForm();
    renderBoss();
    setText("#storeSyncStatus", "server");
  }

  function renderOverview(){
    setText("#storeAdminTitle", currentStore.name || "내 매장");
    setText("#storeSideName", currentStore.name || "Manager");
    setText("#storeMetricBoss", snapshot.current_boss_nickname || "No Boss");
    setText("#storeMetricClaims", snapshot.claims || 0);
    setText("#storeMetricCheckins", snapshot.checkins || 0);
    setText("#storeMetricExpire", snapshot.protected_until ? formatRemaining(snapshot.protected_until) : "-");
    setText("#storeMetricPartner", partnershipLabel(currentStore.partnership_status));

    const card = $("#storeBossCard");
    if(card){
      card.innerHTML = `
        <div class="store-owner-avatar">${escapeHtml(initials(snapshot.current_boss_nickname || "No Boss"))}</div>
        <div><strong>${escapeHtml(snapshot.current_boss_nickname || "No Boss")}</strong><p>${snapshot.protected_until ? `${escapeHtml(formatRemaining(snapshot.protected_until))} 후 보호 종료` : "현재 활성 Boss가 없습니다."}</p></div>
      `;
    }
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
    return {
      open:match ? match[1] : "",
      close:match ? match[2] : "",
      open24:meta.open24 === "1",
      closedDays:String(meta.closed || "").split(",").filter(day => STORE_DAY_KEYS.includes(day))
    };
  }

  function composeStoreHours(form){
    const open24 = String(form.get("open_24h") || "") === "1";
    const open = String(form.get("hours_open") || "").trim();
    const close = String(form.get("hours_close") || "").trim();
    const closedDays = form.getAll("closed_days").map(String).filter(day => STORE_DAY_KEYS.includes(day));
    const timePart = open24 ? "00:00 - 00:00" : (open && close ? `${open} - ${close}` : "");
    if(!timePart && !closedDays.length) return "";
    return [timePart, `open24=${open24 ? "1" : "0"}`, `closed=${closedDays.join(",")}`].filter(Boolean).join("|");
  }

  function applyStoreHoursForm(form, value){
    const hours = parseStoreHours(value);
    if(form.elements.hours_open) form.elements.hours_open.value = hours.open;
    if(form.elements.hours_close) form.elements.hours_close.value = hours.close;
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

  function renderStoreForm(){
    const form = $("#storeInfoForm");
    if(!form) return;
    ["name","category","city","district","address","phone","notice"].forEach(key => {
      if(form.elements[key]) form.elements[key].value = currentStore[key] || "";
    });
    applyStoreHoursForm(form, currentStore.hours);
    bindStoreHoursControls(form);
  }

  async function saveStoreInfo(event){
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const { error } = await storeSb.rpc("biteboss_update_store", {
      p_store_id:currentStore.id,
      p_name:String(form.get("name") || "").trim(),
      p_category:String(form.get("category") || "restaurant"),
      p_city:String(form.get("city") || "").trim(),
      p_district:String(form.get("district") || "").trim(),
      p_address:String(form.get("address") || "").trim(),
      p_hours:composeStoreHours(form),
      p_phone:String(form.get("phone") || "").trim(),
      p_notice:String(form.get("notice") || "").trim()
    });
    if(error) return alert(error.message);
    await refreshStore();
  }

  function storePublicUrl(slug){
    return currentStore?.id && slug ? `${location.origin}/store/${encodeURIComponent(currentStore.id)}/${encodeURIComponent(slug)}` : "";
  }
  async function loadStoreSeo(){
    if(!currentStore) return;
    const {data,error}=await storeSb.rpc("biteboss_store_seo_settings",{p_store_id:currentStore.id});
    if(error) return console.warn("BiteBoss store SEO:",error);
    const input=$("#storeSeoForm")?.elements?.slug;
    if(input) input.value=String(data?.custom_slug || "");
    setText("#storeUrlPreview",storePublicUrl(String(data?.slug || "")));
  }
  async function saveStoreSeo(event){
    event.preventDefault(); if(!currentStore) return;
    const slug=String(new FormData(event.currentTarget).get("slug") || "").trim().toLowerCase();
    setText("#storeSeoStatus","저장 중…");
    const {data,error}=await storeSb.rpc("biteboss_store_set_seo_slug",{p_store_id:currentStore.id,p_slug:slug});
    if(error || !data?.ok){
      const code=data?.error || "";
      return setText("#storeSeoStatus",code==="SLUG_TAKEN"?"이미 사용 중인 주소입니다.":code==="INVALID_SLUG"?"영문 소문자, 숫자, 하이픈만 입력하세요.":error?.message || code || "저장 실패");
    }
    setText("#storeSeoStatus",slug ? "고유주소가 저장되었습니다." : "자동 주소로 설정되었습니다.");
    await loadStoreSeo();
  }
  async function copyStoreUrl(){
    const url=String($("#storeUrlPreview")?.textContent || "").trim();
    if(!url) return;
    await navigator.clipboard.writeText(url);
    setText("#storeSeoStatus","주소를 복사했습니다.");
  }

  async function loadStoreVideo(){
    if(!currentStore) return; const {data,error}=await storeSb.rpc("biteboss_store_video",{p_store_id:currentStore.id});
    if(error) return console.warn("BiteBoss store video:",error); const input=$("#storeVideoForm")?.elements?.video_url; if(input) input.value=String(data?.video_url || "");
  }

  async function saveStoreVideo(event){
    event.preventDefault(); if(!currentStore) return; const form=new FormData(event.currentTarget); const url=String(form.get("video_url") || "").trim(); setText("#storeVideoStatus","저장 중…");
    const {data,error}=await storeSb.rpc("biteboss_store_set_video",{p_store_id:currentStore.id,p_video_url:url});
    if(error || !data?.ok) return setText("#storeVideoStatus",`저장 실패 · ${error?.message || data?.error || "다시 시도하세요."}`); setText("#storeVideoStatus","영상이 저장되었습니다."); await loadStoreVideo();
  }

  async function deleteStoreVideo(){
    if(!currentStore) return; setText("#storeVideoStatus","삭제 중…"); const {data,error}=await storeSb.rpc("biteboss_store_set_video",{p_store_id:currentStore.id,p_video_url:""});
    if(error || !data?.ok) return setText("#storeVideoStatus",`삭제 실패 · ${error?.message || data?.error || "다시 시도하세요."}`); const input=$("#storeVideoForm")?.elements?.video_url; if(input) input.value=""; setText("#storeVideoStatus","영상이 삭제되었습니다.");
  }

  async function loadPhotos(){
    const { data, error } = await storeSb.from("biteboss_store_photos").select("*").eq("store_id", currentStore.id).order("sort_order").order("created_at", { ascending:false });
    if(error) return console.warn(error);
    const box = $("#photoList");
    if(!box) return;
    box.innerHTML = (data || []).map(photo => `
      <article class="store-photo-card">
        <img src="${escapeAttr(photo.image_url)}" alt="" />
        <div><strong>${escapeHtml(photo.caption || (photo.is_cover ? "대표 사진" : "매장 사진"))}</strong><button class="badge bad" data-delete-photo="${escapeAttr(photo.id)}" data-photo-path="${escapeAttr(photo.storage_path || "")}" type="button">삭제</button></div>
      </article>
    `).join("") || `<div class="timeline-item muted">등록된 사진이 없습니다.</div>`;
    $$("[data-delete-photo]").forEach(btn => btn.onclick = async () => {
      const storagePath = btn.dataset.photoPath || "";
      if(storagePath){
        const removed = await storeSb.storage.from("biteboss-store-images").remove([storagePath]);
        if(removed.error) return alert(removed.error.message);
      }
      const { error:deleteError } = await storeSb.from("biteboss_store_photos").delete().eq("id", btn.dataset.deletePhoto);
      if(deleteError) return alert(deleteError.message);
      await loadPhotos();
    });
  }

  async function quickAddPhoto(event){
    const input = event.currentTarget;
    const file = input?.files?.[0];
    if(!(file instanceof File) || !file.size) return;

    const status = $("#photoUploadStatus");
    if(status) status.textContent = "사진을 저장하는 중…";
    try{
      await uploadStorePhoto(file);
      if(status) status.textContent = "사진이 등록되었습니다.";
      await loadPhotos();
    }catch(error){
      console.error(error);
      if(status) status.textContent = `사진 등록 실패 · ${error?.message || "다시 시도해주세요."}`;
    }finally{
      input.value = "";
      setTimeout(() => { if(status) status.textContent = ""; }, 2500);
    }
  }

  async function uploadStorePhoto(file){
    const blob = await imageFileToJpegBlob(file, 1600, 1600, 0.88);
    const path = `${currentStore.id}/${crypto.randomUUID()}.jpg`;
    const upload = await storeSb.storage.from("biteboss-store-images").upload(path, blob, { contentType:"image/jpeg", cacheControl:"86400" });
    if(upload.error) throw upload.error;

    const publicData = storeSb.storage.from("biteboss-store-images").getPublicUrl(path).data;
    const shouldCover = !currentStore.photo_url;
    if(shouldCover){
      await storeSb.from("biteboss_store_photos").update({ is_cover:false }).eq("store_id", currentStore.id);
    }
    const inserted = await storeSb.from("biteboss_store_photos").insert({
      store_id:currentStore.id,
      image_url:publicData.publicUrl,
      storage_path:path,
      caption:"",
      is_cover:shouldCover,
      sort_order:0
    });
    if(inserted.error) throw inserted.error;

    if(shouldCover){
      const updated = await storeSb.from("biteboss_stores").update({ photo_url:publicData.publicUrl, updated_at:new Date().toISOString() }).eq("id", currentStore.id);
      if(updated.error) throw updated.error;
      currentStore.photo_url = publicData.publicUrl;
    }
  }

  async function loadMenu(){
    const { data, error } = await storeSb.from("biteboss_menu_items").select("*").eq("store_id", currentStore.id).order("sort_order").order("created_at");
    if(error) return console.warn(error);
    const box = $("#menuList");
    if(!box) return;
    box.innerHTML = (data || []).map(item => `
      <article class="store-card"><div><strong>${escapeHtml(item.name)}</strong><div class="meta">${item.price ? `${Number(item.price).toLocaleString("ko-KR")}원` : "가격 미정"}${item.is_signature ? " · Signature" : ""}</div>${item.description ? `<div class="meta">${escapeHtml(item.description)}</div>` : ""}</div><button class="badge bad" data-delete-menu="${escapeAttr(item.id)}" type="button">삭제</button></article>
    `).join("") || `<div class="timeline-item muted">등록된 메뉴가 없습니다.</div>`;
    $$("[data-delete-menu]").forEach(btn => btn.onclick = async () => {
      const result = await storeSb.from("biteboss_menu_items").delete().eq("id", btn.dataset.deleteMenu);
      if(result.error) return alert(result.error.message);
      await loadMenu();
    });
  }

  async function addMenu(event){
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const isSignature = String(form.get("is_signature")) === "true";
    if(isSignature) await storeSb.from("biteboss_menu_items").update({ is_signature:false }).eq("store_id", currentStore.id);
    const result = await storeSb.from("biteboss_menu_items").insert({
      store_id:currentStore.id,
      name:String(form.get("name") || "").trim(),
      price:form.get("price") ? Number(form.get("price")) : null,
      description:String(form.get("description") || "").trim(),
      is_signature:isSignature,
      is_active:true
    });
    if(result.error) return alert(result.error.message);
    event.currentTarget.reset();
    await loadMenu();
  }

  async function loadQr(){
    if(currentStore?.partnership_status !== "partnered"){
      activeQr = null;
      renderQr();
      return;
    }
    const { data, error } = await storeSb.from("biteboss_qr_codes").select("*").eq("store_id", currentStore.id).eq("is_active", true).maybeSingle();
    if(error) return console.warn(error);
    activeQr = data || null;
    if(!activeQr){
      const rotated = await storeSb.rpc("biteboss_rotate_qr", { p_store_id:currentStore.id });
      if(rotated.error) return console.warn(rotated.error);
      activeQr = { token:rotated.data };
    }
    renderQr();
  }

  function qrLink(){
    if(!activeQr?.token) return "";
    return `${location.origin}${location.pathname.replace(/store-admin\.html.*$/, "index.html")}?claim=${encodeURIComponent(activeQr.token)}`;
  }

  function renderQr(){
    const link = qrLink();
    setText("#storeQrToken", activeQr?.token || "-");
    setText("#storeQrLink", link || "-");

    const image = $("#storeQrImage");
    if(!image) return;
    if(!link){
      image.removeAttribute("src");
      image.alt = "QR unavailable";
      return;
    }

    const qrUrl = `https://quickchart.io/qr?text=${encodeURIComponent(link)}&size=480&margin=2&ecLevel=M&dark=000000&light=ffffff&format=png`;
    image.onload = () => image.classList.remove("qr-error");
    image.onerror = () => {
      image.classList.add("qr-error");
      image.alt = "QR image failed to load";
      console.error("BiteBoss QR image failed to load", qrUrl);
    };
    image.src = qrUrl;
  }

  async function copyQr(){
    const link = qrLink();
    if(link) await navigator.clipboard.writeText(link);
  }

  async function rotateQr(){
    if(currentStore?.partnership_status !== "partnered") return alert("정식 제휴 매장만 QR을 사용할 수 있습니다.");
    if(!confirm("기존 QR은 즉시 무효화됩니다. 재발급할까요?")) return;
    const { data, error } = await storeSb.rpc("biteboss_rotate_qr", { p_store_id:currentStore.id });
    if(error) return alert(error.message);
    activeQr = { token:data };
    renderQr();
  }

  function renderBoss(){
    const box = $("#bossDetail");
    if(!box) return;
    box.innerHTML = `
      <article class="store-owner-card"><div class="store-owner-avatar">${escapeHtml(initials(snapshot.current_boss_nickname || "No Boss"))}</div><div><strong>${escapeHtml(snapshot.current_boss_nickname || "No Boss")}</strong><p>점령 ${Number(snapshot.claims || 0)} · 방문 ${Number(snapshot.checkins || 0)}</p><p>${snapshot.protected_until ? `보호 만료: ${escapeHtml(formatDate(snapshot.protected_until))}` : "현재 활성 Boss가 없습니다."}</p></div></article>
    `;
  }

  async function releaseBoss(){
    if(!snapshot.protected_until) return;
    if(!confirm("현재 Boss 보호를 해제할까요?")) return;
    const { error } = await storeSb.rpc("biteboss_release_boss", { p_store_id:currentStore.id });
    if(error) return alert(error.message);
    await refreshStore();
  }

  async function loadOffers(){
    if(!currentStore) return;

    const { data, error } = await storeSb.rpc("biteboss_store_list_offers", {
      p_store_id:currentStore.id
    });

    if(error || !data?.ok){
      console.warn(error || data?.error);
      return;
    }

    const rows = Array.isArray(data.offers) ? data.offers : [];
    const box = $("#offerList");
    if(!box) return;

    box.innerHTML = rows.map(item => {
      const role = String(item.minimum_role || (item.boss_only ? "boss" : "visitor"));
      const audience = role === "boss" ? "Boss only" : role === "crew" ? "Crew + Boss" : "Everyone";

      return `
        <article class="store-card">
          <div>
            <strong>${escapeHtml(item.title)}</strong>
            <div class="meta">${escapeHtml(item.status)} · ${escapeHtml(audience)}</div>
            ${item.description ? `<div class="meta">${escapeHtml(item.description)}</div>` : ""}
          </div>
          <button class="text-btn danger-text" data-delete-offer="${escapeAttr(item.id)}" type="button">삭제</button>
        </article>
      `;
    }).join("") || `<div class="timeline-item muted">등록된 혜택이 없습니다.</div>`;

    $$("[data-delete-offer]").forEach(btn => btn.onclick = async () => {
      const { data:result, error:deleteError } = await storeSb.rpc("biteboss_store_delete_offer", {
        p_store_id:currentStore.id,
        p_offer_id:btn.dataset.deleteOffer
      });
      if(deleteError || !result?.ok) return alert(deleteError?.message || result?.error || "삭제 실패");
      await loadOffers();
    });
  }

  async function addOffer(event){
    event.preventDefault();
    if(!currentStore) return;

    const form = new FormData(event.currentTarget);
    const { data, error } = await storeSb.rpc("biteboss_store_upsert_offer", {
      p_store_id:currentStore.id,
      p_offer_id:null,
      p_title:String(form.get("title") || "").trim(),
      p_description:String(form.get("description") || "").trim(),
      p_status:String(form.get("status") || "draft"),
      p_minimum_role:String(form.get("minimum_role") || "visitor")
    });

    if(error || !data?.ok) return alert(error?.message || data?.error || "혜택 저장 실패");

    event.currentTarget.reset();
    await loadOffers();
  }

  async function redeemBenefitPass(event){
    event.preventDefault();
    if(!currentStore) return;

    const tokenInput = $("#benefitPassToken");
    const resultBox = $("#benefitPassResult");
    const token = String(tokenInput?.value || "").trim().toUpperCase();

    if(!/^[A-F0-9]{8}$/.test(token)){
      if(resultBox) resultBox.innerHTML = `<strong>코드 확인</strong><p>8자리 코드를 입력하세요.</p>`;
      return;
    }

    const { data, error } = await storeSb.rpc("biteboss_store_redeem_offer_pass", {
      p_store_id:currentStore.id,
      p_token:token
    });

    if(error || !data?.ok){
      const message = ({
        PASS_NOT_FOUND:"유효한 혜택 코드를 찾지 못했습니다.",
        PASS_EXPIRED:"만료된 코드입니다.",
        ALREADY_REDEEMED:"이미 사용된 코드입니다.",
        OFFER_NOT_ACTIVE:"현재 종료된 혜택입니다.",
        ROLE_CHANGED:"플레이어의 현재 Boss/Crew 상태가 변경되었습니다.",
        INVALID_TOKEN:"코드 형식이 올바르지 않습니다.",
        NOT_AUTHORIZED:"매장 관리자 권한이 필요합니다."
      })[data?.error] || error?.message || "코드 확인에 실패했습니다.";

      if(resultBox) resultBox.innerHTML = `<strong>사용 불가</strong><p>${escapeHtml(message)}</p>`;
      return;
    }

    if(resultBox){
      resultBox.innerHTML = `
        <strong>사용 완료</strong>
        <p>${escapeHtml(data.offer_title || "Benefit")}</p>
        <p>${escapeHtml(data.player_name || "Player")} · ${escapeHtml(String(data.player_role || "").toUpperCase())}</p>
      `;
    }

    if(tokenInput) tokenInput.value = "";
  }

  async function loadStoreCommentAdmin(page=1){
    if(!currentStore) return;
    const list=$("#storeCommentAdminList");
    const nav=$("#storeCommentAdminPagination");
    if(list) list.innerHTML='<div class="inline-status">불러오는 중…</div>';
    const {data,error}=await storeSb.rpc("biteboss_store_admin_comments_v7582",{
      p_store_id:currentStore.id,
      p_page:Math.max(1,Number(page||1)),
      p_page_size:10
    });
    if(error || !data?.ok){
      if(list) list.innerHTML='<div class="inline-status">한마디를 불러오지 못했습니다.</div>';
      if(nav) nav.innerHTML='';
      return;
    }
    commentAdminPage=Math.max(1,Number(data.page||page||1));
    const total=Math.max(0,Number(data.total||0));
    setText("#storeCommentAdminCount",`${total}개`);
    const items=Array.isArray(data.items)?data.items:[];
    if(list){
      list.innerHTML=items.length?items.map(item=>`
        <article class="store-list-row" data-admin-comment="${escapeAttr(item.id)}">
          <div class="store-list-main">
            <strong>${escapeHtml(item.nickname||"사용자")}${item.is_pinned?" · 고정":""}${item.is_hidden?" · 숨김":""}</strong>
            <p>${escapeHtml(item.body||"")}</p>
            <small>${escapeHtml(formatDate(item.created_at))}${item.edited_at?" · 수정됨":""}${Number(item.report_count||0)>0?` · 신고 ${Number(item.report_count||0)}건`:""}</small>
          </div>
          <div class="store-action-row">
            <button class="text-btn" data-comment-moderate="${item.is_pinned?"unpin":"pin"}" type="button">${item.is_pinned?"고정 해제":"고정"}</button>
            <button class="text-btn" data-comment-moderate="${item.is_hidden?"unhide":"hide"}" type="button">${item.is_hidden?"숨김 해제":"숨김"}</button>
            <button class="text-btn danger" data-comment-moderate="delete" type="button">삭제</button>
          </div>
        </article>
      `).join(""):'<div class="inline-status">등록된 한마디가 없습니다.</div>';
      list.querySelectorAll("[data-comment-moderate]").forEach(button=>button.addEventListener("click",async()=>{
        const row=button.closest("[data-admin-comment]");
        const id=row?.dataset.adminComment;
        const action=button.dataset.commentModerate;
        if(!id) return;
        if(action==="delete" && !confirm("이 한마디를 영구 삭제할까요?")) return;
        button.disabled=true;
        const result=await storeSb.rpc("biteboss_store_comment_moderate_v7582",{p_comment_id:id,p_action:action});
        button.disabled=false;
        if(result.error || !result.data?.ok){
          alert(result.data?.error==="PIN_LIMIT"?"고정은 매장당 최대 3개입니다.":"처리하지 못했습니다.");
          return;
        }
        await loadStoreCommentAdmin(commentAdminPage);
      }));
    }
    if(nav){
      const pages=Math.max(1,Math.ceil(total/10));
      nav.innerHTML=pages>1?`<button class="secondary-btn" data-comment-prev type="button" ${commentAdminPage<=1?"disabled":""}>이전</button><span>${commentAdminPage} / ${pages}</span><button class="secondary-btn" data-comment-next type="button" ${commentAdminPage>=pages?"disabled":""}>다음</button>`:"";
      nav.querySelector("[data-comment-prev]")?.addEventListener("click",()=>loadStoreCommentAdmin(Math.max(1,commentAdminPage-1)));
      nav.querySelector("[data-comment-next]")?.addEventListener("click",()=>loadStoreCommentAdmin(Math.min(pages,commentAdminPage+1)));
    }
  }

  async function loadActivity(){
    const { data, error } = await storeSb.from("biteboss_event_logs").select("event_type,payload,created_at").eq("store_id", currentStore.id).order("created_at", { ascending:false }).limit(12);
    const box = $("#storeActivity");
    if(!box) return;
    if(error){ box.innerHTML = `<div class="timeline-item muted">활동을 불러오지 못했습니다.</div>`; return; }
    box.innerHTML = (data || []).map(item => `<div class="timeline-item"><strong>${escapeHtml(eventLabel(item.event_type))}</strong><div class="meta">${escapeHtml(formatDate(item.created_at))}</div></div>`).join("") || `<div class="timeline-item muted">아직 활동이 없습니다.</div>`;
  }

  function eventLabel(type){
    return ({ boss_claimed:"Boss 점령", boss_released:"Boss 해제", qr_rotated:"QR 재발급", claim_rejected_distance:"거리 밖 점령 시도" })[type] || type || "Event";
  }
  function partnershipLabel(value){ return ({ unclaimed:"비제휴", claimed:"관리중", partnered:"정식 제휴" })[value] || "비제휴"; }
  function initials(value){ return String(value || "BB").trim().split(/\s+/).map(x => x[0]).join("").slice(0,2).toUpperCase() || "BB"; }
  function formatRemaining(value){ const diff = new Date(value).getTime() - Date.now(); if(diff <= 0) return "만료"; const m = Math.ceil(diff/60000); if(m < 60) return `${m}분`; return `${Math.floor(m/60)}시간${m%60 ? ` ${m%60}분` : ""}`; }
  function formatDate(value){ return value ? new Date(value).toLocaleString("ko-KR") : "-"; }
  function setText(selector, value){ const el = $(selector); if(el) el.textContent = String(value ?? ""); }
  function escapeHtml(value){ return String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c])); }
  function escapeAttr(value){ return escapeHtml(value).replace(/`/g, "&#096;"); }

  function imageFileToJpegBlob(file, maxWidth, maxHeight, quality){
    return new Promise((resolve, reject) => {
      const reader = new FileReader(); reader.onerror = reject;
      reader.onload = () => {
        const image = new Image(); image.onerror = reject;
        image.onload = () => {
          const scale = Math.min(1, maxWidth/image.width, maxHeight/image.height);
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(image.width*scale)); canvas.height = Math.max(1, Math.round(image.height*scale));
          canvas.getContext("2d").drawImage(image,0,0,canvas.width,canvas.height);
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
    setText("#storeLoginStatus", error?.message === "NO_STORE_ACCESS" ? "관리 가능한 BiteBoss 매장이 없습니다." : "초기화에 실패했습니다.");
  }
})();
