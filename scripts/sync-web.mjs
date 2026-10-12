import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const canonical = [
  "index.html", "app.js", "styles.css", "bootstrap.js", "app-config.js",
  "supabase.js", "service-worker.js", "manifest.webmanifest",
  "privacy-policy.html", "support.html"
];

for (const rel of canonical) {
  const src = resolve(root, rel);
  const dst = resolve(root, "www", rel);
  if (!existsSync(src)) throw new Error(`Missing canonical web asset: ${rel}`);
  mkdirSync(dirname(dst), { recursive: true });
  copyFileSync(src, dst);
}
console.log(`Synced ${canonical.length} canonical web assets to www/.`);
