import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createHash } from "node:crypto";

const root = resolve(import.meta.dirname, "..");
const native = process.argv.includes("--native");
const required = [
  "index.html", "app.js", "styles.css", "bootstrap.js", "app-config.js", "supabase.js",
  "privacy-policy.html", "support.html", "manifest.webmanifest", "service-worker.js",
  "www/index.html", "www/app.js", "www/styles.css", "www/bootstrap.js", "www/app-config.js",
  "www/supabase.js", "www/privacy-policy.html", "www/support.html", "www/manifest.webmanifest",
  "capacitor.config.json", "capacitor.config.ts", "vercel.json"
];
if(native) required.push(
  "www/vendor/supabase.js", "www/vendor/html5-qrcode.min.js", "www/vendor/qrcode.min.js",
  "www/vendor/leaflet.js", "www/vendor/leaflet.css"
);

let failed = false;
for(const rel of required){
  if(!existsSync(resolve(root,rel))){ console.error(`MISSING: ${rel}`); failed = true; }
}

const canonical = ["index.html","app.js","styles.css","bootstrap.js","app-config.js","supabase.js","service-worker.js","manifest.webmanifest","privacy-policy.html","support.html"];
const hash = p => createHash("sha256").update(readFileSync(p)).digest("hex");
for(const rel of canonical){
  const a=resolve(root,rel), b=resolve(root,"www",rel);
  if(existsSync(a)&&existsSync(b)&&hash(a)!==hash(b)){
    console.error(`DRIFT: ${rel} differs from www/${rel}. Run npm run sync:web.`); failed=true;
  }
}

const cfgJson = JSON.parse(readFileSync(resolve(root,"capacitor.config.json"),"utf8"));
if(cfgJson.appId !== "com.dasaft.biteboss" || cfgJson.webDir !== "www"){
  console.error("INVALID: Capacitor canonical appId/webDir mismatch."); failed=true;
}
const cfgTs = readFileSync(resolve(root,"capacitor.config.ts"),"utf8");
if(!cfgTs.includes("com.dasaft.biteboss") || !cfgTs.includes("webDir: 'www'")){
  console.error("INVALID: capacitor.config.ts disagrees with canonical config."); failed=true;
}

const appConfig = readFileSync(resolve(root,"app-config.js"),"utf8");
if(appConfig.includes("PASTE_")){ console.error("INVALID: placeholder key remains."); failed=true; }
if(/publicAppUrl:\s*""/.test(appConfig)) console.warn("WARNING: publicAppUrl is empty; external Crew invite deep-links remain disabled.");
if(/apiBaseUrl:\s*""/.test(appConfig)) console.warn("WARNING: apiBaseUrl is empty; packaged native auto-import is skipped.");

const index = readFileSync(resolve(root,"index.html"),"utf8");
if(!index.includes("./bootstrap.js")) { console.error("INVALID: bootstrap.js is not loaded."); failed=true; }
if(!index.includes('meta name="description"')) { console.error("INVALID: public description meta missing."); failed=true; }

const appJs = readFileSync(resolve(root,"app.js"),"utf8");
for(const requiredCall of ["biteboss_register_push_device_v627","biteboss_store_public_growth_v63","biteboss_nearby_stores_v631","biteboss_store_game_board_v631"]){
  if(!appJs.includes(requiredCall)){ console.error(`INVALID: required RPC wiring missing: ${requiredCall}`); failed=true; }
}

if(failed) process.exit(1);
console.log(`BiteBoss ${native ? "native " : ""}preflight passed.`);
