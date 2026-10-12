import { existsSync, mkdirSync, copyFileSync, cpSync } from "node:fs";
import { dirname, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const vendor = resolve(root, "www/vendor");
mkdirSync(resolve(vendor, "images"), { recursive:true });

const files = [
  ["node_modules/@supabase/supabase-js/dist/umd/supabase.js", "www/vendor/supabase.js"],
  ["node_modules/html5-qrcode/html5-qrcode.min.js", "www/vendor/html5-qrcode.min.js"],
  ["node_modules/qrcodejs/qrcode.min.js", "www/vendor/qrcode.min.js"],
  ["node_modules/leaflet/dist/leaflet.js", "www/vendor/leaflet.js"],
  ["node_modules/leaflet/dist/leaflet.css", "www/vendor/leaflet.css"]
];

for(const [srcRel,dstRel] of files){
  const src = resolve(root, srcRel);
  const dst = resolve(root, dstRel);
  if(!existsSync(src)){
    throw new Error(`Missing dependency file: ${srcRel}. Run npm install first.`);
  }
  mkdirSync(dirname(dst), { recursive:true });
  copyFileSync(src,dst);
}

const leafletImages = resolve(root, "node_modules/leaflet/dist/images");
if(existsSync(leafletImages)){
  cpSync(leafletImages, resolve(vendor,"images"), { recursive:true });
}

console.log("BiteBoss vendor files prepared.");
