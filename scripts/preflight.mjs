import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const required = [
  "index.html", "app.js", "styles.css", "bootstrap.js", "app-config.js", "supabase.js",
  "privacy-policy.html", "support.html", "manifest.webmanifest", "service-worker.js",
  "admin.html", "admin.js", "store-admin.html", "store-admin.js", "api/nearby-stores.js", "vercel.json"
];

let failed = false;
for (const rel of required) {
  if (!existsSync(resolve(root, rel))) { console.error(`MISSING: ${rel}`); failed = true; }
}

const appConfig = readFileSync(resolve(root, "app-config.js"), "utf8");
if (appConfig.includes("PASTE_")) { console.error("INVALID: placeholder key remains."); failed = true; }

const index = readFileSync(resolve(root, "index.html"), "utf8");
if (!/(?:src=["\'](?:\.\/|\/)bootstrap\.js(?:\?[^"\']*)?["\'])/.test(index)) { console.error("INVALID: bootstrap.js is not loaded."); failed = true; }
if (!index.includes('meta name="description"')) { console.error("INVALID: public description meta missing."); failed = true; }

const appJs = readFileSync(resolve(root, "app.js"), "utf8");
for (const requiredCall of ["biteboss_register_push_device_v627","biteboss_store_public_growth_v63","biteboss_nearby_stores_v631","biteboss_store_game_board_v631"]) {
  if (!appJs.includes(requiredCall)) { console.error(`INVALID: required RPC wiring missing: ${requiredCall}`); failed = true; }
}

if (failed) process.exit(1);
console.log("BiteBoss web preflight passed.");
