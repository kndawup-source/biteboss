# BiteBoss v62.7 Push Setup

앱과 Supabase 코드는 푸시 구조까지 준비되어 있습니다.

## Xcode에서 1개 추가
App Target → Signing & Capabilities → + Capability → Push Notifications

iOS capability는 Info.plist가 아니라 Signing & Capabilities에서 추가해야 합니다.

## Apple APNs Key
Apple Developer에서 APNs용 `.p8` Key를 만든 뒤 Supabase Edge Function Secrets:

```bash
supabase secrets set APNS_TEAM_ID=YOUR_TEAM_ID
supabase secrets set APNS_KEY_ID=YOUR_KEY_ID
supabase secrets set APNS_BUNDLE_ID=com.dasaft.biteboss
supabase secrets set APNS_PRIVATE_KEY="$(cat AuthKey_XXXXXXXXXX.p8)"
```

## Edge Function 배포
```bash
supabase functions deploy biteboss-push-dispatch
```

Supabase Scheduled Function/Cron에서 `biteboss-push-dispatch`를 1분마다 실행합니다.
호출 Authorization에는 service-role JWT를 사용합니다.

## 기본 알림
- Boss & Territory: ON
- Crew: ON
- Store offers: OFF
- System: ON
- 전체 Push: 사용자가 Me → 알림 → ENABLE 후 ON

앱 첫 실행에서 권한 팝업을 띄우지 않습니다.

## 이벤트
- Boss 뺏김
- Boss 획득
- 보호시간 종료 10분 전
- Crew ID 초대
- Crew 가입
- Founder에게 새 멤버 가입
- Founder에게 멤버 탈퇴

## APNs 환경
`www/app-config.js`

- Xcode Debug: `pushEnvironment: "sandbox"`
- TestFlight/App Store: `pushEnvironment: "production"`

TestFlight는 production입니다.
