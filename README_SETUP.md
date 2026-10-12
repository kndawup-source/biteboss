# BiteBoss 2.0 — 통합 Supabase 적용 순서

## 1. 통합 Supabase 설정

BiteBoss는 Dasaft 공용 Supabase 프로젝트(`imumpyumchvctrpmfngr`)를 사용합니다. `app-config.js`도 이 공용 프로젝트 URL/anon key 기준입니다.


1. Supabase Dashboard > Authentication > Providers/Settings에서 **Anonymous Sign-ins**를 활성화합니다.
2. SQL Editor에서 `biteboss_schema.sql` 전체를 실행합니다.
3. BiteBoss 운영자용 이메일 계정을 Supabase Auth에 생성합니다.
4. `biteboss_schema.sql` 마지막의 SUPER ADMIN bootstrap SQL에서 이메일만 실제 운영자 이메일로 바꿔 한 번 실행합니다.

BiteBoss 데이터는 모두 `biteboss_` prefix를 사용하며 다른 앱의 일반 `profiles`, `stores`, `checkins`, `app_config` 등을 사용하지 않습니다.

## 2. GitHub 파일 교체

기존 BiteBoss의 아래 파일을 새 파일로 교체합니다.

- `index.html`
- `app.js`
- `admin.html`
- `admin.js`
- `store-admin.html`
- `store-admin.js`
- `styles.css`
- `app-config.js`
- `supabase.js`
- `service-worker.js`
- `manifest.webmanifest`
- `capacitor.config.json`
- `package.json`

추가 파일:

- `biteboss_schema.sql`
- `privacy-policy.html`
- `support.html`

## 3. 최초 매장 등록

1. `/admin.html`에서 SUPER ADMIN 계정으로 로그인합니다.
2. 매장명과 정확한 위도/경도를 등록합니다.
3. 매장 생성과 동시에 서버에서 난수 QR token이 생성됩니다.
4. `/store-admin.html?store=<STORE_ID>`에서 QR을 확인할 수 있습니다.

점령은 매장 좌표가 없으면 허용되지 않습니다.

## 4. 매장주 권한

Store Admin의 직원 메뉴에서 이메일을 초대합니다.

- Owner: 매장 운영 + 직원 초대/삭제
- Manager: 매장 운영 + Staff 초대
- Staff: 데이터 열람 중심

사용자가 자기 브라우저에서 role 값을 만들어 권한을 얻는 방식은 사용하지 않습니다.

## 5. Boss 점령 규칙

모든 실제 점령은 `biteboss_claim_store()` RPC 하나를 통과합니다.

서버에서 검증하는 항목:

- QR token 활성 여부 / 만료 여부
- 매장 활성 상태
- 매장 직원의 자기 매장 점령 차단
- 운영자 계정 점령 차단
- GPS 위치 존재 여부
- GPS 정확도
- 매장과 현재 위치의 거리
- 현재 Boss 보호시간
- 동일 사용자의 재점령 쿨다운
- 일일 매장별 점령 제한
- 동시 점령 경쟁 시 단일 승자 보장

일반 사용자는 Supabase Anonymous Auth 사용자 ID를 실제 서버 ID로 사용하므로 가입하지 않아도 다른 사용자에게 Boss 상태가 동일하게 보입니다.

## 6. App Store / iOS

Capacitor iOS 프로젝트의 `Info.plist`에 최소 다음 권한 설명이 필요합니다.

- `NSLocationWhenInUseUsageDescription`
- `NSCameraUsageDescription`

예시 문구:

- Location: `BiteBoss uses your location to verify that you are at the restaurant when claiming the Boss.`
- Camera: `BiteBoss uses the camera to scan the restaurant's Boss QR code.`

`npx cap sync` 후 Xcode에서 실제 iPhone으로 위치와 QR 카메라를 반드시 테스트합니다.

## 7. 출시 전 필수 테스트

- 같은 QR을 서로 다른 두 기기에서 거의 동시에 스캔했을 때 한 명만 성공
- GPS 반경 밖에서 점령 차단
- 보호시간 중 다른 사용자의 점령 차단
- 보호시간 종료 후 다음 사용자 점령 성공
- 재점령 쿨다운 적용
- QR 재발급 후 기존 QR 즉시 실패
- 매장 직원의 자기 매장 점령 실패
- Owner/Manager/Staff 권한 차이
- Boss 전용 Offer가 현재 Boss에게만 노출
- 익명 사용자의 앱 재실행 후 동일 기록 유지

