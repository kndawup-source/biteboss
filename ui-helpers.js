(() => {
  "use strict";

  const areas = ["명동","성수","홍대","연남","을지로","종로","강남","잠실","신촌","이태원","망원","합정","한남","청담","압구정","건대","문래","익선","서촌","해방촌","송리단","가로수","용산","마포","여의도","광화문","동대문","신사","혜화","상수"];
  const titles = ["불주먹","밤도깨비","골목왕","돌주먹","번개","독사","대장","철주먹","질주왕","불도저","해결사","골목대장","승부사","돌격대장","천둥","검은손","사냥꾼","집행자","끝판왕","강철심장","불꽃","질풍","호랑이","매운손","한방","직진왕","야차","철벽","선봉장","승부왕"];

  function hash(value = ""){
    let h = 2166136261;
    for(const char of String(value)){
      h ^= char.codePointAt(0) || 0;
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }

  function generateDefaultNickname(seed = ""){
    const source = String(seed || `${Date.now()}-${Math.random()}`);
    const h = hash(source);
    return `${areas[h % areas.length]}${titles[Math.floor(h / areas.length) % titles.length]}`;
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

  window.BITEBOSS_UI_HELPERS = Object.freeze({
    generateDefaultNickname,
    notificationKindLabel,
    notificationIsUnread,
    notificationIconMarkup,
    notificationFallbackTitle
  });
})();
