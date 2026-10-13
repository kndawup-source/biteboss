(() => {
  "use strict";

  const isNative = (() => {
    try{
      return Boolean(window.Capacitor?.isNativePlatform?.()) ||
        (typeof window.Capacitor?.getPlatform === "function" && window.Capacitor.getPlatform() !== "web");
    }catch{
      return false;
    }
  })();

  const loadScript = src => new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.async = false;
    script.onload = () => resolve(src);
    script.onerror = () => {
      script.remove();
      reject(new Error(`SCRIPT_LOAD_FAILED:${src}`));
    };
    document.head.appendChild(script);
  });

  const loadCss = href => new Promise((resolve, reject) => {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    link.onload = () => resolve(href);
    link.onerror = () => {
      link.remove();
      reject(new Error(`CSS_LOAD_FAILED:${href}`));
    };
    document.head.appendChild(link);
  });

  const fatal = error => {
    console.error("BiteBoss bootstrap:", error);
    const banner = document.getElementById("offlineBanner");
    if(banner){
      banner.textContent = "앱 구성 요소를 불러오지 못했습니다. 네트워크 연결 후 다시 실행해 주세요.";
      banner.classList.remove("hidden");
    }
  };

  (async () => {
    const deps = isNative ? {
      leafletCss:"./vendor/leaflet.css",
      supabase:"./vendor/supabase.js",
      scanner:"./vendor/html5-qrcode.min.js",
      qrcode:"./vendor/qrcode.min.js",
      leaflet:"./vendor/leaflet.js"
    } : {
      leafletCss:"https://unpkg.com/leaflet@1.9.4/dist/leaflet.css",
      supabase:"https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js",
      scanner:"https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js",
      qrcode:"https://cdn.jsdelivr.net/npm/qrcodejs@1.0.0/qrcode.min.js",
      leaflet:"https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
    };

    await loadCss(deps.leafletCss);

    await loadScript("./app-config.js?v=75.1");
    await loadScript(deps.supabase);
    await loadScript(deps.scanner);
    await loadScript(deps.qrcode);
    await loadScript(deps.leaflet);
    await loadScript("./supabase.js?v=75.1");
    await loadScript("./app.js?v=75.1");
  })().catch(fatal);
})();