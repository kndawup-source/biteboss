# BiteBoss v63.2 · Pre-Xcode Release Package

Xcode를 열기 직전 단계까지 정리한 BiteBoss iOS 준비본입니다.

## 추가 개선
- v62.5의 script 실행순서 충돌 제거.
- `bootstrap.js`에서 라이브러리를 순차 로드.
- 로컬 `vendor/` 우선, 웹에서만 CDN fallback.
- native `capacitor://.../api` 호출 문제 제거.
- `apiBaseUrl` 미설정 시 native 자동매장 가져오기만 안전하게 skip.
- Capacitor App URL listener 추가.
- Capacitor Geolocation 플러그인 준비.
- iOS Info.plist 권한문구 자동 패치.
- `ITSAppUsesNonExemptEncryption=false` 자동 적용.
- Privacy/Support 문서 최신화.
- 앱 내 계정삭제 유지.

## Xcode 직전 실행
Mac에서 이 폴더로 이동:

```bash
npm install
npm run prepare:ios
```

이 명령이:
1. third-party 라이브러리를 `www/vendor/`에 복사
2. preflight 검사
3. `ios/` 프로젝트 생성
4. Capacitor sync
5. Info.plist 권한 문구 적용
까지 처리합니다.

그 다음부터 Xcode:

```bash
npm run open:ios
```

## 아직 값이 필요한 항목
`www/app-config.js`

- `publicAppUrl`: Crew 외부 공유 링크용 공개 HTTPS URL
- `apiBaseUrl`: `/api/nearby-stores` 서버 HTTPS origin

둘 다 비워도 핵심 Supabase/인앱 QR/점령/Crew 기능은 동작하도록 구성했습니다.
다만 `publicAppUrl`이 비면 외부 Crew 링크 공유는 안내 후 중단됩니다.

## Xcode 마지막 확인
- Bundle Identifier: 기본 `com.dasaft.biteboss`
- Signing Team
- Deployment Target
- App Icon / Launch asset
- Camera / Location / Photo permission 실기기 테스트
- 계정삭제 테스트
- Crew QR 가입 테스트
- Archive / TestFlight

## Universal Links
공개 도메인이 확정되면:
- Associated Domains capability
- `applinks:도메인`
- 서버 `apple-app-site-association`
이 필요합니다.

도메인이 아직 정해지지 않아 자동 추가하지 않았습니다.


## Push Notifications
v62.7부터 네이티브 iOS Push, 알림 설정/Inbox, Boss/Crew 서버 이벤트가 포함됩니다. 실제 APNs Key와 Xcode Push Notifications capability 설정은 `PUSH_SETUP.md`를 확인하세요.


## v63 Growth Loop

이번 버전은 기능 확장이 아니라 성장 루프를 한 줄로 연결합니다.

`점령 → 공유 → 친구 유입 → 매장 활동 증가 → 매장 Claim → Partner`

추가:
- Boss 승리 직후 공유 CTA
- 1080×1350 `TAKE IT FROM ME` 공유 카드
- Store Arena: Current Boss / Longest Boss / Today Challengers / 30D Visits
- 비Partner 매장에도 30일 Business Impact 공개
- `CLAIM THIS STORE`
- 승인된 신규 Partner 30일 무료 Trial 추적
- Local Crew 5km 랭킹
- Super Admin용 growth lead RPC

Supabase는 `BITEBOSS_V63_2_RELEASE.sql` 하나만 실행합니다.


## v63.1 — 보스 표시 / 한글 상태어

사용자 화면의 주요 게임 상태를 한글로 통일했습니다.

- 현재 보스
- 보호 중
- 도전 가능
- 미점령
- 내 점령지
- 재도전 대기
- 제휴 / 혜택

매장 목록부터 현재 보스의 프로필 이미지와 닉네임을 바로 표시합니다.
보호시간이 끝나도 보스 자체는 사라지지 않고, 실제로 다른 사용자가 점령할 때까지 유지됩니다.



# v63.1 최종 적용 순서

아직 v63/v63.1을 적용하지 않았다면 이전 SQL은 전부 건너뜁니다.

1. Supabase SQL Editor에서 `BITEBOSS_V63_2_RELEASE.sql` 한 번 실행
2. 기존 웹 파일을 `www/` 기준으로 교체
3. `npm install`
4. `npm run prepare:ios`
5. Xcode에서 Push Notifications capability 및 Signing 설정
6. APNs 연결 후 TestFlight 실기기 검수

이 폴더가 v63.1의 단일 기준본입니다.
`INCREMENTAL`, `PATCH`, 이전 v63 SQL을 함께 적용하지 않습니다.


## v63.2 화면 확인 기준

매장 상세에서 아래처럼 보여야 정상입니다.

현재 보스
[원형 프로필 이미지] 닉네임
크루명 · 방어력 N

영어 `CURRENT BOSS`, `CHALLENGEABLE`, `Defense State`, `STORE GROWTH`,
`valid visits`, `Info`, `Hours`, `Phone`, `Notice`가 보이면 구버전 캐시입니다.

v63.2는 Service Worker cache 이름도 `biteboss-v63.2`로 올렸습니다.
