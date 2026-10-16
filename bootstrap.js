(() => {
  "use strict";

  const ASSET_VERSION = document.querySelector('meta[name="biteboss-build"]')?.content || "81.69";
  const localAsset = path => `${path}?v=${encodeURIComponent(ASSET_VERSION)}`;

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

  const dependencyPromises = new Map();
  const ensure = name => {
    if(dependencyPromises.has(name)) return dependencyPromises.get(name);
    let request;
    if(name === "leaflet"){
      request = Promise.all([loadCss(deps.leafletCss), loadScript(deps.leaflet)]).then(() => true);
    }else if(name === "scanner"){
      request = loadScript(deps.scanner).then(() => true);
    }else if(name === "qrcode"){
      request = loadScript(deps.qrcode).then(() => true);
    }else{
      request = Promise.reject(new Error(`UNKNOWN_DEPENDENCY:${name}`));
    }
    dependencyPromises.set(name, request);
    request.catch(() => dependencyPromises.delete(name));
    return request;
  };
  window.BiteBossDeps = Object.freeze({ ensure });

  const fatal = error => {
    console.error("BiteBoss bootstrap:", error);
    const banner = document.getElementById("offlineBanner");
    if(banner){
      banner.textContent = "앱 구성 요소를 불러오지 못했습니다. 네트워크 연결 후 다시 실행해 주세요.";
      banner.classList.remove("hidden");
    }
  };

  (async () => {
    // Initial boot only loads dependencies required by every screen.
    // QR and map libraries are loaded on first use through BiteBossDeps.ensure().
    await loadScript(localAsset("./app-config.js"));
    await loadScript(deps.supabase);
    await loadScript(localAsset("./supabase.js"));
    await loadScript(localAsset("./app.js"));
  })().catch(fatal);
})();
