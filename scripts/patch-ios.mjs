import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const plistPath = resolve(root,"ios/App/App/Info.plist");

if(!existsSync(plistPath)){
  console.error("Info.plist not found. Run npm run prepare:ios after npm install.");
  process.exit(1);
}

let xml = readFileSync(plistPath,"utf8");
const entries = [
  ["NSCameraUsageDescription","string","매장 및 Crew QR 코드를 스캔하기 위해 카메라를 사용합니다."],
  ["NSLocationWhenInUseUsageDescription","string","주변 매장을 찾고 현장 점령을 확인하기 위해 위치를 사용합니다."],
  ["NSPhotoLibraryUsageDescription","string","프로필 사진을 선택하기 위해 사진 보관함을 사용합니다."],
  ["ITSAppUsesNonExemptEncryption","false",""]
];

for(const [key,type,value] of entries){
  if(xml.includes(`<key>${key}</key>`)) continue;
  const node = type === "false"
    ? `\\n\\t<key>${key}</key>\\n\\t<false/>`
    : `\\n\\t<key>${key}</key>\\n\\t<string>${value}</string>`;
  xml = xml.replace("\\n</dict>\\n</plist>", `${node}\\n</dict>\\n</plist>`);
}

writeFileSync(plistPath,xml,"utf8");
console.log("iOS Info.plist release keys patched.");


const appDelegatePath = resolve(root,"ios/App/App/AppDelegate.swift");
if(existsSync(appDelegatePath)){
  let swift = readFileSync(appDelegatePath,"utf8");
  if(!swift.includes("capacitorDidRegisterForRemoteNotifications")){
    const pushMethods = `
    func application(_ application: UIApplication, didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications, object: deviceToken)
    }

    func application(_ application: UIApplication, didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications, object: error)
    }
`;
    const lastBrace = swift.lastIndexOf("}");
    if(lastBrace > 0){
      swift = swift.slice(0,lastBrace) + pushMethods + swift.slice(lastBrace);
      writeFileSync(appDelegatePath,swift,"utf8");
      console.log("iOS AppDelegate push registration bridge patched.");
    }
  }
}
