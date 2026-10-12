import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const iosPath = resolve(root,"ios");

const run = (cmd,args) => {
  const r = spawnSync(cmd,args,{cwd:root,stdio:"inherit",shell:false});
  if(r.status !== 0) process.exit(r.status ?? 1);
};

if(!existsSync(iosPath)){
  run("npx",["cap","add","ios"]);
}

run("npx",["cap","sync","ios"]);
run("node",["scripts/patch-ios.mjs"]);

console.log("\\nBiteBoss iOS project is prepared. Next: npm run open:ios");
